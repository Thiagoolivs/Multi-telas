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
    stream: renderStream,
    birthday: renderBirthday,
    birthdaycard: renderBirthdayCard,
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
    web: renderWeb,
    qrcode: renderQr,
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
    v.muted = item.muted !== false; // por padrão sem som (TVs)
    v.autoplay = true;
    v.playsInline = true;
    v.loop = !!item.loop;
    v.style.objectFit = item.fit || 'contain';
    el.appendChild(v);
    // Se não houver duração fixa, avança ao terminar o vídeo.
    let onEnter = function (advance) {
      const tryPlay = () => v.play().catch(() => {});
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
    el.style.background = item.bg || '#0b1220';
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
    el.style.background = item.bg || '#0b1f33';
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
          inner.textContent = 'Clima indisponível';
        }
      },
    };
  }

  /* ---------- Painel do clima (estilo dashboard, com previsão) ---------- */
  function renderWeatherPro(item) {
    const el = div('mt-slide mt-wpro');
    if (item.bg) el.style.background = item.bg;
    const inner = div('mt-wpro-inner');
    inner.innerHTML = '<div class="mt-wpro-loading">Carregando clima…</div>';
    el.appendChild(inner);
    let timer = null;

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
        inner.innerHTML = html;
      } catch (e) {
        inner.innerHTML = '<div class="mt-wpro-loading">Clima indisponível</div>';
      }
    }

    return {
      el,
      duration: item.duracao || 0,
      onEnter: () => { load(); timer = setInterval(load, 15 * 60 * 1000); },
      onLeave: () => timer && clearInterval(timer),
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
    el.style.background = item.bg || '#0c1c4d';

    el.innerHTML = bcConfetti() +
      bcBalloon('#ff5da2', 'bc-b1') + bcBalloon('#4f8cff', 'bc-b2') +
      bcBalloon('#ffb454', 'bc-b3') + bcBalloon('#39d0c4', 'bc-b4');

    const inner = div('bc-inner');

    // Foto (ou iniciais) com chapéu e fita.
    const photoWrap = div('bc-photo-wrap');
    if (item.foto) {
      const img = document.createElement('img');
      img.className = 'bc-photo';
      img.src = item.foto;
      img.alt = '';
      photoWrap.appendChild(img);
    } else {
      const initials = div('bc-photo bc-initials');
      initials.textContent = (item.nome || '?')
        .split(/\s+/).map((p) => p[0]).join('').slice(0, 2).toUpperCase();
      photoWrap.appendChild(initials);
    }
    const hat = div('bc-hat-wrap');
    hat.innerHTML = BC_HAT;
    photoWrap.appendChild(hat);
    const ribbon = div('bc-ribbon');
    ribbon.textContent = 'Feliz aniversário!';
    photoWrap.appendChild(ribbon);

    // Texto principal.
    const txt = div('bc-text');
    const title = div('bc-title');
    const t1 = document.createElement('strong');
    t1.textContent = 'Parabéns';
    title.appendChild(t1);
    title.appendChild(document.createTextNode(', ' + (item.nome || '') + '!'));
    const msg = div('bc-msg');
    msg.textContent = item.mensagem || 'Que hoje o seu dia seja o mais feliz de todos!';
    const sign = div('bc-sign');
    sign.textContent = 'feliz aniversário';
    txt.appendChild(title);
    txt.appendChild(msg);
    txt.appendChild(sign);

    inner.appendChild(photoWrap);
    inner.appendChild(txt);
    el.appendChild(inner);
    return { el, duration: item.duracao || 15 };
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
    el.style.background =
      'radial-gradient(85% 85% at 82% 8%, ' + hexToRgba(cor, .28) + ' 0%, rgba(0,0,0,0) 55%),' +
      'radial-gradient(70% 70% at 8% 95%, ' + hexToRgba(cor, .16) + ' 0%, rgba(0,0,0,0) 55%),' +
      'linear-gradient(165deg, ' + blendHex('#0a1128', cor, .22) + ', #0a1128 70%)';

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

  function renderWeb(item) {
    const el = div('mt-slide mt-web');
    const iframe = document.createElement('iframe');
    iframe.setAttribute('frameborder', '0');
    iframe.src = item.url;
    el.appendChild(iframe);
    return { el, duration: item.duracao || 20 };
  }

  function renderQr(item) {
    const el = div('mt-slide mt-qr');
    el.style.background = item.bg || '#ffffff';
    const inner = div('mt-qr-inner');
    const img = document.createElement('img');
    img.src =
      'https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=' +
      encodeURIComponent(item.data || '');
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
    { type: 'stream', label: 'Stream ao vivo (IPTV/HLS)', icon: 'live' },
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
    { type: 'social', label: 'Redes Sociais', icon: 'share' },
    { type: 'clock', label: 'Relógio', icon: 'clock' },
    { type: 'weather', label: 'Clima (simples)', icon: 'cloud' },
    { type: 'web', label: 'Página Web', icon: 'globe' },
    { type: 'qrcode', label: 'QR Code', icon: 'qr' },
  ];

  global.MTRender = { renderItem, ITEM_TYPES, ANN_VARIANTS, extractYouTubeId };
})(window);
