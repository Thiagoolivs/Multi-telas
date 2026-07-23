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
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const url = require('url');
const db = require('./server/db');
const auth = require('./server/auth');
const storage = require('./server/storage');
const { rateLimit, clientIp, safeEqual } = require('./server/security');
const plans = require('./server/plans');
const billing = require('./server/billing');
const ai = require('./server/ai');

const PORT = process.env.PORT || 8080;
const ROOT = __dirname;

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json',
  '.webp': 'image/webp', '.gif': 'image/gif', '.mp4': 'video/mp4', '.webm': 'video/webm',
};

// Assinantes SSE por device (em memória).
const subscribers = {}; // { [deviceId]: Set<res> }

// Códigos com RNG criptográfico (crypto.randomInt) — não previsíveis.
function randomCode(len) {
  const c = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = ''; for (let i = 0; i < len; i++) s += c[crypto.randomInt(c.length)];
  return s;
}
function pairCode() { return randomCode(6); }
function inviteCode() { return randomCode(8); }
// Janela em que um device pareável precisa estar "vivo" (heartbeat recente).
// Substitui um TTL fixo: só dá pra parear uma TV que está ligada mostrando o
// código; código de tela desligada/abandonada deixa de valer. Sem quebrar o
// fluxo real (a TV pulsa a cada 30s).
const PAIR_ONLINE_MS = Number(process.env.PAIR_ONLINE_MS) || 10 * 60 * 1000;
// Papéis: owner (dono) > admin > member. Gestão de equipe: owner e admin.
function canManageTeam(role) { return role === 'owner' || role === 'admin'; }
function sendJson(res, status, obj, extraHeaders) {
  res.writeHead(status, Object.assign({ 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }, extraHeaders || {}));
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
// Base absoluta da requisição (para montar URLs de checkout/portal).
function reqOrigin(req) {
  const proto = (req.headers['x-forwarded-proto'] || '').split(',')[0].trim() || (req.socket && req.socket.encrypted ? 'https' : 'http');
  const host = req.headers['x-forwarded-host'] || req.headers.host || 'localhost';
  return proto + '://' + host;
}
// Corpo bruto (sem parse) — necessário para validar a assinatura do webhook.
function readRawBody(req) {
  return new Promise((resolve) => {
    let data = ''; req.on('data', (ch) => { data += ch; if (data.length > 1e6) req.destroy(); });
    req.on('end', () => resolve(data));
  });
}
function brl(cents) { return 'R$ ' + (cents / 100).toFixed(2).replace('.', ','); }

// Aplica um evento do Stripe ao plano do tenant.
async function handleStripeEvent(event) {
  const obj = (event.data && event.data.object) || {};
  if (event.type === 'checkout.session.completed') {
    const tenantId = obj.client_reference_id || (obj.metadata && obj.metadata.tenant_id);
    if (!tenantId) return;
    await db.setTenantBilling(tenantId, {
      plan: (obj.metadata && obj.metadata.plan) || undefined,
      status: 'active', customerId: obj.customer || undefined, subscriptionId: obj.subscription || undefined,
    });
  } else if (event.type === 'customer.subscription.updated' || event.type === 'customer.subscription.created') {
    const tenant = await db.getTenantByCustomer(obj.customer);
    if (!tenant) return;
    const price = obj.items && obj.items.data && obj.items.data[0] && obj.items.data[0].price;
    await db.setTenantBilling(tenant.id, {
      plan: billing.planIdFromPrice(price && price.id) || undefined,
      status: obj.status, subscriptionId: obj.id,
      renewsAt: obj.current_period_end ? obj.current_period_end * 1000 : undefined,
    });
  } else if (event.type === 'customer.subscription.deleted') {
    const tenant = await db.getTenantByCustomer(obj.customer);
    if (!tenant) return;
    await db.setTenantBilling(tenant.id, { plan: 'free', status: 'canceled', subscriptionId: null, renewsAt: null });
  }
}

// Página de checkout SIMULADO (modo dev, sem Stripe). Deixa claro que é teste.
function devCheckoutPage(p) {
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Pagamento simulado — ${p.name}</title>
<style>
  :root{color-scheme:light dark}
  body{margin:0;font:15px/1.5 system-ui,sans-serif;background:#0b0c10;color:#e8eaf0;display:grid;place-items:center;min-height:100vh}
  .card{background:#15171f;border:1px solid #262a36;border-radius:16px;padding:28px;max-width:380px;width:calc(100% - 32px);box-shadow:0 20px 60px rgba(0,0,0,.4)}
  .tag{display:inline-block;font-size:12px;font-weight:600;color:#f5b301;background:rgba(245,179,1,.12);padding:3px 9px;border-radius:99px;margin-bottom:14px}
  h1{font-size:19px;margin:0 0 4px} .muted{color:#9aa0ad;font-size:13px;margin:0 0 18px}
  .price{font-size:30px;font-weight:700;margin:10px 0 2px} .price small{font-size:14px;font-weight:500;color:#9aa0ad}
  button{width:100%;border:0;border-radius:10px;padding:12px;font-size:15px;font-weight:600;cursor:pointer;background:#5b8cff;color:#fff;margin-top:16px}
  button:disabled{opacity:.6} a{display:block;text-align:center;color:#9aa0ad;margin-top:12px;font-size:13px;text-decoration:none}
</style></head><body>
<div class="card">
  <span class="tag">PAGAMENTO SIMULADO — TESTE</span>
  <h1>Plano ${p.name}</h1>
  <p class="muted">${p.blurb || ''} Até ${p.screens} telas.</p>
  <div class="price">${brl(p.priceCents)}<small> /mês</small></div>
  <button id="go" onclick="pay()">Confirmar assinatura</button>
  <a href="/app?billing=cancel">Cancelar</a>
</div>
<script>
async function pay(){
  var b=document.getElementById('go'); b.disabled=true; b.textContent='Processando…';
  try{
    var r=await fetch('/api/billing/dev-activate',{method:'POST',headers:{'Content-Type':'application/json'},credentials:'same-origin',body:JSON.stringify({plan:${JSON.stringify(p.id)}})});
    if(!r.ok) throw new Error('falha');
    location.href='/app?billing=success';
  }catch(e){ b.disabled=false; b.textContent='Tentar de novo'; }
}
</script>
</body></html>`;
}
function pubDevice(d) { return { id: d.id, name: d.name, code: d.code, paired: !!d.tenant_id, hasConfig: !!d.config, updatedAt: d.updated_at, lastSeen: d.last_seen }; }

/* ---------------- API ---------------- */
async function handleApi(req, res, pathname, query) {
  const parts = pathname.split('/').filter(Boolean); // ['api', ...]
  const sess = await auth.currentSession(req);

  /* ----- Auth ----- */
  if (parts[1] === 'auth') {
    const action = parts[2];
    if (req.method === 'POST' && action === 'signup') {
      const rl = rateLimit('signup:' + clientIp(req), 10, 60 * 60 * 1000); // 10/h por IP
      if (!rl.ok) return sendJson(res, 429, { error: 'muitas tentativas, tente mais tarde' }, { 'Retry-After': String(rl.retryAfter) });
      return readBody(req, res, async (b) => {
        if (!b || !validEmail(b.email) || !b.password || String(b.password).length < 6)
          return sendJson(res, 400, { error: 'e-mail válido e senha de 6+ caracteres' });
        const email = String(b.email).trim().toLowerCase();
        if (await db.getUserByEmail(email)) return sendJson(res, 409, { error: 'e-mail já cadastrado' });
        const passHash = auth.hashPassword(b.password);
        // Com convite: entra numa empresa existente com o papel do convite.
        if (b.inviteCode) {
          const inv = await db.getInviteByCode(b.inviteCode);
          if (!inv || inv.accepted_at) return sendJson(res, 404, { error: 'convite inválido' });
          if (inv.expires_at && inv.expires_at < Date.now()) return sendJson(res, 410, { error: 'convite expirado' });
          const { userId } = await db.createUser(inv.tenant_id, email, passHash, inv.role, b.name);
          await db.acceptInvite(inv.id);
          await auth.startSession(res, userId, inv.tenant_id, req);
          return sendJson(res, 201, { user: { email, role: inv.role }, tenant: { id: inv.tenant_id } });
        }
        // Sem convite: cria uma nova empresa e o usuário vira dono (owner).
        const { userId, tenantId } = await db.createAccount(email, passHash, b.name, b.name);
        await auth.startSession(res, userId, tenantId, req);
        return sendJson(res, 201, { user: { email, role: 'owner' }, tenant: { id: tenantId, name: b.name || email } });
      });
    }
    if (req.method === 'POST' && action === 'login') {
      const ipRl = rateLimit('login-ip:' + clientIp(req), 20, 15 * 60 * 1000); // 20/15min por IP
      if (!ipRl.ok) return sendJson(res, 429, { error: 'muitas tentativas, tente mais tarde' }, { 'Retry-After': String(ipRl.retryAfter) });
      return readBody(req, res, async (b) => {
        if (!b) return sendJson(res, 400, { error: 'json inválido' });
        const email = String(b.email || '').trim().toLowerCase();
        // Segunda trava por conta: freia stuffing mirado num e-mail só.
        const acctRl = rateLimit('login-acct:' + email, 10, 15 * 60 * 1000);
        if (!acctRl.ok) return sendJson(res, 429, { error: 'muitas tentativas, tente mais tarde' }, { 'Retry-After': String(acctRl.retryAfter) });
        const u = await db.getUserByEmail(email);
        if (!u || !auth.verifyPassword(b.password, u.pass_hash))
          return sendJson(res, 401, { error: 'e-mail ou senha incorretos' });
        await auth.startSession(res, u.id, u.tenant_id, req);
        return sendJson(res, 200, { user: { email }, tenant: { id: u.tenant_id } });
      });
    }
    if (req.method === 'POST' && action === 'logout') {
      await auth.clearSession(res, sess && sess.token, req);
      return sendJson(res, 200, { ok: true });
    }
    if (req.method === 'GET' && action === 'me') {
      if (!sess) return sendJson(res, 401, { error: 'não autenticado' });
      return sendJson(res, 200, {
        tenant: { id: sess.tenant_id },
        user: { id: sess.user_id, email: sess.email, role: sess.role, name: sess.name },
      });
    }
    return sendJson(res, 404, { error: 'rota de auth inválida' });
  }

  /* ----- Equipe (multi-usuário + permissões) ----- */
  if (parts[1] === 'team') {
    if (!sess) return sendJson(res, 401, { error: 'não autenticado' });
    const seg = parts[2];

    // Listar membros (+ convites pendentes, se puder gerenciar)
    if (req.method === 'GET' && !seg) {
      const members = (await db.listUsers(sess.tenant_id)).map((u) => ({
        id: u.id, email: u.email, role: u.role, name: u.name, createdAt: u.created_at, isMe: u.id === sess.user_id,
      }));
      const invites = canManageTeam(sess.role)
        ? (await db.listInvites(sess.tenant_id)).map((i) => ({ id: i.id, email: i.email, role: i.role, code: i.code, createdAt: i.created_at }))
        : [];
      return sendJson(res, 200, { members, invites, me: { id: sess.user_id, role: sess.role } });
    }

    // Criar convite (owner/admin)
    if (req.method === 'POST' && seg === 'invites') {
      if (!canManageTeam(sess.role)) return sendJson(res, 403, { error: 'sem permissão' });
      return readBody(req, res, async (b) => {
        const email = String((b && b.email) || '').trim().toLowerCase();
        const role = ['admin', 'member'].includes(b && b.role) ? b.role : 'member';
        if (!validEmail(email)) return sendJson(res, 400, { error: 'e-mail inválido' });
        if (await db.getUserByEmail(email)) return sendJson(res, 409, { error: 'esse e-mail já é um usuário' });
        const code = inviteCode();
        const expires = Date.now() + 7 * 864e5; // 7 dias
        await db.createInvite(sess.tenant_id, email, role, code, sess.user_id, expires);
        return sendJson(res, 201, { code, email, role });
      });
    }
    // Revogar convite (owner/admin)
    if (req.method === 'DELETE' && seg === 'invites' && parts[3]) {
      if (!canManageTeam(sess.role)) return sendJson(res, 403, { error: 'sem permissão' });
      await db.deleteInvite(parts[3], sess.tenant_id);
      return sendJson(res, 200, { ok: true });
    }

    // Trocar papel de um membro (só owner)
    if (req.method === 'POST' && seg === 'members' && parts[3] && parts[4] === 'role') {
      if (sess.role !== 'owner') return sendJson(res, 403, { error: 'só o dono muda papéis' });
      return readBody(req, res, async (b) => {
        const role = ['owner', 'admin', 'member'].includes(b && b.role) ? b.role : null;
        if (!role) return sendJson(res, 400, { error: 'papel inválido' });
        const target = await db.getUserById(parts[3]);
        if (!target || target.tenant_id !== sess.tenant_id) return sendJson(res, 404, { error: 'membro não encontrado' });
        if (target.role === 'owner' && role !== 'owner' && (await db.countOwners(sess.tenant_id)) <= 1)
          return sendJson(res, 409, { error: 'a empresa precisa de ao menos um dono' });
        await db.setUserRole(parts[3], sess.tenant_id, role);
        return sendJson(res, 200, { ok: true });
      });
    }
    // Remover membro (owner: qualquer um; admin: só member; qualquer um pode sair)
    if (req.method === 'DELETE' && seg === 'members' && parts[3]) {
      const targetId = parts[3];
      const target = await db.getUserById(targetId);
      if (!target || target.tenant_id !== sess.tenant_id) return sendJson(res, 404, { error: 'membro não encontrado' });
      const isSelf = targetId === sess.user_id;
      if (!isSelf) {
        if (sess.role === 'member') return sendJson(res, 403, { error: 'sem permissão' });
        if (sess.role === 'admin' && target.role !== 'member') return sendJson(res, 403, { error: 'admin só remove membros' });
      }
      if (target.role === 'owner' && (await db.countOwners(sess.tenant_id)) <= 1)
        return sendJson(res, 409, { error: 'a empresa precisa de ao menos um dono' });
      await db.removeUser(targetId, sess.tenant_id);
      if (isSelf) await auth.clearSession(res, sess.token, req);
      return sendJson(res, 200, { ok: true });
    }
    return sendJson(res, 404, { error: 'rota de equipe inválida' });
  }

  /* ----- Billing / planos ----- */
  /* ----- IA: gerar sugestões de conteúdo (requer login) ----- */
  if (parts[1] === 'ai' && parts[2] === 'generate-content') {
    if (!sess) return sendJson(res, 401, { error: 'não autenticado' });
    if (req.method !== 'POST') return sendJson(res, 405, { error: 'método inválido' });
    const rl = rateLimit('ai:' + sess.tenant_id, 30, 60 * 60 * 1000); // 30/h por conta
    if (!rl.ok) return sendJson(res, 429, { error: 'limite de gerações por hora atingido' }, { 'Retry-After': String(rl.retryAfter) });
    return readBody(req, res, async (b) => {
      const brief = b && b.brief;
      if (!brief || !String(brief).trim()) return sendJson(res, 400, { error: 'descreva o que você quer' });
      try {
        const items = await ai.generateContent(brief, { empresa: (b && b.empresa) || '', tema: (b && b.tema) || '' });
        return sendJson(res, 200, { mode: ai.mode(), items });
      } catch (e) { return sendJson(res, 502, { error: 'falha na IA: ' + e.message }); }
    });
  }

  if (parts[1] === 'billing') {
    const seg = parts[2];

    // Webhook do Stripe: corpo bruto + assinatura. Sem sessão (vem do Stripe).
    if (req.method === 'POST' && seg === 'webhook') {
      const raw = await readRawBody(req);
      let event;
      try { event = billing.verifyWebhook(raw, req.headers['stripe-signature']); }
      catch (e) { return sendJson(res, 400, { error: 'webhook inválido: ' + e.message }); }
      await handleStripeEvent(event);
      return sendJson(res, 200, { received: true });
    }

    // Daqui pra baixo exige login.
    if (!sess) return sendJson(res, 401, { error: 'não autenticado' });
    const tenant = await db.getTenant(sess.tenant_id);
    const curPlan = plans.plan(tenant && tenant.plan);

    // Estado atual do plano + uso + catálogo.
    if (req.method === 'GET' && !seg) {
      const used = await db.countDevices(sess.tenant_id);
      return sendJson(res, 200, {
        mode: billing.mode(),
        plan: { id: curPlan.id, name: curPlan.name, screens: curPlan.screens, priceCents: curPlan.priceCents },
        status: (tenant && tenant.plan_status) || (curPlan.priceCents ? 'active' : 'free'),
        renewsAt: tenant && tenant.plan_renews_at,
        usage: { screens: used, limit: curPlan.screens },
        catalog: plans.catalog(),
        canManage: sess.role === 'owner',
      });
    }

    // Iniciar checkout de upgrade (só dono).
    if (req.method === 'POST' && seg === 'checkout') {
      if (sess.role !== 'owner') return sendJson(res, 403, { error: 'só o dono gerencia o plano' });
      return readBody(req, res, async (b) => {
        const target = plans.plan(b && b.plan);
        if (!target || target.priceCents <= 0) return sendJson(res, 400, { error: 'plano inválido' });
        try {
          const out = await billing.createCheckout(tenant, target.id, reqOrigin(req));
          return sendJson(res, 200, out);
        } catch (e) { return sendJson(res, 502, { error: e.message }); }
      });
    }

    // Portal de gerenciamento (trocar cartão / cancelar) — só dono.
    if (req.method === 'POST' && seg === 'portal') {
      if (sess.role !== 'owner') return sendJson(res, 403, { error: 'só o dono gerencia o plano' });
      try { return sendJson(res, 200, await billing.createPortal(tenant, reqOrigin(req))); }
      catch (e) { return sendJson(res, 502, { error: e.message }); }
    }

    // ----- Modo dev (checkout simulado): só existe sem Stripe configurado -----
    if (billing.mode() === 'dev') {
      if (req.method === 'GET' && seg === 'dev-checkout') {
        const target = plans.plan(query.plan);
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
        return res.end(devCheckoutPage(target));
      }
      if (req.method === 'POST' && seg === 'dev-activate') {
        if (sess.role !== 'owner') return sendJson(res, 403, { error: 'só o dono gerencia o plano' });
        return readBody(req, res, async (b) => {
          const target = plans.plan(b && b.plan);
          if (!target || target.priceCents <= 0) return sendJson(res, 400, { error: 'plano inválido' });
          await db.setTenantBilling(sess.tenant_id, {
            plan: target.id, status: 'active',
            renewsAt: Date.now() + 30 * 864e5,
          });
          return sendJson(res, 200, { ok: true, plan: target.id });
        });
      }
    }
    return sendJson(res, 404, { error: 'rota de billing inválida' });
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
    // Trava força-bruta de códigos (por IP e por conta).
    const prl = rateLimit('pair:' + clientIp(req), 15, 10 * 60 * 1000);
    if (!prl.ok) return sendJson(res, 429, { error: 'muitas tentativas de pareamento' }, { 'Retry-After': String(prl.retryAfter) });
    return readBody(req, res, async (b) => {
      if (!b) return sendJson(res, 400, { error: 'json inválido' });
      const d = await db.getDeviceByCode(b.code);
      if (!d) return sendJson(res, 404, { error: 'código não encontrado' });
      if (d.tenant_id && d.tenant_id !== sess.tenant_id)
        return sendJson(res, 409, { error: 'este dispositivo já pertence a outra conta' });
      // Primeira reivindicação só vale se a TV está viva (código na tela agora).
      if (!d.tenant_id && (!d.last_seen || Date.now() - d.last_seen > PAIR_ONLINE_MS))
        return sendJson(res, 410, { error: 'código expirado — reinicie a TV para gerar um novo' });
      // Limite do plano: bloqueia parear acima da cota (só na 1ª reivindicação).
      if (!d.tenant_id) {
        const tenant = await db.getTenant(sess.tenant_id);
        const limit = plans.screenLimit(tenant && tenant.plan);
        const used = await db.countDevices(sess.tenant_id);
        if (used >= limit)
          return sendJson(res, 402, { error: 'limite do plano atingido (' + limit + (limit === 1 ? ' tela' : ' telas') + '). Faça upgrade para adicionar mais.', code: 'plan_limit' });
      }
      await db.claimDevice(d.id, sess.tenant_id, b.name || d.name || 'TV');
      return sendJson(res, 200, { id: d.id, name: b.name || d.name || 'TV' });
    });
  }

  /* ----- Listar meus devices (requer login) ----- */
  if (req.method === 'GET' && parts[1] === 'devices' && parts.length === 2) {
    if (!sess) return sendJson(res, 401, { error: 'não autenticado' });
    const rows = await db.listDevices(sess.tenant_id);
    const list = rows.map((d) => ({ id: d.id, name: d.name, code: d.code, hasConfig: !!d.has_config, updatedAt: d.updated_at, lastSeen: d.last_seen }));
    return sendJson(res, 200, { devices: list });
  }

  /* ----- Rotas /api/devices/:id/... ----- */
  if (parts[1] === 'devices' && parts[2]) {
    const id = parts[2];
    const device = await db.getDevice(id);
    if (!device) return sendJson(res, 404, { error: 'device não encontrado' });
    const sub = parts[3];
    const owns = sess && device.tenant_id === sess.tenant_id;
    // Device token: aceita header (x-device-token) — não vaza em logs/URLs — ou
    // ?dt= (necessário pro EventSource do SSE, que não seta headers).
    // Comparação em tempo constante.
    const provided = req.headers['x-device-token'] || query.dt;
    const dtOk = !!provided && !!device.device_token && safeEqual(provided, device.device_token);

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
    // Heartbeat: a TV avisa que está viva (device token). Alimenta o status
    // real da frota (online/offline) no painel.
    if (req.method === 'POST' && sub === 'heartbeat') {
      if (!dtOk) return sendJson(res, 403, { error: 'device token inválido' });
      await db.touchDevice(id);
      return sendJson(res, 200, { ok: true, at: Date.now() });
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

  /* ----- Mídia (upload/list/delete) — arquivos fora do banco ----- */
  if (parts[1] === 'media') {
    if (!sess) return sendJson(res, 401, { error: 'não autenticado' });

    // Upload: corpo = bytes crus; ?name= e ?mime= (ou Content-Type).
    if (req.method === 'POST' && parts.length === 2) {
      const mime = query.mime || req.headers['content-type'] || '';
      if (!storage.extFor(mime)) return sendJson(res, 415, { error: 'tipo não suportado (use PNG, JPG, WEBP, GIF, MP4 ou WEBM)' });
      const used = await db.sumMediaBytes(sess.tenant_id);
      if (used >= storage.QUOTA_BYTES) return sendJson(res, 413, { error: 'cota de armazenamento cheia' });
      try {
        const saved = await storage.saveStream(sess.tenant_id, req, { mime });
        const name = String(query.name || 'arquivo').slice(0, 180);
        await db.createMedia({ id: saved.id, tenantId: sess.tenant_id, name, mime: saved.mime, size: saved.size, key: saved.key, url: saved.url });
        return sendJson(res, 201, { id: saved.id, name, mime: saved.mime, size: saved.size, url: saved.url });
      } catch (e) {
        return sendJson(res, e.status || 500, { error: e.message || 'falha no upload' });
      }
    }
    // Listar + uso
    if (req.method === 'GET' && parts.length === 2) {
      const items = await db.listMedia(sess.tenant_id);
      const used = await db.sumMediaBytes(sess.tenant_id);
      return sendJson(res, 200, { items, usage: { used, quota: storage.QUOTA_BYTES } });
    }
    // Remover
    if (req.method === 'DELETE' && parts[2]) {
      const m = await db.getMedia(parts[2]);
      if (!m || m.tenant_id !== sess.tenant_id) return sendJson(res, 404, { error: 'mídia não encontrada' });
      await storage.remove(m.key);
      await db.removeMedia(m.id, sess.tenant_id);
      return sendJson(res, 200, { ok: true });
    }
    return sendJson(res, 404, { error: 'rota de mídia inválida' });
  }

  return sendJson(res, 404, { error: 'rota não encontrada' });
}

/* ---------------- Mídia servida (driver disk): /media/<tenant>/<arquivo> ----------------
 * Pública por chave opaca e não-adivinhável. Cache longo (nome único) e
 * nosniff para não interpretar o conteúdo como outra coisa. */
function handleMedia(req, res, urlPath) {
  const key = decodeURIComponent(urlPath.slice('/media/'.length));
  const full = storage.resolveLocal(key);
  if (!full) { res.writeHead(403); return res.end('Acesso negado'); }
  fs.readFile(full, (err, data) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('Não encontrado'); }
    const ext = path.extname(full).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Cache-Control': 'public, max-age=31536000, immutable',
      'X-Content-Type-Options': 'nosniff',
    });
    res.end(data);
  });
}

/* ---------------- Painel React (SPA em /app, build em web/dist) ---------------- */
const APP_DIR = path.join(ROOT, 'web', 'dist');
function handleApp(req, res, urlPath) {
  // Migração incremental: o painel React vive em /app, ao lado do admin
  // vanilla. Rotas de cliente (sem extensão) caem no index.html (SPA).
  let rest = urlPath.slice('/app'.length) || '/';
  if (rest === '/') rest = '/index.html';
  const filePath = path.normalize(path.join(APP_DIR, rest));
  if (!filePath.startsWith(APP_DIR)) { res.writeHead(403); return res.end('Acesso negado'); }
  fs.readFile(filePath, (err, data) => {
    if (err) {
      if (!path.extname(rest)) return serveAppIndex(res); // rota de cliente
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('Não encontrado: ' + urlPath);
    }
    sendFile(res, filePath, data);
  });
}
function serveAppIndex(res) {
  fs.readFile(path.join(APP_DIR, 'index.html'), (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('Painel não compilado. Rode: cd web && npm install && npm run build');
    }
    sendFile(res, 'index.html', data);
  });
}

/* ---------------- Arquivos estáticos ---------------- */
function sendFile(res, filePath, data) {
  const ext = path.extname(filePath).toLowerCase();
  // Assets do Vite têm hash no nome → cache longo; o resto revalida.
  const hashed = /\/assets\//.test(filePath);
  const revalidate = !hashed && (ext === '.html' || ext === '.js' || ext === '.css' || ext === '.json');
  res.writeHead(200, {
    'Content-Type': MIME[ext] || 'application/octet-stream',
    'Cache-Control': hashed ? 'public, max-age=31536000, immutable' : (revalidate ? 'no-cache' : 'public, max-age=3600'),
  });
  res.end(data);
}
function handleStatic(req, res, urlPath) {
  // A raiz agora leva ao painel com conta (React em /app). O admin vanilla
  // antigo (single-screen, sem conta) fica acessível em /legacy até o editor
  // rico ser portado para o /app — assim nada se perde na transição.
  if (urlPath === '/') { res.writeHead(302, { Location: '/app' }); return res.end(); }
  if (urlPath === '/legacy' || urlPath === '/legacy/') urlPath = '/index.html';
  const filePath = path.normalize(path.join(ROOT, urlPath));
  if (!filePath.startsWith(ROOT)) { res.writeHead(403); return res.end('Acesso negado'); }
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('Não encontrado: ' + urlPath); }
    sendFile(res, filePath, data);
  });
}

const server = http.createServer((req, res) => {
  const parsed = url.parse(req.url || '/', true);
  const pathname = decodeURIComponent(parsed.pathname || '/');
  if (pathname === '/api' || pathname.startsWith('/api/')) {
    return handleApi(req, res, pathname, parsed.query || {})
      .catch((e) => { console.warn('[api]', e.message); try { sendJson(res, 500, { error: 'erro interno' }); } catch (_) {} });
  }
  if (pathname === '/app' || pathname.startsWith('/app/')) {
    return handleApp(req, res, pathname);
  }
  if (pathname.startsWith('/media/')) {
    return handleMedia(req, res, pathname);
  }
  return handleStatic(req, res, pathname);
});

db.init()
  .then(() => server.listen(PORT, () => { console.log('Vistra rodando em http://localhost:' + PORT); }))
  .catch((e) => { console.error('[db] falha ao inicializar:', e.message); process.exit(1); });
