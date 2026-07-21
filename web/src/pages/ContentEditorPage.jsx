import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft, Plus, ChevronUp, ChevronDown, Copy, Trash2, UploadCloud, Clock, GripVertical, LayoutGrid, Settings2, Info,
} from 'lucide-react';
import { Panel, PanelHeader } from '../components/ui/Panel.jsx';
import { Button, IconButton } from '../components/ui/Button.jsx';
import { Spinner, ErrorState, EmptyState } from '../components/ui/Feedback.jsx';
import { ItemForm } from '../components/content/ItemForm.jsx';
import { ItemPreview } from '../components/content/ItemPreview.jsx';
import { TypePicker } from '../components/content/TypePicker.jsx';
import { SettingsForm } from '../components/content/SettingsForm.jsx';
import { TickerEditor } from '../components/content/TickerEditor.jsx';
import { useAsync } from '../lib/useAsync.js';
import { deviceConfig } from '../api.js';
import { CONTENT_TYPES, typeLabel, itemSummary, defaultConfig } from '../lib/contentTypes.js';
import { zonesOf, ensureZone } from '../lib/screenConfig.js';
import { cn } from '../lib/cn.js';

export function ContentEditorPage({ device, onBack }) {
  const { data, loading, error, reload } = useAsync(() => deviceConfig.get(device.id), [device.id]);

  const [cfg, setCfg] = useState(null);
  const [tab, setTab] = useState('content'); // content | settings
  const [zoneId, setZoneId] = useState(null);
  const [selected, setSelected] = useState(0);
  const [dirty, setDirty] = useState(false);
  const [picker, setPicker] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [publishedAt, setPublishedAt] = useState(null);
  const [publishError, setPublishError] = useState('');

  // Semeia o config de trabalho quando chega (null = sem config ainda).
  useEffect(() => {
    if (loading) return;
    const seeded = data || defaultConfig(device.name);
    setCfg(seeded);
    setDirty(false);
    const zones = zonesOf(seeded);
    const first = zones.find((z) => z.type === 'playlist') || zones[0];
    setZoneId(first ? first.id : null);
  }, [data, loading, device.name]);

  const zones = useMemo(() => (cfg ? zonesOf(cfg) : []), [cfg]);
  const activeZone = zones.find((z) => z.id === zoneId) || zones[0];

  // Se o layout mudou e a zona ativa sumiu, volta para a primeira.
  useEffect(() => {
    if (!cfg || !zones.length) return;
    if (!zones.find((z) => z.id === zoneId)) {
      const first = zones.find((z) => z.type === 'playlist') || zones[0];
      setZoneId(first.id);
      setSelected(0);
    }
  }, [zones]); // eslint-disable-line react-hooks/exhaustive-deps

  function patchCfg(fn) {
    setCfg((prev) => { const next = structuredClone(prev); fn(next); return next; });
    setDirty(true);
  }

  const items = (activeZone && cfg && cfg.zonas[activeZone.id] && cfg.zonas[activeZone.id].items) || [];

  function selectZone(zone) {
    patchCfg((next) => ensureZone(next, zone));
    setZoneId(zone.id);
    setSelected(0);
  }

  function mutateItems(fn) {
    patchCfg((next) => {
      if (!next.zonas[activeZone.id]) next.zonas[activeZone.id] = { items: [] };
      const arr = [...(next.zonas[activeZone.id].items || [])];
      next.zonas[activeZone.id].items = fn(arr);
    });
  }
  const addItem = (type) => { mutateItems((arr) => { arr.push(CONTENT_TYPES[type].make()); return arr; }); setSelected(items.length); };
  const updateItem = (idx, item) => mutateItems((arr) => { arr[idx] = item; return arr; });
  const moveItem = (idx, dir) => {
    const j = idx + dir; if (j < 0 || j >= items.length) return;
    mutateItems((arr) => { const [x] = arr.splice(idx, 1); arr.splice(j, 0, x); return arr; });
    setSelected(j);
  };
  const dupItem = (idx) => { mutateItems((arr) => { arr.splice(idx + 1, 0, structuredClone(arr[idx])); return arr; }); setSelected(idx + 1); };
  const removeItem = (idx) => { mutateItems((arr) => { arr.splice(idx, 1); return arr; }); setSelected((s) => Math.max(0, Math.min(s, items.length - 2))); };

  async function publish() {
    setPublishing(true); setPublishError('');
    try { await deviceConfig.save(device.id, cfg); setDirty(false); setPublishedAt(Date.now()); }
    catch (e) { setPublishError(e.message || 'Falha ao publicar.'); }
    finally { setPublishing(false); }
  }

  const current = items[selected];

  return (
    <div>
      {/* Cabeçalho: voltar + publicar */}
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <IconButton icon={ArrowLeft} label="Voltar" onClick={onBack} />
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-ink">{(cfg && cfg.settings && cfg.settings.nome) || device.name || 'Tela'}</h1>
            <p className="text-sm text-ink-3">Conteúdo e ajustes da tela · publica ao vivo</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-ink-3">{dirty ? 'Alterações não publicadas' : publishedAt ? 'Publicado agora' : 'Tudo publicado'}</span>
          <Button variant="primary" icon={UploadCloud} onClick={publish} disabled={!dirty || publishing}>{publishing ? 'Publicando…' : 'Publicar'}</Button>
        </div>
      </div>

      {/* Abas */}
      <div className="mb-4 inline-flex gap-1 rounded-lg border border-line bg-surface-2 p-1">
        {[['content', 'Conteúdo', LayoutGrid], ['settings', 'Ajustes da tela', Settings2]].map(([id, label, Icon]) => (
          <button key={id} onClick={() => setTab(id)}
            className={cn('inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition',
              tab === id ? 'bg-surface text-ink shadow-xs' : 'text-ink-3 hover:text-ink-2')}>
            <Icon size={15} /> {label}
          </button>
        ))}
      </div>

      {publishError && <div className="mb-4 rounded-md border border-danger-soft bg-danger-soft px-3 py-2 text-sm text-danger">{publishError}</div>}

      {loading || !cfg ? (
        <div className="flex justify-center py-20"><Spinner size={22} /></div>
      ) : error ? (
        <Panel><ErrorState description="Não foi possível carregar o conteúdo da tela." onRetry={reload} /></Panel>
      ) : tab === 'settings' ? (
        <Panel>
          <PanelHeader title="Ajustes da tela" description="Layout, tema e comportamento." />
          <div className="p-4"><SettingsForm settings={cfg.settings} onChange={(settings) => patchCfg((next) => { next.settings = settings; })} /></div>
        </Panel>
      ) : (
        <>
          {/* Chips de zona */}
          {zones.length > 1 && (
            <div className="mb-4 flex flex-wrap gap-1.5">
              {zones.map((z) => (
                <button key={z.id} onClick={() => selectZone(z)}
                  className={cn('rounded-full border px-3 py-1 text-xs font-medium transition',
                    z.id === (activeZone && activeZone.id) ? 'border-accent bg-accent-soft text-accent' : 'border-line text-ink-2 hover:bg-surface-2')}>
                  {z.name}
                  <span className="ml-1.5 text-ink-3">{z.type === 'ticker' ? 'notícias' : z.type === 'header' ? 'cabeçalho' : ''}</span>
                </button>
              ))}
            </div>
          )}

          {activeZone && activeZone.type === 'ticker' ? (
            <Panel>
              <PanelHeader title={activeZone.name} description="Faixa de notícias e avisos rolando." />
              <TickerEditor zone={cfg.zonas[activeZone.id]} onChange={(z) => patchCfg((next) => { next.zonas[activeZone.id] = z; })} />
            </Panel>
          ) : activeZone && activeZone.type === 'header' ? (
            <Panel>
              <EmptyState icon={Info} title="Cabeçalho automático"
                description="O cabeçalho mostra logo, relógio e clima automaticamente. Ajuste nome e tema na aba Ajustes." />
            </Panel>
          ) : (
            <div className="grid gap-4 lg:grid-cols-[minmax(0,360px)_1fr]">
              {/* Sequência */}
              <Panel className="flex flex-col">
                <PanelHeader title="Sequência" description={items.length ? `${items.length} ${items.length === 1 ? 'conteúdo' : 'conteúdos'}` : undefined}
                  actions={<Button size="sm" variant="primary" icon={Plus} onClick={() => setPicker(true)}>Adicionar</Button>} />
                {items.length === 0 ? (
                  <EmptyState icon={Plus} title="Sem conteúdo" description="Adicione o primeiro conteúdo para esta zona."
                    action={<Button size="sm" variant="primary" icon={Plus} onClick={() => setPicker(true)}>Adicionar conteúdo</Button>} />
                ) : (
                  <ul className="divide-y divide-line">
                    {items.map((it, idx) => (
                      <li key={idx}>
                        <button onClick={() => setSelected(idx)}
                          className={cn('flex w-full items-center gap-3 px-3 py-2.5 text-left transition', idx === selected ? 'bg-accent-soft/60' : 'hover:bg-surface-2')}>
                          <GripVertical size={14} className="shrink-0 text-ink-3" />
                          <span className="w-10 shrink-0"><ItemPreview item={it} className="!rounded" /></span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium text-ink">{itemSummary(it)}</span>
                            <span className="block text-2xs text-ink-3">{typeLabel(it.type)} · {it.duracao === 0 ? 'fixo' : (it.duracao || 0) + 's'}</span>
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </Panel>

              {/* Editor do item */}
              <Panel className="flex flex-col">
                {!current ? (
                  <EmptyState title="Nada selecionado" description="Selecione um conteúdo na sequência para editar." />
                ) : (
                  <>
                    <PanelHeader title={typeLabel(current.type)}
                      actions={
                        <div className="flex items-center gap-0.5">
                          <IconButton icon={ChevronUp} label="Subir" size={15} onClick={() => moveItem(selected, -1)} />
                          <IconButton icon={ChevronDown} label="Descer" size={15} onClick={() => moveItem(selected, 1)} />
                          <IconButton icon={Copy} label="Duplicar" size={15} onClick={() => dupItem(selected)} />
                          <IconButton icon={Trash2} label="Remover" size={15} className="hover:text-danger" onClick={() => removeItem(selected)} />
                        </div>
                      } />
                    <div className="grid gap-5 p-4 md:grid-cols-2">
                      <div>
                        <div className="mb-2 text-2xs font-semibold uppercase tracking-wide text-ink-3">Prévia</div>
                        <ItemPreview item={current} />
                        <p className="mt-2 flex items-center gap-1.5 text-2xs text-ink-3"><Clock size={12} /> {current.duracao === 0 ? 'Fica fixo na tela' : `${current.duracao || 0}s em tela`}</p>
                      </div>
                      <div>
                        <div className="mb-2 text-2xs font-semibold uppercase tracking-wide text-ink-3">Conteúdo</div>
                        <ItemForm item={current} onChange={(it) => updateItem(selected, it)} />
                      </div>
                    </div>
                  </>
                )}
              </Panel>
            </div>
          )}
        </>
      )}

      <TypePicker open={picker} onClose={() => setPicker(false)} onPick={addItem} />
    </div>
  );
}
