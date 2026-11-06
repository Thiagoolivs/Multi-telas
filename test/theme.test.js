/*
 * js/theme.js roda no navegador (IIFE em window), mas a matemática de cor dele
 * é pura — dá para testar em node com um shim mínimo de DOM. E precisa ser
 * testada: é ela que decide se o texto da TV do cliente vai ser legível.
 *
 * O piso é 4,5:1 em todo texto, o acento também: ele pinta o preço, o @ e o
 * kicker (docs/qa-total/REFERENCIAS.md; o reteste da fase 10 mediu 2,5 a 3,5).
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

/*
 * Os fundos em que o acento vira texto: o palco (bg e bg2) e o vidro das
 * zonas sobre ele. O preço da clínica dava 2,6 no reteste porque o acento
 * só era conferido contra o bg liso, e com 3,5.
 */
function fundosDe(t) {
  const C = require('../js/cor.js');
  const sup = t.surface.split(',').map(Number);
  const vidro = C.rgb2hex(sup[0], sup[1], sup[2]);
  return [t.bg, t.bg2, C.mix(t.bg, vidro, t.glass), C.mix(t.bg2, vidro, t.glass)];
}
const pior = (cor, fundos) => Math.min.apply(null, fundos.map((f) => T.contraste(cor, f)));

test('o acento se lê como texto (4,5) em todo fundo do tema, escuro e claro', () => {
  const marcas = MARCAS.concat(['#b4532a', '#0f766e', '#23395d', '#1b2a4a']);
  for (const cor of marcas) {
    for (const marcaClara of [false, true]) {
      const t = T.resolve({ preset: 'marca', marca: [cor], marcaClara });
      const k = pior(t.accent, fundosDe(t));
      assert.ok(k >= 4.5, `${cor}${marcaClara ? ' (claro)' : ''}: acento com contraste ${k.toFixed(2)}`);
    }
  }
});

test('o acento dos temas prontos e da marca tingida também passa de 4,5', () => {
  for (const id of Object.keys(T.PRESETS)) {
    for (const extra of [{}, { aplicarMarca: true, marca: ['#0f766e'] }, { aplicarMarca: true, marca: ['#ffd400'] }]) {
      const t = T.resolve(Object.assign({ preset: id }, extra));
      const k = pior(t.accent, fundosDe(t));
      assert.ok(k >= 4.5, `${id} ${JSON.stringify(extra)}: acento ${t.accent} com ${k.toFixed(2)}`);
    }
  }
});

test('o acento continua com a matiz da marca: muda a luz, não a cor', () => {
  // O verde-azulado da clínica e o terracota da padaria, sobre o palco escuro da marca.
  const C = require('../js/cor.js');
  for (const cor of ['#0f766e', '#b4532a', '#e11d48']) {
    const t = T.resolve({ preset: 'marca', marca: [cor] });
    const h = (x) => C.paraOklch(x).h;
    assert.ok(Math.abs(h(t.accent) - h(cor)) < 6, `${cor} virou ${t.accent}`);
  }
});

test('o ajuste à mão do acento continua com a palavra final', () => {
  const t = T.resolve({ preset: 'marca', marca: ['#0f766e'], overrides: { accent: '#123456' } });
  assert.equal(t.accent, '#123456');
});

/*
 * O caso que motivou o conserto: clarear laranja não passa de ~2.4:1. Quem
 * escolhe a direção pela luminância do fundo erra exatamente aqui.
 */
