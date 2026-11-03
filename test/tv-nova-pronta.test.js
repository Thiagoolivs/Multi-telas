/*
 * A TV recém-pareada não nasce vazia (QA de 26/10): ficava dizendo "Tudo
 * certo, TV" até alguém publicar. Agora o nome padrão é numerado e o painel
 * põe uma tela pronta do ramo da conta, com a marca.
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const http = require('node:http');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { spawn } = require('node:child_process');

const RAIZ = path.join(__dirname, '..');
const ler = (...p) => fs.readFileSync(path.join(RAIZ, ...p), 'utf8');

/*
 * QA de lançamento, 03/11 (bloqueador B1): sem tela da frente, a TV caía na
 * primeira aprovada de QUALQUER frente — a da ótica — e toda TV nova, da
 * metalúrgica à clínica, estreava vendendo óculos. A regra mudou de propósito:
 * só a tela da frente; sem ela, null (a TV fica na espera). E a TV em pé
 * recebe a tela em pé, pelo que ela contou de si (info.w/h).
 */
test('telaParaComecar: só a da frente da conta, na orientação da TV; sem ela, a espera', async () => {
  const T = await import(pathToFileURL(path.join(RAIZ, 'web/src/lib/telasProntas.js')).href);
  const telas = [
    { id: 'saude-pe', nome: 'Clínica em pé', layout: 'portrait-split', perfil: 'saude', zonas: {} },
    { id: 'saude', nome: 'Clínica', layout: 'dashboard', perfil: 'saude', zonas: {} },
    { id: 'loja', nome: 'Loja', layout: 'dashboard', perfil: 'comercio', zonas: {} },
  ];
  const dados = { telas, modelos: new Map(), exemplos: { nomes: [], compactos: [] } };
  assert.equal(T.telaParaComecar(dados, {}, 'saude', null).id, 'saude');
  assert.equal(T.telaParaComecar(dados, {}, 'saude', true).id, 'saude-pe');
  assert.equal(T.telaParaComecar(dados, {}, 'empresa', null), null, 'sem tela da frente: nenhuma (nada de cair na de outra frente)');
  assert.equal(T.telaParaComecar(dados, {}, 'comercio', true), null, 'TV em pé sem tela em pé da frente: a espera, não a deitada espremida');
  assert.equal(T.telaParaComecar(dados, {}, 'comercio', false).id, 'loja');
  // A orientação vem do que a TV contou de si; sem isso, não se sabe.
  assert.equal(T.tvEmPe({ info: { w: 1080, h: 1920 } }), true);
  assert.equal(T.tvEmPe({ info: { w: 1920, h: 1080 } }), false);
  assert.equal(T.tvEmPe({ info: null }), null);
  assert.equal(T.tvEmPe(undefined), null);
  assert.equal(T.telaParaComecar({ telas: [], modelos: new Map() }, {}, 'saude', null), null);
  assert.deepEqual(T.marcaDaConta({ empresa: 'Padaria Sol', kit: { nome: 'Marca principal', site: 'sol.com.br', local: { endereco: 'Rua A, 1', bairro: 'Centro' } } }),
    { cores: [], fonteTitulo: '', fonteApoio: '', nome: 'Padaria Sol', site: 'sol.com.br', endereco: 'Rua A, 1 · Centro' });
});

test('o diálogo de parear põe a tela pronta quando a TV não tem conteúdo, e conta qual', () => {
  const s = ler('web/src/pages/ScreensPage.jsx');
  assert.match(s, /if \(dev && dev\.semConteudo\) \{/);
  // A orientação real da TV (o pulso dela, na lista), e não mais null fixo.
  assert.match(s, /telaParaComecar\(dados, marcaDaConta\(r\), perfilAtual\(\)\.id, tvEmPe\(daLista\)\)/);
  assert.match(s, /gravarEmLote\(\[\{ id: dev\.id, name: dev\.name \}\], \(cfg\) => aplicarTelaPronta\(cfg, tela\)/);
  assert.match(s, /está mostrando “\{comecou\}”/);
});

const PORTA = 6800 + Math.floor(Math.random() * 90);
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

test('servidor: nome padrão numerado (o menor "TV n" livre) e semConteudo só para a TV sem programação', async (t) => {
  const dados = fs.mkdtempSync(path.join(os.tmpdir(), 'mt-tvnova-'));
  const servidor = spawn(process.execPath, ['server.js'], {
    cwd: RAIZ, stdio: 'ignore',
    env: { ...process.env, PORT: String(PORTA), STORAGE: 'local', SKIP_VERIFY: '1', DATABASE_URL: '', DATA_DIR: dados, MEDIA_DIR: dados, AI_PROVIDER: 'dev' },
  });
  t.after(() => { servidor.kill(); try { fs.rmSync(dados, { recursive: true, force: true }); } catch (e) { /* idem */ } });
  let ok = false;
  for (let i = 0; i < 160 && !ok; i++) { try { await pedir('/tv'); ok = true; } catch (e) { await new Promise((r) => setTimeout(r, 250)); } }
  assert.ok(ok, 'o servidor de teste não subiu');
  const c = cookieDe(await pedir('/api/auth/signup', { method: 'POST', json: { email: 'tvnova' + Date.now() + '@teste.local', password: 'senha-de-teste-123', name: 'Loja', aceite: true } }));
  assert.equal((await pedir('/api/billing/dev-activate', { method: 'POST', cookie: c, json: { plan: 'pro' } })).status, 200);

  const tv1 = (await pedir('/api/devices', { method: 'POST', json: {} })).json;
  const p1 = await pedir('/api/pair', { method: 'POST', cookie: c, json: { code: tv1.code } });
  assert.equal(p1.status, 200);
  assert.equal(p1.json.name, 'TV 1');
  assert.equal(p1.json.semConteudo, true);

  const tv2 = (await pedir('/api/devices', { method: 'POST', json: {} })).json;
  const p2 = await pedir('/api/pair', { method: 'POST', cookie: c, json: { code: tv2.code, name: '  Recepção  ' } });
  assert.equal(p2.json.name, 'Recepção', 'o nome dado vale, sem os espaços');

  const tv3 = (await pedir('/api/devices', { method: 'POST', json: {} })).json;
  // O menor número livre: "TV 1" e "Recepção" já existem, então a terceira é "TV 2".
  assert.equal((await pedir('/api/pair', { method: 'POST', cookie: c, json: { code: tv3.code } })).json.name, 'TV 2');

  // Com programação, parear de novo (a mesma conta) não pede tela pronta e mantém o nome.
  const cfg = { settings: { layoutId: 'full' }, zonas: { principal: { items: [{ type: 'text', titulo: 'Oi' }] } } };
  assert.equal((await pedir('/api/devices/' + tv1.id + '/config', { method: 'PUT', cookie: c, json: cfg })).status, 200);
  const de1 = await pedir('/api/pair', { method: 'POST', cookie: c, json: { code: tv1.code } });
  assert.equal(de1.json.semConteudo, false);
  assert.equal(de1.json.name, 'TV 1');

  // Tirou a "TV 1": a próxima sem nome reaproveita o número, em vez de repetir um nome que já existe.
  assert.ok((await pedir('/api/devices/' + tv1.id, { method: 'DELETE', cookie: c })).status < 300);
  const tv4 = (await pedir('/api/devices', { method: 'POST', json: {} })).json;
  assert.equal((await pedir('/api/pair', { method: 'POST', cookie: c, json: { code: tv4.code } })).json.name, 'TV 1');
});
