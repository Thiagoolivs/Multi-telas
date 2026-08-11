/*
 * perf.js — decide, ANTES da primeira pintura, se esta tela aguenta o vidro.
 *
 * O modo leve (.mt-perf) já existia e resolvia; ele só nunca ligava. A conta
 * era `hardwareConcurrency <= 2 || deviceMemory <= 2`, e uma TV Samsung
 * responde 4 núcleos e 8 GB — passa como hardware bom e ganha o pacote
 * completo: backdrop-filter em cada zona, mais dois halos de blur(60px) e
 * blur(76px) cobrindo a tela inteira.
 *
 * Medido com CPU de TV (6x mais lenta), 1920x1080:
 *
 *     como estava                  12 fps   pior quadro 183ms
 *     sem o backdrop-filter        58 fps   pior quadro 117ms
 *     em modo leve                 60 fps   pior quadro  33ms
 *
 * Núcleo não mede TV. Duas coisas medem:
 *
 *   1. QUEM ELA DIZ QUE É — Tizen, WebOS, Android TV se identificam. É um
 *      palpite, mas chega a tempo de evitar a primeira pintura cara.
 *   2. QUANTOS QUADROS ELA ENTREGA — o juiz de verdade, porque não depende de
 *      lista nenhuma e pega o aparelho barato que ninguém catalogou.
 *
 * O palpite entra primeiro para a tela já nascer leve; a medição confirma ou
 * rebaixa depois. Uma vez rebaixada, a tela lembra: quem tem TV fraca não vai
 * ganhar hardware novo no próximo F5.
 *
 * Escapes: ?perf=1 força leve, ?perf=0 força completo (e limpa a memória).
 */
(function (global) {
  'use strict';

  var CHAVE = 'mt.perf';
  // Sem DOM (testes em node): a classe vira um objeto de mentira, e o resto do
  // arquivo — que é o que interessa testar — continua funcionando igual.
  var semDom = { contains: function () { return false; }, add: function () {}, remove: function () {} };
  var raiz = (global.document && global.document.documentElement) || { classList: semDom };

  /*
   * Aparelhos que se anunciam como TV/set-top. A lista não precisa ser
   * completa — o que ela não pegar, a medição pega em três segundos.
   */
  var TV = /\b(smart-?tv|smarttv|tizen|web0s|webos|netcast|hbbtv|viera|bravia|aquos|philipstv|googletv|android\s?tv|crkey|aft[bmst]|firetv|nettv|dtv|inettvbrowser|roku)\b/i;

  function ehTv(ua) { return TV.test(String(ua || '')); }

  function param(nome) {
    try { return new URLSearchParams(global.location.search).get(nome); }
    catch (e) { return null; }
  }

  function lembrado() {
    try { return localStorage.getItem(CHAVE); } catch (e) { return null; }
  }
  function lembrar(v) {
    try { v ? localStorage.setItem(CHAVE, v) : localStorage.removeItem(CHAVE); }
    catch (e) {}
  }

  // Fica ligado; nunca desliga sozinho. Quem desliga é só o ?perf=0 explícito.
  function ligarLeve(motivo) {
    if (raiz.classList.contains('mt-perf')) return;
    raiz.classList.add('mt-perf');
    estado.leve = true;
    estado.motivo = motivo;
  }

  var estado = { leve: false, motivo: '', fps: 0, forcado: false };

  function decidir() {
    var forcado = param('perf');
    if (forcado === '0') {
      estado.forcado = true;
      lembrar(null);
      raiz.classList.remove('mt-perf');
      return estado;
    }
    if (forcado === '1') { estado.forcado = true; ligarLeve('forçado pela URL'); return estado; }

    if (lembrado() === 'leve') { ligarLeve('esta tela já se mostrou lenta antes'); return estado; }
    if (ehTv(navigator.userAgent)) { ligarLeve('aparelho se identifica como TV'); return estado; }
    // Hardware que se declara fraco continua valendo — é raro, mas é de graça.
    if ((navigator.hardwareConcurrency || 8) <= 2 || (navigator.deviceMemory || 8) <= 2) {
      ligarLeve('hardware declaradamente fraco');
    }
    return estado;
  }

  /*
   * Conta quadros e rebaixa a tela que não estiver entregando.
   *
   * O limite é 40 por segundo: acima disso o olho não vê engasgo; abaixo, vê e
   * muito.
   *
   * A medição é por JANELAS DE UM SEGUNDO, e quem decide é a MEDIANA delas.
   *
   * Nenhum resumo mais simples serve, e isso custou duas tentativas. A média de
   * três segundos corridos rebaixava um computador bom: um engasgo só — coleta
   * de lixo, uma imagem decodificando, outra aba — puxava tudo para baixo, e a
   * tela perdia o vidro para sempre, porque a decisão fica guardada. A melhor
   * janela errava do lado oposto: um segundo de sorte absolvia um aparelho que
   * andava a 12 quadros.
   *
   * A mediana não cai por um engasgo nem sobe por um segundo de sorte. A
   * pergunta que ela responde é a que importa: como esta tela se comporta na
   * MAIOR PARTE do tempo, que é o tempo em que alguém está olhando para ela.
   */
  var JANELAS = 5;
  var LIMITE = 40;   // quadros por segundo abaixo dos quais o olho vê o engasgo
  var medindo = false;
  function mediana(v) {
    var s = v.slice().sort(function (a, b) { return a - b; });
    return s[Math.floor(s.length / 2)];
  }
  function medir(aoTerminar) {
    if (estado.forcado || estado.leve || medindo) { if (aoTerminar) aoTerminar(estado); return; }
    medindo = true;
    var amostras = [], quadros = 0, ini = 0;
    function passo(t) {
      if (!ini) { ini = t; quadros = 0; global.requestAnimationFrame(passo); return; }
      quadros++;
      if (t - ini < 1000) { global.requestAnimationFrame(passo); return; }
      amostras.push((quadros / (t - ini)) * 1000);
      if (amostras.length < JANELAS) { ini = t; quadros = 0; global.requestAnimationFrame(passo); return; }
      estado.fps = Math.round(mediana(amostras));
      estado.amostras = amostras.map(Math.round);
      if (estado.fps < LIMITE) {
        ligarLeve('medido em ' + estado.fps + ' quadros por segundo');
        lembrar('leve');
      }
      if (aoTerminar) aoTerminar(estado);
    }
    /*
     * Espera o REGIME, não a montagem. Cinco segundos, e não um, porque
     * durante a abertura o splash cobre a tela inteira — com as zonas tapadas
     * o navegador não compõe o vidro, e a medição dava 60 quadros numa tela
     * que logo em seguida andava a 12. Passado o splash, a leitura fica firme:
     * 12 em cinquenta janelas seguidas, no aparelho lento.
     */
    global.setTimeout(function () { global.requestAnimationFrame(passo); }, 5000);
  }

  function leve() { return raiz.classList.contains('mt-perf'); }

  if (global.document) decidir();

  global.MTPerf = {
    decidir: decidir, medir: medir, leve: leve, ehTv: ehTv,
    estado: estado, ligarLeve: ligarLeve, mediana: mediana, LIMITE: LIMITE,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = global.MTPerf;
})(typeof window !== 'undefined' ? window : globalThis);
