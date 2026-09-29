/*
 * Texto em curva e biblioteca gráfica.
 *
 * O risco destas duas features é o de sempre no editor: aparecer de um
 * jeito no palco e de outro na TV ou no PNG. Por isso a conta mora em
 * js/peca.js e js/graficos.js e os três lados consomem a mesma — e este
 * arquivo confere a conta, o saneamento do servidor, e que o PNG desenha
 * de verdade (canvas simulado, contando as letras e os caminhos).
 */
const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const P = require('../js/peca.js');
const G = require('../js/graficos.js');
const composer = require('../server/composer.js');

const texto = (extra) => ({ tipo: 'texto', text: 'OFERTA', x: 30, y: 20, w: 40, h: 20, tamanho: 5, ...extra });

test('curva zero, ausente ou lixo é texto reto', () => {
  assert.equal(P.temCurva(texto()), false);
  assert.equal(P.temCurva(texto({ curva: 0 })), false);
  assert.equal(P.temCurva(texto({ curva: 'x' })), false);
  assert.equal(P.temCurva({ tipo: 'forma', curva: 50 }), false, 'só texto curva');
  assert.equal(P.temCurva(texto({ curva: 40 })), true);
});

test('arco para cima tem o centro do círculo abaixo da linha; para baixo, acima', () => {
  const cima = P.arcoTexto(texto({ curva: 60 }), '16/9');
  const baixo = P.arcoTexto(texto({ curva: -60 }), '16/9');
  assert.ok(cima.sobe && cima.cy > 0, 'arco para cima');
  assert.ok(!baixo.sobe);
  const y0 = Number(cima.d.split(' ')[1]);
  assert.ok(cima.cy > y0, 'o centro fica abaixo da linha de base');
  assert.match(cima.d, / 0 0 1 /, 'varredura horária sobe');
  assert.match(baixo.d, / 0 0 0 /, 'varredura anti-horária desce');
});

test('curva fora da faixa é limitada, e 100 é meio círculo', () => {
  const a = P.arcoTexto(texto({ curva: 999 }), '16/9');
  // Meio círculo: o raio é metade da corda (940/2).
  assert.ok(Math.abs(a.raio - 470) < 1, 'raio ' + a.raio);
});

test('a caixa sugerida pelo editor cresce com a curva', () => {
  const pouco = P.alturaParaCurva(texto({ curva: 20 }), '16/9');
  const muito = P.alturaParaCurva(texto({ curva: 90 }), '16/9');
  assert.ok(muito > pouco);
  assert.ok(muito <= 100);
});

test('todo gráfico do catálogo tem nome único, rótulo e caminho', () => {
  const nomes = new Set();
  for (const g of G.CATALOGO) {
    assert.ok(!nomes.has(g.nome), 'nome repetido: ' + g.nome);
    nomes.add(g.nome);
    assert.ok(g.rotulo && /^M/.test(g.d), g.nome);
    assert.ok(['fixa', 'livre'].includes(g.proporcao), g.nome);
    assert.ok(!/NaN|undefined/.test(g.d), 'caminho quebrado em ' + g.nome);
  }
  assert.ok(G.CATALOGO.length >= 15);
});

test('nome desconhecido desenha o primeiro, e não quebra', () => {
  assert.equal(G.pegar('nao-existe').nome, G.CATALOGO[0].nome);
  assert.match(G.svgMiolo('nao-existe'), /^<path d="M/);
});

test('o servidor guarda a curva e o gráfico, e saneia os dois', () => {
  const pal = { acento: '#ffaa00', texto: '#ffffff' };
  const t = composer.sanearElemento(texto({ curva: 400 }), pal, '16/9');
  assert.equal(t.curva, 100);
  assert.equal(composer.sanearElemento(texto({ curva: 0 }), pal, '16/9').curva, undefined);
  const g = composer.sanearElemento({ tipo: 'grafico', name: 'faixa', cor: 'lixo' }, pal, '16/9');
  assert.equal(g.tipo, 'grafico');
  assert.equal(g.cor, '#ffaa00');
  assert.equal(composer.sanearElemento({ tipo: 'grafico', name: '<script>' }, pal, '16/9').name, G.CATALOGO[0].nome);
});

test('o PNG exportado desenha o texto curvo letra por letra e o gráfico', async () => {
  // Canvas simulado: registra o que é desenhado.
  const feito = { letras: [], caminhos: 0 };
  const ctx = new Proxy({ measureText: (t) => ({ width: String(t).length * 10 }) }, {
    get(alvo, k) {
      if (k in alvo) return alvo[k];
      if (k === 'fillText') return (t) => feito.letras.push(t);
      if (k === 'fill') return (p) => { if (p && p.__caminho) feito.caminhos++; };
      return () => {};
    },
    set(alvo, k, v) { alvo[k] = v; return true; },
  });
  globalThis.Path2D = class { constructor(d) { this.__caminho = d; } };
  globalThis.document = {
    createElement: () => ({ getContext: () => ctx, width: 0, height: 0, style: {}, setAttribute() {}, appendChild() {} }),
    getElementById: () => null,
    head: { appendChild() {} },
    documentElement: { style: {} },
    fonts: { load: async () => [], ready: Promise.resolve() },
  };
  const url = pathToFileURL(path.join(__dirname, '..', 'web', 'src', 'lib', 'exportPng.js')).href;
  const { compositionToCanvas } = await import(url);
  await compositionToCanvas({
    formato: '16/9', bg: { kind: 'cor', cor: '#000000' },
    elementos: [
      texto({ curva: 50, text: 'OI MUNDO' }),
      { tipo: 'grafico', name: 'selo-oferta', x: 0, y: 0, w: 20, h: 20, cor: '#ff0000' },
    ],
  }, 1920, 1080);
  assert.equal(feito.letras.length, 'OI MUNDO'.length, 'o texto curvo sai letra por letra, não em linha');
  assert.equal(feito.letras.join(''), 'OI MUNDO');
  assert.equal(feito.caminhos, 1, 'o gráfico vira um Path2D preenchido');
});
