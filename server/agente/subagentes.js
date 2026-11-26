/*
 * server/agente/subagentes.js — os especialistas, cada um com o seu pedaço.
 *
 * Cada tarefa do plano (server/agente/decompor.js) vai para UM especialista,
 * com um contexto pequeno e só dela: o pedaço do pedido, as TVs dela, o que
 * está no ar (para não repetir) e as respostas que a pessoa já deu para ela.
 * Os especialistas são os módulos de sempre — o aviso rápido, o quiz, a
 * aparência da TV, a conversa da campanha, o ajuste da campanha e o
 * escritor dos textos do ecossistema —, aqui como ferramentas do agente.
 *
 * Cada um devolve o RASCUNHO (o que a pessoa vai validar), ou a pergunta do
 * que falta, e os problemas que a conferência achou. Nada aqui grava nem
 * publica: quem põe no ar é server/agente/executor.js, depois da validação.
 *
 *   { indice, tipo, titulo, onde, quando, alvo, rascunho, pergunta?,
 *     problemas: [{ regra, texto, sugestao? }], avisos: [texto], manual? }
 */
'use strict';

const E = require('../../js/escopo.js');
const RC = require('../../js/regras-de-conteudo.js');
const avisoRapido = require('../aviso-rapido');
const quizIA = require('../quiz-ia');
const ajusteTela = require('../ajuste-tela');
const ajuste = require('../ajuste');
const ajustePeca = require('../ajuste-peca');
const conversa = require('../ai-conversa');
const eco = require('../ecossistema');
const conferencia = require('../conferencia');
const ai = require('../ai');
const D = require('./decompor');
const G = require('./guarda');
const V = require('./variedade');

const MAX_PERGUNTAS_QUIZ = 5;
const corta = G.corta;

const ICONE = { aviso: 'aviso', quiz: 'quiz', peca: 'peca', campanha: 'campanha', tela: 'tela', ajuste: 'ajuste', duvida: 'duvida' };

// O pedido como objetivo da peça: sem o "põe um", com maiúscula ("Parabéns para os aniversariantes").
function objetivoDe(t) {
  const s = D.semCumprimento(corta(t, 300)).replace(/^(p[õo]e|coloca|bota|faz|fa[cç]a|cria|crie|monta|manda|publica|troca|troque|atualiza)\s+/i, '').replace(/^(um|uma|o|a|os|as)\s+/i, '');
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : '';
}

// O pedido com as respostas que a pessoa já deu para esta tarefa ("reunião amanhã" + "às 10h").
const comRespostas = (t) => [t.pedido].concat(t.respostas || []).filter(Boolean).join(', ');

/* ---------------- A conferência de um rascunho (sem IA) ---------------- */

/*
 * As regras da frente, a privacidade e os fatos, em todo texto que vai à TV.
 * `permitidos`: o que a pessoa (ou a conta) disse — preço, data, hora que
 * não estão aí são AVISO (o dono: aviso continua aviso), e a regra da lei é
 * PROBLEMA (não vai ao ar).
 */
function conferirTextos(textos, ctx, permitidos) {
  const c = ctx || {};
  const lista = (textos || []).filter(Boolean).map(String);
  const problemas = [];
  const avisos = [];
  const regra = RC.conferir(lista, { perfil: c.perfil || '', contexto: [c.empresa, c.segmento].filter(Boolean).join(' ') });
  for (const b of regra.bloqueios) problemas.push({ regra: b.regra, texto: 'O texto “' + corta(b.trecho, 40) + '” ' + b.motivo + '.', sugestao: b.sugestao || '' });
  for (const a of regra.avisos) avisos.push('“' + corta(a.trecho, 40) + '”: ' + a.motivo + '.');
  for (const t of lista) {
    if (G.nomeDePacienteNoTexto(t, c.perfil)) problemas.push({ regra: 'paciente-nome', texto: 'O texto traz o nome de um paciente, e isso não vai para a TV da clínica.' });
    for (const f of RC.conferirFatos(t, permitidos, { hoje: c.hoje ? new Date(c.hoje + 'T12:00:00') : new Date() })) {
      avisos.push('Confira “' + corta(f.trecho, 30) + '”: ' + f.motivo + '.');
    }
  }
  return { problemas, avisos: [...new Set(avisos)].slice(0, 8) };
}

