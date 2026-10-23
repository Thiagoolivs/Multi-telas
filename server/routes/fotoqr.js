/*
 * /api/fotoqr — a foto da pessoa pelo QR, com o RH aprovando (EXECUTOR D31).
 *
 * Públicas (a página /f/:codigo; o código do QR só abre o pedido):
 *   POST /api/fotoqr/:codigo/codigo   { email }          manda o código por e-mail
 *   POST /api/fotoqr/:codigo/entrar   { email, codigo }  devolve o passe
 *   POST /api/fotoqr/:codigo/foto     (imagem; X-Passe)  a foto entra na fila
 * Do painel (dono e admins — a fila tem e-mail e foto de gente):
 *   GET    /api/fotoqr                    pedidos e fotos para aprovar
 *   POST   /api/fotoqr                    abre um pedido { titulo, inicio, fim }
 *   PUT    /api/fotoqr/:id                { titulo, inicio, fim, aceitando }
 *   DELETE /api/fotoqr/:id                apaga (as fotos que esperavam também)
 *   POST   /api/fotoqr/fotos/:id/aprovar  vira a foto da pessoa (ou a pessoa entra)
 *   POST   /api/fotoqr/fotos/:id/recusar  a foto sai, arquivo e tudo
 */
const F = require('../foto-qr');
const P = require('../../js/pessoas.js');
const muralLib = require('../mural');

