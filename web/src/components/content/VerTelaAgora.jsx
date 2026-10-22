import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { RefreshCw, Clock } from 'lucide-react';
import '../../../../js/templates.js';
import { Dialog } from '../ui/Dialog.jsx';
import { Button } from '../ui/Button.jsx';
import { Spinner } from '../ui/Feedback.jsx';
import { PecaHtml } from './PecaHtml.jsx';
import { Body } from './ItemPreview.jsx';
import { telaAgora } from '../../api.js';

/*
 * "VER A TELA AGORA" (EXECUTOR, item 9).
 *
 * O dono quer saber o que a TV da loja está mostrando sem ir até ela. Um
 * navegador não fotografa a própria tela (e vídeo e YouTube nem se deixam
 * desenhar num canvas), então a TV manda o ESTADO — layout, e o item no ar em
 * cada zona — e o painel desenha com o mesmo desenhista das prévias. O
 * servidor confere cada item contra a programação salva (server/ver-tela.js):
 * item que ninguém salvou vira o aviso de "programação antiga".
 *
 * A resposta chega em ~1s pelo tempo real; com ele caído, pelo pulso da TV,
 * que bate a cada 30s. Por isso a espera é longa e diz o porquê.
 */
const ESPERA_MS = 40000;
const PASSO_MS = 800;
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

