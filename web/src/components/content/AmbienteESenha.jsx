import React from 'react';
import { Field, Input, Select, Checkbox } from '../ui/Field.jsx';

/*
 * Dois ajustes da TV que moram fora das peças (Ajustes da TV › Aparência):
 *
 *   - MODO AMBIENTE (fase 9): uma arte calma da marca entre os avisos, com a
 *     hora e a data ou uma frase curta (js/ambiente.js; quem entra e quando,
 *     js/rodizio.js comAmbiente). Os tetos do urgente e da Alta continuam.
 *   - CHAMADA DE SENHA nesta TV (fase 12): mostrar ou não, com som ou sem, e
 *     a senha sempre à vista ao lado do conteúdo (js/senha.js). Quem chama é
 *     a recepção, na página Chamada de senha.
 *
 * Os dois vão em settings (js/storage.js normaliza) e a TV aplica na hora.
 */
const CADA = [3, 4, 5, 6, 8];
const SEGUNDOS = [8, 10, 15, 20];

export function AmbienteESenha({ settings, onChange }) {
  const s = settings || {};
  const a = { ativo: false, cada: 4, segundos: 10, mostrar: 'relogio', frase: '', ...(s.ambiente || {}) };
  const q = { ativo: true, som: true, fixa: false, segundos: 12, ...(s.senha || {}) };
  const setA = (p) => onChange({ ambiente: { ...a, ...p } });
  const setQ = (p) => onChange({ senha: { ...q, ...p } });
  return (
    <div className="space-y-5">
      <div>
        <div className="mb-1 text-sm font-semibold text-ink">Modo ambiente</div>
        <p className="mb-2 text-xs text-ink-3">Uma arte calma, nas cores da marca, entre os avisos: a hora e a data, ou uma frase curta. Um respiro para quem espera.</p>
        <Checkbox label="Pôr a arte calma entre os avisos" checked={a.ativo === true} onChange={(e) => setA({ ativo: e.target.checked })} />
        {a.ativo === true && (
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <Field label="Quando entra">
              <Select value={String(a.cada)} onChange={(e) => setA({ cada: Number(e.target.value) })}>
                {CADA.map((n) => <option key={n} value={n}>A cada {n} avisos</option>)}
              </Select>
            </Field>
            <Field label="Quanto tempo fica">
              <Select value={String(a.segundos)} onChange={(e) => setA({ segundos: Number(e.target.value) })}>
                {SEGUNDOS.map((n) => <option key={n} value={n}>{n} segundos</option>)}
              </Select>
            </Field>
            <Field label="O que mostra">
              <Select value={a.mostrar} onChange={(e) => setA({ mostrar: e.target.value })}>
                <option value="relogio">A hora e a data</option>
                <option value="frase">Uma frase</option>
              </Select>
            </Field>
            {a.mostrar === 'frase' && (
              <Field label="A frase" hint="Curta, até 90 letras. Vazia, a TV mostra a hora." className="sm:col-span-3">
                <Input maxLength={90} value={a.frase || ''} onChange={(e) => setA({ frase: e.target.value })} placeholder="Respire fundo. Já é a sua vez." />
              </Field>
            )}
          </div>
        )}
      </div>

      <div>
        <div className="mb-1 text-sm font-semibold text-ink">Chamada de senha</div>
        <p className="mb-2 text-xs text-ink-3">Quando a recepção chama, a senha e o lugar tomam a tela por alguns segundos. O nome do paciente nunca aparece.</p>
        <div className="space-y-2">
          <Checkbox label="Mostrar as chamadas de senha nesta TV" checked={q.ativo !== false} onChange={(e) => setQ({ ativo: e.target.checked })} />
          {q.ativo !== false && (
            <>
              <Checkbox label="Tocar um aviso sonoro a cada chamada" checked={q.som !== false} onChange={(e) => setQ({ som: e.target.checked })} />
              <Checkbox label="Deixar a senha sempre à vista, ao lado do conteúdo" checked={q.fixa === true} onChange={(e) => setQ({ fixa: e.target.checked })} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
