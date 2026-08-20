/*
 * render.js
 * Transforma um "item" de conteúdo num elemento de DOM para o player.
 * Cada renderizador retorna { el, duration, onEnter?, onLeave? }.
 * Tudo é embrulhado em try/catch pelo player para nunca travar a tela.
 */
(function (global) {
  'use strict';

  function div(cls) {
    const d = document.createElement('div');
    if (cls) d.className = cls;
    return d;
  }

  // Cor do tema atual (hex resolvido por theme.js). Deixa o conteúdo herdar a
  // paleta do tema quando o item não define a sua — tela coesa, não remendada.
  function themeColor(key, fallback) {
    const t = global.MT_THEME;
    return (t && t[key]) || fallback;
  }

  /* ---------- Geocodificação + clima (Open-Meteo, sem chave/API key) ---------- */
  const geoCache = {};
  async function geocode(nome) {
    const key = (nome || '').trim().toLowerCase();
    if (geoCache[key]) return geoCache[key];
    const url =
      'https://geocoding-api.open-meteo.com/v1/search?count=1&language=pt&name=' +
      encodeURIComponent(nome);
    const geo = await (await fetch(url)).json();
    if (!geo.results || !geo.results.length) throw new Error('local não encontrado');
    geoCache[key] = geo.results[0];
    return geoCache[key];
  }

  const weatherCache = {};
  async function fetchWeather(cidade) {
    const key = (cidade || '').toLowerCase();
    const now = Date.now();
    if (weatherCache[key] && now - weatherCache[key].t < 15 * 60 * 1000) {
      return weatherCache[key].data;
    }
    const g = await geocode(cidade);
    const wUrl =
      'https://api.open-meteo.com/v1/forecast?current=temperature_2m,weather_code' +
      '&daily=weather_code,temperature_2m_max,temperature_2m_min&forecast_days=7' +
      '&timezone=auto&latitude=' + g.latitude + '&longitude=' + g.longitude;
    const w = await (await fetch(wUrl)).json();
    const data = {
      nome: g.name,
      regiao: g.admin1 || '',
      temp: Math.round(w.current.temperature_2m),
      code: w.current.weather_code,
      daily: w.daily || null,
    };
    weatherCache[key] = { t: now, data };
    return data;
  }

  /* Ícones de clima em SVG (traço fino, estética profissional) */
  const WEATHER_SVG = {
    sun: '<circle cx="12" cy="12" r="4.2"/><path d="M12 2.5v2.4M12 19.1v2.4M2.5 12h2.4M19.1 12h2.4M5 5l1.7 1.7M17.3 17.3L19 19M19 5l-1.7 1.7M6.7 17.3L5 19"/>',
    partly: '<circle cx="9" cy="9" r="3.4"/><path d="M9 2.8v1.8M2.8 9h1.8M4.6 4.6L5.9 5.9M13.4 4.6l-1.3 1.3M17.2 20a3.8 3.8 0 0 0 0-7.6 5.4 5.4 0 0 0-10.4 1.5A3.2 3.2 0 0 0 8 20z"/>',
    cloud: '<path d="M17.2 19a4 4 0 0 0 0-8 6 6 0 0 0-11.6 1.7A3.5 3.5 0 0 0 6.5 19z"/>',
    fog: '<path d="M17.2 13a4 4 0 0 0 0-8 6 6 0 0 0-11.6 1.7A3.5 3.5 0 0 0 6.5 13z"/><path d="M5 17h14M7 20.5h10"/>',
    rain: '<path d="M17.2 15a4 4 0 0 0 0-8 6 6 0 0 0-11.6 1.7A3.5 3.5 0 0 0 6.5 15z"/><path d="M8 17.5l-1 3M12.5 17.5l-1 3M17 17.5l-1 3"/>',
    storm: '<path d="M17.2 14a4 4 0 0 0 0-8 6 6 0 0 0-11.6 1.7A3.5 3.5 0 0 0 6.5 14z"/><path d="M12.5 13.5l-2.5 4h3l-2.5 4"/>',
    snow: '<path d="M17.2 14a4 4 0 0 0 0-8 6 6 0 0 0-11.6 1.7A3.5 3.5 0 0 0 6.5 14z"/><path d="M8 17.5v.01M12 19.5v.01M16 17.5v.01M10 21v.01M14 21v.01"/>',
  };
  function weatherGroup(code) {
    if (code === 0) return 'sun';
    if (code <= 2) return 'partly';
    if (code === 3) return 'cloud';
    if (code <= 48) return 'fog';
    if (code <= 67) return 'rain';
    if (code <= 77) return 'snow';
    if (code <= 82) return 'rain';
    return 'storm';
  }
  function weatherSvg(code, cls) {
    return '<svg class="' + (cls || '') + '" viewBox="0 0 24 24" fill="none" ' +
      'stroke="currentColor" stroke-width="1.4" stroke-linecap="round" ' +
      'stroke-linejoin="round">' + WEATHER_SVG[weatherGroup(code)] + '</svg>';
  }
  const WEATHER_LABEL = {
    0: 'Céu limpo', 1: 'Predomínio de sol', 2: 'Parcialmente nublado', 3: 'Nublado',
    45: 'Nevoeiro', 48: 'Nevoeiro', 51: 'Garoa', 53: 'Garoa', 55: 'Garoa intensa',
    56: 'Garoa gelada', 57: 'Garoa gelada', 61: 'Chuva fraca', 63: 'Chuva',
    65: 'Chuva forte', 66: 'Chuva gelada', 67: 'Chuva gelada', 71: 'Neve fraca',
    73: 'Neve', 75: 'Neve intensa', 77: 'Granizo', 80: 'Pancadas de chuva',
    81: 'Chuva', 82: 'Chuva forte', 85: 'Neve', 86: 'Neve intensa',
    95: 'Tempestade', 96: 'Tempestade com granizo', 99: 'Tempestade com granizo',
  };
  function weatherLabel(code) {
    return WEATHER_LABEL[code] || 'Tempo';
  }
  function weatherIcon(code) {
    // Compatibilidade com o widget simples (emoji).
    const map = { sun: '☀️', partly: '⛅', cloud: '☁️', fog: '🌫️', rain: '🌧️', snow: '🌨️', storm: '⛈️' };
    return map[weatherGroup(code)] || '🌡️';
  }

  const DIAS_SEMANA = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];
  const DIAS_ABREV = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
  const MESES_ABREV = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
  function fmtDataLonga(d) {
    return DIAS_SEMANA[d.getDay()] + ' | ' + d.getDate() + ' ' + MESES_ABREV[d.getMonth()] + '.';
  }

  /* ---------- Renderizadores por tipo ---------- */
  const RENDERERS = {
    text: renderText,
    notice: renderText,
    announce: renderAnnounce,
    image: renderImage,
    video: renderVideo,
    youtube: renderYouTube,
    livesource: renderLiveSource,
    screen: renderScreen,
    stream: renderStream,
    holyrics: renderHolyrics,
    birthday: renderBirthday,
    birthdaycard: renderBirthdayCard,
    birthdayauto: renderBirthdayAuto,
    clock: renderClock,
    weather: renderWeather,
    weatherpro: renderWeatherPro,
    traffic: renderTraffic,
    map: renderMap,
    quote: renderQuote,
    spotlight: renderSpotlight,
    agenda: renderAgenda,
    kpi: renderKpi,
    promo: renderPromo,
    social: renderSocial,
    poster: renderPoster,
    composicao: renderComposicao,
    pptx: renderPptx,
    web: renderWeb,
    qrcode: renderQr,
    mural: renderMural,
  };

  function renderText(item) {
    const el = div('mt-slide mt-text');
    // Sem cor de fundo manual → herda a superfície adaptativa do tema.
    if (item.bg) {
      el.style.background = item.bg;
      el.style.color = item.cor || '#ffffff';
    } else {
      el.classList.add('mt-surface');
      if (item.cor) el.style.color = item.cor;
    }
    el.style.textAlign = item.align || 'center';
    const scale = { pequeno: 0.82, medio: 1, grande: 1.22, gigante: 1.48 }[item.tamanho];
    if (scale && scale !== 1) el.style.setProperty('--tscale', scale);
    const inner = div('mt-text-inner');
    if (item.titulo) {
      const h = div('mt-text-title');
      h.textContent = item.titulo;
      inner.appendChild(h);
    }
    if (item.corpo) {
      const p = div('mt-text-body');
      p.textContent = item.corpo;
      inner.appendChild(p);
    }
    el.appendChild(inner);
    return { el, duration: item.duracao || 10 };
  }

  function renderImage(item) {
    const el = div('mt-slide mt-image');
    const img = document.createElement('img');
    img.style.objectFit = item.fit || 'cover';
    img.alt = '';
    img.src = item.src;
    img.onerror = function () {
      el.classList.add('mt-broken');
      el.textContent = 'Imagem indisponível';
    };
    el.appendChild(img);

    // Cores adaptativas: ao exibir, o tema desloca o destaque para combinar
    // com a imagem; ao sair, restaura. Só atua se ligado nas configurações.
    let adapted = false;
    function tryAdapt() {
      if (!adapted && global.MTAdaptive && MTAdaptive.enabled && img.naturalWidth) {
        adapted = MTAdaptive.adaptTo(img);
      }
    }
    return {
      el,
      duration: item.duracao || 8,
      onEnter: function () { img.complete ? tryAdapt() : (img.onload = tryAdapt); },
      onLeave: function () { if (adapted && global.MTAdaptive) MTAdaptive.restore(); },
    };
  }

  function renderVideo(item) {
    const el = div('mt-slide mt-video');
    const v = document.createElement('video');
    v.src = item.src;
    /*
     * Som do vídeo. O padrão continua MUDO: navegador só deixa tocar sem som
     * sem um gesto do usuário, e uma TV na parede não tem quem clique.
     *
     * A exceção é a trilha sonora estar tocando (MT_VIDEO_COM_SOM), porque aí
     * o gesto já aconteceu e o som já está liberado. Mesmo assim, se o play()
     * for recusado, voltamos ao mudo — vídeo sem som é melhor que tela parada.
     */
    v.muted = item.muted != null ? item.muted !== false : !global.MT_VIDEO_COM_SOM;
    v.autoplay = true;
    v.playsInline = true;
    v.loop = !!item.loop;
    v.style.objectFit = item.fit || 'contain';
    el.appendChild(v);
    // Se não houver duração fixa, avança ao terminar o vídeo.
    let onEnter = function (advance) {
      const tryPlay = () => v.play().catch(() => {
        // Recusado por causa do som: cala e tenta de novo. A tela nunca para.
        if (!v.muted) { v.muted = true; v.play().catch(() => {}); }
      });
      tryPlay();
      if (!item.duracao && !v.loop) {
        v.addEventListener('ended', advance, { once: true });
      }
    };
    return { el, duration: item.duracao || 0, onEnter, onLeave: () => v.pause() };
  }

  function renderYouTube(item) {
    const el = div('mt-slide mt-video');
    const iframe = document.createElement('iframe');
    iframe.allow = 'autoplay; encrypted-media';
    iframe.setAttribute('frameborder', '0');

    if (item.channelId && String(item.channelId).trim()) {
      // Transmissão ao vivo do canal: pega automaticamente a live ativa.
      iframe.src =
        'https://www.youtube.com/embed/live_stream?channel=' +
        encodeURIComponent(String(item.channelId).trim()) +
        '&autoplay=1&mute=1&controls=0&playsinline=1';
    } else {
      const id = extractYouTubeId(item.videoId || item.src || '');
      iframe.src =
        'https://www.youtube.com/embed/' + id +
        '?autoplay=1&mute=1&controls=0&rel=0&modestbranding=1&playsinline=1' +
        (item.loop ? '&loop=1&playlist=' + id : '');
    }
    el.appendChild(iframe);

    // duracao 0 = fica fixo na tela (ideal para lives em tempo real).
    const dur = item.duracao == null ? 20 : Number(item.duracao);
    const result = { el, duration: dur };
    if (dur === 0) result.onEnter = function () { /* permanente */ };
    return result;
  }

  /* ---------- Entrada ao vivo (HDMI via captura USB / webcam) ----------
   * Um captador HDMI→USB (padrão UVC) aparece como "câmera" para o navegador.
   * Exibimos o fluxo ao vivo via getUserMedia. Requer contexto seguro
   * (https/localhost) e permissão de câmera (liberável em modo quiosque). */
  function renderLiveSource(item) {
    const el = div('mt-slide mt-live-source');
    const video = document.createElement('video');
    video.autoplay = true;
    video.muted = item.audio !== true; // só toca áudio se pedido explicitamente
    video.playsInline = true;
    video.style.objectFit = item.fit || 'cover';
    el.appendChild(video);
    const msg = divText('mt-live-msg', 'Conectando à entrada de vídeo…');
    el.appendChild(msg);

    let stream = null, stopped = false, retry = null;
    function stopTracks() {
      if (retry) { clearTimeout(retry); retry = null; }
      if (stream) { stream.getTracks().forEach((t) => t.stop()); stream = null; }
      video.srcObject = null;
    }
    async function start() {
      if (stopped) return;
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        msg.textContent = 'Captura não suportada neste dispositivo'; return;
      }
      try {
        const videoConstraints = item.deviceId
          ? { deviceId: { exact: item.deviceId } } : true;
        const audioConstraints = item.audio === true
          ? (item.audioDeviceId ? { deviceId: { exact: item.audioDeviceId } } : true)
          : false;
        stream = await navigator.mediaDevices.getUserMedia({
          video: videoConstraints, audio: audioConstraints,
        });
        if (stopped) { stopTracks(); return; }
        video.srcObject = stream;
        video.play().catch(() => {});
        msg.style.display = 'none';
      } catch (e) {
        msg.style.display = '';
        msg.textContent = 'Entrada de vídeo indisponível';
        if (!stopped) retry = setTimeout(start, 6000); // reconecta sozinho
      }
    }
    return {
      el,
      duration: item.duracao != null ? Number(item.duracao) : 0, // 0 = fixo na tela
      onEnter: function () { stopped = false; start(); },
      onLeave: function () { stopped = true; stopTracks(); },
    };
  }

  /* ---------- Captura de tela / janela do sistema ----------
   * Exibe uma janela do próprio computador (ex.: Holyrics, slides) via
   * getDisplayMedia. É só imagem (mão única) — não controla o app.
   * getDisplayMedia exige um gesto do usuário. Como o player esconde o
   * cursor, o convite: (a) reexibe o cursor enquanto está na tela, (b) é
   * todo clicável e (c) também inicia pela tecla Enter/Espaço — assim
   * funciona mesmo sem enxergar o mouse. */
  function renderScreen(item) {
    const el = div('mt-slide mt-live-source mt-screen');
    const video = document.createElement('video');
    video.autoplay = true;
    video.muted = item.audio !== true;
    video.playsInline = true;
    video.style.objectFit = item.fit || 'contain';
    el.appendChild(video);

    const overlay = div('mt-screen-overlay');
    const hint = divText('mt-screen-hint',
      'Clique em qualquer lugar (ou tecle Enter) e escolha a janela/tela para exibir aqui');
    const btn = document.createElement('button');
    btn.className = 'mt-screen-start'; btn.type = 'button';
    btn.textContent = 'Iniciar captura';
    overlay.appendChild(hint); overlay.appendChild(btn);
    el.appendChild(overlay);

    let stream = null, stopped = false, starting = false;
    function stopTracks() {
      if (stream) { stream.getTracks().forEach((t) => t.stop()); stream = null; }
      video.srcObject = null;
    }
    function showOverlay(show) {
      overlay.style.display = show ? '' : 'none';
      // Reexibe o cursor do mouse enquanto o convite estiver visível.
      document.body.classList.toggle('mt-cursor-on', !!show);
    }
    async function startCapture() {
      if (starting) return;
      if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
        hint.textContent = 'Captura de tela não suportada neste dispositivo';
        return;
      }
      starting = true;
      try {
        stream = await navigator.mediaDevices.getDisplayMedia({
          video: { frameRate: 30 }, audio: item.audio === true,
        });
        if (stopped) { stopTracks(); return; }
        video.srcObject = stream;
        video.play().catch(() => {});
        showOverlay(false);
        // Se o usuário parar o compartilhamento, reabre o convite.
        const vt = stream.getVideoTracks()[0];
        if (vt) vt.addEventListener('ended', function () {
          stopTracks(); if (!stopped) { hint.textContent = 'Compartilhamento encerrado — clique ou tecle Enter para reabrir'; showOverlay(true); }
        });
      } catch (e) {
        showOverlay(true);
        hint.textContent = 'Captura cancelada — clique ou tecle Enter para tentar novamente';
      } finally {
        starting = false;
      }
    }
    function onKey(e) {
      if (overlay.style.display === 'none') return;
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') {
        e.preventDefault(); startCapture();
      }
    }
    // Clicar em qualquer parte do convite inicia (o botão está dentro dele).
    overlay.addEventListener('click', startCapture);
    return {
      el,
      duration: item.duracao != null ? Number(item.duracao) : 0, // 0 = fixo
      onEnter: function () {
        stopped = false; showOverlay(true);
        document.addEventListener('keydown', onKey);
      },
      onLeave: function () {
        stopped = true; stopTracks();
        document.removeEventListener('keydown', onKey);
        document.body.classList.remove('mt-cursor-on');
      },
    };
  }

  /* ---------- Stream ao vivo (HLS/DASH/IPTV/MP4) ----------
   * Toca uma URL de transmissão num <video>. HLS nativo quando suportado
   * (Safari/algumas Smart TVs); no Chromium, carrega hls.js sob demanda. */
  let hlsLoading = null;
  function ensureHls() {
    if (global.Hls) return Promise.resolve(global.Hls);
    if (hlsLoading) return hlsLoading;
    hlsLoading = new Promise(function (resolve, reject) {
      const s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/hls.js@1/dist/hls.light.min.js';
      s.onload = function () { resolve(global.Hls); };
      s.onerror = function () { reject(new Error('hls.js indisponível')); };
      document.head.appendChild(s);
    });
    return hlsLoading;
  }
  function renderStream(item) {
    const el = div('mt-slide mt-video mt-stream');
    const video = document.createElement('video');
    video.autoplay = true;
    video.muted = item.muted !== false; // por padrão sem som (TVs)
    video.playsInline = true;
    video.controls = false;
    video.style.objectFit = item.fit || 'contain';
    el.appendChild(video);
    const msg = divText('mt-live-msg', 'Conectando ao stream…');
    el.appendChild(msg);

    const url = (item.url || '').trim();
    const tipo = item.tipo || 'auto';
    const isHls = tipo === 'hls' || (tipo === 'auto' && /\.m3u8(\?|$)/i.test(url));
    let hls = null, stopped = false, retry = null;

    function fail(advance) {
      msg.style.display = ''; msg.textContent = 'Stream indisponível';
      if (!stopped && !item.duracao) retry = setTimeout(() => start(advance), 8000);
    }
    function playNative(advance) {
      video.src = url;
      video.play().catch(() => {});
    }
    function start(advance) {
      if (stopped || !url) { if (!url) msg.textContent = 'URL do stream não informada'; return; }
      msg.style.display = '';
      video.oncanplay = function () { msg.style.display = 'none'; };
      video.onerror = function () { fail(advance); };
      if (isHls && !video.canPlayType('application/vnd.apple.mpegurl')) {
        ensureHls().then(function (Hls) {
          if (stopped) return;
          if (Hls && Hls.isSupported()) {
            hls = new Hls({ lowLatencyMode: true });
            hls.on(Hls.Events.ERROR, function (_e, data) { if (data && data.fatal) fail(advance); });
            hls.loadSource(url); hls.attachMedia(video);
          } else { playNative(advance); }
        }).catch(function () { playNative(advance); });
      } else {
        playNative(advance);
      }
      // MP4/progressivo com duração 0 e sem loop: avança ao terminar.
      if (!item.duracao && tipo === 'mp4') {
        video.addEventListener('ended', function () { advance && advance(); }, { once: true });
      }
    }
    return {
      el,
      duration: item.duracao != null ? Number(item.duracao) : 0, // 0 = fixo
      onEnter: function (advance) { stopped = false; start(advance); },
      onLeave: function () {
        stopped = true;
        if (retry) clearTimeout(retry);
        try { video.pause(); } catch (e) {}
        if (hls) { try { hls.destroy(); } catch (e) {} hls = null; }
      },
    };
  }

  /* ---------- Holyrics (letra/slide atual ao vivo, via API Server) ----------
   * Consulta a API local do Holyrics (POST /api/GetCurrentPresentation) e
   * renderiza o texto do slide atual de forma nativa (nítido e adaptado ao
   * tema). Requer o "API Server" ligado no Holyrics (com token). Se o
   * navegador bloquear por CORS, use o player na mesma máquina/rede. */
  function renderHolyrics(item) {
    const el = div('mt-slide mt-surface mt-holyrics');
    const textEl = div('mt-holyrics-text');
    const meta = divText('mt-holyrics-meta', '');
    el.appendChild(textEl);
    el.appendChild(meta);

    const raw = (item.host || '').trim().replace(/\/+$/, '');
    const base = raw ? (/^https?:\/\//i.test(raw) ? raw : 'http://' + raw) : '';
    const token = (item.token || '').trim();
    let timer = null, stopped = false, lastText = null;

    function setSlide(text, name) {
      if (!text) {
        if (lastText !== '') {
          textEl.className = 'mt-holyrics-text is-empty';
          textEl.textContent = 'Sem apresentação no momento';
          meta.textContent = '';
          lastText = '';
        }
        return;
      }
      if (text === lastText) return; // evita re-render/animação à toa
      lastText = text;
      textEl.className = 'mt-holyrics-text mt-news-in';
      void textEl.offsetWidth;
      textEl.innerHTML = '';
      text.split('\n').forEach((line) => {
        const p = document.createElement('div');
        p.className = 'mt-holyrics-line';
        p.textContent = line;
        textEl.appendChild(p);
      });
      meta.textContent = name || '';
    }

    async function poll() {
      if (!base || !token) {
        textEl.className = 'mt-holyrics-text is-empty';
        textEl.textContent = 'Configure o IP e o token do Holyrics';
        return;
      }
      try {
        const res = await fetch(base + '/api/GetCurrentPresentation?token=' + encodeURIComponent(token), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ include_slides: true }),
        });
        const json = await res.json();
        const d = json && json.data;
        if (!d || !Array.isArray(d.slides) || !d.slides.length) { setSlide('', ''); return; }
        const idx = Math.max(0, (Number(d.slide_number) || 1) - 1);
        const slide = d.slides[idx] || d.slides[0];
        setSlide((slide && slide.text) || '', d.name || '');
      } catch (e) {
        // CORS/rede: mantém o último slide na tela e segue tentando.
      }
    }

    return {
      el,
      duration: item.duracao != null ? Number(item.duracao) : 0, // 0 = fixo
      onEnter: function () {
        stopped = false; poll();
        timer = setInterval(function () { if (!stopped) poll(); },
          Math.max(1, Number(item.intervalo) || 2) * 1000);
      },
      onLeave: function () { stopped = true; if (timer) clearInterval(timer); },
    };
  }

  function renderBirthday(item) {
    const el = div('mt-slide mt-surface mt-birthday');
    if (item.bg) el.style.background = item.bg;
    if (item.cor) el.style.color = item.cor;
    const title = div('mt-birthday-title');
    title.textContent = item.titulo || 'Aniversariantes do Mês';
    const list = div('mt-birthday-list');
    String(item.nomes || '')
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean)
      .forEach((line) => {
        const row = div('mt-birthday-row');
        // Formato sugerido: "Nome — 12/07" (separador com espaços).
        const parts = line.split(/\s+[—–-]\s+/);
        const name = document.createElement('span');
        name.textContent = parts[0];
        row.appendChild(name);
        if (parts[1]) {
          const d = document.createElement('span');
          d.className = 'mt-birthday-date';
          d.textContent = parts[1];
          row.appendChild(d);
        }
        list.appendChild(row);
      });
    el.appendChild(title);
    el.appendChild(list);
    return { el, duration: item.duracao || 15 };
  }

  function extractYouTubeId(s) {
    if (!s) return '';
    const m = s.match(/(?:youtu\.be\/|v=|embed\/)([\w-]{11})/);
    return m ? m[1] : s.trim();
  }

  function renderClock(item) {
    const el = div('mt-slide mt-clock');
    if (item.bg) el.style.background = item.bg; // senão herda o vidro do tema
    const time = div('mt-clock-time');
    const date = div('mt-clock-date');
    el.appendChild(time);
    el.appendChild(date);
    let timer = null;
    function tick() {
      const now = new Date();
      time.textContent = now.toLocaleTimeString('pt-BR', {
        hour: '2-digit', minute: '2-digit',
      });
      date.textContent = now.toLocaleDateString('pt-BR', {
        weekday: 'long', day: '2-digit', month: 'long',
      });
    }
    return {
      el,
      duration: item.duracao || 10,
      onEnter: () => { tick(); timer = setInterval(tick, 1000); },
      onLeave: () => timer && clearInterval(timer),
    };
  }

  function renderWeather(item) {
    const el = div('mt-slide mt-weather');
    if (item.bg) el.style.background = item.bg; // senão herda o vidro do tema
    const inner = div('mt-weather-inner');
    inner.textContent = 'Carregando clima…';
    el.appendChild(inner);
    return {
      el,
      duration: item.duracao || 10,
      onEnter: async () => {
        try {
          const w = await fetchWeather(item.cidade || 'São Paulo');
          inner.innerHTML =
            '<div class="mt-weather-icon">' + weatherIcon(w.code) + '</div>' +
            '<div class="mt-weather-temp">' + w.temp + '°C</div>' +
            '<div class="mt-weather-city">' + w.nome + '</div>';
        } catch (e) {
          inner.innerHTML = weatherFallbackHtml(item.cidade || 'São Paulo');
          const t = inner.querySelector('[data-clock]');
          const upd = () => { if (t) t.textContent = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }); };
          upd(); setInterval(upd, 1000);
        }
      },
    };
  }

  /* ---------- Fallback elegante do clima: relógio + data + cidade ----------
   * Quando o clima não carrega (sem rede, cidade inválida), a coluna NÃO morre:
   * vira um relógio ao vivo com data e cidade — parece intencional, não quebrado. */
  function weatherFallbackHtml(cidade) {
    return '<div class="wp-fallback">' +
      '<div class="wpf-date">' + fmtDataLonga(new Date()) + '</div>' +
      '<div class="wpf-time" data-clock>--:--</div>' +
      (cidade ? '<div class="wpf-city">' + escapeHtml(cidade) + '</div>' : '') +
      '</div>';
  }

  /* ---------- Painel do clima (estilo dashboard, com previsão) ---------- */
  function renderWeatherPro(item) {
    const el = div('mt-slide mt-wpro');
    if (item.bg) el.style.background = item.bg;
    const inner = div('mt-wpro-inner');
    inner.innerHTML = '<div class="mt-wpro-loading">Carregando clima…</div>';
    el.appendChild(inner);
    let timer = null, clock = null;

    function stopClock() { if (clock) { clearInterval(clock); clock = null; } }
    function startClock() {
      if (clock) return;
      const upd = () => {
        const t = inner.querySelector('[data-clock]');
        if (t) t.textContent = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
      };
      upd(); clock = setInterval(upd, 1000);
    }

    async function load() {
      try {
        const w = await fetchWeather(item.cidade || 'São Paulo');
        const now = new Date();
        let html =
          '<div class="wp-date">' + fmtDataLonga(now) + '</div>' +
          '<div class="wp-city">' + escapeHtml(w.nome) +
          (w.regiao && w.regiao !== w.nome
            ? ' <span>| ' + escapeHtml(w.regiao) + '</span>' : '') + '</div>' +
          '<div class="wp-now">' + weatherSvg(w.code, 'wp-icon') +
          '<div class="wp-temp">' + w.temp + '°</div></div>' +
          '<div class="wp-cond">' + weatherLabel(w.code) + '</div>';

        if (w.daily && w.daily.time && w.daily.time.length > 1) {
          html += '<div class="wp-days">';
          for (let i = 1; i < Math.min(7, w.daily.time.length); i++) {
            const d = new Date(w.daily.time[i] + 'T12:00:00');
            html +=
              '<div class="wp-day">' +
              '<span class="wp-day-name">' + DIAS_ABREV[d.getDay()] + '</span>' +
              weatherSvg(w.daily.weather_code[i], 'wp-day-icon') +
              '<span class="wp-day-max">' + Math.round(w.daily.temperature_2m_max[i]) + '°</span>' +
              '<span class="wp-day-min">' + Math.round(w.daily.temperature_2m_min[i]) + '°</span>' +
              '</div>';
          }
          html += '</div>';
        }
        stopClock();
        inner.innerHTML = html;
      } catch (e) {
        inner.innerHTML = weatherFallbackHtml(item.cidade || 'São Paulo');
        startClock();
      }
    }

    return {
      el,
      duration: item.duracao || 0,
      onEnter: () => { load(); timer = setInterval(load, 15 * 60 * 1000); },
      onLeave: () => { if (timer) clearInterval(timer); stopClock(); },
    };
  }

  /* ---------- Cartão de aniversário (decorado) ---------- */
  const BC_COLORS = ['#ff5da2', '#ffb454', '#4f8cff', '#39d0c4', '#ffd76e'];
  function bcConfetti() {
    // Confetes determinísticos espalhados pelo cartão.
    let s = '';
    const seeds = [
      [6, 12, 1.1, 0], [14, 30, 0.8, 1], [9, 55, 1.3, 2], [18, 78, 0.9, 3],
      [30, 8, 0.9, 4], [42, 18, 1.2, 0], [55, 6, 0.8, 1], [68, 14, 1.2, 2],
      [80, 9, 0.9, 3], [90, 20, 1.1, 4], [94, 45, 0.8, 0], [88, 70, 1.2, 1],
      [76, 86, 0.9, 2], [50, 90, 1.1, 3], [28, 88, 0.8, 4], [4, 82, 1.0, 1],
      [60, 82, 0.7, 4], [96, 84, 1.0, 2], [38, 4, 0.7, 3], [24, 60, 0.7, 0],
    ];
    seeds.forEach(([x, y, r, c], i) => {
      if (i % 3 === 0) {
        s += '<rect x="' + x + '" y="' + y + '" width="' + r * 1.6 + '" height="' + r * 2.6 +
          '" rx="0.5" fill="' + BC_COLORS[c] + '" transform="rotate(' + (i * 37 % 90 - 45) +
          ' ' + x + ' ' + y + ')"/>';
      } else {
        s += '<circle cx="' + x + '" cy="' + y + '" r="' + r + '" fill="' + BC_COLORS[c] + '"/>';
      }
    });
    return '<svg class="bc-confetti" viewBox="0 0 100 100" preserveAspectRatio="none">' + s + '</svg>';
  }
  function bcBalloon(color, cls) {
    return '<svg class="bc-balloon ' + cls + '" viewBox="0 0 40 64">' +
      '<ellipse cx="20" cy="17" rx="13.5" ry="16.5" fill="' + color + '"/>' +
      '<ellipse cx="15" cy="11" rx="4" ry="6" fill="rgba(255,255,255,.35)"/>' +
      '<path d="M20 33.5l-3.4 4.5h6.8z" fill="' + color + '"/>' +
      '<path d="M20 38q-5 9 1.5 18" stroke="rgba(255,255,255,.45)" stroke-width="1.2" fill="none"/>' +
      '</svg>';
  }
  const BC_HAT =
    '<svg class="bc-hat" viewBox="0 0 40 40">' +
    '<path d="M20 3L33 35H7z" fill="#fff"/>' +
    '<path d="M14.8 15.6L33 35H7l5-12.3z" fill="#4f8cff"/>' +
    '<path d="M9.9 27.9L33 35H7z" fill="#ffb454"/>' +
    '<circle cx="20" cy="4" r="3.4" fill="#ff5da2"/>' +
    '</svg>';

  function renderBirthdayCard(item) {
    const el = div('mt-slide mt-bcard');
    if (item.bg) el.style.background = item.bg; // senão herda o vidro do tema

    const inner = div('bc-inner');

    // Avatar (foto ou iniciais) com anel na cor da marca.
    const av = div('bc-avatar');
    if (item.foto) {
      const img = document.createElement('img');
      img.src = item.foto; img.alt = '';
      av.appendChild(img);
    } else {
      av.classList.add('bc-initials');
      av.textContent = (item.nome || '?').split(/\s+/).map((p) => p[0]).join('').slice(0, 2).toUpperCase();
    }

    const txt = div('bc-text');
    const kicker = div('bc-kicker');
    kicker.textContent = 'Aniversário';
    const title = div('bc-title');
    title.appendChild(document.createTextNode('Parabéns, '));
    const strong = document.createElement('strong');
    strong.textContent = item.nome || '';
    title.appendChild(strong);
    title.appendChild(document.createTextNode('!'));
    const msg = div('bc-msg');
    msg.textContent = item.mensagem || 'Que seu dia seja incrível.';
    txt.appendChild(kicker);
    txt.appendChild(title);
    txt.appendChild(msg);

    inner.appendChild(av);
    inner.appendChild(txt);
    el.appendChild(inner);
    return { el, duration: item.duracao || 15 };
  }

  /* ---------- Aniversariantes automáticos (lê a relação da empresa) ----------
   * Mostra sozinho quem faz aniversário HOJE (cartão) e a lista da SEMANA.
   * A relação vem de global.MT_BIRTHDAYS (carregada pelo player no modo nuvem).
   * modo: 'hoje' | 'semana' | 'auto' (hoje se houver, senão a semana). */
  const WEEKDAYS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
  function birthdayRoster() { return Array.isArray(global.MT_BIRTHDAYS) ? global.MT_BIRTHDAYS : []; }
  function mmdd2(m, d) { return String(m).padStart(2, '0') + '-' + String(d).padStart(2, '0'); }
  function bdayInitials(nome) { return (nome || '?').split(/\s+/).map((p) => p[0]).join('').slice(0, 2).toUpperCase(); }
  function bdayAvatar(p, cls) {
    const w = div('bc-avatar' + (cls ? ' ' + cls : ''));
    if (p.foto) { const img = document.createElement('img'); img.src = p.foto; img.alt = ''; w.appendChild(img); }
    else { w.classList.add('bc-initials'); w.textContent = bdayInitials(p.nome); }
    return w;
  }

  function renderBirthdayAuto(item) {
    const modo = ['hoje', 'semana', 'auto'].includes(item.modo) ? item.modo : 'auto';
    const all = birthdayRoster();
    const now = new Date();
    const today = all.filter((p) => +p.dia === now.getDate() && +p.mes === now.getMonth() + 1);
    // Próximos 7 dias (inclui hoje), preservando a ordem cronológica.
    const order = {};
    for (let i = 0; i < 7; i++) { const dt = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i); order[mmdd2(dt.getMonth() + 1, dt.getDate())] = i; }
    const week = all.filter((p) => mmdd2(+p.mes, +p.dia) in order)
      .sort((a, b) => order[mmdd2(+a.mes, +a.dia)] - order[mmdd2(+b.mes, +b.dia)] || String(a.nome).localeCompare(b.nome));

    let show = modo === 'hoje' ? 'hoje' : modo === 'semana' ? 'semana' : (today.length ? 'hoje' : 'semana');
    if (show === 'hoje' && !today.length && week.length) show = 'semana';

    const el = div('mt-slide mt-surface mt-bday mt-bday-' + show);

    // Nada a mostrar: mensagem gentil (não deixa a zona "quebrada").
    if ((show === 'hoje' && !today.length) || (show === 'semana' && !week.length)) {
      const e = div('mt-bday-empty');
      e.textContent = '🎂 Em breve, novos aniversários';
      el.appendChild(e);
      return { el, duration: item.duracao || 8 };
    }

    if (show === 'hoje') {
      const head = div('mt-bday-head');
      head.innerHTML = '<span class="mt-bday-emoji">🎉</span>' ;
      const h = div('mt-bday-h'); h.textContent = item.titulo || 'Feliz aniversário!';
      head.appendChild(h);
      el.appendChild(head);
      const grid = div('mt-bday-grid mt-bday-grid-' + Math.min(today.length, 4));
      today.slice(0, 8).forEach((p) => {
        const card = div('mt-bday-person');
        card.appendChild(bdayAvatar(p, 'bc-avatar-lg'));
        const nm = div('mt-bday-name'); nm.textContent = p.nome; card.appendChild(nm);
        if (p.cargo) { const cg = div('mt-bday-role'); cg.textContent = p.cargo; card.appendChild(cg); }
        grid.appendChild(card);
      });
      el.appendChild(grid);
    } else {
      const head = div('mt-bday-head');
      head.innerHTML = '<span class="mt-bday-emoji">🎂</span>';
      const h = div('mt-bday-h'); h.textContent = item.titulo || 'Aniversariantes da semana';
      head.appendChild(h);
      el.appendChild(head);
      const listEl = div('mt-bday-list');
      week.slice(0, 8).forEach((p) => {
        const row = div('mt-bday-row');
        row.appendChild(bdayAvatar(p));
        const info = div('mt-bday-rowinfo');
        const nm = div('mt-bday-name'); nm.textContent = p.nome; info.appendChild(nm);
        if (p.cargo) { const cg = div('mt-bday-role'); cg.textContent = p.cargo; info.appendChild(cg); }
        row.appendChild(info);
        const when = div('mt-bday-when');
        const dt = new Date(now.getFullYear(), +p.mes - 1, +p.dia);
        const isToday = order[mmdd2(+p.mes, +p.dia)] === 0;
        when.innerHTML = '<span class="mt-bday-date">' + String(p.dia).padStart(2, '0') + '/' + String(p.mes).padStart(2, '0') +
          '</span><span class="mt-bday-wd">' + (isToday ? 'hoje' : WEEKDAYS[dt.getDay()]) + '</span>';
        if (isToday) when.classList.add('is-today');
        row.appendChild(when);
        listEl.appendChild(row);
      });
      el.appendChild(listEl);
    }
    return { el, duration: item.duracao || 14 };
  }

  /* ---------- Trânsito ao vivo (Waze, sem chave) ---------- */
  function renderTraffic(item) {
    const el = div('mt-slide mt-map');
    const badge = div('mt-map-badge');
    badge.textContent = 'Trânsito ao vivo · ' + (item.local || '');
    el.appendChild(badge);
    return {
      el,
      duration: item.duracao || 0,
      onEnter: async () => {
        try {
          let lat = parseFloat(item.lat), lon = parseFloat(item.lon);
          if (isNaN(lat) || isNaN(lon)) {
            const g = await geocode(item.local || 'São Paulo');
            lat = g.latitude; lon = g.longitude;
          }
          const iframe = document.createElement('iframe');
          iframe.setAttribute('frameborder', '0');
          iframe.src = 'https://embed.waze.com/iframe?zoom=' + (item.zoom || 13) +
            '&lat=' + lat + '&lon=' + lon + '&ct=livemap';
          el.insertBefore(iframe, badge);
        } catch (e) {
          el.appendChild(divText('mt-map-error', 'Trânsito indisponível'));
        }
      },
    };
  }

  /* ---------- Mapa da região (OpenStreetMap, sem chave) ---------- */
  function renderMap(item) {
    const el = div('mt-slide mt-map');
    const badge = div('mt-map-badge');
    badge.textContent = (item.local || 'Mapa');
    el.appendChild(badge);
    return {
      el,
      duration: item.duracao || 20,
      onEnter: async () => {
        try {
          let lat = parseFloat(item.lat), lon = parseFloat(item.lon);
          if (isNaN(lat) || isNaN(lon)) {
            const g = await geocode(item.local || 'São Paulo');
            lat = g.latitude; lon = g.longitude;
          }
          const zoom = Number(item.zoom) || 14;
          const d = 0.02 * Math.pow(2, 14 - zoom);
          const bbox = [lon - d, lat - d * 0.6, lon + d, lat + d * 0.6].join('%2C');
          const iframe = document.createElement('iframe');
          iframe.setAttribute('frameborder', '0');
          iframe.src = 'https://www.openstreetmap.org/export/embed.html?bbox=' + bbox +
            '&layer=mapnik&marker=' + lat + '%2C' + lon;
          el.insertBefore(iframe, badge);
        } catch (e) {
          el.appendChild(divText('mt-map-error', 'Mapa indisponível'));
        }
      },
    };
  }

  function divText(cls, text) {
    const d = div(cls);
    d.textContent = text;
    return d;
  }

  /* ---------- Aviso Premium (variantes por tipo de comunicado) ---------- */
  const ANN_VARIANTS = [
    { id: 'comunicado', label: 'Comunicado', cor: '#3b82f6', kicker: 'COMUNICADO INTERNO', icon: 'megaphone' },
    { id: 'urgente', label: 'Urgente', cor: '#ef4444', kicker: 'ATENÇÃO', icon: 'alert' },
    { id: 'evento', label: 'Evento', cor: '#8b5cf6', kicker: 'AGENDA', icon: 'calendar' },
    { id: 'rh', label: 'Recursos Humanos', cor: '#14b8a6', kicker: 'RECURSOS HUMANOS', icon: 'users' },
    { id: 'seguranca', label: 'Segurança', cor: '#f59e0b', kicker: 'SEGURANÇA DO TRABALHO', icon: 'shield' },
    { id: 'manutencao', label: 'Manutenção', cor: '#64748b', kicker: 'MANUTENÇÃO PROGRAMADA', icon: 'wrench' },
    { id: 'conquista', label: 'Conquista', cor: '#22c55e', kicker: 'PARABÉNS, EQUIPE', icon: 'trophy' },
    { id: 'treinamento', label: 'Treinamento', cor: '#6366f1', kicker: 'DESENVOLVIMENTO', icon: 'book' },
    { id: 'saude', label: 'Saúde & Bem-estar', cor: '#ec4899', kicker: 'SAÚDE E BEM-ESTAR', icon: 'heart' },
  ];
  const ANN_ICONS = {
    megaphone: '<path d="M4 10v4a1 1 0 0 0 1 1h2l1.2 5h2.2L9.2 15H10l9 3.5v-13L10 9H5a1 1 0 0 0-1 1z"/>',
    alert: '<path d="M12 3.5L2.8 19.5h18.4z"/><path d="M12 9.8v4.4M12 17.4v.01"/>',
    calendar: '<rect x="3.5" y="5" width="17" height="16" rx="2"/><path d="M3.5 10h17M8 2.5V6.5M16 2.5V6.5"/>',
    users: '<circle cx="9" cy="8" r="3.4"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.8a3.4 3.4 0 0 1 0 6.5M21.5 20a6.5 6.5 0 0 0-5-6.3"/>',
    shield: '<path d="M12 2.5l8 3v6c0 5-3.4 8.3-8 10-4.6-1.7-8-5-8-10v-6z"/><path d="M8.5 11.5l2.5 2.5 4.5-4.5"/>',
    wrench: '<path d="M14.7 6.3a4.5 4.5 0 0 0-6 5.6L3 17.6a2 2 0 1 0 2.8 2.8l5.7-5.7a4.5 4.5 0 0 0 5.6-6l-3 3-2.8-.7-.7-2.8z"/>',
    trophy: '<path d="M8 4h8v6a4 4 0 0 1-8 0zM8 5H4.5a3.2 3.2 0 0 0 3.7 3.6M16 5h3.5a3.2 3.2 0 0 1-3.7 3.6M12 14v4M8.5 21h7M10 18h4"/>',
    book: '<path d="M4 5a2 2 0 0 1 2-2h14v16H6a2 2 0 0 0-2 2z"/><path d="M4 19a2 2 0 0 1 2-2h14M8 7h8"/>',
    heart: '<path d="M12 20.5S3.5 15 3.5 9.2A4.7 4.7 0 0 1 12 6.4a4.7 4.7 0 0 1 8.5 2.8C20.5 15 12 20.5 12 20.5z"/>',
  };
  function annVariant(id) {
    return ANN_VARIANTS.find((v) => v.id === id) || ANN_VARIANTS[0];
  }
  function hexToRgba(hex, a) {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
    if (!m) return 'rgba(59,130,246,' + a + ')';
    const n = parseInt(m[1], 16);
    return 'rgba(' + (n >> 16) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
  }
  // Mistura duas cores hex (t = peso da segunda).
  function blendHex(h1, h2, t) {
    const p = (h) => { const m = /^#?([0-9a-f]{6})$/i.exec(h); return m ? parseInt(m[1], 16) : 0; };
    const a = p(h1), b = p(h2);
    const mix = (x, y) => Math.round(x + (y - x) * t);
    const r = mix(a >> 16, b >> 16), g = mix((a >> 8) & 255, (b >> 8) & 255), bl = mix(a & 255, b & 255);
    return '#' + ((r << 16) | (g << 8) | bl).toString(16).padStart(6, '0');
  }

  function renderAnnounce(item) {
    const v = annVariant(item.tipo);
    const cor = v.cor;
    const el = div('mt-slide mt-ann');
    // Banner sempre escuro (texto branco), mas com um tom do tema para não
    // destoar; a cor da categoria (cor) dá o destaque.
    const annBase = blendHex('#0a0f1c', themeColor('brand', '#3b82f6'), .16);
    el.style.background =
      'radial-gradient(85% 85% at 82% 8%, ' + hexToRgba(cor, .28) + ' 0%, rgba(0,0,0,0) 55%),' +
      'radial-gradient(70% 70% at 8% 95%, ' + hexToRgba(cor, .16) + ' 0%, rgba(0,0,0,0) 55%),' +
      'linear-gradient(165deg, ' + blendHex(annBase, cor, .22) + ', ' + annBase + ' 70%)';

    const inner = div('ann-inner');

    const iconBox = div('ann-icon');
    iconBox.style.background = hexToRgba(cor, .16);
    iconBox.style.borderColor = hexToRgba(cor, .55);
    iconBox.style.boxShadow = '0 0 0 1.5cqh ' + hexToRgba(cor, .07);
    iconBox.innerHTML =
      '<svg viewBox="0 0 24 24" fill="none" stroke="' + blendHex(cor, '#ffffff', .55) +
      '" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">' +
      (ANN_ICONS[v.icon] || ANN_ICONS.megaphone) + '</svg>';
    inner.appendChild(iconBox);

    const kicker = div('ann-kicker');
    kicker.textContent = item.etiqueta || v.kicker;
    kicker.style.color = blendHex(cor, '#ffffff', .55);
    kicker.style.borderColor = hexToRgba(cor, .55);
    inner.appendChild(kicker);

    if (item.titulo) inner.appendChild(divText('ann-title', item.titulo));
    if (item.corpo) inner.appendChild(divText('ann-body', item.corpo));
    if (item.info) {
      const meta = div('ann-meta');
      meta.textContent = item.info;
      inner.appendChild(meta);
    }

    el.appendChild(inner);
    return { el, duration: item.duracao || 12 };
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
  }

  /* ---------- Frase / citação ---------- */
  function renderQuote(item) {
    const el = div('mt-slide mt-surface mt-quote');
    if (item.bg) el.style.background = item.bg;
    const inner = div('mt-quote-inner');
    const mark = div('mt-quote-mark'); mark.textContent = '“';
    const txt = div('mt-quote-text'); txt.textContent = item.texto || '';
    inner.appendChild(mark);
    inner.appendChild(txt);
    if (item.autor) {
      const a = div('mt-quote-author'); a.textContent = item.autor;
      inner.appendChild(a);
    }
    el.appendChild(inner);
    return { el, duration: item.duracao || 12 };
  }

  /* ---------- Destaque de pessoa (funcionário do mês, reconhecimento) ---------- */
  function renderSpotlight(item) {
    const el = div('mt-slide mt-surface mt-spot');
    if (item.bg) el.style.background = item.bg;
    const inner = div('mt-spot-inner');

    const photoWrap = div('mt-spot-photo-wrap');
    if (item.foto) {
      const img = document.createElement('img');
      img.className = 'mt-spot-photo'; img.src = item.foto; img.alt = '';
      photoWrap.appendChild(img);
    } else {
      const ini = div('mt-spot-photo mt-spot-initials');
      ini.textContent = (item.nome || '?').split(/\s+/).map((p) => p[0]).join('').slice(0, 2).toUpperCase();
      photoWrap.appendChild(ini);
    }

    const info = div('mt-spot-info');
    const kicker = div('mt-spot-kicker'); kicker.textContent = item.etiqueta || 'DESTAQUE DO MÊS';
    const name = div('mt-spot-name'); name.textContent = item.nome || '';
    info.appendChild(kicker);
    info.appendChild(name);
    if (item.cargo) { const r = div('mt-spot-role'); r.textContent = item.cargo; info.appendChild(r); }
    if (item.mensagem) { const m = div('mt-spot-msg'); m.textContent = item.mensagem; info.appendChild(m); }

    inner.appendChild(photoWrap);
    inner.appendChild(info);
    el.appendChild(inner);
    return { el, duration: item.duracao || 14 };
  }

  /* ---------- Agenda / programação ---------- */
  function renderAgenda(item) {
    const el = div('mt-slide mt-surface mt-agenda');
    if (item.bg) el.style.background = item.bg;
    const inner = div('mt-agenda-inner');
    const title = div('mt-agenda-title'); title.textContent = item.titulo || 'Programação';
    inner.appendChild(title);
    const list = div('mt-agenda-list');
    String(item.itens || '').split('\n').map((s) => s.trim()).filter(Boolean).forEach((line) => {
      const parts = line.split(/\s*[|\-–—]\s*/);
      const row = div('mt-agenda-row');
      const h = div('mt-agenda-time'); h.textContent = parts[0] || '';
      const a = div('mt-agenda-act'); a.textContent = parts.slice(1).join(' ') || '';
      row.appendChild(h); row.appendChild(a);
      list.appendChild(row);
    });
    inner.appendChild(list);
    el.appendChild(inner);
    return { el, duration: item.duracao || 15 };
  }

  /* ---------- Indicador / KPI ---------- */
  function renderKpi(item) {
    const el = div('mt-slide mt-surface mt-kpi');
    if (item.bg) el.style.background = item.bg;
    const inner = div('mt-kpi-inner');
    if (item.rotulo) { const l = div('mt-kpi-label'); l.textContent = item.rotulo; inner.appendChild(l); }
    const valueWrap = div('mt-kpi-value-wrap');
    const v = div('mt-kpi-value'); v.textContent = item.valor || '—';
    valueWrap.appendChild(v);
    const trend = (item.tendencia || 'estavel');
    if (item.variacao) {
      const t = div('mt-kpi-trend mt-kpi-' + trend);
      const arrow = trend === 'subiu' ? '▲' : trend === 'desceu' ? '▼' : '▬';
      t.textContent = arrow + ' ' + item.variacao;
      valueWrap.appendChild(t);
    }
    inner.appendChild(valueWrap);
    if (item.detalhe) { const d = div('mt-kpi-detail'); d.textContent = item.detalhe; inner.appendChild(d); }
    el.appendChild(inner);
    return { el, duration: item.duracao || 12 };
  }

  /* ---------- Promoção / produto ----------
   * Reformulado (nova linguagem "mt-surface"): fundo em gradiente derivado
   * do tema, composição uniforme e layout que funciona com OU sem imagem. */
  function renderPromo(item) {
    const hasImg = !!item.imagem;
    const el = div('mt-slide mt-surface mt-promo' + (hasImg ? ' mt-promo-split' : ''));
    if (item.bg) el.style.background = item.bg; // override manual opcional

    if (hasImg) {
      const media = div('mt-promo-media');
      const img = document.createElement('img'); img.src = item.imagem; img.alt = '';
      img.onerror = () => media.classList.add('mt-broken');
      media.appendChild(img);
      el.appendChild(media);
    }

    const info = div('mt-promo-info');
    if (item.selo) info.appendChild(divText('mt-promo-selo', item.selo));
    if (item.titulo) info.appendChild(divText('mt-promo-title', item.titulo));
    const prices = div('mt-promo-prices');
    if (item.precoDe) prices.appendChild(divText('mt-promo-de', item.precoDe));
    if (item.precoPor) prices.appendChild(divText('mt-promo-por', item.precoPor));
    if (item.precoDe || item.precoPor) info.appendChild(prices);
    if (item.cta) info.appendChild(divText('mt-promo-cta', item.cta));
    el.appendChild(info);
    return { el, duration: item.duracao || 12 };
  }

  /* ---------- Redes sociais ---------- */
  const SOCIAL_ICONS = {
    instagram: '<rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1.2" fill="currentColor" stroke="none"/>',
    facebook: '<path d="M14 8h2V5h-2a3 3 0 0 0-3 3v2H9v3h2v6h3v-6h2.2l.8-3H14V8.5c0-.3.2-.5.5-.5z"/>',
    youtube: '<rect x="3" y="6" width="18" height="12" rx="3"/><path d="M11 9.5l4 2.5-4 2.5z" fill="currentColor" stroke="none"/>',
    linkedin: '<rect x="3" y="3" width="18" height="18" rx="3"/><path d="M7 10v6M7 7v.01M11 16v-3.5a1.5 1.5 0 0 1 3 0V16M11 16v-6" />',
    tiktok: '<path d="M14 4v9a3.2 3.2 0 1 1-3-3.2M14 7a4 4 0 0 0 4 3.4"/>',
    site: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>',
  };
  function renderSocial(item) {
    const el = div('mt-slide mt-surface mt-social');
    if (item.bg) el.style.background = item.bg;
    const inner = div('mt-social-inner');
    const rede = item.rede || 'instagram';
    const iconBox = div('mt-social-icon');
    iconBox.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" ' +
      'stroke-linecap="round" stroke-linejoin="round">' + (SOCIAL_ICONS[rede] || SOCIAL_ICONS.site) + '</svg>';
    inner.appendChild(iconBox);
    const t = div('mt-social-title'); t.textContent = item.titulo || 'Siga-nos nas redes';
    inner.appendChild(t);
    if (item.handle) { const h = div('mt-social-handle'); h.textContent = item.handle; inner.appendChild(h); }
    if (item.qr && item.handle) {
      const qr = document.createElement('img');
      qr.className = 'mt-social-qr';
      qr.src = 'https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=' +
        encodeURIComponent(item.url || item.handle);
      inner.appendChild(qr);
    }
    el.appendChild(inner);
    return { el, duration: item.duracao || 12 };
  }

  /* ---------- Poster / arte de marca (gerado por IA ou manual) ----------
   * Composição full-bleed que herda a cor da marca pelas vars do tema
   * (--brand & cia., já adaptativas). Orna sozinho e escala pra qualquer
   * formato/zona (container queries). 4 variantes de layout. */
  function renderPoster(item) {
    const variant = ['bold', 'aurora', 'split', 'minimal'].includes(item.variant) ? item.variant : 'bold';
    const el = div('mt-slide mt-poster mt-poster-' + variant);
    // Cor opcional por peça: a IA pode variar o tom sem sair da identidade.
    if (/^#?[0-9a-fA-F]{6}$/.test(item.cor || '')) {
      el.style.setProperty('--pb', item.cor[0] === '#' ? item.cor : '#' + item.cor);
    }
    el.appendChild(div('mt-poster-fx')); // camada decorativa (formas/halos)
    const inner = div('mt-poster-inner');
    if (item.kicker) { const k = div('mt-poster-kicker'); k.textContent = item.kicker; inner.appendChild(k); }
    if (item.titulo) { const t = div('mt-poster-title'); t.textContent = item.titulo; inner.appendChild(t); }
    if (item.corpo) { const c = div('mt-poster-body'); c.textContent = item.corpo; inner.appendChild(c); }
    if (item.cta) { const a = div('mt-poster-cta'); a.textContent = item.cta; inner.appendChild(a); }
    el.appendChild(inner);
    return { el, duration: item.duracao || 12 };
  }

  /* ---------- Composição (editor tipo Canva) ----------
   * Uma tela livre: fundo (cor/imagem) + elementos posicionados. Cada elemento
   * guarda x/y/w/h em % da zona + rotação (graus) + camada (z) → escala para
   * qualquer formato. Renderiza só com position/transform (leve). */
  // Ícones de linha (espelho de web/src/lib/icons.js).
  const COMP_ICONS = {
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
  /*
   * Forma, preenchimento e corpo do texto vêm de js/peca.js — o mesmo módulo
   * que o editor importa. Estas contas já moraram aqui dentro, e a cópia do
   * editor foi divergindo em silêncio.
   */
  const SHAPE_POLY = global.MTPeca.SHAPE_POLY;
  const shapeClip = global.MTPeca.shapeClip;
  const fillToCss = global.MTPeca.fillToCss;
  function textFontCqw(e, formato) {
    return global.MTPeca.textFontCqw(e, formato);
  }

  /*
   * Sombra e borda. A sombra entra numa propriedade diferente conforme o que o
   * elemento é — text-shadow no texto, box-shadow na forma inteira, filtro no
   * que é recortado ou tem transparência — e quem decide isso é o módulo, para
   * que o editor decida igual.
   */
  const P = global.MTPeca;
  function aplicarSombra(no, e) {
    const css = P.sombraCss(e);
    if (css === 'none') return;
    const onde = P.comoAplicarSombra(e);
    if (onde === 'texto') no.style.textShadow = css;
    else if (onde === 'caixa') no.style.boxShadow = css;
    else no.style.filter = 'drop-shadow(' + css + ')';
  }
  function aplicarBorda(no, e) {
    const css = P.bordaCss(e);
    if (css === 'none') return;
    // Sem border-box a borda cresceria o bloco para fora do que foi posicionado.
    no.style.border = css;
    no.style.boxSizing = 'border-box';
  }

  /*
   * A peça é composta para um FORMATO (16/9, 9/16…), mas a zona onde ela cai
   * pode ter qualquer proporção — e com layout dinâmico ela muda de proporção
   * a cada troca de arranjo.
   *
   * Antes o palco da peça era `inset: 0`: ela esticava para preencher a zona.
   * Um círculo virava elipse, um layout equilibrado ficava torto, e o mesmo
   * design se deformava de um jeito diferente a cada 20 segundos. É a causa do
   * "os designs entram em telas que não cabem e ficam feios".
   *
   * Agora a peça mantém a própria proporção, centrada, e o FUNDO DELA preenche
   * o resto da zona. Não são barras pretas: é a mesma cor ou a mesma foto
   * continuando — a peça parece maior, não recortada.
   */
  function renderComposicao(item) {
    const el = div('mt-slide mt-comp');
    const bg = item.bg || {};
    const fundoCss = (alvo) => {
      if (bg.kind === 'imagem' && bg.src) {
        alvo.style.backgroundImage = 'url("' + String(bg.src).replace(/"/g, '') + '")';
      } else if (bg.kind === 'cor' && bg.cor) {
        alvo.style.background = bg.cor;
      } // senão herda o vidro/tema da zona
    };
    /*
     * A sobra ao redor da peça recebe o MESMO fundo, mas desfocado e ampliado
     * — o truque dos players de vídeo. Repetir o fundo em tamanho diferente
     * deixaria uma emenda visível onde os dois gradientes não batem; desfocado,
     * a sobra lê como continuação da peça.
     */
    if (bg.kind === 'imagem' && bg.src) {
      el.style.setProperty('--peca-bg', 'url("' + String(bg.src).replace(/"/g, '') + '")');
    } else if (bg.kind === 'cor' && bg.cor) {
      el.style.setProperty('--peca-bg', bg.cor);
    }

    // O encaixe carrega a proporção; o palco é o container das fontes.
    const [fw, fh] = String(item.formato || '16/9').split('/').map(Number);
    const razao = (fw && fh) ? fw / fh : 16 / 9;
    const fit = div('mt-comp-fit');
    fit.style.setProperty('--r', razao.toFixed(4));
    const palco = div('mt-comp-palco');
    fundoCss(palco); // o fundo também DENTRO do palco, senão a peça fica vazada
    fit.appendChild(palco);
    el.appendChild(fit);

    const els = (Array.isArray(item.elementos) ? item.elementos : []).slice()
      .sort((a, b) => (a.z || 0) - (b.z || 0));
    els.forEach((e) => {
      const box = div('mt-comp-el mt-comp-' + (e.tipo === 'texto' ? 'texto' : 'imagem'));
      box.style.left = (e.x || 0) + '%';
      box.style.top = (e.y || 0) + '%';
      box.style.width = (e.w != null ? e.w : 25) + '%';
      box.style.height = (e.h != null ? e.h : 25) + '%';
      if (e.rot) box.style.transform = 'rotate(' + e.rot + 'deg)';
      box.style.opacity = (e.opacidade != null ? e.opacidade : 1);

      /*
       * A animação mora num DIV INTERNO, nunca na caixa do elemento.
       *
       * A caixa já carrega a rotação da peça (`transform: rotate(...)`), e uma
       * animação de transform na mesma caixa apagaria essa rotação — o
       * elemento entraria bonito e terminaria torto, diferente do que foi
       * desenhado no editor.
       *
       * Sem animação, nenhum div extra: uma peça com quarenta elementos parados
       * não precisa de quarenta caixas a mais para desenhar a mesma coisa.
       */
      const anim = global.MTAnim ? MTAnim.ler(e) : { tem: false };
      let alvo = box;
      if (anim.tem) {
        const capa = div('mt-anim ' + anim.classes.join(' '));
        const est = MTAnim.estilo(e);
        for (const k in est) capa.style[k] = est[k];
        box.appendChild(capa);
        alvo = capa;
      }

      if (e.tipo === 'texto') {
        const t = div('mt-comp-text');
        t.textContent = e.text || '';
        /*
         * Todo o estilo do texto sai de MTFontes.estiloTexto — a MESMA função
         * que o editor usa para desenhar o palco. Enquanto cada lado montava o
         * seu, a peça saía diferente aqui e lá, e a diferença só aparecia
         * depois de publicada, na parede.
         */
        const estilo = global.MTFontes.estiloTexto(e);
        for (const k in estilo) t.style[k] = estilo[k];
        t.style.fontSize = textFontCqw(e, item.formato) + 'cqw';
        /*
         * A fonte em si é baixada sob demanda, pela família JÁ RESOLVIDA — sem
         * isso, um texto sem família declarada pedia estilo de Inter e baixava
         * coisa nenhuma, e a TV desenhava com a fonte do sistema.
         * Sem rede, vale o fallback da pilha e a peça continua legível.
         */
        if (global.MTTheme && MTTheme.familiaPeca) MTTheme.familiaPeca(MTFontes.familia(e.fonte));
        // Sombra de texto é text-shadow; box-shadow numa div de texto
        // desenharia um retângulo em volta do bloco, não em volta das letras.
        aplicarSombra(t, e);
        alvo.appendChild(t);
      } else if (e.tipo === 'forma') {
        // A forma É a caixa (não tem filho), então o desenho vai no `alvo`:
        // com animação, `alvo` é a capa; sem, é a própria caixa.
        alvo.style.background = fillToCss(e.fill);
        if (e.shape === 'ellipse') alvo.style.borderRadius = '50%';
        else if (SHAPE_POLY[e.shape]) alvo.style.clipPath = shapeClip(e.shape);
        else alvo.style.borderRadius = P.raioCss(e);
        aplicarSombra(alvo, e);
        aplicarBorda(alvo, e);
      } else if (e.tipo === 'icone') {
        const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        s.setAttribute('viewBox', '0 0 24 24');
        s.setAttribute('fill', 'none');
        s.setAttribute('stroke', e.cor || '#ffffff');
        s.setAttribute('stroke-width', e.peso || 1.6);
        s.setAttribute('stroke-linecap', 'round');
        s.setAttribute('stroke-linejoin', 'round');
        s.style.width = '100%'; s.style.height = '100%';
        s.innerHTML = COMP_ICONS[e.name] || COMP_ICONS.star;
        aplicarSombra(s, e);
        alvo.appendChild(s);
      } else {
        const img = document.createElement('img');
        img.className = 'mt-comp-img';
        img.src = e.src || '';
        img.alt = '';
        img.style.objectFit = e.fit === 'cover' ? 'cover' : 'contain';
        img.style.borderRadius = P.raioCss(e);
        aplicarSombra(img, e);
        aplicarBorda(img, e);
        alvo.appendChild(img);
      }
      palco.appendChild(box);
    });
    return { el, duration: item.duracao || 12 };
  }

  function renderWeb(item) {
    const el = div('mt-slide mt-web');
    const iframe = document.createElement('iframe');
    iframe.setAttribute('frameborder', '0');
    iframe.src = item.url;
    el.appendChild(iframe);
    return { el, duration: item.duracao || 20 };
  }

  /* ---------- Apresentação (PPTX / PPT / PDF) ----------
   * PDF: o próprio navegador renderiza no iframe. PPTX/PPT: exibido pelo
   * visualizador online do Office (o arquivo precisa estar acessível na
   * internet — as URLs de /media já são públicas em produção). */
  function renderPptx(item) {
    const el = div('mt-slide mt-web mt-pptx');
    const src = String(item.src || '');
    if (!src) { el.classList.add('mt-empty'); el.textContent = 'Envie um arquivo (.pptx/.pdf)'; return { el, duration: item.duracao || 8 }; }
    const iframe = document.createElement('iframe');
    iframe.setAttribute('frameborder', '0');
    iframe.setAttribute('allowfullscreen', 'true');
    const isPdf = /\.pdf(\?|$)/i.test(src);
    iframe.src = isPdf ? src : 'https://view.officeapps.live.com/op/embed.aspx?src=' + encodeURIComponent(src);
    el.appendChild(iframe);
    return { el, duration: item.duracao || 0 };
  }

  // Endereço do nosso desenhador de QR. Antes isto apontava para um serviço de
  // terceiros: a TV ficava sem QR quando aquele site caísse, e cada exibição
  // contava a ele o que estávamos mostrando.
  function urlQr(dado) { return '/api/qr.svg?d=' + encodeURIComponent(dado || ''); }

  function renderQr(item) {
    const el = div('mt-slide mt-qr');
    el.style.background = item.bg || '#ffffff';
    const inner = div('mt-qr-inner');
    const img = document.createElement('img');
    img.src = urlQr(item.data);
    img.alt = 'QR Code';
    inner.appendChild(img);
    if (item.caption) {
      const c = div('mt-qr-caption');
      c.textContent = item.caption;
      inner.appendChild(c);
    }
    el.appendChild(inner);
    return { el, duration: item.duracao || 12 };
  }

  /*
   * Mural: as fotos que o público manda pelo QR, na TV, em tempo real.
   *
   * A TV mostra SÓ as fotos. O QR fica no painel do admin, para ser impresso e
   * posto na mesa — não ocupando espaço numa tela que existe para mostrar as
   * pessoas. Quem convida é o cartaz; quem exibe é a TV.
   */
  function renderMural(item) {
    const codigo = String(item.codigo || '').toUpperCase();
    const el = div('mt-slide mt-surface mt-mural');
    const cabecalho = div('mt-mural-head');
    const h = div('mt-mural-h');
    h.textContent = item.titulo || 'Mural de fotos';
    cabecalho.appendChild(h);
    if (item.legenda) { const s = div('mt-mural-sub'); s.textContent = item.legenda; cabecalho.appendChild(s); }
    el.appendChild(cabecalho);

    const palco = div('mt-mural-palco');
    el.appendChild(palco);

    if (!codigo) {
      el.classList.add('mt-empty');
      palco.textContent = 'Escolha um mural nas configurações desta tela.';
      return { el, duration: item.duracao || 10 };
    }

    // Guarda quais fotos já apareceram: sem isso, cada atualização re-animaria
    // a parede inteira e ninguém repararia na foto que acabou de chegar.
    let vistas = new Set();
    let primeira = true;

    // Espera pelas primeiras fotos. Sem QR: a frase segue o tema da tela.
    function aguardando(texto) {
      const c = div('mt-mural-aguarde');
      c.textContent = texto;
      return c;
    }

    /*
     * A grade muda com a quantidade. Uma grade fixa de quatro colunas fica
     * ridícula com uma foto só (um retângulo alto e magro num mar de vazio),
     * e apertada demais com dez. Então a forma vem do número de fotos, e a
     * célula em destaque só existe quando já há mosaico para destacar.
     */
    function grade(n) {
      if (n === 1) return { cols: '1fr', rows: '1fr', destaque: false };
      if (n <= 4) return { cols: 'repeat(2, 1fr)', rows: 'repeat(' + Math.ceil(n / 2) + ', 1fr)', destaque: false };
      if (n <= 6) return { cols: 'repeat(3, 1fr)', rows: 'repeat(2, 1fr)', destaque: false };
      return { cols: 'repeat(4, 1fr)', rows: 'repeat(3, 1fr)', destaque: true };
    }

    function pintar(todas) {
      palco.innerHTML = '';
      if (!todas.length) {
        palco.classList.add('mt-mural-vazio');
        palco.appendChild(aguardando(item.chamada || 'As fotos aparecem aqui'));
        return;
      }
      palco.classList.remove('mt-mural-vazio');
      // Teto de fotos para caber na maior grade sem sobrar linha espremida.
      // Com destaque (2×2), 9 fotos ocupam exatamente as 12 células.
      const fotos = todas.slice(0, 9);
      const g = grade(fotos.length);
      const parede = div('mt-mural-parede');
      parede.style.gridTemplateColumns = g.cols;
      parede.style.gridTemplateRows = g.rows;

      // Mais recente primeiro e em destaque: é a foto que a pessoa acabou de
      // mandar, e ela está olhando para a TV agora.
      fotos.forEach((f, i) => {
        const card = div('mt-mural-foto' + (g.destaque && i === 0 ? ' mt-mural-foto-1' : ''));
        if (!primeira && !vistas.has(f.id)) card.classList.add('mt-mural-nova');
        /*
         * A mesma foto entra duas vezes: borrada atrás para preencher a
         * célula, e inteira na frente. Foto de celular é em pé e a célula é
         * deitada — cortar para preencher decapitaria metade das famílias.
         */
        card.style.setProperty('--foto', 'url("' + String(f.url).replace(/"/g, '%22') + '")');
        const img = document.createElement('img');
        img.src = f.url;
        img.alt = '';
        img.loading = 'eager';
        card.appendChild(img);
        if (f.autor || f.mensagem) {
          const leg = div('mt-mural-legenda');
          if (f.mensagem) { const m = div('mt-mural-msg'); m.textContent = f.mensagem; leg.appendChild(m); }
          if (f.autor) { const a = div('mt-mural-autor'); a.textContent = f.autor; leg.appendChild(a); }
          card.appendChild(leg);
        }
        parede.appendChild(card);
      });
      palco.appendChild(parede);
      vistas = new Set(todas.map((f) => f.id));
      primeira = false;
    }

    async function buscar() {
      try {
        /*
         * A leitura do mural vai assinada com a credencial da TV.
         *
         * O código do cartaz autoriza ENVIAR uma foto — é o que está escrito
         * na regra do módulo. Listar o que os outros mandaram é outra coisa:
         * sem o cabeçalho, quem fotografasse o cartaz de longe lia os nomes e
         * recados do evento interno de uma empresa, meses depois, de fora da
         * rede dela.
         */
        var cab = (global.MTCloud && global.MTCloud.dtHeader) ? global.MTCloud.dtHeader() : {};
        const r = await fetch("/api/mural/" + encodeURIComponent(codigo) + "/fotos", { cache: "no-store", headers: cab });
        // Mural apagado ou código errado: dizer o motivo, não fingir espera.
        if (r.status === 404) {
          palco.innerHTML = '';
          palco.classList.add('mt-mural-vazio');
          palco.appendChild(aguardando('Este mural não existe mais. Escolha outro nas configurações da tela.'));
          primeira = false;
          return;
        }
        if (!r.ok) throw new Error('http ' + r.status);
        const d = await r.json();
        if (el.isConnected || primeira) pintar(d.fotos || []);
      } catch (e) {
        // Rede caiu: mantém na tela o que já estava. Uma parede congelada é
        // melhor do que um erro no meio da festa.
        if (primeira) {
          palco.classList.add('mt-mural-vazio');
          palco.appendChild(aguardando(item.chamada || 'As fotos aparecem aqui'));
          primeira = false;
        }
      }
    }

    buscar();
    // Duas fontes: o aviso do servidor (instantâneo) e uma checagem lenta de
    // rede, que cobre a TV cujo SSE caiu sem ninguém perceber.
    const aoVivo = () => { if (el.isConnected) buscar(); else limpar(); };
    const relogio = setInterval(aoVivo, 20000);
    function limpar() { clearInterval(relogio); document.removeEventListener('mt:mural', aoVivo); }
    document.addEventListener('mt:mural', aoVivo);

    // duracao 0 = fica até o próximo conteúdo; o mural costuma ser assim.
    return { el, duration: item.duracao == null ? 30 : item.duracao };
  }

  /* ---------- API pública ---------- */
  function renderItem(item) {
    const fn = RENDERERS[item.type];
    if (!fn) {
      const el = div('mt-slide mt-text');
      el.textContent = 'Tipo de conteúdo desconhecido: ' + item.type;
      return { el, duration: 5 };
    }
    return fn(item);
  }

  // Metadados dos tipos, usados pelo Admin para montar formulários.
  // "icon" referencia um ícone SVG definido no painel (js/admin.js).
  const ITEM_TYPES = [
    { type: 'announce', label: 'Aviso Premium', icon: 'bell' },
    { type: 'text', label: 'Texto / Comunicado', icon: 'text' },
    { type: 'notice', label: 'Aviso simples', icon: 'bell' },
    { type: 'image', label: 'Imagem', icon: 'image' },
    { type: 'video', label: 'Vídeo (MP4)', icon: 'film' },
    { type: 'youtube', label: 'YouTube / Ao vivo', icon: 'play' },
    { type: 'livesource', label: 'Entrada HDMI / USB (ao vivo)', icon: 'live' },
    { type: 'screen', label: 'Captura de tela / janela', icon: 'film' },
    { type: 'pptx', label: 'Apresentação (PPTX / PDF)', icon: 'image' },
    { type: 'stream', label: 'Stream ao vivo (IPTV/HLS)', icon: 'live' },
    { type: 'holyrics', label: 'Holyrics (letra ao vivo)', icon: 'quote' },
    { type: 'birthdayauto', label: 'Aniversariantes (automático)', icon: 'cake' },
    { type: 'birthdaycard', label: 'Cartão de Aniversário', icon: 'gift' },
    { type: 'birthday', label: 'Lista de Aniversariantes', icon: 'cake' },
    { type: 'weatherpro', label: 'Painel do Clima', icon: 'cloud' },
    { type: 'traffic', label: 'Trânsito (Waze)', icon: 'car' },
    { type: 'map', label: 'Mapa da Região', icon: 'pin' },
    { type: 'spotlight', label: 'Destaque de Pessoa', icon: 'star' },
    { type: 'agenda', label: 'Agenda / Programação', icon: 'calendar' },
    { type: 'quote', label: 'Frase do Dia', icon: 'quote' },
    { type: 'kpi', label: 'Indicador (KPI)', icon: 'chart' },
    { type: 'promo', label: 'Promoção / Produto', icon: 'tag' },
    { type: 'poster', label: 'Arte / Poster (IA)', icon: 'image' },
    { type: 'composicao', label: 'Composição (editor livre)', icon: 'image' },
    { type: 'social', label: 'Redes Sociais', icon: 'share' },
    { type: 'clock', label: 'Relógio', icon: 'clock' },
    { type: 'weather', label: 'Clima (simples)', icon: 'cloud' },
    { type: 'web', label: 'Página Web', icon: 'globe' },
    { type: 'qrcode', label: 'QR Code', icon: 'qr' },
    { type: 'mural', label: 'Mural de fotos (QR do público)', icon: 'qr' },
  ];

  global.MTRender = { renderItem, ITEM_TYPES, ANN_VARIANTS, extractYouTubeId };
})(window);
