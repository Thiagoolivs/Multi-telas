import { useEffect, useState } from 'react';
import { kpis } from '../api.js';

/*
 * O CARTÃO "AO VIVO" DO INDICADOR NO PAINEL (reteste 4, 25/11).
 *
 * O cartão posto por Indicadores ("Pôr na TV") guarda só a chave do
 * indicador (`item.indicador`): o número vem da conta, e a TV o busca de 5
 * em 5 minutos (js/render.js, kpiAoVivo). A lista da TV no painel desenhava
 * o `item.valor` — que esse cartão não tem — e mostrava "—" enquanto a
 * parede mostrava o número. Aqui fica a mesma conta da TV, com o número que
 * o painel lê em /api/kpis. O teste confere que as duas dão o mesmo texto.
 */

// O número como a TV escreve (js/render.js, formatarKpi): "1.910", "1,2 mi", "R$ 12.300", "87,5%".
export function formatarKpi(v, u) {
  if (v == null || !isFinite(v)) return '—';
  const abs = Math.abs(v);
  const txt = abs >= 1e9 ? (v / 1e9).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' bi'
    : abs >= 1e6 ? (v / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' mi'
    : v.toLocaleString('pt-BR', { maximumFractionDigits: abs < 100 ? 2 : 0 });
  const un = String(u || '').trim();
  if (!un) return txt;
  if (/^(R\$|US\$|\$|€)$/i.test(un)) return un + ' ' + txt;
  return un === '%' ? txt + '%' : txt + ' ' + un;
}

/*
 * O cartão com o número de agora: { rotulo, valor, variacao?, tendencia?,
 * detalhe }. `lista`: os indicadores da conta (null = ainda lendo). A
 * unidade vai junto do número ("1.910 peças"), como a TV desenha.
 */
export function kpiNoPainel(item, lista) {
  if (!item || !item.indicador) return item;
  if (lista == null) return { ...item, valor: '…', detalhe: item.detalhe || '' };
  const k = (Array.isArray(lista) ? lista : []).find((x) => x && x.chave === item.indicador);
  if (!k) return { ...item, valor: '—', detalhe: item.detalhe || 'Esperando o primeiro número' };
  const out = { rotulo: item.rotulo || k.nome, valor: formatarKpi(k.valor, k.unidade), duracao: item.duracao };
  if (k.anterior != null && k.anterior !== 0 && k.valor !== k.anterior) {
    const pct = (k.valor - k.anterior) / Math.abs(k.anterior) * 100;
    out.variacao = Math.abs(pct).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + '%';
    out.tendencia = pct > 0 ? 'subiu' : 'desceu';
  }
  // A lista do painel diz `atualizadoEm`; a da TV, `em`.
  const em = Number(k.atualizadoEm || k.em) || 0;
  out.detalhe = item.detalhe || (em ? 'Atualizado às ' + new Date(em).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '');
  return out;
}

/*
 * A programação tem cartão ao vivo? E os indicadores no formato que a TV lê
 * (global.MT_KPIS, o mesmo de GET /api/devices/:id/kpis): a prévia da TV no
 * painel (TvAoVivo) desenha com o número, e não com "Esperando o primeiro número".
 */
export function temKpiAoVivo(cfg) {
  return Object.values((cfg && cfg.zonas) || {}).some((z) => z && Array.isArray(z.items) && z.items.some((it) => it && it.type === 'kpi' && it.indicador));
}
export function indicadoresParaATv(lista) {
  return (Array.isArray(lista) ? lista : []).map((i) => ({ chave: i.chave, nome: i.nome, valor: i.valor, unidade: i.unidade, meta: i.meta,
    sentido: i.sentido, anterior: i.anterior, em: Number(i.atualizadoEm || i.em) || 0 }));
}

/*
 * Os indicadores da conta, uma leitura para todos os cartões da página (a
 * lista de uma TV pode ter vários) e de novo a cada minuto. null enquanto lê;
 * [] se a leitura falhar (o cartão diz "Esperando o primeiro número", como a TV sem rede).
 */
let lida = null;
function lerIndicadores() {
  if (lida && Date.now() - lida.em < 60000) return lida.p;
  const p = kpis.list().then((r) => (r && Array.isArray(r.indicadores) ? r.indicadores : []));
  lida = { p, em: Date.now() };
  p.catch(() => { if (lida && lida.p === p) lida = null; });
  return p;
}

export function useIndicadores(ligado = true) {
  const [lista, setLista] = useState(null);
  useEffect(() => {
    if (!ligado) return undefined;
    let vivo = true;
    lerIndicadores().then((l) => { if (vivo) setLista(l); }, () => { if (vivo) setLista([]); });
    return () => { vivo = false; };
  }, [ligado]);
  return lista;
}
