/*
 * server/motores.js — a camada de IA de texto e visão (PLANO §4.2).
 *
 * O `callLLM` antigo usava UM provedor para tudo, escolhido por variável de
 * ambiente, com saída de 700 tokens, visão só no Gemini, nenhum cache e um
 * custo fixo estimado. O motor novo precisa do contrário em cada ponto:
 *
 *   - MOTOR POR CHAMADA. O experimento (§4.4) compara Gemini, Sonnet e Opus
 *     no mesmo pedido; o briefing pode ir num modelo barato e a composição
 *     num caro. Quem chama diz qual.
 *   - SAÍDA DO TAMANHO DA PEÇA. Uma peça em HTML+CSS tem milhares de tokens.
 *   - VISÃO EM TODOS. A crítica visual olha os prints da peça.
 *   - CACHE DO QUE NÃO MUDA. A biblioteca-ouro vai em toda chamada de
 *     composição como exemplo; sem cache ela vira o maior custo da criação.
 *     O que é fixo entra em `fixo`, SEMPRE antes do resto — o cache dos
 *     três provedores é de prefixo.
 *   - TOKENS MEDIDOS. Cada chamada devolve o que gastou de verdade, e a
 *     requisição inteira é somada (medir/consumirMedicao) para o uso_ia.
 *
 * Os preços por token são CONFIGURAÇÃO, não verdade: os padrões abaixo são
 * referência e precisam ser conferidos na página de cada provedor antes do
 * experimento. MT_PRECOS_IA (JSON) e MT_COTACAO_DOLAR trocam sem deploy de
 * código. O que é medido — os tokens — não depende deles.
 */

'use strict';

const { AsyncLocalStorage } = require('node:async_hooks');

const chave = {
  anthropic: () => process.env.ANTHROPIC_API_KEY || '',
  gemini: () => process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '',
  groq: () => process.env.GROQ_API_KEY || '',
};

/*
 * Os motores. `modelo` é lido na hora da chamada (o env pode mudar entre
 * testes e entre deploys). Preço em dólar por MILHÃO de tokens.
 */
const MOTORES = {
  gemini: {
    provedor: 'gemini', rotulo: 'Gemini Flash',
    modelo: () => process.env.GEMINI_MODEL || 'gemini-3.6-flash',
    preco: { entrada: 0.3, saida: 2.5, cacheLida: 0.075, cacheEscrita: 0 },
  },
  'claude-sonnet': {
    provedor: 'anthropic', rotulo: 'Claude Sonnet',
    modelo: () => process.env.ANTHROPIC_MODEL || 'claude-sonnet-5-5',
    preco: { entrada: 3, saida: 15, cacheLida: 0.3, cacheEscrita: 3.75 },
  },
  'claude-opus': {
    provedor: 'anthropic', rotulo: 'Claude Opus',
    modelo: () => process.env.ANTHROPIC_MODEL_TETO || 'claude-opus-5-5',
    preco: { entrada: 5, saida: 25, cacheLida: 0.5, cacheEscrita: 6.25 },
  },
  groq: {
    provedor: 'groq', rotulo: 'Groq',
    modelo: () => process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
    preco: { entrada: 0.59, saida: 0.79, cacheLida: 0.59, cacheEscrita: 0 },
  },
};

/*
 * O motor de quem não diz qual quer: a mesma regra do `mode()` antigo
 * (AI_PROVIDER manda; senão, a chave presente). Assim nenhuma rota muda de
 * provedor por causa deste arquivo.
 */
function motorPadrao() {
  const p = (process.env.AI_PROVIDER || '').toLowerCase();
  if (p === 'gemini') return 'gemini';
  if (p === 'groq') return 'groq';
  if (p === 'anthropic') return 'claude-sonnet';
  if (p === 'dev') return 'dev';
  if (chave.gemini()) return 'gemini';
  if (chave.groq()) return 'groq';
  if (chave.anthropic()) return 'claude-sonnet';
  return 'dev';
}

/* ---------------- Provedores ---------------- */

/*
 * Anthropic. O fixo vai num bloco de sistema próprio, PRIMEIRO, marcado para
 * cache: a API guarda o prefixo até ele e cobra a leitura a um décimo.
 */
