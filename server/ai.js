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

/* ---------------- Composição (layout do editor tipo Canva) ----------------
 * A IA monta o LAYOUT: cor de fundo + blocos de TEXTO posicionados (título,
 * subtítulo, CTA), deixando espaço para a imagem que o usuário insere por cima.
 * Coordenadas x/y/w/h em % da zona. Não gera imagem. */
/*
 * Os tipos que o editor sabe desenhar, e os valores que ele aceita.
 *
 * Ficam aqui porque `clampComposition` é a ÚNICA porta por onde a resposta da
 * IA entra: um nome de ícone inventado vira um SVG vazio na parede, e uma
 * forma desconhecida vira um retângulo sem aviso.
 */
const ICONES_DA_IA = ['star', 'heart', 'bell', 'gift', 'clock', 'pin', 'tag', 'cart', 'leaf',
  'shield', 'like', 'calendar', 'coffee', 'bolt', 'megaphone', 'wifi', 'check', 'sparkle'];
const FORMAS_DA_IA = ['rect', 'ellipse', 'triangle', 'diamond', 'diag'];
const TIPOS_DA_IA = ['texto', 'forma', 'icone'];

/*
 * Onde a peça pediu que o elemento ficasse, como ÂNCORA — não como caixa.
 *
 * A IA erra posição com frequência: "no canto de baixo à direita" virava um
 * texto no meio da tela. Quando a pessoa DIZ onde quer, o pedido vale mais que
 * o palpite dela, e a posição é imposta depois, sobre o que voltou.
 *
 * Âncora e não caixa porque impor largura e altura junto deformaria o
 * elemento: um ícone forçado a 40% de largura por 20% de altura deixa de ser
 * um ícone e vira um borrão esticado. O tamanho continua sendo decisão da IA;
 * só o CANTO é do usuário.
 */
const LUGARES = {
  'topo-esq': { h: 'esq', v: 'topo' },
  topo: { h: 'centro', v: 'topo' },
  'topo-dir': { h: 'dir', v: 'topo' },
  esq: { h: 'esq', v: 'meio' },
  centro: { h: 'centro', v: 'meio' },
  dir: { h: 'dir', v: 'meio' },
  'base-esq': { h: 'esq', v: 'base' },
  base: { h: 'centro', v: 'base' },
  'base-dir': { h: 'dir', v: 'base' },
};
const MARGEM = 6;   // respiro da borda, em % — casa com a margem de segurança do editor

function ancorar(el, lugar) {
  const w = Number(el.w) || 0;
  const h = Number(el.h) || 0;
  const eixo = (onde, tam) => {
    if (onde === 'esq' || onde === 'topo') return MARGEM;
    if (onde === 'dir' || onde === 'base') return Math.max(MARGEM, 100 - MARGEM - tam);
    return Math.max(0, (100 - tam) / 2);
  };
  el.x = Math.round(eixo(lugar.h, w) * 10) / 10;
  el.y = Math.round(eixo(lugar.v, h) * 10) / 10;
}

/*
 * O corpo do texto, ajustado ao bloco que a IA mesma pediu.
 *
 * A IA devolve `tamanho` e a caixa `w`/`h` sem conferir se um cabe no outro —
 * e não cabe com frequência. "30% OFF EM TUDO" a tamanho 9 num bloco de 70 x
 * 20 quebra em duas linhas e a segunda sai cortada pela borda do bloco. Na
 * tela do editor dá para arrastar; na parede, não: a peça já foi publicada.
 *
 * A conta é grosseira de propósito — não temos a métrica da fonte aqui — mas
 * erra para o lado seguro: só DIMINUI, nunca aumenta. Um título um ponto menor
 * do que poderia é invisível; um título cortado é a peça inteira perdida.
 */
