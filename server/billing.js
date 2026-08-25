/*
 * server/billing.js - cobrança de assinatura.
 *
 * Dois modos, escolhidos por ambiente:
 *   - 'asaas' quando ASAAS_API_KEY está definida: cria clientes e assinaturas no Asaas.
 *   - 'dev'   caso contrário: um checkout SIMULADO local (página clara de
 *     "pagamento de teste") que ativa o plano na hora. Deixa todo o fluxo do
 *     painel testável sem chaves nem rede.
 */
const crypto = require('crypto');
const { plan, PLANS, mensalidadeCents } = require('./plans');

const ASAAS_KEY = process.env.ASAAS_API_KEY || '';
const WEBHOOK_TOKEN = process.env.ASAAS_WEBHOOK_TOKEN || '';
/*
 * A sandbox é escolhida por variável PRÓPRIA, e não por NODE_ENV.
 *
 * Estava em `NODE_ENV === 'development'`, que este projeto não define em
 * lugar nenhum — nem no Railway, nem na máquina, nem na suíte. Quem testasse
 * com chave de sandbox bateria na API DE PRODUÇÃO, e o erro só apareceria
 * como cobrança de verdade na conta de alguém.
 *
 * Padrão é produção de propósito: esquecer de ligar a sandbox faz o teste
 * falhar alto (chave de sandbox não vale em produção), enquanto o contrário
 * — esquecer de desligar — cobraria de ninguém e passaria despercebido.
 */
const SANDBOX = String(process.env.ASAAS_AMBIENTE || '').toLowerCase() === 'sandbox';
const API = SANDBOX ? 'https://api-sandbox.asaas.com/v3' : 'https://api.asaas.com/v3';

/*
 * Prazo em toda chamada de rede.
 *
 * Sem isto, um Asaas pendurado pendura a requisição de checkout do cliente —
 * a mesma classe de defeito que deixou a API inteira muda. Trinta segundos é
 * folgado para uma REST e curto o bastante para virar erro legível.
 */
const PRAZO_MS = 30000;

function mode() { return ASAAS_KEY ? 'asaas' : 'dev'; }

/* ---------------- Asaas REST ---------------- */
async function asaasApi(path, params, method = 'GET') {
  const options = {
    method,
    headers: {
      'access_token': ASAAS_KEY,
      'Content-Type': 'application/json',
      'User-Agent': 'Multi-telas'
    }
  };
  if (params && method !== 'GET') options.body = JSON.stringify(params);
  
  let url = API + path;
  if (params && method === 'GET') {
    url += '?' + new URLSearchParams(params).toString();
  }
  
  let res;
  try {
    res = await fetch(url, { ...options, signal: AbortSignal.timeout(PRAZO_MS) });
  } catch (e) {
    // TimeoutError e falha de rede viram a mesma frase: o que o chamador
    // precisa saber é que NÃO houve resposta, não qual camada desistiu.
    throw new Error('o Asaas não respondeu (' + (e.name || 'erro de rede') + ')');
  }
  /*
   * O corpo pode não ser JSON: proxy caído devolve HTML, e `res.json()`
   * estouraria um SyntaxError de parser no lugar do erro de verdade.
   */
  const bruto = await res.text();
  let data;
  try { data = bruto ? JSON.parse(bruto) : {}; }
  catch (e) {
    throw new Error('Asaas devolveu resposta ilegível (HTTP ' + res.status + ')');
  }
  if (!res.ok) {
    const err = (data.errors && data.errors.length)
      ? data.errors.map((e) => e.description).join(', ')
      : 'Asaas HTTP ' + res.status;
    throw new Error(err);
  }
  return data;
}

/* ---------------- Checkout ---------------- */
/*
 * `opcoes.telas` é quantas telas a conta tem hoje, e `opcoes.aoCriarCliente`
 * grava o id do cliente ASSIM QUE ELE EXISTE. Os dois são obrigatórios em
 * modo Asaas — cada um conserta um defeito, e os dois estão explicados abaixo.
 */
