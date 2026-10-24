/*
 * server/assistente.js — o assistente do Criar: um MAESTRO e as FERRAMENTAS
 * (pedido do dono, 24/10/2026: "a IA não está entendendo direito os
 * comandos; refinar o system prompt, criar agentes e delegar tarefas,
 * melhorar a chamada de tools").
 *
 * O Criar só sabia montar campanha de peças. "Quiz de duas perguntas na
 * lateral" virava duas peças estáticas; "muda o fundo da TV" virava dúvida;
 * "arruma a campanha que está rodando" também. A medição de partida, com a
 * IA de verdade, deu 14 de 30 (docs/AVALIACAO-ASSISTENTE-atual-ia.md).
 *
 * Agora, a cada fala:
 *   1. o MAESTRO entende o pedido e chama UMA ferramenta (chamada de função
 *      nativa do provedor — server/motores.js), com os argumentos;
 *   2. o ESPECIALISTA daquela ferramenta faz o trabalho, com o prompt dele:
 *        criar_quiz       → server/quiz-ia.js (as perguntas, para conferir)
 *        criar_aviso      → server/aviso-rapido.js
 *        mudar_tela       → server/ajuste-tela.js (a aparência de uma TV)
 *        campanha         → server/ai-conversa.js (o escopo, o esboço, gerar)
 *        editar_campanha  → abre a campanha em Criados, no Editar com a IA
 *        tirar_duvida     → a resposta curta, com o caminho do painel
 *        perguntar        → quando não dá para saber o que a pessoa quer
 *   3. o painel mostra o resultado (o quiz, o aviso, a TV antes e depois) e
 *      só o "ok" da pessoa muda alguma coisa nas TVs.
 *
 * Sem IA (servidor local, testes) ou com a IA fora do ar, o mesmo maestro
 * escolhe a ferramenta POR REGRA — as mesmas ferramentas, então o fluxo
 * inteiro continua testável e a pessoa nunca fica com um roteiro que pergunta
 * de Instagram num pedido de quiz.
 *
 * A tarefa em andamento mora na última mensagem da IA (ferramenta e
 * argumentos): "não, só na lateral", "pode gerar" e "vc entendeu?" voltam
 * para ela em vez de começar outra coisa.
 */
'use strict';
const ai = require('./ai');
const motores = require('./motores');
const conversa = require('./ai-conversa');
const quizIA = require('./quiz-ia');
const avisoRapido = require('./aviso-rapido');
const ajusteTela = require('./ajuste-tela');
const E = require('../js/escopo.js');

const plano = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const corta = (s, n) => String(s == null ? '' : s).replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);
const lista = (v, n, tam) => (Array.isArray(v) ? v : []).map((x) => corta(x, tam)).filter(Boolean).slice(0, n);

const INTENCAO = {
  criar_quiz: 'quiz', criar_aviso: 'aviso', mudar_tela: 'tela', campanha: 'campanha',
  editar_campanha: 'editar', tirar_duvida: 'duvida', perguntar: 'perguntar',
};

/* ---------------- As ferramentas ---------------- */

