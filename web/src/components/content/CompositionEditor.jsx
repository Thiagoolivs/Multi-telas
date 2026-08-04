import React, { useRef, useState, useCallback } from 'react';
import Moveable from 'react-moveable';
import { ImagePlus, Type, Trash2, ChevronUp, ChevronDown, RotateCcw, Save, X, Square, RectangleHorizontal, RectangleVertical, Sparkles, Shapes } from 'lucide-react';
import { Button } from '../ui/Button.jsx';
import { Field, Input, Select } from '../ui/Field.jsx';
import { media, ai } from '../../api.js';
import { fillToCss, bgGradient, shapeClip, SHAPE_POLY } from '../../lib/composition.js';
import { ICONS, ICON_NAMES } from '../../lib/icons.js';
import { Star } from 'lucide-react';

const ASPECTS = [
  { id: '16/9', label: 'Retangular', icon: RectangleHorizontal, ratio: 16 / 9 },
  { id: '1/1', label: 'Quadrada', icon: Square, ratio: 1 },
  { id: '9/16', label: 'Vertical', icon: RectangleVertical, ratio: 9 / 16 },
];
let _uid = 1;
const uid = () => 'e' + (_uid++) + Math.random().toString(36).slice(2, 6);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// Garante id em cada elemento (config salvo não tem id — é só do editor).
function withIds(els) { return (els || []).map((e) => ({ ...e, id: e.id || uid() })); }
function stripIds(els) { return els.map(({ id, ...rest }) => rest); }

