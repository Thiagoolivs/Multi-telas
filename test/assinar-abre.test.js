/*
 * "Assinar continua sem abrir" (EXECUTOR D46).
 *
 * Dois buracos no mesmo clique: o Asaas às vezes demora mais que os ~2 s que
 * o servidor esperava pela fatura (e o "Assinar" voltava erro), e quando a
 * navegação não saía do painel (app instalado, navegador que segura) o botão
 * ficava em "Abrindo…" para sempre, sem nada na tela. Agora o servidor espera
 * mais, e o painel fecha o diálogo e deixa o link da fatura à vista.
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ler = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8').replace(/\r\n/g, '\n');

test('a fatura que o Asaas demora a gerar ainda chega (até 5 tentativas)', async () => {
  const chaveAntes = process.env.ASAAS_API_KEY;
  const fetchAntes = globalThis.fetch;
  process.env.ASAAS_API_KEY = 'chave-de-teste';
  delete require.cache[require.resolve('../server/billing.js')];
  let buscas = 0;
  globalThis.fetch = async (url, op) => {
    const u = String(url);
    const metodo = (op && op.method) || 'GET';
    let r = {};
    if (u.includes('/customers')) r = { id: 'cus_1' };
    else if (u.includes('/subscriptions') && metodo === 'GET') r = { data: [] };
    else if (u.includes('/subscriptions')) r = { id: 'sub_1' };
    else if (u.includes('/payments')) { buscas += 1; r = { data: buscas < 4 ? [] : [{ invoiceUrl: 'https://asaas.test/fatura/1' }] }; }
    return { ok: true, status: 200, text: async () => JSON.stringify(r) };
  };
  try {
    const billing = require('../server/billing.js');
    const out = await billing.createCheckout({ id: 't1', name: 'Loja', stripe_customer_id: '' }, { email: 'a@b.c' }, 'pro', 'https://app.test',
      { telas: 1, documento: '11.222.333/0001-81', aoCriarCliente: async () => {} });
    assert.equal(out.url, 'https://asaas.test/fatura/1');
    assert.equal(buscas, 4, 'desistiu da fatura cedo demais');
  } finally {
    globalThis.fetch = fetchAntes;
    if (chaveAntes === undefined) delete process.env.ASAAS_API_KEY; else process.env.ASAAS_API_KEY = chaveAntes;
    delete require.cache[require.resolve('../server/billing.js')];
  }
});

test('o painel: a fatura abre, ou o link fica na tela; sem link é erro dito', () => {
  const B = ler('web/src/pages/BillingPage.jsx');
  // Assinar e comprar criações passam pelo mesmo caminho.
  assert.match(B, /const \{ url \} = await billing\.checkout\(planId, documento\);\n\s+abrirFatura\(url\);/);
  assert.match(B, /if \(r\.url\) \{ abrirFatura\(r\.url\); return; \}/);
  assert.doesNotMatch(B, /window\.location\.href = (url|r\.url)/, 'voltou a navegar sem deixar o link');
  const f = B.slice(B.indexOf('function abrirFatura(url) {'), B.indexOf('async function upgrade('));
  assert.match(f, /throw new Error\('O Asaas não devolveu o link da fatura/);
  // O diálogo fecha e o botão sai do "Abrindo…" antes de navegar.
  const ordem = ['setFatura(url); setPedido(null); setBusy(\'\');', 'aviso.pronto(\'cobranca\'', 'window.location.assign(url);'];
  ordem.reduce((i, s) => { const j = f.indexOf(s); assert.ok(j > i, 'fora de ordem ou faltando: ' + s); return j; }, -1);
  assert.match(B, /<a href=\{fatura\} target="_blank" rel="noopener noreferrer"/);
  assert.match(B, /Abrir a fatura/);
});
