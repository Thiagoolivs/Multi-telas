/*
 * server/storage.js — armazenamento de mídia (arquivos), fora do banco.
 *
 * Mesma filosofia do server/db.js: uma interface, drivers trocáveis.
 *  - Driver "disk" (padrão): grava em data/media/<tenant>/<id>.<ext> e serve
 *    por /media/... . No deploy, persistir com volume. É o backend de dev e
 *    funciona em produção pequena.
 *  - Driver "s3" (costura, produção real): S3/R2/Backblaze/MinIO + CDN. Ainda
 *    não habilitado aqui — ver docs/AUDITORIA.md. O restante do servidor não
 *    muda ao trocar o driver.
 *
 * Por que isso existe: a config das telas NÃO deve carregar mídia embutida
 * (base64). Mídia vira arquivo com URL estável e cacheável; a config só guarda
 * a URL. Isso destrava vídeo, escala e (adiante) cache offline no player.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DRIVER = process.env.STORAGE || 'disk';
const DATA_DIR = path.join(__dirname, '..', 'data');
const MEDIA_DIR = path.join(DATA_DIR, 'media');
// Prefixo público das URLs (ex.: um CDN/domínio de volume). Vazio = mesma origem.
const PUBLIC_BASE = (process.env.MEDIA_PUBLIC_BASE || '').replace(/\/$/, '');

// Limites (poderão virar por-plano com o billing).
const MAX_FILE_BYTES = Number(process.env.MEDIA_MAX_FILE || 200 * 1024 * 1024); // 200 MB
const QUOTA_BYTES = Number(process.env.MEDIA_QUOTA || 5 * 1024 * 1024 * 1024);  // 5 GB / tenant

// Tipos aceitos → extensão. SVG/HTML ficam de fora de propósito (XSS).
const MIME_EXT = {
  'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif',
  'video/mp4': 'mp4', 'video/webm': 'webm',
};
function extFor(mime) { return MIME_EXT[String(mime || '').toLowerCase()] || null; }
function rid(n) {
  const c = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let s = ''; for (let i = 0; i < n; i++) s += c[Math.floor(Math.random() * c.length)];
  return s;
}

if (DRIVER === 'disk') fs.mkdirSync(MEDIA_DIR, { recursive: true });

/*
 * saveStream(tenantId, req, { mime }) — grava o corpo (bytes crus) em disco,
 * respeitando o limite por arquivo. Faz streaming (não bufferiza) para aguentar
 * vídeo. Resolve com metadados do arquivo salvo.
 */
function saveStream(tenantId, req, { mime }) {
  return new Promise((resolve, reject) => {
    const ext = extFor(mime);
    if (!ext) return reject(httpErr(415, 'tipo de arquivo não suportado'));
    if (DRIVER !== 'disk') return reject(httpErr(501, 'driver de storage "' + DRIVER + '" não habilitado'));

    const id = rid(20);
    const key = tenantId + '/' + id + '.' + ext;
    const dir = path.join(MEDIA_DIR, tenantId);
    fs.mkdirSync(dir, { recursive: true });
    const full = path.join(MEDIA_DIR, key);

    const out = fs.createWriteStream(full);
    let size = 0, aborted = false;
    const fail = (err) => {
      if (aborted) return; aborted = true;
      out.destroy(); fs.unlink(full, () => {}); reject(err);
    };
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_FILE_BYTES) { fail(httpErr(413, 'arquivo excede o limite')); req.destroy(); }
    });
    req.on('error', fail);
    out.on('error', fail);
    req.pipe(out);
    out.on('finish', () => {
      if (aborted) return;
      resolve({ id, key, ext, mime: String(mime).toLowerCase(), size, url: publicUrl(key) });
    });
  });
}

function remove(key) {
  if (DRIVER !== 'disk') return Promise.resolve();
  return new Promise((resolve) => fs.unlink(path.join(MEDIA_DIR, key), () => resolve()));
}

function publicUrl(key) {
  return (PUBLIC_BASE || '') + '/media/' + key;
}

// Caminho absoluto seguro para servir um arquivo (driver disk). Bloqueia
// path traversal e garante que fica dentro de MEDIA_DIR.
function resolveLocal(key) {
  const full = path.normalize(path.join(MEDIA_DIR, key));
  if (!full.startsWith(MEDIA_DIR)) return null;
  return full;
}

module.exports = {
  DRIVER, MAX_FILE_BYTES, QUOTA_BYTES, MIME_EXT,
  extFor, saveStream, remove, publicUrl, resolveLocal,
};

function httpErr(status, message) { const e = new Error(message); e.status = status; return e; }
