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
