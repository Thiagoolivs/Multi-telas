/*
 * O que o dinheiro muda na conta (server/cobranca.js e a regra de atraso em
 * server/plans.js).
 *
 * Os três defeitos que este arquivo guarda deixavam o cliente usar mais do
 * que pagava sem ninguém ter feito nada de errado: a assinatura cobrando as
 * telas do dia do checkout para sempre, o atraso sem consequência nenhuma, e
 * o estorno que devolvia o dinheiro e deixava o plano.
 */
const test = require('node:test');
const assert = require('node:assert');

const C = require('../server/cobranca.js');
const plans = require('../server/plans.js');
const usoIA = require('../server/uso-ia.js');

const DIA = 24 * 60 * 60 * 1000;
const AGORA = 1700000000000;

/* ---------------- Um banco e um Asaas de mentira ---------------- */

function banco(tenants, telasPorConta) {
  const t = {};
  for (const x of tenants) t[x.id] = { ...x };
  return {
    t,
    async getTenant(id) { return t[id] ? { ...t[id] } : null; },
    async countDevices(id) { return telasPorConta[id] || 0; },
    async setTenantBilling(id, f) {
      const map = { plan: 'plan', status: 'plan_status', telasCobradas: 'plan_telas', atrasoDesde: 'atraso_desde', subscriptionId: 'stripe_subscription_id' };
      for (const k of Object.keys(f)) if (map[k] && f[k] !== undefined) t[id][map[k]] = f[k];
    },
    async contasParaConciliar() {
      return Object.values(t).filter((x) => x.stripe_subscription_id
        && (x.plan_telas == null ? -1 : x.plan_telas) !== (telasPorConta[x.id] || 0));
    },
  };
}

function asaas(modo, falhar) {
  const chamadas = [];
  return {
    chamadas,
    mode: () => modo || 'asaas',
    async atualizarValor(sub, plano, valor) {
      if (falhar) throw new Error('Asaas fora do ar');
      chamadas.push({ sub, plano, valor });
    },
  };
}

/* ---------------- 1 · A assinatura acompanha as telas ---------------- */

test('parear mais telas sobe o valor da assinatura', async () => {
  const db = banco([{ id: 'a', plan: 'pro', plan_status: 'active', stripe_subscription_id: 'sub_1', plan_telas: 1 }], { a: 5 });
  const b = asaas();
  const r = await C.sincronizarTelas(db, b, 'a');
  assert.equal(r.mudou, true);
  assert.equal(b.chamadas.length, 1);
  // 5 telas no Pro: 4 cheias + 1 com 10% de desconto — a tabela de plans.js.
  assert.equal(b.chamadas[0].valor, plans.mensalidadeCents('pro', 5) / 100);
  assert.equal(db.t.a.plan_telas, 5);
});

test('conta já em dia não chama o Asaas', async () => {
  const db = banco([{ id: 'a', plan: 'pro', stripe_subscription_id: 'sub_1', plan_telas: 3 }], { a: 3 });
  const b = asaas();
  await C.sincronizarTelas(db, b, 'a');
  assert.equal(b.chamadas.length, 0);
});

test('remover todas as telas cobra uma, não zero', async () => {
  // Assinatura de R$ 0,00 no Asaas é assinatura quebrada: a porta fica aberta
  // e ninguém paga nada.
  const db = banco([{ id: 'a', plan: 'pro', stripe_subscription_id: 'sub_1', plan_telas: 2 }], { a: 0 });
  const b = asaas();
  await C.sincronizarTelas(db, b, 'a');
  assert.equal(b.chamadas[0].valor, plans.mensalidadeCents('pro', 1) / 100);
});

test('assinatura aberta e ainda não paga não é anotada como em dia', async () => {
  // O defeito: anotar aqui fazia a tela pareada entre o checkout e o
  // pagamento nunca entrar na cobrança — a conciliação acharia a conta certa.
  const db = banco([{ id: 'a', plan: 'free', stripe_subscription_id: 'sub_1', plan_telas: 1 }], { a: 2 });
  const b = asaas();
  const r = await C.sincronizarTelas(db, b, 'a');
  assert.equal(r.mudou, false);
  assert.equal(db.t.a.plan_telas, 1, 'continua divergente para a conciliação pegar depois do pagamento');
  assert.equal(b.chamadas.length, 0);
});

