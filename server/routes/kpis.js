/*
 * /api/kpis — os indicadores da empresa (EXECUTOR D36).
 *
 * Pública (o conector PUSH; o token é a credencial):
 *   POST /api/kpis/entrada                 Authorization: Bearer <token>   { indicadores | objeto }
 * Do painel:
 *   GET    /api/kpis                        conectores (sem segredo) e indicadores
 *   POST   /api/kpis/conectores             cria (push devolve o token UMA vez)
 *   PUT    /api/kpis/conectores/:id         edita (o segredo só se vier um novo)
 *   POST   /api/kpis/conectores/:id/token   token novo (o antigo para de valer)
 *   POST   /api/kpis/conectores/:id/testar  busca agora (pull) e mostra o que veio
 *   DELETE /api/kpis/conectores/:id         apaga, com os indicadores dele
 * Mexer é do dono e dos admins; ler, de qualquer pessoa da conta.
 */
const crypto = require('crypto');
const K = require('../kpis');
const segredo = require('../segredo');

module.exports = function (ctx) {
  const { db, sendJson, readBody, rateLimit, site, canManageTeam, avisarTelas, baseUrl } = ctx;
  const hash = (t) => crypto.createHash('sha256').update(String(t)).digest('hex');
  const novoToken = () => 'mtk_' + crypto.randomBytes(24).toString('base64url');
  const corta = (s, n) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim().slice(0, n);
  const avisar = (t) => avisarTelas(t, 'kpis', {}).catch(() => {});

  // O que o painel pode mudar num conector (o segredo, cifrado, só se vier um novo).
  function camposDe(b, modo) {
    const c = {};
    if (b.nome !== undefined) c.nome = corta(b.nome, 60) || 'Indicadores';
    if (modo !== 'pull') return { campos: c };
    if (b.url !== undefined) {
      const url = corta(b.url, 500);
      if (url && !/^https?:\/\//i.test(url)) return { erro: 'o endereço precisa começar com https://' };
      c.url = url;
    }
    if (b.authTipo !== undefined) c.authTipo = K.AUTH.includes(b.authTipo) ? b.authTipo : 'nenhum';
    if (b.authNome !== undefined) c.authNome = corta(b.authNome, 40);
    if (b.mapa !== undefined) c.mapa = K.mapaLimpo(b.mapa);
    if (b.intervaloMin !== undefined) c.intervaloMin = Math.max(K.INTERVALO_MIN, Math.min(24 * 60, Number(b.intervaloMin) || 15));
    if (typeof b.segredo === 'string' && b.segredo) {
      if (!segredo.disponivel()) return { erro: 'o cofre de senhas não está ligado neste servidor — fale com o suporte' };
      c.authSegredo = segredo.cifrar(b.segredo.slice(0, 2000));
    }
    if (b.limparSegredo === true) c.authSegredo = '';
    // Senha não anda em http: o ERP do cliente não pode ter a porta aberta no caminho.
    const url = c.url !== undefined ? c.url : b.urlAtual;
    if (url && /^http:\/\//i.test(url) && ((c.authTipo || b.authTipoAtual || 'nenhum') !== 'nenhum')) return { erro: 'com autenticação, o endereço precisa ser https://' };
    return { campos: c };
  }

  async function entrada(req, res) {
    const bruto = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '') || String(req.headers['x-token'] || '');
    const conector = bruto ? await db.conectorPorToken(hash(bruto.trim())) : null;
    if (!conector) return sendJson(res, 401, { error: 'token inválido' });
    const rl = rateLimit('kpi:push:' + conector.id, 240, 60 * 60 * 1000);
    if (!rl.ok) return sendJson(res, 429, { error: 'muitos envios — no máximo 4 por minuto' }, { 'Retry-After': String(rl.retryAfter) });
    return readBody(req, res, async (b) => {
      const lista = K.daEntrada(b);
      if (!lista.length) return sendJson(res, 400, { error: 'nenhum indicador (cada um precisa de chave ou nome, e valor)' });
      const agora = Date.now();
      await db.gravarIndicadores(conector.tenantId, conector.id, lista, agora);
      await db.atualizarConector(conector.id, conector.tenantId, { ultimoOk: agora, ultimoErro: '' });
      avisar(conector.tenantId);
      return sendJson(res, 200, { ok: true, recebidos: lista.length });
    });
  }

  async function painel(req, res, parts, sess) {
    const t = sess.tenant_id;
    if (parts.length === 2 && req.method === 'GET') {
      return sendJson(res, 200, {
        conectores: await db.listarConectores(t), indicadores: await db.listarIndicadores(t),
        segredosProntos: segredo.disponivel(), entrada: baseUrl(req) + '/api/kpis/entrada',
      });
    }
    if (!canManageTeam(sess.role)) return sendJson(res, 403, { error: 'sem permissão' });
    if (parts[2] !== 'conectores') return sendJson(res, 404, { error: 'não encontrado' });
    const id = parts[3];
    if (!id && req.method === 'POST') {
      return readBody(req, res, async (b) => {
        const modo = b && b.modo === 'pull' ? 'pull' : 'push';
        if ((await db.listarConectores(t)).length >= 10) return sendJson(res, 400, { error: 'no máximo 10 conectores por conta' });
        const { campos, erro } = camposDe(Object.assign({ nome: '' }, b || {}), modo);
        if (erro) return sendJson(res, 400, { error: erro });
        const token = modo === 'push' ? novoToken() : '';
        const conector = await db.criarConector(t, Object.assign(campos, { modo, tokenHash: token ? hash(token) : '' }));
        await db.registrarEvento(t, sess.user_id, 'kpis.conector').catch(() => {});
        return sendJson(res, 200, Object.assign({ conector }, token ? { token } : {}));
      });
    }
    const linha = id ? await db.conectorInterno(id, t) : null;
    if (!linha) return sendJson(res, 404, { error: 'conector não encontrado' });
    if (!parts[4] && req.method === 'PUT') {
      return readBody(req, res, async (b) => {
        const { campos, erro } = camposDe(Object.assign({}, b || {}, { urlAtual: linha.url, authTipoAtual: linha.auth_tipo }), linha.modo);
        if (erro) return sendJson(res, 400, { error: erro });
        // Endereço ou autenticação novos: busca na próxima volta, sem esperar o intervalo.
        if (campos.url !== undefined || campos.authSegredo !== undefined || campos.authTipo !== undefined) campos.proxima = 0;
        await db.atualizarConector(linha.id, t, campos);
        return sendJson(res, 200, { conector: (await db.listarConectores(t)).find((c) => c.id === linha.id) });
      });
    }
    if (parts[4] === 'token' && req.method === 'POST') {
      if (linha.modo !== 'push') return sendJson(res, 400, { error: 'só o conector que recebe tem token' });
      const token = novoToken();
      await db.atualizarConector(linha.id, t, { tokenHash: hash(token) });
      return sendJson(res, 200, { token });
    }
    if (parts[4] === 'testar' && req.method === 'POST') {
      if (linha.modo !== 'pull' || !linha.url) return sendJson(res, 400, { error: 'diga o endereço primeiro' });
      const rl = rateLimit('kpi:teste:' + t, 30, 60 * 60 * 1000);
      if (!rl.ok) return sendJson(res, 429, { error: 'muitos testes agora — espere um pouco' });
      const r = await K.buscarAgora(linha, { db, site, segredo });
      if (!r.erro) avisar(t);
      return sendJson(res, r.erro ? 502 : 200, r.erro ? { error: r.erro } : { indicadores: r.lista });
    }
    if (!parts[4] && req.method === 'DELETE') {
      await db.removerConector(linha.id, t);
      avisar(t);
      return sendJson(res, 200, { ok: true });
    }
    return sendJson(res, 405, { error: 'método inválido' });
  }

  return async function (req, res, parts, query, sess) {
    if (parts[1] !== 'kpis') return false;
    if (parts[2] === 'entrada' && req.method === 'POST' && parts.length === 3) { await entrada(req, res); return true; }
    if (!sess) { sendJson(res, 401, { error: 'não autenticado' }); return true; }
    await painel(req, res, parts, sess);
    return true;
  };
};
