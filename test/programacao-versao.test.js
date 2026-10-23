/*
 * Nunca perder a programação de uma TV (EXECUTOR D0.5).
 *
 * Três caminhos apagavam a programação real sem aviso:
 *   1. o editor da TV que não conseguia LER a programação (rede, servidor)
 *      semeava a programação padrão, editável, e o primeiro toque a gravava
 *      por cima da real;
 *   2. "Pôr pra rodar" e "Publicar" tratavam falha de leitura como "TV sem
 *      programação" e gravavam a campanha sobre o padrão;
 *   3. a última gravação vencia: outra aba, outra pessoa ou uma campanha
 *      gravando no meio era apagada.
 * E o salvamento automático que falhava ficava "Salvando…" para sempre.
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const http = require('node:http');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { pathToFileURL } = require('node:url');

const RAIZ = path.join(__dirname, '..');
const PORTA = 4900 + Math.floor(Math.random() * 90);

function pedir(caminho, o = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port: PORTA, path: caminho, method: o.method || 'GET',
      headers: { ...(o.body ? { 'Content-Type': 'application/json' } : {}), ...(o.cookie ? { Cookie: o.cookie } : {}), ...(o.headers || {}) } }, (res) => {
      let corpo = '';
      res.on('data', (c) => { corpo += c; });
      res.on('end', () => {
        let json = null; try { json = JSON.parse(corpo); } catch (e) { json = null; }
        resolve({ status: res.statusCode, json, headers: res.headers, cookies: [].concat(res.headers['set-cookie'] || []) });
      });
    });
    req.on('error', reject);
    req.setTimeout(15000, () => req.destroy(new Error('a rota ' + caminho + ' não respondeu')));
    if (o.body) req.write(JSON.stringify(o.body));
    req.end();
  });
}
const cookieDe = (r) => r.cookies.map((c) => c.split(';')[0]).filter((c) => !c.endsWith('=')).join('; ');

test('servidor: a programação tem versão, e gravar sobre uma versão velha é recusado', async (t) => {
  const dados = fs.mkdtempSync(path.join(os.tmpdir(), 'mt-versao-'));
  const servidor = spawn(process.execPath, ['server.js'], {
    cwd: RAIZ, stdio: 'ignore',
    env: { ...process.env, PORT: String(PORTA), STORAGE: 'local', SKIP_VERIFY: '1', DATABASE_URL: '', DATA_DIR: dados, AI_PROVIDER: 'dev' },
  });
  t.after(() => { servidor.kill(); try { fs.rmSync(dados, { recursive: true, force: true }); } catch (e) { /* o Windows segura o arquivo */ } });
  let ok = false;
  for (let i = 0; i < 160 && !ok; i++) { try { await pedir('/tv'); ok = true; } catch (e) { await new Promise((r) => setTimeout(r, 250)); } }
  assert.ok(ok, 'o servidor de teste não subiu');

  const c = cookieDe(await pedir('/api/auth/signup', { method: 'POST', body: { email: 'versao' + Date.now() + '@teste.local', password: 'senha-de-teste-123', name: 'Loja', aceite: true } }));
  const tv = (await pedir('/api/devices', { method: 'POST', body: {} })).json;
  await pedir('/api/devices/' + tv.id + '/config', { headers: { 'x-device-token': tv.deviceToken } });
  assert.ok((await pedir('/api/pair', { method: 'POST', cookie: c, body: { code: tv.code } })).status < 300);

  const cfg = (titulo) => ({ settings: { layoutId: 'full' }, zonas: { principal: { items: [{ type: 'text', titulo }] } } });
  // Sem versão: grava como sempre (TV nova, cópia de tela).
  const primeira = await pedir('/api/devices/' + tv.id + '/config', { method: 'PUT', cookie: c, body: cfg('um') });
  assert.equal(primeira.status, 200);
  const v1 = primeira.json.updatedAt;

  const lida = await pedir('/api/devices/' + tv.id + '/config', { cookie: c });
  assert.equal(Number(lida.headers['x-config-versao']), v1, 'a leitura diz a versão');

  // Alguém grava no meio...
  await new Promise((r) => setTimeout(r, 5));
  const outra = await pedir('/api/devices/' + tv.id + '/config?versao=' + v1, { method: 'PUT', cookie: c, body: cfg('dois') });
  assert.equal(outra.status, 200);
  // ...e quem ainda tinha a versão 1 não passa por cima.
  const velha = await pedir('/api/devices/' + tv.id + '/config?versao=' + v1, { method: 'PUT', cookie: c, body: cfg('apagaria o dois') });
  assert.equal(velha.status, 409);
  assert.equal(velha.json.code, 'config-mudou');
  assert.match(velha.json.error, /mudada em outro lugar/);
  const naTv = (await pedir('/api/devices/' + tv.id + '/config', { cookie: c })).json;
  assert.equal(naTv.zonas.principal.items[0].titulo, 'dois', 'a gravação do meio ficou');
});

