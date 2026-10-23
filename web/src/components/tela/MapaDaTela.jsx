import React from 'react';
import { cn } from '../../lib/cn.js';
import { gradeDaMiniatura, proporcaoDoLayout } from '../../lib/tela.js';

/*
 * A TV DESENHADA (EXECUTOR §2c, item 30).
 *
 * As zonas eram botões soltos ("Lateral", "Principal", "Notícias") e o
 * cliente não via onde cada uma ficava. Aqui a TV aparece com o layout de
 * verdade — a mesma grade de js/templates.js que o player usa — e cada zona é
 * um pedaço clicável com o que gira nela.
 *
 * A grade do player mistura `fr` e `vh` ("12vh 1fr 11vh"). Na miniatura tudo
 * vira `fr` na mesma proporção: 12vh de uma TV são 12 de 100 partes da altura.
 */
/*
 * resumo(zona) diz o que gira ali, em poucas palavras ("3 peças", "letreiro").
 * `ativa` é a zona aberta embaixo.
 */
export function MapaDaTela({ layout, ativa, onEscolher, resumo }) {
  if (!layout) return null;
  const emPe = (layout.orientation || '') === 'portrait';
  return (
    <div className={cn('mx-auto w-full', emPe ? 'max-w-[13rem]' : 'max-w-xl')}>
      <div role="group" aria-label="As zonas desta TV"
        className="grid gap-1 rounded-lg border-4 border-[#2a313c] bg-[#2a313c] p-1 shadow-sm"
        style={{ aspectRatio: proporcaoDoLayout(layout), ...gradeDaMiniatura(layout) }}>
        {layout.zones.map((z) => {
          const sel = ativa === z.id;
          const r = resumo ? resumo(z) : '';
          return (
            <button key={z.id} type="button" onClick={() => onEscolher(z)} aria-pressed={sel}
              style={{ gridArea: z.area || undefined }}
              className={cn('flex min-h-0 min-w-0 flex-col items-center justify-center overflow-hidden rounded px-1 text-center transition',
                sel ? 'bg-accent text-accent-fg' : 'bg-surface text-ink hover:bg-accent-soft')}>
              <span className="max-w-full truncate text-2xs font-semibold leading-tight sm:text-xs">{z.name.replace(/\s*\(.*\)$/, '')}</span>
              {r && <span className={cn('max-w-full truncate text-[10px] leading-tight', sel ? 'text-accent-fg/80' : 'text-ink-3')}>{r}</span>}
            </button>
          );
        })}
      </div>
      <p className="mt-1.5 text-center text-2xs text-ink-3">Toque numa parte da TV para ver e mudar o que passa ali.</p>
    </div>
  );
}
