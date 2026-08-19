/*
 * A IA guiada do editor.
 *
 * "Peça uma imagem ou um SVG" nunca funcionou, e a razão tinha duas metades.
 * A do cliente foi consertada antes (o editor reetiquetava tudo como texto).
 * Esta é a do servidor: `clampComposition` escrevia `tipo: 'texto'` fixo em
 * TODO elemento que chegava, e o prompt pedia explicitamente "de 1 a 3 blocos
 * de TEXTO". Uma forma ou um ícone perfeitos vindos do modelo eram convertidos
 * em texto na porta de entrada.
 *
 * A outra metade é o pedido guiado: não havia como dizer o quê, onde, em que
 * cor. A frase livre era o único canal, e ela não era lida como pedido.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

process.env.AI_PROVIDER = 'dev';
const ai = require('../server/ai.js');

const semComentarios = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const ler = (...p) => semComentarios(fs.readFileSync(path.join(__dirname, '..', ...p), 'utf8'));
const EDITOR = ler('web', 'src', 'components', 'content', 'CompositionEditor.jsx');
const SERVER = ler('server.js');
const AI = ler('server', 'ai.js');

const gerar = (pedido, formato) => ai.generateComposition('promo de skate 30% OFF', { formato: formato || '16/9', pedido });

test('a IA produz forma e ícone, não só texto', async () => {
  // A linha era `tipo: 'texto'` fixo dentro do clamp — a porta de entrada
  // reescrevia o tipo de tudo que chegava.
  const forma = await gerar({ tipo: 'forma' });
  assert.equal(forma.elementos[0].tipo, 'forma');
  assert.ok(forma.elementos[0].shape, 'a forma veio sem desenho');

  const icone = await gerar({ tipo: 'icone' });
  assert.equal(icone.elementos[0].tipo, 'icone');
  assert.ok(icone.elementos[0].name, 'o ícone veio sem nome');
});

test('pedir um tipo DESCARTA o que não é aquele tipo', async () => {
  // Quem clicou em "ícone" não quer dois parágrafos de volta.
  const r = ai.__clamp({ elementos: [
    { tipo: 'texto', text: 'sobra' },
    { tipo: 'icone', name: 'bell' },
    { tipo: 'forma', shape: 'rect' },
  ] }, '', { tipo: 'icone' }, '16/9');
  assert.equal(r.elementos.length, 1);
  assert.equal(r.elementos[0].tipo, 'icone');
});

test('nome de ícone e forma inventados caem no seguro', async () => {
  // Um nome fora da lista vira um SVG vazio na parede — e ninguém vê o erro
  // até a peça estar publicada.
  const r = ai.__clamp({ elementos: [
    { tipo: 'icone', name: 'unicornio-de-fogo' },
    { tipo: 'forma', shape: 'hexadecagono' },
  ] }, '', {}, '16/9');
  assert.equal(r.elementos[0].name, 'star');
  assert.equal(r.elementos[1].shape, 'rect');
});

test('`peso` do ícone é traço, não peso de fonte', async () => {
  // 900 num ícone é traço 900: o SVG vira uma mancha sólida.
  const r = ai.__clamp({ elementos: [{ tipo: 'icone', name: 'star', peso: 900 }] }, '', {}, '16/9');
  assert.ok(r.elementos[0].peso <= 3, 'o traço do ícone aceitou peso de fonte: ' + r.elementos[0].peso);
});

test('a posição pedida é imposta sobre o palpite da IA', async () => {
  const r = await gerar({ tipo: 'texto', onde: 'base-dir' });
  const e = r.elementos[0];
  assert.ok(e.y > 50, 'pediu na base e voltou em cima (y=' + e.y + ')');
  assert.ok(e.x + e.w > 90, 'pediu à direita e voltou à esquerda (x=' + e.x + ')');

  const t = await gerar({ tipo: 'texto', onde: 'topo-esq' });
  assert.equal(t.elementos[0].x, 6);
  assert.equal(t.elementos[0].y, 6);
});

test('a posição pedida ANCORA, não redimensiona', async () => {
  // Impor uma caixa junto deformaria o elemento: um ícone forçado a 40% de
  // largura por 20% de altura deixa de ser ícone e vira um borrão esticado.
  const solto = await gerar({ tipo: 'icone' });
  const preso = await gerar({ tipo: 'icone', onde: 'base-dir' });
  assert.equal(preso.elementos[0].w, solto.elementos[0].w, 'a largura do ícone mudou ao pedir posição');
  assert.equal(preso.elementos[0].h, solto.elementos[0].h, 'a altura do ícone mudou ao pedir posição');
});

test('só o primeiro elemento é ancorado', async () => {
  // Empilhar três na mesma caixa esconderia dois deles.
  const r = ai.__clamp({ elementos: [
    { tipo: 'texto', text: 'a', x: 1, y: 1, w: 20, h: 10 },
    { tipo: 'texto', text: 'b', x: 40, y: 60, w: 20, h: 10 },
  ] }, '', { onde: 'topo-esq' }, '16/9');
  assert.equal(r.elementos[0].x, 6);
  assert.equal(r.elementos[1].x, 40, 'o segundo elemento foi empilhado em cima do primeiro');
});

test('a cor pedida entra no elemento', async () => {
  const f = await gerar({ tipo: 'forma', cor: '#ff2d2d' });
  assert.equal(f.elementos[0].fill, '#ff2d2d');
  const i = await gerar({ tipo: 'icone', cor: '#ff2d2d' });
  assert.equal(i.elementos[0].cor, '#ff2d2d');
});

test('o corpo do texto é ajustado para caber no bloco', async () => {
  // "30% OFF EM TUDO" a tamanho 9 num bloco de 70 x 20 quebra em duas linhas e
  // a segunda sai cortada. No editor dá para arrastar; na parede, não.
  const grande = ai.__clamp({ elementos: [
    { tipo: 'texto', text: 'Um texto bem mais comprido do que caberia num bloco tão pequeno assim', x: 6, y: 6, w: 70, h: 20, tamanho: 9, peso: 900 },
  ] }, '', {}, '16/9');
  assert.ok(grande.elementos[0].tamanho < 9, 'o corpo não encolheu');

  const curto = ai.__clamp({ elementos: [
    { tipo: 'texto', text: 'Oi', x: 6, y: 6, w: 70, h: 20, tamanho: 9, peso: 900 },
  ] }, '', {}, '16/9');
  assert.equal(curto.elementos[0].tamanho, 9, 'encolheu um texto que já cabia');
});

test('o ajuste só diminui, nunca aumenta', async () => {
  // Um título um ponto menor do que poderia é invisível; um título esticado
  // por conta própria estoura o layout que a IA compôs.
  const r = ai.__clamp({ elementos: [
    { tipo: 'texto', text: 'Oi', x: 6, y: 6, w: 90, h: 60, tamanho: 3 },
  ] }, '', {}, '16/9');
  assert.equal(r.elementos[0].tamanho, 3);
});

test('a altura do bloco vira cqw antes de comparar com o corpo', async () => {
  // `h` é % da ALTURA e `tamanho` é % da LARGURA. Comparar os dois direto faz
  // a conta errar por quase o dobro numa peça 9/16 — e é a peça vertical que
  // mais estoura texto.
  const deitada = ai.__clamp({ elementos: [{ tipo: 'texto', text: 'Promoção de inverno agora', x: 5, y: 5, w: 60, h: 12, tamanho: 9, peso: 900 }] }, '', {}, '16/9');
  const empe = ai.__clamp({ elementos: [{ tipo: 'texto', text: 'Promoção de inverno agora', x: 5, y: 5, w: 60, h: 12, tamanho: 9, peso: 900 }] }, '', {}, '9/16');
  assert.notEqual(deitada.elementos[0].tamanho, empe.elementos[0].tamanho,
    'o formato deixou de influenciar o ajuste — a conta voltou a ignorar a proporção');
  assert.ok(empe.elementos[0].tamanho > deitada.elementos[0].tamanho,
    'numa peça em pé, 12% de altura é MAIS cqw que numa deitada — o corpo deveria caber melhor');
});

test('texto vazio não vira camada invisível', async () => {
  const r = ai.__clamp({ elementos: [{ tipo: 'texto', text: '   ' }, { tipo: 'texto', text: 'ok' }] }, '', {}, '16/9');
  assert.equal(r.elementos.length, 1);
});

/* ---- a rota e o painel ---- */