async function anthropic(o) {
  const system = [];
  if (o.fixo) system.push({ type: 'text', text: o.fixo, cache_control: { type: 'ephemeral' } });
  if (o.sistema) system.push({ type: 'text', text: o.sistema });
  const content = (o.imagens || []).map((im) => ({ type: 'image', source: { type: 'base64', media_type: im.mime, data: im.data } }));
  content.push({ type: 'text', text: o.usuario || '' });
  const body = { model: o.modelo, max_tokens: o.maxTokens, system, messages: [{ role: 'user', content }] };
  if (o.temperatura != null) body.temperature = o.temperatura;
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': chave.anthropic(), 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error((data && data.error && data.error.message) || ('Anthropic HTTP ' + res.status));
  const u = data.usage || {};
  return {
    texto: (data.content || []).map((b) => b.text || '').join('').trim(),
    modelo: data.model || o.modelo,
    entrada: u.input_tokens || 0,
    saida: u.output_tokens || 0,
    cacheLida: u.cache_read_input_tokens || 0,
    cacheEscrita: u.cache_creation_input_tokens || 0,
  };
}

/*
 * Gemini. Os nomes de modelo mudam de disponibilidade por conta: tenta o
 * escolhido e cai pelos candidatos quando ele não existe. O cache do Gemini
 * é implícito (prefixo igual entre chamadas) e aparece em
 * cachedContentTokenCount — por isso o fixo vai na frente do sistema.
 */
const GEMINI_CANDIDATOS = ['gemini-3.6-flash', 'gemini-flash-latest', 'gemini-3.5-flash', 'gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-pro-latest'];
const geminiTentaOutro = (msg) => /no longer available|not available|not found|is not supported|unsupported|does not exist|vazio|overloaded|unavailable|internal|quota|rate|429|500|503|404/i.test(msg || '');
const pensarRecusado = (msg) => /thinking|unknown name|invalid.*(field|argument)|not supported/i.test(msg || '');

async function geminiUmModelo(modelo, o) {
  const url = 'https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(modelo) + ':generateContent';
  const sistema = [o.fixo, o.sistema].filter(Boolean).join('\n\n');
  const parts = [{ text: o.usuario || '' }].concat((o.imagens || []).map((im) => ({ inline_data: { mime_type: im.mime, data: im.data } })));
  const base = { temperature: o.temperatura != null ? o.temperatura : 0.7, maxOutputTokens: o.maxTokens };
  if (o.json) base.responseMimeType = 'application/json';
  // Primeiro sem "pensar" (o flash gasta o orçamento pensando e volta vazio); depois sem o campo.
  const configs = [{ ...base, thinkingConfig: { thinkingBudget: 0 } }, base];
  let motivo = '';
  for (const generationConfig of configs) {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'x-goog-api-key': chave.gemini(), 'content-type': 'application/json' },
      body: JSON.stringify({ system_instruction: { parts: [{ text: sistema }] }, contents: [{ role: 'user', parts }], generationConfig }),
    });
    const data = await res.json();
    if (res.ok) {
      const cand = data.candidates && data.candidates[0];
      const texto = ((cand && cand.content && cand.content.parts) || []).map((p) => p.text || '').join('').trim();
      if (texto) {
        const u = data.usageMetadata || {};
        const cache = u.cachedContentTokenCount || 0;
        return {
          texto, modelo,
          entrada: Math.max(0, (u.promptTokenCount || 0) - cache),
          saida: (u.candidatesTokenCount || 0) + (u.thoughtsTokenCount || 0),
          cacheLida: cache, cacheEscrita: 0,
        };
      }
      motivo = (cand && cand.finishReason) || (data.promptFeedback && data.promptFeedback.blockReason) || '?';
      continue;
    }
    const msg = (data && data.error && data.error.message) || ('Gemini HTTP ' + res.status);
    if (generationConfig.thinkingConfig && pensarRecusado(msg)) continue;
    throw new Error(msg);
  }
  throw new Error('Gemini vazio (finishReason=' + motivo + ', modelo=' + modelo + ')');
}

async function gemini(o) {
  const lista = [o.modelo, ...GEMINI_CANDIDATOS].filter((m, i, a) => m && a.indexOf(m) === i);
  let ultimo;
  for (const modelo of lista) {
    try { return await geminiUmModelo(modelo, o); } catch (e) { ultimo = e; if (!geminiTentaOutro(e.message)) throw e; }
  }
  throw new Error('Nenhum modelo Gemini retornou conteúdo. Detalhe: ' + (ultimo && ultimo.message));
}

