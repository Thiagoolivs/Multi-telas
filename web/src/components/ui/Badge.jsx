import React from 'react';
import { cn } from '../../lib/cn.js';

const TONES = {
  neutral: 'bg-surface-2 text-ink-2 border-line',
  accent: 'bg-accent-soft text-accent border-transparent',
  ok: 'bg-ok-soft text-ok border-transparent',
  warn: 'bg-warn-soft text-warn border-transparent',
  danger: 'bg-danger-soft text-danger border-transparent',
};

export function Badge({ tone = 'neutral', className, children }) {
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-2xs font-medium', TONES[tone], className)}>
      {children}
    </span>
  );
}

const DOT_TONES = {
  ok: 'bg-ok',
  warn: 'bg-warn',
  danger: 'bg-danger',
  neutral: 'bg-ink-3',
  accent: 'bg-accent',
};

// Ponto de status com halo suave; opcional "pulse" para estado ao vivo.
export function StatusDot({ tone = 'neutral', pulse = false, className }) {
  return (
    <span className={cn('relative inline-flex h-2 w-2', className)}>
      {pulse && <span className={cn('absolute inline-flex h-full w-full animate-ping rounded-full opacity-60', DOT_TONES[tone])} />}
      <span className={cn('relative inline-flex h-2 w-2 rounded-full', DOT_TONES[tone])} />
    </span>
  );
}

// Rótulo + ponto, para status de telas (online/offline/sincronizando…).
export function StatusLabel({ tone = 'neutral', pulse = false, children }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-sm text-ink-2">
      <StatusDot tone={tone} pulse={pulse} />
      {children}
    </span>
  );
}
