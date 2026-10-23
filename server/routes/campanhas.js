/*
 * server/routes/campanhas.js — gerar o ecossistema e guardar a campanha
 * (EXECUTOR §2b, item 23).
 *
 *   POST /api/ai/ecossistema   { conversaId?, escopo? }
 *     roda como TRABALHO (a geração leva minutos): devolve o job, e o
 *     resultado é { campanha } — já salva, sem a pessoa apertar nada.
 *   GET  /api/campanhas         as recentes da conta (sem o resultado)
 *   GET  /api/campanhas/:id     uma, inteira
 *   POST /api/ai/editar          { campanhaId, texto } — uma volta de Editar com a IA (D50)
 *   GET  /api/campanhas/:id/edicao   a conversa de edição dela (mensagens, decisões, imagens)
 *   PUT  /api/campanhas/:id/edicao   { referencias } muda o uso ou tira uma imagem (D45)
 *   POST /api/campanhas/:id/referencia?uso=estilo|produto   imagem nova na edição (bytes no corpo)
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
const edicao = require('../edicao');
const refs = require('../referencias');
const conversa = require('../ai-conversa');
const ajuste = require('../ajuste');
const paleta = require('../paleta.js');
const P = require('../../js/peca-html.js');

/*
 * A capa da campanha (item 29): a primeira peça da principal (ou a primeira
 * que houver). É o que a lista de Campanhas mostra sem carregar o resultado.
 */
function capaDe(r) {
  // `n`: quantas peças a pasta tem (D10) — o cartão diz sem abrir a campanha.
  const n = ajuste.numerar(r).length;
  const telas = (r && r.telas) || [];
  for (const t of telas) if (t.zonas.principal[0]) return { item: t.zonas.principal[0].item, formato: t.zonas.principal[0].formato, n };
  for (const t of telas) {
    const p = t.zonas.lateral[0] || t.zonas.cabecalho.pecas[0] || t.zonas.rodape.pecas[0];
    if (p) return { item: p.item, formato: p.formato, n };
  }
  const b = ((r && r.biblioteca) || [])[0];
  return b ? { item: b.item, formato: b.formato, n } : null;
}

function configDe(d) {
  try { return typeof d.config === 'string' ? JSON.parse(d.config || '{}') : (d.config || {}); } catch (e) { return {}; }
}

