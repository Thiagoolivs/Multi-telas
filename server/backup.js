/*
 * server/backup.js — as partes do backup diário que não dependem do banco
 * nem da rede (PLANO §10, Fase 0). Quem roda o backup é tools/backup.mjs.
 *
 * O arquivo guardado no bucket é o pg_dump CIFRADO:
 *
 *   MTBK1 (5 bytes) · IV (12) · dump cifrado em AES-256-GCM · tag (16)
 *
 * O cabeçalho entra como dado autenticado: trocar um byte em qualquer parte
 * faz a decifragem recusar o arquivo inteiro, em vez de devolver um dump
 * corrompido que só falharia no meio da restauração.
 *
 * Por que cifrar se o bucket já é privado: o dump tem e-mail, telefone e
 * aniversário de clientes e o hash das senhas. Bucket privado é uma camada,
 * e configuração de bucket muda sem ninguém olhar esta linha.
 */
const fs = require('fs');
const crypto = require('crypto');
const { once } = require('events');

const MAGICO = Buffer.from('MTBK1');
const CAB = MAGICO.length + 12;
const TAG = 16;
const PREFIXO = 'postgres/';

function lerChave(txt) {
  const b = Buffer.from(String(txt || '').trim(), 'base64');
  if (b.length !== 32) throw new Error('BACKUP_CHAVE precisa ser 32 bytes em base64 (gere com: node tools/backup.mjs chave)');
  return b;
}

async function escritor(caminho) {
  const out = fs.createWriteStream(caminho);
  let erro = null;
  out.on('error', (e) => { erro = e; });
  const hash = crypto.createHash('sha256');
  let bytes = 0;
  return {
    async escrever(buf) {
      if (erro) throw erro;
      if (!buf || !buf.length) return;
      hash.update(buf); bytes += buf.length;
      if (!out.write(buf)) await once(out, 'drain');
    },
    async fechar() {
      out.end();
      if (!out.writableFinished) await once(out, 'finish');
      if (erro) throw erro;
      return { bytes, sha256: hash.digest('hex') };
    },
    abortar() { out.destroy(); },
  };
}

// Cifra `entrada` em `saida`. Devolve tamanho e sha256 do arquivo cifrado.
async function cifrar(entrada, saida, chave) {
  const iv = crypto.randomBytes(12);
  const cab = Buffer.concat([MAGICO, iv]);
  const c = crypto.createCipheriv('aes-256-gcm', chave, iv);
  c.setAAD(cab);
  const w = await escritor(saida);
  try {
    await w.escrever(cab);
    for await (const pedaco of fs.createReadStream(entrada)) await w.escrever(c.update(pedaco));
    await w.escrever(c.final());
    await w.escrever(c.getAuthTag());
    return await w.fechar();
  } catch (e) {
    w.abortar(); fs.rmSync(saida, { force: true });
    throw e;
  }
}

/*
 * Decifra `entrada` em `saida`. Se a chave estiver errada ou o arquivo tiver
 * sido mexido, apaga a saída parcial e recusa — nada de meio dump no disco.
 */
async function decifrar(entrada, saida, chave) {
  const tamanho = (await fs.promises.stat(entrada)).size;
  if (tamanho < CAB + TAG) throw new Error('arquivo curto demais para ser um backup');
  const fd = await fs.promises.open(entrada, 'r');
  const cab = Buffer.alloc(CAB), tag = Buffer.alloc(TAG);
  try {
    await fd.read(cab, 0, CAB, 0);
    await fd.read(tag, 0, TAG, tamanho - TAG);
  } finally { await fd.close(); }
  if (!cab.subarray(0, MAGICO.length).equals(MAGICO)) throw new Error('não é um backup do MultiTelas (falta o cabeçalho MTBK1)');
  const d = crypto.createDecipheriv('aes-256-gcm', chave, cab.subarray(MAGICO.length));
  d.setAAD(cab);
  d.setAuthTag(tag);
  const w = await escritor(saida);
  try {
    // Dump vazio: só cabeçalho e tag. O createReadStream recusa start > end.
    if (tamanho > CAB + TAG) {
      for await (const pedaco of fs.createReadStream(entrada, { start: CAB, end: tamanho - TAG - 1 })) await w.escrever(d.update(pedaco));
    }
    await w.escrever(d.final());
    return await w.fechar();
  } catch (e) {
    w.abortar(); fs.rmSync(saida, { force: true });
    if (/auth|unable to authenticate/i.test(e.message)) throw new Error('o backup não confere: chave errada ou arquivo alterado');
    throw e;
  }
}

async function sha256DoArquivo(caminho) {
  const h = crypto.createHash('sha256');
  for await (const pedaco of fs.createReadStream(caminho)) h.update(pedaco);
  return h.digest('hex');
}

// O dia do backup no fuso da operação: o de 03h de 21/10 é "2026-10-21".
function diaDe(data) {
  return new Date(data).toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });
}
const chaveDump = (dia) => PREFIXO + dia + '.dump.enc';
const chaveManifesto = (dia) => PREFIXO + dia + '.json';
const diaDaChave = (chave) => (String(chave).match(/^postgres\/(\d{4}-\d{2}-\d{2})\.(dump\.enc|json)$/) || [])[1] || null;

/*
 * O que apagar: os dias mais velhos que `dias`, mas NUNCA os `manter` mais
 * recentes. Se o cron parar por 40 dias, a limpeza não pode levar junto o
 * último backup bom que sobrou.
 */
function quaisApagar(chaves, hoje, { dias = 30, manter = 7 } = {}) {
  const porDia = new Map();
  for (const k of chaves) {
    const d = diaDaChave(k);
    if (d) { if (!porDia.has(d)) porDia.set(d, []); porDia.get(d).push(k); }
  }
  const limite = diaDe(new Date(new Date(hoje).getTime() - dias * 86400000));
  const ordem = [...porDia.keys()].sort().reverse();
  return ordem.slice(manter).filter((d) => d < limite).flatMap((d) => porDia.get(d));
}

// Diferenças entre as contagens da origem e da restauração. Vazio = confere.
function compararContagens(origem, restaurado) {
  const dif = [];
  for (const t of Object.keys(origem).sort()) {
    if (!(t in restaurado)) dif.push(t + ': falta na restauração');
    else if (Number(restaurado[t]) !== Number(origem[t])) dif.push(t + ': ' + origem[t] + ' na origem, ' + restaurado[t] + ' restauradas');
  }
  for (const t of Object.keys(restaurado)) if (!(t in origem)) dif.push(t + ': só existe na restauração');
  return dif;
}

// "pg_dump (PostgreSQL) 18.0" → 18; server_version_num 180001 → 18.
function versaoMaior(x) {
  const s = String(x || '');
  if (/^\d{5,6}$/.test(s.trim())) return Math.floor(Number(s) / 10000);
  const m = s.match(/(\d+)(?:\.\d+)?/);
  return m ? Number(m[1]) : null;
}

const ident = (s) => '"' + String(s).replace(/"/g, '""') + '"';

module.exports = {
  MAGICO, PREFIXO, lerChave, cifrar, decifrar, sha256DoArquivo,
  diaDe, chaveDump, chaveManifesto, diaDaChave, quaisApagar, compararContagens, versaoMaior, ident,
};
