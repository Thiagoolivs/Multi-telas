'use strict';
/*
 * Tudo o que sai desta máquina pela rede.
 *
 * Dois destinos bem diferentes:
 *  - o servidor do MultiTelas (internet, HTTPS, com o token), pela `criarApi`;
 *  - a intranet da empresa (os feeds e as imagens deles), pela
 *    `baixarDaIntranet`, SEM o token e só para os hosts que o TI liberou.
 *
 * Só o fetch do próprio Node, sem biblioteca: o .exe tem de ser um arquivo
 * só, sem nada nativo. O proxy corporativo usa o suporte embutido do Node
 * (o mesmo EnvHttpProxyAgent do undici, que já vem dentro do Node): nada a
 * instalar e nada a empacotar.
 */
const fs = require('node:fs');
const { Readable } = require('node:stream');

class ErroDoServidor extends Error {
  constructor(status, corpo) {
    const motivo = corpo && typeof corpo === 'object' && corpo.error ? String(corpo.error) : '';
    super(motivo || ('o servidor respondeu ' + status));
    this.name = 'ErroDoServidor';
    this.status = status;
    this.code = corpo && typeof corpo === 'object' ? corpo.code : undefined;
  }
}
class TokenRevogado extends Error {
  constructor() { super('o servidor recusou o token (401)'); this.name = 'TokenRevogado'; }
}
class SemConexao extends Error {
  constructor(msg) { super(msg); this.name = 'SemConexao'; }
}
class ErroDeLeitura extends Error {
  constructor(msg, causa) { super(msg); this.name = 'ErroDeLeitura'; this.causa = causa; }
}
class ErroDaIntranet extends Error {
  constructor(msg) { super(msg); this.name = 'ErroDaIntranet'; }
}

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

// A mensagem crua do fetch ("fetch failed") não diz nada ao TI. Aqui ela vira
// o que olhar: DNS, firewall, proxy ou certificado.
function explicarFalhaDeRede(e, host) {
  const c = (e && e.cause) || e || {};
  const code = String(c.code || '');
  const msg = String(c.message || (e && e.message) || '');
  if ((e && e.name === 'TimeoutError') || c.name === 'TimeoutError' || /TIMEOUT|ETIMEDOUT/.test(code)) return host + ' demorou demais para responder';
  if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') return 'não achei o endereço ' + host + ' (DNS). Esta máquina tem acesso a esse endereço?';
  if (code === 'ECONNREFUSED') return 'a conexão com ' + host + ' foi recusada (firewall ou endereço errado)';
  if (code === 'ECONNRESET' || code === 'UND_ERR_SOCKET' || code === 'EPIPE') return 'a conexão com ' + host + ' caiu no meio';
  if (/CERT|SELF_SIGNED|UNABLE_TO_VERIFY|UNABLE_TO_GET_ISSUER|ERR_TLS/.test(code)) {
    return 'o certificado HTTPS de ' + host + ' não foi aceito (' + code + '). Se a empresa usa um proxy que inspeciona HTTPS, '
      + 'aponte "certificadoCA" no conector.json para o certificado da empresa (veja o LEIA-ME)';
  }
  const proxy = /Proxy response \((\d+)\)/.exec(msg);
  if (proxy && proxy[1] === '407') return 'o proxy pediu usuário e senha (407): use "proxy": "http://usuario:senha@proxy:porta" no conector.json';
  if (proxy) return 'o proxy recusou a conexão com ' + host + ' (' + proxy[1] + '): peça para liberar ' + host + ' no proxy da empresa';
  return 'falha de rede ao falar com ' + host + ': ' + (msg || code || 'erro desconhecido');
}

function falhaPermanente(e) {
  const c = (e && e.cause) || e || {};
  return /CERT|SELF_SIGNED|UNABLE_TO_VERIFY|UNABLE_TO_GET_ISSUER|ERR_TLS/.test(String(c.code || '')) || /Proxy response \(407\)/.test(String(c.message || ''));
}

// Retry-After vem em segundos ou como data HTTP.
function lerRetryAfter(v) {
  if (v == null || v === '') return null;
  if (/^\d+(\.\d+)?$/.test(String(v).trim())) return Math.round(Number(v) * 1000);
  const t = Date.parse(v);
  return Number.isFinite(t) ? Math.max(0, t - Date.now()) : null;
}