export function VerTelaAgora({ target, onClose }) {
  const [fase, setFase] = useState('');
  const [resposta, setResposta] = useState(null);
  const [esperando, setEsperando] = useState(0);
  const pedido = useRef(0);

  async function ver() {
    if (!target) return;
    const meu = ++pedido.current;
    const vivo = () => pedido.current === meu;
    setFase('pedindo'); setEsperando(0);
    let antes = { em: 0 };
    try { antes = await telaAgora.ler(target.id); } catch (e) { /* sem resposta anterior */ }
    if (!vivo()) return;
    if (antes && antes.estado) setResposta(antes);
    try { await telaAgora.pedir(target.id); }
    catch (e) { if (vivo()) setFase('erro'); return; }
    const inicio = Date.now();
    while (vivo() && Date.now() - inicio < ESPERA_MS) {
      await dormir(PASSO_MS);
      if (!vivo()) return;
      setEsperando(Date.now() - inicio);
      let r = null;
      try { r = await telaAgora.ler(target.id); } catch (e) { r = null; }
      if (r && r.estado && r.em > (antes.em || 0)) { setResposta(r); setFase('ok'); return; }
    }
    if (vivo()) setFase('sem-resposta');
  }

  useEffect(() => {
    setResposta(null);
    if (target) ver();
    return () => { pedido.current++; };
  }, [target && target.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const quando = resposta && resposta.em
    ? new Date(resposta.em).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '';

  return (
    <Dialog open={!!target} onClose={onClose} className="max-w-3xl"
      title={'Agora na TV · ' + ((target && target.name) || 'Tela')}
      description="O que a TV está mostrando neste instante, desenhado aqui no painel."
      footer={<>
        <span className="mr-auto text-2xs text-ink-3">
          {fase === 'pedindo' && (esperando < 6000 ? 'Perguntando à TV…'
            : 'A TV ainda não respondeu. Sem o tempo real, ela responde no próximo pulso, em até 30 segundos.')}
          {fase === 'ok' && 'Visto às ' + quando}
          {fase === 'sem-resposta' && (resposta ? 'A TV não respondeu. Esta é a última vez que ela respondeu, às ' + quando + '.'
            : 'A TV não respondeu. Ela está ligada e com internet?')}
          {fase === 'erro' && 'Não consegui mandar o pedido. Confira a sua internet.'}
        </span>
        <Button size="sm" variant="secondary" icon={RefreshCw} onClick={ver} disabled={fase === 'pedindo'}>Ver de novo</Button>
      </>}
    >
      <div className="relative">
        {resposta && resposta.estado
          ? <Palco estado={resposta.estado} em={resposta.em} />
          : <div className="flex aspect-video w-full items-center justify-center rounded-lg border border-line bg-surface-2 text-xs text-ink-3">
              {fase === 'pedindo' ? <Spinner /> : 'Sem resposta da TV ainda.'}
            </div>}
        {fase === 'pedindo' && resposta && (
          <span className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-full bg-black/60 px-2 py-0.5 text-2xs text-white">
            <Spinner size={10} /> atualizando
          </span>
        )}
      </div>
    </Dialog>
  );
}

/*
 * O desenho da TV: a grade do layout no tamanho do painel. As medidas em vh/vw
 * do layout viram px pelo tamanho que a TV contou; a peça em HTML é desenhada
 * no tamanho da zona COMO NA TV (base 1080p, js/render.js hostDaPeca) e
 * reduzida — senão cairia em outra regra de container e mostraria outro layout.
 */
function Palco({ estado, em }) {
  const hora = em ? new Date(em).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '';
  const caixa = useRef(null);
  const [largura, setLargura] = useState(0);
  const tw = estado.tela && estado.tela.w > 0 ? estado.tela.w : 1920;
  const th = estado.tela && estado.tela.h > 0 ? estado.tela.h : 1080;
  // Base 1080p no lado menor: o mesmo tamanho de desenho da TV.
  const base = 1080 / Math.min(tw, th);
  const W = Math.round(tw * base), H = Math.round(th * base);
  const emPe = H > W;

  useLayoutEffect(() => {
    const el = caixa.current;
    if (!el) return undefined;
    const medir = () => setLargura(el.clientWidth);
    medir();
    const ro = new ResizeObserver(medir);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // TV em pé não pode passar da altura da janela.
  const maxAltura = typeof window !== 'undefined' ? window.innerHeight * 0.62 : 600;
  const escala = largura ? Math.min(largura / W, emPe ? maxAltura / H : Infinity) : 0;
  const layout = (globalThis.MT_getLayout && globalThis.MT_getLayout(estado.layoutId)) || null;
  const px = (v) => String(v || '').replace(/(-?[\d.]+)v([hw])/g, (_, n, u) => (Number(n) * (u === 'h' ? H : W) / 100 * escala).toFixed(2) + 'px');
  const m = Number(estado.margem) || 0;

  return (
    <div ref={caixa} className="w-full">
      {escala > 0 && layout && (
        <div className="relative mx-auto overflow-hidden rounded-lg bg-[#05070d]"
          style={{
            width: W * escala, height: H * escala, display: 'grid',
            gridTemplateColumns: px(layout.grid.columns), gridTemplateRows: px(layout.grid.rows),
            gridTemplateAreas: layout.grid.areas.map((r) => '"' + r + '"').join(' '),
            gap: 0.011 * H * escala,
            padding: ((0.011 + m / 100) * H * escala) + 'px ' + ((0.011 * H + m / 100 * W) * escala) + 'px',
          }}>
          {layout.zones.map((z) => (
            <Zona key={z.id} zona={z} dados={(estado.zonas || {})[z.id] || {}} escala={escala} hora={hora} />
          ))}
          {estado.foraDoHorario && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-black text-white">
              {estado.foraDoHorario === 'relogio' && <Clock size={28} className="opacity-70" />}
              <span className="text-xs opacity-70">
                {estado.foraDoHorario === 'relogio' ? 'Fora do horário: a TV mostra só o relógio' : 'Fora do horário: a TV está preta'}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Zona({ zona, dados, escala, hora }) {
  const el = useRef(null);
  const [tam, setTam] = useState(null);
  useLayoutEffect(() => {
    const c = el.current;
    if (!c) return undefined;
    const medir = () => setTam([Math.max(1, Math.round(c.clientWidth / escala)), Math.max(1, Math.round(c.clientHeight / escala))]);
    medir();
    const ro = new ResizeObserver(medir);
    ro.observe(c);
    return () => ro.disconnect();
  }, [escala]);

  // Cabeçalho e rodapé também podem ser peça (PLANO §4.7): `dados.peca`.
  const peca = dados.item && dados.item.type === 'peca-html' ? dados.item
    : dados.peca && dados.peca.type === 'peca-html' ? dados.peca : null;
  let corpo;
  if (peca) corpo = tam && <PecaHtml item={peca} tamanho={tam} fitHeight className="!rounded-none !ring-0" />;
  else if (dados.esperando) {
    // A TV mostra a zona preta, pulsando: nada publicado ali (item 39).
    corpo = <div className="flex h-full w-full items-center justify-center bg-black"><span className="h-3 w-3 animate-pulse rounded-full bg-white/40" /></div>;
  } else if (dados.antigo) {
    corpo = <Aviso>Esta TV está com uma programação antiga. Toque em “Recarregar a TV”.</Aviso>;
  } else if (dados.item) {
    corpo = tam && (
      <EmEscala tam={tam} escala={escala}>
        <div className="flex h-full w-full flex-col items-center justify-center overflow-hidden bg-[#0a1128] p-2 text-center text-white">
          <Body item={dados.item} />
        </div>
      </EmEscala>
    );
  } else if (zona.type === 'ticker') {
    const texto = (dados.mensagens || []).map((x) => (typeof x === 'string' ? x : (x && (x.text || x.texto)) || '')).filter(Boolean).join('  •  ');
    corpo = tam && (
      <EmEscala tam={tam} escala={escala}>
        <div className="flex h-full items-center overflow-hidden whitespace-nowrap bg-[#0a1128] px-3 font-semibold text-white/85" style={{ fontSize: tam[1] / ESCALA_DO_RESUMO * 0.32 }}>{texto || 'Faixa de notícias e data'}</div>
      </EmEscala>
    );
  } else if (zona.type === 'header') {
    corpo = tam && (
      <EmEscala tam={tam} escala={escala}>
        <div className="flex h-full items-center justify-between gap-2 bg-[#0a1128] px-3 font-semibold text-white" style={{ fontSize: tam[1] / ESCALA_DO_RESUMO * 0.3 }}>
          {/* O cabeçalho da TV é desenhado por ela (marca, clima, hora): aqui, só o que ele é. */}
          <span className="truncate">Cabeçalho da loja</span><span className="tnum opacity-80">{hora}</span>
        </div>
      </EmEscala>
    );
  } else {
    corpo = <Aviso><Clock size={14} className="mx-auto mb-1 opacity-70" />Relógio (zona sem conteúdo)</Aviso>;
  }

  return (
    <div ref={el} className="relative min-h-0 min-w-0 overflow-hidden rounded-[3px]" style={{ gridArea: zona.area }}>
      {corpo}
      {dados.total > 1 && (
        <span className="tnum absolute bottom-1 right-1 rounded bg-black/60 px-1 text-[9px] text-white">{dados.posicao} de {dados.total}</span>
      )}
    </div>
  );
}

/*
 * Item que não é peça (texto, imagem, preço…) tem só o resumo das prévias
 * (ItemPreview.jsx), feito para caixas de ~640px. Desenhado direto na zona,
 * no celular o título estourava a lateral. Aqui o resumo é montado numa TV
 * de 640px de largura e reduzido junto com o resto: a proporção é a mesma em
 * qualquer tela do painel.
 */
const ESCALA_DO_RESUMO = 3; // 1920 / 640
function EmEscala({ tam, escala, children }) {
  const k = escala * ESCALA_DO_RESUMO;
  return (
    <div style={{ position: 'absolute', left: 0, top: 0, width: tam[0] / ESCALA_DO_RESUMO, height: tam[1] / ESCALA_DO_RESUMO,
      transform: 'scale(' + k + ')', transformOrigin: '0 0' }}>
      {children}
    </div>
  );
}

function Aviso({ children }) {
  return <div className="flex h-full w-full flex-col items-center justify-center bg-[#0a1128] p-2 text-center text-[10px] leading-snug text-white/70">{children}</div>;
}
