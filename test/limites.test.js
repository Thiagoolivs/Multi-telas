/*
 * Os freios de conta inteira.
 *
 * O teste que manda aqui é o que garante que a TELA NUNCA PARA. Um freio que
 * bloqueia o player derruba a TV de uma recepção por causa de um laço no
 * painel de outra pessoa — punindo quem não fez nada, na parede, na frente dos
 * clientes dele. É um erro pior que o abuso que o freio veio evitar.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const limites = require('../server/limites.js');

const semComentarios = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const SERVER = semComentarios(fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8'));

test.beforeEach(() => limites.zerar());

/* ---------------- O princípio ---------------- */

test('o tráfego da TELA é medido e NUNCA bloqueado', () => {
  const teto = limites.CLASSES.tela.max;
  let bloqueou = false;
  for (let i = 0; i < teto + 200; i++) {
    if (!limites.permitir('tela', 'ten_a').ok) bloqueou = true;
  }
  assert.equal(bloqueou, false, 'o freio derrubou o player — a tela parou');

  // Mas o excesso FICA REGISTRADO: uma TV com defeito de rede pede config
  // quarenta vezes por minuto, e quem opera precisa enxergar isso antes de o
  // cliente ligar reclamando.
  const e = limites.excessosDaConta('ten_a');
  assert.ok(e.tela && e.tela.vezes > 0, 'o excesso do player não foi registrado');
});

test('o tráfego do PAINEL é bloqueado ao passar do teto', () => {
  // Do outro lado do painel há uma pessoa que vê o aviso e pode parar.
  const teto = limites.CLASSES.painel.max;
  for (let i = 0; i < teto; i++) {
    assert.equal(limites.permitir('painel', 'ten_b').ok, true, 'bloqueou antes do teto, em ' + i);
  }
  const v = limites.permitir('painel', 'ten_b');
  assert.equal(v.ok, false, 'o painel passou do teto sem ser freado');
  assert.ok(v.retryAfter > 0, 'não diz quando tentar de novo');
});

