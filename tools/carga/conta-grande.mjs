/*
 * tools/carga/conta-grande.mjs — a página Telas e o aviso rápido numa conta
 * de RH com ~300 TVs (docs/CAPACIDADE-E-TVBOX.md, §3.5 e §4), medidos no
 * servidor local.
 *
 *   tools/carga/subir-servidor.sh 6120 /tmp/cg           # SQLite em /tmp/cg
 *   CG_BASE=http://127.0.0.1:6120 CG_DADOS=/tmp/cg node tools/carga/conta-grande.mjs
 *   (Postgres: CG_PG=postgres://... no lugar de CG_DADOS)
 *
 *   CG_TVS   quantas TVs na conta grande (padrão 323, a conta do teste de carga)
 *   CG_SONDA o sonda.jsonl do servidor (SONDA_MS=1000 ao subir): a travada do event loop, de dentro
 *   CG_LOTE  quantas TVs em cada envio do aviso-lote (padrão 15,20,300); CG_AVISO, do aviso (20,300)
 *   CG_SO    o que medir, separado por vírgula (padrão: tudo):
 *            telas      GET /api/devices?agora=1, na conta grande e numa de 5 TVs,
 *                       e a programação das miniaturas que aparecem (GET /api/devices/configs?ids=)
 *            aviso-lote o aviso rápido como o painel fazia: lê a programação de
 *                       cada TV (1 pedido por TV) e manda todas de volta (POST /api/lote)
 *            aviso      o aviso como operação do servidor (POST /api/lote/aviso) e o Desfazer
 *
 * A conta é montada direto no banco (a TV nasce pelo POST /api/devices, de
 * IPs diferentes; o vínculo e a programação de RH, ~96 KB, vão por SQL): a
 * montagem não gasta o freio do painel, e cada medida começa com o balde
 * da conta vazio (uma conta nova por medida).
 *
 * Além do tempo e do tamanho, mede a MAIOR ESPERA de um pedido leve
 * (/healthz, em laço) enquanto a operação roda: é o que a TV de qualquer
 * conta sente quando o event loop trava.
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const req = createRequire(import.meta.url);
const { montarProgramaRh } = req('./programa-rh.cjs');
const RAIZ = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const BASE = new URL(process.env.CG_BASE || 'http://127.0.0.1:6120');
const N = Number(process.env.CG_TVS) || 323;
const so = (process.env.CG_SO || 'telas,aviso-lote,aviso').split(',');
const agente = new http.Agent({ keepAlive: true, maxSockets: 8 });

/* ---------------- O banco (só para montar a conta) ---------------- */
let sql;
if (process.env.CG_PG) {
  const pg = req('pg');
  const pool = new pg.Pool({ connectionString: process.env.CG_PG });
  sql = async (q, p) => (await pool.query(q.replace(/\?/g, (() => { let i = 0; return () => '$' + (++i); })()), p)).rows;
  sql.fim = () => pool.end();
} else {
  const { DatabaseSync } = req('node:sqlite');
  const pasta = process.env.CG_DADOS;
  if (!pasta) { console.error('CG_DADOS (a pasta do SQLite do servidor) ou CG_PG'); process.exit(2); }
  const arq = fs.existsSync(path.join(pasta, 'vistra.db')) ? path.join(pasta, 'vistra.db') : path.join(pasta, 'multitelas.db');
  const db = new DatabaseSync(arq);
  db.exec('PRAGMA busy_timeout = 10000');
  sql = async (q, p) => (/^\s*select/i.test(q) ? db.prepare(q).all(...(p || [])) : (db.prepare(q).run(...(p || [])), []));
  sql.fim = () => db.close();
}

