/*
 * As regras de saída da cobrança DE PONTA A PONTA, com o servidor de
 * verdade em modo simulado (QA de lançamento, 03/11 — decisões do dono):
 *
 *   - /api/planos por frente, sem pôr as três lado a lado;
 *   - o painel no preço da frente da conta;
 *   - cancelar mantém o plano até o fim do período; depois, só a TV mais
 *     antiga fica no ar e as outras recebem "pausada" no pulso; reativando,
 *     voltam;
 *   - cancelar o anual exige aceitar a multa, que fica registrada.
 *
 * O "passar o tempo" é feito no banco (o arquivo SQLite do DATA_DIR), como
 * o QA fez à mão.
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const http = require('node:http');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { DatabaseSync } = require('node:sqlite');

const RAIZ = path.join(__dirname, '..');
const DIA = 864e5;

function cliente(porta) {
  return function pedir(caminho, o = {}) {
    return new Promise((resolve, reject) => {
      const corpo = o.body ? JSON.stringify(o.body) : '';
      // Com o tamanho, como o navegador manda: DELETE com corpo "chunked" o Node recusa.
      const headers = { ...(o.body ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(corpo) } : {}), ...(o.cookie ? { Cookie: o.cookie } : {}), ...(o.headers || {}) };
      const req = http.request({ host: '127.0.0.1', port: porta, path: caminho, method: o.method || 'GET', headers }, (res) => {
        let corpo = '';
        res.on('data', (c) => { corpo += c; });
        res.on('end', () => {
          let json = null; try { json = JSON.parse(corpo); } catch (e) { json = null; }
          resolve({ status: res.statusCode, json, cookies: [].concat(res.headers['set-cookie'] || []) });
        });
      });
      req.on('error', reject);
      req.setTimeout(15000, () => req.destroy(new Error('a rota ' + caminho + ' não respondeu')));
      if (corpo) req.write(corpo);
      req.end();
    });
  };
}
const cookieDe = (r) => r.cookies.map((c) => c.split(';')[0]).filter((c) => !c.endsWith('=')).join('; ');

async function subir(t) {
  // Faixa própria (outras suítes sobem servidor em 4180–5400).
  const porta = 6400 + Math.floor(Math.random() * 300);
  const dados = fs.mkdtempSync(path.join(os.tmpdir(), 'mt-saida-'));
  const env = { ...process.env, PORT: String(porta), STORAGE: 'local', SKIP_VERIFY: '1', DATABASE_URL: '', DATA_DIR: dados, AI_PROVIDER: 'dev', ASAAS_API_KEY: '' };
  for (const k of ['RAILWAY_ENVIRONMENT', 'RAILWAY_ENVIRONMENT_NAME', 'RAILWAY_PROJECT_ID', 'NODE_ENV', 'MT_COBRANCA_SIMULADA']) delete env[k];
  const servidor = spawn(process.execPath, ['server.js'], { cwd: RAIZ, stdio: 'ignore', env });
  let banco = null;
  t.after(() => { try { if (banco) banco.close(); } catch (e) { /* já fechado */ } servidor.kill(); try { fs.rmSync(dados, { recursive: true, force: true }); } catch (e) { /* o Windows segura o arquivo */ } });
  const pedir = cliente(porta);
  let ok = false;
  for (let i = 0; i < 160 && !ok; i++) { try { await pedir('/tv'); ok = true; } catch (e) { await new Promise((r) => setTimeout(r, 250)); } }
  assert.ok(ok, 'o servidor de teste não subiu');
  const sql = () => {
    if (!banco) { banco = new DatabaseSync(path.join(dados, 'multitelas.db')); banco.exec('PRAGMA busy_timeout = 5000;'); }
    return banco;
  };
  return { pedir, sql };
}

async function contaPaga(pedir, perfil) {
  const r = await pedir('/api/auth/signup', { method: 'POST', body: { email: 'dono' + Date.now() + Math.random().toString(36).slice(2, 6) + '@teste.local', password: 'senha-de-teste-123', name: 'Conta', aceite: true, perfil } });
  assert.equal(r.status < 300, true, 'cadastro: ' + JSON.stringify(r.json));
  const cookie = cookieDe(r);
  assert.equal((await pedir('/api/billing/dev-activate', { method: 'POST', cookie, body: { plan: 'pro' } })).status, 200);
  return cookie;
}

