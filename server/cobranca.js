/*
 * server/cobranca.js — o que o dinheiro muda na conta, e a assinatura
 * acompanhando as telas.
 *
 * Três buracos moravam aqui, e os três deixavam o cliente usar mais do que
 * pagava sem ninguém ter feito nada de errado:
 *
 *   1. A assinatura não acompanhava as telas. O valor era calculado UMA vez,
 *      no checkout, com as telas daquele dia. Quem assinava com 1 tela e
 *      pareava mais 48 pagava por 1 — e o painel mostrava a mensalidade certa,
 *      o que tornava o erro invisível para os dois lados.
 *   2. Atraso não tinha consequência. PAYMENT_OVERDUE marcava `past_due` e
 *      nada no sistema olhava para isso: a franquia de IA renovava todo mês e
 *      o pareamento seguia aberto, para sempre.
 *   3. Estorno e chargeback eram ignorados. O dinheiro voltava e o plano
 *      ficava.
 *
 * A tela continua nunca parando (docs/BILLING.md): nada aqui apaga parede
 * de cliente. O que se corta é o que custa dinheiro a nós — IA e tela nova.
 */
'use strict';

const plans = require('./plans');

/*
 * O que um evento do Asaas faz com a conta. PURO: recebe o evento e a conta,
 * devolve o patch de `setTenantBilling` (ou null). Mora aqui, e não no
 * handler HTTP, porque é aqui que dá para provar cada caso num teste.
 *
 * `planId` vem do externalReference ("tenant|plano"), quando houver.
 */
function efeitoDoEvento(evento, ctx, agora) {
  const c = ctx || {};
  const t = c.tenant || {};
  const quando = agora || Date.now();

  switch (evento) {
    case 'PAYMENT_RECEIVED':
    case 'PAYMENT_CONFIRMED': {
      const p = { status: 'active', customerId: c.customerId, subscriptionId: c.subId, atrasoDesde: null };
      if (c.planId) p.plan = c.planId;
      if (c.renewsAt) p.renewsAt = c.renewsAt;
      /*
       * Pagou ESTA fatura — mas pode haver outra, mais velha, ainda vencida
       * (pagou o mês 2 e não o 1). O Asaas não reenvia o OVERDUE do mês 1,
       * então zerar o atraso aqui devolveria IA e pareamento a quem ainda
       * deve. Quem chama pergunta ao Asaas e passa `outrasVencidas`.
       */
      if (c.outrasVencidas > 0) { p.status = 'past_due'; delete p.atrasoDesde; }
      return p;
    }
    case 'PAYMENT_OVERDUE':
      // Conta sem plano pago (checkout abandonado) não tem atraso a contar.
      if (!plans.isPaid(t.plan || 'free')) return null;
      /*
       * O relógio da carência começa no PRIMEIRO aviso de atraso e não anda
       * a cada reentrega. O Asaas reenvia o mesmo evento; se cada reenvio
       * zerasse a data, a carência nunca venceria.
       */
      return { status: 'past_due', atrasoDesde: Number(t.atraso_desde) || quando };
    case 'SUBSCRIPTION_DELETED':
      return { plan: 'free', status: 'canceled', subscriptionId: null, renewsAt: null, atrasoDesde: null, telasCobradas: null };
    case 'SUBSCRIPTION_CREATED':
      // Assinatura criada NÃO é pagamento recebido: só os identificadores.
      return { customerId: c.customerId, subscriptionId: c.subId };
    /*
     * O dinheiro voltou para o cliente: o plano volta junto.
     *
     * A assinatura NÃO é cancelada daqui. Um estorno pode ser acerto
     * comercial seu (devolver um mês e seguir), e cancelar sozinho decidiria
     * isso por você. Se ela seguir ativa, o próximo pagamento devolve o
     * plano pelo caminho normal.
     */
    case 'PAYMENT_REFUNDED':
    case 'PAYMENT_CHARGEBACK_REQUESTED':
    case 'PAYMENT_CHARGEBACK_DISPUTE':
      return { plan: 'free', status: evento === 'PAYMENT_REFUNDED' ? 'estornado' : 'chargeback' };
    default:
      return null;
  }
}

/*
 * Evento de um PACOTE de créditos (externalReference "tenant|pacote|id").
 *
 * Fica separado de efeitoDoEvento de propósito: o atraso ou o estorno de um
 * pacote avulso não pode derrubar o plano da conta, e cair no mesmo switch
 * faria exatamente isso. Pacote vencido sem pagar não faz nada — ele só vale
 * quando pago.
 */
