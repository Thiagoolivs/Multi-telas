/*
 * server/design-system.js — as regras de arte que NÃO delegamos ao modelo.
 *
 * Um LLM escreve copy bem e escolhe direção com gosto, mas erra sistematicamente
 * em: contraste, hierarquia de tamanhos, margem de segurança e quanto texto cabe
 * numa caixa. Isso é aritmética — então fica aqui, em código testável, e o
 * modelo recebe estas regras como restrição em vez de inventá-las.
 *
 * Tudo trabalha em % da peça (0-100), igual ao modelo de composição do player.
 */

/* ---------------- Cor ---------------- */

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
function okHex(h, fallback) {
  const v = String(h || '').trim();
  const withHash = v.startsWith('#') ? v : '#' + v;
  return hex2rgb(withHash) ? withHash.toLowerCase() : fallback;
}

// Luminância relativa (WCAG 2.1).
function luminance(hex) {
  const rgb = hex2rgb(hex);
  if (!rgb) return 0;
  const [r, g, b] = rgb.map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
// Razão de contraste entre duas cores: 1 (igual) a 21 (preto × branco).
function contrast(a, b) {
  const la = luminance(a), lb = luminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}
// Texto legível sobre um fundo. Em signage o piso é mais alto que na web:
// a pessoa lê de longe, de relance e muitas vezes com reflexo na tela.
const MIN_CONTRAST = 4.5;
const MIN_CONTRAST_TITULO = 3.5; // texto grande tolera um pouco menos
function textOn(bg) {
  const branco = contrast(bg, '#ffffff');
  const preto = contrast(bg, '#0b1120');
  return branco >= preto ? '#ffffff' : '#0b1120';
}

function mix(a, b, t) {
  const ra = hex2rgb(a), rb = hex2rgb(b);
  if (!ra || !rb) return a;
  return rgb2hex(ra[0] + (rb[0] - ra[0]) * t, ra[1] + (rb[1] - ra[1]) * t, ra[2] + (rb[2] - ra[2]) * t);
}
const escurecer = (hex, t) => mix(hex, '#000000', t);
const clarear = (hex, t) => mix(hex, '#ffffff', t);

// Gira a matiz. Serve para derivar um acento que combina quando o cliente
// informou só uma cor de marca.
function girarMatiz(hex, graus) {
  const rgb = hex2rgb(hex);
  if (!rgb) return hex;
  let [r, g, b] = rgb.map((v) => v / 255);
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
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const seg = [[c, x, 0], [x, c, 0], [0, c, x], [0, x, c], [x, 0, c], [c, 0, x]][Math.floor(h / 60) % 6];
  return rgb2hex((seg[0] + m) * 255, (seg[1] + m) * 255, (seg[2] + m) * 255);
}

/*
 * Paleta com PAPÉIS, não uma lista solta de cores. O modelo escolhe a marca;
 * os tons de apoio saem daqui — é o que evita aquele resultado "duas cores
 * aleatórias brigando" e garante que o texto sempre tenha contraste.
 */
function buildPalette(brandIn, brand2In, estilo) {
  const brand = okHex(brandIn, '#1e3a8a');
  // Sem cor secundária: deriva uma análoga (não complementar — complementar
  // vibra demais em tela grande).
  const brand2 = okHex(brand2In, girarMatiz(brand, 35));
  const escuro = estilo !== 'claro';

  const bg = escuro ? escurecer(brand, 0.82) : clarear(brand, 0.9);
  const bgAlt = escuro ? escurecer(brand, 0.68) : clarear(brand, 0.78);
  const superficie = escuro ? escurecer(brand, 0.55) : clarear(brand, 0.6);

  // Acento precisa saltar do fundo; se não saltar, clareia/escurece até saltar.
  let acento = brand2;
  let guarda = 0;
  while (contrast(acento, bg) < 3 && guarda++ < 12) {
    acento = escuro ? clarear(acento, 0.12) : escurecer(acento, 0.12);
  }

  return {
    brand, brand2, escuro,
    bg, bgAlt, superficie, acento,
    texto: textOn(bg),
    textoSuave: escuro ? clarear(bg, 0.62) : escurecer(bg, 0.55),
    textoNoAcento: textOn(acento),
    textoNaMarca: textOn(brand),
  };
}

/* ---------------- Formato e área segura ---------------- */

const FORMATOS = {
  '16/9': { ratio: 16 / 9, nome: 'TV horizontal' },
  '9/16': { ratio: 9 / 16, nome: 'TV vertical / Story' },
  '1/1': { ratio: 1, nome: 'Quadrado / Feed' },
  '21/9': { ratio: 21 / 9, nome: 'Banner largo' },
  '4/3': { ratio: 4 / 3, nome: 'TV antiga' },
};
function ratioDe(formato) {
  const f = FORMATOS[formato];
  if (f) return f.ratio;
  const [a, b] = String(formato || '16/9').split('/').map(Number);
  return (a && b) ? a / b : 16 / 9;
}

/*
 * Margem de segurança. TV corta as bordas (overscan) e o player pode rodar em
 * telas levemente diferentes — nada de texto encostado na borda. Em peça alta
 * a margem vertical em % vale menos pixel, então compensamos.
 */
function safeArea(formato) {
  const r = ratioDe(formato);
  const x = r >= 2 ? 5 : 6;          // banner largo aguenta margem menor
  const y = r >= 1 ? 7 : 5;          // peça alta: margem vertical menor em %
  return { x, y, w: 100 - x * 2, h: 100 - y * 2 };
}

/*
 * Escala tipográfica em cqw (% da largura). Uma peça vertical é estreita, então
 * o mesmo cqw resulta em texto menor na prática — daí o fator por proporção.
 */
function escalaTipografica(formato) {
  const r = ratioDe(formato);
  const k = r >= 2 ? 0.8 : r >= 1 ? 1 : 1.7; // alta precisa de cqw maior
  return {
    kicker: 2.2 * k,
    headline: 7.5 * k,
    sub: 3.2 * k,
    cta: 2.8 * k,
    // Título gigante para peça de um recado só (promo forte).
    display: 11 * k,
  };
}

/*
 * Quanto texto cabe numa caixa, aproximado. Usa a largura média de caractere
 * de uma sans-serif (~0.52 do corpo) e a altura de linha. Serve para decidir
 * se reduz o corpo ou se pede um texto mais curto ao modelo.
 */
function cabeNaCaixa(texto, box, fontCqw, formato) {
  const t = String(texto || '');
  if (!t) return { cabe: true, linhas: 0, sugestaoCqw: fontCqw };
  const r = ratioDe(formato);
  // Tudo em "unidades de largura da peça" (100 = largura total).
  const larguraCaractere = fontCqw * 0.52;
  const porLinha = Math.max(1, Math.floor(box.w / larguraCaractere));
  const linhas = Math.ceil(t.length / porLinha);
  // cqw mede % da LARGURA. Para comparar com a altura da caixa (% da altura),
  // converte: 1% de altura equivale a (1/r)% da largura.
  const alturaEmUnidadesLargura = box.h / r;
  const alturaLinha = fontCqw * 1.15;
  const linhasCabem = Math.max(1, Math.floor(alturaEmUnidadesLargura / alturaLinha));
  const cabe = linhas <= linhasCabem;
  const sugestaoCqw = cabe ? fontCqw : Math.max(1.4, fontCqw * Math.sqrt(linhasCabem / linhas) * 0.96);
  return { cabe, linhas, linhasCabem, sugestaoCqw: Number(sugestaoCqw.toFixed(2)) };
}

/* ---------------- Geometria ---------------- */

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const num = (v, fallback) => (Number.isFinite(Number(v)) ? Number(v) : fallback);

// Dois retângulos se sobrepõem? (usado para separar textos que colidem)
function sobrepoe(a, b) {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}
function areaSobreposta(a, b) {
  if (!sobrepoe(a, b)) return 0;
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return w * h;
}

module.exports = {
  hex2rgb, rgb2hex, okHex, luminance, contrast, textOn, mix, escurecer, clarear, girarMatiz,
  buildPalette, MIN_CONTRAST, MIN_CONTRAST_TITULO,
  FORMATOS, ratioDe, safeArea, escalaTipografica, cabeNaCaixa,
  clamp, num, sobrepoe, areaSobreposta,
};
