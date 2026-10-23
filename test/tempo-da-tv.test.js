/*
 * A TV distribui o tempo (EXECUTOR D24).
 *
 * Peso por prioridade e fontes que convivem por regra — no player, offline.
 * A função é extraída de js/player.js de verdade (como em automaticos.test.js).
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const RAIZ = path.join(__dirname, '..');
const PLAYER = fs.readFileSync(path.join(RAIZ, 'js/player.js'), 'utf8');

function distribuir() {
  const ini = PLAYER.indexOf('  function fonteDe(it, i) {');
  const fim = PLAYER.indexOf('  function startPlaylist(');
  const ctx = { module: {} };
  vm.createContext(ctx);
  vm.runInContext(PLAYER.slice(ini, fim) + '\nmodule.exports = distribuir;', ctx);
  return ctx.module.exports;
}
const nomes = (l) => l.map((x) => x.n).join('');

test('as fontes se revezam: uma campanha de várias peças não toma a parede em fila', () => {
  const d = distribuir();
  const C = (n) => ({ n, _campanha: 'Natal' });
  const lista = [C('a'), C('b'), C('c'), { n: 'X' }, { n: 'Y' }];
  assert.equal(nomes(d(lista)), 'aXYbc', 'uma de cada fonte por vez, na ordem em que aparecem');
  const cal = (n) => ({ n, _calendario: 'cal_' + n });
  assert.equal(nomes(d([cal('1'), cal('2'), { n: 'P' }, { n: 'Q' }])), '1PQ2', 'as datas do calendário são uma fonte só');
  assert.equal(nomes(d([{ n: 'A' }, { n: 'B' }, { n: 'C' }])), 'ABC', 'sem campanha nem prioridade, nada muda');
  assert.deepEqual(d([]), []);
});

test('prioridade alta passa duas vezes por volta, espalhada — e nunca duas seguidas, nem na virada da volta', () => {
  const d = distribuir();
  const A = { n: 'A', meta: { prioridade: 'alta' } };
  const r = nomes(d([A, { n: 'B' }, { n: 'C' }]));
  assert.equal(r.length, 4);
  assert.equal(r.split('A').length - 1, 2);
  const volta = r + r;
  for (let i = 1; i < volta.length; i++) assert.notEqual(volta[i], volta[i - 1], 'duas seguidas em ' + volta);
  const muitas = nomes(d([A, { n: 'B' }, { n: 'C' }, { n: 'D' }, { n: 'E', meta: { prioridade: 'alta' } }]));
  assert.equal(muitas.length, 7);
  const v2 = muitas + muitas;
  for (let i = 1; i < v2.length; i++) assert.notEqual(v2[i], v2[i - 1], 'duas seguidas em ' + v2);
});

test('no rodízio: primeiro distribuir, depois os automáticos (aniversário e mural)', () => {
  assert.match(PLAYER, /const ativos = comAutomaticos\(distribuir\(agendado \? items\.filter\(agendadoAgora\) : items\), cfg, zonaId\);/);
  assert.ok(Number((/const SHELL_CACHE = 'mt-shell-v(\d+)';/.exec(fs.readFileSync(path.join(RAIZ, 'sw.js'), 'utf8')) || [])[1]) >= 52, 'o player mudou e a TV não baixa de novo');
  const ed = fs.readFileSync(path.join(RAIZ, 'web/src/pages/ContentEditorPage.jsx'), 'utf8');
  assert.match(ed, /\['alta', 'Alta', 'Passa duas vezes por volta, espalhada entre as outras\.'\]/);
  assert.match(ed, /meta: \{ \.\.\.\(current\.meta \|\| \{\}\), prioridade: id \}/);
});

/* ---------------- D25: urgente toma a tela ---------------- */

test('urgente: qualquer peça toma a tela, três vezes por volta, mesmo com o layout inteligente desligado', () => {
  const d = distribuir();
  const U = { n: 'U', meta: { prioridade: 'urgente' } };
  const r = nomes(d([U, { n: 'B' }, { n: 'C' }, { n: 'D' }]));
  assert.equal(r.split('U').length - 1, 3, 'urgente passa três vezes: ' + r);
  const corpo = PLAYER.slice(PLAYER.indexOf('  function maybeTakeover(item) {'), PLAYER.indexOf('  function showTakeover('));
  assert.match(corpo, /const urgenteDoPainel = !!\(item && item\.meta && item\.meta\.prioridade === 'urgente'\);/);
  assert.match(corpo, /if \(!smartLayout && !urgenteDoPainel\) return;/);
  assert.match(PLAYER, /'peca-html': 1,/, 'a peça em HTML não toma a tela');
  const ed = fs.readFileSync(path.join(RAIZ, 'web/src/pages/ContentEditorPage.jsx'), 'utf8');
  assert.match(ed, /\['urgente', 'Urgente', 'Toma a tela inteira/);
  assert.match(fs.readFileSync(path.join(RAIZ, 'web/src/pages/CalendarioPage.jsx'), 'utf8'), /<option value="urgente">Urgente \(toma a tela\)<\/option>/);
});
