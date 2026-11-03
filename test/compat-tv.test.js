/*
 * A TV em aparelho antigo (QA de lançamento, 03/11, usuário 19).
 *
 *   1. O pacote do player compila como ES2017 — sem lookbehind, \p{}, espalhar
 *      objeto, ?. ou ?? — e o compat.js e o perf.js, que rodam antes dele,
 *      como ES5. Antes, um único lookbehind derrubava o pacote inteiro numa
 *      Samsung de 2018, e a TV ficava em "Iniciando exibição" para sempre.
 *   2. O caminho sem container query (Chromium < 105) reescreve a peça em
 *      pixel: nada de cq*, @container ou container-type sobra, e as
 *      condições dão o mesmo desenho que o navegador novo escolheria.
 *   3. Abaixo do mínimo, o aviso claro na marca (js/compat.js).
 *   4. A tela de pareamento na marca (Outfit, tinta, logo).
 *
 * O desenho foi conferido no Chromium atual forçando o caminho de reserva
 * (window.MT_SEM_CQ = true) e filtrando o CSS como o navegador antigo faria:
 * docs/APARELHOS.md.
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const RAIZ = path.join(__dirname, '..');
const ler = (...p) => fs.readFileSync(path.join(RAIZ, ...p), 'utf8');
const P = require('../js/peca-html.js');
const R = require('../js/peca-render.js');
const pacoteTv = require('../server/pacote-tv.js');

/*
 * O acorn aceita "compile como ES2017" — o próprio Node não serve, ele
 * entende tudo. Não é dependência do projeto: vem com as ferramentas do
 * ambiente (eslint via npx, que o lint:nomes já usa). Sem ele, a varredura
 * por expressão abaixo continua valendo.
 */
function acharAcorn() {
  const os = require('node:os');
  const candidatos = [
    path.join(RAIZ, 'node_modules', 'acorn'),
    path.join(RAIZ, 'web', 'node_modules', 'acorn'),
    '/opt/node-tools/node_modules/acorn',
  ];
  const npx = path.join(os.homedir(), '.npm', '_npx');
  try { for (const d of fs.readdirSync(npx)) candidatos.push(path.join(npx, d, 'node_modules', 'acorn')); } catch (e) { /* sem cache do npx */ }
  for (const c of candidatos) { try { return require(c); } catch (e) { /* próximo */ } }
  return null;
}
const acorn = acharAcorn();

test('o pacote da TV compila como ES2017 (Chromium 56); o compat.js e o perf.js, como ES5', { skip: !acorn && 'acorn não encontrado neste ambiente' }, () => {
  const p = pacoteTv.pacote(RAIZ);
  assert.ok(p, 'o pacote não montou');
  for (const s of p.lista) {
    try { acorn.parse(ler(s), { ecmaVersion: 2017, sourceType: 'script' }); }
    catch (e) { assert.fail(s + ' não compila como ES2017 (' + e.message + '): numa TV antiga isso derruba o pacote inteiro'); }
  }
  assert.doesNotThrow(() => acorn.parse(p.js, { ecmaVersion: 2017 }), 'o pacote montado não compila como ES2017');
  for (const s of ['js/compat.js', 'js/perf.js']) {
    try { acorn.parse(ler(s), { ecmaVersion: 5, sourceType: 'script' }); }
    catch (e) { assert.fail(s + ' precisa ser ES5 (roda antes de tudo, em qualquer navegador): ' + e.message); }
  }
});

