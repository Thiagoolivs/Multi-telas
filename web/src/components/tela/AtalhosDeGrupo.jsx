import React from 'react';
import { cn } from '../../lib/cn.js';

/*
 * MANDAR PARA UM GRUPO (EXECUTOR D26): ao escolher as TVs de um envio,
 * "Todas" e cada grupo ("Loja Centro", "Fábrica") marcam as TVs dele de uma
 * vez — com 20 TVs, marcar uma por uma era o motivo de mandar para a errada.
 * O envio vai num lote só (tudo ou nada), com Desfazer.
 *
 * `podeIr(t)`: a TV aceita este envio (a tela em pé não recebe tela deitada).
 */
export function AtalhosDeGrupo({ telas, alvos, onEscolher, podeIr = () => true }) {
  const lista = (telas || []).filter(podeIr);
  const grupos = [...new Set(lista.map((t) => t.grupo).filter(Boolean))];
  if (lista.length < 2) return null;
  const igual = (ids) => ids.length === alvos.length && ids.every((id) => alvos.includes(id));
  const atalho = (nome, ids) => (
    <button key={nome} type="button" aria-pressed={igual(ids)} onClick={() => onEscolher(ids)}
      className={cn('rounded-full border px-2.5 py-1 text-xs', igual(ids) ? 'border-accent bg-accent/10 font-semibold text-ink' : 'border-line text-ink-2 hover:border-ink-3')}>
      {nome} ({ids.length})
    </button>
  );
  return (
    <div className="mb-2 flex flex-wrap gap-1.5" role="group" aria-label="Escolher as TVs por grupo">
      {atalho('Todas', lista.map((t) => t.id))}
      {grupos.map((g) => atalho(g, lista.filter((t) => t.grupo === g).map((t) => t.id)))}
    </div>
  );
}
