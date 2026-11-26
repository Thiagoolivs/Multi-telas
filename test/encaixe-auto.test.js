/*
 * O encaixe automático (web/src/lib/encaixeAuto.js): toda peça que o Criar
 * e a Criação rápida entregam é conferida; a que não cabe volta UMA vez à
 * IA; se nem assim, entra a peça-ouro aprovada; se nem assim, fica marcada
 * para a pessoa. A ordem, o "uma vez" e o "nunca calado" moram aqui; o
 * conferidor de verdade (js/peca-conferir.js) roda no navegador.
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const RAIZ = path.join(__dirname, '..');
const lib = () => import(pathToFileURL(path.join(RAIZ, 'web/src/lib/encaixeAuto.js')).href);
const peca = (id, extra) => Object.assign({ type: 'peca-html', html: '<section class="mt-peca">' + id + '</section>', css: '', campos: {}, papel: 'destaque' }, extra || {});

test('"não cabe" é o que sai da peça, o que cobre outro texto e o que é cortado; a régua de composição não pede redesenho', async () => {
  const { naoCabe } = await lib();
  const nome = { '9/16': 'TV em pé' };
  const avisos = naoCabe({
    '16/9': { fora: [], juntos: [], cortados: [], regras: [{ campo: 'numero', texto: 'encostado na borda' }] },
    '9/16': { fora: ['titulo'], juntos: ['titulo × preco'], cortados: ['marca (trunca)'], regras: [] },
  }, (f) => nome[f] || f, (n) => ({ titulo: 'Título', preco: 'Preço', marca: 'Nome da empresa' }[n] || n));
  assert.deepEqual(avisos, ['TV em pé: "Título" passa da borda', 'TV em pé: Título e Preço ficam um sobre o outro', 'TV em pé: "Nome da empresa" fica cortado']);
  assert.deepEqual(naoCabe({ Lateral: { fora: [], juntos: [], regras: [{ campo: 'x', texto: 'y' }] } }), []);
});

test('cabe de primeira: nada vai para a IA', async () => {
  const { garantirEncaixe } = await lib();
  let refez = 0;
  const r = await garantirEncaixe(peca('a'), { conferir: async () => [], refazer: async () => { refez++; return peca('b'); } });
  assert.deepEqual([r.estado, r.item.html.includes('a'), refez], ['cabe', true, 0]);
});

test('não coube: UMA volta à IA com a medida, e a redesenhada é conferida de novo', async () => {
  const { garantirEncaixe } = await lib();
  const pedidos = [];
  const fases = [];
  const conferir = async (it) => (it.html.includes('nova') ? [] : ['TV em pé: "Título" passa da borda']);
  const r = await garantirEncaixe(peca('velha'), {
    conferir, refazer: async (it, avisos) => { pedidos.push(avisos); return peca('nova'); },
    reserva: async () => { throw new Error('não devia chegar aqui'); }, onFase: (f) => fases.push(f),
  });
  assert.equal(r.estado, 'redesenhada');
  assert.ok(r.item.html.includes('nova'));
  assert.deepEqual(pedidos, [['TV em pé: "Título" passa da borda']]);
  assert.deepEqual(r.antes, ['TV em pé: "Título" passa da borda']);
  assert.deepEqual(fases, ['conferindo', 'refazendo']);
});

test('a redesenhada também não cabe (ou a IA falhou): entra a peça-ouro, se ela couber', async () => {
  const { garantirEncaixe } = await lib();
  const conferir = async (it) => (it.html.includes('ouro') ? [] : ['não cabe']);
  const comReserva = { conferir, reserva: async () => peca('ouro') };
  const a = await garantirEncaixe(peca('x'), Object.assign({ refazer: async () => peca('y') }, comReserva));
  assert.deepEqual([a.estado, a.item.html.includes('ouro')], ['reserva', true]);
  // A IA fora do ar (o redesenho lança): segue para a reserva do mesmo jeito.
  const b = await garantirEncaixe(peca('x'), Object.assign({ refazer: async () => { throw new Error('a IA não conseguiu'); } }, comReserva));
  assert.equal(b.estado, 'reserva');
});

test('nada coube: a peça fica MARCADA, com o que falta — e vai a tentativa que erra menos', async () => {
  const { garantirEncaixe } = await lib();
  const conferir = async (it) => (it.html.includes('y') ? ['um problema'] : ['um', 'dois', 'três']);
  const r = await garantirEncaixe(peca('x'), { conferir, refazer: async () => peca('y'), reserva: async () => null });
  assert.equal(r.estado, 'nao-cabe');
  assert.ok(r.item.html.includes('y'), 'a redesenhada erra menos e devia ficar');
  assert.deepEqual(r.avisos, ['um problema']);
  // A reserva que também não cabe não entra.
  const r2 = await garantirEncaixe(peca('x'), { conferir: async () => ['não cabe'], reserva: async () => peca('ouro') });
  assert.deepEqual([r2.estado, r2.item.html.includes('x')], ['nao-cabe', true]);
});

test('a IA já tentou esta peça: não gasta outra chamada; e sem conferidor a peça segue, marcada como não conferida', async () => {
  const { garantirEncaixe } = await lib();
  let refez = 0;
  const r = await garantirEncaixe(peca('x'), { conferir: async () => ['não cabe'], refazer: async () => { refez++; return peca('y'); }, podeRefazer: () => false, reserva: async () => null });
  assert.deepEqual([r.estado, refez], ['nao-cabe', 0]);
  const s = await garantirEncaixe(peca('x'), { conferir: async () => { throw new Error('não carregou /js/peca-conferir.js'); } });
  assert.deepEqual([s.estado, s.item.html.includes('x')], ['sem-conferir', true]);
});

test('várias peças: a repetida (o mesmo desenho em dois formatos) passa uma vez só, e o conferir é um de cada vez', async () => {
  const { garantirTodas } = await lib();
  let agora = 0, maximo = 0, conferidas = 0, refeitas = 0;
  const conferir = async (it) => {
    agora++; maximo = Math.max(maximo, agora); conferidas++;
    await new Promise((r) => setTimeout(r, 5));
    agora--;
    return it.html.includes('ruim') ? ['não cabe'] : [];
  };
  const refazer = async () => { refeitas++; await new Promise((r) => setTimeout(r, 20)); return peca('boa-nova'); };
  const passos = [];
  const lista = [
    { chave: 'v1', item: peca('boa') }, { chave: 'v2', item: peca('ruim') }, { chave: 'v3', item: peca('ruim') }, { chave: 'v4', item: peca('outra') },
  ];
  const r = await garantirTodas(lista, { conferir, refazer }, { juntas: 3, onPeca: (k, x) => passos.push(k + ':' + (x.estado || x.fase)) });
  assert.deepEqual(Object.keys(r).sort(), ['v1', 'v2', 'v3', 'v4']);
  assert.deepEqual([r.v1.estado, r.v2.estado, r.v3.estado, r.v4.estado], ['cabe', 'redesenhada', 'redesenhada', 'cabe']);
  assert.equal(refeitas, 1, 'a mesma peça foi para a IA duas vezes');
  assert.equal(conferidas, 4, 'boa, ruim, a redesenhada e outra');
  assert.equal(maximo, 1, 'duas conferências ao mesmo tempo');
  assert.ok(passos.includes('v2:refazendo') && passos.includes('v2:redesenhada') && passos.includes('v3:redesenhada'));
});

test('a tentativa lembrada é só um número tirado do desenho, nunca o texto da peça', async () => {
  const { lembrarTentativa } = await lib();
  const guardado = {};
  const armazem = { getItem: (k) => guardado[k] || null, setItem: (k, v) => { guardado[k] = v; } };
  const t = lembrarTentativa(armazem);
  const p = peca('Café da manhã Quixabeira');
  assert.equal(t.pode(p), true);
  t.marcar(p);
  assert.equal(t.pode(p), false);
  assert.equal(t.pode(peca('outra')), true);
  assert.doesNotMatch(JSON.stringify(guardado), /Quixabeira|Café/);
  // Sem armazenamento (aba anônima, bloqueado): não quebra, só não lembra.
  const semNada = lembrarTentativa({ getItem: () => { throw new Error('bloqueado'); }, setItem: () => { throw new Error('bloqueado'); } });
  assert.equal(semNada.pode(p), true);
  semNada.marcar(p);
});

test('o Criar e a Criação rápida usam o encaixe automático; a Criação rápida não publica peça que não coube sem perguntar', () => {
  const ler = (f) => fs.readFileSync(path.join(RAIZ, f), 'utf8');
  const rc = ler('web/src/components/criar/ResultadoCampanha.jsx');
  assert.match(rc, /useEncaixeAutomatico\(/);
  const cr = ler('web/src/pages/CriacaoRapidaPage.jsx');
  assert.match(cr, /garantirTodas\(/);
  // O encaixe vem antes de guardar e de publicar; a que não coube só vai com o "pôr mesmo assim".
  const i = cr.indexOf('garantirTodas(');
  assert.ok(i > 0 && i < cr.indexOf('await library.save(') && i < cr.indexOf('await publicarPecas('));
  assert.match(cr, /naoCouberam\.length && !mesmoAssim/);
});
