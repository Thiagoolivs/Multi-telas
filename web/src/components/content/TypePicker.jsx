import React from 'react';
import { Dialog } from '../ui/Dialog.jsx';
import { CONTENT_TYPES, CONTENT_ORDER } from '../../lib/contentTypes.js';

// Seletor de tipo de conteúdo, agrupado. Clicar adiciona um item padrão.
export function TypePicker({ open, onClose, onPick }) {
  const groups = {};
  CONTENT_ORDER.forEach((t) => {
    const g = CONTENT_TYPES[t].group;
    (groups[g] = groups[g] || []).push(t);
  });

  return (
    <Dialog open={open} onClose={onClose} title="Adicionar conteúdo" description="Escolha um tipo para começar." className="max-w-5xl">
      <div className="max-h-[80vh] space-y-5 overflow-y-auto pr-1">
        {Object.entries(groups).map(([group, types]) => (
          <div key={group}>
            <div className="mb-2 text-2xs font-semibold uppercase tracking-wide text-ink-3">{group}</div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {types.map((t) => {
                const { label, icon: Icon, desc } = CONTENT_TYPES[t];
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => { onPick(t); onClose(); }}
                    className="flex flex-col items-start gap-2 rounded-xl border border-line bg-surface p-4 text-left transition hover:border-accent/50 hover:bg-surface-2"
                  >
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-surface-2"><Icon size={18} className="text-accent" strokeWidth={2} /></div>
                    <span className="text-sm font-semibold leading-tight text-ink">{label}</span>
                    {desc && <span className="text-2xs leading-snug text-ink-3">{desc}</span>}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </Dialog>
  );
}
