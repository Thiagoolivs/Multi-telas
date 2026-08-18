/*
 * server/storage.js — armazenamento de mídia (arquivos), fora do banco.
 *
 * Mesma filosofia do server/db.js: uma interface, drivers trocáveis.
 *  - Driver "disk" (padrão): grava em data/media/<tenant>/<id>.<ext> e serve
 *    por /media/... . Ótimo em dev; em produção SÓ com volume persistente.
 *  - Driver "s3": qualquer storage compatível com S3 (Cloudflare R2, AWS S3,
 *    Backblaze B2, MinIO). Assinatura SigV4 feita aqui com node:crypto — sem
 *    dependências, como no server/mail.js.
 *
 * Por que isso existe: a config das telas NÃO deve carregar mídia embutida
 * (base64). Mídia vira arquivo com URL estável e cacheável; a config só guarda
 * a URL. Isso destrava vídeo, escala e cache offline no player.
 *
 * ATENÇÃO em PaaS (Railway, Heroku…): o disco do contêiner é efêmero — some a
 * cada deploy. Use um volume montado (MEDIA_DIR) ou o driver s3. O aviso no
 * boot abaixo grita quando a instalação está nessa situação.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { pipeline } = require('stream/promises');
const { Readable } = require('stream');

const DRIVER = (process.env.STORAGE || 'disk').toLowerCase();

// Diretório dos dados. Em PaaS, aponte MEDIA_DIR para o volume persistente
// (no Railway, RAILWAY_VOLUME_MOUNT_PATH já vem pronto quando há volume).
const DATA_DIR = process.env.MEDIA_DIR
  || process.env.RAILWAY_VOLUME_MOUNT_PATH
  || path.join(__dirname, '..', 'data');
const MEDIA_DIR = path.join(DATA_DIR, 'media');

// Prefixo público das URLs (CDN ou domínio do bucket). Vazio = serve por /media.
const PUBLIC_BASE = (process.env.MEDIA_PUBLIC_BASE || '').replace(/\/$/, '');

// Limites (poderão virar por-plano com o billing).
const MAX_FILE_BYTES = Number(process.env.MEDIA_MAX_FILE || 200 * 1024 * 1024); // 200 MB
const QUOTA_BYTES = Number(process.env.MEDIA_QUOTA || 5 * 1024 * 1024 * 1024);  // 5 GB / tenant

/* ---------------- Configuração do driver s3 ---------------- */
const S3 = {
  endpoint: (process.env.S3_ENDPOINT || '').replace(/\/$/, ''),
  bucket: process.env.S3_BUCKET || '',
  region: process.env.S3_REGION || 'auto',
  key: process.env.S3_ACCESS_KEY_ID || '',
  secret: process.env.S3_SECRET_ACCESS_KEY || '',
  // R2/MinIO usam caminho (/bucket/chave). AWS moderno usa host virtual
  // (bucket.s3.regiao.amazonaws.com). Resolvido logo abaixo.
  pathStyle: true,
};
/*
 * Endereçamento por caminho × por host. Se o endpoint já começa com o nome do
 * bucket, é host virtual — repetir o bucket no caminho geraria
 * "bucket.s3.../bucket/chave" e um 404 difícil de diagnosticar. Só respeitamos
 * S3_FORCE_PATH_STYLE quando ele foi definido de propósito.
 */
if (process.env.S3_FORCE_PATH_STYLE != null) {
  S3.pathStyle = process.env.S3_FORCE_PATH_STYLE !== 'false';
} else if (S3.endpoint && S3.bucket) {
  try { S3.pathStyle = !new URL(S3.endpoint).host.startsWith(S3.bucket + '.'); } catch (e) { /* mantém padrão */ }
}
function s3Configured() {
  return !!(S3.endpoint && S3.bucket && S3.key && S3.secret);
}

