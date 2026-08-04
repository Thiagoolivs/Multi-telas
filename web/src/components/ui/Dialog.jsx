import React, { useEffect } from 'react';
import { X } from 'lucide-react';
import { cn } from '../../lib/cn.js';
import { IconButton } from './Button.jsx';

// Modal centralizado sobre backdrop. Fecha no Esc e no clique fora.
export function Dialog({ open, onClose, title, description, children, footer, className }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  // A largura padrão só entra se o chamador não passar a sua (cn não resolve
  // conflito de classes Tailwind — duas max-w brigariam pela ordem do CSS).
  const hasWidth = /(^|\s)(max-w-|w-)\S+/.test(className || '');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-ink/40 backdrop-blur-sm" onClick={onClose} />
      <div className={cn('relative flex max-h-[92vh] w-full flex-col rounded-xl border border-line bg-surface shadow-pop', !hasWidth && 'max-w-md', className)}>
        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-line px-4 py-3">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-ink">{title}</h2>
            {description && <p className="mt-0.5 text-xs text-ink-3">{description}</p>}
          </div>
          <IconButton icon={X} label="Fechar" onClick={onClose} />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-4">{children}</div>
        {footer && <div className="flex shrink-0 items-center justify-end gap-2 border-t border-line px-4 py-3">{footer}</div>}
      </div>
    </div>
  );
}
