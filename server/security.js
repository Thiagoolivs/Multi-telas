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

/* ---------------- Cabeçalhos de segurança ---------------- */

/*
 * O que o navegador PODE fazer com as nossas páginas.
 *
 * Isto não existia. Um painel com login, upload e chave de IA sem nenhum
 * cabeçalho é um convite: qualquer texto que escape do escape vira script
 * rodando na sessão de quem está logado.
 *
 * A regra central é `script-src 'self'`: script só entra se vier de um arquivo
 * nosso. Script embutido na página fica proibido — foi por isso que o bloco
 * que morava dentro de player.html virou js/boot.js. Enquanto existisse um
 * único script embutido, a regra teria de abrir a porta para todos, e é
 * justamente por essa porta que passa a injeção.
 *
 * O que continua aberto, e por quê:
 *
 *   style 'unsafe-inline'   O editor e o player escrevem estilo direto no
 *                           elemento (posição, cor, sombra em % da peça). Sem
 *                           isto, a peça não desenha. Estilo embutido não
 *                           executa código; é um risco muito menor.
 *   img/media/connect https:  A mídia do cliente vive no R2, em outro domínio,
 *                           e o endereço muda por conta. Amarrar num host
 *                           quebraria toda conta que usasse outro bucket.
 *   frame https:            A TV embute YouTube, o visualizador do Office e a
 *                           página web que o cliente escolher.
 *   fonts.googleapis        As famílias tipográficas da peça.
 */
const CSP = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "form-action 'self'",
  "frame-ancestors 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com data:",
  "img-src 'self' data: blob: https:",
  "media-src 'self' blob: https:",
  "connect-src 'self' https:",
  "frame-src https:",
  "worker-src 'self'",
].join('; ');

/*
 * `seguro` liga o HSTS, que promete ao navegador "daqui em diante só https".
 * É uma promessa de um ano e não dá para voltar atrás com facilidade: ligá-la
 * num ambiente que ainda atende http trancaria o próprio dono para fora.
 */
function cabecalhosSeguranca(seguro) {
  const h = {
    'Content-Security-Policy': CSP,
    // Impede o navegador de "adivinhar" que um upload .txt é, na verdade, HTML.
    'X-Content-Type-Options': 'nosniff',
    // Para navegador antigo que ainda não entende frame-ancestors.
    'X-Frame-Options': 'SAMEORIGIN',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    // A câmera fica de fora da lista: o mural recebe foto tirada na hora.
    'Permissions-Policy': 'geolocation=(), microphone=(), payment=(), usb=()',
  };
  if (seguro) h['Strict-Transport-Security'] = 'max-age=31536000; includeSubDomains';
  return h;
}

module.exports = { rateLimit, clientIp, safeEqual, isSecureRequest, cabecalhosSeguranca, CSP };

