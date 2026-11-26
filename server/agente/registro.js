/*
 * server/agente/registro.js — o que o agente fez, para o operador ver.
 *
 * Cada volta do agente (o plano, a pergunta, a recusa, a queda para o fluxo
 * de antes) e cada execução (o que foi gerado, conferido e posto no ar)
 * vira uma linha: os passos com a ferramenta de cada um, o gasto, o que a
 * conferência achou e o que foi publicado. O operador vê na Plataforma
 * (Qualidade das gerações: as contagens; Contas › a ficha: as linhas da
 * conta). A pessoa vê só o resumo curto, no chat.
 *
 * O pedido entra curto (200 letras): é o que o suporte precisa para entender
 * o caso, e não um arquivo da conversa — ela continua só na conta.
 *
 * Gravar nunca derruba o agente: é o registro, não o produto.
 */
'use strict';

const { corta } = require('./guarda');

// Sem a função no banco (teste sem banco), guarda na memória — o bastante para o teste ler.
const memoria = [];

function linha(o) {
  const x = o || {};
  return {
    tenantId: String(x.tenantId || ''), userId: String(x.userId || ''), conversaId: String(x.conversaId || ''),
    tipo: String(x.tipo || 'plano').slice(0, 20), cerebro: String(x.cerebro || '').slice(0, 10),
    pedido: corta(x.pedido, 200), resumo: corta(x.resumo, 300), motivo: corta(x.motivo, 120),
    passos: (Array.isArray(x.passos) ? x.passos : []).slice(0, 20),
    custoCentavos: Math.round((Number(x.custoCentavos) || 0) * 1000) / 1000,
    checks: x.checks || null, publicado: x.publicado || null, ms: Math.round(Number(x.ms) || 0),
    criadoEm: x.criadoEm || Date.now(),
  };
}

async function salvar(db, o) {
  const l = linha(o);
  try {
    if (db && typeof db.salvarExecucaoAgente === 'function') return await db.salvarExecucaoAgente(l);
  } catch (e) {
    try { require('../erros.js').registrar(e, { onde: 'registro do agente' }); } catch (e2) { /* sem registro de erro também */ }
  }
  memoria.unshift(Object.assign({ id: 'agx_' + Math.random().toString(36).slice(2, 10) }, l));
  memoria.length = Math.min(memoria.length, 500);
  return memoria[0];
}

async function daConta(db, tenantId, limite) {
  if (db && typeof db.listarExecucoesAgente === 'function') return db.listarExecucoesAgente({ tenantId, limite: limite || 30 });
  return memoria.filter((l) => l.tenantId === tenantId).slice(0, limite || 30);
}

async function desde(db, ms, limite) {
  if (db && typeof db.listarExecucoesAgente === 'function') return db.listarExecucoesAgente({ desde: ms, limite: limite || 2000 });
  return memoria.filter((l) => l.criadoEm >= ms).slice(0, limite || 2000);
}

/*
 * As contagens para a Qualidade das gerações: quantas voltas, quantas
 * viraram plano, pergunta, recusa (e de que tipo), quantas caíram para o
 * fluxo de antes, quantas execuções, quanto foi publicado e o gasto médio.
 * Nem conta, nem pessoa, nem texto.
 */
function resumo(linhas) {
  const l = linhas || [];
  const conta = (f) => l.filter(f).length;
  const porMotivo = {};
  for (const x of l) if (x.tipo === 'recusa' || x.tipo === 'queda') { const k = x.tipo + ':' + (x.motivo || '?').split(':')[0]; porMotivo[k] = (porMotivo[k] || 0) + 1; }
  const execucoes = l.filter((x) => x.tipo === 'execucao');
  const gasto = l.reduce((t, x) => t + (Number(x.custoCentavos) || 0), 0);
  const passos = l.filter((x) => x.passos && x.passos.length);
  return {
    voltas: l.length,
    planos: conta((x) => x.tipo === 'plano'),
    perguntas: conta((x) => x.tipo === 'pergunta'),
    respostas: conta((x) => x.tipo === 'resposta'),
    recusas: conta((x) => x.tipo === 'recusa'),
    quedas: conta((x) => x.tipo === 'queda'),
    execucoes: execucoes.length,
    publicados: execucoes.reduce((t, x) => t + ((x.publicado && x.publicado.itens) || []).filter((i) => i.estado === 'no-ar').length, 0),
    paraAprovacao: execucoes.reduce((t, x) => t + ((x.publicado && x.publicado.itens) || []).filter((i) => i.estado === 'aprovacao').length, 0),
    porMotivo: Object.entries(porMotivo).map(([chave, n]) => ({ chave, n })).sort((a, b) => b.n - a.n),
    gastoCentavos: Math.round(gasto * 100) / 100,
    gastoMedioCentavos: l.length ? Math.round((gasto / l.length) * 100) / 100 : 0,
    passosMedios: passos.length ? Math.round((passos.reduce((t, x) => t + x.passos.length, 0) / passos.length) * 10) / 10 : 0,
  };
}

module.exports = { salvar, daConta, desde, resumo, linha, _memoria: memoria };
