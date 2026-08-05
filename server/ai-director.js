/*
 * server/ai-director.js — o motor de direção de arte.
 *
 * Diferença para o generateKit antigo: lá a IA escolhia cores e copy e o código
 * encaixava tudo num template fixo. Aqui ela DIRIGE — decide quantas peças, o
 * que cada uma diz, se precisa de imagem gerada e como o layout se organiza.
 *
 * Duas etapas, de propósito:
 *   1) plano   — uma chamada, visão da campanha inteira (identidade, peças,
 *                copy, legendas de rede social, quando postar). Barato e é o
 *                que garante COERÊNCIA entre as peças.
 *   2) compor  — uma chamada por peça, só o layout. Escopo pequeno = layout
 *                melhor e erro isolado (uma peça ruim não derruba a campanha).
 *
 * O que a IA devolve nunca vai direto para a tela: passa por server/composer.js,
 * que corrige contraste, área segura, sobreposição e texto que não cabe.
 */
const ai = require('./ai');
const ds = require('./design-system');
const { validarComposicao } = require('./composer');

/* ---------------- Etapa 1: o plano ---------------- */

const SISTEMA_PLANO = `Você é diretor de arte sênior especializado em digital signage corporativo brasileiro.
Planeje uma campanha completa a partir do briefing.

REGRAS DE COPY (tela vista de longe, poucos segundos):
- headline: 2 a 5 palavras. É o que a pessoa lê em 1 segundo.
- kicker: rótulo curto (1 a 3 palavras), tipo "NOVIDADE", "ATÉ DOMINGO".
- sub: uma frase de apoio, no máximo 9 palavras. Pode ser vazia.
- cta: chamada de ação curta e concreta. Pode ser vazia em peça institucional.
- Nada de jargão de agência, nada de reticências, nada de EMOJI nas peças de TV.

DIREÇÃO DE ARTE — escolha uma:
- "chapado": fundo na cor da marca em cheio, tipografia condensada gigante.
  Para promoção, varejo, campanha de preço. Alto impacto.
- "cartaz": foto ocupando a peça, título gigante sangrando pelas bordas, nome
  em manuscrita. Para homenagem, evento, aniversário, pessoa.
- "contraste": quase preto, tipo branca enorme, subtítulo colorido. Para
  telão de palco, culto, congresso, avisos sérios.
- "suave": degradê discreto. Para institucional e comunicado interno.

DECISÕES QUE SÃO SUAS:
- quantas peças e para quais formatos, conforme o objetivo do briefing;
- se a peça pede uma IMAGEM DE FUNDO gerada (produto, ambiente, comida, pessoas)
  ou se resolve melhor com formas e cor — a maioria das peças corporativas
  resolve com formas, use imagem quando ela agrega mesmo;
- o tom das legendas de rede social, que são MAIS longas e podem ter emoji.

Responda APENAS com JSON, neste formato:
{
  "campanha": "nome curto",
  "identidade": {
    "brand": "#hex", "brand2": "#hex",
    "estilo": "vibrante" | "sobrio" | "elegante" | "energetico",
    "direcao": "chapado" | "cartaz" | "contraste" | "suave",
    "racional": "1 frase explicando a direção visual"
  },
  "pecas": [
    {
      "formato": "16/9" | "9/16" | "1/1" | "21/9",
      "canal": "TV" | "Feed" | "Story" | "Banner",
      "objetivo": "1 frase",
      "kicker": "", "headline": "", "sub": "", "cta": "",
      "precisaImagem": true|false,
      "promptImagem": "descrição da foto, só se precisaImagem for true"
    }
  ],
  "social": {
    "instagram": "legenda com quebras de linha e hashtags",
    "whatsapp": "mensagem curta para lista de transmissão",
    "linkedin": "texto mais formal, 2 parágrafos"
  },
  "agenda": [
    { "quando": "ex.: segunda 9h", "canal": "Feed", "motivo": "1 frase" }
  ]
}
Português do Brasil.`;

