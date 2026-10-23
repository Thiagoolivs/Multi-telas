/*
 * O acervo comum com fotos da Pixabay (pedido do dono, 23/10: "formar um
 * banco de imagens para uso comum no MultiTelas").
 *
 * O operador escolhe UMA foto por vez (os termos da Pixabay proíbem
 * "systematic mass downloads"), confirma que não tem marca à vista nem pessoa
 * reconhecível doente ou tomando remédio, e ela entra já aprovada no segmento
 * dito, com o crédito do autor. O cliente encontra primeiro o segmento dele.
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const { spawn } = require('node:child_process');

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'mt-acervo-'));
const db = require('../server/db-sqlite.js');
const banco = require('../server/banco.js');

const RAIZ = path.join(__dirname, '..');
const ler = (...p) => fs.readFileSync(path.join(RAIZ, ...p), 'utf8');

test('o segmento da conta acha o do banco pelo que ela escreveu na marca', () => {
  assert.equal(banco.segmentoDaConta('Panificadora do Zé'), 'padaria');
  assert.equal(banco.segmentoDaConta('Metalúrgica'), 'industria');
  assert.equal(banco.segmentoDaConta('Clínica odontológica'), 'saude');
  assert.equal(banco.segmentoDaConta('OTICA'), 'otica');
  assert.equal(banco.segmentoDaConta(''), null);
  assert.equal(banco.segmentoDaConta('xyz'), null);
  // Todo segmento tem nome e termos prontos para a busca começar.
  for (const s of banco.SEGMENTOS) assert.ok(s.nome && s.termos.length >= 5, s.id);
  assert.deepEqual([banco.formatoDe(1920, 1280), banco.formatoDe(1080, 1920), banco.formatoDe(1000, 1000), banco.formatoDe(0, 0)], ['16/9', '9/16', '1/1', null]);
});

const FOTO = { id: 555, credito: 'Foto: Ana / Pixabay', pagina: 'https://pixabay.com/photos/pao-555/', largura: 1920, altura: 1280, tags: 'pão, padaria, café' };
const salvo = (n) => ({ key: 'banco-plataforma/x' + n + '.jpg', url: '/media/banco-plataforma/x' + n + '.jpg', mime: 'image/jpeg', size: 1000 });
const ok = { semMarca: true, semPessoaDoente: true };

test('curar: só com segmento e as duas confirmações; entra aprovada, sem conta dona, com o crédito', async () => {
  const sem = await banco.curarDaPixabay(db, { foto: FOTO, salvo: salvo(1), segmento: 'padaria', confirmou: { semMarca: true } });
  assert.equal(sem.status, 400);
  assert.match(sem.error, /pessoa reconhecível doente/);
  assert.equal((await banco.curarDaPixabay(db, { foto: FOTO, salvo: salvo(1), segmento: 'inventado', confirmou: ok })).status, 400);

  const r = await banco.curarDaPixabay(db, { foto: FOTO, salvo: salvo(1), segmento: 'padaria', descricao: 'pão francês na cesta', operador: 'op@exemplo.invalido', confirmou: ok });
  assert.equal(r.status, 201);
  const linha = await db.bancoPorMedia('pixabay:555');
  assert.equal(linha.estado, 'aprovada');
  assert.equal(linha.tenant_id, null);
  assert.equal(linha.decidido_por, 'op@exemplo.invalido');
  assert.deepEqual([linha.origem, linha.credito, linha.fonte, linha.segmento, linha.formato], ['pixabay', 'Foto: Ana / Pixabay', 'https://pixabay.com/photos/pao-555/', 'padaria', '16/9']);
  // A mesma foto não entra duas vezes.
  assert.equal((await banco.curarDaPixabay(db, { foto: FOTO, salvo: salvo(2), segmento: 'padaria', confirmou: ok })).status, 409);
  // Link que não é da Pixabay não vira "fonte".
  await banco.curarDaPixabay(db, { foto: { ...FOTO, id: 556, pagina: 'javascript:alert(1)' }, salvo: salvo(3), segmento: 'otica', confirmou: ok });
  assert.equal((await db.bancoPorMedia('pixabay:556')).fonte, null);
});

test('o feed: filtra pelo segmento e mostra o crédito; segmento inventado não filtra nada', async () => {
  const pad = await banco.listar(db, { segmento: 'padaria' });
  assert.ok(pad.length >= 1 && pad.every((i) => i.segmento === 'padaria'));
  const p = pad.find((i) => i.credito);
  assert.equal(p.origem, 'pixabay');
  assert.equal(p.credito, 'Foto: Ana / Pixabay');
  assert.equal(p.descricao, 'pão francês na cesta');
  assert.equal(p.minha, false);
  assert.ok((await banco.listar(db, { segmento: 'inventado' })).length >= 2);
  assert.ok((await banco.listar(db, { termo: 'cesta' })).some((i) => i.descricao === 'pão francês na cesta'));
});

test('a página e a escolha de foto: Pixabay junto do acervo, curadoria só do operador', () => {
  const p = ler('web', 'src', 'pages', 'BancoImagensPage.jsx');
  assert.match(p, /pixabay\.buscar\(busca\)/);
  assert.match(p, /\{operador && \(/);
  assert.match(p, /semPessoaDoente/);
  assert.match(p, /por \{f\.autor\} · Pixabay/);
  assert.match(ler('web', 'src', 'App.jsx'), /<BancoImagensPage operador=\{!!session\.operador\} \/>/);
  assert.match(ler('web', 'src', 'components', 'content', 'FotoDoProduto.jsx'), /bancoImagens\.feed\(\{ segmento: r\.daConta, limite: 12 \}\)/);
  const s = ler('server.js');
  // A foto vai para a pasta da plataforma (fora da cota de qualquer conta), uma por pedido.
  assert.match(s, /storage\.saveBuffer\('banco-plataforma', foto\.bytes, foto\.mime\)/);
  assert.ok(s.indexOf("parts[3] === 'pixabay'") < s.indexOf('banco.moderar(db, parts[3]'), 'a rota da curadoria tem de vir antes da moderação por id');
  // Pôr nas Mídias é CÓPIA (apagar a mídia apaga o arquivo, e o do acervo é de todo mundo), dentro da cota.
  const m = s.slice(s.indexOf("parts[3] === 'midias'"), s.indexOf('// Usar uma imagem do feed'));
  assert.ok(m.includes('storage.readBuffer(item.key)'), 'não é cópia');
  assert.ok(m.includes('midia.guardarBuffer(db, sess.tenant_id, buf, item.mime'), 'a cópia não vai para a conta');
  assert.match(m, /cota de armazenamento cheia/);
  assert.ok(p.includes('bancoImagens.paraMidias(item.id)'));
});

/* ---------- de ponta a ponta: só o operador cura ---------- */
const PORTA = 8400 + Math.floor(Math.random() * 9);
function pedir(caminho, o = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port: PORTA, path: caminho, method: o.method || 'GET',
      headers: { ...(o.body ? { 'Content-Type': 'application/json' } : {}), ...(o.cookie ? { Cookie: o.cookie } : {}) } }, (res) => {
      let corpo = '';
      res.on('data', (x) => { corpo += x; });
      res.on('end', () => { let json = null; try { json = JSON.parse(corpo); } catch (e) { json = null; } resolve({ status: res.statusCode, json, cookies: [].concat(res.headers['set-cookie'] || []) }); });
    });
    req.on('error', reject);
    req.setTimeout(8000, () => req.destroy(new Error('a rota ' + caminho + ' não respondeu')));
    if (o.body) req.write(JSON.stringify(o.body));
    req.end();
  });
}
const jarra = (lista) => lista.map((x) => x.split(';')[0]).filter((kv) => kv.split('=')[1]).join('; ');

