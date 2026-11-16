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
import '../../../js/templates.js';
import '../../../js/aviso.js';
import { itemDoModelo } from './modelosOuro.js';

const hojeIso = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };

/*
 * Onde o aviso entra e como (a zona, a prioridade, até quando) mora em
 * js/aviso.js desde que o servidor passou a pôr o aviso em cada TV (teste de
 * carga, 16/11: POST /api/lote/aviso). Aqui fica o mesmo, para a prévia e os
 * testes, sem mexer na programação recebida.
 */
const A = globalThis.MTAviso;
export const zonaDoAviso = (cfg) => A.zonaDoAviso(cfg);

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

// Quanto tempo o urgente sem data fica no ar.
export const URGENTE_DURA_MS = A.URGENTE_DURA_MS;

// A programação com o aviso na frente da zona do aviso; a recebida não muda.
export function aplicarAviso(cfg, item, aviso, id) {
  return A.porAviso(JSON.parse(JSON.stringify(cfg || {})), item, aviso, id, { hoje: hojeIso() });
}

// O dia de quem manda o aviso: a data do aviso começa nele (e não no dia do servidor, em UTC).
export const hojeDoAviso = hojeIso;

export function telasDoAviso(aviso, telas) {
  const a = (aviso && aviso.alvo) || { tipo: 'todas' };
  if (a.tipo === 'grupo') return (telas || []).filter((t) => (t.grupo || '') === a.nome);
  return telas || [];
}