async function parear(pedir, cookie, nome) {
  const tv = (await pedir('/api/devices', { method: 'POST' })).json;
  const dt = { 'x-device-token': tv.deviceToken };
  await pedir('/api/devices/' + tv.id + '/heartbeat', { method: 'POST', headers: dt });
  const r = await pedir('/api/pair', { method: 'POST', cookie, body: { code: tv.code, name: nome } });
  assert.equal(r.status < 300, true, 'parear: ' + JSON.stringify(r.json));
  return { ...tv, pulso: async () => (await pedir('/api/devices/' + tv.id + '/heartbeat', { method: 'POST', headers: dt })).json };
}

test('/api/planos por frente: uma frente por vez; sem frente, Comércio e o "a partir de"', async (t) => {
  const { pedir } = await subir(t);
  const saude = (await pedir('/api/planos?frente=saude')).json;
  assert.equal(saude.frente, 'saude');
  assert.equal(saude.planos.find((p) => p.id === 'pro').precoTelaCents, 13900);
  assert.deepStrictEqual(saude.faixasAnual.slice(0, 3).map((f) => f.precoTelaCents), [11200, 10100, 9000]);
  assert.equal(saude.simulacao[1].mensal.totalCents, 2 * 13900);
  assert.equal(saude.apartirDeCents, undefined, 'a landing da Saúde não vê o preço de outra frente');
  assert.ok(!JSON.stringify(saude).includes('15900'), 'o preço de Empresas vazou na Saúde');
  const empresas = (await pedir('/api/planos?frente=empresas')).json;
  assert.equal(empresas.frente, 'empresa', 'o endereço da landing (empresas) vale');
  assert.equal(empresas.planos.find((p) => p.id === 'pro').precoTelaCents, 15900);
  const geral = (await pedir('/api/planos')).json;
  assert.equal(geral.frente, 'comercio');
  assert.equal(geral.planos.find((p) => p.id === 'pro').precoTelaCents, 7900);
  assert.equal(geral.apartirDeCents, 7900);
});

test('cancelar: plano até o fim do período; depois, só a TV mais antiga no ar; reativando, todas voltam', async (t) => {
  const { pedir, sql } = await subir(t);
  const cookie = await contaPaga(pedir, 'empresa');
  const primeira = await parear(pedir, cookie, 'Recepção');
  await new Promise((r) => setTimeout(r, 5));
  const segunda = await parear(pedir, cookie, 'Refeitório');

  // O painel no preço da frente da conta (Empresas, R$ 159).
  let b = (await pedir('/api/billing', { cookie })).json;
  assert.equal(b.frente, 'empresa');
  assert.equal(b.usage.mensalidadeCents, 2 * 15900);
  assert.equal(b.usage.proximaTelaCents, 15900);
  assert.equal(b.catalog.find((p) => p.id === 'pro').precoTelaCents, 15900);
  assert.equal(b.pausa, null);

  const cancelou = await pedir('/api/billing/assinatura', { method: 'DELETE', cookie });
  assert.equal(cancelou.status, 200, JSON.stringify(cancelou.json));
  assert.ok(cancelou.json.ate > Date.now() + 25 * DIA, 'o plano segue até o fim do período pago');
  b = (await pedir('/api/billing', { cookie })).json;
  assert.equal(b.plan.id, 'pro', 'cancelar não rebaixa na hora');
  assert.equal(b.status, 'cancelando');
  assert.equal((await primeira.pulso()).pausada, false);
  assert.equal((await segunda.pulso()).pausada, false);

  // O período pago acabou (e a conta tem mais que os 14 dias do teste, como quem pagou um mês).
  sql().prepare("UPDATE tenants SET plan_renews_at = ?, created_at = ? WHERE plan_status = 'cancelando'").run(Date.now() - 60 * 1000, Date.now() - 45 * DIA);
  b = (await pedir('/api/billing', { cookie })).json;
  assert.equal(b.plan.id, 'free', 'passado o fim, a leitura rebaixa');
  assert.equal(b.pausa.pausadas, 1);
  assert.deepStrictEqual(b.pausa.noAr, ['Recepção'], 'a mais antiga fica no ar');
  const p1 = await primeira.pulso();
  const p2 = await segunda.pulso();
  assert.equal(p1.pausada, false);
  assert.equal(p1.selo, true, 'a que fica no ar mostra o selo');
  assert.equal(p2.pausada, true);
  assert.match(p2.pausadaTexto, /Esta TV está pausada: reative o plano em app\.multitelas\.net\.br/);
  assert.ok(sql().prepare("SELECT 1 FROM devices WHERE id = ?").get(segunda.id), 'a TV pausada não some');

  // Reativou: as duas voltam no pulso seguinte.
  assert.equal((await pedir('/api/billing/dev-activate', { method: 'POST', cookie, body: { plan: 'pro' } })).status, 200);
  assert.equal((await segunda.pulso()).pausada, false);
  assert.equal((await primeira.pulso()).selo, false);
});

