import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Clock } from 'lucide-react';
import '../../../../js/templates.js';
import { paginaDaTv, configDaPrevia, tamanhoDaTv } from '../../lib/tvAoVivo.js';
import { perfilAtual } from '../../lib/perfil.js';
import { cn } from '../../lib/cn.js';

/*
 * A TV DE VERDADE, EM MINIATURA (fase 10, reteste do bloco 8).
 *
 * Um quadro com o próprio player dentro (js/player.js no modo prévia), no
 * tamanho da TV (1080 no lado menor) e reduzido para caber. O que aparece
 * aqui é o que a parede mostra: o cabeçalho com a logo, o nome e o relógio
 * nas cores da marca, o rodapé, as zonas vazias juntadas, a letra da TV.
 *
 * `cfg`: a programação (a que está na TV, ou o rascunho).
 * `estado`: o que a TV contou estar no ar (o "Ver a tela agora"); sem ele,
 *   vale o primeiro item de cada parte.
 * `foco`: { zona, indice } — a peça que a pessoa está editando.
 * `leve`: o modo das TVs fracas (sem vidro), para as miniaturas em lista.
 * `onParte`: tocar numa parte da TV escolhe a parte (a página da TV).
 */

// A versão do painel vai no endereço dos arquivos do player: painel novo, player novo.
const VERSAO = (() => {
  try {
    const s = document.querySelector('script[type="module"][src*="/app/assets/index-"]');
    const m = s && /index-([\w-]+)\.js/.exec(s.getAttribute('src') || '');
    if (m) return m[1];
  } catch (e) { /* sem documento */ }
  return String(Date.now());
})();

