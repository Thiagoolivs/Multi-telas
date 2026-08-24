/*
 * O que uma campanha gera, e o que ela cobra.
 *
 * Este arquivo nasceu de um número medido em produção: uma campanha custava
 * entre R$ 1,20 e R$ 1,60 de verdade, o sistema registrava R$ 0,05 e debitava
 * ZERO crédito. Duas coisas erradas ao mesmo tempo:
 *
 *   1. A campanha gerava imagens PAGAS sem conferir saldo e sem cobrar. A rota
 *      de imagem avulsa fazia as duas coisas; a campanha, que gera VÁRIAS
 *      imagens, passava direto. O gancho `campanha-peca` estava no catálogo de
 *      créditos desde sempre, com o rótulo escrito, e nunca era chamado.
 *
 *   2. Ninguém perguntava quantas peças, para onde, nem se a pessoa queria
 *      foto. O modelo decidia os três e outra função somava peças por cima.
 *
 * A ordem importa: cobrar pelo desperdício é PIOR que não cobrar, porque o
 * cliente paga pela peça que não pediu. Por isso o pedido é limite antes de a
 * cobrança existir.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const director = require('../server/ai-director.js');
const creditos = require('../server/creditos.js');

const semComentarios = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const RAIZ = path.join(__dirname, '..');
const SERVER = semComentarios(fs.readFileSync(path.join(RAIZ, 'server.js'), 'utf8'));
const DIRETOR = semComentarios(fs.readFileSync(path.join(RAIZ, 'server', 'ai-director.js'), 'utf8'));

/* Roda o diretor em modo demonstração: plano real, sem chamar modelo. */
async function campanha(pedido) {
  return director.dirigir('promoção de café da manhã', { empresa: 'Padaria', pedido });
}

/*
 * Um plano CRU que pede imagem em todas as peças — como o modelo devolve de
 * verdade quando decide que a campanha precisa de foto.
 *
 * O modo demonstração não serve para testar as regras de imagem: `planoDev`
 * nunca pede foto, então um teste feito por ele passa mesmo com a regra
 * desligada. Foi assim que a primeira versão deste arquivo deixou passar o
 * "sem foto" — ela conferia um caminho onde não havia imagem para recusar.
 */
function planoCru(quantas) {
  return {
    campanha: 'Café',
    identidade: { brand: '#1e3a8a', estilo: 'vibrante' },
    pecas: Array.from({ length: quantas || 4 }, (_, i) => ({
      formato: ['16/9', '9/16', '1/1', '21/9'][i % 4],
      headline: 'Manchete ' + (i + 1),
      sub: 'Apoio', cta: 'Venha', kicker: 'HOJE',
      precisaImagem: true,
      promptImagem: 'uma foto de café fumegante no balcão',
    })),
    social: {}, agenda: [],
  };
}
const normalizar = (pedido, quantas) =>
  director.normalizarPlano(planoCru(quantas), { empresa: 'Padaria', pedido }, 'café');

/* ---------------- O pedido é limite ---------------- */

test('sem pedido, a campanha continua decidindo sozinha', async () => {
  // O comportamento antigo não foi removido: quem tem pressa não é obrigado a
  // preencher nada. O que mudou é que agora DÁ para dizer.
  const r = await campanha(null);
  assert.ok(r.pecas.length > 0);
});

test('a quantidade pedida é TETO, não sugestão', async () => {
  /*
   * É a correção que mais economiza. Um pedido sem quantidade produzia seis
   * peças em três formatos — o modelo escolhia três, `garantirDuasPorFormato`
   * somava mais, e cada uma podia custar uma imagem paga.
   */
  for (const n of [1, 2, 3, 4]) {
    const r = await campanha({ quantidade: n, formatos: ['16/9'] });
    assert.ok(r.pecas.length <= n, `pedi ${n} peça(s) e vieram ${r.pecas.length}`);
  }
});

