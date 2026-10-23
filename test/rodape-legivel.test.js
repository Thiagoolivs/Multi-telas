/*
 * Rodapé legível e bonito (EXECUTOR D12).
 *
 * O dono: "mais editável, e garantir que o pedido da zona não vaze no rodapé;
 * ele deve fazer sentido". Medido na TV de 1920×1080: dois relógios (o do
 * cabeçalho e o do rodapé), a perna do g/p/j cortada em 4 px, o selo
 * "ÚLTIMAS NOTÍCIAS" sobre avisos da empresa, frase longa trocando antes de
 * rolar até o fim, mensagens grudadas no letreiro, a cor de texto escolhida
 * ignorada no letreiro e a zona vazia preta com uma bolinha.
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const http = require('node:http');
const path = require('node:path');
const vm = require('node:vm');
const { spawn } = require('node:child_process');

const RAIZ = path.join(__dirname, '..');
const ler = (f) => fs.readFileSync(path.join(RAIZ, f), 'utf8');
const PLAYER = ler('js/player.js');
const CSS = ler('css/player.css');

function relogioNoCabecalho() {
  const i = PLAYER.indexOf('function relogioNoCabecalho(cfg, layout)');
  const fim = PLAYER.indexOf('\n  }', i) + 4;
  const ctx = { module: {} };
  vm.createContext(ctx);
  vm.runInContext(PLAYER.slice(i, fim) + '\nmodule.exports = relogioNoCabecalho;', ctx);
  return ctx.module.exports;
}

test('um relógio só: com relógio no cabeçalho, o rodapé não mostra outro', () => {
  const f = relogioNoCabecalho();
  const comCabecalho = { zones: [{ id: 'cabecalho', type: 'header' }, { id: 'rodape', type: 'ticker' }] };
  assert.equal(f({ zonas: {} }, comCabecalho), true, 'cabeçalho padrão sempre tem relógio');
  assert.equal(f({ zonas: {} }, { zones: [{ id: 'rodape', type: 'ticker' }] }), false);
  const pecaSemRelogio = { zonas: { cabecalho: { pecas: [{ type: 'peca-html', html: '<div class="mt-peca"><b data-campo="titulo">x</b></div>' }] } } };
  assert.equal(f(pecaSemRelogio, comCabecalho), false, 'peça de cabeçalho sem relógio deixa o do rodapé');
  const pecaComRelogio = { zonas: { cabecalho: { pecas: [{ type: 'peca-html', html: '<span data-vivo="relogio"></span>' }] } } };
  assert.equal(f(pecaComRelogio, comCabecalho), true);
  assert.match(PLAYER, /const mostrarRelogio = data\.mostrarRelogio !== false && !global\.MT_RELOGIO_NO_CABECALHO;/);
  assert.match(PLAYER, /semRelogio: zone\.type === 'ticker' && !!global\.MT_RELOGIO_NO_CABECALHO,/);
  assert.match(ler('js/peca-render.js'), /\.mt-peca\[data-sem-relogio\] \[data-vivo="relogio"\]\{display:none!important\}/);
});

test('manchete: o selo certo, o fim da frase aparece, g/p/j inteiros', () => {
  // O padrão gravado na config ("ÚLTIMAS NOTÍCIAS", js/storage.js) não é escolha: vale o automático.
  assert.ok(PLAYER.includes("const tituloProprio = data.titulo && data.titulo !== 'ÚLTIMAS NOTÍCIAS' ? data.titulo : '';"));
  assert.ok(PLAYER.includes("tag.textContent = tituloProprio || (usingFeed ? 'ÚLTIMAS NOTÍCIAS' : 'AVISOS');"));
  assert.ok(PLAYER.includes("tag.textContent = tituloProprio || (item.manual ? 'AVISOS' : 'ÚLTIMAS NOTÍCIAS');"), 'o selo de cada manchete');
  // Fica o intervalo OU o tempo de rolar até o fim e parar — o que for maior.
  assert.match(PLAYER, /const segundos = Math\.max\(intervaloBase, durRolagem \? durRolagem \+ 1\.5 : 0\);/);
  assert.match(PLAYER, /setTimeout\(\(\) => \{ agendarProxima\(Math\.max\(ajustarRolagem\(title\), ajustarRolagem\(desc\)\)\); \}, 50\);/);
  assert.ok(!/const rotateTimer = setInterval/.test(PLAYER), 'o intervalo fixo que cortava a frase voltou');
  // O respiro da perna das letras vai no padding (a caixa que corta cresce) e volta na margem.
  assert.match(CSS, /padding: \.06em 0 \.16em; margin: -\.06em 0 -\.16em;/);
});

test('letreiro: espaço entre as mensagens e a cor escolhida respeitada', () => {
  assert.match(CSS, /white-space: pre; line-height: 1\.35;/);
  assert.match(PLAYER, /zoneEl\.style\.setProperty\('--on-brand', texto\);/);
  assert.match(ler('sw.js'), /const SHELL_CACHE = 'mt-shell-v(4[7-9]|[5-9]\d)';/);
});

test('o pedido da zona (e o exemplo do prompt) nunca viram frase do letreiro', () => {
  const eco = require('../server/ecossistema.js');
  const E = require('../js/escopo.js');
  const escopo = E.normalizar({ telas: [{ alvo: { tipo: 'todas' }, zonas: { rodape: { pecas: 1, pedido: 'letreiro com os horários de atendimento' } } }] });
  assert.deepEqual(eco.letreiroLimpo([
    'Letreiro com os horários de atendimento', 'aviso do letreiro', 'Mensagem de apoio sobre a promoção',
    'Aberto de segunda a sábado, das 8h às 18h', 'Pão quentinho às 16h',
  ], escopo), ['Aberto de segunda a sábado, das 8h às 18h', 'Pão quentinho às 16h']);
  const conversa = require('../server/ai-conversa.js');
  assert.ok(!/aviso do letreiro|"mensagens": \["chamada"\]/.test(conversa.SISTEMA), 'o exemplo do prompt voltou a ser frase pronta');
});

/* ---------------- servidor de verdade ---------------- */

