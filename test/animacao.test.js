/*
 * Como um elemento ENTRA e como ele se mexe depois.
 *
 * É o que separa uma peça de mídia indoor de um slide: os elementos não
 * aparecem todos de uma vez, eles entram — um depois do outro, cada um de um
 * lado — e alguns continuam respirando enquanto a peça fica no ar.
 *
 * Duas regras mandam em tudo, e é o que estes testes guardam:
 *
 *   1. só `transform` e `opacity`, porque são as duas coisas que o navegador
 *      anima na GPU sem refazer o layout — numa TV de R$ 900, animar
 *      top/left/width é a diferença entre fluido e travando;
 *   2. toda entrada termina em repouso, no estado em que o editor desenhou a
 *      peça — uma animação que parasse fora do lugar deixaria a peça diferente
 *      do que foi aprovado, e só apareceria na parede.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const A = require('../js/animacao.js');

const semComentarios = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const ler = (...p) => semComentarios(fs.readFileSync(path.join(__dirname, '..', ...p), 'utf8'));
const CSS = fs.readFileSync(path.join(__dirname, '..', 'css', 'animacao.css'), 'utf8');
const RENDER = ler('js', 'render.js');
const EDITOR = ler('web', 'src', 'components', 'content', 'CompositionEditor.jsx');

/*
 * Recorta cada bloco @keyframes contando chaves.
 *
 * A primeira versão usava /@keyframes[^{]+\{[\s\S]*?\n\}/ — que exige o
 * fecha-chaves no começo de uma linha. As keyframes curtas deste arquivo cabem
 * numa linha só, então o regex via DUAS de quinze, e os dois testes das regras
 * passavam olhando quase nada.
 */
function blocosDeKeyframes(css) {
  const fora = [];
  let i = 0;
  for (;;) {
    i = css.indexOf('@keyframes', i);
    if (i < 0) break;
    let j = css.indexOf('{', i);
    if (j < 0) break;
    let nivel = 0;
    let k = j;
    for (; k < css.length; k++) {
      if (css[k] === '{') nivel++;
      else if (css[k] === '}') { nivel--; if (!nivel) break; }
    }
    fora.push(css.slice(i, k + 1));
    i = k + 1;
  }
  return fora;
}

/* ---------------- As duas regras ---------------- */

test('as keyframes só mexem em transform e opacity', () => {
  /*
   * Animar top/left/width recalcula o layout da página a cada quadro. É a
   * diferença, numa TV barata, entre uma peça fluida e uma peça aos tropeços —
   * e a TV barata é justamente onde este player mais roda.
   */
  const blocos = blocosDeKeyframes(CSS);
  assert.ok(blocos.length >= 10, 'sumiram as keyframes: achei ' + blocos.length);
  const proibidas = /\b(top|left|right|bottom|width|height|margin|padding|font-size)\s*:/;
  for (const b of blocos) {
    const nome = b.slice(0, b.indexOf('{')).trim();
    assert.ok(!proibidas.test(b), nome + ' anima uma propriedade que refaz o layout');
  }
});

test('toda ENTRADA termina em repouso', () => {
  // O estado final tem que ser exatamente o que o editor desenhou: sem
  // deslocamento e sem transparência sobrando.
  const entradas = blocosDeKeyframes(CSS).filter((b) => /^@keyframes mt-e-/.test(b));
  assert.ok(entradas.length >= 8, 'faltam entradas: ' + entradas.length);
  for (const b of entradas) {
    const nome = b.slice(0, b.indexOf('{')).trim();
    const fim = b.match(/(?:to|100%)\s*\{([^}]*)\}/);
    assert.ok(fim, nome + ' não declara estado final');
    const corpo = fim[1];
    /*
     * Quem MEXE em transform tem que terminar em `none`. Quem nunca mexeu (o
     * "aparecer" é só opacidade) não precisa declarar nada — exigir isso dele
     * seria exigir uma linha que não faz diferença nenhuma.
     */
    if (/transform:/.test(b)) {
      assert.ok(/transform:\s*none/.test(corpo), nome + ' termina fora do lugar: ' + corpo.trim());
    }
    assert.ok(!/opacity:\s*0(\.\d+)?\s*[;}]/.test(corpo), nome + ' termina transparente: ' + corpo.trim());
    assert.ok(/opacity:\s*1/.test(corpo) || !/opacity:/.test(b),
      nome + ' mexe em opacidade e não termina opaco: ' + corpo.trim());
  }
});

