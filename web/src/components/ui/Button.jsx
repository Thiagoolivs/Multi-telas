import React from 'react';
import { cn } from '../../lib/cn.js';

const VARIANTS = {
  primary: 'bg-accent text-accent-fg hover:brightness-110 border border-transparent shadow-xs',
  secondary: 'bg-surface text-ink border border-line-strong hover:bg-surface-2',
  ghost: 'bg-transparent text-ink-2 hover:bg-surface-2 border border-transparent',
  danger: 'bg-surface text-danger border border-line-strong hover:bg-danger-soft',
};

/*
 * No celular, todo botão tem pelo menos 44 px de altura (QA de 26/10: 75
 * alvos menores que 32 px só em Peças prontas — o dedo errava). No
 * computador continuam compactos: lá quem aponta é o mouse.
 */
const SIZES = {
  sm: 'h-7 px-2.5 text-xs gap-1.5 rounded max-sm:h-11 max-sm:px-3 max-sm:text-sm',
  md: 'h-8 px-3 text-sm gap-2 rounded-md max-sm:h-11',
  lg: 'h-9 px-3.5 text-base gap-2 rounded-md max-sm:h-11',
};

export function Button({ variant = 'secondary', size = 'md', className, icon: Icon, children, ...props }) {
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center whitespace-nowrap font-medium select-none transition',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40',
        'disabled:opacity-50 disabled:pointer-events-none',
        VARIANTS[variant],
        SIZES[size],
        className
      )}
      {...props}
    >
      {Icon && <Icon size={size === 'sm' ? 14 : 15} strokeWidth={2} />}
      {children}
    </button>
  );
}

export function IconButton({ className, icon: Icon, size = 15, label, ...props }) {
  return (
    <button
      aria-label={label}
      title={label}
      className={cn(
        'inline-flex h-8 w-8 max-sm:h-11 max-sm:w-11 shrink-0 items-center justify-center rounded-md text-ink-2 transition',
        'hover:bg-surface-2 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40',
        className
      )}
      {...props}
    >
      <Icon size={size} strokeWidth={2} />
    </button>
  );
}
