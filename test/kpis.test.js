/*
 * Os indicadores da empresa na TV (EXECUTOR D36).
 *
 * "Conexão configurável via endpoint também, para APIs como as do TOTVS
 * Protheus." PUSH: o sistema manda com um token. PULL: buscamos um endereço
 * JSON com a autenticação CIFRADA, sempre por server/site.js. Na TV, o
 * cartão KPI ao vivo: número, variação e meta.
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const http = require('node:http');
const path = require('node:path');
const { spawn, execFileSync } = require('node:child_process');

const RAIZ = path.join(__dirname, '..');
const ler = (f) => fs.readFileSync(path.join(RAIZ, f), 'utf8');
const K = require('../server/kpis');
const S = require('../server/segredo');
const site = require('../server/site');

test('o número como o ERP manda, a entrada do push e a resposta do pull pelo mapa', () => {
  assert.deepEqual(['R$ 1.234,56', '87%', '1.500', '1.5', 12.5, '-3,2', 'abc'].map(K.numero), [1234.56, 87, 1500, 1.5, 12.5, -3.2, null]);
  assert.deepEqual(K.daEntrada({ 'Vendas do dia': 'R$ 12.300,00', Pedidos: 42 }).map((i) => [i.chave, i.valor]), [['vendas-do-dia', 12300], ['pedidos', 42]]);
  assert.deepEqual(K.daEntrada({ indicadores: [{ chave: 'fat', nome: 'Faturamento', valor: 10, meta: 20, unidade: 'R$' }, { nome: 'sem valor' }] }),
    [{ chave: 'fat', nome: 'Faturamento', valor: 10, unidade: 'R$', meta: 20 }]);
  assert.equal(K.daEntrada(Array.from({ length: 80 }, (_, i) => ({ chave: 'k' + i, valor: i }))).length, K.MAX_INDICADORES);
  const protheus = { dados: { itens: [{ codigo: 'FAT', descricao: 'Faturamento', realizado: '1.500,50', meta: 2000 }, { codigo: 'PED', descricao: 'Pedidos', realizado: 31 }] } };
  assert.deepEqual(K.daResposta(protheus, { lista: 'dados.itens', chave: 'codigo', nome: 'descricao', valor: 'realizado', meta: 'meta' }).map((i) => [i.chave, i.valor, i.meta]),
    [['fat', 1500.5, 2000], ['ped', 31, null]]);
  assert.deepEqual(K.daResposta({ resumo: { vendas: 10 } }, { lista: 'resumo' }).map((i) => i.chave), ['vendas'], 'objeto simples no caminho');
  assert.deepEqual(K.mapaLimpo({ lista: 'a.b; DROP', valor: '<x>' }), { lista: 'a.bDROP', chave: '', nome: '', valor: 'x', unidade: '', meta: '' });
  assert.deepEqual(K.cabecalhosDe('basic', '', 'u:p'), { authorization: 'Basic dTpw' });
  assert.deepEqual(K.cabecalhosDe('bearer', '', 'tok'), { authorization: 'Bearer tok' });
  assert.deepEqual(K.cabecalhosDe('cabecalho', 'X-Api-Key', 'k'), { 'x-api-key': 'k' });
  assert.deepEqual(K.cabecalhosDe('cabecalho', 'Host', 'k'), {}, 'deixou trocar o Host');
});

test('o segredo fica cifrado (AES-GCM); sem a chave em produção, não guarda', () => {
  const c = S.cifrar('usuario:senha');
  assert.ok(c.startsWith(S.PREFIXO) && !c.includes('senha'));
  assert.equal(S.decifrar(c), 'usuario:senha');
  assert.equal(S.decifrar(c.slice(0, -6) + 'AAAAAA'), '', 'abriu texto adulterado');
  const emProducao = execFileSync(process.execPath, ['-e', "process.stdout.write(String(require('./server/segredo').disponivel()))"],
    { cwd: RAIZ, env: Object.assign({}, process.env, { RAILWAY_ENVIRONMENT: 'production', MT_CHAVE_SEGREDOS: '' }) }).toString();
  assert.equal(emProducao, 'false');
});

test('o site.js leva a autenticação só para a origem configurada (redirecionamento para outro host vai sem ela)', async (t) => {
  const vistos = [];
  const outro = http.createServer((req, res) => { vistos.push(['outro', req.headers.authorization || '']); res.writeHead(200, { 'content-type': 'application/json' }); res.end('{"vendas": 7}'); });
  await new Promise((r) => outro.listen(0, '127.0.0.1', r));
  const api = http.createServer((req, res) => {
    vistos.push(['api', req.headers.authorization || '']);
    if (req.url === '/pula') { res.writeHead(302, { location: 'http://127.0.0.1:' + outro.address().port + '/x' }); return res.end(); }
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ itens: [{ k: 'a', v: 1 }] }));
  });
  await new Promise((r) => api.listen(0, '127.0.0.1', r));
  t.after(() => { api.close(); outro.close(); });
  const local = async (alvo) => ({ url: new URL(alvo), ip: '127.0.0.1' });
  const base = 'http://127.0.0.1:' + api.address().port;
  const r = await site.buscarJson(base + '/dados', { authorization: 'Bearer segredo' }, local);
  assert.deepEqual(r.json, { itens: [{ k: 'a', v: 1 }] });
  const r2 = await site.buscarJson(base + '/pula', { authorization: 'Bearer segredo' }, local);
  assert.deepEqual(r2.json, { vendas: 7 });
  assert.deepEqual(vistos, [['api', 'Bearer segredo'], ['api', 'Bearer segredo'], ['outro', '']], 'a senha foi para outro host');
  // Sem política injetada (produção), endereço interno é recusado.
  assert.match((await site.buscarJson(base + '/dados', {})).erro, /./);

  // O "buscar agora" do conector: grava os indicadores e o resultado.
  const gravados = [];
  const marcas = [];
  const db = { gravarIndicadores: async (t2, c, l) => gravados.push(l), atualizarConector: async (id, t2, campos) => marcas.push(campos) };
  const linha = { id: 'kc_1', tenant_id: 't1', url: base + '/dados', auth_tipo: 'bearer', auth_nome: '', auth_segredo: S.cifrar('segredo'), mapa: JSON.stringify({ lista: 'itens', chave: 'k', valor: 'v' }), intervalo_min: 15 };
  const ok = await K.buscarAgora(linha, { db, site, segredo: S, politica: local, agora: 1000 });
  assert.deepEqual(ok.lista.map((i) => [i.chave, i.valor]), [['a', 1]]);
  assert.equal(marcas[0].ultimoErro, '');
  assert.equal(marcas[0].proxima, 1000 + 15 * 60000);
  const ruim = await K.buscarAgora(Object.assign({}, linha, { mapa: '{"lista":"nada"}' }), { db, site, segredo: S, politica: local, agora: 1000 });
  assert.match(ruim.erro, /nenhum indicador/);
});

/* ---------------- servidor de verdade ---------------- */

