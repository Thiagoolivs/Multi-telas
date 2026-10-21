/*
 * server/routes/campanhas.js — gerar o ecossistema e guardar a campanha
 * (EXECUTOR §2b, item 23).
 *
 *   POST /api/ai/ecossistema   { conversaId?, escopo? }
 *     roda como TRABALHO (a geração leva minutos): devolve o job, e o
 *     resultado é { campanha } — já salva, sem a pessoa apertar nada.
 *   GET  /api/campanhas         as recentes da conta (sem o resultado)
 *   GET  /api/campanhas/:id     uma, inteira
 *
 * O escopo vem da conversa (o que ela fechou) ou do pedido (o cartão mexido
 * à mão vence). A foto passa por `fotoDaConta`, a mesma da campanha de Meus
 * Designs: confere o saldo antes, cobra depois, e foto de reserva não cobra.
 * Tudo preso à conta.
 */
'use strict';

const E = require('../../js/escopo.js');
const Pal = require('../../js/paletas.js');
const eco = require('../ecossistema');
const conversa = require('../ai-conversa');

function configDe(d) {
  try { return typeof d.config === 'string' ? JSON.parse(d.config || '{}') : (d.config || {}); } catch (e) { return {}; }
}

module.exports = function (ctx) {
  const { db, sendJson, readBody, rateLimit, emTrabalho, marcaDaConta, fotoDaConta } = ctx;

  async function gerar(req, res, sess) {
    // Várias chamadas de modelo e fotos: o mesmo teto da campanha de Meus Designs.
    const rl = rateLimit('ai:eco:' + sess.tenant_id, 10, 60 * 60 * 1000);
    if (!rl.ok) return sendJson(res, 429, { error: 'muitas campanhas nesta hora. Espere um pouco.' }, { 'Retry-After': String(rl.retryAfter) });
    return readBody(req, res, async (b) => {
      const conversaId = b && typeof b.conversaId === 'string' ? b.conversaId : '';
      const conv = conversaId ? await db.lerConversa(sess.tenant_id, conversaId) : null;
      if (conversaId && !conv) return sendJson(res, 404, { error: 'conversa não encontrada' });
      const [{ kit, marca, lembrada }, telasDb, tenant] = await Promise.all([
        marcaDaConta(sess.tenant_id), db.listDevices(sess.tenant_id), db.getTenant(sess.tenant_id),
      ]);
      const telas = (telasDb || []).map((d) => {
        const s = configDe(d).settings || {};
        return { id: d.id, nome: d.name || '', layout: s.layoutId || '', emPe: /^portrait/.test(s.layoutId || '') };
      });
      // O alvo é conferido contra as TVs desta conta, como na conversa.
      const escopo = conversa.conferirEscopo(b && b.escopo && typeof b.escopo === 'object' ? b.escopo : (conv && conv.escopo), { telas });
      if (!E.temOQueGerar(escopo)) return sendJson(res, 400, { error: 'ainda não tem nada para criar: diga o que quer mostrar' });
      const k = kit || {};
      const empresa = (k.nome && k.nome !== 'Marca principal' ? k.nome : '') || (tenant && tenant.name) || '';
      await db.registrarEvento(sess.tenant_id, sess.user_id, 'ia.ecossistema');
      return emTrabalho(res, sess, 'campanha', { brief: (escopo.nome || 'Campanha').slice(0, 200) }, async (progresso) => {
        const resultado = await eco.gerar(escopo, {
          empresa, segmento: (lembrada && lembrada.segmento) || '', marca: marca || {}, memoria: lembrada, telas,
          local: k.local || {}, ramo: Pal.detectarRamo([tenant && tenant.name, k.nome, lembrada && lembrada.segmento, k.siteResumo]),
        }, { onImagem: fotoDaConta(sess, null), onProgresso: progresso });
        progresso('guardando a campanha', '');
        const campanha = await db.criarCampanha(sess.tenant_id, sess.user_id, {
          nome: resultado.nome, conversaId: conv ? conv.id : '', escopo, resultado, estado: 'pronta', telas: [],
        });
        if (resultado.biblioteca.length) await db.addLibrary(sess.tenant_id, resultado.nome, resultado.biblioteca);
        if (conv) await db.salvarConversa(sess.tenant_id, conv.id, { ...conv, escopo, estado: 'gerado', campanhaId: campanha.id });
        return { campanha };
      });
    });
  }

  async function tratar(req, res, parts, query, sess) {
    const ehGerar = parts[1] === 'ai' && parts[2] === 'ecossistema';
    if (!ehGerar && parts[1] !== 'campanhas') return false;
    if (!sess) { sendJson(res, 401, { error: 'não autenticado' }); return true; }
    if (ehGerar) {
      if (req.method !== 'POST') { sendJson(res, 405, { error: 'método inválido' }); return true; }
      await gerar(req, res, sess);
      return true;
    }
    if (parts.length === 2 && req.method === 'GET') {
      sendJson(res, 200, { campanhas: await db.listarCampanhas(sess.tenant_id, 20) });
      return true;
    }
    const id = parts[2];
    if (parts.length === 3 && /^camp_[a-z0-9]{6,40}$/i.test(id || '') && req.method === 'GET') {
      const c = await db.lerCampanha(sess.tenant_id, id);
      if (!c) { sendJson(res, 404, { error: 'campanha não encontrada' }); return true; }
      sendJson(res, 200, { campanha: c });
      return true;
    }
    sendJson(res, 404, { error: 'não encontrado' });
    return true;
  }

  return tratar;
};
