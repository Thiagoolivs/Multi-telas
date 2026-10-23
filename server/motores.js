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
    modelo: () => process.env.GEMINI_MODEL || 'gemini-3.8-flash',
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

/* ---------------- Erros e prazo ---------------- */

/*
 * O que deu errado, numa categoria que decide o que fazer em seguida.
 *
 * Antes era um regex só ("tenta outro modelo?") que casava 'rate' dentro de
 * "generateContent" e tratava o teto de gasto estourado como falha
 * passageira: o 429 de "exceeded its monthly spending cap" descia a cascata
 * de seis modelos (até o Pro, cobrado a preço de Flash) para voltar com uma
 * frase em inglês que nenhuma rota sabia ler. No teste de uso de 23/10 a
 * pessoa viu "Não consegui pensar nisso agora" e ninguém soube por quê.
 *
 *   cota        o provedor recusa por dinheiro (teto, saldo): não adianta insistir
 *   chave       chave inválida ou sem permissão: idem
 *   modelo      o modelo não existe mais para esta conta: tenta o próximo e lembra
 *   passageira  limite por minuto, sobrecarga, 5xx, prazo: tenta o próximo
 *   outro       pedido inválido: não insiste
 */
function tipoDoErro(msg, status) {
  const m = String(msg || '');
  if (/spending cap|billing|credit balance|insufficient.{0,20}(credit|funds|balance)|payment required/i.test(m) || status === 402) return 'cota';
  if (status === 401 || status === 403 || /api key not valid|invalid.{0,10}(api.?)?key|permission denied|unauthori[sz]ed|authentication/i.test(m)) return 'chave';
  if (status === 404 || /no longer available|not available|not found|is not supported|unsupported model|does not exist/i.test(m)) return 'modelo';
  if (status === 429 || status >= 500 || /overloaded|unavailable|\brate.?limit|resource.?exhausted|quota|timed? ?out|sem resposta|aborted|deadline|vazio|fetch failed|ECONNRESET|ENOTFOUND|EAI_AGAIN/i.test(m)) return 'passageira';
  return 'outro';
}
function erroIA(msg, status, provedor) {
  const e = new Error(String(msg || 'falha da IA'));
  e.status = status || 0;
  e.provedor = provedor || '';
  e.tipo = tipoDoErro(msg, status);
  return e;
}
// Compatível com quem já usava (server/ai.js, imagens): vale tentar outro modelo?
const geminiTentaOutro = (msg) => ['modelo', 'passageira'].includes(tipoDoErro(msg));

/*
 * O que a pessoa lê. Nunca a mensagem crua do provedor, que vem em inglês e
 * às vezes com detalhe de conta.
 */
function fraseDoErro(e) {
  const tipo = e && e.tipo ? e.tipo : tipoDoErro(e && e.message);
  if (tipo === 'cota' || tipo === 'chave') return 'A IA está fora do ar agora. O que você já fez está salvo: tente de novo daqui a pouco.';
  if (tipo === 'passageira' || tipo === 'modelo') return 'A IA demorou para responder. Tente de novo.';
  return 'A IA não conseguiu responder agora. Tente de novo.';
}
const iaIndisponivel = (e) => !!e && (e.tipo === 'cota' || e.tipo === 'chave');

/*
 * Prazo em toda chamada. Sem ele o fetch espera o padrão do Node (~5 min), e
 * uma campanha de 24 peças × candidatos × tentativas virava horas presa numa
 * vaga de trabalho. Dois minutos cabem uma peça inteira de 8 mil tokens.
 */
const PRAZO_MS = () => Number(process.env.MT_PRAZO_IA_MS) || 120000;
async function postar(provedor, url, headers, corpo) {
  let res;
  try {
    res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(corpo), signal: AbortSignal.timeout(PRAZO_MS()) });
  } catch (e) {
    const prazo = e && (e.name === 'TimeoutError' || e.name === 'AbortError');
    throw erroIA(provedor + ': ' + (prazo ? 'sem resposta em ' + Math.round(PRAZO_MS() / 1000) + ' s' : (e && e.message) || 'falha de rede'), 0, provedor);
  }
  // Página de erro em HTML (502 do proxy) não é JSON: vira erro classificado, não SyntaxError.
  const data = await res.json().catch(() => null);
  return { res, data };
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
  const { res, data } = await postar('anthropic', 'https://api.anthropic.com/v1/messages',
    { 'x-api-key': chave.anthropic(), 'anthropic-version': '2023-06-01', 'content-type': 'application/json' }, body);
  if (!res.ok || !data) throw erroIA((data && data.error && data.error.message) || ('Anthropic HTTP ' + res.status), res.status, 'anthropic');
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
/*
 * Só a família Flash, do mais novo ao mais velho. O 2.5 e o 2.0 saíram: o
 * Google os desligou para contas novas (404 "use gemini-3.8-flash"). O
 * gemini-pro-latest saiu também: custa bem mais e era cobrado no extrato a
 * preço de Flash.
 */
