/*
 * As regras de SAÍDA da cobrança e o preço por frente (QA de lançamento,
 * 03/11 — decisões do dono; docs/qa/regras-de-negocio-e-mercado.md).
 *
 * Cada teste guarda um vazamento achado pelo consultor:
 *   - cancelar cortava o plano NA HORA, contra o que o painel e os Termos
 *     prometem ("até o fim do período já pago");
 *   - o grátis ficava com todas as TVs pareadas enquanto pagava;
 *   - quem saía do anual e assinava de novo herdava o preço do anual;
 *   - a fatura vencida (OVERDUE) não aparecia para quem estava em atraso;
 *   - os créditos de pacote, pagos, travavam no teto em reais da conta;
 *   - o preço era o mesmo R$ 149 para as três frentes.
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert');

const plans = require('../server/plans.js');
const cobranca = require('../server/cobranca.js');
const usoIA = require('../server/uso-ia.js');
const L = require('../server/lembretes.js');

const DIA = 864e5;
const AGORA = Date.parse('2026-11-03T12:00:00Z');
const pago = (x) => ({ id: 't1', plan: 'pro', plan_status: 'active', created_at: AGORA - 90 * DIA, ...x });

/* ---------------- Cancelamento no fim do período pago ---------------- */

test('cancelar com o mês pago: o plano fica até o fim do período, e o contrato anual sai já', () => {
  const t = pago({ plan_renews_at: AGORA + 12 * DIA, stripe_subscription_id: 'sub_1', plan_contrato: 'anual', contrato_desde: AGORA - 100 * DIA });
  const p = cobranca.efeitoDoEvento('SUBSCRIPTION_DELETED', { tenant: t, subId: 'sub_1' }, AGORA);
  assert.equal(p.plan, undefined, 'o plano pago não cai na hora');
  assert.equal(p.status, plans.CANCELANDO);
  assert.equal(p.renewsAt, AGORA + 12 * DIA);
  assert.equal(p.subscriptionId, null);
  assert.equal(p.contrato, null, 'quem assina de novo não herda o preço do anual');
  assert.equal(p.contratoDesde, null);
  // O Asaas também avisa por SUBSCRIPTION_INACTIVATED: mesma regra.
  assert.deepStrictEqual(cobranca.efeitoDoEvento('SUBSCRIPTION_INACTIVATED', { tenant: t, subId: 'sub_1' }, AGORA), p);
});

test('cancelar sem período pago pela frente (atraso, data vencida): rebaixa na hora, como antes', () => {
  const atrasada = pago({ plan_status: 'past_due', atraso_desde: AGORA - 5 * DIA, plan_renews_at: AGORA + 10 * DIA });
  assert.equal(cobranca.efeitoDoEvento('SUBSCRIPTION_DELETED', { tenant: atrasada }, AGORA).plan, 'free');
  const vencida = pago({ plan_renews_at: AGORA - DIA });
  assert.equal(cobranca.efeitoDoEvento('SUBSCRIPTION_DELETED', { tenant: vencida }, AGORA).plan, 'free');
  // Sem a data na conta, vale o próximo vencimento que o Asaas manda no evento.
  const semData = pago({});
  const p = cobranca.efeitoDoEvento('SUBSCRIPTION_DELETED', { tenant: semData, renewsAt: AGORA + 5 * DIA }, AGORA);
  assert.equal(p.status, plans.CANCELANDO);
  assert.equal(p.renewsAt, AGORA + 5 * DIA);
});

test('o aviso de uma assinatura antiga não cancela a nova', () => {
  const t = pago({ stripe_subscription_id: 'sub_nova', plan_renews_at: AGORA + 20 * DIA });
  assert.equal(cobranca.efeitoDoEvento('SUBSCRIPTION_DELETED', { tenant: t, subId: 'sub_velha' }, AGORA), null);
});

test('passado o fim do período cancelado, a conta cai para o grátis (leitura e varredura)', async () => {
  const gravados = [];
  const eventos = [];
  const contas = [
    pago({ id: 'venceu', plan_status: plans.CANCELANDO, plan_renews_at: AGORA - 60 * 1000 }),
    pago({ id: 'ainda', plan_status: plans.CANCELANDO, plan_renews_at: AGORA + DIA }),
    pago({ id: 'ativa', plan_renews_at: AGORA - DIA }),
  ];
  const db = {
    async contasPagas() { return contas; },
    async setTenantBilling(id, patch) { gravados.push([id, patch]); },
    async registrarEvento(id, u, acao) { eventos.push([id, acao]); },
  };
  assert.equal(await cobranca.varrerCancelamentos(db, AGORA), 1);
  assert.deepStrictEqual(gravados.map((g) => g[0]), ['venceu']);
  assert.equal(gravados[0][1].plan, 'free');
  assert.deepStrictEqual(eventos, [['venceu', 'plano.rebaixado']]);
  assert.equal(plans.cancelamentoVenceu(contas[1], AGORA), false);
  assert.equal(plans.cancelamentoVenceu(contas[2], AGORA), false, 'conta ativa com a data passada é só a renovação atrasando');
  const lido = await cobranca.rebaixarSeVenceu(db, contas[0], AGORA);
  assert.equal(lido.plan, 'free');
  assert.equal(await cobranca.rebaixarSeVenceu(db, contas[1], AGORA), contas[1], 'antes do fim, nada muda');
});

