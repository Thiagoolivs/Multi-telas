/*
 * js/graficos.js — a biblioteca de elementos gráficos do editor.
 *
 * Selos de oferta, faixas, setas, balões, molduras, manchas: o que num
 * cartaz de loja faz o papel de "enfeite que chama o olho", e que antes só
 * dava para fazer empilhando formas à mão.
 *
 * Um catálogo SÓ, lido pelos três que desenham uma peça — o editor (React),
 * a TV (js/render.js) e a exportação em PNG (canvas, via Path2D). Por isso
 * cada gráfico é um único caminho SVG preenchido num quadro 100×100: é o
 * formato que os três entendem sem tradução, e o que não precisa de tradução
 * não diverge.
 *
 *   proporcao 'fixa'  → escala por igual e centraliza (selo, balão);
 *   proporcao 'livre' → estica para o tamanho da caixa (faixa, onda, moldura).
 */
(function (raiz, fabrica) {
  var api = fabrica();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (raiz) raiz.MTGraficos = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function r(n) { return Math.round(n * 100) / 100; }

  // Estrela de N pontas (selo de oferta): alterna raio de fora e de dentro.
  function estrela(pontas, fora, dentro) {
    var p = [];
    for (var i = 0; i < pontas * 2; i++) {
      var ang = (Math.PI / pontas) * i - Math.PI / 2;
      var raio = i % 2 === 0 ? fora : dentro;
      p.push(r(50 + raio * Math.cos(ang)) + ' ' + r(50 + raio * Math.sin(ang)));
    }
    return 'M' + p.join(' L') + ' Z';
  }

  // Raios de sol: triângulos finos saindo do centro.
  function raios(n) {
    var d = '';
    for (var i = 0; i < n; i++) {
      var a = (2 * Math.PI / n) * i;
      var a1 = a - Math.PI / n / 2.4, a2 = a + Math.PI / n / 2.4;
      d += 'M50 50 L' + r(50 + 50 * Math.cos(a1)) + ' ' + r(50 + 50 * Math.sin(a1)) +
        ' L' + r(50 + 50 * Math.cos(a2)) + ' ' + r(50 + 50 * Math.sin(a2)) + ' Z ';
    }
    return d.trim();
  }

  // Confete: pontos espalhados (posições fixas — o mesmo em toda tela).
  function confete() {
    var pts = [[12, 18, 3], [30, 8, 2], [52, 22, 3.5], [75, 10, 2.5], [88, 30, 3], [20, 45, 2.5], [44, 50, 2],
      [66, 42, 3], [90, 60, 2.5], [10, 72, 3.5], [34, 80, 2.5], [58, 70, 3], [80, 86, 3], [48, 92, 2]];
    return pts.map(function (p) {
      return 'M' + (p[0] - p[2]) + ' ' + p[1] + ' a' + p[2] + ' ' + p[2] + ' 0 1 0 ' + (p[2] * 2) + ' 0 a' + p[2] + ' ' + p[2] + ' 0 1 0 ' + (-p[2] * 2) + ' 0 Z';
    }).join(' ');
  }

  var CATALOGO = [
    { nome: 'selo-oferta', rotulo: 'Selo de oferta', grupo: 'Selos', proporcao: 'fixa', d: estrela(16, 50, 41) },
    { nome: 'selo-estrela', rotulo: 'Explosão', grupo: 'Selos', proporcao: 'fixa', d: estrela(12, 50, 30) },
    { nome: 'selo-serrilhado', rotulo: 'Selo serrilhado', grupo: 'Selos', proporcao: 'fixa', d: estrela(28, 50, 45) },
    { nome: 'etiqueta', rotulo: 'Etiqueta de preço', grupo: 'Selos', proporcao: 'fixa',
      d: 'M8 30 L30 8 H88 a4 4 0 0 1 4 4 V88 a4 4 0 0 1 -4 4 H30 L8 70 Z M26 50 a6 6 0 1 0 12 0 a6 6 0 1 0 -12 0 Z', regra: 'evenodd' },
    { nome: 'faixa', rotulo: 'Faixa', grupo: 'Faixas', proporcao: 'livre',
      d: 'M0 20 H100 L88 50 L100 80 H0 L12 50 Z' },
    { nome: 'faixa-reta', rotulo: 'Tarja', grupo: 'Faixas', proporcao: 'livre',
      d: 'M4 22 L100 14 L96 78 L0 86 Z' },
    { nome: 'fita-canto', rotulo: 'Fita de canto', grupo: 'Faixas', proporcao: 'livre',
      d: 'M40 0 H70 L100 30 V60 Z' },
    { nome: 'onda', rotulo: 'Onda', grupo: 'Faixas', proporcao: 'livre',
      d: 'M0 40 C20 20 35 20 50 40 S80 60 100 40 V100 H0 Z' },
    { nome: 'seta', rotulo: 'Seta', grupo: 'Setas', proporcao: 'livre',
      d: 'M0 35 H62 V12 L100 50 L62 88 V65 H0 Z' },
    { nome: 'seta-chevron', rotulo: 'Chevron', grupo: 'Setas', proporcao: 'livre',
      d: 'M0 0 H55 L100 50 L55 100 H0 L45 50 Z' },
    { nome: 'balao', rotulo: 'Balão de fala', grupo: 'Balões', proporcao: 'fixa',
      d: 'M14 10 H86 a10 10 0 0 1 10 10 V62 a10 10 0 0 1 -10 10 H40 L20 92 L24 72 H14 a10 10 0 0 1 -10 -10 V20 a10 10 0 0 1 10 -10 Z' },
    { nome: 'balao-redondo', rotulo: 'Balão redondo', grupo: 'Balões', proporcao: 'fixa',
      d: 'M50 8 C76 8 94 24 94 45 C94 66 76 82 50 82 C44 82 38 81 33 79 L14 92 L20 73 C11 66 6 56 6 45 C6 24 24 8 50 8 Z' },
    { nome: 'moldura', rotulo: 'Moldura', grupo: 'Molduras', proporcao: 'livre', regra: 'evenodd',
      d: 'M0 0 H100 V100 H0 Z M6 6 V94 H94 V6 Z' },
    { nome: 'moldura-dupla', rotulo: 'Moldura dupla', grupo: 'Molduras', proporcao: 'livre', regra: 'evenodd',
      d: 'M0 0 H100 V100 H0 Z M3 3 V97 H97 V3 Z M6 6 H94 V94 H6 Z M8 8 V92 H92 V8 Z' },
    { nome: 'anel', rotulo: 'Anel', grupo: 'Molduras', proporcao: 'fixa', regra: 'evenodd',
      d: 'M50 2 a48 48 0 1 0 0.01 0 Z M50 12 a38 38 0 1 1 -0.01 0 Z' },
    { nome: 'mancha', rotulo: 'Mancha', grupo: 'Fundos', proporcao: 'livre',
      d: 'M52 4 C72 2 92 14 95 36 C98 56 90 70 78 84 C64 98 38 98 22 88 C6 78 2 58 6 40 C10 20 30 6 52 4 Z' },
    { nome: 'raios', rotulo: 'Raios de sol', grupo: 'Fundos', proporcao: 'fixa', d: raios(16) },
    { nome: 'confete', rotulo: 'Confete', grupo: 'Fundos', proporcao: 'livre', d: confete() },
    { nome: 'coracao', rotulo: 'Coração', grupo: 'Fundos', proporcao: 'fixa',
      d: 'M50 88 C20 66 4 50 4 30 C4 16 15 6 28 6 C38 6 46 12 50 20 C54 12 62 6 72 6 C85 6 96 16 96 30 C96 50 80 66 50 88 Z' },
  ];

  var POR_NOME = {};
  CATALOGO.forEach(function (g) { POR_NOME[g.nome] = g; });

  function pegar(nome) { return POR_NOME[nome] || CATALOGO[0]; }

  /* Atributos do <svg> que desenha o gráfico — os mesmos no editor e na TV. */
  function svgAtributos(nome) {
    var g = pegar(nome);
    return {
      viewBox: '0 0 100 100',
      preserveAspectRatio: g.proporcao === 'fixa' ? 'xMidYMid meet' : 'none',
    };
  }
  /* O miolo do <svg>: um caminho só, preenchido com a cor do elemento. */
  function svgMiolo(nome) {
    var g = pegar(nome);
    return '<path d="' + g.d + '"' + (g.regra === 'evenodd' ? ' fill-rule="evenodd"' : '') + '/>';
  }

  /*
   * Canvas (exportação PNG). `ctx` já transladado para o canto da caixa;
   * `w`,`h` em pixels. Path2D entende o mesmo `d` do SVG.
   */
  function desenharCanvas(ctx, nome, w, h, cor) {
    var g = pegar(nome);
    ctx.save();
    if (g.proporcao === 'fixa') {
      var s = Math.min(w, h) / 100;
      ctx.translate((w - 100 * s) / 2, (h - 100 * s) / 2);
      ctx.scale(s, s);
    } else {
      ctx.scale(w / 100, h / 100);
    }
    ctx.fillStyle = cor || '#ffffff';
    ctx.fill(new Path2D(g.d), g.regra === 'evenodd' ? 'evenodd' : 'nonzero');
    ctx.restore();
  }

  return { CATALOGO: CATALOGO, pegar: pegar, svgAtributos: svgAtributos, svgMiolo: svgMiolo, desenharCanvas: desenharCanvas };
});
