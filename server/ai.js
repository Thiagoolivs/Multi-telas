/*
 * server/ai.js — geração de conteúdo por IA (trilhas prontas).
 *
 * Provider agnóstico (AI_PROVIDER ou pela chave presente):
 *   - 'gemini'    → Google Gemini via GEMINI_API_KEY (ou GOOGLE_API_KEY).
 *   - 'groq'      → API compatível com OpenAI (rápido/barato) via GROQ_API_KEY.
 *   - 'anthropic' → Claude via ANTHROPIC_API_KEY.
 *   - 'dev'       → gerador local (sem chave/rede), para testar o fluxo.
 * Imagens ficam para depois; por ora só texto.
 *
 * Saída: sempre um array de itens válidos para uma zona (ver ITEM_SCHEMA).
 * Quem grava no config é o painel/editor; aqui só geramos sugestões.
 */
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY || '';
const GROQ_KEY = process.env.GROQ_API_KEY || '';
const GEMINI_KEY = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '';

// Provider agnóstico: AI_PROVIDER manda; senão, escolhe pela chave presente.
function mode() {
  const p = (process.env.AI_PROVIDER || '').toLowerCase();
  if (p === 'gemini' || p === 'groq' || p === 'anthropic' || p === 'dev') return p;
  if (GEMINI_KEY) return 'gemini';
  if (GROQ_KEY) return 'groq';
  if (ANTHROPIC_KEY) return 'anthropic';
  return 'dev';
}

// Dispatcher: chama o provider ativo e devolve o texto (JSON) da resposta.
async function callLLM(system, user) {
  const m = mode();
  if (m === 'gemini') return callGemini(system, user);
  if (m === 'groq') return callGroq(system, user);
  return callAnthropic(system, user);
}

// Tipos/campos que a IA pode produzir (subconjunto seguro do schema do player).
const ITEM_SCHEMA = `Cada item é um objeto. Tipos permitidos:
- { "type": "poster", "variant": "bold"|"aurora"|"split"|"minimal", "kicker": string curto, "titulo": string, "corpo": string, "cta": string curto, "cor": "#hex"(opcional), "duracao": number }
  → poster SEMPRE com "titulo" forte e curto (2 a 6 palavras) e um "cta" curto. Sem título, o item é descartado.
- { "type": "text", "titulo": string, "corpo": string, "align": "center"|"left"|"right", "tamanho": "pequeno"|"medio"|"grande"|"gigante", "duracao": number }
- { "type": "announce", "tipo": "comunicado"|"urgente"|"evento"|"rh"|"seguranca"|"conquista"|"treinamento"|"saude", "titulo": string, "corpo": string, "duracao": number }
Prefira "poster" para as peças de destaque (capa/arte da campanha): é uma arte visual que já usa a cor da marca. Gere de 1 a 3 posters e VARIE o "variant" entre eles. Não defina "cor" (usa a marca) — só use se quiser variar o tom dentro da identidade.
Responda em português do Brasil, tom corporativo. duracao entre 8 e 15.`;

// Parser tolerante da resposta da IA. Com responseMimeType application/json o
// texto já vem limpo, mas alguns modelos embrulham em ```json ... ``` ou
// devolvem um objeto quando pedimos array (e vice-versa). Aqui normalizamos.
function parseAiJson(text) {
  let t = String(text || '').trim();
  t = t.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  if (!t) throw new Error('a IA retornou vazio (verifique o modelo ou o limite de tokens)');
  try { return JSON.parse(t); } catch (e) { /* tenta recortar abaixo */ }
  const starts = ['[', '{'].map((c) => t.indexOf(c)).filter((i) => i >= 0);
  const s = starts.length ? Math.min.apply(null, starts) : -1;
  const e = Math.max(t.lastIndexOf(']'), t.lastIndexOf('}'));
  if (s >= 0 && e > s) { try { return JSON.parse(t.slice(s, e + 1)); } catch (e2) { /* cai no throw */ } }
  throw new Error('resposta da IA não é JSON válido');
}
// Extrai um array de itens, aceitando array direto ou objeto { items/itens: [...] }.
function asItemArray(parsed) {
  if (Array.isArray(parsed)) return parsed;
  if (parsed && typeof parsed === 'object') return parsed.items || parsed.itens || parsed.conteudos || [];
  return [];
}