const PORTA = 6100 + Math.floor(Math.random() * 90);
function pedir(caminho, o = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port: PORTA, path: caminho, method: o.method || 'GET',
      headers: { ...(o.json ? { 'Content-Type': 'application/json' } : {}), ...(o.cookie ? { Cookie: o.cookie } : {}) } }, (res) => {
      let corpo = '';
      res.on('data', (c) => { corpo += c; });
      res.on('end', () => { let json = null; try { json = JSON.parse(corpo); } catch (e) { json = null; } resolve({ status: res.statusCode, json, cookies: [].concat(res.headers['set-cookie'] || []) }); });
    });
    req.on('error', reject);
    req.setTimeout(20000, () => req.destroy(new Error('a rota ' + caminho + ' não respondeu')));
    if (o.json) req.write(JSON.stringify(o.json));
    req.end();
  });
}
const cookieDe = (r) => r.cookies.map((c) => c.split(';')[0]).filter((c) => !c.endsWith('=')).join('; ');

test('o letreiro da campanha se edita à mão, e entra no desfazer', async (t) => {
  const dados = fs.mkdtempSync(path.join(os.tmpdir(), 'mt-d12-'));
  const servidor = spawn(process.execPath, ['server.js'], {
    cwd: RAIZ, stdio: 'ignore',
    env: { ...process.env, PORT: String(PORTA), STORAGE: 'local', SKIP_VERIFY: '1', DATABASE_URL: '', DATA_DIR: dados, MEDIA_DIR: dados, AI_PROVIDER: 'dev' },
  });
  t.after(() => { servidor.kill(); try { fs.rmSync(dados, { recursive: true, force: true }); } catch (e) { /* o Windows segura o arquivo */ } });
  let ok = false;
  for (let i = 0; i < 160 && !ok; i++) { try { await pedir('/tv'); ok = true; } catch (e) { await new Promise((r) => setTimeout(r, 250)); } }
  assert.ok(ok, 'o servidor de teste não subiu');
  const email = 'd12' + Date.now() + '@teste.local';
  const c = cookieDe(await pedir('/api/auth/signup', { method: 'POST', json: { email, password: 'senha-de-teste-123', name: 'Loja', aceite: true } }));

  const escopo = { nome: 'Feriado', objetivo: 'horário do feriado', imagens: 'nenhuma',
    telas: [{ alvo: { tipo: 'todas' }, zonas: { principal: { pecas: 1 }, rodape: { pecas: 0, mensagens: ['Fechado na quinta'] } } }] };
  const aprovada = (await pedir('/api/conversas/esboco', { method: 'POST', cookie: c, json: { escopo } })).json.conversa;
  const job = (await pedir('/api/ai/ecossistema', { method: 'POST', cookie: c, json: { conversaId: aprovada.id, escopo } })).json;
  let camp = null;
  for (let i = 0; i < 40 && !camp; i++) {
    await new Promise((r) => setTimeout(r, 250));
    const s = (await pedir('/api/ai/job/' + job.id, { cookie: c })).json;
    if (s && s.estado === 'pronto') camp = s.resultado.campanha;
  }
  assert.ok(camp, 'a campanha de teste não saiu');

  const r = await pedir('/api/campanhas/' + camp.id + '/letreiro', { method: 'PUT', cookie: c, json: { tela: 0, zona: 'rodape', mensagens: ['  Fechado na quinta, voltamos sexta às 8h  ', '', 'x'.repeat(200)] } });
  assert.equal(r.status, 200);
  assert.deepEqual(r.json.campanha.resultado.telas[0].zonas.rodape.mensagens, ['Fechado na quinta, voltamos sexta às 8h', 'x'.repeat(80)]);
  assert.equal((await pedir('/api/campanhas/' + camp.id + '/letreiro', { method: 'PUT', cookie: c, json: { tela: 9, zona: 'rodape', mensagens: [] } })).status, 400);
  assert.equal((await pedir('/api/campanhas/' + camp.id + '/letreiro', { method: 'PUT', cookie: c, json: { tela: 0, zona: 'principal', mensagens: [] } })).status, 400);

  const desfeito = (await pedir('/api/campanhas/' + camp.id + '/desfazer', { method: 'POST', cookie: c })).json;
  assert.deepEqual(desfeito.campanha.resultado.telas[0].zonas.rodape.mensagens, ['Fechado na quinta']);

  const outra = cookieDe(await pedir('/api/auth/signup', { method: 'POST', json: { email: 'x' + email, password: 'senha-de-teste-123', name: 'Outra', aceite: true } }));
  assert.equal((await pedir('/api/campanhas/' + camp.id + '/letreiro', { method: 'PUT', cookie: outra, json: { tela: 0, zona: 'rodape', mensagens: ['invadido'] } })).status, 404);
});
