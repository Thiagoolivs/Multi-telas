/*
 * server/routes/billing.js — planos, assinatura, pacotes de crédito e o
 * webhook do Asaas.
 *
 * Saiu de server.js inteiro, sem mudar comportamento. Recebe tudo por `ctx`
 * (ver test/rotas-contrato.test.js); um nome esquecido aqui só explodiria na
 * primeira requisição, por isso o ESLint `no-undef` passa neste arquivo.
 */
'use strict';

module.exports = function (ctx) {
  const {
    db, auth, storage, midia, reconectar, usoIA, creditos, security, log, erros, diagnostico, mail, plans, billing, ai, director, site, operadores, banco, cortesia, limites, passes, metricas, ds, jobs, legal, seasons, schema, briefing, memory, muralLib, qrcode, baseUrl, sendJson, readBody, emTrabalho, validEmail, reqOrigin, readRawBody, brl, googleEnabled, canManageTeam, normBirthday, lerImagens, avisarTelas, clientIp, rateLimit, crypto, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, isSecureRequest, cobranca, vigia, broadcast, subscribers, estadoSom, PAIR_ONLINE_MS, pairCode, pubDevice, safeEqual, sincronizarCobranca, seloDaConta, comandosPendentes, lerJsonCurto, infoDaTela,
  } = ctx;

  // Aplica um evento do Asaas ao plano do tenant.
  async function handleAsaasEvent(body) {
    const eventName = body.event;
    if (!eventName) return;

    const payment = body.payment;
    const subscription = body.subscription;

    let customerId, subId, status, externalRef, nextDueDate;

    if (payment) {
      customerId = payment.customer;
      subId = payment.subscription;
      status = payment.status;
      externalRef = payment.externalReference;
      nextDueDate = payment.dueDate;
    } else if (subscription) {
      customerId = subscription.customer;
      subId = subscription.id;
      status = subscription.status;
      externalRef = subscription.externalReference;
      nextDueDate = subscription.nextDueDate;
    }
  
    if (!customerId) return;

    /*
     * Pacote de créditos: caminho próprio, ANTES da regra de plano. Um pacote
     * atrasado ou estornado não pode mexer na assinatura da conta.
     */
    const refPacote = cobranca.referenciaDePacote(externalRef);
    if (refPacote) {
      const acao = cobranca.efeitoDoPacote(eventName);
      const pac = creditos.pacote(refPacote.pacoteId);
      const contaDoPacote = await db.getTenant(refPacote.tenantId);
      if (!acao || !pac || !payment || !payment.id || !contaDoPacote) return;
      // O pagamento tem que ser do cliente desta conta no Asaas.
      if (contaDoPacote.stripe_customer_id && contaDoPacote.stripe_customer_id !== customerId) return;
      if (acao === 'creditar') {
        const novo = await db.creditarPacote(payment.id, contaDoPacote.id, pac.id, pac.creditos);
        if (novo) log.info('cobranca.pacote-creditado', { tenant: contaDoPacote.id, pacote: pac.id });
      } else {
        const tirados = await db.estornarPacote(payment.id);
        if (tirados) log.aviso('cobranca.pacote-estornado', { tenant: contaDoPacote.id, pacote: pac.id, creditos: tirados });
      }
      return;
    }

    let tenantId, planId;
    if (externalRef && externalRef.includes('|')) {
      const parts = externalRef.split('|');
      tenantId = parts[0];
      planId = parts[1];
    } else {
      tenantId = externalRef;
    }
  
    let tenant;
    if (tenantId) tenant = await db.getTenant(tenantId);
    if (!tenant) tenant = await db.getTenantByCustomer(customerId);
    if (!tenant) return;

    let renewsAt = undefined;
    if (nextDueDate) {
      const d = new Date(nextDueDate);
      if (!isNaN(d.getTime())) renewsAt = d.getTime();
    }

    /*
     * A regra de cada evento mora em server/cobranca.js (pura, testada). Aqui
     * só se resolve a conta e se grava o patch.
     */
    const pago = eventName === 'PAYMENT_RECEIVED' || eventName === 'PAYMENT_CONFIRMED';
    const outrasVencidas = pago && tenant.plan_status === 'past_due' ? await billing.faturasVencidas(subId) : 0;
    const patch = cobranca.efeitoDoEvento(eventName, { tenant, customerId, subId, planId, renewsAt, outrasVencidas });
    if (!patch) return;
    await db.setTenantBilling(tenant.id, patch);
    // Pagou: se pareou telas entre o checkout e o pagamento, a assinatura já
    // passa a cobrar por elas.
    if (patch.plan && plans.isPaid(patch.plan)) sincronizarCobranca(tenant.id);
    if (eventName === 'PAYMENT_REFUNDED' || eventName.startsWith('PAYMENT_CHARGEBACK')) {
      await db.registrarEvento(tenant.id, '', 'plano.' + (eventName === 'PAYMENT_REFUNDED' ? 'estorno' : 'chargeback')).catch(() => {});
      log.aviso('cobranca.dinheiro-voltou', { evento: eventName, tenant: tenant.id });
    }
  }


  // Página de checkout SIMULADO (modo dev, sem Stripe). Deixa claro que é teste.
  /*
   * O botão desta página não fazia nada, e por isso o caminho pago inteiro
   * nunca foi exercido.
   *
   * A CSP do projeto é `script-src 'self'`, sem `unsafe-inline` — de propósito.
   * Esta página, que é anterior a isso, traz o script no HTML e o handler num
   * `onclick`: o navegador recusa os dois. "Confirmar assinatura" ficava mudo,
   * e como este é o ÚNICO jeito de testar assinatura sem chave do Asaas, o
   * caminho pago deixou de ser percorrido por qualquer um. Foi assim que um
   * `db.getUser is not a function` — que derrubava todo upgrade com 502 — ficou
   * na main sem ninguém ver.
   *
   * Um nonce por resposta resolve sem afrouxar a política global: vale para
   * ESTE HTML e para mais nada.
   */
  function devCheckoutPage(p, nonce) {
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
    <p class="muted">${p.blurb || ''} Até ${p.telasMax} telas.</p>
    <div class="price">${brl(p.precoTelaCents)}<small> /mês</small></div>
    <button id="go">Confirmar assinatura</button>
    <a href="/app?billing=cancel">Cancelar</a>
  </div>
  <script nonce="${nonce}">
  async function pay(){
    var b=document.getElementById('go'); b.disabled=true; b.textContent='Processando…';
    try{
      var r=await fetch('/api/billing/dev-activate',{method:'POST',headers:{'Content-Type':'application/json'},credentials:'same-origin',body:JSON.stringify({plan:${JSON.stringify(p.id)}})});
      if(!r.ok) throw new Error('falha');
      location.href='/app?billing=success';
    }catch(e){ b.disabled=false; b.textContent='Tentar de novo'; }
  }
  document.getElementById('go').addEventListener('click', pay);
  </script>
  </body></html>`;
  }


  async function tratar(req, res, parts, query, sess) {
    if (parts[1] === 'billing') {
      const seg = parts[2];

      // Webhook do Stripe: corpo bruto + assinatura. Sem sessão (vem do Stripe).
      if (req.method === 'POST' && seg === 'webhook') {
        const raw = await readRawBody(req);
        let event;
        try { event = billing.verifyWebhook(raw, req.headers['asaas-access-token']); }
        catch (e) { return sendJson(res, 400, { error: 'webhook inválido: ' + e.message }); }
        await handleAsaasEvent(event);
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
          /*
           * Dito com todas as letras para o painel. Uma conta de cortesia tem
           * plano Pro de verdade, e sem esta bandeira a tela mostraria "Pro
           * ativo" — a pessoa acharia que está pagando e o botão de assinar
           * sumiria justamente de quem um dia precisa clicar nele.
           */
          cortesia: cortesia.contaEmCortesia(tenant),
          /*
           * Pagamento atrasado, com a data em que a carência acaba. O painel
           * avisa desde o primeiro dia: descobrir o corte na hora de gerar uma
           * imagem é a pior forma de saber.
           */
          atraso: plans.situacaoAtraso(tenant),
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
          pacotes: creditos.PACOTES,
          canManage: sess.role === 'owner',
        });
      }

      /*
       * Comprar um pacote de créditos (só dono). Cobrança avulsa no Asaas; o
       * crédito entra quando o webhook confirmar o pagamento, uma vez só.
       * Em modo simulado credita na hora, para o fluxo ser testável sem chave.
       */
      if (req.method === 'POST' && seg === 'pacote') {
        if (sess.role !== 'owner') return sendJson(res, 403, { error: 'só o dono compra créditos' });
        return readBody(req, res, async (b) => {
          const pac = creditos.pacote(b && b.pacote);
          if (!pac) return sendJson(res, 400, { error: 'pacote inválido' });
          try {
            const user = await db.getUserById(sess.user_id);
            const out = await billing.cobrarPacote(tenant, user, pac, reqOrigin(req),
              (customerId) => db.setTenantBilling(tenant.id, { customerId }));
            if (out.simulated) {
              await db.creditarPacote('sim_' + db.rid(14), tenant.id, pac.id, pac.creditos);
              return sendJson(res, 200, { simulado: true, creditado: pac.creditos });
            }
            await db.registrarEvento(sess.tenant_id, sess.user_id, 'creditos.pacote');
            return sendJson(res, 200, { url: out.url });
          } catch (e) { return sendJson(res, 502, { error: e.message }); }
        });
      }

      // Iniciar checkout de upgrade (só dono).
      if (req.method === 'POST' && seg === 'checkout') {
        if (sess.role !== 'owner') return sendJson(res, 403, { error: 'só o dono gerencia o plano' });
        return readBody(req, res, async (b) => {
          const target = plans.plan(b && b.plan);
          if (!target || !(target.precoTelaCents > 0)) return sendJson(res, 400, { error: 'plano inválido' });
          try {
            /*
             * `getUserById`, e não `getUser` — que nunca existiu.
             *
             * A linha entrou junto com o Asaas, porque o checkout passou a
             * precisar do e-mail para criar o cliente. Desde então TODA tentativa
             * de assinar respondia 502 "db.getUser is not a function": ninguém
             * nunca conseguiu pagar, e o erro só aparecia depois do clique.
             *
             * Passou por não ter teste: o caminho pago inteiro não era exercido
             * nem pela suíte nem à mão, porque em modo dev ninguém clicava.
             */
            const user = await db.getUserById(sess.user_id);
            const telasDaConta = await db.countDevices(sess.tenant_id);
            const out = await billing.createCheckout(tenant, user, target.id, reqOrigin(req), {
              // A mensalidade é da CONTA: o valor sai de plans.mensalidadeCents,
              // que aplica as faixas de desconto sobre o número de telas.
              telas: Math.max(1, telasDaConta),
              /*
               * Gravado assim que o cliente existe, e não no retorno. Se o resto
               * do fluxo falhar, a próxima tentativa reencontra este cliente em
               * vez de criar outro — e outra assinatura junto.
               */
              aoCriarCliente: (customerId) => db.setTenantBilling(tenant.id, { customerId }),
            });
            if (out.customerId && out.customerId !== tenant.stripe_customer_id) await db.setTenantBilling(tenant.id, { customerId: out.customerId });
            // A assinatura nasceu (ou foi atualizada) cobrando estas telas; é o
            // ponto de partida da conciliação.
            if (out.id) await db.setTenantBilling(tenant.id, { subscriptionId: out.id, telasCobradas: telasDaConta });
            return sendJson(res, 200, out);
          } catch (e) {
            // A assinatura pode ter sido criada mesmo com erro na fatura. Guardar
            // o id evita que a tentativa seguinte abra uma segunda.
            if (e.subscriptionId) {
              await db.setTenantBilling(tenant.id, { customerId: e.customerId, subscriptionId: e.subscriptionId }).catch(() => {});
            }
            return sendJson(res, 502, { error: e.message });
          }
        });
      }

      /*
       * Gerenciamento da assinatura. Era um "portal" que não existia.
       *
       * A rota devolvia `/app?billing=portal`, e o roteador do painel manda
       * qualquer `?billing=` para a própria tela de plano: o botão "Gerenciar
       * assinatura (cartão, cancelamento)" recarregava a página onde a pessoa
       * já estava. Não havia como cancelar por lugar nenhum.
       */
      if (req.method === 'GET' && seg === 'assinatura') {
        // Leitura serve a qualquer membro: saber se a conta está em dia não é
        // privilégio de dono, e esconder isso só gera pergunta no suporte.
        try { return sendJson(res, 200, await billing.assinatura(tenant)); }
        catch (e) { return sendJson(res, 502, { error: e.message }); }
      }
      if (req.method === 'DELETE' && seg === 'assinatura') {
        if (sess.role !== 'owner') return sendJson(res, 403, { error: 'só o dono cancela o plano' });
        try {
          const out = await billing.cancelarAssinatura(tenant);
          await db.registrarEvento(sess.tenant_id, sess.user_id, 'plano.cancelar');
          /*
           * Em modo simulado não há webhook para rebaixar o plano depois, então
           * o rebaixamento é feito aqui — é o único jeito de o fluxo inteiro ser
           * testável sem chave. Com Asaas de verdade, quem rebaixa é o webhook
           * SUBSCRIPTION_DELETED, e escrever o mesmo estado por duas portas é
           * como ele fica inconsistente.
           */
          if (out.simulado) {
            await db.setTenantBilling(sess.tenant_id, {
              plan: 'free', status: 'canceled', subscriptionId: null, renewsAt: null,
            });
          }
          return sendJson(res, 200, out);
        } catch (e) { return sendJson(res, 502, { error: e.message }); }
      }

      // ----- Modo dev (checkout simulado): só existe sem Stripe configurado -----
      if (billing.mode() === 'dev') {
        if (req.method === 'GET' && seg === 'dev-checkout') {
          const target = plans.plan(query.plan);
          // Um nonce por resposta: vale só para este HTML, e a política global
          // continua sem `unsafe-inline`.
          const nonce = crypto.randomBytes(16).toString('base64');
          const csp = security.cabecalhosSeguranca(security.isSecureRequest(req))['Content-Security-Policy'];
          res.writeHead(200, {
            'Content-Type': 'text/html; charset=utf-8',
            'Cache-Control': 'no-store',
            'Content-Security-Policy': String(csp).replace("script-src 'self'", "script-src 'self' 'nonce-" + nonce + "'"),
          });
          return res.end(devCheckoutPage(target, nonce));
        }
        if (req.method === 'POST' && seg === 'dev-activate') {
          if (sess.role !== 'owner') return sendJson(res, 403, { error: 'só o dono gerencia o plano' });
          return readBody(req, res, async (b) => {
            const target = plans.plan(b && b.plan);
            if (!target || !(target.precoTelaCents > 0)) return sendJson(res, 400, { error: 'plano inválido' });
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
  }

  return async function (req, res, parts, query, sess) {
    if (parts[1] !== 'billing') return false;
    await tratar(req, res, parts, query, sess);
    return true;
  };
};
