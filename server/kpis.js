/*
 * server/kpis.js — os indicadores da empresa na TV (EXECUTOR D36).
 *
 * O dono: "conexão configurável via endpoint também, para APIs como as do
 * TOTVS Protheus". Dois jeitos de os números chegarem:
 *
 *   PUSH — a empresa manda para nós: POST /api/kpis/entrada com o token do
 *          conector. Serve para o ERP que mora na rede interna (a maioria dos
 *          Protheus): um agendamento lá dentro manda os números, sem abrir
 *          porta nenhuma para fora.
 *   PULL — nós buscamos: um endereço público que responde JSON, com a
 *          autenticação que o dono deu (cifrada, server/segredo.js), sempre
 *          por server/site.js (IP público conferido, limite de tamanho e de
 *          tempo). Um mapa diz onde estão a lista e os campos.
 *
 * Daqui sai a regra pura: o que conta como indicador, como ler a entrada e a
 * resposta, e os cabeçalhos da autenticação.
 */
const MAX_INDICADORES = 50;
const INTERVALO_MIN = 5;
const AUTH = ['nenhum', 'bearer', 'basic', 'cabecalho'];

const corta = (s, n) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim().slice(0, n);
const MARCAS = new RegExp('[' + String.fromCharCode(0x300) + '-' + String.fromCharCode(0x36f) + ']', 'g');
const chaveDe = (s) => String(s == null ? '' : s).normalize('NFD').replace(MARCAS, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);

/*
 * Número como o ERP manda: 1234.5, "1234,50", "1.234,50", "R$ 1.234,50", "87%".
 *
 * E o padrão americano, que o QA de lançamento (03/11) viu virar um número
 * mil vezes menor em silêncio: "1,234.56" era lido como 1,23456. Com vírgula
 * E ponto, o ÚLTIMO separador é o decimal ("1.234,56" e "1,234.56" dão o
 * mesmo número); só vírgulas em grupos de três ("1,234,567") é milhar
 * americano. O que não dá para ler sem chutar é RECUSADO, com o motivo em
 * `aviso` — número errado na TV da fábrica é pior que número nenhum.
 * Devolve { valor, aviso }; `valor` é null quando não deu.
 */
const AMBIGUO = 'não deu para ler o número sem adivinhar — mande como 1234.56 (ponto decimal, sem separador de milhar)';
function lerNumero(v) {
  if (typeof v === 'number') return { valor: Number.isFinite(v) ? v : null, aviso: Number.isFinite(v) ? '' : 'número inválido' };
  let s = String(v == null ? '' : v).replace(/[^\d,.-]/g, '');
  if (!s || !/\d/.test(s)) return { valor: null, aviso: v == null || v === '' ? 'sem valor' : 'o valor não é um número' };
  const virgulas = (s.match(/,/g) || []).length;
  const pontos = (s.match(/\./g) || []).length;
  let aviso = '';
  if (virgulas && pontos) {
    if (s.lastIndexOf(',') > s.lastIndexOf('.')) {
      // Brasileiro: "1.234,56".
      if (!/^-?\d{1,3}(\.\d{3})+,\d+$/.test(s)) return { valor: null, aviso: AMBIGUO };
      s = s.replace(/\./g, '').replace(',', '.');
    } else {
      // Americano: "1,234.56".
      if (!/^-?\d{1,3}(,\d{3})+\.\d+$/.test(s)) return { valor: null, aviso: AMBIGUO };
      s = s.replace(/,/g, '');
      aviso = 'lido no padrão americano (1,234.56 = 1.234,56)';
    }
  } else if (virgulas > 1) {
    // "1,234,567": só pode ser milhar americano.
    if (!/^-?\d{1,3}(,\d{3})+$/.test(s)) return { valor: null, aviso: AMBIGUO };
    s = s.replace(/,/g, '');
    aviso = 'lido no padrão americano (1,234,567 = 1.234.567)';
  } else if (virgulas) {
    s = s.replace(',', '.');
  } else if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) {
    // Só pontos em grupos de três ("1.500", "1.234.567"): é o milhar brasileiro.
    s = s.replace(/\./g, '');
  } else if (pontos > 1) {
    return { valor: null, aviso: AMBIGUO };
  }
  const n = Number(s);
  return Number.isFinite(n) ? { valor: n, aviso } : { valor: null, aviso: 'o valor não é um número' };
}
function numero(v) { return lerNumero(v).valor; }

/*
 * "QUANTO MENOS, MELHOR" (QA de lançamento, 03/11): refugo de 2,6% com meta
 * de 2% aparecia como "🎉 Meta batida! 130%". O ERP pode dizer (`sentido`:
 * "menor" ou "maior", ou `menorMelhor: true`); sem isso, o nome decide —
 * refugo, perda, acidente, falta, atraso… —, e "dias SEM acidente" continua
 * sendo mais é melhor.
 */