function pedir(metodo, caminho, o) {
  const op = o || {};
  const corpo = op.corpo !== undefined ? Buffer.from(JSON.stringify(op.corpo)) : null;
  const headers = Object.assign({}, op.headers || {});
  if (corpo) { headers['Content-Type'] = 'application/json'; headers['Content-Length'] = corpo.length; }
  if (op.ip) headers['X-Forwarded-For'] = op.ip;
  if (op.cookie) { headers.Cookie = op.cookie; headers.Origin = BASE.origin; }
  const t0 = performance.now();
  return new Promise((resolve) => {
    const r = http.request({ host: BASE.hostname, port: BASE.port, path: caminho, method: metodo, headers, agent: agente }, (res) => {
      const partes = [];
      res.on('data', (c) => partes.push(c));
      res.on('end', () => {
        const buf = Buffer.concat(partes);
        let json = null; try { json = JSON.parse(buf.toString('utf8')); } catch (e) { /* não é JSON */ }
        resolve({ status: res.statusCode, json, headers: res.headers, ms: performance.now() - t0, bytes: buf.length, enviados: corpo ? corpo.length : 0 });
      });
    });
    r.on('error', (e) => resolve({ status: 0, erro: e.code || e.message, ms: performance.now() - t0, bytes: 0, enviados: corpo ? corpo.length : 0 }));
    if (corpo) r.write(corpo);
    r.end();
  });
}

/*
 * A sonda de fora: /healthz em laço, um de cada vez, numa conexão própria.
 * Devolve a maior espera (ms) enquanto `fn` roda — a travada que todas as
 * TVs sentem. Com CG_SONDA (o sonda.jsonl do servidor, gravado com
 * SONDA_MS=1000), também a maior travada do event loop medida de dentro
 * (`elMaxMs`), com um segundo parado antes e depois para a janela ser só dela.
 */
const SONDA = process.env.CG_SONDA || '';
const dormir = (t) => new Promise((ok) => setTimeout(ok, t));
function elMaxEntre(de, ate) {
  try {
    const linhas = fs.readFileSync(SONDA, 'utf8').trim().split('\n').map((l) => { try { return JSON.parse(l); } catch (e) { return null; } }).filter(Boolean);
    return Math.round(Math.max(0, ...linhas.filter((l) => l.t > de && l.t <= ate + 1050).map((l) => l.elMax)));
  } catch (e) { return null; }
}
async function comSonda(fn) {
  if (SONDA) await dormir(1100);
  const de = Date.now();
  const sondaAgente = new http.Agent({ keepAlive: true, maxSockets: 1 });
  let rodando = true;
  const esperas = [];
  const laco = (async () => {
    while (rodando) {
      const t0 = performance.now();
      await new Promise((ok) => {
        const r = http.request({ host: BASE.hostname, port: BASE.port, path: '/healthz', agent: sondaAgente }, (res) => { res.resume(); res.on('end', ok); });
        r.on('error', ok);
        r.end();
      });
      esperas.push(performance.now() - t0);
      await new Promise((ok) => setTimeout(ok, 2));
    }
  })();
  await new Promise((ok) => setTimeout(ok, 50));
  const base = esperas.length ? Math.max(...esperas) : 0;
  esperas.length = 0;
  let r;
  try { r = await fn(); } finally { rodando = false; await laco; sondaAgente.destroy(); }
  const ate = Date.now();
  if (SONDA) await dormir(1100);
  return { r, travaMs: Math.round(Math.max(0, ...esperas)), sondaAntesMs: Math.round(base), elMaxMs: SONDA ? elMaxEntre(de, ate) : undefined };
}

let contas = 0;
async function conta(nTvs) {
  contas++;
  const nome = 'Conta grande ' + contas + ' ' + Date.now().toString(36);
  const r = await pedir('POST', '/api/auth/signup', { corpo: { email: 'cg' + contas + '-' + Date.now() + '@teste.local', password: 'senha-de-teste-123', name: nome, aceite: true, perfil: 'empresa' }, ip: '10.70.' + contas + '.9', headers: { Origin: BASE.origin } });
  const cookie = (r.headers['set-cookie'] || []).map((c) => c.split(';')[0]).join('; ');
  const [t] = await sql('SELECT id FROM tenants WHERE name = ?', [nome]);
  await sql("UPDATE tenants SET plan = 'enterprise', plan_status = 'active', plan_renews_at = ? WHERE id = ?", [Date.now() + 30 * 864e5, t.id]);
  const cfg = montarProgramaRh({});
  const ids = [];
  for (let i = 0; i < nTvs; i += 10) {
    const lote = await Promise.all(Array.from({ length: Math.min(10, nTvs - i) }, (_, k) => pedir('POST', '/api/devices', { ip: '10.71.' + ((i + k) % 250) + '.' + (contas % 250) })));
    for (const d of lote) if (d.status === 201) ids.push(d.json.id);
  }
  const agora = Date.now();
  for (let i = 0; i < ids.length; i++) {
    const nomeTv = 'TV ' + (i + 1);
    const c = JSON.stringify(Object.assign({}, cfg, { settings: Object.assign({}, cfg.settings, { nome: nomeTv }) }));
    await sql('UPDATE devices SET tenant_id = ?, name = ?, config = ?, updated_at = ?, last_seen = ?, grupo = ? WHERE id = ?',
      [t.id, nomeTv, c, agora - i, agora, 'Unidade ' + (1 + (i % 6)), ids[i]]);
  }
  return { cookie, ids, tenantId: t.id, bytesProgramacao: JSON.stringify(cfg).length };
}

