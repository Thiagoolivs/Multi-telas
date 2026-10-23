/*
 * O aviso rápido no painel (EXECUTOR D27), sem React para dar para testar.
 *
 * O aviso vira o ALERTA dos modelos prontos, com a marca da conta (sem IA
 * para desenhar, sem crédito). O que o aviso não preenche fica vazio e
 * escondido: nada do texto de exemplo do modelo vai para a TV (#189).
 *
 * "Acha o espaço": entra na frente da zona principal de cada TV (a primeira
 * coisa que passa), com a prioridade (alta passa duas vezes por volta,
 * urgente toma a tela — D24/D25) e até quando vale; marcado com `_aviso`
 * para sair inteiro depois.
 */
import { itemDoModelo } from './modelosOuro.js';
import { zonasPorPapel } from './rodar.js';

const hojeIso = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };

export function pecaDoAviso(aviso, modelos, marca) {
  const modelo = modelos.get('servico-alerta');
  if (!modelo) return null;
  const base = itemDoModelo(modelo, marca);
  const campos = { kicker: aviso.prioridade === 'urgente' ? 'Urgente' : 'Aviso', titulo: aviso.titulo || '', apoio: aviso.detalhe || '' };
  if (base.campos.marca) campos.marca = base.campos.marca;
  const declarados = globalThis.MTPecaHtml ? globalThis.MTPecaHtml.higienizar(modelo.arq).campos : [];
  const ocultos = [];
  for (const c of declarados) {
    if (c.tipo !== 'texto' || c.nome === 'marca') continue;
    if (!campos[c.nome]) { campos[c.nome] = ''; ocultos.push(c.nome); }
  }
  return { ...base, campos, ...(ocultos.length ? { ocultos } : {}), duracao: 15, origem: { ...base.origem, pedido: 'aviso: ' + (aviso.titulo || '') } };
}

export function aplicarAviso(cfg, item, aviso, id) {
  const next = JSON.parse(JSON.stringify(cfg || {}));
  if (!next.zonas) next.zonas = {};
  const z = zonasPorPapel(next).principal || 'principal';
  const zona = next.zonas[z] && Array.isArray(next.zonas[z].items) ? next.zonas[z] : { ...(next.zonas[z] || {}), items: [] };
  const resto = zona.items.filter((it) => !(it && it._aviso === id));
  const novo = {
    ...item, _aviso: id,
    meta: { tipo: 'aviso', prioridade: aviso.prioridade || 'alta' },
    ...(aviso.ate ? { agendamento: { ativo: true, dias: [], dataInicio: hojeIso(), dataFim: aviso.ate } } : {}),
  };
  next.zonas[z] = { ...zona, items: [novo].concat(resto) };
  return next;
}

export function telasDoAviso(aviso, telas) {
  const a = (aviso && aviso.alvo) || { tipo: 'todas' };
  if (a.tipo === 'grupo') return (telas || []).filter((t) => (t.grupo || '') === a.nome);
  return telas || [];
}
