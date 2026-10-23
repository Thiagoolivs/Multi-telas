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
  // Desde o D10, em páginas, com busca e as arquivadas à parte.
  assert.match(p, /criar\.campanhas\(\{ q: busca\.trim\(\), arquivadas, pular \}\)/);
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

test('item 32: adicionar numa zona começa pelo que já existe e cabe nela', async () => {
  const { pathToFileURL } = require('node:url');
  const T = await import(pathToFileURL(path.join(RAIZ, 'web/src/lib/tela.js')).href);
  const principal = { id: 'principal', type: 'playlist' };
  const lateral = { id: 'lateral', type: 'playlist', formato: 'retrato' };
  const cab = { id: 'cabecalho', type: 'header' };
  const rod = { id: 'rodape', type: 'ticker' };
  assert.deepEqual([principal, lateral, cab, rod].map(T.papelDaZona), ['principal', 'lateral', 'cabecalho', 'rodape']);
  assert.equal(T.papelDaZona({ id: 'secundaria', type: 'playlist' }), 'lateral', 'em pé, a secundária é a lateral');
  const deitada = { formato: '16/9', papel: 'destaque', item: { type: 'peca-html' } };
  const emPe = { formato: '9/16', papel: 'lateral', item: { type: 'peca-html' } };
  const faixaCab = { formato: '21/9', papel: 'cabecalho', item: { type: 'peca-html' } };
  assert.equal(T.cabeNaZona(deitada, principal), 2);
  assert.equal(T.cabeNaZona(emPe, principal), 1, 'cabe, com outra orientação');
  assert.equal(T.cabeNaZona(emPe, lateral), 2);
  assert.equal(T.cabeNaZona(faixaCab, principal), 0, 'peça de faixa não vai para a zona grande');
  assert.equal(T.cabeNaZona(deitada, cab), 0, 'peça grande não vai para a faixa');
  assert.equal(T.cabeNaZona(faixaCab, cab), 2);
  assert.equal(T.cabeNaZona(faixaCab, rod), 0, 'cabeçalho não vai para o rodapé');
  const p = semComentarios(ler('web/src/components/content/TypePicker.jsx'));
  assert.match(p, /criar\.pecasProntas\(\)/, 'as peças das campanhas');
  assert.match(p, /library\.list\(\)/, 'e as da biblioteca');
  assert.match(p, /\['prontas', 'Peças prontas', Layers\], \['midia', 'Fotos e vídeos', ImageIcon\], \['inicio', 'Tipos prontos', LayoutGrid\], \['new', 'Todos os tipos', Plus\]/, 'a ordem: o que existe, mídia, tipos');
  assert.match(p, /Criar novo com a IA/);
  const tv = semComentarios(ler('web/src/pages/ContentEditorPage.jsx'));
  assert.match(tv, /onCriar=\{onCriar \? \(\) => onCriar\(papelDaZona\(activeZone\)\) : null\}/, 'o Criar novo leva a zona');
  assert.match(tv, /next\.zonas\[activeZone\.id\] = comPecas\(z, pecasDaFaixa\(z\)\.concat\(/, 'na faixa, entra na lista que gira');
  const c = semComentarios(ler('web/src/pages/CriarPage.jsx'));
  assert.match(c, /if \(zona && base\.telas\[0\]\.zonas\[zona\]\)/, 'o cartão já pede só aquela zona');
  assert.match(ler('server/routes/campanhas.js'), /parts\[2\] === 'pecas'/);
});

test('item 33: Ajustes da tela por tarefa, com o desenho do layout e o horário num formulário só', () => {
  const f = semComentarios(ler('web/src/components/content/SettingsForm.jsx'));
  assert.match(f, /\['aparencia', 'Aparência', Palette\], \['encaixe', 'Encaixe', Maximize\], \['som', 'Som', Music\],\s*\['horario', 'Horário', Clock\], \['avancado', 'Avançado', SlidersHorizontal\]/);
  assert.match(f, /<MiniLayout id=\{l\.id\} \/>/, 'o layout escolhido olhando o desenho');
  assert.match(f, /As cores da minha marca/, 'a marca vem primeiro, e o tema é a opção');
  assert.match(f, /Nome no cabeçalho/);
  assert.match(f, /const saem = zonasQueSaem\(zonas, id\);/, 'trocar o layout diz o que muda nas zonas');
  assert.match(f, /await devices\.expediente\(deviceId, exp\)/);
  assert.match(f, /aria-label="Margem contra o corte da TV"/);
  assert.match(ler('web/src/pages/ContentEditorPage.jsx'), /deviceId=\{device\.id\} device=\{device\} zonas=\{cfg\.zonas\}/);
});

test('item 34: Mídias por propósito, com as peças prontas e o disco discreto', async () => {
  const { pathToFileURL } = require('node:url');
  const R = await import(pathToFileURL(path.join(RAIZ, 'web/src/lib/rodar.js')).href);
  const cfg = { settings: { layoutId: 'corporate' }, zonas: { principal: { items: [{ type: 'text' }] }, cabecalho: { header: true } } };
  const deitada = R.aplicarPeca(cfg, { item: { type: 'peca-html', html: 'a' }, formato: '16/9', campanha: 'Pão' });
  assert.equal(deitada.zonas.principal.items.length, 2, 'entra no fim, sem tirar nada');
  assert.equal(deitada.zonas.principal.items[1]._campanha, 'Pão');
  const emPe = R.aplicarPeca(cfg, { item: { type: 'peca-html', html: 'b' }, formato: '9/16' });
  assert.equal(emPe.zonas.lateral.items.length, 1, 'em pé vai para a lateral');
  const cab = R.aplicarPeca(cfg, { item: { type: 'peca-html', html: 'c', papel: 'cabecalho' }, papel: 'cabecalho' });
  assert.equal(cab.zonas.cabecalho.pecas.length, 1, 'faixa vai para a lista do cabeçalho');
  assert.equal(cab.zonas.cabecalho.peca.html, 'c');
  const semFaixa = R.aplicarPeca({ settings: { layoutId: 'full' }, zonas: {} }, { item: { html: 'd' }, papel: 'rodape' });
  assert.deepEqual(semFaixa.zonas, {}, 'sem rodapé na TV, a faixa não vira peça espremida na principal');
  const s = semComentarios(ler('web/src/pages/StoragePage.jsx'));
  for (const t of ["titulo: 'Fotos e vídeos'", "titulo: 'Músicas'", "titulo: 'Da IA'"]) assert.ok(s.includes(t), t);
  assert.match(s, /pertence: \(m\) => m\.origem === 'ia'/);
  assert.doesNotMatch(s, /<Progress/, 'o disco não é mais o destaque');
  const p = semComentarios(ler('web/src/pages/PecasProntasPage.jsx'));
  assert.match(p, /await porPecaNasTelas\(porNaTv, alvos, telas\);/);
  assert.match(p, /criar\.pecasProntas\(\)/);
});

test('item 35: a data de hoje é ideia no Criar e no Início, não aviso no topo da TV', async () => {
  const { pathToFileURL } = require('node:url');
  const D = await import(pathToFileURL(path.join(RAIZ, 'web/src/lib/ideiaDaData.js')).href);
  assert.equal(D.ideiaDaData(null), null);
  const i = D.ideiaDaData({ id: 'outubro-rosa', label: 'Outubro Rosa', emoji: '🎀' });
  assert.equal(i.titulo, '🎀 Outubro Rosa');
  assert.ok(i.brief.includes('Outubro Rosa') && i.daData);
  const tv = semComentarios(ler('web/src/pages/ContentEditorPage.jsx'));
  assert.match(tv, /\{false && cfg && <SeasonBanner/, 'escondido, não apagado');
  const c = semComentarios(ler('web/src/pages/CriarPage.jsx'));
  assert.match(c, /\(daData \? \[daData, \.\.\.ideias\] : ideias\)\.slice\(0, 3\)/, 'a data é a primeira ideia');
  assert.match(c, /if \(ideia && ideiaInicial === 'data'\) usarIdeia\(ideia\);/);
  assert.match(semComentarios(ler('web/src/pages/DashboardPage.jsx')), /onIr\('criar', \{ ideia: 'data' \}\)/);
  assert.match(ler('web/src/App.jsx'), /ideiaInicial=\{route\.ideia\}/);
});

test('item 38: a TV recém-pareada recebe a campanha inteira, e não uma peça solta', async () => {
  const { pathToFileURL } = require('node:url');
  const R = await import(pathToFileURL(path.join(RAIZ, 'web/src/lib/rodar.js')).href);
  const entrada = (alvo, n) => ({ alvo, zonas: {
    principal: [{ item: { type: 'peca-html', html: 'p' + n }, formato: '16/9' }], lateral: [],
    cabecalho: { pecas: [{ type: 'peca-html', html: 'c' }], vivos: [], mensagens: [] },
    rodape: { pecas: [{ type: 'peca-html', html: 'r' }], vivos: [], mensagens: ['oi'], contagem: '' } } });
  const res = { telas: [entrada({ tipo: 'tela', id: 'tv_que_sumiu' }, 1), entrada({ tipo: 'todas' }, 2)] };
  assert.equal(R.entradaParaTvNova(res).alvo.tipo, 'todas', '"todas as TVs" vale para a TV nova');
  assert.equal(R.entradaParaTvNova({ telas: [entrada({ tipo: 'tela', id: 'x' }, 1)] }).alvo.id, 'x', 'sem "todas", a primeira');
  assert.equal(R.entradaParaTvNova({}), null);
  const s = semComentarios(ler('web/src/pages/ScreensPage.jsx'));
  assert.doesNotMatch(s, /library\.list\(\)/, 'a última peça da biblioteca não vai mais sozinha');
  assert.match(s, /lista\.find\(\(c\) => c\.estado === 'no_ar'\) \|\| lista\[0\]/, 'a campanha no ar vem primeiro');
  assert.match(s, /await criar\.marcar\(c\.id, 'no_ar', \[\.\.\.new Set\(\[\.\.\.\(c\.telas \|\| \[\]\), pareada\.id\]\)\]\);/, 'a TV entra na lista da campanha');
  assert.match(ler('web/src/App.jsx'), /onCriar=\{\(device\) => go\('criar', \{ tela: device\.id \}\)\}/);
});

test('item 39: o exemplo "Raft Embalagens" não vai mais para a TV de cliente', () => {
  const S = require('../js/storage.js');
  assert.equal(S.normalize({ settings: { layoutId: 'full' }, zonas: {} }).settings.titulo, '', 'o título padrão é vazio');
  const vazado = S.normalize({ settings: { nome: 'TV da vitrine', titulo: 'Raft Embalagens' }, zonas: {} });
  assert.equal(vazado.settings.titulo, '', 'o título que vazou some ao normalizar');
  assert.equal(S.sampleConfig().settings.titulo, 'Raft Embalagens', 'a demonstração continua com o nome dela');
  const t = ler('server/routes/telas.js');
  assert.match(t, /if \(empresa && \(!s\.nome \|\| s\.nome === device\.name\)\) \{ s\.nome = empresa; mudou = true; \}/);
  assert.match(t, /nomeDaConta\(cfg, device, await empresaDa\(device\.tenant_id\)\);/, 'ao gravar');
  // Desde o D8 a entrega também leva a logo: o nome da conta continua passando por aqui.
  assert.match(t, /let mudou = !!\(c && c\.settings && nomeDaConta\(c, device, await empresaDa\(device\.tenant_id\)\)\);/, 'ao entregar à TV');
  assert.match(t, /if \(mudou\) corpo = JSON\.stringify\(c\);/);
});

test('item 40: Programação tem aba própria; Telas fica com o aparelho', async () => {
  const { pathToFileURL } = require('node:url');
  const M = await import(pathToFileURL(path.join(RAIZ, 'web/src/lib/menu.js')).href);
  const ids = M.GRUPOS.map((g) => g.id);
  assert.equal(ids.indexOf('programacao'), ids.indexOf('telas') + 1, 'entre Telas e Criar');
  assert.equal(M.paginaDoIr('programacao'), 'programacao');
  const app = ler('web/src/App.jsx');
  assert.match(app, /case 'programacao': return <ProgramacaoPage onIr=\{go\} \/>;/);
  assert.match(app, /onBack=\{\(\) => go\('programacao'\)\}/, 'voltar do editor volta para a Programação');
  assert.match(app, /if \(r\.name === 'content'\) return '\/app\/\?ir=programacao';/);
  const p = semComentarios(ler('web/src/pages/ProgramacaoPage.jsx'));
  // Desde o D3 a parte tocada abre o editor JÁ nela (antes ignorava a zona).
  assert.match(p, /<MapaDaTela layout=\{layout\} onEscolher=\{\(z\) => editar\(d, z && z\.id\)\} resumo=\{resumoDaZona\(cfg\)\} \/>/);
  assert.match(p, /onIr\('content', \{ device: d, \.\.\.\(zona \? \{ zona \} : \{\}\) \}\)/);
  assert.doesNotMatch(ler('js/seasons.js'), /Raft/, 'os pacotes de data não falam da empresa de exemplo');
});

test('item 41: o player passa as peças da TV para o tema; o painel escolhe o fundo', () => {
  const p = ler('js/player.js');
  assert.equal(p.split('MTTheme.apply(cfg.settings.theme, null, { pecas: MTTheme.pecasDaConfig && MTTheme.pecasDaConfig(cfg) })').length - 1, 2);
  const f = ler('web/src/components/content/SettingsForm.jsx');
  assert.match(f, /Fundo da TV/);
  assert.match(f, /delete n\.bg; delete n\.bg2;/, 'escolher o fundo apaga o fundo pintado à mão');
  assert.match(ler('web/src/lib/fundoDaTV.js'), /\['pecas', 'Combinar com as peças'/);
});

test('item 42: Meus Designs publica faixa na faixa, pelo mesmo caminho das Peças prontas', async () => {
  const { pathToFileURL } = require('node:url');
  const api = await import(pathToFileURL(path.join(RAIZ, 'web/src/api.js')).href);
  const P = await import(pathToFileURL(path.join(RAIZ, 'web/src/lib/publicar.js')).href);
  let salva = { settings: { layoutId: 'corporate' }, zonas: { principal: { items: [] }, cabecalho: { header: true } } };
  // Desde o D0.5 a gravação lê com a versão (ler) e devolve a versão (save).
  const antes = { get: api.deviceConfig.get, ler: api.deviceConfig.ler, save: api.deviceConfig.save };
  api.deviceConfig.get = async () => JSON.parse(JSON.stringify(salva));
  api.deviceConfig.ler = async () => ({ config: JSON.parse(JSON.stringify(salva)), versao: 1 });
  api.deviceConfig.save = async (_id, c) => { salva = c; return { ok: true, updatedAt: 2 }; };
  try {
    const pecas = [
      { formato: '16/9', item: { type: 'peca-html', html: 'cartaz' } },
      { formato: '16/9', item: { type: 'peca-html', html: 'faixa', papel: 'cabecalho' } },
    ];
    await P.publicarPecas({ alvos: ['tv1'], pecas, titulo: 'Pão', telas: [{ id: 'tv1', name: 'TV' }] });
    assert.equal(salva.zonas.principal.items.length, 1, 'só o cartaz na principal');
    assert.equal(salva.zonas.cabecalho.pecas.length, 1, 'a faixa vai para o cabeçalho');
    assert.equal(salva.zonas.cabecalho.pecas[0]._campanha, 'Pão');
    // Publicar de novo troca, não empilha.
    await P.publicarPecas({ alvos: ['tv1'], pecas, titulo: 'Pão', telas: [{ id: 'tv1', name: 'TV' }] });
    assert.equal(salva.zonas.cabecalho.pecas.length, 1);
    assert.equal(salva.zonas.principal.items.length, 1);
  } finally { Object.assign(api.deviceConfig, antes); }
});

test('item 43: as cópias antigas das campanhas do Criar saem de Meus Designs (escondidas, não apagadas)', () => {
  const { semCopiasDeCampanha } = require('../server/copias-de-campanha.js');
  const campanhas = [{ nome: 'Promoção da semana', criadoEm: 1000000, atualizadoEm: 1000000 }];
  const items = [
    { campaign: 'Promoção da semana', createdAt: 1000004 },          // copiada ao criar
    { campaign: 'Promoção da semana', createdAt: 1000000 + 5 * 60e3 }, // outra, feita depois à mão
    { campaign: 'Criação rápida', createdAt: 1000004 },               // sem campanha no Criar
  ];
  const ficam = semCopiasDeCampanha(items, campanhas);
  assert.equal(ficam.length, 2);
  assert.ok(!ficam.includes(items[0]));
  assert.deepEqual(semCopiasDeCampanha(items, []), items);
  const s = ler('server.js');
  assert.match(s, /return sendJson\(res, 200, \{ items: semCopiasDeCampanha\(await db\.listLibrary\(sess\.tenant_id\), campanhas\) \}\);/);
  assert.doesNotMatch(ler('server/copias-de-campanha.js'), /delete|DELETE/, 'esconder, nunca apagar');
});

test('item 44: Vestir a tela com a data de hoje mora em Ajustes › Aparência', () => {
  const tv = ler('web/src/pages/ContentEditorPage.jsx');
  assert.match(tv, /dataDeHoje=\{<SeasonBanner zonas=\{zones\.map\(\(z\) => z\.id\)\} onAplicar=\{aplicarSeason\} \/>\}/);
  assert.match(tv, /\{false && cfg && <SeasonBanner/, 'e continua fora do topo da TV');
  const f = ler('web/src/components/content/SettingsForm.jsx');
  assert.match(f, /export function SettingsForm\(\{ settings, onChange, deviceId, device, zonas, dataDeHoje \}\)/);
  assert.match(f, /\{dataDeHoje\}/);
});
