import React, { useEffect, useState } from 'react';
import { devices } from '../api.js';

export default function DevicesScreen() {
  const [list, setList] = useState(null); // null = carregando
  const [error, setError] = useState('');
  const [code, setCode] = useState('');
  const [pairName, setPairName] = useState('');
  const [pairing, setPairing] = useState(false);
  const [pairMsg, setPairMsg] = useState('');

  async function load() {
    setError('');
    try {
      const res = await devices.list();
      setList(res.devices || []);
    } catch (err) {
      setError(err.message || 'Não foi possível carregar os dispositivos.');
      setList([]);
    }
  }

  useEffect(() => { load(); }, []);

  async function submitPair(e) {
    e.preventDefault();
    setPairMsg('');
    setPairing(true);
    try {
      const d = await devices.pair(code, pairName);
      setPairMsg('Pareado: ' + (d.name || 'TV'));
      setCode('');
      setPairName('');
      await load();
    } catch (err) {
      setPairMsg(err.message || 'Não foi possível parear.');
    } finally {
      setPairing(false);
    }
  }

  async function rename(d) {
    const name = window.prompt('Novo nome do dispositivo', d.name || '');
    if (name == null) return;
    await devices.rename(d.id, name);
    load();
  }

  async function remove(d) {
    if (!window.confirm('Remover "' + (d.name || 'este dispositivo') + '"?')) return;
    await devices.remove(d.id);
    load();
  }

  return (
    <div className="screen">
      <div className="screen-head">
        <h1>Dispositivos</h1>
        <p className="muted">TVs pareadas à sua conta. O conteúdo que você publica chega nelas na hora.</p>
      </div>

      <section className="card pair-card">
        <h2>Parear uma TV</h2>
        <p className="muted small">Na TV, abra o player com <code>?cloud=1</code> — ela mostra um código de 6 dígitos.</p>
        <form onSubmit={submitPair} className="pair-form">
          <input
            className="code-input"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="CÓDIGO"
            maxLength={6}
            aria-label="Código de pareamento"
          />
          <input
            className="name-input"
            value={pairName}
            onChange={(e) => setPairName(e.target.value)}
            placeholder="Nome (ex.: Recepção)"
            aria-label="Nome do dispositivo"
          />
          <button className="btn-primary" type="submit" disabled={pairing || code.length < 4}>
            {pairing ? '…' : 'Parear'}
          </button>
        </form>
        {pairMsg && <div className="alert alert-info">{pairMsg}</div>}
      </section>

      {error && <div className="alert" role="alert">{error}</div>}

      {list === null ? (
        <div className="muted">Carregando dispositivos…</div>
      ) : list.length === 0 ? (
        <div className="empty">
          <div className="empty-icon">📺</div>
          <p>Nenhuma TV pareada ainda. Use o código acima para conectar a primeira.</p>
        </div>
      ) : (
        <ul className="device-list">
          {list.map((d) => (
            <li key={d.id} className="device">
              <div className="device-info">
                <div className="device-name">{d.name || 'TV sem nome'}</div>
                <div className="device-meta">
                  <span className="pill">{d.code}</span>
                  <span className={d.hasConfig ? 'dot dot-on' : 'dot'} />
                  <span className="muted small">{d.hasConfig ? 'com conteúdo' : 'aguardando conteúdo'}</span>
                </div>
              </div>
              <div className="device-actions">
                <button className="btn-ghost" type="button" onClick={() => rename(d)}>Renomear</button>
                <button className="btn-ghost btn-danger" type="button" onClick={() => remove(d)}>Remover</button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