test('Enterprise não tem tabela: anota as telas e não mexe no valor', async () => {
  const db = banco([{ id: 'a', plan: 'enterprise', stripe_subscription_id: 'sub_1', plan_telas: 10 }], { a: 30 });
  const b = asaas();
  await C.sincronizarTelas(db, b, 'a');
  assert.equal(b.chamadas.length, 0);
  assert.equal(db.t.a.plan_telas, 30);
});

test('a conciliação acerta o que ficou para trás quando o Asaas falhou', async () => {
  const db = banco([
    { id: 'a', plan: 'pro', stripe_subscription_id: 'sub_a', plan_telas: 1 },
    { id: 'b', plan: 'pro', stripe_subscription_id: 'sub_b', plan_telas: 4 },
    { id: 'c', plan: 'pro', stripe_subscription_id: null, plan_telas: null },
  ], { a: 3, b: 4, c: 9 });

  // Primeira rodada com o Asaas fora: nada é anotado, e o erro é registrado.
  const erros = [];
  const r1 = await C.conciliar(db, asaas('asaas', true), (e) => erros.push(e));
  assert.equal(r1.acertadas, 0);
  assert.equal(erros.length, 1);
  assert.equal(db.t.a.plan_telas, 1, 'falha não pode marcar como acertado');

  // Segunda rodada, com o Asaas de pé: acerta só quem estava errado.
  const b = asaas();
  const r2 = await C.conciliar(db, b, () => {});
  assert.equal(r2.acertadas, 1);
  assert.deepEqual(b.chamadas.map((x) => x.sub), ['sub_a']);
});

test('em modo simulado a conciliação anota sem chamar ninguém', async () => {
  const db = banco([{ id: 'a', plan: 'pro', stripe_subscription_id: 'sub_1', plan_telas: 1 }], { a: 2 });
  const b = asaas('dev');
  await C.sincronizarTelas(db, b, 'a');
  assert.equal(db.t.a.plan_telas, 2);
});

/* ---------------- 2 · Eventos do Asaas ---------------- */

test('pagamento recebido libera o plano e encerra o atraso', () => {
  const p = C.efeitoDoEvento('PAYMENT_RECEIVED', { tenant: { atraso_desde: AGORA - DIA }, planId: 'pro', subId: 's', customerId: 'c' }, AGORA);
  assert.equal(p.plan, 'pro');
  assert.equal(p.status, 'active');
  assert.strictEqual(p.atrasoDesde, null);
});

test('o relógio do atraso começa no primeiro aviso e não anda nas reentregas', () => {
  const primeiro = C.efeitoDoEvento('PAYMENT_OVERDUE', { tenant: { plan: 'pro' } }, AGORA);
  assert.equal(primeiro.atrasoDesde, AGORA);
  // O Asaas reentrega. Se cada reentrega zerasse a data, a carência nunca venceria.
  const reenvio = C.efeitoDoEvento('PAYMENT_OVERDUE', { tenant: { plan: 'pro', atraso_desde: AGORA } }, AGORA + 5 * DIA);
  assert.equal(reenvio.atrasoDesde, AGORA);
});

test('estorno e chargeback tiram o plano', () => {
  for (const ev of ['PAYMENT_REFUNDED', 'PAYMENT_CHARGEBACK_REQUESTED', 'PAYMENT_CHARGEBACK_DISPUTE']) {
    const p = C.efeitoDoEvento(ev, { tenant: { plan: 'pro' } }, AGORA);
    assert.equal(p.plan, 'free', ev);
  }
});

test('assinatura criada não concede plano', () => {
  const p = C.efeitoDoEvento('SUBSCRIPTION_CREATED', { tenant: {}, planId: 'pro', subId: 's', customerId: 'c' }, AGORA);
  assert.equal(p.plan, undefined);
});

