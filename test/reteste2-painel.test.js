/*
 * Reteste 2 (09/11): o painel e a velocidade. O que ele achou e foi
 * corrigido aqui — as prévias que não mostravam a TV, a Primeira TV com 16
 * toques, a volta longa escondida, a IA sem o "Quando", o Prontos e o Telas
 * lentos, o Suporte, a logo no fundo escuro e a busca em Telas.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const RAIZ = path.join(__dirname, '..');
const ler = (f) => fs.readFileSync(path.join(RAIZ, f), 'utf8');
const semComentarios = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '');

/* ---------- 1. As prévias mostram a TV de verdade ---------- */

test('Aprovações: o antes e o depois são o próprio player (TvAoVivo), não o desenho que saía vazio', () => {
  const a = semComentarios(ler('web/src/pages/AprovacoesPage.jsx'));
  assert.doesNotMatch(a, /PreviaDaTela/, 'o desenho vazio voltou');
  assert.match(a, /import \{ TvAoVivo \} from '\.\.\/components\/tela\/TvAoVivo\.jsx';/);
  assert.match(a, /<ATv cfg=\{t\.antes\} rotulo="Antes \(agora na TV\)" \/>/);
  assert.match(a, /<ATv cfg=\{t\.depois\} rotulo="Depois \(se aprovar\)" \/>/);
  assert.match(a, /<TvAoVivo cfg=\{cfg\} alturaMaxima=\{260\} rotulo=\{rotulo\} \/>/);
  // O antes e o depois chegam como o painel vê (a marca e o nome da conta), pela mesma limpeza do GET /config.
  const r = ler('server/routes/aprovacoes.js');
  assert.match(r, /const vista = await ctx\.publicar\.vistaDoPainel\(sess\.tenant_id\);/);
  assert.match(r, /if \(t\.antes\) t\.antes = vista\(t\.antes, d\) \|\| t\.antes;/);
  assert.match(r, /if \(t\.depois\) t\.depois = vista\(t\.depois, d\) \|\| t\.depois;/);
  assert.match(ler('server/routes/telas.js'), /return configParaOPainel\(Object\.assign\(\{\}, device \|\| \{\}, \{ config: JSON\.stringify\(cfg\) \}\), empresa, kit\);/);
});

test('"Ver agora" em Telas: o player com a programação da TV e o item que ela contou estar no ar', () => {
  const v = ler('web/src/components/content/VerTelaAgora.jsx');
  assert.match(v, /import \{ TvAoVivo \} from '\.\.\/tela\/TvAoVivo\.jsx';/);
  assert.match(v, /lerProgramacao\(target\.id, target\.updatedAt \|\| 0\)/);
  assert.match(v, /<TvAoVivo cfg=\{programacao\} estado=\{resposta\.estado\}/);
  // Sem programação, o desenho de antes; e a frase não diz mais "desenhado aqui no painel".
  assert.match(v, /: <Palco estado=\{resposta\.estado\} em=\{resposta\.em\} \/>\)/);
  assert.doesNotMatch(semComentarios(v), /desenhado aqui no painel/);
});

/* ---------- 2. Sua primeira TV em 5 minutos: ≤ 15 toques ---------- */

