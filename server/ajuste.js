/*
 * server/ajuste.js — ajustar a campanha depois de gerada (EXECUTOR §2b,
 * item 26).
 *
 * "Troca a foto da peça 2", "mais uma peça na lateral", "tira o Facebook".
 * A conversa continua depois de gerar, e a regra que importa é de dinheiro:
 * SÓ O QUE MUDOU É FEITO DE NOVO. Refazer a campanha inteira para trocar uma
 * foto cobraria as outras fotos de novo e mudaria peças que o cliente já
 * tinha aprovado olhando.
 *
 *   1. A IA lê o pedido e a lista numerada das peças e devolve as MUDANÇAS
 *      (refazer, acrescentar, tirar, redes, letreiro, contagem). Ela não
 *      redesenha nada; só diz o quê.
 *   2. O código aplica, peça por peça, com as mesmas partes do gerador
 *      (server/ecossistema.js). Foto nova passa por `onImagem`, que cobra.
 *   3. O resultado anterior fica guardado: "Desfazer" volta um passo.
 *
 * A numeração das peças é a mesma que o painel mostra ao lado de cada uma.
 */
const E = require('../js/escopo.js');
const ai = require('./ai');
const eco = require('./ecossistema');
const redes = require('./redes');
const { partirTitulo } = require('./compositor');

// 'texto' (D50): troca SÓ um texto da peça (preço, data, frase), sem refazer nada — a edição mais comum e a que não pode regredir.
const TIPOS = ['refazer', 'texto', 'acrescentar', 'tirar', 'redes', 'letreiro', 'contagem'];

/*
 * Os textos que a pessoa vê numa peça (os campos de texto do item): é por
 * eles que a IA da edição sabe o que "o preço" ou "a frase de baixo" é.
 * Imagem, logo e QR ficam de fora. O campo de texto VAZIO entra: o modelo
 * tem o lugar (a frase de apoio, o "quando") e a pessoa pode querer
 * preenchê-lo.
 */
const CAMPOS_QUE_NAO_SAO_TEXTO = ['foto', 'logo', 'qr', 'imagem', 'fundo', 'marca'];
function camposDeTexto(peca) {
  const c = (peca && peca.item && peca.item.campos) || {};
  return Object.keys(c).filter((k) => typeof c[k] === 'string'
    && !CAMPOS_QUE_NAO_SAO_TEXTO.includes(k) && !/^(\/|https?:|data:)/.test(c[k].trim()));
}
const FAIXAS = ['cabecalho', 'rodape'];

/*
 * As peças da campanha na ordem do painel: por TV, cabeçalho, principal,
 * lateral, rodapé. É por esta lista que "a peça 2" quer dizer a mesma coisa
 * para o cliente, para a IA e para o código.
 */
function numerar(resultado) {
  const lista = [];
  ((resultado && resultado.telas) || []).forEach((t, ti) => {
    const z = t.zonas;
    const por = [['cabecalho', z.cabecalho.pecas], ['principal', z.principal], ['lateral', z.lateral], ['rodape', z.rodape.pecas]];
    for (const [zona, pecas] of por) (pecas || []).forEach((p) => lista.push({ n: lista.length + 1, tela: ti, zona, peca: p }));
  });
  return lista;
}

