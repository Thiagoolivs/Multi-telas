/*
 * js/aparelho.js — "1920×1080 · Android", a partir do que a TV contou no
 * último pulso. Só o essencial para o suporte; o texto inteiro do navegador
 * fica de fora. Um lugar só: o cartão da tela (painel do cliente) e a frota
 * (painel do operador, server/admin.js) descrevem o aparelho do mesmo jeito.
 *
 * Módulo duplo: require() no Node, MTAparelho no navegador.
 */
(function (raiz, fabrica) {
  var api = fabrica();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (raiz) raiz.MTAparelho = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function descrever(info) {
    var i = info;
    if (typeof i === 'string') { try { i = JSON.parse(i); } catch (e) { i = null; } }
    if (!i || !i.w) return '';
    var ua = String(i.ua || '');
    var so = i.app ? 'App ' + i.app
      : /Android/i.test(ua) ? 'Android' : /Tizen/i.test(ua) ? 'Samsung' : /Web0S|webOS/i.test(ua) ? 'LG'
        : /CrKey/i.test(ua) ? 'Chromecast' : /Windows/i.test(ua) ? 'Windows' : /Mac OS/i.test(ua) ? 'Mac' : /Linux/i.test(ua) ? 'Linux' : '';
    return i.w + '×' + i.h + (so ? ' · ' + so : '');
  }

  return { descrever: descrever };
});
