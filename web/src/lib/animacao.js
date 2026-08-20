/*
 * Ponte ESM para js/animacao.js — o MESMO arquivo que o player carrega.
 *
 * Importa por efeito colateral e reexporta o global. Não é cópia: se fosse, o
 * editor e a TV animariam diferente na primeira mudança, e a diferença só
 * apareceria depois de a peça estar publicada.
 */
import '../../../js/animacao.js';

const M = globalThis.MTAnim;

export const ENTRADAS = M.ENTRADAS;
export const CONTINUAS = M.CONTINUAS;
export const LIMITES = M.LIMITES;
export const ler = M.ler;
export const estilo = M.estilo;
export const escalonar = M.escalonar;
