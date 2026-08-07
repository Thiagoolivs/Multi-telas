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

/*
 * A aritmética vive em js/cor.js, compartilhada com o tema da tela. Aqui ficam
 * só os pisos de contraste, que são política de signage e não matemática: quem
 * lê uma TV lê de longe, de relance e com reflexo.
 */
const cor = require('../js/cor.js');
const { hex2rgb, rgb2hex, okHex, mix, escurecer, clarear, girarMatiz } = cor;
const luminance = cor.luminancia;
const contrast = cor.contraste;

const MIN_CONTRAST = 4.5;
const MIN_CONTRAST_TITULO = 3.5; // texto grande tolera um pouco menos
// Tipo display (aquele que ocupa meia peça) tolera menos ainda: é o que faz
// creme sobre laranja funcionar em cartaz. Abaixo disso vira ilegível mesmo.
const MIN_CONTRAST_DISPLAY = 2.8;
const textOn = (bg) => cor.textoSobre(bg);

function buildPalette(brandIn, brand2In, estilo, fundoModo) {
  const brand = okHex(brandIn, '#1e3a8a');
  // Sem cor secundária: deriva uma análoga (não complementar — complementar
  // vibra demais em tela grande).
  const brand2 = okHex(brand2In, girarMatiz(brand, 35));
  const escuro = estilo !== 'claro';

  let bg, bgAlt;
  if (fundoModo === 'marca') {
    // Chapado: a marca ocupa a peça inteira, quase sem variação. É o que dá
    // aquele impacto de cartaz — e exige texto em tom creme/escuro, não branco puro.
    bg = brand;
    bgAlt = escurecer(brand, 0.12);
  } else if (fundoModo === 'escuro') {
    // Quase preto, com um toque da marca — telão de palco.
    bg = escurecer(brand, 0.92);
    bgAlt = escurecer(brand, 0.86);
  } else {
    bg = escuro ? escurecer(brand, 0.82) : clarear(brand, 0.9);
    bgAlt = escuro ? escurecer(brand, 0.68) : clarear(brand, 0.78);
  }
  const superficie = escuro ? escurecer(brand, 0.55) : clarear(brand, 0.6);

  // Acento precisa saltar do fundo; se não saltar, clareia/escurece até saltar.
  let acento = brand2;
  let guarda = 0;
  while (contrast(acento, bg) < 3 && guarda++ < 12) {
    acento = escuro ? clarear(acento, 0.12) : escurecer(acento, 0.12);
  }

  // Sobre fundo chapado saturado, branco puro "vibra". Um creme quente (ou um
  // tom escuro, se a marca for clara) lê melhor — é o que as referências usam.
  const texto = fundoModo === 'marca'
    ? (luminance(bg) < 0.45 ? mix('#ffffff', '#ffe9c7', 0.55) : escurecer(bg, 0.75))
    : textOn(bg);

  return {
    brand, brand2, escuro, fundoModo: fundoModo || 'degrade',
    bg, bgAlt, superficie, acento,
    texto,
    textoSuave: escuro ? clarear(bg, 0.62) : escurecer(bg, 0.55),
    textoNoAcento: textOn(acento),
    textoNaMarca: textOn(brand),
  };
}

/* ---------------- Tipografia: famílias ---------------- */

/*
 * O que faz uma peça parecer "de agência" é quase sempre a tipografia: uma
 * condensada pesada gigante, uma script para o toque humano, uma serifada para
 * elegância. Só com a fonte do sistema tudo sai com cara de slide corporativo.
 * O player carrega estas por Google Fonts (ver js/theme.js).
 */
