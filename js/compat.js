/*
 * js/compat.js — o que a TV precisa saber do navegador ANTES do player.
 *
 * QA de lançamento, 03/11 (usuário 19, compatibilidade): numa Smart TV de
 * 2018 (Samsung Tizen 4, LG webOS 4) o pacote do player não compilava e a TV
 * ficava para sempre em "Iniciando exibição" — sem dizer nada a quem
 * instalou, que achava que era a internet. Este arquivo faz duas coisas:
 *
 *   1. COMPLETA o que falta em navegador um pouco antigo (padStart, finally),
 *      para a TV que compila o pacote não cair num detalhe.
 *   2. AVISA quando o navegador é antigo demais: se o pacote do player deu
 *      erro de SINTAXE (o navegador não entende o JavaScript dele) ou falta o
 *      básico (Promise, fetch, Shadow DOM), a TV mostra uma tela clara, na
 *      marca, dizendo o que fazer — o app MultiTelas TV ou um TV box Android.
 *
 * Por que aqui, no <head>, e não no pacote: um erro de sintaxe no pacote
 * impede o arquivo INTEIRO de rodar, inclusive um aviso que estivesse lá
 * dentro. Este arquivo é ES5 puro (como o perf.js) e roda em qualquer coisa.
 *
 * O sinal de que o player subiu é `window.MTCloud` (o mesmo que o vigia do
 * app Android pergunta). Não basta faltar o MTCloud para mostrar o aviso: sem
 * rede na primeira vez o pacote nem chega, e "navegador antigo" seria mentira.
 * Precisa ter havido erro de sintaxe num script nosso, ou faltar o básico.
 *
 * Mínimo: Chromium 56 (ver docs/APARELHOS.md). O número aparece no aviso
 * para quem dá suporte saber, de longe, o que a TV tem.
 */
