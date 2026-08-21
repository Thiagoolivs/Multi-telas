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
const { plan, PLANS } = require('./plans');

const ASAAS_KEY = process.env.ASAAS_API_KEY || '';
const WEBHOOK_TOKEN = process.env.ASAAS_WEBHOOK_TOKEN || '';
const API = process.env.NODE_ENV === 'development' ? 'https://sandbox.asaas.com/api/v3' : 'https://api.asaas.com/v3';

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
  
  const res = await fetch(url, options);
  const data = await res.json();
  if (!res.ok) {
    const err = data.errors ? data.errors.map(e => e.description).join(', ') : 'Asaas HTTP ' + res.status;
    throw new Error(err);
  }
  return data;
}

/* ---------------- Checkout ---------------- */
async function createCheckout(tenant, user, planId, origin) {
  const p = plan(planId);
  if (!p || p.priceCents <= 0) throw new Error('plano inválido para cobrança');

  if (mode() === 'dev') {
    return { url: origin + '/api/billing/dev-checkout?plan=' + encodeURIComponent(planId), simulated: true };
  }

  let customerId = tenant.stripe_customer_id; // mantemos a coluna antiga p/ compatibilidade

  if (!customerId) {
    // 1. Criar cliente no Asaas
    const custRes = await asaasApi('/customers', {
      name: tenant.name || user.name || 'Cliente',
      email: user.email,
      externalReference: tenant.id
    }, 'POST');
    customerId = custRes.id;
    // Opcional: já retornar para salvar se houvesse injeção, mas webhook 'CUSTOMER_CREATED' pode fazer,
    // ou salvaremos no webhook da subscription.
  }

  // 2. Criar a assinatura no Asaas
  // Em Asaas, se enviarmos billingType=UNDEFINED o cliente escolhe.
  // Criar assinatura envia o link de pagamento ou podemos pegar da primeira fatura (payment).
  const subRes = await asaasApi('/subscriptions', {
    customer: customerId,
    billingType: 'UNDEFINED',
    value: p.precoTelaCents / 100, // centavos para reais
    nextDueDate: new Date().toISOString().split('T')[0], // Hoje
    cycle: 'MONTHLY',
    description: `Assinatura do Plano ${p.name}`,
    externalReference: tenant.id + '|' + planId
  }, 'POST');

  // 3. Pegar a fatura gerada para obter o invoiceUrl
  // Como é a primeira, podemos listar payments para a assinatura criada
  const paymentsRes = await asaasApi('/payments', {
    subscription: subRes.id,
    limit: 1
  });

  if (!paymentsRes.data || paymentsRes.data.length === 0) {
    throw new Error('Asaas não retornou cobrança para a assinatura gerada');
  }

  const invoiceUrl = paymentsRes.data[0].invoiceUrl;

  return { url: invoiceUrl, id: subRes.id, customerId }; // id e customerId podem ser salvos pelo chamador
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
  
  if (authHeader !== WEBHOOK_TOKEN) throw new Error('assinatura de webhook inválida');
  
  return JSON.parse(Buffer.isBuffer(rawBody) ? rawBody.toString('utf8') : rawBody);
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
