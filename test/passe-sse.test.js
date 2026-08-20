/*
 * As duas sobras de segurança: o token na URL do SSE, e o SVG.
 *
 * TOKEN NA URL. O token da TV não expira, e ele vinha em `/events?dt=<token>`.
 * Endereço vai parar em log de acesso, log de proxy, painel do provedor de
 * nuvem e histórico de console — lugares onde ninguém pensa que há segredo.
 * Quem lesse qualquer um deles lia a config da tela e recebia os eventos dela
 * PARA SEMPRE.
 *
 * SVG. É código servido do nosso domínio. O CSP global já barrava script
 * inline (conferi no navegador), mas isso é UMA camada, e ela é global: no dia
 * em que alguém precisar de 'unsafe-inline' para um widget, o buraco reabre
 * calado, num lugar que ninguém vai ligar ao upload de imagem.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const passes = require('../server/passes.js');
const storage = require('../server/storage.js');

const semComentarios = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const ler = (...p) => semComentarios(fs.readFileSync(path.join(__dirname, '..', ...p), 'utf8'));
const SERVER = ler('server.js');
const CLOUD = ler('js', 'cloud.js');

/* ---------------- O passe ---------------- */

test('o passe serve UMA vez', () => {
  // É o ponto inteiro: um log vazado passa a conter um segredo já gasto.
  passes._limpar();
  const { passe } = passes.emitir('dev_1');
  assert.equal(passes.gastar(passe, 'dev_1'), true);
  assert.equal(passes.gastar(passe, 'dev_1'), false, 'o mesmo passe abriu duas vezes');
});

test('o passe é da tela que pediu, e só dela', () => {
  passes._limpar();
  const { passe } = passes.emitir('dev_1');
  assert.equal(passes.gastar(passe, 'dev_2'), false, 'o passe de uma tela abriu outra');
});

test('passe apresentado à tela errada não vale mais para a certa', () => {
  /*
   * Apagar ANTES de conferir o device é de propósito. Se a tentativa errada
   * não gastasse o passe, quem o encontrasse num log poderia varrer ids de
   * tela até acertar — o passe único viraria passe de mil tentativas.
   */
  passes._limpar();
  const { passe } = passes.emitir('dev_1');
  passes.gastar(passe, 'dev_errada');
  assert.equal(passes.gastar(passe, 'dev_1'), false, 'a tentativa errada não gastou o passe');
});

test('passe inventado não abre nada', () => {
  passes._limpar();
  assert.equal(passes.gastar('nao-existe', 'dev_1'), false);
  assert.equal(passes.gastar('', 'dev_1'), false);
  assert.equal(passes.gastar(null, 'dev_1'), false);
  assert.equal(passes.gastar(undefined, 'dev_1'), false);
});

test('o passe vence', () => {
  passes._limpar();
  const { passe, expiraEm } = passes.emitir('dev_1');
  assert.ok(expiraEm > 0 && expiraEm <= 5 * 60 * 1000, 'a vida do passe saiu do razoável: ' + expiraEm);
  // Sem esperar de verdade: envelhece o relógio.
  const antes = Date.now;
  Date.now = () => antes() + passes.VIDA_MS + 1000;
  try {
    assert.equal(passes.gastar(passe, 'dev_1'), false, 'um passe vencido continuou valendo');
  } finally { Date.now = antes; }
});

test('os passes não se acumulam sem limite', () => {
  /*
   * Autenticação impede o estranho, não impede o excesso: quem tem um token
   * válido poderia pedir passes em laço até encher a memória do servidor.
   */
  passes._limpar();
  for (let i = 0; i < passes.TETO + 50; i++) passes.emitir('dev_' + i);
  assert.ok(passes._estado().vivos <= passes.TETO,
    'passaram do teto: ' + passes._estado().vivos + ' vivos');
  assert.equal(passes.emitir('dev_x'), null, 'continuou emitindo depois do teto');
});

test('dois passes nunca são iguais', () => {
  passes._limpar();
  const vistos = new Set();
  for (let i = 0; i < 500; i++) vistos.add(passes.emitir('dev_1').passe);
  assert.equal(vistos.size, 500, 'houve passe repetido');
  // E longo o bastante para não ser adivinhado.
  assert.ok([...vistos][0].length >= 24, 'o passe ficou curto demais');
});

/* ---------------- A rota ---------------- */

test('`?dt=` NÃO é mais aceito', () => {
  // É o buraco que este passo fecha: o token eterno na URL.
  assert.match(SERVER, /const provided = req\.headers\['x-device-token'\];/,
    'o token voltou a ser aceito por outro caminho além do cabeçalho');
  assert.ok(!/req\.headers\['x-device-token'\] \|\| query\.dt/.test(SERVER),
    'voltou a aceitar o token na query string');
});

