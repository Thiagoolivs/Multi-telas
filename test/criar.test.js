/*
 * Criar em 4 passos (docs/EXECUTOR.md, item 3; PLANO §5.1).
 *
 * Conferido num celular de 360 px com uma TV pareada: Início → "Promoção com
 * preço" → frase → "Ver o rascunho" → "Publicar" = 3 toques, e a peça entra
 * na TV. Estes testes seguram as decisões que fazem isso funcionar.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const RAIZ = path.join(__dirname, '..');
const ler = (...p) => fs.readFileSync(path.join(RAIZ, ...p), 'utf8');
const soCodigo = (f) => f.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ').replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ');

test('as zonas do painel têm o MESMO formato do catálogo canônico (lateral em pé)', async () => {
  /*
   * O defeito: a cópia dos layouts no painel não tinha `formato: 'retrato'`,
   * e a peça deitada ia para a LATERAL do layout padrão — espremida ao lado
   * do relógio. Visto na TV de teste em 21/10.
   */
  const T = require('../js/templates.js');
  const S = await import(pathToFileURL(path.join(RAIZ, 'web/src/lib/screenConfig.js')).href);
  for (const l of S.LAYOUTS) {
    const c = T.LAYOUTS.find((x) => x.id === l.id);
    if (!c) continue;
    for (const z of l.zones) {
      const cz = c.zones.find((y) => y.id === z.id);
      assert.equal(z.formato || '', (cz && cz.formato) || '', l.id + '/' + z.id);
    }
  }
  const A = await import(pathToFileURL(path.join(RAIZ, 'web/src/lib/aplicarConteudo.js')).href);
  const zonas = S.zonesOf({ settings: { layoutId: 'dashboard' } }).filter((z) => z.type === 'playlist');
  const blocos = A.distribuirPorZona([{ formato: '16/9', item: { type: 'x' } }, { formato: '9/16', item: { type: 'y' } }], zonas, 0);
  assert.deepEqual(Object.keys(blocos).sort(), ['lateral', 'principal']);
  assert.equal(blocos.principal[0].type, 'x', 'a deitada vai para a principal');
  assert.equal(blocos.lateral[0].type, 'y', 'a em pé vai para a lateral');
});

