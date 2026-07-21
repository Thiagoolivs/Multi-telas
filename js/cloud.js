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
  const DEVICE_KEY = 'vistra.cloudDeviceId';
  const DTOKEN_KEY = 'vistra.cloudDeviceToken';
  const CONTROL_KEY = 'vistra.controlDeviceId';

  function qsp(name) { return new URLSearchParams(global.location.search).get(name); }

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
  // Avisa o servidor que a TV está viva (alimenta o status da frota).
  async function heartbeat(id) {
    try { await api('POST', '/api/devices/' + id + '/heartbeat', undefined, dtHeader()); }
    catch (e) { /* offline: tenta de novo no próximo ciclo */ }
  }
  function subscribe(id, onConfig) {
    let es;
    function connect() {
      es = new EventSource(API + '/api/devices/' + id + '/events?dt=' + encodeURIComponent(deviceToken()));
      es.addEventListener('config', async () => {
        try { const cfg = await fetchConfig(id); if (cfg) onConfig(cfg); } catch (e) {}
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
    deviceMode, ensureDevice, fetchConfig, subscribe, heartbeat,
    pair, controlledDeviceId, disconnect, listDevices, pushConfig,
  };
})(window);
