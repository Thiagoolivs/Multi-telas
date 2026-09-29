import React from 'react';
import { arcoTexto } from '../../lib/composition.js';
import { estiloTexto } from '../../lib/fontes.js';
import { svgAtributosGrafico, svgMioloGrafico } from '../../lib/graficos.js';

/*
 * Texto em curva e elemento gráfico — os dois desenhos que o editor, a
 * miniatura de Meus Designs e a prévia da playlist compartilham. Um lugar
 * só: quando a miniatura desenhava por conta própria, o elemento novo virava
 * uma <img> quebrada nela.
 *
 * O arco é o MESMO de js/peca.js que a TV usa. Uma linha só: curva com
 * quebra de linha não se lê.
 */
let seq = 0;
export function TextoCurvo({ el, formato }) {
  const id = React.useMemo(() => 'curva' + (++seq), []);
  const a = arcoTexto(el, formato);
  const s = estiloTexto(el);
  return (
    <svg viewBox={a.viewBox} preserveAspectRatio="none" style={{ width: '100%', height: '100%', overflow: 'visible', pointerEvents: 'none' }}>
      <path id={id} d={a.d} fill="none" />
      <text fill={s.color} fontSize={a.fonte} style={{ fontFamily: s.fontFamily, fontWeight: s.fontWeight, fontStyle: s.fontStyle, letterSpacing: s.letterSpacing, textTransform: s.textTransform }}>
        <textPath href={'#' + id} startOffset="50%" textAnchor="middle">{String(el.text || '').replace(/\s*\n\s*/g, ' ')}</textPath>
      </text>
    </svg>
  );
}

export function GraficoSvg({ el, estilo }) {
  return (
    <svg {...svgAtributosGrafico(el.name)} fill={el.cor || '#ffffff'}
      style={{ width: '100%', height: '100%', display: 'block', pointerEvents: 'none', ...(estilo || {}) }}
      dangerouslySetInnerHTML={{ __html: svgMioloGrafico(el.name) }} />
  );
}