const texto = (descricao) => ({ type: 'string', description: descricao });
// Dois pedidos numa fala (revisão do consultor, #299): a ferramenta faz o primeiro e DIZ que viu o segundo.
const OUTRO = texto('Só quando a fala traz um SEGUNDO pedido (ex.: "faz um quiz sobre café e um aviso de que fechamos às 18h"): o segundo pedido, nas palavras dela ("um aviso de que fechamos às 18h"). Senão vazio.');
// Quiz bom na TV tem poucas perguntas: cada uma passa em ~17 s (10 para responder, 7 para a resposta).
const MAX_PERGUNTAS = 5;
const FERRAMENTAS = [
  {
    nome: 'criar_quiz',
    descricao: 'Criar um QUIZ para passar na TV: perguntas com alternativas, o tempo correndo e a resposta certa aparecendo depois, com uma explicação. Use quando a pessoa fala em quiz (ou "quis", "perguntas e respostas", "teste de conhecimento", "curiosidades com pergunta").',
    parametros: {
      type: 'object',
      properties: {
        tema: texto('O assunto das perguntas, nas palavras da pessoa (ex.: "curiosidades de pão e confeitaria"). Vazio se ela não disse.'),
        quantidade: { type: 'integer', description: 'Quantas perguntas ela pediu, o número que ela disse ("duas" = 2, "três" = 3), mesmo se for mais de ' + MAX_PERGUNTAS + '. Se ela não disse, 3.' },
        zona: { type: 'string', enum: ['principal', 'lateral'], description: 'Onde o quiz passa na TV. "lateral" quando ela fala de lateral, tela lateral, coluna do lado. Senão "principal".' },
        tv: texto('O nome EXATO de uma TV da lista, quando ela fala de uma TV só (uma que não está na lista: o nome como ela disse). Vazio = todas as TVs.'),
        outro_pedido: OUTRO,
      },
      required: ['tema', 'quantidade', 'zona', 'tv'],
    },
  },
  {
    nome: 'criar_aviso',
    descricao: 'Pôr um AVISO curto nas TVs: horário, feriado, loja fechada, piso molhado, reunião, recado para a equipe ou para os clientes. Não é promoção.',
    parametros: {
      type: 'object',
      properties: { pedido: texto('O aviso inteiro nas palavras da pessoa, juntando o que ela disse na conversa (ex.: "amanhã a loja abre às 10h").'), outro_pedido: OUTRO },
      required: ['pedido'],
    },
  },
  {
    nome: 'mudar_tela',
    descricao: 'Mudar a APARÊNCIA de uma TV: layout, tema claro ou escuro, cor do fundo, cores, relógio, clima, data, letra. Não cria conteúdo.',
    parametros: {
      type: 'object',
      properties: {
        tv: texto('O nome EXATO da TV da lista (uma que não está na lista: o nome como ela disse). Vazio se ela não disse qual.'),
        pedido: texto('A mudança nas palavras da pessoa (ex.: "fundo azul", "tirar o relógio").'),
        outro_pedido: OUTRO,
      },
      required: ['tv', 'pedido'],
    },
  },
  {
    nome: 'campanha',
    descricao: 'Criar conteúdo NOVO de divulgação para as TVs (e, se ela quiser, para as redes): promoção, produto, lançamento, data comemorativa, peças. Também continuar a campanha que está sendo combinada nesta conversa (fotos, redes, horários, quantas peças, "pode gerar").',
    parametros: {
      type: 'object',
      properties: { pedido: texto('O que ela quer divulgar, nas palavras dela.'), outro_pedido: OUTRO },
      required: ['pedido'],
    },
  },
  {
    nome: 'editar_campanha',
    descricao: 'Mudar uma campanha JÁ CRIADA ou que já está passando nas TVs: trocar preço, texto, foto, tirar ou pôr uma peça ("a peça 2", "a campanha do dia das mães", "a que está rodando").',
    parametros: {
      type: 'object',
      properties: {
        campanha: texto('O nome da campanha que ela citou, como na lista de CAMPANHAS CRIADAS. Vazio se ela não disse qual.'),
        pedido: texto('O que mudar, nas palavras dela.'),
        outro_pedido: OUTRO,
      },
      required: ['campanha', 'pedido'],
    },
  },
  {
    nome: 'tirar_duvida',
    descricao: 'Responder uma DÚVIDA sobre como usar o MultiTelas (ligar TV, planos, onde fica tal coisa, aniversariantes, mural). Não cria nada.',
    parametros: {
      type: 'object',
      properties: { resposta: texto('A resposta curta (até 3 frases), com o caminho no painel, só os caminhos da AJUDA. Se não souber, indique Conta › Suporte.') },
      required: ['resposta'],
    },
  },
  {
    nome: 'perguntar',
    descricao: 'Perguntar o que falta SÓ quando não dá para saber o que a pessoa quer (um "oi", um "deixa pra lá" sem nada combinado). Nunca para confirmar uma tarefa que já está clara.',
    parametros: {
      type: 'object',
      properties: {
        pergunta: texto('Uma pergunta curta, com uma proposta junto.'),
        sugestoes: { type: 'array', items: { type: 'string' }, description: '2 a 4 respostas prontas, curtas, na voz da pessoa.' },
      },
      required: ['pergunta', 'sugestoes'],
    },
  },
];
const NOMES = FERRAMENTAS.map((f) => f.nome);

const SISTEMA = `Você é o maestro da assistente do MultiTelas, o sistema de TVs de comércios e
empresas no Brasil. A pessoa escreve como fala (às vezes com erro de
digitação). Sua ÚNICA tarefa em cada fala: escolher a ferramenta certa e
preencher os argumentos. Quem conversa com a pessoa é a ferramenta.

COMO ESCOLHER:
1. Leia a TAREFA EM ANDAMENTO (se houver). Se a fala nova CORRIGE, COMPLETA ou
   CONFIRMA essa tarefa — "não, só na lateral", "3 perguntas", "na TV do
   balcão", "pode gerar", "isso", "vc entendeu?", "entendeu?" —, chame A MESMA
   ferramenta, com os argumentos de antes atualizados pelo que ela disse.
   Correção não é pedido novo. "Entendeu?" é pedir confirmação: repita a
   mesma ferramenta com os mesmos argumentos.
2. Só troque de ferramenta quando ela pedir OUTRA coisa ("na verdade quero só
   um aviso", "agora muda o fundo da TV").
3. Sem tarefa em andamento, pelo assunto:
   - quiz, perguntas e respostas → criar_quiz
   - recado curto, horário, fechado, feriado, cuidado, reunião → criar_aviso
   - aparência de UMA TV (fundo, tema, cores, layout, relógio, clima) → mudar_tela
   - promoção, produto, lançamento, data comemorativa, divulgar, peças → campanha
   - mudar o que já foi criado ou já está passando → editar_campanha
   - pergunta sobre como usar o sistema → tirar_duvida
   - não dá para saber ("oi", "tudo bem?") → perguntar
4. Dois pedidos numa fala só: escolha o primeiro e ponha o segundo em
   outro_pedido (a ferramenta avisa que viu e faz em seguida).
5. "Deixa pra lá", "esquece", "cancela": perguntar o que ela quer agora, sem
   mandar gerar nada.
6. Correção que muda a TV ou o lugar ("não, na TV da entrada", "põe na
   lateral") continua na MESMA ferramenta, com o argumento novo.

ARGUMENTOS:
- Nunca invente preço, data, nome, horário ou TV que a pessoa não disse.
- TV: o nome da lista que ela citou; vazio = todas. Se ela citar uma TV que
  NÃO está na lista, ponha o nome como ela disse (a ferramenta avisa).
- Quantidade do quiz: o número que ela disse ("duas" = 2), mesmo que seja
  muito; sem número, 3. A ferramenta conversa se passar de ${MAX_PERGUNTAS}.
- Zona do quiz: "lateral" se ela falou de lateral (ou "tela lateral", "coluna
  do lado"); senão "principal".`;

