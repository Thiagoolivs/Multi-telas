import React from 'react';
import { cn } from '../../lib/cn.js';

const baseInput =
  'h-9 w-full rounded-md border border-line bg-surface px-3 text-sm text-ink placeholder:text-ink-3 ' +
  'transition focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/25 ' +
  'disabled:opacity-60 disabled:pointer-events-none';

export function Input({ className, ...props }) {
  return <input className={cn(baseInput, className)} {...props} />;
}

export function Select({ className, children, ...props }) {
  return (
    <select className={cn(baseInput, 'cursor-pointer pr-8', className)} {...props}>
      {children}
    </select>
  );
}

// Rótulo + controle + mensagem de ajuda/erro opcional.
export function Field({ label, hint, error, children, className }) {
  return (
    <label className={cn('block', className)}>
      {label && <span className="mb-1.5 block text-xs font-medium text-ink-2">{label}</span>}
      {children}
      {error ? (
        <span className="mt-1 block text-xs text-danger">{error}</span>
      ) : hint ? (
        <span className="mt-1 block text-xs text-ink-3">{hint}</span>
      ) : null}
    </label>
  );
}

export function Checkbox({ label, className, ...props }) {
  return (
    <label className={cn('flex cursor-pointer items-center gap-2 text-sm text-ink-2', className)}>
      <input type="checkbox" className="h-4 w-4 rounded border-line-strong text-accent accent-accent" {...props} />
      {label}
    </label>
  );
}
