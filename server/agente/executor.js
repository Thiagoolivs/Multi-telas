/*
 * server/agente/executor.js — depois da validação: gerar, conferir, corrigir
 * e pôr no ar, sem um segundo toque.
 *
 * A pessoa validou o plano (a chave DESTE plano, gravada na conversa). Cada
 * item vai pelo seu caminho, os independentes ao mesmo tempo:
 *
 *   aviso     a peça do aviso (a peça-ouro de alerta, com a marca) → a porta → no ar
 *   quiz      as perguntas validadas → no ar (o "conferi" foi a validação)
 *   peca      o desenho com os TEXTOS VALIDADOS → a conferência (a porta, a
 *             régua da letra, a lei, os fatos, a repetição) → no máximo uma
 *             revisão da IA e uma correção do desenho → a campanha salva
 *             (Biblioteca › Campanhas) → no ar
 *   campanha  o ecossistema inteiro (o gerador de sempre, com o esboço
 *             aprovado) → a conferência → no ar
 *   ajuste    a mudança na peça → CONFERE que a peça mudou mesmo (senão, uma
 *             segunda tentativa; senão, diz que não conseguiu) → no ar de novo
 *   tela      fica para a pessoa aplicar vendo o antes e o depois
 *
 * O que a lei barra NÃO vai ao ar (e o agente diz por quê); o fato que
 * ninguém disse vai, e o aviso aparece na mensagem final (decisão do dono).
 * Foto gerada pela IA só quando o plano validado tinha a foto (a criação
 * do plano é gasta aqui, por fotoDaConta, que confere o saldo antes).
 */
'use strict';

const E = require('../../js/escopo.js');
const P = require('../../js/peca-html.js');
const eco = require('../ecossistema');
const ajuste = require('../ajuste');
const ajustePeca = require('../ajuste-peca');
const compositor = require('../compositor');
const conferencia = require('../conferencia');
const esboco = require('../esboco');
const ai = require('../ai');
const L = require('./limites');
const D = require('./decompor');
const G = require('./guarda');
const V = require('./variedade');
const S = require('./subagentes');
const Cr = require('./critico');
const Pub = require('./publicar');
const Enc = require('./encaixe');
const { emParalelo } = require('./orquestrador');

const corta = G.corta;

// A capa da campanha (a mesma regra de server/routes/campanhas.js): a primeira peça.
function capaDe(r) {
  const n = ajuste.numerar(r).length;
  for (const t of (r && r.telas) || []) { const p = ((t && t.zonas) || {}).principal; if (p && p[0]) return { item: p[0].item, formato: p[0].formato, n }; }
  const x = ajuste.numerar(r)[0];
  return x ? { item: x.peca.item, formato: x.peca.formato, n } : null;
}

// O resultado de uma campanha de UMA peça, no formato do gerador (o Criados abre, o Editar com a IA edita).
function resultadoDaPeca(nome, escopo, peca, conf) {
  const t = escopo.telas[0];
  return {
    versao: 1, nome, identidade: {}, social: null, horarios: [], periodo: escopo.periodo, semFoto: [],
    telas: [{ alvo: t.alvo, nome: t.nome, layout: t.layout, zonas: { principal: [peca], lateral: [], cabecalho: { pecas: [], vivos: [], mensagens: [] }, rodape: { pecas: [], vivos: [], contagem: '', mensagens: [] } } }],
    contagem: { pecas: 1, fotosGeradas: peca.comFoto ? 1 : 0 },
    biblioteca: [{ formato: peca.formato, canal: 'TV', label: peca.label, item: peca.item }],
    conferencia: conf,
  };
}

/*
 * executar({ db, sess, rotas, conversa, plano, validacao, ctx, ctxConta, progresso })
 *   rotas: { operacao, fotoDaConta, estiloDasReferencias } (o ctx das rotas)
 * Devolve { itens: [{ indice, tipo, titulo, estado, telas, lote?, aprovacao?,
 * campanhaId?, avisos, problemas, motivo? }], passos, avisos }.
 */
