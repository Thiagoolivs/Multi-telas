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

// Gradiente de fundo pronto (para o seletor de fundo do editor).
export function bgGradient(kind, c1, c2, ang) {
  if (kind === 'radial') return `radial-gradient(circle at 30% 20%, ${c1}, ${c2})`;
  return `linear-gradient(${ang != null ? ang : 150}deg, ${c1}, ${c2})`;
}
