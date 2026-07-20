import React, { useEffect, useState } from 'react';
import { auth } from './api.js';
import AuthScreen from './screens/AuthScreen.jsx';
import DevicesScreen from './screens/DevicesScreen.jsx';
import TeamScreen from './screens/TeamScreen.jsx';

export default function App() {
  const [session, setSession] = useState(undefined); // undefined = carregando, null = deslogado
  const [tab, setTab] = useState('devices');

  async function refresh() {
    const me = await auth.me();
    setSession(me || null);
  }

  useEffect(() => { refresh(); }, []);

  async function handleLogout() {
    await auth.logout();
    setSession(null);
    setTab('devices');
  }

  if (session === undefined) {
    return <div className="app-loading">Carregando…</div>;
  }

  if (!session) {
    return <AuthScreen onAuthed={() => refresh()} />;
  }

  const user = session.user || {};

  return (
    <div className="app">
      <header className="app-bar">
        <div className="brand">
          <span className="brand-dot" />
          Vistra <span className="brand-tag">Painel</span>
        </div>
        <nav className="app-nav">
          <button
            className={tab === 'devices' ? 'nav-item is-active' : 'nav-item'}
            type="button"
            onClick={() => setTab('devices')}
          >Dispositivos</button>
          <button
            className={tab === 'team' ? 'nav-item is-active' : 'nav-item'}
            type="button"
            onClick={() => setTab('team')}
          >Equipe</button>
        </nav>
        <div className="app-user">
          <span className="muted small">{user.email}</span>
          <button className="btn-ghost" type="button" onClick={handleLogout}>Sair</button>
        </div>
      </header>
      <main className="app-main">
        {tab === 'devices' && <DevicesScreen />}
        {tab === 'team' && <TeamScreen me={user} onLeft={handleLogout} />}
      </main>
    </div>
  );
}
