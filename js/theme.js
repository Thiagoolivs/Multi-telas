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

  /*
   * As fontes moram no nosso domínio (fonts/fontes.css, gerado por
   * tools/baixar-fontes.mjs). Antes vinham da Google, uma folha por família.
   *
   * A troca não foi por velocidade: foi porque o compositor MEDE o texto com a
   * largura média de caractere de cada família para decidir se ele cabe na
   * peça. Quando a rede da TV bloqueava fonts.googleapis.com — Wi-Fi ruim,
   * rede corporativa fechada, portal cativo — o navegador caía na fonte de
   * sistema, mais larga, e o título que cabia na conta estourava na parede.
   * Sem erro, sem aviso. Agora a fonte chega junto com o app, ou nenhum dos
   * dois chega.
   *
   * Uma folha só com todas as famílias não pesa: @font-face é promessa, e o
   * navegador só busca o arquivo da família que algum texto usa de fato.
   */
  let folhaPedida = false;
  function ensureFolhaFontes() {
    if (folhaPedida || typeof document === 'undefined') return;
    folhaPedida = true;
    const link = document.createElement('link');
    link.id = 'mt-fontes';
    link.rel = 'stylesheet';
    link.href = '/fonts/fontes.css';
    /*
     * `media="print"` é o truque para a folha NÃO segurar a pintura: o
     * navegador baixa, mas não espera. Quando chega, vira "all".
     *
     * Continua valendo mesmo servindo do próprio domínio: numa TV lenta,
     * conteúdo é o produto e fonte é acabamento. O conteúdo aparece primeiro.
     */
    link.media = 'print';
    link.onload = function () { link.media = 'all'; };
    document.head.appendChild(link);
  }

  function ensureFont(id) {
    if (FONTS[id] && FONTS[id].google) ensureFolhaFontes();
  }
  // Mantida para quem já chamava por família; hoje todas vêm da mesma folha.
  function ensureFontUrl(_chave, google) {
    if (google) ensureFolhaFontes();
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
    /*
     * O tema padrão é a cor da marca (docs/MARCA.md): tinta no fundo, violeta
     * na marca e lima no destaque. Era um azul-marinho de template — a TV
     * nova parecia outro produto (QA de 26/10). O id fica: é o que as telas
     * salvas guardam.
     */
    'dark-premium': {
      label: 'MultiTelas (padrão)', dark: true,
      bg: '#0E0B1F', bg2: '#1E1748', brand: '#7B5CFF', brand2: '#5B2EFF', accent: '#C6F432',
      surface: '30,24,64', glass: 0.55, border: 'rgba(255,255,255,.09)',
      text: '#F6F4FF', textDim: 'rgba(234,230,255,.64)',
      radius: 20, blur: 22, shadow: '0 18px 50px rgba(0,0,0,.45)', fx: 0.9,
      glow: 'rgba(91,46,255,.45)', halo: '#9277FF',
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
    /*
     * bg2 era #1f6f8b: o vidro branco sobre ele deixava o próprio texto
     * branco em 4,3 e o acento rosa em 3,3. Um tom mais fundo do mesmo
     * azul-petróleo dá 5,9 ao texto e 4,5 ao rosa.
     */
    glassmorphism: {
      label: 'Glassmorphism', dark: true,
      bg: '#3a2f6b', bg2: '#00556e', brand: '#ffffff', brand2: '#e0d7ff', accent: '#ffd6f5',
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
    /*
     * Temas novos (EXECUTOR D28): faltava tema CLARO além do Minimal White —
     * clínica e escritório pedem tela clara — e um quente para o comércio.
     */
    'clinica-suave': {
      label: 'Clínica Suave', dark: false,
      bg: '#f3f8f7', bg2: '#e0efeb', brand: '#0f766e', brand2: '#115e59', accent: '#0f766e',
      surface: '255,255,255', glass: 0.82, border: 'rgba(15,60,55,.12)',
      text: '#0f2a28', textDim: 'rgba(15,42,40,.62)',
      radius: 18, blur: 16, shadow: '0 14px 40px rgba(15,60,55,.12)', fx: 0.55,
      glow: 'rgba(13,148,136,.3)',
    },
    'corporativo-claro': {
      label: 'Corporativo Claro', dark: false,
      bg: '#f5f7fb', bg2: '#e4e9f2', brand: '#1d4ed8', brand2: '#1e40af', accent: '#1d4ed8',
      surface: '255,255,255', glass: 0.86, border: 'rgba(15,23,42,.10)',
      text: '#0f172a', textDim: 'rgba(15,23,42,.6)',
      radius: 14, blur: 14, shadow: '0 12px 32px rgba(15,23,42,.12)', fx: 0.5,
      glow: 'rgba(37,99,235,.25)',
    },
    'varejo-quente': {
      label: 'Varejo Quente', dark: true,
      bg: '#1a0b06', bg2: '#3d170b', brand: '#f97316', brand2: '#ea580c', accent: '#fbbf24',
      surface: '52,24,12', glass: 0.55, border: 'rgba(249,115,22,.26)',
      text: '#fff7ed', textDim: 'rgba(255,237,213,.66)',
      radius: 18, blur: 20, shadow: '0 18px 50px rgba(0,0,0,.5)', fx: 0.9,
      glow: 'rgba(249,115,22,.45)',
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

  /*
   * O acento também é texto: o preço da lista, o @ das redes, o kicker, a
   * data do aniversário. Ele mirava 3,5 só contra o fundo liso, e o reteste
   * da TV (fase 10) mediu esses textos entre 2,5 e 3,5 — o preço da clínica
   * sobre o palco escuro deu 2,6. Agora é 4,5, como todo texto, contra TODO
   * fundo em que ele pode estar: o palco (bg e bg2) e o vidro das zonas por
   * cima dele. A cor muda só na luminosidade (js/cor.js, garantirContraste):
   * o verde-azulado da marca continua verde-azulado, só mais claro.
   */
  const MIN_ACENTO = 4.5;
  // Sobre uma cor só: o rodapé pintado na cor da marca (js/player.js).
  const acentoSobre = (fundo, marca) => C.garantirContraste(marca, [fundo], MIN_ACENTO);

  /*
   * Os fundos em que o acento aparece: o palco, a superfície (vidro) das
   * zonas sobre ele e as camadas de .mt-surface (css/player.css), o fundo de
   * quase todo conteúdo pronto: o halo no canto de cima (30%, sobre o bg2
   * já tingido em 8,5%, com o véu branco de 5% do topo) e a marca no canto
   * de baixo (24%). Os números são os do CSS: mudou lá, muda aqui.
   */
  function fundosDoTema(t) {
    const bg = okHex(t.bg), bg2 = okHex(t.bg2);
    const lista = [bg, bg2].filter(Boolean);
    const sup = String(t.surface || '').split(',').map(Number);
    if (sup.length === 3 && sup.every((v) => isFinite(v))) {
      const cor = rgb2hex(sup[0], sup[1], sup[2]);
      const vidro = isFinite(Number(t.glass)) ? Number(t.glass) : 0.55;
      lista.slice().forEach((f) => lista.push(mix(f, cor, vidro)));
    }
    const halo = okHex(t.halo), marca = okHex(t.brand);
    if (halo && bg2) {
      const tingido = mix(bg2, halo, 0.085);
      lista.push(tingido, mix(mix(tingido, halo, 0.3), '#ffffff', 0.05));
    }
    if (marca && bg) lista.push(mix(bg, marca, 0.24));
    return lista;
  }

  /*
   * O halo é o brilho de fundo (o canto de .mt-surface e o do palco). Ele
   * sai da cor de sempre (a marca, ou o acento do tema pronto), mas nunca
   * clara a ponto de apagar o texto: com a marca amarela ou branca, o canto
   * do conteúdo ficava cinza-médio e nem o texto branco passava de 3,5.
   */
  function haloSeguro(cor, t) {
    const base = okHex(cor), texto = okHex(t.text);
    return base && texto ? C.garantirContraste(base, [texto], MIN_CONTRASTE) : cor;
  }
  function acentoDoTema(cor, t) {
    const fundos = fundosDoTema(t);
    const base = okHex(cor);
    return base && fundos.length ? C.garantirContraste(base, fundos, MIN_ACENTO) : cor;
  }

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
    out.halo = c.marca;
    out.accent = acentoDoTema(c.marca, out);
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
    const vidro = { bg, bg2, surface: rgbTriple(surface), glass: claro ? 0.72 : 0.55, halo: c.marca, brand: c.marca, text: texto };
    return {
      label: 'Minha marca', dark: !claro,
      bg, bg2, brand: c.marca, brand2: c.marca2, halo: c.marca,
      accent: acentoDoTema(c.marca, Object.assign({}, vidro, { halo: haloSeguro(c.marca, vidro) })),
      surface: vidro.surface, glass: vidro.glass,
      border: rgba(c.marca, claro ? 0.22 : 0.3),
      text: texto,
      textDim: mix(texto, bg, 0.38),
      radius: 20, blur: 22,
      shadow: claro ? '0 14px 40px rgba(20,25,40,.14)' : '0 18px 50px rgba(0,0,0,.45)',
      fx: 0.9, glow: rgba(c.marca, 0.45),
    };
  }

  /* ---------------- O fundo da TV ----------------
   * EXECUTOR §2d, item 41. O dono: "não ficar um tema claro e um background
   * escuro". As peças saem com as cores da marca, muitas vezes claras, e o
   * palco seguia o tema da tela (por padrão, escuro): cartão creme sobre
   * azul-marinho. `theme.fundo` decide:
   *   'pecas'  (padrão) → o palco usa o fundo das peças que estão na TV, pela
   *            MESMA conta delas (js/tokens.js). Sem peça, fica o tema.
   *   'claro' / 'escuro' → o tema na versão clara ou escura, da cor da marca.
   *   'cor'    → uma cor escolhida (`theme.fundoCor`).
   * Cabeçalho e rodapé automáticos leem as mesmas variáveis e vão junto.
   */
  const FUNDOS = ['pecas', 'claro', 'escuro', 'cor'];

  // O clima (texto, vidro, borda, sombra) que combina com um fundo.
  function climaDe(t, bg, bg2, text, textDim) {
    const claro = luminance(bg) > 0.45;
    const out = Object.assign({}, t, {
      dark: !claro, bg, bg2, text, textDim,
      surface: rgbTriple(claro ? mix(bg, '#ffffff', 0.55) : mix(bg, '#ffffff', 0.06)),
      glass: claro ? 0.72 : 0.55,
      border: claro ? 'rgba(20,25,40,.10)' : 'rgba(255,255,255,.09)',
      shadow: claro ? '0 14px 40px rgba(20,25,40,.14)' : '0 18px 50px rgba(0,0,0,.45)',
    });
    out.halo = t.halo || t.brand;
    out.accent = acentoDoTema(t.brand, Object.assign({}, out, { halo: haloSeguro(out.halo, out) }));
    return out;
  }

  /*
   * As peças que mandam no fundo: as em HTML das zonas, pela marca e pelo
   * modo. Vale o par mais frequente — uma peça escura no meio de cinco
   * claras não escurece a tela.
   */
  function pecasDaConfig(cfg) {
    const conta = new Map();
    Object.values((cfg && cfg.zonas) || {}).forEach((z) => {
      ((z && z.items) || []).forEach((it) => {
        if (!it || it.type !== 'peca-html' || !it.marca || !Array.isArray(it.marca.cores) || !it.marca.cores.length) return;
        const k = (it.modo || '') + '|' + it.marca.cores.join(',');
        const atual = conta.get(k) || { n: 0, cores: it.marca.cores, modo: it.modo };
        atual.n += 1;
        conta.set(k, atual);
      });
    });
    let melhor = null;
    conta.forEach((v) => { if (!melhor || v.n > melhor.n) melhor = v; });
    return melhor ? { cores: melhor.cores, modo: melhor.modo } : null;
  }

  function aplicarFundo(t, theme, ctx) {
    const modo = FUNDOS.indexOf(theme.fundo) >= 0 ? theme.fundo : 'pecas';
    if (modo === 'cor') {
      const bg = okHex(theme.fundoCor);
      if (!bg) return t;
      const bg2 = mix(bg, luminance(bg) > 0.45 ? '#000000' : '#ffffff', 0.07);
      const tx = textoSobre(bg, t.brand);
      return climaDe(t, bg, bg2, tx, mix(tx, bg, 0.38));
    }
    if (modo === 'claro' || modo === 'escuro') {
      if (!t.dark === (modo === 'claro')) return t;
      const d = derivar([t.brand, t.brand2], { claro: modo === 'claro' });
      return d ? Object.assign({}, t, d, { label: t.label }) : t;
    }
    const p = ctx && ctx.pecas;
    const Tk = global.MTTokens || (typeof require === 'function' ? require('./tokens.js') : null);
    if (!p || !Tk) return t;
    const k = Tk.daMarca({ cores: p.cores }, p.modo).cores;
    return climaDe(t, k.fundo, k.fundo2, k.texto, k.textoSuave);
  }

  /* ---------------- Composição do tema ---------------- */
  // Um "tema" = preset base + ajustes manuais (overrides). Só as chaves
  // presentes em overrides sobrescrevem o preset.
  function resolve(theme, ctx) {
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
    // O fundo da TV antes dos ajustes manuais, que continuam com a palavra final.
    base = aplicarFundo(base, theme, ctx);
    const t = Object.assign({}, base);
    // O halo nasce da cor de antes do ajuste (como sempre foi), sem apagar o texto.
    const haloDoAcento = !t.halo;
    t.halo = haloSeguro(t.halo || t.accent, t);
    // O acento dos temas prontos também vira texto (o preço, o @): 4,5 contra os fundos dele.
    t.accent = acentoDoTema(t.accent, t);
    // O texto suave (rótulo, categoria da lista) também: era mistura do texto com o fundo, sem conferir o halo.
    if (okHex(t.textDim)) t.textDim = C.garantirContraste(okHex(t.textDim), fundosDoTema(t), MIN_CONTRASTE);
    // Ajustes manuais possíveis do editor.
    const ov = theme.overrides || {};
    ['bg', 'bg2', 'brand', 'brand2', 'accent', 'text', 'textDim', 'surface',
     'border', 'glow'].forEach((k) => { if (ov[k]) t[k] = ov[k]; });
    ['glass', 'radius', 'blur', 'fx'].forEach((k) => {
      if (ov[k] !== undefined && ov[k] !== null && ov[k] !== '') t[k] = Number(ov[k]);
    });
    if (ov.shadow) t.shadow = ov.shadow;
    // O acento posto à mão leva o halo junto, como antes (o halo segue o acento quando o tema não tem um).
    if (ov.accent && haloDoAcento) t.halo = haloSeguro(ov.accent, t);
    t.font = theme.font || 'system';
    return t;
  }

  // Luminância relativa (0–1) de uma cor hex, para escolher texto legível.
  // Cor de texto que contrasta com um fundo sólido (para chips/badges).
  /*
   * Escolhe pelo contraste medido, não pela luminância: o corte em 0,55
   * mandava texto branco sobre o laranja-claro do acento (3,4:1). Com mais
   * de uma cor (o degradê do botão), vale a que se lê na PIOR das pontas.
   */
  function onColor(hex, outra) {
    const cores = [hex, outra].map((x) => okHex(x)).filter(Boolean);
    if (!cores.length) return '#ffffff';
    const pior = (tx) => Math.min.apply(null, cores.map((c) => contraste(tx, c)));
    return pior('#ffffff') >= pior('#0b1020') ? '#ffffff' : '#0b1020';
  }

  // Aplica os tokens no elemento raiz informado (document.documentElement
  // no player; um container isolado poderia ser usado em previews).
  function apply(theme, root, ctx) {
    root = root || document.documentElement;
    const t = resolve(theme, ctx);
    const s = root.style;
    /*
     * Texto sobre a marca: o rodapé, o botão da oferta, a hora da agenda vão
     * num degradê da marca para a segunda cor. Branco sobre o terracota e
     * dourado da padaria dava 1,6:1 na ponta dourada. As pontas do degradê
     * que levam texto vêm acertadas para o texto escolhido (só a luz muda).
     */
    const sobreMarca = onColor(t.brand, t.brand2);
    s.setProperty('--on-brand', sobreMarca);
    s.setProperty('--brand-sob-texto', okHex(t.brand) ? C.garantirContraste(okHex(t.brand), [sobreMarca], MIN_CONTRASTE) : t.brand);
    s.setProperty('--brand-2-sob-texto', okHex(t.brand2) ? C.garantirContraste(okHex(t.brand2), [sobreMarca], MIN_CONTRASTE) : t.brand2);
    // O selo no acento: o degradê vai para o lado contrário ao do texto, para nunca chegar perto dele.
    const sobreAcento = onColor(t.accent);
    s.setProperty('--on-accent', sobreAcento);
    s.setProperty('--accent-2', okHex(t.accent) ? mix(t.accent, sobreAcento === '#ffffff' ? '#000000' : '#ffffff', 0.22) : t.accent);
    s.setProperty('--bg', t.bg);
    s.setProperty('--bg-2', t.bg2);
    s.setProperty('--brand', t.brand);
    s.setProperty('--brand-2', t.brand2);
    s.setProperty('--accent', t.accent);
    // O halo de fundo: a cor de destaque (ou a marca), a não ser que o tema diga outra (o lima da marca vira oliva quando desfocado). Vem de resolve, já sem apagar o texto.
    s.setProperty('--halo', t.halo || t.accent);
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
    resolve, apply, preview, listPresets, listFonts, ensureFont, FUNDOS, pecasDaConfig,
    // Expostos para o painel prever a cor sem duplicar a matemática.
    derivar, tingir, textoSobre, acentoSobre, acentoDoTema, contraste, mix, girarMatiz, rgba,
  };
  // Módulo duplo (D28): o servidor confere os temas que a IA propõe pela mesma lista.
  if (typeof module !== 'undefined' && module.exports) module.exports = global.MTTheme;
})(typeof window !== 'undefined' ? window : globalThis);
