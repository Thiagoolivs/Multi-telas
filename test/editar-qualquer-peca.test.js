/*
 * Editar qualquer peça (EXECUTOR D19).
 *
 * O dono: "trocar fonte, cor e tela de peça feita pela IA" e "trocar
 * elementos e a visualização no geral também". O editor de peça ganhou
 * Cor e fonte, Elementos (mostrar/esconder) e Desenho (a mesma mensagem em
 * outra peça da família) — sem IA, sem crédito. O que se esconde precisa
 * sumir igual na TV e no painel, então mora no desenhista e na porta.
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const RAIZ = path.join(__dirname, '..');
const ler = (...p) => fs.readFileSync(path.join(RAIZ, ...p), 'utf8');
const P = require('../js/peca-html.js');
const oferta = P.doArquivo(ler('pecas-ouro', 'oferta-foto.html'));

test('a porta guarda os elementos escondidos (só campos de texto/QR que a peça declara) e a peça de origem', () => {
  const v = P.validarItem({
    type: 'peca-html', html: oferta.html, css: oferta.css,
    ocultos: ['kicker', 'cta', 'kicker', 'foto', 'inventado', '"><script>'],
    origem: { motor: 'ouro', base: 'oferta-foto' },
  });
  assert.equal(v.ok, true, v.problemas.join('; '));
  assert.deepEqual(v.item.ocultos, ['kicker', 'cta'], 'foto (imagem), nome inventado e lixo não entram');
  assert.equal(v.item.origem.base, 'oferta-foto', 'sem a origem, o editor não sabe a família para oferecer outros desenhos');
  const semNada = P.validarItem({ type: 'peca-html', html: oferta.html, css: oferta.css, origem: { base: '../x' } });
  assert.equal(semNada.item.ocultos, undefined);
  assert.equal(semNada.item.origem.base, undefined);
});

test('o desenhista esconde o elemento e o enfeite que só existe por causa dele, igual na TV e no painel', () => {
  const r = ler('js/peca-render.js');
  assert.match(r, /'\.mt-peca \[data-oculto\]\{display:none!important\}'/);
  assert.match(r, /\(it\.ocultos \|\| \[\]\)\.forEach\(\(n\) => \{\s*sombra\.querySelectorAll\('\[data-campo="' \+ n \+ '"\]'\)\.forEach\(\(el\) => esconder\(el, peca\)\);/);
  // O QR escondido leva junto o que aponta para ele, como o QR sem link (reteste 3).
  assert.match(r, /sombra\.querySelectorAll\('img\[data-campo-qr="' \+ n \+ '"\]'\)\.forEach\(\(el\) => qrSemLink\(sombra, peca, el\)\);/);
  // O traço antes da chamada ("— FUNCIONAMENTO") é um <i aria-hidden> irmão: sobe para o pai que só tem o elemento e enfeites.
  assert.match(r, /const so = Array\.prototype\.every\.call\(pai\.children, \(c\) => c === alvo \|\| c\.getAttribute\('aria-hidden'\) === 'true'\);/);
  // A TV antiga não conhece spread de objeto: os arquivos que ela carrega não usam.
  for (const f of ['js/peca-html.js', 'js/peca-render.js']) assert.ok(!/\{\s*\.\.\./.test(ler(f)) && !/, \.\.\.[a-z]/.test(ler(f)), f + ' com spread de objeto');
});

test('o editor: quatro abas, cor (da marca, sugerida ou à mão), fonte dos títulos e dos textos', () => {
  const e = ler('web/src/components/content/EditarPeca.jsx');
  assert.match(e, /const ABAS = \[\['textos', 'Textos'\], \['visual', 'Cor e fonte'\], \['elementos', 'Elementos'\], \['desenho', 'Desenho'\]\];/);
  assert.match(e, /const trocarCores = \(cores\) => setMarca\(\{ \.\.\.marcaBase\(\), cores: cores\.filter\(corValida\)\.slice\(0, 3\) \}\);/);
  assert.match(e, /<input type="color"/);
  assert.match(e, /\[\['fonteTitulo', 'Fonte dos títulos'\], \['fonteApoio', 'Fonte dos textos'\]\]/);
  // Sem marca nenhuma (peça antiga), parte da marca da conta: a porta só aceita marca com cor.
  assert.match(e, /const marcaBase = \(\) => marca \|\| \(daConta && daConta\.marca\) \|\|/);
});

test('elementos: dá para esconder qualquer texto, menos o último que sobrou', () => {
  const e = ler('web/src/components/content/EditarPeca.jsx');
  assert.match(e, /const ultimo = mostra && visiveis\.length <= 1;/);
  assert.match(e, /\.\.\.\(ocultos\.length \? \{ ocultos \} : \{\}\)/);
});

test('desenho: a mesma mensagem em outra peça do mesmo lugar, com os textos que a pessoa VÊ', () => {
  const e = ler('web/src/components/content/EditarPeca.jsx');
  // O texto do exemplo também conta (a peça pronta chega só com a marca nos campos) — menos o nome da empresa de exemplo.
  assert.match(e, /textos\.filter\(\(c\) => c\.nome !== 'marca'\)\.map\(\(c\) => \[c\.nome, c\.exemplo\]\)/);
  // Só os campos que o desenho novo declara (a porta recusaria os outros), e o nome da conta onde ele escreve a marca.
  // Reteste 4: o campo que só o desenho novo tem nasce com o texto da frente da conta, sem a empresa de exemplo.
  assert.match(e, /const novo = \{ \.\.\.base, \.\.\.Object\.fromEntries\(Object\.entries\(efetivos\)\.filter\(\(\[k\]\) => nomes\.has\(k\)\)\) \};/);
  assert.match(e, /pecaDoProntos\(m, contaPronta, perfil\.id, exemplos\)\.campos/);
  assert.match(e, /if \(nomes\.has\('marca'\) && !novo\.marca && daConta && daConta\.nome\) novo\.marca = daConta\.nome;/);
  assert.match(e, /\(m\.papeis \|\| \[\]\)\.includes\(papel\)/, 'desenho de outro lugar (faixa no lugar do destaque) não pode aparecer');
  assert.match(e, /setDesenho\(\{ html: m\.arq\.html, css: m\.arq\.css, base: m\.id \}\);/);
});

test('o player recebe a versão nova do desenhista (cache da TV trocado)', () => {
  assert.ok(Number((/const SHELL_CACHE = 'mt-shell-v(\d+)';/.exec(ler('sw.js')) || [])[1]) >= 49, 'o desenhista mudou e a TV não baixa de novo');
});

test('revisão do #240: o campo escondido vai VAZIO para a TV (a antiga não conhece ocultos), e o texto volta ao mostrar', () => {
  const v = P.validarItem({
    type: 'peca-html', html: oferta.html, css: oferta.css,
    campos: { kicker: '' }, ocultos: ['kicker'], guardados: { kicker: 'Só esta semana', titulo: 'não está escondido', foto: '/media/x.jpg' },
  });
  assert.deepEqual(v.item.guardados, { kicker: 'Só esta semana' }, 'guardou campo que não está escondido (ou imagem)');
  assert.equal(P.validarItem({ type: 'peca-html', html: oferta.html, css: oferta.css, guardados: { kicker: 'x' } }).item.guardados, undefined);
  const e = ler('web/src/components/content/EditarPeca.jsx');
  assert.match(e, /ocultos\.forEach\(\(n\) => \{ if \(gravados\[n\]\) guardados\[n\] = gravados\[n\]; gravados\[n\] = ''; \}\);/);
  assert.match(e, /useState\(\(\) => \(\{ \.\.\.\(item\.campos \|\| \{\}\), \.\.\.\(item\.guardados \|\| \{\}\) \}\)\)/);
  assert.ok(!/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(ler('js/peca-html.js')), 'caractere de controle literal no código da porta');
});

test('o nome de cada campo, com acento: "Rótulo", não "Rotulo" (reteste 4)', () => {
  const e = ler('web/src/components/content/EditarPeca.jsx');
  // A função de verdade, tirada do arquivo e rodada aqui (o JSX não carrega no Node).
  const ini = e.indexOf('const ROTULO = {');
  const fim = e.indexOf('\n}\n', e.indexOf('export function rotulo(')) + 2;
  const rotulo = new Function(e.slice(ini, fim).replace('export function rotulo', 'function rotulo') + '\nreturn rotulo;')();
  assert.equal(rotulo('rotulo'), 'Rótulo');
  assert.equal(rotulo('funcao'), 'Função');
  assert.equal(rotulo('numero'), 'Número');
  assert.equal(rotulo('preco-rotulo'), 'Preço rótulo');
  assert.equal(rotulo('item1-preco'), 'Item 1 · preço');
  assert.equal(rotulo('epi'), 'EPI');
  assert.equal(rotulo('titulo'), 'Título', 'o mapa de sempre continua valendo');
  assert.equal(rotulo('assunto'), 'Assunto');
  // Todo campo das peças-ouro sai sem palavra conhecida sem acento.
  const campos = new Set();
  for (const f of fs.readdirSync(path.join(RAIZ, 'pecas-ouro')).filter((x) => x.endsWith('.html'))) {
    for (const m of ler('pecas-ouro', f).matchAll(/data-campo="([^"]+)"/g)) campos.add(m[1]);
  }
  const semAcento = /\b(rotulo|funcao|numero|instrucao|mes|tendencia|periodo|horario|edicao|citacao|descricao|preco)\b/i;
  for (const c of campos) assert.doesNotMatch(rotulo(c), semAcento, c + ' → ' + rotulo(c));
});