const FAMILIAS = {
  // Condensada pesadíssima — o "ANIVERSÁRIO" e o "RESTAURAÇÃO" das referências.
  display: { css: "'Anton', 'Archivo Black', Impact, system-ui, sans-serif", google: 'Anton', caixaAlta: true, largura: 0.42, larguraFallback: 0.60 },
  // Condensada com mais graus de peso, para títulos que precisam de nuance.
  condensada: { css: "'Oswald', 'Archivo Narrow', system-ui, sans-serif", google: 'Oswald:wght@400;500;600;700', caixaAlta: true, largura: 0.45, larguraFallback: 0.56 },
  // Manuscrita, para nome próprio / assinatura.
  script: { css: "'Great Vibes', 'Brush Script MT', cursive", google: 'Great+Vibes', caixaAlta: false, largura: 0.4, larguraFallback: 0.5 },
  // Serifada elegante (o "FELIZ" em itálico).
  serifada: { css: "'Playfair Display', Georgia, serif", google: 'Playfair+Display:ital,wght@0,700;0,900;1,700', caixaAlta: false, largura: 0.5, larguraFallback: 0.54 },
  // Sans de leitura, para apoio e legais.
  sans: { css: "'Inter', system-ui, -apple-system, Segoe UI, Roboto, sans-serif", google: 'Inter:wght@400;500;600;700;800;900', caixaAlta: false, largura: 0.52, larguraFallback: 0.55 },
};
const FAMILIA_PADRAO = 'sans';
function familia(id) { return FAMILIAS[id] ? id : FAMILIA_PADRAO; }
/*
 * Largura média de caractere, relativa ao corpo. Usamos a do FALLBACK, não a da
 * fonte ideal: as famílias vêm do Google Fonts e uma TV sem internet cai na
 * fonte do sistema, bem mais larga. Estimar pela ideal fazia o título estourar
 * a caixa justamente na tela que não tem rede — onde ninguém está olhando o
 * problema. Com a fonte carregada, sobra folga; sem ela, ainda cabe.
 */
function larguraCaractereDaFamilia(fam) {
  const f = FAMILIAS[familia(fam)] || FAMILIAS.sans;
  return f.larguraFallback || f.largura;
}

/* ---------------- Direções de arte ---------------- */

/*
 * Cada direção é um "jeito de fazer a peça", tirado de referências reais de
 * signage brasileiro. Sem isso toda peça sai igual: fundo degradê escuro e
 * texto médio — correto, mas sem personalidade.
 */
const DIRECOES = {
  // Ref.: campanha de faculdade. Fundo chapado na cor da marca, tipografia
  // condensada gigante em tom creme, filete fino decorativo.
  chapado: {
    label: 'Chapado saturado',
    fundo: 'marca',           // usa a marca em cheio, não escurecida
    fonteTitulo: 'display',
    fonteApoio: 'sans',
    escalaTitulo: 1.9,        // multiplicador sobre a escala base
    caixaAlta: true,
    filete: true,
  },
  // Ref.: arte de aniversário. Foto ocupando a peça, texto gigante sangrando
  // pelas bordas, script para o nome.
  cartaz: {
    label: 'Cartaz dramático',
    fundo: 'foto',
    fonteTitulo: 'display',
    fonteApoio: 'script',
    escalaTitulo: 2.2,
    caixaAlta: true,
    sangra: true,             // o título pode passar da borda de propósito
  },
  // Ref.: telão de igreja. Quase preto, tipo branca enorme, subtítulo no acento.
  contraste: {
    label: 'Alto contraste',
    fundo: 'escuro',
    fonteTitulo: 'display',
    fonteApoio: 'sans',
    escalaTitulo: 2.0,
    caixaAlta: true,
    filete: true,
  },
  // A direção antiga: degradê suave. Continua útil para peça institucional.
  suave: {
    label: 'Degradê suave',
    fundo: 'degrade',
    fonteTitulo: 'sans',
    fonteApoio: 'sans',
    escalaTitulo: 1,
    caixaAlta: false,
  },
};
function direcao(id) { return DIRECOES[id] ? DIRECOES[id] : DIRECOES.suave; }

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
function cabeNaCaixa(texto, box, fontCqw, formato, fonte) {
  const t = String(texto || '');
  if (!t) return { cabe: true, linhas: 0, sugestaoCqw: fontCqw };
  const r = ratioDe(formato);
  // Tudo em "unidades de largura da peça" (100 = largura total). Uma condensada
  // cabe MUITO mais caractere por linha que uma sans — daí a largura por família.
  const larguraCaractere = fontCqw * larguraCaractereDaFamilia(fonte);
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
  buildPalette, MIN_CONTRAST, MIN_CONTRAST_TITULO, MIN_CONTRAST_DISPLAY,
  FORMATOS, ratioDe, safeArea, escalaTipografica, cabeNaCaixa,
  FAMILIAS, FAMILIA_PADRAO, familia, larguraCaractereDaFamilia, DIRECOES, direcao,
  clamp, num, sobrepoe, areaSobreposta,
};
