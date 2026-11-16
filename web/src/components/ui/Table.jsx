import React, { useLayoutEffect, useRef, useState } from 'react';
import { cn } from '../../lib/cn.js';

// Tabela densa de operação: cabeçalho fino sticky, linhas com hover, células
// alinhadas. A própria caixa rola de lado quando a tabela não cabe.
/*
 * A tabela que não cabe rola de lado — e quem usa teclado precisa alcançar
 * essa rolagem (reteste 3: `scrollable-region-focusable` do axe na
 * Plataforma). Quando ela rola de verdade, a caixa entra no Tab, com nome
 * (`rotulo`); quando cabe, não vira uma parada a mais no Tab.
 */
export function Table({ className, children, rotulo = 'Tabela' }) {
  const caixa = useRef(null);
  const [rola, setRola] = useState(false);
  useLayoutEffect(() => {
    const el = caixa.current;
    if (!el) return undefined;
    const medir = () => setRola(el.scrollWidth > el.clientWidth + 1);
    medir();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(medir);
    ro.observe(el);
    if (el.firstElementChild) ro.observe(el.firstElementChild);
    return () => ro.disconnect();
  }, []);
  return (
    <div ref={caixa} className="w-full overflow-x-auto"
      {...(rola ? { tabIndex: 0, role: 'region', 'aria-label': rotulo + ' (role para o lado para ver tudo)' } : {})}>
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