test('varredura sem acorn: nenhum recurso de sintaxe novo demais nos scripts do player', () => {
  const p = pacoteTv.pacote(RAIZ);
  for (const s of p.lista.filter((x) => !x.includes('/vendor/'))) {
    // Sem comentários nem textos entre aspas simples (onde a explicação cita o recurso antigo).
    const src = ler(s).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/'(?:[^'\\\n]|\\.)*'/g, "''");
    assert.doesNotMatch(src, /\(\?<[!=]/, s + ': lookbehind em expressão regular (Chromium 62)');
    assert.doesNotMatch(src, /\/[^/\n]*\\p\{[^/\n]*\/[gimsy]*u/, s + ': \\p{} em expressão regular (Chromium 64)');
    assert.doesNotMatch(src, /[{,]\s*\.\.\.[\w(]/, s + ': espalhar objeto {...x} (Chromium 60)');
    assert.doesNotMatch(src, /\w\?\.[\w([]/, s + ': ?. (Chromium 80)');
    assert.doesNotMatch(src, /[\w)\]]\s*\?\?\s*[\w('"[]/, s + ': ?? (Chromium 80)');
  }
});

test('a conta sem lookbehind acha exatamente o que o lookbehind achava', () => {
  const { semPrefixo, NUMERO, NOME_SOLTO } = P._semLookbehind;
  // O de antes, montado em tempo de execução (o Node entende; a TV antiga não precisa mais).
  const NUM_ANTES = new RegExp('(?<![A-Za-z0-9_-])(-?(?:\\d+\\.?\\d*|\\.\\d+))([A-Za-z%]*)', 'g');
  const NOME_ANTES = new RegExp('(?<![A-Za-z0-9_-])[A-Za-z][A-Za-z-]*(?![A-Za-z0-9_(-])', 'g');
  const valores = ['0 0 3cqw rgba(0,0,0,.3)', 'translate3d(0,-2cqh,0)', 'var(--fundo-2) 12px', 'a-1.5', '1px2', 'clamp(2cqw, 4.5cqw, 9cqh)',
    '-.5cqmin', 'calc(100% - 2cqw)', 'white solid 1px', 'translate(-50%,-50%) rotate(-3deg)', 'abc(', 'x1e3', '1e3', '50%-3px', ''];
  for (const arq of fs.readdirSync(path.join(RAIZ, 'pecas-ouro')).filter((f) => f.endsWith('.html'))) {
    const css = P.doArquivo(ler('pecas-ouro', arq)).css;
    for (const m of css.matchAll(/:\s*([^;{}]+)/g)) valores.push(m[1]);
  }
  assert.ok(valores.length > 500, 'poucos valores para comparar: ' + valores.length);
  for (const v of valores) {
    assert.deepEqual(semPrefixo(NUMERO, v).map((m) => [m.index, m[0]]), [...v.matchAll(NUM_ANTES)].map((m) => [m.index, m[0]]), 'número: ' + v);
    assert.deepEqual(semPrefixo(NOME_SOLTO, v).map((m) => [m.index, m[0]]), [...v.matchAll(NOME_ANTES)].map((m) => [m.index, m[0]]), 'nome: ' + v);
  }
});

test('a porta continua recusando e avisando o mesmo (cor por nome, sombra grande, texto fora de campo)', () => {
  const r1 = P.higienizar({ html: '<section class="mt-peca"><h1 data-campo="t">x</h1></section>', css: '.mt-peca h1{color:red}' });
  assert.ok(r1.problemas.some((p) => /cor por nome \(red\)/.test(p)), JSON.stringify(r1.problemas));
  const r2 = P.higienizar({ html: '<section class="mt-peca"><h1 data-campo="t">x</h1></section>', css: '.mt-peca h1{box-shadow:0 0 9cqw var(--mt-fundo)}' });
  assert.ok(r2.problemas.some((p) => /sombra grande/.test(p)), JSON.stringify(r2.problemas));
  const r3 = P.higienizar({ html: '<section class="mt-peca"><p>Olá, clínica</p></section>', css: '' });
  assert.ok(r3.avisos.some((a) => /texto fixo fora de campo/.test(a)), JSON.stringify(r3.avisos));
  const r4 = P.higienizar({ html: '<section class="mt-peca"><p> — · — </p></section>', css: '' });
  assert.ok(!r4.avisos.some((a) => /texto fixo/.test(a)), 'pontuação sozinha não é texto');
});

test('a programação da data comemorativa sai igual sem espalhar objeto', () => {
  const S = require('../js/seasons.js');
  const season = S.SEASONS.find((s) => s.greeting && s.greeting.bg && S.FRASES[s.id]);
  assert.ok(season, 'nenhuma data com fundo e frases para conferir');
  const prog = S.programaDe(season, { zonas: ['principal', 'lateral'] });
  // A saudação é uma CÓPIA (era { ...greeting }): mexer no programa não muda a data.
  assert.deepEqual(prog.principal[0], season.greeting);
  assert.notStrictEqual(prog.principal[0], season.greeting);
  // As frases: mesmas chaves, na mesma ordem de antes, com o fundo da data.
  const frase = prog.principal[1];
  assert.deepEqual(Object.keys(frase), ['type', 'texto', 'autor', 'duracao', 'bg', 'cor']);
  assert.equal(frase.bg, season.greeting.bg);
  assert.deepEqual(Object.keys(prog.lateral[2]), ['type', 'texto', 'autor', 'duracao', 'bg', 'cor']);
  // Sem fundo, sem a chave bg (era `...(bg ? { bg } : {})`).
  const semFundo = S.programaDe(Object.assign({}, season, { greeting: Object.assign({}, season.greeting, { bg: null }) }), {});
  assert.deepEqual(Object.keys(semFundo.principal[1]), ['type', 'texto', 'autor', 'duracao', 'cor']);
});

/* ---------------- Sem container query ---------------- */

test('sem container query: toda peça-ouro vira pixel, sem cq, @container nem container-type, em qualquer zona', () => {
  const zonas = [[1920, 1080], [1080, 1080], [1080, 1920], [515, 851], [400, 1000], [1920, 160], [1920, 120]];
  const arquivos = fs.readdirSync(path.join(RAIZ, 'pecas-ouro')).filter((f) => f.endsWith('.html'));
  assert.ok(arquivos.length >= 20);
  for (const arq of arquivos) {
    const { css } = P.doArquivo(ler('pecas-ouro', arq));
    for (const [w, h] of zonas) {
      const s = R.cssSemCq(css, w, h);
      assert.doesNotMatch(s, /\d(cqw|cqh|cqi|cqb|cqmin|cqmax)\b/i, arq + ' ' + w + 'x' + h + ' ainda mede em cq');
      assert.doesNotMatch(s, /@container/, arq + ' ' + w + 'x' + h + ' ainda tem @container');
      assert.doesNotMatch(s, /container-type/, arq);
      assert.doesNotMatch(s, /(^|[;{\s])inset\s*:/, arq + ': inset não vira top/right/bottom/left');
      // Chaves balanceadas: reescrever não pode quebrar o CSS.
      assert.equal((s.match(/\{/g) || []).length, (s.match(/\}/g) || []).length, arq + ' ' + w + 'x' + h + ': chaves desbalanceadas');
    }
  }
  const base = R.cssSemCq(R.BASE_SEM_CQ, 1920, 1080);
  assert.doesNotMatch(base, /:where\(|@container|container-type|inset:/);
  assert.match(base, /\.mt-faixas\{position:absolute;top:0;right:0;bottom:0;left:0;/);
});

test('sem container query: a condição dá o desenho que o navegador novo escolheria', () => {
  const c = R.condicaoCq;
  assert.equal(c('(aspect-ratio >= 0.8) and (aspect-ratio < 1.25)', 1080, 1080), true);
  assert.equal(c('(aspect-ratio >= 0.8) and (aspect-ratio < 1.25)', 1920, 1080), false);
  assert.equal(c('(aspect-ratio < 0.8) and (min-width: 701px)', 1080, 1920), true);
  assert.equal(c('(aspect-ratio < 0.8) and (min-width: 701px)', 515, 851), false);
  assert.equal(c('(max-width: 700px)', 700, 900), true);
  assert.equal(c('(max-width: 700px)', 701, 900), false);
  assert.equal(c('(orientation: portrait)', 1080, 1920), true);
  assert.equal(c('(orientation: portrait)', 1920, 1080), false);
  assert.equal(c('(min-aspect-ratio:51/50) and (max-aspect-ratio:22/15)', 1200, 1000), true);
  assert.equal(c('(min-aspect-ratio:39/20) and (max-aspect-ratio:4/1)', 1920, 1080), false);
  assert.equal(c('(0.58 <= aspect-ratio < 0.8)', 600, 900), true);
  assert.equal(c('not (width > 500px)', 400, 10), true);
  assert.equal(c('(width > 1px) or (height > 9000px)', 5, 5), true);
  assert.equal(c('lateral (max-height: 140px)', 300, 120), true);
  // O que não se entende vale como falso, como no navegador novo.
  assert.equal(c('(cor: azul)', 10, 10), false);
  assert.equal(c('(width > 1px) xyz', 10, 10), false);
});

test('sem container query: medidas e contas em pixel', () => {
  const s = R.cssSemCq('.a{font-size:clamp(12px, 4cqw, 60px);padding:2cqh 3cqw;inset:0!important;container-type:size}'
    + '@container (aspect-ratio<1){.b{width:50cqw}}@container (aspect-ratio>=1){.c{width:calc(10cqw + 4px);margin:min(2cqmin, 5%)}}'
    + '.d{gap:max(1cqw,2px)}.e{width:calc(100% - 2cqw)}.f{grid-template-columns:minmax(0,1fr) 30cqw}.g{border-radius:var(--mt-raio)}', 1920, 1080);
  assert.match(s, /\.a\{font-size:60px;padding:21\.6px 57\.6px;top:0!important;right:0!important;bottom:0!important;left:0!important;\}/);
  assert.doesNotMatch(s, /\.b\{/, 'a regra de zona em pé entrou na zona deitada');
  assert.match(s, /\.c\{width:196px;margin:min\(21\.6px, 5%\)\}/);
  assert.match(s, /\.d\{gap:19\.2px\}/);
  assert.match(s, /\.e\{width:calc\(100% - 38\.4px\)\}/);
  assert.match(s, /minmax\(0,1fr\) 576px/);
  assert.match(s, /var\(--mt-raio\)/);
  // Os raios da marca (tokens em cqmin) também viram pixel.
  const tokens = R.cssDosTokens(require('../js/tokens.js').daMarca(null));
  assert.match(tokens, /cqmin/, 'os tokens não usam mais cqmin: o teste perdeu o sentido');
  assert.doesNotMatch(R.cssSemCq(tokens, 1920, 1080), /cqmin/);
});

test('sem container query: quem decide é CSS.supports, e MT_SEM_CQ força o caminho de reserva', () => {
  // Cada chamada com janela própria: o resultado fica guardado só para a janela de verdade.
  const comCq = { CSS: { supports: (p, v) => p === 'container-type' && v === 'inline-size' } };
  assert.equal(R.temContainerQueries({ MT_SEM_CQ: true, CSS: comCq.CSS }), false);
  assert.equal(R.temContainerQueries(null), true, 'no Node (sem janela) o caminho normal');
  // O caminho normal não paga nada: montar() só reescreve quando falta suporte.
  const fonte = ler('js', 'peca-render.js');
  assert.match(fonte, /const semCq = !temContainerQueries\(\);/);
  assert.match(fonte, /if \(!semCq\) return cssCompleto\(it\.css, tokens\);/);
});

test('a peça do player não depende de `inset` no host (Chromium < 87)', () => {
  assert.doesNotMatch(ler('js', 'render.js'), /cssText = [^;\n]*inset:0/);
});

/* ---------------- O aviso de navegador antigo ---------------- */

function janelaDeMentira(opcoes) {
  const o = opcoes || {};
  const ouvintes = {};
  const doc = {
    ouvintes: {},
    body: { filhos: [], appendChild(el) { this.filhos.push(el); } },
    documentElement: { attachShadow: o.semShadow ? undefined : function () {} },
    addEventListener(t, f) { (this.ouvintes[t] = this.ouvintes[t] || []).push(f); },
    getElementById(id) { return id === 'overlay' ? this.splash : null; },
    splash: { style: {} },
    createTextNode: (t) => ({ texto: t }),
    createElement() {
      const filhos = {};
      return {
        attrs: {}, setAttribute(k, v) { this.attrs[k] = v; }, innerHTML: '',
        querySelector(sel) { return (filhos[sel] = filhos[sel] || { textos: [], appendChild(n) { this.textos.push(n.texto); } }); },
        filhos,
      };
    },
  };
  const w = {
    document: doc, navigator: { userAgent: o.ua || '' }, location: { protocol: 'https:', host: 'tv.exemplo' },
    Promise, Map, Set, Symbol, SyntaxError, fetch: o.semFetch ? undefined : () => {},
    CSS: { supports: () => true },
    addEventListener(t, f) { (ouvintes[t] = ouvintes[t] || []).push(f); },
    disparar(t, ev) { (ouvintes[t] || []).forEach((f) => f(ev || {})); },
  };
  w.window = w;
  return w;
}
function rodarCompat(w) {
  const ctx = vm.createContext(w);
  vm.runInContext(ler('js', 'compat.js'), ctx, { filename: 'compat.js' });
  return ctx;
}
const avisoDe = (w) => w.document.body.filhos.find((el) => el.id === 'mt-antigo');

test('pacote que não compila: a TV diz que o navegador é antigo, e não fica em "Iniciando exibição"', () => {
  const w = janelaDeMentira({ ua: 'Mozilla/5.0 (Web0S; Linux/SmartTV) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/53.0.2785.34 Safari/537.36' });
  rodarCompat(w);
  w.disparar('error', { filename: 'https://tv.exemplo/js/tv.pacote.js', message: 'Uncaught SyntaxError: Unexpected token function', error: new SyntaxError('x') });
  w.disparar('load');
  const el = avisoDe(w);
  assert.ok(el, 'sem aviso');
  assert.equal(el.attrs['data-motivo'], 'sintaxe');
  assert.deepEqual(el.filhos['.mt-antigo-titulo'].textos, ['Este navegador é antigo para o MultiTelas.']);
  assert.deepEqual(el.filhos['.mt-antigo-dica'].textos, ['Use o app MultiTelas TV ou um TV box Android.']);
  assert.match(el.filhos['.mt-antigo-detalhe'].textos[0], /Chrome 56 ou mais novo · este aparelho tem Chrome 53/);
  assert.match(el.innerHTML, /mt-marca/);
  assert.equal(w.document.splash.style.display, 'none', 'o splash "Iniciando exibição" continuou');
});

test('no app MultiTelas TV o aviso fala do WebView, não de instalar o app', () => {
  const w = janelaDeMentira({ ua: 'Mozilla/5.0 (Linux; Android 7.1.2; wv) Chrome/53.0.2785.146 Mobile Safari/537.36 MultiTelasTV/1.0.60' });
  rodarCompat(w);
  w.disparar('error', { filename: 'https://tv.exemplo/js/tv.pacote.js', message: 'SyntaxError', error: new SyntaxError('x') });
  w.disparar('load');
  const el = avisoDe(w);
  assert.match(el.filhos['.mt-antigo-titulo'].textos[0], /WebView/);
  assert.match(el.filhos['.mt-antigo-dica'].textos[0], /Android System WebView/);
});

test('sem aviso falso: player que subiu, erro que não é de sintaxe, erro de outro site, ou só falta de rede', () => {
  const casos = [
    (w) => { w.disparar('error', { filename: 'https://tv.exemplo/js/tv.pacote.js', message: 'SyntaxError', error: new SyntaxError('x') }); w.MTCloud = {}; },
    (w) => { w.disparar('error', { filename: 'https://tv.exemplo/js/tv.pacote.js', message: 'TypeError: x', error: new TypeError('x') }); },
    (w) => { w.disparar('error', { filename: 'https://outro.site/js/a.js', message: 'SyntaxError', error: new SyntaxError('x') }); },
    // Sem rede na primeira vez: o pacote nem chega (erro de carga não é erro de sintaxe).
    () => {},
  ];
  for (const [i, antes] of casos.entries()) {
    const w = janelaDeMentira({ ua: 'Chrome/120' });
    rodarCompat(w);
    antes(w);
    w.disparar('load');
    assert.equal(avisoDe(w), undefined, 'caso ' + i + ' mostrou o aviso sem motivo');
  }
});

test('falta o básico (sem fetch, sem Shadow DOM): o aviso sai já no DOMContentLoaded', () => {
  for (const op of [{ semFetch: true }, { semShadow: true }]) {
    const w = janelaDeMentira(op);
    rodarCompat(w);
    (w.document.ouvintes.DOMContentLoaded || []).forEach((f) => f());
    assert.equal(avisoDe(w) && avisoDe(w).attrs['data-motivo'], 'basico', JSON.stringify(op));
  }
});

test('o compat.js completa padStart e padEnd onde faltam', () => {
  const w = janelaDeMentira({});
  const ctx = vm.createContext(w);
  vm.runInContext('delete String.prototype.padStart; delete String.prototype.padEnd;', ctx);
  vm.runInContext(ler('js', 'compat.js'), ctx);
  assert.equal(vm.runInContext("'7'.padStart(2, '0') + '|' + 'ab'.padEnd(5, 'xy') + '|' + 'abc'.padStart(2)", ctx), '07|abxyx|abc');
});

test('o aviso e o compat.js estão no <head>, fora do pacote, e no casco do service worker', () => {
  const html = ler('player.html');
  const cabeca = html.slice(0, html.indexOf('<body'));
  assert.ok(cabeca.indexOf('js/compat.js') >= 0 && cabeca.indexOf('js/compat.js') < cabeca.indexOf('js/perf.js'), 'compat.js antes do perf.js, no <head>');
  assert.ok(!pacoteTv.scriptsDoCorpo(html).includes('js/compat.js'), 'compat.js não pode ir no pacote: cairia junto com ele');
  const sw = ler('sw.js');
  assert.ok(sw.includes("'/js/compat.js'"));
  for (const w of [400, 600, 700]) assert.ok(sw.includes("'/fonts/marca/outfit-" + w + "-normal-latin.woff2'"), 'Outfit ' + w + ' fora do casco');
  assert.ok(Number(/mt-shell-v(\d+)/.exec(sw)[1]) >= 71, 'o player mudou: suba o SHELL_CACHE');
});

/* ---------------- CSS ---------------- */

test('toda regra do player.css com `inset` tem a reserva em top/right/bottom/left (Chromium < 87)', () => {
  const css = ler('css', 'player.css').replace(/\/\*[\s\S]*?\*\//g, (m) => ' '.repeat(m.length));
  const ini = css.indexOf('@supports not (inset: 0)');
  assert.ok(ini > 0, 'falta o bloco @supports not (inset: 0)');
  const reserva = css.slice(ini, css.indexOf('\n}', ini));
  const cobertos = new Map();
  for (const m of reserva.matchAll(/([^{}]+)\{\s*top:\s*([^;]+);\s*right:\s*([^;]+);\s*bottom:\s*([^;]+);\s*left:\s*([^;]+);\s*\}/g)) {
    for (const sel of m[1].replace('@supports not (inset: 0) {', '').split(',')) cobertos.set(sel.trim().replace(/\s+/g, ' '), [m[2], m[3], m[4], m[5]].map((x) => x.trim()).join(' '));
  }
  const antes = css.slice(0, ini);
  let n = 0;
  for (const m of antes.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (m[1].trim().startsWith('@')) continue;
    const d = /(^|[;\s])inset:\s*([^;]+)/.exec(m[2]);
    if (!d) continue;
    const p = d[2].trim().split(/\s+/);
    const quatro = [p[0], p[1] || p[0], p[2] || p[0], p[3] || p[1] || p[0]].join(' ');
    for (const sel of m[1].split(',')) {
      const s = sel.trim().replace(/\s+/g, ' ');
      assert.equal(cobertos.get(s), quatro, s + ' usa inset: ' + d[2].trim() + ' e não tem a reserva');
      n++;
    }
  }
  assert.ok(n >= 25, 'poucas regras com inset: ' + n);
});

test('a tela de pareamento está na marca: Outfit, tinta, o logo, sem o azul do tema', () => {
  const html = ler('player.html');
  const caixa = html.slice(html.indexOf('id="pairing"'), html.indexOf('id="pairing-reset"'));
  assert.match(caixa, /class="mt-marca"/);
  assert.match(caixa, /#C6F432/);
  assert.match(caixa, /MultiTelas/);
  const css = ler('css', 'player.css');
  const bloco = css.slice(css.indexOf('.mt-pairing {'), css.indexOf('.mt-pairing-reset:hover'));
  assert.match(bloco, /font-family: 'Outfit'/);
  assert.match(bloco, /#0E0B1F/);
  assert.doesNotMatch(bloco, /var\(--accent\)|var\(--bg|Inter/, 'o pareamento ainda usa o tema da TV');
  assert.match(css, /@font-face \{ font-family: 'Outfit'; font-style: normal; font-weight: 700;[^}]*\/fonts\/marca\/outfit-700-normal-latin\.woff2/);
});

test('notícias sem AbortController nem finally (Chromium < 66)', () => {
  const src = ler('js', 'news.js');
  assert.match(src, /typeof AbortController === 'undefined'/);
  assert.doesNotMatch(src.replace(/\/\*[\s\S]*?\*\//g, ''), /\.finally\(/);
});