module.exports = function (ctx) {
  const { db, sendJson, readBody, rateLimit, emTrabalho, marcaDaConta, fotoDaConta, estiloDasReferencias, midia, plans } = ctx;

  // A conversa de edição da campanha (D50), criada na primeira vez com o combinado da original (D48).
  async function conversaDaEdicao(sess, c) {
    const ja = await db.conversaDeEdicao(sess.tenant_id, c.id);
    if (ja) return ja;
    const original = c.conversaId ? await db.lerConversa(sess.tenant_id, c.conversaId).catch(() => null) : null;
    return db.criarConversa(sess.tenant_id, sess.user_id, {
      titulo: ('Edição: ' + (c.nome || 'campanha')).slice(0, 80), mensagens: [], escopo: null, estado: 'conversando',
      campanhaId: c.id, decisoes: (original && original.decisoes) || [], tipo: 'edicao', referencias: [],
    });
  }

  async function gerar(req, res, sess) {
    // Várias chamadas de modelo e fotos: o mesmo teto da campanha de Meus Designs.
    const rl = rateLimit('ai:eco:' + sess.tenant_id, 10, 60 * 60 * 1000);
    if (!rl.ok) return sendJson(res, 429, { error: 'muitas campanhas nesta hora. Espere um pouco.' }, { 'Retry-After': String(rl.retryAfter) });
    return readBody(req, res, async (b) => {
      const conversaId = b && typeof b.conversaId === 'string' ? b.conversaId : '';
      const conv = conversaId ? await db.lerConversa(sess.tenant_id, conversaId) : null;
      if (conversaId && !conv) return sendJson(res, 404, { error: 'conversa não encontrada' });
      const ctxConta = await contextoDaConta(sess.tenant_id);
      // D48: o que a pessoa decidiu na conversa (preço, frase exata, o que não quer) vai ao gerador.
      if (conv && Array.isArray(conv.decisoes)) ctxConta.combinado = conv.decisoes;
      // D45: as imagens da conversa — estilo guia o desenho; a do produto vai como foto da empresa.
      if (conv && (conv.referencias || []).length) ctxConta.marca = refs.naMarca(ctxConta.marca, conv.referencias);
      // O alvo é conferido contra as TVs desta conta, como na conversa.
      const escopo = conversa.conferirEscopo(b && b.escopo && typeof b.escopo === 'object' ? b.escopo : (conv && conv.escopo), ctxConta);
      if (!E.temOQueGerar(escopo)) return sendJson(res, 400, { error: 'ainda não tem nada para criar: diga o que quer mostrar' });
      await db.registrarEvento(sess.tenant_id, sess.user_id, 'ia.ecossistema');
      return emTrabalho(res, sess, 'campanha', { brief: (escopo.nome || 'Campanha').slice(0, 200) }, async (progresso) => {
        const resultado = await eco.gerar(escopo, ctxConta, { onImagem: fotoDaConta(sess, null), onProgresso: progresso, onLerReferencias: estiloDasReferencias });
        progresso('guardando a campanha', '');
        const campanha = await db.criarCampanha(sess.tenant_id, sess.user_id, {
          nome: resultado.nome, conversaId: conv ? conv.id : '', escopo, resultado, estado: 'pronta', telas: [], capa: capaDe(resultado),
        });
        /*
         * A campanha NÃO vai mais para a biblioteca (item 29): cada geração com o
         * mesmo nome empilhava as peças na mesma pasta de Meus Designs, e a
         * campanha aparecia repetida. Ela mora em Campanhas; as peças prontas
         * dela aparecem em Mídias › Peças prontas (item 34).
         */
        if (conv) await db.salvarConversa(sess.tenant_id, conv.id, { ...conv, escopo, estado: 'gerado', campanhaId: campanha.id });
        return { campanha };
      });
    });
  }

  // O que o gerador precisa saber da conta, para o ajuste desenhar igual (item 26).
  async function contextoDaConta(tenantId) {
    const [{ kit, marca, lembrada }, telasDb, tenant] = await Promise.all([
      marcaDaConta(tenantId), db.listDevices(tenantId), db.getTenant(tenantId),
    ]);
    const k = kit || {};
    return {
      empresa: (k.nome && k.nome !== 'Marca principal' ? k.nome : '') || (tenant && tenant.name) || '',
      segmento: (lembrada && lembrada.segmento) || '', marca: marca || {}, memoria: lembrada, local: k.local || {},
      ramo: Pal.detectarRamo([tenant && tenant.name, k.nome, lembrada && lembrada.segmento, k.siteResumo]),
      // Empresa, Comércio ou Saúde (D4): muda o que a campanha diz.
      perfil: await paleta.perfilDaConta(db, tenantId, tenant),
      telas: (telasDb || []).map((d) => ({ id: d.id, nome: d.name || '', emPe: /^portrait/.test((configDe(d).settings || {}).layoutId || '') })),
    };
  }

  /*
   * AJUSTAR DEPOIS (item 26): "troca a foto da peça 2". Só o que o pedido
   * aponta é refeito, e só a foto nova é cobrada (fotoDaConta). O resultado
   * de antes fica guardado para desfazer.
   */
  async function ajustar(req, res, sess) {
    const rl = rateLimit('ai:ajuste:' + sess.tenant_id, 30, 60 * 60 * 1000);
    if (!rl.ok) return sendJson(res, 429, { error: 'muitos ajustes nesta hora. Espere um pouco.' }, { 'Retry-After': String(rl.retryAfter) });
    return readBody(req, res, async (b) => {
      const texto = String((b && b.texto) || '').trim().slice(0, 600);
      if (!texto) return sendJson(res, 400, { error: 'diga o que mudar' });
      const id = b && typeof b.campanhaId === 'string' ? b.campanhaId : '';
      const c = id ? await db.lerCampanha(sess.tenant_id, id) : null;
      if (!c || !c.resultado) return sendJson(res, 404, { error: 'campanha não encontrada' });
      return emTrabalho(res, sess, 'campanha', { brief: ('Ajuste: ' + texto).slice(0, 200) }, async (progresso) => {
        progresso('entendendo o ajuste', texto.slice(0, 80));
        const { resposta, mudancas } = await ajuste.entender(texto, c);
        if (!mudancas.length) return { campanha: c, resposta, mudancas };
        const ctxConta = await contextoDaConta(sess.tenant_id);
        const feito = await ajuste.aplicar(c, mudancas, ctxConta, { onImagem: fotoDaConta(sess, null), onProgresso: progresso });
        const salva = await db.salvarCampanha(sess.tenant_id, c.id, { ...c, resultado: feito.resultado, escopo: feito.escopo, capa: capaDe(feito.resultado) });
        if (c.conversaId) {
          const conv = await db.lerConversa(sess.tenant_id, c.conversaId);
          if (conv) {
            const mensagens = (conv.mensagens || []).concat({ papel: 'pessoa', texto, em: Date.now() }, { papel: 'ia', texto: resposta, em: Date.now() }).slice(-200);
            await db.salvarConversa(sess.tenant_id, conv.id, { ...conv, mensagens, escopo: feito.escopo });
          }
        }
        return { campanha: salva, resposta, mudancas, refeitas: feito.refeitas };
      });
    });
  }

  /*
   * EDITAR COM A IA (D50): uma volta da conversa de edição da campanha. Roda
   * como trabalho, como o ajuste (pode ter foto nova). Pergunta quando não
   * entendeu; quando entende, aplica só o que foi pedido (server/ajuste.js),
   * com "Desfazer". A conversa fica guardada (tipo 'edicao'), com as decisões
   * da conversa que criou a campanha.
   */
  async function editar(req, res, sess) {
    const rl = rateLimit('ai:editar:' + sess.tenant_id, 60, 60 * 60 * 1000);
    if (!rl.ok) return sendJson(res, 429, { error: 'muitas mensagens nesta hora. Espere um pouco.' }, { 'Retry-After': String(rl.retryAfter) });
    return readBody(req, res, async (b) => {
      const texto = String((b && b.texto) || '').replace(/\s+/g, ' ').trim().slice(0, 1000);
      if (!texto) return sendJson(res, 400, { error: 'diga o que mudar' });
      const id = b && typeof b.campanhaId === 'string' ? b.campanhaId : '';
      const c = id ? await db.lerCampanha(sess.tenant_id, id) : null;
      if (!c || !c.resultado) return sendJson(res, 404, { error: 'campanha não encontrada' });
      return emTrabalho(res, sess, 'campanha', { brief: ('Edição: ' + texto).slice(0, 200) }, async (progresso) => {
        progresso('entendendo o pedido', texto.slice(0, 80));
        const conv = await conversaDaEdicao(sess, c);
        const mensagens = (conv.mensagens || []).concat({ papel: 'pessoa', texto, em: Date.now() });
        const out = await edicao.conversar({ texto, mensagens, decisoes: conv.decisoes || [], campanha: c, referencias: conv.referencias || [] });
        let salva = c;
        let refeitas = 0;
        if (out.acao === 'fazer' && out.mudancas.length) {
          const ctxConta = await contextoDaConta(sess.tenant_id);
          const feito = await ajuste.aplicar(c, out.mudancas, ctxConta, { onImagem: fotoDaConta(sess, null), onProgresso: progresso });
          salva = await db.salvarCampanha(sess.tenant_id, c.id, { ...c, resultado: feito.resultado, escopo: feito.escopo, capa: capaDe(feito.resultado) });
          refeitas = feito.refeitas;
        }
        mensagens.push(Object.assign({ papel: 'ia', texto: out.resposta, sugestoes: out.sugestoes || [], em: Date.now() },
          out.acao === 'fazer' && out.mudancas.length ? { feito: out.mudancas.map(ajuste.descreverMudanca) } : {},
          out.pendente ? { pendente: out.pendente } : {}, out.modo === 'falha' ? { falha: true } : {}));
        const guardada = await db.salvarConversa(sess.tenant_id, conv.id, { ...conv, mensagens: mensagens.slice(-200), decisoes: out.decisoes || conv.decisoes || [] });
        return { campanha: salva, resposta: out.resposta, sugestoes: out.sugestoes || [], acao: out.acao, mudancas: out.mudancas, refeitas, conversa: guardada };
      });
    });
  }

  async function tratar(req, res, parts, query, sess) {
    const ehGerar = parts[1] === 'ai' && parts[2] === 'ecossistema';
    const ehAjustar = parts[1] === 'ai' && parts[2] === 'ajustar';
    const ehEditar = parts[1] === 'ai' && parts[2] === 'editar';
    if (!ehGerar && !ehAjustar && !ehEditar && parts[1] !== 'campanhas') return false;
    if (!sess) { sendJson(res, 401, { error: 'não autenticado' }); return true; }
    if (ehGerar || ehAjustar || ehEditar) {
      if (req.method !== 'POST') { sendJson(res, 405, { error: 'método inválido' }); return true; }
      await (ehGerar ? gerar(req, res, sess) : ehAjustar ? ajustar(req, res, sess) : editar(req, res, sess));
      return true;
    }
    // A conversa de edição de uma campanha (D50): para o painel mostrar a história ao abrir.
    if (parts.length === 4 && /^camp_[a-z0-9]{6,40}$/i.test(parts[2] || '') && parts[3] === 'edicao' && req.method === 'GET') {
      const c = await db.lerCampanha(sess.tenant_id, parts[2]);
      if (!c) { sendJson(res, 404, { error: 'campanha não encontrada' }); return true; }
      const conv = await db.conversaDeEdicao(sess.tenant_id, c.id);
      sendJson(res, 200, { conversa: conv ? { id: conv.id, mensagens: conv.mensagens || [], decisoes: conv.decisoes || [], referencias: conv.referencias || [] } : null });
      return true;
    }
    // As imagens da edição (D45): mudar o uso / tirar (PUT) e mandar uma nova (POST, bytes no corpo).
    if (parts.length === 4 && /^camp_[a-z0-9]{6,40}$/i.test(parts[2] || '') && (parts[3] === 'referencia' || (parts[3] === 'edicao' && req.method === 'PUT'))) {
      const c = await db.lerCampanha(sess.tenant_id, parts[2]);
      if (!c) { req.resume(); sendJson(res, 404, { error: 'campanha não encontrada' }); return true; }
      if (parts[3] === 'edicao') {
        readBody(req, res, async (b) => {
          if (!b || !Array.isArray(b.referencias)) return sendJson(res, 400, { error: 'envie as imagens' });
          const conv = await conversaDaEdicao(sess, c);
          const salva = await db.salvarConversa(sess.tenant_id, conv.id, { ...conv, referencias: refs.conferirLista(b.referencias, conv.referencias) });
          return sendJson(res, 200, { conversa: { id: salva.id, mensagens: salva.mensagens || [], decisoes: salva.decisoes || [], referencias: salva.referencias || [] } });
        });
        return true;
      }
      if (req.method !== 'POST') { req.resume(); sendJson(res, 405, { error: 'método inválido' }); return true; }
      const rl = rateLimit('ref:' + sess.tenant_id, 60, 60 * 60 * 1000);
      if (!rl.ok) { req.resume(); sendJson(res, 429, { error: 'muitas imagens nesta hora. Espere um pouco.' }, { 'Retry-After': String(rl.retryAfter) }); return true; }
      const conv = await conversaDaEdicao(sess, c);
      if ((conv.referencias || []).length >= refs.MAX_POR_CONVERSA) { req.resume(); sendJson(res, 400, { error: 'até ' + refs.MAX_POR_CONVERSA + ' imagens por conversa' }); return true; }
      const [usado, telas, tenant] = await Promise.all([db.sumMediaBytes(sess.tenant_id), db.countDevices(sess.tenant_id), db.getTenant(sess.tenant_id)]);
      const r = await refs.receber({ db, midia, tenantId: sess.tenant_id, req, uso: query.uso, cota: plans.cotaBytes(tenant && tenant.plan, Math.max(1, telas)), usado });
      if (r.erro) { sendJson(res, r.status, { error: r.erro }); return true; }
      const salva = await db.salvarConversa(sess.tenant_id, conv.id, { ...conv, referencias: (conv.referencias || []).concat(r.referencia) });
      sendJson(res, 201, { referencia: r.referencia, conversa: { id: salva.id, mensagens: salva.mensagens || [], decisoes: salva.decisoes || [], referencias: salva.referencias || [] } });
      return true;
    }
    /*
     * O letreiro editável (D12): o dono pediu o rodapé "mais editável". As
     * frases do rodapé e as chamadas do cabeçalho de uma TV da campanha, à
     * mão — o que a pessoa escreve vale como escreveu (até 8, 80 letras cada).
     * Entra no "desfazer", como editar uma peça.
     */
    if (parts.length === 4 && /^camp_[a-z0-9]{6,40}$/i.test(parts[2] || '') && parts[3] === 'letreiro') {
      if (req.method !== 'PUT') { sendJson(res, 405, { error: 'método inválido' }); return true; }
      const c = await db.lerCampanha(sess.tenant_id, parts[2]);
      if (!c || !c.resultado) { sendJson(res, 404, { error: 'campanha não encontrada' }); return true; }
      readBody(req, res, async (b) => {
        const ti = Number(b && b.tela);
        const zona = b && (b.zona === 'cabecalho' || b.zona === 'rodape') ? b.zona : null;
        const tela = Number.isInteger(ti) && c.resultado.telas ? c.resultado.telas[ti] : null;
        if (!tela || !zona) return sendJson(res, 400, { error: 'diga qual TV e qual faixa' });
        const mensagens = (Array.isArray(b.mensagens) ? b.mensagens : [])
          .map((m) => String(m == null ? '' : m).replace(/\s+/g, ' ').trim().slice(0, 80)).filter(Boolean).slice(0, 8);
        const r = JSON.parse(JSON.stringify(c.resultado));
        r.telas[ti].zonas[zona].mensagens = mensagens;
        const anterior = { ...c.resultado }; delete anterior.anterior;
        r.anterior = { resultado: anterior, escopo: c.escopo };
        return sendJson(res, 200, { campanha: await db.salvarCampanha(sess.tenant_id, c.id, { ...c, resultado: r, capa: capaDe(r) }) });
      });
      return true;
    }
    // Editar uma peça à mão (EditarPeca) e desfazer o último ajuste.
    if (parts.length === 4 && /^camp_[a-z0-9]{6,40}$/i.test(parts[2] || '') && (parts[3] === 'peca' || parts[3] === 'desfazer')) {
      if (req.method !== (parts[3] === 'peca' ? 'PUT' : 'POST')) { sendJson(res, 405, { error: 'método inválido' }); return true; }
      const c = await db.lerCampanha(sess.tenant_id, parts[2]);
      if (!c || !c.resultado) { sendJson(res, 404, { error: 'campanha não encontrada' }); return true; }
      if (parts[3] === 'desfazer') {
        const volta = ajuste.desfazer(c);
        if (!volta) { sendJson(res, 409, { error: 'não há ajuste para desfazer' }); return true; }
        sendJson(res, 200, { campanha: await db.salvarCampanha(sess.tenant_id, c.id, { ...c, resultado: volta.resultado, escopo: volta.escopo, capa: capaDe(volta.resultado) }) });
        return true;
      }
      readBody(req, res, async (b) => {
        const vaga = String((b && b.vaga) || '');
        const alvo = ajuste.numerar(c.resultado).find((x) => x.peca.vaga === vaga);
        if (!alvo) return sendJson(res, 404, { error: 'peça não encontrada' });
        // A peça editada passa pela porta da TV, como qualquer outra.
        const v = P.validarItem(b && b.item);
        if (v.problemas.length) return sendJson(res, 400, { error: 'a peça não passou: ' + v.problemas[0] });
        const r = JSON.parse(JSON.stringify(c.resultado));
        const z = r.telas[alvo.tela].zonas[alvo.zona];
        const lista = Array.isArray(z) ? z : z.pecas;
        const i = lista.findIndex((x) => x.vaga === vaga);
        const antes = lista[i];
        lista[i] = { ...antes, item: { ...antes.item, ...v.item, formato: antes.formato, ...(antes.item.agendamento ? { agendamento: antes.item.agendamento } : {}) },
          label: String((b.item.campos && (b.item.campos.titulo || b.item.campos.chamada)) || antes.label).slice(0, 40) };
        const anterior = { ...c.resultado }; delete anterior.anterior;
        r.anterior = { resultado: anterior, escopo: c.escopo };
        return sendJson(res, 200, { campanha: await db.salvarCampanha(sess.tenant_id, c.id, { ...c, resultado: r, capa: capaDe(r) }) });
      });
      return true;
    }
    /*
     * As peças prontas das campanhas (item 32): o Adicionar de uma zona e
     * Mídias › Peças prontas mostram o que já foi criado, com o papel de
     * cada peça (cabeçalho, destaque, lateral, rodapé) para saber onde cabe.
     */
    if (parts.length === 3 && parts[2] === 'pecas' && req.method === 'GET') {
      const lista = await db.listarCampanhas(sess.tenant_id, 60);
      const pecas = [];
      for (const c of lista) {
        const k = await db.lerCampanha(sess.tenant_id, c.id);
        for (const x of ajuste.numerar(k && k.resultado)) {
          pecas.push({ campanha: c.nome, campanhaId: c.id, vaga: x.peca.vaga, zona: x.zona, papel: x.peca.papel, formato: x.peca.formato, label: x.peca.label, item: x.peca.item });
          if (pecas.length >= 120) break;
        }
        if (pecas.length >= 120) break;
      }
      sendJson(res, 200, { pecas });
      return true;
    }
    /*
     * A lista (D10): era um corte calado de 20 — a 21ª campanha sumia sem
     * aviso. Agora vem em páginas de 30 (`mais` diz se há outra), com busca
     * pelo nome e as arquivadas à parte.
     */
    if (parts.length === 2 && req.method === 'GET') {
      const POR_PAGINA = 30;
      const q = query || {};
      const lista = await db.listarCampanhas(sess.tenant_id, POR_PAGINA + 1, {
        q: String(q.q || ''), arquivadas: q.arquivadas === '1', pular: Number(q.pular) || 0,
      });
      const mais = lista.length > POR_PAGINA;
      const pagina = lista.slice(0, POR_PAGINA);
      /*
       * Campanha de antes da capa (ou da contagem de peças): calcula agora e
       * GRAVA só a capa — sem mexer em atualizado_em, para não mudar a ordem.
       */
      for (const c of pagina) {
        if (c.capa && c.capa.n != null) continue;
        const k = await db.lerCampanha(sess.tenant_id, c.id);
        c.capa = k && k.resultado ? capaDe(k.resultado) : null;
        if (c.capa) await db.salvarCapaDaCampanha(sess.tenant_id, c.id, c.capa).catch(() => {});
      }
      sendJson(res, 200, { campanhas: pagina, mais });
      return true;
    }
    const id = parts[2];
    if (parts.length === 3 && /^camp_[a-z0-9]{6,40}$/i.test(id || '') && ['GET', 'PUT', 'DELETE'].includes(req.method)) {
      const c = await db.lerCampanha(sess.tenant_id, id);
      if (!c) { sendJson(res, 404, { error: 'campanha não encontrada' }); return true; }
      if (req.method === 'GET') { sendJson(res, 200, { campanha: c }); return true; }
      /*
       * Excluir (D10). A campanha no ar pergunta antes: as peças continuam nas
       * TVs (a programação tem a cópia delas), e quem exclui achando que tira
       * da TV precisa saber disso. Com ?forcar=1, exclui.
       */
      if (req.method === 'DELETE') {
        if (c.estado === 'no_ar' && !(query && query.forcar === '1')) {
          sendJson(res, 409, { error: 'esta campanha está no ar', code: 'campanha-no-ar', telas: (c.telas || []).length });
          return true;
        }
        await db.removerCampanha(sess.tenant_id, id);
        await db.registrarEvento(sess.tenant_id, sess.user_id, 'campanha.excluir');
        sendJson(res, 200, { ok: true });
        return true;
      }
      /*
       * "Pôr pra rodar" e "Pausar" (item 25): quem põe as peças na TV é o
       * painel, pelo mesmo PUT da config de sempre (que passa pela porta).
       * Aqui fica o ESTADO — no ar, pausada — e em quais TVs, para a campanha
       * saber de onde sair. Só vale TV desta conta.
       */
      readBody(req, res, async (b) => {
        /*
         * Renomear e arquivar (D10) vêm pelo mesmo PUT, sozinhos ou juntos.
         * Arquivar não mexe no estado nem na ordem; renomear não muda o resto.
         */
        const soNome = b && typeof b.nome === 'string' && b.estado === undefined;
        const soArquivo = b && typeof b.arquivada === 'boolean' && b.estado === undefined;
        if (soNome || soArquivo) {
          let atual = c;
          if (soNome) {
            const nome = b.nome.replace(/\s+/g, ' ').trim().slice(0, 80);
            if (!nome) return sendJson(res, 400, { error: 'dê um nome à campanha' });
            atual = await db.salvarCampanha(sess.tenant_id, id, { ...c, nome });
          }
          if (soArquivo) atual = await db.arquivarCampanha(sess.tenant_id, id, b.arquivada);
          return sendJson(res, 200, { campanha: atual });
        }
        const estado = ['pronta', 'no_ar', 'pausada'].includes(b && b.estado) ? b.estado : null;
        if (!estado) return sendJson(res, 400, { error: 'estado inválido' });
        const daConta = new Set(((await db.listDevices(sess.tenant_id)) || []).map((d) => d.id));
        const telas = (Array.isArray(b.telas) ? b.telas : c.telas).filter((t) => daConta.has(t)).slice(0, 50);
        const salva = await db.salvarCampanha(sess.tenant_id, id, { ...c, estado, telas });
        await db.registrarEvento(sess.tenant_id, sess.user_id, estado === 'no_ar' ? 'campanha.rodar' : 'campanha.' + estado);
        return sendJson(res, 200, { campanha: salva });
      });
      return true;
    }
    sendJson(res, 404, { error: 'não encontrado' });
    return true;
  }

  return tratar;
};
