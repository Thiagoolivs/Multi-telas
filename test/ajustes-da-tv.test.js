/*
 * Ajustes da TV, em palavras de quem tem loja (lote de 06/11):
 *
 *   1. O jeito de dividir a TV pelo que se vê ("Uma tela inteira", "Grande +
 *      coluna à direita"), não pelo nome do catálogo ("Painel Notícias",
 *      "Corporativo Completo"). O id não muda: está gravado nas configs.
 *   2. A arte do modo ambiente: o desenho da marca ou uma peça-ouro de
 *      ambiente APROVADA, e a ida e volta painel → config → TV.
 *   3. A foto e o vídeo na fila com nome ("Foto vitrine 2"), não "Imagem".
 *   4. axe: o botão da marca com nome curto e a explicação como descrição;
 *      um violeta por tela (o "Vestir a tela" é sugestão, não o principal).
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
const semComentarios = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '');

test('o jeito de dividir a TV tem nome de forma, para todo layout, e o id fica', async () => {
  const S = await importar('web/src/lib/screenConfig.js');
  const N = await importar('web/src/lib/nomesDosLayouts.js');
  global.window = global;
  require('../js/templates.js');
  const catalogo = new Map(global.MT_LAYOUTS.map((l) => [l.id, l.name]));
  for (const l of S.LAYOUTS) {
    assert.ok(N.IDS_COM_NOME.includes(l.id), l.id + ' sem nome em palavras');
    const nome = N.nomeDoLayout(l.id, { curto: true });
    assert.notEqual(nome, catalogo.get(l.id), l.id + ': o nome do catálogo da TV voltou para o cliente');
    assert.notEqual(nome, l.name, l.id);
    assert.ok(nome.length <= 32, l.id + ': nome longo demais para o cartão do celular (' + nome + ')');
    assert.ok(N.comoSeDivide(l.id).length > 20, l.id + ': sem a frase de como se divide');
    assert.equal(S.getLayout(l.id).id, l.id, 'o id do layout não muda');
  }
  assert.equal(N.nomeDoLayout('full'), 'Uma tela inteira');
  assert.equal(N.nomeDoLayout('duo'), 'Duas metades iguais');
  // Fora do seletor (que já está no grupo "TV em pé"), o formato vem na frente.
  assert.equal(N.nomeDoLayout('portrait-hero'), 'Em pé: grande + faixa embaixo');
  assert.equal(N.nomeDoLayout('portrait-hero', { curto: true }), 'Grande + faixa embaixo');
  assert.equal(N.nomeDoLayout('square-hero'), 'Quadrada: grande + faixa embaixo');
  // Layout desconhecido cai no padrão (como o getLayout), nunca no id cru.
  assert.equal(N.nomeDoLayout('nao-existe'), N.nomeDoLayout('dashboard'));
  // Quem mostra o nome usa o novo: o seletor, o aviso de troca, a IA da tela e o Pôr pra rodar.
  const f = semComentarios(ler('web/src/components/content/SettingsForm.jsx'));
  assert.match(f, /\{nomeDoLayout\(l\.id, \{ curto: true \}\)\}/);
  assert.match(f, /<b>\{nomeDoLayout\(trocaPendente\.id\)\}<\/b>/);
  assert.doesNotMatch(f, /\{l\.name\}|getLayout\(trocaPendente\.id\)\.name|layout\.description/, 'o nome do catálogo voltou ao seletor');
  assert.doesNotMatch(f, />Layout</, 'o título "Layout" voltou');
  assert.match(f, /partesQueSaem\(trocaPendente\.saem/, 'o aviso de troca fala "lado", não "lateral, rodape"');
  const A = await importar('web/src/lib/ajusteTela.js');
  const linhas = A.descrever({ settings: { layoutId: 'corporate' }, zonas: {} }, { layoutId: 'full-ticker' });
  assert.equal(linhas[0].texto, 'Divisão da TV: Grande + coluna + faixas → Tela inteira + faixa embaixo');
  const R = await importar('web/src/lib/rodar.js');
  assert.equal(R.nomeDoLayout('corporate'), 'Grande + coluna + faixas');
  assert.equal(R.nomeDoLayout('portrait-stack'), 'Em pé: em faixas, duas partes no meio');
});

test('o desenho do layout: as faixas em cinza, as partes em branco', () => {
  const f = ler('web/src/components/content/SettingsForm.jsx');
  assert.match(f, /<MiniLayout id=\{l\.id\} \/>/);
  assert.match(f, /z\.type === 'playlist' \? 'bg-surface' : 'bg-line-strong'/);
});

/* ---------------- A arte do modo ambiente ---------------- */

