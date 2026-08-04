// Helpers de composição compartilhados entre editor, prévia e export.

// Preenchimento de forma: cor sólida (string) ou gradiente { grad, ang, cores }.
export function fillToCss(fill) {
  if (!fill) return 'rgba(255,255,255,.14)';
  if (typeof fill === 'string') return fill;
  const c = Array.isArray(fill.cores) && fill.cores.length ? fill.cores : ['#888888', '#444444'];
  const c2 = c[1] || c[0];
  if (fill.grad === 'radial') return `radial-gradient(circle at 50% 40%, ${c[0]}, ${c2})`;
  return `linear-gradient(${fill.ang != null ? fill.ang : 150}deg, ${c[0]}, ${c2})`;
}

// Polígonos (pontos em % do box) para formas via clip-path.
export const SHAPE_POLY = {
  triangle: [[50, 0], [100, 100], [0, 100]],
  diamond: [[50, 0], [100, 50], [50, 100], [0, 50]],
  diag: [[0, 0], [100, 0], [70, 100], [0, 100]],
};
export function shapeClip(shape) {
  const p = SHAPE_POLY[shape];
  return p ? 'polygon(' + p.map(([x, y]) => x + '% ' + y + '%').join(', ') + ')' : 'none';
}

// Proporção altura/largura do formato ("16/9" → 0.5625). Converte altura em
// % da zona (eixo Y) para unidades cqw (que medem % da largura, eixo X).
export function formatRatio(formato) {
  const [a, b] = String(formato || '16/9').split('/').map(Number);
  return (a && b) ? b / a : 9 / 16;
}

// Tamanho de fonte em cqw (% da largura da zona). Quando e.auto, cresce
// proporcional à diagonal do bloco; senão usa e.tamanho fixo.
export function textFontCqw(e, formato) {
  if (!e || !e.auto) return (e && e.tamanho != null) ? e.tamanho : 6;
  const R = formatRatio(formato);
  const w = e.w != null ? e.w : 25;
  const h = e.h != null ? e.h : 25;
  const diag = Math.sqrt(w * w + (h * R) * (h * R)); // diagonal do bloco, em cqw
  const k = e.escala != null ? e.escala : 0.16;
  return Math.max(2, diag * k);
}

// Gradiente de fundo pronto (para o seletor de fundo do editor).
export function bgGradient(kind, c1, c2, ang) {
  if (kind === 'radial') return `radial-gradient(circle at 30% 20%, ${c1}, ${c2})`;
  return `linear-gradient(${ang != null ? ang : 150}deg, ${c1}, ${c2})`;
}
