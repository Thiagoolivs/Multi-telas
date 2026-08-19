/*
 * O teste de 14 dias.
 *
 * Aqui mora dinheiro, então os testes cobrem as bordas em vez do caminho
 * feliz: a conta que nasceu agora, a que venceu ontem, a que venceu por uma
 * hora, e a que pagou. Um erro nesta conta ou deixa alguém usar de graça para
 * sempre, ou tranca um cliente que pagou — e o segundo é bem pior.
 */
const test = require('node:test');
const assert = require('node:assert');
const plans = require('../server/plans.js');

const DIA = 24 * 60 * 60 * 1000;
const AGORA = Date.UTC(2026, 0, 20, 12, 0, 0);
const conta = (dias, plano) => ({ plan: plano || 'free', created_at: AGORA - dias * DIA });

test('conta recém-criada pode ligar a primeira tela', () => {
  const v = plans.podeParear(conta(0), 0, AGORA);
  assert.equal(v.ok, true);
  assert.equal(v.dias, 14, 'devia anunciar os 14 dias cheios');
});

test('no último dia do teste ainda dá para ligar', () => {
  // 13 dias e meio: ainda dentro. Errar para o lado de trancar o cliente é o
  // erro caro — ele liga o suporte, não assina.
  const t = { plan: 'free', created_at: AGORA - 13.5 * DIA };
  assert.equal(plans.podeParear(t, 0, AGORA).ok, true);
});

test('passado o prazo, parear é recusado — e o motivo é o prazo', () => {
  const v = plans.podeParear(conta(15), 0, AGORA);
  assert.equal(v.ok, false);
  assert.equal(v.motivo, 'teste_vencido', 'o motivo errado manda a pessoa para a tela errada');
});

test('vencido por uma hora já conta como vencido', () => {
  const t = { plan: 'free', created_at: AGORA - 14 * DIA - 60 * 60 * 1000 };
  assert.equal(plans.podeParear(t, 0, AGORA).ok, false);
});

test('quem paga não esbarra no prazo, nunca', () => {
  /*
   * O erro caro. Uma conta paga criada há um ano não pode ser tratada como
   * teste vencido só porque nasceu antes — a data de criação é a mesma.
   */
  for (const plano of ['essencial', 'pro', 'enterprise']) {
    const v = plans.podeParear(conta(400, plano), 0, AGORA);
    assert.equal(v.ok, true, plano + ' foi barrado pelo prazo do teste');
  }
});

test('quem paga esbarra no limite de telas, e o motivo é o limite', () => {
  const v = plans.podeParear(conta(30, 'essencial'), 49, AGORA);
  assert.equal(v.ok, false);
  assert.equal(v.motivo, 'limite');
  assert.equal(v.limite, 49);
});

test('dentro do teste, a segunda tela esbarra no limite (não no prazo)', () => {
  // O grátis dá uma tela. Quem já tem uma e tenta a segunda precisa ouvir
  // "faça upgrade", e não "seu teste acabou" — que seria mentira.
  const v = plans.podeParear(conta(1), 1, AGORA);
  assert.equal(v.ok, false);
  assert.equal(v.motivo, 'limite');
});

/* ---------------- A contagem de dias ---------------- */

test('os dias restantes arredondam para cima, como a pessoa conta', () => {
  // Faltando 30 horas, ninguém diz "tenho 1,25 dias".
  const t = { plan: 'free', created_at: AGORA - 14 * DIA + 30 * 60 * 60 * 1000 };
  assert.equal(plans.diasDeTesteRestantes(t, AGORA), 2);
});

test('teste vencido não devolve dias negativos', () => {
  assert.equal(plans.diasDeTesteRestantes(conta(90), AGORA), 0);
});

test('conta sem data de criação não trava ninguém por acidente', () => {
  /*
   * Uma linha antiga sem `created_at` daria fim-de-teste em 1970 e trancaria a
   * conta na hora. Melhor deixar passar e cobrar depois do que barrar um
   * cliente por causa de um campo vazio.
   */
  assert.equal(plans.fimDoTeste({ plan: 'free' }), 0);
  assert.equal(plans.diasDeTesteRestantes({ plan: 'free' }, AGORA), 0);
});

test('o prazo conta do nascimento da conta, não do primeiro pareamento', () => {
  // Contar do pareamento premiaria quem enrola para começar — e é justamente
  // quem enrola que nunca começa.
  const t = conta(3);
  assert.equal(plans.fimDoTeste(t), t.created_at + 14 * DIA);
});