const P = require('../js/peca-html.js');
const ST = require('../js/storage.js');
const RZ = require('../js/rodizio.js');
const CP = require('../server/conteudoPronto.js');

function modelosDoManifesto(decisoes) {
  const m = CP.aplicarDecisoes(JSON.parse(ler('pecas-ouro/manifesto.json')), decisoes || []);
  return m.pecas.map((p) => {
    const arq = path.join(RAIZ, 'pecas-ouro', p.id + '.html');
    return fs.existsSync(arq) ? { ...p, arq: P.doArquivo(fs.readFileSync(arq, 'utf8')) } : null;
  }).filter(Boolean);
}

test('a arte: só as peças de ambiente aprovadas na galeria; sem nenhuma, fica o desenho da marca', async () => {
  globalThis.MTPecaHtml = globalThis.MTPecaHtml || P;
  const Am = await importar('web/src/lib/arteDoAmbiente.js');
  // O arquivo traz as três como proposta: nada para oferecer ainda.
  assert.deepEqual(Am.artesAprovadas(modelosDoManifesto(), 'comercio'), []);
  // A decisão do operador (tabela conteudo_pronto) vem por cima do arquivo.
  const agora = Date.now();
  const aprovadas = Am.artesAprovadas(modelosDoManifesto([
    { tipo: 'peca', id: 'ambiente-ondas', estado: 'aprovada', decidido_em: agora },
    { tipo: 'peca', id: 'ambiente-luz', estado: 'recusada', decidido_em: agora },
  ]), 'saude');
  assert.deepEqual(aprovadas.map((m) => m.id), ['ambiente-ondas']);
  assert.equal(Am.nomeDaArte(aprovadas[0]), 'Ondas');
  // Peça aprovada de outra família não entra (o ambiente é uma família só).
  assert.ok(Am.artesAprovadas(modelosDoManifesto(), 'comercio').every((m) => m.familia === 'ambiente'));
  // O painel diz que mais artes chegam, e o desenho da marca é sempre a primeira opção.
  const c = ler('web/src/components/content/AmbienteESenha.jsx');
  assert.match(c, /nome="Desenho da marca"/);
  assert.match(c, /Mais artes aparecem aqui assim que forem aprovadas\./);
  assert.match(c, /<PecaHtml item=\{previas\.get\(m\.id\)\} formato=\{formato\} \/>/, 'a prévia é a peça de verdade');
  assert.match(c, /import '\.\.\/\.\.\/\.\.\/\.\.\/js\/ambiente\.js';/, 'a prévia do desenho é o da TV');
  assert.match(c, /label="Pôr a arte calma entre os avisos"/);
});

