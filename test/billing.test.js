/*
 * Cobrança: preço por tela, franquia de crédito e o que acontece quando o
 * crédito acaba.
 *
 * O princípio que estes testes guardam, e que vale mais que qualquer número
 * de tabela: A TELA NUNCA PARA. Crédito acabado bloqueia gerar imagem, e nada
 * além disso. Uma tela que apaga por causa de fatura fica visível o dia todo
 * para os funcionários e clientes do cliente — o prejuízo de reputação é
 * maior que a fatura.
 *
 * A conta aberta está em docs/BILLING.md.
 */
const test = require('node:test');
const assert = require('node:assert');
const plans = require('../server/plans');
const cred = require('../server/creditos');

/* ---------------- Preço por tela ---------------- */

test('preço por tela, sem desconto abaixo de 5 telas', () => {
  assert.equal(plans.mensalidadeCents('pro', 1), 14900);
  assert.equal(plans.mensalidadeCents('pro', 4), 14900 * 4);
  assert.equal(plans.mensalidadeCents('pro', 1), 14900);
});

test('o desconto é da faixa em que a próxima tela cai', () => {
  assert.equal(plans.descontoVolume(4), 0);
  assert.equal(plans.descontoVolume(5), 0.10);
  assert.equal(plans.descontoVolume(9), 0.10);
  assert.equal(plans.descontoVolume(10), 0.18);
  assert.equal(plans.descontoVolume(19), 0.18);
  assert.equal(plans.descontoVolume(20), 0.25);
  assert.equal(plans.descontoVolume(500), 0.25);
});

test('o desconto vale só para as telas daquela faixa', () => {
  // 5 telas no Pro: 4 cheias + 1 com 10% de desconto.
  assert.equal(plans.mensalidadeCents('pro', 5), 14900 * 4 + 13410);
  // 10 telas: 4 cheias + 5 a −10% + 1 a −18%.
  assert.equal(plans.mensalidadeCents('pro', 10), 14900 * 4 + 13410 * 5 + 12218);
});

test('a próxima tela sempre custa alguma coisa', () => {
  // O número que a pessoa quer ver antes de parear mais uma.
  assert.equal(plans.precoProximaTelaCents('pro', 4), 13410);   // a 5ª entra a −10%
  assert.equal(plans.precoProximaTelaCents('pro', 9), 12218);   // a 10ª entra a −18%
  assert.equal(plans.precoProximaTelaCents('pro', 19), 11175);  // a 20ª entra a −25%
  assert.equal(plans.precoProximaTelaCents('pro', 0), 14900);
});

test('o preço médio por tela cai conforme a conta cresce', () => {
  const medio = (n) => plans.precoTelaCents('pro', n);
  assert.ok(medio(50) < medio(20));
  assert.ok(medio(20) < medio(10));
  assert.ok(medio(10) < medio(4));
});

test('crescer nunca fica mais barato em nenhuma virada de faixa', () => {
  for (const p of ['pro']) {
    for (let n = 1; n < 60; n++) {
      assert.ok(
        plans.mensalidadeCents(p, n + 1) > plans.mensalidadeCents(p, n),
        p + ': ' + (n + 1) + ' telas custaria menos que ' + n,
      );
    }
  }
});

test('Enterprise não tem preço de tabela', () => {
  assert.equal(plans.mensalidadeCents('enterprise', 100), null);
  assert.equal(plans.plan('enterprise').sobConsulta, true);
  assert.ok(plans.isPaid('enterprise'), 'Enterprise precisa contar como pago');
});

test('grátis é uma tela e o resto é limitado', () => {
  assert.equal(plans.screenLimit('free'), 1);
  assert.equal(plans.mensalidadeCents('free', 1), 0);
  assert.equal(plans.temRecurso('free', 'mural'), false);
  assert.equal(plans.temRecurso('pro', 'mural'), true);
  assert.equal(plans.temRecurso('free', 'marca'), false);
  assert.equal(plans.temRecurso('pro', 'marca'), true);
});

/* ---------------- Cotas por tela ---------------- */

