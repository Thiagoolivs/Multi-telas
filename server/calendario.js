/*
 * server/calendario.js — o calendário da empresa (EXECUTOR D23).
 *
 * O dono: "a empresa poderá adicionar um calendário da empresa, importando
 * texto, e a IA cria todo o conteúdo e o cronograma de avisos, programado
 * e editável". A pessoa cola o que tem — a lista do RH, o e-mail da
 * diretoria, a agenda do mês — e cada linha com data vira um EVENTO:
 * quando é, o que é, de que tipo, quantos dias antes começa a aparecer e
 * em quais TVs. O painel monta a peça de cada um (com os modelos prontos,
 * sem gastar crédito) e põe na programação com o período certo.
 *
 * Aqui mora a regra: o que é um evento válido, como se lê o texto sem IA
 * (localhost e quando a IA cai) e o pedido à IA.
 */
const ai = require('./ai');

const TIPOS = ['evento', 'feriado', 'campanha', 'aviso', 'comemorativa'];
const PRIORIDADES = ['normal', 'alta', 'urgente'];
// Quantos dias antes cada tipo começa a passar na TV.
const ANTECEDENCIA = { feriado: 5, evento: 7, campanha: 14, aviso: 3, comemorativa: 7 };
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

const corta = (s, n) => String(s == null ? '' : s).replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);
const iso = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');

function dataValida(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || ''));
  if (!m) return '';
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return d.getMonth() === Number(m[2]) - 1 && d.getDate() === Number(m[3]) ? s : '';
}

function alvoValido(a) {
  if (!a || typeof a !== 'object' || a.tipo === 'todas') return { tipo: 'todas' };
  if (a.tipo === 'grupo' && corta(a.nome, 60)) return { tipo: 'grupo', nome: corta(a.nome, 60) };
  if (a.tipo === 'telas' && Array.isArray(a.ids)) {
    const ids = a.ids.map((x) => String(x || '')).filter((x) => /^[A-Za-z0-9_-]{1,64}$/.test(x)).slice(0, 200);
    if (ids.length) return { tipo: 'telas', ids };
  }
  return { tipo: 'todas' };
}

// Um evento só vale com data de verdade e um título.
function normalizar(e) {
  if (!e || typeof e !== 'object') return null;
  const data = dataValida(e.data);
  const titulo = corta(e.titulo, 80);
  if (!data || !titulo) return null;
  const tipo = TIPOS.includes(e.tipo) ? e.tipo : 'evento';
  const antecedencia = Number(e.antecedencia);
  return {
    data, titulo, tipo,
    detalhe: corta(e.detalhe, 200),
    antecedencia: Number.isFinite(antecedencia) ? Math.max(0, Math.min(60, Math.round(antecedencia))) : ANTECEDENCIA[tipo],
    prioridade: PRIORIDADES.includes(e.prioridade) ? e.prioridade : (tipo === 'feriado' || tipo === 'aviso' ? 'alta' : 'normal'),
    alvo: alvoValido(e.alvo),
  };
}

// O tipo pelo que a linha diz — a regra que vale sem IA, e o palpite inicial com ela.
function tipoDoTexto(t) {
  const s = String(t || '').toLowerCase();
  if (/feriado|recesso|ponto facultativo|não haverá expediente|nao havera expediente/.test(s)) return 'feriado';
  if (/dia d[aoe]s? (mães|maes|pais|mulher(es)?|criança|crianca|trabalhador|professor)|natal|páscoa|pascoa|ano novo|aniversário da empresa|aniversario da empresa/.test(s)) return 'comemorativa';
  if (/(outubro rosa|novembro azul|setembro amarelo|campanha|vacinação|vacinacao|doação|doacao|arrecada)/.test(s)) return 'campanha';
  if (/(aviso|manutenção|manutencao|interdi|sem (água|agua|luz|energia)|falta de|troca de|mudança de horário|mudanca de horario)/.test(s)) return 'aviso';
  return 'evento';
}

/*
 * Sem IA: uma linha com data vira um evento. Aceita o que as pessoas
 * escrevem — "10/11 SIPAT", "15/11/2026 - Feriado", "28 de novembro:
 * confraternização". Data que já passou este ano vai para o ano que vem.
 */
