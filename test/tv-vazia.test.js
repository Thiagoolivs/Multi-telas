/*
 * O que a TV mostra quando falta conteúdo.
 *
 * A primeira hora de uso é justamente quando mais falta: o dono pareou e só
 * preencheu a zona principal. A vitrine mostrava "Sem conteúdo" na lateral e
 * "Adicione notícias no painel de gestão" na faixa — recados para o dono, ao
 * público da loja. Agora zona vazia vira relógio e faixa vazia mostra a data.
 *
 * O arquivo do player é lido de verdade e a função extraída dele, como em
 * rodape.test.js: uma cópia da lógica concordaria comigo enquanto a TV faz
 * outra coisa.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const FONTE = fs.readFileSync(path.join(__dirname, '..', 'js', 'player.js'), 'utf8');

function dataPorExtenso() {
  const i = FONTE.indexOf('function dataPorExtenso(d)');
  assert.ok(i > 0, 'dataPorExtenso sumiu do player');
  const fim = FONTE.indexOf('\n  }', i) + 4;
  const ctx = { module: {} };
  vm.createContext(ctx);
  vm.runInContext(FONTE.slice(i, fim) + '\nmodule.exports = dataPorExtenso;', ctx);
  return ctx.module.exports;
}

test('data por extenso, com a primeira letra maiúscula', () => {
  const f = dataPorExtenso();
  const t = f(new Date(2026, 8, 29, 10, 0));
  assert.match(t, /^Ter/);
  assert.match(t, /29/);
  assert.match(t, /setembro/);
});

test('sem Intl, cai para dia/mês em vez de quebrar a zona', () => {
  const f = dataPorExtenso();
  const quebrado = { getDate: () => 5, getMonth: () => 0, toLocaleDateString: () => { throw new Error('sem ICU'); } };
  assert.strictEqual(f(quebrado), '05/01');
});

test('nenhum recado para o dono vai ao ar na TV', () => {
  // Texto na tela da loja é lido pelo cliente da loja.
  for (const recado of ['Sem conteúdo', 'Adicione notícias', 'painel de gestão']) {
    assert.ok(!FONTE.includes("'" + recado), 'a TV ainda escreve "' + recado + '"');
  }
});

test('zona vazia mostra a marca em calma (D12; no item 39 era preta, pulsando); o relógio é da zona toda fora do horário', () => {
  const r = FONTE.slice(FONTE.indexOf('function relogioDeZona()'), FONTE.indexOf('function esperaDeZona()'));
  assert.match(r, /mt-empty-hora/);
  assert.match(r, /dataPorExtenso\(/);
  assert.match(r, /parar: \(\) => clearInterval\(t\)/);
  // Desde o D15 a zona com automáticos (aniversário, mural) não espera: o rodízio cuida dela.
  const i = FONTE.indexOf('if (!items.length && !auto) {', FONTE.indexOf('function startPlaylist('));
  assert.ok(i > 0, 'a zona vazia mudou de regra');
  const bloco = FONTE.slice(i, FONTE.indexOf('function advance()', i));
  assert.match(bloco, /esperaDeZona\(\)/);
  assert.match(bloco, /stop: espera\.parar/);
  // O rodapé que ninguém configurou também espera, em vez do letreiro de exemplo.
  assert.match(FONTE, /if \(zone\.type === 'ticker' && rodapeEsperando\(data\)\) \{/);
  const css = fs.readFileSync(path.join(__dirname, '..', 'css', 'player.css'), 'utf8');
  // D12: "faixa preta com uma bolinha" parecia TV quebrada. A marca (logo ou nome) e a data, sobre a cor dela.
  assert.match(css, /background: #0b1220; background: linear-gradient\(135deg, var\(--brand\), var\(--brand-2\)\);/);
  assert.match(css, /\.mt-espera::before \{ content: ''; position: absolute; inset: 0; background: rgba\(5, 8, 16, \.62\); \}/);
  assert.ok(!/mt-espera-pulso/.test(FONTE), 'a bolinha pulsando voltou');
  const e = FONTE.slice(FONTE.indexOf('function esperaDeZona(faixa)'), FONTE.indexOf('function rodapeEsperando('));
  assert.match(e, /img\.src = logo\.clara \|\| logo\.url;/);
  assert.match(e, /marca\.textContent = global\.MT_NOME \|\| '';/);
  assert.match(e, /dataPorExtenso\(agora\)/);
  assert.match(FONTE, /const espera = esperaDeZona\(true\);/, 'o rodapé vazio é a faixa, numa linha');
});

test('tudo fora do horário agendado: relógio, não recado', () => {
  assert.ok(!FONTE.includes("'Nenhum conteúdo agendado agora'"), 'a TV voltou a escrever o recado para o público');
  assert.match(FONTE, /if \(!ativos\.length\) \{[\s\S]{0,120}mostrarRelogio\(\)/);
  // O relógio de fora do horário para quando sai do ar ou quando a zona é refeita.
  assert.match(FONTE, /currentSlide = \{ el: r\.el, onLeave: r\.parar, parar: r\.parar \}/);
  assert.match(FONTE, /if \(currentSlide && currentSlide\.parar\) currentSlide\.parar\(\);/);
});

test('faixa sem manchete mostra a data e repinta mesmo vazia (vira à meia-noite)', () => {
  const i = FONTE.indexOf('const tagPadrao = tag.textContent;');
  assert.ok(i > 0);
  const bloco = FONTE.slice(i, FONTE.indexOf('const item = items[idx % items.length];', i));
  assert.match(bloco, /title\.textContent = relogioConfiavel\(agora\) \? dataPorExtenso\(agora\)/);
  assert.match(FONTE, /if \(items\.length !== 1\) show\(\);/,
    'com a condição antiga (> 1) a faixa vazia ficaria com a data de ontem');
});

test('box sem bateria de relógio (ano de fábrica) não mostra hora errada', () => {
  const i = FONTE.indexOf('function relogioConfiavel(d)');
  assert.ok(i > 0, 'relogioConfiavel sumiu do player');
  const ctx = { module: {} };
  vm.createContext(ctx);
  vm.runInContext(FONTE.slice(i, FONTE.indexOf('\n', i)) + '\nmodule.exports = relogioConfiavel;', ctx);
  const f = ctx.module.exports;
  assert.strictEqual(f(new Date(1970, 0, 1)), false);
  assert.strictEqual(f(new Date(2020, 0, 1)), false);
  assert.strictEqual(f(new Date(2026, 8, 29)), true);
  // Os quatro relógios da TV consultam a mesma regra.
  const usos = FONTE.split('relogioConfiavel(').length - 2; // menos a declaração
  assert.ok(usos >= 4, 'algum relógio voltou a desenhar sem conferir a hora (' + usos + ')');
});