async function planejar(brief, ctx) {
  ctx = ctx || {};
  const usuario = [
    `Empresa: ${ctx.empresa || '(não informada)'}`,
    ctx.segmento ? `Segmento: ${ctx.segmento}` : '',
    ctx.publico ? `Público-alvo: ${ctx.publico}` : '',
    ctx.tom ? `Tom desejado: ${ctx.tom}` : '',
    ctx.oferta ? `Oferta / CTA: ${ctx.oferta}` : '',
    ctx.brand ? `Cor da marca: ${ctx.brand}` : '',
    ctx.brand2 ? `Cor secundária: ${ctx.brand2}` : '',
    ctx.formatos && ctx.formatos.length ? `Formatos desejados: ${ctx.formatos.join(', ')}` : '',
    '',
    `Briefing: ${String(brief || '').slice(0, 900)}`,
  ].filter(Boolean).join('\n');

  if (ai.mode() === 'dev') return planoDev(brief, ctx);

  const bruto = await ai.callLLM(SISTEMA_PLANO, usuario);
  const p = ai.parseAiJson(bruto);
  return normalizarPlano(p, ctx, brief);
}

const FORMATOS_OK = ['16/9', '9/16', '1/1', '21/9'];

function normalizarPlano(p, ctx, brief) {
  p = p && typeof p === 'object' ? p : {};
  const id = p.identidade || {};
  // Cor informada pelo cliente manda; a IA só decide quando não veio nada.
  const brand = ds.okHex(ctx.brand || id.brand, '#1e3a8a');
  const brand2 = ds.okHex(ctx.brand2 || id.brand2, null) || ds.girarMatiz(brand, 35);
  const estilo = ['vibrante', 'sobrio', 'elegante', 'energetico'].includes(id.estilo) ? id.estilo : 'vibrante';
  const direcao = ds.DIRECOES[id.direcao] ? id.direcao : 'chapado';

  let pecas = (Array.isArray(p.pecas) ? p.pecas : []).map((x) => ({
    formato: FORMATOS_OK.includes(x && x.formato) ? x.formato : '16/9',
    canal: String((x && x.canal) || 'TV').slice(0, 20),
    objetivo: String((x && x.objetivo) || '').slice(0, 140),
    kicker: String((x && x.kicker) || '').slice(0, 40),
    headline: String((x && x.headline) || '').slice(0, 70),
    sub: String((x && x.sub) || '').slice(0, 130),
    cta: String((x && x.cta) || '').slice(0, 40),
    precisaImagem: !!(x && x.precisaImagem),
    promptImagem: String((x && x.promptImagem) || '').slice(0, 400),
  })).filter((x) => x.headline).slice(0, 8);

  if (!pecas.length) pecas = planoDev(brief, ctx).pecas;

  const social = p.social && typeof p.social === 'object' ? p.social : {};
  return {
    campanha: String(p.campanha || ctx.empresa || 'Campanha').slice(0, 60),
    identidade: {
      brand, brand2, estilo, direcao,
      racional: String(id.racional || '').slice(0, 200),
    },
    pecas,
    social: {
      instagram: String(social.instagram || '').slice(0, 1200),
      whatsapp: String(social.whatsapp || '').slice(0, 600),
      linkedin: String(social.linkedin || '').slice(0, 1500),
    },
    agenda: (Array.isArray(p.agenda) ? p.agenda : []).slice(0, 8).map((a) => ({
      quando: String((a && a.quando) || '').slice(0, 40),
      canal: String((a && a.canal) || '').slice(0, 20),
      motivo: String((a && a.motivo) || '').slice(0, 140),
    })),
  };
}

// Modo dev (sem chave de IA): plano plausível para o sistema seguir funcionando.
function planoDev(brief, ctx) {
  const titulo = String(brief || 'Sua campanha').split(/[.\n]/)[0].slice(0, 40) || 'Sua campanha';
  const base = { kicker: 'NOVIDADE', headline: titulo, sub: 'Passe no balcão e confira.', cta: ctx.oferta || 'Saiba mais', precisaImagem: false, promptImagem: '' };
  return {
    campanha: ctx.empresa || 'Campanha',
    identidade: {
      brand: ds.okHex(ctx.brand, '#1e3a8a'),
      brand2: ds.okHex(ctx.brand2, '#0ea5e9'),
      estilo: 'vibrante', direcao: 'chapado',
      racional: 'Modo demonstração — defina GEMINI_API_KEY para a direção real.',
    },
    pecas: [
      { ...base, formato: '16/9', canal: 'TV', objetivo: 'Chamar atenção na tela principal' },
      { ...base, formato: '9/16', canal: 'Story', objetivo: 'Alcance nas redes' },
      { ...base, formato: '1/1', canal: 'Feed', objetivo: 'Post de feed' },
    ],
    social: {
      instagram: titulo + '\n\n(modo demonstração)',
      whatsapp: titulo,
      linkedin: titulo,
    },
    agenda: [{ quando: 'segunda 9h', canal: 'Feed', motivo: 'Início da semana tem mais alcance' }],
  };
}

