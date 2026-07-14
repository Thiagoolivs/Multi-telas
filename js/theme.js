/*
 * theme.js
 * Motor de temas premium. Transforma um "tema" (preset + ajustes manuais)
 * num conjunto de design tokens aplicados como variáveis CSS no :root.
 * Tudo o que o player e o admin desenham lê desses tokens — trocar de
 * tema reestiliza a interface inteira sem tocar em nenhum componente.
 */
(function (global) {
  'use strict';

  /* ---------------- Fontes ---------------- */
  // Stack de sistema premium como padrão (não depende de internet).
  const SYSTEM_STACK =
    "'Segoe UI Variable Display','Segoe UI',system-ui,-apple-system,'Inter',Roboto,'Helvetica Neue',Arial,sans-serif";

  const FONTS = {
    system: { label: 'Sistema (recomendado)', stack: SYSTEM_STACK, google: null },
    inter: { label: 'Inter', stack: "'Inter'," + SYSTEM_STACK, google: 'Inter:wght@400;500;600;700;800;900' },
    poppins: { label: 'Poppins', stack: "'Poppins'," + SYSTEM_STACK, google: 'Poppins:wght@400;500;600;700;800' },
    montserrat: { label: 'Montserrat', stack: "'Montserrat'," + SYSTEM_STACK, google: 'Montserrat:wght@400;500;600;700;800' },
    roboto: { label: 'Roboto', stack: "'Roboto'," + SYSTEM_STACK, google: 'Roboto:wght@400;500;700;900' },
    'space-grotesk': { label: 'Space Grotesk', stack: "'Space Grotesk'," + SYSTEM_STACK, google: 'Space+Grotesk:wght@400;500;600;700' },
  };

  const loadedFonts = {};
  function ensureFont(id) {
    const f = FONTS[id];
    if (!f || !f.google || loadedFonts[id]) return;
    loadedFonts[id] = true;
    // Preconnect (uma vez) + folha de estilo da Google Fonts.
    if (!document.getElementById('mt-gfonts-pre')) {
      const p1 = document.createElement('link');
      p1.id = 'mt-gfonts-pre'; p1.rel = 'preconnect';
      p1.href = 'https://fonts.googleapis.com';
      document.head.appendChild(p1);
      const p2 = document.createElement('link');
      p2.rel = 'preconnect'; p2.href = 'https://fonts.gstatic.com';
      p2.crossOrigin = 'anonymous';
      document.head.appendChild(p2);
    }
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://fonts.googleapis.com/css2?family=' + f.google + '&display=swap';
    document.head.appendChild(link);
  }

  /* ---------------- Presets ----------------
   * Cada token:
   *   bg / bg2      → gradiente do palco (fundo)
   *   brand/brand2  → cor primária e secundária
   *   accent        → destaque
   *   surface       → "r,g,b" da superfície das zonas (composta com glass)
   *   glass         → opacidade da superfície (0–1) → efeito vidro
   *   border        → cor da borda das zonas (rgba)
   *   text/textDim  → textos
   *   radius        → raio dos cantos (px)
   *   blur          → desfoque do glassmorphism (px)
   *   shadow        → profundidade (box-shadow)
   *   fx            → intensidade de efeitos ambientes (0–1)
   *   glow          → cor do brilho de destaque (rgba) — usado em neon/gold
   */
  const PRESETS = {
    'dark-premium': {
      label: 'Dark Premium', dark: true,
      bg: '#0a1020', bg2: '#131f3e', brand: '#3b82f6', brand2: '#2563eb', accent: '#60a5fa',
      surface: '22,32,60', glass: 0.55, border: 'rgba(255,255,255,.09)',
      text: '#f2f6ff', textDim: 'rgba(226,235,255,.62)',
      radius: 20, blur: 22, shadow: '0 18px 50px rgba(0,0,0,.45)', fx: 0.9,
      glow: 'rgba(59,130,246,.45)',
    },
    'corporate-blue': {
      label: 'Corporate Blue', dark: true,
      bg: '#071a33', bg2: '#0e3a66', brand: '#2f80ed', brand2: '#1c63d5', accent: '#56ccf2',
      surface: '18,44,78', glass: 0.5, border: 'rgba(255,255,255,.1)',
      text: '#eef6ff', textDim: 'rgba(210,230,255,.65)',
      radius: 16, blur: 18, shadow: '0 16px 40px rgba(3,20,45,.5)', fx: 0.75,
      glow: 'rgba(86,204,242,.4)',
    },
    'luxury-gold': {
      label: 'Luxury Gold', dark: true,
      bg: '#0c0a07', bg2: '#241d10', brand: '#d4af37', brand2: '#b8912a', accent: '#f5d67b',
      surface: '32,27,17', glass: 0.55, border: 'rgba(212,175,55,.28)',
      text: '#faf3e0', textDim: 'rgba(240,225,190,.6)',
      radius: 14, blur: 20, shadow: '0 20px 55px rgba(0,0,0,.6)', fx: 0.85,
      glow: 'rgba(212,175,55,.5)',
    },
    'neon-cyber': {
      label: 'Neon Cyber', dark: true,
      bg: '#05060f', bg2: '#0d1233', brand: '#22d3ee', brand2: '#a855f7', accent: '#f0abfc',
      surface: '14,18,44', glass: 0.5, border: 'rgba(34,211,238,.35)',
      text: '#eaf6ff', textDim: 'rgba(190,220,255,.62)',
      radius: 16, blur: 22, shadow: '0 0 40px rgba(34,211,238,.25), 0 18px 50px rgba(0,0,0,.55)', fx: 1,
      glow: 'rgba(34,211,238,.6)',
    },
    glassmorphism: {
      label: 'Glassmorphism', dark: true,
      bg: '#3a2f6b', bg2: '#1f6f8b', brand: '#ffffff', brand2: '#e0d7ff', accent: '#ffd6f5',
      surface: '255,255,255', glass: 0.14, border: 'rgba(255,255,255,.35)',
      text: '#ffffff', textDim: 'rgba(255,255,255,.78)',
      radius: 24, blur: 30, shadow: '0 20px 60px rgba(0,0,0,.35)', fx: 1,
      glow: 'rgba(255,255,255,.5)',
    },
    'minimal-white': {
      label: 'Minimal White', dark: false,
      bg: '#eef1f6', bg2: '#dfe5ee', brand: '#2f6feb', brand2: '#1e56c9', accent: '#00a3a3',
      surface: '255,255,255', glass: 0.85, border: 'rgba(20,30,55,.08)',
      text: '#141c2e', textDim: 'rgba(30,40,60,.55)',
      radius: 18, blur: 14, shadow: '0 12px 34px rgba(20,30,55,.12)', fx: 0.5,
      glow: 'rgba(47,111,235,.25)',
    },
    'elegant-black': {
      label: 'Elegant Black', dark: true,
      bg: '#000000', bg2: '#0c0c0c', brand: '#ffffff', brand2: '#d4d4d4', accent: '#c9a227',
      surface: '255,255,255', glass: 0.05, border: 'rgba(255,255,255,.16)',
      text: '#ffffff', textDim: 'rgba(255,255,255,.6)',
      radius: 10, blur: 16, shadow: '0 16px 44px rgba(0,0,0,.7)', fx: 0.55,
      glow: 'rgba(201,162,39,.4)',
    },
    'energy-green': {
      label: 'Energy Green', dark: true,
      bg: '#04140d', bg2: '#0a3524', brand: '#22c55e', brand2: '#16a34a', accent: '#a3e635',
      surface: '12,38,26', glass: 0.5, border: 'rgba(163,230,53,.24)',
      text: '#effff5', textDim: 'rgba(200,255,220,.6)',
      radius: 16, blur: 18, shadow: '0 16px 46px rgba(0,0,0,.5)', fx: 0.85,
      glow: 'rgba(34,197,94,.45)',
    },
    'modern-purple': {
      label: 'Modern Purple', dark: true,
      bg: '#120a2e', bg2: '#3b1d73', brand: '#8b5cf6', brand2: '#7c3aed', accent: '#e879f9',
      surface: '30,20,66', glass: 0.52, border: 'rgba(232,121,249,.24)',
      text: '#f5efff', textDim: 'rgba(224,210,255,.62)',
      radius: 20, blur: 24, shadow: '0 18px 52px rgba(20,6,50,.55)', fx: 0.95,
      glow: 'rgba(168,85,247,.5)',
    },
  };

  const DEFAULT_PRESET = 'dark-premium';

  /* ---------------- Composição do tema ---------------- */
  // Um "tema" = preset base + ajustes manuais (overrides). Só as chaves
  // presentes em overrides sobrescrevem o preset.
  function resolve(theme) {
    theme = theme || {};
    const base = PRESETS[theme.preset] || PRESETS[DEFAULT_PRESET];
    const t = Object.assign({}, base);
    // Ajustes manuais possíveis do editor.
    const ov = theme.overrides || {};
    ['bg', 'bg2', 'brand', 'brand2', 'accent', 'text', 'textDim', 'surface',
     'border', 'glow'].forEach((k) => { if (ov[k]) t[k] = ov[k]; });
    ['glass', 'radius', 'blur', 'fx'].forEach((k) => {
      if (ov[k] !== undefined && ov[k] !== null && ov[k] !== '') t[k] = Number(ov[k]);
    });
    if (ov.shadow) t.shadow = ov.shadow;
    t.font = theme.font || 'system';
    return t;
  }

  // Luminância relativa (0–1) de uma cor hex, para escolher texto legível.
  function luminance(hex) {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
    if (!m) return 0.5;
    const n = parseInt(m[1], 16);
    const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
      v /= 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
  }
  // Cor de texto que contrasta com um fundo sólido (para chips/badges).
  function onColor(hex) {
    return luminance(hex) > 0.55 ? '#0b1020' : '#ffffff';
  }

  // Aplica os tokens no elemento raiz informado (document.documentElement
  // no player; um container isolado poderia ser usado em previews).
  function apply(theme, root) {
    root = root || document.documentElement;
    const t = resolve(theme);
    const s = root.style;
    s.setProperty('--on-brand', onColor(t.brand));
    s.setProperty('--on-accent', onColor(t.accent));
    s.setProperty('--bg', t.bg);
    s.setProperty('--bg-2', t.bg2);
    s.setProperty('--brand', t.brand);
    s.setProperty('--brand-2', t.brand2);
    s.setProperty('--accent', t.accent);
    s.setProperty('--surface-rgb', t.surface);
    s.setProperty('--glass', String(t.glass));
    s.setProperty('--surface', 'rgba(' + t.surface + ',' + t.glass + ')');
    s.setProperty('--surface-solid', 'rgb(' + t.surface + ')');
    s.setProperty('--border', t.border);
    s.setProperty('--text', t.text);
    s.setProperty('--text-dim', t.textDim);
    s.setProperty('--radius', t.radius + 'px');
    s.setProperty('--blur', t.blur + 'px');
    s.setProperty('--shadow', t.shadow);
    s.setProperty('--fx', String(t.fx));
    s.setProperty('--glow', t.glow || 'rgba(255,255,255,.3)');

    const font = FONTS[t.font] || FONTS.system;
    ensureFont(t.font);
    s.setProperty('--font', font.stack);
    root.classList.toggle('theme-light', !t.dark && !isDarkOverride(theme));
    return t;
  }

  // Se o usuário escureceu manualmente o fundo de um preset claro, mantém texto claro.
  function isDarkOverride() { return false; }

  function listPresets() {
    return Object.keys(PRESETS).map((id) => ({ id, label: PRESETS[id].label, preset: PRESETS[id] }));
  }
  function listFonts() {
    return Object.keys(FONTS).map((id) => ({ id, label: FONTS[id].label }));
  }

  global.MTTheme = {
    PRESETS, FONTS, DEFAULT_PRESET,
    resolve, apply, listPresets, listFonts, ensureFont,
  };
})(window);
