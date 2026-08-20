/*
 * server/site.js — o site do cliente como referência de estilo.
 *
 * A ideia: em vez de a pessoa descrever a marca em palavras ("azul meio
 * escuro, fonte moderna"), ela cola o endereço do site e o sistema LÊ de lá as
 * cores, as fontes, o título e a imagem que o próprio site publica como sua
 * cara. É o caminho mais curto entre "tenho uma marca" e "a IA sabe como ela é".
 *
 * ─────────────────────────────────────────────────────────────────────────
 * ISTO É UM PEDIDO HTTP COM ENDEREÇO ESCOLHIDO PELO USUÁRIO.
 *
 * Ou seja: é SSRF por construção, e a defesa não é opcional. Um endereço como
 * http://169.254.169.254/ (metadados da nuvem) ou http://127.0.0.1:5432/ sai
 * DE DENTRO da nossa rede, com a nossa confiança, e devolve para o usuário o
 * que só o servidor deveria ver. As defesas aqui:
 *
 *   1. só http e https — nada de file:, gopher:, data:;
 *   2. o IP é RESOLVIDO e conferido contra as faixas privadas ANTES de
 *      conectar, e a conexão é feita no IP conferido (`lookup` fixo), o que
 *      fecha a janela de DNS rebinding entre a checagem e o socket;
 *   3. redirecionamento é seguido À MÃO, no máximo 3 vezes, e CADA salto passa
 *      pela mesma checagem — um site pode responder 302 para 127.0.0.1;
 *   4. tempo e tamanho com teto: um endereço que responde devagar para sempre
 *      seguraria um pedido nosso para sempre.
 *
 * O que sai daqui é DADO, nunca instrução: o resumo vai para o prompt da IA
 * como descrição da marca, e o texto de um site é escrito por qualquer um.
 */
const dns = require('dns').promises;
const net = require('net');
const http = require('http');
const https = require('https');

const LIMITE_BYTES = 1.5 * 1024 * 1024;   // 1,5 MB de HTML já é muito
const LIMITE_MS = 8000;
const MAX_SALTOS = 3;

/*
 * Faixas que NÃO podem ser alcançadas: elas são a rede interna, e alcançá-las
 * a pedido de um usuário é o buraco inteiro.
 */
function ipPrivado(ip) {
  const v = net.isIP(ip);
  if (!v) return true;                    // não sei o que é isto — não vou lá

  if (v === 4) {
    const p = ip.split('.').map(Number);
    if (p[0] === 0) return true;                          // 0.0.0.0/8
    if (p[0] === 10) return true;                         // 10/8
    if (p[0] === 127) return true;                        // loopback
    if (p[0] === 100 && p[1] >= 64 && p[1] <= 127) return true;  // CGNAT 100.64/10
    if (p[0] === 169 && p[1] === 254) return true;        // link-local (metadados da nuvem)
    if (p[0] === 172 && p[1] >= 16 && p[1] <= 31) return true;   // 172.16/12
    if (p[0] === 192 && p[1] === 168) return true;        // 192.168/16
    if (p[0] === 192 && p[1] === 0 && p[2] === 0) return true;   // IETF
    if (p[0] === 192 && p[1] === 0 && p[2] === 2) return true;   // TEST-NET-1
    if (p[0] === 198 && (p[1] === 18 || p[1] === 19)) return true; // benchmark
    if (p[0] === 198 && p[1] === 51 && p[2] === 100) return true;  // TEST-NET-2
    if (p[0] === 203 && p[1] === 0 && p[2] === 113) return true;   // TEST-NET-3
    if (p[0] >= 224) return true;                         // multicast e reservado
    return false;
  }

  const s = ip.toLowerCase().replace(/^\[|\]$/g, '');
  if (s === '::' || s === '::1') return true;
  if (s.startsWith('fe80')) return true;                  // link-local
  if (/^f[cd]/.test(s)) return true;                      // ULA fc00::/7
  // ::ffff:10.0.0.1 e afins: é IPv4 disfarçado, e a regra é a do IPv4.
  const mapeado = s.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapeado) return ipPrivado(mapeado[1]);
  return false;
}

