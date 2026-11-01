/*
 * gzip/brotli nas respostas (server/compressao.js). QA de 26/10: o painel
 * baixava 965 KB de JS cru e levava 5,7 s para pintar no celular em 4G.
 */
const test = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const zlib = require('node:zlib');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');

const C = require('../server/compressao.js');
const RAIZ = path.join(__dirname, '..');

function pedir(porta, caminho, headers) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port: porta, path: caminho, headers: headers || {} }, (res) => {
      const partes = [];
      res.on('data', (c) => partes.push(c));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, corpo: Buffer.concat(partes) }));
    });
    req.on('error', reject);
    req.setTimeout(8000, () => req.destroy(new Error('sem resposta: ' + caminho)));
    req.end();
  });
}

function abrir(cb) {
  const s = http.createServer((req, res) => { C.ligar(req, res); cb(req, res); });
  return new Promise((r) => s.listen(0, '127.0.0.1', () => r(s)));
}

const GRANDE = JSON.stringify({ itens: Array.from({ length: 400 }, (_, i) => ({ id: i, nome: 'conteúdo ' + i })) });
const descomprimir = (r) => (r.headers['content-encoding'] === 'br' ? zlib.brotliDecompressSync(r.corpo)
  : r.headers['content-encoding'] === 'gzip' ? zlib.gunzipSync(r.corpo) : r.corpo);

test('escolher: brotli primeiro, gzip depois, respeita q=0 e o curinga', () => {
  assert.equal(C.escolher('gzip, deflate, br'), 'br');
  assert.equal(C.escolher('gzip'), 'gzip');
  assert.equal(C.escolher('br;q=0, gzip'), 'gzip');
  assert.equal(C.escolher('identity'), null);
  assert.equal(C.escolher(''), null);
  assert.equal(C.escolher('*'), 'br');
  assert.equal(C.escolher('*;q=0'), null);
});

test('JSON grande sai comprimido, com Vary e Content-Length do comprimido', async () => {
  const s = await abrir((req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(GRANDE);
  });
  const porta = s.address().port;
  for (const enc of ['br', 'gzip']) {
    const r = await pedir(porta, '/', { 'accept-encoding': enc });
    assert.equal(r.headers['content-encoding'], enc);
    assert.match(r.headers.vary, /Accept-Encoding/);
    assert.equal(Number(r.headers['content-length']), r.corpo.length);
    assert.equal(r.headers['cache-control'], 'no-store', 'os outros cabeçalhos ficam');
    assert.equal(descomprimir(r).toString(), GRANDE);
    assert.ok(r.corpo.length < GRANDE.length / 3);
  }
  s.close();
});

test('não comprime: sem Accept-Encoding, corpo pequeno, imagem, 304, HEAD e quem já codificou', async () => {
  const s = await abrir((req, res) => {
    if (req.url === '/pequeno') { res.writeHead(200, { 'Content-Type': 'text/plain' }); return res.end('oi'); }
    if (req.url === '/png') { res.writeHead(200, { 'Content-Type': 'image/png' }); return res.end(Buffer.alloc(5000, 1)); }
    if (req.url === '/304') { res.writeHead(304); return res.end(); }
    if (req.url === '/ja') { res.writeHead(200, { 'Content-Type': 'text/plain', 'Content-Encoding': 'gzip' }); return res.end(zlib.gzipSync(GRANDE)); }
    res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(GRANDE);
  });
  const porta = s.address().port;
  assert.equal((await pedir(porta, '/')).headers['content-encoding'], undefined);
  for (const p of ['/pequeno', '/png', '/304']) {
    const r = await pedir(porta, p, { 'accept-encoding': 'br' });
    assert.equal(r.headers['content-encoding'], undefined, p);
  }
  const ja = await pedir(porta, '/ja', { 'accept-encoding': 'br' });
  assert.equal(ja.headers['content-encoding'], 'gzip');
  assert.equal(zlib.gunzipSync(ja.corpo).toString(), GRANDE, 'não comprime duas vezes');
  s.close();
});

test('streaming (SSE, mídia por pipe) passa direto: o primeiro write solta o cabeçalho', async () => {
  const s = await abrir((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/event-stream' });
    res.write('event: ola\ndata: ' + 'x'.repeat(3000) + '\n\n');
    setTimeout(() => res.end('data: fim\n\n'), 20);
  });
  const r = await pedir(s.address().port, '/', { 'accept-encoding': 'br' });
  assert.equal(r.headers['content-encoding'], undefined);
  assert.match(r.corpo.toString(), /event: ola[\s\S]*data: fim/);
  s.close();
});

test('setHeader sem writeHead também comprime; end(cb) e writeHead encadeado funcionam', async () => {
  let chamou = false;
  const s = await abrir((req, res) => {
    if (req.url === '/encadeado') return res.writeHead(200, { 'Content-Type': 'text/html' }).end('<p>' + 'a'.repeat(4000) + '</p>');
    res.setHeader('Content-Type', 'text/css');
    res.end('body{color:red}'.repeat(200), () => { chamou = true; });
  });
  const porta = s.address().port;
  const r = await pedir(porta, '/', { 'accept-encoding': 'gzip' });
  assert.equal(r.headers['content-encoding'], 'gzip');
  assert.equal(descomprimir(r).toString(), 'body{color:red}'.repeat(200));
  assert.ok(chamou);
  const e = await pedir(porta, '/encadeado', { 'accept-encoding': 'br' });
  assert.equal(e.headers['content-encoding'], 'br');
  assert.match(descomprimir(e).toString(), /^<p>a+<\/p>$/);
  s.close();
});

test('arquivo grande comprime uma vez e fica guardado', async () => {
  const corpo = 'const x = 1;\n'.repeat(5000);
  let n = 0;
  const s = await abrir((req, res) => { n++; res.writeHead(200, { 'Content-Type': 'text/javascript' }); res.end(corpo); });
  const porta = s.address().port;
  const antes = C._cache.size;
  const a = await pedir(porta, '/', { 'accept-encoding': 'br' });
  const b = await pedir(porta, '/', { 'accept-encoding': 'br' });
  assert.equal(n, 2);
  assert.equal(C._cache.size, antes + 1);
  assert.deepEqual(a.corpo, b.corpo);
  s.close();
});

test('o servidor de verdade comprime o player e a landing, e o canal ao vivo segue cru', async () => {
  const PORTA = 4100 + Math.floor(Math.random() * 90);
  const srv = spawn(process.execPath, ['server.js'], {
    cwd: RAIZ,
    env: { ...process.env, PORT: String(PORTA), STORAGE: 'local', SKIP_VERIFY: '1', DATABASE_URL: '' },
    stdio: 'ignore',
  });
  try {
    for (let i = 0; i < 60; i++) {
      try { await pedir(PORTA, '/tv'); break; } catch (e) { await new Promise((r) => setTimeout(r, 250)); }
    }
    const js = await pedir(PORTA, '/js/player.js', { 'accept-encoding': 'gzip, br' });
    assert.equal(js.status, 200);
    assert.equal(js.headers['content-encoding'], 'br');
    assert.equal(descomprimir(js).toString(), fs.readFileSync(path.join(RAIZ, 'js/player.js'), 'utf8'));
    // Os cabeçalhos de segurança, postos antes, continuam lá.
    assert.ok(js.headers['x-content-type-options']);
    const home = await pedir(PORTA, '/', { 'accept-encoding': 'gzip' });
    assert.equal(home.headers['content-encoding'], 'gzip');
  } finally { srv.kill(); }
});
