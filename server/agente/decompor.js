/*
 * server/agente/decompor.js — um pedido longo vira tarefas.
 *
 * "Põe um aviso da reunião de amanhã às 10 nas TVs do RH, um parabéns para
 * os aniversariantes e troca o cardápio da semana" são TRÊS coisas: cada uma
 * vai para um especialista (server/agente/subagentes.js), com o pedaço dela
 * e só o contexto que ela precisa. É também o pedido longo de WhatsApp que
 * vira várias peças.
 *
 * Aqui mora a divisão POR REGRA (sem IA, nos testes e quando a IA cai) e o
 * que vale nas duas: de que TVs cada tarefa fala (só as desta pessoa, nesta
 * conta), quando ela sai do ar e o nome estável da campanha de cada tema —
 * o cardápio novo do agente troca o cardápio de antes do agente (o mesmo
 * nome), com Desfazer, em vez de empilhar.
 */
'use strict';

const assistente = require('../assistente');
const avisoRapido = require('../aviso-rapido');
const { plano, corta } = require('./guarda');

const TIPOS = ['aviso', 'quiz', 'peca', 'campanha', 'tela', 'ajuste', 'duvida'];

/* ---------------- Dividir ---------------- */

// O começo de uma tarefa nova: um artigo e o que se faz, ou um verbo de fazer.
const NOME_DE_TAREFA = '(?:aviso|recado|comunicado|lembrete|alerta|parab[eé]ns|quiz|quis|card[aá]pio|menu|promo[cç][aã]o|oferta|pe[cç]a|campanha|post|cartaz|mensagem|homenagem|v[ií]deo|foto)';
const VERBO_DE_TAREFA = '(?:troca|troque|muda|mude|p[õo]e|ponha|coloca|coloque|bota|faz|fa[cç]a|cria|crie|monta|monte|manda|mande|publica|publique|atualiza|atualize|deixa|deixe|tira|tire|avisa|avise|lembra|lembre)';
const CORTE = new RegExp(
  '\\s*[;\\n]+\\s*'
  + '|\\.\\s+(?=[A-ZÁÉÍÓÚÂÊÔÃÕÇ])'
  + '|\\s*,\\s*(?:e\\s+)?(?:tamb[eé]m\\s+)?(?=(?:(?:um|uma|o|a|os|as)\\s+)?' + NOME_DE_TAREFA + '\\b|' + VERBO_DE_TAREFA + '\\b)'
  + '|\\s+e\\s+(?:tamb[eé]m\\s+)?(?=(?:(?:um|uma)\\s+)' + NOME_DE_TAREFA + '\\b|' + VERBO_DE_TAREFA + '\\s)'
  + '|\\s+(?:depois|al[eé]m disso)\\s*,?\\s+',
  'i');
// "1) aviso…", "- aviso…": a lista vira tarefas.
const ITEM_DE_LISTA = /^\s*(?:\d+[).:-]|[-•*])\s+/;

// "Oi, tudo bem? queria um aviso…": o cumprimento e o "queria" não são o aviso.
function semCumprimento(t) {
  return String(t || '')
    .replace(/^\s*(oi+|ol[aá]|bom dia|boa tarde|boa noite|e a[ií]|opa|al[oô])\b[\s,!.]*(tudo (bem|bom|certo)|td (bem|bom))?[\s,!.?]*/i, '')
    .replace(/^\s*(por favor,?\s*)?(eu\s+)?(queria|quero|gostaria( de)?|preciso( de)?|precisava( de)?|tem como( fazer)?|d[aá] pra( fazer)?|pode(ria)?( fazer)?)\s+/i, '')
    .trim();
}

