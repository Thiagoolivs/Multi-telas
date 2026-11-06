/*
 * server/planilha.js — preço, cardápio e indicadores vindos de uma planilha
 * (fase 11, "dados vivos").
 *
 * O dono de loja já tem a planilha dos preços. Pedir que ele digite tudo de
 * novo no painel — e lembre de mudar nos dois lugares — é o caminho para o
 * preço errado na TV. Aqui ele cola o link do Google Planilhas (ou manda o
 * CSV) e o servidor lê de tempos em tempos.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * É UM PEDIDO HTTP COM ENDEREÇO QUE O CLIENTE COLA. As defesas:
 *
 *   1. só os hosts do Google Planilhas: docs.google.com e o de onde ele
 *      entrega o arquivo (docs.googleusercontent.com e os
 *      doc-…-sheets.googleusercontent.com), sempre em https. Nenhum outro
 *      host, nem por redirecionamento: cada salto passa por `politica`;
 *   2. por cima disso, a checagem de server/site.js (o IP resolvido não
 *      pode ser de rede interna, e a conexão vai no IP conferido);
 *   3. tempo (o de site.js, 8 s) e tamanho (LIMITE_BYTES) com teto;
 *   4. a resposta é DADO: vira linhas de texto curtas e números, nunca HTML.
 *
 * Para o teste local existe PLANILHA_HOST_TESTE ("127.0.0.1:5990"): DESLIGADO
 * por padrão e ignorado em produção (RAILWAY_ENVIRONMENT ou NODE_ENV=production). Ele libera só
 * aquele host:porta, para o teste servir um CSV sem tocar a internet.
 */
const site = require('./site');
const K = require('./kpis');

const LIMITE_BYTES = 512 * 1024;      // um cardápio inteiro cabe em 20 KB
const MAX_LINHAS = 300;
const MAX_COLUNAS = 30;
const INTERVALO_MS = 5 * 60 * 1000;   // a TV fica no máximo 5 min atrás da planilha
const TIPO_CSV = /text\/csv|text\/plain|application\/csv|application\/vnd\.ms-excel|application\/octet-stream|text\/comma-separated-values|text\/tab-separated-values/i;

const corta = (s, n) => String(s == null ? '' : s).replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);
const semAcento = (s) => String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

/* ---------------- Os hosts que podem ---------------- */

const HOSTS_GOOGLE = ['docs.google.com', 'docs.googleusercontent.com'];
// Onde o Google entrega o CSV depois do redirecionamento: doc-0g-2c-sheets.googleusercontent.com.
const ENTREGA_GOOGLE = /^doc-[a-z0-9-]{1,40}-sheets\.googleusercontent\.com$/;

function hostDeTeste() {
  if (process.env.RAILWAY_ENVIRONMENT || process.env.NODE_ENV === 'production') return '';
  return String(process.env.PLANILHA_HOST_TESTE || '').trim().toLowerCase();
}
function hostPermitido(u) {
  const host = String(u.hostname || '').toLowerCase();
  if (u.protocol === 'https:' && !u.port && (HOSTS_GOOGLE.includes(host) || ENTREGA_GOOGLE.test(host))) return 'google';
  const teste = hostDeTeste();
  if (teste && u.host.toLowerCase() === teste && (u.protocol === 'http:' || u.protocol === 'https:')) return 'teste';
  return '';
}

const NAO_COMPARTILHADA = 'a planilha não está aberta para quem tem o link. No Google Planilhas, toque em Compartilhar, escolha "Qualquer pessoa com o link" (Leitor) e tente de novo';

/*
 * A checagem de cada salto (o primeiro e cada redirecionamento). O Google
 * manda para a tela de login quando a planilha é fechada: isso não é um
 * host que se visita, é a resposta "não está compartilhada", dita em
 * palavras.
 */
