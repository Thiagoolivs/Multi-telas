/*
 * O caminho do dinheiro, que não tinha teste nenhum.
 *
 * `test/billing.test.js` testa a matemática de `plans.js` — quanto custa uma
 * conta de dez telas. Isso é outra coisa: aqui é o que efetivamente vai para
 * o Asaas, e o que o webhook do Asaas faz com a conta quando volta.
 *
 * Cada teste aqui nasceu de um defeito ACHADO na revisão, e o defeito está
 * escrito junto — sem isso, um teste de integração de cobrança vira uma lista
 * de asserções que ninguém sabe por que existe.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const RAIZ = path.join(__dirname, '..');
const lerFonte = (...p) => fs.readFileSync(path.join(RAIZ, ...p), 'utf8');

/*
 * Só o CÓDIGO, sem comentário.
 *
 * Três destes testes falharam na primeira escrita porque bateram no
 * comentário que EXPLICA o conserto: o texto que diz "estava em NODE_ENV"
 * casa com a busca por NODE_ENV. Um teste que proíbe uma palavra proíbe
 * também escrever sobre ela — e aí o jeito de passar vira apagar a
 * explicação, que é exatamente o contrário do que se quer.
 */
function soCodigo(fonte) {
  return fonte
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/^\s*\/\/.*$/gm, ' ');
}

/* ---------------- O que vai para o Asaas ---------------- */

/*
 * O módulo lê a chave no require, então o modo é decidido uma vez só. Para
 * exercitar o caminho 'asaas' sem rede, a chave entra antes do require e o
 * `fetch` global é trocado por um dublê que grava o que foi pedido.
 */
function comAsaasFalso(respostas, tarefa) {
  const chaveAntes = process.env.ASAAS_API_KEY;
  const fetchAntes = globalThis.fetch;
  process.env.ASAAS_API_KEY = 'chave-de-teste';
  delete require.cache[require.resolve('../server/billing.js')];

  const chamadas = [];
  globalThis.fetch = async (url, opcoes) => {
    const corpo = opcoes && opcoes.body ? JSON.parse(opcoes.body) : null;
    chamadas.push({ url: String(url), metodo: (opcoes && opcoes.method) || 'GET', corpo });
    const resposta = respostas(String(url), (opcoes && opcoes.method) || 'GET', corpo);
    return { ok: true, status: 200, text: async () => JSON.stringify(resposta) };
  };

  const billing = require('../server/billing.js');
  return Promise.resolve(tarefa(billing, chamadas)).finally(() => {
    globalThis.fetch = fetchAntes;
    if (chaveAntes === undefined) delete process.env.ASAAS_API_KEY;
    else process.env.ASAAS_API_KEY = chaveAntes;
    delete require.cache[require.resolve('../server/billing.js')];
  });
}

const TENANT = { id: 't1', name: 'Padaria', stripe_customer_id: '' };
const USER = { email: 'dono@padaria.com', name: 'Dono' };

const respostasPadrao = (semAssinatura) => (url, metodo) => {
  if (url.includes('/customers')) return { id: 'cus_1' };
  if (url.includes('/subscriptions') && metodo === 'GET') return { data: semAssinatura ? [] : [] };
  if (url.includes('/subscriptions')) return { id: 'sub_1' };
  if (url.includes('/payments')) return { data: [{ invoiceUrl: 'https://asaas.test/fatura/1' }] };
  return {};
};

test('a mensalidade cobrada é a da CONTA, não a de uma tela', async () => {
  /*
   * Ia `value: p.precoTelaCents / 100`, que é o preço de UMA tela. Dez telas
   * no Essencial: cobrado R$ 79,00, devido R$ 736,28. A função que aplica as
   * faixas de desconto já existia e não era chamada.
   */
  const plans = require('../server/plans.js');
  await comAsaasFalso(respostasPadrao(true), async (billing, chamadas) => {
    await billing.createCheckout(TENANT, USER, 'essencial', 'https://app.test', { telas: 10 });
    const criacao = chamadas.find((c) => c.url.includes('/subscriptions') && c.metodo === 'POST');
    assert.ok(criacao, 'não criou assinatura');
    assert.equal(criacao.corpo.value, plans.mensalidadeCents('essencial', 10) / 100);
    assert.notEqual(criacao.corpo.value, 79, 'voltou a cobrar o preço de uma tela só');
  });
});

