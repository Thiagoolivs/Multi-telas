/*
 * Uma marca só (docs/MARCA.md): o QA de 26/10 achou quatro identidades —
 * logo, landing, painel e TV, cada um com a sua cor e a sua letra.
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const RAIZ = path.join(__dirname, '..');
const ler = (...p) => fs.readFileSync(path.join(RAIZ, ...p), 'utf8');
const TINTA = '#0E0B1F', VIOLETA = '#5B2EFF', LIMA = '#C6F432';

test('o guia existe e diz as três cores e a letra', () => {
  const g = ler('docs/MARCA.md');
  for (const c of [TINTA, VIOLETA, LIMA, 'Outfit']) assert.ok(g.includes(c), 'o guia não fala de ' + c);
});

test('a letra Outfit está no repositório, com a licença, e é servida com cache longo', () => {
  for (const w of [400, 500, 600, 700]) assert.ok(fs.existsSync(path.join(RAIZ, 'fonts/marca/outfit-' + w + '-normal-latin.woff2')), 'falta Outfit ' + w);
  assert.match(ler('fonts/marca/LICENSE-outfit.txt'), /SIL Open Font License/);
  assert.match(ler('server.js'), /\/\\\/fonts\\\/\(arquivos\|marca\)\\\/\/\.test\(filePath\)/);
});

test('painel: Outfit e a tinta da marca', () => {
  assert.match(ler('web/tailwind.config.js'), /sans: \['Outfit'/);
  const css = ler('web/src/index.css');
  for (const w of [400, 500, 600, 700]) assert.match(css, new RegExp("font-weight: " + w + "; font-display: swap; src: url\\('/fonts/marca/outfit-" + w + "-normal-latin\\.woff2'\\)"));
  assert.match(css, /--c-ink: 14 11 31;/);
  assert.match(css, /--c-accent: 91 46 255;/);
});

test('landing: violeta e lima no lugar do azul e do amarelo, e Outfit no lugar de Poppins e Nunito', () => {
  const html = ler('landing/index.html');
  const tw = ler('landing/tailwind.config.js');
  assert.match(tw, /violeta: '#5B2EFF'/);
  assert.match(tw, /lima: '#C6F432'/);
  assert.match(tw, /tinta: '#0E0B1F'/);
  for (const velho of ['#2265ff', '#fab914', 'mt-azul', 'mt-sol', 'Poppins', 'Nunito']) {
    assert.ok(!html.includes(velho) && !tw.includes(velho), 'voltou ' + velho + ' na landing');
  }
  assert.doesNotMatch(ler('landing/analytics.js'), /#2265ff|Poppins|Nunito/);
  assert.match(ler('landing/vendor/fontes/fontes.css'), /font-family: 'Outfit'/);
});

test('TV: o tema padrão é a cor da marca, e config sem tema não herda mais o azul legado', () => {
  const T = require('../js/theme.js');
  const p = T.PRESETS[T.DEFAULT_PRESET];
  assert.equal(p.bg, TINTA);
  assert.equal(p.brand2, VIOLETA);
  assert.equal(p.accent, LIMA);
  assert.ok(p.halo, 'o halo desfocado precisa de uma cor própria (lima desfocado vira oliva)');
  const S = require('../js/storage.js');
  const n = S.normalize({ settings: { layoutId: 'full' }, zonas: {} });
  assert.notEqual(String(n.settings.cor).toLowerCase(), '#2f6feb', 'o azul legado voltou');
  assert.match(ler('css/player.css'), /var\(--halo, var\(--accent\)\)/);
});

test('e-mails com o botão na cor da marca', () => {
  for (const f of ['server/mail.js', 'server/lembretes.js', 'server/vigia.js']) {
    assert.ok(!ler(f).includes('#2f6feb'), f + ' com o azul antigo');
    assert.ok(ler(f).includes('background:#5B2EFF'), f);
  }
});
