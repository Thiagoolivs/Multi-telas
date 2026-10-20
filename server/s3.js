/*
 * server/s3.js — cliente S3 mínimo (R2, AWS, MinIO), com assinatura SigV4
 * feita aqui com node:crypto, sem dependências.
 *
 * Existe à parte do server/storage.js porque o backup fala com OUTRO bucket,
 * com outra chave: o de mídia é servido ao público, o de backup nunca pode
 * ser. O storage.js tem a mesma assinatura presa às variáveis S3_* da mídia;
 * unificar os dois fica para quando a mídia mudar de novo.
 *
 * Testado contra os exemplos de assinatura da documentação da AWS
 * (test/backup.test.js) e contra um MinIO de verdade (docs/BACKUP.md).
 */
const crypto = require('crypto');

const hmac = (key, str) => crypto.createHmac('sha256', key).update(str).digest();
const sha256hex = (x) => crypto.createHash('sha256').update(x).digest('hex');
const VAZIO = sha256hex('');

// RFC 3986: o encodeURIComponent deixa passar !'()* — a AWS não.
const enc = (s) => encodeURIComponent(s).replace(/[!'()*]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase());
const encPath = (p) => p.split('/').map(enc).join('/');

function criar(cfg) {
  const c = {
    endpoint: String(cfg.endpoint || '').replace(/\/$/, ''),
    bucket: String(cfg.bucket || ''),
    region: cfg.region || 'auto',
    key: String(cfg.key || ''),
    secret: String(cfg.secret || ''),
    pathStyle: cfg.pathStyle,
  };
  if (!c.endpoint || !c.bucket || !c.key || !c.secret) throw new Error('S3: faltam endpoint, bucket, chave ou segredo');
  // Endpoint que já começa pelo bucket é host virtual; o resto (R2, MinIO) é por caminho.
  if (c.pathStyle == null) c.pathStyle = !new URL(c.endpoint).host.startsWith(c.bucket + '.');

  function caminho(chave) {
    return (c.pathStyle ? '/' + c.bucket : '') + '/' + encPath(chave || '');
  }

  /*
   * Monta a requisição assinada. `agora` só existe para o teste reproduzir os
   * exemplos da AWS, que têm data fixa.
   */
  function assinar(metodo, chave, { hash = VAZIO, cabecalhos = {}, query = {}, agora } = {}) {
    const base = new URL(c.endpoint);
    const pathname = caminho(chave);
    const amzDate = (agora || new Date()).toISOString().replace(/[:-]|\.\d{3}/g, '');
    const dia = amzDate.slice(0, 8);
    const h = Object.assign({ host: base.host, 'x-amz-content-sha256': hash, 'x-amz-date': amzDate }, cabecalhos);
    const nomes = Object.keys(h).map((n) => n.toLowerCase()).sort();
    const valor = (n) => String(h[Object.keys(h).find((k) => k.toLowerCase() === n)]).trim().replace(/\s+/g, ' ');
    const canonHeaders = nomes.map((n) => n + ':' + valor(n) + '\n').join('');
    const assinados = nomes.join(';');
    const canonQuery = Object.keys(query).sort().map((k) => enc(k) + '=' + enc(String(query[k]))).join('&');
    const canon = [metodo, pathname, canonQuery, canonHeaders, assinados, hash].join('\n');
    const escopo = dia + '/' + c.region + '/s3/aws4_request';
    const paraAssinar = ['AWS4-HMAC-SHA256', amzDate, escopo, sha256hex(canon)].join('\n');
    const kAssinatura = hmac(hmac(hmac(hmac('AWS4' + c.secret, dia), c.region), 's3'), 'aws4_request');
    const assinatura = crypto.createHmac('sha256', kAssinatura).update(paraAssinar).digest('hex');
    h.authorization = 'AWS4-HMAC-SHA256 Credential=' + c.key + '/' + escopo
      + ', SignedHeaders=' + assinados + ', Signature=' + assinatura;
    delete h.host;
    return { url: base.origin + pathname + (canonQuery ? '?' + canonQuery : ''), headers: h, assinatura };
  }

  async function falha(res, oque) {
    const txt = await res.text().catch(() => '');
    return new Error('S3 ' + oque + ' ' + res.status + ' ' + txt.slice(0, 300));
  }

  // body pode ser Buffer ou stream web; com stream, sha256 e tamanho vêm de fora.
  async function enviar(chave, body, { tipo = 'application/octet-stream', sha256, tamanho } = {}) {
    const hash = sha256 || sha256hex(body);
    const len = tamanho != null ? tamanho : body.length;
    const { url, headers } = assinar('PUT', chave, { hash, cabecalhos: { 'content-type': tipo, 'content-length': String(len) } });
    const res = await fetch(url, { method: 'PUT', headers, body, duplex: 'half' });
    if (!res.ok) throw await falha(res, 'PUT');
  }

  async function baixar(chave) {
    const { url, headers } = assinar('GET', chave);
    const res = await fetch(url, { headers });
    if (res.status === 404) return null;
    if (!res.ok) throw await falha(res, 'GET');
    return res;
  }

  async function apagar(chave) {
    const { url, headers } = assinar('DELETE', chave);
    const res = await fetch(url, { method: 'DELETE', headers });
    if (!res.ok && res.status !== 404) throw await falha(res, 'DELETE');
  }

  // ListObjectsV2, página por página. Devolve [{ chave, tamanho }].
  async function listar(prefixo) {
    const itens = [];
    let token = null;
    do {
      const query = { 'list-type': '2', prefix: prefixo || '' };
      if (token) query['continuation-token'] = token;
      const { url, headers } = assinar('GET', '', { query });
      const res = await fetch(url, { headers });
      if (!res.ok) throw await falha(res, 'LIST');
      const xml = await res.text();
      itens.push(...lerLista(xml));
      token = /<IsTruncated>true<\/IsTruncated>/.test(xml) ? (xml.match(/<NextContinuationToken>([^<]+)<\/NextContinuationToken>/) || [])[1] : null;
    } while (token);
    return itens;
  }

  return { assinar, enviar, baixar, apagar, listar, config: { endpoint: c.endpoint, bucket: c.bucket, region: c.region, pathStyle: c.pathStyle } };
}

const XML_ENT = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'" };
function lerLista(xml) {
  return [...String(xml).matchAll(/<Contents>([\s\S]*?)<\/Contents>/g)].map((m) => ({
    chave: ((m[1].match(/<Key>([\s\S]*?)<\/Key>/) || [])[1] || '').replace(/&(amp|lt|gt|quot|apos);/g, (e) => XML_ENT[e]),
    tamanho: Number((m[1].match(/<Size>(\d+)<\/Size>/) || [])[1] || 0),
  }));
}

module.exports = { criar, lerLista, sha256hex };
