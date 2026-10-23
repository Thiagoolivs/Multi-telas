/*
 * Prévia visual antes de gerar (EXECUTOR D13).
 *
 * O dono: cartões de cor e esboço de cada tela no chat do Criar (antes de
 * gastar) e na Marca. O esboço é a planta da TV desenhada com caixas, sem
 * IA; as cores escolhidas no cartão valem só para a campanha (escopo.cores).
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const E = require('../js/escopo.js');
const eco = require('../server/ecossistema.js');
const RAIZ = path.join(__dirname, '..');
const ler = (f) => fs.readFileSync(path.join(RAIZ, f), 'utf8');

test('o escopo guarda as cores da campanha: só #rrggbb, até três', () => {
  assert.deepEqual(E.normalizar({}).cores, [], 'sem escolha = as da Marca');
  assert.deepEqual(E.normalizar({ cores: ['#1E3A8A', 'red', '#f59e0b', '#fff', '#ffffff', '#000000'] }).cores, ['#1e3a8a', '#f59e0b', '#ffffff']);
});

test('a campanha gerada usa as cores escolhidas na prévia (e o ajuste também)', async () => {
  const escopo = E.normalizar({ nome: 'T', imagens: 'nenhuma', cores: ['#7c2d12', '#fbbf24'], telas: [{ alvo: { tipo: 'todas' }, zonas: { principal: { pecas: 1 } } }] });
  const r = await eco.gerar(escopo, { marca: { cores: ['#1e3a8a', '#0ea5e9'] }, telas: [] }, {});
  const peca = r.telas[0].zonas.principal[0];
  assert.deepEqual(peca.item.marca.cores.slice(0, 2), ['#7c2d12', '#fbbf24'], 'a peça saiu com as cores da Marca, não as escolhidas');
  assert.match(ler('server/ajuste.js'), /const m = escopo\.cores\.length \? Object\.assign\(\{\}, ctx\.marca \|\| \{\}, \{ cores: escopo\.cores \}\)/);
  // A conversa não apaga a escolha do cartão quando a IA esquece o campo.
  assert.match(ler('server/ai-conversa.js'), /if \(!escopoNovo\.cores\.length && atual\.cores\.length\) escopoNovo\.cores = atual\.cores\.slice\(\);/);
});

test('o esboço e os cartões de cor no Criar; o esboço na Marca', () => {
  const k = ler('web/src/components/criar/CartaoEscopo.jsx');
  assert.match(k, /<EsbocoDaTela key=\{ti\} zonas=\{t\.zonas\} cores=\{coresAtuais\}/);
  assert.match(k, /role="radiogroup" aria-label="Cores desta campanha"/);
  assert.match(k, /onClick=\{\(\) => mudar\(\(x\) => \{ x\.cores = o\.daMarca \? \[\] : o\.cores\.slice\(0, 3\); \}\)\}/);
  // O cartão em três lugares e, desde o D42, o esboço para aprovar — os quatro com a marca.
  assert.equal((ler('web/src/pages/CriarPage.jsx').match(/marca=\{marca\}/g) || []).length, 4, 'o cartão e o esboço com a prévia da marca');
  const m = ler('web/src/pages/BrandPage.jsx');
  assert.match(m, /<PanelHeader title="Como fica na TV"/);
  assert.match(m, /<EsbocoDaTela cores=\{cores\}/);
  const s = ler('web/src/components/criar/EsbocoDaTela.jsx');
  // Texto que lê sobre o fundo, e a logo na versão do fundo (D7).
  assert.match(s, /const sobre = \(fundo\) => \(luminancia\(fundo\) < 0\.4 \? '#ffffff' : '#111827'\);/);
  assert.match(s, /\(luminancia\(fundo\) < 0\.4 \? logo\.clara : logo\.escura\) \|\| logo\.url/);
});
