/*
 * server/jobs.js — trabalhos longos que não cabem numa requisição HTTP.
 *
 * Toda geração de IA passa por aqui. Não é só o diretor de arte: reescrever um
 * texto, gerar um kit de marca, compor uma peça no editor — todas eram
 * requisições síncronas, e todas tinham o mesmo defeito, só que em tamanhos
 * diferentes. Fechar a aba, trocar de página, o celular travar a rede por dez
 * segundos: o trabalho morria, e o crédito de IA já tinha sido gasto.
 *
 * O POST cria um trabalho e devolve na hora; o painel acompanha por polling.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POR QUE MEMÓRIA **E** BANCO
 *
 * A memória guarda o que está RODANDO, porque é lá que a função async mora —
 * não há como serializar uma promessa a meio caminho.
 *
 * O banco guarda o RESULTADO, e isso conserta dois estragos diferentes:
 *
 *   — Um deploy no meio de uma geração. O Railway reinicia por qualquer
 *     atualização, e a pessoa recebia "o trabalho expirou" numa campanha que
 *     ela viu começar.
 *   — Pior, e mais silencioso: uma geração que TERMINOU e ninguém leu ainda.
 *     O resultado estava pronto, custou chamada de modelo, e sumia junto com o
 *     processo. A pessoa voltava para buscar e não havia nada.
 *
 * O que o banco NÃO faz é retomar: um trabalho interrompido no meio não volta
 * de onde parou, porque metade de um pipeline de IA não é estado, é uma pilha
 * de chamadas. Ele é marcado como interrompido no boot, e a pessoa recebe uma
 * frase que diz o que houve — em vez de um polling que nunca termina.
 */
const { log } = require('./log.js');

const TTL = 24 * 60 * 60 * 1000; // trabalho terminado fica um dia no banco
const MAX_POR_TENANT = 4;        // impede uma conta de encher a memória sozinha

const jobs = new Map(); // id -> job em memória (o que está rodando, e o recém-terminado)

/*
 * O banco entra por injeção, e não por `require`, pela mesma razão de sempre
 * neste projeto: em produção roda Postgres, no teste roda SQLite, e um teste
 * de trabalho não deveria precisar de banco nenhum.
 */
let db = null;
function usarBanco(d) { db = d; }