test('Criar: as seis opções, a frase, o rascunho e publicar na tela já marcada', () => {
  // Desde o item 24 estes quatro passos são a Criação rápida; o Criar é a conversa (criar-chat.test.js).
  const c = soCodigo(ler('web/src/pages/CriacaoRapidaPage.jsx'));
  for (const t of ['Promoção com preço', 'Novidade', 'Aviso ou horário', 'Foto do produto', 'Aniversariantes', 'Instagram ou QR']) {
    assert.ok(c.includes("titulo: '" + t + "'"), t);
  }
  // O rascunho é o plano: nenhum crédito sai antes do "Publicar".
  assert.match(c, /ai\.directorStart\(\{ \.\.\.pedido\(\), apenasPlano: true \}\)/);
  assert.match(c, /ai\.directorStart\(\{ \.\.\.pedido\(\), planoAprovado: plano\.plano \}\)/);
  // A tela já vem marcada (todas, ou a de onde se veio).
  assert.match(c, /lista\.map\(\(t\) => t\.id\)/);
  // A Marca já sabe empresa, tom e público: o pedido não manda nada disso.
  assert.doesNotMatch(c.slice(c.indexOf('const pedido = ')), /^\s*(empresa|publico|tom):/m);
  // A origem na tela é a frase: com um nome fixo, cada criação tiraria a anterior do ar.
  // Desde o D3 o título também sobrevive a um publicar que falhou (feito.current).
  assert.match(c, /const titulo = \(feito\.current && feito\.current\.titulo\) \|\| frase\.trim\(\)\.split\('\\n'\)\[0\]\.slice\(0, 60\) \|\| op\.titulo;/);
  // Publica pelo MESMO caminho de Meus Designs.
  assert.match(c, /publicarPecas\(\{ alvos, pecas, titulo, telas \}\)/);
  assert.match(soCodigo(ler('web/src/pages/MyDesignsPage.jsx')), /await publicarPecas\(/);
});

test('o tipo do pedido vai na SEGUNDA linha: sem IA, a primeira vira o título', () => {
  const c = ler('web/src/pages/CriacaoRapidaPage.jsx');
  assert.match(c, /brief: frase\.trim\(\) \+ '\\n\(' \+ op\.pedido \+ '\)'/);
  const d = ler('server/ai-director.js');
  assert.match(d, /const titulo = String\(brief \|\| 'Sua campanha'\)\.split\(\/\[\.\\n\]\/\)\[0\]/);
});

test('uma entrada só: Criar no menu e no Início; o resto em "Mais"', () => {
  assert.match(ler('web/src/lib/menu.js'), /\{ id: 'criar', label: 'Criar', paginas: \['criar', 'campanhas', 'designs'\]/);
  const app = ler('web/src/App.jsx');
  assert.match(app, /case 'criar': return <CriarPage /);
  assert.match(app, /const ATALHOS = \['criar',/);
  assert.match(ler('web/src/pages/DashboardPage.jsx'), /<OpcoesDeCriar compacto onEscolher=\{\(opcao\) => onIr && onIr\('criar', \{ opcao \}\)\}/);
  const md = ler('web/src/pages/MyDesignsPage.jsx');
  /*
   * Dois jeitos de criar, e não cinco (EXECUTOR D2, "tirar coisas que
   * confundam"): com a IA ou na mão. Gerar só uma imagem e importar do Canva
   * ficam como atalhos embaixo do "na mão"; nada sumiu.
   */
  for (const t of ['Criar com a IA', 'Criar na mão', 'Gerar só uma imagem', 'Importar do Canva']) assert.ok(md.includes(t), t);
  assert.ok(!/const MAIS = \[/.test(md), 'voltou o menu "Mais" com cinco jeitos de criar');
  // Um caminho de IA só (item 28): a campanha pela IA é o Criar.
  assert.ok(!md.includes("title: 'Campanha completa com IA'"), 'a campanha antiga voltou');
  // A tela recebe e organiza: "Criar com IA" é a primeira entrada do Adicionar conteúdo.
  assert.match(ler('web/src/components/content/TypePicker.jsx'), /\{ id: 'criar', label: 'Criar com IA'/);
  // Desde o item 32 o Criar da TV leva também a zona.
  assert.match(app, /onCriar=\{\(zona\) => go\('criar', \{ tela: route\.device && route\.device\.id, zona: typeof zona === 'string' \? zona : undefined \}\)\}/);
});

test('foto do produto: só vale imagem base DESTA conta, e entra em todas as peças', async () => {
  const s = ler('server.js');
  assert.match(s, /fotoDoPedido: \(b && typeof b\.fotoProduto === 'string' && marca\s+&& marca\.bases\.some\(\(x\) => x\.url === b\.fotoProduto\)\)/);
  const director = require('../server/ai-director.js');
  const foto = '/media/t1/produto.jpg';
  const r = await director.dirigir('bolo de cenoura', {
    empresa: 'Padaria', motorHtml: true, fotoDoPedido: foto,
    marca: { cores: ['#6b3a1e', '#e8b04b'], bases: [{ url: foto, label: 'bolo' }] },
    planoAprovado: { identidade: { brand: '#6b3a1e', brand2: '#e8b04b' }, pecas: [{ formato: '16/9', headline: 'Bolo de cenoura', precisaImagem: true, promptImagem: 'bolo' }] },
  }, { pararNoPlano: true });
  assert.equal(r.plano.pecas[0].bgImagem, foto);
  assert.equal(r.plano.pecas[0].precisaImagem, false, 'foto real dispensa a gerada');
  assert.equal(r.orcamento.creditos, 0);
  // Endereço que não é base da conta é ignorado.
  const r2 = await director.dirigir('x', { empresa: 'P', fotoDoPedido: '/media/outra/x.jpg', marca: { bases: [] },
    planoAprovado: { identidade: { brand: '#123456' }, pecas: [{ formato: '16/9', headline: 'X' }] } }, { pararNoPlano: true });
  assert.equal(r2.plano.pecas[0].bgImagem, '');
});
