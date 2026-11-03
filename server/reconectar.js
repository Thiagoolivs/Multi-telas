/*
 * reconectar.js — quem pode virar quem.
 *
 * A TV guarda a própria identidade no navegador dela. O navegador da Samsung
 * limpa isso ao fechar, e aí a TV volta como tela NOVA, com código novo: a
 * tela antiga fica no painel para sempre, offline, sem receber publicação e
 * ocupando uma vaga do plano. Reconectar é o caminho de volta.
 *
 * A operação move o nome e a programação de uma tela para outra e apaga a
 * primeira. Mover conteúdo entre telas com um código de seis caracteres pede
 * guardas de verdade, e guardas escondidas dentro de uma rota HTTP não são
 * testáveis. Ficam aqui, puras, e a rota só obedece.
 */

'use strict';

/*
 * `atual` é a tela do painel que vai ser reconectada; `nova` é a TV que está
 * mostrando o código agora. Devolve null quando pode, ou { status, error }.
 */
function impedimento(atual, nova, tenantId, agora, janelaMs) {
  if (!nova) return { status: 404, error: 'código não encontrado' };
  if (!atual) return { status: 404, error: 'tela não encontrada' };
  if (atual.tenant_id !== tenantId) return { status: 403, error: 'sem permissão' };
  if (nova.id === atual.id) return { status: 409, error: 'esta tela já é essa TV' };

  /*
   * Uma TV de outra conta nunca pode ser adotada — nem por engano de digitação
   * nem por tentativa. É a mesma regra do pareamento, e é o que impede
   * sequestrar a tela de outro cliente com um código de seis caracteres.
   */
  if (nova.tenant_id && nova.tenant_id !== tenantId)
    return { status: 409, error: 'esta TV já pertence a outra conta' };

  /*
   * O código só vale enquanto a TV está viva mostrando ele. Sem isto, um
   * código antigo anotado num papel continuaria funcionando meses depois.
   */
  if (!nova.last_seen || agora - nova.last_seen > janelaMs)
    return { status: 410, error: 'código expirado — reinicie a TV para gerar um novo' };

  return null;
}

/*
 * "É A TV X QUE CAIU?" (QA de lançamento, 03/11).
 *
 * O caminho óbvio de quem vê a TV mostrando um código novo é "Parear tela",
 * não "Reconectar" — e parear criava uma SEGUNDA tela, cobrada, com a antiga
 * órfã no painel (no grátis, esbarrava em "limite do plano").
 *
 * Por que PERGUNTAR, e não juntar sozinho: o que a TV conta de si (navegador,
 * resolução) é igual em vinte TVs do mesmo modelo. Quem instala uma frota e
 * tem uma TV desligada no meio teria a TV nova engolida pela desligada, e a
 * programação de uma sala indo parar na parede de outra. Impressão digital
 * de aparelho serve para DESCONFIAR; quem confirma é a pessoa, em um toque.
 *
 * `info` é o JSON (ou objeto) que a TV manda no pulso (server.js, infoDaTela).
 */
function lerInfo(info) {
  if (!info) return null;
  if (typeof info === 'object') return info;
  try { return JSON.parse(info); } catch (e) { return null; }
}
function mesmoAparelho(a, b) {
  const x = lerInfo(a);
  const y = lerInfo(b);
  if (!x || !y || !x.ua || !y.ua) return false;
  return x.ua === y.ua && Number(x.w) === Number(y.w) && Number(x.h) === Number(y.h)
    && (Number(x.dpr) || 1) === (Number(y.dpr) || 1);
}

/*
 * As telas da conta que podem ser a TV `nova` que voltou com código: as que
 * pararam de pulsar ANTES de a nova nascer (a identidade se perdeu e a TV
 * recomeçou) e que não estão com o tempo real de pé agora. Sem esperar os 90 s
 * do "fora do ar" do painel: a TV que perdeu o vínculo já está mostrando o
 * código, e quem está de pé na frente dela não vai esperar.
 *
 * `aoVivo(id)` diz se a tela tem conexão de tempo real aberta. `todas`: sem
 * conferir o aparelho (para o "limite do plano", em que parear já está
 * barrado e a única saída boa é reconectar).
 */
function candidatas(telas, nova, opts) {
  const o = opts || {};
  const aoVivo = typeof o.aoVivo === 'function' ? o.aoVivo : () => false;
  const nasceu = Number(nova && (nova.created_at || nova.last_seen)) || 0;
  return (telas || []).filter((d) => d && nova && d.id !== nova.id)
    .filter((d) => !aoVivo(d.id) && (Number(d.last_seen) || 0) <= nasceu)
    .filter((d) => o.todas || mesmoAparelho(d.info, nova.info))
    .sort((a, b) => (Number(b.last_seen) || 0) - (Number(a.last_seen) || 0))
    .slice(0, 5)
    .map((d) => ({ id: d.id, nome: d.name || 'TV', grupo: d.grupo || '', ultimoSinal: Number(d.last_seen) || 0 }));
}

module.exports = { impedimento, mesmoAparelho, candidatas, lerInfo };
