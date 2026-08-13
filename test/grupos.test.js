/*
 * Agrupar.
 *
 * A escolha de fundo — grupo como ETIQUETA numa lista plana, e não como
 * elemento que contém outros — é o que estes testes protegem. Se um dia
 * alguém aninhar, o player, a miniatura, a prévia, a exportação e o validador
 * do servidor passam todos a precisar aprender a descer um nível, e uma peça
 * já publicada passa a depender de código novo para desenhar igual.
 */
const test = require('node:test');
const assert = require('node:assert');

const carregar = () => import('../web/src/lib/grupos.js');

// a, b, c, d empilhados do fundo para a frente.
const peca = () => ([
  { id: 'a', x: 0, y: 0, w: 10, h: 10 },
  { id: 'b', x: 20, y: 0, w: 10, h: 10 },
  { id: 'c', x: 40, y: 0, w: 10, h: 10 },
  { id: 'd', x: 60, y: 0, w: 10, h: 10 },
]);
const ids = (els) => els.map((e) => e.id).join('');

test('agrupar põe a mesma etiqueta e não mexe em posição', async () => {
  const G = await carregar();
  const els = G.agrupar(peca(), ['a', 'c']);
  const a = els.find((e) => e.id === 'a');
  const c = els.find((e) => e.id === 'c');
  assert.ok(a.grupo && a.grupo === c.grupo, 'os dois deviam ter a mesma etiqueta');
  assert.equal(a.x, 0);
  assert.equal(c.x, 40);
  assert.ok(!els.find((e) => e.id === 'b').grupo, 'quem estava fora não entrou');
});

test('agrupar não aninha: os elementos continuam na lista plana', async () => {
  // Se este teste cair, alguém trocou etiqueta por aninhamento — e aí o
  // player precisa mudar junto, ou a peça publicada some da tela.
  const G = await carregar();
  const els = G.agrupar(peca(), ['a', 'b']);
  assert.equal(els.length, 4);
  assert.ok(els.every((e) => !e.filhos && !e.tipo), 'apareceu um elemento-contêiner');
});

test('agrupar junta as camadas, no lugar do membro mais à frente', async () => {
  /*
   * Sem isto, um grupo com um elemento no fundo e outro na frente teria
   * alguém de fora no meio dele, e "mandar o grupo para trás" viraria uma
   * pergunta sem resposta certa.
   */
  const G = await carregar();
  const els = G.agrupar(peca(), ['a', 'c']);
  assert.equal(ids(els), 'bacd', 'a e c deviam ter ficado vizinhos, na posição de c');
});

test('agrupar mantém a ordem relativa de quem entrou', async () => {
  const G = await carregar();
  const els = G.agrupar(peca(), ['c', 'a', 'd']);
  assert.equal(ids(els), 'bacd');
});

/* ---------------- Seleção ---------------- */

test('tocar num membro é tocar no grupo inteiro', async () => {
  const G = await carregar();
  const els = G.agrupar(peca(), ['a', 'c']);
  assert.deepEqual(G.expandirSelecao(els, ['a']).sort(), ['a', 'c']);
});

test('elemento solto continua sendo só ele', async () => {
  const G = await carregar();
  const els = G.agrupar(peca(), ['a', 'c']);
  assert.deepEqual(G.expandirSelecao(els, ['b']), ['b']);
});

test('seleção mista puxa o grupo junto', async () => {
  const G = await carregar();
  const els = G.agrupar(peca(), ['a', 'c']);
  assert.deepEqual(G.expandirSelecao(els, ['b', 'c']).sort(), ['a', 'b', 'c']);
});

/* ---------------- Quando faz sentido ---------------- */

test('não dá para agrupar um só, nem reagrupar o mesmo grupo', async () => {
  const G = await carregar();
  const base = peca();
  assert.ok(!G.podeAgrupar(base, ['a']), 'um elemento só não é grupo');
  assert.ok(G.podeAgrupar(base, ['a', 'b']));
  const els = G.agrupar(base, ['a', 'c']);
  assert.ok(!G.podeAgrupar(els, ['a']), 'o grupo inteiro já é o grupo — reagrupar não faz nada');
  assert.ok(G.podeAgrupar(els, ['a', 'b']), 'somar alguém de fora é um grupo novo');
});