test('o cliente é gravado ANTES da assinatura, não no retorno', async () => {
  /*
   * O id do cliente só era gravado depois que a função inteira voltava. Se a
   * busca da fatura falhasse, o cliente existia no Asaas e não aqui — e a
   * tentativa seguinte criava outro cliente e outra assinatura. Cartão
   * passando duas vezes.
   */
  await comAsaasFalso((url) => {
    if (url.includes('/customers')) return { id: 'cus_1' };
    if (url.includes('/subscriptions')) return { id: 'sub_1', data: [] };
    return { data: [] }; // nenhuma fatura: o passo que falhava
  }, async (billing) => {
    const gravados = [];
    await assert.rejects(
      () => billing.createCheckout(TENANT, USER, 'essencial', 'https://app.test',
        { telas: 1, aoCriarCliente: (id) => { gravados.push(id); } }),
      /ainda não gerou a fatura/,
    );
    assert.deepStrictEqual(gravados, ['cus_1'], 'o cliente não foi gravado antes de falhar');
  });
});

test('assinatura já aberta é ATUALIZADA em vez de virar a segunda', async () => {
  /*
   * Este teste nasceu cobrando o reaproveitamento por PLANO, e isso deixava
   * o buraco pior aberto: quem estava no Essencial e ia para o Pro casava com
   * nada e ganhava uma SEGUNDA assinatura ativa — as duas cobrando todo mês,
   * no caminho mais provável de quem já paga.
   *
   * Uma conta tem UMA assinatura. Trocar de plano, ou crescer o número de
   * telas, é mudar o valor dessa assinatura no lugar. O que se cobra aqui é
   * que nenhuma assinatura NOVA seja criada quando já existe uma ativa.
   */
  await comAsaasFalso((url, metodo) => {
    if (url.includes('/subscriptions') && metodo === 'GET') {
      return { data: [{ id: 'sub_ja_existe', externalReference: 't1|essencial' }] };
    }
    if (url.includes('/subscriptions')) return { id: 'sub_ja_existe' };
    if (url.includes('/payments')) return { data: [{ invoiceUrl: 'https://asaas.test/f/1' }] };
    return {};
  }, async (billing, chamadas) => {
    // De propósito num plano DIFERENTE do que está aberto: é a troca de plano.
    const out = await billing.createCheckout(
      { ...TENANT, stripe_customer_id: 'cus_1' }, USER, 'pro', 'https://app.test', { telas: 1 });
    assert.equal(out.id, 'sub_ja_existe');

    const criacoes = chamadas.filter((c) => c.metodo === 'POST' && /\/subscriptions$/.test(c.url));
    assert.deepStrictEqual(criacoes, [], 'criou uma segunda assinatura para quem já tinha uma');

    const alteracao = chamadas.find((c) => c.metodo === 'POST' && c.url.includes('/subscriptions/sub_ja_existe'));
    assert.ok(alteracao, 'não atualizou a assinatura existente');
    assert.equal(alteracao.corpo.externalReference, 't1|pro', 'a assinatura ficou apontando para o plano antigo');
  });
});

test('plano sem preço não vira assinatura', async () => {
  /*
   * A guarda era `p.priceCents <= 0`, e `priceCents` não existe em plans.js —
   * o campo é `precoTelaCents`. `undefined <= 0` é `false`, então passava
   * tudo, inclusive o grátis, que no Asaas viraria assinatura de R$ 0,00.
   */
  await comAsaasFalso(respostasPadrao(true), async (billing, chamadas) => {
    await assert.rejects(() => billing.createCheckout(TENANT, USER, 'free', 'https://app.test', { telas: 1 }),
      /plano inválido/);
    assert.equal(chamadas.length, 0, 'chegou a falar com o Asaas para um plano sem preço');
  });
});

/* ---------------- O webhook ---------------- */

test('assinatura criada NÃO libera o plano — só o pagamento libera', () => {
  /*
   * O defeito mais caro da revisão: `SUBSCRIPTION_CREATED` concedia `plan`,
   * e `plans.podeParear` decide acesso só por `tenant.plan`, sem olhar
   * `plan_status`. Clicar em assinar já dava o plano pago inteiro — 49 telas
   * e a franquia de créditos — sem pagar nada. O Asaas emite esse evento ao
   * criar o registro; a primeira fatura ainda está pendente.
   */
  const server = soCodigo(lerFonte('server.js'));
  const i = server.indexOf("eventName === 'SUBSCRIPTION_CREATED'");
  assert.ok(i > 0, 'sumiu o tratamento de SUBSCRIPTION_CREATED');
  /*
   * O ramo inteiro, até a próxima chave de fechamento do bloco — e a busca é
   * por QUALQUER menção a `plan`, não por uma grafia específica. A primeira
   * versão procurava `updates.plan`, e passou quando eu reintroduzi o defeito
   * escrevendo `u.plan`: um teste que proíbe um nome de variável não proíbe
   * o comportamento.
   */
  const ramo = server.slice(i, i + 600).split('} else if')[0];
  assert.ok(!/\bplan\b/.test(ramo),
    'SUBSCRIPTION_CREATED voltou a mexer no plano antes do pagamento: ' + ramo.slice(0, 200));

  // E o contrário: quem paga tem que continuar recebendo.
  const j = server.indexOf("eventName === 'PAYMENT_RECEIVED'");
  assert.ok(j > 0, 'sumiu o tratamento de PAYMENT_RECEIVED');
  assert.match(server.slice(j, j + 400), /updates\.plan = planId/,
    'pagar deixou de conceder o plano');
});

