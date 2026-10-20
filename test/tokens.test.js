/*
 * Tokens v2 — as cores que uma peça-html pode usar (docs/PLANO.md §4.3).
 *
 * A peça escreve `var(--mt-destaque)`, nunca um hex. O que estes testes
 * guardam é a promessa que torna isso seguro: QUALQUER marca, em QUALQUER
 * modo, produz um jogo de cores em que todo par permitido se lê. Se uma marca
 * exótica quebrar o contrato, a peça sai ilegível na parede de alguém, sem
 * erro nenhum — então o contrato é conferido numa amostra larga de cores, e
 * não só nas bonitas.
 */
const test = require('node:test');
const assert = require('node:assert');

const C = require('../js/cor.js');
const F = require('../js/fontes.js');
const T = require('../js/tokens.js');

// Marcas que já deram trabalho em outros lugares do sistema: meios-tons,
// amarelo, carmim, preto, branco, cinza do meio, pastel.
const DIFICEIS = [
  '#1b2a4a', '#1e3a8a', '#e11d48', '#f97316', '#ffd400', '#84cc16', '#06b6d4',
  '#7c3aed', '#ec4899', '#7c4a1e', '#000000', '#ffffff', '#808080', '#767676',
  '#959595', '#ff0000', '#00ff00', '#0000ff', '#fde2e4', '#0f766e', '#c8a96e',
  '#b4532a', '#c2577a', '#f2c14e', '#3b3b3b', '#f80',
];

// Gerador com semente: a amostra é larga e SEMPRE a mesma — teste que muda
// de entrada a cada rodada falha um dia e passa no outro.
function amostra(n, semente) {
  let s = semente;
  const r = () => { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648; };
  return Array.from({ length: n }, () => C.rgb2hex(r() * 255, r() * 255, r() * 255));
}
const MARCAS = DIFICEIS.concat(amostra(300, 42));

test('o contrato de contraste vale para toda marca, em todo modo', () => {
  const falhas = [];
  for (const marca of MARCAS) {
    for (const modo of T.MODOS) {
      const f = T.conferir(T.gerar({ marca, modo }));
      if (f.length) falhas.push(marca + ' ' + modo + ': ' + JSON.stringify(f[0]));
    }
  }
  assert.deepEqual(falhas, [], falhas.slice(0, 5).join('\n'));
});

test('o contrato vale também com segunda cor — inclusive uma que briga com a marca', () => {
  /*
   * A segunda cor só entra no modo marca, onde vira destaque sobre a cor
   * da marca. Uma segunda cor IGUAL à marca, ou quase, é o caso que
   * apagaria o botão.
   */
  const pares = [['#1b2a4a', '#c8a96e'], ['#b4532a', '#f2c14e'], ['#e11d48', '#e11d48'],
    ['#e11d48', '#e2204a'], ['#ffd400', '#ffffff'], ['#000000', '#111111']];
  for (const [marca, marca2] of pares) {
    for (const modo of T.MODOS) {
      assert.deepEqual(T.conferir(T.gerar({ marca, marca2, modo })), [], marca + ' + ' + marca2 + ' ' + modo);
    }
  }
});

test('conferir acusa um jogo quebrado (o teste do contrato não é vazio)', () => {
  /*
   * Conferir ao contrário: se `conferir` devolvesse sempre lista vazia, o
   * teste acima passaria com qualquer política de cor. Aqui o defeito é
   * posto de propósito e precisa aparecer.
   */
  const t = T.gerar({ marca: '#1b2a4a', modo: 'escuro' });
  t.cores.texto = t.cores.fundo;
  t.cores.sobreDestaque = t.cores.destaque;
  const f = T.conferir(t);
  assert.ok(f.some((x) => x.frente === 'texto' && x.fundo === 'fundo'), 'texto = fundo passou');
  assert.ok(f.some((x) => x.frente === 'sobreDestaque'), 'texto do botão invisível passou');
});

