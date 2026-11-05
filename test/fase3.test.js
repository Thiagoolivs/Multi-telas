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
