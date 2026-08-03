import React, { useState, Suspense, lazy } from 'react';
import { Wand2, Save, Pencil, Send, Trash2, Sparkles, Check, Download } from 'lucide-react';
import { downloadComposition } from '../lib/exportPng.js';
import { PageHeader } from '../components/layout/PageHeader.jsx';
import { Panel, PanelHeader } from '../components/ui/Panel.jsx';
import { Button } from '../components/ui/Button.jsx';
import { Field, Input, Textarea, Select } from '../components/ui/Field.jsx';
import { Dialog } from '../components/ui/Dialog.jsx';
import { Spinner, EmptyState } from '../components/ui/Feedback.jsx';
import { useAsync } from '../lib/useAsync.js';
import { ai, library, devices, deviceConfig, media } from '../api.js';
import { primaryZoneKey, defaultConfig } from '../lib/contentTypes.js';

const CompositionEditor = lazy(() => import('../components/content/CompositionEditor.jsx').then((m) => ({ default: m.CompositionEditor })));

// Miniatura fiel: desenha a composição na proporção da peça.
function Thumb({ item }) {
  const b = item.bg || {};
  const bg = b.kind === 'imagem' && b.src ? { backgroundImage: `url("${b.src}")`, backgroundSize: 'cover', backgroundPosition: 'center' }
    : b.kind === 'cor' ? { background: b.cor } : { background: '#0a1020' };
  const els = (item.elementos || []).slice().sort((a, c) => (a.z || 0) - (c.z || 0));
  return (
    <div className="relative w-full overflow-hidden rounded-md border border-line" style={{ aspectRatio: (item.formato || '16/9').replace('/', ' / '), ...bg }}>
      {els.map((e, i) => (
        <div key={i} style={{ position: 'absolute', left: e.x + '%', top: e.y + '%', width: e.w + '%', height: e.h + '%', transform: `rotate(${e.rot || 0}deg)`, overflow: 'hidden' }}>
          {e.tipo === 'texto'
            ? <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: e.cor, fontWeight: e.peso, fontSize: 'clamp(6px,' + (e.tamanho || 6) + 'cqw,40px)', textAlign: e.align, lineHeight: 1.05 }}>{e.text}</div>
            : <img src={e.src} alt="" style={{ width: '100%', height: '100%', objectFit: e.fit || 'contain' }} />}
        </div>
      ))}
    </div>
  );
}

