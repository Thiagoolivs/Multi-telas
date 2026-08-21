const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, '../server/routes/auth.js');
let code = fs.readFileSync(file, 'utf8');

const findCode = `            const payload = {
              email, passHash, name: b.name, inviteData,
              ip: clientIp(req)
            };

            await db.createVerification(token, payload, expiresAt);`;

const replaceCode = `            const payload = {
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

            await db.createVerification(token, payload, expiresAt);`;

code = code.replace(findCode, replaceCode);
fs.writeFileSync(file, code);
console.log('auth.js now respects SKIP_VERIFY');
