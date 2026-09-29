/*
 * Relatório de exibição: a contagem na TV (js/exibicoes.js) e a gravação no
 * banco (registrarExibicoes). Os defeitos que importam aqui são os que fazem
 * o relatório mentir: contar em dobro um lote reenviado, perder o que a TV
 * exibiu offline, e a zona de conteúdo único que nunca "termina".
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'mt-exib-'));
const E = require('../js/exibicoes.js');
const db = require('../server/db-sqlite.js');

const HORA = E.HORA;
const H0 = Date.UTC(2026, 8, 1, 13, 0, 0); // uma hora cheia

function relogio(t) { const r = { t, agora: () => r.t }; return r; }
function memoria() { const m = {}; return { m, adiar: 0, ler: (k) => m[k] || null, guardar: (k, v) => { m[k] = v; } }; }

const aviso = { id: 'a1', type: 'announce', titulo: 'Promoção de pão' };

test('conta vezes e segundos por hora', () => {
  const r = relogio(H0 + 60e3); const mem = memoria();
  const c = E.criar({ agora: r.agora, ...mem });
  let x = c.iniciar(aviso, 'principal'); r.t += 10e3; x.terminar();
  x = c.iniciar(aviso, 'principal'); r.t += 12e3; x.terminar();
  const linhas = Object.values(c._linhas());
  assert.equal(linhas.length, 1);
  assert.equal(linhas[0].vezes, 2);
  assert.equal(linhas[0].segundos, 22);
  assert.equal(linhas[0].rotulo, 'Promoção de pão');
});

test('terminar duas vezes conta uma', () => {
  const r = relogio(H0); const c = E.criar({ agora: r.agora, ...memoria() });
  const x = c.iniciar(aviso, 'principal'); r.t += 5e3; x.terminar(); r.t += 5e3; x.terminar();
  assert.equal(Object.values(c._linhas())[0].vezes, 1);
});

test('menos de um segundo no ar não é exibição', () => {
  const r = relogio(H0); const c = E.criar({ agora: r.agora, ...memoria() });
  const x = c.iniciar(aviso, 'principal'); r.t += 300; x.terminar();
  assert.equal(Object.keys(c._linhas()).length, 0);
});

test('exibição que atravessa a virada da hora conta nas duas horas, uma vez só', () => {
  const r = relogio(H0 + HORA - 20e3); const c = E.criar({ agora: r.agora, ...memoria() });
  const x = c.iniciar(aviso, 'principal'); r.t += 50e3; x.terminar();
  const l = Object.values(c._linhas()).sort((a, b) => a.hora - b.hora);
  assert.equal(l.length, 2);
  assert.deepEqual(l.map((i) => i.segundos), [20, 30]);
  assert.equal(l[0].vezes + l[1].vezes, 1);
});

test('zona de conteúdo único: o parcial conta o tempo sem contar outra vez', () => {
  const r = relogio(H0); const c = E.criar({ agora: r.agora, ...memoria() });
  const x = c.iniciar(aviso, 'lateral');
  r.t += 300e3; x.parcial();
  r.t += 300e3; x.parcial();
  const l = Object.values(c._linhas())[0];
  assert.equal(l.vezes, 1);
  assert.equal(l.segundos, 600);
});

test('o lote só leva horas fechadas, e a confirmação tira do armazenamento', () => {
  const r = relogio(H0 + 60e3); const mem = memoria();
  const c = E.criar({ agora: r.agora, ...mem });
  const x = c.iniciar(aviso, 'principal'); r.t += 10e3; x.terminar();
  assert.equal(c.lote(), null, 'a hora corrente ainda está mudando');
  r.t = H0 + HORA + 5e3;
  const l = c.lote();
  assert.equal(l.itens.length, 1);
  c.confirmar(l);
  assert.equal(Object.keys(c._linhas()).length, 0);
  assert.equal(c.lote(), null);
});

test('TV que recarrega antes da confirmação reenvia o MESMO lote', () => {
  // O caso da contagem em dobro: a TV enviou, o servidor gravou, a resposta
  // se perdeu e a TV recarregou. Um id novo para as mesmas linhas contaria
  // tudo de novo.
  const r = relogio(H0 + 60e3); const mem = memoria();
  let c = E.criar({ agora: r.agora, ...mem });
  const x = c.iniciar(aviso, 'principal'); r.t += 10e3; x.terminar();
  r.t = H0 + HORA + 5e3;
  const primeiro = c.lote();
  c = E.criar({ agora: r.agora, ...mem }); // recarregou
  assert.equal(c.lote().lote, primeiro.lote);
});

test('offline por muito tempo: o armazenamento tem teto e sai o mais velho', () => {
  const r = relogio(H0); const mem = memoria();
  const c = E.criar({ agora: r.agora, ...mem });
  for (let i = 0; i < E.MAX_LINHAS + 50; i++) {
    const x = c.iniciar({ id: 'i' + i, type: 'text' }, 'principal'); r.t += 2e3; x.terminar();
    if (i % 100 === 0) r.t += HORA;
  }
  assert.equal(Object.keys(c._linhas()).length, E.MAX_LINHAS);
  assert.ok(!Object.values(c._linhas()).some((l) => l.chave === 'i0'), 'o mais antigo deveria ter saído');
});

test('conteúdo sem id tem chave estável', () => {
  const a = { type: 'image', src: '/media/x.jpg', titulo: 'Vitrine' };
  assert.equal(E.chaveDoItem(a), E.chaveDoItem({ ...a }));
  assert.notEqual(E.chaveDoItem(a), E.chaveDoItem({ ...a, src: '/media/y.jpg' }));
});

/* ---------------- O banco ---------------- */

