/*
 * TELAS PRONTAS (EXECUTOR D18): telas inteiras — layout, peças em cada zona
 * e as frases do rodapé — que o dono aprovou na bancada, para o cliente
 * escolher, trocar os textos e pôr na TV. A peça já vem com a marca da conta
 * (cores, fontes, nome, logo), como nos modelos prontos (D16).
 *
 * A tela que o dono ainda não aprovou ('proposta') não aparece aqui.
 */
import '../../../js/templates.js';
import { carregarModelos, itemDoModelo } from './modelosOuro.js';
import { getLayout as layoutDoPainel } from './screenConfig.js';

// A grade do layout é a da TV (js/templates.js); a lista do painel não traz a grade.
const getLayout = (id) => (globalThis.MT_getLayout && globalThis.MT_getLayout(id)) || layoutDoPainel(id);

// As telas antigas da bancada não diziam o perfil: vale o da marca de exemplo.
const PERFIL_DA_MARCA = { otica: 'comercio', padaria: 'comercio', salao: 'comercio', lanchonete: 'comercio', clinica: 'saude', rotasul: 'empresa' };
export const perfilDaTela = (t) => t.perfil || PERFIL_DA_MARCA[t.marca] || 'comercio';

export const aprovadas = (manifesto) => ((manifesto && manifesto.telas) || []).filter((t) => t.estado === 'aprovada');

export const emPe = (layoutId) => /^portrait/.test(layoutId || '');

// O grupo da tela (cabecalho, principal, lateral, rodape) de cada zona do layout — o mesmo de js/bancada.js.
const GRUPO_DA_ZONA = { cabecalho: 'cabecalho', principal: 'principal', video: 'principal', lateral: 'lateral', secundaria: 'lateral', info: 'lateral', rodape: 'rodape' };
export const grupoDaZona = (zona) => GRUPO_DA_ZONA[zona.id] || (zona.type === 'header' ? 'cabecalho' : zona.type === 'ticker' ? 'rodape' : 'principal');

let cache = null;
// O manifesto e as peças abertas, uma vez por sessão.
export function carregarTelasProntas() {
  if (!cache) {
    cache = Promise.all([
      fetch('/pecas-ouro/manifesto.json').then((r) => { if (!r.ok) throw new Error('não deu para abrir as telas prontas'); return r.json(); }),
      carregarModelos(),
    ]).then(([m, modelos]) => ({ telas: aprovadas(m), modelos: new Map(modelos.map((x) => [x.id, x])) }))
      .catch((e) => { cache = null; throw e; });
  }
  return cache;
}

/*
 * Os campos que são da empresa de EXEMPLO e não da conta: o ano de fundação
 * ("Desde 1987") sai em branco, em vez de dizer na TV do cliente uma coisa
 * que ele nunca disse. O nome da empresa entra pelo itemDoModelo.
 */
const DO_EXEMPLO = ['desde'];

// A peça de uma zona da tela, pronta para desenhar e para ir à TV.
export function itemDaTela(modelo, entrada, modo, papel, marca) {
  const base = itemDoModelo(modelo, marca);
  const campos = { ...(entrada.campos || {}) };
  DO_EXEMPLO.forEach((c) => { if (c in campos) campos[c] = ''; });
  if (base.campos.marca) campos.marca = base.campos.marca;
  else delete campos.marca;
  return { ...base, papel, modo: modo || 'marca', campos };
}

/*
 * A tela pronta com a marca da conta: por grupo, as peças (itens) e as
 * frases do rodapé. Peça que não abriu fica de fora (não derruba a tela).
 */
export function montarTela(tela, modelos, marca) {
  const PAPEL = { cabecalho: 'cabecalho', principal: 'destaque', lateral: 'lateral', rodape: 'rodape' };
  const grupos = {};
  for (const [g, z] of Object.entries(tela.zonas || {})) {
    grupos[g] = (z.pecas || []).map((e) => (typeof e === 'string' ? { id: e } : e))
      .filter((e) => modelos.has(e.id))
      .map((e) => itemDaTela(modelos.get(e.id), e, z.modo, PAPEL[g], marca));
  }
  return { id: tela.id, nome: tela.nome, layout: tela.layout, grupos, mensagens: (tela.mensagens || []).slice() };
}

