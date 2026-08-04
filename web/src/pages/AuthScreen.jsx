import React, { useState, useEffect } from 'react';
import { MonitorPlay, ArrowLeft, MailCheck } from 'lucide-react';
import { auth } from '../api.js';
import { Button } from '../components/ui/Button.jsx';
import { Field, Input, Checkbox } from '../components/ui/Field.jsx';
import { cn } from '../lib/cn.js';

// Logotipo do Google no botão (SVG inline — nada externo carrega aqui).
function GoogleMark() {
  return (
    <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#4285F4" d="M45.1 24.5c0-1.6-.1-3.2-.4-4.7H24v8.9h11.8c-.5 2.7-2 5-4.4 6.6v5.5h7.1c4.2-3.8 6.6-9.5 6.6-16.3z" />
      <path fill="#34A853" d="M24 46c6 0 11-2 14.6-5.2l-7.1-5.5c-2 1.3-4.5 2.1-7.5 2.1-5.8 0-10.7-3.9-12.5-9.1H4.2v5.7C7.8 41.1 15.3 46 24 46z" />
      <path fill="#FBBC05" d="M11.5 28.3c-.5-1.3-.7-2.8-.7-4.3s.3-3 .7-4.3v-5.7H4.2A22 22 0 0 0 2 24c0 3.6.9 6.9 2.2 9.9l7.3-5.6z" />
      <path fill="#EA4335" d="M24 10.6c3.3 0 6.2 1.1 8.5 3.3l6.3-6.3C34.9 4 30 2 24 2 15.3 2 7.8 6.9 4.2 14.1l7.3 5.7c1.8-5.3 6.7-9.2 12.5-9.2z" />
    </svg>
  );
}