function dividir(texto) {
  const t = String(texto || '').replace(/\r/g, '');
  const linhas = t.split('\n');
  const lista = linhas.filter((l) => ITEM_DE_LISTA.test(l));
  const base = lista.length >= 2 ? lista.map((l) => l.replace(ITEM_DE_LISTA, '')) : [t];
  // Pedaço sem verbo nem tarefa ("nas TVs do RH"): junta com o de antes — dentro do mesmo item da lista.
  const tarefa = new RegExp('\\b' + NOME_DE_TAREFA + '\\b|\\b' + VERBO_DE_TAREFA + '\\b|\\b(reuni[aã]o|anivers|seguran[cç]a|epis?\\b|metas?\\b|indicador|fundo|tema|layout|maior|menor|cor\\b)', 'i');
  const juntas = [];
  for (const b of base) {
    const doItem = [];
    for (const p of b.split(CORTE)) {
      const limpo = semCumprimento(corta(p, 600)).replace(/^((e|também|tambem|ah|e ah|ah e|ainda)[,!]?\s+)+/i, '').replace(/[.;,]+$/, '').trim();
      if (limpo.length < 3) continue;
      if (doItem.length && !tarefa.test(limpo)) doItem[doItem.length - 1] += ', ' + limpo;
      else doItem.push(limpo);
    }
    juntas.push(...doItem);
  }
  return juntas.length ? juntas : [corta(t, 600)];
}

/* ---------------- Classificar ---------------- */

const AJUSTE = /\b(deixa|deixe|faz|fa[cç]a)\b.{0,30}\b(maior|menor|mais (grande|claro|escuro|forte|leve|chamativ\w*|elegante|vis[ií]vel)|em (azul|verde|vermelho|amarelo|preto|branco|roxo|rosa|laranja))\b|\b(troca|troque|muda|mude)\b.{0,15}\b(a |o )?(cor|cores|fonte|letra|foto|imagem|t[ií]tulo|texto|fundo da pe[cç]a)\b|\b(tira|tire|sem)\b.{0,10}\b(a |o )?(foto|imagem|pre[cç]o|selo|logo)\b(?!.{0,20}\b(da tv|na tv)\b)|\b(essa|esta|aquela|a) pe[cç]a\b|\bpe[cç]a \d\b/i;
const TELA = /\b(fundo|tema|layout|rel[oó]gio|clima|apar[eê]ncia|visual|cores? da tv|letra da tv|tela (clara|escura)|modo (claro|escuro))\b/i;
const DUVIDA = /^(como|onde|qual|quais|quanto|posso|d[aá] pra|da para|tem como|o que [eé])\b.*\?|\?\s*$|^(como (fa[cç]o|ligo|coloco|ponho|troco)|onde (fica|vejo|acho))\b/i;
// A campanha de verdade (várias peças, redes): "campanha de vacinação" é um aviso, não um pedido de campanha.
const CAMPANHA = /\b(redes sociais|instagram|whats(app)?|facebook|stories|story|post para|para as redes)\b|\b(uma|nova|a) campanha (completa|inteira|com|de (natal|p[aá]scoa|black friday|dia d[aoe]s? \w+|lan[cç]amento|inver?no|ver[aã]o|promo[cç]\w*|anivers[aá]rio da loja))\b|\bcampanha (inteira|completa)\b/i;
const QUIZ = /\bqui[sz]\b|perguntas? e respostas?|teste de conhecimento/i;
const AVISO = /\b(aviso|recado|comunicado|lembrete|alerta|urgente|emerg[eê]ncia|evacu\w*|vazamento|inc[eê]ndio|reuni[aã]o|treinamento|palestra|dds|piso molhado|fechad[oa]s?|feriado|expediente|hor[aá]rio de funcionamento|vamos fechar|abriremos|abrimos|n[aã]o haver[aá]|cancelad[oa]|manuten[cç][aã]o|falta de (luz|energia|[aá]gua)|vacina[cç][aã]o)\b/i;

/*
 * A tarefa de um pedaço: { tipo, pedido, alvo, zona?, quantidade?, tema? }.
 * `temCampanha`: a conversa já tem uma campanha gerada (o ajuste vai nela).
 */
