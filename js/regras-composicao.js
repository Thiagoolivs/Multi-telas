/*
 * js/regras-composicao.js — as regras de composição por tipo de peça (D44).
 *
 * "Um elemento domina", "nada encostado na borda", "nada escrito sobre foto
 * sem véu": a régua do compositor (server/compositor.js) dizia isso em
 * palavras, e o detector (js/peca-conferir.js) só media vazamento e texto
 * sobre texto. Aqui as regras viram NÚMERO, num lugar só: o gerador recebe
 * o texto delas (paraIA) e o detector confere a peça montada contra os
 * mesmos números (avaliar). Mudou a regra, mudou para os dois.
 *
 * As medidas são em pixels da TV de referência (1080 linhas): a bancada e o
 * painel montam a peça no tamanho REAL da zona, então o que eles medem já
 * está nessa escala.
 *
 * Módulo duplo: no Node exporta as partes puras, para teste; no navegador,
 * `MTRegras`. Sem spread de objeto (o mesmo estilo de js/quiz.js).
 */
(function (raiz, fabrica) {
  var api = fabrica();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (raiz) raiz.MTRegras = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var REGRAS = {
    /*
     * A menor letra que ainda se lê na parede: 14px numa TV de 1080 linhas
     * (uns 8mm numa TV de 50"). É o piso do texto miúdo — o "de" riscado, o
     * rótulo do preço. Texto que a pessoa precisa ler de verdade vai bem
     * acima disso; abaixo, vira textura.
     */
    letraMin: 14,
    /*
     * O piso do respiro do texto até a borda da peça, em px: [lados, topo e
     * base]. A TV corta um pouco da borda (overscan) e texto colado nela
     * parece cortado mesmo quando não está. É o PISO — o alvo da régua
     * visual é bem mais (~6cqw). Nas faixas a altura é pouca: em cima e
     * embaixo, o piso é menor.
     */
    margem: { destaque: [16, 16], lateral: [16, 16], cabecalho: [16, 6], rodape: [16, 6] },
    /*
     * QR que o celular lê de onde a pessoa está: 160px na TV de 1080 linhas
     * (uns 9cm numa TV de 50", lido a ~1m — os nossos links dão QR de 25 a
     * 29 módulos, uns 4px por módulo). Nas faixas não cabe um QR desse
     * tamanho: QR lá é QR que ninguém lê.
     */
    qr: { min: 160, papeis: ['destaque', 'lateral'] },
    /*
     * Contraste do texto com o que está atrás dele: 3:1. As cores são só por
     * token, e js/tokens.js já garante 4,5:1 ao texto e ao preço e 3:1 ao
     * destaque sobre os fundos — abaixo de 3, a COMPOSIÇÃO juntou o par
     * errado (texto suave sobre o destaque, destaque sobre destaque).
     */
    contraste: 3,
    /*
     * Hierarquia: com o número da oferta na peça (o preço, a parcela, o
     * desconto, o "10x"), ele é o maior texto — é o que se lê do outro lado
     * da loja. Empate com o título vale (o prato do dia).
     */
    numeros: ['preco', 'parcela', 'desconto', 'vezes', 'oferta', 'numero'],
    // O que cabe na faixa do cabeçalho com marca, chamada e relógio — nas seis marcas, deitada e em pé.
    faixa: { marca: 18, chamada: 38 },
    /*
     * Texto sobre foto: a foto muda (o cliente troca), então o contraste é
     * medido no PIOR caso — foto toda preta e foto toda branca por baixo do
     * véu. Com véu de verdade, os dois casos passam. O piso é 2,5 e não 3:
     * o destaque tem 3:1 sobre o fundo CHEIO (o contrato de js/tokens.js),
     * e sob o véu quase cheio fica entre 2,5 e 3 — se lê. Abaixo disso é a
     * foto aparecendo atrás do texto (o kicker sobre os óculos: 1,2:1).
     */
    sobreFoto: 2.5,
  };

  // A zona em que cada papel é pensado (layout Corporativo em 1080p) — para dizer as regras à IA em cq.
  var ZONA = { destaque: [1405, 832], lateral: [515, 832], cabecalho: [1920, 130], rodape: [1920, 119] };

  var um = function (n) { return Math.round(n * 10) / 10; };

  /*
   * O texto das regras para o prompt do compositor, nas unidades que ele usa
   * (cq, relativas à zona). As frases dizem o porquê: a IA respeita melhor a
   * regra que entende.
   */
  function paraIA(papel) {
    var z = ZONA[papel] || ZONA.destaque;
    var m = REGRAS.margem[papel] || REGRAS.margem.destaque;
    var menor = Math.min(z[0], z[1]);
    var linhas = [
      'REGRAS DE COMPOSIÇÃO DESTE PAPEL (o detector mede a peça montada; ' + z[0] + '×' + z[1] + ' é a zona de referência):',
      '- Letra mínima: ' + um(REGRAS.letraMin / z[0] * 100) + 'cqw (' + REGRAS.letraMin + 'px na TV). Menor que isso ninguém lê da parede.',
      '- Nenhum texto a menos de ' + um(m[0] / z[0] * 100) + 'cqw das laterais nem de ' + um(m[1] / z[1] * 100) + 'cqh do topo e da base — mesmo com a fonte larga da marca.',
      '- Par de cores: texto e preço sobre os fundos; var(--mt-sobre-destaque) sobre var(--mt-destaque). Texto suave ou destaque sobre o destaque some.',
    ];
    if (REGRAS.qr.papeis.indexOf(papel) >= 0) {
      linhas.push('- Texto sobre foto só com véu forte o bastante para dar ' + REGRAS.sobreFoto + ':1 com qualquer foto por baixo, clara ou escura — e isso vale no formato em pé e na lateral, onde a foto sobe para trás do texto.');
      linhas.push('- Com preço, parcela ou desconto: o número é o MAIOR texto da peça, em data-campo="preco" (ou "parcela", "desconto"), centavos à parte.');
      linhas.push('- QR (data-campo-qr) com lado de pelo menos ' + um(REGRAS.qr.min / menor * 100) + 'cqmin (' + REGRAS.qr.min + 'px na TV), inteiro dentro da peça e sem nada por cima.');
    } else {
      linhas.push('- Sem QR nesta faixa: aqui ele fica pequeno demais para o celular ler.');
      // Medido na bancada (D44): mais que isso empurra o relógio para fora na faixa em pé.
      linhas.push('- Na faixa: o nome da marca com até ' + REGRAS.faixa.marca + ' letras numa linha e a chamada com até ' + REGRAS.faixa.chamada + ' — em pé (1080 de largura), a chamada pode quebrar em duas linhas.');
    }
    return linhas.join('\n');
  }

  /* ---------------- cor ---------------- */

  // Uma camada sobre a outra (cores {r,g,b} de 0 a 255 e alfa de 0 a 1).
  function sobre(cima, baixo) {
    var a = cima.a + baixo.a * (1 - cima.a);
    if (!a) return { r: 0, g: 0, b: 0, a: 0 };
    var f = function (k) { return (cima[k] * cima.a + baixo[k] * baixo.a * (1 - cima.a)) / a; };
    return { r: f('r'), g: f('g'), b: f('b'), a: a };
  }

  function luminancia(c) {
    var lin = function (v) { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    return 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b);
  }

  function contraste(a, b) {
    var la = luminancia(a), lb = luminancia(b);
    return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
  }

  // Parte nas vírgulas de fora dos parênteses: "linear-gradient(…, rgb(1, 2, 3) 40%)" tem vírgula dentro.
  function partir(s) {
    var partes = [], fundo = 0, ini = 0;
    for (var i = 0; i < s.length; i++) {
      var ch = s[i];
      if (ch === '(') fundo++;
      else if (ch === ')') fundo--;
      else if (ch === ',' && !fundo) { partes.push(s.slice(ini, i).trim()); ini = i + 1; }
    }
    partes.push(s.slice(ini).trim());
    return partes.filter(Boolean);
  }

  var COR_NA_FRENTE = /^((?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\([^()]*\)|#[0-9a-f]{3,8}\b|[a-z]+)\s*(.*)$/i;
  var DIRECOES = { top: [0, -1], bottom: [0, 1], left: [-1, 0], right: [1, 0] };

  /*
   * O background-image calculado ("linear-gradient(90deg, rgb(…) 40%, …)"),
   * em camadas — a primeira da lista é a de CIMA. `lerCor` transforma o
   * texto de uma cor em {r,g,b,a} (no navegador, um pixel de canvas; no
   * teste, um leitor de rgb()). Imagem que não é gradiente volta como nula.
   */
  function lerGradientes(valor, lerCor) {
    if (!valor || valor === 'none') return [];
    return partir(valor).map(function (camada) {
      var m = /^(?:repeating-)?(linear|radial|conic)-gradient\((.*)\)$/i.exec(camada);
      if (!m) return null;
      var args = partir(m[2]);
      var g = { tipo: m[1].toLowerCase() === 'linear' ? 'linear' : 'media', dir: null, paradas: [] };
      if (g.tipo === 'linear' && args.length) {
        var a = /^(-?[\d.]+)(deg|turn|rad|grad)$/i.exec(args[0]);
        if (a) {
          var n = parseFloat(a[1]), u = a[2].toLowerCase();
          g.dir = { graus: u === 'turn' ? n * 360 : u === 'rad' ? n * 180 / Math.PI : u === 'grad' ? n * 0.9 : n };
          args.shift();
        } else if (/^to\s/i.test(args[0])) {
          var lados = args.shift().slice(3).trim().toLowerCase().split(/\s+/);
          var x = 0, y = 0;
          lados.forEach(function (l) { var d = DIRECOES[l]; if (d) { x += d[0]; y += d[1]; } });
          g.dir = { canto: [x, y] };
        }
      }
      args.forEach(function (arg) {
        var p = COR_NA_FRENTE.exec(arg);
        var cor = p && lerCor(p[1]);
        if (!cor) return; // a forma do radial ("120% 100% at 0% 0%") ou uma dica de transição
        var pos = /(-?[\d.]+)(%|px)/.exec(p[2] || '');
        g.paradas.push({ cor: cor, pos: pos ? parseFloat(pos[1]) / (pos[2] === '%' ? 100 : 1) : null, px: !!(pos && pos[2] === 'px') });
      });
      return g.paradas.length ? g : null;
    });
  }

  // As posições que faltam são distribuídas por igual entre as conhecidas (como o CSS faz).
  function posicoes(paradas, L) {
    var ps = paradas.map(function (p) { return p.pos == null ? null : p.px ? p.pos / L : p.pos; });
    if (ps[0] == null) ps[0] = 0;
    if (ps[ps.length - 1] == null) ps[ps.length - 1] = 1;
    for (var i = 1; i < ps.length; i++) {
      if (ps[i] != null) continue;
      var j = i;
      while (ps[j] == null) j++;
      for (var k = i; k < j; k++) ps[k] = ps[i - 1] + (ps[j] - ps[i - 1]) * (k - i + 1) / (j - i + 1);
    }
    for (var q = 1; q < ps.length; q++) ps[q] = Math.max(ps[q], ps[q - 1]);
    return ps;
  }

  // Mistura em alfa pré-multiplicado, como o navegador pinta o gradiente.
  function entre(a, b, t) {
    var A = a.a + (b.a - a.a) * t;
    if (!A) return { r: 0, g: 0, b: 0, a: 0 };
    var f = function (k) { return (a[k] * a.a + (b[k] * b.a - a[k] * a.a) * t) / A; };
    return { r: f('r'), g: f('g'), b: f('b'), a: A };
  }

  /*
   * A cor de um gradiente num ponto da caixa: (fx, fy) de 0 a 1, w e h em
   * pixels. Linear, pela geometria do CSS (o ângulo e o comprimento da linha
   * do gradiente); radial e cônico, pela média das paradas — o véu em
   * radial é raro, e a média é o meio-termo honesto.
   */
  function corNoGradiente(g, w, h, fx, fy) {
    var ps = g.paradas;
    if (g.tipo !== 'linear') {
      return ps.reduce(function (acc, p, i) { return i ? entre(acc, p.cor, 1 / (i + 1)) : p.cor; }, null);
    }
    var dx, dy;
    if (g.dir && g.dir.canto && g.dir.canto[0] && g.dir.canto[1]) {
      // Canto: a linha é perpendicular à diagonal que liga os outros dois cantos.
      var n = Math.sqrt(w * w + h * h) || 1;
      dx = g.dir.canto[0] * h / n; dy = g.dir.canto[1] * w / n;
    } else if (g.dir && g.dir.canto) {
      dx = g.dir.canto[0]; dy = g.dir.canto[1];
    } else {
      var rad = ((g.dir ? g.dir.graus : 180) * Math.PI) / 180;
      dx = Math.sin(rad); dy = -Math.cos(rad);
    }
    var L = Math.abs(w * dx) + Math.abs(h * dy) || 1;
    var t = ((fx - 0.5) * w * dx + (fy - 0.5) * h * dy) / L + 0.5;
    var pos = posicoes(ps, L);
    if (t <= pos[0]) return ps[0].cor;
    for (var i = 1; i < ps.length; i++) {
      if (t <= pos[i]) return pos[i] === pos[i - 1] ? ps[i].cor : entre(ps[i - 1].cor, ps[i].cor, (t - pos[i - 1]) / (pos[i] - pos[i - 1]));
    }
    return ps[ps.length - 1].cor;
  }

  /*
   * O fundo atrás do texto, das camadas de baixo para cima. `foto`: há uma
   * foto por baixo das camadas — devolve os DOIS piores casos (foto preta e
   * foto branca). Sem foto, a base é a TV apagada (preto).
   */
  function fundos(camadas, foto) {
    var bases = foto ? [{ r: 0, g: 0, b: 0, a: 1 }, { r: 255, g: 255, b: 255, a: 1 }] : [{ r: 0, g: 0, b: 0, a: 1 }];
    return bases.map(function (base) { return camadas.reduce(function (acc, c) { return sobre(c, acc); }, base); });
  }

  // O menor contraste do texto entre os fundos possíveis.
  function piorContraste(corDoTexto, fs) {
    return fs.reduce(function (pior, f) { return Math.min(pior, contraste(sobre(corDoTexto, f), f)); }, Infinity);
  }

  /* ---------------- a régua ---------------- */

  var px = function (n) { return Math.round(n) + 'px'; };

  /*
   * Confere as medidas de uma peça montada contra as regras.
   *
   * m = { papel, w, h,
   *       textos: [{ nome, px, linhas: [{left, top, right, bottom}], contraste, sobreFoto }],
   *       qrs: [{ nome, lado, caixa: {left, top, right, bottom} }] }
   * — tudo em pixels reais, relativo ao canto da peça. Um campo pode vir em
   * vários pedaços (o título com o <em> maior): cada pedaço é um texto.
   *
   * Devolve [{ regra, campo, texto }], um por regra e campo.
   */
  function avaliar(m) {
    var achados = [];
    var visto = {};
    var acusar = function (regra, campo, texto) {
      if (visto[regra + '|' + campo]) return;
      visto[regra + '|' + campo] = true;
      achados.push({ regra: regra, campo: campo, texto: texto });
    };
    var margem = REGRAS.margem[m.papel] || REGRAS.margem.destaque;
    var lados = margem[0], topo = margem[1];

    (m.textos || []).forEach(function (t) {
      if (t.px < REGRAS.letraMin - 0.5) acusar('letra', t.nome, 'letra de ' + px(t.px) + ' (o mínimo é ' + REGRAS.letraMin + 'px)');
      (t.linhas || []).forEach(function (l) {
        var dl = Math.min(l.left, m.w - l.right), dv = Math.min(l.top, m.h - l.bottom);
        // Fora da peça é vazamento — o detector já acusa; aqui é o texto que ficou dentro, mas colado.
        if (dl < 0 || dv < 0) return;
        if (dl < lados - 0.5 || dv < topo - 0.5) acusar('margem', t.nome, 'encostado na borda (' + px(Math.min(dl < lados ? dl : Infinity, dv < topo ? dv : Infinity)) + ' dela)');
      });
      if (t.contraste != null && isFinite(t.contraste)) {
        if (t.sobreFoto) {
          if (t.contraste < REGRAS.sobreFoto) acusar('foto', t.nome, 'sobre a foto sem véu bastante (' + um(t.contraste) + ':1 com a foto mais clara ou mais escura)');
        } else if (t.contraste < REGRAS.contraste) {
          acusar('contraste', t.nome, 'some no fundo (' + um(t.contraste) + ':1, o mínimo é ' + REGRAS.contraste + ':1)');
        }
      }
    });

    // O número da oferta é o maior texto (a maior letra de cada campo, contra a maior dos outros).
    var maior = {};
    (m.textos || []).forEach(function (t) { maior[t.nome] = Math.max(maior[t.nome] || 0, t.px); });
    var numero = null, outro = null;
    Object.keys(maior).forEach(function (n) {
      if (REGRAS.numeros.indexOf(n) >= 0) { if (!numero || maior[n] > maior[numero]) numero = n; }
      else if (!outro || maior[n] > maior[outro]) outro = n;
    });
    if (numero && outro && maior[numero] < maior[outro] * 0.98) {
      acusar('hierarquia', numero, 'o número da oferta (' + px(maior[numero]) + ') é menor que "' + outro + '" (' + px(maior[outro]) + ')');
    }

    (m.qrs || []).forEach(function (q) {
      if (REGRAS.qr.papeis.indexOf(m.papel) < 0) acusar('qr-faixa', q.nome, 'QR numa faixa: pequeno demais para o celular ler');
      else if (q.lado < REGRAS.qr.min) acusar('qr-pequeno', q.nome, 'QR de ' + px(q.lado) + ' (o mínimo é ' + REGRAS.qr.min + 'px para o celular ler)');
      var c = q.caixa;
      if (c && (c.left < -1 || c.top < -1 || c.right > m.w + 1 || c.bottom > m.h + 1)) acusar('qr-cortado', q.nome, 'QR cortado na borda');
    });

    return achados;
  }

  return {
    REGRAS: REGRAS, ZONA: ZONA, paraIA: paraIA, avaliar: avaliar,
    sobre: sobre, contraste: contraste, luminancia: luminancia,
    lerGradientes: lerGradientes, corNoGradiente: corNoGradiente, fundos: fundos, piorContraste: piorContraste,
  };
});