/* ---------------- Etapa 2: a composição ---------------- */

function sistemaComposicao(formato, palette) {
  const s = ds.safeArea(formato);
  const esc = ds.escalaTipografica(formato);
  return `Você é diretor de arte compondo UMA peça de digital signage ${formato}.

Coordenadas em % da peça: x/y = canto superior esquerdo, w/h = tamanho.
ÁREA SEGURA para texto: x de ${s.x} a ${s.x + s.w}, y de ${s.y} a ${s.y + s.h}.
Formas de fundo PODEM e DEVEM sangrar para fora (x negativo, w acima de 100) —
é o que dá profundidade. Texto, nunca.

PALETA (use estas cores, não invente):
- fundo: ${palette.bg} / ${palette.bgAlt}
- marca: ${palette.brand} · secundária: ${palette.brand2} · acento: ${palette.acento}
- texto sobre fundo: ${palette.texto} · texto sobre acento: ${palette.textoNoAcento}

TAMANHOS de texto (campo "tamanho", em % da largura):
kicker ~${esc.kicker.toFixed(1)} · headline ~${esc.headline.toFixed(1)} · sub ~${esc.sub.toFixed(1)} · cta ~${esc.cta.toFixed(1)}

COMPOSIÇÃO — o que separa peça profissional de amadora:
- Uma hierarquia clara: o headline domina, o resto apoia. Nada de dois elementos disputando.
- Ancore o texto num canto ou numa faixa. Texto solto no meio empobrece.
- 2 a 4 formas de fundo bastam: um bloco grande diagonal ou uma elipse saindo da
  borda cria profundidade. Mais que isso vira poluição.
- Deixe respiro: pelo menos 30% da peça sem nada.
- O CTA pode ser um retângulo de acento com o texto por cima (cria botão).

Responda APENAS com JSON:
{"elementos":[
  {"tipo":"forma","papel":"fundo","shape":"rect|ellipse|triangle|diamond|diag","x":0,"y":0,"w":0,"h":0,"rot":0,"fill":{"grad":"linear","ang":150,"cores":["#hex","#hex"]},"opacidade":1},
  {"tipo":"texto","papel":"kicker|headline|sub|cta","text":"","x":0,"y":0,"w":0,"h":0,"tamanho":0,"cor":"#hex","align":"left|center|right","peso":800},
  {"tipo":"icone","papel":"decor","name":"star","x":0,"y":0,"w":0,"h":0,"cor":"#hex"}
]}
Sempre inclua o campo "papel". Não escreva nada fora do JSON.`;
}

async function comporPeca(peca, identidade, palette) {
  const formato = peca.formato || '16/9';
  const dirId = identidade.direcao || 'chapado';
  const usuario = [
    `Objetivo: ${peca.objetivo || 'comunicar a mensagem'}`,
    `Estilo: ${identidade.estilo}`,
    identidade.racional ? `Direção: ${identidade.racional}` : '',
    '',
    'Textos que DEVEM aparecer exatamente assim:',
    peca.kicker ? `kicker: ${peca.kicker}` : '(sem kicker)',
    `headline: ${peca.headline}`,
    peca.sub ? `sub: ${peca.sub}` : '(sem sub)',
    peca.cta ? `cta: ${peca.cta}` : '(sem cta)',
    peca.bgImagem ? '\nA peça JÁ TEM uma foto de fundo: use formas escuras semitransparentes atrás do texto para garantir leitura, e não cubra a foto inteira.' : '',
  ].filter(Boolean).join('\n');

  let bruto = null;
  if (ai.mode() !== 'dev') {
    try {
      bruto = ai.parseAiJson(await ai.callLLM(sistemaComposicao(formato, palette), usuario));
    } catch (e) {
      bruto = null; // cai no layout de reserva abaixo
    }
  }
  if (!bruto || !Array.isArray(bruto.elementos) || !bruto.elementos.length) {
    bruto = layoutReserva(peca, palette, formato, dirId);
  }
  if (peca.bgImagem) bruto.bg = { kind: 'imagem', src: peca.bgImagem };

  const { item, correcoes } = validarComposicao(bruto, { formato, palette });
  return { item, correcoes, usouReserva: !!bruto._reserva };
}

