/*
 * server/aprovacao.js — APROVAÇÃO ANTES DE IR AO AR (fase 13: equipe e redes).
 *
 * Com a aprovação ligada na conta (Equipe), o que um MEMBRO põe na TV não
 * vai para a TV: vira um pedido. O dono ou um admin vê o antes e o depois
 * pelo celular e aprova ou recusa. Aprovado, vai ao ar sozinho — pelo mesmo
 * envio em lote de sempre, com a conferência de versão (ninguém é atropelado:
 * se a TV mudou depois do pedido, o revisor escolhe pôr por cima ou recusar).
 * Recusado, o membro vê o porquê.
 *
 * Os caminhos que põem algo na TV passam por dois lugares só, e é neles que
 * o pedido nasce (server/routes/telas.js): a gravação de uma TV
 * (PUT /api/devices/:id/config — o editor, a cópia de TV) e o envio em lote
 * (POST /api/lote — "Pôr na TV", campanhas, peças prontas, a foto que subiu,
 * a Agenda, o aviso rápido). Nada do painel decide isto; o servidor decide.
 *
 *   estado: pendente → aprovada | recusada | substituida | cancelada
 *           (aplicando: o instante em que o revisor aprovou e o envio corre)
 */
'use strict';

const ESTADOS_FINAIS = ['aprovada', 'recusada', 'substituida', 'cancelada'];

const chaveDasTelas = (ids) => ids.map(String).sort().join(',');

/*
 * JUNTAR OS PEDIDOS (lote de 06/11; decisão do dono). Antes, o pedido novo
 * do membro para as mesmas TVs TROCAVA o que esperava, e o novo era feito
 * em cima da TV de agora: a mudança de antes se perdia (a data posta e a
 * apagada logo depois — só a segunda chegava ao dono). Agora a pessoa
 * edita EM CIMA do que ela mesma tem esperando, e tudo vai junto:
 *
 *   - quem lê a programação de uma TV (GET /config) tendo um pedido seu
 *     esperando para ela recebe a programação DO PEDIDO, com a "versão" do
 *     pedido (versaoDoPedido) no lugar da versão da TV (routes/telas.js);
 *   - gravar com essa versão vale (conferirVersao), e a base da aprovação
 *     continua a do primeiro pedido: se o dono mexeu na TV depois, a
 *     aprovação ainda mostra o conflito e o "por cima". Gravar com a versão
 *     da TV de agora, tendo pedido esperando, é 409 — o painel relê e
 *     refaz em cima do pedido (lib/rodar.js);
 *   - o pedido novo JUNTA os de antes da mesma pessoa que tocam as mesmas
 *     TVs (pedir): as TVs de lá que não vieram agora vão junto, como
 *     estavam, e o que veio junto (as campanhas, as datas postas e tiradas
 *     da Agenda) também. Os de antes saem da fila (substituida).
 *
 * Por TV, o pedido mais novo desta pessoa que espera e a toca: Map id → { pedido, item }.
 * Só para quem precisa de aprovação (o dono e o admin não pedem).
 */
async function meusPendentesPorTela(db, sess) {
  const porTela = new Map();
  if (!sess || !sess.precisaAprovar) return porTela;
  const lista = await db.listarAprovacoes(sess.tenant_id, { estado: 'pendente', autorId: sess.user_id, limite: 50 });
  for (const r of lista) {
    if (!(r.telas || []).some((t) => !porTela.has(t.id))) continue;
    const pedido = await db.lerAprovacao(r.id, sess.tenant_id);
    if (!pedido || pedido.estado !== 'pendente') continue;
    for (const item of pedido.itens || []) if (!porTela.has(item.id)) porTela.set(item.id, { pedido, item });
  }
  return porTela;
}
// A versão que o membro lê de uma TV com pedido seu esperando: a do pedido (o instante em que foi feito), não a da TV.
const versaoDoPedido = (pedido) => Number(pedido && pedido.criadoEm) || 0;
/*
 * Confere a versão que o membro mandou para `device` (`meu`: o pedido dele
 * que espera para ela, ou nada). Devolve { ok, base } — `base`, a versão da
 * TV contra a qual a aprovação vai conferir — ou { ok: false, versao }.
 */
function conferirVersao(meu, device, versao) {
  const daTv = Number(device.updated_at) || 0;
  if (meu) {
    if (versao != null && versao !== versaoDoPedido(meu.pedido)) return { ok: false, versao: versaoDoPedido(meu.pedido), pedido: meu.pedido.id };
    return { ok: true, base: Number(meu.item.versao) || 0 };
  }
  // "Versão 0" numa TV ainda sem programação é "li vazia" (ver o PUT da config).
  const vaziaLidaVazia = !device.config && versao === 0;
  if (versao != null && !vaziaLidaVazia && versao !== daTv) return { ok: false, versao: daTv };
  return { ok: true, base: daTv };
}
// O 409 de quem tem pedido esperando e gravou em cima da TV de agora.
const MUDANCA_ESPERANDO = 'Você tem uma mudança esperando aprovação nesta TV. Abra de novo: a nova vai junto com ela.';