function permitidosDaTarefa(t, ctx, extras) {
  const c = ctx || {};
  return conferencia.permitidosDe({ nome: '', objetivo: comRespostas(t), telas: [], horarios: [], periodo: {} },
    { falas: [comRespostas(t)].concat(extras || []), combinado: c.decisoes || [], marca: c.marca || {}, empresa: c.empresa || '', local: c.local || {}, memoria: c.memoria || null });
}

/* ---------------- Os especialistas ---------------- */

/*
 * O pedido como o aviso rápido entende: sem "nas TVs do RH" (as TVs já
 * estão no alvo, e o cartaz não fala delas) e sem o "de" antes do dia
 * ("reunião de amanhã" é "reunião amanhã": o dia vira a validade).
 */
function paraOAviso(texto, alvo) {
  let t = String(texto || '');
  const nomes = alvo && alvo.tipo === 'grupo' ? [alvo.nome] : alvo && alvo.tipo === 'telas' ? (alvo.nomes || []) : [];
  for (const n of nomes) {
    const esc = String(n).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    t = t.replace(new RegExp('\\s*(?:n[ao]s?|para (?:a|as|o|os)|pra|pras|em)\\s+(?:tvs?|telas?)\\s+(?:d[aeo]s?\\s+)?' + esc + '\\b', 'ig'), ' ')
      .replace(new RegExp('\\s*(?:n[ao]s?|para (?:a|as|o|os)|pra|pras|em|d[aeo]s?)\\s+' + esc + '\\b', 'ig'), ' ');
  }
  t = t.replace(/\s*(?:em|n?as)\s+todas as (?:tvs|telas)\b/ig, ' ').replace(/\b(d[aeo])\s+(amanh[ãa]|hoje)(?=$|[\s,.;:!?])/ig, '$2');
  return t.replace(/\s+/g, ' ').trim();
}

async function aviso(t, ctx) {
  const falta = G.fatoQueFalta(t);
  if (falta) return { pergunta: { texto: falta.pergunta, sugestoes: falta.sugestoes, campo: falta.campo } };
  const hoje = ctx.hoje ? new Date(ctx.hoje + 'T12:00:00') : new Date();
  const r = await avisoRapido.entender(paraOAviso(comRespostas(t), t.alvo), { hoje, grupos: ctx.grupos || [], historico: [] });
  if (r.pergunta) return { pergunta: { texto: r.pergunta, sugestoes: r.sugestoes || [] } };
  const a = { titulo: corta(r.titulo, 70), detalhe: corta(r.detalhe, 160), ate: r.ate || '', prioridade: r.prioridade === 'urgente' ? 'urgente' : 'alta' };
  const conf = conferirTextos([a.titulo, a.detalhe], ctx, permitidosDaTarefa(t, ctx));
  return {
    titulo: 'Aviso: ' + a.titulo, quando: a.ate ? { quando: 'ate', ate: a.ate } : D.quandoDe(t, hoje),
    rascunho: { aviso: a }, problemas: conf.problemas, avisos: conf.avisos,
  };
}

async function quiz(t, ctx) {
  const n = Math.max(1, Math.round(Number(t.quantidade) || 3));
  if (n > MAX_PERGUNTAS_QUIZ) {
    return { pergunta: { texto: 'Na TV, quiz bom tem até ' + MAX_PERGUNTAS_QUIZ + ' perguntas (cada uma passa em uns 17 segundos). Faço com ' + MAX_PERGUNTAS_QUIZ + '?', sugestoes: ['Sim, ' + MAX_PERGUNTAS_QUIZ + ' perguntas', '3 perguntas'] }, ajusteDaTarefa: { quantidade: MAX_PERGUNTAS_QUIZ } };
  }
  const r = await quizIA.gerar({ tema: t.tema || 'curiosidades', quantidade: n, perfil: ctx.perfil });
  const perguntas = r.perguntas || [];
  const conf = conferirTextos(perguntas.map((p) => [p.pergunta].concat(p.alternativas || [], p.explicacao || '').join(' \n ')), ctx, permitidosDaTarefa(t, ctx));
  const titulo = 'Quiz' + (t.tema ? ' · ' + corta(t.tema, 24) : '');
  return {
    titulo: titulo + ' (' + perguntas.length + (perguntas.length === 1 ? ' pergunta)' : ' perguntas)'),
    rascunho: { quiz: { titulo: titulo.length <= 28 ? titulo : 'Quiz', tempo: 10, revelar: 7, perguntas }, zona: t.zona === 'lateral' ? 'lateral' : 'principal' },
    // O fato de um quiz é o conhecimento geral dele, não o que a pessoa disse: só a regra da lei vale aqui.
    problemas: conf.problemas, avisos: [],
  };
}

