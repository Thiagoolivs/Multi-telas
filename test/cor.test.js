/*
 * A matemática de cor agora tem um dono só. Estes testes guardam o motivo de
 * ela ter sido unificada: o mesmo bug apareceu duas vezes, com meses de
 * distância, porque existiam duas cópias.
 */
const test = require('node:test');
const assert = require('node:assert');
const cor = require('../js/cor');

test('hex curto e longo dão o mesmo resultado', () => {
  assert.deepEqual(cor.hex2rgb('#f80'), cor.hex2rgb('#ff8800'));
  assert.deepEqual(cor.hex2rgb('f80'), [255, 136, 0]);
  assert.equal(cor.okHex('F80'), '#ff8800');
  assert.equal(cor.hex2rgb('#xyz'), null);
});

test('contraste bate com os valores da WCAG', () => {
  assert.equal(Math.round(cor.contraste('#000000', '#ffffff')), 21);
  assert.equal(cor.contraste('#777777', '#777777'), 1);
  // Cinza médio sobre branco: valor de referência ~4.48:1.
  assert.ok(Math.abs(cor.contraste('#767676', '#ffffff') - 4.54) < 0.1);
});

test('acento sobre laranja escurece em vez de clarear', () => {
  /*
   * O bug que a duplicação repetiu. Clarear laranja empaca em ~2.4:1; a saída
   * está em escurecer, e só se chega lá tentando as duas direções.
   */
  const laranja = '#f59e0b';
  const acento = cor.acentoSobre(laranja, laranja);
  assert.ok(cor.contraste(laranja, acento) >= 3.5,
    'contraste ficou em ' + cor.contraste(laranja, acento).toFixed(2) + ':1');
});

test('acento resolve em qualquer fundo de marca comum', () => {
  const fundos = ['#f59e0b', '#2f6feb', '#0b1020', '#ffffff', '#16a34a', '#e11d48', '#7c3aed', '#facc15'];
  for (const f of fundos) {
    const a = cor.acentoSobre(f, f);
    assert.ok(cor.contraste(f, a) >= 3.5, f + ' → ' + cor.contraste(f, a).toFixed(2) + ':1');
  }
});

test('texto sobre fundo claro não sai branco', () => {
  assert.equal(cor.textoSobre('#ffffff'), '#0b1120');
  assert.equal(cor.textoSobre('#0b1020'), '#ffffff');
  // Com marca, tenta manter a identidade — mas só se passar no contraste.
  const t = cor.textoSobre('#0b1020', '#f59e0b');
  assert.ok(cor.contraste('#0b1020', t) >= 4.5);
});

test('mix e giro de matiz devolvem hex válido', () => {
  assert.equal(cor.mix('#000000', '#ffffff', 0.5), '#808080');
  assert.match(cor.girarMatiz('#2f6feb', 28), /^#[0-9a-f]{6}$/);
  assert.equal(cor.mix('#zzz', '#ffffff', 0.5), '#zzz', 'cor inválida volta como veio');
});

test('as duas pontas usam a MESMA implementação', () => {
  // Se alguém recriar a matemática num dos lados, isto quebra.
  const ds = require('../server/design-system');
  global.window = global.window || {};
  global.document = global.document || { getElementById: () => null, documentElement: { style: { setProperty() {} } }, head: { appendChild() {} }, createElement: () => ({ setAttribute() {}, style: {} }) };
  require('../js/theme');           // IIFE: publica em window.MTTheme
  const theme = global.window.MTTheme;
  const casos = ['#f59e0b', '#2f6feb', '#16a34a'];
  for (const c of casos) {
    assert.equal(ds.contrast(c, '#ffffff'), cor.contraste(c, '#ffffff'), 'design-system divergiu em ' + c);
    assert.equal(theme.contraste(c, '#ffffff'), cor.contraste(c, '#ffffff'), 'theme divergiu em ' + c);
    assert.equal(ds.okHex(c, '#000'), cor.okHex(c), 'okHex divergiu em ' + c);
  }
});
