/*
 * server/ajuste-tela.js — a IA troca layout e tema (EXECUTOR D28).
 *
 * "Lateral do outro lado", "tema claro", "fundo azul", "tira o relógio",
 * "clima de Curitiba". A pessoa diz como falaria; daqui sai a LISTA DE
 * MUDANÇAS, cada uma conferida contra o que existe de verdade (os layouts de
 * js/templates.js que cabem nesta TV, os temas de js/theme.js, as fontes).
 * Nada é gravado aqui: o painel aplica no rascunho, mostra antes e depois,
 * e só vai para a TV com o Publicar.
 *
 * Sem IA (localhost e quando ela cai), uma regra entende as frases comuns.
 */
const ai = require('./ai');
const L = require('../js/templates.js');
const T = require('../js/theme.js');

const MARCAS_DE_ACENTO = new RegExp('[' + String.fromCharCode(0x300) + '-' + String.fromCharCode(0x36f) + ']', 'g');
const CONTROLE = new RegExp('[' + String.fromCharCode(0) + '-' + String.fromCharCode(31) + String.fromCharCode(127) + ']', 'g');
const corta = (s, n) => String(s == null ? '' : s).replace(CONTROLE, ' ').replace(/\s+/g, ' ').trim().slice(0, n);
// Sem acento e em minúsculas, do MESMO tamanho do texto (NFC): a posição de um achado vale no original.
const plano = (t) => t.normalize('NFD').replace(MARCAS_DE_ACENTO, '').toLowerCase();
const HEX = /^#[0-9a-f]{6}$/i;

const orientacaoDe = (l) => (l && l.orientation) || 'landscape';
function cabe(id, orient) {
  const l = L.LAYOUTS.find((x) => x.id === id);
  if (!l) return false;
  const o = orientacaoDe(l);
  return o === 'any' || o === (orient || 'landscape');
}
const temZona = (id, tipo) => { const l = L.getLayout(id); return l.zones.some((z) => (tipo === 'lateral' ? /^(lateral|info)$/.test(z.id) : z.type === tipo)); };

// Os caminhos de um layout para outro, pelo que a pessoa pede. Mesmas zonas sempre que dá.
const CAMINHOS = {
  outroLado: { dashboard: 'sidebar-right', 'sidebar-right': 'dashboard', corporate: 'dashboard', 'video-dynamic': 'dashboard' },
  esquerda: { 'sidebar-right': 'dashboard', corporate: 'dashboard', 'video-dynamic': 'dashboard' },
  direita: { dashboard: 'sidebar-right' },
  semLateral: { dashboard: 'full-ticker', 'sidebar-right': 'full-ticker', corporate: 'header-main-ticker', 'video-dynamic': 'full-ticker' },
  comLateral: { full: 'sidebar-right', 'full-ticker': 'sidebar-right', 'header-main-ticker': 'corporate' },
  semCabecalho: { corporate: 'sidebar-right', 'header-main-ticker': 'full-ticker', 'portrait-stack': 'portrait-duo', 'square-header': 'square-hero' },
  comCabecalho: { dashboard: 'corporate', 'sidebar-right': 'corporate', 'video-dynamic': 'corporate', full: 'header-main-ticker', 'full-ticker': 'header-main-ticker', quad: 'header-main-ticker', 'portrait-hero': 'portrait-stack', 'portrait-duo': 'portrait-stack', 'square-hero': 'square-header', 'square-split': 'square-header' },
  semRodape: { 'full-ticker': 'full' },
  comRodape: { full: 'full-ticker' },
};

// Fundo: cores de palco (escuras ou bem claras, nunca meio-tom que briga com a peça).
const CORES_DE_FUNDO = {
  'azul marinho': '#0b1f44', 'azul escuro': '#0f2557', 'azul claro': '#dbeafe', azul: '#1e3a8a',
  'verde escuro': '#0f3d2e', 'verde claro': '#dcfce7', 'verde agua': '#ccfbf1', verde: '#14532d',
  vermelho: '#7f1d1d', vinho: '#4c0519', bordo: '#5b0f1b',
  preto: '#0a0a0a', branco: '#ffffff', 'cinza claro': '#e5e7eb', 'cinza escuro': '#1f2937', cinza: '#374151', grafite: '#1f2328',
  bege: '#f5efe8', creme: '#fdf6e3', 'rosa escuro': '#831843', rosa: '#fce7f3', laranja: '#9a3412', amarelo: '#fef3c7',
  roxo: '#3b0764', lilas: '#ede9fe', marrom: '#3f2a1d', dourado: '#a16207', turquesa: '#115e59',
};
// Destaque: cores vivas (o painel acerta o tom para ler sobre o fundo).
const CORES_DE_DESTAQUE = {
  'verde agua': '#2dd4bf', azul: '#3b82f6', verde: '#22c55e', vermelho: '#ef4444', laranja: '#f97316', amarelo: '#facc15',
  rosa: '#ec4899', roxo: '#a855f7', dourado: '#d4af37', branco: '#ffffff', turquesa: '#14b8a6', lilas: '#c084fc', preto: '#111111',
};
const nomesDe = (m) => Object.keys(m).sort((a, b) => b.length - a.length).join('|');

