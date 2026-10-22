/*
 * server/ecossistema.js — o gerador do ecossistema (EXECUTOR §2b, item 23).
 *
 * Recebe o ESCOPO (js/escopo.js) que a conversa fechou e devolve TUDO o que
 * ele pede, nem mais nem menos: as TVs com as peças de cada zona, as frases
 * do letreiro, a programação por horário e os textos das redes. O dono: "a
 * IA gera o ecossistema inteiro, ou só o que ele pedir".
 *
 *   1. As VAGAS: o escopo vira uma lista de peças a fazer, cada uma com a
 *      TV, a zona, o papel (cabeçalho, destaque, lateral, rodapé) e o
 *      formato.
 *   2. Os TEXTOS de todas as vagas numa chamada só, que vê a campanha
 *      inteira: a lateral não repete o destaque, e os dois estilos de
 *      cabeçalho dizem coisas diferentes.
 *   3. As FOTOS, conforme a escolha do cliente (`minhas`, `gerar`,
 *      `mistura`, `nenhuma`), pelo gancho `onImagem` — o mesmo da campanha,
 *      que confere o saldo e cobra (`fotoDaConta`, em server.js).
 *   4. As PEÇAS, no papel certo (`compositor.comporPeca`). Sem IA, ou com
 *      ela recusada três vezes, a peça-ouro daquele papel. Nunca zona vazia.
 *   5. As REDES (server/redes.js) a partir da peça principal, e os HORÁRIOS
 *      viram `agendamento` nos itens, que o player já entende.
 *
 * Foto só no principal e na lateral (e na peça das redes): é a mesma conta
 * de `escopo.custo`, para o cartão, o gerador e a cobrança baterem.
 */
const E = require('../js/escopo.js');
const ai = require('./ai');
const ds = require('./design-system');
const compositor = require('./compositor');
const redes = require('./redes');
const memoria = require('./ai-memoria');
const director = require('./ai-director');

const PAPEL_DA_ZONA = { principal: 'destaque', lateral: 'lateral', cabecalho: 'cabecalho', rodape: 'rodape' };
const ESTILOS = ['vibrante', 'sobrio', 'elegante', 'energetico'];

/*
 * 1. As vagas. O formato é o da zona na TV que vai receber: a principal de
 * uma TV em pé é em pé. Cabeçalho e rodapé são faixas (21/9 é o mais
 * próximo que a porta aceita; a peça se ajusta pelo @container).
 */
function vagasDoEscopo(escopo, telasDaConta) {
  const e = E.normalizar(escopo);
  const emPe = new Set((telasDaConta || []).filter((t) => t.emPe).map((t) => t.id));
  const vagas = [];
  e.telas.forEach((t, ti) => {
    const deitada = !(t.alvo.tipo === 'tela' && emPe.has(t.alvo.id));
    for (const zona of E.ZONAS) {
      const z = t.zonas[zona];
      for (let i = 0; i < z.pecas; i++) {
        vagas.push({
          id: 't' + ti + '-' + zona + '-' + i, tela: ti, zona, indice: i, papel: PAPEL_DA_ZONA[zona],
          formato: zona === 'principal' ? (deitada ? '16/9' : '9/16') : zona === 'lateral' ? '9/16' : '21/9',
          pedido: z.pedido || '',
        });
      }
    }
  });
  // Só redes: uma peça feita para elas (escopo.custo conta a mesma).
  if (!vagas.length && E.REDES.some((r) => e.redes[r])) {
    vagas.push({ id: 'redes-0', tela: -1, zona: 'redes', indice: 0, papel: 'destaque', formato: '1/1', pedido: '' });
  }
  return vagas;
}

const levaFoto = (v) => v.zona === 'principal' || v.zona === 'lateral' || v.zona === 'redes';

/* ---------------- 2. Os textos ---------------- */

