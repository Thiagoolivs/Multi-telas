import React from 'react';
import { Check } from 'lucide-react';
import { TRANSITIONS } from '../../lib/screenConfig.js';
import { cn } from '../../lib/cn.js';

/*
 * A TROCA ENTRE PEÇAS (Ajustes da TV › Aparência; movimento de cinema, 09/11).
 *
 * Escolher olhando: cada opção tem uma miniatura que troca uma tela pela
 * outra do jeito que a TV vai trocar (js/player.js, enterSlide). É só
 * desenho — dois retângulos e, na varredura, as faixas na cor da marca —,
 * em CSS e só com transform e opacity, como na TV. Quem pediu ao sistema
 * menos movimento vê a miniatura parada.
 */
const CSS = `
@keyframes mt-pt-dissolver { 0%,12% { opacity: 0; transform: scale(1.06); } 36%,82% { opacity: 1; transform: none; } 100% { opacity: 0; transform: none; } }
@keyframes mt-pt-fade { 0%,12% { opacity: 0; } 34%,82% { opacity: 1; } 100% { opacity: 0; } }
@keyframes mt-pt-slide { 0%,12% { opacity: 0; transform: translateX(8%); } 34%,82% { opacity: 1; transform: none; } 100% { opacity: 0; } }
@keyframes mt-pt-zoom { 0%,12% { opacity: 0; transform: scale(1.12); } 34%,82% { opacity: 1; transform: none; } 100% { opacity: 0; } }
@keyframes mt-pt-cinematic { 0%,12% { opacity: 0; transform: scale(1.05) translateY(4%); } 38%,82% { opacity: 1; transform: none; } 100% { opacity: 0; } }
@keyframes mt-pt-none { 0%,29.9% { opacity: 0; } 30%,81.9% { opacity: 1; } 82%,100% { opacity: 0; } }
@keyframes mt-pt-varredura { 0%,23.9% { opacity: 0; } 24%,81.9% { opacity: 1; } 82%,100% { opacity: 0; } }
@keyframes mt-pt-faixa { 0%,12% { transform: translateX(-101%); } 24% { transform: none; } 36%,100% { transform: translateX(101%); } }
.mt-pt-b { animation: 3.2s ease-out infinite both; }
.mt-pt-faixa { animation: mt-pt-faixa 3.2s cubic-bezier(.6,0,.4,1) infinite both; }
.mt-pt-faixa + .mt-pt-faixa { animation-delay: .08s; }
@media (prefers-reduced-motion: reduce) { .mt-pt-b, .mt-pt-faixa { animation: none; } .mt-pt-faixa { transform: translateX(101%); } }
`;

export function PreviaDaTransicao({ tipo, cor, cor2 }) {
  return (
    <span aria-hidden="true" className="relative block aspect-video w-full overflow-hidden rounded-md border border-line bg-ink">
      {/* A tela que sai: um título claro sobre o escuro. */}
      <span className="absolute left-[14%] top-[30%] block h-[12%] w-[46%] rounded-sm bg-white/80" />
      <span className="absolute left-[14%] top-[50%] block h-[8%] w-[30%] rounded-sm bg-white/40" />
      {/* A que entra: o bloco da marca. */}
      <span className="mt-pt-b absolute inset-0 block" style={{ animationName: 'mt-pt-' + tipo, background: cor }}>
        <span className="absolute right-[14%] top-[34%] block h-[14%] w-[40%] rounded-sm bg-white/90" />
        <span className="absolute right-[14%] top-[56%] block h-[8%] w-[24%] rounded-sm bg-white/50" />
      </span>
      {tipo === 'varredura' && (
        <>
          <span className="mt-pt-faixa absolute inset-0 block" style={{ background: cor2 }} />
          <span className="mt-pt-faixa absolute inset-0 block" style={{ background: cor }} />
        </>
      )}
    </span>
  );
}

/*
 * O seletor: as opções com a miniatura. `valor` é settings.transicao (as TVs
 * de antes guardam 'cinematic'; a TV nova nasce com 'dissolver',
 * web/src/lib/contentTypes.js, defaultConfig).
 */
export function TransicaoDaTela({ valor, onChange, cor, cor2 }) {
  const atual = valor || 'cinematic';
  const c1 = cor || '#5b2eff';
  const c2 = cor2 || '#c6f432';
  return (
    <div>
      <style>{CSS}</style>
      <div className="mb-1 text-sm font-semibold text-ink">Troca entre peças</div>
      <p className="mb-2 text-xs text-ink-3">
        Como uma peça dá lugar à próxima. <b className="text-ink-2">Dissolver</b> e <b className="text-ink-2">Varredura</b> valem também para as peças prontas; as outras, para fotos, vídeos e avisos. Na TV mais simples, toda troca vira um esmaecer.
      </p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {TRANSITIONS.map((t) => {
          const sel = atual === t.value;
          return (
            <button key={t.value} type="button" aria-pressed={sel} onClick={() => onChange(t.value)}
              className={cn('flex flex-col gap-1.5 rounded-lg border p-2 text-left transition', sel ? 'border-accent bg-accent-soft/40' : 'border-line hover:border-accent/50')}>
              <PreviaDaTransicao tipo={t.value} cor={c1} cor2={c2} />
              <span className="flex items-center gap-1 text-2xs font-medium leading-tight text-ink">{sel && <Check size={11} className="shrink-0 text-accent" />}{t.label}</span>
              {t.dica && <span className="text-2xs leading-tight text-ink-3">{t.dica}</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}
