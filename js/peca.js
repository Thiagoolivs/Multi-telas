/*
 * js/peca.js — como um elemento de composição vira CSS.
 *
 * Companheiro de js/fontes.js, e pelo mesmo motivo: o desenho de uma peça
 * estava escrito TRÊS vezes — dentro de js/render.js, em
 * web/src/lib/composition.js e outra vez em web/src/lib/exportPng.js. Três
 * cópias da mesma conta é uma promessa de que um dia elas discordam, e quando
 * discordam a pessoa aprova uma peça no editor e outra aparece na parede.
 *
 * Aqui mora a conta uma vez só. O servidor faz `require`, o player carrega
 * como script, o editor importa este mesmo arquivo.
 *
 * ---- Sobre as UNIDADES ----
 *
 * Tudo o que tem tamanho é medido em `cqw`: por cento da LARGURA da peça.
 * Uma peça é desenhada num palco de 400px no editor, 1920px na TV e 1080px no
 * PNG exportado — medida em pixel, uma sombra de 14px seria discreta na TV e
 * um borrão na miniatura. Em cqw, a mesma peça sai igual em qualquer tamanho.
 *
 * Quem chama diz em que unidade quer a saída: o player pede 'cqw' (o palco é
 * um container CSS), o editor e o canvas passam quantos pixels vale 1 cqw.
 */
