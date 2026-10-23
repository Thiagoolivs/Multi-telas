import React, { useMemo } from 'react';
import '../../lib/fundoDaTV.js';
import { gradeDaMiniatura, proporcaoDoLayout, pecasDaFaixa, tamanhosDasZonas } from '../../lib/tela.js';
import { PecaHtml } from '../content/PecaHtml.jsx';
import { Conteudo, primeiroDa } from './MapaDaTela.jsx';
import { cn } from '../../lib/cn.js';

/*
 * A TV COMO VAI FICAR (EXECUTOR D28): o layout, as cores e o fundo de verdade
 * (a mesma conta do player, js/theme.js), o cabeçalho com ou sem relógio e
 * clima, e a primeira peça de cada zona. É o "antes e depois" de mudar a
 * tela com a IA — só para ver, sem clique.
 */
const rgba = (triplo, a) => 'rgba(' + (triplo || '255,255,255') + ',' + (a == null ? 0.5 : a) + ')';

// O texto do selo na cor da marca: branco onde se lê, escuro onde não.
const sobreMarca = (t) => { const T = globalThis.MTTheme; return T && T.contraste(t.brand, '#ffffff') < 3 ? '#0b1020' : '#ffffff'; };

function Cabecalho({ s, d, t }) {
  return (
    <div className="flex h-full items-center justify-between gap-2 px-[4%]" style={{ color: t.text }}>
      <span className="flex min-w-0 items-center gap-1.5">
        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: t.brand }} />
        <span className="truncate text-[10px] font-bold">{s.titulo || s.nome || 'Sua empresa'}</span>
      </span>
      <span className="flex shrink-0 items-center gap-1.5 text-[9px]">
        {d.clima !== false && <span className="rounded-full px-1.5 py-px" style={{ background: rgba(t.surface, 0.35), color: t.textDim }}>24°C · {(s.cidadeClima || 'São Paulo').split(' ')[0]}</span>}
        {d.relogio !== false && <span className="font-bold tabular-nums">10:42</span>}
      </span>
    </div>
  );
}

function Rodape({ d, t, relogioEmCima }) {
  return (
    <div className="flex h-full items-center gap-1.5 px-[2%] text-[9px]" style={{ background: rgba(t.surface, t.glass), color: t.text }}>
      <span className="shrink-0 rounded px-1 py-px font-bold uppercase" style={{ background: t.brand, color: sobreMarca(t) }}>{(d.titulo || 'Últimas notícias').slice(0, 18)}</span>
      <span className="min-w-0 flex-1 truncate" style={{ color: t.textDim }}>As manchetes e os avisos passam aqui</span>
      {d.mostrarRelogio !== false && !relogioEmCima && <span className="shrink-0 font-bold tabular-nums">10:42</span>}
    </div>
  );
}

export function PreviaDaTela({ cfg, rotulo, className }) {
  const s = (cfg && cfg.settings) || {};
  const layout = globalThis.MT_getLayout ? globalThis.MT_getLayout(s.layoutId) : null;
  const T = globalThis.MTTheme;
  const t = useMemo(() => (T ? T.resolve(s.theme || {}, { pecas: T.pecasDaConfig(cfg || {}) }) : null), [cfg]); // eslint-disable-line react-hooks/exhaustive-deps
  const tamanhos = useMemo(() => tamanhosDasZonas(layout), [layout]);
  if (!layout || !t) return null;
  const emPe = (layout.orientation || '') === 'portrait';
  const cab = layout.zones.find((z) => z.type === 'header');
  const dCab = (cab && cfg.zonas && cfg.zonas[cab.id]) || {};
  const relogioEmCima = !!cab && !pecasDaFaixa(dCab).length && dCab.relogio !== false;
  return (
    <figure className={cn('m-0', className)}>
      {rotulo && <figcaption className="mb-1 text-2xs font-semibold uppercase tracking-wide text-ink-3">{rotulo}</figcaption>}
      <div className={cn('mx-auto w-full', emPe ? 'max-w-[11rem]' : '')}>
        <div className="grid gap-[3px] overflow-hidden rounded-lg p-[4px] shadow-md ring-1 ring-black/30" aria-hidden="true"
          style={{ aspectRatio: proporcaoDoLayout(layout), ...gradeDaMiniatura(layout, { minimo: false }), background: 'linear-gradient(135deg, ' + t.bg + ', ' + t.bg2 + ')' }}>
          {layout.zones.map((z) => {
            const d = (cfg.zonas && cfg.zonas[z.id]) || {};
            const faixa = z.type === 'header' || z.type === 'ticker';
            const peca = faixa ? pecasDaFaixa(d)[0] : null;
            const item = faixa ? null : primeiroDa(cfg, z);
            return (
              <div key={z.id} className="relative min-h-0 min-w-0 overflow-hidden rounded-[5px]" style={{ gridArea: z.area || undefined,
                background: faixa ? 'transparent' : rgba(t.surface, Math.max(0.12, Math.min(0.6, t.glass))), border: faixa ? 'none' : '1px solid ' + t.border }}>
                {/* Por cima, fora do fluxo: o conteúdo não estica a linha da grade. */}
                <span className="absolute inset-0">
                  {peca ? <PecaHtml item={peca} tamanho={tamanhos[z.id]} className="!h-full !w-full !rounded-none !ring-0" />
                    : z.type === 'header' ? <Cabecalho s={s} d={d} t={t} />
                    : z.type === 'ticker' ? <Rodape d={d} t={t} relogioEmCima={relogioEmCima} />
                    : <Conteudo item={item} tamanho={tamanhos[z.id]} />}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </figure>
  );
}
