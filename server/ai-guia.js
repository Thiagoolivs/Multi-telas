/*
 * server/ai-guia.js — o chat OFERECE em vez de entrevistar.
 *
 * O briefing que existia perguntava uma coisa aberta por vez: "para quem é?",
 * "por que agora?". Isso exige que a pessoa JÁ TENHA a resposta formulada — e
 * quem tem padaria não pensa em campanha nesses termos. Ela trava, escreve
 * "sei lá, promoção", e a IA decide tudo.
 *
 * Reconhecer é muito mais fácil que lembrar. Então em vez de perguntar, o
 * guia PROPÕE três campanhas concretas para aquele negócio — "um cartaz para
 * a TV do balcão com foto do pão saindo do forno" — e cada proposta já vem com
 * o formulário preenchido. A pessoa clica numa, ajusta o que quiser, confirma.
 *
 * A DIVISÃO QUE IMPORTA, e é o que mantém isto barato e testável:
 *
 *   Os EIXOS são fixos. Onde, quantas, imagem, animação — são finitos e
 *   conhecidos, e estão nas tabelas abaixo. O modelo escolhe DENTRO delas;
 *   valor que não está na tabela é descartado, não corrigido. Eixo gerado
 *   traria imprevisibilidade, custo por turno, e uma superfície que eval
 *   nenhum consegue medir.
 *
 *   O CONTEÚDO é gerado. "Foto do pão na chapa saindo do forno" só faz
 *   sentido para padaria, e é aqui que a IA ganha de qualquer formulário
 *   fixo. Custa uma chamada de texto — R$ 0,05.
 */
'use strict';

const ai = require('./ai');

/*
 * Os eixos. São o contrato com o resto do sistema: `formatos` e `imagens`
 * batem com `lerPedido` no diretor, e `entrada`/`continua` batem com o
 * vocabulário de js/animacao.js. Inventar um valor aqui quebraria silenciosamente
 * lá na frente, então nada entra sem estar nesta tabela.
 */
const ONDE = {
  '16/9': 'TV deitada — a da recepção, do balcão, do refeitório',
  '9/16': 'TV em pé ou Story — vitrine, corredor, Instagram',
  '1/1': 'Post quadrado — feed do Instagram',
  '21/9': 'Faixa larga — painel comprido, topo de parede',
};
const IMAGENS = {
  gerar: 'a IA desenha a foto (custa 1 crédito por peça)',
  acervo: 'usa as fotos que a empresa já subiu (sem custo)',
  nenhuma: 'só tipografia e cor (sem custo)',
};
const ENTRADA = ['', 'aparecer', 'subir', 'descer', 'esquerda', 'direita', 'crescer', 'estourar', 'girar'];
const CONTINUA = ['', 'flutuar', 'pulsar', 'balancar', 'brilhar'];

const MAX_SUGESTOES = 3;

const SISTEMA = `Você é quem recebe um pequeno empresário brasileiro que quer pôr
conteúdo nas TVs do próprio negócio e NÃO SABE O QUE PEDIR. Ele não é
publicitário e não conhece o vocabulário.

Seu trabalho não é perguntar: é OFERECER. Proponha ${MAX_SUGESTOES} campanhas
concretas para o negócio dele, do jeito que um vizinho experiente sugeriria —
específicas, não genéricas. "Foto do pão na chapa saindo do forno às 7h" serve;
"campanha institucional" não serve.

CADA SUGESTÃO PRECISA SER ÓBVIA DE ENTENDER
- O título é o que vai na TV, em poucas palavras.
- O "porque" é uma frase curta dizendo por que aquilo funciona NAQUELE
  negócio. Nada de teoria de marketing.
- Varie o propósito entre as três: uma que vende, uma que informa, uma que
  cria vínculo (aniversário, agradecimento, equipe). Três promoções seguidas
  é o que ele já faria sozinho.

DINHEIRO
Cada foto gerada por IA custa um crédito do bolso dele. Foto do acervo e peça
só de texto não custam nada. Não proponha as três com foto gerada: ofereça ao
menos uma sem custo, e diga isso no "porque" quando for o caso.
Quantidade entre 1 e 4. Mais que isso ninguém troca na parede.

Responda APENAS JSON:
{
  "abertura": "uma frase falando com ELE, citando o negócio dele",
  "sugestoes": [
    {
      "titulo": "o que vai na TV, curto",
      "porque": "por que isso funciona aqui, uma frase",
      "brief": "o pedido completo, como se ele tivesse escrito bem",
      "formatos": ["16/9"],
      "quantidade": 2,
      "imagens": "gerar" | "acervo" | "nenhuma",
      "entrada": "subir",
      "continua": ""
    }
  ]
}
Português do Brasil, sem jargão.`;

