/*
 * Fase 7 do plano de ação: o painel novo, a estrutura.
 *
 * Parte B, a página da TV: o que passa, os ajustes e o que passou numa
 * página só, com a TV ao vivo no centro e o "Pôr na TV" numa barra fixa,
 * com Desfazer. Antes eram quatro lugares (Telas, Programação, o diálogo de
 * Ajustes e o Relatório).
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const RAIZ = path.join(__dirname, '..');
const ler = (f) => fs.readFileSync(path.join(RAIZ, f), 'utf8');
const semComentarios = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '');

test('a página da TV: três partes, sem o diálogo de ajustes', () => {
  const s = semComentarios(ler('web/src/pages/ContentEditorPage.jsx'));
  assert.match(s, /opcoes=\{\[\['passa', 'O que passa'\], \['ajustes', 'Ajustes da TV'\], \['passou', 'O que passou'\]\]\}/);
  assert.ok(!/settingsOpen/.test(s), 'o diálogo "Ajustes da tela" voltou');
  // Os ajustes na própria página, com os mesmos dados de antes.
  assert.match(s, /aba === 'ajustes' && cfg && \([\s\S]{0,400}<SettingsForm/);
  // O que passou: o relatório só desta TV, sem a escolha de tela.
  assert.match(s, /<RelatorioPage telaFixa=\{device\.id\}/);
  const r = ler('web/src/pages/RelatorioPage.jsx');
  assert.match(r, /useState\(telaFixa \|\| ''\)/);
  assert.match(r, /\{!telaFixa && <div className="min-w-0 sm:w-52"><Select aria-label="Qual tela"/);
  // O rodapé e o cabeçalho que pediam "Ajustes" abrem a parte certa.
  assert.match(s, /onAjustes=\{\(\) => setAba\('ajustes'\)\}/);
});

test('a TV no centro: ao vivo, e "como vai ficar" quando há rascunho', () => {
  const s = semComentarios(ler('web/src/pages/ContentEditorPage.jsx'));
  assert.match(s, /<MiniaturaDaTela d=\{device\} online=\{noAr\} vazia=\{!naTV\.current\} altura=\{340\} pedirDeNovo=\{publishedAt \|\| 0\} \/>/);
  // Pôs na TV: a miniatura pergunta de novo (passa do "já perguntei há 2 min", não do teto de 8 por minuto).
  const m = ler('web/src/components/tela/MiniaturaDaTela.jsx');
  assert.match(m, /if \(!deNovo && agora - \(pedidos\.get\(id\) \|\| 0\) < JA_PEDIU_MS\) return false;/);
  assert.match(m, /\[d\.id, online, vazia, d\.updatedAt, pedirDeNovo\]/);
  // "Como vai ficar" no mesmo palco do ao vivo, com a peça que se edita na zona dela.
  assert.match(s, /<Palco estado=\{estadoDoRascunho\(cfg, layoutCanonico, activeZone && \{ zona: activeZone\.id, indice: selected \}\)\} alturaMaxima=\{340\} \/>/);
  assert.match(ler('web/src/components/tela/MiniaturaDaTela.jsx'), /<Palco estado=\{resposta\.estado\} alturaMaxima=\{altura\} \/>/);
  // O cabeçalho diz se a TV está no ar, em palavras.
  assert.match(s, /const status = deviceStatus\(device\.lastSeen\);/);
});

test('"Pôr na TV" numa barra fixa, com Desfazer e Refazer', () => {
  const s = semComentarios(ler('web/src/pages/ContentEditorPage.jsx'));
  assert.match(s, /sticky bottom-\[calc\(60px\+env\(safe-area-inset-bottom\)\)\] z-20 mt-4 lg:bottom-3/, 'a barra some ao rolar, ou fica atrás da barra do celular');
  assert.match(s, /\{publishing \? 'Pondo na TV…' : 'Pôr na TV'\}/);
  assert.ok(!/Publicar na TV/.test(s), 'sobrou "Publicar na TV"');
  // Publicar guarda o que estava; desfazer põe de volta (e refaz no segundo toque).
  assert.match(s, /anterior\.current = naTV\.current; naTV\.current = alvo;/);
  assert.match(s, /async function desfazer\(\) \{\s*const a = anterior\.current;\s*if \(!a\) return;\s*const era = desfeito;\s*if \(await publish\(a\)\) \{ setCfg\(a\); setDesfeito\(!era\); \}/);
  assert.match(s, /\{desfeito \? 'Refazer' : 'Desfazer'\}/);
  // Ao abrir, o que está na TV é o lido; o "por cima" parte da versão nova.
  assert.match(s, /naTV\.current = data\.config \|\| null; anterior\.current = null;/);
  assert.match(s, /naTV\.current = \(r && r\.config\) \|\| null;\s*await publish\(\);/);
});

test('o rascunho no formato do palco: a peça aberta na zona dela, a primeira nas outras', async () => {
  const { pathToFileURL } = require('node:url');
  const T = await import(pathToFileURL(path.join(RAIZ, 'web/src/lib/tela.js')).href);
  const layout = { orientation: 'landscape', zones: [{ id: 'principal', type: 'playlist' }, { id: 'lateral', type: 'playlist' }, { id: 'rodape', type: 'ticker' }] };
  const a = { type: 'announce', titulo: 'A' }, b = { type: 'announce', titulo: 'B' }, c = { type: 'text', titulo: 'C' };
  const cfg = { settings: { layoutId: 'l', margemSegura: 2 }, zonas: { principal: { items: [a, b] }, lateral: { items: [c] }, rodape: { messages: ['Oi'] } } };
  const e = T.estadoDoRascunho(cfg, layout, { zona: 'principal', indice: 1 });
  assert.deepEqual(e.tela, { w: 1920, h: 1080 });
  assert.equal(e.margem, 2);
  assert.equal(e.zonas.principal.item, b);
  assert.equal(e.zonas.principal.posicao, 2);
  assert.equal(e.zonas.lateral.item, c);
  assert.deepEqual(e.zonas.rodape.mensagens, ['Oi']);
  assert.equal(T.estadoDoRascunho(null, layout), null);
});

test('Telas abre a página da TV, e voltar volta para Telas', () => {
  assert.match(ler('web/src/pages/ScreensPage.jsx'), /\{d\.hasConfig \? 'Abrir a TV' : 'Pôr conteúdo nesta TV'\}/);
  const app = ler('web/src/App.jsx');
  assert.match(app, /case 'content': return <ContentEditorPage device=\{route\.device\} zonaInicial=\{route\.zona\} onBack=\{\(\) => go\('screens'\)\}/);
});

/*
 * Parte C: um só Criar, que termina sempre em Onde → Quando → Pôr na TV, e
 * os três níveis no formulário da peça.
 */
