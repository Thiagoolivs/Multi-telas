/*
 * Rodada 3: o painel coerente com o Criar (docs/EXECUTOR.md, §2c).
 *
 * O dono, testando a rodada 2: "está tudo bom até eu clicar em Conteúdo".
 * A página da TV, as Mídias e Meus Designs ainda falavam a língua de antes
 * do Criar conversando. Cada teste aqui segura um item da rodada.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const RAIZ = path.join(__dirname, '..');
const ler = (...p) => fs.readFileSync(path.join(RAIZ, ...p), 'utf8');
// Só o que aparece: comentário não é botão.
const semComentarios = (s) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ').replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ');

test('item 28: um caminho de IA só — a TV leva ao Criar, sem o formulário antigo', () => {
  const tv = semComentarios(ler('web/src/pages/ContentEditorPage.jsx'));
  assert.doesNotMatch(tv, />Campanha com IA</, 'o botão do formulário antigo voltou');
  assert.doesNotMatch(tv, /A IA monta tudo/);
  assert.doesNotMatch(tv, /setCampOpen\(true\)/, 'nenhum botão abre o formulário antigo');
  assert.match(tv, /onClick=\{onCriar\}>Criar para esta TV</);
  assert.match(tv, /onClick=\{\(\) => onCriar && onCriar\(\)\}/, 'a tela vazia começa pelo Criar');
  // Esconder antes de apagar: o diálogo fica no código, sem botão.
  assert.match(tv, /function CampaignDialog\(/);
  const md = semComentarios(ler('web/src/pages/MyDesignsPage.jsx'));
  assert.doesNotMatch(md, /title: 'Campanha completa com IA'/);
  // A campanha antiga que ainda estava gerando volta sozinha.
  assert.match(md, /ai\.jobPendente\(\)/);
});

test('item 29: Campanhas é a casa da campanha — uma vez, com estado, TVs e o mesmo resultado do Criar', async () => {
  const { pathToFileURL } = require('node:url');
  const M = await import(pathToFileURL(path.join(RAIZ, 'web/src/lib/menu.js')).href);
  assert.deepEqual(M.GRUPOS.find((g) => g.id === 'criar').paginas, ['criar', 'campanhas', 'designs']);
  assert.equal(M.paginaDoIr('campanhas'), 'campanhas');
  const app = ler('web/src/App.jsx');
  assert.match(app, /case 'campanhas': return <CampanhasPage key=\{route\.campanha \|\| ''\} campanhaInicial=\{route\.campanha\} onIr=\{go\} \/>;/);
  const p = semComentarios(ler('web/src/pages/CampanhasPage.jsx'));
  assert.match(p, /criar\.campanhas\(\)/);
  assert.match(p, /<ResultadoCampanha campanha=\{aberta\}[\s\S]*acoes=\{<PorPraRodar campanha=\{aberta\} telas=\{telas\} onMudou=\{mudou\} \/>\}/, 'abrir é o mesmo resultado do Criar');
  for (const e of ['No ar', 'Pausada', 'Pronta']) assert.match(p, new RegExp("rotulo: '" + e + "'"));
  // A campanha não é mais copiada para Meus Designs, e a lista traz só a capa.
  const rota = semComentarios(ler('server/routes/campanhas.js'));
  assert.doesNotMatch(rota, /addLibrary/);
  assert.equal((rota.match(/capa: capaDe\(/g) || []).length, 4, 'toda gravação de resultado atualiza a capa');
  for (const f of ['server/db-sqlite.js', 'server/db-postgres.js']) assert.match(ler(f), /capa/, f);
});

test('itens 30 e 31: a faixa é uma lista, as campanhas da TV se contam e se tiram, a TV é desenhada', async () => {
  const { pathToFileURL } = require('node:url');
  const T = await import(pathToFileURL(path.join(RAIZ, 'web/src/lib/tela.js')).href);
  const a = { type: 'peca-html', html: 'a', _campanha: 'Pão' };
  const b = { type: 'peca-html', html: 'b' };
  assert.deepEqual(T.pecasDaFaixa({ peca: b }), [b], 'a peça única de antes vale como lista');
  assert.deepEqual(T.pecasDaFaixa({ pecas: [a, b], peca: a }), [a, b]);
  assert.deepEqual(T.comPecas({ header: true }, [b, a]), { header: true, pecas: [b, a], peca: b }, 'a primeira é a da TV antiga');
  assert.deepEqual(T.comPecas({ header: true, pecas: [a], peca: a }, []), { header: true }, 'vazia volta ao automático');
  const cfg = { zonas: {
    principal: { items: [{ type: 'text', titulo: 'meu' }, { type: 'peca-html', _campanha: 'Pão' }] },
    cabecalho: { header: true, pecas: [a, b], peca: a },
    rodape: { peca: { type: 'peca-html', _campanha: 'Pão' }, messages: ['Pix'] },
  } };
  assert.deepEqual(T.campanhasDaConfig(cfg), [{ nome: 'Pão', pecas: 3 }]);
  const sem = T.semCampanha(cfg, 'Pão');
  assert.deepEqual(sem.zonas.principal.items, [{ type: 'text', titulo: 'meu' }]);
  assert.deepEqual(sem.zonas.cabecalho.pecas, [b], 'o estilo que não é da campanha fica');
  assert.deepEqual(sem.zonas.cabecalho.peca, b);
  assert.equal(sem.zonas.rodape.peca, undefined);
  assert.deepEqual(sem.zonas.rodape.messages, ['Pix']);
  assert.equal(cfg.zonas.cabecalho.pecas.length, 2, 'não mexe na config recebida');
  // A grade da miniatura: vh vira fr na mesma proporção.
  assert.equal(T.emFr('12vh 1fr 11vh'), 'minmax(2.1rem, 12.00fr) 77.00fr minmax(2.1rem, 11.00fr)');
  assert.equal(T.emFr('3fr 1.1fr'), '73.17fr 26.83fr');
  assert.equal(T.proporcaoDoLayout({ orientation: 'portrait' }), '9 / 16');
  // A página da TV usa as peças da faixa, o desenho e as campanhas.
  const tv = semComentarios(ler('web/src/pages/ContentEditorPage.jsx'));
  assert.match(tv, /<MapaDaTela layout=\{layoutCanonico\} ativa=\{activeZone && activeZone\.id\} onEscolher=\{selectZone\} resumo=\{resumoDaZona\} \/>/);
  assert.match(tv, /<CampanhasNaTela cfg=\{cfg\} onTirar=\{tirarCampanha\}/);
  assert.doesNotMatch(tv, /function PecaDaZona/, 'a peça única de antes saiu');
  const faixa = semComentarios(ler('web/src/components/tela/FaixaDaTela.jsx'));
  assert.match(faixa, /\[\['pecas', 'Peças e avisos', Layers\], \['noticias', 'Notícias', Newspaper\]\]/, 'o rodapé com dois modos');
  assert.match(faixa, /\{modo === 'pecas' \? \(/);
  assert.match(faixa, /<TickerEditor zone=\{z\} onChange=\{onChange\} \/>/, 'as notícias só no modo Notícias');
  assert.match(faixa, /type="datetime-local"/, 'a contagem regressiva');
});
