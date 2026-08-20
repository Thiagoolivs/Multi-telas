/*
 * Contas liberadas para testar.
 *
 * O teste que mais importa aqui é o que SEPARA cortesia de operador. As duas
 * coisas são listas de e-mail em variável de ambiente, e é justamente por
 * serem parecidas que precisam ser provadamente diferentes: uma dá um plano
 * pago dentro da própria conta, a outra dá acesso aos dados de todos os
 * clientes. Confundi-las uma vez basta.
 */
const test = require('node:test');
const assert = require('node:assert');

const cortesia = require('../server/cortesia.js');
const operadores = require('../server/operadores.js');
const plans = require('../server/plans.js');

/* Um banco de mentira: só o que este módulo toca. */
function bancoFalso(tenant) {
  const t = { id: 't1', created_at: Date.now(), plan: 'free', plan_status: 'free', ...(tenant || {}) };
  return {
    tenant: t,
    async getTenant(id) { return id === t.id ? t : null; },
    async setTenantBilling(id, f) { if (id === t.id) Object.assign(t, { plan: f.plan, plan_status: f.status }); },
  };
}

const comAmbiente = async (vars, fn) => {
  const antes = {};
  for (const k of Object.keys(vars)) {
    antes[k] = process.env[k];
    if (vars[k] === undefined) delete process.env[k]; else process.env[k] = vars[k];
  }
  try { return await fn(); } finally {
    for (const k of Object.keys(vars)) {
      if (antes[k] === undefined) delete process.env[k]; else process.env[k] = antes[k];
    }
  }
};

/* ---------------- A separação que importa ---------------- */

test('cortesia NÃO dá acesso ao painel da plataforma', async () => {
  /*
   * O cenário real: você acrescenta o e-mail de um testador à lista de
   * cortesia. Se as duas listas se misturassem, essa pessoa passaria a ver
   * telas, contas, faturamento e reclamações de TODOS os clientes — por causa
   * de uma linha numa variável de ambiente que ninguém leu como perigosa.
   */
  await comAmbiente({ CONTAS_CORTESIA: 'testador@empresa.com', ADMIN_EMAILS: 'chefe@mt.com' }, async () => {
    assert.equal(cortesia.ehCortesia('testador@empresa.com'), true);
    assert.equal(operadores.ehRaiz('testador@empresa.com'), false, 'a cortesia virou raiz da plataforma');
    const p = await operadores.permissao(
      { async listarOperadores() { return []; } },
      { email: 'testador@empresa.com' }
    );
    assert.equal(p.pode, false, 'a cortesia abriu o painel da plataforma');
  });
});

test('operador NÃO ganha cortesia de brinde', async () => {
  // O contrário também: quem opera a plataforma paga pela própria conta como
  // qualquer um, a menos que esteja nas DUAS listas de propósito.
  await comAmbiente({ CONTAS_CORTESIA: 'testador@empresa.com', ADMIN_EMAILS: 'chefe@mt.com' }, () => {
    assert.equal(cortesia.ehCortesia('chefe@mt.com'), false);
  });
});

test('uma lista VAZIA não empresta a outra', async () => {
  /*
   * Este é o teste que a primeira versão deixou passar, e a falha era minha:
   * eu definia as duas variáveis em todos os cenários, então um
   * `CONTAS_CORTESIA || ADMIN_EMAILS` escrito por engano nunca chegava a ser
   * exercitado. É exatamente com uma delas vazia que o encosto aconteceria —
   * e é o caso comum, porque quase ninguém define as duas.
   */
  await comAmbiente({ CONTAS_CORTESIA: '', ADMIN_EMAILS: 'chefe@mt.com' }, () => {
    assert.deepEqual(cortesia.listaDoAmbiente(), [], 'a cortesia foi buscar na lista de operadores');
    assert.equal(cortesia.ehCortesia('chefe@mt.com'), false);
  });
  await comAmbiente({ CONTAS_CORTESIA: 'testador@empresa.com', ADMIN_EMAILS: '' }, () => {
    assert.deepEqual(operadores.listaDoAmbiente(), [], 'o operador foi buscar na lista de cortesia');
    assert.equal(operadores.ehRaiz('testador@empresa.com'), false);
  });
});

/* ---------------- A lista ---------------- */

test('sem CONTAS_CORTESIA, ninguém é cortesia', async () => {
  await comAmbiente({ CONTAS_CORTESIA: undefined }, () => {
    assert.deepEqual(cortesia.listaDoAmbiente(), []);
    assert.equal(cortesia.ehCortesia('qualquer@um.com'), false);
    assert.equal(cortesia.ehCortesia(''), false);
    assert.equal(cortesia.ehCortesia(null), false);
  });
});

test('a lista aceita vírgula, ponto e vírgula e espaço, e ignora maiúscula', async () => {
  await comAmbiente({ CONTAS_CORTESIA: 'A@x.com, b@y.com;c@z.com  d@w.com' }, () => {
    assert.deepEqual(cortesia.listaDoAmbiente(), ['a@x.com', 'b@y.com', 'c@z.com', 'd@w.com']);
    assert.equal(cortesia.ehCortesia('A@X.COM'), true, 'a comparação virou sensível a maiúscula');
    assert.equal(cortesia.ehCortesia(' b@y.com '), true, 'espaço em volta derrubou a comparação');
  });
});

test('lixo na variável não vira e-mail', async () => {
  await comAmbiente({ CONTAS_CORTESIA: 'sem-arroba, , @, x@y.com' }, () => {
    assert.deepEqual(cortesia.listaDoAmbiente(), ['@', 'x@y.com'].filter((e) => e.includes('@')));
    assert.equal(cortesia.ehCortesia('sem-arroba'), false);
  });
});

