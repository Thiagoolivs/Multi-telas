/*
 * tools/backup.mjs — backup diário do Postgres num bucket privado (PLANO §10).
 *
 *   node tools/backup.mjs                 faz o backup de hoje (é o que o cron roda)
 *   node tools/backup.mjs listar          lista os backups guardados
 *   node tools/backup.mjs baixar [AAAA-MM-DD] [--saida=arquivo.dump]
 *                                         baixa e decifra (sem data: o mais recente)
 *   node tools/backup.mjs chave           gera uma BACKUP_CHAVE nova
 *
 * O backup de hoje:
 *  1. abre uma transação, exporta o snapshot e conta as linhas de cada tabela
 *     DENTRO dele. O pg_dump usa o mesmo snapshot: as contagens são as do
 *     arquivo, exatas, mesmo com a TV gravando no banco durante o dump;
 *  2. pg_dump em formato custom (já comprimido);
 *  3. cifra (server/backup.js) e envia ao bucket de backup;
 *  4. BAIXA de volta, confere o sha256, decifra e restaura num Postgres
 *     descartável dentro do próprio contêiner, e compara as contagens.
 *     Backup que nunca foi restaurado é esperança, não backup;
 *  5. grava o manifesto (contagens, tamanho, resultado da restauração);
 *  6. apaga os de mais de BACKUP_DIAS (30) dias, nunca os 7 mais recentes;
 *  7. falhou qualquer passo: e-mail para BACKUP_AVISO (ou ADMIN_EMAILS) e
 *     saída 1, que o Railway mostra como execução com falha.
 *
 * Roda no serviço "backup" do Railway (backup/Dockerfile: a imagem do
 * Postgres com node), por cron. Variáveis e restauração: docs/BACKUP.md.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const RAIZ = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const B = require(path.join(RAIZ, 'server', 'backup.js'));
const S3 = require(path.join(RAIZ, 'server', 's3.js'));

const env = process.env;
const args = process.argv.slice(2);
const opcao = (nome) => (args.find((a) => a.startsWith('--' + nome + '=')) || '').split('=').slice(1).join('=') || null;
const log = (...x) => console.log('[backup]', ...x);

function bucket() {
  return S3.criar({
    endpoint: env.BACKUP_S3_ENDPOINT, bucket: env.BACKUP_S3_BUCKET, region: env.BACKUP_S3_REGION || 'auto',
    key: env.BACKUP_S3_ACCESS_KEY_ID, secret: env.BACKUP_S3_SECRET_ACCESS_KEY,
  });
}

// Mesma regra do server/db-postgres.js: rede interna do Railway não usa SSL.
function ssl(url) {
  if (env.PGSSL === 'disable') return false;
  if (env.PGSSL === 'require') return { rejectUnauthorized: false };
  try {
    const h = new URL(url).hostname;
    return (h === 'localhost' || h === '127.0.0.1' || /\.internal$/.test(h)) ? false : { rejectUnauthorized: false };
  } catch (e) { return false; }
}

function rodar(cmd, argv, { saida } = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, argv, { stdio: ['ignore', saida ? 'pipe' : 'ignore', 'pipe'] });
    let out = '', err = '';
    if (saida) p.stdout.on('data', (d) => { out += d; });
    p.stderr.on('data', (d) => { err += d; });
    p.on('error', (e) => reject(new Error(cmd + ': ' + e.message)));
    p.on('close', (code) => (code === 0 ? resolve(out) : reject(new Error(cmd + ' saiu com ' + code + ': ' + err.trim().slice(-600)))));
  });
}

async function contar(cliente) {
  const { rows } = await cliente.query(`SELECT table_schema AS s, table_name AS t FROM information_schema.tables
    WHERE table_type = 'BASE TABLE' AND table_schema NOT IN ('pg_catalog', 'information_schema') ORDER BY 1, 2`);
  const contagens = {};
  for (const { s, t } of rows) {
    const r = await cliente.query(`SELECT count(*)::bigint AS n FROM ${B.ident(s)}.${B.ident(t)}`);
    contagens[s === 'public' ? t : s + '.' + t] = Number(r.rows[0].n);
  }
  return contagens;
}

/* ---------------- 1 e 2: o dump, num snapshot só ---------------- */

