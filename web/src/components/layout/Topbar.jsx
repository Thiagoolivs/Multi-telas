import React, { useEffect, useRef, useState } from 'react';
import { Search, Menu, Sun, Moon, LogOut, ChevronDown } from 'lucide-react';
import { IconButton } from '../ui/Button.jsx';
import { StatusDot } from '../ui/Badge.jsx';

const ROLE_LABEL = { owner: 'Dono', admin: 'Admin', member: 'Membro' };

export function Topbar({ title, onOpenMenu, theme, onToggleTheme, user, onLogout }) {
  return (
    <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-line bg-surface/90 px-4 backdrop-blur">
      <IconButton icon={Menu} label="Menu" className="lg:hidden" onClick={onOpenMenu} />
      <h1 className="text-sm font-semibold text-ink">{title}</h1>

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
        <UserMenu user={user} onLogout={onLogout} />
      </div>
    </header>
  );
}

function UserMenu({ user, onLogout }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e) => ref.current && !ref.current.contains(e.target) && setOpen(false);
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  const name = user?.name || user?.email || 'Conta';
  const role = ROLE_LABEL[user?.role] || '';

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="ml-1 flex items-center gap-2 rounded-md py-0.5 pl-0.5 pr-1.5 transition hover:bg-surface-2"
      >
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-accent-soft text-2xs font-semibold text-accent">{initials(name)}</span>
        <span className="hidden text-left leading-tight sm:block">
          <span className="block max-w-[10rem] truncate text-xs font-medium text-ink">{name}</span>
          <span className="block text-2xs text-ink-3">{role}</span>
        </span>
        <ChevronDown size={14} className="hidden text-ink-3 sm:block" />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1.5 w-56 overflow-hidden rounded-lg border border-line bg-surface shadow-pop">
          <div className="border-b border-line px-3 py-2.5">
            <div className="truncate text-sm font-medium text-ink">{user?.name || 'Conta'}</div>
            <div className="truncate text-xs text-ink-3">{user?.email}</div>
          </div>
          <button
            onClick={() => { setOpen(false); onLogout(); }}
            className="flex w-full items-center gap-2 px-3 py-2 text-sm text-ink-2 transition hover:bg-surface-2 hover:text-ink"
          >
            <LogOut size={15} strokeWidth={2} className="text-ink-3" />
            Sair
          </button>
        </div>
      )}
    </div>
  );
}

function initials(s) {
  const parts = String(s).split(/[\s@.]+/).filter(Boolean);
  return ((parts[0]?.[0] || '') + (parts[1]?.[0] || '')).toUpperCase() || '?';
}
