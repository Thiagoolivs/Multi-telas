/*
 * server/cortesia.js — contas liberadas para testar.
 *
 * PARA QUE SERVE
 *
 * Mandar o produto para alguém experimentar de verdade. O teste de 14 dias
 * responde "isto funciona na minha parede?" para um cliente; não responde nada
 * para quem você chamou para olhar: uma tela só, cinco créditos de IA e meio
 * giga não deixam ninguém exercitar o produto, e o prazo vence no meio da
 * conversa.
 *
 * Uma conta de cortesia recebe os limites do plano Pro — telas, crédito de IA,
 * armazenamento e todos os recursos — sem pagar e sem prazo.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CORTESIA NÃO É OPERADOR, e a separação é a razão de este módulo existir
 * em vez de uma linha dentro de operadores.js.
 *
 * `ADMIN_EMAILS` dá acesso aos dados de TODAS as contas. `CONTAS_CORTESIA` dá
 * um plano pago de graça DENTRO da própria conta, e nada além disso. São duas
 * variáveis porque são dois riscos de tamanhos diferentes: acrescentar alguém
 * à lista de teste é rotina, e nenhuma rotina deveria poder virar "essa pessoa
 * agora vê os clientes todos" por descuido de digitação.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * A LISTA MANDA NOS DOIS SENTIDOS.
 *
 * Entrar na lista promove; SAIR dela devolve a conta para o grátis. Só
 * promover seria fazer cada cortesia durar para sempre — e a conta continuaria
 * com 49 telas e crédito de IA muito depois de o teste ter acabado, gastando
 * dinheiro de verdade em chamada de modelo.
 *
 * A volta só alcança quem está marcado como cortesia (`plan_status`). Conta
 * que paga nunca é tocada aqui: um erro nesse sentido derrubaria o plano de um
 * cliente pagante, e ele descobriria ao tentar ligar a quinta tela.
 */

const PLANO = 'pro';
const STATUS = 'cortesia';

function listaDoAmbiente() {
  return String(process.env.CONTAS_CORTESIA || '')
    .split(/[,;\s]+/)
    .map((e) => e.trim().toLowerCase())
    .filter((e) => e.includes('@'));
}

function ehCortesia(email) {
  const e = String(email || '').trim().toLowerCase();
  return !!e && listaDoAmbiente().includes(e);
}

/*
 * Acerta o plano da conta conforme a lista, e devolve o que fez.
 *
 * Chamada nos pontos de ENTRADA (cadastro e login), não a cada requisição: é
 * uma escrita no banco, e o valor de reagir em um segundo em vez de no próximo
 * login não paga uma escrita por página carregada. O efeito prático é que
 * acrescentar alguém à lista vale a partir do próximo login dessa pessoa —
 * que é quando ela vai olhar, porque foi quando você a avisou.
 */
async function sincronizar(db, tenantId, email) {
  if (!tenantId) return 'nada';
  const tenant = await db.getTenant(tenantId);
  if (!tenant) return 'nada';

  const marcada = tenant.plan_status === STATUS;
  const naLista = ehCortesia(email);

  if (naLista && !marcada) {
    /*
     * Uma conta que JÁ PAGA não vira cortesia. Trocar o plano de quem tem
     * assinatura ativa desligaria a cobrança sem ninguém pedir, e o rastro
     * disso no Stripe não volta atrás sozinho.
     */
    if (tenant.stripe_subscription_id) return 'nada';
    await db.setTenantBilling(tenantId, { plan: PLANO, status: STATUS });
    return 'promoveu';
  }
  if (!naLista && marcada) {
    await db.setTenantBilling(tenantId, { plan: 'free', status: 'free' });
    return 'devolveu';
  }
  return 'nada';
}

/* A conta está em cortesia? Lida do tenant, não da lista — é o que vale. */
function contaEmCortesia(tenant) {
  return !!tenant && tenant.plan_status === STATUS;
}

module.exports = { PLANO, STATUS, listaDoAmbiente, ehCortesia, sincronizar, contaEmCortesia };
