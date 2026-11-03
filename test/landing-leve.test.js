/*
 * A landing no celular (QA de 26/10): 426 ms de bloqueio, galeria e
 * simulador montados de cara, aviso de cookies e WhatsApp no mesmo canto, e
 * a seção mais bonita ("Todas as TVs") no meio da página.
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ler = (...p) => fs.readFileSync(path.join(__dirname, '..', ...p), 'utf8');

test('a TV do herói troca de peça só depois do load, com o navegador livre, e para fora da tela', () => {
  const js = ler('landing/landing.js');
  const bloco = js.slice(js.indexOf('var depoisDoLoad'), js.indexOf('/* ---------- Aparecer ao rolar'));
  assert.match(bloco, /window\.requestIdleCallback \|\| function \(f\) \{ return setTimeout\(f, 1200\); \}/);
  assert.match(bloco, /new IntersectionObserver\(function \(es\) \{ visivel = es\[0\]\.isIntersecting; conferir\(\); \}\)/);
  assert.match(bloco, /document\.addEventListener\('visibilitychange', conferir\);/);
  assert.match(bloco, /if \(!deve && timer\) \{ clearInterval\(timer\); timer = null; \}/);
});

test('o simulador de preço só é montado quando a seção de preços se aproxima', () => {
  const js = ler('landing/landing.js');
  assert.match(js, /quandoAparecer\(document\.getElementById\('precos'\), function \(\) \{ simulador\(dados\.simulacao \|\| \[\]\); \}\);/);
  assert.doesNotMatch(js, /^\s*simulador\(dados\.simulacao \|\| \[\]\);/m, 'o simulador voltou a montar de cara');
});

test('com o aviso de cookies aberto, o WhatsApp sobe; fechou, volta', () => {
  const a = ler('landing/analytics.js');
  assert.match(a, /document\.documentElement\.classList\.add\('com-aviso-cookies'\);/);
  assert.match(a, /document\.documentElement\.classList\.remove\('com-aviso-cookies'\);/);
  assert.equal((a.match(/fechar\(\);/g) || []).length, 2, 'aceitar e recusar fecham pelo mesmo caminho');
  assert.match(ler('landing/index.html'), /\.com-aviso-cookies #whats-flutuante \{ bottom: \d+px; \}/);
});

test('"Todas as TVs" vem logo depois do herói', () => {
  const h = ler('landing/index.html');
  const fimHeroi = h.indexOf('</header>');
  const telas = h.indexOf('<section id="telas"');
  const como = h.indexOf('<section id="como"');
  assert.ok(fimHeroi < telas && telas < como, 'a seção escura saiu do topo');
});
