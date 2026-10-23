/*
 * js/peca-html.js — o que uma peça em HTML pode conter (docs/PLANO.md §4.2).
 *
 * A IA vai escrever HTML e CSS. Isso só é seguro e só fica bonito na parede
 * se existir uma porta que deixe passar EXATAMENTE o que a peça precisa — e
 * nada além. Esta é a porta. Ela roda duas vezes, com o mesmo código: no
 * servidor, quando a peça é salva, e no player, quando ela é exibida. Se uma
 * das duas falhar, a outra segura.
 *
 * LISTA DO QUE PODE, nunca lista do que não pode. Lista de proibidos é uma
 * aposta de que ninguém vai inventar o próximo truque; lista de permitidos
 * não depende de imaginação. Por isso o HTML não é "limpo": ele é LIDO,
 * vira uma árvore, e é ESCRITO DE NOVO só com tags e atributos conhecidos.
 * O que sai daqui nunca é o texto que entrou — é o que nós escrevemos.
 *
 * Duas saídas, para dois públicos:
 *
 *   problemas  o que foi recusado e por quê, em frases que a IA entende e
 *              corrige. No servidor, qualquer problema recusa a peça e ela é
 *              pedida de novo (o "LINT" do plano).
 *   avisos     o que passou mas merece olho: texto fixo fora de campo, campo
 *              repetido. Não recusam nada.
 *
 * Os trilhos, e de onde cada um vem:
 *
 *   - sem JavaScript: nenhuma tag de script, nenhum `on*=`. A animação é
 *     DECLARADA (`data-entrada`) e o player executa (PLANO §4.13);
 *   - nenhum endereço: nem `src`, nem `url()`. Foto entra por campo
 *     (`data-campo-img`) e quem resolve o arquivo é o renderizador — a TV
 *     pode estar sem internet, e endereço de fora é rastreio;
 *   - cor só por token (`var(--mt-…)`, js/tokens.js): é o que faz trocar de
 *     marca ou de modo reestilizar a peça sem gerar de novo;
 *   - medida só relativa ao container (cqw, cqh, %, fr…): uma peça, todas as
 *     telas. Pixel só dentro da condição de um @container, onde ele mede o
 *     espaço de verdade (a lateral estreita esconde o texto secundário);
 *   - fontes só do catálogo (js/fontes.js): fonte que não carrega estoura o
 *     texto na parede;
 *   - nada de filter, backdrop-filter, mix-blend-mode, sombra enorme: custam
 *     GPU que o box de 2 GB não tem;
 *   - no máximo ~150 elementos: orçamento de memória do WebView.
 *
 * Módulo duplo, como js/animacao.js: `require()` no Node, `MTPecaHtml` no
 * navegador (depois de cor, fontes, tokens e animacao).
 */
