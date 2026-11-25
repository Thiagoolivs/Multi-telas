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
/*
 * O período, pôr e tirar as datas da TV moram em js/lote-tv.js desde o teste
 * de carga (16/11): o servidor põe a Agenda em muitas TVs com a mesma regra
 * (POST /api/lote/operacao, tipos 'calendario' e 'tirar-calendario').
 */
import '../../../js/lote-tv.js';
import { enviarOperacao } from './rodar.js';

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const SEMANA = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
export const NOME_DO_TIPO = { evento: 'Evento', feriado: 'Feriado', campanha: 'Campanha', aviso: 'Aviso', comemorativa: 'Data especial' };
const MODELO_DO_TIPO = { feriado: 'servico-comunicado', evento: 'servico-comunicado', campanha: 'social-data', comemorativa: 'social-data', aviso: 'servico-alerta' };
const maiuscula = (s) => s.charAt(0).toUpperCase() + s.slice(1);

export function partesDaData(iso) {
  const [a, m, d] = String(iso || '').split('-').map(Number);
  // Reteste 4: a data de antes que não é data ("data-invalida", mês 13) aparecia como "NaN" e "undefined".
  if (!(a > 0 && m >= 1 && m <= 12 && d >= 1 && d <= 31)) return { dia: '–', mes: '', semana: '', curta: 'sem data' };
  const data = new Date(a, (m || 1) - 1, d || 1);
  return { dia: String(d).padStart(2, '0'), mes: MESES[(m || 1) - 1], semana: SEMANA[data.getDay()], curta: String(d).padStart(2, '0') + '/' + String(m).padStart(2, '0') };
}

// De quando a quando passa: N dias antes até o dia (o mesmo de server/calendario.js).
export const periodoDoEvento = (ev) => globalThis.MTLoteTv.periodoDoEvento(ev);

/*
 * A campanha de mês inteiro (js/datas-frente.js): o evento é o último dia do
 * mês e entra na TV no dia 1º. Sai do que está guardado (data e
 * antecedência), então editar a data depois continua dando o mesmo cartaz.
 */
