/*
 * O perfil da conta no painel — o MESMO de js/perfil.js (o servidor lê o
 * mesmo arquivo para falar com a IA). Empresa, Comércio ou Saúde decide os
 * começos do Início e do Criar, o exemplo da caixa de texto e como o painel
 * chama o lugar (D4).
 *
 * O App grava o perfil que /api/auth/me devolve; as páginas leem com
 * usePerfil(). Um valor só por aba: trocar em Ajustes vale na hora.
 */
import { useSyncExternalStore } from 'react';
import '../../../js/perfil.js';

const P = globalThis.MTPerfil;

export const PERFIS = P.PERFIS;
export const IDS = P.IDS;
export const deduzir = P.deduzir;
export const perfilDe = P.de;

let atual = 'comercio';
const ouvintes = new Set();

export function definirPerfil(id) {
  const novo = P.normalizar(id);
  if (novo === atual) return;
  atual = novo;
  ouvintes.forEach((f) => f());
}

export function perfilAtual() { return atual; }

// O perfil inteiro (nome, lugar, exemplo, opções), e re-renderiza ao trocar.
export function usePerfil() {
  const id = useSyncExternalStore((f) => { ouvintes.add(f); return () => ouvintes.delete(f); }, () => atual);
  return P.de(id);
}
