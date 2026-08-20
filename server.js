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
// Toda gravação de arquivo passa por aqui: linha no banco junto com o byte.
const midia = require('./server/midia');
const reconectar = require('./server/reconectar');
const usoIA = require('./server/uso-ia');
const creditos = require('./server/creditos');
const security = require('./server/security');
const { log } = require('./server/log.js');
const erros = require('./server/erros.js');
const diagnostico = require('./server/diagnostico');
const { rateLimit, clientIp, safeEqual, isSecureRequest } = security;
const mail = require('./server/mail');
const plans = require('./server/plans');
const billing = require('./server/billing');
const ai = require('./server/ai');
const director = require('./server/ai-director');
const site = require('./server/site.js');
const operadores = require('./server/operadores.js');
const passes = require('./server/passes.js');
const metricas = require('./server/metricas.js');
const ds = require('./server/design-system');
const jobs = require('./server/jobs');
const legal = require('./server/legal');
// Mesmo arquivo que o player carrega no navegador — catálogo único de datas.
const seasons = require('./js/seasons.js');
// Mesmo arquivo que o player usa: o que é uma config está definido num lugar só.
const schema = require('./js/storage.js');
const briefing = require('./server/ai-briefing');
const memory = require('./server/ai-memoria');
const muralLib = require('./server/mural');
const qrcode = require('./server/qr');

const PORT = process.env.PORT || 8080;
const ROOT = __dirname;

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json',
  '.webp': 'image/webp', '.gif': 'image/gif', '.mp4': 'video/mp4', '.webm': 'video/webm',
  '.woff2': 'font/woff2', '.woff': 'font/woff', '.txt': 'text/plain; charset=utf-8',
};

// Assinantes SSE por device (em memória).
const subscribers = {}; // { [deviceId]: Set<res> }
// O que cada TV está tocando agora. Estado do instante, não dado: some no
// restart e volta sozinho no próximo aviso da tela.
const estadoSom = {}; // { [deviceId]: { em, estado } }

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

/* ---------------- Login com Google (OAuth) ---------------- */
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || '';
function googleEnabled() { return !!(GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET); }

/*
 * URL pública desta instalação. Usada nos links de e-mail e no redirect do
 * OAuth. Prefere APP_URL (fixa e confiável); senão monta a partir do request,
 * respeitando os headers do proxy do Railway.
 */
function baseUrl(req) {
  const fixed = (process.env.APP_URL || '').replace(/\/$/, '');
  if (fixed) return fixed;
  const proto = isSecureRequest(req) ? 'https' : 'http';
  const host = req.headers['x-forwarded-host'] || req.headers.host || ('localhost:' + PORT);
  return proto + '://' + host;
}
// Papéis: owner (dono) > admin > member. Gestão de equipe: owner e admin.
function canManageTeam(role) { return role === 'owner' || role === 'admin'; }

// Normaliza uma linha da planilha de aniversariantes. Aceita dia/mes numéricos
// ou um campo "nascimento" (DD/MM ou DD/MM/AAAA). Descarta linhas sem nome/data.
function normBirthday(r) {
  if (!r) return null;
  const nome = String(r.nome || '').trim().slice(0, 80);
  if (!nome) return null;
  let dia = parseInt(r.dia, 10), mes = parseInt(r.mes, 10);
  if ((!dia || !mes) && r.nascimento) {
    const m = String(r.nascimento).match(/(\d{1,2})[\/\-.](\d{1,2})/);
    if (m) { dia = parseInt(m[1], 10); mes = parseInt(m[2], 10); }
  }
  if (!(dia >= 1 && dia <= 31 && mes >= 1 && mes <= 12)) return null;
  return {
    nome,
    matricula: String(r.matricula || '').trim().slice(0, 40),
    cargo: String(r.cargo || '').trim().slice(0, 80),
    foto: String(r.foto || '').trim().slice(0, 400),
    dia, mes,
  };
}
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
      erros.registrar(e, { rota: req.url, metodo: req.method, onde: 'corpo da requisição' });
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
/*
 * Avisa TODAS as telas da empresa. Diferente do `broadcast`, que fala com um
 * device: aqui o fato é da empresa (chegou foto no mural, o mural foi limpo) e
 * pode estar em várias telas ao mesmo tempo.
 *
 * Só toca em quem está assinando SSE — não é uma consulta cara por tela.
 */