/* ---------------- Depois do grátis, só 1 TV no ar ---------------- */

test('no grátis (cancelou, estornou, teste acabou) só 1 TV fica no ar; pagando, todas', () => {
  assert.equal(plans.telasNoAr(pago({}), AGORA), null, 'em dia: todas');
  assert.equal(plans.telasNoAr(pago({ plan_status: plans.CANCELANDO, plan_renews_at: AGORA + DIA }), AGORA), null, 'no período pago: todas');
  assert.equal(plans.telasNoAr(pago({ plan_status: plans.CANCELANDO, plan_renews_at: AGORA - DIA }), AGORA), 1, 'passou do período: já pausa, mesmo antes da varredura');
  assert.equal(plans.telasNoAr({ plan: 'free', plan_status: 'canceled', created_at: AGORA - 90 * DIA }, AGORA), 1);
  assert.equal(plans.telasNoAr({ plan: 'free', plan_status: 'estornado', created_at: AGORA - 90 * DIA }, AGORA), 1);
  assert.equal(plans.telasNoAr({ plan: 'free', created_at: AGORA - 20 * DIA }, AGORA), 1, 'teste acabou');
  // Atraso: só depois da suspensão (20 dias).
  assert.equal(plans.telasNoAr(pago({ plan_status: 'past_due', atraso_desde: AGORA - 19 * DIA }), AGORA), null);
  assert.equal(plans.telasNoAr(pago({ plan_status: 'past_due', atraso_desde: AGORA - 21 * DIA }), AGORA), 1);
  assert.match(plans.PAUSA.texto, /^Esta TV está pausada: reative o plano em app\.multitelas\.net\.br$/);
});

/* ---------------- Preço por frente ---------------- */

test('a frente da conta decide o preço; listagem sem a coluna relê a conta', async () => {
  const db = { async getTenant() { return { id: 't9', perfil: 'saude', name: 'Clínica' } } };
  assert.equal(await cobranca.frenteDaConta(db, { id: 't9', perfil: 'empresa' }), 'empresa');
  assert.equal(await cobranca.frenteDaConta(db, { id: 't9' }), 'saude', 'linha sem perfil: relê a conta, não deduz por cima');
  assert.equal(await cobranca.frenteDaConta(db, null), 'comercio');
  const quebrado = { async getTenant() { throw new Error('fora'); } };
  assert.equal(await cobranca.frenteDaConta(quebrado, { id: 'x' }), 'comercio', 'falha não derruba a cobrança');
});

test('a assinatura acompanha as telas no preço da frente', async () => {
  const chamadas = [];
  const db = {
    async getTenant() { return pago({ perfil: 'empresa', stripe_subscription_id: 'sub_1', plan_telas: 1 }); },
    async countDevices() { return 3; },
    async setTenantBilling() {},
  };
  const billing = { mode: () => 'asaas', async atualizarValor(sub, plano, valor, contrato) { chamadas.push({ valor, contrato }); } };
  const r = await cobranca.sincronizarTelas(db, billing, 't1');
  assert.equal(r.valor, 3 * 159);
  assert.equal(chamadas[0].valor, 3 * 159);
});

test('o e-mail do fim do teste fala o preço da frente da conta', () => {
  const conta = { id: 'c', plan: 'free', email: 'a@b.c', telas: 1, created_at: AGORA - 12 * DIA };
  assert.ok(L.mensagem('2d', { ...conta, frente: 'saude' }, 'https://app.x', AGORA).text.includes('R$ 139,00 por tela'));
  assert.ok(L.mensagem('2d', { ...conta, frente: 'empresa' }, 'https://app.x', AGORA).text.includes('R$ 159,00 por tela'));
  assert.ok(L.mensagem('fim', { ...conta, frente: 'comercio' }, 'https://app.x', AGORA).text.includes('R$ 79,00 por tela'));
});

/* ---------------- Pacote pago não trava no teto ---------------- */

