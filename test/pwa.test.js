/*
 * O painel como app no celular (docs/EXECUTOR.md, item 5).
 *
 * Conferido no Chrome (Page.getInstallabilityErrors devolveu lista vazia: o
 * painel é instalável) e de ponta a ponta: um POST de compartilhar com uma
 * foto em /app/compartilhar abre o "Subir" com a foto já enviada. O worker
 * do compartilhar tem teste próprio em test/sw.test.js.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const RAIZ = path.join(__dirname, '..');
const ler = (...p) => fs.readFileSync(path.join(RAIZ, ...p), 'utf8');

test('manifesto: instalável, com ícones de verdade, em /app/', () => {
  const m = JSON.parse(ler('web/public/manifest.webmanifest'));
  assert.ok(m.name && m.short_name);
  assert.equal(m.display, 'standalone');
  assert.equal(m.start_url, '/app/');
  assert.equal(m.scope, '/app/');
  for (const [tam, uso] of [['192x192', 'any'], ['512x512', 'any'], ['192x192', 'maskable'], ['512x512', 'maskable']]) {
    const i = m.icons.find((x) => x.sizes === tam && x.purpose === uso);
    assert.ok(i, 'falta ícone ' + tam + ' ' + uso);
    assert.ok(fs.existsSync(path.join(RAIZ, i.src)), 'ícone não existe: ' + i.src);
  }
  assert.ok(m.theme_color && m.background_color);
});

test('compartilhar da galeria: foto e vídeo vão para /app/compartilhar', () => {
  const m = JSON.parse(ler('web/public/manifest.webmanifest'));
  const s = m.share_target;
  assert.ok(s, 'sem share_target');
  assert.equal(s.action, '/app/compartilhar');
  assert.equal(s.method, 'POST');
  assert.equal(s.enctype, 'multipart/form-data');
  const f = s.params.files[0];
  assert.equal(f.name, 'midia', 'o nome do campo tem que ser o que o worker lê');
  assert.deepEqual(f.accept, ['image/*', 'video/*']);
  assert.match(ler('web/public/sw.js'), /form\.getAll\('midia'\)/);
  // Atalhos do ícone: os dois caminhos curtos até a TV.
  const urls = m.shortcuts.map((x) => x.url);
  assert.ok(urls.includes('/app/?ir=criar'));
  assert.ok(urls.includes('/app/?subir=1'));
});

test('sem o worker ativo, o servidor devolve ao painel com o aviso (e não página em branco)', () => {
  const s = ler('server.js');
  assert.match(s, /if \(req\.method === 'POST' && rest === '\/compartilhar'\) \{\s+req\.resume\(\);\s+res\.writeHead\(303, \{ Location: '\/app\/\?compartilhado=0'/);
});

test('o painel lê o compartilhado e limpa o endereço', () => {
  const c = ler('web/src/components/content/SubirConteudo.jsx');
  assert.match(c, /const compartilhado = q\.get\('compartilhado'\);/);
  assert.match(c, /u\.searchParams\.delete\('compartilhado'\); u\.searchParams\.delete\('subir'\);/);
  assert.match(c, /lerCompartilhados\(\)\.then/);
  const s = ler('web/src/lib/subir.js');
  // Lido uma vez: o mesmo compartilhar não pode reaparecer na próxima visita.
  assert.match(s, /await cache\.delete\(req\);/);
  assert.match(s, /export const CACHE_COMPARTILHADO = 'mt-compartilhado';/);
  // Fora do prefixo que a atualização do app limpa.
  assert.match(ler('web/public/sw.js'), /const COMPARTILHADO = 'mt-compartilhado';/);
});

test('convite de instalar: no celular, uma vez só; dica no iPhone', () => {
  const c = ler('web/src/components/layout/ConviteInstalar.jsx');
  assert.match(c, /const VISTO = 'mt\.convite\.instalar';/);
  assert.match(c, /if \(fechado \|\| instalado\(\) \|\| !celular \|\| !\(podeInstalar\(\) \|\| ios\)\) return null;/);
  assert.match(c, /function fechar\(\) \{ marcarVisto\(\); setFechado\(true\); \}/);
  assert.match(c, /Adicionar à Tela de Início/);
  assert.match(ler('web/src/components/layout/AppShell.jsx'), /<ConviteInstalar \/>/);
});

test('o worker do painel nunca é o da TV (o /sw.js da raiz não muda por causa do painel)', () => {
  const inst = ler('web/src/lib/instalar.js');
  assert.match(inst, /navigator\.serviceWorker\.register\('\/app\/sw\.js', \{ scope: '\/app\/' \}\)/);
  assert.doesNotMatch(ler('sw.js'), /compartilhar/);
});