/* ---------------- A tarefa em andamento ---------------- */

// A última coisa que a IA estava fazendo nesta conversa: { ferramenta, args, acao }.
function tarefaDe(mensagens, escopo) {
  const ia = [...(mensagens || [])].reverse().find((m) => m && m.papel === 'ia' && !m.falha);
  if (ia && NOMES.includes(ia.ferramenta)) return { ferramenta: ia.ferramenta, args: ia.args || {}, acao: ia.acao || null, pergunta: !!ia.pergunta };
  // Conversa de antes do assistente: se já tem campanha combinada, é ela que está em andamento.
  if (E.temOQueGerar(E.normalizar(escopo))) return { ferramenta: 'campanha', args: {}, acao: null };
  return null;
}

const falasDaPessoa = (mensagens) => (mensagens || []).filter((m) => m && m.papel === 'pessoa').map((m) => String(m.texto || ''));
const transcricao = (mensagens) => (mensagens || []).filter((m) => m && !m.falha).slice(-12)
  .map((m) => (m.papel === 'ia' ? 'Assistente' : 'Pessoa') + ': ' + corta(m.texto, 400)).join('\n');

/* ---------------- Sem IA: as mesmas ferramentas, por regra ---------------- */

const NUMEROS = { um: 1, uma: 1, dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5, seis: 6 };
function quantidadeDe(t) {
  const s = plano(t);
  const m = /(\d+|uma?|dois|duas|tres|quatro|cinco|seis)\s+(?:\w+\s+)?pergunta/.exec(s) || /pergunta\w*\s*(?:de\s+)?(\d+)/.exec(s);
  if (!m) return null;
  // O número que ela disse, mesmo grande: o especialista do quiz é quem conversa acima do teto.
  const n = /^\d+$/.test(m[1]) ? Number(m[1]) : NUMEROS[m[1]];
  return n ? Math.max(1, Math.min(99, n)) : null;
}
// "faz um quiz sobre café e um aviso de que fechamos às 18h" → [o primeiro, o segundo].
const SEGUNDO = /\s+e\s+(?:tamb[eé]m\s+)?(?=(?:um|uma)\s+(?:aviso|recado|quiz|quis|promo[cç][aã]o|campanha|post)\b)/i;
function partirPedidos(t) {
  const m = SEGUNDO.exec(String(t || ''));
  return m ? [t.slice(0, m.index).trim(), corta(t.slice(m.index + m[0].length), 200)] : [t, ''];
}
function tvDe(t, telas) {
  const s = plano(t);
  return (telas || []).filter((x) => x.nome && s.includes(plano(x.nome)))
    .sort((a, b) => b.nome.length - a.nome.length)[0] || null;
}
const zonaDe = (t) => (/\b(lateral|coluna|do lado)\b/.test(plano(t)) ? 'lateral' : /\bprincipal\b/.test(plano(t)) ? 'principal' : null);
function temaDe(t) {
  const m = /\bsobre\s+(.+)$/i.exec(String(t || ''));
  return m ? corta(m[1].replace(/\s+(na|para a|pra)\s+(tela\s+)?(lateral|principal).*$/i, '').replace(/\s+(na|para a|pra)\s+tv\b.*$/i, '').replace(/[.!?]+$/, ''), 120) : '';
}
// "na TV da entrada": a TV que a pessoa disse, mesmo que não seja da conta (o especialista confere e pergunta).
function tvDitaDe(t) {
  const m = /\b(?:na|para a|pra)\s+(tv\s+(?:d[aoe]s?\s+)?[^\s,.;!?]+)/i.exec(String(t || ''));
  return m ? corta(m[1], 60) : '';
}

const QUIZ = /\bqui[sz]\b|perguntas? e respostas?|teste de conhecimento/;
const EDITAR = /\b(mud|troc|arrum|alter|corrig|edit|ajust)\w*\b.{0,40}\bcampanha\b|\bcampanha\b.{0,40}\b(rodando|criada|no ar|passando)\b|\bpeca \d+\b/;
const TELA = /\b(fundo|tema|layout|relogio|clima|aparencia|visual|cores? da tv|letra da tv)\b/;
const MUDAR = /\b(mud|troc|tir|deix|coloc|poe|por|bot|ponha|tira)\w*/;
const OI = /^(oi+|ola|bom dia|boa tarde|boa noite|e ai|opa|tudo bem)\b[\s!?.]*$/;
const DESISTE = /\b(deixa pra la|deixa para la|esquece|cancela|desisti|nao quero mais)\b/;
const CORRECAO = /^(nao\b|isso\b|sim\b|ok\b|so\b|apenas\b|quero so\b|pode (gerar|fazer|criar|ser)|perfeito|beleza|certo)|entendeu|\b\d+\s*perguntas?\b|\b(na|para a|pra) (tela |area )?(lateral|principal)\b|\bna tv\b/;
// Uma coisa nova no pedido: com ela, "na verdade..." é outra tarefa; sem ela, é corrigir a de agora.
const COISA_NOVA = /\bqui[sz]\b|\bavis[aeo]r?\b|\bpromoc|\bcampanha\b|\boferta\b|\bpost\b|\bfundo\b|\btema\b|\blayout\b/;

