/*
 * exportPng.js — exporta uma "composicao" como PNG (para postar em feed/story).
 * Desenha no canvas o mesmo modelo do player (fundo cor/gradiente/imagem +
 * elementos de texto/imagem em % com rotação). Sem dependências externas.
 */
import { estiloTexto, prontasParaCanvas } from './fontes.js';
import { sombra as sombraDe, borda as bordaDe, SHAPE_POLY } from './composition.js';

// Espelho de web/src/lib/icons.js — mantido aqui para desenhar no canvas.
const ICONS = {
  star: '<path d="M12 3l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9 6.8 19.1l1-5.8L3.5 9.2l5.9-.9z"/>',
  heart: '<path d="M12 20s-7-4.35-9-8a4.5 4.5 0 0 1 8-3 4.5 4.5 0 0 1 8 3c-2 3.65-9 8-9 8z"/>',
  bell: '<path d="M6 9a6 6 0 0 1 12 0c0 5 2 6 2 6H4s2-1 2-6z"/><path d="M10 20a2 2 0 0 0 4 0"/>',
  gift: '<rect x="3" y="8" width="18" height="4"/><path d="M4 12v9h16v-9M12 8v13"/><path d="M12 8S9 3 6.5 5 8 8 12 8zM12 8s3-5 5.5-3S16 8 12 8z"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  pin: '<path d="M12 21s7-6 7-11a7 7 0 0 0-14 0c0 5 7 11 7 11z"/><circle cx="12" cy="10" r="2.5"/>',
  tag: '<path d="M20.6 13.4L11 3.8H4v7l9.6 9.6a2 2 0 0 0 2.8 0l4.2-4.2a2 2 0 0 0 0-2.8z"/><circle cx="7.5" cy="7.5" r="1.2"/>',
  cart: '<circle cx="9" cy="20" r="1.4"/><circle cx="18" cy="20" r="1.4"/><path d="M3 4h2l2.5 12h11l2-8H6"/>',
  leaf: '<path d="M4 20c0-8 6-14 16-14 0 10-6 16-16 14z"/><path d="M9 15c2-3 5-5 8-6"/>',
  shield: '<path d="M12 3l8 3v6c0 5-4 8-8 9-4-1-8-4-8-9V6z"/>',
  like: '<path d="M7 22V11l4-8a2 2 0 0 1 2 2v5h6a2 2 0 0 1 2 2l-2 8H7z"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 9h18M8 3v4M16 3v4"/>',
  coffee: '<path d="M4 8h13v5a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4z"/><path d="M17 9h2a2 2 0 0 1 0 4h-2"/><path d="M6 3v2M10 3v2M14 3v2"/>',
  bolt: '<path d="M13 2L4 14h6l-1 8 9-12h-6z"/>',
  megaphone: '<path d="M3 11v2l12 5V6L3 11z"/><path d="M15 8a4 4 0 0 1 0 8"/>',
  wifi: '<path d="M2 9a15 15 0 0 1 20 0M5 12.5a10 10 0 0 1 14 0M8.5 16a5 5 0 0 1 7 0"/><circle cx="12" cy="19" r="1"/>',
  check: '<circle cx="12" cy="12" r="9"/><path d="M8 12l3 3 5-6"/>',
  sparkle: '<path d="M12 3v6M12 15v6M3 12h6M15 12h6M6 6l3 3M15 15l3 3M18 6l-3 3M9 15l-3 3"/>',
};

