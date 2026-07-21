import React from 'react';
import { cn } from '../../lib/cn.js';
import { Loader2, AlertTriangle, Inbox, RefreshCw } from 'lucide-react';
import { Button } from './Button.jsx';

/* ---------- Skeleton (loading) ---------- */
export function Skeleton({ className }) {
  return <div className={cn('animate-pulse rounded bg-surface-2', className)} />;
}

export function SkeletonRows({ rows = 5, cols = 4 }) {
  return (
    <div className="divide-y divide-line">
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex items-center gap-4 px-4 py-3">
          {Array.from({ length: cols }).map((_, c) => (
            <Skeleton key={c} className={cn('h-3.5', c === 0 ? 'w-40' : 'w-20', c === cols - 1 && 'ml-auto')} />
          ))}
        </div>
      ))}
    </div>
  );
}

/* ---------- Spinner ---------- */
export function Spinner({ size = 16, className }) {
  return <Loader2 size={size} className={cn('animate-spin text-ink-3', className)} strokeWidth={2} />;
}

/* ---------- Estado vazio ---------- */
export function EmptyState({ icon: Icon = Inbox, title, description, action }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
      <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-line bg-surface-2 text-ink-3">
        <Icon size={18} strokeWidth={2} />
      </div>
      <h3 className="mt-3 text-sm font-semibold text-ink">{title}</h3>
      {description && <p className="mt-1 max-w-sm text-xs text-ink-3">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/* ---------- Estado de erro ---------- */
export function ErrorState({ title = 'Não foi possível carregar', description, onRetry }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
      <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-danger-soft bg-danger-soft text-danger">
        <AlertTriangle size={18} strokeWidth={2} />
      </div>
      <h3 className="mt-3 text-sm font-semibold text-ink">{title}</h3>
      {description && <p className="mt-1 max-w-sm text-xs text-ink-3">{description}</p>}
      {onRetry && (
        <Button size="sm" variant="secondary" icon={RefreshCw} className="mt-4" onClick={onRetry}>
          Tentar de novo
        </Button>
      )}
    </div>
  );
}

/* ---------- Barra de progresso (uso de armazenamento etc.) ---------- */
export function Progress({ value, tone = 'accent', className }) {
  const pct = Math.max(0, Math.min(100, value));
  const bar =
    tone === 'ok' ? 'bg-ok' : tone === 'warn' ? 'bg-warn' : tone === 'danger' ? 'bg-danger' : 'bg-accent';
  return (
    <div className={cn('h-1.5 w-full overflow-hidden rounded-full bg-surface-2', className)}>
      <div className={cn('h-full rounded-full transition-all', bar)} style={{ width: `${pct}%` }} />
    </div>
  );
}
