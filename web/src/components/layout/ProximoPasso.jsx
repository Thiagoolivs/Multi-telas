import React from 'react';
import { ArrowRight, Check } from 'lucide-react';

/*
 * "Cada passo diz o próximo" (PLANO §5.3, EXECUTOR item 16): terminou a
 * marca, a página diz que agora é a primeira peça; fez a peça sem TV, diz
 * que agora é ligar a TV. Ninguém volta ao Início para descobrir o que vem.
 */
export function ProximoPasso({ feito, proximo, acao, onIr }) {
  return (
    <div role="status" className="flex flex-wrap items-center gap-3 rounded-lg border border-accent/40 bg-accent-soft/40 px-4 py-3">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-ok/15 text-ok"><Check size={15} /></span>
      <span className="min-w-0 flex-1 text-sm text-ink-2">
        <b className="text-ink">{feito}</b> Próximo passo: {proximo}
      </span>
      <button type="button" onClick={onIr}
        className="inline-flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-sm font-semibold text-accent-fg transition hover:brightness-110">
        {acao} <ArrowRight size={14} />
      </button>
    </div>
  );
}