// Tipos aceitos → extensão. HTML fica de fora de propósito (XSS).
const MIME_EXT = {
  'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif', 'image/svg+xml': 'svg',
  'video/mp4': 'mp4', 'video/webm': 'webm',
  // Trilha sonora. MP3 é o que sai de qualquer lugar; os outros entram porque
  // recusar um M4A que o cliente já tem seria um "não" sem motivo técnico.
  // Sinônimos vêm ANTES do tipo canônico: EXT_MIME é o inverso deste objeto e
  // a última entrada de cada extensão é a que volta ao servir o arquivo.
  'audio/mp3': 'mp3', 'audio/mpeg': 'mp3',
  'audio/x-m4a': 'm4a', 'audio/mp4': 'm4a', 'audio/aac': 'aac',
  'audio/x-wav': 'wav', 'audio/wav': 'wav', 'audio/ogg': 'ogg',
  // Apresentações: PPTX/PPT (exibidas via visualizador) e PDF (nativo no navegador).
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
  'application/vnd.ms-powerpoint': 'ppt',
  'application/pdf': 'pdf',
};
const EXT_MIME = Object.fromEntries(Object.entries(MIME_EXT).map(([m, e]) => [e, m]));
function extFor(mime) { return MIME_EXT[String(mime || '').toLowerCase()] || null; }
function mimeForKey(key) { return EXT_MIME[String(key).split('.').pop().toLowerCase()] || 'application/octet-stream'; }

/*
 * Identificadores sorteados com RNG CRIPTOGRÁFICO.
 *
 * Isto usava `Math.random()`, e três segredos do produto saíam daqui: o
 * `deviceToken` (a credencial permanente de uma TV), a chave de cada arquivo
 * de mídia — que é a única barreira de `/media/*`, uma rota sem autenticação
 * — e o código do mural.
 *
 * O `Math.random()` do V8 é um xorshift128+: o estado de 128 bits é
 * recuperável a partir de saídas observadas. E `POST /api/devices` é público
 * e devolve 38 sorteios seguidos deste mesmo gerador por chamada. Quem
 * observasse algumas criações passava a prever os identificadores seguintes —
 * e com o token previsto vinham a programação e os aniversariantes da tela de
 * outro cliente.
 *
 * `crypto.randomInt` é uniforme e imprevisível. O código de pareamento de 6
 * dígitos já usava esse caminho desde o começo; o resto é que ficou para trás.
 */
function rid(n) {
  const c = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let s = ''; for (let i = 0; i < n; i++) s += c[crypto.randomInt(c.length)];
  return s;
}
function httpErr(status, message) { const e = new Error(message); e.status = status; return e; }

if (DRIVER === 'disk') fs.mkdirSync(MEDIA_DIR, { recursive: true });
if (DRIVER === 's3' && !s3Configured()) {
  throw new Error('STORAGE=s3 exige S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY_ID e S3_SECRET_ACCESS_KEY.');
}

/*
 * Disco efêmero: o pior tipo de falha, porque é silenciosa — tudo funciona no
 * deploy e a mídia some no próximo. Melhor gritar no boot.
 */
function ephemeralWarning() {
  if (DRIVER !== 'disk') return null;
  const paas = process.env.RAILWAY_ENVIRONMENT || process.env.DYNO || process.env.RENDER;
  const temVolume = !!(process.env.MEDIA_DIR || process.env.RAILWAY_VOLUME_MOUNT_PATH);
  if (!paas || temVolume) return null;
  return 'Mídia gravando em disco EFÊMERO (' + MEDIA_DIR + '). Uploads somem no próximo deploy. '
    + 'Monte um volume e aponte MEDIA_DIR para ele, ou use STORAGE=s3. Ver docs/ARMAZENAMENTO.md';
}

/* ---------------- Assinatura SigV4 (S3) ---------------- */
const hmac = (key, str) => crypto.createHmac('sha256', key).update(str).digest();
const sha256hex = (x) => crypto.createHash('sha256').update(x).digest('hex');
// Cada segmento da chave é codificado, mas as barras continuam separando.
const encPath = (p) => p.split('/').map(encodeURIComponent).join('/');
// Hash do corpo vazio. Para GET/DELETE é o valor estritamente correto e aceito
// por todos os provedores — UNSIGNED-PAYLOAD só vale em S3 sobre HTTPS.
const EMPTY_SHA256 = sha256hex('');

function s3Url(key) {
  return S3.pathStyle
    ? S3.endpoint + '/' + S3.bucket + '/' + encPath(key)
    : S3.endpoint + '/' + encPath(key);
}

/*
 * Monta o header Authorization no formato AWS Signature Version 4. O corpo já
 * chega com o hash calculado (payloadHash) — assim dá para assinar um arquivo
 * grande sem carregá-lo inteiro na memória.
 */
