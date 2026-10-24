/*
 * Editar com a IA, conversando (EXECUTOR D50).
 *
 * O dono, em 23/10: "se eu quiser editar, entro lá [em Criados], edito na mão,
 * ou abro um chat de edição com contexto e memória para não regredir" e "nos
 * ajustes, ela conversar até entender o que tem que fazer". O "Ajustar" era
 * uma frase só, que chutava quando o pedido era ambíguo. Agora: pergunta
 * quando não entende, muda só o que foi pedido (trocar um texto não refaz a
 * peça), lembra a conversa e o combinado.
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
const eco = require('../server/ecossistema.js');
const A = require('../server/ajuste.js');
const Ed = require('../server/edicao.js');

const RAIZ = path.join(__dirname, '..');
const ler = (f) => fs.readFileSync(path.join(RAIZ, f), 'utf8').replace(/\r\n/g, '\n');
const ESCOPO = {
  nome: 'Semana do pão de queijo', objetivo: 'vender mais à tarde', imagens: 'gerar',
  telas: [{ alvo: { tipo: 'todas' }, zonas: { principal: { pecas: 2 }, lateral: { pecas: 1 }, cabecalho: { pecas: 1 }, rodape: { pecas: 1 } } }],
};
function devMode(t) {
  const antes = process.env.AI_PROVIDER;
  process.env.AI_PROVIDER = 'dev';
  t.after(() => { if (antes === undefined) delete process.env.AI_PROVIDER; else process.env.AI_PROVIDER = antes; });
}
async function campanha(t) {
  devMode(t);
  let n = 0;
  const resultado = await eco.gerar(ESCOPO, { empresa: 'Padaria do Bairro' }, { onImagem: async () => '/media/t/f' + (++n) + '.png' });
  return { id: 'camp_teste', nome: resultado.nome, escopo: ESCOPO, resultado };
}

test('trocar um texto não refaz a peça: só aquele campo muda (foto, desenho e os outros textos ficam)', async (t) => {
  const c = await campanha(t);
  const p2 = A.numerar(c.resultado)[1].peca;
  const campos = A.camposDeTexto(p2);
  assert.ok(campos.includes('titulo'), 'a peça não tem título de texto: ' + campos.join(','));
  assert.ok(!campos.includes('foto'), 'foto entrou como texto');
  // A peneira: campo que a peça não tem, peça que não existe, valor vazio — nada.
  assert.deepEqual(A.lerMudancas([
    { tipo: 'texto', peca: 2, campo: 'titulo', valor: '  Pão de queijo  R$ 8,90 ' },
    { tipo: 'texto', peca: 2, campo: 'inventado', valor: 'x' }, { tipo: 'texto', peca: 99, campo: 'titulo', valor: 'x' },
    { tipo: 'texto', peca: 2, campo: 'titulo', valor: '   ' }, { tipo: 'texto', peca: 2, campo: 'foto', valor: '/media/x.png' },
  ], c.resultado), [{ tipo: 'texto', peca: 2, campo: 'titulo', valor: 'Pão de queijo R$ 8,90' }]);
  const feito = await A.aplicar(c, [{ tipo: 'texto', peca: 2, campo: 'titulo', valor: 'Pão de queijo R$ 8,90' }], { empresa: 'Padaria do Bairro' }, {
    onImagem: async () => { throw new Error('trocar texto não pode gerar foto'); },
  });
  const nova = A.numerar(feito.resultado)[1].peca;
  /*
   * A peça divide o título em duas linhas (titulo + titulo2): o texto novo é
   * repartido nas duas — a segunda linha do título antigo não fica (visto no
   * teste do dono no navegador).
   */
  const duas = Object.prototype.hasOwnProperty.call(p2.item.campos, 'titulo2');
  assert.equal(duas ? nova.item.campos.titulo + ' ' + nova.item.campos.titulo2 : nova.item.campos.titulo, 'Pão de queijo R$ 8,90');
  if (duas) assert.ok(nova.item.campos.titulo2, 'a segunda linha ficou vazia');
  assert.equal(nova.label, 'Pão de queijo R$ 8,90');
  for (const k of Object.keys(p2.item.campos)) if (k !== 'titulo' && k !== 'titulo2') assert.deepEqual(nova.item.campos[k], p2.item.campos[k], k + ' mudou junto');
  assert.equal(nova.item.html, p2.item.html, 'o desenho foi refeito');
  // As outras peças nem foram tocadas.
  A.numerar(c.resultado).forEach((x, i) => { if (i !== 1) assert.deepEqual(A.numerar(feito.resultado)[i].peca, x.peca); });
  assert.ok(feito.resultado.anterior, 'sem Desfazer');
});

