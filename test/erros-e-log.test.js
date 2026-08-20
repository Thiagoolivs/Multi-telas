/*
 * Log estruturado e coletor de erros.
 *
 * Dois testes aqui valem mais que os outros, e é por eles que o arquivo
 * existe:
 *
 *   — o log não pode vazar dado pessoal nem segredo. Log vive anos, vai para
 *     backup e é lido por quem der suporte. Um token num log é um token
 *     vazado, e um e-mail num log é dado pessoal fora do controle do titular.
 *   — o agrupamento tem que agrupar. Sem isso a lista de erros do painel vira
 *     entulho e o operador para de olhar — que é o mesmo que não ter coletor.
 */
const test = require('node:test');
const assert = require('node:assert');

const { log, mascararEmail, limpar: limparDados, ehSegredo } = require('../server/log.js');
const erros = require('../server/erros.js');

/* Captura o que sai no console, para poder afirmar o que NÃO sai. */
function capturar(fn) {
  const linhas = [];
  const orig = { log: console.log, warn: console.warn, error: console.error };
  const pega = (...a) => linhas.push(a.join(' '));
  console.log = pega; console.warn = pega; console.error = pega;
  const antes = process.env.LOG_FORMATO;
  process.env.LOG_FORMATO = 'json';
  try { fn(); } finally {
    Object.assign(console, orig);
    if (antes === undefined) delete process.env.LOG_FORMATO; else process.env.LOG_FORMATO = antes;
  }
  return linhas;
}

/* ---------------- Log ---------------- */

test('o log sai em JSON de uma linha só', () => {
  const [linha] = capturar(() => log.info('teste', { a: 1 }));
  assert.ok(!linha.includes('\n'), 'log de várias linhas quebra o parser da plataforma');
  const o = JSON.parse(linha);
  assert.equal(o.evento, 'teste');
  assert.equal(o.nivel, 'info');
  assert.equal(o.a, 1);
  assert.ok(o.t, 'sem horário não dá para correlacionar nada');
});

test('segredo nenhum sai no log', () => {
  const [linha] = capturar(() => log.info('login', {
    senha: 'batata123',
    deviceToken: 'dt_abc',
    STRIPE_SECRET_KEY: 'sk_live_1',
    authorization: 'Bearer x',
    aninhado: { refresh_token: 'r1' },
    rota: '/api/login',
  }));
  for (const vazado of ['batata123', 'dt_abc', 'sk_live_1', 'Bearer x', 'r1']) {
    assert.ok(!linha.includes(vazado), 'vazou ' + vazado + ' no log');
  }
  // O que NÃO é segredo continua saindo — log que esconde tudo não serve.
  assert.ok(linha.includes('/api/login'));
});

test('e-mail sai mascarado, não inteiro', () => {
  assert.equal(mascararEmail('thiago.olivs@gmail.com'), 'th***@gmail.com');
  const [linha] = capturar(() => log.info('conta', { email: 'fulano@empresa.com.br' }));
  assert.ok(!linha.includes('fulano@'), 'e-mail inteiro no log é dado pessoal solto');
  assert.ok(linha.includes('@empresa.com.br'), 'o domínio ajuda o suporte e não identifica ninguém');
});

test('a máscara pega o nome do campo por pedaço, não por nome exato', () => {
  // Quem inventar o próximo nome de campo não vai lembrar de vir aqui.
  for (const n of ['token', 'deviceToken', 'refresh_token', 'TOKEN_DA_TELA', 'minhaChaveSecreta']) {
    assert.ok(ehSegredo(n), n + ' passou como se não fosse segredo');
  }
  assert.ok(!ehSegredo('rota'));
  assert.ok(!ehSegredo('tenantId'));
});

test('objeto fundo demais não vira laço infinito', () => {
  const fundo = { a: { b: { c: { d: { e: { f: 'fim' } } } } } };
  assert.doesNotThrow(() => JSON.stringify(limparDados(fundo, 0)));
});