const SISTEMA = `Você é diretor de arte e redator de digital signage para pequenos negócios
brasileiros. Escreva os textos de TODAS as peças de uma campanha de uma vez,
para elas conversarem entre si.

REGRAS:
- TV é vista de longe e por segundos. titulo: 2 a 5 palavras. kicker: 1 a 3
  palavras ("ATÉ DOMINGO"). apoio: uma frase de até 9 palavras, pode ser vazia.
  cta: chamada curta e concreta, pode ser vazia.
- Cabeçalho: o titulo é a chamada curta que corre ao lado da marca.
- Rodapé: o kicker é o selo curto ao lado do letreiro.
- Lateral: complementa a principal (como, onde, quando, preço). NUNCA repita
  o título de outra peça.
- Peças da mesma zona dizem coisas DIFERENTES: uma abre o assunto, a outra dá
  o argumento ou a urgência.
- Sem emoji nas peças. Nunca invente preço, data, endereço ou nome que não
  esteja no pedido.
- FOTO (só nas vagas que aceitam foto): "foto": "minha" com "base" (o número
  de uma foto da empresa que sirva), ou "gerar" com "descricaoFoto" (a cena
  em português, sem texto escrito nela, sem rosto de pessoa real), ou
  "nenhuma". Siga a regra de fotos do pedido.
- mensagens: as frases do LETREIRO do rodapé de cada TV (até 60 caracteres
  cada): o que completa a tela — horário, pagamento, um aviso útil. Use as
  que o cliente já escreveu, sem mudar.
- direcao: "chapado" (cor da marca cheia, promoção), "cartaz" (foto grande,
  evento), "contraste" (escuro, aviso sério) ou "suave" (institucional).

Responda APENAS JSON:
{
  "nome": "nome curto da campanha",
  "direcao": "chapado",
  "estilo": "vibrante" | "sobrio" | "elegante" | "energetico",
  "vagas": { "<id da vaga>": { "kicker": "", "titulo": "", "apoio": "", "cta": "", "foto": "gerar", "base": null, "descricaoFoto": "" } },
  "mensagens": { "<número da TV>": ["frase", "frase"] }
}
Português do Brasil.`;

const REGRA_FOTO = {
  minhas: 'Fotos: SÓ as da empresa. Use "minha" com a "base" que servir; se nenhuma servir, "nenhuma". Nunca "gerar".',
  gerar: 'Fotos: a IA gera. Use "gerar" com uma "descricaoFoto" boa em toda vaga que aceita foto.',
  mistura: 'Fotos: as da empresa primeiro ("minha" com a "base"), e "gerar" onde nenhuma servir.',
  nenhuma: 'Fotos: nenhuma. Use "nenhuma" em todas.',
};

function pedidoDosTextos(escopo, vagas, ctx) {
  const e = escopo;
  const bases = ((ctx.marca && ctx.marca.bases) || []).slice(0, 8);
  const linhasVagas = vagas.map((v) => {
    const t = e.telas[v.tela];
    const onde = v.zona === 'redes' ? 'para as redes' : (t && (t.nome || 'TV ' + (v.tela + 1))) + ', ' + E.NOME_ZONA[v.zona].toLowerCase();
    return `- ${v.id}: ${onde}${v.pedido ? ' — o cliente pediu: ' + v.pedido : ''}${levaFoto(v) ? ' (aceita foto)' : ''}`;
  });
  const letreiros = e.telas.map((t, i) => (t.zonas.rodape.mensagens.length
    ? `TV ${i}: o cliente já escreveu ${JSON.stringify(t.zonas.rodape.mensagens)}` : '')).filter(Boolean);
  return [
    ctx.empresa ? `Empresa: ${ctx.empresa}` : '',
    ctx.segmento ? `Segmento: ${ctx.segmento}` : '',
    ctx.marca && ctx.marca.tom ? `Tom: ${ctx.marca.tom}` : '',
    ctx.marca && ctx.marca.observacoes ? `Regras da marca: ${ctx.marca.observacoes}` : '',
    memoria.comoTexto(ctx.memoria),
    '',
    `Campanha: ${e.nome || '(sem nome)'}`,
    e.objetivo ? `Para que serve: ${e.objetivo}` : '',
    e.publico ? `Público: ${e.publico}` : '',
    e.periodo.fim ? `Vale até: ${e.periodo.fim}` : '',
    e.horarios.length ? 'Horários: ' + e.horarios.map((h) => (h.faixa || h.inicio + '-' + h.fim) + (h.foco ? ' (' + h.foco + ')' : '')).join(', ') : '',
    REGRA_FOTO[e.imagens],
    bases.length ? 'FOTOS DA EMPRESA ("base" com o número):\n' + bases.map((b, i) => `  ${i}. ${b.label || 'foto do acervo'}`).join('\n') : 'A empresa não tem fotos próprias.',
    '',
    'VAGAS:',
    ...linhasVagas,
    letreiros.length ? '\nLETREIROS:\n' + letreiros.join('\n') : '',
  ].filter((x) => x !== '').join('\n');
}