/*
 * Confere o endereço e devolve o IP em que se pode conectar.
 *
 * Devolver o IP não é detalhe: quem conecta usa ESTE endereço, e não resolve o
 * nome de novo. Resolver duas vezes deixaria a janela em que o DNS responde
 * "1.2.3.4" para a checagem e "127.0.0.1" para o socket.
 */
async function conferir(alvo) {
  let u;
  try { u = new URL(alvo); } catch (e) { return { erro: 'endereço inválido' }; }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return { erro: 'só http e https' };
  if (u.username || u.password) return { erro: 'endereço com usuário e senha não é aceito' };

  const host = u.hostname.replace(/^\[|\]$/g, '');
  let ips = [];
  if (net.isIP(host)) ips = [host];
  else {
    try {
      const r = await dns.lookup(host, { all: true });
      ips = r.map((x) => x.address);
    } catch (e) { return { erro: 'não consegui encontrar esse endereço' }; }
  }
  if (!ips.length) return { erro: 'não consegui encontrar esse endereço' };
  // TODOS têm que passar: um nome que resolve para um público e um privado
  // escolheria o privado na hora de conectar se deixássemos.
  for (const ip of ips) if (ipPrivado(ip)) return { erro: 'esse endereço aponta para uma rede interna' };
  return { url: u, ip: ips[0] };
}

/*
 * Uma requisição, presa ao IP que já passou pela checagem.
 *
 * `fetch` não serve aqui, e o motivo é o buraco inteiro: ele RESOLVE O NOME DE
 * NOVO na hora de conectar. Entre a nossa checagem e o socket dele existe uma
 * janela em que o mesmo nome pode responder "1.2.3.4" para nós e "127.0.0.1"
 * para ele — é o DNS rebinding, e ele derruba toda a validação de cima.
 *
 * `http.request` aceita `lookup`, então a resolução é NOSSA: devolvemos o
 * endereço já conferido e a conexão vai onde mandamos. O nome continua indo no
 * Host e no SNI, então o certificado e o vhost do site continuam corretos.
 */
function pedir(u, ip) {
  return new Promise((resolve) => {
    const mod = u.protocol === 'https:' ? https : http;
    const req = mod.request({
      protocol: u.protocol,
      hostname: u.hostname,
      port: u.port || (u.protocol === 'https:' ? 443 : 80),
      path: u.pathname + u.search,
      method: 'GET',
      // A resolução é nossa: sempre o IP que passou pela checagem.
      lookup: (_nome, opcoes, cb) => {
        const familia = net.isIP(ip);
        if (opcoes && opcoes.all) return cb(null, [{ address: ip, family: familia }]);
        return cb(null, ip, familia);
      },
      headers: {
        'user-agent': 'MultiTelas/1.0 (+leitura de identidade visual)',
        accept: 'text/html',
      },
      timeout: LIMITE_MS,
    }, (res) => {
      const partes = [];
      let total = 0;
      res.on('data', (c) => {
        total += c.length;
        // Corta na hora: uma página que nunca termina não pode nos segurar, e
        // HTML de 50 MB não tem nada de útil a mais.
        if (total <= LIMITE_BYTES) partes.push(c);
        else res.destroy();
      });
      res.on('end', () => resolve({
        status: res.statusCode,
        headers: res.headers,
        corpo: Buffer.concat(partes).toString('utf8').slice(0, LIMITE_BYTES),
      }));
      res.on('error', () => resolve({ erro: 'o site cortou a resposta' }));
      res.on('aborted', () => resolve({
        status: res.statusCode,
        headers: res.headers,
        corpo: Buffer.concat(partes).toString('utf8').slice(0, LIMITE_BYTES),
      }));
    });
    req.on('timeout', () => { req.destroy(); resolve({ erro: 'o site demorou demais' }); });
    req.on('error', () => resolve({ erro: 'o site não respondeu' }));
    req.end();
  });
}

