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
const FERRAMENTAS = [
  {
    nome: 'criar_quiz',
    descricao: 'Criar um QUIZ para passar na TV: perguntas com alternativas, o tempo correndo e a resposta certa aparecendo depois, com uma explicação. Use quando a pessoa fala em quiz (ou "quis", "perguntas e respostas", "teste de conhecimento", "curiosidades com pergunta").',
    parametros: {
      type: 'object',
      properties: {
        tema: texto('O assunto das perguntas, nas palavras da pessoa (ex.: "curiosidades de pão e confeitaria"). Vazio se ela não disse.'),
        quantidade: { type: 'integer', description: 'Quantas perguntas (de 1 a 6). "duas" = 2, "três" = 3. Se ela não disse, 3.' },
        zona: { type: 'string', enum: ['principal', 'lateral'], description: 'Onde o quiz passa na TV. "lateral" quando ela fala de lateral, tela lateral, coluna do lado. Senão "principal".' },
        tv: texto('O nome EXATO de uma TV da lista, quando ela fala de uma TV só. Vazio = todas as TVs.'),
      },
      required: ['tema', 'quantidade', 'zona', 'tv'],
    },
  },
  {
    nome: 'criar_aviso',
    descricao: 'Pôr um AVISO curto nas TVs: horário, feriado, loja fechada, piso molhado, reunião, recado para a equipe ou para os clientes. Não é promoção.',
    parametros: {
      type: 'object',
      properties: { pedido: texto('O aviso inteiro nas palavras da pessoa, juntando o que ela disse na conversa (ex.: "amanhã a loja abre às 10h").') },
      required: ['pedido'],
    },
  },
  {
    nome: 'mudar_tela',
    descricao: 'Mudar a APARÊNCIA de uma TV: layout, tema claro ou escuro, cor do fundo, cores, relógio, clima, data, letra. Não cria conteúdo.',
    parametros: {
      type: 'object',
      properties: {
        tv: texto('O nome EXATO da TV da lista. Vazio se ela não disse qual.'),
        pedido: texto('A mudança nas palavras da pessoa (ex.: "fundo azul", "tirar o relógio").'),
      },
      required: ['tv', 'pedido'],
    },
  },
  {
    nome: 'campanha',
    descricao: 'Criar conteúdo NOVO de divulgação para as TVs (e, se ela quiser, para as redes): promoção, produto, lançamento, data comemorativa, peças. Também continuar a campanha que está sendo combinada nesta conversa (fotos, redes, horários, quantas peças, "pode gerar").',
    parametros: {
      type: 'object',
      properties: { pedido: texto('O que ela quer divulgar, nas palavras dela.') },
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
4. Dois pedidos numa fala só: escolha o primeiro (o outro a pessoa pede em seguida).
5. "Deixa pra lá", "esquece", "cancela": perguntar o que ela quer agora, sem
   mandar gerar nada.

ARGUMENTOS:
- Nunca invente preço, data, nome, horário ou TV que a pessoa não disse.
- TV: só nomes da lista de TVs; vazio = todas.
- Quantidade do quiz: o número que ela disse ("duas" = 2); sem número, 3.
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
  const n = /^\d+$/.test(m[1]) ? Number(m[1]) : NUMEROS[m[1]];
  return n ? Math.max(1, Math.min(6, n)) : null;
}
function tvDe(t, telas) {
  const s = plano(t);
  return (telas || []).filter((x) => x.nome && s.includes(plano(x.nome)))
    .sort((a, b) => b.nome.length - a.nome.length)[0] || null;
}
const zonaDe = (t) => (/\b(lateral|coluna|do lado)\b/.test(plano(t)) ? 'lateral' : /\bprincipal\b/.test(plano(t)) ? 'principal' : null);
function temaDe(t) {
  const m = /\bsobre\s+(.+)$/i.exec(String(t || ''));
  return m ? corta(m[1].replace(/\s+(na|para a|pra)\s+(tela\s+)?(lateral|principal).*$/i, '').replace(/[.!?]+$/, ''), 120) : '';
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
    tv: tv ? tv.nome : (a.tv || ''),
  };
}

function escolherPorRegra(textoFala, tarefa, ctx) {
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
function lerChamada(r) {
  const c = r && Array.isArray(r.chamadas) ? r.chamadas.find((x) => x && NOMES.includes(x.nome)) : null;
  if (c) return { nome: c.nome, args: c.args && typeof c.args === 'object' ? c.args : {} };
  try {
    const j = ai.parseAiJson(r && r.texto);
    if (j && NOMES.includes(j.ferramenta)) return { nome: j.ferramenta, args: j.argumentos && typeof j.argumentos === 'object' ? j.argumentos : {} };
  } catch (e) { /* sem JSON: a regra decide */ }
  return null;
}

async function escolher({ mensagens, tarefa, ctx }) {
  const falas = falasDaPessoa(mensagens);
  const ultima = falas[falas.length - 1] || '';
  if (ai.mode() === 'dev') return { ...escolherPorRegra(ultima, tarefa, ctx), por: 'regra' };
  try {
    const r = await motores.chamar({ sistema: SISTEMA, usuario: usuarioDoMaestro({ mensagens, tarefa, ctx }), ferramentas: FERRAMENTAS, maxTokens: 1024, temperatura: 0.2 });
    const c = lerChamada(r);
    if (c) return { ...c, por: 'ia' };
  } catch (e) {
    // A IA caiu: a regra escolhe a ferramenta, e a conversa segue (o especialista avisa se também precisar da IA).
    require('./erros.js').registrar(e, { onde: 'assistente: maestro', tipo: e && e.tipo });
  }
  return { ...escolherPorRegra(ultima, tarefa, ctx), por: 'regra' };
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

async function fazerQuiz(args, tarefa, ctx) {
  const n = Math.max(1, Math.min(6, Math.round(Number(args.quantidade) || 3)));
  const tema = corta(args.tema, 120);
  const zona = args.zona === 'lateral' ? 'lateral' : 'principal';
  const tv = tvPorNome(args.tv, ctx.telas);
  // A pessoa só mudou o lugar (ou só confirmou): as perguntas que ela já viu ficam — sem gastar de novo.
  const antes = tarefa && tarefa.ferramenta === 'criar_quiz' && tarefa.acao && tarefa.acao.quiz;
  const mesmas = antes && plano(tarefa.args.tema) === plano(tema) && Number(tarefa.args.quantidade) === n;
  const perguntas = mesmas ? antes.perguntas : (await quizIA.gerar({ tema: tema || 'curiosidades', quantidade: n, perfil: ctx.perfil })).perguntas;
  const onde = (zona === 'lateral' ? 'na lateral' : 'na área principal') + (tv ? ' da ' + tv.nome : ' das TVs');
  return {
    resposta: (mesmas ? 'Isso: ' : 'Fiz ') + 'um quiz de ' + n + (n === 1 ? ' pergunta' : ' perguntas') + (tema ? ' sobre ' + tema : '') + ', ' + onde
      + '. Confira as perguntas e as respostas certas e ponha na TV.',
    sugestoes: [zona === 'lateral' ? 'Na área principal' : 'Na lateral', n < 6 ? (n + 1) + ' perguntas' : '', 'Outro tema'].filter(Boolean),
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
  const tv = tvPorNome(args.tv, telas) || tvDe(args.pedido, telas) || (telas.length === 1 ? telas[0] : null);
  if (!tv) return { resposta: 'Em qual TV?', sugestoes: telas.slice(0, 4).map((t) => t.nome).filter(Boolean), pergunta: true, acao: null };
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

  let out;
  try {
    if (nome === 'campanha') {
      const r = await conversa.conversar({ mensagens, escopo: atual, decisoes, ctx: c });
      out = { ...r, intencao: 'campanha', acao: null, args: { pedido: corta(args.pedido, 400) } };
    } else if (nome === 'criar_quiz') {
      out = { ...base, ...(await fazerQuiz(args, tarefa, c)), args };
    } else if (nome === 'criar_aviso') {
      out = { ...base, ...(await fazerAviso(args, c)), args };
    } else if (nome === 'mudar_tela') {
      out = { ...base, ...(await fazerTela(args, c)), args };
    } else if (nome === 'editar_campanha') {
      out = { ...base, ...fazerEditar(args, c), args };
    } else if (nome === 'tirar_duvida') {
      out = { ...base, resposta: corta(args.resposta, 600) || conversa.ajudaPara(falasDaPessoa(mensagens).pop()), sugestoes: [], acao: null, args: {} };
    } else {
      out = { ...base, resposta: corta(args.pergunta, 300) || 'O que você quer mostrar nas TVs?', sugestoes: lista(args.sugestoes, 4, 50), acao: null, pergunta: true, args: {} };
    }
  } catch (e) {
    require('./erros.js').registrar(e, { onde: 'assistente: ' + nome, tipo: e && e.tipo });
    const fora = motores.iaIndisponivel(e);
    out = { ...base, resposta: fora ? 'A IA está fora do ar agora. A conversa está salva: tente de novo daqui a pouco.' : (e && e.status && e.status < 500 && e.message) || 'Não consegui fazer isso agora. Tente de novo.', sugestoes: [], acao: null, falha: fora ? 'fora' : 'passageira', modo: 'falha', args };
  }

  const intencao = out.intencao || INTENCAO[nome];
  const sugestoes = lista(out.sugestoes, 4, 50);
  const mensagem = {
    papel: 'ia', texto: out.resposta, sugestoes, em: Date.now(), intencao, ferramenta: nome, args,
    ...(out.acao ? { acao: out.acao } : {}), ...(out.pergunta ? { pergunta: true } : {}), ...(out.modo === 'falha' ? { falha: true } : {}),
  };
  return {
    ...out, intencao, ferramenta: nome, args, sugestoes,
    // A rota guarda o tipo para não andar o estado do cartão: o que não é campanha não mexe nele.
    tipo: nome === 'campanha' ? out.tipo : (intencao === 'duvida' ? 'duvida' : intencao),
    mensagem,
  };
}

module.exports = { responder, escolherPorRegra, tarefaDe, lerChamada, usuarioDoMaestro, FERRAMENTAS, SISTEMA, INTENCAO, quantidadeDe, temaDe, zonaDe };
