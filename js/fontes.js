/*
 * js/fontes.js — o catálogo de tipografia, num lugar só.
 *
 * Antes deste arquivo a mesma lista de famílias existia em dois lugares
 * (server/design-system.js e js/theme.js) e não existia num terceiro (o
 * editor). O resultado era o pior possível de se descobrir: o editor
 * desenhava o texto com a fonte do sistema e a TV desenhava com Anton, então
 * a pessoa compunha uma peça, achava bonita, publicava, e via outra coisa na
 * parede. Estilo que não é o mesmo dos dois lados não é estilo, é surpresa.
 *
 * Agora existe UM catálogo. O servidor faz `require` daqui, o player carrega
 * como script, e o editor tem um espelho em web/src/lib/fontes.js que um
 * teste compara com este arquivo — inclusive o CSS que sai de estiloTexto,
 * que é o que de fato aparece na tela.
 *
 * O que faz uma peça parecer "de agência" é quase sempre a tipografia: uma
 * condensada pesada gigante, uma script para o toque humano, uma serifada
 * para elegância. Só com a fonte do sistema tudo sai com cara de slide.
 */
(function (raiz, fabrica) {
  var api = fabrica();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (raiz) raiz.MTFontes = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var SISTEMA = "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";

  /*
   * Cada família guarda:
   *
   *   css       pilha completa, já com o que usar quando a Google não responde
   *   google    o que pedir à Google Fonts (null = fonte do sistema, sem rede)
   *   pesos     os pesos que a fonte REALMENTE tem
   *   italico   se existe itálico desenhado
   *   caixaAlta se a família só funciona em caixa alta (é o estilo dela)
   *   entrelinha  altura de linha própria
   *   largura   largura média de caractere, relativa ao corpo
   *
   * `pesos` não é decoração: sem ele, escolher "Extra negrito" numa fonte que
   * só tem um peso faz o navegador ENGORDAR a letra sozinho, e cada navegador
   * engorda de um jeito. O editor mostra só os pesos que existem, e o que se
   * vê é o que a TV desenha.
   */
  var FAMILIAS = {
    /* ---- Sem serifa, para ler ---- */
    sans: {
      rotulo: 'Inter', papel: 'Leitura, textos de apoio',
      css: "'Inter'," + SISTEMA,
      google: 'Inter:ital,wght@0,400;0,500;0,600;0,700;0,800;0,900;1,400;1,700',
      pesos: [400, 500, 600, 700, 800, 900], italico: true,
      caixaAlta: false, entrelinha: 1.08, largura: 0.52, larguraFallback: 0.55,
    },
    moderna: {
      rotulo: 'Poppins', papel: 'Geométrica, corporativa moderna',
      css: "'Poppins'," + SISTEMA,
      google: 'Poppins:ital,wght@0,400;0,500;0,600;0,700;0,800;1,400;1,600',
      pesos: [400, 500, 600, 700, 800], italico: true,
      caixaAlta: false, entrelinha: 1.12, largura: 0.58, larguraFallback: 0.58,
    },
    amigavel: {
      rotulo: 'Nunito', papel: 'Arredondada, tom acolhedor',
      css: "'Nunito'," + SISTEMA,
      google: 'Nunito:ital,wght@0,400;0,600;0,700;0,800;0,900;1,400;1,700',
      pesos: [400, 600, 700, 800, 900], italico: true,
      caixaAlta: false, entrelinha: 1.1, largura: 0.52, larguraFallback: 0.55,
    },
    tech: {
      rotulo: 'Space Grotesk', papel: 'Técnica, ar de produto',
      css: "'Space Grotesk'," + SISTEMA,
      google: 'Space+Grotesk:wght@400;500;600;700',
      pesos: [400, 500, 600, 700], italico: false,
      caixaAlta: false, entrelinha: 1.08, largura: 0.53, larguraFallback: 0.55,
    },

    /* ---- Cartaz: título que ocupa meia peça ---- */
    display: {
      rotulo: 'Anton', papel: 'Cartaz — o título que grita',
      css: "'Anton','Archivo Black',Impact," + SISTEMA,
      google: 'Anton',
      pesos: [400], italico: false,
      caixaAlta: true, entrelinha: 0.92, largura: 0.42, larguraFallback: 0.60,
    },
    condensada: {
      rotulo: 'Oswald', papel: 'Condensada com graus de peso',
      css: "'Oswald','Archivo Narrow'," + SISTEMA,
      google: 'Oswald:wght@400;500;600;700',
      pesos: [400, 500, 600, 700], italico: false,
      caixaAlta: true, entrelinha: 0.96, largura: 0.45, larguraFallback: 0.56,
    },
    grotesca: {
      rotulo: 'Archivo Black', papel: 'Bloco pesado, largo',
      css: "'Archivo Black',Impact," + SISTEMA,
      google: 'Archivo+Black',
      pesos: [400], italico: false,
      caixaAlta: false, entrelinha: 1.0, largura: 0.62, larguraFallback: 0.62,
    },
    slab: {
      rotulo: 'Alfa Slab One', papel: 'Serifa grossa, promoção retrô',
      css: "'Alfa Slab One',Rockwell,Georgia,serif",
      google: 'Alfa+Slab+One',
      pesos: [400], italico: false,
      caixaAlta: false, entrelinha: 1.05, largura: 0.58, larguraFallback: 0.58,
    },

    /* ---- Serifadas ---- */
    serifada: {
      rotulo: 'Playfair Display', papel: 'Elegante, alto padrão',
      css: "'Playfair Display',Georgia,serif",
      google: 'Playfair+Display:ital,wght@0,400;0,700;0,900;1,400;1,700',
      pesos: [400, 500, 600, 700, 800, 900], italico: true,
      caixaAlta: false, entrelinha: 1.08, largura: 0.50, larguraFallback: 0.54,
    },
    leitura: {
      rotulo: 'Merriweather', papel: 'Serifada de texto corrido',
      css: "'Merriweather',Georgia,serif",
      google: 'Merriweather:ital,wght@0,300;0,400;0,700;0,900;1,400;1,700',
      pesos: [300, 400, 700, 900], italico: true,
      caixaAlta: false, entrelinha: 1.35, largura: 0.56, larguraFallback: 0.56,
    },

    /* ---- Manuscritas ---- */
    script: {
      rotulo: 'Great Vibes', papel: 'Assinatura, nome próprio',
      css: "'Great Vibes','Brush Script MT',cursive",
      google: 'Great+Vibes',
      pesos: [400], italico: false,
      caixaAlta: false, entrelinha: 1.3, largura: 0.40, larguraFallback: 0.50,
    },
    manuscrita: {
      rotulo: 'Caveat', papel: 'Recado à mão, informal',
      css: "'Caveat','Segoe Script',cursive",
      google: 'Caveat:wght@400;500;600;700',
      pesos: [400, 500, 600, 700], italico: false,
      caixaAlta: false, entrelinha: 1.2, largura: 0.38, larguraFallback: 0.48,
    },
  };

  var FAMILIA_PADRAO = 'sans';
  var IDS = Object.keys(FAMILIAS);

  function familia(id) { return FAMILIAS[id] ? id : FAMILIA_PADRAO; }
  function dados(id) { return FAMILIAS[familia(id)]; }

  /*
   * Largura média de caractere, para estimar se o texto cabe na caixa.
   *
   * Usamos o MAIOR entre a fonte ideal e o fallback. As famílias vêm da Google
   * Fonts, e uma TV sem internet cai na fonte do sistema — se estimássemos
   * pela ideal (mais estreita), o título estouraria a caixa justamente na tela
   * sem rede, que é onde ninguém está olhando para consertar.
   */
  function larguraCaractere(id) {
    var f = dados(id);
    return Math.max(f.largura, f.larguraFallback || 0);
  }

  /* Pesos que a família tem de verdade; o mais próximo do pedido. */
  function pesoValido(id, peso) {
    var lista = dados(id).pesos;
    var alvo = Number(peso) || 400;
    var melhor = lista[0];
    for (var i = 0; i < lista.length; i++) {
      if (Math.abs(lista[i] - alvo) < Math.abs(melhor - alvo)) melhor = lista[i];
    }
    return melhor;
  }

  /* Limites dos controles finos. Fora deles o texto quebra em vez de estilizar. */
  var ESPACAMENTO = { min: -0.08, max: 0.6 };
  var ENTRELINHA = { min: 0.75, max: 2.4 };

  /*
   * Nulo aqui quer dizer "não mexeram nisto, use o padrão da família" — e é
   * diferente de zero, que é um valor escolhido. Number(null) é 0, então sem
   * esta primeira linha um controle devolvido ao padrão viraria espaçamento
   * zero, que é outra coisa.
   */
  function limitar(v, min, max) {
    if (v === null || v === undefined || v === '') return null;
    var n = Number(v);
    if (!isFinite(n)) return null;
    return Math.max(min, Math.min(max, n));
  }

  /*
   * O CSS de um elemento de texto — a função que faz o editor e a TV
   * concordarem. Não devolve fontSize: o palco mede em cqw, o editor em px e
   * a exportação em pixels de canvas, e cada um sabe o seu. Todo o RESTO sai
   * daqui, e um teste compara este resultado com o do espelho do editor.
   */
  function estiloTexto(el) {
    var e = el || {};
    var id = familia(e.fonte);
    var f = FAMILIAS[id];
    var esp = limitar(e.espacamento, ESPACAMENTO.min, ESPACAMENTO.max);
    var ent = limitar(e.entrelinha, ENTRELINHA.min, ENTRELINHA.max);
    return {
      fontFamily: f.css,
      fontWeight: pesoValido(id, e.peso != null ? e.peso : 800),
      fontStyle: e.italico ? 'italic' : 'normal',
      // -0.01em é o aperto padrão do palco (css/player.css .mt-comp-text).
      letterSpacing: (esp != null ? esp : -0.01) + 'em',
      lineHeight: String(ent != null ? ent : f.entrelinha),
      textTransform: (e.caixaAlta || f.caixaAlta) ? 'uppercase' : 'none',
      textAlign: ['left', 'center', 'right'].indexOf(e.align) >= 0 ? e.align : 'center',
      color: e.cor || '#ffffff',
      textShadow: e.sombra ? '0 2px 14px rgba(0,0,0,.45)' : 'none',
    };
  }

  /* Lista para montar seletor, na ordem em que foram declaradas. */
  function listar() {
    return IDS.map(function (id) {
      return { id: id, rotulo: FAMILIAS[id].rotulo, papel: FAMILIAS[id].papel, css: FAMILIAS[id].css };
    });
  }

  return {
    FAMILIAS: FAMILIAS, FAMILIA_PADRAO: FAMILIA_PADRAO, IDS: IDS,
    ESPACAMENTO: ESPACAMENTO, ENTRELINHA: ENTRELINHA,
    familia: familia, dados: dados, larguraCaractere: larguraCaractere,
    pesoValido: pesoValido, estiloTexto: estiloTexto, listar: listar,
  };
});
