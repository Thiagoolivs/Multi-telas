/*
 * O desenhista das peças em HTML no painel (PLANO §4.6).
 *
 * É o MESMO arquivo da TV e da bancada (js/peca-render.js), carregado de
 * /js em tempo de execução — não uma cópia empacotada no painel. Se cada
 * lugar desenhasse a peça do seu jeito, um dia o celular mostraria uma coisa
 * e a parede outra. Os scripts são do próprio servidor, então a CSP
 * (script-src 'self') aceita.
 */
const SCRIPTS = ['/js/cor.js', '/js/fontes.js', '/js/animacao.js', '/js/tokens.js', '/js/peca-html.js', '/js/peca-render.js', '/js/peca-conferir.js'];

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
export const TAMANHO_REAL = {
  '16/9': [1920, 1080], '9/16': [1080, 1920], '1/1': [1080, 1080], '21/9': [2520, 1080], '4/5': [1080, 1350],
  // As faixas do layout Corporativo em 1080p (as mesmas medidas da bancada).
  cabecalho: [1920, 130], rodape: [1920, 119],
};

export const NOME_DO_FORMATO = { '16/9': 'TV deitada', '9/16': 'TV em pé', '1/1': 'tela quadrada' };

/*
 * A peça cabe nos três formatos? A mesma peça vai para TV deitada e em pé,
 * então o texto que o cliente digita é conferido nos três, em tamanho real,
 * fora da vista — com o mesmo detector da bancada (js/peca-conferir.js).
 *
 * `formatos`: os nomes de TAMANHO_REAL, ou { nome: [largura, altura] } —
 * a zona de uma tela pronta (D18), onde a peça vai de fato.
 */
export async function conferirNosFormatos(item, formatos) {
  const R = await carregarDesenhista();
  const caixa = document.createElement('div');
  caixa.style.cssText = 'position:fixed;left:0;top:0;width:0;height:0;overflow:visible;opacity:0;pointer-events:none;z-index:-1';
  document.body.appendChild(caixa);
  const saida = {};
  try {
    const medidas = formatos && !Array.isArray(formatos) ? Object.entries(formatos)
      : (formatos || Object.keys(NOME_DO_FORMATO)).map((f) => [f, TAMANHO_REAL[f]]);
    for (const [f, [w, h]] of medidas) {
      const host = document.createElement('div');
      host.style.cssText = 'position:absolute;left:0;top:0;width:' + w + 'px;height:' + h + 'px;container-type:size';
      caixa.appendChild(host);
      const ctl = R.montar(host, item, { leve: true });
      saida[f] = await window.MTPecaConferir.conferir(host);
      ctl.parar();
    }
  } finally { caixa.remove(); }
  return saida;
}