test('o erro carrega a pilha, não só a mensagem', () => {
  const [linha] = capturar(() => log.erro('quebrou', new TypeError('sem pilha não dá'), { rota: '/x' }));
  const o = JSON.parse(linha);
  assert.equal(o.tipo, 'TypeError');
  assert.ok(o.pilha && o.pilha.includes('erros-e-log.test.js'), 'a pilha não aponta para onde quebrou');
  assert.ok(!o.pilha.includes('node:internal'), 'ruído do Node empurra a linha útil para fora');
});

/* ---------------- Agrupamento ---------------- */

test('o mesmo defeito conta junto em vez de encher a lista', () => {
  erros.limpar();
  const boom = () => { throw new Error('deu ruim'); };
  for (let i = 0; i < 5; i++) {
    try { boom(); } catch (e) { capturar(() => erros.registrar(e, { rota: '/api/x' })); }
  }
  const lista = erros.listar();
  assert.equal(lista.length, 1, 'cinco vezes o mesmo erro viraram cinco linhas');
  assert.equal(lista[0].vezes, 5);
  assert.equal(erros.resumo().total, 5);
});

test('id na mensagem não multiplica o grupo', () => {
  /*
   * "conta 8f2a não existe" e "conta b71c não existe" são o MESMO defeito.
   * Sem normalizar, mil contas viravam mil grupos — o entulho que agrupar
   * veio evitar.
   */
  erros.limpar();
  // Do MESMO ponto do código, que é como acontece de verdade: uma linha que
  // levanta o erro para cada conta que passa por ela.
  const semDono = (id) => { throw new Error('conta ' + id + ' não existe'); };
  capturar(() => {
    for (const id of ['8f2a1b3c4d', 'b71cff0912', 'aa00bb11cc']) {
      try { semDono(id); } catch (e) { erros.registrar(e, {}); }
    }
  });
  const lista = erros.listar();
  assert.equal(lista.length, 1, 'o id na mensagem multiplicou o grupo');
  assert.equal(lista[0].vezes, 3);
});

test('defeitos diferentes continuam separados', () => {
  // O contrário do teste acima: normalizar demais é tão ruim quanto de menos.
  erros.limpar();
  capturar(() => {
    erros.registrar(new TypeError('x is undefined'), {});
    erros.registrar(new RangeError('x is undefined'), {});
    erros.registrar(new Error('outra coisa'), {});
  });
  assert.equal(erros.listar().length, 3);
});

test('a origem é o nosso código, não as entranhas do Node', () => {
  erros.limpar();
  /*
   * Precisa ser um erro cuja pilha comece DENTRO do Node — senão o teste passa
   * sozinho e não guarda nada. `JSON.parse` não serve: o V8 não põe quadro
   * próprio, e a primeira linha já é a de quem chamou. Ler arquivo que não
   * existe serve: a pilha abre com node:internal/fs.
   */
  let e;
  try { require('node:fs').readFileSync('/nao/existe/mesmo.txt'); } catch (err) { e = err; }
  assert.match(String(e.stack).split('\n')[1], /\bnode:/, 'o erro escolhido não vem de dentro do Node');
  capturar(() => erros.registrar(e, {}));
  const g = erros.listar()[0];
  assert.ok(g.origem.includes('erros-e-log.test.js'), 'a origem apontou para dentro do Node: ' + g.origem);
});

