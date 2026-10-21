/*
 * O menu novo do painel (docs/EXECUTOR.md, item 15; PLANO §5.1).
 *
 * 8 grupos no lugar de 14 entradas soltas, barra de baixo no celular, e o
 * "Adicionar conteúdo" perguntando o que mostrar antes da grade. A regra que
 * este arquivo segura: NADA SOME, SÓ MUDA DE LUGAR — toda página antiga tem
 * um grupo, e todo endereço antigo (`?ir=`) continua abrindo a mesma página.
 *
 * Conferido no navegador, celular de 360 px (ver o PR): as tarefas principais
 * em até 3 toques.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const RAIZ = path.join(__dirname, '..');
const ler = (...p) => fs.readFileSync(path.join(RAIZ, ...p), 'utf8');
const menu = () => import(pathToFileURL(path.join(RAIZ, 'web/src/lib/menu.js')).href);

test('os 8 grupos, na ordem do PLANO', async () => {
  const M = await menu();
  assert.deepStrictEqual(M.GRUPOS.map((g) => g.label), ['Início', 'Telas', 'Criar', 'Mídias', 'Marca', 'Automáticos', 'Relatórios', 'Conta']);
  const de = (id) => M.GRUPOS.find((g) => g.id === id).paginas;
  assert.deepStrictEqual(de('inicio'), ['overview', 'alerts']);
  assert.deepStrictEqual(de('midias'), ['storage', 'banco']);
  assert.deepStrictEqual(de('automaticos'), ['birthdays', 'mural']);
  assert.deepStrictEqual(de('conta'), ['billing', 'team', 'settings', 'support']);
  assert.deepStrictEqual(M.BARRA_INFERIOR, ['inicio', 'telas', 'criar', 'midias'], 'a barra de baixo: Início · Telas · Criar · Mídias (+ Mais)');
});

test('nenhuma página sumiu: cada uma mora em exatamente um grupo', async () => {
  const M = await menu();
  const app = ler('web/src/App.jsx');
  // Todas as páginas que o painel sabe abrir (os `case` do renderPage).
  const casos = [...app.matchAll(/case '([a-z]+)':/g)].map((m) => m[1]);
  const DA_PLATAFORMA = ['platform', 'system']; // só de quem opera: seção própria
  for (const p of casos) {
    if (DA_PLATAFORMA.includes(p)) continue;
    const donos = M.GRUPOS.filter((g) => g.paginas.includes(p) || (g.tambem || []).includes(p));
    assert.equal(donos.length, 1, 'a página "' + p + '" está em ' + donos.length + ' grupos');
  }
  for (const p of Object.keys(M.PAGINAS)) assert.ok(casos.includes(p), 'o menu aponta para "' + p + '", que o painel não abre');
});

test('nenhum link antigo quebra; os novos (por grupo) funcionam', async () => {
  const M = await menu();
  // Os destinos que já existiam em /app/?ir= (os atalhos do App, do ícone instalado e dos e-mails).
  const antigos = ['criar', 'screens', 'designs', 'brand', 'mural', 'billing', 'alerts', 'relatorio',
    'team', 'storage', 'banco', 'birthdays', 'support', 'settings'];
  for (const ir of antigos) assert.equal(M.paginaDoIr(ir), ir, '?ir=' + ir + ' deixou de abrir a mesma página');
  assert.equal(M.paginaDoIr('midias'), 'storage');
  assert.equal(M.paginaDoIr('automaticos'), 'birthdays');
  assert.equal(M.paginaDoIr('conta'), 'billing');
  assert.equal(M.paginaDoIr('inicio'), 'overview');
  // A lista é fechada: URL é coisa que qualquer um escreve.
  assert.equal(M.paginaDoIr('platform'), null);
  assert.equal(M.paginaDoIr('<script>'), null);
  assert.match(ler('web/src/App.jsx'), /const ir = paginaDoIr\(q\.get\('ir'\)\);/);
  // Os e-mails e o manifesto apontam para endereços que continuam valendo.
  for (const f of ['server/lembretes.js', 'web/public/manifest.webmanifest']) {
    for (const m of ler(f).matchAll(/\?ir=([a-z]+)/g)) assert.ok(M.paginaDoIr(m[1]), f + ' aponta para ?ir=' + m[1] + ', que não abre nada');
  }
});

test('o grupo aceso é o da página; abas nos grupos de mais de uma página; barra de baixo no celular', async () => {
  const M = await menu();
  assert.equal(M.grupoDa('birthdays').id, 'automaticos');
  assert.equal(M.grupoDa('content').id, 'telas', 'a programação de uma tela acende Telas');
  assert.equal(M.grupoDa('studio').id, 'criar');
  assert.equal(M.grupoDa('platform'), null);
  const side = ler('web/src/components/layout/Sidebar.jsx');
  assert.match(side, /GRUPOS\.map\(\(g\) => \(\{ id: g\.id, label: g\.label, icon: ICONES\[g\.id\], destino: g\.paginas\[0\] \}\)\)/);
  const shell = ler('web/src/components/layout/AppShell.jsx');
  assert.match(shell, /<AbasDoGrupo active=\{active\} onNavigate=\{navigate\} \/>/);
  assert.match(shell, /<BarraInferior active=\{active\} onNavigate=\{navigate\} onMais=\{\(\) => setDrawer\(true\)\} \/>/);
  // A barra não cobre o fim da página no celular.
  assert.match(shell, /pb-24 pt-5 sm:px-6 sm:pt-6 lg:pb-6/);
  assert.match(ler('web/src/components/layout/Navegacao.jsx'), /lg:hidden/);
});

test('Adicionar conteúdo pergunta antes: 6 entradas grandes; todos os tipos em "Mais tipos", com busca', () => {
  const p = ler('web/src/components/content/TypePicker.jsx');
  const ids = [...p.slice(p.indexOf('const ENTRADAS = ['), p.indexOf('];', p.indexOf('const ENTRADAS = ['))).matchAll(/id: '([a-z]+)'/g)].map((m) => m[1]);
  assert.deepStrictEqual(ids, ['criar', 'midia', 'promo', 'announce', 'birthdayauto', 'social']);
  assert.match(p, /useState\('inicio'\)/, 'abre na pergunta, não na grade');
  assert.match(p, /O que você quer mostrar\?/);
  assert.match(p, /placeholder=\{tab === 'lib' \? 'Buscar na biblioteca…' : 'Buscar um tipo: clima, vídeo, QR…'\}/);
  assert.match(p, /CONTENT_ORDER\.filter\(bate\)/, 'a busca filtra os tipos prontos');
  // Foto ou vídeo entra pelo mesmo caminho do "Pôr na TV": inteira, com o fundo borrado.
  assert.match(p, /onPickItem\(itemDaMidia\(\{ url: r\.url, fundo: prep\.fundo, video \}\)\)/);
});
