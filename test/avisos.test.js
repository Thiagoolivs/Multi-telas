/*
 * A central de avisos e o "onde isto vai ficar".
 *
 * O que originou isto: gerar imagem com IA travava um diálogo por até um
 * minuto. Quem saísse da página perdia o resultado — e o crédito, que já
 * tinha sido cobrado. E o campo de pasta vinha preenchido com a primeira
 * campanha da conta, então a imagem caía dentro de "Natal 2025" porque
 * "Natal 2025" era a primeira da lista.
 *
 * O emissor é testável de verdade (é JS puro). A ligação com a tela é lida do
 * arquivo, porque mora num componente React que precisa de DOM — e é
 * conferida de novo no navegador.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const carregar = async () => {
  // Cada teste precisa da lista limpa: o módulo guarda estado de propósito
  // (é isso que faz o aviso sobreviver à navegação).
  const m = await import('../web/src/lib/avisos.js');
  m.limpar();
  return m;
};

const semComentarios = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const ler = (...p) => semComentarios(fs.readFileSync(path.join(__dirname, '..', ...p), 'utf8'));
const PAGINA = ler('web', 'src', 'pages', 'MyDesignsPage.jsx');
const SALVAR = ler('web', 'src', 'components', 'content', 'SalvarEm.jsx');
const SHELL = ler('web', 'src', 'components', 'layout', 'AppShell.jsx');
const APP = ler('web', 'src', 'App.jsx');

const bandeja = async () => {
  const m = await import('../web/src/lib/bandeja.js');
  m.limpar();
  return m;
};

test('quem se inscreve recebe a lista na hora, e a cada mudança', async () => {
  const A = await carregar();
  const vistas = [];
  const sair = A.inscrever((l) => vistas.push(l.length));
  A.aviso.ok('salvo');
  sair();
  A.aviso.ok('outro');
  assert.deepEqual(vistas, [0, 1], 'parou de avisar, ou avisou depois de sair');
});

test('o mesmo id SUBSTITUI o aviso, não empilha outro', async () => {
  const A = await carregar();
  // É o ciclo inteiro de um trabalho: "gerando…" vira "ficou pronta" no
  // mesmo lugar. Sem isto, sobrariam dois avisos e um deles mentindo.
  A.aviso.trabalho('img:1', 'Gerando sua imagem…');
  A.aviso.pronto('img:1', 'Sua imagem ficou pronta.');
  const l = A.listar();
  assert.equal(l.length, 1, 'empilhou em vez de substituir');
  assert.equal(l[0].tom, 'pronto');
  assert.equal(l[0].texto, 'Sua imagem ficou pronta.');
});

test('substituir mantém o lugar na pilha', async () => {
  const A = await carregar();
  A.aviso.trabalho('a', 'primeiro');
  A.aviso.trabalho('b', 'segundo');
  A.aviso.pronto('a', 'primeiro pronto');
  assert.deepEqual(A.listar().map((x) => x.id), ['a', 'b'], 'o aviso pulou para o fim da fila');
});

test('só o recado curto some sozinho — o que tem ação, fica', async () => {
  const A = await carregar();
  A.aviso.pronto('p', 'pronto', '', { rotulo: 'Ver', on() {} });
  A.aviso.erro('e', 'falhou');
  A.aviso.trabalho('t', 'trabalhando');
  await new Promise((r) => setTimeout(r, 60));
  const ids = A.listar().map((x) => x.id);
  // Um aviso com botão que evapora é pior que não ter botão: a pessoa vê que
  // havia algo a fazer e não alcança.
  assert.ok(ids.includes('p'), 'o aviso com ação sumiu sozinho');
  assert.ok(ids.includes('e'), 'o erro sumiu antes de ser lido');
  assert.ok(ids.includes('t'), 'o trabalho em andamento sumiu sozinho');
});

test('fechar tira só o aviso pedido', async () => {
  const A = await carregar();
  A.aviso.erro('a', 'um'); A.aviso.erro('b', 'dois');
  A.fechar('a');
  assert.deepEqual(A.listar().map((x) => x.id), ['b']);
});

test('a ação vai junto do aviso', async () => {
  const A = await carregar();
  let clicou = 0;
  A.aviso.pronto('x', 'pronto', 'detalhe', { rotulo: 'Ver e salvar', on: () => clicou++ });
  const a = A.listar()[0];
  assert.equal(a.acao.rotulo, 'Ver e salvar');
  a.acao.on();
  assert.equal(clicou, 1);
});

/* ---- a ligação com a tela ---- */

