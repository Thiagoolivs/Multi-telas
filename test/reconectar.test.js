/*
 * Reconectar move o nome e a programação de uma tela para outra e apaga a
 * primeira. Fazer isso a partir de um código de seis caracteres pede guardas
 * de verdade — e é por isso que elas não moram dentro da rota HTTP.
 *
 * O caso que existe no mundo: a TV Samsung fecha o navegador, ele limpa o
 * armazenamento, e ela volta pedindo pareamento com um código novo. A tela
 * antiga fica no painel offline para sempre, ocupando vaga do plano, e a única
 * saída era apagar e refazer a programação do zero.
 */
const test = require('node:test');
const assert = require('node:assert');
const { impedimento } = require('../server/reconectar');

const AGORA = 1_700_000_000_000;
const JANELA = 2 * 60 * 1000;
const MINHA = 'ten_eu';

const tela = (extra) => Object.assign({ id: 'dev_antiga', tenant_id: MINHA, name: 'Recepção' }, extra);
const tv = (extra) => Object.assign({ id: 'dev_nova', tenant_id: null, last_seen: AGORA - 5000 }, extra);

test('a TV que está na tela agora pode ser adotada', () => {
  assert.equal(impedimento(tela(), tv(), MINHA, AGORA, JANELA), null);
});

test('código de outra conta não é adotável', () => {
  // A guarda que impede levar a tela de outro cliente com um código de seis
  // caracteres. Vale mesmo quando o código está correto e a TV está viva.
  const r = impedimento(tela(), tv({ tenant_id: 'ten_outro' }), MINHA, AGORA, JANELA);
  assert.equal(r.status, 409);
  assert.match(r.error, /outra conta/);
});

test('não dá para reconectar a tela de outra conta', () => {
  const r = impedimento(tela({ tenant_id: 'ten_outro' }), tv(), MINHA, AGORA, JANELA);
  assert.equal(r.status, 403);
});

test('código anotado num papel não vale meses depois', () => {
  const r = impedimento(tela(), tv({ last_seen: AGORA - 60 * 60 * 1000 }), MINHA, AGORA, JANELA);
  assert.equal(r.status, 410);
  assert.match(r.error, /expirado/);
});

test('TV que nunca deu sinal de vida não vale', () => {
  const r = impedimento(tela(), tv({ last_seen: 0 }), MINHA, AGORA, JANELA);
  assert.equal(r.status, 410);
});

test('código inexistente', () => {
  assert.equal(impedimento(tela(), null, MINHA, AGORA, JANELA).status, 404);
});

test('reconectar a tela nela mesma não faz sentido', () => {
  // Sem esta guarda a rota apagaria a própria tela que acabou de reivindicar.
  const r = impedimento(tela(), tv({ id: 'dev_antiga', tenant_id: MINHA }), MINHA, AGORA, JANELA);
  assert.equal(r.status, 409);
});

test('a TV que já é minha pode ser readotada por outra tela', () => {
  // Acontece quando a pessoa pareia a TV como tela nova ANTES de perceber que
  // podia reconectar. A programação da tela antiga ainda precisa chegar lá.
  assert.equal(impedimento(tela(), tv({ tenant_id: MINHA }), MINHA, AGORA, JANELA), null);
});
