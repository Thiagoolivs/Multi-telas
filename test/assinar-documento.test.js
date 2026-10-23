/*
 * "Assinar" com CPF/CNPJ (EXECUTOR D0.8).
 *
 * Em produção todo POST /api/billing/checkout respondia 502: o cliente era
 * criado no Asaas só com nome e e-mail, e o Asaas não emite assinatura nem
 * cobrança sem documento. O painel mostrava o erro no topo da página, longe
 * do botão, e o log não guardava nada.
 *
 * Nenhum teste chama a rede: o fetch é trocado por um Asaas de mentira que
 * grava cada pedido.
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const D = require('../js/documento.js');

const RAIZ = path.join(__dirname, '..');

/* ---------------- o documento ---------------- */

test('CPF e CNPJ conferidos pelos dígitos, com a frase de cada erro', () => {
  assert.equal(D.conferir('529.982.247-25').ok, true);
  assert.equal(D.conferir('52998224725').tipo, 'cpf');
  assert.equal(D.conferir('11.222.333/0001-81').ok, true);
  assert.equal(D.conferir('11.222.333/0001-81').tipo, 'cnpj');
  assert.equal(D.conferir('529.982.247-24').ok, false, 'dígito errado');
  assert.match(D.conferir('529.982.247-24').erro, /CPF não existe/);
  assert.equal(D.conferir('111.111.111-11').ok, false, 'todos iguais passam na conta, mas não existem');
  assert.equal(D.conferir('00.000.000/0000-00').ok, false);
  assert.match(D.conferir('1234').erro, /11 números/);
  assert.match(D.conferir('').erro, /Digite/);
  assert.equal(D.formatar('52998224725'), '529.982.247-25');
  assert.equal(D.formatar('11222333000181'), '11.222.333/0001-81');
});

/* ---------------- o cliente no Asaas ---------------- */

function asaasDeMentira(clientes) {
  const pedidos = [];
  const antes = globalThis.fetch;
  globalThis.fetch = async (url, op) => {
    const u = new URL(url);
    const corpo = op && op.body ? JSON.parse(op.body) : null;
    pedidos.push({ metodo: (op && op.method) || 'GET', caminho: u.pathname.replace(/^\/v3/, ''), corpo });
    let r = {};
    const m = u.pathname.match(/\/customers\/([^/]+)$/);
    if (u.pathname.endsWith('/customers') && op.method === 'POST') r = { id: 'cus_novo' };
    else if (m && (op.method || 'GET') === 'GET') r = clientes[m[1]] || {};
    else if (m) r = { id: m[1] };
    else if (u.pathname.endsWith('/subscriptions') && op.method === 'POST') r = { id: 'sub_1' };
    else if (u.pathname.endsWith('/subscriptions')) r = { data: [] };
    else if (u.pathname.endsWith('/payments') && op.method === 'POST') r = { id: 'pay_1', invoiceUrl: 'https://asaas.example/i/pay_1' };
    else if (u.pathname.endsWith('/payments')) r = { data: [{ invoiceUrl: 'https://asaas.example/i/1' }] };
    return { ok: true, status: 200, text: async () => JSON.stringify(r) };
  };
  return { pedidos, devolver: () => { globalThis.fetch = antes; } };
}

function billingComChave() {
  process.env.ASAAS_API_KEY = 'chave-de-teste';
  delete require.cache[require.resolve('../server/billing.js')];
  return require('../server/billing.js');
}

test('cliente novo sem documento: nada é criado no Asaas, e o painel recebe o pedido do CPF/CNPJ', async (t) => {
  const billing = billingComChave();
  const a = asaasDeMentira({});
  t.after(() => { a.devolver(); delete process.env.ASAAS_API_KEY; });
  const e = await billing.createCheckout({ id: 'ten_1', name: 'Loja' }, { email: 'dono@loja.local' }, 'pro', 'http://x', { telas: 1 }).then(() => null, (x) => x);
  assert.ok(e && e.precisaDocumento, 'tinha de pedir o documento');
  assert.match(e.message, /CPF ou CNPJ/);
  assert.equal(a.pedidos.filter((p) => p.metodo === 'POST').length, 0, 'nenhum cliente nem assinatura sem documento');
});