test('a classe do tráfego sai de QUEM está autenticado, não da URL', () => {
  /*
   * `/api/devices/:id/config` é chamado pelos dois: pelo painel, para salvar,
   * e pela TV, para ler. Classificar por caminho de URL faria as duas coisas
   * caírem no mesmo balde — e um painel em laço passaria despercebido por
   * estar num orçamento que, de propósito, nunca bloqueia.
   */
  assert.match(SERVER, /function classeDaSessao\(/, 'a classificação voltou a ser por URL');
  assert.ok(!/function classeDaRota\(/.test(SERVER), 'sobrou a classificação por URL');
  assert.match(SERVER, /if \(dtOk\) limites\.permitir\('tela',/,
    'o tráfego do player deixou de ser medido');
});

test('o freio da conta vem ANTES de qualquer rota', () => {
  // Espalhar é como se esquece uma, e a que se esquece é a que alguém encontra.
  const i = SERVER.indexOf('async function handleApi(');
  const bloco = SERVER.slice(i, i + 1600);
  const freio = bloco.indexOf('limites.permitir(classe');
  assert.ok(freio > 0, 'sumiu o freio de conta inteira');
  const primeiraRota = bloco.indexOf("parts[1] === 'auth'");
  assert.ok(primeiraRota < 0 || freio < primeiraRota, 'há rota atendida antes do freio');
});

test('conta sem sessão não é freada por engano', () => {
  // O player não tem sessão; freá-lo por tenant vazio pararia todas as telas.
  assert.equal(limites.permitir('painel', '').ok, true);
  assert.equal(limites.permitir('painel', null).ok, true);
  assert.equal(limites.permitir('classe-que-nao-existe', 'ten_x').ok, true);
});

test('cada conta tem o próprio balde', () => {
  // Sem isto, um cliente em laço frearia todos os outros junto — que é
  // exatamente o estrago que o freio veio evitar, multiplicado.
  const teto = limites.CLASSES.painel.max;
  for (let i = 0; i <= teto; i++) limites.permitir('painel', 'ten_barulhenta');
  assert.equal(limites.permitir('painel', 'ten_barulhenta').ok, false);
  assert.equal(limites.permitir('painel', 'ten_quieta').ok, true, 'uma conta em laço freou as outras');
});

/* ---------------- Conexões ---------------- */

test('uma tela não empilha conexões sem limite', () => {
  /*
   * `subscribers[id]` era um Set sem teto: uma TV com defeito que reabre sem
   * fechar a anterior empilhava sockets até o servidor ficar sem — e levava
   * junto o SSE de TODAS as contas. Não precisa de má intenção.
   */
  for (let i = 0; i < limites.POR_TELA; i++) {
    assert.equal(limites.abrirConexao('tv1', 'ten_c', 5).ok, true, 'recusou antes do teto');
  }
  const v = limites.abrirConexao('tv1', 'ten_c', 5);
  assert.equal(v.ok, false);
  assert.equal(v.motivo, 'tela');
});

test('a conta tem teto próprio, proporcional ao número de telas', () => {
  // Uma conta com 40 telas precisa de mais conexões que uma com 1. Um teto
  // fixo ou travaria a grande ou seria inútil para a pequena.
  assert.ok(limites.tetoDaConta(40) > limites.tetoDaConta(1));
  assert.ok(limites.tetoDaConta(0) >= 20, 'conta sem tela ficou sem folga nenhuma');

  const teto = limites.tetoDaConta(2);
  for (let i = 0; i < teto; i++) {
    // Telas diferentes, para o teto POR TELA não interferir no da conta.
    assert.equal(limites.abrirConexao('tv' + i, 'ten_d', 2).ok, true, 'recusou antes do teto da conta');
  }
  const v = limites.abrirConexao('tvX', 'ten_d', 2);
  assert.equal(v.ok, false);
  assert.equal(v.motivo, 'conta');
});

test('fechar devolve a vaga', () => {
  /*
   * Sem devolver, o teto viraria uma contagem que só sobe — e em algumas horas
   * nenhuma TV conseguiria mais conectar. O remédio teria virado a doença.
   */
  for (let i = 0; i < limites.POR_TELA; i++) limites.abrirConexao('tv2', 'ten_e', 3);
  assert.equal(limites.abrirConexao('tv2', 'ten_e', 3).ok, false);
  limites.fecharConexao('tv2', 'ten_e');
  assert.equal(limites.abrirConexao('tv2', 'ten_e', 3).ok, true, 'a vaga não voltou');
});

test('fechar duas vezes não faz o contador virar negativo', () => {
  // O `close` do socket dispara mais de uma vez em alguns casos, e um contador
  // negativo faria o teto deixar de existir.
  limites.abrirConexao('tv3', 'ten_f', 1);
  limites.fecharConexao('tv3', 'ten_f');
  limites.fecharConexao('tv3', 'ten_f');
  limites.fecharConexao('tv3', 'ten_f');
  assert.equal(limites.panorama().conexoes.total, 0);
  assert.equal(limites.conexoesDaConta('ten_f'), 0);
});

test('o SSE devolve a vaga quando o cliente some', () => {
  const i = SERVER.indexOf("sub === 'events'");
  assert.ok(i > 0, 'sumiu a rota do SSE');
  const bloco = SERVER.slice(i, i + 2200);
  assert.match(bloco, /limites\.abrirConexao\(/, 'o SSE voltou a aceitar conexão sem teto');
  assert.match(bloco, /limites\.fecharConexao\(/, 'o SSE deixou de devolver a vaga');
  // A vaga é pedida ANTES de o cabeçalho sair: depois do writeHead não dá mais
  // para responder 503, e a conexão entraria de qualquer jeito.
  assert.ok(bloco.indexOf('limites.abrirConexao(') < bloco.indexOf('res.writeHead(200'),
    'a vaga é pedida depois de a resposta já ter começado');
});

/* ---------------- A supervisão ---------------- */

test('o panorama mostra quem está esbarrando', () => {
  // Freio sem medidor é freio que ninguém sabe se está pegando — e o primeiro
  // sinal seria um cliente ligando para dizer que o painel dele "dá erro".
  const teto = limites.CLASSES.painel.max;
  for (let i = 0; i <= teto; i++) limites.permitir('painel', 'ten_g');
  const p = limites.panorama();
  const alvo = p.excessos.find((e) => e.tenantId === 'ten_g');
  assert.ok(alvo, 'a conta que estourou não aparece no panorama');
  assert.ok(alvo.total > 0);
  assert.ok(p.tetos.painel, 'o panorama não diz quais são os tetos');
});

test('a supervisão por conta existe e é do operador', () => {
  /*
   * Havia só "maiores contas", ordenada por telas: diz quem é grande e não diz
   * quem está com problema. As rotas ficam DENTRO do bloco da plataforma, que
   * é onde mora a única checagem de operador — fora dele, a ficha de qualquer
   * cliente ficaria aberta.
   */
  const i = SERVER.indexOf("parts[1] === 'plataforma'");
  const fim = SERVER.indexOf("return sendJson(res, 404, { error: 'rota da plataforma não encontrada' });");
  assert.ok(i > 0 && fim > i, 'sumiu o bloco da plataforma');
  const bloco = SERVER.slice(i, fim);

  for (const rota of ["parts[2] === 'contas'", "parts[2] === 'limites'"]) {
    assert.ok(bloco.includes(rota), 'a rota ' + rota + ' não está dentro da porta do operador');
  }
  const porta = bloco.indexOf('const quem = await operadores.permissao(db, sess);');
  assert.ok(porta >= 0 && porta < bloco.indexOf("parts[2] === 'contas'"),
    'a supervisão por conta vem antes da checagem de operador');
});
