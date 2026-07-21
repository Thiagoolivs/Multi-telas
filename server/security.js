/*
 * server/security.js — utilidades de segurança sem dependências.
 *
 *   - rateLimit: janela fixa em memória (por processo). Trava força-bruta em
 *     login/cadastro/pareamento. Single-node por enquanto; ao escalar
 *     horizontal, trocar por Redis (mesmo caminho do SSE).
 *   - clientIp: IP real respeitando o proxy (x-forwarded-for).
 *   - safeEqual: comparação de tempo constante (tokens/segredos).
 *   - isSecureRequest: detecta HTTPS (direto ou atrás de proxy) p/ cookie Secure.
 */
const crypto = require('crypto');

const buckets = new Map();

// Retorna { ok, remaining, retryAfter(segundos) }. Conta a tentativa atual.
function rateLimit(key, max, windowMs) {
  const now = Date.now();
  let b = buckets.get(key);
  if (!b || now > b.reset) { b = { count: 0, reset: now + windowMs }; buckets.set(key, b); }
  b.count++;
  return {
    ok: b.count <= max,
    remaining: Math.max(0, max - b.count),
    retryAfter: Math.max(1, Math.ceil((b.reset - now) / 1000)),
  };
}

// Limpeza periódica dos baldes expirados (não segura o event loop).
const sweep = setInterval(() => {
  const now = Date.now();
  for (const [k, b] of buckets) if (now > b.reset) buckets.delete(k);
}, 60000);
if (sweep.unref) sweep.unref();

function clientIp(req) {
  const xf = req.headers['x-forwarded-for'];
  if (xf) return String(xf).split(',')[0].trim();
  return (req.socket && req.socket.remoteAddress) || 'unknown';
}

function safeEqual(a, b) {
  const ab = Buffer.from(String(a == null ? '' : a));
  const bb = Buffer.from(String(b == null ? '' : b));
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

// HTTPS direto (socket TLS) ou atrás de proxy (x-forwarded-proto), ou forçado
// por env em ambientes onde o proxy não seta o header.
function isSecureRequest(req) {
  if (process.env.SECURE_COOKIES === '1') return true;
  if (req.socket && req.socket.encrypted) return true;
  const proto = req.headers['x-forwarded-proto'];
  return !!proto && String(proto).split(',')[0].trim() === 'https';
}

module.exports = { rateLimit, clientIp, safeEqual, isSecureRequest };
