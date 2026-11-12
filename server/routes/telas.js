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
    db, auth, storage, midia, reconectar, usoIA, creditos, security, log, erros, diagnostico, mail, plans, billing, ai, director, site, operadores, banco, cortesia, limites, passes, metricas, ds, jobs, legal, seasons, schema, briefing, memory, muralLib, qrcode, baseUrl, sendJson, readBody, emTrabalho, validEmail, reqOrigin, readRawBody, brl, googleEnabled, canManageTeam, normBirthday, lerImagens, avisarTelas, clientIp, rateLimit, crypto, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, isSecureRequest, cobranca, vigia, broadcast, subscribers, estadoSom, PAIR_ONLINE_MS, pairCode, pubDevice, safeEqual, sincronizarCobranca, seloDaConta, comandosPendentes, lerJsonCurto, infoDaTela, pausaDaTela, esquecerSelo,
  } = ctx;

  const NAO_TRATEI = Symbol('nao-tratei');

  /*
   * O que cada TV disse que está mostrando, na última vez que o painel
   * perguntou ("Ver a tela agora", EXECUTOR item 9). Em memória, como o som:
   * é uma foto do instante, não histórico — e some num restart sem dano.
   */
  const estadosDaTela = new Map();
  const verTela = require('../ver-tela.js');

  // De onde a TV aceita foto de peça em HTML: o host público do storage (R2),
  // quando há um. Relativo (disco), só /media/.
  const pecaHtml = require('../../js/peca-html.js');
  const quiz = require('../../js/quiz.js');
  const paleta = require('../paleta.js');
  const apk = require('../apk.js');
  const fotoQr = require('../foto-qr.js');
  const automaticos = require('../automaticos.js');
  const kpis = require('../kpis.js');
  // Fase 13: a loja de cada membro e a aprovação antes de ir ao ar.
  const permissoes = require('../permissoes.js');
  const aprovacao = require('../aprovacao.js');
  const hostsMidia = (() => {
    try { return [new URL(storage.publicUrl('x')).host]; } catch (e) { return []; }
  })();

  /*
   * O NOME NO CABEÇALHO (EXECUTOR §2d, item 39). O painel semeava a config
   * com o nome da TV ("Teste3", "TV da vitrine"), e o título vinha com o da
   * empresa de exemplo — o cabeçalho de todo cliente dizia "Raft Embalagens".
   * Nome vazio, ou igual ao da TV, vira o nome da conta; o que o dono
   * escreveu em "Nome no cabeçalho" fica. Devolve se mudou algo.
   */
  function nomeDaConta(cfg, device, empresa) {
    const s = cfg.settings;
    let mudou = false;
    if (s.titulo === 'Raft Embalagens' && s.nome !== 'Raft Embalagens') { s.titulo = ''; mudou = true; }
    if (empresa && (!s.nome || s.nome === device.name)) { s.nome = empresa; mudou = true; }
    return mudou;
  }
  // Aniversariantes de 7 dias atrás a +9 dias (a semana do aniversário é de segunda a domingo, D32), com só o que a TV desenha (D0.7).
  function aniversariosDaJanela(lista, agora) {
    const DIA = 24 * 60 * 60 * 1000;
    const hoje = new Date(agora);
    const base = Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth(), hoje.getUTCDate());
    const dentro = (dia, mes) => {
      for (const ano of [hoje.getUTCFullYear() - 1, hoje.getUTCFullYear(), hoje.getUTCFullYear() + 1]) {
        const d = (Date.UTC(ano, mes - 1, dia) - base) / DIA;
        if (d >= -7 && d <= 9) return true;
      }
      return false;
    };
    return (lista || []).filter((p) => p && dentro(Number(p.dia), Number(p.mes)))
      // Sem cargo, o setor (D30) — o cartão mostra uma linha só embaixo do nome.
      .map((p) => ({ nome: p.nome, dia: p.dia, mes: p.mes, cargo: p.cargo || p.setor || '', foto: p.foto || '' }));
  }
  async function empresaDa(tenantId) {
    if (!tenantId) return '';
    try { const t = await db.getTenant(tenantId); return (t && t.name && t.name !== 'Empresa') ? t.name : ''; } catch (e) { return ''; }
  }

  /*
   * A MARCA DA CONTA NA TV PAREADA E AINDA SEM PROGRAMAÇÃO (reteste 2,
   * 09/11). A TV saía do código e ficava no "Tudo certo" azul da MultiTelas,
   * na vitrine do cliente, até a primeira publicação. Agora a TV recebe o
   * nome, as duas cores e a logo da conta (no aviso de pareamento e na
   * leitura dos dados dela) e espera com a cara da loja. Só o que a TV
   * desenha: nada de site, endereço ou ramo.
   */
  const COR_HEX = /^#[0-9a-f]{6}$/i;
  async function marcaDaTv(tenantId) {
    if (!tenantId) return null;
    const [kit, empresa, logo] = await Promise.all([
      db.getBrandKit(tenantId).catch(() => null), empresaDa(tenantId), paleta.logoDaConta(db, tenantId).catch(() => null),
    ]);
    const nome = (kit && kit.nome && kit.nome !== 'Marca principal' ? kit.nome : '') || empresa;
    const cores = (kit && Array.isArray(kit.cores) ? kit.cores : []).filter((c) => COR_HEX.test(String(c))).slice(0, 2);
    if (!nome && !cores.length && !logo) return null;
    return { nome: String(nome || '').slice(0, 60), cores, logo: logo || null };
  }

  /*
   * A PROGRAMAÇÃO COMO O PAINEL LÊ (QA total, 05/11): limpa pelo mesmo
   * normalizador da TV (js/storage.js), com o nome da conta no cabeçalho e o
   * tema da marca. Lida crua, uma programação de versão antiga (a lista em vez
   * do objeto, `items` como texto, item nulo) derrubava a Programação e o
   * editor. Ilegível de todo: null, e o painel a vê como TV sem programação.
   * Uma TV (GET /config) e todas de uma vez (GET /api/devices/configs) passam
   * por aqui.
   */
  function configParaOPainel(device, empresa, kit) {
    if (!device || !device.config) return null;
    try {
      let c = JSON.parse(device.config);
      if (!c || typeof c !== 'object' || Array.isArray(c)) return null;
      c = schema.normalize(c);
      if (c && c.settings) {
        nomeDaConta(c, device, empresa);
        // A marca entra sozinha (fase 4): a TV que não escolheu outro tema sai com o da marca.
        const tema = paleta.temaDaTv(c.settings.theme, kit);
        if (tema) c.settings.theme = tema;
        // A arte do modo ambiente também (lote de 06/11): as cores e o nome da marca de agora.
        const amb = paleta.ambienteDaMarca(c.settings.ambiente, kit, empresa, { hostsMidia });
        if (amb) c.settings.ambiente = amb;
      }
      return c;
    } catch (e) { return null; }
  }

  /*
   * A config que vai para a TV, pronta: normalizada, com as peças pela porta,
   * o quiz conferido, os hosts de mídia, o nome da conta e o horário da tela.
   * Devolve { cfg } ou { status, corpo } com o motivo. O PUT de uma TV e o
   * envio em lote (D26) passam pelo mesmo lugar.
   */
  async function prepararConfig(device, b) {
    const falha = (status, corpo) => ({ status, corpo });
    if (!b || typeof b !== 'object' || Array.isArray(b)) return falha(400, { error: 'config inválida' });
    /*
     * Normaliza ANTES de gravar. Antes daqui a config ia crua para o banco
     * e crua para a TV: painel e player concordavam por convenção, e todo
     * campo novo dependia de os dois lados terem sido editados juntos.
     *
     * O mesmo arquivo (js/storage.js) define o formato nas duas pontas.
     */
    let cfg;
    try { cfg = schema.normalize(b); }
    catch (e) { return falha(400, { error: 'config inválida: ' + e.message }); }
    /*
     * Peça em HTML passa pela porta (js/peca-html.js) antes de gravar.
     * A TV confere de novo ao exibir; aqui é a primeira barreira, e a
     * que RECUSA: peça com problema não vai para o banco, volta com a
     * lista do que corrigir.
     */
    const pecas = pecaHtml.conferirConfig(cfg, { hostsMidia });
    if (pecas.problemas.length) {
      return falha(400, { error: 'peça em HTML recusada', problemas: pecas.problemas.slice(0, 20) });
    }
    /*
     * Quiz (D21): o que a IA escreveu e ninguém conferiu não vai para a
     * TV — fato errado na parede é pior que nenhum. O quiz entra
     * normalizado (perguntas, tempo) e o resto do item (agenda) fica.
     */
    for (const z of Object.values(cfg.zonas || {})) {
      if (!z || !Array.isArray(z.items)) continue;
      for (let i = 0; i < z.items.length; i++) {
        const it = z.items[i];
        if (!it || it.type !== 'quiz') continue;
        if (quiz.pendentes(it) > 0) {
          return falha(400, { error: 'Confira as perguntas do quiz antes de publicar: a IA escreveu e ninguém conferiu ainda.', code: 'quiz-sem-revisao' });
        }
        z.items[i] = Object.assign({}, it, quiz.normalizar(it));
      }
    }
    // De onde a TV aceita foto de peça: quem declara é o servidor, sempre.
    cfg.settings.hostsMidia = hostsMidia;
    nomeDaConta(cfg, device, await empresaDa(device.tenant_id));
    /*
     * O horário da loja vai na config que a TV lê (item 8 do EXECUTOR:
     * fora dele, tela preta ou só o relógio). Quem manda é a coluna da
     * tela, gravada em "Horário e alerta" — o painel não decide isto ao
     * salvar o conteúdo, senão uma aba velha desfaria o horário novo.
     */
    if (device.expediente) cfg.settings.expediente = vigia.normalizarExpediente(device.expediente);
    else delete cfg.settings.expediente;
    /*
     * settings.nome é o nome do CABEÇALHO (desde o item 39, o da empresa);
     * o nome da TV é o da lista de Telas, e só muda em "Renomear". Este
     * PUT gravava um no lugar do outro: a TV pareada como "Refeitório"
     * virava "Metalúrgica Andrade" na primeira publicação (teste de 23/10).
     */
    cfg.settings.nome = (cfg.settings && cfg.settings.nome) || device.name;
    return { cfg };
  }

  /*
   * QUEM FAZ O QUÊ NAS TELAS (QA de lançamento, 03/11: o membro removia TV,
   * mudando a fatura e deixando a TV órfã na parede).
   *
   *   Ação                                          dono  admin  membro
   *   Ver telas, ver a tela agora, som, recarregar   sim   sim    sim
   *   Publicar conteúdo (config, lote, desfazer,
   *     restaurar/copiar backup, "mostrar nas TVs")  sim   sim    sim
   *   Nome da TV, grupo, renomear grupo              sim   sim    sim
   *   Horário de funcionamento                       sim   sim    sim
   *   Desligar o aviso de queda por e-mail           sim   sim    NÃO
   *   Reconectar (a TV que voltou com código)        sim   sim    sim
   *   Ligar uma TV NOVA (entra na mensalidade)       sim   sim    NÃO
   *   Remover a TV (sai da mensalidade)              sim   sim    NÃO
   *
   * A linha é a fatura e a vigilância: o membro opera as TVs que existem,
   * mas não põe nem tira tela da cobrança, e não cala o aviso que o dono
   * conta receber quando uma TV cai. Reconectar fica com todos porque não
   * muda a conta (entra uma, sai a mesma) e é o conserto de quem está de pé
   * na frente da TV. Cobrança, equipe e dados da conta têm as próprias
   * travas (server/routes/billing.js, team.js, server.js).
   */

  /*
   * O LIMITE DO PAREAMENTO conta só o código que FALHA (QA de lançamento,
   * 03/11). Contava todo pareamento, e a 16ª TV de quem instala uma frota em
   * dez minutos levava 429 — com o código certo. Força bruta é chute errado;
   * pareamento certo não ajuda ninguém a adivinhar o próximo código.
   * Quinze erros em dez minutos por endereço E por conta (a conta logada
   * trocando de rede não ganha balde novo).
   */
  // A tela está com o tempo real aberto agora? (o Set fica vazio, e não some, quando a conexão fecha)
  const temTempoReal = (id) => !!(subscribers[id] && subscribers[id].size);
  const ERROS_DE_CODIGO = 15;
  const JANELA_DE_CODIGO = 10 * 60 * 1000;
  // Travado: envia o 429 e devolve true (quem chama para). Livre: null.
  function codigoTravado(req, res, sess) {
    const porIp = security.rateLimitConsultar('pair:' + clientIp(req), ERROS_DE_CODIGO);
    const porConta = security.rateLimitConsultar('pair:conta:' + sess.tenant_id, ERROS_DE_CODIGO);
    if (porIp.ok && porConta.ok) return null;
    const espera = Math.max(porIp.ok ? 0 : porIp.retryAfter, porConta.ok ? 0 : porConta.retryAfter);
    sendJson(res, 429, {
      error: 'Muitos códigos errados em pouco tempo. Espere ' + security.esperaEmPalavras(espera)
        + ' e tente de novo, conferindo o código que aparece na TV.',
      code: 'muitas-tentativas', esperarSegundos: espera,
    }, { 'Retry-After': String(espera) });
    /*
     * `true`, e não o retorno de sendJson (undefined): quem chama faz
     * `if (travado) return travado`, e com undefined o pedido seguia depois
     * do 429 — a TV entrava na conta mesmo travada (reteste de 03/11).
     */
    return true;
  }
  function errouCodigo(req, res, sess, status, error) {
    rateLimit('pair:' + clientIp(req), ERROS_DE_CODIGO, JANELA_DE_CODIGO);
    rateLimit('pair:conta:' + sess.tenant_id, ERROS_DE_CODIGO, JANELA_DE_CODIGO);
    return sendJson(res, status, { error });
  }

  async function tratar(req, res, parts, query, sess) {
    /* ----- Criar device (a TV chama, sem auth) ----- */
    /*
     * "TV 1", "TV 2"…: o menor número que nenhuma tela da conta usa. Contar as
     * telas repetia nome depois de remover uma (tira a TV 1 de duas, a nova
     * virava a segunda "TV 2").
     */
    async function proximoNomeDeTv(tenantId) {
      const usados = new Set((await db.listDevices(tenantId)).map((x) => String(x.name || '').trim().toLowerCase()));
      let n = 1;
      while (usados.has('tv ' + n)) n++;
      return 'TV ' + n;
    }

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
      const travado = codigoTravado(req, res, sess);
      if (travado) return travado;
      return readBody(req, res, async (b) => {
        if (!b) return sendJson(res, 400, { error: 'json inválido' });
        const d = await db.getDeviceByCode(b.code);
        if (!d) return errouCodigo(req, res, sess, 404, 'código não encontrado');
        if (d.tenant_id && d.tenant_id !== sess.tenant_id)
          return errouCodigo(req, res, sess, 409, 'este dispositivo já pertence a outra conta');
        // Primeira reivindicação só vale se a TV está viva (código na tela agora).
        if (!d.tenant_id && (!d.last_seen || Date.now() - d.last_seen > PAIR_ONLINE_MS))
          return errouCodigo(req, res, sess, 410, 'código expirado — reinicie a TV para gerar um novo');
        /*
         * "Sim, é a TV X": o mesmo pedido de parear vira reconectar (a TV
         * que voltou com código novo assume o nome, a programação, o grupo e
         * o horário da tela antiga, sem tela nova na fatura).
         */
        if (b.reconectar) {
          const antiga = await db.getDevice(String(b.reconectar));
          // A TV de outra loja não é reconectada por quem não a alcança (fase 13).
          if (antiga && !permissoes.podeTela(sess, antiga)) return sendJson(res, 404, { error: 'tela não encontrada' });
          const nao = reconectar.impedimento(antiga, d, sess.tenant_id, Date.now(), PAIR_ONLINE_MS);
          if (nao) return sendJson(res, nao.status, { error: nao.error });
          return sendJson(res, 200, await reconectarTela(antiga, d, sess));
        }
        // Ligar uma TV NOVA muda a mensalidade: é do dono e do admin (matriz de papéis, lá embaixo).
        if (!d.tenant_id && !canManageTeam(sess.role)) {
          return sendJson(res, 403, { error: 'Só o dono ou um administrador da conta liga uma TV nova (ela entra na mensalidade). Se esta TV já era da conta e voltou com um código, use Reconectar nela.', code: 'papel' });
        }
        /*
         * É a TV X que caiu? (server/reconectar.js, candidatas). Se uma tela
         * da conta parou de pulsar e é o mesmo aparelho, PERGUNTA antes de
         * criar a segunda — `nova: true` é a resposta "não, é outra TV".
         */
        if (!d.tenant_id && b.nova !== true) {
          const parecidas = reconectar.candidatas(await db.listDevices(sess.tenant_id), d, { aoVivo: temTempoReal });
          if (parecidas.length) {
            return sendJson(res, 409, {
              error: 'Esta TV parece ser a "' + parecidas[0].nome + '", que parou de dar sinal. É ela? Se for, ela volta com o nome, a programação e o horário de antes, sem mais uma tela na mensalidade.',
              code: 'parece-reconectar', telas: parecidas,
            });
          }
        }
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
            /*
             * No limite, a TV que voltou com código novo quase sempre é uma
             * das que já estão na conta: oferece reconectar (`telas`) em vez
             * de só mandar assinar.
             */
            const paradas = reconectar.candidatas(await db.listDevices(sess.tenant_id), d, { aoVivo: temTempoReal, todas: true });
            return sendJson(res, 402, {
              error: 'limite do plano atingido (' + limite + (limite === 1 ? ' tela' : ' telas') + '). Faça upgrade para adicionar mais.'
                + (paradas.length ? ' Se esta é a "' + paradas[0].nome + '", que parou de dar sinal, toque em Reconectar: ela volta sem ocupar outra vaga.' : ''),
              code: 'plan_limit', telas: paradas,
            });
          }
        }
        /*
         * O nome padrão era "TV" — e a TV recém-pareada dizia "Tudo certo, TV"
         * (QA de 26/10). Numerada pela conta, a segunda tela não fica com o
         * mesmo nome da primeira na lista.
         */
        const nome = String(b.name || '').trim().slice(0, 60) || d.name || (await proximoNomeDeTv(sess.tenant_id));
        await db.claimDevice(d.id, sess.tenant_id, nome);
        esquecerSelo(sess.tenant_id); // quem fica no ar se conta pelas TVs da conta
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
        broadcast(d.id, 'pareada', { nome, em: Date.now(), marca: await marcaDaTv(sess.tenant_id).catch(() => null) });
        // semConteudo: o painel põe uma tela pronta do ramo, para a TV não nascer vazia.
        return sendJson(res, 200, { id: d.id, name: nome, semConteudo: !d.config });
      });
    }

    /* ----- Listar meus devices (requer login) ----- */
    if (req.method === 'GET' && parts[1] === 'devices' && parts.length === 2) {
      if (!sess) return sendJson(res, 401, { error: 'não autenticado' });
      // Fase 13: o membro de uma loja vê só as TVs dela.
      const rows = permissoes.filtrar(sess, await db.listDevices(sess.tenant_id));
      // Quem precisa de aprovação: em que TVs há um pedido seu esperando (o "Pôr na TV" diz que a mudança nova vai junto).
      const esperando = new Map();
      if (sess.precisaAprovar) {
        for (const p of await db.listarAprovacoes(sess.tenant_id, { estado: 'pendente', autorId: sess.user_id, limite: 50 })) {
          for (const t of p.telas || []) if (!esperando.has(t.id)) esperando.set(t.id, p.id);
        }
      }
      const list = rows.map((d) => {
        const info = (() => { try { return d.info ? JSON.parse(d.info) : null; } catch (_) { return null; } })();
        return {
          id: d.id, name: d.name, code: d.code, hasConfig: !!d.has_config, updatedAt: d.updated_at, lastSeen: d.last_seen,
          expediente: vigia.normalizarExpediente(d.expediente),
          grupo: d.grupo || '',
          info,
          // D41: a casca Android desta TV está atrás da publicada (o nome da nova; vazio se não).
          appNovo: apk.versaoNovaPara(info),
          ...(esperando.has(d.id) ? { meuPedido: esperando.get(d.id) } : {}),
        };
      });
      /*
       * `?agora=1` (reteste 2): a página Telas pede a lista JUNTO com o que
       * cada miniatura precisa — a última resposta da TV (o "o que está
       * passando") e a programação como o painel vê. Eram 32 chamadas com
       * 25 TVs (uma programação por TV); agora a página é um pedido. Só as
       * TVs desta lista: a da outra loja nem entra.
       */
      if (query && query.agora === '1') {
        const [empresa, kit] = await Promise.all([empresaDa(sess.tenant_id), db.getBrandKit(sess.tenant_id).catch(() => null)]);
        for (const item of list) {
          const e = estadosDaTela.get(item.id);
          item.agora = e ? { em: e.em, estado: e.estado, online: !!subscribers[item.id] } : { em: 0, estado: null, online: !!subscribers[item.id] };
          if (!item.hasConfig) continue;
          const r = rows.find((x) => x.id === item.id);
          const d = r && r.config !== undefined ? r : await db.getDevice(item.id);
          if (d && d.tenant_id === sess.tenant_id) item.programacao = configParaOPainel(d, empresa, kit);
        }
      }
      return sendJson(res, 200, { devices: list });
    }

    /*
     * ----- Todas as TVs de uma vez (reteste da fase 10) -----
     * A Programação de 25 TVs fazia 25 pedidos de programação, e Telas e o
     * Início um "o que está passando" por TV. Duas pessoas na mesma conta
     * batiam no freio do painel (600 em 5 min) e o 4G lento levava 4,2 s.
     * Agora é um pedido só, com a mesma resposta de cada TV.
     */
    if (req.method === 'GET' && parts[1] === 'devices' && parts[2] === 'configs' && parts.length === 3) {
      if (!sess) return sendJson(res, 401, { error: 'não autenticado' });
      // Fase 13: o membro de uma loja recebe só a programação das TVs dela (como a lista e GET /config).
      const [rows, empresa, kit] = await Promise.all([
        db.listDevices(sess.tenant_id).then((l) => permissoes.filtrar(sess, l)), empresaDa(sess.tenant_id), db.getBrandKit(sess.tenant_id).catch(() => null),
      ]);
      /*
       * `?ids=a,b,c` (reteste 2): só estas TVs. As miniaturas de Telas e do
       * Início pedem a programação juntas, num pedido só (eram 25 com 25
       * TVs). TV de outra conta ou de outra loja some da resposta.
       */
      const pedidas = String((query && query.ids) || '').split(',').map((x) => x.trim()).filter(Boolean).slice(0, 100);
      const so = pedidas.length ? new Set(pedidas) : null;
      const configs = {};
      for (const r of (so ? rows.filter((x) => so.has(x.id)) : rows)) {
        // A lista não traz a programação: lê cada TV da conta (no banco, não na rede).
        const d = r.config !== undefined ? r : await db.getDevice(r.id);
        if (!d || d.tenant_id !== sess.tenant_id) continue;
        configs[d.id] = { config: configParaOPainel(d, empresa, kit), versao: Number(d.updated_at) || 0 };
      }
      return sendJson(res, 200, { configs });
    }
    if (req.method === 'GET' && parts[1] === 'devices' && parts[2] === 'estados' && parts.length === 3) {
      if (!sess) return sendJson(res, 401, { error: 'não autenticado' });
      // Só as TVs desta conta (e, para o membro de uma loja, as dela): o resto some da resposta, como se não existisse.
      const daConta = new Set(permissoes.filtrar(sess, await db.listDevices(sess.tenant_id)).map((d) => d.id));
      const pedidos = String((query && query.ids) || '').split(',').map((x) => x.trim()).filter(Boolean).slice(0, 100);
      const estados = {};
      for (const id of (pedidos.length ? pedidos : [...daConta])) {
        if (!daConta.has(id)) continue;
        const e = estadosDaTela.get(id);
        estados[id] = e ? { em: e.em, estado: e.estado, online: !!subscribers[id] } : { em: 0, estado: null, online: !!subscribers[id] };
      }
      return sendJson(res, 200, { estados });
    }

    /* ----- Rotas /api/devices/:id/... ----- */
    if (parts[1] === 'devices' && parts[2]) {
      const id = parts[2];
      const device = await db.getDevice(id);
      if (!device) return sendJson(res, 404, { error: 'device não encontrado' });
      const sub = parts[3];
      /*
       * Da conta E alcançável por esta pessoa (fase 13): o membro de uma loja
       * não lê nem grava a TV de outra loja — nem pelo endereço direto.
       */
      const owns = !!sess && device.tenant_id === sess.tenant_id && permissoes.podeTela(sess, device);
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
        /*
         * Quem precisa de aprovação e tem um pedido seu esperando para esta TV
         * lê a programação DO PEDIDO, com a versão dele (server/aprovacao.js,
         * juntar os pedidos): o que mudar agora vai junto, nada se perde.
         * `X-Meu-Pedido` diz qual é (o painel avisa).
         */
        if (!dtOk && sess && sess.precisaAprovar) {
          const meu = (await aprovacao.meusPendentesPorTela(db, sess)).get(device.id);
          const c = meu && meu.item.config ? configParaOPainel(Object.assign({}, device, { config: JSON.stringify(meu.item.config) }), await empresaDa(device.tenant_id), await db.getBrandKit(device.tenant_id).catch(() => null)) : null;
          if (c) {
            res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Config-Versao': String(aprovacao.versaoDoPedido(meu.pedido)), 'X-Meu-Pedido': meu.pedido.id });
            return res.end(JSON.stringify(c));
          }
        }
        /*
         * TV sem programação: 204, mas COM a versão. Sem o cabeçalho o painel
         * lia "versão 0", o servidor comparava com a data do pareamento e
         * recusava toda gravação ("mudada em outro lugar") — a TV nova nunca
         * recebia nada (visto no teste do dono, 24/10).
         */
        if (!device.config) {
          res.writeHead(204, { 'Cache-Control': 'no-store', 'X-Config-Versao': String(Number(device.updated_at) || 0) });
          return res.end();
        }
        /*
         * A versão da programação (o updated_at da última gravação) vai no
         * cabeçalho: o corpo continua a config pura, que a TV lê como sempre.
         * O painel devolve a versão ao gravar (D0.5).
         */
        // O painel recebe a programação já limpa (configParaOPainel); ilegível, 204 como TV sem programação.
        if (!dtOk) {
          const c = configParaOPainel(device, await empresaDa(device.tenant_id), await db.getBrandKit(device.tenant_id).catch(() => null));
          if (!c) {
            res.writeHead(204, { 'Cache-Control': 'no-store', 'X-Config-Versao': String(Number(device.updated_at) || 0) });
            return res.end();
          }
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Config-Versao': String(Number(device.updated_at) || 0) });
          return res.end(JSON.stringify(c));
        }
        // A config gravada antes do item 39 traz o título de exemplo e o nome da TV no cabeçalho.
        let corpo = device.config;
        try {
          const c = JSON.parse(device.config);
          const empresa = await empresaDa(device.tenant_id);
          let mudou = !!(c && c.settings && nomeDaConta(c, device, empresa));
          /*
           * A logo da marca (D8): `settings.logoUrl` nunca era preenchido, e a
           * TV mostrava o nome em texto. Vai só para a TV (token), calculada
           * agora: o painel lê a mesma rota e gravaria a logo velha de volta.
           */
          /*
           * A marca entra sozinha (fase 4): a TV que não escolheu outro tema
           * sai com o da marca. Vale para a TV e para o painel — a prévia mostra
           * o que a TV mostra, e o que o painel gravar já vem com a marca.
           */
          if (c && c.settings) {
            const kit = await db.getBrandKit(device.tenant_id).catch(() => null);
            const tema = paleta.temaDaTv(c.settings.theme, kit);
            if (tema) { c.settings.theme = tema; mudou = true; }
            // A arte do modo ambiente segue a marca (lote de 06/11): mudou a Marca, a TV pega as cores e o nome novos.
            const amb = paleta.ambienteDaMarca(c.settings.ambiente, kit, empresa, { hostsMidia });
            if (amb) { c.settings.ambiente = amb; mudou = true; }
          }
          if (dtOk && c && c.settings) {
            const logo = await paleta.logoDaConta(db, device.tenant_id);
            if (logo) { c.settings.logo = logo; mudou = true; }
            // A frente da conta (fase 3): sem "onde a TV fica" escolhido, a letra mínima é a da frente.
            const frente = await paleta.perfilDaConta(db, device.tenant_id).catch(() => '');
            if (frente) { c.settings.frente = frente; mudou = true; }
            /*
             * O ramo da conta (reteste 2, 09/11): o espaço de foto que ficou
             * sem foto leva a foto padrão do banco para aquele papel e ramo
             * (js/peca-render.js, fotoPadrao), em vez de meia peça vazia.
             */
            const ramo = await paleta.ramoDaConta(db, device.tenant_id).catch(() => '');
            if (ramo) { c.settings.ramo = ramo; mudou = true; }
            /*
             * Aniversários e mural "nas TVs" (D15): a escolha é da conta, e
             * esta TV recebe só o que a alcança. Calculado agora, como a logo:
             * o painel não grava isto de volta na programação.
             */
            const conta = await db.getTenant(device.tenant_id).catch(() => null);
            const auto = automaticos.paraATela(conta && conta.automaticos, device);
            /*
             * O pedido de fotos do RH (D31): no período, as TVs dos aniversários
             * mostram o QR — "a pessoa lê um QR code na tela pedindo as fotos".
             */
            if (auto.aniversarios) {
              const pedidos = await db.listarPedidosFoto(device.tenant_id);
              const pedido = pedidos.find((p) => fotoQr.noPeriodo(p));
              // `ate`: a TV sem internet esconde o QR pelo relógio dela quando o período acaba (nota do consultor no #259).
              if (pedido) auto.pedidoFoto = { codigo: pedido.codigo, titulo: pedido.titulo, link: baseUrl(req) + '/f/' + pedido.codigo, ate: pedido.fim || '' };
              /*
               * Datas com fotos da equipe (D33): na semana da data, o mural
               * com as fotos aprovadas — da própria conta, e com o primeiro
               * nome só (é a parede da empresa).
               */
              const daData = pedidos.find((p) => p.tipo === 'data' && fotoQr.semanaDaData(p.dataAlvo));
              if (daData) {
                const daConta = storage.publicUrl(device.tenant_id + '/');
                const fotos = (await db.listarFotosPessoa(device.tenant_id))
                  .filter((f) => f.pedidoId === daData.id && f.aprovadaEm && f.url.startsWith(daConta))
                  .slice(-12).map((f) => ({ url: f.url, nome: String(f.nome || '').split(' ')[0] }));
                if (fotos.length) auto.dataComFotos = { titulo: fotoQr.saudacaoDa(daData.dataId), fotos, ate: daData.dataAlvo };
              }
            }
            if (auto.aniversarios || auto.mural) { c.settings.automaticos = auto; mudou = true; }
          }
          if (mudou) corpo = JSON.stringify(c);
        } catch (e) {
          // Config ilegível: a TV se vira com ela (o painel já saiu acima, com 204).
        }
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Config-Versao': String(Number(device.updated_at) || 0) });
        return res.end(corpo);
      }
      // Dono publica config (requer login + posse)
      if (req.method === 'PUT' && sub === 'config') {
        if (!owns) return sendJson(res, 403, { error: 'sem permissão' });
        /*
         * Gravação com versão (EXECUTOR D0.5). Quem leu a programação na
         * versão N e grava com ?versao=N só grava se ninguém gravou no meio:
         * outra aba, outra pessoa da equipe, o "Pôr pra rodar" de uma
         * campanha. Antes a última escrita vencia e apagava a anterior sem
         * aviso. Sem ?versao, grava como sempre (TV nova, cópia de tela).
         */
        const versaoPedida = query && query.versao != null && query.versao !== '' ? Number(query.versao) : null;
        // "Versão 0" numa TV que ainda não tem programação é "li vazia": não há o que sobrescrever (painel antigo, 24/10).
        const vaziaLidaVazia = !device.config && versaoPedida === 0;
        // Com um pedido seu esperando para esta TV, a versão que vale é a do pedido: a mudança nova vai junto (aprovacao.conferirVersao).
        const meus = sess.precisaAprovar ? await aprovacao.meusPendentesPorTela(db, sess) : null;
        const meu = meus && meus.get(id);
        const naVersao = meu ? aprovacao.conferirVersao(meu, device, versaoPedida != null && Number.isFinite(versaoPedida) ? versaoPedida : null) : null;
        if (naVersao && !naVersao.ok) {
          return sendJson(res, 409, { error: aprovacao.MUDANCA_ESPERANDO, code: 'config-mudou', versao: naVersao.versao, meuPedido: meu.pedido.id });
        }
        if (!meu && versaoPedida != null && Number.isFinite(versaoPedida) && !vaziaLidaVazia && versaoPedida !== (Number(device.updated_at) || 0)) {
          return sendJson(res, 409, {
            error: 'Esta TV foi mudada em outro lugar enquanto você editava. Recarregue para ver a programação atual.',
            code: 'config-mudou', versao: Number(device.updated_at) || 0,
          });
        }
        return readBody(req, res, async (b) => {
          const pronta = await prepararConfig(device, b);
          if (pronta.corpo) return sendJson(res, pronta.status, pronta.corpo);
          const cfg = pronta.cfg;
          // TV vazia lida vazia: a gravação confere contra a versão de agora (duas primeiras gravações juntas ainda não se atropelam).
          const comVersao = vaziaLidaVazia ? (Number(device.updated_at) || 0)
            : versaoPedida != null && Number.isFinite(versaoPedida) ? versaoPedida : null;
          /*
           * Aprovação ligada e quem grava é membro (fase 13): não vai para a
           * TV, vira pedido — com a versão que ele leu, para a aprovação
           * conferir. 202: aceito, ainda não no ar.
           */
          if (sess.precisaAprovar) {
            const base = naVersao ? naVersao.base : comVersao != null ? comVersao : (Number(device.updated_at) || 0);
            const pedido = await aprovacao.pedir(db, sess, [{ device, cfg, versao: base }],
              String((query && query.descricao) || '').slice(0, 120) || (device.name ? 'Mudança em ' + device.name : 'Mudança na TV'), meus);
            return sendJson(res, 202, aprovacao.resposta(pedido));
          }
          const updatedAt = await db.setDeviceConfig(id, JSON.stringify(cfg), device.name || cfg.settings.nome, comVersao);
          // Alguém gravou entre a conferência lá em cima e aqui (o corpo leva tempo para chegar).
          if (updatedAt == null) {
            return sendJson(res, 409, {
              error: 'Esta TV foi mudada em outro lugar enquanto você editava. Recarregue para ver a programação atual.',
              code: 'config-mudou',
            });
          }
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
        const travado = codigoTravado(req, res, sess);
        if (travado) return travado;
        return readBody(req, res, async (b) => {
          const nova = await db.getDeviceByCode(b && b.code);
          const nao = reconectar.impedimento(device, nova, sess.tenant_id, Date.now(), PAIR_ONLINE_MS);
          if (nao) {
            // Código que não existe ou de outra conta é o que a força-bruta produz: conta no limite.
            if (nao.status === 404 || nao.status === 409 || nao.status === 410) return errouCodigo(req, res, sess, nao.status, nao.error);
            return sendJson(res, nao.status, { error: nao.error });
          }
          return sendJson(res, 200, await reconectarTela(device, nova, sess));
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
          // O membro muda o horário, mas não cala o aviso que o dono conta receber (matriz de papéis, no topo).
          if (!exp.alerta && vigia.normalizarExpediente(device.expediente).alerta && !canManageTeam(sess.role)) {
            return sendJson(res, 403, { error: 'Só o dono ou um administrador da conta pode desligar o aviso de queda por e-mail. O horário pode mudar; deixe o aviso ligado.', code: 'papel' });
          }
          await db.setExpediente(id, JSON.stringify(exp));
          /*
           * E a TV fica sabendo na hora: o horário vai para a config dela
           * (ela apaga ou mostra o relógio fora dele) e o aviso de config nova
           * sai pelo SSE, como numa publicação.
           */
          if (device.config) {
            try {
              const cfg = JSON.parse(device.config);
              cfg.settings = cfg.settings || {};
              cfg.settings.expediente = exp;
              await db.setDeviceConfig(id, JSON.stringify(cfg), device.name || cfg.settings.nome);
              broadcast(id, 'config', { updatedAt: Date.now() });
            } catch (e) { /* config ilegível: o horário vale para o alerta e entra na próxima publicação */ }
          }
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
          // "estado": o painel quer ver a tela agora (a TV responde em /estado).
          if (acao !== 'recarregar' && acao !== 'estado') return sendJson(res, 400, { error: 'comando desconhecido' });
          const cmd = { id: db.rid(10), acao, em: Date.now() };
          // A fila do pulso guarda UM comando: "ver" não pode apagar um
          // "recarregar" que ainda não chegou na TV.
          const pendente = comandosPendentes.get(id);
          if (!(acao === 'estado' && pendente && pendente.acao === 'recarregar')) comandosPendentes.set(id, cmd);
          broadcast(id, 'comando', cmd);
          await db.registrarEvento(sess.tenant_id, sess.user_id, acao === 'estado' ? 'tela.ver' : 'tela.recarregar');
          return sendJson(res, 200, { ok: true, aoVivo: !!subscribers[id] });
        });
      }
      /*
       * Grupo da tela ("Loja Centro"). Vazio tira do grupo. Publicar para o
       * grupo é o painel marcando as telas dele — o servidor não precisa de
       * um segundo caminho de publicação.
       */
      if (req.method === 'POST' && sub === 'grupo') {
        if (!owns) return sendJson(res, 403, { error: 'sem permissão' });
        return readBody(req, res, async (b) => {
          const grupo = String((b && b.grupo) || '').replace(/\s+/g, ' ').trim().slice(0, 60);
          // O membro de loja só move a TV entre as lojas dele (fase 13): senão ela sairia do alcance dele, ou entraria no de outro.
          if (!permissoes.podeGrupo(sess, grupo)) return sendJson(res, 403, { error: 'Você só pode pôr esta TV numa das suas lojas.', code: 'loja' });
          await db.setGrupoDaTela(id, grupo);
          return sendJson(res, 200, { ok: true, grupo });
        });
      }
      if (req.method === 'POST' && sub === 'rename') {
        if (!owns) return sendJson(res, 403, { error: 'sem permissão' });
        return readBody(req, res, async (b) => { await db.renameDevice(id, (b && b.name) || device.name); return sendJson(res, 200, { ok: true }); });
      }
      if (req.method === 'DELETE' && !sub) {
        if (!owns) return sendJson(res, 403, { error: 'sem permissão' });
        // Tirar uma TV muda a mensalidade e deixa a TV sem conta na parede (matriz de papéis, no topo).
        if (!canManageTeam(sess.role)) return sendJson(res, 403, { error: 'Só o dono ou um administrador da conta pode remover uma TV: ela sai da mensalidade.', code: 'papel' });
        await db.removeDevice(id);
        esquecerSelo(sess.tenant_id);
        sincronizarCobranca(sess.tenant_id);
        return sendJson(res, 200, { ok: true });
      }
      // Aniversariantes do tenant desta tela (player lê com device token).
      // Os indicadores da empresa (D36): o último valor de cada um, para o cartão KPI da TV.
      if (req.method === 'GET' && sub === 'kpis') {
        if (!dtOk && !owns) return sendJson(res, 403, { error: 'sem permissão' });
        if (!device.tenant_id) return sendJson(res, 200, { indicadores: [] });
        const lista = (await db.listarIndicadores(device.tenant_id))
          // `sentido` (QA de 03/11): no refugo, passar da meta é ruim — a TV não comemora.
          .map((i) => ({ chave: i.chave, nome: i.nome, valor: i.valor, unidade: i.unidade, meta: i.meta, sentido: kpis.sentidoDe(i), anterior: i.anterior, em: i.atualizadoEm }));
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
        return res.end(JSON.stringify({ indicadores: lista }));
      }
      // Preço e cardápio vindos de uma planilha (fase 11): os últimos itens bons de cada uma.
      if (req.method === 'GET' && sub === 'planilhas') {
        if (!dtOk && !owns) return sendJson(res, 403, { error: 'sem permissão' });
        const lista = device.tenant_id ? (await db.listarPlanilhas(device.tenant_id)).map(require('../planilha.js').paraTv) : [];
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
        return res.end(JSON.stringify({ planilhas: lista }));
      }
      if (req.method === 'GET' && sub === 'birthdays') {
        if (!dtOk && !owns) return sendJson(res, 403, { error: 'sem permissão' });
        if (!device.tenant_id) return sendJson(res, 200, { birthdays: [] });
        /*
         * Só o que a TV mostra: quem faz aniversário de 7 dias atrás até daqui a nove
         * dias (a "semana" do player, com folga de fuso e da atualização de
         * 6 h), e só nome, dia, mês, cargo e foto. Antes ia a lista INTEIRA
         * da empresa, com matrícula, para qualquer TV (D0.7).
         */
        // A foto só se for arquivo da própria conta: a TV não busca imagem de fora (D30).
        const daConta = storage.publicUrl(device.tenant_id + '/');
        const b = aniversariosDaJanela(await db.listBirthdays(device.tenant_id), Date.now())
          .map((p) => (p.foto && !p.foto.startsWith(daConta) ? Object.assign({}, p, { foto: '' }) : p));
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
        return res.end(JSON.stringify({ birthdays: b }));
      }
      // Metadados (dono ou device)
      if (req.method === 'GET' && !sub) {
        if (!dtOk && !owns) return sendJson(res, 403, { error: 'sem permissão' });
        // A TV pareada e ainda sem programação espera com a marca da conta (marcaDaTv).
        if (dtOk && device.tenant_id && !device.config) return sendJson(res, 200, Object.assign(pubDevice(device), { marca: await marcaDaTv(device.tenant_id).catch(() => null) }));
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
      /*
       * "Ver a tela agora": a TV responde ao comando "estado" com o que está
       * no ar, zona por zona (js/player.js, coletarEstado), e o painel busca
       * aqui. Um navegador não fotografa a própria tela; o painel desenha o
       * estado com o mesmo desenhista.
       */
      if (req.method === 'POST' && sub === 'estado') {
        if (!dtOk) return sendJson(res, 403, { error: 'device token inválido' });
        return readBody(req, res, async (b) => {
          // Conferido contra a programação salva: o painel só desenha o que o dono salvou.
          estadosDaTela.set(id, { em: Date.now(), estado: verTela.conferirEstado(b, device.config) });
          // Teto de memória: a mais antiga sai (Map guarda a ordem de entrada).
          if (estadosDaTela.size > 5000) estadosDaTela.delete(estadosDaTela.keys().next().value);
          return sendJson(res, 200, { ok: true });
        });
      }
      if (req.method === 'GET' && sub === 'estado') {
        if (!owns) return sendJson(res, 403, { error: 'sem permissão' });
        const e = estadosDaTela.get(id);
        return sendJson(res, 200, e ? { em: e.em, estado: e.estado, online: !!subscribers[id] } : { em: 0, estado: null, online: !!subscribers[id] });
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
      /*
       * Lote do relatório de exibição (js/exibicoes.js). Só a TV manda, e
       * só tela com dono conta. Cada linha é saneada: nada que a TV mande
       * vai cru para o banco, e hora no futuro ou velha demais é descartada.
       */
      if (req.method === 'POST' && sub === 'exibicoes') {
        if (!dtOk) return sendJson(res, 403, { error: 'device token inválido' });
        if (!device.tenant_id) return sendJson(res, 200, { ok: true, ignorado: 'tela sem dono' });
        return readBody(req, res, async (b) => {
          const lote = String((b && b.lote) || '').slice(0, 40);
          if (!/^[A-Za-z0-9_-]{6,40}$/.test(lote)) return sendJson(res, 400, { error: 'lote inválido' });
          const agora = Date.now();
          const HORA = 3600 * 1000;
          const itens = (Array.isArray(b.itens) ? b.itens : []).slice(0, 500).map((i) => ({
            hora: Math.floor(Number(i && i.hora) / HORA) * HORA,
            zona: String((i && i.zona) || 'principal').slice(0, 40),
            chave: String((i && i.chave) || '').slice(0, 80),
            rotulo: String((i && i.rotulo) || '').slice(0, 120),
            tipo: String((i && i.tipo) || '').slice(0, 40),
            vezes: Math.max(0, Math.min(10000, Math.floor(Number(i && i.vezes) || 0))),
            segundos: Math.max(0, Math.min(3600, Math.floor(Number(i && i.segundos) || 0))),
          })).filter((i) => i.chave && Number.isFinite(i.hora)
            && i.hora <= agora && i.hora > agora - 90 * 24 * HORA && (i.vezes || i.segundos));
          const novo = await db.registrarExibicoes(id, device.tenant_id, lote, itens);
          return sendJson(res, 200, { ok: true, novo, linhas: itens.length });
        });
      }
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
        // `selo` continua booleano para as TVs com o casco antigo; o texto vai à parte.
        const seloTexto = await seloDaConta(device.tenant_id);
        // TV pausada (QA de lançamento, 03/11): no grátis só a TV mais antiga segue no ar.
        const pausadaTexto = await pausaDaTela(device.tenant_id, id);
        return sendJson(res, 200, {
          ok: true, at: Date.now(), configEm: device.updated_at || 0, selo: !!seloTexto, seloTexto,
          pausada: !!pausadaTexto, ...(pausadaTexto ? { pausadaTexto } : {}),
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

  /*
   * Reconectar: a TV `nova` (que voltou mostrando código) vira a tela
   * `antiga` do painel. Leva TUDO o que o cliente chama de "minha tela": nome,
   * programação, grupo e horário/aviso de queda — o QA de 03/11 viu o grupo
   * sumir e o horário voltar ao padrão, e a publicação seguinte apagava o
   * horário da config também (prepararConfig lê a coluna). O que a TV contou
   * de si (info) fica o da nova, que é o aparelho de verdade; sem ele, o da
   * antiga até o primeiro pulso.
   */
  async function reconectarTela(antiga, nova, sess) {
    const nome = antiga.name || 'TV';
    // Já tinha sido pareada como tela nova: tirar a antiga diminui a conta, e a cobrança acompanha.
    const jaEraDaConta = nova.tenant_id === sess.tenant_id;
    await db.claimDevice(nova.id, sess.tenant_id, nome);
    if (antiga.config) await db.setDeviceConfig(nova.id, antiga.config, nome);
    if (antiga.grupo) await db.setGrupoDaTela(nova.id, antiga.grupo);
    if (antiga.expediente) await db.setExpediente(nova.id, antiga.expediente);
    if (!nova.info && antiga.info) await db.touchDevice(nova.id, antiga.info);
    /*
     * A idade também (revisão de 03/11): no grátis só a TV mais antiga fica
     * no ar. Sem herdar, a reconectada virava a mais nova e ficava pausada,
     * e outra TV, de outra sala, assumia o lugar dela.
     */
    await db.herdarIdadeDaTela(nova.id, antiga.id);
    await db.removeDevice(antiga.id);
    // A lista de quem fica no ar mudou de id: a TV sabe no pulso seguinte, e não em 5 min.
    esquecerSelo(sess.tenant_id);
    if (jaEraDaConta) sincronizarCobranca(sess.tenant_id);
    await db.registrarEvento(sess.tenant_id, sess.user_id, 'tela.reconectar').catch(() => {});
    // A TV sai do código na hora: com programação, busca a config; sem, mostra "Tudo certo".
    if (antiga.config || nova.config) broadcast(nova.id, 'config', { updatedAt: Date.now() });
    else broadcast(nova.id, 'pareada', { nome, em: Date.now(), marca: await marcaDaTv(sess.tenant_id).catch(() => null) });
    return { id: nova.id, name: nome, herdouConfig: !!antiga.config, reconectada: true };
  }

  /* Renomear (ou desfazer, com `para` vazio) um grupo inteiro de uma vez. */
  async function grupos(req, res, parts, query, sess) {
    if (!sess) return sendJson(res, 401, { error: 'não autenticado' });
    if (req.method === 'POST' && parts[2] === 'renomear') {
      return readBody(req, res, async (b) => {
        const de = String((b && b.de) || '').trim();
        const para = String((b && b.para) || '').replace(/\s+/g, ' ').trim().slice(0, 60);
        if (!de) return sendJson(res, 400, { error: 'qual grupo?' });
        // Renomear vale para a conta inteira: o membro de loja não renomeia (fase 13).
        if (permissoes.restrito(sess)) return sendJson(res, 403, { error: 'Só o dono ou um administrador renomeia uma loja.', code: 'loja' });
        const telas = await db.renomearGrupo(sess.tenant_id, de, para);
        // Quem só via aquele grupo continua vendo, com o nome novo.
        await permissoes.renomearNasLojas(db, sess.tenant_id, de, para);
        return sendJson(res, 200, { ok: true, telas, grupo: para });
      });
    }
    return sendJson(res, 404, { error: 'rota de grupos inválida' });
  }

  /*
   * /api/automaticos (D15): "mostrar nas TVs" dos aniversários e do mural.
   * GET devolve a escolha e onde cada mural aparece de verdade — o "na tela"
   * do painel passa a ser verdade, e não um número otimista.
   */
  async function rotaAutomaticos(req, res, sess) {
    if (!sess) return sendJson(res, 401, { error: 'não autenticado' });
    const [conta, telas, murais] = await Promise.all([
      db.getTenant(sess.tenant_id), db.listDevices(sess.tenant_id), db.listarMurais(sess.tenant_id),
    ]);
    const idsDaConta = (telas || []).map((d) => d.id);
    const codigosDeMural = (murais || []).map((m) => String(m.codigo || '').toUpperCase());
    const atual = automaticos.normalizar(conta && conta.automaticos, { idsDaConta, codigosDeMural });
    if (req.method === 'GET') {
      // Onde cada mural está: pelo "mostrar nas TVs" ou por um item posto à mão numa zona.
      const muralNasTelas = {};
      for (const cod of codigosDeMural) {
        // Item de mural posto à mão numa zona (a config é JSON compacto: sem espaço depois dos dois-pontos).
        const naZona = (await db.ondeAparece(sess.tenant_id, '"codigo":"' + cod + '"')).telas
          // Fase 13: o membro de uma loja não fica sabendo o nome das TVs das outras.
          .filter((nome) => !permissoes.restrito(sess) || permissoes.filtrar(sess, telas).some((d) => (d.name || 'TV') === nome));
        const viaConta = permissoes.filtrar(sess, telas || []).filter((d) => automaticos.paraATela(atual, d).mural === cod).map((d) => d.name || 'TV');
        const nomes = [...new Set(naZona.concat(viaConta))];
        if (nomes.length) muralNasTelas[cod] = nomes;
      }
      return sendJson(res, 200, { automaticos: atual, muralNasTelas, telas: permissoes.filtrar(sess, telas).map((d) => ({ id: d.id, nome: d.name || 'TV', grupo: d.grupo || '' })) });
    }
    if (req.method === 'PUT') {
      // Vale para todas as TVs da conta: o membro de uma loja não muda (fase 13).
      if (permissoes.restrito(sess)) return sendJson(res, 403, { error: 'Só o dono ou um administrador muda o que aparece sozinho em todas as TVs.', code: 'loja' });
      return readBody(req, res, async (b) => {
        const novo = automaticos.normalizar(Object.assign({}, atual, b || {}), { idsDaConta, codigosDeMural });
        await db.setAutomaticos(sess.tenant_id, novo);
        await db.registrarEvento(sess.tenant_id, sess.user_id, 'automaticos.salvar');
        /*
         * As TVs abertas ficam sabendo NA HORA (QA de lançamento, 03/11): o
         * painel dizia "Pronto: as TVs mostram sozinhas" e a TV só via na
         * volta de 60 s. O "mostrar nas TVs" mora fora da programação (é
         * calculado no GET da config), então o aviso é o de config nova — a
         * TV busca de novo e já vem com os aniversários e o mural.
         */
        avisarTelas(sess.tenant_id, 'config', { updatedAt: Date.now(), automaticos: true }).catch(() => {});
        return sendJson(res, 200, { automaticos: novo });
      });
    }
    return sendJson(res, 405, { error: 'método inválido' });
  }

  /*
   * ENVIO EM LOTE (EXECUTOR D26): a mesma mudança em várias TVs, no
   * servidor. Antes era o navegador, uma TV por vez: falhou na terceira, as
   * duas primeiras ficavam mudadas e o aviso dizia que deu certo.
   *
   *   POST /api/lote              { itens: [{ id, config, versao }], descricao }
   *   POST /api/lote/:id/desfazer volta cada TV ao que era (se ninguém mexeu depois)
   *   GET  /api/lote              os últimos envios da conta
   *
   * Tudo ou nada: posse, versão e a porta (prepararConfig) de TODAS antes
   * de gravar a primeira; se uma gravação falhar no meio (alguém salvou
   * naquele instante), as já gravadas voltam. O "antes" de cada TV fica 30
   * dias para o Desfazer.
   *
   * Fase 13: o membro de uma loja só envia para as TVs dela (a lista
   * misturada é recusada inteira), e com a aprovação ligada o envio do
   * membro vira um pedido (202) em vez de ir para as TVs.
   */
  async function rotaLote(req, res, parts, sess) {
    if (!sess) return sendJson(res, 401, { error: 'não autenticado' });
    const idLote = parts[2];
    if (!idLote && req.method === 'GET') {
      const lotes = await db.listarLotes(sess.tenant_id, 10);
      if (!permissoes.restrito(sess)) return sendJson(res, 200, { lotes });
      // O membro de loja vê só os envios que ficaram inteiros nas TVs dele.
      const minhas = new Set(permissoes.filtrar(sess, await db.listDevices(sess.tenant_id)).map((d) => d.id));
      return sendJson(res, 200, { lotes: lotes.filter((l) => (l.telas || []).length && l.telas.every((t) => minhas.has(t.id))) });
    }
    if (!idLote && req.method === 'POST') {
      return readBody(req, res, async (b) => {
        const conferido = await conferirLote(sess, b && b.itens);
        if (!conferido.prontos) return sendJson(res, conferido.status, conferido.corpo);
        const descricao = String((b && b.descricao) || '').slice(0, 120);
        if (sess.precisaAprovar) {
          const pedido = await aprovacao.pedir(db, sess, conferido.prontos, descricao, conferido.meus);
          return sendJson(res, 202, aprovacao.resposta(pedido));
        }
        const r = await aplicarLote(sess.tenant_id, sess.user_id, conferido.prontos, descricao);
        return sendJson(res, r.status, r.corpo);
      });
    }
    if (idLote && parts[3] === 'desfazer' && req.method === 'POST') {
      const lote = await db.loteDaConta(idLote, sess.tenant_id);
      if (!lote) return sendJson(res, 404, { error: 'envio não encontrado' });
      if (lote.desfeitoEm) return sendJson(res, 409, { error: 'este envio já foi desfeito', code: 'ja-desfeito' });
      // Fase 13: desfazer também muda o que está no ar — com aprovação ligada, é do dono.
      if (sess.precisaAprovar) return sendJson(res, 403, { error: 'Com a aprovação ligada, quem desfaz um envio é o dono ou um administrador.', code: 'aprovacao' });
      if (permissoes.restrito(sess)) {
        for (const t of lote.telas) {
          const d = await db.getDevice(t.id);
          if (d && d.tenant_id === sess.tenant_id && !permissoes.podeTela(sess, d)) return sendJson(res, 404, { error: 'envio não encontrado' });
        }
      }
      const voltaram = [];
      const mudaram = [];
      for (const t of lote.telas) {
        const device = await db.getDevice(t.id);
        if (!device || device.tenant_id !== sess.tenant_id) continue;
        // A TV mudou depois do envio: o que a pessoa fez depois não é apagado.
        if ((Number(device.updated_at) || 0) !== t.versaoDepois) { mudaram.push({ id: t.id, nome: device.name }); continue; }
        const updatedAt = await db.setDeviceConfig(t.id, t.antes, device.name, t.versaoDepois);
        if (updatedAt == null) { mudaram.push({ id: t.id, nome: device.name }); continue; }
        broadcast(t.id, 'config', { updatedAt });
        voltaram.push({ id: t.id, nome: device.name });
      }
      await db.marcarLoteDesfeito(idLote, sess.tenant_id);
      await db.registrarEvento(sess.tenant_id, sess.user_id, 'lote.desfazer');
      return sendJson(res, 200, { voltaram, mudaram });
    }
    return sendJson(res, 405, { error: 'método inválido' });
  }

  /*
   * A conferência do lote, sem gravar nada: posse, loja (fase 13), versão e
   * a porta (prepararConfig) de TODAS. Devolve { prontos } ou { status, corpo }.
   * O envio e a aprovação (server/routes/aprovacoes.js) passam por aqui.
   */
  async function conferirLote(sess, itensCrus) {
    const itens = Array.isArray(itensCrus) ? itensCrus.slice(0, 200) : [];
    if (!itens.length) return { status: 400, corpo: { error: 'escolha pelo menos uma TV' } };
    const prontos = [];
    const conflitos = [];
    const problemas = [];
    // Quem precisa de aprovação: a TV com pedido seu esperando confere contra o pedido (aprovacao.conferirVersao).
    const meus = sess && sess.precisaAprovar ? await aprovacao.meusPendentesPorTela(db, sess) : null;
    // A mesma TV duas vezes no envio: qual das duas valeria? Recusa em vez de adivinhar.
    const ids = itens.map((it) => String((it && it.id) || '')).filter(Boolean);
    if (new Set(ids).size !== ids.length) return { status: 400, corpo: { error: 'A mesma TV veio duas vezes no envio. Nada foi enviado.', code: 'tv-repetida' } };
    for (const it of itens) {
      const id = String((it && it.id) || '');
      if (!id) continue;
      const device = await db.getDevice(id);
      if (!device || device.tenant_id !== sess.tenant_id) { problemas.push({ id, error: 'TV não encontrada nesta conta' }); continue; }
      /*
       * A TV de outra loja, numa lista misturada (fase 13): o envio inteiro
       * é recusado — nada vai, nem para as TVs da loja dele. 403, e sem
       * dizer o nome da TV que ele não alcança.
       */
      if (!permissoes.podeTela(sess, device)) {
        return { status: 403, corpo: { error: 'Uma das TVs não é da sua loja. Nada foi enviado.', code: 'loja' } };
      }
      const versao = it.versao != null && it.versao !== '' ? Number(it.versao) : null;
      const meu = meus && meus.get(id);
      const v = aprovacao.conferirVersao(meu, device, versao);
      if (!v.ok) { conflitos.push(Object.assign({ id, nome: device.name, versao: v.versao }, meu ? { meuPedido: meu.pedido.id } : {})); continue; }
      const p = await prepararConfig(device, it.config);
      if (p.corpo) { problemas.push(Object.assign({ id, nome: device.name }, p.corpo)); continue; }
      prontos.push({ device, cfg: p.cfg, versao: v.base });
    }
    if (conflitos.length) {
      const doPedido = conflitos.some((c) => c.meuPedido);
      return { status: 409, corpo: { error: doPedido ? aprovacao.MUDANCA_ESPERANDO : 'Algumas TVs foram mudadas em outro lugar enquanto você enviava. Nada foi enviado.', code: 'config-mudou', telas: conflitos } };
    }
    if (problemas.length) {
      return { status: 400, corpo: { error: (problemas[0].nome ? problemas[0].nome + ': ' : '') + (problemas[0].error || 'programação recusada') + '. Nada foi enviado.', code: problemas[0].code, problemas: problemas.slice(0, 20) } };
    }
    if (!prontos.length) return { status: 400, corpo: { error: 'escolha pelo menos uma TV' } };
    return { prontos, meus };
  }

  /*
   * A gravação do lote já conferido: tudo ou nada, com a versão de cada TV.
   * Se uma gravação falhar no meio (alguém salvou naquele instante), as já
   * gravadas voltam. Devolve { status, corpo }.
   */
  async function aplicarLote(tenantId, userId, prontos, descricao) {
    const feitos = [];
    for (const p of prontos) {
      const updatedAt = await db.setDeviceConfig(p.device.id, JSON.stringify(p.cfg), p.device.name || p.cfg.settings.nome, p.versao);
      if (updatedAt == null) {
        // Alguém gravou nesta TV agora mesmo: as que já foram voltam ao que eram.
        for (const f of feitos.reverse()) {
          const volta = await db.setDeviceConfig(f.device.id, f.device.config || null, f.device.name, f.updatedAt);
          if (volta != null) broadcast(f.device.id, 'config', { updatedAt: volta });
        }
        return { status: 409, corpo: { error: 'Uma TV foi mudada em outro lugar enquanto você enviava. Nada foi enviado.', code: 'config-mudou', telas: [{ id: p.device.id, nome: p.device.name }] } };
      }
      feitos.push({ device: p.device, updatedAt });
    }
    const lote = await db.salvarLote(tenantId, {
      descricao: String(descricao || '').slice(0, 120),
      telas: feitos.map((f) => ({ id: f.device.id, nome: f.device.name || '', antes: f.device.config || null, versaoAntes: Number(f.device.updated_at) || 0, versaoDepois: f.updatedAt })),
    });
    feitos.forEach((f) => broadcast(f.device.id, 'config', { updatedAt: f.updatedAt }));
    await db.registrarEvento(tenantId, userId, 'lote.enviar');
    return { status: 200, corpo: { ok: true, lote, telas: feitos.map((f) => ({ id: f.device.id, updatedAt: f.updatedAt })) } };
  }
  // A aprovação (server/routes/aprovacoes.js) põe no ar pelo mesmo caminho do envio.
  /*
   * Como o painel vê uma programação (o reteste 2: o antes e o depois das
   * Aprovações saíam sem a marca): a mesma limpeza do GET /config, com o
   * nome da conta e o tema da marca. Lê a conta uma vez e devolve a função
   * que vale para cada TV do pedido.
   */
  async function vistaDoPainel(tenantId) {
    const [empresa, kit] = await Promise.all([empresaDa(tenantId), db.getBrandKit(tenantId).catch(() => null)]);
    return (cfg, device) => {
      if (!cfg || typeof cfg !== 'object') return null;
      return configParaOPainel(Object.assign({}, device || {}, { config: JSON.stringify(cfg) }), empresa, kit);
    };
  }
  // A aprovação (server/routes/aprovacoes.js) põe no ar pelo mesmo caminho do envio.
  ctx.publicar = { conferirLote, aplicarLote, normalizar: (c) => schema.normalize(c), vistaDoPainel };

  return async function (req, res, parts, query, sess) {
    if (parts[1] === 'lote') { await rotaLote(req, res, parts, sess); return true; }
    if (parts[1] === 'automaticos' && parts.length === 2) { await rotaAutomaticos(req, res, sess); return true; }
    if (parts[1] === 'grupos') { await grupos(req, res, parts, query, sess); return true; }
    if (parts[1] !== 'devices' && parts[1] !== 'pair') return false;
    const r = await tratar(req, res, parts, query, sess);
    // `tratar` devolve undefined quando nenhum caminho casou (rota de telas
    // desconhecida): aí quem chamou continua procurando, como antes.
    return r !== NAO_TRATEI;
  };
};
