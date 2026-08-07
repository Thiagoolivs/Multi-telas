/*
 * js/cor.js — a matemática de cor, uma vez só.
 *
 * Isto existia duas vezes: em `server/design-system.js` (peças geradas pela IA)
 * e em `js/theme.js` (tema da tela). Mesma linguagem, dois arquivos, e as duas
 * cópias já tinham divergido em detalhes que importam — uma aceitava hex de
 * três dígitos, a outra não; uma tratava cor inválida como preta, a outra como
 * cinza médio.
 *
 * Não é hipótese de dívida técnica: em julho, `acentoSobre` devolvia 2.32:1
 * sobre laranja porque escolhia clarear ou escurecer pela luminância do fundo —
 * exatamente o bug que já tinha sido corrigido meses antes no compositor. A
 * correção não atravessou porque não havia nada por onde atravessar.
 *
 * Módulo duplo: `require()` no Node, `window.MTCor` no navegador. Mesmo truque
 * de `js/seasons.js`.
 */
(function (raiz, definir) {
  const api = definir();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  raiz.MTCor = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  // Aceita #abc e #aabbcc, com ou sem cerquilha. O formato curto entra porque
  // é o que gente digita à mão no campo de cor da marca.
  function hex2rgb(hex) {
    const h = String(hex || '').replace('#', '').trim();
    const s = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
    if (!/^[0-9a-f]{6}$/i.test(s)) return null;
    return [parseInt(s.slice(0, 2), 16), parseInt(s.slice(2, 4), 16), parseInt(s.slice(4, 6), 16)];
  }

  function rgb2hex(r, g, b) {
    const c = (v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
    return '#' + c(r) + c(g) + c(b);
  }

  /*
   * Devolve o hex CANÔNICO — minúsculo, com #, sempre seis dígitos — ou o
   * fallback. Sem fallback, devolve null.
   *
   * A expansão do formato curto acontece aqui e não só no hex2rgb: sem ela,
   * '#f80' e '#ff8800' seriam a mesma cor para o cálculo e strings diferentes
   * para comparação, que é o tipo de divergência que fez esta unificação
   * existir.
   */
  function okHex(h, fallback) {
    const rgb = hex2rgb(h);
    if (!rgb) return fallback === undefined ? null : fallback;
    return rgb2hex(rgb[0], rgb[1], rgb[2]);
  }

  // Luminância relativa (WCAG 2.1). Cor inválida conta como preta: é a leitura
  // pessimista, e pessimismo aqui erra para o lado do contraste maior.
  function luminancia(hex) {
    const rgb = hex2rgb(hex);
    if (!rgb) return 0;
    const [r, g, b] = rgb.map((v) => {
      const s = v / 255;
      return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }

  // Razão de contraste: 1 (iguais) a 21 (preto × branco).
  function contraste(a, b) {
    const la = luminancia(a), lb = luminancia(b);
    const [alto, baixo] = la > lb ? [la, lb] : [lb, la];
    return (alto + 0.05) / (baixo + 0.05);
  }

  function mix(a, b, t) {
    const ra = hex2rgb(a), rb = hex2rgb(b);
    if (!ra || !rb) return a;
    return rgb2hex(ra[0] + (rb[0] - ra[0]) * t, ra[1] + (rb[1] - ra[1]) * t, ra[2] + (rb[2] - ra[2]) * t);
  }
  const escurecer = (hex, t) => mix(hex, '#000000', t);
  const clarear = (hex, t) => mix(hex, '#ffffff', t);

  // Gira a matiz. Serve para derivar uma segunda cor que combina quando o
  // cliente informou só uma.
  function girarMatiz(hex, graus) {
    const rgb = hex2rgb(hex);
    if (!rgb) return hex;
    const [r, g, b] = rgb.map((v) => v / 255);
    const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
    let h = 0;
    if (d) {
      if (max === r) h = ((g - b) / d) % 6;
      else if (max === g) h = (b - r) / d + 2;
      else h = (r - g) / d + 4;
    }
    h = (h * 60 + graus + 360) % 360;
    const l = (max + min) / 2;
    const s = d ? d / (1 - Math.abs(2 * l - 1)) : 0;
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const x = c * (1 - Math.abs((h / 60) % 2 - 1));
    const m = l - c / 2;
    const t = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x]
      : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
    return rgb2hex((t[0] + m) * 255, (t[1] + m) * 255, (t[2] + m) * 255);
  }

  function rgba(hex, a) {
    const c = hex2rgb(hex);
    return c ? 'rgba(' + c.join(',') + ',' + a + ')' : 'rgba(255,255,255,' + a + ')';
  }
  function rgbTriple(hex) {
    const c = hex2rgb(hex);
    return c ? c.join(',') : '22,32,60';
  }

  /*
   * Acento legível sobre um fundo, partindo da cor da marca.
   *
   * Tenta clarear E escurecer. Escolher a direção pela luminância do fundo
   * parece óbvio e erra justamente nos meios-tons: laranja é escuro o bastante
   * para o cálculo mandar clarear, mas clarear laranja não passa de ~2.4:1 — o
   * selo sai lavado. Escurecer chega a 5:1 no mesmo caso.
   *
   * Este é o bug que a duplicação fez acontecer duas vezes. Agora tem um dono.
   */
  function acentoSobre(fundo, marca, alvo) {
    const minimo = alvo || 3.5;
    let melhor = marca, melhorC = contraste(fundo, marca);
    if (melhorC >= minimo) return melhor;
    /*
     * Vai até o extremo (i = 20 → a cor de destino pura). Parar em 80% deixava
     * carmins como #e11d48 empacados em 3.49:1 — a um centésimo do alvo, o que
     * na tela é a diferença entre um selo legível e um borrão.
     */
    for (const destino of ['#ffffff', '#0b1020']) {
      for (let i = 1; i <= 20; i++) {
        const c = mix(marca, destino, i * 0.05);
        const k = contraste(fundo, c);
        if (k > melhorC) { melhor = c; melhorC = k; }
        if (melhorC >= minimo) return melhor;
      }
    }
    return melhor;
  }

  // Texto legível sobre um fundo sólido. Sem marca, decide entre branco e o
  // quase-preto do sistema; com marca, tenta manter a identidade primeiro.
  function textoSobre(fundo, marca, minimo) {
    const min = minimo || 4.5;
    if (marca) {
      const claro = mix('#ffffff', marca, 0.12);
      if (contraste(fundo, claro) >= min) return claro;
      if (contraste(fundo, '#ffffff') >= min) return '#ffffff';
      const escuro = mix('#0b1020', marca, 0.15);
      return contraste(fundo, escuro) >= contraste(fundo, '#ffffff') ? escuro : '#ffffff';
    }
    return contraste(fundo, '#ffffff') >= contraste(fundo, '#0b1120') ? '#ffffff' : '#0b1120';
  }

  return {
    hex2rgb, rgb2hex, okHex, luminancia, contraste, mix,
    escurecer, clarear, girarMatiz, rgba, rgbTriple,
    acentoSobre, textoSobre,
  };
});