test('Primeira TV: a foto do celular em dois toques, e o banco do negócio com a foto que vale num toque', () => {
  const f = ler('web/src/components/primeira-tv/FotoDoPasso.jsx');
  assert.match(f, /<EscolherArquivo accept="image\/png,image\/jpeg,image\/webp" onChange=\{doCelular\}/);
  assert.match(f, /Usar uma foto do celular/);
  assert.match(f, /onTrocar\(\(await subirFotoDoCelular\(f\)\)\.src\)/);
  assert.match(f, /abaInicial=\{ramo && !valor \? 'banco' : 'celular'\} umToque/);
  // Um violeta por tela no passo: o botão da foto do celular não é violeta.
  assert.doesNotMatch(f, /variant="primary"|bg-accent text-accent-fg/);
  const t = ler('web/src/components/fotos/TrocarFoto.jsx');
  assert.match(t, /if \(umToque && !ajustar\) \{/);
  assert.match(t, /escolher\(\{ src: atual\.src, foco: atual\.foco, poster: atual\.poster \}, \{ ajustar: true \}\)/, '"Ajustar o ponto" ainda abre o passo do ponto');
  assert.match(t, /\{!\(umToque && fase !== 'foco'\) && \(/, 'no um toque, o "Usar esta foto" apagado não aparece na escolha');
  assert.match(t, /export async function subirFotoDoCelular\(f\)/);
  // O robô dos 5 minutos segue o caminho de hoje (o reteste 2 achou ele quebrado).
  const robo = ler('tools/cinco-minutos.mjs');
  assert.match(robo, /p\.getByRole\('button', \{ name: 'Usar uma foto do celular' \}\)/);
  assert.match(robo, /process\.env\.CINCO_FOTO === 'banco'/);
  assert.match(robo, /trocar\.getByRole\('button', \{ name: \/\^Usar \/ \}\)\.first\(\)/);
});

/* ---------- 3. A volta longa à vista, e a IA com o "Quando" e o Desfazer ---------- */

const { pathToFileURL } = require('node:url');
const importar = (f) => import(pathToFileURL(path.join(RAIZ, f)).href);

test('a volta de 9 min no balcão é AVISO (não "tudo certo · 1 dica"), com o botão à vista no alto da página', async () => {
  const D = await importar('web/src/lib/screenDigest.js');
  const itens = Array.from({ length: 33 }, (_, i) => ({ type: 'announce', titulo: 'Peça ' + (i + 1) + ' da padaria, com o texto do dia', corpo: 'Venha conferir com a gente.', duracao: 12 }));
  const d = D.digest({ settings: { layoutId: 'full' }, zonas: { principal: { items: itens } } }, null, 'comercio');
  const p = d.problemas.find((x) => x.volta);
  assert.ok(p, 'a volta longa sumiu do resumo');
  assert.equal(p.nivel, 'aviso', 'a volta longa voltou a ser dica');
  assert.ok(p.volta.ciclo > p.volta.max, 'volta ' + p.volta.ciclo + ' > ' + p.volta.max);
  assert.match(p.texto, /no balcão a pessoa fica uns 5min e não vê tudo/);
  // A volta curta continua dica.
  const curta = D.digest({ settings: { layoutId: 'full' }, zonas: { principal: { items: itens.slice(0, 2) } } }, null, 'comercio');
  assert.ok(curta.problemas.every((x) => !x.volta), 'a volta curta virou volta longa');

  const r = ler('web/src/components/content/ScreenSummary.jsx');
  assert.match(r, /export function AvisoDeVolta\(\{ cfg, aoArrumar \}\)/);
  assert.match(r, /role="alert"/);
  assert.match(r, /\{p\.volta && aoArrumar && \(/);
  assert.match(r, /\{p\.volta && aoArrumar && !comFaixa && \(/, 'o resumo repetia o botão que já está no alto');
  const pagina = ler('web/src/pages/ContentEditorPage.jsx');
  assert.match(pagina, /<AvisoDeVolta cfg=\{cfg\} aoArrumar=\{arrumarVolta\} \/>\s*<div className="mb-4 grid gap-4/, 'a faixa não está no alto, antes da TV');
});

test('a campanha da IA vai ao ar com o "Quando" e o Desfazer, como todo caminho', async () => {
  const R = await importar('web/src/lib/rodar.js');
  const cfg = { settings: { layoutId: 'corporate' }, zonas: {
    principal: { items: [{ type: 'text', titulo: 'meu aviso' }, { type: 'text', titulo: 'da campanha', _campanha: 'Pão em dobro' }] },
    lateral: { items: [{ type: 'text', titulo: 'lado', _campanha: 'Pão em dobro' }] },
    cabecalho: { header: true, pecas: [{ type: 'peca-html', _campanha: 'Pão em dobro' }] } } };
  assert.equal(R.quandoNaCampanha(cfg, 'Pão em dobro', { quando: 'sempre' }), cfg, '"Sempre" não muda nada');
  const hoje = R.quandoNaCampanha(cfg, 'Pão em dobro', { quando: 'hoje' });
  assert.ok(!hoje.zonas.principal.items[0].agendamento, 'mexeu no que não é da campanha');
  assert.equal(hoje.zonas.principal.items[1].agendamento.ativo, true);
  assert.ok(hoje.zonas.principal.items[1].agendamento.dataFim, 'só hoje sem data para sair');
  assert.equal(hoje.zonas.lateral.items[0].agendamento.ativo, true);
  assert.ok(!cfg.zonas.principal.items[1].agendamento, 'mexeu na programação recebida');
  const tarde = R.quandoNaCampanha(cfg, 'Pão em dobro', { quando: 'hora', faixa: 'tarde' });
  assert.equal(tarde.zonas.principal.items[1].agendamento.escolhido, true);
  assert.match(ler('web/src/lib/rodar.js'), /quandoNaCampanha\(aplicarCampanha\(cfg, plano\.find\(\(p\) => p\.tela\.id === tv\.id\)\.entrada, nome, \{ trocarLayout \}\), nome, quando\)/);

  const c = ler('web/src/components/criar/PorPraRodar.jsx');
  assert.match(c, /<EscolherQuando valor=\{escolha\} onChange=\{setEscolha\} \/>/);
  assert.match(c, /rodarCampanha\(plano, nome, \{ trocarLayout: trocar, quando \}\)/);
  assert.match(c, /acao: \{ rotulo: 'Desfazer', on: async \(\) => \{/);
  assert.match(c, /await desfazerLote\(ids\.lote\)/);
  assert.match(c, /disabled=\{ocupado \|\| !plano \|\| !plano\.length \|\| faltaData\(escolha\)\}/);
  assert.equal((c.match(/variant="primary"/g) || []).length, 1, 'um violeta só');
});

/* ---------- 4. Velocidade ---------- */

test('Prontos: o manifesto e o HTML das peças aprovadas num pacote só, com ETag', () => {
  const C = require('../server/conteudoPronto.js');
  const manifesto = C.lerManifesto(RAIZ);
  const p = C.montarPacote(RAIZ, []);
  const corpo = JSON.parse(p.corpo.toString('utf8'));
  const aprovadas = manifesto.pecas.filter((x) => !x.estado || x.estado === 'aprovada');
  assert.equal(corpo.manifesto.soAprovadas, true);
  assert.deepEqual(corpo.manifesto.pecas.map((x) => x.id), aprovadas.map((x) => x.id), 'o pacote leva só as peças que o cliente vê');
  assert.ok(corpo.manifesto.telas.every((t) => t.estado === 'aprovada'));
  assert.deepEqual(corpo.manifesto.marcas, manifesto.marcas, 'as marcas de exemplo vão junto (telasProntas, nomesDeExemplo)');
  for (const x of aprovadas) assert.equal(corpo.html[x.id], fs.readFileSync(path.join(RAIZ, 'pecas-ouro', x.id + '.html'), 'utf8'), x.id);
  assert.match(p.etag, /^"[0-9a-f]{32}"$/);
  assert.equal(C.montarPacote(RAIZ, []), p, 'montado de novo a cada pedido');
  // Uma decisão da galeria muda o pacote (e o ETag).
  const proposta = manifesto.pecas.find((x) => x.estado === 'proposta');
  if (proposta) {
    const com = C.montarPacote(RAIZ, [{ tipo: 'peca', id: proposta.id, estado: 'aprovada', decidido_em: Date.now() }]);
    assert.notEqual(com.etag, p.etag);
    assert.ok(JSON.parse(com.corpo).html[proposta.id], 'a peça aprovada na galeria não entrou no pacote');
  }
  const s = ler('server.js');
  assert.match(s, /if \(urlPath === '\/pecas-ouro\/pacote\.json'\) \{/);
  assert.match(s, /'Cache-Control': 'public, max-age=60, stale-while-revalidate=604800'/);
  assert.match(s, /res\.writeHead\(304, cab\)/);
  // O painel: um pedido, o desenhista em paralelo, e começando junto com a página.
  const pac = ler('web/src/lib/pacoteOuro.js');
  assert.match(pac, /fetch\('\/pecas-ouro\/pacote\.json'\)/);
  assert.match(pac, /fetch\('\/pecas-ouro\/manifesto\.json'\)/, 'sem o pacote, o caminho de antes');
  const mo = ler('web/src/lib/modelosOuro.js');
  assert.match(mo, /Promise\.all\(\[carregarDesenhista\(\), carregarManifesto\(\)\]\)/);
  assert.match(mo, /htmlDaPeca\(p\.id\)/);
  assert.doesNotMatch(semComentarios(mo), /fetch\(/, 'uma peça por pedido voltou');
  assert.doesNotMatch(semComentarios(ler('web/src/lib/telasProntas.js')), /fetch\('\/pecas-ouro\/manifesto\.json'\)/, 'o manifesto vinha duas vezes');
  assert.match(ler('web/src/App.jsx'), /if \(route\.name !== 'prontos' \|\| deslogado\) return;\s*carregarPacote\(\)/);
});

test('o desenhista das miniaturas num pedido só, e a miniatura só desenha quando aparece', () => {
  const T = require('../server/pacote-tv.js');
  const d = T.pacoteDoDesenhista(RAIZ);
  assert.ok(d && d.js, 'o pacote do desenhista não montou');
  for (const s of T.DO_DESENHISTA) assert.ok(d.js.includes('/* ==== ' + s + ' ==== */'), s);
  assert.deepEqual(T.DO_DESENHISTA, ['js/cor.js', 'js/fontes.js', 'js/animacao.js', 'js/tokens.js', 'js/peca-html.js', 'js/peca-render.js']);
  assert.match(ler('server.js'), /if \(urlPath === pacoteTv\.URL_DESENHISTA\) \{/);
  const h = ler('web/src/lib/pecaHtml.js');
  assert.match(h, /carregando = script\('\/js\/desenhista\.pacote\.js'\)/);
  assert.match(h, /\.catch\(\(\) => Promise\.all\(SCRIPTS\.map\(\(src\) => script\(src\)\)\)\)/, 'sem o pacote, os soltos em paralelo');
  assert.match(h, /await carregarConferidor\(\);/, 'conferir ainda carrega as regras e o conferidor');
  const ph = ler('web/src/components/content/PecaHtml.jsx');
  assert.match(ph, /new IntersectionObserver\(\(v\) => \{ if \(v\.some\(\(x\) => x\.isIntersecting\)\) setVisivel\(true\); \}, \{ rootMargin: '300px' \}\)/);
  assert.match(ph, /if \(!visivel\) return undefined;/);
  // O editor e as redes do Prontos só quando se usa.
  const pp = ler('web/src/pages/PecasProntasPage.jsx');
  assert.match(pp, /const EditarPeca = lazy\(/);
  assert.doesNotMatch(pp, /^import \{ EditarPeca \}/m);
  assert.doesNotMatch(ler('web/src/pages/TelasProntasPage.jsx'), /^import \{ EditarPeca \}/m);
});
