import React, { useState } from 'react';
import { UserPlus, Trash2, Copy, Check, Users2 } from 'lucide-react';
import { PageHeader } from '../components/layout/PageHeader.jsx';
import { Panel, PanelHeader } from '../components/ui/Panel.jsx';
import { Table, THead, TBody, TH, TR, TD } from '../components/ui/Table.jsx';
import { Badge } from '../components/ui/Badge.jsx';
import { Button, IconButton } from '../components/ui/Button.jsx';
import { Field, Input, Select } from '../components/ui/Field.jsx';
import { Dialog } from '../components/ui/Dialog.jsx';
import { SkeletonRows, ErrorState, EmptyState } from '../components/ui/Feedback.jsx';
import { useAsync } from '../lib/useAsync.js';
import { team } from '../api.js';

const ROLE = {
  owner: { label: 'Dono', tone: 'accent' },
  admin: { label: 'Admin', tone: 'neutral' },
  member: { label: 'Membro', tone: 'neutral' },
};

export function TeamPage({ me, onLeft }) {
  const { data, loading, error, reload } = useAsync(team.list);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [busyId, setBusyId] = useState(null);

  const canManage = me.role === 'owner' || me.role === 'admin';
  const isOwner = me.role === 'owner';
  const members = data ? data.members : [];
  const invites = data ? data.invites || [] : [];
  const ownerCount = members.filter((m) => m.role === 'owner').length;

  // Quem pode ter uma ação nesta linha (e qual):
  //  - eu mesmo: "Sair da empresa" (menos se eu for o único dono)
  //  - dono: remove qualquer um; admin: remove só membros
  function rowAction(m) {
    if (m.isMe) return m.role === 'owner' && ownerCount <= 1 ? null : 'leave';
    if (canManage && (isOwner || m.role === 'member')) return 'remove';
    return null;
  }

  async function changeRole(m, role) {
    if (role === m.role) return;
    setBusyId(m.id);
    try { await team.setRole(m.id, role); await reload(); } finally { setBusyId(null); }
  }
  async function removeMember(m) {
    setBusyId(m.id);
    try { await team.remove(m.id); if (m.isMe) return onLeft(); await reload(); }
    finally { setBusyId(null); }
  }

  return (
    <div>
      <PageHeader
        title="Equipe"
        subtitle="Quem acessa e controla as telas. Dono gerencia tudo, Admin gerencia equipe e telas, Membro opera."
        actions={canManage && <Button variant="primary" icon={UserPlus} onClick={() => setInviteOpen(true)}>Convidar</Button>}
      />

      <Panel>
        <PanelHeader title="Membros" description={members.length ? `${members.length} pessoa${members.length > 1 ? 's' : ''}` : undefined} />
        {loading && <SkeletonRows rows={3} cols={3} />}
        {error && <ErrorState description="Não foi possível carregar a equipe." onRetry={reload} />}
        {!loading && !error && members.length > 0 && (
          <Table>
            <THead>
              <TH>Pessoa</TH>
              <TH>Papel</TH>
              <TH align="right">Ações</TH>
            </THead>
            <TBody>
              {members.map((m) => (
                <TR key={m.id}>
                  <TD>
                    <div className="flex items-center gap-2.5">
                      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-accent-soft text-2xs font-semibold text-accent">
                        {initials(m.name || m.email)}
                      </span>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="font-medium text-ink">{m.name || m.email}</span>
                          {m.isMe && <span className="rounded bg-surface-2 px-1.5 py-0.5 text-2xs text-ink-3">você</span>}
                        </div>
                        <div className="text-xs text-ink-3">{m.email}</div>
                      </div>
                    </div>
                  </TD>
                  <TD>
                    {isOwner && !m.isMe ? (
                      <Select value={m.role} disabled={busyId === m.id} onChange={(e) => changeRole(m, e.target.value)} className="h-8 w-32">
                        <option value="owner">Dono</option>
                        <option value="admin">Admin</option>
                        <option value="member">Membro</option>
                      </Select>
                    ) : (
                      <Badge tone={ROLE[m.role].tone}>{ROLE[m.role].label}</Badge>
                    )}
                  </TD>
                  <TD align="right">
                    {rowAction(m) === 'leave' && (
                      <Button size="sm" variant="secondary" disabled={busyId === m.id} onClick={() => removeMember(m)}>
                        Sair da empresa
                      </Button>
                    )}
                    {rowAction(m) === 'remove' && (
                      <Button size="sm" variant="danger" disabled={busyId === m.id} onClick={() => removeMember(m)}>
                        Remover
                      </Button>
                    )}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Panel>

      {canManage && invites.length > 0 && (
        <Panel className="mt-4">
          <PanelHeader title="Convites pendentes" description={`${invites.length} aguardando`} />
          <Table>
            <THead>
              <TH>E-mail</TH>
              <TH>Papel</TH>
              <TH>Código</TH>
              <TH align="right">Ações</TH>
            </THead>
            <TBody>
              {invites.map((inv) => (
                <TR key={inv.id}>
                  <TD className="font-medium text-ink">{inv.email}</TD>
                  <TD><Badge tone={ROLE[inv.role].tone}>{ROLE[inv.role].label}</Badge></TD>
                  <TD><CopyCode code={inv.code} /></TD>
                  <TD align="right">
                    <Button size="sm" variant="ghost" onClick={async () => { await team.revokeInvite(inv.id); reload(); }}>Revogar</Button>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </Panel>
      )}

      <InviteDialog open={inviteOpen} onClose={() => setInviteOpen(false)} onDone={reload} />
    </div>
  );
}

function InviteDialog({ open, onClose, onDone }) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('member');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [created, setCreated] = useState(null);

  function reset() { setEmail(''); setRole('member'); setError(''); setCreated(null); }

  async function submit() {
    setBusy(true); setError('');
    try {
      const inv = await team.invite(email.trim().toLowerCase(), role);
      setCreated(inv);
      onDone();
    } catch (err) { setError(err.message || 'Não foi possível convidar.'); }
    finally { setBusy(false); }
  }

  return (
    <Dialog
      open={open}
      onClose={() => { reset(); onClose(); }}
      title="Convidar para a equipe"
      description="Gera um código. A pessoa cria a conta com ele e já entra na sua empresa."
      footer={
        created ? (
          <Button variant="primary" onClick={() => { reset(); onClose(); }}>Concluir</Button>
        ) : (
          <>
            <Button variant="ghost" onClick={() => { reset(); onClose(); }}>Cancelar</Button>
            <Button variant="primary" icon={UserPlus} onClick={submit} disabled={busy || !email.trim()}>{busy ? 'Gerando…' : 'Gerar convite'}</Button>
          </>
        )
      }
    >
      {created ? (
        <div className="space-y-3">
          <p className="text-sm text-ink-2">Convite criado para <span className="font-medium text-ink">{created.email}</span>. Compartilhe o código:</p>
          <div className="flex items-center justify-between rounded-lg border border-line bg-surface-2 px-3 py-2.5">
            <span className="tnum text-lg font-semibold tracking-[0.25em] text-ink">{created.code}</span>
            <CopyCode code={created.code} labelled />
          </div>
        </div>
      ) : (
        <div className="space-y-3.5">
          <Field label="E-mail">
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="pessoa@empresa.com" autoFocus />
          </Field>
          <Field label="Papel" hint="Admin gerencia equipe e telas. Membro apenas opera.">
            <Select value={role} onChange={(e) => setRole(e.target.value)}>
              <option value="member">Membro</option>
              <option value="admin">Admin</option>
            </Select>
          </Field>
          {error && <div className="rounded-md border border-danger-soft bg-danger-soft px-3 py-2 text-sm text-danger">{error}</div>}
        </div>
      )}
    </Dialog>
  );
}

function CopyCode({ code, labelled }) {
  const [done, setDone] = useState(false);
  async function copy() {
    try { await navigator.clipboard.writeText(code); setDone(true); setTimeout(() => setDone(false), 1500); } catch (e) {}
  }
  if (labelled) {
    return (
      <Button size="sm" variant="secondary" icon={done ? Check : Copy} onClick={copy}>{done ? 'Copiado' : 'Copiar'}</Button>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="tnum rounded border border-line bg-surface-2 px-1.5 py-0.5 text-xs tracking-widest">{code}</span>
      <IconButton icon={done ? Check : Copy} label="Copiar código" size={13} onClick={copy} />
    </span>
  );
}

function initials(s) {
  const parts = String(s).split(/[\s@.]+/).filter(Boolean);
  return ((parts[0]?.[0] || '') + (parts[1]?.[0] || '')).toUpperCase() || '?';
}