async function executar(env) {
  const { db, sess, rotas, plano, ctx } = env;
  const progresso = env.progresso || (() => {});
  const chaveDoPlano = env.chaveDoPlano;
  // O guarda da porta: sem validação deste plano, nada roda (nem gasta).
  Pub.conferirValidacao(env.validacao, plano, chaveDoPlano);
  const inicio = Date.now();
  const gasto0 = L.gastoAteAgora();
  const prazo = inicio + L.LIMITES.prazoExecucaoMs();
  const orcamento = L.LIMITES.orcamentoExecucaoCentavos();
  const temOrcamento = () => L.gastoAteAgora() - gasto0 < orcamento && Date.now() < prazo;
  const hojeIso = ctx.hoje || new Date().toISOString().slice(0, 10);
  const hoje = new Date(hojeIso + 'T12:00:00');
  const negativos = V.negativosDe(ctx);
  const estados = plano.itens.map((i) => (i.recusa ? 'barrado' : i.manual ? 'manual' : 'espera'));
  const passos = [];
  const marcar = (i, estado, fase) => {
    estados[i] = estado;
    // O andamento vai no trabalho: a etapa é a frase, o detalhe é o estado de cada item ("0:feito|1:fazendo|2:espera").
    progresso(fase || 'trabalhando', estados.map((e, k) => k + ':' + e).join('|'));
  };
  const envPub = { operacao: rotas.operacao, sess, ctx, validacao: env.validacao, plano, chaveDoPlano, hoje: hojeIso };
  /*
   * O ENCAIXE NO PAINEL (server/agente/encaixe.js): com `env.encaixe`, todas
   * as peças param no portão antes de ir ao ar, e o painel aberto confere se
   * cabem (um redesenho, a peça-ouro). Sem resposta no prazo, segue só com a
   * conferência do servidor — e o registro diz.
   */
  const encaixe = { usado: !!env.encaixe, respondeu: false, motivo: env.encaixe ? '' : 'desligado', pecas: 0, trocadas: 0, naoCabem: 0 };
  const rodarEncaixe = async (pecas) => {
    const t0 = Date.now();
    const pedido = Enc.pedir(sess.tenant_id, pecas.map((x) => ({ chave: x.chave, item: x.item })), env.encaixe && env.encaixe.tempos);
    progresso('Conferindo o encaixe…', 'e:' + pedido.codigo + '|' + estados.map((e, k) => k + ':' + e).join('|'));
    const r = await pedido.resposta;
    Object.assign(encaixe, { respondeu: r.respondeu, motivo: r.motivo, pecas: pecas.length });
    passos.push({ n: passos.length + 1, ferramenta: 'encaixe', ms: Date.now() - t0,
      resultado: r.respondeu ? 'o painel conferiu ' + pecas.length + (pecas.length === 1 ? ' peça' : ' peças')
        : (r.motivo === 'demorou' ? 'o painel não terminou no prazo' : 'sem o painel aberto') + ': publicado só com a conferência do servidor' });
    return r;
  };
  const porta = env.encaixe ? Enc.portao(plano.itens.length, rodarEncaixe) : null;
  // A peça que voltou do painel passa de novo pela porta e pela lei; a que não coube vai com o aviso.
  const opDoEncaixe = { perfil: ctx.perfil, contexto: ctx.empresa };
  const aplicar = (item, r) => {
    if (!r) return { item };
    if ((r.estado === 'redesenhada' || r.estado === 'reserva') && r.item) {
      const formato = item.formato || r.item.formato;
      const v = P.validarItem(Object.assign({}, r.item, { formato }));
      const novo = v.item && !(v.problemas || []).length ? Object.assign({}, v.item, { formato }) : null;
      if (novo && Cr.conferir(novo, opDoEncaixe).ok) { encaixe.trocadas++; return { item: novo, troca: r.estado }; }
      return { item, aviso: 'O redesenho para caber na TV não passou na conferência: a peça foi como estava.' };
    }
    if (r.estado === 'nao-cabe') {
      encaixe.naoCabem++;
      return { item, aviso: 'Pode não caber na TV: ' + corta((r.avisos || [])[0] || 'o texto passa da borda', 120) + '. Encurte o texto em Biblioteca › Campanhas.' };
    }
    return { item };
  };
  const fotoDaConta = rotas.fotoDaConta ? rotas.fotoDaConta(sess, null) : null;
  const ctxConta = env.ctxConta || {};

  const um = async (item) => {
    const i = item.indice;
    const t0 = Date.now();
    let chegou = false;
    /*
     * O portão do item: [{ chave, item }] → { chave: { item, troca?, aviso? } }.
     * Sem o painel (ou sem portão), as peças voltam como foram.
     */
    const encaixar = async (pecas) => {
      if (!porta) return {};
      // Sem peça desenhada (o quiz) também espera: o plano vai ao ar junto, depois da conferência.
      chegou = true;
      const r = await porta.chegar(pecas);
      const doItem = {};
      for (const x of pecas) doItem[x.chave] = aplicar(x.item, r && r.respondeu ? r.resultados[x.chave] : null);
      return doItem;
    };
    const saida = { indice: i, tipo: item.tipo, titulo: item.titulo, onde: item.onde, avisos: (item.avisos || []).slice(), problemas: [], estado: 'erro' };
    try {
      if (item.recusa) return Object.assign(saida, { estado: 'barrado', motivo: item.recusa.texto });
      if (item.manual) return Object.assign(saida, { estado: 'manual', motivo: 'Abra o cartão e aplique vendo o antes e o depois.' });
      if (item.tipo === 'aviso') {
        marcar(i, 'fazendo', 'Escrevendo o aviso…');
        let peca = Pub.itemDoAviso(item.rascunho.aviso, ctxConta.marca || ctx.marca || {});
        const c = Cr.conferir(peca, { perfil: ctx.perfil, contexto: ctx.empresa });
        if (!c.ok) return Object.assign(saida, { estado: 'barrado', problemas: c.problemas, motivo: c.problemas[0].texto });
        const enc = (await encaixar([{ chave: i + ':1', item: peca }]))[i + ':1'];
        if (enc) { peca = enc.item; if (enc.aviso) saida.avisos.push(enc.aviso); }
        marcar(i, 'fazendo', 'Pondo nas TVs…');
        Object.assign(saida, await Pub.publicarItem(item, { item: peca }, envPub));
      } else if (item.tipo === 'quiz') {
        await encaixar([]);
        marcar(i, 'fazendo', 'Pondo o quiz nas TVs…');
        Object.assign(saida, await Pub.publicarItem(item, { id: 'agente:' + (env.conversa ? env.conversa.id : 'c') + ':' + i }, envPub));
      } else if (item.tipo === 'peca') {
        Object.assign(saida, await fazerPeca(item, { marcar, envPub, ctx, ctxConta, negativos, hoje, temOrcamento, fotoDaConta, db, sess, conversa: env.conversa, encaixar }));
      } else if (item.tipo === 'campanha') {
        Object.assign(saida, await fazerCampanha(item, { marcar, envPub, ctx, ctxConta, hoje, fotoDaConta, rotas, db, sess, conversa: env.conversa, encaixar }));
      } else if (item.tipo === 'ajuste') {
        Object.assign(saida, await fazerAjuste(item, { marcar, envPub, ctx, ctxConta, temOrcamento, fotoDaConta, db, sess, encaixar }));
      } else {
        Object.assign(saida, { estado: 'manual' });
      }
      return saida;
    } catch (e) {
      if (e && e.code === 'sem-validacao') throw e;
      require('../erros.js').registrar(e, { onde: 'agente: executar ' + item.tipo, tipo: e && e.tipo });
      return Object.assign(saida, { estado: 'erro', motivo: corta((e && e.message) || 'falhou', 160) });
    } finally {
      // Quem não passou pelo portão (o quiz, o barrado, o erro) avisa que saiu: os outros não esperam por ele.
      if (porta && !chegou) porta.sair();
      estados[i] = saida.estado === 'no-ar' || saida.estado === 'aprovacao' ? 'feito' : saida.estado;
      progresso('Conferindo o resultado…', estados.map((e, k) => k + ':' + e).join('|'));
      passos.push({ n: passos.length + 1, ferramenta: 'executar:' + item.tipo, resultado: saida.estado + (saida.motivo ? ' — ' + corta(saida.motivo, 120) : ''), ms: Date.now() - t0 });
    }
  };

  // Com o portão, todos ao mesmo tempo (no máximo LIMITES.tarefas): um item na fila esperaria os que estão parados no portão.
  const itens = await emParalelo(plano.itens, porta ? plano.itens.length : L.LIMITES.emParalelo, um);
  return { itens, passos, encaixe, gastoCentavos: Math.round((L.gastoAteAgora() - gasto0) * 1000) / 1000, ms: Date.now() - inicio };
}

