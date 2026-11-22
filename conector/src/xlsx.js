'use strict';
/*
 * A primeira aba de um .xlsx → linhas → CSV. Sem biblioteca.
 *
 * É a mesma leitura que o painel já faz na importação de Pessoas
 * (web/src/lib/planilha.js): o .xlsx é um ZIP de XMLs; basta achar a
 * primeira aba pelo workbook e pelas relações, as palavras compartilhadas e
 * as células. A diferença: aqui o Node descompacta (zlib) e, como o destino é
 * um CSV para qualquer uso (cardápio, metas, escala), as datas saem como o
 * Excel as mostra (dd/mm/aaaa), não como o número interno.
 *
 * Proteções: ZIP que descompacta para mais de 50 MB por parte é recusado
 * (bomba de ZIP), e nenhum XML é interpretado com entidades externas — só
 * expressões regulares sobre texto.
 */
const zlib = require('node:zlib');

const MAX_PARTE = 50 * 1024 * 1024;

const u16 = (b, o) => b[o] | (b[o + 1] << 8);
const u32 = (b, o) => (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;

// Os arquivos do ZIP que a gente quer: nome → bytes.
function abrirZip(buf, querer) {
  let fim = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) if (u32(buf, i) === 0x06054b50) { fim = i; break; }
  if (fim < 0) throw new Error('o arquivo .xlsx está danificado (não é um ZIP completo; ainda está sendo salvo?)');
  const total = u16(buf, fim + 10);
  let p = u32(buf, fim + 16);
  if (total === 0xffff || p === 0xffffffff) throw new Error('planilha grande demais (ZIP64): salve uma versão menor ou como CSV');
  const out = {};
  const nomes = new TextDecoder();
  for (let n = 0; n < total && p + 46 <= buf.length && u32(buf, p) === 0x02014b50; n++) {
    const metodo = u16(buf, p + 10);
    const tamanho = u32(buf, p + 20);
    const lNome = u16(buf, p + 28);
    const lExtra = u16(buf, p + 30);
    const lComent = u16(buf, p + 32);
    const local = u32(buf, p + 42);
    const nome = nomes.decode(buf.subarray(p + 46, p + 46 + lNome));
    p += 46 + lNome + lExtra + lComent;
    if (!querer(nome)) continue;
    if (local + 30 > buf.length) throw new Error('o arquivo .xlsx está danificado');
    const ini = local + 30 + u16(buf, local + 26) + u16(buf, local + 28);
    const dados = buf.subarray(ini, ini + tamanho);
    if (metodo === 8) out[nome] = zlib.inflateRawSync(dados, { maxOutputLength: MAX_PARTE });
    else if (metodo === 0) out[nome] = dados;
    else throw new Error('compressão do .xlsx não suportada (método ' + metodo + ')');
  }
  return out;
}

const ENTIDADES = { lt: '<', gt: '>', quot: '"', apos: "'", amp: '&' };
const texto = (s) => String(s || '').replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e) => {
  if (e[0] !== '#') return ENTIDADES[e] != null ? ENTIDADES[e] : m;
  const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
  return n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : m;
});
// Os <t> de um trecho (texto rico vem em pedaços), sem a leitura fonética.
const textos = (xml) => (String(xml || '').replace(/<rPh\b[\s\S]*?<\/rPh>/g, '').match(/<t\b[^>]*>[\s\S]*?<\/t>|<t\b[^>]*\/>/g) || [])
  .map((t) => texto(t.replace(/^<t\b[^>]*>|<\/t>$|^<t\b[^>]*\/>$/g, ''))).join('');
const coluna = (ref) => { let n = 0; for (const c of String(ref).replace(/\d+$/, '').toUpperCase()) n = n * 26 + (c.charCodeAt(0) - 64); return n - 1; };

/*
 * Formatos de data. Os embutidos do Excel (14–22, 45–47 e os asiáticos) e os
 * personalizados que têm d/m/a/h/s fora de aspas e colchetes.
 */
const FORMATOS_DATA = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 45, 46, 47, 50, 51, 52, 53, 54, 55, 56, 57, 58]);
const FORMATOS_HORA = new Set([18, 19, 20, 21, 45, 46, 47]);

