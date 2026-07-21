import React, { useState } from 'react';
import { MonitorPlay } from 'lucide-react';
import { auth } from '../api.js';
import { Button } from '../components/ui/Button.jsx';
import { Field, Input, Checkbox } from '../components/ui/Field.jsx';
import { cn } from '../lib/cn.js';

export function AuthScreen({ onAuthed }) {
  const [mode, setMode] = useState('login'); // 'login' | 'signup'
  const [form, setForm] = useState({ email: '', password: '', name: '', inviteCode: '' });
  const [hasInvite, setHasInvite] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      if (mode === 'signup') {
        const payload = { email: form.email, password: form.password, name: form.name };
        if (hasInvite && form.inviteCode.trim()) payload.inviteCode = form.inviteCode.trim().toUpperCase();
        await auth.signup(payload);
      } else {
        await auth.login(form.email, form.password);
      }
      onAuthed();
    } catch (err) {
      setError(err.message || 'Não deu certo. Tente de novo.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-accent text-accent-fg">
            <MonitorPlay size={17} strokeWidth={2.5} />
          </div>
          <span className="text-lg font-semibold tracking-tight text-ink">MultiTelas</span>
        </div>

        <div className="rounded-xl border border-line bg-surface p-6 shadow-sm">
          <h1 className="text-md font-semibold text-ink">
            {mode === 'login' ? 'Entrar na sua conta' : 'Criar sua conta'}
          </h1>
          <p className="mt-1 text-sm text-ink-3">Gerencie a rede de telas de qualquer lugar.</p>

          <div className="mt-5 grid grid-cols-2 gap-1 rounded-lg border border-line bg-surface-2 p-1">
            {['login', 'signup'].map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => { setMode(m); setError(''); }}
                className={cn(
                  'rounded-md py-1.5 text-sm font-medium transition',
                  mode === m ? 'bg-surface text-ink shadow-xs' : 'text-ink-3 hover:text-ink-2'
                )}
              >
                {m === 'login' ? 'Entrar' : 'Criar conta'}
              </button>
            ))}
          </div>

          <form onSubmit={submit} className="mt-5 space-y-3.5">
            {mode === 'signup' && (
              <Field label={hasInvite ? 'Seu nome' : 'Nome da empresa'}>
                <Input value={form.name} onChange={set('name')} placeholder={hasInvite ? 'Seu nome' : 'Minha Empresa'} autoComplete={hasInvite ? 'name' : 'organization'} />
              </Field>
            )}
            <Field label="E-mail">
              <Input type="email" value={form.email} onChange={set('email')} placeholder="voce@empresa.com" autoComplete="email" required />
            </Field>
            <Field label="Senha" hint={mode === 'signup' ? 'Mínimo de 6 caracteres.' : undefined}>
              <Input type="password" value={form.password} onChange={set('password')} placeholder="••••••••" autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} required />
            </Field>

            {mode === 'signup' && (
              <>
                <Checkbox label="Tenho um código de convite" checked={hasInvite} onChange={(e) => setHasInvite(e.target.checked)} />
                {hasInvite && (
                  <Field label="Código de convite">
                    <Input value={form.inviteCode} onChange={(e) => setForm((f) => ({ ...f, inviteCode: e.target.value.toUpperCase() }))} placeholder="CÓDIGO" maxLength={8} className="tracking-[0.2em]" />
                  </Field>
                )}
              </>
            )}

            {error && (
              <div className="rounded-md border border-danger-soft bg-danger-soft px-3 py-2 text-sm text-danger" role="alert">
                {error}
              </div>
            )}

            <Button type="submit" variant="primary" size="lg" className="w-full" disabled={busy}>
              {busy ? 'Aguarde…' : mode === 'login' ? 'Entrar' : 'Criar conta'}
            </Button>
          </form>
        </div>

        <p className="mt-4 text-center text-xs text-ink-3">
          Ao continuar, você concorda com os termos de uso do MultiTelas.
        </p>
      </div>
    </div>
  );
}