/*
 * UMA PEÇA: o desenho com os textos validados. A conferência sem IA decide
 * o que barra; a revisão da IA (uma) pode pedir UMA correção do desenho.
 */
async function fazerPeca(item, o) {
  const { marcar, envPub, ctx, ctxConta, negativos, hoje, temOrcamento, fotoDaConta, db, sess } = o;
  const i = item.indice;
  const r = item.rascunho;
  const escopo = E.normalizar(r.escopo);
  const vagas = eco.vagasDoEscopo(escopo, []);
  const v = vagas[0];
  if (!v) return { estado: 'erro', motivo: 'a peça veio sem lugar na TV' };
  // A mesma vaga do esboço (o formato que a pessoa viu: a TV em pé recebe a peça em pé).
  if (r.formato === '9/16' || r.formato === '16/9') v.formato = r.formato;
  const textos = Object.assign({ kicker: '', titulo: '', apoio: '', cta: '' }, r.textos);
  const m = ctxConta.marca || ctx.marca || {};
  const { identidade, modo, marcaDaPeca } = eco.identidadeDe(m, r.direcao, r.estilo);
  let foto = null;
  if (r.foto && r.foto.gerar && fotoDaConta) {
    marcar(i, 'fazendo', 'Gerando a foto…');
    try { foto = await fotoDaConta(r.foto.descricao || textos.titulo, v.formato, identidade); } catch (e) { foto = null; }
  }
  marcar(i, 'fazendo', 'Desenhando a peça…');
  const ctxPeca = Object.assign({}, ctxConta, { perfil: ctx.perfil, empresa: ctx.empresa || ctxConta.empresa || '' });
  const comum = { escopo, ctx: ctxPeca, marcaDaPeca, modo, ditos: negativos.slice(0, 10) };
  // Sem orçamento de texto, a peça sai da peça-ouro (sem IA), com os mesmos textos.
  let peca = temOrcamento() ? await eco.comporVaga(v, textos, foto, comum) : {
    vaga: v.id, zona: v.zona, papel: v.papel, formato: v.formato, label: textos.titulo.slice(0, 40), motor: 'ouro', comFoto: !!foto,
    item: Object.assign({}, compositor.preencherPapel({ pedido: escopo.objetivo, empresa: ctxPeca.empresa, marca: marcaDaPeca, modo, papel: v.papel, foto, textos }), { formato: v.formato }),
  };
  marcar(i, 'fazendo', 'Conferindo o encaixe…');
  const permitidos = S.permitidosDaTarefa({ pedido: item.pedido, respostas: item.respostas || [] }, ctx);
  const op = { perfil: ctx.perfil, contexto: ctx.empresa, permitidos, negativos, hoje };
  let c = Cr.conferir(peca.item, op);
  let revisao = null;
  let corrigida = false;
  // A revisão da IA: uma, e uma correção do desenho no máximo (os textos ficam).
  if (c.ok && peca.motor === 'html' && temOrcamento()) {
    revisao = await Cr.revisar(peca.item, { pedido: item.pedido, negativos, tom: m.tom });
    if (revisao && revisao.revisar && temOrcamento()) {
      marcar(i, 'fazendo', 'Ajustando o desenho…');
      const nova = await eco.comporVaga(v, textos, foto, comum, { anterior: '<style>' + (peca.item.css || '') + '</style>\n' + (peca.item.html || ''), ajusteDesenho: revisao.ajuste });
      const c2 = Cr.conferir(nova.item, op);
      if (c2.ok && nova.motor === 'html') { peca = nova; c = c2; corrigida = true; }
    }
  }
  if (!c.ok) {
    // A porta recusou o desenho da IA: a peça-ouro com os mesmos textos (como o gerador de sempre).
    const reserva = Object.assign({}, compositor.preencherPapel({ pedido: escopo.objetivo, empresa: ctxPeca.empresa, marca: marcaDaPeca, modo, papel: v.papel, foto, textos }), { formato: v.formato });
    const c3 = Cr.conferir(reserva, op);
    if (!c3.ok) return { estado: 'barrado', problemas: c.problemas, motivo: c.problemas[0].texto };
    peca = Object.assign({}, peca, { item: reserva, motor: 'ouro' });
    c = c3;
  }
  const avisos = [...new Set((item.avisos || []).concat(c.avisos))];
  if (c.repete) avisos.push('O título parece com “' + corta(c.repete, 40) + '”, que já está no ar.');
  // O encaixe no painel (quando aberto): a peça que não cabia volta redesenhada ou como a peça-ouro.
  const enc = o.encaixar ? (await o.encaixar([{ chave: i + ':1', item: peca.item }]))[i + ':1'] : null;
  if (enc && enc.troca) peca = Object.assign({}, peca, { item: enc.item, motor: enc.troca === 'reserva' ? 'ouro' : peca.motor });
  if (enc && enc.aviso) avisos.push(enc.aviso);
  const conf = { bloqueios: [], avisos: c.avisos.map((a) => ({ onde: 'peça 1', motivo: a })), permitidos };
  const resultado = resultadoDaPeca(r.nome, escopo, peca, conf);
  marcar(i, 'fazendo', 'Pondo nas TVs…');
  const envio = await Pub.publicarItem(item, { item: peca.item, nome: r.nome }, envPub);
  const ids = Pub.idsDoItem(item, ctx);
  let campanhaId = '';
  if (db && db.criarCampanha) {
    const camp = await db.criarCampanha(sess.tenant_id, sess.user_id, {
      nome: r.nome, conversaId: o.conversa ? o.conversa.id : '', escopo, resultado,
      estado: envio.estado === 'no-ar' ? 'no_ar' : 'pronta', telas: envio.estado === 'no-ar' ? ids : [], capa: capaDe(resultado),
    });
    campanhaId = camp && camp.id;
  }
  return Object.assign(envio, { campanhaId, avisos, revisao: revisao ? revisao.notas : null, corrigida, motor: peca.motor });
}

