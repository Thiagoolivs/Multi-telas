/*
 * O chat que OFERECE em vez de entrevistar.
 *
 * O briefing anterior perguntava uma coisa aberta por vez — "para quem é?",
 * "por que agora?" — e isso exige que a pessoa JÁ TENHA a resposta formulada.
 * Quem tem padaria não pensa em campanha nesses termos: trava, escreve "sei
 * lá, promoção", e a IA decide tudo.
 *
 * Reconhecer é muito mais fácil que lembrar.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const guia = require('../server/ai-guia.js');

const RAIZ = path.join(__dirname, '..');
const ler = (...p) => fs.readFileSync(path.join(RAIZ, ...p), 'utf8');
const soCodigo = (f) => f.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ')
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ');

test('cada sugestão vem com o formulário PREENCHIDO', () => {
  /*
   * É o ponto inteiro: a pessoa escolhe uma ideia e recebe onde, quantas, o
   * que fazer com imagem e como anima — sem precisar saber que essas
   * perguntas existem. Sugestão que só traz um título devolve a pessoa ao
   * campo em branco de onde ela veio.
   */
  const s = guia.sanear({ titulo: 'X', brief: 'y' });
  for (const campo of ['formatos', 'quantidade', 'imagens', 'entrada', 'continua']) {
    assert.ok(Object.prototype.hasOwnProperty.call(s, campo), 'faltou ' + campo);
  }
  assert.ok(Array.isArray(s.formatos) && s.formatos.length, 'sugestão sem formato');
});

test('valor fora da tabela é DESCARTADO, não corrigido', () => {
  /*
   * Os eixos são fixos porque são finitos e conhecidos, e porque eixo gerado
   * é superfície que eval nenhum mede. Corrigir um valor inventado esconderia
   * que o modelo saiu do combinado — e um valor que passasse daqui quebraria
   * calado lá no diretor, que lê `formatos` e `imagens` como limite.
   */
  const s = guia.sanear({
    formatos: ['16/9', '4/5', 'quadrado'], imagens: 'gerar foto linda',
    entrada: 'explodir', continua: 'dançar', quantidade: 99,
  });
  assert.deepStrictEqual(s.formatos, ['16/9'], 'formato inventado passou');
  assert.equal(s.imagens, 'nenhuma', 'modo de imagem inventado passou');
  assert.equal(s.entrada, '', 'animação inventada passou');
  assert.equal(s.continua, '', 'animação contínua inventada passou');
  assert.equal(s.quantidade, 4, 'a quantidade perdeu o teto');
});

test('os eixos do guia batem com os que o diretor lê como limite', () => {
  /*
   * Se as duas tabelas divergirem, o guia oferece algo que o diretor descarta
   * — e a pessoa recebe diferente do que escolheu, sem nenhum aviso.
   */
  const director = soCodigo(ler('server', 'ai-director.js'));
  for (const f of Object.keys(guia.ONDE)) {
    assert.ok(director.includes("'" + f + "'"), 'o diretor não conhece o formato ' + f);
  }
  assert.match(director, /\['gerar', ?'acervo', ?'nenhuma'\]/,
    'os modos de imagem do diretor mudaram e o guia não sabe');
});

test('as animações oferecidas existem no player', () => {
  // Oferecer "girar entrando" e o player não conhecer é peça publicada parada.
  const anim = require('../js/animacao.js');
  const entradas = anim.ENTRADAS.map((x) => x.id);
  const continuas = anim.CONTINUAS.map((x) => x.id);
  for (const e of guia.ENTRADA) assert.ok(entradas.includes(e), 'entrada inexistente: ' + e);
  for (const c of guia.CONTINUA) assert.ok(continuas.includes(c), 'contínua inexistente: ' + c);
});

test('sem chave de IA o guia não some — oferece um cardápio fixo', async () => {
  /*
   * Tela vazia é onde quem não sabe o que pedir desiste. E é o que torna o
   * fluxo percorrível em desenvolvimento e no eval.
   */
  const r = await guia.sugerir({ empresa: 'Padaria do Bairro' });
  assert.equal(r.sugestoes.length, 3);
  assert.match(r.abertura, /Padaria do Bairro/, 'o guia não cita o negócio');
  for (const s of r.sugestoes) assert.ok(s.titulo && s.porque && s.brief);
});

test('o guia não propõe as três com foto paga', async () => {
  /*
   * Cada foto por IA sai do bolso da pessoa. Três sugestões pagas fazem
   * parecer que usar o produto custa — e ela pede menos do que precisaria.
   */
  const r = await guia.sugerir({ empresa: 'X' });
  const pagas = r.sugestoes.filter((s) => s.imagens === 'gerar');
  assert.ok(pagas.length < r.sugestoes.length, 'todas as sugestões custam crédito');
});

test('escolher no cardápio PREENCHE a refinaria, não pula ela', () => {
  /*
   * Pular seria mais rápido e mais errado: a pessoa perderia a única chance
   * de ver que "2 peças, TV deitada, foto por IA" foi uma decisão, e não o
   * destino.
   */
  const tela = soCodigo(ler('web', 'src', 'pages', 'MyDesignsPage.jsx'));
  const i = tela.indexOf('function escolherSugestao');
  assert.ok(i > 0, 'sumiu a ligação entre o cardápio e a refinaria');
  const corpo = tela.slice(i, i + 500);
  for (const set of ['setBrief', 'setOnde', 'setQuantas', 'setImagens']) {
    assert.ok(corpo.includes(set), 'escolher uma sugestão não preenche ' + set);
  }
  // E tem que SAIR do cardápio, senão a escolha não leva a lugar nenhum.
  assert.match(corpo, /setGuiando\(false\)/);
});

test('o cardápio abre primeiro, e dá para sair dele', () => {
  const tela = soCodigo(ler('web', 'src', 'pages', 'MyDesignsPage.jsx'));
  assert.match(tela, /useState\(true\);/, 'o cardápio deixou de abrir primeiro');
  assert.match(tela, /onPular=\{\(\) => setGuiando\(false\)\}/,
    'não há como sair do cardápio para escrever à mão');
});

test('a rota do guia é medida', () => {
  /*
   * Rota de IA que não está no mapa passa despercebida: sem teto por hora,
   * sem extrato, sem aparecer no painel de uso. Foi assim que a rota de visão
   * ficou invisível.
   */
  const server = soCodigo(ler('server.js'));
  const mapa = server.slice(server.indexOf('const TIPO_IA'), server.indexOf('const TIPO_IA') + 1600);
  assert.match(mapa, /guia: 'guia'/, 'o guia saiu da medição');
  const creditos = require('../server/creditos.js');
  assert.ok(creditos.operacao('guia'), 'o guia não está no catálogo de créditos');
  assert.equal(creditos.operacao('guia').creditos, 0, 'o guia passou a cobrar crédito');
});

test('o guia usa o nome que a pessoa digitou, não o rótulo do kit', () => {
  /*
   * Caía no nome do kit de marca e abria com "Algumas ideias para Marca
   * principal" — o rótulo-padrão criado junto com a conta, não o nome de
   * negócio nenhum. Dizer o nome errado na primeira frase é pior que não
   * dizer nome.
   */
  const server = soCodigo(ler('server.js'));
  const i = server.indexOf("parts[2] === 'guia'");
  assert.ok(i > 0, 'sumiu a rota do guia');
  const rota = server.slice(i, i + 1800);
  assert.match(rota, /conta && conta\.name/, 'o guia voltou a usar o nome do kit');
  assert.match(rota, /!== 'Marca principal'/, 'o rótulo-padrão voltou a poder vazar para a tela');
});