function argsDoQuiz(t, antes, telas) {
  const a = antes || {};
  const tv = tvDe(t, telas);
  return {
    tema: temaDe(t) || a.tema || '',
    quantidade: quantidadeDe(t) || a.quantidade || 3,
    zona: zonaDe(t) || a.zona || 'principal',
    tv: tv ? tv.nome : (tvDitaDe(t) || a.tv || ''),
  };
}

// As ferramentas que fazem uma coisa e podem dizer "o outro pedido eu faço em seguida".
const FAZEM = ['criar_quiz', 'criar_aviso', 'mudar_tela', 'campanha', 'editar_campanha'];
function escolherPorRegra(textoFala, tarefa, ctx) {
  const [primeiro, outro] = partirPedidos(textoFala);
  const e = escolherUm(primeiro, tarefa, ctx);
  return outro && FAZEM.includes(e.nome) ? { ...e, args: { ...e.args, outro_pedido: outro } } : e;
}

function escolherUm(textoFala, tarefa, ctx) {
  const s = plano(textoFala).replace(/\s+/g, ' ').trim();
  const telas = (ctx && ctx.telas) || [];
  const mudouDeIdeia = /\bna verdade\b|\bagora\b.{0,20}\b(quero|faz|muda)/.test(s) && COISA_NOVA.test(s);

  // Corrige, completa ou confirma a tarefa em andamento: a mesma ferramenta.
  if (tarefa && !mudouDeIdeia && (CORRECAO.test(s) || (tarefa.pergunta && !QUIZ.test(s) && !EDITAR.test(s)))) {
    const f = tarefa.ferramenta;
    if (f === 'criar_quiz') return { nome: f, args: argsDoQuiz(textoFala, tarefa.args, telas) };
    if (f === 'criar_aviso' || f === 'mudar_tela' || f === 'editar_campanha') {
      const tv = tvDe(textoFala, telas);
      return { nome: f, args: { ...tarefa.args, pedido: corta([tarefa.args.pedido, textoFala].filter(Boolean).join(', '), 400), ...(tv ? { tv: tv.nome } : {}) } };
    }
    if (f === 'campanha') return { nome: f, args: { pedido: textoFala } };
  }
  if (DESISTE.test(s)) return { nome: 'perguntar', args: { pergunta: 'Tudo bem, não vou criar nada. Quer fazer outra coisa?', sugestoes: ['Uma promoção', 'Um aviso', 'Um quiz'] } };
  if (OI.test(s)) return { nome: 'perguntar', args: { pergunta: 'Oi! O que você quer mostrar nas TVs hoje? Pode ser uma promoção, um aviso ou um quiz.', sugestoes: ['Uma promoção', 'Um aviso', 'Um quiz'] } };
  if (QUIZ.test(s)) return { nome: 'criar_quiz', args: argsDoQuiz(textoFala, null, telas) };
  if (EDITAR.test(s)) return { nome: 'editar_campanha', args: { campanha: '', pedido: corta(textoFala, 400) } };
  if (TELA.test(s) && MUDAR.test(s)) { const tv = tvDe(textoFala, telas); return { nome: 'mudar_tela', args: { tv: tv ? tv.nome : '', pedido: corta(textoFala, 400) } }; }
  const tipo = conversa.tipoDoPedido(textoFala, tarefa && tarefa.ferramenta === 'campanha');
  if (tipo === 'duvida') return { nome: 'tirar_duvida', args: { resposta: conversa.ajudaPara(textoFala) } };
  if (tipo === 'aviso') return { nome: 'criar_aviso', args: { pedido: corta(textoFala, 400) } };
  return { nome: 'campanha', args: { pedido: textoFala } };
}

/* ---------------- O maestro com IA ---------------- */

function usuarioDoMaestro({ mensagens, tarefa, ctx }) {
  const c = ctx || {};
  return [
    c.hoje ? 'HOJE: ' + c.hoje + (c.diaSemana ? ' (' + c.diaSemana + ')' : '') : '',
    c.empresa ? 'EMPRESA: ' + c.empresa + (c.segmento ? ' (' + c.segmento + ')' : '') : '',
    'TVS: ' + (((c.telas || []).map((t) => '"' + t.nome + '"').join(', ')) || '(nenhuma ligada ainda)'),
    'CAMPANHAS CRIADAS: ' + (((c.campanhas || []).slice(0, 12).map((x) => '"' + x.nome + '"').join(', ')) || '(nenhuma)'),
    'AJUDA (caminhos do painel, para tirar_duvida):\n' + conversa.AJUDA.map((a) => '- ' + a.resposta).join('\n'),
    'TAREFA EM ANDAMENTO: ' + (tarefa ? tarefa.ferramenta + ' ' + JSON.stringify(tarefa.args || {}) : '(nenhuma)'),
    '',
    'CONVERSA (a última fala é a que você responde):',
    transcricao(mensagens),
  ].filter((x) => x !== '').join('\n');
}

