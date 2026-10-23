/*
 * O RH vê tudo fácil (EXECUTOR D34): pessoas, pendentes e próximos aniversários.
 *
 * Um resumo com três cartões no topo de Pessoas (e no Início, quando a conta
 * tem equipe): quantas pessoas e quem está sem foto ou sem e-mail (não recebe
 * o código do QR), as fotos que esperam aprovação e os próximos aniversários.
 * E a lista filtra "sem foto" / "sem e-mail" num toque.
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

const PORTA = 7200 + Math.floor(Math.random() * 90);
function pedir(caminho, o = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port: PORTA, path: caminho, method: o.method || 'GET',
      headers: Object.assign({}, o.json ? { 'Content-Type': 'application/json' } : {}, o.cookie ? { Cookie: o.cookie } : {}) }, (res) => {
      let txt = '';
      res.on('data', (c) => { txt += c; });
      res.on('end', () => { let json = null; try { json = JSON.parse(txt); } catch (e) { json = null; } resolve({ status: res.statusCode, json, cookies: [].concat(res.headers['set-cookie'] || []) }); });
    });
    req.on('error', reject);
    req.setTimeout(30000, () => req.destroy(new Error('a rota ' + caminho + ' não respondeu')));
    if (o.json) req.write(JSON.stringify(o.json));
    req.end();
  });
}

test('o resumo: quantas pessoas, sem foto, sem e-mail, fotos para aprovar, pedidos abertos e os próximos 30 dias em ordem', async (t) => {
  const dados = fs.mkdtempSync(path.join(os.tmpdir(), 'mt-d34-'));
  const servidor = spawn(process.execPath, ['server.js'], {
    cwd: RAIZ, stdio: 'ignore',
    env: { ...process.env, PORT: String(PORTA), STORAGE: 'local', SKIP_VERIFY: '1', DATABASE_URL: '', DATA_DIR: dados, MEDIA_DIR: dados, AI_PROVIDER: 'dev' },
  });
  t.after(() => { servidor.kill(); try { fs.rmSync(dados, { recursive: true, force: true }); } catch (e) { /* o Windows segura o arquivo */ } });
  let ok = false;
  for (let i = 0; i < 60 && !ok; i++) { try { await pedir('/tv'); ok = true; } catch (e) { await new Promise((r) => setTimeout(r, 250)); } }
  assert.ok(ok, 'o servidor de teste não subiu');
  assert.equal((await pedir('/api/birthdays/resumo')).status, 401);
  const c = (await pedir('/api/auth/signup', { method: 'POST', json: { email: 'd34' + Date.now() + '@teste.local', password: 'senha-de-teste-123', name: 'RH', aceite: true } }))
    .cookies.map((x) => x.split(';')[0]).filter((x) => !x.endsWith('=')).join('; ');

  const vazio = (await pedir('/api/birthdays/resumo', { cookie: c })).json;
  assert.deepEqual(vazio, { pessoas: 0, semFoto: 0, semEmail: 0, pendentes: 0, pedidosAbertos: 0, proximos: [] });

  const hoje = new Date();
  const em = (n) => { const d = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() + n); return String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0'); };
  await pedir('/api/birthdays/import', { method: 'POST', cookie: c, json: { rows: [
    { nome: 'Daqui a 10', nascimento: em(10), email: 'a@x.com' },
    { nome: 'Hoje', nascimento: em(0) },
    { nome: 'Amanhã', nascimento: em(1) },
    { nome: 'Daqui a 40', nascimento: em(40) },
    { nome: 'Ontem', nascimento: em(-1) },
  ] } });
  await pedir('/api/fotoqr', { method: 'POST', cookie: c, json: { titulo: 'Fotos' } });
  const r = (await pedir('/api/birthdays/resumo', { cookie: c })).json;
  assert.deepEqual([r.pessoas, r.semFoto, r.semEmail, r.pendentes, r.pedidosAbertos], [5, 5, 4, 0, 1]);
  assert.deepEqual(r.proximos.map((p) => [p.nome, p.em]), [['Hoje', 0], ['Amanhã', 1], ['Daqui a 10', 10]], 'ordem, janela de 30 dias, e quem fez ontem só no ano que vem');
  assert.equal(r.proximos[0].email, undefined, 'o resumo levou o e-mail');
});

test('o painel: resumo no topo de Pessoas e no Início (só com equipe), atalhos e filtros da lista', () => {
  const R = ler('web/src/components/pessoas/ResumoDasPessoas.jsx');
  assert.match(R, /if \(soComEquipe && !data\.pessoas && !data\.pendentes\) return null;/, 'a loja sem equipe ganhou cartões vazios no Início');
  assert.match(R, /'Ver quem está sem foto'/);
  const P = ler('web/src/pages/BirthdaysPage.jsx');
  assert.match(P, /<ResumoDasPessoas onIr=\{irPara\} recarregar=\{dados\} \/>/);
  assert.match(P, /const FILTROS = \{ todos: \(\) => true, semFoto: \(p\) => !p\.foto, semEmail: \(p\) => !p\.email \};/);
  assert.match(P, /<div id="fotos-pelo-qr" className="scroll-mt-20"><FotosPeloQR onAprovou=\{reload\} \/><\/div>/);
  assert.match(P, /<Panel className="scroll-mt-20" id="lista-pessoas">/);
  assert.match(ler('web/src/pages/DashboardPage.jsx'), /<ResumoDasPessoas soComEquipe onIr=\{\(\) => onIr && onIr\('birthdays'\)\} \/>/);
});
