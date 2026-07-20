import React from 'react';
import { cn } from '../../lib/cn.js';

// Contêiner base: superfície + borda 1px + raio + sombra mínima. Sem cards
// "gigantes" — a hierarquia vem da borda e do espaçamento, não de sombra.
export function Panel({ className, children, ...props }) {
  return (
    <section className={cn('rounded-lg border border-line bg-surface shadow-xs', className)} {...props}>
      {children}
    </section>
  );
}

export function PanelHeader({ title, description, actions, className }) {
  return (
    <div className={cn('flex items-start justify-between gap-3 border-b border-line px-4 py-3', className)}>
      <div className="min-w-0">
        <h2 className="text-sm font-semibold text-ink">{title}</h2>
        {description && <p className="mt-0.5 text-xs text-ink-3">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-1.5">{actions}</div>}
    </div>
  );
}

export function PanelBody({ className, children }) {
  return <div className={cn('p-4', className)}>{children}</div>;
}

export function PanelFooter({ className, children }) {
  return (
    <div className={cn('flex items-center justify-between border-t border-line px-4 py-2.5 text-xs text-ink-3', className)}>
      {children}
    </div>
  );
}
