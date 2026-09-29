/*
 * js/precos.js — a tabela de preços, lida do jeito que o dono escreve.
 *
 * O cardápio de uma padaria tem trinta itens e muda toda semana. Um modelo
 * de arte com oito linhas fixas não aguenta isso: cada item novo é duplicar
 * três elementos no editor. Aqui o dono COLA a lista — do WhatsApp, da
 * planilha, do caderno — uma linha por item, e a TV organiza.
 *
 * O que se aceita numa linha, porque é o que as pessoas escrevem:
 *   "Café expresso ; 6,00"      "Pão de queijo - R$ 4,50"
 *   "Misto quente .... 12"      "Suco natural	10,00" (tab, vindo da planilha)
 * Linha sem preço no fim vira título de seção ("BEBIDAS").
 *
 * Módulo duplo como peca.js: `require()` nos testes, `window.MTPrecos` na TV e
 * no painel — a mesma leitura nos três lugares.
 */
(function (raiz, fabrica) {
  var api = fabrica();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (raiz) raiz.MTPrecos = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  // Preço no FIM da linha: "R$ 12,00", "12,00", "12.5", "12". O que vem antes,
  // menos separadores (; : - — . tab), é o nome.
  var PRECO_NO_FIM = /^(.*?)[\s;:|\t.·…_–—-]*(R\$\s*)?(\d{1,5}(?:[.,]\d{1,2})?)\s*$/;

  function formatarPreco(bruto) {
    var n = String(bruto).replace(',', '.');
    var v = Number(n);
    if (!isFinite(v)) return 'R$ ' + bruto;
    // "12" e "12,5" viram "12,00" e "12,50": tabela com casas desiguais lê torta.
    return 'R$ ' + v.toFixed(2).replace('.', ',');
  }

  /* Texto colado → [{ tipo: 'item', nome, preco } | { tipo: 'secao', nome }] */
  function ler(texto) {
    return String(texto || '').split(/\r?\n/).map(function (l) { return l.trim(); }).filter(Boolean).map(function (linha) {
      var m = PRECO_NO_FIM.exec(linha);
      if (m && m[1].trim()) return { tipo: 'item', nome: m[1].trim(), preco: formatarPreco(m[3]) };
      return { tipo: 'secao', nome: linha.replace(/[:;\s]+$/, '') };
    });
  }

  /*
   * Colunas e corpo: o arranjo que dá a MAIOR letra.
   *
   * Limites fixos ("até 7 itens, uma coluna") erravam dos dois lados: três
   * colunas com nomes compridos saíam com letra miúda e meia tela vazia. Aqui
   * cada arranjo (1, 2 ou 3 colunas) é medido pela altura (linhas por coluna)
   * e pela largura (a linha mais comprida precisa caber na coluna), e fica o
   * que deixa a letra maior. `alturaPorLargura` é a proporção da zona: ~0,6
   * deitada, ~1,7 em pé. O corpo sai em cqh e cqw, e o CSS usa o menor dos
   * dois — então vale para o tamanho real da zona, seja ele qual for.
   */
  function medidas(linhas, cols) {
    var n = Math.max(1, linhas.length);
    var porColuna = Math.ceil(n / cols);
    var maior = linhas.reduce(function (m, l) {
      return Math.max(m, l.tipo === 'item' ? l.nome.length + l.preco.length + 2 : l.nome.length * 0.8);
    }, 8);
    var larguraColuna = (88 - 5 * (cols - 1)) / cols;
    return {
      cols: cols,
      cqh: 68 / (porColuna * 1.7),
      // Teto: três itens não viram cartaz; o título é que é o destaque.
      cqw: Math.min(5.5, larguraColuna / (maior * 0.56)),
    };
  }

  function layout(linhas, alturaPorLargura, pedido) {
    var p = Number(pedido);
    var opcoes = (p >= 1 && p <= 3) ? [p] : [1, 2, 3];
    var melhor = null;
    opcoes.forEach(function (c) {
      var m = medidas(linhas || [], c);
      m.efetivo = Math.min(m.cqh * alturaPorLargura, m.cqw);
      // Empate (5% ou menos) fica com menos colunas: lê melhor.
      if (!melhor || m.efetivo > melhor.efetivo * 1.05) melhor = m;
    });
    return melhor;
  }

  return { ler: ler, layout: layout, medidas: medidas, formatarPreco: formatarPreco };
});
