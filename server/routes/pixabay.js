/*
 * /api/pixabay — o banco de imagens externo (EXECUTOR D37).
 *
 *   GET  /api/pixabay/estado          { configurado } — o painel mostra a aba só com a chave
 *   GET  /api/pixabay?q=&tipo=&orientacao=&pagina=   a busca (cache de 24 h)
 *   POST /api/pixabay/usar  { id }    baixa para as Mídias da conta, com o crédito
 */
const pixabay = require('../pixabay');

module.exports = function (ctx) {
  const { db, sendJson, readBody, rateLimit, midia, erros } = ctx;

  return async function (req, res, parts, query, sess) {
    if (parts[1] !== 'pixabay') return false;
    if (!sess) { sendJson(res, 401, { error: 'não autenticado' }); return true; }
    const t = sess.tenant_id;
    if (parts[2] === 'estado' && req.method === 'GET') { sendJson(res, 200, { configurado: pixabay.configurado() }); return true; }
    if (!pixabay.configurado()) { sendJson(res, 503, { error: 'o banco de imagens não está ligado neste servidor' }); return true; }

    if (!parts[2] && req.method === 'GET') {
      const rl = rateLimit('pixabay:busca:' + t, 120, 60 * 60 * 1000);
      if (!rl.ok) { sendJson(res, 429, { error: 'muitas buscas agora — espere um pouco' }, { 'Retry-After': String(rl.retryAfter) }); return true; }
      if (!String(query.q || '').trim()) { sendJson(res, 400, { error: 'diga o que procurar' }); return true; }
      const r = await pixabay.buscar(query.q, { tipo: query.tipo, orientacao: query.orientacao, pagina: query.pagina });
      sendJson(res, r.erro ? 502 : 200, r.erro ? { error: r.erro } : r);
      return true;
    }

    if (parts[2] === 'usar' && req.method === 'POST') {
      const rl = rateLimit('pixabay:usar:' + t, 60, 60 * 60 * 1000);
      if (!rl.ok) { sendJson(res, 429, { error: 'muitas fotos agora — espere um pouco' }, { 'Retry-After': String(rl.retryAfter) }); return true; }
      readBody(req, res, async (b) => {
        const r = await pixabay.baixar(b && b.id);
        if (r.erro) return sendJson(res, 502, { error: r.erro });
        try {
          // O crédito vai no nome da mídia: aparece em Mídias e volta junto da URL.
          const salvo = await midia.guardarBuffer(db, t, r.bytes, r.mime, { nome: r.credito, origem: 'pixabay' });
          return sendJson(res, 200, { url: salvo.url, credito: r.credito, pagina: r.pagina });
        } catch (e) {
          erros.registrar(e, { onde: 'banco de imagens' });
          return sendJson(res, 500, { error: 'não deu para guardar a foto' });
        }
      });
      return true;
    }
    sendJson(res, 404, { error: 'não encontrado' });
    return true;
  };
};
