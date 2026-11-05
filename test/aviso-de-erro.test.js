/*
 * O painel avisa quando uma tela quebra (05/11). A Programação quebrou em
 * produção para toda conta com campanha no ar, e a equipe só soube por um
 * vídeo do dono. O erro agora vai para server/erros.js, agrupado, e aparece
 * em /api/plataforma/erros.
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const http = require('node:http');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { pathToFileURL } = require('node:url');

const RAIZ = path.join(__dirname, '..');
const ler = (f) => fs.readFileSync(path.join(RAIZ, f), 'utf8');

test('o painel: a tela que quebra e o erro solto avisam; rede, servidor e pacote velho não', async () => {
  const A = await import(pathToFileURL(path.join(RAIZ, 'web/src/lib/avisarErro.js')).href);
  assert.equal(A.ehPacoteVelho(new Error('Failed to fetch dynamically imported module: /app/assets/x.js')), true);
  assert.equal(A.ehPacoteVelho(new Error('Megaphone is not defined')), false);
  const enviados = [];
  global.location = { pathname: '/app/', search: '?ir=programacao&token=segredo' };
  global.fetch = async (url, o) => { enviados.push({ url, corpo: JSON.parse(o.body) }); return { ok: true }; };
  A.avisarErro(new ReferenceError('Megaphone is not defined'), 'tela');
  A.avisarErro(new ReferenceError('Megaphone is not defined'), 'tela'); // repetido: uma vez só
  A.avisarErro(Object.assign(new Error('recusado'), { status: 403 }), 'promessa');
  A.avisarErro(new TypeError('Failed to fetch'), 'promessa');
  A.avisarErro(new Error('Failed to fetch dynamically imported module'), 'tela');
  assert.equal(enviados.length, 1);
  assert.equal(enviados[0].url, '/api/erros/painel');
  assert.equal(enviados[0].corpo.pagina, '/app/?ir=programacao', 'sem os outros parâmetros (podem ter token)');
  assert.match(enviados[0].corpo.mensagem, /Megaphone/);
  delete global.fetch; delete global.location;
  // Ligado no LimiteDeErro e na janela; a frase do erro de verdade não fala em "versão nova".
  const limite = ler('web/src/components/layout/LimiteDeErro.jsx');
  assert.match(limite, /avisarErro\(erro, 'tela'\)/);
  assert.match(limite, /Deu um erro do nosso lado, e a equipe já foi avisada/);
  assert.match(ler('web/src/main.jsx'), /vigiarErros\(\);/);
});

test('o servidor agrupa o erro do painel e mostra na Plataforma', async (t) => {
  const porta = 7400 + Math.floor(Math.random() * 90);
  const dados = fs.mkdtempSync(path.join(os.tmpdir(), 'mt-aviso-'));
  const env = { ...process.env, PORT: String(porta), STORAGE: 'local', SKIP_VERIFY: '1', DATABASE_URL: '', DATA_DIR: dados, MEDIA_DIR: dados, AI_PROVIDER: 'dev', ASAAS_API_KEY: '', ADMIN_EMAILS: 'op@teste.local' };
  for (const k of ['RAILWAY_ENVIRONMENT', 'NODE_ENV', 'ALERTA_WEBHOOK_URL']) delete env[k];
  const servidor = spawn(process.execPath, ['server.js'], { cwd: RAIZ, stdio: 'ignore', env });
  t.after(() => { servidor.kill(); try { fs.rmSync(dados, { recursive: true, force: true }); } catch (e) { /* o Windows segura o arquivo */ } });
  const pedir = (caminho, o = {}) => new Promise((resolve, reject) => {
    const corpo = o.body ? JSON.stringify(o.body) : '';
    const headers = { ...(o.body ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(corpo) } : {}), ...(o.cookie ? { Cookie: o.cookie } : {}) };
    const req = http.request({ host: '127.0.0.1', port: porta, path: caminho, method: o.method || 'GET', headers }, (res) => {
      let txt = ''; res.on('data', (c) => { txt += c; });
      res.on('end', () => { let json = null; try { json = JSON.parse(txt); } catch (e) { json = null; } resolve({ status: res.statusCode, json, cookies: [].concat(res.headers['set-cookie'] || []) }); });
    });
    req.on('error', reject); if (corpo) req.write(corpo); req.end();
  });
  let ok = false;
  for (let i = 0; i < 160 && !ok; i++) { try { await pedir('/tv'); ok = true; } catch (e) { await new Promise((r) => setTimeout(r, 250)); } }
  assert.ok(ok, 'o servidor de teste não subiu');
  const pilha = 'ReferenceError: Megaphone is not defined\n    at Ot (https://app.multitelas.net.br/app/assets/ProgramacaoPage-Ab12.js:1:4567)';
  for (let i = 0; i < 3; i++) {
    const r = await pedir('/api/erros/painel', { method: 'POST', body: { mensagem: 'Megaphone is not defined', pilha, tipo: 'tela', pagina: '/app/?ir=programacao' } });
    assert.equal(r.status, 202);
  }
  assert.equal((await pedir('/api/erros/painel', { method: 'POST', body: {} })).status, 400);
  const r = await pedir('/api/auth/signup', { method: 'POST', body: { email: 'op@teste.local', password: 'senha-de-teste-123', name: 'Op', aceite: true } });
  const cookie = r.cookies.map((c) => c.split(';')[0]).filter((c) => !c.endsWith('=')).join('; ');
  const lista = await pedir('/api/plataforma/erros', { cookie });
  assert.equal(lista.status, 200, JSON.stringify(lista.json));
  const g = lista.json.itens.find((x) => x.tipo === 'ErroDoPainel');
  assert.ok(g, 'o erro do painel não apareceu na Plataforma');
  assert.equal(g.vezes, 3, 'agrupado: três avisos, um grupo');
  assert.match(g.origem, /ProgramacaoPage-Ab12\.js:1/);
  assert.equal(g.exemplos[0].pagina, '/app/?ir=programacao');
});
