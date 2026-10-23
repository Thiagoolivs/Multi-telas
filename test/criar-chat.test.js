/*
 * Criar é a conversa (docs/EXECUTOR.md, item 24).
 *
 * O dono: "clicou em criar > o que você quer exibir hoje? > o chat de
 * refinamento > a IA gera o ecossistema inteiro > é salvo automaticamente
 * com a opção de já colocar pra rodar". O que estes testes seguram:
 *   - a página é a conversa, com o cartão "O que vou criar" à vista;
 *   - o cartão usa o MESMO js/escopo.js do servidor (custo, recortes, tetos);
 *   - as sugestões são da conta e só põem o texto na caixa;
 *   - Gerar manda o escopo do cartão (mexido à mão ou não);
 *   - os quatro passos de antes continuam, como Criação rápida.
 *
 * Conferido no navegador, 360 px e desktop, no modo demonstração (prints no
 * PR). Teste dos 3 toques: Criar → uma ideia → Gerar (→ Pôr pra rodar, item 25).
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const RAIZ = path.join(__dirname, '..');
const ler = (...p) => fs.readFileSync(path.join(RAIZ, ...p), 'utf8');
const semComentarios = (s) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ').replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ');

test('a página Criar é a conversa, com o cartão do escopo', () => {
  const c = semComentarios(ler('web/src/pages/CriarPage.jsx'));
  assert.match(c, /O que você quer mostrar hoje\?/);
  assert.match(c, /await criar\.conversar\(conversa && conversa\.id, frase, escopo\)/, 'cada mensagem leva o cartão como está');
  assert.match(c, /<CartaoEscopo escopo=\{escopo\} onChange=\{mudarCartao\} telas=\{telas\}/);
  assert.match(c, /criar\.salvarEscopo\(conversa\.id, novo\)/, 'mexer no cartão guarda, sem IA');
  assert.match(c, /criar\.gerar\(\{ conversaId: conv \? conv\.id : undefined, escopo: pedido \}, setGerando\)/);
  assert.match(c, /\{pronto \|\| !conversando \? 'Gerar' : 'Gerar já'\}/, '"Gerar já" para quem não quer conversar');
  assert.match(c, /disabled=\{!podeGerar \|\| !!gerando\}/, 'sem nada no cartão, nada a gerar');
  assert.doesNotMatch(c, /MAX_PERGUNTAS|restantes/, 'a conversa não tem limite de perguntas');
  // Respostas prontas da IA, na voz da pessoa: um toque manda.
  assert.match(c, /ultimaIa\.sugestoes\.map\(\(s\) => \(\s*<button key=\{s\} type="button" onClick=\{\(\) => enviar\(s\)\}/);
  // A conversa e a geração sobrevivem a fechar o app.
  assert.match(c, /const GUARDA = 'mt\.criar\.conversa'/);
  assert.match(c, /const pendente = criar\.pendente\(\);\s*if \(pendente\) acompanhar\(pendente\.id\);/);
});

test('as sugestões são da conta e só começam: o texto vai para a caixa, e o cartão já fica pronto', () => {
  const c = semComentarios(ler('web/src/pages/CriarPage.jsx'));
  assert.match(c, /ai\.guia\(\{\}\)\.then\(\(r\) => setIdeias\(\(r && r\.sugestoes\) \|\| \[\]\)\)/);
  const usar = c.slice(c.indexOf('function usarIdeia('), c.indexOf('function usarComeco('));
  assert.match(usar, /setTexto\(s\.brief \|\| s\.titulo \|\| ''\);/);
  assert.doesNotMatch(usar, /enviar\(/, 'a ideia não manda sozinha: a pessoa muda o que quiser');
  assert.match(usar, /if \(!E\.temOQueGerar\(escopo\)\) setEscopo\(cartaoInicial\(/, 'mas o cartão já monta, para dar para gerar em um toque');
  // As seis entradas de antes viram começos de frase, não opções fixas —
  // as seis do perfil da conta (D4: a metalúrgica não vê "Promoção com preço").
  assert.match(c, /opcoesDoPerfil\(perfil\.id\)\.map\(\(op\) => \(\s*<button key=\{op\.id\} type="button" onClick=\{\(\) => usarComeco\(op\)\}/);
  assert.match(c, /onIr\('rapida'\)/, 'quem quer ir direto acha a Criação rápida');
});

test('o cartão é o escopo do servidor: o mesmo arquivo, os recortes, os tetos e o custo', () => {
  const lib = ler('web/src/lib/escopo.js');
  assert.match(lib, /import '\.\.\/\.\.\/\.\.\/js\/escopo\.js';/, 'o painel usa o js/escopo.js, não uma cópia');
  const k = semComentarios(ler('web/src/components/criar/CartaoEscopo.jsx'));
  assert.match(k, /E\.RECORTES\.map\(\(r\) => \(\s*<Chip key=\{r\.id\} onClick=\{\(\) => onChange\(E\.recortar\(e, r\.id\)\)\}/);
  assert.match(k, /<Passo valor=\{dados\.pecas\} max=\{E\.TETO_ZONA\[z\]\}/);
  assert.match(k, /const c = E\.custo\(escopo\);/);
  assert.match(k, /E\.REDES\.map\(\(r\) => \(/);
  assert.match(k, /type="datetime-local"/, 'a data da contagem regressiva');
  assert.match(k, /onChange\(E\.normalizar\(novo\)\)/, 'todo toque passa pela peneira');
});

test('o resultado: salvo, por TV e por zona, com as redes e a programação', () => {
  const r = semComentarios(ler('web/src/components/criar/ResultadoCampanha.jsx'));
  assert.match(r, /está pronta e salva\./);
  for (const z of ['Cabeçalho', 'Principal', 'Lateral', 'Rodapé']) assert.match(r, new RegExp('<Zona titulo="' + z + '"'), z);
  assert.match(r, /<PecaHtml item=\{p\.item\} formato=\{faixa\} mensagens=\{mensagens\} contagem=\{contagem\} \/>/, 'faixa no tamanho de faixa, com o letreiro');
  assert.match(r, /Postar nas redes/);
  assert.match(r, /Programação/);
  // A prévia da faixa mostra o letreiro e a contagem de verdade.
  assert.match(ler('web/src/components/content/PecaHtml.jsx'), /mensagens: mensagens \|\| \[\], contagem: contagem \|\| ''/);
});

test('a API do painel fala com as rotas do servidor', () => {
  const a = ler('web/src/api.js');
  assert.match(a, /conversar: \(id, texto, escopo\) => api\('POST', '\/api\/ai\/conversa', \{ id: id \|\| undefined, texto, escopo \}\)/);
  assert.match(a, /salvarEscopo: \(id, escopo\) => api\('PUT', '\/api\/conversas\/' \+ id, \{ escopo \}\)/);
  assert.match(a, /const job = await api\('POST', '\/api\/ai\/ecossistema', payload\);/);
  assert.match(a, /guardarPendente\('ecossistema', job,/, 'quem fecha a aba volta e acha a criação');
  assert.match(a, /campanha: \(id\) => api\('GET', '\/api\/campanhas\/' \+ id\)/);
});

test('nada some: os quatro passos viraram Criação rápida, com endereço e lugar no menu', async () => {
  const app = ler('web/src/App.jsx');
  assert.match(app, /case 'rapida': return <CriacaoRapidaPage /);
  assert.match(app, /rapida: \{ title: 'Criação rápida', nav: 'criar' \}/);
  const M = await import(pathToFileURL(path.join(RAIZ, 'web/src/lib/menu.js')).href);
  assert.equal(M.grupoDa('rapida').id, 'criar');
  // Desde o D2 (dois jeitos de criar) a Criação rápida mora no Criar, não em Meus Designs.
  assert.match(ler('web/src/pages/CriarPage.jsx'), /Criação rápida/);
  assert.match(ler('web/src/pages/DashboardPage.jsx'), /import \{ OpcoesDeCriar \} from '\.\/CriacaoRapidaPage\.jsx';/);
  // As entradas do Início abrem o chat com o começo de frase e o cartão montado.
  const c = ler('web/src/pages/CriarPage.jsx');
  assert.match(c, /return op \? cartaoInicial\(op\.titulo, op\.pedido, telaInicial\)/);
  assert.match(c, /return op \? op\.pedido \+ ': ' : '';/);
});
