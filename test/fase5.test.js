/*
 * Fase 5 do plano de ação (docs/qa-total/PLANO-DE-ACAO.md): a programação
 * pensa sozinha. A semana simulada mora em test/semana-simulada.test.js;
 * aqui, as peças que ela usa.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const RAIZ = path.join(__dirname, '..');
const ler = (f) => fs.readFileSync(path.join(RAIZ, f), 'utf8');
const I = require('../js/importancia.js');
const C = require('../server/calendario.js');

const AGORA = new Date(2026, 10, 5, 10, 0).getTime();

test('a importância vem da natureza da peça, com o porquê, e a escolha da pessoa vale', () => {
  const ex = (it) => I.explicar(it, { agoraMs: AGORA });
  assert.equal(ex({ titulo: 'Cuidado: piso molhado na entrada' }), 'Urgente · fala de segurança');
  assert.equal(ex({ titulo: 'Urgente: o sistema está fora do ar' }), 'Urgente · pede ação já');
  assert.equal(ex({ type: 'promo', titulo: 'Bolo de cenoura' }), 'Alta · é oferta');
  assert.equal(ex({ titulo: 'Reunião', meta: { expiraEm: new Date(2026, 10, 5, 16, 0).getTime() } }), 'Alta · sai hoje às 16h');
  assert.equal(ex({ titulo: 'Nossa história desde 1990' }), 'Normal · institucional');
  assert.equal(ex({ titulo: 'Semana de segurança no trabalho (SIPAT)' }), 'Normal · institucional', 'a palavra segurança sozinha não é urgência');
  // Quem escolheu, escolheu: a regra só explica.
  const r = I.comImportancia({ titulo: 'Piso molhado', meta: { prioridade: 'normal' } }, { agoraMs: AGORA });
  assert.equal(r.meta.prioridade, 'normal');
  assert.equal(r.meta.porque, 'fala de segurança');
  // A campanha entra com a importância (web/src/lib/rodar.js).
  assert.match(ler('web/src/lib/rodar.js'), /globalThis\.MTImportancia\.comImportancia\(it\)/);
  assert.match(ler('web/src/pages/ContentEditorPage.jsx'), /it\.meta && it\.meta\.porque \? ' · ' \+ it\.meta\.porque/);
});

test('o calendário entende "Black Friday" e "Natal" sem o dia escrito', async () => {
  const hoje = new Date(2026, 10, 5);
  const r = await C.entender('Black Friday e Natal', hoje);
  assert.deepEqual(r.map((e) => e.data + ' ' + e.titulo), ['2026-11-27 Black Friday', '2026-12-25 Natal']);
  assert.equal(r[0].tipo, 'campanha');
  // Com a data escrita, não duplica; e a data que já passou vai para o ano que vem.
  assert.equal((await C.entender('27/11 Black Friday\nNatal', hoje)).length, 2);
  assert.equal(C.datasPorNome('Páscoa', hoje)[0].data, '2027-03-28');
  assert.equal(C.datasPorNome('7 de setembro', hoje)[0].tipo, 'feriado');
});

test('a TV usa o rodízio de js/rodizio.js: tetos, tempo da leitura, sem reentrar e transição de até 0,7 s', () => {
  const P = ler('js/player.js');
  assert.match(ler('player.html'), /<script src="js\/rodizio\.js"><\/script>\n  <script src="js\/player\.js"><\/script>/);
  assert.match(P, /return R\.distribuir\(lista, \{ agoraMs: Date\.now\(\), hoje: agoraNaLoja\(\)\.data \}, durDe\);/);
  assert.match(P, /const dur = R \? R\.duracaoDe\(item, rendered\.duration\) : rendered\.duration;/);
  assert.match(P, /if \(currentSlide && noAr && noAr\.item === item && currentSlide\.el && currentSlide\.el\.isConnected\)/, 'a mesma peça fica no ar');
  assert.match(P, /const TRANS_DUR = \{ fade: 0\.6, slide: 0\.6, zoom: 0\.65, cinematic: 0\.7, none: 0 \};/);
  // O tempo posto à mão vale (o painel marca meta.duracaoManual).
  assert.match(ler('web/src/lib/contentTypes.js'), /export function ajustesDoEditor\(antes, depois\)/);
});

test('o dia inteiro coberto: a faixa sem peça fica com a vizinha', async () => {
  const A = await import('../web/src/lib/aplicarConteudo.js');
  const z = A.cobrirODia([A.agendarPeca({ id: 'm' }, 'manha', 0), A.agendarPeca({ id: 't' }, 'tarde', 0)]);
  assert.deepEqual(z.map((i) => i.agendamento.horaInicio + '-' + i.agendamento.horaFim), ['00:00-13:59', '14:00-23:59']);
  // Com peça no dia todo, ou um horário escolhido à mão, nada muda.
  const comDia = [A.agendarPeca({ id: 'd' }, 'dia', 0), A.agendarPeca({ id: 't' }, 'tarde', 0)];
  assert.deepEqual(A.cobrirODia(comDia), comDia);
  assert.match(ler('web/src/lib/publicar.js'), /cobrirODia\(pecas\.map/);
});
