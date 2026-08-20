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
  const lido = jobs.publico(await jobs.ler(j.id, 'ten_a'));
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
  const lido = jobs.publico(await jobs.ler(j.id, 'ten_a'));
  assert.equal(lido.etapa, 'compondo as peças');
  assert.equal(lido.detalhe, '2 de 3');
  solta();
});

test('falha na tarefa vira estado de erro, não exceção solta', async () => {
  const j = jobs.criar('ten_a', async () => { throw new Error('a IA caiu'); });
  await espere(30);
  const lido = jobs.publico(await jobs.ler(j.id, 'ten_a'));
  assert.equal(lido.estado, 'erro');
  assert.equal(lido.erro, 'a IA caiu');
  assert.equal(lido.resultado, null);
});

test('outra empresa não lê o trabalho mesmo sabendo o id', async () => {
  const j = jobs.criar('ten_a', async () => ({ segredo: true }));
  await espere(30);
  assert.equal(await jobs.ler(j.id, 'ten_b'), null);
  assert.ok(await jobs.ler(j.id, 'ten_a'));
});

test('id inexistente devolve null em vez de estourar', async () => {
  assert.equal(await jobs.ler('job_nao_existe', 'ten_a'), null);
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

/* ---------------- Sobreviver ao reinício ---------------- */

/*
 * Estes testes usam o SQLite de verdade, porque é justamente a ida ao banco
 * que está sendo verificada. Um banco de mentira provaria que o código chama
 * as funções certas, não que o trabalho volta depois de o processo morrer.
 */
const dbReal = require('../server/db-sqlite.js');

test('o resultado sobrevive ao processo morrer', async () => {
  /*
   * O estrago que isto conserta é o mais silencioso do sistema: uma geração
   * que TERMINOU e ninguém leu ainda. O resultado estava pronto, custou
   * chamada de modelo, e sumia junto com o processo — a pessoa voltava para
   * buscar e não havia nada.
   *
   * "Reiniciar" é simulado do único jeito honesto: um módulo NOVO, com a
   * memória vazia, lendo o mesmo banco.
   */
  jobs.usarBanco(dbReal);
  const j = jobs.criar('ten_reboot', async () => ({ pecas: ['a', 'b'] }), { tipo: 'campanha' });
  /*
   * Espera a GRAVAÇÃO, não um tempo chutado.
   *
   * A primeira versão dormia 60 ms, e o teste falhava de vez em quando quando
   * a suíte inteira roda junto e os arquivos disputam o mesmo SQLite. A
   * intermitência estava certa: as escritas do trabalho não eram
   * sequenciadas, e no Postgres o UPDATE do resultado podia chegar antes do
   * INSERT que cria a linha. Esperar o momento certo em vez de um relógio é o
   * que faz o teste falhar por defeito, e não por azar.
   */
  await j.pronto;

  delete require.cache[require.resolve('../server/jobs')];
  const outroProcesso = require('../server/jobs');
  outroProcesso.usarBanco(dbReal);

  const lido = await outroProcesso.ler(j.id, 'ten_reboot');
  assert.ok(lido, 'o trabalho não estava no banco depois do reinício');
  assert.equal(lido.estado, 'pronto');
  assert.deepEqual(lido.resultado, { pecas: ['a', 'b'] }, 'o resultado não voltou inteiro');
  assert.equal(lido.tipo, 'campanha');
});

test('outra empresa não lê o trabalho nem vindo do banco', async () => {
  // A porta do tenant tem que valer nos DOIS caminhos de leitura. Ela valia na
  // memória desde sempre; o caminho do banco é novo, e é onde ela faltaria.
  jobs.usarBanco(dbReal);
  const j = jobs.criar('ten_dono', async () => ({ segredo: true }));
  await j.pronto;

  delete require.cache[require.resolve('../server/jobs')];
  const outroProcesso = require('../server/jobs');
  outroProcesso.usarBanco(dbReal);

  assert.equal(await outroProcesso.ler(j.id, 'ten_intruso'), null, 'o banco vazou o trabalho de outra conta');
  assert.ok(await outroProcesso.ler(j.id, 'ten_dono'));
});

test('trabalho interrompido pelo reinício vira erro, não espera eterna', async () => {
  /*
   * Um trabalho que estava `rodando` quando o processo caiu ficaria `rodando`
   * para sempre no banco — e o painel de quem esperava contaria etapa de uma
   * geração que não existe mais, sem nunca terminar. Um erro com frase clara é
   * pior que ter dado certo e muito melhor que esperar para sempre.
   */
  jobs.usarBanco(dbReal);
  let nuncaTermina;
  const j = jobs.criar('ten_orfao', () => new Promise((r) => { nuncaTermina = r; }));
  await j.fila;  // o INSERT já aconteceu; a tarefa, de propósito, nunca termina

  delete require.cache[require.resolve('../server/jobs')];
  const outroProcesso = require('../server/jobs');
  outroProcesso.usarBanco(dbReal);
  await outroProcesso.fecharOrfaos();

  const lido = await outroProcesso.ler(j.id, 'ten_orfao');
  assert.equal(lido.estado, 'erro', 'o trabalho órfão ficou rodando para sempre');
  assert.match(lido.erro, /reiniciou/, 'a frase não explica o que aconteceu');
  nuncaTermina();
});

test('o pedido volta junto, para a pessoa reconhecer o que esperava', async () => {
  // Um id não diz nada a ninguém. "Compondo — promoção de sexta" diz tudo.
  jobs.usarBanco(dbReal);
  const j = jobs.criar('ten_pedido', async () => ({ ok: 1 }), {
    tipo: 'peca-do-editor', pedido: { brief: 'promoção de sexta' }, userId: 'u1',
  });
  await j.pronto;

  delete require.cache[require.resolve('../server/jobs')];
  const outroProcesso = require('../server/jobs');
  outroProcesso.usarBanco(dbReal);

  const pub = outroProcesso.publico(await outroProcesso.ler(j.id, 'ten_pedido'));
  assert.equal(pub.tipo, 'peca-do-editor');
  assert.deepEqual(pub.pedido, { brief: 'promoção de sexta' });
});

test('a conta reencontra o que deixou rodando', async () => {
  // É o que faz "sair e voltar" funcionar numa aba nova, que não tem o id
  // guardado em lugar nenhum.
  jobs.usarBanco(dbReal);
  await jobs.criar('ten_lista', async () => ({ a: 1 }), { tipo: 'imagem' }).pronto;
  const meus = await jobs.doTenant('ten_lista', 10);
  assert.ok(meus.length >= 1);
  assert.equal(meus[0].tipo, 'imagem');
  assert.equal((await jobs.doTenant('ten_vazio', 10)).length, 0, 'a lista vazou trabalho de outra conta');
});

test('banco fora do ar não derruba o trabalho', async () => {
  /*
   * Gravar é o REGISTRO, não o produto. Se uma falha de escrita derrubasse a
   * geração, o remédio (sobreviver a reinício) teria criado um jeito novo de
   * perder o trabalho — que é o oposto do ponto.
   */
  jobs.usarBanco({
    async salvarJob() { throw new Error('banco fora'); },
    async atualizarJob() { throw new Error('banco fora'); },
    async lerJob() { throw new Error('banco fora'); },
  });
  const j = jobs.criar('ten_sem_banco', async () => ({ ok: true }));
  await j.pronto;
  const lido = await jobs.ler(j.id, 'ten_sem_banco');
  assert.equal(lido.estado, 'pronto', 'a falha de escrita derrubou a geração');
  assert.deepEqual(lido.resultado, { ok: true });
  jobs.usarBanco(null);
});
