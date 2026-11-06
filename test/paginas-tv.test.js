/*
 * A lista que não cabe na TV vai em PÁGINAS, com a letra inteira.
 *
 *   1. A tabela de preços (tipo precos) na coluna lateral: nove itens só
 *      cabiam encolhidos a 2,8% do lado menor (a régua é 4,5% no balcão).
 *      Agora a TV divide a lista em páginas que cabem e vira a página
 *      sozinha (js/player.js, paginarPrecos). O desenho de verdade quem
 *      confere é a régua (tools/regua-tv.mjs, "Lateral").
 *   2. O cardápio pronto (cardapio-colunas, cardapio-categorias) com a
 *      planilha maior que ele: o sétimo item sumia sem aviso. Agora a peça
 *      vira a página com os próximos (js/precos.js, paginasDaPeca;
 *      js/render.js, paginarPeca).
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const RAIZ = path.join(__dirname, '..');
const ler = (f) => fs.readFileSync(path.join(RAIZ, f), 'utf8');
const M = require('../js/precos.js');
const camposDe = (id) => [...ler('pecas-ouro/' + id + '.html').matchAll(/data-campo="([\w-]+)"/g)].map((m) => m[1]);
const itens = (n, secao) => Array.from({ length: n }, (_, i) => ({ item: (secao || 'Item') + ' ' + (i + 1), preco: 5 + i, secao: secao || '' }));
const nomesNaPagina = (p) => Object.keys(p.campos).filter((k) => /^item\d+-nome$/.test(k) && p.campos[k]).sort((a, b) => parseInt(a.slice(4), 10) - parseInt(b.slice(4), 10)).map((k) => p.campos[k]);

test('a planilha de doze itens no cardápio de seis: duas páginas, nenhum item perdido', () => {
  const nomes = camposDe('cardapio-colunas');
  const paginas = M.paginasDaPeca(nomes, itens(12));
  assert.equal(paginas.length, 2);
  assert.deepEqual(paginas.map(nomesNaPagina).flat(), itens(12).map((i) => i.item), 'cada item da planilha aparece uma vez, na ordem');
  assert.deepEqual(paginas[1].vazias, [], 'a segunda página também cheia');
  // Equilibradas: sete itens em seis lugares são 4 + 3, não 6 + 1 (um item sozinho na tela parece erro).
  assert.deepEqual(M.paginasDaPeca(nomes, itens(7)).map((p) => nomesNaPagina(p).length), [4, 3]);
  assert.deepEqual(M.paginasDaPeca(nomes, itens(13)).map((p) => nomesNaPagina(p).length), [5, 4, 4]);
  // O que cabe numa tela é uma página só, igual ao camposDaPeca de antes.
  assert.equal(M.paginasDaPeca(nomes, itens(6)).length, 1);
  assert.deepEqual(M.paginasDaPeca(nomes, itens(4))[0], M.camposDaPeca(nomes, itens(4)));
  // Uma seção só (planilhaSecao): as páginas são dela.
  const duas = [].concat(itens(8, 'Bebidas'), itens(3, 'Doces'));
  assert.deepEqual(M.paginasDaPeca(nomes, duas, 'bebidas').map(nomesNaPagina).flat(), itens(8, 'Bebidas').map((i) => i.item));
  // Teto: no máximo 10 páginas.
  assert.equal(M.paginasDaPeca(nomes, itens(200)).length, 10);
});

test('o cardápio por seção: cada grupo fica com a mesma seção em todas as páginas, e a seção que sobra continua no lugar dela', () => {
  const nomes = camposDe('cardapio-categorias');
  const grupo = (p, g) => p.campos['grupo' + g] + ': ' + [1, 2, 3].map((k) => p.campos['g' + g + '-item' + k]).filter(Boolean).join(', ');
  const pags = M.paginasDaPeca(nomes, [].concat(itens(4, 'Pães'), itens(4, 'Doces'), itens(4, 'Bebidas')));
  assert.deepEqual(pags.map((p) => [1, 2, 3].map((g) => grupo(p, g))), [
    ['Pães: Pães 1, Pães 2', 'Doces: Doces 1, Doces 2', 'Bebidas: Bebidas 1, Bebidas 2'],
    ['Pães: Pães 3, Pães 4', 'Doces: Doces 3, Doces 4', 'Bebidas: Bebidas 3, Bebidas 4'],
  ]);
  // Mais seções que grupos: as que não cabem vão para as páginas seguintes; o grupo sem seção some.
  const cinco = M.paginasDaPeca(nomes, [].concat(itens(2, 'A'), itens(2, 'B'), itens(2, 'C'), itens(2, 'D')));
  assert.deepEqual(cinco.map((p) => p.campos.grupo1 + p.campos.grupo2 + p.campos.grupo3), ['ABC', 'D']);
  assert.ok(cinco[1].esconder.includes('grupo2') && cinco[1].vazias.includes('g3-item1'));
});

test('a TV vira a página da peça da planilha e pede à zona o tempo de todas', () => {
  const R = ler('js/render.js');
  assert.match(R, /P\.paginasDaPeca\(nomes, pl\.itens, item\.planilhaSecao\)/);
  assert.match(R, /function paginarPeca\(el, host, paginas, primeira\)/);
  // Cada página fica o tempo do item (o que a zona marcou no slide), e a zona espera todas.
  assert.match(R, /Number\(el\.getAttribute\('data-mt-dur'\)\)/);
  assert.match(R, /new CustomEvent\('mt:paginas', \{ detail: \{ paginas: paginas\.length, segundos: dur \* paginas\.length \} \}\)/);
  // A página que sai da tela para de virar; o onLeave para o relógio das páginas e a peça no ar.
  assert.match(R, /if \(!el\.isConnected\) \{ parar\(\); return; \}/);
  assert.match(R, /const parar = \(\) => \{ clearInterval\(timer\); clearTimeout\(partida\); timer = null; if \(noAr\) noAr\.parar\(\); \};/);
  assert.match(R, /if \(virar\) return \{ el, duration: ctl\.duracao, onLeave: virar\.parar \};/);
  // A página seguinte troca a peça no ar: a de antes para (relógio, observador) antes da nova entrar.
  assert.match(R, /noAr\.parar\(\);\n\s+noAr = global\.MTPecaRender\.montar\(host, paginas\[atual\]\.item, opcoesDaPeca\(\)\);/);
  assert.match(ler('css/player.css'), /\.mt-peca-paginas \{/);
});

test('a tabela de preços que não cabe com a letra mínima vai em páginas, antes de encolher', () => {
  const P = ler('js/player.js');
  const corpo = P.slice(P.indexOf('function caberNaCaixa'), P.indexOf('function enterSlide'));
  // A ordem dos passos: a página vem depois do apoio e antes de a caixa toda encolher.
  const ordem = ["e.style.display = 'none'", 'paginarPrecos(slide, miolo, precos', "'scale('"];
  let antes = -1;
  for (const passo of ordem) {
    const i = corpo.indexOf(passo, antes + 1);
    assert.ok(i > antes, 'na ordem: ' + passo);
    antes = i;
  }
  // A coluna a mais não quebra o nome no meio: mais estreita que nove letras do piso, vale a página.
  assert.match(corpo, /\/ c < piso \* 9\) break;/);
  // A página que começa no meio de uma seção repete o nome dela; a seção não fica sozinha no pé.
  assert.match(corpo, /const cab = ehSecao\(linhas\[ini\]\) \? -1 : secaoAntes\(ini\);/);
  assert.match(corpo, /while \(fim - ini > 1 && fim < linhas\.length && ehSecao\(linhas\[fim - 1\]\)\) fim--;/);
  // Cada página fica no mínimo 8 s, e a zona deixa o item no ar o tempo de todas.
  assert.match(corpo, /const PRECOS_PAGINA_MIN_S = 8;/);
  assert.match(P, /rendered\.el\.setAttribute\('data-mt-dur', String\(dur\)\)/);
  assert.match(P, /rendered\.el\.addEventListener\('mt:paginas', \(e\) => \{/);
  // A medida de novo (a fonte chegou) desfaz as páginas antes de medir.
  assert.match(corpo, /if \(precos\) desfazerPaginas\(slide, miolo, precos\);/);
  const css = ler('css/player.css');
  assert.match(css, /\.mt-precos-lista > \[data-mt-fora\] \{ display: none; \}/);
  // Na coluna estreita o preço desce para a linha de baixo em vez de o nome hifenizar.
  assert.match(css, /@container \(max-width: 640px\) \{\n  \.mt-precos-linha \{ flex-wrap: wrap; row-gap: 0; \}/);
});
