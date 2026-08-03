/*
 * exportPng.js — exporta uma "composicao" como PNG (para postar em feed/story).
 * Desenha no canvas o mesmo modelo do player (fundo cor/gradiente/imagem +
 * elementos de texto/imagem em % com rotação). Sem dependências externas.
 */

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

function drawText(ctx, e, w, h, W) {
  const fontPx = Math.max(8, (Number(e.tamanho) || 6) / 100 * W);
  ctx.fillStyle = e.cor || '#ffffff';
  ctx.font = `${e.peso || 700} ${fontPx}px system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif`;
  ctx.textBaseline = 'top';
  const align = e.align || 'left';
  ctx.textAlign = align;
  // Quebra por palavra dentro da largura da caixa.
  const words = String(e.text || '').split(/\s+/);
  const lines = []; let line = '';
  for (const word of words) {
    const test = line ? line + ' ' + word : word;
    if (ctx.measureText(test).width > w && line) { lines.push(line); line = word; } else line = test;
  }
  if (line) lines.push(line);
  const lh = fontPx * 1.1;
  let ty = (h - lines.length * lh) / 2; // centraliza verticalmente na caixa
  const tx = align === 'center' ? w / 2 : align === 'right' ? w : 0;
  for (const l of lines) { ctx.fillText(l, tx, ty); ty += lh; }
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
  for (const e of els) {
    const x = (e.x || 0) / 100 * W, y = (e.y || 0) / 100 * H, w = (e.w || 20) / 100 * W, h = (e.h || 20) / 100 * H;
    ctx.save();
    ctx.translate(x + w / 2, y + h / 2);
    if (e.rot) ctx.rotate((e.rot) * Math.PI / 180);
    ctx.translate(-w / 2, -h / 2);
    if (e.tipo === 'texto') drawText(ctx, e, w, h, W);
    else if (e.src) { try { drawImageFit(ctx, await loadImage(e.src), 0, 0, w, h, e.fit || 'contain'); } catch (err) {} }
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
