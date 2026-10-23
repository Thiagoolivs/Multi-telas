/*
 * O npm test (e o servidor local em modo de teste) não chamam IA de verdade.
 *
 * Visto em 23/10: com a GEMINI_API_KEY no ambiente do PC, os testes que não
 * simulam a IA chamavam o Gemini real (um levava 175 s esperando) — e o
 * compositor e a visão escolhiam o Gemini pela chave, passando por cima do
 * AI_PROVIDER=dev do servidor local.
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const RAIZ = path.join(__dirname, '..');

test('o npm test roda com AI_PROVIDER=dev (e quem precisa de outro provedor diz qual)', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(RAIZ, 'package.json'), 'utf8'));
  assert.match(pkg.scripts.test, /--env-file-if-exists=test\/sem-ia\.env/);
  assert.match(fs.readFileSync(path.join(RAIZ, 'test', 'sem-ia.env'), 'utf8'), /^AI_PROVIDER=dev\r?$/m);
});

test('AI_PROVIDER=dev vale na composição e na visão, mesmo com a chave do Gemini no ambiente', () => {
  const antes = { p: process.env.AI_PROVIDER, k: process.env.GEMINI_API_KEY };
  try {
    process.env.AI_PROVIDER = 'dev';
    process.env.GEMINI_API_KEY = 'chave-falsa-de-teste';
    assert.equal(require('../server/compositor').motorDoHtml(), 'dev');
    process.env.AI_PROVIDER = '';
    assert.equal(require('../server/compositor').motorDoHtml(), 'gemini', 'sem AI_PROVIDER, a chave decide (como em produção)');
  } finally {
    if (antes.p === undefined) delete process.env.AI_PROVIDER; else process.env.AI_PROVIDER = antes.p;
    if (antes.k === undefined) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY = antes.k;
  }
  assert.match(fs.readFileSync(path.join(RAIZ, 'server', 'ai.js'), 'utf8'), /const motor = mode\(\) === 'dev' \? 'dev' : temGemini \? 'gemini' : motores\.motorPadrao\(\);/);
});
