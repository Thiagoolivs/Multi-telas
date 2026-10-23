import React, { useEffect, useRef, useState } from 'react';
import { Menu, Sun, Moon, LogOut, ChevronDown } from 'lucide-react';
import { IconButton } from '../ui/Button.jsx';

const ROLE_LABEL = { owner: 'Dono', admin: 'Admin', member: 'Membro' };

export function Topbar({ title, onOpenMenu, theme, onToggleTheme, user, onLogout }) {
  return (
    <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-line bg-surface/90 px-4 backdrop-blur">
      <IconButton icon={Menu} label="Menu" className="lg:hidden" onClick={onOpenMenu} />
      {/*
        O título só no celular: no computador a página já tem o dela, e o
        topo repetia "Visão geral" pela terceira vez (teste de uso de 23/10).
        Saíram também a busca, que não buscava nada, e o selo "Sistema
        operacional", sempre verde e fixo no código — em português ele soa
        como Windows (EXECUTOR D2).
      */}
      <h1 className="text-sm font-semibold text-ink lg:hidden">{title}</h1>

      <div className="ml-auto flex items-center gap-1.5">
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
