/*
 * colar.js — o que vem da área de transferência e vira elemento no palco.
 *
 * A pergunta que originou este arquivo foi "dá pra eu copiar algo no Canva e
 * colar dentro do meu editor?". A resposta honesta tem duas partes, e ela
 * decide o desenho daqui:
 *
 *   - Do CANVA vem imagem, e só. Quando se copia lá, ele põe na área de
 *     transferência um PNG da seleção e um formato interno proprietário e não
 *     documentado. Não há como transformar aquilo em camadas editáveis, e
 *     fingir que há seria pior do que dizer não.
 *   - Do FIGMA e do ILLUSTRATOR vem SVG, porque os dois copiam SVG de
 *     verdade. Daí saem formas e textos EDITÁVEIS.
 *
 * Então: do Canva você traz a arte pronta; do Figma você traz o que dá para
 * continuar mexendo. As duas coisas são úteis, e são coisas diferentes.
 *
 * Este módulo é puro: recebe texto, devolve elementos. Quem fala com a área
 * de transferência e com o upload é o editor.
 */

/*
 * Tamanho que a coisa colada ocupa na peça, em %. Não vale colar em cima da
 * peça inteira: a pessoa quase sempre quer posicionar depois, e um elemento
 * de 100% cobre tudo o que já estava lá.
 */
const OCUPACAO = 60;

/* Texto colado vira um bloco de texto, com as quebras preservadas. */
export function textoParaElemento(txt) {
  const limpo = String(txt || '').replace(/\r\n/g, '\n').trim();
  if (!limpo) return null;
  return {
    tipo: 'texto',
    text: limpo,
    x: 20, y: 40, w: 60, h: 18, rot: 0,
    cor: '#ffffff', peso: 700, tamanho: 5, align: 'center',
  };
}

/* Parece SVG? Aceita o que vem com declaração XML ou comentário na frente. */
export function pareceSvg(txt) {
  return /<svg[\s>]/i.test(String(txt || '').slice(0, 2000));
}

/*
 * Converte um SVG em elementos do editor.
 *
 * O que tem tradução direta vira elemento nativo, editável: retângulo, elipse,
 * círculo, linha e texto. O que NÃO tem — caminhos, grupos com transformação,
 * filtros, gradientes complexos — não é convertido, e o editor recebe a lista
 * do que ficou de fora para colar o SVG inteiro como imagem em vez de entregar
 * um desenho pela metade.
 *
 * Perder pedaço em silêncio seria o pior resultado possível: a pessoa cola,
 * vê algo parecido, publica, e descobre na parede que faltava metade.
 */
export function elementosDeSvg(svgTexto, doc, razaoPeca) {
  const parser = new (doc && doc.defaultView ? doc.defaultView.DOMParser : DOMParser)();
  const arvore = parser.parseFromString(String(svgTexto), 'image/svg+xml');
  const svg = arvore.querySelector('svg');
  if (!svg || arvore.querySelector('parsererror')) return null;

  const caixa = medirSvg(svg);
  if (!caixa) return null;

  const elementos = [];
  const naoConvertidos = [];
  const { px, py, pw, ph } = escalar(caixa, OCUPACAO, razaoPeca);

  for (const no of svg.querySelectorAll('*')) {
    const tag = String(no.tagName || '').toLowerCase();
    const preenche = no.getAttribute('fill');

    if (tag === 'rect') {
      elementos.push({
        tipo: 'forma', shape: 'rect',
        x: px(no.getAttribute('x')), y: py(no.getAttribute('y')),
        w: pw(no.getAttribute('width')), h: ph(no.getAttribute('height')),
        rot: 0, fill: cor(preenche) || '#3b82f6', opacidade: opac(no), radius: 0,
      });
    } else if (tag === 'circle') {
      const r = Number(no.getAttribute('r')) || 0;
      elementos.push({
        tipo: 'forma', shape: 'ellipse',
        x: px(Number(no.getAttribute('cx')) - r), y: py(Number(no.getAttribute('cy')) - r),
        w: pw(r * 2), h: ph(r * 2),
        rot: 0, fill: cor(preenche) || '#3b82f6', opacidade: opac(no),
      });
    } else if (tag === 'ellipse') {
      const rx = Number(no.getAttribute('rx')) || 0;
      const ry = Number(no.getAttribute('ry')) || 0;
      elementos.push({
        tipo: 'forma', shape: 'ellipse',
        x: px(Number(no.getAttribute('cx')) - rx), y: py(Number(no.getAttribute('cy')) - ry),
        w: pw(rx * 2), h: ph(ry * 2),
        rot: 0, fill: cor(preenche) || '#3b82f6', opacidade: opac(no),
      });
    } else if (tag === 'text') {
      const conteudo = (no.textContent || '').trim();
      if (!conteudo) continue;
      const tam = Number(no.getAttribute('font-size')) || caixa.h / 12;
      // O texto do SVG é ancorado na LINHA DE BASE; o nosso é uma caixa. Sem
      // subir a altura da linha, todo texto colado nasce deslocado para baixo.
      const alturaCaixa = ph(tam * 1.35);
      elementos.push({
        tipo: 'texto', text: conteudo,
        x: px(no.getAttribute('x')) - pw(tam) * 0.2,
        y: py(no.getAttribute('y')) - alturaCaixa * 0.8,
        w: Math.max(12, pw(tam * conteudo.length * 0.62)), h: Math.max(4, alturaCaixa),
        rot: 0,
        cor: cor(no.getAttribute('fill')) || '#ffffff',
        peso: peso(no.getAttribute('font-weight')),
        tamanho: Math.max(1.5, pw(tam)),
        align: ({ middle: 'center', end: 'right' })[no.getAttribute('text-anchor')] || 'left',
      });
    } else if (tag === 'image') {
      const src = no.getAttribute('href') || no.getAttribute('xlink:href');
      if (!src) continue;
      elementos.push({
        tipo: 'imagem', src,
        x: px(no.getAttribute('x')), y: py(no.getAttribute('y')),
        w: pw(no.getAttribute('width')), h: ph(no.getAttribute('height')),
        rot: 0, fit: 'contain',
      });
    } else if (['path', 'polygon', 'polyline', 'line', 'use', 'foreignobject'].includes(tag)) {
      naoConvertidos.push(tag);
    }
  }

  return { elementos, naoConvertidos };
}

