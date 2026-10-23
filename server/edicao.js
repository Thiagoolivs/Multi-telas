/*
 * server/edicao.js — EDITAR COM A IA, conversando (EXECUTOR D50).
 *
 * O dono, em 23/10: "se eu quiser editar, entro lá [em Criados], edito na mão,
 * ou abro um chat de edição com contexto e memória para não regredir" e "nos
 * ajustes, ela conversar até entender o que tem que fazer".
 *
 * O "Ajustar" de antes (server/ajuste.js) era uma frase só: entendia ou não,
 * e chutava quando o pedido era ambíguo ("troca a foto" — de qual peça?).
 * Aqui é uma conversa ligada à campanha:
 *
 *   - CONTEXTO: a IA lê as peças numeradas COM os textos de cada uma (é assim
 *     que ela sabe o que "o preço" ou "a frase de baixo" é), o que foi
 *     decidido na conversa que criou a campanha e o que foi decidido aqui.
 *   - PERGUNTA quando não entendeu, com respostas prontas ("A peça 2").
 *   - FAZ só o que foi pedido. A mudança mais comum — trocar um texto — não
 *     refaz a peça: muda só aquele campo ('texto', em server/ajuste.js).
 *   - MEMÓRIA: a conversa de edição fica guardada (conversas, tipo
 *     'edicao'); cada volta leva as últimas mensagens e as decisões.
 *
 * Quem aplica é server/ajuste.js (aplicar), com "Desfazer" de um passo.
 */
const ai = require('./ai');
const ajuste = require('./ajuste');
const conversa = require('./ai-conversa');
const refs = require('./referencias');
const E = require('../js/escopo.js');

const JANELA = 20;
const corta = (s, n) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim().slice(0, n);
const ACOES = ['fazer', 'perguntar', 'responder'];

const SISTEMA = `Você edita, CONVERSANDO, uma campanha de TV que já foi gerada para um
pequeno negócio brasileiro. A pessoa pede mudanças; você entende e faz SÓ o
que ela pediu. Nada que ela não pediu muda.

COMO CONVERSAR:
- Português simples, de lojista. Até 2 frases.
- Se o pedido for ambíguo (qual peça? qual texto? qual TV? trocar por o
  quê?), NÃO chute: pergunte UMA coisa, com 2 a 4 sugestões prontas na voz
  dela ("A peça 2", "As duas", "Pode ser essa").
- Quando entender, FAÇA: devolva as mudanças e diga numa frase o que mudou.
- Pergunta sobre a campanha ("o que tem na peça 3?"): responda sem mudar nada.
- Respeite O QUE JÁ FOI DECIDIDO (abaixo): não desfaça sem ela pedir. Decisão
  nova desta volta vai em "decisoes"; a antiga que ela mudou, igual a como
  estava, em "esquecer".

AS MUDANÇAS POSSÍVEIS (os números são os da lista de peças):
- {"tipo":"texto","peca":N,"campo":"nome do campo, como na lista","valor":"o texto novo, exato"}
  Troca SÓ aquele texto (preço, data, uma frase), sem refazer a peça. Prefira
  esta sempre que o pedido for de texto.
- {"tipo":"refazer","peca":N,"texto":"o que muda no texto, ou vazio","foto":"manter"|"trocar"|"tirar","descricaoFoto":"a cena nova, só se trocar"}
  Redesenha a peça (foto nova, outra ideia). Foto nova gasta uma criação do plano.
- {"tipo":"refazer","peca":N,"foto":"usar","ref":K}
  Põe na peça a IMAGEM K que a pessoa mandou nesta conversa (lista abaixo). É dela: não gasta criação.
- {"tipo":"acrescentar","tela":T,"zona":"principal"|"lateral"|"cabecalho"|"rodape","quantidade":1,"pedido":"o que a peça nova mostra"}
- {"tipo":"tirar","peca":N}
- {"tipo":"redes","canal":"instagramPost"|"instagramStory"|"whatsappStatus"|"whatsappMensagem"|"facebook"|"google","ligado":true|false}
- {"tipo":"letreiro","tela":T,"mensagens":["frase do rodapé"]}
- {"tipo":"contagem","tela":T,"ate":"AAAA-MM-DDTHH:MM" ou ""}

Responda APENAS JSON:
{
  "acao": "fazer" | "perguntar" | "responder",
  "resposta": "o que você diz para a pessoa",
  "sugestoes": ["resposta pronta na voz dela"],
  "mudancas": [ ...só com acao "fazer"... ],
  "decisoes": ["decisão nova, curta"],
  "esquecer": ["decisão antiga que ela mudou"]
}`;

