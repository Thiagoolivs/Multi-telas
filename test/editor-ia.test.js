/*
 * A IA dentro do editor.
 *
 * Estes testes existem porque a versão anterior fazia duas coisas que ninguém
 * pediu: apagava todos os textos da peça, e reetiquetava como texto qualquer
 * elemento que voltasse. A segunda é a razão de "peça uma imagem ou um SVG"
 * nunca ter funcionado — o editor não conseguia produzir outra coisa a partir
 * da IA, por construção.
 *
 * A leitura é do ARQUIVO: o comportamento mora num componente React que não dá
 * para instanciar aqui sem DOM, mas as duas linhas que causavam o estrago são
 * verificáveis, e é justamente a volta delas que se quer impedir.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

/*
 * Comentários fora antes de comparar.
 *
 * Os comentários deste projeto CITAM o código defeituoso para explicar o
 * conserto — e uma busca crua acusaria a própria explicação como se fosse o
 * defeito de volta. O que interessa é o que executa.
 */
const semComentarios = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const EDITOR = semComentarios(fs.readFileSync(
  path.join(__dirname, '..', 'web', 'src', 'components', 'content', 'CompositionEditor.jsx'), 'utf8'));
const AI_BRUTO = fs.readFileSync(path.join(__dirname, '..', 'server', 'ai.js'), 'utf8');
const AI = semComentarios(AI_BRUTO);
const SERVER = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');

test('a IA não apaga mais os textos da peça por conta própria', () => {
  /*
   * A linha era:
   *   els: [...d.els.filter((e) => e.tipo !== 'texto'), ...]
   * Rodar a IA numa peça em andamento jogava fora a copy inteira, sem aviso.
   */
  assert.ok(!/filter\(\(e\) => e\.tipo !== 'texto'\)/.test(EDITOR),
    'voltou a descartar os textos existentes');
});

test('a IA não força tudo a virar texto', () => {
  // `.map((e) => ({ ...e, tipo: 'texto' }))` reetiquetava forma e ícone.
  assert.ok(!/\{ \.\.\.e, tipo: 'texto' \}/.test(EDITOR),
    'voltou a reetiquetar todo elemento como texto');
  assert.match(EDITOR, /TIPOS_DA_IA/, 'sumiu a lista de tipos aceitos');
  assert.match(EDITOR, /tipo: e\.tipo \|\| 'texto'/, 'o tipo devolvido deixou de ser honrado');
});

test('acrescentar é o padrão; substituir é escolha explícita', () => {
  // O botão que destrói não pode ser o mesmo que o que constrói.
  assert.match(EDITOR, /runAi\(false\)/, 'sumiu o caminho de acrescentar');
  assert.match(EDITOR, /runAi\(true\)/, 'sumiu o caminho de substituir');
  assert.match(EDITOR, /substituir \? entrar\(vindos\) : \[\.\.\.d\.els, \.\.\.entrar\(vindos\)\]/,
    'a decisão de substituir deixou de ser explícita');
});

test('a marca vem do kit da conta, não da cor de fundo', () => {
  /*
   * `bg.kind === 'cor' ? bg.cor : ''` mandava string vazia sempre que o fundo
   * era gradiente ou imagem — e a peça voltava sem marca nenhuma.
   */
  assert.match(EDITOR, /marcaDaConta/, 'a marca da conta não é mais buscada');
  assert.match(EDITOR, /brandApi\.get\(\)/, 'o kit da marca deixou de ser lido');
});

test('o formato da peça chega até a IA', () => {
  // Sem ele a IA compunha sempre para tela deitada; em 9/16 voltava errado.
  assert.match(EDITOR, /formato: aspect/, 'o editor não envia mais o formato');
  assert.match(SERVER, /formato: \(b && b\.formato\) \|\| '16\/9'/, 'a rota não repassa o formato');
  assert.match(AI, /ctx\.formato/, 'a IA não lê mais o formato');
  assert.match(AI, /EM PÉ|DEITADA/, 'o formato não vira instrução em português');
});

test('a orientação descrita bate com a proporção', () => {
  // O texto que vai no prompt precisa dizer a verdade sobre a tela.
  /*
   * A fatia começa em `const orientacao` e termina no PRÓXIMO `const system`.
   * `indexOf('const system')` sozinho encontrava a primeira ocorrência do
   * arquivo, que vem muito antes — e a fatia saía vazia, fazendo o teste
   * passar sem olhar nada.
   */
  const i = AI.indexOf('const orientacao');
  const trecho = AI.slice(i, AI.indexOf('const system', i));
  assert.ok(trecho.length > 50, 'a fatia do arquivo saiu vazia');
  assert.match(trecho, /'9\/16'.*EM PÉ/s);
  assert.match(trecho, /'1\/1'.*QUADRADA/s);
  assert.match(trecho, /'21\/9'.*LARGA/s);
});