test('o token do webhook é comparado em tempo constante', () => {
  // `a !== b` para na primeira letra diferente, e o tempo dessa parada vaza
  // quantas letras estavam certas. Quem adivinha manda PAYMENT_RECEIVED.
  const fonte = lerFonte('server', 'billing.js');
  assert.match(fonte, /timingSafeEqual/, 'voltou a comparar o segredo do webhook com !==');
  const i = fonte.indexOf('function verifyWebhook');
  assert.ok(!/authHeader !== WEBHOOK_TOKEN/.test(fonte.slice(i, i + 400)));
});

/* ---------------- Rede ---------------- */

test('toda chamada de rede de cobrança tem prazo', () => {
  // Asaas pendurado penduraria a requisição de checkout do cliente — a mesma
  // classe do defeito que deixou a API inteira muda.
  const fonte = lerFonte('server', 'billing.js');
  assert.match(fonte, /AbortSignal\.timeout\(/, 'o fetch do Asaas ficou sem prazo');
});

test('a sandbox é escolhida por variável própria, não por NODE_ENV', () => {
  /*
   * Estava em `NODE_ENV === 'development'`, que este projeto não define em
   * lugar nenhum. Testar com chave de sandbox batia na API de produção, e o
   * erro só apareceria como cobrança de verdade.
   */
  const codigo = soCodigo(lerFonte('server', 'billing.js'));
  assert.ok(!/NODE_ENV/.test(codigo), 'a escolha de ambiente voltou para NODE_ENV');
  assert.match(codigo, /ASAAS_AMBIENTE/);
});

/* ---------------- Cancelamento ---------------- */

test('existe um caminho de cancelamento que não volta para a mesma tela', () => {
  /*
   * A primeira versão deste teste só exigia que o botão não estivesse mais
   * atrás de `mode === 'stripe'`. Passou — e o botão continuava inútil: ele
   * chamava um "portal" que devolvia `/app?billing=portal`, e o roteador
   * manda qualquer `?billing=` de volta para a PRÓPRIA tela de plano. A
   * página recarregava e não havia como cancelar por lugar nenhum.
   *
   * Exigir a ausência de uma condição não é exigir a presença de um caminho.
   */
  const tela = soCodigo(lerFonte('web', 'src', 'pages', 'BillingPage.jsx'))
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ');
  assert.ok(!/mode === 'stripe'/.test(tela), 'o cancelamento voltou a exigir Stripe');
  assert.match(tela, /billing\.cancelar\(\)/, 'a tela não chama o cancelamento');
  assert.match(tela, /Confirmar cancelamento/, 'sumiu a confirmação antes de cancelar');

  const server = soCodigo(lerFonte('server.js'));
  assert.match(server, /req\.method === 'DELETE' && seg === 'assinatura'/, 'sumiu a rota de cancelamento');
  assert.ok(!/billing=portal/.test(server), 'voltou a URL que aponta para a própria tela');
});

/* ---------------- Cadastro ---------------- */

test('cadastro que espera verificação avisa, em vez de fingir que entrou', () => {
  /*
   * O servidor passou a responder 202 { pendingVerification } sem abrir
   * sessão, e a tela continuou chamando `onAuthed()`. O app carregava sem
   * sessão, /api/auth/me devolvia 401, e ninguém era avisado do e-mail.
   */
  const codigo = soCodigo(lerFonte('web', 'src', 'pages', 'AuthScreen.jsx'));
  const i = codigo.indexOf('auth.signup(');
  assert.ok(i > 0, 'sumiu a chamada de cadastro');
  const trecho = codigo.slice(i);
  const guarda = trecho.indexOf('pendingVerification');
  const entra = trecho.indexOf('onAuthed()');
  assert.ok(guarda > 0, 'a tela voltou a ignorar o cadastro pendente');
  assert.ok(entra > 0, 'sumiu a entrada no app depois do cadastro');
  assert.ok(guarda < entra, 'entra no app antes de conferir se o cadastro ficou pendente');
});

/* ---------------- Fontes ---------------- */

test('toda família de fonte encontra o próprio arquivo DE VERDADE', () => {
  /*
   * A primeira versão deste teste refazia a montagem do nome DENTRO do teste
   * e conferia contra a pasta. Passava com o defeito de volta — claro:
   * testava a minha cópia da regra, não a do código. Agora chama `getFont`,
   * que é quem monta o nome, abre o arquivo e devolve null quando não acha.
   *
   * O defeito: `replace(/s+/g, '-')`, sem a barra invertida, trocava a LETRA
   * "s". "Playfair Display" virava `playfair di-play`. Sete das doze famílias
   * caíam caladas na estimativa — justamente as de display, que são as que
   * mais erram largura, porque é para isso que elas existem.
   */
  const { getFont } = require('../server/font-metrics.js');
  const fontes = require('../js/fontes.js');
  const semFonte = Object.keys(fontes.FAMILIAS).filter((id) => !getFont(id, 400, false));
  assert.deepStrictEqual(semFonte, [], 'família que não encontra o próprio arquivo de fonte');
});

test('a quebra de linha separa por espaço, e não pela letra "s"', () => {
  /*
   * `t.split(/(s+)/)` — a mesma barra invertida perdida do nome do arquivo.
   * A primeira prova que escrevi comparava contagens de linha de dois textos
   * do mesmo tamanho e passava com o defeito de volta: a soma das larguras é
   * quase a mesma, não importa onde você corta. O que MUDA é ONDE a linha
   * quebra, e é isso que precisa ser medido.
   *
   * Dois casos, um em cada direção:
   *   - "arrocha arrocha" não tem "s": com o defeito vira um pedaço só e
   *     deixa de quebrar no espaço (1 linha em vez de 2).
   *   - Uma palavra longa com "s" e sem espaço nenhum: com o defeito é
   *     partida e quebra em 3 linhas. Navegador não parte palavra no meio.
   */
  const { cabeNaCaixaReal } = require('../server/font-metrics.js');
  const caixa = { w: 30, h: 40 };
  const medir = (t) => cabeNaCaixaReal(t, caixa, 5, '16/9', 'sans', 400, false).linhas;

  assert.equal(medir('arrocha arrocha'), 2, 'deixou de quebrar no espaço');
  assert.equal(medir('sussurrosussurrosussurro'), 1, 'partiu uma palavra sem espaço no meio');
});

test('a medição usa a fonte real, e não estoura quando não acha', () => {
  const metrics = require('../server/font-metrics.js');
  assert.equal(typeof metrics, 'object');
  // Família inexistente não pode derrubar a composição — cai na estimativa.
  const chamavel = Object.values(metrics).find((v) => typeof v === 'function');
  assert.ok(chamavel, 'o módulo de métricas não expõe nada chamável');
});

/* ---------------- Confirmação de e-mail ---------------- */

test('"confira seu e-mail" só é dito se o e-mail saiu', () => {
  /*
   * A falha de envio era registrada e ENGOLIDA, e a resposta seguia 202 do
   * mesmo jeito. A pessoa ficava esperando um link que nunca foi mandado —
   * chave errada, domínio não verificado e provedor fora do ar davam todos o
   * mesmo silêncio, e o cadastro parecia ter funcionado.
   */
  const codigo = soCodigo(lerFonte('server', 'routes', 'auth.js'));
  const i = codigo.indexOf('mail.verifyEmail(');
  assert.ok(i > 0, 'sumiu o envio do e-mail de confirmação');
  const trecho = codigo.slice(Math.max(0, i - 400), i + 700);
  assert.match(trecho, /return sendJson\(res, 502/,
    'a falha de envio voltou a ser engolida com 202');
});

test('subir sem provedor de e-mail é dito no boot', () => {
  /*
   * Sem provedor, o link de confirmação vai para o log e mais nada: o produto
   * parece funcionar e ninguém consegue se cadastrar. É o tipo de falha que
   * só aparece pelo primeiro cliente que desiste — por isso é dita no boot,
   * junto com a saída (SKIP_VERIFY=1) para quem escolher subir assim.
   */
  const codigo = soCodigo(lerFonte('server.js'));
  assert.match(codigo, /cadastro\.sem-email/, 'sumiu o aviso de boot sobre e-mail');
  assert.match(codigo, /SKIP_VERIFY/, 'o aviso deixou de dizer qual é a saída');
});