// As peças como a pessoa vê, com os textos de cada uma: "o preço" vira "peça 2, campo preco".
function pecasParaIA(resultado) {
  return ajuste.numerar(resultado).map((x) => {
    const c = x.peca.item && x.peca.item.campos ? x.peca.item.campos : {};
    const textos = ajuste.camposDeTexto(x.peca).map((k) => k + ': "' + corta(c[k], 120) + '"');
    return `- peça ${x.n}: TV ${x.tela + 1}, ${E.NOME_ZONA[x.zona].toLowerCase()}${x.peca.comFoto ? ', com foto' : ', sem foto'} — ${textos.join('; ') || '"' + x.peca.label + '"'}`;
  }).join('\n');
}

function transcricao(mensagens) {
  const todas = (Array.isArray(mensagens) ? mensagens : []).filter((m) => m && !m.falha);
  return todas.slice(-JANELA).map((m) => (m.papel === 'ia' ? 'Você' : 'Pessoa') + ': ' + corta(m.texto, 600)).join('\n');
}

/* ---------------- Modo demonstração (sem chave de IA) ---------------- */
/*
 * Sem IA, as frases mais comuns: o caminho inteiro (perguntar e depois
 * fazer) dá para testar no localhost. "troca a foto" com mais de uma peça
 * pergunta qual; a resposta "A peça 2" completa o pedido que ficou pendente.
 */
// "A peça 2" ou só "2" (a resposta curta a "qual peça?").
const numeroDa = (t) => { const m = /pe[cç]a\s*(\d+)/i.exec(String(t || '')) || /^\s*(\d+)\s*[.!]?\s*$/.exec(String(t || '')); return m ? Number(m[1]) : 0; };
function precoDe(t) { const m = /r\$\s*\d+(?:[.,]\d{1,2})?/i.exec(String(t || '')); return m ? m[0].replace(/\s+/g, ' ').replace(/^r\$/i, 'R$') : ''; }

