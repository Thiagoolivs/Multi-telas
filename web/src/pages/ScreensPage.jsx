import React, { useState } from 'react';
import { MonitorPlay, Plus, Pencil, Trash2, RadioTower } from 'lucide-react';
import { PageHeader } from '../components/layout/PageHeader.jsx';
import { Panel, PanelHeader, PanelFooter } from '../components/ui/Panel.jsx';
import { Table, THead, TBody, TH, TR, TD } from '../components/ui/Table.jsx';
import { Badge } from '../components/ui/Badge.jsx';
import { Button, IconButton } from '../components/ui/Button.jsx';
import { Field, Input } from '../components/ui/Field.jsx';
import { Dialog } from '../components/ui/Dialog.jsx';
import { SkeletonRows, ErrorState, EmptyState } from '../components/ui/Feedback.jsx';
import { useAsync } from '../lib/useAsync.js';
import { devices } from '../api.js';

export function ScreensPage() {
  const { data, loading, error, reload } = useAsync(devices.list);
  const list = data ? data.devices || [] : [];

  const [pairOpen, setPairOpen] = useState(false);
  const [renameTarget, setRenameTarget] = useState(null);
  const [removeTarget, setRemoveTarget] = useState(null);

  return (
    <div>
      <PageHeader
        title="Telas"
        subtitle="Dispositivos pareados à sua conta e o conteúdo que exibem."
        actions={<Button variant="primary" icon={Plus} onClick={() => setPairOpen(true)}>Parear tela</Button>}
      />

      <Panel>
        <PanelHeader title="Suas telas" description="Cada tela recebe as publicações na hora que você salva." />

        {loading && <SkeletonRows rows={5} cols={4} />}
        {error && <ErrorState description="Não foi possível carregar as telas." onRetry={reload} />}
        {!loading && !error && list.length === 0 && (
          <EmptyState
            icon={MonitorPlay}
            title="Nenhuma tela pareada"
            description="Abra o player na TV com ?cloud=1, pegue o código de 6 dígitos e pareie aqui."
            action={<Button size="sm" variant="primary" icon={Plus} onClick={() => setPairOpen(true)}>Parear a primeira</Button>}
          />
        )}

        {!loading && !error && list.length > 0 && (
          <>
            <Table>
              <THead>
                <TH>Tela</TH>
                <TH>Código</TH>
                <TH>Conteúdo</TH>
                <TH align="right">Ações</TH>
              </THead>
              <TBody>
                {list.map((d) => (
                  <TR key={d.id}>
                    <TD className="font-medium text-ink">{d.name || 'Tela sem nome'}</TD>
                    <TD><span className="tnum rounded border border-line bg-surface-2 px-1.5 py-0.5 text-xs tracking-widest">{d.code}</span></TD>
                    <TD>
                      {d.hasConfig
                        ? <Badge tone="ok">com conteúdo</Badge>
                        : <Badge tone="neutral">aguardando</Badge>}
                    </TD>
                    <TD align="right">
                      <div className="inline-flex items-center gap-0.5">
                        <IconButton icon={Pencil} label="Renomear" size={14} onClick={() => setRenameTarget(d)} />
                        <IconButton icon={Trash2} label="Remover" size={14} className="hover:text-danger" onClick={() => setRemoveTarget(d)} />
                      </div>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
            <PanelFooter><span>{list.length} {list.length === 1 ? 'tela' : 'telas'}</span></PanelFooter>
          </>
        )}
      </Panel>

      <PairDialog open={pairOpen} onClose={() => setPairOpen(false)} onDone={reload} />
      <RenameDialog target={renameTarget} onClose={() => setRenameTarget(null)} onDone={reload} />
      <RemoveDialog target={removeTarget} onClose={() => setRemoveTarget(null)} onDone={reload} />
    </div>
  );
}

function PairDialog({ open, onClose, onDone }) {
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit() {
    setBusy(true); setError('');
    try {
      await devices.pair(code, name);
      setCode(''); setName('');
      onDone(); onClose();
    } catch (err) { setError(err.message || 'Não foi possível parear.'); }
    finally { setBusy(false); }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Parear uma tela"
      description="Na TV, abra o player com ?cloud=1 — ela mostra um código de 6 dígitos."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button variant="primary" icon={RadioTower} onClick={submit} disabled={busy || code.trim().length < 4}>
            {busy ? 'Pareando…' : 'Parear'}
          </Button>
        </>
      }
    >
      <div className="space-y-3.5">
        <Field label="Código de pareamento">
          <Input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="CÓDIGO" maxLength={6} className="tracking-[0.3em]" />
        </Field>
        <Field label="Nome da tela" hint="Ex.: Recepção, Vitrine, Refeitório.">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Recepção" />
        </Field>
        {error && <div className="rounded-md border border-danger-soft bg-danger-soft px-3 py-2 text-sm text-danger">{error}</div>}
      </div>
    </Dialog>
  );
}

function RenameDialog({ target, onClose, onDone }) {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  React.useEffect(() => { setName(target ? target.name || '' : ''); }, [target]);

  async function submit() {
    setBusy(true);
    try { await devices.rename(target.id, name); onDone(); onClose(); }
    finally { setBusy(false); }
  }

  return (
    <Dialog
      open={!!target}
      onClose={onClose}
      title="Renomear tela"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button variant="primary" onClick={submit} disabled={busy || !name.trim()}>Salvar</Button>
        </>
      }
    >
      <Field label="Nome da tela">
        <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
      </Field>
    </Dialog>
  );
}

function RemoveDialog({ target, onClose, onDone }) {
  const [busy, setBusy] = useState(false);
  async function submit() {
    setBusy(true);
    try { await devices.remove(target.id); onDone(); onClose(); }
    finally { setBusy(false); }
  }
  return (
    <Dialog
      open={!!target}
      onClose={onClose}
      title="Remover tela"
      description={target ? `A tela "${target.name || 'sem nome'}" será desvinculada da sua conta.` : ''}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button variant="danger" icon={Trash2} onClick={submit} disabled={busy}>{busy ? 'Removendo…' : 'Remover'}</Button>
        </>
      }
    >
      <p className="text-sm text-ink-2">Essa ação não pode ser desfeita. A TV precisará ser pareada de novo para voltar a ser controlada.</p>
    </Dialog>
  );
}
