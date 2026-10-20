/*
 * js/peca-conferir.js — a peça cabe? (PLANO §4.8, a régua: "nada pode sair da
 * peça nem ficar por cima de outro texto").
 *
 * UM detector para todo lugar que olha uma peça desenhada: a bancada (onde
 * nasceu), o editor de textos do painel e a revisão da campanha. Se cada um
 * medisse do seu jeito, a bancada aprovaria o que o painel acusa.
 *
 * Mede a peça já montada por js/peca-render.js, num contêiner do TAMANHO REAL
 * da TV — reduzida, ela cairia em outro layout (@container).
 *
 * Módulo duplo: no Node exporta as partes puras, para teste; no navegador,
 * `MTPecaConferir.conferir(host)`.
 */
(function (raiz, fabrica) {
  var api = fabrica();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (raiz) raiz.MTPecaConferir = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  /*
   * Texto em cima de texto: a chamada do cabeçalho em pé passava por baixo
   * da hora ("DOBR04:12") e nada saía da peça — a medida de vazamento não
   * via. Conta como defeito quando um campo cobre mais de um quinto do
   * outro.
   *
   * A medida é a do TEXTO, linha por linha, e não a do elemento: um título em
   * bloco ocupa a largura toda da coluna, e o carimbo ao lado dele seria
   * acusado sem encostar em letra nenhuma. E cada linha vale a altura da
   * LINHA, não a da fonte: com letra enorme e entrelinha justa ("R$ 14" a
   * .78) a caixa da fonte passa por cima do "Tudo por" sem a tinta encostar.
   * Imagem e campo vazio ficam com a caixa do elemento.
   */
  function linhasDoTexto(el, r, escala) {
    if (!el.textContent.trim()) return [r];
    const lh = parseFloat(getComputedStyle(el).lineHeight) * escala;
    const faixa = document.createRange();
    faixa.selectNodeContents(el);
    const linhas = [...faixa.getClientRects()].filter((x) => x.width && x.height).map((x) => {
      const meio = (x.top + x.bottom) / 2;
      const meia = lh && x.height > lh ? lh / 2 : x.height / 2;
      return { left: x.left, right: x.right, top: meio - meia, bottom: meio + meia };
    });
    return linhas.length ? linhas : [r];
  }

  // Duas linhas de texto se cobrem quando a área em comum passa de um quinto da menor.
  const cobre = (a, b) => {
    const w = Math.min(a.right, b.right) - Math.max(a.left, b.left);
    const h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
    const area = (x) => (x.right - x.left) * (x.bottom - x.top);
    return w > 0 && h > 0 && w * h > Math.min(area(a), area(b)) / 5;
  };

  function sobrepostos(caixas) {
    const pares = [];
    for (let i = 0; i < caixas.length; i++) {
      for (let j = i + 1; j < caixas.length; j++) {
        const a = caixas[i], b = caixas[j];
        if (a.el.contains(b.el) || b.el.contains(a.el)) continue;
        if (a.linhas.some((x) => b.linhas.some((y) => cobre(x, y)))) pares.push(a.nome + ' × ' + b.nome);
      }
    }
    return pares;
  }

  /*
   * Texto que sai da peça é o defeito que mais aparece e o que menos se vê
   * numa miniatura: um centímetro de manchete cortado na borda. Mede depois
   * que as fontes chegam e que as entradas animadas terminam (elas começam
   * deslocadas de propósito). `esperar`: quanto dar às entradas antes de
   * adiantá-las — a bancada anima; o painel desenha parado (`leve`).
   */
  async function conferir(host, opts) {
    const o = opts || {};
    if (document.fonts) await document.fonts.ready;
    if (o.esperar) await new Promise((r) => setTimeout(r, o.esperar));
    const sr = host.shadowRoot;
    const peca = sr && sr.querySelector('.mt-peca');
    if (!peca) return { fora: [], juntos: [] };
    /*
     * As entradas são ADIANTADAS até o fim antes de medir. Com a aba em
     * segundo plano o navegador não anda as animações, e o que entra pela
     * direita era medido ainda fora do lugar — e acusado como vazamento
     * (visto na primeira rodada do lote 1). As infinitas (movimento
     * contínuo, rolagem do rodapé) não terminam e ficam como estão.
     */
    (sr.getAnimations ? sr.getAnimations() : []).forEach((a) => {
      try { if (a.effect.getComputedTiming().iterations !== Infinity) a.finish(); } catch (e) { /* segue */ }
    });
    const p = peca.getBoundingClientRect();
    const fora = [];
    const caixas = [];
    // Campos e os vivos parados (hora, data, clima). As mensagens rolam por baixo da máscara do trilho de propósito.
    const passa = (x) => x.left < p.left - 1 || x.right > p.right + 1 || x.top < p.top - 1 || x.bottom > p.bottom + 1;
    sr.querySelectorAll('[data-campo], [data-vivo]:not([data-vivo="mensagens"])').forEach((el) => {
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) return;
      const nome = el.getAttribute('data-campo') || el.getAttribute('data-vivo');
      const linhas = linhasDoTexto(el, r, p.width / peca.offsetWidth);
      /*
       * As LINHAS do texto, não a caixa: uma palavra longa que não quebra
       * transborda a própria caixa, e a caixa continua dentro da peça (visto
       * no editor: "ANTICONSTITU…" cortado e o detector dizendo que cabia).
       * E a caixa de um número enorme é a da fonte, não a da tinta: o "10"
       * do parcelado em pé era acusado 2px acima da peça sem nada sair.
       * Campo sem texto (foto, vazio) fica com a caixa — é o que linhasDoTexto devolve.
       */
      if (linhas.some(passa)) fora.push(nome);
      // Desenho de fundo (aria-hidden) pode ficar atrás do texto de propósito.
      if (!el.closest('[aria-hidden="true"]')) caixas.push({ el, linhas, nome });
    });
    return { fora, juntos: sobrepostos(caixas) };
  }

  return { conferir, cobre, linhasDoTexto, sobrepostos };
});
