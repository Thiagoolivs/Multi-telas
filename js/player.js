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

  /* ---------------- Ciclo de vida ---------------- */

  async function boot() {
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

  function buildStage(cfg) {
    const layout = MT_getLayout(cfg.settings.layoutId);
    stage.style.gridTemplateColumns = layout.grid.columns;
    stage.style.gridTemplateRows = layout.grid.rows;
    stage.style.gridTemplateAreas = layout.grid.areas
      .map((row) => '"' + row + '"')
      .join(' ');

    // Layouts "dinâmicos": o grid respira entre proporções ao longo do
    // tempo. Só o tamanho das zonas muda — o DOM de cada zona (vídeo,
    // iframe da live etc.) nunca é recriado, então nada reinicia.
    stage.classList.toggle('mt-stage-breathing', !!layout.dynamic);
    if (layout.dynamic) {
      const states = layout.dynamic.columns;
      let step = 0;
      const breatheTimer = setInterval(() => {
        step = (step + 1) % states.length;
        stage.style.gridTemplateColumns = states[step];
      }, Math.max(6, layout.dynamic.intervalSeconds || 18) * 1000);
      zoneControllers.push({ stop: () => clearInterval(breatheTimer) });
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

    layout.zones.forEach((zone, i) => {
      const zoneEl = document.createElement('div');
      zoneEl.className = 'mt-zone mt-zone-' + zone.type;
      zoneEl.style.gridArea = zone.area;
      // Entrada suave e escalonada das zonas ao montar o palco.
      zoneEl.style.animation = 'mt-zone-in .8s cubic-bezier(.16,.84,.3,1) both';
      zoneEl.style.animationDelay = (i * 0.09) + 's';
      stage.appendChild(zoneEl);

      const data = cfg.zonas[zone.id] || {};
      if (zone.type === 'ticker') {
        zoneControllers.push(startTicker(zoneEl, data, cfg));
      } else if (zone.type === 'header') {
        zoneControllers.push(startHeader(zoneEl, cfg));
      } else {
        zoneControllers.push(startPlaylist(zoneEl, data.items || [], cfg));
      }
    });
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
      rendered.el.classList.add('mt-enter', 'mt-trans-' + transition);
      zoneEl.appendChild(rendered.el);
      // Força reflow para animar a entrada.
      void rendered.el.offsetWidth;
      rendered.el.classList.add('mt-active');

      const prev = currentSlide;
      currentSlide = { el: rendered.el, onLeave: rendered.onLeave };

      if (prev) {
        prev.el.classList.remove('mt-active');
        prev.el.classList.add('mt-leave');
        try { prev.onLeave && prev.onLeave(); } catch (e) {}
        setTimeout(() => prev.el.remove(), 800);
      }

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
      if (prev) {
        prev.el.classList.remove('mt-active');
        prev.el.classList.add('mt-leave');
        try { prev.onLeave && prev.onLeave(); } catch (e) {}
        setTimeout(() => prev.el.remove(), 800);
      }
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
    const usingFeed = data.fonte && data.fonte !== 'manual';

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
        const src = data.fonte === 'custom' ? (data.rssUrl || '').trim() : data.fonte;
        const feed = await MTNews.fetchFeed(src, data.quantidade || 10);
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
