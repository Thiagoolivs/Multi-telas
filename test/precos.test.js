/*
 * Tabela de preços (js/precos.js + renderPrecos em js/render.js).
 *
 * O cardápio de uma padaria tem trinta itens e muda toda semana; o dono cola
 * a lista do jeito que ela estiver. O que estes testes guardam: a leitura
 * aceita o que as pessoas escrevem de verdade, e o arranjo escolhe a maior
 * letra possível — medido no navegador, três colunas fixas deixavam a letra
 * miúda e meia zona vazia.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const P = require('../js/precos.js');
const RAIZ = path.join(__dirname, '..');

test('lê os jeitos comuns de escrever nome e preço', () => {
  const l = P.ler([
    'Café expresso ; 6,00',
    'Pão de queijo - R$ 4,50',
    'Misto quente .... 12',
    'Suco natural\t10,00',   // colado da planilha
    'X-Burguer 25,90',       // hífen no nome não é separador
    'Combo 2 ; 15',          // número no nome não é preço
  ].join('\n'));
  assert.deepEqual(l.map((x) => [x.nome, x.preco]), [
    ['Café expresso', 'R$ 6,00'], ['Pão de queijo', 'R$ 4,50'], ['Misto quente', 'R$ 12,00'],
    ['Suco natural', 'R$ 10,00'], ['X-Burguer', 'R$ 25,90'], ['Combo 2', 'R$ 15,00'],
  ]);
});

test('linha sem preço vira seção; linhas vazias somem', () => {
  const l = P.ler('BEBIDAS\n\n  \nÁgua ; 4\nDoces:');
  assert.deepEqual(l.map((x) => x.tipo + ':' + x.nome), ['secao:BEBIDAS', 'item:Água', 'secao:Doces']);
});

test('preço sempre com duas casas: tabela com casas desiguais lê torta', () => {
  assert.equal(P.formatarPreco('12'), 'R$ 12,00');
  assert.equal(P.formatarPreco('9,5'), 'R$ 9,50');
  assert.equal(P.formatarPreco('3.75'), 'R$ 3,75');
});

test('arranjo: poucas linhas numa coluna; muitas, em mais colunas', () => {
  const poucos = P.ler('A ; 1\nB ; 2\nC ; 3\nD ; 4');
  assert.equal(P.layout(poucos, 0.6).cols, 1);
  const muitos = P.ler(Array.from({ length: 24 }, (_, i) => 'Item ' + i + ' ; ' + (i + 1)).join('\n'));
  assert.ok(P.layout(muitos, 0.6).cols >= 2, 'vinte e quatro itens numa coluna só na TV deitada');
});

test('arranjo escolhe a maior letra, e em pé prefere menos colunas', () => {
  // Nomes compridos: em três colunas a letra sai miúda. Deitada, duas ganham.
  const longos = P.ler(Array.from({ length: 19 }, (_, i) => 'Refrigerante lata ' + String.fromCharCode(65 + i) + ' ; 10').join('\n'));
  const deitada = P.layout(longos, 0.6);
  const tres = P.medidas(longos, 3);
  assert.ok(deitada.efetivo >= Math.min(tres.cqh * 0.6, tres.cqw), 'escolheu um arranjo pior que o de três colunas');
  assert.notEqual(deitada.cols, 3);
  assert.equal(P.layout(longos, 1.7).cols, 1);
});

test('colunas pedidas pelo dono mandam', () => {
  const l = P.ler('A ; 1\nB ; 2');
  assert.equal(P.layout(l, 0.6, '3').cols, 3);
  assert.equal(P.layout(l, 0.6, 'auto').cols, 1);
});

test('a TV conhece o tipo, carrega o módulo e o guarda para rodar offline', () => {
  const render = fs.readFileSync(path.join(RAIZ, 'js', 'render.js'), 'utf8');
  assert.match(render, /precos: renderPrecos,/);
  assert.match(fs.readFileSync(path.join(RAIZ, 'player.html'), 'utf8'), /<script src="js\/precos\.js"><\/script>/);
  assert.match(fs.readFileSync(path.join(RAIZ, 'sw.js'), 'utf8'), /'\/js\/precos\.js'/);
  // A lista que encolhe para caber também vale para a tabela.
  assert.match(fs.readFileSync(path.join(RAIZ, 'js', 'player.js'), 'utf8'), /:scope > \.mt-precos-inner/);
});