test('evento desconhecido não mexe em nada', () => {
  assert.equal(C.efeitoDoEvento('PAYMENT_CREATED', { tenant: {} }, AGORA), null);
});

/* ---------------- 3 · Atraso: 7 dias de carência ---------------- */

const atrasada = (dias) => ({ id: 't', plan: 'pro', plan_status: 'past_due', atraso_desde: AGORA - dias * DIA, created_at: AGORA - 90 * DIA });

test('durante a carência nada muda', () => {
  assert.equal(plans.podeParear(atrasada(3), 1, AGORA).ok, true);
  const s = plans.situacaoAtraso(atrasada(3), AGORA);
  assert.equal(s.bloqueado, false);
  assert.equal(s.diasAteBloquear, 4);
});

test('passada a carência, tela nova não pareia', () => {
  const v = plans.podeParear(atrasada(8), 1, AGORA);
  assert.equal(v.ok, false);
  assert.equal(v.motivo, 'atraso');
});

test('conta marcada atrasada sem data não é cortada no chute', () => {
  const t = { ...atrasada(30), atraso_desde: null };
  assert.equal(plans.bloqueioPorAtraso(t, AGORA), null);
});

test('conta em dia não tem atraso', () => {
  assert.equal(plans.situacaoAtraso({ plan: 'pro', plan_status: 'active', atraso_desde: AGORA - 30 * DIA }, AGORA), null);
});

function bancoDeCreditos(conta) {
  let c = conta;
  return {
    async getCreditos() { return c; },
    async setCreditos(_, n) { c = n; },
    async countDevices() { return 4; },
    get conta() { return c; },
  };
}

test('passada a carência, IA que custa crédito é recusada com a mensagem certa', async () => {
  const db = bancoDeCreditos({ franquiaRestante: 100, creditosComprados: 0, cicloEm: Date.now() - DIA });
  const t = { ...atrasada(8), atraso_desde: Date.now() - 8 * DIA };
  const r = await usoIA.conferir(db, t, 'gerar-imagem', 1);
  assert.equal(r.ok, false);
  assert.equal(r.resposta.erro, 'pagamento_atrasado');
  assert.match(r.resposta.mensagem, /continuam no ar/);
});

test('passada a carência, a franquia não repõe na virada do mês', async () => {
  const velho = Date.now() - 40 * DIA;
  const db = bancoDeCreditos({ franquiaRestante: 0, creditosComprados: 0, cicloEm: velho });
  const t = { ...atrasada(8), atraso_desde: Date.now() - 8 * DIA };
  await usoIA.garantirCiclo(db, t);
  assert.equal(db.conta.franquiaRestante, 0);
  assert.equal(db.conta.cicloEm, velho, 'o ciclo não anda: repõe quando pagar');

  // Pagou: repõe na próxima chamada.
  await usoIA.garantirCiclo(db, { ...t, plan_status: 'active', atraso_desde: null });
  assert.equal(db.conta.franquiaRestante, plans.franquiaCreditos('pro', 4));
});

test('checkout abandonado não vira atraso de quem nunca pagou', () => {
  // Assinou, não pagou, o Asaas mandou OVERDUE. A conta segue no grátis.
  assert.equal(C.efeitoDoEvento('PAYMENT_OVERDUE', { tenant: { plan: 'free' } }, AGORA), null);
  const t = { plan: 'free', plan_status: 'past_due', atraso_desde: AGORA - 30 * DIA, created_at: AGORA - 3 * DIA };
  assert.equal(plans.situacaoAtraso(t, AGORA), null);
});

test('pagar a fatura nova com a velha ainda vencida não zera o atraso', () => {
  const p = C.efeitoDoEvento('PAYMENT_RECEIVED', { tenant: { plan: 'pro', atraso_desde: AGORA - 20 * DIA }, planId: 'pro', outrasVencidas: 1 }, AGORA);
  assert.equal(p.status, 'past_due');
  assert.ok(!('atrasoDesde' in p), 'a data do atraso tem que continuar a mesma');
});
