/*
 * /api/primeira-tv — o progresso do "Sua primeira TV em 5 minutos"
 * (js/primeira-tv.js; a página é web/src/pages/PrimeiraTvPage.jsx).
 *
 *   GET /api/primeira-tv   { estado, abrir, nova }
 *   PUT /api/primeira-tv   o estado inteiro → { estado }
 *
 * O progresso é da CONTA (uma coluna em tenants): quem começou no celular
 * continua no computador, do mesmo passo. Tudo passa por normalizar — o
 * banco nunca guarda o que o painel mandou sem conferir.
 *
 * O negócio escolhido no passo 1 vira o ramo da conta: é ele que a Marca,
 * as paletas e a Biblioteca usam para pôr o do negócio primeiro (server.js,
 * GET /api/brand, com ramoEscolhido). Só o dono e o administrador mudam o
 * negócio; o membro passa pelos passos, mas o negócio da conta fica.
 *
 * Nada aqui põe coisa na TV: o fim do fluxo usa os caminhos de sempre (o
 * envio em lote e o horário da TV), com a aprovação e as lojas valendo.
 */
'use strict';
const P = require('../../js/primeira-tv.js');

// O progresso guardado na conta (ou o começo).
function lerEstado(tenant) {
  let bruto = null;
  try { bruto = tenant && tenant.primeira_tv ? JSON.parse(tenant.primeira_tv) : null; } catch (e) { bruto = null; }
  return bruto ? P.normalizar(bruto) : null;
}

/* O ramo que a pessoa escolheu no passo 1 ('' = não escolheu, ou "Outro"). */
async function ramoEscolhido(db, tenantId) {
  const t = await db.getTenant(tenantId).catch(() => null);
  const e = lerEstado(t);
  return e ? P.ramoDoNegocio(e.negocio) : '';
}

module.exports = function (ctx) {
  const { db, sendJson, readBody, canManageTeam } = ctx;

  return async function (req, res, parts, query, sess) {
    if (parts[1] !== 'primeira-tv' || parts.length !== 2) return false;
    if (!sess || !sess.tenant_id) { sendJson(res, 401, { error: 'não autenticado' }); return true; }
    const tenant = await db.getTenant(sess.tenant_id);
    const guardado = lerEstado(tenant);

    if (req.method === 'GET') {
      const telas = await db.listDevices(sess.tenant_id);
      // Conta nova: nenhuma TV com programação ainda.
      const nova = !telas.some((d) => !!d.has_config);
      const estado = guardado || P.inicial(Date.now());
      /*
       * Abre sozinho só para quem monta a TV (o dono e o administrador), na
       * conta nova, enquanto não terminou nem saiu. O membro e o suporte
       * chegam pelo Início.
       */
      const abrir = nova && !estado.fim && !estado.saiu && canManageTeam(sess.role) && !sess.operador;
      sendJson(res, 200, { estado, abrir, nova, comecou: !!guardado });
      return true;
    }

    if (req.method === 'PUT') {
      readBody(req, res, async (b) => {
        if (!b || typeof b !== 'object' || Array.isArray(b)) return sendJson(res, 400, { error: 'json inválido' });
        const estado = P.normalizar(b.estado || b);
        // O negócio é da conta: o membro não troca o que o dono escolheu.
        if (!canManageTeam(sess.role)) estado.negocio = guardado ? guardado.negocio : '';
        if (!estado.comecouEm) estado.comecouEm = (guardado && guardado.comecouEm) || Date.now();
        await db.salvarPrimeiraTv(sess.tenant_id, estado);
        if (estado.fim && !(guardado && guardado.fim)) db.registrarEvento(sess.tenant_id, sess.user_id, 'primeira-tv.fim').catch(() => {});
        return sendJson(res, 200, { estado });
      });
      return true;
    }
    sendJson(res, 405, { error: 'método inválido' });
    return true;
  };
};
module.exports.ramoEscolhido = ramoEscolhido;
module.exports.lerEstado = lerEstado;
