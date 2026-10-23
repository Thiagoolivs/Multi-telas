/*
 * A conversa do Criar não regride (EXECUTOR D48).
 *
 * O dono, em 23/10: "o chat se perde nos pedidos e na maioria das vezes
 * regride, acho que é necessário armazenar contexto". Dois buracos:
 *   - a IA lia só as 16 últimas mensagens, e o que não cabe no escopo (o
 *     preço, a frase exata, "sem foto de gente") sumia depois disso;
 *   - a IA devolvia o escopo INTEIRO a cada volta, e o que ela esquecia de
 *     repetir voltava ao padrão.
 * Agora a conversa guarda as DECISÕES (vão à IA em toda volta e ao gerador)
 * e o escopo da IA entra como MUDANÇA sobre o atual.
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ler = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8').replace(/\r\n/g, '\n');
const C = require('../server/ai-conversa');
const E = require('../js/escopo.js');
const ai = require('../server/ai');

test('o escopo da IA entra por cima: o que ela não repetiu fica; vazio explícito tira; texto vazio não apaga', () => {
  const atual = E.normalizar(Object.assign(E.padrao(), { nome: 'Pão de queijo', objetivo: 'vender à tarde', imagens: 'minhas' }));
  atual.telas[0].alvo = { tipo: 'tela', id: 'tv1' };
  atual.telas[0].zonas.principal.pecas = 3;
  atual.telas[0].zonas.principal.pedido = 'pão de queijo quentinho';
  // Só o nome mudou: todo o resto fica.
  let r = C.mesclarEscopo(atual, { nome: 'Pão de queijo da tarde' });
  assert.equal(r.nome, 'Pão de queijo da tarde');
  assert.deepEqual([r.objetivo, r.imagens, r.telas[0].alvo.id, r.telas[0].zonas.principal.pecas], ['vender à tarde', 'minhas', 'tv1', 3]);
  // A IA que "não sabe" o objetivo manda vazio: não apaga.
  r = C.mesclarEscopo(atual, { objetivo: '', publico: '   ' });
  assert.equal(r.objetivo, 'vender à tarde');
  // Mudar só a lateral não reseta a principal.
  r = C.mesclarEscopo(atual, { telas: [{ zonas: { lateral: { pecas: 1, pedido: 'preço' } } }] });
  assert.deepEqual([r.telas[0].zonas.principal.pecas, r.telas[0].zonas.principal.pedido, r.telas[0].zonas.lateral.pecas], [3, 'pão de queijo quentinho', 1]);
  // Vazio explícito tira.
  r = C.mesclarEscopo(Object.assign({}, atual, { horarios: [{ faixa: 'tarde', foco: 'lanche' }] }), { horarios: [], telas: [{ zonas: { principal: { pecas: 0 } } }] });
  assert.deepEqual([r.horarios.length, r.telas[0].zonas.principal.pecas], [0, 0]);
  // Lixo não derruba.
  assert.deepEqual(C.mesclarEscopo(atual, null), E.normalizar(atual));
  assert.deepEqual(C.mesclarEscopo(atual, 'texto'), E.normalizar(atual));
});

test('as decisões: só acrescenta e esquece (nunca reescreve), sem repetir, com teto e sem controle', () => {
  let d = C.mesclarDecisoes([], ['Preço: R$ 9,90', 'Sem foto de gente'], []);
  d = C.mesclarDecisoes(d, ['sem foto de gente', 'Só a TV da recepção'], []);
  assert.deepEqual(d, ['Preço: R$ 9,90', 'Sem foto de gente', 'Só a TV da recepção']);
  d = C.mesclarDecisoes(d, ['Preço: R$ 8,90'], ['preço: r$ 9,90']);
  assert.deepEqual(d, ['Sem foto de gente', 'Só a TV da recepção', 'Preço: R$ 8,90']);
  assert.equal(C.mesclarDecisoes([], Array.from({ length: 40 }, (_, i) => 'decisão ' + i), []).length, C.MAX_DECISOES);
  // Teto de letras (nota do consultor no #280): as mais antigas saem.
  const longas = C.mesclarDecisoes([], Array.from({ length: 20 }, (_, i) => i + ' ' + 'x'.repeat(150)), []);
  assert.ok(longas.reduce((s, d) => s + d.length, 0) <= C.TETO_LETRAS_DECISOES);
  assert.match(longas[longas.length - 1], /^19 /, 'a mais nova saiu');
  assert.equal(C.mesclarDecisoes([], ['a\u0000b' + 'x'.repeat(300)], [])[0].length, 160);
  assert.match(C.textoDasDecisoes([]), /\(nada ainda\)/);
});

test('30 voltas com a IA: a decisão da 2ª volta vale na 30ª, no prompt e no escopo', async () => {
  const modoAntes = ai.mode;
  const llmAntes = ai.callLLM;
  const prompts = [];
  let volta = 0;
  ai.mode = () => 'gemini';
  ai.callLLM = async (sistema, usuario) => {
    volta += 1;
    prompts.push(usuario);
    // 2ª volta: a pessoa decide o preço e "só as minhas fotos"; depois, a IA só mexe no nome.
    if (volta === 2) return JSON.stringify({ tipo: 'campanha', resposta: 'Anotado.', escopo: { imagens: 'minhas', telas: [{ alvo: { tipo: 'tela', id: 'tv1' } }] }, decisoes: ['Preço: R$ 9,90'] });
    return JSON.stringify({ tipo: 'campanha', resposta: 'Certo.', escopo: { nome: 'Promo ' + volta } });
  };
  try {
    let escopo = E.padrao();
    let decisoes = [];
    const mensagens = [];
    const ctx = { telas: [{ id: 'tv1', nome: 'Recepção' }] };
    for (let i = 1; i <= 30; i++) {
      mensagens.push({ papel: 'pessoa', texto: i === 2 ? 'o pão de queijo é R$ 9,90 e use só as minhas fotos' : 'muda o nome, volta ' + i });
      const out = await C.conversar({ mensagens, escopo, decisoes, ctx });
      mensagens.push({ papel: 'ia', texto: out.resposta });
      escopo = out.escopo;
      decisoes = out.decisoes;
    }
    assert.deepEqual(decisoes, ['Preço: R$ 9,90'], 'a decisão sumiu');
    assert.match(prompts[29], /O QUE JÁ FOI DECIDIDO[^\n]*\n- Preço: R\$ 9,90/, 'a 30ª volta não recebeu a decisão da 2ª');
    assert.ok(!/o pão de queijo é R\$ 9,90/.test(prompts[29].split('CONVERSA:')[1]), 'a mensagem da 2ª volta ainda estava na janela — o teste não provaria nada');
    assert.deepEqual([escopo.imagens, escopo.telas[0].alvo.id, escopo.nome], ['minhas', 'tv1', 'Promo 30'], 'o escopo regrediu');
  } finally {
    ai.mode = modoAntes;
    ai.callLLM = llmAntes;
  }
});

test('o prompt não cresce sem fim: 60 voltas decidindo coisas novas, o tamanho fica estável (nota do consultor no #280)', async () => {
  const modoAntes = ai.mode;
  const llmAntes = ai.callLLM;
  const tamanhos = [];
  let volta = 0;
  ai.mode = () => 'gemini';
  ai.callLLM = async (sistema, usuario) => {
    volta += 1;
    tamanhos.push(usuario.length);
    return JSON.stringify({ tipo: 'campanha', resposta: 'Anotado, volta ' + volta + '.', escopo: {}, decisoes: ['Decisão número ' + volta + ': ' + 'detalhe '.repeat(15)] });
  };
  try {
    let escopo = E.padrao();
    let decisoes = [];
    const mensagens = [];
    for (let i = 1; i <= 60; i++) {
      mensagens.push({ papel: 'pessoa', texto: 'mais um detalhe, volta ' + i });
      const out = await C.conversar({ mensagens, escopo, decisoes, ctx: {} });
      mensagens.push({ papel: 'ia', texto: out.resposta });
      escopo = out.escopo;
      decisoes = out.decisoes;
    }
    assert.ok(decisoes.reduce((s, d) => s + d.length, 0) <= C.TETO_LETRAS_DECISOES, 'as decisões passaram do teto');
    const fim = tamanhos.slice(-15);
    assert.ok(Math.max(...fim) - Math.min(...fim) < 300, 'o prompt continuou crescendo: ' + fim.join(', '));
    assert.ok(tamanhos[59] < tamanhos[20] + 400, 'a volta 60 ficou muito maior que a 20');
  } finally {
    ai.mode = modoAntes;
    ai.callLLM = llmAntes;
  }
});

test('a rota guarda as decisões, a pessoa corrige no cartão, e o gerador recebe o combinado', () => {
  const R = ler('server/routes/conversas.js');
  assert.match(R, /conversa\.conversar\(\{ mensagens, escopo, decisoes: \(atual && atual\.decisoes\) \|\| \[\], ctx: c \}\)/);
  assert.match(R, /decisoes: out\.decisoes \|\| \(atual && atual\.decisoes\) \|\| \[\],/);
  assert.match(R, /const decisoes = conversa\.mesclarDecisoes\(b\.decisoes, \[\], \[\]\);/);
  assert.match(ler('server/routes/campanhas.js'), /if \(conv && Array\.isArray\(conv\.decisoes\)\) ctxConta\.combinado = conv\.decisoes;/);
  assert.match(ler('server/ecossistema.js'), /O QUE O CLIENTE COMBINOU NA CONVERSA/);
  for (const f of ['server/db-sqlite.js', 'server/db-postgres.js']) assert.match(ler(f), /decisoes/, f + ' sem a coluna');
  const P = ler('web/src/pages/CriarPage.jsx');
  assert.match(P, /<Combinado decisoes=\{decisoes\} onTirar=\{criada \? null : tirarDecisao\} \/>/);
  assert.equal(C.JANELA, 30);
});

/* ---------------- servidor de verdade (modo demonstração) ---------------- */