const SISTEMA = `Você ajusta uma campanha de TV que já foi gerada para um pequeno negócio.
O cliente pediu uma mudança. Diga QUAIS mudanças fazer, e só elas — nada que
ele não pediu muda.

As mudanças possíveis (use os números das peças e das TVs da lista):
- {"tipo":"refazer","peca":N,"texto":"o que muda no texto, ou vazio","foto":"manter"|"trocar"|"tirar","descricaoFoto":"a cena nova, só se trocar"}
- {"tipo":"acrescentar","tela":T,"zona":"principal"|"lateral"|"cabecalho"|"rodape","quantidade":1,"pedido":"o que a peça nova mostra"}
- {"tipo":"tirar","peca":N}
- {"tipo":"redes","canal":"instagramPost"|"instagramStory"|"whatsappStatus"|"whatsappMensagem"|"facebook"|"google","ligado":true|false}
- {"tipo":"letreiro","tela":T,"mensagens":["frase do rodapé"]}
- {"tipo":"contagem","tela":T,"ate":"AAAA-MM-DDTHH:MM" ou ""}

Responda APENAS JSON:
{ "resposta": "uma frase dizendo o que você vai mudar, em português simples", "mudancas": [ ... ] }
Se o pedido não for uma mudança que dá para fazer, "mudancas" vazio e a
resposta explica, em uma frase, o que dá para pedir.`;

function listaParaIA(resultado) {
  return numerar(resultado).map((x) => `- peça ${x.n}: TV ${x.tela + 1}, ${E.NOME_ZONA[x.zona].toLowerCase()}, "${x.peca.label}"${x.peca.comFoto ? ', com foto' : ', sem foto'}`).join('\n');
}

const corta = (s, n) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim().slice(0, n);
const inteiro = (v) => (Number.isInteger(v) ? v : Math.round(Number(v)));

// A peneira: o que a IA devolve vira mudança só se apontar para o que existe.
// `opcoes.refs` (D45): as imagens que a pessoa mandou no chat — "usar" aponta para uma delas pelo número.
function lerMudancas(lista, resultado, opcoes) {
  const refs = (opcoes && Array.isArray(opcoes.refs)) ? opcoes.refs : [];
  const pecas = numerar(resultado);
  const nTelas = ((resultado && resultado.telas) || []).length;
  const saida = [];
  for (const m of (Array.isArray(lista) ? lista : []).slice(0, 12)) {
    if (!m || !TIPOS.includes(m.tipo)) continue;
    if (m.tipo === 'refazer' || m.tipo === 'tirar' || m.tipo === 'texto') {
      const n = inteiro(m.peca);
      if (!(n >= 1 && n <= pecas.length)) continue;
      if (m.tipo === 'tirar') { saida.push({ tipo: 'tirar', peca: n }); continue; }
      // Só um campo de texto que a peça TEM, e texto de verdade (curto, sem controle).
      if (m.tipo === 'texto') {
        const campo = String(m.campo || '');
        const valor = corta(m.valor, 200);
        if (camposDeTexto(pecas[n - 1].peca).includes(campo) && valor) saida.push({ tipo: 'texto', peca: n, campo, valor });
        continue;
      }
      // "usar": a imagem K que a pessoa mandou (D45). Sem uma imagem K de verdade, a mudança não entra.
      if (m.foto === 'usar') {
        const ref = refs[inteiro(m.ref) - 1];
        if (!ref || !ref.url) continue;
        saida.push({ tipo: 'refazer', peca: n, texto: corta(m.texto, 300), foto: 'usar', fotoUrl: ref.url, descricaoFoto: '' });
        continue;
      }
      saida.push({ tipo: 'refazer', peca: n, texto: corta(m.texto, 300),
        foto: ['manter', 'trocar', 'tirar'].includes(m.foto) ? m.foto : 'manter', descricaoFoto: corta(m.descricaoFoto, 400) });
    } else if (m.tipo === 'redes') {
      if (E.REDES.includes(m.canal)) saida.push({ tipo: 'redes', canal: m.canal, ligado: m.ligado === true });
    } else {
      // As que apontam para uma TV: o número é de 1 em diante, como a pessoa conta.
      const t = inteiro(m.tela) - 1;
      if (!(t >= 0 && t < nTelas)) continue;
      if (m.tipo === 'acrescentar' && E.ZONAS.includes(m.zona)) {
        saida.push({ tipo: 'acrescentar', tela: t, zona: m.zona, quantidade: Math.max(1, Math.min(3, inteiro(m.quantidade) || 1)), pedido: corta(m.pedido, 200) });
      } else if (m.tipo === 'letreiro') {
        saida.push({ tipo: 'letreiro', tela: t, mensagens: (Array.isArray(m.mensagens) ? m.mensagens : []).map((x) => corta(x, 120)).filter(Boolean).slice(0, 12) });
      } else if (m.tipo === 'contagem') {
        saida.push({ tipo: 'contagem', tela: t, ate: /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(String(m.ate || '')) ? m.ate : '' });
      }
    }
  }
  return saida;
}

