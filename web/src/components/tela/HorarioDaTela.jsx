import React from 'react';
import { Field, Input } from '../ui/Field.jsx';

/*
 * O HORÁRIO DA TV (expediente): os dias e as horas em que a loja está
 * aberta, o que a TV mostra fora disso e o alerta de queda. Um formulário só,
 * usado pelo sino da lista de Telas e pela aba Horário dos Ajustes da tela
 * (EXECUTOR §2c, item 33) — duas cópias acabariam salvando regras diferentes.
 */
const DIAS = [['D', 0, 'domingo'], ['S', 1, 'segunda'], ['T', 2, 'terça'], ['Q', 3, 'quarta'], ['Q', 4, 'quinta'], ['S', 5, 'sexta'], ['S', 6, 'sábado']];

export const HORARIO_PADRAO = { alerta: true, dias: [1, 2, 3, 4, 5, 6], inicio: '07:00', fim: '22:00', foraDoHorario: 'ligada' };

export function CamposDoHorario({ exp, setExp }) {
  const dia24 = exp.inicio === exp.fim;
  const alternarDia = (n) => setExp({ ...exp, dias: exp.dias.includes(n) ? exp.dias.filter((x) => x !== n) : [...exp.dias, n].sort() });
  return (
    <div className="space-y-4">
      <fieldset>
        <div className="text-2xs font-semibold uppercase tracking-wide text-ink-3">Dias em que a tela fica ligada</div>
        <div className="mt-1.5 flex gap-1.5">
          {DIAS.map(([letra, n, nome]) => (
            <button key={n} type="button" title={nome} aria-pressed={exp.dias.includes(n)} onClick={() => alternarDia(n)}
              className={'h-8 w-8 rounded-full border text-xs font-semibold ' + (exp.dias.includes(n)
                ? 'border-accent bg-accent text-white' : 'border-line bg-surface text-ink-3')}>
              {letra}
            </button>
          ))}
        </div>

        <div className="mt-3 grid grid-cols-2 gap-3">
          <Field label="Liga às">
            <Input type="time" value={exp.inicio} disabled={dia24} onChange={(e) => setExp({ ...exp, inicio: e.target.value })} />
          </Field>
          <Field label="Desliga às">
            <Input type="time" value={exp.fim} disabled={dia24} onChange={(e) => setExp({ ...exp, fim: e.target.value })} />
          </Field>
        </div>
        <label className="mt-2 flex items-center gap-2 text-sm text-ink-2">
          <input type="checkbox" checked={dia24} onChange={(e) => setExp({ ...exp, inicio: e.target.checked ? '00:00' : '07:00', fim: e.target.checked ? '00:00' : '22:00' })} />
          Fica ligada 24 horas
        </label>
      </fieldset>

      <div>
        <div className="text-2xs font-semibold uppercase tracking-wide text-ink-3">Fora do horário, a TV</div>
        <div className="mt-1.5 grid gap-1.5">
          {[['ligada', 'Continua mostrando a programação'], ['relogio', 'Mostra só o relógio'], ['preta', 'Fica preta (menos desgaste e menos luz)']].map(([v, rotulo]) => (
            <label key={v} className="flex items-center gap-2 text-sm text-ink">
              <input type="radio" name="foraDoHorario" checked={(exp.foraDoHorario || 'ligada') === v} onChange={() => setExp({ ...exp, foraDoHorario: v })} />
              {rotulo}
            </label>
          ))}
        </div>
        <p className="mt-1 text-xs text-ink-3">Vale na hora: a TV muda sozinha quando a loja abre e fecha.</p>
      </div>

      <div>
        <label className="flex items-center gap-2 text-sm text-ink">
          <input type="checkbox" checked={exp.alerta} onChange={(e) => setExp({ ...exp, alerta: e.target.checked })} />
          Avisar por e-mail quando esta tela cair
        </label>
        <p className="mt-1 text-xs text-ink-3">
          Fora deste horário a TV pode ficar desligada à vontade: nenhum aviso sai.
          Se ela não voltar quando o horário começar, avisamos 15 minutos depois.
        </p>
      </div>
    </div>
  );
}