function s3Sign(method, key, payloadHash, extraHeaders) {
  const url = new URL(s3Url(key));
  const amzDate = new Date().toISOString().replace(/[:-]|\.\d{3}/g, ''); // YYYYMMDDTHHMMSSZ
  const dateStamp = amzDate.slice(0, 8);

  const headers = Object.assign({
    host: url.host,
    'x-amz-content-sha256': payloadHash,
    'x-amz-date': amzDate,
  }, extraHeaders || {});

  // Canônicos: nomes em minúsculo, ordenados, valores com espaços colapsados.
  const nomes = Object.keys(headers).map((h) => h.toLowerCase()).sort();
  const canonicalHeaders = nomes
    .map((n) => n + ':' + String(headers[Object.keys(headers).find((k) => k.toLowerCase() === n)]).trim().replace(/\s+/g, ' ') + '\n')
    .join('');
  const signedHeaders = nomes.join(';');

  const canonicalRequest = [method, url.pathname, '', canonicalHeaders, signedHeaders, payloadHash].join('\n');
  const scope = dateStamp + '/' + S3.region + '/s3/aws4_request';
  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, scope, sha256hex(canonicalRequest)].join('\n');

  const kDate = hmac('AWS4' + S3.secret, dateStamp);
  const kRegion = hmac(kDate, S3.region);
  const kService = hmac(kRegion, 's3');
  const kSigning = hmac(kService, 'aws4_request');
  const signature = crypto.createHmac('sha256', kSigning).update(stringToSign).digest('hex');

  headers.authorization = 'AWS4-HMAC-SHA256 Credential=' + S3.key + '/' + scope
    + ', SignedHeaders=' + signedHeaders + ', Signature=' + signature;
  return { url: url.toString(), headers };
}

async function s3Put(key, body, mime, payloadHash, contentLength) {
  const { url, headers } = s3Sign('PUT', key, payloadHash, {
    'content-type': mime,
    'content-length': String(contentLength),
  });
  const res = await fetch(url, { method: 'PUT', headers, body, duplex: 'half' });
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error('S3 PUT ' + res.status + ' ' + txt.slice(0, 300));
  }
}

async function s3Get(key) {
  const { url, headers } = s3Sign('GET', key, EMPTY_SHA256);
  const res = await fetch(url, { headers });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error('S3 GET ' + res.status);
  return res;
}

async function s3Delete(key) {
  const { url, headers } = s3Sign('DELETE', key, EMPTY_SHA256);
  const res = await fetch(url, { method: 'DELETE', headers });
  if (!res.ok && res.status !== 404) throw new Error('S3 DELETE ' + res.status);
}

/* ---------------- Gravação ---------------- */

/*
 * Escreve o corpo da requisição num arquivo temporário, respeitando o limite,
 * e devolve tamanho + sha256. Serve aos dois drivers: no disk vira o arquivo
 * final (move), no s3 é o que sobe. Nunca segura o arquivo inteiro em memória.
 */
function toTempFile(req, max) {
  return new Promise((resolve, reject) => {
    const tmp = path.join(os.tmpdir(), 'mt-up-' + rid(16));
    const out = fs.createWriteStream(tmp);
    const hash = crypto.createHash('sha256');
    // Teto do chamador quando ele tem um mais apertado que o global — é o caso
    // de rota aberta ao público, onde o limite generoso do painel seria convite.
    const teto = Math.min(MAX_FILE_BYTES, max || MAX_FILE_BYTES);
    let size = 0, aborted = false;
    const fail = (err) => {
      if (aborted) return; aborted = true;
      out.destroy(); fs.unlink(tmp, () => {}); reject(err);
    };
    req.on('data', (chunk) => {
      size += chunk.length;
      hash.update(chunk);
      if (size > teto) { fail(httpErr(413, 'arquivo excede o limite')); req.destroy(); }
    });
    req.on('error', fail);
    out.on('error', fail);
    req.pipe(out);
    out.on('finish', () => { if (!aborted) resolve({ tmp, size, sha256: hash.digest('hex') }); });
  });
}

async function saveStream(tenantId, req, { mime, max }) {
  const ext = extFor(mime);
  if (!ext) throw httpErr(415, 'tipo de arquivo não suportado');
  const id = rid(20);
  const key = tenantId + '/' + id + '.' + ext;
  const m = String(mime).toLowerCase();

  const { tmp, size, sha256 } = await toTempFile(req, max);
  try {
    if (DRIVER === 's3') {
      await s3Put(key, Readable.toWeb(fs.createReadStream(tmp)), m, sha256, size);
    } else {
      fs.mkdirSync(path.join(MEDIA_DIR, tenantId), { recursive: true });
      // rename falha entre sistemas de arquivos diferentes (/tmp × volume).
      try { fs.renameSync(tmp, path.join(MEDIA_DIR, key)); }
      catch (e) { await pipeline(fs.createReadStream(tmp), fs.createWriteStream(path.join(MEDIA_DIR, key))); }
    }
  } finally {
    fs.unlink(tmp, () => {});
  }
  return { id, key, ext, mime: m, size, url: publicUrl(key) };
}

