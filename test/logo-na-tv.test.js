/*
 * A logo aparece na TV (EXECUTOR D8).
 *
 * `settings.logoUrl` nunca era preenchido: o cabeçalho mostrava o nome em
 * texto, e a peça com lugar de logo ficava sem ela. Agora o servidor manda a
 * logo da marca junto da config que a TV lê (só para a TV: o painel gravaria
 * a logo velha de volta), e o desenhista escolhe a versão pelo fundo.
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

test('player: cabeçalho com a logo na versão do fundo, sem repetir o nome', () => {
  const p = ler('js/player.js');
  assert.match(p, /global\.MT_LOGO = \(s\.logo && s\.logo\.url\) \? s\.logo : \(s\.logoUrl \? \{ url: s\.logoUrl \} : null\);/);
  assert.match(p, /setTimeout\(\(\) => \{ img\.src = logoNoFundo\(logo, zoneEl\); \}, 0\);/);
  assert.match(p, /return \(l < 0\.35 \? logo\.clara : logo\.escura\) \|\| logo\.url;/);
  assert.match(p, /title\.textContent = cfg\.settings\.titulo \|\| \(\(logo && logo\.url\) \? '' : cfg\.settings\.nome\) \|\| '';/);
  assert.match(ler('js/render.js'), /logo: global\.MT_LOGO \|\| null,/);
  // A versão só sobe: cada mudança do player depois desta (D19 v49, D21 v50) troca de novo.
  assert.ok(Number((/const SHELL_CACHE = 'mt-shell-v(\d+)';/.exec(ler('sw.js')) || [])[1]) >= 45, 'o player mudou: a TV precisa baixar de novo');
});

test('peça: o lugar de logo usa a da marca, na versão que lê no fundo da peça', () => {
  const r = ler('js/peca-render.js');
  assert.match(r, /const valor = campo === 'logo' && !qr \? logoDaPeca\(it\.campos\.logo, o\.logo, tokens\) : it\.campos\[campo\];/);
  assert.match(r, /if \(propria && \(!daMarca \|\| propria !== daMarca\.url\)\) return propria;/, 'logo de outra marca, gravada na peça, fica');
  // O painel desenha as prévias com a mesma logo.
  assert.match(ler('web/src/components/content/PecaHtml.jsx'), /logo: globalThis\.MT_LOGO \|\| null,/);
  assert.match(ler('web/src/App.jsx'), /globalThis\.MT_LOGO = \(me && me\.tenant && me\.tenant\.logo\) \|\| null;/);
});

/* ---------------- servidor de verdade ---------------- */

const PORTA = 5800 + Math.floor(Math.random() * 90);
function pedir(caminho, o = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port: PORTA, path: caminho, method: o.method || 'GET',
      headers: { ...(o.json ? { 'Content-Type': 'application/json' } : {}), ...(o.cookie ? { Cookie: o.cookie } : {}), ...(o.headers || {}) } }, (res) => {
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

test('a TV recebe a logo com a config; o painel não (e não grava de volta)', async (t) => {
  const dados = fs.mkdtempSync(path.join(os.tmpdir(), 'mt-d8-'));
  const servidor = spawn(process.execPath, ['server.js'], {
    cwd: RAIZ, stdio: 'ignore',
    env: { ...process.env, PORT: String(PORTA), STORAGE: 'local', SKIP_VERIFY: '1', DATABASE_URL: '', DATA_DIR: dados, MEDIA_DIR: dados, AI_PROVIDER: 'dev' },
  });
  t.after(() => { servidor.kill(); try { fs.rmSync(dados, { recursive: true, force: true }); } catch (e) { /* o Windows segura o arquivo */ } });
  let ok = false;
  for (let i = 0; i < 160 && !ok; i++) { try { await pedir('/tv'); ok = true; } catch (e) { await new Promise((r) => setTimeout(r, 250)); } }
  assert.ok(ok, 'o servidor de teste não subiu');

  const c = cookieDe(await pedir('/api/auth/signup', { method: 'POST', json: { email: 'd8' + Date.now() + '@teste.local', password: 'senha-de-teste-123', name: 'Loja', aceite: true } }));
  const tv = (await pedir('/api/devices', { method: 'POST', json: {} })).json;
  const daTv = { 'x-device-token': tv.deviceToken };
  await pedir('/api/devices/' + tv.id + '/config', { headers: daTv });
  assert.ok((await pedir('/api/pair', { method: 'POST', cookie: c, json: { code: tv.code } })).status < 300);

  assert.equal((await pedir('/api/devices/' + tv.id + '/config', { method: 'PUT', cookie: c, json: { settings: { layoutId: 'full', nome: 'Loja' }, zonas: {} } })).status, 200);

  // Sem logo: nada muda.
  let cfg = (await pedir('/api/devices/' + tv.id + '/config', { headers: daTv })).json;
  assert.equal(cfg.settings.logo, undefined);

  await pedir('/api/brand/assets', { method: 'POST', cookie: c, json: { kind: 'logo', url: '/media/x/logo.svg' } });
  await pedir('/api/brand/assets', { method: 'POST', cookie: c, json: { kind: 'logo-clara', url: '/media/x/logo-clara.png' } });
  cfg = (await pedir('/api/devices/' + tv.id + '/config', { headers: daTv })).json;
  assert.deepEqual(cfg.settings.logo, { url: '/media/x/logo.svg', clara: '/media/x/logo-clara.png', escura: '' });

  const doPainel = (await pedir('/api/devices/' + tv.id + '/config', { cookie: c })).json;
  assert.equal(doPainel.settings.logo, undefined, 'o painel recebeu a logo e a gravaria de volta');

  const me = (await pedir('/api/auth/me', { cookie: c })).json;
  assert.equal(me.tenant.logo.url, '/media/x/logo.svg', 'o painel não sabe a logo para as prévias');
});

test('logo: hex curto lê certo, e as três versões vão para o cache da TV (revisão do consultor)', () => {
  const r = ler('js/peca-render.js');
  assert.match(r, /if \(\/\^\[0-9a-f\]\{3,4\}\$\/i\.test\(s\)\) s = s\.slice\(0, 3\)/);
  // O pré-carregamento do player varre a config inteira: settings.logo (url, clara, escura) entra.
  const p = ler('js/player.js');
  assert.ok(p.includes('JSON.stringify(cfg).replace(/\\/media\\/[A-Za-z0-9_.\\/\\-]+/g'), 'o pré-carregamento não varre mais a config inteira');
  const cfg = { settings: { logo: { url: '/media/t/a.svg', clara: '/media/t/a-clara.png', escura: '/media/t/a-escura.png' } } };
  const achadas = [];
  JSON.stringify(cfg).replace(/\/media\/[A-Za-z0-9_./-]+/g, (m) => { achadas.push(m); return m; });
  assert.deepEqual(achadas, ['/media/t/a.svg', '/media/t/a-clara.png', '/media/t/a-escura.png']);
});