const KICKERS = ['NOVIDADE', 'HOJE', 'APROVEITE', 'SÓ AQUI'];

/*
 * Sem IA: textos tirados do próprio escopo. Nada inventado — só o que o
 * cliente disse. O `pedido` da zona NÃO vira texto: é instrução ("letreiro
 * com mensagem de apoio…"), e a TV mostraria a ordem em vez da mensagem. Ele
 * só descreve a foto, que é pedida a outra IA.
 */
function textosSemIA(escopo, vagas) {
  const e = escopo;
  // Sem repetir: nome e objetivo iguais ("Promoção da semana" duas vezes) virariam o mesmo título em toda peça.
  const frases = [e.nome, e.objetivo].map((x) => String(x || '').trim()).filter((x, i, a) => x && a.findIndex((y) => y.toLowerCase() === x.toLowerCase()) === i);
  const vagasOut = {};
  for (const v of vagas) {
    const titulo = frases[v.indice % Math.max(1, frases.length)] || 'Confira';
    vagasOut[v.id] = {
      kicker: v.zona === 'lateral' ? 'AQUI TEM' : KICKERS[v.indice % KICKERS.length],
      titulo: compositor.cortarNaPalavra(titulo, 48),
      apoio: v.zona === 'principal' || v.zona === 'redes' ? compositor.cortarNaPalavra(e.objetivo && e.objetivo !== titulo ? e.objetivo : '', 70) : '',
      cta: v.zona === 'principal' ? 'Peça no balcão' : '',
      foto: e.imagens === 'nenhuma' ? 'nenhuma' : e.imagens === 'minhas' ? 'minha' : 'gerar',
      base: null,
      descricaoFoto: v.pedido || titulo,
    };
  }
  const mensagens = {};
  e.telas.forEach((t, i) => { mensagens[i] = t.zonas.rodape.mensagens.length ? t.zonas.rodape.mensagens : frases.slice(0, 2); });
  return { nome: e.nome || 'Campanha', direcao: 'chapado', estilo: 'vibrante', vagas: vagasOut, mensagens };
}

const corta = (s, n) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim().slice(0, n);

function lerTextos(r, escopo, vagas, bases) {
  const reserva = textosSemIA(escopo, vagas);
  const x = r && typeof r === 'object' ? r : {};
  const vagasOut = {};
  for (const v of vagas) {
    const t = (x.vagas && x.vagas[v.id]) || {};
    const res = reserva.vagas[v.id];
    const base = Number.isInteger(t.base) && t.base >= 0 && t.base < bases.length ? t.base : null;
    vagasOut[v.id] = {
      kicker: corta(t.kicker, 30) || res.kicker,
      titulo: corta(t.titulo, 60) || res.titulo,
      apoio: corta(t.apoio, 120),
      cta: corta(t.cta, 40),
      foto: ['minha', 'gerar', 'nenhuma'].includes(t.foto) ? t.foto : res.foto,
      base,
      descricaoFoto: corta(t.descricaoFoto, 400) || res.descricaoFoto,
    };
  }
  const mensagens = {};
  escopo.telas.forEach((tela, i) => {
    // O que o cliente escreveu no letreiro vence a IA: ele mandou, ele quer.
    const daIA = (x.mensagens && Array.isArray(x.mensagens[i]) ? x.mensagens[i] : []).map((m) => corta(m, 80)).filter(Boolean).slice(0, 8);
    mensagens[i] = tela.zonas.rodape.mensagens.length ? tela.zonas.rodape.mensagens : (daIA.length ? daIA : reserva.mensagens[i]);
  });
  return {
    nome: corta(escopo.nome, 60) || corta(x.nome, 60) || reserva.nome,
    direcao: ds.DIRECOES[x.direcao] ? x.direcao : 'chapado',
    estilo: ESTILOS.includes(x.estilo) ? x.estilo : 'vibrante',
    vagas: vagasOut,
    mensagens,
  };
}