export function CompositionEditor({ value, onClose, onSave }) {
  const v = value || {};
  const [bg, setBg] = useState(v.bg && v.bg.kind ? v.bg : { kind: 'cor', cor: '#0a1020' });
  const [els, setEls] = useState(() => withIds(v.elementos));
  const [sel, setSel] = useState(null);
  const [aspect, setAspect] = useState(v.formato || '16/9');
  const [dur, setDur] = useState(v.duracao != null ? v.duracao : 12);
  const [busy, setBusy] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [aiBrief, setAiBrief] = useState('');
  const [aiBusy, setAiBusy] = useState(false);
  const [g1, setG1] = useState('#1e3a8a');
  const [g2, setG2] = useState('#0a1020');
  const [gType, setGType] = useState('linear');
  const applyGrad = (a = g1, b = g2, t = gType) => setBg({ kind: 'cor', cor: bgGradient(t, a, b, 150) });

  const canvasRef = useRef(null);
  const nodes = useRef({});          // id -> DOM node (alvo do Moveable)
  const imgInput = useRef(null);
  const bgInput = useRef(null);
  const moveableRef = useRef(null);

  const rect = () => canvasRef.current.getBoundingClientRect();
  const selEl = els.find((e) => e.id === sel) || null;

  const patch = useCallback((id, p) => setEls((arr) => arr.map((e) => (e.id === id ? { ...e, ...p } : e))), []);
  const patchSel = (p) => sel && patch(sel, p);

  function addImage(url) {
    const e = { id: uid(), tipo: 'imagem', src: url, x: 30, y: 25, w: 40, h: 40, rot: 0, fit: 'contain', z: els.length + 1 };
    setEls((a) => [...a, e]); setSel(e.id);
  }
  function addText() {
    const e = { id: uid(), tipo: 'texto', text: 'Texto', x: 10, y: 40, w: 60, h: 18, rot: 0, cor: '#ffffff', peso: 800, tamanho: 6, align: 'center', z: els.length + 1 };
    setEls((a) => [...a, e]); setSel(e.id);
  }
  function addShape() {
    const e = { id: uid(), tipo: 'forma', shape: 'rect', x: 12, y: 12, w: 45, h: 35, rot: 0, fill: '#3b82f6', opacidade: 1, radius: 0, z: 0 };
    setEls((a) => [e, ...a]); setSel(e.id); // formas nascem no fundo
  }
  function addIcon() {
    const e = { id: uid(), tipo: 'icone', name: 'star', x: 42, y: 20, w: 16, h: 16, rot: 0, cor: '#ffffff', peso: 1.6, opacidade: 1, z: els.length + 1 };
    setEls((a) => [...a, e]); setSel(e.id);
  }
  // Preenchimento da forma: alterna sólido/gradiente e ajusta cores.
  const shapeFill = selEl && selEl.tipo === 'forma' ? (typeof selEl.fill === 'object' ? selEl.fill : { grad: '', cores: [selEl.fill || '#3b82f6', '#1e3a8a'], ang: 150 }) : null;
  const setFillMode = (mode) => { // '' sólido | 'linear' | 'radial'
    const c = shapeFill.cores;
    patchSel({ fill: mode ? { grad: mode === 'radial' ? 'radial' : 'linear', cores: c, ang: shapeFill.ang } : c[0] });
  };
  async function onPickImage(e) {
    const f = (e.target.files || [])[0]; e.target.value = '';
    if (!f) return;
    setBusy(true);
    try { const up = await media.upload(f); addImage(up.url); } catch (err) { alert(err.message || 'Falha no upload'); }
    setBusy(false);
  }
  async function onPickBg(e) {
    const f = (e.target.files || [])[0]; e.target.value = '';
    if (!f) return;
    setBusy(true);
    try { const up = await media.upload(f); setBg({ kind: 'imagem', src: up.url }); } catch (err) { alert(err.message || 'Falha no upload'); }
    setBusy(false);
  }
  async function runAi() {
    if (!aiBrief.trim()) return;
    setAiBusy(true);
    try {
      const brand = bg.kind === 'cor' ? bg.cor : '';
      const res = await ai.composition({ brief: aiBrief, brand });
      if (res.bg && res.bg.cor) setBg({ kind: 'cor', cor: res.bg.cor });
      // mantém as imagens do usuário; troca os textos pelos gerados.
      const imgs = els.filter((e) => e.tipo !== 'texto');
      const texts = withIds((res.elementos || []).map((e) => ({ ...e, tipo: 'texto' })));
      setEls([...imgs, ...texts]);
      setSel(null); setAiOpen(false);
    } catch (err) { alert(err.message || 'Falha na IA'); }
    setAiBusy(false);
  }
  const removeSel = () => { if (!sel) return; setEls((a) => a.filter((e) => e.id !== sel)); setSel(null); };
  const layer = (d) => patchSel({ z: Math.max(0, (selEl.z || 0) + d) });

  function save() {
    onSave({ ...v, type: 'composicao', bg, elementos: stripIds(els.map((e) => ({
      ...e, x: round(e.x), y: round(e.y), w: round(e.w), h: round(e.h), rot: round(e.rot || 0),
    }))), formato: aspect, duracao: Number(dur) || 0 });
  }
  function round(n) { return Math.round((Number(n) || 0) * 10) / 10; }

  const bgStyle = bg.kind === 'imagem' && bg.src
    ? { backgroundImage: `url("${bg.src}")`, backgroundSize: 'cover', backgroundPosition: 'center' }
    : bg.kind === 'cor' ? { background: bg.cor } : { background: '#0a1020' };

  const ordered = [...els].sort((a, b) => (a.z || 0) - (b.z || 0));

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-canvas/95 backdrop-blur">
      {/* Barra superior */}
      <div className="flex items-center gap-2 border-b border-line bg-surface px-4 py-2.5">
        <span className="mr-2 text-sm font-semibold text-ink">Editor de composição</span>
        <Button size="sm" variant="secondary" icon={Sparkles} onClick={() => setAiOpen((o) => !o)}>IA</Button>
        <Button size="sm" variant="secondary" icon={ImagePlus} disabled={busy} onClick={() => imgInput.current.click()}>Imagem</Button>
        <Button size="sm" variant="secondary" icon={Type} onClick={addText}>Texto</Button>
        <Button size="sm" variant="secondary" icon={Shapes} onClick={addShape}>Forma</Button>
        <Button size="sm" variant="secondary" icon={Star} onClick={addIcon}>Ícone</Button>
        <div className="mx-2 h-5 w-px bg-line" />
        {ASPECTS.map((a) => (
          <button key={a.id} onClick={() => setAspect(a.id)} title={a.label}
            className={'flex h-8 w-8 items-center justify-center rounded-md border ' + (aspect === a.id ? 'border-accent text-accent' : 'border-line text-ink-3 hover:text-ink')}>
            <a.icon size={16} />
          </button>
        ))}
        <div className="flex-1" />
        <Button size="sm" variant="ghost" icon={X} onClick={onClose}>Cancelar</Button>
        <Button size="sm" variant="primary" icon={Save} onClick={save}>Salvar</Button>
        <input ref={imgInput} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={onPickImage} />
      </div>

      {aiOpen && (
        <div className="flex items-center gap-2 border-b border-line bg-surface-2 px-4 py-2">
          <Sparkles size={15} className="text-accent" />
          <input autoFocus value={aiBrief} onChange={(e) => setAiBrief(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') runAi(); }}
            placeholder="Descreva a peça (ex.: promoção de skate 30% OFF, jovem e vibrante)"
            className="flex-1 rounded-md border border-line bg-surface px-3 py-1.5 text-sm text-ink outline-none placeholder:text-ink-3" />
          <span className="text-2xs text-ink-3">a IA monta fundo + textos; sua imagem fica por cima</span>
          <Button size="sm" variant="primary" icon={Sparkles} disabled={aiBusy || !aiBrief.trim()} onClick={runAi}>{aiBusy ? 'Gerando…' : 'Gerar'}</Button>
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        {/* Palco */}
        <div className="flex flex-1 items-center justify-center overflow-auto p-6" onMouseDown={(e) => { if (e.target === e.currentTarget) setSel(null); }}>
          <div ref={canvasRef} onMouseDown={(e) => { if (e.target === canvasRef.current) setSel(null); }}
            className="relative shadow-2xl" style={{ ...bgStyle, aspectRatio: aspect.replace('/', ' / '), width: 'min(80vw, 900px)', maxHeight: '80vh' }}>
            {ordered.map((e) => (
              <div key={e.id} ref={(n) => { if (n) nodes.current[e.id] = n; }}
                onMouseDown={() => setSel(e.id)}
                style={{
                  position: 'absolute', left: e.x + '%', top: e.y + '%', width: e.w + '%', height: e.h + '%',
                  transform: `rotate(${e.rot || 0}deg)`, cursor: 'move', opacity: e.opacidade != null ? e.opacidade : 1,
                  outline: sel === e.id ? '1px solid rgba(120,160,255,.9)' : 'none',
                }}>
                {e.tipo === 'texto' ? (
                  <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: e.cor, fontWeight: e.peso, textAlign: e.align, fontSize: `clamp(10px, ${e.tamanho}vw, 200px)`, lineHeight: 1.05, overflow: 'hidden', textShadow: e.sombra ? '0 2px 14px rgba(0,0,0,.45)' : 'none' }}>
                    {e.text}
                  </div>
                ) : e.tipo === 'icone' ? (
                  <svg viewBox="0 0 24 24" fill="none" stroke={e.cor || '#fff'} strokeWidth={e.peso || 1.6} strokeLinecap="round" strokeLinejoin="round" style={{ width: '100%', height: '100%', pointerEvents: 'none' }} dangerouslySetInnerHTML={{ __html: ICONS[e.name] || ICONS.star }} />
                ) : e.tipo === 'forma' ? (
                  <div style={{ width: '100%', height: '100%', background: fillToCss(e.fill), borderRadius: e.shape === 'ellipse' ? '50%' : (SHAPE_POLY[e.shape] ? 0 : (e.radius || 0) + '%'), clipPath: SHAPE_POLY[e.shape] ? shapeClip(e.shape) : 'none', pointerEvents: 'none' }} />
                ) : (
                  <img src={e.src} alt="" draggable={false} style={{ width: '100%', height: '100%', objectFit: e.fit || 'contain', display: 'block', pointerEvents: 'none' }} />
                )}
              </div>
            ))}
            {sel && nodes.current[sel] && (
              <Moveable
                ref={moveableRef}
                target={nodes.current[sel]}
                draggable resizable rotatable
                origin={false} keepRatio={false}
                throttleDrag={0} throttleResize={0} throttleRotate={0}
                onDrag={({ left, top }) => { const r = rect(); patchSel({ x: clamp((left / r.width) * 100, -40, 140), y: clamp((top / r.height) * 100, -40, 140) }); }}
                onResize={({ width, height, drag }) => { const r = rect(); patchSel({ w: (width / r.width) * 100, h: (height / r.height) * 100, x: (drag.left / r.width) * 100, y: (drag.top / r.height) * 100 }); }}
                onRotate={({ rotation }) => patchSel({ rot: Math.round(rotation) })}
              />
            )}
          </div>
        </div>

        {/* Painel de propriedades */}
        <div className="w-72 shrink-0 space-y-4 overflow-y-auto border-l border-line bg-surface p-4">
          <div>
            <div className="mb-2 text-2xs font-semibold uppercase tracking-wide text-ink-3">Fundo</div>
            <div className="flex items-center gap-2">
              <input type="color" value={bg.kind === 'cor' ? bg.cor : '#0a1020'} onChange={(ev) => setBg({ kind: 'cor', cor: ev.target.value })}
                className="h-9 w-9 cursor-pointer rounded border border-line bg-transparent" />
              <Button size="sm" variant="secondary" icon={ImagePlus} disabled={busy} onClick={() => bgInput.current.click()}>Imagem</Button>
              {bg.kind === 'imagem' && <Button size="sm" variant="ghost" onClick={() => setBg({ kind: 'cor', cor: '#0a1020' })}>Limpar</Button>}
              <input ref={bgInput} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={onPickBg} />
            </div>
            <div className="mt-2 flex items-center gap-2">
              <span className="text-2xs text-ink-3">Gradiente</span>
              <input type="color" value={g1} onChange={(e) => { setG1(e.target.value); applyGrad(e.target.value, g2, gType); }} className="h-7 w-7 cursor-pointer rounded border border-line bg-transparent" />
              <input type="color" value={g2} onChange={(e) => { setG2(e.target.value); applyGrad(g1, e.target.value, gType); }} className="h-7 w-7 cursor-pointer rounded border border-line bg-transparent" />
              <Select value={gType} onChange={(e) => { setGType(e.target.value); applyGrad(g1, g2, e.target.value); }} className="h-8 flex-1 text-xs">
                <option value="linear">Linear</option><option value="radial">Radial</option>
              </Select>
            </div>
          </div>

          {selEl ? (
            <div className="space-y-3 border-t border-line pt-4">
              <div className="flex items-center justify-between">
                <span className="text-2xs font-semibold uppercase tracking-wide text-ink-3">{selEl.tipo === 'texto' ? 'Texto' : selEl.tipo === 'forma' ? 'Forma' : selEl.tipo === 'icone' ? 'Ícone' : 'Imagem'} selecionado</span>
                <div className="flex gap-1">
                  <button title="Frente" onClick={() => layer(1)} className="rounded p-1 text-ink-3 hover:text-ink"><ChevronUp size={15} /></button>
                  <button title="Trás" onClick={() => layer(-1)} className="rounded p-1 text-ink-3 hover:text-ink"><ChevronDown size={15} /></button>
                  <button title="Remover" onClick={removeSel} className="rounded p-1 text-ink-3 hover:text-danger"><Trash2 size={15} /></button>
                </div>
              </div>
              {selEl.tipo === 'texto' ? (
                <>
                  <Field label="Texto"><Input value={selEl.text} onChange={(e) => patchSel({ text: e.target.value })} /></Field>
                  <div className="grid grid-cols-2 gap-2">
                    <Field label="Cor"><input type="color" value={selEl.cor} onChange={(e) => patchSel({ cor: e.target.value })} className="h-9 w-full cursor-pointer rounded border border-line bg-transparent" /></Field>
                    <Field label="Tamanho"><Input type="number" value={selEl.tamanho} onChange={(e) => patchSel({ tamanho: Number(e.target.value) })} /></Field>
                  </div>
                  <Field label="Alinhamento">
                    <Select value={selEl.align} onChange={(e) => patchSel({ align: e.target.value })}>
                      <option value="left">Esquerda</option><option value="center">Centro</option><option value="right">Direita</option>
                    </Select>
                  </Field>
                  <label className="flex items-center gap-2 text-xs text-ink-2"><input type="checkbox" checked={!!selEl.sombra} onChange={(e) => patchSel({ sombra: e.target.checked })} /> Sombra no texto</label>
                </>
              ) : selEl.tipo === 'forma' ? (
                <>
                  <div className="grid grid-cols-2 gap-2">
                    <Field label="Formato">
                      <Select value={selEl.shape || 'rect'} onChange={(e) => patchSel({ shape: e.target.value })}>
                        <option value="rect">Retângulo</option><option value="ellipse">Elipse</option>
                        <option value="triangle">Triângulo</option><option value="diamond">Losango</option><option value="diag">Diagonal</option>
                      </Select>
                    </Field>
                    <Field label="Preenchimento">
                      <Select value={typeof selEl.fill === 'object' ? (selEl.fill.grad || 'linear') : ''} onChange={(e) => setFillMode(e.target.value)}>
                        <option value="">Sólido</option><option value="linear">Grad. linear</option><option value="radial">Grad. radial</option>
                      </Select>
                    </Field>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <Field label="Cor 1">
                      <input type="color" value={(typeof selEl.fill === 'object' ? shapeFill.cores[0] : selEl.fill) || '#3b82f6'}
                        onChange={(e) => { if (typeof selEl.fill === 'object') { const c = [...shapeFill.cores]; c[0] = e.target.value; patchSel({ fill: { ...selEl.fill, cores: c } }); } else patchSel({ fill: e.target.value }); }}
                        className="h-9 w-full cursor-pointer rounded border border-line bg-transparent" />
                    </Field>
                    {typeof selEl.fill === 'object' && (
                      <Field label="Cor 2">
                        <input type="color" value={shapeFill.cores[1] || '#1e3a8a'}
                          onChange={(e) => { const c = [...shapeFill.cores]; c[1] = e.target.value; patchSel({ fill: { ...selEl.fill, cores: c } }); }}
                          className="h-9 w-full cursor-pointer rounded border border-line bg-transparent" />
                      </Field>
                    )}
                  </div>
                  {typeof selEl.fill === 'object' && selEl.fill.grad !== 'radial' && (
                    <Field label={`Ângulo (${shapeFill.ang || 150}°)`}>
                      <input type="range" min="0" max="360" value={shapeFill.ang || 150} onChange={(e) => patchSel({ fill: { ...selEl.fill, ang: Number(e.target.value) } })} className="w-full" />
                    </Field>
                  )}
                  {selEl.shape !== 'ellipse' && (
                    <Field label={`Cantos (${selEl.radius || 0}%)`}>
                      <input type="range" min="0" max="50" value={selEl.radius || 0} onChange={(e) => patchSel({ radius: Number(e.target.value) })} className="w-full" />
                    </Field>
                  )}
                  <Field label={`Opacidade (${Math.round((selEl.opacidade != null ? selEl.opacidade : 1) * 100)}%)`}>
                    <input type="range" min="0" max="1" step="0.05" value={selEl.opacidade != null ? selEl.opacidade : 1} onChange={(e) => patchSel({ opacidade: Number(e.target.value) })} className="w-full" />
                  </Field>
                </>
              ) : selEl.tipo === 'icone' ? (
                <>
                  <div className="grid grid-cols-6 gap-1">
                    {ICON_NAMES.map((n) => (
                      <button key={n} type="button" title={n} onClick={() => patchSel({ name: n })}
                        className={'flex aspect-square items-center justify-center rounded border ' + (selEl.name === n ? 'border-accent text-accent' : 'border-line text-ink-2 hover:text-ink')}>
                        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" dangerouslySetInnerHTML={{ __html: ICONS[n] }} />
                      </button>
                    ))}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <Field label="Cor"><input type="color" value={selEl.cor || '#ffffff'} onChange={(e) => patchSel({ cor: e.target.value })} className="h-9 w-full cursor-pointer rounded border border-line bg-transparent" /></Field>
                    <Field label={`Traço (${selEl.peso || 1.6})`}><input type="range" min="1" max="3" step="0.1" value={selEl.peso || 1.6} onChange={(e) => patchSel({ peso: Number(e.target.value) })} className="w-full" /></Field>
                  </div>
                  <Field label={`Opacidade (${Math.round((selEl.opacidade != null ? selEl.opacidade : 1) * 100)}%)`}>
                    <input type="range" min="0" max="1" step="0.05" value={selEl.opacidade != null ? selEl.opacidade : 1} onChange={(e) => patchSel({ opacidade: Number(e.target.value) })} className="w-full" />
                  </Field>
                </>
              ) : (
                <Field label="Ajuste da imagem">
                  <Select value={selEl.fit || 'contain'} onChange={(e) => patchSel({ fit: e.target.value })}>
                    <option value="contain">Inteira (sem cortar)</option><option value="cover">Preencher (corta)</option>
                  </Select>
                </Field>
              )}
              <Button size="sm" variant="ghost" icon={RotateCcw} onClick={() => patchSel({ rot: 0 })}>Zerar rotação ({Math.round(selEl.rot || 0)}°)</Button>
            </div>
          ) : (
            <div className="border-t border-line pt-4 text-xs text-ink-3">Clique num elemento para editar. Arraste as alças para mover, redimensionar e girar.</div>
          )}

          <div className="border-t border-line pt-4">
            <Field label="Duração (s)" hint="0 = fica fixo"><Input type="number" value={dur} onChange={(e) => setDur(e.target.value)} /></Field>
          </div>
        </div>
      </div>
    </div>
  );
}
