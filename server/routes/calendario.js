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
 *
 * Com a aprovação ligada (fase 13; lote de 06/11), o membro não põe a data
 * na TV: o envio virou pedido. O "aplicado" dele não marca a data como
 * posta; a data entra no pedido que a leva (PUT responde 202) e só fica
 * posta quando o dono aprova (server/aprovacao.js). A lista diz, de cada
 * data com pedido, se ela espera aprovação ou se a mudança foi recusada
 * (com o motivo) — o estado vem daqui, não do painel.
 *
 * Fase 13: o membro de uma loja (server/permissoes.js) só vê as datas que
 * passam nas TVs dele, e só grava, muda ou apaga a data que fica inteira nas
 * lojas dele. O "todas as TVs" dele vira "as lojas dele" (alvo `grupos`):
 * sem isso, a data dele ia para as outras lojas quando o dono mexesse nela.
 * As TVs em si já são barradas em /api/lote; aqui é a lista.
 */
const C = require('../calendario');
const P = require('../../js/peca-html.js');
const permissoes = require('../permissoes');
const aprovacao = require('../aprovacao');

module.exports = function (ctx) {
  const { db, sendJson, readBody, canManageTeam } = ctx;

  // As datas com o estado do pedido de cada uma (esperando, recusada…). Sem conseguir ler os pedidos, a lista sai como antes.
  async function comPedidos(sess, eventos) {
    const pedidos = await db.listarAprovacoes(sess.tenant_id, { limite: 100 }).catch(() => []);
    return aprovacao.situacaoDasDatas(eventos, pedidos, (p) => canManageTeam(sess.role) || p.autorId === sess.user_id);
  }

  // A peça do evento passa pela mesma porta da TV antes de ser guardada.
  function itemValido(item) {
    if (!item || item.type !== 'peca-html') return null;
    const v = P.validarItem(item);
    return v.ok ? Object.assign({}, item, v.item) : null;
  }
  const telasValidas = (t) => (Array.isArray(t) ? t.map(String).filter((x) => /^[A-Za-z0-9_-]{1,64}$/.test(x)).slice(0, 200) : undefined);

  /*
   * O alcance do membro de uma loja: as TVs dele (ids). null = sem regra (vê e muda tudo).
   * `dele`: a data fica inteira nas lojas dele (o alvo e as TVs em que entrou).
   * `toca`: a data passa em alguma TV dele (é o que ele vê na lista).
   */
  async function alcanceDe(sess) {
    if (!permissoes.restrito(sess)) return null;
    const minhas = new Set(permissoes.filtrar(sess, await db.listDevices(sess.tenant_id)).map((d) => d.id));
    const alvoDele = (a) => {
      if (!a || a.tipo === 'todas') return false;
      if (a.tipo === 'grupo') return permissoes.podeGrupo(sess, a.nome);
      if (a.tipo === 'grupos') return a.nomes.length > 0 && a.nomes.every((g) => permissoes.podeGrupo(sess, g));
      if (a.tipo === 'telas') return a.ids.every((id) => minhas.has(id));
      return false;
    };
    const dele = (ev) => alvoDele(ev.alvo) && (ev.telas || []).every((id) => minhas.has(id));
    const toca = (ev) => {
      const a = ev.alvo || { tipo: 'todas' };
      return a.tipo === 'todas' || (a.tipo === 'grupo' && permissoes.podeGrupo(sess, a.nome))
        || (a.tipo === 'grupos' && a.nomes.some((g) => permissoes.podeGrupo(sess, g)))
        || (a.tipo === 'telas' && a.ids.some((id) => minhas.has(id)))
        || (ev.telas || []).some((id) => minhas.has(id));
    };
    return { minhas, dele, toca };
  }
  const RECUSA_LOJA = { error: 'Esta data vale também para TVs de outras lojas. Quem muda é o dono ou um administrador.', code: 'loja' };

  /*
   * O que vai ser gravado, já conferido para o membro de uma loja: o "todas" vira as lojas dele;
   * o resto precisa ficar nas lojas dele, e a data que já existe também (senão, null).
   */
  async function conferir(sess, alc, e, id) {
    const ev = C.normalizar(e);
    if (!ev) return { ev: null };
    const telas = telasValidas(e.telas);
    if (!alc) return { ev, telas };
    if (ev.alvo.tipo === 'todas') ev.alvo = { tipo: 'grupos', nomes: sess.lojas.slice() };
    const antes = id ? await db.eventoDoCalendario(id, sess.tenant_id) : null;
    if (antes && !alc.dele(antes)) return { negado: true };
    if (!alc.dele({ alvo: ev.alvo, telas: telas !== undefined ? telas : (antes ? antes.telas : []) })) return { negado: true };
    return { ev, telas };
  }

  function gravar(sess, c, e, id) {
    if (!c.ev) return null;
    // Com a aprovação ligada, "aplicado" do membro é só o pedido: a data fica posta quando o dono aprovar (aprovacao.aplicarExtra).
    const pos = e.aplicado === true && !sess.precisaAprovar;
    return db.salvarEvento(sess.tenant_id, Object.assign(c.ev, {
      item: itemValido(e.item), telas: c.telas, aplicadoEm: pos ? Date.now() : (e.aplicado === false ? 0 : null),
    }), id);
  }

  return async function (req, res, parts, query, sess) {
    if (parts[1] !== 'calendario') return false;
    if (!sess) { sendJson(res, 401, { error: 'não autenticado' }); return true; }
    const id = parts[2];
    if (parts.length > 3) { sendJson(res, 404, { error: 'não encontrado' }); return true; }

    if (!id && req.method === 'GET') {
      const eventos = await comPedidos(sess, await db.listarCalendario(sess.tenant_id));
      const alc = await alcanceDe(sess);
      if (!alc) { sendJson(res, 200, { eventos }); return true; }
      // O membro de uma loja: só as datas que passam nas TVs dele, sem os ids das TVs dos outros.
      sendJson(res, 200, {
        lojas: sess.lojas,
        eventos: eventos.filter(alc.toca).map((ev) => Object.assign({}, ev, { telas: (ev.telas || []).filter((x) => alc.minhas.has(x)), podeMudar: alc.dele(ev) })),
      });
      return true;
    }
    if (!id && req.method === 'POST') {
      readBody(req, res, async (b) => {
        const lista = (Array.isArray(b && b.eventos) ? b.eventos : []).slice(0, 100);
        const alc = await alcanceDe(sess);
        // Tudo ou nada: uma data fora das lojas dele recusa a lista inteira, antes de gravar.
        const conferidos = [];
        for (const e of lista) {
          const eid = e && typeof e.id === 'string' ? e.id : undefined;
          const c = await conferir(sess, alc, e || {}, eid);
          if (c.negado) return sendJson(res, 403, RECUSA_LOJA);
          conferidos.push([c, e || {}, eid]);
        }
        const salvos = [];
        for (const [c, e, eid] of conferidos) {
          const s = await gravar(sess, c, e, eid);
          if (s) salvos.push(s);
        }
        await db.registrarEvento(sess.tenant_id, sess.user_id, 'calendario.salvar');
        return sendJson(res, 200, { eventos: salvos, recusados: lista.length - salvos.length });
      });
      return true;
    }
    if (id && req.method === 'PUT') {
      const antes = await db.eventoDoCalendario(id, sess.tenant_id);
      const alc = await alcanceDe(sess);
      if (!antes || (alc && !alc.toca(antes))) { sendJson(res, 404, { error: 'evento não encontrado' }); return true; }
      readBody(req, res, async (b) => {
        const c = await conferir(sess, alc, b || {}, id);
        if (c.negado) return sendJson(res, 403, RECUSA_LOJA);
        const s = await gravar(sess, c, b || {}, id);
        if (!s) return sendJson(res, 400, { error: 'o evento precisa de data e título' });
        // O membro com aprovação: a data espera junto com o pedido que leva a peça dela (202, como a campanha).
        if (sess.precisaAprovar && b && b.aplicado === true) {
          const pedido = await aprovacao.anexarCalendario(db, sess, id);
          if (pedido) {
            const aprov = { id: pedido.id, estado: 'pendente' };
            return sendJson(res, 202, { evento: Object.assign({}, s, { aprovacao: aprov }), esperandoAprovacao: true, aprovacao: aprov });
          }
        }
        return sendJson(res, 200, { evento: s });
      });
      return true;
    }
    if (id && req.method === 'DELETE') {
      const alc = await alcanceDe(sess);
      if (alc) {
        const antes = await db.eventoDoCalendario(id, sess.tenant_id);
        if (!antes || !alc.toca(antes)) { sendJson(res, 404, { error: 'evento não encontrado' }); return true; }
        if (!alc.dele(antes)) { sendJson(res, 403, RECUSA_LOJA); return true; }
      }
      const ok = await db.removerEvento(id, sess.tenant_id);
      sendJson(res, ok ? 200 : 404, ok ? { ok: true } : { error: 'evento não encontrado' });
      return true;
    }
    sendJson(res, 405, { error: 'método inválido' });
    return true;
  };
};
