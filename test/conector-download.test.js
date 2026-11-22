/*
 * O instalador do Conector MultiTelas (docs/INTEGRACOES.md): o zip de ~38 MB
 * não mora no git. O .github/workflows/conector.yml publica um Release
 * `conector-v<versão>` com o zip, o versao.json e o .sha256; o servidor
 * busca o mais novo (server/conector-release.js), confere tamanho, sha256 e
 * "PK", guarda em memória e serve em /conector/MultiTelasConector.zip só para
 * o dono e o administrador logados. Como o APK da TV (test/apk.test.js),
 * nenhum teste chama o GitHub: a rede é falsa, ou um "GitHub" local na porta
 * 6165 (MT_CONECTOR_GITHUB_TESTE, ignorado em produção). Portas 6164–6166.
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const http = require('node:http');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');

const RAIZ = path.join(__dirname, '..');
const ler = (f) => fs.readFileSync(path.join(RAIZ, f), 'utf8').replace(/\r\n/g, '\n');
const R = require('../server/conector-release');

const ZIP = Buffer.concat([Buffer.from('PK\u0003\u0004'), crypto.randomBytes(8192)]);
const SHA = crypto.createHash('sha256').update(ZIP).digest('hex');
const VERSAO = { versao: '1.1.0', tamanho: ZIP.length, sha256: SHA };
const releases = (base) => [
  { tag_name: 'conector-v1.2.0', draft: true, assets: [] },
  { tag_name: 'conector-v1.1.5', prerelease: true, assets: [{ name: 'MultiTelasConector.zip', browser_download_url: base + '/pre.zip' }, { name: 'versao.json', browser_download_url: base + '/pre.json' }] },
  { tag_name: 'apk-v1.0.57', assets: [{ name: 'MultiTelasConector.zip', browser_download_url: base + '/errado.zip' }, { name: 'versao.json', browser_download_url: base + '/errado.json' }] },
  { tag_name: 'conector-v1.1.0', assets: [
    { name: 'MultiTelasConector.zip', browser_download_url: base + '/download/conector-v1.1.0/MultiTelasConector.zip' },
    { name: 'versao.json', browser_download_url: base + '/download/conector-v1.1.0/versao.json' },
    { name: 'MultiTelasConector.zip.sha256', browser_download_url: base + '/download/conector-v1.1.0/MultiTelasConector.zip.sha256' },
  ] },
];

function redeFalsa(o = {}) {
  const chamadas = { api: 0, versao: 0, zip: 0, cabecalhos: null, politicas: [] };
  return {
    chamadas,
    buscarJson: async (url, cab, politica) => {
      chamadas.api += 1;
      chamadas.cabecalhos = cab;
      chamadas.politicas.push(politica);
      assert.match(url, /^https:\/\/api\.github\.com\/repos\/[\w.-]+\/[\w.-]+\/releases\?per_page=30$/);
      return o.semRelease ? { json: [] } : { json: releases('https://github.com/x/y/releases') };
    },
    buscar: async (url, politica) => {
      chamadas.politicas.push(politica);
      if (url.endsWith('versao.json')) { chamadas.versao += 1; return { bytes: Buffer.from(JSON.stringify(o.versao || VERSAO)) }; }
      chamadas.zip += 1;
      return { bytes: o.zip || ZIP };
    },
  };
}

test('o versao.json e o Release: só a tag conector-v, com o zip e o versao.json; rascunho e pré-lançamento ficam de fora', () => {
  assert.deepEqual(R.lerVersao(VERSAO), VERSAO);
  assert.deepEqual(R.lerVersao(Object.assign({}, VERSAO, { sha256: SHA.toUpperCase(), extra: '<x>' })), VERSAO);
  for (const ruim of [null, {}, Object.assign({}, VERSAO, { versao: '1.1' }), Object.assign({}, VERSAO, { tamanho: 10 }), Object.assign({}, VERSAO, { tamanho: 200 * 1024 * 1024 }), Object.assign({}, VERSAO, { sha256: 'x' })]) {
    assert.equal(R.lerVersao(ruim), null, JSON.stringify(ruim));
  }
  const r = R.escolher(releases('https://g'));
  assert.equal(r.tag, 'conector-v1.1.0');
  assert.equal(r.zip, 'https://g/download/conector-v1.1.0/MultiTelasConector.zip');
  assert.equal(R.escolher([]), null);
  assert.ok(R.TAG.test('conector-v10.2.33') && !R.TAG.test('conector-v1.2'));
  assert.doesNotMatch(R.pagina('<b>', 'x"y'), /<b>|x"y/, 'a página não escapou o texto');
});

test('a busca: confere sha256, tamanho e "PK"; guarda; leva o GITHUB_TOKEN; passa pela checagem de IP (site.js)', async () => {
  const antes = { repo: process.env.MT_CONECTOR_REPO, token: process.env.GITHUB_TOKEN, teste: process.env.MT_CONECTOR_GITHUB_TESTE };
  process.env.MT_CONECTOR_REPO = 'Thiagoolivs/Multi-telas';
  process.env.GITHUB_TOKEN = 'ghp_teste';
  delete process.env.MT_CONECTOR_GITHUB_TESTE;
  try {
    const rede = redeFalsa();
    R._trocarRede(rede);
    R._limpar();
    const pub = await R.obter(Date.now());
    assert.deepEqual(pub.versao, VERSAO);
    assert.ok(pub.bytes.equals(ZIP));
    assert.equal(rede.chamadas.cabecalhos.authorization, 'Bearer ghp_teste');
    assert.ok(rede.chamadas.politicas.every((p) => p === undefined), 'em produção a busca passa pela checagem de IP de sempre');
    await R.obter(Date.now() + 60 * 1000);
    assert.equal(rede.chamadas.api, 1, 'buscou de novo dentro dos 30 min');
    assert.deepEqual(R.conhecida(), VERSAO);
    // O zip que não bate com o versao.json não é servido.
    for (const o of [{ zip: Buffer.concat([ZIP, Buffer.from('x')]) }, { zip: Buffer.from('MZ' + 'x'.repeat(8190)), versao: { versao: '1.1.0', tamanho: 8192, sha256: crypto.createHash('sha256').update(Buffer.from('MZ' + 'x'.repeat(8190))).digest('hex') } }]) {
      R._trocarRede(redeFalsa(o));
      R._limpar();
      assert.equal(await R.obter(Date.now()), null);
    }
    R._trocarRede(redeFalsa({ semRelease: true }));
    R._limpar();
    assert.equal(await R.obter(Date.now()), null, 'sem Release, sem zip');
    process.env.MT_CONECTOR_REPO = 'desligado';
    R._limpar();
    assert.equal(await R.obter(Date.now()), null);
  } finally {
    R._trocarRede(require('../server/site'));
    R._limpar();
    for (const [k, v] of [['MT_CONECTOR_REPO', antes.repo], ['GITHUB_TOKEN', antes.token], ['MT_CONECTOR_GITHUB_TESTE', antes.teste]]) {
      if (v === undefined) delete process.env[k]; else process.env[k] = v;
    }
  }
});

test('o CI publica o Release só da main, com o zip, o versao.json e o .sha256; a versão nova é a do package.json', () => {
  const ci = ler('.github/workflows/conector.yml');
  assert.match(ci, /contents: write/);
  assert.match(ci, /if: \$\{\{ github\.ref == 'refs\/heads\/main' && github\.event_name != 'pull_request' \}\}/);
  assert.match(ci, /TAG="conector-v\$VERSAO"/);
  assert.match(ci, /gh release view "\$TAG"/, 'a mesma versão publicaria duas vezes');
  assert.match(ci, /gh release create "\$TAG" publicar\/MultiTelasConector\.zip publicar\/versao\.json publicar\/MultiTelasConector\.zip\.sha256/);
  assert.match(ci, /"versao":"%s","tamanho":%s,"sha256":"%s"/);
  assert.match(JSON.parse(ler('conector/package.json')).version, /^\d+\.\d+\.\d+$/);
});

/* ---------------- o servidor de verdade, com um "GitHub" local ---------------- */