function corpoQueCabe(el, formato) {
  const texto = String(el.text || '');
  if (!texto) return el.tamanho;

  // `y`/`h` são % da ALTURA; `tamanho` e `w` são % da LARGURA (cqw). Para
  // comparar altura com corpo, a altura do bloco precisa virar cqw.
  const [aw, ah] = String(formato || '16/9').split('/').map(Number);
  const alturaEmCqw = (aw && ah) ? (100 * ah) / aw : 56.25;
  const disponivel = (Number(el.h) || 0) / 100 * alturaEmCqw;
  const largura = Number(el.w) || 0;
  if (disponivel <= 0 || largura <= 0) return el.tamanho;

  /*
   * 0.52 é a largura média de caractere da Inter (js/fontes.js), que é a fonte
   * padrão do editor. FOLGA existe porque isto é uma ESTIMATIVA: sem ela, um
   * texto que dá exatamente na conta quebra na tela de verdade — foi o que
   * aconteceu com "30% OFF em tudo" num bloco de 70, que caía a um pixel de
   * caber e ia para a segunda linha, cortada.
   */
  const LARGURA_MEDIA = 0.52;
  const ENTRELINHA = 1.15;
  const FOLGA = 0.9;
  // 0.52 é a média da fonte em peso NORMAL. Título de peça vem quase sempre em
  // 800/900, e letra pesada é mais larga — ignorar isso é justamente o erro que
  // deixava o título encostar na borda e quebrar.
  const peso = Number(el.peso) || 400;
  const largo = LARGURA_MEDIA * (peso >= 700 ? 1.08 : 1);
  let corpo = Number(el.tamanho) || 6;

  // Duas passadas convergem: diminuir o corpo diminui as linhas também.
  for (let i = 0; i < 2; i++) {
    const porLinha = Math.max(1, (largura * FOLGA) / (largo * corpo));
    const linhas = Math.max(1, Math.ceil(texto.length / porLinha));
    const preciso = linhas * corpo * ENTRELINHA;
    // A FOLGA vale só na LARGURA, onde a conta é estimativa (não temos a
    // métrica da fonte). Na altura, entrelinha vezes número de linhas é
    // exato — apertar aqui encolheria texto que cabe folgado.
    if (preciso <= disponivel) break;
    corpo = corpo * Math.sqrt(disponivel / preciso);
  }
  return Math.max(2, Math.round(corpo * 10) / 10);
}

function clampComposition(obj, brand, pedido, formato) {
  obj = obj || {};
  pedido = pedido || {};
  const out = { bg: { kind: 'cor', cor: '#0a1020' }, elementos: [] };
  const bgc = (obj.bg && obj.bg.cor) || obj.cor;
  if (isHex(bgc)) out.bg.cor = bgc.startsWith('#') ? bgc : '#' + bgc;
  else if (isHex(brand)) out.bg.cor = brand.startsWith('#') ? brand : '#' + brand;
  const num = (v, lo, hi, d) => { const n = Number(v); return isFinite(n) ? Math.max(lo, Math.min(hi, n)) : d; };
  const hex = (v, d) => (isHex(v) ? (String(v).startsWith('#') ? v : '#' + v) : d);

  // Um tipo pedido é um tipo EXIGIDO: quem clicou em "ícone" não quer um
  // parágrafo de volta. Sem isto, "peça um SVG" continua não funcionando.
  const exigido = TIPOS_DA_IA.includes(pedido.tipo) ? pedido.tipo : null;
  const lugar = LUGARES[pedido.onde] || null;
  const corPedida = hex(pedido.cor, null);

  for (const e of Array.isArray(obj.elementos) ? obj.elementos : []) {
    if (!e || e.tipo === 'imagem') continue; // imagem quem põe é o usuário
    const tipo = TIPOS_DA_IA.includes(e.tipo) ? e.tipo : 'texto';
    if (exigido && tipo !== exigido) continue;

    const base = {
      tipo,
      x: num(e.x, -10, 100, 8), y: num(e.y, -10, 100, 10),
      w: num(e.w, 4, 110, 60), h: num(e.h, 3, 110, 18),
      rot: num(e.rot, -180, 180, 0),
      z: num(e.z, 0, 99, 2),
    };

    let el;
    if (tipo === 'forma') {
      el = Object.assign(base, {
        shape: FORMAS_DA_IA.includes(e.shape) ? e.shape : 'rect',
        fill: hex(e.fill, corPedida || '#3b82f6'),
        opacidade: num(e.opacidade, 0.05, 1, 1),
        radius: num(e.radius, 0, 50, 0),
      });
    } else if (tipo === 'icone') {
      // `peso` no ícone é a espessura do TRAÇO (1 a 3), não o peso da fonte.
      // Um 800 vindo por engano transformaria o SVG numa mancha sólida.
      el = Object.assign(base, {
        name: ICONES_DA_IA.includes(e.name) ? e.name : 'star',
        cor: hex(e.cor, corPedida || '#ffffff'),
        peso: num(e.peso, 1, 3, 1.6),
        opacidade: num(e.opacidade, 0.05, 1, 1),
      });
    } else {
      el = Object.assign(base, {
        text: String(e.text || '').slice(0, 160),
        cor: hex(e.cor, corPedida || '#ffffff'),
        peso: num(e.peso, 300, 900, 800),
        tamanho: num(e.tamanho, 2, 16, 6),
        align: ['left', 'center', 'right'].includes(e.align) ? e.align : 'left',
      });
      // `.trim()`: só espaço em branco é texto vazio disfarçado, e vira uma
      // camada invisível que ninguém consegue achar no palco.
      el.text = el.text.trim();
      if (!el.text) continue;
      el.tamanho = corpoQueCabe(el, formato);
    }

    out.elementos.push(el);
    if (out.elementos.length >= 5) break;
  }

  /*
   * O lugar pedido é aplicado DEPOIS, e só ao primeiro elemento.
   *
   * Só ao primeiro porque empilhar três elementos na mesma caixa esconde dois
   * deles; e depois porque a IA erra posição com frequência — quando alguém
   * apontou onde quer, esse pedido ganha do palpite dela.
   */
  if (lugar && out.elementos.length) ancorar(out.elementos[0], lugar);
  return out;
}

