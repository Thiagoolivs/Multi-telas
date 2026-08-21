const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, '../server/routes/auth.js');
let code = fs.readFileSync(file, 'utf8');

// Match everything from passHash = ... down to the end of the signup block
const regex = /const passHash = auth\.hashPassword\(b\.password\);[\s\S]*?return sendJson\(res, 201, \{ user: \{ email, role: 'owner' \}, tenant: \{ id: tenantId, name: b\.name \|\| email \} \}\);\s*\n\s*\}\);\s*\n\s*\}/;

const replacement = `const passHash = auth.hashPassword(b.password);

            const token = crypto.randomBytes(24).toString('hex');
            const expiresAt = Date.now() + 24 * 60 * 60 * 1000;
            
            let inviteData = null;
            if (b.inviteCode) {
              const inv = await db.getInviteByCode(b.inviteCode);
              if (!inv || inv.accepted_at) return sendJson(res, 404, { error: 'convite inválido' });
              if (inv.expires_at && inv.expires_at < Date.now()) return sendJson(res, 410, { error: 'convite expirado' });
              if (email !== String(inv.email || '').trim().toLowerCase()) return sendJson(res, 403, { error: 'este convite é para outro e-mail' });
              inviteData = { role: inv.role, tenant_id: inv.tenant_id, id: inv.id };
            }

            const payload = {
              email, passHash, name: b.name, inviteData,
              ip: clientIp(req)
            };

            if (process.env.SKIP_VERIFY === '1') {
              let userId, tenantId;
              if (inviteData) {
                const resCreate = await db.createUser(inviteData.tenant_id, email, passHash, inviteData.role, b.name);
                userId = resCreate.userId;
                tenantId = inviteData.tenant_id;
                await db.acceptInvite(inviteData.id);
                await db.registrarAceite(tenantId, userId, email, legal.VERSAO, 'convite', clientIp(req));
              } else {
                const resCreate = await db.createAccount(email, passHash, b.name, b.name);
                userId = resCreate.userId;
                tenantId = resCreate.tenantId;
                await db.registrarAceite(tenantId, userId, email, legal.VERSAO, 'cadastro', clientIp(req));
              }
              await cortesia.sincronizar(db, tenantId, email);
              await auth.startSession(res, userId, tenantId, req);
              return sendJson(res, 201, { user: { email, role: inviteData ? inviteData.role : 'owner' }, tenant: { id: tenantId, name: b.name || email } });
            }

            await db.createVerification(token, payload, expiresAt);
            
            const link = baseUrl(req) + '/app/?verify=' + token;
            if (mail.configured()) {
              try {
                await mail.send({ to: email, ...mail.verifyEmail(link) });
              } catch (e) {
                erros.registrar(e, { onde: 'envio de verificacao' });
              }
            } else {
              mail.send({ to: email, ...mail.verifyEmail(link) }); // log in dev mode
            }
            
            return sendJson(res, 202, { ok: true, pendingVerification: true });
          });
        }
        
        if (req.method === 'POST' && action === 'verify') {
          const rl = rateLimit('verify:' + clientIp(req), 10, 60 * 60 * 1000);
          if (!rl.ok) return sendJson(res, 429, { error: 'muitas tentativas, tente mais tarde' }, { 'Retry-After': String(rl.retryAfter) });
          return readBody(req, res, async (b) => {
            const token = String((b && b.token) || '');
            if (!token) return sendJson(res, 400, { error: 'token ausente' });
            
            const v = await db.getVerification(token);
            if (!v) return sendJson(res, 404, { error: 'link inválido ou expirado' });
            
            const p = v.payload;
            if (await db.getUserByEmail(p.email)) {
              await db.consumeVerification(token);
              return sendJson(res, 409, { error: 'e-mail já cadastrado' });
            }
            
            let userId, tenantId;
            if (p.inviteData) {
              const resCreate = await db.createUser(p.inviteData.tenant_id, p.email, p.passHash, p.inviteData.role, p.name);
              userId = resCreate.userId;
              tenantId = p.inviteData.tenant_id;
              await db.acceptInvite(p.inviteData.id);
              await db.registrarAceite(tenantId, userId, p.email, legal.VERSAO, 'convite', p.ip);
            } else {
              const resCreate = await db.createAccount(p.email, p.passHash, p.name, p.name);
              userId = resCreate.userId;
              tenantId = resCreate.tenantId;
              await db.registrarAceite(tenantId, userId, p.email, legal.VERSAO, 'cadastro', p.ip);
            }
            
            await db.consumeVerification(token);
            await cortesia.sincronizar(db, tenantId, p.email);
            await auth.startSession(res, userId, tenantId, req);
            
            return sendJson(res, 201, { user: { email: p.email, role: p.inviteData ? p.inviteData.role : 'owner' }, tenant: { id: tenantId, name: p.name || p.email } });
          });
        }`;

if (regex.test(code)) {
  code = code.replace(regex, replacement);
  fs.writeFileSync(file, code);
  console.log('auth.js successfully patched');
} else {
  console.log('Regex did not match!');
}
