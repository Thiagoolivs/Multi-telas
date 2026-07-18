/*
 * server.js
 * Servidor estático mínimo (sem dependências) + API de controle remoto.
 *
 * A API permite controlar uma TV a partir do celular pela internet, via
 * pareamento por código e sincronização em tempo real (SSE):
 *   - A TV (player em modo nuvem) cria um "device" e mostra um código.
 *   - O celular (admin) informa o código e passa a enviar a config.
 *   - Ao salvar, o servidor empurra a nova config para a TV na hora (SSE).
 *
 * MVP sem autenticação (device + código). Contas/permissões (multi-tenant)
 * são a próxima camada — ver docs/PLANO-SAAS.md. O armazenamento é um JSON
 * em disco (efêmero em provedores sem volume); trocar por Postgres depois.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 8080;
const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, 'data');
const STORE_FILE = path.join(DATA_DIR, 'store.json');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json',
};

/* ---------------- Armazenamento (JSON em disco) ---------------- */
let store = { devices: {} };
function loadStore() {
  try { store = JSON.parse(fs.readFileSync(STORE_FILE, 'utf8')); }
  catch (e) { store = { devices: {} }; }
  if (!store.devices) store.devices = {};
}
let saveTimer = null;
function saveStore() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try { fs.mkdirSync(DATA_DIR, { recursive: true }); fs.writeFileSync(STORE_FILE, JSON.stringify(store)); }
    catch (e) { console.warn('[store] falha ao gravar', e.message); }
  }, 200);
}
loadStore();

// Assinantes SSE por device (não persistido).
const subscribers = {}; // { [deviceId]: Set<res> }

function randId(n) {
  const c = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let s = ''; for (let i = 0; i < n; i++) s += c[Math.floor(Math.random() * c.length)];
  return s;
}
// Código de pareamento sem caracteres ambíguos (0/O, 1/I).
function pairCode() {
  const c = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = ''; for (let i = 0; i < 6; i++) s += c[Math.floor(Math.random() * c.length)];
  return s;
}
function findByCode(code) {
  const up = String(code || '').trim().toUpperCase();
  return Object.values(store.devices).find((d) => d.code === up) || null;
}

/* ---------------- Helpers HTTP ---------------- */
function sendJson(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(body);
}
function readBody(req, cb) {
  let data = '';
  req.on('data', (ch) => { data += ch; if (data.length > 2e6) req.destroy(); });
  req.on('end', () => { try { cb(data ? JSON.parse(data) : {}); } catch (e) { cb(null); } });
}

function broadcast(deviceId, event, payload) {
  const set = subscribers[deviceId];
  if (!set) return;
  const msg = 'event: ' + event + '\ndata: ' + JSON.stringify(payload) + '\n\n';
  set.forEach((res) => { try { res.write(msg); } catch (e) { /* ignora */ } });
}

/* ---------------- API ---------------- */
function handleApi(req, res, url) {
  const parts = url.split('/').filter(Boolean); // ['api', ...]

  // POST /api/devices  → cria um device e devolve id + código
  if (req.method === 'POST' && parts.length === 2 && parts[1] === 'devices') {
    const id = 'dev_' + randId(14);
    const device = { id, code: pairCode(), name: '', config: null, updatedAt: Date.now(), createdAt: Date.now() };
    store.devices[id] = device; saveStore();
    return sendJson(res, 201, { id: device.id, code: device.code });
  }

  // POST /api/pair  {code}  → vincula pelo código, devolve o id do device
  if (req.method === 'POST' && parts.length === 2 && parts[1] === 'pair') {
    return readBody(req, (body) => {
      if (!body) return sendJson(res, 400, { error: 'json inválido' });
      const d = findByCode(body.code);
      if (!d) return sendJson(res, 404, { error: 'código não encontrado' });
      return sendJson(res, 200, { id: d.id, name: d.name, paired: !!d.config });
    });
  }

  // Rotas com /api/devices/:id/...
  if (parts[0] === 'api' && parts[1] === 'devices' && parts[2]) {
    const id = parts[2];
    const device = store.devices[id];
    if (!device) return sendJson(res, 404, { error: 'device não encontrado' });
    const sub = parts[3];

    // GET /api/devices/:id  → metadados
    if (req.method === 'GET' && !sub) {
      return sendJson(res, 200, { id: device.id, code: device.code, name: device.name, paired: !!device.config, updatedAt: device.updatedAt });
    }
    // GET /api/devices/:id/config
    if (req.method === 'GET' && sub === 'config') {
      if (!device.config) return sendJson(res, 204, {});
      return sendJson(res, 200, device.config);
    }
    // PUT /api/devices/:id/config  → salva e empurra por SSE
    if (req.method === 'PUT' && sub === 'config') {
      return readBody(req, (body) => {
        if (!body || typeof body !== 'object') return sendJson(res, 400, { error: 'config inválida' });
        device.config = body; device.updatedAt = Date.now();
        if (body.settings && body.settings.nome) device.name = body.settings.nome;
        saveStore();
        broadcast(id, 'config', { updatedAt: device.updatedAt });
        return sendJson(res, 200, { ok: true, updatedAt: device.updatedAt });
      });
    }
    // GET /api/devices/:id/events  → SSE (a TV assina)
    if (req.method === 'GET' && sub === 'events') {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache', 'Connection': 'keep-alive',
      });
      res.write('event: ready\ndata: {}\n\n');
      if (!subscribers[id]) subscribers[id] = new Set();
      subscribers[id].add(res);
      const ping = setInterval(() => { try { res.write(': ping\n\n'); } catch (e) {} }, 25000);
      req.on('close', () => { clearInterval(ping); subscribers[id] && subscribers[id].delete(res); });
      return;
    }
  }

  return sendJson(res, 404, { error: 'rota não encontrada' });
}

/* ---------------- Arquivos estáticos ---------------- */
function handleStatic(req, res, urlPath) {
  if (urlPath === '/') urlPath = '/index.html';
  const filePath = path.normalize(path.join(ROOT, urlPath));
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end('Acesso negado');
  }
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('Não encontrado: ' + urlPath);
    }
    const ext = path.extname(filePath).toLowerCase();
    const revalidate = ext === '.html' || ext === '.js' || ext === '.css' || ext === '.json';
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Cache-Control': revalidate ? 'no-cache' : 'public, max-age=3600',
    });
    res.end(data);
  });
}

const server = http.createServer((req, res) => {
  const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
  if (urlPath === '/api' || urlPath.startsWith('/api/')) {
    try { return handleApi(req, res, urlPath); }
    catch (e) { return sendJson(res, 500, { error: 'erro interno' }); }
  }
  return handleStatic(req, res, urlPath);
});

server.listen(PORT, () => {
  console.log('Vistra rodando em http://localhost:' + PORT);
});