export function TvAoVivo({ cfg, estado, foco, alturaMaxima, leve = false, onParte, parteAtiva, className, rotulo }) {
  const caixa = useRef(null);
  const quadro = useRef(null);
  const [largura, setLargura] = useState(0);
  const [visivel, setVisivel] = useState(false);
  const [pronto, setPronto] = useState(false);
  const [partes, setPartes] = useState([]);
  const [falhou, setFalhou] = useState(false);

  const layoutId = cfg && cfg.settings && cfg.settings.layoutId;
  const layout = (globalThis.MT_getLayout && globalThis.MT_getLayout(layoutId)) || null;
  const [W, H] = tamanhoDaTv(estado, layout);

  useLayoutEffect(() => {
    const el = caixa.current;
    if (!el) return undefined;
    const medir = () => setLargura(el.clientWidth);
    medir();
    const ro = new ResizeObserver(medir);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Só monta o quadro quando aparece na tela: a lista de TVs não abre 20 players de uma vez.
  useEffect(() => {
    const el = caixa.current;
    if (!el || visivel) return undefined;
    if (typeof IntersectionObserver === 'undefined') { setVisivel(true); return undefined; }
    const io = new IntersectionObserver((v) => { if (v.some((x) => x.isIntersecting)) setVisivel(true); }, { rootMargin: '200px' });
    io.observe(el);
    return () => io.disconnect();
  }, [visivel]);

  const pagina = useMemo(() => paginaDaTv({ leve, versao: VERSAO }), [leve]);

  // A programação do quadro muda a cada rascunho; o quadro troca só a parte que mudou, como a TV.
  const previa = useMemo(() => configDaPrevia(cfg, { estado, foco, logo: globalThis.MT_LOGO || null, frente: perfilAtual() }),
    [cfg, estado, foco && foco.zona, foco && foco.indice]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!pronto || !previa) return undefined;
    const w = quadro.current && quadro.current.contentWindow;
    if (!w || !w.MTPrevia) { setFalhou(true); return undefined; }
    let ok = false;
    try { ok = w.MTPrevia.mostrar(JSON.stringify(previa.config), { relogio: previa.relogio }); } catch (e) { ok = false; }
    setFalhou(!ok);
    // As partes da TV, para o toque e o "1 de 6". offset*, e não o retângulo na tela: a entrada animada não atrapalha a medida.
    try {
      const doc = quadro.current && quadro.current.contentDocument;
      const lista = doc ? Array.from(doc.querySelectorAll('#stage > .mt-zone')) : [];
      setPartes(lista.map((el) => {
        const area = String(el.style.gridArea || '').split('/')[0].trim();
        const zona = layout && layout.zones.find((z) => z.area === area);
        return zona ? { id: zona.id, x: el.offsetLeft, y: el.offsetTop, w: el.offsetWidth, h: el.offsetHeight } : null;
      }).filter(Boolean));
    } catch (e) { setPartes([]); }
    return undefined;
  }, [pronto, previa]); // eslint-disable-line react-hooks/exhaustive-deps

  const maxAltura = alturaMaxima || (typeof window !== 'undefined' ? window.innerHeight * 0.62 : 600);
  const escala = largura ? Math.min(largura / W, maxAltura / H) : 0;
  const contou = (estado && estado.zonas) || {};
  const antigo = Object.values(contou).some((z) => z && z.antigo);

  return (
    <div ref={caixa} className={cn('w-full', className)}>
      {escala > 0 && (
        <div className="relative mx-auto overflow-hidden rounded-lg bg-[#05070d] shadow-md ring-1 ring-black/20"
          style={{ width: W * escala, height: H * escala }} role="img" aria-label={rotulo || 'A TV, como ela está agora'}>
          {visivel && (
            <iframe ref={quadro} title={rotulo || 'A TV'} srcDoc={pagina} tabIndex={-1} aria-hidden="true"
              onLoad={() => setPronto(true)}
              style={{ position: 'absolute', left: 0, top: 0, width: W, height: H, border: 0, transform: 'scale(' + escala + ')',
                transformOrigin: '0 0', pointerEvents: 'none', opacity: pronto ? 1 : 0, transition: 'opacity .3s' }} />
          )}
          {/* As partes da TV: o contorno aparece ao passar o mouse, e o toque escolhe a parte. */}
          {onParte && partes.map((p) => (
            <button key={p.id} type="button" onClick={() => onParte(p.id)} aria-label={'Escolher esta parte da TV'}
              className={cn('absolute rounded-md outline-none transition focus-visible:ring-2 focus-visible:ring-accent',
                parteAtiva === p.id ? 'ring-2 ring-accent ring-offset-0' : 'hover:ring-2 hover:ring-white/80')}
              style={{ left: p.x * escala, top: p.y * escala, width: p.w * escala, height: p.h * escala }} />
          ))}
          {/* Quantas peças giram na parte, como "2 de 6". */}
          {partes.map((p) => {
            const f = foco && foco.zona === p.id ? foco : null;
            const z = contou[p.id];
            const total = f ? ((cfg.zonas[p.id] || {}).items || []).length : z && z.total;
            const posicao = f ? f.indice + 1 : z && z.posicao;
            return total > 1 ? (
              <span key={'n' + p.id} className="tnum pointer-events-none absolute rounded bg-black/65 px-1.5 text-2xs font-medium text-white"
                style={{ left: (p.x + p.w) * escala - 6, top: (p.y + p.h) * escala - 6, transform: 'translate(-100%, -100%)' }}>
                {posicao} de {total}
              </span>
            ) : null;
          })}
          {estado && estado.foraDoHorario && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-black text-white">
              {estado.foraDoHorario === 'relogio' && <Clock size={28} className="opacity-70" />}
              <span className="text-xs opacity-80">
                {estado.foraDoHorario === 'relogio' ? 'Fora do horário: a TV mostra só o relógio' : 'Fora do horário: a TV está apagada'}
              </span>
            </div>
          )}
          {antigo && (
            <div className="absolute inset-x-0 bottom-0 bg-black/75 px-3 py-1.5 text-center text-xs text-white">
              A TV está com uma programação antiga. Toque em “Recarregar a TV”.
            </div>
          )}
          {falhou && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/70 px-4 text-center text-xs text-white">
              Não deu para desenhar a TV aqui. Ela continua mostrando o que você pôs.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