/*
 * O que a pessoa pediu, em palavras que entram no prompt.
 *
 * Antes o único canal era uma frase livre, e o resultado era sempre a mesma
 * coisa: dois blocos de texto. Não havia como pedir uma forma, um ícone, uma
 * cor específica ou um canto da tela — e "peça uma imagem ou um SVG" nunca
 * funcionou porque o servidor só sabia produzir texto (ver clampComposition).
 */
const NOME_DO_TIPO = {
  texto: 'UM ÚNICO bloco de TEXTO',
  forma: 'UMA ÚNICA FORMA geométrica (sem texto)',
  icone: 'UM ÚNICO ÍCONE de linha (sem texto)',
};
const NOME_DO_LUGAR = {
  'topo-esq': 'no canto superior esquerdo', 'topo': 'no topo, centralizado', 'topo-dir': 'no canto superior direito',
  esq: 'à esquerda, na altura do meio', centro: 'bem no centro', dir: 'à direita, na altura do meio',
  'base-esq': 'no canto inferior esquerdo', base: 'na base, centralizado', 'base-dir': 'no canto inferior direito',
};

function pecaDeExemplo(brief, brand, pedido) {
  const titulo = (String(brief).split(/[.\n]/)[0] || 'Título').slice(0, 40);
  if (pedido.tipo === 'forma') {
    return { bg: { cor: brand || '#12203f' }, elementos: [
      { tipo: 'forma', shape: 'ellipse', x: 20, y: 20, w: 40, h: 40, fill: pedido.cor || '#3b82f6', opacidade: 0.9, z: 1 },
    ] };
  }
  if (pedido.tipo === 'icone') {
    return { bg: { cor: brand || '#12203f' }, elementos: [
      { tipo: 'icone', name: 'star', x: 42, y: 34, w: 16, h: 16, cor: pedido.cor || '#ffffff', peso: 1.6, z: 2 },
    ] };
  }
  if (pedido.tipo === 'texto') {
    return { bg: { cor: brand || '#12203f' }, elementos: [
      { tipo: 'texto', text: titulo, x: 8, y: 40, w: 70, h: 20, cor: pedido.cor || '#ffffff', peso: 900, tamanho: 8, align: 'left', z: 2 },
    ] };
  }
  return { bg: { cor: brand || '#12203f' }, elementos: [
    { tipo: 'forma', shape: 'ellipse', x: 58, y: -18, w: 64, h: 60, fill: pedido.cor || '#3b82f6', opacidade: 0.45, z: 0 },
    { tipo: 'texto', text: titulo, x: 6, y: 14, w: 60, h: 22, cor: '#ffffff', peso: 900, tamanho: 9, align: 'left', z: 2 },
    { tipo: 'texto', text: 'Chamada de apoio aqui.', x: 6, y: 40, w: 50, h: 14, cor: '#ffffff', peso: 400, tamanho: 4, align: 'left', z: 2 },
  ] };
}

