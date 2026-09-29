/*
 * A faxina diária (limparVencidos). O perigo aqui é o de sempre em DELETE:
 * apagar o que é de alguém. Tela pareada, tela nova esperando código e
 * sessão viva não podem sair.
 */
const test = require('node:test');
const assert = require('node:assert');

/*
 * Banco PRÓPRIO, num diretório temporário. A faxina com o relógio oito dias
 * à frente apaga sessões e telas órfãs de QUALQUER conta — no banco
 * compartilhado da suíte, derrubaria o login de outro arquivo de teste
 * rodando ao mesmo tempo.
 */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'mt-faxina-'));
const db = require('../server/db-sqlite.js');

const DIA = 864e5;

test('só sai o que venceu, e nada que tenha dono', async () => {
  const agora = Date.now();
  const sfx = String(agora).slice(-6);
  const conta = await db.createAccount('faxina' + sfx + '@x.com', 'h', 'Loja', 'Dono');

  // Tela pareada: é do cliente, fica, parada o tempo que for.
  await db.createDevice('fx_pareada' + sfx, 'P' + sfx, 't1');
  await db.claimDevice('fx_pareada' + sfx, conta.tenantId, 'Vitrine');
  // Tela nunca pareada, ligada agora mostrando o código: fica.
  await db.createDevice('fx_nova' + sfx, 'N' + sfx, 't2');
  // Tela nunca pareada que vai ficar sem sinal: sai depois de 7 dias.
  await db.createDevice('fx_orfa' + sfx, 'O' + sfx, 't3');

  // Hoje: nada sai — a nova acabou de nascer.
  await db.limparVencidos(agora);
  assert.ok(await db.getDevice('fx_orfa' + sfx), 'apagou tela recém-criada');
  assert.ok(await db.getDevice('fx_nova' + sfx), 'apagou tela nova esperando código');

  // Oito dias depois, sem sinal: a órfã sai, a pareada fica.
  const r = await db.limparVencidos(agora + 8 * DIA);
  assert.ok(r.telas >= 1);
  assert.equal(await db.getDevice('fx_orfa' + sfx), null, 'órfã velha continuou');
  assert.ok(await db.getDevice('fx_pareada' + sfx), 'APAGOU TELA PAREADA');
});

test('verificação usada sai (ela guarda o hash da senha), a pendente fica', async () => {
  const agora = Date.now();
  await db.createVerification('fx_usada' + agora, { passHash: 'segredo' }, agora + DIA);
  await db.consumeVerification('fx_usada' + agora);
  await db.createVerification('fx_pendente' + agora, { passHash: 'segredo' }, agora + DIA);
  await db.limparVencidos(agora);
  assert.ok(await db.getVerification('fx_pendente' + agora), 'apagou cadastro esperando confirmação');
});
