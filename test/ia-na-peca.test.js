/*
 * Pedir à IA dentro da peça (EXECUTOR D20).
 *
 * "Deixa vermelho", "tira o preço", "fonte mais elegante": a IA devolve só
 * o remendo — textos de campos que a peça declara, estilo, cores, fontes do
 * catálogo e o que aparece —, nunca HTML ou CSS. O código confere tudo; o
 * painel mostra antes de aceitar. E o dono: "melhore as zonas também" — o
 * mapa da TV mostra o que passa em cada zona e tem o botão de IA nela.
 */
'use strict';
process.env.AI_PROVIDER = process.env.AI_PROVIDER || 'dev';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const RAIZ = path.join(__dirname, '..');
const ler = (...p) => fs.readFileSync(path.join(RAIZ, ...p), 'utf8');
const P = require('../js/peca-html.js');
const A = require('../server/ajuste-peca');
const oferta = P.doArquivo(ler('pecas-ouro', 'oferta-foto.html'));
const ITEM = { type: 'peca-html', html: oferta.html, css: oferta.css, campos: { titulo: 'Óculos de sol' }, modo: 'escuro', marca: { cores: ['#1b2a4a', '#c8a96e'] } };
const v = P.validarItem(ITEM);

test('a peneira: só campos de texto que a peça declara, no tamanho do desenho; nada de HTML', () => {
  const { remendo, mudou } = A.lerRemendo({
    campos: { titulo: 'x'.repeat(200), inventado: 'oi', foto: '/media/x.jpg' },
    html: '<script>alert(1)</script>', css: 'body{}',
    modo: 'rascunho', cores: ['#ff0000', 'vermelho', '#00FF00', '#111111', '#222222'],
    fonteTitulo: 'serifada', fonteApoio: 'comic-sans',
  }, v);
  assert.deepEqual(Object.keys(remendo.campos), ['titulo']);
  assert.ok(remendo.campos.titulo.length <= Math.ceil('Óculos de sol'.length * 1.5), 'texto maior que o desenho aguenta');
  assert.equal(remendo.html, undefined);
  assert.equal(remendo.css, undefined);
  assert.equal(remendo.modo, undefined, 'rascunho não é estilo de TV');
  assert.deepEqual(remendo.marca.cores, ['#ff0000', '#00ff00', '#111111']);
  assert.equal(remendo.marca.fonteTitulo, 'serifada');
  assert.equal(remendo.marca.fonteApoio, undefined, 'fonte fora do catálogo');
  assert.deepEqual(mudou, ['texto', 'cores', 'fonte']);
});

test('esconder: o preço vai com centavos e parcelas; nunca a peça inteira', () => {
  const r = A.lerRemendo({ esconder: ['preco'] }, v);
  assert.deepEqual(r.remendo.ocultos.sort(), ['centavos', 'parcelas', 'preco', 'preco-rotulo'].sort());
  const textos = v.campos.filter((c) => c.tipo === 'texto' || c.tipo === 'qr').map((c) => c.nome);
  const tudo = A.lerRemendo({ esconder: textos }, v);
  assert.equal(tudo.remendo.ocultos, undefined, 'escondeu todos os textos');
  const volta = A.lerRemendo({ mostrar: ['kicker'] }, P.validarItem({ ...ITEM, ocultos: ['kicker', 'cta'] }));
  assert.deepEqual(volta.remendo.ocultos, ['cta']);
});

test('sem IA (localhost, e quando a IA cai): as frases comuns funcionam; o resto explica o que dá para pedir', async () => {
  const pede = (p) => A.ajustar(ITEM, p);
  assert.deepEqual((await pede('deixa vermelho')).remendo.marca.cores.length, 2);
  assert.equal((await pede('muda o título para Inverno quente')).remendo.campos.titulo, 'Inverno quente');
  assert.equal((await pede('fonte mais elegante')).remendo.marca.fonteTitulo, 'serifada');
  assert.equal((await pede('fundo claro')).remendo.modo, 'claro');
  const nada = await pede('faz um vídeo');
  assert.deepEqual(nada.remendo, {});
  assert.match(nada.resposta, /Dá para pedir/);
  await assert.rejects(A.ajustar({ type: 'peca-html', html: '<script></script>', css: '' }, 'oi'), /peça inválida/);
});