const GEMINI_CANDIDATOS = ['gemini-3.8-flash', 'gemini-3.6-flash', 'gemini-flash-latest', 'gemini-3.5-flash'];
// Modelo que respondeu 404 é lembrado por umas horas: cada chamada pagava o 404 de novo antes de acertar.
const geminiMortos = new Map();
const MORTO_MS = 6 * 60 * 60 * 1000;
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
    const { res, data } = await postar('gemini', url, { 'x-goog-api-key': chave.gemini(), 'content-type': 'application/json' },
      { system_instruction: { parts: [{ text: sistema }] }, contents: [{ role: 'user', parts }], generationConfig });
    if (res.ok && data) {
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
      /*
       * Resposta vazia é cobrada: o modelo gastou a saída "pensando". Antes
       * ela sumia da conta e o custo do mês saía menor que a fatura do Google.
       */
      const u = data.usageMetadata || {};
      if (u.promptTokenCount || u.candidatesTokenCount || u.thoughtsTokenCount) {
        const cache = u.cachedContentTokenCount || 0;
        const uso = { motor: 'gemini', provedor: 'gemini', modelo, entrada: Math.max(0, (u.promptTokenCount || 0) - cache),
          saida: (u.candidatesTokenCount || 0) + (u.thoughtsTokenCount || 0), cacheLida: cache, cacheEscrita: 0, ms: 0, vazia: true };
        uso.custoCentavos = custoCentavos(uso);
        anotar(uso);
      }
      continue;
    }
    const msg = (data && data.error && data.error.message) || ('Gemini HTTP ' + res.status);
    if (generationConfig.thinkingConfig && pensarRecusado(msg) && res.status === 400) continue;
    throw erroIA(msg, res.status, 'gemini');
  }
  throw erroIA('Gemini vazio (finishReason=' + motivo + ', modelo=' + modelo + ')', 0, 'gemini');
}

async function gemini(o) {
  const agora = Date.now();
  const vivo = (m) => !((geminiMortos.get(m) || 0) > agora);
  const lista = [o.modelo, ...GEMINI_CANDIDATOS].filter((m, i, a) => m && a.indexOf(m) === i && vivo(m));
  let ultimo;
  for (const modelo of lista) {
    try { return await geminiUmModelo(modelo, o); } catch (e) {
      ultimo = e;
      if (e.tipo === 'modelo') { geminiMortos.set(modelo, Date.now() + MORTO_MS); continue; }
      if (e.tipo === 'passageira') continue;
      throw e; // cota, chave, pedido inválido: outro modelo da mesma conta não muda nada
    }
  }
  const e = erroIA('Nenhum modelo Gemini retornou conteúdo. Detalhe: ' + (ultimo ? ultimo.message : 'todos indisponíveis'), ultimo && ultimo.status, 'gemini');
  e.tipo = ultimo ? ultimo.tipo : 'modelo';
  throw e;
}

// Groq — API compatível com OpenAI. Imagem vai como data URI.
async function groq(o) {
  const content = (o.imagens || []).map((im) => ({ type: 'image_url', image_url: { url: 'data:' + im.mime + ';base64,' + im.data } }));
  content.push({ type: 'text', text: o.usuario || '' });
  const { res, data } = await postar('groq', 'https://api.groq.com/openai/v1/chat/completions',
    { Authorization: 'Bearer ' + chave.groq(), 'content-type': 'application/json' }, {
      model: o.modelo, max_tokens: o.maxTokens, temperature: o.temperatura != null ? o.temperatura : 0.7,
      messages: [{ role: 'system', content: [o.fixo, o.sistema].filter(Boolean).join('\n\n') }, { role: 'user', content: o.imagens && o.imagens.length ? content : (o.usuario || '') }],
    });
  if (!res.ok || !data) throw erroIA((data && data.error && data.error.message) || ('Groq HTTP ' + res.status), res.status, 'groq');
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

/*
 * O caderno da requisição, para ser lido DEPOIS dela. A rota responde e a
 * conta da IA ainda não acabou (o trabalho em segundo plano continua
 * anotando no mesmo caderno); quem registra no fim guarda a referência e
 * consome com consumirDe (server.js, rotas de IA; server/jobs.js).
 */
function medicaoAtual() { return medidor.getStore() || null; }

// Soma o que foi medido até aqui na requisição e zera, para não contar duas vezes.
function consumirMedicao() { return consumirDe(medidor.getStore()); }
function consumirDe(s) {
  const chamadas = s && s.chamadas ? s.chamadas.splice(0) : [];
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
/*
 * Reserva: o motor da vez caiu por dinheiro, chave ou instabilidade, e há
 * chave de outro provedor? A chamada vai para ele, com o custo do motor que
 * de fato respondeu. Fica de fora quem pede um motor de propósito para
 * comparar (o experimento, §4.4): `semReserva: true`.
 */
const RESERVA = ['claude-sonnet', 'groq', 'gemini'];
async function chamar(o) {
  const motor = MOTORES[o.motor] ? o.motor : motorPadrao();
  if (motor === 'dev') throw erroIA('modo dev: nenhum provedor de IA configurado', 0, 'dev');
  try {
    return await chamarUm(motor, o);
  } catch (e) {
    if (o.semReserva || !['cota', 'chave', 'passageira', 'modelo'].includes(e.tipo)) throw e;
    for (const outro of RESERVA) {
      if (outro === motor || MOTORES[outro].provedor === MOTORES[motor].provedor || !chave[MOTORES[outro].provedor]()) continue;
      try { return await chamarUm(outro, o); } catch (e2) { /* a reserva também caiu: segue para a próxima, e o erro que vale é o primeiro */ }
    }
    throw e;
  }
}
async function chamarUm(motor, o) {
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

module.exports = { MOTORES, GEMINI_CANDIDATOS, geminiTentaOutro, tipoDoErro, erroIA, fraseDoErro, iaIndisponivel, motorPadrao, chamar, custoCentavos, precos, medir, medicaoAtual, consumirMedicao, consumirDe };
