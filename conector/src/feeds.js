'use strict';
/*
 * O feed da intranet (RSS, Atom ou JSON) → comunicados no MultiTelas.
 *
 * O servidor na nuvem não alcança a intranet; esta máquina alcança. Então o
 * conector lê o feed, transforma cada item em comunicado
 * (PUT /api/v1/comunicados/:idExterno) e apaga o comunicado quando o item
 * sai do feed. As imagens dos itens também moram na intranet: o conector
 * baixa e sobe para a pasta reservada "_feed-<chave>", e o comunicado
 * aponta para "pasta:_feed-<chave>/<arquivo>".
 *
 * O idExterno é um hash da chave do feed com o guid (ou o link) do item:
 * estável entre ciclos e entre reinícios, e sem expor a URL interna.
 *
 * Feed que não abre, que veio vazio por erro ou que virou página de login
 * NÃO apaga comunicado nenhum: só um feed lido e reconhecido conta, e o item
 * precisa sumir em `ciclosParaApagar` leituras seguidas.
 */
const crypto = require('node:crypto');
const { lerXml, textoDe, filho, filhoLocal, buscar, local } = require('./xml');
const { baixarDaIntranet, ErroDoServidor, TokenRevogado, SemConexao } = require('./rede');
const { registrarErro, fonte } = require('./estado');

const MAX_ITENS = 50;
const MAX_FEED = 5 * 1024 * 1024;
const MAX_IMAGEM = 15 * 1024 * 1024;
const MAX_TITULO = 200;
const MAX_TEXTO = 2000;

/* ---------------- texto ---------------- */

// As entidades do HTML que aparecem em notícia em português (e as de pontuação).
const LATIN1 = 'nbsp iexcl cent pound curren yen brvbar sect uml copy ordf laquo not shy reg macr deg plusmn sup2 sup3 acute micro para middot cedil sup1 ordm raquo frac14 frac12 frac34 iquest Agrave Aacute Acirc Atilde Auml Aring AElig Ccedil Egrave Eacute Ecirc Euml Igrave Iacute Icirc Iuml ETH Ntilde Ograve Oacute Ocirc Otilde Ouml times Oslash Ugrave Uacute Ucirc Uuml Yacute THORN szlig agrave aacute acirc atilde auml aring aelig ccedil egrave eacute ecirc euml igrave iacute icirc iuml eth ntilde ograve oacute ocirc otilde ouml divide oslash ugrave uacute ucirc uuml yacute thorn yuml'.split(' ');
const HTML = { ndash: '–', mdash: '—', lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”', sbquo: '‚', bdquo: '„', hellip: '…', bull: '•', euro: '€', trade: '™', lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" };
LATIN1.forEach((n, i) => { HTML[n] = String.fromCharCode(160 + i); });

function entidadesHtml(s) {
  return String(s).replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]*);/gi, (m, e) => {
    if (e[0] === '#') {
      const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : m;
    }
    return HTML[e] != null ? HTML[e] : m;
  });
}

function htmlParaTexto(html) {
  let s = String(html || '');
  s = s.replace(/<(script|style|iframe|object)\b[\s\S]*?<\/\1>/gi, ' ');
  s = s.replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|li|h[1-6]|tr|blockquote)>/gi, '\n');
  // Negrito, link, itálico: some a marca e fica a palavra colada ("<b>segunda</b>." → "segunda.").
  s = s.replace(/<\/?(b|i|u|em|strong|span|a|small|font|mark|sup|sub)\b[^>]*>/gi, '');
  s = s.replace(/<[^>]*>/g, ' ');
  s = entidadesHtml(s);
  return s.replace(/[ \t ​]+/g, ' ').replace(/ *\n */g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

function cortar(s, max) {
  s = String(s || '').trim();
  if (s.length <= max) return s;
  const corte = s.slice(0, max - 1);
  const espaco = corte.lastIndexOf(' ');
  return (espaco > max * 0.6 ? corte.slice(0, espaco) : corte).replace(/[\s,.;:–-]+$/, '') + '…';
}

function primeiraImagemDoHtml(html) {
  const m = /<img\b[^>]*?\bsrc\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s>]+))/i.exec(String(html || ''));
  return m ? entidadesHtml(m[1] || m[2] || m[3]) : '';
}