function sentidoDaEntrada(r) {
  if (r.menorMelhor === true || r.menor_melhor === true) return 'menor';
  if (r.menorMelhor === false || r.menor_melhor === false) return 'maior';
  const t = String(r.sentido == null ? '' : r.sentido).trim().toLowerCase();
  if (!t) return undefined;
  if (/^(menor|menos|baixo|down|min|menor[-_ ]?(e|é)?[-_ ]?melhor)/.test(t)) return 'menor';
  if (/^(maior|mais|alto|up|max)/.test(t)) return 'maior';
  return undefined;
}
const MENOR_E_MELHOR = /refugo|perda|defeito|acidente|falta|absente|atraso|reclama|retrabalho|devolu|sucata|desperd|incidente|scrap|rotatividade|turnover|espera|parada|quebra|avaria|multa|inadimpl/;
function sentidoDe(i) {
  if (i && (i.sentido === 'menor' || i.sentido === 'maior')) return i.sentido;
  const t = (String((i && i.nome) || '') + ' ' + String((i && i.chave) || '')).normalize('NFD').replace(MARCAS, '').toLowerCase();
  if (/\bsem\b/.test(t)) return 'maior';
  return MENOR_E_MELHOR.test(t) ? 'menor' : 'maior';
}

/*
 * Um indicador da entrada. Só leva o campo que VEIO: o formato simples
 * ({"producao": 10250}) não traz nome, unidade nem meta, e apagava os que o
 * dono tinha configurado (QA de 03/11). Campo ausente fica como estava no
 * banco; `null` de propósito limpa. `nomeNovo` é o nome para quando o
 * indicador ainda não existe.
 */
function normalizarComAviso(r) {
  if (!r || typeof r !== 'object') return { item: null, aviso: 'indicador vazio' };
  const temNome = r.nome != null && String(r.nome).trim() !== '';
  const nome = temNome ? corta(r.nome, 60) : undefined;
  const chave = chaveDe(r.chave != null && r.chave !== '' ? r.chave : (temNome ? r.nome : r.nomeNovo));
  if (!chave) return { item: null, aviso: 'falta a chave ou o nome' };
  const lido = lerNumero(r.valor);
  if (lido.valor == null) return { item: null, chave, aviso: lido.aviso };
  const item = { chave, valor: lido.valor };
  if (nome !== undefined) item.nome = nome;
  else if (r.nomeNovo != null) item.nomeNovo = corta(r.nomeNovo, 60);
  if (r.unidade !== undefined) item.unidade = corta(r.unidade, 12);
  const avisos = lido.aviso ? [lido.aviso] : [];
  if (r.meta !== undefined) {
    const m = r.meta === null || r.meta === '' ? { valor: null, aviso: '' } : lerNumero(r.meta);
    if (m.valor == null && m.aviso) avisos.push('meta: ' + m.aviso);
    else { item.meta = m.valor; if (m.aviso) avisos.push('meta ' + m.aviso); }
  }
  const sentido = sentidoDaEntrada(r);
  if (sentido) item.sentido = sentido;
  return { item, chave, aviso: avisos.join('; ') };
}
function normalizar(r) { return normalizarComAviso(r).item; }

/*
 * A entrada do PUSH: { indicadores: [...] }, a lista direto, ou um objeto
 * plano { "vendas-dia": 1234 }. `comAvisos` devolve também o que foi
 * recusado ou lido com cuidado — o ERP fica sabendo, em vez de o número
 * sumir em silêncio.
 */
function listaDaEntrada(corpo) {
  if (Array.isArray(corpo)) return corpo;
  if (corpo && Array.isArray(corpo.indicadores)) return corpo.indicadores;
  if (corpo && typeof corpo === 'object') return Object.keys(corpo).map((k) => ({ chave: k, nomeNovo: k, valor: corpo[k] }));
  return [];
}
function comAvisos(brutos) {
  const avisos = [];
  const lista = [];
  const vistos = {};
  for (const r of brutos) {
    const n = normalizarComAviso(r);
    const rotulo = n.chave || (r && (r.chave || r.nome)) || '?';
    if (!n.item) { avisos.push({ chave: rotulo, aviso: 'ignorado: ' + n.aviso }); continue; }
    if (vistos[n.item.chave]) { avisos.push({ chave: rotulo, aviso: 'ignorado: chave repetida no mesmo envio' }); continue; }
    vistos[n.item.chave] = true;
    if (lista.length >= MAX_INDICADORES) { avisos.push({ chave: rotulo, aviso: 'ignorado: no máximo ' + MAX_INDICADORES + ' indicadores por envio' }); continue; }
    lista.push(n.item);
    if (n.aviso) avisos.push({ chave: rotulo, aviso: n.aviso });
  }
  return { lista, avisos: avisos.slice(0, 60) };
}
function daEntradaComAvisos(corpo) { return comAvisos(listaDaEntrada(corpo)); }
function daEntrada(corpo) { return daEntradaComAvisos(corpo).lista; }
function unicos(lista) {
  const vistos = {};
  return lista.filter((x) => (vistos[x.chave] ? false : (vistos[x.chave] = true))).slice(0, MAX_INDICADORES);
}

