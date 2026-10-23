/*
 * O link de troca de senha não vai para o site de quem pediu.
 *
 * Sem APP_URL, o link do e-mail era montado com o X-Forwarded-Host do
 * pedido, que quem pede escreve. "Esqueci a senha" com o e-mail da vítima e
 * esse cabeçalho apontando para outro site fazia o servidor mandar à vítima
 * um e-mail verdadeiro, nosso, com o token de troca indo para o atacante
 * (EXECUTOR D0.2).
 *
 * O servidor sobe de verdade, sem provedor de e-mail: o e-mail vai para o
 * log (server/mail.js, modo dev), e o teste lê o link de lá.
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

function cliente(porta) {
  return function pedir(caminho, o = {}) {
    return new Promise((resolve, reject) => {
      const req = http.request({ host: '127.0.0.1', port: porta, path: caminho, method: o.method || 'GET',
        headers: { ...(o.body ? { 'Content-Type': 'application/json' } : {}), ...(o.headers || {}) } }, (res) => {
        let corpo = '';
        res.on('data', (c) => { corpo += c; });
        res.on('end', () => resolve({ status: res.statusCode }));
      });
      req.on('error', reject);
      req.setTimeout(15000, () => req.destroy(new Error('a rota ' + caminho + ' não respondeu')));
      if (o.body) req.write(JSON.stringify(o.body));
      req.end();
    });
  };
}

async function subir(t, envExtra) {
  const porta = 4600 + Math.floor(Math.random() * 300);
  const dados = fs.mkdtempSync(path.join(os.tmpdir(), 'mt-link-'));
  const env = { ...process.env, PORT: String(porta), STORAGE: 'local', SKIP_VERIFY: '1', DATABASE_URL: '', DATA_DIR: dados,
    AI_PROVIDER: 'dev', RESEND_API_KEY: '', BREVO_API_KEY: '', APP_URL: '', ...envExtra };
  for (const k of ['RAILWAY_ENVIRONMENT', 'RAILWAY_ENVIRONMENT_NAME', 'RAILWAY_PROJECT_ID', 'RAILWAY_PUBLIC_DOMAIN', 'MT_HOSTS']) if (!(k in envExtra)) delete env[k];
  const servidor = spawn(process.execPath, ['server.js'], { cwd: RAIZ, stdio: ['ignore', 'pipe', 'pipe'], env });
  let saida = '';
  servidor.stdout.on('data', (c) => { saida += c; });
  servidor.stderr.on('data', (c) => { saida += c; });
  t.after(() => { servidor.kill(); try { fs.rmSync(dados, { recursive: true, force: true }); } catch (e) { /* o Windows segura o arquivo */ } });
  const pedir = cliente(porta);
  let ok = false;
  for (let i = 0; i < 160 && !ok; i++) { try { await pedir('/tv'); ok = true; } catch (e) { await new Promise((r) => setTimeout(r, 250)); } }
  assert.ok(ok, 'o servidor de teste não subiu');
  return { pedir, saida: () => saida };
}

async function linkDeTroca(srv, email, headers) {
  await srv.pedir('/api/auth/forgot', { method: 'POST', body: { email }, headers });
  for (let i = 0; i < 40; i++) {
    const m = srv.saida().match(/(\S+)\/app\/\?reset=[0-9a-f]+/g);
    if (m) return m[m.length - 1];
    await new Promise((r) => setTimeout(r, 100));
  }
  return '';
}

test('no Railway sem APP_URL: o host forjado não entra no link de troca de senha', async (t) => {
  const srv = await subir(t, { RAILWAY_ENVIRONMENT_NAME: 'production', RAILWAY_PUBLIC_DOMAIN: 'app.multitelas.net.br' });
  const email = 'vitima' + Date.now() + '@teste.local';
  await srv.pedir('/api/auth/signup', { method: 'POST', body: { email, password: 'senha-de-teste-123', name: 'Loja', aceite: true } });

  const link = await linkDeTroca(srv, email, { 'X-Forwarded-Host': 'site-do-atacante.example' });
  assert.ok(link, 'o e-mail de troca não saiu no log');
  assert.ok(!link.includes('site-do-atacante'), 'o link foi para o host forjado: ' + link);
  assert.ok(link.startsWith('https://app.multitelas.net.br/'), 'cai no domínio público do Railway: ' + link);
  assert.match(srv.saida(), /links\.sem-app-url/, 'o boot avisa que falta APP_URL');
});

test('um host da lista continua valendo, e APP_URL manda em tudo', async (t) => {
  const srv = await subir(t, {});
  const email = 'dono' + Date.now() + '@teste.local';
  await srv.pedir('/api/auth/signup', { method: 'POST', body: { email, password: 'senha-de-teste-123', name: 'Loja', aceite: true } });
  const link = await linkDeTroca(srv, email, { 'X-Forwarded-Host': 'tv.multitelas.net.br' });
  assert.ok(link.includes('://tv.multitelas.net.br/'), 'subdomínio nosso é aceito: ' + link);

  const comApp = await subir(t, { APP_URL: 'https://app.multitelas.net.br/' });
  const email2 = 'dono2' + Date.now() + '@teste.local';
  await comApp.pedir('/api/auth/signup', { method: 'POST', body: { email: email2, password: 'senha-de-teste-123', name: 'Loja', aceite: true } });
  const link2 = await linkDeTroca(comApp, email2, { 'X-Forwarded-Host': 'site-do-atacante.example' });
  assert.ok(link2.startsWith('https://app.multitelas.net.br/app/?reset='), link2);
});
