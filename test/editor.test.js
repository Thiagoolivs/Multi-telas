/*
 * O núcleo do editor: histórico, encaixe, alinhamento e distribuição.
 *
 * São contas puras de propósito. Um editor é onde a pessoa passa mais tempo do
 * que em qualquer outra tela do produto, e "meio pixel torto" numa peça de
 * 1920px vira um centímetro torto numa TV de 55 polegadas — não é o tipo de
 * coisa que se confere no olho, uma vez, e considera resolvido.
 *
 * Os módulos são ESM (vivem no painel React); daqui entram por import().
 */
const test = require('node:test');
const assert = require('node:assert');

const carregar = (nome) => import('../web/src/lib/' + nome);

/* ---------------- Histórico ---------------- */

test('desfazer volta ao estado anterior, refazer traz de volta', async () => {
  const H = await carregar('historico.js');
  let h = H.criarHistorico({ n: 1 });
  h = H.empilhar(h, { n: 2 });
  h = H.empilhar(h, { n: 3 });

  assert.equal(H.agora(h).n, 3);
  h = H.desfazer(h);
  assert.equal(H.agora(h).n, 2);
  h = H.desfazer(h);
  assert.equal(H.agora(h).n, 1);
  assert.equal(H.podeDesfazer(h), false, 'desfez além do começo');
  h = H.refazer(h);
  assert.equal(H.agora(h).n, 2);
});

test('um arrasto inteiro desfaz de uma vez', async () => {
  /*
   * O caso que decide se o desfazer é usável. Arrastar dispara dezenas de
   * atualizações por segundo; sem fusão, um Ctrl+Z andaria meio pixel e a
   * pessoa teria que apertar quarenta vezes para voltar ao ponto de partida.
   */
  const H = await carregar('historico.js');
  let h = H.criarHistorico({ x: 0 });
  for (let x = 1; x <= 40; x++) h = H.empilhar(h, { x }, 'mover:e1');

  assert.equal(H.agora(h).x, 40);
  h = H.desfazer(h);
  assert.equal(H.agora(h).x, 0, 'o arrasto virou 40 passos em vez de 1');
});

test('arrastar dois elementos diferentes são dois passos', async () => {
  const H = await carregar('historico.js');
  let h = H.criarHistorico({ a: 0, b: 0 });
  h = H.empilhar(h, { a: 5, b: 0 }, 'mover:e1');
  h = H.empilhar(h, { a: 5, b: 7 }, 'mover:e2');

  h = H.desfazer(h);
  assert.deepEqual(H.agora(h), { a: 5, b: 0 }, 'a etiqueta diferente não separou os passos');
});

test('soltar o mouse fecha o passo', async () => {
  const H = await carregar('historico.js');
  let h = H.criarHistorico({ x: 0 });
  h = H.empilhar(h, { x: 10 }, 'mover:e1');
  h = H.selar(h);                              // soltou o mouse
  h = H.empilhar(h, { x: 20 }, 'mover:e1');    // arrastou de novo

  h = H.desfazer(h);
  assert.equal(H.agora(h).x, 10, 'os dois arrastos viraram um passo só');
});

test('editar depois de desfazer descarta o futuro', async () => {
  const H = await carregar('historico.js');
  let h = H.criarHistorico({ n: 1 });
  h = H.empilhar(h, { n: 2 });
  h = H.empilhar(h, { n: 3 });
  h = H.desfazer(h);
  h = H.empilhar(h, { n: 99 });

  assert.equal(H.podeRefazer(h), false, 'o 3 ressuscitaria com um refazer');
  assert.equal(H.agora(h).n, 99);
});

test('a pilha não cresce para sempre', async () => {
  const H = await carregar('historico.js');
  let h = H.criarHistorico({ n: 0 });
  for (let n = 1; n <= 500; n++) h = H.empilhar(h, { n });

  assert.ok(h.passos.length <= 80, 'guardou ' + h.passos.length + ' passos');
  assert.equal(H.agora(h).n, 500, 'perdeu o estado atual ao podar');
});

test('empilhar o mesmo estado não cria passo', async () => {
  const H = await carregar('historico.js');
  const est = { n: 1 };
  let h = H.criarHistorico(est);
  h = H.empilhar(h, est);
  assert.equal(h.passos.length, 1);
});

/* ---------------- Encaixe ---------------- */

test('encaixa no centro do palco', async () => {
  const A = await carregar('alinhar.js');
  // 40 de largura, centro em 50 pede x = 30. Chegando em 30,4 tem que grudar.
  const r = A.encaixar({ x: 30.4, y: 10, w: 40, h: 20 }, []);
  assert.ok(Math.abs(r.x - 30) < 0.001, 'x ficou em ' + r.x);
  assert.equal(r.guias.x, 50, 'não desenhou a guia do centro');
});