test('a rota: cliente não cura (404); sem a chave da Pixabay, o operador ouve 503; o feed traz os segmentos', async (t) => {
  const marca = Date.now();
  const opEmail = 'op' + marca + '@teste.local';
  const servidor = spawn(process.execPath, ['server.js'], {
    cwd: RAIZ, stdio: 'ignore',
    env: { ...process.env, PORT: String(PORTA), STORAGE: 'local', SKIP_VERIFY: '1', DATABASE_URL: '', DATA_DIR: fs.mkdtempSync(path.join(os.tmpdir(), 'mt-acervo-srv-')), ADMIN_EMAILS: opEmail, PIXABAY_API_KEY: '' },
  });
  t.after(() => servidor.kill());
  let no = false;
  for (let i = 0; i < 160 && !no; i++) { try { await pedir('/tv'); no = true; } catch (e) { await new Promise((r) => setTimeout(r, 250)); } }
  assert.ok(no, 'o servidor de teste não subiu');
  const conta = (email, name) => pedir('/api/auth/signup', { method: 'POST', body: { email, password: 'senha-de-teste-123', name, aceite: true } });
  const op = await conta(opEmail, 'Operação');
  const cli = await conta('cliente' + marca + '@teste.local', 'Padaria do Teste');
  const corpo = { id: 1, segmento: 'padaria', confirmou: ok };
  assert.equal((await pedir('/api/plataforma/banco/pixabay', { method: 'POST', cookie: jarra(cli.cookies), body: corpo })).status, 404);
  const semChave = await pedir('/api/plataforma/banco/pixabay', { method: 'POST', cookie: jarra(op.cookies), body: corpo });
  assert.equal(semChave.status, 503);
  assert.match(semChave.json.error, /falta a chave/);
  const feed = await pedir('/api/banco', { cookie: jarra(cli.cookies) });
  assert.equal(feed.status, 200);
  assert.ok(feed.json.segmentos.some((s) => s.id === 'padaria' && s.termos.includes('pão francês')));
});