/*
 * UMA PEÇA (aniversariantes, cardápio, segurança, metas, promoção…): o
 * escopo de uma peça na principal e os TEXTOS dela — escritos agora, para a
 * pessoa validar o que vai ao ar. O desenho sai depois, com esses textos.
 */
async function peca(t, ctx) {
  const falta = G.fatoQueFalta(t);
  if (falta) return { pergunta: { texto: falta.pergunta, sugestoes: falta.sugestoes, campo: falta.campo } };
  const negativos = V.negativosDe(ctx);
  const alvo = D.alvoPadrao(t, ctx);
  const telasAlvo = D.telasDoAlvo(alvo, ctx);
  const emPe = telasAlvo.length > 0 && telasAlvo.every((x) => x.emPe);
  const nome = D.nomeDaCampanha(t);
  const base = V.tituloSemIA(t.tema, nome, negativos);
  const combinado = [];
  const extras = [];
  if (t.tema === 'aniversariantes') {
    if ((ctx.aniversariantes || []).length) {
      const nomes = ctx.aniversariantes.map((p) => p.nome + (p.dia ? ' (dia ' + p.dia + ')' : '')).join(', ');
      combinado.push('Aniversariantes do mês, da planilha da empresa (use só estes nomes): ' + nomes);
      extras.push(nomes);
    } else combinado.push('A empresa não mandou a lista de aniversariantes: não escreva nome de ninguém.');
  }
  if (negativos.length) combinado.push('Já está no ar ou foi feito há pouco (NÃO repita estes títulos): ' + negativos.slice(0, 15).join(' | '));
  combinado.push('Escreva só o que o pedido diz; não invente preço, data, horário, telefone, endereço nem desconto.');
  const escopo = E.normalizar({
    nome: base.titulo, objetivo: objetivoDe(comRespostas(t)), imagens: t.fotos ? 'gerar' : 'nenhuma',
    telas: [{
      alvo: alvo.tipo === 'grupo' ? { tipo: 'grupo', nome: alvo.nome } : alvo.tipo === 'telas' && (alvo.ids || []).length === 1 ? { tipo: 'tela', id: alvo.ids[0] } : { tipo: 'todas' },
      zonas: { principal: { pecas: 1, pedido: corta(t.pedido, 200) }, lateral: { pecas: 0 }, cabecalho: { pecas: 0 }, rodape: { pecas: 0 } },
    }],
  });
  const vagas = eco.vagasDoEscopo(escopo, emPe ? telasAlvo.map((x) => ({ id: x.id, emPe: true })) : []);
  if (emPe) vagas.forEach((v) => { if (v.zona === 'principal') v.formato = '9/16'; });
  const ctxTextos = { empresa: ctx.empresa || '', segmento: ctx.segmento || '', perfil: ctx.perfil || '', marca: ctx.marca || {}, memoria: ctx.memoria || null, combinado };
  const bases = ((ctx.marca && ctx.marca.bases) || []).filter((b) => b && b.url);
  let textos = await eco.escreverTextos(escopo, vagas, ctxTextos, bases);
  const vaga = vagas[0];
  const permitidos = permitidosDaTarefa(t, ctx, extras);
  const textosDe = (tx) => { const v = tx.vagas[vaga.id] || {}; return [v.kicker, v.titulo, v.apoio, v.cta]; };
  let conf = conferirTextos(textosDe(textos), ctx, permitidos);
  // O "conferir → corrigir" (uma vez): o título repetido e o fato que ninguém deu voltam ao escritor com o motivo.
  const repetido = V.repete((textos.vagas[vaga.id] || {}).titulo, negativos);
  const inventou = conf.avisos.filter((a) => /^Confira/.test(a));
  let corrigiu = '';
  if ((repetido || inventou.length || conf.problemas.length) && ai.mode() !== 'dev') {
    const ajusteTxt = [repetido ? 'O título "' + repetido + '" já está no ar: escreva outro, diferente.' : '',
      inventou.length ? 'Tire o que o cliente não disse: ' + inventou.join(' ') : '',
      conf.problemas.length ? RC.paraCorrecao(conf.problemas.map((p) => ({ nivel: 'bloqueio', trecho: p.texto, motivo: p.regra, sugestao: p.sugestao }))) : ''].filter(Boolean).join(' ');
    const novo = await eco.escreverTextos(escopo, vagas, ctxTextos, bases, ajusteTxt);
    const confNovo = conferirTextos(textosDe(novo), ctx, permitidos);
    const melhor = (confNovo.problemas.length < conf.problemas.length)
      || (confNovo.problemas.length === conf.problemas.length && !V.repete((novo.vagas[vaga.id] || {}).titulo, negativos));
    if (melhor) { textos = novo; conf = confNovo; corrigiu = ajusteTxt; }
  }
  const tx = textos.vagas[vaga.id] || {};
  const avisos = conf.avisos.slice();
  if (base.repetiu && ai.mode() === 'dev') avisos.push('Todos os títulos que eu tenho para isso já estão no ar: confira se quer repetir.');
  return {
    titulo: tx.titulo || nome, alvo, quando: D.quandoDe(t, ctx.hoje ? new Date(ctx.hoje + 'T12:00:00') : new Date()),
    rascunho: {
      nome, escopo, vaga: vaga.id, formato: vaga.formato,
      textos: { kicker: tx.kicker || '', titulo: tx.titulo || '', apoio: tx.apoio || '', cta: tx.cta || '' },
      foto: escopo.imagens === 'gerar' ? { gerar: 1, descricao: corta(tx.descricaoFoto, 300) } : null,
      direcao: textos.direcao, estilo: textos.estilo,
    },
    problemas: conf.problemas, avisos, corrigiu,
  };
}