// saveBuffer — grava bytes já em memória (ex.: imagem gerada por IA).
async function saveBuffer(tenantId, buf, mime) {
  const ext = extFor(mime);
  if (!ext) throw httpErr(415, 'tipo de arquivo não suportado');
  if (buf.length > MAX_FILE_BYTES) throw httpErr(413, 'arquivo excede o limite');
  const id = rid(20);
  const key = tenantId + '/' + id + '.' + ext;
  const m = String(mime).toLowerCase();

  if (DRIVER === 's3') {
    await s3Put(key, buf, m, sha256hex(buf), buf.length);
  } else {
    fs.mkdirSync(path.join(MEDIA_DIR, tenantId), { recursive: true });
    await fs.promises.writeFile(path.join(MEDIA_DIR, key), buf);
  }
  return { id, key, ext, mime: m, size: buf.length, url: publicUrl(key) };
}

async function remove(key) {
  if (DRIVER === 's3') return s3Delete(key);
  return new Promise((resolve) => fs.unlink(path.join(MEDIA_DIR, key), () => resolve()));
}

function publicUrl(key) {
  return (PUBLIC_BASE || '') + '/media/' + key;
}

/* ---------------- Leitura ---------------- */

// Caminho absoluto seguro no disco. Bloqueia path traversal. Null no s3.
function resolveLocal(key) {
  if (DRIVER === 's3') return null;
  const full = path.normalize(path.join(MEDIA_DIR, key));
  if (!full.startsWith(MEDIA_DIR)) return null;
  return full;
}

// Chave válida? (evita traversal e chaves absurdas antes de ir ao storage)
function validKey(key) {
  const k = String(key || '');
  return !!k && !k.includes('..') && !k.startsWith('/') && k.length < 300;
}

// Conteúdo completo em Buffer (usado pela IA para ler imagens de referência).
async function readBuffer(key) {
  if (!validKey(key)) return null;
  if (DRIVER === 's3') {
    const res = await s3Get(key);
    if (!res) return null;
    return Buffer.from(await res.arrayBuffer());
  }
  const full = resolveLocal(key);
  if (!full) return null;
  try { return await fs.promises.readFile(full); } catch (e) { return null; }
}

/*
 * Serve o arquivo pela resposta HTTP. No disk lê do disco; no s3 busca no
 * bucket e repassa o corpo. Só é usado quando não há MEDIA_PUBLIC_BASE (com
 * CDN/bucket público o navegador vai direto na origem e nem passa por aqui).
 */
async function serve(res, key) {
  if (!validKey(key)) { res.writeHead(403); return res.end('Acesso negado'); }
  const cache = { 'Cache-Control': 'public, max-age=31536000, immutable', 'X-Content-Type-Options': 'nosniff' };

  if (DRIVER === 's3') {
    let up;
    try { up = await s3Get(key); }
    catch (e) { res.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('Falha no armazenamento'); }
    if (!up) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('Não encontrado'); }
    res.writeHead(200, Object.assign({
      'Content-Type': up.headers.get('content-type') || mimeForKey(key),
    }, up.headers.get('content-length') ? { 'Content-Length': up.headers.get('content-length') } : {}, cache));
    return pipeline(Readable.fromWeb(up.body), res).catch(() => {});
  }

  const full = resolveLocal(key);
  if (!full) { res.writeHead(403); return res.end('Acesso negado'); }
  fs.stat(full, (err, st) => {
    if (err || !st.isFile()) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('Não encontrado'); }
    res.writeHead(200, Object.assign({ 'Content-Type': mimeForKey(key), 'Content-Length': st.size }, cache));
    fs.createReadStream(full).pipe(res);
  });
}

module.exports = {
  DRIVER, MAX_FILE_BYTES, QUOTA_BYTES, MIME_EXT, MEDIA_DIR,
  // Diagnóstico da configuração do bucket (aparece no boot).
  s3Info: () => (DRIVER === 's3' ? { endpoint: S3.endpoint, bucket: S3.bucket, region: S3.region, pathStyle: S3.pathStyle } : null),
  extFor, saveStream, saveBuffer, remove, publicUrl, resolveLocal,
  readBuffer, serve, validKey, ephemeralWarning,
};
