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
 * O pedido, a partir do que o envio já conferiu (posse, loja, versão e a
 * porta das peças): `prontos` = [{ device, cfg, versao }]. A versão guardada
 * é a que o membro leu — é contra ela que a aprovação confere.
 */
async function pedir(db, sess, prontos, descricao) {
  const itens = prontos.map((p) => ({
    id: p.device.id, nome: p.device.name || 'TV', versao: Number(p.versao) || 0, config: p.cfg,
  }));
  const telasChave = chaveDasTelas(itens.map((i) => i.id));
  const pedido = await db.criarAprovacao(sess.tenant_id, {
    autorId: sess.user_id, autorNome: sess.name || sess.email || '', descricao: String(descricao || '').slice(0, 160) || 'Mudança na TV',
    itens, telasChave,
  });
  // Pediu de novo para as mesmas TVs: o pedido de antes sai da fila (o novo já traz tudo).
  await db.substituirAprovacoes(sess.tenant_id, sess.user_id, telasChave, pedido.id).catch(() => 0);
  await db.registrarEvento(sess.tenant_id, sess.user_id, 'aprovacao.pedir').catch(() => {});
  return pedido;
}

// A resposta 202 que o painel entende ("mandado para aprovação"), igual para uma TV ou várias.
function resposta(pedido) {
  return {
    ok: true, pendente: true,
    mensagem: 'Mandado para aprovação. Vai para a TV quando o dono aprovar.',
    aprovacao: { id: pedido.id, descricao: pedido.descricao, telas: pedido.telas },
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
  const extra = Object.assign({}, alvo.extra || {}, { campanha: { id: campanhaId, estado, telas: (telas || []).slice(0, 50) } });
  const ok = await db.mudarEstadoDaAprovacao(alvo.id, sess.tenant_id, 'pendente', 'pendente', { extra });
  return ok ? alvo : null;
}

// Depois de aprovado e no ar: o que veio junto (o estado da campanha) também vale.
async function aplicarExtra(db, tenantId, pedido) {
  const c = pedido && pedido.extra && pedido.extra.campanha;
  if (!c || !c.id) return;
  const atual = await db.lerCampanha(tenantId, c.id).catch(() => null);
  if (!atual) return;
  await db.salvarCampanha(tenantId, c.id, { ...atual, estado: c.estado, telas: c.telas || atual.telas || [] }).catch(() => {});
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

module.exports = { ESTADOS_FINAIS, chaveDasTelas, pedir, resposta, anexarCampanha, aplicarExtra, antesEDepois };
