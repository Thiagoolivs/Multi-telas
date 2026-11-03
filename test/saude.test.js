/*
 * /healthz e o aviso de "versão no ar" (server/saude.js). QA de 26/10: um
 * deploy falhou em silêncio e só foi visto porque alguém olhou.
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { spawn } = require('node:child_process');

const RAIZ = path.join(__dirname, '..');
const S = require('../server/saude.js');

test('verificar: 200 com o banco respondendo, 503 quando ele falha ou demora', async () => {
  assert.deepEqual(await S.verificar({ countDevices: async () => 0 }), { status: 200, corpo: { ok: true, banco: 'ok' } });
  assert.equal((await S.verificar({ countDevices: async () => { throw new Error('caiu'); } })).status, 503);
  const t0 = Date.now();
  const lento = await S.verificar({ countDevices: () => new Promise(() => {}) });
  assert.equal(lento.status, 503);
  assert.ok(Date.now() - t0 < 4500, 'o banco pendurado pendurou o healthcheck');
  assert.doesNotMatch(JSON.stringify(lento.corpo), /caiu|prazo|Error/, 'a resposta pública não conta o que aconteceu dentro');
});

test('versão: o commit curto do Railway, ou "local"', () => {
  assert.equal(S.versao({ RAILWAY_GIT_COMMIT_SHA: 'abcdef1234567' }), 'abcdef1');
  assert.equal(S.versao({}), 'local');
});

test('"versão no ar" só sai em produção e com o webhook; o texto diz versão, região e ambiente', async (t) => {
  const antes = globalThis.fetch;
  const enviados = [];
  globalThis.fetch = async (url, op) => { enviados.push({ url, corpo: JSON.parse(op.body) }); return { ok: true }; };
  t.after(() => { globalThis.fetch = antes; });
  assert.equal(await S.avisarNoAr({ ALERTA_WEBHOOK_URL: 'https://hook.exemplo/x' }), false, 'fora do Railway não avisa');
  assert.equal(await S.avisarNoAr({ RAILWAY_ENVIRONMENT: 'production' }), false, 'sem webhook não avisa');
  assert.equal(await S.avisarNoAr({ ALERTA_WEBHOOK_URL: 'https://hook.exemplo/x', RAILWAY_ENVIRONMENT: 'staging', RAILWAY_GIT_COMMIT_SHA: '1234567890', RAILWAY_REPLICA_REGION: 'us-east4' }), true);
  assert.equal(enviados.length, 1);
  assert.match(enviados[0].corpo.text, /no ar: versão 1234567 \(us-east4\) · ambiente staging/);
  // O Railway novo só define RAILWAY_ENVIRONMENT_NAME: também vale.
  assert.equal(await S.avisarNoAr({ ALERTA_WEBHOOK_URL: 'https://hook.exemplo/x', RAILWAY_ENVIRONMENT_NAME: 'production' }), true);
  assert.doesNotMatch(enviados[1].corpo.text, /ambiente/, 'produção não precisa dizer o ambiente');
  globalThis.fetch = async () => { throw new Error('rede'); };
  assert.equal(await S.avisarNoAr({ ALERTA_WEBHOOK_URL: 'https://hook.exemplo/x', RAILWAY_ENVIRONMENT: 'production' }), false, 'falha do aviso não sobe');
});

test('o Railway espera /healthz antes de trocar a versão', () => {
  const r = JSON.parse(fs.readFileSync(path.join(RAIZ, 'railway.json'), 'utf8'));
  assert.equal(r.deploy.healthcheckPath, '/healthz');
  assert.ok(r.deploy.healthcheckTimeout >= 60);
  assert.match(fs.readFileSync(path.join(RAIZ, 'server.js'), 'utf8'), /saude\.avisarNoAr\(\);/);
});

test('o servidor de verdade responde /healthz sem login', async () => {
  const PORTA = 7700 + Math.floor(Math.random() * 90);
  const srv = spawn(process.execPath, ['server.js'], { cwd: RAIZ, stdio: 'ignore',
    env: { ...process.env, PORT: String(PORTA), STORAGE: 'local', SKIP_VERIFY: '1', DATABASE_URL: '' } });
  const pedir = (c) => new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port: PORTA, path: c }, (res) => {
      let corpo = ''; res.on('data', (d) => { corpo += d; }); res.on('end', () => resolve({ status: res.statusCode, corpo, headers: res.headers }));
    });
    req.on('error', reject); req.setTimeout(8000, () => req.destroy(new Error('sem resposta'))); req.end();
  });
  try {
    let r = null;
    for (let i = 0; i < 60 && !r; i++) { try { r = await pedir('/healthz'); } catch (e) { await new Promise((x) => setTimeout(x, 250)); } }
    assert.equal(r.status, 200);
    assert.deepEqual(JSON.parse(r.corpo), { ok: true, banco: 'ok' });
    assert.equal(r.headers['cache-control'], 'no-store');
  } finally { srv.kill(); }
});
