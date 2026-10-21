/*
 * Subir foto ou vídeo (docs/EXECUTOR.md, item 4).
 *
 * Conferido com uma TV viva pareada e o painel num celular de 360 px: "Pôr
 * foto ou vídeo na TV" → galeria → "Pôr na TV" = 3 toques, e a foto em pé
 * entra inteira na TV deitada, com a própria foto borrada atrás. No desktop,
 * soltar o arquivo em qualquer página abre o mesmo envio.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const RAIZ = path.join(__dirname, '..');
const ler = (...p) => fs.readFileSync(path.join(RAIZ, ...p), 'utf8');

function reguaDoFundo() {
  const src = ler('js/render.js');
  const m = /const FUNDO_OK = \/(.+)\/;/.exec(src);
  assert.ok(m, 'FUNDO_OK sumiu de js/render.js');
  return new RegExp(m[1]);
}

test('fundo da foto: só imagem embutida ou mídia nossa, nada que escape do url()', () => {
  const ok = reguaDoFundo();
  for (const bom of ['data:image/jpeg;base64,/9j/4AAQSkZJRg==', 'data:image/png;base64,iVBORw0KGgo=', '/media/ten_1/abc-123.jpg']) {
    assert.ok(ok.test(bom), bom);
  }
  for (const ruim of [
    'data:image/jpeg;base64,abc") ; background: url("https://rastreio.example/x',
    'https://outro.site/foto.jpg', 'javascript:alert(1)', 'data:image/svg+xml;base64,PHN2Zz4=',
    '/media/../segredo', "/media/a'b.jpg", '/media/a b.jpg', 'data:text/html;base64,PGgxPg==',
  ]) {
    assert.ok(!ok.test(ruim), ruim);
  }
});

test('o borrão é imagem esticada, não filtro: a TV fraca não engasga', () => {
  const css = ler('css/player.css');
  const bloco = css.slice(css.indexOf('.mt-com-fundo'), css.indexOf('.mt-video iframe'));
  assert.ok(bloco.includes('background-size: cover'));
  assert.doesNotMatch(bloco, /filter|mix-blend-mode|backdrop/, 'filtro no fundo da foto');
  const r = ler('js/render.js');
  assert.match(r, /function renderImage\(item\) \{\s+const el = div\('mt-slide mt-image'\);\s+comFundo\(el, item\);/);
  assert.match(r, /function renderVideo\(item\) \{\s+const el = div\('mt-slide mt-video'\);\s+comFundo\(el, item\);/);
  // Só com `contain`: em `cover` a foto já cobre tudo e o fundo seria peso à toa.
  assert.match(r, /\(item\.fit \|\| 'cover'\) !== 'contain'/);
  // Mexeu no player: a versão do casco da TV sobe junto (sw.js).
  assert.match(ler('sw.js'), /const SHELL_CACHE = 'mt-shell-v(\d+)'/);
  assert.ok(Number(/mt-shell-v(\d+)/.exec(ler('sw.js'))[1]) >= 33);
});

test('o item enviado é contain + fundo, e vai para a zona DEITADA', async () => {
  const S = await import(pathToFileURL(path.join(RAIZ, 'web/src/lib/subir.js')).href);
  assert.deepEqual(S.itemDaMidia({ url: '/media/t/a.jpg', fundo: 'data:image/jpeg;base64,AA==' }),
    { type: 'image', src: '/media/t/a.jpg', fit: 'contain', fundo: 'data:image/jpeg;base64,AA==', duracao: 10 });
  const v = S.itemDaMidia({ url: '/media/t/a.mp4', fundo: '', video: true });
  assert.equal(v.type, 'video'); assert.equal(v.fit, 'contain'); assert.equal(v.muted, true);
  assert.ok(reguaDoFundo().test('data:image/jpeg;base64,AA=='));
  const c = ler('web/src/components/content/SubirConteudo.jsx');
  // Foto em pé na TV deitada entra inteira na principal, não espremida na lateral.
  assert.match(c, /pecas = prontos\.map\(\(x\) => \(\{ formato: '16\/9', item: itemDaMidia/);
  // Cada envio SOMA: a origem é única (data e hora), não troca a foto anterior.
  assert.match(c, /const titulo = 'Enviado ' \+ new Date\(\)/);
});

test('galeria e câmera, progresso, e as telas já marcadas', () => {
  const c = ler('web/src/components/content/SubirConteudo.jsx');
  assert.match(c, /capture="environment"/);
  assert.match(c, /type="file" accept=\{ACEITA\} multiple/);
  assert.match(c, /role="progressbar"/);
  assert.match(c, /setAlvos\(lista\.map\(\(t\) => t\.id\)\)/);
  const s = ler('web/src/lib/subir.js');
  assert.match(s, /x\.upload\.onprogress/, 'sem progresso real do envio');
  // A foto de celular é encolhida antes de subir (4G).
  assert.match(s, /const LADO_MAXIMO = 2560;/);
});

test('arrastar e soltar em qualquer página, sem roubar o soltar do editor', () => {
  const c = ler('web/src/components/content/SubirConteudo.jsx');
  assert.match(c, /window\.addEventListener\('drop', soltou\)/);
  assert.match(c, /if \(!temArquivo\(e\) \|\| e\.defaultPrevented \|\| !livre\(\)\) return;/);
  assert.match(c, /const livre = \(\) => !document\.querySelector\('\[role="dialog"\]'\);/);
  // Para isso a janela precisa se anunciar como janela.
  assert.match(ler('web/src/components/ui/Dialog.jsx'), /role="dialog" aria-modal="true"/);
  assert.match(ler('web/src/components/layout/AppShell.jsx'), /<SubirConteudo \/>/);
  assert.match(ler('web/src/pages/DashboardPage.jsx'), /onClick=\{\(\) => abrirSubir\(\)\}/);
});
