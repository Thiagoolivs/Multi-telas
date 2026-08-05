/*
 * Os trabalhos guardam campanhas prontas até o painel buscá-las. O que estes
 * testes protegem: um id adivinhado não pode ler a campanha de outra empresa, e
 * um erro dentro da tarefa vira estado de erro em vez de derrubar o processo.
 */
const test = require('node:test');
const assert = require('node:assert');
const jobs = require('../server/jobs');

const espere = (ms) => new Promise((r) => setTimeout(r, ms));

test('trabalho começa rodando e termina pronto com o resultado', async () => {
  const j = jobs.criar('ten_a', async () => ({ pecas: [1, 2] }));
  assert.equal(j.estado, 'rodando');
  await espere(30);
  const lido = jobs.publico(jobs.ler(j.id, 'ten_a'));
  assert.equal(lido.estado, 'pronto');
  assert.deepEqual(lido.resultado, { pecas: [1, 2] });
});

test('a tarefa reporta em que etapa está', async () => {
  let solta;
  const espera = new Promise((r) => { solta = r; });
  const j = jobs.criar('ten_a', async (progresso) => {
    progresso('compondo as peças', '2 de 3');
    await espera;
    return {};
  });
  await espere(20);
  const lido = jobs.publico(jobs.ler(j.id, 'ten_a'));
  assert.equal(lido.etapa, 'compondo as peças');
  assert.equal(lido.detalhe, '2 de 3');
  solta();
});

test('falha na tarefa vira estado de erro, não exceção solta', async () => {
  const j = jobs.criar('ten_a', async () => { throw new Error('a IA caiu'); });
  await espere(30);
  const lido = jobs.publico(jobs.ler(j.id, 'ten_a'));
  assert.equal(lido.estado, 'erro');
  assert.equal(lido.erro, 'a IA caiu');
  assert.equal(lido.resultado, null);
});

test('outra empresa não lê o trabalho mesmo sabendo o id', async () => {
  const j = jobs.criar('ten_a', async () => ({ segredo: true }));
  await espere(30);
  assert.equal(jobs.ler(j.id, 'ten_b'), null);
  assert.ok(jobs.ler(j.id, 'ten_a'));
});

test('id inexistente devolve null em vez de estourar', () => {
  assert.equal(jobs.ler('job_nao_existe', 'ten_a'), null);
});

test('uma conta não pode encher a memória com trabalhos', async () => {
  let solta;
  const espera = new Promise((r) => { solta = r; });
  const tarefa = async () => { await espera; return {}; };
  for (let i = 0; i < 4; i++) jobs.criar('ten_cheio', tarefa);
  assert.throws(() => jobs.criar('ten_cheio', tarefa), /trabalhos demais/);
  // Outra empresa segue livre — o limite é por conta, não global.
  assert.ok(jobs.criar('ten_livre', tarefa));
  solta();
});
