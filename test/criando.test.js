/*
 * Aba "Criando" (EXECUTOR D11).
 *
 * A geração roda no servidor e sobrevive à aba fechada, mas quem saía do
 * Criar no meio não tinha onde ver o andamento nem ficava sabendo quando
 * terminava. Agora: a aba Criando (com o número dos que estão rodando), a
 * lista leve no servidor e o aviso "ficou pronta" em qualquer página.
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const jobs = require('../server/jobs.js');
const RAIZ = path.join(__dirname, '..');
const ler = (f) => fs.readFileSync(path.join(RAIZ, f), 'utf8');

test('a lista leve não leva a campanha inteira: só o id e o nome', () => {
  const pesado = { campanha: { id: 'camp_abc', nome: 'Natal', resultado: { telas: [{ html: 'x'.repeat(50000) }] } } };
  const r = jobs.resumir({ id: 'job_1', tipo: 'campanha', estado: 'pronto', resultado: pesado, criadoEm: Date.now() - 5000, terminadoEm: Date.now(), pedido: { brief: 'Natal' } });
  assert.equal(r.resultado, null);
  assert.deepEqual(r.campanha, { id: 'camp_abc', nome: 'Natal' });
  assert.ok(JSON.stringify(r).length < 500, 'a lista leve ficou pesada');
  const img = jobs.resumir({ id: 'job_2', tipo: 'imagem', estado: 'pronto', resultado: { url: '/media/t/a.png', mime: 'image/png' }, criadoEm: Date.now() });
  assert.equal(img.url, '/media/t/a.png');
  const rodando = jobs.resumir({ id: 'job_3', tipo: 'campanha', estado: 'rodando', resultado: pesado, criadoEm: Date.now() });
  assert.equal(rodando.campanha, undefined, 'campanha que ainda roda não tem para onde levar');
  assert.match(ler('server.js'), /lista\.map\(query && query\.leve === '1' \? jobs\.resumir : jobs\.publico\)/);
});

test('o painel: aba Criando com o número, observador global e aviso ao terminar', () => {
  const menu = ler('web/src/lib/menu.js');
  assert.match(menu, /paginas: \['criar', 'criando', 'campanhas'\]/);
  const t = ler('web/src/lib/trabalhos.js');
  // Pergunta rápido só com trabalho rodando e a aba à vista.
  assert.match(t, /timer = setTimeout\(perguntar, rodando && !escondida \? 3000 : 30000\);/);
  // Avisa o que terminou depois de abrir o painel (visto rodando, ou novo) — nunca o que já tinha terminado ao abrir.
  assert.match(t, /if \(j\.estado === 'rodando' \|\| \(antes !== undefined && antes !== 'rodando'\)\) return;/);
  assert.match(t, /if \(lista === null\) itens\.forEach\(\(j\) => vistos\.set\(j\.id, j\.estado\)\);/);
  // A página que já mostra o próprio resultado não ganha aviso repetido.
  assert.match(t, /if \(\(quemJaAvisa\[j\.tipo\] \|\| \[\]\)\.includes\(paginaAtual\(\)\)\) return;/);
  assert.match(ler('web/src/App.jsx'), /if \(session\) ligarTrabalhos\(go, \(\) => rotaAtual\.current\);/);
  assert.match(ler('web/src/App.jsx'), /case 'criando': return <CriandoPage onIr=\{go\} \/>;/);
  assert.match(ler('web/src/components/layout/Navegacao.jsx'), /p === 'criando' && rodando > 0/);
  // Começar uma geração acorda a lista na hora.
  assert.equal((ler('web/src/api.js').match(/avisarQueComecou\(\);/g) || []).length, 2);
});
