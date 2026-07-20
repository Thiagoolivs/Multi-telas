/*
 * server/auth.js — hashing de senha e sessões por cookie.
 * Usa só o módulo crypto nativo (scrypt). Sem dependências.
 */
const crypto = require('crypto');
const db = require('./db');

const SESSION_DAYS = 30;
const COOKIE = 'vistra_session';

/* ---------------- Senha ---------------- */
function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return salt + ':' + hash;
}
function verifyPassword(password, stored) {
  const [salt, hash] = String(stored || '').split(':');
  if (!salt || !hash) return false;
  const test = crypto.scryptSync(String(password), salt, 64).toString('hex');
  const a = Buffer.from(hash, 'hex');
  const b = Buffer.from(test, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/* ---------------- Sessão ---------------- */
function startSession(res, userId, tenantId) {
  const token = crypto.randomBytes(24).toString('hex');
  const expires = Date.now() + SESSION_DAYS * 864e5;
  db.createSession(token, userId, tenantId, expires);
  const maxAge = SESSION_DAYS * 86400;
  res.setHeader('Set-Cookie',
    COOKIE + '=' + token + '; HttpOnly; Path=/; Max-Age=' + maxAge + '; SameSite=Lax');
  return token;
}
function clearSession(res, token) {
  if (token) db.destroySession(token);
  res.setHeader('Set-Cookie', COOKIE + '=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax');
}
function parseCookies(req) {
  const out = {};
  (req.headers.cookie || '').split(';').forEach((p) => {
    const i = p.indexOf('=');
    if (i > 0) out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim());
  });
  return out;
}
// Retorna a sessão válida (com tenant_id/user_id) ou null.
function currentSession(req) {
  const token = parseCookies(req)[COOKIE];
  if (!token) return null;
  const s = db.getSession(token);
  return s ? Object.assign({ token }, s) : null;
}

module.exports = { hashPassword, verifyPassword, startSession, clearSession, currentSession, COOKIE };
