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

  // Coordenação entre os dois sistemas de animação: entrada de conteúdo (slide)
  // e mudança de formato (FLIP do layout). Os dois mexem na opacidade dos
  // mesmos elementos — se rodarem juntos, enroscam. Marcamos até quando cada um
  // está ocupado e o outro espera assentar antes de começar.
  let contentBusyUntil = 0; // um slide está entrando
  let formatBusyUntil = 0;  // um FLIP de layout está rolando
  const nowMs = () => (global.performance && performance.now ? performance.now() : Date.now());

  /* ---------------- Motor de transições (GSAP + fallback CSS) ----------------
   * Com GSAP, a troca de slides é coreografada (entrada por tipo + revelação do
   * conteúdo em cascata). Sem GSAP, cai nas classes CSS .mt-trans-* de sempre.
   * Só transform/opacity — nada de blur, que pesa na GPU de TV. */
  const GSAP = window.gsap;
  const HAS_GSAP = typeof GSAP !== 'undefined';
  // Estado inicial da entrada, por tipo de transição.
  // Movimentos contidos: entrada percebida como "assentar" suave, não empurrão.
  const TRANS_FROM = {
    fade: { opacity: 0, scale: 1.012 },
    slide: { opacity: 0, xPercent: 3.5 },
    zoom: { opacity: 0, scale: 1.045 },
    cinematic: { opacity: 0, scale: 1.03, yPercent: 1.1 },
    none: { opacity: 1 },
  };
  // Um pouco mais longas: dá tempo da curva macia respirar (premium > apressado).
  const TRANS_DUR = { fade: 0.95, slide: 0.95, zoom: 1.05, cinematic: 1.2, none: 0 };
  // Curva suave e orgânica (desaceleração longa) — nada de freada seca.
  const EASE_IN = 'power2.out';

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

  // Roda o callback só depois que o navegador terminou layout + paint do frame
  // atual (2× rAF). Assim a animação nunca disputa com o custo de montar o DOM
  // novo — começa fluida desde o primeiro frame.
  function afterPaint(fn) {
    requestAnimationFrame(function () { requestAnimationFrame(fn); });
  }

  function enterSlide(el, type, reveal) {
    el.classList.add('mt-active'); // opacidade final de referência
    if (!HAS_GSAP || type === 'none') {
      if (type !== 'none') { el.classList.add('mt-enter', 'mt-trans-' + type); void el.offsetWidth; }
      return;
    }
    const f = TRANS_FROM[type] || TRANS_FROM.fade;
    const dur = TRANS_DUR[type] || 0.9;
    const move = { scale: f.scale || 1, xPercent: f.xPercent || 0, yPercent: f.yPercent || 0 };
    const leaves = reveal ? revealTargets(el) : [];
    // Sinaliza "conteúdo entrando" até a cascata terminar — o FLIP de formato
    // espera esse tempo antes de disparar.
    const busy = Math.max(dur, leaves.length ? dur * 0.2 + 0.7 : 0) + 0.15;
    contentBusyUntil = nowMs() + busy * 1000;
    if (leaves.length) {
      // Estado inicial já aplicado (contêiner visível, conteúdo escondido) —
      // sem flash. A animação só dispara depois do paint.
      GSAP.set(el, Object.assign({ opacity: 1 }, move));
      GSAP.set(leaves, { opacity: 0, yPercent: 7 });
      afterPaint(function () {
        GSAP.to(el, { scale: 1, xPercent: 0, yPercent: 0, duration: dur, ease: EASE_IN, clearProps: 'transform' });
        GSAP.to(leaves, { opacity: 1, yPercent: 0, duration: 0.7, stagger: 0.05, delay: dur * 0.2, ease: EASE_IN, clearProps: 'opacity,transform' });
      });
    } else {
      GSAP.set(el, Object.assign({ opacity: 0 }, move));
      afterPaint(function () {
        GSAP.to(el, { opacity: 1, scale: 1, xPercent: 0, yPercent: 0, duration: dur, ease: EASE_IN, clearProps: 'transform' });
      });
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
    // Saída em crossfade puro (só opacidade) — o mais suave possível, sem
    // brigar com a entrada do próximo slide.
    GSAP.to(prev.el, { opacity: 0, duration: 0.7, ease: 'sine.inOut', onComplete: () => prev.el.remove() });
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
    /*
     * Som: a TV conta o que está tocando sempre que muda, e também de tempos
     * em tempos — o estado do servidor é em memória e precisa ser reposto
     * depois de um restart, sem esperar a próxima faixa terminar.
     */
    const contarSom = () => MTCloud.reportAudio(dev.id, trilha.estado());
    document.addEventListener('mt:som-estado', contarSom);
    setInterval(contarSom, 30000);
    contarSom();
    // Telemetria: pulsa "estou viva" já e a cada 30s → status real da frota.
    MTCloud.heartbeat(dev.id);
    setInterval(function () { MTCloud.heartbeat(dev.id); }, 30000);
    // Relação de aniversariantes: carrega e refresca a cada 6h (muda pouco).
    loadBirthdays(dev.id);
    setInterval(function () { loadBirthdays(dev.id); }, 6 * 60 * 60 * 1000);
  }

  // Busca a relação de aniversariantes e a expõe (global.MT_BIRTHDAYS) para o
  // renderizador automático. Cacheia em localStorage — sobrevive a quedas de rede.
  function loadBirthdays(id) {
    try {
      const cached = localStorage.getItem('mt.birthdays') || localStorage.getItem('vistra.birthdays');
      if (cached && !global.MT_BIRTHDAYS) global.MT_BIRTHDAYS = JSON.parse(cached);
    } catch (e) {}
    if (!global.MTCloud || !MTCloud.fetchBirthdays) return;
    MTCloud.fetchBirthdays(id).then(function (list) {
      global.MT_BIRTHDAYS = list || [];
      try { localStorage.setItem('mt.birthdays', JSON.stringify(global.MT_BIRTHDAYS)); } catch (e) {}
    }).catch(function () { /* offline: mantém o cache */ });
  }

  /* ---------------- Pareamento (modo nuvem) ---------------- */
  function showPairing(code) {
    let el = document.getElementById('pairing');
    if (!el) return;
    const codeEl = el.querySelector('.mt-pairing-code');
    if (codeEl) codeEl.textContent = code || '••••••';
    // "Gerar outro código": esquece a TV guardada neste navegador e recarrega
    // como tela nova (o navegador reaproveitava a mesma sem isso).
    const resetEl = document.getElementById('pairing-reset');
    if (resetEl && !resetEl._wired) {
      resetEl._wired = true;
      resetEl.addEventListener('click', function () {
        if (global.MTCloud && MTCloud.resetDevice) MTCloud.resetDevice();
        const u = new URL(global.location.href);
        u.searchParams.set('cloud', '1');
        u.searchParams.set('new', '1');
        global.location.replace(u.toString());
      });
    }
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
    // A trilha vem de settings e não das zonas: trocar de layout não pode
    // cortar a música no meio.
    trilha.aplicar((cfg.settings || {}).audio);
    precacheMedia(cfg); // baixa a mídia da playlist p/ tocar offline depois
  }

  /* ---------------- Resiliência offline ---------------- */
  const CFG_CACHE_KEY = 'mt.lastConfig';
  const CFG_CACHE_LEGACY = 'vistra.lastConfig'; // cache da marca antiga
  function saveCachedConfig(cfg) {
    try { localStorage.setItem(CFG_CACHE_KEY, JSON.stringify(cfg)); } catch (e) {}
  }
  function loadCachedConfig() {
    try {
      const r = localStorage.getItem(CFG_CACHE_KEY) || localStorage.getItem(CFG_CACHE_LEGACY);
      return r ? JSON.parse(r) : null;
    } catch (e) { return null; }
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
      // Se um slide está entrando, adia o FLIP até o conteúdo assentar — evita
      // que os dois sistemas animem a mesma opacidade ao mesmo tempo.
      const busy = contentBusyUntil - nowMs();
      if (busy > 0) { setTimeout(() => animateArrangement(a), busy + 90); return; }
      const zones = Array.prototype.slice.call(stage.querySelectorAll('.mt-zone'));
      const first = zones.map((z) => z.getBoundingClientRect());
      setGrid(a); // aplica o layout final (instantâneo)
      const dur = 1100;
      let moved = false;
      zones.forEach((z, i) => {
        const last = z.getBoundingClientRect();
        const f = first[i];
        const dx = f.left - last.left, dy = f.top - last.top;
        const sx = last.width ? f.width / last.width : 1;
        const sy = last.height ? f.height / last.height : 1;
        if (Math.abs(dx) < 1 && Math.abs(dy) < 1 && Math.abs(sx - 1) < 0.01 && Math.abs(sy - 1) < 0.01) return;
        moved = true;
        z.style.transformOrigin = 'top left';
        z.style.transition = 'none';
        z.style.willChange = 'transform';
        z.style.transform = 'translate(' + dx + 'px,' + dy + 'px) scale(' + sx + ',' + sy + ')';
      });
      // O bloco desliza no compositor (fluido), mas o TEXTO dentro dele usa
      // container-query (cqh/cqw): reencaixa bruscamente quando o tamanho muda.
      // Reflow de texto não anima. Além disso, no fim do FLIP o navegador
      // desmonta a camada de GPU e o texto re-rasteriza nítido de uma vez ("pop").
      // Solução: o conteúdo some (fade) durante TODO o movimento + assentamento e
      // só reaparece DEPOIS que a camada foi desmontada — o pop fica escondido.
      const settle = dur / 1000;
      // Bloqueia trocas de conteúdo enquanto o formato muda + o conteúdo reaparece.
      if (moved) formatBusyUntil = nowMs() + (settle + 0.14 + 0.5) * 1000;
      const slides = moved ? stage.querySelectorAll('.mt-zone .mt-slide') : [];
      if (HAS_GSAP && slides.length) {
        GSAP.killTweensOf(slides);
        GSAP.to(slides, { opacity: 0.16, duration: 0.3, ease: 'sine.out' });
        GSAP.to(slides, { opacity: 1, duration: 0.5, delay: settle + 0.14, ease: 'sine.inOut' });
      }
      requestAnimationFrame(() => {
        zones.forEach((z) => {
          if (!z.style.transform) return;
          z.style.transition = 'transform ' + dur + 'ms cubic-bezier(.22,.61,.36,1)';
          z.style.transform = '';
        });
        // Limpa transição/origem mas MANTÉM will-change: as zonas ficam sempre
        // promovidas (são poucas), evitando o promove/desmonta a cada ciclo — que
        // é justamente o que causava o tranco no fim.
        setTimeout(() => zones.forEach((z) => { z.style.transition = ''; z.style.transformOrigin = ''; }), dur + 60);
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
      // Compatibilidade: "respiro" só de colunas. Antes animava grid-template via
      // CSS — isso reflowa as fontes (cqh/cqw) a cada frame e trava. Agora usa o
      // mesmo FLIP (transform no compositor + fade do conteúdo): fluido.
      stage.classList.remove('mt-stage-breathing');
      const states = layout.dynamic.columns;
      let step = 0;
      const breatheTimer = setInterval(() => {
        step = (step + 1) % states.length;
        animateArrangement({ columns: states[step], rows: layout.grid.rows, areas: layout.grid.areas });
      }, Math.max(6, layout.dynamic.intervalSeconds || 18) * 1000);
      zoneControllers.push({ stop: () => clearInterval(breatheTimer) });
    } else {
      stage.classList.remove('mt-stage-breathing');
    }

    // Tema premium: aplica todos os design tokens (cores, vidro, sombras,
    // fonte). Retrocompatível — configs antigas já foram migradas no storage.
    const resolved = (global.MTTheme && MTTheme.apply(cfg.settings.theme)) || null;
    // Expõe os tokens do tema (hex) para os renderizadores herdarem a paleta —
    // tela coesa em vez de cores fixas espalhadas.
    global.MT_THEME = resolved;
    // Modo performance: desliga efeitos caros (blur/aurora/vidro). Liga com fx
    // baixo OU automaticamente em hardware fraco (TV/stick barato) — evita
    // engasgo nas animações.
    const fx = resolved ? resolved.fx : 0.9;
    const weakHw = (navigator.hardwareConcurrency || 8) <= 2 || (navigator.deviceMemory || 8) <= 2;
    document.documentElement.classList.toggle('mt-perf', fx <= 0.25 || weakHw);

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
  /* ---------------- Trilha sonora ----------------
   *
   * Música de fundo da tela. Vive fora das zonas: atravessa todos os slides e
   * não pertence a nenhum.
   *
   * O ponto difícil não é tocar — é o navegador. Som sem um gesto do usuário é
   * bloqueado, e numa TV pendurada na parede não há ninguém para clicar. Então
   * a trilha nunca finge: quando o `play()` é recusado, ela avisa na tela que
   * falta um toque, e o primeiro toque em qualquer lugar libera tudo.
   */
  function criarTrilha() {
    const el = document.createElement('audio');
    el.preload = 'auto';
    el.crossOrigin = 'anonymous';
    // No documento, mesmo invisível: elemento solto toca na maioria dos
    // navegadores, mas não em todos — e um "na maioria" numa TV de cliente é
    // uma ligação de suporte esperando para acontecer.
    el.style.display = 'none';
    if (document.body) document.body.appendChild(el);
    else document.addEventListener('DOMContentLoaded', () => document.body.appendChild(el));
    let cfg = { ativo: false, faixas: [], volume: 60, aleatorio: false, abaixarComVideo: true };
    let ordem = [];        // índices das faixas na ordem de tocar
    let pos = 0;
    let pausadoPeloAdmin = false;
    let abaixados = 0;     // quantos slides com som estão no ar agora
    let liberado = false;  // o navegador já deixou tocar?
    let avisoEl = null;

    function embaralhar(n) {
      const a = Array.from({ length: n }, (_, i) => i);
      for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const t = a[i]; a[i] = a[j]; a[j] = t;
      }
      return a;
    }
    function volumeAlvo() {
      const base = Math.min(100, Math.max(0, cfg.volume)) / 100;
      // Abaixar em vez de calar: a música continua presente por baixo do vídeo,
      // e a volta é suave em vez de um susto.
      return abaixados > 0 && cfg.abaixarComVideo ? base * 0.15 : base;
    }
    function aplicarVolume() {
      try { el.volume = volumeAlvo(); } catch (e) {}
      global.MT_VIDEO_COM_SOM = !!(liberado && cfg.ativo && cfg.abaixarComVideo);
    }

    function aviso(mostrar) {
      if (mostrar && !avisoEl) {
        avisoEl = document.createElement('div');
        avisoEl.className = 'mt-som-bloqueado';
        avisoEl.textContent = 'Toque na tela para ligar o som';
        document.body.appendChild(avisoEl);
      } else if (!mostrar && avisoEl) {
        avisoEl.remove(); avisoEl = null;
      }
    }

    function tocar() {
      if (!cfg.ativo || pausadoPeloAdmin || !ordem.length) return;
      const faixa = cfg.faixas[ordem[pos % ordem.length]];
      if (!faixa) return;
      if (el.src !== faixa.url && !el.src.endsWith(faixa.url)) el.src = faixa.url;
      aplicarVolume();
      const p = el.play();
      if (p && p.catch) {
        p.then(() => { liberado = true; aviso(false); aplicarVolume(); reportar(); })
         .catch(() => { liberado = false; aviso(true); reportar(); });
      }
    }
    function proxima(passo) {
      if (!ordem.length) return;
      pos = (pos + (passo || 1) + ordem.length) % ordem.length;
      el.src = '';                 // força recarregar mesmo repetindo a faixa
      tocar();
    }
    el.addEventListener('ended', () => proxima(1));
    // Faixa quebrada (arquivo apagado, rede caiu) não pode travar a trilha.
    el.addEventListener('error', () => { if (cfg.ativo && el.src) setTimeout(() => proxima(1), 1500); });

    function reportar() {
      const e = estado();
      try { document.dispatchEvent(new CustomEvent('mt:som-estado', { detail: e })); } catch (err) {}
    }
    function estado() {
      const faixa = ordem.length ? cfg.faixas[ordem[pos % ordem.length]] : null;
      return {
        ativo: !!cfg.ativo,
        tocando: !!(cfg.ativo && !pausadoPeloAdmin && !el.paused),
        pausado: pausadoPeloAdmin,
        bloqueado: !!(cfg.ativo && !pausadoPeloAdmin && !liberado),
        volume: cfg.volume,
        faixa: faixa ? (faixa.nome || faixa.url.split('/').pop()) : '',
        indice: ordem.length ? (pos % ordem.length) : -1,
        total: cfg.faixas.length,
      };
    }

    return {
      aplicar(novo) {
        const antes = JSON.stringify(cfg);
        cfg = Object.assign({ ativo: false, faixas: [], volume: 60, aleatorio: false, abaixarComVideo: true }, novo || {});
        if (!cfg.ativo || !cfg.faixas.length) {
          el.pause(); ordem = []; aviso(false); aplicarVolume(); return reportar();
        }
        const listaMudou = JSON.stringify(cfg.faixas) !== JSON.stringify(JSON.parse(antes).faixas)
          || cfg.aleatorio !== JSON.parse(antes).aleatorio;
        if (listaMudou || !ordem.length) {
          ordem = cfg.aleatorio ? embaralhar(cfg.faixas.length)
            : Array.from({ length: cfg.faixas.length }, (_, i) => i);
          pos = 0;
          el.src = '';
        }
        aplicarVolume();
        // Volume não interrompe: só a lista ou o liga/desliga reiniciam a faixa.
        if (el.paused) tocar();
        reportar();
      },
      /*
       * Acompanha o vídeo de um slide e abaixa a música ENQUANTO ele estiver
       * de fato tocando com som.
       *
       * Decidir pelo tipo do item era mais simples e estava errado: vídeo
       * quebrado, ou vídeo que o navegador recusou tocar com som e caiu para
       * mudo, deixava a música baixa por vários segundos sem nada no lugar.
       * Quem manda é o elemento, não a configuração.
       *
       * Devolve a função de desfazer, para o slide chamar ao sair.
       */
      acompanharVideo(slideEl) {
        const v = slideEl && slideEl.querySelector && slideEl.querySelector('video');
        if (!v || !cfg.ativo || !cfg.abaixarComVideo) return function () {};
        let baixo = false;
        const desce = () => {
          if (baixo || v.muted || v.volume === 0 || v.paused) return;
          baixo = true; abaixados++; aplicarVolume();
        };
        const sobe = () => {
          if (!baixo) return;
          baixo = false; abaixados = Math.max(0, abaixados - 1); aplicarVolume();
        };
        v.addEventListener('playing', desce);
        ['pause', 'ended', 'error', 'emptied', 'stalled'].forEach((e) => v.addEventListener(e, sobe));
        // O próprio player cala o vídeo quando o navegador recusa tocar com
        // som — sem isto, a música ficaria baixa por educação a um silêncio.
        v.addEventListener('volumechange', () => { if (v.muted || v.volume === 0) sobe(); else desce(); });
        return sobe;
      },
      liberar() {
        if (!cfg.ativo || liberado) return;
        tocar();
      },
      comando(c) {
        const acao = c && c.acao;
        if (acao === 'pausar') { pausadoPeloAdmin = true; el.pause(); }
        else if (acao === 'tocar') { pausadoPeloAdmin = false; tocar(); }
        else if (acao === 'proxima') { pausadoPeloAdmin = false; proxima(1); }
        else if (acao === 'anterior') { pausadoPeloAdmin = false; proxima(-1); }
        else if (acao === 'volume') {
          const v = Number(c.valor);
          if (Number.isFinite(v)) { cfg.volume = Math.min(100, Math.max(0, Math.round(v))); aplicarVolume(); }
        }
        reportar();
      },
      estado,
    };
  }
  const trilha = criarTrilha();

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

  /* ---------------- Pré-carga da próxima mídia ---------------- */

  /*
   * Sem isto a TV pisca preto na troca: o <img> só entra no ar depois de baixar
   * E decodificar, e as duas coisas acontecem depois do slide já estar visível.
   * Aqui a próxima mídia é baixada e decodificada enquanto a atual ainda toca,
   * então a troca só encontra bytes prontos.
   *
   * O cache é global (as zonas dividem mídia), pequeno e por URL — numa TV
   * barata segurar imagem demais custa mais caro que baixar de novo.
   */
  var PRELOAD_MAX = 12;
  var precarregado = new Map(); // url -> Image | HTMLVideoElement

  function lembrar(url, el) {
    precarregado.delete(url);
    precarregado.set(url, el);
    while (precarregado.size > PRELOAD_MAX) {
      var velha = precarregado.keys().next().value;
      var alvo = precarregado.get(velha);
      // Solta o buffer do vídeo explicitamente; imagem o GC resolve sozinho.
      if (alvo && alvo.tagName === 'VIDEO') { try { alvo.src = ''; alvo.load(); } catch (e) {} }
      precarregado.delete(velha);
    }
  }

  // URLs de imagem que o item precisa ter em mãos para desenhar o primeiro quadro.
  function imagensDoItem(item) {
    if (!item) return [];
    var urls = [];
    // Os tipos do render são em inglês ('image'), não 'imagem'.
    if (item.type === 'image' && item.src) urls.push(item.src);
    if (item.imagem) urls.push(item.imagem);
    if (item.foto) urls.push(item.foto);
    if (item.type === 'composicao') {
      if (item.bg && item.bg.kind === 'imagem' && item.bg.src) urls.push(item.bg.src);
      (Array.isArray(item.elementos) ? item.elementos : []).forEach(function (e) {
        if (e && e.tipo === 'imagem' && e.src) urls.push(e.src);
      });
    }
    return urls.filter(function (u, i, a) { return u && a.indexOf(u) === i; });
  }

  function precarregar(item) {
    if (!item) return;
    imagensDoItem(item).forEach(function (url) {
      if (precarregado.has(url)) return;
      var img = new Image();
      img.decoding = 'async';
      img.src = url;
      lembrar(url, img);
      // decode() é o que evita o engasgo: sem ele a decodificação acontece no
      // primeiro paint do slide, já com o elemento na tela.
      if (img.decode) img.decode().catch(function () {});
    });
    /*
     * Vídeo entra em buffer só do próximo item, e nunca em modo performance:
     * segurar dois vídeos na memória de uma TV de entrada trava mais do que a
     * tela preta que estamos tentando evitar.
     */
    if (item.type === 'video' && item.src && !precarregado.has(item.src)
        && !document.documentElement.classList.contains('mt-perf')) {
      var v = document.createElement('video');
      v.preload = 'auto';
      v.muted = true;
      v.src = item.src;
      lembrar(item.src, v);
      try { v.load(); } catch (e) {}
    }
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

      // Se um FLIP de formato está rolando, não troca conteúdo em cima dele —
      // as duas animações brigariam pela opacidade. Espera assentar e tenta de novo.
      const wait = formatBusyUntil - nowMs();
      if (wait > 0) return schedule(wait / 1000 + 0.08);

      // Filtra pelos conteúdos agendados para agora.
      const ativos = agendado ? items.filter(agendadoAgora) : items;
      if (!ativos.length) {
        showPlaceholder('Nenhum conteúdo agendado agora');
        return schedule(30); // reavalia periodicamente
      }
      const item = ativos[index % ativos.length];
      index++;

      /*
       * Aquece a próxima enquanto esta ainda está no ar. Feito ANTES de
       * renderizar de propósito: se o render travar, o próximo já foi pedido.
       */
      if (ativos.length > 1) { try { precarregar(ativos[index % ativos.length]); } catch (e) {} }

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
      /*
       * Vídeo com som no ar: a música cai para um fundo baixo e volta quando
       * ele para. O desfazer fica amarrado ao onLeave do próprio slide, então
       * nenhum caminho de saída (avanço, takeover, troca de layout) deixa a
       * trilha abaixada para sempre.
       */
      const soltarSom = trilha.acompanharVideo(rendered.el);
      const sairOriginal = rendered.onLeave;
      currentSlide = {
        el: rendered.el,
        onLeave: function () {
          soltarSom();
          if (sairOriginal) sairOriginal();
        },
      };

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
    pintarRodape(zoneEl, data, cfg);
    if (modo === 'rolagem') return startScrollTicker(zoneEl, messages, data);
    return startNewsTicker(zoneEl, messages, data);
  }

  /*
   * Cores do rodapé. Por padrão ele herda o tema — é o certo, e é o que faz a
   * tela parecer uma coisa só. Mas o rodapé é a faixa que mais gente quer
   * destacar (é onde está o nome da empresa), então dá para fixar cores.
   *
   * As variáveis são definidas NA ZONA, não no :root: o CSS já lê --accent e
   * --text, então sobrescrevê-las aqui repinta o rodapé inteiro sem uma linha
   * de CSS nova e sem afetar o resto da tela.
   */
  function pintarRodape(zoneEl, data, cfg) {
    const modoCor = data.cores || 'tema';
    if (modoCor === 'tema') return;

    let fundo = data.fundo, texto = data.corTexto, destaque = data.corDestaque;

    // "marca": puxa do tema já aplicado, para o rodapé acompanhar a identidade
    // sem o usuário reescrever as cores em dois lugares.
    if (modoCor === 'marca') {
      const raiz = getComputedStyle(document.documentElement);
      const marca = (raiz.getPropertyValue('--brand') || '').trim();
      if (marca && global.MTTheme) {
        fundo = marca;
        texto = MTTheme.textoSobre(marca, marca);
        destaque = MTTheme.acentoSobre(marca, marca);
      }
    }

    if (fundo) {
      zoneEl.style.background = fundo;
      // Fundo sólido no rodapé briga com o vidro da zona; sem isto a cor
      // escolhida sai lavada pela superfície translúcida por baixo.
      zoneEl.style.backdropFilter = 'none';
      zoneEl.style.setProperty('--surface', 'transparent');
      /*
       * Se o usuário escolheu o fundo mas não o texto, calculamos por contraste
       * em vez de deixar herdar: fundo claro com o texto claro do tema é o
       * jeito mais fácil de tornar o rodapé ilegível sem perceber.
       */
      if (!texto && global.MTTheme) texto = MTTheme.textoSobre(fundo, fundo);
      if (!destaque && global.MTTheme) destaque = MTTheme.acentoSobre(fundo, fundo);
    }
    if (texto) {
      zoneEl.style.setProperty('--text', texto);
      zoneEl.style.setProperty('--text-dim', global.MTTheme && fundo
        ? MTTheme.mix(texto, fundo, 0.35) : texto);
    }
    if (destaque) zoneEl.style.setProperty('--accent', destaque);
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

    // Selo e relógio são opcionais: numa faixa fina os dois roubam a altura da
    // manchete, que é o que a pessoa realmente precisa ler.
    const mostrarSelo = data.mostrarSelo !== false;
    const mostrarRelogio = data.mostrarRelogio !== false;

    const topline = document.createElement('div');
    topline.className = 'mt-news-topline';
    const tag = document.createElement('div');
    tag.className = 'mt-news-tag';
    tag.textContent = data.titulo || 'ÚLTIMAS NOTÍCIAS';
    const clock = document.createElement('div');
    clock.className = 'mt-news-clock';
    clock.innerHTML = '<span class="nc-date"></span><span class="nc-sep"></span><span class="nc-time"></span>';
    if (mostrarSelo) topline.appendChild(tag);
    if (mostrarRelogio) topline.appendChild(clock);

    const headline = document.createElement('div');
    headline.className = 'mt-news-headline';
    const title = document.createElement('div');
    title.className = 'mt-news-title';
    const desc = document.createElement('div');
    desc.className = 'mt-news-desc';
    headline.appendChild(title);
    headline.appendChild(desc);

    // Nenhum dos dois ligado: a linha some e a manchete ganha a altura inteira.
    if (mostrarSelo || mostrarRelogio) content.appendChild(topline);
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
    const clockTimer = mostrarRelogio ? setInterval(tick, 1000) : null;

    /*
     * Rolagem de manchete longa.
     *
     * Antes o texto que não cabia era cortado com reticências — a pessoa lia
     * "Prefeitura anuncia novo horário de funcionamento do…" e nunca sabia o
     * resto. Aqui medimos: se o texto passa da caixa, ele desliza até o fim e
     * volta. Se cabe, fica parado, porque texto curto rolando é só distração.
     *
     * Duas opções, porque só existem duas: 'auto' (rola o que não cabe) e
     * 'nunca' (mantém as reticências). Um modo "sempre" seria mentira — texto
     * que já cabe não tem para onde ir.
     */
    const modoRolagem = data.rolagem === 'nunca' ? 'nunca' : 'auto';
    const velocidadeRolagem = Math.max(20, Number(data.velocidadeTexto) || 70); // px/s

    function ajustarRolagem(el) {
      el.classList.remove('mt-news-roll');
      el.style.removeProperty('--roll-dist');
      el.style.removeProperty('--roll-dur');
      if (modoRolagem === 'nunca') return;
      // scrollWidth só passa de clientWidth quando o texto realmente não cabe.
      const excesso = el.scrollWidth - el.clientWidth;
      if (excesso <= 2) return;
      el.style.setProperty('--roll-dist', '-' + excesso + 'px');
      // Duração proporcional à distância: manchete longa não fica mais rápida
      // só por ser longa, senão vira ilegível justamente quando importa.
      el.style.setProperty('--roll-dur', (excesso / velocidadeRolagem + 3).toFixed(1) + 's');
      el.classList.add('mt-news-roll');
    }

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
      /*
       * A medição precisa acontecer DEPOIS do layout, senão scrollWidth ainda
       * reflete o texto anterior. Um quadro basta.
       */
      requestAnimationFrame(() => { ajustarRolagem(title); ajustarRolagem(desc); });
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

    // A TV pode mudar de layout (a zona muda de largura): o que cabia deixa de
    // caber. Sem isto a rolagem só acertaria no primeiro desenho.
    const ro = typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(() => { ajustarRolagem(title); ajustarRolagem(desc); })
      : null;
    if (ro) ro.observe(zoneEl);

    return {
      stop: () => {
        clockTimer && clearInterval(clockTimer);
        clearInterval(rotateTimer);
        feedTimer && clearInterval(feedTimer);
        ro && ro.disconnect();
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
    // O mesmo gesto libera a trilha: o navegador só deixa tocar depois dele.
    ['click', 'touchstart', 'keydown'].forEach((ev) =>
      document.addEventListener(ev, () => trilha.liberar(), { passive: true }));
    // Comando ao vivo do painel (chega por SSE, ver js/cloud.js).
    document.addEventListener('mt:som', (e) => trilha.comando((e && e.detail) || {}));
  }

  enableFullscreenShortcut();
  boot();
})(window);
