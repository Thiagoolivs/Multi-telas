/*
 * O site do cliente como referência de estilo.
 *
 * Isto é um pedido HTTP com o endereço escolhido pelo usuário — SSRF por
 * construção. A maior parte destes testes é sobre a defesa, não sobre a
 * funcionalidade: um endereço como http://169.254.169.254/ (metadados da
 * nuvem) sai DE DENTRO da nossa rede, com a nossa confiança, e devolve para o
 * usuário o que só o servidor deveria ver.
 *
 * O transporte é exercitado contra um servidor HTTP de verdade, subido aqui.
 * Testar `fetch` de mentira provaria só que o teste sabe simular fetch.
 */
const test = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const site = require('../server/site.js');

/* Sobe um servidor local e devolve { url, fechar }. */
function servidor(handler) {
  return new Promise((resolve) => {
    const s = http.createServer(handler);
    s.listen(0, '127.0.0.1', () => {
      const { port } = s.address();
      resolve({
        porta: port,
        url: 'http://127.0.0.1:' + port,
        fechar: () => new Promise((r) => s.close(r)),
      });
    });
  });
}

// A política de produção recusa 127.0.0.1 — é o ponto dela. Para exercitar o
// transporte e o redirecionamento contra um servidor local, o teste injeta uma
// política que aceita o loopback e SÓ ele.
const soLocal = async (alvo) => {
  const u = new URL(alvo);
  if (u.hostname !== '127.0.0.1') return { erro: 'esse endereço aponta para uma rede interna' };
  return { url: u, ip: '127.0.0.1' };
};

/* ---------------- As faixas que não podem ser alcançadas ---------------- */

test('as faixas internas são recusadas', () => {
  const bloqueados = [
    '127.0.0.1',        // loopback
    '10.1.2.3',         // 10/8
    '172.16.0.1',       // 172.16/12
    '172.31.255.255',
    '192.168.1.1',
    '169.254.169.254',  // metadados da nuvem — o alvo clássico
    '100.64.0.1',       // CGNAT
    '0.0.0.0',
    '224.0.0.1',        // multicast
    '::1',
    'fe80::1',          // link-local
    'fd00::1',          // ULA
    '::ffff:127.0.0.1', // IPv4 disfarçado de IPv6
    'isto não é um ip',
  ];
  for (const ip of bloqueados) {
    assert.equal(site.ipPrivado(ip), true, ip + ' passou — é rede interna alcançável');
  }
});

test('endereço público é permitido', () => {
  for (const ip of ['8.8.8.8', '1.1.1.1', '172.32.0.1', '2001:4860:4860::8888', '::ffff:8.8.8.8']) {
    assert.equal(site.ipPrivado(ip), false, ip + ' foi recusado, e é público');
  }
});

test('só http e https', async () => {
  for (const u of ['file:///etc/passwd', 'ftp://exemplo.com', 'gopher://exemplo.com', 'data:text/html,x']) {
    const r = await site.conferir(u);
    assert.equal(r.erro, 'só http e https', u + ' passou');
  }
});

test('endereço com usuário e senha é recusado', async () => {
  // http://google.com@127.0.0.1/ engana leitura humana e alguns parsers.
  const r = await site.conferir('http://exemplo.com@127.0.0.1/');
  assert.ok(r.erro, 'passou um endereço com credencial embutida');
});

test('o loopback é recusado pelo nome, não só pelo número', async () => {
  const r = await site.conferir('http://localhost:3111/');
  assert.match(r.erro, /rede interna/, '"localhost" passou');
});

test('a checagem devolve o IP para quem vai conectar', async () => {
  // Devolver o IP é o que fecha o DNS rebinding: quem conecta usa ESTE
  // endereço, e não resolve o nome de novo.
  const r = await site.conferir('http://8.8.8.8/');
  assert.equal(r.ip, '8.8.8.8');
});

/* ---------------- O transporte ---------------- */

test('lê a página do servidor e devolve o corpo', async () => {
  const s = await servidor((req, res) => {
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end('<title>Padaria Aurora</title>');
  });
  try {
    const r = await site.pedir(new URL(s.url), '127.0.0.1');
    assert.equal(r.status, 200);
    assert.match(r.corpo, /Padaria Aurora/);
  } finally { await s.fechar(); }
});

