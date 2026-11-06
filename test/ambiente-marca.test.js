/*
 * A arte do modo ambiente acompanha a marca (lote de 06/11, parte 2).
 *
 * A peça-ouro escolhida em Ajustes da TV › Aparência › Modo ambiente vai
 * inteira para a config (a TV desenha sem internet), com as cores e o nome
 * da marca do momento em que foi escolhida. Mudada a Marca, a TV seguia
 * com as cores velhas. Agora, como o tema da marca (server/paleta.js,
 * temaDaTv), a peça sai do servidor com a marca de agora — para a TV e
 * para o painel — e passa pela mesma porta da TV.
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
const ler = (f) => fs.readFileSync(path.join(RAIZ, f), 'utf8');
const P = require('../js/peca-html.js');
const ST = require('../js/storage.js');
const RZ = require('../js/rodizio.js');
const CP = require('../server/conteudoPronto.js');
const paleta = require('../server/paleta.js');

const MARCA_VELHA = { nome: 'Padaria Sol', cores: ['#b45309', '#fde68a'] };
const KIT_NOVO = { nome: 'Padaria Lua', cores: ['#1D4ED8', '#93C5FD', '#0F172A', '#F8FAFC'], fonteTitulo: 'display', fonteApoio: 'nao-existe', nasTvs: true };

async function pecaEscolhida(marca, frase) {
  globalThis.MTPecaHtml = globalThis.MTPecaHtml || P;
  const Am = await import(pathToFileURL(path.join(RAIZ, 'web/src/lib/arteDoAmbiente.js')).href);
  const m = CP.aplicarDecisoes(JSON.parse(ler('pecas-ouro/manifesto.json')), [{ tipo: 'peca', id: 'ambiente-ondas', estado: 'aprovada', decidido_em: 1 }]);
  const ondas = m.pecas.filter((p) => p.id === 'ambiente-ondas').map((p) => ({ ...p, arq: P.doArquivo(ler('pecas-ouro/' + p.id + '.html')) }))[0];
  return Am.pecaDaArte(ondas, marca, 'comercio', frase);
}
// O que o painel grava, depois do normalizador e da porta do servidor (server/routes/telas.js, prepararConfig).
function gravada(peca) {
  const cfg = ST.normalize({ settings: { layoutId: 'full', ambiente: { ativo: true, cada: 3, segundos: 8, mostrar: 'relogio', frase: 'Bom dia, freguês!', peca } }, zonas: { principal: { items: [] } } });
  assert.deepEqual(P.conferirConfig(cfg, { hostsMidia: [] }).problemas, []);
  return cfg;
}

test('mudou a marca: a peça sai com as cores, as fontes e o nome novos; o desenho e a frase ficam', async () => {
  const cfg = gravada(await pecaEscolhida(MARCA_VELHA, 'Bom dia, freguês!'));
  const antes = cfg.settings.ambiente.peca;
  assert.deepEqual(antes.marca.cores, ['#b45309', '#fde68a']);
  const amb = paleta.ambienteDaMarca(cfg.settings.ambiente, KIT_NOVO, 'Padaria Sol e Lua Ltda', { hostsMidia: [] });
  assert.ok(amb, 'a peça não acompanhou a marca');
  const p = amb.peca;
  assert.deepEqual(p.marca, { cores: ['#1d4ed8', '#93c5fd', '#0f172a'], fonteTitulo: 'display', fonteApoio: '' }, 'as cores e as fontes passam pela porta da TV');
  assert.equal(p.campos.marca, 'Padaria Lua');
  assert.equal(p.campos.frase, 'Bom dia, freguês!', 'a frase escrita foi embora');
  assert.equal(p.html, antes.html, 'o desenho mudou');
  assert.equal(p.origem.base, 'ambiente-ondas');
  // O resto do ambiente fica como estava.
  assert.equal(amb.cada, 3);
  assert.equal(amb.segundos, 8);
  assert.equal(amb.ativo, true);
  assert.equal(cfg.settings.ambiente.peca.marca.cores[0], '#b45309', 'mexeu na config recebida');
  // A TV aceita e mostra a peça com a marca nova.
  const nova = { ...cfg, settings: { ...cfg.settings, ambiente: amb } };
  assert.deepEqual(P.conferirConfig(JSON.parse(JSON.stringify(nova)), { hostsMidia: [] }).problemas, []);
  const respiro = RZ.pecaDeAmbiente(ST.normalizeAmbiente(amb));
  assert.equal(respiro.type, 'peca-html');
  assert.deepEqual(respiro.marca.cores, ['#1d4ed8', '#93c5fd', '#0f172a']);
  // Já com a marca de agora: nada a trocar.
  assert.equal(paleta.ambienteDaMarca(amb, KIT_NOVO, '', { hostsMidia: [] }), null);
});

test('o nome: o da marca, senão o da conta; sem nenhum, o lugar do nome some (nunca o de exemplo)', async () => {
  const cfg = gravada(await pecaEscolhida(MARCA_VELHA, ''));
  const semNome = { ...KIT_NOVO, nome: 'Marca principal' };
  assert.equal(paleta.ambienteDaMarca(cfg.settings.ambiente, semNome, 'Padaria da Esquina', {}).peca.campos.marca, 'Padaria da Esquina');
  const vazio = paleta.ambienteDaMarca(cfg.settings.ambiente, { ...semNome, nome: '' }, '', {}).peca;
  assert.equal(vazio.campos.marca, '');
  assert.deepEqual(vazio.ocultos, ['marca']);
  // A conta que ganha nome depois: o nome aparece e sai dos escondidos.
  const comNome = paleta.ambienteDaMarca({ ...cfg.settings.ambiente, peca: vazio }, KIT_NOVO, '', {}).peca;
  assert.equal(comNome.campos.marca, 'Padaria Lua');
  assert.equal(comNome.ocultos, undefined);
  // A marca sem cor: a peça fica sem a marca própria (a TV usa o tema), como na escolha.
  assert.equal(paleta.ambienteDaMarca(cfg.settings.ambiente, { nome: 'Padaria Sol', cores: [] }, '', {}).peca.marca, null);
});

test('só a peça-ouro no modo da marca acompanha; o desenho da marca e o resto ficam como estão', async () => {
  const cfg = gravada(await pecaEscolhida(MARCA_VELHA, ''));
  const amb = cfg.settings.ambiente;
  assert.equal(paleta.ambienteDaMarca({ ativo: true, mostrar: 'relogio' }, KIT_NOVO, '', {}), null, 'sem peça (o desenho da marca já é da TV)');
  assert.equal(paleta.ambienteDaMarca(amb, null, '', {}), null, 'sem marca lida, fica a gravada');
  assert.equal(paleta.ambienteDaMarca(undefined, KIT_NOVO, '', {}), null);
  assert.equal(paleta.ambienteDaMarca({ ...amb, peca: { ...amb.peca, origem: { motor: 'ia' } } }, KIT_NOVO, '', {}), null, 'peça que não é peça-ouro');
  assert.equal(paleta.ambienteDaMarca({ ...amb, peca: { ...amb.peca, modo: 'original' } }, KIT_NOVO, '', {}), null, 'peça nas cores dela, não nas da marca');
  // A peça que não passa pela porta (estragada) fica como está: nada novo vai para a TV.
  assert.equal(paleta.ambienteDaMarca({ ...amb, peca: { ...amb.peca, html: '<section class="mt-peca"><script>x</script></section>' } }, KIT_NOVO, '', {}), null);
  // As duas leituras da config (a TV e o painel) usam a marca de agora.
  const t = ler('server/routes/telas.js');
  assert.match(t, /const amb = paleta\.ambienteDaMarca\(c\.settings\.ambiente, kit, empresa, \{ hostsMidia \}\);\s*if \(amb\) c\.settings\.ambiente = amb;/, 'o painel');
  assert.match(t, /const amb = paleta\.ambienteDaMarca\(c\.settings\.ambiente, kit, empresa, \{ hostsMidia \}\);\s*if \(amb\) \{ c\.settings\.ambiente = amb; mudou = true; \}/, 'a TV');
});

/* ---------------- servidor de verdade ---------------- */