function classificar(parte, ctx, o) {
  const c = ctx || {};
  const op = o || {};
  const s = String(parte || '');
  const alvo = alvoDe(s, c);
  const base = { pedido: corta(s, 600), alvo };
  if (DUVIDA.test(s.trim()) && !AVISO.test(s) && !QUIZ.test(s)) return { ...base, tipo: 'duvida' };
  if (QUIZ.test(s)) {
    return { ...base, tipo: 'quiz', tema: assistente.temaDe(s) || '', quantidade: assistente.quantidadeDe(s) || 3, zona: assistente.zonaDe(s) || 'principal' };
  }
  if (op.temCampanha && AJUSTE.test(s) && !AVISO.test(s)) return { ...base, tipo: 'ajuste' };
  if (TELA.test(s) && /\b(muda|mude|troca|troque|deixa|deixe|tira|tire|p[õo]e|coloca|bota)\w*/i.test(s) && !/\bpe[cç]a\b/i.test(s)) return { ...base, tipo: 'tela' };
  if (CAMPANHA.test(s)) return { ...base, tipo: 'campanha' };
  if (AVISO.test(s) && !/\b(promo[cç]|oferta|desconto|card[aá]pio|anivers)/i.test(s)) return { ...base, tipo: 'aviso' };
  return { ...base, tipo: 'peca', tema: temaDaPeca(s) };
}

// O tema da peça (para o nome estável da campanha e para as TVs de costume).
function temaDaPeca(s) {
  const p = plano(s);
  if (/\banivers/.test(p)) return 'aniversariantes';
  if (/\b(cardapio|menu|almoco|refeitorio|prato do dia)\b/.test(p)) return 'cardapio';
  if (/\b(seguranca|epi|epis|capacete|protetor auricular|cipa|acidente|nr-?\d+)\b/.test(p)) return 'seguranca';
  if (/\b(meta|metas|indicador|indicadores|resultado do mes|producao)\b/.test(p)) return 'metas';
  if (/\b(promoc|oferta|desconto|liquida|black friday)\w*/.test(p)) return 'promocao';
  if (/\b(boas.?vindas|novo colaborador|novos colaboradores|integracao)\b/.test(p)) return 'boas-vindas';
  return 'peca';
}

const NOME_DO_TEMA = {
  aniversariantes: 'Aniversariantes do mês', cardapio: 'Cardápio da semana', seguranca: 'Segurança no trabalho',
  metas: 'Metas do mês', 'boas-vindas': 'Boas-vindas',
};
// O nome da campanha do agente: estável por tema (republicar troca a de antes), senão o começo do pedido.
function nomeDaCampanha(tarefa) {
  const t = tarefa || {};
  if (NOME_DO_TEMA[t.tema]) return NOME_DO_TEMA[t.tema];
  const p = corta(String(t.pedido || '').replace(/^(p[õo]e|coloca|bota|faz|fa[cç]a|cria|crie|monta|manda|publica)\s+(um|uma|o|a)?\s*/i, ''), 40);
  return p ? p.charAt(0).toUpperCase() + p.slice(1) : 'Peça';
}

/* ---------------- As TVs de cada tarefa ---------------- */

/*
 * De que TVs o pedaço fala, SEMPRE dentro da lista desta pessoa (ctx.telas
 * já vem filtrada pela loja dela, server/permissoes.js):
 *   { tipo: 'todas' } | { tipo: 'grupo', nome } | { tipo: 'telas', ids, nomes }
 *   e `naoAchei` quando ela citou uma TV ou um grupo que não está na lista.
 */
