/*
 * server/agente/rotas.js — as rotas do agente.
 *
 *   POST /api/ai/agente          { conversaId, chave }  VALIDAR e executar o
 *                                plano: grava a validação na conversa (quem,
 *                                quando, a chave) e roda como TRABALHO (o
 *                                painel acompanha). Só a chave do plano que
 *                                está na conversa vale: plano mudado, 409.
 *   GET  /api/agente             { ligado } — o painel sabe se o agente está ligado para esta conta
 *   GET  /api/agente/encaixe/:código   as peças que a execução espera o painel conferir (o painel pega)
 *   POST /api/agente/encaixe/:código   { resultados } o que deu em cada uma (server/agente/encaixe.js)
 *
 *   Só operador (Plataforma):
 *   GET  /api/agente/plataforma?dias=30            as contagens (Qualidade das gerações)
 *   GET  /api/agente/plataforma/contas/:id         a chave da conta e as últimas voltas dela
 *   PUT  /api/agente/plataforma/contas/:id         { desligado } — o freio de UMA conta
 *
 * O gasto de texto da execução é medido pelo trabalho (server/jobs.js) e a
 * rota entra no mapa TIPO_IA de server.js ('agente'): o teto da conta vale.
 */
'use strict';

const L = require('./limites');
const R = require('./registro');
const C = require('./contexto');
const X = require('./executor');
const Pub = require('./publicar');
const Enc = require('./encaixe');
const { chaveDoPlano } = require('./index');
const paleta = require('../paleta');
const permissoes = require('../permissoes');
const Pal = require('../../js/paletas.js');

const corta = (s, n) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim().slice(0, n);
const DIAS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];

function configDe(d) {
  try { return typeof d.config === 'string' ? JSON.parse(d.config || '{}') : (d.config || {}); } catch (e) { return {}; }
}

// O plano que espera validação: a mensagem mais nova da IA que tem um plano.
function planoDaConversa(conv) {
  const msgs = (conv && conv.mensagens) || [];
  for (let i = msgs.length - 1; i >= 0; i--) {
    const m = msgs[i];
    if (m && m.papel === 'ia' && m.agente && Array.isArray(m.agente.itens) && m.agente.chave) return { indice: i, mensagem: m, plano: m.agente };
  }
  return null;
}