// Groq — API compatível com OpenAI. Imagem vai como data URI.
async function groq(o) {
  const content = (o.imagens || []).map((im) => ({ type: 'image_url', image_url: { url: 'data:' + im.mime + ';base64,' + im.data } }));
  content.push({ type: 'text', text: o.usuario || '' });
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + chave.groq(), 'content-type': 'application/json' },
    body: JSON.stringify({
      model: o.modelo, max_tokens: o.maxTokens, temperature: o.temperatura != null ? o.temperatura : 0.7,
      messages: [{ role: 'system', content: [o.fixo, o.sistema].filter(Boolean).join('\n\n') }, { role: 'user', content: o.imagens && o.imagens.length ? content : (o.usuario || '') }],
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error((data && data.error && data.error.message) || ('Groq HTTP ' + res.status));
  const u = data.usage || {};
  const cache = (u.prompt_tokens_details && u.prompt_tokens_details.cached_tokens) || 0;
  return {
    texto: ((data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || '').trim(),
    modelo: data.model || o.modelo,
    entrada: Math.max(0, (u.prompt_tokens || 0) - cache),
    saida: u.completion_tokens || 0,
    cacheLida: cache, cacheEscrita: 0,
  };
}

const PROVEDORES = { anthropic, gemini, groq };

/* ---------------- Custo ---------------- */

function precos() {
  try {
    const extra = JSON.parse(process.env.MT_PRECOS_IA || '{}');
    const out = {};
    for (const id of Object.keys(MOTORES)) out[id] = Object.assign({}, MOTORES[id].preco, extra[id] || {});
    return out;
  } catch (e) {
    return Object.fromEntries(Object.keys(MOTORES).map((id) => [id, MOTORES[id].preco]));
  }
}
const cotacao = () => Number(process.env.MT_COTACAO_DOLAR) || 5.5;

// Custo de uma chamada em CENTAVOS DE REAL, com fração (texto custa menos de um centavo).
function custoCentavos(uso) {
  const p = precos()[uso.motor];
  if (!p) return 0;
  const dolar = (uso.entrada * p.entrada + uso.saida * p.saida + uso.cacheLida * p.cacheLida + uso.cacheEscrita * p.cacheEscrita) / 1e6;
  return dolar * cotacao() * 100;
}

/* ---------------- Medição por requisição ---------------- */

/*
 * Cada requisição da API roda dentro de medir() (server.js). Toda chamada
 * anota o que gastou na medição corrente, e o uso-ia.cobrar() consome a
 * soma — nenhuma rota precisa carregar tokens de mão em mão, e nenhuma rota
 * nova escapa da medição.
 */
const medidor = new AsyncLocalStorage();
function medir(fn) { return medidor.run({ chamadas: [] }, fn); }
function anotar(uso) { const s = medidor.getStore(); if (s) s.chamadas.push(uso); }

// Soma o que foi medido até aqui na requisição e zera, para não contar duas vezes.
function consumirMedicao() {
  const s = medidor.getStore();
  const chamadas = s ? s.chamadas.splice(0) : [];
  const soma = { chamadas: chamadas.length, entrada: 0, saida: 0, cacheLida: 0, cacheEscrita: 0, custoCentavos: 0, modelos: '' };
  for (const c of chamadas) {
    soma.entrada += c.entrada; soma.saida += c.saida; soma.cacheLida += c.cacheLida; soma.cacheEscrita += c.cacheEscrita;
    soma.custoCentavos += c.custoCentavos;
  }
  soma.modelos = [...new Set(chamadas.map((c) => c.modelo))].join(',');
  return soma;
}

/* ---------------- A chamada ---------------- */

/*
 * chamar({ motor, sistema, fixo, usuario, imagens, maxTokens, json, temperatura })
 *   → { texto, uso }
 *
 *   motor     'gemini' | 'claude-sonnet' | 'claude-opus' | 'groq' (padrão: motorPadrao())
 *   fixo      o que se repete entre chamadas (exemplos, regras longas) — vai em cache
 *   imagens   [{ mime, data }] com data em base64
 *   maxTokens padrão 8192: cabe uma peça inteira
 */
async function chamar(o) {
  const motor = MOTORES[o.motor] ? o.motor : motorPadrao();
  if (motor === 'dev') throw new Error('modo dev: nenhum provedor de IA configurado');
  const def = MOTORES[motor];
  const t0 = Date.now();
  const r = await PROVEDORES[def.provedor](Object.assign({}, o, { modelo: def.modelo(), maxTokens: o.maxTokens || 8192 }));
  const uso = {
    motor, provedor: def.provedor, modelo: r.modelo,
    entrada: r.entrada, saida: r.saida, cacheLida: r.cacheLida, cacheEscrita: r.cacheEscrita,
    ms: Date.now() - t0,
  };
  uso.custoCentavos = custoCentavos(uso);
  anotar(uso);
  return { texto: r.texto, uso };
}

module.exports = { MOTORES, GEMINI_CANDIDATOS, geminiTentaOutro, motorPadrao, chamar, custoCentavos, precos, medir, consumirMedicao };
