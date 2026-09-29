import React from 'react';
import { RotateCcw, ChevronDown, ChevronUp } from 'lucide-react';
import { Field, Input, Select, Checkbox } from '../ui/Field.jsx';
import { IconButton } from '../ui/Button.jsx';
import { LAYOUTS, THEME_PRESETS, FONTS, TRANSITIONS, DECORATIONS, getLayout } from '../../lib/screenConfig.js';
import { useAsync } from '../../lib/useAsync.js';
import { brand } from '../../api.js';
import { SoundPanel } from './SoundPanel.jsx';

// Layouts agrupados por formato de tela no seletor.
const LAYOUT_GROUPS = [
  { orient: 'landscape', label: 'Retangular (deitada)' },
  { orient: 'portrait', label: 'Vertical (em pé)' },
  { orient: 'square', label: 'Quadrada' },
  { orient: 'any', label: 'Qualquer formato' },
];

// hex -> rgba string (para o glow ambiente do fundo).
function hexRgba(hex, a) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
  if (!m) return `rgba(59,130,246,${a})`;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

// Edita cfg.settings: identidade, layout, tema e comportamento da tela.
export function SettingsForm({ settings, onChange, deviceId }) {
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

  /*
   * As cores da marca são copiadas PARA DENTRO da config da tela. Poderiam ser
   * buscadas do servidor no player, mas a TV precisa funcionar offline — e uma
   * tela que muda de cor sozinha porque alguém mexeu na Marca surpreende. Ao
   * escolher o tema, o usuário congela a identidade daquele momento.
   */
  const { data: brandData } = useAsync(brand.get);
  const coresMarca = ((brandData && brandData.kit && brandData.kit.cores) || []).filter(Boolean);
  const temCores = coresMarca.length > 0;

  function escolherTema(preset) {
    const patch = { preset };
    // Guarda as cores no momento da escolha; sem elas o preset "marca" não tem
    // do que derivar e cairia silenciosamente no tema padrão.
    if (preset === 'marca' || theme.aplicarMarca) patch.marca = coresMarca;
    setTheme(patch);
  }

  const layout = getLayout(s.layoutId);

  // Lembra se a pessoa deixou "Mais ajustes" aberto (conveniência, por navegador).
  const [avancado, setAvancado] = React.useState(() => {
    try { return localStorage.getItem('mt.ajustesAvancados') === '1'; } catch (e) { return false; }
  });
  function alternarAvancado(v) {
    setAvancado(v);
    try { localStorage.setItem('mt.ajustesAvancados', v ? '1' : '0'); } catch (e) {}
  }
  const mexidos = [
    (theme.font || 'system') !== 'system', !!ov.brand, !!ov.accent,
    (s.transicao || 'cinematic') !== 'cinematic', (s.decoracao || 'none') !== 'none',
    (s.refreshSeconds ?? 60) !== 60, s.coresAdaptativas === false, s.layoutInteligente === false,
    s.somUrgente === false, s.layoutAuto === true,
  ].filter(Boolean).length;

  return (
    <div className="grid gap-5 md:grid-cols-2">
      <div className="space-y-4">
        <div className="text-2xs font-semibold uppercase tracking-wide text-ink-3">Identidade & layout</div>
        <Field label="Nome da tela / empresa">
          <Input value={s.nome || ''} onChange={(e) => set({ nome: e.target.value })} placeholder="Minha Empresa" />
        </Field>
        <Field label="Layout" hint={layout.description}>
          <Select value={s.layoutId || 'dashboard'} onChange={(e) => set({ layoutId: e.target.value })}>
            {LAYOUT_GROUPS.map((g) => {
              const items = LAYOUTS.filter((l) => (l.orientation || 'landscape') === g.orient);
              return items.length ? (
                <optgroup key={g.orient} label={g.label}>
                  {items.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                </optgroup>
              ) : null;
            })}
          </Select>
        </Field>
        <Field label="Tema">
          <Select value={theme.preset} onChange={(e) => escolherTema(e.target.value)}>
            {THEME_PRESETS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </Select>
        </Field>

        {/* Marca → tela. O painel só GUARDA as cores; quem monta o tema é o
            player, com o mesmo cálculo de contraste em toda a plataforma. */}
        <div className="space-y-2 rounded-lg border border-line bg-surface-2/50 p-3">
          {temCores ? (
            <>
              <div className="flex items-center gap-2">
                <span className="text-2xs font-semibold uppercase tracking-wide text-ink-3">Sua marca</span>
                <div className="flex gap-1">
                  {coresMarca.slice(0, 4).map((c) => (
                    <span key={c} className="h-4 w-4 rounded-full border border-line" style={{ background: c }} title={c} />
                  ))}
                </div>
              </div>
              {theme.preset === 'marca' ? (
                <>
                  <p className="text-2xs leading-snug text-ink-3">O tema inteiro — fundo, superfícies e textos — sai da sua cor principal. O contraste é calculado, então o texto nunca fica ilegível.</p>
                  <Checkbox label="Versão clara" checked={theme.marcaClara === true} onChange={(e) => setTheme({ marcaClara: e.target.checked })} />
                </>
              ) : (
                <>
                  <Checkbox label="Aplicar minha marca a este tema" checked={theme.aplicarMarca === true}
                    onChange={(e) => setTheme({ aplicarMarca: e.target.checked, marca: e.target.checked ? coresMarca : theme.marca })} />
                  <p className="text-2xs leading-snug text-ink-3">Mantém o clima do tema escolhido e troca só as cores de marca e destaque.</p>
                </>
              )}
            </>
          ) : (
            <p className="text-2xs leading-snug text-ink-3">
              Cadastre as cores da empresa em <b className="text-ink-2">Marca</b> e elas passam a valer aqui — a tela deixa de usar cor genérica.
            </p>
          )}
        </div>
      </div>

      <div className="space-y-4">
        <div className="text-2xs font-semibold uppercase tracking-wide text-ink-3">Som</div>
        <div className="rounded-lg border border-line bg-surface-2/50 p-3">
          <SoundPanel audio={s.audio} deviceId={deviceId} onChange={(audio) => set({ audio })} />
        </div>
      </div>

      {/*
        MAIS AJUSTES — escondidos, não removidos.

        Eram 16 controles na mesma tela, e um dono de padaria não sabe o que é
        "layout inteligente" nem "cores adaptativas". Os padrões já estão
        certos; quem quiser mexer abre aqui. Se algum já foi mexido, o botão
        diz quantos — para ninguém esquecer que a tela tem ajuste escondido.
      */}
      <div className="md:col-span-2">
        <button type="button" onClick={() => alternarAvancado(!avancado)}
          className="flex w-full items-center gap-2 rounded-lg border border-line px-3 py-2 text-left text-sm text-ink-2 hover:bg-surface-2">
          {avancado ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
          <span className="font-medium">Mais ajustes</span>
          <span className="text-xs text-ink-3">fonte, cores finas, transição, decoração e comportamento</span>
          {mexidos > 0 && <span className="ml-auto rounded-full bg-accent-soft px-2 py-px text-2xs font-semibold text-accent">{mexidos} {mexidos === 1 ? 'personalizado' : 'personalizados'}</span>}
        </button>
        {avancado && (
          <div className="mt-3 grid gap-5 md:grid-cols-2">
            <div className="space-y-4">
              <Field label="Fonte">
                <Select value={theme.font || 'system'} onChange={(e) => setTheme({ font: e.target.value })}>
                  {FONTS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
                </Select>
              </Field>
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
        )}
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
