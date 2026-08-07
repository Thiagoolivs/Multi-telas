import React, { useState } from 'react';
import { MonitorPlay, Plus, Pencil, Trash2, RadioTower, LayoutTemplate, Archive, Download, Upload, Copy, Check, Music } from 'lucide-react';
import { PageHeader } from '../components/layout/PageHeader.jsx';
import { Panel, PanelHeader, PanelFooter } from '../components/ui/Panel.jsx';
import { Table, THead, TBody, TH, TR, TD } from '../components/ui/Table.jsx';
import { Badge } from '../components/ui/Badge.jsx';
import { Button, IconButton } from '../components/ui/Button.jsx';
import { Field, Input, Select } from '../components/ui/Field.jsx';
import { Dialog } from '../components/ui/Dialog.jsx';
import { SkeletonRows, ErrorState, EmptyState } from '../components/ui/Feedback.jsx';
import { StatusDot } from '../components/ui/Badge.jsx';
import { useAsync } from '../lib/useAsync.js';
import { devices, deviceConfig } from '../api.js';
import { deviceStatus } from '../lib/deviceStatus.js';
import { SoundRemote } from '../components/content/SoundRemote.jsx';

export function ScreensPage({ onEditContent }) {
  const { data, loading, error, reload } = useAsync(devices.list);
  const list = data ? data.devices || [] : [];

  const [pairOpen, setPairOpen] = useState(false);
  // Som ao vivo: atalho a partir da frota. Durante um evento, mexer no volume
  // não pode custar entrar na tela, abrir ajustes e rolar até o fim.
  const [somTarget, setSomTarget] = useState(null);
  const [renameTarget, setRenameTarget] = useState(null);
  const [removeTarget, setRemoveTarget] = useState(null);
  const [backupTarget, setBackupTarget] = useState(null);

  return (
    <div>
      <PageHeader
        title="Telas"
        subtitle="Dispositivos pareados à sua conta e o conteúdo que exibem."
        actions={<>
          <Button variant="secondary" icon={MonitorPlay} onClick={() => window.open('/player.html?cloud=1&pid=' + Math.random().toString(36).slice(2, 9), '_blank', 'noopener')}>Abrir novo player</Button>
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
                  onSom={() => setSomTarget(d)}
                  onContent={() => onEditContent(d)}
                  onRename={() => setRenameTarget(d)}
                  onBackup={() => setBackupTarget(d)}
                  onRemove={() => setRemoveTarget(d)} />
              ))}
            </div>
            <PanelFooter><span>{list.length} {list.length === 1 ? 'tela' : 'telas'}</span></PanelFooter>
          </>
        )}
      </Panel>

      <PairDialog open={pairOpen} onClose={() => setPairOpen(false)} onDone={reload} />
      <RenameDialog target={renameTarget} onClose={() => setRenameTarget(null)} onDone={reload} />
      <Dialog
        open={!!somTarget}
        onClose={() => setSomTarget(null)}
        title={'Som · ' + ((somTarget && somTarget.name) || 'Tela')}
        description="Age na TV na hora. A playlist fica em Conteúdo › Ajustes da tela."
      >
        {somTarget && <SoundRemote deviceId={somTarget.id} />}
      </Dialog>
      <RemoveDialog target={removeTarget} onClose={() => setRemoveTarget(null)} onDone={reload} />
      <BackupDialog target={backupTarget} screens={list} onClose={() => setBackupTarget(null)} onDone={reload} />
    </div>
  );
}