/*
 * Sem IA: as frases mais comuns, por palavra. Dá para testar o caminho
 * inteiro no localhost; com IA, quem entende é o modelo.
 */
function semIA(texto, resultado) {
  const t = String(texto || '').toLowerCase();
  const num = (re) => { const m = re.exec(t); return m ? Number(m[1]) : null; };
  const mudancas = [];
  const foto = num(/troca (?:a )?foto (?:da |na )?(?:peça |tela )?(\d+)/);
  if (foto) mudancas.push({ tipo: 'refazer', peca: foto, foto: 'trocar', texto: '' });
  const refaz = num(/refa[zç]a? (?:a )?(?:peça )?(\d+)/);
  if (refaz) mudancas.push({ tipo: 'refazer', peca: refaz, foto: 'manter', texto: texto });
  const tira = num(/tira (?:a )?(?:peça )?(\d+)/);
  if (tira) mudancas.push({ tipo: 'tirar', peca: tira });
  const mais = /mais (uma|duas|\d+) peças? (?:na|no|para a|para o) (principal|lateral|cabe[cç]alho|rodap[eé])/.exec(t);
  if (mais) {
    const q = mais[1] === 'uma' ? 1 : mais[1] === 'duas' ? 2 : Number(mais[1]);
    mudancas.push({ tipo: 'acrescentar', tela: 1, zona: mais[2].replace('ç', 'c').replace('é', 'e'), quantidade: q, pedido: '' });
  }
  const REDE = { facebook: 'facebook', google: 'google', story: 'instagramStory', instagram: 'instagramPost', status: 'whatsappStatus', whatsapp: 'whatsappMensagem' };
  for (const [palavra, canal] of Object.entries(REDE)) {
    if (new RegExp('tira (?:o |a )?' + palavra).test(t)) mudancas.push({ tipo: 'redes', canal, ligado: false });
    else if (new RegExp('(?:p[õo]e|coloca|liga|faz) (?:o |a |também )?' + palavra).test(t)) mudancas.push({ tipo: 'redes', canal, ligado: true });
  }
  const lidas = lerMudancas(mudancas, resultado);
  return {
    resposta: lidas.length ? 'Feito: ' + lidas.map(descreverMudanca).join('; ') + '.' : 'Peça, por exemplo: "troca a foto da peça 2", "mais uma peça na lateral" ou "tira o Facebook".',
    mudancas: lidas,
  };
}

function descreverMudanca(m) {
  if (m.tipo === 'texto') return 'texto novo na peça ' + m.peca;
  if (m.tipo === 'refazer') return (m.foto === 'trocar' ? 'foto nova na peça ' : m.foto === 'usar' ? 'a sua foto na peça ' : m.foto === 'tirar' ? 'sem foto na peça ' : 'texto novo na peça ') + m.peca;
  if (m.tipo === 'tirar') return 'tirar a peça ' + m.peca;
  if (m.tipo === 'acrescentar') return (m.quantidade === 1 ? 'mais uma peça' : 'mais ' + m.quantidade + ' peças') + ' em ' + E.NOME_ZONA[m.zona].toLowerCase();
  if (m.tipo === 'redes') return (m.ligado ? 'pôr ' : 'tirar ') + E.NOME_REDE[m.canal];
  if (m.tipo === 'letreiro') return 'letreiro novo';
  return m.ate ? 'contagem até ' + m.ate.slice(8, 10) + '/' + m.ate.slice(5, 7) : 'sem contagem';
}

