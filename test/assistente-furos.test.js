/*
 * Furos vistos no teste do assistente do Criar no navegador (24/10), sem IA.
 */
const test = require('node:test');
const assert = require('node:assert');
const ajusteTela = require('../server/ajuste-tela.js');
const avisoRapido = require('../server/aviso-rapido.js');

const TV = { layoutId: 'corporate', orientacao: 'landscape', tema: '' };

test('"muda o tema da TV do balcão para claro": o claro longe do tema', async () => {
  for (const t of ['muda o tema da tv do balcão para claro', 'muda o tema para claro na tv do balcão']) {
    assert.deepEqual((await ajusteTela.entender(t, TV, [])).mudancas, { fundo: 'claro' }, t);
  }
  assert.deepEqual((await ajusteTela.entender('muda o fundo pra escuro', TV, [])).mudancas, { fundo: 'escuro' });
  // A cor continua sendo cor: "azul claro" não é o tema claro.
  assert.equal((await ajusteTela.entender('fundo azul claro', TV, [])).mudancas.fundo, 'cor');
});

test('"avisa que o piso está molhado": o cartaz é o que vem depois do "avisa que"', () => {
  const hoje = new Date('2026-10-24T12:00:00');
  assert.equal(avisoRapido.semIA('avisa que o piso do corredor está molhado', hoje, []).titulo, 'O piso do corredor está molhado');
  assert.equal(avisoRapido.semIA('avise a todos que a reunião mudou', hoje, []).titulo, 'A reunião mudou');
  assert.equal(avisoRapido.semIA('Aviso: piso molhado no corredor', hoje, []).titulo, 'Piso molhado no corredor');
});
