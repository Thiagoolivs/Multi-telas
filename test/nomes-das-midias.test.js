/*
 * O nome das fotos e vídeos que já estavam na TV (lote de 06/11, parte 2).
 *
 * A foto posta antes do `nome` ir junto só tem o endereço do armazenamento
 * (/media/<conta>/<código>.jpg) e aparecia como "Foto". A biblioteca da
 * conta (GET /api/media) guarda o nome original: o painel lê a lista uma
 * vez, guardada, e o endereço vira o nome — só na tela. A programação
 * gravada não muda.
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const RAIZ = path.join(__dirname, '..');
const ler = (f) => fs.readFileSync(path.join(RAIZ, f), 'utf8');
const importar = (f) => import(pathToFileURL(path.join(RAIZ, f)).href);

const MIDIAS = [
  { id: 'k3j4h5g6f7d8s9a0q1w2', name: 'foto-vitrine_2.jpg', mime: 'image/jpeg', url: '/media/ten_1/k3j4h5g6f7d8s9a0q1w2.jpg' },
  { id: 'abc123def456ghi789xy', name: 'promo-de-natal.mp4', mime: 'video/mp4', url: 'https://cdn.exemplo.com/media/ten_1/abc123def456ghi789xy.mp4' },
  { id: 'semnome00000000000aa', name: 'arquivo', mime: 'image/png', url: '/media/ten_1/semnome00000000000aa.png' },
  { id: 'camera00000000000000', name: 'IMG_20241103_101500.jpg', mime: 'image/jpeg', url: '/media/ten_1/camera00000000000000.jpg' },
  { id: 'generico000000000000', name: 'image.png', mime: 'image/png', url: '/media/ten_1/generico000000000000.png' },
  { name: 'sem endereço.jpg' }, null,
];

test('o endereço vira a chave, com ou sem o domínio do armazenamento na frente', async () => {
  const N = await importar('web/src/lib/nomesDasMidias.js');
  assert.equal(N.chaveDaMidia('/media/ten_1/k3j4.jpg'), 'ten_1/k3j4.jpg');
  assert.equal(N.chaveDaMidia('https://cdn.exemplo.com/media/ten_1/k3j4.jpg?v=2#x'), 'ten_1/k3j4.jpg');
  assert.equal(N.chaveDaMidia('/pecas-ouro/fotos/padaria.jpg'), '', 'arquivo que não é das Mídias não tem chave');
  assert.equal(N.chaveDaMidia(''), '');
  assert.equal(N.chaveDaMidia(undefined), '');
});

test('a lista das Mídias vira o mapa endereço → nome original (sem o "arquivo" de quando não veio nome)', async () => {
  const N = await importar('web/src/lib/nomesDasMidias.js');
  const mapa = N.mapaDeNomes(MIDIAS);
  assert.deepEqual(mapa, {
    'ten_1/k3j4h5g6f7d8s9a0q1w2.jpg': 'foto-vitrine_2.jpg',
    'ten_1/abc123def456ghi789xy.mp4': 'promo-de-natal.mp4',
    'ten_1/camera00000000000000.jpg': 'IMG_20241103_101500.jpg',
    'ten_1/generico000000000000.png': 'image.png',
  });
  assert.deepEqual(N.mapaDeNomes(null), {});
  assert.equal(N.nomeGuardado({ type: 'image', src: '/media/ten_1/k3j4h5g6f7d8s9a0q1w2.jpg' }, mapa), 'foto-vitrine_2.jpg');
  assert.equal(N.nomeGuardado({ type: 'image', src: '/media/ten_1/outro.jpg' }, mapa), '');
  assert.equal(N.nomeGuardado({ type: 'image', src: '/media/ten_1/k3j4h5g6f7d8s9a0q1w2.jpg' }, null), '', 'sem o mapa (ainda carregando), sem nome');
  assert.equal(N.nomeGuardado({ type: 'image', src: '/media/constructor' }, mapa), '', 'chave esquisita não lê o protótipo do objeto');
});

test('a fila, a semana e a Programação: a foto e o vídeo de antes ganham o nome original; sem nome guardado, "Foto"', async () => {
  const N = await importar('web/src/lib/nomesDasMidias.js');
  const C = await importar('web/src/lib/contentTypes.js');
  const nomes = N.mapaDeNomes(MIDIAS);
  const foto = (src, extra) => C.itemSummary({ type: 'image', src, ...extra }, nomes);
  assert.equal(foto('/media/ten_1/k3j4h5g6f7d8s9a0q1w2.jpg'), 'Foto vitrine 2');
  // O domínio do armazenamento mudou (CDN): a chave é a mesma.
  assert.equal(C.itemSummary({ type: 'video', src: '/media/ten_1/abc123def456ghi789xy.mp4' }, nomes), 'Promo de natal');
  assert.equal(foto('/media/ten_1/camera00000000000000.jpg'), 'Foto de 03/11/2024');
  assert.equal(foto('/media/ten_1/generico000000000000.png'), 'Foto', 'nome que não diz nada continua "Foto"');
  assert.equal(foto('/media/ten_1/semnome00000000000aa.png'), 'Foto', 'sem nome guardado, "Foto"');
  assert.equal(foto('/media/ten_1/apagada000000000000.jpg'), 'Foto', 'a mídia apagada da biblioteca: "Foto"');
  assert.equal(C.itemSummary({ type: 'video', src: '/media/ten_1/apagada000000000000.mp4' }, nomes), 'Vídeo');
  // O que a pessoa escreveu e o nome que já foi junto continuam ganhando.
  assert.equal(foto('/media/ten_1/k3j4h5g6f7d8s9a0q1w2.jpg', { titulo: 'Vitrine de Natal' }), 'Vitrine de Natal');
  assert.equal(foto('/media/ten_1/k3j4h5g6f7d8s9a0q1w2.jpg', { nome: 'bolo-do-dia.jpg' }), 'Bolo do dia');
  // Sem o mapa (antes de a lista chegar), como antes.
  assert.equal(C.itemSummary({ type: 'image', src: '/media/ten_1/k3j4h5g6f7d8s9a0q1w2.jpg' }), 'Foto');
  // Os outros tipos não mudam com o mapa.
  assert.equal(C.itemSummary({ type: 'announce', titulo: 'Pão quente' }, nomes), 'Pão quente');
});

test('só a TV com foto ou vídeo de antes pede a lista', async () => {
  const N = await importar('web/src/lib/nomesDasMidias.js');
  const cfg = (items) => ({ zonas: { principal: { items }, rodape: { messages: ['oi'] } } });
  assert.equal(N.precisaDeNomes(cfg([{ type: 'image', src: '/media/t/x.jpg' }])), true);
  assert.equal(N.precisaDeNomes(cfg([{ type: 'video', src: 'https://cdn.x/media/t/x.mp4' }])), true);
  assert.equal(N.precisaDeNomes(cfg([{ type: 'image', src: '/media/t/x.jpg', nome: 'vitrine.jpg' }])), false, 'a foto nova já traz o nome');
  assert.equal(N.precisaDeNomes(cfg([{ type: 'image', src: '/media/t/x.jpg', legenda: 'Bolo' }])), false);
  assert.equal(N.precisaDeNomes(cfg([{ type: 'image', src: 'https://site.com/foto.jpg' }])), false, 'foto da internet não é das Mídias');
  assert.equal(N.precisaDeNomes(cfg([{ type: 'announce', titulo: 'x' }, null])), false);
  assert.equal(N.precisaDeNomes(null), false);
  assert.equal(N.precisaDeNomes('erro'), false, 'a TV que não carregou (Programação) não pede nada');
});

test('a lista vem uma vez, guardada: um pedido para quantos pedirem; falhou, espera um minuto', async () => {
  const U = await importar('web/src/lib/useNomesDasMidias.js');
  U.esquecerNomesDasMidias();
  let pedidos = 0;
  const listar = async () => { pedidos++; return { items: MIDIAS }; };
  const [a, b] = await Promise.all([U.carregarNomesDasMidias({ listar }), U.carregarNomesDasMidias({ listar })]);
  assert.equal(pedidos, 1, 'dois pedidos ao mesmo tempo viraram dois');
  assert.equal(a, b);
  assert.equal(a['ten_1/k3j4h5g6f7d8s9a0q1w2.jpg'], 'foto-vitrine_2.jpg');
  await U.carregarNomesDasMidias({ listar });
  assert.equal(pedidos, 1, 'a lista guardada foi pedida de novo');
  // Dez minutos depois, pede de novo (fotos novas na biblioteca).
  await U.carregarNomesDasMidias({ listar, agora: Date.now() + 11 * 60 * 1000 });
  assert.equal(pedidos, 2);
  // A lista que outra página leu (Arquivos, o Adicionar) entra no lugar, sem pedido.
  U.guardarMidias([{ name: 'cardapio.png', url: '/media/ten_1/novo.png' }]);
  assert.deepEqual(await U.carregarNomesDasMidias({ listar }), { 'ten_1/novo.png': 'cardapio.png' });
  assert.equal(pedidos, 2);
  // Falhou (sem internet, o freio da conta): sem nomes, e não insiste a cada tela.
  U.esquecerNomesDasMidias();
  let falhas = 0;
  const falhar = async () => { falhas++; throw new Error('sem conexão'); };
  assert.deepEqual(await U.carregarNomesDasMidias({ listar: falhar }), {});
  assert.deepEqual(await U.carregarNomesDasMidias({ listar: falhar }), {});
  assert.equal(falhas, 1, 'tentou de novo logo depois de falhar');
  await U.carregarNomesDasMidias({ listar: falhar, agora: Date.now() + 61 * 1000 });
  assert.equal(falhas, 2, 'um minuto depois, tenta de novo');
  U.esquecerNomesDasMidias();
});

test('quem mostra o nome usa o mapa: a fila da TV, a semana, a Programação, a volta e as Aprovações', () => {
  const editor = ler('web/src/pages/ContentEditorPage.jsx');
  assert.match(editor, /const nomesDasMidias = useNomesDasMidias\(precisaDeNomes\(cfg\)\);/);
  assert.match(editor, /\{itemSummary\(it, nomesDasMidias\)\}/);
  assert.match(editor, /title=\{itemSummary\(current, nomesDasMidias\)\}/);
  const semana = ler('web/src/components/agenda/SemanaDaTv.jsx');
  assert.match(semana, /const nomes = useNomesDasMidias\(precisaDeNomes\(cfg\)\);/);
  assert.match(semana, /\[cfg, layout, tv, nomes\]/);
  const prog = ler('web/src/pages/ProgramacaoPage.jsx');
  assert.match(prog, /useNomesDasMidias\(Object\.values\(cfgs\)\.some\(precisaDeNomes\)\)/);
  assert.match(prog, /<MapaDaTela layout=\{layout\}[^\n]*cfg=\{cfg\} nomes=\{nomes\} \/>/);
  assert.match(ler('web/src/components/tela/MapaDaTela.jsx'), /t\.summary\(item, nomes\)/);
  assert.match(ler('web/src/components/tela/ArrumarVolta.jsx'), /\{itemSummary\(it, nomes\)\}/);
  assert.match(ler('web/src/pages/AprovacoesPage.jsx'), /oQuePassa\(t\.depois, nomesDasMidias\)/);
  // Só mostra: nada aqui grava o nome na programação.
  for (const f of ['web/src/lib/nomesDasMidias.js', 'web/src/lib/useNomesDasMidias.js']) {
    assert.doesNotMatch(ler(f), /deviceConfig|gravarEmLote|gravarNaTela|lote\.enviar/, f + ' grava na TV');
  }
  // A lista lida por outra página chega aqui (um pedido a menos no freio da conta).
  assert.match(ler('web/src/api.js'), /ouvirLista: \(fn\) => \{ ouvintesDaLista\.add\(fn\);/);
});