test('cancelar o anual exige aceitar a multa, que fica registrada, e o contrato sai', async (t) => {
  const { pedir, sql } = await subir(t);
  const cookie = await contaPaga(pedir, 'comercio');
  await parear(pedir, cookie, 'Caixa');
  sql().prepare("UPDATE tenants SET plan_contrato = 'anual', contrato_desde = ? WHERE plan = 'pro'").run(Date.now() - 4 * 30 * DIA - DIA);

  const b = (await pedir('/api/billing', { cookie })).json;
  assert.equal(b.anual.multa.faltam, 8);
  const esperada = Math.round(0.3 * 6400 * 8);
  assert.equal(b.anual.multa.cents, esperada, '30% de 8 mensalidades de R$ 64 (Comércio, 1 tela)');

  const semAceite = await pedir('/api/billing/assinatura', { method: 'DELETE', cookie });
  assert.equal(semAceite.status, 409);
  assert.equal(semAceite.json.code, 'confirmar-multa');
  assert.equal(semAceite.json.multa.cents, esperada);
  assert.equal((await pedir('/api/billing', { cookie })).json.status, 'active', 'sem aceite, nada muda');

  const errado = await pedir('/api/billing/assinatura', { method: 'DELETE', cookie, body: { aceitoMultaCents: 1 } });
  assert.equal(errado.status, 409, 'o aceite é do valor que o servidor calcula');

  const ok = await pedir('/api/billing/assinatura', { method: 'DELETE', cookie, body: { aceitoMultaCents: esperada } });
  assert.equal(ok.status, 200);
  assert.ok(sql().prepare('SELECT 1 FROM eventos WHERE acao = ?').get('plano.multa.' + esperada), 'a multa devida ficou num evento da conta');
  const conta = sql().prepare("SELECT plan_contrato, contrato_desde, plan_status FROM tenants WHERE plan = 'pro'").get();
  assert.equal(conta.plan_contrato, null, 'quem assina de novo não herda o anual');
  assert.equal(conta.contrato_desde, null);
  assert.equal(conta.plan_status, 'cancelando');
});

test('excluir a conta cancela a assinatura no Asaas ANTES de apagar, e o diálogo avisa', () => {
  const s = fs.readFileSync(path.join(RAIZ, 'server.js'), 'utf8');
  const rota = s.indexOf("if (req.method === 'DELETE' && parts[2] === 'conta')");
  const cancela = s.indexOf('await billing.cancelarAssinatura(conta);', rota);
  const apaga = s.indexOf('await db.apagarTenant(sess.tenant_id);', rota);
  assert.ok(rota > 0 && cancela > rota && apaga > cancela, 'a assinatura tem que sair antes da conta');
  assert.match(s.slice(cancela, apaga), /return sendJson\(res, 502/, 'se o Asaas falhar, nada é apagado');
  const dialogo = fs.readFileSync(path.join(RAIZ, 'web', 'src', 'pages', 'SettingsPage.jsx'), 'utf8');
  assert.match(dialogo, /ela é cancelada no Asaas/);
  // E o diálogo do CPF/CNPJ não promete nota que o código não emite.
  const doc = fs.readFileSync(path.join(RAIZ, 'web', 'src', 'components', 'content', 'PedirDocumento.jsx'), 'utf8');
  assert.doesNotMatch(doc, /emitir a cobrança e a nota/);
});

test('a TV pausada: camada própria por cima, sem selo, e o estado chega pelo pulso', () => {
  const ler = (...p) => fs.readFileSync(path.join(RAIZ, ...p), 'utf8');
  assert.match(ler('js/cloud.js'), /typeof r\.pausada === 'boolean'/);
  assert.match(ler('js/cloud.js'), /new CustomEvent\('mt:pausada'/);
  assert.match(ler('js/player.js'), /document\.addEventListener\('mt:pausada'/);
  const css = ler('css/player.css');
  assert.match(css, /\.mt-fora-pausada \.mt-fora-pausa \{/);
  assert.match(css, /\.mt-tv-pausada \.mt-selo \{ display: none; \}/);
});
