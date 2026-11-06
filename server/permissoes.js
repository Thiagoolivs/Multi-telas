/*
 * server/permissoes.js — PERMISSÃO POR LOJA (fase 13: equipe e redes).
 *
 * As TVs já têm um grupo ("Loja Centro", em Telas › Mais opções). O dono
 * pode dar a um MEMBRO acesso a uma ou mais lojas só: esse membro vê e muda
 * apenas as TVs delas, em todo lugar — a lista, a página da TV, o "Pôr na
 * TV", as campanhas, a Agenda e o relatório.
 *
 * A regra mora AQUI, e é o servidor que obedece: toda rota de TV (uma, em
 * lote, campanha, relatório) pergunta `podeTela` antes de ler ou gravar. O
 * painel só esconde o que o servidor já recusa.
 *
 *   sess.lojas = null        todas as TVs (dono, admin, e o membro sem regra)
 *   sess.lojas = ['Centro']  só as TVs desses grupos (sem grupo, nenhuma)
 *
 * E a outra metade da fase: `sess.precisaAprovar` — a conta ligou a
 * aprovação e quem está aqui é membro. O que ele põe na TV vira pedido
 * (server/aprovacao.js), e o dono aprova pelo celular.
 *
 * O papel continua valendo como antes (matriz em server/routes/telas.js):
 * admin e dono não têm loja nem aprovação; a regra é só do membro.
 */
'use strict';

// "Loja  centro " e "loja Centro" são o mesmo grupo (o painel grava aparado).
const chave = (g) => String(g == null ? '' : g).replace(/\s+/g, ' ').trim().toLowerCase();

// A lista que o dono escolheu, limpa: sem vazio, sem repetido, com teto.
function limparGrupos(lista) {
  if (!Array.isArray(lista)) return null;
  const vistos = new Set();
  const saida = [];
  for (const g of lista) {
    const nome = String(g == null ? '' : g).replace(/\s+/g, ' ').trim().slice(0, 60);
    if (!nome || vistos.has(chave(nome))) continue;
    vistos.add(chave(nome));
    saida.push(nome);
    if (saida.length >= 50) break;
  }
  return saida;
}

/*
 * Completa a sessão uma vez por pedido (server.js, handleApi): as lojas do
 * membro e se a conta pede aprovação. Dono e admin não custam consulta.
 */
async function completarSessao(db, sess) {
  if (!sess || sess.lojas !== undefined) return sess;
  sess.lojas = null;
  sess.precisaAprovar = false;
  if (sess.role !== 'member' || !sess.tenant_id) return sess;
  // Sem catch de propósito: se a leitura falhar, o pedido falha. Nunca vale "todas as TVs" nem "sem aprovação" por engano.
  const [grupos, conta] = await Promise.all([
    db.lojasDoUsuario(sess.user_id, sess.tenant_id),
    db.getTenant(sess.tenant_id),
  ]);
  sess.lojas = Array.isArray(grupos) ? grupos : null;
  sess.precisaAprovar = !!(conta && Number(conta.aprovacao));
  return sess;
}

const restrito = (sess) => !!(sess && Array.isArray(sess.lojas));

// Esta pessoa alcança esta TV? (a posse da conta é conferida à parte, por quem chama)
function podeTela(sess, device) {
  if (!sess) return false;
  if (!restrito(sess)) return true;
  const g = chave(device && device.grupo);
  return !!g && sess.lojas.some((x) => chave(x) === g);
}

// Pode pôr uma TV neste grupo? O membro de loja só move entre as lojas dele.
function podeGrupo(sess, grupo) {
  if (!restrito(sess)) return true;
  const g = chave(grupo);
  return !!g && sess.lojas.some((x) => chave(x) === g);
}

function filtrar(sess, telas) {
  const lista = Array.isArray(telas) ? telas : [];
  return restrito(sess) ? lista.filter((d) => podeTela(sess, d)) : lista;
}

/*
 * Renomear um grupo (Telas › renomear grupo) leva junto a permissão de quem
 * só via aquele grupo: sem isto, o gerente da "Loja Centro" perdia as TVs
 * dele quando o dono corrigia para "Loja do Centro".
 */
async function renomearNasLojas(db, tenantId, de, para) {
  const todas = await db.lojasDaConta(tenantId);
  for (const [userId, grupos] of Object.entries(todas)) {
    if (!grupos.some((g) => chave(g) === chave(de))) continue;
    const novos = para ? grupos.map((g) => (chave(g) === chave(de) ? para : g)) : grupos.filter((g) => chave(g) !== chave(de));
    await db.salvarLojasDoUsuario(tenantId, userId, limparGrupos(novos));
  }
}

module.exports = { chave, limparGrupos, completarSessao, restrito, podeTela, podeGrupo, filtrar, renomearNasLojas };
