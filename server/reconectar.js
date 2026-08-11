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

module.exports = { impedimento };
