/*
 * A conta grande de RH (teste de carga e de resistência, 14/11 —
 * docs/CAPACIDADE-E-TVBOX.md).
 *
 * O "MultiTelas RH" vende para empresa com 50 a 300 TVs numa conta só. O
 * teste de carga achou o que só aparece nesse tamanho: custo que cresce com
 * o quadrado do número de TVs da conta, e envio em lote que perdia TV sem
 * avisar.
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert');

/* ---------------- A senha: a pergunta de cada TV não lê a conta inteira ---------------- */

function rotaDaSenha(nTelas) {
  const telas = Array.from({ length: nTelas }, (_, i) => ({ id: 'dev_' + i, tenant_id: 'ten_rh', device_token: 'tok_' + i, grupo: '', expediente: null }));
  const contagem = { listDevices: 0, senhaChamadas: 0 };
  const db = {
    getDevice: async (id) => telas.find((t) => t.id === id) || null,
    listDevices: async () => { contagem.listDevices++; return telas; },
    senhaChamadas: async () => { contagem.senhaChamadas++; return []; },
  };
  const respostas = [];
  const ctx = {
    db,
    sendJson: (res, status, corpo) => { respostas.push({ status, corpo }); },
    readBody: () => {}, rateLimit: () => ({ ok: true }), broadcast: () => {}, subscribers: {},
    safeEqual: (a, b) => a === b,
    limites: { permitir: () => ({ ok: true }) },
  };
  const rota = require('../server/routes/senha.js')(ctx);
  return { rota, telas, contagem, respostas };
}

test('300 TVs perguntando a senha: a conta é lida uma vez por minuto, não 300', async () => {
  const { rota, telas, contagem, respostas } = rotaDaSenha(300);
  for (const t of telas) {
    const ok = await rota({ method: 'GET', headers: { 'x-device-token': t.device_token } }, {}, ['api', 'devices', t.id, 'senha'], {}, null);
    assert.equal(ok, true);
  }
  assert.equal(respostas.length, 300);
  assert.ok(respostas.every((r) => r.status === 200), 'alguma TV não recebeu a senha');
  assert.equal(contagem.listDevices, 1, 'cada pergunta de TV leu todas as TVs da conta (custo N²)');
  assert.equal(contagem.senhaChamadas, 300, 'a fila em si continua sendo lida a cada pergunta');
});

/* ---------------- O medidor do player: por TV, não por conta ---------------- */

test('a conta de 300 TVs saudáveis não aparece como "esbarrando"; a TV com defeito numa conta pequena aparece', () => {
  const limites = require('../server/limites.js');
  limites.zerar();
  // Uma TV saudável em 5 min: pulso e som a cada 30 s (20), senha a cada 60 s (5), indicadores, planilha, exibições e o passe.
  const SAUDAVEL = 28;
  for (let tv = 0; tv < 300; tv++) {
    for (let i = 0; i < SAUDAVEL; i++) assert.equal(limites.permitir('tela', 'ten_rh', 'dev_' + tv).ok, true);
  }
  assert.deepEqual(limites.excessosDaConta('ten_rh'), {}, 'a conta grande e saudável virou excesso na supervisão');

  // Dez TVs saudáveis e uma pedindo 40 vezes por minuto (200 em 5 min): é ela que aparece, e nada é bloqueado.
  for (let tv = 0; tv < 10; tv++) for (let i = 0; i < SAUDAVEL; i++) limites.permitir('tela', 'ten_loja', 'dev_ok' + tv);
  let bloqueou = false;
  for (let i = 0; i < 200; i++) if (!limites.permitir('tela', 'ten_loja', 'dev_ruim').ok) bloqueou = true;
  assert.equal(bloqueou, false, 'o medidor bloqueou o player');
  const e = limites.excessosDaConta('ten_loja');
  assert.ok(e.tela && e.tela.vezes > 0, 'a TV com defeito não apareceu');
  assert.equal(e.tela.tela, 'dev_ruim', 'a supervisão não diz qual TV');
  limites.zerar();
});

/* ---------------- O envio em lote da conta grande ---------------- */

const fs = require('node:fs');
const os = require('node:os');
const http = require('node:http');
const path = require('node:path');
const { spawn } = require('node:child_process');
const RAIZ = path.join(__dirname, '..');
// MT_TESTE_PORTA: a máquina que só pode usar certas portas escolhe qual.
const PORTA = Number(process.env.MT_TESTE_PORTA) || 6092;

