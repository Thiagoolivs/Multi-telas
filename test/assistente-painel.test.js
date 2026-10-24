/*
 * O assistente do Criar no painel (24/10): o cartão de cada ferramenta e o
 * quiz entrando na zona pedida, conferido, com a marca para trocar depois.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const RAIZ = path.join(__dirname, '..');
const ler = (f) => fs.readFileSync(path.join(RAIZ, f), 'utf8');

const QUIZ = { titulo: 'Quiz do café', tempo: 10, revelar: 7, perguntas: [
  { pergunta: 'De onde vem o café?', alternativas: ['Etiópia', 'Brasil', 'Itália', 'Chile'], certa: 0, explicacao: 'A planta nasceu na Etiópia.', revisada: false },
  { pergunta: 'Qual bebida tem leite?', alternativas: ['Expresso', 'Cappuccino'], certa: 1, explicacao: '', revisada: false },
] };
const cfg = (zonas, layoutId) => ({ settings: { layoutId }, zonas });

test('quiz na TV: entra na lateral pedida, conferido, com a duração das perguntas', async () => {
  const Q = await import(pathToFileURL(path.join(RAIZ, 'web/src/lib/quizNaTv.js')).href);
  const antes = cfg({ principal: { items: [{ type: 'text', titulo: 'oi' }] }, lateral: { items: [{ type: 'image', src: 'a.jpg' }] } }, 'corporate');
  const depois = Q.aplicarQuiz(antes, QUIZ, 'lateral', 'c1:3');
  const item = depois.zonas.lateral.items[0];
  assert.equal(item.type, 'quiz');
  assert.equal(item._quiz, 'c1:3');
  assert.ok(item.perguntas.every((p) => p.revisada === true), 'foi à TV sem estar conferido');
  assert.equal(item.duracao, 2 * (10 + 7));
  assert.equal(depois.zonas.lateral.items.length, 2, 'tirou o que já estava na lateral');
  assert.equal(depois.zonas.principal.items.length, 1, 'mexeu na principal');
  assert.equal(antes.zonas.lateral.items.length, 1, 'modificou a config recebida');
  // Pôr de novo troca o mesmo quiz, não empilha.
  const outra = Q.aplicarQuiz(depois, QUIZ, 'lateral', 'c1:3');
  assert.equal(outra.zonas.lateral.items.filter((i) => i.type === 'quiz').length, 1);
});

test('quiz na TV: sem lateral, vai para a principal e diz que caiu', async () => {
  const Q = await import(pathToFileURL(path.join(RAIZ, 'web/src/lib/quizNaTv.js')).href);
  const so = cfg({ principal: { items: [] } }, 'full');
  assert.deepEqual(Q.zonaDoQuiz(so, 'lateral'), { id: 'principal', caiu: true });
  assert.equal(Q.aplicarQuiz(so, QUIZ, 'lateral', 'x').zonas.principal.items[0].type, 'quiz');
});

test('o Criar mostra o cartão do assistente e o quiz só vai com "conferi"', () => {
  const C = ler('web/src/pages/CriarPage.jsx');
  assert.match(C, /<AcaoDaIA acao=\{m\.acao\}/);
  assert.match(C, /modo === 'dev'/, 'o teste local sem IA não avisa');
  const A = ler('web/src/components/criar/AcaoDaIA.jsx');
  assert.match(A, /disabled=\{!ids\.length \|\| !conferi \|\| enviando\}/, 'o quiz vai sem conferir');
  assert.match(A, /gravarEmLote\(alvos, /);
  assert.match(A, /avisarComDesfazer\(/);
  assert.match(A, /<AvisoRapido avisoInicial=\{a\}/);
  assert.match(A, /<MudarAparencia tv=\{acao\.tv\}/);
  assert.match(A, /onIr\('campanhas', \{ campanha: acao\.campanha\.id, pedido: acao\.pedido \|\| '' \}\)/);
});
