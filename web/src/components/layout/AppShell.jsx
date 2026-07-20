import React, { useState } from 'react';
import { cn } from '../../lib/cn.js';
import { Sidebar } from './Sidebar.jsx';
import { Topbar } from './Topbar.jsx';

// Shell responsivo: sidebar fixa em ≥lg; em telas menores vira drawer sobre
// um backdrop. O tema (claro/escuro) é controlado aqui e aplicado no <html>.
export function AppShell({ active, onNavigate, title, theme, onToggleTheme, user, onLogout, children }) {
  const [drawer, setDrawer] = useState(false);

  function navigate(id) {
    onNavigate(id);
    setDrawer(false);
  }

  return (
    <div className="flex h-screen overflow-hidden bg-canvas">
      {/* Sidebar desktop */}
      <div className="hidden lg:block">
        <Sidebar active={active} onNavigate={navigate} />
      </div>

      {/* Drawer mobile */}
      {drawer && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-ink/30 backdrop-blur-sm" onClick={() => setDrawer(false)} />
          <div className={cn('absolute inset-y-0 left-0 w-60 shadow-pop')}>
            <Sidebar active={active} onNavigate={navigate} />
          </div>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar title={title} onOpenMenu={() => setDrawer(true)} theme={theme} onToggleTheme={onToggleTheme} user={user} onLogout={onLogout} />
        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-[1400px] px-4 py-5 sm:px-6 sm:py-6">{children}</div>
        </main>
      </div>
    </div>
  );
}
