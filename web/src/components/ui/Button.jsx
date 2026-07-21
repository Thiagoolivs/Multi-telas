import React from 'react';
import { cn } from '../../lib/cn.js';

const VARIANTS = {
  primary: 'bg-accent text-accent-fg hover:brightness-110 border border-transparent shadow-xs',
  secondary: 'bg-surface text-ink border border-line-strong hover:bg-surface-2',
  ghost: 'bg-transparent text-ink-2 hover:bg-surface-2 border border-transparent',
  danger: 'bg-surface text-danger border border-line-strong hover:bg-danger-soft',
};

const SIZES = {
  sm: 'h-7 px-2.5 text-xs gap-1.5 rounded',
  md: 'h-8 px-3 text-sm gap-2 rounded-md',
  lg: 'h-9 px-3.5 text-base gap-2 rounded-md',
};

export function Button({ variant = 'secondary', size = 'md', className, icon: Icon, children, ...props }) {
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center font-medium select-none transition',
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
        'inline-flex h-8 w-8 items-center justify-center rounded-md text-ink-2 transition',
        'hover:bg-surface-2 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40',
        className
      )}
      {...props}
    >
      <Icon size={size} strokeWidth={2} />
    </button>
  );
}