test('o "quando" em palavras vira o agendamento do player', async () => {
  const { pathToFileURL } = require('node:url');
  const Q = await import(pathToFileURL(path.join(RAIZ, 'web/src/lib/quando.js')).href);
  const A = await import(pathToFileURL(path.join(RAIZ, 'web/src/lib/aplicarConteudo.js')).href);
  const hoje = new Date(2026, 10, 5);
  assert.equal(Q.diasAte('2026-11-05', hoje), 1, 'hoje conta como um dia');
  assert.equal(Q.diasAte('2026-11-07', hoje), 3, 'até sábado');
  assert.equal(Q.diasAte('2026-11-01', hoje), 1, 'data que passou vira só hoje');
  assert.equal(Q.diasAte('', hoje), 0);
  const item = { type: 'announce', titulo: 'Oi' };
  assert.equal(Q.comQuando(item, { quando: 'sempre' }), item, 'sempre: nada a agendar');
  const so = Q.comQuando(item, { quando: 'hoje' });
  assert.equal(so.agendamento.dataInicio, so.agendamento.dataFim, 'só hoje: começa e acaba hoje');
  const manha = Q.comQuando(item, { quando: 'hora', faixa: 'manha' });
  assert.equal(manha.agendamento.horaInicio, '06:00');
  assert.equal(manha.agendamento.escolhido, true);
  // A hora que a pessoa escolheu não estica pelo dia (o cobrirODia da fase 5 só estica a das faixas da IA).
  assert.equal(A.cobrirODia([manha])[0].agendamento.horaInicio, '06:00');
  const daIA = A.agendarPeca(item, 'manha', 0);
  assert.equal(A.cobrirODia([daIA])[0].agendamento.horaInicio, '00:00');
  assert.equal(Q.frasesDoQuando({ quando: 'hora', faixa: 'almoco' }), 'todo dia, almoço');
});

test('Pôr na TV: onde, quando e Desfazer, nas Peças prontas, no Criar e no "Pôr foto ou vídeo"', () => {
  const d = semComentarios(ler('web/src/components/tela/PorNaTV.jsx'));
  assert.match(d, /aria-label="Onde"/);
  assert.match(d, /<EscolherQuando valor=\{escolha\} onChange=\{setEscolha\} numero="2\. " \/>/);
  assert.match(d, /const item = comQuando\(peca\.item, escolha\);/);
  assert.match(d, /if \(telaInicial && telas\.some\(\(t\) => t\.id === telaInicial\)\) return \[telaInicial\];/, 'vindo de uma TV, só ela marcada');
  assert.match(ler('web/src/pages/PecasProntasPage.jsx'), /<PorNaTV peca=\{porNaTv\} telas=\{telas\}/);
  const c = semComentarios(ler('web/src/pages/CriarPage.jsx'));
  assert.match(c, /<PorNaTV peca=\{porNaTv\} telaInicial=\{telaInicial\} alerta=\{porNaTv\.alerta\} onFechar=\{\(\) => setPorNaTv\(null\)\} \/>/);
  // Modelo salvo sem mudar o texto: avisa antes (o preço de exemplo pode ter que ser honrado).
  assert.match(c, /const igual = !!textosDoModelo\.current && textosDa\(it\) === textosDoModelo\.current;/);
  const s = semComentarios(ler('web/src/components/content/SubirConteudo.jsx'));
  assert.match(s, /<EscolherQuando valor=\{escolha\} onChange=\{setEscolha\} \/>/);
  assert.match(ler('web/src/lib/subir.js'), /tela: \(opcoes && opcoes\.tela\) \|\| ''/);
});