export function campanhaDoMes(ev) {
  if (!ev || !ev.data) return false;
  const [a, m, d] = ev.data.split('-').map(Number);
  const ultimo = new Date(a, m, 0).getDate();
  return d === ultimo && periodoDoEvento(ev).dataInicio === ev.data.slice(0, 8) + '01';
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
    // A campanha do mês inteiro (Outubro Rosa, fase 11): o número é o do mês, não o último dia.
    const mesTodo = campanhaDoMes(ev);
    campos = { numero: mesTodo ? String(Number(ev.data.slice(5, 7))).padStart(2, '0') : d.dia, kicker: mesTodo ? tipo + ' · o mês todo' : tipo + ' · ' + d.dia + ' de ' + d.mes, titulo: t1, titulo2: t2, apoio: ev.detalhe || '' };
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

/*
 * O QUE A AGENDA DIZ DA DATA (lote de 06/11). Com a aprovação ligada, o
 * membro que põe a data manda um pedido; a lista dizia "Na TV" do mesmo
 * jeito. O estado vem do servidor (GET /api/calendario: `aprovacao` do
 * último pedido que levou a data, e `aplicadoEm`, a última vez que a data
 * foi para a TV de verdade):
 *
 *   esperando  o pedido espera o dono, e a data ainda não está na TV;
 *   saindo     a data foi apagada, e o pedido que a tira da TV espera o dono
 *              (até lá ela continua na TV e na Agenda);
 *   na-tv      está na TV (a `nota` diz se uma mudança dela — ou a saída —
 *              espera ou não foi);
 *   fora       não está na TV (a `nota` diz o porquê: o pedido recusado, com o motivo).
 *
 * `pedido`: o id do pedido que espera (o link para Aprovações).
 */
const PORQUE = {
  recusada: (a) => 'O pedido foi recusado' + (a.motivo ? ': ' + a.motivo : '.'),
  cancelada: () => 'O pedido foi cancelado.',
  substituida: () => 'Um pedido mais novo tomou o lugar.',
};
export function situacaoDaData(ev) {
  const e = ev || {};
  const n = (e.telas || []).length;
  const p = periodoDoEvento(e);
  const periodo = 'de ' + partesDaData(p.dataInicio).curta + ' a ' + partesDaData(e.data).curta;
  const naTv = 'Na TV ' + periodo + ' · ' + (n === 1 ? '1 TV' : n + ' TVs');
  const a = e.aprovacao;
  const jaFoi = !!e.aplicadoEm;
  // Apagada com aprovação: sai da TV (e da Agenda) quando aprovarem; recusado, fica como estava.
  if (a && a.saindo) {
    if (a.estado === 'pendente') return { estado: 'saindo', texto: 'Saindo da TV · espera aprovação', pedido: a.id };
    if (PORQUE[a.estado]) return { estado: 'na-tv', texto: naTv, nota: 'Não saiu da TV. ' + PORQUE[a.estado](a) };
  }
  if (a && a.estado === 'pendente') {
    return jaFoi
      ? { estado: 'na-tv', texto: naTv, nota: 'A mudança espera aprovação.', pedido: a.id }
      : { estado: 'esperando', texto: 'Entra na TV ' + periodo + ' quando aprovarem', pedido: a.id };
  }
  if (a && PORQUE[a.estado]) {
    const porque = PORQUE[a.estado](a);
    return jaFoi ? { estado: 'na-tv', texto: naTv, nota: 'A mudança não foi. ' + porque } : { estado: 'fora', texto: 'Fora da TV', nota: porque };
  }
  return n ? { estado: 'na-tv', texto: naTv } : { estado: 'fora', texto: 'Fora da TV' };
}

// As TVs do evento: todas, um grupo ou as escolhidas.
export function telasDoEvento(ev, telas) {
  const a = (ev && ev.alvo) || { tipo: 'todas' };
  if (a.tipo === 'grupo') return (telas || []).filter((t) => (t.grupo || '') === a.nome);
  if (a.tipo === 'telas') return (telas || []).filter((t) => (a.ids || []).includes(t.id));
  // As lojas de um membro (fase 13): o servidor grava assim o "todas as TVs" de quem só vê algumas lojas.
  if (a.tipo === 'grupos') {
    const k = (g) => String(g || '').replace(/\s+/g, ' ').trim().toLowerCase();
    const nomes = new Set((a.nomes || []).map(k));
    return (telas || []).filter((t) => t.grupo && nomes.has(k(t.grupo)));
  }
  return telas || [];
}

/*
 * A programação da TV com os eventos: cada um na zona principal, com o
 * período, o tipo e a prioridade, no lugar da versão anterior dele. Os que
 * não são mais desta TV (`fora`) saem. Não modifica a recebida.
 */
export const aplicarCalendario = (cfg, eventos, fora = []) => globalThis.MTLoteTv.aplicarCalendario(cfg, eventos, fora);

// Tira da TV a peça de um evento (apagar o evento, ou tirar esta TV dele).
export const tirarDoCalendario = (cfg, id) => globalThis.MTLoteTv.tirarDoCalendario(cfg, id);

/*
 * AS DATAS NAS TVS, PELO SERVIDOR (teste de carga, 16/11). O painel lia a
 * programação de cada TV, punha as datas e mandava todas de volta: numa conta
 * de RH, acima de ~19 TVs o envio passava de 2 MB e era recusado. Agora vai a
 * operação 'calendario': as datas (com a peça) uma vez só, e cada TV aponta
 * para o que é dela — as datas que recebe e as que saem dela (`entradas`,
 * uma por combinação). Tudo ou nada, com Desfazer e a aprovação.
 */
export function porAgendaNasTelas(salvos, tvs) {
  const dela = (tv) => salvos.filter((e) => telasDoEvento(e, tvs).some((t) => t.id === tv.id));
  const fora = (tv) => salvos.filter((e) => !dela(tv).includes(e) && (e.telas || []).includes(tv.id)).map((e) => e.id);
  const eventos = salvos.map((e) => ({ id: e.id, tipo: e.tipo, prioridade: e.prioridade, data: e.data, antecedencia: e.antecedencia || 0, item: e.item || null }));
  const chaves = [];
  const entradas = [];
  const telas = [];
  for (const tv of tvs || []) {
    const d = dela(tv).map((e) => salvos.indexOf(e));
    const f = fora(tv);
    if (!d.length && !f.length) continue;
    const k = JSON.stringify([d, f]);
    let i = chaves.indexOf(k);
    if (i < 0) { i = chaves.length; chaves.push(k); entradas.push({ dela: d, fora: f }); }
    telas.push({ id: tv.id, entrada: i });
  }
  return enviarOperacao({ tipo: 'calendario', eventos, entradas }, telas);
}

// Apagar uma data: a peça dela sai das TVs em que estava (a operação 'tirar-calendario').
export function tirarDaAgenda(ev, tvs) {
  const telas = (ev.telas || []).map((id) => (tvs || []).find((t) => t.id === id)).filter(Boolean).map((t) => ({ id: t.id }));
  return enviarOperacao({ tipo: 'tirar-calendario', id: ev.id, titulo: ev.titulo || '' }, telas);
}