test('desagrupar tira a etiqueta e deixa o resto como está', async () => {
  const G = await carregar();
  const els = G.agrupar(peca(), ['a', 'c']);
  assert.ok(G.podeDesagrupar(els, ['a']));
  const soltos = G.desagrupar(els, ['a']);
  assert.ok(soltos.every((e) => !('grupo' in e)), 'sobrou etiqueta');
  assert.equal(ids(soltos), ids(els), 'desagrupar não devia mexer na ordem');
  assert.equal(soltos.find((e) => e.id === 'c').x, 40);
});

test('desagrupar quem não está em grupo não quebra nada', async () => {
  const G = await carregar();
  const base = peca();
  assert.ok(!G.podeDesagrupar(base, ['a']));
  assert.equal(G.desagrupar(base, ['a']), base);
});

/* ---------------- Alinhar sem desmontar o desenho ---------------- */

test('um grupo conta como UMA unidade para alinhar', async () => {
  /*
   * É o defeito que este conceito existe para evitar: alinhar à esquerda uma
   * seleção com um logotipo agrupado empilharia as partes do logotipo umas
   * sobre as outras — cada pedaço iria para a esquerda por conta própria, e o
   * desenho que a pessoa montou seria desmontado por um botão de alinhar.
   */
  const G = await carregar();
  const els = G.agrupar(peca(), ['a', 'c']);
  const u = G.unidades(els, ['a', 'b']);
  assert.equal(u.length, 2, 'o grupo e o solto: duas unidades');
  const grupo = u.find((x) => x.grupo);
  assert.equal(grupo.els.length, 2);
  assert.deepEqual(u.find((x) => !x.grupo).els.map((e) => e.id), ['b']);
});

test('a caixa do grupo envolve todos os membros', async () => {
  const G = await carregar();
  const c = G.caixaDe([{ x: 10, y: 5, w: 10, h: 10 }, { x: 40, y: 20, w: 10, h: 10 }]);
  assert.deepEqual([c.esq, c.topo, c.dir, c.base], [10, 5, 50, 30]);
  assert.deepEqual([c.w, c.h], [40, 25]);
  assert.deepEqual([c.cx, c.cy], [30, 17.5]);
});

/* ---------------- Camadas ---------------- */

test('o painel de camadas mostra o grupo como uma linha só', async () => {
  const G = await carregar();
  const els = G.agrupar(peca(), ['a', 'c']);
  const linhas = G.linhasDeCamada(els);
  assert.equal(linhas.length, 3, 'b, o grupo e d');
  const g = linhas.find((l) => l.tipo === 'grupo');
  assert.equal(g.els.length, 2);
  assert.equal(g.rotulo, 'Grupo (2)');
});

test('sem grupo nenhum, a lista de camadas é a de sempre', async () => {
  const G = await carregar();
  const linhas = G.linhasDeCamada(peca());
  assert.equal(linhas.length, 4);
  assert.ok(linhas.every((l) => l.tipo === 'el'));
});

test('dois grupos diferentes não se misturam', async () => {
  const G = await carregar();
  let els = G.agrupar(peca(), ['a', 'b']);
  els = G.agrupar(els, ['c', 'd']);
  const g1 = G.grupoDe(els, 'a');
  const g2 = G.grupoDe(els, 'c');
  assert.notEqual(g1, g2);
  assert.deepEqual(G.expandirSelecao(els, ['a']).sort(), ['a', 'b']);
  assert.equal(G.linhasDeCamada(els).length, 2);
});

/* ---------------- Reordenar ---------------- */

test('arrastar um grupo move o bloco inteiro', async () => {
  const G = await carregar();
  const els = G.agrupar(peca(), ['a', 'c']);      // b, [a c], d
  // linhas: 0=b, 1=grupo, 2=d — mandar o grupo para o fim
  const fora = G.reordenarLinhas(els, 1, 2);
  assert.equal(ids(fora), 'bdac', 'o grupo devia ter ido inteiro para a frente');
});

test('arrastar um solto passa por cima do grupo sem entrar nele', async () => {
  const G = await carregar();
  const els = G.agrupar(peca(), ['a', 'c']);      // b, [a c], d
  const fora = G.reordenarLinhas(els, 0, 2);      // b para o fim
  assert.equal(ids(fora), 'acdb');
  assert.equal(G.membros(fora, G.grupoDe(fora, 'a')).length, 2, 'o grupo continua com dois');
});

test('linhaDe encontra o grupo pelo membro', async () => {
  const G = await carregar();
  const els = G.agrupar(peca(), ['a', 'c']);
  assert.equal(G.linhaDe(els, 'a'), 1);
  assert.equal(G.linhaDe(els, 'c'), 1, 'os dois membros vivem na mesma linha');
  assert.equal(G.linhaDe(els, 'b'), 0);
});
