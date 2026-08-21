
module.exports = function(ctx) {
  const { 
    db, auth, storage, midia, reconectar, usoIA, creditos, security, log, erros, diagnostico, mail, plans, billing, ai, director, site, operadores, cortesia, limites, passes, metricas, ds, jobs, legal, seasons, schema, briefing, memory, muralLib, qrcode,
    baseUrl, sendJson, readBody, emTrabalho, validEmail, reqOrigin, readRawBody, brl, googleEnabled, canManageTeam, normBirthday, lerImagens, avisarTelas, clientIp, rateLimit, crypto
  } = ctx;
  
  return async function(req, res, parts, query, sess) {
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
    return true;
  };
};
