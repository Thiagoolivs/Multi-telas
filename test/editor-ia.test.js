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

/* ---------------- Sair e voltar ---------------- */

const fsIA = require('node:fs');
const pathIA = require('node:path');
const lerArquivo = (...p) => fsIA.readFileSync(pathIA.join(__dirname, '..', ...p), 'utf8');

/*
 * As rotas de IA são DESCOBERTAS na fonte, nunca listadas à mão.
 *
 * A versão anterior destes testes trazia oito nomes escritos no próprio teste
 * e prometia, no comentário, que "uma rota nova de IA que nasça síncrona
 * precisa falhar aqui". Não falhava: uma rota que não está na lista não é
 * conferida por ninguém. E aconteceu — `analise-visual` entrou depois,
 * síncrona e fora da medição, e a suíte inteira passou verde.
 *
 * Descobrir muda quem carrega o ônus: quem acrescenta rota de IA precisa
 * dizer aqui o que ela é, em vez de o teste precisar adivinhar.
 */
function rotasDeIA(SERVER) {
  const achadas = [];
  const re = /parts\[2\] === '([^']+)'/g;
  let m;
  while ((m = re.exec(SERVER))) {
    const antes = SERVER.slice(Math.max(0, m.index - 60), m.index);
    if (!antes.includes("parts[1] === 'ai'")) continue;
    const bloco = SERVER.slice(m.index, m.index + 4000);
    const fim = bloco.indexOf("parts[2] === '", 20);
    achadas.push({ nome: m[1], corpo: fim > 0 ? bloco.slice(0, fim) : bloco });
  }
  return achadas;
}

// Leem estado de trabalho já criado. Não chamam IA, não gastam nada.
const SO_LEEM_ESTADO = ['job', 'jobs'];

