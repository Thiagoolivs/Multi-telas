import React, { useEffect, useState } from 'react';
import { team } from '../api.js';

const ROLE_LABEL = { owner: 'Dono', admin: 'Admin', member: 'Membro' };

export default function TeamScreen({ me, onLeft }) {
  const [data, setData] = useState(null); // { members, invites, me }
  const [error, setError] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('member');
  const [inviting, setInviting] = useState(false);
  const [lastInvite, setLastInvite] = useState(null);

  const canManage = me.role === 'owner' || me.role === 'admin';
  const isOwner = me.role === 'owner';

  async function load() {
    setError('');
    try {
      setData(await team.list());
    } catch (err) {
      setError(err.message || 'Não foi possível carregar a equipe.');
      setData({ members: [], invites: [] });
    }
  }

  useEffect(() => { load(); }, []);

  async function submitInvite(e) {
    e.preventDefault();
    setInviting(true);
    setError('');
    try {
      const inv = await team.invite(email.trim().toLowerCase(), role);
      setLastInvite(inv);
      setEmail('');
      await load();
    } catch (err) {
      setError(err.message || 'Não foi possível convidar.');
    } finally {
      setInviting(false);
    }
  }

  async function changeRole(m, newRole) {
    if (newRole === m.role) return;
    setError('');
    try {
      await team.setRole(m.id, newRole);
      await load();
    } catch (err) {
      setError(err.message || 'Não foi possível mudar o papel.');
    }
  }

  async function removeMember(m) {
    const self = m.isMe;
    const msg = self ? 'Sair desta empresa?' : 'Remover ' + (m.name || m.email) + '?';
    if (!window.confirm(msg)) return;
    setError('');
    try {
      await team.remove(m.id);
      if (self) return onLeft();
      await load();
    } catch (err) {
      setError(err.message || 'Não foi possível remover.');
    }
  }

  async function revoke(inv) {
    setError('');
    try { await team.revokeInvite(inv.id); await load(); }
    catch (err) { setError(err.message || 'Não foi possível revogar.'); }
  }

  return (
    <div className="screen">
      <div className="screen-head">
        <h1>Equipe</h1>
        <p className="muted">Quem pode acessar e controlar as TVs da empresa. Papéis: <b>Dono</b> gerencia tudo, <b>Admin</b> gerencia equipe e TVs, <b>Membro</b> controla as TVs.</p>
      </div>

      {canManage && (
        <section className="card">
          <h2>Convidar alguém</h2>
          <p className="muted small">Gera um código de convite. A pessoa cria a conta com esse código e já entra na sua empresa.</p>
          <form onSubmit={submitInvite} className="pair-form">
            <input
              className="name-input"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="email@pessoa.com"
              aria-label="E-mail do convidado"
              required
            />
            <select className="role-select" value={role} onChange={(e) => setRole(e.target.value)} aria-label="Papel">
              <option value="member">Membro</option>
              <option value="admin">Admin</option>
            </select>
            <button className="btn-primary" type="submit" disabled={inviting}>{inviting ? '…' : 'Convidar'}</button>
          </form>
          {lastInvite && (
            <div className="alert alert-info">
              Convite criado para <b>{lastInvite.email}</b>. Código: <code className="code-strong">{lastInvite.code}</code>
            </div>
          )}
        </section>
      )}

      {error && <div className="alert" role="alert">{error}</div>}

      {data === null ? (
        <div className="muted">Carregando equipe…</div>
      ) : (
        <>
          <ul className="device-list">
            {data.members.map((m) => (
              <li key={m.id} className="device">
                <div className="device-info">
                  <div className="device-name">
                    {m.name || m.email}{m.isMe && <span className="pill pill-soft">você</span>}
                  </div>
                  <div className="device-meta">
                    <span className="muted small">{m.email}</span>
                  </div>
                </div>
                <div className="device-actions">
                  {isOwner && !m.isMe ? (
                    <select className="role-select" value={m.role} onChange={(e) => changeRole(m, e.target.value)} aria-label={'Papel de ' + m.email}>
                      <option value="owner">Dono</option>
                      <option value="admin">Admin</option>
                      <option value="member">Membro</option>
                    </select>
                  ) : (
                    <span className={'role-badge role-' + m.role}>{ROLE_LABEL[m.role] || m.role}</span>
                  )}
                  {(m.isMe || (canManage && !m.isMe && (isOwner || m.role === 'member'))) && (
                    <button className="btn-ghost btn-danger" type="button" onClick={() => removeMember(m)}>
                      {m.isMe ? 'Sair' : 'Remover'}
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>

          {canManage && data.invites && data.invites.length > 0 && (
            <section className="card">
              <h2>Convites pendentes</h2>
              <ul className="device-list">
                {data.invites.map((inv) => (
                  <li key={inv.id} className="device">
                    <div className="device-info">
                      <div className="device-name">{inv.email}</div>
                      <div className="device-meta">
                        <span className={'role-badge role-' + inv.role}>{ROLE_LABEL[inv.role]}</span>
                        <span className="muted small">código <code className="code-strong">{inv.code}</code></span>
                      </div>
                    </div>
                    <div className="device-actions">
                      <button className="btn-ghost btn-danger" type="button" onClick={() => revoke(inv)}>Revogar</button>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}
