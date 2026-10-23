/*
 * Quiz com cronômetro (EXECUTOR D21).
 *
 * Pergunta, alternativas, o tempo correndo, a resposta e a explicação. "Fato
 * errado na parede é pior que nenhum": o que a IA escreve entra como não
 * conferido, a TV só mostra pergunta conferida e o servidor recusa publicar
 * quiz com pergunta pendente.
 */
'use strict';
process.env.AI_PROVIDER = process.env.AI_PROVIDER || 'dev';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const http = require('node:http');
const path = require('node:path');
const { spawn } = require('node:child_process');

const RAIZ = path.join(__dirname, '..');
const ler = (...p) => fs.readFileSync(path.join(RAIZ, ...p), 'utf8');
const Q = require('../js/quiz.js');
const IA = require('../server/quiz-ia.js');

test('a pergunta só vale inteira: enunciado, 2 a 4 alternativas e a certa apontando para uma delas', () => {
  const q = Q.normalizar({ perguntas: [
    { pergunta: 'Qual?', alternativas: ['a', '', 'c'], certa: 2 },            // a vazia sai, a certa acompanha
    { pergunta: '', alternativas: ['a', 'b'], certa: 0 },                     // sem enunciado
    { pergunta: 'X', alternativas: ['só uma'], certa: 0 },                     // menos de duas
    { pergunta: 'Y', alternativas: ['a', 'b'], certa: 3 },                     // certa fora
    { pergunta: 'Z\u0000', alternativas: ['a', 'b', 'c', 'd', 'e'], certa: 1, revisada: false },
  ], tempo: 7 });
  assert.equal(q.perguntas.length, 2);
  assert.deepEqual(q.perguntas[0], { pergunta: 'Qual?', alternativas: ['a', 'c'], certa: 1, explicacao: '', revisada: true });
  assert.equal(q.perguntas[1].pergunta, 'Z');
  assert.equal(q.perguntas[1].alternativas.length, 4);
  assert.equal(q.tempo, 10, 'tempo fora da lista volta ao padrão');
  assert.equal(Q.pendentes({ perguntas: q.perguntas }), 1);
  assert.equal(Q.prontas({ perguntas: q.perguntas }).length, 1);
  assert.equal(Q.duracao({ perguntas: q.perguntas, tempo: 15, revelar: 5 }), 20, 'só a conferida conta no tempo de tela');
});

test('a IA escreve tudo como NÃO conferido, e a certa muda de lugar sem trocar de resposta', async () => {
  const r = await IA.gerar({ tema: 'segurança', quantidade: 3, perfil: 'empresa' });
  assert.equal(r.perguntas.length, 3);
  assert.ok(r.perguntas.every((p) => p.revisada === false), 'pergunta da IA saiu conferida');
  IA.PRONTAS.empresa.forEach((orig, i) => {
    const p = r.perguntas[i];
    assert.equal(p.alternativas[p.certa], orig.alternativas[orig.certa], 'o embaralhar trocou a resposta');
  });
  assert.ok(new Set(r.perguntas.map((p) => p.certa)).size > 1 || r.perguntas.length < 2, 'a certa sempre no mesmo lugar');
  assert.match(IA.SISTEMA, /Só fato consolidado/);
  assert.match(IA.SISTEMA, /Nada de número que muda/);
});

