/*
 * adaptive.js
 * Inteligência de cor: analisa a imagem em exibição, extrai a cor
 * predominante e desloca suavemente o destaque do tema para combinar —
 * dando a sensação de que o player "entende" o conteúdo.
 *
 * Amostragem via canvas. Imagens de outros domínios "sujam" o canvas
 * (segurança do navegador) e não podem ser lidas — nesses casos o
 * sistema simplesmente não adapta (sem erro). Fotos enviadas pelo
 * usuário (data URI) funcionam sempre.
 */
(function (global) {
  'use strict';

  let raf = null;
  // Cores base do tema atual (para onde restauramos ao sair da imagem).
  let base = { accent: '#60a5fa', glow: 'rgba(96,165,250,.45)' };

  function setBase(b) {
    if (b && b.accent) base.accent = b.accent;
    if (b && b.glow) base.glow = b.glow;
  }

  /* ---------- Extração de cor predominante ---------- */
  function extract(img) {
    try {
      const w = 48, h = 48;
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      const ctx = c.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(img, 0, 0, w, h);
      const data = ctx.getImageData(0, 0, w, h).data; // lança se "tainted"
      const bins = {};
      for (let i = 0; i < data.length; i += 4) {
        const r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3];
        if (a < 125) continue;
        const key = (r >> 4) + ',' + (g >> 4) + ',' + (b >> 4);
        const bin = bins[key] || (bins[key] = { r: 0, g: 0, b: 0, n: 0, sat: 0 });
        bin.r += r; bin.g += g; bin.b += b; bin.n++;
        bin.sat += Math.max(r, g, b) - Math.min(r, g, b);
      }
      let dom = null, acc = null, domN = 0, accScore = 0;
      for (const k in bins) {
        const b = bins[k];
        const avgSat = b.sat / b.n;
        if (b.n > domN) { domN = b.n; dom = b; }
        // Destaque: prioriza cores vivas com presença relevante.
        const score = b.n * (avgSat + 12);
        if (avgSat > 38 && score > accScore) { accScore = score; acc = b; }
      }
      const toHex = (b) => '#' + [b.r / b.n, b.g / b.n, b.b / b.n]
        .map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
      const dominant = dom ? toHex(dom) : null;
      return dominant ? { dominant, accent: acc ? toHex(acc) : dominant } : null;
    } catch (e) {
      return null; // canvas "tainted" (imagem de outro domínio) — não adapta
    }
  }

  /* ---------- Interpolação suave da cor de destaque ---------- */
  function parseColor(s) {
    s = (s || '').trim();
    let m = /^#?([0-9a-f]{6})$/i.exec(s);
    if (m) { const n = parseInt(m[1], 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; }
    m = /rgba?\(([^)]+)\)/i.exec(s);
    if (m) { const p = m[1].split(',').map(Number); return [p[0], p[1], p[2]]; }
    return [96, 165, 250];
  }
  function toHex(rgb) {
    return '#' + rgb.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
  }
  function ease(t) { return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; }

  function tweenAccent(targetHex, glow, dur) {
    cancelAnimationFrame(raf);
    const root = document.documentElement;
    const from = parseColor(getComputedStyle(root).getPropertyValue('--accent'));
    const to = parseColor(targetHex);
    const t0 = performance.now();
    root.style.setProperty('--glow', glow);
    function step(t) {
      const k = Math.min(1, (t - t0) / dur);
      const e = ease(k);
      const cur = [from[0] + (to[0] - from[0]) * e, from[1] + (to[1] - from[1]) * e, from[2] + (to[2] - from[2]) * e];
      root.style.setProperty('--accent', toHex(cur));
      if (k < 1) raf = requestAnimationFrame(step);
    }
    raf = requestAnimationFrame(step);
  }

  // Adapta o tema para as cores de uma imagem (elemento <img> já carregado).
  function adaptTo(img) {
    const colors = extract(img);
    if (!colors) return false;
    const accent = colors.accent || colors.dominant;
    const rgb = parseColor(accent);
    tweenAccent(accent, 'rgba(' + rgb.join(',') + ',.5)', 900);
    return true;
  }

  // Restaura o destaque original do tema.
  function restore() {
    tweenAccent(base.accent, base.glow, 800);
  }

  global.MTAdaptive = { setBase, extract, adaptTo, restore };
})(window);