/* ---------------- 3. As fotos ---------------- */

/*
 * A regra do cliente manda, vaga por vaga:
 *   minhas   só a foto da empresa (a que a IA escolheu, ou a próxima do acervo)
 *   gerar    a IA gera, mesmo havendo fotos da empresa
 *   mistura  a da empresa quando a IA escolheu uma; senão, gera
 *   nenhuma  sem foto
 */
function decidirFoto(v, t, imagens, bases, n) {
  if (!levaFoto(v) || imagens === 'nenhuma') return { tipo: 'nenhuma' };
  if (imagens === 'minhas') {
    if (!bases.length) return { tipo: 'nenhuma', porque: 'a empresa ainda não tem fotos no acervo' };
    return { tipo: 'minha', url: bases[t.base != null ? t.base : n % bases.length].url };
  }
  if (imagens === 'mistura' && t.foto === 'minha' && t.base != null) return { tipo: 'minha', url: bases[t.base].url };
  if (imagens === 'mistura' && t.foto === 'nenhuma') return { tipo: 'nenhuma' };
  return { tipo: 'gerar', descricao: t.descricaoFoto || t.titulo };
}

/* ---------------- 5. Horários ---------------- */

const dois = (n) => String(n).padStart(2, '0');
const emISO = (d) => d.getFullYear() + '-' + dois(d.getMonth() + 1) + '-' + dois(d.getDate());

/*
 * O horário vira o `agendamento` que o player já entende (js/player.js). As
 * peças da principal e da lateral se revezam pelos horários, na ordem: com
 * "manhã café, tarde lanche", a primeira peça vai de manhã, a segunda à
 * tarde. O período da campanha vira a validade: no fim, a TV volta ao que era.
 */
function agendamentoDe(h, periodo, hoje) {
  const f = h && h.faixa ? director.FAIXAS[h.faixa] : null;
  const horaInicio = h ? (h.inicio || (f && f.horaInicio) || '') : '';
  const horaFim = h ? (h.fim || (f && f.horaFim) || '') : '';
  const dataFim = (periodo && periodo.fim) || '';
  if (!horaInicio && !horaFim && !dataFim) return null;
  return {
    ativo: true,
    dataInicio: (periodo && periodo.inicio) || emISO(hoje || new Date()),
    dataFim, dias: [], horaInicio, horaFim,
  };
}

/* ---------------- As partes, para o gerador e o ajuste ---------------- */

/*
 * Os textos das vagas, numa chamada só. `ajuste` é o pedido de mudança do
 * cliente (EXECUTOR item 26), que vai junto quando só algumas vagas são
 * escritas de novo.
 */
async function escreverTextos(escopo, vagas, ctx, bases, ajuste) {
  if (ai.mode() === 'dev') return lerTextos(textosSemIA(escopo, vagas), escopo, vagas, bases);
  const pedido = pedidoDosTextos(escopo, vagas, ctx)
    + (ajuste ? '\n\nAJUSTE PEDIDO PELO CLIENTE (escreva estas vagas de novo seguindo isto): ' + String(ajuste).slice(0, 400) : '');
  let r = null;
  try { r = ai.parseAiJson(await ai.callLLM(SISTEMA, pedido)); } catch (e) { r = null; }
  return lerTextos(r, escopo, vagas, bases);
}

// A identidade: a marca salva vence o modelo, como no diretor.
function identidadeDe(m, direcaoDoModelo, estilo) {
  const brand = ds.okHex((m.cores && m.cores[0]) || '', '#1e3a8a');
  const brand2 = ds.okHex((m.cores && m.cores[1]) || '', null) || ds.girarMatiz(brand, 35);
  const direcao = ds.DIRECOES[m.direcao] ? m.direcao : (ds.DIRECOES[direcaoDoModelo] ? direcaoDoModelo : 'chapado');
  return {
    identidade: { brand, brand2, direcao, estilo: estilo || 'vibrante' },
    modo: director.MODO_DA_DIRECAO[direcao] || 'escuro',
    marcaDaPeca: { cores: [brand, brand2], fonteTitulo: m.fonteTitulo || '', fonteApoio: m.fonteApoio || '' },
  };
}

