/*
 * Fase 10, o reteste do bloco 8 (a interface do painel): o que ele achou e
 * foi corrigido aqui — o "Na TV agora" igual à TV, o conteúdo pronto pelo
 * ramo, a página da TV em frases e o modelo que abre um formulário simples.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const RAIZ = path.join(__dirname, '..');
const ler = (f) => fs.readFileSync(path.join(RAIZ, f), 'utf8');
const importar = (f) => import(pathToFileURL(path.join(RAIZ, f)).href);
const semComentarios = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '');

test('a TV no painel é o próprio player: os mesmos arquivos do player.html, sem o boot da TV', async () => {
  const V = await importar('web/src/lib/tvAoVivo.js');
  const html = ler('player.html');
  const doHtml = [...html.matchAll(/<script src="([^"]+)"><\/script>/g)].map((m) => m[1]);
  // O que a prévia não carrega: o compat (aviso de navegador velho) e o boot (service worker e tela cheia da TV).
  assert.deepEqual(V.SCRIPTS_DA_TV, doHtml.filter((s) => s !== 'js/compat.js' && s !== 'js/boot.js'), 'o player.html mudou: a prévia do painel precisa dos mesmos arquivos');
  const pagina = V.paginaDaTv({ leve: true, versao: 'abc' });
  assert.match(pagina, /^<!doctype html><html lang="pt-BR" data-mt-previa="1" class="mt-perf">/);
  assert.match(pagina, /<main id="stage" class="mt-stage"><\/main>/);
  assert.match(pagina, /<script src="\/js\/player\.js\?v=abc"><\/script>/);
  assert.ok(!/boot\.js/.test(pagina), 'o boot registraria o service worker da TV no painel');
  assert.ok(!/<script>/.test(pagina), 'script embutido: a CSP recusa');
});

test('a programação da prévia: uma peça por parte — a que a TV contou, ou a que se edita', async () => {
  const V = await importar('web/src/lib/tvAoVivo.js');
  const texto = { type: 'text', titulo: 'Pão às 16h', agendamento: { ativo: true, horaInicio: '14:00', horaFim: '17:29', dias: [] } };
  const foto = { type: 'image', src: '/media/x.jpg' };
  const exemplo = { type: 'text', titulo: 'Exemplo', meta: { exemplo: true } };
  const cfg = {
    settings: { layoutId: 'corporate', expediente: { dias: [1] }, audio: { ativo: true }, girar: 90, layoutAuto: true },
    zonas: { cabecalho: { header: true }, principal: { items: [texto, foto] }, lateral: { items: [exemplo, foto] }, rodape: { messages: ['Pix'] } },
  };
  const antes = JSON.stringify(cfg);
  const r = V.configDaPrevia(cfg, { estado: { zonas: { principal: { item: foto, posicao: 2, total: 2 } } }, logo: { url: '/media/logo.png' }, frente: 'comercio' });
  assert.equal(JSON.stringify(cfg), antes, 'mexeu na programação do painel');
  const s = r.config.settings;
  assert.ok(!s.expediente && !s.audio && !s.girar, 'horário, música e giro são do aparelho, não do desenho');
  assert.equal(s.layoutAuto, false);
  assert.deepEqual(s.logo, { url: '/media/logo.png' }, 'a logo que o servidor só manda para a TV');
  assert.equal(s.frente, 'comercio');
  assert.deepEqual(r.config.zonas.principal.items, [foto], 'a peça que a TV contou estar no ar');
  assert.deepEqual(r.config.zonas.lateral.items, [foto], 'o exemplo não vai ao ar: vale o primeiro que vai');
  assert.deepEqual(r.config.zonas.rodape, { messages: ['Pix'] }, 'a faixa fica como está');
  // O rascunho: a peça que se edita, no lugar dela, sem o horário (senão a prévia mostraria o relógio).
  const f = V.configDaPrevia(cfg, { foco: { zona: 'principal', indice: 0 } });
  assert.equal(f.config.zonas.principal.items.length, 1);
  assert.equal(f.config.zonas.principal.items[0].titulo, 'Pão às 16h');
  assert.equal(f.config.zonas.principal.items[0].agendamento.ativo, false);
  // A parte que a TV contou estar no relógio.
  assert.deepEqual(V.configDaPrevia(cfg, { estado: { zonas: { lateral: { relogio: true } } } }).relogio, ['lateral']);
  assert.equal(V.configDaPrevia(null), null);
  // O tamanho: o da TV que respondeu, com 1080 no lado menor; sem resposta, o do layout.
  assert.deepEqual(V.tamanhoDaTv({ tela: { w: 1280, h: 720 } }, null), [1920, 1080]);
  assert.deepEqual(V.tamanhoDaTv(null, { orientation: 'portrait' }), [1080, 1920]);
  assert.deepEqual(V.tamanhoDaTv({ tela: { w: 1080, h: 1080 } }, null), [1080, 1080]);
});

test('o player no modo prévia: sem nuvem, sem som, sem giro, e desenha o que o painel manda', () => {
  const p = ler('js/player.js');
  assert.match(p, /const EM_PREVIA = !!\(document\.documentElement && document\.documentElement\.hasAttribute\('data-mt-previa'\)\);/);
  assert.match(p, /if \(EM_PREVIA\) bootPrevia\(\);/);
  assert.match(p, /function montarMolduraSeGirada\(\) \{\s*\/\/[^\n]*\n\s*if \(global\.MTPrevia\) return true;/, 'na prévia o boot da TV não pode subir');
  assert.match(p, /function conferirGiro\(pedido\) \{\s*\/\/[^\n]*\n\s*if \(global\.MTPrevia\) return;/, 'girar recarregaria o painel');
  assert.match(p, /if \(EM_PREVIA\) return;\s*\/\/[^\n]*\n[^\n]*\n\s*trilha\.aplicar/, 'a música tocaria no painel');
  assert.match(p, /global\.MTPrevia = \{\s*mostrar: function \(texto, extras\)/);
  // ES2017 na TV: nada de ?. nem ?? no que mudou.
  assert.ok(!/\?\.|\?\?/.test(p.slice(p.indexOf('function bootPrevia'), p.indexOf('/* ---------------- TV em pé'))));
  assert.match(ler('sw.js'), /mt-shell-v(8[1-9]|9\d|\d{3})/, 'a TV não recebe o player novo');
  // O painel usa a TV de verdade no Início, em Telas e na página da TV.
  const m = ler('web/src/components/tela/MiniaturaDaTela.jsx');
  assert.match(m, /lerProgramacao\(d\.id, d\.updatedAt \|\| 0\)/, 'a programação é lida uma vez por versão da TV');
  const q = ler('web/src/components/tela/TvAoVivo.jsx');
  assert.match(q, /srcDoc=\{pagina\}/);
  assert.match(q, /w\.MTPrevia\.mostrar\(JSON\.stringify\(previa\.config\), \{ relogio: previa\.relogio \}\)/);
  assert.match(q, /new IntersectionObserver/, 'a lista de TVs abriria todos os players de uma vez');
});

test('conteúdo pronto pelo ramo: a padaria não vê óculos de sol nem coloração; o genérico fica', async () => {
  globalThis.MTPecaHtml = globalThis.MTPecaHtml || {};
  const M = await importar('web/src/lib/modelosOuro.js');
  const pecas = JSON.parse(ler('pecas-ouro/manifesto.json')).pecas;
  const ids = (l) => l.map((x) => x.id);
  const padaria = M.separarPorRamo(M.ordenarPorPerfil(M.daFrente(pecas, 'comercio'), 'comercio'), 'padaria', 'comercio');
  for (const id of ['oferta-foto', 'oferta-lista', 'oferta-selo', 'servico-agenda', 'institucional-foto']) {
    assert.ok(!ids(padaria.meus).includes(id), id + ' é de outro negócio e apareceu para a padaria');
    assert.ok(ids(padaria.outros).includes(id), id + ' sumiu do "Ver também os de outros negócios"');
  }
  assert.ok(padaria.meus.slice(0, 4).every((m) => m.marca === 'padaria'), 'os da padaria vêm primeiro');
  for (const id of ['servico-horario', 'social-avaliacao', 'social-instagram', 'servico-comunicado', 'lateral-prazo']) {
    assert.ok(ids(padaria.meus).includes(id), id + ' serve a qualquer negócio e sumiu');
  }
  // A oferta cujo texto já foi escrito para o comércio serve a qualquer loja.
  assert.equal(M.negocioDoModelo(pecas.find((x) => x.id === 'oferta-parcelado'), 'comercio'), '');
  assert.equal(M.negocioDoModelo(pecas.find((x) => x.id === 'oferta-foto'), 'comercio'), 'otica');
  // A ótica vê os dela primeiro, e o pão da padaria vai para o botão.
  const otica = M.separarPorRamo(M.daFrente(pecas, 'comercio'), 'otica', 'comercio');
  assert.equal(otica.meus[0].marca, 'otica');
  assert.ok(ids(otica.outros).includes('cardapio-colunas'));
  // Sem ramo conhecido: só o que serve a qualquer um à vista.
  assert.ok(!ids(M.separarPorRamo(pecas, 'geral', 'comercio').meus).includes('oferta-foto'));
  // As telas inteiras também.
  const t = semComentarios(ler('web/src/pages/TelasProntasPage.jsx'));
  assert.match(t, /const deOutroNegocio = \(t\) => !!doRamo && !doRamo\.includes\(t\.marca\) && !\(t\.ramos \|\| \[\]\)\.includes\(marca\.ramo\);/);
  /*
   * O título casa com a aba. Fase 10 (reteste do bloco 8, "a Biblioteca tem
   * 4 níveis"): "Telas inteiras" e "Peças soltas" deixaram de ser partes da
   * aba e viraram uma grade só, com o filtro; o título é o da aba.
   */
  assert.match(ler('web/src/pages/PecasProntasPage.jsx'), />Prontos para você<\/h1>/);
  assert.match(ler('web/src/lib/menu.js'), /prontos: 'Prontos para você',/);
  // E a tela inteira de outro negócio segue a mesma regra dos modelos na grade: só com o botão.
  const g = ler('web/src/pages/PecasProntasPage.jsx');
  assert.match(g, /telasDaConta\(dados, marca, perfil\.id, telas, false\)/);
  assert.match(g, /deOutros \? telasProntas\.outros\.map\(daTela\)\.concat\(grupos\.outros\.map\(doModelo\)\) : \[\]/);
});

