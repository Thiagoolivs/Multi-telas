/*
 * Os e-mails do fim do teste (server/lembretes.js).
 *
 * O teste de 14 dias acabava em silêncio. O que estes testes guardam: cada
 * conta recebe cada aviso UMA vez, na hora certa, e o texto diz a verdade
 * sobre o que acontece (a TV não apaga; aparece o selo).
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'mt-lembretes-'));

const L = require('../server/lembretes.js');
const plans = require('../server/plans.js');

const DIA = 24 * 60 * 60 * 1000;
const AGORA = Date.UTC(2026, 8, 29, 12);
const conta = (diasDeVida, extra) => ({ id: 't1', plan: 'free', email: 'dono@x.com', telas: 1, created_at: AGORA - diasDeVida * DIA, lembrete_teste: null, ...extra });

test('no começo do teste, nada', () => {
  assert.equal(L.decidir(conta(1), AGORA), null);
  assert.equal(L.decidir(conta(11), AGORA), null); // faltam 3
});

test('faltando até 2 dias: "2d", uma vez só', () => {
  assert.equal(L.decidir(conta(12), AGORA), '2d');
  assert.equal(L.decidir(conta(13.5), AGORA), '2d');
  assert.equal(L.decidir(conta(12, { lembrete_teste: '2d' }), AGORA), null);
});

test('acabou: "fim", até 3 dias depois, uma vez só', () => {
  assert.equal(L.decidir(conta(14.1), AGORA), 'fim');
  assert.equal(L.decidir(conta(14.1, { lembrete_teste: '2d' }), AGORA), 'fim');
  assert.equal(L.decidir(conta(14.1, { lembrete_teste: 'fim' }), AGORA), null);
  assert.equal(L.decidir(conta(20), AGORA), null, 'notícia velha');
});

test('quem paga, cortesia e conta sem dono não recebem', () => {
  assert.equal(L.decidir(conta(13, { plan: 'pro' }), AGORA), null);
  assert.equal(L.decidir(conta(13, { email: null }), AGORA), null);
});

test('o texto diz a verdade: a TV não apaga, aparece o selo; e o preço é o da tabela', () => {
  const preco = 'R$ ' + (plans.PLANS.pro.precoTelaCents / 100).toFixed(2).replace('.', ',');
  const doisDias = L.mensagem('2d', conta(12), 'https://app.x', AGORA);
  assert.match(doisDias.subject, /acaba em 2 dias/);
  assert.match(doisDias.text, /nada apaga/);
  assert.ok(doisDias.text.includes(preco));
  assert.match(doisDias.text, /https:\/\/app\.x\/app\/\?ir=billing/);
  const fim = L.mensagem('fim', conta(14.2), 'https://app.x', AGORA);
  assert.match(fim.text, /selo "versão gratuita"/);
  assert.match(fim.subject, /continua no ar/);
});

test('sem TV pareada, o aviso é sobre LIGAR a TV, não sobre assinar', () => {
  const m = L.mensagem('2d', conta(12, { telas: 0 }), 'https://app.x', AGORA);
  assert.match(m.subject, /TV ainda não foi ligada/);
  assert.match(m.text, /QR/);
  assert.match(m.text, /\?ir=screens/);
});

test('no banco: envia uma vez, marca, e a passada seguinte não repete', async () => {
  const db = require('../server/db-sqlite.js');
  const { tenantId } = await db.createAccount('lembrete@x.com', 'hash', 'Padaria', 'Dono');
  // Nasceu há 12 dias e meio (faltam 2).
  const velho = AGORA - 12.5 * DIA;
  require('node:sqlite'); // garante o módulo carregado
  const raw = new (require('node:sqlite').DatabaseSync)(path.join(process.env.DATA_DIR, fs.readdirSync(process.env.DATA_DIR).find((f) => f.endsWith('.db') || f.endsWith('.sqlite'))));
  raw.prepare('UPDATE tenants SET created_at = ? WHERE id = ?').run(velho, tenantId);
  raw.close();

  const enviados = [];
  const mail = { send: async (m) => { enviados.push(m); return { ok: true }; } };
  const r1 = await L.varrer({ db, mail, appUrl: 'https://app.x', agora: AGORA });
  const meus = enviados.filter((m) => m.to === 'lembrete@x.com');
  assert.equal(meus.length, 1, 'devia mandar o "faltam 2 dias"');
  assert.ok(r1.enviados >= 1);
  await L.varrer({ db, mail, appUrl: 'https://app.x', agora: AGORA + 6 * 60 * 60 * 1000 });
  assert.equal(enviados.filter((m) => m.to === 'lembrete@x.com').length, 1, 'mandou de novo');
  // Acabou: agora vem o "fim", uma vez.
  await L.varrer({ db, mail, appUrl: 'https://app.x', agora: AGORA + 2 * DIA });
  await L.varrer({ db, mail, appUrl: 'https://app.x', agora: AGORA + 2 * DIA + 6 * 60 * 60 * 1000 });
  const todos = enviados.filter((m) => m.to === 'lembrete@x.com').map((m) => m.subject);
  assert.equal(todos.length, 2, todos.join(' | '));
  assert.match(todos[1], /acabou/);
});

test('provedor falhou: não marca, a próxima passada tenta de novo', async () => {
  const db = require('../server/db-sqlite.js');
  const { tenantId } = await db.createAccount('falha@x.com', 'hash', 'Loja', 'Dono');
  const raw = new (require('node:sqlite').DatabaseSync)(path.join(process.env.DATA_DIR, fs.readdirSync(process.env.DATA_DIR).find((f) => f.endsWith('.db') || f.endsWith('.sqlite'))));
  raw.prepare('UPDATE tenants SET created_at = ? WHERE id = ?').run(AGORA - 13 * DIA, tenantId);
  raw.close();
  let tentativas = 0;
  const quebrado = { send: async (m) => { if (m.to === 'falha@x.com') { tentativas++; throw new Error('provedor fora'); } return { ok: true }; } };
  await L.varrer({ db, mail: quebrado, appUrl: '', agora: AGORA });
  const ok = [];
  await L.varrer({ db, mail: { send: async (m) => { ok.push(m.to); return { ok: true }; } }, appUrl: '', agora: AGORA + 60000 });
  assert.equal(tentativas, 1);
  assert.ok(ok.includes('falha@x.com'), 'depois da falha, o aviso nunca saiu');
});
