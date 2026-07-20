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
  signup: (email, password, name) => api('POST', '/api/auth/signup', { email, password, name }),
  login: (email, password) => api('POST', '/api/auth/login', { email, password }),
  logout: () => api('POST', '/api/auth/logout'),
};

export const devices = {
  list: () => api('GET', '/api/devices'),
  pair: (code, name) => api('POST', '/api/pair', { code: String(code || '').trim().toUpperCase(), name }),
  rename: (id, name) => api('POST', '/api/devices/' + id + '/rename', { name }),
  remove: (id) => api('DELETE', '/api/devices/' + id),
};

export default api;