test('a rota: medida e com teto (mapa TIPO_IA), limite por hora, só com sessão, nada gravado', () => {
  const s = ler('server.js');
  assert.match(s, /'ajustar-peca': 'ajuste-peca',/);
  assert.match(ler('server/creditos.js'), /'ajuste-peca': \{ creditos: 0, custoCentavos: CUSTO_TEXTO_CENTAVOS/);
  const rota = s.slice(s.indexOf("parts[2] === 'ajustar-peca'"), s.indexOf('/* ----- IA: layout de composição'));
  assert.match(rota, /if \(!sess\) return sendJson\(res, 401/);
  assert.match(rota, /rateLimit\('ai:ajustar-peca:' \+ sess\.tenant_id, 60, 60 \* 60 \* 1000\)/);
  assert.doesNotMatch(rota, /db\.(set|salvar|update|save)/i, 'a rota grava alguma coisa');
  // A IA recebe a lista de campos e o pedido, nunca a ordem de redesenhar.
  assert.match(A.SISTEMA, /Você não redesenha a peça/);
  assert.match(A.pedidoParaIA(v, 'deixa vermelho'), /- titulo: "Óculos de sol"/);
});

test('o painel: pedir no editor de peça (com desfazer), editar a peça da TV e o mapa com a IA na zona', () => {
  const e = ler('web/src/components/content/EditarPeca.jsx');
  assert.match(e, /const r = await ai\.ajustarPeca\(atual, pedido\.trim\(\)\);/);
  assert.match(e, /setCampos\(a\.campos\); setModo\(a\.modo\); setMarca\(a\.marca\); setOcultos\(a\.ocultos\);/);
  const tv = ler('web/src/pages/ContentEditorPage.jsx');
  assert.match(tv, /\{current\.type === 'peca-html' && \(/);
  assert.match(tv, /tamanho: tamanhosTV\[activeZone\.id\] \|\| \[1920, 1080\]/);
  assert.match(tv, /onSalvar=\{async \(novo\) => \{ updateItem\(selected, \{ \.\.\.current, \.\.\.novo \}\); setEditandoPeca\(false\); \}\}/);
  const m = ler('web/src/components/tela/MapaDaTela.jsx');
  assert.match(m, /<PecaHtml item=\{item\} tamanho=\{tamanho\}/, 'a zona mostra a peça no tamanho real dela');
  assert.match(m, /aria-label=\{'Criar com a IA para ' \+ nome\.toLowerCase\(\)\}/);
  // O botão escondido não pode ser tocado sem querer no celular.
  assert.match(m, /'pointer-events-none opacity-0 focus:opacity-100 group-hover:pointer-events-auto group-hover:opacity-100'/);
  assert.match(ler('web/src/lib/tela.js'), /export function tamanhosDasZonas\(layout\)/);
});

test('revisão do #242: a peça DEPOIS do remendo passa pela porta de novo', () => {
  const s = ler('server/ajuste-peca.js');
  assert.match(s, /const depois = P\.validarItem\(comRemendo\(v\.item, remendo\)\);/);
  assert.match(s, /if \(depois\.problemas\.length\) return \{ resposta: 'Não deu para aplicar: '/);
  const c = A.comRemendo(v.item, { campos: { titulo: 'Novo' }, marca: { fonteTitulo: 'serifada' }, ocultos: ['kicker'] });
  assert.equal(c.campos.titulo, 'Novo');
  assert.deepEqual(c.marca.cores, ['#1b2a4a', '#c8a96e'], 'as cores da peça sumiram com o remendo de fonte');
  assert.equal(P.validarItem(c).ok, true);
});