test('todo par do contrato tem piso de AA: 4.5 para texto, 3 só para o destaque', () => {
  for (const p of T.PARES) {
    assert.equal(p.minimo, p.frente === 'destaque' ? 3 : 4.5, p.frente + ' sobre ' + p.fundo);
  }
  // Os três fundos aceitam os mesmos textos: cartão sobre fundo não muda a regra.
  for (const frente of ['texto', 'textoSuave', 'preco', 'destaque']) {
    const fundos = T.PARES.filter((p) => p.frente === frente).map((p) => p.fundo).sort();
    assert.deepEqual(fundos, ['fundo', 'fundo2', 'superficie'], frente);
  }
});

test('modo marca: o fundo é a cor EXATA da marca — é o efeito cartaz', () => {
  for (const marca of DIFICEIS) {
    assert.equal(T.gerar({ marca, modo: 'marca' }).cores.fundo, C.okHex(marca), marca);
  }
});

test('sem saída para um lado, a cor tenta o outro antes de virar preto ou branco', () => {
  /*
   * Verde-limão claro sobre salmão: clarear o verde nunca chega a 3:1
   * contra os fundos do modo marca, que também são claros. Procurando só
   * nesse sentido, o destaque caía no último recurso — preto puro — e o
   * verde da empresa sumia da peça sem ninguém pedir. Escurecendo, ele
   * continua verde. (Achado reintroduzindo o defeito: o contrato passava
   * do mesmo jeito, só a identidade se perdia.)
   */
  const t = T.gerar({ marca: '#d6745f', marca2: '#bff16e', modo: 'marca' });
  const d = C.paraOklch(t.cores.destaque);
  assert.ok(d.c > 0.05, 'o destaque perdeu a cor: ' + t.cores.destaque);
  assert.ok(Math.abs(d.h - C.paraOklch('#bff16e').h) < 10, 'o destaque mudou de matiz: ' + t.cores.destaque);
});

test('com duas cores, o destaque é a que já se lê naquele fundo', () => {
  /*
   * A ótica: azul-marinho de identidade, dourado de acento. No escuro, o
   * dourado aparece como é; clarear o marinho até aparecer daria um azul
   * qualquer. No claro, o contrário. Escolher a que precisa de menos ajuste
   * é escolher a que continua sendo ela mesma.
   */
  const h = (x) => C.paraOklch(x).h;
  const escuro = T.gerar({ marca: '#1b2a4a', marca2: '#c8a96e', modo: 'escuro' }).cores.destaque;
  const claro = T.gerar({ marca: '#1b2a4a', marca2: '#c8a96e', modo: 'claro' }).cores.destaque;
  assert.equal(escuro, '#c8a96e', 'no escuro o dourado já se lê e deveria entrar intacto');
  assert.equal(claro, '#1b2a4a', 'no claro o marinho já se lê e deveria entrar intacto');
  assert.ok(Math.abs(h(escuro) - h('#c8a96e')) < 5);
});

test('modo marca usa a segunda cor como destaque quando ela existe', () => {
  const t = T.gerar({ marca: '#1b2a4a', marca2: '#c8a96e', modo: 'marca' });
  const h = (x) => C.paraOklch(x).h;
  assert.ok(Math.abs(h(t.cores.destaque) - h('#c8a96e')) < 8, 'o dourado da ótica sumiu do destaque: ' + t.cores.destaque);
});

test('rascunho é cinza e igual para toda marca — o wireframe não fala de cor', () => {
  const ref = T.gerar({ marca: '#1b2a4a', modo: 'rascunho' }).cores;
  for (const marca of DIFICEIS) {
    const t = T.gerar({ marca, modo: 'rascunho' }).cores;
    assert.deepEqual(t, ref, marca);
  }
  for (const [k, v] of Object.entries(ref)) {
    assert.ok(C.paraOklch(v).c < 0.005, k + ' tem cor no rascunho: ' + v);
  }
});

test('claro é claro e escuro é escuro, para toda marca', () => {
  for (const marca of MARCAS) {
    assert.ok(C.luminancia(T.gerar({ marca, modo: 'escuro' }).cores.fundo) < 0.03, 'escuro ' + marca);
    assert.ok(C.luminancia(T.gerar({ marca, modo: 'claro' }).cores.fundo) > 0.85, 'claro ' + marca);
  }
});