function contexto(ctx) {
  const c = ctx || {};
  const m = c.marca || {};
  const linhas = [
    c.empresa ? 'Negócio: ' + c.empresa : '',
    c.segmento ? 'Ramo: ' + c.segmento : '',
    m.tom ? 'Tom da marca: ' + m.tom : '',
    (m.cores && m.cores.length) ? 'Cores da marca já cadastradas.' : '',
    /*
     * O acervo muda o que vale a pena propor: com foto própria, a sugestão
     * mais barata é usá-la — e é também a mais verdadeira, porque mostra o
     * produto real em vez de um genérico bonito.
     */
    (m.bases && m.bases.length)
      ? `A empresa tem ${m.bases.length} foto(s) próprias: ${m.bases.map((b) => b.label || 'sem descrição').join('; ')}. `
        + 'Proponha ao menos uma campanha usando ELAS ("imagens": "acervo").'
      : 'A empresa não subiu fotos próprias.',
    c.telas ? `Tem ${c.telas} tela(s) pareada(s).` : '',
  ].filter(Boolean);

  const opcoes = [
    'ONDE a peça pode aparecer (use só estes):',
    ...Object.entries(ONDE).map(([k, v]) => `  "${k}" — ${v}`),
    'O QUE FAZER COM IMAGEM (use só estes):',
    ...Object.entries(IMAGENS).map(([k, v]) => `  "${k}" — ${v}`),
    'ANIMAÇÃO de entrada (use só estes): ' + ENTRADA.filter(Boolean).join(', ') + ' — ou "" para nenhuma.',
    'ANIMAÇÃO contínua (use só estes): ' + CONTINUA.filter(Boolean).join(', ') + ' — ou "" para parado.',
  ].join('\n');

  return [linhas.join('\n'), '', opcoes].join('\n');
}

/*
 * Peneira. O modelo escolhe DENTRO das tabelas; o que não está nelas é
 * descartado, não corrigido — corrigir esconderia que ele saiu do combinado, e
 * um valor inventado que passasse daqui quebraria calado no diretor.
 */
function sanear(s) {
  const formatos = (Array.isArray(s.formatos) ? s.formatos : [])
    .filter((f) => Object.prototype.hasOwnProperty.call(ONDE, f)).slice(0, 4);
  const q = Number(s.quantidade);
  return {
    titulo: String(s.titulo || '').slice(0, 60),
    porque: String(s.porque || '').slice(0, 140),
    brief: String(s.brief || '').slice(0, 400),
    formatos: formatos.length ? formatos : ['16/9'],
    quantidade: Number.isFinite(q) ? Math.min(4, Math.max(1, Math.round(q))) : 2,
    imagens: Object.prototype.hasOwnProperty.call(IMAGENS, s.imagens) ? s.imagens : 'nenhuma',
    entrada: ENTRADA.includes(s.entrada) ? s.entrada : '',
    continua: CONTINUA.includes(s.continua) ? s.continua : '',
  };
}

/*
 * Sem chave de IA o guia não some: um cardápio fixo é melhor que tela vazia,
 * e é o que faz o fluxo inteiro ser percorrível em desenvolvimento e no eval.
 * Genérico de propósito — fingir especificidade que não existe seria pior.
 */
function semIA(ctx) {
  const nome = (ctx && ctx.empresa) || 'seu negócio';
  const temAcervo = !!(ctx && ctx.marca && ctx.marca.bases && ctx.marca.bases.length);
  return {
    abertura: `Algumas ideias para ${nome}. Escolha uma e ajuste como quiser.`,
    sugestoes: [
      { titulo: 'Promoção da semana', porque: 'quem passa na frente decide na hora',
        brief: 'promoção da semana', formatos: ['16/9'], quantidade: 2,
        imagens: temAcervo ? 'acervo' : 'nenhuma', entrada: 'subir', continua: '' },
      { titulo: 'Horário de funcionamento', porque: 'a pergunta mais repetida no balcão',
        brief: 'nosso horário de funcionamento', formatos: ['16/9'], quantidade: 1,
        imagens: 'nenhuma', entrada: 'aparecer', continua: '' },
      { titulo: 'Aniversariantes do mês', porque: 'a equipe vê e comenta',
        brief: 'parabéns aos aniversariantes do mês', formatos: ['16/9'], quantidade: 1,
        imagens: 'nenhuma', entrada: 'crescer', continua: 'flutuar' },
    ],
    modo: 'dev',
  };
}

async function sugerir(ctx) {
  if (ai.mode() === 'dev') return semIA(ctx);
  let r;
  try { r = ai.parseAiJson(await ai.callLLM(SISTEMA, contexto(ctx))); }
  catch (e) {
    // O guia é um facilitador. Se ele cair, a pessoa ainda escreve à mão —
    // travar aqui seria pior que não ter guia nenhum.
    return semIA(ctx);
  }
  const lista = (Array.isArray(r && r.sugestoes) ? r.sugestoes : []).slice(0, MAX_SUGESTOES).map(sanear);
  if (!lista.length) return semIA(ctx);
  return { abertura: String((r && r.abertura) || '').slice(0, 200), sugestoes: lista };
}

module.exports = { sugerir, ONDE, IMAGENS, ENTRADA, CONTINUA, MAX_SUGESTOES, sanear };