test('o mesmo lote gravado duas vezes conta uma, e o relatório soma certo', async () => {
  const conta = await db.createAccount('exib' + Date.now() + '@x.com', 'h', 'Loja', 'Dono');
  await db.createDevice('dx1', 'EX0001', 't');
  await db.claimDevice('dx1', conta.tenantId, 'Vitrine');
  const linha = { hora: H0, zona: 'principal', chave: 'a1', rotulo: 'Promoção', tipo: 'announce', vezes: 3, segundos: 30 };
  assert.equal(await db.registrarExibicoes('dx1', conta.tenantId, 'Lote01', [linha]), true);
  assert.equal(await db.registrarExibicoes('dx1', conta.tenantId, 'Lote01', [linha]), false, 'reenvio contou de novo');
  await db.registrarExibicoes('dx1', conta.tenantId, 'Lote02', [{ ...linha, vezes: 1, segundos: 10 }]);
  const r = await db.relatorioExibicoes(conta.tenantId, H0 - HORA, H0 + HORA, null);
  assert.equal(Number(r.porConteudo[0].vezes), 4);
  assert.equal(Number(r.porConteudo[0].segundos), 40);
  assert.equal(r.porTela[0].nome, 'Vitrine');
  // Outra conta não vê nada disto.
  const outra = await db.createAccount('outra' + Date.now() + '@x.com', 'h', 'Outra', 'Dona');
  const nada = await db.relatorioExibicoes(outra.tenantId, H0 - HORA, H0 + HORA, null);
  assert.equal(nada.porConteudo.length, 0);
});

test('a gravação no armazenamento é adiada e juntada (não a cada slide)', async () => {
  const r = relogio(H0); const escritas = [];
  const c = E.criar({ agora: r.agora, adiar: 30, ler: () => null, guardar: (k) => escritas.push(k) });
  for (let i = 0; i < 20; i++) { const x = c.iniciar(aviso, 'principal'); r.t += 5e3; x.terminar(); }
  assert.equal(escritas.length, 0, 'gravou a cada troca de slide');
  await new Promise((res) => setTimeout(res, 60));
  assert.equal(escritas.filter((k) => k === 'mt.exibicoes').length, 1);
});
