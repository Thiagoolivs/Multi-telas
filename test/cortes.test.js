/*
 * Texto cortado não fica feio na TV nem no Criados (visto no teste do dono
 * no navegador, 23/10): "nas TVs da lo" no nome da campanha e no letreiro;
 * "30% off até" no cabeçalho.
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const C = require('../server/compositor');
const conversa = require('../server/ai-conversa');

test('nome da campanha: a primeira frase, cortada na palavra e sem conector pendurado', () => {
  assert.equal(conversa.nomeDoPedido('Promoção de óculos de sol: 30% off até sábado, nas TVs da loja'), 'Promoção de óculos de sol: 30% off até sábado, nas TVs');
  assert.equal(conversa.nomeDoPedido('Pão de queijo por R$ 9,90. Só à tarde'), 'Pão de queijo por R$ 9,90');
  assert.ok(conversa.nomeDoPedido('a'.repeat(90)).length <= 60);
});

test('o corte na palavra não deixa "até", "de", "nas" no fim', () => {
  assert.equal(C.cortarNaPalavra('Promoção de óculos de sol: 30% off até sábado, nas TVs da loja', 38), 'Promoção de óculos de sol: 30% off');
  assert.equal(C.cortarNaPalavra('Semana do cliente com vinte por cento de desconto', 38), 'Semana do cliente com vinte por cento');
  // O que cabe fica como está, conector e tudo.
  assert.equal(C.cortarNaPalavra('Pão de queijo em dobro até', 38), 'Pão de queijo em dobro até');
});
