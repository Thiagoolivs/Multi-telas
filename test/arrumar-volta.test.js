/*
 * "Arrumar a volta" (reteste do bloco 3, cenário 7): a TV com 30 peças leva
 * uns 7 min para dar a volta no balcão. O resumo da TV avisava, mas limpar
 * era uma peça de cada vez. Agora o aviso oferece a lista do que pode sair,
 * com o porquê: o prazo que acabou, a repetida, o exemplo e, se ainda não
 * couber, as mais antigas (web/src/lib/arrumarVolta.js). Sai pelo "Pôr na
 * TV" de sempre (com a aprovação, vira pedido), com Desfazer.
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const RAIZ = path.join(__dirname, '..');
const ler = (f) => fs.readFileSync(path.join(RAIZ, f), 'utf8');
const importar = (f) => import(pathToFileURL(path.join(RAIZ, f)).href);
const AGORA = new Date(2026, 10, 6, 10, 0).getTime();   // sexta, 06/11/2026, 10h
const peca = (id, titulo, extra) => Object.assign({ type: 'announce', id, titulo, corpo: 'Venha conferir com a gente.', duracao: 12 }, extra || {});
const BALCAO = 300;

test('trinta peças no balcão: sai das mais antigas até a volta caber, e o aviso some', async () => {
  const A = await importar('web/src/lib/arrumarVolta.js');
  const D = await importar('web/src/lib/screenDigest.js');
  const itens = Array.from({ length: 30 }, (_, i) => peca('p' + i, 'Peça número ' + (i + 1) + ' da loja, com o texto do dia'));
  const cfg = { settings: { layoutId: 'full', local: 'balcao' }, zonas: { principal: { items: itens } } };
  const aviso = D.digest(cfg).problemas.find((p) => p.volta);
  assert.ok(aviso, 'o resumo não avisou a volta longa');
  assert.deepEqual([aviso.volta.zona, aviso.volta.max, aviso.volta.lugar], ['principal', BALCAO, 'no balcão']);
  // A conta é a mesma do resumo.
  assert.equal(A.voltaSem(itens, [], AGORA), aviso.volta.ciclo);
  assert.ok(aviso.volta.ciclo > 400, 'a volta das 30 peças: ' + aviso.volta.ciclo);

  const s = A.pecasParaTirar(itens, { maxSeg: aviso.volta.max, agoraMs: AGORA });
  assert.ok(s.pecas.length > 0 && s.pecas.every((p) => p.motivo === 'antiga'));
  assert.ok(s.depois <= BALCAO, 'depois de tirar, a volta ainda passa: ' + s.depois);
  // Das mais antigas (as de cima, que entraram primeiro), e só o necessário.
  assert.deepEqual(s.pecas.map((p) => p.indice), Array.from({ length: s.pecas.length }, (_, i) => i));
  assert.ok(A.voltaSem(itens, s.pecas.slice(1).map((p) => p.indice), AGORA) > BALCAO, 'tirou uma a mais do que precisava');

  const limpa = A.semAsPecas(cfg, { principal: s.pecas.map((p) => p.indice) });
  assert.equal(limpa.zonas.principal.items.length, 30 - s.pecas.length);
  assert.equal(limpa.zonas.principal.items[0].id, 'p' + s.pecas.length);
  assert.equal(cfg.zonas.principal.items.length, 30, 'mexeu na programação recebida');
  assert.ok(!D.digest(limpa).problemas.some((p) => p.volta), 'o aviso de volta longa continuou');
});

test('o porquê de cada uma: prazo que acabou, exemplo, repetida (fica a mais nova) — e antes da idade', async () => {
  const A = await importar('web/src/lib/arrumarVolta.js');
  const itens = [
    peca('a', 'Black Friday', { agendamento: { ativo: true, dataInicio: '2026-10-20', dataFim: '2026-11-03', dias: [] } }),
    peca('b', 'Pão de queijo quentinho'),
    peca('c', 'Texto de exemplo', { meta: { exemplo: true } }),
    peca('d', 'Promoção relâmpago', { meta: { expiraEm: AGORA - 3600 * 1000 } }),
    null,
    peca('e', '  pão de QUEIJO   quentinho '),
    peca('f', 'Hoje tem bolo', { agendamento: { ativo: true, dataInicio: '2026-11-06', dataFim: '2026-11-06', dias: [] } }),
    { type: 'image', id: 'g', src: '/media/foto.jpg', duracao: 8 },
    { type: 'image', id: 'h', src: '/media/foto.jpg', duracao: 8 },
  ];
  const s = A.pecasParaTirar(itens, { maxSeg: 9999, agoraMs: AGORA });
  assert.deepEqual(s.pecas.map((p) => [itens[p.indice].id, p.motivo]), [['a', 'vencida'], ['b', 'repetida'], ['c', 'exemplo'], ['d', 'vencida'], ['g', 'repetida']]);
  assert.equal(s.pecas[0].texto, 'O prazo acabou em 03/11.');
  assert.ok(s.pecas.every((p) => p.texto), 'peça sem o porquê');
  // A que acaba hoje fica; com teto folgado, nenhuma sai por idade.
  assert.ok(!s.pecas.some((p) => p.motivo === 'antiga'));
  assert.equal(A.chaveDoTexto(itens[1]), A.chaveDoTexto(itens[5]));
  assert.notEqual(A.chaveDoTexto(peca('x', 'Oi')), A.chaveDoTexto({ type: 'text', titulo: 'Oi' }), 'o mesmo texto em tipos diferentes não é repetido');
  assert.equal(A.chaveDoTexto({ type: 'clock' }), '', 'peça sem texto nem foto não tem par');
});

test('nunca tira todas, nem a da Agenda, o automático, o urgente ou a Alta por idade', async () => {
  const A = await importar('web/src/lib/arrumarVolta.js');
  const vencida = (id) => peca(id, 'Aviso ' + id, { agendamento: { ativo: true, dataInicio: '2026-10-01', dataFim: '2026-10-02', dias: [] } });
  const duas = A.pecasParaTirar([vencida('a'), vencida('b')], { maxSeg: 300, agoraMs: AGORA });
  assert.deepEqual(duas.pecas.map((p) => p.indice), [0], 'a parte ficaria vazia (só o relógio)');
  const longo = (id, extra) => peca(id, 'Peça ' + id + ' com bastante texto para ler devagar na frente da TV, todo dia', extra);
  const itens = [
    longo('cal', { _calendario: 'cal_1' }), longo('auto', { _automatico: 'aniversarios' }),
    longo('urg', { meta: { prioridade: 'urgente' } }), longo('alta', { meta: { prioridade: 'alta' } }),
    ...Array.from({ length: 20 }, (_, i) => longo('n' + i)),
  ];
  const s = A.pecasParaTirar(itens, { maxSeg: 120, agoraMs: AGORA });
  const ids = s.pecas.map((p) => itens[p.indice].id);
  assert.ok(ids.length > 0);
  for (const id of ['cal', 'auto', 'urg', 'alta']) assert.ok(!ids.includes(id), id + ' saiu por idade');
  // O dia em que entrou vale mais que a ordem: a que entrou antes sai antes.
  const datadas = [longo('nova', { agendamento: { ativo: true, dataInicio: '2026-11-05', dataFim: '', dias: [] } }),
    longo('velha', { agendamento: { ativo: true, dataInicio: '2026-09-01', dataFim: '', dias: [] } }), ...Array.from({ length: 12 }, (_, i) => longo('m' + i))];
  assert.equal(datadas[A.pecasParaTirar(datadas, { maxSeg: 200, agoraMs: AGORA }).pecas[0].indice].id, 'm0', 'sem dia conta como a mais antiga');
  const so2 = [datadas[0], datadas[1], longo('z1'), longo('z2'), longo('z3'), longo('z4'), longo('z5'), longo('z6'), longo('z7'), longo('z8')].map((x) => ({ ...x, agendamento: x.agendamento || { ativo: true, dataInicio: '2026-10-15', dataFim: '', dias: [] } }));
  assert.equal(so2[A.pecasParaTirar(so2, { maxSeg: 150, agoraMs: AGORA }).pecas[0].indice].id, 'velha');
  // Peça fixa (duração 0) prende a parte: a volta é 0, como no resumo.
  assert.equal(A.voltaSem([peca('a', 'x'), { type: 'video', duracao: 0 }], [], AGORA), 0);
});

test('o painel: o botão no aviso de volta longa, a lista com o porquê, e o "Pôr na TV" de sempre com Desfazer', () => {
  const resumo = ler('web/src/components/content/ScreenSummary.jsx');
  assert.match(resumo, /\{p\.volta && aoArrumar && \(/);
  assert.match(resumo, /<ArrumarVolta cfg=\{cfg\} volta=\{p\.volta\} aoArrumar=\{aoArrumar\}/);
  const pagina = ler('web/src/pages/ContentEditorPage.jsx');
  assert.match(pagina, /<ScreenSummary cfg=\{cfg\} aoArrumar=\{arrumarVolta\} \/>/);
  const fn = pagina.slice(pagina.indexOf('async function arrumarVolta'), pagina.indexOf('async function desfazer'));
  assert.match(fn, /await publish\(novo\)/, 'não passou pelo caminho de sempre (e pela aprovação)');
  assert.match(fn, /rotulo: 'Desfazer'/);
  assert.match(fn, /publish\(antes\)/);
  const c = ler('web/src/components/tela/ArrumarVolta.jsx');
  assert.match(c, /Arrumar a volta/);
  assert.equal((c.match(/variant="primary"/g) || []).length, 1, 'um violeta só, no rodapé da janela');
  assert.match(c, /<Button size="sm" variant="secondary" icon=\{Scissors\} onClick=\{abrir\}/);
  assert.match(c, /type="checkbox" checked=\{marcada\}/);
  assert.match(c, /NOME_DO_MOTIVO\[p\.motivo\]/);
  assert.match(c, /semAsPecas\(foto, \{ \[volta\.zona\]: \[\.\.\.fora\] \}\)/);
});