function analisarFormato(codigo) {
  const limpo = String(codigo || '').replace(/"[^"]*"/g, '').replace(/\\./g, '').replace(/\[(?!h\]|m\]|s\])[^\]]*\]/gi, '');
  // O arquivo guarda o código em inglês (yyyy), mesmo no Excel em português (aaaa).
  // "m" sozinho é mês; ao lado de h/s ("h:mm") é minuto.
  const hora = /[hs]/i.test(limpo);
  const data = /[dy]/i.test(limpo) || (/m/i.test(limpo) && !hora);
  // "0%", "0.0%": o Excel guarda 0,875 e mostra 87,5%.
  const percentual = !data && !hora && /%/.test(limpo);
  return { data: data || hora, temData: data, temHora: hora, segundos: /s/i.test(limpo), percentual };
}

function estilosDeData(stylesXml) {
  const personalizados = {};
  for (const m of String(stylesXml || '').matchAll(/<numFmt\b[^>]*\bnumFmtId="(\d+)"[^>]*\bformatCode="([^"]*)"/g)) personalizados[Number(m[1])] = texto(m[2]);
  const xfs = /<cellXfs\b[^>]*>([\s\S]*?)<\/cellXfs>/.exec(String(stylesXml || ''));
  const estilos = [];
  if (!xfs) return estilos;
  for (const m of xfs[1].matchAll(/<xf\b([^>]*?)\/?>/g)) {
    const id = Number((/\bnumFmtId="(\d+)"/.exec(m[1]) || [])[1] || 0);
    if (personalizados[id] != null) {
      const a = analisarFormato(personalizados[id]);
      estilos.push(a.data || a.percentual ? a : null);
    } else if (id === 9 || id === 10) {
      estilos.push({ data: false, percentual: true });
    } else if (FORMATOS_DATA.has(id)) {
      estilos.push({ data: true, temData: !FORMATOS_HORA.has(id) || id === 22, temHora: FORMATOS_HORA.has(id) || id === 22, segundos: [19, 21, 46, 47].includes(id) });
    } else estilos.push(null);
  }
  return estilos;
}

const dd = (n) => String(n).padStart(2, '0');

/*
 * O NÚMERO COMO O EXCEL MOSTRA NO BRASIL: vírgula decimal ("12,5") e o
 * percentual multiplicado ("87,5%"). O servidor lê a planilha como lê o CSV
 * do Google ou o do Excel em português (server/planilha.js, kpis.js
 * lerNumero): ali "0.875" ou "1.234" com ponto é milhar brasileiro, e o
 * cardápio de R$ 5.899 viraria 5899. Com vírgula não há o que adivinhar.
 */
function numeroDoExcel(v, percentual) {
  const bruto = String(v == null ? '' : v).trim();
  const n = Number(bruto);
  if (!bruto || !Number.isFinite(n)) return texto(v);
  // toPrecision(15): o 0.30000000000000004 da conta binária volta a ser 0,3.
  const x = Number((percentual ? n * 100 : n).toPrecision(15));
  let s = String(x);
  if (/e/i.test(s)) s = Math.abs(x) < 1 ? x.toFixed(20).replace(/0+$/, '').replace(/\.$/, '') : s;
  return s.replace('.', ',') + (percentual ? '%' : '');
}

// O número de série do Excel → como ele mostra no Brasil.
function dataDoExcel(serie, formato, base1904) {
  const n = Number(serie);
  if (!Number.isFinite(n)) return String(serie);
  const epoca = base1904 ? Date.UTC(1904, 0, 1) : Date.UTC(1899, 11, 30);
  const d = new Date(epoca + Math.round(n * 86400) * 1000);
  const dia = dd(d.getUTCDate()) + '/' + dd(d.getUTCMonth() + 1) + '/' + d.getUTCFullYear();
  const hora = dd(d.getUTCHours()) + ':' + dd(d.getUTCMinutes()) + (formato.segundos ? ':' + dd(d.getUTCSeconds()) : '');
  if (formato.temData && formato.temHora) return dia + ' ' + hora;
  if (formato.temHora && !formato.temData) return hora;
  return dia;
}