const ms = (x) => Math.round(x);
const mb = (b) => +(b / 1e6).toFixed(2);
const mediana = (l) => { const s = l.slice().sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };
const saida = { tvs: N };

if (so.includes('telas')) {
  for (const n of [5, N]) {
    const c = await conta(n);
    const rodadas = [];
    for (let i = 0; i < 5; i++) {
      const { r, travaMs, elMaxMs } = await comSonda(() => pedir('GET', '/api/devices?agora=1', { cookie: c.cookie }));
      rodadas.push({ status: r.status, ms: r.ms, bytes: r.bytes, travaMs, elMaxMs, comProgramacao: (r.json && r.json.devices || []).filter((d) => d.programacao).length });
      await new Promise((ok) => setTimeout(ok, 300));
    }
    const linha = { tvs: n, status: rodadas[0].status, mb: mb(rodadas[0].bytes), msMediana: ms(mediana(rodadas.map((x) => x.ms))), travaMsMediana: mediana(rodadas.map((x) => x.travaMs)), travaMsPior: Math.max(...rodadas.map((x) => x.travaMs)), comProgramacao: rodadas[0].comProgramacao };
    if (SONDA) linha.elMaxPior = Math.max(...rodadas.map((x) => x.elMaxMs || 0));
    /*
     * As miniaturas que aparecem: a primeira tela de cartões (9, três
     * colunas de três) e, para quem rolar a lista inteira, de 25 em 25.
     */
    const lista = (await pedir('GET', '/api/devices?agora=1', { cookie: c.cookie })).json.devices;
    const faltam = lista.filter((d) => d.hasConfig && !d.programacao).map((d) => d.id);
    if (faltam.length) {
      const primeira = await comSonda(() => pedir('GET', '/api/devices/configs?ids=' + faltam.slice(0, 9).join(','), { cookie: c.cookie }));
      linha.primeiraTela = { tvs: 9, mb: mb(primeira.r.bytes), ms: ms(primeira.r.ms), travaMs: primeira.travaMs, elMaxMs: primeira.elMaxMs };
      const pedacos = [];
      for (let i = 0; i < faltam.length; i += 25) {
        const p = await comSonda(() => pedir('GET', '/api/devices/configs?ids=' + faltam.slice(i, i + 25).join(','), { cookie: c.cookie }));
        pedacos.push({ ms: p.r.ms, travaMs: p.travaMs, elMaxMs: p.elMaxMs || 0, bytes: p.r.bytes });
      }
      linha.rolarTudo = { pedidos: pedacos.length, msMediana: ms(mediana(pedacos.map((p) => p.ms))), travaMsPior: Math.max(...pedacos.map((p) => p.travaMs)), mbTotal: mb(pedacos.reduce((s, p) => s + p.bytes, 0)) };
      if (SONDA) linha.rolarTudo.elMaxPior = Math.max(...pedacos.map((p) => p.elMaxMs));
    }
    (saida.telas = saida.telas || []).push(linha);
    console.log('telas', JSON.stringify(linha));
  }
}

/* O aviso: a mesma peça do painel (web/src/lib/aviso.js), com a marca. */
let pecaDoAviso = null;
async function aviso() {
  if (pecaDoAviso) return pecaDoAviso;
  const A = await import(pathToFileURL(path.join(RAIZ, 'web/src/lib/aviso.js')).href);
  const PH = req('../../js/peca-html.js');
  const M = JSON.parse(fs.readFileSync(path.join(RAIZ, 'pecas-ouro', 'manifesto.json'), 'utf8'));
  const modelos = new Map(M.pecas.map((p) => [p.id, { ...p, arq: PH.doArquivo(fs.readFileSync(path.join(RAIZ, 'pecas-ouro', p.id + '.html'), 'utf8')) }]));
  const dados = { titulo: 'Refeitório fecha às 14h hoje', detalhe: 'Use o da unidade 2', ate: '', prioridade: 'alta', alvo: { tipo: 'todas' } };
  pecaDoAviso = { A, dados, item: A.pecaDoAviso(dados, modelos, { nome: 'Metalúrgica Alfa', cores: ['#23395d', '#f4a261'] }) };
  return pecaDoAviso;
}

