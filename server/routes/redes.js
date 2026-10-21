/*
 * server/routes/redes.js — os textos das redes para uma peça (EXECUTOR, item 6).
 *
 *   POST /api/ai/redes   { titulo, apoio, chamada, selo, pedido }
 *     → { instagram, whatsapp, facebook, google, quando, motor }
 *
 * A imagem de cada canal NÃO passa por aqui: é a própria peça desenhada no
 * tamanho do canal, no navegador (web/src/lib/rasterizar.js). Aqui só o
 * texto, que é onde mora o "nada a ver" que o dono reclamou.
 *
 * Medido como toda rota de IA (o mapa TIPO_IA em server.js) e com teto por
 * hora: são quatro chamadas de texto por pedido.
 */
'use strict';

const redes = require('../redes');
const P = require('../../js/paletas.js');

// Texto de formulário: uma linha, sem controle, no tamanho certo.
const linha = (s, n) => String(s || '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);

/*
 * O link vai para a legenda e a mensagem que o lojista publica: só endereço
 * de verdade (http/https, wa.me, @perfil ou domínio). Nada de "javascript:".
 */
function linkLimpo(s) {
  const t = linha(s, 200);
  if (!t) return '';
  if (/^@[\w.]{2,30}$/.test(t)) return t;
  if (/^(https?:\/\/)?([\w-]+\.)+[a-z]{2,}(\/[^\s<>"']*)?$/i.test(t)) return t;
  return '';
}

function localLimpo(l) {
  const x = l || {};
  return { endereco: linha(x.endereco, 120), bairro: linha(x.bairro, 60), cidade: linha(x.cidade, 60), link: linkLimpo(x.link) };
}

module.exports = function (ctx) {
  const { db, sendJson, readBody, rateLimit, erros } = ctx;

  async function tratar(req, res, parts, query, sess) {
    if (!(parts[1] === 'ai' && parts[2] === 'redes')) return false;
    if (!sess) { sendJson(res, 401, { error: 'não autenticado' }); return true; }
    if (req.method !== 'POST') { sendJson(res, 405, { error: 'método inválido' }); return true; }
    const rl = rateLimit('ai:redes:' + sess.tenant_id, 30, 60 * 60 * 1000);
    if (!rl.ok) { sendJson(res, 429, { error: 'muitos textos de redes por hora — espere um pouco' }, { 'Retry-After': String(rl.retryAfter) }); return true; }
    readBody(req, res, async (b) => {
      try {
        const titulo = linha(b && b.titulo, 120);
        if (!titulo) return sendJson(res, 400, { error: 'a peça não tem título' });
        const [kit, tenant, mem] = await Promise.all([
          db.getBrandKit(sess.tenant_id), db.getTenant(sess.tenant_id), db.getMemoria(sess.tenant_id).catch(() => null),
        ]);
        const k = kit || {};
        const local = k.local || {};
        const empresa = (k.nome && k.nome !== 'Marca principal' ? k.nome : '') || (tenant && tenant.name) || '';
        const out = await redes.gerar({
          headline: titulo, sub: linha(b.apoio, 200), cta: linha(b.chamada, 60), kicker: linha(b.selo, 40),
          pedido: linha(b.pedido, 200), empresa, tom: k.tom || '',
          ramo: P.detectarRamo([tenant && tenant.name, k.nome, mem && mem.segmento, k.siteResumo]),
          endereco: local.endereco, bairro: local.bairro, cidade: local.cidade, link: local.link,
        });
        await db.registrarEvento(sess.tenant_id, sess.user_id, 'ia.redes');
        return sendJson(res, 200, Object.assign(out, { local }));
      } catch (e) {
        erros.registrar(e, { rota: '/api/ai/redes' });
        return sendJson(res, 500, { error: 'não deu para escrever os textos agora' });
      }
    });
    return true;
  }

  tratar.localLimpo = localLimpo;
  return tratar;
};

module.exports.localLimpo = localLimpo;
module.exports.linkLimpo = linkLimpo;
