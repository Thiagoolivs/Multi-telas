import React from 'react';
import { Search, Menu, Sun, Moon } from 'lucide-react';
import { IconButton } from '../ui/Button.jsx';
import { StatusDot } from '../ui/Badge.jsx';

export function Topbar({ title, onOpenMenu, theme, onToggleTheme }) {
  return (
    <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-line bg-surface/90 px-4 backdrop-blur">
      <IconButton icon={Menu} label="Menu" className="lg:hidden" onClick={onOpenMenu} />

      <h1 className="text-sm font-semibold text-ink">{title}</h1>

      {/* Busca operacional (telas, campanhas, alertas) */}
      <div className="relative ml-4 hidden max-w-md flex-1 md:block">
        <Search size={15} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-3" />
        <input
          type="text"
          placeholder="Buscar telas, campanhas, locais…"
          className="h-8 w-full rounded-md border border-line bg-surface-2 pl-8 pr-16 text-sm text-ink placeholder:text-ink-3 focus:border-accent focus:bg-surface focus:outline-none focus:ring-2 focus:ring-accent/25"
        />
        <kbd className="absolute right-2 top-1/2 -translate-y-1/2 rounded border border-line bg-surface px-1.5 py-0.5 text-2xs text-ink-3">⌘K</kbd>
      </div>

      <div className="ml-auto flex items-center gap-1.5">
        <span className="hidden items-center gap-1.5 rounded-md border border-line bg-surface px-2 py-1 text-xs text-ink-2 sm:inline-flex">
          <StatusDot tone="ok" pulse />
          Sistema operacional
        </span>
        <IconButton icon={theme === 'dark' ? Sun : Moon} label="Alternar tema" onClick={onToggleTheme} />
        <button className="ml-1 flex items-center gap-2 rounded-md py-0.5 pl-0.5 pr-1 transition hover:bg-surface-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-accent-soft text-2xs font-semibold text-accent">TC</span>
          <span className="hidden text-left leading-tight sm:block">
            <span className="block text-xs font-medium text-ink">Thiago C.</span>
            <span className="block text-2xs text-ink-3">Dono</span>
          </span>
        </button>
      </div>
    </header>
  );
}