async function politica(alvo) {
  let u;
  try { u = new URL(alvo); } catch (e) { return { erro: 'endereço inválido' }; }
  if (/(^|\.)accounts\.google\.com$/i.test(u.hostname)) return { erro: NAO_COMPARTILHADA };
  const tipo = hostPermitido(u);
  if (!tipo) return { erro: 'só dá para ler planilhas do Google Planilhas (docs.google.com) ou um arquivo CSV enviado aqui' };
  // O host de teste mora, por definição, num IP local: só ele pula a checagem de rede interna.
  if (tipo === 'teste') return { url: u, ip: require('net').isIP(u.hostname) ? u.hostname : '127.0.0.1' };
  return site.conferir(alvo);
}

/*
 * O link que a pessoa cola → o endereço do CSV.
 *
 *   …/spreadsheets/d/<id>/edit?usp=sharing#gid=123   → …/d/<id>/export?format=csv&gid=123
 *   …/spreadsheets/d/<id>/export?format=csv&gid=0    → o mesmo
 *   …/spreadsheets/d/e/<pub>/pubhtml?gid=1&single=true → …/d/e/<pub>/pub?output=csv&gid=1&single=true
 *   …/spreadsheets/d/e/<pub>/pub?output=csv          → o mesmo
 *
 * Devolve { url } ou { erro } com o que fazer.
 */
