import React from 'react';
import { Spinner } from '../ui/Feedback.jsx';
import { cn } from '../../lib/cn.js';

/*
 * As partes de todo passo do "Sua primeira TV em 5 minutos": o título com a
 * frase de baixo, e o rodapé fixo com UM botão violeta (fase 8: um violeta
 * por tela) e o "Pular" ou "Fazer isso depois" ao lado. No celular o rodapé
 * fica preso embaixo, ao alcance do polegar.
 */
export function TituloDoPasso({ titulo, frase }) {
  return (
    <div className="mb-5">
      <h1 className="text-xl font-semibold tracking-tight text-ink">{titulo}</h1>
      {frase && <p className="mt-1.5 text-base leading-snug text-ink-2">{frase}</p>}
    </div>
  );
}

/*
 * `principal`: { rotulo, onClick, disabled, ocupado, icone } — o violeta.
 * `secundario`: { rotulo, onClick } — o "Pular", em texto.
 */
export function RodapeDoPasso({ principal, secundario }) {
  if (!principal && !secundario) return null;
  const Icone = principal && principal.icone;
  return (
    <div className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-surface/95 px-4 py-3 backdrop-blur sm:static sm:mt-8 sm:border-0 sm:bg-transparent sm:p-0 sm:backdrop-blur-none"
      style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}>
      <div className="mx-auto flex w-full max-w-xl flex-col-reverse items-stretch gap-2 sm:flex-row sm:items-center sm:justify-end">
        {secundario && (
          <button type="button" onClick={secundario.onClick} disabled={secundario.disabled}
            className="h-11 rounded-lg px-4 text-sm font-semibold text-ink-2 transition hover:bg-surface-2 hover:text-ink disabled:opacity-50">
            {secundario.rotulo}
          </button>
        )}
        {principal && (
          <button type="button" onClick={principal.onClick} disabled={principal.disabled || principal.ocupado}
            className="inline-flex h-12 items-center justify-center gap-2 rounded-lg bg-accent px-6 text-base font-semibold text-accent-fg shadow-xs transition hover:brightness-110 disabled:opacity-50 sm:min-w-[12rem]">
            {principal.ocupado ? <Spinner size={16} /> : Icone ? <Icone size={18} /> : null}
            {principal.rotulo}
          </button>
        )}
      </div>
    </div>
  );
}

/* Um cartão grande de escolha (o negócio, a TV, o horário): o toque escolhe e segue. */
// `empilhada`: o ícone em cima do nome (a grade de duas colunas do celular, no passo do negócio).
export function Escolha({ icone: Icone, titulo, detalhe, escolhida, onClick, className, children, disabled, empilhada }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={!!escolhida} disabled={disabled}
      className={cn('flex w-full rounded-xl border-2 bg-surface text-left transition',
        empilhada ? 'min-h-[5.5rem] flex-col items-start justify-center gap-2 px-3 py-3' : 'min-h-[4.5rem] items-center gap-3 px-4 py-3',
        escolhida ? 'border-accent bg-accent-soft/40' : 'border-line hover:border-accent/60', disabled && 'opacity-50', className)}>
      {Icone && (
        <span className={cn('flex h-11 w-11 shrink-0 items-center justify-center rounded-full', escolhida ? 'bg-accent/15 text-accent' : 'bg-surface-2 text-accent')}>
          <Icone size={22} />
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="block text-base font-semibold leading-tight text-ink">{titulo}</span>
        {detalhe && <span className="mt-0.5 block text-sm leading-snug text-ink-3">{detalhe}</span>}
      </span>
      {children}
    </button>
  );
}

export function Carregando({ texto }) {
  return <div role="status" className="flex flex-col items-center gap-2 py-16 text-sm text-ink-3"><Spinner size={20} />{texto}</div>;
}

export function Erro({ children }) {
  if (!children) return null;
  return <div role="alert" className="mt-3 rounded-lg border border-danger-soft bg-danger-soft px-3 py-2 text-sm text-danger">{children}</div>;
}
