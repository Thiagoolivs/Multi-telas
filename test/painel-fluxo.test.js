/*
 * O que o percurso de primeiro uso encontrou.
 *
 * Nada aqui veio de leitura de código: subiu-se o servidor, criou-se conta num
 * navegador de verdade, pareou-se uma TV e tentou-se assinar. Cada teste
 * corresponde a um passo que TRAVOU ou mentiu na tela, e o defeito está
 * escrito junto — sem isso, daqui a três meses estas asserções viram regras
 * sem motivo, e regra sem motivo é a primeira a ser apagada.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const RAIZ = path.join(__dirname, '..');
const ler = (...p) => fs.readFileSync(path.join(RAIZ, ...p), 'utf8');
// Só o código: proibir uma palavra não pode proibir escrever SOBRE ela.
const soCodigo = (f) => f.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ')
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ');

test('o upgrade não morre em "db.getUser is not a function"', () => {
  /*
   * O caminho pago inteiro respondia 502 desde a troca para o Asaas: o
   * checkout passou a precisar do e-mail do usuário e chamou `db.getUser`,
   * que nunca existiu — o nome é `getUserById`. Ninguém nunca conseguiu
   * assinar, e o erro só aparecia depois do clique.
   */
  const server = soCodigo(ler('server.js'));
  assert.ok(!/\bdb\.getUser\(/.test(server), 'voltou a chamar db.getUser, que não existe');

  // E o nome certo tem que existir de verdade nos dois bancos.
  for (const arq of ['db-sqlite.js', 'db-postgres.js']) {
    assert.match(ler('server', arq), /getUserById/, arq + ' não exporta getUserById');
  }
});

test('a página de checkout simulado roda sob a CSP do projeto', () => {
  /*
   * A CSP é `script-src 'self'`, sem unsafe-inline, de propósito. A página de
   * pagamento simulado é anterior a isso e trazia script inline e um
   * `onclick`: o navegador recusava os dois, "Confirmar assinatura" ficava
   * mudo, e como este é o ÚNICO jeito de exercitar assinatura sem chave do
   * Asaas, o caminho pago parou de ser percorrido. Foi assim que o 502 acima
   * ficou na main sem ninguém ver.
   */
  const server = ler('server.js');
  const i = server.indexOf('function devCheckoutPage');
  assert.ok(i > 0, 'sumiu a página de checkout simulado');
  const pagina = server.slice(i, i + 4000);
  assert.ok(!/onclick=/.test(pagina), 'o botão voltou a usar onclick inline, que a CSP recusa');
  assert.match(pagina, /<script nonce="\$\{nonce\}">/, 'o script perdeu o nonce');
  assert.match(pagina, /addEventListener\('click'/, 'o handler não está mais ligado por código');

  // E a rota precisa liberar ESSE nonce, senão o nonce no HTML não vale nada.
  const rota = server.slice(server.indexOf("seg === 'dev-checkout'"), server.indexOf("seg === 'dev-checkout'") + 900);
  assert.match(rota, /nonce-/, 'a rota não libera o nonce na CSP da resposta');
});

test('a página de checkout simulado não diz "undefined telas"', () => {
  // Era `p.screens`, e o campo é `telasMax` — mesma classe do `priceCents`.
  const pagina = ler('server.js');
  assert.ok(!/\$\{p\.screens\}/.test(pagina), 'voltou a ler um campo que não existe no plano');
});

test('existe como cancelar a assinatura', () => {
  /*
   * O botão "Gerenciar assinatura (cartão, cancelamento)" chamava um portal
   * que devolvia `/app?billing=portal` — e o roteador manda qualquer
   * `?billing=` de volta para a MESMA tela. A página recarregava e não havia
   * como cancelar por lugar nenhum. Além de produto ruim, é exposição no CDC.
   */
  const server = soCodigo(ler('server.js'));
  assert.match(server, /req\.method === 'DELETE' && seg === 'assinatura'/, 'sumiu a rota de cancelamento');
  assert.ok(!/billing\?=?portal|billing=portal/.test(server), 'voltou o portal que aponta para a própria tela');

  const billing = soCodigo(ler('server', 'billing.js'));
  assert.match(billing, /function cancelarAssinatura/, 'sumiu o cancelamento no provedor');

  const tela = soCodigo(ler('web', 'src', 'pages', 'BillingPage.jsx'));
  assert.match(tela, /Cancelar assinatura/, 'a tela deixou de oferecer cancelamento');
  assert.match(tela, /Confirmar cancelamento/, 'sumiu a confirmação');
});

test('trocar de plano MUDA a assinatura, não cria uma segunda', () => {
  /*
   * O reaproveitamento casava pelo planId: quem estava no Essencial e ia para
   * o Pro ganhava uma SEGUNDA assinatura ativa, e as duas cobravam todo mês.
   * Trocar de plano é a operação mais provável de quem já paga — era o caso
   * pior no caminho mais comum.
   */
  const billing = soCodigo(ler('server', 'billing.js'));
  assert.ok(!/externalReference \|\| ''\)\.split\('\|'\)\[1\] === planId/.test(billing),
    'a busca por assinatura aberta voltou a casar por plano');
  assert.match(billing, /updatePendingPayments/, 'a troca de plano deixou de atualizar a assinatura existente');
});

