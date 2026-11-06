/*
 * Fase 10 do plano de ação: o reteste. O que o reteste achou e já foi
 * corrigido aqui (o resto vai para o plano, em docs/qa-total/RESULTADO.md).
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const RAIZ = path.join(__dirname, '..');
const ler = (f) => fs.readFileSync(path.join(RAIZ, f), 'utf8');

test('reteste do bloco 8: o axe sem falha com campanha no ar, e um verbo só', () => {
  // heading-order: a seção da página da TV é h2 (vinha h3 logo depois do h1).
  assert.match(ler('web/src/components/tela/CampanhasNaTela.jsx'), /<h2 className="mb-2 flex items-center gap-1\.5 text-sm font-semibold text-ink"><Megaphone/);
  // color-contrast: o selo "rodando" no verde claro de verdade, não o verde a 15%.
  assert.match(ler('web/src/components/criar/PorPraRodar.jsx'), /rounded-full bg-ok-soft px-2 py-0\.5 text-2xs font-semibold text-ok">rodando/);
  // "Pôr na TV" também no fim do caminho da IA, e "Abrir a TV" também no Início.
  assert.doesNotMatch(ler('web/src/components/criar/PorPraRodar.jsx'), /'Pôr pra rodar'|> Pôr pra rodar</);
  assert.match(ler('web/src/pages/DashboardPage.jsx'), /\{d\.hasConfig \? 'Abrir a TV' : 'Pôr conteúdo'\}/);
  assert.doesNotMatch(ler('web/src/pages/BrandPage.jsx').replace(/\/\*[\s\S]*?\*\//g, ''), /Em Mídias/);
});

test('reteste do bloco 8: a Agenda não repete o mesmo nome em cada célula', () => {
  const k = ler('web/src/components/agenda/SemanaDaTv.jsx');
  assert.match(k, /const ja = unicas\.find\(\(u\) => u\.titulo === p\.titulo\); if \(ja\) ja\.vezes\+\+; else unicas\.push/);
  assert.match(k, /\{p\.titulo\}\{p\.vezes > 1 \? ' \(' \+ p\.vezes \+ '\)' : ''\}/);
});

test('o roteiro do piloto: os 10 passos e quando o piloto passa', () => {
  const r = ler('docs/qa-total/ROTEIRO-PILOTO.md');
  for (let i = 1; i <= 10; i++) assert.match(r, new RegExp('^\\| ' + i + ' \\|', 'm'), 'passo ' + i);
  assert.match(r, /\*\*O piloto passa quando:\*\*/);
});

test('reteste do bloco 1: a TV quadrada no piso, e a bancada desenha a quadrada no tamanho dela', () => {
  // 1080 no lado menor: a quadrada (1080×1080) dava 0,56 e a peça saía a 56% do piso.
  assert.match(ler('js/render.js'), /const k = Math\.min\(w, h\) \/ 1080;/);
  assert.match(ler('js/bancada.js'), /const W = emPe \|\| quadrada \? 1080 : 1920;/);
  assert.match(ler('sw.js'), /mt-shell-v(8\d|9\d|\d{3})/, 'a TV não recebe o player novo');
});

test('reteste do bloco 1: o texto do cliente não some por conter uma palavra como "dentista"', async () => {
  const { pathToFileURL } = require('node:url');
  const T = await import(pathToFileURL(path.join(RAIZ, 'web/src/lib/telasProntas.js')).href);
  const m = JSON.parse(ler('pecas-ouro/manifesto.json'));
  const ex = T.nomesDeExemplo(m.marcas);
  for (const palavra of ['dentista', 'clinica', 'farmacia', 'industria', 'escritorio', 'restaurante', 'otica', 'padaria', 'salao']) {
    assert.ok(!ex.compactos.includes(palavra), 'o id "' + palavra + '" apagaria textos do cliente');
  }
  assert.equal(T.limparDoExemplo('Consulta com o dentista às 9h', null, { nome: 'Sorriso Bom' }, ex), 'Consulta com o dentista às 9h');
  // O nome da marca de exemplo continua saindo.
  assert.equal(T.limparDoExemplo('Venha à Padaria do Bairro', null, { nome: 'Pão Bom' }, ex), 'Venha à Pão Bom');
  assert.ok(ex.compactos.includes('rotasul'), 'o apelido da Rota Sul (o @ e o site) ainda é reconhecido');
});

test('o pacote do dentista não anuncia preço, parcela, desconto nem "grátis" (CFO)', () => {
  const m = JSON.parse(ler('pecas-ouro/manifesto.json'));
  for (const t of m.telas.filter((x) => x.negocio === 'dentista')) {
    const txt = JSON.stringify(t);
    assert.doesNotMatch(txt, /R\$|"preco"|"parcela"|desconto|grátis|sem custo|não tem custo|% ?off/i, t.id);
    assert.ok(!t.zonas.principal.pecas.some((p) => p.id === 'oferta-parcelado'), t.id);
  }
});
