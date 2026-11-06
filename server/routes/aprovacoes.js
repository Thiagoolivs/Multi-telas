/*
 * server/routes/aprovacoes.js — a fila de aprovação e as lojas da equipe
 * (fase 13: equipe e redes). As regras moram em server/aprovacao.js e
 * server/permissoes.js; aqui ficam a sessão, o papel e as respostas.
 *
 *   GET    /api/aprovacoes             a fila (dono/admin) ou os meus pedidos (membro)
 *   GET    /api/aprovacoes/contagem    o número do sino, leve
 *   GET    /api/aprovacoes/:id         um pedido, com o antes e o depois de cada TV
 *   POST   /api/aprovacoes/:id/aprovar[?porCima=1]  põe no ar (com a versão conferida)
 *   POST   /api/aprovacoes/:id/recusar { motivo }   o membro vê o porquê
 *   DELETE /api/aprovacoes/:id         quem pediu desiste (enquanto espera)
 *   POST   /api/aprovacoes/vistas      o membro viu as respostas (o sino zera)
 *   PUT    /api/aprovacoes/regra       { ligada } liga ou desliga a aprovação (dono/admin)
 *
 *   GET    /api/lojas                  as lojas (grupos) e quem alcança quais
 *   PUT    /api/lojas/:userId          { grupos: [...] | null } (null = todas as TVs)
 */
'use strict';

const aprovacao = require('../aprovacao.js');
const permissoes = require('../permissoes.js');

