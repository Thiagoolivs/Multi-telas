import React, { useState, Suspense, lazy } from 'react';
import { Wand2, Plus, MonitorPlay, Check } from 'lucide-react';
import { PageHeader } from '../components/layout/PageHeader.jsx';
import { Panel } from '../components/ui/Panel.jsx';
import { Button } from '../components/ui/Button.jsx';
import { Dialog } from '../components/ui/Dialog.jsx';
import { Field, Select } from '../components/ui/Field.jsx';
import { Spinner, EmptyState } from '../components/ui/Feedback.jsx';
import { useAsync } from '../lib/useAsync.js';
import { devices, deviceConfig } from '../api.js';
import { CONTENT_TYPES, primaryZoneKey, defaultConfig } from '../lib/contentTypes.js';

const CompositionEditor = lazy(() => import('../components/content/CompositionEditor.jsx').then((m) => ({ default: m.CompositionEditor })));

export function StudioPage() {
  const { data } = useAsync(devices.list);
  const screens = (data && data.devices) || [];

  const [editing, setEditing] = useState(null);     // item composicao sendo criado
  const [pending, setPending] = useState(null);     // item pronto, aguardando destino
  const [target, setTarget] = useState('');         // id da tela escolhida
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  function novaComposicao() {
    setMsg('');
    setEditing(CONTENT_TYPES.composicao.make());
  }

  // Editor salvou → escolhe a tela de destino.
  function onEditorSave(item) {
    setEditing(null);
    setPending(item);
    setTarget(screens[0] ? screens[0].id : '');
  }

  async function enviarParaTela() {
    if (!pending || !target) return;
    const dev = screens.find((s) => s.id === target);
    setBusy(true); setMsg('');
    try {
      let cfg = null;
      try { cfg = await deviceConfig.get(target); } catch (e) { /* sem config ainda */ }
      if (!cfg) cfg = defaultConfig(dev ? dev.name : 'Tela');
      const zk = primaryZoneKey(cfg);
      if (!cfg.zonas) cfg.zonas = {};
      if (!cfg.zonas[zk] || !Array.isArray(cfg.zonas[zk].items)) cfg.zonas[zk] = { items: [] };
      cfg.zonas[zk].items.push(pending);
      await deviceConfig.save(target, cfg);
      setMsg(`Composição enviada para “${dev ? dev.name : 'a tela'}” e publicada.`);
      setPending(null);
    } catch (err) { setMsg(err.message || 'Falha ao enviar.'); }
    setBusy(false);
  }

  return (
    <div>
      <PageHeader
        title="Estúdio"
        subtitle="Crie peças no editor visual (imagem, texto e IA) e publique direto nas telas."
        actions={<Button variant="primary" icon={Plus} onClick={novaComposicao}>Nova composição</Button>}
      />

      <Panel className="p-6">
        {screens.length === 0 ? (
          <EmptyState icon={MonitorPlay} title="Nenhuma tela ainda"
            description="Pareie uma TV em Telas para poder publicar suas criações. Você ainda pode criar e salvar depois." />
        ) : (
          <div className="flex flex-col items-center gap-3 py-8 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-accent-soft text-accent"><Wand2 size={26} /></div>
            <div className="text-lg font-semibold text-ink">Crie uma peça do zero ou com IA</div>
            <p className="max-w-md text-sm text-ink-3">A IA monta o fundo e os textos; você insere sua imagem, ajusta posição, tamanho e rotação, e publica na tela.</p>
            <Button variant="primary" icon={Plus} onClick={novaComposicao}>Nova composição</Button>
          </div>
        )}
        {msg && <div className="mt-4 rounded-md border border-line bg-surface-2 px-3 py-2 text-sm text-ink-2">{msg}</div>}
      </Panel>

      {editing && (
        <Suspense fallback={<div className="fixed inset-0 z-50 flex items-center justify-center bg-canvas/90"><Spinner size={22} /></div>}>
          <CompositionEditor value={editing} onClose={() => setEditing(null)} onSave={onEditorSave} />
        </Suspense>
      )}

      <Dialog open={!!pending} onClose={() => setPending(null)} title="Publicar em qual tela?"
        description="A composição vai para a zona principal da tela escolhida e publica ao vivo."
        footer={
          <>
            <Button variant="ghost" onClick={() => setPending(null)}>Depois</Button>
            <Button variant="primary" icon={Check} disabled={busy || !target} onClick={enviarParaTela}>{busy ? 'Enviando…' : 'Publicar'}</Button>
          </>
        }>
        {screens.length ? (
          <Field label="Tela">
            <Select value={target} onChange={(e) => setTarget(e.target.value)}>
              {screens.map((s) => <option key={s.id} value={s.id}>{s.name || s.code || s.id}</option>)}
            </Select>
          </Field>
        ) : (
          <p className="text-sm text-ink-3">Nenhuma tela pareada. Pareie uma TV em <b>Telas</b> e volte aqui.</p>
        )}
      </Dialog>
    </div>
  );
}
