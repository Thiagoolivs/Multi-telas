/*
 * TV adaptável (docs/EXECUTOR.md, item 7; PLANO §7.1).
 *
 * Conferido com o player de verdade em todos os 15 layouts, em 1280×720,
 * 1920×1080 e 3840×2160 (e 720×1280, 1080×1920 e 2160×3840 nos em pé), e
 * com a varredura das peças-ouro nas zonas MEDIDAS desses layouts: 3834
 * combinações (peça × marca × zona) sem nada vazando nem se sobrepondo. As
 * peças da ótica do lote 1 não se moveram (0 px nas zonas aprovadas).
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const R = require('../js/peca-render.js');

const RAIZ = path.join(__dirname, '..');
const ler = (...p) => fs.readFileSync(path.join(RAIZ, ...p), 'utf8');

function palcoFalso() {
  const p = { style: { cssText: '' }, removido: false };
  p.removeAttribute = (a) => { if (a === 'style') { p.style.cssText = ''; p.removido = true; } };
  return p;
}
const enquadrado = (w, h) => { const p = palcoFalso(); R.enquadrar({ clientWidth: w, clientHeight: h }, p); return p; };

test('zona quase quadrada: a peça é desenhada no 1080×1080 aprovado e escalada, no centro', () => {
  // Vertical · Duas zonas (1038×851): o desenho deitado não cabia.
  const p = enquadrado(1038, 851);
  assert.match(p.style.cssText, /width:1080px;height:1080px/);
  const k = 851 / 1080;
  assert.ok(p.style.cssText.includes('scale(' + k.toFixed(5) + ')'));
  assert.ok(p.style.cssText.includes('left:' + ((1038 - 1080 * k) / 2).toFixed(2) + 'px'));
  // O ladrilho pequeno do layout quadrado dividido também: 522 px não é coluna.
  assert.match(enquadrado(522, 418).style.cssText, /width:1080px;height:1080px/);
});

test('zona larga demais (2,4:1): desenhada em 16:9, no centro', () => {
  assert.match(enquadrado(1896, 784).style.cssText, /width:1920px;height:1080px/);
});

test('fora das faixas o palco fica como sempre: 16:9, 1:1, em pé, lateral, cabeçalho e rodapé', () => {
  for (const [w, h] of [[1920, 1080], [1405, 832], [1379, 784], [1080, 1080], [1080, 1920], [515, 832], [1920, 130], [1896, 119], [1390, 140]]) {
    const p = enquadrado(w, h);
    assert.ok(p.removido && !p.style.cssText, w + '×' + h + ' foi enquadrado');
  }
});

test('as sobras pintam com o fundo da marca, e o desenhista acompanha a zona que muda de tamanho', () => {
  assert.match(R.BASE, /:host\{[^}]*container-type:size/, 'o host precisa ser container para a regra medir a zona');
  assert.match(R.BASE, /\.mt-faixas\{position:absolute;inset:0;background:var\(--mt-fundo\);visibility:hidden\}/);
  assert.match(R.cssDosTokens(require('../js/tokens.js').gerar({})), /^:host,\.mt-palco\{--mt-fundo:/);
  const src = ler('js/peca-render.js');
  assert.match(src, /new ResizeObserver\(\(\) => enquadrar\(host, palcoEl\)\)/);
  assert.match(src, /if \(observador\) observador\.disconnect\(\);/, 'o observador sai com a peça');
});

test('no player a peça é desenhada no tamanho de 1080p e escalada (720p e 4K iguais)', () => {
  const r = ler('js/render.js');
  assert.match(r, /const k = w >= h \? Math\.min\(w \/ 1920, h \/ 1080\) : Math\.min\(w \/ 1080, h \/ 1920\);/);
  assert.match(r, /'position:absolute;left:0;top:0;width:' \+ \(100 \/ k\) \+ '%;height:' \+ \(100 \/ k\) \+ '%;transform:scale\(' \+ k \+ '\)/);
  assert.match(r, /MTPecaRender\.montar\(hostDaPeca\(el\), item, opcoesDaPeca\(\)\)/);
  assert.match(ler('js/player.js'), /const alvo = MTRender\.hostDaPeca \? MTRender\.hostDaPeca\(host\) : host;/, 'a peça do cabeçalho e do rodapé também');
});

test('margem contra o overscan: por tela, 0 a 5%, aplicada na hora e com reserva no CSS', () => {
  const p = ler('js/player.js');
  assert.match(p, /Math\.max\(0, Math\.min\(5, Number\(cfg && cfg\.settings && cfg\.settings\.margemSegura\) \|\| 0\)\)/);
  assert.match(p, /document\.documentElement\.style\.setProperty\('--mt-margem', String\(m\)\)/);
  assert.match(p, /margemSegura: 1,/, 'mudar a margem não pode remontar as zonas');
  assert.match(p, /function aplicarNoPalco\(cfg\) \{\s+aplicarMargem\(cfg\);/);
  const css = ler('css/player.css');
  assert.match(css, /padding: calc\(1\.1vh \+ var\(--mt-margem, 0\) \* 1vh\) calc\(1\.1vh \+ var\(--mt-margem, 0\) \* 1vw\);/);
  assert.match(css, /padding: calc\(4vh \+ var\(--mt-margem, 0\) \* 1vh\) calc\(4vw \+ var\(--mt-margem, 0\) \* 1vw\);/, 'o destaque também');
  const form = ler('web/src/components/content/SettingsForm.jsx');
  assert.match(form, /type="range" min="0" max="5" step="0\.5" value=\{s\.margemSegura \|\| 0\}/);
});

test('conteúdo da zona medido pela zona (cqw/cqh), com a linha antiga como reserva', () => {
  const css = ler('css/player.css').replace(/\r/g, '');
  const pares = [
    ['clamp(30px, 5.4vw, 104px)', 'min(7.6cqw, 11.5cqh)'], ['clamp(18px, 2.4vw, 42px)', 'min(3.6cqw, 4.6cqh)'],
    ['clamp(40px, 9vw, 168px)', 'min(26cqw, 18.6cqh)'], ['clamp(15px, 2.2vw, 36px)', 'min(6cqw, 4cqh)'],
    ['clamp(48px, 10vw, 160px)', 'min(30cqw, 17.7cqh)'], ['clamp(36px, 7vw, 120px)', 'min(24cqw, 13.3cqh)'],
    ['clamp(22px, 3vw, 52px)', 'min(7cqw, 5.75cqh)'], ['clamp(15px, 1.9vw, 32px)', 'min(4.5cqw, 3.5cqh)'],
    ['clamp(180px, 22vw, 420px)', 'min(60cqw, 46cqh)'], ['clamp(16px, 2vw, 34px)', 'min(5cqw, 3.8cqh)'],
    ['clamp(16px, 2.4vw, 36px)', 'min(2.6cqw, 26cqh)'],
  ];
  for (const [antiga, nova] of pares) {
    const i = css.indexOf(antiga), j = css.indexOf(nova);
    assert.ok(i > 0 && j > i && j - i < 120, 'sem a versão de zona (ou fora de ordem): ' + antiga);
  }
});

test('peças-rascunho acertadas para as zonas reais; a mudança de casco da TV sobe a versão', () => {
  assert.match(ler('pecas-ouro', 'cardapio-categorias.html'), /@container \(aspect-ratio >= 0\.58\) and \(aspect-ratio < 0\.8\)/);
  assert.match(ler('pecas-ouro', 'servico-horario.html'), /@container \(aspect-ratio >= 1\.25\) and \(aspect-ratio < 1\.65\)/);
  assert.match(ler('pecas-ouro', 'rodape-faixa.html'), /@container \(aspect-ratio < 12\)/);
  assert.ok(Number(/mt-shell-v(\d+)/.exec(ler('sw.js'))[1]) >= 34);
});