/*
 * A CAMPANHA inteira (zonas, redes, horários): a conversa de sempre
 * (server/ai-conversa.js) monta o escopo com a pessoa. Quando ela fecha, o
 * esboço do escopo é o rascunho a validar — os textos saem na geração, como
 * sempre foi (D42).
 */
async function campanha(t, ctx, o) {
  const op = o || {};
  const mensagens = op.mensagens && op.mensagens.length ? op.mensagens : [{ papel: 'pessoa', texto: comRespostas(t), em: Date.now() }];
  const r = await conversa.conversar({ mensagens, escopo: op.escopo || null, decisoes: op.decisoes || [], ctx });
  if (r.modo === 'falha') { const e = new Error(r.resposta); e.falhaDaConversa = r.falha || 'passageira'; throw e; }
  const escopo = r.escopo;
  if (!(r.gerar || r.pronto) || !E.temOQueGerar(escopo)) {
    return { conversa: r, pergunta: { texto: r.resposta, sugestoes: r.sugestoes || [], campanha: true } };
  }
  const custo = E.custo(escopo);
  return {
    conversa: r, titulo: 'Campanha: ' + (escopo.nome || corta(t.pedido, 40)),
    rascunho: { escopo, descricao: E.descrever(escopo), custo, fotos: escopo.imagens === 'gerar' || escopo.imagens === 'mistura' ? { gerar: (custo && custo.criacoes) || 0 } : null },
    problemas: [], avisos: [],
  };
}

