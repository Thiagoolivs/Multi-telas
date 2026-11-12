/*
 * Fase 9 do plano de ação: modelos com função e pacotes prontos.
 *
 * Parte A: a galeria para o dono aprovar cada lote (o dono, em 05/11:
 * "galeria com botões"). Antes, aprovar era editar pecas-ouro/manifesto.json
 * à mão e esperar um deploy; só 1 das 26 telas prontas estava aprovada.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const RAIZ = path.join(__dirname, '..');
const ler = (f) => fs.readFileSync(path.join(RAIZ, f), 'utf8');
const C = require('../server/conteudoPronto.js');

test('as decisões da galeria valem por cima do arquivo, sem mudar o arquivo', () => {
  const m = { marcas: [], pecas: [{ id: 'p1', estado: 'aprovada', aprovadaEm: '2026-10-01' }, { id: 'p2', estado: 'proposta' }], telas: [{ id: 't1', estado: 'proposta' }, { id: 't2', estado: 'rascunho' }] };
  const em = new Date(2026, 10, 5, 12).getTime();
  const r = C.aplicarDecisoes(m, [
    { tipo: 'tela', id: 't1', estado: 'aprovada', decidido_por: 'dono@x', decidido_em: em },
    { tipo: 'peca', id: 'p1', estado: 'recusada', decidido_por: 'dono@x', decidido_em: em },
  ]);
  assert.equal(r.telas[0].estado, 'aprovada');
  assert.equal(r.telas[0].aprovadaEm, '2026-11-05');
  assert.equal(r.telas[0].decidido.por, 'dono@x');
  assert.equal(r.telas[1].estado, 'rascunho', 'sem decisão, vale o arquivo');
  assert.equal(r.pecas[0].estado, 'recusada');
  assert.equal(r.pecas[0].aprovadaEm, undefined, 'recusada não fica com data de aprovação');
  assert.equal(m.telas[0].estado, 'proposta', 'o manifesto recebido não muda');
  assert.deepEqual(C.aplicarDecisoes(m, []).telas, m.telas);
});

test('a decisão só vale para o que existe, e só com os três estados', () => {
  const m = { pecas: [{ id: 'p1' }], telas: [{ id: 't1' }] };
  assert.equal(C.conferirDecisao(m, 'tela', 't1', 'aprovada'), null);
  assert.equal(C.conferirDecisao(m, 'peca', 'p1', 'proposta'), null);
  assert.match(C.conferirDecisao(m, 'tela', 'nao-existe', 'aprovada'), /não existe/);
  assert.match(C.conferirDecisao(m, 'tela', 't1', 'publicada'), /estado desconhecido/);
  assert.match(C.conferirDecisao(m, 'marca', 't1', 'aprovada'), /tipo desconhecido/);
  // O manifesto de verdade abre e tem o que a galeria mostra.
  const real = C.lerManifesto(RAIZ);
  assert.ok(real.telas.length >= 26 && real.pecas.length >= 43);
});

test('aprovar uma tela leva junto as peças dela que esperam; a recusada fica recusada', () => {
  const m = {
    pecas: [{ id: 'a', estado: 'proposta' }, { id: 'b', estado: 'recusada' }, { id: 'c', estado: 'aprovada' }],
    telas: [{ id: 't', zonas: { principal: { pecas: [{ id: 'a' }, { id: 'b' }, { id: 'a' }] }, lateral: { pecas: [{ id: 'c' }] }, rodape: {} } }],
  };
  assert.deepEqual(C.pecasDaTela(m, 't'), ['a', 'b', 'c']);
  assert.deepEqual(C.pecasDaTela(m, 'nao-existe'), []);
  assert.deepEqual(C.pecasDaTela(m, 't').filter((id) => C.esperando(m.pecas.find((p) => p.id === id).estado)), ['a']);
  const s = ler('server.js');
  assert.match(s, /if \(tipo === 'tela' && estado === 'aprovada'\) \{[\s\S]*?conteudoPronto\.esperando\(p\.estado\)[\s\S]*?db\.decidirConteudo\('peca', pid, 'aprovada'/);
  // A IA aprende só com o que o dono aprovou: o lote novo, em proposta, fica fora.
  assert.match(ler('server/compositor.js'), /p\.papeis\.includes\(papel\) && \(!p\.estado \|\| p\.estado === 'aprovada'\)/);
});

test('o servidor: a galeria só para o operador, e o manifesto sai com as decisões', () => {
  const s = ler('server.js');
  const porta = s.indexOf("if (parts[1] === 'plataforma') {");
  const galeria = s.indexOf("if (parts[2] === 'conteudo') {");
  const guarda = s.indexOf("if (!quem.pode) return sendJson(res, 404, { error: 'rota não encontrada' });", porta);
  assert.ok(porta > 0 && guarda > porta && galeria > guarda, 'a galeria precisa ficar depois da porta do operador');
  assert.match(s, /await db\.decidirConteudo\(tipo, id, estado, sess\.email\);\s*log\.info\('conteudo\.decidir'/);
  assert.match(s, /if \(urlPath === '\/pecas-ouro\/manifesto\.json'\) \{\s*return Promise\.resolve\(\)\.then\(\(\) => db\.decisoesDoConteudo\(\)\)\.catch\(\(\) => \[\]\)/, 'sem banco, vale o arquivo');
  for (const arq of ['server/db-sqlite.js', 'server/db-postgres.js']) {
    const d = ler(arq);
    assert.match(d, /CREATE TABLE IF NOT EXISTS conteudo_pronto \(/, arq);
    assert.match(d, /PRIMARY KEY \(tipo, id\)/, arq);
    assert.match(d, /decisoesDoConteudo, decidirConteudo,/, arq);
  }
});

test('o painel: a galeria na Plataforma, com a peça desenhada e Aprovar e Recusar', () => {
  const g = ler('web/src/components/platform/ConteudoPronto.jsx');
  assert.match(g, /await plataforma\.decidirConteudo\(qual, item\.id, estado\);/);
  assert.match(g, /<Palco estado=\{estadoDaPrevia\(montarTela\(x, dados\.modelos, marcaDe\(x\.marca\), dados\.exemplos\)\)\}/, 'a tela é vista desenhada, não por nome');
  assert.match(g, />Aprovar<\/Button>/);
  assert.match(g, />Recusar<\/Button>/);
  // Todas as peças, também as que ainda não foram aprovadas (o carregarModelos só abre as aprovadas).
  assert.match(g, /\(m\.pecas \|\| \[\]\)\.map\(\(p\) => fetch\('\/pecas-ouro\/' \+ p\.id \+ '\.html'\)/);
  assert.match(ler('web/src/pages/PlatformPage.jsx'), /<ConteudoPronto \/>/);
  const api = ler('web/src/api.js');
  assert.match(api, /conteudo: \(\) => api\('GET', '\/api\/plataforma\/conteudo'\)/);
});

/*
 * Parte B: cada peça diz as frentes que atende, com o exemplo na língua de
 * cada uma. Antes a padaria via "Óculos de sol" e a fábrica, "Pão quente o
 * dia todo" (a ordem mudava por frente, mas tudo aparecia para todos).
 */