// Desenha um ícone de linha via SVG → data URI → imagem no canvas.
async function drawIcon(ctx, e, w, h, W) {
  const inner = ICONS[e.name] || ICONS.star;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="${e.cor || '#ffffff'}" stroke-width="${e.peso || 1.6}" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`;
  const src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  try {
    const img = await loadImage(src);
    ligarSombra(ctx, e, W);
    ctx.drawImage(img, 0, 0, w, h);
    desligarSombra(ctx);
  } catch (err) {}
}

/*
 * Imagem com canto arredondado, sombra e borda.
 *
 * A sombra é desenhada num retângulo por trás, e não com `drawImage` ligado à
 * sombra: uma foto opaca com sombra ligada faz o canvas borrar a foto INTEIRA
 * em volta dela, e o resultado é uma auréola, não uma sombra.
 */
async function drawImagem(ctx, e, w, h, W) {
  let img;
  try { img = await loadImage(e.src); } catch (err) { return; }
  // O canto da IMAGEM é medido em cqw (% da largura da peça), como no player;
  // o da FORMA é % do próprio bloco. São duas convenções antigas, e mudar
  // qualquer uma delas mexeria na cara de peças já publicadas.
  const r = Math.min(Number(e.radius) || 0, 50) / 100 * W;
  const caminho = () => roundRectPath(ctx, 0, 0, w, h, r);

  if (ligarSombra(ctx, e, W)) {
    ctx.save();
    ctx.fillStyle = '#000';
    caminho(); ctx.fill();
    ctx.restore();
    desligarSombra(ctx);
  }
  ctx.save();
  caminho(); ctx.clip();
  drawImageFit(ctx, img, 0, 0, w, h, e.fit || 'contain');
  ctx.restore();
  tracarBorda(ctx, e, W, caminho);
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

// Dimensões a partir da proporção ("16/9" → 1920x1080). Lado maior = 1920.
export function dimsFor(formato) {
  const [a, b] = String(formato || '16/9').split('/').map(Number);
  const r = (a && b) ? a / b : 16 / 9;
  const LONG = 1920;
  return r >= 1 ? { W: LONG, H: Math.round(LONG / r) } : { W: Math.round(LONG * r), H: LONG };
}

// Preenche o fundo: cor sólida, gradiente linear (o que geramos) ou fallback.
function fillBackground(ctx, cor, W, H) {
  const s = String(cor || '#0a1020');
  const g = s.match(/linear-gradient\(\s*(\d+)deg\s*,\s*(.+)\)\s*$/i);
  if (g) {
    const ang = (parseFloat(g[1]) - 90) * Math.PI / 180; // CSS 0deg = para cima
    const cx = W / 2, cy = H / 2, len = Math.max(W, H);
    const x0 = cx - Math.cos(ang) * len / 2, y0 = cy - Math.sin(ang) * len / 2;
    const x1 = cx + Math.cos(ang) * len / 2, y1 = cy + Math.sin(ang) * len / 2;
    const stops = splitTop(g[2]);
    const grad = ctx.createLinearGradient(x0, y0, x1, y1);
    stops.forEach((c, i) => { try { grad.addColorStop(stops.length > 1 ? i / (stops.length - 1) : 0, c.trim()); } catch (e) {} });
    ctx.fillStyle = grad;
  } else {
    ctx.fillStyle = s;
  }
  ctx.fillRect(0, 0, W, H);
}
// Divide "a, b, c" no nível de topo (ignora vírgulas dentro de rgba()).
function splitTop(str) {
  const out = []; let depth = 0, cur = '';
  for (const ch of str) {
    if (ch === '(') depth++; if (ch === ')') depth--;
    if (ch === ',' && depth === 0) { out.push(cur); cur = ''; } else cur += ch;
  }
  if (cur.trim()) out.push(cur);
  return out;
}

function drawImageFit(ctx, img, x, y, w, h, fit) {
  const ir = img.width / img.height, br = w / h;
  let dw = w, dh = h, dx = x, dy = y;
  const cover = fit === 'cover';
  if ((ir > br) === cover) { dh = h; dw = h * ir; } else { dw = w; dh = w / ir; }
  dx = x + (w - dw) / 2; dy = y + (h - dh) / 2;
  if (cover) { ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip(); ctx.drawImage(img, dx, dy, dw, dh); ctx.restore(); }
  else ctx.drawImage(img, dx, dy, dw, dh);
}

function shapeFill(ctx, fill, w, h) {
  if (!fill) return 'rgba(255,255,255,0.14)';
  if (typeof fill === 'string') return fill;
  const c = (fill.cores && fill.cores.length) ? fill.cores : ['#888888', '#444444'];
  const c2 = c[1] || c[0];
  if (fill.grad === 'radial') {
    const g = ctx.createRadialGradient(w / 2, h * 0.4, 1, w / 2, h * 0.4, Math.max(w, h) / 1.3);
    g.addColorStop(0, c[0]); g.addColorStop(1, c2); return g;
  }
  const ang = ((fill.ang != null ? fill.ang : 150) - 90) * Math.PI / 180;
  const cx = w / 2, cy = h / 2, len = Math.max(w, h);
  const g = ctx.createLinearGradient(cx - Math.cos(ang) * len / 2, cy - Math.sin(ang) * len / 2, cx + Math.cos(ang) * len / 2, cy + Math.sin(ang) * len / 2);
  g.addColorStop(0, c[0]); g.addColorStop(1, c2); return g;
}
function roundRectPath(ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}
/*
 * Sombra e borda no canvas.
 *
 * As medidas vêm em cqw — % da largura da PEÇA — e aqui viram pixels do PNG.
 * É o mesmo número que o editor converte para pixels do palco e que o player
 * entrega ao CSS: uma sombra só, três tamanhos de tela.
 *
 * O canvas não empilha sombra e traço como o CSS: ligar a sombra antes de
 * preencher pinta a sombra do preenchimento, e é preciso DESLIGAR antes de
 * traçar a borda, senão a borda ganha uma segunda sombra por cima da primeira.
 */
function ligarSombra(ctx, e, W) {
  const s = sombraDe(e);
  if (!s) return false;
  const k = W / 100;
  ctx.shadowColor = s.cor;
  ctx.shadowBlur = s.desfoque * k;
  ctx.shadowOffsetX = s.x * k;
  ctx.shadowOffsetY = s.y * k;
  return true;
}
function desligarSombra(ctx) {
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0; ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0;
}
function tracarBorda(ctx, e, W, caminho) {
  const b = bordaDe(e);
  if (!b) return;
  desligarSombra(ctx);
  const px = b.largura * (W / 100);
  ctx.strokeStyle = b.cor;
  // O tracejado do CSS é proporcional à espessura; aqui vale o mesmo ritmo.
  if (b.estilo === 'dashed') ctx.setLineDash([px * 3, px * 2]);
  else if (b.estilo === 'dotted') ctx.setLineDash([px, px * 1.6]);
  else ctx.setLineDash([]);
  /*
   * O canvas centra o traço na linha: metade dele ficaria PARA FORA, e a peça
   * sairia maior no PNG do que no editor, onde o CSS usa border-box e a borda
   * cresce para dentro. Recortando na própria forma e traçando com o dobro da
   * espessura, sobra exatamente a metade de dentro — que é a do CSS.
   *
   * Isto apareceu ao abrir o PNG e comparar com a tela; nenhum teste de
   * unidade pegaria, porque os dois lados estavam "certos" cada um no seu.
   */
  ctx.save();
  caminho();
  ctx.clip();
  ctx.lineWidth = px * 2;
  caminho();
  ctx.stroke();
  ctx.restore();
  ctx.setLineDash([]);
}

function drawShape(ctx, e, w, h, W) {
  ctx.fillStyle = shapeFill(ctx, e.fill, w, h);
  const elipse = () => { ctx.beginPath(); ctx.ellipse(w / 2, h / 2, w / 2, h / 2, 0, 0, Math.PI * 2); };
  const poligono = () => {
    const p = SHAPE_POLY[e.shape];
    ctx.beginPath();
    p.forEach((pt, i) => { const x = pt[0] / 100 * w, y = pt[1] / 100 * h; if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); });
    ctx.closePath();
  };
  const retangulo = () => roundRectPath(ctx, 0, 0, w, h, Math.min(w, h) * ((e.radius || 0) / 100));
  const caminho = e.shape === 'ellipse' ? elipse : SHAPE_POLY[e.shape] ? poligono : retangulo;

  ligarSombra(ctx, e, W);
  caminho(); ctx.fill();
  desligarSombra(ctx);
  // Forma recortada não recebe borda — é a mesma regra do editor e do player.
  if (!SHAPE_POLY[e.shape]) tracarBorda(ctx, e, W, caminho);
}

// Tamanho de fonte em cqw. Se e.auto, proporcional à diagonal do bloco.
function textFontCqw(e, formato) {
  if (!e || !e.auto) return (e && e.tamanho != null) ? e.tamanho : 6;
  const p = String(formato || '16/9').split('/').map(Number);
  const R = (p[0] && p[1]) ? p[1] / p[0] : 9 / 16;
  const w = e.w != null ? e.w : 25, h = e.h != null ? e.h : 25;
  const diag = Math.sqrt(w * w + (h * R) * (h * R));
  const k = e.escala != null ? e.escala : 0.16;
  return Math.max(2, diag * k);
}

function drawText(ctx, e, w, h, W, formato) {
  const fontPx = Math.max(8, textFontCqw(e, formato) / 100 * W);
  /*
   * O estilo vem da MESMA função do palco e do player. Antes daqui a
   * exportação desenhava tudo na fonte do sistema: a peça saía numa fonte no
   * editor, noutra na TV e numa terceira no PNG que a pessoa mandava no
   * WhatsApp para aprovar. Aprovava-se uma coisa e ia ao ar outra.
   */
  const s = estiloTexto(e);
  ctx.fillStyle = s.color;
  ctx.font = `${s.fontStyle} ${s.fontWeight} ${fontPx}px ${s.fontFamily}`;
  // letterSpacing no canvas é recente; onde não existe, o texto sai sem o
  // ajuste fino em vez de não sair.
  if ('letterSpacing' in ctx) ctx.letterSpacing = (parseFloat(s.letterSpacing) * fontPx).toFixed(2) + 'px';
  ctx.textBaseline = 'top';
  const align = s.textAlign;
  ctx.textAlign = align;

  const bruto = String(e.text || '');
  const texto = s.textTransform === 'uppercase' ? bruto.toUpperCase() : bruto;
  // Quebra por palavra dentro da largura da caixa, respeitando as quebras que
  // a pessoa digitou.
  const lines = [];
  for (const paragrafo of texto.split('\n')) {
    let line = '';
    for (const word of paragrafo.split(/\s+/)) {
      const test = line ? line + ' ' + word : word;
      if (ctx.measureText(test).width > w && line) { lines.push(line); line = word; } else line = test;
    }
    lines.push(line);
  }
  const lh = fontPx * Number(s.lineHeight);
  let ty = (h - lines.length * lh) / 2; // centraliza verticalmente na caixa
  const tx = align === 'center' ? w / 2 : align === 'right' ? w : 0;
  ligarSombra(ctx, e, W);
  for (const l of lines) { ctx.fillText(l, tx, ty); ty += lh; }
  if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
  desligarSombra(ctx);
}

export async function compositionToCanvas(item, W, H) {
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');
  const b = item.bg || {};
  if (b.kind === 'imagem' && b.src) {
    try { drawImageFit(ctx, await loadImage(b.src), 0, 0, W, H, 'cover'); } catch (e) { fillBackground(ctx, '#0a1020', W, H); }
  } else {
    fillBackground(ctx, b.cor, W, H);
  }
  const els = (item.elementos || []).slice().sort((a, c) => (a.z || 0) - (c.z || 0));
  // Sem isto o PNG sai na fonte do sistema: o canvas desenha uma vez só.
  await prontasParaCanvas(els);
  for (const e of els) {
    const x = (e.x || 0) / 100 * W, y = (e.y || 0) / 100 * H, w = (e.w || 20) / 100 * W, h = (e.h || 20) / 100 * H;
    ctx.save();
    ctx.globalAlpha = e.opacidade != null ? e.opacidade : 1;
    ctx.translate(x + w / 2, y + h / 2);
    if (e.rot) ctx.rotate((e.rot) * Math.PI / 180);
    ctx.translate(-w / 2, -h / 2);
    if (e.tipo === 'texto') drawText(ctx, e, w, h, W, item.formato);
    else if (e.tipo === 'forma') drawShape(ctx, e, w, h, W);
    else if (e.tipo === 'icone') await drawIcon(ctx, e, w, h, W);
    else if (e.src) await drawImagem(ctx, e, w, h, W);
    ctx.restore();
  }
  return canvas;
}

// Gera e baixa o PNG da peça.
export async function downloadComposition(item, formato, filename) {
  const { W, H } = dimsFor(formato || item.formato);
  const canvas = await compositionToCanvas(item, W, H);
  await new Promise((resolve) => canvas.toBlob((blob) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = (filename || 'peca') + '.png';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    resolve();
  }, 'image/png'));
}
