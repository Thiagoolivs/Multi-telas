/*
 * O calendário da empresa no painel (EXECUTOR D23), sem React para dar
 * para testar no Node.
 *
 * Cada evento vira uma peça com os MODELOS PRONTOS — sem IA, sem crédito:
 * o feriado e o evento no comunicado com a data grande, a campanha e a data
 * especial no cartaz do dia, o aviso no alerta. O que o modelo traz de
 * exemplo e o evento não preenche fica VAZIO e escondido: nenhum texto da
 * empresa de exemplo vai para a TV (regra do #189).
 *
 * Na TV, a peça entra com o período (de N dias antes até o dia), o tipo e a
 * prioridade, marcada com `_calendario`: aplicar de novo troca só a dela,
 * apagar o evento tira só a dela — "programado e editável".
 */
import { itemDoModelo } from './modelosOuro.js';
import { zonasPorPapel } from './rodar.js';

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const SEMANA = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
export const NOME_DO_TIPO = { evento: 'Evento', feriado: 'Feriado', campanha: 'Campanha', aviso: 'Aviso', comemorativa: 'Data especial' };
const MODELO_DO_TIPO = { feriado: 'servico-comunicado', evento: 'servico-comunicado', campanha: 'social-data', comemorativa: 'social-data', aviso: 'servico-alerta' };
const maiuscula = (s) => s.charAt(0).toUpperCase() + s.slice(1);

export function partesDaData(iso) {
  const [a, m, d] = String(iso || '').split('-').map(Number);
  const data = new Date(a, (m || 1) - 1, d || 1);
  return { dia: String(d).padStart(2, '0'), mes: MESES[(m || 1) - 1], semana: SEMANA[data.getDay()], curta: String(d).padStart(2, '0') + '/' + String(m).padStart(2, '0') };
}

// De quando a quando passa: N dias antes até o dia (o mesmo de server/calendario.js).
export function periodoDoEvento(ev) {
  const [a, m, d] = ev.data.split('-').map(Number);
  const ini = new Date(a, m - 1, d - (Number(ev.antecedencia) || 0));
  const iso = (x) => x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') + '-' + String(x.getDate()).padStart(2, '0');
  return { dataInicio: iso(ini), dataFim: ev.data };
}

// O título em duas linhas, para o cartaz do dia ("Outubro" / "Rosa").
function duasLinhas(t) {
  const p = String(t || '').split(' ').filter(Boolean);
  if (p.length < 2) return [t || '', ''];
  const meio = Math.ceil(p.length / 2);
  return [p.slice(0, meio).join(' '), p.slice(meio).join(' ')];
}

/*
 * A peça do evento. `modelos`: Map id → modelo (carregarModelos). Todo campo
 * de texto que o evento não preenche sai vazio e escondido.
 */
export function pecaDoEvento(ev, modelos, marca) {
  const modelo = modelos.get(MODELO_DO_TIPO[ev.tipo] || 'servico-comunicado');
  if (!modelo) return null;
  const base = itemDoModelo(modelo, marca);
  const d = partesDaData(ev.data);
  const tipo = NOME_DO_TIPO[ev.tipo] || 'Evento';
  let campos;
  if (modelo.id === 'servico-comunicado') {
    campos = { mes: maiuscula(d.mes), dia: d.dia, semana: maiuscula(d.semana), kicker: tipo, titulo: ev.titulo, apoio: ev.detalhe || '' };
  } else if (modelo.id === 'social-data') {
    const [t1, t2] = duasLinhas(ev.titulo);
    campos = { numero: d.dia, kicker: tipo + ' · ' + d.dia + ' de ' + d.mes, titulo: t1, titulo2: t2, apoio: ev.detalhe || '' };
  } else {
    campos = { kicker: tipo + ' · ' + d.curta, titulo: ev.titulo, apoio: ev.detalhe || '' };
  }
  if (base.campos.marca) campos.marca = base.campos.marca;
  const declarados = globalThis.MTPecaHtml ? globalThis.MTPecaHtml.higienizar(modelo.arq).campos : [];
  const ocultos = [];
  for (const c of declarados) {
    if (c.tipo !== 'texto' || c.nome === 'marca') continue;
    if (!campos[c.nome]) { campos[c.nome] = ''; ocultos.push(c.nome); }
  }
  return {
    ...base, campos, ...(ocultos.length ? { ocultos } : {}),
    duracao: ev.prioridade === 'urgente' ? 20 : 15,
    origem: { ...base.origem, pedido: 'calendário: ' + ev.titulo },
  };
}

// As TVs do evento: todas, um grupo ou as escolhidas.
export function telasDoEvento(ev, telas) {
  const a = (ev && ev.alvo) || { tipo: 'todas' };
  if (a.tipo === 'grupo') return (telas || []).filter((t) => (t.grupo || '') === a.nome);
  if (a.tipo === 'telas') return (telas || []).filter((t) => (a.ids || []).includes(t.id));
  return telas || [];
}

/*
 * A programação da TV com os eventos: cada um na zona principal, com o
 * período, o tipo e a prioridade, no lugar da versão anterior dele. Os que
 * não são mais desta TV (`fora`) saem. Não modifica a recebida.
 */
export function aplicarCalendario(cfg, eventos, fora = []) {
  const next = JSON.parse(JSON.stringify(cfg || {}));
  if (!next.zonas) next.zonas = {};
  const z = zonasPorPapel(next).principal || 'principal';
  const zona = next.zonas[z] && Array.isArray(next.zonas[z].items) ? next.zonas[z] : { ...(next.zonas[z] || {}), items: [] };
  const ids = new Set(eventos.map((e) => e.id).concat(fora));
  const resto = zona.items.filter((it) => !(it && it._calendario && ids.has(it._calendario)));
  const novos = eventos.filter((e) => e.item).map((e) => ({
    ...e.item,
    _calendario: e.id,
    meta: { tipo: e.tipo, prioridade: e.prioridade },
    agendamento: { ativo: true, dias: [], ...periodoDoEvento(e) },
  }));
  next.zonas[z] = { ...zona, items: novos.concat(resto) };
  return next;
}

// Tira da TV a peça de um evento (apagar o evento, ou tirar esta TV dele).
export function tirarDoCalendario(cfg, id) {
  const next = JSON.parse(JSON.stringify(cfg || {}));
  for (const zona of Object.values(next.zonas || {})) {
    if (zona && Array.isArray(zona.items)) zona.items = zona.items.filter((it) => !(it && it._calendario === id));
  }
  return next;
}