test('toda rota de IA aparece em algum lugar da contabilidade', () => {
  /*
   * `analise-visual` nasceu fora do mapa TIPO_IA: sem teto por hora, sem
   * extrato, sem aparecer no painel de uso. Uma conta em laço chamaria a
   * visão sem limite nenhum, e o gasto só apareceria na fatura do mês
   * seguinte — que é tarde para descobrir.
   *
   * Dois jeitos valem, e são os dois que existem: entrar no mapa (texto e
   * visão, que só são medidos) ou conferir e cobrar crédito na própria rota
   * (imagem, que é a cara). O que não vale é nenhum dos dois.
   */
  const SERVER = lerArquivo('server.js');
  const mapa = SERVER.slice(SERVER.indexOf('const TIPO_IA'), SERVER.indexOf('const TIPO_IA') + 1400);
  const foraDaConta = [];
  for (const { nome, corpo } of rotasDeIA(SERVER)) {
    if (SO_LEEM_ESTADO.includes(nome)) continue;
    const noMapa = mapa.includes("'" + nome + "':") || new RegExp('\\b' + nome + ':').test(mapa);
    const cobraDireto = /usoIA\.conferir\(/.test(corpo) && /usoIA\.cobrar\(/.test(corpo);
    if (!noMapa && !cobraDireto) foraDaConta.push(nome);
  }
  assert.deepStrictEqual(foraDaConta, [],
    'rota de IA sem medição nem cobrança: ou entra no TIPO_IA, ou confere e cobra crédito');
});

/*
 * As que ainda respondem na própria requisição, uma a uma e com o motivo.
 *
 * A lista é AFIRMADA por igualdade, não usada como perdão: acrescentar rota
 * síncrona quebra o teste, e converter uma destas em trabalho também quebra —
 * e aí some daqui, que é o sentido.
 */
const AINDA_SINCRONAS = [
  'analise-visual', // lê uma peça pronta e devolve crítica; não gera nada nem gasta crédito
  'briefing',       // turno de conversa: a resposta é o próprio fio, sair já perde o contexto
  'diagnose',       // olha a tela e responde na hora; é ferramenta de suporte, não geração
  'director',       // monta o plano que as outras rotas executam depois
];

test('toda rota de IA que GERA roda como trabalho — e as síncronas são só as declaradas', () => {
  /*
   * Só a campanha rodava como trabalho, porque era a única que passava do
   * tempo de uma requisição. As outras eram síncronas, e o defeito era o
   * mesmo em tamanho menor: fechar a aba, trocar de página ou o celular perder
   * a rede por dez segundos matava o pedido — com o crédito já gasto.
   */
  const SERVER = lerArquivo('server.js');
  const sincronas = rotasDeIA(SERVER)
    .filter((r) => !SO_LEEM_ESTADO.includes(r.nome))
    .filter((r) => !r.corpo.includes('emTrabalho('))
    .map((r) => r.nome)
    .sort();
  assert.deepStrictEqual(sincronas, [...AINDA_SINCRONAS].sort(),
    'mudou o conjunto de rotas de IA que respondem na própria requisição');
});

test('o trabalho guarda o tipo e o pedido', () => {
  // Um id não diz nada a quem volta. "Compondo — promoção de sexta" diz tudo,
  // e é o que permite a tela reconhecer qual trabalho é dela.
  const SERVER = lerArquivo('server.js');
  const chamadas = SERVER.match(/emTrabalho\(res, sess, '([^']+)', \{ brief:/g) || [];
  assert.ok(chamadas.length >= 7, 'alguma geração deixou de guardar o pedido: ' + chamadas.length);
});

test('o cliente guarda o trabalho POR TIPO, para cada tela achar o seu', () => {
  /*
   * Numa lista só, a primeira tela a perguntar levaria o trabalho da outra:
   * quem tem uma peça sendo composta no editor e uma campanha rodando ao mesmo
   * tempo precisa que cada uma reencontre a SUA.
   */
  const API = lerArquivo('web', 'src', 'api.js');
  assert.match(API, /function guardarPendente\(tipo,/, 'o pendente deixou de ser por tipo');
  assert.match(API, /function pendenteDe\(tipo\)/);
  assert.match(API, /retomar:/, 'sumiu o jeito de voltar a acompanhar sem começar outro');
  // E o polling tem que parar em `erro` e `pronto`, senão gira para sempre.
  assert.match(API, /if \(s\.estado === 'pronto'\)/);
  assert.match(API, /if \(s\.estado === 'erro'\)/);
});

test('o editor retoma a peça que ficou gerando', () => {
  const ED = lerArquivo('web', 'src', 'components', 'content', 'CompositionEditor.jsx');
  assert.match(ED, /ai\.retomar\('peca-do-editor'/, 'o editor não volta a acompanhar a peça');
  /*
   * E o erro da IA não pode voltar a ser `alert()`: ele rouba o foco, some ao
   * primeiro clique e não sobrevive a trocar de aba — três defeitos para uma
   * mensagem que costuma dizer o que fazer em seguida.
   *
   * A conferência é dentro de `runAi`, e não no arquivo inteiro: o upload de
   * imagem ainda usa alerta, é outro assunto, e um teste que reclamasse dele
   * aqui obrigaria alguém a mexer no upload para mexer na IA.
   */
  const i = ED.indexOf('async function runAi(');
  assert.ok(i > 0, 'sumiu o pedido de IA do editor');
  const corpo = ED.slice(i, ED.indexOf('\n  }', i));
  assert.ok(!/alert\(/.test(corpo), 'o erro da IA voltou para o alerta do navegador');
  assert.match(corpo, /setAiErro\(/, 'o erro da IA não aparece na barra');
  assert.match(corpo, /setAiEtapa\(/, 'a etapa da IA não é mostrada');
});

test('a imagem — a única que custa crédito — também é retomada', () => {
  /*
   * O aviso já dizia "pode sair desta tela", e era verdade enquanto a aba
   * vivesse. Recarregar o navegador quebrava a promessa, e a imagem ficava
   * paga e inalcançável.
   */
  const MD = lerArquivo('web', 'src', 'pages', 'MyDesignsPage.jsx');
  assert.match(MD, /ai\.retomar\('imagem'/, 'a imagem não é retomada ao reabrir a página');
  assert.match(MD, /function avisarImagemPronta\(/, 'os dois caminhos não compartilham o aviso de pronto');
});