/*
 * A CAMPANHA inteira: o gerador de sempre, que só roda com o esboço
 * aprovado (D42). A validação do plano É a aprovação do esboço deste
 * escopo — gravada na conversa como sempre foi.
 */
async function fazerCampanha(item, o) {
  const { marcar, envPub, ctx, ctxConta, hoje, fotoDaConta, rotas, db, sess } = o;
  const i = item.indice;
  const escopo = E.normalizar(item.rascunho.escopo);
  if (!E.temOQueGerar(escopo)) return { estado: 'erro', motivo: 'a campanha ainda não tem o que criar' };
  let conv = o.conversa;
  if (conv && db && db.salvarConversa) conv = await db.salvarConversa(sess.tenant_id, conv.id, Object.assign({}, conv, { escopo, esboco: esboco.aprovar(escopo) }));
  if (!conv || !esboco.valeParaEste(conv.esboco, escopo)) return { estado: 'erro', motivo: 'o esboço não ficou aprovado' };
  marcar(i, 'fazendo', 'Escrevendo a campanha…');
  const ctxGer = Object.assign({}, ctxConta, { combinado: conv.decisoes || [], falas: (conv.mensagens || []).filter((m) => m && m.papel === 'pessoa').map((m) => String(m.texto || '').slice(0, 600)).slice(-40) });
  const fotos = item.rascunho.fotos && item.rascunho.fotos.gerar ? fotoDaConta : null;
  const resultado = await eco.gerar(escopo, ctxGer, {
    onImagem: fotos, agora: hoje, onLerReferencias: rotas.estiloDasReferencias,
    onProgresso: (etapa) => marcar(i, 'fazendo', etapa.charAt(0).toUpperCase() + etapa.slice(1) + '…'),
  });
  const estadoDaCampanha = conferencia.estadoDepois('pronta', resultado.conferencia);
  // O encaixe no painel, peça por peça da campanha (a nova entra no lugar dela no resultado).
  const avisosDoEncaixe = await encaixarPecas(i, resultado, ajuste.numerar(resultado).map((x) => x.n), o.encaixar);
  let camp = null;
  if (db && db.criarCampanha) {
    camp = await db.criarCampanha(sess.tenant_id, sess.user_id, { nome: resultado.nome, conversaId: conv.id, escopo, resultado, estado: estadoDaCampanha, telas: [], capa: capaDe(resultado) });
    await db.salvarConversa(sess.tenant_id, conv.id, Object.assign({}, conv, { escopo, estado: 'gerado', campanhaId: camp.id }));
  }
  const avisos = ((resultado.conferencia && resultado.conferencia.avisos) || []).map((a) => (a.onde ? a.onde + ': ' : '') + (a.trecho ? '“' + a.trecho + '” ' : '') + a.motivo).concat(avisosDoEncaixe);
  if (conferencia.barraAsPecas && conferencia.barraAsPecas(resultado.conferencia)) {
    return { estado: 'barrado', campanhaId: camp && camp.id, avisos, motivo: conferencia.porQueNaoRoda(resultado.conferencia) };
  }
  marcar(i, 'fazendo', 'Pondo nas TVs…');
  const envio = await Pub.publicarItem(item, { resultado, nome: resultado.nome }, envPub);
  if (camp && envio.estado === 'no-ar') await db.salvarCampanha(sess.tenant_id, camp.id, Object.assign({}, camp, { estado: 'no_ar', telas: Pub.idsDoItem(item, ctx) }));
  return Object.assign(envio, { campanhaId: camp && camp.id, avisos });
}

