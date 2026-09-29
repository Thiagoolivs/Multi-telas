/*
 * TV em pé num aparelho que só sabe deitado.
 *
 * TV Box (Android TV) não gira a imagem, e totem é comum em loja: o conteúdo
 * aparecia de lado. O player passa a se carregar dentro de uma moldura
 * (iframe) com as medidas da tela em pé, e só a moldura gira — porque o
 * player mede tudo em vw/vh, e girar o palco com CSS deixaria essas medidas
 * com os valores da tela deitada.
 *
 * O bloco é extraído do player.js de verdade e rodado com uma janela de
 * mentira; conferido também no Chromium (1280×720 → moldura de 720×1280).
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const RAIZ = path.join(__dirname, '..');
const FONTE = fs.readFileSync(path.join(RAIZ, 'js', 'player.js'), 'utf8');
const CSS = fs.readFileSync(path.join(RAIZ, 'css', 'player.css'), 'utf8');

function janela({ naMoldura = false, guardado = null } = {}) {
  const armazenado = new Map(guardado == null ? [] : [['mt.girar', String(guardado)]]);
  const recargas = [];
  const filhos = [];
  const classes = new Set();
  const topo = { location: { reload: () => recargas.push('topo') } };
  const global = {
    location: {
      href: 'https://telas.exemplo/player.html?cloud=1' + (naMoldura ? '&moldura=1' : ''),
      search: '?cloud=1' + (naMoldura ? '&moldura=1' : ''),
      reload: () => recargas.push('propria'),
    },
  };
  global.top = naMoldura ? topo : global;
  const ctx = {
    global,
    URL,
    localStorage: {
      getItem: (k) => (armazenado.has(k) ? armazenado.get(k) : null),
      setItem: (k, v) => armazenado.set(k, String(v)),
    },
    document: {
      body: { appendChild: (el) => filhos.push(el) },
      documentElement: { classList: { add: (c) => classes.add(c) } },
      createElement: () => ({ setAttribute(k, v) { this[k] = v; } }),
      addEventListener() {},
    },
  };
  const i = FONTE.indexOf('const CHAVE_GIRO');
  const fim = FONTE.indexOf('if (!montarMolduraSeGirada())', i);
  assert.ok(i > 0 && fim > i, 'o bloco da TV em pé sumiu do player');
  vm.createContext(ctx);
  vm.runInContext(FONTE.slice(i, fim)
    + '\nthis.montar = montarMolduraSeGirada; this.conferir = conferirGiro;', ctx);
  return { ctx, armazenado, recargas, filhos, classes };
}

test('giro guardado: a página de fora vira moldura e NÃO sobe o player', () => {
  const j = janela({ guardado: 270 });
  assert.strictEqual(j.ctx.montar(), true);
  assert.strictEqual(j.filhos.length, 1);
  assert.match(j.filhos[0].src, /moldura=1/);
  assert.match(j.filhos[0].className, /mt-moldura-270/);
  assert.ok(j.classes.has('mt-com-moldura'));
});

test('dentro da moldura não se monta outra moldura (seria recursão infinita)', () => {
  const j = janela({ naMoldura: true, guardado: 90 });
  assert.strictEqual(j.ctx.montar(), false);
  assert.strictEqual(j.filhos.length, 0);
});

test('sem giro: o player sobe direto, como sempre', () => {
  const j = janela({ guardado: null });
  assert.strictEqual(j.ctx.montar(), false);
});

test('config pede giro numa TV deitada: guarda e recarrega a própria página', () => {
  const j = janela();
  j.ctx.conferir(90);
  assert.strictEqual(j.armazenado.get('mt.girar'), '90');
  assert.deepStrictEqual(j.recargas, ['propria']);
});

test('giro já no ar: nada acontece (senão recarregaria a cada config)', () => {
  const j = janela({ naMoldura: true, guardado: 90 });
  j.ctx.conferir(90);
  j.ctx.conferir('90');
  assert.deepStrictEqual(j.recargas, []);
});

test('tirar o giro: guarda 0 e recarrega a página DE FORA, que desmonta a moldura', () => {
  const j = janela({ naMoldura: true, guardado: 90 });
  j.ctx.conferir(0);
  assert.strictEqual(j.armazenado.get('mt.girar'), '0');
  assert.deepStrictEqual(j.recargas, ['topo']);
});

test('valor estranho na config vale como "não girar"', () => {
  const j = janela();
  for (const v of [undefined, null, 45, 180, 'abc', -90]) j.ctx.conferir(v);
  assert.deepStrictEqual(j.recargas, []);
});

test('a moldura tem as medidas da tela em pé, e o giro não remonta zona', () => {
  assert.match(CSS, /\.mt-moldura \{[^}]*width: 100vh; height: 100vw;/);
  assert.match(FONTE, /girar: 1,\s+\/\/ conferirGiro/);
  assert.match(FONTE, /currentConfig = cfg;\s+conferirGiro\(/);
});

test('a política de segurança deixa a TV emoldurar a si mesma', () => {
  const src = fs.readFileSync(path.join(RAIZ, 'server', 'security.js'), 'utf8');
  assert.match(src, /"frame-src 'self' https:"/);
});