const PORTA = 6164;
const PORTA_GITHUB = 6165;
const PORTA_SEM = 6166;
function pedir(porta, caminho, o = {}) {
  return new Promise((resolve, reject) => {
    const corpo = o.json !== undefined ? Buffer.from(JSON.stringify(o.json)) : null;
    const req = http.request({ host: '127.0.0.1', port: porta, path: caminho, method: o.method || 'GET',
      headers: Object.assign({}, corpo ? { 'Content-Type': 'application/json', 'Content-Length': corpo.length } : {}, o.cookie ? { Cookie: o.cookie } : {}) }, (res) => {
      const partes = [];
      res.on('data', (c) => partes.push(c));
      res.on('end', () => {
        const bytes = Buffer.concat(partes);
        let json = null; try { json = JSON.parse(bytes.toString('utf8')); } catch (e) { json = null; }
        resolve({ status: res.statusCode, bytes, txt: bytes.toString('utf8'), json, headers: res.headers, cookies: [].concat(res.headers['set-cookie'] || []) });
      });
    });
    req.on('error', reject);
    req.setTimeout(30000, () => req.destroy(new Error('a rota ' + caminho + ' não respondeu')));
    if (corpo) req.write(corpo);
    req.end();
  });
}
const cookieDe = (r) => r.cookies.map((c) => c.split(';')[0]).filter((c) => !c.endsWith('=')).join('; ');
async function subir(t, porta, envExtra) {
  const dados = fs.mkdtempSync(path.join(os.tmpdir(), 'mt-conzip-'));
  const servidor = spawn(process.execPath, ['server.js'], {
    cwd: RAIZ, stdio: 'ignore',
    env: Object.assign({}, process.env, { PORT: String(porta), STORAGE: 'local', SKIP_VERIFY: '1', DATABASE_URL: '', DATA_DIR: dados, MEDIA_DIR: dados, AI_PROVIDER: 'dev', MT_APK_REPO: 'desligado', GITHUB_TOKEN: '' }, envExtra),
  });
  t.after(() => { servidor.kill(); try { fs.rmSync(dados, { recursive: true, force: true }); } catch (e) { /* o Windows segura o arquivo */ } });
  let ok = false;
  for (let i = 0; i < 160 && !ok; i++) { try { await pedir(porta, '/tv'); ok = true; } catch (e) { await new Promise((r) => setTimeout(r, 250)); } }
  assert.ok(ok, 'o servidor de teste não subiu');
}