test('o plano do Enterprise não manda para um checkout que recusa', () => {
  // "A combinar" não tem preço de tabela, e o checkout recusa plano sem preço:
  // o botão dizia "Fazer upgrade" e o clique dava erro.
  const tela = soCodigo(ler('web', 'src', 'pages', 'BillingPage.jsx'));
  /*
   * Ancorado em "Plano atual", que é o começo do bloco de BOTÕES — `sobConsulta`
   * aparece quatro vezes antes disso (preço, limite de telas, rótulo), e a
   * primeira versão deste teste casou com uma delas e falhou por isso.
   */
  const botoes = tela.slice(tela.indexOf('Plano atual'));
  const sob = botoes.indexOf('p.sobConsulta ?');
  const upg = botoes.indexOf('isUpgrade ?');
  assert.ok(sob > 0, 'o plano sob consulta não tem mais caminho próprio');
  assert.ok(sob < upg, 'o sob consulta voltou a cair no caminho de upgrade');
  assert.match(botoes.slice(sob, upg), /Falar com a gente/);
});

test('o saldo de boas-vindas não é chamado de "comprado"', () => {
  /*
   * Os 5 de boas-vindas entram no balde de "comprados" de propósito — para não
   * sumirem na primeira virada de ciclo. Mas a tela dizia "5 comprados" a quem
   * nunca comprou nada. O que os dois têm em comum de verdade é não expirar.
   */
  const tela = soCodigo(ler('web', 'src', 'pages', 'BillingPage.jsx'));
  assert.ok(!/\$\{creditos\.saldo\.comprado\} comprados/.test(tela), 'voltou a chamar boas-vindas de compra');
  assert.match(tela, /que não expiram/);
});

test('a tela de plano não fala mais em Stripe', () => {
  const tela = ler('web', 'src', 'pages', 'BillingPage.jsx');
  assert.ok(!/Stripe/.test(tela), 'sobrou menção ao Stripe na tela de plano');
});

test('o aviso de sistema não é pedido por quem não pode agir', () => {
  /*
   * A porta já era do servidor (404 para quem não opera a plataforma) e o
   * `.catch` fazia o aviso sumir — mas a pergunta era feita assim mesmo. Todo
   * cliente disparava um 404 a cada visita ao painel: erro no console dele,
   * rota-não-encontrada no nosso log, e o 404 que importa enterrado no ruído.
   */
  const tela = soCodigo(ler('web', 'src', 'pages', 'DashboardPage.jsx'));
  const i = tela.indexOf('sistema.diagnostico()');
  assert.ok(i > 0, 'sumiu o aviso de sistema');
  assert.match(tela.slice(Math.max(0, i - 300), i), /if \(!operador\) return;/,
    'o diagnóstico voltou a ser pedido por qualquer conta');
});

test('Aniversariantes é operação, não conta', () => {
  /*
   * Estava em "Conta", junto de armazenamento, equipe e cobrança — coisas que
   * se mexe uma vez e esquece. A lista alimenta o que a TV mostra e muda toda
   * semana; quem cuida dela é quem cuida do conteúdo.
   */
  const nav = ler('web', 'src', 'components', 'layout', 'Sidebar.jsx');
  const operacao = nav.slice(nav.indexOf("section: 'Operação'"), nav.indexOf("section: 'Conta'"));
  const conta = nav.slice(nav.indexOf("section: 'Conta'"), nav.indexOf("section: 'Plataforma'"));
  assert.match(operacao, /id: 'birthdays'/, 'Aniversariantes saiu de Operação');
  assert.ok(!/id: 'birthdays'/.test(conta), 'Aniversariantes voltou para Conta');
});

test('a TV manda o cliente abrir um menu que EXISTE', () => {
  /*
   * A TV dizia: "No painel do MultiTelas, abra Controlar TV e digite este
   * código." "Controlar TV" é do painel ANTIGO. No painel de hoje o menu se
   * chama Telas e o botão, Parear tela — então a primeira instrução que o
   * cliente lê na TV aponta para algo que não existe.
   */
  const player = ler('player.html');
  assert.ok(!/Controlar TV/.test(player), 'a TV voltou a citar um menu que não existe');
  assert.match(player, /Telas/, 'a instrução da TV precisa citar o menu real');
});
