/*
 * server/pedir-ia.js — UM LUGAR SÓ PARA PEDIR À IA, na Programação (D51).
 *
 * O dono: "não entendi como a IA altera as programações". Cada ajuste morava
 * num canto: o aviso rápido na Programação, o "Mudar com IA" dentro do editor
 * de cada TV, o "Pedir à IA" dentro de cada peça, e o conteúdo novo no Criar.
 * Aqui é uma caixa só — "o que você quer mudar nas TVs?" — que entende o
 * pedido e leva ao caminho certo, conversando até entender:
 *
 *   aviso  → o aviso pronto para a prévia (server/aviso-rapido.js);
 *   tela   → a aparência de UMA TV (layout, tema, cores, relógio, clima —
 *            server/ajuste-tela.js); pergunta qual TV quando há mais de uma;
 *   criar  → conteúdo novo: leva ao Criar com o pedido escrito.
 *
 * Nada é gravado aqui: o painel mostra a prévia e só o "ok" da pessoa aplica.
 */
const ai = require('./ai');
const P = require('./ia-pergunta');
const avisoRapido = require('./aviso-rapido');
const ajusteTela = require('./ajuste-tela');

const plano = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const corta = (s, n) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim().slice(0, n);
const DESTINOS = ['aviso', 'tela', 'criar'];

// Pelas palavras (modo demonstração, e a reserva da IA).
function destinoPelasPalavras(pedido) {
  const s = plano(pedido);
  if (/\b(aviso|avisar|recado|comunicado|interditad\w*|fechad[oa]s?|feriado|reuniao|cuidado|piso molhado|manutencao|nao vai ter|vai fechar)\b/.test(s)) return 'aviso';
  if (/\b(layout|tema|fundo|cor|cores|relogio|clima|lateral|cabecalho|rodape|fonte|letra|aparencia|visual|claro|escuro)\b/.test(s)) return 'tela';
  if (/\b(cri[ae]r?|promoc\w*|campanha|divulg\w*|peca|post|anunci\w*|novidade|lancamento|algo novo)\b/.test(s)) return 'criar';
  return '';
}

const SISTEMA = `Você recebe um pedido sobre as TVs de uma empresa e diz QUAL É o pedido:
- "aviso": pôr um recado/aviso nas TVs (fechado, interditado, reunião, cuidado);
- "tela": mudar a APARÊNCIA de uma TV (layout, tema, cores, fundo, relógio, clima, letra);
- "criar": conteúdo novo (promoção, campanha, peça, post, divulgar algo).
Se o pedido é sobre uma TV específica, diga o nome dela (da lista TVS), senão "".
${P.REGRA_DE_PERGUNTA}
Responda APENAS JSON: { "destino": "aviso" | "tela" | "criar", "tv": "nome da TV ou vazio" }`;

const PERGUNTA_DO_TIPO = {
  pergunta: 'O que você quer fazer nas TVs?',
  sugestoes: ['Pôr um aviso', 'Mudar a aparência de uma TV', 'Criar algo novo'],
};

// A TV que o pedido cita (pelo nome), ou a única da conta.
function tvDoPedido(pedido, tvs, nomeDaIA) {
  const lista = Array.isArray(tvs) ? tvs : [];
  if (lista.length === 1) return lista[0];
  const s = plano(pedido + ' ' + (nomeDaIA || ''));
  return lista.filter((t) => t.nome && s.includes(plano(t.nome))).sort((a, b) => b.nome.length - a.nome.length)[0] || null;
}

/*
 * Uma volta. `tvs`: [{ id, nome, layoutId, orientacao, tema }] da conta.
 * Devolve { pergunta, sugestoes } ou { destino, ... } com o que o painel mostra.
 */
async function entender(texto, { historico, tvs, grupos, hoje } = {}) {
  const pedido = P.pedidoDaConversa(historico, texto, ', ');
  let destino = destinoPelasPalavras(pedido);
  let nomeDaTv = '';
  if (!destino && ai.mode() !== 'dev') {
    try {
      const usuario = ['TVS: ' + ((tvs || []).map((t) => t.nome).filter(Boolean).join(', ') || '(nenhuma)'), 'CONVERSA:', P.transcricao(historico, texto)].join('\n');
      const r = ai.parseAiJson(await ai.callLLM(SISTEMA, usuario));
      if (r && DESTINOS.includes(r.destino)) { destino = r.destino; nomeDaTv = corta(r.tv, 60); }
      else { const q = P.lerPergunta(r); if (q) return q; }
    } catch (e) { /* sem IA: as palavras, e a pergunta */ }
  }
  if (!destino) return PERGUNTA_DO_TIPO;

  if (destino === 'aviso') {
    const r = await avisoRapido.entender(texto, { historico, grupos, hoje });
    return r.pergunta ? r : { destino: 'aviso', aviso: r };
  }
  if (destino === 'criar') {
    // O que vai para o Criar: o pedido sem a escolha do menu ("Criar algo novo").
    const t = pedido.split(/,\s*/).filter((x) => !/^criar algo novo$/i.test(x.trim())).join(', ');
    return { destino: 'criar', texto: corta(t, 400) };
  }
  // tela
  if (!(tvs || []).length) return { destino: 'nenhuma-tv' };
  const tv = tvDoPedido(pedido, tvs, nomeDaTv);
  if (!tv) return { pergunta: 'Em qual TV?', sugestoes: tvs.slice(0, 4).map((t) => t.nome).filter(Boolean) };
  // A resposta "qual TV" não é pedido de tela: o histórico sem ela vai para o ajuste.
  const r = await ajusteTela.entender(texto, { layoutId: tv.layoutId || 'dashboard', orientacao: tv.orientacao || 'landscape', tema: tv.tema || '' }, historico);
  if (r.pergunta) return r;
  return { destino: 'tela', tv: { id: tv.id, nome: tv.nome }, mudancas: r.mudancas, notas: r.notas || [] };
}

module.exports = { entender, destinoPelasPalavras, tvDoPedido, PERGUNTA_DO_TIPO, SISTEMA };