async function avisarTelas(tenantId, event, payload) {
  try {
    const telas = await db.listDevices(tenantId);
    for (const d of telas) if (subscribers[d.id]) broadcast(d.id, event, payload || {});
  } catch (e) { erros.registrar(e, { onde: 'aviso às telas', tenant: tenantId }); }
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

/*
 * Baixa as imagens da marca do storage no formato que a visão do Gemini pede.
 * Pula o que não é URL de mídia nossa ou passa de 5 MB — então o chamador deve
 * conferir o tamanho do resultado quando a ORDEM importar.
 */
async function lerImagens(urls) {
  const imgs = [];
  for (const u of urls || []) {
    const i = String(u).indexOf('/media/'); if (i < 0) continue;
    const buf = await storage.readBuffer(String(u).slice(i + '/media/'.length)).catch(() => null);
    if (!buf || buf.length > 5 * 1024 * 1024) continue;
    const ext = String(u.split('.').pop() || '').toLowerCase();
    imgs.push({ mime: ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg', data: buf.toString('base64') });
  }
  return imgs;
}

/* ---------------- API ---------------- */
async function handleApi(req, res, pathname, query) {
  const parts = pathname.split('/').filter(Boolean); // ['api', ...]
  const sess = await auth.currentSession(req);

  /*
   * Desenho de QR. Aberto de propósito: é uma função pura do texto pedido, não
   * lê nada do banco e não conta nada a ninguém. A TV precisa dele sem sessão,
   * e o painel precisa dele antes de salvar o mural.
   */
  if (parts[1] === 'qr.svg' && req.method === 'GET') {
    const dado = String(query.d || '');
    if (!dado) return sendJson(res, 400, { error: 'faltou o parâmetro d' });
    if (Buffer.byteLength(dado, 'utf8') > qrcode.MAX_BYTES) {
      return sendJson(res, 413, { error: 'texto longo demais para caber num QR legível' });
    }
    let svg;
    try { svg = qrcode.svg(dado, { escuro: /^#[0-9a-f]{3,8}$/i.test(query.cor || '') ? query.cor : undefined }); }
    catch (e) { return sendJson(res, 400, { error: 'não foi possível gerar o QR' }); }
    res.writeHead(200, { 'Content-Type': 'image/svg+xml; charset=utf-8', 'Cache-Control': 'public, max-age=86400' });
    return res.end(svg);
  }

  /* ----- Auth ----- */
  if (parts[1] === 'auth') {
    const action = parts[2];
    if (req.method === 'POST' && action === 'signup') {
      const rl = rateLimit('signup:' + clientIp(req), 10, 60 * 60 * 1000); // 10/h por IP
      if (!rl.ok) return sendJson(res, 429, { error: 'muitas tentativas, tente mais tarde' }, { 'Retry-After': String(rl.retryAfter) });
      return readBody(req, res, async (b) => {
        if (!b || !validEmail(b.email) || !b.password || String(b.password).length < 6)
          return sendJson(res, 400, { error: 'e-mail válido e senha de 6+ caracteres' });
        /*
         * O aceite é exigido no SERVIDOR, não só na caixinha do formulário.
         * Sem isso a prova de aceite valeria só para quem usa a interface —
         * qualquer chamada direta criaria conta sem registro nenhum.
         */
        if (b.aceite !== true) return sendJson(res, 400, { error: 'é preciso aceitar os Termos e a Política de Privacidade' });
        const email = String(b.email).trim().toLowerCase();
        if (await db.getUserByEmail(email)) return sendJson(res, 409, { error: 'e-mail já cadastrado' });
        const passHash = auth.hashPassword(b.password);
        // Com convite: entra numa empresa existente com o papel do convite.
        if (b.inviteCode) {
          const inv = await db.getInviteByCode(b.inviteCode);
          if (!inv || inv.accepted_at) return sendJson(res, 404, { error: 'convite inválido' });
          if (inv.expires_at && inv.expires_at < Date.now()) return sendJson(res, 410, { error: 'convite expirado' });
          /*
           * O convite vale para o e-mail convidado, e só para ele.
           *
           * Sem esta comparação, o código era um cupom ao portador: como não
           * há envio por e-mail, ele é repassado à mão — por WhatsApp, print,
           * grupo — e qualquer um que o visse entrava na empresa com o papel
           * do convite, que pode ser `admin`.
           */
          if (email !== String(inv.email || '').trim().toLowerCase()) {
            return sendJson(res, 403, { error: 'este convite é para outro e-mail' });
          }
          const { userId } = await db.createUser(inv.tenant_id, email, passHash, inv.role, b.name);
          await db.acceptInvite(inv.id);
          await db.registrarAceite(inv.tenant_id, userId, email, legal.VERSAO, 'convite', clientIp(req));
          await auth.startSession(res, userId, inv.tenant_id, req);
          return sendJson(res, 201, { user: { email, role: inv.role }, tenant: { id: inv.tenant_id } });
        }
        // Sem convite: cria uma nova empresa e o usuário vira dono (owner).
        const { userId, tenantId } = await db.createAccount(email, passHash, b.name, b.name);
        await db.registrarAceite(tenantId, userId, email, legal.VERSAO, 'cadastro', clientIp(req));
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
    /* --- Capacidades de login (o painel usa para mostrar/ocultar opções) --- */
    if (req.method === 'GET' && action === 'config') {
      return sendJson(res, 200, { google: googleEnabled(), mail: mail.configured() });
    }

    /* --- Esqueci minha senha: gera token de uso único e manda por e-mail --- */
    if (req.method === 'POST' && action === 'forgot') {
      const rl = rateLimit('forgot:' + clientIp(req), 10, 60 * 60 * 1000);
      if (!rl.ok) return sendJson(res, 429, { error: 'muitas tentativas, tente mais tarde' }, { 'Retry-After': String(rl.retryAfter) });
      return readBody(req, res, async (b) => {
        const email = String((b && b.email) || '').trim().toLowerCase();
        if (!validEmail(email)) return sendJson(res, 400, { error: 'informe um e-mail válido' });
        const u = await db.getUserByEmail(email);
        // Resposta sempre igual: não revela quais e-mails existem na base.
        const generic = { ok: true, sent: true };
        if (!u) return sendJson(res, 200, generic);
        const token = crypto.randomBytes(24).toString('hex');
        await db.createReset(token, u.id, Date.now() + 60 * 60 * 1000); // 1 hora
        const link = baseUrl(req) + '/app/?reset=' + token;
        /*
         * O LINK NUNCA VOLTA NO CORPO DA RESPOSTA.
         *
         * Aqui havia `if (!mail.configured()) return sendJson(res, 200, { devLink: link })`
         * — um atalho de desenvolvimento que virava tomada de conta em
         * produção. `mail.configured()` é falso sempre que faltam as chaves do
         * Resend e do Brevo, que é o estado padrão de quem ainda não terminou
         * de configurar; e nesse modo o envio não lança, então nem o catch
         * desviava. Duas requisições sem nenhuma credencial — pedir o reset de
         * um e-mail e usar o token devolvido — davam a sessão do dono da conta.
         *
         * O modo dev continua existindo: `mail.send` imprime o link no LOG do
         * servidor (mail.js), que é onde quem está desenvolvendo tem acesso e
         * um visitante da internet não tem.
         */
        try {
          const msg = mail.resetEmail(link);
          await mail.send({ to: email, subject: msg.subject, html: msg.html, text: msg.text });
        } catch (e) {
          // Resposta genérica também na falha: um 502 aqui e um 200 no e-mail
          // inexistente diriam, pela diferença, quais contas existem na base.
          erros.registrar(e, { onde: 'recuperação de senha' });
          return sendJson(res, 200, generic);
        }
        return sendJson(res, 200, generic);
      });
    }

    /* --- Redefinir a senha com o token do e-mail --- */
    if (req.method === 'POST' && action === 'reset') {
      const rl = rateLimit('reset:' + clientIp(req), 20, 60 * 60 * 1000);
      if (!rl.ok) return sendJson(res, 429, { error: 'muitas tentativas, tente mais tarde' }, { 'Retry-After': String(rl.retryAfter) });
      return readBody(req, res, async (b) => {
        const token = String((b && b.token) || '').trim();
        const password = String((b && b.password) || '');
        if (password.length < 6) return sendJson(res, 400, { error: 'a senha precisa ter 6+ caracteres' });
        const r = token && await db.getReset(token);
        if (!r || r.used_at || Number(r.expires_at) < Date.now())
          return sendJson(res, 410, { error: 'link inválido ou expirado — peça outro' });
        const u = await db.getUserById(r.user_id);
        if (!u) return sendJson(res, 410, { error: 'link inválido ou expirado — peça outro' });
        await db.setUserPassword(u.id, auth.hashPassword(password));
        await db.consumeReset(token);
        /*
         * Derruba as outras sessões ANTES de abrir a nova.
         *
         * Este fluxo existe para recuperar uma conta comprometida. Sem esta
         * linha ele fazia o contrário: trocava a senha e deixava o cookie de
         * quem invadiu valendo por até 30 dias.
         */
        await db.destroySessionsOfUser(u.id);
        await auth.startSession(res, u.id, u.tenant_id, req);
        return sendJson(res, 200, { ok: true, user: { email: u.email }, tenant: { id: u.tenant_id } });
      });
    }

    /* --- Login com Google (OAuth 2.0, sem dependências) --- */
    // parts.length === 3 → só /api/auth/google (o /callback é tratado abaixo).
    if (req.method === 'GET' && action === 'google' && parts.length === 3) {
      if (!googleEnabled()) return sendJson(res, 501, { error: 'login com Google não configurado' });
      const state = crypto.randomBytes(16).toString('hex');
      const url = 'https://accounts.google.com/o/oauth2/v2/auth?' + new URLSearchParams({
        client_id: GOOGLE_CLIENT_ID,
        redirect_uri: baseUrl(req) + '/api/auth/google/callback',
        response_type: 'code',
        scope: 'openid email profile',
        state,
        prompt: 'select_account',
      });
      res.writeHead(302, {
        Location: url,
        'Cache-Control': 'no-store',
        // state em cookie curto: confere na volta (proteção CSRF).
        'Set-Cookie': 'mt_oauth=' + state + '; HttpOnly; Path=/; SameSite=Lax; Max-Age=600' + (isSecureRequest(req) ? '; Secure' : ''),
      });
      return res.end();
    }
    if (req.method === 'GET' && parts[2] === 'google' && parts[3] === 'callback') {
      if (!googleEnabled()) return sendJson(res, 501, { error: 'login com Google não configurado' });
      const q = new URL(req.url, baseUrl(req)).searchParams;
      const fail = (motivo) => {
        res.writeHead(302, { Location: '/app/?erro=' + encodeURIComponent(motivo), 'Cache-Control': 'no-store' });
        res.end();
      };
      const cookieState = (req.headers.cookie || '').match(/mt_oauth=([^;]+)/);
      if (!q.get('code') || !cookieState || cookieState[1] !== q.get('state')) return fail('login-google-invalido');
      try {
        const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
          method: 'POST',
          headers: { 'content-type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            code: q.get('code'),
            client_id: GOOGLE_CLIENT_ID,
            client_secret: GOOGLE_CLIENT_SECRET,
            redirect_uri: baseUrl(req) + '/api/auth/google/callback',
            grant_type: 'authorization_code',
          }),
        });
        const tok = await tokenRes.json();
        if (!tokenRes.ok || !tok.access_token) return fail('login-google-falhou');
        const infoRes = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
          headers: { authorization: 'Bearer ' + tok.access_token },
        });
        const info = await infoRes.json();
        if (!infoRes.ok || !info.sub || !info.email) return fail('login-google-falhou');
        if (info.email_verified === false) return fail('email-google-nao-verificado');
        const email = String(info.email).trim().toLowerCase();

        let u = await db.getUserByGoogle(info.sub);
        if (!u) {
          u = await db.getUserByEmail(email);
          if (u) {
            await db.setUserGoogle(u.id, info.sub); // vincula à conta existente
          } else {
            // Primeiro acesso: cria a empresa e o usuário vira dono. Sem senha
            // (pass_hash nulo) — entra pelo Google ou define senha pelo "esqueci".
            const { userId, tenantId } = await db.createAccount(email, null, info.name || email, info.name || '');
            await db.setUserGoogle(userId, info.sub);
            // O aceite aqui é o clique em "Entrar com Google", numa tela que
            // mostra os dois links. Registrado com origem própria para ficar
            // claro que não veio de caixinha marcada.
            await db.registrarAceite(tenantId, userId, email, legal.VERSAO, 'google', clientIp(req));
            u = { id: userId, tenant_id: tenantId };
          }
        }
        await auth.startSession(res, u.id, u.tenant_id, req);
        // Limpa o cookie de state e entra no painel.
        res.setHeader('Set-Cookie', [res.getHeader('Set-Cookie'), 'mt_oauth=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0'].flat().filter(Boolean));
        res.writeHead(302, { Location: '/app/', 'Cache-Control': 'no-store' });
        return res.end();
      } catch (e) {
        erros.registrar(e, { onde: 'login com Google' });
        return fail('login-google-falhou');
      }
    }

    /* --- Ajustes: nome do usuário e da empresa --- */
    if (req.method === 'POST' && action === 'profile') {
      if (!sess) return sendJson(res, 401, { error: 'não autenticado' });
      return readBody(req, res, async (b) => {
        if (b && typeof b.name === 'string') await db.setUserName(sess.user_id, b.name.trim());
        // Só o dono muda o nome da empresa (aparece nas telas e nos e-mails).
        if (b && typeof b.empresa === 'string') {
          if (sess.role !== 'owner') return sendJson(res, 403, { error: 'só o dono pode mudar o nome da empresa' });
          await db.setTenantName(sess.tenant_id, b.empresa.trim());
        }
        return sendJson(res, 200, { ok: true });
      });
    }

    /* --- Ajustes: trocar a própria senha --- */
    if (req.method === 'POST' && action === 'password') {
      if (!sess) return sendJson(res, 401, { error: 'não autenticado' });
      return readBody(req, res, async (b) => {
        const atual = String((b && b.atual) || '');
        const nova = String((b && b.nova) || '');
        if (nova.length < 6) return sendJson(res, 400, { error: 'a nova senha precisa ter 6+ caracteres' });
        const u = await db.getUserById(sess.user_id);
        if (!u) return sendJson(res, 401, { error: 'não autenticado' });
        // Conta criada pelo Google não tem senha ainda: nesse caso, define a primeira.
        if (u.pass_hash && !auth.verifyPassword(atual, u.pass_hash))
          return sendJson(res, 401, { error: 'senha atual incorreta' });
        await db.setUserPassword(u.id, auth.hashPassword(nova));
        /*
         * Trocar a senha expulsa os outros aparelhos, e reemite a sessão de
         * quem está aqui — senão a pessoa se desconectaria a si mesma no
         * meio dos Ajustes.
         *
         * Sem isto, quem trocava a senha por desconfiar de invasão continuava
         * invadido: o cookie do outro seguia válido por até 30 dias.
         */
        await db.destroySessionsOfUser(u.id);
        await auth.startSession(res, u.id, u.tenant_id, req);
        return sendJson(res, 200, { ok: true });
      });
    }

    if (req.method === 'GET' && action === 'me') {
      if (!sess) return sendJson(res, 401, { error: 'não autenticado' });
      const t = await db.getTenant(sess.tenant_id);
      const u = await db.getUserById(sess.user_id);
      /*
       * `operador` decide se o menu da plataforma aparece. É só a APARÊNCIA:
       * a porta de verdade está em /api/plataforma, e ela pergunta de novo.
       * Esconder o menu sem fechar a rota seria segurança de fachada.
       */
      const quem = await operadores.permissao(db, sess);
      return sendJson(res, 200, {
        tenant: { id: sess.tenant_id, name: (t && t.name) || '' },
        // hasPassword: conta criada pelo Google ainda não tem senha própria.
        user: { id: sess.user_id, email: sess.email, role: sess.role, name: sess.name, hasPassword: !!(u && u.pass_hash) },
        operador: quem.pode,
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
  /* ----- IA: gerar campanha da TELA INTEIRA (todas as zonas) ----- */
  /*
   * Medir TODA chamada de IA, cobrando crédito ou não.
   *
   * É a fatia 1 de docs/BILLING.md: duas a quatro semanas de dados reais
   * valem mais que qualquer estimativa de custo, inclusive as escritas na
   * própria proposta. Só a imagem debita saldo — o texto é livre porque uma
   * campanha inteira dele custa cinco centavos, menos que a taxa fixa do
   * Stripe na transação que cobraria por ela.
   *
   * O registro acontece na ENTRADA da rota, e não no sucesso: a chamada ao
   * fornecedor é feita de qualquer jeito, então é ela que queremos contar. O
   * erro de validação que nem chega a chamar a IA conta a mais, e isso é
   * preferível a não contar o que gastou.
   */
  const TIPO_IA = {
    'generate-campaign': 'gerar-campanha', 'generate-content': 'gerar-conteudo',
    diagnose: 'diagnosticar', briefing: 'briefing', director: 'diretor',
    'generate-kit': 'gerar-kit', 'generate-composition': 'gerar-composicao',
    'generate-seasonal': 'gerar-sazonal', 'generate-dayparts': 'gerar-faixas',
    rewrite: 'reescrever',
  };
  if (parts[1] === 'ai' && sess && TIPO_IA[parts[2]] && req.method === 'POST') {
    /*
     * A medição não pode derrubar a rota. Ela é contabilidade: se falhar,
     * perde-se o dado, e não o produto — foi exatamente o que aconteceu na
     * primeira versão, em que um erro de registro virou 500 para quem só
     * queria reescrever um texto.
     */
    try {
      const tenantTexto = await db.getTenant(sess.tenant_id);
      if (tenantTexto) {
        if (!(await usoIA.tetoTextoOk(db, tenantTexto))) {
          return sendJson(res, 429, { error: 'muitas chamadas de IA nesta conta hoje. Tente de novo mais tarde.' });
        }
        // Não bloqueia: texto é livre. Só registra, para a franquia poder ser
        // calibrada com dado em vez de palpite.
        await usoIA.cobrar(db, tenantTexto, { tipo: TIPO_IA[parts[2]], quantidade: 1, userId: sess.user_id, referencia: parts[2] });
      }
    } catch (e) { log.aviso('uso-ia.medicao-falhou', { motivo: e.message }); }
  }

  if (parts[1] === 'ai' && parts[2] === 'generate-campaign') {
    if (!sess) return sendJson(res, 401, { error: 'não autenticado' });
    if (req.method !== 'POST') return sendJson(res, 405, { error: 'método inválido' });
    const rl = rateLimit('ai:' + sess.tenant_id, 30, 60 * 60 * 1000);
    if (!rl.ok) return sendJson(res, 429, { error: 'limite de gerações por hora atingido' }, { 'Retry-After': String(rl.retryAfter) });
    return readBody(req, res, async (b) => {
      const answers = (b && b.answers) || {};
      if (!answers.objetivo || !String(answers.objetivo).trim()) return sendJson(res, 400, { error: 'informe o objetivo da campanha' });
      try {
        const campaign = await ai.generateCampaign(answers, { empresa: (b && b.empresa) || '', tema: (b && b.tema) || '', zones: (b && b.zones) || [] });
        return sendJson(res, 200, { mode: ai.mode(), ...campaign });
      } catch (e) { return sendJson(res, 502, { error: 'falha na IA: ' + e.message }); }
    });
  }

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

  /* ----- Biblioteca de peças (kits): salvar / listar / editar / remover ----- */
  if (parts[1] === 'library') {
    if (!sess) return sendJson(res, 401, { error: 'não autenticado' });
    if (req.method === 'GET' && parts.length === 2) {
      return sendJson(res, 200, { items: await db.listLibrary(sess.tenant_id) });
    }
    if (req.method === 'POST' && parts.length === 2) {
      return readBody(req, res, async (b) => {
        const pieces = (b && b.pieces) || [];
        if (!Array.isArray(pieces) || !pieces.length) return sendJson(res, 400, { error: 'sem peças para salvar' });
        const n = await db.addLibrary(sess.tenant_id, (b && b.campaign) || 'Campanha', pieces.slice(0, 30));
        await db.registrarEvento(sess.tenant_id, sess.user_id, 'peca.salvar');
        return sendJson(res, 201, { ok: true, saved: n });
      });
    }
    /*
     * Campanha inteira: /api/library/campanhas/:nome
     * Vem ANTES do tratamento por id — o segmento fixo "campanhas" nunca é um
     * id de peça, então não há ambiguidade.
     */
    if (parts[2] === 'campanhas' && parts[3]) {
      const nome = decodeURIComponent(parts[3]);
      if (req.method === 'PUT') {
        return readBody(req, res, async (b) => {
          const novo = String((b && b.nome) || '').trim().slice(0, 120);
          if (!novo) return sendJson(res, 400, { error: 'informe o novo nome' });
          const n = await db.renameCampaign(sess.tenant_id, nome, novo);
          return sendJson(res, 200, { ok: true, alteradas: n });
        });
      }
      if (req.method === 'DELETE') {
        const n = await db.deleteCampaign(sess.tenant_id, nome);
        return sendJson(res, 200, { ok: true, removidas: n });
      }
      if (req.method === 'POST' && parts[4] === 'duplicar') {
        return readBody(req, res, async (b) => {
          const pecas = await db.listCampaign(sess.tenant_id, nome);
          if (!pecas.length) return sendJson(res, 404, { error: 'campanha não encontrada' });
          const destino = String((b && b.nome) || (nome + ' (cópia)')).trim().slice(0, 120);
          const n = await db.addLibrary(sess.tenant_id, destino, pecas.map((p) => ({
            canal: p.canal, formato: p.formato, label: p.label, item: p.item,
          })));
          return sendJson(res, 201, { ok: true, campanha: destino, copiadas: n });
        });
      }
      return sendJson(res, 405, { error: 'método inválido' });
    }
    if (parts[2]) {
      if (req.method === 'PUT') {
        return readBody(req, res, async (b) => {
          const changed = await db.updateLibraryItem(parts[2], sess.tenant_id, (b && b.item) || {}, (b && b.label) || '');
          if (!changed) return sendJson(res, 404, { error: 'peça não encontrada' });
          return sendJson(res, 200, { ok: true });
        });
      }
      if (req.method === 'DELETE') {
        await db.deleteLibraryItem(parts[2], sess.tenant_id);
        return sendJson(res, 200, { ok: true });
      }
    }
    return sendJson(res, 404, { error: 'rota da biblioteca não encontrada' });
  }

  /* ----- Aniversariantes: importar planilha / listar / limpar ----- */
  if (parts[1] === 'birthdays') {
    if (!sess) return sendJson(res, 401, { error: 'não autenticado' });
    if (req.method === 'GET') {
      const list = await db.listBirthdays(sess.tenant_id);
      return sendJson(res, 200, { count: list.length, birthdays: list });
    }
    if (req.method === 'DELETE') {
      if (!canManageTeam(sess.role)) return sendJson(res, 403, { error: 'sem permissão' });
      await db.clearBirthdays(sess.tenant_id);
      return sendJson(res, 200, { ok: true });
    }
    if (parts[2] === 'import' && req.method === 'POST') {
      if (!canManageTeam(sess.role)) return sendJson(res, 403, { error: 'sem permissão' });
      return readBody(req, res, async (b) => {
        const raw = (b && b.rows) || [];
        if (!Array.isArray(raw) || !raw.length) return sendJson(res, 400, { error: 'envie as linhas (rows)' });
        const rows = raw.map(normBirthday).filter(Boolean).slice(0, 2000);
        if (!rows.length) return sendJson(res, 400, { error: 'nenhuma linha válida (precisa de nome e data)' });
        const n = await db.replaceBirthdays(sess.tenant_id, rows);
        return sendJson(res, 200, { ok: true, imported: n, ignored: raw.length - rows.length });
      });
    }
    return sendJson(res, 404, { error: 'rota de aniversariantes não encontrada' });
  }

  /* ----- Mural: envio público por QR ----- */

  /*
   * Rota PÚBLICA. Não tem sessão: o código do QR é a credencial, e por isso ela
   * só ENVIA — nunca lista, apaga nem revela o que os outros mandaram. Quem
   * escaneia o QR consegue exatamente uma coisa: pôr uma foto na fila.
   */
  if (parts[1] === 'mural' && parts[2] && parts[3] === 'foto' && req.method === 'POST') {
    const mural = await db.muralPorCodigo(String(parts[2]).toUpperCase());
    if (!mural) return sendJson(res, 404, { error: 'mural não encontrado' });
    if (!mural.aceitando) return sendJson(res, 403, { error: 'este mural está fechado no momento' });

    /*
     * Duas travas de abuso, porque a rota é aberta.
     *
     * A de IP é FROUXA de propósito: num evento o salão inteiro está no mesmo
     * Wi-Fi, então todo mundo chega aqui com o mesmo endereço. Um limite
     * apertado por IP não pararia um abusador — pararia a festa na décima foto.
     * Quem segura o volume de verdade é o teto por mural, e quem segura o
     * conteúdo é o botão de pânico, que fecha tudo num clique.
     */
    const rlIp = rateLimit('mural:ip:' + clientIp(req), 60, 10 * 60 * 1000);
    if (!rlIp.ok) return sendJson(res, 429, { error: 'muitos envios desta rede agora — espere um minuto' }, { 'Retry-After': String(rlIp.retryAfter) });
    const rlMural = rateLimit('mural:m:' + mural.id, 400, 60 * 60 * 1000);
    if (!rlMural.ok) return sendJson(res, 429, { error: 'muitas fotos agora — tente em instantes' }, { 'Retry-After': String(rlMural.retryAfter) });

    const mime = String(query.mime || req.headers['content-type'] || '').toLowerCase();
    // HEIC é o padrão do iPhone e não sabemos exibir: a mensagem tem que dizer
    // o que fazer, não só que deu errado.
    if (/^image\/hei[cf]/.test(mime)) {
      return sendJson(res, 415, { error: 'formato do iPhone (HEIC) não abre na TV — no iPhone, Ajustes › Câmera › Formatos › "Mais compatível", ou tire um print da foto e envie o print' });
    }
    if (!/^image\/(jpeg|png|webp)$/.test(mime)) {
      return sendJson(res, 415, { error: 'envie uma foto (JPG, PNG ou WEBP)' });
    }
    try {
      const salvo = await midia.guardarStream(db, mural.tenantId, req,
        { mime, max: muralLib.MAX_MB * 1024 * 1024 },
        { nome: 'Mural ' + mural.codigo, origem: 'mural' });
      const foto = await db.addFotoMural(mural.id, mural.tenantId, {
        url: salvo.url, chave: salvo.key,
        autor: String(query.autor || '').slice(0, 40),
        mensagem: String(query.mensagem || '').slice(0, 120),
        ip: clientIp(req),
      });
      // Avisa as TVs na hora: é o "tempo real" que o usuário pediu.
      await avisarTelas(mural.tenantId, 'mural', { mural: mural.codigo });
      return sendJson(res, 201, { ok: true, id: foto.id });
    } catch (e) {
      if (e.status === 413) return sendJson(res, 413, { error: 'essa foto passa de ' + muralLib.MAX_MB + ' MB — tente outra' });
      if (e.status === 415) return sendJson(res, 415, { error: 'esse tipo de arquivo não abre na TV' });
      erros.registrar(e, { onde: 'mural de fotos' });
      return sendJson(res, 500, { error: 'não foi possível salvar — tente de novo' });
    }
  }

  // O player busca as fotos visíveis. Só leitura, só as não ocultas.
  if (parts[1] === 'mural' && parts[2] && parts[3] === 'fotos' && req.method === 'GET') {
    const mural = await db.muralPorCodigo(String(parts[2]).toUpperCase());
    if (!mural) return sendJson(res, 404, { error: 'mural não encontrado' });
    /*
     * LISTAR exige credencial; ENVIAR, não.
     *
     * É a regra que o módulo do mural sempre declarou — "o código do QR só
     * permite enviar, nunca listar nem ver o que os outros mandaram" — e que
     * esta rota contrariava sozinha. Com o código impresso num cartaz, qualquer
     * um que o fotografasse de longe lia, meses depois e de fora da rede, os
     * nomes e recados de um evento interno. E o código não é revogável.
     *
     * Quem precisa listar são duas partes, e as duas têm credencial: a TV que
     * exibe o mural (token do device) e o painel do dono (sessão do inquilino).
     */
    const tokenTv = req.headers['x-device-token'] || (query && query.dt) || '';
    const daTv = !!tokenTv && await db.deviceComToken(String(tokenTv), mural.tenantId);
    const daCasa = sess && sess.tenant_id === mural.tenantId;
    if (!daTv && !daCasa) return sendJson(res, 403, { error: 'sem permissão para listar este mural' });
    const fotos = await db.fotosVisiveis(mural.id, 60);
    return sendJson(res, 200, { titulo: mural.titulo, aceitando: mural.aceitando, fotos }, { 'Cache-Control': 'no-store' });
  }

  /* ----- Murais: gestão (autenticada) ----- */
  if (parts[1] === 'murais') {
    if (!sess) return sendJson(res, 401, { error: 'não autenticado' });

    if (req.method === 'GET' && parts.length === 2) {
      const murais = await db.listarMurais(sess.tenant_id);
      return sendJson(res, 200, { murais, base: baseUrl(req) });
    }
    if (req.method === 'POST' && parts.length === 2) {
      return readBody(req, res, async (b) => {
        // Código único: tenta de novo se colidir, em vez de estourar no banco.
        let codigo = '';
        for (let i = 0; i < 6 && !codigo; i++) {
          const tentativa = muralLib.novoCodigo(6);
          if (!(await db.muralPorCodigo(tentativa))) codigo = tentativa;
        }
        if (!codigo) return sendJson(res, 503, { error: 'tente de novo' });
        const m = await db.criarMural(sess.tenant_id, codigo, String((b && b.titulo) || 'Mural').slice(0, 60));
        return sendJson(res, 201, { ...m, base: baseUrl(req) });
      });
    }
    // Tirar uma foto da tela — e devolvê-la, porque quem tira no susto às vezes
    // se arrepende, e reversível é a diferença entre moderar e destruir.
    if (parts[2] === 'fotos' && parts[3] && (req.method === 'DELETE' || req.method === 'PUT')) {
      if (req.method === 'DELETE') {
        await db.ocultarFoto(parts[3], sess.tenant_id, true);
        avisarTelas(sess.tenant_id, 'mural', {});
        return sendJson(res, 200, { ok: true, oculta: true });
      }
      return readBody(req, res, async (b) => {
        await db.ocultarFoto(parts[3], sess.tenant_id, !!(b && b.oculta));
        avisarTelas(sess.tenant_id, 'mural', {});
        return sendJson(res, 200, { ok: true, oculta: !!(b && b.oculta) });
      });
    }
    if (parts[2]) {
      const m = await db.muralPorId(parts[2], sess.tenant_id);
      if (!m) return sendJson(res, 404, { error: 'mural não encontrado' });

      if (req.method === 'GET' && parts[3] === 'fotos') {
        return sendJson(res, 200, { fotos: await db.listarFotosMural(m.id, 200) });
      }
      if (req.method === 'PUT') {
        return readBody(req, res, async (b) => {
          await db.atualizarMural(m.id, sess.tenant_id, String((b && b.titulo) || m.titulo).slice(0, 60), !!(b && b.aceitando));
          return sendJson(res, 200, { ok: true });
        });
      }
      /*
       * BOTÃO DE PÂNICO. Tira tudo da tela numa chamada, e FECHA o mural no
       * mesmo gesto — limpar sem fechar deixaria a próxima foto entrar dois
       * segundos depois, que é justamente o que se está tentando impedir.
       *
       * Oculta em vez de apagar: quem aperta isto está com pressa e talvez com
       * medo, e uma ação irreversível nesse estado é a pior coisa que o sistema
       * pode oferecer. O que sumiu da TV continua listado no painel.
       */
      if (req.method === 'DELETE' && parts[3] === 'fotos') {
        const n = await db.ocultarTodasFotos(m.id, sess.tenant_id);
        await db.atualizarMural(m.id, sess.tenant_id, m.titulo, false);
        avisarTelas(sess.tenant_id, 'mural', {});
        return sendJson(res, 200, { ok: true, ocultadas: n, fechado: true });
      }
      if (req.method === 'DELETE') {
        await db.removerMural(m.id, sess.tenant_id);
        return sendJson(res, 200, { ok: true });
      }
    }
    return sendJson(res, 404, { error: 'rota de mural não encontrada' });
  }

  /* ----- Datas comemorativas: catálogo + a data de hoje ----- */
  if (parts[1] === 'seasons' && req.method === 'GET') {
    // Aberto a quem está logado. `hoje` é o que faz o painel oferecer o pacote
    // certo sem o usuário precisar procurar na lista.
    if (!sess) return sendJson(res, 401, { error: 'não autenticado' });
    const hoje = seasons.todaySeason();
    /*
     * As zonas vêm do layout da tela que está aberta. Sem isso geraríamos
     * conteúdo de lateral para um layout que não tem lateral — o usuário
     * clicaria em "vestir a tela" e metade sumiria sem explicação.
     */
    const zonas = String(query.zonas || 'principal').split(',').map((z) => z.trim()).filter(Boolean);
    const programa = hoje ? seasons.programaDe(hoje, { zonas }) : null;
    return sendJson(res, 200, {
      seasons: seasons.SEASONS, decorations: seasons.DECORATIONS,
      hoje: hoje || null, programa,
    });
  }

  /* ----- LGPD: exportar e excluir os dados da conta ----- */
  if (parts[1] === 'privacidade') {
    if (!sess) return sendJson(res, 401, { error: 'não autenticado' });

    // Exportar: direito de acesso e portabilidade, num arquivo que o titular
    // baixa sozinho — sem abrir chamado e sem depender de nós.
    if (req.method === 'GET' && parts[2] === 'exportar') {
      /*
       * Só o dono, como na exclusão logo abaixo.
       *
       * A exportação devolve o dossiê da empresa: identificadores de cobrança,
       * e-mail e papel de todo mundo, os aceites com IP de cada um e as fotos
       * do mural com o IP de quem enviou. Um `member`, que existe para
       * publicar conteúdo, estava levando dado pessoal de terceiros embora.
       */
      if (sess.role !== 'owner') return sendJson(res, 403, { error: 'só o dono pode exportar os dados da conta' });
      const dados = await db.dadosDoTenant(sess.tenant_id);
      const corpo = JSON.stringify({
        geradoEm: new Date().toISOString(),
        aviso: 'Exportação de dados do MultiTelas. Senhas e tokens de sessão não são incluídos por segurança.',
        termosVigentes: legal.VERSAO,
        dados,
      }, null, 2);
      res.writeHead(200, {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': 'attachment; filename="multitelas-meus-dados.json"',
        'Cache-Control': 'no-store',
      });
      return res.end(corpo);
    }

    /*
     * Excluir: apaga de verdade, sem lixeira. Duas travas de propósito — só o
     * dono, e ele precisa digitar o próprio e-mail. Um botão que destrói a
     * conta inteira não pode ser acionado por engano.
     */
    if (req.method === 'DELETE' && parts[2] === 'conta') {
      if (sess.role !== 'owner') return sendJson(res, 403, { error: 'só o dono pode excluir a conta' });
      return readBody(req, res, async (b) => {
        const confirmacao = String((b && b.confirmacao) || '').trim().toLowerCase();
        if (confirmacao !== String(sess.email || '').toLowerCase()) {
          return sendJson(res, 400, { error: 'digite seu e-mail para confirmar' });
        }
        const chaves = await db.apagarTenant(sess.tenant_id);
        // Os arquivos saem depois do banco: se o storage falhar, a conta já foi
        // apagada e o que sobra é lixo órfão, não dado acessível.
        for (const k of chaves) { try { await storage.remove(k); } catch (e) { /* segue */ } }
        // A sessão já morreu junto com a linha na tabela; aqui só limpamos o
        // cookie para o navegador não ficar tentando usar um token inexistente.
        await auth.clearSession(res, null, req);
        return sendJson(res, 200, { ok: true, arquivos: chaves.length });
      });
    }
    return sendJson(res, 404, { error: 'rota não encontrada' });
  }

  /* ----- Suporte: o cliente escreve, e alguém do outro lado lê ----- */
  if (parts[1] === 'suporte') {
    if (!sess) return sendJson(res, 401, { error: 'não autenticado' });

    if (req.method === 'POST' && parts[2] === 'reclamacao') {
      // Teto por hora: sem ele, um laço de envios enche a caixa de quem lê e
      // some com o que importa no meio.
      const rl = rateLimit('rec:' + sess.tenant_id, 10, 60 * 60 * 1000);
      if (!rl.ok) return sendJson(res, 429, { error: 'muitas mensagens por hora' }, { 'Retry-After': String(rl.retryAfter) });
      return readBody(req, res, async (b) => {
        const texto = String((b && b.texto) || '').trim();
        if (texto.length < 10) return sendJson(res, 400, { error: 'escreva um pouco mais para a gente entender' });
        const tipo = ['problema', 'duvida', 'sugestao', 'cobranca'].includes(b && b.tipo) ? b.tipo : 'duvida';
        const r = await db.criarReclamacao(sess.tenant_id, sess.user_id, sess.email, tipo, texto);
        await db.registrarEvento(sess.tenant_id, sess.user_id, 'reclamacao');
        return sendJson(res, 201, { id: r.id });
      });
    }

    // O que ESTA conta já mandou, com a resposta quando houver. Guardar sem
    // devolver seria pedir que a pessoa escrevesse num buraco.
    if (req.method === 'GET' && parts[2] === 'reclamacao') {
      return sendJson(res, 200, { itens: await db.reclamacoesDoTenant(sess.tenant_id) });
    }
    return sendJson(res, 404, { error: 'rota de suporte não encontrada' });
  }

  /* ----- Plataforma: os números do MultiTelas inteiro ----- */
  if (parts[1] === 'plataforma') {
    /*
     * A PORTA. Tudo daqui para baixo enxerga TODAS as contas.
     *
     * A checagem é uma só, no topo, e antes de qualquer leitura: espalhá-la
     * por rota é como se esquece uma. E o operador é definido por uma variável
     * de ambiente (ver server/operadores.js) justamente para que nem um bug de
     * rota nem uma senha vazada consigam criar um.
     */
    if (!sess) return sendJson(res, 401, { error: 'não autenticado' });
    const quem = await operadores.permissao(db, sess);
    if (!quem.pode) return sendJson(res, 404, { error: 'rota não encontrada' });

    if (req.method === 'GET' && parts[2] === 'metricas') {
      const agora = Date.now();
      const dias = Math.min(180, Math.max(1, Number(query && query.dias) || 30));
      const desde = agora - dias * 24 * 60 * 60 * 1000;
      const vivaDesde = agora - metricas.JANELA_TELA_VIVA_MS;

      const [numeros, porAcao, paraSessoes, porDia, contasAtivas, pessoasAtivas, reclamacoes] = await Promise.all([
        db.numerosDaPlataforma(agora, vivaDesde, desde),
        db.eventosPorAcao(desde),
        db.eventosParaSessoes(desde),
        db.eventosPorDia(desde),
        db.contasAtivas(desde),
        db.pessoasAtivas(desde),
        db.resumoReclamacoes(desde),
      ]);

      return sendJson(res, 200, {
        dias,
        ...numeros,
        ativas: { contas: contasAtivas, pessoas: pessoasAtivas },
        uso: metricas.sessoesDe(paraSessoes),
        funcoes: metricas.funcoesMaisUsadas(porAcao),
        porDia,
        reclamacoes,
        raiz: quem.raiz,
      });
    }

    /*
     * O que quebrou, agrupado. Vive na memória do processo (ver
     * server/erros.js) — some no deploy, e some de propósito: erro é sintoma
     * do que está rodando AGORA, não histórico do cliente.
     *
     * Só operador vê: a pilha diz caminho de arquivo e nome de função, que é
     * mapa da casa para quem estiver procurando por onde entrar.
     */
    if (req.method === 'GET' && parts[2] === 'erros') {
      return sendJson(res, 200, { ...erros.resumo(), itens: erros.listar(50) });
    }
    if (req.method === 'DELETE' && parts[2] === 'erros') {
      // Zerar depois de consertar, para o próximo aparecer sozinho na lista.
      erros.limpar();
      return sendJson(res, 200, { ok: true });
    }

    if (req.method === 'GET' && parts[2] === 'reclamacoes') {
      return sendJson(res, 200, { itens: await db.listarReclamacoes(200) });
    }
    if (req.method === 'POST' && parts[2] === 'reclamacoes' && parts[3]) {
      return readBody(req, res, async (b) => {
        const status = ['aberta', 'resolvida'].includes(b && b.status) ? b.status : 'resolvida';
        await db.resolverReclamacao(parts[3], status, (b && b.resposta) || '');
        return sendJson(res, 200, { ok: true });
      });
    }

    /*
     * A lista de operadores. Ver pode qualquer operador; MEXER, só a raiz.
     *
     * Sem essa separação um convite errado se multiplicaria sozinho, e não
     * haveria como cortar a árvore de volta a não ser por deploy.
     */
    if (parts[2] === 'operadores') {
      if (req.method === 'GET') {
        return sendJson(res, 200, {
          raiz: operadores.listaDoAmbiente(),
          convidados: await db.listarOperadores(),
          souRaiz: quem.raiz,
        });
      }
      if (!quem.raiz) return sendJson(res, 403, { error: 'só quem está em ADMIN_EMAILS pode dar ou tirar acesso' });
      if (req.method === 'POST') {
        return readBody(req, res, async (b) => {
          const o = await db.addOperador((b && b.email) || '', (b && b.nome) || '', sess.email);
          if (!o) return sendJson(res, 400, { error: 'e-mail inválido' });
          return sendJson(res, 201, o);
        });
      }
      if (req.method === 'DELETE' && parts[3]) {
        await db.removerOperador(decodeURIComponent(parts[3]));
        return sendJson(res, 200, { ok: true });
      }
    }
    return sendJson(res, 404, { error: 'rota da plataforma não encontrada' });
  }

  /* ----- IA: diagnóstico (qual provider e o que a IA respondeu) ----- */
  if (parts[1] === 'ai' && parts[2] === 'diagnose') {
    if (!sess) return sendJson(res, 401, { error: 'não autenticado' });
    const out = await ai.diagnose();
    return sendJson(res, 200, out);
  }

  /* ----- IA: kit de campanha (biblioteca multi-formato) ----- */
  /* ----- Marca: identidade visual da empresa (cores, fontes, imagens) ----- */
  if (parts[1] === 'brand') {
    if (!sess) return sendJson(res, 401, { error: 'não autenticado' });
    // Assets: /api/brand/assets[/:id]
    if (parts[2] === 'assets') {
      if (req.method === 'POST' && parts.length === 3) {
        return readBody(req, res, async (b) => {
          const kind = ['logo', 'base', 'referencia'].includes(b && b.kind) ? b.kind : 'base';
          const url = String((b && b.url) || '').trim();
          if (!url) return sendJson(res, 400, { error: 'informe a imagem' });
          // Só uma logo por empresa: a nova substitui a anterior.
          if (kind === 'logo') {
            for (const a of await db.listBrandAssets(sess.tenant_id)) {
              if (a.kind === 'logo') await db.removeBrandAsset(a.id, sess.tenant_id);
            }
          }
          const a = await db.addBrandAsset(sess.tenant_id, kind, url, (b && b.label) || '');
          return sendJson(res, 201, a);
        });
      }
      if (req.method === 'DELETE' && parts[3]) {
        await db.removeBrandAsset(parts[3], sess.tenant_id);
        return sendJson(res, 200, { ok: true });
      }
      // Rótulo da imagem base: é por ele que o diretor decide usar a foto.
      if (req.method === 'PUT' && parts[3]) {
        return readBody(req, res, async (b) => {
          await db.labelBrandAsset(parts[3], sess.tenant_id, String((b && b.label) || '').slice(0, 160));
          return sendJson(res, 200, { ok: true });
        });
      }
      return sendJson(res, 404, { error: 'rota de marca não encontrada' });
    }
    /*
     * A memória é dedução nossa, então o usuário precisa poder VER e APAGAR.
     * Guardar o que aprendemos de alguém sem mostrar seria o tipo de coisa que
     * a Política de Privacidade descreve e o produto não deveria fazer.
     */
    if (parts[2] === 'memoria') {
      if (req.method === 'GET') {
        return sendJson(res, 200, { memoria: await db.getMemoria(sess.tenant_id) });
      }
      if (req.method === 'DELETE') {
        await db.clearMemoria(sess.tenant_id);
        return sendJson(res, 200, { ok: true });
      }
      return sendJson(res, 405, { error: 'método inválido' });
    }
    /*
     * Marcas: /api/brand/marcas[/:id][/ativar]
     *
     * A tela de Marca continua falando com /api/brand para a marca ATIVA — é
     * o que mantém o diretor de IA, o compositor e o editor funcionando sem
     * saber que agora existem três. Estas rotas são só para escolher entre
     * elas.
     */
    if (parts[2] === 'marcas') {
      if (req.method === 'GET' && parts.length === 3) {
        return sendJson(res, 200, { marcas: await db.listMarcas(sess.tenant_id), limite: db.MAX_MARCAS });
      }
      if (req.method === 'POST' && parts.length === 3) {
        return readBody(req, res, async (b) => {
          const nome = String((b && b.nome) || '').trim().slice(0, 60);
          if (!nome) return sendJson(res, 400, { error: 'dê um nome à marca' });
          const r = await db.criarMarca(sess.tenant_id, nome);
          if (r.erro === 'limite') {
            return sendJson(res, 409, { error: 'você já tem ' + r.limite + ' marcas — apague uma para criar outra', code: 'limite' });
          }
          return sendJson(res, 201, r.marca);
        });
      }
      if (req.method === 'POST' && parts[4] === 'ativar') {
        const m = await db.ativarMarca(parts[3], sess.tenant_id);
        if (!m) return sendJson(res, 404, { error: 'marca não encontrada' });
        return sendJson(res, 200, m);
      }
      if (req.method === 'DELETE' && parts[3]) {
        const r = await db.removerMarca(parts[3], sess.tenant_id);
        if (r.erro === 'ultima') return sendJson(res, 409, { error: 'esta é a sua única marca', code: 'ultima' });
        return sendJson(res, 200, { ok: true });
      }
      /*
       * O site do cliente como referência de estilo.
       *
       * É um pedido HTTP com endereço escolhido pelo usuário — SSRF por
       * construção. Toda a defesa mora em server/site.js; aqui só entram o
       * limite de chamadas (buscar site é rede, e rede alheia é lenta) e a
       * exigência de sessão.
       */
      if (req.method === 'POST' && parts[4] === 'site') {
        const rl = rateLimit('site:' + sess.tenant_id, 20, 60 * 60 * 1000);
        if (!rl.ok) return sendJson(res, 429, { error: 'muitas leituras de site por hora' }, { 'Retry-After': String(rl.retryAfter) });
        return readBody(req, res, async (b) => {
          const dados = await site.analisar((b && b.site) || '');
          if (dados.erro) return sendJson(res, 400, { error: dados.erro });
          await db.registrarEvento(sess.tenant_id, sess.user_id, 'marca.site');
          const m = await db.salvarSiteDaMarca(parts[3], sess.tenant_id, dados.url, dados.resumo, dados.imagem);
          if (!m) return sendJson(res, 404, { error: 'marca não encontrada' });
          /*
           * A imagem que o site publica como sua cara entra como REFERÊNCIA de
           * estilo — é literalmente "a imagem do site". Fica junto das outras
           * referências, então a IA a trata como sempre tratou.
           */
          if (dados.imagem) {
            await db.addBrandAsset(sess.tenant_id, 'referencia', dados.imagem, 'Do site: ' + (dados.titulo || dados.url).slice(0, 40), parts[3]);
          }
          return sendJson(res, 200, { marca: m, lido: dados });
        });
      }
      return sendJson(res, 404, { error: 'rota de marca não encontrada' });
    }
    if (req.method === 'GET') {
      const [kit, assets, mem, marcas] = await Promise.all([
        db.getBrandKit(sess.tenant_id), db.listBrandAssets(sess.tenant_id),
        db.getMemoria(sess.tenant_id), db.listMarcas(sess.tenant_id),
      ]);
      return sendJson(res, 200, {
        kit: kit || null, assets, memoria: mem || null, marcas, limiteMarcas: db.MAX_MARCAS,
        familias: Object.keys(ds.FAMILIAS), direcoes: ds.DIRECOES,
      });
    }
    if (req.method === 'PUT') {
      return readBody(req, res, async (b) => {
        const cores = (Array.isArray(b && b.cores) ? b.cores : [])
          .map((c) => ds.okHex(c, null)).filter(Boolean).slice(0, 6);
        await db.saveBrandKit(sess.tenant_id, {
          nome: String((b && b.nome) || '').trim().slice(0, 60) || undefined,
          cores,
          fonteTitulo: ds.FAMILIAS[b && b.fonteTitulo] ? b.fonteTitulo : '',
          fonteApoio: ds.FAMILIAS[b && b.fonteApoio] ? b.fonteApoio : '',
          direcao: ds.DIRECOES[b && b.direcao] ? b.direcao : '',
          tom: String((b && b.tom) || '').slice(0, 60),
          observacoes: String((b && b.observacoes) || '').slice(0, 600),
        });
        return sendJson(res, 200, { ok: true });
      });
    }
    return sendJson(res, 405, { error: 'método inválido' });
  }

  /* ----- IA: chat de briefing (uma pergunta por vez, antes da campanha) ----- */
  if (parts[1] === 'ai' && parts[2] === 'briefing') {
    if (!sess) return sendJson(res, 401, { error: 'não autenticado' });
    if (req.method !== 'POST') return sendJson(res, 405, { error: 'método inválido' });
    // Uma chamada barata por turno — limite folgado, mas existe.
    const rl = rateLimit('ai:brief:' + sess.tenant_id, 120, 60 * 60 * 1000);
    if (!rl.ok) return sendJson(res, 429, { error: 'muitas perguntas por hora' }, { 'Retry-After': String(rl.retryAfter) });
    return readBody(req, res, async (b) => {
      const mensagens = Array.isArray(b && b.mensagens) ? b.mensagens.slice(0, 24) : [];
      try {
        /*
         * A conversa recebe a marca para NÃO perguntar o que já está
         * cadastrado. Perguntar a cor de quem acabou de cadastrar a cor é o
         * jeito mais rápido de o sistema parecer burro.
         */
        const kit = await db.getBrandKit(sess.tenant_id);
        const assets = await db.listBrandAssets(sess.tenant_id);
        const k = kit || {};
        const marca = (kit || assets.length) ? {
          cores: k.cores || [], tom: k.tom || '', observacoes: k.observacoes || '',
          nome: k.nome || '', site: k.site || '', siteResumo: k.siteResumo || '',
          logo: (assets.find((a) => a.kind === 'logo') || {}).url || '',
          bases: assets.filter((a) => a.kind === 'base').map((a) => ({ url: a.url, label: a.label || '' })),
        } : null;
        const lembrada = await db.getMemoria(sess.tenant_id);
        const out = await briefing.conversar(mensagens, {
          empresa: (b && b.empresa) || '', segmento: (b && b.segmento) || '',
          marca, memoria: lembrada,
        });

        /*
         * Ao FECHAR o briefing, destilamos o que a conversa revelou sobre a
         * EMPRESA e guardamos. É o que faz a próxima campanha começar sabendo
         * mais. Roda em segundo plano de propósito: o usuário não deve esperar
         * por um ganho que só vale da próxima vez.
         */
        if (out.pronto && out.modo !== 'dev') {
          memory.aprender(lembrada, mensagens, out.resumo)
            .then((nova) => db.saveMemoria(sess.tenant_id, nova))
            .catch(() => { /* memória é ganho acumulado, não requisito */ });
        }
        return sendJson(res, 200, out);
      } catch (e) { return sendJson(res, 502, { error: 'falha na IA: ' + e.message }); }
    });
  }

  /* ----- IA: diretor de arte (campanha inteira, layout autoral) ----- */
  if (parts[1] === 'ai' && parts[2] === 'director') {
    if (!sess) return sendJson(res, 401, { error: 'não autenticado' });
    // Acompanhar um trabalho em andamento: /api/ai/director/:id
    if (req.method === 'GET' && parts[3]) {
      const j = jobs.ler(parts[3], sess.tenant_id);
      if (!j) return sendJson(res, 404, { error: 'trabalho não encontrado' });
      return sendJson(res, 200, jobs.publico(j));
    }
    if (req.method !== 'POST') return sendJson(res, 405, { error: 'método inválido' });
    // Custa várias chamadas de modelo (plano + uma por peça) — limite menor.
    const rl = rateLimit('ai:dir:' + sess.tenant_id, 10, 60 * 60 * 1000);
    if (!rl.ok) return sendJson(res, 429, { error: 'limite de campanhas por hora atingido' }, { 'Retry-After': String(rl.retryAfter) });
    // Depois do limite: chamada recusada não é uso, e contá-la inflaria a
    // métrica justamente de quem está esbarrando no teto.
    await db.registrarEvento(sess.tenant_id, sess.user_id, 'ia.campanha');
    return readBody(req, res, async (b) => {
      const brief = b && b.brief;
      if (!brief || !String(brief).trim()) return sendJson(res, 400, { error: 'descreva a campanha' });
      try {
        // Identidade salva da empresa: o que o usuário mandar no pedido tem
        // prioridade, mas o resto vem da marca — sem isso a IA reinventa a
        // identidade a cada briefing.
        const kit = await db.getBrandKit(sess.tenant_id);
        const assets = await db.listBrandAssets(sess.tenant_id);
        const lembrada = await db.getMemoria(sess.tenant_id);
        /*
         * Basta ter QUALQUER coisa da marca — cores salvas ou só imagens. Antes
         * isto exigia o kit, então quem subia logo e fotos sem abrir o
         * formulário de cores via tudo ser ignorado.
         */
        const k = kit || {};
        const marca = (kit || assets.length) ? {
          cores: k.cores || [], fonteTitulo: k.fonteTitulo || '', fonteApoio: k.fonteApoio || '',
          direcao: k.direcao || '', tom: k.tom || '', observacoes: k.observacoes || '',
          nome: k.nome || '', site: k.site || '', siteResumo: k.siteResumo || '',
          logo: (assets.find((a) => a.kind === 'logo') || {}).url || '',
          // As bases levam o rótulo junto: é por ele que o diretor escolhe qual
          // foto do acervo entra em cada peça.
          bases: assets.filter((a) => a.kind === 'base').map((a) => ({ url: a.url, label: a.label || '' })),
          referencias: assets.filter((a) => a.kind === 'referencia').map((a) => a.url),
        } : null;
        /*
         * A campanha roda como TRABALHO, não como requisição. São várias
         * chamadas de modelo em sequência e isso passa fácil do tempo que um
         * proxy aguenta — o usuário veria erro numa campanha que ficou pronta.
         * Aqui devolvemos o id na hora e o painel acompanha o progresso.
         */
        const job = jobs.criar(sess.tenant_id, (progresso) => director.dirigir(String(brief), {
          empresa: (b && b.empresa) || '', segmento: (b && b.segmento) || '',
          publico: (b && b.publico) || '', tom: (b && b.tom) || '', oferta: (b && b.oferta) || '',
          brand: (b && b.brand) || '', brand2: (b && b.brand2) || '',
          formatos: Array.isArray(b && b.formatos) ? b.formatos : null,
          marca,
          // Resumo vindo do chat de briefing, quando o usuário conversou.
          briefingPronto: (b && b.briefingPronto) || null,
          // O que já sabemos da empresa de conversas anteriores.
          memoria: lembrada,
        }, {
          onProgresso: progresso,
          // A geração de imagem fica aqui: o diretor não conhece storage nem tenant.
          // A IA olha as referências da marca e devolve a direção em 1 frase.
          onLerReferencias: async (urls) => {
            const imgs = await lerImagens(urls);
            return imgs.length ? ai.descreverEstilo(imgs) : '';
          },
          // Catálogo do acervo: uma frase por foto sem rótulo, para o diretor
          // saber o que a empresa já tem antes de pagar por uma imagem nova.
          onCatalogar: async (urls) => {
            const imgs = await lerImagens(urls);
            return imgs.length === urls.length ? ai.catalogarImagens(imgs) : [];
          },
          onImagem: async (prompt, formato) => {
            const img = await ai.generateImage(prompt, { formato, brand: (b && b.brand) || '' });
            // Registrada como qualquer outro arquivo: aparece no Armazenamento,
            // conta na cota e some junto com a conta.
            const saved = await midia.guardarBuffer(db, sess.tenant_id, Buffer.from(img.data, 'base64'), img.mime,
              { nome: 'IA · ' + String(prompt).slice(0, 60), origem: 'ia' });
            return saved.url;
          },
        }).then((out) => ({ mode: ai.mode(), ...out })));
        return sendJson(res, 202, jobs.publico(job));
      } catch (e) { return sendJson(res, e.status || 502, { error: e.message }); }
    });
  }

  if (parts[1] === 'ai' && parts[2] === 'generate-kit') {
    if (!sess) return sendJson(res, 401, { error: 'não autenticado' });
    if (req.method !== 'POST') return sendJson(res, 405, { error: 'método inválido' });
    const rl = rateLimit('ai:' + sess.tenant_id, 30, 60 * 60 * 1000);
    if (!rl.ok) return sendJson(res, 429, { error: 'limite de gerações por hora atingido' }, { 'Retry-After': String(rl.retryAfter) });
    return readBody(req, res, async (b) => {
      const brief = b && b.brief;
      if (!brief || !String(brief).trim()) return sendJson(res, 400, { error: 'descreva a campanha' });
      // Referências (imagens): lê do disco e converte para base64 (visão da IA).
      const refImages = [];
      for (const u of ((b && b.refs) || []).slice(0, 3)) {
        try {
          const i = String(u).indexOf('/media/'); if (i < 0) continue;
          const key = String(u).slice(i + '/media/'.length);
          const buf = await storage.readBuffer(key);
          if (!buf || buf.length > 5 * 1024 * 1024) continue;
          const ext = String(key.split('.').pop() || '').toLowerCase();
          const mime = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : ext === 'gif' ? 'image/gif' : 'image/jpeg';
          refImages.push({ mime, data: buf.toString('base64') });
        } catch (e) { /* ignora referência inválida */ }
      }
      try {
        const out = await ai.generateKit(brief, {
          empresa: (b && b.empresa) || '', brand: (b && b.brand) || '', brand2: (b && b.brand2) || '',
          publico: (b && b.publico) || '', tom: (b && b.tom) || '', oferta: (b && b.oferta) || '', refImages,
        });
        return sendJson(res, 200, { mode: ai.mode(), ...out });
      } catch (e) { return sendJson(res, 502, { error: 'falha na IA: ' + e.message }); }
    });
  }

  /* ----- IA: geração de imagem (Gemini/Imagen) → salva no storage ----- */
  if (parts[1] === 'ai' && parts[2] === 'generate-image') {
    if (!sess) return sendJson(res, 401, { error: 'não autenticado' });
    if (req.method !== 'POST') return sendJson(res, 405, { error: 'método inválido' });
    const rl = rateLimit('ai:img:' + sess.tenant_id, 20, 60 * 60 * 1000);
    if (!rl.ok) return sendJson(res, 429, { error: 'limite de imagens por hora atingido' }, { 'Retry-After': String(rl.retryAfter) });
    return readBody(req, res, async (b) => {
      const prompt = b && b.prompt;
      if (!prompt || !String(prompt).trim()) return sendJson(res, 400, { error: 'descreva a imagem' });
      /*
       * Imagem é a ÚNICA coisa da IA que custa dinheiro de verdade, e é a
       * única que o saldo bloqueia. Confere antes de chamar: gerar primeiro e
       * cobrar depois deixaria a conta devendo, e recusar depois de a imagem
       * existir seria pior ainda.
       */
      const tenantIA = await db.getTenant(sess.tenant_id);
      const pode = await usoIA.conferir(db, tenantIA, 'gerar-imagem', 1);
      if (!pode.ok) return sendJson(res, 402, pode.resposta);
      try {
        const img = await ai.generateImage(prompt, {
          formato: (b && b.formato) || '16/9', brand: (b && b.brand) || '', brand2: (b && b.brand2) || '', estilo: (b && b.estilo) || '',
        });
        const buf = Buffer.from(img.data, 'base64');
        const saved = await midia.guardarBuffer(db, sess.tenant_id, buf, img.mime,
          { nome: 'IA · ' + String(prompt).slice(0, 60), origem: 'ia' });
        // Só depois do sucesso: falha não cobra.
        await usoIA.cobrar(db, tenantIA, { tipo: 'gerar-imagem', quantidade: 1, userId: sess.user_id, referencia: saved.id });
        await db.registrarEvento(sess.tenant_id, sess.user_id, 'ia.imagem');
        return sendJson(res, 200, { mode: ai.mode(), url: saved.url, mime: saved.mime, formato: (b && b.formato) || '16/9' });
      } catch (e) { return sendJson(res, 502, { error: 'falha na IA: ' + e.message }); }
    });
  }

  /* ----- IA: layout de composição (editor livre) ----- */
  if (parts[1] === 'ai' && parts[2] === 'generate-composition') {
    if (!sess) return sendJson(res, 401, { error: 'não autenticado' });
    if (req.method !== 'POST') return sendJson(res, 405, { error: 'método inválido' });
    const rl = rateLimit('ai:' + sess.tenant_id, 30, 60 * 60 * 1000);
    if (!rl.ok) return sendJson(res, 429, { error: 'limite de gerações por hora atingido' }, { 'Retry-After': String(rl.retryAfter) });
    return readBody(req, res, async (b) => {
      const brief = b && b.brief;
      if (!brief || !String(brief).trim()) return sendJson(res, 400, { error: 'descreva a peça' });
      try {
        await db.registrarEvento(sess.tenant_id, sess.user_id, 'ia.composicao');
        const out = await ai.generateComposition(brief, {
          empresa: (b && b.empresa) || '',
          tema: (b && b.tema) || '',
          brand: (b && b.brand) || '',
          // O formato nunca era passado: a IA compunha sempre como se a tela
          // fosse deitada, e numa peça 9/16 o layout voltava errado.
          formato: (b && b.formato) || '16/9',
          /*
           * O pedido guiado: o quê, onde, em que cor, em que estilo.
           *
           * Antes o único canal era a frase livre, e o resultado era sempre
           * dois blocos de texto — não havia como pedir uma forma, um ícone,
           * uma cor ou um canto da tela. Cada campo é validado lá dentro
           * (server/ai.js), que é a única porta por onde a resposta entra.
           */
          pedido: {
            tipo: (b && b.tipo) || '',
            onde: (b && b.onde) || '',
            cor: (b && b.cor) || '',
            estilo: (b && b.estilo) || '',
          },
        });
        return sendJson(res, 200, { mode: ai.mode(), ...out });
      } catch (e) { return sendJson(res, 502, { error: 'falha na IA: ' + e.message }); }
    });
  }

  /* ----- IA: arte do dia comemorativo ----- */
  if (parts[1] === 'ai' && parts[2] === 'generate-seasonal') {
    if (!sess) return sendJson(res, 401, { error: 'não autenticado' });
    if (req.method !== 'POST') return sendJson(res, 405, { error: 'método inválido' });
    const rl = rateLimit('ai:' + sess.tenant_id, 30, 60 * 60 * 1000);
    if (!rl.ok) return sendJson(res, 429, { error: 'limite de gerações por hora atingido' }, { 'Retry-After': String(rl.retryAfter) });
    return readBody(req, res, async (b) => {
      const season = (b && b.season) || (b && b.label);
      if (!season) return sendJson(res, 400, { error: 'informe a data comemorativa' });
      try {
        const out = await ai.generateSeasonal(season, { empresa: (b && b.empresa) || '', tema: (b && b.tema) || '' });
        return sendJson(res, 200, { mode: ai.mode(), ...out });
      } catch (e) { return sendJson(res, 502, { error: 'falha na IA: ' + e.message }); }
    });
  }

  /* ----- IA: variações por horário (manhã/tarde/fim de expediente) ----- */
  if (parts[1] === 'ai' && parts[2] === 'generate-dayparts') {
    if (!sess) return sendJson(res, 401, { error: 'não autenticado' });
    if (req.method !== 'POST') return sendJson(res, 405, { error: 'método inválido' });
    const rl = rateLimit('ai:' + sess.tenant_id, 30, 60 * 60 * 1000);
    if (!rl.ok) return sendJson(res, 429, { error: 'limite de gerações por hora atingido' }, { 'Retry-After': String(rl.retryAfter) });
    return readBody(req, res, async (b) => {
      const answers = (b && b.answers) || {};
      if (!answers.objetivo && !answers.brief) return sendJson(res, 400, { error: 'informe o objetivo/brief da campanha' });
      try {
        const out = await ai.generateDayparts(answers, { empresa: (b && b.empresa) || '', tema: (b && b.tema) || '' });
        return sendJson(res, 200, { mode: ai.mode(), ...out });
      } catch (e) { return sendJson(res, 502, { error: 'falha na IA: ' + e.message }); }
    });
  }

  /* ----- IA: reescrever/encurtar para caber e ficar legível à distância ----- */
  if (parts[1] === 'ai' && parts[2] === 'rewrite') {
    if (!sess) return sendJson(res, 401, { error: 'não autenticado' });
    if (req.method !== 'POST') return sendJson(res, 405, { error: 'método inválido' });
    const rl = rateLimit('ai:' + sess.tenant_id, 30, 60 * 60 * 1000);
    if (!rl.ok) return sendJson(res, 429, { error: 'limite de gerações por hora atingido' }, { 'Retry-After': String(rl.retryAfter) });
    return readBody(req, res, async (b) => {
      const text = b && b.text;
      if (!text || !String(text).trim()) return sendJson(res, 400, { error: 'informe o texto' });
      try {
        const out = await ai.rewriteText(text, { campo: (b && b.campo) || 'corpo', tom: (b && b.tom) || '', max: b && b.max });
        return sendJson(res, 200, { mode: ai.mode(), text: out });
      } catch (e) { return sendJson(res, 502, { error: 'falha na IA: ' + e.message }); }
    });
  }

  /*
   * Catálogo de planos, aberto.
   *
   * A landing precisa dos preços, e a única forma de ela nunca mentir é ler
   * do MESMO lugar que cobra. Copiar os números para dentro da página seria
   * garantir que um dia eles divergem — e o dia em que divergem é o dia em
   * que alguém assina esperando um preço e recebe outro.
   *
   * Não exige login: é informação de vitrine, e ela já está impressa na
   * página de preços de qualquer produto.
   */
  if (parts[1] === 'planos' && req.method === 'GET') {
    return sendJson(res, 200, {
      planos: plans.catalog(),
      faixas: plans.FAIXAS.map((f) => ({ ate: f.ate === Infinity ? null : f.ate, desconto: f.desconto })),
      creditosBoasVindas: plans.CREDITOS_BOAS_VINDAS,
      // A landing anuncia o prazo do teste; ele sai daqui para não virar um
      // número escrito à mão numa página, que é como promessa e cobrança
      // começam a discordar.
      diasDeTeste: plans.DIAS_DE_TESTE,
      /*
       * A tabela inteira de 1 a 50 telas, já calculada.
       *
       * A alternativa era mandar só as faixas e deixar a landing fazer a
       * conta. Seria a MESMA conta escrita duas vezes — e é justamente esta
       * conta que já esteve errada uma vez (desconto aplicado a todas as
       * telas fazia 20 telas custarem menos que 19). Cinquenta linhas de
       * JSON são baratas; uma segunda implementação do preço, não.
       */
      simulacao: Array.from({ length: 50 }, (_, i) => {
        const telas = i + 1;
        const linha = { telas };
        for (const id of plans.ORDER) {
          const p = plans.PLANS[id];
          if (p.sobConsulta || !p.precoTelaCents) continue;
          const porTela = plans.precoTelaCents(id, telas);
          linha[id] = {
            totalCents: plans.mensalidadeCents(id, telas),
            porTelaCents: porTela,
            // O desconto que a pessoa de fato sente: quanto a média por tela
            // já caiu em relação ao preço cheio.
            desconto: 1 - porTela / p.precoTelaCents,
          };
        }
        return linha;
      }),
    });
  }

  /*
   * Estado do sistema. SÓ OPERADOR DA PLATAFORMA — não o dono de uma conta.
   *
   * Durante meses esta rota pediu `role === 'owner'`, e o nome enganou: `owner`
   * é o dono de UMA EMPRESA CLIENTE, não quem opera o MultiTelas. O que a rota
   * devolve, porém, é `process.env` interpretado — qual banco, qual provedor de
   * IA, o nome e a região do bucket, se o e-mail está configurado, se os textos
   * legais ainda são rascunho. Nada disso é da conta de quem compra o produto,
   * e "o dono da padaria vê a região do meu R2" não é o que a tela prometia.
   *
   * Responde 404, e não 403, pelo mesmo motivo do painel da plataforma: 403
   * confirmaria a quem tentou que o endereço existe e que só falta o crachá.
   */
  if (parts[1] === 'diagnostico' && req.method === 'GET') {
    if (!sess) return sendJson(res, 401, { error: 'não autenticado' });
    const quem = await operadores.permissao(db, sess);
    if (!quem.pode) return sendJson(res, 404, { error: 'rota não encontrada' });
    return sendJson(res, 200, diagnostico.diagnosticar(process.env));
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

    /*
     * Extrato de uso de IA. O cliente precisa ver PARA ONDE foi o crédito
     * antes de qualquer bloqueio existir — a fatia 3 da proposta só entra
     * depois que esta tela estiver certa e a pessoa tiver aprendido a olhar
     * o saldo.
     */
    if (req.method === 'GET' && seg === 'consumo') {
      const pan = await usoIA.panorama(db, tenant);
      const itens = await db.listarUsoIA(sess.tenant_id, 200);
      return sendJson(res, 200, {
        ...pan,
        itens: itens.map((i) => ({ ...i, rotulo: (creditos.operacao(i.tipo) || {}).rotulo || i.tipo })),
      });
    }

    // Estado atual do plano + uso + catálogo.
    if (req.method === 'GET' && !seg) {
      const used = await db.countDevices(sess.tenant_id);
      const pan = await usoIA.panorama(db, tenant);
      return sendJson(res, 200, {
        mode: billing.mode(),
        plan: {
          id: curPlan.id, name: curPlan.name, telasMax: curPlan.telasMax,
          precoTelaCents: curPlan.precoTelaCents, sobConsulta: !!curPlan.sobConsulta,
        },
        status: (tenant && tenant.plan_status) || (curPlan.precoTelaCents ? 'active' : 'free'),
        renewsAt: tenant && tenant.plan_renews_at,
        /*
         * O teste, para o painel poder avisar ANTES de acabar.
         *
         * Descobrir que o prazo venceu na hora de ligar a TV é a pior forma de
         * saber: a pessoa já está de pé na recepção, com o controle na mão.
         */
        teste: plans.isPaid(curPlan.id) ? null : {
          dias: plans.DIAS_DE_TESTE,
          restam: plans.diasDeTesteRestantes(tenant),
          ativo: plans.testeAtivo(tenant),
          terminaEm: plans.fimDoTeste(tenant),
        },
        usage: {
          screens: used, limit: curPlan.telasMax,
          mensalidadeCents: plans.mensalidadeCents(curPlan.id, Math.max(1, used)),
          precoTelaCents: plans.precoTelaCents(curPlan.id, Math.max(1, used)),
          proximaTelaCents: plans.precoProximaTelaCents(curPlan.id, used),
          descontoVolume: plans.descontoVolume(Math.max(1, used)),
          cotaBytes: plans.cotaBytes(curPlan.id, Math.max(1, used)),
        },
        creditos: pan,
        faixas: plans.FAIXAS.map((f) => ({ ate: f.ate === Infinity ? null : f.ate, desconto: f.desconto })),
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
      /*
       * Pode ligar mais uma tela? (só na 1ª reivindicação)
       *
       * A decisão inteira mora em plans.podeParear — inclusive o teste de 14
       * dias. Aqui só se traduz o motivo em mensagem, e cada motivo tem a sua:
       * "limite atingido" para quem esbarrou na cota, "teste terminou" para
       * quem passou do prazo. Uma mensagem só para os dois casos manda a
       * pessoa para o lugar errado — e ela desiste em vez de assinar.
       */
      if (!d.tenant_id) {
        const tenant = await db.getTenant(sess.tenant_id);
        const used = await db.countDevices(sess.tenant_id);
        const veredito = plans.podeParear(tenant, used);
        if (!veredito.ok && veredito.motivo === 'teste_vencido') {
          return sendJson(res, 402, {
            error: 'Seu teste de ' + veredito.dias + ' dias terminou. Escolha um plano para ligar sua tela.',
            code: 'trial_over',
          });
        }
        if (!veredito.ok) {
          const limite = veredito.limite;
          return sendJson(res, 402, {
            error: 'limite do plano atingido (' + limite + (limite === 1 ? ' tela' : ' telas') + '). Faça upgrade para adicionar mais.',
            code: 'plan_limit',
          });
        }
      }
      await db.claimDevice(d.id, sess.tenant_id, b.name || d.name || 'TV');
        await db.registrarEvento(sess.tenant_id, sess.user_id, 'tela.parear');
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
    /*
     * Device token: SÓ pelo cabeçalho (x-device-token).
     *
     * Aceitava `?dt=` também, porque o EventSource do SSE é a única API do
     * navegador que não deixa mandar cabeçalho. Mas o token da TV não expira, e
     * endereço vai parar em log de acesso, log de proxy, painel do provedor e
     * histórico de console — lugares onde ninguém pensa que há segredo. Quem
     * lesse qualquer um deles lia a config da tela e recebia os eventos dela
     * para sempre.
     *
     * O SSE passou a usar um PASSE curto (ver server/passes.js): a TV troca o
     * token por ele num POST comum, e o que vai na URL vale um minuto e uma vez
     * só. Comparação em tempo constante, como antes.
     */
    const provided = req.headers['x-device-token'];
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
        if (!b || typeof b !== 'object' || Array.isArray(b)) {
          return sendJson(res, 400, { error: 'config inválida' });
        }
        /*
         * Normaliza ANTES de gravar. Antes daqui a config ia crua para o banco
         * e crua para a TV: painel e player concordavam por convenção, e todo
         * campo novo dependia de os dois lados terem sido editados juntos.
         *
         * O mesmo arquivo (js/storage.js) define o formato nas duas pontas.
         */
        let cfg;
        try { cfg = schema.normalize(b); }
        catch (e) { return sendJson(res, 400, { error: 'config inválida: ' + e.message }); }
        const name = (cfg.settings && cfg.settings.nome) || device.name;
        cfg.settings.nome = name;
        const updatedAt = Date.now();
        await db.setDeviceConfig(id, JSON.stringify(cfg), name);
        broadcast(id, 'config', { updatedAt });
        return sendJson(res, 200, { ok: true, updatedAt });
      });
    }
    /*
     * Reconectar: esta tela do painel passa a ser AQUELA TV ali.
     *
     * O problema que isto resolve: a identidade da TV vive no navegador dela.
     * Quando o navegador da Samsung limpa o armazenamento — o que ele faz ao
     * fechar —, a TV volta sem identidade e cria uma tela NOVA, com código
     * novo. A tela antiga fica no painel para sempre: offline, sem receber
     * publicação, e ocupando uma vaga do plano. Não havia caminho nenhum para
     * dizer "esta TV é a minha tela da Recepção".
     *
     * A tela NOVA absorve o nome e a config da antiga, e a antiga é apagada.
     * Poderia ser ao contrário — a antiga adotar as credenciais da nova —, mas
     * aí a TV ficaria com um id que não existe mais e precisaria ser avisada,
     * o que só funciona se ela estiver com o SSE de pé bem naquele instante.
     * Deste lado, a TV não precisa saber de nada: ela já é quem ficou.
     *
     * O que o cliente chama de "minha tela" é o nome e o conteúdo, e os dois
     * seguem intactos. O id interno muda, e nada fora da própria tela o
     * referencia (o mural é por mural_id).
     */
    if (req.method === 'POST' && sub === 'reconectar') {
      if (!owns) return sendJson(res, 403, { error: 'sem permissão' });
      const rrl = rateLimit('pair:' + clientIp(req), 15, 10 * 60 * 1000);
      if (!rrl.ok) return sendJson(res, 429, { error: 'muitas tentativas' }, { 'Retry-After': String(rrl.retryAfter) });
      return readBody(req, res, async (b) => {
        const nova = await db.getDeviceByCode(b && b.code);
        const nao = reconectar.impedimento(device, nova, sess.tenant_id, Date.now(), PAIR_ONLINE_MS);
        if (nao) return sendJson(res, nao.status, { error: nao.error });

        /*
         * Sem cobrar vaga do plano: entra uma tela e sai outra, o saldo é
         * zero. Cobrar aqui puniria o cliente justamente pelo defeito que ele
         * está consertando.
         */
        const nome = device.name || 'TV';
        await db.claimDevice(nova.id, sess.tenant_id, nome);
        if (device.config) await db.setDeviceConfig(nova.id, device.config, nome);
        await db.removeDevice(id);
        broadcast(nova.id, 'config', { updatedAt: Date.now() });
        return sendJson(res, 200, { id: nova.id, name: nome, herdouConfig: !!device.config });
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
    // Aniversariantes do tenant desta tela (player lê com device token).
    if (req.method === 'GET' && sub === 'birthdays') {
      if (!dtOk && !owns) return sendJson(res, 403, { error: 'sem permissão' });
      if (!device.tenant_id) return sendJson(res, 200, { birthdays: [] });
      const b = await db.listBirthdays(device.tenant_id);
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      return res.end(JSON.stringify({ birthdays: b }));
    }
    // Metadados (dono ou device)
    if (req.method === 'GET' && !sub) {
      if (!dtOk && !owns) return sendJson(res, 403, { error: 'sem permissão' });
      return sendJson(res, 200, pubDevice(device));
    }
    /*
     * Som ao vivo. O painel manda o comando, o servidor empurra por SSE e a TV
     * obedece na hora — sem salvar config e sem recarregar a tela.
     *
     * Fica FORA da config de propósito: abaixar o volume no meio de um evento é
     * uma ação, não uma configuração. Passar por salvar significaria reconstruir
     * o palco e cortar a música exatamente quando alguém está tentando ajustá-la.
     */
    if (req.method === 'POST' && sub === 'audio') {
      if (!owns) return sendJson(res, 403, { error: 'sem permissão' });
      return readBody(req, res, async (b) => {
        const acao = String((b && b.acao) || '');
        if (!['tocar', 'pausar', 'proxima', 'anterior', 'volume'].includes(acao)) {
          return sendJson(res, 400, { error: 'ação desconhecida' });
        }
        broadcast(id, 'som', { acao, valor: b && b.valor });
        return sendJson(res, 200, { ok: true, enviado: !!subscribers[id] });
      });
    }
    /*
     * A TV conta o que está tocando. Guardado só em memória: é estado do
     * instante, não dado — depois de um restart do servidor ele volta sozinho
     * no próximo aviso da TV, e um banco a mais não compraria nada.
     */
    if (req.method === 'POST' && sub === 'audio-estado') {
      if (!dtOk) return sendJson(res, 403, { error: 'device token inválido' });
      return readBody(req, res, async (b) => {
        estadoSom[id] = { em: Date.now(), estado: b || {} };
        return sendJson(res, 200, { ok: true });
      });
    }
    if (req.method === 'GET' && sub === 'audio') {
      if (!owns) return sendJson(res, 403, { error: 'sem permissão' });
      const s = estadoSom[id];
      // Sem notícia há mais de 2 minutos é notícia velha: melhor dizer que não
      // sabemos do que mostrar no painel uma faixa que já acabou faz tempo.
      const fresco = s && (Date.now() - s.em) < 120000;
      return sendJson(res, 200, {
        conhecido: !!fresco,
        online: !!subscribers[id],
        estado: fresco ? s.estado : null,
      });
    }
    // Heartbeat: a TV avisa que está viva (device token). Alimenta o status
    // real da frota (online/offline) no painel.
    if (req.method === 'POST' && sub === 'heartbeat') {
      if (!dtOk) return sendJson(res, 403, { error: 'device token inválido' });
      await db.touchDevice(id);
      /*
       * Devolve QUANDO a config mudou pela última vez.
       *
       * A TV recebia config só por SSE, e um stream morto é silencioso: o
       * EventSource desiste de vez quando o servidor responde não-2xx (um
       * deploy no meio da conexão basta). O heartbeat continuava, então o
       * painel mostrava a tela como online enquanto ela exibia a config velha
       * para sempre. Nenhuma das duas pontas mentia sozinha; juntas, mentiam.
       *
       * Com isto, a tela compara e busca de novo quando divergir — a rede de
       * segurança que um canal só não tem, sem custo de requisição extra.
       */
      return sendJson(res, 200, { ok: true, at: Date.now(), configEm: device.updated_at || 0 });
    }
    /*
     * A troca: token de verdade (no cabeçalho) por um passe curto.
     *
     * É um POST justamente para o segredo ir no corpo/cabeçalho e não na URL —
     * que é o problema que este passe existe para resolver.
     */
    if (req.method === 'POST' && sub === 'passe') {
      if (!dtOk) return sendJson(res, 403, { error: 'device token inválido' });
      const p = passes.emitir(id);
      if (!p) return sendJson(res, 503, { error: 'muitos passes em uso — tente em instantes' });
      return sendJson(res, 200, p);
    }

    // SSE (o player assina com um passe curto; ver server/passes.js)
    if (req.method === 'GET' && sub === 'events') {
      // O cabeçalho continua valendo para quem CONSEGUE mandar cabeçalho —
      // um cliente próprio, um teste. O passe é para o EventSource, que não.
      if (!dtOk && !passes.gastar(query.passe, id)) {
        return sendJson(res, 403, { error: 'passe inválido ou vencido' });
      }
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
      if (!storage.extFor(mime)) return sendJson(res, 415, { error: 'tipo não suportado (imagem PNG/JPG/WEBP/GIF, vídeo MP4/WEBM, áudio MP3/M4A/OGG/WAV ou apresentação PPTX/PDF)' });
      const used = await db.sumMediaBytes(sess.tenant_id);
      /*
       * A cota segue o plano, e é POR CONTA somando as telas: cinco telas no
       * Pro dão 50 GB no total. Antes eram 5 GB fixos para qualquer conta,
       * inclusive a grátis — mais do que muitos clientes pagantes usam.
       */
      const telasCota = await db.countDevices(sess.tenant_id);
      const tenantCota = await db.getTenant(sess.tenant_id);
      const cota = plans.cotaBytes(tenantCota && tenantCota.plan, Math.max(1, telasCota));
      if (used >= cota) return sendJson(res, 413, { error: 'cota de armazenamento cheia' });
      try {
        const name = String(query.name || 'arquivo').slice(0, 180);
        const saved = await midia.guardarStream(db, sess.tenant_id, req, { mime }, { nome: name, origem: 'upload' });
        return sendJson(res, 201, { id: saved.id, name, mime: saved.mime, size: saved.size, url: saved.url });
      } catch (e) {
        return sendJson(res, e.status || 500, { error: e.message || 'falha no upload' });
      }
    }
    // Listar + uso
    if (req.method === 'GET' && parts.length === 2) {
      const items = await db.listMedia(sess.tenant_id);
      const used = await db.sumMediaBytes(sess.tenant_id);
      const telasQ = await db.countDevices(sess.tenant_id);
      const tenantQ = await db.getTenant(sess.tenant_id);
      return sendJson(res, 200, {
        items,
        usage: { used, quota: plans.cotaBytes(tenantQ && tenantQ.plan, Math.max(1, telasQ)) },
      });
    }
    // Remover
    if (req.method === 'DELETE' && parts[2]) {
      const ok = await midia.apagar(db, sess.tenant_id, parts[2]);
      if (!ok) return sendJson(res, 404, { error: 'mídia não encontrada' });
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
  // O storage decide de onde vem (disco ou bucket S3) — aqui só entregamos.
  storage.serve(res, key).catch(() => {
    if (res.headersSent) return res.end();
    res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Falha ao servir a mídia');
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
  if (filePath !== APP_DIR && !filePath.startsWith(APP_DIR + path.sep)) { res.writeHead(403); return res.end('Acesso negado'); }
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
  /*
   * Cache longo para o que não muda de conteúdo sem mudar de nome: assets do
   * Vite (hash no nome) e os arquivos de fonte. A fonte é o caso que mais
   * importa numa TV — sem isto, cada recarga do player rebaixa 1,5 MB de
   * woff2 numa rede que já é o gargalo.
   */
  const hashed = /\/assets\//.test(filePath) || /\/fonts\/arquivos\//.test(filePath);
  const revalidate = !hashed && (ext === '.html' || ext === '.js' || ext === '.css' || ext === '.json');
  // player.html e sw.js nunca do cache: é por aí que a TV "voltava" antiga.
  const noStore = /player\.html$|sw\.js$/.test(filePath);
  res.writeHead(200, {
    'Content-Type': MIME[ext] || 'application/octet-stream',
    'Cache-Control': noStore ? 'no-store' : hashed ? 'public, max-age=31536000, immutable' : (revalidate ? 'no-cache' : 'public, max-age=3600'),
  });
  res.end(data);
}
// Página inicial: dois caminhos claros — administrar (celular/PC) ou virar TV.
// Pensada para toque em TV: botões grandes, alto contraste, self-contained.
const HOME_HTML = `<!DOCTYPE html>
<html lang="pt-BR"><head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>MultiTelas</title>
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Crect width='24' height='24' rx='5' fill='%232F6FEB'/%3E%3Cg fill='%23fff'%3E%3Crect x='4' y='4' width='9' height='7' rx='1'/%3E%3Crect x='15' y='4' width='5' height='7' rx='1'/%3E%3Crect x='4' y='13' width='16' height='7' rx='1'/%3E%3C/g%3E%3C/svg%3E" />
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3.2vh;
    font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#eef2ff;text-align:center;padding:5vw;
    background:radial-gradient(120% 120% at 15% 0%,#1c2c56 0%,transparent 55%),radial-gradient(120% 120% at 100% 100%,#132447 0%,transparent 52%),#0a1020}
  .brand{display:flex;align-items:center;gap:.6em;font-weight:800;font-size:clamp(28px,5vw,54px);letter-spacing:-.02em}
  .brand svg{width:1.1em;height:1.1em}
  .sub{color:#93a3c9;font-size:clamp(15px,2.2vw,22px);max-width:36ch;line-height:1.5}
  .cards{display:flex;flex-wrap:wrap;gap:2.4vh;justify-content:center;width:100%;max-width:900px;margin-top:1vh}
  a.card{flex:1 1 320px;min-height:34vh;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1.2rem;
    text-decoration:none;color:inherit;padding:5vh 4vw;border-radius:24px;border:1px solid rgba(255,255,255,.10);
    background:linear-gradient(160deg,rgba(255,255,255,.07),rgba(255,255,255,.02));backdrop-filter:blur(12px);
    transition:transform .25s cubic-bezier(.22,.61,.36,1),border-color .25s,background .25s}
  a.card:hover,a.card:focus{transform:translateY(-6px);border-color:rgba(120,160,255,.5);background:linear-gradient(160deg,rgba(90,130,255,.16),rgba(255,255,255,.03));outline:none}
  a.card .ico{font-size:clamp(44px,8vw,72px);line-height:1}
  a.card .t{font-size:clamp(22px,3.4vw,34px);font-weight:750;letter-spacing:-.01em}
  a.card .d{color:#93a3c9;font-size:clamp(14px,2vw,18px);max-width:26ch;line-height:1.45}
  a.tv{border-color:rgba(90,130,255,.35);background:linear-gradient(160deg,rgba(47,111,235,.22),rgba(255,255,255,.02))}
  .foot{color:#5f6f92;font-size:13px;margin-top:1vh}
</style></head>
<body>
  <div class="brand">
    <svg viewBox="0 0 24 24"><rect width="24" height="24" rx="5" fill="#2F6FEB"/><g fill="#fff"><rect x="4" y="4" width="9" height="7" rx="1"/><rect x="15" y="4" width="5" height="7" rx="1"/><rect x="4" y="13" width="16" height="7" rx="1"/></g></svg>
    MultiTelas
  </div>
  <div class="sub">Mídia indoor para TVs. Escolha como quer entrar neste dispositivo.</div>
  <div class="cards">
    <a class="card" href="/app">
      <div class="ico">🛠️</div>
      <div class="t">Administração</div>
      <div class="d">Criar conteúdo, controlar as telas e a equipe. Use no celular ou PC.</div>
    </a>
    <a class="card tv" href="/tv">
      <div class="ico">📺</div>
      <div class="t">Player (TV)</div>
      <div class="d">Transformar este aparelho em uma tela. Mostra um código para parear.</div>
    </a>
    <a class="card tv" href="/tv?new=1">
      <div class="ico">➕</div>
      <div class="t">Player — tela nova</div>
      <div class="d">Ignora a TV já salva neste navegador e gera um código novo.</div>
    </a>
  </div>
  <div class="foot">Dica: na TV, abra este site e toque em <strong>Player (TV)</strong>. Use <strong>tela nova</strong> se aparecer a TV antiga.</div>
</body></html>`;

const LANDING_DIR = path.join(ROOT, 'landing');

async function handleStatic(req, res, urlPath) {
  /*
   * A raiz agora é a landing. Quem chega sem conhecer o produto precisa
   * entender o que ele faz; quem já é cliente vai direto para /app, e a TV
   * vai para /tv — os dois caminhos que a página antiga oferecia continuam
   * existindo, agora como links dentro dela.
   */
  if (urlPath === '/' || urlPath === '/index.html') {
    return fs.readFile(path.join(LANDING_DIR, 'index.html'), (err, data) => {
      if (err) {
        // Sem a landing montada, a casa não cai: volta a página simples.
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' });
        return res.end(HOME_HTML);
      }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' });
      res.end(data);
    });
  }
  /*
   * Bibliotecas, fontes e o roteiro da landing.
   *
   * `landing.js` está num arquivo, e não dentro da página, porque a CSP proíbe
   * script inline (`script-src 'self'`). Inline, o navegador simplesmente não
   * executava nada: a página abria estática, sem TV, sem galeria, sem preço —
   * e sem erro visível para quem não abrisse o console.
   */
  if (urlPath === '/landing.js') {
    return fs.readFile(path.join(LANDING_DIR, 'landing.js'), (err, data) => {
      if (err) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('não encontrado'); }
      sendFile(res, path.join(LANDING_DIR, 'landing.js'), data);
    });
  }
  if (urlPath.startsWith('/vendor/')) {
    const alvo = path.normalize(path.join(LANDING_DIR, urlPath));
    // `+ path.sep` não é preciosismo: sem ele um diretório irmão de mesmo
    // prefixo (`landing-old`) satisfaz o `startsWith` e vaza.
    if (alvo !== LANDING_DIR && !alvo.startsWith(LANDING_DIR + path.sep)) { res.writeHead(403); return res.end('Acesso negado'); }
    return fs.readFile(alvo, (err, data) => {
      if (err) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('não encontrado'); }
      sendFile(res, alvo, data);
    });
  }
  // A antiga página de entrada continua alcançável, para quem tem o link.
  if (urlPath === '/entrar' || urlPath === '/entrar/') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' });
    return res.end(HOME_HTML);
  }
  // Atalho da TV: abre o player já em modo nuvem (sem digitar ?cloud=1).
  if (urlPath === '/tv' || urlPath === '/tv/') {
    // ?new=1 passa adiante: o player esquece a TV salva e gera outra.
    const fresh = /[?&]new=1(&|$)/.test(req.url || '');
    res.writeHead(302, { Location: '/player.html?cloud=1' + (fresh ? '&new=1' : ''), 'Cache-Control': 'no-store' });
    return res.end();
  }
  // Termos e Privacidade: HTML puro, sem depender do painel React — precisam
  // abrir para quem ainda não tem conta, inclusive a partir da tela de cadastro.
  if (urlPath === '/termos' || urlPath === '/termos/') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=3600' });
    return res.end(legal.termosHtml());
  }
  if (urlPath === '/privacidade' || urlPath === '/privacidade/') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=3600' });
    return res.end(legal.privacidadeHtml());
  }
  /*
   * Mural: a página que abre ao ler o QR. Endereço curto porque às vezes ele é
   * digitado à mão, olhando um cartaz do outro lado da sala.
   *
   * Sem sessão e sem React: é uma página de trinta segundos, aberta no 4G de um
   * evento lotado. Mural inexistente ou fechado responde com página honesta em
   * vez de um formulário que não vai funcionar.
   */
  const rotaMural = urlPath.match(/^\/m\/([A-Za-z0-9]{4,12})\/?$/);
  if (rotaMural) {
    const mural = await db.muralPorCodigo(rotaMural[1].toUpperCase()).catch(() => null);
    const html = !mural
      ? muralLib.paginaFechada('Mural não encontrado', 'Confira o código do cartaz — ele pode ter mudado.')
      : !mural.aceitando
        ? muralLib.paginaFechada(mural.titulo, 'Este mural está fechado no momento. Obrigado por participar!')
        : muralLib.pagina(mural, { empresa: (await db.getTenant(mural.tenantId).catch(() => null) || {}).name || '' });
    res.writeHead(mural ? 200 : 404, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    return res.end(html);
  }

  if (urlPath === '/legacy' || urlPath === '/legacy/') urlPath = '/index.html';
  return servirPublico(res, urlPath);
}

/*
 * ---------------- O que é público, e SÓ o que é público ----------------
 *
 * Isto já foi o oposto: uma única linha servia qualquer arquivo abaixo da
 * raiz do projeto, com a checagem `filePath.startsWith(ROOT)` como única
 * barreira. Essa checagem impede SAIR da raiz com `..` — e não impede pedir
 * um caminho perfeitamente legítimo lá dentro.
 *
 * O estrago era total, e não teórico. Reproduzido numa instância local, sem
 * cookie nenhum:
 *
 *     GET /data/multitelas.db   → 200, o banco inteiro
 *     GET /.git/config          → 200
 *     GET /server/auth.js       → 200
 *
 * O banco guarda o token de sessão em texto puro, então baixá-lo e mandar um
 * token como cookie era login imediato como qualquer usuário, de qualquer
 * inquilino. Junto vinham hashes de senha, dados de cobrança, aniversariantes
 * e os IPs de quem enviou foto no mural.
 *
 * A inversão é a correção: em vez de "tudo, menos o que eu lembrar de
 * proibir", passa a ser "nada, exceto o que está listado aqui". Uma pasta
 * nova com segredo dentro nasce inacessível — que é o padrão certo, porque
 * quem cria a pasta não vai lembrar de vir aqui negá-la.
 */
const PASTAS_PUBLICAS = ['/css/', '/js/', '/icons/', '/img/', '/fonts/'];
const ARQUIVOS_PUBLICOS = new Set([
  '/index.html', '/player.html', '/admin.html',
  '/sw.js', '/player.webmanifest', '/manifest.webmanifest',
  '/favicon.ico', '/robots.txt',
]);

function ehPublico(urlPath) {
  if (ARQUIVOS_PUBLICOS.has(urlPath)) return true;
  return PASTAS_PUBLICAS.some((p) => urlPath.startsWith(p));
}

function servirPublico(res, urlPath) {
  if (!ehPublico(urlPath)) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end('Não encontrado: ' + urlPath);
  }
  const filePath = path.normalize(path.join(ROOT, urlPath));
  // Cinto além da lista: `..` dentro de um prefixo permitido não sai da raiz.
  // `path.sep` no fim importa — sem ele, um diretório irmão de mesmo prefixo
  // (`/home/u/Multi-telasX`) satisfaz o `startsWith` e escapa.
  if (filePath !== ROOT && !filePath.startsWith(ROOT + path.sep)) {
    res.writeHead(403); return res.end('Acesso negado');
  }
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('Não encontrado: ' + urlPath); }
    sendFile(res, filePath, data);
  });
}

const server = http.createServer((req, res) => {
  const parsed = url.parse(req.url || '/', true);
  const pathname = decodeURIComponent(parsed.pathname || '/');
  /*
   * Os cabeçalhos de segurança entram AQUI, uma vez, antes de qualquer rota.
   * O Node junta o que foi posto com setHeader ao que cada rota passa depois
   * em writeHead, então nenhuma delas precisa saber que isto existe — e
   * nenhuma delas pode esquecer.
   */
  const seg = security.cabecalhosSeguranca(security.isSecureRequest(req));
  for (const k in seg) res.setHeader(k, seg[k]);
  if (pathname === '/api' || pathname.startsWith('/api/')) {
    return handleApi(req, res, pathname, parsed.query || {})
      .catch((e) => {
        erros.registrar(e, { rota: pathname, metodo: req.method });
        try { sendJson(res, 500, { error: 'erro interno' }); } catch (_) {}
      });
  }
  if (pathname === '/app' || pathname.startsWith('/app/')) {
    return handleApp(req, res, pathname);
  }
  if (pathname.startsWith('/media/')) {
    return handleMedia(req, res, pathname);
  }
  return handleStatic(req, res, pathname)
    .catch((e) => {
      erros.registrar(e, { rota: pathname, metodo: req.method, onde: 'arquivo estático' });
      try { res.writeHead(500); res.end('erro interno'); } catch (_) {}
    });
});

/*
 * A rede de segurança entra ANTES de o servidor aceitar a primeira conexão.
 *
 * Uma promessa rejeitada sem `catch` derruba o processo no Node 22. O Railway
 * reinicia e a TV volta em segundos, mas o motivo morria junto com o processo
 * — e defeito que ninguém vê ninguém conserta. Agora fica registrado antes.
 */
erros.instalarRedeDeSeguranca();

db.init()
  .then(() => server.listen(PORT, () => {
    const s3 = storage.s3Info();
    log.info('servidor.no-ar', {
      porta: PORT,
      storage: storage.DRIVER,
      bucket: s3 ? s3.bucket : undefined,
      regiao: s3 ? s3.region : undefined,
    });
    // Disco efêmero é falha silenciosa: funciona hoje, apaga a mídia no
    // próximo deploy. Melhor avisar alto do que descobrir com o cliente.
    const aviso = storage.ephemeralWarning();
    if (aviso) log.aviso('storage.disco-efemero', { aviso });

    if (!operadores.configurado()) {
      // Dito alto de propósito: sem ADMIN_EMAILS o painel da plataforma
      // simplesmente não existe, e é melhor descobrir isso agora do que
      // procurando um menu que nunca vai aparecer.
      log.aviso('plataforma.sem-admin-emails', {
        aviso: 'ADMIN_EMAILS não definido — o painel da plataforma fica desligado.',
      });
    }

    /*
     * Eventos velhos saem sozinhos.
     *
     * Noventa dias respondem tudo que o painel pergunta, e guardar mais seria
     * acumular rastro de uso de gente que não ganha nada com isso. A limpeza
     * roda uma vez ao subir e a cada seis horas — não precisa de precisão,
     * precisa de acontecer.
     */
    const NOVENTA_DIAS = 90 * 24 * 60 * 60 * 1000;
    const varrer = () => db.limparEventos(Date.now() - NOVENTA_DIAS)
      .catch((e) => erros.registrar(e, { onde: 'limpeza de eventos' }));
    varrer();
    const relogio = setInterval(varrer, 6 * 60 * 60 * 1000);
    if (relogio.unref) relogio.unref();
  }))
  .catch((e) => { log.erro('db.init-falhou', e); process.exit(1); });
