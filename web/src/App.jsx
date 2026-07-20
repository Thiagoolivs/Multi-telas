import React, { useEffect, useState } from 'react';
import { auth } from './api.js';
import { AppShell } from './components/layout/AppShell.jsx';
import { AuthScreen } from './pages/AuthScreen.jsx';
import { DashboardPage } from './pages/DashboardPage.jsx';
import { ScreensPage } from './pages/ScreensPage.jsx';
import { TeamPage } from './pages/TeamPage.jsx';
import { PlaceholderPage } from './pages/PlaceholderPage.jsx';
import { Spinner } from './components/ui/Feedback.jsx';

const META = {
  overview: { title: 'Visão geral' },
  screens: { title: 'Telas' },
  campaigns: { title: 'Campanhas', subtitle: 'Crie, agende e distribua conteúdo nas telas.' },
  alerts: { title: 'Alertas', subtitle: 'Incidentes e avisos operacionais.' },
  storage: { title: 'Armazenamento', subtitle: 'Mídias, uso e limites do plano.' },
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
  const [active, setActive] = useState('overview');
  const [theme, toggleTheme] = useTheme();

  const refresh = () => auth.me().then((me) => setSession(me || null));
  useEffect(() => { refresh(); }, []);

  async function logout() {
    await auth.logout();
    setSession(null);
    setActive('overview');
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
  const meta = META[active] || META.overview;

  function renderPage() {
    switch (active) {
      case 'overview': return <DashboardPage />;
      case 'screens': return <ScreensPage />;
      case 'team': return <TeamPage me={user} onLeft={logout} />;
      default: return <PlaceholderPage title={meta.title} subtitle={meta.subtitle} />;
    }
  }

  return (
    <AppShell
      active={active}
      onNavigate={setActive}
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
