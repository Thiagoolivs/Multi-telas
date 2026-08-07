/*
 * cloud.js — cliente do controle remoto na nuvem (multi-tenant).
 *
 *   - TV (player "modo nuvem"): cria/retoma um device (id + device token),
 *     mostra o código de pareamento, busca a config e assina atualizações
 *     em tempo real (SSE). O device token prova que é aquela TV.
 *   - Celular (admin): faz login, pareia o código (o device passa a
 *     pertencer à conta) e envia a config.
 *
 * Cookies de sessão fluem automaticamente (mesma origem). Ver server/.
 */
(function (global) {
  'use strict';

  const API = '';

  function qsp(name) { return new URLSearchParams(global.location.search).get(name); }

  /*
   * As chaves nasceram com o prefixo "vistra." e passaram a "mt." na troca de
   * marca. migrateKey() copia o valor antigo na primeira vez, então nenhuma TV
   * já pareada perde o vínculo.
   */
  function migrateKey(novo, antigo) {
    try {
      if (localStorage.getItem(novo) === null) {
        const v = localStorage.getItem(antigo);
        if (v !== null) localStorage.setItem(novo, v);
      }
      localStorage.removeItem(antigo);
    } catch (e) {}
    return novo;
  }

  const CONTROL_KEY = migrateKey('mt.controlDeviceId', 'vistra.controlDeviceId');

  // "pid" isola a instância: cada player (mesmo no mesmo navegador) tem seu
  // próprio device/código. Permite testar várias telas na mesma máquina.
  const _pidSfx = qsp('pid') ? ':' + qsp('pid') : '';
  const DEVICE_KEY = migrateKey('mt.cloudDeviceId' + _pidSfx, 'vistra.cloudDeviceId' + _pidSfx);
  const DTOKEN_KEY = migrateKey('mt.cloudDeviceToken' + _pidSfx, 'vistra.cloudDeviceToken' + _pidSfx);

  /*
   * Esquece a TV guardada neste navegador. O par id+token fica em
   * localStorage para a TV sobreviver a recargas — o efeito colateral é que
   * "abrir outro player" reaproveitava a MESMA tela (parecia cache do
   * navegador). resetDevice() força uma tela nova, com código novo.
   */
  function resetDevice() {
    try {
      localStorage.removeItem(DEVICE_KEY);
      localStorage.removeItem(DTOKEN_KEY);
      localStorage.removeItem('mt.lastConfig'); // não herda a exibição da tela antiga
      localStorage.removeItem('mt.birthdays');
    } catch (e) {}
  }

  async function api(method, path, body, headers) {
    const opt = { method, headers: Object.assign({}, headers), credentials: 'same-origin' };
    if (body !== undefined) { opt.headers['Content-Type'] = 'application/json'; opt.body = JSON.stringify(body); }
    const res = await fetch(API + path, opt);
    if (res.status === 204) return null;
    const data = await res.json().catch(() => null);
    if (!res.ok) { const e = new Error((data && data.error) || ('HTTP ' + res.status)); e.status = res.status; throw e; }
    return data;
  }

  /* ---------------- Autenticação (lado celular) ---------------- */
  async function signup(email, password, name) { return api('POST', '/api/auth/signup', { email, password, name }); }
  async function login(email, password) { return api('POST', '/api/auth/login', { email, password }); }
  async function logout() { return api('POST', '/api/auth/logout'); }
  async function me() { try { return await api('GET', '/api/auth/me'); } catch (e) { return null; } }

  /* ---------------- Lado TV (device) ---------------- */
  function deviceMode() { return qsp('cloud') === '1' || !!localStorage.getItem(DEVICE_KEY); }

  function deviceToken() { return localStorage.getItem(DTOKEN_KEY) || ''; }
  // Manda o device token no header (não vaza em logs/URLs).
  function dtHeader() { return { 'x-device-token': deviceToken() }; }

  async function ensureDevice() {
    // ?new=1 → esta aba é uma TV nova. Limpa a URL depois para que um F5 não
    // fique gerando telas novas a cada recarga.
    if (qsp('new') === '1') {
      resetDevice();
      try {
        const u = new URL(global.location.href);
        u.searchParams.delete('new');
        history.replaceState(null, '', u.pathname + (u.search || '') + u.hash);
      } catch (e) {}
    }
    let id = localStorage.getItem(DEVICE_KEY);
    let dt = localStorage.getItem(DTOKEN_KEY);
    if (id && dt) {
      try {
        const meta = await api('GET', '/api/devices/' + id, undefined, { 'x-device-token': dt });
        return { id: meta.id, code: meta.code, paired: meta.paired };
      } catch (e) { localStorage.removeItem(DEVICE_KEY); localStorage.removeItem(DTOKEN_KEY); }
    }
    const created = await api('POST', '/api/devices');
    localStorage.setItem(DEVICE_KEY, created.id);
    localStorage.setItem(DTOKEN_KEY, created.deviceToken);
    return { id: created.id, code: created.code, paired: false };
  }

  async function fetchConfig(id) {
    return api('GET', '/api/devices/' + id + '/config', undefined, dtHeader());
  }
  // Relação de aniversariantes do tenant desta TV (para exibição automática).
  async function fetchBirthdays(id) {
    const r = await api('GET', '/api/devices/' + id + '/birthdays', undefined, dtHeader());
    return (r && r.birthdays) || [];
  }
  // Avisa o servidor que a TV está viva (alimenta o status da frota).
  async function heartbeat(id) {
    try { await api('POST', '/api/devices/' + id + '/heartbeat', undefined, dtHeader()); }
    catch (e) { /* offline: tenta de novo no próximo ciclo */ }
  }
  // A TV conta ao servidor o que está tocando, para o painel mostrar de verdade
  // em vez de adivinhar pelo último comando enviado.
  async function reportAudio(id, estado) {
    try { await api('POST', '/api/devices/' + id + '/audio-estado', estado, dtHeader()); }
    catch (e) { /* offline: o painel mostra "sem notícia" */ }
  }
  function subscribe(id, onConfig) {
    let es;
    function connect() {
      es = new EventSource(API + '/api/devices/' + id + '/events?dt=' + encodeURIComponent(deviceToken()));
      es.addEventListener('config', async () => {
        try { const cfg = await fetchConfig(id); if (cfg) onConfig(cfg); } catch (e) {}
      });
      /*
       * Som: comando ao vivo do painel (tocar/pausar/pular/volume). Não é
       * config nova — recarregar a tela aqui cortaria a música no meio, que é
       * justo o contrário do que quem mexeu no volume queria.
       */
      es.addEventListener('som', (ev) => {
        let dado = {};
        try { dado = JSON.parse(ev.data || '{}'); } catch (e) {}
        document.dispatchEvent(new CustomEvent('mt:som', { detail: dado }));
      });
      /*
       * Mural: chegou (ou saiu) foto do público. Não é config nova — recarregar
       * a tela inteira aqui apagaria o slide no meio. Vira um evento no
       * documento e quem estiver mostrando o mural se atualiza sozinho.
       */
      es.addEventListener('mural', (ev) => {
        let dado = {};
        try { dado = JSON.parse(ev.data || '{}'); } catch (e) {}
        document.dispatchEvent(new CustomEvent('mt:mural', { detail: dado }));
      });
      es.onerror = () => { /* reconecta sozinho */ };
    }
    connect();
    return { close: () => es && es.close() };
  }

  /* ---------------- Lado celular (controle) ---------------- */
  async function pair(code, name) {
    const d = await api('POST', '/api/pair', { code: String(code || '').trim().toUpperCase(), name });
    localStorage.setItem(CONTROL_KEY, d.id);
    return d;
  }
  function controlledDeviceId() { return localStorage.getItem(CONTROL_KEY) || ''; }
  function disconnect() { localStorage.removeItem(CONTROL_KEY); }
  async function listDevices() { return api('GET', '/api/devices'); }
  async function pushConfig(id, config) { return api('PUT', '/api/devices/' + id + '/config', config); }

  global.MTCloud = {
    signup, login, logout, me,
    deviceMode, ensureDevice, resetDevice, fetchConfig, fetchBirthdays, subscribe, heartbeat, reportAudio,
    pair, controlledDeviceId, disconnect, listDevices, pushConfig,
  };
})(window);
