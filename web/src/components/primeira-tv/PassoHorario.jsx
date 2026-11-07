import React, { useState } from 'react';
import { Clock, Sun, CalendarDays, Pencil, ArrowRight } from 'lucide-react';
import { TituloDoPasso, RodapeDoPasso, Escolha } from './MolduraDoPasso.jsx';
import { CamposDoHorario } from '../tela/HorarioDaTela.jsx';
import { HORARIOS, HORARIO_PADRAO } from '../../lib/primeiraTv.js';
import { usePerfil } from '../../lib/perfil.js';

const ICONE = { semana: CalendarDays, comercio: Sun, '24h': Clock };
const FORA = [['relogio', 'Mostra só o relógio'], ['preta', 'Fica preta (menos luz e menos desgaste)'], ['ligada', 'Continua mostrando a tela']];

/*
 * Passo 6 · Horário (≈30 s): um toque nos horários de sempre. Fora do
 * horário a TV mostra só o relógio — quem quer outra coisa toca em "Trocar"
 * (fechado, para não virar uma segunda pergunta). "Outro horário" abre o
 * mesmo formulário de Telas › Horário (HorarioDaTela.jsx).
 */
export function PassoHorario({ estado, onConcluir, onPular }) {
  const perfil = usePerfil();
  const guardado = estado.horario || HORARIO_PADRAO;
  const [fora, setFora] = useState(guardado.foraDoHorario || 'relogio');
  const [trocandoFora, setTrocandoFora] = useState(false);
  const [outro, setOutro] = useState(guardado.preset === 'outro');
  const [exp, setExp] = useState({ alerta: true, dias: guardado.dias, inicio: guardado.inicio, fim: guardado.fim, foraDoHorario: fora });

  const escolher = (h) => onConcluir({ preset: h.id, dias: h.dias.slice(), inicio: h.inicio, fim: h.fim, foraDoHorario: fora });

  if (outro) {
    return (
      <>
        <TituloDoPasso titulo={'Quando a ' + perfil.lugar + ' abre?'} frase="Marque os dias e as horas." />
        <CamposDoHorario exp={exp} setExp={setExp} />
        <RodapeDoPasso principal={{ rotulo: 'Continuar', icone: ArrowRight, disabled: !exp.dias.length, onClick: () => onConcluir({ preset: 'outro', dias: exp.dias, inicio: exp.inicio, fim: exp.fim, foraDoHorario: exp.foraDoHorario || 'relogio' }) }}
          secundario={{ rotulo: 'Voltar aos horários prontos', onClick: () => setOutro(false) }} />
      </>
    );
  }

  return (
    <>
      <TituloDoPasso titulo={'Quando a ' + perfil.lugar + ' abre?'} frase="A TV liga e desliga sozinha nesse horário." />
      <div className="space-y-2.5">
        {HORARIOS.map((h) => (
          <Escolha key={h.id} icone={ICONE[h.id]} titulo={h.nome} detalhe={h.detalhe} escolhida={estado.horario && estado.horario.preset === h.id} onClick={() => escolher(h)} />
        ))}
        <Escolha icone={Pencil} titulo="Outro horário" detalhe="Escolher os dias e as horas" onClick={() => setOutro(true)} />
      </div>
      <div className="mt-5 rounded-lg border border-line bg-surface-2 px-3 py-2.5 text-sm text-ink-2">
        {!trocandoFora ? (
          <div className="flex items-center gap-2">
            <span className="min-w-0 flex-1">Fora do horário, a TV <b className="font-semibold text-ink">{FORA.find(([v]) => v === fora)[1].toLowerCase()}</b>.</span>
            <button type="button" onClick={() => setTrocandoFora(true)} className="h-11 shrink-0 px-2 font-semibold text-accent hover:underline">Trocar</button>
          </div>
        ) : (
          <fieldset>
            <legend className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-ink-3">Fora do horário, a TV</legend>
            {FORA.map(([v, rotulo]) => (
              <label key={v} className="flex min-h-11 items-center gap-2 text-base text-ink">
                <input type="radio" name="fora" checked={fora === v} onChange={() => { setFora(v); setExp((x) => ({ ...x, foraDoHorario: v })); setTrocandoFora(false); }} />
                {rotulo}
              </label>
            ))}
          </fieldset>
        )}
      </div>
      <RodapeDoPasso secundario={{ rotulo: 'Pular', onClick: onPular }} />
    </>
  );
}