test('a rota: o dono baixa o zip conferido; quem não entrou, o membro e a conta sem Release recebem uma página que explica', { timeout: 120000 }, async (t) => {
  const github = { pedidos: [] };
  const base = 'http://127.0.0.1:' + PORTA_GITHUB;
  const fake = http.createServer((req, res) => {
    github.pedidos.push(req.url);
    if (req.url.startsWith('/repos/Thiagoolivs/Multi-telas/releases')) { res.writeHead(200, { 'content-type': 'application/json' }); return res.end(JSON.stringify(releases(base))); }
    // Como o GitHub: o download redireciona para o storage dele.
    if (req.url === '/download/conector-v1.1.0/MultiTelasConector.zip') { res.writeHead(302, { location: base + '/storage/zip' }); return res.end(); }
    if (req.url === '/storage/zip') { res.writeHead(200, { 'content-type': 'application/octet-stream' }); return res.end(ZIP); }
    if (req.url === '/download/conector-v1.1.0/versao.json') { res.writeHead(200, { 'content-type': 'application/octet-stream' }); return res.end(JSON.stringify(VERSAO)); }
    res.writeHead(404); res.end();
  });
  await new Promise((r) => fake.listen(PORTA_GITHUB, '127.0.0.1', r));
  t.after(() => fake.close());
  await subir(t, PORTA, { MT_CONECTOR_REPO: 'Thiagoolivs/Multi-telas', MT_CONECTOR_GITHUB_TESTE: base });
  const URL_ZIP = '/conector/MultiTelasConector.zip';

  const anonimo = await pedir(PORTA, URL_ZIP);
  assert.equal(anonimo.status, 401);
  assert.match(anonimo.headers['content-type'], /text\/html/);
  assert.match(anonimo.txt, /Entre no painel para baixar/);
  assert.match(anonimo.txt, /href="\/app\/\?ir=integracoes"/);
  assert.equal(github.pedidos.length, 0, 'buscou no GitHub para quem nem entrou');

  const cadastro = (email, extra) => pedir(PORTA, '/api/auth/signup', { method: 'POST', json: Object.assign({ email, password: 'senha-de-teste-123', name: 'Pessoa', aceite: true }, extra || {}) });
  const n = Date.now();
  const dono = cookieDe(await cadastro('zip-dono' + n + '@teste.local', { name: 'RH' }));
  const convite = await pedir(PORTA, '/api/team/invites', { method: 'POST', cookie: dono, json: { email: 'zip-membro' + n + '@teste.local', role: 'member' } });
  assert.equal(convite.status, 201);
  const membro = cookieDe(await cadastro('zip-membro' + n + '@teste.local', { inviteCode: convite.json.code }));
  const doMembro = await pedir(PORTA, URL_ZIP, { cookie: membro });
  assert.equal(doMembro.status, 403);
  assert.match(doMembro.txt, /Só o dono ou um administrador baixa/);

  const r = await pedir(PORTA, URL_ZIP, { cookie: dono });
  assert.equal(r.status, 200, r.txt.slice(0, 200));
  assert.equal(r.headers['content-type'], 'application/zip');
  assert.match(r.headers['content-disposition'], /attachment; filename="MultiTelasConector-1\.1\.0\.zip"/);
  assert.equal(r.headers['x-conector-sha256'], SHA);
  assert.ok(r.bytes.equals(ZIP), 'o zip não chegou igual');
  // Guardado: o segundo download não volta ao GitHub.
  const antes = github.pedidos.length;
  assert.ok((await pedir(PORTA, URL_ZIP, { cookie: dono })).bytes.equals(ZIP));
  assert.equal(github.pedidos.length, antes);
  // O painel mostra a versão publicada.
  assert.deepEqual((await pedir(PORTA, '/api/integracoes', { cookie: dono })).json.api.conector, VERSAO);
  // HEAD responde sem corpo; POST não.
  assert.equal((await pedir(PORTA, URL_ZIP, { cookie: dono, method: 'HEAD' })).bytes.length, 0);
  assert.equal((await pedir(PORTA, URL_ZIP, { cookie: dono, method: 'POST' })).status, 405);

  // Sem Release (ou a busca desligada): a página do "ainda não está disponível".
  await subir(t, PORTA_SEM, { MT_CONECTOR_REPO: 'desligado' });
  const dono2 = cookieDe(await pedir(PORTA_SEM, '/api/auth/signup', { method: 'POST', json: { email: 'zip-sem' + n + '@teste.local', password: 'senha-de-teste-123', name: 'RH', aceite: true } }));
  const sem = await pedir(PORTA_SEM, URL_ZIP, { cookie: dono2 });
  assert.equal(sem.status, 404);
  assert.match(sem.txt, /O instalador ainda não está disponível/);
});