// O que veio junto de cada pedido (do mais velho ao mais novo), num só: as campanhas e as datas postas e tiradas.
const listaDe = (extra, chave) => (extra && Array.isArray(extra[chave]) ? extra[chave] : []);
function campanhasDe(extra) {
  return [].concat(listaDe(extra, 'campanhas'), extra && extra.campanha ? [extra.campanha] : []).filter((c) => c && c.id);
}
function juntarExtras(extras) {
  const campanhas = new Map();
  let por = [];
  let tira = [];
  for (const e of extras || []) {
    if (!e) continue;
    for (const c of campanhasDe(e)) { campanhas.delete(c.id); campanhas.set(c.id, c); }
    for (const id of listaDe(e, 'calendario')) { tira = tira.filter((x) => x !== id); por = por.filter((x) => x !== id).concat(id); }
    for (const id of listaDe(e, 'calendarioApagar')) { por = por.filter((x) => x !== id); tira = tira.filter((x) => x !== id).concat(id); }
  }
  const out = {};
  if (campanhas.size) { out.campanhas = [...campanhas.values()].slice(-20); out.campanha = out.campanhas[out.campanhas.length - 1]; }
  if (por.length) out.calendario = por.slice(-200);
  if (tira.length) out.calendarioApagar = tira.slice(-200);
  return Object.keys(out).length ? out : null;
}

/*
 * O pedido, a partir do que o envio já conferiu (posse, loja, versão e a
 * porta das peças): `prontos` = [{ device, cfg, versao }]. A versão guardada
 * é a base — a da TV que o membro leu, ou a do pedido dele que já esperava
 * (conferirVersao) — e é contra ela que a aprovação confere. `meus`: o
 * meusPendentesPorTela já lido (senão, lê aqui).
 */
async function pedir(db, sess, prontos, descricao, meus) {
  const porTela = meus || await meusPendentesPorTela(db, sess);
  const antigos = new Map();
  for (const p of prontos) { const m = porTela.get(p.device.id); if (m) antigos.set(m.pedido.id, m.pedido); }
  const velhos = [...antigos.values()].sort((a, b) => (a.criadoEm || 0) - (b.criadoEm || 0));
  const itens = prontos.map((p) => ({
    id: p.device.id, nome: p.device.name || 'TV', versao: Number(p.versao) || 0, config: p.cfg,
  }));
  // As TVs do pedido de antes que não vieram agora vão junto, como estavam.
  for (const v of velhos) for (const i of v.itens || []) if (!itens.some((x) => x.id === i.id)) itens.push(i);
  const frases = [];
  for (const d of velhos.map((v) => v.descricao).concat(String(descricao || '').trim() || 'Mudança na TV')) if (d && !frases.includes(d)) frases.push(d);
  const telasChave = chaveDasTelas(itens.map((i) => i.id));
  const pedido = await db.criarAprovacao(sess.tenant_id, {
    autorId: sess.user_id, autorNome: sess.name || sess.email || '', descricao: frases.join(' · ').slice(0, 160),
    itens, telasChave, extra: juntarExtras(velhos.map((v) => v.extra)),
  });
  // Os de antes estão dentro deste: saem da fila (e um pedido igual, para as mesmas TVs, também).
  for (const v of velhos) await db.mudarEstadoDaAprovacao(v.id, sess.tenant_id, 'pendente', 'substituida', { decididoEm: Date.now() }).catch(() => false);
  await db.substituirAprovacoes(sess.tenant_id, sess.user_id, telasChave, pedido.id).catch(() => 0);
  await db.registrarEvento(sess.tenant_id, sess.user_id, 'aprovacao.pedir').catch(() => {});
  pedido.juntou = velhos.length;
  return pedido;
}

// A resposta 202 que o painel entende ("mandado para aprovação"), igual para uma TV ou várias.
// `versao`: a que o painel usa para a próxima gravação, que vai junto com esta; `junto`: entrou no pedido que já esperava.
function resposta(pedido) {
  return {
    ok: true, pendente: true,
    mensagem: pedido.juntou ? 'Mandado para aprovação, junto com a mudança que já esperava.' : 'Mandado para aprovação. Vai para a TV quando o dono aprovar.',
    aprovacao: { id: pedido.id, descricao: pedido.descricao, telas: pedido.telas, junto: !!pedido.juntou },
    versao: versaoDoPedido(pedido),
  };
}