const PORTA = 8900 + Math.floor(Math.random() * 90);
function pedir(caminho, o = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port: PORTA, path: caminho, method: o.method || 'GET',
      headers: { ...(o.json ? { 'Content-Type': 'application/json' } : {}), ...(o.cookie ? { Cookie: o.cookie } : {}), ...(o.headers || {}) } }, (res) => {
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

test('servidor: trocou a Marca, a TV e o painel recebem a arte do ambiente com as cores e o nome novos', async (t) => {
  const dados = fs.mkdtempSync(path.join(os.tmpdir(), 'mt-amb-marca-'));
  const servidor = spawn(process.execPath, ['server.js'], {
    cwd: RAIZ, stdio: 'ignore',
    env: { ...process.env, PORT: String(PORTA), STORAGE: 'local', SKIP_VERIFY: '1', DATABASE_URL: '', DATA_DIR: dados, MEDIA_DIR: dados, AI_PROVIDER: 'dev', TRUST_PROXY: '', RAILWAY_ENVIRONMENT: '' },
  });
  t.after(() => { servidor.kill(); try { fs.rmSync(dados, { recursive: true, force: true }); } catch (e) { /* o Windows segura o arquivo */ } });
  let ok = false;
  for (let i = 0; i < 160 && !ok; i++) { try { await pedir('/tv'); ok = true; } catch (e) { await new Promise((r) => setTimeout(r, 250)); } }
  assert.ok(ok, 'o servidor de teste não subiu');

  const dono = cookieDe(await pedir('/api/auth/signup', { method: 'POST', json: { email: 'amb' + Date.now() + '@teste.local', password: 'senha-de-teste-123', name: 'Padaria Sol', aceite: true, perfil: 'comercio' } }));
  assert.equal((await pedir('/api/brand', { method: 'PUT', cookie: dono, json: MARCA_VELHA })).status, 200);
  const tv = (await pedir('/api/devices', { method: 'POST', json: {} })).json;
  assert.ok((await pedir('/api/pair', { method: 'POST', cookie: dono, json: { code: tv.code, nova: true } })).status < 300);
  const peca = await pecaEscolhida(MARCA_VELHA, 'Bom dia, freguês!');
  const cfg = { settings: { layoutId: 'full', ambiente: { ativo: true, cada: 3, segundos: 8, mostrar: 'relogio', frase: 'Bom dia, freguês!', peca } }, zonas: { principal: { items: [{ type: 'announce', titulo: 'Pão quente' }] } } };
  assert.equal((await pedir('/api/devices/' + tv.id + '/config', { method: 'PUT', cookie: dono, json: cfg })).status, 200);
  const daTv = async () => (await pedir('/api/devices/' + tv.id + '/config', { headers: { 'x-device-token': tv.deviceToken } })).json.settings.ambiente.peca;
  const doPainel = async () => (await pedir('/api/devices/' + tv.id + '/config', { cookie: dono })).json.settings.ambiente.peca;
  assert.deepEqual((await daTv()).marca.cores, ['#b45309', '#fde68a']);
  assert.equal((await daTv()).campos.marca, 'Padaria Sol');

  // A Marca muda (página Marca): nada mais é gravado na TV.
  assert.equal((await pedir('/api/brand', { method: 'PUT', cookie: dono, json: { nome: 'Padaria Lua', cores: ['#1d4ed8', '#93c5fd'], fonteTitulo: 'display' } })).status, 200);
  for (const [quem, ler] of [['a TV', daTv], ['o painel', doPainel]]) {
    const p = await ler();
    assert.deepEqual(p.marca.cores, ['#1d4ed8', '#93c5fd'], quem + ' ficou com as cores velhas');
    assert.equal(p.marca.fonteTitulo, 'display', quem);
    assert.equal(p.campos.marca, 'Padaria Lua', quem + ' ficou com o nome velho');
    assert.equal(p.campos.frase, 'Bom dia, freguês!', quem);
  }
  // Todas as TVs de uma vez (a Programação) também.
  const todas = (await pedir('/api/devices/configs', { cookie: dono })).json.configs;
  assert.equal(todas[tv.id].config.settings.ambiente.peca.campos.marca, 'Padaria Lua');
  // O painel grava o que leu: a peça nova passa pela porta e fica gravada assim.
  const lida = (await pedir('/api/devices/' + tv.id + '/config', { cookie: dono })).json;
  assert.equal((await pedir('/api/devices/' + tv.id + '/config', { method: 'PUT', cookie: dono, json: lida })).status, 200);
  assert.deepEqual((await daTv()).marca.cores, ['#1d4ed8', '#93c5fd']);
});
