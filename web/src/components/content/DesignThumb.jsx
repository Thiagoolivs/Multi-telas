import React from 'react';
import { fillToCss, shapeClip, SHAPE_POLY, textFontCqw, estiloCaixa, raioCss } from '../../lib/composition.js';
import { ICONS } from '../../lib/icons.js';
import { estiloTexto, carregarDaComposicao } from '../../lib/fontes.js';

/*
 * Miniatura fiel de um design (composição). Usada no hub "Meus Designs", na
 * prévia de campanhas e na galeria de modelos.
 *
 * O corpo do texto tinha um PISO de 6px, para não sumir em miniatura pequena.
 * O efeito era o contrário do que a miniatura promete: num cartão de 115px,
 * um texto de apoio pedia 2px, era subido para 6px, e passava a não caber na
 * própria caixa — a miniatura mostrava o texto cortado numa peça que na TV
 * está perfeita. Sem o piso, o texto pequeno fica pequeno, que é o que ele é.
 */
export function DesignThumb({ item, fitHeight }) {
  const it = item || {};
  const formato = it.formato || '16/9';
  // fitHeight: encaixa pela altura (grid uniforme quando os formatos variam).
  const ar = fitHeight
    ? { aspectRatio: formato.replace('/', ' / '), height: '100%', width: 'auto', maxWidth: '100%' }
    : { aspectRatio: formato.replace('/', ' / ') };

  // Item que não é composição (imagem/vídeo/pptx importados): mostra direto.
  if (it.type && it.type !== 'composicao') {
    if ((it.type === 'image' || it.type === 'video') && it.src) {
      return (
        <div className={'relative overflow-hidden rounded-md border border-line bg-[#0a1020] ' + (fitHeight ? '' : 'w-full')} style={ar}>
          {it.type === 'video'
            ? <video src={it.src} muted loop className="h-full w-full object-cover" />
            : <img src={it.src} alt="" className="h-full w-full object-cover" />}
        </div>
      );
    }
    return (
      <div className={'flex items-center justify-center rounded-md border border-line bg-[#0a1020] text-2xs text-ink-3 ' + (fitHeight ? '' : 'w-full')} style={ar}>
        {it.type === 'pptx' ? 'Apresentação/PDF' : it.type}
      </div>
    );
  }

  const b = it.bg || {};
  const bg = b.kind === 'imagem' && b.src ? { backgroundImage: `url("${b.src}")`, backgroundSize: 'cover', backgroundPosition: 'center' }
    : b.kind === 'cor' ? { background: b.cor } : { background: '#0a1020' };
  const els = (it.elementos || []).slice().sort((a, c) => (a.z || 0) - (c.z || 0));
  carregarDaComposicao(els);
  return (
    /*
     * `containerType` não é enfeite: o corpo do texto é medido em cqw, que é
     * % da largura do CONTÊINER. Sem declarar um aqui, a unidade caía na
     * largura da JANELA — e a miniatura desenhava letras gigantes, cortadas,
     * que não pareciam nem de longe a peça que a pessoa tinha feito.
     */
    <div className={'relative overflow-hidden rounded-md border border-line ' + (fitHeight ? '' : 'w-full')}
      style={{ ...ar, ...bg, containerType: 'inline-size' }}>
      {els.map((e, i) => (
        <div key={i} style={{ position: 'absolute', left: e.x + '%', top: e.y + '%', width: e.w + '%', height: e.h + '%', transform: `rotate(${e.rot || 0}deg)`, overflow: 'hidden' }}>
          {e.tipo === 'texto'
            ? <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', ...estiloTexto(e), ...estiloCaixa(e), fontSize: 'min(' + textFontCqw(e, formato) + 'cqw, 60px)', whiteSpace: 'pre-wrap' }}>{e.text}</div>
            : e.tipo === 'icone'
              ? <svg viewBox="0 0 24 24" fill="none" stroke={e.cor || '#fff'} strokeWidth={e.peso || 1.6} strokeLinecap="round" strokeLinejoin="round" style={{ width: '100%', height: '100%', opacity: e.opacidade != null ? e.opacidade : 1, ...estiloCaixa(e) }} dangerouslySetInnerHTML={{ __html: ICONS[e.name] || ICONS.star }} />
            : e.tipo === 'forma'
              ? <div style={{ width: '100%', height: '100%', background: fillToCss(e.fill), borderRadius: e.shape === 'ellipse' ? '50%' : (SHAPE_POLY[e.shape] ? 0 : raioCss(e)), clipPath: SHAPE_POLY[e.shape] ? shapeClip(e.shape) : 'none', ...estiloCaixa(e) }} />
              : <img src={e.src} alt="" style={{ width: '100%', height: '100%', objectFit: e.fit || 'contain', borderRadius: raioCss(e), ...estiloCaixa(e) }} />}
        </div>
      ))}
    </div>
  );
}