test('toda classe do catálogo existe no CSS', () => {
  // Uma classe sem keyframes não anima nada e não avisa: o elemento
  // simplesmente aparece parado, e ninguém descobre por quê.
  for (const x of A.ENTRADAS.concat(A.CONTINUAS)) {
    if (!x.classe) continue;
    assert.ok(CSS.includes('.' + x.classe + ' '), 'a classe ' + x.classe + ' (' + x.label + ') não existe no CSS');
    assert.ok(CSS.includes('@keyframes ' + x.classe), 'faltam as keyframes de ' + x.classe);
  }
});

test('as contínuas repetem para sempre', () => {
  const i = CSS.indexOf('animation-iteration-count: infinite');
  assert.ok(i > 0, 'as animações contínuas deixaram de repetir');
  const seletor = CSS.slice(CSS.lastIndexOf('\n.', i), i);
  assert.ok(!/mt-e-/.test(seletor), 'a regra do infinito alcançou uma classe de ENTRADA: ' + seletor.trim());
});

test('a ENTRADA roda uma vez, mesmo acompanhada de uma contínua', () => {
  /*
   * Este teste substitui um meu que passava com o defeito no lugar.
   *
   * O antigo conferia o SELETOR da regra do infinito e se dava por satisfeito
   * porque ali não havia `mt-e-`. Só que a pergunta certa não é sobre o
   * seletor — é sobre o ELEMENTO, que carrega as duas classes ao mesmo tempo.
   * `animation-iteration-count` é uma lista que o navegador repete para cobrir
   * todos os nomes: com um valor só, o `infinite` das contínuas valia também
   * para a entrada. "Subir" + "Flutuar" subia de novo, e de novo, para sempre.
   *
   * Agora a conferência é feita como o navegador faz: para cada combinação,
   * quantos nomes de animação existem e quantas contagens de iteração.
   */
  const combinadas = [...CSS.matchAll(/(\.mt-e-[a-z]+\.mt-c-[a-z]+)\s*\{([^}]*)\}/g)];
  assert.equal(combinadas.length, A.ENTRADAS.filter((e) => e.classe).length * A.CONTINUAS.filter((c) => c.classe).length,
    'faltam combinações de entrada + contínua no CSS');

  for (const [, seletor, corpo] of combinadas) {
    const nomes = /animation-name:\s*([^;]+);/.exec(corpo);
    assert.ok(nomes, seletor + ' sem animation-name');
    assert.equal(nomes[1].split(',').length, 2, seletor + ' deveria declarar duas animações');

    const contagem = /animation-iteration-count:\s*([^;]+);/.exec(corpo);
    assert.ok(contagem, seletor + ' não fixa a contagem — a entrada herda o `infinite` da contínua e repete para sempre');
    const valores = contagem[1].split(',').map((v) => v.trim());
    assert.deepEqual(valores, ['1', 'infinite'],
      seletor + ': a entrada tem que rodar uma vez e a contínua repetir, nessa ordem');
  }
});

/* ---------------- A leitura ---------------- */

test('elemento sem animação devolve um objeto, não nada', () => {
  // Quem chama não deveria ter que perguntar se existe antes de perguntar o quê.
  const a = A.ler({});
  assert.equal(a.tem, false);
  assert.deepEqual(a.classes, []);
  assert.equal(A.ler(null).tem, false);
  assert.equal(A.ler(undefined).tem, false);
});

test('animação desconhecida cai no seguro, não quebra', () => {
  const a = A.ler({ anim: { entrada: 'saltar-mortal', continua: 'derreter' } });
  assert.equal(a.entrada, '');
  assert.equal(a.continua, '');
  assert.equal(a.tem, false);
});

test('duração e espera ficam dentro dos limites', () => {
  // Uma entrada de 40 segundos deixaria a peça inteira invisível pela metade
  // do tempo em que ela fica no ar.
  assert.equal(A.ler({ anim: { entrada: 'subir', duracao: 40 } }).duracao, A.LIMITES.duracao.max);
  assert.equal(A.ler({ anim: { entrada: 'subir', duracao: -5 } }).duracao, A.LIMITES.duracao.min);
  assert.equal(A.ler({ anim: { entrada: 'subir', atraso: 999 } }).atraso, A.LIMITES.atraso.max);
  assert.equal(A.ler({ anim: { entrada: 'subir', duracao: 'abacaxi' } }).duracao, A.LIMITES.duracao.padrao);
});

