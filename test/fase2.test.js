/*
 * Fase 2 do plano de ação (docs/qa-total/PLANO-DE-ACAO.md): a régua no código.
 *
 * A letra da TV passa a ser de TV: 4,5% do lado menor da tela, o que se lê
 * a 4 m. O robô com navegador (tools/regua-tv.mjs, `npm run regua`, job
 * próprio no CI) mede a TV de verdade; aqui ficam as garantias que não
 * precisam de navegador.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const RAIZ = path.join(__dirname, '..');
const ler = (f) => fs.readFileSync(path.join(RAIZ, f), 'utf8');
const R = require('../js/regras-composicao.js');
const compositor = require('../server/compositor');

test('o piso da TV liga só na zona grande, e vale 4,5% do lado menor da tela', () => {
  const css = ler('css/player.css');
  assert.match(css, /\.mt-zone \{ --mt-piso: 0px; \}/, 'zona pequena sem piso: a régua dela é a da fase 3');
  assert.match(css, /@container \(min-width: 880px\) and \(min-height: 540px\) \{\s*\.mt-zone > \* \{ --mt-piso: 4\.5vmin; \}/);
  assert.equal(R.REGRAS.pisoDaTv, 0.045);
});

test('nenhuma letra do player num teto em pixel: cada tamanho de texto da zona tem o piso', () => {
  const css = ler('css/player.css');
  // Os tipos de conteúdo que a régua mede: o tamanho final (a última declaração) tem o piso.
  for (const sel of ['.mt-text-title', '.mt-text-body', '.ann-title', '.ann-body', '.ann-kicker', '.ann-meta',
    '.mt-precos-titulo', '.mt-precos-secao', '.mt-birthday-row', '.mt-ticker-item', '.mt-clock-date']) {
    const regras = [...css.matchAll(new RegExp('(?:^|\\n)\\s*' + sel.replace(/\./g, '\\.') + '\\s*\\{([^}]*)\\}', 'g'))].map((m) => m[1]);
    assert.ok(regras.length, sel + ' existe');
    const tamanhos = regras.join(';').match(/font-size:[^;]+/g) || [];
    assert.ok(tamanhos.length, sel + ' tem tamanho');
    assert.match(tamanhos[tamanhos.length - 1], /var\(--mt-piso/, sel + ': ' + tamanhos[tamanhos.length - 1]);
  }
  // A lista de preços vem do JS (--corpo): o piso fica por cima dela, inclusive em pé e no rodapé.
  assert.match(css, /font-size: max\(var\(--mt-piso, 0px\), var\(--corpo\)\)/);
  assert.match(css, /font-size: max\(var\(--mt-piso, 0px\), var\(--corpo-pe\)\)/);
  assert.match(css, /font-size: max\(var\(--mt-piso, 0px\), calc\(var\(--corpo\) \* \.75\)\)/);
  // A tela inteira (aviso urgente, fora do horário, TV pausada) segue a régua sem zona.
  assert.match(css, /\.mt-takeover-alert \{[^}]*font-size: 4\.5vmin/);
  assert.match(css, /\.mt-fora-dia \{[^}]*font-size: 4\.5vmin/);
});

test('a TV só encolhe o que não cabe, e a letra grande cede antes da pequena', () => {
  const P = ler('js/player.js');
  assert.doesNotMatch(P, /Math\.min\(1, altura \/ h, largura \/ w\) \* 0\.97/, 'encolher sempre 3% punha a letra mínima abaixo do piso');
  assert.match(P, /if \(esc >= 1\) return;/);
  // A ordem: o respiro aperta, mais uma coluna no preço, o título desce até 1,6× o piso, o ícone sai — e só então a caixa toda.
  const corpo = P.slice(P.indexOf('function caberNaCaixa'), P.indexOf('function enterSlide'));
  const ordem = ["slide.classList.add('mt-compacto')", 'lista.style.columnCount = String(c)', 'piso * 1.6', "[data-mt-apoio]').forEach((e) => { e.style.display = 'none'", "'scale('"];
  let antes = -1;
  for (const passo of ordem) {
    const i = corpo.indexOf(passo, antes + 1);
    assert.ok(i > antes, 'na ordem: ' + passo);
    antes = i;
  }
  const render = ler('js/render.js');
  assert.match(render, /iconBox\.setAttribute\('data-mt-apoio', ''\)/, 'o ícone do aviso é apoio');
  assert.match(render, /el\.setAttribute\('data-mt-colunas-auto', ''\)/, 'só a lista no automático ganha coluna');
});

test('a peça da IA ganha o piso na TV: o player aplica em qualquer peça, a IA não precisa escrever', () => {
  const PR = ler('js/peca-render.js');
  assert.match(PR, /function aplicarPiso\(/);
  assert.match(PR, /function pisoDaZona\(/);
  assert.ok(ler('js/peca-html.js').includes("'--mt-piso'"), 'a porta aceita o piso que as peças-ouro usam');
  // O piso nunca quebra a peça: sem caber inteiro, entra o maior que cabe, e a peça fica marcada.
  assert.match(PR, /function pisoQueCabe\(palco, piso\)/);
  assert.match(PR, /if \(!piorou\(antes, encaixe\(palco\)\)\) return piso;/);
  assert.match(PR, /palco\.setAttribute\('data-mt-piso-cedeu'/);
  assert.match(PR, /pisoQueCabe\(palco, pisoDaZona\(host, k, ref\)\)/);
});

test('a biblioteca-ouro vai para a IA sem o envoltório do piso: o mesmo exemplo, sem pagar por ele', () => {
  assert.equal(compositor.semPiso('font-size: max(var(--mt-piso, 0cqw), 3.4cqw);'), 'font-size: 3.4cqw;');
  assert.equal(compositor.semPiso('font: 700 max(var(--mt-piso, 0cqw), min(4cqw, 6cqh))/1 x;'), 'font: 700 min(4cqw, 6cqh)/1 x;', 'parêntese dentro do valor');
  assert.equal(compositor.semPiso('a max(var(--mt-piso, 0cqw), 2cqw) b max(var(--mt-piso, 0cqw), 3cqw)'), 'a 2cqw b 3cqw');
  assert.equal(compositor.semPiso('max(var(--mt-piso, 0cqw), min(1cqw'), 'max(var(--mt-piso, 0cqw), min(1cqw', 'sem par, fica como está');
  for (const papel of ['destaque', 'lateral', 'cabecalho', 'rodape']) {
    assert.doesNotMatch(compositor.fixo(papel), /--mt-piso/, papel);
  }
});

test('a régua da IA é a da TV: 48 px no destaque, também no kicker', () => {
  assert.equal(R.letraMinDe('destaque'), 48);
  assert.match(R.paraIA('destaque'), /Letra mínima: 3\.4cqw \(48px na TV\), também no kicker/);
  assert.doesNotMatch(ler('server/compositor.js'), /kicker pequeno/i, 'a IA não pede mais letra pequena');
});

test('o robô da régua roda no CI, num job à parte, e guarda as fotos', () => {
  const ci = ler('.github/workflows/ci.yml');
  assert.match(ci, /regua-tv:/);
  assert.match(ci, /playwright@\d+\.\d+\.\d+/, 'versão fixa do navegador');
  assert.match(ci, /npm run regua/);
  assert.match(ler('package.json'), /"regua": "node tools\/regua-tv\.mjs"/);
  const robo = ler('tools/regua-tv.mjs');
  assert.match(robo, /const PISO = 4\.5;/);
  assert.match(robo, /\['full', 'principal', true\]/, 'tela cheia bloqueia');
});
