import React from 'react';
import { cn } from '../../lib/cn.js';

/*
 * Duas ou três partes de uma mesma página (fase 7): "Telas inteiras ·
 * Peças soltas". Não é um terceiro nível de abas — é um filtro do que a
 * página mostra, e cabe no celular sem cortar.
 */
export function Partes({ valor, onChange, opcoes, rotulo }) {
  return (
    <div className="mb-4 inline-flex max-w-full gap-1 rounded-full border border-line bg-surface p-1" role="radiogroup" aria-label={rotulo}>
      {opcoes.map(([id, nome]) => (
        <button key={id} type="button" role="radio" aria-checked={valor === id} onClick={() => onChange(id)}
          className={cn('min-h-9 shrink-0 rounded-full px-3.5 text-sm font-medium transition max-sm:min-h-11',
            valor === id ? 'bg-accent text-accent-fg' : 'text-ink-2 hover:bg-surface-2')}>
          {nome}
        </button>
      ))}
    </div>
  );
}