async function corpoDeErro(resp) {
  let texto = '';
  try { texto = await resp.text(); } catch (e) { return null; }
  try { return JSON.parse(texto); } catch (e) { return texto ? { error: texto.slice(0, 200) } : null; }
}

async function descartar(resp) {
  try { if (resp.body) await resp.body.cancel(); } catch (e) { /* nada a fazer */ }
}

/*
 * O cliente da API do MultiTelas (o contrato está no README do conector).
 *
 * Política de nova tentativa: 429 e 5xx esperam e tentam de novo, com espera
 * dobrando a cada vez (e respeitando o Retry-After do servidor); queda de
 * rede também. 401 para TUDO na hora (o token foi revogado — insistir não
 * adianta e enche o log do servidor). Os outros 4xx são do pedido (arquivo
 * grande demais, tipo recusado) e não se repetem.
 */
function criarApi(o) {
  const base = String(o.servidor).replace(/\/+$/, '');
  const host = new URL(base).host;
  const fazer = o.fetch || globalThis.fetch;
  const esperar = o.esperar || dormir;
  const tentativas = o.tentativas || 5;
  const esperaBase = o.esperaBaseMs != null ? o.esperaBaseMs : 1000;
  const esperaMaxima = o.esperaMaximaMs != null ? o.esperaMaximaMs : 60000;
  const timeout = o.timeoutMs || 60000;
  const timeoutEnvio = o.timeoutEnvioMs || 30 * 60 * 1000;
  const log = o.log;

  function espera(n) {
    const ms = Math.min(esperaMaxima, esperaBase * 2 ** (n - 1));
    return Math.round(ms + Math.random() * ms * 0.2); // um pouco de sorteio: 8 conectores não voltam todos no mesmo segundo
  }

  async function pedir(metodo, caminho, op = {}) {
    let ultimo;
    for (let n = 1; n <= tentativas; n++) {
      const cabecalhos = Object.assign({
        authorization: 'Bearer ' + o.token,
        'x-conector-versao': o.versao,
        'x-conector-maquina': o.maquina,
        accept: 'application/json',
        'user-agent': 'MultiTelasConector/' + o.versao,
      }, op.cabecalhos || {});
      // Redirecionamento manual: um PUT com corpo em fluxo não pode ser
      // reenviado sozinho, e o token não deve seguir para outro endereço.
      const init = { method: metodo, headers: cabecalhos, redirect: 'manual', signal: AbortSignal.timeout(op.timeoutMs || timeout) };
      let erroLeitura = null;
      if (op.corpo !== undefined) {
        const corpo = typeof op.corpo === 'function' ? op.corpo((e) => { erroLeitura = e; }) : op.corpo;
        init.body = corpo;
        if (corpo && typeof corpo.getReader === 'function') init.duplex = 'half';
      }
      let resp;
      try {
        resp = await fazer(base + caminho, init);
      } catch (e) {
        // O arquivo sumiu ou travou no meio do envio: não é a rede, e repetir agora não ajuda.
        if (erroLeitura) throw new ErroDeLeitura('não consegui ler o arquivo durante o envio: ' + erroLeitura.message, erroLeitura);
        ultimo = new SemConexao(explicarFalhaDeRede(e, host));
        // Certificado recusado ou proxy pedindo senha não melhoram em 15 s: falha logo.
        if (n < tentativas && !falhaPermanente(e)) { await esperar(espera(n)); continue; }
        throw ultimo;
      }
      if (resp.status === 401) { await descartar(resp); throw new TokenRevogado(); }
      if (resp.status === 429 || resp.status >= 500) {
        const pedido = lerRetryAfter(resp.headers.get('retry-after'));
        ultimo = new ErroDoServidor(resp.status, await corpoDeErro(resp));
        if (n < tentativas) {
          const ms = pedido != null ? Math.min(pedido, esperaMaxima) : espera(n);
          if (log) log.aviso('O servidor respondeu ' + resp.status + (resp.status === 429 ? ' (muitos pedidos)' : ' (erro do lado de lá)')
            + ' em ' + metodo + ' ' + caminho.split('?')[0] + '. Tento de novo em ' + Math.max(1, Math.round(ms / 1000)) + ' s (' + n + 'ª tentativa de ' + tentativas + ').');
          await esperar(ms);
          continue;
        }
        throw ultimo;
      }
      if (resp.status >= 300 && resp.status < 400) {
        await descartar(resp);
        throw new ErroDoServidor(resp.status, { error: 'o servidor mandou para outro endereço (' + (resp.headers.get('location') || '?') + '). Confira "servidor" no conector.json', code: 'redirecionado' });
      }
      if (!resp.ok) throw new ErroDoServidor(resp.status, await corpoDeErro(resp));
      const texto = await resp.text();
      if (!texto) return {};
      try { return JSON.parse(texto); } catch (e) {
        throw new ErroDoServidor(resp.status, { error: 'a resposta do servidor não é JSON (o endereço em "servidor" está certo?)', code: 'resposta-invalida' });
      }
    }
    throw ultimo;
  }

  const enc = encodeURIComponent;
  return {
    host,
    handshake: () => pedir('GET', '/api/v1/conector'),
    listarPasta: (chave) => pedir('GET', '/api/v1/pastas/' + enc(chave)),
    /*
     * O arquivo vai em fluxo, direto do disco: um vídeo de 200 MB não passa
     * pela memória. `dados` (Buffer) é para o que já está em memória (as
     * imagens dos feeds).
     */
    enviarArquivo: (chave, nome, a) => pedir('PUT', '/api/v1/pastas/' + enc(chave) + '/arquivos/' + enc(nome), {
      corpo: a.dados ? a.dados : (aoFalhar) => {
        const fluxo = fs.createReadStream(a.caminho);
        fluxo.on('error', aoFalhar);
        return Readable.toWeb(fluxo);
      },
      cabecalhos: { 'content-type': a.tipo, 'content-length': String(a.tamanho), 'x-sha256': a.sha256 },
      timeoutMs: timeoutEnvio,
    }),
    apagarArquivo: (chave, nome) => pedir('DELETE', '/api/v1/pastas/' + enc(chave) + '/arquivos/' + enc(nome)),
    enviarPlanilha: (chave, csv) => pedir('PUT', '/api/v1/planilhas/' + enc(chave), {
      corpo: Buffer.from(csv, 'utf8'),
      cabecalhos: { 'content-type': 'text/csv; charset=utf-8' },
      timeoutMs: timeoutEnvio,
    }),
    salvarComunicado: (id, dados) => pedir('PUT', '/api/v1/comunicados/' + enc(id), {
      corpo: JSON.stringify(dados),
      cabecalhos: { 'content-type': 'application/json' },
    }),
    apagarComunicado: (id) => pedir('DELETE', '/api/v1/comunicados/' + enc(id)),
  };
}

