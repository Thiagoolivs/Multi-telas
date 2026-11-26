/*
 * Reteste 4 (25/11): o que ficou na lista "Falta" do painel e dos modelos
 * (docs/qa-total/RETESTE-4.md, "O que ainda está errado ou feio";
 * RETESTE-4-MODELOS.md, "Não consertado" e o B2). Um teste por conserto.
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const RAIZ = path.join(__dirname, '..');
const ler = (...p) => fs.readFileSync(path.join(RAIZ, ...p), 'utf8');
const importar = (p) => import(pathToFileURL(path.join(RAIZ, p)).href);

// As funções do indicador ao vivo da TV (js/render.js), tiradas do arquivo como estão.
function kpiDaTv(lista) {
  const r = ler('js/render.js');
  const ini = r.indexOf('  function formatarKpi(v, u) {');
  const fim = r.indexOf('  function renderKpi(item) {');
  assert.ok(ini > 0 && fim > ini, 'as funções do indicador mudaram de lugar em js/render.js');
  return new Function('global', r.slice(ini, fim) + '\nreturn { formatarKpi, kpiAoVivo };')({ MT_KPIS: lista });
}

test('1. o cartão "Ao vivo" do indicador mostra o número na lista da TV, o mesmo da TV', async () => {
  const P = await importar('web/src/lib/kpiAoVivo.js');
  const lista = [
    { chave: 'producao', nome: 'Produção do dia', valor: 10300, unidade: 'pç', anterior: 9800, meta: 12000, atualizadoEm: Date.UTC(2026, 10, 25, 13, 5) },
    { chave: 'refugo', nome: 'Refugo', valor: 2.6, unidade: '%', anterior: 3.1 },
    { chave: 'vendas', nome: 'Vendas', valor: 1234567, unidade: 'R$' },
  ];
  const tv = kpiDaTv(lista.map((i) => ({ ...i, em: i.atualizadoEm })));
  for (const k of lista) {
    const item = { type: 'kpi', indicador: k.chave, rotulo: k.nome, duracao: 12 };
    const painel = P.kpiNoPainel(item, lista);
    const naTv = tv.kpiAoVivo(item);
    assert.notEqual(painel.valor, '—', k.chave + ': voltou o "—" no painel');
    // A TV escreve a unidade num pedaço à parte; o texto é o mesmo.
    assert.equal(painel.valor, tv.formatarKpi(k.valor, k.unidade), k.chave);
    assert.equal(painel.rotulo, naTv.rotulo);
    assert.equal(painel.variacao, naTv.variacao);
    assert.equal(painel.tendencia, naTv.tendencia);
    assert.equal(P.formatarKpi(k.valor, k.unidade), tv.formatarKpi(k.valor, k.unidade), 'a mesma conta da TV');
  }
  assert.equal(P.kpiNoPainel({ type: 'kpi', indicador: 'producao' }, lista).valor, '10.300 pç');
  // O que a TV diz sem o número, o painel também diz.
  const sem = P.kpiNoPainel({ type: 'kpi', indicador: 'sumiu', rotulo: 'Sumiu' }, lista);
  assert.equal(sem.valor, '—');
  assert.equal(sem.detalhe, tv.kpiAoVivo({ type: 'kpi', indicador: 'sumiu' }).detalhe);
  // Ainda lendo: reticências, não o traço de "sem número".
  assert.equal(P.kpiNoPainel({ type: 'kpi', indicador: 'producao' }, null).valor, '…');
  // O cartão digitado à mão continua com o valor dele.
  const manual = { type: 'kpi', rotulo: 'Meta', valor: '42' };
  assert.equal(P.kpiNoPainel(manual, lista), manual);
  // A prévia: a lista no formato que a TV lê, e só quando há cartão ao vivo.
  assert.equal(P.indicadoresParaATv(lista)[0].em, lista[0].atualizadoEm);
  assert.equal(P.temKpiAoVivo({ zonas: { principal: { items: [{ type: 'kpi', indicador: 'x' }] } } }), true);
  assert.equal(P.temKpiAoVivo({ zonas: { principal: { items: [{ type: 'kpi', valor: '1' }] } } }), false);
  // Quem desenha a miniatura da lista e a prévia usa isto.
  const prev = ler('web/src/components/content/ItemPreview.jsx');
  assert.match(prev, /if \(item\.indicador\) return <KpiAoVivo item=\{item\} \/>;/);
  assert.match(prev, /<Kpi item=\{kpiNoPainel\(item, lista\)\} \/>/);
  assert.match(ler('web/src/components/tela/TvAoVivo.jsx'), /w\.MT_KPIS = indicadoresParaATv\(indicadores\)/);
});