function alvoDe(texto, ctx) {
  const c = ctx || {};
  const s = plano(texto);
  const telas = c.telas || [];
  const grupos = c.grupos || [];
  const g = grupos.filter(Boolean).sort((a, b) => b.length - a.length).find((x) => new RegExp('\\b' + plano(x).replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b').test(s));
  if (g) return { tipo: 'grupo', nome: g };
  const citadas = telas.filter((t) => t.nome && plano(t.nome).length >= 3 && s.includes(plano(t.nome)));
  if (citadas.length) return { tipo: 'telas', ids: citadas.map((t) => t.id), nomes: citadas.map((t) => t.nome) };
  if (/\btodas as tvs\b|\bem todas\b|\btodas as telas\b/.test(s)) return { tipo: 'todas' };
  // "na TV da entrada", "nas TVs do galpão": citou e não está na lista.
  // Com a grafia dela ("TV do galpão C"), para a pergunta repetir o que ela escreveu.
  const m = /(?:^|\s)(?:na|nas|para a|para as|pra|pras|da|das)\s+(tvs?\s+(?:d[aoe]s?\s+)?[\p{L}\d]+(?:\s+[\p{L}\d]+){0,2})/iu.exec(String(texto || ''));
  if (m && !/\btvs? (de|da|do) (hoje|amanha|agora|semana)\b/.test(plano(m[1]))) return { tipo: 'todas', naoAchei: corta(m[1], 50).replace(/^tv/i, 'TV') };
  return { tipo: 'todas' };
}

// As TVs (ids) de um alvo, só as que esta pessoa alcança.
function telasDoAlvo(alvo, ctx) {
  const telas = (ctx && ctx.telas) || [];
  const a = alvo || { tipo: 'todas' };
  if (a.tipo === 'grupo') return telas.filter((t) => plano(t.grupo) === plano(a.nome));
  if (a.tipo === 'telas') return telas.filter((t) => (a.ids || []).includes(t.id));
  return telas.slice();
}

// O alvo padrão de um tema: o cardápio vai para as TVs do refeitório, se a conta tiver.
function alvoPadrao(tarefa, ctx) {
  const t = tarefa || {};
  if (t.alvo && t.alvo.tipo !== 'todas') return t.alvo;
  if (t.tema === 'cardapio') {
    const g = ((ctx && ctx.grupos) || []).find((x) => /refeit|cantina|cozinha|restaurante/.test(plano(x)));
    if (g) return { tipo: 'grupo', nome: g };
    const tv = ((ctx && ctx.telas) || []).filter((x) => /refeit|cantina|cozinha/.test(plano(x.nome)));
    if (tv.length) return { tipo: 'telas', ids: tv.map((x) => x.id), nomes: tv.map((x) => x.nome) };
  }
  return t.alvo || { tipo: 'todas' };
}

function nomeDoAlvo(alvo, ctx) {
  const a = alvo || { tipo: 'todas' };
  const n = telasDoAlvo(a, ctx).length;
  const tvs = n === 1 ? '1 TV' : n + ' TVs';
  if (a.tipo === 'grupo') return 'nas TVs de ' + a.nome + ' (' + tvs + ')';
  if (a.tipo === 'telas') return (a.nomes || []).length === 1 ? 'na ' + a.nomes[0] : 'em ' + (a.nomes || []).join(', ');
  return 'em todas as TVs (' + tvs + ')';
}

/* ---------------- Quando sai do ar ---------------- */

const iso = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
/*
 * A proposta de quando a peça sai do ar: { quando: 'sempre' } ou { quando:
 * 'ate', ate }. O que a pessoa disse vale ("até sexta", "só hoje"); senão o
 * costume do tema (o aniversariante do mês até o fim do mês, o cardápio da
 * semana até domingo, a reunião até o dia dela).
 */
function quandoDe(tarefa, hoje) {
  const t = tarefa || {};
  const h = hoje instanceof Date ? hoje : new Date();
  const dito = avisoRapido.ateQuando ? avisoRapido.ateQuando(t.pedido, h) : '';
  if (dito) return { quando: 'ate', ate: dito };
  const s = plano(t.pedido);
  if (/\bamanha\b/.test(s)) return { quando: 'ate', ate: iso(new Date(h.getFullYear(), h.getMonth(), h.getDate() + 1)) };
  if (t.tema === 'aniversariantes') return { quando: 'ate', ate: iso(new Date(h.getFullYear(), h.getMonth() + 1, 0)) };
  if (t.tema === 'cardapio' || /\bda semana\b/.test(s)) return { quando: 'ate', ate: iso(new Date(h.getFullYear(), h.getMonth(), h.getDate() + ((7 - h.getDay()) % 7))) };
  return { quando: 'sempre' };
}
function nomeDoQuando(q) {
  if (!q || q.quando !== 'ate' || !q.ate) return 'até alguém tirar';
  return 'até ' + q.ate.split('-').reverse().slice(0, 2).join('/');
}

/* ---------------- Tudo junto ---------------- */

/*
 * A fala inteira em tarefas, por regra. Mais que `max`, as de sobra voltam
 * em `sobra` (a resposta diz que viu e faz na próxima).
 */
function porRegra(texto, ctx, o) {
  const op = o || {};
  const max = op.max || 5;
  const tarefas = dividir(texto).map((p) => classificar(p, ctx, op));
  // A dúvida no meio de pedidos de fazer vira resposta no fim; a fala só de dúvida fica dúvida.
  const fazer = tarefas.filter((t) => t.tipo !== 'duvida');
  const lista = fazer.length ? fazer : tarefas;
  return { tarefas: lista.slice(0, max), sobra: lista.slice(max).map((t) => t.pedido), duvidas: fazer.length ? tarefas.filter((t) => t.tipo === 'duvida').map((t) => t.pedido) : [] };
}

/*
 * A tarefa que veio da IA, conferida contra listas fechadas: o tipo é um dos
 * conhecidos, o pedido tem tamanho, e as TVs são as desta pessoa (o nome que
 * a IA escreveu é procurado na lista; o que não está vira `naoAchei`).
 */
function conferirTarefa(t, ctx, o) {
  const x = t && typeof t === 'object' ? t : {};
  const pedido = corta(x.pedido, 600);
  if (!pedido) return null;
  const tipo = TIPOS.includes(x.tipo) ? x.tipo : classificar(pedido, ctx, o).tipo;
  const daRegra = classificar(pedido, ctx, o);
  let alvo = daRegra.alvo;
  const nomes = Array.isArray(x.tvs) ? x.tvs.map((n) => corta(n, 60)).filter(Boolean) : [];
  const grupo = corta(x.grupo, 60);
  if (grupo) {
    const g = ((ctx && ctx.grupos) || []).find((y) => plano(y) === plano(grupo));
    alvo = g ? { tipo: 'grupo', nome: g } : { tipo: 'todas', naoAchei: grupo };
  } else if (nomes.length && !/^todas/i.test(nomes[0])) {
    const achadas = ((ctx && ctx.telas) || []).filter((tv) => nomes.some((n) => plano(n) === plano(tv.nome)));
    const faltam = nomes.filter((n) => !achadas.some((tv) => plano(tv.nome) === plano(n)));
    alvo = achadas.length ? { tipo: 'telas', ids: achadas.map((tv) => tv.id), nomes: achadas.map((tv) => tv.nome) } : { tipo: 'todas' };
    if (faltam.length) alvo.naoAchei = faltam[0];
  }
  // O alvo já decidido (a regra, a correção "só no RH"): vale se as TVs dele são desta pessoa.
  if (!grupo && !nomes.length && x.alvo && typeof x.alvo === 'object') {
    const a = x.alvo;
    if (a.tipo === 'grupo' && ((ctx && ctx.grupos) || []).includes(a.nome)) alvo = { tipo: 'grupo', nome: a.nome };
    else if (a.tipo === 'telas' && Array.isArray(a.ids)) {
      const achadas = ((ctx && ctx.telas) || []).filter((tv) => a.ids.includes(tv.id));
      if (achadas.length) alvo = { tipo: 'telas', ids: achadas.map((tv) => tv.id), nomes: achadas.map((tv) => tv.nome) };
    } else if (a.tipo === 'todas') alvo = a.naoAchei ? { tipo: 'todas', naoAchei: corta(a.naoAchei, 50) } : (alvo.naoAchei ? alvo : { tipo: 'todas' });
  }
  const saida = { tipo, pedido, alvo };
  if (Array.isArray(x.respostas) && x.respostas.length) saida.respostas = x.respostas.map((r) => corta(r, 600)).filter(Boolean).slice(-6);
  if (tipo === 'quiz') {
    saida.tema = corta(x.tema, 120) || daRegra.tema || '';
    saida.quantidade = Math.max(1, Math.min(99, Math.round(Number(x.quantidade) || daRegra.quantidade || 3)));
    saida.zona = x.zona === 'lateral' ? 'lateral' : (daRegra.zona || 'principal');
  }
  if (tipo === 'peca') saida.tema = daRegra.tema || temaDaPeca(pedido);
  if (x.fotos === true) saida.fotos = true;
  return saida;
}

module.exports = { TIPOS, dividir, semCumprimento, classificar, porRegra, conferirTarefa, alvoDe, telasDoAlvo, alvoPadrao, nomeDoAlvo, quandoDe, nomeDoQuando, nomeDaCampanha, temaDaPeca, NOME_DO_TEMA };
