/*
 * O painel no celular (QA de 26/10): alvo de toque de 44 px, letra mínima de
 * 13 px, abas que mostram que rolam, e o cartão da TV com tudo escrito.
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ler = (...p) => fs.readFileSync(path.join(__dirname, '..', ...p), 'utf8');

test('44 px no celular: regra global, botões e campos; o computador continua compacto', () => {
  const css = ler('web/src/index.css');
  const bloco = css.slice(css.indexOf('@media (max-width: 639px)'), css.indexOf('.rolagem-lateral {'));
  assert.match(bloco, /button:not\(\[data-compacto\]\)/);
  assert.match(bloco, /\[role='tab'\]:not\(\[data-compacto\]\)/);
  assert.match(bloco, /select:not\(\[data-compacto\]\)/);
  assert.match(bloco, /min-height: 44px;/);
  const b = ler('web/src/components/ui/Button.jsx');
  for (const t of ["sm: 'h-7", "md: 'h-8", "lg: 'h-9"]) assert.ok(b.includes(t), 'o computador perdeu o tamanho ' + t);
  assert.equal((b.match(/max-sm:h-11/g) || []).length, 4, 'os três tamanhos e o botão de ícone sobem para 44 px no celular');
});

test('letra: text-2xs e text-xs viram 13 px no celular', () => {
  const tw = ler('web/tailwind.config.js');
  assert.match(tw, /'2xs': \['var\(--fs-2xs\)'/);
  assert.match(tw, /xs: \['var\(--fs-xs\)'/);
  const css = ler('web/src/index.css');
  assert.match(css, /--fs-2xs: 0\.6875rem;/);
  assert.match(css, /@media \(max-width: 639px\) \{\s*:root \{ --fs-2xs: 0\.8125rem;[^}]*--fs-xs: 0\.8125rem;/);
});

test('abas que rolam mostram a sombra de "tem mais"', () => {
  assert.match(ler('web/src/index.css'), /\.rolagem-lateral \{[\s\S]*no-repeat local[\s\S]*no-repeat scroll/);
  for (const f of ['web/src/components/layout/Navegacao.jsx', 'web/src/pages/PecasProntasPage.jsx', 'web/src/components/content/SettingsForm.jsx', 'web/src/components/content/TypePicker.jsx']) {
    assert.match(ler(f), /rolagem-lateral[^"]*overflow-x-auto/, f);
  }
});

test('o cartão da TV: miniatura, estado em palavras, ações com nome e "Mais opções" rotulado', () => {
  const s = ler('web/src/pages/ScreensPage.jsx');
  const card = s.slice(s.indexOf('function FleetCard('), s.indexOf('function OpcaoDaTela('));
  assert.match(card, /<MiniaturaDaTela d=\{d\} online=\{online\} vazia=\{!d\.hasConfig\} \/>/);
  // Fase 7: o cartão abre a página da TV (o que passa, os ajustes e o que passou).
  assert.match(card, /'Abrir a TV' : 'Pôr conteúdo nesta TV'/);
  assert.match(card, />Ver agora<\/Button>/);
  assert.match(card, />Mais opções<\/Button>/);
  for (const o of ['Nome e grupo', 'Recarregar a TV', 'Som ao vivo', 'Horário e aviso de queda', 'Backup e cópia', 'Remover a TV']) {
    assert.ok(card.includes('titulo="' + o + '"'), 'sem a opção ' + o);
  }
  assert.doesNotMatch(card, /<IconButton/, 'voltou ícone sem rótulo no cartão');
  assert.match(card, /'Código da TV: '/);
  assert.match(card, /Confira se a TV está ligada e com internet/);
  const st = ler('web/src/lib/deviceStatus.js');
  assert.match(st, /label: online \? 'No ar' : 'Fora do ar'/);
  assert.match(st, /label: 'Nunca ligou'/);
});

test('relatório: os filtros têm nome para o leitor de tela', () => {
  const r = ler('web/src/pages/RelatorioPage.jsx');
  assert.match(r, /<Select aria-label="Período do relatório"/);
  assert.match(r, /<Select aria-label="Qual tela"/);
});

test('botão de tamanho fixo cresce junto no celular (ou é pequeno de propósito): a regra dos 44 px não o estica', () => {
  // Revisão do PR #305: os dias da semana (h-8 w-8) viravam ovais de 32×44 no celular.
  const glob = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? glob(path.join(dir, e.name)) : e.name.endsWith('.jsx') ? [path.join(dir, e.name)] : []));
  const ruins = [];
  for (const f of glob(path.join(__dirname, '..', 'web/src'))) {
    const s = fs.readFileSync(f, 'utf8');
    for (const m of s.matchAll(/<button\b/g)) {
      const trecho = s.slice(m.index, m.index + 600);
      const tag = trecho.slice(0, trecho.search(/>\s*[{<\w]/) + 1 || 600);
      if (/data-compacto/.test(tag)) continue;
      const fixo = /(?<![\w:-])h-([1-9]|10)(?![\d.])[^'"]*?(?<![\w:-])w-([1-9]|10)(?![\d.])|(?<![\w:-])w-([1-9]|10)(?![\d.])[^'"]*?(?<![\w:-])h-([1-9]|10)(?![\d.])/.exec(tag);
      if (fixo && !/max-sm:h-11/.test(tag)) ruins.push(path.relative(path.join(__dirname, '..'), f) + ': ' + fixo[0]);
    }
  }
  assert.deepEqual(ruins, []);
});

test('miniatura ao vivo: a mesma TV não é perguntada de novo em 2 minutos, e no máximo 8 por minuto', async () => {
  const src = ler('web/src/components/tela/MiniaturaDaTela.jsx');
  assert.match(src, /const JA_PEDIU_MS = 2 \* 60 \* 1000;/);
  assert.match(src, /const MAX_POR_MINUTO = 8;/);
  // Fase 7: depois do "Pôr na TV" a página da TV pergunta de novo (sem o teto dos 2 min, com o de 8 por minuto).
  assert.match(src, /\|\| !podePedir\(d\.id, Date\.now\(\), !!pedirDeNovo\)\) \{ setPerguntando\(false\); return; \}/);
  assert.match(src, /'Última imagem · ' \+ quando/, 'TV fora do ar mostra a imagem velha como se fosse agora');
});
