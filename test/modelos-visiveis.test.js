/*
 * Os modelos já visíveis (EXECUTOR D16).
 *
 * Cliente novo abria Peças prontas e via "Nenhuma peça pronta ainda", com as
 * peças-ouro aprovadas guardadas no servidor sem ninguém poder usar. Agora
 * elas aparecem, na marca da conta (cores, fontes, nome, logo), na ordem do
 * tipo de negócio, com "Usar" → troca o texto → põe na TV.
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const RAIZ = path.join(__dirname, '..');
const ler = (f) => fs.readFileSync(path.join(RAIZ, f), 'utf8');

test('todas as peças-ouro aprovadas existem e têm papel', () => {
  const m = JSON.parse(ler('pecas-ouro/manifesto.json'));
  const aprovadas = m.pecas.filter((p) => !p.estado || p.estado === 'aprovada');
  assert.ok(aprovadas.length >= 40, 'sumiram modelos: ' + aprovadas.length);
  for (const p of aprovadas) {
    assert.ok(fs.existsSync(path.join(RAIZ, 'pecas-ouro', p.id + '.html')), p.id + ' sem arquivo');
    assert.ok((p.papeis || []).length, p.id + ' sem papel');
  }
});

test('o modelo sai na marca da conta, no modo "Cor da marca", com o nome onde a peça escreve a marca', async () => {
  const { pathToFileURL } = require('node:url');
  // A lib do painel importa o desenhista; aqui só a montagem, sem navegador.
  const src = ler('web/src/lib/modelosOuro.js');
  assert.match(src, /modo: 'marca', formato: FORMATO_DO_PAPEL\[papel\] \|\| '16\/9'/);
  // Fase 9: o exemplo na língua da frente vem antes, e o nome da conta por cima.
  assert.match(src, /const campos = \{ \.\.\.daFrente, \.\.\.\(k\.nome && \/data-campo="marca"\/\.test\(m\.arq\.html\) \? \{ marca: k\.nome \} : \{\}\) \};/);
  assert.match(src, /marca: \{ cores: k\.cores \|\| \[\], fonteTitulo: k\.fonteTitulo \|\| '', fonteApoio: k\.fonteApoio \|\| '' \}/);
  // A ordem segue o tipo de negócio (D4).
  assert.match(src, /empresa: \['gente', 'serviço', 'institucional'/);
  void pathToFileURL;
});

test('Peças prontas mostra os modelos; com eles, a página nunca fica vazia', () => {
  const p = ler('web/src/pages/PecasProntasPage.jsx');
  assert.match(p, /Modelos prontos, com a sua marca/);
  assert.match(p, /visiveis\.length === 0 && modelosVisiveis\.length > 0 \? null :/);
  // Fase 8: um violeta por tela — nos cartões, o botão é o de contorno.
  assert.match(p, /<Button size="sm" variant="secondary" icon=\{Wand2\} className="border-accent\/50 font-semibold" onClick=\{\(\) => setUsando\(p\)\}>Usar<\/Button>/);
  assert.match(p, /<EditarPeca item=\{usando\.item\}/);
  // Fase 7: o "Usar" termina no Pôr na TV único (onde e quando).
  assert.match(p, /if \(telas\.length\) setPorNaTv\(pronta\);/);
  assert.match(p, /<PorNaTV peca=\{porNaTv\} telas=\{telas\}/);
});