test('a página da TV em frases: as partes com nome de gente, sem "Zonas", "ciclo" nem "Composição"', async () => {
  const L = require('../js/templates.js');
  const T = await importar('web/src/lib/tela.js');
  const nomes = (id) => L.getLayout(id).zones.map((z) => T.nomeDaParte(z, L.getLayout(id)));
  assert.deepEqual(nomes('corporate'), ['Parte de cima', 'Meio', 'Lado', 'Faixa de baixo']);
  assert.deepEqual(nomes('portrait-stack'), ['Parte de cima', 'Meio', 'Embaixo', 'Faixa de baixo']);
  assert.deepEqual(nomes('quad'), ['Parte 1', 'Parte 2', 'Parte 3', 'Parte 4']);
  assert.deepEqual(nomes('full'), ['Meio']);
  const s = semComentarios(ler('web/src/components/content/ScreenSummary.jsx'));
  assert.ok(!/d\.layout/.test(s), 'o nome técnico do layout ("Corporativo Completo") voltou');
  assert.ok(!/ciclo de/.test(s));
  assert.match(s, /dá a volta em/);
  const C = await importar('web/src/lib/contentTypes.js');
  assert.equal(C.itemSummary({ type: 'composicao', elementos: [{ tipo: 'texto', text: 'OFERTA', tamanho: 3 }, { tipo: 'texto', text: 'Pão\nde queijo', tamanho: 9 }] }), 'Pão de queijo');
  assert.equal(C.itemSummary({ type: 'composicao', elementos: [] }), 'Arte');
  assert.equal(C.nomeDoTipo('text'), 'Texto');
  const e = semComentarios(ler('web/src/pages/ContentEditorPage.jsx'));
  assert.ok(!/elemento\(s\)|typeLabel\(/.test(e), 'o tipo técnico voltou à página da TV');
  assert.ok(!/<ItemPreview /.test(e), 'a fila voltou à prévia que corta o texto');
  assert.match(e, /<MiniaturaDoItem item=\{it\} largura=\{64\} \/>/);
  // O endereço /media/ não aparece no campo da foto.
  assert.match(ler('web/src/components/content/MediaField.jsx'), /value=\{interno \? '' : \(value \|\| ''\)\}/);
});

test('o "Quando" da peça que já está na TV é o mesmo do "Pôr na TV"; o detalhado fica em Mais ajustes', async () => {
  const Q = await importar('web/src/lib/quando.js');
  const hoje = new Date(2026, 10, 6);
  assert.deepEqual(Q.quandoDoItem({ type: 'text' }, hoje).quando, 'sempre');
  assert.deepEqual(Q.quandoDoItem({ agendamento: { ativo: false, horaInicio: '06:00' } }, hoje).quando, 'sempre');
  const tarde = Q.comQuando({ type: 'text' }, { quando: 'hora', faixa: 'tarde' });
  assert.deepEqual(Q.quandoDoItem(tarde, hoje), { quando: 'hora', ate: '', faixa: 'tarde' });
  const ate = { agendamento: { ativo: true, dataInicio: '2026-11-06', dataFim: '2026-11-08', dias: [], horaInicio: '', horaFim: '' } };
  assert.deepEqual(Q.quandoDoItem(ate, hoje), { quando: 'ate', ate: '2026-11-08', faixa: 'manha' });
  const soHoje = { agendamento: { ativo: true, dataInicio: '2026-11-06', dataFim: '2026-11-06', dias: [], horaInicio: '', horaFim: '' } };
  assert.equal(Q.quandoDoItem(soHoje, hoje).quando, 'hoje');
  const terca = { agendamento: { ativo: true, dias: [2], horaInicio: '08:00', horaFim: '09:00' } };
  assert.equal(Q.quandoDoItem(terca, hoje).quando, 'outro', 'dias à mão não cabem numa frase');
  // "Sempre" tira o horário da peça; as outras escolhas o refazem.
  assert.ok(!('agendamento' in Q.itemComQuando(terca, { quando: 'sempre' })));
  assert.equal(Q.itemComQuando(terca, { quando: 'hora', faixa: 'manha' }).agendamento.horaInicio, '06:00');
  const e = semComentarios(ler('web/src/pages/ContentEditorPage.jsx'));
  assert.match(e, /<EscolherQuando valor=\{quandoDoItem\(current\)\}/);
  assert.match(e, /onChange=\{\(escolha\) => updateItem\(selected, itemComQuando\(current, escolha\)\)\}/);
  // O detalhado (dias e horas) mora dentro do "Mais ajustes".
  assert.match(e, /maisAjustes=\{\([\s\S]{0,2000}<QuandoMostrar agendamento=\{current\.agendamento\}[\s\S]{0,400}quando=\{\(/);
  assert.match(ler('web/src/components/tela/PorNaTV.jsx'), /export function EscolherQuando\(\{ valor, onChange, numero = '', outro = '' \}\)/);
});

test('"Escolher um modelo" abre um formulário de textos; o editor livre fica a um botão', async () => {
  const A = await importar('web/src/lib/textosDaArte.js');
  require('../js/modelos.js');
  const peca = globalThis.MTModelos.montar('promocao', '16/9', ['#6b3e1f'], 'comercio');
  const r = A.rotulosDaArte(peca);
  assert.deepEqual(r.map((x) => x.rotulo), ['Chamada 1', 'Preço', 'Chamada 2'], 'de cima para baixo, pelo papel do texto');
  const trocada = A.comTexto(peca, r[1].indice, 'R$ 4,50');
  assert.equal(A.rotulosDaArte(trocada)[1].texto, 'R$ 4,50');
  assert.notEqual(peca.elementos[r[1].indice].text, 'R$ 4,50', 'mexeu na peça original');
  const c = semComentarios(ler('web/src/pages/CriarPage.jsx'));
  assert.match(c, /if \(peca && textosDaArte\(peca\)\.length\) setTrocando\(\{ \.\.\.base, \.\.\.peca \}\);/);
  assert.match(c, /onAvancado=\{\(it\) => \{ setTrocando\(null\); setCompondo\(it\); \}\}/);
  // Na página da TV, a arte mostra os textos como formulário, e o editor livre vira "Editor avançado".
  const e = semComentarios(ler('web/src/pages/ContentEditorPage.jsx'));
  assert.match(e, /<CamposDaArte item=\{current\} onChange=\{\(it\) => updateItem\(selected, it\)\} \/>/);
  assert.match(e, /if \(peca && textosDaArte\(peca\)\.length\) \{ setTrocandoModelo\(\{ \.\.\.base, \.\.\.peca \}\); return; \}/);
});
