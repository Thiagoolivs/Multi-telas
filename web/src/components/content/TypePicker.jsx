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
    <Dialog open={open} onClose={onClose} title="Adicionar conteúdo" description="Escolha um tipo para começar." className="max-w-lg">
      <div className="space-y-4">
        {Object.entries(groups).map(([group, types]) => (
          <div key={group}>
            <div className="mb-1.5 text-2xs font-semibold uppercase tracking-wide text-ink-3">{group}</div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {types.map((t) => {
                const { label, icon: Icon } = CONTENT_TYPES[t];
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => { onPick(t); onClose(); }}
                    className="flex flex-col items-start gap-2 rounded-lg border border-line bg-surface p-3 text-left transition hover:border-accent/50 hover:bg-surface-2"
                  >
                    <Icon size={17} className="text-accent" strokeWidth={2} />
                    <span className="text-xs font-medium leading-tight text-ink">{label}</span>
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