test('criações de pacote somam ao teto em reais; a franquia continua com o teto dela', async () => {
  const PAGANTE = { id: 't_pac', plan: 'pro', plan_status: 'active', created_at: Date.now() - 60 * DIA };
  const franquia = plans.franquiaCreditos('pro', 1);
  const tetoBase = usoIA.tetoDaConta(PAGANTE, 1);
  const banco = (imagens, custo) => ({
    contarUsoIA: async () => 0,
    gastoIAGlobal: async () => 0,
    countDevices: async () => 1,
    resumoUsoIA: async () => ({ creditos: imagens, custoCentavos: custo, chamadas: imagens }),
    getCreditos: async () => ({ franquiaRestante: 0, creditosComprados: 80, cicloEm: Date.now() - DIA }),
    setCreditos: async () => {},
  });
  // Gastou a franquia inteira e mais 60 imagens do pacote: antes travava (gasto > teto da franquia).
  const imagens = franquia + 60;
  const gasto = tetoBase + 60 * 35 - 100;
  const r = await usoIA.podeUsarTexto(banco(imagens, gasto), PAGANTE);
  assert.equal(r.ok, true, 'com pacote pago, a IA segue');
  assert.equal(r.teto, tetoBase + 60 * 35);
  // Dentro da franquia o teto é o de sempre: quem não comprou nada não ganha folga.
  assert.equal(usoIA.folgaDoComprado(PAGANTE, 1, franquia), 0);
  const semPacote = await usoIA.podeUsarTexto(banco(franquia, tetoBase), { ...PAGANTE, id: 't_pac2' });
  assert.equal(semPacote.ok, false);
  assert.equal(semPacote.corpo.erro, 'teto_ia');
});

/* ---------------- O que vai para o Asaas ---------------- */

function comAsaasFalso(respostas, tarefa) {
  const chaveAntes = process.env.ASAAS_API_KEY;
  const fetchAntes = globalThis.fetch;
  process.env.ASAAS_API_KEY = 'chave-de-teste';
  delete require.cache[require.resolve('../server/billing.js')];
  const chamadas = [];
  globalThis.fetch = async (url, opcoes) => {
    const corpo = opcoes && opcoes.body ? JSON.parse(opcoes.body) : null;
    const metodo = (opcoes && opcoes.method) || 'GET';
    chamadas.push({ url: String(url), metodo, corpo });
    return { ok: true, status: 200, text: async () => JSON.stringify(respostas(String(url), metodo, corpo)) };
  };
  const billing = require('../server/billing.js');
  return Promise.resolve(tarefa(billing, chamadas)).finally(() => {
    globalThis.fetch = fetchAntes;
    if (chaveAntes === undefined) delete process.env.ASAAS_API_KEY;
    else process.env.ASAAS_API_KEY = chaveAntes;
    delete require.cache[require.resolve('../server/billing.js')];
  });
}

test('o checkout cobra o preço da frente, e quem volta no período pago não paga o mês duas vezes', async () => {
  await comAsaasFalso((url, metodo) => {
    if (url.includes('/customers')) return { id: 'cus_1', cpfCnpj: '1' };
    if (url.includes('/subscriptions') && metodo === 'GET') return { data: [] };
    if (url.includes('/subscriptions')) return { id: 'sub_1' };
    if (url.includes('/payments')) return { data: [{ invoiceUrl: 'https://asaas.test/f/1' }] };
    return {};
  }, async (billing, chamadas) => {
    const fim = Date.parse('2027-01-15T12:00:00Z');
    await billing.createCheckout({ id: 't1', stripe_customer_id: 'cus_1' }, {}, 'pro', 'https://app', { telas: 2, frente: 'saude', pagoAte: fim });
    const criacao = chamadas.find((c) => c.metodo === 'POST' && /\/subscriptions$/.test(c.url));
    assert.equal(criacao.corpo.value, 2 * 139);
    assert.equal(criacao.corpo.nextDueDate, '2027-01-15');
  });
  assert.equal(require('../server/billing.js').vencimentoInicial(0, AGORA), '2026-11-03', 'sem período pago, vence hoje');
});

test('a fatura VENCIDA aparece antes da pendente (quem está em atraso precisa do link)', async () => {
  await comAsaasFalso((url) => {
    if (url.includes('/subscriptions/')) return { id: 'sub_1', status: 'ACTIVE', value: 79, nextDueDate: '2026-12-01', cycle: 'MONTHLY' };
    if (url.includes('status=OVERDUE')) return { data: [{ invoiceUrl: 'https://asaas.test/vencida', value: 79, dueDate: '2026-10-01' }] };
    if (url.includes('status=PENDING')) return { data: [{ invoiceUrl: 'https://asaas.test/pendente', value: 79, dueDate: '2026-11-01' }] };
    return {};
  }, async (billing) => {
    const r = await billing.assinatura({ stripe_subscription_id: 'sub_1' });
    assert.equal(r.fatura.url, 'https://asaas.test/vencida');
    assert.equal(r.fatura.vencida, true);
  });
  await comAsaasFalso((url) => {
    if (url.includes('/subscriptions/')) return { id: 'sub_1', status: 'ACTIVE' };
    if (url.includes('status=OVERDUE')) return { data: [] };
    return { data: [{ invoiceUrl: 'https://asaas.test/pendente', value: 79 }] };
  }, async (billing) => {
    const r = await billing.assinatura({ stripe_subscription_id: 'sub_1' });
    assert.equal(r.fatura.url, 'https://asaas.test/pendente');
    assert.equal(r.fatura.vencida, false);
  });
});
