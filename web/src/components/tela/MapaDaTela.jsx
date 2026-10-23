import React, { useMemo } from 'react';
import { Plus, Sparkles } from 'lucide-react';
import { cn } from '../../lib/cn.js';
import { gradeDaMiniatura, proporcaoDoLayout, pecasDaFaixa, tamanhosDasZonas } from '../../lib/tela.js';
import { PecaHtml } from '../content/PecaHtml.jsx';

/*
 * A TV DESENHADA (EXECUTOR §2c, item 30).
 *
 * As zonas eram botões soltos ("Lateral", "Principal", "Notícias") e o
 * cliente não via onde cada uma ficava. Aqui a TV aparece com o layout de
 * verdade — a mesma grade de js/templates.js que o player usa — e cada zona é
 * um pedaço clicável com o que gira nela.
 *
 * A grade do player mistura `fr` e `vh` ("12vh 1fr 11vh"). Na miniatura tudo
 * vira `fr` na mesma proporção: 12vh de uma TV são 12 de 100 partes da altura.
 */
/*
 * D20 — "melhore as zonas também, hoje está uma visualização um pouco
 * amadora". Com `cfg`, cada zona mostra o que de fato passa nela: a peça
 * desenhada no tamanho real da zona (o mesmo desenhista da TV), a foto, ou
 * o tipo de conteúdo; zona vazia fica tracejada, com o "+". O nome e o
 * resumo viram uma etiqueta discreta por cima. E o botão de IA volta para
 * dentro da zona (`onIA`): criar para ESTA parte da TV, sem procurar onde.
 *
 * resumo(zona) diz o que gira ali, em poucas palavras ("3 peças", "letreiro").
 * `ativa` é a zona aberta embaixo.
 */
function primeiroDa(cfg, z) {
  const d = (cfg && cfg.zonas && cfg.zonas[z.id]) || {};
  if (z.type === 'header' || z.type === 'ticker') return pecasDaFaixa(d)[0] || null;
  return (Array.isArray(d.items) ? d.items : [])[0] || null;
}

function Conteudo({ item, tamanho }) {
  if (!item) return null;
  if (item.type === 'peca-html' && tamanho) {
    return <PecaHtml item={item} tamanho={tamanho} className="!h-full !w-full !rounded-none !ring-0" />;
  }
  if ((item.type === 'image' || item.type === 'imagem') && item.src) {
    return <img src={item.src} alt="" className="h-full w-full object-cover" loading="lazy" />;
  }
  return null;
}

export function MapaDaTela({ layout, ativa, onEscolher, resumo, cfg, onIA }) {
  const tamanhos = useMemo(() => (cfg ? tamanhosDasZonas(layout) : {}), [layout, !!cfg]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!layout) return null;
  const emPe = (layout.orientation || '') === 'portrait';
  return (
    <div className={cn('mx-auto w-full', emPe ? 'max-w-[15rem]' : 'max-w-2xl')}>
      <div role="group" aria-label="As zonas desta TV"
        className="grid gap-[3px] rounded-xl bg-[#0b0f17] p-[5px] shadow-md ring-1 ring-black/40"
        style={{ aspectRatio: proporcaoDoLayout(layout), ...gradeDaMiniatura(layout) }}>
        {layout.zones.map((z) => {
          const sel = ativa === z.id;
          const r = resumo ? resumo(z) : '';
          const item = cfg ? primeiroDa(cfg, z) : null;
          const faixa = z.type === 'header' || z.type === 'ticker';
          const vazia = cfg && !item && !faixa;
          const nome = z.name.replace(/\s*\(.*\)$/, '');
          return (
            <div key={z.id} className="group relative min-h-0 min-w-0" style={{ gridArea: z.area || undefined }}>
              <button type="button" onClick={() => onEscolher(z)} aria-pressed={sel} aria-label={nome + (r ? ' — ' + r : '')}
                className={cn('absolute inset-0 overflow-hidden rounded-md text-left transition',
                  cfg ? 'bg-[#141a26]' : (sel ? 'bg-accent text-accent-fg' : 'bg-surface text-ink hover:bg-accent-soft'),
                  vazia && 'border border-dashed border-white/20 bg-transparent',
                  cfg && (sel ? 'ring-2 ring-accent ring-offset-1 ring-offset-[#0b0f17]' : 'ring-1 ring-white/10 hover:ring-white/40'))}>
                {cfg ? (
                  <>
                    <span className="pointer-events-none absolute inset-0"><Conteudo item={item} tamanho={tamanhos[z.id]} /></span>
                    {vazia && <span className="absolute inset-0 flex items-center justify-center text-white/50"><Plus size={faixa ? 12 : 18} /></span>}
                    <span className={cn('pointer-events-none absolute left-1 max-w-[calc(100%-0.5rem)] truncate rounded px-1.5 py-0.5 text-[10px] font-semibold leading-tight backdrop-blur',
                      faixa ? 'top-1/2 -translate-y-1/2' : 'bottom-1',
                      sel ? 'bg-accent text-accent-fg' : 'bg-black/65 text-white')}>
                      {nome}{r && !faixa ? <span className="font-normal opacity-80"> · {r}</span> : null}
                    </span>
                  </>
                ) : (
                  <span className="flex h-full flex-col items-center justify-center px-1 text-center">
                    <span className="max-w-full truncate text-2xs font-semibold leading-tight sm:text-xs">{nome}</span>
                    {r && <span className={cn('max-w-full truncate text-[10px] leading-tight', sel ? 'text-accent-fg/80' : 'text-ink-3')}>{r}</span>}
                  </span>
                )}
              </button>
              {onIA && (
                <button type="button" onClick={() => onIA(z)} aria-label={'Criar com a IA para ' + nome.toLowerCase()} title="Criar com a IA para esta parte da TV"
                  className={cn('absolute right-1 z-10 inline-flex items-center gap-1 rounded-md bg-accent px-1.5 py-0.5 text-[10px] font-semibold text-accent-fg shadow transition',
                    faixa ? 'top-1/2 -translate-y-1/2' : 'top-1',
                    sel || vazia ? 'opacity-100' : 'pointer-events-none opacity-0 focus:opacity-100 group-hover:pointer-events-auto group-hover:opacity-100')}>
                  <Sparkles size={11} /> IA
                </button>
              )}
            </div>
          );
        })}
      </div>
      <p className="mt-1.5 text-center text-2xs text-ink-3">
        Toque numa parte da TV para ver e mudar o que passa ali{onIA ? '; o botão IA cria só para ela' : ''}.
      </p>
    </div>
  );
}
