/*
 * Paletas sugeridas (docs/EXECUTOR.md, item 2).
 *
 * O dono: "se deixar ao gosto do cliente fica feio para quem tem mau gosto".
 * O que estes testes seguram:
 *   - toda paleta sugerida — de catálogo ou montada em volta da cor da
 *     empresa — passa no contrato de contraste de js/tokens.js nos três
 *     estilos da peça;
 *   - cor feia digitada vira paleta legível SEM perder a matiz dela;
 *   - conta nova nasce com a paleta do ramo, e cor escolhida pela pessoa
 *     nunca é trocada por sugestão.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const P = require('../js/paletas.js');
const T = require('../js/tokens.js');
const C = require('../js/cor.js');
const paleta = require('../server/paleta.js');

const RAIZ = path.join(__dirname, '..');
const MODOS = ['claro', 'escuro', 'marca'];
const falhasDe = (cores) => MODOS.flatMap((modo) =>
  T.conferir(T.gerar({ marca: cores[0], marca2: cores[1], modo })).map((f) => modo + ': ' + f.frente + '/' + f.fundo));

test('toda paleta de catálogo passa no contrato de contraste nos três estilos', () => {
  for (const [ramo, lista] of Object.entries(P.CURADAS)) {
    assert.equal(lista.length, 3, ramo + ': três caminhos diferentes por ramo');
    for (const p of lista) {
      assert.deepEqual(falhasDe(p.cores), [], ramo + '/' + p.nome);
      assert.equal(p.cores.length, 3);
      assert.ok(p.porque && p.nome);
    }
  }
});

const FEIAS = [['#ff00ff'], ['#ccff00'], ['#ffff00', '#ffffff'], ['#000000'], ['#ffffff'], ['#808080', '#7f7f7f'],
  ['#00ff00', '#ff0000'], ['#f0f0f0', '#0000ff'], ['#123456'], ['#e67e22'], ['#00ffff'], ['#ff0000', '#ff1100']];

test('cor feia digitada vira paleta legível nos três estilos', () => {
  for (const feia of FEIAS) {
    const ps = P.aoRedor(feia);
    assert.ok(ps.length >= 2, feia.join('+'));
    for (const p of ps) assert.deepEqual(falhasDe(p.cores), [], feia.join('+') + ' → ' + p.nome);
  }
});

test('a paleta montada em volta da cor da empresa mantém a matiz dela', () => {
  for (const cor of ['#ff00ff', '#e67e22', '#123456', '#2ecc71', '#d62828']) {
    const p = P.aoRedor([cor]).find((x) => !/destaque/.test(x.nome));
    const antes = C.paraOklch(cor).h, depois = C.paraOklch(p.cores[0]).h;
    const dif = Math.min(Math.abs(antes - depois), 360 - Math.abs(antes - depois));
    assert.ok(dif < 12, cor + ': a matiz andou ' + dif.toFixed(1) + '°');
  }
});

test('magenta puro sai mais fechado (não vibra) e o acento aparece sobre ele', () => {
  const [p] = P.aoRedor(['#ff00ff', '#ff33ff']);
  assert.equal(p.nome, 'As suas cores');
  assert.ok(C.paraOklch(p.cores[0]).c <= 0.151, 'croma acertado');
  assert.ok(C.contraste(p.cores[0], p.cores[1]) >= 3, 'o acento se lê sobre a principal');
});

test('neon vira acento sobre fundo escuro, e amarelo não vira oliva', () => {
  const [limao] = P.aoRedor(['#ccff00']);
  assert.equal(limao.nome, 'Sua cor em destaque');
  assert.ok(C.paraOklch(limao.cores[0]).l < 0.25, 'fundo escuro');
  const amarelo = P.principalDe('#ffd60a');
  const h = C.paraOklch(amarelo).h;
  assert.ok(h < 100, 'puxou para o âmbar (' + h.toFixed(0) + '°), não para o oliva');
  assert.ok(C.paraOklch(P.principalDe('#ffffff')).l <= 0.28, 'marca branca vira grafite, não cinza-médio');
});

test('o ramo sai do nome da empresa, e palavra curta só como palavra inteira', () => {
  const casos = {
    'Ótica Central': 'otica', 'Padaria do Bairro': 'padaria', 'Academia Força Total': 'academia',
    'Pet Feliz': 'pet', 'Studio Bella': 'beleza', 'Sorriso Odonto': 'saude', 'Lanchonete da Praça': 'comida',
    'Bar do Zé': 'comida', 'Metalúrgica Sul': 'corporativo', 'Raft Embalagens': 'corporativo',
    'Barbosa Advogados': 'corporativo', 'Competência Contábil': 'corporativo', 'Barbearia do Léo': 'barbearia',
    'Empresa X': 'geral',
  };
  for (const [nome, ramo] of Object.entries(casos)) assert.equal(P.detectarRamo(nome), ramo, nome);
});

test('sugerir: as cores da empresa vêm primeiro, depois o ramo; sem repetir; até quatro', () => {
  const s = P.sugerir({ ramo: 'padaria', cores: ['#7a3e1d', '#e8b04b'] });
  assert.equal(s.paletas.length, 4);
  assert.equal(s.paletas[0].origem, 'empresa');
  assert.equal(s.paletas[0].nome, 'As suas cores');
  assert.equal(s.paletas[2].origem, 'ramo');
  const chaves = s.paletas.map((p) => p.cores.slice(0, 2).join());
  assert.equal(new Set(chaves).size, chaves.length);
  // Sem cor da empresa: o catálogo do ramo, a primeira é a de nascença.
  const o = P.sugerir({ textos: 'Ótica Central' });
  assert.equal(o.ramo, 'otica');
  assert.deepEqual(o.paletas[0].cores, P.inicial('Ótica Central'));
});

test('três ramos, três paletas diferentes (ótica, padaria, academia)', () => {
  const prim = ['Ótica Central', 'Padaria do Bairro', 'Academia Força Total'].map((n) => P.inicial(n)[0]);
  assert.equal(new Set(prim).size, 3);
  for (let i = 0; i < 3; i++) for (let j = i + 1; j < 3; j++) {
    const a = C.paraOklch(prim[i]), b = C.paraOklch(prim[j]);
    const dist = Math.hypot(a.l - b.l, (a.c - b.c) * 4, Math.min(Math.abs(a.h - b.h), 360 - Math.abs(a.h - b.h)) / 180);
    assert.ok(dist > 0.1, prim[i] + ' × ' + prim[j] + ' parecidas demais');
  }
});

test('avisos do modo avançado: dizem o problema em português, e somem com paleta boa', () => {
  const ruins = P.avisos(['#ff00ff', '#ff33ff']);
  assert.ok(ruins.some((t) => /acento quase some/.test(t)));
  assert.ok(ruins.some((t) => /saturada/.test(t)));
  assert.deepEqual(P.avisos(P.CURADAS.otica[0].cores), []);
});

function bancoFalso(kit, nome) {
  const salvo = [];
  return {
    salvo,
    getBrandKit: async () => kit,
    saveBrandKit: async (_t, k) => { salvo.push(k); kit = Object.assign({}, kit, k); },
    getTenant: async () => ({ name: nome }),
    getMemoria: async () => null,
  };
}

test('conta nova nasce com a paleta do ramo; cor escolhida nunca é trocada', async () => {
  const db = bancoFalso({ nome: 'Marca principal', cores: [] }, 'Academia Força Total');
  const k = await paleta.garantir(db, 't1');
  assert.deepEqual(k.cores, P.CURADAS.academia[0].cores);
  assert.equal(db.salvo.length, 1);
  assert.equal(db.salvo[0].nome, 'Marca principal', 'o nome da marca não se perde');

  const db2 = bancoFalso({ nome: 'X', cores: ['#123456'] }, 'Ótica Central');
  await paleta.garantir(db2, 't2');
  assert.equal(db2.salvo.length, 0, 'quem já tem cor não ganha sugestão por cima');
  assert.equal(await paleta.ramoDaConta(db2, 't2', { nome: 'X' }), 'otica');
});

test('o cadastro e a Marca ligam a paleta de nascença', () => {
  const auth = fs.readFileSync(path.join(RAIZ, 'server/routes/auth.js'), 'utf8');
  // Os três caminhos que criam conta: cadastro direto, link do e-mail e Google.
  assert.equal((auth.match(/await paleta\.garantir\(db, tenantId\);/g) || []).length, 3);
  const server = fs.readFileSync(path.join(RAIZ, 'server.js'), 'utf8');
  assert.match(server, /await paletaInicial\.garantir\(db, sess\.tenant_id\);\s+const \[kit, assets, mem, marcas\]/);
  assert.match(server, /ramo: await paletaInicial\.ramoDaConta\(/);
});

test('o painel usa o MESMO js/paletas.js, e a página Marca mostra as sugestões', () => {
  const lib = fs.readFileSync(path.join(RAIZ, 'web/src/lib/paletas.js'), 'utf8');
  assert.match(lib, /import '\.\.\/\.\.\/\.\.\/js\/paletas\.js';/);
  assert.match(lib, /globalThis\.MTPaletas/);
  const pag = fs.readFileSync(path.join(RAIZ, 'web/src/pages/BrandPage.jsx'), 'utf8');
  assert.match(pag, /<PaletasSugeridas /);
  const comp = fs.readFileSync(path.join(RAIZ, 'web/src/components/content/PaletasSugeridas.jsx'), 'utf8');
  assert.match(comp, /Escolher as cores à mão/, 'cor livre continua, em avançado');
  assert.match(comp, /Ajustar para uma paleta legível/);
});
