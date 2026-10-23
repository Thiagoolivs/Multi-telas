/*
 * Logo analisada e corrigida (EXECUTOR D7).
 *
 * - Aceita SVG e PNG.
 * - A análise (fundo, tamanho, cores, leitura no claro e no escuro) e as
 *   correções (tirar fundo sólido, vetorizar a simples, versões branca e
 *   escura) rodam no navegador, sem gastar criação.
 * - Nunca troca calado: só "Usar a nova" grava; a original fica em Mídias.
 * - Logo nova leva junto as versões da antiga (seriam de outra logo).
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const http = require('node:http');
const path = require('node:path');
const { spawn } = require('node:child_process');

const RAIZ = path.join(__dirname, '..');
const ler = (f) => fs.readFileSync(path.join(RAIZ, f), 'utf8');
const semComentarios = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

test('a análise e a proposta não gravam nada; só "Usar a nova" grava', () => {
  const lib = semComentarios(ler('web/src/lib/logo.js'));
  assert.ok(!/api\.js|brand\.|media\.|fetch\(/.test(lib), 'a lib da logo fala com o servidor');
  for (const f of ['export async function analisar', 'export async function propor', 'function tirarFundo', 'function monocromatica', 'async function vetorizar']) {
    assert.ok(lib.includes(f), 'sumiu ' + f);
  }
  // O traçador vem sob demanda, e com a paleta da própria logo (não a média lavada).
  assert.match(lib, /await import\('imagetracerjs'\)/);
  assert.match(lib, /pal, numberofcolors: pal\.length, colorquantcycles: 1,/);
  // A leitura é medida depois de tirar o fundo.
  assert.ok(lib.indexOf('cv = tirarFundo(cv, a.fundo)') < lib.indexOf('const claro = leitura(d, null, CLARO)'));

  const c = semComentarios(ler('web/src/components/content/LogoDaMarca.jsx'));
  const gravacoes = c.match(/brand\.addAsset\(/g) || [];
  assert.equal(gravacoes.length, 1, 'gravou a logo fora do "Usar a nova"');
  const usar = c.slice(c.indexOf('async function usarANova'), c.indexOf('const a = analise;'));
  assert.ok(usar.includes('brand.addAsset('), 'a gravação saiu do "Usar a nova"');
  assert.match(c, />Usar a nova<\/Button>/);
  assert.match(c, />Manter a original<\/Button>/);
  assert.match(c, /accept="image\/png,image\/svg\+xml,image\/webp,image\/jpeg"/, 'a logo não aceita SVG');
});

test('a dependência do traçador é exata e de licença livre', () => {
  const pkg = JSON.parse(ler('web/package.json'));
  assert.equal(pkg.dependencies.imagetracerjs, '1.2.6');
});

/* ---------------- servidor de verdade ---------------- */

const PORTA = 5700 + Math.floor(Math.random() * 90);
function pedir(caminho, o = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port: PORTA, path: caminho, method: o.method || 'GET',
      headers: { ...(o.json ? { 'Content-Type': 'application/json' } : {}), ...(o.cookie ? { Cookie: o.cookie } : {}) } }, (res) => {
      let corpo = '';
      res.on('data', (c) => { corpo += c; });
      res.on('end', () => { let json = null; try { json = JSON.parse(corpo); } catch (e) { json = null; } resolve({ status: res.statusCode, json, cookies: [].concat(res.headers['set-cookie'] || []) }); });
    });
    req.on('error', reject);
    req.setTimeout(15000, () => req.destroy(new Error('a rota ' + caminho + ' não respondeu')));
    if (o.json) req.write(JSON.stringify(o.json));
    req.end();
  });
}
const cookieDe = (r) => r.cookies.map((c) => c.split(';')[0]).filter((c) => !c.endsWith('=')).join('; ');

test('versões da logo: uma de cada; logo nova leva as versões da antiga', async (t) => {
  const dados = fs.mkdtempSync(path.join(os.tmpdir(), 'mt-d7-'));
  const servidor = spawn(process.execPath, ['server.js'], {
    cwd: RAIZ, stdio: 'ignore',
    env: { ...process.env, PORT: String(PORTA), STORAGE: 'local', SKIP_VERIFY: '1', DATABASE_URL: '', DATA_DIR: dados, MEDIA_DIR: dados, AI_PROVIDER: 'dev' },
  });
  t.after(() => { servidor.kill(); try { fs.rmSync(dados, { recursive: true, force: true }); } catch (e) { /* o Windows segura o arquivo */ } });
  let ok = false;
  for (let i = 0; i < 60 && !ok; i++) { try { await pedir('/tv'); ok = true; } catch (e) { await new Promise((r) => setTimeout(r, 250)); } }
  assert.ok(ok, 'o servidor de teste não subiu');
  const c = cookieDe(await pedir('/api/auth/signup', { method: 'POST', json: { email: 'd7' + Date.now() + '@teste.local', password: 'senha-de-teste-123', name: 'Loja', aceite: true } }));
  const add = (kind, url) => pedir('/api/brand/assets', { method: 'POST', cookie: c, json: { kind, url } });
  const logos = async () => (await pedir('/api/brand', { cookie: c })).json.assets.filter((a) => /^logo/.test(a.kind)).map((a) => a.kind + ' ' + a.url).sort();

  assert.equal((await add('logo', '/media/x/a.png')).status, 201);
  assert.equal((await add('logo-clara', '/media/x/a-clara.png')).status, 201);
  assert.equal((await add('logo-clara', '/media/x/a-clara2.png')).status, 201);
  assert.deepEqual(await logos(), ['logo /media/x/a.png', 'logo-clara /media/x/a-clara2.png'], 'ficou mais de uma versão clara');

  assert.equal((await add('logo', '/media/x/b.svg')).status, 201);
  assert.deepEqual(await logos(), ['logo /media/x/b.svg'], 'a versão da logo antiga ficou com a nova');
});
