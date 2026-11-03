import React, { useEffect, useId, useRef } from 'react';
import { X } from 'lucide-react';
import { cn } from '../../lib/cn.js';
import { IconButton } from './Button.jsx';
import { focaveis, prenderFoco } from '../../lib/focoPreso.js';

/*
 * Modal centralizado sobre backdrop. Fecha no Esc e no clique fora.
 *
 * QA de lançamento, 03/11: o foco agora entra no diálogo ao abrir (no campo
 * com autoFocus, senão no primeiro controle do conteúdo — não no "Fechar"),
 * o Tab fica preso nele, o Esc fecha só o de cima e, ao fechar, o foco volta
 * para o botão que abriu (lib/focoPreso.js).
 */
export function Dialog({ open, onClose, title, description, children, footer, className }) {
  const caixa = useRef(null);
  const corpo = useRef(null);
  const rodape = useRef(null);
  // onClose muda a cada render do chamador; o foco preso não pode religar por isso.
  const fechar = useRef(onClose);
  fechar.current = onClose;
  const id = useId();

  useEffect(() => {
    if (!open || !caixa.current) return undefined;
    return prenderFoco(caixa.current, {
      aoFechar: () => fechar.current && fechar.current(),
      inicial: () => focaveis(corpo.current)[0] || focaveis(rodape.current)[0] || null,
    });
  }, [open]);

  if (!open) return null;

  // A largura padrão só entra se o chamador não passar a sua (cn não resolve
  // conflito de classes Tailwind — duas max-w brigariam pela ordem do CSS).
  const hasWidth = /(^|\s)(max-w-|w-)\S+/.test(className || '');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-ink/40 backdrop-blur-sm" onClick={onClose} />
      <div ref={caixa} role="dialog" aria-modal="true" tabIndex={-1} aria-labelledby={id + '-t'} aria-describedby={description ? id + '-d' : undefined}
        className={cn('relative flex max-h-[92vh] w-full flex-col rounded-xl border border-line bg-surface shadow-pop focus:outline-none', !hasWidth && 'max-w-md', className)}>
        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-line px-4 py-3">
          <div className="min-w-0">
            <h2 id={id + '-t'} className="text-sm font-semibold text-ink">{title}</h2>
            {description && <p id={id + '-d'} className="mt-0.5 text-xs text-ink-3">{description}</p>}
          </div>
          <IconButton icon={X} label="Fechar" onClick={onClose} />
        </div>
        <div ref={corpo} className="min-h-0 flex-1 overflow-y-auto p-4">{children}</div>
        {footer && <div ref={rodape} className="flex shrink-0 items-center justify-end gap-2 border-t border-line px-4 py-3">{footer}</div>}
      </div>
    </div>
  );
}