function efeitoDoPacote(evento) {
  if (evento === 'PAYMENT_RECEIVED' || evento === 'PAYMENT_CONFIRMED') return 'creditar';
  if (evento === 'PAYMENT_REFUNDED' || evento === 'PAYMENT_CHARGEBACK_REQUESTED' || evento === 'PAYMENT_CHARGEBACK_DISPUTE') return 'estornar';
  return null;
}

/* "tenant|pacote|p100" → { tenantId, pacoteId }, ou null se não for pacote. */
function referenciaDePacote(ref) {
  const p = String(ref || '').split('|');
  return p.length === 3 && p[1] === 'pacote' && p[0] && p[2] ? { tenantId: p[0], pacoteId: p[2] } : null;
}

/*
 * Quanto a assinatura DEVERIA cobrar com estas telas, em reais (o Asaas
 * trabalha em reais). Zero tela cobra uma: a assinatura é a porta, e uma
 * conta paga sem tela nenhuma é quase sempre a véspera de parear a primeira.
 */
function valorDaAssinatura(planId, telas) {
  const cents = plans.mensalidadeCents(planId, Math.max(1, Number(telas) || 0));
  return cents == null ? null : cents / 100;
}

/*
 * Leva o valor da assinatura para o número de telas de agora.
 *
 * Chamado depois de parear e de remover tela, e pela conciliação. Nunca
 * derruba quem chamou: o pareamento já aconteceu, e uma falha do Asaas aqui
 * fica para a conciliação refazer.
 */
async function sincronizarTelas(db, billing, tenantId) {
  const tenant = await db.getTenant(tenantId);
  if (!tenant || !tenant.stripe_subscription_id) return { mudou: false, motivo: 'sem-assinatura' };
  const telas = await db.countDevices(tenantId);
  if (Number(tenant.plan_telas) === telas) return { mudou: false, motivo: 'em-dia' };

  /*
   * Assinatura aberta e ainda não paga (a conta segue no grátis): não mexe e
   * NÃO anota. Se anotasse, a tela pareada entre o checkout e o pagamento
   * ficaria de fora para sempre — depois de pago, a conciliação acharia a
   * conta "em dia".
   */
  if (!plans.isPaid(tenant.plan)) return { mudou: false, motivo: 'nao-pago' };

  const valor = valorDaAssinatura(tenant.plan, telas);
  // Enterprise é contrato: o valor não sai da tabela. Só anota as telas para
  // a conciliação não voltar nesta conta a cada rodada.
  if (valor == null) {
    await db.setTenantBilling(tenantId, { telasCobradas: telas });
    return { mudou: false, motivo: 'sem-tabela' };
  }
  if (billing.mode() === 'asaas') {
    await billing.atualizarValor(tenant.stripe_subscription_id, tenant.plan, valor);
  }
  await db.setTenantBilling(tenantId, { telasCobradas: telas });
  return { mudou: true, telas, valor };
}

/*
 * Rede de segurança: acha toda conta cuja assinatura cobra um número de
 * telas diferente do pareado e acerta. Existe porque o acerto na hora do
 * pareamento depende do Asaas estar de pé naquele segundo.
 */
async function conciliar(db, billing, registrarErro) {
  const contas = await db.contasParaConciliar();
  let acertadas = 0;
  for (const c of contas) {
    try {
      const r = await sincronizarTelas(db, billing, c.id);
      if (r.mudou) acertadas++;
    } catch (e) {
      if (registrarErro) registrarErro(e, { onde: 'conciliação de telas', tenant: c.id });
    }
  }
  return { verificadas: contas.length, acertadas };
}

const INTERVALO_CONCILIACAO_MS = 6 * 60 * 60 * 1000;
let timer = null;
function ligarConciliacao(db, billing, registrarErro) {
  if (timer) return;
  const rodar = () => conciliar(db, billing, registrarErro).catch((e) => registrarErro && registrarErro(e, { onde: 'conciliação de telas' }));
  // Primeira rodada um minuto depois do boot: o deploy não compete com ela.
  setTimeout(rodar, 60 * 1000).unref();
  timer = setInterval(rodar, INTERVALO_CONCILIACAO_MS);
  timer.unref();
}

module.exports = { efeitoDoEvento, efeitoDoPacote, referenciaDePacote, valorDaAssinatura, sincronizarTelas, conciliar, ligarConciliacao };