const os = require('node:os');
const http = require('node:http');
const { spawn } = require('node:child_process');
const PORTA = 7800 + Math.floor(Math.random() * 90);
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

test('a rota: a decisão fica salva entre as voltas, e a pessoa tira no cartão', async (t) => {
  const dados = fs.mkdtempSync(path.join(os.tmpdir(), 'mt-d48-'));
  const env = { ...process.env, PORT: String(PORTA), STORAGE: 'local', SKIP_VERIFY: '1', DATABASE_URL: '', DATA_DIR: dados, MEDIA_DIR: dados, AI_PROVIDER: 'dev', MT_APK_REPO: 'desligado' };
  const servidor = spawn(process.execPath, ['server.js'], { cwd: path.join(__dirname, '..'), stdio: 'ignore', env });
  t.after(() => { servidor.kill(); try { fs.rmSync(dados, { recursive: true, force: true }); } catch (e) { /* o Windows segura o arquivo */ } });
  let ok = false;
  for (let i = 0; i < 80 && !ok; i++) { try { await pedir('/tv'); ok = true; } catch (e) { await new Promise((r) => setTimeout(r, 250)); } }
  assert.ok(ok, 'o servidor de teste não subiu');
  const c = (await pedir('/api/auth/signup', { method: 'POST', json: { email: 'd48' + Date.now() + '@teste.local', password: 'senha-de-teste-123', name: 'Padaria', aceite: true } }))
    .cookies.map((x) => x.split(';')[0]).filter((x) => !x.endsWith('=')).join('; ');
  const a = (await pedir('/api/ai/conversa', { method: 'POST', cookie: c, json: { texto: 'Quero divulgar o pão de queijo por R$ 9,90' } })).json;
  assert.deepEqual(a.conversa.decisoes, ['Preço: R$ 9,90']);
  const b = (await pedir('/api/ai/conversa', { method: 'POST', cookie: c, json: { id: a.conversa.id, texto: 'Use as minhas fotos' } })).json;
  assert.deepEqual(b.conversa.decisoes, ['Preço: R$ 9,90', 'Fotos: só as da empresa'], 'a decisão da volta anterior sumiu');
  const d = (await pedir('/api/ai/conversa', { method: 'POST', cookie: c, json: { id: a.conversa.id, texto: 'como ligo a TV?' } })).json;
  assert.equal(d.conversa.decisoes.length, 2, 'uma dúvida mexeu no combinado');
  const tirou = await pedir('/api/conversas/' + a.conversa.id, { method: 'PUT', cookie: c, json: { decisoes: ['Fotos: só as da empresa'] } });
  assert.deepEqual(tirou.json.conversa.decisoes, ['Fotos: só as da empresa']);
  // O escopo e as mensagens continuam.
  assert.equal(tirou.json.conversa.mensagens.length, d.conversa.mensagens.length);
});