// "dados.itens.0" num objeto.
function caminho(obj, p) {
  if (!p) return obj;
  return String(p).split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

/*
 * A resposta do PULL, pelo mapa do dono:
 *   { lista: 'items', chave: 'codigo', nome: 'descricao', valor: 'realizado', unidade: 'un', meta: 'meta' }
 * Lista de objetos → cada um vira um indicador pelos campos; objeto plano →
 * cada chave vira um indicador (o caso mais simples de API).
 */
function daResposta(json, mapa) {
  const m = mapa || {};
  const alvo = caminho(json, m.lista);
  if (Array.isArray(alvo)) {
    return unicos(alvo.map((it) => normalizar({
      chave: caminho(it, m.chave || 'chave'), nome: caminho(it, m.nome || 'nome'), valor: caminho(it, m.valor || 'valor'),
      // Campo que o mapa não aponta não vem: fica o que já estava (meta e unidade não somem).
      unidade: m.unidade ? caminho(it, m.unidade) : undefined, meta: m.meta ? caminho(it, m.meta) : undefined,
    })).filter(Boolean));
  }
  if (alvo && typeof alvo === 'object') return daEntrada(alvo);
  return [];
}

function mapaLimpo(m) {
  const o = m && typeof m === 'object' ? m : {};
  const campo = (v) => corta(v, 80).replace(/[^\w.\-]/g, '');
  return { lista: campo(o.lista), chave: campo(o.chave), nome: campo(o.nome), valor: campo(o.valor), unidade: campo(o.unidade), meta: campo(o.meta) };
}

// Os cabeçalhos da autenticação (segredo já decifrado). Basic: "usuario:senha".
function cabecalhosDe(tipo, nome, segredo) {
  if (!segredo || tipo === 'nenhum' || !AUTH.includes(tipo)) return {};
  if (tipo === 'bearer') return { authorization: 'Bearer ' + segredo };
  if (tipo === 'basic') return { authorization: 'Basic ' + Buffer.from(segredo, 'utf8').toString('base64') };
  const n = String(nome || '').trim();
  return /^[A-Za-z0-9-]{1,40}$/.test(n) && !/^(host|cookie|content-length|transfer-encoding|connection)$/i.test(n) ? { [n.toLowerCase()]: segredo } : {};
}

/*
 * Busca um conector PULL agora (o relógio do servidor ou o "Testar agora"
 * do painel). `linha` é a do banco (com o segredo cifrado). Grava os
 * indicadores e o resultado no conector; devolve { lista } ou { erro }.
 */
async function buscarAgora(linha, { db, site, segredo, agora, politica }) {
  const quando = Number(agora) || Date.now();
  const proxima = quando + Math.max(INTERVALO_MIN, Number(linha.intervalo_min) || 15) * 60000;
  const falhou = async (erro) => {
    await db.atualizarConector(linha.id, linha.tenant_id, { ultimoErro: erro, proxima });
    return { erro };
  };
  /*
   * A PLANILHA (fase 11): o caminho fácil, para quem não tem TI. O link do
   * Google Planilhas vira o CSV, uma linha por indicador (nome; valor; meta;
   * unidade; anterior). Só hosts do Google (server/planilha.js). Erro não
   * apaga o número de antes: a TV continua com o último bom.
   */
  if (linha.modo === 'planilha') {
    const P = require('./planilha');
    const r = await P.buscarCsv(linha.url, { politica });
    if (r.erro) return falhou(r.erro);
    const { lista, avisos } = P.lerIndicadores(r.linhas);
    if (!lista.length) return falhou((avisos[0] && avisos[0].aviso) ? 'nenhum indicador na planilha: ' + avisos[0].aviso : 'nenhum indicador na planilha — a primeira coluna é o nome e a segunda, o número');
    await db.gravarIndicadores(linha.tenant_id, linha.id, lista, quando);
    await db.atualizarConector(linha.id, linha.tenant_id, { ultimoOk: quando, ultimoErro: '', proxima });
    return { lista, avisos };
  }
  const senha = linha.auth_segredo ? segredo.decifrar(linha.auth_segredo) : '';
  if (linha.auth_segredo && !senha) return falhou('não deu para abrir a autenticação guardada — salve de novo');
  let mapa = {};
  try { mapa = JSON.parse(linha.mapa || '{}'); } catch (e) { mapa = {}; }
  const r = await site.buscarJson(linha.url, cabecalhosDe(linha.auth_tipo, linha.auth_nome, senha), politica);
  if (r.erro) return falhou(r.erro);
  const lista = daResposta(r.json, mapa);
  if (!lista.length) return falhou('a resposta não trouxe nenhum indicador — confira onde está a lista e os campos');
  await db.gravarIndicadores(linha.tenant_id, linha.id, lista, quando);
  await db.atualizarConector(linha.id, linha.tenant_id, { ultimoOk: quando, ultimoErro: '', proxima });
  return { lista };
}

module.exports = { normalizar, normalizarComAviso, daEntrada, daEntradaComAvisos, lerNumero, sentidoDe, daResposta, caminho, numero, chaveDe, mapaLimpo, cabecalhosDe, buscarAgora, MAX_INDICADORES, INTERVALO_MIN, AUTH };
