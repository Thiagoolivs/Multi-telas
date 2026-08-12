/*
 * Tipografia.
 *
 * O defeito que originou este arquivo não era um erro de cálculo: era o
 * editor desenhar o texto com a fonte do sistema enquanto a TV desenhava com
 * Anton. A pessoa compunha a peça, aprovava, publicava, e via outra coisa na
 * parede. Por isso o teste central aqui não é "a função devolve o valor certo"
 * e sim "os três lados devolvem o MESMO estilo".
 */
const test = require('node:test');
const assert = require('node:assert');

const F = require('../js/fontes.js');
const composer = require('../server/composer.js');
const ds = require('../server/design-system.js');

/* ---------------- Um catálogo só ---------------- */

test('o editor não tem catálogo próprio: é o mesmo objeto', async () => {
  // Se um dia alguém copiar a lista para dentro de web/, este teste cai — e
  // cai ANTES de a divergência chegar numa tela.
  const web = await import('../web/src/lib/fontes.js');
  assert.strictEqual(web.FAMILIAS, F.FAMILIAS, 'o editor está com uma cópia da lista');
  assert.strictEqual(web.estiloTexto({ fonte: 'display' }).fontFamily, F.estiloTexto({ fonte: 'display' }).fontFamily);
});

test('o servidor também lê do catálogo único', () => {
  assert.strictEqual(ds.FAMILIAS, F.FAMILIAS);
  assert.equal(ds.familia('display'), 'display');
  assert.equal(ds.familia('não-existe'), 'sans', 'família desconhecida tem que virar a padrão');
});

test('as famílias antigas continuam existindo', () => {
  // Peças já salvas usam estes nomes. Renomear um deles muda a fonte de tudo
  // o que está publicado, sem ninguém pedir.
  for (const id of ['sans', 'display', 'condensada', 'serifada', 'script']) {
    assert.ok(F.FAMILIAS[id], 'sumiu a família ' + id);
  }
});

test('toda família declara o que precisa para ser desenhada', () => {
  for (const id of F.IDS) {
    const f = F.FAMILIAS[id];
    assert.ok(f.css && f.css.includes(','), id + ': a pilha precisa de fallback, senão a TV sem rede fica sem fonte');
    assert.ok(Array.isArray(f.pesos) && f.pesos.length, id + ': sem lista de pesos');
    assert.ok(f.entrelinha > 0.5 && f.entrelinha < 3, id + ': entrelinha implausível');
    assert.ok(f.largura > 0.2 && f.largura < 1, id + ': largura de caractere implausível');
    assert.ok(f.rotulo && f.papel, id + ': sem rótulo ou sem papel, o seletor fica ilegível');
  }
});

/* ---------------- Peso ---------------- */

test('o peso é encaixado no que a fonte realmente tem', () => {
  /*
   * Pedir 900 ao Anton, que só tem 400, faz o navegador engordar a letra
   * sozinho — e cada navegador engorda de um jeito. O editor mostra 400, a TV
   * desenha 400, e o que se vê é o que sai.
   */
  assert.equal(F.pesoValido('display', 900), 400);
  assert.equal(F.pesoValido('script', 800), 400);
  assert.equal(F.pesoValido('sans', 900), 900);
  assert.equal(F.pesoValido('condensada', 800), 700, 'devia cair no mais próximo que existe');
  assert.equal(F.pesoValido('leitura', 500), 400);
});

test('família desconhecida não quebra o peso', () => {
  assert.equal(F.pesoValido('inventada', 700), 700); // cai em sans
});

/* ---------------- O estilo que vai para a tela ---------------- */

test('sem nada declarado, o texto sai com o padrão da família', () => {
  const s = F.estiloTexto({ fonte: 'display', text: 'oi' });
  assert.match(s.fontFamily, /Anton/);
  assert.equal(s.lineHeight, '0.92', 'cartaz pede entrelinha apertada');
  assert.equal(s.textTransform, 'uppercase', 'a família display é caixa alta por estilo');
  assert.equal(s.fontStyle, 'normal');
  assert.equal(s.textAlign, 'center');
});

