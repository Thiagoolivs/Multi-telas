import React, { useState, useEffect } from 'react';
import { User, Building2, KeyRound, Palette, LogOut, Check, Info } from 'lucide-react';
import { PageHeader } from '../components/layout/PageHeader.jsx';
import { Panel, PanelHeader } from '../components/ui/Panel.jsx';
import { Button } from '../components/ui/Button.jsx';
import { Field, Input } from '../components/ui/Field.jsx';
import { Badge } from '../components/ui/Badge.jsx';
import { auth } from '../api.js';
import { cn } from '../lib/cn.js';

const ROLE_LABEL = { owner: 'Dono', admin: 'Administrador', member: 'Membro' };

export function SettingsPage({ me, theme, onToggleTheme, onLogout, onChanged }) {
  const user = (me && me.user) || {};
  const tenant = (me && me.tenant) || {};
  const isOwner = user.role === 'owner';

  const [nome, setNome] = useState('');
  const [empresa, setEmpresa] = useState('');
  const [salvandoPerfil, setSalvandoPerfil] = useState(false);
  const [msgPerfil, setMsgPerfil] = useState('');
  const [errPerfil, setErrPerfil] = useState('');

  const [atual, setAtual] = useState('');
  const [nova, setNova] = useState('');
  const [confirma, setConfirma] = useState('');
  const [salvandoSenha, setSalvandoSenha] = useState(false);
  const [msgSenha, setMsgSenha] = useState('');
  const [errSenha, setErrSenha] = useState('');

  useEffect(() => {
    setNome(user.name || '');
    setEmpresa(tenant.name || '');
  }, [user.name, tenant.name]);

  const perfilMudou = nome !== (user.name || '') || (isOwner && empresa !== (tenant.name || ''));

  async function salvarPerfil() {
    setSalvandoPerfil(true); setMsgPerfil(''); setErrPerfil('');
    try {
      const payload = { name: nome };
      if (isOwner) payload.empresa = empresa;
      await auth.updateProfile(payload);
      setMsgPerfil('Alterações salvas.');
      if (onChanged) onChanged();
    } catch (e) { setErrPerfil(e.message || 'Não foi possível salvar.'); }
    finally { setSalvandoPerfil(false); }
  }

  async function salvarSenha() {
    setMsgSenha(''); setErrSenha('');
    if (nova.length < 6) { setErrSenha('A nova senha precisa ter pelo menos 6 caracteres.'); return; }
    if (nova !== confirma) { setErrSenha('As duas senhas não conferem.'); return; }
    setSalvandoSenha(true);
    try {
      await auth.changePassword(atual, nova);
      setAtual(''); setNova(''); setConfirma('');
      setMsgSenha('Senha atualizada.');
      if (onChanged) onChanged();
    } catch (e) { setErrSenha(e.message || 'Não foi possível trocar a senha.'); }
    finally { setSalvandoSenha(false); }
  }

  // Conta criada pelo Google ainda não tem senha: aqui ela define a primeira.
  const primeiraSenha = user.hasPassword === false;

  return (
    <div className="space-y-4">
      <PageHeader title="Ajustes" subtitle="Sua conta, a empresa e as preferências do painel." />

      {/* Perfil e empresa */}
      <Panel>
        <PanelHeader title="Perfil" description="Como você e sua empresa aparecem no sistema."
          actions={<Badge>{ROLE_LABEL[user.role] || user.role}</Badge>} />
        <div className="grid gap-4 p-4 md:grid-cols-2">
          <Field label="Seu nome">
            <Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Seu nome" />
          </Field>
          <Field label="E-mail" hint="O e-mail não pode ser alterado por aqui.">
            <Input value={user.email || ''} disabled readOnly />
          </Field>
          <Field label="Nome da empresa"
            hint={isOwner ? 'Aparece nas telas e nos e-mails.' : 'Só o dono da conta pode alterar.'}>
            <Input value={empresa} onChange={(e) => setEmpresa(e.target.value)} placeholder="Minha Empresa" disabled={!isOwner} />
          </Field>
        </div>
        <div className="flex items-center gap-3 border-t border-line px-4 py-3">
          <Button variant="primary" icon={Check} disabled={salvandoPerfil || !perfilMudou} onClick={salvarPerfil}>
            {salvandoPerfil ? 'Salvando…' : 'Salvar alterações'}
          </Button>
          {msgPerfil && <span className="text-sm text-emerald-500">{msgPerfil}</span>}
          {errPerfil && <span className="text-sm text-danger">{errPerfil}</span>}
        </div>
      </Panel>

      {/* Senha */}
      <Panel>
        <PanelHeader title={primeiraSenha ? 'Criar uma senha' : 'Trocar a senha'}
          description={primeiraSenha
            ? 'Sua conta entrou pelo Google. Defina uma senha para poder entrar também por e-mail.'
            : 'Use uma senha que você não usa em outro lugar.'} />
        <div className="grid gap-4 p-4 md:grid-cols-3">
          {!primeiraSenha && (
            <Field label="Senha atual">
              <Input type="password" value={atual} onChange={(e) => setAtual(e.target.value)} placeholder="••••••••" autoComplete="current-password" />
            </Field>
          )}
          <Field label="Nova senha" hint="Mínimo de 6 caracteres.">
            <Input type="password" value={nova} onChange={(e) => setNova(e.target.value)} placeholder="••••••••" autoComplete="new-password" />
          </Field>
          <Field label="Repita a nova senha">
            <Input type="password" value={confirma} onChange={(e) => setConfirma(e.target.value)} placeholder="••••••••" autoComplete="new-password" />
          </Field>
        </div>
        <div className="flex items-center gap-3 border-t border-line px-4 py-3">
          <Button variant="primary" icon={KeyRound} disabled={salvandoSenha || !nova || !confirma} onClick={salvarSenha}>
            {salvandoSenha ? 'Salvando…' : primeiraSenha ? 'Criar senha' : 'Trocar senha'}
          </Button>
          {msgSenha && <span className="text-sm text-emerald-500">{msgSenha}</span>}
          {errSenha && <span className="text-sm text-danger">{errSenha}</span>}
        </div>
      </Panel>

      {/* Aparência */}
      <Panel>
        <PanelHeader title="Aparência" description="Vale só para este navegador." />
        <div className="p-4">
          <div className="inline-flex gap-1 rounded-lg border border-line bg-surface-2 p-1">
            {[['light', 'Claro'], ['dark', 'Escuro']].map(([id, label]) => (
              <button key={id} onClick={() => { if (theme !== id) onToggleTheme(); }}
                className={cn('inline-flex items-center gap-1.5 rounded-md px-4 py-1.5 text-sm font-medium transition',
                  theme === id ? 'bg-surface text-ink shadow-xs' : 'text-ink-3 hover:text-ink-2')}>
                <Palette size={14} /> {label}
              </button>
            ))}
          </div>
        </div>
      </Panel>

      {/* Conta */}
      <Panel>
        <PanelHeader title="Conta" />
        <div className="flex flex-wrap items-center justify-between gap-3 p-4">
          <div className="flex items-start gap-2 text-sm text-ink-3">
            <Info size={15} className="mt-0.5 shrink-0" />
            <span>Sair encerra a sessão só neste navegador. As telas continuam exibindo normalmente.</span>
          </div>
          <Button variant="secondary" icon={LogOut} onClick={onLogout}>Sair da conta</Button>
        </div>
      </Panel>
    </div>
  );
}
