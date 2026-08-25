
module.exports = function(ctx) {
  const { 
    db, auth, storage, midia, reconectar, usoIA, creditos, security, log, erros, diagnostico, mail, plans, billing, ai, director, site, operadores, cortesia, limites, passes, metricas, ds, jobs, legal, seasons, schema, briefing, memory, muralLib, qrcode,
    baseUrl, sendJson, readBody, emTrabalho, validEmail, reqOrigin, readRawBody, brl, googleEnabled, canManageTeam, normBirthday, lerImagens, avisarTelas, clientIp, rateLimit, crypto
  } = ctx;
  
  const tratar = async function(req, res, parts, query, sess) {
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
            /*
             * "Confira seu e-mail" só pode ser dito se o e-mail SAIU.
             *
             * A falha de envio era registrada e engolida, e a resposta seguia
             * 202 do mesmo jeito: a pessoa ficava esperando um link que nunca
             * foi mandado, sem nada para tentar de novo e sem nada que indique
             * o que houve. Chave errada, domínio não verificado e provedor
             * fora do ar davam todos o mesmo silêncio.
             *
             * Agora a falha vira erro na tela. O cadastro não se perde: o
             * token continua válido pelas 24 horas e tentar de novo com o
             * mesmo e-mail manda outro.
             */
            if (mail.configured()) {
              try {
                await mail.send({ to: email, ...mail.verifyEmail(link) });
              } catch (e) {
                erros.registrar(e, { onde: 'envio de verificacao' });
                return sendJson(res, 502, {
                  error: 'não consegui enviar o e-mail de confirmação agora. Tente de novo em instantes.',
                });
              }
            } else {
              /*
               * Sem provedor configurado o link só vai para o LOG, e ninguém
               * consegue terminar o cadastro. Em desenvolvimento isso é o
               * esperado — é assim que se testa sem chave. Em produção é
               * cadastro quebrado, e o aviso de boot em server.js diz isso
               * alto antes de alguém descobrir pelo cliente.
               */
              mail.send({ to: email, ...mail.verifyEmail(link) });
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
            /*
             * A lista de cortesia é conferida no LOGIN, e não a cada requisição.
             *
             * É uma escrita no banco; reagir em um segundo em vez de no próximo
             * login não paga uma escrita por página carregada. Na prática,
             * acrescentar alguém à lista vale a partir do próximo login dessa
             * pessoa — que é quando ela vai olhar, porque foi quando você avisou.
             */
            await cortesia.sincronizar(db, u.tenant_id, u.email);
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
            // Entrar pelo Google é entrada de conta como qualquer outra: a lista
            // de cortesia vale aqui também, senão quem você convidou pelo Google
            // cairia no teste de 14 dias sem entender por quê.
            await cortesia.sincronizar(db, u.tenant_id, email);
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
  };

  /*
   * Devolve TRUE só quando este arquivo é o DONO do caminho.
   *
   * Estava devolvendo `true` sempre — inclusive para caminhos que não são de
   * auth. `handleApi` lê esse retorno como "já respondi e mandei a resposta",
   * então saía sem responder nada: toda requisição /api que não fosse
   * /api/auth/* era engolida em silêncio, sem corpo, sem erro e sem fechar o
   * socket. O cliente ficava pendurado até desistir sozinho. A API inteira —
   * telas, mídia, campanha, mural, billing — parava de pé.
   *
   * Por isso a decisão é tomada pelo PREFIXO, e não pelo que o corpo devolve:
   * lá dentro quase todo caminho termina em `return sendJson(...)`, e sendJson
   * não devolve nada. Qualquer booleano tirado dali seria sempre falso.
   */
  return async function(req, res, parts, query, sess) {
    if (parts[1] !== 'auth') return false;
    await tratar(req, res, parts, query, sess);
    return true;
  };
};
