/*
 * server/ai-briefing.js — a conversa antes da campanha.
 *
 * Por que existe: uma frase ("promoção de café da manhã") não tem o que uma
 * campanha boa precisa — para quem, por que agora, qual a prova, o que NÃO
 * dizer. O diretor até deduz sozinho (enriquecerBrief), mas deduzir é chutar
 * com educação. Perguntar custa 30 segundos do usuário e melhora tudo que vem
 * depois, porque plano, copy e layout são todos feitos em cima do briefing.
 *
 * Regras que definem a qualidade desta etapa:
 *
 *   UMA pergunta por vez. Formulário de seis campos as pessoas abandonam;
 *   uma pergunta por vez elas respondem.
 *
 *   Nunca perguntar o que já se sabe. Cor, fonte, logo e tom vêm da Marca; o
 *   acervo de fotos o sistema já leu. Perguntar isso destrói a confiança —
 *   o usuário cadastrou e o sistema fingiu não ter visto.
 *
 *   Parar cedo. O objetivo é campanha no ar, não entrevista. Quando o que
 *   falta não muda a peça, o briefing está pronto.
 */
const ai = require('./ai');

const MAX_PERGUNTAS = 5;

const SISTEMA = `Você é planner de comunicação conversando com um pequeno empresário
brasileiro para entender a campanha que ele quer. Fala simples, sem jargão.

COMO CONDUZIR:
- Faça UMA pergunta por vez, curta, que caiba numa linha.
- Pergunte só o que MUDA a peça: o que está sendo anunciado, para quem, por que
  agora, qual o diferencial concreto, o que fazer (CTA), até quando vale.
- NUNCA pergunte cor, fonte, logo, estilo visual ou formato: isso o sistema já
  tem cadastrado. Perguntar isso quebra a confiança do usuário.
- NUNCA pergunte duas coisas na mesma frase.
- Se a pessoa já respondeu algo, não repita a pergunta de outro jeito.
- Se a resposta for vaga, aceite e siga: é melhor uma campanha boa hoje que uma
  entrevista perfeita. Deduza o resto.
- No máximo ${MAX_PERGUNTAS} perguntas no total. Pare antes se já der para fazer
  uma campanha honesta.

Ofereça de 2 a 4 SUGESTÕES de resposta quando elas ajudarem a pessoa a decidir
rápido (ex.: públicos comuns, prazos típicos). Sugestão é atalho, não gaiola.

Responda APENAS JSON:
{
  "pronto": false,
  "pergunta": "a próxima pergunta, uma só",
  "sugestoes": ["atalho 1", "atalho 2"],
  "porque": "por que esta pergunta muda a peça, meia linha"
}
Quando já entendeu o bastante:
{
  "pronto": true,
  "resumo": {
    "objetivo": "o que a campanha precisa fazer acontecer",
    "publico": "quem vê e o que essa pessoa quer",
    "argumento": "a razão que convence",
    "urgencia": "por que agir agora — vazio se não houver",
    "provas": ["fato concreto dito pela pessoa"],
    "evitar": ["promessa ou clichê que esta campanha não deve fazer"],
    "oferta": "o CTA concreto — vazio se não houver",
    "formatos": ["16/9"],
    "briefing": "parágrafo único juntando tudo, para o diretor de arte ler"
  }
}
Nunca invente preço, data ou nome que a pessoa não disse.
Português do Brasil.`;

const memoria = require('./ai-memoria');

function contextoDoSistema(ctx) {
  const c = ctx || {};
  const m = c.marca || {};
  const linhas = [
    c.empresa ? `Empresa: ${c.empresa}` : '',
    c.segmento ? `Segmento: ${c.segmento}` : '',
    m.tom ? `Tom já definido pela empresa: ${m.tom}` : '',
    m.observacoes ? `Regras da marca: ${m.observacoes}` : '',
    (m.cores && m.cores.length) ? 'A empresa JÁ tem cores cadastradas — não pergunte sobre cor.' : '',
    m.logo ? 'A empresa JÁ tem logo cadastrada — não pergunte sobre logo.' : '',
    (m.bases && m.bases.length)
      ? `A empresa tem ${m.bases.length} foto(s) próprias no acervo: ${m.bases.map((b) => b.label || 'sem descrição').join('; ')}. Não pergunte se ela tem fotos.`
      : '',
  ].filter(Boolean);
  const declarado = linhas.length ? 'O QUE O SISTEMA JÁ SABE (não pergunte de novo):\n' + linhas.join('\n') : '';
  /*
   * A memória entra aqui, e é o que faz a segunda campanha ser melhor que a
   * primeira: a conversa já começa sabendo o negócio, o público e o que não
   * prometer. Sem isso o chat repetiria as mesmas perguntas para sempre.
   */
  const aprendido = memoria.comoTexto(c.memoria);
  return [declarado, aprendido].filter(Boolean).join('\n\n');
}

