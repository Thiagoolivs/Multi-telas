import React from 'react';
import { Check } from 'lucide-react';
import { TituloDoPasso, RodapeDoPasso, Carregando, Erro } from './MolduraDoPasso.jsx';
import { Palco } from '../content/VerTelaAgora.jsx';
import { estadoDaPrevia } from '../../lib/telasProntas.js';
import { aplicarHorario } from '../../lib/primeiraTv.js';
import { cn } from '../../lib/cn.js';

/*
 * Passo 4 · Escolher a tela (≈30 s): três telas prontas do negócio, já com
 * a marca da conta, e um toque escolhe (lib/primeiraTv.js, opcoesDeTela:
 * as aprovadas do negócio primeiro; faltando, as montadas só com peças
 * aprovadas do negócio; de outra frente, nunca).
 */
export function PassoTela({ estado, opcoes, erro, horario, frente, onEscolher, onPular }) {
  return (
    <>
      <TituloDoPasso titulo="Escolha a tela" frase="Já com a sua marca. Depois você troca o que quiser." />
      {erro ? <Erro>{erro}</Erro> : opcoes === null ? <Carregando texto="Montando as telas com a sua marca…" /> : !opcoes.length ? (
        <p className="rounded-lg border border-line bg-surface-2 p-4 text-sm text-ink-2">As telas prontas do seu negócio ainda estão chegando. Pule este passo: dá para escolher depois, na Biblioteca.</p>
      ) : (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
          {opcoes.map((o) => {
            const sel = estado.tela === o.id;
            return (
              <button key={o.id} type="button" onClick={() => onEscolher(o)} aria-pressed={sel}
                className={cn('overflow-hidden rounded-xl border-2 bg-surface text-left transition', sel ? 'border-accent' : 'border-line hover:border-accent/60')}>
                <div className="bg-surface-2 p-2"><Palco estado={estadoDaPrevia(aplicarHorario(o.montada, horario, frente))} alturaMaxima={260} /></div>
                <div className="flex items-center gap-2 px-3 py-2.5">
                  <span className="min-w-0 flex-1 truncate text-base font-semibold text-ink">{o.nome}</span>
                  {sel && <Check size={18} className="shrink-0 text-accent" />}
                </div>
              </button>
            );
          })}
        </div>
      )}
      <RodapeDoPasso secundario={{ rotulo: 'Pular', onClick: onPular }} />
    </>
  );
}