/* ---------------- o painel: Pôr pra rodar e Publicar ---------------- */

function apiFalsa(respostas) {
  const pedidos = [];
  const antes = { fetch: globalThis.fetch, window: globalThis.window };
  globalThis.window = { dispatchEvent() {} };
  globalThis.fetch = async (url, op) => {
    const metodo = (op && op.method) || 'GET';
    pedidos.push({ url: String(url), metodo, corpo: op && op.body ? JSON.parse(op.body) : null });
    const r = respostas(String(url), metodo, pedidos.length);
    return {
      ok: r.status < 400, status: r.status,
      headers: { get: (k) => (r.headers || {})[k.toLowerCase()] || null },
      json: async () => r.json,
    };
  };
  return { pedidos, devolver: () => { globalThis.fetch = antes.fetch; globalThis.window = antes.window; } };
}
const rodar = () => import(pathToFileURL(path.join(RAIZ, 'web/src/lib/rodar.js')).href);

test('Pôr pra rodar: a TV mudou no meio → relê e aplica de novo, sem apagar o que a outra pessoa fez', async (t) => {
  const R = await rodar();
  const daOutraPessoa = { settings: { layoutId: 'full' }, zonas: { principal: { items: [{ type: 'text', titulo: 'aviso da outra pessoa' }] } } };
  let gravacoes = 0;
  const a = apiFalsa((url, metodo) => {
    if (metodo === 'GET') {
      return gravacoes === 0
        ? { status: 200, json: { settings: { layoutId: 'full' }, zonas: { principal: { items: [] } } }, headers: { 'x-config-versao': '1' } }
        : { status: 200, json: daOutraPessoa, headers: { 'x-config-versao': '2' } };
    }
    gravacoes++;
    return /versao=1/.test(url) ? { status: 409, json: { error: 'mudou', code: 'config-mudou' } } : { status: 200, json: { ok: true, updatedAt: 3 } };
  });
  t.after(a.devolver);
  await R.gravarNaTela({ id: 'dev_a', name: 'Balcão' }, (cfg) => R.aplicarPeca(cfg, { item: { type: 'text', titulo: 'da campanha' }, formato: '16/9' }));
  const puts = a.pedidos.filter((p) => p.metodo === 'PUT');
  assert.equal(puts.length, 2);
  assert.match(puts[1].url, /versao=2/);
  const titulos = puts[1].corpo.zonas.principal.items.map((i) => i.titulo);
  assert.deepEqual(titulos, ['aviso da outra pessoa', 'da campanha'], 'a mudança foi reaplicada sobre a versão nova');
});

test('falha ao LER a TV não vira "TV vazia": nada é gravado', async (t) => {
  const R = await rodar();
  const a = apiFalsa((url, metodo) => (metodo === 'GET' ? { status: 502, json: { error: 'proxy caiu' } } : { status: 200, json: { ok: true } }));
  t.after(a.devolver);
  await assert.rejects(R.gravarNaTela({ id: 'dev_a' }, (cfg) => cfg));
  assert.equal(a.pedidos.filter((p) => p.metodo === 'PUT').length, 0, 'nenhuma programação padrão gravada por cima');
});

