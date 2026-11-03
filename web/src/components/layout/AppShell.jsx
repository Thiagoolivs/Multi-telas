import React, { useEffect, useRef, useState } from 'react';
import { cn } from '../../lib/cn.js';
import { Sidebar } from './Sidebar.jsx';
import { Topbar } from './Topbar.jsx';
import { AbasDoGrupo, BarraInferior } from './Navegacao.jsx';
import { FaixaOffline } from './FaixaOffline.jsx';
import { FaixaSuporte } from './FaixaSuporte.jsx';
import { FaixaTeste } from './FaixaTeste.jsx';
import { Avisos } from './Avisos.jsx';
import { PedidosHost } from '../ui/PedidosHost.jsx';
import { SubirConteudo } from '../content/SubirConteudo.jsx';
import { ConviteInstalar } from './ConviteInstalar.jsx';
import { prenderFoco } from '../../lib/focoPreso.js';

// Shell responsivo: sidebar fixa em ≥lg; em telas menores vira drawer sobre
// um backdrop. O tema (claro/escuro) é controlado aqui e aplicado no <html>.
export function AppShell({ active, onNavigate, title, theme, onToggleTheme, user, empresa, operador, suporte, onLogout, children }) {
  const [drawer, setDrawer] = useState(false);
  /*
   * A gaveta do celular ("Mais") é um diálogo (QA de lançamento, 03/11): o
   * foco entra nela, o Tab não sai para a página atrás, o Esc fecha e o foco
   * volta para o "Mais" (lib/focoPreso.js). Antes o Esc não fazia nada e o
   * Tab caía no <body> antes de chegar a ela.
   */
  const gaveta = useRef(null);
  useEffect(() => {
    if (!drawer || !gaveta.current) return undefined;
    return prenderFoco(gaveta.current, {
      aoFechar: () => setDrawer(false),
      // Começa no item da página atual (quem abriu o menu quer ir a outro lugar a partir dali).
      inicial: (c) => c.querySelector('[aria-current="page"]'),
    });
  }, [drawer]);

  function navigate(id) {
    onNavigate(id);
    setDrawer(false);
  }

  /*
   * Ao trocar de página, o foco vai para o conteúdo novo (QA de lançamento,
   * 03/11): ficava no menu ou no <body>, e quem usa teclado passava de novo
   * pelas 11 paradas do menu para chegar ao que abriu. Na primeira pintura
   * não: aí o foco é de quem acabou de entrar.
   */
  const conteudo = useRef(null);
  const primeira = useRef(true);
  useEffect(() => {
    if (primeira.current) { primeira.current = false; return; }
    const el = conteudo.current;
    if (el && !el.contains(document.activeElement)) { try { el.focus({ preventScroll: true }); } catch (e) { el.focus(); } }
  }, [active, title]);
  function pularParaConteudo(e) {
    // Sem mexer no endereço: um #conteudo dispararia o popstate do App e recarregaria a rota.
    e.preventDefault();
    if (conteudo.current) conteudo.current.focus();
  }

  return (
    /*
     * No painel do operador a cor de destaque muda (web/src/index.css,
     * data-modo): quem está vendo TODAS as contas nunca pode confundir isso
     * com o painel de uma loja (PLANO §7.2).
     */
    <div className="flex h-screen overflow-hidden bg-canvas" data-modo={active === 'platform' ? 'operador' : undefined}>
      {/*
        "Pular para o conteúdo" (QA de lançamento, 03/11): eram 11 paradas de
        Tab (menu, tema, conta) antes do conteúdo em todas as páginas. É o
        primeiro Tab da página; só aparece quando recebe o foco.
      */}
      <a href="#conteudo" onClick={pularParaConteudo}
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[60] focus:rounded-md focus:bg-accent focus:px-4 focus:py-2.5 focus:text-sm focus:font-semibold focus:text-accent-fg focus:outline-none focus:ring-2 focus:ring-ink focus:ring-offset-2 focus:ring-offset-surface">
        Pular para o conteúdo
      </a>
      {/* Sidebar desktop */}
      <div className="hidden lg:block">
        <Sidebar active={active} onNavigate={navigate} papel={user && user.role} operador={operador} empresa={empresa} />
      </div>

      {/* Drawer mobile */}
      {drawer && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-ink/30 backdrop-blur-sm" onClick={() => setDrawer(false)} />
          <div ref={gaveta} role="dialog" aria-modal="true" aria-label="Menu" tabIndex={-1} className={cn('absolute inset-y-0 left-0 w-60 shadow-pop focus:outline-none')}>
            <Sidebar active={active} onNavigate={navigate} papel={user && user.role} operador={operador} empresa={empresa} />
          </div>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <FaixaSuporte suporte={suporte} empresa={empresa} />
        <FaixaTeste onIrParaPlano={() => onNavigate('billing')} />
        <FaixaOffline />
        <Topbar title={title} onOpenMenu={() => setDrawer(true)} theme={theme} onToggleTheme={onToggleTheme} user={user} onLogout={onLogout} />
        <main id="conteudo" ref={conteudo} tabIndex={-1} className="flex-1 overflow-y-auto focus:outline-none">
          {/* No celular, espaço para a barra de baixo não cobrir o fim da página. */}
          <div className="mx-auto max-w-[1400px] px-4 pb-24 pt-5 sm:px-6 sm:pt-6 lg:pb-6">
            <AbasDoGrupo active={active} onNavigate={navigate} />
            {children}
          </div>
        </main>
        <BarraInferior active={active} onNavigate={navigate} onMais={() => setDrawer(true)} />
      </div>

      {/* Fora do <main>: o aviso não rola com a página nem some ao trocar de menu. */}
      <Avisos />
      <PedidosHost />
      {/* Subir foto ou vídeo: do Início, arrastando em qualquer página ou pelo compartilhar do celular. */}
      <SubirConteudo />
      <ConviteInstalar />
    </div>
  );
}