/*
 * Busca a página, seguindo redirecionamento À MÃO.
 *
 * Seguir sozinho seria o mesmo buraco por outra porta: um site pode responder
 * 302 para http://127.0.0.1, e um cliente que segue redirecionamento
 * automaticamente entraria lá sem passar por `conferir` de novo. Cada salto
 * repete a checagem inteira.
 */
async function buscar(alvo, politica) {
  /*
   * `politica` é a checagem de endereço, injetável para o teste conseguir
   * exercitar redirecionamento contra um servidor local — que, por definição,
   * mora num IP que a política de produção recusa.
   *
   * Só `analisar` chama isto, e ele NUNCA passa política: em produção a
   * checagem é sempre `conferir`. Quem escrever um segundo chamador precisa
   * fazer o mesmo.
   */
  const checar = politica || conferir;
  let atual = alvo;
  for (let salto = 0; salto <= MAX_SALTOS; salto++) {
    const c = await checar(atual);
    if (c.erro) return { erro: c.erro };

    const res = await pedir(c.url, c.ip);
    if (res.erro) return { erro: res.erro };

    if (res.status >= 300 && res.status < 400) {
      const destino = res.headers.location;
      if (!destino) return { erro: 'o site respondeu um redirecionamento sem destino' };
      atual = new URL(destino, c.url.href).href;
      continue;
    }
    if (res.status < 200 || res.status >= 300) return { erro: 'o site respondeu ' + res.status };

    const tipo = res.headers['content-type'] || '';
    if (!/text\/html|application\/xhtml/i.test(tipo)) return { erro: 'esse endereço não é uma página' };

    return { html: res.corpo, url: c.url.href };
  }
  return { erro: 'o site redirecionou vezes demais' };
}

/* ---------------- O que se lê da página ---------------- */

const semTag = (t) => String(t || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

function meta(html, nome) {
  const re = new RegExp('<meta[^>]+(?:name|property)=["\\\']' + nome + '["\\\'][^>]*>', 'i');
  const tag = (html.match(re) || [])[0];
  if (!tag) return '';
  const c = tag.match(/content=["']([^"']*)["']/i);
  return c ? c[1].trim() : '';
}

/*
 * As cores que o site realmente usa.
 *
 * Conta frequência em vez de pegar as primeiras: a primeira cor de uma folha
 * de estilo costuma ser um `#fff` de reset, e a marca aparece muito depois.
 * Preto, branco e cinzas saem fora porque são de todo mundo — dizer que a cor
 * da marca é #ffffff não ajuda ninguém a compor.
 */
function coresDe(html) {
  const conta = new Map();
  const re = /#([0-9a-f]{6}|[0-9a-f]{3})\b/gi;
  let m;
  while ((m = re.exec(html))) {
    let hex = m[1].toLowerCase();
    if (hex.length === 3) hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
    if (semGraca(hex)) continue;
    conta.set(hex, (conta.get(hex) || 0) + 1);
  }
  return [...conta.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([h]) => '#' + h);
}

// Cinza é qualquer cor cujos canais quase não se separam; sem isto a lista
// volta cheia de #f8f8f8 e #333333, que não são identidade de ninguém.
function semGraca(hex) {
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max - min < 24) return true;        // cinza, preto, branco
  if (max < 24 || min > 232) return true; // quase preto ou quase branco
  return false;
}

/* As famílias que a página pede. Fonte é metade da identidade, e ninguém
 * consegue nomear a própria fonte de cabeça. */