test('ida e volta: a peça escolhida passa pela porta do servidor e a TV a põe no lugar do desenho', async () => {
  globalThis.MTPecaHtml = globalThis.MTPecaHtml || P;
  const Am = await importar('web/src/lib/arteDoAmbiente.js');
  const [ondas] = Am.artesAprovadas(modelosDoManifesto([{ tipo: 'peca', id: 'ambiente-ondas', estado: 'aprovada', decidido_em: 1 }]), 'comercio');
  const marca = { nome: 'Padaria Sol', cores: ['#b45309', '#fde68a'] };
  const peca = Am.pecaDaArte(ondas, marca, 'comercio', '  Bom dia,   freguês! ');
  assert.equal(peca.type, 'peca-html');
  assert.equal(Am.baseDa(peca), 'ambiente-ondas');
  assert.deepEqual(peca.campos, { frase: 'Bom dia, freguês!', marca: 'Padaria Sol' });
  // Sem frase, a do modelo para a frente; sem nome de empresa, o lugar do nome some (nada de "Clínica Vida").
  const semNada = Am.pecaDaArte(ondas, { cores: [] }, 'saude', '');
  assert.equal(semNada.campos.frase, 'Respire fundo. Já já chamamos você.');
  assert.equal(semNada.campos.marca, '');
  assert.deepEqual(semNada.ocultos, ['marca']);
  assert.equal(Am.fraseDoModelo(ondas, 'saude'), 'Respire fundo. Já já chamamos você.');

  // O que o painel grava → o normalizador e a porta do servidor (server/routes/telas.js, prepararConfig).
  const cfg = ST.normalize({ settings: { layoutId: 'full', ambiente: { ativo: true, cada: 3, segundos: 8, mostrar: 'relogio', frase: 'Bom dia, freguês!', peca } }, zonas: { principal: { items: [{ type: 'announce', titulo: 'Pão quente', duracao: 6 }] } } });
  assert.equal(cfg.settings.ambiente.peca.type, 'peca-html');
  const porta = P.conferirConfig(cfg, { hostsMidia: [] });
  assert.deepEqual(porta.problemas, [], 'a peça-ouro de ambiente não passou pela porta');
  assert.equal(cfg.settings.ambiente.peca.campos.frase, 'Bom dia, freguês!');
  // A TV: o respiro é a peça (no tempo do ambiente, nunca urgente); sem a peça, o desenho dela.
  const respiro = RZ.pecaDeAmbiente(cfg.settings.ambiente);
  assert.equal(respiro.type, 'peca-html');
  assert.equal(respiro.duracao, 8);
  assert.equal(respiro._automatico, 'ambiente');
  assert.match(respiro.html, /ambiente-ondas/);
  const volta = RZ.comAmbiente([{ type: 'announce', id: 'a', titulo: 'Pão quente', duracao: 6 }], cfg.settings.ambiente);
  assert.deepEqual(volta.map((x) => x.type), ['announce', 'peca-html']);
  const semPeca = { ...cfg.settings.ambiente };
  delete semPeca.peca;
  assert.equal(RZ.pecaDeAmbiente(ST.normalizeAmbiente(semPeca)).type, 'ambiente', 'voltar ao desenho da marca tira a peça');
  // O painel tira a peça da config ao voltar ao desenho, e esconde "O que mostra" (a peça mostra uma frase, não a hora).
  const c = ler('web/src/components/content/AmbienteESenha.jsx');
  assert.match(c, /const semPeca = \(\) => \{ const resto = \{ \.\.\.a \}; delete resto\.peca; onChange\(\{ ambiente: resto \}\); \};/);
  assert.match(c, /\{!a\.peca && \(\s*<Field label="O que mostra">/);
});

/* ---------------- O nome da foto e do vídeo ---------------- */

test('a foto e o vídeo têm nome: o título, a legenda ou o arquivo; "Foto" só sem nada', async () => {
  const C = await importar('web/src/lib/contentTypes.js');
  const casos = {
    'foto-vitrine_2.jpg': 'Foto vitrine 2',
    'Promoção%20de%20Natal.png': 'Promoção de Natal',
    'https://exemplo.com/fotos/cafe-da-manha.webp?w=800': 'Cafe da manha',
    'IMG_20241103_101500.jpg': 'Foto de 03/11/2024',
    'WhatsApp Image 2024-11-03 at 10.15.00.jpeg': 'Foto de 03/11/2024',
    'image.png': '', 'arquivo': '', 'k3j4h5g6f7d8s9a0q1w2.jpg': '', '20240301_123456.jpg': '', '': '',
  };
  for (const [nome, esperado] of Object.entries(casos)) assert.equal(C.nomeDoArquivo(nome), esperado, nome);
  assert.equal(C.nomeDoArquivo('VID_20250102_101010.mp4', 'Vídeo'), 'Vídeo de 02/01/2025');

  const foto = (extra) => C.itemSummary({ type: 'image', src: '/media/t1/k3j4h5g6f7d8s9a0q1w2.jpg', ...extra });
  assert.equal(foto({ nome: 'foto-vitrine_2.jpg' }), 'Foto vitrine 2');
  assert.equal(foto({ nome: 'foto-vitrine_2.jpg', titulo: 'Vitrine de Natal' }), 'Vitrine de Natal', 'o título ganha do arquivo');
  assert.equal(foto({ legenda: 'Bolo do dia' }), 'Bolo do dia');
  assert.equal(foto(), 'Foto', 'o endereço do armazenamento é um código: não vira nome');
  assert.equal(C.itemSummary({ type: 'image', src: '' }), 'Foto (sem arquivo)');
  assert.equal(C.itemSummary({ type: 'image', src: '/pecas-ouro/fotos/padaria-paes.jpg' }), 'Padaria paes');
  const video = (extra) => C.itemSummary({ type: 'video', src: '/media/t1/abc123def456ghi789.mp4', ...extra });
  assert.equal(video({ nome: 'promo-de-natal.mp4' }), 'Promo de natal');
  assert.equal(video({ titulo: 'Abertura da loja' }), 'Abertura da loja');
  assert.equal(video(), 'Vídeo');
  assert.equal(C.itemSummary({ type: 'video', src: '' }), 'Vídeo (sem arquivo)');
  // Nenhum "Imagem" sobrou no resumo.
  assert.doesNotMatch(ler('web/src/lib/contentTypes.js'), /summary: \(i\) => i\.src \? 'Imagem'/);
});

test('o nome do arquivo vai junto com a foto: no Subir, no Adicionar e no campo da peça', async () => {
  const U = await importar('web/src/lib/subir.js');
  assert.deepEqual(U.itemDaMidia({ url: '/media/t/x.jpg', nome: 'foto-vitrine_2.jpg' }), { type: 'image', src: '/media/t/x.jpg', fit: 'contain', fundo: '', duracao: 10, nome: 'foto-vitrine_2.jpg' });
  assert.equal(U.itemDaMidia({ url: '/media/t/x.mp4', video: true, nome: 'promo.mp4' }).nome, 'promo.mp4');
  assert.equal('nome' in U.itemDaMidia({ url: '/media/t/x.jpg' }), false, 'sem nome, sem a chave');
  assert.match(ler('web/src/components/content/SubirConteudo.jsx'), /itemDaMidia\(\{ url: x\.url, fundo: x\.fundo, video: x\.video, nome: x\.nome \}\)/);
  const t = ler('web/src/components/content/TypePicker.jsx');
  assert.match(t, /itemDaMidia\(\{ url: r\.url, fundo: prep\.fundo, video, nome: f\.name \}\)/);
  assert.match(t, /itemDaMidia\(\{ url: m\.url, video, nome: m\.name \}\)/);
  assert.match(ler('web/src/components/content/MediaField.jsx'), /onChange\(res\.url, file\.name \|\| res\.name \|\| ''\);/);
  assert.match(ler('web/src/components/content/ItemForm.jsx'), /f\.key === 'src' \? onChange\(\{ \.\.\.item, src: v, nome: nome \|\| undefined \}\) : set\(f\.key, v\)/);
  // O nome do arquivo não conta palavra na TV (o tempo da foto é o dela).
  const R = require('../js/rodizio.js');
  assert.equal(R.palavrasDe({ type: 'image', src: '/x.jpg', nome: 'uma foto com muitas palavras no nome.jpg' }), 0);
});

/* ---------------- axe e o violeta ---------------- */

test('axe: o botão "As cores da minha marca" tem o título como nome e a frase como descrição', () => {
  const f = ler('web/src/components/content/SettingsForm.jsx');
  assert.match(f, /aria-pressed=\{usaMarca\} aria-labelledby=\{idMarca \+ '-nome'\} aria-describedby=\{idMarca \+ '-desc'\}/);
  assert.match(f, /<span id=\{idMarca \+ '-nome'\}>As cores da minha marca<\/span>/);
  assert.match(f, /<span id=\{idMarca \+ '-desc'\} className="mt-1 block text-2xs text-ink-3">/);
  // As bolinhas de cor são enfeite: fora da árvore de acessibilidade.
  assert.match(f, /<span className="flex gap-1" aria-hidden="true">\{coresMarca/);
});

test('um violeta por tela nos Ajustes da TV: o "Pôr na TV"; vestir a data e trocar a divisão são de apoio', () => {
  assert.match(ler('web/src/components/content/SeasonBanner.jsx'), /<Button size="sm" variant="secondary" icon=\{CalendarDays\}/);
  const f = ler('web/src/components/content/SettingsForm.jsx');
  assert.match(f, /<Button size="sm" variant="secondary" onClick=\{\(\) => \{ set\(\{ layoutId: trocaPendente\.id \}\); setTrocaPendente\(null\); \}\}>Trocar assim mesmo<\/Button>/);
  assert.doesNotMatch(ler('web/src/components/content/AmbienteESenha.jsx'), /variant="primary"/);
});
