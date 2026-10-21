/*
 * Ajustar depois (docs/EXECUTOR.md, item 26).
 *
 * "Troca a foto da peça 2", "mais uma peça na lateral", "tira o Facebook". A
 * regra que estes testes seguram é de dinheiro: SÓ O QUE MUDOU É REFEITO (e
 * só a foto nova é cobrada). Mais: o pedido da IA passa pela peneira, a peça
 * editada à mão passa pela porta da TV, e "Desfazer" volta um passo.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const http = require('node:http');
const path = require('node:path');
const { spawn } = require('node:child_process');
const P = require('../js/peca-html.js');
const ai = require('../server/ai.js');
const eco = require('../server/ecossistema.js');
const A = require('../server/ajuste.js');

const RAIZ = path.join(__dirname, '..');
const ESCOPO = {
  nome: 'Semana do pão de queijo', objetivo: 'vender mais à tarde', imagens: 'gerar',
  telas: [{ alvo: { tipo: 'todas' }, zonas: { principal: { pecas: 2 }, lateral: { pecas: 1 }, cabecalho: { pecas: 1 }, rodape: { pecas: 1, mensagens: ['Aceitamos Pix'] } } }],
  redes: { instagramPost: true, facebook: true },
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

test('a numeração é a do painel: por TV, cabeçalho, principal, lateral, rodapé', async (t) => {
  const c = await campanha(t);
  assert.deepEqual(A.numerar(c.resultado).map((x) => x.n + ':' + x.zona), ['1:cabecalho', '2:principal', '3:principal', '4:lateral', '5:rodape']);
  const painel = fs.readFileSync(path.join(RAIZ, 'web/src/components/criar/ResultadoCampanha.jsx'), 'utf8');
  assert.match(painel, /for \(const lista of \[t\.zonas\.cabecalho\.pecas, t\.zonas\.principal, t\.zonas\.lateral, t\.zonas\.rodape\.pecas\]\)/, 'o painel numera na mesma ordem');
});

test('a peneira: só vira mudança o que aponta para o que existe', async (t) => {
  const c = await campanha(t);
  const m = A.lerMudancas([
    { tipo: 'refazer', peca: 2, foto: 'trocar', descricaoFoto: 'cesta de pão de queijo' },
    { tipo: 'refazer', peca: 99 }, { tipo: 'tirar', peca: 0 }, { tipo: 'apagar-tudo' },
    { tipo: 'acrescentar', tela: 1, zona: 'lateral', quantidade: 40 }, { tipo: 'acrescentar', tela: 7, zona: 'lateral' },
    { tipo: 'redes', canal: 'tiktok', ligado: true }, { tipo: 'redes', canal: 'facebook', ligado: 'sim' },
    { tipo: 'contagem', tela: 1, ate: 'sábado' },
  ], c.resultado);
  assert.deepEqual(m, [
    { tipo: 'refazer', peca: 2, texto: '', foto: 'trocar', descricaoFoto: 'cesta de pão de queijo' },
    { tipo: 'acrescentar', tela: 0, zona: 'lateral', quantidade: 3, pedido: '' },
    { tipo: 'redes', canal: 'facebook', ligado: false },
    { tipo: 'contagem', tela: 0, ate: '' },
  ]);
});

test('sem IA, as frases comuns funcionam', async (t) => {
  const c = await campanha(t);
  const r = A.semIA('Troca a foto da peça 2, mais uma peça na lateral e tira o Facebook', c.resultado);
  assert.deepEqual(r.mudancas.map((x) => x.tipo), ['refazer', 'acrescentar', 'redes']);
  assert.equal(r.mudancas[0].foto, 'trocar');
  assert.match(r.resposta, /^Feito: foto nova na peça 2; mais uma peça em lateral; tirar post do Facebook\.$/);
  assert.deepEqual(A.semIA('põe o google', c.resultado).mudancas, [{ tipo: 'redes', canal: 'google', ligado: true }]);
  assert.deepEqual(A.semIA('deixa mais bonito', c.resultado).mudancas, [], 'o que não dá para fazer, não vira mudança');
});

test('trocar uma foto refaz SÓ aquela peça, e cobra uma foto só', async (t) => {
  const c = await campanha(t);
  const antes = A.numerar(c.resultado);
  let fotos = 0;
  const r = await A.aplicar(c, [{ tipo: 'refazer', peca: 2, foto: 'trocar', descricaoFoto: 'cesta' }], {}, { onImagem: async () => { fotos++; return '/media/t/nova.png'; } });
  assert.equal(fotos, 1);
  assert.equal(r.refeitas, 1);
  const depois = A.numerar(r.resultado);
  assert.equal(depois[1].peca.item.campos.foto, '/media/t/nova.png');
  for (const i of [0, 2, 3, 4]) assert.deepEqual(depois[i].peca, antes[i].peca, 'a peça ' + (i + 1) + ' não podia mudar');
  assert.equal(depois[1].peca.vaga, antes[1].peca.vaga, 'a peça é a mesma, com a foto nova');
  assert.equal(r.resultado.contagem.fotosGeradas, c.resultado.contagem.fotosGeradas + 1);
  assert.deepEqual(P.validarItem(depois[1].peca.item).problemas, []);
  assert.deepEqual(r.resultado.anterior.resultado.telas, c.resultado.telas, 'o de antes fica guardado para desfazer');
});

test('acrescentar, tirar, redes, letreiro e contagem mexem no resultado e no escopo juntos', async (t) => {
  const c = await campanha(t);
  let fotos = 0;
  const r = await A.aplicar(c, [
    { tipo: 'acrescentar', tela: 0, zona: 'lateral', quantidade: 1, pedido: 'preço do combo' },
    { tipo: 'tirar', peca: 3 },
    { tipo: 'redes', canal: 'facebook', ligado: false },
    { tipo: 'letreiro', tela: 0, mensagens: ['Pão de queijo em dobro das 15h às 17h'] },
    { tipo: 'contagem', tela: 0, ate: '2026-10-27T18:00' },
  ], {}, { onImagem: async () => { fotos++; return '/media/t/x.png'; } });
  const z = r.resultado.telas[0].zonas;
  assert.equal(z.lateral.length, 2);
  assert.equal(r.escopo.telas[0].zonas.lateral.pecas, 2);
  assert.equal(z.principal.length, 1, 'a peça 3 saiu');
  assert.equal(r.escopo.telas[0].zonas.principal.pecas, 1);
  assert.equal(fotos, 1, 'só a peça nova da lateral pediu foto');
  assert.deepEqual(P.validarItem(z.lateral[1].item).problemas, []);
  assert.deepEqual(r.resultado.social.canais, ['instagramPost']);
  assert.equal(r.escopo.redes.facebook, false);
  assert.deepEqual(z.rodape.mensagens, ['Pão de queijo em dobro das 15h às 17h']);
  assert.equal(z.rodape.contagem, '2026-10-27T18:00');
  assert.equal(r.escopo.telas[0].zonas.rodape.contagem, '2026-10-27T18:00');
  // Tirar as redes todas desliga o bloco; ligar de novo escreve os textos.
  const sem = await A.aplicar({ ...c, resultado: r.resultado, escopo: r.escopo }, [{ tipo: 'redes', canal: 'instagramPost', ligado: false }], {});
  assert.equal(sem.resultado.social, null);
  const com = await A.aplicar({ ...c, resultado: sem.resultado, escopo: sem.escopo }, [{ tipo: 'redes', canal: 'whatsappMensagem', ligado: true }], {});
  assert.deepEqual(com.resultado.social.canais, ['whatsappMensagem']);
  assert.ok(com.resultado.social.textos && com.resultado.social.textos.whatsapp);
});

test('desfazer volta um passo, e só um', async (t) => {
  const c = await campanha(t);
  const r = await A.aplicar(c, [{ tipo: 'tirar', peca: 2 }], {});
  const volta = A.desfazer({ ...c, resultado: r.resultado, escopo: r.escopo });
  assert.deepEqual(volta.resultado.telas, c.resultado.telas);
  assert.equal(volta.resultado.anterior, undefined, 'o passo guardado não guarda outro dentro');
  assert.equal(A.desfazer(c), null, 'sem ajuste, nada a desfazer');
});

test('com IA: o pedido e a lista numerada vão juntos, e a resposta passa pela peneira', async (t) => {
  const c = await campanha(t);
  const antes = { provedor: process.env.AI_PROVIDER, chamar: ai.callLLM };
  process.env.AI_PROVIDER = 'anthropic';
  let pedido = '';
  ai.callLLM = async (sistema, u) => { pedido = u; return JSON.stringify({ resposta: 'Troco a foto da peça 2.', mudancas: [{ tipo: 'refazer', peca: 2, foto: 'trocar' }, { tipo: 'tirar', peca: 50 }] }); };
  t.after(() => { ai.callLLM = antes.chamar; process.env.AI_PROVIDER = antes.provedor === undefined ? 'dev' : antes.provedor; });
  const r = await A.entender('a foto da segunda está feia', c);
  assert.match(pedido, /- peça 2: TV 1, principal, ".+", com foto/);
  assert.match(pedido, /PEDIDO DO CLIENTE: a foto da segunda está feia/);
  assert.equal(r.resposta, 'Troco a foto da peça 2.');
  assert.deepEqual(r.mudancas.map((x) => x.tipo + x.peca), ['refazer2']);
});

/* ---------- de ponta a ponta ---------- */

