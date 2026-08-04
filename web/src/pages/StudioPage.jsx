import React, { useState, Suspense, lazy } from 'react';
import { Wand2, Plus, MonitorPlay, Check, Save } from 'lucide-react';
import { PageHeader } from '../components/layout/PageHeader.jsx';
import { Panel } from '../components/ui/Panel.jsx';
import { Button } from '../components/ui/Button.jsx';
import { Dialog } from '../components/ui/Dialog.jsx';
import { Field, Select, Input } from '../components/ui/Field.jsx';
import { Spinner, EmptyState } from '../components/ui/Feedback.jsx';
import { useAsync } from '../lib/useAsync.js';
import { devices, deviceConfig, library } from '../api.js';
import { CONTENT_TYPES, primaryZoneKey, defaultConfig } from '../lib/contentTypes.js';

const CompositionEditor = lazy(() => import('../components/content/CompositionEditor.jsx').then((m) => ({ default: m.CompositionEditor })));

export function StudioPage() {
  const { data } = useAsync(devices.list);
  const screens = (data && data.devices) || [];

  const [editing, setEditing] = useState(null);     // item composicao sendo criado
  const [pending, setPending] = useState(null);     // item pronto, aguardando destino
  const [target, setTarget] = useState('');         // id da tela escolhida
  const [nome, setNome] = useState('');             // nome ao salvar na biblioteca
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  function novaComposicao() {
    setMsg('');
    setEditing(CONTENT_TYPES.composicao.make());
  }

  // Editor salvou → escolhe o destino (biblioteca e/ou tela).
  function onEditorSave(item) {
    setEditing(null);
    setPending(item);
    setNome('');
    setTarget(screens[0] ? screens[0].id : '');
  }

  async function salvarBiblioteca() {
    if (!pending) return;
    setBusy(true); setMsg('');
    try {
      await library.save(nome.trim() || 'Estúdio', [{ formato: pending.formato || '16/9', label: nome.trim() || 'Peça', item: pending }]);
      setMsg('Peça salva na biblioteca (Campanhas).');
      setPending(null);
    } catch (err) { setMsg(err.message || 'Falha ao salvar.'); }
    setBusy(false);
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

      <Dialog open={!!pending} onClose={() => setPending(null)} title="O que fazer com a peça?"
        description="Salve na biblioteca para reaproveitar, e/ou publique agora numa tela."
        footer={
          <>
            <Button variant="ghost" onClick={() => setPending(null)}>Fechar</Button>
            <Button variant="secondary" icon={Save} disabled={busy} onClick={salvarBiblioteca}>{busy ? 'Salvando…' : 'Salvar na biblioteca'}</Button>
            <Button variant="primary" icon={Check} disabled={busy || !target} onClick={enviarParaTela}>{busy ? 'Enviando…' : 'Publicar na tela'}</Button>
          </>
        }>
        <Field label="Nome da peça (biblioteca)">
          <Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Promo de inverno" />
        </Field>
        {screens.length ? (
          <Field label="Tela">
            <Select value={target} onChange={(e) => setTarget(e.target.value)}>
              {screens.map((s) => <option key={s.id} value={s.id}>{s.name || s.code || s.id}</option>)}
            </Select>
          </Field>
        ) : (
          <p className="text-sm text-ink-3">Nenhuma tela pareada para publicar — mas você já pode salvar na biblioteca.</p>
        )}
      </Dialog>
    </div>
  );
}
