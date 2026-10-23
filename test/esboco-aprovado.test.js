/*
 * Só gera com o esboço aprovado (EXECUTOR D42).
 *
 * O dono: "só pode gerar depois que os wireframes forem aprovados". Nenhuma
 * geração final (foto ou peça) sai antes de a pessoa aprovar o esboço — a
 * planta da TV com o que vai em cada parte. Vale para o Criar (o servidor
 * exige a aprovação do escopo EXATO), a edição (o que gera espera o "pode
 * fazer"), o ajuste antigo (não gera mais) e o diretor (só o plano aprovado).
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const http = require('node:http');
const path = require('node:path');
const { spawn } = require('node:child_process');
const Es = require('../server/esboco.js');
const E = require('../js/escopo.js');

const RAIZ = path.join(__dirname, '..');
const ler = (f) => fs.readFileSync(path.join(RAIZ, f), 'utf8').replace(/\r\n/g, '\n');
const ESCOPO = { nome: 'Pão', objetivo: 'vender à tarde', imagens: 'nenhuma',
  telas: [{ alvo: { tipo: 'todas' }, zonas: { principal: { pecas: 2 }, lateral: { pecas: 1 }, cabecalho: { pecas: 0 }, rodape: { pecas: 0 } } }] };

test('a chave é do escopo inteiro: igual vale, qualquer mudança derruba', () => {
  const a = Es.aprovar(ESCOPO, 1);
  assert.equal(a.chave, Es.chave(E.normalizar(JSON.parse(JSON.stringify(ESCOPO)))));
  assert.ok(Es.valeParaEste(a, ESCOPO));
  const mais = JSON.parse(JSON.stringify(ESCOPO)); mais.telas[0].zonas.principal.pecas = 3;
  assert.equal(Es.valeParaEste(a, mais), false, 'uma peça a mais passou com a aprovação de antes');
  assert.equal(Es.valeParaEste(a, Object.assign({}, ESCOPO, { imagens: 'gerar' })), false, 'trocar para foto gerada (gasta) passou');
  assert.equal(Es.valeParaEste(null, ESCOPO), false);
  assert.ok(Es.geraAlgo([{ tipo: 'texto' }, { tipo: 'refazer' }]));
  assert.ok(!Es.geraAlgo([{ tipo: 'texto' }, { tipo: 'tirar' }, { tipo: 'redes' }]));
  for (const s of ['Pode fazer', 'sim', 'ok, pode', 'Pode sim']) assert.ok(Es.confirmou(s), s);
  for (const s of ['Não, deixa como está', 'não pode', 'espera', 'pode trocar a cor?']) assert.ok(!Es.confirmou(s), s);
  assert.ok(Es.recusou('Não, deixa como está'));
});

test('o painel: Gerar abre o esboço; "pode gerar" na conversa também; Criando mostra o que espera', () => {
  const C = ler('web/src/pages/CriarPage.jsx');
  assert.match(C, /if \(r\.gerar\) setParaAprovar\(/, 'a conversa voltou a gerar sem o esboço');
  assert.doesNotMatch(C, /if \(r\.gerar\) gerar\(/);
  assert.match(C, /onClick=\{pedirAprovacao\}/);
  const ag = C.slice(C.indexOf('async function aprovarEGerar() {'), C.indexOf('async function gerar('));
  const ordem = ['criar.aprovarEsboco(', 'gerar({ escopo: esc, conversa: r.conversa })'];
  ordem.reduce((i, s) => { const j = ag.indexOf(s); assert.ok(j > i, 'fora de ordem: ' + s); return j; }, -1);
  assert.match(C, /setConversa\(\(c\) => \(c \? \{ \.\.\.c, esboco: null \} : c\)\);/, 'mexer no cartão não derrubou a aprovação');
  const A = ler('web/src/components/criar/AprovarEsboco.jsx');
  assert.match(A, /<EsbocoDaTela key=\{ti\}/);
  assert.match(A, /Aprovar e gerar/);
  assert.match(ler('web/src/pages/CriandoPage.jsx'), /onIr\('criar', \{ conversa: c\.id, aprovar: true \}\)/);
  assert.match(ler('web/src/components/criar/EditarComIA.jsx'), /m\.planejado\.map/);
});

/* ---------------- servidor de verdade ---------------- */

