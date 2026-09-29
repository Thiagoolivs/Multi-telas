/*
 * server/routes/telas.js — criar, parear e operar as telas (/api/pair e
 * /api/devices/...): config, reconectar, expediente, comandos, som,
 * heartbeat, passe e o tempo real (SSE).
 *
 * Saiu de server.js inteiro, sem mudar comportamento. Recebe tudo por `ctx`
 * (ver test/rotas-contrato.test.js).
 */
'use strict';

module.exports = function (ctx) {
  const {
    db, auth, storage, midia, reconectar, usoIA, creditos, security, log, erros, diagnostico, mail, plans, billing, ai, director, site, operadores, banco, cortesia, limites, passes, metricas, ds, jobs, legal, seasons, schema, briefing, memory, muralLib, qrcode, baseUrl, sendJson, readBody, emTrabalho, validEmail, reqOrigin, readRawBody, brl, googleEnabled, canManageTeam, normBirthday, lerImagens, avisarTelas, clientIp, rateLimit, crypto, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, isSecureRequest, cobranca, vigia, broadcast, subscribers, estadoSom, PAIR_ONLINE_MS, pairCode, pubDevice, safeEqual, sincronizarCobranca, seloDaConta, comandosPendentes, lerJsonCurto, infoDaTela,
  } = ctx;

  const NAO_TRATEI = Symbol('nao-tratei');

  async function tratar(req, res, parts, query, sess) {
    /* ----- Criar device (a TV chama, sem auth) ----- */
    if (req.method === 'POST' && parts[1] === 'devices' && parts.length === 2) {
      /*
       * A rota é pública (a TV ainda não tem dono), e não tinha limite: um laço
       * qualquer enchia a tabela. Sessenta por hora por IP cobre com folga a
       * matriz instalando uma frota inteira atrás do mesmo roteador.
       */
      const drl = rateLimit('device-novo:' + clientIp(req), 60, 60 * 60 * 1000);
      if (!drl.ok) return sendJson(res, 429, { error: 'muitas telas novas deste endereço — tente mais tarde' }, { 'Retry-After': String(drl.retryAfter) });
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
          if (!veredito.ok && veredito.motivo === 'atraso') {
            return sendJson(res, 402, {
              error: 'Há uma fatura em atraso há mais de ' + veredito.dias + ' dias. Suas telas continuam no ar; '
                + 'para ligar uma tela nova, regularize o pagamento em Plano.',
              code: 'pagamento_atrasado',
            });
          }
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
        // Tela nova na conta = mensalidade nova. Sem esperar o Asaas: o
        // pareamento já aconteceu, e a conciliação refaz se falhar agora.
        if (!d.tenant_id) sincronizarCobranca(sess.tenant_id);
        /*
         * A TV PRECISA SABER QUE FOI PAREADA. Não sabia.
         *
         * Parear não avisava ninguém, e o player só troca de estado quando chega
         * uma CONFIG. Quem acabou de parear ainda não publicou nada — então a
         * TV continuava mostrando o código de pareamento, com o painel dizendo
         * "Online · agora mesmo" na outra tela.
         *
         * O estrago é no primeiro minuto de uso, que é o pior lugar: a pessoa
         * conclui que não funcionou e pareia de novo, criando uma segunda tela.
         * No plano grátis, que é de uma tela só, a segunda esbarra no limite —
         * e agora ela tem um erro de cobrança num produto que ela ainda nem viu
         * funcionar.
         */
        broadcast(d.id, 'pareada', { nome: b.name || d.name || 'TV', em: Date.now() });
        return sendJson(res, 200, { id: d.id, name: b.name || d.name || 'TV' });
      });
    }

    /* ----- Listar meus devices (requer login) ----- */
    if (req.method === 'GET' && parts[1] === 'devices' && parts.length === 2) {
      if (!sess) return sendJson(res, 401, { error: 'não autenticado' });
      const rows = await db.listDevices(sess.tenant_id);
      const list = rows.map((d) => ({
        id: d.id, name: d.name, code: d.code, hasConfig: !!d.has_config, updatedAt: d.updated_at, lastSeen: d.last_seen,
        expediente: vigia.normalizarExpediente(d.expediente),
        info: (() => { try { return d.info ? JSON.parse(d.info) : null; } catch (_) { return null; } })(),
      }));
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

      /*
       * O tráfego do player é MEDIDO aqui, e nunca bloqueado.
       *
       * Não é sobre abuso: é sobre enxergar. Uma TV com defeito de rede pede
       * config quarenta vezes por minuto e ninguém fica sabendo — nem o cliente,
       * que só nota a tela piscando, nem quem opera, que só vê a fatura de banda
       * subir. Com a medição, essa tela aparece sozinha na supervisão antes de
       * alguém ligar reclamando.
       */
      if (dtOk) limites.permitir('tela', device.tenant_id);

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
      /*
       * Horário de funcionamento e alerta de queda, por tela. O corpo passa por
       * normalizarExpediente: lixo vira o padrão, nunca um alerta desligado
       * sem o dono ter pedido.
       */
      if (req.method === 'POST' && sub === 'expediente') {
        if (!owns) return sendJson(res, 403, { error: 'sem permissão' });
        return readBody(req, res, async (b) => {
          const exp = vigia.normalizarExpediente(b || {});
          await db.setExpediente(id, JSON.stringify(exp));
          return sendJson(res, 200, { ok: true, expediente: exp });
        });
      }
      /*
       * Comando remoto (dono): hoje, recarregar a TV. É o "desliga e liga" que
       * resolve metade dos chamados — sem ninguém ir até a TV. Vai pelo SSE e,
       * se o stream estiver caído, no próximo pulso (até 30s).
       */
      if (req.method === 'POST' && sub === 'comando') {
        if (!owns) return sendJson(res, 403, { error: 'sem permissão' });
        return readBody(req, res, async (b) => {
          const acao = String((b && b.acao) || '');
          if (acao !== 'recarregar') return sendJson(res, 400, { error: 'comando desconhecido' });
          const cmd = { id: db.rid(10), acao, em: Date.now() };
          comandosPendentes.set(id, cmd);
          broadcast(id, 'comando', cmd);
          await db.registrarEvento(sess.tenant_id, sess.user_id, 'tela.recarregar');
          return sendJson(res, 200, { ok: true, aoVivo: !!subscribers[id] });
        });
      }
      if (req.method === 'POST' && sub === 'rename') {
        if (!owns) return sendJson(res, 403, { error: 'sem permissão' });
        return readBody(req, res, async (b) => { await db.renameDevice(id, (b && b.name) || device.name); return sendJson(res, 200, { ok: true }); });
      }
      if (req.method === 'DELETE' && !sub) {
        if (!owns) return sendJson(res, 403, { error: 'sem permissão' });
        await db.removeDevice(id);
        sincronizarCobranca(sess.tenant_id);
        return sendJson(res, 200, { ok: true });
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
        /*
         * A TV conta de si (navegador, resolução, versão do player) — é a
         * primeira pergunta de todo suporte, e ninguém sabe responder de pé na
         * frente da TV. Curto e sem nada pessoal; só grava se veio algo.
         */
        const b = await lerJsonCurto(req, 2048);
        const info = infoDaTela(b);
        await db.touchDevice(id, info ? JSON.stringify(info) : null);
        const comando = comandosPendentes.get(id);
        if (comando) comandosPendentes.delete(id);
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
        return sendJson(res, 200, {
          ok: true, at: Date.now(), configEm: device.updated_at || 0, selo: await seloDaConta(device.tenant_id),
          // Comando que o SSE pode não ter entregue (stream caído): vai no pulso.
          comando: comando || undefined,
        });
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
        /*
         * Uma vaga por conexão, e há teto.
         *
         * `subscribers[id]` era um Set sem limite nenhum: quem tivesse um token
         * de tela válido — o próprio dono, um script dele, ou uma TV com defeito
         * que reabre sem fechar a anterior — empilhava sockets até o servidor
         * ficar sem. Não precisa de má intenção: um player em laço de reconexão
         * faz isso sozinho em minutos, e leva junto o SSE de TODAS as contas.
         *
         * 503, e não 403: não é permissão, é lotação. E o Retry-After diz que
         * vale a pena tentar de novo, que é verdade — a vaga volta quando a
         * conexão velha fecha.
         */
        const telasDaConta = await db.countDevices(device.tenant_id);
        const vaga = limites.abrirConexao(id, device.tenant_id, telasDaConta);
        if (!vaga.ok) {
          return sendJson(res, 503, {
            error: vaga.motivo === 'servidor'
              ? 'servidor no limite de conexões — tente em instantes'
              : 'esta tela já tem conexões demais abertas',
          }, { 'Retry-After': '15' });
        }

        res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' });
        res.write('event: ready\ndata: {}\n\n');
        if (!subscribers[id]) subscribers[id] = new Set();
        subscribers[id].add(res);
        const ping = setInterval(() => { try { res.write(': ping\n\n'); } catch (e) {} }, 25000);
        /*
         * `close` dispara também quando o cliente some sem avisar — é o único
         * lugar em que dá para confiar para devolver a vaga. Sem devolver, o teto
         * viraria uma contagem que só sobe, e em algumas horas nenhuma TV
         * conseguiria mais conectar.
         */
        let fechou = false;
        req.on('close', () => {
          if (fechou) return;
          fechou = true;
          clearInterval(ping);
          subscribers[id] && subscribers[id].delete(res);
          limites.fecharConexao(id, device.tenant_id);
        });
        return;
      }
    }

    return NAO_TRATEI;
  }

  return async function (req, res, parts, query, sess) {
    if (parts[1] !== 'devices' && parts[1] !== 'pair') return false;
    const r = await tratar(req, res, parts, query, sess);
    // `tratar` devolve undefined quando nenhum caminho casou (rota de telas
    // desconhecida): aí quem chamou continua procurando, como antes.
    return r !== NAO_TRATEI;
  };
};