function absoluta(url, base) {
  if (!url) return '';
  try {
    const u = new URL(String(url).trim(), base || undefined);
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.href : '';
  } catch (e) { return ''; }
}

const MESES = { jan: 'Jan', fev: 'Feb', mar: 'Mar', abr: 'Apr', mai: 'May', jun: 'Jun', jul: 'Jul', ago: 'Aug', set: 'Sep', out: 'Oct', nov: 'Nov', dez: 'Dec' };

// pubDate (RFC 822), ISO 8601, dia da semana em português, ou dd/mm/aaaa.
function lerData(v) {
  if (v == null || v === '') return null;
  if (typeof v === 'number' && Number.isFinite(v)) return new Date(v < 1e12 ? v * 1000 : v);
  let s = String(v).trim();
  let t = Date.parse(s);
  if (Number.isNaN(t)) {
    s = s.replace(/^[^\d,]+,\s*/, '').replace(/\b(jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)[a-zç]*\.?/i, (m) => MESES[m.slice(0, 3).toLowerCase()]);
    t = Date.parse(s);
  }
  if (Number.isNaN(t)) {
    const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[ T]+(\d{1,2}):(\d{2}))?/.exec(s);
    if (m) t = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]), Number(m[4] || 0), Number(m[5] || 0)).getTime();
  }
  return Number.isNaN(t) ? null : new Date(t);
}

/* ---------------- RSS e Atom ---------------- */

