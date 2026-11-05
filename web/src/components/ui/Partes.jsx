import React from 'react';
import { cn } from '../../lib/cn.js';

/*
 * Duas ou três partes de uma mesma página (fase 7): "Telas inteiras ·
 * Peças soltas". Não é um terceiro nível de abas — é um filtro do que a
 * página mostra, e cabe no celular sem cortar.
 */
export function Partes({ valor, onChange, opcoes, rotulo }) {
  return (
    // Fase 8: o violeta é do botão principal da tela; a parte escolhida fica em destaque neutro.
    <div className="mb-4 inline-flex max-w-full gap-1 rounded-full border border-line bg-surface-2 p-1" role="radiogroup" aria-label={rotulo}>
      {opcoes.map(([id, nome]) => (
        <button key={id} type="button" role="radio" aria-checked={valor === id} onClick={() => onChange(id)}
          className={cn('min-h-9 shrink-0 rounded-full px-3.5 text-sm font-medium transition max-sm:min-h-11',
            valor === id ? 'bg-surface font-semibold text-ink shadow-sm ring-1 ring-line-strong' : 'text-ink-2 hover:text-ink')}>
          {nome}
        </button>
      ))}
    </div>
  );
}
