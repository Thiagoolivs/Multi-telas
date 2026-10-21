import React from 'react';
import { cn } from '../../lib/cn.js';
import {
  LayoutDashboard, Wand2, MonitorPlay, LifeBuoy, Brush, Activity, Gauge, Images, BarChart3, Repeat, UserRound,
} from 'lucide-react';
import { GRUPOS, grupoDa } from '../../lib/menu.js';

/*
 * O MENU: os 8 grupos de web/src/lib/menu.js (PLANO §5.1), na ordem em que o
 * dono da loja pensa. Antes eram 14 entradas soltas em "Operação" e "Conta",
 * e quem procurava "onde ponho a foto?" lia a lista inteira. Cada página
 * antiga mora dentro de um grupo, como aba (AbasDoGrupo, no AppShell).
 */
const ICONES = {
  inicio: LayoutDashboard,
  telas: MonitorPlay,
  criar: Wand2,
  midias: Images,
  marca: Brush,
  automaticos: Repeat,
  relatorios: BarChart3,
  conta: UserRound,
};
export const ICONE_DO_GRUPO = ICONES;

const NAV = [
  { section: 'Painel', items: GRUPOS.map((g) => ({ id: g.id, label: g.label, icon: ICONES[g.id], destino: g.paginas[0] })) },
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
      onClick={() => onClick(item.destino || item.id)}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'group flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm font-medium transition',
        active ? 'bg-surface-2 text-ink' : 'text-ink-2 hover:bg-surface-2 hover:text-ink'
      )}
    >
      <Icon size={16} strokeWidth={2} className={cn(active ? 'text-accent' : 'text-ink-3 group-hover:text-ink-2')} />
      <span className="flex-1 text-left">{item.label}</span>
    </button>
  );
}

export function Sidebar({ active, onNavigate, papel, operador, empresa }) {
  const ehDono = papel === 'owner';
  // O grupo da página aberta fica aceso: Aniversariantes acende Automáticos.
  const grupo = grupoDa(active);
  const aceso = (item) => (grupo ? grupo.id === item.id : active === item.id);
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
          {/* O nome da empresa do cliente — "Rede corporativa" fixo não dizia
              nada a uma padaria, e quem cuida de duas contas precisa saber em
              qual está. */}
          <div className="truncate text-2xs text-ink-3" title={empresa || undefined}>{empresa || 'Painel'}</div>
        </div>
      </div>

      <nav className="flex-1 space-y-5 overflow-y-auto px-2.5 py-4">
        {secoes.map((group) => (
          <div key={group.section}>
            <div className="px-2.5 pb-1.5 text-2xs font-semibold uppercase tracking-wide text-ink-3">{group.section}</div>
            <div className="space-y-0.5">
              {group.items.map((item) => (
                <NavItem key={item.id} item={item} active={aceso(item)} onClick={onNavigate} />
              ))}
            </div>
          </div>
        ))}
      </nav>

      {/* Suporte também está em Conta; aqui fica à mão, que é onde se procura ajuda. */}
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
