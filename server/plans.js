/*
 * server/plans.js — catálogo de planos (fonte única da verdade).
 *
 * O que muda entre planos hoje é o limite de telas. Preços em centavos de BRL.
 * Os price IDs do Stripe vêm de env (só usados no modo Stripe real); no modo
 * dev-simulado eles não são necessários.
 */
const PLANS = {
  free: {
    id: 'free', name: 'Grátis', screens: 1, priceCents: 0,
    blurb: 'Para experimentar em uma tela.',
    stripePrice: null,
  },
  pro: {
    id: 'pro', name: 'Pro', screens: 5, priceCents: 14900,
    blurb: 'Para pequenas redes de telas.',
    stripePrice: process.env.STRIPE_PRICE_PRO || null,
  },
  business: {
    id: 'business', name: 'Business', screens: 25, priceCents: 49900,
    blurb: 'Para operações com muitas telas.',
    stripePrice: process.env.STRIPE_PRICE_BUSINESS || null,
  },
};

const ORDER = ['free', 'pro', 'business'];

function plan(id) { return PLANS[id] || PLANS.free; }
function screenLimit(id) { return plan(id).screens; }
function isPaid(id) { return plan(id).priceCents > 0; }
// Catálogo público (para o painel), na ordem de exibição.
function catalog() { return ORDER.map((id) => PLANS[id]); }

module.exports = { PLANS, ORDER, plan, screenLimit, isPaid, catalog };