// "tema dourado", "estilo neon": o nome que a pessoa usa para cada tema pronto.
const APELIDOS = [
  [/dark premium|azul premium/, 'dark-premium'],
  [/corporate blue|azul corporativo|\bazul\b/, 'corporate-blue'],
  [/luxury|gold|dourad|luxo/, 'luxury-gold'],
  [/neon|cyber/, 'neon-cyber'],
  [/glass|vidro|fosco/, 'glassmorphism'],
  [/minimal|\bbranco\b/, 'minimal-white'],
  [/elegant|elegante|\bpreto\b/, 'elegant-black'],
  [/energy|\bverde\b/, 'energy-green'],
  [/purple|\broxo\b/, 'modern-purple'],
  [/clinica|saude|consultorio|hospital/, 'clinica-suave'],
  [/corporativo claro|escritorio/, 'corporativo-claro'],
  [/varejo|quente|laranja/, 'varejo-quente'],
];

const FONTES = { inter: 'inter', poppins: 'poppins', montserrat: 'montserrat', roboto: 'roboto', 'space grotesk': 'space-grotesk', 'do sistema': 'system', padrao: 'system' };

const TIRAR = '(?:tira|tirar|tire|remove|remover|retira|retirar|esconde|esconder|apaga|apagar|oculta|ocultar|desliga|desligar|sem)';
const POR = '(?:poe|por|coloca|colocar|coloque|adiciona|adicionar|adicione|mostra|mostrar|mostre|volta|voltar|liga|ligar|inclui|incluir|ativa|ativar|com|quero)';
const ART = '(?:\\s+(?:o|a|os|as|um|uma))?';

// O que vem depois do verbo, em lista: "tira o relógio e o clima" → relogio, clima.
const COISAS = 'relogio|hora|clima|temperatura|previsao';
function doVerbo(s, verbo) {
  const re = new RegExp(verbo + '((?:' + ART + '\\s+(?:' + COISAS + ')\\b(?:\\s*(?:,|\\be\\b))?)+)', 'g');
  const out = new Set();
  for (let x = re.exec(s); x; x = re.exec(s)) {
    for (const w of x[1].match(new RegExp(COISAS, 'g')) || []) out.add(/relogio|hora/.test(w) ? 'relogio' : 'clima');
  }
  return out;
}

// "santa bárbara d'oeste" → "Santa Bárbara d'Oeste"; "embu-guaçu" → "Embu-Guaçu" (nota do consultor no #253).
function capitalizar(t) {
  const maiuscula = (w) => w.charAt(0).toUpperCase() + w.slice(1);
  return t.split(' ').map((w, i) => {
    if (i > 0 && /^(de|da|do|das|dos|e)$/i.test(w)) return w.toLowerCase();
    const apostrofo = /^(d)'(.+)$/i.exec(w);
    if (i > 0 && apostrofo) return "d'" + maiuscula(apostrofo[2]);
    // "del-Rei", "Embu-Guaçu": partícula fica minúscula, o resto ganha maiúscula.
    return w.split('-').map((x, j) => ((i > 0 || j > 0) && /^(de|da|do|das|dos|del)$/i.test(x) ? x.toLowerCase() : maiuscula(x))).join('-');
  }).join(' ');
}

/*
 * Sem IA: cada pedaço do pedido vira uma mudança. Várias numa frase só
 * ("tema claro e sem relógio").
 */