// A ferramenta que a IA chamou (ou null). Sem chamada nativa, aceita o JSON { ferramenta, argumentos }.
function lerChamada(r, nomes) {
  const validos = nomes || NOMES;
  const c = r && Array.isArray(r.chamadas) ? r.chamadas.find((x) => x && validos.includes(x.nome)) : null;
  if (c) return { nome: c.nome, args: c.args && typeof c.args === 'object' ? c.args : {} };
  try {
    const j = ai.parseAiJson(r && r.texto);
    if (j && validos.includes(j.ferramenta)) return { nome: j.ferramenta, args: j.argumentos && typeof j.argumentos === 'object' ? j.argumentos : {} };
  } catch (e) { /* sem JSON: a regra decide */ }
  return null;
}

/*
 * `ferramentas`, `sistema` e `regra`: o "Pedir à IA" da Programação usa o
 * mesmo maestro com menos ferramentas (pedirNaProgramacao, abaixo).
 */
async function escolher({ mensagens, tarefa, ctx, ferramentas = FERRAMENTAS, sistema = SISTEMA, regra = escolherPorRegra }) {
  const falas = falasDaPessoa(mensagens);
  const ultima = falas[falas.length - 1] || '';
  if (ai.mode() === 'dev') return { ...regra(ultima, tarefa, ctx), por: 'regra' };
  try {
    const r = await motores.chamar({ sistema, usuario: usuarioDoMaestro({ mensagens, tarefa, ctx }), ferramentas, maxTokens: 1024, temperatura: 0.2 });
    const c = lerChamada(r, ferramentas.map((f) => f.nome));
    if (c) return { ...c, por: 'ia' };
  } catch (e) {
    // A IA caiu: a regra escolhe a ferramenta, e a conversa segue (o especialista avisa se também precisar da IA).
    require('./erros.js').registrar(e, { onde: 'assistente: maestro', tipo: e && e.tipo });
  }
  return { ...regra(ultima, tarefa, ctx), por: 'regra' };
}

/* ---------------- Os especialistas ---------------- */

function tvPorNome(nome, telas) {
  const s = plano(nome);
  if (!s) return null;
  return (telas || []).find((t) => plano(t.nome) === s) || tvDe(nome, telas);
}
function tituloDoQuiz(tema) {
  const t = corta(tema, 60);
  if (!t) return 'Quiz';
  const curto = t.split(/[,;]| e (?=\w)/)[0].trim();
  const r = 'Quiz · ' + curto;
  return r.length <= 28 ? r : 'Quiz';
}

/*
 * Os argumentos que a IA preenche são conferidos contra listas fechadas antes
 * de fazer (revisão do consultor, #299): a zona é principal ou lateral, a TV
 * é uma da conta, e a quantidade vai de 1 a MAX_PERGUNTAS — "quiz de 50
 * perguntas" volta como pergunta, com a proposta já nos argumentos ("sim" faz 5).
 */
async function fazerQuiz(args, tarefa, ctx) {
  const pedidas = Math.max(1, Math.round(Number(args.quantidade) || 3));
  const tema = corta(args.tema, 120);
  const zona = args.zona === 'lateral' ? 'lateral' : 'principal';
  const tv = tvPorNome(args.tv, ctx.telas);
  if (pedidas > MAX_PERGUNTAS) {
    return {
      resposta: 'Na TV, quiz bom tem até ' + MAX_PERGUNTAS + ' perguntas: cada uma passa em uns 17 segundos, e mais que isso ninguém acompanha. Faço com ' + MAX_PERGUNTAS + '?',
      sugestoes: ['Sim, ' + MAX_PERGUNTAS + ' perguntas', '3 perguntas'], pergunta: true, acao: null,
      args: { ...args, quantidade: MAX_PERGUNTAS },
    };
  }
  if (corta(args.tv, 60) && !tv) {
    const nomes = (ctx.telas || []).map((t) => t.nome).filter(Boolean);
    return {
      resposta: nomes.length ? 'Não achei a TV “' + corta(args.tv, 60) + '”. Em qual delas?' : 'Você ainda não tem TV ligada. Faço o quiz para pôr quando ligar?',
      sugestoes: nomes.length ? nomes.slice(0, 3).concat('Todas as TVs') : ['Sim'], pergunta: true, acao: null, args: { ...args, tv: '' },
    };
  }
  const n = pedidas;
  // A pessoa só mudou o lugar (ou só confirmou): as perguntas que ela já viu ficam — sem gastar de novo.
  const antes = tarefa && tarefa.ferramenta === 'criar_quiz' && tarefa.acao && tarefa.acao.quiz;
  const mesmas = antes && plano(tarefa.args.tema) === plano(tema) && Number(tarefa.args.quantidade) === n;
  const perguntas = mesmas ? antes.perguntas : (await quizIA.gerar({ tema: tema || 'curiosidades', quantidade: n, perfil: ctx.perfil })).perguntas;
  const onde = (zona === 'lateral' ? 'na lateral' : 'na área principal') + (tv ? ' da ' + tv.nome : ' das TVs');
  return {
    resposta: (mesmas ? 'Isso: ' : 'Fiz ') + 'um quiz de ' + n + (n === 1 ? ' pergunta' : ' perguntas') + (tema ? ' sobre ' + tema : '') + ', ' + onde
      + '. Confira as perguntas e as respostas certas e ponha na TV.',
    sugestoes: [zona === 'lateral' ? 'Na área principal' : 'Na lateral', n < MAX_PERGUNTAS ? (n + 1) + ' perguntas' : '', 'Outro tema'].filter(Boolean),
    acao: { tipo: 'quiz', zona, quantidade: n, tema, tv: tv ? { id: tv.id, nome: tv.nome } : null,
      quiz: { titulo: tituloDoQuiz(tema), tempo: 10, revelar: 7, perguntas } },
  };
}

