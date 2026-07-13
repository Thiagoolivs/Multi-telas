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

  // Clareia uma cor hex (#rrggbb) somando "amt" a cada canal.
  function lighten(hex, amt) {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
    if (!m) return hex;
    const n = parseInt(m[1], 16);
    const r = Math.min(255, (n >> 16) + amt);
    const g = Math.min(255, ((n >> 8) & 255) + amt);
    const b = Math.min(255, (n & 255) + amt);
    return '#' + ((r << 16) | (g << 8) | b).toString(16).padStart(6, '0');
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
    stage.innerHTML = '';
  }

  function buildStage(cfg) {
    const layout = MT_getLayout(cfg.settings.layoutId);
    stage.style.gridTemplateColumns = layout.grid.columns;
    stage.style.gridTemplateRows = layout.grid.rows;
    stage.style.gridTemplateAreas = layout.grid.areas
      .map((row) => '"' + row + '"')
      .join(' ');

    // Cores do tema: destaque + fundo (com tom de zona derivado do fundo).
    const root = document.documentElement;
    root.style.setProperty('--brand', cfg.settings.cor || '#4B5320');
    const fundo = cfg.settings.fundo || '#0a1128';
    root.style.setProperty('--stage-bg', fundo);
    root.style.setProperty('--zone-bg', lighten(fundo, 14));
    root.style.setProperty('--zone-bg-2', lighten(fundo, 26));
    stage.style.background =
      'radial-gradient(130% 130% at 15% 0%, ' + lighten(fundo, 18) + ' 0%, ' + fundo + ' 55%)';

    layout.zones.forEach((zone) => {
      const zoneEl = document.createElement('div');
      zoneEl.className = 'mt-zone mt-zone-' + zone.type;
      zoneEl.style.gridArea = zone.area;
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

  /* ---------------- Zona: Playlist rotativa ---------------- */

  function startPlaylist(zoneEl, items, cfg) {
    let index = 0;
    let timer = null;
    let currentSlide = null;
    let stopped = false;
    // Zona com um único item fica estática (essencial para lives do YouTube:
    // re-renderizar recarregaria a transmissão).
    const single = items.length === 1;

    if (!items.length) {
      const empty = document.createElement('div');
      empty.className = 'mt-slide mt-empty';
      empty.textContent = 'Sem conteúdo';
      zoneEl.appendChild(empty);
      return { stop: () => {} };
    }

    function advance() {
      if (stopped) return;
      const item = items[index % items.length];
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

      const dur = rendered.duration;
      if (single) return; // estática — só o próprio item avança (ex.: vídeo ao terminar)
      if (dur && dur > 0) schedule(dur);
      else if (!rendered.onEnter) schedule(10); // fallback de segurança
    }

    function schedule(seconds) {
      clearTimeout(timer);
      timer = setTimeout(advance, Math.max(0, seconds) * 1000);
    }

    advance();
    return {
      stop: () => { stopped = true; clearTimeout(timer); },
    };
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

    const badge = document.createElement('div');
    badge.className = 'mt-news-badge';
    badge.innerHTML =
      '<span class="nb-day"></span><span class="nb-mon"></span><span class="nb-time"></span>';
    zoneEl.appendChild(badge);

    const content = document.createElement('div');
    content.className = 'mt-news-content';
    const tag = document.createElement('div');
    tag.className = 'mt-news-tag';
    tag.textContent = data.titulo || 'ÚLTIMAS NOTÍCIAS';
    const headline = document.createElement('div');
    headline.className = 'mt-news-headline';
    const title = document.createElement('div');
    title.className = 'mt-news-title';
    const desc = document.createElement('div');
    desc.className = 'mt-news-desc';
    headline.appendChild(title);
    headline.appendChild(desc);
    content.appendChild(tag);
    content.appendChild(headline);
    zoneEl.appendChild(content);

    // Relógio ao vivo (com segundos), como numa emissora.
    const MESES = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ'];
    function tick() {
      const now = new Date();
      badge.querySelector('.nb-day').textContent = String(now.getDate()).padStart(2, '0');
      badge.querySelector('.nb-mon').textContent = MESES[now.getMonth()] + '.';
      badge.querySelector('.nb-time').textContent = now.toLocaleTimeString('pt-BR');
    }
    tick();
    const clockTimer = setInterval(tick, 1000);

    // Rotação das manchetes.
    let idx = 0;
    let rotateTimer = null;
    function show() {
      if (!messages.length) {
        title.textContent = 'Adicione notícias no painel de gestão';
        desc.textContent = '';
        return;
      }
      const raw = messages[idx % messages.length];
      idx++;
      const parts = raw.split('::');
      headline.classList.remove('mt-news-in');
      void headline.offsetWidth; // reinicia a animação
      headline.classList.add('mt-news-in');
      title.textContent = parts[0].trim();
      desc.textContent = (parts[1] || '').trim();
    }
    show();
    if (messages.length > 1) {
      rotateTimer = setInterval(show, Math.max(3, data.intervalo || 8) * 1000);
    }

    return {
      stop: () => { clearInterval(clockTimer); rotateTimer && clearInterval(rotateTimer); },
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
  }

  enableFullscreenShortcut();
  boot();
})(window);
