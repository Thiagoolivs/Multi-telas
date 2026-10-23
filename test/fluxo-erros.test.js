/*
 * Fluxo sem becos: erro que aparece (EXECUTOR D3a).
 *
 * A varredura de 23/10 achou ações do painel que falhavam caladas: o pânico
 * do mural preso em "Tirando…", "tirar da tela" que dizia fora com a foto na
 * TV, o banco de imagens com "tentar de novo" morto, a edição de um design
 * que sumia, erro atrás da janela aberta, falha de rede virando "nenhuma TV"
 * (e a pessoa pareando de novo), e quem abria o app sem internet caindo no
 * login. Cada um, conferido no código.
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ler = (f) => fs.readFileSync(path.join(__dirname, '..', 'web', 'src', f), 'utf8');

test('mural: pânico, tirar da tela, abrir/fechar e criar dizem quando falham', () => {
  const m = ler('pages/MuralPage.jsx');
  const panico = m.slice(m.indexOf('async function panico'), m.indexOf('async function esconder'));
  assert.match(panico, /catch \(e\) \{[\s\S]*NÃO saíram da TV/, 'o pânico falha calado');
  assert.match(panico, /finally \{ setOcupado\(false\); \}/, 'o pânico fica preso em "Tirando…"');
  const esconder = m.slice(m.indexOf('async function esconder'), m.indexOf('async function esconder') + 800);
  assert.match(esconder, /catch \(e\) \{\s*setFotos\(\(atual\) => atual\.map\(\(x\) => \(x\.id === f\.id \? \{ \.\.\.x, oculta: f\.oculta \}/, 'não desfaz o otimista');
  assert.ok(!/catch \(e\) \{\}/.test(m), 'erro engolido no mural');
  assert.match(m, /if \(criando\) return;/, 'duplo clique cria dois murais');
});

test('banco de imagens: tentar de novo recarrega; erro ao usar não apaga a galeria', () => {
  const b = ler('pages/BancoImagensPage.jsx');
  assert.match(b, /onRetry=\{\(\) => setTentativa\(\(n\) => n \+ 1\)\}/);
  assert.match(b, /\}, \[busca, formato, tentativa\]\);/);
  const usar = b.slice(b.indexOf('async function usar'), b.indexOf('return (', b.indexOf('async function usar')));
  assert.ok(!/setErro\(e\)/.test(usar), 'a falha de usar troca a galeria pelo erro');
});

test('Meus Designs: o editor só fecha depois de salvar; erros por cima da janela', () => {
  const d = ler('pages/MyDesignsPage.jsx');
  const salvar = d.slice(d.indexOf('async function onEditorSave'), d.indexOf('async function salvarDesign'));
  assert.ok(salvar.indexOf('await library.update(') < salvar.indexOf('setEditing(null)'), 'fecha antes de salvar');
  assert.match(salvar, /catch \(e\) \{ aviso\.erro\(/);
  assert.match(d, /\} catch \(e\) \{ aviso\.erro\('designs', e\.message \|\| 'Não deu para publicar\.'\); \}/);
});

test('falha de rede não vira lista vazia (Programação, Alertas, Peças prontas, Pôr pra rodar)', () => {
  assert.match(ler('pages/ProgramacaoPage.jsx'), /\.catch\(\(e\) => setErro\(/);
  assert.ok(!/\.catch\(\(\) => setTelas\(\[\]\)\);\s*\}, \[/.test(ler('pages/ProgramacaoPage.jsx')));
  assert.match(ler('pages/AlertsPage.jsx'), /erroDev \? \(/);
  assert.match(ler('pages/PecasProntasPage.jsx'), /\.catch\(\(e\) => setErroPecas\(/);
  assert.ok(!/\.catch\(\(\) => \[\]\)/.test(ler('pages/PecasProntasPage.jsx')));
  assert.match(ler('components/criar/PorPraRodar.jsx'), /Não deu para ler as TVs agora/);
});

test('sem internet, quem está logado não cai no login', () => {
  assert.match(ler('api.js'), /me: \(\) => api\('GET', '\/api\/auth\/me'\)\.catch\(\(e\) => \{ if \(e && e\.status === 401\) return null; throw e; \}\)/);
  assert.match(ler('App.jsx'), /Sem conexão com o MultiTelas/);
});

test('Telas: renomear e remover avisam a falha; restaurar e copiar perguntam antes', () => {
  const s = ler('pages/ScreensPage.jsx');
  assert.match(s, /Não deu para salvar o nome\./);
  assert.match(s, /Não deu para remover a TV\./);
  assert.match(s, /Trocar a programação desta TV\?/);
  assert.match(s, /Copiar por cima desta TV\?/);
});

test('Criar: a data não abre a conversa velha; abrir e ajustar o cartão avisam a falha', () => {
  const c = ler('pages/CriarPage.jsx');
  assert.match(c, /if \(id && !opcaoInicial && !telaInicial && !ideiaInicial\) abrir\(id\);/);
  assert.ok(!/criar\.salvarEscopo\(conversa\.id, novo\)\.catch\(\(\) => \{\}\)/.test(c));
  assert.match(c, /Não deu para abrir a conversa/);
});

test('Mídias: a lixeira aparece no celular (não só com o mouse em cima)', () => {
  assert.match(ler('pages/StoragePage.jsx'), /sm:opacity-0 sm:group-hover:opacity-100/);
});