/* ---------------- a intranet ---------------- */

/*
 * O endereço do feed vem do servidor, mas quem busca é esta máquina, DENTRO
 * da rede da empresa. Sem uma lista local de hosts liberados, quem mexesse na
 * conta do MultiTelas poderia fazer o conector ler qualquer sistema interno e
 * mandar o conteúdo para a nuvem. Por isso o TI decide, no conector.json, que
 * hosts o conector pode ler — e cada redirecionamento é conferido de novo.
 */
function hostPermitido(host, lista) {
  const h = String(host || '').toLowerCase().replace(/\.$/, '');
  return (lista || []).some((item) => {
    const p = String(item).toLowerCase().trim();
    if (!p) return false;
    if (p.startsWith('*.')) return h.endsWith(p.slice(1)) && h.length > p.length - 1;
    return h === p;
  });
}

async function lerLimitado(corpo, maximo) {
  if (!corpo) return Buffer.alloc(0);
  const partes = [];
  let total = 0;
  for await (const p of corpo) {
    total += p.length;
    if (total > maximo) throw new ErroDaIntranet('passou do limite de ' + Math.round(maximo / 1024 / 1024) + ' MB');
    partes.push(Buffer.from(p));
  }
  return Buffer.concat(partes);
}

async function baixarDaIntranet(url, o = {}) {
  const fazer = o.fetch || globalThis.fetch;
  const maximo = o.maxBytes || 5 * 1024 * 1024;
  let atual = url;
  for (let pulos = 0; pulos <= 5; pulos++) {
    let u;
    try { u = new URL(atual); } catch (e) { throw new ErroDaIntranet('o endereço "' + atual + '" não é válido'); }
    if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new ErroDaIntranet('só leio endereços http:// ou https:// (veio ' + u.protocol + ')');
    if (u.username || u.password) throw new ErroDaIntranet('o endereço tem usuário e senha embutidos; use "intranet.cabecalhos" no conector.json');
    if (!hostPermitido(u.hostname, o.hostsPermitidos)) {
      const e = new ErroDaIntranet('o host "' + u.hostname + '" não está liberado em "intranet.hostsPermitidos" do conector.json');
      e.code = 'host-nao-permitido';
      e.host = u.hostname;
      throw e;
    }
    const extras = (o.cabecalhos && o.cabecalhos[u.hostname.toLowerCase()]) || {};
    let resp;
    try {
      resp = await fazer(u.href, {
        headers: Object.assign({ accept: o.aceitar || '*/*', 'user-agent': 'MultiTelasConector/' + (o.versao || '1') }, extras),
        redirect: 'manual',
        signal: AbortSignal.timeout(o.timeoutMs || 30000),
      });
    } catch (e) {
      throw new ErroDaIntranet(explicarFalhaDeRede(e, u.host));
    }
    if (resp.status >= 300 && resp.status < 400 && resp.headers.get('location')) {
      await descartar(resp);
      atual = new URL(resp.headers.get('location'), u).href;
      continue;
    }
    if (!resp.ok) {
      await descartar(resp);
      throw new ErroDaIntranet(u.host + ' respondeu ' + resp.status + (resp.status === 401 || resp.status === 403 ? ' (pede login: veja "intranet.cabecalhos" no LEIA-ME)' : ''));
    }
    const declarado = Number(resp.headers.get('content-length'));
    if (declarado > maximo) { await descartar(resp); throw new ErroDaIntranet('passou do limite de ' + Math.round(maximo / 1024 / 1024) + ' MB'); }
    const bytes = await lerLimitado(resp.body, maximo);
    return { bytes, tipo: resp.headers.get('content-type') || '', url: u.href };
  }
  throw new ErroDaIntranet('redirecionamentos demais a partir de ' + url);
}