/*
 * A campanha posta "no ar" por um membro com aprovação: as peças foram para
 * o pedido, então a campanha só fica "no ar" quando o pedido for aprovado
 * (senão a lista de Campanhas diria "no ar" com a TV mostrando outra coisa).
 * O painel marca a campanha logo depois do envio; aqui o estado pedido vai
 * junto do pedido mais recente desta pessoa, e a aprovação aplica os dois.
 * Devolve o pedido em que entrou, ou null (não havia pedido: segue normal).
 */
async function anexarCampanha(db, sess, campanhaId, estado, telas) {
  const recentes = await db.listarAprovacoes(sess.tenant_id, { estado: 'pendente', autorId: sess.user_id, limite: 5 });
  const DOIS_MINUTOS = 2 * 60 * 1000;
  const alvo = recentes.find((p) => Date.now() - p.criadoEm < DOIS_MINUTOS);
  if (!alvo) return null;
  // As campanhas que já estavam no pedido (juntado) continuam nele: cada uma fica no estado pedido.
  const nova = { id: campanhaId, estado, telas: (telas || []).slice(0, 50) };
  const campanhas = campanhasDe(alvo.extra).filter((c) => c.id !== campanhaId).concat(nova).slice(-20);
  const extra = Object.assign({}, alvo.extra || {}, { campanha: nova, campanhas });
  const ok = await db.mudarEstadoDaAprovacao(alvo.id, sess.tenant_id, 'pendente', 'pendente', { extra });
  return ok ? alvo : null;
}

/*
 * A DATA DA AGENDA posta por um membro com aprovação (lote de 06/11): a
 * peça da data foi para o pedido, então a Agenda não pode dizer "na TV"
 * (dizia: o painel marca a data logo depois do envio). Aqui a data entra
 * no pedido que a LEVA de verdade — o pendente mais novo desta pessoa com
 * a peça da data (o item `_calendario`) em alguma TV — e a aprovação a
 * marca como posta (aplicarExtra). Quem lê o estado é situacaoDasDatas.
 * Devolve o pedido, ou null (nenhum pedido leva a data).
 */
// A peça da data (o item `_calendario`) está nesta programação?
function temAData(config, eventoId) {
  return Object.values((config && config.zonas) || {})
    .some((z) => z && Array.isArray(z.items) && z.items.some((it) => it && it._calendario === eventoId));
}
function levaAData(pedido, eventoId) {
  return (pedido.itens || []).some((i) => temAData(i.config, eventoId));
}
// Anota a data numa das listas do pedido (`calendario`: pôr; `calendarioApagar`: tirar), e tira da outra.
async function anotarNoPedido(db, sess, pedido, eventoId, chave) {
  const outra = chave === 'calendario' ? 'calendarioApagar' : 'calendario';
  const extra = Object.assign({}, pedido.extra || {}, {
    [chave]: listaDe(pedido.extra, chave).filter((x) => x !== eventoId).concat(eventoId).slice(-200),
    [outra]: listaDe(pedido.extra, outra).filter((x) => x !== eventoId),
  });
  return db.mudarEstadoDaAprovacao(pedido.id, sess.tenant_id, 'pendente', 'pendente', { extra });
}
async function anexarCalendario(db, sess, eventoId) {
  const recentes = await db.listarAprovacoes(sess.tenant_id, { estado: 'pendente', autorId: sess.user_id, limite: 5 });
  for (const r of recentes) {
    const pedido = await db.lerAprovacao(r.id, sess.tenant_id);
    if (!pedido || !levaAData(pedido, eventoId)) continue;
    return (await anotarNoPedido(db, sess, pedido, eventoId, 'calendario')) ? pedido : null;
  }
  return null;
}

/*
 * APAGAR a data que está na TV, com aprovação (lote de 06/11): o painel
 * tira a peça das TVs (vira pedido) e depois apaga a data. Apagada na hora,
 * a recusa deixava a peça na TV sem data nenhuma na Agenda para cuidar dela.
 * A data fica, "saindo", no pedido que TIRA a peça de verdade: o pendente
 * mais novo desta pessoa que tira a peça de todas as TVs que a mostram
 * agora (`naTv`) e não a põe em nenhuma. Aprovado, a data sai (aplicarExtra);
 * recusado ou cancelado, ela continua como estava. Devolve o pedido, ou null.
 */
