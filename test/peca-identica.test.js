/*
 * Peça idêntica na TV (docs/EXECUTOR.md, item 10).
 *
 * A entrada animada que o dono aprova na bancada tem que ser a que roda no
 * player. Conferido quadro a quadro — animações CSS e GSAP congeladas e
 * posicionadas no mesmo instante desde a entrada da peça (0,05s a 2,5s), lado
 * a lado: o esmaecer + escala do slide do player apagava e azulava o fundo e
 * a marca da peça no primeiro segundo. No modo leve (?perf=1) a peça vem
 * parada desde o primeiro quadro; com a CPU 6× mais lenta, a troca não ganhou
 * tarefa longa.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { spawn } = require('node:child_process');
const P = require('../js/peca-html.js');

const RAIZ = path.join(__dirname, '..');
const ler = (...p) => fs.readFileSync(path.join(RAIZ, ...p), 'utf8');

test('o slide da peça não esmaece nem escala por cima da entrada dela', () => {
  const p = ler('js/player.js');
  const corpo = p.slice(p.indexOf('function enterSlide('), p.indexOf('function leaveSlide('));
  const peca = corpo.indexOf("if (el.classList.contains('mt-peca-html')) {");
  assert.ok(peca > 0, 'a peça voltou a entrar com a transição do slide');
  // Sai ANTES de qualquer estado inicial de transição (opacidade 0, escala, deslize).
  assert.ok(peca < corpo.indexOf('TRANS_FROM[type]'));
  assert.ok(peca < corpo.indexOf("el.classList.add('mt-enter'"));
  assert.match(corpo.slice(peca, peca + 200), /GSAP\.set\(el, \{ opacity: 1, clearProps: 'transform' \}\);\s+return;/);
});

test('a foto da peça é carregada antes da vez dela, só se for nossa', () => {
  const html = '<section class="mt-peca"><img data-campo-img="foto" alt=""><img data-campo-img="selo" alt=""><h1 data-campo="titulo"></h1></section>';
  const item = (campos) => ({ type: 'peca-html', html, campos });
  assert.deepStrictEqual(P.fotosDoItem(item({ foto: '/media/abc.jpg', titulo: '/media/nao-e-foto.jpg' })), ['/media/abc.jpg']);
  assert.deepStrictEqual(P.fotosDoItem(item({ foto: '/pecas-ouro/fotos/sol.jpg' })), ['/pecas-ouro/fotos/sol.jpg']);
  // Foto de terceiro é rastreio, e a TV pode estar offline: nunca é pedida.
  assert.deepStrictEqual(P.fotosDoItem(item({ foto: 'https://fora.example/x.jpg' })), []);
  assert.deepStrictEqual(P.fotosDoItem(item({ foto: '/media/../data/multitelas.db' })), []);
  // O host do armazenamento que o servidor declarou vale.
  assert.deepStrictEqual(P.fotosDoItem(item({ foto: 'https://cdn.loja.com/media/a.webp' }), ['cdn.loja.com']), ['https://cdn.loja.com/media/a.webp']);
  assert.deepStrictEqual(P.fotosDoItem(item({ foto: '/media/a.jpg', selo: '/media/a.jpg' })), ['/media/a.jpg'], 'a mesma foto, uma vez');
  assert.deepStrictEqual(P.fotosDoItem(null), []);
  // E o player usa isto na pré-carga.
  assert.match(ler('js/player.js'), /if \(item\.type === 'peca-html' && global\.MTPecaHtml\) MTPecaHtml\.fotosDoItem\(item, global\.MT_HOSTS_MIDIA \|\| \[\]\)/);
});

test('a pré-carga não pede fontes de antemão (engasgava a TV fraca)', () => {
  /*
   * document.fonts.load dos pesos da marca carregava faces que a peça nem
   * usa e refazia o layout da tela inteira: 50–95ms numa troca, com a CPU 6×
   * mais lenta, contra nenhuma tarefa longa sem ela.
   */
  assert.doesNotMatch(ler('js/player.js'), /document\.fonts\.load\(/);
  // O player mudou: a TV baixa o casco novo.
  assert.ok(Number((ler('sw.js').match(/const SHELL_CACHE = 'mt-shell-v(\d+)';/) || [])[1]) >= 37);
});

/* ---------- o escape do modo leve pelo endereço curto ---------- */

const PORTA = 4010 + Math.floor(Math.random() * 9);
function pedir(caminho) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port: PORTA, path: caminho }, (res) => { res.resume(); resolve({ status: res.statusCode, local: res.headers.location }); });
    req.on('error', reject);
    req.setTimeout(8000, () => req.destroy(new Error('a rota ' + caminho + ' não respondeu')));
    req.end();
  });
}

test('/tv?perf=1 chega ao player (antes o redirecionamento jogava fora)', async (t) => {
  const servidor = spawn(process.execPath, ['server.js'], {
    cwd: RAIZ, env: { ...process.env, PORT: String(PORTA), STORAGE: 'local', SKIP_VERIFY: '1', DATABASE_URL: '' }, stdio: 'ignore',
  });
  t.after(() => servidor.kill());
  let r = null;
  for (let i = 0; i < 60 && !r; i++) {
    try { r = await pedir('/tv?perf=1'); } catch (e) { await new Promise((ok) => setTimeout(ok, 250)); }
  }
  assert.ok(r, 'o servidor de teste não subiu');
  assert.equal(r.status, 302);
  assert.equal(r.local, '/player.html?cloud=1&perf=1');
  assert.equal((await pedir('/tv?new=1&perf=0')).local, '/player.html?cloud=1&new=1&perf=0');
  assert.equal((await pedir('/tv?perf=javascript:alert(1)')).local, '/player.html?cloud=1', 'só 0 ou 1 passam');
  assert.equal((await pedir('/tv')).local, '/player.html?cloud=1');
});