test('armazenamento é por conta, somando as telas', () => {
  // Cinco telas no Pro dão 50 GB no total, e não 10 GB isolados por tela —
  // cota isolada obrigaria o cliente a decidir em qual tela cada arquivo mora.
  const GB = 1024 * 1024 * 1024;
  assert.equal(plans.cotaBytes('pro', 5), 50 * GB);
  assert.equal(plans.cotaBytes('pro', 3), 30 * GB);
  assert.equal(plans.cotaBytes('free', 1), 0.5 * GB);
});

test('franquia de crédito também é por tela', () => {
  assert.equal(plans.franquiaCreditos('pro', 1), 25);
  assert.equal(plans.franquiaCreditos('pro', 10), 250);
  assert.equal(plans.franquiaCreditos('pro', 4), 100);
  assert.equal(plans.franquiaCreditos('free', 1), 0, 'o grátis ganha só as boas-vindas');
});

/* ---------------- O que custa crédito ---------------- */

test('imagem custa crédito; texto não', () => {
  assert.equal(cred.custaCredito('gerar-imagem'), true);
  assert.equal(cred.custaCredito('campanha-peca'), true);

  for (const t of ['briefing', 'gerar-conteudo', 'gerar-campanha', 'gerar-composicao',
    'gerar-kit', 'gerar-sazonal', 'gerar-faixas', 'reescrever', 'diagnosticar', 'diretor']) {
    assert.equal(cred.custaCredito(t), false, t + ' passou a cobrar crédito');
  }
});

test('campanha cobra uma por peça', () => {
  assert.equal(cred.creditosDe('campanha-peca', 6), 6);
  assert.equal(cred.creditosDe('gerar-imagem', 1), 1);
  assert.equal(cred.creditosDe('briefing', 50), 0, 'texto em volume continua de graça');
});

test('operação desconhecida não cobra às cegas', () => {
  // Endpoint novo que ninguém classificou não pode sair debitando por conta
  // própria — e também não pode explodir.
  assert.equal(cred.operacao('inventado'), null);
  assert.equal(cred.creditosDe('inventado', 3), 0);
  assert.equal(cred.custaCredito('inventado'), false);
});

/* ---------------- Saldo ---------------- */

test('gasta primeiro a franquia, depois o comprado', () => {
  /*
   * A franquia expira no fim do ciclo e o comprado não. Gastar o comprado
   * primeiro faria o cliente perder crédito que ele PAGOU, enquanto o que ia
   * expirar de graça sobrava.
   */
  const r = cred.debitar({ franquiaRestante: 10, creditosComprados: 100 }, 4);
  assert.deepEqual(r, { daFranquia: 4, doComprado: 0 });
});

test('quando a franquia não cobre, o resto sai do comprado', () => {
  const r = cred.debitar({ franquiaRestante: 3, creditosComprados: 100 }, 10);
  assert.deepEqual(r, { daFranquia: 3, doComprado: 7 });
});

test('sem saldo suficiente, não debita nada', () => {
  // Debitar parcial deixaria a conta gerando metade da campanha e devendo a
  // outra metade.
  assert.equal(cred.debitar({ franquiaRestante: 2, creditosComprados: 1 }, 6), null);
});

test('debitar zero é permitido e não mexe no saldo', () => {
  assert.deepEqual(cred.debitar({ franquiaRestante: 5, creditosComprados: 0 }, 0), { daFranquia: 0, doComprado: 0 });
});

test('saldo negativo no banco não vira crédito', () => {
  const s = cred.saldo({ franquiaRestante: -50, creditosComprados: -3 });
  assert.deepEqual(s, { franquia: 0, comprado: 0, total: 0 });
});

/* ---------------- Quando acaba ---------------- */

test('a mensagem de saldo zerado diz, primeiro, que a tela continua no ar', () => {
  /*
   * Este teste guarda uma decisão de produto, não um formato. O primeiro que
   * a pessoa lê ao esbarrar no limite não pode ser uma ameaça à operação
   * dela.
   */
  const r = cred.semSaldo(6, 2);
  assert.equal(r.erro, 'creditos_insuficientes');
  assert.equal(r.precisa, 6);
  assert.equal(r.tem, 2);
  assert.match(r.mensagem, /telas continuam no ar/i);
  assert.match(r.mensagem, /editor continua/i);
  // E oferece saída sem pagar: montar a campanha com o que já está na
  // biblioteca.
  assert.ok(r.saidas.includes('usar-biblioteca'));
  assert.ok(r.saidas.includes('comprar-pacote'));
});
