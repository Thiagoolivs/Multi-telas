/*
 * Sombra, borda e as unidades da peça.
 *
 * O que se testa aqui é sobretudo CONVERSÃO. Uma peça é desenhada num palco de
 * 400px no editor, 1920px na TV e 1080px no PNG exportado; se a conta de
 * unidade estiver errada, a sombra sai discreta num lugar e um borrão no
 * outro — e ninguém percebe até comparar as três telas lado a lado.
 */
const test = require('node:test');
const assert = require('node:assert');

const P = require('../js/peca.js');
const composer = require('../server/composer.js');
const ds = require('../server/design-system.js');

const PALETA = ds.buildPalette('#1e3a8a', null, 'escuro');
const sanear = (el) => composer.sanearElemento(el, PALETA, '16/9');

/* ---------------- Um módulo só ---------------- */

test('o editor não tem cópia do desenho: é o mesmo módulo', async () => {
  const web = await import('../web/src/lib/composition.js');
  assert.strictEqual(web.SHAPE_POLY, P.SHAPE_POLY, 'o editor está com uma cópia das formas');
  assert.strictEqual(web.fillToCss, P.fillToCss);
  assert.strictEqual(web.textFontCqw, P.textFontCqw);
});

/* ---------------- Sombra ---------------- */

test('sem sombra declarada, não sai sombra nenhuma', () => {
  assert.equal(P.sombraCss({}), 'none');
  assert.equal(P.sombraCss({ sombra: false }), 'none');
  assert.equal(P.sombra({ sombra: 0 }), null);
});

test('sombra: true continua funcionando', () => {
  /*
   * É como as peças já publicadas guardam "tem sombra". Se `true` deixasse de
   * valer, toda peça no ar perderia a sombra na primeira atualização do player
   * — e ninguém teria pedido isso.
   */
  const s = P.sombra({ sombra: true });
  assert.ok(s, 'true deixou de ser sombra');
  assert.deepEqual(
    [s.x, s.y, s.desfoque],
    [P.SOMBRA_PADRAO.x, P.SOMBRA_PADRAO.y, P.SOMBRA_PADRAO.desfoque],
  );
});

test('a mesma sombra sai proporcional em qualquer tamanho de tela', () => {
  // 0.5cqw são 9.6px numa peça de 1920 e 2px numa miniatura de 400.
  const el = { sombra: { x: 0, y: 0.5, desfoque: 1, opacidade: 0.5 } };
  assert.equal(P.sombraCss(el, 1920 / 100), '0px 9.6px 19.2px rgba(0,0,0,0.5)');
  assert.equal(P.sombraCss(el, 400 / 100), '0px 2px 4px rgba(0,0,0,0.5)');
  // E no player, que tem contêiner CSS, sai na unidade nativa.
  assert.equal(P.sombraCss(el), '0cqw 0.5cqw 1cqw rgba(0,0,0,0.5)');
});

test('o padrão é o antigo 0 2px 14px, convertido para cqw', () => {
  // A peça de 1920 continua com a sombra de sempre; o que muda é a miniatura,
  // onde 14px fixos viravam um borrão.
  const css = P.sombraCss({ sombra: true }, 1920 / 100);
  assert.match(css, /^0px 1\.92px 14\.02px /, css);
});

test('número absurdo é limitado, não aceito', () => {
  const s = P.sombra({ sombra: { x: 999, y: -999, desfoque: 999, opacidade: 5 } });
  assert.equal(s.x, P.SOMBRA_LIMITES.desloc);
  assert.equal(s.y, -P.SOMBRA_LIMITES.desloc);
  assert.equal(s.desfoque, P.SOMBRA_LIMITES.desfoque);
  assert.match(s.cor, /,1\)$/, 'opacidade acima de 1 devia ter sido limitada');
});

test('a cor da sombra vira rgba com a opacidade junto', () => {
  assert.equal(P.rgba('#000000', 0.45), 'rgba(0,0,0,0.45)');
  assert.equal(P.rgba('#fff', 1), 'rgba(255,255,255,1)');
  // Já veio pronta: não se reescreve, porque reescrever é que estragaria.
  assert.equal(P.rgba('rgba(1,2,3,.5)', 0.2), 'rgba(1,2,3,.5)');
});