test('só saem os formatos pedidos', async () => {
  // Peça em formato que ninguém pediu não vai ser usada — e, se ela precisar
  // de imagem, é dinheiro gasto em algo que ninguém vai ver.
  const r = await campanha({ formatos: ['16/9'], quantidade: 4 });
  const fora = r.pecas.filter((p) => p.formato !== '16/9').map((p) => p.formato);
  assert.deepStrictEqual(fora, [], 'vieram formatos que não foram pedidos');

  const dois = await campanha({ formatos: ['16/9', '9/16'], quantidade: 4 });
  const foraDois = dois.pecas.filter((p) => !['16/9', '9/16'].includes(p.formato));
  assert.equal(foraDois.length, 0);
});

test('"sem foto" não gera imagem nenhuma', () => {
  // Exercitado sobre um plano que PEDE imagem em todas as peças — senão o
  // teste passa com a regra desligada, que foi o que aconteceu na primeira
  // versão dele.
  const cru = planoCru(4);
  assert.ok(cru.pecas.every((p) => p.precisaImagem), 'o plano de teste precisa querer imagem');

  const r = normalizar({ imagens: 'nenhuma', quantidade: 4, formatos: ['16/9'] }, 4);
  assert.equal(r.pecas.filter((p) => p.precisaImagem).length, 0,
    'pediu sem foto e ainda assim pediria imagem');
  assert.equal(r.imagensAGerar, 0);
  // "Sem foto" é sem foto NENHUMA: nem a gerada, nem a do acervo.
  assert.equal(r.pecas.filter((p) => p.bgImagem).length, 0);
});

test('"só as minhas fotos" nunca manda desenhar', () => {
  // É a opção que custa zero: o acervo da empresa é de graça e é mais
  // verdadeiro que foto inventada.
  const r = normalizar({ imagens: 'acervo', quantidade: 4, formatos: ['16/9'] }, 4);
  assert.equal(r.pecas.filter((p) => p.precisaImagem).length, 0);
  assert.equal(r.imagensAGerar, 0);
});

test('o padrão continua deixando a IA desenhar o que faltar', () => {
  // O contrário dos dois acima: sem pedido explícito, quem quer imagem
  // continua tendo imagem — a correção não podia desligar o produto.
  const r = normalizar({ quantidade: 4, formatos: ['16/9'] }, 4);
  assert.ok(r.imagensAGerar > 0, 'a campanha deixou de gerar imagem quando ninguém pediu para parar');
});

test('quando é preciso cortar, sobra de fora a peça mais CARA', () => {
  /*
   * Entre uma peça que usa a foto da própria empresa e uma que precisa gerar,
   * a primeira é melhor nas duas contas: mais barata e mais verdadeira. Se é
   * para alguma ficar de fora do teto, que seja a que custa.
   */
  const cru = planoCru(4);
  cru.pecas[0].precisaImagem = false;   // esta é de graça
  cru.pecas[0].promptImagem = '';
  const r = director.normalizarPlano(cru, { empresa: 'P', pedido: { quantidade: 1, formatos: ['16/9'] } }, 'café');
  assert.equal(r.pecas.length, 1);
  assert.equal(r.pecas[0].precisaImagem, false, 'cortou a peça grátis e manteve a paga');
});

test('pedido inválido não quebra nem vira limite absurdo', async () => {
  // Vem de JSON do cliente: qualquer coisa pode chegar.
  for (const p of [{ quantidade: 0 }, { quantidade: -5 }, { quantidade: 999 },
    { formatos: ['nao-existe'] }, { imagens: 'sei-la' }, { formatos: 'texto' }]) {
    const r = await campanha(p);
    assert.ok(Array.isArray(r.pecas) && r.pecas.length > 0, 'quebrou com ' + JSON.stringify(p));
    assert.ok(r.pecas.length <= 12);
  }
});

test('o pedido volta no resultado, para a tela conferir o que prometeu', async () => {
  const r = await campanha({ formatos: ['1/1'], quantidade: 2, imagens: 'nenhuma' });
  assert.deepStrictEqual(r.pedido, { formatos: ['1/1'], quantidade: 2, imagens: 'nenhuma' });
});

/* ---------------- A imagem duplicada ---------------- */

