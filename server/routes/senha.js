/*
 * /api/senha — a chamada de senha da Saúde (fase 12 do plano de ação).
 *
 * Do painel (qualquer pessoa da conta: a recepção costuma ser "membro"):
 *   GET  /api/senha?grupo=          a fila: a chamada atual, as anteriores e o próximo número
 *   POST /api/senha/proxima          { grupo, prefixo, local: { tipo, numero } }
 *   POST /api/senha/chamar           { grupo, prefixo, numero, local }   um número escolhido (a fila não anda)
 *   POST /api/senha/rechamar         { grupo }                           a última de novo, no mesmo lugar
 *   POST /api/senha/zerar            { grupo }                           volta a 1 e limpa a TV
 * Da TV (token da TV no cabeçalho):
 *   GET  /api/devices/:id/senha      o que esta TV mostra (as chamadas de "todas as TVs" e as do grupo dela)
 *
 * A chamada vai para a TV na hora pelo tempo real (evento "senha", com o
 * estado inteiro: a TV não precisa buscar nada para mostrar). A TV sem tempo
 * real busca aqui de poucos em poucos segundos (js/senha.js).
 *
 * O "grupo" é o das TVs (Telas › grupo): vazio é a fila de todas as TVs da
 * conta. Uma clínica com duas salas de espera põe cada TV num grupo, e cada
 * recepção chama a fila da sua sala.
 */
'use strict';
const S = require('../senha');
const permissoes = require('../permissoes');

