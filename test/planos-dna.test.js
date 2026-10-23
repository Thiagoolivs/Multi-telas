/*
 * Planos: IA básica × integrada (EXECUTOR D22).
 *
 * Decisão do dono: Essencial (a IA básica, com telas e peças prontas) e Pro
 * (a IA integrada em tudo, R$ 179 por tela, quando a Fase 3 existir) — e
 * "nada vendido antes de existir". O plano pago de hoje passa a se chamar
 * Essencial sem trocar o id (as assinaturas guardam "conta|pro"); o Pro
 * aparece como EM BREVE e o servidor não deixa assinar.
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
const ler = (...p) => fs.readFileSync(path.join(RAIZ, ...p), 'utf8');
const plans = require('../server/plans.js');

test('o plano pago de hoje é o Essencial (mesmo id, mesmo preço); o Pro aparece e não se assina', () => {
  const ess = plans.PLANS.pro;
  assert.equal(ess.id, 'pro', 'trocar o id migraria as assinaturas do Asaas');
  assert.equal(ess.name, 'Essencial');
  assert.equal(ess.precoTelaCents, 14900, 'quem já paga não pode mudar de preço sem aviso');
  const pro = plans.PLANS.integrada;
  assert.equal(pro.name, 'Pro');
  assert.equal(pro.precoTelaCents, 17900);
  assert.equal(pro.emBreve, true);
  assert.ok(pro.vem.length >= 2);
  assert.deepEqual(plans.ORDER, ['free', 'pro', 'integrada', 'enterprise']);
  assert.equal(plans.assinavel('pro'), true);
  assert.equal(plans.assinavel('integrada'), false);
  assert.equal(plans.assinavel('free'), false);
  assert.ok(plans.catalog().some((p) => p.id === 'integrada' && p.emBreve));
});

test('o painel e a landing mostram o Pro como em breve, sem botão de assinar', () => {
  const b = ler('web/src/pages/BillingPage.jsx');
  assert.match(b, /const isUpgrade = !p\.emBreve && /);
  assert.match(b, /\{p\.emBreve \? \(\s*<Button variant="secondary" size="sm" className="w-full justify-center" onClick=\{\(\) => avisarQuandoLancar\(p\)\}>/);
  assert.doesNotMatch(b, /R\$ 149 por tela/, 'preço escrito à mão no painel');
  const l = ler('landing/index.html');
  // Revisão do consultor: explícito que ainda não está à venda, sem prazo, sem botão de pagar.
  assert.match(l, /Em breve: Pro<\/b> — ainda não disponível para assinar/);
  assert.match(ler('server/plans.js'), /'pro' = Essencial \(id histórico, não renomear: Asaas e cortesias\)/);
  assert.match(ler('web/src/components/content/QuizField.jsx'), /conferir é com você/);
  assert.match(ler('landing/landing.js'), /texto\('\[data-preco-pro\]', reais\(integrada\.precoTelaCents\)\)/);
  // Os e-mails e os avisos falam do plano que existe.
  assert.doesNotMatch(ler('server/lembretes.js'), /assine o Pro|Assinar o Pro/);
});

/* ---------------- servidor de verdade ---------------- */

const PORTA = 6400 + Math.floor(Math.random() * 90);
function pedir(caminho, o = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port: PORTA, path: caminho, method: o.method || 'GET',
      headers: { ...(o.json ? { 'Content-Type': 'application/json' } : {}), ...(o.cookie ? { Cookie: o.cookie } : {}) } }, (res) => {
      let corpo = '';
      res.on('data', (c) => { corpo += c; });
      res.on('end', () => { let json = null; try { json = JSON.parse(corpo); } catch (e) { json = null; } resolve({ status: res.statusCode, json, cookies: [].concat(res.headers['set-cookie'] || []) }); });
    });
    req.on('error', reject);
    req.setTimeout(30000, () => req.destroy(new Error('a rota ' + caminho + ' não respondeu')));
    if (o.json) req.write(JSON.stringify(o.json));
    req.end();
  });
}
const cookieDe = (r) => r.cookies.map((c) => c.split(';')[0]).filter((c) => !c.endsWith('=')).join('; ');

test('o checkout recusa o Pro em breve; "me avise" só registra o interesse', async (t) => {
  const dados = fs.mkdtempSync(path.join(os.tmpdir(), 'mt-d22-'));
  const servidor = spawn(process.execPath, ['server.js'], {
    cwd: RAIZ, stdio: 'ignore',
    env: { ...process.env, PORT: String(PORTA), STORAGE: 'local', SKIP_VERIFY: '1', DATABASE_URL: '', DATA_DIR: dados, MEDIA_DIR: dados, AI_PROVIDER: 'dev' },
  });
  t.after(() => { servidor.kill(); try { fs.rmSync(dados, { recursive: true, force: true }); } catch (e) { /* o Windows segura o arquivo */ } });
  let ok = false;
  for (let i = 0; i < 160 && !ok; i++) { try { await pedir('/tv'); ok = true; } catch (e) { await new Promise((r) => setTimeout(r, 250)); } }
  assert.ok(ok, 'o servidor de teste não subiu');
  const c = cookieDe(await pedir('/api/auth/signup', { method: 'POST', json: { email: 'd22' + Date.now() + '@teste.local', password: 'senha-de-teste-123', name: 'Loja', aceite: true } }));

  const pro = await pedir('/api/billing/checkout', { method: 'POST', cookie: c, json: { plan: 'integrada' } });
  assert.equal(pro.status, 400);
  assert.equal(pro.json.code, 'plano-em-breve');
  const dev = await pedir('/api/billing/dev-activate', { method: 'POST', cookie: c, json: { plan: 'integrada' } });
  assert.ok(dev.status === 400 || dev.status === 404, 'dev-activate ativou o plano em breve: ' + dev.status);

  assert.equal((await pedir('/api/billing/interesse', { method: 'POST', cookie: c, json: { plan: 'integrada' } })).status, 200);
  assert.equal((await pedir('/api/billing/interesse', { method: 'POST', cookie: c, json: { plan: 'pro' } })).status, 400, 'interesse só vale para plano em breve');
  const conta = (await pedir('/api/billing', { cookie: c })).json;
  assert.equal(conta.plan.id, 'free', 'o interesse mudou o plano da conta');
  assert.ok(conta.catalog.some((p) => p.id === 'integrada' && p.emBreve));
  assert.equal((await pedir('/api/planos')).json.planos.find((p) => p.id === 'pro').name, 'Essencial');
});
