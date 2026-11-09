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
// A condição de um @container, sozinha ou como o primeiro lado de um "or".
const temRegra = (css, cond) => css.includes('@container ' + cond + ' {') || css.includes('@container (' + cond + ') or ');
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
  // (A regra pode vir com a faixa do Corporativo sem rodapé ao lado, num "or": o mesmo desenho, mais alto.)
  const REGRA = '(aspect-ratio >= 1.25) and (min-height: 600px) and (max-height: 860px)';
  for (const id of ['oferta-foto', 'oferta-lista', 'cardapio-colunas', 'oferta-selo', 'oferta-parcelado', 'cardapio-categorias',
    'gente-boas-vindas', 'gente-vaga', 'gente-comunicado', 'cardapio-dia-foto', 'servico-comunicado', 'social-avaliacao', 'lateral-prazo',
    'institucional-valores']) {
    assert.ok(temRegra(ler('pecas-ouro/' + id + '.html'), REGRA), id + ': a regra da principal do Corporativo');
  }
  // Na TV a principal tem 1379×784 (proporção 1,76): as peças que a achavam pela proporção (até 1,74) a acham também pela altura.
  const NA_TV = '@container (aspect-ratio >= 1.74) and (min-height: 600px) and (max-height: 860px)';
  for (const id of ['servico-passos', 'social-mural', 'social-data']) assert.ok(ler('pecas-ouro/' + id + '.html').includes(NA_TV), id + ': a principal do Corporativo da TV');
  // O preço que não cabe ao lado do nome desce para a linha da medida; os talheres não crescem com a letra.
  assert.match(ler('pecas-ouro/cardapio-colunas.html'), /\.valor \{ grid-column: 3; grid-row: 2; \}/);
  assert.match(ler('pecas-ouro/cardapio-dia-foto.html'), /\.talher \{ font-size: 1cqw; \}/);
});

