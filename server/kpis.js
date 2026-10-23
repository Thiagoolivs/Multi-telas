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

// Número como o ERP manda: 1234.5, "1234,50", "1.234,50", "R$ 1.234,50", "87%".
function numero(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  let s = String(v == null ? '' : v).replace(/[^\d,.-]/g, '');
  if (!s || !/\d/.test(s)) return null;
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  // Só pontos em grupos de três ("1.500", "1.234.567"): é o milhar brasileiro.
  else if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function normalizar(r) {
  if (!r || typeof r !== 'object') return null;
  const nome = corta(r.nome != null ? r.nome : r.chave, 60);
  const chave = chaveDe(r.chave != null && r.chave !== '' ? r.chave : nome);
  const valor = numero(r.valor);
  if (!chave || valor == null) return null;
  const meta = numero(r.meta);
  return { chave, nome: nome || chave, valor, unidade: corta(r.unidade, 12), meta: meta == null ? null : meta };
}

// A entrada do PUSH: { indicadores: [...] }, a lista direto, ou um objeto plano { "vendas-dia": 1234 }.
function daEntrada(corpo) {
  let lista = [];
  if (Array.isArray(corpo)) lista = corpo;
  else if (corpo && Array.isArray(corpo.indicadores)) lista = corpo.indicadores;
  else if (corpo && typeof corpo === 'object') lista = Object.keys(corpo).map((k) => ({ chave: k, nome: k, valor: corpo[k] }));
  return unicos(lista.map(normalizar).filter(Boolean));
}
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
      unidade: m.unidade ? caminho(it, m.unidade) : '', meta: m.meta ? caminho(it, m.meta) : null,
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

module.exports = { normalizar, daEntrada, daResposta, caminho, numero, chaveDe, mapaLimpo, cabecalhosDe, buscarAgora, MAX_INDICADORES, INTERVALO_MIN, AUTH };
