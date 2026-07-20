/*
 * server.js — servidor estático + API multi-tenant de controle remoto.
 *
 * Contas (login) + dispositivos por empresa (tenant) + sincronização em
 * tempo real (SSE). Persistência real via server/db.js — PostgreSQL quando
 * DATABASE_URL está definido, SQLite embutido no dev local.
 *
 * Fluxo:
 *   - A TV (player em modo nuvem) cria um device e mostra um código.
 *   - O usuário loga no painel e "pareia" o código → o device passa a
 *     pertencer à empresa dele. Só essa empresa controla o device.
 *   - Ao salvar, a config é empurrada para a TV na hora (SSE).
 *
 * MVP: 1 usuário = 1 empresa. Multi-usuário/permissões depois
 * (ver docs/PLANO-SAAS.md).
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');
const db = require('./server/db');
const auth = require('./server/auth');

const PORT = process.env.PORT || 8080;
const ROOT = __dirname;

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json',
};

// Assinantes SSE por device (em memória).
const subscribers = {}; // { [deviceId]: Set<res> }

function pairCode() {
  const c = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = ''; for (let i = 0; i < 6; i++) s += c[Math.floor(Math.random() * c.length)];
  return s;
}
function sendJson(res, status, obj) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(obj));
}
function readBody(req, res, cb) {
  let data = '';
  req.on('data', (ch) => { data += ch; if (data.length > 2e6) req.destroy(); });
  req.on('end', () => {
    let parsed; try { parsed = data ? JSON.parse(data) : {}; } catch (e) { parsed = null; }
    Promise.resolve(cb(parsed)).catch((e) => {
      console.warn('[api]', e.message);
      try { sendJson(res, 500, { error: 'erro interno' }); } catch (_) {}
    });
  });
}
function broadcast(deviceId, event, payload) {
  const set = subscribers[deviceId];
  if (!set) return;
  const msg = 'event: ' + event + '\ndata: ' + JSON.stringify(payload) + '\n\n';
  set.forEach((res) => { try { res.write(msg); } catch (e) {} });
}
function validEmail(e) { return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(e || '')); }
function pubDevice(d) { return { id: d.id, name: d.name, code: d.code, paired: !!d.tenant_id, hasConfig: !!d.config, updatedAt: d.updated_at }; }

/* ---------------- API ---------------- */
async function handleApi(req, res, pathname, query) {
  const parts = pathname.split('/').filter(Boolean); // ['api', ...]
  const sess = await auth.currentSession(req);

  /* ----- Auth ----- */
  if (parts[1] === 'auth') {
    const action = parts[2];
    if (req.method === 'POST' && action === 'signup') {
      return readBody(req, res, async (b) => {
        if (!b || !validEmail(b.email) || !b.password || String(b.password).length < 6)
          return sendJson(res, 400, { error: 'e-mail válido e senha de 6+ caracteres' });
        const email = String(b.email).trim().toLowerCase();
        if (await db.getUserByEmail(email)) return sendJson(res, 409, { error: 'e-mail já cadastrado' });
        const { userId, tenantId } = await db.createAccount(email, auth.hashPassword(b.password), b.name);
        await auth.startSession(res, userId, tenantId);
        return sendJson(res, 201, { user: { email }, tenant: { id: tenantId, name: b.name || email } });
      });
    }
    if (req.method === 'POST' && action === 'login') {
      return readBody(req, res, async (b) => {
        if (!b) return sendJson(res, 400, { error: 'json inválido' });
        const email = String(b.email || '').trim().toLowerCase();
        const u = await db.getUserByEmail(email);
        if (!u || !auth.verifyPassword(b.password, u.pass_hash))
          return sendJson(res, 401, { error: 'e-mail ou senha incorretos' });
        await auth.startSession(res, u.id, u.tenant_id);
        return sendJson(res, 200, { user: { email }, tenant: { id: u.tenant_id } });
      });
    }
    if (req.method === 'POST' && action === 'logout') {
      await auth.clearSession(res, sess && sess.token);
      return sendJson(res, 200, { ok: true });
    }
    if (req.method === 'GET' && action === 'me') {
      if (!sess) return sendJson(res, 401, { error: 'não autenticado' });
      return sendJson(res, 200, { tenant: { id: sess.tenant_id } });
    }
    return sendJson(res, 404, { error: 'rota de auth inválida' });
  }

  /* ----- Criar device (a TV chama, sem auth) ----- */
  if (req.method === 'POST' && parts[1] === 'devices' && parts.length === 2) {
    const id = 'dev_' + db.rid(14);
    const deviceToken = db.rid(24);
    const code = pairCode();
    await db.createDevice(id, code, deviceToken);
    return sendJson(res, 201, { id, code, deviceToken });
  }

  /* ----- Parear (requer login): reivindica o device para a empresa ----- */
  if (req.method === 'POST' && parts[1] === 'pair') {
    if (!sess) return sendJson(res, 401, { error: 'faça login para parear' });
    return readBody(req, res, async (b) => {
      if (!b) return sendJson(res, 400, { error: 'json inválido' });
      const d = await db.getDeviceByCode(b.code);
      if (!d) return sendJson(res, 404, { error: 'código não encontrado' });
      if (d.tenant_id && d.tenant_id !== sess.tenant_id)
        return sendJson(res, 409, { error: 'este dispositivo já pertence a outra conta' });
      await db.claimDevice(d.id, sess.tenant_id, b.name || d.name || 'TV');
      return sendJson(res, 200, { id: d.id, name: b.name || d.name || 'TV' });
    });
  }

  /* ----- Listar meus devices (requer login) ----- */
  if (req.method === 'GET' && parts[1] === 'devices' && parts.length === 2) {
    if (!sess) return sendJson(res, 401, { error: 'não autenticado' });
    const rows = await db.listDevices(sess.tenant_id);
    const list = rows.map((d) => ({ id: d.id, name: d.name, code: d.code, hasConfig: !!d.has_config, updatedAt: d.updated_at }));
    return sendJson(res, 200, { devices: list });
  }

  /* ----- Rotas /api/devices/:id/... ----- */
  if (parts[1] === 'devices' && parts[2]) {
    const id = parts[2];
    const device = await db.getDevice(id);
    if (!device) return sendJson(res, 404, { error: 'device não encontrado' });
    const sub = parts[3];
    const owns = sess && device.tenant_id === sess.tenant_id;
    const dtOk = query.dt && query.dt === device.device_token;

    // Player lê a própria config (com device token)
    if (req.method === 'GET' && sub === 'config') {
      if (!dtOk && !owns) return sendJson(res, 403, { error: 'sem permissão' });
      if (!device.config) return sendJson(res, 204, {});
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      return res.end(device.config); // já é JSON string
    }
    // Dono publica config (requer login + posse)
    if (req.method === 'PUT' && sub === 'config') {
      if (!owns) return sendJson(res, 403, { error: 'sem permissão' });
      return readBody(req, res, async (b) => {
        if (!b || typeof b !== 'object') return sendJson(res, 400, { error: 'config inválida' });
        const name = (b.settings && b.settings.nome) || device.name;
        await db.setDeviceConfig(id, JSON.stringify(b), name);
        broadcast(id, 'config', { updatedAt: Date.now() });
        return sendJson(res, 200, { ok: true });
      });
    }
    // Renomear / remover (dono)
    if (req.method === 'POST' && sub === 'rename') {
      if (!owns) return sendJson(res, 403, { error: 'sem permissão' });
      return readBody(req, res, async (b) => { await db.renameDevice(id, (b && b.name) || device.name); return sendJson(res, 200, { ok: true }); });
    }
    if (req.method === 'DELETE' && !sub) {
      if (!owns) return sendJson(res, 403, { error: 'sem permissão' });
      await db.removeDevice(id); return sendJson(res, 200, { ok: true });
    }
    // Metadados (dono ou device)
    if (req.method === 'GET' && !sub) {
      if (!dtOk && !owns) return sendJson(res, 403, { error: 'sem permissão' });
      return sendJson(res, 200, pubDevice(device));
    }
    // SSE (o player assina, com device token)
    if (req.method === 'GET' && sub === 'events') {
      if (!dtOk) return sendJson(res, 403, { error: 'device token inválido' });
      res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' });
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
  if (!filePath.startsWith(ROOT)) { res.writeHead(403); return res.end('Acesso negado'); }
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('Não encontrado: ' + urlPath); }
    const ext = path.extname(filePath).toLowerCase();
    const revalidate = ext === '.html' || ext === '.js' || ext === '.css' || ext === '.json';
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Cache-Control': revalidate ? 'no-cache' : 'public, max-age=3600' });
    res.end(data);
  });
}

const server = http.createServer((req, res) => {
  const parsed = url.parse(req.url || '/', true);
  const pathname = decodeURIComponent(parsed.pathname || '/');
  if (pathname === '/api' || pathname.startsWith('/api/')) {
    return handleApi(req, res, pathname, parsed.query || {})
      .catch((e) => { console.warn('[api]', e.message); try { sendJson(res, 500, { error: 'erro interno' }); } catch (_) {} });
  }
  return handleStatic(req, res, pathname);
});

db.init()
  .then(() => server.listen(PORT, () => { console.log('Vistra rodando em http://localhost:' + PORT); }))
  .catch((e) => { console.error('[db] falha ao inicializar:', e.message); process.exit(1); });
