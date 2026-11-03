import React, { forwardRef } from 'react';
import { cn } from '../../lib/cn.js';

const baseInput =
  'h-9 w-full rounded-md border border-line bg-surface px-3 text-sm text-ink placeholder:text-ink-3 ' +
  // Foco: borda e anel no violeta cheio (QA de 03/11: o anel a 25% sumia; a borda accent sozinha já dá ≥ 5:1).
  'transition focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent ' +
  'disabled:opacity-60 disabled:pointer-events-none';

// Com ref (QA de 03/11): o cadastro põe o foco no campo que falta.
export const Input = forwardRef(function Input({ className, ...props }, ref) {
  return <input ref={ref} className={cn(baseInput, className)} {...props} />;
});

export const Select = forwardRef(function Select({ className, children, ...props }, ref) {
  return (
    <select ref={ref} className={cn(baseInput, 'cursor-pointer pr-8', className)} {...props}>
      {children}
    </select>
  );
});

export const Textarea = forwardRef(function Textarea({ className, rows = 3, ...props }, ref) {
  return (
    <textarea
      ref={ref}
      rows={rows}
      className={cn(baseInput.replace('h-9 ', ''), 'min-h-[64px] resize-y py-2 leading-snug', className)}
      {...props}
    />
  );
});

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
