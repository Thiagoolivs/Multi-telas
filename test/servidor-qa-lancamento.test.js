/*
 * O servidor no QA de lançamento (03/11), fora das telas:
 *
 *   - o IP do cliente só vem do X-Forwarded-For atrás de proxy de confiança
 *     (Railway: o ÚLTIMO da lista), para ninguém pular os limites por IP;
 *   - CSRF: pedido que muda estado com o cookie da sessão, vindo de outro
 *     site, é recusado (sem Origin e TV com token passam);
 *   - o mural pede aprovação antes de a foto do público ir para a TV;
 *   - indicadores: "1,234.56" lido certo (ou recusado com aviso), o formato
 *     simples não apaga meta e unidade, "menor é melhor", o 429 com a regra
 *     de verdade;
 *   - o selo do plano sai das TVs abertas na hora em que a conta assina;
 *   - o clima que não respondeu não vira "27°" na peça.
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const http = require('node:http');
const path = require('node:path');
const { spawn } = require('node:child_process');
const security = require('../server/security');
const K = require('../server/kpis');

const RAIZ = path.join(__dirname, '..');
const ler = (f) => fs.readFileSync(path.join(RAIZ, f), 'utf8');
const PORTA = 7700 + Math.floor(Math.random() * 90);
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');

function pedir(caminho, o = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port: PORTA, path: caminho, method: o.method || 'GET',
      headers: Object.assign({}, o.json ? { 'Content-Type': 'application/json' } : {}, o.cookie ? { Cookie: o.cookie } : {}, o.headers || {}) }, (res) => {
      let txt = '';
      res.on('data', (c) => { txt += c; });
      res.on('end', () => { let json = null; try { json = JSON.parse(txt); } catch (e) { json = null; } resolve({ status: res.statusCode, json, txt, headers: res.headers, cookies: [].concat(res.headers['set-cookie'] || []) }); });
    });
    req.on('error', reject);
    req.setTimeout(30000, () => req.destroy(new Error('a rota ' + caminho + ' não respondeu')));
    if (o.json) req.write(JSON.stringify(o.json));
    if (o.bytes) req.write(o.bytes);
    req.end();
  });
}
const jarra = (r) => r.cookies.map((x) => x.split(';')[0]).filter((x) => !x.endsWith('=')).join('; ');

/* ---------------- regras puras ---------------- */

test('o IP do cliente: o cabeçalho só vale atrás de proxy de confiança, e é o último da lista', (t) => {
  const antes = { TRUST_PROXY: process.env.TRUST_PROXY, RAILWAY_ENVIRONMENT: process.env.RAILWAY_ENVIRONMENT };
  t.after(() => { for (const [k, v] of Object.entries(antes)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; } });
  const req = (xff) => ({ headers: xff ? { 'x-forwarded-for': xff } : {}, socket: { remoteAddress: '10.0.0.9' } });
  delete process.env.TRUST_PROXY; delete process.env.RAILWAY_ENVIRONMENT;
  assert.equal(security.clientIp(req('1.2.3.4')), '10.0.0.9', 'sem proxy, o cabeçalho inventado valeu');
  process.env.RAILWAY_ENVIRONMENT = 'production';
  // O cliente escreveu "1.2.3.4"; a borda do Railway acrescentou quem falou com ela.
  assert.equal(security.clientIp(req('1.2.3.4, 198.51.100.7')), '198.51.100.7');
  assert.equal(security.clientIp(req('198.51.100.7')), '198.51.100.7');
  assert.equal(security.clientIp(req('')), '10.0.0.9');
  process.env.TRUST_PROXY = '2';
  assert.equal(security.clientIp(req('1.2.3.4, 198.51.100.7, 172.16.0.1')), '198.51.100.7', 'com dois proxies, o penúltimo');
  process.env.TRUST_PROXY = '0';
  assert.equal(security.clientIp(req('1.2.3.4, 198.51.100.7')), '10.0.0.9', 'TRUST_PROXY=0 desliga mesmo no Railway');
  assert.equal(security.esperaEmPalavras(45), '45 segundos');
  assert.equal(security.esperaEmPalavras(61), '2 minutos');
  assert.equal(security.esperaEmPalavras(60), '1 minuto');
});