(function (global) {
  'use strict';

  var MINIMO = 56;

  /* ---------- 1. O que falta, completado ---------- */

  function completarPad(nome, noFim) {
    if (String.prototype[nome]) return;
    String.prototype[nome] = function (tamanho, enchimento) {
      var s = String(this);
      var e = enchimento === undefined ? ' ' : String(enchimento);
      tamanho = tamanho >> 0;
      if (s.length >= tamanho || !e) return s;
      var falta = tamanho - s.length;
      while (e.length < falta) e += e;
      e = e.slice(0, falta);
      return noFim ? s + e : e + s;
    };
  }
  completarPad('padStart', false); // Chromium 57
  completarPad('padEnd', true);
  // Chromium 63.
  if (global.Promise && !global.Promise.prototype['finally']) {
    global.Promise.prototype['finally'] = function (f) {
      var P = this.constructor || global.Promise;
      return this.then(
        function (v) { return P.resolve(typeof f === 'function' ? f() : f).then(function () { return v; }); },
        function (e) { return P.resolve(typeof f === 'function' ? f() : f).then(function () { throw e; }); }
      );
    };
  }
  // Chromium 51.
  if (global.NodeList && !global.NodeList.prototype.forEach) global.NodeList.prototype.forEach = Array.prototype.forEach;

  /* ---------- 2. Antigo demais: dizer ---------- */

  function versaoChrome(ua) {
    var m = /(?:Chrome|Chromium|CrMo|CriOS)\/(\d+)/.exec(String(ua || ''));
    return m ? Number(m[1]) : null;
  }

  // O que o player usa desde a primeira linha, sem alternativa.
  function faltaOBasico(g) {
    try {
      var d = g.document;
      var css = g.CSS && g.CSS.supports && g.CSS.supports('--mt-teste', '0');
      return !(g.Promise && g.fetch && g.Map && g.Set && g.Symbol && Object.assign && Array.from
        && Object.values && d && d.documentElement && d.documentElement.attachShadow && css);
    } catch (e) { return true; }
  }

  // O erro é de sintaxe e veio de um script nosso (do pacote ou de /js/).
  function ehErroDeSintaxe(ev, origem) {
    if (!ev) return false;
    var arquivo = String(ev.filename || '');
    if (arquivo && origem && arquivo.indexOf(origem) !== 0) return false;
    if (arquivo && !/\/js\//.test(arquivo)) return false;
    var erro = ev.error;
    if (erro && global.SyntaxError && erro instanceof global.SyntaxError) return true;
    return /SyntaxError/.test(String(ev.message || ''));
  }

  function textos(ua) {
    var noApp = /MultiTelasTV\//.test(String(ua || ''));
    var v = versaoChrome(ua);
    return {
      titulo: noApp ? 'O WebView deste aparelho é antigo para o MultiTelas.' : 'Este navegador é antigo para o MultiTelas.',
      dica: noApp
        ? 'Atualize o "Android System WebView" na Play Store do aparelho, ou use um TV box Android mais novo.'
        : 'Use o app MultiTelas TV ou um TV box Android.',
      detalhe: 'Precisa de Chrome ' + MINIMO + ' ou mais novo'
        + (v ? ' · este aparelho tem Chrome ' + v : '') + '.',
    };
  }

  // O símbolo do logo (icons/icone.svg), sem o quadrado de fundo: a tela já é tinta.
  var SIMBOLO = '<svg viewBox="0 0 136 136" width="100%" height="100%" aria-hidden="true">'
    + '<rect x="0" y="0" width="88" height="88" rx="12" fill="#ffffff"/>'
    + '<rect x="96" y="0" width="40" height="88" rx="12" fill="#C6F432"/>'
    + '<rect x="0" y="96" width="136" height="40" rx="12" fill="#86858F"/></svg>';

  var mostrado = false;
  function mostrarAntigo(motivo) {
    var d = global.document;
    if (mostrado || !d || !d.body) return;
    mostrado = true;
    var t = textos(global.navigator && global.navigator.userAgent);
    var el = d.createElement('div');
    el.id = 'mt-antigo';
    el.className = 'mt-antigo';
    el.setAttribute('role', 'alert');
    el.setAttribute('data-motivo', motivo);
    el.innerHTML = '<div class="mt-antigo-caixa">'
      + '<div class="mt-marca"><span class="mt-marca-simbolo">' + SIMBOLO + '</span><span class="mt-marca-nome">MultiTelas</span></div>'
      + '<h1 class="mt-antigo-titulo"></h1><p class="mt-antigo-dica"></p><p class="mt-antigo-detalhe"></p></div>';
    el.querySelector('.mt-antigo-titulo').appendChild(d.createTextNode(t.titulo));
    el.querySelector('.mt-antigo-dica').appendChild(d.createTextNode(t.dica));
    el.querySelector('.mt-antigo-detalhe').appendChild(d.createTextNode(t.detalhe));
    d.body.appendChild(el);
    // O splash "Iniciando exibição" sai: ele é justamente a mentira que o aviso corrige.
    var splash = d.getElementById('overlay');
    if (splash) splash.style.display = 'none';
  }

  var api = { MINIMO: MINIMO, versaoChrome: versaoChrome, faltaOBasico: faltaOBasico, ehErroDeSintaxe: ehErroDeSintaxe, textos: textos, mostrarAntigo: mostrarAntigo };
  if (typeof module === 'object' && module.exports) { module.exports = api; return; }
  global.MTCompat = api;

  if (!global.addEventListener || !global.document) return;
  var origem = '';
  try { origem = global.location.protocol + '//' + global.location.host; } catch (e) {}
  var sintaxe = false;
  global.addEventListener('error', function (ev) { if (ehErroDeSintaxe(ev, origem)) sintaxe = true; }, true);

  var basico = faltaOBasico(global);
  // Falta o básico: não há o que esperar, avisa assim que houver corpo.
  if (basico) global.document.addEventListener('DOMContentLoaded', function () { mostrarAntigo('basico'); });
  // Depois de todos os scripts: o player subiu? Se não, e foi por sintaxe, avisa.
  global.addEventListener('load', function () {
    if (global.MTCloud) return;
    if (sintaxe) mostrarAntigo('sintaxe');
    else if (basico) mostrarAntigo('basico');
  });
})(typeof window !== 'undefined' ? window : this);
