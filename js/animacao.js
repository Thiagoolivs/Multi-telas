/*
 * js/animacao.js — como um elemento ENTRA e como ele se mexe depois.
 *
 * É o que separa uma peça de mídia indoor de um slide de PowerPoint: os
 * elementos não aparecem todos de uma vez, eles ENTRAM — um depois do outro,
 * cada um de um lado — e alguns continuam respirando enquanto a peça fica no
 * ar. Uma tela parada some da atenção de quem passa; uma tela que se mexe é
 * lida sem ninguém decidir lê-la.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * DUAS REGRAS QUE MANDAM EM TUDO AQUI:
 *
 * 1. SÓ `transform` E `opacity`. São as duas coisas que o navegador anima na
 *    GPU, sem refazer o layout. Animar `top`/`left`/`width` recalcula a página
 *    a cada quadro — numa TV de R$ 900, que é onde este player mais roda, isso
 *    é a diferença entre uma peça fluida e uma peça travando.
 *
 * 2. TODA ANIMAÇÃO TERMINA EM REPOUSO. A entrada acaba em `transform: none` e
 *    `opacity: 1` — o estado em que o editor desenhou a peça. Uma animação que
 *    parasse fora do lugar deixaria a peça diferente do que foi aprovado, e
 *    quem publicou só descobriria olhando a parede.
 *
 * Este arquivo é uma fonte só, usada em três lugares: o player (global), o
 * servidor (CommonJS) e o painel React (ESM, via web/src/lib/animacao.js).
 */
(function (raiz, fabrica) {
  var api = fabrica();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (raiz) raiz.MTAnim = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  /*
   * As entradas.
   *
   * `classe` é o nome no CSS (css/player.css e o palco do editor); `label` é o
   * que a pessoa lê no painel. Sem o par, ou o CSS ganha nome de gente ou o
   * painel mostra "mt-anim-subir" para quem só quer escolher.
   */
  var ENTRADAS = [
    { id: '', label: 'Sem animação', classe: '' },
    { id: 'aparecer', label: 'Aparecer', classe: 'mt-e-aparecer' },
    { id: 'subir', label: 'Subir', classe: 'mt-e-subir' },
    { id: 'descer', label: 'Descer', classe: 'mt-e-descer' },
    { id: 'esquerda', label: 'Entrar pela esquerda', classe: 'mt-e-esquerda' },
    { id: 'direita', label: 'Entrar pela direita', classe: 'mt-e-direita' },
    { id: 'crescer', label: 'Crescer', classe: 'mt-e-crescer' },
    { id: 'estourar', label: 'Estourar', classe: 'mt-e-estourar' },
    { id: 'girar', label: 'Girar entrando', classe: 'mt-e-girar' },
  ];

  /*
   * O movimento contínuo, que fica enquanto a peça está no ar.
   *
   * São de propósito SUAVES e LENTOS. Movimento contínuo forte cansa em vinte
   * segundos, e uma peça de signage fica no ar por doze — a graça é chamar a
   * atenção de quem passa, não competir com o conteúdo.
   */
  var CONTINUAS = [
    { id: '', label: 'Parado', classe: '' },
    { id: 'flutuar', label: 'Flutuar', classe: 'mt-c-flutuar' },
    { id: 'pulsar', label: 'Pulsar', classe: 'mt-c-pulsar' },
    { id: 'balancar', label: 'Balançar', classe: 'mt-c-balancar' },
    { id: 'brilhar', label: 'Brilhar', classe: 'mt-c-brilhar' },
  ];

  var LIMITES = {
    duracao: { min: 0.2, max: 3, padrao: 0.6 },
    atraso: { min: 0, max: 6, padrao: 0 },
  };

  function achar(lista, id) {
    for (var i = 0; i < lista.length; i++) if (lista[i].id === id) return lista[i];
    return lista[0];
  }

  function limitar(v, lim) {
    var n = Number(v);
    if (!isFinite(n)) return lim.padrao;
    return Math.max(lim.min, Math.min(lim.max, n));
  }

  /*
   * Lê a animação de um elemento e devolve o que aplicar.
   *
   * Devolve sempre um objeto, mesmo quando não há animação nenhuma — quem
   * chama não deveria precisar perguntar se existe antes de perguntar o quê.
   */
  function ler(el) {
    var a = (el && el.anim) || {};
    var entrada = achar(ENTRADAS, a.entrada || '');
    var continua = achar(CONTINUAS, a.continua || '');
    return {
      entrada: entrada.id,
      continua: continua.id,
      classes: [entrada.classe, continua.classe].filter(Boolean),
      duracao: limitar(a.duracao, LIMITES.duracao),
      atraso: limitar(a.atraso, LIMITES.atraso),
      tem: !!(entrada.classe || continua.classe),
    };
  }

  /*
   * O estilo do elemento animado, em cqw-livre (só tempo).
   *
   * `animationDelay` vale para as DUAS: a contínua também espera a entrada
   * terminar, senão o elemento flutua enquanto ainda está deslizando para
   * dentro e o olho não entende nenhum dos dois movimentos.
   */
  function estilo(el) {
    var a = ler(el);
    if (!a.tem) return {};
    var fora = { animationDuration: a.duracao + 's' };
    if (a.atraso) fora.animationDelay = a.atraso + 's';
    if (a.entrada && a.continua) {
      // Duas animações no mesmo elemento: a entrada roda uma vez, a contínua
      // começa depois dela e repete. Os valores vão em par, na mesma ordem
      // das classes.
      fora.animationDuration = a.duracao + 's, 3.6s';
      fora.animationDelay = a.atraso + 's, ' + (a.atraso + a.duracao) + 's';
    }
    return fora;
  }

  /*
   * Sugere um escalonamento: cada elemento entra um pouco depois do anterior.
   *
   * É o que faz a peça parecer dirigida em vez de sortida. O passo é pequeno
   * (0,12s) porque a peça inteira precisa estar montada bem antes dos doze
   * segundos que ela fica no ar — escalonar demais é fazer o público esperar
   * o anúncio terminar de chegar.
   */
  function escalonar(elementos, passo, entradaPadrao) {
    var p = Number(passo);
    if (!isFinite(p) || p < 0) p = 0.12;
    /*
     * Quem não tem entrada GANHA uma.
     *
     * Sem isto o botão não fazia nada visível numa peça recém-criada: nenhum
     * elemento tinha animação, escalonar só ajustava a espera de coisa
     * nenhuma, e o clique parecia quebrado. Quem clica em "escalonar" está
     * pedindo que a peça entre como propaganda, não que ela espere parada.
     */
    var padrao = achar(ENTRADAS, entradaPadrao || 'subir').id || 'subir';
    return (elementos || []).map(function (e, i) {
      var anim = Object.assign({}, e.anim || {});
      if (!anim.entrada) anim.entrada = padrao;
      anim.atraso = Math.round(i * p * 100) / 100;
      return Object.assign({}, e, { anim: anim });
    });
  }

  return {
    ENTRADAS: ENTRADAS,
    CONTINUAS: CONTINUAS,
    LIMITES: LIMITES,
    ler: ler,
    estilo: estilo,
    escalonar: escalonar,
  };
});
