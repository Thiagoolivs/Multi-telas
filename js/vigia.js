/*
 * js/vigia.js — o vigia DENTRO do player: a TV que parou de andar se mexe
 * sozinha (teste de resistência do TV box, 14/11 — docs/CAPACIDADE-E-TVBOX.md).
 *
 * O app Android já tem um vigia (android/.../MainActivity.java), mas ele só
 * pergunta "a página tem MTCloud e body?": responde que sim com o palco
 * parado numa peça para sempre. E a TV de navegador (Smart TV, Fire TV) não
 * tem vigia nenhum. Este cobre o que só a página enxerga:
 *
 *   1. ZONA PARADA. Cada zona com rodízio diz quando deveria trocar de novo
 *      (o `schedule` de js/player.js). Passou 2 minutos da hora e não trocou
 *      — uma exceção no meio da troca deixa a zona sem o próximo relógio —
 *      o vigia CUTUCA a zona (manda trocar). Se ela parar de novo em menos
 *      de 10 min, recarrega a página.
 *   2. RECARGA DA MADRUGADA. Ligada há mais de 20 h, entre 3h e 5h da loja:
 *      recarrega uma vez. O teste de horas não achou vazamento no player,
 *      mas o WebView de um box barato não é o Chromium do teste; a recarga
 *      diária devolve a memória que o aparelho segurou, na hora em que
 *      ninguém olha.
 *
 * Recarregar só com o SERVIDOR RESPONDENDO (o último pulso deu certo há
 * menos de 2 min): numa TV sem service worker, recarregar sem rede é trocar
 * a programação pela página de erro do navegador. E nunca duas recargas do
 * vigia em menos de 30 min (a marca fica no localStorage), para um defeito
 * que volta não virar laço.
 *
 * ES5 de propósito: roda em TV antiga (js/compat.js).
 */
