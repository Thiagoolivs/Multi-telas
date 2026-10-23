/*
 * A Marca reordenada e salvando sozinha (EXECUTOR D6).
 *
 * - Ordem do dono: logo, cores, nome e tom, site, e o avançado fechado.
 * - Sem botão "Salvar identidade": tudo salva sozinho, e a troca de marca
 *   grava ANTES (o servidor salva a marca ativa — gravar depois da troca
 *   poria o texto de uma marca na outra).
 * - As "Imagens base" saíram da Marca: viraram a etiqueta "da marca" em
 *   Mídias › Fotos.
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const RAIZ = path.join(__dirname, '..');
const ler = (f) => fs.readFileSync(path.join(RAIZ, f), 'utf8');
// Sem comentários: o histórico ("era Salvar identidade") fica no código, a regra vale para o que roda.
const semComentarios = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const MARCA = semComentarios(ler('web/src/pages/BrandPage.jsx'));

test('a ordem: logo, cores, nome e tom, site, fotos, avançado', () => {
  const ordem = ['<PanelHeader title="Logo"', '<PaletasSugeridas ', 'title="Nome e jeito de falar"', 'title="Site da marca"', 'title="Fotos da empresa"', 'Avançado</span>']
    .map((s) => MARCA.indexOf(s));
  assert.ok(ordem.every((i) => i > 0), 'sumiu uma seção: ' + ordem.join(', '));
  assert.deepEqual([...ordem].sort((a, b) => a - b), ordem, 'a ordem mudou');
  // Fontes, direção e várias marcas moram no avançado, fechado.
  const av = MARCA.slice(MARCA.indexOf('{avancado && ('));
  for (const s of ['Fonte dos títulos', 'Direção de arte', 'Referências de estilo', 'Várias marcas']) assert.ok(av.includes(s), s + ' fora do avançado');
  assert.match(MARCA, /const \[avancado, setAvancado\] = useState\(false\);/);
});

test('salva sozinho, e a troca de marca grava antes', () => {
  assert.ok(!/Salvar identidade/.test(MARCA), 'o botão de salvar voltou');
  assert.match(MARCA, /espera\.current = setTimeout\(salvarAgora, 900\);/);
  for (const f of ['trocarMarca', 'novaMarca']) {
    const corpo = MARCA.slice(MARCA.indexOf('async function ' + f), MARCA.indexOf('async function ' + f) + 600);
    assert.ok(corpo.indexOf('await salvarAgora()') > 0 && corpo.indexOf('await salvarAgora()') < corpo.search(/brand\.(ativarMarca|criarMarca)/), f + ' troca antes de gravar');
  }
  // As cores continuam com o toque próprio (aplicar), e não vão no salvar sozinho por engano.
  assert.match(MARCA, /await brand\.save\(\{ \.\.\.c, cores: k && k\.length \? k : cores \}\);/);
});

test('as Imagens base viraram a etiqueta "da marca" em Mídias › Fotos', () => {
  assert.ok(!/Imagens base/.test(MARCA), 'as Imagens base voltaram para a Marca');
  const s = ler('web/src/pages/StoragePage.jsx');
  assert.match(s, /await brand\.addAsset\('base', m\.url, ''\);/);
  assert.match(s, /await brand\.removeAsset\(a\.id\);/);
  assert.match(s, /\{a \? <Check size=\{11\} \/> : <Tag size=\{11\} \/>\} da marca/);
  assert.match(s, /const etiquetaDaMarca = filtro === 'fotos';/, 'a etiqueta é só para as fotos enviadas');
  // O nome da marca saiu do editor de cores: mora em "Nome e jeito de falar".
  assert.ok(!/Nome da marca/.test(ler('web/src/components/content/PaletasSugeridas.jsx')));
});