/* A primeira aba, como linhas de texto. */
function lerXlsx(buf) {
  const z = abrirZip(buf, (n) => /^xl\/(workbook\.xml|_rels\/workbook\.xml\.rels|sharedStrings\.xml|styles\.xml|worksheets\/[^/]+\.xml)$/.test(n));
  const xml = (n) => (z[n] ? Buffer.from(z[n]).toString('utf8') : '');
  const workbook = xml('xl/workbook.xml');
  // A primeira aba pelo workbook e pelas relações (o arquivo nem sempre é sheet1).
  const rid = (/<sheet\b[^>]*\br:id="([^"]+)"/.exec(workbook) || [])[1];
  const rel = rid && new RegExp('<Relationship\\b[^>]*Id="' + rid.replace(/[^\w-]/g, '') + '"[^>]*>').exec(xml('xl/_rels/workbook.xml.rels'));
  const alvo = rel && (/Target="([^"]+)"/.exec(rel[0]) || [])[1];
  const aba = alvo ? (alvo.startsWith('/') ? alvo.slice(1) : 'xl/' + alvo.replace(/^\.\//, '')) : Object.keys(z).filter((n) => n.startsWith('xl/worksheets/')).sort()[0];
  const folha = xml(aba);
  if (!folha) throw new Error('não achei a primeira aba da planilha');
  const comuns = (xml('xl/sharedStrings.xml').match(/<si\b[\s\S]*?<\/si>/g) || []).map(textos);
  const estilos = estilosDeData(xml('xl/styles.xml'));
  const base1904 = /<workbookPr\b[^>]*\bdate1904="(1|true)"/.test(workbook);

  const linhas = [];
  for (const r of folha.match(/<row\b[\s\S]*?<\/row>|<row\b[^>]*\/>/g) || []) {
    const nLinha = Number((/<row\b[^>]*\br="(\d+)"/.exec(r) || [])[1] || linhas.length + 1);
    const linha = [];
    let proxima = 0;
    for (const c of r.match(/<c\b[^>]*?(?:\/>|>[\s\S]*?<\/c>)/g) || []) {
      const attrs = /<c\b([^>]*?)\/?>/.exec(c)[1];
      const ref = (/\br="([A-Z]+\d+)"/.exec(attrs) || [])[1];
      const tipo = (/\bt="(\w+)"/.exec(attrs) || [])[1] || 'n';
      const estilo = estilos[Number((/\bs="(\d+)"/.exec(attrs) || [])[1] || 0)];
      const i = ref ? coluna(ref) : proxima;
      proxima = i + 1;
      const v = (/<v>([\s\S]*?)<\/v>/.exec(c) || [])[1];
      let valor = '';
      if (tipo === 's') valor = comuns[parseInt(v, 10)] || '';
      else if (tipo === 'inlineStr') valor = textos(c);
      else if (tipo === 'str') valor = texto(v);
      else if (tipo === 'b') valor = v === '1' ? 'VERDADEIRO' : 'FALSO';
      else if (tipo === 'e') valor = '';
      else if (v != null && v !== '') valor = estilo && estilo.data ? dataDoExcel(v, estilo, base1904) : numeroDoExcel(v, !!(estilo && estilo.percentual));
      if (i >= 0 && i < 16384) linha[i] = valor;
    }
    for (let j = 0; j < linha.length; j++) if (linha[j] == null) linha[j] = '';
    // Linhas em branco no meio da planilha continuam em branco no CSV (quem lê conta linhas).
    while (linhas.length < nLinha - 1 && linhas.length < 1048576) linhas.push([]);
    linhas.push(linha);
  }
  // Mas as vazias do fim (formatação esquecida) e as de antes do cabeçalho não:
  // quem lê o CSV espera o cabeçalho na primeira linha.
  const vazia = (l) => !l.some((x) => String(x).trim());
  while (linhas.length && vazia(linhas[linhas.length - 1])) linhas.pop();
  while (linhas.length && vazia(linhas[0])) linhas.shift();
  return linhas;
}

/* RFC 4180: vírgula, aspas quando precisa, \r\n. Todas as linhas com a mesma largura. */
function paraCsv(linhas) {
  const largura = linhas.reduce((m, l) => Math.max(m, l.length), 0);
  const campo = (v) => {
    const s = String(v == null ? '' : v);
    return /[",\r\n]/.test(s) || /^\s|\s$/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  return linhas.map((l) => {
    const cheia = l.slice();
    while (cheia.length < largura) cheia.push('');
    return cheia.map(campo).join(',');
  }).join('\r\n') + (linhas.length ? '\r\n' : '');
}

// O CSV do Excel brasileiro costuma vir em Windows-1252: se não for UTF-8 válido, lê assim.
function decodificar(buf) {
  try { return new TextDecoder('utf-8', { fatal: true }).decode(buf).replace(/^﻿/, ''); } catch (e) {
    return new TextDecoder('windows-1252').decode(buf);
  }
}

module.exports = { abrirZip, lerXlsx, paraCsv, decodificar, dataDoExcel, numeroDoExcel, analisarFormato, estilosDeData };