async function anexarApagar(db, sess, eventoId, naTv) {
  if (!naTv || !naTv.length) return null;
  const recentes = await db.listarAprovacoes(sess.tenant_id, { estado: 'pendente', autorId: sess.user_id, limite: 5 });
  for (const r of recentes) {
    const pedido = await db.lerAprovacao(r.id, sess.tenant_id);
    if (!pedido || levaAData(pedido, eventoId)) continue;
    const itens = pedido.itens || [];
    if (!naTv.every((id) => itens.some((i) => i.id === id && i.config && !temAData(i.config, eventoId)))) continue;
    return (await anotarNoPedido(db, sess, pedido, eventoId, 'calendarioApagar')) ? pedido : null;
  }
  return null;
}

/*
 * O que a Agenda diz de cada data com pedido. `pedidos`: os da conta, os
 * mais novos primeiro (db.listarAprovacoes). Vale o último pedido que levou
 * ou tirou a data, se ele for mais novo que a última vez que a data foi
 * para a TV (aplicadoEm: posta direto, ou aprovada):
 *   pendente (ou aplicando)          → `aprovacao.estado` 'pendente': "Esperando aprovação";
 *   recusada (com o motivo), cancelada, substituida → a mudança não foi.
 * O pedido que TIRA a data vem com `saindo: true` ("Saindo da TV"; não
 * aprovado, ela continua na TV). Aprovado não marca nada: a aprovação já
 * marcou a data como posta (ou já a apagou).
 * `verMotivo(pedido)`: o motivo da recusa vai para quem pediu e para o dono.
 */
function situacaoDasDatas(eventos, pedidos, verMotivo) {
  const ultimo = new Map();
  for (const p of pedidos || []) {
    if (!p) continue;
    for (const id of listaDe(p.extra, 'calendario')) if (!ultimo.has(id)) ultimo.set(id, { p, saindo: false });
    for (const id of listaDe(p.extra, 'calendarioApagar')) if (!ultimo.has(id)) ultimo.set(id, { p, saindo: true });
  }
  return (eventos || []).map((ev) => {
    const u = ultimo.get(ev.id);
    const p = u && u.p;
    if (!p || p.estado === 'aprovada' || (Number(ev.aplicadoEm) || 0) > (Number(p.criadoEm) || 0)) return ev;
    const estado = p.estado === 'aplicando' ? 'pendente' : p.estado;
    const aprovacao = { id: p.id, estado };
    if (u.saindo) aprovacao.saindo = true;
    if (estado === 'recusada' && p.motivo && (!verMotivo || verMotivo(p))) aprovacao.motivo = p.motivo;
    return Object.assign({}, ev, { aprovacao });
  });
}

// Depois de aprovado e no ar: o que veio junto (o estado da campanha, as datas da Agenda postas e tiradas) também vale.
async function aplicarExtra(db, tenantId, pedido) {
  const extra = (pedido && pedido.extra) || {};
  for (const id of listaDe(extra, 'calendario')) {
    const ev = await db.eventoDoCalendario(id, tenantId).catch(() => null);
    if (ev) await db.salvarEvento(tenantId, Object.assign({}, ev, { aplicadoEm: Date.now() }), id).catch(() => {});
  }
  // A peça saiu das TVs: a data sai da Agenda junto.
  for (const id of listaDe(extra, 'calendarioApagar')) await db.removerEvento(id, tenantId).catch(() => false);
  // Cada campanha que veio no pedido (juntado, pode ser mais de uma), no estado pedido.
  const porId = new Map();
  for (const c of campanhasDe(extra)) porId.set(c.id, c);
  for (const c of porId.values()) {
    const atual = await db.lerCampanha(tenantId, c.id).catch(() => null);
    if (atual) await db.salvarCampanha(tenantId, c.id, { ...atual, estado: c.estado, telas: c.telas || atual.telas || [] }).catch(() => {});
  }
}

/*
 * O antes e o depois de cada TV, para o revisor ver no celular. O antes é a
 * programação de AGORA (não a do pedido): é ela que sai se aprovar.
 */
function antesEDepois(pedido, telasAgora, normalizar) {
  return (pedido.itens || []).map((i) => {
    const d = telasAgora.find((t) => t.id === i.id) || null;
    let antes = null;
    try { antes = d && d.config ? normalizar(JSON.parse(d.config)) : null; } catch (e) { antes = null; }
    return {
      id: i.id, nome: (d && d.name) || i.nome || 'TV', grupo: (d && d.grupo) || '',
      existe: !!d, mudouDepois: !!d && (Number(d.updated_at) || 0) !== (Number(i.versao) || 0),
      antes, depois: i.config,
    };
  });
}

module.exports = { ESTADOS_FINAIS, chaveDasTelas, meusPendentesPorTela, versaoDoPedido, conferirVersao, MUDANCA_ESPERANDO, juntarExtras, pedir, resposta, anexarCampanha, temAData, levaAData, anexarCalendario, anexarApagar, situacaoDasDatas, aplicarExtra, antesEDepois };