function clampItems(arr) {
  const ok = [];
  for (const it of Array.isArray(arr) ? arr : []) {
    if (!it || !['text', 'announce', 'poster'].includes(it.type)) continue;
    const item = { type: it.type, titulo: String(it.titulo || '').slice(0, 120), corpo: String(it.corpo || '').slice(0, 400), duracao: Math.min(15, Math.max(8, Number(it.duracao) || 12)) };
    if (it.type === 'text') { item.align = ['center', 'left', 'right'].includes(it.align) ? it.align : 'center'; item.tamanho = ['pequeno', 'medio', 'grande', 'gigante'].includes(it.tamanho) ? it.tamanho : 'grande'; }
    else if (it.type === 'poster') {
      item.variant = ['bold', 'aurora', 'split', 'minimal'].includes(it.variant) ? it.variant : 'bold';
      if (it.kicker) item.kicker = String(it.kicker).slice(0, 40);
      if (it.cta) item.cta = String(it.cta).slice(0, 40);
      if (isHex(it.cor)) item.cor = it.cor.startsWith('#') ? it.cor : '#' + it.cor;
    }
    else { item.tipo = it.tipo || 'comunicado'; }
    if (['destaque', 'urgente'].includes(it.prioridade)) item.prioridade = it.prioridade;
    if (item.titulo) ok.push(item);
    if (ok.length >= 6) break;
  }
  return ok;
}

// brief: texto livre do usuário. ctx: { empresa, tema } para dar contexto.
async function generateContent(brief, ctx) {
  brief = String(brief || '').slice(0, 600);
  ctx = ctx || {};
  const m = mode();
  if (m === 'dev') return devGenerate(brief, ctx);

  const system = 'Você cria conteúdo para telas corporativas (digital signage). ' +
    'Gere de 2 a 4 itens curtos, impactantes e legíveis à distância. ' +
    'Responda APENAS com um array JSON, sem texto fora dele. ' + ITEM_SCHEMA;
  const user = `Empresa: ${ctx.empresa || 'A empresa'}. Tema visual: ${ctx.tema || 'padrão'}.\nBriefing: ${brief}`;
  const text = await callLLM(system, user);
  return clampItems(asItemArray(parseAiJson(text)));
}

// Groq — API compatível com OpenAI (rápido/barato). Modelo por env.
async function callGroq(system, user) {
  const model = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + GROQ_KEY, 'content-type': 'application/json' },
    body: JSON.stringify({ model, max_tokens: 700, temperature: 0.7, messages: [{ role: 'system', content: system }, { role: 'user', content: user }] }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error((data && data.error && data.error.message) || ('Groq HTTP ' + res.status));
  return ((data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || '').trim();
}

// Gemini — Google Generative Language API. Modelo por env (GEMINI_MODEL).
// Os nomes fixos (gemini-2.5-flash, 2.0-flash) mudam de disponibilidade por
// conta e passam a dar "no longer available". Por isso usamos o alias
// "gemini-flash-latest" (aponta pro flash atual) e caímos por uma lista de
// candidatos quando o modelo escolhido não existe/está indisponível.
// responseMimeType garante JSON limpo.
// Ordem de preferência (2026): 3.6-flash é o GA atual; -latest é o alias seguro.
const GEMINI_CANDIDATES = ['gemini-3.6-flash', 'gemini-flash-latest', 'gemini-3.5-flash', 'gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-pro-latest'];

// Erro em que vale tentar OUTRO modelo (indisponível/transitório/vazio).
function geminiRetryable(msg) {
  return /no longer available|not available|not found|is not supported|unsupported|does not exist|vazio|overloaded|unavailable|internal|quota|rate|429|500|503|404/i.test(msg || '');
}
// Erro do campo thinkingConfig (modelo não-thinking): refaz sem ele.
function thinkingRejected(msg) { return /thinking|unknown name|invalid.*(field|argument)|not supported/i.test(msg || ''); }

async function geminiOnce(model, system, user) {
  const url = 'https://generativelanguage.googleapis.com/v1beta/models/' +
    encodeURIComponent(model) + ':generateContent';
  const base = { temperature: 0.7, maxOutputTokens: 8192, responseMimeType: 'application/json' };
  // 1ª config: desativa "thinking" (flash 2.5/3.x gastam o orçamento pensando e
  // podem devolver vazio) → saída direta. 2ª config: sem o campo, p/ modelos que não o aceitam.
  const configs = [{ ...base, thinkingConfig: { thinkingBudget: 0 } }, base];
  let emptypReason = '';
  for (let i = 0; i < configs.length; i++) {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'x-goog-api-key': GEMINI_KEY, 'content-type': 'application/json' },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: system }] },
        contents: [{ role: 'user', parts: [{ text: user }] }],
        generationConfig: configs[i],
      }),
    });
    const data = await res.json();
    if (res.ok) {
      const cand = data.candidates && data.candidates[0];
      const text = ((cand && cand.content && cand.content.parts) || []).map((p) => p.text || '').join('').trim();
      if (text) return text;
      emptypReason = (cand && cand.finishReason) || (data.promptFeedback && data.promptFeedback.blockReason) || '?';
      continue; // vazio: tenta a próxima config
    }
    const msg = (data && data.error && data.error.message) || ('Gemini HTTP ' + res.status);
    if (configs[i].thinkingConfig && thinkingRejected(msg)) continue; // refaz sem thinkingConfig
    throw new Error(msg);
  }
  throw new Error('Gemini vazio (finishReason=' + emptypReason + ', modelo=' + model + ')');
}