test('longe da âncora não gruda', async () => {
  const A = await carregar('alinhar.js');
  const r = A.encaixar({ x: 22, y: 10, w: 40, h: 20 }, []);
  assert.equal(r.x, 22, 'grudou de longe: o elemento pula sozinho');
  assert.equal(r.guias.x, null);
});

test('encaixa na borda de outro elemento', async () => {
  const A = await carregar('alinhar.js');
  const outro = { x: 60, y: 0, w: 20, h: 20 };
  // esquerda em 59,5 tem que grudar na esquerda do outro, em 60.
  const r = A.encaixar({ x: 59.5, y: 40, w: 10, h: 10 }, [outro]);
  assert.ok(Math.abs(r.x - 60) < 0.001, 'x ficou em ' + r.x);
});

test('o elemento arrastado não gruda nele mesmo', async () => {
  /*
   * Se as âncoras incluíssem o próprio elemento, ele grudaria na posição em
   * que já está e não sairia mais do lugar — o bug clássico de quem implementa
   * encaixe sem excluir o alvo.
   */
  const A = await carregar('alinhar.js');
  // Longe de 0, 50 e 100 nas três linhas (início, meio e fim) dos dois eixos.
  const eu = { x: 33.3, y: 33.3, w: 10, h: 10 };
  const r = A.encaixar(eu, []);   // a lista NÃO contém `eu`
  assert.equal(r.x, 33.3);
  assert.equal(r.y, 33.3);
  assert.deepEqual(r.guias, { x: null, y: null });
  // E, para o teste não ser vazio, o mesmo elemento perto do centro GRUDA.
  const perto = A.encaixar({ x: 44.6, y: 33.3, w: 10, h: 10 }, []);
  assert.ok(Math.abs(perto.x - 45) < 0.001, 'não grudou quando devia: ' + perto.x);
});

/* ---------------- Encaixe ao REDIMENSIONAR ---------------- */

test('redimensionar move só a borda que a alça pegou', async () => {
  /*
   * A diferença entre arrastar e redimensionar, e a razão de existir uma
   * função separada: ao arrastar, a caixa inteira se desloca; ao esticar, as
   * bordas do lado oposto estão ancoradas. Se elas se mexessem, o elemento
   * escorregaria enquanto cresce — que é exatamente a sensação de não saber
   * para que lado ele está indo.
   */
  const A = await carregar('alinhar.js');
  const vizinho = { x: 60, y: 0, w: 20, h: 20 };
  // Puxando a alça da direita, com a borda direita chegando perto de 60.
  const r = A.encaixarRedimensionamento({ x: 10, y: 40, w: 49.6, h: 10 }, [vizinho], [1, 0]);
  assert.equal(r.x, 10, 'a borda esquerda saiu do lugar');
  assert.ok(Math.abs(r.w - 50) < 0.001, 'largura ficou em ' + r.w);
  assert.equal(r.guias.x, 60);
});

test('puxando pela esquerda, a borda da direita fica onde está', async () => {
  const A = await carregar('alinhar.js');
  // Borda esquerda em 20,4 → gruda em 20 (nada) ... usa o centro do palco: 50.
  const r = A.encaixarRedimensionamento({ x: 49.6, y: 40, w: 30, h: 10 }, [], [-1, 0]);
  assert.ok(Math.abs(r.x - 50) < 0.001, 'x: ' + r.x);
  assert.ok(Math.abs((r.x + r.w) - 79.6) < 0.001, 'a borda direita andou: ' + (r.x + r.w));
});

test('a alça do meio de um lado não encaixa o outro eixo', async () => {
  // Alça leste: só o eixo X tem borda móvel. Encaixar Y ali mexeria numa borda
  // que a pessoa não pegou.
  const A = await carregar('alinhar.js');
  const r = A.encaixarRedimensionamento({ x: 10, y: 89.6, w: 30, h: 10 }, [], [1, 0]);
  assert.equal(r.y, 89.6, 'mexeu no topo sem ninguém pedir');
  assert.equal(r.h, 10, 'mexeu na altura sem ninguém pedir');
  assert.equal(r.guias.y, null);
});

test('longe de tudo, redimensionar não gruda em nada', async () => {
  const A = await carregar('alinhar.js');
  const caixa = { x: 12, y: 33, w: 21, h: 9 };
  const r = A.encaixarRedimensionamento(caixa, [], [1, 1]);
  assert.deepEqual({ x: r.x, y: r.y, w: r.w, h: r.h }, caixa);
  assert.deepEqual(r.guias, { x: null, y: null });
});

