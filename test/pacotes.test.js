/*
 * Pacotes de crédito avulsos.
 *
 * Dois defeitos caros que este arquivo guarda:
 *   - Creditar duas vezes. O Asaas manda PAYMENT_CONFIRMED e
 *     PAYMENT_RECEIVED para o MESMO pagamento de cartão, e reentrega
 *     qualquer evento. Sem trava, 100 créditos pagos viram 200, 300…
 *   - O pacote mexer no plano. Pacote atrasado ou estornado caindo na regra
 *     da assinatura rebaixaria a conta inteira por causa de R$ 39.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'mt-pacotes-'));
const db = require('../server/db-sqlite.js');
const C = require('../server/cobranca.js');
const cred = require('../server/creditos.js');

async function contaNova() {
  const c = await db.createAccount('p' + Math.random().toString(36).slice(2) + '@x.com', 'h', 'Loja', 'Dono');
  return c.tenantId;
}

test('o mesmo pagamento credita uma vez só, por mais eventos que cheguem', async () => {
  const t = await contaNova();
  assert.equal(await db.creditarPacote('pay_1', t, 'p100', 100), true);
  // CONFIRMED, depois RECEIVED, depois reentrega: nada mais entra.
  assert.equal(await db.creditarPacote('pay_1', t, 'p100', 100), false);
  assert.equal(await db.creditarPacote('pay_1', t, 'p100', 100), false);
  assert.equal((await db.getCreditos(t)).creditosComprados, 100);
});

test('dois pagamentos diferentes somam', async () => {
  const t = await contaNova();
  await db.creditarPacote('pay_a', t, 'p25', 25);
  await db.creditarPacote('pay_b', t, 'p100', 100);
  assert.equal((await db.getCreditos(t)).creditosComprados, 125);
});

test('estorno tira o pacote uma vez só, e não deixa saldo negativo', async () => {
  const t = await contaNova();
  await db.creditarPacote('pay_e', t, 'p100', 100);
  // Gastou 80 antes do estorno.
  const c = await db.getCreditos(t);
  await db.setCreditos(t, { ...c, creditosComprados: 20 });
  assert.equal(await db.estornarPacote('pay_e'), 100);
  assert.equal((await db.getCreditos(t)).creditosComprados, 0);
  assert.equal(await db.estornarPacote('pay_e'), 0, 'estornou duas vezes');
});

test('estorno de pagamento que nunca foi creditado não faz nada', async () => {
  assert.equal(await db.estornarPacote('pay_inexistente'), 0);
});

test('pacote tem caminho próprio: atraso de pacote não vira atraso da conta', () => {
  assert.deepEqual(C.referenciaDePacote('ten_1|pacote|p100'), { tenantId: 'ten_1', pacoteId: 'p100' });
  // Referência de assinatura NÃO é pacote.
  assert.equal(C.referenciaDePacote('ten_1|pro'), null);
  assert.equal(C.referenciaDePacote('ten_1'), null);
  assert.equal(C.referenciaDePacote(''), null);
  assert.equal(C.efeitoDoPacote('PAYMENT_OVERDUE'), null);
  assert.equal(C.efeitoDoPacote('PAYMENT_CONFIRMED'), 'creditar');
  assert.equal(C.efeitoDoPacote('PAYMENT_REFUNDED'), 'estornar');
});

test('o catálogo bate com o docs/BILLING.md', () => {
  assert.deepEqual(cred.PACOTES.map((p) => [p.creditos, p.precoCents]), [[25, 3900], [100, 12900], [500, 49900]]);
  assert.equal(cred.pacote('nao-existe'), null);
});
