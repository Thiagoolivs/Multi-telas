import React, { useState } from 'react';
import { auth } from '../api.js';

export default function AuthScreen({ onAuthed }) {
  const [mode, setMode] = useState('login'); // 'login' | 'signup'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const res = mode === 'signup'
        ? await auth.signup(email, password, name)
        : await auth.login(email, password);
      onAuthed(res.tenant);
    } catch (err) {
      setError(err.message || 'Não deu certo. Tente de novo.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth">
      <div className="auth-card">
        <div className="brand brand-lg">
          <span className="brand-dot" />
          Vistra
        </div>
        <p className="auth-sub">Controle suas TVs de qualquer lugar.</p>

        <div className="seg">
          <button
            type="button"
            className={mode === 'login' ? 'seg-btn is-active' : 'seg-btn'}
            onClick={() => setMode('login')}
          >Entrar</button>
          <button
            type="button"
            className={mode === 'signup' ? 'seg-btn is-active' : 'seg-btn'}
            onClick={() => setMode('signup')}
          >Criar conta</button>
        </div>

        <form onSubmit={submit} className="auth-form">
          {mode === 'signup' && (
            <label className="field">
              <span>Nome da empresa</span>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Minha Empresa" autoComplete="organization" />
            </label>
          )}
          <label className="field">
            <span>E-mail</span>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="voce@empresa.com" autoComplete="email" required />
          </label>
          <label className="field">
            <span>Senha</span>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="6+ caracteres" autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} required />
          </label>

          {error && <div className="alert" role="alert">{error}</div>}

          <button className="btn-primary" type="submit" disabled={busy}>
            {busy ? '…' : mode === 'signup' ? 'Criar conta' : 'Entrar'}
          </button>
        </form>
      </div>
    </div>
  );
}
