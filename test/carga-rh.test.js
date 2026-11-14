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

/* ---------------- O vigia da página (js/vigia.js) ---------------- */

const V = require('../js/vigia.js');
const MIN = 60 * 1000;
const HORA = 60 * MIN;

test('vigia: zona que passou da hora é cutucada; parada de novo logo depois, a página recarrega', () => {
  const agora = 10 * HORA;
  const base = { agora, desde: agora - HORA, pulsoOk: agora - 10000, hora: 14, ultimaRecarga: 0 };
  // Dentro da hora (ou atrasada menos de 2 min): nada.
  assert.equal(V.decidir(Object.assign({}, base, { zonas: [{ devido: agora + 5000 }] })).acao, '');
  assert.equal(V.decidir(Object.assign({}, base, { zonas: [{ devido: agora - MIN }] })).acao, '');
  // 3 min atrasada: cutuca a zona (a de índice 1).
  const d = V.decidir(Object.assign({}, base, { zonas: [{ devido: agora + 1000 }, { devido: agora - 3 * MIN }] }));
  assert.deepEqual(d, { acao: 'cutucar', motivo: 'zona-parada', zona: 1 });
  // Cutucada há 5 min e parada de novo: recarrega.
  assert.equal(V.decidir(Object.assign({}, base, { zonas: [{ devido: agora - 3 * MIN, cutucadaEm: agora - 5 * MIN }] })).acao, 'recarregar');
  // ...mas não sem servidor (numa TV sem service worker seria a página de erro na parede): só cutuca de novo depois.
  assert.equal(V.decidir(Object.assign({}, base, { pulsoOk: agora - 5 * MIN, zonas: [{ devido: agora - 3 * MIN, cutucadaEm: agora - 5 * MIN }] })).acao, '');
  // ...e nunca duas recargas do vigia em menos de 30 min.
  assert.equal(V.decidir(Object.assign({}, base, { ultimaRecarga: agora - 10 * MIN, zonas: [{ devido: agora - 3 * MIN, cutucadaEm: agora - 5 * MIN }] })).acao, '');
});

test('vigia: a recarga da madrugada é uma vez, depois de 20 h ligada, entre 3h e 5h e com o servidor respondendo', () => {
  const agora = 100 * HORA;
  const base = { agora, desde: agora - 21 * HORA, pulsoOk: agora - 10000, ultimaRecarga: 0, zonas: [] };
  assert.equal(V.decidir(Object.assign({}, base, { hora: 3 })).motivo, 'madrugada');
  assert.equal(V.decidir(Object.assign({}, base, { hora: 4 })).acao, 'recarregar');
  for (const h of [2, 5, 9, 14, 23]) assert.equal(V.decidir(Object.assign({}, base, { hora: h })).acao, '', 'recarregou às ' + h + 'h');
  assert.equal(V.decidir(Object.assign({}, base, { hora: 3, desde: agora - 5 * HORA })).acao, '', 'recarregou ligada há 5 h');
  assert.equal(V.decidir(Object.assign({}, base, { hora: 3, pulsoOk: 0 })).acao, '', 'recarregou sem servidor');
  // Recarregou às 3h05: às 3h40 a página é nova (desde) — e a marca segura de qualquer jeito.
  assert.equal(V.decidir(Object.assign({}, base, { hora: 3, ultimaRecarga: agora - 20 * MIN })).acao, '');
});

test('vigia ligado: cutuca a zona de verdade, grava a marca da recarga e recarrega', () => {
  V._zerar();
  let t = 50 * HORA;
  const guardado = {};
  const armazem = { getItem: (k) => (k in guardado ? guardado[k] : null), setItem: (k, v) => { guardado[k] = v; } };
  const recargas = [];
  let cutucadas = 0;
  const z = V.zona(() => { cutucadas++; });
  const vig = V.ligar({ semRelogio: true, agora: () => t, hora: () => 14, armazem, recarregar: (m) => recargas.push(m), avisar: () => {} });
  V.marcarPulso(t);
  z.devido(t + 6000);
  assert.equal(vig.olhar().acao, '');
  t += 4 * MIN; V.marcarPulso(t);
  assert.equal(vig.olhar().acao, 'cutucar');
  assert.equal(cutucadas, 1);
  // A zona não marcou relógio novo (continua parada): 3 min depois, ainda nada (devido zerado no cutucão)...
  z.devido(t + 6000);
  t += 4 * MIN; V.marcarPulso(t);
  assert.equal(vig.olhar().acao, 'recarregar', 'parou de novo logo depois do cutucão e não recarregou');
  assert.deepEqual(recargas, ['zona-parada']);
  assert.equal(Number(guardado['mt.vigia']), t, 'a marca contra o laço não foi gravada');
  // A zona que saiu (stop) não é mais vigiada.
  z.parar();
  t += 60 * MIN; V.marcarPulso(t);
  assert.equal(vig.olhar().acao, '');
  V._zerar();
});