function lerSemIA(texto, hoje) {
  const agora = hoje || new Date();
  const saida = [];
  for (const bruta of String(texto || '').split(/\r?\n/).slice(0, 200)) {
    const linha = bruta.trim().replace(/^[-•*·\s]+/, '');
    if (!linha) continue;
    let dia = 0;
    let mes = 0;
    let ano = 0;
    let resto = '';
    let m = /^(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2,4}))?\b\s*(.*)$/.exec(linha);
    if (m) { dia = Number(m[1]); mes = Number(m[2]); ano = m[3] ? Number(m[3].length === 2 ? '20' + m[3] : m[3]) : 0; resto = m[4]; }
    else {
      m = /^(?:dia\s+)?(\d{1,2})\s+de\s+([a-zçã]+)(?:\s+de\s+(\d{4}))?\b\s*(.*)$/i.exec(linha);
      if (m && MESES.indexOf(m[2].toLowerCase()) >= 0) { dia = Number(m[1]); mes = MESES.indexOf(m[2].toLowerCase()) + 1; ano = m[3] ? Number(m[3]) : 0; resto = m[4]; }
    }
    if (!dia || !mes) continue;
    if (!ano) {
      ano = agora.getFullYear();
      if (new Date(ano, mes - 1, dia) < new Date(agora.getFullYear(), agora.getMonth(), agora.getDate())) ano += 1;
    }
    // "31/02" não existe: o Date "transbordaria" para março.
    const quando = new Date(ano, mes - 1, dia);
    if (quando.getMonth() !== mes - 1 || quando.getDate() !== dia) continue;
    const titulo = resto.replace(/^[\s:–—-]+/, '').replace(/\s*[–—-]\s*/, ' — ');
    const [principal, detalhe] = titulo.split(' — ');
    const ev = normalizar({ data: iso(new Date(ano, mes - 1, dia)), titulo: principal, detalhe: detalhe || '', tipo: tipoDoTexto(titulo) });
    if (ev) saida.push(ev);
  }
  return saida.sort((a, b) => a.data.localeCompare(b.data));
}

const SISTEMA = `Você organiza o calendário de uma empresa para as TVs internas.
A pessoa colou um texto (lista do RH, e-mail, agenda). Ache cada DATA com o
que acontece nela e devolva um evento por data/acontecimento.

Para cada evento:
- data: AAAA-MM-DD (se o ano não vier, use o próximo que ainda não passou, a partir de HOJE);
- titulo: curto, como iria num cartaz (até 60 letras), sem a data;
- tipo: "feriado" | "evento" | "campanha" | "aviso" | "comemorativa";
- detalhe: hora, local ou o que fazer, se o texto disser (até 160 letras); não invente.

Ignore o que não tem data. Responda APENAS JSON:
{ "eventos": [ { "data": "2026-11-15", "titulo": "...", "tipo": "feriado", "detalhe": "..." } ] }`;

async function entender(texto, hoje) {
  const agora = hoje || new Date();
  if (ai.mode() === 'dev') return lerSemIA(texto, agora);
  try {
    const r = ai.parseAiJson(await ai.callLLM(SISTEMA, 'HOJE: ' + iso(agora) + '\n\nTEXTO:\n' + String(texto || '').slice(0, 6000)));
    const eventos = (r && Array.isArray(r.eventos) ? r.eventos : []).map(normalizar).filter(Boolean).slice(0, 100);
    if (eventos.length) return eventos.sort((a, b) => a.data.localeCompare(b.data));
  } catch (e) { /* a IA caiu: a leitura por regra ainda funciona */ }
  return lerSemIA(texto, agora);
}

// De quando a quando o evento passa na TV: N dias antes até o dia.
function periodo(ev) {
  const [a, m, d] = ev.data.split('-').map(Number);
  return { dataInicio: iso(new Date(a, m - 1, d - ev.antecedencia)), dataFim: ev.data };
}

module.exports = { TIPOS, PRIORIDADES, ANTECEDENCIA, normalizar, lerSemIA, entender, tipoDoTexto, periodo, SISTEMA };