test('quadro do próprio Node nunca vira a origem', () => {
  /*
   * Testado direto em `origem`, com pilha montada à mão, porque não dá para
   * produzir de propósito um erro cuja pilha traga `node:` COM extensão .js —
   * e era exatamente esse formato que passava pelo filtro antigo, que só
   * olhava `node:internal`.
   *
   * Por que importa: se a origem cai num arquivo do Node, defeitos sem nada em
   * comum que passam pelo mesmo módulo viram um grupo só, e o grupo não aponta
   * para lugar nenhum onde dê para mexer.
   */
  const comQuadroDoNode = (pilha) => {
    const e = new Error('x');
    e.stack = 'Error: x\n' + pilha.map((l) => '    at ' + l).join('\n');
    return erros.origem(e);
  };

  assert.equal(
    comQuadroDoNode(['Object.<anonymous> (node:internal/modules/cjs/loader.js:1:5)', 'f (/app/server/db.js:10:3)']),
    'server/db.js:10'
  );
  assert.equal(
    comQuadroDoNode(['readFileSync (node:fs.js:444:35)', 'f (/app/server/midia.js:88:7)']),
    'server/midia.js:88'
  );
  assert.equal(
    comQuadroDoNode(['Client.query (/app/node_modules/pg/lib/client.js:5:1)', 'f (/app/server/db-postgres.js:20:9)']),
    'server/db-postgres.js:20'
  );
});

test('o coletor guarda onde aconteceu, e só isso', () => {
  erros.limpar();
  capturar(() => erros.registrar(new Error('x'), { rota: '/api/telas', metodo: 'POST', tenant: 't1' }));
  const g = erros.listar()[0];
  assert.equal(g.exemplos.length, 1);
  assert.equal(g.exemplos[0].rota, '/api/telas');
  assert.ok(g.exemplos[0].em > 0);
});

test('erro que se repete não estoura a memória', () => {
  /*
   * Um defeito que dispara por requisição gera milhares de ocorrências. O que
   * cresce é o contador, não a lista: sem teto de exemplos e de grupos, o
   * coletor derrubaria o servidor que veio ajudar a manter de pé.
   */
  erros.limpar();
  capturar(() => {
    for (let i = 0; i < 500; i++) erros.registrar(new Error('sempre igual'), { rota: '/x' });
    /*
     * As assinaturas precisam ser MESMO distintas. A primeira versão deste
     * teste variava por número — que o normalizador troca por '#' — e as 200
     * "diferentes" viravam três. O teste passava com teto nenhum.
     */
    for (let i = 0; i < 200; i++) erros.registrar(new Error('defeito ' + 'x'.repeat(i + 1)), {});
  });
  const lista = erros.listar();
  assert.ok(lista.length <= 50, 'passou do teto de grupos: ' + lista.length);
  for (const g of lista) assert.ok(g.exemplos.length <= 3, 'passou do teto de exemplos');
});

test('sem ALERTA_WEBHOOK_URL nada sai para a internet', () => {
  /*
   * Instalação nova não deve tentar falar com fora sem alguém ter pedido.
   * O teste é indireto — se houvesse chamada, `fetch` seria tocado.
   */
  erros.limpar();
  const antes = process.env.ALERTA_WEBHOOK_URL;
  delete process.env.ALERTA_WEBHOOK_URL;
  const origFetch = globalThis.fetch;
  let chamou = false;
  globalThis.fetch = () => { chamou = true; return Promise.resolve({ ok: true }); };
  try {
    capturar(() => erros.registrar(new Error('novo'), {}));
  } finally {
    globalThis.fetch = origFetch;
    if (antes !== undefined) process.env.ALERTA_WEBHOOK_URL = antes;
  }
  assert.equal(chamou, false, 'alertou sem webhook configurado');
});

test('o alerta sai uma vez por defeito, não uma por ocorrência', async () => {
  erros.limpar();
  const antes = process.env.ALERTA_WEBHOOK_URL;
  process.env.ALERTA_WEBHOOK_URL = 'https://exemplo.invalido/hook';
  const origFetch = globalThis.fetch;
  let chamadas = 0;
  globalThis.fetch = () => { chamadas++; return Promise.resolve({ ok: true, finally: (f) => { f(); } }); };
  try {
    capturar(() => { for (let i = 0; i < 20; i++) erros.registrar(new Error('sempre o mesmo'), {}); });
    await new Promise((r) => setImmediate(r));
  } finally {
    globalThis.fetch = origFetch;
    if (antes === undefined) delete process.env.ALERTA_WEBHOOK_URL; else process.env.ALERTA_WEBHOOK_URL = antes;
  }
  assert.equal(chamadas, 1, 'vinte ocorrências do mesmo defeito viraram vinte alertas');
});

