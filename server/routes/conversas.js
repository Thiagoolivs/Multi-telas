/*
 * server/routes/conversas.js — a conversa do Criar (EXECUTOR §2b, item 21).
 *
 *   POST /api/ai/conversa       { id?, texto, escopo? }
 *     uma volta: guarda a fala da pessoa, pergunta à IA, guarda a resposta
 *     → { conversa, pronto, sugestoes }
 *   GET  /api/conversas          as recentes da conta (sem as mensagens)
 *   GET  /api/conversas/:id      uma, inteira
 *   PUT  /api/conversas/:id      { escopo }: o que a pessoa mudou à mão no
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

// O que a conversa guarda. Mais que isso, as mais antigas saem: o escopo já as resume.
const MAX_MENSAGENS = 200;
const DIAS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];

const linha = (s, n) => String(s == null ? '' : s).replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, ' ').trim().slice(0, n);

function configDe(d) {
  try { return typeof d.config === 'string' ? JSON.parse(d.config || '{}') : (d.config || {}); } catch (e) { return {}; }
}

module.exports = function (ctx) {
  const { db, sendJson, readBody, rateLimit, erros } = ctx;

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
        const mensagens = ((atual && atual.mensagens) || []).concat({ papel: 'pessoa', texto, em: Date.now() });
        // O escopo do cartão (que a pessoa pode ter mudado à mão) vence o guardado.
        const escopo = b && b.escopo && typeof b.escopo === 'object' ? b.escopo : (atual && atual.escopo);
        const out = await conversa.conversar({ mensagens, escopo, ctx: c });
        /*
         * Na falha, a frase aparece para a pessoa mas é marcada: a próxima
         * volta não a manda para a IA como se fosse fala dela (transcricao),
         * o estado da conversa não anda e a memória não aprende nada.
         */
        const falhou = out.modo === 'falha';
        mensagens.push({ papel: 'ia', texto: out.resposta, sugestoes: out.sugestoes, em: Date.now(), ...(falhou ? { falha: true } : {}) });
        const primeira = mensagens.find((m) => m.papel === 'pessoa');
        const dados = {
          titulo: out.escopo.nome || (atual && atual.titulo) || linha(primeira && primeira.texto, 60),
          mensagens: mensagens.slice(-MAX_MENSAGENS),
          escopo: out.escopo,
          estado: falhou ? ((atual && atual.estado) || 'conversando') : (out.pronto ? 'entendido' : 'conversando'),
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
        return sendJson(res, 200, { conversa: salva, pronto: out.pronto, gerar: !!out.gerar, sugestoes: out.sugestoes, modo: out.modo, falha: out.falha || '' });
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

    if (parts.length === 2 && req.method === 'GET') {
      sendJson(res, 200, { conversas: await db.listarConversas(sess.tenant_id, 20) });
      return true;
    }
    const id = parts[2];
    if (parts.length === 3 && /^conv_[a-z0-9]{6,40}$/i.test(id || '')) {
      const atual = await db.lerConversa(sess.tenant_id, id);
      if (!atual) { sendJson(res, 404, { error: 'conversa não encontrada' }); return true; }
      if (req.method === 'GET') { sendJson(res, 200, { conversa: atual }); return true; }
      if (req.method === 'PUT') {
        readBody(req, res, async (b) => {
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
