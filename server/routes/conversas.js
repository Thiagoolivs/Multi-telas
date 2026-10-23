/*
 * server/routes/conversas.js — a conversa do Criar (EXECUTOR §2b, item 21).
 *
 *   POST /api/ai/conversa       { id?, texto, escopo? }
 *     uma volta: guarda a fala da pessoa, pergunta à IA, guarda a resposta
 *     → { conversa, pronto, sugestoes }
 *   GET  /api/conversas          as da conta (sem as mensagens), com ?q=, ?estado=
 *                                 andamento|criadas, ?arquivadas=1 e ?pular= (D49)
 *   GET  /api/conversas/:id      uma, inteira
 *   PUT  /api/conversas/:id      { titulo } renomeia; { arquivada } arquiva (D49);
 *                                 { decisoes } corrige o que foi decidido (D48);
 *                                 { referencias } muda o uso ou tira uma imagem (D45);
 *   POST /api/conversas/referencia?uso=estilo|produto        imagem nova numa conversa nova (D45)
 *   POST /api/conversas/:id/referencia?uso=estilo|produto    imagem nova nesta conversa
 *     o corpo são os bytes da imagem (PNG, JPEG ou WEBP, conferidos pelos bytes)
 *                                 { escopo }: o que a pessoa mudou à mão no
 *                                 cartão "O que vou criar". Não chama a IA.
 *
 * Tudo preso à conta (`sess.tenant_id`): o id de uma conversa de outra conta
 * responde 404, igual a um id que não existe.
 *
 * Conversar não gasta criação. Medido como toda rota de IA (o mapa TIPO_IA
 * em server.js, que também aplica o teto diário de texto da conta) e com
 * teto por hora aqui.
 */
'use strict';

const conversa = require('../ai-conversa');
const memory = require('../ai-memoria');
const E = require('../../js/escopo.js');
const paleta = require('../paleta.js');
const refs = require('../referencias.js');

// O que a conversa guarda. Mais que isso, as mais antigas saem: o escopo já as resume.
const MAX_MENSAGENS = 200;
const DIAS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];

const linha = (s, n) => String(s == null ? '' : s).replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, ' ').trim().slice(0, n);

function configDe(d) {
  try { return typeof d.config === 'string' ? JSON.parse(d.config || '{}') : (d.config || {}); } catch (e) { return {}; }
}