test('sem IA: pedido ambíguo vira pergunta, e a resposta completa o pedido', async (t) => {
  const c = await campanha(t);
  const r1 = Ed.semIA('troca a foto', [], c.resultado);
  assert.equal(r1.acao, 'perguntar');
  assert.deepEqual(r1.mudancas, []);
  assert.ok(r1.sugestoes.includes('A peça 2'));
  const hist = [{ papel: 'pessoa', texto: 'troca a foto' }, { papel: 'ia', texto: r1.resposta, pendente: r1.pendente }];
  const r2 = Ed.semIA('A peça 2', hist, c.resultado);
  assert.equal(r2.acao, 'fazer');
  assert.deepEqual(r2.mudancas, [{ tipo: 'refazer', peca: 2, texto: '', foto: 'trocar', descricaoFoto: '' }]);
  // "A peça 2" sem pergunta antes não faz nada sozinha.
  assert.notEqual(Ed.semIA('A peça 2', [], c.resultado).acao, 'fazer');
  // O que dá para fazer direto, faz.
  assert.equal(Ed.semIA('tira o facebook', [], c.resultado).acao, 'fazer');
  // "muda o texto de baixo para: …": com várias peças, pergunta qual; "2" completa — só aquele texto.
  const t1 = Ed.semIA('muda o texto de baixo para: Sexta fechamos às 14h', [], c.resultado);
  assert.equal(t1.acao, 'perguntar');
  const t2 = Ed.semIA('2', [{ papel: 'ia', texto: t1.resposta, pendente: t1.pendente }], c.resultado);
  assert.equal(t2.acao, 'fazer');
  assert.equal(t2.mudancas[0].tipo, 'texto');
  assert.equal(t2.mudancas[0].peca, 2);
  assert.equal(t2.mudancas[0].valor, 'Sexta fechamos às 14h');
  // Pedido novo com número, depois de uma pergunta, não é a resposta dela.
  assert.deepEqual(Ed.semIA('tira a peça 5', [{ papel: 'ia', texto: r1.resposta, pendente: r1.pendente }], c.resultado).mudancas, [{ tipo: 'tirar', peca: 5 }]);
});

test('sem IA: "muda o texto da peça 2" conversa até entender — qual texto, qual peça, o que escrever', async (t) => {
  const c = await campanha(t);
  const passo = (texto, ant) => Ed.semIA(texto, ant ? [{ papel: 'ia', texto: ant.resposta, pendente: ant.pendente }] : [], c.resultado);
  // Visto no teste do dono: antes, a resposta era uma lista de exemplos.
  const q1 = passo('muda o texto da peça 2');
  assert.equal(q1.acao, 'perguntar');
  assert.equal(q1.resposta, 'Qual texto da peça 2: o título ou o de baixo?');
  assert.deepEqual(q1.sugestoes, ['O título', 'O texto de baixo']);
  const q2 = passo('O título', q1);
  assert.equal(q2.resposta, 'O que eu escrevo no título da peça 2?');
  const feito = passo('Óculos com 30% só até sábado', q2);
  assert.equal(feito.acao, 'fazer');
  assert.deepEqual(feito.mudancas.map((m) => [m.tipo, m.peca, m.valor]), [['texto', 2, 'Óculos com 30% só até sábado']]);
  // Sem a peça: pergunta qual, depois o texto.
  const p1 = passo('troca o título');
  assert.equal(p1.resposta, 'Em qual peça?');
  const p2 = passo('A peça 3', p1);
  assert.equal(p2.resposta, 'O que eu escrevo no título da peça 3?');
  // No meio da conversa, um pedido novo não vira o texto da peça.
  assert.deepEqual(passo('tira a peça 5', q2).mudancas, [{ tipo: 'tirar', peca: 5 }]);
  // Com o texto junto, faz direto como antes.
  assert.equal(passo('muda o título da peça 2 para: Leve 3, pague 2').acao, 'fazer');
});


