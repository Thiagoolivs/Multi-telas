/*
 * /api/planilhas — preço e cardápio vindos de uma planilha (fase 11).
 *
 *   GET    /api/planilhas                 as planilhas da conta, com os itens lidos
 *   POST   /api/planilhas                 liga uma { nome, link } ou { nome, csv } e lê na hora
 *   PUT    /api/planilhas/:id             troca o nome, o link ou o arquivo
 *   POST   /api/planilhas/:id/atualizar   lê agora (o "Atualizar agora")
 *   DELETE /api/planilhas/:id             desliga (as peças na TV ficam com o texto digitado)
 *
 * A TV lê por GET /api/devices/:id/planilhas (server/routes/telas.js), com o
 * token da TV, e o servidor avisa pelo SSE ('planilhas') quando os itens
 * mudam. Ler e mexer é de quem é da conta (dono, administrador, membro),
 * como mexer no que passa na TV.
 *
 * As regras — o link, o CSV, os hosts que podem — moram em server/planilha.js.
 */
const P = require('../planilha');

const MAX_POR_CONTA = 10;

module.exports = function (ctx) {
  const { db, sendJson, readBody, rateLimit, avisarTelas } = ctx;
  const corta = (s, n) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim().slice(0, n);
  const avisar = (t) => avisarTelas(t, 'planilhas', {}).catch(() => {});
  // Quem é da conta (dono, administrador, membro) muda preço, como muda o que passa na TV.
  // Fase 13: o membro que precisa de aprovação ou só vê algumas lojas não troca a planilha
  // (ela vale para as TVs da conta inteira, e mudaria a TV sem passar pelo dono).
  const podeMexer = (sess) => sess.role === 'owner' || sess.role === 'admin'
    || (sess.role === 'member' && !sess.precisaAprovar && !Array.isArray(sess.lojas));

  // Sem o CSV cru e sem o endereço interno: o painel vê o que foi lido.
  const publica = (p) => (p ? {
    id: p.id, nome: p.nome, origem: p.origem, link: p.link, itens: p.itens, aviso: p.aviso,
    ultimoOk: p.ultimoOk, ultimoErro: p.ultimoErro, criadoEm: p.criadoEm,
  } : null);
  const umaDa = async (t, id) => publica((await db.listarPlanilhas(t)).find((x) => x.id === id));

  // O que a pessoa mandou → os campos (o link convertido ou o arquivo conferido).
  function fonteDe(b) {
    if (typeof b.csv === 'string' && b.csv.trim()) {
      if (Buffer.byteLength(b.csv, 'utf8') > P.LIMITE_BYTES) return { erro: 'o arquivo passou de ' + Math.round(P.LIMITE_BYTES / 1024) + ' KB. Deixe só os itens que vão para a TV' };
      return { campos: { origem: 'csv', csv: b.csv, link: '', url: '' } };
    }
    if (b.link !== undefined) {
      const conv = P.linkParaCsv(b.link);
      if (conv.erro) return { erro: conv.erro };
      return { campos: { origem: 'google', link: corta(b.link, 500), url: conv.url, csv: '' } };
    }
    return { campos: {} };
  }

  async function lerAgora(t, id) {
    const linha = await db.planilhaInterna(id, t);
    const r = await P.atualizarAgora(linha, { db });
    if (!r.erro && r.mudou) avisar(t);
    return r;
  }

  return async function (req, res, parts, query, sess) {
    if (parts[1] !== 'planilhas') return false;
    if (!sess) { sendJson(res, 401, { error: 'não autenticado' }); return true; }
    const t = sess.tenant_id;
    const id = parts[2];
    if (parts.length > 4) { sendJson(res, 404, { error: 'não encontrado' }); return true; }

    if (!id && req.method === 'GET') {
      sendJson(res, 200, { planilhas: (await db.listarPlanilhas(t)).map(publica), intervaloMin: Math.round(P.INTERVALO_MS / 60000) });
      return true;
    }
    if (!podeMexer(sess)) { sendJson(res, 403, { error: 'sem permissão' }); return true; }

    // Cada leitura sai do nosso servidor para o Google: com teto, como os testes de indicador.
    const limite = () => {
      const rl = rateLimit('planilha:' + t, 40, 60 * 60 * 1000);
      if (!rl.ok) sendJson(res, 429, { error: 'Muitas leituras agora. Espere ' + Math.ceil(rl.retryAfter / 60) + ' min e tente de novo.' }, { 'Retry-After': String(rl.retryAfter) });
      return rl.ok;
    };

    if (!id && req.method === 'POST') {
      readBody(req, res, async (b) => {
        if (!b) return sendJson(res, 400, { error: 'pedido inválido' });
        if ((await db.listarPlanilhas(t)).length >= MAX_POR_CONTA) return sendJson(res, 400, { error: 'no máximo ' + MAX_POR_CONTA + ' planilhas por conta' });
        const { campos, erro } = fonteDe(b);
        if (erro) return sendJson(res, 400, { error: erro });
        if (!campos.origem) return sendJson(res, 400, { error: 'cole o link da planilha ou envie o arquivo CSV' });
        if (!limite()) return;
        const linha = await db.criarPlanilha(t, Object.assign({ nome: corta(b.nome, 60) || 'Preços' }, campos));
        await db.registrarEvento(t, sess.user_id, 'planilha.ligar').catch(() => {});
        const r = await lerAgora(t, linha.id);
        return sendJson(res, 200, Object.assign({ planilha: await umaDa(t, linha.id) }, r.erro ? { erro: r.erro } : {}));
      });
      return true;
    }

    const linha = id ? await db.planilhaInterna(id, t) : null;
    if (!linha) { sendJson(res, 404, { error: 'planilha não encontrada' }); return true; }

    if (!parts[3] && req.method === 'PUT') {
      readBody(req, res, async (b) => {
        if (!b) return sendJson(res, 400, { error: 'pedido inválido' });
        const { campos, erro } = fonteDe(b);
        if (erro) return sendJson(res, 400, { error: erro });
        if (b.nome !== undefined) campos.nome = corta(b.nome, 60) || linha.nome;
        const fonteNova = campos.origem !== undefined;
        if (fonteNova && !limite()) return;
        await db.atualizarPlanilha(linha.id, t, campos);
        const r = fonteNova ? await lerAgora(t, linha.id) : {};
        return sendJson(res, 200, Object.assign({ planilha: await umaDa(t, linha.id) }, r.erro ? { erro: r.erro } : {}));
      });
      return true;
    }
    if (parts[3] === 'atualizar' && req.method === 'POST') {
      if (!limite()) return true;
      const r = await lerAgora(t, linha.id);
      sendJson(res, 200, Object.assign({ planilha: await umaDa(t, linha.id) }, r.erro ? { erro: r.erro } : {}));
      return true;
    }
    if (!parts[3] && req.method === 'DELETE') {
      await db.removerPlanilha(linha.id, t);
      avisar(t);
      sendJson(res, 200, { ok: true });
      return true;
    }
    sendJson(res, 405, { error: 'método inválido' });
    return true;
  };
};

/*
 * O relógio (server.js chama uma vez, depois do banco): a cada minuto, as
 * planilhas do Google que venceram os 5 minutos, no máximo 20 por volta. A
 * próxima busca é marcada ANTES, para dois relógios não buscarem a mesma; a
 * TV só é avisada quando algum item mudou.
 */
module.exports.ligarRelogio = function ({ db, avisarTelas, erros }) {
  const volta = async () => {
    try {
      const agora = Date.now();
      for (const linha of (await db.planilhasParaBuscar(agora)).slice(0, 20)) {
        await db.atualizarPlanilha(linha.id, linha.tenant_id, { proxima: agora + 60000 });
        const r = await P.atualizarAgora(linha, { db, agora });
        if (!r.erro && r.mudou) avisarTelas(linha.tenant_id, 'planilhas', {}).catch(() => {});
      }
    } catch (e) { erros.registrar(e, { onde: 'planilhas de preço' }); }
  };
  setInterval(volta, 60 * 1000).unref();
  return volta;
};
