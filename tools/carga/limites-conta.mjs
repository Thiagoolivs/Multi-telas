/*
 * tools/carga/limites-conta.mjs — onde uma conta grande (e quem instala)
 * esbarra nos limites, medido no servidor local.
 *
 *   LIM_BASE=http://127.0.0.1:6090 LIM_PSQL='-h /sock -U mt -d multitelas' node tools/carga/limites-conta.mjs
 *
 *   1. TVs novas do mesmo IP (POST /api/devices): em que número vem o 429.
 *   2. O freio do painel da conta (600 pedidos em 5 min): quantos pedidos de
 *      painel passam antes do 429 — e quanto disso uma instalação gasta.
 *   3. O envio em lote (aviso rápido) com a programação de RH: até quantas
 *      TVs cabe num pedido (o corpo tem teto de 2 MB, server.js readBody).
 *   4. O lote de mais de 200 TVs (conferirLote corta em 200).
 */
import http from 'node:http';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';

const req = createRequire(import.meta.url);
const { montarProgramaRh } = req('./programa-rh.cjs');
const BASE = new URL(process.env.LIM_BASE || 'http://127.0.0.1:6090');
const PSQL = (process.env.LIM_PSQL || '').split(' ').filter(Boolean);
const so = (process.env.LIM_SO || '1,2,3,4').split(',');

function pedir(metodo, caminho, o) {
  const op = o || {};
  const corpo = op.corpo !== undefined ? Buffer.from(JSON.stringify(op.corpo)) : null;
  const headers = Object.assign({}, op.headers || {});
  if (corpo) { headers['Content-Type'] = 'application/json'; headers['Content-Length'] = corpo.length; }
  if (op.ip) headers['X-Forwarded-For'] = op.ip;
  if (op.cookie) { headers.Cookie = op.cookie; headers.Origin = BASE.origin; }
  return new Promise((resolve) => {
    const r = http.request({ host: BASE.hostname, port: BASE.port, path: caminho, method: metodo, headers }, (res) => {
      const partes = [];
      res.on('data', (c) => partes.push(c));
      res.on('end', () => {
        const txt = Buffer.concat(partes).toString('utf8');
        let json = null; try { json = JSON.parse(txt); } catch (e) { /* não é JSON */ }
        resolve({ status: res.statusCode, json, headers: res.headers, bytes: corpo ? corpo.length : 0 });
      });
    });
    r.on('error', (e) => resolve({ status: 0, erro: e.code || e.message, bytes: corpo ? corpo.length : 0 }));
    if (corpo) r.write(corpo);
    r.end();
  });
}

async function conta(rotulo) {
  const nome = 'Limites ' + rotulo + ' ' + Date.now().toString(36);
  const r = await pedir('POST', '/api/auth/signup', { corpo: { email: 'lim-' + rotulo + Date.now() + '@teste.local', password: 'senha-de-teste-123', name: nome, aceite: true, perfil: 'empresa' }, ip: '10.250.' + Math.floor(Math.random() * 250) + '.9', headers: { Origin: BASE.origin } });
  const cookie = (r.headers['set-cookie'] || []).map((c) => c.split(';')[0]).join('; ');
  if (PSQL.length) execFileSync('psql', [...PSQL, '-qc', "UPDATE tenants SET plan='enterprise', plan_status='active', plan_renews_at=" + (Date.now() + 30 * 864e5) + " WHERE name='" + nome + "'"]);
  return cookie;
}

async function tvNaConta(cookie, ip) {
  const d = await pedir('POST', '/api/devices', { ip });
  if (d.status !== 201) return { status: d.status };
  await pedir('POST', '/api/devices/' + d.json.id + '/heartbeat', { corpo: {}, headers: { 'x-device-token': d.json.deviceToken } });
  const p = await pedir('POST', '/api/pair', { corpo: { code: d.json.code, nova: true }, cookie, ip });
  return { status: p.status, id: d.json.id };
}

const saida = {};
if (so.includes('1')) {
  // 1. Do mesmo IP (o escritório do cliente, ou o instalador com o 4G dele).
  const ip = '10.251.' + Math.floor(Math.random() * 250) + '.1';
  let primeiro429 = 0;
  for (let i = 1; i <= 70; i++) {
    const d = await pedir('POST', '/api/devices', { ip });
    if (d.status === 429 && !primeiro429) { primeiro429 = i; saida.tvNovaRetryAfter = d.headers['retry-after']; }
  }
  saida.tvNovaMesmoIp = { primeiro429, limite: '60/h por IP' };
  console.log('1. TVs novas do mesmo IP: a', primeiro429 + 'ª leva 429, Retry-After', saida.tvNovaRetryAfter, 's');
}
if (so.includes('2')) {
  // 2. Quantos pedidos de painel a conta faz antes do 429 (GET /api/auth/me é o mais leve).
  const cookie = await conta('painel');
  let n = 0, st = 200;
  while (st !== 429 && n < 2000) { st = (await pedir('GET', '/api/auth/me', { cookie })).status; n++; }
  saida.painelAte429 = n;
  console.log('2. Freio do painel da conta: o pedido', n, 'leva', st);
}
if (so.includes('3') || so.includes('4')) {
  // 3. O aviso rápido (POST /api/lote) com a programação de RH em cada TV.
  const cookie = await conta('lote');
  const cfg = montarProgramaRh({});
  const tvs = [];
  for (let i = 0; i < 205; i++) {
    const t = await tvNaConta(cookie, '10.252.' + Math.floor(i / 50) + '.1');
    if (t.id) tvs.push(t.id);
  }
  console.log('   ', tvs.length, 'TVs na conta do lote (', JSON.stringify(cfg).length, 'bytes de programação)');
  if (so.includes('3')) {
    saida.lote = [];
    for (const n of [5, 10, 15, 20, 21, 25, 50]) {
      const r = await pedir('POST', '/api/lote', { corpo: { itens: tvs.slice(0, n).map((id) => ({ id, config: cfg })), descricao: 'Aviso' }, cookie });
      saida.lote.push({ tvs: n, mb: +(r.bytes / 1e6).toFixed(2), status: r.status, erro: r.erro || (r.json && r.json.error) || '' });
      console.log('3. lote de', n, 'TVs (', (r.bytes / 1e6).toFixed(2), 'MB): status', r.status, r.erro || (r.json && r.json.error) || '');
    }
  }
  if (so.includes('4')) {
    // 4. Mais de 200 TVs num lote, com uma programação pequena (cabe no corpo): quantas mudam de verdade?
    const pequena = { settings: { layoutId: 'fullscreen', nome: 'X' }, zonas: { principal: { items: [{ type: 'text', titulo: 'Aviso', corpo: 'Teste', duracao: 10 }] } } };
    const r = await pedir('POST', '/api/lote', { corpo: { itens: tvs.slice(0, 205).map((id) => ({ id, config: pequena })), descricao: 'Aviso 205' }, cookie });
    saida.lote205 = { status: r.status, telasNaResposta: r.json && r.json.telas ? r.json.telas.length : null, erro: r.json && r.json.error };
    console.log('4. lote de 205 TVs (programação pequena): status', r.status, '— TVs gravadas:', saida.lote205.telasNaResposta, r.json && r.json.error ? r.json.error : '');
  }
}
console.log(JSON.stringify(saida));
