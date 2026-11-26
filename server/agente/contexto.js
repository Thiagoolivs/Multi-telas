/*
 * server/agente/contexto.js — o que o agente sabe da conta.
 *
 * A rota da conversa já monta o básico (server/routes/conversas.js,
 * contexto): empresa, frente, marca, memória, TVs e grupos, campanhas. O
 * agente precisa de mais, e cada coisa tem um porquê:
 *
 *   noAr          os textos do que passa agora em cada TV: o que é novo não
 *                 pode repetir o que já está na parede (variedade);
 *   recentes      os nomes e títulos das últimas campanhas: pedir de novo não
 *                 devolve a mesma peça;
 *   zonas         as zonas do layout de cada TV (lateral? cabeçalho?);
 *   aniversariantes  os nomes do mês que a CONTA importou (Automáticos) —
 *                 o único nome de pessoa que o agente usa sem a pessoa dizer;
 *   ouro          as famílias de peças-ouro aprovadas para a frente;
 *   permissao     o papel de quem pede, se a conta pede aprovação, se a
 *                 pessoa só alcança algumas lojas.
 *
 * Tudo é lido com a sessão de quem pede: TVs de outra loja (ou de outra
 * conta) nem entram aqui.
 */
'use strict';

const L = require('../../js/templates.js');
const permissoes = require('../permissoes');
const { textosDaPeca } = require('../compositor');
const { corta } = require('./guarda');

function configDe(d) {
  try { return typeof d.config === 'string' ? JSON.parse(d.config || '{}') : (d.config || {}); } catch (e) { return {}; }
}

// Os textos de um item da TV, curtos (o título primeiro).
function textosDoItem(it) {
  if (!it || typeof it !== 'object') return [];
  if (it.type === 'peca-html') {
    const t = textosDaPeca(it);
    return [t.titulo, t.titulo1 && [t.titulo1, t.titulo2].filter(Boolean).join(' '), t.chamada, t.kicker, t.apoio].filter(Boolean).map((x) => corta(x, 80));
  }
  return [it.titulo, it.title, it.texto, it.text, it.corpo].filter((x) => typeof x === 'string' && x.trim()).map((x) => corta(x, 80));
}

// O que passa agora numa TV: os textos de cada zona (sem repetir), no máximo `max`.
function noArDaTela(cfg, max) {
  const z = (cfg && cfg.zonas) || {};
  const textos = [];
  for (const id of Object.keys(z)) {
    const zona = z[id] || {};
    const itens = [].concat(Array.isArray(zona.items) ? zona.items : [], Array.isArray(zona.pecas) ? zona.pecas : [], zona.peca ? [zona.peca] : []);
    for (const it of itens) for (const t of textosDoItem(it)) if (!textos.includes(t)) textos.push(t);
    for (const m of [].concat(zona.messages || [], zona.mensagens || [])) if (typeof m === 'string' && !textos.includes(corta(m, 80))) textos.push(corta(m, 80));
  }
  return textos.slice(0, max || 30);
}

function zonasDoLayout(layoutId) {
  try {
    const l = L.getLayout(layoutId || 'dashboard');
    return (l.zones || []).map((x) => x.id);
  } catch (e) { return []; }
}

// Os aniversariantes do mês (só o nome, como a conta importou).
function aniversariantesDoMes(lista, hoje) {
  const mes = (hoje || new Date()).getMonth() + 1;
  return (lista || []).filter((p) => p && Number(p.mes || p.month) === mes)
    .map((p) => ({ nome: corta(p.nome || p.name, 40), dia: Number(p.dia || p.day) || 0 }))
    .filter((p) => p.nome).sort((a, b) => a.dia - b.dia).slice(0, 30);
}

function ouroDaFrente(perfil) {
  try {
    const m = require('../../pecas-ouro/manifesto.json');
    const fam = new Set();
    for (const p of m.pecas || []) {
      if (p.estado && p.estado !== 'aprovada') continue;
      if (Array.isArray(p.frentes) && p.frentes.length && perfil && !p.frentes.includes(perfil)) continue;
      if (p.familia) fam.add(p.familia);
    }
    return [...fam].slice(0, 20);
  } catch (e) { return []; }
}

/*
 * Completa o contexto da rota (`base`) com o que o agente usa. `db` e `sess`
 * são os da requisição. Nada aqui é obrigatório: o que não deu para ler fica
 * vazio, e o agente segue com menos.
 */
