/*
 * Mandar para todas as TVs: envio em lote no servidor, com desfazer (EXECUTOR D26).
 *
 * Antes era o navegador, TV por TV: falhava no meio, as primeiras ficavam
 * mudadas e o aviso mentia. Agora o servidor recebe todas, confere posse,
 * versão e a porta de TODAS, e só então grava — tudo ou nada; o "antes"
 * fica para o Desfazer.
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const http = require('node:http');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { spawn } = require('node:child_process');

const RAIZ = path.join(__dirname, '..');
const ler = (...p) => fs.readFileSync(path.join(RAIZ, ...p), 'utf8');

/* ---------------- o painel ---------------- */

function apiFalsa(respostas) {
  const pedidos = [];
  const antes = { fetch: globalThis.fetch, window: globalThis.window };
  globalThis.window = { dispatchEvent() {} };
  globalThis.fetch = async (url, op) => {
    const metodo = (op && op.method) || 'GET';
    pedidos.push({ url: String(url), metodo, corpo: op && op.body ? JSON.parse(op.body) : null });
    const r = respostas(String(url), metodo, pedidos.length);
    return { ok: r.status < 400, status: r.status, headers: { get: (k) => (r.headers || {})[k.toLowerCase()] || null }, json: async () => r.json };
  };
  return { pedidos, devolver: () => { globalThis.fetch = antes.fetch; globalThis.window = antes.window; } };
}
const rodar = () => import(pathToFileURL(path.join(RAIZ, 'web/src/lib/rodar.js')).href);

test('o painel manda todas de uma vez; se uma TV mudou no meio, relê todas e reaplica', async (t) => {
  const R = await rodar();
  let envios = 0;
  const a = apiFalsa((url, metodo) => {
    if (metodo === 'GET') return { status: 200, json: { settings: { layoutId: 'full' }, zonas: { principal: { items: [] } } }, headers: { 'x-config-versao': String(10 + envios) } };
    envios++;
    return envios === 1 ? { status: 409, json: { error: 'mudou', code: 'config-mudou' } } : { status: 200, json: { ok: true, lote: 'lot_1' } };
  });
  t.after(a.devolver);
  const r = await R.gravarEmLote([{ id: 'dev_a' }, { id: 'dev_b' }], (cfg, tv) => ({ ...cfg, marca: tv.id }), 'teste');
  assert.deepEqual(r, { lote: 'lot_1', ids: ['dev_a', 'dev_b'] });
  const posts = a.pedidos.filter((p) => p.metodo === 'POST');
  assert.equal(posts.length, 2, 'não tentou de novo depois do conflito');
  assert.equal(posts[1].url, '/api/lote');
  assert.deepEqual(posts[1].corpo.itens.map((i) => [i.id, i.config.marca, i.versao]), [['dev_a', 'dev_a', 11], ['dev_b', 'dev_b', 11]], 'reaplicou sobre a versão nova');
});

test('erro que não é conflito não é repetido; e os envios a várias TVs passam pelo lote', async (t) => {
  const R = await rodar();
  const a = apiFalsa((url, metodo) => (metodo === 'GET' ? { status: 200, json: {}, headers: { 'x-config-versao': '1' } } : { status: 400, json: { error: 'peça recusada' } }));
  t.after(a.devolver);
  await assert.rejects(R.gravarEmLote([{ id: 'dev_a' }], (c) => c), /peça recusada/);
  assert.equal(a.pedidos.filter((p) => p.metodo === 'POST').length, 1);
  const rodarJs = ler('web/src/lib/rodar.js');
  for (const f of ['rodarCampanha', 'pausarCampanha', 'porPecaNasTelas']) {
    const corpo = rodarJs.slice(rodarJs.indexOf('export async function ' + f + '('), rodarJs.indexOf('\n}\n', rodarJs.indexOf('export async function ' + f + '(')));
    assert.match(corpo, /gravarEmLote\(/, f + ' ainda grava TV por TV');
  }
  assert.match(ler('web/src/lib/publicar.js'), /return gravarEmLote\(devs, \(cfg\) => montar\(cfg\), titulo \|\| 'Publicar'\);/);
  assert.match(ler('web/src/pages/TelasProntasPage.jsx'), /avisarComDesfazer\(/);
  assert.match(ler('web/src/pages/PecasProntasPage.jsx'), /avisarComDesfazer\(/);
  assert.doesNotMatch(ler('web/src/pages/CalendarioPage.jsx'), /gravarNaTela/);
});

/* ---------------- servidor de verdade ---------------- */

const PORTA = 6600 + Math.floor(Math.random() * 90);
function pedir(caminho, o = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port: PORTA, path: caminho, method: o.method || 'GET',
      headers: { ...(o.json ? { 'Content-Type': 'application/json' } : {}), ...(o.cookie ? { Cookie: o.cookie } : {}) } }, (res) => {
      let corpo = '';
      res.on('data', (c) => { corpo += c; });
      res.on('end', () => { let json = null; try { json = JSON.parse(corpo); } catch (e) { json = null; } resolve({ status: res.statusCode, json, headers: res.headers, cookies: [].concat(res.headers['set-cookie'] || []) }); });
    });
    req.on('error', reject);
    req.setTimeout(30000, () => req.destroy(new Error('a rota ' + caminho + ' não respondeu')));
    if (o.json) req.write(JSON.stringify(o.json));
    req.end();
  });
}
const cookieDe = (r) => r.cookies.map((c) => c.split(';')[0]).filter((c) => !c.endsWith('=')).join('; ');

