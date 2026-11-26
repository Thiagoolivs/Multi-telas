/*
 * server/agente/publicar.js — pôr no ar, SÓ depois da validação.
 *
 * O dono (decisão de 25/11): o agente pode publicar sozinho, mas só depois
 * de a pessoa validar o que vai ao ar. Aqui é o único lugar do agente que
 * muda uma TV, e cada função confere a VALIDAÇÃO antes de qualquer coisa: a
 * chave do plano que a pessoa validou tem de ser a do plano que está sendo
 * publicado. Sem ela, nada sai — nem chamada por engano, nem por um texto
 * de fora que "mande publicar".
 *
 * O caminho até a TV é o de sempre: a operação em lote do servidor
 * (POST /api/lote/operacao → ctx.publicar.operacao, server/routes/telas.js),
 * com a sessão de QUEM PEDIU. Então valem as mesmas regras do painel: só
 * TVs desta conta e da loja da pessoa, a versão de cada TV, a porta das
 * peças, tudo ou nada, o Desfazer — e, com a aprovação ligada para o
 * membro, o envio vira PEDIDO na fila do dono (202), nunca em volta dela.
 *
 * O agente não apaga nada: as operações daqui só põem (o aviso, o quiz, a
 * peça); republicar a campanha do mesmo nome troca só o que é dela, como o
 * "Pôr pra rodar" de sempre, e tudo tem Desfazer.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const P = require('../../js/peca-html.js');
const D = require('./decompor');

const PASTA_OURO = path.join(__dirname, '..', '..', 'pecas-ouro');
const CLIMAS = ['escuro', 'claro', 'marca'];

class SemValidacao extends Error {
  constructor(msg) { super(msg || 'o plano não foi validado: nada vai para a TV'); this.code = 'sem-validacao'; this.status = 409; }
}

/*
 * A validação que vale: { chave, conversaId, por, em } gravada quando a
 * pessoa tocou em "Validar", e o plano de agora com a mesma chave.
 */
function conferirValidacao(validacao, plano, chaveDoPlano) {
  if (!validacao || !validacao.chave || !validacao.em) throw new SemValidacao();
  if (!plano || !Array.isArray(plano.itens) || chaveDoPlano(plano.itens) !== validacao.chave || plano.chave !== validacao.chave) {
    throw new SemValidacao('o plano mudou depois da validação: nada vai para a TV');
  }
}

/*
 * O AVISO como peça: o "Aviso de alerta" das peças-ouro (o mesmo do Aviso
 * rápido do painel, web/src/lib/aviso.js), com a marca da conta. O que o
 * aviso não preenche fica vazio e escondido: nada do exemplo vai à TV.
 */
function itemDoAviso(aviso, marca) {
  const k = marca || {};
  const arq = P.doArquivo(fs.readFileSync(path.join(PASTA_OURO, 'servico-alerta.html'), 'utf8'));
  const h = P.higienizar(arq);
  const campos = { kicker: aviso.prioridade === 'urgente' ? 'Urgente' : 'Aviso', titulo: String(aviso.titulo || '').slice(0, 70), apoio: String(aviso.detalhe || '').slice(0, 160) };
  if (k.nome && /data-campo="marca"/.test(h.html)) campos.marca = k.nome;
  const ocultos = [];
  for (const c of h.campos) {
    if (c.tipo !== 'texto' || c.nome === 'marca') continue;
    if (!campos[c.nome]) { campos[c.nome] = ''; ocultos.push(c.nome); }
  }
  return {
    type: 'peca-html', versao: 1, papel: 'destaque', html: h.html, css: h.css, campos, ...(ocultos.length ? { ocultos } : {}),
    marca: { cores: k.cores || [], fonteTitulo: k.fonteTitulo || '', fonteApoio: k.fonteApoio || '' },
    modo: CLIMAS.includes(k.clima) ? k.clima : 'marca', formato: '16/9', duracao: 15,
    origem: { motor: 'ouro', base: 'servico-alerta', pedido: 'aviso: ' + String(aviso.titulo || '').slice(0, 100) },
  };
}

// As TVs (ids) de um item do plano: só as desta pessoa (ctx.telas já vem filtrada pela loja).
function idsDoItem(item, ctx) {
  return D.telasDoAlvo(item.alvo, ctx).map((t) => t.id);
}

/*
 * As entradas da campanha para a operação (o mesmo de web/src/lib/rodar.js,
 * campanhaParaOServidor): cada TV aponta para a entrada do alvo dela.
 */