async function generateComposition(brief, ctx) {
  brief = String(brief || '').slice(0, 500);
  ctx = ctx || {};
  const brand = ctx.brand || '';
  const pedido = ctx.pedido || {};

  if (mode() === 'dev') return clampComposition(pecaDeExemplo(brief, brand, pedido), brand, pedido, ctx.formato);

  /*
   * O FORMATO entra no pedido.
   *
   * Sem ele a IA compunha sempre para tela deitada — e numa peça 9/16 o
   * resultado voltava com o título ocupando a largura toda e o resto
   * espremido, porque `x`/`w` são % da largura e `y`/`h` são % da altura.
   * Dizer a proporção é o mínimo para o layout fazer sentido.
   */
  const formato = String(ctx.formato || '16/9');
  const orientacao = formato === '9/16' ? 'EM PÉ (mais alta que larga)'
    : formato === '1/1' ? 'QUADRADA'
      : formato === '21/9' ? 'MUITO LARGA E BAIXA'
        : 'DEITADA (mais larga que alta)';

  const oQue = NOME_DO_TIPO[pedido.tipo]
    || 'a peça inteira: uma cor de fundo forte e de 1 a 4 elementos (texto, formas e ícones)';

  const system =
    'Você é diretor de arte de digital signage. Monte o LAYOUT pedido. ' +
    'Coordenadas x/y/w/h em PORCENTAGEM da tela (0 a 100): x e w são % da LARGURA, y e h são % da ALTURA. ' +
    'Texto legível à distância, português do Brasil. NÃO gere imagens (foto quem põe é o usuário). ' +
    'Responda APENAS com JSON: { "bg": { "cor": "#hex" }, "elementos": [ ... ] }, onde cada elemento é um destes:\n' +
    '{ "tipo": "texto", "text": string, "x","y","w","h","rot": num, "cor": "#hex", "peso": 300-900, "tamanho": 2-16, "align": "left"|"center"|"right", "z": num }\n' +
    '{ "tipo": "forma", "shape": "' + FORMAS_DA_IA.join('"|"') + '", "x","y","w","h","rot": num, "fill": "#hex", "opacidade": 0-1, "radius": 0-50, "z": num }\n' +
    '{ "tipo": "icone", "name": "' + ICONES_DA_IA.join('"|"') + '", "x","y","w","h","rot": num, "cor": "#hex", "peso": 1-3 (espessura do traço), "opacidade": 0-1, "z": num }\n' +
    'Use SOMENTE os valores listados para "shape" e "name" — qualquer outro é descartado.';

  const linhas = [
    'Empresa: ' + (ctx.empresa || 'A empresa') + '. Cor da marca: ' + (brand || '(não informada)') + '. Tema: ' + (ctx.tema || 'padrão') + '.',
    'A tela é ' + orientacao + ' (proporção ' + formato + ') — componha para ela.',
    'GERE: ' + oQue + '.',
  ];
  if (NOME_DO_LUGAR[pedido.onde]) linhas.push('POSIÇÃO pedida: ' + NOME_DO_LUGAR[pedido.onde] + '.');
  if (isHex(pedido.cor)) linhas.push('COR pedida: ' + pedido.cor + ' — use essa cor no elemento principal.');
  if (pedido.estilo) linhas.push('ESTILO: ' + String(pedido.estilo).slice(0, 60) + '.');
  if (!pedido.tipo) linhas.push('Deixe metade da tela LIVRE (sem texto) para uma imagem inserida depois.');
  linhas.push('Briefing: ' + brief);

  const text = await callLLM(system, linhas.join('\n'));
  return clampComposition(parseAiJson(text), brand, pedido, formato);
}

/* ---------------- Kit de campanha (biblioteca multi-formato) ----------------
 * A IA define a IDENTIDADE (cor da marca + copy elegante). O CÓDIGO monta o
 * layout de cada formato (TV 16:9/9:16/1:1, post de feed, story, banner) como
 * composições — garante beleza e consistência em qualquer proporção.
 * Cada peça é um item "composicao" que o editor já sabe abrir/ajustar. */
