/*
 * O contrato da config.
 *
 * Antes destes testes, `normalize()` existia e rodava só no navegador, no modo
 * legado. A config que o painel React publicava ia crua para o banco e crua
 * para a TV — painel e player concordavam por convenção, não por definição.
 *
 * Agora o MESMO arquivo roda no servidor (antes de gravar) e no player (antes
 * de montar o palco). O que este arquivo protege é justamente isso: que a
 * definição continue sendo uma só, e que ela aguente lixo.
 */
const test = require('node:test');
const assert = require('node:assert');
const schema = require('../js/storage.js');

const cfgBase = () => ({
  version: 1,
  settings: { nome: 'Recepção', layoutId: 'full' },
  zonas: { principal: { items: [{ type: 'text', titulo: 'Oi' }] } },
});

test('config boa passa inteira', () => {
  const out = schema.normalize(cfgBase());
  assert.equal(out.settings.nome, 'Recepção');
  assert.equal(out.settings.layoutId, 'full');
  assert.equal(out.zonas.principal.items.length, 1);
  assert.equal(out.zonas.principal.items[0].titulo, 'Oi');
});

test('normalize NÃO inventa nome de empresa', () => {
  // O exemplo tem "Raft Embalagens". Se ele vazasse para dentro do normalize,
  // a tela de outro cliente seria renomeada ao publicar.
  const out = schema.normalize({ settings: { layoutId: 'full' }, zonas: {} });
  assert.equal(out.settings.nome, '');
  assert.equal(schema.sampleConfig().settings.nome, 'Raft Embalagens');
});

test('lixo no lugar da config não derruba nada', () => {
  for (const entrada of [null, undefined, 0, 'texto', [], [1, 2, 3], true]) {
    const out = schema.normalize(entrada);
    assert.ok(out && out.settings && out.zonas, 'quebrou com ' + JSON.stringify(entrada));
    assert.ok(out.settings.theme, 'ficou sem tema com ' + JSON.stringify(entrada));
  }
});

test('zona com formato errado não vira item quebrado na TV', () => {
  const out = schema.normalize({
    settings: { layoutId: 'full' },
    zonas: { principal: { items: 'não é lista' } },
  });
  assert.ok(Array.isArray(out.zonas.principal.items));
  assert.equal(out.zonas.principal.items.length, 0);
});

test('o layout escolhido sempre tem todas as suas zonas', () => {
  const out = schema.normalize({ settings: { layoutId: 'dashboard' }, zonas: {} });
  const layout = require('../js/templates.js').getLayout('dashboard');
  for (const z of layout.zones) {
    assert.ok(out.zonas[z.id], 'faltou a zona ' + z.id);
  }
});

test('trocar de layout não apaga o conteúdo do layout antigo', () => {
  const out = schema.normalize({
    settings: { layoutId: 'full' },
    zonas: { principal: { items: [{ type: 'text' }] }, lateral: { items: [{ type: 'quote' }] } },
  });
  // 'full' só tem a zona principal, mas a lateral sobrevive para quando o
  // usuário voltar ao layout anterior.
  assert.ok(out.zonas.lateral, 'perdeu a lateral ao normalizar');
  assert.equal(out.zonas.lateral.items.length, 1);
});

test('tema antigo (cor/fundo soltos) é migrado, não descartado', () => {
  const out = schema.normalize({
    settings: { layoutId: 'full', cor: '#ff8800', fundo: '#101020' },
    zonas: {},
  });
  assert.equal(out.settings.theme.overrides.brand, '#ff8800');
  assert.equal(out.settings.theme.overrides.bg, '#101020');
});

test('a trilha sonora é saneada também na config da nuvem', () => {
  const out = schema.normalize({
    settings: { layoutId: 'full', audio: { ativo: true, volume: 900, faixas: [{ url: '/a.mp3' }, {}] } },
    zonas: {},
  });
  assert.equal(out.settings.audio.volume, 100);
  assert.equal(out.settings.audio.faixas.length, 1);
});

test('normalizar duas vezes dá o mesmo resultado', () => {
  // Idempotência: o servidor normaliza ao gravar e o player normaliza ao
  // montar. Se as duas passadas divergissem, a TV mostraria outra coisa.
  const uma = schema.normalize(cfgBase());
  const duas = schema.normalize(uma);
  assert.deepEqual(duas, uma);
});

test('rodapé mantém os campos novos ao passar pelo servidor', () => {
  const out = schema.normalize({
    settings: { layoutId: 'dashboard' },
    zonas: { rodape: { modo: 'rolagem', rolagem: 'nunca', cores: 'marca', corDestaque: '#f00', mostrarRelogio: false } },
  });
  const r = out.zonas.rodape;
  assert.equal(r.rolagem, 'nunca');
  assert.equal(r.cores, 'marca');
  assert.equal(r.corDestaque, '#f00');
  assert.equal(r.mostrarRelogio, false);
});
