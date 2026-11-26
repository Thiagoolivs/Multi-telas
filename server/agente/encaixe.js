/*
 * server/agente/encaixe.js — a peça cabe na TV? Quem mede é o painel.
 *
 * A conferência do servidor (server/agente/critico.js) lê o desenho, mas não
 * o MONTA: "a manchete sai da borda" só aparece com a peça desenhada no
 * tamanho da TV, e isso é o navegador que faz (web/src/lib/encaixeAuto.js:
 * conferir, UM redesenho pela IA, a peça-ouro aprovada pelo
 * POST /api/pecas/reserva). Então a execução do agente PARA antes de pôr no
 * ar, no passo "Conferindo o encaixe…":
 *
 *   1. o executor guarda as peças aqui, com um código, e o anuncia no
 *      andamento do trabalho ("e:<código>|0:fazendo|…");
 *   2. o painel aberto (PlanoDoAgente, que acompanha o trabalho) pega as
 *      peças (GET /api/agente/encaixe/<código>), roda o encaixe e devolve o
 *      que deu em cada uma (POST, a peça nova quando trocou);
 *   3. o executor publica as que cabem (a nova passa de novo pela porta e
 *      pela régua da lei antes) e marca as que não couberam ("Confira: …").
 *
 * Painel fechado: ninguém pega em `painelMs` — publica só com a conferência
 * do servidor, e o registro diz isso. Pegou e não respondeu em `maxMs`
 * (a IA demorou no redesenho): idem. Tudo em memória: o trabalho também é
 * (server/jobs.js), e um deploy no meio já o interrompe.
 */
'use strict';

const crypto = require('crypto');

const pedidos = new Map();   // código → { tenantId, pecas, pegoEm, fim, timer }
const num = (v, padrao) => (Number(v) > 0 ? Number(v) : padrao);
const TEMPOS = {
  painelMs: () => num(process.env.MT_AGENTE_ENCAIXE_PAINEL_MS, 15000),
  maxMs: () => num(process.env.MT_AGENTE_ENCAIXE_MS, 180000),
};
const MAX_PECAS = 40;

function codigo() { return crypto.randomBytes(9).toString('base64').replace(/[+/=]/g, (c) => ({ '+': 'a', '/': 'b', '=': '' }[c])); }

/*
 * Guarda as peças e espera o painel. Devolve { codigo, resposta } — a
 * resposta é uma promessa de { respondeu, motivo, resultados }:
 *   respondeu  true quando o painel devolveu (resultados: { chave: { estado, avisos, item? } })
 *   motivo     'sem-painel' (ninguém pegou) | 'demorou' (pegou e não voltou)
 */
function pedir(tenantId, pecas, tempos) {
  const t = Object.assign({ painelMs: TEMPOS.painelMs(), maxMs: TEMPOS.maxMs() }, tempos || {});
  const id = codigo();
  let fim;
  const resposta = new Promise((ok) => { fim = ok; });
  const p = { tenantId, pecas: (pecas || []).slice(0, MAX_PECAS), pegoEm: 0, fim: null, timer: null };
  const acabar = (r) => { if (!pedidos.has(id)) return; clearTimeout(p.timer); pedidos.delete(id); fim(r); };
  p.fim = acabar;
  p.timer = setTimeout(() => acabar({ respondeu: false, motivo: 'sem-painel', resultados: {} }), t.painelMs);
  p.maxMs = t.maxMs;
  pedidos.set(id, p);
  return { codigo: id, resposta };
}

// O painel pega as peças: de agora em diante, o prazo é o do redesenho (maxMs).
function pegar(id, tenantId) {
  const p = pedidos.get(String(id || ''));
  if (!p || p.tenantId !== tenantId) return null;
  if (!p.pegoEm) {
    p.pegoEm = Date.now();
    clearTimeout(p.timer);
    p.timer = setTimeout(() => p.fim({ respondeu: false, motivo: 'demorou', resultados: {} }), p.maxMs);
  }
  return p.pecas;
}

/*
 * O que o painel devolveu, conferido na FORMA (o conteúdo — a peça nova —
 * o executor confere de novo pela porta e pela lei): só as chaves pedidas,
 * os estados conhecidos, os avisos curtos.
 */
const ESTADOS = ['cabe', 'redesenhada', 'reserva', 'nao-cabe', 'sem-conferir'];
function limpar(resultados, pecas) {
  const chaves = new Set((pecas || []).map((x) => x.chave));
  const saida = {};
  if (!resultados || typeof resultados !== 'object' || Array.isArray(resultados)) return saida;
  for (const k of Object.keys(resultados)) {
    const r = resultados[k];
    if (!chaves.has(k) || !r || typeof r !== 'object' || !ESTADOS.includes(r.estado)) continue;
    const item = (r.estado === 'redesenhada' || r.estado === 'reserva') && r.item && typeof r.item === 'object' && JSON.stringify(r.item).length <= 100 * 1024 ? r.item : null;
    saida[k] = Object.assign({ estado: r.estado, avisos: (Array.isArray(r.avisos) ? r.avisos : []).map((a) => String(a).slice(0, 200)).slice(0, 6) }, item ? { item } : {});
  }
  return saida;
}
function responder(id, tenantId, resultados) {
  const p = pedidos.get(String(id || ''));
  if (!p || p.tenantId !== tenantId) return false;
  p.fim({ respondeu: true, motivo: '', resultados: limpar(resultados, p.pecas) });
  return true;
}

/*
 * O PORTÃO: os itens do plano rodam ao mesmo tempo, e cada um chega aqui
 * com as peças dele antes de publicar (ou sai sem peça: o quiz, o que foi
 * barrado). Quando todos chegaram ou saíram, UMA conferência no painel
 * para todas as peças — um pedido só, e o painel confere uma de cada vez.
 */
function portao(total, rodar) {
  let chegaram = 0;
  let sairam = 0;
  const pecas = [];
  let soltar;
  const aberto = new Promise((ok) => { soltar = ok; });
  let disparou = false;
  const talvez = () => {
    if (disparou || chegaram + sairam < total) return;
    disparou = true;
    (pecas.length ? Promise.resolve().then(() => rodar(pecas)) : Promise.resolve({ respondeu: false, motivo: 'sem-pecas', resultados: {} }))
      .then(soltar, () => soltar({ respondeu: false, motivo: 'erro', resultados: {} }));
  };
  return {
    chegar(lista) { pecas.push(...(lista || [])); chegaram++; talvez(); return aberto; },
    sair() { sairam++; talvez(); },
  };
}

module.exports = { pedir, pegar, responder, portao, limpar, TEMPOS, _pedidos: pedidos };