// Mini "tela" da frota: status + programação (não é espelho ao vivo).
function FleetCard({ d, onSom, onContent, onRename, onBackup, onRemove }) {
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
          <IconButton icon={Music} label="Som ao vivo" size={14} onClick={onSom} />
          <IconButton icon={Archive} label="Backup / restaurar" size={14} onClick={onBackup} />
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

/*
 * Backup da tela: baixa a configuração inteira (layout, tema e conteúdo) em
 * JSON, restaura de arquivo ou copia de outra tela. Serve para quando a TV
 * some, é apagada ou precisa ser trocada por outra que conecte.
 */
/*
 * O servidor usa settings.nome como nome da tela. Sem isto, restaurar ou
 * copiar uma config renomearia a tela de destino com o nome da origem.
 */
function comNomeDoDestino(cfg, target) {
  const nome = (target && target.name) || (cfg.settings && cfg.settings.nome) || 'Tela';
  return { ...cfg, settings: { ...(cfg.settings || {}), nome } };
}

function BackupDialog({ target, screens, onClose, onDone }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [from, setFrom] = useState('');

  const others = (screens || []).filter((s) => target && s.id !== target.id);

  async function baixar() {
    setBusy(true); setErr(''); setMsg('');
    try {
      const cfg = await deviceConfig.get(target.id);
      if (!cfg) { setErr('Esta tela ainda não tem configuração para salvar.'); return; }
      const backup = { kind: 'multitelas.screen', version: 1, exportedAt: new Date().toISOString(), name: target.name || '', config: cfg };
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'multitelas-' + (target.name || 'tela').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') + '.json';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      setMsg('Backup baixado.');
    } catch (e) { setErr(e.message || 'Falha ao baixar.'); }
    finally { setBusy(false); }
  }

  async function restaurar(e) {
    const f = (e.target.files || [])[0]; e.target.value = '';
    if (!f) return;
    setBusy(true); setErr(''); setMsg('');
    try {
      const parsed = JSON.parse(await f.text());
      // Aceita o arquivo do backup e também uma config "crua".
      const cfg = parsed && parsed.config ? parsed.config : parsed;
      if (!cfg || !cfg.zonas) { setErr('Arquivo não parece um backup do MultiTelas.'); return; }
      await deviceConfig.save(target.id, comNomeDoDestino(cfg, target));
      setMsg('Exibição restaurada nesta tela.');
      onDone();
    } catch (e2) { setErr(e2.message || 'Falha ao restaurar.'); }
    finally { setBusy(false); }
  }

  async function copiar() {
    if (!from) return;
    setBusy(true); setErr(''); setMsg('');
    try {
      const cfg = await deviceConfig.get(from);
      if (!cfg) { setErr('A tela escolhida não tem configuração.'); return; }
      await deviceConfig.save(target.id, comNomeDoDestino(cfg, target));
      setMsg('Exibição copiada para esta tela.');
      onDone();
    } catch (e) { setErr(e.message || 'Falha ao copiar.'); }
    finally { setBusy(false); }
  }

  return (
    <Dialog open={!!target} onClose={onClose} title="Backup e restauração"
      description={target ? `Salve ou recupere toda a exibição de "${target.name || 'sem nome'}".` : ''}
      className="max-w-xl"
      footer={<Button variant="primary" icon={Check} onClick={onClose}>Concluir</Button>}>
      <div className="space-y-4">
        <div className="rounded-lg border border-line p-3">
          <div className="text-sm font-semibold text-ink">Salvar backup</div>
          <p className="mt-0.5 text-xs text-ink-3">Baixa um arquivo com layout, tema e todo o conteúdo desta tela.</p>
          <Button className="mt-2" size="sm" variant="secondary" icon={Download} disabled={busy || !target} onClick={baixar}>Baixar JSON</Button>
        </div>

        <div className="rounded-lg border border-line p-3">
          <div className="text-sm font-semibold text-ink">Restaurar de um arquivo</div>
          <p className="mt-0.5 text-xs text-ink-3">Use o backup de uma tela antiga para reconstruir esta aqui.</p>
          <label className="mt-2 inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-line bg-surface px-3 py-1.5 text-sm text-ink-2 transition hover:bg-surface-2">
            <Upload size={14} /> Escolher arquivo
            <input type="file" accept="application/json,.json" className="hidden" onChange={restaurar} disabled={busy} />
          </label>
        </div>

        <div className="rounded-lg border border-line p-3">
          <div className="text-sm font-semibold text-ink">Copiar de outra tela</div>
          <p className="mt-0.5 text-xs text-ink-3">Clona a exibição de uma tela que já está funcionando.</p>
          {others.length ? (
            <div className="mt-2 flex items-end gap-2">
              <Field label="Tela de origem" className="flex-1">
                <Select value={from} onChange={(e) => setFrom(e.target.value)}>
                  <option value="">Escolha…</option>
                  {others.map((s) => <option key={s.id} value={s.id}>{s.name || s.code || s.id}</option>)}
                </Select>
              </Field>
              <Button size="sm" variant="secondary" icon={Copy} disabled={busy || !from} onClick={copiar}>Copiar</Button>
            </div>
          ) : <p className="mt-2 text-xs text-ink-3">Você só tem esta tela — pareie outra para poder copiar.</p>}
        </div>

        <p className="text-2xs text-ink-3">O backup guarda a exibição, não o pareamento: a TV nova precisa ser pareada primeiro.</p>
        {msg && <div className="rounded-md border border-line bg-surface-2 px-3 py-2 text-sm text-ink-2">{msg}</div>}
        {err && <div className="rounded-md border border-danger-soft bg-danger-soft px-3 py-2 text-sm text-danger">{err}</div>}
      </div>
    </Dialog>
  );
}
