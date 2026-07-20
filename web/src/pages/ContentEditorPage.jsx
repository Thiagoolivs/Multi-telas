import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Plus, ChevronUp, ChevronDown, Copy, Trash2, UploadCloud, Clock, GripVertical } from 'lucide-react';
import { Panel, PanelHeader } from '../components/ui/Panel.jsx';
import { Button, IconButton } from '../components/ui/Button.jsx';
import { Spinner, ErrorState, EmptyState } from '../components/ui/Feedback.jsx';
import { ItemForm } from '../components/content/ItemForm.jsx';
import { ItemPreview } from '../components/content/ItemPreview.jsx';
import { TypePicker } from '../components/content/TypePicker.jsx';
import { useAsync } from '../lib/useAsync.js';
import { deviceConfig } from '../api.js';
import { CONTENT_TYPES, typeLabel, itemSummary, defaultConfig, primaryZoneKey } from '../lib/contentTypes.js';
import { cn } from '../lib/cn.js';

export function ContentEditorPage({ device, onBack }) {
  const { data, loading, error, reload } = useAsync(() => deviceConfig.get(device.id), [device.id]);

  const [cfg, setCfg] = useState(null);
  const [selected, setSelected] = useState(0);
  const [dirty, setDirty] = useState(false);
  const [picker, setPicker] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [publishedAt, setPublishedAt] = useState(null);
  const [publishError, setPublishError] = useState('');

  // Semeia o config de trabalho quando os dados chegam (null = sem config).
  useEffect(() => {
    if (loading) return;
    setCfg(data || defaultConfig(device.name));
    setDirty(false);
  }, [data, loading, device.name]);

  const zoneKey = useMemo(() => (cfg ? primaryZoneKey(cfg) : 'principal'), [cfg]);
  const items = (cfg && cfg.zonas && cfg.zonas[zoneKey] && cfg.zonas[zoneKey].items) || [];

  function mutateItems(fn) {
    setCfg((prev) => {
      const next = structuredClone(prev);
      if (!next.zonas[zoneKey]) next.zonas[zoneKey] = { items: [] };
      next.zonas[zoneKey].items = fn([...(next.zonas[zoneKey].items || [])]);
      return next;
    });
    setDirty(true);
  }

  const addItem = (type) => {
    mutateItems((arr) => { arr.push(CONTENT_TYPES[type].make()); return arr; });
    setSelected(items.length); // novo item vira o selecionado
  };
  const updateItem = (idx, item) => mutateItems((arr) => { arr[idx] = item; return arr; });
  const moveItem = (idx, dir) => {
    const j = idx + dir;
    if (j < 0 || j >= items.length) return;
    mutateItems((arr) => { const [x] = arr.splice(idx, 1); arr.splice(j, 0, x); return arr; });
    setSelected(j);
  };
  const dupItem = (idx) => { mutateItems((arr) => { arr.splice(idx + 1, 0, structuredClone(arr[idx])); return arr; }); setSelected(idx + 1); };
  const removeItem = (idx) => {
    mutateItems((arr) => { arr.splice(idx, 1); return arr; });
    setSelected((s) => Math.max(0, Math.min(s, items.length - 2)));
  };

  async function publish() {
    setPublishing(true); setPublishError('');
    try {
      await deviceConfig.save(device.id, cfg);
      setDirty(false); setPublishedAt(Date.now());
    } catch (e) {
      setPublishError(e.message || 'Falha ao publicar.');
    } finally { setPublishing(false); }
  }

  const current = items[selected];

  return (
    <div>
      {/* Cabeçalho com voltar + publicar */}
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <IconButton icon={ArrowLeft} label="Voltar" onClick={onBack} />
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-ink">{device.name || 'Tela'}</h1>
            <p className="text-sm text-ink-3">Conteúdo que a tela exibe · publica na hora (ao vivo)</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-ink-3">
            {dirty ? 'Alterações não publicadas'
              : publishedAt ? 'Publicado agora' : 'Tudo publicado'}
          </span>
          <Button variant="primary" icon={UploadCloud} onClick={publish} disabled={!dirty || publishing}>
            {publishing ? 'Publicando…' : 'Publicar'}
          </Button>
        </div>
      </div>

      {publishError && (
        <div className="mb-4 rounded-md border border-danger-soft bg-danger-soft px-3 py-2 text-sm text-danger">{publishError}</div>
      )}

      {loading || !cfg ? (
        <div className="flex justify-center py-20"><Spinner size={22} /></div>
      ) : error ? (
        <Panel><ErrorState description="Não foi possível carregar o conteúdo da tela." onRetry={reload} /></Panel>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,360px)_1fr]">
          {/* Playlist */}
          <Panel className="flex flex-col">
            <PanelHeader
              title="Sequência"
              description={items.length ? `${items.length} ${items.length === 1 ? 'conteúdo' : 'conteúdos'}` : undefined}
              actions={<Button size="sm" variant="primary" icon={Plus} onClick={() => setPicker(true)}>Adicionar</Button>}
            />
            {items.length === 0 ? (
              <EmptyState icon={Plus} title="Sem conteúdo" description="Adicione o primeiro conteúdo para esta tela."
                action={<Button size="sm" variant="primary" icon={Plus} onClick={() => setPicker(true)}>Adicionar conteúdo</Button>} />
            ) : (
              <ul className="divide-y divide-line">
                {items.map((it, idx) => (
                  <li key={idx}>
                    <button
                      onClick={() => setSelected(idx)}
                      className={cn('flex w-full items-center gap-3 px-3 py-2.5 text-left transition',
                        idx === selected ? 'bg-accent-soft/60' : 'hover:bg-surface-2')}
                    >
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

          {/* Editor do item selecionado */}
          <Panel className="flex flex-col">
            {!current ? (
              <EmptyState title="Nada selecionado" description="Selecione um conteúdo na sequência para editar." />
            ) : (
              <>
                <PanelHeader
                  title={typeLabel(current.type)}
                  actions={
                    <div className="flex items-center gap-0.5">
                      <IconButton icon={ChevronUp} label="Subir" size={15} onClick={() => moveItem(selected, -1)} />
                      <IconButton icon={ChevronDown} label="Descer" size={15} onClick={() => moveItem(selected, 1)} />
                      <IconButton icon={Copy} label="Duplicar" size={15} onClick={() => dupItem(selected)} />
                      <IconButton icon={Trash2} label="Remover" size={15} className="hover:text-danger" onClick={() => removeItem(selected)} />
                    </div>
                  }
                />
                <div className="grid gap-5 p-4 md:grid-cols-2">
                  <div>
                    <div className="mb-2 text-2xs font-semibold uppercase tracking-wide text-ink-3">Prévia</div>
                    <ItemPreview item={current} />
                    <p className="mt-2 flex items-center gap-1.5 text-2xs text-ink-3">
                      <Clock size={12} /> {current.duracao === 0 ? 'Fica fixo na tela' : `${current.duracao || 0}s em tela`}
                    </p>
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

      <TypePicker open={picker} onClose={() => setPicker(false)} onPick={addItem} />
    </div>
  );
}