/*
 * Layout de reserva: usado quando a IA falha ou está desligada. Não é um
 * "erro na tela" — é uma peça correta, só menos autoral. A tela do cliente
 * nunca fica vazia por causa de uma chamada que caiu.
 */
/*
 * Layout de cartaz: título display gigante ancorado embaixo, sangrando pelas
 * bordas — o "ANIVERSÁRIO" das referências. Funciona com ou sem foto atrás.
 */
function layoutCartaz(peca, palette, formato, dir) {
  const s = ds.safeArea(formato);
  const esc = ds.escalaTipografica(formato);
  const r = ds.ratioDe(formato);
  const alto = r < 1;
  const tam = esc.headline * dir.escalaTitulo;
  const hTitulo = tam * 1.05 * r;

  const els = [];
  // Véu escuro embaixo: garante leitura do título sobre qualquer foto.
  els.push({ tipo: 'forma', papel: 'decor', shape: 'rect', x: -5, y: 45, w: 110, h: 60,
    fill: { grad: 'linear', ang: 180, cores: [palette.bg + '00', palette.bg] }, opacidade: 0.85, z: 1 });

  if (peca.kicker) {
    els.push({ tipo: 'texto', papel: 'kicker', text: peca.kicker, x: s.x, y: s.y + 1, w: s.w * 0.6,
      h: esc.kicker * 1.6 * r, tamanho: esc.kicker, fonte: 'condensada',
      cor: palette.texto, align: 'left', peso: 600 });
  }
  // Nome/assunto em script, o toque humano da referência.
  if (peca.sub) {
    els.push({ tipo: 'texto', papel: 'sub', text: peca.sub, x: s.x + 2, y: alto ? 22 : 18,
      w: s.w * 0.8, h: esc.sub * 2.4 * r, tamanho: esc.sub * 1.9, fonte: 'script',
      cor: palette.texto, align: 'left', peso: 400 });
  }
  /*
   * Sangrar só vale com palavra curta: "ANIVERSÁRIO" cortado nas pontas lê como
   * decisão de arte; um título de duas palavras cortado lê como defeito. Acima
   * de ~13 caracteres o título fica dentro da área segura.
   */
  const sangra = peca.headline.length <= 13;
  els.push({ tipo: 'texto', papel: sangra ? 'display' : 'headline', text: peca.headline,
    x: sangra ? -8 : s.x, y: 100 - hTitulo - (peca.cta ? 14 : 6),
    w: sangra ? 116 : s.w, h: hTitulo, tamanho: tam, fonte: dir.fonteTitulo,
    cor: palette.texto, align: 'center', peso: 900, sombra: true });

  if (peca.cta) {
    els.push({ tipo: 'texto', papel: 'cta', text: peca.cta, x: s.x, y: 100 - 11,
      w: s.w, h: esc.cta * 2 * r, tamanho: esc.cta, fonte: 'sans',
      cor: palette.acento, align: 'center', peso: 700 });
  }
  return { elementos: els, _reserva: true };
}

/*
 * Layout chapado: fundo na cor da marca em cheio, título condensado gigante
 * centralizado, filete fino no topo — a campanha de faculdade da referência.
 */
