/*
 * Desenho de composição no editor — o MESMO de js/peca.js, não uma cópia.
 *
 * Este arquivo já teve as contas escritas por dentro, e elas também estavam
 * escritas dentro de js/render.js e outra vez em exportPng.js. Agora só
 * reexporta o canônico e acrescenta o que é exclusivo do painel.
 */
import '../../../js/peca.js';

const P = globalThis.MTPeca;

export const SHAPE_POLY = P.SHAPE_POLY;
export const shapeClip = P.shapeClip;
export const recortada = P.recortada;
export const fillToCss = P.fillToCss;
export const formatRatio = P.formatRatio;
export const textFontCqw = P.textFontCqw;
export const sombra = P.sombra;
export const borda = P.borda;
export const sombraCss = P.sombraCss;
export const bordaCss = P.bordaCss;
export const raioCss = P.raioCss;
export const comoAplicarSombra = P.comoAplicarSombra;
export const SOMBRA_PADRAO = P.SOMBRA_PADRAO;
export const SOMBRA_LIMITES = P.SOMBRA_LIMITES;
export const BORDA_MAX = P.BORDA_MAX;

/*
 * O CSS de sombra/borda/canto de um elemento, já na propriedade certa para o
 * tipo dele. Devolve o que o palco do editor, a miniatura e a prévia aplicam —
 * e é a mesma decisão que o player toma em js/render.js.
 *
 * `u` é quantos pixels vale 1 cqw; sem ele, a saída sai em cqw.
 */
export function estiloCaixa(el, u) {
  const onde = P.comoAplicarSombra(el);
  const s = P.sombraCss(el, u);
  const fora = {};
  if (s !== 'none') {
    if (onde === 'texto') fora.textShadow = s;
    else if (onde === 'caixa') fora.boxShadow = s;
    else fora.filter = 'drop-shadow(' + s + ')';
  }
  const b = P.bordaCss(el, u);
  if (b !== 'none') { fora.border = b; fora.boxSizing = 'border-box'; }
  return fora;
}

// Gradiente de fundo pronto (para o seletor de fundo do editor).
export function bgGradient(kind, c1, c2, ang) {
  if (kind === 'radial') return `radial-gradient(circle at 30% 20%, ${c1}, ${c2})`;
  return `linear-gradient(${ang != null ? ang : 150}deg, ${c1}, ${c2})`;
}