test('a alça de canto encaixa os dois eixos', async () => {
  const A = await carregar('alinhar.js');
  // canto sudeste: direita perto de 100, base perto de 50.
  const r = A.encaixarRedimensionamento({ x: 10, y: 20, w: 89.6, h: 30.3 }, [], [1, 1]);
  assert.ok(Math.abs((r.x + r.w) - 100) < 0.001, 'direita: ' + (r.x + r.w));
  assert.ok(Math.abs((r.y + r.h) - 50) < 0.001, 'base: ' + (r.y + r.h));
  assert.deepEqual(r.guias, { x: 100, y: 50 });
});

test('encaixa nos dois eixos ao mesmo tempo', async () => {
  const A = await carregar('alinhar.js');
  // x: borda esquerda perto de 0. y: borda de baixo perto de 100.
  const r = A.encaixar({ x: 0.5, y: 89.6, w: 10, h: 10 }, []);
  assert.ok(Math.abs(r.x - 0) < 0.001, 'x: ' + r.x);
  assert.ok(Math.abs(r.y - 90) < 0.001, 'y: ' + r.y);
  assert.deepEqual(r.guias, { x: 0, y: 100 });
});

/* ---------------- Alinhar ---------------- */

test('um elemento só alinha pela peça', async () => {
  const A = await carregar('alinhar.js');
  const [e] = A.alinhar([{ x: 10, y: 10, w: 30, h: 20 }], 'centroH');
  assert.equal(e.x, 35, 'centro de um bloco de 30 é x=35');
  const [f] = A.alinhar([{ x: 10, y: 10, w: 30, h: 20 }], 'dir');
  assert.equal(f.x, 70);
});

test('vários elementos alinham entre si, não na parede', async () => {
  /*
   * A parte que quase todo mundo erra. Quem escolheu três elementos e pediu
   * "alinhar à esquerda" quer os três encostados no mais à esquerda DELES — se
   * fossem para a borda da peça, a seleção múltipla seria inútil.
   */
  const A = await carregar('alinhar.js');
  const r = A.alinhar([
    { x: 20, y: 0, w: 10, h: 10 },
    { x: 50, y: 0, w: 10, h: 10 },
    { x: 80, y: 0, w: 10, h: 10 },
  ], 'esq');
  assert.deepEqual(r.map((e) => e.x), [20, 20, 20]);
});

test('alinhar ao centro vertical usa a caixa da seleção', async () => {
  const A = await carregar('alinhar.js');
  const r = A.alinhar([
    { x: 0, y: 10, w: 10, h: 10 },   // envolvente: topo 10, base 50, centro 30
    { x: 0, y: 40, w: 10, h: 10 },
  ], 'centroV');
  assert.deepEqual(r.map((e) => e.y), [25, 25]);
});

/* ---------------- Distribuir ---------------- */

test('distribuir deixa o vão igual entre os elementos', async () => {
  const A = await carregar('alinhar.js');
  const r = A.distribuir([
    { x: 0, y: 0, w: 10, h: 10 },
    { x: 15, y: 0, w: 20, h: 10 },
    { x: 70, y: 0, w: 10, h: 10 },
  ], 'h');
  const ord = [...r].sort((a, b) => a.x - b.x);
  const vao1 = ord[1].x - (ord[0].x + ord[0].w);
  const vao2 = ord[2].x - (ord[1].x + ord[1].w);
  assert.ok(Math.abs(vao1 - vao2) < 0.001, 'vãos: ' + vao1 + ' e ' + vao2);
  assert.equal(ord[0].x, 0, 'o primeiro saiu do lugar');
  assert.equal(ord[2].x, 70, 'o último saiu do lugar');
});

test('distribuir com dois elementos não faz nada', async () => {
  const A = await carregar('alinhar.js');
  const antes = [{ x: 0, y: 0, w: 10, h: 10 }, { x: 80, y: 0, w: 10, h: 10 }];
  assert.deepEqual(A.distribuir(antes, 'h'), antes);
});

test('distribuir não embaralha a ordem das camadas', async () => {
  // O array que sai tem que estar na mesma ordem do que entrou — senão a
  // pilha de camadas se reorganiza sozinha ao distribuir.
  const A = await carregar('alinhar.js');
  const els = [
    { id: 'c', x: 70, y: 0, w: 10, h: 10 },
    { id: 'a', x: 0, y: 0, w: 10, h: 10 },
    { id: 'b', x: 15, y: 0, w: 20, h: 10 },
  ];
  assert.deepEqual(A.distribuir(els, 'h').map((e) => e.id), ['c', 'a', 'b']);
});

test('a caixa envolvente cobre todo mundo', async () => {
  const A = await carregar('alinhar.js');
  const env = A.envolvente([
    { x: 10, y: 20, w: 10, h: 10 },
    { x: 50, y: 5, w: 30, h: 40 },
  ]);
  assert.deepEqual(
    { esq: env.esq, topo: env.topo, dir: env.dir, base: env.base },
    { esq: 10, topo: 5, dir: 80, base: 45 },
  );
});
