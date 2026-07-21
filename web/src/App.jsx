import React, { useEffect, useState } from 'react';
import { auth } from './api.js';
import { AppShell } from './components/layout/AppShell.jsx';
import { AuthScreen } from './pages/AuthScreen.jsx';
import { DashboardPage } from './pages/DashboardPage.jsx';
import { ScreensPage } from './pages/ScreensPage.jsx';
import { ContentEditorPage } from './pages/ContentEditorPage.jsx';
import { TeamPage } from './pages/TeamPage.jsx';
import { StoragePage } from './pages/StoragePage.jsx';
import { BillingPage } from './pages/BillingPage.jsx';
import { PlaceholderPage } from './pages/PlaceholderPage.jsx';
import { Spinner } from './components/ui/Feedback.jsx';

const META = {
  overview: { title: 'Visão geral' },
  screens: { title: 'Telas' },
  content: { title: 'Telas', nav: 'screens' },
  campaigns: { title: 'Campanhas', subtitle: 'Crie, agende e distribua conteúdo nas telas.' },
  alerts: { title: 'Alertas', subtitle: 'Incidentes e avisos operacionais.' },
  storage: { title: 'Armazenamento', subtitle: 'Mídias, uso e limites do plano.' },
  billing: { title: 'Plano e cobrança' },
  settings: { title: 'Ajustes', subtitle: 'Conta, integrações e preferências.' },
};

function useTheme() {
  const [theme, setTheme] = useState(() => localStorage.getItem('mt.theme') || 'light');
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('mt.theme', theme);
  }, [theme]);
  return [theme, () => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))];
}

export default function App() {
  const [session, setSession] = useState(undefined); // undefined = carregando
  // Volta do checkout (?billing=success|cancel) cai direto na tela de plano.
  const [route, setRoute] = useState(() =>
    new URLSearchParams(window.location.search).get('billing') ? { name: 'billing' } : { name: 'overview' });
  const [theme, toggleTheme] = useTheme();

  const refresh = () => auth.me().then((me) => setSession(me || null));
  useEffect(() => { refresh(); }, []);

  const go = (name, params) => setRoute({ name, ...params });

  async function logout() {
    await auth.logout();
    setSession(null);
    setRoute({ name: 'overview' });
  }

  if (session === undefined) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-canvas">
        <Spinner size={22} />
      </div>
    );
  }

  if (!session) return <AuthScreen onAuthed={refresh} />;

  const user = session.user || {};
  const meta = META[route.name] || META.overview;
  const navActive = meta.nav || route.name; // qual item da sidebar destacar

  function renderPage() {
    switch (route.name) {
      case 'overview': return <DashboardPage />;
      case 'screens': return <ScreensPage onEditContent={(device) => go('content', { device })} />;
      case 'content': return <ContentEditorPage device={route.device} onBack={() => go('screens')} />;
      case 'team': return <TeamPage me={user} onLeft={logout} />;
      case 'storage': return <StoragePage />;
      case 'billing': return <BillingPage />;
      default: return <PlaceholderPage title={meta.title} subtitle={meta.subtitle} />;
    }
  }

  return (
    <AppShell
      active={navActive}
      onNavigate={(name) => go(name)}
      title={meta.title}
      theme={theme}
      onToggleTheme={toggleTheme}
      user={user}
      onLogout={logout}
    >
      {renderPage()}
    </AppShell>
  );
}