module.exports = function (ctx) {
  const { db, sendJson, readBody, canManageTeam } = ctx;

  const PALAVRA = { aprovada: 'aprovado', recusada: 'recusado', substituida: 'trocado por um pedido mais novo', cancelada: 'cancelado', aplicando: 'aprovado agora há pouco' };

  async function contaLigada(tenantId) {
    const t = await db.getTenant(tenantId).catch(() => null);
    return !!(t && Number(t.aprovacao));
  }

  async function contagem(sess) {
    if (canManageTeam(sess.role)) return { n: await db.contarAprovacoes(sess.tenant_id), souRevisor: true };
    return { n: await db.contarAprovacoes(sess.tenant_id, { naoVistasDe: sess.user_id }), souRevisor: false };
  }

  async function aprovar(res, sess, id, porCima) {
    const pedido = await db.lerAprovacao(id, sess.tenant_id);
    if (!pedido) return sendJson(res, 404, { error: 'pedido não encontrado' });
    if (pedido.estado !== 'pendente') return sendJson(res, 409, { error: 'Este pedido já foi ' + (PALAVRA[pedido.estado] || pedido.estado) + '.', code: 'ja-decidido', estado: pedido.estado });
    // Dois revisores ao mesmo tempo: só um pega o pedido.
    if (!(await db.mudarEstadoDaAprovacao(id, sess.tenant_id, 'pendente', 'aplicando'))) {
      return sendJson(res, 409, { error: 'Outra pessoa acabou de decidir este pedido.', code: 'ja-decidido' });
    }
    const voltar = () => db.mudarEstadoDaAprovacao(id, sess.tenant_id, 'aplicando', 'pendente').catch(() => false);
    try {
      /*
       * Pelo MESMO caminho do envio em lote: posse, a porta das peças e a
       * versão de cada TV. Sem `porCima`, a versão é a que o membro leu — se
       * alguém mexeu na TV depois do pedido, nada é atropelado (409) e o
       * revisor decide. Com `porCima`, confere contra a versão de agora
       * (ainda atômico: quem gravar neste instante não é apagado).
       */
      const itens = (pedido.itens || []).map((i) => ({ id: i.id, config: i.config, versao: porCima ? null : i.versao }));
      const conferido = await ctx.publicar.conferirLote(sess, itens);
      if (!conferido.prontos) {
        await voltar();
        if (conferido.status === 409) {
          return sendJson(res, 409, { error: 'A TV mudou depois deste pedido. Veja o antes e o depois: dá para pôr por cima ou recusar.', code: 'config-mudou', telas: conferido.corpo.telas });
        }
        return sendJson(res, conferido.status, conferido.corpo);
      }
      const r = await ctx.publicar.aplicarLote(sess.tenant_id, sess.user_id, conferido.prontos, ('Aprovado: ' + pedido.descricao).slice(0, 120));
      if (r.status !== 200) { await voltar(); return sendJson(res, r.status, r.corpo); }
      await db.mudarEstadoDaAprovacao(id, sess.tenant_id, 'aplicando', 'aprovada', {
        revisorId: sess.user_id, revisorNome: sess.name || sess.email || '', decididoEm: Date.now(),
        extra: Object.assign({}, pedido.extra || {}, { lote: r.corpo.lote, porCima: !!porCima }),
      });
      await aprovacao.aplicarExtra(db, sess.tenant_id, pedido);
      await db.registrarEvento(sess.tenant_id, sess.user_id, 'aprovacao.aprovar').catch(() => {});
      return sendJson(res, 200, { ok: true, lote: r.corpo.lote, telas: r.corpo.telas });
    } catch (e) {
      await voltar();
      throw e;
    }
  }

  async function tratarAprovacoes(req, res, parts, query, sess) {
    if (!sess) return sendJson(res, 401, { error: 'não autenticado' });
    const seg = parts[2];
    const revisor = canManageTeam(sess.role);

    if (req.method === 'GET' && seg === 'contagem') {
      return sendJson(res, 200, { ligada: await contaLigada(sess.tenant_id), ...(await contagem(sess)) });
    }
    if (req.method === 'GET' && !seg) {
      const ligada = await contaLigada(sess.tenant_id);
      if (revisor) {
        const [pendentes, recentes] = await Promise.all([
          db.listarAprovacoes(sess.tenant_id, { estado: 'pendente', limite: 50 }),
          db.listarAprovacoes(sess.tenant_id, { limite: 30 }),
        ]);
        return sendJson(res, 200, { ligada, souRevisor: true, pendentes, decididas: recentes.filter((p) => p.estado === 'aprovada' || p.estado === 'recusada').slice(0, 15) });
      }
      const minhas = (await db.listarAprovacoes(sess.tenant_id, { autorId: sess.user_id, limite: 30 })).filter((p) => p.estado !== 'substituida');
      return sendJson(res, 200, { ligada, souRevisor: false, minhas });
    }
    if (req.method === 'POST' && seg === 'vistas') {
      await db.marcarAprovacoesVistas(sess.tenant_id, sess.user_id);
      return sendJson(res, 200, { ok: true });
    }
    if (req.method === 'PUT' && seg === 'regra') {
      if (!revisor) return sendJson(res, 403, { error: 'Só o dono ou um administrador liga a aprovação.', code: 'papel' });
      return readBody(req, res, async (b) => {
        const ligada = !!(b && b.ligada === true);
        await db.setAprovacaoDaConta(sess.tenant_id, ligada);
        await db.registrarEvento(sess.tenant_id, sess.user_id, ligada ? 'aprovacao.ligar' : 'aprovacao.desligar').catch(() => {});
        return sendJson(res, 200, { ligada });
      });
    }
    if (!seg || !/^apr_[A-Za-z0-9]{6,40}$/.test(seg)) return sendJson(res, 404, { error: 'rota de aprovação inválida' });

    if (req.method === 'GET' && !parts[3]) {
      const pedido = await db.lerAprovacao(seg, sess.tenant_id);
      // O membro vê só o que ele pediu; o dono e o admin, tudo da conta.
      if (!pedido || (!revisor && pedido.autorId !== sess.user_id)) return sendJson(res, 404, { error: 'pedido não encontrado' });
      // Uma a uma, com a programação (a lista da conta não traz a config).
      const telasAgora = [];
      for (const i of (pedido.itens || []).slice(0, 200)) {
        const d = await db.getDevice(i.id);
        if (d && d.tenant_id === sess.tenant_id) telasAgora.push(d);
      }
      const telas = aprovacao.antesEDepois(pedido, telasAgora, ctx.publicar.normalizar);
      const { itens, ...resto } = pedido; // eslint-disable-line no-unused-vars
      return sendJson(res, 200, { pedido: resto, telas });
    }
    if (req.method === 'POST' && parts[3] === 'aprovar') {
      // Aprovar é do dono e do admin. O membro não aprova nem o próprio pedido.
      if (!revisor) return sendJson(res, 403, { error: 'Só o dono ou um administrador aprova.', code: 'papel' });
      return aprovar(res, sess, seg, query && query.porCima === '1');
    }
    if (req.method === 'POST' && parts[3] === 'recusar') {
      if (!revisor) return sendJson(res, 403, { error: 'Só o dono ou um administrador recusa.', code: 'papel' });
      return readBody(req, res, async (b) => {
        const motivo = String((b && b.motivo) || '').replace(/\s+/g, ' ').trim().slice(0, 500);
        const pedido = await db.lerAprovacao(seg, sess.tenant_id);
        if (!pedido) return sendJson(res, 404, { error: 'pedido não encontrado' });
        const ok = await db.mudarEstadoDaAprovacao(seg, sess.tenant_id, 'pendente', 'recusada', {
          motivo, revisorId: sess.user_id, revisorNome: sess.name || sess.email || '', decididoEm: Date.now(),
        });
        if (!ok) return sendJson(res, 409, { error: 'Este pedido já foi ' + (PALAVRA[pedido.estado] || pedido.estado) + '.', code: 'ja-decidido' });
        await db.registrarEvento(sess.tenant_id, sess.user_id, 'aprovacao.recusar').catch(() => {});
        return sendJson(res, 200, { ok: true });
      });
    }
    if (req.method === 'DELETE' && !parts[3]) {
      const pedido = await db.lerAprovacao(seg, sess.tenant_id);
      if (!pedido || pedido.autorId !== sess.user_id) return sendJson(res, 404, { error: 'pedido não encontrado' });
      const ok = await db.mudarEstadoDaAprovacao(seg, sess.tenant_id, 'pendente', 'cancelada', { decididoEm: Date.now() });
      if (!ok) return sendJson(res, 409, { error: 'Este pedido já foi ' + (PALAVRA[pedido.estado] || pedido.estado) + '.', code: 'ja-decidido' });
      return sendJson(res, 200, { ok: true });
    }
    return sendJson(res, 405, { error: 'método inválido' });
  }

  async function tratarLojas(req, res, parts, query, sess) {
    if (!sess) return sendJson(res, 401, { error: 'não autenticado' });
    const telas = await db.listDevices(sess.tenant_id);
    const contar = (lista) => {
      const m = new Map();
      for (const d of lista) {
        const g = String(d.grupo || '').trim();
        if (!g) continue;
        const k = permissoes.chave(g);
        const atual = m.get(k) || { nome: g, telas: 0 };
        atual.telas++;
        m.set(k, atual);
      }
      return [...m.values()].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
    };
    if (req.method === 'GET' && !parts[2]) {
      if (!canManageTeam(sess.role)) return sendJson(res, 200, { grupos: contar(permissoes.filtrar(sess, telas)), minhas: sess.lojas || null });
      return sendJson(res, 200, { grupos: contar(telas), semGrupo: telas.filter((d) => !String(d.grupo || '').trim()).length, membros: await db.lojasDaConta(sess.tenant_id) });
    }
    if (req.method === 'PUT' && parts[2] && !parts[3]) {
      if (!canManageTeam(sess.role)) return sendJson(res, 403, { error: 'Só o dono ou um administrador escolhe as lojas de cada pessoa.', code: 'papel' });
      const alvo = await db.getUserById(parts[2]);
      if (!alvo || alvo.tenant_id !== sess.tenant_id) return sendJson(res, 404, { error: 'membro não encontrado' });
      if (alvo.role !== 'member') return sendJson(res, 400, { error: 'Dono e administrador veem todas as TVs. A loja é escolhida para quem é membro.', code: 'papel' });
      return readBody(req, res, async (b) => {
        const todas = !b || b.grupos == null;
        const grupos = todas ? null : permissoes.limparGrupos(b.grupos);
        if (!todas && (!grupos || !grupos.length)) return sendJson(res, 400, { error: 'Escolha ao menos uma loja, ou deixe em "Todas as TVs".' });
        await db.salvarLojasDoUsuario(sess.tenant_id, alvo.id, grupos);
        await db.registrarEvento(sess.tenant_id, sess.user_id, 'equipe.lojas').catch(() => {});
        return sendJson(res, 200, { userId: alvo.id, grupos });
      });
    }
    return sendJson(res, 405, { error: 'método inválido' });
  }

  return async function (req, res, parts, query, sess) {
    if (parts[1] === 'aprovacoes') { await tratarAprovacoes(req, res, parts, query, sess); return true; }
    if (parts[1] === 'lojas') { await tratarLojas(req, res, parts, query, sess); return true; }
    return false;
  };
};