(function (global) {
  'use strict';

  var PASSO_MS = 60 * 1000;               // de quanto em quanto o vigia olha
  var ATRASO_MS = 2 * 60 * 1000;          // zona atrasada além disto: parada
  var DE_NOVO_MS = 10 * 60 * 1000;        // parou de novo logo depois do cutucão: recarrega
  var LIGADA_MS = 20 * 60 * 60 * 1000;    // a recarga da madrugada só depois de 20 h ligada
  var MADRUGADA = [3, 5];                 // das 3h às 5h (hora da loja)
  var PULSO_MS = 2 * 60 * 1000;           // servidor respondendo: pulso bom há menos disto
  var ENTRE_RECARGAS_MS = 30 * 60 * 1000; // nunca duas recargas do vigia em menos disto
  var CHAVE = 'mt.vigia';

  /*
   * A decisão, pura (o teste chama direto). `e`:
   *   agora, desde (quando a página subiu), pulsoOk (último pulso bom),
   *   hora (0–23, da loja), ultimaRecarga (a do vigia, do localStorage),
   *   zonas: [{ devido, cutucadaEm }]  (devido: quando deveria trocar).
   * Devolve { acao: '' | 'cutucar' | 'recarregar', motivo, zona }.
   */
  function decidir(e) {
    var agora = e.agora;
    var zonas = e.zonas || [];
    var servidorOk = !!e.pulsoOk && agora - e.pulsoOk < PULSO_MS;
    var podeRecarregar = servidorOk && !(e.ultimaRecarga && agora - e.ultimaRecarga < ENTRE_RECARGAS_MS);
    for (var i = 0; i < zonas.length; i++) {
      var z = zonas[i];
      if (!z || !z.devido || agora - z.devido < ATRASO_MS) continue;
      // Já cutucada há pouco e parada de novo: o defeito não passou com a troca.
      if (z.cutucadaEm && agora - z.cutucadaEm < DE_NOVO_MS) {
        if (podeRecarregar) return { acao: 'recarregar', motivo: 'zona-parada', zona: i };
        continue;
      }
      return { acao: 'cutucar', motivo: 'zona-parada', zona: i };
    }
    var h = e.hora;
    if (podeRecarregar && e.desde && agora - e.desde > LIGADA_MS && h >= MADRUGADA[0] && h < MADRUGADA[1]) {
      return { acao: 'recarregar', motivo: 'madrugada' };
    }
    return { acao: '', motivo: '' };
  }

  /* ---------------- O estado que o player alimenta ---------------- */
  var zonas = [];
  var estado = { desde: Date.now(), pulsoOk: 0, cutucadas: 0, recargas: 0 };

  /*
   * Uma zona com rodízio se registra e avisa a cada relógio novo.
   * `cutucar`: o que fazer quando ela parou (o player manda trocar já).
   */
  function zona(cutucar) {
    var z = { devido: 0, cutucadaEm: 0, cutucar: cutucar };
    zonas.push(z);
    return {
      devido: function (ms) { z.devido = ms; },
      parar: function () { var i = zonas.indexOf(z); if (i >= 0) zonas.splice(i, 1); },
    };
  }

  // O pulso deu certo (js/cloud.js, heartbeat): o servidor responde.
  function marcarPulso(ms) { estado.pulsoOk = ms || Date.now(); }

  function lerUltima(armazem) {
    try { return Number(armazem.getItem(CHAVE)) || 0; } catch (e) { return 0; }
  }

  /*
   * Liga o vigia. `o` (o teste troca): agora(), hora(), recarregar(motivo),
   * armazem (localStorage), avisar(texto).
   */
  var relogio = null;
  function ligar(o) {
    var op = o || {};
    var agora = op.agora || function () { return Date.now(); };
    var hora = op.hora || function () { return new Date().getHours(); };
    var armazem = op.armazem || (function () { try { return global.localStorage; } catch (e) { return null; } })();
    var recarregar = op.recarregar || function () { global.location.reload(); };
    var avisar = op.avisar || function (t) { try { console.warn('[vigia] ' + t); } catch (e) { /* sem console */ } };
    function olhar() {
      var t = agora();
      var d = decidir({ agora: t, desde: estado.desde, pulsoOk: estado.pulsoOk, hora: hora(), ultimaRecarga: armazem ? lerUltima(armazem) : 0, zonas: zonas });
      if (d.acao === 'cutucar') {
        var z = zonas[d.zona];
        var atraso = t - z.devido;
        z.cutucadaEm = t;
        z.devido = 0; // o próximo relógio da zona marca de novo
        estado.cutucadas++;
        avisar('zona parada há ' + Math.round(atraso / 1000) + ' s: trocando');
        try { z.cutucar(); } catch (e) { /* a zona quebrada não derruba o vigia */ }
      } else if (d.acao === 'recarregar') {
        estado.recargas++;
        try { if (armazem) armazem.setItem(CHAVE, String(t)); } catch (e) { /* sem armazém: recarrega igual */ }
        avisar('recarregando (' + d.motivo + ')');
        recarregar(d.motivo);
      }
      return d;
    }
    if (relogio) clearInterval(relogio);
    if (!op.semRelogio) relogio = setInterval(olhar, PASSO_MS);
    return { olhar: olhar };
  }

  var api = {
    decidir: decidir, zona: zona, marcarPulso: marcarPulso, ligar: ligar,
    estado: function () { return { desde: estado.desde, pulsoOk: estado.pulsoOk, cutucadas: estado.cutucadas, recargas: estado.recargas, zonas: zonas.length }; },
    _zerar: function () { zonas.length = 0; estado = { desde: Date.now(), pulsoOk: 0, cutucadas: 0, recargas: 0 }; if (relogio) { clearInterval(relogio); relogio = null; } },
    PASSO_MS: PASSO_MS, ATRASO_MS: ATRASO_MS, DE_NOVO_MS: DE_NOVO_MS, LIGADA_MS: LIGADA_MS, ENTRE_RECARGAS_MS: ENTRE_RECARGAS_MS, PULSO_MS: PULSO_MS,
  };
  global.MTVigia = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
