import React, { useEffect, useState } from 'react';
import { AppShell } from './components/layout/AppShell.jsx';
import { DashboardPage } from './pages/DashboardPage.jsx';
import { PlaceholderPage } from './pages/PlaceholderPage.jsx';

// Roteamento simples por estado (sem router externo ainda). Cada seção do
// menu mapeia para uma página; só a Visão geral está implementada.
const PAGES = {
  overview: { title: 'Visão geral', render: () => <DashboardPage /> },
  screens: { title: 'Telas', subtitle: 'Gerencie e monitore cada dispositivo da rede.' },
  campaigns: { title: 'Campanhas', subtitle: 'Crie, agende e distribua conteúdo nas telas.' },
  alerts: { title: 'Alertas', subtitle: 'Incidentes e avisos operacionais.' },
  storage: { title: 'Armazenamento', subtitle: 'Mídias, uso e limites do plano.' },
  team: { title: 'Equipe', subtitle: 'Membros, papéis e permissões.' },
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
  const [active, setActive] = useState('overview');
  const [theme, toggleTheme] = useTheme();
  const page = PAGES[active] || PAGES.overview;

  return (
    <AppShell active={active} onNavigate={setActive} title={page.title} theme={theme} onToggleTheme={toggleTheme}>
      {page.render ? page.render() : <PlaceholderPage title={page.title} subtitle={page.subtitle} />}
    </AppShell>
  );
}