const PORTA = 7400 + Math.floor(Math.random() * 90);
function pedir(caminho, o = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port: PORTA, path: caminho, method: o.method || 'GET',
      headers: Object.assign({}, o.json ? { 'Content-Type': 'application/json' } : {}, o.cookie ? { Cookie: o.cookie } : {}, o.headers || {}) }, (res) => {
      let txt = '';
      res.on('data', (c) => { txt += c; });
      res.on('end', () => { let json = null; try { json = JSON.parse(txt); } catch (e) { json = null; } resolve({ status: res.statusCode, json, txt, cookies: [].concat(res.headers['set-cookie'] || []) }); });
    });
    req.on('error', reject);
    req.setTimeout(30000, () => req.destroy(new Error('a rota ' + caminho + ' não respondeu')));
    if (o.json) req.write(JSON.stringify(o.json));
    req.end();
  });
}

test('a rota: push com token, valor anterior, a TV recebe, o pull recusa senha em http, apagar leva os números; a exportação não leva segredo', async (t) => {
  const dados = fs.mkdtempSync(path.join(os.tmpdir(), 'mt-d36-'));
  const servidor = spawn(process.execPath, ['server.js'], {
    cwd: RAIZ, stdio: 'ignore',
    env: { ...process.env, PORT: String(PORTA), STORAGE: 'local', SKIP_VERIFY: '1', DATABASE_URL: '', DATA_DIR: dados, MEDIA_DIR: dados, AI_PROVIDER: 'dev' },
  });
  t.after(() => { servidor.kill(); try { fs.rmSync(dados, { recursive: true, force: true }); } catch (e) { /* o Windows segura o arquivo */ } });
  let ok = false;
  for (let i = 0; i < 160 && !ok; i++) { try { await pedir('/tv'); ok = true; } catch (e) { await new Promise((r) => setTimeout(r, 250)); } }
  assert.ok(ok, 'o servidor de teste não subiu');
  const c = (await pedir('/api/auth/signup', { method: 'POST', json: { email: 'd36' + Date.now() + '@teste.local', password: 'senha-de-teste-123', name: 'Indústria', aceite: true } }))
    .cookies.map((x) => x.split(';')[0]).filter((x) => !x.endsWith('=')).join('; ');
  assert.equal((await pedir('/api/kpis')).status, 401);

  const criado = (await pedir('/api/kpis/conectores', { method: 'POST', cookie: c, json: { modo: 'push', nome: 'Protheus' } })).json;
  assert.match(criado.token, /^mtk_/);
  assert.equal(criado.conector.modo, 'push');
  const entrar = (token, json) => pedir('/api/kpis/entrada', { method: 'POST', json, headers: { authorization: 'Bearer ' + token } });
  assert.equal((await entrar('mtk_errado', { a: 1 })).status, 401);
  assert.equal((await entrar(criado.token, { nada: 'sem número' })).status, 400);
  const r1 = await entrar(criado.token, { indicadores: [{ chave: 'vendas', nome: 'Vendas do dia', valor: '12.300,00', unidade: 'R$', meta: 20000 }] });
  assert.deepEqual([r1.status, r1.json.recebidos], [200, 1]);
  await entrar(criado.token, { indicadores: [{ chave: 'vendas', nome: 'Vendas do dia', valor: 15000, unidade: 'R$', meta: 20000 }] });
  let lista = (await pedir('/api/kpis', { cookie: c })).json;
  assert.deepEqual(lista.indicadores.map((i) => [i.chave, i.valor, i.anterior, i.meta]), [['vendas', 15000, 12300, 20000]]);
  assert.equal(lista.conectores[0].temSegredo, false);
  assert.equal(JSON.stringify(lista).includes('token_hash'), false);

  // A TV recebe os valores (pelo token da TV).
  const tv = (await pedir('/api/devices', { method: 'POST', json: {} })).json;
  await pedir('/api/devices/' + tv.id + '/config', { headers: { 'x-device-token': tv.deviceToken } });
  assert.ok((await pedir('/api/pair', { method: 'POST', cookie: c, json: { code: tv.code } })).status < 300);
  const naTv = (await pedir('/api/devices/' + tv.id + '/kpis', { headers: { 'x-device-token': tv.deviceToken } })).json.indicadores;
  assert.deepEqual(naTv.map((i) => [i.chave, i.valor, i.anterior]), [['vendas', 15000, 12300]]);
  assert.equal((await pedir('/api/devices/' + tv.id + '/kpis')).status, 403);

  // Token novo derruba o antigo.
  const novo = (await pedir('/api/kpis/conectores/' + criado.conector.id + '/token', { method: 'POST', cookie: c })).json.token;
  assert.equal((await entrar(criado.token, { a: 1 })).status, 401);
  assert.equal((await entrar(novo, { a: 1 })).status, 200);

  // Pull: senha não anda em http.
  const pull = (await pedir('/api/kpis/conectores', { method: 'POST', cookie: c, json: { modo: 'pull', nome: 'API' } })).json.conector;
  assert.equal((await pedir('/api/kpis/conectores/' + pull.id, { method: 'PUT', cookie: c, json: { url: 'http://erp.exemplo.com/kpi', authTipo: 'bearer', segredo: 'x' } })).status, 400);
  assert.equal((await pedir('/api/kpis/conectores/' + pull.id, { method: 'PUT', cookie: c, json: { url: 'https://erp.exemplo.com/kpi', authTipo: 'bearer', segredo: 'segredo-do-erp' } })).status, 200);
  lista = (await pedir('/api/kpis', { cookie: c })).json;
  assert.equal(lista.conectores.find((x) => x.id === pull.id).temSegredo, true);
  assert.equal(JSON.stringify(lista).includes('segredo-do-erp'), false, 'o segredo voltou para o painel');

  // A exportação leva os números e os conectores, nunca o segredo nem o hash do token.
  const exp = (await pedir('/api/privacidade/exportar', { cookie: c })).txt;
  assert.match(exp, /"conectoresDeIndicadores"/);
  assert.doesNotMatch(exp, /auth_segredo|token_hash|mts1:/);

  // Apagar o conector leva os números dele.
  assert.equal((await pedir('/api/kpis/conectores/' + criado.conector.id, { method: 'DELETE', cookie: c })).status, 200);
  assert.deepEqual((await pedir('/api/kpis', { cookie: c })).json.indicadores, []);
});

