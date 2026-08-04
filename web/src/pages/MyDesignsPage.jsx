import React, { useState, Suspense, lazy, useMemo } from 'react';
import { Plus, Wand2, ImagePlus, Upload, Pencil, Download, Send, Trash2, Sparkles, Check, MonitorPlay, Search, FolderOpen } from 'lucide-react';
import { PageHeader } from '../components/layout/PageHeader.jsx';
import { Panel, PanelHeader } from '../components/ui/Panel.jsx';
import { Button } from '../components/ui/Button.jsx';
import { Field, Input, Textarea, Select } from '../components/ui/Field.jsx';
import { Dialog } from '../components/ui/Dialog.jsx';
import { Spinner, EmptyState } from '../components/ui/Feedback.jsx';
import { useAsync } from '../lib/useAsync.js';
import { ai, library, devices, deviceConfig, media } from '../api.js';
import { primaryZoneKey, defaultConfig, CONTENT_TYPES } from '../lib/contentTypes.js';
import { downloadComposition } from '../lib/exportPng.js';
import { DesignThumb } from '../components/content/DesignThumb.jsx';

const CompositionEditor = lazy(() => import('../components/content/CompositionEditor.jsx').then((m) => ({ default: m.CompositionEditor })));

// Um lugar só para criar, guardar e reaproveitar tudo. As formas de criar
// (mão, IA, imagem, importar) levam ao mesmo acervo, agrupado por coleção.
export function MyDesignsPage() {
  const { data, loading, reload } = useAsync(library.list);
  const { data: devData } = useAsync(devices.list);
  const screens = (devData && devData.devices) || [];
  const saved = (data && data.items) || [];

  const collections = useMemo(() => Array.from(new Set(saved.map((i) => i.campaign))).filter(Boolean), [saved]);

  const [q, setQ] = useState('');
  const [editing, setEditing] = useState(null);   // { id?, item } no editor
  const [saveItem, setSaveItem] = useState(null);  // { item } aguardando nome/coleção
  const [coll, setColl] = useState('');
  const [label, setLabel] = useState('');
  const [publishItem, setPublishItem] = useState(null);
  const [target, setTarget] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  // Criar com IA (kit)
  const [aiOpen, setAiOpen] = useState(false);
  const [brief, setBrief] = useState('');
  const [empresa, setEmpresa] = useState('');
  const [publico, setPublico] = useState('');
  const [tom, setTom] = useState('');
  const [oferta, setOferta] = useState('');
  const [brand, setBrand] = useState('#1e3a8a');
  const [brand2, setBrand2] = useState('#0ea5e9');
  const [gen, setGen] = useState(null);
  const [aiColl, setAiColl] = useState('');

  // Gerar imagem
  const [imgOpen, setImgOpen] = useState(false);
  const [iPrompt, setIPrompt] = useState('');
  const [iFormato, setIFormato] = useState('16/9');
  const [iEstilo, setIEstilo] = useState('fotográfico');

  function novoNaMao() { setEditing({ item: CONTENT_TYPES.composicao.make() }); }

  // Editor salvou: peça existente atualiza; nova vai para o diálogo de salvar.
  function onEditorSave(item) {
    if (editing && editing.id) {
      setBusy(true);
      library.update(editing.id, item, editing.label || '').then(() => { reload(); setMsg('Design atualizado.'); }).finally(() => setBusy(false));
      setEditing(null);
    } else {
      setEditing(null);
      setSaveItem({ item }); setColl(collections[0] || 'Meus Designs'); setLabel('');
    }
  }

  async function salvarDesign() {
    if (!saveItem) return;
    setBusy(true); setMsg('');
    try {
      const it = saveItem.item;
      await library.save(coll.trim() || 'Meus Designs', [{ formato: it.formato || '16/9', label: label.trim() || 'Design', item: it }]);
      setSaveItem(null); setMsg('Salvo em “' + (coll.trim() || 'Meus Designs') + '”.'); reload();
    } catch (e) { setMsg(e.message || 'Falha ao salvar'); }
    setBusy(false);
  }

  async function publicar() {
    if (!publishItem || !target) return;
    const dev = screens.find((s) => s.id === target);
    setBusy(true); setMsg('');
    try {
      let cfg = null; try { cfg = await deviceConfig.get(target); } catch (e) {}
      if (!cfg) cfg = defaultConfig(dev ? dev.name : 'Tela');
      const zk = primaryZoneKey(cfg);
      if (!cfg.zonas) cfg.zonas = {};
      if (!cfg.zonas[zk] || !Array.isArray(cfg.zonas[zk].items)) cfg.zonas[zk] = { items: [] };
      cfg.zonas[zk].items.push(publishItem);
      await deviceConfig.save(target, cfg);
      setMsg('Publicado em “' + (dev ? dev.name : 'a tela') + '”.'); setPublishItem(null);
    } catch (e) { setMsg(e.message || 'Falha ao publicar'); }
    setBusy(false);
  }

  async function gerarKit() {
    if (!brief.trim()) return;
    setBusy(true); setMsg('');
    try { const out = await ai.kit({ brief, empresa, brand, brand2, publico, tom, oferta }); setGen(out); setAiColl(out.headline || empresa || 'Campanha'); }
    catch (e) { setMsg(e.message || 'Falha ao gerar'); }
    setBusy(false);
  }
  async function salvarKit() {
    if (!gen) return;
    setBusy(true);
    try { await library.save(aiColl.trim() || 'Campanha', gen.pieces); setGen(null); setAiOpen(false); setBrief(''); setMsg('Coleção salva.'); reload(); }
    catch (e) { setMsg(e.message || 'Falha ao salvar'); }
    setBusy(false);
  }

  async function gerarImagem() {
    if (!iPrompt.trim()) return;
    setBusy(true); setMsg('');
    try {
      const out = await ai.image({ prompt: iPrompt, formato: iFormato, estilo: iEstilo, brand, brand2 });
      const item = { type: 'composicao', formato: out.formato || iFormato, duracao: 12, bg: { kind: 'imagem', src: out.url }, elementos: [] };
      setImgOpen(false); setIPrompt('');
      setSaveItem({ item }); setColl(collections[0] || 'Imagens IA'); setLabel('Imagem IA');
    } catch (e) { setMsg(e.message || 'Falha ao gerar'); }
    setBusy(false);
  }

  async function onImport(e) {
    const f = (e.target.files || [])[0]; e.target.value = '';
    if (!f) return;
    setBusy(true); setMsg('');
    try {
      const up = await media.upload(f);
      const isPdf = /pdf$/i.test(f.type) || /\.pdf$/i.test(f.name);
      const item = isPdf
        ? { type: 'pptx', src: up.url, duracao: 20 }
        : { type: 'composicao', formato: '16/9', duracao: 12, bg: { kind: 'imagem', src: up.url }, elementos: [] };
      setSaveItem({ item }); setColl(collections[0] || 'Importados'); setLabel(f.name.replace(/\.[^.]+$/, '').slice(0, 40) || 'Importado');
    } catch (err) { setMsg(err.message || 'Falha ao importar'); }
    setBusy(false);
  }

  // Agrupa por coleção e aplica busca.
  const groups = {};
  for (const it of saved) {
    if (q && !((it.label || '') + ' ' + (it.campaign || '')).toLowerCase().includes(q.toLowerCase())) continue;
    (groups[it.campaign] = groups[it.campaign] || []).push(it);
  }
  const groupNames = Object.keys(groups);

  const CREATE = [
    { key: 'mao', title: 'Criar na mão', desc: 'Editor visual: fundo, texto, formas, ícones e imagens.', icon: Plus, on: novoNaMao, accent: 'text-accent' },
    { key: 'ia', title: 'Criar com IA', desc: 'Descreva a campanha e a IA monta a coleção inteira.', icon: Wand2, on: () => setAiOpen(true), accent: 'text-violet-400' },
    { key: 'img', title: 'Gerar imagem IA', desc: 'Crie uma imagem por prompt e use como arte/fundo.', icon: ImagePlus, on: () => setImgOpen(true), accent: 'text-sky-400' },
    { key: 'imp', title: 'Importar arquivo', desc: 'Suba um design do Canva (PNG/JPG) ou um PDF.', icon: Upload, on: null, accent: 'text-emerald-400' },
  ];

  return (
    <div>
      <PageHeader title="Meus Designs" subtitle="Crie na mão, com IA, gere imagens ou importe — tudo fica aqui, pronto para reaproveitar e publicar." />

      {/* Formas de criar — espaçoso no desktop */}
      <div className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {CREATE.map((c) => {
          const Icon = c.icon;
          const inner = (
            <>
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-surface-2"><Icon size={22} className={c.accent} /></div>
              <div className="mt-3 text-sm font-semibold text-ink">{c.title}</div>
              <div className="mt-1 text-xs leading-snug text-ink-3">{c.desc}</div>
            </>
          );
          return c.on ? (
            <button key={c.key} onClick={c.on} className="rounded-xl border border-line bg-surface p-5 text-left transition hover:border-accent/50 hover:bg-surface-2">{inner}</button>
          ) : (
            <label key={c.key} className="cursor-pointer rounded-xl border border-line bg-surface p-5 text-left transition hover:border-accent/50 hover:bg-surface-2">
              {inner}
              <input type="file" accept="image/png,image/jpeg,image/webp,application/pdf" className="hidden" onChange={onImport} />
            </label>
          );
        })}
      </div>

      {msg && <div className="mb-4 rounded-md border border-line bg-surface-2 px-3 py-2 text-sm text-ink-2">{msg}</div>}

      {/* Acervo */}
      <Panel>
        <PanelHeader title="Seus designs" description={saved.length ? `${saved.length} peça(s) em ${collections.length} coleção(ões)` : undefined}
          action={saved.length ? (
            <div className="relative">
              <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-3" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar…" className="w-44 rounded-md border border-line bg-surface py-1.5 pl-8 pr-2 text-sm text-ink placeholder:text-ink-3" />
            </div>
          ) : undefined} />
        {loading ? (
          <div className="p-6"><Spinner size={20} /></div>
        ) : saved.length === 0 ? (
          <EmptyState icon={Sparkles} title="Nada por aqui ainda"
            description="Use um dos cartões acima para criar seu primeiro design. Ele fica guardado aqui para reusar quando quiser." />
        ) : groupNames.length === 0 ? (
          <EmptyState icon={Search} title="Nenhum resultado" description="Tente outro termo de busca." />
        ) : (
          <div className="space-y-6 p-4">
            {groupNames.map((camp) => (
              <div key={camp}>
                <div className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-ink"><FolderOpen size={15} className="text-ink-3" /> {camp}</div>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                  {groups[camp].map((it) => (
                    <div key={it.id} className="space-y-2 rounded-lg border border-line bg-surface p-2">
                      <DesignThumb item={it.item} />
                      <div className="truncate px-0.5 text-2xs font-medium text-ink-2">{it.label}</div>
                      {/* Ações sempre visíveis: publicar em destaque + editar/PNG/excluir */}
                      <div className="flex items-center gap-1">
                        <button onClick={() => { setPublishItem(it.item); setTarget(screens[0] ? screens[0].id : ''); }}
                          className="flex flex-1 items-center justify-center gap-1 rounded-md bg-accent px-2 py-1.5 text-2xs font-semibold text-white transition hover:opacity-90">
                          <Send size={12} /> Publicar
                        </button>
                        <button title="Editar" className="rounded-md border border-line p-1.5 text-ink-2 hover:bg-surface-2 hover:text-ink" onClick={() => setEditing({ id: it.id, item: it.item, label: it.label })}><Pencil size={13} /></button>
                        <button title="Baixar PNG" className="rounded-md border border-line p-1.5 text-ink-2 hover:bg-surface-2 hover:text-ink" onClick={() => downloadComposition(it.item, it.formato, it.label)}><Download size={13} /></button>
                        <button title="Excluir" className="rounded-md border border-line p-1.5 text-ink-2 hover:bg-surface-2 hover:text-danger" onClick={async () => { if (window.confirm('Excluir este design?')) { await library.remove(it.id); reload(); } }}><Trash2 size={13} /></button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </Panel>

      {/* Editor de composição */}
      {editing && (
        <Suspense fallback={<div className="fixed inset-0 z-50 flex items-center justify-center bg-canvas/90"><Spinner size={22} /></div>}>
          <CompositionEditor value={editing.item} onClose={() => setEditing(null)} onSave={onEditorSave} />
        </Suspense>
      )}

      {/* Salvar design (nome + coleção) */}
      <Dialog open={!!saveItem} onClose={() => setSaveItem(null)} title="Salvar design" description="Escolha um nome e a coleção onde ele fica."
        footer={<><Button variant="ghost" onClick={() => setSaveItem(null)}>Cancelar</Button>
          <Button variant="primary" icon={Check} disabled={busy} onClick={salvarDesign}>{busy ? 'Salvando…' : 'Salvar'}</Button></>}>
        {saveItem && <div className="mb-3"><DesignThumb item={saveItem.item} /></div>}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Nome"><Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Ex.: Promo de inverno" /></Field>
          <Field label="Coleção">
            <Input list="colls" value={coll} onChange={(e) => setColl(e.target.value)} placeholder="Ex.: Inverno 2026" />
            <datalist id="colls">{collections.map((c) => <option key={c} value={c} />)}</datalist>
          </Field>
        </div>
      </Dialog>

      {/* Publicar — espaçoso, com prévia e telas como cards */}
      <Dialog open={!!publishItem} onClose={() => setPublishItem(null)} title="Publicar na tela" description="Escolha em qual tela este design entra ao vivo." className="max-w-2xl"
        footer={<><Button variant="ghost" onClick={() => setPublishItem(null)}>Cancelar</Button>
          <Button variant="primary" icon={Check} disabled={busy || !target} onClick={publicar}>{busy ? 'Publicando…' : 'Publicar agora'}</Button></>}>
        <div className="grid gap-4 sm:grid-cols-[1fr_1.2fr]">
          <div>{publishItem && <DesignThumb item={publishItem} />}</div>
          <div>
            {screens.length ? (
              <div className="space-y-2">
                <div className="text-2xs font-semibold uppercase tracking-wide text-ink-3">Telas</div>
                <div className="max-h-64 space-y-1.5 overflow-y-auto pr-1">
                  {screens.map((s) => (
                    <button key={s.id} onClick={() => setTarget(s.id)}
                      className={'flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm transition ' + (target === s.id ? 'border-accent bg-accent-soft text-ink' : 'border-line hover:bg-surface-2 text-ink-2')}>
                      <MonitorPlay size={16} className={target === s.id ? 'text-accent' : 'text-ink-3'} />
                      <span className="flex-1 truncate">{s.name || s.code || s.id}</span>
                      {target === s.id && <Check size={15} className="text-accent" />}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="rounded-lg border border-dashed border-line p-4 text-sm text-ink-3">Nenhuma tela pareada. Pareie uma TV em <b>Telas</b> e volte aqui — o design continua salvo.</div>
            )}
          </div>
        </div>
      </Dialog>

      {/* Criar com IA (kit) */}
      <Dialog open={aiOpen} onClose={() => { setAiOpen(false); setGen(null); }} title="Criar com IA" description="Descreva a campanha; a IA gera uma coleção coesa (TV, feed, story, banner)." className="max-w-3xl"
        footer={gen
          ? <><Button variant="ghost" onClick={() => setGen(null)}>Voltar</Button><Button variant="primary" icon={Check} disabled={busy} onClick={salvarKit}>{busy ? 'Salvando…' : 'Salvar coleção'}</Button></>
          : <><Button variant="ghost" onClick={() => setAiOpen(false)}>Cancelar</Button><Button variant="primary" icon={Wand2} disabled={busy || !brief.trim()} onClick={gerarKit}>{busy ? 'Gerando…' : 'Gerar'}</Button></>}>
        {!gen ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2"><Field label="Briefing"><Textarea rows={2} value={brief} onChange={(e) => setBrief(e.target.value)} placeholder="Ex.: lançamento da coleção de inverno, elegante, público 25-45." /></Field></div>
            <Field label="Empresa"><Input value={empresa} onChange={(e) => setEmpresa(e.target.value)} placeholder="Sua empresa" /></Field>
            <Field label="Público-alvo"><Input value={publico} onChange={(e) => setPublico(e.target.value)} placeholder="Ex.: 25-45, classe A/B" /></Field>
            <Field label="Tom">
              <Select value={tom} onChange={(e) => setTom(e.target.value)}>
                <option value="">Automático</option><option value="sofisticado">Sofisticado</option><option value="energético">Energético</option>
                <option value="corporativo">Corporativo</option><option value="divertido">Divertido</option><option value="minimalista">Minimalista</option>
              </Select>
            </Field>
            <Field label="Oferta / CTA"><Input value={oferta} onChange={(e) => setOferta(e.target.value)} placeholder="Ex.: 30% off até domingo" /></Field>
            <Field label="Cor primária"><input type="color" value={brand} onChange={(e) => setBrand(e.target.value)} className="h-9 w-full cursor-pointer rounded border border-line bg-transparent" /></Field>
            <Field label="Cor secundária"><input type="color" value={brand2} onChange={(e) => setBrand2(e.target.value)} className="h-9 w-full cursor-pointer rounded border border-line bg-transparent" /></Field>
          </div>
        ) : (
          <div>
            <Field label="Nome da coleção"><Input value={aiColl} onChange={(e) => setAiColl(e.target.value)} /></Field>
            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
              {gen.pieces.map((p, i) => (
                <div key={i} className="space-y-1"><DesignThumb item={p.item} /><span className="block truncate text-2xs text-ink-3">{p.label}</span></div>
              ))}
            </div>
          </div>
        )}
      </Dialog>

      {/* Gerar imagem */}
      <Dialog open={imgOpen} onClose={() => setImgOpen(false)} title="Gerar imagem com IA" description="A imagem gerada vira um design (você nomeia e salva)."
        footer={<><Button variant="ghost" onClick={() => setImgOpen(false)}>Cancelar</Button><Button variant="primary" icon={ImagePlus} disabled={busy || !iPrompt.trim()} onClick={gerarImagem}>{busy ? 'Gerando…' : 'Gerar'}</Button></>}>
        <div className="grid gap-3">
          <Field label="Descrição"><Textarea rows={3} value={iPrompt} onChange={(e) => setIPrompt(e.target.value)} placeholder="Ex.: xícara de café fumegante, luz quente, fundo desfocado." /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Formato">
              <Select value={iFormato} onChange={(e) => setIFormato(e.target.value)}>
                <option value="16/9">TV paisagem (16:9)</option><option value="9/16">TV retrato (9:16)</option><option value="1/1">Quadrado (1:1)</option><option value="21/9">Banner (21:9)</option>
              </Select>
            </Field>
            <Field label="Estilo">
              <Select value={iEstilo} onChange={(e) => setIEstilo(e.target.value)}>
                {['fotográfico', 'ilustração', '3D', 'flat/vetorial', 'minimalista', 'vibrante'].map((s) => <option key={s} value={s}>{s}</option>)}
              </Select>
            </Field>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
