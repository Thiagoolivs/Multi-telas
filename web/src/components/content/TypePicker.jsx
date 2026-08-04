import React, { useState, useEffect, useMemo } from 'react';
import { Search, Palette, Plus } from 'lucide-react';
import { Dialog } from '../ui/Dialog.jsx';
import { CONTENT_TYPES, CONTENT_ORDER } from '../../lib/contentTypes.js';
import { DesignThumb } from './DesignThumb.jsx';
import { library } from '../../api.js';
import { cn } from '../../lib/cn.js';

// Descrição curta por tipo — deixa a escolha óbvia para quem chega agora.
const DESC = {
  text: 'Título e texto simples.',
  announce: 'Aviso com etiqueta e destaque.',
  poster: 'Arte pronta com a cor da marca.',
  quote: 'Frase com autor.',
  promo: 'Produto, preço e chamada.',
  kpi: 'Número grande com variação.',
  composicao: 'Editor livre: formas, texto e imagens.',
  social: 'Perfil e QR das redes.',
  image: 'Foto ou arte da sua mídia.',
  video: 'Vídeo MP4 em loop.',
  pptx: 'Slides PPTX ou PDF.',
  screen: 'Espelha uma janela do computador.',
  livesource: 'Entrada HDMI / USB ao vivo.',
  youtube: 'Vídeo ou live do YouTube.',
  web: 'Página da web em tempo real.',
  qrcode: 'QR code com legenda.',
  weatherpro: 'Painel do clima da cidade.',
  birthdayauto: 'Aniversariantes automáticos.',
};

/*
 * Adicionar conteúdo: começa pela BIBLIOTECA (reaproveitar o que já existe,
 * com busca) e tem a aba de criar do zero. onPick(type) cria novo;
 * onPickItem(item) insere um design salvo.
 */
export function TypePicker({ open, onClose, onPick, onPickItem }) {
  const [tab, setTab] = useState('lib');
  const [q, setQ] = useState('');
  const [saved, setSaved] = useState(null); // null = carregando

  useEffect(() => {
    if (!open) return;
    setQ('');
    library.list().then((r) => setSaved((r && r.items) || [])).catch(() => setSaved([]));
  }, [open]);

  const results = useMemo(() => {
    const all = saved || [];
    if (!q.trim()) return all;
    const t = q.toLowerCase();
    return all.filter((i) => ((i.label || '') + ' ' + (i.campaign || '')).toLowerCase().includes(t));
  }, [saved, q]);

  const groups = {};
  CONTENT_ORDER.forEach((t) => {
    const g = CONTENT_TYPES[t].group;
    (groups[g] = groups[g] || []).push(t);
  });

  const TABS = [['lib', 'Minha biblioteca', Palette], ['new', 'Criar novo', Plus]];

  return (
    <Dialog open={open} onClose={onClose} title="Adicionar conteúdo"
      description="Reaproveite um design salvo ou crie do zero." className="max-w-5xl">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="inline-flex gap-1 rounded-lg border border-line bg-surface-2 p-1">
          {TABS.map(([id, label, Icon]) => (
            <button key={id} onClick={() => setTab(id)}
              className={cn('inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition',
                tab === id ? 'bg-surface text-ink shadow-xs' : 'text-ink-3 hover:text-ink-2')}>
              <Icon size={15} /> {label}
            </button>
          ))}
        </div>
        {tab === 'lib' && (
          <div className="relative sm:w-64">
            <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-3" />
            <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar na biblioteca…"
              className="w-full rounded-md border border-line bg-surface py-1.5 pl-8 pr-2 text-sm text-ink placeholder:text-ink-3" />
          </div>
        )}
      </div>

      {tab === 'lib' ? (
        saved === null ? (
          <div className="py-10 text-center text-sm text-ink-3">Carregando…</div>
        ) : results.length === 0 ? (
          <div className="py-10 text-center">
            <p className="text-sm text-ink-2">{saved.length ? 'Nenhum design encontrado.' : 'Sua biblioteca está vazia.'}</p>
            <p className="mt-1 text-xs text-ink-3">{saved.length ? 'Tente outro termo.' : 'Crie designs em Meus Designs — eles aparecem aqui.'}</p>
            <button onClick={() => setTab('new')} className="mt-3 text-xs font-medium text-accent hover:underline">Criar do zero</button>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {results.map((it) => (
              <button key={it.id} type="button" onClick={() => { onPickItem(it.item); onClose(); }}
                className="space-y-1.5 rounded-xl border border-line bg-surface p-2 text-left transition hover:border-accent/60 hover:bg-surface-2">
                <div className="flex h-24 items-center justify-center overflow-hidden rounded-md bg-surface-2">
                  <DesignThumb item={it.item} fitHeight />
                </div>
                <span className="block truncate text-2xs font-medium text-ink-2">{it.label}</span>
                <span className="block truncate text-2xs text-ink-3">{it.campaign}</span>
              </button>
            ))}
          </div>
        )
      ) : (
        <div className="space-y-5">
          {Object.entries(groups).map(([group, types]) => (
            <div key={group}>
              <div className="mb-2 text-2xs font-semibold uppercase tracking-wide text-ink-3">{group}</div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                {types.map((t) => {
                  const { label, icon: Icon } = CONTENT_TYPES[t];
                  return (
                    <button key={t} type="button" onClick={() => { onPick(t); onClose(); }}
                      className="flex flex-col items-start gap-2 rounded-xl border border-line bg-surface p-4 text-left transition hover:border-accent/50 hover:bg-surface-2">
                      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-surface-2"><Icon size={18} className="text-accent" strokeWidth={2} /></div>
                      <span className="text-sm font-semibold leading-snug text-ink">{label}</span>
                      {DESC[t] && <span className="text-2xs leading-snug text-ink-3">{DESC[t]}</span>}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </Dialog>
  );
}