test('o destaque continua sendo a cor da marca: muda a luminosidade, não a matiz', () => {
  /*
   * Escurecer ou clarear para ganhar contraste é permitido; virar outra cor
   * não. A exceção são os amarelos, testados à parte.
   */
  const distancia = (a, b) => { const d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d; };
  for (const marca of MARCAS) {
    const o = C.paraOklch(marca);
    if (o.c < 0.06 || (o.h >= 75 && o.h <= 125)) continue;
    for (const modo of ['claro', 'escuro']) {
      const d = C.paraOklch(T.gerar({ marca, modo }).cores.destaque);
      // Perto do branco ou do preto a tela não tem croma e a matiz deixa de
      // existir — ali não há o que conferir.
      if (d.c < 0.03) continue;
      assert.ok(distancia(d.h, o.h) < 10, `${marca} ${modo}: matiz ${o.h.toFixed(0)} → ${d.h.toFixed(0)}`);
    }
  }
});

test('amarelo escurecido vai para o âmbar, não para o oliva', () => {
  /*
   * Visto no render: na mesma matiz, a marca amarela no modo claro saía
   * com botão cor de azeitona. Oliva fica perto de 105–110° em OKLCH; o
   * âmbar que um designer usaria, abaixo de 85°.
   */
  for (const marca of ['#ffd400', '#facc15', '#fde047', '#eab308']) {
    const d = C.paraOklch(T.gerar({ marca, modo: 'claro' }).cores.destaque);
    assert.ok(d.h < 85 && d.h > 55, marca + ' virou matiz ' + d.h.toFixed(0));
  }
});

test('marca escura e apagada ganha croma no destaque do modo escuro', () => {
  /*
   * Azul-marinho clareado na mesma saturação vira cinza-azulado: um botão
   * apagado que parece desativado. Visto no render da ótica.
   */
  const marca = '#1b2a4a';
  const d = C.paraOklch(T.gerar({ marca, modo: 'escuro' }).cores.destaque);
  assert.ok(d.c > C.paraOklch(marca).c * 1.4, 'destaque apagado: croma ' + d.c.toFixed(3));
  // Marca cinza continua cinza: croma inventado seria decidir a cor pela empresa.
  assert.ok(C.paraOklch(T.gerar({ marca: '#3b3b3b', modo: 'escuro' }).cores.destaque).c < 0.01);
});