module.exports = function (ctx) {
  const { db, sendJson, readBody, rateLimit, erros, midia, plans } = ctx;

  /*
   * A imagem de referência do chat (D45): mídia da conta, conferida pelos
   * bytes, presa à conversa. Sem conversa ainda, ela nasce aqui (a pessoa
   * pode mandar a imagem antes da primeira frase).
   */
  async function receberReferencia(req, res, sess, query, atual) {
    const rl = rateLimit('ref:' + sess.tenant_id, 60, 60 * 60 * 1000);
    if (!rl.ok) { req.resume(); return sendJson(res, 429, { error: 'muitas imagens nesta hora. Espere um pouco.' }, { 'Retry-After': String(rl.retryAfter) }); }
    if (atual && (atual.referencias || []).length >= refs.MAX_POR_CONVERSA) { req.resume(); return sendJson(res, 400, { error: 'até ' + refs.MAX_POR_CONVERSA + ' imagens por conversa' }); }
    const [usado, telas, tenant] = await Promise.all([db.sumMediaBytes(sess.tenant_id), db.countDevices(sess.tenant_id), db.getTenant(sess.tenant_id)]);
    const cota = plans.cotaBytes(tenant && tenant.plan, Math.max(1, telas));
    const r = await refs.receber({ db, midia, tenantId: sess.tenant_id, req, uso: query.uso, cota, usado });
    if (r.erro) return sendJson(res, r.status, { error: r.erro });
    const base = atual || await db.criarConversa(sess.tenant_id, sess.user_id, { titulo: 'Nova conversa', mensagens: [], escopo: null, estado: 'conversando', campanhaId: '', decisoes: [], referencias: [] });
    const salva = await db.salvarConversa(sess.tenant_id, base.id, { ...base, referencias: (base.referencias || []).concat(r.referencia) });
    return sendJson(res, 201, { referencia: r.referencia, conversa: salva });
  }

  // O que a IA precisa saber da conta: a marca (para não perguntar), a memória e as TVs.
  async function contexto(tenantId) {
    const [kit, assets, tenant, lembrada, telas] = await Promise.all([
      db.getBrandKit(tenantId), db.listBrandAssets(tenantId), db.getTenant(tenantId),
      db.getMemoria(tenantId).catch(() => null), db.listDevices(tenantId),
    ]);
    const k = kit || {};
    const agora = new Date();
    return {
      empresa: (k.nome && k.nome !== 'Marca principal' ? k.nome : '') || (tenant && tenant.name) || '',
      segmento: (lembrada && lembrada.segmento) || '',
      perfil: await paleta.perfilDaConta(db, tenantId, tenant),
      marca: {
        tom: k.tom || '', observacoes: k.observacoes || '', siteResumo: k.siteResumo || '',
        bases: (assets || []).filter((a) => a.kind === 'base').map((a) => ({ url: a.url, label: a.label || '' })),
      },
      memoria: lembrada,
      telas: (telas || []).map((d) => {
        const s = configDe(d).settings || {};
        return { id: d.id, nome: d.name || '', layout: s.layoutId || '', emPe: /^portrait/.test(s.layoutId || '') };
      }),
      hoje: agora.toISOString().slice(0, 10),
      diaSemana: DIAS[agora.getDay()],
    };
  }

  async function volta(req, res, sess) {
    const rl = rateLimit('ai:conversa:' + sess.tenant_id, 120, 60 * 60 * 1000);
    if (!rl.ok) return sendJson(res, 429, { error: 'muitas mensagens nesta hora. Espere um pouco e continue.' }, { 'Retry-After': String(rl.retryAfter) });
    return readBody(req, res, async (b) => {
      const texto = linha(b && b.texto, 2000);
      if (!texto) return sendJson(res, 400, { error: 'escreva o que você quer mostrar' });
      try {
        const id = b && typeof b.id === 'string' ? b.id : '';
        const atual = id ? await db.lerConversa(sess.tenant_id, id) : null;
        if (id && !atual) return sendJson(res, 404, { error: 'conversa não encontrada' });
        const c = await contexto(sess.tenant_id);
        c.referencias = (atual && atual.referencias) || [];
        const mensagens = ((atual && atual.mensagens) || []).concat({ papel: 'pessoa', texto, em: Date.now() });
        // O escopo do cartão (que a pessoa pode ter mudado à mão) vence o guardado.
        const escopo = b && b.escopo && typeof b.escopo === 'object' ? b.escopo : (atual && atual.escopo);
        // D48: as decisões das voltas anteriores vão junto, e voltam acrescidas (ou com o que a pessoa mudou fora).
        const out = await conversa.conversar({ mensagens, escopo, decisoes: (atual && atual.decisoes) || [], ctx: c });
        /*
         * Na falha, a frase aparece para a pessoa mas é marcada: a próxima
         * volta não a manda para a IA como se fosse fala dela (transcricao),
         * o estado da conversa não anda e a memória não aprende nada.
         */
        const falhou = out.modo === 'falha';
        // Dúvida (D5) também não anda o estado: "pronta para gerar" continua pronta.
        const manter = falhou || out.tipo === 'duvida';
        const prontoAntes = !!(atual && (atual.estado === 'entendido' || atual.estado === 'gerado'));
        mensagens.push({ papel: 'ia', texto: out.resposta, sugestoes: out.sugestoes, em: Date.now(), ...(falhou ? { falha: true } : {}) });
        const primeira = mensagens.find((m) => m.papel === 'pessoa');
        const dados = {
          // "Nova conversa" é o nome provisório de quem mandou a imagem antes da primeira frase (D45).
          titulo: out.escopo.nome || (atual && atual.titulo !== 'Nova conversa' && atual.titulo) || linha(primeira && primeira.texto, 60),
          mensagens: mensagens.slice(-MAX_MENSAGENS),
          escopo: out.escopo,
          decisoes: out.decisoes || (atual && atual.decisoes) || [],
          referencias: (atual && atual.referencias) || [],
          estado: manter ? ((atual && atual.estado) || 'conversando') : (out.pronto ? 'entendido' : 'conversando'),
          campanhaId: (atual && atual.campanhaId) || '',
        };
        const salva = atual
          ? await db.salvarConversa(sess.tenant_id, atual.id, dados)
          : await db.criarConversa(sess.tenant_id, sess.user_id, dados);
        /*
         * Na primeira vez que a IA entende, o que a conversa revelou sobre a
         * EMPRESA vai para a memória — a próxima conversa já começa sabendo.
         * Em segundo plano: ninguém espera por um ganho da próxima vez.
         */
        if (out.pronto && !falhou && (!atual || atual.estado !== 'entendido') && out.modo !== 'dev') {
          memory.aprender(c.memoria, mensagens, { briefing: [out.escopo.objetivo, out.escopo.publico].filter(Boolean).join('. ') })
            .then((nova) => db.saveMemoria(sess.tenant_id, nova))
            .catch(() => { /* memória é ganho acumulado, não requisito */ });
        }
        await db.registrarEvento(sess.tenant_id, sess.user_id, 'ia.conversa');
        return sendJson(res, 200, {
          conversa: salva, pronto: out.tipo === 'duvida' ? prontoAntes : out.pronto, gerar: !!out.gerar,
          sugestoes: out.sugestoes, modo: out.modo, falha: out.falha || '', tipo: out.tipo || '',
        });
      } catch (e) {
        erros.registrar(e, { rota: '/api/ai/conversa' });
        return sendJson(res, 500, { error: 'não deu para continuar a conversa agora' });
      }
    });
  }

  async function tratar(req, res, parts, query, sess) {
    const ehVolta = parts[1] === 'ai' && parts[2] === 'conversa';
    if (!ehVolta && parts[1] !== 'conversas') return false;
    if (!sess) { sendJson(res, 401, { error: 'não autenticado' }); return true; }

    if (ehVolta) {
      if (req.method !== 'POST') { sendJson(res, 405, { error: 'método inválido' }); return true; }
      await volta(req, res, sess);
      return true;
    }

    /*
     * Todas as conversas (D49), não só as 20 últimas: busca pelo título,
     * `estado` = andamento | criadas, arquivadas à parte e páginas de 30.
     */
    if (parts.length === 3 && parts[2] === 'referencia') {
      if (req.method !== 'POST') { sendJson(res, 405, { error: 'método inválido' }); return true; }
      await receberReferencia(req, res, sess, query, null);
      return true;
    }
    if (parts.length === 4 && parts[3] === 'referencia' && /^conv_[a-z0-9]{6,40}$/i.test(parts[2] || '')) {
      if (req.method !== 'POST') { sendJson(res, 405, { error: 'método inválido' }); return true; }
      const atual = await db.lerConversa(sess.tenant_id, parts[2]);
      if (!atual || atual.tipo === 'edicao') { req.resume(); sendJson(res, 404, { error: 'conversa não encontrada' }); return true; }
      await receberReferencia(req, res, sess, query, atual);
      return true;
    }
    if (parts.length === 2 && req.method === 'GET') {
      const POR_PAGINA = 30;
      const estado = query.estado === 'criadas' || query.estado === 'andamento' ? query.estado : '';
      const lista = await db.listarConversas(sess.tenant_id, POR_PAGINA + 1, {
        q: query.q, estado, arquivadas: query.arquivadas === '1', pular: Number(query.pular) || 0,
      });
      sendJson(res, 200, { conversas: lista.slice(0, POR_PAGINA), mais: lista.length > POR_PAGINA });
      return true;
    }
    const id = parts[2];
    if (parts.length === 3 && /^conv_[a-z0-9]{6,40}$/i.test(id || '')) {
      const atual = await db.lerConversa(sess.tenant_id, id);
      if (!atual) { sendJson(res, 404, { error: 'conversa não encontrada' }); return true; }
      if (req.method === 'GET') { sendJson(res, 200, { conversa: atual }); return true; }
      if (req.method === 'PUT') {
        readBody(req, res, async (b) => {
          // D49: renomear e arquivar, sem tocar no escopo nem nas mensagens.
          if (b && typeof b.titulo === 'string') {
            const titulo = linha(b.titulo, 80);
            if (!titulo) return sendJson(res, 400, { error: 'dê um nome à conversa' });
            return sendJson(res, 200, { conversa: await db.renomearConversa(sess.tenant_id, id, titulo) });
          }
          if (b && typeof b.arquivada === 'boolean') {
            return sendJson(res, 200, { conversa: await db.arquivarConversa(sess.tenant_id, id, b.arquivada) });
          }
          // D48: a pessoa tira (ou corrige) o que foi decidido, no cartão. Passa pela mesma peneira da IA.
          // D45: mudar o uso (estilo / produto) ou tirar uma imagem; só as que já eram desta conversa.
          if (b && Array.isArray(b.referencias)) {
            const referencias = refs.conferirLista(b.referencias, atual.referencias);
            return sendJson(res, 200, { conversa: await db.salvarConversa(sess.tenant_id, id, { ...atual, referencias }) });
          }
          if (b && Array.isArray(b.decisoes)) {
            const decisoes = conversa.mesclarDecisoes(b.decisoes, [], []);
            return sendJson(res, 200, { conversa: await db.salvarConversa(sess.tenant_id, id, { ...atual, decisoes }) });
          }
          if (!b || !b.escopo || typeof b.escopo !== 'object') return sendJson(res, 400, { error: 'envie o escopo' });
          const c = await contexto(sess.tenant_id);
          const escopo = conversa.conferirEscopo(b.escopo, c);
          const salva = await db.salvarConversa(sess.tenant_id, id, { ...atual, escopo, titulo: escopo.nome || atual.titulo });
          return sendJson(res, 200, { conversa: salva, custo: E.custo(escopo) });
        });
        return true;
      }
      sendJson(res, 405, { error: 'método inválido' });
      return true;
    }
    sendJson(res, 404, { error: 'não encontrado' });
    return true;
  }

  return tratar;
};