async function callGemini(system, user) {
  // Tenta o modelo do env (se houver) primeiro; depois os candidatos, sem repetir.
  const list = [process.env.GEMINI_MODEL, ...GEMINI_CANDIDATES].filter((m, i, a) => m && a.indexOf(m) === i);
  let lastErr;
  for (const model of list) {
    try { return await geminiOnce(model, system, user); }
    catch (e) { lastErr = e; if (!geminiRetryable(e.message)) throw e; } // erro real (chave/rede): não insiste
  }
  throw new Error('Nenhum modelo Gemini retornou conteúdo. Verifique GEMINI_API_KEY / GEMINI_MODEL. Detalhe: ' + (lastErr && lastErr.message));
}

// Anthropic — Claude via API de mensagens. Modelo por env.
async function callAnthropic(system, user) {
  const model = process.env.ANTHROPIC_MODEL || 'claude-3-5-sonnet-latest';
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model, max_tokens: 700, system, messages: [{ role: 'user', content: user }] }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error((data && data.error && data.error.message) || ('Anthropic HTTP ' + res.status));
  return (data.content || []).map((b) => b.text || '').join('').trim();
}

/* ---------------- Reescrever para caber + legível à distância ----------------
 * Encurta/reescreve um texto para caber no espaço e ser lido de longe, sem
 * perder o sentido. Limites por campo (título curto, corpo um pouco maior). */
const FIT_MAX = { titulo: 42, frase: 90, corpo: 130 };

