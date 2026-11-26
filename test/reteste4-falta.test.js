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

// A peça de faixa como o Prontos a põe na TV: o HTML da peça-ouro.
const faixaOuro = (id, papel) => ({ item: { type: 'peca-html', versao: 1, papel, html: ler('pecas-ouro', id + '.html'), campos: {} }, papel });

test('3. o rodapé que passa as frases, numa TV sem frase: o "Pôr na TV" pede a primeira, e ela entra só onde falta', () => {
  const L = require('../js/lote-tv.js');
  const comFrase = { settings: { layoutId: 'corporate' }, zonas: { principal: { items: [] }, rodape: { messages: ['Ramal do RH: 2040'] } } };
  const semFrase = { settings: { layoutId: 'corporate' }, zonas: { principal: { items: [] }, rodape: { messages: ['  '] } } };
  // As quatro faixas do reteste passam as frases; sem frase, a TV não as mostra (js/player.js, pecasDaFaixa).
  for (const id of ['rodape-selo', 'rodape-pagamento', 'rodape-relogio', 'rodape-contagem']) {
    const p = faixaOuro(id, 'rodape');
    assert.match(p.item.html, /data-vivo="mensagens"/, id);
    assert.equal(L.comoEntraAPeca(semFrase, p).semFrase, true, id + ': o painel não perguntaria a frase');
    assert.equal(L.comoEntraAPeca(comFrase, p).semFrase, false, id);
    // Sem a resposta, a regra é a de antes (a frase não se inventa).
    assert.deepEqual(L.aplicarPeca(semFrase, p).zonas.rodape.messages, ['  ']);
    const com = L.aplicarPeca(semFrase, { ...p, frases: ['Bom trabalho a todos!', ''] });
    assert.deepEqual(com.zonas.rodape.messages, ['Bom trabalho a todos!'], id);
    assert.equal(com.zonas.rodape.pecas.length, 1);
    // A TV que já tem frase fica com as dela.
    assert.deepEqual(L.aplicarPeca(comFrase, { ...p, frases: ['Outra'] }).zonas.rodape.messages, ['Ramal do RH: 2040']);
  }
  // A faixa que não passa as frases (o rodapé de contatos) não pergunta.
  assert.equal(L.comoEntraAPeca(semFrase, faixaOuro('rodape-faixa', 'rodape')).semFrase, false);
  // O mesmo que a TV decide: com a frase que entrou, a faixa vai ao ar.
  const p = ler('js/player.js');
  assert.match(p, /return lista\.filter\(\(p\) => temMensagem \|\| !\/data-vivo="mensagens"\/\.test\(p\.html \|\| ''\)\);/);
  // O diálogo pede a frase e não deixa pôr sem ela.
  const d = ler('web/src/components/tela/PorNaTV.jsx');
  assert.match(d, /const faltaFrase = semFrase\.length > 0 && !frase\.trim\(\);/);
  assert.match(d, /disabled=\{!recebem\.length \|\| enviando \|\| falta \|\| faltaFrase \|\| conferindo\}/);
  assert.match(d, /frases: semFrase\.length \? \[frase\] : \[\]/);
});

