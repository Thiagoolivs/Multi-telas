import React from 'react';
import { cn } from '../../lib/cn.js';
import { ArrowUpRight, ArrowDownRight } from 'lucide-react';

// KPI tile: rótulo pequeno, número grande em tabular, delta opcional e um
// slot de rodapé (sparkline/legenda). Denso, sem sombra pesada.
export function Stat({ label, value, unit, icon: Icon, delta, deltaTone = 'neutral', hint, footer, className }) {
  const DeltaIcon = delta != null && delta < 0 ? ArrowDownRight : ArrowUpRight;
  const deltaColor =
    deltaTone === 'ok' ? 'text-ok' : deltaTone === 'danger' ? 'text-danger' : deltaTone === 'warn' ? 'text-warn' : 'text-ink-3';

  return (
    <div className={cn('rounded-lg border border-line bg-surface p-4 shadow-xs', className)}>
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-ink-3">{label}</span>
        {Icon && <Icon size={15} strokeWidth={2} className="text-ink-3" />}
      </div>
      <div className="mt-2 flex items-baseline gap-1.5">
        <span className="tnum text-2xl font-semibold tracking-tight text-ink">{value}</span>
        {unit && <span className="text-sm text-ink-3">{unit}</span>}
        {delta != null && (
          <span className={cn('ml-auto inline-flex items-center gap-0.5 text-xs font-medium', deltaColor)}>
            <DeltaIcon size={13} strokeWidth={2.5} />
            {Math.abs(delta)}%
          </span>
        )}
      </div>
      {hint && <p className="mt-1 text-xs text-ink-3">{hint}</p>}
      {footer && <div className="mt-3">{footer}</div>}
    </div>
  );
}
