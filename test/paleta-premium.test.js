/*
 * PALETAS QUE PARECEM CARAS EM TODO CASO (lote de 06/11).
 *
 * O dono achou o conteúdo da TV "meio feio e infantil": os tons pastel não
 * funcionavam em todo caso. A folha de contato das marcas mostrou o fundo
 * claro virando um tom lavado da marca, o cartaz pintado de rosa-bebê ou de
 * amarelo-claro, o palco escuro barrento e o acento apagado ou quase branco.
 *
 * As regras que estes testes guardam, nos três climas que o dono escolhe
 * (Escuro elegante, Claro limpo, Cor da marca forte) e no palco da TV:
 *
 *   - a base é escura (tinta ou um tom profundo da marca) ou um neutro
 *     quente ou frio — nunca um tom lavado da marca, nunca um meio-tom;
 *   - UM acento forte da marca: com croma (não apagado), nem quase branco,
 *     e a 4,5 sobre a base;
 *   - cor clara (pastel, neon, amarelo) vira o acento sobre base escura;
 *   - texto a 4,5, sempre.
 *
 * Os casos: os dez logos difíceis do pedido, de verdade, e as marcas de
 * exemplo do manifesto.
 */
const test = require('node:test');
const assert = require('node:assert');

const C = require('../js/cor.js');
const T = require('../js/tokens.js');
const P = require('../js/paletas.js');
global.window = global.window || {};
global.document = global.document || {
  getElementById: () => null, createElement: () => ({ setAttribute() {} }), head: { appendChild() {} },
  documentElement: { style: { setProperty() {} }, classList: { toggle() {} } },
};
require('../js/theme.js');
const TH = global.window.MTTheme;

const DIFICEIS = {
  'amarelo muito claro': ['#f9e79f'],
  'verde neon': ['#39ff14'],
  'vermelho puro': ['#ff0000'],
  'marrom': ['#6b4423'],
  'rosa pastel': ['#f8c8dc'],
  'só preto': ['#000000'],
  'só branco': ['#ffffff'],
  'duas cores quase iguais': ['#1e88e5', '#2196f3'],
  'logo de seis cores': ['#e53935', '#fb8c00', '#fdd835', '#43a047', '#1e88e5', '#8e24aa'],
  'dois pastéis': ['#b5ead7', '#c7ceea'],
};
const EXEMPLOS = {};
require('../pecas-ouro/manifesto.json').marcas.forEach((m) => { EXEMPLOS[m.nome] = m.cores; });
const TODAS = Object.assign({}, DIFICEIS, EXEMPLOS, { 'teal + quase branco': ['#0f766e', '#e0f2f1'] });
const CLIMAS = ['escuro', 'claro', 'marca'];

const lch = (h) => C.paraOklch(h);
const monocromatica = (cores) => cores.every((c) => lch(C.okHex(c)).c < 0.035);
const tokens = (cores, modo) => T.daMarca({ cores }, modo).cores;

// Base boa: escura (até 0,45) ou clara e NEUTRA. Meio-tom e tom lavado reprovam.
function baseBoa(hex) {
  const o = lch(hex);
  if (o.l <= 0.45) return true;
  return o.l >= 0.9 && o.c <= 0.012;
}

test('a base nunca é pastel nem meio-tom: escura ou neutra, nos três climas', () => {
  const ruins = [];
  for (const [nome, cores] of Object.entries(TODAS)) {
    for (const clima of CLIMAS) {
      const k = tokens(cores, clima);
      for (const f of ['fundo', 'fundo2', 'superficie']) {
        if (!baseBoa(k[f])) ruins.push(nome + ' ' + clima + ' ' + f + ' ' + k[f] + ' (L ' + lch(k[f]).l.toFixed(2) + ', C ' + lch(k[f]).c.toFixed(3) + ')');
      }
    }
  }
  assert.deepEqual(ruins, []);
});

/*
 * Vivo: croma de 0,1 para cima — ou o máximo que a tela tem naquela luz e
 * matiz (o verde-azulado escuro da clínica no claro é #00736b, o vermelho
 * do sRGB já zerado). Quase branco é luz acima de 0,9 sem croma.
 */
function vivo(hex) {
  const o = lch(hex);
  const teto = lch(C.deOklch(o.l, 0.4, o.h)).c;
  return (o.c >= 0.1 || o.c >= teto * 0.9) && !(o.l > 0.9 && o.c < 0.08);
}

test('o acento é vivo: tem croma e não é quase branco (a marca monocromática é a exceção)', () => {
  const ruins = [];
  for (const [nome, cores] of Object.entries(TODAS)) {
    if (monocromatica(cores)) continue;
    for (const clima of CLIMAS) {
      const hex = tokens(cores, clima).destaque;
      const d = lch(hex);
      if (!vivo(hex)) ruins.push(nome + ' ' + clima + ': ' + hex + ' (L ' + d.l.toFixed(2) + ', C ' + d.c.toFixed(3) + ')');
    }
  }
  assert.deepEqual(ruins, []);
});

test('texto e acento a 4,5 sobre toda base — o contrato inteiro, nos três climas', () => {
  for (const [nome, cores] of Object.entries(TODAS)) {
    for (const clima of CLIMAS) {
      assert.deepEqual(T.conferir(T.daMarca({ cores }, clima)), [], nome + ' ' + clima);
    }
  }
});