test('a pilha de avisos fica FORA do <main>', () => {
  // Dentro do main, ela rolaria com a página e sumiria ao trocar de menu —
  // que é exatamente o que a pessoa faz enquanto espera a IA.
  const i = SHELL.indexOf('<Avisos />');
  assert.ok(i > 0, 'a pilha de avisos não está montada no shell');
  assert.ok(i > SHELL.indexOf('</main>'), 'a pilha de avisos ficou dentro do <main>');
});

/*
 * O aviso de "pronto" saiu de dentro de `gerarImagem` e virou
 * `avisarImagemPronta`, porque agora DOIS caminhos chegam nele: a geração de
 * agora e o trabalho retomado depois de recarregar o navegador.
 *
 * Os testes seguem o comportamento, não o lugar: quem começa a geração
 * continua sendo conferido em `gerarImagem`, e o que acontece quando ela fica
 * pronta é conferido onde isso mora agora.
 */
const corpoDe = (nome, tamanho) => {
  const i = PAGINA.indexOf('function ' + nome);
  assert.ok(i > 0, 'sumiu ' + nome);
  return PAGINA.slice(i, i + (tamanho || 1400));
};

test('gerar imagem não trava mais a tela', () => {
  // A versão anterior era `await ai.image(...)` dentro de um `setBusy(true)`,
  // com o diálogo modal aberto o tempo todo.
  const corpo = corpoDe('gerarImagem');
  assert.ok(!/await ai\.image/.test(corpo), 'a geração voltou a segurar a tela');
  assert.match(corpo, /aviso\.trabalho\(/, 'não avisa que começou');
  assert.match(corpo, /avisarImagemPronta\(/, 'não avisa quando fica pronta');
  assert.match(corpo, /aviso\.erro\(/, 'a falha some em silêncio');
  assert.match(corpo, /setImgOpen\(false\)[\s\S]{0,200}ai\.image/, 'o diálogo não fecha antes de começar');
  assert.match(corpoDe('avisarImagemPronta'), /aviso\.pronto\(/, 'o pronto deixou de avisar');
});

test('a imagem retomada avisa pelo MESMO caminho da recém-gerada', () => {
  /*
   * São dois caminhos até o mesmo aviso, e é por isso que ele foi extraído.
   * Se a retomada montasse o próprio aviso, o segundo lugar seria o que ficaria
   * para trás — e a imagem retomada perderia o botão de salvar, que é a única
   * forma de alcançar uma geração que já foi paga.
   */
  assert.match(PAGINA, /ai\.retomar\('imagem'[\s\S]{0,400}avisarImagemPronta\(/,
    'a imagem retomada não usa o aviso compartilhado');
});

test('o aviso de pronto leva o botão que abre onde salvar', () => {
  const corpo = corpoDe('avisarImagemPronta', 1800);
  assert.match(corpo, /rotulo: 'Ver e salvar'/, 'o aviso ficou sem ação');
  assert.match(corpo, /pasta: 'Imagens da IA'/, 'a imagem não sugere pasta própria');
});

test('a campanha da IA também avisa quando termina', () => {
  assert.match(PAGINA, /aviso\.pronto\('campanha:'/, 'a campanha fica pronta em silêncio');
  assert.match(PAGINA, /aviso\.erro\('campanha:'/, 'a falha da campanha some em silêncio');
});

test('nenhum caminho de criação pré-seleciona a primeira campanha da conta', () => {
  // Era `setColl(collections[0] || ...)` nos três caminhos: a peça caía dentro
  // de uma campanha sem relação nenhuma, só por ser a primeira da lista.
  assert.ok(!/collections\[0\]/.test(PAGINA),
    'voltou a jogar o que foi criado na primeira campanha que existir');
});

test('criar pasta é uma porta do mesmo tamanho que escolher uma', () => {
  assert.match(SALVAR, /Criar pasta/, 'sumiu a opção de criar pasta');
  assert.match(SALVAR, /Pasta que já existe/, 'sumiu a opção de usar uma pasta existente');
  assert.match(SALVAR, /modo === 'nova'/, 'sumiu a escolha entre criar e escolher');
});

test('sem pasta nenhuma, o diálogo abre já criando', () => {
  // Conta nova não tem o que escolher; mostrar um seletor vazio ao lado de
  // "criar" é oferecer uma porta que não abre.
  assert.match(SALVAR, /const criar = pastas\.length === 0 \|\|/,
    'o modo inicial deixou de considerar a conta sem pastas');
  assert.match(SALVAR, /pastas\.length > 0 && \(/, 'os dois botões aparecem mesmo sem pasta alguma');
});

test('a pasta sugerida que JÁ existe é usada, não duplicada', () => {
  // Sugerir "Imagens da IA" numa conta que já tem "Imagens da IA" e abrir em
  // modo criar faria a conta acumular duas pastas com o mesmo nome.
  assert.match(SALVAR, /const jaExiste = !!pastaSugerida && pastas\.includes\(pastaSugerida\);/,
    'deixou de reaproveitar a pasta sugerida que já existe');
  assert.match(SALVAR, /setExistente\(jaExiste \? pastaSugerida : \(pastas\[0\] \|\| ''\)\);/,
    'a pasta sugerida deixou de vir selecionada');
});

test('sem sugestão e com pastas, abre escolhendo — não criando', () => {
  // É o caso de quem acabou de desenhar à mão: abrir em "criar" faria a conta
  // juntar vários "Meus Designs" ao lado das pastas de verdade.
  assert.match(PAGINA, /setSaveItem\(\{ item, nome: '', pasta: '' \}\);/,
    'o salvar do editor voltou a sugerir uma pasta que não significa nada');
});

test('não dá para salvar sem dizer a pasta', () => {
  assert.match(SALVAR, /const podeSalvar = !ocupado && !!pastaEscolhida;/,
    'voltou a aceitar salvar sem pasta');
});

test('reabrir o diálogo recomeça do sugerido', () => {
  // Sem isto, salvar em "Verão" e gerar outra imagem logo depois traria
  // "Verão" de volta como se fosse escolha nova.
  assert.match(SALVAR, /if \(!aberto\) return;\s*setNome\(nomeSugerido\);/,
    'o diálogo deixou de recomeçar do sugerido ao reabrir');
});


/* ---- a bandeja ---- */

test('quem se inscreve depois do depósito ainda recebe', async () => {
  // É o caso inteiro: a IA termina, a pessoa está em Marca, clica no aviso, e
  // "Meus Designs" só MONTA depois. Sem a entrega na inscrição, o clique não
  // faria nada e o resultado — já cobrado — ficaria inalcançável.
  const B = await bandeja();
  B.guardar({ nome: 'imagem' });
  let visto = null;
  B.inscrever((p) => { visto = p; });
  assert.deepEqual(visto, { nome: 'imagem' });
});

test('quem já está inscrito recebe o depósito na hora', async () => {
  const B = await bandeja();
  const vistos = [];
  B.inscrever((p) => vistos.push(p));
  B.guardar({ nome: 'x' });
  assert.deepEqual(vistos, [null, { nome: 'x' }]);
});

test('cabe uma coisa só', async () => {
  // Duas peças esperando abririam dois diálogos por cima um do outro, e não
  // dá para saber qual está sendo respondido.
  const B = await bandeja();
  B.guardar({ nome: 'a' });
  B.guardar({ nome: 'b' });
  assert.deepEqual(B.espiar(), { nome: 'b' });
});

test('limpar não avisa à toa', async () => {
  const B = await bandeja();
  let chamadas = 0;
  B.inscrever(() => chamadas++);
  B.limpar();
  assert.equal(chamadas, 1, 'limpar a bandeja já vazia disparou aviso');
});

test('sair da inscrição para de receber', async () => {
  const B = await bandeja();
  const vistos = [];
  const sair = B.inscrever((p) => vistos.push(p));
  sair();
  B.guardar({ nome: 'z' });
  assert.deepEqual(vistos, [null]);
});

test('o aviso deposita na bandeja e manda navegar', () => {
  // Antes ele chamava setSaveItem direto — num componente que podia estar
  // desmontado, e aí o clique não fazia nada.
  const corpo = corpoDe('avisarImagemPronta', 1800);
  assert.match(corpo, /guardarNaBandeja\(\{ item,/, 'a imagem pronta deixou de passar pela bandeja');
  assert.match(corpo, /if \(onIr\) onIr\('designs'\)/, 'o aviso deixou de trazer a pessoa de volta');
  assert.ok(!/on: \(\) => setSaveItem\(/.test(corpo),
    'voltou a mexer no estado de uma página que pode estar desmontada');
});

test('a campanha pronta também passa pela bandeja', () => {
  // O servidor DESCARTA o trabalho ao entregar: sem depositar, voltar para
  // "Meus Designs" não traz a campanha de volta.
  assert.match(PAGINA, /guardarNaBandeja\(\{ tipo: 'campanha', gen: out/,
    'a campanha pronta some ao sair da página');
  assert.match(PAGINA, /if \(p\.tipo === 'campanha'\)/, 'a página não sabe recolher a campanha');
});

test('a página recolhe a bandeja ao montar e enquanto montada', () => {
  assert.match(PAGINA, /useEffect\(\(\) => inscreverBandeja\(/, 'a página deixou de olhar a bandeja');
  assert.match(PAGINA, /limparBandeja\(\);/, 'a bandeja nunca é esvaziada — o diálogo reabriria sozinho');
});

test('o App entrega a navegação para a página', () => {
  assert.match(APP, /<MyDesignsPage onIr=\{go\} \/>/,
    'sem isto o aviso não consegue trazer a pessoa de volta');
});