function semIA(texto, mensagens, resultado, referencias) {
  const imagens = Array.isArray(referencias) ? referencias : [];
  const t = String(texto || '').toLowerCase();
  const pecas = ajuste.numerar(resultado);
  const ultimaIa = [...(mensagens || [])].reverse().find((m) => m && m.papel === 'ia');
  const pendente = ultimaIa && ultimaIa.pendente;
  const n = numeroDa(t);
  const sugestoesDePeca = pecas.slice(0, 4).map((x) => 'A peça ' + x.n);

  // A resposta a uma pergunta minha ("A peça 2", "2"): completa o pedido que ficou pendente.
  // Só a frase que É a resposta: "tira a peça 5" é pedido novo, não a resposta.
  const soAPeca = /^\s*(?:(?:a|na|da)\s+)?(?:pe[cç]a\s*)?\d+\s*[.!]?\s*$/i.test(String(texto || ''));
  if (pendente && n && soAPeca) {
    if (pendente.tipo === 'foto') return fazer([{ tipo: 'refazer', peca: n, foto: 'trocar', texto: '' }], resultado);
    if (pendente.tipo === 'preco') return precoNa(n, pendente.valor, resultado);
    if (pendente.tipo === 'texto') return textoNa(n, pendente.campo, pendente.valor, resultado);
    if (pendente.tipo === 'usar') return fazer([{ tipo: 'refazer', peca: n, foto: 'usar', ref: pendente.ref }], resultado, imagens);
  }
  /*
   * "muda o texto da peça 2" sem dizer o texto novo: conversa até entender,
   * um passo por vez — qual texto (o título ou o de baixo), em qual peça e
   * o que escrever. Visto no teste do dono no navegador: sem a IA, a
   * resposta era uma lista de exemplos, e a pessoa ficava sem saber o que
   * fazer. A resposta que é um pedido novo ("tira a peça 5") não vira texto.
   */
  const pedidoNovo = /^\s*(?:mud|troc|tir|p[õo]e|coloc|acrescent|adicion|mais\s+uma|us[ae]\b|faz|refaz|apag)/i.test(String(texto || ''));
  const campoDaResposta = (s) => (/t[ií]tulo|cima|grande|chamada|principal/i.test(s) ? 'titulo'
    : /baixo|apoio|menor|pequen|descri|detalhe|subt/i.test(s) ? 'apoio' : '');
  const pedirValor = (peca, campo) => ({
    acao: 'perguntar', resposta: 'O que eu escrevo ' + (campo === 'titulo' ? 'no título' : 'no texto de baixo') + ' da peça ' + peca + '?',
    sugestoes: [], mudancas: [], pendente: { tipo: 'texto-valor', peca, campo },
  });
  const pedirPeca = (campo) => ({ acao: 'perguntar', resposta: 'Em qual peça?', sugestoes: sugestoesDePeca, mudancas: [], pendente: { tipo: 'texto-peca', campo } });
  if (pendente && pendente.tipo === 'texto-qual' && !pedidoNovo) {
    const campo = campoDaResposta(t);
    if (campo) return pendente.peca ? pedirValor(pendente.peca, campo) : pecas.length === 1 ? pedirValor(1, campo) : pedirPeca(campo);
  }
  if (pendente && pendente.tipo === 'texto-peca' && n && soAPeca) return pedirValor(n, pendente.campo);
  if (pendente && pendente.tipo === 'texto-valor' && !pedidoNovo && String(texto || '').trim()) {
    return textoNa(pendente.peca, pendente.campo, String(texto).trim().replace(/^["“']|["”']$/g, '').slice(0, 200), resultado);
  }
  const textoSemValor = /(?:mud|troc|alter|edit|corrig)\w*\s+(?:o\s+|a\s+)?(t[ií]tulo|texto|frase|chamada|escrita)/i.exec(String(texto || ''));
  if (textoSemValor && !/\s(?:para|por)\s*:?\s*\S/i.test(String(texto || '').slice(textoSemValor.index + textoSemValor[0].length))) {
    const campo = /t[ií]tulo|chamada/i.test(textoSemValor[1]) ? 'titulo' : '';
    const peca = n || (pecas.length === 1 ? 1 : null);
    if (!campo) {
      return { acao: 'perguntar', resposta: 'Qual texto' + (peca ? ' da peça ' + peca : '') + ': o título ou o de baixo?',
        sugestoes: ['O título', 'O texto de baixo'], mudancas: [], pendente: { tipo: 'texto-qual', peca } };
    }
    return peca ? pedirValor(peca, campo) : pedirPeca(campo);
  }
  // "usa a foto que eu mandei" (D45): a última imagem do produto (ou a última que veio).
  if (imagens.length && /(us[ae]|p[õo]e|coloc\w*)\s+(a |essa |esta |minha )?(foto|imagem)/.test(t)) {
    const k = imagens.map((r, i) => (r.uso === 'produto' ? i + 1 : 0)).filter(Boolean).pop() || imagens.length;
    if (n) return fazer([{ tipo: 'refazer', peca: n, foto: 'usar', ref: k }], resultado, imagens);
    if (pecas.length === 1) return fazer([{ tipo: 'refazer', peca: 1, foto: 'usar', ref: k }], resultado, imagens);
    return { acao: 'perguntar', resposta: 'Ponho a sua foto em qual peça?', sugestoes: sugestoesDePeca, mudancas: [], pendente: { tipo: 'usar', ref: k } };
  }
  // "muda o texto de baixo para: …", "troca o título por …": só aquele texto.
  const pedidoDeTexto = /(?:mud|troc|coloc|p[õo]e)\w*\s+(?:o\s+|a\s+)?(t[ií]tulo|texto|frase|chamada)[^:]*?(?:para|por)\s*:?\s*(.{2,200})$/i.exec(String(texto || '').trim());
  if (pedidoDeTexto) {
    const campo = /t[ií]tulo|chamada/i.test(pedidoDeTexto[1]) ? 'titulo' : 'apoio';
    const valor = pedidoDeTexto[2].trim().replace(/^["“']|["”']$/g, '');
    if (n) return textoNa(n, campo, valor, resultado);
    if (pecas.length === 1) return textoNa(1, campo, valor, resultado);
    return { acao: 'perguntar', resposta: 'Em qual peça eu troco esse texto?', sugestoes: sugestoesDePeca, mudancas: [], pendente: { tipo: 'texto', campo, valor } };
  }
  // Preço novo: na peça que tem preço (ou a que a pessoa disse); várias, pergunta.
  const preco = precoDe(texto);
  if (preco && /pre[cç]o|valor|custa|por r\$/.test(t)) {
    if (n) return precoNa(n, preco, resultado);
    const comPreco = pecas.filter((x) => ajuste.camposDeTexto(x.peca).some((k) => /r\$/i.test(x.peca.item.campos[k])));
    if (comPreco.length === 1) return precoNa(comPreco[0].n, preco, resultado);
    if (pecas.length === 1) return precoNa(1, preco, resultado);
    return { acao: 'perguntar', resposta: 'Em qual peça vai o preço ' + preco + '?', sugestoes: sugestoesDePeca, mudancas: [], pendente: { tipo: 'preco', valor: preco } };
  }
  // "troca a foto" sem dizer qual: com uma peça só, é ela; com várias, pergunta.
  if (/troc\w* (a |as )?fotos?/.test(t) && !n) {
    if (pecas.length === 1) return fazer([{ tipo: 'refazer', peca: 1, foto: 'trocar', texto: '' }], resultado);
    return { acao: 'perguntar', resposta: 'Troco a foto de qual peça?', sugestoes: sugestoesDePeca, mudancas: [], pendente: { tipo: 'foto' } };
  }
  const r = ajuste.semIA(texto, resultado);
  if (r.mudancas.length) return { acao: 'fazer', resposta: r.resposta, sugestoes: [], mudancas: r.mudancas };
  return { acao: 'responder', resposta: r.resposta, sugestoes: ['Troca a foto da peça 1', 'Mais uma peça na lateral'], mudancas: [] };
}
function fazer(mudancas, resultado, imagens) {
  const lidas = ajuste.lerMudancas(mudancas, resultado, { refs: imagens || [] });
  if (!lidas.length) return { acao: 'responder', resposta: 'Essa peça não existe. Diga o número que aparece ao lado dela.', sugestoes: [], mudancas: [] };
  return { acao: 'fazer', resposta: 'Feito: ' + lidas.map(ajuste.descreverMudanca).join('; ') + '.', sugestoes: [], mudancas: lidas };
}
// O texto pedido no campo pedido; se a peça não tem esse campo, no título (que toda peça tem).
function textoNa(n, campo, valor, resultado) {
  const x = ajuste.numerar(resultado)[n - 1];
  if (!x) return fazer([], resultado);
  const campos = ajuste.camposDeTexto(x.peca);
  return fazer([{ tipo: 'texto', peca: n, campo: campos.includes(campo) ? campo : (campos.includes('titulo') ? 'titulo' : campos[0]), valor }], resultado);
}
function precoNa(n, preco, resultado) {
  const x = ajuste.numerar(resultado)[n - 1];
  if (!x) return fazer([], resultado);
  const campos = ajuste.camposDeTexto(x.peca);
  // O campo que já tem preço; senão o de apoio; senão o título.
  const campo = campos.find((k) => /r\$/i.test(x.peca.item.campos[k])) || (campos.includes('preco') ? 'preco' : campos.includes('apoio') ? 'apoio' : 'titulo');
  const atual = String(x.peca.item.campos[campo] || '');
  const valor = /r\$\s*\d+(?:[.,]\d{1,2})?/i.test(atual) ? atual.replace(/r\$\s*\d+(?:[.,]\d{1,2})?/i, preco) : preco;
  return fazer([{ tipo: 'texto', peca: n, campo, valor }], resultado);
}

/*
 * Uma volta da edição. `mensagens` já inclui a fala nova da pessoa.
 * Devolve { acao, resposta, sugestoes, mudancas, decisoes, pendente?, modo }.
 */
async function conversar({ texto, mensagens, decisoes, campanha, referencias } = {}) {
  const resultado = (campanha && campanha.resultado) || { telas: [] };
  const antes = conversa.mesclarDecisoes(decisoes, [], []);
  if (ai.mode() === 'dev') {
    const r = semIA(texto, (mensagens || []).slice(0, -1), resultado, referencias);
    return Object.assign({ decisoes: antes, modo: 'dev' }, r);
  }
  const usuario = [
    'CAMPANHA "' + corta(resultado.nome || (campanha && campanha.nome), 80) + '", ' + (resultado.telas || []).length + ' TV(s).',
    'PEÇAS (número, onde, e os textos de cada uma):',
    pecasParaIA(resultado) || '(nenhuma peça)',
    '',
    conversa.textoDasDecisoes(antes),
    refs.paraIA(referencias),
    '',
    'CONVERSA DA EDIÇÃO:',
    transcricao(mensagens) || '(nada ainda)',
  ].join('\n');
  let r;
  try {
    r = ai.parseAiJson(await ai.callLLM(SISTEMA, usuario));
  } catch (e) {
    // A IA caiu: as frases comuns ainda funcionam, e a conversa não some.
    const dev = semIA(texto, (mensagens || []).slice(0, -1), resultado, referencias);
    return Object.assign({ decisoes: antes, modo: 'falha' }, dev);
  }
  const mudancas = ajuste.lerMudancas(r && r.mudancas, resultado, { refs: referencias });
  // "fazer" sem nenhuma mudança que existe vira pergunta: nunca diz que fez o que não fez.
  let acao = ACOES.includes(r && r.acao) ? r.acao : (mudancas.length ? 'fazer' : 'responder');
  if (acao === 'fazer' && !mudancas.length) acao = 'perguntar';
  const sugestoes = (Array.isArray(r && r.sugestoes) ? r.sugestoes : []).map((s) => corta(s, 60)).filter(Boolean).slice(0, 4);
  return {
    acao,
    resposta: corta(r && r.resposta, 500) || (acao === 'fazer' ? 'Feito.' : 'Pode me dizer qual peça e o que muda?'),
    sugestoes,
    mudancas: acao === 'fazer' ? mudancas : [],
    decisoes: conversa.mesclarDecisoes(antes, r && r.decisoes, r && r.esquecer),
    modo: ai.mode(),
  };
}

module.exports = { conversar, semIA, pecasParaIA, transcricao, SISTEMA, JANELA };