test('variaveis: exatamente os nomes do plano, com valores que o CSS aceita', () => {
  const v = T.variaveis(T.gerar({ marca: '#1b2a4a', modo: 'claro', fonteTitulo: 'condensada', fonteTexto: 'sans', raio: 'redondo' }));
  assert.deepEqual(Object.keys(v).sort(), [
    '--mt-destaque', '--mt-escala-titulo', '--mt-fonte-texto', '--mt-fonte-titulo', '--mt-fundo', '--mt-fundo-0', '--mt-fundo-2',
    '--mt-linha', '--mt-preco', '--mt-raio', '--mt-sobre-destaque', '--mt-superficie',
    '--mt-texto', '--mt-texto-suave',
  ]);
  for (const [k, x] of Object.entries(v)) {
    if (k.includes('fonte') || k === '--mt-raio' || k === '--mt-fundo-0' || k === '--mt-escala-titulo') continue;
    assert.match(x, /^#[0-9a-f]{6}$/, k);
  }
  // O véu da foto some na MESMA cor do fundo, não em preto transparente.
  const [r, g, b] = C.hex2rgb(v['--mt-fundo']);
  assert.equal(v['--mt-fundo-0'], `rgba(${r},${g},${b},0)`);
  assert.equal(v['--mt-fonte-titulo'], F.FAMILIAS.condensada.css);
  assert.equal(v['--mt-fonte-texto'], F.FAMILIAS.sans.css);
  // Medida do container, como tudo na peça: em pixel o canto seria outro na miniatura.
  assert.equal(v['--mt-raio'], '3cqmin');
  // Fonte condensada é a referência das peças-ouro: título no tamanho desenhado.
  assert.equal(v['--mt-escala-titulo'], '1');
});

test('escala do título: fonte larga encolhe o título grande; estreita nunca o aumenta', () => {
  const e = (f) => T.gerar({ marca: '#1b2a4a', fonteTitulo: f }).escalaTitulo;
  assert.equal(e('condensada'), 1);
  assert.equal(e('display'), 1, 'Anton é mais estreita que a referência, e mesmo assim não cresce');
  assert.equal(e('serifada'), 0.821, 'Playfair em caixa alta: 0,554 em contra 0,455 da Oswald');
  assert.ok(e('grotesca') < 0.75, 'Archivo Black é a mais larga do catálogo');
  for (const id of Object.keys(F.FAMILIAS)) assert.ok(e(id) > 0.5 && e(id) <= 1, id);
});

test('entrada torta não quebra: cai nos padrões', () => {
  const t = T.gerar({ marca: 'azul', modo: 'neon', raio: 'pontudo', fonteTitulo: 'comic' });
  assert.equal(t.marca, '#1e3a8a');
  assert.equal(t.modo, T.MODO_PADRAO);
  assert.equal(t.raio, T.RAIOS.suave);
  assert.equal(t.fontes.titulo, F.FAMILIAS[F.FAMILIA_PADRAO].css);
  assert.deepEqual(T.conferir(t), []);
  assert.deepEqual(T.conferir(T.gerar()), []);
});

test('daMarca lê a Marca como ela é guardada', () => {
  const m = { cores: ['#0f766e', '#f2c14e'], fonteTitulo: 'serifada', fonteApoio: 'leitura' };
  const t = T.daMarca(m, 'marca', 'reto');
  assert.deepEqual(t, T.gerar({ marca: '#0f766e', marca2: '#f2c14e', modo: 'marca', raio: 'reto', fonteTitulo: 'serifada', fonteTexto: 'leitura' }));
  assert.deepEqual(T.conferir(T.daMarca(null, 'claro')), []);
});

test('mesma entrada, mesma saída — a peça não muda de cor sozinha', () => {
  for (const modo of T.MODOS) {
    assert.deepEqual(T.gerar({ marca: '#c2577a', modo }), T.gerar({ marca: '#c2577a', modo }));
  }
});

/* ---------------- OKLCH em js/cor.js ---------------- */

test('OKLCH: valores de referência do CSS', () => {
  const perto = (a, b, tol, rotulo) => assert.ok(Math.abs(a - b) < tol, `${rotulo}: ${a} ≠ ${b}`);
  const v = C.paraOklch('#ff0000');
  // oklch(62.8% 0.2577 29.23) — o vermelho puro na especificação do CSS.
  perto(v.l, 0.628, 0.001, 'L'); perto(v.c, 0.2577, 0.001, 'C'); perto(v.h, 29.23, 0.05, 'H');
  perto(C.paraOklch('#ffffff').l, 1, 0.0001, 'branco');
  perto(C.paraOklch('#ffffff').c, 0, 0.0001, 'branco sem croma');
  perto(C.paraOklch('#000000').l, 0, 0.0001, 'preto');
  assert.equal(C.paraOklch('xyz'), null);
});

test('OKLCH: ida e volta devolve o mesmo hex', () => {
  for (const h of DIFICEIS.map((x) => C.okHex(x)).concat(amostra(500, 7))) {
    const o = C.paraOklch(h);
    assert.equal(C.deOklch(o.l, o.c, o.h), h);
  }
});

test('OKLCH: cor fora da tela perde croma, não matiz', () => {
  /*
   * Azul saturadíssimo quase branco não existe em sRGB. Cortar canal por
   * canal viraria ciano; reduzir o croma mantém o azul.
   */
  const x = C.deOklch(0.9, 0.4, 264);
  assert.match(x, /^#[0-9a-f]{6}$/);
  assert.ok(Math.abs(C.paraOklch(x).h - 264) < 3, 'matiz andou: ' + C.paraOklch(x).h);
  assert.ok(Math.abs(C.paraOklch(x).l - 0.9) < 0.01, 'luminosidade andou');
});
