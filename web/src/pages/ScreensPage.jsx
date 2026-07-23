import React, { useState } from 'react';
import { MonitorPlay, Plus, Pencil, Trash2, RadioTower, LayoutTemplate } from 'lucide-react';
import { PageHeader } from '../components/layout/PageHeader.jsx';
import { Panel, PanelHeader, PanelFooter } from '../components/ui/Panel.jsx';
import { Table, THead, TBody, TH, TR, TD } from '../components/ui/Table.jsx';
import { Badge } from '../components/ui/Badge.jsx';
import { Button, IconButton } from '../components/ui/Button.jsx';
import { Field, Input } from '../components/ui/Field.jsx';
import { Dialog } from '../components/ui/Dialog.jsx';
import { SkeletonRows, ErrorState, EmptyState } from '../components/ui/Feedback.jsx';
import { StatusDot } from '../components/ui/Badge.jsx';
import { useAsync } from '../lib/useAsync.js';
import { devices } from '../api.js';
import { deviceStatus } from '../lib/deviceStatus.js';

export function ScreensPage({ onEditContent }) {
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
        actions={<>
          <Button variant="secondary" icon={MonitorPlay} onClick={() => window.open('/player.html?cloud=1', '_blank', 'noopener')}>Abrir player</Button>
          <Button variant="primary" icon={Plus} onClick={() => setPairOpen(true)}>Parear tela</Button>
        </>}
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
            <div className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-3">
              {list.map((d) => (
                <FleetCard key={d.id} d={d}
                  onContent={() => onEditContent(d)}
                  onRename={() => setRenameTarget(d)}
                  onRemove={() => setRemoveTarget(d)} />
              ))}
            </div>
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

// Mini "tela" da frota: status + programação (não é espelho ao vivo).
function FleetCard({ d, onContent, onRename, onRemove }) {
  const st = deviceStatus(d.lastSeen);
  const online = st.tone === 'ok';
  return (
    <div className="overflow-hidden rounded-xl border border-line bg-surface transition hover:border-line-strong">
      <div className="relative flex aspect-video items-center justify-center overflow-hidden border-b border-line bg-gradient-to-br from-surface-2 to-accent-soft/40">
        <div className="absolute right-2 top-2 inline-flex items-center gap-1.5 rounded-full bg-surface/80 px-2 py-0.5 text-2xs backdrop-blur">
          <StatusDot tone={st.tone} pulse={st.pulse} /><span className="text-ink-2">{st.label}</span>
        </div>
        <div className="flex flex-col items-center gap-1.5 text-center">
          <MonitorPlay size={26} className={online ? 'text-accent' : 'text-ink-3'} />
          <span className="text-xs font-medium text-ink-2">{d.hasConfig ? 'Programação ativa' : 'Sem programação'}</span>
        </div>
        <span className="tnum absolute bottom-2 left-2 rounded border border-line bg-surface/80 px-1.5 py-0.5 text-2xs tracking-widest text-ink-3 backdrop-blur">{d.code}</span>
      </div>
      <div className="flex items-center justify-between gap-2 p-3">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-ink">{d.name || 'Tela sem nome'}</div>
          <div className="truncate text-2xs text-ink-3">{st.label}{st.seen ? ' · ' + st.seen : ''}</div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Button size="sm" variant="secondary" icon={LayoutTemplate} onClick={onContent}>Conteúdo</Button>
          <IconButton icon={Pencil} label="Renomear" size={14} onClick={onRename} />
          <IconButton icon={Trash2} label="Remover" size={14} className="hover:text-danger" onClick={onRemove} />
        </div>
      </div>
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
