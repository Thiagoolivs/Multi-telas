/*
 * Ler a planilha do RH no navegador (EXECUTOR D30): Excel (.xlsx) ou CSV,
 * sem biblioteca. Devolve as linhas de células; a primeira é o cabeçalho.
 *
 * O .xlsx é um ZIP de XMLs. O navegador já sabe descompactar
 * (DecompressionStream), então basta achar a primeira aba, as palavras
 * compartilhadas e as células. Data vem como o número do Excel e quem
 * entende é js/pessoas.js. O .xls antigo (binário) não: a pessoa salva como
 * .xlsx ou CSV, e o painel diz isso.
 */

const u16 = (b, o) => b[o] | (b[o + 1] << 8);
const u32 = (b, o) => (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;

async function inflar(bytes) {
  const fluxo = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(fluxo).arrayBuffer());
}

// Os arquivos do ZIP: nome → bytes (só os que a gente pede).
export async function abrirZip(buf, querer) {
  let fim = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) if (u32(buf, i) === 0x06054b50) { fim = i; break; }
  if (fim < 0) throw new Error('arquivo .xlsx danificado');
  const total = u16(buf, fim + 10);
  let p = u32(buf, fim + 16);
  const out = {};
  const nomes = new TextDecoder();
  for (let n = 0; n < total && u32(buf, p) === 0x02014b50; n++) {
    const metodo = u16(buf, p + 10);
    const tamanho = u32(buf, p + 20);
    const lNome = u16(buf, p + 28);
    const lExtra = u16(buf, p + 30);
    const lComent = u16(buf, p + 32);
    const local = u32(buf, p + 42);
    const nome = nomes.decode(buf.subarray(p + 46, p + 46 + lNome));
    p += 46 + lNome + lExtra + lComent;
    if (!querer(nome)) continue;
    const ini = local + 30 + u16(buf, local + 26) + u16(buf, local + 28);
    const dados = buf.subarray(ini, ini + tamanho);
    out[nome] = metodo === 8 ? await inflar(dados) : metodo === 0 ? dados : null;
  }
  return out;
}

const ENTIDADES = { lt: '<', gt: '>', quot: '"', apos: "'", amp: '&' };
const texto = (s) => String(s || '').replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e) => (e[0] === '#'
  ? String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10))
  : (ENTIDADES[e] != null ? ENTIDADES[e] : m)));
// Os <t> de um trecho (o texto rico vem em vários pedaços), sem a leitura fonética.
const textos = (xml) => (String(xml || '').replace(/<rPh\b[\s\S]*?<\/rPh>/g, '').match(/<t\b[^>]*>[\s\S]*?<\/t>/g) || [])
  .map((t) => texto(t.replace(/^<t\b[^>]*>|<\/t>$/g, ''))).join('');
const coluna = (ref) => { let n = 0; for (const c of String(ref).replace(/\d+$/, '').toUpperCase()) n = n * 26 + (c.charCodeAt(0) - 64); return n - 1; };

export async function lerXlsx(buf) {
  const z = await abrirZip(buf, (n) => /^xl\/(workbook\.xml|_rels\/workbook\.xml\.rels|sharedStrings\.xml|worksheets\/[^/]+\.xml)$/.test(n));
  const dec = new TextDecoder();
  const xml = (n) => (z[n] ? dec.decode(z[n]) : '');
  // A primeira aba, pelo workbook e pelas relações (o nome do arquivo nem sempre é sheet1).
  const rid = (/<sheet\b[^>]*\br:id="([^"]+)"/.exec(xml('xl/workbook.xml')) || [])[1];
  const rel = rid && new RegExp('<Relationship\\b[^>]*Id="' + rid + '"[^>]*>').exec(xml('xl/_rels/workbook.xml.rels'));
  const alvo = rel && (/Target="([^"]+)"/.exec(rel[0]) || [])[1];
  const aba = alvo ? (alvo.startsWith('/') ? alvo.slice(1) : 'xl/' + alvo) : Object.keys(z).filter((n) => n.startsWith('xl/worksheets/')).sort()[0];
  const folha = xml(aba);
  if (!folha) throw new Error('não achei a primeira aba da planilha');
  const comuns = (xml('xl/sharedStrings.xml').match(/<si\b[\s\S]*?<\/si>/g) || []).map(textos);

  const linhas = [];
  for (const r of folha.match(/<row\b[\s\S]*?<\/row>/g) || []) {
    const linha = [];
    let proxima = 0;
    for (const c of r.match(/<c\b[^>]*?(?:\/>|>[\s\S]*?<\/c>)/g) || []) {
      const attrs = /<c\b([^>]*?)\/?>/.exec(c)[1];
      const ref = (/\br="([A-Z]+\d+)"/.exec(attrs) || [])[1];
      const tipo = (/\bt="(\w+)"/.exec(attrs) || [])[1] || 'n';
      const i = ref ? coluna(ref) : proxima;
      proxima = i + 1;
      const v = (/<v>([\s\S]*?)<\/v>/.exec(c) || [])[1];
      let valor = '';
      if (tipo === 's') valor = comuns[parseInt(v, 10)] || '';
      else if (tipo === 'inlineStr') valor = textos(c);
      else if (tipo === 'str') valor = texto(v);
      else if (tipo === 'b') valor = v === '1' ? 'sim' : 'não';
      else if (tipo === 'e') valor = '';
      else if (v != null && v !== '') valor = Number(v);
      linha[i] = valor;
    }
    for (let j = 0; j < linha.length; j++) if (linha[j] == null) linha[j] = '';
    if (linha.some((x) => String(x).trim())) linhas.push(linha);
  }
  return linhas;
}

// CSV simples: o separador (vírgula ou ponto e vírgula) pela primeira linha; respeita aspas.
export function lerCsv(text) {
  text = String(text || '').replace(new RegExp('^' + String.fromCharCode(0xfeff)), '');
  const primeira = text.split(/\r?\n/)[0] || '';
  const sep = primeira.split(';').length > primeira.split(',').length ? ';' : ',';
  const linhas = [];
  let campo = '', linha = [], aspas = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (aspas) {
      if (c === '"' && text[i + 1] === '"') { campo += '"'; i++; }
      else if (c === '"') aspas = false;
      else campo += c;
    } else if (c === '"') aspas = true;
    else if (c === sep) { linha.push(campo); campo = ''; }
    else if (c === '\n') { linha.push(campo); linhas.push(linha); linha = []; campo = ''; }
    else if (c !== '\r') campo += c;
  }
  if (campo.length || linha.length) { linha.push(campo); linhas.push(linha); }
  return linhas.filter((l) => l.some((c) => String(c).trim()));
}

// O CSV do Excel brasileiro costuma vir em Windows-1252: se não for UTF-8 válido, lê assim.
function decodificar(buf) {
  try { return new TextDecoder('utf-8', { fatal: true }).decode(buf); }
  catch (e) { return new TextDecoder('windows-1252').decode(buf); }
}

export async function lerPlanilha(arquivo) {
  const buf = new Uint8Array(await arquivo.arrayBuffer());
  if (buf[0] === 0x50 && buf[1] === 0x4b) return lerXlsx(buf);
  if (buf[0] === 0xd0 && buf[1] === 0xcf) throw new Error('Esta é uma planilha .xls antiga. No Excel, salve como .xlsx ou CSV e tente de novo.');
  return lerCsv(decodificar(buf));
}