export function AuthScreen({ onAuthed }) {
  // login | signup | forgot | reset
  const [mode, setMode] = useState('login');
  const [form, setForm] = useState({ email: '', password: '', name: '', inviteCode: '' });
  const [hasInvite, setHasInvite] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [caps, setCaps] = useState({ google: false, mail: false });
  const [resetToken, setResetToken] = useState('');

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  useEffect(() => {
    auth.config().then(setCaps);
    // Link do e-mail: /app/?reset=<token> abre direto a criação de nova senha.
    const p = new URLSearchParams(window.location.search);
    const t = p.get('reset');
    if (t) { setResetToken(t); setMode('reset'); }
    const err = p.get('erro');
    if (err) setError(err === 'email-google-nao-verificado' ? 'Seu e-mail do Google não está verificado.' : 'Não foi possível entrar com o Google.');
  }, []);

  // Tira ?reset= / ?erro= da barra de endereço depois de usar.
  function limparUrl() {
    try {
      const u = new URL(window.location.href);
      u.searchParams.delete('reset'); u.searchParams.delete('erro');
      window.history.replaceState(null, '', u.pathname + (u.search || '') + u.hash);
    } catch (e) {}
  }

  async function submit(e) {
    e.preventDefault();
    setError(''); setInfo(''); setBusy(true);
    try {
      if (mode === 'signup') {
        const payload = { email: form.email, password: form.password, name: form.name };
        if (hasInvite && form.inviteCode.trim()) payload.inviteCode = form.inviteCode.trim().toUpperCase();
        await auth.signup(payload);
        onAuthed();
      } else if (mode === 'forgot') {
        const r = await auth.forgot(form.email);
        setInfo(r && r.devLink
          ? 'E-mail não configurado neste servidor. Use este link para redefinir: ' + r.devLink
          : 'Se existir uma conta com esse e-mail, enviamos um link para criar uma nova senha. Confira também o spam.');
      } else if (mode === 'reset') {
        await auth.reset(resetToken, form.password);
        limparUrl();
        onAuthed();
      } else {
        await auth.login(form.email, form.password);
        onAuthed();
      }
    } catch (err) {
      setError(err.message || 'Não deu certo. Tente de novo.');
    } finally {
      setBusy(false);
    }
  }

  const titulo = mode === 'login' ? 'Entrar na sua conta'
    : mode === 'signup' ? 'Criar sua conta'
    : mode === 'forgot' ? 'Recuperar acesso'
    : 'Criar uma nova senha';
  const subtitulo = mode === 'forgot' ? 'Enviamos um link para o seu e-mail.'
    : mode === 'reset' ? 'Escolha a senha que você vai usar a partir de agora.'
    : 'Gerencie a rede de telas de qualquer lugar.';

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
          <h1 className="text-md font-semibold text-ink">{titulo}</h1>
          <p className="mt-1 text-sm text-ink-3">{subtitulo}</p>

          {(mode === 'login' || mode === 'signup') && (
            <div className="mt-5 grid grid-cols-2 gap-1 rounded-lg border border-line bg-surface-2 p-1">
              {['login', 'signup'].map((m) => (
                <button key={m} type="button" onClick={() => { setMode(m); setError(''); setInfo(''); }}
                  className={cn('rounded-md py-1.5 text-sm font-medium transition',
                    mode === m ? 'bg-surface text-ink shadow-xs' : 'text-ink-3 hover:text-ink-2')}>
                  {m === 'login' ? 'Entrar' : 'Criar conta'}
                </button>
              ))}
            </div>
          )}

          {/* Google: só aparece se o servidor tiver as credenciais. */}
          {caps.google && (mode === 'login' || mode === 'signup') && (
            <>
              <a href="/api/auth/google"
                className="mt-4 flex w-full items-center justify-center gap-2.5 rounded-lg border border-line bg-surface px-4 py-2.5 text-sm font-medium text-ink transition hover:bg-surface-2">
                <GoogleMark /> Continuar com Google
              </a>
              <div className="my-4 flex items-center gap-3">
                <span className="h-px flex-1 bg-line" />
                <span className="text-2xs uppercase tracking-wide text-ink-3">ou</span>
                <span className="h-px flex-1 bg-line" />
              </div>
            </>
          )}

          <form onSubmit={submit} className={cn('space-y-3.5', caps.google && (mode === 'login' || mode === 'signup') ? '' : 'mt-5')}>
            {mode === 'signup' && (
              <Field label={hasInvite ? 'Seu nome' : 'Nome da empresa'}>
                <Input value={form.name} onChange={set('name')} placeholder={hasInvite ? 'Seu nome' : 'Minha Empresa'} autoComplete={hasInvite ? 'name' : 'organization'} />
              </Field>
            )}

            {mode !== 'reset' && (
              <Field label="E-mail">
                <Input type="email" value={form.email} onChange={set('email')} placeholder="voce@empresa.com" autoComplete="email" required />
              </Field>
            )}

            {mode !== 'forgot' && (
              <Field label={mode === 'reset' ? 'Nova senha' : 'Senha'} hint={mode === 'signup' || mode === 'reset' ? 'Mínimo de 6 caracteres.' : undefined}>
                <Input type="password" value={form.password} onChange={set('password')} placeholder="••••••••"
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'} required minLength={6} />
              </Field>
            )}

            {mode === 'login' && (
              <button type="button" onClick={() => { setMode('forgot'); setError(''); setInfo(''); }}
                className="text-xs font-medium text-accent hover:underline">Esqueci minha senha</button>
            )}

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

            {error && <div className="rounded-md border border-danger-soft bg-danger-soft px-3 py-2 text-sm text-danger" role="alert">{error}</div>}
            {info && (
              <div className="flex gap-2 rounded-md border border-line bg-surface-2 px-3 py-2 text-sm text-ink-2">
                <MailCheck size={15} className="mt-0.5 shrink-0 text-accent" />
                <span className="break-all">{info}</span>
              </div>
            )}

            <Button type="submit" variant="primary" size="lg" className="w-full" disabled={busy}>
              {busy ? 'Aguarde…'
                : mode === 'login' ? 'Entrar'
                : mode === 'signup' ? 'Criar conta'
                : mode === 'forgot' ? 'Enviar link' : 'Salvar nova senha'}
            </Button>

            {(mode === 'forgot' || mode === 'reset') && (
              <button type="button" onClick={() => { setMode('login'); setError(''); setInfo(''); limparUrl(); }}
                className="flex w-full items-center justify-center gap-1.5 text-xs font-medium text-ink-3 hover:text-ink">
                <ArrowLeft size={13} /> Voltar para o login
              </button>
            )}
          </form>
        </div>

        <p className="mt-4 text-center text-xs text-ink-3">
          Ao continuar, você concorda com os termos de uso do MultiTelas.
        </p>
      </div>
    </div>
  );
}