/* ---------------- proxy e certificado ---------------- */

function semDuplicados(lista) {
  const vistos = new Set();
  const out = [];
  for (const item of lista.join(',').split(',').map((s) => s.trim()).filter(Boolean)) {
    const k = item.toLowerCase();
    if (!vistos.has(k)) { vistos.add(k); out.push(item); }
  }
  return out.join(',');
}

/*
 * O que o proxy embutido do Node recebe. A intranet NÃO passa pelo proxy (em
 * geral o proxy corporativo nem alcança os servidores internos), a não ser
 * que o TI peça com "intranet.usarProxy".
 */
function ambienteDoProxy(cfg, env = process.env) {
  const https = cfg.proxy || env.HTTPS_PROXY || env.https_proxy || '';
  const http = cfg.proxy || env.HTTP_PROXY || env.http_proxy || https;
  if (!https && !http) return null;
  const sem = [env.NO_PROXY || env.no_proxy || '', cfg.semProxy || '', 'localhost,127.0.0.1,::1'];
  if (!(cfg.intranet && cfg.intranet.usarProxy)) sem.push(((cfg.intranet && cfg.intranet.hostsPermitidos) || []).join(','));
  return { HTTPS_PROXY: https, HTTP_PROXY: http, NO_PROXY: semDuplicados(sem) };
}

function semSenha(url) { return String(url).replace(/(\/\/[^\s/:@]+:)[^\s/@]+@/, '$1***@'); }

