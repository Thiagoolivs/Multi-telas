/*
 * server/billing.js — cobrança de assinatura.
 *
 * Dois modos, escolhidos por ambiente:
 *   - 'stripe'  quando STRIPE_SECRET_KEY está definida: cria sessões de
 *     Checkout reais e valida webhooks assinados. Sem dependências: fala com a
 *     API do Stripe via fetch (form-encoded).
 *   - 'dev'     caso contrário: um checkout SIMULADO local (página clara de
 *     "pagamento de teste") que ativa o plano na hora. Deixa todo o fluxo do
 *     painel testável sem chaves nem rede.
 *
 * Em ambos os casos, quem realmente muda o plano do tenant é o server (no
 * webhook do Stripe ou no dev-activate). Aqui só montamos URLs e validamos.
 */
const crypto = require('crypto');
const { plan, PLANS } = require('./plans');

const STRIPE_KEY = process.env.STRIPE_SECRET_KEY || '';
const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || '';
const API = 'https://api.stripe.com/v1';

function mode() { return STRIPE_KEY ? 'stripe' : 'dev'; }

/* ---------------- Stripe REST (sem SDK) ---------------- */
function encodeForm(obj, prefix, out) {
  out = out || [];
  for (const k of Object.keys(obj)) {
    const key = prefix ? prefix + '[' + k + ']' : k;
    const v = obj[k];
    if (v && typeof v === 'object' && !Array.isArray(v)) encodeForm(v, key, out);
    else if (Array.isArray(v)) v.forEach((item, i) => encodeForm(item, key + '[' + i + ']', out));
    else if (v !== undefined && v !== null) out.push(encodeURIComponent(key) + '=' + encodeURIComponent(v));
  }
  return out;
}
async function stripeApi(path, params) {
  const res = await fetch(API + path, {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + STRIPE_KEY,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params ? encodeForm(params).join('&') : undefined,
  });
  const data = await res.json();
  if (!res.ok) throw new Error((data && data.error && data.error.message) || ('Stripe HTTP ' + res.status));
  return data;
}

/* ---------------- Checkout ---------------- */
// Retorna { url } para onde redirecionar o usuário. `origin` é a base absoluta
// (ex.: https://app.exemplo.com) para montar success/cancel.
async function createCheckout(tenant, planId, origin) {
  const p = plan(planId);
  if (!p || p.priceCents <= 0) throw new Error('plano inválido para cobrança');

  if (mode() === 'dev') {
    // Checkout simulado: página local que ativa o plano.
    return { url: origin + '/api/billing/dev-checkout?plan=' + encodeURIComponent(planId), simulated: true };
  }

  if (!p.stripePrice) throw new Error('price do Stripe não configurado para ' + planId);
  const params = {
    mode: 'subscription',
    'line_items': [{ price: p.stripePrice, quantity: 1 }],
    success_url: origin + '/app?billing=success',
    cancel_url: origin + '/app?billing=cancel',
    client_reference_id: tenant.id,
    metadata: { tenant_id: tenant.id, plan: planId },
    allow_promotion_codes: true,
  };
  if (tenant.stripe_customer_id) params.customer = tenant.stripe_customer_id;
  const session = await stripeApi('/checkout/sessions', params);
  return { url: session.url, id: session.id };
}

// Portal de gerenciamento da assinatura (trocar cartão, cancelar).
async function createPortal(tenant, origin) {
  if (mode() === 'dev') return { url: origin + '/app?billing=portal-dev', simulated: true };
  if (!tenant.stripe_customer_id) throw new Error('sem assinatura ativa');
  const session = await stripeApi('/billing_portal/sessions', {
    customer: tenant.stripe_customer_id,
    return_url: origin + '/app',
  });
  return { url: session.url };
}

/* ---------------- Webhook ---------------- */
// Valida a assinatura do webhook do Stripe (esquema t=...,v1=...). Retorna o
// evento (objeto) ou lança. rawBody precisa ser o corpo bruto (string/Buffer).
function verifyWebhook(rawBody, sigHeader) {
  if (!WEBHOOK_SECRET) throw new Error('STRIPE_WEBHOOK_SECRET ausente');
  const parts = {};
  String(sigHeader || '').split(',').forEach((kv) => { const [k, v] = kv.split('='); if (k) parts[k.trim()] = v; });
  const t = parts.t, sig = parts.v1;
  if (!t || !sig) throw new Error('assinatura de webhook malformada');
  const signed = t + '.' + (Buffer.isBuffer(rawBody) ? rawBody.toString('utf8') : rawBody);
  const expected = crypto.createHmac('sha256', WEBHOOK_SECRET).update(signed).digest('hex');
  const a = Buffer.from(expected), b = Buffer.from(sig);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) throw new Error('assinatura de webhook inválida');
  // Rejeita eventos muito antigos (replay) — tolerância de 5 min.
  if (Math.abs(Date.now() / 1000 - Number(t)) > 300) throw new Error('webhook expirado');
  return JSON.parse(Buffer.isBuffer(rawBody) ? rawBody.toString('utf8') : rawBody);
}

// Descobre nosso planId a partir do price do Stripe (reverso do catálogo).
function planIdFromPrice(priceId) {
  for (const id of Object.keys(PLANS)) if (PLANS[id].stripePrice && PLANS[id].stripePrice === priceId) return id;
  return null;
}

module.exports = { mode, createCheckout, createPortal, verifyWebhook, planIdFromPrice, stripeApi };
