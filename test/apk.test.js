/*
 * Atualização remota do APK (EXECUTOR D41).
 *
 * O app da TV é só a moldura do WebView: o player se atualiza sozinho, a
 * moldura não, e o APK do Actions expira. O CI publica o APK assinado num
 * Release com um versao.json; o servidor busca, confere o sha256 e serve em
 * /apk/; a moldura confere, baixa em segundo plano e instala com um OK no
 * controle; o painel diz "App novo". Nenhum teste chama o GitHub: a rede é
 * trocada por uma falsa (e o servidor de teste roda com MT_APK_REPO=desligado).
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
// Sem o \r do checkout no Windows: as regex conferem quebra de linha.
const ler = (f) => fs.readFileSync(path.join(RAIZ, f), 'utf8').replace(/\r\n/g, '\n');
const A = require('../server/apk');

const APK = Buffer.concat([Buffer.from('PK\u0003\u0004'), crypto.randomBytes(4096)]);
const SHA = crypto.createHash('sha256').update(APK).digest('hex');
const VERSAO = { versionCode: 57, versionName: '1.0.57', tamanho: APK.length, sha256: SHA };
const RELEASES = [
  { tag_name: 'apk-v1.0.58', draft: true, assets: [] },
  { tag_name: 'v2', assets: [{ name: 'multitelas-tv.apk', browser_download_url: 'https://github.com/x/y/releases/download/v2/multitelas-tv.apk' }] },
  { tag_name: 'apk-v1.0.57', assets: [
    { name: 'multitelas-tv.apk', browser_download_url: 'https://github.com/x/y/releases/download/apk-v1.0.57/multitelas-tv.apk' },
    { name: 'versao.json', browser_download_url: 'https://github.com/x/y/releases/download/apk-v1.0.57/versao.json' },
  ] },
];

function redeFalsa(o = {}) {
  const chamadas = { api: 0, versao: 0, apk: 0, cabecalhos: null, limites: [] };
  return {
    chamadas,
    buscarJson: async (url, cab) => {
      chamadas.api += 1;
      chamadas.cabecalhos = cab;
      assert.match(url, /^https:\/\/api\.github\.com\/repos\/[\w.-]+\/[\w.-]+\/releases\?per_page=20$/);
      return o.semRelease ? { json: [] } : { json: RELEASES };
    },
    buscar: async (url, politica, tipo, aceita, cab, limite) => {
      chamadas.limites.push(limite);
      assert.equal(politica, undefined, 'a busca do APK precisa passar pela checagem de IP de sempre');
      if (url.endsWith('versao.json')) { chamadas.versao += 1; return { bytes: Buffer.from(JSON.stringify(o.versao || VERSAO)) }; }
      chamadas.apk += 1;
      return { bytes: o.apk || APK };
    },
  };
}

test('o versao.json e o Release: só o que tem os dois arquivos, com os campos conferidos', () => {
  assert.deepEqual(A.lerVersao(VERSAO), VERSAO);
  assert.deepEqual(A.lerVersao(Object.assign({}, VERSAO, { sha256: SHA.toUpperCase(), extra: '<script>' })), VERSAO);
  for (const ruim of [{ versionCode: 0 }, { versionCode: 1.5 }, { versionName: '1.0 <b>' }, { tamanho: 10 }, { tamanho: 99e6 }, { sha256: 'abc' }]) {
    assert.equal(A.lerVersao(Object.assign({}, VERSAO, ruim)), null, JSON.stringify(ruim));
  }
  assert.equal(A.escolher(RELEASES).tag, 'apk-v1.0.57', 'pegou rascunho ou release sem o versao.json');
  assert.equal(A.escolher([{ tag_name: 'apk-v1.0.9', prerelease: true, assets: RELEASES[2].assets }]), null);
  assert.equal(A.escolher('lixo'), null);
});

test('o servidor busca, confere o sha256 e guarda por 30 min ("não há" também fica guardado)', async () => {
  const antes = process.env.MT_APK_REPO;
  process.env.MT_APK_REPO = 'Thiagoolivs/Multi-telas';
  try {
    A._limpar();
    let rede = redeFalsa();
    A._trocarRede(rede);
    const pub = await A.obter();
    assert.deepEqual(pub.versao, VERSAO);
    assert.ok(pub.bytes.equals(APK));
    assert.deepEqual(rede.chamadas.limites, [64 * 1024, 40 * 1024 * 1024], 'o APK passa do 1,5 MB de uma página');
    assert.equal(rede.chamadas.cabecalhos.authorization, undefined, 'mandou token sem GITHUB_TOKEN');
    await A.obter();
    assert.equal(rede.chamadas.api, 1, 'foi ao GitHub de novo antes de 30 min');
    // Venceu: confere de novo, mas o mesmo APK não é baixado outra vez.
    await A.obter(Date.now() + 31 * 60 * 1000);
    assert.deepEqual([rede.chamadas.api, rede.chamadas.apk], [2, 1]);

    // APK que não bate com o versao.json: a TV não recebe nada novo (fica o que havia).
    A._limpar();
    rede = redeFalsa({ apk: Buffer.concat([APK.subarray(0, APK.length - 1), Buffer.from('x')]) });
    A._trocarRede(rede);
    assert.equal(await A.obter(), null);
    assert.equal(await A.obter(), null);
    assert.equal(rede.chamadas.api, 1, 'depois de uma falha, espera 5 min para tentar de novo');

    // Sem Release: null, e não pergunta de novo a cada tela listada.
    A._limpar();
    rede = redeFalsa({ semRelease: true });
    A._trocarRede(rede);
    assert.equal(await A.obter(), null);
    assert.equal(A.conhecida(), null);
    await new Promise((r) => setImmediate(r));
    assert.equal(rede.chamadas.api, 1, 'sem Release, a lista de telas foi ao GitHub a cada chamada');

    // Desligado: nem sai para a rede.
    A._limpar();
    process.env.MT_APK_REPO = 'desligado';
    rede = redeFalsa();
    A._trocarRede(rede);
    assert.equal(await A.obter(), null);
    assert.equal(rede.chamadas.api, 0);
  } finally {
    A._trocarRede(require('../server/site'));
    A._limpar();
    if (antes === undefined) delete process.env.MT_APK_REPO; else process.env.MT_APK_REPO = antes;
  }
});

test('"há uma versão nova": pelo versionCode que a TV conta (ou pelo nome 1.0.N das cascas de antes)', async () => {
  assert.equal(A.codigoDoApp({ app: '1.0.41', appCodigo: 41 }), 41);
  assert.equal(A.codigoDoApp({ app: '1.0.12' }), 12, 'a casca de antes do D41 só manda o nome');
  assert.equal(A.codigoDoApp({ app: '1.4' }), 0);
  assert.equal(A.codigoDoApp({ ua: 'Tizen' }), 0);
  assert.equal(A.codigoDoApp(null), 0);
  const antes = process.env.MT_APK_REPO;
  process.env.MT_APK_REPO = 'Thiagoolivs/Multi-telas';
  try {
    A._limpar();
    const rede = redeFalsa();
    A._trocarRede(rede);
    assert.equal(A.versaoNovaPara({ w: 1920, ua: 'Tizen' }), '', 'TV de navegador');
    assert.equal(rede.chamadas.api, 0, 'TV de navegador fez a lista de telas ir ao GitHub');
    await A.obter();
    assert.equal(A.versaoNovaPara({ app: '1.0.40', appCodigo: 40 }), '1.0.57');
    assert.equal(A.versaoNovaPara({ app: '1.0.57', appCodigo: 57 }), '');
    assert.equal(A.versaoNovaPara({ app: '1.0.60', appCodigo: 60 }), '');
  } finally {
    A._trocarRede(require('../server/site'));
    A._limpar();
    if (antes === undefined) delete process.env.MT_APK_REPO; else process.env.MT_APK_REPO = antes;
  }
});

test('a moldura: confere sha256, tamanho, pacote e versão antes do aviso; o OK só instala com o aviso; rede fora da tela', () => {
  const D = 'android/app/src/main/';
  const At = ler(D + 'java/br/com/multitelas/tv/Atualizador.java');
  const corpo = At.slice(At.indexOf('private void conferirAgora()'), At.indexOf('private static HttpURLConnection abrir('));
  assert.match(corpo, /base \+ "\/apk\/versao\.json"/);
  assert.match(corpo, /base \+ "\/apk\/ultimo\.apk"/, 'a TV baixa de outro lugar que não o nosso servidor');
  assert.match(corpo, /if \(codigo <= BuildConfig\.VERSION_CODE\) return;/);
  const ordem = ['String obtido = baixarPara(', 'if (!sha.equals(obtido))', 'getPackageArchiveInfo(', '!tela.getPackageName().equals(info.packageName) || codigoDe(info) != codigo', 'pronto = destino;', 'handler.post(this::avisarPronto);'];
  ordem.reduce((i, s) => { const j = corpo.indexOf(s); assert.ok(j > i, 'fora de ordem ou faltando: ' + s); return j; }, -1);
  assert.match(At, /if \(total > tamanho\) throw new IllegalStateException/, 'baixa sem teto');
  assert.match(At, /return total == tamanho \? hex\(md\.digest\(\)\) : null;/);
  // Rede e disco só na fila de fundo; o Android derruba app que faz rede na thread da tela.
  assert.match(At, /fila\.execute\(Atualizador\.this::conferirAgora\)/);
  assert.match(At, /catch \(Throwable falha\) \{\n\s+\/\/ Sem rede/, 'uma falha pode derrubar a moldura');
  assert.match(At, /PackageInstaller\.SessionParams\.MODE_FULL_INSTALL/);
  assert.match(At, /Settings\.ACTION_MANAGE_UNKNOWN_APP_SOURCES/);
  assert.match(At, /if \(status == PackageInstaller\.STATUS_FAILURE_ABORTED\) \{/, 'cancelar no instalador não pode desistir da versão');
  assert.match(At, /Gravity\.TOP \| Gravity\.END/, 'o aviso colide com o selo (embaixo à direita)');
  const M = ler(D + 'java/br/com/multitelas/tv/MainActivity.java');
  assert.match(M, /if \(atualizador != null && atualizador\.temPronto\(\)\s+&& \(k == KeyEvent\.KEYCODE_DPAD_CENTER/, 'o OK do controle foi tirado do player sem atualização pronta');
  assert.match(M, /raiz\.addView\(web, 0\);/, 'o WebView recriado cobre o aviso');
  assert.match(M, /if \(atualizador != null\) atualizador\.parar\(\);/);
  const P = ler(D + 'java/br/com/multitelas/tv/Ponte.java');
  assert.match(P, /public int codigo\(\) \{\n\s+return BuildConfig\.VERSION_CODE;/);
  assert.doesNotMatch(P.replace(/\/\*[\s\S]*?\*\//g, ''), /instalar|Atualizador|PackageInstaller/, 'a ponte (que todo iframe enxerga) não pode instalar nada');
  const X = ler(D + 'AndroidManifest.xml');
  assert.match(X, /android\.permission\.REQUEST_INSTALL_PACKAGES/);
  assert.match(X, /android:name="\.ResultadoDaInstalacao"\s+android:exported="false"/);
  const R = ler(D + 'java/br/com/multitelas/tv/ResultadoDaInstalacao.java');
  assert.match(R, /STATUS_PENDING_USER_ACTION/);
});

test('o CI publica o Release só da main e só assinado; a TV conta o versionCode; o painel avisa', () => {
  const W = ler('.github/workflows/android.yml');
  assert.match(W, /if: \$\{\{ env\.TEM_CHAVE == 'true' && github\.ref == 'refs\/heads\/main' && github\.event_name != 'pull_request' \}\}/);
  assert.match(W, /printf '\{"versionCode":%s,"versionName":"%s","tamanho":%s,"sha256":"%s"\}\\n'/);
  assert.match(W, /gh release create "apk-v\$NOME" publicar\/multitelas-tv\.apk publicar\/versao\.json/);
  assert.match(W, /permissions:\n\s+contents: write/);
  // Sem a chave: avisa e segue (nota do consultor), sem derrubar o build.
  assert.match(W, /if: \$\{\{ env\.TEM_CHAVE != 'true' && github\.ref == 'refs\/heads\/main' && github\.event_name != 'pull_request' \}\}\n\s+run: echo "::warning title=Sem Release para as TVs::/);
  assert.match(ler('js/cloud.js'), /appCodigo: \(global\.MTApp && typeof global\.MTApp\.codigo === 'function' && Number\(global\.MTApp\.codigo\(\)\)\) \|\| undefined,/);
  assert.match(ler('server.js'), /appCodigo: num\(b\.appCodigo\) \};/);
  assert.match(ler('server/routes/telas.js'), /appNovo: apk\.versaoNovaPara\(info\),/);
  const S = ler('web/src/pages/ScreensPage.jsx');
  assert.match(S, /'App novo \(' \+ d\.appNovo \+ '\): aperte OK no controle da TV'/);
  assert.match(S, /'App novo \(' \+ d\.appNovo \+ '\): instale uma vez pelo pendrive'/);
  assert.match(ler('sw.js'), /mt-shell-v(6[3-9]|[7-9]\d)/);
});

/* ---------------- servidor de verdade ---------------- */

