/*
 * O desenhista das peças em HTML no painel (PLANO §4.6).
 *
 * É o MESMO arquivo da TV e da bancada (js/peca-render.js), carregado de
 * /js em tempo de execução — não uma cópia empacotada no painel. Se cada
 * lugar desenhasse a peça do seu jeito, um dia o celular mostraria uma coisa
 * e a parede outra. Os scripts são do próprio servidor, então a CSP
 * (script-src 'self') aceita.
 */
const SCRIPTS = ['/js/cor.js', '/js/fontes.js', '/js/animacao.js', '/js/tokens.js', '/js/peca-html.js', '/js/peca-render.js'];

let carregando = null;

function script(src) {
  return new Promise((ok, falha) => {
    const s = document.createElement('script');
    s.src = src;
    s.async = false; // a ordem importa: cada um usa o global do anterior
    s.onload = ok;
    s.onerror = () => falha(new Error('não carregou ' + src));
    document.head.appendChild(s);
  });
}

export function carregarDesenhista() {
  if (window.MTPecaRender && window.MTPecaHtml) return Promise.resolve(window.MTPecaRender);
  if (!carregando) {
    carregando = SCRIPTS.reduce((p, src) => p.then(() => script(src)), Promise.resolve())
      .then(() => window.MTPecaRender)
      .catch((e) => { carregando = null; throw e; });
  }
  return carregando;
}

// O tamanho real da TV em cada formato: a peça decide o layout pelo tamanho
// do contêiner (@container), então ela é desenhada assim e só depois reduzida.
export const TAMANHO_REAL = { '16/9': [1920, 1080], '9/16': [1080, 1920], '1/1': [1080, 1080], '21/9': [2520, 1080], '4/5': [1080, 1350] };
