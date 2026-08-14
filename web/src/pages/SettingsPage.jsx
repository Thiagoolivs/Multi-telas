import React, { useState, useEffect } from 'react';
import { User, Building2, KeyRound, Palette, LogOut, Check, Info, Download, Trash2, ShieldCheck } from 'lucide-react';
import { PageHeader } from '../components/layout/PageHeader.jsx';
import { Panel, PanelHeader } from '../components/ui/Panel.jsx';
import { Button } from '../components/ui/Button.jsx';
import { Field, Input } from '../components/ui/Field.jsx';
import { Badge } from '../components/ui/Badge.jsx';
import { Dialog } from '../components/ui/Dialog.jsx';
import { PainelInstalar } from '../components/layout/PainelInstalar.jsx';
import { auth, privacidade } from '../api.js';
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

  const [excluirAberto, setExcluirAberto] = useState(false);
  const [confirmacao, setConfirmacao] = useState('');
  const [excluindo, setExcluindo] = useState(false);
  const [errExcluir, setErrExcluir] = useState('');

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

  async function excluirConta() {
    setExcluindo(true); setErrExcluir('');
    try {
      await privacidade.excluirConta(confirmacao.trim());
      // Não dá para "recarregar o painel": a conta não existe mais. Volta para
      // a raiz, que é a única coisa que ainda faz sentido.
      window.location.href = '/';
    } catch (e) {
      setErrExcluir(e.message || 'Não foi possível excluir a conta.');
      setExcluindo(false);
    }
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

      <PainelInstalar />

      {/* Privacidade e dados (LGPD) */}
      <Panel>
        <PanelHeader title="Seus dados"
          description="A LGPD garante que você acesse e apague o que guardamos. As duas coisas ficam aqui, sem precisar abrir chamado." />
        <div className="divide-y divide-line">
          <div className="flex flex-wrap items-center justify-between gap-3 p-4">
            <div className="max-w-md text-sm text-ink-2">
              <div className="font-medium text-ink">Exportar meus dados</div>
              <div className="text-ink-3">Baixa um arquivo com sua conta, telas, campanhas, marca e aniversariantes. Senhas e sessões ficam de fora por segurança.</div>
            </div>
            <Button variant="secondary" icon={Download} onClick={() => { window.location.href = '/api/privacidade/exportar'; }}>Baixar</Button>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 p-4">
            <div className="max-w-md text-sm text-ink-2">
              <div className="font-medium text-ink">Excluir minha conta</div>
              <div className="text-ink-3">
                Apaga tudo: conta, telas, campanhas, marca, aniversariantes e arquivos enviados.
                {' '}<b className="text-ink-2">Não há lixeira e não dá para desfazer.</b>
              </div>
            </div>
            {isOwner ? (
              <Button variant="secondary" icon={Trash2} className="text-danger" onClick={() => { setExcluirAberto(true); setConfirmacao(''); setErrExcluir(''); }}>Excluir conta</Button>
            ) : (
              <span className="text-xs text-ink-3">Só o dono da conta pode excluir.</span>
            )}
          </div>

          <div className="flex items-start gap-2 p-4 text-xs leading-snug text-ink-3">
            <ShieldCheck size={14} className="mt-0.5 shrink-0" />
            <span>
              Leia os <a href="/termos" target="_blank" rel="noreferrer" className="text-accent hover:underline">Termos de Uso</a>
              {' '}e a <a href="/privacidade" target="_blank" rel="noreferrer" className="text-accent hover:underline">Política de Privacidade</a>.
              {' '}Dados de funcionários que você cadastra são de sua responsabilidade — nós apenas os processamos por sua conta.
            </span>
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

      {/*
        A confirmação é digitar o próprio e-mail, não clicar em "sim". Apagar a
        conta inteira não pode ser um clique a mais no caminho de um clique
        distraído — e o servidor exige a mesma coisa, então não dá para pular.
      */}
      <Dialog open={excluirAberto} onClose={() => setExcluirAberto(false)}
        title="Excluir minha conta" description="Isto apaga tudo permanentemente. Não há como recuperar depois."
        footer={<><Button variant="ghost" onClick={() => setExcluirAberto(false)}>Cancelar</Button>
          <Button variant="primary" icon={Trash2} disabled={excluindo || confirmacao.trim().toLowerCase() !== String(user.email || '').toLowerCase()}
            onClick={excluirConta}>{excluindo ? 'Excluindo…' : 'Excluir para sempre'}</Button></>}>
        <div className="space-y-3">
          <div className="rounded-lg border border-danger-soft bg-danger-soft p-3 text-sm text-danger">
            Serão apagados: sua conta e a da empresa, os usuários, as telas pareadas e suas configurações,
            todas as campanhas, a identidade da marca, os aniversariantes e os arquivos enviados.
            As TVs pareadas param de receber conteúdo novo.
          </div>
          <Field label={'Digite ' + (user.email || 'seu e-mail') + ' para confirmar'}>
            <Input value={confirmacao} onChange={(e) => setConfirmacao(e.target.value)} placeholder={user.email} autoComplete="off" />
          </Field>
          {errExcluir && <div className="rounded-md border border-danger-soft bg-danger-soft px-3 py-2 text-sm text-danger">{errExcluir}</div>}
        </div>
      </Dialog>
    </div>
  );
}
