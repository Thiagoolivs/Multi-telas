/*
 * Os ajustes conversam, e um lugar só para pedir à IA (EXECUTOR D51).
 *
 * O dono: "nos ajustes, ela conversar até entender o que tem que fazer" e
 * "não entendi como a IA altera as programações". O aviso rápido e o "Mudar
 * com IA" perguntam quando falta o essencial (com respostas prontas) e a
 * resposta completa o pedido; na Programação, "Pedir à IA" entende se é
 * aviso, aparência de uma TV ou conteúdo novo, e leva ao caminho certo.
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const http = require('node:http');
const path = require('node:path');
const { spawn } = require('node:child_process');
const ai = require('../server/ai.js');
const Av = require('../server/aviso-rapido.js');
const Te = require('../server/ajuste-tela.js');
const As = require('../server/assistente.js');

const RAIZ = path.join(__dirname, '..');
const ler = (f) => fs.readFileSync(path.join(RAIZ, f), 'utf8').replace(/\r\n/g, '\n');
function devMode(t) {
  const antes = process.env.AI_PROVIDER;
  process.env.AI_PROVIDER = 'dev';
  t.after(() => { if (antes === undefined) delete process.env.AI_PROVIDER; else process.env.AI_PROVIDER = antes; });
}
const ia = (p) => ({ papel: 'ia', texto: p });
const pessoa = (p) => ({ papel: 'pessoa', texto: p });

test('aviso: "quero um aviso" pergunta o que dizer; a resposta completa o pedido', async (t) => {
  devMode(t);
  const r1 = await Av.entender('quero um aviso pra amanhã');
  assert.match(r1.pergunta, /O que o aviso vai dizer/);
  assert.ok(r1.sugestoes.length >= 2);
  const r2 = await Av.entender('Piso molhado, cuidado', { historico: [pessoa('quero um aviso pra amanhã'), ia(r1.pergunta)] });
  assert.equal(r2.titulo, 'Piso molhado');
  assert.ok(r2.ate, 'o "amanhã" do pedido de antes se perdeu');
  // Pedido completo não pergunta.
  assert.equal((await Av.entender('banheiro interditado até amanhã')).pergunta, undefined);
});

test('tela: "muda a cor" pergunta qual; a resposta vira o fundo; sem nada, pergunta o que mudar', async (t) => {
  devMode(t);
  const atual = { layoutId: 'dashboard', orientacao: 'landscape' };
  const r1 = await Te.entender('muda a cor', atual);
  assert.equal(r1.pergunta, 'Qual cor?');
  const r2 = await Te.entender('Verde escuro', atual, [pessoa('muda a cor'), ia('Qual cor?')]);
  assert.deepEqual(r2.mudancas, { fundo: 'cor', fundoCor: '#0f3d2e' });
  assert.match((await Te.entender('oi', atual)).pergunta, /O que você quer mudar na tela/);
});

test('com IA: a pergunta dela vale quando não há o que fazer; o histórico vai junto', async (t) => {
  const modo = ai.mode;
  const llm = ai.callLLM;
  const vistos = [];
  ai.mode = () => 'gemini';
  ai.callLLM = async (s, u) => { vistos.push(u); return JSON.stringify({ pergunta: 'Até quando vale?', sugestoes: ['Só hoje', 'Até sexta'] }); };
  try {
    const r = await Av.entender('reunião geral', { historico: [pessoa('preciso avisar uma coisa'), ia('O que o aviso vai dizer?')] });
    assert.deepEqual(r, { pergunta: 'Até quando vale?', sugestoes: ['Só hoje', 'Até sexta'] });
    assert.match(vistos[0], /CONVERSA:\nPessoa: preciso avisar uma coisa\nVocê: O que o aviso vai dizer\?\nPessoa: reunião geral/);
  } finally { ai.mode = modo; ai.callLLM = llm; }
});

/*
 * Desde 24/10 o Pedir à IA é o maestro do assistente, com menos ferramentas
 * (o consultor, #299). A pergunta volta com a ferramenta e os argumentos: o
 * painel guarda na mini-conversa, e a resposta seguinte continua a tarefa.
 */
