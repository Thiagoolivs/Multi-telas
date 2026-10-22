import React from 'react';
import { RotateCcw, Palette, Maximize, Music, Clock, SlidersHorizontal, Check } from 'lucide-react';
import { Field, Input, Select, Checkbox } from '../ui/Field.jsx';
import { Button, IconButton } from '../ui/Button.jsx';
import { LAYOUTS, THEME_PRESETS, FONTS, TRANSITIONS, DECORATIONS, getLayout } from '../../lib/screenConfig.js';
import { gradeDaMiniatura, proporcaoDoLayout } from '../../lib/tela.js';
import { useAsync } from '../../lib/useAsync.js';
import { brand, devices } from '../../api.js';
import { SoundPanel } from './SoundPanel.jsx';
import { CamposDoHorario, HORARIO_PADRAO } from '../tela/HorarioDaTela.jsx';
import { aviso } from '../../lib/avisos.js';
import { cn } from '../../lib/cn.js';
import { FUNDOS_TV, corDoFundo } from '../../lib/fundoDaTV.js';

/*
 * AJUSTES DA TELA, POR TAREFA (EXECUTOR §2c, item 33).
 *
 * Era uma janela com tudo misturado: nome, layout, margem, tema e marca à
 * esquerda, música no meio, e "Mais ajustes" escondendo o resto. O dono da
 * loja abre os Ajustes com UMA pergunta na cabeça — "quero mudar a cara",
 * "a borda está cortada", "quero música", "a TV fica ligada de noite" — e a
 * resposta tem de estar numa aba com esse nome:
 *
 *   Aparência  o layout (com o desenho), as cores (a marca é o padrão) e o
 *              nome que aparece no cabeçalho;
 *   Encaixe    a margem contra o corte da TV (com o desenho) e girar;
 *   Som        a música de fundo;
 *   Horário    quando a loja abre, o que a TV mostra fora disso, o alerta;
 *   Avançado   fonte, cores finas, transição, decoração e comportamento.
 */
const ABAS = [
  ['aparencia', 'Aparência', Palette], ['encaixe', 'Encaixe', Maximize], ['som', 'Som', Music],
  ['horario', 'Horário', Clock], ['avancado', 'Avançado', SlidersHorizontal],
];

const LAYOUT_GROUPS = [
  { orient: 'landscape', label: 'TV deitada' },
  { orient: 'portrait', label: 'TV em pé' },
  { orient: 'square', label: 'Tela quadrada' },
  { orient: 'any', label: 'Qualquer formato' },
];

// hex -> rgba string (para o glow ambiente do fundo).
function hexRgba(hex, a) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
  if (!m) return `rgba(59,130,246,${a})`;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

// O desenho de um layout, para escolher olhando (o mesmo da página da TV).
function MiniLayout({ id }) {
  const c = globalThis.MT_getLayout ? globalThis.MT_getLayout(id) : null;
  if (!c) return null;
  return (
    <div className="grid w-full gap-px rounded border-2 border-ink/70 bg-ink/70" style={{ aspectRatio: proporcaoDoLayout(c), ...gradeDaMiniatura(c, { minimo: false }) }}>
      {c.zones.map((z) => <span key={z.id} style={{ gridArea: z.area || undefined }} className="min-h-0 min-w-0 rounded-[2px] bg-surface" />)}
    </div>
  );
}

// O que some ao trocar de layout: zona com conteúdo que o layout novo não tem.
export function zonasQueSaem(zonasAtuais, idNovo) {
  const novo = getLayout(idNovo);
  const ids = new Set(novo.zones.map((z) => z.id));
  return Object.entries(zonasAtuais || {})
    .filter(([id, z]) => !ids.has(id) && z && ((Array.isArray(z.items) && z.items.length) || z.peca || (Array.isArray(z.pecas) && z.pecas.length)))
    .map(([id]) => id);
}

