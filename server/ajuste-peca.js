/*
 * server/ajuste-peca.js — pedir à IA dentro da peça (EXECUTOR D20).
 *
 * "Deixa o título mais curto", "muda para vermelho", "tira o preço", "uma
 * fonte mais elegante". A IA devolve SÓ O QUE MUDA — um remendo —, e nunca
 * o HTML ou o CSS: a peça continua a mesma, o desenho que o dono aprovou
 * continua aprovado, e nada que o cliente não pediu muda.
 *
 * O que pode mudar é o que o editor de peça (D19) já deixa mudar à mão:
 * os textos dos campos que a peça declara, o estilo, as cores, as fontes do
 * catálogo e o que aparece. O código confere cada mudança antes de devolver;
 * o painel mostra a prévia e a pessoa aceita ou não.
 */
const P = require('../js/peca-html.js');
const T = require('../js/tokens.js');
const F = require('../js/fontes.js');
const ai = require('./ai');

const MODOS = T.MODOS.filter((m) => m !== 'rascunho');
const corta = (s, n) => String(s == null ? '' : s).replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);
// O mesmo teto do editor: o desenho foi feito para o tamanho do texto que trazia; uma vez e meia dá folga.
const limite = (atual) => Math.max(12, Math.ceil(String(atual || '').length * 1.5));

const SISTEMA = `Você ajusta UMA peça de TV de um pequeno negócio. O cliente pediu uma mudança.
Devolva SÓ o que muda — nada que ele não pediu. Você não redesenha a peça: troca
textos dos campos da lista, o estilo, as cores, as fontes e o que aparece.

Responda APENAS JSON (deixe de fora o que não muda):
{ "resposta": "uma frase, em português simples, dizendo o que mudou",
  "campos": { "nome_do_campo": "texto novo" },
  "modo": "escuro" | "claro" | "marca",
  "cores": ["#rrggbb", "#rrggbb"],
  "fonteTitulo": "id da lista", "fonteApoio": "id da lista",
  "esconder": ["nome_do_campo"], "mostrar": ["nome_do_campo"] }

Regras:
- Só nomes de campo da lista. O texto novo respeita o limite de cada campo.
- Não invente preço, telefone, endereço, data ou nome que o cliente não deu.
- Se o pedido não dá para fazer só com isso (outra foto, outro desenho), não
  mude nada e diga na resposta o que dá para pedir.`;

function pedidoParaIA(v, pedido) {
  const it = v.item;
  const campos = v.campos.filter((c) => c.tipo === 'texto').map((c) => {
    const atual = it.campos[c.nome] != null ? it.campos[c.nome] : c.exemplo;
    return `- ${c.nome}: "${corta(atual, 200)}" (até ${limite(atual)} letras)${(it.ocultos || []).includes(c.nome) ? ' [escondido]' : ''}`;
  });
  const fontes = Object.keys(F.FAMILIAS).map((id) => `${id} (${F.FAMILIAS[id].rotulo}: ${F.FAMILIAS[id].papel})`).join('; ');
  return ['CAMPOS DA PEÇA:', ...campos, '',
    'ESTILO ATUAL: ' + it.modo + ' · CORES: ' + ((it.marca && it.marca.cores) || []).join(', ')
      + ' · FONTES: título ' + ((it.marca && it.marca.fonteTitulo) || 'da marca') + ', texto ' + ((it.marca && it.marca.fonteApoio) || 'da marca'),
    'FONTES DISPONÍVEIS: ' + fontes, '', 'PEDIDO DO CLIENTE: ' + corta(pedido, 500)].join('\n');
}

/*
 * A peneira: o que a IA devolve vira remendo só se apontar para o que
 * existe e couber. Devolve { remendo, mudou } — `mudou` lista o que mudou,
 * para a frase de resposta não prometer o que foi recusado.
 */