test('Pedir à IA: entende o tipo, pergunta a TV quando há várias, e leva ao Criar com o pedido', async (t) => {
  devMode(t);
  const telas = [{ id: 'd1', nome: 'Recepção', layout: 'dashboard', emPe: false, tema: '' }, { id: 'd2', nome: 'Refeitório', layout: 'dashboard', emPe: false, tema: '' }];
  const pedir = (texto, o = {}) => As.pedirNaProgramacao({ texto, historico: o.historico, ctx: { telas: o.telas || telas, campanhas: [], grupos: [] }, tvFixa: o.tvFixa });
  const tipo = await pedir('oi, quero mudar umas coisas');
  assert.equal(tipo.pergunta, As.PERGUNTA_DO_TIPO.pergunta);
  assert.deepEqual(tipo.sugestoes, As.PERGUNTA_DO_TIPO.sugestoes);
  const q = await pedir('tema claro');
  assert.equal(q.pergunta, 'Em qual TV?');
  assert.deepEqual(q.sugestoes, ['Recepção', 'Refeitório']);
  assert.equal(q.ferramenta, 'mudar_tela');
  const r = await pedir('Refeitório', { historico: [pessoa('tema claro'), { papel: 'ia', texto: q.pergunta, ferramenta: q.ferramenta, args: q.args }] });
  assert.equal(r.destino, 'tela');
  assert.deepEqual(r.tv, { id: 'd2', nome: 'Refeitório' });
  assert.equal(r.mudancas.fundo, 'claro');
  // Uma TV só: não pergunta qual. A TV aberta no painel é fixa.
  assert.equal((await pedir('sem relógio', { telas: [telas[0]] })).tv.id, 'd1');
  assert.equal((await pedir('tema claro', { tvFixa: 'd2' })).tv.id, 'd2');
  const c = await pedir('Criar uma promoção de café');
  assert.deepEqual(c, { destino: 'criar', texto: 'Criar uma promoção de café' });
  const a = await pedir('Aviso: piso molhado no corredor');
  assert.equal(a.destino, 'aviso');
  assert.match(a.aviso.titulo, /Piso molhado/);
  assert.deepEqual(await pedir('tema escuro', { telas: [] }), { destino: 'nenhuma-tv' });
  // O quiz também, conferido no painel antes de ir; a ferramenta que o servidor não deu é ignorada.
  const z = await pedir('quiz de 2 perguntas sobre café na lateral da Recepção');
  assert.equal(z.destino, 'quiz');
  assert.equal(z.quiz.zona, 'lateral');
  assert.equal(z.quiz.tv.id, 'd1');
  assert.equal(z.quiz.quiz.perguntas.length, 2);
  const falsa = await pedir('Refeitório', { historico: [pessoa('oi'), { papel: 'ia', texto: 'ok', ferramenta: 'apagar_tudo', args: {} }] });
  assert.equal(falsa.pergunta, As.PERGUNTA_DO_TIPO.pergunta, 'uma ferramenta inventada pelo painel virou tarefa');
});

