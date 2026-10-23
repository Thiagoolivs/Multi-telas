import React from 'react';
import { ListChecks, X } from 'lucide-react';

/*
 * COMBINADO ATÉ AQUI (EXECUTOR D48).
 *
 * O dono: "o chat se perde nos pedidos e na maioria das vezes regride". O que
 * a pessoa decide na conversa — o preço, a frase exata, "sem foto de gente" —
 * fica guardado na conversa, vai para a IA em toda volta e para o gerador.
 * Aqui ela VÊ o que ficou combinado e tira o que não vale mais (a IA não
 * reescreve a lista; só acrescenta e esquece o que a pessoa mudou).
 */
export function Combinado({ decisoes, onTirar }) {
  if (!decisoes || !decisoes.length) return null;
  return (
    <div className="rounded-lg border border-line bg-surface p-3">
      <div className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-ink">
        <ListChecks size={14} className="text-accent" /> Combinado até aqui
      </div>
      <ul className="space-y-1">
        {decisoes.map((d) => (
          <li key={d} className="group flex items-start gap-1.5 text-xs text-ink-2">
            <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-ink-3" aria-hidden />
            <span className="min-w-0 flex-1">{d}</span>
            {onTirar && (
              <button type="button" onClick={() => onTirar(d)} aria-label={'Tirar: ' + d} title="Não vale mais"
                className="shrink-0 rounded p-0.5 text-ink-3 opacity-100 transition hover:bg-surface-2 hover:text-ink sm:opacity-0 sm:group-hover:opacity-100 sm:focus:opacity-100">
                <X size={12} />
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
