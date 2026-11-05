import React from 'react';

// Cabeçalho de página: título, subtítulo contextual e ações à direita.
export function PageHeader({ title, subtitle, actions }) {
  return (
    // Fase 8, o celular: o topo comia 1/3 da tela; menos espaço, e o subtítulo em até duas linhas.
    <div className="mb-4 flex flex-col gap-2 sm:mb-5 sm:flex-row sm:items-end sm:justify-between sm:gap-3">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-ink">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-ink-2 max-sm:line-clamp-2">{subtitle}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}
