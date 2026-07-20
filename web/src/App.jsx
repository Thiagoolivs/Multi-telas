import React, { useEffect, useState } from 'react';
import { auth } from './api.js';
import AuthScreen from './screens/AuthScreen.jsx';
import DevicesScreen from './screens/DevicesScreen.jsx';

export default function App() {
  const [session, setSession] = useState(undefined); // undefined = carregando
  const [tab] = useState('devices');

  useEffect(() => {
    auth.me().then((s) => setSession(s ? s.tenant : null));
  }, []);

  async function handleLogout() {
    await auth.logout();
    setSession(null);
  }

  if (session === undefined) {
    return <div className="app-loading">Carregando…</div>;
  }

  if (!session) {
    return <AuthScreen onAuthed={(tenant) => setSession(tenant)} />;
  }

  return (
    <div className="app">
      <header className="app-bar">
        <div className="brand">
          <span className="brand-dot" />
          Vistra <span className="brand-tag">Painel</span>
        </div>
        <nav className="app-nav">
          <button className="nav-item is-active" type="button">Dispositivos</button>
        </nav>
        <button className="btn-ghost" type="button" onClick={handleLogout}>Sair</button>
      </header>
      <main className="app-main">
        {tab === 'devices' && <DevicesScreen />}
      </main>
    </div>
  );
}
