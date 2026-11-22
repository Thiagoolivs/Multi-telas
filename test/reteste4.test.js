/*
 * Reteste 4 (22/11): os textos do painel que o RH leu errado na conta de 8 TVs.
 *
 * Cada teste segura uma frase que estava na tela: "Dias sem acidente na TVs
 * (3).", "Veio 3 indicadores", o backup "multitelas-produ-o-1.json", o aviso
 * urgente que dizia "até você tirar" logo abaixo de "sai sozinho em 2 horas",
 * e o "Ex.: Loja Centro" / "Quando a loja abre" no menu da TV de uma empresa.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const RAIZ = path.join(__dirname, '..');
const ler = (...p) => fs.readFileSync(path.join(RAIZ, ...p), 'utf8');

test('"X em 3 TVs." e não "X na TVs (3)." (Indicadores e Preços da planilha)', () => {
  for (const f of ['web/src/pages/IndicadoresPage.jsx', 'web/src/pages/PlanilhasPage.jsx']) {
    const s = ler(f);
    assert.doesNotMatch(s, /' na TV' \+ \(escolhidas\.length === 1 \? '\.' : 's \('/, f + ': voltou o "na TVs (3)"');
    assert.match(s, /\(escolhidas\.length === 1 \? ' na TV\.' : ' em ' \+ escolhidas\.length \+ ' TVs\.'\)/, f);
  }
});

test('"Vieram 3 indicadores", e "Veio 1 indicador"', () => {
  const s = ler('web/src/pages/IndicadoresPage.jsx');
  assert.doesNotMatch(s, /Veio \{/, 'voltou o "Veio 3 indicadores"');
  assert.equal((s.match(/'Veio 1 indicador' : 'Vieram ' \+ /g) || []).length, 3);
});

test('o backup da TV "Produção 1" se chama multitelas-producao-1.json', () => {
  const s = ler('web/src/pages/ScreensPage.jsx');
  const linha = s.split('\n').find((l) => l.includes("a.download = 'multitelas-' +"));
  assert.ok(linha, 'o nome do arquivo de backup sumiu');
  // A mesma conta do painel, rodada aqui.
  const expr = linha.trim().replace(/^a\.download = /, '').replace(/;$/, '').replace(/target\.name/g, 'nome');
  const nomeDoArquivo = new Function('nome', 'return ' + expr);
  assert.equal(nomeDoArquivo('Produção 1'), 'multitelas-producao-1.json');
  assert.equal(nomeDoArquivo('Refeitório'), 'multitelas-refeitorio.json');
  assert.equal(nomeDoArquivo(''), 'multitelas-tela.json');
});

test('o aviso urgente sem data diz "por 2 horas", não "até você tirar"', () => {
  const s = ler('web/src/components/tela/AvisoRapido.jsx');
  assert.match(s, /O urgente sem data sai sozinho em 2 horas/);
  assert.match(s, /: aviso\.prioridade === 'urgente' \? ', por 2 horas' : ', até você tirar'/);
});

test('o menu da TV fala a língua da frente: nada de "Loja Centro" nem "a loja abre" numa empresa', () => {
  const s = ler('web/src/pages/ScreensPage.jsx');
  assert.doesNotMatch(s, /texto="Ex\.: Recepção, Loja Centro\."/);
  assert.doesNotMatch(s, /'Quando a loja abre e o e-mail se a TV cair\.'/);
  assert.doesNotMatch(s, /hint="Ex\.: Loja Centro\./);
  assert.match(s, /const GRUPO_DE_EXEMPLO = \{ empresa: 'Produção', comercio: 'Loja Centro', saude: 'Unidade Centro' \};/);
  assert.match(s, /'Quando a ' \+ perfil\.lugar \+ ' abre e o e-mail se a TV cair\.'/);
  // O que o menu usa existe em todas as frentes.
  const P = require('../js/perfil.js');
  for (const id of ['empresa', 'comercio', 'saude']) {
    const p = P.PERFIS ? P.PERFIS[id] : P.get(id);
    assert.ok(p && p.lugar && p.textos && p.textos.nomesDeTv, id);
  }
});

test('mural na TV em pé: a grade é trocada (linhas viram colunas), e não duas tiras altas e vazias', () => {
  const r = ler('js/render.js');
  const ini = r.indexOf('function grade(n) {');
  const grade = new Function(r.slice(ini, r.indexOf('\n    }\n', ini) + 6) + '\nreturn grade;')();
  // A TV deitada segue igual: 2 fotos lado a lado; 5 a 6, três colunas.
  assert.deepEqual([grade(2).cols, grade(2).rows], ['repeat(2, 1fr)', 'repeat(1, 1fr)']);
  // O JS manda as duas grades; a de pé é a deitada trocada.
  assert.match(r, /parede\.style\.setProperty\('--mural-cols-empe', g\.rows\);/);
  assert.match(r, /parede\.style\.setProperty\('--mural-rows-empe', g\.cols\);/);
  const css = ler('css/player.css');
  assert.match(css, /\.mt-mural-parede \{[^}]*grid-template-columns: var\(--mural-cols, 1fr\);[^}]*grid-template-rows: var\(--mural-rows, 1fr\);/);
  assert.match(css, /@container \(aspect-ratio < 1\) \{\s*\.mt-mural-parede \{\s*grid-template-columns: var\(--mural-cols-empe, 1fr\);\s*grid-template-rows: var\(--mural-rows-empe, 1fr\);/);
  // Mexeu na TV: o shell do player sobe de versão (as TVs baixam o CSS novo).
  assert.match(ler('sw.js'), /const SHELL_CACHE = 'mt-shell-v(\d+)';/);
  assert.ok(Number(/mt-shell-v(\d+)/.exec(ler('sw.js'))[1]) >= 98);
});

test('a tela da senha usa a logo branca no fundo escuro (a logo escura da clínica sumia no canto)', () => {
  const src = ler('js/senha.js');
  const ini = src.indexOf('  function luminancia(cor) {');
  const fim = src.indexOf('  function marcaEl() {');
  assert.ok(ini > 0 && fim > ini, 'a escolha da logo sumiu da tela da senha');
  const fundos = new Map();
  const fabrica = new Function('getComputedStyle', src.slice(ini, fim) + '\nreturn logoNoFundo;');
  const logoNoFundo = fabrica((x) => ({ backgroundColor: fundos.get(x) || 'rgba(0, 0, 0, 0)' }));
  const logo = { url: '/media/a/logo.png', clara: '/media/a/logo-clara.png', escura: '/media/a/logo-escura.png' };
  const pai = { parentElement: null };
  const marca = { parentElement: pai };
  fundos.set(pai, 'rgb(18, 24, 22)');
  assert.equal(logoNoFundo(logo, marca), logo.clara, 'no fundo escuro, a branca');
  fundos.set(pai, 'rgb(246, 244, 239)');
  assert.equal(logoNoFundo(logo, marca), logo.escura, 'no fundo claro, a escura');
  assert.equal(logoNoFundo({ url: logo.url }, marca), logo.url, 'sem versão, a original');
  // Escolhe só com a tela no documento (montada antes de entrar, o fundo ainda não existe).
  assert.match(src, /if \(!m\.isConnected && tentativas\+\+ < 20\) \{ setTimeout\(escolher, 100\); return; \}\s*const u = logoNoFundo\(logo, m\);/);
});
