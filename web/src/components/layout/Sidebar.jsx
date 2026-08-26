import React from 'react';
import { cn } from '../../lib/cn.js';
import {
  LayoutDashboard, MonitorPlay, HardDrive, Bell, Users2, Settings, LifeBuoy, CreditCard, Cake, Palette, Brush, QrCode, Activity, Gauge, Images,
} from 'lucide-react';

const NAV = [
  { section: 'Operação', items: [
    { id: 'overview', label: 'Visão geral', icon: LayoutDashboard },
    { id: 'screens', label: 'Telas', icon: MonitorPlay },
    { id: 'designs', label: 'Meus Designs', icon: Palette },
    { id: 'brand', label: 'Marca', icon: Brush },
    /*
     * O Banco de Imagens é OPERAÇÃO, ao lado de Marca e Meus Designs: é de
     * onde sai conteúdo para a tela. Enfiado em "Conta", junto de cobrança e
     * equipe, ninguém acharia — e uma prateleira que ninguém abre é a mesma
     * coisa que uma plataforma vazia.
     */
    { id: 'banco', label: 'Banco de Imagens', icon: Images },
    { id: 'mural', label: 'Mural de fotos', icon: QrCode },
    /*
     * Aniversariantes é OPERAÇÃO, não conta.
     *
     * Estava em "Conta", junto de armazenamento, equipe e cobrança — que são
     * coisas que se mexe uma vez e esquece. A lista de aniversariantes é o
     * contrário: alimenta o que a TV mostra, muda toda semana, e quem cuida
     * dela é quem cuida do conteúdo, não quem cuida da assinatura.
     */
    { id: 'birthdays', label: 'Aniversariantes', icon: Cake },
    { id: 'alerts', label: 'Alertas', icon: Bell },
  ] },
  { section: 'Conta', items: [
    { id: 'storage', label: 'Armazenamento', icon: HardDrive },
    { id: 'team', label: 'Equipe', icon: Users2 },
    { id: 'billing', label: 'Plano', icon: CreditCard },
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
    /*
     * "Estado do sistema" morava na seção Conta, marcado como coisa de dono.
     * O nome `owner` enganou: dono é de UMA EMPRESA CLIENTE, e o que a tela
     * mostra é a infraestrutura do MultiTelas — banco, provedor de IA, bucket,
     * estado dos textos legais. Cliente nenhum precisa disso, e vários deles
     * juntos não deveriam ter.
     */
    { id: 'system', label: 'Estado do sistema', icon: Activity },
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
