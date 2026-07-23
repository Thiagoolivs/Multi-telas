import React from 'react';
import { RotateCcw } from 'lucide-react';
import { Field, Input, Select, Checkbox } from '../ui/Field.jsx';
import { IconButton } from '../ui/Button.jsx';
import { LAYOUTS, THEME_PRESETS, FONTS, TRANSITIONS, DECORATIONS, getLayout } from '../../lib/screenConfig.js';

// hex -> rgba string (para o glow ambiente do fundo).
function hexRgba(hex, a) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
  if (!m) return `rgba(59,130,246,${a})`;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

// Edita cfg.settings: identidade, layout, tema e comportamento da tela.
export function SettingsForm({ settings, onChange }) {
  const s = settings || {};
  const theme = s.theme || { preset: 'dark-premium', font: 'system', overrides: {} };
  const set = (patch) => onChange({ ...s, ...patch });
  const setTheme = (patch) => onChange({ ...s, theme: { ...theme, ...patch } });
  const ov = theme.overrides || {};
  const setOv = (patch) => setTheme({ overrides: { ...ov, ...patch } });
  // Cor da marca: além de --brand, deriva o brilho ambiente (glow) para o fundo
  // acompanhar a marca. Limpar volta ao tom do preset.
  const setBrand = (hex) => {
    if (!hex) { const n = { ...ov }; delete n.brand; delete n.glow; setTheme({ overrides: n }); return; }
    const m = /^#?([0-9a-f]{6})$/i.exec(hex); const g = m ? hexRgba(hex, 0.4) : undefined;
    setOv({ brand: hex, ...(g ? { glow: g } : {}) });
  };

  const layout = getLayout(s.layoutId);

  return (
    <div className="grid gap-5 md:grid-cols-2">
      <div className="space-y-4">
        <div className="text-2xs font-semibold uppercase tracking-wide text-ink-3">Identidade & layout</div>
        <Field label="Nome da tela / empresa">
          <Input value={s.nome || ''} onChange={(e) => set({ nome: e.target.value })} placeholder="Minha Empresa" />
        </Field>
        <Field label="Layout" hint={layout.description}>
          <Select value={s.layoutId || 'dashboard'} onChange={(e) => set({ layoutId: e.target.value })}>
            {LAYOUTS.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </Select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Tema">
            <Select value={theme.preset} onChange={(e) => setTheme({ preset: e.target.value })}>
              {THEME_PRESETS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </Select>
          </Field>
          <Field label="Fonte">
            <Select value={theme.font || 'system'} onChange={(e) => setTheme({ font: e.target.value })}>
              {FONTS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
            </Select>
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Cor da marca" hint="Sobrepõe o tema; comanda o destaque e o fundo.">
            <Swatch value={ov.brand} fallback="#3b82f6" onChange={setBrand} onClear={() => setBrand('')} />
          </Field>
          <Field label="Destaque">
            <Swatch value={ov.accent} fallback="#60a5fa" onChange={(v) => setOv({ accent: v })} onClear={() => { const n = { ...ov }; delete n.accent; setTheme({ overrides: n }); }} />
          </Field>
        </div>
      </div>

      <div className="space-y-4">
        <div className="text-2xs font-semibold uppercase tracking-wide text-ink-3">Comportamento</div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Transição">
            <Select value={s.transicao || 'cinematic'} onChange={(e) => set({ transicao: e.target.value })}>
              {TRANSITIONS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </Select>
          </Field>
          <Field label="Decoração">
            <Select value={s.decoracao || 'none'} onChange={(e) => set({ decoracao: e.target.value })}>
              {DECORATIONS.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
            </Select>
          </Field>
        </div>
        <Field label="Recarregar config a cada (s)" hint="Frequência com que a TV busca atualizações.">
          <Input type="number" min={10} value={s.refreshSeconds ?? 60} onChange={(e) => set({ refreshSeconds: Number(e.target.value) })} />
        </Field>

        <div className="space-y-2.5 rounded-lg border border-line bg-surface-2/50 p-3">
          <Checkbox label="Cores adaptativas (tema acompanha a imagem)" checked={s.coresAdaptativas !== false} onChange={(e) => set({ coresAdaptativas: e.target.checked })} />
          <Checkbox label="Layout inteligente (conteúdo urgente toma a tela)" checked={s.layoutInteligente !== false} onChange={(e) => set({ layoutInteligente: e.target.checked })} />
          <Checkbox label="Som nos avisos urgentes" checked={s.somUrgente !== false} onChange={(e) => set({ somUrgente: e.target.checked })} />
          <Checkbox label="Alternar disposição das telas sozinho" checked={s.layoutAuto === true} onChange={(e) => set({ layoutAuto: e.target.checked })} />
          {s.layoutAuto === true && (
            <Field label="Intervalo da alternância (s)">
              <Input type="number" min={8} value={s.layoutAutoSeconds ?? 20} onChange={(e) => set({ layoutAutoSeconds: Number(e.target.value) })} />
            </Field>
          )}
        </div>
      </div>
    </div>
  );
}

// Seletor de cor: amostra + hex editável + limpar (volta ao tom do tema).
function Swatch({ value, fallback, onChange, onClear }) {
  return (
    <div className="flex items-center gap-2">
      <input
        type="color" value={value || fallback} onChange={(e) => onChange(e.target.value)}
        className="h-8 w-9 shrink-0 cursor-pointer rounded-md border border-line bg-surface p-0.5"
        aria-label="Escolher cor"
      />
      <Input value={value || ''} placeholder="tema" onChange={(e) => onChange(e.target.value)} className="font-mono" />
      {value && <IconButton icon={RotateCcw} label="Voltar ao tema" size={14} onClick={onClear} />}
    </div>
  );
}