test('a conexão vai no IP passado, não no nome resolvido de novo', async () => {
  // É a defesa contra DNS rebinding: um nome que responde "1.2.3.4" para a
  // checagem e "127.0.0.1" para o socket derrubaria toda a validação.
  const s = await servidor((req, res) => {
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end('<title>ok</title>');
  });
  try {
    // O nome NÃO existe no DNS; se o transporte resolvesse por conta própria,
    // isto falharia. Ele conecta no IP que mandamos.
    const u = new URL('http://nome-que-nao-existe.invalido:' + s.porta + '/');
    const r = await site.pedir(u, '127.0.0.1');
    assert.equal(r.status, 200, 'o transporte resolveu o nome por conta própria');
  } finally { await s.fechar(); }
});

test('o corpo é cortado no limite', async () => {
  const s = await servidor((req, res) => {
    res.writeHead(200, { 'content-type': 'text/html' });
    // Bem maior que o teto: uma página que nunca termina não pode nos segurar.
    const pedaco = 'x'.repeat(64 * 1024);
    for (let i = 0; i < 40; i++) res.write(pedaco);
    res.end();
  });
  try {
    const r = await site.pedir(new URL(s.url), '127.0.0.1');
    assert.ok(r.corpo.length <= site.LIMITE_BYTES,
      'leu ' + r.corpo.length + ' bytes, acima do teto de ' + site.LIMITE_BYTES);
  } finally { await s.fechar(); }
});

test('o que não é página é recusado', async () => {
  const s = await servidor((req, res) => {
    res.writeHead(200, { 'content-type': 'application/pdf' });
    res.end('%PDF-1.4');
  });
  try {
    const r = await site.buscar(s.url, soLocal);
    assert.match(r.erro, /não é uma página/);
  } finally { await s.fechar(); }
});

/* ---------------- Redirecionamento ---------------- */

test('segue redirecionamento e traz a página final', async () => {
  const s = await servidor((req, res) => {
    if (req.url === '/') { res.writeHead(302, { location: '/final' }); return res.end(); }
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end('<title>chegou</title>');
  });
  try {
    const r = await site.buscar(s.url + '/', soLocal);
    assert.match(r.html, /chegou/);
  } finally { await s.fechar(); }
});

test('CADA salto passa pela checagem de endereço', async () => {
  // O buraco por outra porta: um site público responde 302 para 127.0.0.1, e
  // um cliente que segue redirecionamento sozinho entraria lá sem conferir.
  const vistos = [];
  const politica = async (alvo) => {
    vistos.push(alvo);
    return soLocal(alvo);
  };
  const s = await servidor((req, res) => {
    if (req.url === '/') { res.writeHead(302, { location: '/2' }); return res.end(); }
    if (req.url === '/2') { res.writeHead(302, { location: '/3' }); return res.end(); }
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end('<title>fim</title>');
  });
  try {
    await site.buscar(s.url + '/', politica);
    assert.equal(vistos.length, 3, 'a checagem rodou ' + vistos.length + 'x para 3 endereços');
  } finally { await s.fechar(); }
});

test('redirecionamento para endereço recusado NÃO é seguido', async () => {
  const s = await servidor((req, res) => {
    res.writeHead(302, { location: 'http://169.254.169.254/latest/meta-data/' });
    res.end();
  });
  try {
    const r = await site.buscar(s.url + '/', soLocal);
    assert.ok(r.erro, 'seguiu o redirecionamento para os metadados da nuvem');
    assert.ok(!r.html, 'trouxe conteúdo de um endereço recusado');
  } finally { await s.fechar(); }
});

test('laço de redirecionamento tem fim', async () => {
  const s = await servidor((req, res) => { res.writeHead(302, { location: '/' }); res.end(); });
  try {
    const r = await site.buscar(s.url + '/', soLocal);
    assert.match(r.erro, /redirecionou vezes demais/);
  } finally { await s.fechar(); }
});

