/*
 * player.js
 * Motor de exibição das TVs. Monta o layout multi-telas, gira as playlists
 * de cada zona, roda o rodapé de avisos e recarrega a config periodicamente
 * (do localStorage ou de uma URL remota) para atualização automática.
 *
 * Prioridade: nunca travar. Todo item é isolado em try/catch e, se algo
 * falhar, o player pula para o próximo conteúdo.
 */
(function (global) {
  'use strict';

  const stage = document.getElementById('stage');
  const overlay = document.getElementById('overlay');

  let currentConfig = null;
  let configFingerprint = '';
  const zoneControllers = [];

  /* ---------------- Motor de transições (GSAP + fallback CSS) ----------------
   * Com GSAP, a troca de slides é coreografada (entrada por tipo + revelação do
   * conteúdo em cascata). Sem GSAP, cai nas classes CSS .mt-trans-* de sempre.
   * Só transform/opacity — nada de blur, que pesa na GPU de TV. */
  const GSAP = window.gsap;
  const HAS_GSAP = typeof GSAP !== 'undefined';
  // Estado inicial da entrada, por tipo de transição.
  const TRANS_FROM = {
    fade: { opacity: 0 },
    slide: { opacity: 0, xPercent: 6 },
    zoom: { opacity: 0, scale: 1.08 },
    cinematic: { opacity: 0, scale: 1.06, yPercent: 1.8 },
    none: { opacity: 1 },
  };
  const TRANS_DUR = { fade: 0.8, slide: 0.8, zoom: 0.9, cinematic: 1.0, none: 0 };

  // Slides de "conteúdo" (texto/clima/relógio…) revelam os elementos em cascata.
  // Mídia cheia (imagem/vídeo) e o cartão decorado de aniversário só transitam.
  function isRevealSlide(el) {
    if (el.matches('.mt-image, .mt-video, .mt-empty, .mt-broken, .mt-bcard')) return false;
    return revealTargets(el).length >= 2;
  }
  // Folhas de texto do slide (título, mensagem, temperatura…). Ignora SVG
  // decorativo (balões/confete já têm a própria animação).
  function revealTargets(el) {
    const out = [];
    const nodes = el.querySelectorAll('*');
    for (let i = 0; i < nodes.length && out.length < 10; i++) {
      const n = nodes[i];
      if (n.children.length === 0 && n.textContent && n.textContent.trim()) out.push(n);
    }
    return out;
  }

  function enterSlide(el, type, reveal) {
    el.classList.add('mt-active'); // opacidade final de referência
    if (!HAS_GSAP || type === 'none') {
      if (type !== 'none') { el.classList.add('mt-enter', 'mt-trans-' + type); void el.offsetWidth; }
      return;
    }
    const f = TRANS_FROM[type] || TRANS_FROM.fade;
    const dur = TRANS_DUR[type] || 0.8;
    const leaves = reveal ? revealTargets(el) : [];
    if (leaves.length) {
      // Contêiner só faz o movimento (fica visível); o conteúdo revela em cascata.
      GSAP.fromTo(el,
        { scale: f.scale || 1, xPercent: f.xPercent || 0, yPercent: f.yPercent || 0 },
        { scale: 1, xPercent: 0, yPercent: 0, opacity: 1, duration: dur, ease: 'power3.out', clearProps: 'transform' });
      GSAP.from(leaves, { opacity: 0, yPercent: 14, duration: 0.6, stagger: 0.06, delay: dur * 0.28, ease: 'power2.out', clearProps: 'opacity,transform' });
    } else {
      GSAP.fromTo(el, Object.assign({ opacity: 0 }, f),
        { opacity: 1, scale: 1, xPercent: 0, yPercent: 0, duration: dur, ease: 'power3.out', clearProps: 'transform' });
    }
  }

  function leaveSlide(prev) {
    try { prev.onLeave && prev.onLeave(); } catch (e) {}
    if (!HAS_GSAP) {
      prev.el.classList.remove('mt-active');
      prev.el.classList.add('mt-leave');
      setTimeout(() => prev.el.remove(), 800);
      return;
    }
    GSAP.to(prev.el, { opacity: 0, scale: 0.992, duration: 0.6, ease: 'power1.in', onComplete: () => prev.el.remove() });
  }

  /* ---------------- Ciclo de vida ---------------- */

  async function boot() {
    if (global.MTCloud && MTCloud.deviceMode()) {
      return bootCloud();
    }
    let cfg;
    try {
      cfg = await resolveConfig();
    } catch (e) {
      cfg = MTStorage.load();
    }
    const logoEl = document.querySelector('.mt-logo');
    if (logoEl) logoEl.textContent = (cfg.settings && cfg.settings.nome) || 'Mídia Indoor';
    applyConfig(cfg);
    startWatchers(cfg.settings.refreshSeconds || 60);
    hideOverlayAfter();
  }

  // Modo nuvem: a TV é controlada pelo celular. Cria/retoma um device,
  // mostra o código de pareamento e recebe a config em tempo real (SSE).
  async function bootCloud() {
    let dev;
    try {
      dev = await MTCloud.ensureDevice();
    } catch (e) {
      // Sem servidor acessível (offline): usa a última config em cache — a
      // tela não apaga. Só cai para o exemplo local se nunca houve config.
      const cached = loadCachedConfig();
      applyConfig(cached || MTStorage.load());
      startWatchers(60);
      return hideOverlayAfter();
    }
    let cfg = null;
    try { cfg = await MTCloud.fetchConfig(dev.id); } catch (e) { /* offline ou ainda não pareado */ }
    // Offline: se não veio config da rede mas existe uma última boa em cache,
    // usa ela — a tela não apaga por causa de uma queda de rede.
    if (!cfg) cfg = loadCachedConfig();
    if (cfg) {
      applyConfig(cfg);
      saveCachedConfig(cfg);
      hidePairing();
    } else {
      showPairing(dev.code);
    }
    hideOverlayAfter();
    MTCloud.subscribe(dev.id, function (newCfg) {
      hidePairing();
      applyConfig(newCfg);
      saveCachedConfig(newCfg);
    });
    // Telemetria: pulsa "estou viva" já e a cada 30s → status real da frota.
    MTCloud.heartbeat(dev.id);
    setInterval(function () { MTCloud.heartbeat(dev.id); }, 30000);
  }

  /* ---------------- Pareamento (modo nuvem) ---------------- */
  function showPairing(code) {
    let el = document.getElementById('pairing');
    if (!el) return;
    const codeEl = el.querySelector('.mt-pairing-code');
    if (codeEl) codeEl.textContent = code || '••••••';
    el.classList.remove('hidden');
  }
  function hidePairing() {
    const el = document.getElementById('pairing');
    if (el) el.classList.add('hidden');
  }

  // Decide de onde vem a config: URL remota (se houver) ou localStorage.
  async function resolveConfig() {
    const local = MTStorage.load();
    const url = (local.settings && local.settings.remoteConfigUrl || '').trim();
    if (url) {
      try {
        return await MTStorage.fetchRemote(url);
      } catch (e) {
        console.warn('[player] falha na config remota, usando local', e);
      }
    }
    return local;
  }

  function fingerprint(cfg) {
    try { return JSON.stringify(cfg); } catch (e) { return String(Math.random()); }
  }


  function applyConfig(cfg) {
    const fp = fingerprint(cfg);
    if (fp === configFingerprint) return; // nada mudou
    configFingerprint = fp;
    currentConfig = cfg;
    teardownZones();
    buildStage(cfg);
    precacheMedia(cfg); // baixa a mídia da playlist p/ tocar offline depois
  }

  /* ---------------- Resiliência offline ---------------- */
  const CFG_CACHE_KEY = 'vistra.lastConfig';
  function saveCachedConfig(cfg) {
    try { localStorage.setItem(CFG_CACHE_KEY, JSON.stringify(cfg)); } catch (e) {}
  }
  function loadCachedConfig() {
    try { const r = localStorage.getItem(CFG_CACHE_KEY); return r ? JSON.parse(r) : null; } catch (e) { return null; }
  }
  // Pré-carrega a mídia (/media/...) de toda a playlist para o cache do service
  // worker, para que a tela toque mesmo sem rede na próxima queda.
  function precacheMedia(cfg) {
    try {
      const urls = {};
      JSON.stringify(cfg).replace(/\/media\/[A-Za-z0-9_.\/\-]+/g, function (m) { urls[m] = 1; return m; });
      Object.keys(urls).forEach(function (u) { fetch(u).catch(function () {}); });
    } catch (e) {}
  }

  function startWatchers(refreshSeconds) {
    // 1) Recarrega config periodicamente (remota ou local).
    setInterval(async () => {
      try {
        const cfg = await resolveConfig();
        applyConfig(cfg);
      } catch (e) { /* mantém a atual */ }
    }, Math.max(10, refreshSeconds) * 1000);

    // 2) Reage instantaneamente a mudanças do Admin (mesma origem).
    global.addEventListener('storage', (ev) => {
      if (ev.key === 'multitelas.updatedAt' || ev.key === MTStorage.KEY) {
        applyConfig(MTStorage.load());
      }
    });
  }

  function hideOverlayAfter() {
    setTimeout(() => overlay && overlay.classList.add('hidden'), 1200);
  }

  /* ---------------- Montagem do palco ---------------- */

  function teardownZones() {
    zoneControllers.forEach((c) => c.stop && c.stop());
    zoneControllers.length = 0;
    clearTakeover();
    stage.innerHTML = '';
  }

  /* Gera variações de arranjo (só disposição/tamanho) para um layout,
   * mantendo exatamente as mesmas zonas. Usado pelo layout dinâmico. */
  function computeArrangements(layout) {
    const g = layout.grid;
    const areas = g.areas.slice();
    const out = [{ columns: g.columns, rows: g.rows, areas: areas.slice() }];
    const cols = g.columns.trim().split(/\s+/);
    const frs = cols.map((c) => /^([\d.]+)fr$/.exec(c));

    // Variações de proporção para layouts de 2 colunas em fr.
    if (cols.length === 2 && frs[0] && frs[1]) {
      const total = parseFloat(frs[0][1]) + parseFloat(frs[1][1]);
      const push = (p) => out.push({
        columns: (total * p).toFixed(2) + 'fr ' + (total * (1 - p)).toFixed(2) + 'fr',
        rows: g.rows, areas: areas.slice(),
      });
      push(0.5);   // equilibra as duas
      push(0.72);  // principal maior
    } else if (layout.dynamic && Array.isArray(layout.dynamic.columns)) {
      layout.dynamic.columns.forEach((c) => {
        if (c !== g.columns) out.push({ columns: c, rows: g.rows, areas: areas.slice() });
      });
    }

    // Espelhamento horizontal: inverte o lado da lateral (quando muda algo).
    if (cols.length > 1) {
      const mareas = areas.map((r) => r.trim().split(/\s+/).reverse().join(' '));
      if (mareas.join('|') !== areas.join('|')) {
        out.push({ columns: cols.slice().reverse().join(' '), rows: g.rows, areas: mareas });
      }
    }
    return out;
  }

  function buildStage(cfg) {
    const layout = MT_getLayout(cfg.settings.layoutId);
    function setGrid(a) {
      stage.style.gridTemplateColumns = a.columns;
      stage.style.gridTemplateRows = a.rows;
      stage.style.gridTemplateAreas = a.areas.map((row) => '"' + row + '"').join(' ');
    }
    // Troca de arranjo com animação FLIP: as zonas deslizam/redimensionam
    // suavemente (o grid, sozinho, não anima realocação). Nada de conteúdo
    // é recriado — vídeos/lives continuam tocando.
    function animateArrangement(a) {
      const zones = Array.prototype.slice.call(stage.querySelectorAll('.mt-zone'));
      const first = zones.map((z) => z.getBoundingClientRect());
      setGrid(a); // aplica o layout final (instantâneo)
      const dur = 1100;
      zones.forEach((z, i) => {
        const last = z.getBoundingClientRect();
        const f = first[i];
        const dx = f.left - last.left, dy = f.top - last.top;
        const sx = last.width ? f.width / last.width : 1;
        const sy = last.height ? f.height / last.height : 1;
        if (Math.abs(dx) < 1 && Math.abs(dy) < 1 && Math.abs(sx - 1) < 0.01 && Math.abs(sy - 1) < 0.01) return;
        z.style.transformOrigin = 'top left';
        z.style.transition = 'none';
        z.style.willChange = 'transform';
        z.style.transform = 'translate(' + dx + 'px,' + dy + 'px) scale(' + sx + ',' + sy + ')';
      });
      requestAnimationFrame(() => {
        zones.forEach((z) => {
          if (!z.style.transform) return;
          z.style.transition = 'transform ' + dur + 'ms cubic-bezier(.22,.61,.36,1)';
          z.style.transform = '';
        });
        setTimeout(() => zones.forEach((z) => { z.style.transition = ''; z.style.willChange = ''; z.style.transformOrigin = ''; }), dur + 60);
      });
    }
    setGrid({ columns: layout.grid.columns, rows: layout.grid.rows, areas: layout.grid.areas });

    // Segunda camada de aurora (fundo vivo). É position:absolute, fica fora do
    // fluxo do grid e atrás das zonas; recriada a cada montagem do palco.
    const fxLayer = document.createElement('div');
    fxLayer.className = 'mt-stage-fx';
    fxLayer.setAttribute('aria-hidden', 'true');
    stage.appendChild(fxLayer);

    // Layout dinâmico: a disposição se alterna sozinha (proporções e lado da
    // lateral) ao longo do tempo, com transição fluida (FLIP).
    const auto = cfg.settings.layoutAuto === true;
    const arrangements = computeArrangements(layout);
    if (auto && arrangements.length > 1) {
      stage.classList.remove('mt-stage-breathing'); // FLIP anima via transform
      let step = 0;
      const iv = Math.max(8, cfg.settings.layoutAutoSeconds || 20) * 1000;
      const t = setInterval(() => {
        step = (step + 1) % arrangements.length;
        animateArrangement(arrangements[step]);
      }, iv);
      zoneControllers.push({ stop: () => clearInterval(t) });
    } else if (layout.dynamic) {
      // Compatibilidade: "respiro" só de colunas dos layouts que já traziam isso.
      stage.classList.add('mt-stage-breathing');
      const states = layout.dynamic.columns;
      let step = 0;
      const breatheTimer = setInterval(() => {
        step = (step + 1) % states.length;
        stage.style.gridTemplateColumns = states[step];
      }, Math.max(6, layout.dynamic.intervalSeconds || 18) * 1000);
      zoneControllers.push({ stop: () => clearInterval(breatheTimer) });
    } else {
      stage.classList.remove('mt-stage-breathing');
    }

    // Tema premium: aplica todos os design tokens (cores, vidro, sombras,
    // fonte). Retrocompatível — configs antigas já foram migradas no storage.
    const resolved = (global.MTTheme && MTTheme.apply(cfg.settings.theme)) || null;
    // Modo performance: com fx baixo, desliga efeitos caros (blur/aurora).
    const fx = resolved ? resolved.fx : 0.9;
    document.documentElement.classList.toggle('mt-perf', fx <= 0.25);

    // Inteligência de cor: registra as cores base e liga/desliga a adaptação.
    if (global.MTAdaptive) {
      MTAdaptive.enabled = cfg.settings.coresAdaptativas !== false;
      if (resolved) MTAdaptive.setBase({ accent: resolved.accent, glow: resolved.glow });
    }
    // Layout inteligente (takeover de prioridade) ligado por padrão.
    smartLayout = cfg.settings.layoutInteligente !== false;

    // Decoração sazonal (neve, corações, bandeirinhas…) sobre o palco.
    buildDecoration(cfg);

    const hasGsap = typeof window.gsap !== 'undefined';
    const zoneEls = [];
    layout.zones.forEach((zone, i) => {
      const zoneEl = document.createElement('div');
      zoneEl.className = 'mt-zone mt-zone-' + zone.type;
      zoneEl.style.gridArea = zone.area;
      // Entrada escalonada das zonas ao montar o palco. Com GSAP a coreografia
      // é mais rica (sobe + escala + desfoque saindo); sem GSAP, cai no
      // keyframe CSS de fallback.
      if (!hasGsap) {
        zoneEl.style.animation = 'mt-zone-in .8s cubic-bezier(.16,.84,.3,1) both';
        zoneEl.style.animationDelay = (i * 0.09) + 's';
      }
      stage.appendChild(zoneEl);
      zoneEls.push(zoneEl);

      const data = cfg.zonas[zone.id] || {};
      if (zone.type === 'ticker') {
        zoneControllers.push(startTicker(zoneEl, data, cfg));
      } else if (zone.type === 'header') {
        zoneControllers.push(startHeader(zoneEl, cfg));
      } else {
        zoneControllers.push(startPlaylist(zoneEl, data.items || [], cfg));
      }
    });

    if (hasGsap && zoneEls.length) {
      // Entrada premium escalonada: sobe + escala + fade. Só transform/opacity
      // (baratos na GPU de TV); nada de blur, que pesa em hardware fraco.
      window.gsap.from(zoneEls, {
        opacity: 0, y: '3.2vh', scale: 0.972,
        duration: 0.9, ease: 'power3.out', stagger: 0.1, clearProps: 'transform,opacity',
      });
    }
  }

  /* ---------------- Layout inteligente: takeover de prioridade ----------------
   * Quando uma zona exibe um conteúdo marcado como "destaque" ou "urgente",
   * o director o promove para o centro da tela, desfocando/escurecendo o
   * resto — e depois libera, voltando ao layout normal. As zonas por baixo
   * (inclusive vídeo/live) nunca são interrompidas. */

  let smartLayout = true;
  const takeover = { el: null, level: null, timer: null, onLeave: null };
  // Tipos que podem "tomar a tela" (evita duplicar vídeos/lives/iframes).
  const TAKEOVER_TYPES = {
    announce: 1, text: 1, notice: 1, birthdaycard: 1, spotlight: 1,
    kpi: 1, promo: 1, quote: 1, image: 1, agenda: 1, social: 1,
  };
  const LEVEL_RANK = { destaque: 1, urgente: 2 };

  /* Alerta sonoro para avisos urgentes — sintetizado via WebAudio, sem
   * arquivo externo (funciona offline e sem hospedar nada). */
  let audioCtx = null;
  function ensureAudio() {
    if (audioCtx) return audioCtx;
    try {
      const AC = global.AudioContext || global.webkitAudioContext;
      if (AC) audioCtx = new AC();
    } catch (e) { /* sem áudio disponível */ }
    return audioCtx;
  }
  // Navegadores exigem um gesto do usuário para liberar o áudio.
  function unlockAudio() {
    const ctx = ensureAudio();
    if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {});
  }
  function playUrgentChime() {
    const ctx = ensureAudio();
    if (!ctx) return;
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    const now = ctx.currentTime;
    // Duas notas de atenção, estilo sino de emissora.
    [[880, 0], [1174.66, 0.16]].forEach(function (n) {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.value = n[0];
      const start = now + n[1];
      g.gain.setValueAtTime(0.0001, start);
      g.gain.exponentialRampToValueAtTime(0.4, start + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, start + 0.5);
      osc.connect(g); g.connect(ctx.destination);
      osc.start(start); osc.stop(start + 0.55);
    });
  }

  function maybeTakeover(item) {
    if (!smartLayout) return;
    const level = item && item.prioridade;
    if (level !== 'destaque' && level !== 'urgente') return;
    if (!TAKEOVER_TYPES[item.type]) return;
    // Já há um takeover: só um mais forte (urgente) preempta.
    if (takeover.el) {
      if (LEVEL_RANK[level] > LEVEL_RANK[takeover.level]) clearTakeover();
      else return;
    }
    showTakeover(item, level);
  }

  function showTakeover(item, level) {
    let rendered;
    try { rendered = MTRender.renderItem(item); } catch (e) { return; }
    const layer = document.createElement('div');
    layer.className = 'mt-takeover mt-takeover-' + level;
    if (level === 'urgente') {
      const bar = document.createElement('div');
      bar.className = 'mt-takeover-alert';
      bar.textContent = (item.etiqueta || 'AVISO IMPORTANTE');
      layer.appendChild(bar);
      // Destaque reforçado (flash vermelho) + alerta sonoro, se habilitado.
      if (!currentConfig || currentConfig.settings.somUrgente !== false) {
        try { playUrgentChime(); } catch (e) {}
      }
    }
    const card = document.createElement('div');
    card.className = 'mt-takeover-card';
    rendered.el.classList.add('mt-active');
    card.appendChild(rendered.el);
    layer.appendChild(card);
    document.body.appendChild(layer);
    void layer.offsetWidth;
    layer.classList.add('mt-in');
    try { rendered.onEnter && rendered.onEnter(function () {}); } catch (e) {}

    takeover.el = layer; takeover.level = level; takeover.onLeave = rendered.onLeave;
    const dur = (item.duracao && item.duracao > 0) ? item.duracao : 10;
    takeover.timer = setTimeout(clearTakeover, dur * 1000);
  }

  function clearTakeover() {
    if (!takeover.el) return;
    clearTimeout(takeover.timer);
    const layer = takeover.el;
    try { takeover.onLeave && takeover.onLeave(); } catch (e) {}
    layer.classList.remove('mt-in');
    layer.classList.add('mt-out');
    setTimeout(() => layer.remove(), 700);
    takeover.el = null; takeover.level = null; takeover.onLeave = null;
  }

  /* ---------------- Decoração sazonal ---------------- */

  let decorLayer = null;
  function buildDecoration(cfg) {
    if (decorLayer) { decorLayer.remove(); decorLayer = null; }
    let tipo = (cfg.settings.decoracao || 'none');
    if (tipo === 'auto') {
      const s = global.MTSeasons && MTSeasons.todaySeason();
      tipo = s ? s.decoracao : 'none';
    }
    if (!tipo || tipo === 'none') return;
    // Em modo performance, evita partículas pesadas.
    if (document.documentElement.classList.contains('mt-perf') &&
        tipo !== 'flags') return;

    const layer = document.createElement('div');
    layer.className = 'mt-decor mt-decor-' + tipo;
    document.body.appendChild(layer);
    decorLayer = layer;

    if (tipo === 'flags') return buildFlags(layer);
    if (tipo === 'lights') { buildFlags(layer, true); }
    const spec = DECOR_SPEC[tipo] || DECOR_SPEC.confetti;
    const count = spec.count;
    for (let i = 0; i < count; i++) {
      const p = document.createElement('span');
      p.className = 'mt-particle';
      const size = spec.size[0] + Math.random() * (spec.size[1] - spec.size[0]);
      p.style.setProperty('--s', size.toFixed(1) + 'px');
      p.style.left = (Math.random() * 100) + 'vw';
      p.style.setProperty('--dur', (spec.dur[0] + Math.random() * (spec.dur[1] - spec.dur[0])).toFixed(1) + 's');
      p.style.setProperty('--delay', (-Math.random() * spec.dur[1]).toFixed(1) + 's');
      p.style.setProperty('--drift', (Math.random() * 12 - 6).toFixed(1) + 'vw');
      if (spec.glyph) {
        p.textContent = spec.glyph[Math.floor(Math.random() * spec.glyph.length)];
        p.style.fontSize = 'var(--s)';
      } else if (spec.colors) {
        p.style.background = spec.colors[Math.floor(Math.random() * spec.colors.length)];
        p.style.setProperty('--spin', (Math.random() * 720 - 360).toFixed(0) + 'deg');
      }
      layer.appendChild(p);
    }
  }

  const DECOR_SPEC = {
    snow: { count: 60, size: [4, 12], dur: [6, 13], colors: ['rgba(255,255,255,.9)'] },
    petals: { count: 34, size: [16, 30], dur: [7, 14], glyph: ['🌸', '🌺', '🎀'] },
    hearts: { count: 28, size: [18, 34], dur: [6, 12], glyph: ['💗', '💖', '❤️'] },
    confetti: { count: 70, size: [7, 14], dur: [4, 9], colors: ['#ff5da2', '#ffb454', '#4f8cff', '#39d0c4', '#ffd76e', '#a855f7'] },
    fireworks: { count: 40, size: [6, 12], dur: [4, 8], colors: ['#ffd76e', '#f5d67b', '#ffe08a', '#fbbf24', '#fff'] },
  };

  // Bandeirinhas de festa junina (guirlanda no topo). Com "lights"=true,
  // vira uma fileira de luzes piscantes (Natal).
  function buildFlags(layer, lights) {
    const garland = document.createElement('div');
    garland.className = lights ? 'mt-garland mt-garland-lights' : 'mt-garland';
    const cols = lights
      ? ['#f87171', '#fbbf24', '#34d399', '#60a5fa', '#f0abfc']
      : ['#ef4444', '#f59e0b', '#22c55e', '#3b82f6', '#ec4899', '#eab308'];
    const n = 26;
    for (let i = 0; i < n; i++) {
      const f = document.createElement('span');
      f.className = lights ? 'mt-light' : 'mt-flag';
      f.style.color = cols[i % cols.length];
      f.style.background = cols[i % cols.length];
      f.style.setProperty('--delay', (i * 0.12).toFixed(2) + 's');
      garland.appendChild(f);
    }
    layer.appendChild(garland);
  }

  /* ---------------- Zona: Playlist rotativa ---------------- */

  function startPlaylist(zoneEl, items, cfg) {
    let index = 0;
    let timer = null;
    let currentSlide = null;
    let stopped = false;
    // Zona com um único item, sem agendamento, fica estática (essencial para
    // lives do YouTube: re-renderizar recarregaria a transmissão).
    const single = items.length === 1 && !hasAgenda(items[0]);
    const agendado = items.some(hasAgenda);

    if (!items.length) {
      const empty = document.createElement('div');
      empty.className = 'mt-slide mt-empty mt-active';
      empty.textContent = 'Sem conteúdo';
      zoneEl.appendChild(empty);
      return { stop: () => {} };
    }

    function advance() {
      if (stopped) return;

      // Filtra pelos conteúdos agendados para agora.
      const ativos = agendado ? items.filter(agendadoAgora) : items;
      if (!ativos.length) {
        showPlaceholder('Nenhum conteúdo agendado agora');
        return schedule(30); // reavalia periodicamente
      }
      const item = ativos[index % ativos.length];
      index++;

      let rendered;
      try {
        rendered = MTRender.renderItem(item);
      } catch (e) {
        console.warn('[player] erro ao renderizar item, pulando', e);
        return schedule(1); // tenta o próximo rapidamente
      }

      const transition = cfg.settings.transicao || 'fade';
      zoneEl.appendChild(rendered.el);
      enterSlide(rendered.el, transition, isRevealSlide(rendered.el));

      const prev = currentSlide;
      currentSlide = { el: rendered.el, onLeave: rendered.onLeave };

      if (prev) leaveSlide(prev);

      // Alguns itens controlam o próprio avanço (ex.: vídeo até terminar).
      let advanced = false;
      const goNext = () => { if (!advanced) { advanced = true; schedule(0); } };
      try { rendered.onEnter && rendered.onEnter(goNext); } catch (e) {}

      // Conteúdo prioritário toma a tela (layout inteligente).
      try { maybeTakeover(item); } catch (e) {}

      const dur = rendered.duration;
      if (single) return; // estática — só o próprio item avança (ex.: vídeo ao terminar)
      if (dur && dur > 0) schedule(dur);
      else if (rendered.onEnter) {
        // Item controla o próprio avanço (ex.: vídeo até o fim, live "fixa"
        // com duração 0). Como a zona tem outros itens, garantimos um teto
        // de segurança para a rotação nunca travar nele indefinidamente.
        schedule(600);
      } else schedule(10); // fallback de segurança
    }

    function schedule(seconds) {
      clearTimeout(timer);
      timer = setTimeout(advance, Math.max(0, seconds) * 1000);
    }

    function showPlaceholder(text) {
      if (currentSlide && currentSlide.el.classList.contains('mt-empty')) return;
      const el = document.createElement('div');
      el.className = 'mt-slide mt-empty mt-active';
      el.textContent = text;
      zoneEl.appendChild(el);
      const prev = currentSlide;
      currentSlide = { el, onLeave: null };
      if (prev) leaveSlide(prev);
    }

    advance();
    return {
      stop: () => { stopped = true; clearTimeout(timer); },
    };
  }

  /* ---------------- Agendamento de conteúdos ---------------- */
  function hasAgenda(item) {
    return !!(item && item.agendamento && item.agendamento.ativo);
  }
  // Verifica se um item está dentro da sua janela agendada (data/dias/hora).
  function agendadoAgora(item) {
    const a = item && item.agendamento;
    if (!a || !a.ativo) return true;
    const now = new Date();
    const y = now.getFullYear();
    const today = y + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' +
      String(now.getDate()).padStart(2, '0');
    if (a.dataInicio && today < a.dataInicio) return false;
    if (a.dataFim && today > a.dataFim) return false;
    if (Array.isArray(a.dias) && a.dias.length && a.dias.indexOf(now.getDay()) === -1) return false;
    if (a.horaInicio || a.horaFim) {
      const hm = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');
      const ini = a.horaInicio || '00:00';
      const fim = a.horaFim || '23:59';
      if (ini <= fim) { if (hm < ini || hm > fim) return false; }
      else { if (hm < ini && hm > fim) return false; } // janela que cruza a meia-noite
    }
    return true;
  }

  /* ---------------- Zona: Faixa de notícias / avisos ---------------- */

  function startTicker(zoneEl, data, cfg) {
    const messages = (data.messages || []).filter((m) => m && m.trim());
    const modo = data.modo || 'noticias';
    if (modo === 'rolagem') return startScrollTicker(zoneEl, messages, data);
    return startNewsTicker(zoneEl, messages, data);
  }

  // Estilo "jornal": selo com data/hora ao vivo + manchetes rotativas.
  // Formato da mensagem: "Título :: descrição" (descrição opcional).
  function startNewsTicker(zoneEl, messages, data) {
    zoneEl.classList.add('mt-news');

    // Estilo clássico (duas linhas): linha superior com o selo "ao vivo" e o
    // relógio; manchete (título + descrição) embaixo. Melhor aproveitamento
    // da largura e alinhamento — selo à esquerda, relógio alinhado à direita.
    const content = document.createElement('div');
    content.className = 'mt-news-content';

    const topline = document.createElement('div');
    topline.className = 'mt-news-topline';
    const tag = document.createElement('div');
    tag.className = 'mt-news-tag';
    tag.textContent = data.titulo || 'ÚLTIMAS NOTÍCIAS';
    const clock = document.createElement('div');
    clock.className = 'mt-news-clock';
    clock.innerHTML = '<span class="nc-date"></span><span class="nc-sep"></span><span class="nc-time"></span>';
    topline.appendChild(tag);
    topline.appendChild(clock);

    const headline = document.createElement('div');
    headline.className = 'mt-news-headline';
    const title = document.createElement('div');
    title.className = 'mt-news-title';
    const desc = document.createElement('div');
    desc.className = 'mt-news-desc';
    headline.appendChild(title);
    headline.appendChild(desc);

    content.appendChild(topline);
    content.appendChild(headline);
    zoneEl.appendChild(content);

    // Relógio ao vivo (com segundos), como numa emissora.
    const MESES = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ'];
    function tick() {
      const now = new Date();
      clock.querySelector('.nc-date').textContent =
        String(now.getDate()).padStart(2, '0') + ' ' + MESES[now.getMonth()];
      clock.querySelector('.nc-time').textContent = now.toLocaleTimeString('pt-BR');
    }
    tick();
    const clockTimer = setInterval(tick, 1000);

    // Manchetes: manuais ("Título :: descrição") e/ou automáticas via RSS.
    let items = messages.map((m) => {
      const parts = m.split('::');
      return { titulo: parts[0].trim(), desc: (parts[1] || '').trim() };
    });
    // Monta a lista de fontes automáticas: várias (data.fontes) + a URL
    // personalizada (rssUrl) + compatibilidade com a fonte única antiga.
    const sources = [];
    (data.fontes || []).forEach((s) => { if (s && sources.indexOf(s) === -1) sources.push(s); });
    if (!(data.fontes || []).length && data.fonte && data.fonte !== 'manual' && data.fonte !== 'custom') {
      sources.push(data.fonte);
    }
    const customUrl = (data.rssUrl || '').trim();
    if (customUrl && sources.indexOf(customUrl) === -1) sources.push(customUrl);
    const usingFeed = sources.length > 0;

    let idx = 0;
    function show() {
      if (!items.length) {
        title.textContent = usingFeed
          ? 'Carregando notícias…' : 'Adicione notícias no painel de gestão';
        desc.textContent = '';
        return;
      }
      const item = items[idx % items.length];
      idx++;
      headline.classList.remove('mt-news-in');
      void headline.offsetWidth; // reinicia a animação
      headline.classList.add('mt-news-in');
      title.textContent = item.titulo;
      desc.textContent = item.desc;
    }

    // Busca automática de manchetes (G1, UOL, CNN…). Em caso de falha,
    // mantém as mensagens manuais como reserva.
    async function loadFeed() {
      if (!usingFeed || !global.MTNews) return;
      try {
        const feed = await MTNews.fetchMany(sources, data.quantidade || 20);
        if (feed && feed.length) {
          items = feed;
          if (idx >= items.length) idx = 0;
        }
      } catch (e) { /* segue com as mensagens manuais */ }
    }

    show();
    if (usingFeed) {
      loadFeed().then(() => { idx = 0; show(); });
    }
    const rotateTimer = setInterval(() => {
      if (items.length > 1) show();
    }, Math.max(3, data.intervalo || 8) * 1000);
    const feedTimer = usingFeed ? setInterval(loadFeed, 10 * 60 * 1000) : null;

    return {
      stop: () => {
        clearInterval(clockTimer);
        clearInterval(rotateTimer);
        feedTimer && clearInterval(feedTimer);
      },
    };
  }

  // Estilo clássico: texto rolando continuamente.
  function startScrollTicker(zoneEl, messages, data) {
    zoneEl.classList.add('mt-ticker');
    if (!messages.length) {
      return { stop: () => {} };
    }
    const track = document.createElement('div');
    track.className = 'mt-ticker-track';
    const text = messages.join('   •   ');
    // Duplica para rolagem contínua sem "buracos".
    for (let i = 0; i < 2; i++) {
      const span = document.createElement('span');
      span.className = 'mt-ticker-item';
      span.textContent = text + '   •   ';
      track.appendChild(span);
    }
    zoneEl.appendChild(track);

    // Velocidade constante (px/s) independente do tamanho da tela.
    requestAnimationFrame(() => {
      const width = track.scrollWidth / 2;
      const speed = data.velocidade || 60;
      const duration = width / speed;
      track.style.animationDuration = duration + 's';
    });

    return { stop: () => {} };
  }

  /* ---------------- Zona: Cabeçalho ---------------- */

  function startHeader(zoneEl, cfg) {
    zoneEl.classList.add('mt-header');
    const left = document.createElement('div');
    left.className = 'mt-header-left';
    if (cfg.settings.logoUrl) {
      const img = document.createElement('img');
      img.className = 'mt-header-logo';
      img.src = cfg.settings.logoUrl;
      left.appendChild(img);
    }
    const title = document.createElement('div');
    title.className = 'mt-header-title';
    title.textContent = cfg.settings.titulo || cfg.settings.nome || '';
    left.appendChild(title);

    const right = document.createElement('div');
    right.className = 'mt-header-right';
    const clock = document.createElement('div');
    clock.className = 'mt-header-clock';
    const weather = document.createElement('div');
    weather.className = 'mt-header-weather';
    right.appendChild(weather);
    right.appendChild(clock);

    zoneEl.appendChild(left);
    zoneEl.appendChild(right);

    function tickClock() {
      const now = new Date();
      const dia = now.toLocaleDateString('pt-BR', { weekday: 'long' });
      clock.innerHTML =
        '<span class="mt-hc-time">' +
        now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) +
        '</span><span class="mt-hc-date">' +
        dia.charAt(0).toUpperCase() + dia.slice(1) + ' | ' +
        now.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }) +
        '</span>';
    }
    tickClock();
    const t = setInterval(tickClock, 1000 * 20);

    // Clima no cabeçalho (opcional).
    updateHeaderWeather(weather, cfg.settings.cidadeClima || 'São Paulo');

    return { stop: () => clearInterval(t) };
  }

  async function updateHeaderWeather(el, cidade) {
    try {
      const geo = await (await fetch(
        'https://geocoding-api.open-meteo.com/v1/search?count=1&language=pt&name=' +
        encodeURIComponent(cidade))).json();
      if (!geo.results || !geo.results.length) return;
      const g = geo.results[0];
      const w = await (await fetch(
        'https://api.open-meteo.com/v1/forecast?current=temperature_2m,weather_code&timezone=auto&latitude=' +
        g.latitude + '&longitude=' + g.longitude)).json();
      el.textContent = Math.round(w.current.temperature_2m) + '°C · ' + g.name;
    } catch (e) { /* silencioso */ }
  }

  /* ---------------- Fullscreen no clique/tecla ---------------- */
  function enableFullscreenShortcut() {
    function goFs() {
      const el = document.documentElement;
      if (el.requestFullscreen) el.requestFullscreen().catch(() => {});
    }
    document.addEventListener('dblclick', goFs);
    document.addEventListener('keydown', (e) => {
      if (e.key === 'f' || e.key === 'F') goFs();
    });
    // Libera o áudio (alerta urgente) no primeiro gesto do usuário.
    ['pointerdown', 'keydown', 'touchstart'].forEach((ev) =>
      document.addEventListener(ev, unlockAudio, { passive: true }));
  }

  enableFullscreenShortcut();
  boot();
})(window);