test('a TV desenha só as conferidas, com relógio que não depende de requestAnimationFrame', () => {
  const r = ler('js/render.js');
  const corpo = r.slice(r.indexOf('function renderQuiz('), r.indexOf('RENDERERS.quiz = renderQuiz;'));
  assert.match(corpo, /const perguntas = Q\.prontas\(item\);/);
  assert.match(corpo, /if \(!perguntas\.length\) throw new Error/, 'quiz sem pergunta conferida ficaria 10 s de tela vazia');
  assert.doesNotMatch(corpo, /requestAnimationFrame/);
  assert.match(corpo, /onLeave: \(\) => timers\.forEach/, 'o relógio do quiz continua rodando depois de sair');
  assert.match(corpo, /nova\.style\.animationDuration = q\.tempo \+ 's';/);
  assert.match(ler('css/player.css'), /@keyframes mt-quiz-tempo/);
  assert.match(ler('player.html'), /<script src="js\/quiz\.js"><\/script>\s*<script src="js\/render\.js">/);
  assert.match(ler('sw.js'), /'\/js\/quiz\.js'/);
  assert.match(ler('sw.js'), /const SHELL_CACHE = 'mt-shell-v50';/);
  for (const f of ['js/quiz.js', 'js/render.js']) assert.ok(!/\{\s*\.\.\./.test(ler(f)), f + ' com spread de objeto (TV antiga)');
});

test('o painel: tipo Quiz, a IA escreve e a pessoa confere uma a uma', () => {
  const tipos = ler('web/src/lib/contentTypes.js');
  assert.match(tipos, /fields: \[\{ key: 'perguntas', label: 'Perguntas', kind: 'quiz' \}\]/);
  const f = ler('web/src/components/content/QuizField.jsx');
  assert.match(f, /const novas = \(\(r && r\.perguntas\) \|\| \[\]\)\.map\(\(p\) => \(\{ \.\.\.p, revisada: false \}\)\);/);
  assert.match(f, /onClick=\{\(\) => trocar\(i, \{ revisada: true \}\)\}>Conferi, está certa</);
  // A digitada à mão nasce conferida.
  assert.match(f, /const VAZIA = \(\) => \(\{ pergunta: '', alternativas: \['', '', '', ''\], certa: 0, explicacao: '', revisada: true \}\);/);
  assert.match(ler('web/src/components/content/ItemForm.jsx'), /if \(f\.kind === 'quiz'\) return <QuizField/);
});

/* ---------------- servidor de verdade ---------------- */

const PORTA = 6300 + Math.floor(Math.random() * 90);
function pedir(caminho, o = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port: PORTA, path: caminho, method: o.method || 'GET',
      headers: { ...(o.json ? { 'Content-Type': 'application/json' } : {}), ...(o.cookie ? { Cookie: o.cookie } : {}), ...(o.headers || {}) } }, (res) => {
      let corpo = '';
      res.on('data', (c) => { corpo += c; });
      res.on('end', () => { let json = null; try { json = JSON.parse(corpo); } catch (e) { json = null; } resolve({ status: res.statusCode, json, cookies: [].concat(res.headers['set-cookie'] || []) }); });
    });
    req.on('error', reject);
    req.setTimeout(30000, () => req.destroy(new Error('a rota ' + caminho + ' não respondeu')));
    if (o.json) req.write(JSON.stringify(o.json));
    req.end();
  });
}
const cookieDe = (r) => r.cookies.map((c) => c.split(';')[0]).filter((c) => !c.endsWith('=')).join('; ');

test('publicar: quiz com pergunta da IA não conferida é recusado; conferido vai, normalizado', async (t) => {
  const dados = fs.mkdtempSync(path.join(os.tmpdir(), 'mt-d21-'));
  const servidor = spawn(process.execPath, ['server.js'], {
    cwd: RAIZ, stdio: 'ignore',
    env: { ...process.env, PORT: String(PORTA), STORAGE: 'local', SKIP_VERIFY: '1', DATABASE_URL: '', DATA_DIR: dados, MEDIA_DIR: dados, AI_PROVIDER: 'dev' },
  });
  t.after(() => { servidor.kill(); try { fs.rmSync(dados, { recursive: true, force: true }); } catch (e) { /* o Windows segura o arquivo */ } });
  let ok = false;
  for (let i = 0; i < 60 && !ok; i++) { try { await pedir('/tv'); ok = true; } catch (e) { await new Promise((r) => setTimeout(r, 250)); } }
  assert.ok(ok, 'o servidor de teste não subiu');
  const c = cookieDe(await pedir('/api/auth/signup', { method: 'POST', json: { email: 'd21' + Date.now() + '@teste.local', password: 'senha-de-teste-123', name: 'Clínica', aceite: true } }));
  const tv = (await pedir('/api/devices', { method: 'POST', json: {} })).json;
  assert.ok((await pedir('/api/pair', { method: 'POST', cookie: c, json: { code: tv.code } })).status < 300);

  const pergunta = { pergunta: 'Qual vacina é anual?', alternativas: ['Gripe', 'BCG'], certa: 0, explicacao: 'O vírus muda.' };
  const com = (p) => ({ settings: { layoutId: 'full' }, zonas: { principal: { items: [{ type: 'quiz', perguntas: [p], tempo: 8, agendamento: { dias: [1] } }] } } });
  const pendente = await pedir('/api/devices/' + tv.id + '/config', { method: 'PUT', cookie: c, json: com({ ...pergunta, revisada: false }) });
  assert.equal(pendente.status, 400);
  assert.equal(pendente.json.code, 'quiz-sem-revisao');

  assert.equal((await pedir('/api/devices/' + tv.id + '/config', { method: 'PUT', cookie: c, json: com({ ...pergunta, revisada: true, lixo: 'x' }) })).status, 200);
  const gravado = (await pedir('/api/devices/' + tv.id + '/config', { cookie: c })).json;
  const item = gravado.zonas.principal.items[0];
  assert.equal(item.tempo, 8);
  assert.deepEqual(item.agendamento, { dias: [1] }, 'a agenda do item se perdeu');
  assert.equal(item.perguntas[0].lixo, undefined);

  // A rota da IA: só com sessão; roda como trabalho.
  assert.equal((await pedir('/api/ai/quiz', { method: 'POST', json: { tema: 'x' } })).status, 401);
  const job = await pedir('/api/ai/quiz', { method: 'POST', cookie: c, json: { tema: 'prevenção', quantidade: 2 } });
  assert.equal(job.status, 202);
});
