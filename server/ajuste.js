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
const { partirTitulo, textosDaPeca } = require('./compositor');
const conferencia = require('./conferencia');

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
/*
 * QA de lançamento, 03/11: na peça feita pela IA os textos moram no HTML
 * (`campos` só tem a foto), e a lista saía vazia — a IA da edição via só o
 * rótulo, e "troca a foto" refazia a peça sem o preço. Agora vem de
 * `textosDaPeca`, que lê o HTML com o que foi editado por cima.
 */
function textosDe(peca) {
  const t = textosDaPeca(peca && peca.item);
  for (const k of Object.keys(t)) if (CAMPOS_QUE_NAO_SAO_TEXTO.includes(k)) delete t[k];
  return t;
}
function camposDeTexto(peca) { return Object.keys(textosDe(peca)); }

/*
 * Os textos de uma peça no formato das vagas (kicker, título, apoio,
 * chamada), para a peça de reserva: o título em duas linhas volta a ser um
 * só, e o preço, que a reserva não tem onde pôr, vai junto do apoio.
 */
function textosDaVaga(textos, label) {
  const x = textos || {};
  const valor = x.preco ? (/r\$/i.test(x.preco) ? x.preco : 'R$ ' + x.preco) + (x.centavos || '') : '';
  const preco = [x['preco-rotulo'], x.parcelas, valor, x.unidade].filter(Boolean).join(' ');
  return {
    kicker: x.kicker || x.selo || x.rotulo || '',
    titulo: [x.titulo, x.titulo2].filter(Boolean).join(' ') || label || '',
    apoio: [preco, x.apoio || x.sub || ''].filter(Boolean).join(' · '),
    cta: x.cta || x.chamada || x.quando || x.endereco || '',
  };
}
const FAIXAS = ['cabecalho', 'rodape'];

/*
 * As peças da campanha na ordem do painel: por TV, cabeçalho, principal,
 * lateral, rodapé. É por esta lista que "a peça 2" quer dizer a mesma coisa
 * para o cliente, para a IA e para o código.
 */
// As TVs do resultado, sempre uma lista: campanha velha com `telas` em texto ("x") derrubava a lista inteira (reteste da fase 10).
const telasDo = (resultado) => (resultado && Array.isArray(resultado.telas) ? resultado.telas : []);
function numerar(resultado) {
  const lista = [];
  telasDo(resultado).forEach((t, ti) => {
    // Campanha de formato antigo (sem cabeçalho ou rodapé) não derruba a conta inteira (QA total, 05/11).
    const z = (t && t.zonas) || {};
    const lista_ = (x) => (Array.isArray(x) ? x : []);
    const por = [['cabecalho', lista_((z.cabecalho || {}).pecas)], ['principal', lista_(z.principal)], ['lateral', lista_(z.lateral)], ['rodape', lista_((z.rodape || {}).pecas)]];
    for (const [zona, pecas] of por) (pecas || []).forEach((p) => lista.push({ n: lista.length + 1, tela: ti, zona, peca: p }));
  });
  return lista;
}