test('o painel: Pedir à IA na Programação; o aviso e o "Mudar com IA" com a mini-conversa', () => {
  const P = ler('web/src/pages/ProgramacaoPage.jsx');
  assert.match(P, /<Button variant="secondary" icon=\{Sparkles\} onClick=\{\(\) => setAvisoAberto\(true\)\}>Pedir à IA<\/Button>/);
  assert.match(P, /<PedirIA onFechar=\{\(\) => setAvisoAberto\(false\)\} onIr=\{onIr\} \/>/);
  const I = ler('web/src/components/tela/PedirIA.jsx');
  assert.match(I, /if \(r\.destino === 'criar'\) \{ onFechar\(\); if \(onIr\) onIr\('criar', \{ texto: r\.texto \}\); return; \}/);
  assert.match(I, /if \(avisoPronto\) return <AvisoRapido avisoInicial=\{avisoPronto\} onFechar=\{onFechar\} \/>;/);
  // Desde 24/10 o conferir e aplicar mora no MudarAparencia, o mesmo do assistente do Criar.
  assert.match(I, /if \(tela\) return <MudarAparencia tv=\{tela\.tv\} mudancas=\{tela\.mudancas\}/);
  assert.match(ler('web/src/components/tela/MudarAparencia.jsx'), /gravarEmLote\(\[estado\.alvo\], \(cfg\) => aplicarMudancas\(cfg, mudancas, \{ coresMarca: estado\.coresMarca \}\)/, 'mudou a TV sem o lote (sem Desfazer)');
  for (const f of ['web/src/components/tela/AvisoRapido.jsx', 'web/src/components/tela/MudarComIA.jsx']) {
    assert.match(ler(f), /<MiniConversa historico=\{historico\}/, f);
    assert.match(ler(f), /comPergunta\(h, frase, r\)/, f);
  }
  assert.match(ler('web/src/pages/CriarPage.jsx'), /return op \? op\.pedido \+ ': ' : \(textoInicial \|\| ''\);/);
});

/* ---------------- servidor de verdade ---------------- */

const PORTA = 8200 + Math.floor(Math.random() * 90);
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

test('a rota: /api/ai/pedir pergunta, acha a TV da conta, e o aviso/tela devolvem a pergunta', async (t) => {
  const dados = fs.mkdtempSync(path.join(os.tmpdir(), 'mt-d51-'));
  const env = { ...process.env, PORT: String(PORTA), STORAGE: 'local', SKIP_VERIFY: '1', DATABASE_URL: '', DATA_DIR: dados, MEDIA_DIR: dados, AI_PROVIDER: 'dev', MT_APK_REPO: 'desligado' };
  const servidor = spawn(process.execPath, ['server.js'], { cwd: RAIZ, stdio: 'ignore', env });
  t.after(() => { servidor.kill(); try { fs.rmSync(dados, { recursive: true, force: true }); } catch (e) { /* o Windows segura o arquivo */ } });
  let ok = false;
  for (let i = 0; i < 160 && !ok; i++) { try { await pedir('/tv'); ok = true; } catch (e) { await new Promise((r) => setTimeout(r, 250)); } }
  assert.ok(ok, 'o servidor de teste não subiu');
  const c = (await pedir('/api/auth/signup', { method: 'POST', json: { email: 'd51' + Date.now() + '@teste.local', password: 'senha-de-teste-123', name: 'Loja', aceite: true } }))
    .cookies.map((x) => x.split(';')[0]).filter((x) => !x.endsWith('=')).join('; ');
  assert.equal((await pedir('/api/ai/pedir', { method: 'POST', json: { texto: 'oi' } })).status, 401);
  assert.deepEqual((await pedir('/api/ai/pedir', { method: 'POST', cookie: c, json: { texto: 'quero mudar umas coisas' } })).json.sugestoes, As.PERGUNTA_DO_TIPO.sugestoes);
  // Sem TV: diz, em vez de mudar o nada.
  assert.deepEqual((await pedir('/api/ai/pedir', { method: 'POST', cookie: c, json: { texto: 'tema claro' } })).json, { destino: 'nenhuma-tv' });
  // Com uma TV pareada: a mudança vem para ela.
  const tv = (await pedir('/api/devices', { method: 'POST', json: {} })).json;
  assert.ok((await pedir('/api/pair', { method: 'POST', cookie: c, json: { code: tv.code, name: 'Recepção' } })).status < 300);
  await pedir('/api/devices/' + tv.id + '/config', { method: 'PUT', cookie: c, json: { settings: { layoutId: 'dashboard' }, zonas: {} } });
  const r = (await pedir('/api/ai/pedir', { method: 'POST', cookie: c, json: { texto: 'tema claro' } })).json;
  assert.equal(r.destino, 'tela');
  assert.equal(r.tv.id, tv.id);
  // O aviso e a tela, direto, também perguntam.
  assert.match((await pedir('/api/ai/aviso', { method: 'POST', cookie: c, json: { texto: 'quero um aviso' } })).json.pergunta, /O que o aviso/);
  const p = (await pedir('/api/ai/tela', { method: 'POST', cookie: c, json: { texto: 'muda a cor', layoutId: 'dashboard' } })).json;
  assert.equal(p.pergunta, 'Qual cor?');
  const f = (await pedir('/api/ai/tela', { method: 'POST', cookie: c, json: { texto: 'Preto', layoutId: 'dashboard', historico: [pessoa('muda a cor'), ia('Qual cor?')] } })).json;
  assert.equal(f.mudancas.fundo, 'cor');
});
