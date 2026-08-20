import React from 'react';
import { cn } from '../../lib/cn.js';
import {
  LayoutDashboard, MonitorPlay, HardDrive, Bell, Users2, Settings, LifeBuoy, CreditCard, Cake, Palette, Brush, QrCode, Activity, Gauge,
} from 'lucide-react';

const NAV = [
  { section: 'Operação', items: [
    { id: 'overview', label: 'Visão geral', icon: LayoutDashboard },
    { id: 'screens', label: 'Telas', icon: MonitorPlay },
    { id: 'designs', label: 'Meus Designs', icon: Palette },
    { id: 'brand', label: 'Marca', icon: Brush },
    { id: 'mural', label: 'Mural de fotos', icon: QrCode },
    { id: 'alerts', label: 'Alertas', icon: Bell },
  ] },
  { section: 'Conta', items: [
    { id: 'storage', label: 'Armazenamento', icon: HardDrive },
    { id: 'birthdays', label: 'Aniversariantes', icon: Cake },
    { id: 'team', label: 'Equipe', icon: Users2 },
    { id: 'billing', label: 'Plano', icon: CreditCard },
    // `dono: true` some do menu de quem não é dono. O servidor já recusava
    // com 403 (server.js), então a permissão nunca esteve em risco — o que
    // havia era um item de menu que prometia uma porta trancada, e um membro
    // da equipe clicava para receber erro.
    { id: 'system', label: 'Estado do sistema', icon: Activity, dono: true },
    { id: 'settings', label: 'Ajustes', icon: Settings },
  ] },
  /*
   * A seção da PLATAFORMA só existe para quem opera o MultiTelas inteiro — e
   * são coisas diferentes: "Estado do sistema" responde "a minha conta está
   * bem configurada?"; "Plataforma" responde "o produto está de pé e sendo
   * usado?". Quem usa uma conta nunca precisa da segunda.
   *
   * Esconder o menu é só APARÊNCIA: a rota pergunta de novo, no servidor.
   */
  { section: 'Plataforma', operador: true, items: [
    { id: 'platform', label: 'Métricas da plataforma', icon: Gauge },
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

export function Sidebar({ active, onNavigate, papel, operador }) {
  const ehDono = papel === 'owner';
  const secoes = NAV
    .filter((s) => !s.operador || operador)
    .map((s) => ({ ...s, items: s.items.filter((i) => !i.dono || ehDono) }))
    .filter((s) => s.items.length);

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
        {secoes.map((group) => (
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
        <button
          type="button"
          onClick={() => onNavigate('support')}
          className={cn(
            'flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm font-medium transition',
            active === 'support' ? 'bg-accent-soft text-accent' : 'text-ink-2 hover:bg-surface-2 hover:text-ink'
          )}
        >
          <LifeBuoy size={16} strokeWidth={2} className={active === 'support' ? 'text-accent' : 'text-ink-3'} />
          Suporte
        </button>
      </div>
    </aside>
  );
}
