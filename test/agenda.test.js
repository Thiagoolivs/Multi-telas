/*
 * "Quando mostrar" de um conteúdo.
 *
 * O player já sabia agendar (agendadoAgora em js/player.js); faltava o painel
 * deixar o dono pedir "o cardápio do café só até as 10h". O resumo em
 * português é o que aparece na lista da sequência — é por ele que a pessoa
 * confere, sem abrir o conteúdo, que pediu o que queria.
 */
const test = require('node:test');
const assert = require('node:assert');

const carregar = () => import('../web/src/lib/agenda.js');

test('resumo: dias comuns em português, não uma lista de números', async () => {
  const { resumoAgenda } = await carregar();
  assert.equal(resumoAgenda({ ativo: true, dias: [], horaInicio: '06:00', horaFim: '10:00' }), 'Todo dia, das 06:00 às 10:00');
  assert.equal(resumoAgenda({ ativo: true, dias: [1, 2, 3, 4, 5] }), 'De segunda a sexta');
  assert.equal(resumoAgenda({ ativo: true, dias: [6, 1, 2, 3, 4, 5] }), 'De segunda a sábado');
  assert.equal(resumoAgenda({ ativo: true, dias: [0, 6], horaInicio: '17:00', horaFim: '19:00' }), 'No fim de semana, das 17:00 às 19:00');
  assert.equal(resumoAgenda({ ativo: true, dias: [5] }), 'Só na sexta');
  assert.equal(resumoAgenda({ ativo: true, dias: [0] }), 'Só no domingo');
  assert.equal(resumoAgenda({ ativo: true, dias: [1, 3, 5] }), 'Segunda, quarta e sexta');
});

test('resumo: período em dd/mm', async () => {
  const { resumoAgenda } = await carregar();
  assert.equal(resumoAgenda({ ativo: true, dataInicio: '2026-12-01', dataFim: '2026-12-24' }), 'Todo dia, de 01/12 a 24/12');
  assert.equal(resumoAgenda({ ativo: true, dataFim: '2026-12-24' }), 'Todo dia, até 24/12');
});

test('sem agendamento (ou desligado): sem resumo', async () => {
  const { resumoAgenda, temAgenda } = await carregar();
  assert.equal(resumoAgenda(null), '');
  assert.equal(resumoAgenda({ ativo: false, horaInicio: '06:00' }), '');
  assert.equal(temAgenda({ agendamento: { ativo: false } }), false);
  assert.equal(temAgenda({ agendamento: { ativo: true } }), true);
});

test('agendamento que nunca acontece é apontado', async () => {
  const { problemaDaAgenda } = await carregar();
  assert.match(problemaDaAgenda({ ativo: true, dataInicio: '2026-12-24', dataFim: '2026-12-01' }), /nunca vai aparecer/);
  assert.match(problemaDaAgenda({ ativo: true, dataFim: '2020-01-01' }), /já terminou/);
  assert.equal(problemaDaAgenda({ ativo: true, horaInicio: '06:00', horaFim: '10:00' }), '');
});

test('zona em que TODO conteúdo tem horário é apontada (o resumo da tela avisa)', async () => {
  // Fora das janelas a zona fica só no relógio — "de tarde a TV não mostra nada".
  // (A regra mora em agenda.js: screenDigest.js puxa ícones do painel, que o
  // CI não instala — importá-lo aqui derrubou a execução.)
  const { zonaSoComHorario } = await carregar();
  const ag = { ativo: true, horaInicio: '06:00', horaFim: '10:00' };
  assert.equal(zonaSoComHorario([{ agendamento: ag }]), true);
  assert.equal(zonaSoComHorario([{ agendamento: ag }, { type: 'text' }]), false);
  assert.equal(zonaSoComHorario([]), false);
  const fs = require('node:fs');
  const path = require('node:path');
  const digest = fs.readFileSync(path.join(__dirname, '..', 'web', 'src', 'lib', 'screenDigest.js'), 'utf8');
  assert.match(digest, /if \(zonaSoComHorario\(itens\)\)/, 'o resumo da tela deixou de usar a regra');
});
