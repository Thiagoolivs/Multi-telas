import React, { useEffect, useRef, useState } from 'react';
import { Menu, Sun, Moon, LogOut, ChevronDown, CreditCard, Users, Settings, LifeBuoy, UserPlus } from 'lucide-react';
import { IconButton } from '../ui/Button.jsx';

const ROLE_LABEL = { owner: 'Dono', admin: 'Admin', member: 'Membro' };

export function Topbar({ title, onOpenMenu, theme, onToggleTheme, user, onLogout, onNavigate }) {
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
        {/* O nome diz o que o botão faz agora (QA de 03/11), e não só "alternar". */}
        <IconButton icon={theme === 'dark' ? Sun : Moon} label={theme === 'dark' ? 'Usar tema claro' : 'Usar tema escuro'} onClick={onToggleTheme} />
        <UserMenu user={user} onLogout={onLogout} onNavigate={onNavigate} />
      </div>
    </header>
  );
}

function UserMenu({ user, onLogout, onNavigate }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e) => ref.current && !ref.current.contains(e.target) && setOpen(false);
    /*
     * Esc fecha e devolve o foco ao botão (QA de lançamento, 03/11): só fechava
     * com clique fora, e pelo teclado o menu ficava aberto com o foco seguindo
     * pela página. Sair do menu com Tab também fecha.
     */
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      setOpen(false);
      const b = ref.current && ref.current.querySelector('button');
      if (b) b.focus();
    };
    const onFoco = (e) => ref.current && !ref.current.contains(e.target) && setOpen(false);
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    document.addEventListener('focusin', onFoco);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('focusin', onFoco);
    };
  }, [open]);

  const name = user?.name || user?.email || 'Conta';
  const role = ROLE_LABEL[user?.role] || '';

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="true"
        className="ml-1 flex items-center gap-2 rounded-md py-0.5 pl-0.5 pr-1.5 transition hover:bg-surface-2 max-sm:min-h-11 max-sm:min-w-11 max-sm:justify-center max-sm:p-0"
      >
        {/*
          O nome do botão é o texto que se vê (QA de 03/11, axe
          label-content-name-mismatch: o aria-label "Conta: …" não tinha o
          papel nem as iniciais). As iniciais são enfeite; no celular o nome
          e o papel ficam só para o leitor de tela.
        */}
        <span aria-hidden="true" className="flex h-7 w-7 items-center justify-center rounded-full bg-accent-soft text-2xs font-semibold text-accent max-sm:h-9 max-sm:w-9">{initials(name)}</span>
        <span className="sr-only">Conta: </span>
        <span className="sr-only text-left leading-tight sm:not-sr-only sm:block">
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
          {/*
            A conta mora aqui desde a fase 7: Plano, Equipe, Ajustes e Ajuda. E
            "Convidar alguém" (dono e admin) já abre o convite: três toques.
          */}
          {onNavigate && [['billing', 'Plano', CreditCard], ['team', 'Equipe', Users],
            ...(user && (user.role === 'owner' || user.role === 'admin') ? [['team', 'Convidar alguém', UserPlus, { convidar: true }]] : []),
            ['settings', 'Ajustes', Settings], ['support', 'Ajuda', LifeBuoy]].map(([id, nome, Icone, params]) => (
            <button key={nome} type="button" onClick={() => { setOpen(false); onNavigate(id, params); }}
              className="flex w-full items-center gap-2 px-3 py-2 text-sm text-ink-2 transition hover:bg-surface-2 hover:text-ink">
              <Icone size={15} strokeWidth={2} className="text-ink-3" />
              {nome}
            </button>
          ))}
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