function decodificarFeed(bytes, tipo) {
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) return new TextDecoder('utf-8').decode(bytes.subarray(3));
  let cs = (/charset=["']?([\w-]+)/i.exec(tipo || '') || [])[1];
  if (!cs) cs = (/<\?xml[^>]*encoding=["']([\w-]+)["']/i.exec(Buffer.from(bytes.subarray(0, 300)).toString('latin1')) || [])[1];
  try { return new TextDecoder((cs || 'utf-8').toLowerCase()).decode(bytes); } catch (e) { return new TextDecoder('utf-8').decode(bytes); }
}

function imagemDoItemXml(no, html, base) {
  for (const f of no.filhos) {
    const n = local(f.nome);
    const tipo = String(f.attrs.type || '').toLowerCase();
    const url = f.attrs.url || f.attrs.href;
    if (n === 'enclosure' && url && (tipo.startsWith('image/') || /\.(jpe?g|png|webp)(\?|$)/i.test(url))) return absoluta(url, base);
    if (n === 'link' && f.attrs.rel === 'enclosure' && url && tipo.startsWith('image/')) return absoluta(url, base);
  }
  // Media RSS: <media:content> (às vezes dentro de <media:group>) e <media:thumbnail>.
  for (const m of buscar(no, 'content').filter((x) => x.nome.startsWith('media:'))) {
    const tipo = String(m.attrs.type || '').toLowerCase();
    if (m.attrs.url && (m.attrs.medium === 'image' || tipo.startsWith('image/') || /\.(jpe?g|png|webp)(\?|$)/i.test(m.attrs.url))) return absoluta(m.attrs.url, base);
  }
  const mini = buscar(no, 'thumbnail').find((x) => x.attrs.url);
  if (mini) return absoluta(mini.attrs.url, base);
  const itunes = no.filhos.find((f) => f.nome === 'itunes:image' && f.attrs.href);
  if (itunes) return absoluta(itunes.attrs.href, base);
  // Atom com conteúdo xhtml: o <img> é nó de verdade, não texto escapado.
  const img = buscar(no, 'img').find((x) => x.attrs.src);
  if (img) return absoluta(img.attrs.src, base);
  return absoluta(primeiraImagemDoHtml(html), base);
}

function itemDoRss(no, base) {
  const titulo = htmlParaTexto(textoDe(filho(no, 'title') || filhoLocal(no, 'title')));
  let link = textoDe(filho(no, 'link')).trim();
  if (!link) { const l = no.filhos.find((f) => local(f.nome) === 'link' && f.attrs.href); if (l) link = l.attrs.href; }
  link = absoluta(link, base);
  const guid = textoDe(filho(no, 'guid')).trim() || (no.attrs['rdf:about'] || '');
  const html = textoDe(filho(no, 'content:encoded')) || textoDe(filho(no, 'description')) || textoDe(filhoLocal(no, 'summary'));
  const data = lerData(textoDe(filho(no, 'pubDate')) || textoDe(filho(no, 'dc:date')) || textoDe(filhoLocal(no, 'updated')));
  return { guid, link, titulo, texto: htmlParaTexto(html), imagem: imagemDoItemXml(no, html, link || base), data };
}

function itemDoAtom(no, base) {
  const t = filhoLocal(no, 'title');
  const titulo = htmlParaTexto(textoDe(t));
  const links = no.filhos.filter((f) => local(f.nome) === 'link' && f.attrs.href);
  const alt = links.find((l) => !l.attrs.rel || l.attrs.rel === 'alternate') || links[0];
  const link = alt ? absoluta(alt.attrs.href, base) : '';
  const conteudo = filhoLocal(no, 'content') || filhoLocal(no, 'summary');
  const html = conteudo ? textoDe(conteudo) : '';
  const data = lerData(textoDe(filhoLocal(no, 'published')) || textoDe(filhoLocal(no, 'updated')));
  return { guid: textoDe(filhoLocal(no, 'id')).trim(), link, titulo, texto: htmlParaTexto(html), imagem: imagemDoItemXml(no, html, link || base), data };
}

function itensDoXml(texto, base) {
  const doc = lerXml(texto);
  const raiz = doc.filhos.find((f) => ['rss', 'feed', 'RDF', 'channel'].includes(local(f.nome)));
  if (!raiz) throw new Error('a resposta não é um feed RSS/Atom (é uma página de login ou de erro?)');
  if (local(raiz.nome) === 'feed') return buscar(raiz, 'entry').map((e) => itemDoAtom(e, base));
  return buscar(raiz, 'item').map((i) => itemDoRss(i, base));
}

/* ---------------- JSON com mapa ---------------- */

// "dados.itens.0.titulo" ou "dados.itens[0].titulo".
function caminho(obj, p) {
  if (!p) return obj;
  return String(p).replace(/\[(\d+)\]/g, '.$1').split('.').filter(Boolean).reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

const SINONIMOS = {
  lista: ['lista', 'list', 'itens', 'items'],
  titulo: ['titulo', 'title'],
  texto: ['texto', 'text', 'resumo', 'summary', 'descricao', 'description'],
  imagem: ['imagem', 'image', 'imagemUrl'],
  data: ['data', 'date', 'inicio'],
  link: ['link', 'url'],
  id: ['id', 'guid'],
  fim: ['fim', 'end'],
  destaque: ['destaque', 'highlight'],
};
// Sem mapa: o JSON Feed (jsonfeed.org), o SharePoint (value / d.results) e nomes comuns.
const PADRAO_JSON = {
  lista: ['items', 'itens', 'noticias', 'data', 'value', 'd.results', 'results', 'posts', 'entries'],
  titulo: ['title', 'titulo', 'Title', 'headline', 'name', 'nome'],
  texto: ['content_text', 'summary', 'texto', 'resumo', 'description', 'descricao', 'content_html', 'content', 'body'],
  imagem: ['image', 'imagem', 'banner_image', 'thumbnail', 'foto'],
  data: ['date_published', 'data', 'date', 'published', 'publishedAt', 'pubDate', 'created_at', 'Created', 'date_modified'],
  link: ['url', 'link', 'external_url', 'permalink'],
  id: ['id', 'guid', 'uuid', 'Id'],
  fim: [],
  destaque: [],
};

function mapaDe(mapa) {
  const m = mapa && typeof mapa === 'object' ? mapa : {};
  const out = {};
  for (const [campo, nomes] of Object.entries(SINONIMOS)) {
    const k = nomes.find((n) => typeof m[n] === 'string' && m[n].trim());
    out[campo] = k ? m[k].trim() : '';
  }
  return out;
}

function valor(item, explicito, padroes) {
  if (explicito) return caminho(item, explicito);
  for (const p of padroes) { const v = caminho(item, p); if (v != null && v !== '') return v; }
  return undefined;
}

const urlDe = (v) => (v && typeof v === 'object' ? v.url || v.src || v.href || v.Url || '' : v);
const simNao = (v) => v === true || v === 1 || /^(1|true|sim|s|yes)$/i.test(String(v == null ? '' : v).trim());

function itensDoJson(texto, mapa, base) {
  let obj;
  try { obj = JSON.parse(String(texto).replace(/^﻿/, '')); } catch (e) { throw new Error('a resposta não é um JSON válido'); }
  const m = mapaDe(mapa);
  let lista = m.lista ? caminho(obj, m.lista) : (Array.isArray(obj) ? obj : undefined);
  if (!m.lista && !Array.isArray(lista)) {
    for (const p of PADRAO_JSON.lista) { const v = caminho(obj, p); if (Array.isArray(v)) { lista = v; break; } }
  }
  if (!Array.isArray(lista)) throw new Error('não achei a lista de itens no JSON' + (m.lista ? ' em "' + m.lista + '"' : '') + ' (confira o "mapa" do feed no painel)');
  return lista.filter((i) => i && typeof i === 'object').map((item) => {
    const bruto = valor(item, m.texto, PADRAO_JSON.texto);
    const html = typeof bruto === 'string' ? bruto : '';
    const link = absoluta(urlDe(valor(item, m.link, PADRAO_JSON.link)), base);
    const imagem = absoluta(urlDe(valor(item, m.imagem, PADRAO_JSON.imagem)) || primeiraImagemDoHtml(html), link || base);
    const id = valor(item, m.id, PADRAO_JSON.id);
    const out = {
      guid: id == null ? '' : String(id),
      link,
      titulo: htmlParaTexto(String(valor(item, m.titulo, PADRAO_JSON.titulo) || '')),
      texto: htmlParaTexto(html),
      imagem,
      data: lerData(valor(item, m.data, PADRAO_JSON.data)),
    };
    if (m.fim) out.fim = lerData(caminho(item, m.fim));
    if (m.destaque) out.destaque = simNao(caminho(item, m.destaque));
    return out;
  });
}

/* Os bytes do feed → itens normalizados. O formato do servidor manda, mas o conteúdo confirma. */
function lerFeed(bytes, tipo, formato, mapa, base) {
  const texto = decodificarFeed(bytes, tipo);
  const comeco = texto.trimStart()[0];
  const json = comeco === '{' || comeco === '[' || (formato === 'json' && comeco !== '<');
  const itens = json ? itensDoJson(texto, mapa, base) : itensDoXml(texto, base);
  return itens.filter((i) => i.titulo || i.texto);
}

/* ---------------- comunicados ---------------- */

function idDoItem(chaveFeed, item) {
  const base = item.guid || item.link || (item.titulo + '\n' + (item.data ? item.data.toISOString() : ''));
  return crypto.createHash('sha256').update(chaveFeed + '\n' + base).digest('hex').slice(0, 40);
}

function comunicadoDe(item, imagemUrl) {
  const c = { titulo: cortar(item.titulo || cortar(item.texto, 80), MAX_TITULO) };
  const texto = cortar(item.texto, MAX_TEXTO);
  if (texto && texto !== c.titulo) c.texto = texto;
  if (imagemUrl) c.imagemUrl = imagemUrl;
  if (item.data) c.inicio = item.data.toISOString();
  if (item.fim) c.fim = item.fim.toISOString();
  if (item.destaque !== undefined) c.destaque = item.destaque;
  if (item.link) c.link = item.link;
  return c;
}

// Só JPG, PNG e WebP, pelo conteúdo (não pelo nome nem pelo Content-Type, que mentem).
function extensaoDaImagem(b) {
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpg';
  if (b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'png';
  if (b.length > 12 && b.toString('latin1', 0, 4) === 'RIFF' && b.toString('latin1', 8, 12) === 'WEBP') return 'webp';
  return '';
}
const TIPO_IMAGEM = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };

async function garantirImagem(ctx, feed, est, url, resumo) {
  if (est.imagens[url]) return est.imagens[url].nome;
  const { cfg, log } = ctx;
  const id = 'feed:' + feed.chave;
  try {
    const r = await baixarDaIntranet(url, { hostsPermitidos: cfg.intranet.hostsPermitidos, cabecalhos: cfg.intranet.cabecalhos, maxBytes: MAX_IMAGEM, aceitar: 'image/jpeg,image/png,image/webp', fetch: ctx.fetchIntranet, versao: ctx.versao });
    const ext = extensaoDaImagem(r.bytes);
    if (!ext) throw new Error('não é JPG, PNG nem WebP');
    const sha = crypto.createHash('sha256').update(r.bytes).digest('hex');
    const nome = sha.slice(0, 32) + '.' + ext;
    if (!ctx.simular) {
      await ctx.api.enviarArquivo('_feed-' + feed.chave, nome, { dados: r.bytes, tamanho: r.bytes.length, sha256: sha, tipo: TIPO_IMAGEM[ext] });
      est.imagens[url] = { nome, sha256: sha };
    }
    resumo.imagens.push(nome);
    log.esquecer(id + '|imagem|' + url);
    return nome;
  } catch (e) {
    if (e instanceof TokenRevogado || e instanceof SemConexao) throw e;
    // Sem a imagem o comunicado sai só com o texto; a imagem é tentada de novo no próximo ciclo.
    log.umaVez(id + '|imagem|' + url, 'aviso', 'Feed "' + (feed.nome || feed.chave) + '": não consegui usar a imagem ' + url + ' (' + e.message + '). O comunicado vai sem imagem por enquanto.');
    return '';
  }
}

async function sincronizarFeed(ctx, feed) {
  const { api, estado, log, cfg } = ctx;
  const agora = ctx.agora ? ctx.agora() : Date.now();
  const id = 'feed:' + feed.chave;
  const rotulo = 'Feed "' + (feed.nome || feed.chave) + '"';
  const est = estado.feeds[feed.chave] || (estado.feeds[feed.chave] = {});
  if (!est.itens || typeof est.itens !== 'object') est.itens = {};
  if (!est.imagens || typeof est.imagens !== 'object') est.imagens = {};
  const f = fonte(estado, id, { tipo: 'feed', chave: feed.chave, nome: feed.nome || feed.chave, origem: feed.url, ultimaTentativa: agora });
  const resumo = { itens: 0, salvos: [], apagados: [], imagens: [], fila: [], erros: [], hostBloqueado: '' };

  let itens;
  try {
    const r = await baixarDaIntranet(feed.url, { hostsPermitidos: cfg.intranet.hostsPermitidos, cabecalhos: cfg.intranet.cabecalhos, maxBytes: MAX_FEED, aceitar: 'application/rss+xml, application/atom+xml, application/json, application/xml;q=0.9, */*;q=0.5', fetch: ctx.fetchIntranet, versao: ctx.versao });
    itens = lerFeed(r.bytes, r.tipo, feed.formato, feed.mapa, r.url);
  } catch (e) {
    if (e instanceof TokenRevogado || e instanceof SemConexao) throw e;
    let msg = e.message;
    if (e.code === 'host-nao-permitido') {
      resumo.hostBloqueado = e.host;
      msg = 'o endereço do feed está no host "' + e.host + '", que o conector não tem permissão de ler. Para liberar, rode "MultiTelasConector.exe configurar" ou ponha "' + e.host + '" em "intranet.hostsPermitidos" no conector.json';
    }
    log.umaVez(id + '|erro|' + msg, 'erro', rotulo + ': ' + msg + '. Os comunicados que já estão na TV continuam.');
    registrarErro(estado, id, msg, agora);
    f.ultimoErro = msg;
    resumo.erros.push(msg);
    return resumo;
  }
  log.esquecer(id + '|erro');

  const vistos = new Set();
  for (const item of itens.slice(0, MAX_ITENS)) {
    const idExterno = idDoItem(feed.chave, item);
    if (vistos.has(idExterno)) continue;
    vistos.add(idExterno);
    resumo.itens++;
    const nomeImagem = item.imagem ? await garantirImagem(ctx, feed, est, item.imagem, resumo) : '';
    const dados = comunicadoDe(item, nomeImagem ? 'pasta:_feed-' + feed.chave + '/' + nomeImagem : '');
    const hash = crypto.createHash('sha256').update(JSON.stringify(dados)).digest('hex');
    const anterior = est.itens[idExterno];
    if (anterior && anterior.hash === hash) { if (!ctx.simular) anterior.faltando = 0; continue; }
    if (ctx.simular) { resumo.salvos.push(dados.titulo); continue; }
    try {
      await api.salvarComunicado(idExterno, dados);
      est.itens[idExterno] = { hash, titulo: dados.titulo, imagem: nomeImagem || '', faltando: 0 };
      resumo.salvos.push(dados.titulo);
      log.info(rotulo + ': comunicado ' + (anterior ? 'atualizado' : 'novo') + ': "' + dados.titulo + '".');
    } catch (e) {
      if (e instanceof TokenRevogado || e instanceof SemConexao) throw e;
      const msg = e instanceof ErroDoServidor ? e.message + ' (' + e.status + ')' : e.message;
      log.erro(rotulo + ': o servidor não aceitou o comunicado "' + dados.titulo + '": ' + msg + '.');
      registrarErro(estado, id, '"' + dados.titulo + '": ' + msg, agora);
      resumo.erros.push(msg);
    }
  }

  // Os que saíram do feed.
  for (const [idExt, info] of Object.entries(est.itens)) {
    if (vistos.has(idExt)) continue;
    const vezes = (info.faltando || 0) + 1;
    if (vezes < cfg.ciclosParaApagar) {
      if (!ctx.simular) info.faltando = vezes;
      resumo.fila.push({ nome: info.titulo, motivo: 'saiu do feed; apago se continuar fora na próxima leitura' });
      continue;
    }
    if (ctx.simular) { resumo.apagados.push(info.titulo); continue; }
    try {
      await api.apagarComunicado(idExt);
    } catch (e) {
      if (e instanceof TokenRevogado || e instanceof SemConexao) throw e;
      if (!(e instanceof ErroDoServidor && e.status === 404)) {
        log.erro(rotulo + ': não consegui apagar o comunicado "' + info.titulo + '": ' + e.message + '.');
        registrarErro(estado, id, 'apagar "' + info.titulo + '": ' + e.message, agora);
        resumo.erros.push(e.message);
        continue;
      }
    }
    delete est.itens[idExt];
    resumo.apagados.push(info.titulo);
    log.info(rotulo + ': "' + info.titulo + '" saiu do feed e foi tirado das TVs.');
  }

  // Imagem que nenhum comunicado usa mais sai da pasta "_feed-".
  if (!ctx.simular) {
    const usadas = new Set(Object.values(est.itens).map((i) => i.imagem).filter(Boolean));
    for (const [url, img] of Object.entries(est.imagens)) {
      if (usadas.has(img.nome)) continue;
      try {
        await api.apagarArquivo('_feed-' + feed.chave, img.nome);
      } catch (e) {
        if (e instanceof TokenRevogado || e instanceof SemConexao) throw e;
        if (!(e instanceof ErroDoServidor && e.status === 404)) continue; // tenta de novo no próximo ciclo
      }
      for (const [u, i] of Object.entries(est.imagens)) if (i.nome === img.nome) delete est.imagens[u];
      if (est.imagens[url]) delete est.imagens[url];
    }
  }

  if (!resumo.erros.length) { f.ultimaSincronizacao = agora; f.ultimoErro = ''; }
  f.ultimoResumo = resumo.itens + ' item(ns) no feed, ' + resumo.salvos.length + ' enviado(s), ' + resumo.apagados.length + ' tirado(s)';
  return resumo;
}

module.exports = {
  lerFeed, itensDoXml, itensDoJson, htmlParaTexto, lerData, idDoItem, comunicadoDe, sincronizarFeed, caminho, extensaoDaImagem,
};
