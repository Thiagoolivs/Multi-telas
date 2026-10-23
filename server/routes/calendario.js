/*
 * /api/calendario — o calendário da empresa (EXECUTOR D23).
 *
 *   GET    /api/calendario        os eventos da conta, por data
 *   POST   /api/calendario        grava a lista revisada (novos e editados)
 *   PUT    /api/calendario/:id    edita um evento (e marca as TVs em que entrou)
 *   DELETE /api/calendario/:id    apaga o evento (o painel tira da TV antes)
 *
 * Quem lê o texto colado é /api/ai/calendario (server.js, medido e com teto).
 * Quem põe a peça nas TVs é o painel, com versão (gravarNaTela), como as
 * campanhas: aqui fica a lista, para ser "programado e editável".
 */
const C = require('../calendario');
const P = require('../../js/peca-html.js');

module.exports = function (ctx) {
  const { db, sendJson, readBody } = ctx;

  // A peça do evento passa pela mesma porta da TV antes de ser guardada.
  function itemValido(item) {
    if (!item || item.type !== 'peca-html') return null;
    const v = P.validarItem(item);
    return v.ok ? Object.assign({}, item, v.item) : null;
  }
  const telasValidas = (t) => (Array.isArray(t) ? t.map(String).filter((x) => /^[A-Za-z0-9_-]{1,64}$/.test(x)).slice(0, 200) : undefined);

  async function gravar(sess, e, id) {
    const ev = C.normalizar(e);
    if (!ev) return null;
    return db.salvarEvento(sess.tenant_id, Object.assign(ev, {
      item: itemValido(e.item), telas: telasValidas(e.telas), aplicadoEm: e.aplicado === true ? Date.now() : (e.aplicado === false ? 0 : null),
    }), id);
  }

  return async function (req, res, parts, query, sess) {
    if (parts[1] !== 'calendario') return false;
    if (!sess) { sendJson(res, 401, { error: 'não autenticado' }); return true; }
    const id = parts[2];
    if (parts.length > 3) { sendJson(res, 404, { error: 'não encontrado' }); return true; }

    if (!id && req.method === 'GET') {
      sendJson(res, 200, { eventos: await db.listarCalendario(sess.tenant_id) });
      return true;
    }
    if (!id && req.method === 'POST') {
      readBody(req, res, async (b) => {
        const lista = (Array.isArray(b && b.eventos) ? b.eventos : []).slice(0, 100);
        const salvos = [];
        for (const e of lista) {
          const s = await gravar(sess, e || {}, e && typeof e.id === 'string' ? e.id : undefined);
          if (s) salvos.push(s);
        }
        await db.registrarEvento(sess.tenant_id, sess.user_id, 'calendario.salvar');
        return sendJson(res, 200, { eventos: salvos, recusados: lista.length - salvos.length });
      });
      return true;
    }
    if (id && req.method === 'PUT') {
      if (!(await db.eventoDoCalendario(id, sess.tenant_id))) { sendJson(res, 404, { error: 'evento não encontrado' }); return true; }
      readBody(req, res, async (b) => {
        const s = await gravar(sess, b || {}, id);
        if (!s) return sendJson(res, 400, { error: 'o evento precisa de data e título' });
        return sendJson(res, 200, { evento: s });
      });
      return true;
    }
    if (id && req.method === 'DELETE') {
      const ok = await db.removerEvento(id, sess.tenant_id);
      sendJson(res, ok ? 200 : 404, ok ? { ok: true } : { error: 'evento não encontrado' });
      return true;
    }
    sendJson(res, 405, { error: 'método inválido' });
    return true;
  };
};
