/*
 * O chat de briefing decide a qualidade de tudo que vem depois: plano, copy e
 * layout são feitos em cima do que ele apurou. Estes testes protegem as regras
 * que fazem a conversa ser útil em vez de chata.
 *
 * O modelo é simulado: o que interessa aqui é o comportamento do CÓDIGO em
 * volta dele — limite de perguntas, o que vai no contexto, e o que acontece
 * quando o modelo falha.
 */
const test = require('node:test');
const assert = require('node:assert');
const ai = require('../server/ai');
const briefing = require('../server/ai-briefing');

// Faz o módulo se comportar como se houvesse chave, e controla a resposta.
function comModelo(responder, fn) {
  const mode = ai.mode, call = ai.callLLM;
  ai.mode = () => 'real';
  ai.callLLM = async (sistema, usuario) => responder(sistema, usuario);
  return Promise.resolve(fn()).finally(() => { ai.mode = mode; ai.callLLM = call; });
}

const pergunta = () => JSON.stringify({
  pronto: false, pergunta: 'Para quem é essa promoção?',
  sugestoes: ['Quem passa na rua', 'Clientes fiéis'], porque: 'muda o tom da peça',
});

test('sem chave de IA, devolve pronto com o que a pessoa escreveu', async () => {
  const r = await briefing.conversar([{ papel: 'pessoa', texto: 'promoção de café' }], {});
  assert.equal(r.pronto, true);
  assert.equal(r.resumo.briefing, 'promoção de café');
});

test('devolve uma pergunta por vez, com atalhos', async () => {
  await comModelo(pergunta, async () => {
    const r = await briefing.conversar([{ papel: 'pessoa', texto: 'promoção de café' }], {});
    assert.equal(r.pronto, false);
    assert.equal(r.pergunta, 'Para quem é essa promoção?');
    assert.equal(r.sugestoes.length, 2);
    assert.ok(r.restantes < briefing.MAX_PERGUNTAS);
  });
});

test('o limite de perguntas é imposto pelo código, não confiado ao modelo', async () => {
  // Modelo "animado" que nunca fecha: entrevistaria o usuário para sempre.
  const historico = [];
  for (let i = 0; i < briefing.MAX_PERGUNTAS; i++) {
    historico.push({ papel: 'ia', texto: 'p' + i }, { papel: 'pessoa', texto: 'r' + i });
  }
  await comModelo(pergunta, async () => {
    const r = await briefing.conversar(historico, {});
    assert.equal(r.pronto, true, 'passou do limite e continuou perguntando');
  });
});

test('falha do modelo não trava o fluxo — a campanha ainda é gerável', async () => {
  await comModelo(() => { throw new Error('modelo fora do ar'); }, async () => {
    const r = await briefing.conversar([{ papel: 'pessoa', texto: 'promoção de café' }], {});
    assert.equal(r.pronto, true);
    assert.ok(r.resumo.briefing.includes('café'));
  });
});

/*
 * A regra mais importante da conversa: nunca perguntar o que a empresa já
 * cadastrou. Perguntar a cor de quem acabou de cadastrar a cor é o jeito mais
 * rápido de o sistema parecer burro.
 */
test('o contexto avisa o modelo do que já está cadastrado', () => {
  const ctx = {
    empresa: 'Padaria Sol',
    marca: {
      cores: ['#ff4d00'], logo: '/media/logo.png', tom: 'acolhedor',
      bases: [{ url: '/media/a.jpg', label: 'fachada da loja' }],
    },
  };
  const texto = briefing.contextoDoSistema(ctx);
  assert.ok(/não pergunte sobre cor/i.test(texto));
  assert.ok(/não pergunte sobre logo/i.test(texto));
  assert.ok(/Não pergunte se ela tem fotos/i.test(texto));
  assert.ok(texto.includes('fachada da loja'), 'o rótulo da foto ajuda a IA a não perguntar o óbvio');
  assert.ok(texto.includes('acolhedor'));
});

test('empresa sem marca cadastrada não gera contexto vazio de ruído', () => {
  assert.equal(briefing.contextoDoSistema({}), '');
});

test('o resumo pronto respeita os limites de tamanho', async () => {
  const gigante = 'x'.repeat(5000);
  const resposta = () => JSON.stringify({
    pronto: true,
    resumo: {
      objetivo: gigante, publico: gigante, argumento: gigante, urgencia: gigante,
      provas: Array(20).fill(gigante), evitar: Array(20).fill(gigante),
      oferta: gigante, formatos: ['16/9'], briefing: gigante,
    },
  });
  await comModelo(resposta, async () => {
    const r = await briefing.conversar([{ papel: 'pessoa', texto: 'oi' }], {});
    assert.ok(r.resumo.objetivo.length <= 220);
    assert.ok(r.resumo.provas.length <= 4);
    assert.ok(r.resumo.briefing.length <= 1200);
  });
});