test('trocar de família troca a entrelinha padrão junto', () => {
  assert.notEqual(F.estiloTexto({ fonte: 'display' }).lineHeight, F.estiloTexto({ fonte: 'leitura' }).lineHeight);
});

test('caixa alta pedida no elemento vale mesmo em família que não força', () => {
  assert.equal(F.estiloTexto({ fonte: 'sans' }).textTransform, 'none');
  assert.equal(F.estiloTexto({ fonte: 'sans', caixaAlta: true }).textTransform, 'uppercase');
});

test('ausente é diferente de zero', () => {
  /*
   * Number(null) é 0. Sem tratar isso, devolver o controle ao padrão gravaria
   * espaçamento zero — que é um valor escolhido, não a ausência de escolha —
   * e o texto ficaria congelado num ajuste que ninguém pediu.
   */
  assert.equal(F.estiloTexto({ fonte: 'sans' }).letterSpacing, '-0.01em');
  assert.equal(F.estiloTexto({ fonte: 'sans', espacamento: null }).letterSpacing, '-0.01em');
  assert.equal(F.estiloTexto({ fonte: 'sans', espacamento: 0 }).letterSpacing, '0em');
  assert.equal(F.estiloTexto({ fonte: 'sans', entrelinha: null }).lineHeight, '1.08');
});

test('valor absurdo é limitado, não aceito', () => {
  assert.equal(F.estiloTexto({ espacamento: 99 }).letterSpacing, F.ESPACAMENTO.max + 'em');
  assert.equal(F.estiloTexto({ entrelinha: 0.1 }).lineHeight, String(F.ENTRELINHA.min));
  assert.equal(F.estiloTexto({ espacamento: 'abc' }).letterSpacing, '-0.01em');
});

test('a estimativa de largura é a conservadora', () => {
  // Estimar pela fonte ideal (mais estreita) faria o título estourar a caixa
  // justamente na TV sem internet, que cai no fallback largo.
  for (const id of F.IDS) {
    const f = F.FAMILIAS[id];
    assert.ok(F.larguraCaractere(id) >= f.largura, id + ': a estimativa ficou otimista demais');
  }
});

/* ---------------- O que o servidor guarda ---------------- */

const PALETA = ds.buildPalette('#1e3a8a', null, 'escuro');
const sanear = (el) => composer.sanearElemento(el, PALETA, '16/9');

test('o validador encaixa o peso e guarda os ajustes finos', () => {
  const t = sanear({ tipo: 'texto', text: 'oi', fonte: 'display', peso: 900, espacamento: 0.2, entrelinha: 1.4, x: 10, y: 10, w: 50, h: 20 });
  assert.equal(t.peso, 400, 'Anton só tem um peso');
  assert.equal(t.espacamento, 0.2);
  assert.equal(t.entrelinha, 1.4);
  assert.equal(t.text, 'OI', 'display é caixa alta');
});

test('o validador não inventa ajuste fino em quem não pediu', () => {
  const t = sanear({ tipo: 'texto', text: 'oi', fonte: 'sans', x: 10, y: 10, w: 50, h: 20 });
  assert.ok(!('espacamento' in t), 'gravou espaçamento que ninguém escolheu');
  assert.ok(!('entrelinha' in t), 'gravou entrelinha que ninguém escolheu');
  assert.equal(t.text, 'oi', 'família sem caixa alta não deve mexer no texto');
});

test('o validador limita o ajuste fino em vez de aceitar qualquer número', () => {
  const t = sanear({ tipo: 'texto', text: 'oi', fonte: 'sans', espacamento: 50, entrelinha: 99, x: 0, y: 0, w: 50, h: 20 });
  assert.equal(t.espacamento, F.ESPACAMENTO.max);
  assert.equal(t.entrelinha, F.ENTRELINHA.max);
});
