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

  /*
   * Famílias usadas por elemento dentro de uma composição (campo "fonte"). São
   * outra coisa que a fonte do TEMA: aqui é tipografia de PEÇA — condensada
   * gigante, script, serifada. Vêm de js/fontes.js, o catálogo único que o
   * servidor e o editor também usam.
   */
  const FAMILIAS_PECA = (global.MTFontes || {}).FAMILIAS || {};
  // Stack CSS da família da peça, carregando a fonte sob demanda.
  function familiaPeca(id) {
    const f = FAMILIAS_PECA[id];
    if (!f) return null;
    ensureFontUrl('peca-' + id, f.google);
    return f.css;
  }

  const loadedFonts = {};
  function ensureFont(id) {
    const f = FONTS[id];
    if (!f) return;
    ensureFontUrl(id, f.google);
  }
  // Carrega uma família da Google Fonts uma única vez, por chave.
  function ensureFontUrl(chave, google) {
    if (!google || loadedFonts[chave]) return;
    loadedFonts[chave] = true;
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
    link.href = 'https://fonts.googleapis.com/css2?family=' + google + '&display=swap';
    /*
     * `media="print"` é o truque para a folha NÃO segurar a pintura: o
     * navegador baixa, mas não espera. Quando chega, vira "all" e a fonte
     * entra no lugar.
     *
     * Sem isto, uma TV numa rede ruim fica no escuro até a Google responder —
     * e a rede da recepção do cliente é justamente a ruim. Fonte é acabamento;
     * conteúdo é o produto. O conteúdo aparece primeiro.
     */
    link.media = 'print';
    link.onload = function () { link.media = 'all'; };
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

  /* ---------------- Cor: utilidades ----------------
   *
   * A matemática vem de js/cor.js — o MESMO arquivo que o gerador de peças usa
   * no servidor. Antes existiam duas cópias, e elas já tinham divergido: uma
   * aceitava hex de três dígitos, a outra não. Pior, o bug do acento sobre
   * laranja precisou ser corrigido nos dois lugares, com meses de distância.
   */
  // No navegador vem do <script> anterior; em teste, do require.
  const C = global.MTCor || (typeof require === 'function' ? require('./cor.js') : null);
  const { hex2rgb, rgb2hex, okHex, mix, girarMatiz, contraste, rgba } = C;
  const luminance = C.luminancia;
  const rgbTriple = C.rgbTriple;

  /* ---------------- Tema a partir da marca ----------------
   *
   * A queixa que isto resolve: os presets eram bonitos e alheios. A empresa
   * cadastrava laranja na Marca e a TV continuava azul — a identidade parava na
   * peça e não chegava na tela.
   *
   * Dois níveis, de propósito:
   *
   *   tingir(t, cores)  — mantém o CLIMA do preset (claro/escuro, vidro, raio,
   *                       sombra) e troca só as cores de marca. É o caminho
   *                       "preferencialmente a marca" sem perder a escolha
   *                       estética que o usuário fez.
   *
   *   derivar(cores)    — constrói o tema inteiro a partir da marca: fundo,
   *                       superfície e texto saem da cor principal. Para quem
   *                       quer a tela inteira com a cara da empresa.
   *
   * Nos dois casos o texto é escolhido por CONTRASTE medido, não por gosto —
   * uma marca amarela não pode gerar texto branco sobre fundo claro.
   */
  const MIN_CONTRASTE = 4.5;

  // Ambas moram em js/cor.js: são as regras que o gerador de peças também usa.
  const textoSobre = (fundo, marca) => C.textoSobre(fundo, marca, MIN_CONTRASTE);
  const acentoSobre = (fundo, marca) => C.acentoSobre(fundo, marca, 3.5);

  function cores1e2(cores) {
    const lista = (Array.isArray(cores) ? cores : []).map(okHex).filter(Boolean);
    if (!lista.length) return null;
    return { marca: lista[0], marca2: lista[1] || girarMatiz(lista[0], 28) };
  }

  // Tinge um tema já resolvido com as cores da marca, sem mexer no clima.
  function tingir(t, cores) {
    const c = cores1e2(cores);
    if (!c) return t;
    const out = Object.assign({}, t);
    out.brand = c.marca;
    out.brand2 = c.marca2;
    out.accent = acentoSobre(t.bg, c.marca);
    out.glow = rgba(c.marca, 0.45);
    // Borda e brilho seguem a marca só quando o preset já usava cor na borda.
    if (/^rgba\(\d+,\s*\d+,\s*\d+/.test(String(t.border)) && !/255,\s*255,\s*255/.test(String(t.border))) {
      out.border = rgba(c.marca, 0.3);
    }
    return out;
  }

  // Constrói um tema completo a partir da marca.
  function derivar(cores, opts) {
    const c = cores1e2(cores);
    if (!c) return null;
    const claro = (opts && opts.claro) === true;
    const bg = claro ? mix('#ffffff', c.marca, 0.06) : mix('#070a12', c.marca, 0.16);
    const bg2 = claro ? mix('#ffffff', c.marca, 0.14) : mix('#070a12', c.marca, 0.32);
    const surface = claro ? mix('#ffffff', c.marca, 0.03) : mix('#0d1220', c.marca, 0.22);
    const texto = textoSobre(bg, c.marca);
    return {
      label: 'Minha marca', dark: !claro,
      bg, bg2, brand: c.marca, brand2: c.marca2,
      accent: acentoSobre(bg, c.marca),
      surface: rgbTriple(surface), glass: claro ? 0.72 : 0.55,
      border: rgba(c.marca, claro ? 0.22 : 0.3),
      text: texto,
      textDim: mix(texto, bg, 0.38),
      radius: 20, blur: 22,
      shadow: claro ? '0 14px 40px rgba(20,25,40,.14)' : '0 18px 50px rgba(0,0,0,.45)',
      fx: 0.9, glow: rgba(c.marca, 0.45),
    };
  }

  /* ---------------- Composição do tema ---------------- */
  // Um "tema" = preset base + ajustes manuais (overrides). Só as chaves
  // presentes em overrides sobrescrevem o preset.
  function resolve(theme) {
    theme = theme || {};
    /*
     * A marca entra ANTES dos overrides: o ajuste manual continua sendo a
     * palavra final. Quem mexeu numa cor à mão não quer que a marca desfaça.
     */
    let base = PRESETS[theme.preset] || PRESETS[DEFAULT_PRESET];
    if (theme.preset === 'marca') {
      base = derivar(theme.marca, { claro: theme.marcaClara === true }) || PRESETS[DEFAULT_PRESET];
    } else if (theme.aplicarMarca) {
      base = tingir(base, theme.marca);
    }
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
  // Prévia de um tema sem aplicá-lo: o painel desenha a amostra com isto.
  function preview(theme) { return resolve(theme); }
  function listFonts() {
    return Object.keys(FONTS).map((id) => ({ id, label: FONTS[id].label }));
  }

  global.MTTheme = {
    PRESETS, FONTS, DEFAULT_PRESET, FAMILIAS_PECA, familiaPeca,
    resolve, apply, preview, listPresets, listFonts, ensureFont,
    // Expostos para o painel prever a cor sem duplicar a matemática.
    derivar, tingir, textoSobre, acentoSobre, contraste, mix, girarMatiz, rgba,
  };
})(window);