async function fazerAviso(args, ctx) {
  const pedido = corta(args.pedido, 400);
  const hoje = ctx.hoje ? new Date(ctx.hoje + 'T12:00:00') : new Date();
  const r = await avisoRapido.entender(pedido, { hoje, grupos: ctx.grupos || [], historico: [] });
  if (r.pergunta) return { resposta: r.pergunta, sugestoes: r.sugestoes || [], pergunta: true, acao: null };
  return {
    resposta: 'Montei o aviso: “' + r.titulo + '”' + (r.ate ? ', até ' + r.ate.split('-').reverse().join('/') : '') + '. Confira a prévia e ponha nas TVs.',
    sugestoes: [], acao: { tipo: 'aviso', aviso: r },
  };
}

async function fazerTela(args, ctx) {
  const telas = ctx.telas || [];
  if (!telas.length) return { resposta: 'Você ainda não tem TV ligada. Ligue uma em Telas e me peça de novo.', sugestoes: [], acao: null };
  // Uma TV dita que não é da conta não vira "a única que tem": pergunta (lista fechada, #299).
  const dita = corta(args.tv, 60);
  const tv = tvPorNome(dita, telas) || tvDe(args.pedido, telas) || (!dita && telas.length === 1 ? telas[0] : null);
  if (!tv) {
    return { resposta: dita ? 'Não achei a TV “' + dita + '”. Em qual delas?' : 'Em qual TV?', sugestoes: telas.slice(0, 4).map((t) => t.nome).filter(Boolean), pergunta: true, acao: null, args: { ...args, tv: '' } };
  }
  const atual = { layoutId: tv.layout || 'dashboard', orientacao: tv.emPe ? 'portrait' : 'landscape', tema: tv.tema || '' };
  const r = await ajusteTela.entender(corta(args.pedido, 400), atual, []);
  if (r.pergunta) return { resposta: r.pergunta, sugestoes: r.sugestoes || [], pergunta: true, acao: null };
  return {
    resposta: 'Preparei a mudança na ' + tv.nome + '. Confira a TV agora e como fica antes de aplicar.',
    sugestoes: [], acao: { tipo: 'tela', tv: { id: tv.id, nome: tv.nome }, mudancas: r.mudancas || [], notas: r.notas || [] },
  };
}

function fazerEditar(args, ctx) {
  const lista = ctx.campanhas || [];
  const s = plano(args.campanha + ' ' + args.pedido);
  const c = lista.find((x) => plano(x.nome) === plano(args.campanha))
    || lista.filter((x) => x.nome && s.includes(plano(x.nome))).sort((a, b) => b.nome.length - a.nome.length)[0]
    || (lista.length === 1 ? lista[0] : null);
  if (!c) {
    return lista.length
      ? { resposta: 'Qual campanha você quer mudar?', sugestoes: lista.slice(0, 4).map((x) => x.nome), pergunta: true, acao: null }
      : { resposta: 'Você ainda não tem campanha criada. Quer criar uma agora?', sugestoes: ['Uma promoção', 'Um aviso'], acao: null };
  }
  return {
    resposta: 'Para mudar “' + c.nome + '”, abro a campanha em Criados, no Editar com a IA — o seu pedido já vai junto.',
    sugestoes: [], acao: { tipo: 'editar', campanha: { id: c.id, nome: c.nome }, pedido: corta(args.pedido, 400) },
  };
}

/* ---------------- Uma volta ---------------- */

/*
 * responder({ mensagens, escopo, decisoes, ctx }) — `mensagens` já tem a fala
 * nova da pessoa. Devolve o que a rota do Criar já entendia (resposta,
 * sugestoes, escopo, decisoes, pronto, gerar, tipo, modo) e mais: intencao,
 * ferramenta, args, acao, e a `mensagem` da IA para guardar na conversa.
 */