test('cada tipo recebe a sombra na propriedade que funciona para ele', () => {
  /*
   * box-shadow numa div de texto desenha um retângulo em volta do BLOCO, não
   * das letras. Numa forma recortada, o recorte corta a box-shadow junto. E
   * numa imagem "inteira" a caixa tem sobra dos lados, então a sombra da caixa
   * ficaria pairando no vazio.
   */
  assert.equal(P.comoAplicarSombra({ tipo: 'texto' }), 'texto');
  assert.equal(P.comoAplicarSombra({ tipo: 'forma', shape: 'rect' }), 'caixa');
  assert.equal(P.comoAplicarSombra({ tipo: 'forma', shape: 'triangle' }), 'filtro');
  assert.equal(P.comoAplicarSombra({ tipo: 'imagem' }), 'filtro');
  assert.equal(P.comoAplicarSombra({ tipo: 'icone' }), 'filtro');
});

/* ---------------- Borda ---------------- */

test('borda de espessura zero é ausência de borda', () => {
  // Não é uma borda invisível: se fosse, o bloco encolheria por dentro do
  // box-sizing sem nada aparecer, e o texto se mexeria sozinho.
  assert.equal(P.borda({ borda: { largura: 0, cor: '#fff' } }), null);
  assert.equal(P.bordaCss({ borda: { largura: 0 } }), 'none');
  assert.equal(P.bordaCss({}), 'none');
});

test('a borda também é proporcional', () => {
  const el = { borda: { largura: 0.5, cor: '#ff0000', estilo: 'dashed' } };
  assert.equal(P.bordaCss(el, 1920 / 100), '9.6px dashed #ff0000');
  assert.equal(P.bordaCss(el), '0.5cqw dashed #ff0000');
});

test('traço desconhecido vira contínuo', () => {
  assert.match(P.bordaCss({ borda: { largura: 1, estilo: 'zebrado' } }), /solid/);
});

test('forma recortada é reconhecida como tal', () => {
  // O editor usa isto para NÃO oferecer borda onde ela sairia pela metade.
  assert.ok(P.recortada({ tipo: 'forma', shape: 'diamond' }));
  assert.ok(!P.recortada({ tipo: 'forma', shape: 'rect' }));
  assert.ok(!P.recortada({ tipo: 'imagem' }));
});

/* ---------------- Canto ---------------- */

test('o canto da forma é % do bloco e o da imagem é cqw', () => {
  /*
   * São duas convenções antigas, e as duas estão em peças já publicadas.
   * Unificar mudaria a cara do que está no ar sem ninguém pedir.
   */
  assert.equal(P.raioCss({ tipo: 'forma', radius: 20 }), '20%');
  assert.equal(P.raioCss({ tipo: 'imagem', radius: 2 }, 1920 / 100), '38.4px');
  assert.equal(P.raioCss({ tipo: 'imagem', radius: 0 }), '0');
});

/* ---------------- O que o servidor guarda ---------------- */

test('o validador aceita sombra em objeto e limita os números', () => {
  const t = sanear({ tipo: 'forma', shape: 'rect', sombra: { y: 99, desfoque: 2, opacidade: 0.8 } });
  assert.equal(t.sombra.y, P.SOMBRA_LIMITES.desloc);
  assert.equal(t.sombra.desfoque, 2);
  assert.equal(t.sombra.opacidade, 0.8);
});

test('o validador preserva a sombra antiga', () => {
  assert.equal(sanear({ tipo: 'texto', text: 'oi', sombra: true }).sombra, true);
  assert.equal(sanear({ tipo: 'texto', text: 'oi' }).sombra, false);
});

test('o validador descarta borda sem espessura', () => {
  assert.equal(sanear({ tipo: 'forma', borda: { largura: 0 } }).borda, undefined);
  assert.equal(sanear({ tipo: 'forma', borda: 'grossa' }).borda, undefined);
  const b = sanear({ tipo: 'forma', borda: { largura: 99, cor: '#00ff00' } }).borda;
  assert.equal(b.largura, P.BORDA_MAX);
  assert.equal(b.cor, '#00ff00');
});

test('imagem também guarda canto, sombra e borda', () => {
  const i = sanear({ tipo: 'imagem', src: '/m/a.png', radius: 3, sombra: true, borda: { largura: 1 } });
  assert.equal(i.radius, 3);
  assert.equal(i.sombra, true);
  assert.equal(i.borda.largura, 1);
});