async function tela(t, ctx) {
  const telas = D.telasDoAlvo(t.alvo, ctx);
  if (!(ctx.telas || []).length) return { pergunta: { texto: 'Você ainda não tem TV ligada. Ligue uma em Telas e me peça de novo.', sugestoes: [] } };
  if (telas.length !== 1 || t.alvo.tipo === 'todas') {
    return { pergunta: { texto: 'Em qual TV?', sugestoes: (ctx.telas || []).slice(0, 4).map((x) => x.nome).filter(Boolean) } };
  }
  const tv = telas[0];
  const r = await ajusteTela.entender(corta(t.pedido, 400), { layoutId: tv.layout || 'dashboard', orientacao: tv.emPe ? 'portrait' : 'landscape', tema: tv.tema || '' }, []);
  if (r.pergunta) return { pergunta: { texto: r.pergunta, sugestoes: r.sugestoes || [] } };
  // Mudar layout pode esconder zona com conteúdo: a pessoa vê o antes e o depois e aplica (o mesmo cartão de sempre).
  return { titulo: 'Mudar a ' + tv.nome, manual: true, rascunho: { tv: { id: tv.id, nome: tv.nome }, mudancas: r.mudancas || [], notas: r.notas || [] }, problemas: [], avisos: [] };
}

/*
 * O AJUSTE de uma peça que já existe ("deixa maior", "troca a cor", "tira a
 * foto"): a campanha desta conversa (ou a última que o agente pôs no ar
 * aqui). O que muda é listado para validar; o executor aplica e CONFERE que
 * a peça mudou mesmo.
 */
async function ajusteDePeca(t, ctx, o) {
  const op = o || {};
  const c = op.campanha;
  if (!c || !c.resultado) {
    return { pergunta: { texto: 'Qual peça você quer mudar? Abra a campanha em Biblioteca › Campanhas e peça lá, ou me diga o nome dela.', sugestoes: (ctx.campanhas || []).slice(0, 3).map((x) => x.nome) } };
  }
  const pedido = comRespostas(t);
  const pecas = ajuste.numerar(c.resultado);
  const n = Number((/pe[cç]a\s+(\d+)/i.exec(pedido) || [])[1]) || 1;
  const alvo = pecas[n - 1];
  const base = { titulo: 'Ajustar “' + corta(c.nome, 40) + '”' + (pecas.length > 1 ? ', peça ' + n : ''), problemas: [], avisos: [] };
  /*
   * Primeiro o remendo da peça (texto, cor, fonte, claro/escuro, esconder
   * um campo): barato, sem redesenhar. O que ele não faz (tamanho, foto
   * nova, outro desenho) vai para o ajuste da campanha, que redesenha.
   */
  if (alvo && alvo.peca && alvo.peca.item && alvo.peca.item.type === 'peca-html') {
    try {
      const rp = await ajustePeca.ajustar(alvo.peca.item, pedido, []);
      if (rp && (rp.mudou || []).length) {
        return Object.assign(base, { rascunho: { campanha: { id: c.id, nome: c.nome }, modo: 'remendo', peca: n, remendo: rp.remendo, descricoes: [corta(rp.resposta, 160)], pedido: corta(pedido, 400) } });
      }
    } catch (e) { /* a peça não passou na porta: o ajuste da campanha tenta */ }
  }
  const r = await ajuste.entender(pedido, c);
  // O agente não apaga: "tirar a peça" fica para a pessoa, em Programação ou na campanha.
  const mudancas = (r.mudancas || []).filter((m) => m.tipo !== 'tirar');
  if (!mudancas.length) {
    const tirou = (r.mudancas || []).some((m) => m.tipo === 'tirar');
    return { pergunta: { texto: tirou ? 'Tirar uma peça eu não faço por aqui: tire em Biblioteca › Campanhas ou na Programação da TV (dá para desfazer). Quer mudar alguma outra coisa nela?' : (r.resposta || 'O que você quer mudar na peça?'), sugestoes: ['Deixa o título maior', 'Troca a cor para azul', 'Tira a foto'] } };
  }
  const fotos = mudancas.filter((m) => m.foto === 'trocar').length;
  return Object.assign(base, {
    rascunho: { campanha: { id: c.id, nome: c.nome }, modo: 'mudancas', mudancas, descricoes: mudancas.map(ajuste.descreverMudanca), pedido: corta(pedido, 400), ...(fotos ? { fotos: { gerar: fotos } } : {}) },
  });
}