const SISTEMA = `Você ajusta uma campanha de TV que já foi gerada para um pequeno negócio.
O cliente pediu uma mudança. Diga QUAIS mudanças fazer, e só elas — nada que
ele não pediu muda.

As mudanças possíveis (use os números das peças e das TVs da lista):
- {"tipo":"refazer","peca":N,"texto":"o que muda no texto, ou vazio","desenho":"o que muda no desenho (tamanho, destaque, posição: 'preço maior'), ou vazio","foto":"manter"|"trocar"|"tirar","descricaoFoto":"a cena nova, só se trocar"}
  Pedido de tamanho ou destaque ("deixa o preço maior") vai em "desenho", nunca em "texto".
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
  const nTelas = telasDo(resultado).length;
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
      const r = { tipo: 'refazer', peca: n, texto: corta(m.texto, 300),
        foto: ['manter', 'trocar', 'tirar'].includes(m.foto) ? m.foto : 'manter', descricaoFoto: corta(m.descricaoFoto, 400) };
      // O pedido de desenho (tamanho, destaque) vai para quem desenha, não para quem escreve.
      if (corta(m.desenho, 300)) r.desenho = corta(m.desenho, 300);
      // O modelo que pôs "preço maior" em "texto": é desenho (reescrever o texto não muda tamanho nenhum).
      else if (pedidoDeDesenho(r.texto)) { r.desenho = r.texto; r.texto = ''; }
      saida.push(r);
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
  // "deixa o preço maior (na peça 1)": é desenho, não texto.
  const desenho = pedidoDeDesenho(texto);
  if (desenho) {
    const n = num(/pe[cç]a (\d+)/) || pecaDoDesenho(desenho, resultado);
    if (n) mudancas.push({ tipo: 'refazer', peca: n, foto: 'manter', texto: '', desenho });
  }
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

/*
 * "deixa o preço maior", "o título mais destacado", "aumenta a letra": o
 * pedido de TAMANHO ou ÊNFASE. Devolve a frase (vai inteira para quem
 * desenha) ou ''. QA de lançamento, 03/11: ele virava "texto novo na peça 1".
 */
const ALVO_DO_DESENHO = '(pre[cç]o|t[ií]tulo|n[uú]mero|valor|letra|texto|chamada|nome|logo|foto|data|desconto)';
const TAMANHO = '(maior|menor|grande|pequen[oa]|destacad[oa]|em destaque|chamativ[oa]|vis[ií]vel|forte|gross[oa])';
const RE_DESENHO = new RegExp('(deix|p[õo]e|coloc|fa[zç]|aument|diminu|destac|real[cç]|ressalt)\\S*\\s+(?:o |a |os |as )?' + ALVO_DO_DESENHO
  + '[^.!?]{0,20}?\\b(mais\\s+)?' + TAMANHO + '|(aument|diminu|amplia|destac|real[cç]|ressalt)\\S*\\s+(?:o |a )?(tamanho d[oa] )?' + ALVO_DO_DESENHO);
function pedidoDeDesenho(texto) {
  return RE_DESENHO.test(String(texto || '').toLowerCase()) ? String(texto).trim().slice(0, 300) : '';
}

// A peça de que o pedido de desenho fala, quando ele não diz o número: a única, ou a única com preço.
function pecaDoDesenho(desenho, resultado) {
  const pecas = numerar(resultado);
  if (pecas.length === 1) return 1;
  if (/pre[cç]o|valor|n[uú]mero|desconto/i.test(desenho)) {
    const comPreco = pecas.filter((x) => camposDeTexto(x.peca).includes('preco') || Object.values(textosDe(x.peca)).some((v) => /r\$|\d+,\d{2}/i.test(v)));
    if (comPreco.length === 1) return comPreco[0].n;
  }
  return 0;
}

function descreverMudanca(m) {
  if (m.tipo === 'texto') return 'texto novo na peça ' + m.peca;
  if (m.tipo === 'refazer' && m.foto === 'manter' && m.desenho) return 'redesenhar a peça ' + m.peca + ' (' + m.desenho.slice(0, 80) + ')';
  if (m.tipo === 'refazer' && m.foto === 'manter' && !m.texto) return 'refazer a peça ' + m.peca;
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
    '', 'TVs: ' + telasDo(resultado).length, '', 'PEDIDO DO CLIENTE: ' + corta(texto, 600)].join('\n');
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
async function aplicar(campanha, mudancas, ctx, { onImagem, onProgresso, pedido } = {}) {
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
  // O que o pedido queria e não deu para fazer: a resposta diz, em vez de "Feito".
  const naoFeito = [];

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
        const novos = mu.campo === 'titulo' && Object.prototype.hasOwnProperty.call(textosDe(p), 'titulo2')
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
      /*
       * Texto: só reescreve se o pedido falou de texto. Senão, os de antes —
       * TODOS, lidos da peça (QA de lançamento, 03/11: na peça da IA o
       * kicker, o apoio, a chamada e o preço moram no HTML, e "troca a foto"
       * refazia a peça só com o título).
       */
      const antesTextos = textosDe(p);
      let t = textosDaVaga(antesTextos, p.label);
      if (mu.texto) t = (await eco.escreverTextos(escopo, [v], ctx, bases, mu.texto)).vagas[v.id];
      const fotoAntes = p.item.campos.foto || null;
      let f = fotoAntes;
      if (mu.foto === 'tirar') f = null;
      // A foto que a pessoa mandou no chat (D45): é dela, vai como está e não gasta criação.
      if (mu.foto === 'usar' && mu.fotoUrl) f = mu.fotoUrl;
      if (mu.foto === 'trocar' && eco.levaFoto(v)) f = (await foto(mu.descricaoFoto || ('Outra foto para: ' + t.titulo), p.formato, p.vaga)) || f;
      const zona = lugar(alvo.tela, alvo.zona);
      const i = zona.findIndex((x) => x.vaga === p.vaga);
      const soAFoto = !mu.texto && !mu.desenho && (mu.foto === 'trocar' || mu.foto === 'usar');
      if (soAFoto && f === fotoAntes) {
        naoFeito.push('A foto nova da peça ' + mu.peca + ' não saiu, e a peça ficou como estava.');
        continue;
      }
      /*
       * Só a foto muda e a peça tem o lugar dela: troca a foto e pronto. O
       * desenho que a pessoa aprovou olhando continua o mesmo, com os mesmos
       * textos — e sem gastar uma composição.
       */
      const temLugarDeFoto = p.item.type === 'peca-html' && /data-campo-img="foto"/.test(String(p.item.html || ''));
      if (soAFoto && temLugarDeFoto) {
        zona[i] = { ...p, comFoto: true, item: { ...p.item, campos: { ...p.item.campos, foto: f } } };
        refeitas++;
        continue;
      }
      const refazer = {};
      // Sem texto novo, a IA recebe os textos da peça campo a campo, com os nomes: nada some.
      if (!mu.texto) refazer.textosCampos = antesTextos;
      if (mu.desenho) {
        refazer.ajusteDesenho = mu.desenho;
        if (p.item.type === 'peca-html') refazer.anterior = '<style>' + (p.item.css || '') + '</style>\n' + (p.item.html || '');
      }
      // A peça não repete as OUTRAS zonas — o título dela mesma ela pode (e deve) manter.
      const outras = { ...comum, ditos: comum.ditos.filter((d) => d !== p.label) };
      const nova = await eco.comporVaga(v, t, f, outras, refazer);
      /*
       * QA de lançamento, 03/11: "deixa o preço maior" respondia "Deixei
       * maior" sem mudar nada. Sem a IA de desenho (ou com ela recusada), a
       * peça de reserva não sabe fazer o pedido: a peça fica como estava, e a
       * resposta diz isso.
       */
      if (mu.desenho && nova.motor !== 'html') {
        naoFeito.push('Não consegui redesenhar a peça ' + mu.peca + ' agora ("' + mu.desenho.slice(0, 60) + '"), e ela ficou como estava. Tente de novo daqui a pouco, ou mude o texto à mão no lápis da peça.');
        continue;
      }
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
            const tb = textosDaVaga(textosDe(base.peca), base.peca.label);
            textos = await redes.gerar({ headline: base.peca.label, sub: tb.apoio, cta: tb.cta,
              pedido: escopo.objetivo, empresa: ctx.empresa || '', tom: m.tom || '', ramo: ctx.ramo || '', perfil: ctx.perfil || '' });
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
  /*
   * A conferência de novo (server/conferencia.js), com a régua guardada e o
   * que a pessoa disse agora: o texto que ela mandou pôr é dela. Campanha de
   * antes da conferência, sem régua guardada: a régua sai do escopo e da conta.
   */
  const ditosAgora = [pedido || ''].concat(mudancas.map((x) => x.valor || x.texto || ''), ...mudancas.map((x) => x.mensagens || []));
  if (!(r.conferencia && r.conferencia.permitidos)) r.conferencia = { permitidos: conferencia.permitidosDe(escopo, ctx) };
  r.conferencia = conferencia.reconferir(r, Object.assign({ hoje: new Date() }, conferencia.opcoesDaConta(ctx, escopo)), ditosAgora);
  return { resultado: r, escopo: E.normalizar(escopo), refeitas, fotosGeradas, naoFeito };
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

module.exports = { numerar, lerMudancas, semIA, entender, aplicar, desfazer, descreverMudanca, camposDeTexto, textosDe, textosDaVaga, pedidoDeDesenho, pecaDoDesenho, comoPedido, SISTEMA };
