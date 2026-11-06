/*
 * Fase 4 do plano de ação (docs/qa-total/PLANO-DE-ACAO.md): a marca entra
 * sozinha, e nada de texto de exemplo na TV. O robô (tools/regua-tv.mjs, no
 * CI) confere as duas coisas nas TVs de verdade.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const RAIZ = path.join(__dirname, '..');
const ler = (f) => fs.readFileSync(path.join(RAIZ, f), 'utf8');
const P = require('../server/paleta.js');

const KIT = { cores: ['#b4532a', '#f2c14e'], nasTvs: true };

test('a TV que não escolheu tema sai com a marca, e a cor acompanha a marca', () => {
  // A config nova herda cor e fundo padrão como ajuste: não é escolha de ninguém.
  const novo = P.temaDaTv({ preset: 'dark-premium', font: 'system', overrides: { brand: '#5B2EFF', bg: '#0E0B1F' } }, KIT);
  assert.equal(novo.preset, 'marca');
  assert.deepEqual(novo.marca, KIT.cores);
  assert.deepEqual(novo.overrides, {}, 'o roxo herdado não pinta por cima da marca');
  assert.deepEqual(P.temaDaTv(undefined, KIT).marca, KIT.cores);
  // A marca mudou de cor: a TV acompanha; já com as cores certas, nada a fazer.
  assert.deepEqual(P.temaDaTv({ preset: 'marca', marca: ['#000000'] }, KIT).marca, KIT.cores);
  assert.equal(P.temaDaTv({ preset: 'marca', marca: KIT.cores }, KIT), null);
});

test('quem escolheu outro tema fica com o dele, e "Usar nas minhas TVs" desligado não mexe', () => {
  assert.equal(P.temaDaTv({ preset: 'varejo-quente' }, KIT), null);
  assert.equal(P.temaDaTv({ preset: 'dark-premium', escolhido: true }, KIT), null);
  assert.equal(P.temaDaTv({ preset: 'dark-premium', aplicarMarca: true }, KIT), null);
  assert.equal(P.temaDaTv({ preset: 'dark-premium', overrides: { brand: '#ff0000' } }, KIT), null, 'cor à mão é escolha');
  assert.equal(P.temaDaTv({}, { cores: KIT.cores, nasTvs: false }), null);
  assert.equal(P.temaDaTv({}, { cores: [], nasTvs: true }), null, 'marca sem cor não muda nada');
});

test('a marca chega na TV e no painel, a escolha fica gravada e a Marca tem o liga-desliga', () => {
  const T = ler('server/routes/telas.js');
  assert.match(T, /const kit = await db\.getBrandKit\(device\.tenant_id\)\.catch\(\(\) => null\);\s*const tema = paleta\.temaDaTv\(c\.settings\.theme, kit\);/);
  for (const db of ['server/db-sqlite.js', 'server/db-postgres.js']) {
    const d = ler(db);
    assert.match(d, /nas_tvs INTEGER/, db + ': a coluna nos DOIS bancos');
    assert.match(d, /nasTvs: !\(r\.nas_tvs === 0/, db + ': ligada por padrão');
    assert.match(d, /async function salvarNasTvsDaMarca\(/);
  }
  assert.match(ler('server.js'), /if \(b && typeof b\.nasTvs === 'boolean'\)/);
  assert.match(ler('web/src/pages/BrandPage.jsx'), /<b>Usar nas minhas TVs<\/b>/);
  const F = ler('web/src/components/content/SettingsForm.jsx');
  assert.match(F, /patch\.escolhido = preset !== 'marca';/, 'escolher um tema pronto é escolha desta TV');
});

test('com o tema da marca, o aviso usa a cor da marca; urgente e segurança ficam com a cor deles', () => {
  const R = ler('js/render.js');
  assert.match(R, /const ANN_COR_FIXA = \{ urgente: true, seguranca: true \};/);
  assert.match(R, /const cor = corDoAviso\(v\);/);
  assert.match(ler('js/player.js'), /global\.MT_TEMA_DA_MARCA = tema\.preset === 'marca' \|\| tema\.aplicarMarca === true;/);
  assert.match(R, /\{ alta: 'subiu', baixa: 'desceu', sobe: 'subiu', desce: 'desceu' \}/, '"alta" não vira traço vermelho');
});

test('o "Adicionar" entra com um exemplo da frente, marcado, e a TV não mostra exemplo', async () => {
  const C = await import('../web/src/lib/contentTypes.js');
  const a = C.novoItem('announce', 'saude');
  assert.equal(a.meta.exemplo, true);
  assert.match(a.titulo, /vacina/i, 'o exemplo é da frente');
  assert.notEqual(a.titulo, 'Aviso importante');
  assert.equal(C.novoItem('promo', 'comercio').titulo, 'Bolo de cenoura com chocolate');
  assert.equal(C.novoItem('image', 'comercio').meta, undefined, 'foto não tem exemplo de texto');
  // Mexeu no conteúdo: deixa de ser exemplo. Só a duração ou o agendamento: continua.
  assert.equal(C.semExemplo(a, { ...a, duracao: 20 }).meta.exemplo, true);
  assert.equal(C.semExemplo(a, { ...a, titulo: 'Campanha de vacinação' }).meta.exemplo, undefined);
  const P2 = ler('js/player.js');
  assert.match(P2, /function ehExemplo\(it\)/);
  assert.match(P2, /text: \(it\) => it\.titulo === 'Novo comunicado' && !String\(it\.corpo \|\| ''\)\.trim\(\)/, 'o padrão antigo também não vai ao ar');
  const E = ler('web/src/pages/ContentEditorPage.jsx');
  assert.match(E, /arr\.push\(novoItem\(type, perfilAtual\(\)\)\)/);
  assert.match(E, /arr\[idx\] = ajustesDoEditor\(arr\[idx\], item\)/);
  assert.match(E, /exemplo: troque o texto para ir ao ar/);
});

test('o robô confere a cor da marca e o texto padrão em toda foto de tela cheia', () => {
  const robo = ler('tools/regua-tv.mjs');
  assert.match(robo, /getPropertyValue\('--brand'\)/);
  assert.match(robo, /const PADROES = \[/);
  assert.match(robo, /if \(semMarca\.length\) reprova = true;/);
  assert.match(robo, /if \(comPadrao\.length\) reprova = true;/);
});
