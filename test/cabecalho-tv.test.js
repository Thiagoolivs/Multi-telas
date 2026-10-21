/*
 * O cabeçalho da TV (docs/EXECUTOR.md, item 17 — o player conferido em 720p,
 * 1080p e em pé).
 *
 * Três defeitos, medidos no navegador com quatro nomes de empresa:
 *  - a perna do g/p/j cortada em todo tamanho ("Embalaqens"): line-height 1
 *    com overflow hidden;
 *  - em pé, o nome virava reticências até em "Padaria do Bairro", porque
 *    nome, clima e relógio não cabem juntos em metade da largura;
 *  - em pé, a data quebrava em duas linhas.
 * Agora o nome tem a vez: no cabeçalho estreito o clima fica só com a
 * temperatura, a data perde o dia da semana, e um nome ainda longo encolhe
 * a fonte (até 70%) antes das reticências.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const RAIZ = path.join(__dirname, '..');
const css = fs.readFileSync(path.join(RAIZ, 'css/player.css'), 'utf8').replace(/\r\n/g, '\n');
const js = fs.readFileSync(path.join(RAIZ, 'js/player.js'), 'utf8').replace(/\r\n/g, '\n');
const regra = (sel) => {
  const i = css.indexOf('\n' + sel + ' {');
  assert.ok(i >= 0, 'sem regra para ' + sel);
  return css.slice(i, css.indexOf('}', i));
};

test('a perna do g não é cortada', () => {
  const lh = Number((regra('.mt-header-title').match(/line-height:\s*([\d.]+)/) || [])[1]);
  assert.ok(lh >= 1.2, 'line-height ' + lh + ' com overflow hidden corta g, p e j');
});

test('o nome tem a vez; no cabeçalho estreito saem a cidade e o dia da semana', () => {
  assert.match(regra('.mt-header-left'), /flex: 1 1 auto/);
  assert.match(regra('.mt-header-right'), /flex: none/);
  assert.match(regra('.mt-hc-date'), /white-space: nowrap/, 'a data não quebra em duas linhas');
  assert.match(css, /@container \(aspect-ratio < 10\) \{\n {2}\.mt-hw-cidade, \.mt-hc-dia \{ display: none; \}\n\}/);
  assert.match(js, /<span class="mt-hc-date"><span class="mt-hc-dia">' \+/);
  // Nome que ainda não cabe encolhe antes das reticências — e de novo quando o clima chega.
  assert.match(js, /updateHeaderWeather\(weather, cfg\.settings\.cidadeClima \|\| 'São Paulo'\)\.then\(\(\) => caberNome\(title\)\);\n {4}caberNome\(title\);/);
  assert.match(js, /const esc = Math\.max\(0\.7, \(el\.clientWidth \/ el\.scrollWidth\) \* 0\.98\);/);
});

test('o clima chega de verdade: temperatura e cidade num span só', async () => {
  // Roda a função do player com fetch e document de mentira. A primeira
  // versão desta correção declarava `const cidade` dentro do try: o
  // parâmetro de mesmo nome caía na zona morta, o erro era engolido pelo
  // catch e o clima sumia da TV sem aviso nenhum.
  const ini = js.indexOf('  async function updateHeaderWeather(el, cidade) {');
  const fim = js.indexOf('\n  }\n', ini) + 4;
  const fonte = js.slice(ini, fim);
  const pedidos = [];
  const fetch = async (u) => {
    pedidos.push(u);
    return { json: async () => (/geocoding/.test(u)
      ? { results: [{ name: 'São Paulo', latitude: -23.5, longitude: -46.6 }] }
      : { current: { temperature_2m: 21.6 } }) };
  };
  const no = (tag) => ({ tag, className: '', textContent: '', filhos: [], appendChild(f) { this.filhos.push(f); } });
  const document = { createElement: no };
  const atualizar = new Function('fetch', 'document', fonte + '\nreturn updateHeaderWeather;')(fetch, document);
  const el = no('div');
  await atualizar(el, 'São Paulo');
  assert.equal(pedidos.length, 2, 'o player nem pediu o clima');
  assert.equal(el.filhos.length, 1, 'um item só dentro da pílula (senão o gap abre buraco)');
  const texto = el.filhos[0];
  assert.equal(texto.textContent, '22°C');
  assert.equal(texto.filhos[0].className, 'mt-hw-cidade');
  assert.equal(texto.filhos[0].textContent, ' · São Paulo');
});

test('a TV baixa o CSS novo', () => {
  const versao = Number(/mt-shell-v(\d+)/.exec(fs.readFileSync(path.join(RAIZ, 'sw.js'), 'utf8'))[1]);
  assert.ok(versao >= 40);
});
