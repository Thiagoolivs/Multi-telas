import React, { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Palette, Sparkles, Clock, AlertTriangle, Lightbulb, Check } from 'lucide-react';
import { digest, formatarTempo } from '../../lib/screenDigest.js';
import { cn } from '../../lib/cn.js';

/*
 * "O que está nesta tela" — a resposta para "o sistema não passa segurança".
 *
 * Antes o usuário aplicava uma data, publicava uma campanha e mexia no tema, e
 * nada dizia qual coisa venceu nem o que a TV está exibindo agora. Este resumo
 * não decide nada: ele descreve, e é isso que devolve o controle.
 */
export function ScreenSummary({ cfg }) {
  const [aberto, setAberto] = useState(false);
  const d = useMemo(() => digest(cfg), [cfg]);
  if (!d) return null;

  const avisos = d.problemas.filter((p) => p.nivel === 'aviso');
  const dicas = d.problemas.filter((p) => p.nivel === 'dica');

  return (
    <div className="mb-4 rounded-xl border border-line bg-surface">
      <button type="button" onClick={() => setAberto((o) => !o)}
        className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left">
        {aberto ? <ChevronDown size={15} className="text-ink-3" /> : <ChevronRight size={15} className="text-ink-3" />}
        <span className="text-sm font-semibold text-ink">O que está nesta tela</span>

        {/* Linha de estado: dá para entender sem abrir. */}
        <span className="hidden min-w-0 flex-1 truncate text-xs text-ink-3 sm:block">
          {d.layout} · {d.tema.texto}
          {d.decoracao ? ` · ${d.decoracao}` : ''}
          {d.cicloTotal ? ` · ciclo de ${formatarTempo(d.cicloTotal)}` : ''}
        </span>

        <span className="ml-auto flex shrink-0 items-center gap-1.5">
          {avisos.length > 0 ? (
            <span className="flex items-center gap-1 rounded-full bg-danger-soft px-2 py-0.5 text-2xs font-semibold text-danger">
              <AlertTriangle size={11} /> {avisos.length}
            </span>
          ) : (
            <span className="flex items-center gap-1 rounded-full bg-surface-2 px-2 py-0.5 text-2xs font-medium text-ink-3">
              <Check size={11} className="text-emerald-500" /> sem problemas
            </span>
          )}
          {dicas.length > 0 && (
            <span className="flex items-center gap-1 rounded-full bg-surface-2 px-2 py-0.5 text-2xs font-medium text-ink-3">
              <Lightbulb size={11} /> {dicas.length}
            </span>
          )}
        </span>
      </button>

      {aberto && (
        <div className="border-t border-line p-4">
          <div className="grid gap-4 md:grid-cols-2">
            {/* Zonas */}
            <div>
              <div className="mb-2 text-2xs font-semibold uppercase tracking-wide text-ink-3">Zonas</div>
              <div className="space-y-1.5">
                {d.zonas.map((z) => (
                  <div key={z.id} className="flex items-baseline gap-2 text-xs">
                    <span className="font-medium text-ink">{z.nome}</span>
                    <span className="text-ink-3">{z.resumo}</span>
                    {z.ciclo > 0 && (
                      <span className="tnum ml-auto flex items-center gap-1 text-ink-3">
                        <Clock size={11} /> {formatarTempo(z.ciclo)}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Aparência e origem */}
            <div className="space-y-2 text-xs">
              <div className="mb-2 text-2xs font-semibold uppercase tracking-wide text-ink-3">Aparência</div>
              <div className="flex items-start gap-1.5 text-ink-2">
                <Palette size={13} className="mt-0.5 shrink-0 text-ink-3" />
                <span>
                  Usando {d.tema.texto}
                  {d.tema.mexeuAMao && <span className="text-ink-3"> · com ajustes seus por cima</span>}
                </span>
              </div>
              {d.decoracao && (
                <div className="flex items-start gap-1.5 text-ink-2">
                  <Sparkles size={13} className="mt-0.5 shrink-0 text-ink-3" />
                  <span>Decoração animada: {d.decoracao}</span>
                </div>
              )}
              {/* De onde veio o conteúdo — a parte que responde "quem colocou isso aqui". */}
              {(d.origens.data > 0 || d.origens.campanha > 0) && (
                <div className="pt-1 text-ink-3">
                  Conteúdo:{' '}
                  {['data', 'campanha', 'manual'].filter((k) => d.origens[k] > 0)
                    .map((k) => `${d.origens[k]} da ${d.rotuloOrigem(k)}`).join(' · ')}
                </div>
              )}
            </div>
          </div>

          {/* Problemas — o que a TV vai mostrar de errado */}
          {(avisos.length > 0 || dicas.length > 0) && (
            <div className="mt-4 space-y-1.5 border-t border-line pt-3">
              {avisos.map((p, i) => (
                <div key={'a' + i} className="flex items-start gap-1.5 text-xs text-danger">
                  <AlertTriangle size={13} className="mt-0.5 shrink-0" /> {p.texto}
                </div>
              ))}
              {dicas.map((p, i) => (
                <div key={'d' + i} className="flex items-start gap-1.5 text-xs text-ink-3">
                  <Lightbulb size={13} className="mt-0.5 shrink-0" /> {p.texto}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