function transcricao(mensagens) {
  return (mensagens || []).slice(0, 24).map((m) => {
    const quem = m && m.papel === 'ia' ? 'Você perguntou' : 'Pessoa respondeu';
    return `${quem}: ${String((m && m.texto) || '').slice(0, 600)}`;
  }).join('\n');
}

const lista = (v, n, tam) => (Array.isArray(v) ? v : [])
  .map((x) => String(x || '').slice(0, tam)).filter(Boolean).slice(0, n);

/*
 * Sem chave de IA a conversa não acontece — mas o fluxo não pode morrer. Aqui
 * devolvemos "pronto" com o que o usuário já escreveu, e o diretor segue com o
 * caminho normal. Modo demonstração não deve fingir uma entrevista.
 */
function semIA(mensagens) {
  const ditas = (mensagens || []).filter((m) => m && m.papel !== 'ia').map((m) => m.texto);
  return {
    pronto: true,
    resumo: {
      objetivo: '', publico: '', argumento: '', urgencia: '',
      provas: [], evitar: [], oferta: '', formatos: [],
      briefing: ditas.join(' ').slice(0, 900),
    },
    modo: 'dev',
  };
}

async function conversar(mensagens, ctx) {
  if (ai.mode() === 'dev') return semIA(mensagens);

  const perguntasFeitas = (mensagens || []).filter((m) => m && m.papel === 'ia').length;
  const usuario = [
    contextoDoSistema(ctx),
    '',
    'CONVERSA ATÉ AGORA:',
    transcricao(mensagens) || '(a pessoa ainda não disse nada)',
    '',
    perguntasFeitas >= MAX_PERGUNTAS - 1
      ? 'Este é o limite de perguntas. Feche o briefing agora com o que tem, deduzindo o que faltar.'
      : `Você já fez ${perguntasFeitas} pergunta(s) de no máximo ${MAX_PERGUNTAS}.`,
  ].filter(Boolean).join('\n');

  let r;
  try {
    r = ai.parseAiJson(await ai.callLLM(SISTEMA, usuario));
  } catch (e) {
    // A conversa é um facilitador: se ela cair, o usuário ainda gera a campanha
    // com o que escreveu. Travar aqui seria pior que não ter chat nenhum.
    return semIA(mensagens);
  }

  /*
   * O limite de perguntas é imposto pelo CÓDIGO, não pedido ao modelo. Um
   * modelo animado entrevistaria o usuário por dez turnos, e a promessa do
   * produto é campanha rápida.
   */
  if (!r || r.pronto === true || perguntasFeitas >= MAX_PERGUNTAS) {
    const s = (r && r.resumo) || {};
    return {
      pronto: true,
      resumo: {
        objetivo: String(s.objetivo || '').slice(0, 220),
        publico: String(s.publico || '').slice(0, 220),
        argumento: String(s.argumento || '').slice(0, 220),
        urgencia: String(s.urgencia || '').slice(0, 160),
        provas: lista(s.provas, 4, 140),
        evitar: lista(s.evitar, 4, 140),
        oferta: String(s.oferta || '').slice(0, 80),
        formatos: lista(s.formatos, 4, 8),
        briefing: String(s.briefing || transcricao(mensagens)).slice(0, 1200),
      },
    };
  }

  const pergunta = String(r.pergunta || '').slice(0, 220);
  if (!pergunta) return conversar(mensagens.concat({ papel: 'ia', texto: '' }), ctx);
  return {
    pronto: false,
    pergunta,
    sugestoes: lista(r.sugestoes, 4, 60),
    porque: String(r.porque || '').slice(0, 140),
    restantes: Math.max(0, MAX_PERGUNTAS - perguntasFeitas - 1),
  };
}

module.exports = { conversar, MAX_PERGUNTAS, contextoDoSistema };