if (so.includes('aviso-lote')) {
  const { A, dados, item } = await aviso();
  for (const n of (process.env.CG_LOTE || '15,20,300').split(',').map(Number).map((x) => Math.min(x, N))) {
    const c = await conta(n);
    const { r, travaMs, elMaxMs } = await comSonda(async () => {
      const t0 = performance.now();
      // Como o navegador: até 6 leituras ao mesmo tempo.
      const lidas = [];
      let status429 = 0;
      for (let i = 0; i < c.ids.length; i += 6) {
        const parte = await Promise.all(c.ids.slice(i, i + 6).map((id) => pedir('GET', '/api/devices/' + id + '/config', { cookie: c.cookie })));
        for (const p of parte) { if (p.status === 429) status429++; lidas.push(p); }
      }
      const itens = c.ids.map((id, i) => ({ id, config: A.aplicarAviso(lidas[i].json || {}, item, dados, 'avs_carga'), versao: Number(lidas[i].headers['x-config-versao']) || 0 }));
      const envio = await pedir('POST', '/api/lote', { cookie: c.cookie, corpo: { itens, descricao: 'Aviso: ' + dados.titulo } });
      return { status: envio.status, erro: envio.erro || (envio.json && envio.json.error) || '', pedidos: c.ids.length + 1, leituras429: status429, mbEnviados: mb(envio.enviados), ms: performance.now() - t0 };
    });
    const linha = { tvs: n, ...r, ms: ms(r.ms), travaMs, elMaxMs };
    (saida.avisoLote = saida.avisoLote || []).push(linha);
    console.log('aviso-lote', JSON.stringify(linha));
  }
}

if (so.includes('aviso')) {
  const { dados, item } = await aviso();
  for (const n of (process.env.CG_AVISO || '20,300').split(',').map(Number).map((x) => Math.min(x, N))) {
    const c = await conta(n);
    const corpo = { telas: c.ids, item, aviso: dados, hoje: new Date().toISOString().slice(0, 10) };
    const { r, travaMs, elMaxMs } = await comSonda(() => pedir('POST', '/api/lote/aviso', { cookie: c.cookie, corpo }));
    const linha = { tvs: n, status: r.status, erro: r.erro || (r.json && r.json.error) || '', pedidos: 1, kbEnviados: +(r.enviados / 1e3).toFixed(1), ms: ms(r.ms), travaMs, elMaxMs };
    // Conferido no banco: todas as TVs com o aviso na frente da principal.
    const rows = await sql('SELECT config FROM devices WHERE tenant_id = ?', [c.tenantId]);
    linha.comAviso = rows.filter((x) => { try { const it = JSON.parse(x.config).zonas.principal.items[0]; return !!(it && it._aviso); } catch (e) { return false; } }).length;
    if (r.json && r.json.lote) {
      const d = await comSonda(() => pedir('POST', '/api/lote/' + r.json.lote + '/desfazer', { cookie: c.cookie }));
      const depois = await sql('SELECT config FROM devices WHERE tenant_id = ?', [c.tenantId]);
      linha.desfazer = { status: d.r.status, ms: ms(d.r.ms), travaMs: d.travaMs, elMaxMs: d.elMaxMs, voltaram: d.r.json && d.r.json.voltaram ? d.r.json.voltaram.length : null,
        semAviso: depois.filter((x) => { try { return !JSON.parse(x.config).zonas.principal.items.some((it) => it && it._aviso); } catch (e) { return false; } }).length };
      const [l] = await sql('SELECT telas FROM lotes WHERE id = ?', [r.json.lote]);
      linha.kbDoDesfazerGuardado = l ? +(String(l.telas).length / 1e3).toFixed(1) : null;
    }
    (saida.aviso = saida.aviso || []).push(linha);
    console.log('aviso', JSON.stringify(linha));
  }
}

console.log(JSON.stringify(saida));
agente.destroy();
await sql.fim();
