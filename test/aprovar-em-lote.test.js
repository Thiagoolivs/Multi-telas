/*
 * Aprovar selecionados (reteste 4, 22/11).
 *
 * O dono recebe a lista do que está pronto para aprovar
 * (docs/qa-total/galeria-para-aprovar/) e, na galeria da Plataforma, só
 * havia o "Aprovar" de cada cartão: dezenas de toques e de pedidos. Agora
 * ele marca os cartões (ou cola a lista) e aprova tudo num pedido só — que
 * confere tudo antes de gravar: com um id errado, nada muda.
 */
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
const C = require('../server/conteudoPronto.js');

test('o lote confere cada item antes de gravar, e repetido conta uma vez', () => {
  const m = { pecas: [{ id: 'p1' }, { id: 'p2' }], telas: [{ id: 't1' }] };
  const ok = C.conferirLote(m, [{ tipo: 'tela', id: 't1' }, { tipo: 'peca', id: 'p1' }, { tipo: 'peca', id: 'p1' }], 'aprovada');
  assert.deepEqual(ok.erros, []);
  assert.deepEqual(ok.itens, [{ tipo: 'tela', id: 't1' }, { tipo: 'peca', id: 'p1' }]);
  const ruim = C.conferirLote(m, [{ tipo: 'tela', id: 't1' }, { tipo: 'tela', id: 'nao-existe' }, { tipo: 'marca', id: 'p1' }], 'aprovada');
  assert.equal(ruim.erros.length, 2, 'cada item errado diz o seu motivo');
  assert.match(ruim.erros[0], /^nao-existe: tela não existe/);
  assert.match(C.conferirLote(m, [{ tipo: 'peca', id: 'p1' }], 'publicada').erros[0], /estado desconhecido/);
  assert.deepEqual(C.conferirLote(m, [], 'aprovada').erros, ['nada para decidir']);
  assert.match(C.conferirLote(m, Array.from({ length: C.MAX_DO_LOTE + 1 }, () => ({ tipo: 'peca', id: 'p1' })), 'aprovada').erros[0], /no máximo/);
});

test('marcar por lista: tela:id, peca:id ou o id solto, e o que não existe volta à parte', async () => {
  const { idsDaLista } = await import(pathToFileURL(path.join(RAIZ, 'web/src/lib/marcarPorLista.js')).href);
  const m = { telas: [{ id: 'otica-semana-do-sol' }], pecas: [{ id: 'oferta-foto' }, { id: 'cena-qr' }] };
  const r = idsDaLista('otica-semana-do-sol, peca:oferta-foto\ncena-qr;  inventada tela:oferta-foto', m);
  assert.deepEqual(r.achados, ['tela:otica-semana-do-sol', 'peca:oferta-foto', 'peca:cena-qr']);
  assert.deepEqual(r.sobras, ['inventada', 'tela:oferta-foto'], 'a peça não vira tela porque alguém escreveu "tela:"');
  assert.deepEqual(idsDaLista('', m), { achados: [], sobras: [] });
});

test('a galeria: marcar, marcar todos, marcar por lista e Aprovar selecionados num pedido só', () => {
  const g = ler('web/src/components/platform/ConteudoPronto.jsx');
  assert.match(g, /await plataforma\.decidirConteudoLote\(itens, 'aprovada'\)/);
  assert.match(g, /'Aprovar selecionados \(' \+ marcados\.size \+ '\)'/);
  assert.match(g, /Marcar todos daqui/);
  assert.match(g, />Marcar por lista<\/Button>/);
  // O que já está aprovado não entra na marca.
  assert.match(g, /const marcaveis = itensVistos\.filter\(\(x\) => x\.estado !== 'aprovada'\)/);
  assert.match(ler('web/src/api.js'), /decidirConteudoLote: \(itens, estado\) => api\('POST', '\/api\/plataforma\/conteudo\/lote', \{ itens, estado \}\)/);
  // A rota do lote mora depois da porta do operador, como a de cada cartão.
  const s = ler('server.js');
  const guarda = s.indexOf("if (!quem.pode) return sendJson(res, 404, { error: 'rota não encontrada' });", s.indexOf("if (parts[1] === 'plataforma') {"));
  const lote = s.indexOf("if (req.method === 'POST' && parts[3] === 'lote' && !parts[4]) {");
  assert.ok(guarda > 0 && lote > guarda, 'a rota do lote precisa ficar depois da porta do operador');
});

