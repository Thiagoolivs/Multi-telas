import React, { useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { Field, Input, Select, Textarea, Checkbox } from '../ui/Field.jsx';
import { MediaField } from './MediaField.jsx';
import { MuralField } from './MuralField.jsx';
import { QuizField } from './QuizField.jsx';
import { CONTENT_TYPES, camposPorNivel } from '../../lib/contentTypes.js';

/*
 * "Mais ajustes" lembra a escolha de cada pessoa (BLOCO-8 §4.3): quem abriu
 * uma vez para mexer na cor encontra aberto na próxima peça.
 */
const CHAVE_MAIS = 'mt.maisAjustes';
const lerMais = () => { try { return localStorage.getItem(CHAVE_MAIS) === '1'; } catch (e) { return false; } };
const guardarMais = (v) => { try { localStorage.setItem(CHAVE_MAIS, v ? '1' : '0'); } catch (e) { /* sem armazenamento: só nesta tela */ } };

// Formulário genérico dirigido pelo schema do tipo. Não conhece tipos
// específicos — só renderiza os campos declarados em contentTypes.js.
// Fase 7: o conteúdo em cima; aparência e tempo (`nivel: 'avancado'`) e o
// que a página passar em `maisAjustes` ficam recolhidos em "Mais ajustes".
// Fase 10: `quando` (o "Quando" em frases) vem logo depois do conteúdo; `maisRotulo` diz o que há em "Mais ajustes".
export function ItemForm({ item, onChange, maisAjustes, quando, maisRotulo }) {
  const [aberto, setAberto] = useState(lerMais);
  const schema = CONTENT_TYPES[item.type];
  if (!schema) return <p className="text-sm text-ink-3">Tipo sem editor: {item.type}</p>;

  const set = (key, value) => onChange({ ...item, [key]: value });
  const { simples, avancados } = camposPorNivel(item.type);
  const temMais = avancados.length > 0 || !!maisAjustes;

  return (
    <div className="space-y-3.5">
      {simples.map(campo)}
      {quando}
      {temMais && (
        <div className="rounded-lg border border-line">
          <button type="button" aria-expanded={aberto} onClick={() => { setAberto(!aberto); guardarMais(!aberto); }}
            className="flex min-h-11 w-full items-center gap-1.5 px-3 text-left text-sm font-medium text-ink-2 hover:text-ink">
            <ChevronRight size={15} className={'shrink-0 transition-transform ' + (aberto ? 'rotate-90' : '')} />
            <span className="shrink-0 whitespace-nowrap">Mais ajustes</span>
            <span className="min-w-0 truncate text-xs font-normal text-ink-3">· {maisRotulo || [avancados.length ? 'aparência e tempo' : '', maisAjustes ? 'importância' : ''].filter(Boolean).join(', ')}</span>
          </button>
          {aberto && (
            <div className="space-y-3.5 border-t border-line p-3">
              {avancados.map(campo)}
              {maisAjustes}
            </div>
          )}
        </div>
      )}
    </div>
  );

  function campo(f) {
    const value = item[f.key];
    // O quiz mexe em mais de um campo (título, tempo, perguntas): o editor dele recebe o item inteiro.
    if (f.kind === 'quiz') return <QuizField key={f.key} item={item} onChange={onChange} />;
    if (f.kind === 'bool') {
      return (
        <Checkbox key={f.key} label={f.label} checked={!!value} onChange={(e) => set(f.key, e.target.checked)} />
      );
    }
    return (
      <Field key={f.key} label={f.label} hint={f.hint}>
        {f.kind === 'media' ? (
          <MediaField value={value} accept={f.accept || 'image'} onChange={(v) => set(f.key, v)} />
        ) : f.kind === 'mural' ? (
          <MuralField value={value} onChange={(v) => set(f.key, v)} />
        ) : f.kind === 'textarea' ? (
          <Textarea value={value || ''} rows={f.rows} onChange={(e) => set(f.key, e.target.value)} placeholder={f.placeholder} />
        ) : f.kind === 'select' ? (
          <Select value={value ?? f.options[0].value} onChange={(e) => set(f.key, e.target.value)}>
            {f.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </Select>
        ) : f.kind === 'color' ? (
          <ColorInput value={value} onChange={(v) => set(f.key, v)} />
        ) : f.kind === 'number' ? (
          <Input type="number" min={f.min} value={value ?? 0} onChange={(e) => set(f.key, Number(e.target.value))} />
        ) : (
          <Input type={f.kind === 'url' ? 'url' : 'text'} value={value || ''} onChange={(e) => set(f.key, e.target.value)} placeholder={f.placeholder} />
        )}
      </Field>
    );
  }
}

// Cor opcional: swatch + hex; botão limpar volta ao tema.
function ColorInput({ value, onChange }) {
  return (
    <div className="flex items-center gap-2">
      <input
        type="color"
        value={value || '#2f6feb'}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 w-10 cursor-pointer rounded-md border border-line bg-surface p-1"
      />
      <Input value={value || ''} onChange={(e) => onChange(e.target.value)} placeholder="padrão do tema" className="flex-1" />
      {value && (
        <button type="button" onClick={() => onChange('')} className="text-xs text-ink-3 hover:text-ink">limpar</button>
      )}
    </div>
  );
}
