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
- { "type": "text", "titulo": string, "corpo": string, "align": "center"|"left"|"right", "tamanho": "pequeno"|"medio"|"grande"|"gigante", "duracao": number }
- { "type": "announce", "tipo": "comunicado"|"urgente"|"evento"|"rh"|"seguranca"|"conquista"|"treinamento"|"saude", "titulo": string, "corpo": string, "duracao": number }
Prefira "poster" para as peças de destaque (capa/arte da campanha): é uma arte visual que já usa a cor da marca. Gere de 1 a 3 posters e VARIE o "variant" entre eles. Não defina "cor" (usa a marca) — só use se quiser variar o tom dentro da identidade.
Responda em português do Brasil, tom corporativo. duracao entre 8 e 15.`;

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
  const json = text.slice(text.indexOf('['), text.lastIndexOf(']') + 1);
  let arr; try { arr = JSON.parse(json); } catch (e) { throw new Error('resposta da IA não é JSON'); }
  return clampItems(arr);
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

// Gemini — Google Generative Language API. Modelo por env.
// gemini-2.5-flash: rápido/barato e ótimo para copy curta (recomendado).
// gemini-2.5-pro: máxima qualidade. responseMimeType garante JSON limpo.
async function callGemini(system, user) {
  const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
  const url = 'https://generativelanguage.googleapis.com/v1beta/models/' +
    encodeURIComponent(model) + ':generateContent';
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'x-goog-api-key': GEMINI_KEY, 'content-type': 'application/json' },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: system }] },
      contents: [{ role: 'user', parts: [{ text: user }] }],
      generationConfig: { temperature: 0.7, maxOutputTokens: 900, responseMimeType: 'application/json' },
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error((data && data.error && data.error.message) || ('Gemini HTTP ' + res.status));
  const parts = (data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts) || [];
  return parts.map((p) => p.text || '').join('').trim();
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
    const json = raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1);
    out = JSON.parse(json).text;
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
  const json = text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1);
  let obj; try { obj = JSON.parse(json); } catch (e) { throw new Error('resposta da IA não é JSON'); }
  return clampCampaign(obj, zones);
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
  const json = raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1);
  let obj; try { obj = JSON.parse(json); } catch (e) { throw new Error('resposta da IA não é JSON'); }
  return { items: daypartItems(obj) };
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

module.exports = { mode, generateContent, generateCampaign, generateDayparts, rewriteText, ITEM_SCHEMA };
