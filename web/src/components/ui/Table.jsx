import React from 'react';
import { cn } from '../../lib/cn.js';

// Tabela densa de operação: cabeçalho fino sticky, linhas com hover, células
// alinhadas. Envolva em um contêiner com overflow-x-auto para responsividade.
export function Table({ className, children }) {
  return (
    <div className="w-full overflow-x-auto">
      <table className={cn('w-full border-collapse text-sm', className)}>{children}</table>
    </div>
  );
}

export function THead({ children }) {
  return (
    <thead className="border-b border-line">
      <tr className="text-left">{children}</tr>
    </thead>
  );
}

export function TH({ className, children, align = 'left' }) {
  return (
    <th
      className={cn(
        'whitespace-nowrap px-4 py-2 text-2xs font-semibold uppercase tracking-wide text-ink-3',
        align === 'right' && 'text-right',
        align === 'center' && 'text-center',
        className
      )}
    >
      {children}
    </th>
  );
}

export function TBody({ children }) {
  return <tbody className="divide-y divide-line">{children}</tbody>;
}

export function TR({ className, children, ...props }) {
  return (
    <tr className={cn('group transition-colors hover:bg-surface-2', className)} {...props}>
      {children}
    </tr>
  );
}

export function TD({ className, children, align = 'left' }) {
  return (
    <td
      className={cn(
        'whitespace-nowrap px-4 py-2.5 text-ink-2',
        align === 'right' && 'text-right',
        align === 'center' && 'text-center',
        className
      )}
    >
      {children}
    </td>
  );
}
