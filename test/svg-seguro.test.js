/*
 * SVG perigoso é recusado no upload (revisão do consultor no D7).
 *
 * O CSP com sandbox já impede o script de rodar quando o arquivo é servido
 * por nós; esta é a segunda camada, para o SVG que o cliente baixa e reusa
 * fora daqui. Logo de verdade (e o vetor do D7, só <path>) passa.
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const http = require('node:http');
const path = require('node:path');
const { spawn } = require('node:child_process');

process.env.DATA_DIR = process.env.DATA_DIR || fs.mkdtempSync(path.join(os.tmpdir(), 'mt-svg-'));
const S = require('../server/storage.js');
const RAIZ = path.join(__dirname, '..');

const LOGO = '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 10 10">'
  + '<defs><linearGradient id="g"><stop offset="0" stop-color="#123"/></linearGradient></defs>'
  + '<path d="M0 0h10v10z" fill="url(#g)"/><use href="#g"/><image href="data:image/png;base64,AAAA"/></svg>';

test('o que é logo passa; o que só serve para atacar, não', () => {
  assert.equal(S.problemaNoSvg(LOGO), null);
  const ruins = {
    script: '<svg><script>alert(1)</script></svg>',
    evento: '<svg><rect onclick="x()"/></svg>',
    foreign: '<svg><foreignObject><p>oi</p></foreignObject></svg>',
    linkFora: '<svg><a href="https://exemplo.com">x</a></svg>',
    xlinkFora: '<svg><image xlink:href="http://exemplo.com/a.png"/></svg>',
    javascript: '<svg><a href="javascript:alert(1)">x</a></svg>',
    entidade: '<!DOCTYPE svg [<!ENTITY a "b">]><svg>&a;</svg>',
    cssFora: '<svg><style>@import url(https://exemplo.com/a.css);</style></svg>',
    cssUrlFora: '<svg><rect style="fill:url(https://exemplo.com/x)"/></svg>',
  };
  for (const [nome, svg] of Object.entries(ruins)) assert.ok(S.problemaNoSvg(svg), nome + ' passou');
});

const PORTA = 5900 + Math.floor(Math.random() * 90);
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
    if (o.raw) req.write(o.raw);
    req.end();
  });
}
const cookieDe = (r) => r.cookies.map((c) => c.split(';')[0]).filter((c) => !c.endsWith('=')).join('; ');

test('o upload recusa o SVG com script (400, com o motivo) e aceita a logo', async (t) => {
  const dados = fs.mkdtempSync(path.join(os.tmpdir(), 'mt-svg-srv-'));
  const servidor = spawn(process.execPath, ['server.js'], {
    cwd: RAIZ, stdio: 'ignore',
    env: { ...process.env, PORT: String(PORTA), STORAGE: 'local', SKIP_VERIFY: '1', DATABASE_URL: '', DATA_DIR: dados, MEDIA_DIR: dados, AI_PROVIDER: 'dev' },
  });
  t.after(() => { servidor.kill(); try { fs.rmSync(dados, { recursive: true, force: true }); } catch (e) { /* o Windows segura o arquivo */ } });
  let ok = false;
  for (let i = 0; i < 60 && !ok; i++) { try { await pedir('/tv'); ok = true; } catch (e) { await new Promise((r) => setTimeout(r, 250)); } }
  assert.ok(ok, 'o servidor de teste não subiu');
  const c = cookieDe(await pedir('/api/auth/signup', { method: 'POST', json: { email: 'svg' + Date.now() + '@teste.local', password: 'senha-de-teste-123', name: 'Loja', aceite: true } }));
  const subir = (svg) => pedir('/api/media?name=logo.svg&mime=image/svg%2Bxml', { method: 'POST', cookie: c, raw: Buffer.from(svg), headers: { 'Content-Type': 'image/svg+xml' } });

  const ruim = await subir('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
  assert.equal(ruim.status, 400);
  assert.match(String(ruim.json && ruim.json.error), /tem script/);
  const bom = await subir(LOGO);
  assert.ok(bom.status < 300, 'a logo limpa não subiu: ' + bom.status);
  // O que foi recusado não sobra na lista de mídias.
  const lista = (await pedir('/api/media', { cookie: c })).json;
  assert.equal((lista.items || []).length, 1);
});