async function entender(texto, campanha) {
  const resultado = campanha.resultado;
  if (ai.mode() === 'dev') return semIA(texto, resultado);
  const usuario = ['PEÇAS DA CAMPANHA "' + (resultado.nome || campanha.nome) + '":', listaParaIA(resultado),
    '', 'TVs: ' + resultado.telas.length, '', 'PEDIDO DO CLIENTE: ' + corta(texto, 600)].join('\n');
  try {
    const r = ai.parseAiJson(await ai.callLLM(SISTEMA, usuario));
    const mudancas = lerMudancas(r && r.mudancas, resultado);
    return { resposta: corta(r && r.resposta, 400) || (mudancas.length ? 'Feito.' : 'Não entendi o que mudar.'), mudancas };
  } catch (e) {
    // A IA caiu: as frases comuns ainda funcionam.
    return semIA(texto, resultado);
  }
}

// O resultado e o escopo de antes, sem o "antes" deles: desfazer volta um passo só.
function semAnterior(r) { const c = { ...r }; delete c.anterior; return c; }

/*
 * Aplica as mudanças. Devolve { resultado, escopo, refeitas, fotosGeradas }.
 * Nada é refeito além do que as mudanças apontam.
 */
async function aplicar(campanha, mudancas, ctx, { onImagem, onProgresso } = {}) {
  ctx = ctx || {};
  const passo = (e, d) => { try { onProgresso && onProgresso(e, d || ''); } catch (x) { /* progresso não derruba */ } };
  const antes = JSON.parse(JSON.stringify(campanha.resultado));
  const r = JSON.parse(JSON.stringify(campanha.resultado));
  const escopo = E.normalizar(campanha.escopo);
  // As cores da campanha (D13) continuam valendo no ajuste: a peça refeita fala igual às outras.
  const m = escopo.cores.length ? Object.assign({}, ctx.marca || {}, { cores: escopo.cores }) : (ctx.marca || {});
  const bases = (m.bases || []).filter((b) => b && b.url);
  const { identidade, modo, marcaDaPeca } = eco.identidadeDe(m, (r.identidade || {}).direcao, (r.identidade || {}).estilo);
  const comum = { escopo, ctx, marcaDaPeca, modo, ditos: numerar(r).map((x) => x.peca.label) };
  const numeradas = numerar(r);
  let refeitas = 0, fotosGeradas = 0;
  const semFoto = [];

  const lugar = (tela, zona) => (FAIXAS.includes(zona) ? r.telas[tela].zonas[zona].pecas : r.telas[tela].zonas[zona]);
  const foto = async (descricao, formato, vaga) => {
    if (!onImagem) { semFoto.push({ vaga, porque: 'sem gerador de fotos' }); return null; }
    try { const u = await onImagem(descricao, formato, identidade); fotosGeradas++; return u; }
    catch (e) { semFoto.push({ vaga, porque: String((e && e.message) || 'a foto não saiu') }); return null; }
  };

  // Tirar por último e do fim para o começo, para os números das outras não andarem.
  const ordem = mudancas.filter((x) => x.tipo !== 'tirar').concat(mudancas.filter((x) => x.tipo === 'tirar').sort((a, b) => b.peca - a.peca));
  for (const mu of ordem) {
    if (mu.tipo === 'texto') {
      // Só o texto pedido muda: a foto, o desenho e os outros textos ficam (D50).
      const alvo = numeradas[mu.peca - 1];
      const zona = lugar(alvo.tela, alvo.zona);
      const i = zona.findIndex((x) => x.vaga === alvo.peca.vaga);
      if (i >= 0) {
        const p = zona[i];
        /*
         * A peça que divide o título em duas linhas (titulo + titulo2, a
         * segunda colorida): o título novo é repartido nas duas. Trocando só
         * a primeira, a segunda linha do título antigo ficava ("ÓCULOS COM
         * 30% SÓ ATÉ SÁBADO / SOL: 30% OFF ATÉ SÁBADO" — visto no teste do
         * dono no navegador).
         */
        const novos = mu.campo === 'titulo' && Object.prototype.hasOwnProperty.call(p.item.campos || {}, 'titulo2')
          ? (([a, b]) => ({ titulo: a, titulo2: b }))(partirTitulo(mu.valor))
          : { [mu.campo]: mu.valor };
        zona[i] = { ...p, label: mu.campo === 'titulo' ? mu.valor.slice(0, 40) : p.label,
          item: { ...p.item, campos: { ...p.item.campos, ...novos } } };
      }
      continue;
    }
    if (mu.tipo === 'refazer') {
      const alvo = numeradas[mu.peca - 1];
      const p = alvo.peca;
      passo('refazendo a peça ' + mu.peca, p.label);
      const v = { id: p.vaga, tela: alvo.tela, zona: alvo.zona, papel: p.papel, formato: p.formato, indice: 0, pedido: '' };
      // Texto: só reescreve se o pedido falou de texto. Senão, os de antes.
      let t = { kicker: p.item.campos.kicker || '', titulo: p.label, apoio: p.item.campos.apoio || '', cta: p.item.campos.cta || '' };
      if (mu.texto) t = (await eco.escreverTextos(escopo, [v], ctx, bases, mu.texto)).vagas[v.id];
      let f = p.item.campos.foto || null;
      if (mu.foto === 'tirar') f = null;
      // A foto que a pessoa mandou no chat (D45): é dela, vai como está e não gasta criação.
      if (mu.foto === 'usar' && mu.fotoUrl) f = mu.fotoUrl;
      if (mu.foto === 'trocar' && eco.levaFoto(v)) f = (await foto(mu.descricaoFoto || ('Outra foto para: ' + t.titulo), p.formato, p.vaga)) || f;
      const nova = await eco.comporVaga(v, t, f, comum);
      const zona = lugar(alvo.tela, alvo.zona);
      const i = zona.findIndex((x) => x.vaga === p.vaga);
      // O horário que a peça tinha continua: ajustar a foto não muda a programação.
      zona[i] = { ...nova, horario: p.horario || null, item: p.item.agendamento ? { ...nova.item, agendamento: p.item.agendamento } : nova.item };
      refeitas++;
    } else if (mu.tipo === 'acrescentar') {
      const zona = lugar(mu.tela, mu.zona);
      const ja = escopo.telas[mu.tela].zonas[mu.zona].pecas;
      const cabem = Math.max(0, Math.min(mu.quantidade, E.TETO_ZONA[mu.zona] - zona.length));
      const vagas = [];
      for (let k = 0; k < cabem; k++) {
        const seq = zona.length + k;
        vagas.push({ id: 't' + mu.tela + '-' + mu.zona + '-a' + Date.now().toString(36) + k, tela: mu.tela, zona: mu.zona, indice: seq,
          papel: eco.PAPEL_DA_ZONA[mu.zona], formato: zona[0] ? zona[0].formato : (mu.zona === 'principal' ? '16/9' : mu.zona === 'lateral' ? '9/16' : '21/9'),
          pedido: mu.pedido || escopo.telas[mu.tela].zonas[mu.zona].pedido || '' });
      }
      if (!vagas.length) continue;
      passo('desenhando as peças novas', vagas.length + ' em ' + E.NOME_ZONA[mu.zona].toLowerCase());
      const textos = await eco.escreverTextos(escopo, vagas, ctx, bases, mu.pedido);
      for (const v of vagas) {
        const t = textos.vagas[v.id];
        const d = eco.decidirFoto(v, t, escopo.imagens, bases, v.indice);
        const f = d.tipo === 'minha' ? d.url : d.tipo === 'gerar' ? await foto(d.descricao, v.formato, v.id) : null;
        zona.push(await eco.comporVaga(v, t, f, comum));
        comum.ditos.push(t.titulo);
        refeitas++;
      }
      escopo.telas[mu.tela].zonas[mu.zona].pecas = Math.min(E.TETO_ZONA[mu.zona], ja + vagas.length);
    } else if (mu.tipo === 'tirar') {
      const alvo = numeradas[mu.peca - 1];
      const zona = lugar(alvo.tela, alvo.zona);
      const i = zona.findIndex((x) => x.vaga === alvo.peca.vaga);
      if (i >= 0) zona.splice(i, 1);
      const z = escopo.telas[alvo.tela].zonas[alvo.zona];
      z.pecas = Math.max(0, z.pecas - 1);
    } else if (mu.tipo === 'redes') {
      escopo.redes[mu.canal] = mu.ligado;
      const canais = E.REDES.filter((c) => escopo.redes[c]);
      if (!canais.length) r.social = null;
      else if (r.social) r.social = { ...r.social, canais };
      else {
        // As redes ligadas agora: os textos saem da peça principal, como no gerador.
        const base = numerar(r).find((x) => x.zona === 'principal') || numerar(r)[0];
        let textos = null;
        if (base) {
          try {
            textos = await redes.gerar({ headline: base.peca.label, sub: base.peca.item.campos.apoio || '', cta: base.peca.item.campos.cta || '',
              pedido: escopo.objetivo, empresa: ctx.empresa || '', tom: m.tom || '', ramo: ctx.ramo || '' });
          } catch (e) { textos = null; }
        }
        r.social = { canais, peca: base ? base.peca.vaga : null, textos };
      }
    } else if (mu.tipo === 'letreiro') {
      r.telas[mu.tela].zonas.rodape.mensagens = mu.mensagens;
      escopo.telas[mu.tela].zonas.rodape.mensagens = mu.mensagens;
    } else if (mu.tipo === 'contagem') {
      r.telas[mu.tela].zonas.rodape.contagem = mu.ate;
      escopo.telas[mu.tela].zonas.rodape.contagem = mu.ate;
    }
  }

  r.contagem = { pecas: numerar(r).length, fotosGeradas: ((antes.contagem && antes.contagem.fotosGeradas) || 0) + fotosGeradas };
  r.semFoto = semFoto.length ? semFoto : (r.semFoto || []);
  r.biblioteca = numerar(r).filter((x) => x.zona === 'principal' || x.zona === 'lateral')
    .map((x) => ({ formato: x.peca.formato, canal: 'TV', label: x.peca.label, item: x.peca.item }));
  r.anterior = { resultado: semAnterior(antes), escopo: E.normalizar(campanha.escopo) };
  return { resultado: r, escopo: E.normalizar(escopo), refeitas, fotosGeradas };
}

// Desfazer: volta o passo guardado. Sem passo guardado, nada.
function desfazer(campanha) {
  const a = campanha.resultado && campanha.resultado.anterior;
  if (!a) return null;
  return { resultado: a.resultado, escopo: a.escopo };
}

/*
 * As mudanças já lidas, de volta ao formato de quem pede (TV de 1 em diante,
 * a imagem pelo número): para conferir de novo, contra a campanha de AGORA,
 * o que ficou esperando o "pode fazer" (D42).
 */
function comoPedido(mudancas, refs) {
  const l = Array.isArray(refs) ? refs : [];
  return (Array.isArray(mudancas) ? mudancas : []).map((m) => {
    const x = Object.assign({}, m);
    if (Number.isInteger(x.tela)) x.tela += 1;
    if (x.foto === 'usar') { x.ref = l.findIndex((r) => r && r.url === x.fotoUrl) + 1; delete x.fotoUrl; }
    return x;
  });
}

module.exports = { numerar, lerMudancas, semIA, entender, aplicar, desfazer, descreverMudanca, camposDeTexto, comoPedido, SISTEMA };
