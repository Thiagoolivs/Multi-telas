/*
 * Furos vistos no teste do assistente do Criar no navegador (24/10), sem IA.
 */
const test = require('node:test');
const assert = require('node:assert');
const ajusteTela = require('../server/ajuste-tela.js');
const avisoRapido = require('../server/aviso-rapido.js');

const TV = { layoutId: 'corporate', orientacao: 'landscape', tema: '' };

test('"muda o tema da TV do balcão para claro": o claro longe do tema', async () => {
  for (const t of ['muda o tema da tv do balcão para claro', 'muda o tema para claro na tv do balcão']) {
    assert.deepEqual((await ajusteTela.entender(t, TV, [])).mudancas, { fundo: 'claro' }, t);
  }
  assert.deepEqual((await ajusteTela.entender('muda o fundo pra escuro', TV, [])).mudancas, { fundo: 'escuro' });
  // A cor continua sendo cor: "azul claro" não é o tema claro.
  assert.equal((await ajusteTela.entender('fundo azul claro', TV, [])).mudancas.fundo, 'cor');
});

test('"avisa que o piso está molhado": o cartaz é o que vem depois do "avisa que"', () => {
  const hoje = new Date('2026-10-24T12:00:00');
  assert.equal(avisoRapido.semIA('avisa que o piso do corredor está molhado', hoje, []).titulo, 'O piso do corredor está molhado');
  assert.equal(avisoRapido.semIA('avise a todos que a reunião mudou', hoje, []).titulo, 'A reunião mudou');
  assert.equal(avisoRapido.semIA('Aviso: piso molhado no corredor', hoje, []).titulo, 'Piso molhado no corredor');
  assert.equal(avisoRapido.semIA('um aviso de que fechamos às 18h', hoje, []).titulo, 'Fechamos às 18h');
});

/* ---------------- A revisão do consultor no #299 ---------------- */

const assistente = require('../server/assistente.js');
const TELAS = [{ id: 'd1', nome: 'TV da recepção' }, { id: 'd2', nome: 'TV do balcão' }];
const fala = (texto) => ({ papel: 'pessoa', texto });
function semIA(t) {
  const antes = process.env.AI_PROVIDER;
  process.env.AI_PROVIDER = 'dev';
  t.after(() => { if (antes === undefined) delete process.env.AI_PROVIDER; else process.env.AI_PROVIDER = antes; });
}

test('dois pedidos numa fala: faz o primeiro e diz que viu o segundo, com ele de resposta pronta', async (t) => {
  semIA(t);
  assert.deepEqual(assistente.partirPedidos('faz um quiz sobre café e um aviso de que fechamos às 18h'), ['faz um quiz sobre café', 'um aviso de que fechamos às 18h']);
  const r = await assistente.responder({ mensagens: [fala('faz um quiz sobre café e um aviso de que fechamos às 18h')], ctx: { telas: TELAS } });
  assert.equal(r.ferramenta, 'criar_quiz');
  assert.equal(r.acao.tema, 'café', 'o segundo pedido entrou no tema do quiz');
  assert.match(r.resposta, /“um aviso de que fechamos às 18h”/);
  assert.equal(r.sugestoes[0], 'um aviso de que fechamos às 18h');
});

test('o quiz confere a quantidade (até 5) e a TV (da conta) antes de fazer', async (t) => {
  semIA(t);
  const muitas = await assistente.responder({ mensagens: [fala('quiz de 50 perguntas sobre café')], ctx: { telas: TELAS } });
  assert.equal(muitas.acao, undefined);
  assert.match(muitas.resposta, /Faço com 5\?/);
  assert.equal(muitas.args.quantidade, assistente.MAX_PERGUNTAS, '"sim" não faria 5');
  const sim = await assistente.responder({ mensagens: [fala('quiz de 50 perguntas sobre café'), muitas.mensagem, fala('sim')], ctx: { telas: TELAS } });
  assert.equal(sim.acao.quantidade, 5);
  const fora = await assistente.responder({ mensagens: [fala('quiz de 3 perguntas sobre café na tv da entrada')], ctx: { telas: TELAS } });
  assert.match(fora.resposta, /Não achei a TV “tv da entrada”/);
  assert.deepEqual(fora.sugestoes, ['TV da recepção', 'TV do balcão', 'Todas as TVs']);
});

test('a correção que muda a TV continua o mesmo quiz, com as mesmas perguntas', async (t) => {
  semIA(t);
  const m = [fala('quiz de 2 perguntas sobre pão na tv do balcão')];
  const a = await assistente.responder({ mensagens: m, ctx: { telas: TELAS } });
  assert.equal(a.acao.tv.id, 'd2');
  const b = await assistente.responder({ mensagens: m.concat(a.mensagem, fala('não, na tv da recepção')), ctx: { telas: TELAS } });
  assert.equal(b.ferramenta, 'criar_quiz');
  assert.equal(b.acao.tv.id, 'd1');
  assert.deepEqual(b.acao.quiz.perguntas, a.acao.quiz.perguntas, 'gastou de novo para só mudar a TV');
});

test('o Pedir à IA usa o maestro com menos ferramentas, e a TV aberta não sai da IA', () => {
  const src = require('node:fs').readFileSync(require('node:path').join(__dirname, '..', 'server', 'assistente.js'), 'utf8');
  assert.match(src, /const DA_PROGRAMACAO = \['criar_aviso', 'criar_quiz', 'mudar_tela', 'editar_campanha', 'campanha', 'perguntar'\];/);
  assert.match(src, /const \{ tv, \.\.\.props \} = f\.parametros\.properties;/, 'a TV fixa ainda vai para a IA escolher');
  assert.doesNotMatch(require('node:fs').readFileSync(require('node:path').join(__dirname, '..', 'server.js'), 'utf8'), /require\('\.\/server\/pedir-ia'\)/, 'o cérebro antigo do Pedir à IA voltou');
});

test('"na lateral põe uma promoção": com IA, o primeiro desenho fica só na lateral', async (t) => {
  const ai = require('../server/ai.js');
  const C = require('../server/ai-conversa.js');
  const E = require('../js/escopo.js');
  const modo = ai.mode; const llm = ai.callLLM;
  t.after(() => { ai.mode = modo; ai.callLLM = llm; });
  ai.mode = () => 'gemini';
  // A IA monta as quatro zonas (visto na avaliação de 24/10).
  ai.callLLM = async () => JSON.stringify({ tipo: 'campanha', resposta: 'Boa!', escopo: E.padrao() });
  const zonas = (r) => Object.fromEntries(E.ZONAS.map((n) => [n, Math.max(...r.escopo.telas.map((x) => x.zonas[n].pecas || 0))]));
  const so = await C.conversar({ mensagens: [{ papel: 'pessoa', texto: 'na lateral põe uma promoção de café' }], escopo: null, ctx: {} });
  assert.deepEqual(zonas(so), { principal: 0, lateral: 2, cabecalho: 0, rodape: 0 });
  const tudo = await C.conversar({ mensagens: [{ papel: 'pessoa', texto: 'uma promoção de café' }], escopo: null, ctx: {} });
  assert.ok(zonas(tudo).principal > 0, 'sem zona dita, a IA decide');
});