test('cliente novo com CNPJ: o documento vai no cadastro e a fatura abre', async (t) => {
  const billing = billingComChave();
  const a = asaasDeMentira({});
  t.after(() => { a.devolver(); delete process.env.ASAAS_API_KEY; });
  const out = await billing.createCheckout({ id: 'ten_1', name: 'Loja' }, { email: 'dono@loja.local' }, 'pro', 'http://x',
    { telas: 1, documento: '11.222.333/0001-81' });
  const cliente = a.pedidos.find((p) => p.caminho === '/customers' && p.metodo === 'POST');
  assert.equal(cliente.corpo.cpfCnpj, '11222333000181', 'só os dígitos');
  assert.ok(out.url, 'devolve o link da fatura');
});

test('cliente antigo sem documento no Asaas: pede o documento; com ele, atualiza o cadastro', async (t) => {
  const billing = billingComChave();
  const a = asaasDeMentira({ cus_velho: { id: 'cus_velho', cpfCnpj: null } });
  t.after(() => { a.devolver(); delete process.env.ASAAS_API_KEY; });
  const tenant = { id: 'ten_1', name: 'Loja', stripe_customer_id: 'cus_velho' };
  const e = await billing.createCheckout(tenant, { email: 'd@l' }, 'pro', 'http://x', { telas: 1 }).then(() => null, (x) => x);
  assert.ok(e && e.precisaDocumento);
  await billing.createCheckout(tenant, { email: 'd@l' }, 'pro', 'http://x', { telas: 1, documento: '529.982.247-25' });
  const atualizou = a.pedidos.find((p) => p.caminho === '/customers/cus_velho' && p.metodo === 'POST');
  assert.equal(atualizou && atualizou.corpo.cpfCnpj, '52998224725');
});

test('cliente antigo que já tem documento: segue sem perguntar', async (t) => {
  const billing = billingComChave();
  const a = asaasDeMentira({ cus_ok: { id: 'cus_ok', cpfCnpj: '52998224725' } });
  t.after(() => { a.devolver(); delete process.env.ASAAS_API_KEY; });
  const out = await billing.cobrarPacote({ id: 'ten_1', stripe_customer_id: 'cus_ok' }, {}, { id: 'p25', creditos: 25, precoCents: 3900 }, 'http://x');
  assert.ok(out.url);
});

test('documento inválido não chega ao Asaas', async (t) => {
  const billing = billingComChave();
  const a = asaasDeMentira({});
  t.after(() => { a.devolver(); delete process.env.ASAAS_API_KEY; });
  const e = await billing.createCheckout({ id: 'ten_1' }, {}, 'pro', 'http://x', { telas: 1, documento: '123.456.789-00' }).then(() => null, (x) => x);
  assert.ok(e && e.precisaDocumento);
  assert.match(e.message, /não existe/);
  assert.equal(a.pedidos.length, 0);
});

/* ---------------- a rota e o painel ---------------- */

test('a falha da cobrança fica no log (sem dado pessoal) e o pedido de documento volta como código', () => {
  const rota = fs.readFileSync(path.join(RAIZ, 'server/routes/billing.js'), 'utf8');
  // D46: a recusa passa por recusado(), que também registra o código no log.
  assert.match(rota, /recusado\(res, onde, 'precisa-documento', e\.message\)/);
  assert.match(rota, /log\.aviso\('cobranca\.' \+ onde \+ '-falhou'/);
  assert.ok(!/return sendJson\(res, 502, \{ error: e\.message \}\)/.test(rota), 'nenhuma falha de cobrança volta sem registro');
  assert.ok(!/documento/.test(fs.readFileSync(path.join(RAIZ, 'server/db-postgres.js'), 'utf8')), 'o documento não é guardado no nosso banco');
});

test('o painel pergunta o documento junto do botão e mostra a falha onde a pessoa está', () => {
  const pagina = fs.readFileSync(path.join(RAIZ, 'web/src/pages/BillingPage.jsx'), 'utf8');
  assert.match(pagina, /e\.codigo === 'precisa-documento'/);
  assert.match(pagina, /<PedirDocumento|dialogoDocumento/);
  assert.match(pagina, /aviso\.erro\('cobranca'/, 'a falha também vira aviso flutuante, visível de qualquer ponto da página');
});