test('TV que de fato não tem programação (204) começa do padrão', async (t) => {
  const R = await rodar();
  const a = apiFalsa((url, metodo) => (metodo === 'GET' ? { status: 204, json: null } : { status: 200, json: { ok: true, updatedAt: 1 } }));
  t.after(a.devolver);
  await R.gravarNaTela({ id: 'dev_nova', name: 'Nova' }, (cfg) => cfg);
  const put = a.pedidos.find((p) => p.metodo === 'PUT');
  assert.ok(put && put.corpo.zonas, 'gravou a programação padrão numa TV vazia');
});

test('o editor da TV: erro de leitura não semeia o padrão, salvar tenta de novo, e o conflito para', () => {
  const s = fs.readFileSync(path.join(RAIZ, 'web/src/pages/ContentEditorPage.jsx'), 'utf8');
  assert.match(s, /if \(error \|\| !data\) \{ setCfg\(null\); return; \}/);
  assert.ok(!/data \|\| defaultConfig\(device\.name\)/.test(s), 'voltou a semear o padrão quando a leitura falha');
  assert.match(s, /deviceConfig\.save\(device\.id, alvo, versao\.current\)/);
  assert.match(s, /e\.codigo === 'config-mudou'/);
  /*
   * Desde o D14 nada publica sozinho (era o "cada tecla publica"): a falha
   * deixa o rascunho guardado e o Publicar à mão. E o conflito oferece pôr o
   * rascunho por cima da versão nova (revisão do consultor no D0.5).
   */
  assert.ok(!/const ESPERAS = \[/.test(s), 'o salvamento automático voltou');
  assert.match(s, />\s*\{publishing \? 'Publicando…' : 'Publicar na TV'\}/);
  // Desde o #232 pergunta antes, dizendo o que some; a versão nova é relida e usada.
  assert.match(s, /async function publicarPorCima\(\) \{\s*try \{\s*const r = await deviceConfig\.ler\(device\.id\);[\s\S]{0,1600}versao\.current = \(r && r\.versao\) \|\| 0;/);
  assert.match(s, />Publicar o meu por cima</);
  for (const arq of ['web/src/lib/publicar.js', 'web/src/lib/rodar.js']) {
    const f = fs.readFileSync(path.join(RAIZ, arq), 'utf8');
    assert.ok(!/catch \(e\) \{ \/\* tela sem config ainda \*\/ \}/.test(f), arq + ' voltou a engolir a falha de leitura');
  }
});

test('publicar não troca o nome da TV pelo nome do cabeçalho', () => {
  /*
   * settings.nome virou o nome da EMPRESA no cabeçalho (item 39), e o PUT da
   * config gravava esse valor como nome da TV: "Refeitório" virava
   * "Metalúrgica Andrade" na primeira publicação.
   */
  const s = fs.readFileSync(path.join(RAIZ, 'server/routes/telas.js'), 'utf8');
  assert.ok(!/setDeviceConfig\(id, JSON\.stringify\(cfg\), name\)/.test(s));
  assert.ok(!/setDeviceConfig\(id, JSON\.stringify\(cfg\), cfg\.settings\.nome \|\| device\.name\)/.test(s));
  assert.equal((s.match(/setDeviceConfig\(id, JSON\.stringify\(cfg\), device\.name \|\| cfg\.settings\.nome(, comVersao)?\)/g) || []).length, 2);
});

test('comparar e gravar é um UPDATE só: a versão velha não grava nem chegando ao mesmo tempo', async () => {
  const db = require('../server/db-sqlite.js');
  const { tenantId } = await db.createAccount('cas' + Date.now() + '@teste.local', 'x', 'Loja', 'Dono');
  const id = 'dev_cas_' + Date.now();
  await db.createDevice(id, 'C' + Date.now().toString(36).slice(-5).toUpperCase(), 'tok_' + Date.now());
  if (db.claimDevice) await db.claimDevice(id, tenantId, 'TV');
  const v1 = await db.setDeviceConfig(id, '{"a":1}', 'TV');
  await new Promise((r) => setTimeout(r, 3));
  const v2 = await db.setDeviceConfig(id, '{"a":2}', 'TV', v1);
  assert.ok(v2, 'com a versão certa, grava');
  assert.equal(await db.setDeviceConfig(id, '{"a":3}', 'TV', v1), null, 'com a versão velha, não grava');
});