const KIT_FORMATS = [
  { id: 'tv-16-9', canal: 'TV / Signage', formato: '16/9', shape: 'wide', label: 'TV horizontal (16:9)' },
  { id: 'tv-9-16', canal: 'TV / Signage', formato: '9/16', shape: 'tall', label: 'TV vertical (9:16)' },
  { id: 'tv-1-1', canal: 'TV / Signage', formato: '1/1', shape: 'square', label: 'TV quadrada (1:1)' },
  { id: 'feed', canal: 'Social', formato: '1/1', shape: 'square', label: 'Post — feed (1:1)' },
  { id: 'story', canal: 'Social', formato: '9/16', shape: 'tall', label: 'Story (9:16)' },
  { id: 'banner', canal: 'Banner', formato: '21/9', shape: 'banner', label: 'Banner largo (21:9)' },
];
// Posições (em % da peça) por proporção — deixa espaço para a imagem do cliente.
const KIT_SHAPES = {
  wide: { title: { x: 6, y: 26, w: 60, h: 24, t: 6, a: 'left' }, sub: { x: 6, y: 55, w: 48, h: 12, t: 3.3, a: 'left' }, cta: { x: 6, y: 75, w: 46, h: 8, t: 2.9, a: 'left' } },
  tall: { title: { x: 8, y: 16, w: 84, h: 24, t: 9, a: 'left' }, sub: { x: 8, y: 47, w: 80, h: 14, t: 4.3, a: 'left' }, cta: { x: 8, y: 67, w: 76, h: 8, t: 3.9, a: 'left' } },
  square: { title: { x: 8, y: 27, w: 84, h: 22, t: 8, a: 'center' }, sub: { x: 8, y: 55, w: 80, h: 12, t: 4, a: 'center' }, cta: { x: 8, y: 73, w: 76, h: 8, t: 3.6, a: 'center' } },
  banner: { title: { x: 4, y: 26, w: 50, h: 30, t: 6, a: 'left' }, sub: { x: 4, y: 76, w: 46, h: 9, t: 2.8, a: 'left' }, cta: { x: 60, y: 44, w: 34, h: 14, t: 3.6, a: 'center' } },
};

// Formas decorativas em camadas (estilo signage profissional): elipse de
// profundidade + (no estilo vibrante) um bloco diagonal atrás do título.
function kitShapes(fmt, d) {
  const s = KIT_SHAPES[fmt.shape];
  const shapes = [{ tipo: 'forma', shape: 'ellipse', x: 58, y: -18, w: 64, h: 60, rot: 0, fill: { grad: 'radial', cores: [d.brand2, d.brand] }, opacidade: 0.5, z: 0 }];
  if (d.style === 'vibrante') {
    shapes.push({ tipo: 'forma', shape: 'rect', x: Math.max(-6, s.title.x - 5), y: Math.max(2, s.title.y - 3), w: Math.min(72, s.title.w + 14), h: s.title.h + 8, rot: -6, fill: { grad: 'linear', cores: [d.brand, d.brand2], ang: 120 }, opacidade: 0.95, radius: 8, z: 1 });
    shapes.push({ tipo: 'forma', shape: 'ellipse', x: -12, y: 62, w: 30, h: 30, rot: 0, fill: d.brand2, opacidade: 0.35, z: 0 });
  }
  return shapes;
}

function kitPiece(fmt, d) {
  const s = KIT_SHAPES[fmt.shape];
  const mk = (text, p, peso, cor) => ({ tipo: 'texto', text, x: p.x, y: p.y, w: p.w, h: p.h, rot: 0, cor: cor || '#ffffff', peso, tamanho: p.t, align: p.a, sombra: true, z: 2 });
  const els = kitShapes(fmt, d);
  if (d.kicker) els.push({ tipo: 'texto', text: String(d.kicker).toUpperCase(), x: s.title.x, y: Math.max(3, s.title.y - 13), w: s.title.w, h: 6, rot: 0, cor: '#ffffff', peso: 700, tamanho: Math.max(2.1, s.sub.t * 0.66), align: s.title.a, z: 2 });
  els.push(mk(d.headline, s.title, 900));
  if (d.sub) els.push(mk(d.sub, s.sub, 400));
  if (d.cta) els.push(mk((String(d.cta) + '  →').toUpperCase(), s.cta, 800));
  // Fundo: vibrante usa gradiente colorido (marca→acento); sóbrio escurece.
  const bgCor = d.style === 'vibrante'
    ? 'linear-gradient(150deg, ' + d.brand + ', ' + d.brand2 + ')'
    : 'linear-gradient(150deg, ' + d.brand + ', rgba(0,0,0,.62))';
  return { type: 'composicao', bg: { kind: 'cor', cor: bgCor }, elementos: els, formato: fmt.formato, duracao: 12 };
}