(function (raiz, fabrica) {
  var node = typeof module === 'object' && module.exports && typeof require === 'function';
  var api = fabrica(
    node ? require('./tokens.js') : raiz.MTTokens,
    node ? require('./animacao.js') : raiz.MTAnim,
    node ? require('./fontes.js') : raiz.MTFontes);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (raiz) raiz.MTPecaHtml = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (T, A, F) {
  'use strict';

  const LIMITES = {
    html: 64 * 1024,
    css: 48 * 1024,
    elementos: 150,
    imagens: 6,
    profundidade: 24,
    campo: 400,
    problemas: 40,
  };

  const PAPEIS = ['cabecalho', 'destaque', 'lateral', 'rodape'];
  const FORMATOS = ['16/9', '9/16', '1/1', '21/9'];
  // contagem: a regressiva até a data da zona (EXECUTOR item 22).
  const VIVOS = ['relogio', 'data', 'clima', 'mensagens', 'contagem'];

  /* ======================= HTML ======================= */

  // As tags de uma peça. Texto, blocos e imagem — e só.
  const TAGS = new Set([
    'section', 'div', 'header', 'footer', 'aside', 'figure', 'figcaption',
    'p', 'h1', 'h2', 'h3', 'h4', 'span', 'em', 'strong', 'b', 'i', 'small',
    'sup', 'sub', 's', 'del', 'ul', 'ol', 'li', 'br', 'img',
  ]);
  const VAZIAS = new Set(['br', 'img']);

  /*
   * Tags que somem COM o conteúdo. Uma tag desconhecida qualquer é só
   * desembrulhada (o texto dentro dela fica); estas não, porque o que está
   * dentro delas é código, outro documento, um formulário ou um desenho — e
   * o texto de um <svg> vazando solto para a peça seria lixo na parede.
   *
   * Não é preciso imitar o navegador lendo `<script>` como texto cru: o que
   * vai para a tela é a árvore que NÓS escrevemos de novo, e tudo que ficou
   * pendurado numa destas tags vai embora com ela.
   */
  const SOMEM_INTEIRAS = new Set([
    'script', 'style', 'iframe', 'frame', 'frameset', 'object', 'embed', 'applet',
    'template', 'noscript', 'noembed', 'noframes', 'textarea', 'title', 'xmp',
    'plaintext', 'svg', 'math', 'link', 'meta', 'base', 'head', 'form', 'input',
    'button', 'select', 'option', 'video', 'audio', 'canvas', 'picture', 'source',
  ]);

  const NOME_CAMPO = /^[a-z][a-z0-9-]{0,30}$/;
  const CLASSE = /^[A-Za-z_][A-Za-z0-9_-]{0,40}$/;

  const ENTRADAS = A.ENTRADAS.map((e) => e.id).filter(Boolean);
  const CONTINUAS = A.CONTINUAS.map((e) => e.id).filter(Boolean);

  const ENTIDADES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
  function decodificar(s) {
    return String(s).replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
      if (e[0] !== '#') return Object.prototype.hasOwnProperty.call(ENTIDADES, e.toLowerCase()) ? ENTIDADES[e.toLowerCase()] : m;
      const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return n > 0 && n <= 0x10ffff && !(n >= 0xd800 && n <= 0xdfff) ? String.fromCodePoint(n) : '';
    });
  }
  const escaparTexto = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const escaparAttr = (s) => escaparTexto(s).replace(/"/g, '&quot;');

  /*
   * Lê o HTML em pedaços: texto, abre-tag, fecha-tag. Não tenta ser um
   * navegador — tenta nunca ser enganado. Tudo que não for reconhecido vira
   * TEXTO, e texto sai escapado: o pior caso de um truque novo é ele
   * aparecer escrito na peça, nunca executar.
   */
  function tokenizar(html) {
    const out = [];
    const n = html.length;
    let i = 0;
    while (i < n) {
      const lt = html.indexOf('<', i);
      if (lt < 0) { out.push({ t: 'texto', v: html.slice(i) }); break; }
      if (lt > i) out.push({ t: 'texto', v: html.slice(i, lt) });

      if (html.startsWith('<!--', lt)) {
        const fim = html.indexOf('-->', lt + 4);
        i = fim < 0 ? n : fim + 3;
        out.push({ t: 'comentario' });
        continue;
      }
      if (html[lt + 1] === '!' || html[lt + 1] === '?') {
        const fim = html.indexOf('>', lt);
        i = fim < 0 ? n : fim + 1;
        out.push({ t: 'comentario' });
        continue;
      }
      const m = /^<(\/?)([A-Za-z][A-Za-z0-9-]*)/.exec(html.slice(lt, lt + 80));
      if (!m) { out.push({ t: 'texto', v: '<' }); i = lt + 1; continue; }

      const fecha = m[1] === '/';
      const nome = m[2].toLowerCase();
      let j = lt + m[0].length;
      const attrs = [];
      while (j < n) {
        while (j < n && /[\s/]/.test(html[j])) j++;
        if (j >= n || html[j] === '>') break;
        let k = j;
        while (k < n && !/[\s/>=]/.test(html[k])) k++;
        const an = html.slice(j, k).toLowerCase();
        j = k === j ? j + 1 : k;
        while (j < n && /\s/.test(html[j])) j++;
        let av = '';
        if (html[j] === '=') {
          j++;
          while (j < n && /\s/.test(html[j])) j++;
          const q = html[j];
          if (q === '"' || q === "'") {
            const fim = html.indexOf(q, j + 1);
            av = html.slice(j + 1, fim < 0 ? n : fim);
            j = fim < 0 ? n : fim + 1;
          } else {
            let k2 = j;
            while (k2 < n && !/[\s>]/.test(html[k2])) k2++;
            av = html.slice(j, k2);
            j = k2;
          }
        }
        if (an) attrs.push([an, decodificar(av)]);
      }
      i = j < n ? j + 1 : n;
      out.push({ t: fecha ? 'fim' : 'inicio', nome, attrs });
    }
    return out;
  }

  // Monta a árvore. Fecha-tag sem par é ignorada; tag aberta sem par fecha no fim.
  function arvore(tokens) {
    const raiz = { nome: '#raiz', attrs: [], filhos: [] };
    const pilha = [raiz];
    for (const tk of tokens) {
      const topo = pilha[pilha.length - 1];
      if (tk.t === 'texto') topo.filhos.push({ texto: decodificar(tk.v) });
      else if (tk.t === 'inicio') {
        const no = { nome: tk.nome, attrs: tk.attrs, filhos: [] };
        topo.filhos.push(no);
        if (!VAZIAS.has(tk.nome)) pilha.push(no);
      } else if (tk.t === 'fim') {
        for (let k = pilha.length - 1; k > 0; k--) {
          if (pilha[k].nome === tk.nome) { pilha.length = k; break; }
        }
      }
    }
    return raiz;
  }

  /* ======================= CSS: valores ======================= */

  // Os 148 nomes de cor do CSS. Cor por nome é hex disfarçado.
  const CORES_POR_NOME = new Set(('aliceblue antiquewhite aqua aquamarine azure beige bisque black '
    + 'blanchedalmond blue blueviolet brown burlywood cadetblue chartreuse chocolate coral '
    + 'cornflowerblue cornsilk crimson cyan darkblue darkcyan darkgoldenrod darkgray darkgreen '
    + 'darkgrey darkkhaki darkmagenta darkolivegreen darkorange darkorchid darkred darksalmon '
    + 'darkseagreen darkslateblue darkslategray darkslategrey darkturquoise darkviolet deeppink '
    + 'deepskyblue dimgray dimgrey dodgerblue firebrick floralwhite forestgreen fuchsia gainsboro '
    + 'ghostwhite gold goldenrod gray green greenyellow grey honeydew hotpink indianred indigo '
    + 'ivory khaki lavender lavenderblush lawngreen lemonchiffon lightblue lightcoral lightcyan '
    + 'lightgoldenrodyellow lightgray lightgreen lightgrey lightpink lightsalmon lightseagreen '
    + 'lightskyblue lightslategray lightslategrey lightsteelblue lightyellow lime limegreen linen '
    + 'magenta maroon mediumaquamarine mediumblue mediumorchid mediumpurple mediumseagreen '
    + 'mediumslateblue mediumspringgreen mediumturquoise mediumvioletred midnightblue mintcream '
    + 'mistyrose moccasin navajowhite navy oldlace olive olivedrab orange orangered orchid '
    + 'palegoldenrod palegreen paleturquoise palevioletred papayawhip peachpuff peru pink plum '
    + 'powderblue purple rebeccapurple red rosybrown royalblue saddlebrown salmon sandybrown '
    + 'seagreen seashell sienna silver skyblue slateblue slategray slategrey snow springgreen '
    + 'steelblue tan teal thistle tomato turquoise violet wheat white whitesmoke yellow yellowgreen').split(' '));

  /*
   * Unidades. As de container e as relativas à própria fonte (que por sua
   * vez é medida em cqw). Fora: px, vw/vh (medem a TELA, não a peça — numa
   * zona lateral a peça sairia gigante) e rem (mede a página, não a peça).
   */
  const UNIDADES = new Set(['cqw', 'cqh', 'cqi', 'cqb', 'cqmin', 'cqmax', '%', 'fr', 'em', 'ex', 'ch',
    'deg', 'rad', 'grad', 'turn', 's', 'ms', 'x']);

  const PROPRIEDADES_PROIBIDAS = [
    [/^(-webkit-)?(filter|backdrop-filter)$/, 'custa GPU que o box de 2 GB não tem'],
    [/^mix-blend-mode$/, 'custa GPU que o box de 2 GB não tem'],
    [/^(-webkit-)?(animation|transition)(-.*)?$/, 'a animação é declarada com data-entrada e o player executa'],
    [/^will-change$/, 'reserva memória de GPU para sempre; o player decide isso'],
    [/^(behavior|-moz-binding|cursor|pointer-events|user-select)$/, 'não tem uso numa TV'],
    [/^(-webkit-)?mask(-.*)?$/, 'imagem por CSS não é permitida'],
  ];

  const TOKENS = new Set(Object.keys(T.NOMES).map((k) => T.NOMES[k]));
  const CAMADA = new Set(['--x', '--y', '--w', '--h']);

  /*
   * Famílias do catálogo, tiradas das pilhas de js/fontes.js. Os nomes
   * genéricos (serif, sans-serif…) também passam: são o último recurso de
   * toda pilha, não uma fonte nova.
   */
  const FAMILIAS = new Set(['serif', 'sans-serif', 'cursive', 'system-ui', 'monospace', '-apple-system']);
  Object.keys(F.FAMILIAS).forEach((id) => {
    F.FAMILIAS[id].css.split(',').forEach((f) => FAMILIAS.add(f.trim().replace(/^['"]|['"]$/g, '').toLowerCase()));
  });

  // Divide por um separador fora de parênteses e de aspas.
  function dividir(s, sep) {
    const partes = [];
    let nivel = 0, aspa = '', ini = 0;
    for (let i = 0; i < s.length; i++) {
      const c = s[i];
      if (aspa) { if (c === aspa) aspa = ''; continue; }
      if (c === '"' || c === "'") aspa = c;
      else if (c === '(') nivel++;
      else if (c === ')') nivel = Math.max(0, nivel - 1);
      else if (c === sep && nivel === 0) { partes.push(s.slice(ini, i)); ini = i + 1; }
    }
    partes.push(s.slice(ini));
    return partes;
  }
  const semAspas = (s) => s.replace(/"[^"]*"|'[^']*'/g, '""');

  // Números com unidade, sem confundir com pedaço de nome (fundo-2, translate3d).
  const NUMERO = /(?<![A-Za-z0-9_-])(-?(?:\d+\.?\d*|\.\d+))([A-Za-z%]*)/g;

  function conferirFonte(prop, valor) {
    const v = valor;
    const usados = (valor.match(/var\(\s*(--[A-Za-z0-9_-]+)/g) || []).map((x) => x.replace(/var\(\s*/, ''));
    if (usados.some((u) => u === '--mt-fonte-titulo' || u === '--mt-fonte-texto')) return null;
    if (prop === 'font-family') {
      const fora = dividir(v, ',').map((f) => f.trim().replace(/^['"]|['"]$/g, '').toLowerCase())
        .filter((f) => f && !FAMILIAS.has(f));
      return fora.length ? `família fora do catálogo (${fora[0]}): use var(--mt-fonte-titulo), var(--mt-fonte-texto) ou uma família de js/fontes.js` : null;
    }
    // `font` abreviado: a família é o que vem entre aspas, ou o último nome.
    const aspas = (valor.match(/"[^"]*"|'[^']*'/g) || []).map((x) => x.slice(1, -1).toLowerCase());
    if (aspas.length) {
      const fora = aspas.filter((f) => !FAMILIAS.has(f));
      return fora.length ? `família fora do catálogo (${fora[0]})` : null;
    }
    const ultimo = valor.trim().split(/\s+/).pop().toLowerCase();
    return FAMILIAS.has(ultimo) ? null : 'a família da fonte precisa ser var(--mt-fonte-titulo) ou var(--mt-fonte-texto)';
  }

  /*
   * Sombra pequena passa; sombra enorme não. O desfoque de uma sombra grande
   * é redesenhado a cada quadro de qualquer animação perto dela — no box
   * barato é onde a peça começa a engasgar.
   */
  function conferirSombra(valor) {
    if (/^\s*none\s*$/i.test(valor)) return null;
    const sombras = dividir(valor, ',');
    if (sombras.length > 2) return 'no máximo 2 sombras por elemento';
    for (const s of sombras) {
      const medidas = [];
      let m;
      NUMERO.lastIndex = 0;
      while ((m = NUMERO.exec(s))) medidas.push(Number(m[1]));
      if (medidas.length >= 3 && Math.abs(medidas[2]) > 3) return 'sombra grande demais (desfoque acima de 3cqw)';
    }
    return null;
  }

  // Confere um valor. Devolve o motivo da recusa, ou null.
  function conferirValor(prop, valor, locais) {
    const v = semAspas(valor);
    if (/[<>]/.test(valor)) return 'caractere < ou > não cabe em CSS de peça';
    if (/\b(url|image-set|-webkit-image-set|image|cross-fade|element|paint|expression|src)\s*\(/i.test(v)) {
      return 'endereço ou imagem por CSS não é permitido: foto entra por data-campo-img';
    }
    if (/javascript:|@import/i.test(valor)) return 'código não é permitido';
    if (/#[0-9a-f]{3,8}\b/i.test(v) || /\b(rgba?|hsla?|hwb|lab|lch|oklab|oklch|color|color-mix|light-dark)\s*\(/i.test(v)) {
      return 'cor só por token: var(--mt-fundo), var(--mt-destaque)…';
    }
    const nomes = v.match(/(?<![A-Za-z0-9_-])[A-Za-z][A-Za-z-]*(?![A-Za-z0-9_(-])/g) || [];
    const corNomeada = nomes.find((x) => CORES_POR_NOME.has(x.toLowerCase()));
    if (corNomeada) return `cor por nome (${corNomeada}): use um token, var(--mt-…)`;

    const vars = (v.match(/var\(\s*(--[A-Za-z0-9_-]+)/g) || []).map((x) => x.replace(/var\(\s*/, ''));
    for (const nome of vars) {
      const n = nome.toLowerCase();
      if (TOKENS.has(n) || CAMADA.has(n) || locais.has(n)) continue;
      return nome.startsWith('--mt-') ? `token desconhecido (${nome})` : `variável não declarada nesta peça (${nome})`;
    }

    let m;
    NUMERO.lastIndex = 0;
    while ((m = NUMERO.exec(v))) {
      const u = m[2].toLowerCase();
      if (!u || UNIDADES.has(u)) continue;
      if (u === 'e') continue; // notação científica (1e3) — não é unidade
      return `unidade ${u} não é permitida: use cqw, cqh, cqmin ou % (medida do container)`;
    }

    if (prop === 'position' && /\b(fixed|sticky)\b/i.test(v)) return 'position fixed/sticky escapa da peça';
    if (prop === 'content' && !/^\s*(none|normal|""|''|"[^"]*"|'[^']*')\s*$/.test(valor)) return 'content só aceita texto entre aspas';
    if (prop === 'font' || prop === 'font-family') return conferirFonte(prop, valor);
    if (prop === 'box-shadow' || prop === 'text-shadow') return conferirSombra(v);
    return null;
  }

  /* ======================= CSS: estrutura ======================= */

  // Acha o `}` que fecha o `{` em `abre`, respeitando aspas e blocos aninhados.
  function fechoDe(s, abre) {
    let nivel = 0, aspa = '';
    for (let i = abre; i < s.length; i++) {
      const c = s[i];
      if (aspa) { if (c === aspa) aspa = ''; continue; }
      if (c === '"' || c === "'") aspa = c;
      else if (c === '{') nivel++;
      else if (c === '}') { nivel--; if (nivel === 0) return i; }
    }
    return -1;
  }

  const SELETOR_PROIBIDO = /(^|[\s,>+~(])(:root|html|body|:host(-context)?|::?part|::?slotted)\b/i;

  /*
   * Condição de @container: tamanho, proporção e orientação — o que muda
   * de uma zona para outra. Aqui, e só aqui, pixel é permitido: a condição
   * mede o espaço REAL ("lateral com menos de 700px esconde o apoio").
   */
  const RECURSOS_CONTAINER = new Set(['aspect-ratio', 'min-aspect-ratio', 'max-aspect-ratio', 'orientation',
    'width', 'min-width', 'max-width', 'height', 'min-height', 'max-height', 'inline-size', 'block-size',
    'min-inline-size', 'max-inline-size', 'and', 'or', 'not', 'portrait', 'landscape']);
  function conferirCondicao(cond) {
    if (/[{};@\\"']|url\s*\(/i.test(cond)) return 'condição de @container inválida';
    const palavras = cond.replace(/\d+(\.\d+)?(px|cqw|cqh)?/g, ' ').match(/[A-Za-z-]+/g) || [];
    // A primeira palavra pode ser o NOME do container; as demais, recursos.
    const recursos = /^\s*[A-Za-z]/.test(cond) && !/^\s*(not\b|\()/.test(cond) ? palavras.slice(1) : palavras;
    const fora = recursos.find((p) => !RECURSOS_CONTAINER.has(p.toLowerCase()));
    return fora ? `@container só testa tamanho, proporção e orientação (${fora})` : null;
  }

  function lerDeclaracoes(corpo, locais, problemas, onde) {
    const saida = [];
    for (const parte of dividir(corpo, ';')) {
      const d = parte.trim();
      if (!d) continue;
      const dp = d.indexOf(':');
      if (dp <= 0) { problemas.push(`CSS (${onde}): declaração sem valor "${d.slice(0, 40)}"`); continue; }
      const prop = d.slice(0, dp).trim().toLowerCase();
      let valor = d.slice(dp + 1).trim();
      const importante = /!\s*important\s*$/i.test(valor);
      if (importante) valor = valor.replace(/!\s*important\s*$/i, '').trim();

      if (!/^(--[a-z0-9_-]+|-?[a-z][a-z0-9-]*)$/.test(prop)) { problemas.push(`CSS (${onde}): propriedade inválida "${prop.slice(0, 30)}"`); continue; }
      if (prop.startsWith('--mt-')) { problemas.push(`CSS (${onde}): ${prop} é token do sistema e não pode ser redefinido na peça`); continue; }
      const proibida = PROPRIEDADES_PROIBIDAS.find(([re]) => re.test(prop));
      if (proibida) { problemas.push(`CSS (${onde}): ${prop} não é permitido — ${proibida[1]}`); continue; }
      const motivo = conferirValor(prop, valor, locais);
      if (motivo) { problemas.push(`CSS (${onde}): ${prop}: ${motivo}`); continue; }
      saida.push(prop + ':' + valor + (importante ? ' !important' : ''));
    }
    return saida.join(';');
  }

  function lerRegras(s, locais, problemas, dentroDeContainer) {
    const saida = [];
    let i = 0;
    while (i < s.length) {
      while (i < s.length && /\s/.test(s[i])) i++;
      if (i >= s.length) break;
      // O prelúdio vai até o `{` (ou até um `;`, que é uma regra sem bloco).
      let j = i, aspa = '';
      while (j < s.length) {
        const c = s[j];
        if (aspa) { if (c === aspa) aspa = ''; } else if (c === '"' || c === "'") aspa = c;
        else if (c === '{' || c === ';' || c === '}') break;
        j++;
      }
      const prelude = s.slice(i, j).trim();
      if (j >= s.length || s[j] !== '{') {
        if (prelude) problemas.push(`CSS: "${prelude.slice(0, 40)}" fora de um bloco não é permitido`);
        i = j + 1;
        continue;
      }
      const fim = fechoDe(s, j);
      const corpo = s.slice(j + 1, fim < 0 ? s.length : fim);
      i = fim < 0 ? s.length : fim + 1;

      if (prelude[0] === '@') {
        const nome = (/^@([A-Za-z-]+)/.exec(prelude) || [])[1] || '';
        if (nome.toLowerCase() !== 'container' || dentroDeContainer) {
          problemas.push(`CSS: @${nome} não é permitido` + (nome === 'media' ? ' — use @container, que mede a zona e não a tela' : ''));
          continue;
        }
        const cond = prelude.slice('@container'.length).trim();
        const ruim = conferirCondicao(cond);
        if (ruim) { problemas.push('CSS: ' + ruim); continue; }
        const dentro = lerRegras(corpo, locais, problemas, true);
        if (dentro) saida.push('@container ' + cond + '{' + dentro + '}');
        continue;
      }

      if (!prelude || /[{}<@\\]/.test(prelude)) { problemas.push(`CSS: seletor inválido "${prelude.slice(0, 40)}"`); continue; }
      if (SELETOR_PROIBIDO.test(prelude)) { problemas.push(`CSS: o seletor "${prelude.slice(0, 40)}" mira fora da peça`); continue; }
      if (corpo.indexOf('{') >= 0) { problemas.push(`CSS: bloco aninhado em "${prelude.slice(0, 40)}" não é permitido`); continue; }
      const decl = lerDeclaracoes(corpo, locais, problemas, prelude.slice(0, 40));
      if (decl) saida.push(prelude.replace(/\s+/g, ' ') + '{' + decl + '}');
    }
    return saida.join('');
  }

  function higienizarCss(css, problemas) {
    let s = String(css || '');
    if (s.length > LIMITES.css) { problemas.push(`CSS maior que ${LIMITES.css / 1024} KB`); s = s.slice(0, LIMITES.css); }
    s = s.replace(/\/\*[\s\S]*?(\*\/|$)/g, '');
    /*
     * Barra invertida some, com aviso. Em CSS ela escreve qualquer caractere
     * por código — `\75 rl(` é `url(` — e toda conferência acima seria
     * contornada. Nenhuma peça precisa dela.
     */
    if (s.indexOf('\\') >= 0) { problemas.push('CSS: barra invertida (escape) não é permitida'); s = s.replace(/\\/g, ''); }
    // `>` é combinador válido em seletor e `<` cabe em condição de @container;
    // o que não pode é TAG.
    if (/<\s*\/?\s*[A-Za-z]/.test(s)) { problemas.push('CSS: tag dentro do CSS não é permitida'); s = s.replace(/<\s*\/?\s*[A-Za-z][^>]*>?/g, ''); }

    // Variáveis próprias da peça (ex.: --respiro) podem ser usadas nela mesma.
    const locais = new Set();
    s.replace(/(?:^|[;{\s])(--[A-Za-z0-9_-]+)\s*:/g, (m, nome) => { if (!nome.startsWith('--mt-')) locais.add(nome.toLowerCase()); return m; });
    return lerRegras(s, locais, problemas, false);
  }

  /* ======================= HTML: atributos ======================= */

  // `style` só posiciona camada (--x --y --w --h). Todo o resto é do CSS.
  function estiloDeCamada(valor, problemas) {
    const ok = [];
    for (const parte of dividir(valor, ';')) {
      const d = parte.trim();
      if (!d) continue;
      const dp = d.indexOf(':');
      const prop = d.slice(0, dp).trim().toLowerCase();
      const v = d.slice(dp + 1).trim();
      if (dp <= 0 || !CAMADA.has(prop)) { problemas.push(`style só posiciona camada (--x --y --w --h); "${d.slice(0, 30)}" vai para o CSS`); continue; }
      if (!/^-?(\d+\.?\d*|\.\d+)(%|cqw|cqh|cqmin|cqmax)?$/.test(v)) { problemas.push(`${prop}: valor "${v.slice(0, 20)}" precisa ser número com %, cqw ou cqh`); continue; }
      ok.push(prop + ':' + v);
    }
    return ok.join(';');
  }

  function limparAtributos(no, problemas) {
    const saida = [];
    const ja = new Set();
    for (const [nome, valor] of no.attrs) {
      if (ja.has(nome)) continue;
      ja.add(nome);
      let v = String(valor);
      if (/^on/.test(nome)) { problemas.push(`atributo de evento (${nome}) não é permitido: a peça não executa código`); continue; }
      if (nome === 'class') {
        const cls = v.split(/\s+/).filter(Boolean);
        const boas = cls.filter((c) => CLASSE.test(c));
        if (boas.length < cls.length) problemas.push(`classe inválida em <${no.nome}>`);
        if (boas.length) saida.push(['class', boas.join(' ')]);
        continue;
      }
      /*
       * `data-campo-qr` é um QR desenhado pelo NOSSO servidor (/api/qr.svg) a
       * partir do texto do campo — o link do WhatsApp, o Instagram. O cliente
       * digita o link; a imagem nunca vem de fora.
       */
      if (nome === 'data-campo' || nome === 'data-camada'
        || ((nome === 'data-campo-img' || nome === 'data-campo-qr') && no.nome === 'img')) {
        if (NOME_CAMPO.test(v)) saida.push([nome, v]);
        else problemas.push(`${nome}="${v.slice(0, 30)}": use letras minúsculas, números e hífen`);
        continue;
      }
      if (nome === 'data-vivo') {
        if (VIVOS.indexOf(v) >= 0) saida.push([nome, v]);
        else problemas.push(`data-vivo="${v.slice(0, 20)}" não existe (use ${VIVOS.join(', ')})`);
        continue;
      }
      if (nome === 'data-entrada' || nome === 'data-continua') {
        const lista = nome === 'data-entrada' ? ENTRADAS : CONTINUAS;
        if (lista.indexOf(v) >= 0) saida.push([nome, v]);
        else problemas.push(`${nome}="${v.slice(0, 20)}" não existe (use ${lista.join(', ')})`);
        continue;
      }
      if (nome === 'data-ordem') {
        if (/^\d{1,2}$/.test(v) && Number(v) <= 20) saida.push([nome, v]);
        else problemas.push(`data-ordem="${v.slice(0, 10)}": use um número de 0 a 20`);
        continue;
      }
      if (nome === 'style') {
        const est = estiloDeCamada(v, problemas);
        if (est) saida.push(['style', est]);
        continue;
      }
      if (nome === 'aria-hidden' && v === 'true') { saida.push([nome, v]); continue; }
      /*
       * `data-repete="marca"`: o nome da marca DENTRO da peça. Sozinha, a
       * peça precisa dele; numa tela com cabeçalho, ele apareceria duas vezes
       * — e o renderizador esconde (PLANO §4.7: cada zona tem um papel).
       */
      if (nome === 'data-repete') {
        if (v === 'marca') saida.push([nome, v]);
        else problemas.push(`data-repete="${v.slice(0, 20)}" não existe (use marca)`);
        continue;
      }
      if (nome === 'alt' && no.nome === 'img') { saida.push([nome, v.slice(0, 160)]); continue; }
      if (nome === 'src' || nome === 'srcset' || nome === 'href') {
        problemas.push(`${nome} não é permitido: foto entra por data-campo-img e o renderizador resolve o arquivo`);
        continue;
      }
      problemas.push(`atributo ${nome} não é permitido em <${no.nome}>`);
    }
    no.attrs = saida;
  }

  /* ======================= HTML: a porta ======================= */

  function higienizarHtml(html, problemas, avisos) {
    let s = String(html || '');
    if (s.length > LIMITES.html) { problemas.push(`HTML maior que ${LIMITES.html / 1024} KB`); s = s.slice(0, LIMITES.html); }
    const arv = arvore(tokenizar(s));

    const campos = [];
    const vistos = new Set();
    let elementos = 0, imagens = 0, fundo = 0, avisosTexto = 0;
    const descartadas = new Set();
    const desembrulhadas = new Set();

    function visitar(no, prof, emCampo) {
      if (no.texto != null) {
        if (!emCampo && /[\p{L}\p{N}]/u.test(no.texto) && avisosTexto < 3) {
          avisosTexto++;
          avisos.push(`texto fixo fora de campo: "${no.texto.trim().slice(0, 30)}" — o cliente não consegue editar`);
        }
        return;
      }
      if (no.nome !== '#raiz') {
        if (SOMEM_INTEIRAS.has(no.nome)) { no.some = true; descartadas.add(no.nome); return; }
        if (!TAGS.has(no.nome)) { no.desembrulha = true; desembrulhadas.add(no.nome); }
        else {
          elementos++;
          fundo = Math.max(fundo, prof);
          limparAtributos(no, problemas);
          const campo = (no.attrs.find((a) => a[0] === 'data-campo') || [])[1];
          const campoImg = (no.attrs.find((a) => a[0] === 'data-campo-img') || [])[1];
          const campoQr = (no.attrs.find((a) => a[0] === 'data-campo-qr') || [])[1];
          if (no.nome === 'img') {
            imagens++;
            if (!campoImg && !campoQr) problemas.push('<img> sem data-campo-img: toda foto é um campo que o cliente troca');
          }
          const nome = campo || campoImg || campoQr;
          const tipo = campoImg ? 'img' : campoQr ? 'qr' : 'texto';
          if (nome) {
            if (vistos.has(nome)) avisos.push(`campo "${nome}" aparece mais de uma vez`);
            else {
              vistos.add(nome);
              campos.push({ nome, tipo, exemplo: tipo === 'texto' ? textoDe(no).trim().slice(0, LIMITES.campo) : '' });
            }
          }
          emCampo = emCampo || !!campo || (no.attrs.some((a) => a[0] === 'data-vivo')) || (no.attrs.some((a) => a[0] === 'aria-hidden'));
        }
      }
      for (const f of no.filhos) visitar(f, prof + 1, emCampo);
    }
    visitar(arv, 0, false);

    descartadas.forEach((t) => problemas.push(`<${t}> não é permitido e foi removido com o conteúdo`));
    desembrulhadas.forEach((t) => problemas.push(`<${t}> não é permitido; o texto dentro dele ficou`));
    if (elementos > LIMITES.elementos) problemas.push(`${elementos} elementos — o máximo é ${LIMITES.elementos} (memória do box)`);
    if (imagens > LIMITES.imagens) problemas.push(`${imagens} fotos — o máximo é ${LIMITES.imagens}`);
    if (fundo > LIMITES.profundidade) problemas.push(`aninhamento com ${fundo} níveis — o máximo é ${LIMITES.profundidade}`);

    /*
     * A raiz é UMA <section class="mt-peca">. É onde o renderizador pendura
     * tokens e container. Sem ela, a peça é embrulhada numa — e recusada,
     * porque a IA precisa aprender o formato, não contar com o conserto.
     */
    const blocos = arv.filhos.filter((f) => !(f.texto != null && !f.texto.trim()) && !f.some);
    const raizOk = blocos.length === 1 && blocos[0].nome === 'section'
      && (blocos[0].attrs.find((a) => a[0] === 'class') || [, ''])[1].split(' ').indexOf('mt-peca') >= 0;
    let saida = serializar(arv);
    if (!raizOk) {
      problemas.push('a peça precisa ter uma raiz só: <section class="mt-peca">…</section>');
      saida = '<section class="mt-peca">' + saida + '</section>';
    }
    if (!campos.length) avisos.push('nenhum data-campo: o cliente não vai conseguir editar o texto');
    return { html: saida, campos };
  }

  function textoDe(no) {
    if (no.texto != null) return no.texto;
    if (no.some) return '';
    return no.filhos.map(textoDe).join('');
  }

  function serializar(no) {
    if (no.texto != null) return escaparTexto(no.texto);
    if (no.some) return '';
    const dentro = no.filhos.map(serializar).join('');
    if (no.nome === '#raiz' || no.desembrulha) return dentro;
    const attrs = no.attrs.map((a) => ' ' + a[0] + '="' + escaparAttr(a[1]) + '"').join('');
    if (VAZIAS.has(no.nome)) return '<' + no.nome + attrs + '>';
    return '<' + no.nome + attrs + '>' + dentro + '</' + no.nome + '>';
  }

  /*
   * A porta. Recebe { html, css } e devolve o que pode ir para a tela, mais
   * o que ficou de fora e por quê.
   *
   * `ok` é false quando houve QUALQUER problema: no servidor isso recusa a
   * peça. O html/css devolvido é seguro mesmo assim — é o que o player usa,
   * porque lá a peça já foi aceita e recusar seria tela vazia.
   */
  function higienizar(entrada) {
    const e = entrada || {};
    const problemas = [];
    const avisos = [];
    const h = higienizarHtml(e.html, problemas, avisos);
    const css = higienizarCss(e.css, problemas);
    const p = problemas.slice(0, LIMITES.problemas);
    if (problemas.length > LIMITES.problemas) p.push(`… e mais ${problemas.length - LIMITES.problemas} problema(s)`);
    return { ok: problemas.length === 0, html: h.html, css, campos: h.campos, problemas: p, avisos };
  }

  /* ======================= O item ======================= */

  /*
   * Foto de campo: arquivo NOSSO. Caminho de /media/ (o storage serve tudo
   * por ali, no disco ou no R2) ou o mesmo caminho num host que quem chama
   * declarou — o servidor passa o PUBLIC_BASE do R2. Nada de endereço de
   * terceiro: a TV pode estar offline, e foto de fora é rastreio.
   */
  function ehMidia(v, hosts) {
    const s = String(v || '');
    /*
     * /pecas-ouro/fotos/ também é nosso: são as fotos de exemplo das
     * peças-ouro, as que aparecem quando o cliente preenche uma peça à mão
     * (PLANO §4.15: IA fora do ar nunca é tela vazia).
     */
    const caminho = (p) => /^\/(media|pecas-ouro\/fotos)\/[A-Za-z0-9._/-]+$/.test(p) && p.indexOf('..') < 0;
    if (s[0] === '/') return caminho(s);
    let u;
    try { u = new URL(s); } catch (e) { return false; }
    return u.protocol === 'https:' && (hosts || []).indexOf(u.host) >= 0 && caminho(u.pathname) && !u.search && !u.hash;
  }

  /*
   * A marca VAI JUNTO no item: cores e fontes, copiadas da Marca no momento
   * de publicar. A TV desenha sem internet — ela não pode ir buscar a marca
   * pelo `marcaId` na hora de exibir. Quando a Marca muda, o servidor copia
   * de novo (é o que faz "trocar a marca reestiliza a peça sem gerar").
   * Sem marca, o renderizador usa a do tema da tela.
   */
  function marcaDoItem(m) {
    if (!m || typeof m !== 'object') return null;
    const cores = (Array.isArray(m.cores) ? m.cores : [])
      .map((c) => String(c || '').toLowerCase()).filter((c) => /^#[0-9a-f]{6}$/.test(c)).slice(0, 3);
    const fonte = (id) => (F.FAMILIAS[id] ? id : '');
    if (!cores.length) return null;
    return { cores, fonteTitulo: fonte(m.fonteTitulo), fonteApoio: fonte(m.fonteApoio) };
  }

  /*
   * Valida e normaliza um item `peca-html` inteiro (PLANO §4.6). O que entra
   * no config da tela sai daqui, e só daqui.
   *
   * `type`, e não `tipo` como no exemplo do plano: o item mora na playlist
   * da zona ao lado dos outros (`type: 'composicao'`, `'poster'`…), e o
   * player escolhe como desenhar cada um por esse campo.
   *
   * opts.hostsMidia: hosts aceitos para foto além do caminho relativo.
   */
  function validarItem(item, opts) {
    const it = item && typeof item === 'object' ? item : {};
    const o = opts || {};
    const h = higienizar({ html: it.html, css: it.css });
    const problemas = h.problemas.slice();
    if (it.type !== 'peca-html') problemas.push('type precisa ser "peca-html"');

    const campos = {};
    const porNome = {};
    h.campos.forEach((c) => { porNome[c.nome] = c; });
    const entrada = it.campos && typeof it.campos === 'object' ? it.campos : {};
    Object.keys(entrada).forEach((k) => {
      const def = porNome[k];
      if (!def) { problemas.push(`campo "${String(k).slice(0, 30)}" não existe nesta peça`); return; }
      const v = entrada[k];
      if (def.tipo === 'img') {
        if (ehMidia(v, o.hostsMidia)) campos[k] = String(v);
        else problemas.push(`foto do campo "${k}" precisa ser um arquivo das Mídias`);
        return;
      }
      // Texto puro: sem caractere de controle, com teto. Quem escapa é o renderizador.
      campos[k] = String(v == null ? '' : v).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').slice(0, LIMITES.campo);
    });

    const formatos = (Array.isArray(it.formatos) ? it.formatos : []).filter((f) => FORMATOS.indexOf(f) >= 0);
    const origem = it.origem && typeof it.origem === 'object' ? it.origem : {};
    const curto = (v, n) => String(v == null ? '' : v).slice(0, n);
    const duracao = Number(it.duracao);
    /*
     * Os elementos que a pessoa escondeu (D19: "trocar elementos"): só nomes
     * de campo de texto ou QR que a peça declara. O desenho fica; o elemento
     * some na TV e no painel.
     */
    const ocultos = Array.from(new Set((Array.isArray(it.ocultos) ? it.ocultos : [])
      .filter((n) => porNome[n] && porNome[n].tipo !== 'img'))).slice(0, 30);
    // A peça-ouro de onde a peça veio: é por ela que o editor oferece outros desenhos da mesma família.
    const base = /^[a-z0-9-]{1,60}$/.test(String(origem.base || '')) ? String(origem.base) : '';
    const saida = {
      item: {
        type: 'peca-html',
        versao: 1,
        papel: PAPEIS.indexOf(it.papel) >= 0 ? it.papel : 'destaque',
        html: h.html,
        css: h.css,
        campos,
        marcaId: /^[A-Za-z0-9_-]{0,40}$/.test(String(it.marcaId || '')) ? String(it.marcaId || '') : '',
        marca: marcaDoItem(it.marca),
        modo: T.MODOS.indexOf(it.modo) >= 0 ? it.modo : T.MODO_PADRAO,
        duracao: isFinite(duracao) && duracao >= 4 ? Math.min(120, duracao) : 12,
        formatos: formatos.length ? Array.from(new Set(formatos)) : ['16/9'],
        origem: Object.assign({ motor: curto(origem.motor, 40), modelo: curto(origem.modelo, 60), pedido: curto(origem.pedido, 400) }, base ? { base: base } : {}),
      },
      campos: h.campos,
      problemas,
      avisos: h.avisos,
      ok: problemas.length === 0,
    };
    if (ocultos.length) saida.item.ocultos = ocultos;
    return saida;
  }

  /*
   * Passa toda peça em HTML de uma config de tela pela porta, trocando cada
   * item pela versão que saiu dela. Devolve os problemas com a zona e a
   * posição de cada um — o servidor recusa a config inteira se houver algum.
   *
   * Os campos de PLAYLIST (agendamento, a marca da campanha, o id…) não são
   * da peça e passam como estão, iguais aos de qualquer outro item.
   */
  function conferirConfig(cfg, opts) {
    const problemas = [];
    const zonas = (cfg && cfg.zonas) || {};
    Object.keys(zonas).forEach((zona) => {
      const dados = zonas[zona];
      if (!dados || typeof dados !== 'object') return;
      // A peça FIXA do cabeçalho/rodapé passa pela mesma porta que a da playlist.
      if (dados.peca) {
        if (dados.peca.type !== 'peca-html') problemas.push(zona + ' (peça fixa): type precisa ser "peca-html"');
        const v = validarItem(dados.peca, opts);
        v.problemas.forEach((p) => { if (!/^type precisa/.test(p)) problemas.push(zona + ' (peça fixa): ' + p); });
        dados.peca = Object.assign({}, dados.peca, v.item);
      }
      // As peças que giram no cabeçalho/rodapé (EXECUTOR item 22): cada uma pela mesma porta.
      if (Array.isArray(dados.pecas)) {
        dados.pecas = dados.pecas.map((peca, i) => {
          if (!peca || peca.type !== 'peca-html') { problemas.push(zona + ' (peça ' + (i + 1) + ' do giro): type precisa ser "peca-html"'); return peca; }
          const v = validarItem(peca, opts);
          v.problemas.forEach((p) => problemas.push(zona + ' (peça ' + (i + 1) + ' do giro): ' + p));
          return Object.assign({}, peca, v.item);
        });
      }
      if (!Array.isArray(dados.items)) return;
      dados.items = dados.items.map((item, i) => {
        if (!item || item.type !== 'peca-html') return item;
        const v = validarItem(item, opts);
        v.problemas.forEach((p) => problemas.push(zona + ' #' + (i + 1) + ': ' + p));
        return Object.assign({}, item, v.item);
      });
    });
    return { problemas };
  }

  /*
   * Lê um arquivo de peça-ouro (pecas-ouro/*.html): um <style> e a
   * <section class="mt-peca">. Um arquivo só por peça porque é assim que
   * se desenha e se revisa — o CSS ao lado do HTML que ele estiliza. O que
   * sai daqui ainda passa pela porta; ser nosso não dispensa.
   */
  function doArquivo(texto) {
    const s = String(texto || '').replace(/<!--[\s\S]*?-->/g, '');
    const m = /<style[^>]*>([\s\S]*?)<\/style>/i.exec(s);
    return { css: m ? m[1] : '', html: (m ? s.replace(m[0], '') : s).trim() };
  }

  /*
   * As fotos que a peça vai pedir ao ser desenhada: os campos de foto
   * (data-campo-img) com valor que a porta aceita. O player as carrega e
   * decodifica ANTES da vez da peça (EXECUTOR, item 10) — sem isso a foto
   * decodificava no primeiro quadro da entrada. Leitura leve, por expressão,
   * e não higienizar(): roda a cada troca de slide, numa TV que pode ser fraca.
   */
  function fotosDoItem(item, hosts) {
    const it = item && typeof item === 'object' ? item : {};
    const campos = it.campos && typeof it.campos === 'object' ? it.campos : {};
    const urls = [];
    String(it.html || '').replace(/data-campo-img="([\w-]+)"/g, (_, nome) => {
      const v = campos[nome];
      if (ehMidia(v, hosts) && urls.indexOf(v) < 0) urls.push(v);
      return '';
    });
    return urls;
  }

  return {
    LIMITES, PAPEIS, FORMATOS, VIVOS,
    higienizar, validarItem, ehMidia, doArquivo, conferirConfig, fotosDoItem,
  };
});
