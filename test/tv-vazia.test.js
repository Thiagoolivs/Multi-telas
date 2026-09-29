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

test('zona vazia vira relógio e para o timer quando a zona sai', () => {
  const i = FONTE.indexOf('if (!items.length) {', FONTE.indexOf('function startPlaylist('));
  const bloco = FONTE.slice(i, FONTE.indexOf('function advance()', i));
  assert.match(bloco, /mt-empty-hora/);
  assert.match(bloco, /dataPorExtenso\(/);
  assert.match(bloco, /stop: \(\) => clearInterval\(/, 'o relógio ficaria rodando depois de trocar o layout');
});

test('faixa sem manchete mostra a data e repinta mesmo vazia (vira à meia-noite)', () => {
  const i = FONTE.indexOf('const tagPadrao = tag.textContent;');
  assert.ok(i > 0);
  const bloco = FONTE.slice(i, FONTE.indexOf('const item = items[idx % items.length];', i));
  assert.match(bloco, /title\.textContent = dataPorExtenso\(/);
  assert.match(FONTE, /if \(items\.length !== 1\) show\(\);/,
    'com a condição antiga (> 1) a faixa vazia ficaria com a data de ontem');
});