/*
 * As peças `numeros` (a numeração de server/ajuste.js) de um resultado
 * passam pelo portão do encaixe; a nova entra no lugar dela. Devolve os
 * avisos (a que não coube, com o número da peça).
 */
async function encaixarPecas(i, resultado, numeros, encaixar) {
  if (!encaixar || !numeros.length) return [];
  const pecas = ajuste.numerar(resultado).filter((x) => numeros.includes(x.n) && x.peca && x.peca.item && x.peca.item.type === 'peca-html');
  const r = await encaixar(pecas.map((x) => ({ chave: i + ':' + x.n, item: x.peca.item })));
  const avisos = [];
  for (const x of pecas) {
    const e = r[i + ':' + x.n];
    if (!e) continue;
    if (e.troca) x.peca.item = e.item;
    if (e.aviso) avisos.push('Peça ' + x.n + ': ' + e.aviso);
  }
  return avisos;
}

// Uma peça "mudou de verdade"? O que a TV mostra: o desenho, os campos, as cores, o modo, o que está escondido.
const assinatura = (it) => JSON.stringify([it && it.html, it && it.css, it && it.campos, it && it.marca, it && it.modo, it && it.ocultos]);

/*
 * O AJUSTE: aplica, CONFERE que mudou, tenta de novo uma vez (com o pedido
 * mais explícito), e só então diz que não conseguiu. A campanha guarda o
 * "antes" (o Desfazer da campanha), e a TV volta pelo Desfazer do envio.
 */
