import React from 'react';
import { cn } from '../../lib/cn.js';
import {
  LayoutDashboard, MonitorPlay, Megaphone, HardDrive, Bell, Users2, Settings, LifeBuoy,
} from 'lucide-react';

const NAV = [
  { section: 'Operação', items: [
    { id: 'overview', label: 'Visão geral', icon: LayoutDashboard },
    { id: 'screens', label: 'Telas', icon: MonitorPlay, badge: '16' },
    { id: 'campaigns', label: 'Campanhas', icon: Megaphone, badge: '7' },
    { id: 'alerts', label: 'Alertas', icon: Bell, badge: '5', badgeTone: 'danger' },
  ] },
  { section: 'Conta', items: [
    { id: 'storage', label: 'Armazenamento', icon: HardDrive },
    { id: 'team', label: 'Equipe', icon: Users2 },
    { id: 'settings', label: 'Ajustes', icon: Settings },
  ] },
];

function NavItem({ item, active, onClick }) {
  const Icon = item.icon;
  return (
    <button
      onClick={() => onClick(item.id)}
      className={cn(
        'group flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm font-medium transition',
        active ? 'bg-surface-2 text-ink' : 'text-ink-2 hover:bg-surface-2 hover:text-ink'
      )}
    >
      <Icon size={16} strokeWidth={2} className={cn(active ? 'text-accent' : 'text-ink-3 group-hover:text-ink-2')} />
      <span className="flex-1 text-left">{item.label}</span>
      {item.badge && (
        <span
          className={cn(
            'tnum rounded px-1.5 py-0.5 text-2xs font-semibold',
            item.badgeTone === 'danger' ? 'bg-danger-soft text-danger' : 'bg-surface-2 text-ink-3 group-hover:bg-surface'
          )}
        >
          {item.badge}
        </span>
      )}
    </button>
  );
}

export function Sidebar({ active, onNavigate }) {
  return (
    <aside className="flex h-full w-60 shrink-0 flex-col border-r border-line bg-surface">
      {/* Marca + seletor de ambiente */}
      <div className="flex h-14 items-center gap-2.5 border-b border-line px-4">
        <div className="flex h-7 w-7 items-center justify-center rounded-md bg-accent text-accent-fg">
          <MonitorPlay size={16} strokeWidth={2.5} />
        </div>
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-ink">MultiTelas</div>
          <div className="truncate text-2xs text-ink-3">Rede corporativa</div>
        </div>
      </div>

      <nav className="flex-1 space-y-5 overflow-y-auto px-2.5 py-4">
        {NAV.map((group) => (
          <div key={group.section}>
            <div className="px-2.5 pb-1.5 text-2xs font-semibold uppercase tracking-wide text-ink-3">{group.section}</div>
            <div className="space-y-0.5">
              {group.items.map((item) => (
                <NavItem key={item.id} item={item} active={active === item.id} onClick={onNavigate} />
              ))}
            </div>
          </div>
        ))}
      </nav>

      <div className="border-t border-line p-2.5">
        <a
          href="#"
          className="flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm font-medium text-ink-2 transition hover:bg-surface-2 hover:text-ink"
        >
          <LifeBuoy size={16} strokeWidth={2} className="text-ink-3" />
          Suporte
        </a>
      </div>
    </aside>
  );
}
