import React, { useEffect, useRef, useState } from 'react';
import { carregarDesenhista, TAMANHO_REAL } from '../../lib/pecaHtml.js';

/*
 * Peça em HTML no painel: miniatura, prévia da campanha e prévia da tela.
 *
 * A peça é desenhada no TAMANHO REAL da TV (1920×1080 deitada) e reduzida
 * com `scale`. Desenhada direto em 300px, ela cairia na regra da lateral
 * (`@container (max-width: 700px)`) e a miniatura mostraria outro layout —
 * o mesmo motivo da bancada e da página de notas fazerem assim.
 *
 * Sem animação (`leve`): miniatura parada no quadro final, que é o que se
 * reconhece numa grade.
 */
export function PecaHtml({ item, formato, fitHeight, className }) {
  const caixa = useRef(null);
  const palco = useRef(null);
  const [escala, setEscala] = useState(0);
  const [erro, setErro] = useState('');
  const [w, h] = TAMANHO_REAL[formato] || TAMANHO_REAL['16/9'];

  useEffect(() => {
    const el = caixa.current;
    if (!el) return undefined;
    const medir = () => {
      const porLargura = el.clientWidth / w;
      const porAltura = el.clientHeight ? el.clientHeight / h : porLargura;
      setEscala(Math.min(porLargura, porAltura));
    };
    medir();
    const ro = new ResizeObserver(medir);
    ro.observe(el);
    return () => ro.disconnect();
  }, [w, h]);

  useEffect(() => {
    let vivo = true;
    let ctl = null;
    carregarDesenhista()
      .then((R) => {
        if (!vivo || !palco.current) return;
        ctl = R.montar(palco.current, item, { leve: true, marcaNaTela: false, clima: () => Promise.resolve('') });
        setErro('');
      })
      .catch((e) => { if (vivo) setErro(e.message || 'não desenhou'); });
    return () => { vivo = false; if (ctl) ctl.parar(); };
  }, [item]);

  const proporcao = { aspectRatio: w + ' / ' + h };
  return (
    <div ref={caixa}
      className={'relative overflow-hidden rounded-md border border-line bg-[#0a1020] ' + (fitHeight ? '' : 'w-full ') + (className || '')}
      style={fitHeight ? { ...proporcao, height: '100%', width: 'auto', maxWidth: '100%' } : proporcao}>
      <div ref={palco}
        style={{ position: 'absolute', left: 0, top: 0, width: w, height: h, transformOrigin: '0 0',
          transform: 'scale(' + escala + ')', containerType: 'size', visibility: escala ? 'visible' : 'hidden' }} />
      {erro && <div className="absolute inset-0 flex items-center justify-center text-2xs text-ink-3">{erro}</div>}
    </div>
  );
}
