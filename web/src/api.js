/*
 * api.js — cliente HTTP do painel React.
 *
 * Espelha o contrato do server/ (mesma origem, cookie de sessão automático).
 * Mantido pequeno de propósito: uma função `api()` e helpers nomeados por
 * endpoint, para as telas não lidarem com fetch cru.
 */
async function api(method, path, body) {
  const opt = { method, headers: {}, credentials: 'same-origin' };
  if (body !== undefined) {
    opt.headers['Content-Type'] = 'application/json';
    opt.body = JSON.stringify(body);
  }
  const res = await fetch(path, opt);
  if (res.status === 204) return null;
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const e = new Error((data && data.error) || 'HTTP ' + res.status);
    e.status = res.status;
    throw e;
  }
  return data;
}

export const auth = {
  me: () => api('GET', '/api/auth/me').catch(() => null),
  signup: (payload) => api('POST', '/api/auth/signup', payload),
  login: (email, password) => api('POST', '/api/auth/login', { email, password }),
  logout: () => api('POST', '/api/auth/logout'),
  // Quais formas de login este servidor oferece (Google, e-mail de reset).
  config: () => api('GET', '/api/auth/config').catch(() => ({ google: false, mail: false })),
  forgot: (email) => api('POST', '/api/auth/forgot', { email }),
  reset: (token, password) => api('POST', '/api/auth/reset', { token, password }),
  updateProfile: (payload) => api('POST', '/api/auth/profile', payload),
  changePassword: (atual, nova) => api('POST', '/api/auth/password', { atual, nova }),
};

export const team = {
  list: () => api('GET', '/api/team'),
  invite: (email, role) => api('POST', '/api/team/invites', { email, role }),
  revokeInvite: (id) => api('DELETE', '/api/team/invites/' + id),
  setRole: (id, role) => api('POST', '/api/team/members/' + id + '/role', { role }),
  remove: (id) => api('DELETE', '/api/team/members/' + id),
};

export const devices = {
  list: () => api('GET', '/api/devices'),
  pair: (code, name) => api('POST', '/api/pair', { code: String(code || '').trim().toUpperCase(), name }),
  rename: (id, name) => api('POST', '/api/devices/' + id + '/rename', { name }),
  remove: (id) => api('DELETE', '/api/devices/' + id),
};

export const deviceConfig = {
  // GET retorna null quando a tela ainda não tem config (204 no servidor).
  get: (id) => api('GET', '/api/devices/' + id + '/config'),
  save: (id, config) => api('PUT', '/api/devices/' + id + '/config', config),
};

export const ai = {
  generate: (brief, opts) => api('POST', '/api/ai/generate-content', { brief, ...(opts || {}) }),
  campaign: (payload) => api('POST', '/api/ai/generate-campaign', payload),
  composition: (payload) => api('POST', '/api/ai/generate-composition', payload),
  kit: (payload) => api('POST', '/api/ai/generate-kit', payload),
  image: (payload) => api('POST', '/api/ai/generate-image', payload),
};

export const brand = {
  get: () => api('GET', '/api/brand'),
  save: (kit) => api('PUT', '/api/brand', kit),
  addAsset: (kind, url, label) => api('POST', '/api/brand/assets', { kind, url, label }),
  removeAsset: (id) => api('DELETE', '/api/brand/assets/' + id),
};

export const library = {
  list: () => api('GET', '/api/library'),
  save: (campaign, pieces) => api('POST', '/api/library', { campaign, pieces }),
  update: (id, item, label) => api('PUT', '/api/library/' + id, { item, label }),
  remove: (id) => api('DELETE', '/api/library/' + id),
};

export const birthdays = {
  list: () => api('GET', '/api/birthdays'),
  import: (rows) => api('POST', '/api/birthdays/import', { rows }),
  clear: () => api('DELETE', '/api/birthdays'),
};

export const billing = {
  get: () => api('GET', '/api/billing'),
  checkout: (plan) => api('POST', '/api/billing/checkout', { plan }),
  portal: () => api('POST', '/api/billing/portal'),
};

export const media = {
  list: () => api('GET', '/api/media'),
  remove: (id) => api('DELETE', '/api/media/' + id),
  // Upload de bytes crus (o navegador manda o File direto). Retorna { url, ... }.
  async upload(file) {
    const qs = '?name=' + encodeURIComponent(file.name || 'arquivo') + '&mime=' + encodeURIComponent(file.type || '');
    const res = await fetch('/api/media' + qs, { method: 'POST', body: file, credentials: 'same-origin' });
    const data = await res.json().catch(() => null);
    if (!res.ok) { const e = new Error((data && data.error) || ('HTTP ' + res.status)); e.status = res.status; throw e; }
    return data;
  },
};

export default api;
