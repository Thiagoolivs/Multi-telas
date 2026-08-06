/*
 * js/theme.js roda no navegador (IIFE em window), mas a matemática de cor dele
 * é pura — dá para testar em node com um shim mínimo de DOM. E precisa ser
 * testada: é ela que decide se o texto da TV do cliente vai ser legível.
 *
 * O limite de 3.5:1 vem da WCAG para texto grande, que é o caso de tudo numa
 * tela vista de longe.
 */
const test = require('node:test');
const assert = require('node:assert');

global.window = {};
global.document = {
  getElementById: () => null,
  createElement: () => ({ setAttribute() {} }),
  head: { appendChild() {} },
  documentElement: { style: { setProperty() {} }, classList: { toggle() {} } },
};
require('../js/theme.js');
const T = global.window.MTTheme;

// Marcas de verdade, cobrindo os casos difíceis: laranja e amarelo são
// meio-tom (quebram quem escolhe a direção pela luminância), cinza é
// dessaturado, vermelho é escuro mas vibrante.
const MARCAS = ['#ff4d00', '#ffd400', '#0b3d91', '#12b76a', '#e11d48', '#64748b', '#000000', '#ffffff'];

test('tema derivado da marca sempre dá texto legível', () => {
  for (const cor of MARCAS) {
    const t = T.resolve({ preset: 'marca', marca: [cor] });
    const k = T.contraste(t.bg, t.text);
    assert.ok(k >= 4.5, `${cor}: contraste do texto ficou ${k.toFixed(2)}`);
  }
});

test('tema derivado claro também dá texto legível', () => {
  for (const cor of MARCAS) {
    const t = T.resolve({ preset: 'marca', marca: [cor], marcaClara: true });
    const k = T.contraste(t.bg, t.text);
    assert.ok(k >= 4.5, `${cor} (claro): contraste ficou ${k.toFixed(2)}`);
  }
});

test('o acento se destaca do fundo em que está', () => {
  for (const cor of MARCAS) {
    const t = T.resolve({ preset: 'marca', marca: [cor] });
    const k = T.contraste(t.bg, t.accent);
    assert.ok(k >= 3, `${cor}: acento com contraste ${k.toFixed(2)}`);
  }
});

/*
 * O caso que motivou o conserto: clarear laranja não passa de ~2.4:1. Quem
 * escolhe a direção pela luminância do fundo erra exatamente aqui.
 */
test('acento sobre a própria marca funciona até em meio-tom', () => {
  for (const cor of MARCAS.filter((c) => c !== '#000000' && c !== '#ffffff')) {
    const a = T.acentoSobre(cor, cor);
    const k = T.contraste(cor, a);
    assert.ok(k >= 3.4, `${cor}: selo sobre a marca ficou com ${k.toFixed(2)}`);
  }
});

test('tingir mantém o clima do preset e troca só as cores de marca', () => {
  const base = T.resolve({ preset: 'luxury-gold' });
  const tinto = T.resolve({ preset: 'luxury-gold', aplicarMarca: true, marca: ['#ff4d00'] });
  assert.equal(tinto.bg, base.bg, 'o fundo do preset não deve mudar');
  assert.equal(tinto.radius, base.radius);
  assert.equal(tinto.brand, '#ff4d00');
  assert.notEqual(tinto.accent, base.accent);
});

test('ajuste manual vence a marca', () => {
  const t = T.resolve({ preset: 'marca', marca: ['#ff4d00'], overrides: { brand: '#0044cc' } });
  assert.equal(t.brand, '#0044cc');
});

test('sem cores de marca, cai no preset padrão em vez de quebrar', () => {
  for (const m of [[], null, undefined, ['nao-e-cor'], ['#zzz']]) {
    const t = T.resolve({ preset: 'marca', marca: m });
    assert.equal(t.brand, T.PRESETS[T.DEFAULT_PRESET].brand, 'marca inválida: ' + JSON.stringify(m));
  }
});

test('segunda cor da marca é usada quando existe, e derivada quando não', () => {
  const duas = T.resolve({ preset: 'marca', marca: ['#ff4d00', '#0044cc'] });
  assert.equal(duas.brand2, '#0044cc');
  const uma = T.resolve({ preset: 'marca', marca: ['#ff4d00'] });
  assert.notEqual(uma.brand2, uma.brand, 'sem a segunda cor, precisa derivar uma diferente');
});

test('textoSobre prefere o tom da marca quando ele já passa no contraste', () => {
  // Fundo bem escuro: o creme com pitada da marca passa, e é o que mantém a
  // identidade em vez de jogar branco puro em tudo.
  const t = T.textoSobre('#0b0505', '#ff4d00');
  assert.notEqual(t, '#ffffff');
  assert.ok(T.contraste('#0b0505', t) >= 4.5);
});
