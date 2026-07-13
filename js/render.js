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

  /* ---------- Utilidades de clima (Open-Meteo, sem chave/API key) ---------- */
  const weatherCache = {};
  async function fetchWeather(cidade) {
    const key = (cidade || '').toLowerCase();
    const now = Date.now();
    if (weatherCache[key] && now - weatherCache[key].t < 15 * 60 * 1000) {
      return weatherCache[key].data;
    }
    const geoUrl =
      'https://geocoding-api.open-meteo.com/v1/search?count=1&language=pt&name=' +
      encodeURIComponent(cidade);
    const geo = await (await fetch(geoUrl)).json();
    if (!geo.results || !geo.results.length) throw new Error('cidade não encontrada');
    const { latitude, longitude, name } = geo.results[0];
    const wUrl =
      'https://api.open-meteo.com/v1/forecast?current=temperature_2m,weather_code' +
      '&timezone=auto&latitude=' + latitude + '&longitude=' + longitude;
    const w = await (await fetch(wUrl)).json();
    const data = {
      nome: name,
      temp: Math.round(w.current.temperature_2m),
      code: w.current.weather_code,
    };
    weatherCache[key] = { t: now, data };
    return data;
  }

  const WEATHER_ICON = {
    0: '☀️', 1: '🌤️', 2: '⛅', 3: '☁️',
    45: '🌫️', 48: '🌫️',
    51: '🌦️', 53: '🌦️', 55: '🌧️',
    61: '🌧️', 63: '🌧️', 65: '🌧️',
    71: '🌨️', 73: '🌨️', 75: '❄️',
    80: '🌦️', 81: '🌧️', 82: '⛈️',
    95: '⛈️', 96: '⛈️', 99: '⛈️',
  };
  function weatherIcon(code) {
    return WEATHER_ICON[code] || '🌡️';
  }

  /* ---------- Renderizadores por tipo ---------- */
  const RENDERERS = {
    text: renderText,
    notice: renderText,
    image: renderImage,
    video: renderVideo,
    youtube: renderYouTube,
    clock: renderClock,
    weather: renderWeather,
    web: renderWeb,
    qrcode: renderQr,
  };

  function renderText(item) {
    const el = div('mt-slide mt-text');
    el.style.background = item.bg || '#0d6efd';
    el.style.color = item.cor || '#ffffff';
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
    return { el, duration: item.duracao || 8 };
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
    const id = extractYouTubeId(item.videoId || item.src || '');
    const iframe = document.createElement('iframe');
    iframe.allow = 'autoplay; encrypted-media';
    iframe.setAttribute('frameborder', '0');
    iframe.src =
      'https://www.youtube.com/embed/' + id +
      '?autoplay=1&mute=1&controls=0&rel=0&modestbranding=1&playsinline=1' +
      (item.loop ? '&loop=1&playlist=' + id : '');
    el.appendChild(iframe);
    return { el, duration: item.duracao || 20 };
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
  const ITEM_TYPES = [
    { type: 'text', label: 'Texto / Comunicado', icon: '📝' },
    { type: 'notice', label: 'Aviso', icon: '📢' },
    { type: 'image', label: 'Imagem', icon: '🖼️' },
    { type: 'video', label: 'Vídeo (MP4)', icon: '🎬' },
    { type: 'youtube', label: 'YouTube', icon: '▶️' },
    { type: 'clock', label: 'Relógio', icon: '🕐' },
    { type: 'weather', label: 'Clima', icon: '🌦️' },
    { type: 'web', label: 'Página Web', icon: '🌐' },
    { type: 'qrcode', label: 'QR Code', icon: '🔳' },
  ];

  global.MTRender = { renderItem, ITEM_TYPES, extractYouTubeId };
})(window);
