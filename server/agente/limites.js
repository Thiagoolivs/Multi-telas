/*
 * server/agente/limites.js — quando o agente liga e até onde ele vai.
 *
 * O dono (decisão de 25/11): o agente vem LIGADO para toda conta, inclusive a
 * do cliente de lançamento. O freio de emergência é duplo:
 *
 *   MT_AGENTE=desligado    desliga para todas as contas, sem deploy de código;
 *   Plataforma › Contas    o operador desliga para UMA conta (server/agente/rotas.js).
 *
 * Desligado, o Criar volta inteiro ao fluxo de antes (o maestro de
 * server/assistente.js). Sem IA (servidor local, testes), o agente só liga
 * com MT_AGENTE=ligado: o maestro com regras já cobre o modo de teste, e os
 * testes do agente ligam de propósito.
 *
 * Os tetos de cada pedido também moram aqui: passos do laço, tempo, gasto de
 * texto e quantas tarefas uma fala pode virar. Todos com variável de
 * ambiente para ajustar sem deploy.
 */
'use strict';

const ai = require('../ai');
const motores = require('../motores');

const num = (v, padrao) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : padrao);

const LIMITES = {
  // O laço do plano: cada volta é uma chamada de IA (ou uma regra, sem IA).
  passos: () => num(process.env.MT_AGENTE_PASSOS, 8),
  // Quanto a fala pode esperar pelo plano antes de cair para o fluxo de antes.
  prazoMs: () => num(process.env.MT_AGENTE_PRAZO_MS, 45000),
  // O gasto de TEXTO de uma fala (planejar), em centavos de real.
  orcamentoPlanoCentavos: () => num(process.env.MT_AGENTE_ORCAMENTO_PLANO, 25),
  // O gasto de TEXTO de uma execução (escrever, desenhar, conferir), em centavos. Fotos cobram à parte, em criações.
  orcamentoExecucaoCentavos: () => num(process.env.MT_AGENTE_ORCAMENTO_EXECUCAO, 250),
  // O tempo de uma execução inteira (várias peças desenhadas).
  prazoExecucaoMs: () => num(process.env.MT_AGENTE_PRAZO_EXECUCAO_MS, 8 * 60 * 1000),
  // Uma fala vira no máximo isto de tarefas; o resto é dito e fica para a próxima.
  tarefas: 5,
  // Perguntas de uma vez, no máximo (o dono: "uma ou duas, curtas").
  perguntas: 2,
  // Quantas tarefas rodam juntas.
  emParalelo: 3,
  // A mesma fala repetida nesta janela, mais que isto, é laço: o agente para e pergunta.
  repeticoes: 3,
  janelaRepeticaoMs: 10 * 60 * 1000,
  // Falas do agente por conta e hora (o teto da rota da conversa continua valendo por cima).
  falasPorHora: () => num(process.env.MT_AGENTE_FALAS_HORA, 90),
  // Execuções (gerar e pôr no ar) por conta e hora.
  execucoesPorHora: () => num(process.env.MT_AGENTE_EXECUCOES_HORA, 12),
};

function chaveGlobal() { return String(process.env.MT_AGENTE || '').trim().toLowerCase(); }

// O freio de emergência de todas as contas.
function desligadoGlobal() { return ['desligado', 'off', '0', 'nao', 'não', 'false'].includes(chaveGlobal()); }

// Ligado sem olhar a conta: o env manda; sem env, liga quando há IA de verdade.
function ligadoGlobal() {
  if (desligadoGlobal()) return false;
  if (['ligado', 'on', '1', 'sim', 'true'].includes(chaveGlobal())) return true;
  return ai.mode() !== 'dev';
}

/*
 * Ligado para esta conta? A chave da conta (o operador desligou) é lida do
 * banco; sem a função no banco (teste sem banco), vale o global.
 */
async function ligadoPara(db, tenantId) {
  if (!ligadoGlobal()) return false;
  if (!db || typeof db.agenteDaConta !== 'function' || !tenantId) return true;
  try {
    const c = await db.agenteDaConta(tenantId);
    return !(c && c.desligado);
  } catch (e) {
    // Não deu para ler: liga (o agente cai para o fluxo de antes sozinho se algo der errado).
    return true;
  }
}

/*
 * O gasto de texto da requisição até agora, em centavos (o caderno de
 * server/motores.js, sem consumir: quem registra no uso_ia é a rota).
 */
function gastoAteAgora() {
  const s = motores.medicaoAtual();
  if (!s || !Array.isArray(s.chamadas)) return 0;
  return s.chamadas.reduce((t, c) => t + (Number(c.custoCentavos) || 0), 0);
}

/*
 * Contadores em memória por conta (como o rateLimit das rotas): falas e
 * execuções por hora. Some no deploy, de propósito — é freio, não extrato.
 */
const contadores = new Map();
function contar(chave, max, janelaMs) {
  const agora = Date.now();
  const lista = (contadores.get(chave) || []).filter((t) => agora - t < janelaMs);
  if (lista.length >= max) { contadores.set(chave, lista); return { ok: false, retryAfter: Math.ceil((janelaMs - (agora - lista[0])) / 1000) }; }
  lista.push(agora);
  contadores.set(chave, lista);
  return { ok: true };
}
function zerarContadores() { contadores.clear(); }

module.exports = { LIMITES, ligadoGlobal, desligadoGlobal, ligadoPara, gastoAteAgora, contar, zerarContadores };