test('acento sobre a própria marca funciona até em meio-tom', () => {
  // É o rodapé pintado na cor da marca: o acento ali é texto, então 4,5.
  for (const cor of MARCAS) {
    const a = T.acentoSobre(cor, cor);
    const k = T.contraste(cor, a);
    assert.ok(k >= 4.5, `${cor}: texto de destaque sobre a marca ficou com ${k.toFixed(2)}`);
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

test('item 41: o fundo da TV combina com as peças, ou é claro, escuro ou uma cor', () => {
  const C = require('../js/cor.js');
  const claraDaMarca = { zonas: { principal: { items: [
    { type: 'peca-html', modo: 'claro', marca: { cores: ['#7a3e1d', '#e8b04b'] } },
    { type: 'peca-html', modo: 'claro', marca: { cores: ['#7a3e1d', '#e8b04b'] } },
    { type: 'peca-html', modo: 'escuro', marca: { cores: ['#7a3e1d', '#e8b04b'] } },
  ] } } };
  const pecas = T.pecasDaConfig(claraDaMarca);
  assert.equal(pecas.modo, 'claro', 'vale o par mais frequente');
  assert.equal(T.pecasDaConfig({ zonas: { principal: { items: [{ type: 'text' }] } } }), null);
  // Padrão: o tema escuro, com peças claras, vira claro — e o texto continua legível.
  const t = T.resolve({ preset: 'dark-premium' }, { pecas });
  assert.equal(t.dark, false);
  assert.ok(C.luminancia(t.bg) > 0.45);
  assert.ok(T.contraste(t.bg, t.text) >= 4.5);
  // Sem peça, fica o tema como era.
  assert.equal(T.resolve({ preset: 'dark-premium' }, { pecas: null }).bg, T.PRESETS['dark-premium'].bg);
  // Claro e escuro à mão.
  assert.equal(T.resolve({ preset: 'dark-premium', fundo: 'claro' }, { pecas }).dark, false);
  assert.equal(T.resolve({ preset: 'minimal-white', fundo: 'escuro' }, { pecas }).dark, true);
  // Uma cor: o texto se ajusta a ela.
  const cor = T.resolve({ preset: 'dark-premium', fundo: 'cor', fundoCor: '#f5efe8' }, { pecas });
  assert.equal(cor.bg, '#f5efe8');
  assert.ok(T.contraste(cor.bg, cor.text) >= 4.5);
  // O ajuste à mão do Avançado continua com a palavra final.
  assert.equal(T.resolve({ preset: 'dark-premium', overrides: { bg: '#123456' } }, { pecas }).bg, '#123456');
});

/*
 * O canto de .mt-surface (o fundo de quase todo conteúdo pronto) leva 30%
 * do halo. Com a marca amarela ou branca, o canto virava cinza-médio e nem
 * o texto branco passava; com o acento claro, o preço da lista caía para 3.
 * As camadas aqui são as do CSS (css/player.css, .mt-surface).
 */
test('o canto do conteúdo (.mt-surface) não apaga o texto, o texto suave nem o acento', () => {
  const C = require('../js/cor.js');
  const temas = ['#b4532a', '#0f766e', '#23395d', '#ffd400', '#ffffff', '#12b76a', '#e11d48']
    .map((cor) => ({ preset: 'marca', marca: [cor] }))
    .concat(Object.keys(T.PRESETS).map((preset) => ({ preset })));
  for (const th of temas) {
    const t = T.resolve(th);
    const tingido = C.mix(t.bg2, t.halo, 0.085);
    const canto = C.mix(C.mix(tingido, t.halo, 0.3), '#ffffff', 0.05);
    const nome = JSON.stringify(th);
    assert.ok(T.contraste(t.text, canto) >= 4.5, nome + ': texto no canto com ' + T.contraste(t.text, canto).toFixed(2));
    assert.ok(T.contraste(t.accent, canto) >= 4.5, nome + ': acento no canto com ' + T.contraste(t.accent, canto).toFixed(2));
    if (/^#[0-9a-f]{6}$/i.test(t.textDim)) assert.ok(T.contraste(t.textDim, canto) >= 4.5, nome + ': texto suave no canto');
  }
});

test('texto sobre a marca e sobre o acento: as duas pontas do degradê se leem', () => {
  // A padaria (terracota e dourado): branco no dourado do rodapé dava 1,6:1.
  const vars = {};
  const raiz = { style: { setProperty: (k, v) => { vars[k] = v; } }, classList: { toggle() {} } };
  for (const marca of [['#b4532a', '#f2c14e'], ['#0f766e', '#e0f2f1'], ['#23395d', '#f4a261'], ['#ffd400'], ['#ffffff', '#000000']]) {
    T.apply({ preset: 'marca', marca }, raiz);
    for (const k of ['--brand-sob-texto', '--brand-2-sob-texto']) {
      assert.ok(T.contraste(vars['--on-brand'], vars[k]) >= 4.5, marca + ' ' + k + ': ' + T.contraste(vars['--on-brand'], vars[k]).toFixed(2));
    }
    for (const k of ['--accent', '--accent-2']) {
      assert.ok(T.contraste(vars['--on-accent'], vars[k]) >= 4.5, marca + ' ' + k + ': ' + T.contraste(vars['--on-accent'], vars[k]).toFixed(2));
    }
  }
  // O CSS usa as pontas acertadas onde há texto no degradê da marca.
  const css = require('fs').readFileSync(require('path').join(__dirname, '..', 'css', 'player.css'), 'utf8');
  assert.doesNotMatch(css, /linear-gradient\(150deg, var\(--brand\), var\(--brand-2\)\)/);
  assert.match(css, /\.mt-ticker \{\n  background: linear-gradient\(90deg, var\(--brand-sob-texto/);
});
