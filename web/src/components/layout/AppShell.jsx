import React, { useState } from 'react';
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

// Shell responsivo: sidebar fixa em ≥lg; em telas menores vira drawer sobre
// um backdrop. O tema (claro/escuro) é controlado aqui e aplicado no <html>.
export function AppShell({ active, onNavigate, title, theme, onToggleTheme, user, empresa, operador, suporte, onLogout, children }) {
  const [drawer, setDrawer] = useState(false);

  function navigate(id) {
    onNavigate(id);
    setDrawer(false);
  }

  return (
    /*
     * No painel do operador a cor de destaque muda (web/src/index.css,
     * data-modo): quem está vendo TODAS as contas nunca pode confundir isso
     * com o painel de uma loja (PLANO §7.2).
     */
    <div className="flex h-screen overflow-hidden bg-canvas" data-modo={active === 'platform' ? 'operador' : undefined}>
      {/* Sidebar desktop */}
      <div className="hidden lg:block">
        <Sidebar active={active} onNavigate={navigate} papel={user && user.role} operador={operador} empresa={empresa} />
      </div>

      {/* Drawer mobile */}
      {drawer && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-ink/30 backdrop-blur-sm" onClick={() => setDrawer(false)} />
          <div className={cn('absolute inset-y-0 left-0 w-60 shadow-pop')}>
            <Sidebar active={active} onNavigate={navigate} papel={user && user.role} operador={operador} empresa={empresa} />
          </div>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <FaixaSuporte suporte={suporte} empresa={empresa} />
        <FaixaTeste onIrParaPlano={() => onNavigate('billing')} />
        <FaixaOffline />
        <Topbar title={title} onOpenMenu={() => setDrawer(true)} theme={theme} onToggleTheme={onToggleTheme} user={user} onLogout={onLogout} />
        <main className="flex-1 overflow-y-auto">
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