test('a rota repassa o pedido guiado', () => {
  const i = SERVER.indexOf("parts[2] === 'generate-composition'");
  const bloco = SERVER.slice(i, i + 1400);
  assert.match(bloco, /pedido: \{/, 'a rota parou de repassar o pedido');
  ['tipo', 'onde', 'cor', 'estilo'].forEach((k) => {
    assert.ok(bloco.includes(k + ':'), 'a rota deixou de repassar "' + k + '"');
  });
});

test('o painel do editor deixa apontar o quê, onde e a cor', () => {
  assert.match(EDITOR, /const \[aiTipo, setAiTipo\]/, 'sumiu a escolha do tipo');
  assert.match(EDITOR, /const \[aiOnde, setAiOnde\]/, 'sumiu a escolha da posição');
  assert.match(EDITOR, /const \[aiCor, setAiCor\]/, 'sumiu a escolha da cor');
  assert.match(EDITOR, /GradeDeLugar/, 'sumiu a grade de posição');
  assert.match(EDITOR, /tipo: aiTipo,[\s\S]{0,120}onde: aiOnde,[\s\S]{0,120}cor: aiCor,/,
    'o painel deixou de enviar o pedido ao servidor');
});

test('pedir um elemento NÃO repinta o fundo da peça', () => {
  // O fundo é decisão da peça inteira. Quem pediu "um ícone no canto" acabava
  // com o fundo repintado, e o trabalho de fundo ia embora sem aviso.
  assert.match(EDITOR, /const trocaFundo = !aiTipo && res\.bg && res\.bg\.cor;/,
    'voltou a trocar o fundo em qualquer geração');
  assert.match(EDITOR, /bg: trocaFundo \? \{ kind: 'cor', cor: res\.bg\.cor \} : d\.bg,/,
    'o fundo deixou de respeitar a decisão acima');
});

test('apontar o tipo já basta — sem precisar escrever frase', () => {
  // Sem descrição padrão, o botão ficaria desabilitado e a pessoa teria que
  // inventar uma frase para conseguir o que já apontou nos botões.
  assert.match(EDITOR, /DESCRICAO_PADRAO/, 'sumiu a descrição padrão por tipo');
  assert.match(EDITOR, /if \(!aiBrief\.trim\(\) && !aiTipo\) return;/,
    'voltou a exigir frase mesmo com o tipo apontado');
});

test('a posição só é oferecida quando se pede UM elemento', () => {
  // A peça inteira tem vários elementos, e cada um vai para um canto — apontar
  // "onde" para ela seria uma pergunta sem resposta.
  assert.match(EDITOR, /\{aiTipo && \([\s\S]{0,300}GradeDeLugar/,
    'a grade de posição aparece mesmo pedindo a peça inteira');
});

test('o prompt oferece os três tipos, não só texto', () => {
  const i = AI.indexOf('async function generateComposition');
  const corpo = AI.slice(i, i + 3000);
  assert.ok(!/de 1 a 3 blocos de TEXTO/.test(corpo), 'o prompt voltou a pedir só texto');
  assert.match(corpo, /"tipo": "forma"/, 'o prompt não descreve forma');
  assert.match(corpo, /"tipo": "icone"/, 'o prompt não descreve ícone');
  assert.match(corpo, /FORMAS_DA_IA\.join/, 'o prompt não lista as formas válidas');
  assert.match(corpo, /ICONES_DA_IA\.join/, 'o prompt não lista os ícones válidos');
});
