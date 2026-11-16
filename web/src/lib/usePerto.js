import { useEffect, useState } from 'react';

/*
 * "Este pedaço da página já apareceu (ou está a 200 px de aparecer)?" — para
 * pedir a programação de uma TV só quando o cartão dela aparece (teste de
 * carga, 16/11: a conta de RH com 300 TVs pedia as 300 ao abrir Telas e a
 * Programação, ~31 MB). Uma vez perto, fica perto: rolar de volta não pede
 * de novo.
 *
 * `ativo` falso: não observa (quem chama já tem o que precisa).
 * Devolve [ref, perto] — o ref vai no elemento observado.
 */
export function usePerto(ativo = true, margem = '200px') {
  const [no, setNo] = useState(null);
  const [perto, setPerto] = useState(false);
  useEffect(() => {
    if (perto || !ativo || !no) return undefined;
    if (typeof IntersectionObserver === 'undefined') { setPerto(true); return undefined; }
    const io = new IntersectionObserver((v) => { if (v.some((x) => x.isIntersecting)) setPerto(true); }, { rootMargin: margem });
    io.observe(no);
    return () => io.disconnect();
  }, [no, perto, ativo, margem]);
  return [setNo, perto];
}