function layoutChapado(peca, palette, formato, dir) {
  const s = ds.safeArea(formato);
  const esc = ds.escalaTipografica(formato);
  const r = ds.ratioDe(formato);
  const tam = esc.headline * dir.escalaTitulo;
  const linhas = ds.cabeNaCaixa(peca.headline, { w: s.w, h: 100 }, tam, formato, dir.fonteTitulo).linhas || 1;
  const hTitulo = tam * 1.0 * Math.min(linhas, 3) * r;

  const els = [];
  // Filete fino atravessando o topo: decoração barata e elegante.
  if (dir.filete) {
    els.push({ tipo: 'forma', papel: 'decor', shape: 'rect', x: -5, y: 15, w: 110, h: 0.35,
      fill: palette.texto, opacidade: 0.45, rot: -8, z: 0 });
  }

  let y = ds.clamp(50 - hTitulo / 2 - 6, s.y, 60);
  if (peca.kicker) {
    els.push({ tipo: 'texto', papel: 'kicker', text: peca.kicker, x: s.x, y: y - esc.kicker * 2.6 * r,
      w: s.w, h: esc.kicker * 1.7 * r, tamanho: esc.kicker, fonte: 'sans',
      cor: palette.texto, align: 'center', peso: 800 });
  }
  els.push({ tipo: 'texto', papel: 'display', text: peca.headline, x: s.x, y, w: s.w, h: hTitulo,
    tamanho: tam, fonte: dir.fonteTitulo, cor: palette.texto, align: 'center', peso: 900 });
  y += hTitulo + esc.sub * 1.2 * r;

  if (peca.sub) {
    els.push({ tipo: 'texto', papel: 'sub', text: peca.sub, x: s.x + s.w * 0.1, y,
      w: s.w * 0.8, h: esc.sub * 2.4 * r, tamanho: esc.sub * 1.15, fonte: 'sans',
      cor: palette.texto, align: 'center', peso: 600 });
    y += esc.sub * 3 * r;
  }
  if (peca.cta) {
    const h = esc.cta * 2.4 * r;
    els.push({ tipo: 'forma', papel: 'destaque', shape: 'rect', x: s.x + s.w * 0.18, y,
      w: s.w * 0.64, h, radius: 14, fill: palette.texto, opacidade: 0.18 });
    els.push({ tipo: 'texto', papel: 'cta', text: peca.cta, x: s.x + s.w * 0.18, y,
      w: s.w * 0.64, h, tamanho: esc.cta, fonte: 'sans', cor: palette.texto, align: 'center', peso: 700 });
  }
  return { elementos: els, _reserva: true };
}

function layoutReserva(peca, palette, formato, dirId) {
  const dir = ds.direcao(dirId);
  if (dir.fundo === 'foto' || dir.sangra) return layoutCartaz(peca, palette, formato, dir);
  if (dir.fundo === 'marca') return layoutChapado(peca, palette, formato, dir);
  if (dir.fundo === 'escuro') return layoutChapado(peca, palette, formato, dir);
  return layoutSuave(peca, palette, formato);
}