(function (raiz, fabrica) {
  var api = fabrica();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (raiz) raiz.MTPeca = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function num(v, padrao) {
    var n = Number(v);
    return isFinite(n) ? n : padrao;
  }
  function limitar(v, min, max) { return Math.max(min, Math.min(max, v)); }

  /* ---------------- Formas ---------------- */

  // Polígonos (pontos em % do bloco) para as formas feitas por recorte.
  var SHAPE_POLY = {
    triangle: [[50, 0], [100, 100], [0, 100]],
    diamond: [[50, 0], [100, 50], [50, 100], [0, 50]],
    diag: [[0, 0], [100, 0], [70, 100], [0, 100]],
  };
  function shapeClip(shape) {
    var p = SHAPE_POLY[shape];
    if (!p) return 'none';
    return 'polygon(' + p.map(function (pt) { return pt[0] + '% ' + pt[1] + '%'; }).join(', ') + ')';
  }
  // Forma recortada não aceita borda nem sombra de caixa: o recorte corta as
  // duas junto. Quem precisa disso usa filtro (sombra) ou nada (borda).
  function recortada(el) {
    return !!(el && el.tipo === 'forma' && SHAPE_POLY[el.shape]);
  }

  // Preenchimento: cor sólida (string) ou gradiente { grad, ang, cores }.
  function fillToCss(fill) {
    if (!fill) return 'rgba(255,255,255,.14)';
    if (typeof fill === 'string') return fill;
    var c = (fill.cores && fill.cores.length) ? fill.cores : ['#888888', '#444444'];
    var c2 = c[1] || c[0];
    if (fill.grad === 'radial') return 'radial-gradient(circle at 50% 40%, ' + c[0] + ', ' + c2 + ')';
    return 'linear-gradient(' + num(fill.ang, 150) + 'deg, ' + c[0] + ', ' + c2 + ')';
  }

  /* ---------------- Corpo do texto ---------------- */

  // Proporção altura/largura ("16/9" → 0.5625): converte % de ALTURA (eixo Y)
  // em cqw, que medem % de LARGURA.
  function formatRatio(formato) {
    var p = String(formato || '16/9').split('/').map(Number);
    return (p[0] && p[1]) ? p[1] / p[0] : 9 / 16;
  }
  // Corpo em cqw. Com e.auto, cresce junto com a diagonal do bloco.
  function textFontCqw(e, formato) {
    if (!e || !e.auto) return (e && e.tamanho != null) ? e.tamanho : 6;
    var R = formatRatio(formato);
    var w = e.w != null ? e.w : 25;
    var h = e.h != null ? e.h : 25;
    var diag = Math.sqrt(w * w + (h * R) * (h * R));
    var k = e.escala != null ? e.escala : 0.16;
    return Math.max(2, diag * k);
  }

  /* ---------------- Sombra ---------------- */

  /*
   * O padrão é uma sombra de contato: quase sem deslocamento e bem aberta. É a
   * que dá relevo sem parecer adesivo — sombra dura e deslocada é a marca
   * registrada de peça amadora.
   *
   * Os números são o antigo `0 2px 14px rgba(0,0,0,.45)` convertido para cqw
   * numa peça de 1920: continua igual na TV, e passa a encolher junto na
   * miniatura, onde antes ficava um borrão.
   */
  var SOMBRA_PADRAO = { x: 0, y: 0.1, desfoque: 0.73, cor: '#000000', opacidade: 0.45 };
  var SOMBRA_LIMITES = { desloc: 4, desfoque: 8 };
  var BORDA_MAX = 3;

  /*
   * `sombra` aceita `true` — é como as peças antigas guardam "tem sombra", e
   * quebrar isso apagaria a sombra de tudo o que já está publicado.
   */
  function sombra(el) {
    var s = el && el.sombra;
    if (!s) return null;
    if (s === true) s = {};
    if (typeof s !== 'object') return null;
    return {
      x: limitar(num(s.x, SOMBRA_PADRAO.x), -SOMBRA_LIMITES.desloc, SOMBRA_LIMITES.desloc),
      y: limitar(num(s.y, SOMBRA_PADRAO.y), -SOMBRA_LIMITES.desloc, SOMBRA_LIMITES.desloc),
      desfoque: limitar(num(s.desfoque, SOMBRA_PADRAO.desfoque), 0, SOMBRA_LIMITES.desfoque),
      cor: rgba(s.cor || SOMBRA_PADRAO.cor, limitar(num(s.opacidade, SOMBRA_PADRAO.opacidade), 0, 1)),
    };
  }

  /* ---------------- Borda ---------------- */

  function borda(el) {
    var b = el && el.borda;
    if (!b || typeof b !== 'object') return null;
    var largura = limitar(num(b.largura, 0), 0, BORDA_MAX);
    if (largura <= 0) return null;   // espessura zero é "sem borda", não borda invisível
    return {
      largura: largura,
      cor: b.cor || '#ffffff',
      estilo: ['solid', 'dashed', 'dotted'].indexOf(b.estilo) >= 0 ? b.estilo : 'solid',
    };
  }

  /* ---------------- Saída em CSS ---------------- */

  /*
   * `u` decide a unidade: 'cqw' (ou nada) devolve cqw, e um NÚMERO é quanto
   * vale 1 cqw em pixels — é assim que o editor e o canvas pedem a mesma peça
   * no tamanho deles.
   */
  function medida(v, u) {
    if (typeof u === 'number') return Math.round(v * u * 100) / 100 + 'px';
    return (Math.round(v * 1000) / 1000) + 'cqw';
  }
  function sombraCss(el, u) {
    var s = sombra(el);
    if (!s) return 'none';
    return medida(s.x, u) + ' ' + medida(s.y, u) + ' ' + medida(s.desfoque, u) + ' ' + s.cor;
  }
  function bordaCss(el, u) {
    var b = borda(el);
    if (!b) return 'none';
    return medida(b.largura, u) + ' ' + b.estilo + ' ' + b.cor;
  }
  /* Canto arredondado, em cqw — o mesmo número no editor, na TV e no PNG. */
  function raioCss(el, u) {
    var r = num(el && el.radius, 0);
    if (!(r > 0)) return '0';
    // Em forma, o raio sempre foi % do próprio bloco; em imagem, cqw. Manter
    // os dois é o que impede as peças salvas de mudarem de cara sozinhas.
    if (el.tipo === 'forma') return limitar(r, 0, 50) + '%';
    return medida(limitar(r, 0, 50), u);
  }

  /*
   * Onde a sombra entra depende do que o elemento é:
   *
   *   texto            text-shadow
   *   forma inteira    box-shadow, que segue o canto arredondado
   *   forma recortada  drop-shadow, porque box-shadow seria cortada pelo recorte
   *   imagem e ícone   drop-shadow, que contorna o desenho e não a caixa —
   *                    numa imagem "inteira" a caixa tem sobra dos lados, e a
   *                    sombra da caixa ficaria pairando no vazio
   */
  function comoAplicarSombra(el) {
    if (!el) return null;
    if (el.tipo === 'texto') return 'texto';
    if (el.tipo === 'imagem' || el.tipo === 'icone') return 'filtro';
    if (el.tipo === 'forma') return recortada(el) ? 'filtro' : 'caixa';
    return 'caixa';
  }

  /* ---------------- Cor ---------------- */

  // #rgb / #rrggbb + alpha → rgba(). Qualquer outra coisa passa direto: pode
  // já ser rgba() ou um nome de cor, e reescrever seria estragar.
  function rgba(cor, alpha) {
    var s = String(cor || '').trim();
    var m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(s);
    if (!m) return s;
    var h = m[1];
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    var n = parseInt(h, 16);
    return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + (Math.round(alpha * 1000) / 1000) + ')';
  }

  /* ---------------- Duotone (tingir imagem com a cor da marca) ----------------
   *
   * Imagem que vem do Banco de Imagens MultiTelas foi gerada para OUTRA marca,
   * na cor DELA — a direção de arte (server/direcao-arte.js) pede monocromia no
   * hex de quem pediu. Reusada crua, a foto laranja da padaria entra numa peça
   * azul de ótica e denuncia que veio de fora.
   *
   * Gerar de novo na cor certa custaria os mesmos R$ 0,35 e mataria a economia
   * inteira do banco. Então a cor é trocada no DESENHO, de graça: duotone.
   *
   * A conta é a mesma nos dois casos e não precisa de filtro nem de div extra —
   * o modo de mistura `luminosity` mantém o CLARO/ESCURO da foto e toma matiz e
   * saturação da camada de baixo, que é a cor da marca. É duotone exato, não o
   * truque de hue-rotate que acerta a cor por aproximação.
   *
   *   fundo      duas camadas de background no mesmo elemento
   *   <img>      o pai pintado com a cor, a imagem por cima misturando
   *
   * `isolation: isolate` no pai é obrigatório: sem ele a mistura vaza para o
   * que estiver atrás na página, e o elemento vizinho fica com a cor errada.
   */
  function corDeTinta(cor) {
    var s = String(cor || '').trim();
    return /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(s) ? s : null;
  }

  // Fundo (background-image): devolve null quando não há o que tingir.
  function tintaFundo(src, cor) {
    var c = corDeTinta(cor);
    var u = String(src || '').replace(/["\\]/g, '');
    if (!u) return null;
    var img = 'url("' + u + '")';
    if (!c) return { backgroundImage: img };
    return {
      backgroundImage: img + ', linear-gradient(' + c + ', ' + c + ')',
      backgroundBlendMode: 'luminosity',
    };
  }

  // Elemento <img>: estilo do PAI e estilo da IMAGEM, nesta ordem.
  function tintaImagem(cor) {
    var c = corDeTinta(cor);
    if (!c) return null;
    return {
      pai: { backgroundColor: c, isolation: 'isolate' },
      img: { mixBlendMode: 'luminosity' },
    };
  }

  return {
    SHAPE_POLY: SHAPE_POLY, shapeClip: shapeClip, recortada: recortada, fillToCss: fillToCss,
    corDeTinta: corDeTinta, tintaFundo: tintaFundo, tintaImagem: tintaImagem,
    formatRatio: formatRatio, textFontCqw: textFontCqw,
    SOMBRA_PADRAO: SOMBRA_PADRAO, SOMBRA_LIMITES: SOMBRA_LIMITES, BORDA_MAX: BORDA_MAX,
    sombra: sombra, borda: borda,
    sombraCss: sombraCss, bordaCss: bordaCss, raioCss: raioCss,
    comoAplicarSombra: comoAplicarSombra, rgba: rgba,
  };
});