async function fazerAjuste(item, o) {
  const { marcar, envPub, ctx, ctxConta, temOrcamento, fotoDaConta, db, sess } = o;
  const i = item.indice;
  const r = item.rascunho;
  const c = db && db.lerCampanha ? await db.lerCampanha(sess.tenant_id, r.campanha.id) : null;
  if (!c || !c.resultado) return { estado: 'erro', motivo: 'a campanha não está mais aqui' };
  const antes = ajuste.numerar(c.resultado);
  let resultado = null;
  let mudou = [];
  marcar(i, 'fazendo', 'Ajustando a peça…');
  if (r.modo === 'remendo') {
    const alvo = antes[(r.peca || 1) - 1];
    if (!alvo) return { estado: 'erro', motivo: 'a peça não está mais na campanha' };
    const novo = ajustePeca.comRemendo(alvo.peca.item, r.remendo || {});
    const v = P.validarItem(novo);
    if (v.problemas.length) return { estado: 'barrado', motivo: 'A mudança não passou na conferência: ' + v.problemas[0] };
    resultado = JSON.parse(JSON.stringify(c.resultado));
    const lugar = ajuste.numerar(resultado)[(r.peca || 1) - 1];
    lugar.peca.item = novo;
    mudou = assinatura(novo) !== assinatura(alvo.peca.item) ? [r.peca || 1] : [];
  } else {
    const mudancas = (r.mudancas || []).filter((m) => m && m.tipo !== 'tirar');
    const usaFoto = mudancas.some((m) => m.foto === 'trocar');
    const tentar = async (lista) => ajuste.aplicar(c, lista, ctxConta, { onImagem: usaFoto ? fotoDaConta : null, pedido: r.pedido });
    let feito = await tentar(mudancas);
    const comparar = (res) => ajuste.numerar(res).filter((x, k) => antes[k] && assinatura(x.peca.item) !== assinatura(antes[k].peca.item)).map((x) => x.n);
    mudou = comparar(feito.resultado);
    // Não mudou nada: uma segunda tentativa, com o pedido dito de novo de forma explícita (sem foto nova, para não gastar duas vezes).
    if (!mudou.length && temOrcamento() && ai.mode() !== 'dev') {
      const reforco = mudancas.map((m) => (m.desenho ? Object.assign({}, m, { foto: 'manter', desenho: m.desenho + ' — a tentativa anterior ficou igual: a mudança tem de aparecer.' }) : m));
      feito = await tentar(reforco);
      mudou = comparar(feito.resultado);
    }
    resultado = feito.resultado;
  }
  if (!mudou.length) {
    return { estado: 'nao-mudou', motivo: 'Não consegui mudar a peça como você pediu (“' + corta(r.pedido, 60) + '”). Ela ficou como estava. Tente dizer de outro jeito, ou mude à mão em Biblioteca › Campanhas.' };
  }
  // As peças que mudaram passam pelo encaixe no painel antes de ir ao ar.
  const avisosDoEncaixe = await encaixarPecas(i, resultado, mudou, o.encaixar);
  const conf = conferencia.reconferir(resultado, Object.assign({ hoje: new Date() }, conferencia.opcoesDaConta(ctxConta, c.escopo)), [r.pedido]);
  resultado.conferencia = conf;
  const salva = await db.salvarCampanha(sess.tenant_id, c.id, Object.assign({}, c, { resultado, capa: capaDe(resultado), estado: conferencia.estadoDepois(c.estado, conf) }));
  const avisos = (conf.avisos || []).map((a) => (a.trecho ? '“' + a.trecho + '” ' : '') + a.motivo).concat(avisosDoEncaixe);
  if (conferencia.barraAsPecas(conf)) return { estado: 'barrado', campanhaId: c.id, avisos, motivo: conferencia.porQueNaoRoda(conf) };
  // Estava no ar: vai de novo (a campanha do mesmo nome troca só o que é dela, com Desfazer).
  if (c.estado === 'no_ar' || (c.telas || []).length) {
    marcar(i, 'fazendo', 'Pondo a peça nova nas TVs…');
    const alvoDaCampanha = (c.telas || []).length ? { tipo: 'telas', ids: c.telas, nomes: [] } : item.alvo;
    const envio = await Pub.publicarItem(Object.assign({}, item, { alvo: alvoDaCampanha }), { resultado: salva.resultado, nome: salva.nome }, envPub);
    return Object.assign(envio, { campanhaId: c.id, avisos, pecasMudadas: mudou });
  }
  return { estado: 'salvo', campanhaId: c.id, avisos, pecasMudadas: mudou, motivo: 'A campanha não estava no ar: a mudança ficou salva em Biblioteca › Campanhas.' };
}