// Gemini com imagens (visão): extrai identidade das referências do cliente.
async function geminiVision(system, userText, images) {
  const parts = [{ text: userText }].concat(images.map((im) => ({ inline_data: { mime_type: im.mime, data: im.data } })));
  const list = [process.env.GEMINI_MODEL, ...GEMINI_CANDIDATES].filter((m, i, a) => m && a.indexOf(m) === i);
  let lastErr;
  for (const model of list) {
    try {
      const url = 'https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(model) + ':generateContent';
      const res = await fetch(url, {
        method: 'POST', headers: { 'x-goog-api-key': GEMINI_KEY, 'content-type': 'application/json' },
        body: JSON.stringify({ system_instruction: { parts: [{ text: system }] }, contents: [{ role: 'user', parts }], generationConfig: { temperature: 0.4, maxOutputTokens: 2048, responseMimeType: 'application/json', thinkingConfig: { thinkingBudget: 0 } } }),
      });
      const data = await res.json();
      if (res.ok) {
        const cand = data.candidates && data.candidates[0];
        const text = ((cand && cand.content && cand.content.parts) || []).map((p) => p.text || '').join('').trim();
        if (text) return text;
        lastErr = new Error('vazio'); continue;
      }
      const msg = (data && data.error && data.error.message) || ('Gemini HTTP ' + res.status);
      lastErr = new Error(msg); if (!geminiRetryable(msg)) throw lastErr;
    } catch (e) { lastErr = e; if (!geminiRetryable(e.message)) throw e; }
  }
  throw lastErr || new Error('visão falhou');
}

// Modelos de geração de imagem do Gemini (2026): Nano Banana 2 / Pro / 2.5.
const GEMINI_IMAGE_MODELS = ['gemini-3.1-flash-image-preview', 'gemini-3-pro-image-preview', 'gemini-2.5-flash-image'];

// Placeholder para modo dev (sem chave): SVG com gradiente + prompt.
function devImage(prompt, opts) {
  const o = opts || {};
  const [aw, ah] = String(o.formato || '16/9').split('/').map(Number);
  const r = (aw && ah) ? aw / ah : 16 / 9;
  const W = r >= 1 ? 1280 : Math.round(1280 * r), H = r >= 1 ? Math.round(1280 / r) : 1280;
  const c1 = /^#?[0-9a-f]{6}$/i.test(o.brand || '') ? (o.brand[0] === '#' ? o.brand : '#' + o.brand) : '#1e3a8a';
  const c2 = /^#?[0-9a-f]{6}$/i.test(o.brand2 || '') ? (o.brand2[0] === '#' ? o.brand2 : '#' + o.brand2) : '#0ea5e9';
  const txt = String(prompt || 'Imagem').replace(/[<&>]/g, '').slice(0, 60);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">` +
    `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient></defs>` +
    `<rect width="${W}" height="${H}" fill="url(#g)"/>` +
    `<circle cx="${W * 0.8}" cy="${H * 0.2}" r="${Math.min(W, H) * 0.28}" fill="#ffffff" opacity="0.12"/>` +
    `<circle cx="${W * 0.15}" cy="${H * 0.85}" r="${Math.min(W, H) * 0.2}" fill="#000000" opacity="0.12"/>` +
    `<text x="50%" y="50%" fill="#ffffff" font-family="system-ui,Arial" font-size="${Math.round(Math.min(W, H) * 0.07)}" font-weight="800" text-anchor="middle" dominant-baseline="middle">${txt}</text>` +
    `</svg>`;
  return { mime: 'image/svg+xml', data: Buffer.from(svg).toString('base64') };
}

// Gera uma imagem a partir de um prompt. Retorna { mime, data (base64) }.
async function generateImage(prompt, opts) {
  prompt = String(prompt || '').slice(0, 1200); opts = opts || {};
  if (mode() === 'dev' || !GEMINI_KEY) return devImage(prompt, opts);
  const guide = [
    opts.formato ? `Proporção da imagem: ${opts.formato}.` : '',
    opts.brand ? `Cor de marca principal: ${opts.brand}.` : '',
    opts.brand2 ? `Cor de acento: ${opts.brand2}.` : '',
    opts.estilo ? `Estilo: ${opts.estilo}.` : '',
    'Digital signage profissional, alta qualidade, composição limpa. Sem marcas d\'água.',
  ].filter(Boolean).join(' ');
  const list = [process.env.GEMINI_IMAGE_MODEL, ...GEMINI_IMAGE_MODELS].filter((m, i, a) => m && a.indexOf(m) === i);
  let lastErr;
  for (const model of list) {
    try {
      const url = 'https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(model) + ':generateContent';
      const res = await fetch(url, {
        method: 'POST', headers: { 'x-goog-api-key': GEMINI_KEY, 'content-type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: prompt + '\n\n' + guide }] }],
          generationConfig: { responseModalities: ['TEXT', 'IMAGE'] },
        }),
      });
      const data = await res.json();
      if (res.ok) {
        const parts = (data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts) || [];
        const img = parts.find((p) => p.inline_data || p.inlineData);
        const inl = img && (img.inline_data || img.inlineData);
        if (inl && inl.data) return { mime: (inl.mime_type || inl.mimeType || 'image/png'), data: inl.data };
        lastErr = new Error('sem imagem na resposta'); continue;
      }
      const msg = (data && data.error && data.error.message) || ('Gemini HTTP ' + res.status);
      lastErr = new Error(msg); if (!geminiRetryable(msg)) throw lastErr;
    } catch (e) { lastErr = e; if (!geminiRetryable(e.message)) throw e; }
  }
  throw lastErr || new Error('geração de imagem falhou');
}