test('a cor clara vira o acento sobre base escura, na matiz dela', () => {
  /*
   * O amarelo-claro, o rosa pastel e o neon eram o FUNDO do cartaz. Agora o
   * fundo é profundo (o amarelo vai para o chocolate, não para o oliva) e
   * a cor da empresa é o acento, mais viva.
   */
  const distancia = (a, b) => { const d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d; };
  for (const cor of ['#f9e79f', '#f8c8dc', '#39ff14', '#b5ead7']) {
    const k = tokens([cor], 'marca');
    assert.ok(lch(k.fundo).l <= 0.35, cor + ': fundo ' + k.fundo);
    assert.ok(distancia(lch(k.destaque).h, lch(cor).h) < 15, cor + ': acento ' + k.destaque + ' mudou de matiz');
    // O pastel ganha croma; o neon, que já é cor, entra como é.
    assert.ok(lch(k.destaque).c >= Math.min(lch(cor).c, 0.2) && lch(k.destaque).c >= 0.12, cor + ': acento sem força (' + k.destaque + ')');
    if (lch(cor).c < 0.12) assert.ok(lch(k.destaque).c > lch(cor).c + 0.03, cor + ': o pastel devia ganhar croma (' + k.destaque + ')');
  }
  assert.equal(tokens(['#39ff14'], 'marca').destaque, '#39ff14');
  // Amarelo não vira oliva no fundo.
  const amarelo = lch(tokens(['#f9e79f'], 'marca').fundo);
  assert.ok(amarelo.h < 75, 'fundo do amarelo na matiz ' + amarelo.h.toFixed(0));
});

test('o claro limpo é um neutro quente ou frio, e não um tom lavado da marca', () => {
  const quente = lch(tokens(['#f8c8dc'], 'claro').fundo);
  const frio = lch(tokens(['#0b6e99'], 'claro').fundo);
  assert.ok(quente.c <= 0.01 && frio.c <= 0.01, 'croma do papel: ' + quente.c.toFixed(3) + ' / ' + frio.c.toFixed(3));
  assert.ok(quente.h > 50 && quente.h < 100, 'a marca rosa ganha papel quente: ' + quente.h.toFixed(0));
  assert.ok(frio.h > 200 && frio.h < 280, 'a marca azul ganha papel frio: ' + frio.h.toFixed(0));
});

test('quase branco não é acento: a clínica de verde-azulado e menta clarinha', () => {
  // O "#e0f2f1" virava o destaque do escuro: um quase-branco sem energia.
  for (const clima of CLIMAS) {
    const d = lch(tokens(['#0f766e', '#e0f2f1'], clima).destaque);
    assert.ok(Math.abs(d.h - lch('#0f766e').h) < 12, clima + ': o acento devia ser o verde-azulado');
  }
  // Logo preto e branco com um detalhe vermelho: o acento é o vermelho.
  const d = lch(T.daMarca({ cores: ['#000000', '#ffffff', '#e53935'] }, 'escuro').cores.destaque);
  assert.ok(d.c > 0.1 && Math.abs(d.h - lch('#e53935').h) < 12, 'o detalhe vermelho do logo sumiu');
});

test('o palco da TV sai da mesma conta: não é barrento nem lavado, e se lê', () => {
  for (const [nome, cores] of Object.entries(TODAS)) {
    for (const clima of CLIMAS) {
      const t = TH.resolve({ preset: 'marca', marca: cores, clima });
      const k = tokens(cores, clima);
      assert.equal(t.bg, k.fundo, nome + ' ' + clima + ': o palco devia ser o fundo da peça');
      assert.equal(t.bg2, k.fundo2, nome + ' ' + clima);
      assert.equal(t.brand, C.okHex(cores[0]), nome + ': --brand é a cor que a empresa cadastrou');
      assert.ok(baseBoa(t.bg) && baseBoa(t.bg2), nome + ' ' + clima + ': palco ' + t.bg + ' / ' + t.bg2);
      assert.ok(TH.contraste(t.text, t.bg) >= 4.5 && TH.contraste(t.text, t.bg2) >= 4.5, nome + ' ' + clima + ': texto');
      assert.ok(TH.contraste(t.accent, t.bg) >= 4.5 && TH.contraste(t.accent, t.bg2) >= 4.5, nome + ' ' + clima + ': acento');
      if (!monocromatica(cores)) assert.ok(lch(t.accent).c >= 0.06, nome + ' ' + clima + ': acento apagado ' + t.accent);
      assert.equal(t.dark, clima !== 'claro', nome + ' ' + clima);
    }
  }
  // Tema salvo antes dos climas: sem clima é escuro, e o "marcaClara" de antes é o claro limpo.
  assert.equal(TH.resolve({ preset: 'marca', marca: ['#0f766e'] }).bg, tokens(['#0f766e'], 'escuro').fundo);
  assert.equal(TH.resolve({ preset: 'marca', marca: ['#0f766e'], marcaClara: true }).bg, tokens(['#0f766e'], 'claro').fundo);
});

test('os climas: três, com nome de gente, e o padrão sai do ramo do negócio', () => {
  assert.deepEqual(P.CLIMAS.map((c) => c.id), ['escuro', 'claro', 'marca']);
  assert.deepEqual(P.CLIMAS.map((c) => c.nome), ['Escuro elegante', 'Claro limpo', 'Cor da marca forte']);
  for (const c of P.CLIMAS) assert.ok(T.MODOS.includes(c.id), c.id + ' é um modo das peças');
  assert.equal(P.climaDoRamo('saude'), 'claro');
  assert.equal(P.climaDoRamo('corporativo'), 'claro');
  assert.equal(P.climaDoRamo('comida'), 'escuro');
  assert.equal(P.climaDoRamo('barbearia'), 'escuro');
  assert.equal(P.climaDoRamo('varejo'), 'marca');
  assert.equal(P.climaDoRamo('academia'), 'marca');
  assert.equal(P.climaDoRamo('nao-existe'), 'escuro');
  for (const r of P.RAMOS.map((x) => x.id).concat('geral')) assert.ok(T.MODOS.includes(P.climaDoRamo(r)), r);
});