export function CampaignsPage() {
  const { data, loading, reload } = useAsync(library.list);
  const { data: devData } = useAsync(devices.list);
  const screens = (devData && devData.devices) || [];

  const [brief, setBrief] = useState('');
  const [empresa, setEmpresa] = useState('');
  const [brand, setBrand] = useState('#1e3a8a');
  const [refs, setRefs] = useState([]);        // URLs de exemplos (referências)
  const [gen, setGen] = useState(null);        // { pieces, headline, ... } recém-gerado
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  const [editing, setEditing] = useState(null); // { id?, item } em edição
  const [publish, setPublish] = useState(null); // item a publicar
  const [target, setTarget] = useState('');

  const saved = (data && data.items) || [];

  async function onRefs(e) {
    const files = Array.from(e.target.files || []); e.target.value = '';
    if (!files.length) return;
    setBusy(true); setMsg('');
    const add = [];
    for (const f of files.slice(0, 3)) { try { const up = await media.upload(f); add.push(up.url); } catch (err) { setMsg(err.message || 'Falha no upload'); } }
    setRefs((r) => [...r, ...add].slice(0, 3));
    setBusy(false);
  }
  async function gerar() {
    if (!brief.trim()) return;
    setBusy(true); setMsg('');
    try { setGen(await ai.kit({ brief, empresa, brand, refs })); }
    catch (e) { setMsg(e.message || 'Falha ao gerar'); }
    setBusy(false);
  }
  async function salvarBiblioteca() {
    if (!gen) return;
    setBusy(true);
    try {
      await library.save(gen.headline || empresa || 'Campanha', gen.pieces);
      setGen(null); setMsg('Biblioteca salva.'); reload();
    } catch (e) { setMsg(e.message || 'Falha ao salvar'); }
    setBusy(false);
  }

  async function onEditorSave(item) {
    if (editing.id) { await library.update(editing.id, item, ''); reload(); }
    else if (gen) { setGen({ ...gen, pieces: gen.pieces.map((p) => (p === editing.src ? { ...p, item } : p)) }); }
    setEditing(null);
  }

  async function publicar() {
    if (!publish || !target) return;
    const dev = screens.find((s) => s.id === target);
    setBusy(true); setMsg('');
    try {
      let cfg = null; try { cfg = await deviceConfig.get(target); } catch (e) {}
      if (!cfg) cfg = defaultConfig(dev ? dev.name : 'Tela');
      const zk = primaryZoneKey(cfg);
      if (!cfg.zonas) cfg.zonas = {};
      if (!cfg.zonas[zk] || !Array.isArray(cfg.zonas[zk].items)) cfg.zonas[zk] = { items: [] };
      cfg.zonas[zk].items.push(publish);
      await deviceConfig.save(target, cfg);
      setMsg(`Peça publicada em “${dev ? dev.name : 'a tela'}”.`); setPublish(null);
    } catch (e) { setMsg(e.message || 'Falha ao publicar'); }
    setBusy(false);
  }

  // Agrupa a biblioteca salva por campanha.
  const groups = {};
  for (const it of saved) { (groups[it.campaign] = groups[it.campaign] || []).push(it); }

  return (
    <div>
      <PageHeader title="Campanhas" subtitle="Descreva a campanha e a IA gera a biblioteca inteira. Salve, edite e reaproveite." />

      <Panel className="mb-4">
        <PanelHeader title="Pedido à IA" description="Gera TV (16:9/9:16/1:1), post de feed, story e banner — coesos." />
        <div className="grid gap-3 p-4 md:grid-cols-3">
          <div className="md:col-span-3">
            <Field label="Briefing da campanha">
              <Textarea rows={2} value={brief} onChange={(e) => setBrief(e.target.value)} placeholder="Ex.: lançamento da coleção de inverno, tom sofisticado, público 25-45, foco em elegância." />
            </Field>
          </div>
          <Field label="Empresa"><Input value={empresa} onChange={(e) => setEmpresa(e.target.value)} placeholder="Sua empresa" /></Field>
          <Field label="Cor da marca (opcional)"><input type="color" value={brand} onChange={(e) => setBrand(e.target.value)} className="h-9 w-full cursor-pointer rounded border border-line bg-transparent" /></Field>
          <div className="flex items-end">
            <Button variant="primary" icon={Wand2} disabled={busy || !brief.trim()} onClick={gerar}>{busy && !gen ? 'Gerando…' : 'Gerar biblioteca'}</Button>
          </div>
          <div className="md:col-span-3">
            <div className="mb-1 text-2xs font-medium text-ink-2">Exemplos do cliente (opcional) — a IA imita o estilo</div>
            <div className="flex flex-wrap items-center gap-2">
              <label className="cursor-pointer rounded-md border border-line bg-surface px-3 py-1.5 text-sm text-ink-2 transition hover:bg-surface-2">
                Enviar imagens
                <input type="file" accept="image/png,image/jpeg,image/webp" multiple className="hidden" onChange={onRefs} />
              </label>
              {refs.map((u, i) => (
                <div key={i} className="relative">
                  <img src={u} alt="" className="h-10 w-10 rounded border border-line object-cover" />
                  <button type="button" onClick={() => setRefs((r) => r.filter((_, j) => j !== i))}
                    className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-ink text-[10px] leading-none text-white">×</button>
                </div>
              ))}
              <span className="text-2xs text-ink-3">até 3 · usa Gemini visão</span>
            </div>
          </div>
        </div>
        {msg && <div className="mx-4 mb-4 rounded-md border border-line bg-surface-2 px-3 py-2 text-sm text-ink-2">{msg}</div>}
      </Panel>

      {gen && (
        <Panel className="mb-4">
          <PanelHeader title={`Prévia — ${gen.headline || 'Campanha'}`} description="Ajuste no editor se quiser e salve na biblioteca."
            action={<Button size="sm" variant="primary" icon={Save} disabled={busy} onClick={salvarBiblioteca}>Salvar biblioteca</Button>} />
          <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-3 lg:grid-cols-4">
            {gen.pieces.map((p, i) => (
              <div key={i} className="space-y-1.5">
                <Thumb item={p.item} />
                <div className="flex items-center justify-between">
                  <span className="truncate text-2xs text-ink-3">{p.label}</span>
                  <div className="flex gap-2">
                    <button className="text-2xs text-accent hover:underline" onClick={() => setEditing({ item: p.item, src: p })}>Editar</button>
                    <button className="text-2xs text-ink-3 hover:text-ink" onClick={() => downloadComposition(p.item, p.formato, p.label)}>PNG</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Panel>
      )}

      <Panel>
        <PanelHeader title="Biblioteca" description={saved.length ? `${saved.length} peça(s)` : undefined} />
        {loading ? (
          <div className="p-6"><Spinner size={20} /></div>
        ) : saved.length === 0 ? (
          <EmptyState icon={Sparkles} title="Sua biblioteca está vazia" description="Gere uma campanha acima para começar." />
        ) : (
          <div className="space-y-6 p-4">
            {Object.keys(groups).map((camp) => (
              <div key={camp}>
                <div className="mb-2 text-sm font-semibold text-ink">{camp}</div>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                  {groups[camp].map((it) => (
                    <div key={it.id} className="group space-y-1.5">
                      <Thumb item={it.item} />
                      <div className="flex items-center justify-between text-2xs text-ink-3">
                        <span className="truncate">{it.label}</span>
                        <div className="flex gap-1.5">
                          <button title="Editar" className="hover:text-ink" onClick={() => setEditing({ id: it.id, item: it.item })}><Pencil size={13} /></button>
                          <button title="Baixar PNG" className="hover:text-ink" onClick={() => downloadComposition(it.item, it.formato, it.label)}><Download size={13} /></button>
                          <button title="Publicar" className="hover:text-accent" onClick={() => { setPublish(it.item); setTarget(screens[0] ? screens[0].id : ''); }}><Send size={13} /></button>
                          <button title="Excluir" className="hover:text-danger" onClick={async () => { if (window.confirm('Excluir esta peça?')) { await library.remove(it.id); reload(); } }}><Trash2 size={13} /></button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </Panel>

      {editing && (
        <Suspense fallback={<div className="fixed inset-0 z-50 flex items-center justify-center bg-canvas/90"><Spinner size={22} /></div>}>
          <CompositionEditor value={editing.item} onClose={() => setEditing(null)} onSave={onEditorSave} />
        </Suspense>
      )}

      <Dialog open={!!publish} onClose={() => setPublish(null)} title="Publicar em qual tela?"
        description="A peça vai para a zona principal da tela e publica ao vivo."
        footer={<><Button variant="ghost" onClick={() => setPublish(null)}>Cancelar</Button>
          <Button variant="primary" icon={Check} disabled={busy || !target} onClick={publicar}>{busy ? 'Enviando…' : 'Publicar'}</Button></>}>
        {screens.length ? (
          <Field label="Tela"><Select value={target} onChange={(e) => setTarget(e.target.value)}>{screens.map((s) => <option key={s.id} value={s.id}>{s.name || s.code || s.id}</option>)}</Select></Field>
        ) : <p className="text-sm text-ink-3">Nenhuma tela pareada. Pareie uma TV em <b>Telas</b>.</p>}
      </Dialog>
    </div>
  );
}