// Edita cfg.settings por tarefa. `device` traz o horário (expediente), que tem rota própria.
export function SettingsForm({ settings, onChange, deviceId, device, zonas }) {
  const s = settings || {};
  const theme = s.theme || { preset: 'dark-premium', font: 'system', overrides: {} };
  const set = (patch) => onChange({ ...s, ...patch });
  const setTheme = (patch) => onChange({ ...s, theme: { ...theme, ...patch } });
  const ov = theme.overrides || {};
  const setOv = (patch) => setTheme({ overrides: { ...ov, ...patch } });
  const setBrand = (hex) => {
    if (!hex) { const n = { ...ov }; delete n.brand; delete n.glow; setTheme({ overrides: n }); return; }
    const m = /^#?([0-9a-f]{6})$/i.exec(hex); const g = m ? hexRgba(hex, 0.4) : undefined;
    setOv({ brand: hex, ...(g ? { glow: g } : {}) });
  };

  /*
   * As cores da marca são copiadas PARA DENTRO da config da tela: a TV
   * funciona offline, e uma tela que muda de cor sozinha porque alguém mexeu
   * na Marca surpreende. Escolher "as cores da minha marca" congela a
   * identidade daquele momento.
   */
  const { data: brandData } = useAsync(brand.get);
  const coresMarca = ((brandData && brandData.kit && brandData.kit.cores) || []).filter(Boolean);
  const temCores = coresMarca.length > 0;
  // Trocar o fundo apaga o fundo pintado à mão no Avançado: senão a escolha não teria efeito nenhum.
  function escolherFundo(fundo) {
    const n = { ...ov };
    delete n.bg; delete n.bg2;
    setTheme({ fundo, overrides: n, ...(fundo === 'cor' && !theme.fundoCor ? { fundoCor: '#f5efe8' } : {}) });
  }

  function escolherTema(preset) {
    const patch = { preset };
    if (preset === 'marca' || theme.aplicarMarca) patch.marca = coresMarca;
    setTheme(patch);
  }

  const [aba, setAba] = React.useState('aparencia');
  const layout = getLayout(s.layoutId);
  const [trocaPendente, setTrocaPendente] = React.useState(null);
  function escolherLayout(id) {
    if (id === (s.layoutId || 'dashboard')) return;
    const saem = zonasQueSaem(zonas, id);
    if (saem.length) { setTrocaPendente({ id, saem }); return; }
    set({ layoutId: id });
  }

  const [exp, setExp] = React.useState(() => ({ ...HORARIO_PADRAO, ...((device && device.expediente) || {}) }));
  const [salvandoHorario, setSalvandoHorario] = React.useState(false);
  async function salvarHorario() {
    setSalvandoHorario(true);
    try { await devices.expediente(deviceId, exp); aviso.ok('Horário salvo.'); }
    catch (e) { aviso.erro('horario', e.message || 'Não deu para salvar o horário.'); }
    finally { setSalvandoHorario(false); }
  }

  const mexidos = [
    (theme.font || 'system') !== 'system', !!ov.brand, !!ov.accent,
    (s.transicao || 'cinematic') !== 'cinematic', (s.decoracao || 'none') !== 'none',
    (s.refreshSeconds ?? 60) !== 60, s.coresAdaptativas === false, s.layoutInteligente === false,
    s.somUrgente === false, s.layoutAuto === true,
  ].filter(Boolean).length;
  const usaMarca = theme.preset === 'marca';
  const margem = Number(s.margemSegura || 0);

  return (
    <div className="space-y-4">
      <div className="flex gap-1 overflow-x-auto rounded-lg border border-line bg-surface-2 p-1" role="tablist" aria-label="Ajustes da tela">
        {ABAS.map(([id, nome, Icone]) => (
          <button key={id} type="button" role="tab" aria-selected={aba === id} onClick={() => setAba(id)}
            className={cn('inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium transition',
              aba === id ? 'bg-surface text-ink shadow-xs' : 'text-ink-3 hover:text-ink-2')}>
            <Icone size={15} /> {nome}
            {id === 'avancado' && mexidos > 0 && <span className="rounded-full bg-accent-soft px-1.5 text-2xs font-semibold text-accent">{mexidos}</span>}
          </button>
        ))}
      </div>

      {aba === 'aparencia' && (
        <div className="space-y-5">
          <div>
            <div className="mb-2 text-sm font-semibold text-ink">Layout</div>
            <p className="mb-2 text-xs text-ink-3">Como a TV se divide: {layout.description}</p>
            {trocaPendente && (
              <div className="mb-3 rounded-md border border-warn/40 bg-warn-soft px-3 py-2 text-xs text-ink">
                O layout <b>{getLayout(trocaPendente.id).name}</b> não tem {trocaPendente.saem.join(', ')}. O que está lá fica guardado e volta se você voltar a este layout.
                <div className="mt-2 flex gap-2">
                  <Button size="sm" variant="primary" onClick={() => { set({ layoutId: trocaPendente.id }); setTrocaPendente(null); }}>Trocar assim mesmo</Button>
                  <Button size="sm" variant="ghost" onClick={() => setTrocaPendente(null)}>Manter o de agora</Button>
                </div>
              </div>
            )}
            <div className="space-y-3">
              {LAYOUT_GROUPS.map((g) => {
                const items = LAYOUTS.filter((l) => (l.orientation || 'landscape') === g.orient);
                if (!items.length) return null;
                return (
                  <div key={g.orient}>
                    <div className="mb-1.5 text-2xs font-semibold uppercase tracking-wide text-ink-3">{g.label}</div>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                      {items.map((l) => {
                        const sel = (s.layoutId || 'dashboard') === l.id;
                        return (
                          <button key={l.id} type="button" onClick={() => escolherLayout(l.id)} aria-pressed={sel}
                            className={cn('flex flex-col gap-1.5 rounded-lg border p-2 text-left transition',
                              sel ? 'border-accent bg-accent-soft/40' : 'border-line hover:border-accent/50')}>
                            <div className={cn('mx-auto w-full', l.orientation === 'portrait' ? 'max-w-[3.5rem]' : l.orientation === 'square' ? 'max-w-[5rem]' : '')}><MiniLayout id={l.id} /></div>
                            <span className="flex items-center gap-1 text-2xs font-medium leading-tight text-ink">
                              {sel && <Check size={11} className="shrink-0 text-accent" />}{l.name}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div>
            <div className="mb-2 text-sm font-semibold text-ink">Cores</div>
            {temCores ? (
              <div className="grid gap-2 sm:grid-cols-2">
                <button type="button" onClick={() => escolherTema('marca')} aria-pressed={usaMarca}
                  className={cn('rounded-lg border p-3 text-left', usaMarca ? 'border-accent bg-accent-soft/40' : 'border-line hover:border-accent/50')}>
                  <div className="flex items-center gap-2 text-sm font-semibold text-ink">
                    As cores da minha marca
                    <span className="flex gap-1">{coresMarca.slice(0, 4).map((c) => <span key={c} className="h-3.5 w-3.5 rounded-full border border-line" style={{ background: c }} />)}</span>
                  </div>
                  <p className="mt-1 text-2xs text-ink-3">A tela inteira sai da cor da empresa, com o contraste calculado.</p>
                  {usaMarca && <div className="mt-2"><Checkbox label="Versão clara" checked={theme.marcaClara === true} onChange={(e) => setTheme({ marcaClara: e.target.checked })} /></div>}
                </button>
                <div className={cn('rounded-lg border p-3', !usaMarca ? 'border-accent bg-accent-soft/40' : 'border-line')}>
                  <div className="text-sm font-semibold text-ink">Um tema pronto</div>
                  <Select className="mt-2" value={usaMarca ? '' : theme.preset} onChange={(e) => e.target.value && escolherTema(e.target.value)}>
                    {usaMarca && <option value="">Escolher…</option>}
                    {THEME_PRESETS.filter((t) => t.value !== 'marca').map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </Select>
                  {!usaMarca && (
                    <div className="mt-2">
                      <Checkbox label="Com as cores da minha marca nos destaques" checked={theme.aplicarMarca === true}
                        onChange={(e) => setTheme({ aplicarMarca: e.target.checked, marca: e.target.checked ? coresMarca : theme.marca })} />
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <>
                <Select value={theme.preset} onChange={(e) => escolherTema(e.target.value)}>
                  {THEME_PRESETS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                </Select>
                <p className="mt-1 text-2xs text-ink-3">Cadastre as cores da empresa em <b className="text-ink-2">Marca</b> e a tela passa a poder usá-las.</p>
              </>
            )}
          </div>

          {/* O fundo da TV (item 41): o que fica atrás das peças, e o cabeçalho e o rodapé automáticos. */}
          <div>
            <div className="mb-1 text-sm font-semibold text-ink">Fundo da TV</div>
            <p className="mb-2 text-xs text-ink-3">O que fica atrás das peças. O cabeçalho e o rodapé automáticos acompanham.</p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {FUNDOS_TV.map(([id, nome, desc]) => {
                const sel = (theme.fundo || 'pecas') === id;
                const c = corDoFundo(theme, zonas, id);
                return (
                  <button key={id} type="button" aria-pressed={sel} onClick={() => escolherFundo(id)}
                    className={cn('flex flex-col gap-1.5 rounded-lg border p-2 text-left transition', sel ? 'border-accent bg-accent-soft/40' : 'border-line hover:border-accent/50')}>
                    <span className="flex h-10 items-center justify-center rounded-md border border-line text-2xs font-semibold"
                      style={c ? { background: 'linear-gradient(135deg, ' + c.bg + ', ' + c.bg2 + ')', color: c.text } : undefined}>Aa</span>
                    <span className="flex items-center gap-1 text-2xs font-medium leading-tight text-ink">{sel && <Check size={11} className="shrink-0 text-accent" />}{nome}</span>
                    <span className="text-2xs leading-tight text-ink-3">{id === 'pecas' && c && !c.temPecas ? 'Sem peça na TV ainda: fica o tema.' : desc}</span>
                  </button>
                );
              })}
            </div>
            {(theme.fundo || 'pecas') === 'cor' && (
              <div className="mt-2 max-w-xs"><Swatch value={theme.fundoCor} fallback="#f5efe8" onChange={(v) => setTheme({ fundoCor: v })} onClear={() => setTheme({ fundoCor: '' })} /></div>
            )}
          </div>

          <Field label="Nome no cabeçalho" hint="É o que o cabeçalho automático mostra. O nome da TV na lista de Telas muda pelo lápis, lá.">
            <Input value={s.nome || ''} onChange={(e) => set({ nome: e.target.value })} placeholder="Minha Empresa" />
          </Field>
        </div>
      )}

      {aba === 'encaixe' && (
        <div className="space-y-5">
          {/*
            Overscan (PLANO §7.1): muita TV corta as bordas da imagem. A margem
            empurra tudo para dentro; a TV aplica na hora (js/player.js,
            aplicarMargem). O desenho mostra o que a margem faz.
          */}
          <div>
            <div className="mb-1 text-sm font-semibold text-ink">Margem contra o corte: {String(margem).replace('.', ',')}%</div>
            <p className="mb-3 text-xs text-ink-3">Muita TV corta um pouco das bordas. Se o rodapé ou o relógio aparecem cortados na parede, aumente até aparecerem inteiros.</p>
            <div className="mx-auto mb-3 aspect-video w-full max-w-xs rounded-md border-4 border-ink/80 bg-ink/80 p-0">
              <div className="h-full w-full rounded-sm bg-accent/25" style={{ padding: (margem * 1.6) + '%' }}>
                <div className="flex h-full w-full items-center justify-center rounded-sm border border-dashed border-accent bg-surface text-2xs text-ink-3">o que aparece na TV</div>
              </div>
            </div>
            <input type="range" min="0" max="5" step="0.5" value={s.margemSegura || 0}
              onChange={(e) => set({ margemSegura: Number(e.target.value) })}
              aria-label="Margem contra o corte da TV" className="w-full accent-[rgb(var(--c-accent))]" />
          </div>
          {/* TV em pé: TV Box e Fire Stick não giram a imagem, então quem gira é o player. */}
          <Field label="A TV está em pé?"
            hint="TV Box não gira a imagem sozinho. Se o conteúdo aparecer de lado, escolha um giro; se ficar de cabeça para baixo, o outro.">
            <Select value={String(s.girar || 0)} onChange={(e) => set({ girar: Number(e.target.value) })}>
              <option value="0">Não girar (o aparelho já mostra certo)</option>
              <option value="90">Girar a imagem ↻ (sentido horário)</option>
              <option value="270">Girar a imagem ↺ (sentido anti-horário)</option>
            </Select>
          </Field>
        </div>
      )}

      {aba === 'som' && (
        <div className="rounded-lg border border-line bg-surface-2/50 p-3">
          <SoundPanel audio={s.audio} deviceId={deviceId} onChange={(audio) => set({ audio })} />
        </div>
      )}

      {aba === 'horario' && (
        <div className="space-y-3">
          <p className="text-xs text-ink-3">O horário da loja vale para duas coisas: o que a TV mostra fora dele e o aviso de queda por e-mail.</p>
          <CamposDoHorario exp={exp} setExp={setExp} />
          <Button variant="primary" onClick={salvarHorario} disabled={salvandoHorario || !exp.dias.length}>{salvandoHorario ? 'Salvando…' : 'Salvar horário'}</Button>
        </div>
      )}

      {aba === 'avancado' && (
        <div className="grid gap-5 md:grid-cols-2">
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