const PORTA = 4200 + Math.floor(Math.random() * 9);
function pedir(caminho, o = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port: PORTA, path: caminho, method: o.method || 'GET',
      headers: { ...(o.body ? { 'Content-Type': 'application/json' } : {}), ...(o.cookie ? { Cookie: o.cookie } : {}) } }, (res) => {
      let corpo = '';
      res.on('data', (c) => { corpo += c; });
      res.on('end', () => {
        let json = null; try { json = JSON.parse(corpo); } catch (e) { json = null; }
        resolve({ status: res.statusCode, json, cookies: [].concat(res.headers['set-cookie'] || []) });
      });
    });
    req.on('error', reject);
    req.setTimeout(15000, () => req.destroy(new Error('a rota ' + caminho + ' não respondeu')));
    if (o.body) req.write(JSON.stringify(o.body));
    req.end();
  });
}
const cookieDe = (r) => r.cookies.map((c) => c.split(';')[0]).filter((c) => !c.endsWith('=')).join('; ');
async function esperarJob(id, cookie) {
  for (let i = 0; i < 120; i++) {
    const j = (await pedir('/api/ai/job/' + id, { cookie })).json;
    if (j.estado === 'pronto' || j.estado === 'erro') return j;
    await new Promise((r) => setTimeout(r, 250));
  }
  return null;
}