module.exports = function (ctx) {
  const { db, sendJson, readBody, emTrabalho, operadores, marcaDaConta, erros } = ctx;

  // O contexto da conta para o agente executar (o mesmo que a conversa lê).
  async function contextoDaConta(sess) {
    const tenantId = sess.tenant_id;
    const [{ kit, marca, lembrada }, telasDb, tenant] = await Promise.all([
      marcaDaConta(tenantId), db.listDevices(tenantId).then((l) => permissoes.filtrar(sess, l)), db.getTenant(tenantId),
    ]);
    const k = kit || {};
    const perfil = await paleta.perfilDaConta(db, tenantId, tenant);
    const agora = new Date();
    const telas = (telasDb || []).map((d) => {
      const s = configDe(d).settings || {};
      return { id: d.id, nome: d.name || '', layout: s.layoutId || '', emPe: /^portrait/.test(s.layoutId || ''), tema: (s.theme && s.theme.preset) || '', grupo: d.grupo || '' };
    });
    const base = {
      empresa: (k.nome && k.nome !== 'Marca principal' ? k.nome : '') || (tenant && tenant.name) || '',
      segmento: (lembrada && lembrada.segmento) || '', perfil, marca: marca || {}, memoria: lembrada, local: k.local || {},
      telas, grupos: [...new Set(telas.map((t) => t.grupo).filter(Boolean))],
      hoje: agora.toISOString().slice(0, 10), diaSemana: DIAS[agora.getDay()],
    };
    const completo = await C.completar(db, sess, base);
    const ctxConta = {
      empresa: base.empresa, segmento: base.segmento, marca: marca || {}, memoria: lembrada, local: k.local || {}, perfil,
      ramo: Pal.detectarRamo([tenant && tenant.name, k.nome, lembrada && lembrada.segmento, k.siteResumo]),
      telas: telas.map((t) => ({ id: t.id, nome: t.nome, emPe: t.emPe })),
    };
    return { ctx: completo, ctxConta };
  }

  async function validar(req, res, sess) {
    if (!(await L.ligadoPara(db, sess.tenant_id))) return sendJson(res, 409, { error: 'O agente está desligado nesta conta. Use o Criar como antes.', code: 'agente-desligado' });
    const freio = L.contar('exec:' + sess.tenant_id, L.LIMITES.execucoesPorHora(), 60 * 60 * 1000);
    if (!freio.ok) return sendJson(res, 429, { error: 'Muitas execuções nesta hora. Espere um pouco.' }, { 'Retry-After': String(freio.retryAfter) });
    return readBody(req, res, async (b) => {
      try {
        const id = b && typeof b.conversaId === 'string' ? b.conversaId : '';
        const chave = b && typeof b.chave === 'string' ? b.chave : '';
        const conv = id ? await db.lerConversa(sess.tenant_id, id) : null;
        if (!conv || conv.tipo === 'edicao') return sendJson(res, 404, { error: 'conversa não encontrada' });
        const achado = planoDaConversa(conv);
        if (!achado) return sendJson(res, 409, { error: 'Não há plano para validar nesta conversa.', code: 'sem-plano' });
        const { plano, mensagem } = achado;
        // A chave que a pessoa viu é a do plano guardado, e o plano guardado não foi mexido.
        if (!chave || chave !== plano.chave || chaveDoPlano(plano.itens) !== plano.chave) {
          return sendJson(res, 409, { error: 'O plano mudou depois que você viu. Confira de novo antes de validar.', code: 'plano-mudou' });
        }
        if (plano.estado !== 'esperando') return sendJson(res, 409, { error: 'Este plano já foi validado.', code: 'ja-validado', job: plano.job || '' });
        const validacao = { chave: plano.chave, conversaId: conv.id, por: sess.user_id, em: Date.now() };
        // A validação fica gravada na conversa ANTES de qualquer coisa ir ao ar (o registro do "pode").
        const msgs = conv.mensagens.slice();
        msgs[achado.indice] = Object.assign({}, mensagem, { agente: Object.assign({}, plano, { estado: 'validado', validacao }) });
        let atual = await db.salvarConversa(sess.tenant_id, conv.id, Object.assign({}, conv, { mensagens: msgs }));
        await db.registrarEvento(sess.tenant_id, sess.user_id, 'agente.validar');
        const titulo = plano.itens.map((i) => corta(i.titulo, 30)).join(' · ').slice(0, 180);
        return emTrabalho(res, sess, 'agente', { brief: titulo || 'Plano do agente', conversaId: conv.id }, async (progresso) => {
          progresso('Começando…', plano.itens.map((x, k) => k + ':' + (x.recusa ? 'barrado' : x.manual ? 'manual' : 'espera')).join('|'));
          const { ctx: c, ctxConta } = await contextoDaConta(sess);
          let res2;
          try {
            // `encaixe`: as peças param no "Conferindo o encaixe…" e o painel aberto confere se cabem.
            res2 = await X.executar({ db, sess, rotas: { operacao: ctx.publicar.operacao, fotoDaConta: ctx.fotoDaConta, estiloDasReferencias: ctx.estiloDasReferencias }, conversa: atual, plano, validacao, ctx: c, ctxConta, progresso, chaveDoPlano, encaixe: {} });
          } catch (e) {
            R.salvar(db, { tenantId: sess.tenant_id, userId: sess.user_id, conversaId: conv.id, tipo: 'queda', motivo: 'execucao: ' + corta(e && e.message, 80), pedido: titulo }).catch(() => {});
            throw e;
          }
          const texto = X.mensagemFinal(res2, plano);
          const resultado = {
            itens: res2.itens.map((x) => ({ indice: x.indice, tipo: x.tipo, titulo: x.titulo, onde: x.onde, estado: x.estado, lote: x.lote || null, aprovacao: x.aprovacao || '', campanhaId: x.campanhaId || '', motivo: x.motivo || '', avisos: (x.avisos || []).slice(0, 6), telas: x.telas || 0 })),
            lotes: res2.itens.map((x) => x.lote).filter(Boolean),
          };
          // A conversa recebe o resultado: a mensagem do que foi feito, com o Desfazer.
          const depois = await db.lerConversa(sess.tenant_id, conv.id);
          const lista = (depois.mensagens || []).slice();
          const k = lista.findIndex((m) => m && m.agente && m.agente.chave === plano.chave);
          if (k >= 0) lista[k] = Object.assign({}, lista[k], { agente: Object.assign({}, lista[k].agente, { estado: 'executado' }) });
          lista.push({ papel: 'ia', texto, sugestoes: [], em: Date.now(), intencao: 'agente', ferramenta: 'agente', args: {}, agente: { estado: 'resultado', chave: plano.chave, resultado } });
          const campanhaId = (resultado.itens.find((x) => x.campanhaId) || {}).campanhaId || depois.campanhaId || '';
          atual = await db.salvarConversa(sess.tenant_id, conv.id, Object.assign({}, depois, { mensagens: lista.slice(-200), campanhaId: depois.campanhaId || (depois.estado === 'gerado' ? campanhaId : '') }));
          R.salvar(db, {
            tenantId: sess.tenant_id, userId: sess.user_id, conversaId: conv.id, tipo: 'execucao', cerebro: 'executor', pedido: titulo,
            passos: res2.passos, custoCentavos: res2.gastoCentavos, ms: res2.ms, resumo: corta(texto, 300),
            checks: { avisos: resultado.itens.reduce((t, x) => t + x.avisos.length, 0), barrados: resultado.itens.filter((x) => x.estado === 'barrado').length, encaixe: res2.encaixe },
            publicado: { itens: resultado.itens.map((x) => ({ tipo: x.tipo, estado: x.estado, telas: x.telas, lote: x.lote || '', aprovacao: x.aprovacao || '' })) },
          }).catch(() => {});
          return { resultado, texto, conversa: atual };
        });
      } catch (e) {
        if (e && e.code === 'sem-validacao') return sendJson(res, 409, { error: e.message, code: e.code });
        erros.registrar(e, { rota: '/api/ai/agente' });
        return sendJson(res, 500, { error: 'não deu para executar o plano agora' });
      }
    });
  }

  async function plataforma(req, res, parts, query, sess) {
    const quem = await operadores.permissao(db, sess);
    if (!quem.pode) return sendJson(res, 404, { error: 'rota não encontrada' });
    if (req.method === 'GET' && !parts[3]) {
      const dias = Math.min(180, Math.max(1, Number(query && query.dias) || 30));
      const linhas = await R.desde(db, Date.now() - dias * 24 * 60 * 60 * 1000, 5000);
      return sendJson(res, 200, Object.assign({ dias, ligadoGlobal: L.ligadoGlobal(), desligadoGlobal: L.desligadoGlobal() }, R.resumo(linhas)));
    }
    if (parts[3] === 'contas' && parts[4]) {
      const tenantId = String(parts[4]).slice(0, 64);
      const t = await db.getTenant(tenantId);
      if (!t) return sendJson(res, 404, { error: 'conta não encontrada' });
      if (req.method === 'GET') {
        const c = db.agenteDaConta ? await db.agenteDaConta(tenantId) : null;
        const voltas = await R.daConta(db, tenantId, 30);
        return sendJson(res, 200, { desligado: !!(c && c.desligado), desligadoPor: (c && c.por) || '', desligadoEm: (c && c.em) || 0, ligadoGlobal: L.ligadoGlobal(), voltas });
      }
      if (req.method === 'PUT') {
        return readBody(req, res, async (b) => {
          if (!b || typeof b.desligado !== 'boolean') return sendJson(res, 400, { error: 'diga se desliga (desligado: true ou false)' });
          if (!db.salvarAgenteDaConta) return sendJson(res, 501, { error: 'sem banco para guardar' });
          await db.salvarAgenteDaConta(tenantId, { desligado: b.desligado, por: sess.email || '' });
          require('../log.js').log.info('agente.conta', { tenant: tenantId, desligado: b.desligado, por: sess.email });
          return sendJson(res, 200, { desligado: b.desligado });
        });
      }
    }
    return sendJson(res, 404, { error: 'não encontrado' });
  }

  return async function tratar(req, res, parts, query, sess) {
    const ehValidar = parts[1] === 'ai' && parts[2] === 'agente' && !parts[3];
    if (!ehValidar && parts[1] !== 'agente') return false;
    if (!sess) { sendJson(res, 401, { error: 'não autenticado' }); return true; }
    if (ehValidar) {
      if (req.method !== 'POST') { sendJson(res, 405, { error: 'método inválido' }); return true; }
      await validar(req, res, sess);
      return true;
    }
    if (parts[2] === 'plataforma') { await plataforma(req, res, parts, query, sess); return true; }
    // O encaixe no painel: só a conta que pediu pega e responde (o código sozinho não basta).
    if (parts[2] === 'encaixe' && parts[3]) {
      if (req.method === 'GET') {
        const pecas = Enc.pegar(parts[3], sess.tenant_id);
        sendJson(res, pecas ? 200 : 404, pecas ? { pecas } : { error: 'não há conferência esperando' });
        return true;
      }
      if (req.method === 'POST') {
        readBody(req, res, (b) => {
          const ok = Enc.responder(parts[3], sess.tenant_id, b && b.resultados);
          return sendJson(res, ok ? 200 : 404, ok ? { ok: true } : { error: 'a conferência já terminou' });
        });
        return true;
      }
    }
    if (!parts[2] && req.method === 'GET') { sendJson(res, 200, { ligado: await L.ligadoPara(db, sess.tenant_id) }); return true; }
    sendJson(res, 404, { error: 'não encontrado' });
    return true;
  };
};

module.exports.planoDaConversa = planoDaConversa;
module.exports.SemValidacao = Pub.SemValidacao;