test('vigia: o player registra cada zona com rodízio, avisa a cada relógio, sai no stop; o pulso marca o servidor; e vai no pacote da TV', () => {
  const fs2 = require('node:fs');
  const path2 = require('node:path');
  const raiz = path2.join(__dirname, '..');
  const player = fs2.readFileSync(path2.join(raiz, 'js/player.js'), 'utf8');
  assert.match(player, /const vig = global\.MTVigia && !estatica \? MTVigia\.zona\(/);
  assert.match(player, /timer = setTimeout\(advance, Math\.max\(0, seconds\) \* 1000\);\s*\n\s*if \(vig\) vig\.devido\(/);
  assert.match(player, /stopped = true; clearTimeout\(timer\);\s*\n\s*if \(vig\) vig\.parar\(\);/);
  assert.match(player, /MTVigia\.ligar\(\{ hora: /);
  assert.match(fs2.readFileSync(path2.join(raiz, 'js/cloud.js'), 'utf8'), /MTVigia\.marcarPulso\(\)/);
  const html = fs2.readFileSync(path2.join(raiz, 'player.html'), 'utf8');
  assert.ok(html.indexOf('js/vigia.js') > 0 && html.indexOf('js/vigia.js') < html.indexOf('js/cloud.js'), 'o vigia precisa subir antes do cloud.js e do player.js');
  const acorn = (() => { try { return require('acorn'); } catch (e) { return null; } })();
  if (acorn) acorn.parse(fs2.readFileSync(path2.join(raiz, 'js/vigia.js'), 'utf8'), { ecmaVersion: 5 });
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

/* ---------------- A TV não traz a programação do banco a cada pulso ---------------- */

test('pulso, som, passe, SSE e as listas da TV leem a TV SEM a programação; a config e o "ver a tela" leem com ela', () => {
  const telas = fs.readFileSync(path.join(RAIZ, 'server/routes/telas.js'), 'utf8');
  const m = /const SEM_PROGRAMACAO = new Set\(\[([^\]]+)\]\)/.exec(telas);
  assert.ok(m, 'sumiu a lista das rotas leves');
  const leves = m[1].split(',').map((s) => s.trim().replace(/'/g, ''));
  assert.deepEqual(leves.sort(), ['audio-estado', 'birthdays', 'events', 'exibicoes', 'heartbeat', 'kpis', 'passe', 'planilhas']);
  for (const r of ['config', 'estado', '']) assert.ok(!leves.includes(r), r + ' lê a programação e não pode vir sem ela');
  assert.match(telas, /SEM_PROGRAMACAO\.has\(sub\) \? await db\.getDeviceLeve\(id\) : await db\.getDevice\(id\)/);
  // Cada rota leve não pode ler device.config (ela não vem).
  for (const r of leves) {
    const i = telas.indexOf("sub === '" + r + "'");
    if (i < 0) continue;
    const fim = telas.indexOf("if (req.method === '", i + 10);
    assert.ok(!/device\.config/.test(telas.slice(i, fim > 0 ? fim : i + 4000)), 'a rota ' + r + ' lê device.config');
  }
  assert.match(fs.readFileSync(path.join(RAIZ, 'server/routes/senha.js'), 'utf8'), /db\.getDeviceLeve \? await db\.getDeviceLeve\(id\)/);
});

test('getDeviceLeve (SQLite): tudo da TV menos a programação, e has_config diz se ela existe', async (t) => {
  const dados = fs.mkdtempSync(path.join(os.tmpdir(), 'mt-leve-'));
  const antes = { DATA_DIR: process.env.DATA_DIR, DATABASE_URL: process.env.DATABASE_URL };
  process.env.DATA_DIR = dados; process.env.DATABASE_URL = '';
  t.after(() => { Object.assign(process.env, antes); try { fs.rmSync(dados, { recursive: true, force: true }); } catch (e) { /* segura */ } });
  const db = require('../server/db-sqlite.js');
  if (db.init) await db.init();
  await db.createDevice('dev_leve', 'ABC123', 'tok');
  const vazia = await db.getDeviceLeve('dev_leve');
  assert.equal(vazia.device_token, 'tok');
  assert.ok(!('config' in vazia), 'a programação veio na leitura leve');
  assert.equal(Number(vazia.has_config), 0);
  await db.setDeviceConfig('dev_leve', JSON.stringify({ settings: { nome: 'x' }, zonas: {} }), 'TV');
  const cheia = await db.getDeviceLeve('dev_leve');
  assert.equal(Number(cheia.has_config), 1);
  assert.equal(cheia.updated_at, (await db.getDevice('dev_leve')).updated_at);
  assert.equal(await db.getDeviceLeve('dev_nao'), null);
});

test('a senha da TV continua recusando token errado', async () => {
  const { rota, telas, respostas } = rotaDaSenha(2);
  await rota({ method: 'GET', headers: { 'x-device-token': 'errado' } }, {}, ['api', 'devices', telas[0].id, 'senha'], {}, null);
  assert.equal(respostas[0].status, 403);
});
