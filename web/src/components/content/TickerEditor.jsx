import React from 'react';
import { Plus, X } from 'lucide-react';
import { Field, Input, Select, Checkbox } from '../ui/Field.jsx';
import { Button } from '../ui/Button.jsx';
import { NEWS_FEEDS } from '../../lib/screenConfig.js';

// Edita uma zona do tipo "ticker" (rodapé): notícias automáticas e/ou
// mensagens fixas rolando.
export function TickerEditor({ zone, onChange }) {
  const z = zone || {};
  const set = (patch) => onChange({ ...z, ...patch });
  const fontes = Array.isArray(z.fontes) ? z.fontes : [];
  const messages = Array.isArray(z.messages) ? z.messages : [];

  const toggleFeed = (id) => set({ fontes: fontes.includes(id) ? fontes.filter((f) => f !== id) : [...fontes, id] });
  const setMsg = (i, v) => { const m = [...messages]; m[i] = v; set({ messages: m }); };
  const addMsg = () => set({ messages: [...messages, ''] });
  const removeMsg = (i) => set({ messages: messages.filter((_, j) => j !== i) });

  return (
    <div className="grid gap-5 p-4 md:grid-cols-2">
      <div className="space-y-4">
        <Field label="Título da faixa">
          <Input value={z.titulo || ''} onChange={(e) => set({ titulo: e.target.value })} placeholder="ÚLTIMAS NOTÍCIAS" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Modo">
            <Select value={z.modo || 'noticias'} onChange={(e) => set({ modo: e.target.value })}>
              <option value="noticias">Notícias (automático)</option>
              <option value="rolagem">Só mensagens fixas</option>
            </Select>
          </Field>
          <Field label="Velocidade (s)" hint="Menor = mais rápido.">
            <Input type="number" min={10} value={z.velocidade ?? 60} onChange={(e) => set({ velocidade: Number(e.target.value) })} />
          </Field>
        </div>

        {z.modo !== 'rolagem' && (
          <div>
            <div className="mb-1.5 text-xs font-medium text-ink-2">Fontes de notícia</div>
            <div className="flex flex-wrap gap-1.5">
              {NEWS_FEEDS.map((f) => {
                const on = fontes.includes(f.value);
                return (
                  <button key={f.value} type="button" onClick={() => toggleFeed(f.value)}
                    className={'rounded-full border px-2.5 py-1 text-xs transition ' + (on ? 'border-accent bg-accent-soft text-accent' : 'border-line text-ink-2 hover:bg-surface-2')}>
                    {f.label}
                  </button>
                );
              })}
            </div>
            <Field label="RSS personalizado (URL)" className="mt-3">
              <Input value={z.rssUrl || ''} onChange={(e) => set({ rssUrl: e.target.value })} placeholder="https://exemplo.com/feed.xml" />
            </Field>
          </div>
        )}
      </div>

      <div>
        <div className="mb-1.5 flex items-center justify-between">
          <span className="text-xs font-medium text-ink-2">Mensagens fixas</span>
          <Button size="sm" variant="ghost" icon={Plus} onClick={addMsg}>Adicionar</Button>
        </div>
        <p className="mb-2 text-2xs text-ink-3">Aparecem intercaladas com as notícias (ou sozinhas no modo "só mensagens").</p>
        <div className="space-y-2">
          {messages.length === 0 && <p className="text-xs text-ink-3">Nenhuma mensagem fixa.</p>}
          {messages.map((m, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <Input value={m} onChange={(e) => setMsg(i, e.target.value)} placeholder="Título :: detalhe" />
              <button type="button" onClick={() => removeMsg(i)} className="shrink-0 rounded-md p-1.5 text-ink-3 transition hover:bg-surface-2 hover:text-danger" aria-label="Remover">
                <X size={15} />
              </button>
            </div>
          ))}
        </div>
        {z.modo !== 'rolagem' && (
          <Field label="Máx. de manchetes por fonte" className="mt-3">
            <Input type="number" min={1} value={z.quantidade ?? 10} onChange={(e) => set({ quantidade: Number(e.target.value) })} />
          </Field>
        )}
      </div>
    </div>
  );
}
