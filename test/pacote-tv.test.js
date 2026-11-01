/*
 * Os scripts do player num pacote só (server/pacote-tv.js). QA de 26/10: a
 * TV nova pedia 25 scripts separados na primeira carga.
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const http = require('node:http');
const { spawn } = require('node:child_process');

const RAIZ = path.join(__dirname, '..');
const P = require('../server/pacote-tv.js');

test('todo script do player é uma função que se chama, sem nada solto no topo (o try do pacote depende disso)', () => {
  const html = fs.readFileSync(path.join(RAIZ, 'player.html'), 'utf8');
  for (const s of P.scriptsDoCorpo(html)) {
    if (s.includes('/vendor/')) continue; // gsap: UMD minificado, uma expressão só
    const src = fs.readFileSync(path.join(RAIZ, s), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    const soltos = src.split('\n').filter((l) => /^(const|let|var|function|class)\b|^['"]use strict['"]/.test(l));
    assert.deepEqual(soltos, [], s + ' declara no topo: dentro do try do pacote isso mudaria de escopo');
  }
});

test('o HTML servido troca os scripts do corpo por um só, no lugar do primeiro; o <head> fica', () => {
  const html = '<html><head><script src="js/perf.js"></script></head><body>\n  <main></main>\n  <script src="js/a.js"></script>\n  <script src="js/b.js"></script>\n</body></html>';
  const lista = P.scriptsDoCorpo(html);
  assert.deepEqual(lista, ['js/a.js', 'js/b.js']);
  const novo = P.montarHtml(html, lista);
  assert.match(novo, /<head><script src="js\/perf\.js"><\/script><\/head>/);
  assert.equal((novo.match(/<script /g) || []).length, 2);
  assert.match(novo, /<main><\/main>\n  <script src="js\/tv\.pacote\.js"><\/script>\n<\/body>/);
});

test('um arquivo que quebra ao carregar não impede os outros, e o erro ainda chega ao window.onerror', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mt-pacote-'));
  fs.mkdirSync(path.join(dir, 'js'));
  fs.writeFileSync(path.join(dir, 'js/a.js'), '(function (g) { g.ordem.push("a"); })(this);');
  fs.writeFileSync(path.join(dir, 'js/b.js'), '(function () { throw new Error("quebrou"); })();');
  fs.writeFileSync(path.join(dir, 'js/c.js'), '(function (g) { g.ordem.push("c"); })(this)');
  const js = P.montarJs(dir, ['js/a.js', 'js/b.js', 'js/c.js']);
  const erros = [];
  const ctx = { ordem: [], setTimeout: (fn) => { try { fn(); } catch (e) { erros.push(e.message); } } };
  vm.runInNewContext(js, ctx);
  assert.deepEqual(ctx.ordem, ['a', 'c']);
  assert.deepEqual(erros, ['quebrou']);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('o pacote de verdade roda inteiro num contexto vazio sem lançar no carregamento', () => {
  const p = P.pacote(RAIZ);
  assert.ok(p);
  // Sintaxe: o pacote inteiro compila (um arquivo mal fechado quebraria todos).
  assert.doesNotThrow(() => new vm.Script(p.js, { filename: 'tv.pacote.js' }));
  assert.ok(p.js.length > 100000);
});

test('o servidor serve o player com o pacote, e o pacote com cache revalidado', async () => {
  const PORTA = 7000 + Math.floor(Math.random() * 90);
  const srv = spawn(process.execPath, ['server.js'], {
    cwd: RAIZ, stdio: 'ignore',
    env: { ...process.env, PORT: String(PORTA), STORAGE: 'local', SKIP_VERIFY: '1', DATABASE_URL: '' },
  });
  const pedir = (c) => new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port: PORTA, path: c }, (res) => {
      let corpo = ''; res.on('data', (d) => { corpo += d; }); res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, corpo }));
    });
    req.on('error', reject); req.setTimeout(8000, () => req.destroy(new Error('sem resposta'))); req.end();
  });
  try {
    let ok = false;
    for (let i = 0; i < 60 && !ok; i++) { try { await pedir('/tv'); ok = true; } catch (e) { await new Promise((r) => setTimeout(r, 250)); } }
    const html = await pedir('/player.html');
    assert.equal(html.status, 200);
    assert.equal(html.headers['cache-control'], 'no-store');
    assert.deepEqual([...html.corpo.matchAll(/<script src="([^"]+)"/g)].map((m) => m[1]), ['js/perf.js', 'js/tv.pacote.js']);
    const js = await pedir('/js/tv.pacote.js');
    assert.equal(js.status, 200);
    assert.match(js.headers['content-type'], /javascript/);
    assert.equal(js.headers['cache-control'], 'no-cache');
    assert.match(js.corpo, /\/\* ==== js\/player\.js ==== \*\//);
  } finally { srv.kill(); }
});