/*
 * O que a prévia desenha (o mesmo formato do "Ver a tela agora"): a primeira
 * peça de cada zona e o letreiro do rodapé.
 */
export function estadoDaPrevia(montada) {
  const layout = getLayout(montada.layout);
  const zonas = {};
  for (const z of layout.zones) {
    const g = grupoDaZona(z);
    const pecas = montada.grupos[g] || [];
    if (!pecas.length) continue;
    zonas[z.id] = z.type === 'header' || z.type === 'ticker'
      ? { peca: pecas[0], mensagens: z.type === 'ticker' ? montada.mensagens : [] }
      : { item: pecas[0] };
  }
  return { layoutId: montada.layout, tela: emPe(montada.layout) ? { w: 1080, h: 1920 } : { w: 1920, h: 1080 }, zonas };
}

/*
 * A programação da TV com a tela pronta: o layout da tela e, em cada zona
 * dele, as peças dela (no lugar do que havia). O resto da programação —
 * horário, som, tema, nome — fica. Não modifica a recebida.
 */
export function aplicarTelaPronta(cfg, montada) {
  const next = JSON.parse(JSON.stringify(cfg || {}));
  next.settings = { ...(next.settings || {}), layoutId: montada.layout };
  const antes = next.zonas || {};
  next.zonas = {};
  for (const z of getLayout(montada.layout).zones) {
    const pecas = (montada.grupos[grupoDaZona(z)] || []).map((p) => ({ duracao: p.duracao || 20, ...p, origem: { ...(p.origem || {}), pedido: 'tela pronta', tela: montada.id } }));
    // A zona mantém o que é dela (transição, notícias, velocidade); o conteúdo passa a ser o da tela.
    const anterior = antes[z.id] && typeof antes[z.id] === 'object' ? antes[z.id] : {};
    const { items: _i, peca: _pe, pecas: _ps, messages: _m, ...resto } = anterior; // eslint-disable-line no-unused-vars
    if (z.type === 'header') next.zonas[z.id] = { ...resto, header: true, ...(pecas.length ? { pecas, peca: pecas[0] } : {}) };
    else if (z.type === 'ticker') next.zonas[z.id] = { ...resto, ...(pecas.length ? { pecas, peca: pecas[0] } : {}), messages: montada.mensagens.slice() };
    else next.zonas[z.id] = { ...resto, items: pecas };
  }
  return next;
}

/*
 * O tamanho real de cada zona do layout (1080p no lado menor), medido com a
 * mesma grade da TV: é nele que a peça é conferida quando o cliente troca o
 * texto — "cabe na principal", e não nos três formatos soltos.
 */
export function medirZonas(layoutId) {
  const layout = getLayout(layoutId);
  const W = emPe(layoutId) ? 1080 : 1920;
  const H = emPe(layoutId) ? 1920 : 1080;
  const px = (v) => String(v || '').replace(/(-?[\d.]+)v([hw])/g, (_, n, u) => (Number(n) * (u === 'h' ? H : W) / 100) + 'px');
  const tv = document.createElement('div');
  tv.style.cssText = 'position:fixed;left:-30000px;top:0;box-sizing:border-box;display:grid;width:' + W + 'px;height:' + H + 'px;gap:' + (0.011 * H) + 'px;padding:' + (0.011 * H) + 'px';
  tv.style.gridTemplateColumns = px(layout.grid.columns);
  tv.style.gridTemplateRows = px(layout.grid.rows);
  tv.style.gridTemplateAreas = layout.grid.areas.map((a) => '"' + a + '"').join(' ');
  const caixas = layout.zones.map((z) => {
    const c = document.createElement('div');
    c.style.gridArea = z.area;
    tv.appendChild(c);
    return [z, c];
  });
  document.body.appendChild(tv);
  const saida = {};
  for (const [z, c] of caixas) saida[grupoDaZona(z)] = saida[grupoDaZona(z)] || { nome: z.name, tamanho: [c.offsetWidth, c.offsetHeight] };
  tv.remove();
  return saida;
}