test('CSRF: Origin de outro site é recusado; o mesmo site, os da casa e quem não manda Origin passam', () => {
  const r = (method, origin, host) => ({ method, headers: Object.assign({ host: host || 'app.multitelas.net.br' }, origin == null ? {} : { origin }) });
  const daCasa = (h) => /(^|\.)multitelas\.net\.br$/.test(h);
  assert.equal(security.origemDeFora(r('POST', 'https://malvado.example'), daCasa), true);
  assert.equal(security.origemDeFora(r('POST', 'null'), daCasa), true, 'Origin "null" conta como outro site');
  assert.equal(security.origemDeFora(r('DELETE', 'https://app.multitelas.net.br'), daCasa), false);
  assert.equal(security.origemDeFora(r('POST', 'https://multitelas.net.br'), daCasa), false, 'a landing é da casa');
  assert.equal(security.origemDeFora(r('POST', 'http://localhost:8080', 'localhost:8080'), () => false), false, 'o próprio host do pedido');
  assert.equal(security.origemDeFora(r('POST', null), daCasa), false, 'sem Origin (curl, ERP, webhook) passa');
  assert.equal(security.origemDeFora(r('GET', 'https://malvado.example'), daCasa), false, 'leitura não muda estado');
});

test('indicadores: padrão americano, formato ambíguo recusado com aviso, e "menor é melhor"', () => {
  assert.equal(K.numero('1,234.56'), 1234.56, '"1,234.56" virava 1,23456');
  assert.equal(K.numero('1,234,567'), 1234567);
  assert.equal(K.numero('1.234,56'), 1234.56);
  assert.equal(K.numero('1.2.3'), null);
  const r = K.daEntradaComAvisos({ indicadores: [{ chave: 'a', valor: '1,234.56' }, { chave: 'b', valor: '12.34,5' }, { chave: 'c', valor: 3 }] });
  assert.deepEqual(r.lista.map((i) => [i.chave, i.valor]), [['a', 1234.56], ['c', 3]]);
  assert.match(r.avisos.find((x) => x.chave === 'a').aviso, /padrão americano/);
  assert.match(r.avisos.find((x) => x.chave === 'b').aviso, /^ignorado: .*sem adivinhar/);
  assert.equal(K.daEntradaComAvisos(Array.from({ length: 52 }, (_, i) => ({ chave: 'k' + i, valor: i }))).avisos.length, 2, '"só os 50 primeiros" sem dizer');
  assert.equal(K.sentidoDe({ nome: 'Refugo' }), 'menor');
  assert.equal(K.sentidoDe({ nome: 'Dias sem acidente' }), 'maior');
  assert.equal(K.sentidoDe({ nome: 'Refugo', sentido: 'maior' }), 'maior', 'o que o ERP disse vence o nome');
  assert.equal(K.normalizar({ chave: 'x', valor: 1, menorMelhor: true }).sentido, 'menor');
  // O formato simples só traz chave e valor: o resto não vem (e por isso não é apagado no banco).
  assert.deepEqual(Object.keys(K.daEntrada({ producao: 10250 })[0]).sort(), ['chave', 'nomeNovo', 'valor']);
});

test('o cartão KPI na TV: o número cabe, e o refugo acima da meta não comemora', () => {
  const R = ler('js/render.js');
  assert.match(R, /if \(cabe < 22\) v\.style\.fontSize = cabe\.toFixed\(2\) \+ 'cqw';/, 'o número de 5 dígitos voltou a sair cortado');
  assert.match(R, /'Acima da meta \(até ' \+ item\.meta\.texto \+ '\)'/);
  assert.match(R, /if \(out\.sentido === 'menor'\) out\.meta\.batida = k\.valor <= k\.meta;/);
  assert.match(ler('css/player.css'), /\.mt-kpi-value-wrap \{ display: flex; flex-wrap: wrap;/);
  assert.match(ler('server/routes/telas.js'), /sentido: kpis\.sentidoDe\(i\)/, 'a TV não recebe o sentido do indicador');
});

test('o clima que não respondeu não vira "27°" na parede', () => {
  const P = ler('js/peca-render.js');
  assert.match(P, /clima\.forEach\(\(el\) => \{ el\.style\.visibility = 'hidden'; \}\);/, 'o exemplo aparece antes de a temperatura chegar');
  assert.match(P, /\(\) => \{ clima\.forEach\(\(el\) => \{ el\.textContent = ''; \}\); \}\);/, 'a falha do clima deixa o "27°" do exemplo');
});

/* ---------------- o servidor de verdade ---------------- */