module.exports = function (ctx) {
  const { db, sendJson, readBody, rateLimit, broadcast, subscribers, safeEqual, limites } = ctx;
  const aoVivo = (id) => !!(subscribers[id] && subscribers[id].size);

  // As chamadas que uma TV do grupo `g` mostra: as de todas as TVs e as do grupo dela.
  const gruposDaTela = (g) => (g ? ['', g] : ['']);

  async function estadoDaTela(tenantId, grupoDaTela, dia) {
    return S.estadoDe(await db.senhaChamadas(tenantId, gruposDaTela(grupoDaTela), dia, 12), Date.now());
  }

  /*
   * Empurra o estado para cada TV ligada que mostra esta fila. Cada TV recebe
   * o SEU estado (o grupo dela soma as chamadas de todas as TVs); o cálculo
   * é um por grupo, não um por TV.
   */
  async function avisarTelas(tenantId, grupo, telas, dia) {
    const porGrupo = {};
    for (const d of telas) {
      const g = d.grupo || '';
      if (grupo && g !== grupo) continue;
      if (!aoVivo(d.id)) continue;
      if (!porGrupo[g]) porGrupo[g] = await estadoDaTela(tenantId, g, dia);
      broadcast(d.id, 'senha', porGrupo[g]);
    }
  }

  // A fila como o painel vê: o que a TV mostra, o próximo número de cada letra e quantas TVs mostram.
  async function fila(tenantId, grupo, telas, dia) {
    const estado = S.estadoDe(await db.senhaChamadas(tenantId, [grupo], dia, 12), Date.now());
    const proximos = {};
    for (const f of await db.senhaFilas(tenantId, grupo)) proximos[f.prefixo || ''] = f.dia === dia && f.numero < S.NUMERO_MAX ? f.numero + 1 : 1;
    const dela = telas.filter((d) => !grupo || (d.grupo || '') === grupo);
    const grupos = [...new Set(telas.map((d) => d.grupo || '').filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
    return Object.assign(estado, {
      grupo, proximos, grupos,
      telas: { total: dela.length, ligadas: dela.filter((d) => aoVivo(d.id)).length },
    });
  }

  /*
   * O FUSO DA CONTA, guardado por um minuto (teste de carga, 14/11).
   *
   * TODA TV pergunta aqui a cada 60 s (js/senha.js), com ou sem chamada de
   * senha ligada, e cada pergunta lia TODAS as TVs da conta só para saber o
   * fuso: numa conta de 300 TVs, 300 × 300 linhas por minuto — o custo
   * crescia com o quadrado do tamanho da conta, justo a conta grande de RH.
   * O fuso só muda quando alguém mexe no horário de uma TV; um minuto de
   * atraso para o "dia da loja" virar é nada.
   */
  const FUSO_MS = 60 * 1000;
  const fusos = new Map(); // tenant -> { fuso, em }
  async function fusoDaConta(tenantId) {
    const c = fusos.get(tenantId);
    if (c && Date.now() - c.em < FUSO_MS) return c.fuso;
    const fuso = S.fusoDasTelas(await db.listDevices(tenantId));
    fusos.set(tenantId, { fuso, em: Date.now() });
    if (fusos.size > 5000) fusos.delete(fusos.keys().next().value);
    return fuso;
  }

  async function daTela(req, res, id, sess) {
    if (req.method !== 'GET') return sendJson(res, 405, { error: 'método inválido' });
    const device = await db.getDevice(id);
    if (!device) return sendJson(res, 404, { error: 'device não encontrado' });
    const dado = req.headers['x-device-token'];
    const dtOk = !!dado && !!device.device_token && safeEqual(dado, device.device_token);
    const dono = !!sess && device.tenant_id === sess.tenant_id;
    if (!dtOk && !dono) return sendJson(res, 403, { error: 'sem permissão' });
    // Medido como todo pedido da TV, nunca bloqueado (server/limites.js).
    if (dtOk && device.tenant_id) limites.permitir('tela', device.tenant_id, device.id);
    if (!device.tenant_id) return sendJson(res, 200, S.estadoDe([], Date.now()));
    const dia = S.diaNaLoja(Date.now(), await fusoDaConta(device.tenant_id));
    return sendJson(res, 200, await estadoDaTela(device.tenant_id, device.grupo || '', dia));
  }

  async function chamar(res, sess, b, acao) {
    const t = sess.tenant_id;
    const grupo = S.grupoDe(b.grupo);
    const telas = await db.listDevices(t);
    const agora = Date.now();
    const dia = S.diaNaLoja(agora, S.fusoDasTelas(telas));
    let c;
    if (acao === 'rechamar') {
      const ultima = (await db.senhaChamadas(t, [grupo], dia, 1))[0];
      if (!ultima) return sendJson(res, 400, { error: 'Ainda não há senha chamada hoje para chamar de novo.' });
      c = { grupo, prefixo: ultima.prefixo || '', numero: ultima.numero, localTipo: ultima.local_tipo, localNum: ultima.local_num, tipo: 'rechamada' };
    } else {
      const prefixo = S.prefixoDe(b.prefixo);
      if (prefixo === null) return sendJson(res, 400, { error: 'A letra da senha é uma só, de A a Z.' });
      const local = S.localDe(b.local);
      if (!local) return sendJson(res, 400, { error: 'Escolha onde o paciente vai ser atendido (guichê, consultório, sala…).' });
      let numero;
      if (acao === 'chamar') {
        numero = S.numeroDe(b.numero);
        if (!numero) return sendJson(res, 400, { error: 'O número da senha vai de 1 a ' + S.NUMERO_MAX + '.' });
      } else {
        numero = await db.senhaProxima(t, grupo, prefixo, dia, agora);
      }
      c = { grupo, prefixo, numero, localTipo: local.tipo, localNum: local.numero, tipo: acao === 'chamar' ? 'numero' : 'proxima' };
    }
    c.dia = dia;
    c.em = agora;
    await db.senhaRegistrar(t, c);
    // Primeiro a TV, depois a resposta: é a TV que o paciente está olhando.
    await avisarTelas(t, grupo, telas, dia);
    db.registrarEvento(t, sess.user_id, 'senha.' + acao).catch(() => {});
    return sendJson(res, 200, await fila(t, grupo, permissoes.filtrar(sess, telas), dia));
  }

  return async function (req, res, parts, query, sess) {
    if (parts[1] === 'devices' && parts[2] && parts[3] === 'senha' && parts.length === 4) {
      await daTela(req, res, parts[2], sess);
      return true;
    }
    if (parts[1] !== 'senha') return false;
    if (!sess || !sess.tenant_id) { sendJson(res, 401, { error: 'não autenticado' }); return true; }
    if (parts.length === 2 && req.method === 'GET') {
      const telas = await db.listDevices(sess.tenant_id);
      const dia = S.diaNaLoja(Date.now(), S.fusoDasTelas(telas));
      // Fase 13: o membro de uma loja só vê a fila das lojas dele (e as TVs delas).
      let grupo = S.grupoDe(query && query.grupo);
      if (permissoes.restrito(sess) && !permissoes.podeGrupo(sess, grupo)) grupo = S.grupoDe(sess.lojas[0] || '');
      sendJson(res, 200, Object.assign(await fila(sess.tenant_id, grupo, permissoes.filtrar(sess, telas), dia), { locais: S.LOCAIS }));
      return true;
    }
    const acao = parts[2];
    if (parts.length !== 3 || !['proxima', 'chamar', 'rechamar', 'zerar'].includes(acao)) { sendJson(res, 404, { error: 'não encontrado' }); return true; }
    if (req.method !== 'POST') { sendJson(res, 405, { error: 'método inválido' }); return true; }
    // Folga para a recepção mais rápida (uma chamada por segundo por um minuto), e trava o laço.
    const rl = rateLimit('senha:' + sess.tenant_id, 60, 60 * 1000);
    if (!rl.ok) { sendJson(res, 429, { error: 'Muitas chamadas em pouco tempo. Espere ' + rl.retryAfter + ' segundos.' }, { 'Retry-After': String(rl.retryAfter) }); return true; }
    readBody(req, res, async (b) => {
      if (!b || typeof b !== 'object') return sendJson(res, 400, { error: 'json inválido' });
      // Fase 13: o membro de uma loja só chama nas TVs das lojas dele ("todas as TVs" não é dele).
      if (permissoes.restrito(sess) && !permissoes.podeGrupo(sess, S.grupoDe(b.grupo))) return sendJson(res, 403, { error: 'Esta fila é de uma loja que não é sua.' });
      if (acao === 'zerar') {
        const grupo = S.grupoDe(b.grupo);
        const telas = await db.listDevices(sess.tenant_id);
        const dia = S.diaNaLoja(Date.now(), S.fusoDasTelas(telas));
        await db.senhaZerar(sess.tenant_id, grupo);
        await avisarTelas(sess.tenant_id, grupo, telas, dia);
        db.registrarEvento(sess.tenant_id, sess.user_id, 'senha.zerar').catch(() => {});
        return sendJson(res, 200, await fila(sess.tenant_id, grupo, telas, dia));
      }
      return chamar(res, sess, b, acao);
    });
    return true;
  };
};