/*
 * A régua que leva do espaço do SVG para % da peça.
 *
 * É a parte que deforma tudo se estiver errada, então mora sozinha e é
 * testada sozinha: o desenho entra centralizado, ocupando OCUPACAO% da peça,
 * e a proporção é preservada porque os dois eixos usam a MESMA escala. Usar
 * uma escala por eixo esticaria um círculo em elipse toda vez que o SVG não
 * fosse quadrado.
 */
export function escalar(caixa, ocupacao, razaoPeca) {
  const oc = ocupacao != null ? ocupacao : OCUPACAO;
  /*
   * A PROPORÇÃO DA PEÇA entra na conta, e esquecê-la foi o defeito que o teste
   * de navegador pegou: um círculo colado de um SVG quadrado saía como elipse
   * de 296 por 166 pixels.
   *
   * O motivo é que x e w são % da LARGURA e y e h são % da ALTURA. Numa peça
   * 16/9, 30% da largura valem quase o dobro, em pixels, de 30% da altura —
   * então a mesma porcentagem nos dois eixos desenha um oval.
   *
   * Aqui existe uma escala só, em % da largura, e o eixo vertical recebe essa
   * escala multiplicada pela razão da peça. Assim um quadrado no SVG continua
   * quadrado na tela, em qualquer formato.
   */
  const R = Number(razaoPeca) > 0 ? Number(razaoPeca) : 1;
  const kw = oc / Math.max(caixa.w, caixa.h * R);   // % da largura por unidade
  const kh = kw * R;                                 // % da altura por unidade
  const margemX = (100 - caixa.w * kw) / 2;
  const margemY = (100 - caixa.h * kh) / 2;
  return {
    px: (v) => ((Number(v) || 0) - caixa.x) * kw + margemX,
    py: (v) => ((Number(v) || 0) - caixa.y) * kh + margemY,
    pw: (v) => (Number(v) || 0) * kw,
    ph: (v) => (Number(v) || 0) * kh,
  };
}

/*
 * A caixa do SVG, em unidades dele. O viewBox manda; sem ele, valem largura e
 * altura; sem nenhum dos dois não dá para escalar coisa nenhuma sem chutar, e
 * chutar aqui deforma tudo o que for colado.
 */
export function medirSvg(svg) {
  const vb = (svg.getAttribute('viewBox') || '').trim().split(/[\s,]+/).map(Number);
  if (vb.length === 4 && vb.every((n) => Number.isFinite(n)) && vb[2] > 0 && vb[3] > 0) {
    return { x: vb[0], y: vb[1], w: vb[2], h: vb[3] };
  }
  const w = parseFloat(svg.getAttribute('width'));
  const h = parseFloat(svg.getAttribute('height'));
  if (w > 0 && h > 0) return { x: 0, y: 0, w, h };
  return null;
}

/* 'none' e vazio não são cor — viram nulo para o chamador decidir o padrão. */
function cor(v) {
  const s = String(v || '').trim();
  if (!s || s === 'none' || s === 'transparent' || s.startsWith('url(')) return null;
  return s;
}
function opac(no) {
  const v = parseFloat(no.getAttribute('opacity'));
  return Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 1;
}
function peso(v) {
  const s = String(v || '').trim();
  if (s === 'bold') return 800;
  const n = parseInt(s, 10);
  return Number.isFinite(n) && n >= 100 ? n : 700;
}

/*
 * Decide o que fazer com o que veio colado, sem tocar em DOM nem em rede.
 * Devolve uma INTENÇÃO, e o editor executa — é o que deixa esta decisão
 * testável fora do navegador.
 */
export function decidirColagem({ arquivoImagem, textoHtml, textoPlano }, doc, razaoPeca) {
  if (arquivoImagem) return { acao: 'imagem', arquivo: arquivoImagem };

  const svgBruto = [textoPlano, textoHtml].find((t) => t && pareceSvg(t));
  if (svgBruto) {
    const svg = extrairSvg(svgBruto);
    const r = elementosDeSvg(svg, doc, razaoPeca);
    if (r && r.elementos.length && !r.naoConvertidos.length) {
      return { acao: 'elementos', elementos: r.elementos };
    }
    /*
     * Tem desenho que não sabemos traduzir (caminhos, sobretudo). Vai inteiro
     * como imagem: melhor colar certo e não editável do que colar editável e
     * errado.
     */
    return {
      acao: 'svg-como-imagem', svg,
      motivo: r && r.naoConvertidos.length
        ? 'este desenho tem traçados que o editor não sabe abrir em camadas'
        : 'não consegui ler as camadas deste SVG',
    };
  }

  const el = textoParaElemento(textoPlano);
  if (el) return { acao: 'elementos', elementos: [el] };
  return { acao: 'nada' };
}

/* O Figma cola o SVG embrulhado em HTML; aqui fica só o SVG. */
export function extrairSvg(txt) {
  const s = String(txt || '');
  const i = s.search(/<svg[\s>]/i);
  const f = s.lastIndexOf('</svg>');
  return i >= 0 && f > i ? s.slice(i, f + 6) : s;
}
