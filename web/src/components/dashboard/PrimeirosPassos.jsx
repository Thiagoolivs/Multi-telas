import React, { useEffect, useState } from 'react';
import { Check, MonitorPlay, Wand2, Brush, ArrowRight } from 'lucide-react';
import { lerJornada } from '../../lib/jornada.js';

/*
 * "Comece por aqui": do cadastro à primeira peça na TV em menos de 10
 * minutos (PLANO §5.3, EXECUTOR item 16), NA ORDEM em que faz sentido:
 *
 *   1. Marca — cole o site (a IA tira cores e fontes) ou escolha a paleta
 *      sugerida para o ramo. Vem primeiro porque é com ela que a peça sai
 *      com a cara da loja, e não genérica.
 *   2. Primeira peça — no Criar, com a marca já aplicada.
 *   3. Ligar a TV — parear, e a peça vai para ela na hora.
 *
 * A ordem antiga era TV → conteúdo → marca: a pessoa pareava, publicava uma
 * peça genérica e só depois descobria que dava para ter as cores da loja.
 *
 * Os passos são deduzidos do estado real (lib/jornada.js), e o PRÓXIMO fica
 * em destaque: o que fazer agora nunca é uma pergunta. Some sozinho quando
 * os três terminam.
 */

const DISPENSADO = 'mt.primeirosPassos.dispensado';

export function PrimeirosPassos({ devices, onIr }) {
  const [jornada, setJornada] = useState(null);
  const [dispensado, setDispensado] = useState(() => {
    try { return localStorage.getItem(DISPENSADO) === '1'; } catch (e) { return false; }
  });

  // Relê quando a lista de telas muda (pareou, publicou): o passo acompanha.
  useEffect(() => { lerJornada().then(setJornada).catch(() => setJornada(null)); }, [devices]);

  if (!jornada || dispensado || !jornada.proximo) return null;

  const passos = [
    {
      id: 'marca',
      icone: Brush,
      titulo: 'Diga quem é a empresa',
      texto: 'Cole o endereço do site: a IA tira de lá as cores e as letras. Sem site, escolha a paleta sugerida para o seu ramo.',
      acao: 'Abrir a Marca',
      destino: 'brand',
    },
    {
      id: 'peca',
      icone: Wand2,
      titulo: 'Crie a primeira peça',
      texto: 'Escolha o que mostrar e escreva uma frase. A IA monta a peça com a sua marca.',
      acao: 'Criar',
      destino: 'criar',
    },
    {
      id: 'tela',
      icone: MonitorPlay,
      titulo: 'Ligue a TV e mande a peça',
      texto: 'Abra o MultiTelas no navegador da TV (ou no box) e aponte o celular para o QR. A peça vai para ela na hora.',
      acao: 'Ligar a TV',
      destino: 'screens',
      params: { abrirParear: true },
    },
  ].map((p) => ({ ...p, feito: jornada[p.id] }));

  const prontos = passos.filter((p) => p.feito).length;

  return (
    <div className="mb-4 rounded-lg border border-line bg-surface p-4">
      <div className="flex items-center gap-3">
        <h2 className="text-sm font-semibold text-ink">Comece por aqui</h2>
        <span className="tnum text-xs text-ink-3">{prontos} de {passos.length} · uns 10 minutos</span>
        <button
          type="button"
          onClick={() => { try { localStorage.setItem(DISPENSADO, '1'); } catch (e) {} setDispensado(true); }}
          className="ml-auto text-xs text-ink-3 transition hover:text-ink"
        >
          Dispensar
        </button>
      </div>

      <ol className="mt-3 space-y-2">
        {passos.map((p, i) => {
          const Icone = p.icone;
          const agora = jornada.proximo === p.id;
          return (
            <li key={p.id}
              className={'flex flex-wrap items-start gap-x-3 gap-y-2 rounded-md border p-3 ' + (p.feito ? 'border-line bg-surface-2' : agora ? 'border-accent/50 bg-accent-soft/30' : 'border-line')}>
              <span className={'mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-2xs font-bold '
                + (p.feito ? 'bg-ok/15 text-ok' : 'bg-accent/15 text-accent')}>
                {p.feito ? <Check size={13} /> : i + 1}
              </span>
              <span className="min-w-[12rem] flex-1">
                <span className={'block text-sm font-medium ' + (p.feito ? 'text-ink-2 line-through' : 'text-ink')}>{p.titulo}</span>
                {!p.feito && <span className="mt-0.5 block text-sm text-ink-2">{p.texto}</span>}
              </span>
              {!p.feito && (
                <button type="button" onClick={() => onIr(p.destino, p.params)}
                  className={'ml-9 flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition sm:ml-0 '
                    + (agora ? 'bg-accent text-accent-fg hover:brightness-110' : 'border border-line text-ink hover:border-accent/50 hover:text-accent')}>
                  <Icone size={14} />
                  {p.acao}
                  {agora && <ArrowRight size={13} />}
                </button>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
