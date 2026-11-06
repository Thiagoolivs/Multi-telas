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
    // O texto de JSX pode morar em linha própria (o "Em Mídias › Fotos" da Marca escapou assim, no reteste da fase 10).
    const textos = s.match(/'[^'\n]*'|"[^"\n]*"|`[^`]*`|>[^<>{}]+</g) || [];
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

/*
 * Parte C: a Agenda semanal (BLOCO-8, wireframe D). O bloco 3 achou três
 * relógios no almoço que ninguém via; a semana mostra cada buraco.
 */
test('a semana da TV: o que passa em cada dia e hora, e o buraco com a loja aberta', async () => {
  const { pathToFileURL } = require('node:url');
  const S = await import(pathToFileURL(path.join(RAIZ, 'web/src/lib/semana.js')).href);
  const R = require('../js/rodizio.js');
  const layout = { zones: [{ id: 'principal', name: 'Principal', type: 'playlist' }, { id: 'lateral', name: 'Lateral', type: 'playlist' }, { id: 'rodape', type: 'ticker' }] };
  const manha = { type: 'announce', titulo: 'Café da manhã', agendamento: { ativo: true, dataInicio: '', dataFim: '', dias: [], horaInicio: '06:00', horaFim: '11:29' } };
  const oferta = { type: 'announce', titulo: 'Leve 3', _campanha: 'Semana', agendamento: { ativo: true, dataInicio: '2026-11-05', dataFim: '2026-11-07', dias: [], horaInicio: '', horaFim: '' } };
  const cfg = { settings: { layoutId: 'x' }, zonas: { principal: { items: [manha, oferta] }, lateral: { items: [] } } };
  const hoje = new Date(2026, 10, 5);   // quinta
  const exp = { dias: [1, 2, 3, 4, 5, 6], inicio: '07:00', fim: '18:00' };
  const s = S.semanaDaTv(cfg, layout, { hoje, expediente: exp, naJanela: R.naJanela });
  assert.equal(s.dias.length, 7);
  assert.equal(s.dias[0].rotulo, 'qui 05');
  assert.deepEqual(s.partes, ['principal'], 'a lateral sem nada não conta como buraco');
  const cel = (faixa, i) => s.linhas.find((l) => l.faixa === faixa).celulas[i];
  assert.deepEqual(cel('manha', 0).pecas.map((p) => p.titulo), ['Café da manhã', 'Leve 3']);
  assert.equal(cel('manha', 0).pecas[1].campanha, 'Semana');
  assert.equal(cel('manha', 0).pecas[1].ate, '2026-11-07');
  assert.equal(cel('almoco', 0).vazio, false, 'a oferta cobre o almoço de quinta');
  assert.equal(cel('almoco', 4).vazio, true, 'segunda, sem a oferta, o almoço fica só com o relógio');
  assert.equal(cel('almoco', 4).fechado, false);
  assert.equal(cel('almoco', 3).vazio, false, 'domingo fechado não é buraco');
  assert.equal(cel('manha', 3).fechado, true, 'domingo a loja não abre');
  assert.equal(cel('saida', 0).fechado, true, 'às 19h30 a loja já fechou');
  assert.ok(s.buracos > 0);
  // Sem horário guardado, a TV mostra o dia inteiro: tudo conta como aberto.
  assert.equal(S.abertoEm(null, 0, '03:00'), true);
  assert.equal(S.abertoEm({ dias: [1], inicio: '22:00', fim: '02:00' }, 1, '01:00'), true, 'horário que vira a noite');
});

test('a Agenda abre na semana, com as datas que vêm embaixo', () => {
  const c = ler('web/src/pages/CalendarioPage.jsx');
  assert.match(c, /<h1 className="text-xl font-semibold tracking-tight text-ink">Agenda<\/h1>/);
  assert.match(c, /<SemanaDaTv onIr=\{onIr\} \/>/);
  assert.match(c, /title="Datas que vêm"/);
  const k = ler('web/src/components/agenda/SemanaDaTv.jsx');
  assert.match(k, /semanaDaTv\(cfg, layout, \{ expediente: tv && tv.expediente, nome: itemSummary \}\)/);
  assert.match(k, /import '\.\.\/\.\.\/\.\.\/\.\.\/js\/rodizio\.js';/, 'a semana usa o mesmo naJanela da TV');
  assert.match(k, /Vazio: só o relógio/);
  // No celular, um dia por vez (os sete lado a lado não cabem); no computador, a semana inteira.
  assert.match(k, /role="radiogroup" aria-label="Qual dia"/);
  assert.match(k, /<Celula c=\{l\.celulas\[diaCel\]\}/);
  assert.match(k, /className="hidden overflow-x-auto sm:block"/);
  assert.match(ler('web/src/App.jsx'), /if \(nome === 'calendario'\) return 'Agenda';/);
});

/*
 * Parte D: o celular de verdade (BLOCO-8 §2.9): as abas que não cabem viram
 * um seletor, o topo da página fica mais baixo e as listas longas vêm aos
 * poucos (Peças prontas tinha 15 mil pixels de rolagem no celular).
 */
test('celular: abas viram seletor, topo mais baixo, listas de 12 em 12', () => {
  const n = ler('web/src/components/layout/Navegacao.jsx');
  assert.match(n, /<div className="mb-3 sm:hidden">\s*<Select aria-label=\{grupo\.label\} value=\{active\} onChange=\{\(e\) => onNavigate\(e\.target\.value\)\}/);
  assert.match(n, /<div className="mb-4 max-sm:hidden" role="tablist"/);
  const h = ler('web/src/components/layout/PageHeader.jsx');
  assert.match(h, /mb-4 flex flex-col gap-2 sm:mb-5/);
  assert.match(h, /max-sm:line-clamp-2/);
  const p = ler('web/src/pages/PecasProntasPage.jsx');
  assert.match(p, /visiveis\.slice\(0, qtPecas\)\.map/);
  assert.match(p, /modelosVisiveis\.slice\(0, qtModelos\)\.map/);
  assert.match(p, /const POR_VEZ = 12;/);
  assert.match(p, /Mostrar mais \(\{total - mostrando\}\)/);
  // Nos cartões, o botão é o de contorno: era a página dos 49 violetas.
  assert.doesNotMatch(p, /size="sm" variant="primary"/);
  // A tabela da semana tem nome em toda coluna (o axe acusava o canto vazio).
  assert.match(ler('web/src/components/agenda/SemanaDaTv.jsx'), /<span className="sr-only">Hora do dia<\/span>/);
});