test('CSRF, mural com aprovação, indicadores sem perder a meta e o selo na hora', async (t) => {
  const dados = fs.mkdtempSync(path.join(os.tmpdir(), 'mt-qa-srv-'));
  const servidor = spawn(process.execPath, ['server.js'], {
    cwd: RAIZ, stdio: 'ignore',
    env: { ...process.env, PORT: String(PORTA), STORAGE: 'local', SKIP_VERIFY: '1', DATABASE_URL: '', DATA_DIR: dados, MEDIA_DIR: dados, AI_PROVIDER: 'dev', TRUST_PROXY: '', RAILWAY_ENVIRONMENT: '' },
  });
  t.after(() => { servidor.kill(); try { fs.rmSync(dados, { recursive: true, force: true }); } catch (e) { /* o Windows segura o arquivo */ } });
  let ok = false;
  for (let i = 0; i < 160 && !ok; i++) { try { await pedir('/tv'); ok = true; } catch (e) { await new Promise((r) => setTimeout(r, 250)); } }
  assert.ok(ok, 'o servidor de teste não subiu');
  const c = jarra(await pedir('/api/auth/signup', { method: 'POST', json: { email: 'qa' + Date.now() + '@teste.local', password: 'senha-de-teste-123', name: 'Plásticos Vale', aceite: true } }));

  /* --- CSRF. --- */
  const fora = await pedir('/api/auth/profile', { method: 'POST', cookie: c, json: { name: 'Hackeado' }, headers: { Origin: 'https://malvado.example' } });
  assert.equal(fora.status, 403, 'pedido de outro site mudou o perfil');
  assert.equal(fora.json.code, 'origem');
  assert.equal((await pedir('/api/auth/login', { method: 'POST', json: { email: 'x@y.z', password: 'nada' }, headers: { Origin: 'https://malvado.example' } })).status, 403, 'login vindo de outro site');
  assert.equal((await pedir('/api/auth/profile', { method: 'POST', cookie: c, json: { name: 'Gestora' }, headers: { Origin: 'http://127.0.0.1:' + PORTA } })).status, 200, 'o próprio painel foi barrado');
  assert.equal((await pedir('/api/auth/profile', { method: 'POST', cookie: c, json: { name: 'Gestora' } })).status, 200, 'cliente sem Origin foi barrado');
  assert.equal((await pedir('/api/auth/me', { cookie: c, headers: { Origin: 'https://malvado.example' } })).status, 200, 'leitura não é CSRF');

  /* --- A TV, pareada, com o tempo real aberto. --- */
  const tv = (await pedir('/api/devices', { method: 'POST', json: {}, headers: { Origin: 'https://malvado.example' } })).json;
  assert.ok(tv && tv.id, 'a TV (sem sessão) foi barrada pela checagem de origem');
  await pedir('/api/devices/' + tv.id + '/heartbeat', { method: 'POST', json: {}, headers: { 'x-device-token': tv.deviceToken } });
  assert.equal((await pedir('/api/pair', { method: 'POST', cookie: c, json: { code: tv.code } })).status, 200);
  const eventos = [];
  const sse = http.request({ host: '127.0.0.1', port: PORTA, path: '/api/devices/' + tv.id + '/events', headers: { 'x-device-token': tv.deviceToken } }, (res) => {
    res.on('data', (b) => eventos.push(String(b)));
  });
  sse.on('error', () => {});
  sse.end();
  t.after(() => sse.destroy());
  const esperar = async (re, ms) => { for (let i = 0; i < ms / 50; i++) { if (re.test(eventos.join(''))) return true; await new Promise((r) => setTimeout(r, 50)); } return false; };
  assert.ok(await esperar(/event: ready/, 4000), 'o tempo real da TV não abriu');

  /* --- O selo sai na hora em que a conta assina. --- */
  assert.equal((await pedir('/api/billing/dev-activate', { method: 'POST', cookie: c, json: { plan: 'pro' } })).status, 200);
  assert.ok(await esperar(/event: selo\ndata: \{"texto":""\}/, 4000), 'a TV aberta não soube do selo novo');
  assert.match(ler('js/cloud.js'), /es\.addEventListener\('selo'/, 'a TV não ouve o selo pelo tempo real');

  /* --- Mural: a foto do público espera aprovação. --- */
  const mural = (await pedir('/api/murais', { method: 'POST', cookie: c, json: { titulo: 'Fotos da fábrica' } })).json;
  assert.equal(mural.aprovar, true, 'o mural novo não pede aprovação');
  assert.match((await pedir('/m/' + mural.codigo)).txt, /assim que a organização aprovar/);
  const enviar = () => pedir('/api/mural/' + mural.codigo + '/foto?mime=image/png&autor=Ana', { method: 'POST', bytes: PNG, headers: { 'Content-Type': 'image/png' } });
  const env = await enviar();
  assert.equal(env.status, 201);
  assert.equal(env.json.pendente, true);
  const naTv = () => pedir('/api/mural/' + mural.codigo + '/fotos', { headers: { 'x-device-token': tv.deviceToken } });
  assert.equal((await naTv()).json.fotos.length, 0, 'a foto foi para a TV sem ninguém aprovar');
  const noPainel = (await pedir('/api/murais/' + mural.id + '/fotos', { cookie: c })).json.fotos;
  assert.equal(noPainel[0].pendente, true);
  assert.equal((await pedir('/api/murais/fotos/' + noPainel[0].id, { method: 'PUT', cookie: c, json: { oculta: false } })).status, 200);
  assert.equal((await naTv()).json.fotos.length, 1, 'aprovada, a foto não foi para a TV');
  assert.equal((await pedir('/api/murais/' + mural.id + '/fotos', { cookie: c })).json.fotos[0].pendente, false);
  // Quem quer o tempo real de um evento desliga a aprovação.
  await pedir('/api/murais/' + mural.id, { method: 'PUT', cookie: c, json: { titulo: 'Fotos da fábrica', aceitando: true, aprovar: false } });
  assert.equal((await enviar()).json.pendente, false);
  assert.equal((await naTv()).json.fotos.length, 2);
  // O PUT antigo do painel (sem `aprovar`) não muda a escolha.
  await pedir('/api/murais/' + mural.id, { method: 'PUT', cookie: c, json: { titulo: 'Fotos', aceitando: true } });
  assert.equal((await pedir('/api/murais', { cookie: c })).json.murais[0].aprovar, false);

  /* --- Indicadores. --- */
  const con = (await pedir('/api/kpis/conectores', { method: 'POST', cookie: c, json: { modo: 'push', nome: 'ERP' } })).json;
  const entrar = (json, txt) => pedir('/api/kpis/entrada', { method: 'POST', json, bytes: txt, headers: { authorization: 'Bearer ' + con.token, ...(txt ? { 'Content-Type': 'application/json' } : {}) } });
  const quebrado = await entrar(null, '{"indicadores": [');
  assert.equal(quebrado.status, 400);
  assert.match(quebrado.json.error, /JSON válido/);
  const r1 = await entrar({ indicadores: [
    { chave: 'producao', nome: 'Produção do dia', valor: 10300, unidade: 'pç', meta: 12000 },
    { chave: 'refugo', nome: 'Refugo', valor: '2,6', unidade: '%', meta: 2 },
    { chave: 'faturamento', nome: 'Faturamento', valor: '1,234.56', unidade: 'R$' },
  ] });
  assert.equal(r1.status, 200);
  assert.match(JSON.stringify(r1.json.avisos), /padrão americano/);
  // O ERP manda o formato simples depois: a meta, a unidade e o nome ficam.
  assert.equal((await entrar({ producao: 10250 })).status, 200);
  const ind = (await pedir('/api/kpis', { cookie: c })).json.indicadores;
  const prod = ind.find((i) => i.chave === 'producao');
  assert.deepEqual([prod.nome, prod.valor, prod.unidade, prod.meta, prod.anterior], ['Produção do dia', 10250, 'pç', 12000, 10300], 'o formato simples apagou o que estava configurado');
  assert.equal(ind.find((i) => i.chave === 'faturamento').valor, 1234.56);
  assert.equal(ind.find((i) => i.chave === 'refugo').sentido, 'menor');
  const tvKpis = (await pedir('/api/devices/' + tv.id + '/kpis', { headers: { 'x-device-token': tv.deviceToken } })).json.indicadores;
  assert.equal(tvKpis.find((i) => i.chave === 'refugo').sentido, 'menor', 'a TV comemoraria o refugo acima da meta');
  // O limite: a frase é a regra de verdade, e a espera é de segundos.
  let r;
  for (let i = 0; i < 25 && (!r || r.status !== 429); i++) r = await entrar({ producao: 10000 + i });
  assert.equal(r.status, 429);
  assert.match(r.json.error, /no máximo 20 por minuto\. Espere \d+ segundos/);
  assert.ok(Number(r.headers['retry-after']) <= 60, 'a espera passa de um minuto');
});