/*
 * A mensagem final, curta: o que foi para o ar e onde, o que foi para a
 * aprovação, o que não foi (e por quê) e os avisos (o fato que ninguém disse).
 */
function mensagemFinal(res, plano) {
  const linhas = [];
  const noAr = res.itens.filter((x) => x.estado === 'no-ar');
  const pedido = res.itens.filter((x) => x.estado === 'aprovacao');
  const nao = res.itens.filter((x) => ['barrado', 'erro', 'nao-mudou'].includes(x.estado));
  if (noAr.length === 1) linhas.push('Pronto: “' + corta(noAr[0].titulo, 50) + '” está no ar ' + (noAr[0].onde || '') + '.');
  else if (noAr.length) linhas.push('Pronto: ' + noAr.length + ' itens estão no ar (veja abaixo). Dá para desfazer.');
  if (pedido.length) linhas.push('Foi para a aprovação do dono: ' + pedido.map((x) => corta(x.titulo, 40)).join('; ') + '. Entra nas TVs quando ele aprovar.');
  for (const x of res.itens.filter((y) => y.estado === 'salvo')) linhas.push(x.motivo);
  for (const x of nao) linhas.push('Não foi: ' + corta(x.titulo, 40) + ' — ' + corta(x.motivo || 'deu erro', 160));
  const manual = res.itens.filter((x) => x.estado === 'manual');
  if (manual.length) linhas.push('Falta você aplicar: ' + manual.map((x) => corta(x.titulo, 40)).join('; ') + ' (no cartão do plano).');
  const avisos = [...new Set([].concat(...res.itens.map((x) => x.avisos || [])))].slice(0, 6);
  if (avisos.length) linhas.push('Confira: ' + avisos.join(' '));
  if (!linhas.length) linhas.push('Nada mudou nas TVs.');
  return linhas.join('\n');
}

module.exports = { executar, mensagemFinal, fazerPeca, fazerAjuste, fazerCampanha, capaDe, resultadoDaPeca, assinatura };
