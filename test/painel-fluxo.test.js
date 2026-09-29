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
  const server = soCodigo(require('./fonte-servidor.js').fonteDoServidor());
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
  const server = require('./fonte-servidor.js').fonteDoServidor();
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
  const pagina = require('./fonte-servidor.js').fonteDoServidor();
  assert.ok(!/\$\{p\.screens\}/.test(pagina), 'voltou a ler um campo que não existe no plano');
});

test('existe como cancelar a assinatura', () => {
  /*
   * O botão "Gerenciar assinatura (cartão, cancelamento)" chamava um portal
   * que devolvia `/app?billing=portal` — e o roteador manda qualquer
   * `?billing=` de volta para a MESMA tela. A página recarregava e não havia
   * como cancelar por lugar nenhum. Além de produto ruim, é exposição no CDC.
   */
  const server = soCodigo(require('./fonte-servidor.js').fonteDoServidor());
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

/* ---------------- A TV depois de pareada ---------------- */

test('a TV sabe a diferença entre "não pareada" e "pareada e vazia"', () => {
  /*
   * `GET /devices/:id/config` responde 204 nos DOIS casos: tela que ninguém
   * reivindicou, e tela reivindicada cujo dono ainda não publicou nada. O
   * player lia "sem config" e mostrava o código de pareamento — então quem
   * acabava de parear via o painel dizer "Online · agora mesmo" enquanto a TV
   * na frente dele continuava pedindo para parear.
   *
   * O estrago é no primeiro minuto de uso: a pessoa conclui que falhou e
   * pareia de novo, criando uma segunda tela. No plano grátis, que é de uma
   * tela só, a segunda esbarra no limite — e ela ganha um erro de cobrança
   * num produto que ainda nem viu funcionar.
   *
   * O dado para separar os dois sempre esteve na mão: `ensureDevice` devolve
   * `paired`. O que faltava era usá-lo.
   */
  const player = soCodigo(ler('js', 'player.js'));
  assert.match(player, /function showAguardando/, 'sumiu o estado de "pareada, aguardando conteúdo"');
  assert.match(player, /\} else if \(dev\.paired\) \{/, 'o boot voltou a tratar pareada e não pareada igual');

  const cloud = soCodigo(ler('js', 'cloud.js'));
  assert.match(cloud, /paired: meta\.paired/, 'o player deixou de receber se a tela está pareada');
});

test('parear AVISA a TV, sem esperar a primeira publicação', () => {
  /*
   * Parear não avisava ninguém, e o player só troca de estado quando chega uma
   * CONFIG. Quem acabou de parear ainda não publicou nada, então a TV ficaria
   * no código até a primeira publicação — que pode demorar horas, ou nunca
   * vir, porque a pessoa foi embora achando que não funcionou.
   */
  const server = soCodigo(require('./fonte-servidor.js').fonteDoServidor());
  const i = server.indexOf('db.claimDevice(');
  assert.ok(i > 0, 'sumiu o pareamento');
  assert.match(server.slice(i, i + 600), /broadcast\(d\.id, 'pareada'/,
    'parear voltou a não avisar a TV');

  const cloud = soCodigo(ler('js', 'cloud.js'));
  assert.match(cloud, /addEventListener\('pareada'/, 'a TV deixou de ouvir o aviso de pareamento');

  const player = soCodigo(ler('js', 'player.js'));
  assert.match(player, /showAguardando\(dados && dados\.nome\)/,
    'a TV recebe o aviso e não troca de tela');
});

test('a tela de "aguardando" não oferece gerar outro código', () => {
  // Ali o botão só serviria para desparear sem querer a TV que acabou de
  // funcionar — e é o único botão da tela, o mais provável de ser apertado.
  const player = soCodigo(ler('js', 'player.js'));
  const i = player.indexOf('function showAguardando');
  assert.match(player.slice(i, i + 1200), /reset\) reset\.classList\.add\('hidden'\)/);
  assert.match(ler('css', 'player.css'), /\.mt-pairing-reset\.hidden/, 'o CSS não esconde o botão');
});

test('VOLTAR do celular volta uma página do painel, não sai dele', () => {
  /*
   * A troca de página era só estado do React. No celular — onde o dono da
   * loja mais usa o painel — o gesto de voltar saía do app inteiro, e
   * recarregar sempre caía na visão geral.
   */
  const app = soCodigo(ler('web', 'src', 'App.jsx'));
  assert.match(app, /history\.pushState\(\{ mtRota: r \}/, 'navegar não entra mais no histórico');
  assert.match(app, /addEventListener\('popstate'/, 'ninguém escuta o voltar');
  // Voltar até a entrada do QR não pode reabrir o pareamento de um código já usado.
  assert.match(app, /const \{ parear, \.\.\.resto \} = r;/);
  // Quem limpa parâmetros da URL não pode apagar a rota guardada no histórico:
  // `replaceState({}, …)` fazia o voltar cair na visão geral.
  for (const f of ['ScreensPage.jsx', 'BillingPage.jsx']) {
    const src = soCodigo(ler('web', 'src', 'pages', f));
    assert.ok(!/replaceState\(\{\}/.test(src), f + ' apaga o estado do histórico');
  }
});

test('o passo "publique o primeiro conteúdo" abre a tela pareada', () => {
  // Mandava para Meus Designs: a peça feita ali ainda precisava ser levada até a tela.
  const src = soCodigo(ler('web', 'src', 'components', 'dashboard', 'PrimeirosPassos.jsx'));
  assert.match(src, /destino: primeira \? 'content'/);
  assert.match(src, /onIr\(p\.destino, p\.params\)/, 'o aparelho não chega ao editor');
});

test('a última edição antes de sair da tela não se perde', () => {
  /*
   * O salvamento automático espera 1s, e o temporizador era cancelado quando
   * a página desmontava: editar e voltar logo em seguida perdia a edição em
   * silêncio. Reproduzido no navegador (celular, gesto de voltar).
   */
  const src = soCodigo(ler('web', 'src', 'pages', 'ContentEditorPage.jsx'));
  assert.match(src, /if \(c\) deviceConfig\.save\(device\.id, c\)/, 'desmontar não salva o que estava pendente');
  assert.match(src, /addEventListener\('pagehide'/, 'fechar a aba perde a edição pendente');
  assert.match(src, /keepalive: true/, 'sem keepalive o envio morre junto com a página');
});

test('editor visual no celular: palco em cima, textos da peça como campos', () => {
  /*
   * No celular o palco virava uma miniatura de 100px espremida ao lado do
   * painel, e a barra de ferramentas ocupava cinco linhas. O dono não
   * conseguia trocar um preço do cardápio pelo telefone. Visto no navegador
   * (Pixel 7) antes e depois.
   */
  const src = ler('web', 'src', 'components', 'content', 'CompositionEditor.jsx');
  assert.match(src, /flex min-h-0 flex-1 flex-col md:flex-row/, 'o palco volta a ficar espremido ao lado do painel');
  assert.match(src, /h-\[40vh\][^"]*md:flex-1/);
  assert.match(src, /Textos da peça/);
  assert.match(src, /onChange=\{\(ev\) => patch\(e\.id, \{ text: ev\.target\.value \}, 'texto:' \+ e\.id\)\}/);
  assert.match(src, /<div className="hidden md:contents">/, 'a barra do celular voltou a ter todos os botões');
});

test('apagar e descartar sem querer têm volta', () => {
  /*
   * Remover um conteúdo publica na hora (salvamento automático), "Cancelar"
   * no editor visual jogava a peça fora sem perguntar, e o gesto de voltar
   * do celular saía da página com o editor aberto. Os três vistos no
   * navegador antes e depois.
   */
  const pagina = soCodigo(ler('web', 'src', 'pages', 'ContentEditorPage.jsx'));
  assert.match(pagina, /tom: 'desfazer'[\s\S]{0,120}rotulo: 'Desfazer'/, 'remover sem "Desfazer"');
  assert.match(pagina, /next\.zonas\[zona\]/, 'o desfazer precisa voltar para a zona de origem, não a aberta agora');
  const editor = soCodigo(ler('web', 'src', 'components', 'content', 'CompositionEditor.jsx'));
  assert.match(editor, /onClick=\{cancelar\}>Cancelar/);
  assert.match(editor, /podeDesfazer\(hist\) && !window\.confirm\(/);
  assert.match(editor, /addEventListener\('popstate', aoVoltar\)/, 'voltar com o editor aberto sai da página');
  assert.match(editor, /!vivo\.current && !saiuPeloVoltar\.current/, 'sem esta guarda o StrictMode fecha o editor recém-aberto');
  const avisos = ler('web', 'src', 'lib', 'avisos.js');
  assert.match(avisos, /desfazer: \d{4,}/, 'o aviso de desfazer precisa sumir sozinho, e não rápido demais');
});
