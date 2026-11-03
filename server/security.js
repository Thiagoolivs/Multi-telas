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

/*
 * Só CONFERE o balde, sem contar. Para os limites que contam só o que deu
 * errado (o pareamento, QA de lançamento, 03/11): pergunta antes, e quem conta
 * é o `rateLimit` depois, se a tentativa falhou.
 */
function rateLimitConsultar(key, max) {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || now > b.reset) return { ok: true, remaining: max, retryAfter: 0 };
  return { ok: b.count < max, remaining: Math.max(0, max - b.count), retryAfter: Math.max(1, Math.ceil((b.reset - now) / 1000)) };
}

/* "3 minutos", "1 minuto", "40 segundos": o 429 diz quanto esperar, em palavras. */
function esperaEmPalavras(segundos) {
  const s = Math.max(1, Math.ceil(Number(segundos) || 0));
  if (s < 60) return s + (s === 1 ? ' segundo' : ' segundos');
  const m = Math.ceil(s / 60);
  return m + (m === 1 ? ' minuto' : ' minutos');
}

/*
 * QUANTOS PROXIES DE CONFIANÇA estão na frente deste servidor.
 *
 * O IP do cliente vinha do PRIMEIRO item do X-Forwarded-For, que é
 * justamente o que o próprio cliente escreve: qualquer um mandava o cabeçalho
 * com um IP inventado e pulava todo limite por IP (login, cadastro,
 * pareamento). O QA de lançamento (03/11) fez exatamente isso para continuar
 * o teste depois de um 429.
 *
 * Proxy que repassa ACRESCENTA ao FIM da lista o endereço de quem falou com
 * ele. Então, com N proxies nossos na frente, o IP verdadeiro é o N-ésimo a
 * contar do fim; o que vem antes disso foi escrito por quem fez o pedido e
 * não vale nada.
 *
 *   TRUST_PROXY=0      ninguém na frente: vale o IP da conexão (o cabeçalho é ignorado)
 *   TRUST_PROXY=N      N proxies de confiança (o N-ésimo do fim)
 *   sem TRUST_PROXY    no Railway (RAILWAY_ENVIRONMENT definido) 1: a borda
 *                      do Railway é o único proxy e põe o IP de quem a
 *                      chamou no fim da lista (o ÚLTIMO item); fora dele, 0.
 *
 * Atrás de mais uma camada (Cloudflare na frente do Railway, por exemplo),
 * defina TRUST_PROXY=2 — senão o "cliente" vira o IP do Cloudflare e todo
 * mundo divide o mesmo balde.
 */
function proxiesDeConfianca() {
  const v = process.env.TRUST_PROXY;
  if (v != null && String(v).trim() !== '') {
    const n = Math.floor(Number(v));
    return Number.isFinite(n) && n > 0 ? Math.min(n, 10) : 0;
  }
  return process.env.RAILWAY_ENVIRONMENT ? 1 : 0;
}

function clientIp(req) {
  const direto = (req.socket && req.socket.remoteAddress) || 'unknown';
  const saltos = proxiesDeConfianca();
  if (!saltos) return direto;
  const lista = String(req.headers['x-forwarded-for'] || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (!lista.length) return direto;
  return lista[Math.max(0, lista.length - saltos)];
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
 *
 * Fonte de terceiro NÃO está mais na lista, e a ausência é a mudança: as
 * famílias são servidas do próprio domínio (fonts/fontes.css). Enquanto vinham
 * da Google, `style-src` e `font-src` precisavam abrir dois hosts externos —
 * e, pior, a TV numa rede que bloqueasse esses hosts desenhava com a fonte de
 * sistema, mais larga, estourando o texto que o compositor tinha medido. Tirar
 * o host da política é o que garante que ninguém volte a apontar para lá sem
 * perceber: se voltar, o navegador recusa e o defeito aparece no primeiro
 * teste, não na parede do cliente.
 */
const CSP = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "form-action 'self'",
  "frame-ancestors 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self' data:",
  "img-src 'self' data: blob: https:",
  "media-src 'self' blob: https:",
  "connect-src 'self' https:",
  // 'self': a TV em pé roda o player dentro de uma moldura girada (player.js).
  "frame-src 'self' https:",
  "worker-src 'self'",
].join('; ');

/*
 * A mesma política, com o Google tag (GA4) liberado. Vale SÓ nas páginas que
 * recebem a tag — a landing e o painel em produção (server.js, comGoogleTag);
 * o player e o resto seguem com `script-src 'self'` puro. O envio dos dados já
 * passa por connect/img `https:`.
 */
const CSP_COM_GOOGLE = CSP.replace("script-src 'self'", "script-src 'self' https://www.googletagmanager.com");

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

/*
 * DEFESA DE CSRF EM PROFUNDIDADE (QA de lançamento, 03/11, relatório 17).
 *
 * Quem protegia era só o `SameSite=Lax` do cookie — que os navegadores atuais
 * respeitam, mas que é UMA trava. Esta é a segunda: o pedido que muda estado
 * e chega com o cabeçalho Origin de outro site é recusado. O navegador põe o
 * Origin sozinho em todo POST/PUT/DELETE e a página não consegue falsificar.
 *
 * Sem Origin, passa: curl, o ERP do cliente, o webhook e as TVs antigas não
 * mandam, e não são navegador de vítima. "null" (iframe isolado, redirect
 * entre sites) conta como outro site.
 *
 * `daCasa(host)` diz se o host do Origin é nosso; o host do próprio pedido é
 * sempre da casa. Devolve true quando o pedido deve ser RECUSADO.
 */
function origemDeFora(req, daCasa) {
  const metodo = String(req.method || 'GET').toUpperCase();
  if (metodo === 'GET' || metodo === 'HEAD' || metodo === 'OPTIONS') return false;
  const origem = req.headers.origin;
  if (origem == null || origem === '') return false;
  let host = '';
  try { host = new URL(String(origem)).host.toLowerCase(); } catch (e) { return true; }
  if (!host) return true;
  const doPedido = [req.headers.host, String(req.headers['x-forwarded-host'] || '').split(',')[0]]
    .map((h) => String(h || '').trim().toLowerCase()).filter(Boolean);
  if (doPedido.includes(host)) return false;
  return !(typeof daCasa === 'function' && daCasa(host));
}

module.exports = { rateLimit, rateLimitConsultar, esperaEmPalavras, proxiesDeConfianca, clientIp, origemDeFora, safeEqual, isSecureRequest, cabecalhosSeguranca, CSP, CSP_COM_GOOGLE };

