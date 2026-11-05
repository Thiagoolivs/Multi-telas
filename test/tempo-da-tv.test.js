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

// Fase 5: o rodízio saiu do player para js/rodizio.js (o mesmo que a TV carrega antes do player.js).
const R = require('../js/rodizio.js');
function distribuir() {
  return (lista) => R.distribuir(lista, {}, () => 10);
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

test('prioridade alta passa mais vezes, espalhada, até 40% da volta — e nunca duas seguidas, nem na virada', () => {
  const d = distribuir();
  const A = { n: 'A', meta: { prioridade: 'alta' } };
  const tempoDe = (r, letra) => r.split(letra).length - 1;
  // Com quatro normais, a Alta passa duas vezes (2 de 6 = 33%, abaixo do teto de 40%).
  const r = nomes(d([A, { n: 'B' }, { n: 'C' }, { n: 'D' }, { n: 'E' }]));
  assert.equal(tempoDe(r, 'A'), 2, r);
  assert.ok(tempoDe(r, 'A') / r.length <= 0.4, r);
  const volta = r + r;
  for (let i = 1; i < volta.length; i++) assert.notEqual(volta[i], volta[i - 1], 'duas seguidas em ' + volta);
  // Com só dois normais, duas vezes passaria do teto (50%): a Alta fica em uma (fase 5, BLOCO-3).
  const curta = nomes(d([A, { n: 'B' }, { n: 'C' }]));
  assert.ok(tempoDe(curta, 'A') / curta.length <= 0.4, curta);
});

test('no rodízio: primeiro distribuir, depois os automáticos (aniversário e mural)', () => {
  assert.match(PLAYER, /const ativos = comAutomaticos\(distribuir\(agendado \? conhecidos\.filter\(agendadoAgora\) : conhecidos\), cfg, zonaId\);/);
  assert.ok(Number((/const SHELL_CACHE = 'mt-shell-v(\d+)';/.exec(fs.readFileSync(path.join(RAIZ, 'sw.js'), 'utf8')) || [])[1]) >= 52, 'o player mudou e a TV não baixa de novo');
  const ed = fs.readFileSync(path.join(RAIZ, 'web/src/pages/ContentEditorPage.jsx'), 'utf8');
  assert.match(ed, /\['alta', 'Alta', 'Passa mais vezes, espalhada entre as outras: até 40% do tempo da tela\.'\]/);
  assert.match(ed, /meta: \{ \.\.\.\(current\.meta \|\| \{\}\), prioridade: id \}/);
});

/* ---------------- D25: urgente toma a tela ---------------- */

test('urgente: qualquer peça toma a tela, três vezes por volta, mesmo com o layout inteligente desligado', () => {
  const d = distribuir();
  const U = { n: 'U', meta: { prioridade: 'urgente' } };
  // Fase 5: o urgente tem teto de 25% do tempo da volta (antes passava três vezes e ficava com 60% da tela).
  const r = nomes(d([U, { n: 'B' }, { n: 'C' }, { n: 'D' }]));
  assert.ok(r.split('U').length - 1 >= 1, r);
  assert.ok((r.split('U').length - 1) / r.length <= 0.25, 'urgente no teto: ' + r);
  const muitos = nomes(d([U, { n: 'B' }, { n: 'C' }, { n: 'D' }, { n: 'E' }, { n: 'F' }, { n: 'G' }, { n: 'H' }, { n: 'I' }, { n: 'J' }, { n: 'K' }]));
  assert.equal(muitos.split('U').length - 1, 3, 'com muita peça normal, o urgente passa três vezes: ' + muitos);
  const corpo = PLAYER.slice(PLAYER.indexOf('  function maybeTakeover(item) {'), PLAYER.indexOf('  function showTakeover('));
  assert.match(corpo, /const urgenteDoPainel = !!\(item && item\.meta && item\.meta\.prioridade === 'urgente'\);/);
  assert.match(corpo, /if \(!smartLayout && !urgenteDoPainel\) return;/);
  assert.match(PLAYER, /'peca-html': 1,/, 'a peça em HTML não toma a tela');
  const ed = fs.readFileSync(path.join(RAIZ, 'web/src/pages/ContentEditorPage.jsx'), 'utf8');
  assert.match(ed, /\['urgente', 'Urgente', 'Toma a tela inteira/);
  assert.match(fs.readFileSync(path.join(RAIZ, 'web/src/pages/CalendarioPage.jsx'), 'utf8'), /<option value="urgente">Urgente \(toma a tela\)<\/option>/);
});