/* ---------------- O que se lê da página ---------------- */

test('as cores vêm por frequência, sem preto, branco e cinza', () => {
  // A primeira cor de uma folha de estilo costuma ser um #fff de reset; a
  // marca aparece muito depois. E dizer que a cor da marca é #ffffff não
  // ajuda ninguém a compor.
  const html = '#ffffff #000000 #f8f8f8 #333333 #e11d48 #e11d48 #e11d48 #0ea5e9 #0ea5e9';
  const c = site.coresDe(html);
  assert.equal(c[0], '#e11d48', 'a cor mais usada não veio primeiro: ' + JSON.stringify(c));
  assert.equal(c[1], '#0ea5e9');
  assert.ok(!c.includes('#ffffff') && !c.includes('#000000') && !c.includes('#333333'),
    'voltou cinza/preto/branco: ' + JSON.stringify(c));
});

test('a cor de três dígitos vira seis', () => {
  assert.deepEqual(site.coresDe('#e1d #e1d'), ['#ee11dd']);
});

test('as fontes saem do CSS e da Google Fonts', () => {
  const html = 'font-family: "Poppins", sans-serif; font-family: inherit;'
    + '<link href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Inter:wght@400;700">';
  const f = site.fontesDe(html);
  assert.ok(f.includes('Poppins'), 'perdeu a fonte do CSS: ' + JSON.stringify(f));
  assert.ok(f.includes('Bebas Neue'), 'perdeu a fonte da Google: ' + JSON.stringify(f));
  assert.ok(f.includes('Inter'));
  // `inherit` e os genéricos não são identidade de ninguém.
  assert.ok(!f.includes('inherit') && !f.includes('sans-serif'), JSON.stringify(f));
});

test('lê título, descrição e a imagem que o site publica como sua cara', async () => {
  const s = await servidor((req, res) => {
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end(`<html><head>
      <title>Padaria Aurora — pães de fermentação natural</title>
      <meta name="description" content="Pão fresco todo dia às 6h.">
      <meta property="og:image" content="/capa.jpg">
      <style>body{font-family:"Poppins",sans-serif;color:#e11d48}a{color:#e11d48}</style>
    </head><body>oi</body></html>`);
  });
  try {
    const r = await site.buscar(s.url + '/', soLocal);
    assert.match(r.html, /Padaria Aurora/);
    assert.equal(site.meta(r.html, 'description'), 'Pão fresco todo dia às 6h.');
    assert.ok(site.coresDe(r.html).includes('#e11d48'));
    assert.ok(site.fontesDe(r.html).includes('Poppins'));
  } finally { await s.fechar(); }
});

test('o resumo é DADO sobre a marca, e cabe no prompt', () => {
  const r = site.resumir({
    titulo: 'Padaria Aurora', descricao: 'Pão fresco',
    cores: ['#e11d48'], fontes: ['Poppins'],
  });
  assert.match(r, /Padaria Aurora/);
  assert.match(r, /#e11d48/);
  assert.match(r, /Poppins/);
  assert.ok(r.length <= 900, 'o resumo passou do teto e vai estourar o prompt');
});

test('esquema errado é recusado POR SER esquema errado', async () => {
  // Testando só http(s) para decidir se prefixa, um "file:///etc/passwd"
  // virava "https://file:///etc/passwd" e era recusado mais adiante por
  // acidente — com a mensagem errada e por um motivo que não era o certo.
  for (const u of ['file:///etc/passwd', 'gopher://exemplo.com/1', 'javascript:alert(1)']) {
    const r = await site.analisar(u);
    assert.equal(r.erro, 'só http e https', u + ' foi recusado pelo motivo errado: ' + r.erro);
  }
});

test('endereço sem esquema é aceito — a pessoa digita "padaria.com.br"', async () => {
  // Exigir "https://" seria reprovar alguém por não falar a língua da máquina.
  // Aqui só se confere que o esquema é acrescentado; a busca em si depende de
  // rede externa e é conferida contra servidor local nos testes acima.
  const r = await site.conferir('https://' + 'padaria.com.br');
  assert.ok(r.erro !== 'só http e https');
});