/*
 * Uma vaga vira peça: o motor HTML no papel certo e, se ele falhar (ou sem
 * IA), a peça-ouro daquele papel. `ditos` são os títulos que já saíram,
 * para a peça nova não repetir.
 */
async function comporVaga(v, t, foto, { escopo, ctx, marcaDaPeca, modo, ditos }) {
  const m = ctx.marca || {};
  const tela = escopo.telas[v.tela];
  const base = {
    pedido: [escopo.objetivo, v.pedido].filter(Boolean).join(' — ') || escopo.nome,
    empresa: ctx.empresa || '', segmento: ctx.segmento || '', marca: marcaDaPeca, modo,
    papel: v.papel, foto: foto || null, logo: m.logo || '', indice: v.indice,
    // O que só a faixa tem: a contagem do rodapé e as chamadas do cabeçalho (item 22).
    contagem: v.zona === 'rodape' && tela ? tela.zonas.rodape.contagem : '',
    chamadas: v.zona === 'cabecalho' && tela ? tela.zonas.cabecalho.mensagens : [],
    textos: { kicker: t.kicker, titulo: t.titulo, apoio: t.apoio, cta: t.cta },
    evitar: (ditos || []).slice(0, 20),
  };
  let r = null;
  if (ai.mode() !== 'dev') {
    try { r = await compositor.comporPeca(Object.assign({ motor: compositor.motorDoHtml() }, base)); }
    catch (e) { r = null; }
  }
  const item = r && r.ok ? r.item : compositor.preencherPapel(base);
  return { vaga: v.id, zona: v.zona, papel: v.papel, formato: v.formato, label: t.titulo.slice(0, 40),
    item: Object.assign({}, item, { formato: v.formato }), motor: r && r.ok ? 'html' : 'ouro', comFoto: !!foto };
}

/* ---------------- O gerador ---------------- */