test('um só Criar: três portas, o avançado recolhido, e a TV de onde veio já marcada', () => {
  const c = semComentarios(ler('web/src/pages/CriarPage.jsx'));
  for (const t of ['Pedir à IA', 'Escolher um modelo', 'Foto ou vídeo']) assert.ok(c.includes('titulo="' + t + '"'), t);
  assert.match(c, /onClick=\{\(\) => abrirSubir\(null, \{ tela: telaInicial \}\)\}/);
  assert.match(c, /setPorNaTv\(\{ item: it, formato: it\.formato, label: 'Modelo', alerta:/, 'o modelo vai ao ar sem perguntar onde e quando');
  assert.match(c, /aria-expanded=\{avancado\}/);
  assert.match(c, /Editor livre \(em branco\)/);
  // A segunda porta para a mesma conversa saiu da Programação.
  assert.doesNotMatch(ler('web/src/pages/ProgramacaoPage.jsx'), /Pedir à IA<\/Button>/);
});

test('os três níveis: o conteúdo à vista, aparência e tempo em "Mais ajustes"', async () => {
  const { pathToFileURL } = require('node:url');
  globalThis.localStorage = globalThis.localStorage || { getItem: () => null, setItem: () => {} };
  let T;
  try { T = await import(pathToFileURL(path.join(RAIZ, 'web/src/lib/contentTypes.js')).href); } catch (e) { T = null; }
  const src = ler('web/src/lib/contentTypes.js');
  assert.match(src, /const DUR = \{ key: 'duracao'[^}]*\.\.\.AV \};/, 'a duração voltou para cima');
  for (const k of ['align', 'tamanho', 'colunas']) assert.match(src, new RegExp("key: '" + k + "'[^\\n]*\\.\\.\\.AV"), k);
  assert.match(src, /key: 'bg', label: 'Cor de fundo', kind: 'color', optional: true, \.\.\.AV/);
  if (T) {
    const { simples, avancados } = T.camposPorNivel('text');
    assert.deepEqual(simples.map((f) => f.key), ['titulo', 'corpo']);
    assert.deepEqual(avancados.map((f) => f.key), ['align', 'tamanho', 'bg', 'cor', 'duracao']);
    assert.deepEqual(T.camposPorNivel('promo').simples.map((f) => f.key), ['selo', 'titulo', 'precoDe', 'precoPor', 'cta', 'imagem']);
  }
  const f = semComentarios(ler('web/src/components/content/ItemForm.jsx'));
  assert.match(f, /const \{ simples, avancados \} = camposPorNivel\(item\.type\);/);
  assert.match(f, /aria-expanded=\{aberto\}/);
  assert.match(f, /const CHAVE_MAIS = 'mt\.maisAjustes';/, 'o "Mais ajustes" não lembra a escolha');
  // A importância (antes "Prioridade", sempre à vista) foi para o "Mais ajustes" da página da TV.
  const e = semComentarios(ler('web/src/pages/ContentEditorPage.jsx'));
  assert.match(e, /<ItemForm item=\{current\} onChange=\{\(it\) => updateItem\(selected, it\)\}\s*maisAjustes=\{\(/);
  assert.match(e, /aria-label="Importância"/);
});

test('convidar em três toques: avatar › Convidar alguém › Gerar convite', () => {
  const t = ler('web/src/components/layout/Topbar.jsx');
  assert.match(t, /\['team', 'Convidar alguém', UserPlus, \{ convidar: true \}\]/);
  assert.match(t, /user\.role === 'owner' \|\| user\.role === 'admin'/, 'membro não convida: o atalho não aparece para ele');
  assert.match(ler('web/src/pages/TeamPage.jsx'), /useState\(!!abrirConvite && \(me\.role === 'owner' \|\| me\.role === 'admin'\)\)/);
  assert.match(ler('web/src/App.jsx'), /abrirConvite=\{!!route\.convidar\}/);
  assert.match(ler('web/src/App.jsx'), /onNavigate=\{\(name, params\) => go\(name, params\)\}/);
});