function layoutSuave(peca, palette, formato) {
  const s = ds.safeArea(formato);
  const esc = ds.escalaTipografica(formato);
  const r = ds.ratioDe(formato);
  const alto = r < 1;
  const largo = r >= 2;

  // Em peça horizontal o texto ocupa a coluna da esquerda e a arte respira à
  // direita; em peça alta o texto usa a largura toda.
  const colW = alto ? s.w : largo ? s.w * 0.56 : s.w * 0.62;

  /*
   * O tamanho do texto é medido em cqw (% da LARGURA), mas a altura da caixa é
   * % da ALTURA. Sem converter pela proporção, o mesmo número vira caixa
   * espremida em peça horizontal e folgada em peça alta — foi o que deixou o
   * botão achatado no 16:9. altura() faz a conversão.
   */
  const altura = (cqw, linhas) => cqw * 1.15 * linhas * r;

  const els = [
    // Halo de cor saindo do canto — dá profundidade sem competir com o texto.
    { tipo: 'forma', papel: 'fundo', shape: 'ellipse', x: alto ? 30 : 55, y: alto ? -12 : -30, w: alto ? 85 : 62, h: alto ? 45 : 105, rot: 0,
      fill: { grad: 'radial', ang: 150, cores: [palette.brand2, palette.bg] }, opacidade: 0.55, z: 0 },
    // Segundo halo, menor e no canto oposto: equilibra a composição.
    { tipo: 'forma', papel: 'decor', shape: 'ellipse', x: -18, y: alto ? 72 : 58, w: alto ? 55 : 34, h: alto ? 30 : 62, rot: 0,
      fill: { grad: 'radial', ang: 0, cores: [palette.brand, palette.bg] }, opacidade: 0.4, z: 0 },
  ];

  // Bloco de texto ancorado: começa mais alto em peça alta (mais respiro embaixo).
  // Quantas linhas o título deve comportar, pela largura da coluna.
  const linhasTitulo = ds.cabeNaCaixa(peca.headline, { w: colW, h: 100 }, esc.headline, formato).linhas || 1;

  const hKicker = altura(esc.kicker, 1.5);
  const hTitulo = altura(esc.headline, Math.min(linhasTitulo, 3) + 0.25);
  const hSub = altura(esc.sub, 2);
  const hBotao = altura(esc.cta, 2.2);
  const gap = altura(esc.sub, 0.7); // respiro entre blocos, na mesma escala

  // Bloco de texto centrado verticalmente no espaço útil — evita ficar colado
  // no topo em peça alta e sobrando embaixo.
  const alturaTotal = (peca.kicker ? hKicker + gap : 0) + hTitulo + gap
    + (peca.sub ? hSub + gap : 0) + (peca.cta ? hBotao : 0);
  let y = ds.clamp(s.y + (s.h - alturaTotal) / 2, s.y, s.y + s.h - alturaTotal);

  if (peca.kicker) {
    els.push({ tipo: 'texto', papel: 'kicker', text: peca.kicker, x: s.x, y, w: colW, h: hKicker,
      tamanho: esc.kicker, cor: palette.acento, align: 'left', peso: 800 });
    y += hKicker + gap;
  }

  els.push({ tipo: 'texto', papel: 'headline', text: peca.headline, x: s.x, y, w: colW, h: hTitulo,
    tamanho: esc.headline, cor: palette.texto, align: 'left', peso: 900, sombra: true });
  y += hTitulo + gap;

  if (peca.sub) {
    els.push({ tipo: 'texto', papel: 'sub', text: peca.sub, x: s.x, y, w: colW * 0.92, h: hSub,
      tamanho: esc.sub, cor: palette.textoSuave, align: 'left', peso: 500 });
    y += hSub + gap;
  }

  if (peca.cta) {
    // Raio em % de uma caixa larga e baixa vira elipse — por isso 12, não 40.
    const wBotao = Math.min(colW, Math.max(peca.cta.length * esc.cta * 0.62 + esc.cta * 3, 24));
    els.push({ tipo: 'forma', papel: 'destaque', shape: 'rect', x: s.x, y, w: wBotao, h: hBotao,
      radius: 12, fill: palette.acento, opacidade: 1 });
    // Texto exatamente sobre o botão, para centralizar de verdade.
    els.push({ tipo: 'texto', papel: 'cta', text: peca.cta, x: s.x, y, w: wBotao, h: hBotao,
      tamanho: esc.cta, cor: palette.textoNoAcento, align: 'center', peso: 800 });
  }
  return { elementos: els, _reserva: true };
}

/* ---------------- Orquestração ---------------- */

/*
 * dirigir — briefing entra, campanha inteira sai.
 * onImagem: função opcional (prompt, formato) => url. Injetada pelo server.js
 * para que este módulo não precise conhecer storage nem tenant.
 */
async function dirigir(brief, ctx, { onImagem } = {}) {
  ctx = ctx || {};
  const plano = await planejar(brief, ctx);
  const dir = ds.direcao(plano.identidade.direcao);
  const palette = ds.buildPalette(plano.identidade.brand, plano.identidade.brand2,
    plano.identidade.estilo, dir.fundo === 'marca' ? 'marca' : dir.fundo === 'escuro' ? 'escuro' : 'degrade');

  // Imagens primeiro: a composição precisa saber se tem foto atrás.
  if (onImagem) {
    for (const peca of plano.pecas) {
      if (!peca.precisaImagem || !peca.promptImagem) continue;
      try { peca.bgImagem = await onImagem(peca.promptImagem, peca.formato); }
      catch (e) { peca.precisaImagem = false; } // sem imagem, compõe com formas
    }
  }

  const pecas = [];
  for (const peca of plano.pecas) {
    const { item, correcoes, usouReserva } = await comporPeca(peca, plano.identidade, palette);
    pecas.push({
      formato: peca.formato,
      canal: peca.canal,
      label: peca.headline.slice(0, 40),
      objetivo: peca.objetivo,
      item,
      correcoes,
      usouReserva,
    });
  }

  return {
    campanha: plano.campanha,
    identidade: plano.identidade,
    paleta: { bg: palette.bg, acento: palette.acento, texto: palette.texto, direcao: plano.identidade.direcao },
    pecas,
    social: plano.social,
    agenda: plano.agenda,
  };
}

module.exports = { dirigir, planejar, comporPeca, layoutReserva, normalizarPlano };