async function responder({ mensagens, escopo, decisoes, ctx } = {}) {
  const c = ctx || {};
  const atual = E.normalizar(escopo);
  const tarefa = tarefaDe(mensagens, atual);
  const escolha = await escolher({ mensagens, tarefa, ctx: c });
  const nome = NOMES.includes(escolha.nome) ? escolha.nome : 'campanha';
  const args = escolha.args || {};
  const modo = ai.mode() === 'dev' ? 'dev' : escolha.por === 'regra' ? 'regra' : ai.mode();
  const base = { escopo: atual, decisoes: conversa.mesclarDecisoes(decisoes, [], []), pronto: false, gerar: false, modo };

  let out = await fazer(nome, args, { mensagens, escopo: atual, decisoes, tarefa, ctx: c, base });
  // A campanha volta com o escopo e o roteiro dela; as outras, com o resto do Criar como estava.
  if (nome !== 'campanha') out = { ...base, ...out };
  out = comOOutroPedido(out, args);
  const argsFinais = out.args || {};

  const intencao = out.intencao || INTENCAO[nome];
  const sugestoes = out.sugestoes;
  const mensagem = {
    papel: 'ia', texto: out.resposta, sugestoes, em: Date.now(), intencao, ferramenta: nome, args: argsFinais,
    ...(out.acao ? { acao: out.acao } : {}), ...(out.pergunta ? { pergunta: true } : {}), ...(out.modo === 'falha' ? { falha: true } : {}),
  };
  return {
    ...out, intencao, ferramenta: nome, args: argsFinais, sugestoes,
    // A rota guarda o tipo para não andar o estado do cartão: o que não é campanha não mexe nele.
    tipo: nome === 'campanha' ? out.tipo : (intencao === 'duvida' ? 'duvida' : intencao),
    mensagem,
  };
}

// O especialista da ferramenta. Devolve { resposta, sugestoes, acao, pergunta?, args? } (a campanha: o que a conversa devolve).
async function fazer(nome, args, { mensagens, escopo, decisoes, tarefa, ctx, base }) {
  try {
    if (nome === 'campanha') {
      const r = await conversa.conversar({ mensagens, escopo, decisoes, ctx });
      return { ...r, intencao: 'campanha', acao: null, args: { pedido: corta(args.pedido, 400), outro_pedido: args.outro_pedido || '' } };
    }
    // Os argumentos de antes; o especialista pode devolver os seus (a proposta que ele fez, a TV que não existia).
    if (nome === 'criar_quiz') return { args, ...(await fazerQuiz(args, tarefa, ctx)) };
    if (nome === 'criar_aviso') return { args, ...(await fazerAviso(args, ctx)) };
    if (nome === 'mudar_tela') return { args, ...(await fazerTela(args, ctx)) };
    if (nome === 'editar_campanha') return { args, ...fazerEditar(args, ctx) };
    if (nome === 'tirar_duvida') return { resposta: corta(args.resposta, 600) || conversa.ajudaPara(falasDaPessoa(mensagens).pop()), sugestoes: [], acao: null, args: {} };
    return { resposta: corta(args.pergunta, 300) || 'O que você quer mostrar nas TVs?', sugestoes: lista(args.sugestoes, 4, 50), acao: null, pergunta: true, args: {} };
  } catch (e) {
    require('./erros.js').registrar(e, { onde: 'assistente: ' + nome, tipo: e && e.tipo });
    const fora = motores.iaIndisponivel(e);
    return { ...base, resposta: fora ? 'A IA está fora do ar agora. A conversa está salva: tente de novo daqui a pouco.' : (e && e.status && e.status < 500 && e.message) || 'Não consegui fazer isso agora. Tente de novo.', sugestoes: [], acao: null, falha: fora ? 'fora' : 'passageira', modo: 'falha', args };
  }
}

/*
 * O segundo pedido da fala (#299): a resposta diz que viu, e ele vira a
 * primeira resposta pronta — um toque e a pessoa pede. Não vai quando a
 * ferramenta ainda está perguntando (uma coisa de cada vez).
 */
function comOOutroPedido(out, args) {
  const outro = corta(args && args.outro_pedido, 80);
  const sugestoes = lista(out.sugestoes, 4, 50);
  if (!outro || out.pergunta || out.modo === 'falha') return { ...out, sugestoes };
  return {
    ...out,
    resposta: out.resposta + ' O outro pedido (“' + outro + '”) eu faço em seguida: é só tocar nele aí embaixo.',
    sugestoes: [outro].concat(sugestoes.filter((s) => s !== outro)).slice(0, 4),
  };
}

/* ---------------- O "Pedir à IA" da Programação ---------------- */

/*
 * O MESMO maestro, para a caixa "o que você quer nas TVs?" da Programação
 * (o consultor, #299: "dois cérebros diferentes vão divergir"). Restrito:
 * aviso, quiz, aparência da TV e editar uma campanha; conteúdo novo continua
 * no Criar (o painel leva para lá com o pedido escrito). Quando o painel diz
 * a TV (`tvFixa`, a que está aberta), ela vem do contexto, não da IA.
 *
 * `historico`: a mini-conversa do painel ([{ papel, texto, ferramenta?, args? }]).
 * Devolve o que o painel do Pedir à IA entende: { pergunta, sugestoes, ferramenta, args }
 * ou { destino: 'aviso' | 'tela' | 'quiz' | 'editar' | 'criar' | 'nenhuma-tv', ... }.
 */
const DA_PROGRAMACAO = ['criar_aviso', 'criar_quiz', 'mudar_tela', 'editar_campanha', 'campanha', 'perguntar'];
const PERGUNTA_DO_TIPO = { pergunta: 'O que você quer fazer nas TVs?', sugestoes: ['Pôr um aviso', 'Mudar a aparência de uma TV', 'Criar algo novo'] };