test('a TV e o painel: o cartão ao vivo (número, variação, meta), a busca de 5 em 5 minutos e no aviso, a página Indicadores', () => {
  const R = ler('js/render.js');
  assert.match(R, /if \(item\.indicador\) item = kpiAoVivo\(item\);/);
  assert.match(R, /'🎉 Meta batida! '/);
  assert.match(R, /Math\.round\(item\.meta\.pct\) \+ '% da meta de '/);
  const P = ler('js/player.js');
  assert.match(P, /setInterval\(function \(\) \{ loadKpis\(dev\.id\); \}, 5 \* 60 \* 1000\);/);
  assert.match(P, /document\.addEventListener\('mt:kpis-mudou', function \(\) \{ loadKpis\(dev\.id\); \}\);/);
  assert.match(ler('js/cloud.js'), /es\.addEventListener\('kpis', \(\) => \{/);
  assert.match(ler('js/cloud.js'), /localStorage\.removeItem\('mt\.kpis'\);/, 'a TV reiniciada herda os números da conta antiga');
  assert.match(ler('web/src/lib/menu.js'), /paginas: \['relatorio', 'indicadores'\]/);
  assert.match(ler('web/src/pages/IndicadoresPage.jsx'), /const item = \{ type: 'kpi', indicador: indicador\.chave, rotulo: indicador\.nome, duracao: 12 \};/);
  assert.match(ler('sw.js'), /mt-shell-v(59|[6-9]\d)/);
});