test('cada peça tem as frentes que atende, e os textos de cada frente cabem nos campos dela', () => {
  const m = JSON.parse(ler('pecas-ouro/manifesto.json'));
  const FRENTES = ['comercio', 'saude', 'empresa'];
  const DO_EXEMPLO = { otica: 'comercio', padaria: 'comercio', salao: 'comercio', lanchonete: 'comercio', clinica: 'saude', rotasul: 'empresa',
    // Lote 3: as peças novas também nascem nas marcas de exemplo do lote 2.
    restaurante: 'comercio', dentista: 'saude', farmacia: 'saude', escritorio: 'empresa', industria: 'empresa' };
  for (const p of m.pecas) {
    assert.ok(Array.isArray(p.frentes) && p.frentes.length, p.id + ' sem frentes');
    for (const f of p.frentes) assert.ok(FRENTES.includes(f), p.id + ': frente ' + f);
    assert.ok(p.frentes.includes(DO_EXEMPLO[p.marca]), p.id + ': não serve nem à frente do próprio exemplo');
    const campos = new Set([...ler('pecas-ouro/' + p.id + '.html').matchAll(/data-campo="([^"]+)"/g)].map((x) => x[1]));
    for (const [f, cs] of Object.entries(p.textos || {})) {
      assert.ok(p.frentes.includes(f), p.id + ': texto de uma frente que ela não atende (' + f + ')');
      for (const k of Object.keys(cs)) assert.ok(campos.has(k), p.id + ': o campo ' + k + ' não existe na peça');
    }
  }
  const por = (id) => m.pecas.find((p) => p.id === id);
  // Os casos do QA: pão na fábrica e aniversariante na loja.
  assert.equal(por('servico-horario').textos.empresa.titulo, 'Horário');
  assert.ok(!por('gente-aniversariante').frentes.includes('comercio'));
  assert.deepEqual(por('cardapio-combo').frentes, ['comercio']);
});

test('o painel filtra pela frente e põe o exemplo dela; o botão mostra os outros', async () => {
  const { pathToFileURL } = require('node:url');
  globalThis.MTPecaHtml = globalThis.MTPecaHtml || {};
  const src = ler('web/src/lib/modelosOuro.js');
  // Reteste 2: pela frente e pela época (naEpoca: a campanha fora do mês não aparece).
  assert.match(src, /export const daFrente = \(modelos, perfil, hoje\) => modelos\.filter\(\(m\) => \(!Array\.isArray\(m\.frentes\) \|\| !m\.frentes\.length \|\| m\.frentes\.includes\(perfil\)\)\s+&& naEpoca\(m, perfil, hoje\)\);/);
  assert.match(src, /const daFrente = \(frente && m\.textos && m\.textos\[frente\]\) \|\| \{\};/);
  const p = ler('web/src/pages/PecasProntasPage.jsx');
  // Fase 10: pela frente e pelo ramo (separarPorRamo); os de outra frente e de outro negócio vão para o botão.
  assert.match(p, /const daMinhaFrente = ordenarPorPerfil\(daFrente\(modelos, perfil\.id\), perfil\.id\);/);
  assert.match(p, /separarPorRamo\(daMinhaFrente, marca\.ramo, perfil\.id\)/);
  assert.match(p, /itemDoModelo\(m, marca, perfil\.id\)/);
  assert.match(p, /'Ver também os de outros negócios'/);
  void pathToFileURL;
});

/*
 * Parte C: o lote 2 — um pacote por tipo de negócio, em deitado, em pé e
 * quadrado, com os textos do próprio negócio. O lote 1 de Comércio era todo
 * da ótica: a padaria via óculos de sol. Conferido na bancada: as 27 telas
 * com a letra em pelo menos 85% do mínimo do lugar (a meta das partes).
 */
test('o lote 2: nove negócios, três formatos cada, esperando a aprovação na galeria', () => {
  const m = JSON.parse(ler('pecas-ouro/manifesto.json'));
  const lote = m.telas.filter((t) => t.lote === 2);
  const NEGOCIOS = ['padaria', 'otica', 'restaurante', 'salao', 'clinica', 'dentista', 'farmacia', 'escritorio', 'industria'];
  // Fase 10: a quadrada é square-hero (sem cabeçalho): a principal fica quase quadrada, o formato em que as peças cabem.
  const LAYOUT = { deitada: 'corporate', 'em-pe': 'portrait-stack', quadrada: 'square-hero' };
  assert.equal(lote.length, NEGOCIOS.length * 3);
  for (const n of NEGOCIOS) {
    for (const [forma, layout] of Object.entries(LAYOUT)) {
      const t = lote.find((x) => x.id === 'l2-' + n + '-' + forma);
      assert.ok(t, n + ' ' + forma);
      assert.equal(t.layout, layout);
      assert.equal(t.negocio, n);
      assert.equal(t.estado, 'proposta', 'só vai para as contas depois da galeria');
      assert.ok(['comercio', 'saude', 'empresa'].includes(t.perfil));
      assert.ok(t.ramos.length, n + ' sem ramo da Marca');
      assert.ok(m.marcas.some((b) => b.id === t.marca), n + ': marca de exemplo');
      // A quadrada não tem lado: o que é do lado entra na principal.
      assert.equal('lateral' in t.zonas, forma !== 'quadrada', n + ' ' + forma);
      for (const z of Object.values(t.zonas)) for (const p of z.pecas) {
        const campos = new Set([...ler('pecas-ouro/' + p.id + '.html').matchAll(/data-campo(?:-img|-qr)?="([^"]+)"/g)].map((x) => x[1]));
        for (const k of Object.keys(p.campos || {})) assert.ok(campos.has(k), t.id + ': ' + p.id + ' não tem o campo ' + k);
      }
    }
  }
  // O caso do QA: a padaria fala de pão, e nenhuma tela de Comércio do lote 2 é de ótica fora da ótica.
  const pad = JSON.stringify(lote.find((t) => t.id === 'l2-padaria-deitada'));
  assert.ok(!/[ÓóOo]culos/.test(pad));
});

test('as telas prontas: o pacote do negócio da conta primeiro, na orientação das TVs dela', async () => {
  const { pathToFileURL } = require('node:url');
  const T = await import(pathToFileURL(path.join(RAIZ, 'web/src/lib/telasProntas.js')).href);
  const telas = [
    { id: 'geral', layout: 'corporate' },
    { id: 'otica-pe', layout: 'portrait-stack', negocio: 'otica', ramos: ['otica'] },
    { id: 'padaria-pe', layout: 'portrait-stack', negocio: 'padaria', ramos: ['padaria'] },
    { id: 'padaria', layout: 'corporate', negocio: 'padaria', ramos: ['padaria'] },
  ];
  assert.deepEqual(T.ordemDasTelas(telas, 'padaria', null).map((t) => t.id), ['padaria-pe', 'padaria', 'geral', 'otica-pe']);
  assert.deepEqual(T.ordemDasTelas(telas, 'padaria', false).map((t) => t.id), ['padaria', 'padaria-pe', 'geral', 'otica-pe']);
  assert.deepEqual(T.ordemDasTelas(telas, '', null).map((t) => t.id), ['geral', 'otica-pe', 'padaria-pe', 'padaria'], 'sem ramo: as gerais primeiro');
  const c = T.paraOCliente({ id: 'x', zonas: {}, negocio: 'padaria', ramos: ['padaria'] });
  assert.equal(c.negocio, 'padaria');
  assert.deepEqual(c.ramos, ['padaria']);
  // Fase 10: a tela de outro negócio (a ótica na padaria) só em "Todas".
  assert.match(ler('web/src/pages/TelasProntasPage.jsx'), /return ordemDasTelas\(dados\.telas\.filter\(\(t\) => todas \|\| \(doPerfil\(t\) && !deOutroNegocio\(t\)\)\), marca\.ramo, emPeAsTvs\)/);
});