test('4. a faixa numa TV sem essa parte (Tela cheia): o "Pôr na TV" pergunta se troca o formato, e não diz que pôs', () => {
  const L = require('../js/lote-tv.js');
  const cheia = { settings: { layoutId: 'full' }, zonas: { principal: { items: [{ type: 'text', titulo: 'Fica' }] } } };
  const emPe = { settings: { layoutId: 'portrait-hero' }, zonas: { principal: { items: [] }, rodape: { messages: ['a'] } } };
  const cab = faixaOuro('cabecalho-classico', 'cabecalho');
  const rod = faixaOuro('rodape-faixa', 'rodape');
  assert.deepEqual(L.comoEntraAPeca(cheia, cab), { faixa: 'cabecalho', semFaixa: true, layoutAtual: 'full', layoutNovo: 'corporate', semFrase: false });
  assert.equal(L.comoEntraAPeca(cheia, rod).semFaixa, true);
  // Em pé com rodapé e sem cabeçalho: o formato em pé com as duas faixas.
  assert.deepEqual([L.comoEntraAPeca(emPe, cab).semFaixa, L.comoEntraAPeca(emPe, cab).layoutNovo], [true, 'portrait-stack']);
  assert.equal(L.comoEntraAPeca(emPe, rod).semFaixa, false);
  // A peça do meio entra em qualquer formato: nada a perguntar.
  assert.deepEqual(L.comoEntraAPeca(cheia, { item: { type: 'text' }, formato: '16/9' }), { faixa: '', semFaixa: false, layoutAtual: 'full', layoutNovo: '', semFrase: false });
  // Sem trocar, nada muda (o painel tira a TV do envio e diz); trocando, a faixa entra e o meio fica.
  assert.deepEqual(L.aplicarPeca(cheia, cab), cheia);
  const trocada = L.aplicarPeca(cheia, cab, { trocarLayout: true });
  assert.equal(trocada.settings.layoutId, 'corporate');
  assert.equal(trocada.zonas.cabecalho.pecas.length, 1);
  assert.equal(trocada.zonas.cabecalho.header, true);
  assert.deepEqual(trocada.zonas.principal.items, cheia.zonas.principal.items);
  // Quem já tem a faixa não troca de formato.
  assert.equal(L.aplicarPeca(emPe, rod, { trocarLayout: true }).settings.layoutId, 'portrait-hero');
  // O servidor aplica com a mesma regra, e o plano é a mesma conta (server/routes/telas.js, a operação 'peca').
  const s = ler('server/routes/telas.js');
  assert.match(s, /aplicar: \(cfg, tela, op\) => loteTv\.aplicarPeca\(cfg, op\.peca, \{ trocarLayout: op\.trocarLayout \}\),\n\s+simular: \(cfg, tela, op\) => loteTv\.comoEntraAPeca\(cfg, op\.peca\),/);
  // O diálogo: a TV sem a parte troca (marcado) ou fica de fora, e o aviso conta só as que receberam.
  const d = ler('web/src/components/tela/PorNaTV.jsx');
  assert.match(d, /const \[trocarLayout, setTrocarLayout\] = useState\(true\);/);
  assert.match(d, /const recebem = alvos\.filter\(\(id\) => \{ const x = daTv\(id\); return !\(x && x\.semFaixa && !trocarLayout\); \}\);/);
  assert.match(d, /'Na TV \(' \+ frasesDoQuando\(escolha\) \+ '\): ' \+ recebem\.length/);
  assert.match(d, /ficou de fora: não tem /);
});

test('5. a primeira TV pede o nome na hora (com o próximo "TV N" e as sugestões da frente)', async () => {
  const N = await importar('web/src/lib/nomeDaTv.js');
  assert.equal(N.proximoNomeDeTv([]), 'TV 1');
  assert.equal(N.proximoNomeDeTv([{ name: 'TV 1' }, { name: 'Recepção' }, { name: 'tv 3' }]), 'TV 2');
  // A mesma conta do servidor, que dá o nome quando o campo vem vazio.
  const s = ler('server/routes/telas.js');
  assert.match(s, /while \(usados\.has\('tv ' \+ n\)\) n\+\+;\n\s+return 'TV ' \+ n;/);
  assert.match(s, /const nome = String\(b\.name \|\| ''\)\.trim\(\)\.slice\(0, 60\) \|\| d\.name \|\| \(await proximoNomeDeTv\(sess\.tenant_id\)\);/);
  // As sugestões da frente, sem as que a conta já usa.
  const P = require('../js/perfil.js');
  const empresa = P.PERFIS ? P.PERFIS.empresa : P.get('empresa');
  assert.deepEqual(N.sugestoesDeNome(empresa.textos.nomesDeTv, [{ name: 'recepção' }]), ['Refeitório', 'Portaria']);
  // O "Sua primeira TV" manda o nome (era '') e recebe as TVs da conta nos dois lugares em que liga a TV.
  const t = ler('web/src/components/primeira-tv/PassoTv.jsx');
  assert.doesNotMatch(t, /devices\.pair\(code, '', extra\)/, 'voltou a primeira TV sem nome');
  assert.match(t, /devices\.pair\(code, nome\.trim\(\) \|\| proximoNomeDeTv\(tvs\), extra\)/);
  assert.match(t, /3 · O nome desta TV/);
  assert.match(t, /<LigarTv codigoInicial=\{codigoInicial\} tvs=\{tvs\}/);
  assert.match(ler('web/src/components/primeira-tv/PassoPronto.jsx'), /<LigarTv tvs=\{tvs\}/);
  assert.match(ler('web/src/pages/PrimeiraTvPage.jsx'), /<PassoPronto [^>]*tv=\{tv\} tvs=\{tvs\}/);
  // Telas › Ligar uma TV: as mesmas sugestões, e o "TV N" que vem se ficar vazio.
  const sp = ler('web/src/pages/ScreensPage.jsx');
  assert.match(sp, /<PairDialog open=\{pairOpen\} codigoInicial=\{parear\} tvs=\{todas\}/);
  assert.match(sp, /sugestoesDeNome\(perfil\.textos\.nomesDeTv, tvs\)\.slice\(0, 4\)/);
});