async function gerar(escopoCru, ctx, { onImagem, onProgresso, agora } = {}) {
  ctx = ctx || {};
  const passo = (etapa, detalhe) => { try { onProgresso && onProgresso(etapa, detalhe || ''); } catch (e) { /* progresso não derruba */ } };
  const escopo = E.normalizar(escopoCru);
  const vagas = vagasDoEscopo(escopo, ctx.telas);
  if (!vagas.length && !escopo.telas.some((t) => t.zonas.rodape.mensagens.length)) {
    const e = new Error('o pedido ainda não tem nada para criar'); e.status = 400; throw e;
  }
  const m = ctx.marca || {};
  const bases = (m.bases || []).filter((b) => b && b.url);

  // 2. Os textos, de uma vez.
  passo('escrevendo a campanha', vagas.length + ' peças');
  const textos = await escreverTextos(escopo, vagas, ctx, bases);
  const { identidade, modo, marcaDaPeca } = identidadeDe(m, textos.direcao, textos.estilo);

  // 3. As fotos.
  const fotos = {};
  const semFoto = [];
  const aGerar = [];
  vagas.forEach((v, n) => {
    const d = decidirFoto(v, textos.vagas[v.id], escopo.imagens, bases, n);
    if (d.tipo === 'minha') fotos[v.id] = d.url;
    else if (d.tipo === 'gerar') aGerar.push({ v, d });
    else if (d.porque) semFoto.push({ vaga: v.id, porque: d.porque });
  });
  let feitas = 0;
  for (const { v, d } of aGerar) {
    passo('gerando as fotos', ++feitas + ' de ' + aGerar.length);
    if (!onImagem) { semFoto.push({ vaga: v.id, porque: 'sem gerador de fotos' }); continue; }
    try {
      fotos[v.id] = await onImagem(d.descricao, v.formato, identidade);
    } catch (e) {
      // Sem a foto, a peça sai sem ela e o resto segue: derrubar tudo jogaria fora o que já foi pago.
      semFoto.push({ vaga: v.id, porque: String((e && e.message) || 'a foto não saiu') });
    }
  }

  // 4. As peças.
  const pecas = {};
  const ditos = [];
  let n = 0;
  for (const v of vagas) {
    passo('desenhando as peças', ++n + ' de ' + vagas.length + ' · ' + (E.NOME_ZONA[v.zona] || 'redes'));
    const t = textos.vagas[v.id];
    pecas[v.id] = await comporVaga(v, t, fotos[v.id], { escopo, ctx, marcaDaPeca, modo, ditos });
    ditos.push(t.titulo);
  }

  // 5. A programação: os horários se revezam entre as peças da principal e da lateral.
  const hoje = agora || new Date();
  const telas = escopo.telas.map((t, ti) => {
    const daZona = (zona) => vagas.filter((v) => v.tela === ti && v.zona === zona).map((v) => pecas[v.id]);
    const comHorario = (lista) => lista.map((p, i) => {
      const ag = agendamentoDe(escopo.horarios.length ? escopo.horarios[i % escopo.horarios.length] : null, escopo.periodo, hoje);
      return ag ? { ...p, item: { ...p.item, agendamento: ag }, horario: escopo.horarios[i % escopo.horarios.length] || null } : p;
    });
    return {
      alvo: t.alvo, nome: t.nome, layout: t.layout,
      zonas: {
        principal: comHorario(daZona('principal')),
        lateral: comHorario(daZona('lateral')),
        /*
         * As chamadas do cabeçalho: as que o cliente escreveu, ou os títulos
         * das próprias peças dele. Peça de cabeçalho com chamadas girando e
         * nenhuma chamada passaria vazia na TV.
         */
        cabecalho: {
          pecas: daZona('cabecalho'), vivos: t.zonas.cabecalho.vivos,
          mensagens: t.zonas.cabecalho.mensagens.length ? t.zonas.cabecalho.mensagens
            : daZona('cabecalho').map((p) => textos.vagas[p.vaga].titulo).filter(Boolean),
        },
        rodape: {
          pecas: daZona('rodape'), vivos: t.zonas.rodape.vivos, contagem: t.zonas.rodape.contagem,
          mensagens: t.zonas.rodape.pecas || t.zonas.rodape.mensagens.length ? (textos.mensagens[ti] || []) : [],
        },
      },
    };
  });

  // As redes: a partir da peça principal (ou da feita só para elas).
  let social = null;
  const canais = E.REDES.filter((r) => escopo.redes[r]);
  if (canais.length) {
    passo('escrevendo para as redes', canais.length + ' canais');
    const v = vagas.find((x) => x.zona === 'principal') || vagas.find((x) => x.zona === 'redes') || vagas[0];
    const base = v && pecas[v.id];
    const t = v ? textos.vagas[v.id] : { titulo: escopo.nome, apoio: escopo.objetivo };
    let textosRedes = null;
    try {
      textosRedes = await redes.gerar({
        headline: t.titulo, sub: t.apoio, cta: t.cta, kicker: t.kicker, pedido: escopo.objetivo,
        empresa: ctx.empresa || '', tom: m.tom || '', ramo: ctx.ramo || '',
        endereco: (ctx.local && ctx.local.endereco) || '', bairro: (ctx.local && ctx.local.bairro) || '',
        cidade: (ctx.local && ctx.local.cidade) || '', link: (ctx.local && ctx.local.link) || '',
      }, hoje);
    } catch (e) { textosRedes = null; }
    social = { canais, peca: base ? base.vaga : null, textos: textosRedes };
  }

  return {
    versao: 1,
    nome: textos.nome,
    identidade,
    telas,
    social,
    horarios: escopo.horarios,
    periodo: escopo.periodo,
    semFoto,
    contagem: { pecas: vagas.length, fotosGeradas: aGerar.filter(({ v }) => fotos[v.id]).length },
    // Só o que a biblioteca mostra bem: as peças da principal, da lateral e das redes.
    biblioteca: vagas.filter(levaFoto).map((v) => ({ formato: v.formato, canal: v.zona === 'redes' ? 'Feed' : 'TV', label: pecas[v.id].label, item: pecas[v.id].item })),
  };
}

module.exports = {
  gerar, vagasDoEscopo, decidirFoto, agendamentoDe, textosSemIA, lerTextos, pedidoDosTextos, SISTEMA, levaFoto,
  escreverTextos, identidadeDe, comporVaga, PAPEL_DA_ZONA,
};