async function despejar(arquivo) {
  const { Client } = require('pg');
  const c = new Client({ connectionString: env.DATABASE_URL, ssl: ssl(env.DATABASE_URL) });
  await c.connect();
  try {
    const servidor = B.versaoMaior((await c.query('SHOW server_version_num')).rows[0].server_version_num);
    const ferramenta = B.versaoMaior(await rodar('pg_dump', ['--version'], { saida: true }));
    if (ferramenta < servidor) throw new Error(`pg_dump ${ferramenta} é mais velho que o Postgres ${servidor}: troque a imagem em backup/Dockerfile para postgres:${servidor}`);
    await c.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const snapshot = (await c.query('SELECT pg_export_snapshot() AS s')).rows[0].s;
    const contagens = await contar(c);
    await rodar('pg_dump', ['--format=custom', '--no-owner', '--no-acl', '--snapshot=' + snapshot, '--file=' + arquivo, '--dbname=' + env.DATABASE_URL]);
    await c.query('COMMIT');
    return { contagens, postgres: servidor };
  } finally {
    await c.end().catch(() => {});
  }
}

/* ---------------- 4: restaurar num Postgres descartável ---------------- */

async function restaurarParaTestar(dump) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mt-restauro-'));
  const dados = path.join(dir, 'dados');
  const porta = String(54329);
  await rodar('initdb', ['-D', dados, '-U', 'postgres', '--auth=trust', '-E', 'UTF8', '--no-sync', '--no-instructions']);
  await rodar('pg_ctl', ['-D', dados, '-l', path.join(dir, 'log'), '-w', '-o', `-p ${porta} -k ${dir} -c listen_addresses=''`, 'start']);
  try {
    await rodar('pg_restore', ['--no-owner', '--no-acl', '--exit-on-error', '-h', dir, '-p', porta, '-U', 'postgres', '-d', 'postgres', dump]);
    const { Client } = require('pg');
    const c = new Client({ host: dir, port: Number(porta), user: 'postgres', database: 'postgres' });
    await c.connect();
    try { return await contar(c); } finally { await c.end().catch(() => {}); }
  } finally {
    await rodar('pg_ctl', ['-D', dados, '-m', 'fast', '-w', 'stop']).catch(() => {});
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

async function baixarPara(s3, chave, destino) {
  const res = await s3.baixar(chave);
  if (!res) throw new Error('não está no bucket: ' + chave);
  await pipeline(Readable.fromWeb(res.body), fs.createWriteStream(destino));
}

/* ---------------- O backup de hoje ---------------- */

async function avisar(assunto, texto) {
  const para = String(env.BACKUP_AVISO || env.ADMIN_EMAILS || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (!para.length) return log('sem destinatário para o aviso (BACKUP_AVISO ou ADMIN_EMAILS)');
  const mail = require(path.join(RAIZ, 'server', 'mail.js'));
  for (const to of para) {
    await mail.send({ to, subject: assunto, text: texto, html: '<pre style="font:14px/1.5 monospace">' + texto.replace(/[<&]/g, (c) => (c === '<' ? '&lt;' : '&amp;')) + '</pre>' })
      .catch((e) => log('aviso para', to, 'falhou:', e.message));
  }
}

async function fazer() {
  const inicio = Date.now();
  const dia = B.diaDe(inicio);
  const chave = B.lerChave(env.BACKUP_CHAVE);
  if (!env.DATABASE_URL) throw new Error('falta DATABASE_URL');
  const s3 = bucket();
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mt-backup-'));
  const manifesto = { dia, inicio: new Date(inicio).toISOString(), arquivo: B.chaveDump(dia), bucket: s3.config.bucket };
  try {
    const dump = path.join(tmp, 'banco.dump');
    const { contagens, postgres } = await despejar(dump);
    Object.assign(manifesto, { postgres, tabelas: Object.keys(contagens).length, linhas: contagens, dumpBytes: fs.statSync(dump).size });
    log('dump:', manifesto.dumpBytes, 'bytes,', manifesto.tabelas, 'tabelas');

    const cifrado = path.join(tmp, 'banco.dump.enc');
    const { bytes, sha256 } = await B.cifrar(dump, cifrado, chave);
    fs.rmSync(dump);
    await s3.enviar(manifesto.arquivo, Readable.toWeb(fs.createReadStream(cifrado)), { sha256, tamanho: bytes });
    Object.assign(manifesto, { bytes, sha256 });
    fs.rmSync(cifrado);
    log('enviado:', manifesto.arquivo);

    // A volta: o que está NO BUCKET é o que precisa restaurar.
    const t0 = Date.now();
    const devolta = path.join(tmp, 'devolta.enc');
    await baixarPara(s3, manifesto.arquivo, devolta);
    if (await B.sha256DoArquivo(devolta) !== sha256) throw new Error('o arquivo no bucket não é o que foi enviado (sha256)');
    const claro = path.join(tmp, 'devolta.dump');
    await B.decifrar(devolta, claro, chave);
    fs.rmSync(devolta);
    const restaurado = await restaurarParaTestar(claro);
    const diferencas = B.compararContagens(contagens, restaurado);
    manifesto.restauracao = { ok: !diferencas.length, ms: Date.now() - t0, diferencas };
    if (diferencas.length) throw new Error('a restauração não confere: ' + diferencas.slice(0, 5).join('; '));
    log('restaurado e conferido em', manifesto.restauracao.ms, 'ms');

    manifesto.fim = new Date().toISOString();
    manifesto.ok = true;
    await s3.enviar(B.chaveManifesto(dia), Buffer.from(JSON.stringify(manifesto, null, 1)), { tipo: 'application/json' });

    const apagar = B.quaisApagar((await s3.listar(B.PREFIXO)).map((x) => x.chave), inicio, {
      dias: Number(env.BACKUP_DIAS || 30), manter: Number(env.BACKUP_MANTER || 7),
    });
    for (const k of apagar) await s3.apagar(k);
    if (apagar.length) log('apagados:', apagar.join(', '));
    log('ok em', ((Date.now() - inicio) / 1000).toFixed(1), 's');
    return manifesto;
  } catch (e) {
    manifesto.ok = false;
    manifesto.erro = e.message;
    // O manifesto da falha também vai para o bucket, se ele estiver de pé.
    await s3.enviar(B.chaveManifesto(dia), Buffer.from(JSON.stringify(manifesto, null, 1)), { tipo: 'application/json' }).catch(() => {});
    throw e;
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

/* ---------------- Para a gente: listar, baixar, gerar chave ---------------- */

async function listar() {
  const itens = (await bucket().listar(B.PREFIXO)).filter((x) => x.chave.endsWith('.dump.enc'));
  if (!itens.length) return console.log('Nenhum backup no bucket.');
  for (const x of itens.sort((a, b) => a.chave.localeCompare(b.chave))) {
    console.log(B.diaDaChave(x.chave), (x.tamanho / 1048576).toFixed(2).padStart(9), 'MB');
  }
}

async function baixar() {
  const s3 = bucket();
  const chave = B.lerChave(env.BACKUP_CHAVE);
  let dia = args.find((a) => /^\d{4}-\d{2}-\d{2}$/.test(a));
  if (!dia) {
    const dias = (await s3.listar(B.PREFIXO)).map((x) => x.chave).filter((k) => k.endsWith('.dump.enc')).map(B.diaDaChave).sort();
    dia = dias.pop();
    if (!dia) throw new Error('nenhum backup no bucket');
  }
  const saida = path.resolve(opcao('saida') || 'backup-' + dia + '.dump');
  const tmp = saida + '.enc';
  try {
    await baixarPara(s3, B.chaveDump(dia), tmp);
    const m = await s3.baixar(B.chaveManifesto(dia));
    const manifesto = m ? await m.json() : null;
    if (manifesto && manifesto.sha256 && manifesto.sha256 !== await B.sha256DoArquivo(tmp)) throw new Error('o arquivo baixado não confere com o manifesto (sha256)');
    await B.decifrar(tmp, saida, chave);
  } finally { fs.rmSync(tmp, { force: true }); }
  console.log('Backup de', dia, 'decifrado em', saida);
  console.log('Restaure num banco VAZIO (nunca direto por cima da produção):');
  console.log('  pg_restore --no-owner --no-acl --exit-on-error -d "postgresql://…/banco_novo" "' + saida + '"');
}

const comandos = {
  fazer, listar, baixar,
  chave: async () => console.log(crypto.randomBytes(32).toString('base64')),
};

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const nome = args.find((a) => !a.startsWith('--') && !/^\d{4}-/.test(a)) || 'fazer';
  if (!comandos[nome]) { console.error('Comando desconhecido:', nome); process.exit(2); }
  comandos[nome]().catch(async (e) => {
    console.error('[backup] FALHOU:', e.message);
    if (nome === 'fazer') await avisar('MultiTelas: o backup do banco FALHOU', 'O backup de ' + B.diaDe(Date.now()) + ' falhou:\n\n' + e.message + '\n\nVer docs/BACKUP.md.');
    process.exit(1);
  });
}
