/*
 * A porta da peça em HTML (js/peca-html.js, docs/PLANO.md §4.2).
 *
 * A IA vai escrever HTML e CSS, e o que ela escrever vai para a parede de
 * uma loja. Estes testes guardam duas promessas, nesta ordem:
 *
 *   1. NADA PERIGOSO PASSA — script, evento, endereço externo, CSS que
 *      escapa da peça. Testado com os truques conhecidos e com uma rodada de
 *      lixo aleatório, porque o próximo truque ninguém conhece ainda.
 *   2. A PEÇA BONITA PASSA INTEIRA — a "Oferta com foto" que o dono aprovou
 *      entra sem nenhum problema. Uma porta que recusa a peça boa empurra a
 *      IA para fazer peça pior.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const P = require('../js/peca-html.js');
/*
 * A peça boa é a primeira da biblioteca-ouro, lida do arquivo de verdade:
 * se alguém editar a peça e ela deixar de passar pela porta, é aqui que
 * aparece — antes da bancada, antes da TV.
 */
const BOA = P.doArquivo(fs.readFileSync(path.join(__dirname, '..', 'pecas-ouro', 'oferta-foto.html'), 'utf8'));

const embrulhar = (miolo) => '<section class="mt-peca">' + miolo + '</section>';
const so = (html, css) => P.higienizar({ html: html == null ? embrulhar('<p data-campo="t">oi</p>') : html, css: css || '' });

