/*
 * Publicar só quando pronto (EXECUTOR D14).
 *
 * Antes cada tecla publicava: a TV redesenhava a tela inteira enquanto a
 * pessoa digitava, e escolher "Aviso" punha um aviso vazio na parede. Agora
 * a edição é rascunho (guardado no navegador, para sair e voltar) e a TV só
 * recebe no "Publicar na TV". No conflito, o rascunho não é jogado fora: a
 * pessoa escolhe pôr o dela por cima da versão nova (revisão do consultor no
 * D0.5) ou ver a nova.
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const RAIZ = path.join(__dirname, '..');
const semComentarios = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const S = semComentarios(fs.readFileSync(path.join(RAIZ, 'web/src/pages/ContentEditorPage.jsx'), 'utf8'));

test('nada publica sozinho: só o botão (ou Ctrl+S) e ações explícitas', () => {
  const chamadas = (S.match(/publish\(/g) || []).length;
  assert.ok(!/const ESPERAS = \[/.test(S), 'o salvamento automático voltou');
  assert.ok(!/keepalive: true/.test(S), 'sair voltou a publicar');
  assert.match(S, /onClick=\{\(\) => publish\(\)\}/);
  assert.match(S, /if \(\(e\.ctrlKey \|\| e\.metaKey\) && e\.key\.toLowerCase\(\) === 's'\) \{ e\.preventDefault\(\); if \(dirty && !publishing\) publish\(\); \}/);
  // Tirar uma campanha da TV publica já (a campanha sai da lista desta TV no servidor ao mesmo tempo).
  assert.match(S, /if \(!\(await publish\(novo\)\)\) setDirty\(true\);/);
  assert.ok(chamadas <= 7, 'apareceu publicação nova: ' + chamadas);
});

test('o rascunho fica guardado, volta ao abrir e respeita a TV que mudou', () => {
  assert.match(S, /const chaveDoRascunho = \(id\) => 'mt\.rascunho\.' \+ id;/);
  assert.match(S, /if \(r\.versao === versao\.current\) \{\s*setCfg\(r\.cfg\); setDirty\(true\);/);
  assert.match(S, /setCfg\(seeded\); setDirty\(false\); setAvisoRascunho\(\{ em: r\.em, mudouNaTV: true, cfg: r\.cfg \}\);/, 'rascunho velho entrou por cima da TV que mudou');
  assert.match(S, /apagarRascunho\(device\.id\);\s*return true;/, 'publicar não limpa o rascunho');
});

test('no conflito: o rascunho fica, e dá para publicar por cima da versão nova', () => {
  assert.match(S, /if \(e\.codigo === 'config-mudou'\) \{ setConflito\(true\); return false; \}/);
  // Relê a versão nova antes de gravar por cima (e, desde o #232, pergunta antes).
  assert.match(S, /const r = await deviceConfig\.ler\(device\.id\);[\s\S]{0,1400}versao\.current = \(r && r\.versao\) \|\| 0;\s*await publish\(\);/);
  assert.match(S, />Publicar o meu por cima</);
  assert.match(S, />Ver a versão nova</);
});

test('revisão do #232: o "por cima" diz o que some; rascunho velho e o de outra pessoa não ficam', () => {
  assert.match(S, /const somem = campanhasDaConfig\(\(r && r\.config\) \|\| \{\}\)\.map\(\(c\) => c\.nome\)\.filter\(\(n\) => !meu\.has\(n\)\);/);
  assert.match(S, /if \(!ok\) return;\s*versao\.current = \(r && r\.versao\) \|\| 0;/, 'publica por cima sem perguntar');
  assert.match(S, /const VALIDADE_DO_RASCUNHO = 30 \* 24 \* 60 \* 60 \* 1000;/);
  const app = fs.readFileSync(path.join(RAIZ, 'web/src/App.jsx'), 'utf8');
  assert.match(app, /k\.startsWith\('mt\.rascunho\.'\)\)\.forEach\(\(k\) => localStorage\.removeItem\(k\)\)/, 'sair da conta deixa o rascunho para a próxima pessoa');
});
