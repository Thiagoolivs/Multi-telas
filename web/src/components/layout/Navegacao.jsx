import React from 'react';
import { Plus } from 'lucide-react';
import { cn } from '../../lib/cn.js';
import { gruposDa, PAGINAS, BARRA_INFERIOR, grupoNaFrente } from '../../lib/menu.js';
import { usePerfil } from '../../lib/perfil.js';
import { ICONE_DO_GRUPO } from './Sidebar.jsx';
import { useTrabalhos } from '../../lib/trabalhos.js';

/*
 * As ABAS do grupo (PLANO §5.1): Mídias mostra Armazenamento e Banco de
 * Imagens lado a lado; Conta, Plano · Equipe · Ajustes · Suporte. É assim que
 * 14 páginas cabem em 8 itens de menu sem nenhuma sumir. Grupo de uma página
 * só (Marca, Relatórios) não tem aba; a programação de uma tela também não.
 */
export function AbasDoGrupo({ active, onNavigate }) {
  const frente = usePerfil();
  // O nome do grupo é o da frente ("Pessoas e indicadores" no Empresas, "Recursos extras" nos outros).
  const grupo = grupoNaFrente(active, frente.id);
  // Quantas gerações estão rodando: o número fica na aba "Criando" (D11).
  const rodando = (useTrabalhos() || []).filter((j) => j.estado === 'rodando').length;
  if (!grupo || grupo.paginas.length < 2 || !grupo.paginas.includes(active)) return null;
  return (
    <div className="mb-4" role="tablist" aria-label={grupo.label}>
      <div className="rolagem-lateral flex max-w-full gap-1 overflow-x-auto rounded-lg border border-line bg-surface-2 p-1 sm:inline-flex">
        {grupo.paginas.map((p) => (
          <button key={p} type="button" role="tab" aria-selected={active === p} onClick={() => onNavigate(p)}
            className={cn('shrink-0 whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium transition max-sm:min-h-11',
              active === p ? 'bg-surface text-ink shadow-xs' : 'text-ink-3 hover:text-ink-2')}>
            {PAGINAS[p]}
            {p === 'criando' && rodando > 0 && (
              <span className="ml-1.5 inline-flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-accent px-1 text-2xs font-semibold text-accent-fg" aria-label={rodando + ' em andamento'}>{rodando}</span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

/*
 * A BARRA DE BAIXO, no celular (fase 7): Início · Telas · [Criar] · Agenda ·
 * Biblioteca, com o Criar no meio, onde o polegar alcança. Marca, Pessoas e
 * a conta ficam no menu de cima (o ☰ da barra do topo).
 */
export function BarraInferior({ active, onNavigate }) {
  const frente = usePerfil();
  const grupo = grupoNaFrente(active, frente.id);
  const itens = BARRA_INFERIOR.map((id) => gruposDa(frente.id).find((g) => g.id === id));
  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
      aria-label="Menu principal">
      <div className="mx-auto grid max-w-md grid-cols-5">
        {itens.map((g) => {
          const aceso = grupo && grupo.id === g.id;
          if (g.id === 'criar') {
            return (
              <button key={g.id} type="button" onClick={() => onNavigate(g.paginas[0])} aria-current={aceso ? 'page' : undefined}
                className="flex min-h-[52px] flex-col items-center justify-center gap-0.5 py-1.5 text-[12px] font-semibold text-accent">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-accent text-accent-fg shadow-xs"><Plus size={18} strokeWidth={2.6} /></span>
                {g.label}
              </button>
            );
          }
          const Icon = ICONE_DO_GRUPO[g.id];
          return (
            <button key={g.id} type="button" onClick={() => onNavigate(g.paginas[0])} aria-current={aceso ? 'page' : undefined}
              className={cn('flex min-h-[52px] flex-col items-center justify-center gap-0.5 py-2 text-[12px] font-medium', aceso ? 'text-accent' : 'text-ink-3')}>
              <Icon size={20} strokeWidth={aceso ? 2.4 : 2} />
              {g.label}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