// O que NUNCA pode aparecer na saída, em lugar nenhum.
function semPerigo(r) {
  const tudo = r.html + '\n' + r.css;
  assert.doesNotMatch(tudo, /<\s*(script|iframe|object|embed|svg|math|style|link|meta|base|form|input|template|video|audio)/i, 'tag perigosa na saída');
  assert.doesNotMatch(r.html, /\son[a-z]+\s*=/i, 'atributo de evento na saída');
  /*
   * "javascript:" ou "url(" escritos como TEXTO da peça são inofensivos:
   * saem escapados e aparecem na tela como letras (o fuzz achou um). O
   * perigo é dentro de atributo ou de CSS, e é lá que se confere.
   */
  const valores = [...r.html.matchAll(/="([^"]*)"/g)].map((m) => m[1]).join('\n');
  assert.doesNotMatch(valores + '\n' + r.css, /javascript:/i, 'javascript: na saída');
  assert.doesNotMatch(valores + '\n' + r.css, /url\s*\(|@import|expression\s*\(/i, 'endereço por CSS na saída');
  // `<` sozinho é legítimo ("@container (aspect-ratio < 1)"); tag e escape, não.
  assert.doesNotMatch(r.css, /<\s*[!/a-z]|\\/i, 'tag ou escape no CSS');
  assert.doesNotMatch(r.html, /\s(src|srcset|href|xlink:href|formaction)\s*=/i, 'endereço por atributo na saída');
  // Todo atributo que sobrou está na lista do que pode.
  const permitidos = new Set(['class', 'data-campo', 'data-campo-img', 'data-vivo', 'data-entrada',
    'data-continua', 'data-ordem', 'data-camada', 'style', 'aria-hidden', 'alt']);
  for (const m of r.html.matchAll(/<[a-z0-9]+((?:\s+[^\s=>]+="[^"]*")*)\s*>/g)) {
    for (const a of m[1].matchAll(/\s+([^\s=>]+)="/g)) assert.ok(permitidos.has(a[1]), 'atributo fora da lista: ' + a[1]);
  }
}

/* ---------------- A peça boa ---------------- */

test('a peça aprovada pelo dono passa inteira, sem nenhum problema nem aviso', () => {
  const r = P.higienizar(BOA);
  assert.deepEqual(r.problemas, []);
  assert.deepEqual(r.avisos, []);
  assert.equal(r.ok, true);
  // Nada de importante foi perdido no caminho.
  for (const trecho of ['@container (aspect-ratio < 1)', '@container (max-width: 700px)', 'var(--mt-fundo-0)',
    'translateY(-56%)', 'h1 > span', 'var(--mt-fonte-titulo)', 'data-entrada="esquerda"']) {
    assert.ok((r.html + r.css).includes(trecho), 'sumiu: ' + trecho);
  }
  assert.deepEqual(r.campos.map((c) => c.nome), ['foto', 'marca', 'kicker', 'titulo', 'oferta', 'apoio',
    'preco-rotulo', 'parcelas', 'preco', 'centavos', 'cta']);
  assert.equal(r.campos.find((c) => c.nome === 'titulo').exemplo, 'Óculos de sol');
  assert.equal(r.campos.find((c) => c.nome === 'foto').tipo, 'img');
  semPerigo(r);
});

test('higienizar de novo não muda nada — a saída já é a forma final', () => {
  const r1 = P.higienizar(BOA);
  const r2 = P.higienizar({ html: r1.html, css: r1.css });
  assert.equal(r2.html, r1.html);
  assert.equal(r2.css, r1.css);
});

/* ---------------- HTML: os truques conhecidos ---------------- */

const ATAQUES_HTML = [
  ['script', '<script>alert(1)</script>'],
  ['script maiúsculo', '<SCRIPT SRC=//x.js></SCRIPT>'],
  ['script partido', '<scr<script>ipt>alert(1)</script>'],
  ['script com div dentro', '<script>"</div><img onerror=alert(1)>"</script>'],
  ['evento', '<img data-campo-img="f" src=x onerror=alert(1)>'],
  ['evento sem aspas', '<div onmouseover=alert(1)>x</div>'],
  ['evento com barra', '<div/onclick="alert(1)">x</div>'],
  ['link javascript', '<a href="javascript:alert(1)">x</a>'],
  ['link com entidade', '<a href="&#106;avascript:alert(1)">x</a>'],
  ['svg', '<svg onload=alert(1)><circle/></svg>'],
  ['iframe', '<iframe src="https://x"></iframe>'],
  ['style', '<style>body{background:url(//x)}</style>'],
  ['object', '<object data="x.swf"></object>'],
  ['form', '<form action="//x"><input name=a><button>ok</button></form>'],
  ['meta refresh', '<meta http-equiv="refresh" content="0;url=//x">'],
  ['base', '<base href="//x/">'],
  ['comentário', '<!--<script>alert(1)</script>-->'],
  ['comentário condicional', '<!--[if IE]><script>alert(1)</script><![endif]-->'],
  ['entidade de tag', '&lt;script&gt;alert(1)&lt;/script&gt;'],
  ['estilo com url', '<div style="background:url(//x)">x</div>'],
  ['estilo com expressão', '<div style="width:expression(alert(1))">x</div>'],
  ['template', '<template><script>alert(1)</script></template>'],
  ['vídeo', '<video src="//x.mp4" autoplay></video>'],
  ['sem fechar', '<div class="a"><span>x<img data-campo-img="f" src=//x'],
  ['atributo duplicado', '<div class="a" class="b" onclick="x">x</div>'],
  ['srcset', '<img data-campo-img="f" srcset="//x 1x">'],
];

for (const [nome, ataque] of ATAQUES_HTML) {
  test('HTML recusa: ' + nome, () => {
    const r = so(embrulhar('<p data-campo="t">oi</p>' + ataque));
    semPerigo(r);
    /*
     * Entidade escapada é texto e continua texto; comentário some inteiro,
     * com o que tiver dentro. Nenhum dos dois é problema para a IA corrigir
     * — recusar a peça por um comentário seria gastar uma geração à toa.
     */
    if (nome !== 'entidade de tag' && !nome.startsWith('comentário')) assert.equal(r.ok, false, 'deveria acusar: ' + ataque);
  });
}

test('desenho, código e formulário somem COM o conteúdo — o texto deles não vaza para a peça', () => {
  /*
   * Tag desconhecida comum é desembrulhada e o texto fica. Estas não: o
   * texto de um <svg> ou de um <template> solto na peça é lixo na parede.
   */
  for (const t of ['svg', 'template', 'script', 'style', 'textarea', 'form', 'math']) {
    const r = so(embrulhar(`<p data-campo="t">fica</p><${t}><text>VAZOU</text></${t}>`));
    assert.ok(!r.html.includes('VAZOU'), t + ': ' + r.html);
    assert.ok(r.html.includes('fica'));
  }
});

test('texto com cara de tag sai escapado, nunca como tag', () => {
  const r = so(embrulhar('<p data-campo="t">&lt;script&gt;alert(1)&lt;/script&gt; 3 < 5 & 7 > 2</p>'));
  assert.ok(r.html.includes('&lt;script&gt;alert(1)&lt;/script&gt; 3 &lt; 5 &amp; 7 &gt; 2'), r.html);
  semPerigo(r);
});

/* ---------------- CSS: os truques conhecidos ---------------- */

const ATAQUES_CSS = [
  ['url', '.a{background:url(//x/a.png)}'],
  ['url com aspas e espaço', '.a{background-image: url ( "//x" )}'],
  ['image-set', '.a{background:image-set("//x" 1x)}'],
  ['import', '@import url(//x.css); .a{width:1cqw}'],
  ['import solto', '@import "//x.css";'],
  ['escape de url', '.a{background:\\75 rl(//x)}'],
  ['escape em propriedade', '.a{\\62 ackground:red}'],
  ['expressão', '.a{width:expression(alert(1))}'],
  ['fechando style', '.a{width:1cqw}</style><script>alert(1)</script>'],
  ['font-face', '@font-face{font-family:x;src:url(//x.woff)}'],
  ['media', '@media (min-width:1px){.a{width:1cqw}}'],
  ['keyframes', '@keyframes x{from{opacity:0}to{opacity:1}}'],
  ['animation', '.a{animation:x 1s infinite}'],
  ['transition', '.a{transition:all .3s}'],
  ['filter', '.a{filter:blur(4px)}'],
  ['backdrop-filter', '.a{backdrop-filter:blur(1cqw)}'],
  ['mix-blend-mode', '.a{mix-blend-mode:multiply}'],
  ['will-change', '.a{will-change:transform}'],
  ['position fixed', '.a{position:fixed;inset:0}'],
  ['hex', '.a{color:#ff0000}'],
  ['hex curto', '.a{border:.1cqw solid #fff}'],
  ['rgb', '.a{color:rgb(255 0 0)}'],
  ['oklch', '.a{background:oklch(60% .2 30)}'],
  ['color-mix', '.a{color:color-mix(in srgb, var(--mt-texto), white)}'],
  ['cor por nome', '.a{color:red}'],
  ['cor por nome em borda', '.a{border:.1cqw solid black}'],
  ['px', '.a{width:300px}'],
  ['vw', '.a{width:50vw}'],
  ['rem', '.a{font-size:2rem}'],
  ['token inventado', '.a{color:var(--mt-azul)}'],
  ['variável não declarada', '.a{width:var(--largura)}'],
  ['redefinir token', '.a{--mt-fundo:var(--mt-texto)}'],
  ['root', ':root{--x:1}'],
  ['body', 'body{background:var(--mt-fundo)}'],
  ['host', ':host{position:absolute}'],
  ['sombra enorme', '.a{box-shadow:0 0 20cqw var(--mt-fundo)}'],
  ['sombras demais', '.a{box-shadow:0 0 1cqw var(--mt-fundo),0 0 1cqw var(--mt-fundo),0 0 1cqw var(--mt-fundo)}'],
  ['fonte fora do catálogo', '.a{font-family:"Comic Sans MS"}'],
  ['fonte abreviada fora do catálogo', '.a{font:700 2cqw "Papyrus"}'],
  ['content com url', '.a::before{content:url(//x)}'],
  ['content com attr', '.a::before{content:attr(data-x)}'],
  ['bloco aninhado', '.a{.b{width:1cqw}}'],
  ['mask', '.a{mask:linear-gradient(var(--mt-fundo), var(--mt-fundo-0))}'],
];

for (const [nome, ataque] of ATAQUES_CSS) {
  test('CSS recusa: ' + nome, () => {
    const r = so(null, ataque);
    assert.equal(r.ok, false, 'deveria acusar: ' + ataque);
    semPerigo(r);
  });
}

test('CSS: o que uma peça precisa passa', () => {
  const css = [
    '.a{color:var(--mt-texto);background:var(--mt-superficie)}',
    '.b{width:40cqw;height:12cqh;margin:1cqmin 2cqmax;padding:2%;gap:1em}',
    '.c{transform:translateY(-50%) rotate(-3deg) translate3d(0,0,0)}',
    '.d{background:linear-gradient(90deg, var(--mt-fundo) 40%, var(--mt-fundo-0) 68%)}',
    '.e{display:grid;grid-template-columns:repeat(2,1fr);aspect-ratio:16/9}',
    '.f{font:400 7.4cqw/.9 var(--mt-fonte-titulo);letter-spacing:.3em}',
    ".g{font-family:'Playfair Display',Georgia,serif}",
    '.h{box-shadow:0 .2cqw 1.5cqw var(--mt-fundo)}',
    ".i::after{content:''}",
    '.j{--respiro:3cqw;padding:var(--respiro)}',
    '.k{left:var(--x);top:var(--y);width:var(--w);height:var(--h)}',
    '.l > .m + .n ~ .o{opacity:.8;z-index:3;border-radius:var(--mt-raio)}',
    '.p{color:transparent;border-color:currentColor;line-height:1.1;font-weight:800}',
    '@container (aspect-ratio < 1){.a{width:80cqw}}',
    '@container (max-width: 700px){.a{display:none}}',
    '@container (orientation: portrait) and (min-height: 400px){.a{display:block}}',
    '.q{width:1e3cqw}',
  ].join('\n');
  const r = so(null, css);
  assert.deepEqual(r.problemas, []);
  assert.ok(r.css.includes('@container (max-width: 700px)'));
});

test('pixel passa na condição do @container e em nenhum outro lugar', () => {
  assert.equal(so(null, '@container (max-width: 700px){.a{width:10cqw}}').ok, true);
  assert.equal(so(null, '@container (max-width: 700px){.a{width:10px}}').ok, false);
});

test('cada recusa diz o motivo, numa frase que a IA consegue corrigir', () => {
  const r = so(null, '.a{color:#fff;width:300px;filter:blur(1px)}');
  assert.ok(r.problemas.some((p) => /cor só por token/.test(p)), r.problemas.join('\n'));
  assert.ok(r.problemas.some((p) => /unidade px .*cqw/.test(p)));
  assert.ok(r.problemas.some((p) => /filter .*GPU/.test(p)));
  // A declaração ruim sai; o resto do bloco fica.
  assert.equal(so(null, '.a{color:#fff;width:30cqw}').css, '.a{width:30cqw}');
});

/* ---------------- Atributos ---------------- */

test('animação só da lista: data-entrada, data-continua e data-ordem', () => {
  const r = so(embrulhar('<p data-campo="t" data-entrada="subir" data-continua="flutuar" data-ordem="3">x</p>'));
  assert.equal(r.ok, true);
  assert.ok(r.html.includes('data-entrada="subir" data-continua="flutuar" data-ordem="3"'));
  for (const [attr, valor] of [['data-entrada', 'voar'], ['data-continua', 'girar'], ['data-ordem', '99'], ['data-ordem', '-1']]) {
    const ruim = so(embrulhar(`<p data-campo="t" ${attr}="${valor}">x</p>`));
    assert.equal(ruim.ok, false, attr + '=' + valor);
    assert.ok(!ruim.html.includes(attr + '="' + valor), 'ficou ' + attr + '=' + valor);
  }
});

test('style só posiciona camada (--x --y --w --h)', () => {
  const r = so(embrulhar('<div data-camada="bloco" style="--x: 6%; --y: 10cqh; --w: 40cqw; --h: 30%">'
    + '<p data-campo="t">x</p></div>'));
  assert.equal(r.ok, true, r.problemas.join('\n'));
  assert.ok(r.html.includes('style="--x:6%;--y:10cqh;--w:40cqw;--h:30%"'));
  const ruim = so(embrulhar('<div style="color:red;--x:6px;--y:calc(1px)"><p data-campo="t">x</p></div>'));
  assert.equal(ruim.ok, false);
  assert.ok(!/style=/.test(ruim.html), ruim.html);
});

test('data-vivo só para o que o player preenche', () => {
  assert.equal(so(embrulhar('<span data-vivo="relogio"></span><p data-campo="t">x</p>')).ok, true);
  assert.equal(so(embrulhar('<span data-vivo="cotacao"></span><p data-campo="t">x</p>')).ok, false);
});

/* ---------------- Campos e formato ---------------- */

test('foto só por campo: <img> sem data-campo-img é recusada e src some', () => {
  const r = so(embrulhar('<img src="/media/a.jpg"><p data-campo="t">x</p>'));
  assert.equal(r.ok, false);
  assert.ok(r.problemas.some((p) => /data-campo-img/.test(p)));
  assert.ok(!r.html.includes('src'));
});

test('avisos não recusam: texto fixo fora de campo e campo repetido', () => {
  const r = so(embrulhar('<p data-campo="t">a</p><p data-campo="t">b</p><p>fixo</p><span aria-hidden="true">→</span>'));
  assert.equal(r.ok, true);
  assert.ok(r.avisos.some((a) => /repetido|mais de uma vez/.test(a)));
  assert.ok(r.avisos.some((a) => /fixo/.test(a)));
  // Seta decorativa marcada como aria-hidden não é texto que o cliente edita.
  assert.ok(!r.avisos.some((a) => a.includes('→')));
});

test('a raiz é uma <section class="mt-peca"> só; sem ela, embrulha e recusa', () => {
  const r = P.higienizar({ html: '<div data-campo="t">x</div><p>y</p>', css: '' });
  assert.equal(r.ok, false);
  assert.match(r.html, /^<section class="mt-peca">.*<\/section>$/);
});

test('limites: elementos, fotos, tamanho e aninhamento', () => {
  const muitos = embrulhar('<p data-campo="t">x</p>' + '<span></span>'.repeat(160));
  assert.ok(so(muitos).problemas.some((p) => /150/.test(p)));
  const fotos = embrulhar(Array.from({ length: 7 }, (_, i) => `<img data-campo-img="f${i}">`).join(''));
  assert.ok(so(fotos).problemas.some((p) => /fotos/.test(p)));
  assert.ok(so(embrulhar('<p data-campo="t">' + 'x'.repeat(70 * 1024) + '</p>')).problemas.some((p) => /KB/.test(p)));
  const fundo = embrulhar('<div>'.repeat(30) + '<p data-campo="t">x</p>' + '</div>'.repeat(30));
  assert.ok(so(fundo).problemas.some((p) => /níveis/.test(p)));
});

/* ---------------- Fuzz ---------------- */

test('lixo aleatório montado com pedaços de ataque nunca vira perigo', () => {
  /*
   * Os ataques acima são os que conhecemos. Aqui eles são misturados,
   * cortados ao meio e colados fora de ordem — com semente, para a mesma
   * rodada sempre testar a mesma coisa.
   */
  const pedacos = ['<', '>', '/', '"', "'", '=', ' ', 'script', 'img', 'svg', 'style', 'iframe', 'onerror',
    'onload', 'src', 'href', 'javascript:', 'alert(1)', '<!--', '-->', '&lt;', '&#x3C;', '&#60;', 'url(', ')',
    '<div', '</div>', '<p data-campo="t">', '</p>', 'data-campo-img', '\n', '\\', '`', '<![CDATA[', ']]>', '<?', '?>'];
  let s = 99;
  const r = () => { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648; };
  for (let i = 0; i < 400; i++) {
    let lixo = '';
    const n = 5 + Math.floor(r() * 40);
    for (let k = 0; k < n; k++) lixo += pedacos[Math.floor(r() * pedacos.length)];
    const saida = P.higienizar({ html: lixo, css: lixo });
    semPerigo(saida);
    // E a saída, lida de novo, continua igual: o que sai é forma final.
    const de = P.higienizar({ html: saida.html, css: saida.css });
    assert.equal(de.html, saida.html, 'html instável para: ' + JSON.stringify(lixo));
  }
});

/* ---------------- O item ---------------- */

test('validarItem: normaliza o item e só aceita campos que existem na peça', () => {
  const r = P.validarItem({
    type: 'peca-html', papel: 'lateral', modo: 'marca', formatos: ['9/16', '4/3', '9/16'],
    html: BOA.html, css: BOA.css, marcaId: 'm_1',
    campos: { titulo: 'Lentes com 20%', foto: '/media/t1/abc.jpg', inventado: 'x' },
    origem: { motor: 'html-v1', modelo: 'claude-sonnet-5-5', pedido: 'óculos' },
  });
  assert.equal(r.item.papel, 'lateral');
  assert.equal(r.item.modo, 'marca');
  assert.deepEqual(r.item.formatos, ['9/16']);
  assert.deepEqual(r.item.campos, { titulo: 'Lentes com 20%', foto: '/media/t1/abc.jpg' });
  assert.ok(r.problemas.some((p) => /inventado/.test(p)));
  assert.equal(r.ok, false);
});

test('validarItem: foto de campo só do nosso storage', () => {
  const com = (foto, opts) => P.validarItem({ type: 'peca-html', html: BOA.html, css: BOA.css, campos: { foto } }, opts);
  assert.equal(com('/media/t1/a.jpg').ok, true);
  assert.equal(com('https://midia.multitelas.net.br/media/t1/a.jpg', { hostsMidia: ['midia.multitelas.net.br'] }).ok, true);
  for (const ruim of ['https://images.unsplash.com/photo-1', 'http://midia.multitelas.net.br/media/a.jpg',
    '/media/../segredo', 'javascript:alert(1)', 'data:image/png;base64,AAAA', '//x.com/media/a.jpg',
    'https://midia.multitelas.net.br/media/a.jpg?x=1']) {
    assert.equal(com(ruim, { hostsMidia: ['midia.multitelas.net.br'] }).ok, false, ruim);
  }
});

test('validarItem: padrões quando falta tudo, e tipo errado é acusado', () => {
  const r = P.validarItem({ html: BOA.html, css: BOA.css });
  assert.equal(r.item.type, 'peca-html');
  assert.equal(r.item.papel, 'destaque');
  assert.deepEqual(r.item.formatos, ['16/9']);
  assert.ok(r.problemas.some((p) => /type/.test(p)));
  assert.equal(P.validarItem({ type: 'peca-html', html: BOA.html, css: BOA.css, campos: { titulo: 'a\u0000b' } }).item.campos.titulo, 'ab');
});

/* ---------------- No navegador ---------------- */

test('o mesmo arquivo roda no navegador (player) e dá a mesma saída', () => {
  /*
   * A porta roda duas vezes: no servidor ao salvar e no player ao exibir.
   * Se o player carregasse uma cópia, ou se o arquivo dependesse de
   * `require`, as duas portas divergiriam — e a do player é a última.
   */
  const ctx = vm.createContext({ URL });
  for (const f of ['cor.js', 'fontes.js', 'tokens.js', 'animacao.js', 'peca-html.js']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', f), 'utf8'), ctx, { filename: f });
  }
  const noNavegador = vm.runInContext('MTPecaHtml.higienizar', ctx)(BOA);
  const noServidor = P.higienizar(BOA);
  assert.equal(noNavegador.html, noServidor.html);
  assert.equal(noNavegador.css, noServidor.css);
  assert.equal(noNavegador.ok, true);
});
