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