function ferramentasDaProgramacao(tvFixa) {
  return FERRAMENTAS.filter((f) => DA_PROGRAMACAO.includes(f.nome)).map((f) => {
    if (!tvFixa || !f.parametros.properties.tv) return f;
    const { tv, ...props } = f.parametros.properties;
    return { ...f, parametros: { ...f.parametros, properties: props, required: f.parametros.required.filter((x) => x !== 'tv') } };
  });
}

function sistemaDaProgramacao(tvFixa) {
  return SISTEMA + `

AQUI É A PROGRAMAÇÃO (não o Criar): só as ferramentas da lista. Conteúdo
novo de divulgação (promoção, produto, peças, campanha) → campanha: o painel
leva ao Criar com o pedido. Dúvida sobre o sistema → perguntar, com o caminho.`
    + (tvFixa ? '\nA TV já está escolhida: “' + tvFixa.nome + '”. Não pergunte qual TV.' : '');
}

// Sem IA: a regra do Criar; o que ela mandaria para a campanha (ou dúvida) só vai ao Criar se o pedido for mesmo de conteúdo novo.
function regraDaProgramacao(textoFala, tarefa, ctx) {
  const e = escolherPorRegra(textoFala, tarefa, ctx);
  if (DA_PROGRAMACAO.includes(e.nome) && e.nome !== 'campanha') return e;
  const s = plano(textoFala);
  if (TELA.test(s) || /\b(claro|escuro|cabecalho|rodape|lateral do outro lado)\b/.test(s)) return { nome: 'mudar_tela', args: { tv: '', pedido: corta(textoFala, 400) } };
  if (/\b(cri[ae]r?|promoc\w*|campanha|divulg\w*|peca|post|anunci\w*|novidade|lancamento|algo novo)\b/.test(s)) return { nome: 'campanha', args: { pedido: textoFala } };
  if (e.nome === 'tirar_duvida') return { nome: 'perguntar', args: { pergunta: e.args.resposta, sugestoes: PERGUNTA_DO_TIPO.sugestoes } };
  return { nome: 'perguntar', args: { ...PERGUNTA_DO_TIPO } };
}

async function pedirNaProgramacao({ texto, historico, ctx, tvFixa } = {}) {
  const c = { ...(ctx || {}) };
  const fixa = tvFixa ? (c.telas || []).find((t) => t.id === tvFixa) || null : null;
  const mensagens = limparHistorico(historico).concat({ papel: 'pessoa', texto: corta(texto, 500) });
  const tarefa = tarefaDe(mensagens, null);
  const escolha = await escolher({ mensagens, tarefa, ctx: c, ferramentas: ferramentasDaProgramacao(fixa), sistema: sistemaDaProgramacao(fixa), regra: regraDaProgramacao });
  const nome = DA_PROGRAMACAO.includes(escolha.nome) ? escolha.nome : 'perguntar';
  const args = { ...(escolha.args || {}), ...(fixa && (nome === 'criar_quiz' || nome === 'mudar_tela') ? { tv: fixa.nome } : {}) };

  if (nome === 'campanha') return { destino: 'criar', texto: corta(falasDaPessoa(mensagens).join(', '), 400) };
  if (nome === 'mudar_tela' && !(c.telas || []).length) return { destino: 'nenhuma-tv' };
  const out = await fazer(nome, args, { mensagens, escopo: null, decisoes: [], tarefa, ctx: c, base: {} });
  if (out.modo === 'falha') { const e = new Error(out.resposta); e.status = out.falha === 'fora' ? 503 : 502; throw e; }
  const a = out.acao;
  if (!a) return { pergunta: out.resposta, sugestoes: lista(out.sugestoes, 4, 50), ferramenta: nome, args: out.args || args };
  if (a.tipo === 'aviso') return { destino: 'aviso', aviso: a.aviso };
  if (a.tipo === 'tela') return { destino: 'tela', tv: a.tv, mudancas: a.mudancas, notas: a.notas };
  if (a.tipo === 'quiz') return { destino: 'quiz', quiz: a };
  return { destino: 'editar', campanha: a.campanha, pedido: a.pedido };
}

// A mini-conversa que vem do painel: só papel, texto e a ferramenta/argumentos que o servidor mesmo devolveu.
function limparHistorico(h) {
  return (Array.isArray(h) ? h : []).slice(-12).filter((m) => m && (m.papel === 'pessoa' || m.papel === 'ia')).map((m) => ({
    papel: m.papel, texto: corta(m.texto, 400),
    ...(m.papel === 'ia' && NOMES.includes(m.ferramenta) ? { ferramenta: m.ferramenta, args: m.args && typeof m.args === 'object' && !Array.isArray(m.args) ? m.args : {}, pergunta: true } : {}),
  })).filter((m) => m.texto);
}

module.exports = { responder, pedirNaProgramacao, escolherPorRegra, partirPedidos, tarefaDe, lerChamada, usuarioDoMaestro, FERRAMENTAS, SISTEMA, INTENCAO, MAX_PERGUNTAS, PERGUNTA_DO_TIPO, quantidadeDe, temaDe, zonaDe };