function pedir(caminho, o = {}) {
  return new Promise((resolve, reject) => {
    const corpo = o.bruto != null ? Buffer.from(o.bruto) : o.json !== undefined ? Buffer.from(JSON.stringify(o.json)) : null;
    const headers = Object.assign({}, o.cookie ? { Cookie: o.cookie } : {}, corpo ? { 'Content-Type': 'application/json', 'Content-Length': corpo.length } : {});
    const req = http.request({ host: '127.0.0.1', port: PORTA, path: caminho, method: o.method || 'GET', headers }, (res) => {
      let d = '';
      res.on('data', (c) => { d += c; });
      res.on('end', () => { let json = null; try { json = JSON.parse(d); } catch (e) { /* não é JSON */ } resolve({ status: res.statusCode, json, headers: res.headers }); });
    });
    req.on('error', reject);
    if (corpo) req.write(corpo);
    req.end();
  });
}

test('servidor: o envio grande demais diz por quê (413), e o lote acima de 200 TVs é recusado inteiro', async (t) => {
  const dados = fs.mkdtempSync(path.join(os.tmpdir(), 'mt-carga-rh-'));
  const servidor = spawn(process.execPath, ['server.js'], {
    cwd: RAIZ, stdio: 'ignore',
    env: { ...process.env, PORT: String(PORTA), STORAGE: 'local', SKIP_VERIFY: '1', DATABASE_URL: '', DATA_DIR: dados, MEDIA_DIR: dados, AI_PROVIDER: 'dev', TRUST_PROXY: '', RAILWAY_ENVIRONMENT: '', MT_APK_REPO: 'desligado' },
  });
  t.after(() => { servidor.kill(); try { fs.rmSync(dados, { recursive: true, force: true }); } catch (e) { /* o Windows segura o arquivo */ } });
  let ok = false;
  for (let i = 0; i < 160 && !ok; i++) { try { ok = (await pedir('/healthz')).status === 200; } catch (e) { await new Promise((r) => setTimeout(r, 250)); } }
  assert.ok(ok, 'o servidor de teste não subiu');

  const r = await pedir('/api/auth/signup', { method: 'POST', json: { email: 'rh' + Date.now() + '@teste.local', password: 'senha-de-teste-123', name: 'Metalúrgica Alfa', aceite: true, perfil: 'empresa' } });
  const cookie = (r.headers['set-cookie'] || []).map((c) => c.split(';')[0]).join('; ');
  assert.ok(cookie, 'o cadastro não abriu sessão');

  // ~2,5 MB: 25 TVs com a programação de RH (~96 KB cada) num aviso rápido.
  const grande = await pedir('/api/lote', { method: 'POST', cookie, bruto: JSON.stringify({ itens: [{ id: 'dev_x', config: { lixo: 'x'.repeat(2.5e6) } }] }) });
  assert.equal(grande.status, 413, 'o corpo grande demais cortava a conexão (o painel dizia "sem conexão")');
  assert.equal(grande.json && grande.json.code, 'grande-demais');
  assert.match(grande.json.error, /grande demais/);

  // 201 TVs: nada vai, e a resposta diz o teto (antes: as 200 primeiras iam e o "ok" falava de todas).
  const itens = Array.from({ length: 201 }, (_, i) => ({ id: 'dev_' + i, config: { settings: {} } }));
  const muitas = await pedir('/api/lote', { method: 'POST', cookie, json: { itens, descricao: 'Aviso' } });
  assert.equal(muitas.status, 400);
  assert.equal(muitas.json.code, 'lote-grande');
  assert.equal(muitas.json.max, 200);

  // O servidor segue de pé e lendo corpo normal depois do grande.
  const depois = await pedir('/api/lote', { method: 'POST', cookie, json: { itens: [] } });
  assert.equal(depois.status, 400);
  assert.match(depois.json.error, /pelo menos uma TV/);
});

test('a senha da TV continua recusando token errado', async () => {
  const { rota, telas, respostas } = rotaDaSenha(2);
  await rota({ method: 'GET', headers: { 'x-device-token': 'errado' } }, {}, ['api', 'devices', telas[0].id, 'senha'], {}, null);
  assert.equal(respostas[0].status, 403);
});
