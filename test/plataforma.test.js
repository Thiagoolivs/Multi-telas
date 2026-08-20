/*
 * O painel de quem opera a PLATAFORMA.
 *
 * Tudo aqui enxerga TODAS as contas — é a única parte do sistema que atravessa
 * a fronteira do tenant de propósito. Por isso a maior parte destes testes é
 * sobre a porta, não sobre os números: um número errado é um número errado, e
 * uma porta errada é o vazamento de todos os clientes de uma vez.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const operadores = require('../server/operadores.js');
const metricas = require('../server/metricas.js');
const db = require('../server/db-sqlite.js');

const semComentarios = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const ler = (...p) => semComentarios(fs.readFileSync(path.join(__dirname, '..', ...p), 'utf8'));
const SERVER = ler('server.js');
const SIDEBAR = ler('web', 'src', 'components', 'layout', 'Sidebar.jsx');

const comAmbiente = async (valor, fn) => {
  const antes = process.env.ADMIN_EMAILS;
  if (valor === undefined) delete process.env.ADMIN_EMAILS; else process.env.ADMIN_EMAILS = valor;
  try { return await fn(); } finally {
    if (antes === undefined) delete process.env.ADMIN_EMAILS; else process.env.ADMIN_EMAILS = antes;
  }
};

/* ---------------- A porta ---------------- */

test('sem ADMIN_EMAILS, o painel da plataforma NÃO existe', async () => {
  /*
   * A alternativa tentadora — "sem configuração, o dono da primeira conta vira
   * operador" — transformaria uma instalação recém-subida numa porta aberta:
   * quem se cadastrasse primeiro veria os dados de todo mundo depois.
   */
  await comAmbiente('', async () => {
    assert.equal(operadores.configurado(), false);
    assert.equal(operadores.ehRaiz('qualquer@um.com'), false);
    const p = await operadores.permissao(db, { email: 'qualquer@um.com' });
    assert.equal(p.pode, false);
  });
});

test('a raiz é a variável de ambiente, e só ela', async () => {
  await comAmbiente('chefe@mt.com, socia@mt.com', async () => {
    assert.equal(operadores.ehRaiz('chefe@mt.com'), true);
    assert.equal(operadores.ehRaiz('CHEFE@MT.COM'), true, 'a comparação virou sensível a maiúscula');
    assert.equal(operadores.ehRaiz(' socia@mt.com '), true, 'espaço em volta derrubou o reconhecimento');
    assert.equal(operadores.ehRaiz('outro@mt.com'), false);
    assert.equal(operadores.ehRaiz(''), false);
    assert.equal(operadores.ehRaiz(null), false);
  });
});

test('lixo na variável não vira operador', async () => {
  // "true", "*", "todos" — coisas que alguém escreve achando que liga tudo.
  await comAmbiente('true, *, todos, admin', async () => {
    assert.deepEqual(operadores.listaDoAmbiente(), [], 'entrou algo sem @ na lista de operadores');
    assert.equal(operadores.configurado(), false);
  });
});

test('quem foi convidado é operador, mas não vira raiz', async () => {
  await comAmbiente('chefe@mt.com', async () => {
    await db.addOperador('ajudante@mt.com', 'Ajudante', 'chefe@mt.com');
    try {
      assert.equal(await operadores.ehOperador(db, 'ajudante@mt.com'), true);
      const p = await operadores.permissao(db, { email: 'ajudante@mt.com' });
      assert.equal(p.pode, true);
      // A distinção é o que impede um convite errado de se multiplicar sozinho.
      assert.equal(p.raiz, false, 'um convidado virou raiz e passa a poder convidar');
    } finally { await db.removerOperador('ajudante@mt.com'); }
  });
});

test('sessão sem e-mail não é operador', async () => {
  await comAmbiente('chefe@mt.com', async () => {
    assert.equal((await operadores.permissao(db, null)).pode, false);
    assert.equal((await operadores.permissao(db, {})).pode, false);
    assert.equal((await operadores.permissao(db, { email: '' })).pode, false);
  });
});