test('sem animação, sem estilo — nada de animation: 0s pendurado', () => {
  assert.deepEqual(A.estilo({}), {});
  assert.deepEqual(A.estilo({ anim: {} }), {});
});

test('a contínua espera a entrada terminar', () => {
  /*
   * Sem isso o elemento flutua enquanto ainda está deslizando para dentro, e o
   * olho não entende nenhum dos dois movimentos.
   */
  const e = A.estilo({ anim: { entrada: 'subir', continua: 'flutuar', duracao: 0.8, atraso: 0.5 } });
  const atrasos = e.animationDelay.split(',').map((x) => parseFloat(x));
  assert.equal(atrasos[0], 0.5, 'a entrada deixou de respeitar a espera');
  assert.equal(atrasos[1], 1.3, 'a contínua começou antes de a entrada acabar');
  assert.equal(e.animationDuration.split(',').length, 2, 'faltou o par de durações');
});

test('só entrada: um tempo só', () => {
  const e = A.estilo({ anim: { entrada: 'subir', duracao: 0.9 } });
  assert.equal(e.animationDuration, '0.9s');
  assert.ok(!('animationDelay' in e), 'apareceu uma espera que ninguém pediu');
});

test('escalonar faz cada elemento entrar depois do anterior', () => {
  // É o que faz a peça parecer dirigida em vez de sortida.
  const els = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
  const r = A.escalonar(els);
  assert.equal(r[0].anim.atraso, 0);
  assert.equal(r[1].anim.atraso, 0.12);
  assert.equal(r[2].anim.atraso, 0.24);
});

test('quem não tem entrada GANHA uma ao escalonar', () => {
  /*
   * Sem isto o botão não fazia nada visível numa peça recém-criada: nenhum
   * elemento tinha animação, escalonar ajustava a espera de coisa nenhuma, e
   * o clique parecia quebrado. Quem clica está pedindo que a peça entre como
   * propaganda, não que ela espere parada.
   */
  const r = A.escalonar([{ id: 'a' }, { id: 'b' }]);
  assert.ok(r[0].anim.entrada, 'o elemento continuou sem entrada nenhuma');
  assert.equal(A.ler(r[0]).tem, true, 'a peça escalonada continua sem animar');
});

test('escalonar RESPEITA a entrada que já foi escolhida', () => {
  // Escolher "estourar" num preço e depois escalonar a peça não pode trocar o
  // que a pessoa decidiu.
  const r = A.escalonar([{ id: 'a', anim: { entrada: 'estourar' } }, { id: 'b' }]);
  assert.equal(r[0].anim.entrada, 'estourar');
  assert.equal(r[1].anim.entrada, 'subir');
});

test('escalonar não estraga o resto do elemento', () => {
  const r = A.escalonar([{ id: 'a', text: 'oi', anim: { entrada: 'subir' } }]);
  assert.equal(r[0].text, 'oi');
  assert.equal(r[0].anim.entrada, 'subir', 'escalonar apagou a animação escolhida');
});

test('escalonar não muda a lista original', () => {
  const els = [{ id: 'a' }, { id: 'b', anim: { entrada: 'girar' } }];
  A.escalonar(els);
  assert.equal(els[0].anim, undefined, 'escalonar mexeu no array de quem chamou');
  assert.equal(els[1].anim.atraso, undefined, 'escalonar mexeu no objeto de animação original');
});

/* ---------------- A ligação com o player e o editor ---------------- */

test('a animação vai numa CAPA, nunca na caixa do elemento', () => {
  /*
   * A caixa já carrega a rotação da peça (`transform: rotate(...)`), e uma
   * animação de transform na mesma caixa apagaria essa rotação: o elemento
   * entraria bonito e terminaria torto, diferente do editor.
   */
  assert.match(RENDER, /const capa = div\('mt-anim ' \+ anim\.classes\.join\(' '\)\);/,
    'o player deixou de criar a capa da animação');
  assert.match(RENDER, /box\.appendChild\(capa\);\s*\n\s*alvo = capa;/,
    'a capa deixou de ser o alvo do conteúdo');
  // E o conteúdo entra no `alvo`, não na caixa.
  assert.ok(!/\bbox\.appendChild\((t|s|img)\)/.test(RENDER),
    'algum conteúdo voltou a ser pendurado direto na caixa, fora da animação');
});