test('6. "Esta TV parece ser a X?": "Não, é outra TV" na frente, o último sinal à vista e o "É a X" com confirmação', async () => {
  const R = await importar('web/src/lib/reconectarTv.js');
  const agora = new Date(2026, 11, 3, 10, 0).getTime();
  const x = { id: 'dev_a', nome: 'Recepção', grupo: 'Produção', ultimoSinal: agora - 12 * 60000 };
  assert.equal(R.ultimoSinal(x.ultimoSinal, agora), 'há 12 min (hoje, 09:48)');
  assert.equal(R.ultimoSinal(new Date(2026, 11, 2, 18, 10).getTime(), agora), 'há 15 h (ontem, 18:10)');
  assert.equal(R.ultimoSinal(new Date(2026, 10, 28, 18, 10).getTime(), agora), 'há 4 d (28/11, 18:10)');
  assert.equal(R.linhaDaParecida(x, agora), 'Recepção · grupo Produção · último sinal há 12 min (hoje, 09:48)');
  const c = R.confirmacaoDeReconectar(x, agora);
  assert.equal(c.titulo, 'Esta é mesmo a Recepção?');
  assert.equal(c.botao, 'Sim, é a Recepção');
  assert.equal(c.perigo, true);
  assert.match(c.texto, /último sinal há 12 min \(hoje, 09:48\)/);
  assert.match(c.texto, /continua na parede dela .*toque em Cancelar: esta é outra TV\./);
  // O bloco: "Não, é outra TV" é o principal e vem em foco; "É a X" pede a confirmação.
  const b = ler('web/src/components/tela/PareceSerATv.jsx');
  assert.match(b, /<Button type="button" variant="primary" size=\{tamanho\} autoFocus disabled=\{busy\} onClick=\{onNova\}>Não, é outra TV<\/Button>/);
  assert.ok(b.indexOf('>Não, é outra TV<') < b.indexOf("'É a ' + t.nome + ', que voltou'"), '"Não, é outra TV" vem antes');
  assert.match(b, /variant="ghost" size=\{tamanho\} icon=\{RefreshCw\} disabled=\{busy\} onClick=\{\(\) => eAMesma\(t\)\}/);
  assert.match(b, /if \(!\(await confirmar\(confirmacaoDeReconectar\(t, Date\.now\(\)\)\)\)\) return;\n\s+onReconectar\(t\.id\);/);
  // Os dois lugares que ligam a TV usam o bloco; o "Sim, é a X" de um toque saiu.
  for (const f of ['web/src/pages/ScreensPage.jsx', 'web/src/components/primeira-tv/PassoTv.jsx']) {
    const s = ler(f);
    assert.doesNotMatch(s, /'Sim, é a ' \+ t\.nome/, f + ': voltou o "Sim" de um toque');
    assert.match(s, /<PareceSerATv talvez=\{talvez\} busy=\{busy\}/, f);
    assert.match(s, /\.codigo === 'parece-reconectar' \? '' : paraGente\(/, f + ': a pergunta virou erro vermelho de novo');
  }
  // O servidor diz primeiro o caso do dia da instalação (e a pergunta continua a mesma).
  assert.match(ler('server/routes/telas.js'), /É ela\? Instalando uma TV nova, é outra TV\. /);
  // O roteiro de instalação descreve a tela de agora.
  const roteiro = ler('docs/implantacao/ROTEIRO-DE-INSTALACAO.md');
  assert.match(roteiro, /toque em \*\*"Não, é outra TV"\*\*: é o\s+botão violeta, o primeiro/);
  assert.match(roteiro, /\*\*"É a Recepção, que voltou"\*\*/);
  assert.match(roteiro, /toque em \*\*Cancelar\*\*/);
});