test('deploy quebrado não vira inundação de alerta', async () => {
  /*
   * Dezenas de assinaturas DIFERENTES em segundos passam todas pela regra do
   * "só na primeira vez". Quem recebe cinquenta mensagens num minuto silencia
   * o canal — e o alerta seguinte, o que importava, não chega.
   */
  erros.limpar();
  const antes = process.env.ALERTA_WEBHOOK_URL;
  process.env.ALERTA_WEBHOOK_URL = 'https://exemplo.invalido/hook';
  const origFetch = globalThis.fetch;
  let chamadas = 0;
  globalThis.fetch = () => { chamadas++; return Promise.resolve({ ok: true, finally: (f) => { f(); } }); };
  try {
    capturar(() => { for (let i = 0; i < 30; i++) erros.registrar(new Error('defeito número ' + 'x'.repeat(i + 1)), {}); });
    await new Promise((r) => setImmediate(r));
  } finally {
    globalThis.fetch = origFetch;
    if (antes === undefined) delete process.env.ALERTA_WEBHOOK_URL; else process.env.ALERTA_WEBHOOK_URL = antes;
  }
  assert.ok(chamadas <= 5, 'passou do teto da janela: ' + chamadas + ' alertas');
});

test('alerta que falha não derruba a requisição', async () => {
  erros.limpar();
  const antes = process.env.ALERTA_WEBHOOK_URL;
  process.env.ALERTA_WEBHOOK_URL = 'https://exemplo.invalido/hook';
  const origFetch = globalThis.fetch;
  globalThis.fetch = () => Promise.reject(new Error('rede fora'));
  try {
    // O remédio não pode virar a doença: o alerta é SOBRE o sistema estar mal.
    assert.doesNotThrow(() => capturar(() => erros.registrar(new Error('algo'), {})));
    await new Promise((r) => setImmediate(r));
  } finally {
    globalThis.fetch = origFetch;
    if (antes === undefined) delete process.env.ALERTA_WEBHOOK_URL; else process.env.ALERTA_WEBHOOK_URL = antes;
  }
  assert.equal(erros.listar().length, 1);
});

/* ---------------- Rede de segurança ---------------- */

test('promessa sem catch é registrada em vez de sumir com o processo', () => {
  erros.limpar();
  const antes = process.listeners('unhandledRejection').slice();
  process.removeAllListeners('unhandledRejection');
  let saiu = null;
  erros.instalarRedeDeSeguranca((c) => { saiu = c; });
  capturar(() => process.emit('unhandledRejection', new Error('promessa solta')));
  const g = erros.listar()[0];
  assert.ok(g, 'a promessa rejeitada não foi registrada');
  assert.equal(g.exemplos[0].onde, 'promessa sem catch');
  assert.equal(saiu, null, 'promessa rejeitada não deve derrubar o processo');

  process.removeAllListeners('unhandledRejection');
  for (const l of antes) process.on('unhandledRejection', l);
});

test('exceção não tratada é registrada ANTES de o processo sair', () => {
  /*
   * O processo sai mesmo — estado imprevisível não serve requisição. O ganho
   * é o motivo ficar registrado antes de morrer, que é o que faltava.
   */
  erros.limpar();
  const antes = process.listeners('uncaughtException').slice();
  process.removeAllListeners('uncaughtException');
  let saiu = null;
  erros.instalarRedeDeSeguranca((c) => { saiu = c; });
  capturar(() => process.emit('uncaughtException', new Error('explodiu')));
  assert.equal(erros.listar().length, 1, 'não registrou antes de sair');
  assert.equal(saiu, null, 'saiu na hora, sem dar tempo do log escoar');

  process.removeAllListeners('uncaughtException');
  for (const l of antes) process.on('uncaughtException', l);
  erros.limpar();
});