function duvida(t) {
  return { titulo: 'Dúvida', resposta: conversa.ajudaPara(t.pedido), rascunho: null, problemas: [], avisos: [], soResposta: true };
}

/*
 * Roda o especialista da tarefa e devolve o item do plano. Erro do
 * especialista não derruba o plano: o item volta com o problema, e o
 * orquestrador decide (refazer, perguntar ou cair para o fluxo de antes).
 */
async function rodar(t, indice, ctx, o) {
  const tarefa = Object.assign({}, t, { alvo: t.tipo === 'peca' ? D.alvoPadrao(t, ctx) : (t.alvo || { tipo: 'todas' }) });
  const base = { indice, tipo: tarefa.tipo, icone: ICONE[tarefa.tipo] || 'peca', pedido: tarefa.pedido, alvo: tarefa.alvo, respostas: tarefa.respostas || [], onde: D.nomeDoAlvo(tarefa.alvo, ctx), problemas: [], avisos: [] };
  // A TV (ou o grupo) que a pessoa citou e não está na lista dela: pergunta, e nunca vai para "todas" calado.
  if (tarefa.alvo && tarefa.alvo.naoAchei && tarefa.tipo !== 'duvida') {
    const nomes = (ctx.telas || []).map((x) => x.nome).filter(Boolean);
    return Object.assign(base, { pergunta: { texto: 'Não achei “' + tarefa.alvo.naoAchei + '” nas suas TVs. Em qual delas?', sugestoes: nomes.slice(0, 3).concat(nomes.length > 1 ? ['Todas as TVs'] : []), campo: 'tv' } });
  }
  try {
    let r;
    if (tarefa.tipo === 'aviso') r = await aviso(tarefa, ctx);
    else if (tarefa.tipo === 'quiz') r = await quiz(tarefa, ctx);
    else if (tarefa.tipo === 'campanha') r = await campanha(tarefa, ctx, o);
    else if (tarefa.tipo === 'tela') r = await tela(tarefa, ctx);
    else if (tarefa.tipo === 'ajuste') r = await ajusteDePeca(tarefa, ctx, o);
    else if (tarefa.tipo === 'duvida') r = duvida(tarefa);
    else r = await peca(tarefa, ctx);
    const item = Object.assign(base, r, { alvo: r.alvo || base.alvo });
    item.onde = D.nomeDoAlvo(item.alvo, ctx);
    if (!item.quando && ['aviso', 'peca', 'quiz'].includes(item.tipo)) item.quando = D.quandoDe(tarefa, ctx.hoje ? new Date(ctx.hoje + 'T12:00:00') : new Date());
    return item;
  } catch (e) {
    return Object.assign(base, { erro: (e && e.message) || 'o especialista falhou', falhaDaIA: !!(e && (e.tipo || e.falhaDaConversa)) });
  }
}

// O resumo de um item para a IA do plano ler (o que ela observa depois de agir).
function resumoParaIA(item) {
  const r = item.rascunho || {};
  const o = { indice: item.indice, tipo: item.tipo, titulo: item.titulo || '', onde: item.onde };
  if (item.pergunta) o.falta_perguntar = item.pergunta.texto;
  if (item.erro) o.erro = item.erro;
  if (item.problemas.length) o.problemas = item.problemas.map((p) => p.texto);
  if (item.avisos.length) o.avisos = item.avisos;
  if (r.aviso) o.aviso = r.aviso.titulo + (r.aviso.detalhe ? ' — ' + r.aviso.detalhe : '');
  if (r.textos) o.textos = r.textos;
  if (r.quiz) o.perguntas = r.quiz.perguntas.map((p) => p.pergunta);
  if (r.descricoes) o.mudancas = r.descricoes;
  if (item.resposta) o.resposta = item.resposta;
  if (item.manual) o.manual = 'a pessoa aplica vendo o antes e o depois';
  return o;
}

module.exports = { paraOAviso, rodar, resumoParaIA, conferirTextos, permitidosDaTarefa, comRespostas, MAX_PERGUNTAS_QUIZ };