function semIA(texto, atual) {
  const t = corta(texto, 400).normalize('NFC');
  const s = plano(t);
  const m = {};
  const lay = (atual && atual.layoutId) || 'dashboard';
  const caminho = (nome) => CAMINHOS[nome][lay] || null;

  // Layout
  if (/tela (toda|inteira|cheia)/.test(s)) m.layoutId = /com (o )?(rodape|noticias|letreiro)/.test(s) ? 'full-ticker' : 'full';
  else if (/mosaico|2x2|quatro (partes|zonas)/.test(s)) m.layoutId = 'quad';
  else if (/(lateral|barra)/.test(s) && /(outro lado|inverte|inverter|espelha|troca(r)? (ela )?de lado|muda(r)? (ela )?de lado)/.test(s)) m.layoutId = caminho('outroLado');
  else if (/(lateral|barra)[^,.;]*\besquerda\b|\besquerda\b[^,.;]*(lateral|barra)/.test(s)) m.layoutId = caminho('esquerda') || (lay === 'dashboard' ? '' : null);
  else if (/(lateral|barra)[^,.;]*\bdireita\b|\bdireita\b[^,.;]*(lateral|barra)/.test(s)) m.layoutId = caminho('direita') || (/^(sidebar-right|corporate|video-dynamic)$/.test(lay) ? '' : null);
  else if (new RegExp(TIRAR + ART + '\\s+(?:barra\\s+)?lateral').test(s)) m.layoutId = caminho('semLateral');
  else if (new RegExp(POR + ART + '\\s+(?:barra\\s+)?lateral').test(s)) m.layoutId = caminho('comLateral');
  if (m.layoutId === undefined) {
    if (new RegExp(TIRAR + ART + '\\s+cabecalho').test(s)) m.layoutId = caminho('semCabecalho');
    else if (new RegExp(POR + ART + '\\s+cabecalho').test(s)) m.layoutId = caminho('comCabecalho');
    else if (new RegExp(TIRAR + ART + '\\s+(?:rodape|letreiro|faixa de baixo)').test(s)) m.layoutId = caminho('semRodape');
    else if (new RegExp(POR + ART + '\\s+(?:rodape|letreiro|faixa de baixo)').test(s)) m.layoutId = caminho('comRodape');
  }
  // '' = já é assim; null = não há caminho. Os dois saem da lista; o null vira nota.
  const notas = [];
  if (m.layoutId === null) notas.push('Não há um layout assim para esta TV. Os layouts ficam em Ajustes da tela.');
  if (m.layoutId === '') notas.push('A lateral já está desse lado.');
  if (!m.layoutId) delete m.layoutId;

  // Tema e fundo
  const corFundo = new RegExp('fundo\\s+(?:todo\\s+|toda\\s+)?(?:na cor\\s+|em\\s+|de\\s+|cor\\s+)?(#[0-9a-f]{6}|' + nomesDe(CORES_DE_FUNDO) + ')\\b').exec(s);
  if (corFundo) { m.fundo = 'cor'; m.fundoCor = corFundo[1].startsWith('#') ? corFundo[1] : CORES_DE_FUNDO[corFundo[1]]; }
  else if (/(fundo|tema|tela|versao|modo|tudo)\s+(mais\s+)?(claro|clara)\b|mais clar[oa]\b|modo light/.test(s)) m.fundo = 'claro';
  else if (/(fundo|tema|tela|versao|modo|tudo)\s+(mais\s+)?(escuro|escura)\b|mais escur[oa]\b|modo dark/.test(s)) m.fundo = 'escuro';
  else if (/(fundo|combina\w*)\s+(das|com as|igual (as|a das))\s+pecas/.test(s)) m.fundo = 'pecas';

  if (/(cores?|tema|cara|visual)\s+da\s+(minha\s+|nossa\s+)?(marca|empresa)|cores da empresa/.test(s)) m.tema = 'marca';
  else {
    const pedeTema = /(\btema|\bestilo|\bvisual)\s+(\w+\s+)?([a-z]+)/.exec(s);
    if (pedeTema) {
      const resto = s.slice(pedeTema.index);
      const achado = APELIDOS.find(([re]) => re.test(resto.split(/[,.;]| e /)[0]));
      if (achado && !(/^(claro|clara|escuro|escura)$/.test(pedeTema[3]) && !pedeTema[2])) m.tema = achado[1];
    }
  }

  const destaque = new RegExp('(?:destaques?|detalhes?|cor de destaque)\\s+(?:em\\s+|na cor\\s+|de\\s+)?(#[0-9a-f]{6}|' + nomesDe(CORES_DE_DESTAQUE) + ')\\b').exec(s);
  if (destaque) m.destaque = destaque[1].startsWith('#') ? destaque[1] : CORES_DE_DESTAQUE[destaque[1]];

  const fonte = new RegExp('(?:fonte|letra)\\s+(?:a\\s+|da\\s+|do\\s+)?(' + Object.keys(FONTES).join('|') + ')\\b').exec(s);
  if (fonte) m.fonte = FONTES[fonte[1]];

  // Relógio e clima ("tira o relógio e o clima": um verbo, duas coisas)
  const tirar = doVerbo(s, TIRAR);
  const por = doVerbo(s, POR);
  if (tirar.has('relogio')) m.relogio = false;
  else if (por.has('relogio')) m.relogio = true;
  if (tirar.has('clima')) m.clima = false;
  else if (por.has('clima')) m.clima = true;
  const cidade = /(?:clima|temperatura|previsao(?: do tempo)?)\s+(?:de|em|para|da|do)\s+([a-z][a-z .'-]{1,38}?)(?=$|[,.;!?]|\s+e\s|\s+com\s|\s+sem\s)/.exec(s);
  if (cidade && m.clima !== false) {
    const ini = cidade.index + cidade[0].length - cidade[1].length;
    m.cidadeClima = capitalizar(corta(t.slice(ini, ini + cidade[1].length), 40));
    m.clima = true;
  }
  return { mudancas: m, notas };
}

/*
 * A mudança que a TV não consegue mostrar vira outra ou vira nota: clima
 * pedido numa tela sem cabeçalho ganha o cabeçalho (a pessoa vê na prévia e
 * decide); o que não tem caminho é dito, não inventado.
 */
function completar(m, notas, atual) {
  const orient = (atual && atual.orientacao) || 'landscape';
  if (m.layoutId && !cabe(m.layoutId, orient)) { notas.push('Este layout não serve para esta TV.'); delete m.layoutId; }
  const destino = m.layoutId || (atual && atual.layoutId) || 'dashboard';
  if (m.clima === true && !temZona(destino, 'header')) {
    const com = CAMINHOS.comCabecalho[destino];
    if (com && cabe(com, orient)) { m.layoutId = com; notas.push('O clima aparece no cabeçalho: a tela ganha um.'); }
    else { delete m.clima; notas.push('Esta tela não tem cabeçalho, onde o clima aparece.'); }
  }
  if (m.clima === false && !temZona(m.layoutId || destino, 'header')) { delete m.clima; notas.push('Esta tela não mostra o clima.'); }
  if (m.relogio !== undefined && !temZona(m.layoutId || destino, 'header') && !temZona(m.layoutId || destino, 'ticker')) {
    delete m.relogio;
    notas.push('Esta tela não tem cabeçalho nem rodapé, onde o relógio aparece.');
  }
  if (m.layoutId === ((atual && atual.layoutId) || 'dashboard')) delete m.layoutId;
  return { mudancas: m, notas };
}

const SISTEMA = `Você muda a APARÊNCIA de uma TV de uma empresa (layout e tema), pelo
pedido que a pessoa escreveu do jeito que fala. Não mexe no conteúdo.

Devolva SÓ o que o pedido muda (o resto fica de fora):
- layoutId: um dos LAYOUTS da lista (só os que cabem nesta TV);
- tema: um dos TEMAS da lista, ou "marca" (as cores da empresa);
- fundo: "pecas" | "claro" | "escuro" | "cor"; com "cor", fundoCor "#rrggbb";
- destaque: "#rrggbb" (a cor dos detalhes);
- fonte: uma das FONTES;
- relogio, clima: true (mostrar) | false (tirar);
- cidadeClima: a cidade do clima, se o pedido disser.
Para um tema que não existe ("tema de Natal"), use fundo "cor" com fundoCor e
destaque que combinem. Não invente o que o pedido não disse.
${require('./ia-pergunta').REGRA_DE_PERGUNTA}
Responda APENAS JSON, por exemplo: { "layoutId": "sidebar-right", "fundo": "claro", "relogio": false }`;

function normalizar(r, atual) {
  const out = {};
  if (!r || typeof r !== 'object') return out;
  const orient = (atual && atual.orientacao) || 'landscape';
  if (typeof r.layoutId === 'string' && cabe(r.layoutId, orient)) out.layoutId = r.layoutId;
  if (r.tema === 'marca' || (typeof r.tema === 'string' && T.PRESETS[r.tema])) out.tema = r.tema;
  if (['pecas', 'claro', 'escuro'].includes(r.fundo)) out.fundo = r.fundo;
  if (r.fundo === 'cor' && HEX.test(String(r.fundoCor || ''))) { out.fundo = 'cor'; out.fundoCor = String(r.fundoCor).toLowerCase(); }
  if (HEX.test(String(r.destaque || ''))) out.destaque = String(r.destaque).toLowerCase();
  if (typeof r.fonte === 'string' && T.FONTS[r.fonte]) out.fonte = r.fonte;
  if (typeof r.relogio === 'boolean') out.relogio = r.relogio;
  if (typeof r.clima === 'boolean') out.clima = r.clima;
  const cidade = corta(r.cidadeClima, 40);
  if (cidade && /^[\p{L} .'-]+$/u.test(cidade)) { out.cidadeClima = cidade; if (out.clima !== false) out.clima = true; }
  return out;
}

/*
 * D51: sem nada que dê para mudar, pergunta — "muda a cor" pergunta qual; o
 * resto, o que mudar. A resposta completa o pedido ("muda o fundo" + "azul
 * marinho").
 */
function perguntaDaTela(pedido, atual) {
  const s = plano(corta(pedido, 400));
  // "muda a cor" + "azul marinho": a cor dita sem "fundo" é o fundo (a resposta à pergunta).
  const cor = Object.keys(CORES_DE_FUNDO).find((n) => new RegExp('(^|\\s)' + n + '($|[\\s,.;!?])').test(s));
  if (cor) return completar({ fundo: 'cor', fundoCor: CORES_DE_FUNDO[cor] }, [], atual);
  if (/\b(cor|cores|fundo)\b/.test(s)) {
    return { pergunta: 'Qual cor?', sugestoes: ['Azul marinho', 'Preto', 'Verde escuro', 'As cores da marca'] };
  }
  return { pergunta: 'O que você quer mudar na tela?', sugestoes: ['Tema claro', 'Lateral do outro lado', 'Sem relógio', 'Fundo azul marinho'] };
}
const vazia = (r) => !r || !r.mudancas || !Object.keys(r.mudancas).length;

// `historico` (D51): as falas anteriores. Devolve { mudancas, notas } ou { pergunta, sugestoes }.
async function entender(texto, atual, historico) {
  const P = require('./ia-pergunta');
  const pedido = P.pedidoDaConversa(historico, texto, ' ');
  const ditoAntes = semIA(pedido, atual);
  const so = completar(ditoAntes.mudancas, ditoAntes.notas, atual);
  if (ai.mode() === 'dev') return vazia(so) && !so.notas.length ? perguntaDaTela(pedido, atual) : so;
  try {
    const orient = (atual && atual.orientacao) || 'landscape';
    const layouts = L.LAYOUTS.filter((l) => cabe(l.id, orient)).map((l) => l.id + ': ' + l.name + ' (' + l.zones.map((z) => z.name.replace(/\s*\(.*\)$/, '')).join(', ') + ')');
    const usuario = [
      'ATUAL: layout ' + ((atual && atual.layoutId) || 'dashboard') + ', tema ' + ((atual && atual.tema) || 'dark-premium') + ', TV ' + (orient === 'portrait' ? 'em pé' : orient === 'square' ? 'quadrada' : 'deitada'),
      'LAYOUTS:\n' + layouts.join('\n'),
      'TEMAS: ' + Object.keys(T.PRESETS).map((id) => id + ' (' + T.PRESETS[id].label + ')').join(', '),
      'FONTES: ' + Object.keys(T.FONTS).join(', '),
      'CONVERSA:\n' + P.transcricao(historico, texto),
    ].join('\n');
    const r = ai.parseAiJson(await ai.callLLM(SISTEMA, usuario));
    const m = normalizar(r, atual);
    if (!Object.keys(m).length) {
      const pergunta = P.lerPergunta(r);
      if (pergunta) return pergunta;
      return vazia(so) && !so.notas.length ? perguntaDaTela(pedido, atual) : so;
    }
    return completar(m, [], atual);
  } catch (e) {
    return vazia(so) && !so.notas.length ? perguntaDaTela(pedido, atual) : so;
  }
}

module.exports = { entender, semIA, normalizar, completar, perguntaDaTela, CAMINHOS, CORES_DE_FUNDO, CORES_DE_DESTAQUE, SISTEMA };
