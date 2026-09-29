import React from 'react';
import { CalendarClock } from 'lucide-react';
import { Checkbox, Input } from '../ui/Field.jsx';
import { DIAS, resumoAgenda, problemaDaAgenda } from '../../lib/agenda.js';
import { cn } from '../../lib/cn.js';

/*
 * "Quando mostrar": dias, horário e período de UM conteúdo.
 *
 * Grava no `agendamento` que o player já entende (js/player.js,
 * agendadoAgora). Fora da janela, a TV passa os outros conteúdos da zona — e,
 * se não sobrar nenhum, mostra o relógio.
 *
 * Dias vazios, para o player, quer dizer "todo dia". Por isso a lista nunca
 * fica vazia aqui: desmarcar o último dia não é permitido, senão desmarcar
 * tudo viraria, em silêncio, o contrário do que a pessoa quis.
 */
export function QuandoMostrar({ agendamento, onChange }) {
  const a = agendamento || {};
  const ativo = !!a.ativo;
  const set = (patch) => onChange({ ...a, ativo: true, ...patch });
  const dias = Array.isArray(a.dias) && a.dias.length ? a.dias : [0, 1, 2, 3, 4, 5, 6];

  function alternarDia(n) {
    const tem = dias.includes(n);
    if (tem && dias.length === 1) return;
    const novos = tem ? dias.filter((d) => d !== n) : [...dias, n].sort();
    set({ dias: novos.length === 7 ? [] : novos });
  }

  const problema = problemaDaAgenda(a);

  return (
    <div className="space-y-3 rounded-lg border border-line p-3">
      <Checkbox
        label={<span className="inline-flex items-center gap-1.5"><CalendarClock size={14} className="text-ink-3" /> Mostrar só em alguns dias ou horários</span>}
        checked={ativo}
        onChange={(e) => (e.target.checked
          ? set({ horaInicio: a.horaInicio || '06:00', horaFim: a.horaFim || '10:00' })
          : onChange({ ...a, ativo: false }))}
      />
      {ativo && (
        <>
          <div className="flex gap-1">
            {DIAS.map((d) => (
              <button
                key={d.n} type="button" title={d.nome} aria-pressed={dias.includes(d.n)}
                onClick={() => alternarDia(d.n)}
                className={cn('h-8 w-8 rounded-md border text-xs font-semibold transition',
                  dias.includes(d.n) ? 'border-accent bg-accent-soft text-accent' : 'border-line text-ink-3 hover:text-ink')}
              >
                {d.curto}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2 text-sm text-ink-2">
            das
            <Input type="time" value={a.horaInicio || ''} onChange={(e) => set({ horaInicio: e.target.value })} className="w-28" />
            às
            <Input type="time" value={a.horaFim || ''} onChange={(e) => set({ horaFim: e.target.value })} className="w-28" />
          </div>
          <div className="flex flex-wrap items-center gap-2 text-sm text-ink-2">
            de
            <Input type="date" value={a.dataInicio || ''} onChange={(e) => set({ dataInicio: e.target.value })} className="w-40" />
            até
            <Input type="date" value={a.dataFim || ''} onChange={(e) => set({ dataFim: e.target.value })} className="w-40" />
            <span className="text-2xs text-ink-3">(datas opcionais)</span>
          </div>
          <p className="text-xs text-ink-2">{resumoAgenda(a)}. Fora disso, a TV passa os outros conteúdos.</p>
          {problema && <p className="rounded-md bg-danger-soft px-2 py-1.5 text-xs text-danger">{problema}</p>}
        </>
      )}
    </div>
  );
}