function rid() {
  return 'job_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

/*
 * Escrever no banco NUNCA derruba o trabalho: é o registro, não o produto.
 *
 * E as escritas de um mesmo trabalho vão EM FILA, uma de cada vez.
 *
 * Sem a fila elas eram disparadas sem esperar umas pelas outras, e no Postgres
 * — que é assíncrono de verdade, ao contrário do SQLite — o UPDATE do
 * resultado podia chegar antes do INSERT que cria a linha. O UPDATE não
 * encontrava nada, não reclamava, e o trabalho terminava com resultado na
 * memória e uma linha vazia no banco: exatamente o estrago que persistir veio
 * consertar, de volta pela porta dos fundos.
 *
 * A fila é POR TRABALHO. Uma fila global faria a escrita lenta de uma conta
 * segurar o progresso de todas as outras.
 */
function gravar(job, fn, onde) {
  if (!db) return Promise.resolve();
  job.fila = job.fila.then(fn).catch((e) => {
    log.aviso('job.gravar-falhou', { onde, motivo: e.message });
  });
  return job.fila;
}

function limparMemoria() {
  const agora = Date.now();
  for (const [id, j] of jobs) {
    // Meia hora na memória basta: depois disso a leitura vem do banco.
    if (j.terminadoEm && agora - j.terminadoEm > 30 * 60 * 1000) jobs.delete(id);
  }
}

function emAndamento(tenantId) {
  let n = 0;
  for (const j of jobs.values()) if (j.tenantId === tenantId && j.estado === 'rodando') n++;
  return n;
}

/*
 * criar — recebe uma função async e a executa em segundo plano.
 * A função ganha um `progresso(etapa, detalhe)` para contar onde está.
 *
 * `tipo` e `pedido` são gravados junto porque é o que permite a pessoa voltar
 * e entender o que estava esperando: "Compondo a peça — 'promoção de sexta'"
 * diz muito mais que um id.
 */
function criar(tenantId, tarefa, meta) {
  limparMemoria();
  if (emAndamento(tenantId) >= MAX_POR_TENANT) {
    const e = new Error('já há trabalhos demais em andamento nesta conta');
    e.status = 429;
    throw e;
  }
  const m = meta || {};
  const job = {
    id: rid(),
    tenantId,
    userId: m.userId || null,
    tipo: m.tipo || '',
    pedido: m.pedido || null,
    estado: 'rodando',
    etapa: '',
    detalhe: '',
    resultado: null,
    erro: null,
    criadoEm: Date.now(),
    terminadoEm: null,
    // A fila de escrita deste trabalho, e a promessa de que tudo já foi
    // gravado. `pronto` não é usado em produção — quem acompanha é o polling —,
    // mas é o que permite um teste afirmar "depois de persistido" sem chutar
    // um tempo de espera.
    fila: Promise.resolve(),
    pronto: null,
  };
  jobs.set(job.id, job);
  gravar(job, () => db.salvarJob(job), 'criar');

  /*
   * O progresso é gravado com FREIO.
   *
   * Um pipeline de imagens conta etapa dezenas de vezes, e cada uma seria uma
   * escrita — justamente enquanto o servidor já está ocupado chamando modelo.
   * O que a pessoa perde se a última etapa não foi gravada é ver "compondo" em
   * vez de "gerando imagem" por dois segundos; o que ela perderia com o banco
   * saturado é o trabalho inteiro.
   */
  let ultimaGravacao = 0;
  const progresso = (etapa, detalhe) => {
    if (job.estado !== 'rodando') return;
    job.etapa = String(etapa || '').slice(0, 60);
    job.detalhe = String(detalhe || '').slice(0, 120);
    const agora = Date.now();
    if (agora - ultimaGravacao < 2000) return;
    ultimaGravacao = agora;
    gravar(job, () => db.atualizarJob(job), 'progresso');
  };

  // Fire-and-forget de propósito: quem acompanha é o polling.
  job.pronto = Promise.resolve()
    .then(() => tarefa(progresso))
    .then((r) => { job.resultado = r; job.estado = 'pronto'; })
    .catch((e) => {
      job.erro = (e && e.message) || 'falhou';
      job.estado = 'erro';
      /*
       * O cliente vê a mensagem; quem opera precisa ver a PILHA.
       *
       * Geração de peça que falha é a reclamação mais cara que este sistema
       * recebe — a pessoa esperou minutos e não saiu nada. Enquanto o motivo
       * morria dentro do objeto do trabalho, o suporte só tinha a frase que a
       * própria tela já mostrava.
       */
      require('./erros.js').registrar(e, { onde: 'trabalho em segundo plano', tipo: job.tipo, tenant: job.tenantId });
    })
    .finally(() => {
      job.terminadoEm = Date.now();
      // Esta gravação é a que importa: é a que faz o resultado sobreviver.
      return gravar(job, () => db.atualizarJob(job), 'terminar');
    });

  return job;
}

/*
 * Lê um trabalho. Memória primeiro, banco depois.
 *
 * A ordem não é otimização: o que está na memória é o que está ACONTECENDO, e
 * o banco pode estar até dois segundos atrás por causa do freio do progresso.
 *
 * Só o dono lê — id adivinhado não vaza campanha de outra empresa.
 */
async function ler(id, tenantId) {
  const emMemoria = jobs.get(id);
  if (emMemoria) return emMemoria.tenantId === tenantId ? emMemoria : null;
  if (!db) return null;
  const linha = await db.lerJob(id);
  if (!linha || linha.tenant_id !== tenantId) return null;
  return daLinha(linha);
}

/* O que a conta tem em andamento ou terminou há pouco — para voltar e achar. */
async function doTenant(tenantId, limite) {
  if (!db) return [];
  const desde = Date.now() - TTL;
  const linhas = await db.listarJobs(tenantId, desde, limite || 20);
  return linhas.map(daLinha).map((j) => (jobs.get(j.id) || j));
}

function daLinha(l) {
  let resultado = null;
  let pedido = null;
  // JSON quebrado no banco não pode derrubar a leitura do trabalho inteiro:
  // sem resultado a pessoa refaz; com exceção, ela nem consegue olhar.
  try { resultado = l.resultado ? JSON.parse(l.resultado) : null; } catch (e) { resultado = null; }
  try { pedido = l.pedido ? JSON.parse(l.pedido) : null; } catch (e) { pedido = null; }
  return {
    id: l.id, tenantId: l.tenant_id, userId: l.user_id, tipo: l.tipo,
    estado: l.estado, etapa: l.etapa, detalhe: l.detalhe,
    resultado, pedido, erro: l.erro,
    criadoEm: Number(l.criado_em) || 0,
    terminadoEm: l.terminado_em ? Number(l.terminado_em) : null,
  };
}

function publico(j) {
  return {
    id: j.id,
    tipo: j.tipo || '',
    pedido: j.pedido || null,
    estado: j.estado,
    etapa: j.etapa,
    detalhe: j.detalhe,
    resultado: j.estado === 'pronto' ? j.resultado : null,
    erro: j.erro,
    criadoEm: j.criadoEm,
    segundos: Math.round(((j.terminadoEm || Date.now()) - j.criadoEm) / 1000),
  };
}

/*
 * No boot: fecha os trabalhos que o reinício deixou órfãos.
 *
 * Sem isto, um trabalho que estava `rodando` quando o processo caiu ficaria
 * `rodando` para sempre no banco — e o painel do usuário ficaria contando
 * etapa de uma geração que não existe mais, sem nunca terminar. Um erro com
 * frase clara é pior que ter dado certo e melhor que esperar para sempre.
 */
async function fecharOrfaos() {
  if (!db) return;
  // Fora da fila de um trabalho: isto é do processo inteiro, no boot, e não há
  // trabalho nenhum rodando ainda para disputar escrita.
  try {
    await db.interromperJobs('o servidor reiniciou no meio da geração — refaça o pedido');
    await db.limparJobs(Date.now() - TTL);
  } catch (e) {
    log.aviso('job.fechar-orfaos-falhou', { motivo: e.message });
  }
}

module.exports = { criar, ler, publico, usarBanco, doTenant, fecharOrfaos, MAX_POR_TENANT };