test('sem animação, nenhum div a mais', () => {
  // Uma peça com quarenta elementos parados não precisa de quarenta caixas a
  // mais para desenhar exatamente a mesma coisa.
  assert.match(RENDER, /if \(anim\.tem\) \{/, 'a capa passou a ser criada sempre');
});

test('a forma é desenhada no alvo — senão a animação some ou o desenho some', () => {
  // A forma não tem filho: ela É a caixa. Com animação, quem desenha é a capa.
  const i = RENDER.indexOf("e.tipo === 'forma'");
  const bloco = RENDER.slice(i, i + 600);
  assert.match(bloco, /alvo\.style\.background = fillToCss\(e\.fill\);/);
  assert.ok(!/box\.style\.background/.test(bloco), 'a forma voltou a ser pintada na caixa');
});

test('o modo leve e quem pediu menos movimento desligam a animação', () => {
  /*
   * `.mt-perf` liga sozinho quando a TV não dá conta. Numa máquina que já está
   * perdendo quadros, animação é a primeira coisa que sobra — peça parada e
   * legível ganha de peça animada aos tropeços.
   */
  assert.match(CSS, /\.mt-perf \.mt-anim \{ animation: none !important; \}/, 'o modo leve deixou de desligar a animação');
  assert.match(CSS, /@media \(prefers-reduced-motion: reduce\)[\s\S]{0,120}animation: none !important/,
    'quem pediu menos movimento ao sistema voltou a receber movimento');
});

test('o CSS é fonte ÚNICA: player e editor leem o mesmo arquivo', () => {
  // Copiar as keyframes para o painel funcionaria hoje e divergiria na
  // primeira mudança — e a divergência só aparece depois de publicada.
  const PLAYER = fs.readFileSync(path.join(__dirname, '..', 'player.html'), 'utf8');
  const INDEX = fs.readFileSync(path.join(__dirname, '..', 'web', 'src', 'index.css'), 'utf8');
  assert.match(PLAYER, /css\/animacao\.css/, 'o player não carrega o CSS da animação');
  assert.match(INDEX, /@import '\.\.\/\.\.\/css\/animacao\.css';/, 'o painel não importa o CSS da animação');
  const PLAYER_CSS = fs.readFileSync(path.join(__dirname, '..', 'css', 'player.css'), 'utf8');
  assert.ok(!/@keyframes mt-e-/.test(PLAYER_CSS), 'as keyframes voltaram a existir em dois arquivos');
});

test('o player carrega o catálogo, e o service worker guarda', () => {
  const PLAYER = fs.readFileSync(path.join(__dirname, '..', 'player.html'), 'utf8');
  const SW = fs.readFileSync(path.join(__dirname, '..', 'sw.js'), 'utf8');
  assert.match(PLAYER, /js\/animacao\.js/, 'o player não carrega o catálogo');
  assert.match(SW, /'\/js\/animacao\.js'/, 'sem rede, a TV ficaria sem o catálogo');
  assert.match(SW, /'\/css\/animacao\.css'/, 'sem rede, a TV ficaria sem as keyframes');
});

test('no editor a animação só roda na PRÉVIA', () => {
  /*
   * Animação rodando o tempo todo enquanto se arrasta um texto é
   * insuportável — e pior: o elemento se move sozinho debaixo do cursor, e
   * posicionar vira loteria.
   */
  assert.match(EDITOR, /className=\{previa \? 'mt-anim ' \+ lerAnim\(e\)\.classes\.join\(' '\) : ''\}/,
    'a animação passou a rodar sempre no palco');
  // A `key` é o que faz a segunda prévia acontecer: sem trocar o nó, o CSS
  // não reinicia uma animação que já terminou.
  assert.match(EDITOR, /key=\{'anim' \+ previa\}/, 'a prévia só funcionaria uma vez');
});

test('GIF entra pelo editor', () => {
  // O armazenamento já aceitava; o botão de imagem do editor, não — e era ele
  // o caminho de quem quer um elemento animado sem mexer em animação nenhuma.
  const n = (EDITOR.match(/accept="image\/png,image\/jpeg,image\/webp,image\/gif"/g) || []).length;
  assert.equal(n, 2, 'o editor voltou a recusar GIF (imagem e/ou fundo)');
});
