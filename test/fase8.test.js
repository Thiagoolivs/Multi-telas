/*
 * Fase 8 do plano de ação: o painel novo, o acabamento.
 *
 * Parte A: a letra (corpo 15, seção 17, página 28; 24 no celular; nada
 * abaixo de 12), um violeta por tela e estados vazios que mostram o que vai
 * aparecer ali. Medido no navegador em 16 páginas × 2 frentes × 2 tamanhos:
 * no máximo um botão violeta por tela e o axe sem problema.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const RAIZ = path.join(__dirname, '..');
const ler = (f) => fs.readFileSync(path.join(RAIZ, f), 'utf8');

test('a escala: corpo 15, título de seção 17, título de página 28 (24 no celular), números 32', () => {
  const tw = ler('web/tailwind.config.js');
  assert.match(tw, /sm: \['0\.9375rem'/, 'o corpo voltou a 13 px');
  assert.match(tw, /lg: \['1\.0625rem'/);
  assert.match(tw, /xl: \['var\(--fs-xl\)'/);
  assert.match(tw, /'2xl': \['2rem'/);
  const css = ler('web/src/index.css');
  assert.match(css, /--fs-2xs: 0\.75rem;/, 'nada abaixo de 12 px no computador');
  assert.match(css, /--fs-xl: 1\.75rem;/);
  assert.match(css, /@media \(max-width: 639px\) \{\s*:root \{[^}]*--fs-xl: 1\.5rem;/);
  assert.match(ler('web/src/components/ui/Panel.jsx'), /<h2 className="text-lg font-semibold text-ink">\{title\}<\/h2>/, 'o título de seção voltou a ter o peso do corpo');
});

test('um violeta por tela: a parte escolhida é neutra, e os botões de apoio não são violeta', () => {
  const p = ler('web/src/components/ui/Partes.jsx');
  assert.doesNotMatch(p, /bg-accent text-accent-fg/, 'a parte escolhida voltou a ser violeta');
  assert.match(ler('web/src/pages/ContentEditorPage.jsx'), /<Button size="sm" variant="secondary" icon=\{Plus\} onClick=\{\(\) => setPicker\(true\)\}>Adicionar<\/Button>/);
  assert.match(ler('web/src/pages/ScreensPage.jsx'), /<Button variant="secondary" icon=\{LayoutTemplate\} onClick=\{onContent\}/, 'um violeta por cartão de TV');
  assert.match(ler('web/src/pages/CampanhasPage.jsx'), /<Button variant="secondary" icon=\{Plus\} onClick=\{\(\) => onIr && onIr\('criar'\)\}>Criar<\/Button>/);
  assert.match(ler('web/src/pages/SettingsPage.jsx'), /<Button variant="secondary" icon=\{KeyRound\}/);
  assert.match(ler('web/src/pages/SettingsPage.jsx'), /<Button variant="danger" icon=\{Trash2\}/, 'excluir a conta com o botão de perigo, não o violeta');
  assert.doesNotMatch(ler('web/src/components/tela/MapaDaTela.jsx'), /rounded-md bg-accent px-1\.5/, 'o selo IA da parte voltou a ser violeta');
});

test('o vazio mostra o que vai aparecer ali: uma TV desenhada com a peça de exemplo', () => {
  const f = ler('web/src/components/ui/Feedback.jsx');
  assert.match(f, /export function TvDeExemplo\(\{ icon: Icon, linhas \}\)/);
  assert.match(f, /export function EmptyState\(\{ icon: Icon = Inbox, title, description, action, exemplo \}\)/);
  assert.match(f, /<h2 className="mt-4 text-lg font-semibold text-ink">\{title\}<\/h2>/, 'o axe acusava h3 depois do h1');
  for (const [arq, trecho] of [
    ['web/src/pages/ScreensPage.jsx', "exemplo={['Código da TV'"],
    ['web/src/pages/CampanhasPage.jsx', "exemplo={['Campanha'"],
    ['web/src/pages/CalendarioPage.jsx', "exemplo={['27/11'"],
    ['web/src/pages/ContentEditorPage.jsx', "exemplo={['Novo'"],
    ['web/src/pages/TelasProntasPage.jsx', "exemplo={['Tela pronta'"],
  ]) assert.ok(ler(arq).includes(trecho), arq);
  // Apps ganhou o título da página (o axe acusava a página sem h1).
  assert.match(ler('web/src/pages/BibliotecaPage.jsx'), /<PageHeader title="Apps"/);
});

/*
 * Parte B: um verbo e um glossário (BLOCO-8 §2.4). "Pôr na TV" para pôr,
 * "Biblioteca" em todo lugar, e nada de "zona", "prioridade", "parear",
 * "Mídias", "Meus Designs" ou "Criados" na frente do cliente.
 */
test('o glossário: nenhum termo velho nos textos que o cliente lê', () => {
  const glob = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? glob(path.join(dir, e.name)) : /\.(jsx?|mjs)$/.test(e.name) ? [path.join(dir, e.name)] : []));
  // Telas só do operador (a Plataforma) podem falar a língua de quem opera.
  const DO_OPERADOR = /pages\/(PlatformPage|SystemPage)\.jsx|components\/platform\//;
  const VELHOS = [/\bMídias\b/, /\bMeus Designs\b/, /\bCriados\b/, /\bParear\b/, /\bPareie\b/, /\bPublicar\b/, /Prioridade (normal|alta)/, /\bzonas? (desta|única|sem conteúdo|independentes)/i, /Duração \(s\)/];
  const ruins = [];
  for (const f of glob(path.join(RAIZ, 'web/src'))) {
    if (DO_OPERADOR.test(f)) continue;
    // Só o que vira texto na tela: strings e texto de JSX, sem os comentários.
    const s = fs.readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '');
    const textos = s.match(/'[^'\n]*'|"[^"\n]*"|`[^`]*`|>[^<>{}\n]+</g) || [];
    for (const t of textos) for (const v of VELHOS) if (v.test(t) && !/import |from '|aria-hidden/.test(t)) ruins.push(path.relative(RAIZ, f) + ': ' + t.slice(0, 80));
  }
  assert.deepEqual(ruins, []);
});

test('os nomes novos: Ligar uma TV, O que passa, Importância, Tempo na tela, Campanhas, Peças guardadas', () => {
  assert.match(ler('web/src/pages/ScreensPage.jsx'), /title="Ligar uma TV"/);
  assert.match(ler('web/src/pages/ContentEditorPage.jsx'), /<PanelHeader title="O que passa"/);
  assert.match(ler('web/src/pages/ContentEditorPage.jsx'), /'No ar · nada novo para pôr'/);
  assert.match(ler('web/src/lib/contentTypes.js'), /label: 'Tempo na tela \(segundos\)'/);
  assert.match(ler('web/src/lib/menu.js'), /campanhas: 'Campanhas',/);
  assert.match(ler('web/src/lib/menu.js'), /designs: 'Peças guardadas',/);
  assert.match(ler('web/src/pages/CalendarioPage.jsx'), /aria-label="Importância"/);
  // A TV aponta para o botão que existe no painel.
  assert.match(ler('player.html'), /<strong>Ligar uma TV<\/strong>/);
});
