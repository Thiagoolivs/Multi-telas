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

test('2. "Antes (agora na TV)" desenha o que está no ar agora, e não a peça agendada para depois', async () => {
  const V = await importar('web/src/lib/tvAoVivo.js');
  const natal = { type: 'announce', titulo: 'Feliz Natal', agendamento: { ativo: true, dataInicio: '2026-12-05', dataFim: '2026-12-26', dias: [] } };
  const aviso = { type: 'announce', titulo: 'Reunião na sexta' };
  const cfg = { settings: { layoutId: 'full' }, zonas: { principal: { items: [natal, aviso] } } };
  const no = (c) => c.config.zonas.principal.items[0].titulo;
  // 26/11, 9h em São Paulo (12h UTC): o Natal ainda não entrou.
  assert.equal(no(V.configDaPrevia(cfg, { agora: '2026-11-26T12:00:00Z' })), 'Reunião na sexta');
  // 06/12: entrou, e é o primeiro da lista.
  const dez = V.configDaPrevia(cfg, { agora: '2026-12-06T12:00:00Z' });
  assert.equal(no(dez), 'Feliz Natal');
  assert.equal(dez.config.zonas.principal.items[0].agendamento.ativo, false, 'a prévia mostra a peça parada nela');
  // A hora da loja, não a do navegador: 23h30 de 04/12 em São Paulo já é 05/12 em UTC.
  assert.equal(no(V.configDaPrevia(cfg, { agora: '2026-12-05T02:30:00Z' })), 'Reunião na sexta');
  // A janela do dia (só de manhã) e o urgente que já venceu também ficam de fora, como na TV.
  const manha = { type: 'text', titulo: 'Café da manhã', agendamento: { ativo: true, horaInicio: '06:00', horaFim: '11:29', dias: [] } };
  const vencido = { type: 'announce', titulo: 'Falta de água', meta: { prioridade: 'urgente', expiraEm: Date.parse('2026-11-26T10:00:00Z') } };
  const cfg2 = { settings: { layoutId: 'full' }, zonas: { principal: { items: [vencido, manha, aviso] } } };
  assert.equal(no(V.configDaPrevia(cfg2, { agora: '2026-11-26T12:00:00Z' })), 'Café da manhã', '9h na loja');
  assert.equal(no(V.configDaPrevia(cfg2, { agora: '2026-11-26T18:00:00Z' })), 'Reunião na sexta', '15h na loja');
  // Nada no ar agora: a parte fica com a lista, e o player faz o que a TV faz (o relógio).
  const so = V.configDaPrevia({ zonas: { principal: { items: [natal] } } }, { agora: '2026-11-26T12:00:00Z' });
  assert.equal(so.config.zonas.principal.items.length, 1);
  assert.equal(so.config.zonas.principal.items[0].agendamento.ativo, true);
  // O "Depois" do pedido mostra a peça que ele traz, mesmo agendada para depois.
  const pedido = { settings: { layoutId: 'full' }, zonas: { principal: { items: [aviso, natal] } } };
  const antes = { settings: { layoutId: 'full' }, zonas: { principal: { items: [aviso] } } };
  assert.equal(no(V.configDaPrevia(pedido, { agora: '2026-11-26T12:00:00Z', comparar: antes })), 'Feliz Natal');
  assert.equal(no(V.configDaPrevia(antes, { agora: '2026-11-26T12:00:00Z' })), 'Reunião na sexta');
  // A página de Aprovações usa isso.
  const ap = ler('web/src/pages/AprovacoesPage.jsx');
  assert.match(ap, /<ATv cfg=\{t\.depois\} comparar=\{t\.antes\} rotulo="Depois \(se aprovar\)" \/>/);
  assert.match(ap, /<ATv cfg=\{t\.antes\} rotulo="Antes \(agora na TV\)" \/>/);
});
