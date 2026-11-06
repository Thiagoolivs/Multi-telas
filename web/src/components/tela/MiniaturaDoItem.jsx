import React from 'react';
import { Film } from 'lucide-react';
import { ItemPreview } from '../content/ItemPreview.jsx';
import { PecaHtml } from '../content/PecaHtml.jsx';

/*
 * A MINIATURA DA FILA (fase 10, reteste do bloco 8). A prévia de 40 px
 * cortava o texto ("entin", "ome") e a foto virava uma caixa preta: a prévia
 * comum tem 16 px de respiro de cada lado, e sobrava uma fresta de 8 px.
 *
 * Agora: a foto ocupa a miniatura inteira; a peça pronta usa o desenhista da
 * TV; o resto é a prévia comum montada em 320 px e reduzida, como uma foto
 * dela — o texto inteiro, só que pequeno.
 */
const BASE = 320;
export function MiniaturaDoItem({ item, largura = 64 }) {
  const altura = Math.round(largura * 9 / 16);
  const caixa = 'relative shrink-0 overflow-hidden rounded bg-[#0E0B1F] ring-1 ring-line';
  if (!item) return <span className={caixa} style={{ width: largura, height: altura }} />;
  if (item.type === 'image' && item.src) {
    return (
      <span className={caixa} style={{ width: largura, height: altura }} aria-hidden="true">
        <img src={item.src} alt="" loading="lazy" className="h-full w-full object-cover" />
      </span>
    );
  }
  if (item.type === 'video') {
    return (
      <span className={caixa + ' flex items-center justify-center text-white/70'} style={{ width: largura, height: altura }} aria-hidden="true">
        <Film size={16} />
      </span>
    );
  }
  if (item.type === 'peca-html') {
    return <span className="shrink-0" style={{ width: largura }} aria-hidden="true"><PecaHtml item={item} formato="16/9" className="!rounded" /></span>;
  }
  return (
    <span className={caixa} style={{ width: largura, height: altura }} aria-hidden="true">
      <span style={{ position: 'absolute', left: 0, top: 0, width: BASE, transform: 'scale(' + (largura / BASE) + ')', transformOrigin: '0 0' }}>
        <ItemPreview item={item} className="!rounded-none !border-0" />
      </span>
    </span>
  );
}