const PORTA = 8100 + Math.floor(Math.random() * 90);
function pedir(caminho, o = {}) {
  return new Promise((resolve, reject) => {
    const corpo = o.json ? Buffer.from(JSON.stringify(o.json)) : null;
    const req = http.request({ host: '127.0.0.1', port: PORTA, path: caminho, method: o.method || 'GET',
      headers: Object.assign({}, o.json ? { 'Content-Type': 'application/json' } : {}, o.cookie ? { Cookie: o.cookie } : {}) }, (res) => {
      let txt = '';
      res.on('data', (c) => { txt += c; });
      res.on('end', () => { let json = null; try { json = JSON.parse(txt); } catch (e) { json = null; } resolve({ status: res.statusCode, json, cookies: [].concat(res.headers['set-cookie'] || []) }); });
    });
    req.on('error', reject);
    req.setTimeout(30000, () => req.destroy(new Error('a rota ' + caminho + ' não respondeu')));
    if (corpo) req.write(corpo);
    req.end();
  });
}
async function esperarJob(id, cookie) {
  for (let i = 0; i < 160; i++) {
    const s = (await pedir('/api/ai/job/' + id, { cookie })).json;
    if (s && s.estado === 'pronto') return s.resultado;
    if (s && s.estado === 'erro') throw new Error(s.erro);
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error('o trabalho não terminou');
}

test('a rota: sem aprovação nada é gerado; mudou o escopo, aprova de novo; a edição espera o "pode fazer"; o diretor só com plano', async (t) => {
  const dados = fs.mkdtempSync(path.join(os.tmpdir(), 'mt-d42-'));
  const env = { ...process.env, PORT: String(PORTA), STORAGE: 'local', SKIP_VERIFY: '1', DATABASE_URL: '', DATA_DIR: dados, MEDIA_DIR: dados, AI_PROVIDER: 'dev', MT_APK_REPO: 'desligado' };
  const servidor = spawn(process.execPath, ['server.js'], { cwd: RAIZ, stdio: 'ignore', env });
  t.after(() => { servidor.kill(); try { fs.rmSync(dados, { recursive: true, force: true }); } catch (e) { /* o Windows segura o arquivo */ } });
  let ok = false;
  for (let i = 0; i < 160 && !ok; i++) { try { await pedir('/tv'); ok = true; } catch (e) { await new Promise((r) => setTimeout(r, 250)); } }
  assert.ok(ok, 'o servidor de teste não subiu');
  const c = (await pedir('/api/auth/signup', { method: 'POST', json: { email: 'd42' + Date.now() + '@teste.local', password: 'senha-de-teste-123', name: 'Padaria', aceite: true } }))
    .cookies.map((x) => x.split(';')[0]).filter((x) => !x.endsWith('=')).join('; ');

  // Sem conversa nem aprovação: 409.
  const direto = await pedir('/api/ai/ecossistema', { method: 'POST', cookie: c, json: { escopo: ESCOPO } });
  assert.deepEqual([direto.status, direto.json.code], [409, 'esboco-nao-aprovado']);
  // Aprova este escopo; gerar OUTRO (uma peça a mais) continua recusado.
  const conv = (await pedir('/api/conversas/esboco', { method: 'POST', cookie: c, json: { escopo: ESCOPO } })).json.conversa;
  assert.ok(conv.esboco && conv.esboco.chave);
  const outro = JSON.parse(JSON.stringify(ESCOPO)); outro.telas[0].zonas.principal.pecas = 3;
  assert.equal((await pedir('/api/ai/ecossistema', { method: 'POST', cookie: c, json: { conversaId: conv.id, escopo: outro } })).status, 409, 'gerou um escopo que não foi aprovado');
  // Mexer no cartão derruba a aprovação.
  const mexido = (await pedir('/api/conversas/' + conv.id, { method: 'PUT', cookie: c, json: { escopo: outro } })).json.conversa;
  assert.equal(mexido.esboco, null);
  assert.equal((await pedir('/api/ai/ecossistema', { method: 'POST', cookie: c, json: { conversaId: conv.id } })).status, 409);
  // Aprovado de novo, gera.
  assert.equal((await pedir('/api/conversas/esboco', { method: 'POST', cookie: c, json: { id: conv.id, escopo: outro } })).status, 200);
  const job = await pedir('/api/ai/ecossistema', { method: 'POST', cookie: c, json: { conversaId: conv.id, escopo: outro } });
  assert.equal(job.status, 202);
  const camp = (await esperarJob(job.json.id, c)).campanha;
  // Já virou campanha: aprovar de novo nessa conversa não vale.
  assert.equal((await pedir('/api/conversas/esboco', { method: 'POST', cookie: c, json: { id: conv.id, escopo: outro } })).status, 409);

  // Edição: o que gera espera o "pode fazer"; "não" não muda nada.
  const e1 = await esperarJob((await pedir('/api/ai/editar', { method: 'POST', cookie: c, json: { campanhaId: camp.id, texto: 'mais uma peça na lateral' } })).json.id, c);
  assert.equal(e1.acao, 'confirmar');
  assert.equal(e1.campanha.resultado.contagem.pecas, camp.resultado.contagem.pecas);
  const e2 = await esperarJob((await pedir('/api/ai/editar', { method: 'POST', cookie: c, json: { campanhaId: camp.id, texto: 'Não, deixa como está' } })).json.id, c);
  assert.equal(e2.campanha.resultado.contagem.pecas, camp.resultado.contagem.pecas);
  await esperarJob((await pedir('/api/ai/editar', { method: 'POST', cookie: c, json: { campanhaId: camp.id, texto: 'mais uma peça na lateral' } })).json.id, c);
  const e4 = await esperarJob((await pedir('/api/ai/editar', { method: 'POST', cookie: c, json: { campanhaId: camp.id, texto: 'Pode fazer' } })).json.id, c);
  assert.equal(e4.acao, 'fazer');
  assert.equal(e4.campanha.resultado.contagem.pecas, camp.resultado.contagem.pecas + 1);
  // Trocar um texto não gera: vai direto, sem pergunta.
  const tx = await esperarJob((await pedir('/api/ai/editar', { method: 'POST', cookie: c, json: { campanhaId: camp.id, texto: 'muda o título da peça 1 para: Pão quentinho' } })).json.id, c);
  assert.equal(tx.acao, 'fazer');

  // D42b: a imagem de Meus Designs (gasta criação) só com o esboço aprovado — o exato.
  const img = { prompt: 'xícara de café fumegante', formato: '9/16', estilo: 'fotográfico' };
  const semEsboco = await pedir('/api/ai/generate-image', { method: 'POST', cookie: c, json: img });
  assert.deepEqual([semEsboco.status, semEsboco.json.code], [409, 'esboco-nao-aprovado']);
  const esb = (await pedir('/api/ai/generate-image', { method: 'POST', cookie: c, json: Object.assign({ apenasEsboco: true }, img) })).json.esboco;
  assert.deepEqual([esb.descricao, esb.formato, esb.estilo, esb.criacoes], [img.prompt, '9/16', 'fotográfico', 1]);
  assert.equal((await pedir('/api/ai/generate-image', { method: 'POST', cookie: c, json: Object.assign({}, img, { formato: '16/9', esboco: esb.chave }) })).status, 409, 'outro formato com a chave do esboço');
  assert.equal((await pedir('/api/ai/generate-image', { method: 'POST', cookie: c, json: Object.assign({}, img, { esboco: esb.chave }) })).status, 202);

  // O diretor (Meus Designs, Criação rápida): só o plano aprovado gera.
  const dir = await pedir('/api/ai/director', { method: 'POST', cookie: c, json: { brief: 'promoção de pão' } });
  assert.deepEqual([dir.status, dir.json.code], [409, 'plano-nao-aprovado']);
  assert.equal((await pedir('/api/ai/director', { method: 'POST', cookie: c, json: { brief: 'promoção de pão', apenasPlano: true } })).status, 202);
});

test('o painel de Meus Designs: Ver o esboço da imagem, depois Aprovar e gerar (com a chave)', () => {
  const M = ler('web/src/pages/MyDesignsPage.jsx');
  assert.match(M, /onClick=\{verEsbocoDaImagem\}>Ver o esboço</);
  assert.match(M, /ai\.image\(\{ prompt, formato, estilo: iEstilo, esboco: chave \}\)/);
  assert.match(M, /foto: \{esbocoImg\.descricao\}/);
  const S = ler('server/esboco.js');
  assert.match(S, /function chaveDaImagem\(/);
});
