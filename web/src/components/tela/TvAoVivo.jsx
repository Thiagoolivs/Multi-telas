import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Clock } from 'lucide-react';
import '../../../../js/templates.js';
import { paginaDaTv, configDaPrevia, tamanhoDaTv } from '../../lib/tvAoVivo.js';
import { perfilAtual } from '../../lib/perfil.js';
import { contagensDasPartes } from '../../lib/tela.js';
import { cn } from '../../lib/cn.js';
import { useIndicadores, temKpiAoVivo, indicadoresParaATv } from '../../lib/kpiAoVivo.js';

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

/*
 * `contagem`: a linha "Meio: peça 2 de 6" embaixo da TV; a miniatura do
 * cartão (sem espaço embaixo) passa false. `apagada` (a TV fora do ar) deixa
 * só a imagem cinza — a linha de baixo e o `selo` ("Última imagem · …")
 * continuam legíveis.
 */
export function TvAoVivo({ cfg, estado, foco, alturaMaxima, leve = false, onParte, parteAtiva, className, rotulo, contagem = true, apagada = false, selo = '' }) {
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

  // O cartão ao vivo do indicador (reteste 4): o número vem da conta, como na TV (a prévia não busca nada sozinha).
  const indicadores = useIndicadores(useMemo(() => temKpiAoVivo(cfg), [cfg]));

  useEffect(() => {
    if (!pronto || !previa) return undefined;
    const w = quadro.current && quadro.current.contentWindow;
    if (!w || !w.MTPrevia) { setFalhou(true); return undefined; }
    if (indicadores) { try { w.MT_KPIS = indicadoresParaATv(indicadores); } catch (e) { /* o quadro de outra origem não deixa */ } }
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
  }, [pronto, previa, indicadores]); // eslint-disable-line react-hooks/exhaustive-deps

  const maxAltura = alturaMaxima || (typeof window !== 'undefined' ? window.innerHeight * 0.62 : 600);
  const escala = largura ? Math.min(largura / W, maxAltura / H) : 0;
  const contou = (estado && estado.zonas) || {};
  const antigo = Object.values(contou).some((z) => z && z.antigo);
  const contagens = contagensDasPartes(partes, layout, cfg, foco, contou);

  return (
    <div ref={caixa} className={cn('w-full', className)}>
      {escala > 0 && (
        <div className="relative mx-auto" style={{ width: W * escala }}>
          <div className={cn('relative overflow-hidden rounded-lg bg-[#05070d] shadow-md ring-1 ring-black/20', apagada && 'opacity-50 grayscale')}
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
          {/* De quando é a imagem (MiniaturaDaTela): fora do cinza da TV apagada, para ler sempre. */}
          {selo && <span className="absolute bottom-2 right-2 rounded-full bg-black/70 px-2 py-0.5 text-xs font-medium text-white">{selo}</span>}
        </div>
      )}
      {/*
        Quantas peças giram em cada parte ("Meio: peça 2 de 6"), EMBAIXO da
        TV (reteste 3): os selos ficavam por cima da imagem, em toda prévia,
        e cobriam justo o canto da peça. Fora dela, com o nome da parte.
      */}
      {escala > 0 && contagem && contagens.length > 0 && (
        <p className="tnum mt-1.5 flex flex-wrap justify-center gap-x-3 gap-y-0.5 text-center text-2xs text-ink-3">
          {contagens.map((c) => <span key={c.id}>{c.nome}: peça {c.posicao} de {c.total}</span>)}
        </p>
      )}
    </div>
  );
}