// Certificado exportado do Windows costuma vir em DER (.cer binário): vira PEM aqui.
function certificadosDoArquivo(bytes) {
  const texto = bytes.toString('latin1');
  const pems = texto.match(/-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/g);
  if (pems) return pems;
  if (bytes[0] === 0x30) {
    const b64 = bytes.toString('base64').replace(/(.{64})/g, '$1\n').trim();
    return ['-----BEGIN CERTIFICATE-----\n' + b64 + '\n-----END CERTIFICATE-----'];
  }
  return [];
}

/*
 * Liga o proxy e o certificado da empresa. Chamado a cada ciclo (o TI pode
 * mudar o conector.json com o conector rodando); só refaz quando mudou.
 */
function criarRede(log) {
  let proxyAplicado = 'nenhum';
  let desfazerProxy = null;
  let caAplicado = '';
  const http = require('node:http');

  function aplicar(cfg, env = process.env) {
    const resumo = { proxy: 'sem proxy', certificado: env.NODE_EXTRA_CA_CERTS ? 'NODE_EXTRA_CA_CERTS' : '' };
    const amb = ambienteDoProxy(cfg, env);
    const chave = amb ? JSON.stringify(amb) : '';
    if (chave !== proxyAplicado) {
      if (typeof http.setGlobalProxyFromEnv === 'function') {
        if (desfazerProxy) { try { desfazerProxy(); } catch (e) { /* já desfeito */ } desfazerProxy = null; }
        if (amb) {
          try {
            desfazerProxy = http.setGlobalProxyFromEnv(amb);
            log.info('Proxy ligado: ' + semSenha(amb.HTTPS_PROXY || amb.HTTP_PROXY) + ' (sem proxy para: ' + amb.NO_PROXY + ').');
          } catch (e) {
            log.erro('Não consegui ligar o proxy ' + semSenha(amb.HTTPS_PROXY) + ': ' + e.message);
          }
        } else if (proxyAplicado !== 'nenhum') log.info('Proxy desligado.');
      } else if (amb) {
        // Node antigo (só no desenvolvimento: o .exe leva um Node que tem a função).
        const doAmbiente = env.NODE_USE_ENV_PROXY === '1' || process.execArgv.includes('--use-env-proxy');
        log.umaVez('proxy-antigo', doAmbiente ? 'info' : 'aviso', doAmbiente
          ? 'Proxy pelas variáveis de ambiente (NODE_USE_ENV_PROXY): ' + semSenha(amb.HTTPS_PROXY || amb.HTTP_PROXY) + '.'
          : 'Há proxy configurado (' + semSenha(amb.HTTPS_PROXY || amb.HTTP_PROXY) + '), mas este Node (' + process.version + ') não liga proxy sozinho. Use o MultiTelasConector.exe ou defina NODE_USE_ENV_PROXY=1.');
      }
      proxyAplicado = chave || 'nenhum';
    }
    if (amb) resumo.proxy = semSenha(amb.HTTPS_PROXY || amb.HTTP_PROXY);

    if (cfg.certificadoCA && cfg.certificadoCA !== caAplicado) {
      caAplicado = cfg.certificadoCA;
      try {
        const tls = require('node:tls');
        const certs = certificadosDoArquivo(fs.readFileSync(cfg.certificadoCA));
        if (!certs.length) throw new Error('não achei certificado no arquivo (exporte como "X.509 codificado na base 64" ou DER)');
        if (typeof tls.setDefaultCACertificates !== 'function') throw new Error('este Node não aceita certificado em tempo de execução; use a variável NODE_EXTRA_CA_CERTS');
        tls.setDefaultCACertificates([...tls.getCACertificates('default'), ...certs]);
        log.info('Certificado da empresa carregado de ' + cfg.certificadoCA + ' (' + certs.length + ').');
      } catch (e) {
        log.erro('Não consegui usar o certificado "' + cfg.certificadoCA + '": ' + e.message);
      }
    }
    if (cfg.certificadoCA) resumo.certificado = cfg.certificadoCA;
    return resumo;
  }
  return { aplicar };
}

module.exports = {
  criarApi, baixarDaIntranet, hostPermitido, ambienteDoProxy, criarRede, explicarFalhaDeRede, lerRetryAfter, certificadosDoArquivo,
  ErroDoServidor, TokenRevogado, SemConexao, ErroDeLeitura, ErroDaIntranet, dormir,
};
