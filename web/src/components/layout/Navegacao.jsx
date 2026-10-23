import React from 'react';
import { Menu } from 'lucide-react';
import { cn } from '../../lib/cn.js';
import { GRUPOS, PAGINAS, BARRA_INFERIOR, grupoDa } from '../../lib/menu.js';
import { ICONE_DO_GRUPO } from './Sidebar.jsx';
import { useTrabalhos } from '../../lib/trabalhos.js';

/*
 * As ABAS do grupo (PLANO §5.1): Mídias mostra Armazenamento e Banco de
 * Imagens lado a lado; Conta, Plano · Equipe · Ajustes · Suporte. É assim que
 * 14 páginas cabem em 8 itens de menu sem nenhuma sumir. Grupo de uma página
 * só (Marca, Relatórios) não tem aba; a programação de uma tela também não.
 */
export function AbasDoGrupo({ active, onNavigate }) {
  const grupo = grupoDa(active);
  // Quantas gerações estão rodando: o número fica na aba "Criando" (D11).
  const rodando = (useTrabalhos() || []).filter((j) => j.estado === 'rodando').length;
  if (!grupo || grupo.paginas.length < 2 || !grupo.paginas.includes(active)) return null;
  return (
    <div className="-mx-4 mb-4 overflow-x-auto px-4 sm:mx-0 sm:px-0" role="tablist" aria-label={grupo.label}>
      <div className="inline-flex min-w-max gap-1 rounded-lg border border-line bg-surface-2 p-1">
        {grupo.paginas.map((p) => (
          <button key={p} type="button" role="tab" aria-selected={active === p} onClick={() => onNavigate(p)}
            className={cn('rounded-md px-3 py-1.5 text-sm font-medium transition',
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
 * A BARRA DE BAIXO, no celular: Início · Telas · Criar · Mídias · Mais. É
 * onde o polegar alcança — o dono da loja usa o painel entre um atendimento e
 * outro, com uma mão. "Mais" abre o menu inteiro (os outros quatro grupos).
 */
export function BarraInferior({ active, onNavigate, onMais }) {
  const grupo = grupoDa(active);
  const itens = BARRA_INFERIOR.map((id) => GRUPOS.find((g) => g.id === id));
  const outro = !grupo || !BARRA_INFERIOR.includes(grupo.id);
  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
      aria-label="Menu principal">
      <div className="mx-auto grid max-w-md grid-cols-5">
        {itens.map((g) => {
          const Icon = ICONE_DO_GRUPO[g.id];
          const aceso = grupo && grupo.id === g.id;
          return (
            <button key={g.id} type="button" onClick={() => onNavigate(g.paginas[0])} aria-current={aceso ? 'page' : undefined}
              className={cn('flex flex-col items-center gap-0.5 py-2 text-2xs font-medium', aceso ? 'text-accent' : 'text-ink-3')}>
              <Icon size={20} strokeWidth={aceso ? 2.4 : 2} />
              {g.label}
            </button>
          );
        })}
        <button type="button" onClick={onMais}
          className={cn('flex flex-col items-center gap-0.5 py-2 text-2xs font-medium', outro ? 'text-accent' : 'text-ink-3')}>
          <Menu size={20} strokeWidth={outro ? 2.4 : 2} />
          Mais
        </button>
      </div>
    </nav>
  );
}
