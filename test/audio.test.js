/*
 * Trilha sonora: normalização da config.
 *
 * js/storage.js roda no navegador, mas esta função é pura. Ela merece teste
 * porque é a última barreira antes da TV: config vinda de arquivo importado,
 * de banco antigo ou de uma versão futura passa por aqui, e do outro lado não
 * há ninguém para consertar nada — a tela está pendurada na parede.
 */
const test = require('node:test');
const assert = require('node:assert');

global.window = { addEventListener() {} };
global.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
require('../js/templates.js');
require('../js/storage.js');
const MTStorage = global.window.MTStorage;

const audioDe = (settings) => MTStorage.normalize({ settings }).settings.audio;

test('config sem áudio nenhum vira trilha desligada e vazia', () => {
  assert.deepEqual(audioDe({}), {
    ativo: false, faixas: [], volume: 60, aleatorio: false, abaixarComVideo: true,
  });
});

test('ligada sem faixa nenhuma volta desligada', () => {
  // Prometer música e não ter arquivo é pior do que assumir o silêncio.
  assert.equal(audioDe({ audio: { ativo: true, faixas: [] } }).ativo, false);
});

test('faixa como texto puro vira objeto', () => {
  const a = audioDe({ audio: { ativo: true, faixas: ['/media/x/um.mp3'] } });
  assert.deepEqual(a.faixas, [{ url: '/media/x/um.mp3', nome: '' }]);
  assert.equal(a.ativo, true);
});

test('faixa sem url é descartada em vez de virar silêncio no meio da lista', () => {
  const a = audioDe({ audio: { ativo: true, faixas: [
    { url: '/media/a.mp3', nome: 'A' }, { nome: 'sem arquivo' }, null, { url: '' },
    { url: '/media/b.mp3' },
  ] } });
  assert.equal(a.faixas.length, 2);
  assert.deepEqual(a.faixas.map((f) => f.url), ['/media/a.mp3', '/media/b.mp3']);
});

test('volume é preso entre 0 e 100', () => {
  assert.equal(audioDe({ audio: { volume: 300 } }).volume, 100);
  assert.equal(audioDe({ audio: { volume: -40 } }).volume, 0);
  assert.equal(audioDe({ audio: { volume: 42.6 } }).volume, 43);
  assert.equal(audioDe({ audio: { volume: 'alto' } }).volume, 60, 'texto cai no padrão');
  assert.equal(audioDe({ audio: { volume: 0 } }).volume, 0, 'zero é um volume, não "vazio"');
});

test('abaixar com vídeo é o padrão; desligar exige dizer false', () => {
  assert.equal(audioDe({ audio: {} }).abaixarComVideo, true);
  assert.equal(audioDe({ audio: { abaixarComVideo: false } }).abaixarComVideo, false);
  assert.equal(audioDe({ audio: { abaixarComVideo: 'nao' } }).abaixarComVideo, true);
});

test('lista gigante é cortada — a TV não precisa de mil faixas', () => {
  const faixas = Array.from({ length: 300 }, (_, i) => ({ url: '/media/' + i + '.mp3' }));
  assert.equal(audioDe({ audio: { ativo: true, faixas } }).faixas.length, 100);
});

test('nome de faixa muito longo é cortado', () => {
  const a = audioDe({ audio: { ativo: true, faixas: [{ url: '/a.mp3', nome: 'x'.repeat(400) }] } });
  assert.equal(a.faixas[0].nome.length, 120);
});

test('config antiga (sem o campo) continua abrindo e não perde as zonas', () => {
  const antiga = { settings: { layoutId: 'full', nome: 'Recepção' }, zonas: { principal: { items: [{ type: 'text' }] } } };
  const out = MTStorage.normalize(antiga);
  assert.equal(out.settings.nome, 'Recepção');
  assert.equal(out.zonas.principal.items.length, 1);
  assert.equal(out.settings.audio.ativo, false);
});