function entradasDaCampanha(resultado, telas) {
  const lista = (resultado && resultado.telas) || [];
  const disponiveis = telas || [];
  const citadas = new Set(lista.filter((t) => t.alvo && t.alvo.tipo === 'tela').map((t) => t.alvo.id));
  const entradas = [];
  const alvos = [];
  lista.forEach((t, i) => {
    const a = t.alvo || { tipo: 'todas' };
    let dela;
    if (a.tipo === 'tela') dela = disponiveis.filter((d) => d.id === a.id);
    else if (a.tipo === 'grupo') dela = disponiveis.filter((d) => d.grupo === a.nome && !citadas.has(d.id));
    else dela = disponiveis.filter((d) => !citadas.has(d.id));
    const z = t.zonas || {};
    const pecas = (l) => (l || []).map((p) => ({ item: p.item }));
    const faixa = (f) => ({ pecas: pecas(f && f.pecas), mensagens: (f && f.mensagens) || [] });
    const rodape = faixa(z.rodape);
    if (z.rodape && z.rodape.contagem) rodape.contagem = z.rodape.contagem;
    entradas.push({ zonas: { principal: pecas(z.principal), lateral: pecas(z.lateral), cabecalho: faixa(z.cabecalho), rodape } });
    for (const d of dela) if (!alvos.some((x) => x.id === d.id)) alvos.push({ id: d.id, entrada: i });
  });
  return { entradas, telas: alvos };
}

// A resposta da operação, no que o agente conta à pessoa.
function lerEnvio(r, ids) {
  if (r && r.status === 200 && r.corpo && r.corpo.nada) return { estado: 'no-ar', lote: null, telas: ids.length, nada: true };
  // O lote vem como o id (o envio de sempre devolve a string; aceita também { id }).
  const lote = r && r.corpo ? (typeof r.corpo.lote === 'string' ? r.corpo.lote : (r.corpo.lote && r.corpo.lote.id) || null) : null;
  if (r && r.status === 200) return { estado: 'no-ar', lote, telas: ids.length, marcadas: r.corpo.marcadas || [] };
  if (r && r.status === 202) return { estado: 'aprovacao', aprovacao: (r.corpo && r.corpo.aprovacao && r.corpo.aprovacao.id) || '', telas: ids.length, mensagem: (r.corpo && r.corpo.mensagem) || '' };
  return { estado: 'erro', erro: (r && r.corpo && r.corpo.error) || 'não deu para pôr nas TVs', code: (r && r.corpo && r.corpo.code) || '' };
}

/*
 * Publica UM item validado. `env`: { operacao (ctx.publicar.operacao), sess,
 * ctx (com as TVs da pessoa), validacao, plano, chaveDoPlano, hoje }.
 * `conteudo`: o que vai (o item da peça, o quiz, o resultado da campanha).
 */
async function publicarItem(item, conteudo, env) {
  conferirValidacao(env.validacao, env.plano, env.chaveDoPlano);
  if (!env.sess || !env.sess.tenant_id) throw new SemValidacao('sem sessão de quem pediu');
  if (item.recusa || item.manual) return { estado: item.manual ? 'manual' : 'barrado' };
  const ids = idsDoItem(item, env.ctx);
  if (!ids.length) return { estado: 'erro', erro: 'nenhuma TV sua neste alvo' };
  const hoje = env.hoje;
  const quando = item.quando && item.quando.quando === 'ate' && item.quando.ate ? { quando: 'ate', ate: item.quando.ate, faixa: 'manha' } : null;
  let corpo;
  if (item.tipo === 'aviso') {
    const a = item.rascunho.aviso;
    corpo = { operacao: { tipo: 'aviso', item: conteudo.item, aviso: { titulo: a.titulo, prioridade: a.prioridade, ate: a.ate || (quando && quando.ate) || '' } }, telas: ids, hoje };
  } else if (item.tipo === 'quiz') {
    corpo = { operacao: { tipo: 'quiz', quiz: item.rascunho.quiz, zona: item.rascunho.zona, id: conteudo.id }, telas: ids, hoje };
  } else if (item.tipo === 'peca' || item.tipo === 'campanha' || item.tipo === 'ajuste') {
    const telas = (env.ctx.telas || []).filter((t) => ids.includes(t.id)).map((t) => ({ id: t.id, grupo: t.grupo || '' }));
    const { entradas, telas: alvos } = item.tipo === 'peca'
      ? { entradas: [{ zonas: { principal: [{ item: conteudo.item }], lateral: [], cabecalho: { pecas: [], mensagens: [] }, rodape: { pecas: [], mensagens: [] } } }], telas: ids.map((id) => ({ id, entrada: 0 })) }
      : entradasDaCampanha(conteudo.resultado, telas);
    if (!alvos.length) return { estado: 'erro', erro: 'nenhuma TV sua recebe esta campanha' };
    corpo = { operacao: { tipo: 'campanha', nome: conteudo.nome, entradas, trocarLayout: false, quando }, telas: alvos, hoje };
  } else {
    return { estado: 'manual' };
  }
  const r = await env.operacao(env.sess, corpo);
  return Object.assign(lerEnvio(r, ids), { operacao: corpo.operacao.tipo });
}

module.exports = { publicarItem, conferirValidacao, itemDoAviso, entradasDaCampanha, idsDoItem, lerEnvio, SemValidacao };
