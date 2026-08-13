import React, { useEffect, useState } from 'react';
import { auth } from './api.js';
import { AppShell } from './components/layout/AppShell.jsx';
import { AuthScreen } from './pages/AuthScreen.jsx';
import { DashboardPage } from './pages/DashboardPage.jsx';
import { ScreensPage } from './pages/ScreensPage.jsx';
import { ContentEditorPage } from './pages/ContentEditorPage.jsx';
import { TeamPage } from './pages/TeamPage.jsx';
import { StoragePage } from './pages/StoragePage.jsx';
import { BirthdaysPage } from './pages/BirthdaysPage.jsx';
import { MyDesignsPage } from './pages/MyDesignsPage.jsx';
import { BrandPage } from './pages/BrandPage.jsx';
import { MuralPage } from './pages/MuralPage.jsx';
import { SettingsPage } from './pages/SettingsPage.jsx';
import { AlertsPage } from './pages/AlertsPage.jsx';
import { SupportPage } from './pages/SupportPage.jsx';
import { BillingPage } from './pages/BillingPage.jsx';
import { SystemPage } from './pages/SystemPage.jsx';
import { PlaceholderPage } from './pages/PlaceholderPage.jsx';
import { Spinner } from './components/ui/Feedback.jsx';

const META = {
  overview: { title: 'Visão geral' },
  screens: { title: 'Telas' },
  designs: { title: 'Meus Designs', subtitle: 'Crie, guarde e reaproveite todos os seus designs.' },
  brand: { title: 'Marca', subtitle: 'Cores, fontes e imagens que a IA usa para criar.' },
  mural: { title: 'Mural de fotos', subtitle: 'O público manda foto pelo QR e ela aparece na TV.' },
  content: { title: 'Telas', nav: 'screens' },
  alerts: { title: 'Alertas', subtitle: 'O que precisa da sua atenção agora.' },
  support: { title: 'Suporte', subtitle: 'Dúvidas frequentes e contato.' },
  storage: { title: 'Armazenamento', subtitle: 'Mídias, uso e limites do plano.' },
  birthdays: { title: 'Aniversariantes', subtitle: 'Importe a equipe e o player mostra sozinho.' },
  billing: { title: 'Plano e cobrança' },
  system: { title: 'Estado do sistema', subtitle: 'O que está configurado, e o que vai doer se ficar como está.' },
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
      case 'overview': return <DashboardPage onGoSystem={() => go('system')} onIr={go} />;
      case 'screens': return <ScreensPage onEditContent={(device) => go('content', { device })} />;
      case 'content': return <ContentEditorPage device={route.device} onBack={() => go('screens')} />;
      case 'team': return <TeamPage me={user} onLeft={logout} />;
      case 'storage': return <StoragePage />;
      case 'designs': case 'studio': case 'campaigns': case 'images': return <MyDesignsPage />;
      case 'brand': return <BrandPage />;
      case 'mural': return <MuralPage />;
      case 'birthdays': return <BirthdaysPage />;
      case 'billing': return <BillingPage />;
      case 'system': return <SystemPage />;
      case 'alerts': return <AlertsPage onGoScreens={() => go('screens')} onGoStorage={() => go('storage')} onGoBilling={() => go('billing')} />;
      case 'support': return <SupportPage me={session} />;
      case 'settings': return (
        <SettingsPage me={session} theme={theme} onToggleTheme={toggleTheme} onLogout={logout} onChanged={refresh} />
      );
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