/* ---------------- Promover e devolver ---------------- */

test('entrar na lista dá o plano Pro, sem prazo', async () => {
  await comAmbiente({ CONTAS_CORTESIA: 'testador@empresa.com' }, async () => {
    const db = bancoFalso();
    assert.equal(await cortesia.sincronizar(db, 't1', 'testador@empresa.com'), 'promoveu');
    assert.equal(db.tenant.plan, 'pro');
    assert.equal(db.tenant.plan_status, 'cortesia');
    assert.equal(cortesia.contaEmCortesia(db.tenant), true);

    // O que a conta ganha de verdade: telas, e nenhum vencimento de teste.
    assert.ok(plans.screenLimit('pro') > 1, 'a cortesia não aumentou o limite de telas');
    assert.equal(plans.isPaid('pro'), true, 'a cortesia continuou sujeita ao teste de 14 dias');
    const podeVelha = plans.podeParear({ plan: 'pro', created_at: 0 }, 3, Date.now());
    assert.equal(podeVelha.ok, true, 'conta antiga em cortesia foi barrada pelo prazo');
  });
});

test('sair da lista devolve a conta para o grátis', async () => {
  /*
   * Só promover faria cada cortesia durar para sempre — e a conta seguiria com
   * 49 telas e crédito de IA muito depois do teste, gastando dinheiro de
   * verdade em chamada de modelo.
   */
  const db = bancoFalso({ plan: 'pro', plan_status: 'cortesia' });
  await comAmbiente({ CONTAS_CORTESIA: 'outro@x.com' }, async () => {
    assert.equal(await cortesia.sincronizar(db, 't1', 'testador@empresa.com'), 'devolveu');
    assert.equal(db.tenant.plan, 'free');
    assert.equal(db.tenant.plan_status, 'free');
  });
});

test('conta que PAGA nunca é tocada', async () => {
  /*
   * Nos dois sentidos, e este é o erro caro: rebaixar quem paga desligaria a
   * cobrança sem ninguém pedir, e o cliente descobriria ao ligar a quinta tela.
   */
  const pagante = bancoFalso({ plan: 'pro', plan_status: 'active', stripe_subscription_id: 'sub_1' });
  await comAmbiente({ CONTAS_CORTESIA: 'paga@x.com' }, async () => {
    assert.equal(await cortesia.sincronizar(pagante, 't1', 'paga@x.com'), 'nada');
    assert.equal(pagante.tenant.plan_status, 'active', 'a assinatura ativa virou cortesia');
  });
  await comAmbiente({ CONTAS_CORTESIA: '' }, async () => {
    assert.equal(await cortesia.sincronizar(pagante, 't1', 'paga@x.com'), 'nada');
    assert.equal(pagante.tenant.plan, 'pro', 'quem paga foi rebaixado ao sair da lista');
  });
});

test('sincronizar duas vezes não faz nada na segunda', async () => {
  await comAmbiente({ CONTAS_CORTESIA: 'testador@empresa.com' }, async () => {
    const db = bancoFalso();
    assert.equal(await cortesia.sincronizar(db, 't1', 'testador@empresa.com'), 'promoveu');
    assert.equal(await cortesia.sincronizar(db, 't1', 'testador@empresa.com'), 'nada');
  });
});

test('conta que não existe não quebra', async () => {
  await comAmbiente({ CONTAS_CORTESIA: 'x@y.com' }, async () => {
    const db = bancoFalso();
    assert.equal(await cortesia.sincronizar(db, 'nao-existe', 'x@y.com'), 'nada');
    assert.equal(await cortesia.sincronizar(db, null, 'x@y.com'), 'nada');
  });
});

/* ---------------- Onde é conferida ---------------- */

test('a lista é conferida em TODA porta de entrada', () => {
  /*
   * Cadastro, login por senha e login pelo Google. Esquecer uma delas faria a
   * cortesia funcionar "às vezes" — e o relato seria "só funciona quando entro
   * pelo Google", que é o tipo de defeito que consome uma tarde.
   */
  const fs = require('node:fs');
  const path = require('node:path');
  const SERVER = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  const chamadas = SERVER.match(/cortesia\.sincronizar\(/g) || [];
  assert.ok(chamadas.length >= 3, 'faltou conferir a cortesia em alguma porta de entrada: ' + chamadas.length);

  // E a conferência do login vem ANTES de abrir a sessão, para o painel já
  // carregar com o plano certo em vez de mostrar o grátis por um instante.
  const login = SERVER.indexOf("action === 'login'");
  const bloco = SERVER.slice(login, login + 2000);
  assert.ok(bloco.indexOf('cortesia.sincronizar') < bloco.indexOf('auth.startSession'),
    'a cortesia é aplicada depois de abrir a sessão');
});

test('o painel recebe a bandeira de cortesia', () => {
  // Sem ela a tela diria "Pro · Ativo", a pessoa acharia que está pagando, e o
  // botão de assinar sumiria justamente de quem um dia precisa clicar nele.
  const fs = require('node:fs');
  const path = require('node:path');
  const SERVER = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  assert.match(SERVER, /cortesia: cortesia\.contaEmCortesia\(tenant\)/);
  const BILLING = fs.readFileSync(path.join(__dirname, '..', 'web', 'src', 'pages', 'BillingPage.jsx'), 'utf8');
  assert.match(BILLING, /cortesia\s*\?\s*'Cortesia'/, 'a tela de Plano não mostra que o acesso é emprestado');
});