test('rotas: ajustar, editar à mão e desfazer, presos à conta', async (t) => {
  const dados = fs.mkdtempSync(path.join(os.tmpdir(), 'mt-ajuste-'));
  const servidor = spawn(process.execPath, ['server.js'], {
    cwd: RAIZ, stdio: 'ignore',
    env: { ...process.env, PORT: String(PORTA), STORAGE: 'local', SKIP_VERIFY: '1', DATABASE_URL: '', DATA_DIR: dados, AI_PROVIDER: 'dev' },
  });
  t.after(() => { servidor.kill(); try { fs.rmSync(dados, { recursive: true, force: true }); } catch (e) { /* o Windows segura o arquivo */ } });
  let ok = false;
  for (let i = 0; i < 60 && !ok; i++) { try { await pedir('/tv'); ok = true; } catch (e) { await new Promise((r) => setTimeout(r, 250)); } }
  assert.ok(ok, 'o servidor de teste não subiu');
  const marca = Date.now();
  const conta = (email, name) => pedir('/api/auth/signup', { method: 'POST', body: { email, password: 'senha-de-teste-123', name, aceite: true } });
  const cA = cookieDe(await conta('ajuste-a' + marca + '@teste.local', 'Padaria A'));
  const cB = cookieDe(await conta('ajuste-b' + marca + '@teste.local', 'Ótica B'));

  const gerou = await esperarJob((await pedir('/api/ai/ecossistema', { method: 'POST', cookie: cA, body: { escopo: ESCOPO } })).json.id, cA);
  const c = gerou.resultado.campanha;
  const antes = A.numerar(c.resultado);

  assert.equal((await pedir('/api/ai/ajustar', { method: 'POST', cookie: cB, body: { campanhaId: c.id, texto: 'tira a peça 2' } })).status, 404, 'outra conta não ajusta');
  const j = await esperarJob((await pedir('/api/ai/ajustar', { method: 'POST', cookie: cA, body: { campanhaId: c.id, texto: 'troca a foto da peça 2' } })).json.id, cA);
  assert.equal(j.estado, 'pronto', j.erro);
  assert.deepEqual(j.resultado.mudancas.map((x) => x.tipo), ['refazer']);
  const ajustada = (await pedir('/api/campanhas/' + c.id, { cookie: cA })).json.campanha;
  const depois = A.numerar(ajustada.resultado);
  assert.notEqual(depois[1].peca.item.campos.foto, antes[1].peca.item.campos.foto, 'a peça 2 ganhou foto nova');
  assert.deepEqual(depois[0].peca, antes[0].peca);
  assert.ok(ajustada.resultado.anterior, 'o passo de antes ficou guardado');

  // Editar à mão: a peça passa pela porta da TV.
  const p3 = depois[2].peca;
  const ruim = { ...p3.item, html: '<section class="mt-peca"><script>alert(1)</script></section>' };
  assert.equal((await pedir('/api/campanhas/' + c.id + '/peca', { method: 'PUT', cookie: cA, body: { vaga: p3.vaga, item: ruim } })).status, 400);
  const novo = { ...p3.item, campos: { ...p3.item.campos, titulo: 'Pão de queijo quentinho' } };
  const ed = await pedir('/api/campanhas/' + c.id + '/peca', { method: 'PUT', cookie: cA, body: { vaga: p3.vaga, item: novo } });
  assert.equal(ed.status, 200, JSON.stringify(ed.json));
  assert.equal(A.numerar(ed.json.campanha.resultado)[2].peca.item.campos.titulo, 'Pão de queijo quentinho');
  assert.equal((await pedir('/api/campanhas/' + c.id + '/peca', { method: 'PUT', cookie: cB, body: { vaga: p3.vaga, item: novo } })).status, 404);

  // Desfazer volta a edição à mão; de novo, volta nada (um passo só).
  const d1 = await pedir('/api/campanhas/' + c.id + '/desfazer', { method: 'POST', cookie: cA });
  assert.equal(d1.status, 200);
  assert.deepEqual(A.numerar(d1.json.campanha.resultado)[2].peca.item, depois[2].peca.item);
  assert.equal((await pedir('/api/campanhas/' + c.id + '/desfazer', { method: 'POST', cookie: cA })).status, 409);
});