test('servidor: tudo ou nada, com versão, e o desfazer não apaga o que mudou depois', async (t) => {
  const dados = fs.mkdtempSync(path.join(os.tmpdir(), 'mt-d26-'));
  const servidor = spawn(process.execPath, ['server.js'], {
    cwd: RAIZ, stdio: 'ignore',
    env: { ...process.env, PORT: String(PORTA), STORAGE: 'local', SKIP_VERIFY: '1', DATABASE_URL: '', DATA_DIR: dados, MEDIA_DIR: dados, AI_PROVIDER: 'dev' },
  });
  t.after(() => { servidor.kill(); try { fs.rmSync(dados, { recursive: true, force: true }); } catch (e) { /* o Windows segura o arquivo */ } });
  let ok = false;
  for (let i = 0; i < 60 && !ok; i++) { try { await pedir('/tv'); ok = true; } catch (e) { await new Promise((r) => setTimeout(r, 250)); } }
  assert.ok(ok, 'o servidor de teste não subiu');
  const conta = async (n) => cookieDe(await pedir('/api/auth/signup', { method: 'POST', json: { email: 'd26' + n + Date.now() + '@teste.local', password: 'senha-de-teste-123', name: 'Loja ' + n, aceite: true } }));
  const c = await conta('a');
  const outra = await conta('b');
  // A conta grátis pareia uma TV só: o Essencial em modo simulado (sem chave do Asaas) libera as outras.
  assert.equal((await pedir('/api/billing/dev-activate', { method: 'POST', cookie: c, json: { plan: 'pro' } })).status, 200);
  const novaTv = async (cookie) => {
    const tv = (await pedir('/api/devices', { method: 'POST', json: {} })).json;
    assert.ok((await pedir('/api/pair', { method: 'POST', cookie, json: { code: tv.code } })).status < 300);
    return tv.id;
  };
  const a = await novaTv(c);
  const b = await novaTv(c);
  const cfg = (titulo) => ({ settings: { layoutId: 'full' }, zonas: { principal: { items: [{ type: 'text', titulo }] } } });
  const titulo = async (id) => { const r = (await pedir('/api/devices/' + id + '/config', { cookie: c })).json; return r && r.zonas && r.zonas.principal.items[0] && r.zonas.principal.items[0].titulo; };
  const versao = async (id) => Number((await pedir('/api/devices/' + id + '/config', { cookie: c })).headers['x-config-versao']) || 0;
  assert.equal((await pedir('/api/devices/' + a + '/config', { method: 'PUT', cookie: c, json: cfg('antes A') })).status, 200);
  assert.equal((await pedir('/api/devices/' + b + '/config', { method: 'PUT', cookie: c, json: cfg('antes B') })).status, 200);

  assert.equal((await pedir('/api/lote', { method: 'POST', json: { itens: [] } })).status, 401);

  // Uma TV com problema: NENHUMA muda.
  const quizPendente = { settings: { layoutId: 'full' }, zonas: { principal: { items: [{ type: 'quiz', perguntas: [{ pergunta: 'X?', alternativas: ['a', 'b'], certa: 0, revisada: false }] }] } } };
  const ruim = await pedir('/api/lote', { method: 'POST', cookie: c, json: { itens: [{ id: a, config: cfg('novo A'), versao: await versao(a) }, { id: b, config: quizPendente, versao: await versao(b) }] } });
  assert.equal(ruim.status, 400);
  assert.match(ruim.json.error, /Nada foi enviado/);
  assert.equal(await titulo(a), 'antes A', 'a primeira TV mudou mesmo com a segunda recusada');

  // Versão velha numa: NENHUMA muda.
  const velha = await pedir('/api/lote', { method: 'POST', cookie: c, json: { itens: [{ id: a, config: cfg('novo A'), versao: await versao(a) }, { id: b, config: cfg('novo B'), versao: 1 }] } });
  assert.equal(velha.status, 409);
  assert.equal(velha.json.code, 'config-mudou');
  assert.equal(await titulo(a), 'antes A');

  // TV de outra conta: recusada (e nada muda).
  const alheia = await novaTv(outra);
  const intruso = await pedir('/api/lote', { method: 'POST', cookie: c, json: { itens: [{ id: a, config: cfg('novo A') }, { id: alheia, config: cfg('invadido') }] } });
  assert.equal(intruso.status, 400);
  assert.equal(await titulo(a), 'antes A');

  // Tudo certo: as duas mudam, e o lote volta.
  const certo = await pedir('/api/lote', { method: 'POST', cookie: c, json: { descricao: 'teste', itens: [{ id: a, config: cfg('novo A'), versao: await versao(a) }, { id: b, config: cfg('novo B'), versao: await versao(b) }] } });
  assert.equal(certo.status, 200);
  assert.ok(certo.json.lote);
  assert.equal(await titulo(a), 'novo A');
  assert.equal(await titulo(b), 'novo B');

  // Alguém muda a B depois; desfazer volta a A e deixa a B como a pessoa deixou.
  await new Promise((r) => setTimeout(r, 5));
  assert.equal((await pedir('/api/devices/' + b + '/config', { method: 'PUT', cookie: c, json: cfg('mexida depois') })).status, 200);
  assert.equal((await pedir('/api/lote/' + certo.json.lote + '/desfazer', { method: 'POST', cookie: outra })).status, 404, 'outra conta desfez');
  const desfeito = await pedir('/api/lote/' + certo.json.lote + '/desfazer', { method: 'POST', cookie: c });
  assert.equal(desfeito.status, 200);
  assert.deepEqual(desfeito.json.voltaram.map((x) => x.id), [a]);
  assert.deepEqual(desfeito.json.mudaram.map((x) => x.id), [b]);
  assert.equal(await titulo(a), 'antes A');
  assert.equal(await titulo(b), 'mexida depois');
  assert.equal((await pedir('/api/lote/' + certo.json.lote + '/desfazer', { method: 'POST', cookie: c })).status, 409, 'desfez duas vezes');
});

