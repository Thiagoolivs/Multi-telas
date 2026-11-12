import { deviceConfig } from '../api.js';

/*
 * A programação de cada TV, para a miniatura e o "Ver agora" saírem com a
 * marca, a logo e o cabeçalho de verdade (fase 10): a resposta da TV diz o
 * que está no ar, a programação diz como a TV desenha.
 *
 * Lida uma vez por versão da TV (o `updatedAt` da lista muda quando alguém
 * põe algo nela), e junto com as das outras TVs abertas no mesmo instante:
 * um pedido só para as 25 miniaturas de Telas (reteste 2, eram 25).
 */
const programacoes = new Map();

export function lerProgramacao(id, versao) {
  const guardada = programacoes.get(id);
  if (guardada && guardada.versao === versao) return guardada.promessa;
  const promessa = deviceConfig.doPainel(id).catch(() => null);
  programacoes.set(id, { versao, promessa });
  if (programacoes.size > 200) programacoes.delete(programacoes.keys().next().value);
  return promessa;
}
