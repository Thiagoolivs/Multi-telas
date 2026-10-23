/*
 * Produção sem Asaas não dá o produto de graça.
 *
 * Sem ASAAS_API_KEY o modo de cobrança é 'dev', e o modo dev tinha um
 * checkout de mentira que ativava o plano pago na hora (`dev-activate`) e um
 * pacote de criações que creditava sem fatura. Isso existe para a máquina e
 * a suíte. Em produção, bastava a chave faltar para qualquer dono virar Pro
 * com um clique — achado no teste de uso de 23/10 (EXECUTOR D0.1).
 *
 * Os testes sobem o servidor de verdade duas vezes: uma "no Railway" (com
 * RAILWAY_ENVIRONMENT_NAME, como o Railway define) e outra na máquina.
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const http = require('node:http');
const path = require('node:path');
const { spawn } = require('node:child_process');

const RAIZ = path.join(__dirname, '..');

/* ---------- a regra, sem servidor ---------- */

test('a simulação só existe fora de produção, ou quando pedida com todas as letras', () => {
  const antes = { ...process.env };
  const limpar = () => {
    for (const k of ['RAILWAY_ENVIRONMENT', 'RAILWAY_ENVIRONMENT_NAME', 'RAILWAY_PROJECT_ID', 'NODE_ENV', 'MT_COBRANCA_SIMULADA']) delete process.env[k];
  };
  try {
    delete require.cache[require.resolve('../server/billing.js')];
    delete process.env.ASAAS_API_KEY;
    const billing = require('../server/billing.js');
    assert.equal(billing.mode(), 'dev');

    limpar();
    assert.equal(billing.simulacaoPermitida(), true, 'na máquina e na suíte, simula');

    limpar(); process.env.RAILWAY_ENVIRONMENT_NAME = 'production';
    assert.equal(billing.emProducao(), true);
    assert.equal(billing.simulacaoPermitida(), false, 'no Railway sem chave, não simula');

    limpar(); process.env.RAILWAY_PROJECT_ID = 'qualquer';
    assert.equal(billing.simulacaoPermitida(), false);

    limpar(); process.env.RAILWAY_ENVIRONMENT_NAME = 'production'; process.env.MT_COBRANCA_SIMULADA = '1';
    assert.equal(billing.simulacaoPermitida(), true, 'demonstração explícita');
  } finally {
    for (const k of Object.keys(process.env)) if (!(k in antes)) delete process.env[k];
    Object.assign(process.env, antes);
    delete require.cache[require.resolve('../server/billing.js')];
  }
});

/* ---------- de ponta a ponta ---------- */

function cliente(porta) {
  return function pedir(caminho, o = {}) {
    return new Promise((resolve, reject) => {
      const req = http.request({ host: '127.0.0.1', port: porta, path: caminho, method: o.method || 'GET',
        headers: { ...(o.body ? { 'Content-Type': 'application/json' } : {}), ...(o.cookie ? { Cookie: o.cookie } : {}) } }, (res) => {
        let corpo = '';
        res.on('data', (c) => { corpo += c; });
        res.on('end', () => {
          let json = null; try { json = JSON.parse(corpo); } catch (e) { json = null; }
          resolve({ status: res.statusCode, json, cookies: [].concat(res.headers['set-cookie'] || []) });
        });
      });
      req.on('error', reject);
      req.setTimeout(15000, () => req.destroy(new Error('a rota ' + caminho + ' não respondeu')));
      if (o.body) req.write(JSON.stringify(o.body));
      req.end();
    });
  };
}
const cookieDe = (r) => r.cookies.map((c) => c.split(';')[0]).filter((c) => !c.endsWith('=')).join('; ');

async function subir(t, envExtra) {
  const porta = 4180 + Math.floor(Math.random() * 400);
  const dados = fs.mkdtempSync(path.join(os.tmpdir(), 'mt-cobranca-'));
  const env = { ...process.env, PORT: String(porta), STORAGE: 'local', SKIP_VERIFY: '1', DATABASE_URL: '', DATA_DIR: dados, AI_PROVIDER: 'dev', ASAAS_API_KEY: '', ...envExtra };
  for (const k of ['RAILWAY_ENVIRONMENT', 'RAILWAY_ENVIRONMENT_NAME', 'RAILWAY_PROJECT_ID', 'NODE_ENV', 'MT_COBRANCA_SIMULADA']) if (!(k in envExtra)) delete env[k];
  const servidor = spawn(process.execPath, ['server.js'], { cwd: RAIZ, stdio: 'ignore', env });
  t.after(() => { servidor.kill(); try { fs.rmSync(dados, { recursive: true, force: true }); } catch (e) { /* o Windows segura o arquivo */ } });
  const pedir = cliente(porta);
  let ok = false;
  for (let i = 0; i < 60 && !ok; i++) { try { await pedir('/tv'); ok = true; } catch (e) { await new Promise((r) => setTimeout(r, 250)); } }
  assert.ok(ok, 'o servidor de teste não subiu');
  const conta = await pedir('/api/auth/signup', { method: 'POST', body: { email: 'dono' + Date.now() + '@teste.local', password: 'senha-de-teste-123', name: 'Loja', aceite: true } });
  return { pedir, cookie: cookieDe(conta) };
}

test('no Railway sem Asaas: nada de plano pago nem pacote de graça', async (t) => {
  const { pedir, cookie } = await subir(t, { RAILWAY_ENVIRONMENT_NAME: 'production' });

  const ativar = await pedir('/api/billing/dev-activate', { method: 'POST', cookie, body: { plan: 'pro' } });
  assert.notEqual(ativar.status, 200, 'o atalho de ativar não existe em produção');

  const checkout = await pedir('/api/billing/checkout', { method: 'POST', cookie, body: { plan: 'pro' } });
  assert.equal(checkout.status, 503);
  assert.match(checkout.json.error, /Suporte/, 'a frase diz o que fazer');

  const pacote = await pedir('/api/billing/pacote', { method: 'POST', cookie, body: { pacote: 'p25' } });
  assert.equal(pacote.status, 503);

  const estado = (await pedir('/api/billing', { cookie })).json;
  assert.equal(estado.mode, 'indisponivel', 'o painel sabe que a compra está fechada');
  assert.notEqual(estado.plan.id, 'pro', 'a conta continua no plano em que estava');
});

test('na máquina sem Asaas: a simulação continua testável', async (t) => {
  const { pedir, cookie } = await subir(t, {});
  const ativar = await pedir('/api/billing/dev-activate', { method: 'POST', cookie, body: { plan: 'pro' } });
  assert.equal(ativar.status, 200);
  assert.equal((await pedir('/api/billing', { cookie })).json.mode, 'dev');
});