test('a mesma mensagem em dois formatos não gera duas imagens', async () => {
  /*
   * `garantirDuasPorFormato` copia uma peça para o outro formato, e a cópia
   * levava `precisaImagem` e `promptImagem` do original junto. O prompt era o
   * MESMO, então saíam duas imagens quase idênticas — e as duas eram pagas.
   */
  const fonte = DIRETOR;
  assert.match(fonte, /reusaImagemDe/, 'a cópia voltou a não marcar de quem reusa');
  const i = fonte.indexOf('function garantirDuasPorFormato');
  const bloco = fonte.slice(i, fonte.indexOf('\n}', i));
  assert.match(bloco, /precisaImagem: false/, 'a cópia voltou a pedir imagem própria');
  assert.match(bloco, /promptImagem: ''/, 'a cópia voltou a carregar o prompt do original');
});

/* ---------------- A cobrança ---------------- */

test('a campanha cobra crédito por imagem, como a rota avulsa', () => {
  /*
   * Era o vazamento: a campanha é a operação mais cara do produto e passava
   * sem conferir saldo e sem debitar. O único registro era o do texto, R$ 0,05
   * para algo que custa mais de um real.
   */
  const i = SERVER.indexOf('onImagem: async (prompt, formato)');
  assert.ok(i > 0, 'sumiu a geração de imagem da campanha');
  const bloco = SERVER.slice(i, i + 1400);

  assert.match(bloco, /usoIA\.conferir\(db, contaIA, 'campanha-peca', 1\)/,
    'a campanha voltou a gerar imagem sem conferir saldo');
  assert.match(bloco, /usoIA\.cobrar\(/, 'a campanha voltou a gerar imagem sem cobrar');

  // Confere ANTES de gerar, cobra DEPOIS do sucesso: gerar primeiro e cobrar
  // depois deixa a conta devendo; cobrar antes cobra por falha.
  assert.ok(bloco.indexOf('usoIA.conferir') < bloco.indexOf('ai.generateImage'),
    'confere o saldo depois de já ter gerado');
  assert.ok(bloco.indexOf('usoIA.cobrar') > bloco.indexOf('midia.guardarBuffer'),
    'cobra antes de a imagem existir de fato');
});

test('o gancho de cobrança da campanha existe e cobra mesmo', () => {
  // `campanha-peca` estava no catálogo com o rótulo escrito e nunca era
  // chamado — criado e esquecido. Este teste é o que impede isso de novo.
  const op = creditos.operacao('campanha-peca');
  assert.ok(op, 'sumiu a operação de peça de campanha');
  assert.ok(op.creditos >= 1, 'a peça de campanha voltou a ser de graça');
  assert.ok(SERVER.includes("'campanha-peca'"), 'o gancho voltou a não ser chamado em lugar nenhum');
});

test('acabar o crédito no meio não derruba a campanha', () => {
  /*
   * A quinta imagem não caber não pode jogar fora as quatro já pagas e o
   * minuto que a pessoa esperou. A peça sai sem foto e a campanha segue — é o
   * mesmo princípio de "a tela nunca para", aplicado ao que já foi cobrado.
   */
  const i = DIRETOR.indexOf('if (onImagem) {');
  const bloco = DIRETOR.slice(i, i + 1600);
  assert.match(bloco, /catch/, 'a falha de imagem deixou de ser tratada');
  assert.match(bloco, /precisaImagem = false/, 'a peça sem imagem deixou de seguir sem foto');
  assert.match(bloco, /semImagemPorque/, 'sumiu o motivo de a peça ter ficado sem foto');
});

test('a conta do custo é a MESMA que a tela promete', () => {
  /*
   * A tela diz "até N créditos" antes do clique. Se a conta do aviso e a da
   * cobrança fossem duas implementações, um dia divergiriam — e o dia em que
   * divergem é o dia em que alguém é cobrado a mais do que leu.
   */
  assert.match(DIRETOR, /function imagensAGerar\(/, 'sumiu a conta de imagens a gerar');
  const TELA = fs.readFileSync(path.join(RAIZ, 'web', 'src', 'pages', 'MyDesignsPage.jsx'), 'utf8');
  assert.match(TELA, /até \{quantas\} crédito/, 'a tela deixou de avisar o custo antes do clique');
  assert.match(TELA, /pedido: \{ formatos: onde, quantidade: quantas, imagens \}/,
    'a tela deixou de mandar o pedido explícito');
});