/*
 * Olha as artes que a empresa subiu como referência e resume a direção visual
 * numa frase. Mais confiável que pedir para o cliente descrever o próprio
 * estilo por escrito — ninguém acerta isso em palavras.
 */
async function descreverEstilo(images) {
  if (mode() === 'dev' || !Array.isArray(images) || !images.length) return '';
  try {
    const r = parseAiJson(await geminiVision(
      'Você é diretor de arte. Analise as referências visuais e resuma a direção.',
      'Descreva em UMA frase o estilo destas artes: tipografia, uso de cor, composição e clima. '
      + 'Responda APENAS JSON: {"estilo":"..."}.',
      images.slice(0, 3)));
    return String((r && r.estilo) || '').slice(0, 200);
  } catch (e) { return ''; }
}

/*
 * Cataloga as imagens base da empresa: uma frase por foto, dizendo o que ela
 * mostra e onde serviria. É o que permite ao diretor ESCOLHER a foto real do
 * cliente em vez de inventar uma — gerar imagem é caro e nunca é a loja dele.
 * Recebe [{ mime, data }] e devolve um array de strings na MESMA ordem.
 */
async function catalogarImagens(images) {
  if (mode() === 'dev' || !Array.isArray(images) || !images.length) return [];
  try {
    const r = parseAiJson(await geminiVision(
      'Você cataloga o banco de imagens de uma empresa para uso em digital signage.',
      'As imagens vêm numeradas na ordem em que aparecem. Para CADA uma, escreva uma '
      + 'frase curta: o que mostra e para que tipo de peça serviria de fundo. '
      + 'Responda APENAS JSON: {"imagens":["frase da 1","frase da 2"]} — mesma ordem, mesma quantidade.',
      images.slice(0, 8)));
    const arr = Array.isArray(r && r.imagens) ? r.imagens : [];
    return images.slice(0, 8).map((_, i) => String(arr[i] || '').slice(0, 160));
  } catch (e) { return []; }
}

