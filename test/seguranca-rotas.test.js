/*
 * As portas que estavam abertas.
 *
 * Cada teste aqui nasceu de um achado REPRODUZIDO numa instância local, e não
 * de leitura de código. São todos do tipo que não dói em desenvolvimento e
 * custa a empresa inteira em produção — por isso viram teste, e não bilhete.
 *
 * O servidor sobe de verdade numa porta efêmera e as requisições saem por
 * HTTP: é a única forma de provar o que um visitante anônimo consegue, que é
 * exatamente a pergunta em jogo.
 */
const test = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const { spawn } = require('node:child_process');
const path = require('node:path');

const RAIZ = path.join(__dirname, '..');
const PORTA = 3900 + Math.floor(Math.random() * 90);

let servidor;

function pedir(caminho, opcoes) {
  const o = opcoes || {};
  return new Promise((resolve, reject) => {
    const req = http.request(
      { host: '127.0.0.1', port: PORTA, path: caminho, method: o.method || 'GET', headers: o.headers || {} },
      (res) => {
        let corpo = '';
        res.on('data', (c) => { corpo += c; });
        res.on('end', () => resolve({ status: res.statusCode, corpo, headers: res.headers }));
      },
    );
    req.on('error', reject);
    if (o.body) req.write(o.body);
    req.end();
  });
}

test.before(async () => {
  servidor = spawn(process.execPath, ['server.js'], {
    cwd: RAIZ,
    env: { ...process.env, PORT: String(PORTA), STORAGE: 'local', DATABASE_URL: '' },
    stdio: 'ignore',
  });
  // Espera a porta responder em vez de dormir um tempo fixo.
  for (let i = 0; i < 60; i++) {
    try { await pedir('/tv'); return; } catch (e) { await new Promise((r) => setTimeout(r, 250)); }
  }
  throw new Error('o servidor de teste não subiu');
});

test.after(() => { if (servidor) servidor.kill(); });

/* ---------------- SEC-01: o que o servidor entrega ---------------- */

test('o banco de dados não é baixável por HTTP', async () => {
  /*
   * Isto respondia 200 com o arquivo inteiro. O banco guarda o token de
   * sessão em texto puro, então baixá-lo e mandar um token como cookie era
   * login imediato como qualquer usuário, de qualquer inquilino.
   */
  for (const caminho of ['/data/multitelas.db', '/data/multitelas.db-wal', '/data/multitelas.db-shm']) {
    const r = await pedir(caminho);
    assert.notEqual(r.status, 200, caminho + ' foi servido');
  }
});

test('o repositório não é navegável por HTTP', async () => {
  // `.git` entrega o histórico inteiro; `server/` e `test/`, o código.
  for (const caminho of ['/.git/config', '/.git/HEAD', '/server/auth.js', '/server/db-sqlite.js',
    '/package.json', '/package-lock.json', '/test/seguranca.test.js', '/tools/icones.mjs']) {
    const r = await pedir(caminho);
    assert.notEqual(r.status, 200, caminho + ' foi servido');
  }
});

test('o que é público continua público', async () => {
  // A lista de permissão não pode ter fechado o produto junto com o buraco.
  for (const caminho of ['/player.html', '/sw.js', '/player.webmanifest',
    '/css/player.css', '/js/player.js', '/js/mural.js', '/icons/icone-192.png']) {
    const r = await pedir(caminho);
    assert.equal(r.status, 200, caminho + ' deveria ser público e respondeu ' + r.status);
  }
});

test('a landing e o painel continuam de pé', async () => {
  const raiz = await pedir('/');
  assert.equal(raiz.status, 200);
  const js = await pedir('/landing.js');
  assert.equal(js.status, 200);
  const vendor = await pedir('/vendor/tailwind.css');
  assert.equal(vendor.status, 200);
});

test('diretório irmão de mesmo prefixo não vaza', async () => {
  // `startsWith(DIR)` sem separador aceita `/landing-old` como se fosse
  // `/landing`. O `%2e%2e` chega decodificado antes do roteamento.
  const r = await pedir('/vendor/%2e%2e/%2e%2e/package.json');
  assert.notEqual(r.status, 200, 'saiu do diretório permitido');
});

/* ---------------- SEC-02: o token de redefinição ---------------- */

test('"esqueci a senha" nunca devolve o token na resposta', async () => {
  /*
   * O caminho completo do ataque, quando isto falhava: pedir o reset de um
   * e-mail qualquer, ler o `devLink` da resposta e usar o token — duas
   * requisições, nenhuma credencial, sessão do dono no fim.
   *
   * O gatilho não era um modo de teste: bastava faltar a chave do provedor de
   * e-mail, que é o estado de quem ainda não terminou de configurar.
   */
  /*
   * A conta precisa EXISTIR. Com e-mail desconhecido a rota devolve a resposta
   * genérica antes de chegar perto do token — e o teste passaria mesmo com o
   * defeito de volta, que é o pior tipo de teste que existe.
   */
  const email = 'vitima' + Date.now() + '@exemplo.com';
  const criada = await pedir('/api/auth/signup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'senha-de-teste-123', name: 'Vítima', aceite: true }),
  });
  assert.equal(criada.status, 201, 'não deu para criar a conta do teste: ' + criada.corpo);

  const r = await pedir('/api/auth/forgot', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  });
  assert.equal(r.status, 200);
  assert.ok(!/devLink/i.test(r.corpo), 'a resposta trouxe o link de redefinição: ' + r.corpo);
  assert.ok(!/reset=/.test(r.corpo), 'a resposta trouxe um token de reset: ' + r.corpo);
  assert.equal(r.corpo, JSON.stringify({ ok: true, sent: true }), 'a resposta não é a genérica: ' + r.corpo);
});

test('"esqueci a senha" responde igual para e-mail que existe e que não existe', async () => {
  // A diferença de status dizia quais contas existem na base.
  const inexistente = await pedir('/api/auth/forgot', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'nao-existe-mesmo@exemplo.com' }),
  });
  assert.equal(inexistente.status, 200);
  assert.equal(inexistente.corpo, JSON.stringify({ ok: true, sent: true }));
});

/* ---------------- SEC-05: o mural ---------------- */

test('listar as fotos do mural exige credencial', async () => {
  /*
   * O código do cartaz autoriza ENVIAR foto — é a regra escrita no próprio
   * módulo. Listar era público: quem fotografasse o cartaz de longe lia os
   * nomes e recados de um evento interno, meses depois, de fora da rede.
   */
  const r = await pedir('/api/mural/ABC123/fotos');
  assert.notEqual(r.status, 200, 'listou o mural sem credencial nenhuma');
});