test('a checagem é UMA, no topo da rota, antes de qualquer leitura', () => {
  const i = SERVER.indexOf("parts[1] === 'plataforma'");
  assert.ok(i > 0, 'sumiu a rota da plataforma');
  const bloco = SERVER.slice(i, i + 3600);

  const porta = bloco.indexOf('const quem = await operadores.permissao(db, sess);');
  assert.ok(porta > 0, 'a rota da plataforma deixou de perguntar quem é');
  assert.match(bloco.slice(porta, porta + 200), /if \(!quem\.pode\) return sendJson\(res, 404/,
    'a recusa deixou de acontecer logo depois da checagem');

  // Nenhuma leitura de banco pode acontecer ANTES da porta. Espalhar a
  // checagem por rota é como se esquece uma.
  const primeiraLeitura = bloco.indexOf('await db.');
  assert.ok(primeiraLeitura > porta,
    'há leitura de banco antes da checagem de operador');
});

test('para quem não é operador, a rota responde 404 — não 403', () => {
  // 403 confirmaria que o painel existe e que a pessoa achou o endereço certo.
  // 404 não conta nada a quem estava tentando.
  const i = SERVER.indexOf("parts[1] === 'plataforma'");
  const bloco = SERVER.slice(i, i + 1200);
  assert.match(bloco, /if \(!quem\.pode\) return sendJson\(res, 404, \{ error: 'rota não encontrada' \}\);/);
});

test('ver a lista de operadores é de todos; MEXER é só da raiz', () => {
  const i = SERVER.indexOf("parts[2] === 'operadores'");
  assert.ok(i > 0, 'sumiu a rota de operadores');
  const bloco = SERVER.slice(i, i + 1200);
  const guarda = bloco.indexOf("if (!quem.raiz) return sendJson(res, 403");
  assert.ok(guarda > 0, 'qualquer operador voltou a poder dar acesso');
  // A guarda tem que vir ANTES do POST e do DELETE, e depois do GET.
  assert.ok(bloco.indexOf("req.method === 'GET'") < guarda, 'ver a lista virou privilégio da raiz');
  assert.ok(bloco.indexOf("req.method === 'POST'") > guarda, 'convidar deixou de exigir a raiz');
  assert.ok(bloco.indexOf("req.method === 'DELETE'") > guarda, 'tirar acesso deixou de exigir a raiz');
});

test('o menu escondido é aparência — a rota é a porta', () => {
  assert.match(SIDEBAR, /operador: true/, 'a seção da plataforma deixou de ser condicional');
  assert.match(SIDEBAR, /\.filter\(\(s\) => !s\.operador \|\| operador\)/, 'a seção aparece para todo mundo');
  // E o servidor continua perguntando: esconder sem fechar seria fachada.
  assert.match(SERVER, /const quem = await operadores\.permissao\(db, sess\);/);
});

/* ---------------- As contas ---------------- */

test('sessão é o intervalo entre ações da mesma pessoa', () => {
  const min = 60000;
  const t0 = 1700000000000;
  const r = metricas.sessoesDe([
    { userId: 'a', em: t0 },
    { userId: 'a', em: t0 + 10 * min },
    { userId: 'a', em: t0 + 20 * min },
  ]);
  assert.equal(r.sessoes, 1);
  assert.equal(r.totalMinutos, 20);
});

test('um intervalo grande QUEBRA a sessão', () => {
  // Sem o corte, alguém que entrou de manhã e de novo à tarde apareceria como
  // uma sessão de oito horas — e o número inteiro viraria ficção.
  const min = 60000;
  const t0 = 1700000000000;
  const r = metricas.sessoesDe([
    { userId: 'a', em: t0 },
    { userId: 'a', em: t0 + 10 * min },
    { userId: 'a', em: t0 + 400 * min },
    { userId: 'a', em: t0 + 405 * min },
  ]);
  assert.equal(r.sessoes, 2);
  assert.equal(r.totalMinutos, 15, 'o buraco entre as sessões entrou na conta');
});

test('sessão de uma ação só dura zero', () => {
  // E é isso mesmo: quem abriu, clicou uma vez e saiu não passou tempo
  // nenhum trabalhando. Inventar um mínimo aqui seria inventar uso.
  const r = metricas.sessoesDe([{ userId: 'a', em: 1700000000000 }]);
  assert.equal(r.sessoes, 1);
  assert.equal(r.totalMinutos, 0);
});

test('pessoas diferentes não se misturam numa sessão', () => {
  const min = 60000;
  const t0 = 1700000000000;
  const r = metricas.sessoesDe([
    { userId: 'a', em: t0 }, { userId: 'b', em: t0 + min },
    { userId: 'a', em: t0 + 2 * min }, { userId: 'b', em: t0 + 3 * min },
  ]);
  assert.equal(r.pessoas, 2);
  assert.equal(r.sessoes, 2, 'as ações de duas pessoas viraram uma sessão só');
  assert.equal(r.totalMinutos, 4, 'a duração cruzou pessoas: ' + r.totalMinutos);
});

test('evento sem usuário é ignorado', () => {
  const r = metricas.sessoesDe([{ userId: '', em: 1 }, { userId: null, em: 2 }, {}]);
  assert.equal(r.sessoes, 0);
  assert.equal(r.pessoas, 0);
});

test('a média por sessão é o que diz se o produto é usado ou só visitado', () => {
  const min = 60000;
  const t0 = 1700000000000;
  /*
   * Uma sessão longa é feita de ações SEGUIDAS: um evento a cada 20 minutos
   * durante uma hora. Dois eventos separados por 60 minutos não são uma
   * sessão de uma hora — são duas sessões de zero, porque o corte é 30 min.
   * (A primeira versão deste teste errava exatamente isso.)
   */
  const seguidas = (u) => [0, 20, 40, 60].map((m) => ({ userId: u, em: t0 + m * min }));
  const longo = metricas.sessoesDe([...seguidas('a'), ...seguidas('b')]);
  assert.equal(longo.sessoes, 2);
  assert.equal(longo.mediaMinutos, 60);
  // Mesmo total de horas, mas em vinte visitas curtas — outra coisa
  // completamente diferente, e o número precisa distinguir as duas.
  const curto = metricas.sessoesDe(
    Array.from({ length: 20 }, (_, i) => [
      { userId: 'u' + i, em: t0 }, { userId: 'u' + i, em: t0 + 6 * min },
    ]).flat());
  assert.equal(curto.sessoes, 20);
  assert.equal(curto.mediaMinutos, 6);
  assert.equal(curto.totalMinutos, 120, 'o total deveria ser o mesmo das duas sessões longas');
});

test('as funções vêm com nome legível e participação', () => {
  const f = metricas.funcoesMaisUsadas([
    { acao: 'peca.salvar', n: 60 },
    { acao: 'ia.imagem', n: 40 },
  ]);
  assert.equal(f[0].nome, 'Salvar design', 'a ação apareceria como código cru na tela');
  assert.equal(f[0].parte, 60);
  assert.equal(f[1].parte, 40);
});

test('ação sem tradução aparece com o próprio nome', () => {
  // Melhor mostrar um código cru do que ESCONDER uma função nova só porque
  // ninguém traduziu — some da lista é pior do que aparecer feio.
  const f = metricas.funcoesMaisUsadas([{ acao: 'coisa.nova', n: 3 }]);
  assert.equal(f.length, 1);
  assert.equal(f[0].nome, 'coisa.nova');
});

test('lista vazia não divide por zero', () => {
  assert.deepEqual(metricas.funcoesMaisUsadas([]), []);
  assert.deepEqual(metricas.funcoesMaisUsadas(null), []);
});

/* ---------------- Instrumentação e privacidade ---------------- */

test('o evento guarda a AÇÃO, nunca o conteúdo', () => {
  // Para saber que o editor é usado não é preciso guardar o que foi escrito
  // nele. A tabela não tem onde caber conteúdo, e é de propósito.
  const SQL = ler('server', 'db-sqlite.js');
  const i = SQL.indexOf('CREATE TABLE IF NOT EXISTS eventos');
  const bloco = SQL.slice(i, i + 220);
  assert.match(bloco, /id TEXT PRIMARY KEY, tenant_id TEXT, user_id TEXT, acao TEXT, created_at INTEGER/);
  assert.ok(!/texto|conteudo|payload|dados/i.test(bloco), 'a tabela de eventos ganhou onde guardar conteúdo');
});

test('eventos velhos saem sozinhos', () => {
  // Guardar mais que a janela do painel seria acumular rastro de uso de gente
  // que não ganha nada com isso.
  assert.match(SERVER, /const NOVENTA_DIAS = 90 \* 24 \* 60 \* 60 \* 1000;/, 'sumiu a retenção');
  assert.match(SERVER, /db\.limparEventos\(Date\.now\(\) - NOVENTA_DIAS\)/, 'a limpeza deixou de rodar');
});

test('chamada recusada pelo limite não conta como uso', () => {
  // Contá-la inflaria a métrica justamente de quem está esbarrando no teto.
  const i = SERVER.indexOf("parts[2] === 'director'");
  const bloco = SERVER.slice(i, i + 1200);
  const limite = bloco.indexOf('rateLimit(');
  const evento = bloco.indexOf("registrarEvento(sess.tenant_id, sess.user_id, 'ia.campanha')");
  assert.ok(limite > 0 && evento > limite, 'o evento voltou a ser gravado antes do limite');
});

test('a lista de maiores contas não carrega nada de dentro delas', () => {
  // Operar a plataforma não é motivo para ler a peça que o cliente desenhou.
  const SQL = ler('server', 'db-sqlite.js');
  const i = SQL.indexOf('maiores: db.prepare(');
  const bloco = SQL.slice(i, i + 500);
  assert.ok(!/library|media|item|texto/i.test(bloco.replace(/FROM devices|FROM users|FROM tenants/g, '')),
    'a consulta de maiores contas passou a ler conteúdo do cliente');
});