async function rewriteText(text, opts) {
  text = String(text || '').trim();
  opts = opts || {};
  const campo = FIT_MAX[opts.campo] ? opts.campo : 'corpo';
  const max = Math.min(220, Math.max(16, Number(opts.max) || FIT_MAX[campo]));
  if (!text) return '';
  if (mode() === 'dev') return devShorten(text, max);

  const system =
    'Você reescreve textos para telas corporativas (digital signage) lidas À DISTÂNCIA. ' +
    'Deixe mais curto, direto e fácil de ler de longe, mantendo o sentido e o tom. ' +
    'Sem emojis, sem aspas, sem reticências. Português do Brasil. ' +
    `No máximo ${max} caracteres. Responda APENAS com JSON: {"text": "..."}.`;
  const user = `Tom: ${opts.tom || 'corporativo'}. Campo: ${campo}.\nTexto: ${text}`;
  let out;
  try {
    const raw = await callLLM(system, user);
    const parsed = parseAiJson(raw);
    out = typeof parsed === 'string' ? parsed : parsed.text;
  } catch (e) { out = ''; }
  out = String(out || '').replace(/["“”]/g, '').trim();
  if (!out) out = devShorten(text, max);
  return devShorten(out, max); // garante o teto mesmo se a IA passar do limite
}

// Encurtador local: corta no limite sem quebrar palavra (fallback/garantia).
function devShorten(text, max) {
  text = String(text || '').replace(/\s+/g, ' ').trim();
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const sp = cut.lastIndexOf(' ');
  return (sp > max * 0.6 ? cut.slice(0, sp) : cut).trim();
}

/* ---------------- Campanha da TELA INTEIRA ---------------- */
// Gera conteúdo para TODAS as zonas do layout + ajustes (prioridade, tom da
// marca). zones: [{ id, type }] (type: playlist|ticker|header). answers: form.
function isHex(s) { return /^#?[0-9a-f]{6}$/i.test(s || ''); }

function clampCampaign(obj, zones) {
  obj = obj || {};
  const out = { followupQuestion: null, settings: {}, zonas: {} };
  if (typeof obj.followupQuestion === 'string' && obj.followupQuestion.trim()) out.followupQuestion = obj.followupQuestion.trim().slice(0, 200);
  const st = obj.settings || {};
  if (isHex(st.brand)) out.settings.brand = st.brand.startsWith('#') ? st.brand : '#' + st.brand;
  if (['destaque', 'urgente'].includes(st.prioridade)) out.settings.prioridade = st.prioridade;
  const zin = obj.zonas || {};
  for (const z of zones || []) {
    if (z.type === 'header') continue;
    const src = zin[z.id] || {};
    if (z.type === 'ticker') {
      const msgs = (Array.isArray(src.messages) ? src.messages : []).map((m) => String(m).slice(0, 160)).filter(Boolean).slice(0, 6);
      if (msgs.length) out.zonas[z.id] = { messages: msgs };
    } else {
      const items = clampItems(src.items);
      if (items.length) out.zonas[z.id] = { items };
    }
  }
  return out;
}

async function generateCampaign(answers, ctx) {
  answers = answers || {}; ctx = ctx || {};
  const zones = Array.isArray(ctx.zones) ? ctx.zones : [];
  if (mode() === 'dev') return devCampaign(answers, ctx, zones);

  const zoneDesc = zones.filter((z) => z.type !== 'header')
    .map((z) => `- zona "${z.id}" (${z.type === 'ticker' ? 'rodapé de mensagens' : 'destaque/playlist'})`).join('\n');
  const system =
    'Você é diretor de arte de digital signage. Crie uma CAMPANHA para uma TELA INTEIRA, ' +
    'coerente entre as zonas, curta e legível à distância. ' +
    'Responda APENAS com um objeto JSON:\n' +
    '{ "followupQuestion": string|null, "settings": { "brand": "#hex"|null, "prioridade": "destaque"|"urgente"|null }, "zonas": { "<id>": { "items": [ITEM...] } | { "messages": [string...] } } }\n' +
    'Preencha as zonas abaixo. Zona playlist usa "items"; zona rodapé usa "messages" (frases curtas). ' +
    'Só peça followupQuestion se faltar algo crítico. ' + ITEM_SCHEMA + '\nprioridade "urgente"/"destaque" só se o objetivo pedir.';
  const user =
    `Empresa: ${ctx.empresa || 'A empresa'}. Tema: ${ctx.tema || 'padrão'}.\nZonas:\n${zoneDesc}\n\n` +
    `Objetivo: ${answers.objetivo || ''}\nPúblico: ${answers.publico || ''}\nTom: ${answers.tom || ''}\n` +
    `Oferta/CTA: ${answers.oferta || ''}\nPrazo: ${answers.prazo || ''}\nExtra: ${answers.extra || ''}`;
  const text = await callLLM(system, user);
  return clampCampaign(parseAiJson(text), zones);
}

// Campanha dev (sem chave): distribui conteúdo plausível pelas zonas.
function devCampaign(answers, ctx, zones) {
  const obj = (answers.objetivo || 'Campanha').trim();
  const oferta = (answers.oferta || '').trim();
  const zonas = {};
  for (const z of zones) {
    if (z.type === 'header') continue;
    if (z.type === 'ticker') zonas[z.id] = { messages: [`${obj} :: ${ctx.empresa || ''}`.trim(), oferta || 'Saiba mais no balcão.'] };
    else if (Object.keys(zonas).length === 0) zonas[z.id] = { items: [{ type: 'text', titulo: obj, corpo: oferta || 'Aproveite.', align: 'center', tamanho: 'gigante', duracao: 12, prioridade: 'destaque' }] };
    else zonas[z.id] = { items: [{ type: 'announce', tipo: 'evento', titulo: obj, corpo: oferta || answers.publico || 'Confira.', duracao: 12 }] };
  }
  return clampCampaign({ followupQuestion: null, settings: {}, zonas }, zones);
}

/* ---------------- Arte do dia comemorativo ----------------
 * Recebe a data de hoje (o cliente descobre pelo seasons.js) e gera 1-2 peças
 * temáticas na cor da marca. Reaproveita o tipo "poster" (custo zero no player). */
async function generateSeasonal(season, ctx) {
  ctx = ctx || {};
  const label = String((season && season.label) || season || '').slice(0, 60).trim();
  const emoji = String((season && season.emoji) || '').slice(0, 4);
  if (!label) throw new Error('informe a data comemorativa');
  if (mode() === 'dev') return { items: devSeasonal(label) };

  const system =
    'Você cria peças para telas corporativas celebrando uma DATA comemorativa. ' +
    'Gere de 1 a 2 posters curtos, com saudação calorosa e adequada à empresa (sem clichê exagerado). ' +
    'Use a cor da marca (não defina "cor"). Responda APENAS com um array JSON. ' + ITEM_SCHEMA;
  const user = `Empresa: ${ctx.empresa || 'A empresa'}. Tema: ${ctx.tema || 'padrão'}.\n` +
    `Data comemorativa: ${label} ${emoji}`.trim();
  const text = await callLLM(system, user);
  return { items: clampItems(asItemArray(parseAiJson(text))) };
}

function devSeasonal(label) {
  return clampItems([
    { type: 'poster', variant: 'bold', kicker: 'Hoje', titulo: label, corpo: 'Um dia especial para celebrar com você.', cta: 'Feliz data!', duracao: 12 },
  ]);
}

/* ---------------- Variações por horário (dayparts) ----------------
 * Uma campanha vira 3 versões (manhã / tarde / fim de expediente) com saudação
 * e tom adaptados. Cada item sai com agendamento de hora — o player já mostra
 * só o da janela atual (agendadoAgora). Custo zero no player. */
const DAYPARTS = [
  { key: 'manha', rotulo: 'manhã', ini: '05:00', fim: '11:59' },
  { key: 'tarde', rotulo: 'tarde', ini: '12:00', fim: '17:59' },
  { key: 'noite', rotulo: 'fim de expediente', ini: '18:00', fim: '23:59' },
];

// Anexa a janela de hora de cada período aos itens já validados.
function daypartItems(obj) {
  const out = [];
  for (const d of DAYPARTS) {
    for (const it of clampItems((obj && obj[d.key]) || [])) {
      it.agendamento = { ativo: true, horaInicio: d.ini, horaFim: d.fim };
      out.push(it);
    }
  }
  return out;
}

async function generateDayparts(answers, ctx) {
  answers = answers || {}; ctx = ctx || {};
  const objetivo = String(answers.objetivo || answers.brief || '').slice(0, 400);
  if (mode() === 'dev') return { items: devDayparts(objetivo) };

  const system =
    'Você cria conteúdo para telas corporativas que muda conforme a HORA do dia. ' +
    'Gere o MESMO tema em 3 períodos, adaptando saudação e tom: manhã (energia, "bom dia"), ' +
    'tarde (foco), fim de expediente (encerramento/agradecimento, "boa noite"). ' +
    'De 1 a 2 itens por período. Responda APENAS com JSON: ' +
    '{ "manha": [ITEM...], "tarde": [ITEM...], "noite": [ITEM...] }. ' + ITEM_SCHEMA;
  const user = `Empresa: ${ctx.empresa || 'A empresa'}. Tema: ${ctx.tema || 'padrão'}.\n` +
    `Objetivo: ${objetivo}\nPúblico: ${answers.publico || ''}\nTom base: ${answers.tom || ''}`;
  const raw = await callLLM(system, user);
  return { items: daypartItems(parseAiJson(raw)) };
}

function devDayparts(objetivo) {
  const base = objetivo || 'Comunicação interna';
  return daypartItems({
    manha: [{ type: 'poster', variant: 'bold', kicker: 'Bom dia', titulo: base, corpo: 'Comece o dia com tudo.', cta: 'Vamos juntos', duracao: 12 }],
    tarde: [{ type: 'poster', variant: 'aurora', kicker: 'Boa tarde', titulo: base, corpo: 'Foco no que importa.', duracao: 12 }],
    noite: [{ type: 'poster', variant: 'minimal', kicker: 'Fim de expediente', titulo: base, corpo: 'Obrigado pelo empenho de hoje.', duracao: 12 }],
  });
}

// Gerador local (dev): monta itens plausíveis a partir do briefing.
function devGenerate(brief, ctx) {
  const empresa = ctx.empresa || 'nossa empresa';
  const tema = (brief.split(/[.\n]/)[0] || 'Comunicação interna').trim();
  return clampItems([
    { type: 'text', titulo: tema.charAt(0).toUpperCase() + tema.slice(1), corpo: `Novidades de ${empresa}, em tempo real.`, align: 'center', tamanho: 'gigante', duracao: 12 },
    { type: 'announce', tipo: 'comunicado', titulo: tema, corpo: brief || 'Fique por dentro dos comunicados internos.', duracao: 12 },
  ]);
}

// Diagnóstico: roda uma geração trivial e devolve o que a IA respondeu (ou o
// erro). Serve para depurar a integração sem expor a chave.
async function diagnose() {
  const provider = mode();
  if (provider === 'dev') return { provider, ok: true, sample: '(modo dev — sem IA real; defina GEMINI_API_KEY)' };
  try {
    const raw = await callLLM('Você responde apenas com JSON.', 'Responda com {"ok": true, "msg": "funcionando"}.');
    return { provider, ok: true, sample: String(raw).slice(0, 300) };
  } catch (e) {
    return { provider, ok: false, error: e.message };
  }
}

module.exports = { mode, generateContent, generateCampaign, generateDayparts, generateSeasonal, rewriteText, diagnose, ITEM_SCHEMA };
