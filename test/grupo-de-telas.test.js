/*
 * Grupos de telas: um rótulo por tela. O perigo é o UPDATE em massa do
 * renomear — ele não pode alcançar o grupo de mesmo nome de OUTRA conta.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'mt-grupos-'));
const db = require('../server/db-sqlite.js');

test('renomear o grupo muda as telas da conta, e só dela', async () => {
  const a = await db.createAccount('ga' + Date.now() + '@x.com', 'h', 'A', 'A');
  const b = await db.createAccount('gb' + Date.now() + '@x.com', 'h', 'B', 'B');
  for (const [id, t] of [['g1', a], ['g2', a], ['g3', b]]) {
    await db.createDevice(id, 'C' + id, 't');
    await db.claimDevice(id, t.tenantId, id);
    await db.setGrupoDaTela(id, 'Loja Centro');
  }
  assert.equal(await db.renomearGrupo(a.tenantId, 'Loja Centro', 'Loja Centro 2'), 2);
  const listaA = await db.listDevices(a.tenantId);
  assert.deepEqual(listaA.map((d) => d.grupo).sort(), ['Loja Centro 2', 'Loja Centro 2']);
  const listaB = await db.listDevices(b.tenantId);
  assert.equal(listaB[0].grupo, 'Loja Centro', 'renomear alcançou outra conta');
  // Vazio desfaz o grupo.
  await db.renomearGrupo(a.tenantId, 'Loja Centro 2', '');
  assert.ok((await db.listDevices(a.tenantId)).every((d) => !d.grupo));
});