async function completar(db, sess, base) {
  const c = Object.assign({}, base || {});
  const tenantId = sess && sess.tenant_id;
  const hoje = c.hoje ? new Date(c.hoje + 'T12:00:00') : new Date();
  const [devices, campanhas, pessoas] = await Promise.all([
    tenantId ? db.listDevices(tenantId).then((l) => permissoes.filtrar(sess, l)).catch(() => []) : [],
    tenantId && db.listarCampanhas ? db.listarCampanhas(tenantId, 12).catch(() => []) : [],
    tenantId && db.listBirthdays ? db.listBirthdays(tenantId).catch(() => []) : [],
  ]);
  const porId = new Map((devices || []).map((d) => [d.id, d]));
  /*
   * A lista de TVs não traz a programação: lê cada uma (até MAX_LIDAS — numa
   * conta de 300 TVs, as mesmas peças se repetem, e 24 bastam para saber o
   * que está no ar).
   */
  const MAX_LIDAS = 24;
  const ids = (c.telas || []).filter((t) => porId.has(t.id)).map((t) => t.id);
  const lidas = new Map();
  if (db.getDevice) {
    await Promise.all(ids.slice(0, MAX_LIDAS).map((id) => db.getDevice(id).then((d) => {
      if (d && d.tenant_id === tenantId) lidas.set(id, d);
    }).catch(() => {})));
  }
  c.telas = (c.telas || []).filter((t) => porId.has(t.id)).map((t) => {
    const cfg = configDe(lidas.get(t.id) || porId.get(t.id));
    return Object.assign({}, t, { zonas: zonasDoLayout((cfg.settings || {}).layoutId || t.layout), noAr: noArDaTela(cfg, 20) });
  });
  const noAr = [];
  for (const t of c.telas) for (const x of t.noAr) if (!noAr.includes(x)) noAr.push(x);
  c.noAr = noAr.slice(0, 40);
  // As campanhas recentes: o nome e o título da capa (o que a pessoa viu na TV).
  const recentes = [];
  for (const x of campanhas || []) {
    for (const t of [corta(x.nome, 60)].concat(x.capa && x.capa.item ? textosDoItem(x.capa.item).slice(0, 1) : [])) if (t && !recentes.includes(t)) recentes.push(t);
  }
  c.recentes = recentes.slice(0, 20);
  c.aniversariantes = aniversariantesDoMes(pessoas, hoje);
  c.ouro = ouroDaFrente(c.perfil);
  c.permissao = {
    papel: (sess && sess.role) || '',
    precisaAprovar: !!(sess && sess.precisaAprovar),
    lojas: sess && Array.isArray(sess.lojas) ? sess.lojas.slice(0, 20) : null,
  };
  return c;
}

/*
 * O contexto em texto, curto, para o prompt do agente. O que é da conta (o
 * nome da empresa, as observações da marca, o que está no ar) é DADO: vai
 * marcado (server/agente/guarda.js, comoDado).
 */
function comoTexto(c, comoDado) {
  const x = c || {};
  const telas = (x.telas || []).map((t) => '"' + t.nome + '"' + (t.grupo ? ' [grupo ' + t.grupo + ']' : '') + (t.emPe ? ' (em pé)' : '') + (t.zonas && t.zonas.length ? ' zonas: ' + t.zonas.join('/') : ''));
  const linhas = [
    x.hoje ? 'HOJE: ' + x.hoje + (x.diaSemana ? ' (' + x.diaSemana + ')' : '') : '',
    'FRENTE: ' + (x.perfil || 'comercio'),
    'TVS DESTA PESSOA: ' + (telas.join('; ') || '(nenhuma ligada ainda)'),
    'GRUPOS: ' + ((x.grupos || []).join(', ') || '(nenhum)'),
    x.permissao && x.permissao.precisaAprovar ? 'PERMISSÃO: o que esta pessoa põe na TV vai para a aprovação do dono.' : '',
    (x.campanhas || []).length ? 'CAMPANHAS CRIADAS: ' + x.campanhas.slice(0, 10).map((k) => '"' + k.nome + '"').join(', ') : '',
    (x.aniversariantes || []).length ? 'ANIVERSARIANTES DO MÊS (da planilha da conta): ' + x.aniversariantes.map((p) => p.nome + (p.dia ? ' (' + p.dia + ')' : '')).join(', ') : '',
  ].filter(Boolean);
  const dados = [
    x.empresa ? 'Empresa: ' + x.empresa : '',
    x.segmento ? 'Segmento: ' + x.segmento : '',
    x.marca && x.marca.tom ? 'Tom da marca: ' + x.marca.tom : '',
    x.marca && x.marca.observacoes ? 'Regras da marca: ' + x.marca.observacoes : '',
    (x.noAr || []).length ? 'No ar agora: ' + x.noAr.slice(0, 20).join(' | ') : '',
  ].filter(Boolean).join('\n');
  return linhas.join('\n') + (dados ? '\n' + comoDado(dados, 'da conta') : '');
}

module.exports = { completar, comoTexto, noArDaTela, textosDoItem, aniversariantesDoMes, zonasDoLayout, configDe };
