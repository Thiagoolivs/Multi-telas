/*
 * As datas na TV (docs/EXECUTOR.md, item 17 — o player conferido em 720p,
 * 1080p e em pé).
 *
 * O navegador devolve a data em minúsculas ("quarta-feira, 21 de outubro").
 * O CSS usava `text-transform: capitalize`, que põe maiúscula em toda
 * palavra: a parede mostrava "Quarta-Feira | 21 De Out.". Agora só a primeira
 * letra sobe — no cabeçalho, no relógio, no clima sem rede e na tela de fora
 * do expediente.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const css = fs.readFileSync(path.join(__dirname, '..', 'css/player.css'), 'utf8').replace(/\r\n/g, '\n');
const regra = (sel) => {
  const i = css.indexOf('\n' + sel + ' {');
  assert.ok(i >= 0, 'sem regra para ' + sel);
  return css.slice(i, css.indexOf('}', i));
};

test('nenhuma data da TV leva maiúscula em toda palavra', () => {
  for (const sel of ['.mt-clock-date', '.mt-hc-date', '.wpf-date', '.mt-fora-dia']) {
    assert.doesNotMatch(regra(sel), /text-transform:\s*capitalize/, sel + ' voltou a pôr "De" com maiúscula');
  }
});

test('só a primeira letra da data sobe', () => {
  assert.ok(css.includes('.mt-clock-date::first-letter, .mt-hc-date::first-letter, .wpf-date::first-letter, .mt-fora-dia::first-letter { text-transform: uppercase; }'));
  const versao = Number(/mt-shell-v(\d+)/.exec(fs.readFileSync(path.join(__dirname, '..', 'sw.js'), 'utf8'))[1]);
  assert.ok(versao >= 39, 'a TV guarda o CSS no cache: subir a versão');
});