test('as peças-ouro em tela cheia cabem nas 11 marcas, e o robô bloqueia a que ceder em qualquer uma', () => {
  const robo = ler('tools/regua-tv.mjs');
  // Cada peça nas 11 marcas lado a lado (a bancada com marca=todas), no modo claro: o desenho é o mesmo nos quatro.
  assert.match(robo, /x\.todasAsMarcas \? '&marca=todas&modo=claro' : '&modo=todos'/);
  assert.match(robo, /console\.log\('Peças-ouro em tela cheia · todas as marcas \(' \+ nMarcas \+ '\): '/);
  assert.match(robo, /for \(const x of cheiasNasMarcas\.filter\(\(y\) => y\.cedeu < 1\)\) \{ console\.log\(cedeuNaMarca\(x\)\); reprova = true; \}/);
  // A bancada diz a marca de cada figura, e desenha todas quando pedem.
  const B = ler('js/bancada.js');
  assert.match(B, /const TODAS = 'todas';/);
  assert.match(B, /fig\.dataset\.marca = marca\.id;/);
  // A quadrada de quem cedia com a fonte de título larga (7 das 11 marcas, 97%).
  assert.match(ler('pecas-ouro/institucional-lancamento.html'), /\.apoio \{ margin-top: 2\.4cqw; font-size: max\(var\(--mt-piso, 0cqw\), 2\.4cqw\); line-height: 1\.3; max-width: none; \}/);
  assert.match(ler('pecas-ouro/gente-comunicado.html'), /\.texto \{ font-size: max\(var\(--mt-piso, 0cqw\), 2\.8cqw\); margin-top: 3cqw; max-width: none; line-height: 1\.4; \}/);
});

test('o destaque e a lateral cabem com a letra do balcão na TV com a margem contra o corte, e o robô bloqueia 2%, 3% e 5%', () => {
  const robo = ler('tools/regua-tv.mjs');
  assert.match(robo, /const MARGENS_NA_TV = \[2, 3, 5\];/);
  assert.match(robo, /conferirPecas\(navegador, 'balcao', zonas, \{ todasAsMarcas: true, margem \}\)/);
  assert.match(robo, /console\.log\('Peças-ouro em ' \+ nome \+ ' · balcão com borda de ' \+ margem \+ '% \('/);
  assert.match(robo, /for \(const x of naMargem\.filter\(\(y\) => y\.cedeu < 1\)\) \{ console\.log\(cedeuNaMarca\(x\)\); reprova = true; \}/);
  // A peça que a bancada não desenhou reprova (antes saía da conta calada), e as passadas correm em quatro páginas.
  assert.match(robo, /document\.body\.dataset\.desenhada === 'sim'/);
  assert.match(robo, /SEM_DESENHO\.push\(/);
  assert.match(robo, /const PAGINAS_DA_BANCADA = 4;/);
  // A bancada mede o Corporativo no tamanho da TV com a margem, na mesma grade do player, e a faixa é a dos Ajustes (0 a 5%).
  const B = ler('js/bancada.js');
  assert.match(B, /const MARGENS = \[0, 0\.5, 1, 1\.5, 2, 2\.5, 3, 3\.5, 4, 4\.5, 5\];/);
  assert.match(B, /tv\.style\.padding = \(\(1\.1 \+ margem\) \* H \/ 100\) \+ 'px ' \+ \(1\.1 \* H \/ 100 \+ margem \* W \/ 100\) \+ 'px';/);
  assert.match(B, /document\.body\.dataset\.desenhada = 'sim';/);
  assert.match(ler('js/player.js'), /Math\.max\(0, Math\.min\(5, Number\(cfg && cfg\.settings && cfg\.settings\.margemSegura\) \|\| 0\)\)/);
  assert.match(ler('css/player.css'), /padding: calc\(1\.1vh \+ var\(--mt-margem, 0\) \* 1vh\) calc\(1\.1vh \+ var\(--mt-margem, 0\) \* 1vw\);/);
  // As regras novas vão pela altura da zona, abaixo dos tamanhos que já passavam: a principal da TV com margem (até 775 px)...
  const PRINCIPAL = '(aspect-ratio >= 1.25) and (min-height: 600px) and (max-height: 775px)';
  for (const id of ['cardapio-bebidas', 'gente-mes', 'social-depoimento', 'cardapio-combo', 'cardapio-colunas', 'numero-grande',
    'oferta-parcelado', 'servico-comunicado', 'institucional-lancamento']) {
    assert.ok(ler('pecas-ouro/' + id + '.html').includes(PRINCIPAL), id + ': a principal do Corporativo com a margem');
  }
  // ... e a lateral da TV (a caixa da peça abaixo da da bancada, 515×832).
  for (const id of ['oferta-kit', 'cardapio-bebidas', 'gente-equipe', 'servico-pagamento', 'social-nota', 'social-pesquisa', 'cardapio-semana',
    'gente-mes', 'gente-destaque', 'gente-vaga', 'servico-semana', 'servico-epi', 'social-depoimento', 'cardapio-colunas', 'numero-grande',
    'servico-convenios', 'servico-hora', 'servico-horario', 'servico-preparo', 'servico-ramais', 'social-wifi', 'servico-agenda',
    'social-avaliacao', 'servico-espera']) {
    assert.match(ler('pecas-ouro/' + id + '.html'), /@container \(max-width: 700px\) and \(max-height: \d+px\)/, id + ': a lateral da TV');
  }
  // servico-epi: na principal com margem, os filhos caíam na regra "deitada e baixa" e a peça não; agora cada um ocupa a linha.
  assert.match(ler('pecas-ouro/servico-epi.html'), /\.texto, \.epi \{ grid-column: 1 \/ -1; \}/);
  // Os QRs não encolhem abaixo dos 160 px com a margem (o do mural ia pela altura da zona).
  assert.match(ler('pecas-ouro/social-mural.html'), /\.qr \{ width: 26cqh; height: 26cqh; \}/);
  assert.match(ler('pecas-ouro/servico-agenda.html'), /\.qr \{ width: 46cqmin; height: 46cqmin; padding: 1\.2cqmin; \}/);
});
