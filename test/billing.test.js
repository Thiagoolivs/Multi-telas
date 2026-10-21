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

/* ---------------- Preço por tela: mensal e anual (PLANO §6.1) ---------------- */

test('mensal: R$ 149 por tela, sem contrato e sem desconto por volume', () => {
  assert.equal(plans.mensalidadeCents('pro', 1), 14900);
  assert.equal(plans.mensalidadeCents('pro', 4), 14900 * 4);
  assert.equal(plans.mensalidadeCents('pro', 20, 'mensal'), 14900 * 20, 'o desconto por volume é só do anual');
  // Contrato desconhecido é mensal: nunca cai num preço que ninguém assinou.
  assert.equal(plans.mensalidadeCents('pro', 5, 'trimestral'), 14900 * 5);
});

test('anual: o preço da faixa em que a próxima tela cai', () => {
  // O número que a pessoa quer ver antes de parear mais uma.
  assert.equal(plans.precoProximaTelaCents('pro', 0, 'anual'), 12000);  // 1ª a 3ª: R$ 120
  assert.equal(plans.precoProximaTelaCents('pro', 3, 'anual'), 10800);  // 4ª a 10ª: R$ 108
  assert.equal(plans.precoProximaTelaCents('pro', 10, 'anual'), 9600);  // 11ª a 25ª: R$ 96
  assert.equal(plans.precoProximaTelaCents('pro', 4, 'mensal'), 14900);
});

test('anual: só as telas daquela faixa pagam o preço dela', () => {
  // O exemplo do PLANO §6.1: 5 telas no anual = 3 × 120 + 2 × 108 = R$ 576.
  assert.equal(plans.mensalidadeCents('pro', 5, 'anual'), 57600);
  // 11 telas: 3 × 120 + 7 × 108 + 1 × 96.
  assert.equal(plans.mensalidadeCents('pro', 11, 'anual'), 3 * 12000 + 7 * 10800 + 9600);
});

test('anual: da 26ª tela em diante é negociado, e nunca abaixo do piso', () => {
  assert.equal(plans.TELAS_NEGOCIADAS, 26);
  const ultima = plans.FAIXAS_ANUAL[plans.FAIXAS_ANUAL.length - 1];
  assert.equal(ultima.negociado, true);
  assert.ok(ultima.precoTelaCents >= plans.PISO_NEGOCIADO_CENTS, 'o preço sem conversa ficou abaixo do piso');
  assert.equal(plans.PISO_NEGOCIADO_CENTS, 9000);
  const f = plans.faixasAnual();
  assert.deepStrictEqual(f.map((x) => [x.de, x.ate, x.negociado]), [[1, 3, false], [4, 10, false], [11, 25, false], [26, null, true]]);
});

test('o preço médio por tela cai no anual conforme a conta cresce', () => {
  const medio = (n) => plans.precoTelaCents('pro', n, 'anual');
  assert.ok(medio(25) < medio(10));
  assert.ok(medio(10) < medio(3));
  assert.ok(medio(1) < plans.precoTelaCents('pro', 1, 'mensal'), 'o anual tem que ser mais barato que o mensal');
});

test('crescer nunca fica mais barato em nenhuma virada de faixa', () => {
  for (const contrato of ['mensal', 'anual']) {
    for (let n = 1; n < 60; n++) {
      assert.ok(
        plans.mensalidadeCents('pro', n + 1, contrato) > plans.mensalidadeCents('pro', n, contrato),
        contrato + ': ' + (n + 1) + ' telas custaria menos que ' + n,
      );
    }
  }
});

test('multa do anual: o maior entre 30% do que falta e o custo não recuperado (PLANO §6.3)', () => {
  // O exemplo do PLANO: 5 telas, cancela no 4º mês, devolve os aparelhos.
  const devolveu = plans.multaCancelamentoCents({ telas: 5, mesesUsados: 4, visitaRetirada: true });
  assert.equal(devolveu.a, 138240, '(a) 30% de 8 × R$ 576');
  assert.equal(devolveu.b, 82600, '(b) (R$ 745 − R$ 576) × 4 + R$ 150 de retirada');
  assert.equal(devolveu.cents, 138240);
  // Sem devolver os 5 aparelhos: (b) soma R$ 210 por aparelho e passa a valer.
  assert.equal(plans.multaCancelamentoCents({ telas: 5, mesesUsados: 4, visitaRetirada: true, aparelhosNaoDevolvidos: 5 }).cents, 187600);
  // No fim do contrato, nada falta pagar.
  assert.equal(plans.multaCancelamentoCents({ telas: 5, mesesUsados: 12 }).a, 0);
  /*
   * ATENÇÃO, e por isso o teste existe: pela fórmula escrita, (b) CRESCE com
   * os meses usados — no 11º mês a multa é R$ 1.859, mais que no 4º. O PLANO
   * diz que "quem cancela perto do fim paga pouco", e a fórmula não faz isso.
   * Ficou como está escrito, com a pergunta feita ao dono (issue #135).
   */
  assert.equal(plans.multaCancelamentoCents({ telas: 5, mesesUsados: 11 }).cents, 185900);
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

test('o teto de IA é por conta: 85 criações até 3 telas, cresce com as telas, até 228 (PLANO §6.5)', () => {
  // R$ 30 até 3 telas, + R$ 3 por tela a mais, teto R$ 80 — em criações de ~R$ 0,35.
  assert.equal(plans.franquiaCreditos('pro', 1), 85);
  assert.equal(plans.franquiaCreditos('pro', 3), 85, 'até 3 telas é o mesmo teto');
  assert.equal(plans.franquiaCreditos('pro', 4), 94);
  assert.equal(plans.franquiaCreditos('pro', 20), 228);
  assert.equal(plans.franquiaCreditos('pro', 49), 228, 'nunca passa de R$ 80');
  assert.equal(plans.tetoIaCents(100), 8000);
  // Era por tela (25 cada): dez telas davam 250, quase três vezes o teto de hoje.
  assert.ok(plans.franquiaCreditos('pro', 10) < 250);
  assert.equal(plans.franquiaCreditos('enterprise', 3), 85, 'Enterprise segue a mesma régua, salvo contrato');
  assert.equal(plans.franquiaCreditos('free', 1), 0, 'o grátis tem só as criações do teste');
  assert.equal(plans.CRIACOES_DO_TESTE, 20);
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
