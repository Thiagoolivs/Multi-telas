/*
 * Fase 3 do plano de ação (docs/qa-total/PLANO-DE-ACAO.md): zonas que se adaptam.
 *
 * A letra mínima vale em toda zona, no tamanho do local da TV; a zona vazia
 * some; a marca aparece uma vez. O robô (tools/regua-tv.mjs, no CI) mede a
 * lateral e o bloco nas TVs de verdade; aqui ficam as garantias sem navegador.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const RAIZ = path.join(__dirname, '..');
const ler = (f) => fs.readFileSync(path.join(RAIZ, f), 'utf8');
const T = require('../js/templates.js');

const juntar = (id, vazias) => T.juntarZonasVazias(T.getLayout(id), vazias);

test('a zona vazia some: a vizinha com conteúdo ocupa o lugar dela', () => {
  const lat = juntar('corporate', ['lateral']);
  assert.deepEqual(lat.grid.areas, ['cabecalho cabecalho', 'principal principal', 'rodape rodape'], 'a lateral vazia vira principal');
  assert.deepEqual(lat.zones.map((z) => z.id), ['cabecalho', 'principal', 'rodape']);
  const rod = juntar('corporate', ['rodape']);
  assert.deepEqual(rod.grid.areas, ['cabecalho cabecalho', 'principal lateral'], 'o rodapé sem mensagem sai com a linha dele');
  assert.equal(rod.grid.rows, '12vh 1fr');
  const duo = juntar('duo', ['secundaria']);
  assert.deepEqual(duo.grid.areas, ['principal']);
  assert.equal(duo.grid.columns, '1fr', 'a coluna da metade vazia sai');
  assert.deepEqual(juntar('portrait-duo', ['secundaria', 'rodape']).grid.areas, ['principal']);
  // A principal vazia com a lateral cheia: a lateral cresce.
  assert.deepEqual(juntar('corporate', ['principal']).grid.areas, ['cabecalho cabecalho', 'lateral lateral', 'rodape rodape']);
});

test('sem nenhuma playlist com conteúdo, e o cabeçalho, nada muda', () => {
  const l = T.getLayout('corporate');
  assert.equal(T.juntarZonasVazias(l, ['principal', 'lateral']), l, 'a tela inteira espera, com a marca');
  assert.equal(T.juntarZonasVazias(l, ['cabecalho']), l, 'o cabeçalho nunca sai');
  assert.equal(T.juntarZonasVazias(l, []), l);
});

test('a TV usa o layout com as zonas vazias juntadas, e o rodapé sem mensagem só sai com cabeçalho', () => {
  const P = ler('js/player.js');
  assert.match(P, /function layoutDaTela\(cfg\)/);
  assert.match(P, /return z\.type === 'ticker' && comCabecalho && rodapeEsperando\(d\);/, 'sem cabeçalho, o rodapé é o lugar da marca');
  assert.match(P, /if \(z\.type === 'playlist'\) return !\(d\.items \|\| \[\]\)\.some\(\(it\) => it && !ehExemplo\(it\)\) && !automaticosDaZona\(cfg, z\.id\);/);
  assert.match(P, /function buildStage\(cfg\) \{\n    const layout = layoutDaTela\(cfg\);/);
  assert.match(P, /function assinaturaPalco\(cfg\) \{\n    const l = layoutDaTela\(cfg\);/, 'zona que ganha conteúdo refaz o palco');
});

test('a letra mínima é a do local da TV: balcão 4,5%, recepção 3,5%, escritório 3%', () => {
  const P = ler('js/player.js');
  assert.match(P, /const LOCAIS = \{ balcao: 0\.045, recepcao: 0\.035, escritorio: 0\.03 \};/);
  assert.match(P, /const LOCAL_DA_FRENTE = \{ comercio: 'balcao', saude: 'recepcao', empresa: 'escritorio' \};/);
  assert.match(P, /document\.documentElement\.style\.setProperty\('--mt-piso-tv', String\(LOCAIS\[local\]\)\);/);
  assert.match(ler('css/player.css'), /\.mt-zone > \* \{ --mt-piso: calc\(var\(--mt-piso-tv, \.045\) \* 100vmin\); \}/);
  // A peça: na TV, piso em toda zona, com a fração do local.
  const PR = ler('js/peca-render.js');
  assert.match(PR, /getPropertyValue\('--mt-piso-tv'\)/);
  assert.match(PR, /if \(!naTv && !grande && !doLocal\)/);
  // O servidor manda a frente para a TV; o painel escolhe o local; a programação guarda só os três.
  assert.match(ler('server/routes/telas.js'), /if \(frente\) \{ c\.settings\.frente = frente; mudou = true; \}/);
  const S = require('../js/storage.js');
  assert.equal(S.normalize({ settings: { local: 'escritorio' } }).settings.local, 'escritorio');
  assert.equal(S.normalize({ settings: { local: 'praia' } }).settings.local, '');
  const F = ler('web/src/components/content/SettingsForm.jsx');
  assert.match(F, /label="Onde fica a TV\?"/);
  assert.match(F, /local === 'balcao' && temLateral/, 'no balcão, a lateral pede outro layout');
});

test('na zona pequena o apoio sai por nível antes de a letra encolher', () => {
  const P = ler('js/player.js');
  assert.match(P, /\.sort\(\(a, b\) => a - b\);/);
  const R = ler('js/render.js');
  assert.match(R, /iconBox\.setAttribute\('data-mt-apoio', '1'\)/);
  assert.match(R, /meta\.setAttribute\('data-mt-apoio', '2'\)/);
});

test('o robô mede a lateral e o bloco nos layouts que cada TV oferece, e a meta de 85% bloqueia', () => {
  const robo = ler('tools/regua-tv.mjs');
  assert.match(robo, /\[\{ deitada: 'corporate' \}, 'lateral', 'Lateral', false\]/);
  assert.match(robo, /\[\{ deitada: 'duo', 'em pé': 'portrait-duo' \}, 'secundaria', 'Bloco', false\]/);
  assert.match(robo, /const META_ZONAS = 0\.85;/);
  assert.match(robo, /const PISO_DA_FRENTE = \{ comercio: 4\.5, saude: 3\.5, empresa: 3 \};/);
  assert.match(robo, /conferirPecas\(navegador, 'escritorio'\)/, 'as peças da lateral também');
});

test('as peças-ouro da lateral cabem com a letra do balcão, e o robô bloqueia a que ceder', () => {
  const robo = ler('tools/regua-tv.mjs');
  // A lateral no balcão (4,5%), peça a peça: uma que ceder reprova, como na tela cheia.
  assert.match(robo, /conferirPecas\(navegador, 'balcao', \[LATERAL_NO_BALCAO, DESTAQUE_NO_BALCAO\]\)/);
  assert.match(robo, /const LATERAL_NO_BALCAO = 'Lateral · Corporativo';/);
  assert.match(robo, /for \(const x of noBalcao\.filter\(\(y\) => y\.cedeu < 1\)\) \{ console\.log\('  ✗ ' \+ x\.id \+ ': o piso cedeu para ' \+ Math\.round\(x\.cedeu \* 100\) \+ '%'\); reprova = true; \}/);
  // A conta do escritório continua só com o escritório (a do balcão não entra nela).
  assert.match(robo, /pecas\.filter\(\(x\) => x\.zona === zona && x\.local === 'escritorio'\)/);
  // As duas da semana (lote 3) trocaram a etiqueta em cima do dia por uma na linha dele.
  assert.match(ler('pecas-ouro/cardapio-semana.html'), /\.dia \{ display: inline; min-width: 0;/);
  assert.match(ler('pecas-ouro/servico-semana.html'), /\.folha \{ display: inline-flex; flex-direction: row;/);
});

test('as peças-ouro do destaque cabem com a letra do balcão na principal do Corporativo, e o robô bloqueia a que ceder', () => {
  const robo = ler('tools/regua-tv.mjs');
  // O destaque do Corporativo no balcão (4,5%), na mesma passada da lateral: peça a peça, uma que ceder reprova.
  assert.match(robo, /const DESTAQUE_NO_BALCAO = 'Destaque · Corporativo';/);
  assert.match(robo, /for \(const \[zona, nome\] of \[\[LATERAL_NO_BALCAO, 'Lateral'\], \[DESTAQUE_NO_BALCAO, 'Destaque'\]\]\) \{/);
  assert.match(robo, /console\.log\('Peças-ouro em ' \+ nome \+ ' · balcão \(' \+ PISO \+ '%\): '/);
  // O redesenho mora só na regra da principal do Corporativo (altura de 600 a 860 px):
  // a tela cheia, a em pé, a quadrada e a lateral não mudam.
  const REGRA = '@container (aspect-ratio >= 1.25) and (min-height: 600px) and (max-height: 860px)';
  for (const id of ['oferta-foto', 'oferta-lista', 'cardapio-colunas', 'oferta-selo', 'oferta-parcelado', 'cardapio-categorias',
    'gente-boas-vindas', 'gente-vaga', 'gente-comunicado', 'cardapio-dia-foto', 'servico-comunicado', 'social-avaliacao', 'lateral-prazo',
    'institucional-valores']) {
    assert.ok(ler('pecas-ouro/' + id + '.html').includes(REGRA), id + ': a regra da principal do Corporativo');
  }
  // Na TV a principal tem 1379×784 (proporção 1,76): as peças que a achavam pela proporção (até 1,74) a acham também pela altura.
  const NA_TV = '@container (aspect-ratio >= 1.74) and (min-height: 600px) and (max-height: 860px)';
  for (const id of ['servico-passos', 'social-mural', 'social-data']) assert.ok(ler('pecas-ouro/' + id + '.html').includes(NA_TV), id + ': a principal do Corporativo da TV');
  // O preço que não cabe ao lado do nome desce para a linha da medida; os talheres não crescem com a letra.
  assert.match(ler('pecas-ouro/cardapio-colunas.html'), /\.valor \{ grid-column: 3; grid-row: 2; \}/);
  assert.match(ler('pecas-ouro/cardapio-dia-foto.html'), /\.talher \{ font-size: 1cqw; \}/);
});