function fontesDe(html) {
  const achadas = new Set();
  /*
   * O `[^;}]` inclui aspas de propósito. A versão anterior era `[^;}"']`, que
   * parava NA ASPA — e como quase toda declaração real é `font-family:
   * "Poppins", sans-serif`, a captura vinha vazia e nenhuma fonte de CSS era
   * lida. As aspas saem depois, na limpeza.
   */
  const re = /font-family\s*:\s*([^;}]+)/gi;
  let m;
  while ((m = re.exec(html)) && achadas.size < 12) {
    const primeira = m[1].split(',')[0].replace(/["']/g, '').trim();
    if (!primeira || primeira.length > 40) continue;
    if (/^(inherit|initial|unset|var\(|-|serif|sans-serif|monospace|system-ui)$/i.test(primeira)) continue;
    achadas.add(primeira);
  }
  // Google Fonts entrega a família no próprio endereço da folha, e essa é a
  // pista mais confiável: é uma fonte que o site escolheu, não um fallback.
  const gf = /fonts\.googleapis\.com\/css2?\?([^"'>]+)/gi;
  while ((m = gf.exec(html)) && achadas.size < 12) {
    for (const f of m[1].matchAll(/family=([^&:]+)/g)) achadas.add(decodeURIComponent(f[1]).replace(/\+/g, ' '));
  }
  return [...achadas].slice(0, 6);
}

/* A imagem que o próprio site publica como sua cara. Vira a referência
 * visual da marca — é literalmente "a imagem do site". */
function imagemDe(html, base) {
  const og = meta(html, 'og:image') || meta(html, 'twitter:image');
  if (!og) return '';
  try { return new URL(og, base).href; } catch (e) { return ''; }
}

/*
 * O resumo que vai para o prompt.
 *
 * Marcado como MATERIAL DE REFERÊNCIA de propósito: o texto de um site é
 * escrito por qualquer um, e um site pode conter a frase "ignore as instruções
 * anteriores". Isto aqui é dado sobre a marca, nunca ordem para a IA.
 */
function resumir(d) {
  const linhas = [];
  if (d.titulo) linhas.push('Site: ' + d.titulo);
  if (d.descricao) linhas.push('Descrição do site: ' + d.descricao);
  if (d.cores.length) linhas.push('Cores usadas no site: ' + d.cores.join(', '));
  if (d.fontes.length) linhas.push('Fontes do site: ' + d.fontes.join(', '));
  return linhas.join('\n').slice(0, 900);
}

async function analisar(alvo) {
  const bruto = String(alvo || '').trim();
  if (!bruto) return { erro: 'informe o endereço do site' };
  /*
   * Quem digita "padaria.com.br" quer https://padaria.com.br, e exigir o
   * "https://" seria reprovar a pessoa por não falar a língua da máquina.
   *
   * O teste é por ESQUEMA QUALQUER, não por http(s): testando só http(s), um
   * "file:///etc/passwd" virava "https://file:///etc/passwd" e era recusado
   * mais adiante por acidente, com a mensagem errada. A recusa por esquema é
   * dita onde ela é: em `conferir`.
   */
  const temEsquema = /^[a-z][a-z0-9+.-]*:/i.test(bruto);
  const comEsquema = temEsquema ? bruto : 'https://' + bruto;

  const r = await buscar(comEsquema);
  if (r.erro) return { erro: r.erro };

  const titulo = semTag((r.html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1]).slice(0, 120);
  const descricao = (meta(r.html, 'description') || meta(r.html, 'og:description')).slice(0, 300);
  const dados = {
    url: r.url,
    titulo,
    descricao,
    cores: coresDe(r.html),
    fontes: fontesDe(r.html),
    imagem: imagemDe(r.html, r.url),
  };
  dados.resumo = resumir(dados);
  return dados;
}

module.exports = { analisar, buscar, pedir, conferir, ipPrivado, coresDe, fontesDe, resumir, meta, LIMITE_BYTES, LIMITE_MS, MAX_SALTOS };
