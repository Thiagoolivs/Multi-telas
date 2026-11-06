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
  // As lojas do membro (fase 13): o "todas as TVs" de quem só vê algumas lojas (server/routes/calendario.js).
  if (a.tipo === 'grupos' && Array.isArray(a.nomes)) {
    const nomes = [...new Set(a.nomes.map((x) => corta(x, 60)).filter(Boolean))].slice(0, 50);
    if (nomes.length) return { tipo: 'grupos', nomes };
  }
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

/*
 * Fase 5: datas sem data escrita. "Black Friday e Natal" dava "Não achei
 * nenhuma data no texto" (BLOCO-3, cenário 5), e o produto sabe calcular as
 * duas (js/seasons.js). O nome da data no texto vira o evento na próxima
 * vez que ela cai — o dia é o do calendário brasileiro, não um palpite.
 */
const Seasons = require('../js/seasons.js');
const semAcento = (t) => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const APELIDOS = { 'dia-maes': ['dia das maes'], 'dia-pais': ['dia dos pais'], 'dia-criancas': ['dia das criancas'],
  independencia: ['independencia', '7 de setembro', 'sete de setembro'], 'dia-trabalho': ['dia do trabalho', 'dia do trabalhador'],
  'dia-mulher': ['dia da mulher', 'dia das mulheres'], 'ano-novo': ['ano novo', 'reveillon', 'virada do ano'] };
const TIPO_DA_DATA = { 'black-friday': 'campanha', 'outubro-rosa': 'campanha', 'novembro-azul': 'campanha', independencia: 'feriado', 'dia-trabalho': 'feriado' };
/*
 * Fase 11: as datas prontas das frentes (js/datas-frente.js) também se leem
 * pelo nome — "Setembro Amarelo", "Dia dos Namorados", "Maio Amarelo". A
 * campanha de mês inteiro passa o mês todo (o evento é o último dia, com a
 * antecedência desde o dia 1º); o resto continua com o catálogo das datas.
 */
const Frentes = require('../js/datas-frente.js');
function datasPorNome(texto, hoje) {
  const t = ' ' + semAcento(texto).replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ') + ' ';
  const agora = hoje || new Date();
  const hojeIso = iso(agora);
  const saida = [];
  const doCatalogo = new Set((Seasons.SEASONS || []).map((sz) => sz.id));
  const vistos = new Set();
  Frentes.todas().forEach((d) => {
    if (doCatalogo.has(d.id) && d.quando.tipo !== 'mes') return;
    const nomes = [semAcento(d.titulo)].concat(APELIDOS[d.id] || []);
    if (!nomes.some((n) => t.indexOf(' ' + n + ' ') >= 0)) return;
    const o = Frentes.ocorrencia(d, agora);
    const ev = o && normalizar({ data: o.data, titulo: d.titulo, tipo: TIPO_DA_DATA[d.id] || d.tipo, detalhe: d.detalhe || '', antecedencia: o.antecedencia });
    if (ev) { saida.push(ev); vistos.add(d.id); }
  });
  (Seasons.SEASONS || []).forEach((sz) => {
    if (vistos.has(sz.id)) return;
    const nomes = [semAcento(sz.label)].concat(APELIDOS[sz.id] || []);
    if (!nomes.some((n) => t.indexOf(' ' + n + ' ') >= 0)) return;
    let data = '';
    for (const ano of [agora.getFullYear(), agora.getFullYear() + 1]) {
      const d = Seasons.dataDe(sz, ano);
      const dia = d ? new Date(d).toISOString().slice(0, 10) : '';
      if (dia && dia >= hojeIso) { data = dia; break; }
    }
    const ev = data && normalizar({ data, titulo: sz.label, tipo: TIPO_DA_DATA[sz.id] || 'comemorativa' });
    if (ev) saida.push(ev);
  });
  return saida;
}
// Junta as datas pelo nome às achadas pelo dia, sem repetir a mesma data.
function comDatasPorNome(eventos, texto, hoje) {
  const lista = (eventos || []).slice();
  datasPorNome(texto, hoje).forEach((ev) => { if (!lista.some((x) => x.data === ev.data)) lista.push(ev); });
  return lista.sort((a, b) => a.data.localeCompare(b.data));
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
  if (ai.mode() === 'dev') return comDatasPorNome(lerSemIA(texto, agora), texto, agora);
  try {
    const r = ai.parseAiJson(await ai.callLLM(SISTEMA, 'HOJE: ' + iso(agora) + '\n\nTEXTO:\n' + String(texto || '').slice(0, 6000)));
    const eventos = (r && Array.isArray(r.eventos) ? r.eventos : []).map(normalizar).filter(Boolean).slice(0, 100);
    if (eventos.length) return comDatasPorNome(eventos, texto, agora);
  } catch (e) { /* a IA caiu: a leitura por regra ainda funciona */ }
  return comDatasPorNome(lerSemIA(texto, agora), texto, agora);
}

// De quando a quando o evento passa na TV: N dias antes até o dia.
function periodo(ev) {
  const [a, m, d] = ev.data.split('-').map(Number);
  return { dataInicio: iso(new Date(a, m - 1, d - ev.antecedencia)), dataFim: ev.data };
}

module.exports = { TIPOS, PRIORIDADES, ANTECEDENCIA, normalizar, lerSemIA, entender, tipoDoTexto, periodo, SISTEMA, datasPorNome };