const PORTA = 8700 + Math.floor(Math.random() * 90);
function pedir(caminho, o = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port: PORTA, path: caminho, method: o.method || 'GET',
      headers: { ...(o.json ? { 'Content-Type': 'application/json' } : {}), ...(o.cookie ? { Cookie: o.cookie } : {}) } }, (res) => {
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

test('servidor: só o operador aprova em lote; tela aprovada leva as peças dela; um id errado não muda nada', async (t) => {
  const dados = fs.mkdtempSync(path.join(os.tmpdir(), 'mt-lote-'));
  const n = Date.now();
  const operador = 'op' + n + '@teste.local';
  const servidor = spawn(process.execPath, ['server.js'], {
    cwd: RAIZ, stdio: 'ignore',
    env: { ...process.env, PORT: String(PORTA), STORAGE: 'local', SKIP_VERIFY: '1', DATABASE_URL: '', DATA_DIR: dados, MEDIA_DIR: dados, AI_PROVIDER: 'dev', TRUST_PROXY: '', RAILWAY_ENVIRONMENT: '', ADMIN_EMAILS: operador },
  });
  t.after(() => { servidor.kill(); try { fs.rmSync(dados, { recursive: true, force: true }); } catch (e) { /* o Windows segura o arquivo */ } });
  let ok = false;
  for (let i = 0; i < 160 && !ok; i++) { try { await pedir('/tv'); ok = true; } catch (e) { await new Promise((r) => setTimeout(r, 250)); } }
  assert.ok(ok, 'o servidor de teste não subiu');

  const cadastro = (email) => pedir('/api/auth/signup', { method: 'POST', json: { email, password: 'senha-de-teste-123', name: 'Pessoa', aceite: true, perfil: 'empresa' } });
  const op = cookieDe(await cadastro(operador));
  const cliente = cookieDe(await cadastro('cliente' + n + '@teste.local'));

  const m = JSON.parse(ler('pecas-ouro/manifesto.json'));
  // Uma tela que espera, com peças que esperam, e uma peça solta que espera.
  const tela = m.telas.find((x) => x.estado !== 'aprovada' && C.pecasDaTela(m, x.id).some((id) => C.esperando((m.pecas.find((p) => p.id === id) || {}).estado)));
  const doLado = C.pecasDaTela(m, tela.id).filter((id) => C.esperando((m.pecas.find((p) => p.id === id) || {}).estado));
  const solta = m.pecas.find((p) => C.esperando(p.estado) && !C.pecasDaTela(m, tela.id).includes(p.id));
  assert.ok(tela && solta && doLado.length);

  const lote = { itens: [{ tipo: 'tela', id: tela.id }, { tipo: 'peca', id: solta.id }], estado: 'aprovada' };
  assert.equal((await pedir('/api/plataforma/conteudo/lote', { method: 'POST', cookie: cliente, json: lote })).status, 404, 'quem não é operador não acha a rota');

  const errado = await pedir('/api/plataforma/conteudo/lote', { method: 'POST', cookie: op, json: { itens: lote.itens.concat({ tipo: 'tela', id: 'nao-existe' }), estado: 'aprovada' } });
  assert.equal(errado.status, 400);
  assert.match(errado.json.error, /nao-existe/);
  const antes = (await pedir('/api/plataforma/conteudo', { cookie: op })).json;
  assert.ok(C.esperando(antes.telas.find((x) => x.id === tela.id).estado), 'com um id errado, nada pode ter sido aprovado');

  const r = await pedir('/api/plataforma/conteudo/lote', { method: 'POST', cookie: op, json: lote });
  assert.equal(r.status, 200);
  assert.equal(r.json.decididos.length, 2);
  assert.deepEqual(r.json.pecas.slice().sort(), doLado.slice().sort(), 'a tela aprovada leva as peças dela que esperavam');
  const depois = (await pedir('/api/plataforma/conteudo', { cookie: op })).json;
  assert.equal(depois.telas.find((x) => x.id === tela.id).estado, 'aprovada');
  assert.equal(depois.pecas.find((x) => x.id === solta.id).estado, 'aprovada');
  for (const id of doLado) assert.equal(depois.pecas.find((x) => x.id === id).estado, 'aprovada', id);
  // O arquivo do manifesto não muda: a decisão mora no banco.
  assert.equal(JSON.parse(ler('pecas-ouro/manifesto.json')).telas.find((x) => x.id === tela.id).estado, tela.estado);
});
