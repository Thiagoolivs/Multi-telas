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