function lerRemendo(r, v) {
  const it = v.item;
  const porNome = {};
  v.campos.forEach((c) => { porNome[c.nome] = c; });
  const remendo = {};
  const mudou = [];
  const campos = {};
  for (const [k, val] of Object.entries((r && r.campos && typeof r.campos === 'object') ? r.campos : {})) {
    const def = porNome[k];
    if (!def || def.tipo !== 'texto') continue;
    const atual = it.campos[k] != null ? it.campos[k] : def.exemplo;
    const novo = corta(val, limite(atual));
    if (novo && novo !== atual) campos[k] = novo;
  }
  if (Object.keys(campos).length) { remendo.campos = campos; mudou.push('texto'); }
  if (r && MODOS.includes(r.modo) && r.modo !== it.modo) { remendo.modo = r.modo; mudou.push('estilo'); }
  const cores = (Array.isArray(r && r.cores) ? r.cores : []).map((c) => String(c || '').toLowerCase()).filter((c) => /^#[0-9a-f]{6}$/.test(c)).slice(0, 3);
  const marca = {};
  if (cores.length) { marca.cores = cores; mudou.push('cores'); }
  for (const qual of ['fonteTitulo', 'fonteApoio']) {
    if (r && F.FAMILIAS[r[qual]]) { marca[qual] = r[qual]; if (!mudou.includes('fonte')) mudou.push('fonte'); }
  }
  if (Object.keys(marca).length) remendo.marca = marca;
  // O preço anda junto: esconder "o preço" e deixar ",90" e "10x de" na peça não é esconder.
  const JUNTOS = { preco: ['centavos', 'preco-rotulo', 'parcelas'] };
  const comJuntos = (lista) => lista.concat(...lista.map((n) => JUNTOS[n] || []));
  const ocultaveis = (lista) => comJuntos(Array.isArray(lista) ? lista : []).filter((n) => porNome[n] && porNome[n].tipo !== 'img');
  const esconder = ocultaveis(r && r.esconder);
  const mostrar = ocultaveis(r && r.mostrar);
  if (esconder.length || mostrar.length) {
    const antes = it.ocultos || [];
    const ocultos = Array.from(new Set(antes.concat(esconder))).filter((n) => !mostrar.includes(n));
    // Nunca esconder tudo: sobra pelo menos um texto na peça.
    const textos = v.campos.filter((c) => c.tipo === 'texto' || c.tipo === 'qr').map((c) => c.nome);
    if (textos.some((n) => !ocultos.includes(n)) && JSON.stringify(ocultos) !== JSON.stringify(antes)) {
      remendo.ocultos = ocultos;
      mudou.push('elementos');
    }
  }
  return { remendo, mudou };
}

/*
 * Sem IA (modo dev, e quando a IA cai): as frases comuns funcionam. É o que
 * deixa o fluxo inteiro testável no localhost.
 */
const CORES = {
  vermelh: ['#b3261e', '#f2c14e'], azul: ['#1b3a6b', '#f2a541'], verde: ['#1f6f4a', '#f2c14e'], amarel: ['#f2c14e', '#1d1d1f'],
  pret: ['#111318', '#f2a541'], roxo: ['#4b2a7a', '#f2c14e'], laranja: ['#e8590c', '#1d1d1f'], rosa: ['#c2185b', '#fde2ea'],
};
const FONTES = { elegante: 'serifada', moderna: 'moderna', chamativa: 'display', forte: 'display', 'à mão': 'manuscrita', manuscrita: 'manuscrita', 'mais leve': 'sans', arredondada: 'amigavel' };
const CAMPO_DA_PALAVRA = { chamada: 'kicker', 'chamada pequena': 'kicker', apoio: 'apoio', 'texto de apoio': 'apoio', preço: 'preco', preco: 'preco', selo: 'selo', botão: 'cta', cta: 'cta', endereço: 'endereco', observação: 'nota', nota: 'nota', data: 'quando' };

function semIA(pedido, v) {
  const t = String(pedido || '').toLowerCase();
  const r = { campos: {} };
  const titulo = /t[íi]tulo\s*(?:para|:|=)?\s*["“']?([^"”']{2,60})["”']?\s*$/i.exec(String(pedido || ''));
  if (titulo && /(muda|troca|põe|poe|coloca)/.test(t)) r.campos.titulo = titulo[1].trim();
  for (const [k, cores] of Object.entries(CORES)) if (new RegExp('\\b' + k).test(t)) { r.cores = cores; break; }
  if (/\b(fundo )?claro\b/.test(t)) r.modo = 'claro';
  else if (/\b(fundo )?escuro\b/.test(t)) r.modo = 'escuro';
  for (const [k, id] of Object.entries(FONTES)) if (t.includes('fonte') && t.includes(k)) { r.fonteTitulo = id; break; }
  const tira = /(?:tira|esconde|some com|sem)\s+(?:o |a )?([a-zçãéêó ]+?)(?:$|[,.])/.exec(t);
  if (tira && CAMPO_DA_PALAVRA[tira[1].trim()]) r.esconder = [CAMPO_DA_PALAVRA[tira[1].trim()]];
  const volta = /(?:volta|mostra|p[õo]e de volta)\s+(?:o |a )?([a-zçãéêó ]+?)(?:$|[,.])/.exec(t);
  if (volta && CAMPO_DA_PALAVRA[volta[1].trim()]) r.mostrar = [CAMPO_DA_PALAVRA[volta[1].trim()]];
  return r;
}

const FRASE = { texto: 'troquei o texto', estilo: 'mudei o estilo', cores: 'troquei as cores', fonte: 'troquei a fonte', elementos: 'mudei o que aparece' };
const AJUDA = 'Dá para pedir, por exemplo: "muda o título para Promoção de inverno", "deixa vermelho", "fonte mais elegante" ou "tira o preço".';

/*
 * Entende o pedido e devolve { resposta, remendo, mudou }. A peça que chega
 * passa pela porta antes de qualquer coisa.
 */
async function ajustar(item, pedido) {
  const v = P.validarItem(item);
  if (v.problemas.length) { const e = new Error('peça inválida: ' + v.problemas[0]); e.status = 400; throw e; }
  let bruto = null;
  let resposta = '';
  if (ai.mode() !== 'dev') {
    try {
      bruto = ai.parseAiJson(await ai.callLLM(SISTEMA, pedidoParaIA(v, pedido)));
      resposta = corta(bruto && bruto.resposta, 300);
    } catch (e) { bruto = null; }
  }
  if (!bruto) bruto = semIA(pedido, v);
  const { remendo, mudou } = lerRemendo(bruto, v);
  if (!mudou.length) return { resposta: resposta && !/mud|troc/i.test(resposta) ? resposta + ' ' + AJUDA : 'Não achei o que mudar. ' + AJUDA, remendo: {}, mudou };
  const frase = mudou.map((m) => FRASE[m]).join(', ');
  return { resposta: resposta || ('Pronto: ' + frase + '.'), remendo, mudou };
}

module.exports = { ajustar, lerRemendo, semIA, pedidoParaIA, SISTEMA };