async function createCheckout(tenant, user, planId, origin, opcoes) {
  const o = opcoes || {};
  const p = plan(planId);
  /*
   * O campo é `precoTelaCents`. `priceCents` nunca existiu em plans.js, então
   * `undefined <= 0` era `false` e a guarda passava TUDO — inclusive o plano
   * grátis, que no Asaas viraria uma assinatura de R$ 0,00 por mês.
   */
  if (!p || !(p.precoTelaCents > 0)) throw new Error('plano inválido para cobrança');

  if (mode() === 'dev') {
    return { url: origin + '/api/billing/dev-checkout?plan=' + encodeURIComponent(planId), simulated: true };
  }

  let customerId = tenant.stripe_customer_id; // mantemos a coluna antiga p/ compatibilidade

  if (!customerId) {
    const custRes = await asaasApi('/customers', {
      name: tenant.name || user.name || 'Cliente',
      email: user.email,
      externalReference: tenant.id,
    }, 'POST');
    customerId = custRes.id;
    /*
     * GRAVA AGORA, e não no retorno.
     *
     * O id do cliente só era gravado depois que a função inteira voltava. Se
     * qualquer chamada seguinte falhasse — e a busca da fatura falha fácil,
     * ver abaixo —, o cliente já existia no Asaas e não existia aqui: a
     * próxima tentativa criava OUTRO cliente e OUTRA assinatura, e o cartão
     * passava duas vezes. Gravar antes torna a repetição inofensiva.
     */
    if (o.aoCriarCliente) await o.aoCriarCliente(customerId);
  }

  /*
   * ASSINATURA JÁ ABERTA É REAPROVEITADA.
   *
   * Sem esta consulta, clicar duas vezes em "assinar" — ou tentar de novo
   * depois de um erro — abria uma segunda assinatura mensal para o mesmo
   * cliente. Duas assinaturas ativas cobram duas vezes, todo mês, e ninguém
   * percebe até o cliente reclamar.
   */
  const jaTem = await asaasApi('/subscriptions', { customer: customerId, status: 'ACTIVE', limit: 10 });
  const aberta = (jaTem.data || []).find((x) => String(x.externalReference || '').split('|')[1] === planId);

  const sub = aberta || await asaasApi('/subscriptions', {
    customer: customerId,
    billingType: 'UNDEFINED',
    /*
     * O VALOR É DA CONTA, não de uma tela.
     *
     * Estava em `precoTelaCents`, que é o preço de UMA tela. Dez telas no
     * Essencial: cobrado R$ 79,00, devido R$ 736,28. Quarenta e nove:
     * cobrado R$ 79,00, devido R$ 3.096,80. `mensalidadeCents` já existia e
     * já aplica as faixas de desconto por volume — só não era chamada.
     */
    value: mensalidadeCents(planId, Math.max(1, Number(o.telas) || 1)) / 100,
    nextDueDate: new Date().toISOString().split('T')[0],
    cycle: 'MONTHLY',
    description: 'Assinatura do Plano ' + p.name,
    externalReference: tenant.id + '|' + planId,
  }, 'POST');

  /*
   * A fatura da assinatura recém-criada pode não existir ainda: são dois
   * registros diferentes no Asaas, e o segundo aparece um instante depois.
   * Três tentativas curtas resolvem sem pendurar o cliente esperando.
   */
  let invoiceUrl = '';
  for (let tentativa = 1; tentativa <= 3 && !invoiceUrl; tentativa++) {
    const pagamentos = await asaasApi('/payments', { subscription: sub.id, limit: 1 });
    invoiceUrl = (pagamentos.data && pagamentos.data[0] && pagamentos.data[0].invoiceUrl) || '';
    if (!invoiceUrl && tentativa < 3) await new Promise((r) => setTimeout(r, 600 * tentativa));
  }

  /*
   * Sem fatura, a assinatura EXISTE — devolver o erro seco faria a pessoa
   * tentar de novo e a busca acima reencontraria esta mesma assinatura, sem
   * criar outra. O que não pode é sumir com o id.
   */
  if (!invoiceUrl) {
    const e = new Error('a assinatura foi criada, mas o Asaas ainda não gerou a fatura — tente abrir de novo em instantes');
    e.subscriptionId = sub.id;
    e.customerId = customerId;
    throw e;
  }

  return { url: invoiceUrl, id: sub.id, customerId, reaproveitada: !!aberta };
}

// Portal de gerenciamento
async function createPortal(tenant, origin) {
  if (mode() === 'dev') return { url: origin + '/app?billing=portal-dev', simulated: true };
  
  // O Asaas não tem um portal unificado como o Stripe, então direcionamos para a invoice
  // aberta se houver, ou para um cancelamento interno no nosso app.
  // Por ora, vamos retornar uma url interna que renderiza uma página de gestão nossa.
  return { url: origin + '/app?billing=portal' };
}

/* ---------------- Webhook ---------------- */
function verifyWebhook(rawBody, authHeader) {
  if (!WEBHOOK_TOKEN) throw new Error('ASAAS_WEBHOOK_TOKEN ausente');
  if (!mesmoSegredo(authHeader, WEBHOOK_TOKEN)) throw new Error('assinatura de webhook inválida');
  return JSON.parse(Buffer.isBuffer(rawBody) ? rawBody.toString('utf8') : rawBody);
}

/*
 * Comparação de segredo em tempo constante.
 *
 * `a !== b` para em cima da primeira letra diferente, e o tempo dessa parada
 * vaza quantas letras estavam certas. Com token de webhook isso é adivinhação
 * byte a byte, e quem adivinha manda PAYMENT_RECEIVED de graça.
 *
 * O digest normaliza o comprimento antes de comparar: `timingSafeEqual` exige
 * buffers do mesmo tamanho e estoura — e o próprio estouro já contaria o
 * tamanho do segredo a quem tentasse.
 */
function mesmoSegredo(recebido, esperado) {
  const a = crypto.createHash('sha256').update(String(recebido || ''), 'utf8').digest();
  const b = crypto.createHash('sha256').update(String(esperado), 'utf8').digest();
  return crypto.timingSafeEqual(a, b);
}

// Descobre planId do Asaas (Como Asaas não tem price ID fixo como Stripe,
// a gente infere pelo \`externalReference\` ou pelo valor)
// No Asaas, salvaremos o tenant.id no externalReference. E o webhook nos dirá o subscription.
// Em vez de planIdFromPrice, faremos algo na aplicação para mapear.
function planIdFromPrice(priceId) {
  // Mock para não quebrar referências antigas do Stripe
  return null; 
}

module.exports = { mode, createCheckout, createPortal, verifyWebhook, planIdFromPrice, asaasApi };