function linkParaCsv(bruto) {
  const texto = String(bruto || '').trim();
  if (!texto) return { erro: 'cole o link da planilha' };
  let u;
  try { u = new URL(/^https?:\/\//i.test(texto) ? texto : 'https://' + texto); } catch (e) { return { erro: 'isso não parece um link' }; }
  if (hostPermitido(u) === 'teste') return { url: u.href };
  if (u.hostname.toLowerCase() !== 'docs.google.com') {
    return { erro: 'cole o link de uma planilha do Google (começa com docs.google.com/spreadsheets) ou envie o arquivo CSV' };
  }
  const gidDe = () => {
    const h = /(?:^|[#&])gid=(\d{1,12})/.exec(u.hash || '');
    const q = u.searchParams.get('gid');
    return (q && /^\d{1,12}$/.test(q)) ? q : (h ? h[1] : '');
  };
  const pub = /^\/spreadsheets\/d\/e\/([A-Za-z0-9_-]{20,200})(?:\/|$)/.exec(u.pathname);
  if (pub) {
    const p = new URLSearchParams({ output: 'csv' });
    const gid = gidDe();
    if (gid) { p.set('gid', gid); p.set('single', 'true'); }
    return { url: 'https://docs.google.com/spreadsheets/d/e/' + pub[1] + '/pub?' + p.toString() };
  }
  const doc = /^\/spreadsheets\/d\/([A-Za-z0-9_-]{20,200})(?:\/|$)/.exec(u.pathname);
  if (!doc) return { erro: 'esse link não é de uma planilha. Abra a planilha no Google Planilhas e copie o link da barra de endereço' };
  const p = new URLSearchParams({ format: 'csv' });
  const gid = gidDe();
  if (gid) p.set('gid', gid);
  return { url: 'https://docs.google.com/spreadsheets/d/' + doc[1] + '/export?' + p.toString() };
}

/* ---------------- O CSV ---------------- */

/*
 * CSV como as planilhas exportam: aspas com aspas dobradas dentro, quebra de
 * linha dentro das aspas, e o separador que vier — vírgula (Google), ponto e
 * vírgula (Excel em português) ou tab (copiar e colar). O separador é o que
 * aparece FORA das aspas em mais linhas (das 20 primeiras); no empate, tab,
 * depois ponto e vírgula — no Brasil a vírgula também é a do centavo
 * ("Café;6,00"), e a primeira linha pode ser um título sem separador.
 */
function separadorDe(texto) {
  const linhas = String(texto).split(/\r?\n/).filter((l) => l.trim()).slice(0, 20).map((l) => l.replace(/"[^"]*"/g, ''));
  let melhor = [',', 0];
  for (const c of ['\t', ';', ',']) {
    const n = linhas.filter((l) => l.indexOf(c) >= 0).length;
    if (n > melhor[1]) melhor = [c, n];
  }
  return melhor[0];
}
function lerCsv(bruto) {
  const texto = String(bruto == null ? '' : bruto).replace(/^﻿/, '').slice(0, LIMITE_BYTES);
  const sep = separadorDe(texto);
  const linhas = [];
  let linha = [];
  let campo = '';
  let aspas = false;
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (aspas) {
      if (c === '"') {
        if (texto[i + 1] === '"') { campo += '"'; i++; } else aspas = false;
      } else campo += c;
      continue;
    }
    if (c === '"' && campo.trim() === '') { aspas = true; campo = ''; continue; }
    if (c === sep) { linha.push(campo); campo = ''; continue; }
    if (c === '\n' || c === '\r') {
      if (c === '\r' && texto[i + 1] === '\n') i++;
      linha.push(campo); campo = '';
      if (linha.some((x) => String(x).trim() !== '')) linhas.push(linha.slice(0, MAX_COLUNAS).map((x) => String(x).trim()));
      linha = [];
      if (linhas.length >= MAX_LINHAS + 1) break;
      continue;
    }
    campo += c;
  }
  linha.push(campo);
  if (linhas.length < MAX_LINHAS + 1 && linha.some((x) => String(x).trim() !== '')) linhas.push(linha.slice(0, MAX_COLUNAS).map((x) => String(x).trim()));
  return linhas;
}

/*
 * As colunas pelo cabeçalho. Sem cabeçalho reconhecível, vale a ordem
 * combinada (a que o painel ensina): item; preço; seção; descrição.
 */
const COLUNAS_PRECO = {
  item: /^(item|itens|produto|produtos|nome|servico|servicos|exame|exames|prato|pratos|sabor|bebida|lanche|procedimento|descricao do item)\b/,
  preco: /^(preco|precos|valor|valores|r\$|preco \(r\$\)|preco r\$|venda|preco de venda)\b/,
  secao: /^(secao|secoes|categoria|categorias|grupo|grupos|tipo|setor|departamento)\b/,
  descricao: /^(descricao|detalhe|detalhes|obs|observacao|medida|unidade|tamanho|porcao|complemento)\b/,
};
function colunasPeloCabecalho(cab, mapa) {
  const nomes = cab.map(semAcento);
  const achado = {};
  Object.keys(mapa).forEach((campo) => {
    const i = nomes.findIndex((n, j) => mapa[campo].test(n) && !Object.values(achado).includes(j));
    if (i >= 0) achado[campo] = i;
  });
  return achado;
}
const pareceNumero = (s) => K.lerNumero(s).valor != null && /\d/.test(String(s || ''));

/*
 * As linhas do CSV → os itens com preço. Cada item:
 *   { item, preco (número ou null), texto (o preço quando não é número,
 *     como "Consulte"), secao, descricao }
 * Linha só com o nome (sem preço) e sem coluna de seção vira título de
 * seção para as linhas de baixo — o mesmo jeito da tabela colada à mão
 * (js/precos.js).
 */
function lerPrecos(linhasCsv) {
  const linhas = (linhasCsv || []).slice(0, MAX_LINHAS + 1);
  if (!linhas.length) return { itens: [], aviso: 'a planilha está vazia' };
  let col = colunasPeloCabecalho(linhas[0], COLUNAS_PRECO);
  let corpo = linhas;
  if (col.item != null && col.preco != null) corpo = linhas.slice(1);
  else {
    // Primeira linha sem número onde a segunda tem: é um cabeçalho com outros nomes.
    const temCab = linhas.length > 1 && corta(linhas[0][1], 30) && !pareceNumero(linhas[0][1]) && pareceNumero(linhas[1][1]);
    col = { item: 0, preco: 1, secao: 2, descricao: 3 };
    if (temCab) corpo = linhas.slice(1);
  }
  const temColunaSecao = col.secao != null && corpo.some((l) => corta(l[col.secao], 40));
  const itens = [];
  let secaoAtual = '';
  let semPreco = 0;
  for (const l of corpo) {
    const item = corta(l[col.item], 80);
    const precoBruto = corta(l[col.preco], 30);
    const secao = temColunaSecao ? corta(l[col.secao], 40) : '';
    const descricao = col.descricao != null ? corta(l[col.descricao], 120) : '';
    if (!item && !precoBruto) continue;
    if (!precoBruto && !temColunaSecao && !descricao) { secaoAtual = item; continue; }
    if (!item) continue;
    const lido = precoBruto ? K.lerNumero(precoBruto) : { valor: null };
    const preco = lido.valor != null && lido.valor >= 0 && lido.valor < 1e7 ? Math.round(lido.valor * 100) / 100 : null;
    if (preco == null) semPreco++;
    itens.push({ item, preco, texto: preco == null ? corta(precoBruto, 20) : '', secao: secao || secaoAtual, descricao });
    if (itens.length >= MAX_LINHAS) break;
  }
  if (!itens.length) return { itens, aviso: 'não achei nenhum item com preço. A primeira coluna é o item e a segunda, o preço' };
  return { itens, aviso: semPreco ? (semPreco === 1 ? '1 item ficou sem preço (a célula não tem um número)' : semPreco + ' itens ficaram sem preço (a célula não tem um número)') : '' };
}

/*
 * As linhas do CSV → os indicadores. Uma linha por indicador:
 *   nome; valor; meta; unidade; anterior; sentido
 * (pelo cabeçalho, ou nessa ordem). "Anterior" é o número de antes — o
 * mês passado, ontem — e dá a seta de subiu/desceu; sem ele, a seta sai
 * da diferença entre uma leitura e a outra.
 */
const COLUNAS_KPI = {
  nome: /^(nome|indicador|indicadores|kpi|metrica|item|descricao)\b/,
  valor: /^(valor|atual|realizado|resultado|numero|total|hoje|quantidade|qtd)\b/,
  meta: /^(meta|objetivo|alvo|previsto|orcado)\b/,
  unidade: /^(unidade|un|medida)\b/,
  anterior: /^(anterior|antes|mes passado|mes anterior|ontem|semana passada|ultimo)\b/,
  sentido: /^(sentido|melhor|menor e melhor|tendencia)\b/,
};
function lerIndicadores(linhasCsv) {
  const linhas = (linhasCsv || []).slice(0, K.MAX_INDICADORES + 1);
  if (!linhas.length) return { lista: [], avisos: [{ chave: '?', aviso: 'a planilha está vazia' }] };
  let col = colunasPeloCabecalho(linhas[0], COLUNAS_KPI);
  let corpo = linhas;
  if (col.nome != null && col.valor != null) corpo = linhas.slice(1);
  else {
    const temCab = linhas.length > 1 && corta(linhas[0][1], 30) && !pareceNumero(linhas[0][1]) && pareceNumero(linhas[1][1]);
    col = { nome: 0, valor: 1, meta: 2, unidade: 3, anterior: 4, sentido: 5 };
    if (temCab) corpo = linhas.slice(1);
  }
  const brutos = corpo.filter((l) => corta(l[col.nome], 60)).map((l) => {
    const r = { nome: corta(l[col.nome], 60), valor: l[col.valor] };
    // Célula vazia é "não mexe" (undefined); só o que está escrito entra.
    if (col.meta != null && corta(l[col.meta], 30)) r.meta = l[col.meta];
    if (col.unidade != null && corta(l[col.unidade], 12)) r.unidade = l[col.unidade];
    if (col.sentido != null && corta(l[col.sentido], 30)) r.sentido = l[col.sentido];
    if (col.anterior != null && corta(l[col.anterior], 30)) r.anteriorBruto = l[col.anterior];
    return r;
  });
  const { lista, avisos } = K.daEntradaComAvisos({ indicadores: brutos });
  // O "anterior" da planilha (a entrada dos indicadores não conhece esse campo).
  lista.forEach((i) => {
    const b = brutos.find((x) => K.chaveDe(x.nome) === i.chave);
    const a = b && b.anteriorBruto != null ? K.lerNumero(b.anteriorBruto).valor : null;
    if (a != null) i.anterior = a;
  });
  return { lista, avisos };
}

/* ---------------- A busca ---------------- */

/*
 * Busca o CSV de um link do Google (já convertido por linkParaCsv). Devolve
 * { linhas } (a tabela crua) ou { erro } em palavras para o painel.
 * `opcoes.politica`: só o teste troca.
 */
async function buscarCsv(url, opcoes) {
  const o = opcoes || {};
  const r = await site.buscar(url, o.politica || politica, /.*/, 'text/csv,text/plain;q=0.9,*/*;q=0.1', null, LIMITE_BYTES);
  if (r.erro) {
    if (/respondeu 40[134]/.test(r.erro)) return { erro: r.erro.indexOf('404') >= 0 ? 'a planilha não foi encontrada — ela foi apagada ou o link está errado' : NAO_COMPARTILHADA };
    const cinco = /respondeu (5\d\d)/.exec(r.erro);
    if (cinco) return { erro: 'o Google não respondeu agora (erro ' + cinco[1] + '). Tentamos de novo em 5 minutos' };
    return { erro: r.erro.replace(/^o site /, 'o Google ') };
  }
  if (r.cortado) return { erro: 'a planilha passou de ' + Math.round(LIMITE_BYTES / 1024) + ' KB. Deixe numa aba só os itens que vão para a TV' };
  if (/text\/html|xhtml/i.test(r.tipo || '') || /^\s*<(!doctype|html)/i.test(r.html || '')) return { erro: NAO_COMPARTILHADA };
  if (!TIPO_CSV.test(r.tipo || '') && r.tipo) return { erro: 'o link não devolveu uma planilha (veio ' + String(r.tipo).split(';')[0] + ')' };
  return { linhas: lerCsv(r.html) };
}

/*
 * Lê a planilha de preços agora (o relógio, o "Atualizar agora" ou a criação)
 * e grava o resultado. Planilha com erro NÃO apaga os preços de antes: a TV
 * continua com os últimos bons, e o painel mostra o erro em palavras.
 * `linha` é a do banco. Devolve { itens, mudou } ou { erro }.
 */
async function atualizarAgora(linha, { db, agora, politica: pol }) {
  const quando = Number(agora) || Date.now();
  const proxima = quando + INTERVALO_MS;
  let tabela;
  if (linha.origem === 'csv') tabela = { linhas: lerCsv(linha.csv || '') };
  else tabela = await buscarCsv(linha.url, { politica: pol });
  const falhou = async (erro) => {
    await db.atualizarPlanilha(linha.id, linha.tenant_id, { ultimoErro: corta(erro, 300), proxima });
    return { erro };
  };
  if (tabela.erro) return falhou(tabela.erro);
  const { itens, aviso } = lerPrecos(tabela.linhas);
  if (!itens.length) return falhou(aviso);
  const json = JSON.stringify(itens);
  const mudou = json !== (linha.linhas || '');
  await db.atualizarPlanilha(linha.id, linha.tenant_id, { linhas: json, ultimoOk: quando, ultimoErro: '', aviso: aviso || '', proxima });
  return { itens, mudou, aviso };
}

// O que a TV recebe de cada planilha: só o que ela desenha.
function paraTv(p) {
  return { id: p.id, nome: p.nome, itens: p.itens || [], em: p.ultimoOk || 0 };
}

module.exports = {
  linkParaCsv, politica, hostPermitido, lerCsv, separadorDe, lerPrecos, lerIndicadores, buscarCsv, atualizarAgora, paraTv,
  LIMITE_BYTES, MAX_LINHAS, INTERVALO_MS, NAO_COMPARTILHADA,
};
