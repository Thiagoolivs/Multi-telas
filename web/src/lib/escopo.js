/*
 * O escopo no painel — o MESMO js/escopo.js do servidor, não uma cópia.
 *
 * O cartão "O que vou criar" mostra o que `descrever` escreve e o custo que
 * `custo` conta; o gerador do servidor obedece ao mesmo `normalizar`. Duas
 * cópias seriam o cartão prometendo uma coisa e a geração fazendo outra.
 */
import '../../../js/escopo.js';

const E = globalThis.MTEscopo;

export default E;
export const {
  ZONAS, IMAGENS, REDES, VIVOS, TETO_ZONA, NOME_ZONA, NOME_VIVO, NOME_REDE, NOME_IMAGENS, RECORTES,
  normalizar, vazio, padrao, custo, temOQueGerar, descrever, recortar,
} = E;
