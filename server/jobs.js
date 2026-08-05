/*
 * server/jobs.js — trabalhos longos que não cabem numa requisição HTTP.
 *
 * O diretor de arte faz várias chamadas de modelo em sequência (briefing,
 * plano, imagens, uma composição por peça e a revisão do que saiu torto). Isso
 * passa fácil de um minuto, e requisição longa morre no proxy antes de o
 * servidor terminar — o usuário veria "falhou" numa campanha que ficou pronta.
 *
 * Então o POST cria um trabalho e devolve na hora; o painel acompanha por
 * polling e mostra em que etapa está. O estado vive em memória, como o resto do
 * tempo real deste servidor: um reinício perde os trabalhos em voo, e isso é
 * aceitável porque nada foi salvo ainda — o usuário só refaz.
 */
const TTL = 30 * 60 * 1000;      // trabalho pronto fica meia hora para ser lido
const MAX_POR_TENANT = 4;        // impede uma conta de encher a memória sozinha

const jobs = new Map(); // id -> { id, tenantId, estado, etapa, resultado, erro, ... }

function rid() {
  return 'job_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

function limpar() {
  const agora = Date.now();
  for (const [id, j] of jobs) {
    if (j.terminadoEm && agora - j.terminadoEm > TTL) jobs.delete(id);
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
 */
function criar(tenantId, tarefa) {
  limpar();
  if (emAndamento(tenantId) >= MAX_POR_TENANT) {
    const e = new Error('já há trabalhos demais em andamento nesta conta');
    e.status = 429;
    throw e;
  }
  const job = {
    id: rid(),
    tenantId,
    estado: 'rodando',
    etapa: 'começando',
    detalhe: '',
    resultado: null,
    erro: null,
    criadoEm: Date.now(),
    terminadoEm: null,
  };
  jobs.set(job.id, job);

  const progresso = (etapa, detalhe) => {
    if (job.estado !== 'rodando') return;
    job.etapa = String(etapa || '').slice(0, 60);
    job.detalhe = String(detalhe || '').slice(0, 120);
  };

  // Fire-and-forget de propósito: quem acompanha é o polling.
  Promise.resolve()
    .then(() => tarefa(progresso))
    .then((r) => { job.resultado = r; job.estado = 'pronto'; })
    .catch((e) => { job.erro = (e && e.message) || 'falhou'; job.estado = 'erro'; })
    .finally(() => { job.terminadoEm = Date.now(); });

  return job;
}

// Só o dono lê o trabalho — id adivinhado não vaza campanha de outra empresa.
function ler(id, tenantId) {
  const j = jobs.get(id);
  if (!j || j.tenantId !== tenantId) return null;
  return j;
}

function publico(j) {
  return {
    id: j.id,
    estado: j.estado,
    etapa: j.etapa,
    detalhe: j.detalhe,
    resultado: j.estado === 'pronto' ? j.resultado : null,
    erro: j.erro,
    segundos: Math.round(((j.terminadoEm || Date.now()) - j.criadoEm) / 1000),
  };
}

module.exports = { criar, ler, publico };
