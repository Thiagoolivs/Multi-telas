/*
 * Testes do diretor no ponto onde ele decide QUAL imagem entra na peça.
 * A regra que estes testes protegem: a foto da própria empresa vence a foto
 * gerada, e um índice inventado pelo modelo nunca vira peça quebrada.
 */
const test = require('node:test');
const assert = require('node:assert');
const director = require('../server/ai-director');

const marca = () => ({
  cores: ['#ff4d00'],
  direcao: 'chapado',
  bases: [
    { url: '/media/t/loja.jpg', label: 'fachada da loja com clientes' },
    { url: '/media/t/pao.jpg', label: '' },
  ],
});

const peca = (extra) => Object.assign({ headline: 'Pão quentinho' }, extra);

test('imagemBase válida vira o fundo da peça', () => {
  const p = director.normalizarPlano({ pecas: [peca({ imagemBase: 1 })] }, { marca: marca() }, 'b');
  assert.equal(p.pecas[0].imagemBase, 1);
  assert.equal(p.pecas[0].bgImagem, '/media/t/pao.jpg');
});

test('escolher foto do acervo desliga a geração de imagem', () => {
  const p = director.normalizarPlano(
    { pecas: [peca({ imagemBase: 0, precisaImagem: true, promptImagem: 'foto de padaria' })] },
    { marca: marca() }, 'b');
  assert.equal(p.pecas[0].precisaImagem, false);
  assert.equal(p.pecas[0].promptImagem, '');
});

test('índice fora do acervo é descartado e a peça volta a gerar imagem', () => {
  const p = director.normalizarPlano(
    { pecas: [peca({ imagemBase: 9, precisaImagem: true, promptImagem: 'foto de padaria' })] },
    { marca: marca() }, 'b');
  assert.equal(p.pecas[0].imagemBase, null);
  assert.equal(p.pecas[0].bgImagem, '');
  assert.equal(p.pecas[0].precisaImagem, true);
  assert.equal(p.pecas[0].promptImagem, 'foto de padaria');
});

test('índice não inteiro não é aceito', () => {
  for (const v of ['0', 1.5, true, null, -1]) {
    const p = director.normalizarPlano({ pecas: [peca({ imagemBase: v })] }, { marca: marca() }, 'b');
    assert.equal(p.pecas[0].imagemBase, null, 'aceitou ' + JSON.stringify(v));
  }
});

test('empresa sem acervo segue gerando imagem normalmente', () => {
  const p = director.normalizarPlano(
    { pecas: [peca({ imagemBase: 0, precisaImagem: true, promptImagem: 'foto de padaria' })] }, {}, 'b');
  assert.equal(p.pecas[0].imagemBase, null);
  assert.equal(p.pecas[0].precisaImagem, true);
});

test('dirigir usa a foto do acervo em vez de gerar', async () => {
  let geradas = 0;
  const out = await director.dirigir('Promoção de padaria', { marca: marca() }, {
    onImagem: async () => { geradas++; return '/media/t/gerada.png'; },
    onCatalogar: async () => ['pão francês saindo do forno'],
  });
  assert.equal(geradas, 0);
  assert.ok(out.pecas.every((p) => p.usouAcervo));
  assert.deepEqual(out.pecas[0].item.bg, { kind: 'imagem', src: '/media/t/loja.jpg' });
});

test('catalogar só é chamado para as fotos sem rótulo', async () => {
  let vistas = null;
  await director.dirigir('Promoção de padaria', { marca: marca() }, {
    onCatalogar: async (urls) => { vistas = urls; return ['pão']; },
  });
  assert.deepEqual(vistas, ['/media/t/pao.jpg']);
});

test('falha ao catalogar não derruba a campanha', async () => {
  const out = await director.dirigir('Promoção de padaria', { marca: marca() }, {
    onCatalogar: async () => { throw new Error('visão fora do ar'); },
  });
  assert.ok(out.pecas.length > 0);
});

test('peça com foto ganha véu de leitura mesmo na direção chapado', () => {
  const palette = require('../server/design-system').buildPalette('#ff4d00', '', 'vibrante', 'marca');
  const comFoto = director.layoutReserva(peca({ bgImagem: '/media/t/loja.jpg' }), palette, '16/9', 'chapado', {});
  assert.ok(comFoto.elementos.some((e) => e.tipo === 'forma' && e.papel === 'decor'),
    'peça sobre foto precisa de forma atrás do texto');
});
