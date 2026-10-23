/*
 * server/aviso-rapido.js — a IA encaixa o aviso (EXECUTOR D27).
 *
 * "Adicione aviso da peça quebrada no banheiro." A pessoa escreve como
 * falaria; daqui sai o aviso arrumado: o título curto do cartaz, o detalhe,
 * até quando vale, a prioridade e em quais TVs. O painel monta a peça (o
 * alerta dos modelos prontos, com a marca), mostra a prévia e, com o ok, a
 * frota recebe num envio só (D26), com Desfazer.
 *
 * Sem IA (localhost e quando ela cai), uma regra entende as frases comuns.
 */
const ai = require('./ai');

const corta = (s, n) => String(s == null ? '' : s).replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);
const iso = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
const SEMANA = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];

// "até amanhã", "até sexta", "até 15/11", "hoje" — o fim da validade; '' = até alguém tirar.
function ateQuando(t, hoje) {
  const s = String(t || '').toLowerCase();
  const dia = (n) => iso(new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() + n));
  if (/\bsó hoje\b|\bhoje\b/.test(s) && !/até amanhã/.test(s)) return dia(0);
  if (/até amanhã|amanhã/.test(s)) return dia(1);
  const m = /até (?:o dia |dia )?(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?/.exec(s);
  if (m) {
    let ano = m[3] ? Number(m[3].length === 2 ? '20' + m[3] : m[3]) : hoje.getFullYear();
    let d = new Date(ano, Number(m[2]) - 1, Number(m[1]));
    if (!m[3] && d < new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate())) { ano += 1; d = new Date(ano, Number(m[2]) - 1, Number(m[1])); }
    if (d.getDate() === Number(m[1])) return iso(d);
  }
  const w = /até (?:a |o )?(domingo|segunda|terça|terca|quarta|quinta|sexta|sábado|sabado)/.exec(s);
  if (w) {
    const alvo = SEMANA.indexOf(w[1].replace('terca', 'terça').replace('sabado', 'sábado'));
    let n = (alvo - hoje.getDay() + 7) % 7;
    if (n === 0) n = 7;
    return dia(n);
  }
  if (/esta semana|essa semana/.test(s)) return dia(6 - hoje.getDay() >= 0 ? 6 - hoje.getDay() : 0);
  return '';
}

function prioridadeDe(t) {
  const s = String(t || '').toLowerCase();
  if (/urgente|emergência|emergencia|evacua|incêndio|incendio|vazamento de gás|vazamento de gas/.test(s)) return 'urgente';
  return 'alta';
}

// "na Loja Centro", "no grupo Fábrica": um dos grupos da conta; senão, todas.
function alvoDe(t, grupos) {
  const s = String(t || '').toLowerCase();
  const g = (grupos || []).find((x) => x && s.includes(String(x).toLowerCase()));
  return g ? { tipo: 'grupo', nome: g } : { tipo: 'todas' };
}

/*
 * Sem IA: o pedido sem as palavras de comando vira o título; o que vem
 * depois de vírgula/travessão, o detalhe.
 */
function semIA(texto, hoje, grupos) {
  const agora = hoje || new Date();
  let t = corta(texto, 400);
  t = t.replace(/^(por favor,?\s*)?(adicion[ae]|coloc[ae]|p[õo]e|bota|crie|cria|fa[çc]a|publi(que|ca))\s+(um\s+|o\s+)?(aviso|recado|comunicado)\s*(de|da|do|que|sobre|:)?\s*/i, '');
  t = t.replace(/^(aviso|recado|comunicado)(\s+(urgente|importante))?\s*[:\-–—]\s*/i, '');
  t = t.replace(/\s*(em )?(todas as tvs|na[s]? tv[s]?)\s*/i, ' ').trim();
  // O grupo citado ("na Loja Centro") vai para o alvo, não para o cartaz.
  const grupo = alvoDe(texto, grupos);
  if (grupo.nome) t = t.replace(new RegExp('\\s*(na|no|em|para a|para o)?\\s*' + grupo.nome.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*', 'i'), ' ').trim().replace(/^que\s+/i, '');
  // O fim da data: o \b do JS não enxerga letra acentuada ("amanhã,").
  const fimDaData = '(?=$|[\\s,.;:—–-])';
  const semData = t.replace(new RegExp('[,;]?\\s*(só hoje|hoje|até amanhã|amanhã|até (?:o dia |dia )?\\d{1,2}/\\d{1,2}(?:/\\d{2,4})?|até (?:a |o )?(domingo|segunda|terça|terca|quarta|quinta|sexta|sábado|sabado)|esta semana|essa semana)' + fimDaData, 'gi'), '').trim();
  const [principal, ...resto] = semData.split(/\s*[,—–-]\s+|\.\s+/);
  const titulo = corta(principal.charAt(0).toUpperCase() + principal.slice(1), 70);
  return {
    titulo,
    detalhe: corta(resto.join(', '), 160),
    ate: ateQuando(texto, agora),
    prioridade: prioridadeDe(texto),
    alvo: alvoDe(texto, grupos),
  };
}

const SISTEMA = `Você transforma um pedido de aviso, escrito do jeito que a pessoa fala, no
aviso que vai para as TVs de uma empresa.

Devolva:
- titulo: o aviso em poucas palavras, como iria num cartaz (até 60 letras),
  sem "adicione aviso de";
- detalhe: o que a pessoa precisa saber ou fazer (até 140 letras), ou "";
- ate: até quando vale, AAAA-MM-DD (a partir de HOJE), ou "" se não disse;
- prioridade: "urgente" só para segurança/emergência; senão "alta";
- grupo: um dos GRUPOS da lista, se o pedido citar; senão "".
Não invente telefone, local ou horário que não estejam no pedido.
Responda APENAS JSON: { "titulo": "...", "detalhe": "...", "ate": "", "prioridade": "alta", "grupo": "" }`;

function normalizar(r, texto, hoje, grupos) {
  const base = semIA(texto, hoje, grupos);
  if (!r || typeof r !== 'object') return base;
  const ate = /^\d{4}-\d{2}-\d{2}$/.test(String(r.ate || '')) && String(r.ate) >= iso(hoje) ? String(r.ate) : base.ate;
  const grupo = (grupos || []).find((g) => g === r.grupo);
  return {
    titulo: corta(r.titulo, 70) || base.titulo,
    detalhe: corta(r.detalhe, 160),
    ate,
    prioridade: r.prioridade === 'urgente' ? 'urgente' : 'alta',
    alvo: grupo ? { tipo: 'grupo', nome: grupo } : base.alvo,
  };
}

async function entender(texto, { hoje, grupos } = {}) {
  const agora = hoje || new Date();
  if (ai.mode() === 'dev') return semIA(texto, agora, grupos);
  try {
    const usuario = ['HOJE: ' + iso(agora) + ' (' + SEMANA[agora.getDay()] + ')', 'GRUPOS: ' + ((grupos || []).join(', ') || '(nenhum)'), 'PEDIDO: ' + corta(texto, 500)].join('\n');
    return normalizar(ai.parseAiJson(await ai.callLLM(SISTEMA, usuario)), texto, agora, grupos);
  } catch (e) {
    return semIA(texto, agora, grupos);
  }
}

module.exports = { entender, semIA, ateQuando, prioridadeDe, alvoDe, normalizar, SISTEMA };
