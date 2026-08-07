/*
 * A memória é o que faz a décima campanha ter mais cara da empresa que a
 * primeira. Também é o que o sistema DEDUZ de alguém — então tem que ser
 * contida, revisável e nunca virar depósito de ruído.
 */
const test = require('node:test');
const assert = require('node:assert');
const ai = require('../server/ai');
const memoria = require('../server/ai-memoria');

function comModelo(responder, fn) {
  const mode = ai.mode, call = ai.callLLM;
  ai.mode = () => 'real';
  ai.callLLM = async () => responder();
  return Promise.resolve(fn()).finally(() => { ai.mode = mode; ai.callLLM = call; });
}

const cheia = {
  segmento: 'padaria de bairro',
  publico: 'quem passa a pé de manhã',
  diferenciais: ['pão saindo do forno de hora em hora'],
  argumentos: ['preço justo', 'atendimento que conhece o cliente'],
  evitar: ['promessa de "o melhor da cidade"'],
  jeitoDeFalar: 'direto e caloroso',
  notas: ['abre às 6h'],
};

test('memória vazia não vira texto de prompt', () => {
  assert.equal(memoria.comoTexto(memoria.vazia()), '');
  assert.equal(memoria.comoTexto(null), '');
  assert.equal(memoria.temConteudo(memoria.vazia()), false);
});

test('memória cheia vira instrução para quem cria', () => {
  const t = memoria.comoTexto(cheia);
  assert.ok(t.includes('padaria de bairro'));
  assert.ok(/NUNCA prometa/.test(t), 'o que evitar precisa chegar como proibição');
  assert.ok(t.includes('direto e caloroso'));
});

test('sem chave de IA a memória não é inventada', async () => {
  const r = await memoria.aprender(cheia, [{ papel: 'pessoa', texto: 'oi' }], {});
  assert.deepEqual(r, memoria.normalizar(cheia), 'devolveu a anterior intacta');
});

test('falha do modelo preserva a memória anterior em vez de perdê-la', async () => {
  await comModelo(() => { throw new Error('fora do ar'); }, async () => {
    const r = await memoria.aprender(cheia, [], {});
    assert.equal(r.segmento, 'padaria de bairro');
    assert.equal(r.argumentos.length, 2);
  });
});

/*
 * O risco real de uma memória automática é crescer para sempre: a cada
 * conversa mais um item, até o prompt virar um paredão que o modelo ignora.
 */
test('a memória é limitada e não acumula sem fim', async () => {
  const inchada = () => JSON.stringify({
    segmento: 'x'.repeat(500), publico: 'y'.repeat(500),
    diferenciais: Array(30).fill('item'), argumentos: Array(30).fill('a'),
    evitar: Array(30).fill('e'), jeitoDeFalar: 'z'.repeat(500),
    notas: Array(30).fill('n'),
  });
  await comModelo(inchada, async () => {
    const r = await memoria.aprender({}, [], {});
    assert.ok(r.segmento.length <= 160);
    assert.ok(r.diferenciais.length <= 6);
    assert.ok(r.notas.length <= 6);
  });
});

test('itens repetidos não entram duas vezes', async () => {
  const repetida = () => JSON.stringify({
    argumentos: ['preço justo', 'preço justo', 'preço justo', 'entrega rápida'],
  });
  await comModelo(repetida, async () => {
    const r = await memoria.aprender({}, [], {});
    assert.deepEqual(r.argumentos, ['preço justo', 'entrega rápida']);
  });
});

test('normalizar aceita lixo sem quebrar', () => {
  for (const v of [null, undefined, 'texto', 42, [], { diferenciais: 'não é lista' }]) {
    const r = memoria.normalizar(v);
    assert.ok(Array.isArray(r.diferenciais));
    assert.equal(typeof r.segmento, 'string');
  }
});