test('o SSE exige passe (ou cabeçalho), nunca token na URL', () => {
  const i = SERVER.indexOf("sub === 'events'");
  assert.ok(i > 0, 'sumiu a rota do SSE');
  const bloco = SERVER.slice(i, i + 400);
  assert.match(bloco, /if \(!dtOk && !passes\.gastar\(query\.passe, id\)\)/,
    'o SSE deixou de exigir passe');
  assert.match(bloco, /return sendJson\(res, 403/, 'a recusa sumiu');
});

test('a troca do token pelo passe é POST, e exige o cabeçalho', () => {
  // POST justamente para o segredo ir fora da URL — que é o problema que o
  // passe existe para resolver.
  const i = SERVER.indexOf("sub === 'passe'");
  assert.ok(i > 0, 'sumiu a rota que emite o passe');
  const bloco = SERVER.slice(i - 60, i + 300);
  assert.match(bloco, /req\.method === 'POST'/, 'a emissão do passe virou GET');
  assert.match(bloco, /if \(!dtOk\) return sendJson\(res, 403/, 'o passe passou a ser emitido sem token');
});

test('o player pede o passe antes de abrir o stream', () => {
  assert.match(CLOUD, /'\/api\/devices\/' \+ id \+ '\/passe', null, dtHeader\(\)/,
    'o player deixou de trocar o token pelo passe');
  assert.match(CLOUD, /events\?passe=' \+ encodeURIComponent\(passe\)/,
    'o player voltou a mandar outra coisa na URL do SSE');
  assert.ok(!/events\?dt=/.test(CLOUD), 'o token voltou para a URL do player');
});

test('sem passe, o player espera e tenta de novo — não abre stream sem nada', () => {
  // Rede caída ou servidor reiniciando não podem virar EventSource aberto sem
  // credencial: seria um 403 imediato e o EventSource desiste de vez.
  assert.match(CLOUD, /if \(!passe\) \{ setTimeout\(connect, 15000\); return; \}/,
    'o player abre o stream mesmo sem passe');
});

/* ---------------- O SVG ---------------- */

test('SVG sai com CSP próprio e como anexo', () => {
  /*
   * `sandbox` desliga script e joga a resposta numa origem própria;
   * `default-src none` corta qualquer busca de fora, inclusive o beacon
   * (<image href="https://atacante/">); `attachment` faz a navegação DIRETA
   * baixar em vez de abrir.
   */
  const h = storage.extrasDeSeguranca('image/svg+xml', 'ten_x/logo.svg');
  assert.match(h['Content-Security-Policy'], /sandbox/);
  assert.match(h['Content-Security-Policy'], /default-src 'none'/);
  assert.match(h['Content-Disposition'], /^attachment/);
});

test('o resto da mídia não vira anexo', () => {
  // <img>, <video> e o PDF no iframe continuam como estavam: o remédio é para
  // o que é perigoso COMO DOCUMENTO, e um PNG não é.
  for (const m of ['image/png', 'image/jpeg', 'image/gif', 'video/mp4', 'application/pdf']) {
    assert.deepEqual(storage.extrasDeSeguranca(m, 'ten_x/a'), {}, m + ' virou anexo');
  }
});

test('o nome do arquivo no anexo é limpo', () => {
  // O nome vai dentro de um cabeçalho entre aspas: uma aspa ou uma quebra de
  // linha ali é injeção de cabeçalho.
  const h = storage.extrasDeSeguranca('image/svg+xml', 'ten_x/a"b\r\nX-Coisa: 1.svg');
  // As aspas de fora são o delimitador do próprio cabeçalho; o que não pode
  // haver é aspa ou quebra de linha DENTRO do nome.
  const nome = h['Content-Disposition'].match(/filename="([^"]*)"/);
  assert.ok(nome, 'o cabeçalho perdeu o formato: ' + h['Content-Disposition']);
  assert.ok(!/["\r\n]/.test(nome[1]), 'passou aspa ou quebra de linha: ' + nome[1]);
  assert.equal(h['Content-Disposition'].split('\n').length, 1, 'o cabeçalho ganhou uma linha nova');
});

test('os extras entram por setHeader, não por writeHead', () => {
  /*
   * O CSP global é posto com setHeader antes de qualquer rota. Passar um CSP
   * diferente em writeHead NÃO substitui o que já está lá — o valor antigo
   * continua valendo e o conserto vira decoração.
   *
   * Foi o que aconteceu na primeira tentativa: o código parecia certo, o
   * cabeçalho não mudava, e só olhando a resposta de verdade deu para saber.
   */
  const S = ler('server', 'storage.js');
  assert.match(S, /function aplicarExtras\(res, mime, key\) \{[\s\S]{0,200}res\.setHeader\(k, extras\[k\]\)/,
    'os extras deixaram de ser aplicados por setHeader');
  /*
   * A primeira versão desta checagem varria 200 caracteres depois do
   * `writeHead` e esbarrava no `module.exports` — acusava o código certo. O
   * que importa é a MESMA CHAMADA, então a conferência é por instrução.
   */
  const chamadas = S.split(/\n/).join(' ').match(/res\.writeHead\([^;]*;/g) || [];
  assert.ok(chamadas.length >= 2, 'sumiram as respostas de mídia: ' + chamadas.length);
  for (const c of chamadas) {
    assert.ok(!/extrasDeSeguranca/.test(c),
      'os extras voltaram para dentro do writeHead, onde não têm efeito: ' + c.slice(0, 90));
  }
});
