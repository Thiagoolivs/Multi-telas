import React from 'react';
import { Field, Input, Select, Textarea, Checkbox } from '../ui/Field.jsx';
import { CONTENT_TYPES } from '../../lib/contentTypes.js';

// Formulário genérico dirigido pelo schema do tipo. Não conhece tipos
// específicos — só renderiza os campos declarados em contentTypes.js.
export function ItemForm({ item, onChange }) {
  const schema = CONTENT_TYPES[item.type];
  if (!schema) return <p className="text-sm text-ink-3">Tipo sem editor: {item.type}</p>;

  const set = (key, value) => onChange({ ...item, [key]: value });

  return (
    <div className="space-y-3.5">
      {schema.fields.map((f) => {
        const value = item[f.key];
        if (f.kind === 'bool') {
          return (
            <Checkbox key={f.key} label={f.label} checked={!!value} onChange={(e) => set(f.key, e.target.checked)} />
          );
        }
        return (
          <Field key={f.key} label={f.label} hint={f.hint}>
            {f.kind === 'textarea' ? (
              <Textarea value={value || ''} onChange={(e) => set(f.key, e.target.value)} />
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
      })}
    </div>
  );
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