test('com IA: ela lê as peças com os textos e o combinado; "fazer" sem mudança que existe vira pergunta', async (t) => {
  const c = await campanha(t);
  const modo = ai.mode;
  const llm = ai.callLLM;
  const prompts = [];
  let resposta = {};
  ai.mode = () => 'gemini';
  ai.callLLM = async (s, u) => { prompts.push({ s, u }); return JSON.stringify(resposta); };
  try {
    resposta = { acao: 'fazer', resposta: 'Pronto.', mudancas: [{ tipo: 'texto', peca: 2, campo: 'titulo', valor: 'Por R$ 8,90' }], decisoes: ['Preço: R$ 8,90'] };
    const mensagens = [{ papel: 'pessoa', texto: 'muda o preço da peça 2 para 8,90' }];
    let out = await Ed.conversar({ texto: mensagens[0].texto, mensagens, decisoes: ['Sem foto de gente'], campanha: c });
    assert.equal(out.acao, 'fazer');
    assert.deepEqual(out.mudancas.map((m) => m.tipo), ['texto']);
    assert.deepEqual(out.decisoes, ['Sem foto de gente', 'Preço: R$ 8,90']);
    const u = prompts[0].u;
    assert.match(u, /- peça 2: TV 1, principal, [^\n]*titulo: "/, 'a IA não viu os textos da peça');
    assert.match(u, /O QUE JÁ FOI DECIDIDO[^\n]*\n- Sem foto de gente/);
    assert.match(prompts[0].s, /NÃO chute: pergunte UMA coisa/);
    // A IA diz que fez, mas aponta para peça que não existe: nunca diz que fez o que não fez.
    resposta = { acao: 'fazer', resposta: 'Feito!', mudancas: [{ tipo: 'tirar', peca: 99 }] };
    out = await Ed.conversar({ texto: 'tira a peça 99', mensagens: [{ papel: 'pessoa', texto: 'tira a peça 99' }], decisoes: [], campanha: c });
    assert.equal(out.acao, 'perguntar');
    assert.deepEqual(out.mudancas, []);
  } finally { ai.mode = modo; ai.callLLM = llm; }
});

test('o painel: a conversa ao lado das peças, com histórico, sugestões e desfazer', () => {
  const R = ler('web/src/components/criar/ResultadoCampanha.jsx');
  assert.doesNotMatch(R, /function Ajustar\(/, 'a caixa de uma frase voltou');
  // O pedido vindo do assistente do Criar ("muda a campanha X") chega escrito (24/10).
  assert.match(R, /<EditarComIA campanha=\{campanha\} onMudou=\{onMudou\} textoInicial=\{pedidoInicial\} \/>/);
  assert.match(ler('web/src/components/criar/EditarComIA.jsx'), /useState\(textoInicial \|\| ''\)/);
  assert.match(R, /lg:grid lg:grid-cols-\[minmax\(0,1fr\)_22rem\]/);
  const C = ler('web/src/components/criar/EditarComIA.jsx');
  assert.match(C, /criar\.edicao\(campanha\.id\)/, 'abrir não mostra o que já foi pedido');
  assert.match(C, /const r = await criar\.editarComIA\(campanha\.id, frase, setEtapa\);/);
  assert.match(C, /ultimaIa\.sugestoes\.map\(\(s\) => \(/);
  assert.match(C, /criar\.desfazer\(campanha\.id\)/);
  assert.match(ler('server.js'), /editar: 'ajuste',/, 'a edição passou sem medição de IA');
});

/* ---------------- servidor de verdade (modo demonstração) ---------------- */

const PORTA = 7900 + Math.floor(Math.random() * 90);
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
  for (let i = 0; i < 120; i++) {
    const s = (await pedir('/api/ai/job/' + id, { cookie })).json;
    if (s && s.estado === 'pronto') return s.resultado;
    if (s && s.estado === 'erro') throw new Error(s.erro);
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error('o trabalho não terminou');
}

test('a rota: pergunta, faz, guarda a conversa da campanha (fora da lista do Criar) e é presa à conta', async (t) => {
  const dados = fs.mkdtempSync(path.join(os.tmpdir(), 'mt-d50-'));
  const env = { ...process.env, PORT: String(PORTA), STORAGE: 'local', SKIP_VERIFY: '1', DATABASE_URL: '', DATA_DIR: dados, MEDIA_DIR: dados, AI_PROVIDER: 'dev', MT_APK_REPO: 'desligado' };
  const servidor = spawn(process.execPath, ['server.js'], { cwd: RAIZ, stdio: 'ignore', env });
  t.after(() => { servidor.kill(); try { fs.rmSync(dados, { recursive: true, force: true }); } catch (e) { /* o Windows segura o arquivo */ } });
  let ok = false;
  for (let i = 0; i < 160 && !ok; i++) { try { await pedir('/tv'); ok = true; } catch (e) { await new Promise((r) => setTimeout(r, 250)); } }
  assert.ok(ok, 'o servidor de teste não subiu');
  const conta = async (nome) => (await pedir('/api/auth/signup', { method: 'POST', json: { email: nome + Date.now() + Math.random().toString(36).slice(2, 6) + '@teste.local', password: 'senha-de-teste-123', name: nome, aceite: true } }))
    .cookies.map((x) => x.split(';')[0]).filter((x) => !x.endsWith('=')).join('; ');
  const c = await conta('Padaria');
  const outra = await conta('Outra');
  // Uma campanha de verdade, pela conversa e pela geração.
  const conv = (await pedir('/api/ai/conversa', { method: 'POST', cookie: c, json: { texto: 'Quero divulgar o pão de queijo por R$ 9,90' } })).json.conversa;
  const esc = Object.assign({}, ESCOPO, { imagens: 'nenhuma' });
  assert.equal((await pedir('/api/conversas/esboco', { method: 'POST', cookie: c, json: { id: conv.id, escopo: esc } })).status, 200);
  const ger = (await pedir('/api/ai/ecossistema', { method: 'POST', cookie: c, json: { conversaId: conv.id, escopo: esc } })).json;
  const camp = (await esperarJob(ger.id, c)).campanha;
  assert.ok(camp && camp.id, 'a campanha não saiu');

  assert.deepEqual((await pedir('/api/campanhas/' + camp.id + '/edicao', { cookie: c })).json, { conversa: null });
  // Ambíguo: pergunta, e nada muda.
  const j1 = (await pedir('/api/ai/editar', { method: 'POST', cookie: c, json: { campanhaId: camp.id, texto: 'troca a foto' } })).json;
  const r1 = await esperarJob(j1.id, c);
  assert.equal(r1.acao, 'perguntar');
  assert.deepEqual(r1.campanha.resultado.telas, camp.resultado.telas, 'mudou sem entender');
  // Uma mudança clara: faz, só ela.
  const j2 = (await pedir('/api/ai/editar', { method: 'POST', cookie: c, json: { campanhaId: camp.id, texto: 'tira a peça 5' } })).json;
  const r2 = await esperarJob(j2.id, c);
  assert.equal(r2.acao, 'fazer');
  assert.equal(r2.campanha.resultado.contagem.pecas, camp.resultado.contagem.pecas - 1);
  // A conversa ficou guardada, com o combinado da conversa que criou a campanha.
  const ed = (await pedir('/api/campanhas/' + camp.id + '/edicao', { cookie: c })).json.conversa;
  assert.equal(ed.mensagens.length, 4);
  assert.deepEqual(ed.decisoes, ['Preço: R$ 9,90'], 'a edição não herdou o combinado');
  assert.ok(ed.mensagens[3].feito && ed.mensagens[3].feito.length, 'a mensagem não diz o que foi feito');
  // A lista do Criar não mostra a conversa de edição.
  const lista = (await pedir('/api/conversas', { cookie: c })).json.conversas;
  assert.ok(!lista.some((x) => x.id === ed.id), 'a conversa de edição apareceu no Criar');
  // De outra conta: nada.
  assert.equal((await pedir('/api/campanhas/' + camp.id + '/edicao', { cookie: outra })).status, 404);
  const j3 = await pedir('/api/ai/editar', { method: 'POST', cookie: outra, json: { campanhaId: camp.id, texto: 'tira a peça 1' } });
  assert.equal(j3.status, 404);
});