async function generateKit(brief, ctx) {
  brief = String(brief || '').slice(0, 600); ctx = ctx || {};
  // Referências do cliente (imagens): a IA extrai cor de marca + estilo.
  let styleNote = '';
  if (mode() !== 'dev' && Array.isArray(ctx.refImages) && ctx.refImages.length) {
    try {
      const v = parseAiJson(await geminiVision(
        'Você é diretor de arte. Analise as imagens de referência da marca/cliente e extraia a identidade visual.',
        'Extraia a cor de marca predominante e o estilo/vibe. Responda APENAS JSON: {"brand":"#hex","vibe":"3 a 5 adjetivos de estilo"}.',
        ctx.refImages.slice(0, 3)));
      if (isHex(v.brand)) ctx.brand = v.brand.startsWith('#') ? v.brand : '#' + v.brand;
      if (v.vibe) styleNote = String(v.vibe).slice(0, 120);
    } catch (e) { /* segue sem as referências */ }
  }
  const okHex = (h, fb) => isHex(h) ? (h.startsWith('#') ? h : '#' + h) : fb;
  if (ctx.brand2 && isHex(ctx.brand2)) ctx.brand2 = ctx.brand2.startsWith('#') ? ctx.brand2 : '#' + ctx.brand2;
  const brief2 = [
    ctx.publico ? `Público-alvo: ${String(ctx.publico).slice(0, 120)}` : '',
    ctx.tom ? `Tom: ${String(ctx.tom).slice(0, 60)}` : '',
    ctx.oferta ? `Oferta/CTA: ${String(ctx.oferta).slice(0, 120)}` : '',
  ].filter(Boolean).join('\n');
  let d;
  if (mode() === 'dev') {
    d = { brand: ctx.brand || '#0ea5e9', brand2: ctx.brand2 || '#7c3aed', style: 'vibrante', kicker: ctx.empresa || 'Campanha', headline: (brief.split(/[.\n]/)[0] || 'Sua campanha').slice(0, 48), sub: 'Mensagem de apoio da campanha.', cta: ctx.oferta ? String(ctx.oferta).slice(0, 40) : 'Saiba mais' };
  } else {
    const system =
      'Você é diretor de arte de digital signage profissional. A partir do briefing, defina a IDENTIDADE de uma campanha com ' +
      'DUAS cores que combinam (marca + acento) para gradientes vibrantes, e copy curta e forte. ' +
      'Respeite o público-alvo e o tom quando informados. ' +
      'Escolha o estilo: "vibrante" (fundo colorido, formas/blocos — para varejo, promoções, energia) ou ' +
      '"sobrio" (fundo escuro elegante — para corporativo, institucional). ' +
      'Responda APENAS com JSON: {"brand":"#hex","brand2":"#hex","style":"vibrante"|"sobrio","kicker":"etiqueta curta","headline":"título forte (2 a 6 palavras)","sub":"subtítulo curto","cta":"chamada curta"}. Português do Brasil.';
    const user = `Empresa: ${ctx.empresa || 'A empresa'}. Cor primária (se houver): ${ctx.brand || '(escolha uma paleta elegante)'}. Cor secundária (se houver): ${ctx.brand2 || '(escolha um acento que combine)'}` +
      (styleNote ? `\nEstilo desejado (das referências do cliente): ${styleNote}` : '') +
      (brief2 ? `\n${brief2}` : '') +
      `\nBriefing: ${brief}`;
    const p = parseAiJson(await callLLM(system, user));
    // Cores informadas pelo usuário mandam; senão a IA escolhe.
    const brand = ctx.brand ? okHex(ctx.brand, '#0ea5e9') : okHex(p.brand, '#0ea5e9');
    d = {
      brand,
      brand2: ctx.brand2 ? okHex(ctx.brand2, '#7c3aed') : okHex(p.brand2, '#7c3aed'),
      style: p.style === 'sobrio' ? 'sobrio' : 'vibrante',
      kicker: String(p.kicker || ctx.empresa || '').slice(0, 40),
      headline: String(p.headline || 'Sua campanha').slice(0, 60),
      sub: String(p.sub || '').slice(0, 120),
      cta: String(p.cta || '').slice(0, 40),
    };
  }
  const pieces = KIT_FORMATS.map((f) => ({ id: f.id, canal: f.canal, formato: f.formato, label: f.label, item: kitPiece(f, d) }));
  return { brand: d.brand, brand2: d.brand2, style: d.style, kicker: d.kicker, headline: d.headline, sub: d.sub, cta: d.cta, pieces };
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

module.exports = { analyzeVisual, mode, __clamp: clampComposition, callLLM, parseAiJson, descreverEstilo, catalogarImagens, generateContent, generateCampaign, generateDayparts, generateSeasonal, generateComposition, generateKit, generateImage, rewriteText, diagnose, ITEM_SCHEMA };

async function analyzeVisual(imageB64) {
  const provider = mode();
  if (provider === 'dev') return { nota: 9, analise: '(Modo dev) A peça parece bem equilibrada.' };
  if (provider !== 'gemini') throw new Error('A visão computacional requer um modelo multimodal do Gemini (GEMINI_API_KEY).');
  const system = 'Você é um diretor de arte avaliando uma peça visual pronta para digital signage. Avalie a composição, o contraste e a diagramação. Aponte problemas de legibilidade ou respiro se houver. Seja direto e conciso. Responda apenas com um JSON: { "nota": <inteiro 0 a 10>, "analise": "<texto>" }';
  
  const m = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
  const url = 'https://generativelanguage.googleapis.com/v1beta/models/' + m + ':generateContent';
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'x-goog-api-key': process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY, 'content-type': 'application/json' },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: system }] },
      contents: [{ role: 'user', parts: [
        { text: 'Avalie a imagem desta peça de digital signage.' },
        { inlineData: { mimeType: 'image/jpeg', data: imageB64 } }
      ]}],
      generationConfig: { temperature: 0.7, maxOutputTokens: 1024, responseMimeType: 'application/json' }
    })
  });
  const data = await res.json();
  if (!res.ok) throw new Error((data.error && data.error.message) || 'Gemini Vision falhou');
  const txt = data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts && data.candidates[0].content.parts[0].text;
  if (!txt) throw new Error('Retorno vazio');
  return parseAiJson(txt);
}
