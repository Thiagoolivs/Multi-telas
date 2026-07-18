/*
 * cloud.js — cliente do controle remoto na nuvem (MVP).
 *
 * Dois papéis:
 *   - TV (player em "modo nuvem"): cria/retoma um device, mostra o código de
 *     pareamento, busca a config e assina atualizações em tempo real (SSE).
 *   - Celular (admin): pareia informando o código e envia a config para a TV.
 *
 * Sem autenticação neste MVP (device + código). A base da API é a mesma
 * origem que serve o app (server.js). Ver docs/PLANO-SAAS.md para a evolução.
 */
(function (global) {
  'use strict';

  const API = ''; // mesma origem
  const DEVICE_KEY = 'vistra.cloudDeviceId';   // guardado na TV
  const CONTROL_KEY = 'vistra.controlDeviceId'; // guardado no celular

  function qs(name) {
    return new URLSearchParams(global.location.search).get(name);
  }

  async function api(method, path, body) {
    const opt = { method, headers: {} };
    if (body !== undefined) { opt.headers['Content-Type'] = 'application/json'; opt.body = JSON.stringify(body); }
    const res = await fetch(API + path, opt);
    if (res.status === 204) return null;
    const data = await res.json().catch(() => null);
    if (!res.ok) throw new Error((data && data.error) || ('HTTP ' + res.status));
    return data;
  }

  /* ---------------- Lado TV (device) ---------------- */
  // Modo nuvem ligado por ?cloud=1 na URL ou por já ter um device salvo.
  function deviceMode() {
    return qs('cloud') === '1' || !!localStorage.getItem(DEVICE_KEY);
  }

  // Garante um device: retoma o salvo (se ainda existir) ou cria um novo.
  async function ensureDevice() {
    let id = localStorage.getItem(DEVICE_KEY);
    if (id) {
      try {
        const meta = await api('GET', '/api/devices/' + id);
        return { id: meta.id, code: meta.code, paired: meta.paired };
      } catch (e) { localStorage.removeItem(DEVICE_KEY); id = null; }
    }
    const created = await api('POST', '/api/devices');
    localStorage.setItem(DEVICE_KEY, created.id);
    return { id: created.id, code: created.code, paired: false };
  }

  async function fetchConfig(id) {
    return api('GET', '/api/devices/' + id + '/config'); // null se ainda não pareado
  }

  // Assina atualizações; chama onConfig(config) sempre que a config mudar.
  function subscribe(id, onConfig) {
    let es;
    function connect() {
      es = new EventSource(API + '/api/devices/' + id + '/events');
      es.addEventListener('config', async () => {
        try { const cfg = await fetchConfig(id); if (cfg) onConfig(cfg); } catch (e) {}
      });
      es.onerror = () => { /* EventSource tenta reconectar sozinho */ };
    }
    connect();
    return { close: () => es && es.close() };
  }

  /* ---------------- Lado celular (controle) ---------------- */
  async function pair(code) {
    const d = await api('POST', '/api/pair', { code: String(code || '').trim().toUpperCase() });
    localStorage.setItem(CONTROL_KEY, d.id);
    return d;
  }
  function controlledDeviceId() { return localStorage.getItem(CONTROL_KEY) || ''; }
  function disconnect() { localStorage.removeItem(CONTROL_KEY); }
  async function pushConfig(id, config) {
    return api('PUT', '/api/devices/' + id + '/config', config);
  }

  global.MTCloud = {
    deviceMode, ensureDevice, fetchConfig, subscribe,
    pair, controlledDeviceId, disconnect, pushConfig,
  };
})(window);