const PORTA = 7600 + Math.floor(Math.random() * 90);
function pedir(caminho, o = {}) {
  return new Promise((resolve, reject) => {
    const corpo = o.json ? Buffer.from(JSON.stringify(o.json)) : null;
    const req = http.request({ host: '127.0.0.1', port: PORTA, path: caminho, method: o.method || 'GET',
      headers: Object.assign({}, o.json ? { 'Content-Type': 'application/json' } : {}, o.cookie ? { Cookie: o.cookie } : {}, o.headers || {}) }, (res) => {
      let txt = '';
      res.on('data', (c) => { txt += c; });
      res.on('end', () => { let json = null; try { json = JSON.parse(txt); } catch (e) { json = null; } resolve({ status: res.statusCode, json, txt, cookies: [].concat(res.headers['set-cookie'] || []) }); });
    });
    req.on('error', reject);
    req.setTimeout(30000, () => req.destroy(new Error('a rota ' + caminho + ' não respondeu')));
    if (corpo) req.write(corpo);
    req.end();
  });
}

test('a rota: sem Release, 404 (nada acontece nas TVs); o pulso guarda o versionCode da casca', async (t) => {
  const dados = fs.mkdtempSync(path.join(os.tmpdir(), 'mt-d41-'));
  const env = { ...process.env, PORT: String(PORTA), STORAGE: 'local', SKIP_VERIFY: '1', DATABASE_URL: '', DATA_DIR: dados, MEDIA_DIR: dados, AI_PROVIDER: 'dev', MT_APK_REPO: 'desligado' };
  const servidor = spawn(process.execPath, ['server.js'], { cwd: RAIZ, stdio: 'ignore', env });
  t.after(() => { servidor.kill(); try { fs.rmSync(dados, { recursive: true, force: true }); } catch (e) { /* o Windows segura o arquivo */ } });
  let ok = false;
  for (let i = 0; i < 160 && !ok; i++) { try { await pedir('/tv'); ok = true; } catch (e) { await new Promise((r) => setTimeout(r, 250)); } }
  assert.ok(ok, 'o servidor de teste não subiu');

  const v = await pedir('/apk/versao.json');
  assert.deepEqual([v.status, v.json.error], [404, 'nenhuma versão do app publicada']);
  assert.equal((await pedir('/apk/ultimo.apk')).status, 404);
  assert.equal((await pedir('/apk/ultimo.apk', { method: 'POST' })).status, 405);

  // A TV do app conta a versão no pulso; o painel recebe (sem Release, sem "App novo").
  const c = (await pedir('/api/auth/signup', { method: 'POST', json: { email: 'd41' + Date.now() + '@teste.local', password: 'senha-de-teste-123', name: 'Loja', aceite: true } }))
    .cookies.map((x) => x.split(';')[0]).filter((x) => !x.endsWith('=')).join('; ');
  const tv = (await pedir('/api/devices', { method: 'POST', json: {} })).json;
  const daTv = { 'x-device-token': tv.deviceToken || tv.token };
  assert.ok((await pedir('/api/pair', { method: 'POST', cookie: c, json: { code: tv.code } })).status < 300);
  assert.equal((await pedir('/api/devices/' + tv.id + '/heartbeat', { method: 'POST', headers: daTv, json: { w: 1920, h: 1080, app: '1.0.40', appCodigo: 40 } })).status, 200);
  const lista = (await pedir('/api/devices', { cookie: c })).json.devices;
  const d = lista.find((x) => x.id === tv.id);
  assert.deepEqual([d.info.app, d.info.appCodigo, d.appNovo], ['1.0.40', 40, '']);
});