test('LGPD: o histórico de envios sai com a conta, nos dois bancos', () => {
  for (const f of ['server/db-sqlite.js', 'server/db-postgres.js']) {
    const s = ler(f);
    assert.match(s, /'calendario', 'lotes', 'users'\]/, f);
    assert.match(s, /CREATE TABLE IF NOT EXISTS lotes/);
  }
});

test('mandar para um grupo: "Todas" e cada grupo marcam as TVs de uma vez nos envios', () => {
  const g = ler('web/src/components/tela/AtalhosDeGrupo.jsx');
  assert.match(g, /atalho\('Todas', lista\.map\(\(t\) => t\.id\)\)/);
  assert.match(g, /grupos\.map\(\(g\) => atalho\(g, lista\.filter\(\(t\) => t\.grupo === g\)\.map\(\(t\) => t\.id\)\)\)/);
  assert.match(ler('web/src/pages/PecasProntasPage.jsx'), /<AtalhosDeGrupo telas=\{telas\} alvos=\{alvos\} onEscolher=\{setAlvos\} \/>/);
  // Na tela pronta, o grupo só marca as TVs do mesmo jeito (em pé × deitada).
  assert.match(ler('web/src/pages/TelasProntasPage.jsx'), /<AtalhosDeGrupo telas=\{tvs\} alvos=\{alvos\} onEscolher=\{setAlvos\} podeIr=/);
});
