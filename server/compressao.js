/*
 * server/compressao.js — gzip/brotli nas respostas, sem dependência nova.
 *
 * O QA de 26/10 mediu: o painel baixava 965 KB de JavaScript cru (287 KB
 * comprimido) e levava 5,7 s para pintar no celular em 4G. Nenhuma rota
 * comprimia nada.
 *
 * O desenho, e por quê:
 *
 *   - UM PONTO SÓ. `ligar(req, res)` roda na entrada do servidor e embrulha
 *     writeHead/end. As ~200 rotas continuam fazendo `writeHead + end` como
 *     sempre; nenhuma precisa saber que isto existe, e nenhuma pode esquecer.
 *   - SÓ A RESPOSTA INTEIRA. O writeHead é adiado até o end: aí sabemos o
 *     tipo e o tamanho do corpo. Quem escreve aos pedaços (SSE, mídia por
 *     stream) solta o cabeçalho no primeiro write e segue sem compressão —
 *     o canal ao vivo não pode esperar o fim, e vídeo/imagem já vêm
 *     comprimidos.
 *   - SÓ O QUE COMPRIME. Texto, JSON, JS, CSS, SVG e manifesto, a partir de
 *     1 KB. Abaixo disso o cabeçalho custa mais que o ganho.
 *   - CACHE DO QUE É GRANDE. O arquivo do painel é o mesmo para todo mundo:
 *     comprimir uma vez e guardar (por hash do conteúdo, então um deploy novo
 *     nunca serve o velho). Brotli em qualidade média: a máxima levaria
 *     segundos num arquivo de 1 MB, e a TV que espera é a do cliente.
 */
'use strict';

const zlib = require('zlib');
const crypto = require('crypto');

const MIN_BYTES = 1024;
const CACHE_A_PARTIR = 16 * 1024;
const CACHE_MAX_BYTES = 24 * 1024 * 1024;
const COMPRIMIVEL = /^(text\/|application\/(json|javascript|manifest\+json|xml|ld\+json)|image\/svg\+xml)/i;

const cache = new Map(); // chave -> Buffer (ordem de inserção = LRU simples)
let cacheBytes = 0;

/* Qual codificação o cliente aceita, respeitando q=0. Brotli primeiro. */
function escolher(acceptEncoding) {
  const aceitas = {};
  for (const parte of String(acceptEncoding || '').toLowerCase().split(',')) {
    const [nome, ...params] = parte.trim().split(';');
    if (!nome) continue;
    let q = 1;
    for (const p of params) {
      const m = /^\s*q\s*=\s*([0-9.]+)/.exec(p);
      if (m) q = Number(m[1]);
    }
    aceitas[nome.trim()] = q;
  }
  const quer = (n) => (aceitas[n] != null ? aceitas[n] > 0 : aceitas['*'] != null && aceitas['*'] > 0);
  if (quer('br')) return 'br';
  if (quer('gzip')) return 'gzip';
  return null;
}

function comprimirAgora(corpo, enc) {
  if (enc === 'br') {
    return zlib.brotliCompressSync(corpo, {
      params: {
        [zlib.constants.BROTLI_PARAM_QUALITY]: 5,
        [zlib.constants.BROTLI_PARAM_SIZE_HINT]: corpo.length,
      },
    });
  }
  return zlib.gzipSync(corpo, { level: 6 });
}

function comprimir(corpo, enc) {
  if (corpo.length < CACHE_A_PARTIR) return comprimirAgora(corpo, enc);
  const chave = enc + ':' + crypto.createHash('sha1').update(corpo).digest('base64');
  const visto = cache.get(chave);
  if (visto) {
    cache.delete(chave); cache.set(chave, visto); // volta para o fim da fila
    return visto;
  }
  const pronto = comprimirAgora(corpo, enc);
  cache.set(chave, pronto);
  cacheBytes += pronto.length;
  while (cacheBytes > CACHE_MAX_BYTES && cache.size) {
    const [k, v] = cache.entries().next().value;
    cache.delete(k); cacheBytes -= v.length;
  }
  return pronto;
}

/* Lê um cabeçalho do objeto do writeHead (qualquer caixa) ou do que já foi posto. */
function cabecalho(headers, res, nome) {
  if (headers) for (const k in headers) if (k.toLowerCase() === nome) return headers[k];
  return res.getHeader(nome);
}

function ligar(req, res) {
  if (req.method === 'HEAD') return;
  const enc = escolher(req.headers['accept-encoding']);
  if (!enc) return;

  const writeHeadOriginal = res.writeHead;
  const writeOriginal = res.write;
  const endOriginal = res.end;
  let adiado = null;

  const restaurar = () => {
    res.writeHead = writeHeadOriginal;
    res.write = writeOriginal;
    res.end = endOriginal;
  };
  const soltar = () => {
    restaurar();
    if (adiado) { const a = adiado; adiado = null; writeHeadOriginal.apply(res, a); }
  };

  res.writeHead = function () {
    // Cabeçalhos em lista crua: raro, e não vale o risco de reinterpretar.
    const ultimo = arguments[arguments.length - 1];
    if (Array.isArray(ultimo)) { adiado = arguments; soltar(); return res; }
    adiado = arguments;
    return res;
  };
  res.write = function () {
    soltar();
    return writeOriginal.apply(res, arguments);
  };
  res.end = function (dados, encoding, cb) {
    if (typeof dados === 'function') { cb = dados; dados = undefined; encoding = undefined; }
    else if (typeof encoding === 'function') { cb = encoding; encoding = undefined; }

    const args = adiado;
    const status = args ? Number(args[0]) : res.statusCode;
    const headers = args && typeof args[args.length - 1] === 'object' ? args[args.length - 1] : null;
    const corpo = dados == null ? null : Buffer.isBuffer(dados) ? dados : Buffer.from(String(dados), encoding || 'utf8');
    const tipo = String(cabecalho(headers, res, 'content-type') || '');
    const jaCodificado = cabecalho(headers, res, 'content-encoding');

    const vale = corpo && corpo.length >= MIN_BYTES && status >= 200 && status !== 204 && status !== 304 &&
      !jaCodificado && COMPRIMIVEL.test(tipo);
    if (!vale) {
      soltar();
      return endOriginal.call(res, corpo == null ? undefined : corpo, cb);
    }

    let saida;
    try { saida = comprimir(corpo, enc); }
    catch (e) { soltar(); return endOriginal.call(res, corpo, cb); }
    if (saida.length >= corpo.length) { soltar(); return endOriginal.call(res, corpo, cb); }

    const vary = String(cabecalho(headers, res, 'vary') || '');
    const novoVary = /accept-encoding/i.test(vary) ? vary : (vary ? vary + ', ' : '') + 'Accept-Encoding';
    restaurar();
    if (args) {
      const novos = {};
      for (const k in headers || {}) {
        const kl = k.toLowerCase();
        if (kl === 'content-length' || kl === 'vary') continue;
        novos[k] = headers[k];
      }
      novos['Content-Encoding'] = enc;
      novos['Vary'] = novoVary;
      novos['Content-Length'] = saida.length;
      res.removeHeader('content-length');
      const a = Array.prototype.slice.call(args);
      if (headers) a[a.length - 1] = novos; else a.push(novos);
      adiado = null;
      writeHeadOriginal.apply(res, a);
    } else {
      res.removeHeader('content-length');
      res.setHeader('Content-Encoding', enc);
      res.setHeader('Vary', novoVary);
      res.setHeader('Content-Length', saida.length);
    }
    return endOriginal.call(res, saida, cb);
  };
}

module.exports = { ligar, escolher, MIN_BYTES, _cache: cache };
