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
/*
 * FASE 8 (BLOCO-8 §4.5): o vazio mostra o que vai aparecer ali. Com
 * `exemplo`, desenha uma TV com a peça de exemplo (as linhas: a etiqueta, o
 * título e o apoio), nas cores da marca — "assim fica a sua TV". Sem ele, o
 * quadro discreto de antes, para buscas sem resultado e telas técnicas.
 */
export function TvDeExemplo({ icon: Icon, linhas }) {
  const [etiqueta, titulo, apoio] = linhas || [];
  return (
    <div aria-hidden="true" className="relative w-48 overflow-hidden rounded-lg bg-[#0E0B1F] p-1.5 shadow-md ring-1 ring-black/20">
      <div className="flex aspect-video flex-col items-start justify-center gap-1 rounded-md bg-gradient-to-br from-[#0E0B1F] via-[#1d1450] to-[#3b1fb8] px-3 text-left">
        {Icon && !titulo && <Icon size={26} strokeWidth={1.75} className="mx-auto text-[#C6F432]" />}
        {etiqueta && <span className="rounded-sm bg-[#C6F432] px-1 text-[8px] font-bold uppercase tracking-wider text-[#0E0B1F]">{etiqueta}</span>}
        {titulo && <span className="line-clamp-2 text-[13px] font-bold leading-tight text-white">{titulo}</span>}
        {apoio && <span className="line-clamp-1 text-[9px] text-white/70">{apoio}</span>}
      </div>
      <div className="mx-auto mt-1 h-1 w-10 rounded-full bg-white/15" />
    </div>
  );
}

export function EmptyState({ icon: Icon = Inbox, title, description, action, exemplo }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
      {exemplo ? (
        Array.isArray(exemplo) || exemplo === true
          ? <TvDeExemplo icon={Icon} linhas={exemplo === true ? null : exemplo} />
          : exemplo
      ) : (
        <div className="flex h-11 w-11 items-center justify-center rounded-lg border border-line bg-surface-2 text-ink-3">
          <Icon size={20} strokeWidth={2} />
        </div>
      )}
      {/* h2: o vazio é a seção da página (o axe acusava h3 logo depois do h1). */}
      <h2 className="mt-4 text-lg font-semibold text-ink">{title}</h2>
      {description && <p className="mt-1 max-w-md text-sm text-ink-2">{description}</p>}
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
      <h2 className="mt-3 text-lg font-semibold text-ink">{title}</h2>
      {description && <p className="mt-1 max-w-md text-sm text-ink-2">{description}</p>}
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