module.exports = function (ctx) {
  const { db, sendJson, readBody, rateLimit, clientIp, midia, mail, erros, canManageTeam, avisarTelas } = ctx;
  // Abrir, pausar ou apagar o pedido muda o cartão do QR nas TVs (D31b): elas buscam a config de novo.
  const avisar = (t) => avisarTelas(t, 'config', {}).catch(() => {});

  /*
   * Sem e-mail configurado o código não chega. Só em desenvolvimento o código
   * volta na resposta: SKIP_VERIFY sozinho não basta, porque ele também é a
   * saída ensinada para subir SEM provedor em produção — e aí qualquer um
   * pegaria o código de qualquer e-mail da lista (nota do consultor no D31).
   */
  const emDev = () => process.env.SKIP_VERIFY === '1' && !mail.configured() && !ctx.billing.emProducao();
  const emailPronto = () => mail.configured() || emDev();
  const emailDe = (e) => { const s = String(e || '').trim().toLowerCase().slice(0, 120); return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) ? s : ''; };

  async function publica(req, res, parts, query) {
    const pedido = await db.pedidoFotoPorCodigo(String(parts[2]).toUpperCase());
    if (!pedido) return sendJson(res, 404, { error: 'pedido de fotos não encontrado' });
    if (!F.noPeriodo(pedido)) return sendJson(res, 403, { error: 'o envio de fotos está fechado agora' });
    const ip = clientIp(req);

    if (parts[3] === 'codigo') {
      const rl = rateLimit('fotoqr:ip:' + ip, 20, 10 * 60 * 1000);
      if (!rl.ok) return sendJson(res, 429, { error: 'muitos pedidos desta rede — espere um pouco' }, { 'Retry-After': String(rl.retryAfter) });
      if (!emailPronto()) return sendJson(res, 503, { error: 'o envio de e-mail não está ligado — fale com o RH' });
      return readBody(req, res, async (b) => {
        const email = emailDe(b && b.email);
        if (!email) return sendJson(res, 400, { error: 'confira o e-mail' });
        const rlE = rateLimit('fotoqr:e:' + pedido.id + ':' + email, 5, 60 * 60 * 1000);
        if (!rlE.ok) return sendJson(res, 429, { error: 'muitos códigos para este e-mail — espere um pouco' }, { 'Retry-After': String(rlE.retryAfter) });
        const codigo = F.pedirCodigo(pedido.id, email);
        const t = await db.getTenant(pedido.tenantId).catch(() => null);
        try { await mail.send(Object.assign({ to: email }, F.emailDoCodigo(codigo, (t && t.name) || ''))); }
        catch (e) { erros.registrar(e, { onde: 'código da foto pelo QR' }); return sendJson(res, 502, { error: 'não deu para mandar o e-mail agora — tente de novo' }); }
        // A mesma resposta com o e-mail na lista ou não: a página não revela quem trabalha lá.
        return sendJson(res, 200, Object.assign({ ok: true }, emDev() ? { codigoDev: codigo } : {}));
      });
    }

    if (parts[3] === 'entrar') {
      const rl = rateLimit('fotoqr:in:' + ip, 30, 10 * 60 * 1000);
      if (!rl.ok) return sendJson(res, 429, { error: 'muitas tentativas — espere um pouco' }, { 'Retry-After': String(rl.retryAfter) });
      return readBody(req, res, async (b) => {
        const email = emailDe(b && b.email);
        if (!email || !F.conferirCodigo(pedido.id, email, b && b.codigo)) return sendJson(res, 400, { error: 'código errado ou vencido — peça outro' });
        const pessoa = (await db.listBirthdays(pedido.tenantId)).find((p) => p.email && p.email.toLowerCase() === email) || null;
        const passe = F.emitirPasse({ tenantId: pedido.tenantId, pedidoId: pedido.id, email, pessoaId: pessoa ? pessoa.id : null });
        return sendJson(res, 200, { passe, pessoa: pessoa ? { nome: pessoa.nome } : null });
      });
    }

    // parts[3] === 'foto'
    const passe = req.headers['x-passe'];
    const dados = F.lerPasse(passe, pedido.id);
    if (!dados) return sendJson(res, 401, { error: 'a entrada venceu — peça outro código' });
    let quem = null;
    if (dados.pessoaId) {
      quem = await db.pessoaDoTenant(pedido.tenantId, dados.pessoaId);
    }
    if (!quem && pedido.tipo === 'data') {
      // Foto para o mural de uma data (D33): basta o nome — a pessoa não entra na lista por isso.
      const nome = String(query.nome || '').replace(/\s+/g, ' ').trim().slice(0, 80);
      if (!nome) return sendJson(res, 400, { error: 'diga seu nome' });
      quem = { id: null, nome, dia: null, mes: null, setor: String(query.setor || '').replace(/\s+/g, ' ').trim().slice(0, 60) };
    }
    if (!quem) {
      // Quem não está na lista diz quem é; o RH confere ao aprovar.
      const p = P.normalizar({ nome: query.nome, nascimento: query.nascimento, setor: query.setor, email: dados.email });
      if (!p) return sendJson(res, 400, { error: 'diga seu nome e o aniversário (dia/mês)' });
      quem = Object.assign(p, { id: null });
    }
    const mime = String(query.mime || req.headers['content-type'] || '').toLowerCase();
    if (/^image\/hei[cf]/.test(mime)) {
      return sendJson(res, 415, { error: 'formato do iPhone (HEIC) não abre na TV — no iPhone, Ajustes › Câmera › Formatos › "Mais compatível", ou envie um print da foto' });
    }
    if (!/^image\/(jpeg|png|webp)$/.test(mime)) return sendJson(res, 415, { error: 'envie uma foto (JPG, PNG ou WEBP)' });
    // O consentimento é explícito (caixa desmarcada na página) e fica gravado com data e hora.
    if (query.aceite !== '1') return sendJson(res, 400, { error: 'marque a autorização para mandar a foto' });
    if (!F.gastarFoto(passe)) return sendJson(res, 429, { error: 'já recebemos ' + F.FOTOS_POR_PASSE + ' fotos suas — o RH vai conferir' });
    try {
      const salvo = await midia.guardarStream(db, pedido.tenantId, req, { mime, max: F.MAX_MB * 1024 * 1024 }, { nome: 'Foto de ' + quem.nome, origem: 'fotoqr' });
      await db.addFotoPessoa(pedido.tenantId, {
        pedidoId: pedido.id, pessoaId: quem.id, nome: quem.nome, dia: quem.dia, mes: quem.mes, setor: quem.setor || '',
        email: dados.email, url: salvo.url, chave: salvo.key, mediaId: salvo.id, aceiteEm: Date.now(),
      });
      await db.registrarEvento(pedido.tenantId, null, 'fotoqr.recebida').catch(() => {});
      return sendJson(res, 201, { ok: true });
    } catch (e) {
      if (e.status === 413) return sendJson(res, 413, { error: 'essa foto passa de ' + F.MAX_MB + ' MB — tente outra' });
      if (e.status === 415) return sendJson(res, 415, { error: 'esse tipo de arquivo não abre na TV' });
      erros.registrar(e, { onde: 'foto pelo QR' });
      return sendJson(res, 500, { error: 'não foi possível salvar — tente de novo' });
    }
  }

  function pedidoDe(b, atual) {
    const a = atual || {};
    const inicio = b.inicio !== undefined ? (F.dataValida(b.inicio) ? b.inicio : '') : (a.inicio || '');
    let fim = b.fim !== undefined ? (F.dataValida(b.fim) ? b.fim : '') : (a.fim || '');
    // Sem fim, 30 dias (prorrogável no painel): QR esquecido na parede não fica de porta aberta.
    if (!fim) fim = F.somarDias(inicio || F.hojeIso(), F.PRAZO_PADRAO_DIAS);
    return {
      titulo: String(b.titulo !== undefined ? b.titulo : (a.titulo || '')).replace(/\s+/g, ' ').trim().slice(0, 80) || 'Mande sua foto',
      inicio, fim: inicio && fim < inicio ? inicio : fim,
      aceitando: b.aceitando !== undefined ? b.aceitando !== false : a.aceitando !== false,
    };
  }

  async function recusar(t, f) {
    if (f.mediaId) await midia.apagar(db, t, f.mediaId).catch(() => {});
    await db.removerFotoPessoa(f.id, t);
  }

  async function painel(req, res, parts, sess) {
    const t = sess.tenant_id;
    if (!parts[2] && req.method === 'GET') {
      return sendJson(res, 200, { pedidos: await db.listarPedidosFoto(t), fotos: await db.listarFotosPessoa(t), emailPronto: emailPronto(), datas: F.datasParaFotos() });
    }
    if (!parts[2] && req.method === 'POST') {
      return readBody(req, res, async (b) => {
        /*
         * Pedido de uma data (D33): a data do catálogo decide o texto, o dia
         * (a próxima vez que ela cai) e o fim do recebimento (o próprio dia).
         */
        const dataId = b && typeof b.dataId === 'string' && F.PEDIDOS_DE_DATA[b.dataId] ? b.dataId : '';
        const dataAlvo = dataId ? F.proximaData(dataId) : '';
        if (dataId && !dataAlvo) return sendJson(res, 400, { error: 'data não encontrada' });
        // "Semanas antes dos eventos": recebe das 3 semanas antes até o dia (o RH muda se quiser).
        const tresSemanasAntes = dataAlvo ? F.somarDias(dataAlvo, -21) : '';
        const inicioDaData = tresSemanasAntes > F.hojeIso() ? tresSemanasAntes : F.hojeIso();
        const p = pedidoDe(Object.assign({}, dataId ? { titulo: F.PEDIDOS_DE_DATA[dataId], inicio: inicioDaData, fim: dataAlvo } : {}, b || {}));
        let codigo = muralLib.novoCodigo(6);
        for (let i = 0; i < 5 && (await db.pedidoFotoPorCodigo(codigo)); i++) codigo = muralLib.novoCodigo(6);
        const pedido = await db.criarPedidoFoto(t, Object.assign(p, { codigo, tipo: dataId ? 'data' : 'perfil', dataId, dataAlvo }));
        avisar(t);
        return sendJson(res, 200, { pedido });
      });
    }
    if (parts[2] === 'fotos' && parts[3] && req.method === 'POST' && (parts[4] === 'aprovar' || parts[4] === 'recusar')) {
      const f = await db.fotoPessoaPorId(parts[3], t);
      if (!f) return sendJson(res, 404, { error: 'foto não encontrada' });
      if (parts[4] === 'recusar') { await recusar(t, f); avisar(t); return sendJson(res, 200, { ok: true }); }
      // Foto de uma data (D33): fica, aprovada, no mural da data — não vira a foto da pessoa.
      const doPedido = await db.pedidoFotoPorId(f.pedidoId, t);
      if (doPedido && doPedido.tipo === 'data') {
        await db.aprovarFotoPessoa(f.id, t);
        avisar(t);
        return sendJson(res, 200, { ok: true });
      }
      const pessoa = f.pessoaId ? await db.pessoaDoTenant(t, f.pessoaId) : null;
      let pessoaId = pessoa && pessoa.id;
      if (pessoa) await db.atualizarPessoa(t, pessoa.id, Object.assign({}, pessoa, { foto: f.url }));
      else {
        const p = P.normalizar({ nome: f.nome, dia: f.dia, mes: f.mes, setor: f.setor, email: f.email, foto: f.url });
        if (!p) return sendJson(res, 400, { error: 'a foto chegou sem nome ou aniversário' });
        pessoaId = await db.criarPessoa(t, p, 'qr');
      }
      // O aceite da página vai com a pessoa (D35 parte daqui: consentimento por pessoa).
      if (f.aceiteEm) await db.marcarConsentimento(t, pessoaId, f.aceiteEm);
      await db.removerFotoPessoa(f.id, t);
      return sendJson(res, 200, { ok: true });
    }
    const pedido = parts[2] && parts[2] !== 'fotos' ? await db.pedidoFotoPorId(parts[2], t) : null;
    if (pedido && req.method === 'PUT') {
      return readBody(req, res, async (b) => {
        await db.atualizarPedidoFoto(pedido.id, t, pedidoDe(b || {}, pedido));
        avisar(t);
        return sendJson(res, 200, { pedido: await db.pedidoFotoPorId(pedido.id, t) });
      });
    }
    if (pedido && req.method === 'DELETE') {
      for (const f of (await db.listarFotosPessoa(t)).filter((x) => x.pedidoId === pedido.id)) await recusar(t, f);
      await db.removerPedidoFoto(pedido.id, t);
      avisar(t);
      return sendJson(res, 200, { ok: true });
    }
    return sendJson(res, 404, { error: 'não encontrado' });
  }

  return async function (req, res, parts, query, sess) {
    if (parts[1] !== 'fotoqr') return false;
    if (parts[2] && /^[A-Za-z0-9]{4,12}$/.test(parts[2]) && ['codigo', 'entrar', 'foto'].includes(parts[3]) && req.method === 'POST' && parts.length === 4) {
      await publica(req, res, parts, query);
      return true;
    }
    if (!sess) { sendJson(res, 401, { error: 'não autenticado' }); return true; }
    if (!canManageTeam(sess.role)) { sendJson(res, 403, { error: 'sem permissão' }); return true; }
    await painel(req, res, parts, sess);
    return true;
  };
};
