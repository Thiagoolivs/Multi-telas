/*
 * O relatório de qualidade das gerações (D43, nota do consultor no #135):
 * o servidor só CONTA — peça refeita por peça-ouro, papel e defeito; o nome
 * do campo corrigido à mão; o tipo do pedido no Ajustar e no Editar. Nunca a
 * frase, nunca a conta, nunca a pessoa.
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { spawn } = require('node:child_process');
const Q = require('../server/qualidade');

const RAIZ = path.join(__dirname, '..');
const ler = (f) => fs.readFileSync(path.join(RAIZ, f), 'utf8');

test('refazer: por peça-ouro, papel e defeito — um por defeito, nunca a frase', () => {
  const item = { papel: 'lateral', origem: { motor: 'ouro', base: 'oferta-foto' } };
  const chaves = Q.chavesDoRefazer(item, [
    'TV em pé: "Título" passa da borda',
    'TV deitada: "Título" passa da borda',
    'Lateral: Kicker e Título ficam um sobre o outro',
    'TV em pé: "Kicker" sobre a foto sem véu bastante (1.2:1 com a foto mais clara ou mais escura)',
    'TV em pé: "De" letra de 12px (o mínimo é 14px)',
    'Quadrada: "Link" QR de 120px (o mínimo é 160px para o celular ler)',
    'TV em pé: "Preco" o número da oferta (90px) é menor que "titulo" (130px)',
    'TV em pé: "Cta" encostado na borda (4px dela)',
    'TV em pé: "Apoio" some no fundo (1.8:1, o mínimo é 3:1)',
    'qualquer outra coisa',
  ]);
  assert.deepEqual(chaves, ['vaza', 'sobrepoe', 'foto', 'letra', 'qr', 'hierarquia', 'margem', 'contraste', 'outro']
    .map((d) => 'refazer|oferta-foto|lateral|' + d));
  // A peça que a IA compôs do zero é "ia"; nome estranho vira "outra" (o item vem do navegador).
  assert.deepEqual(Q.chavesDoRefazer({ papel: 'destaque', origem: { motor: 'html-gemini' } }, []), ['refazer|ia|destaque|outro']);
  assert.deepEqual(Q.chavesDoRefazer({ papel: '<x>', origem: { base: 'A B; DROP' } }, ['passa da borda']), ['refazer|outra|outra|vaza']);
  for (const c of chaves) assert.doesNotMatch(c, /Título|Kicker|px/);
});

test('edição à mão: o NOME dos campos que mudaram, e o estilo', () => {
  const antes = { modo: 'escuro', origem: { base: 'oferta-foto' }, campos: { titulo: 'Óculos', preco: '189', apoio: 'x' } };
  const depois = { modo: 'claro', campos: { titulo: 'Óculos de sol', preco: '189', apoio: 'x', cta: 'Reserve' } };
  assert.deepEqual(Q.chavesDaEdicao(antes, depois), ['editado|oferta-foto|titulo', 'editado|oferta-foto|cta', 'editado|oferta-foto|estilo']);
  assert.deepEqual(Q.chavesDaEdicao(antes, { modo: 'escuro', campos: antes.campos }), []);
});

test('pedido: o tipo da mudança, a pergunta da IA e o pedido que não mudou nada', () => {
  assert.deepEqual(Q.chavesDoPedido('ajustar', 'fazer', [{ tipo: 'texto' }, { tipo: 'texto' }, { tipo: 'refazer', foto: 'trocar' }, { tipo: 'tirar' }]),
    ['pedido|ajustar|texto', 'pedido|ajustar|foto-nova', 'pedido|ajustar|tirar']);
  assert.deepEqual(Q.chavesDoPedido('editar', 'perguntar', []), ['pedido|editar|pergunta']);
  assert.deepEqual(Q.chavesDoPedido('editar', 'responder', []), ['pedido|editar|nada']);
  assert.deepEqual(Q.chavesDoPedido('editar', 'fazer', [{ tipo: 'refazer', foto: 'usar' }, { tipo: 'refazer' }]), ['pedido|editar|foto-minha', 'pedido|editar|redesenhar']);
});

test('relatório: três listas ordenadas, com a participação de cada uma no seu grupo', () => {
  const r = Q.relatorio([
    { chave: 'refazer|oferta-foto|lateral|foto', n: 3 }, { chave: 'refazer|ia|destaque|vaza', n: 1 },
    { chave: 'editado|oferta-foto|titulo', n: 5 }, { chave: 'pedido|editar|texto', n: 2 }, { chave: 'lixo|x', n: 9 },
  ]);
  assert.deepEqual(r.refazer, [{ base: 'oferta-foto', papel: 'lateral', defeito: 'foto', n: 3, parte: 75 }, { base: 'ia', papel: 'destaque', defeito: 'vaza', n: 1, parte: 25 }]);
  assert.deepEqual(r.editado, [{ base: 'oferta-foto', campo: 'titulo', n: 5, parte: 100 }]);
  assert.deepEqual(r.pedido, [{ onde: 'editar', tipo: 'texto', n: 2, parte: 100 }]);
});

test('a contagem mora nos dois bancos (por dia, sem conta e sem pessoa) e nos quatro lugares', () => {
  for (const f of ['server/db-sqlite.js', 'server/db-postgres.js']) {
    const s = ler(f);
    assert.match(s, /CREATE TABLE IF NOT EXISTS qualidade \(\s*dia TEXT NOT NULL, chave TEXT NOT NULL, n INTEGER NOT NULL DEFAULT 0, PRIMARY KEY \(dia, chave\)/, f);
    for (const fn of ['contarQualidade', 'qualidadeDesde', 'limparQualidade']) assert.match(s, new RegExp('async function ' + fn + '\\('), f + ' ' + fn);
    assert.match(s, /contarQualidade, qualidadeDesde, limparQualidade,/, f + ': exportadas');
  }
  const s = ler('server.js');
  assert.match(s, /qualidade\.contar\(db, qualidade\.chavesDoRefazer\(b\.item, b\.problemas\)\)/);
  assert.match(s, /db\.limparQualidade\(/);
  const c = ler('server/routes/campanhas.js');
  assert.match(c, /qualidade\.chavesDoPedido\('ajustar'/);
  assert.match(c, /qualidade\.chavesDoPedido\('editar'/);
  assert.match(c, /qualidade\.chavesDaEdicao\(antes\.item, v\.item\)/);
  assert.match(ler('web/src/pages/PlatformPage.jsx'), /<Qualidade dias=\{dias\} \/>/);
});

/* ---------- de ponta a ponta: o cliente conta, só o operador lê ---------- */

const PORTA = 8300 + Math.floor(Math.random() * 9);
function pedir(caminho, o = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port: PORTA, path: caminho, method: o.method || 'GET',
      headers: { ...(o.body ? { 'Content-Type': 'application/json' } : {}), ...(o.cookie ? { Cookie: o.cookie } : {}) } }, (res) => {
      let corpo = '';
      res.on('data', (x) => { corpo += x; });
      res.on('end', () => {
        let json = null; try { json = JSON.parse(corpo); } catch (e) { json = null; }
        resolve({ status: res.statusCode, json, cookies: [].concat(res.headers['set-cookie'] || []) });
      });
    });
    req.on('error', reject);
    req.setTimeout(8000, () => req.destroy(new Error('a rota ' + caminho + ' não respondeu')));
    if (o.body) req.write(JSON.stringify(o.body));
    req.end();
  });
}
const jarra = (lista) => lista.map((x) => x.split(';')[0]).filter((kv) => kv.split('=')[1]).join('; ');

test('o refazer conta; o relatório é só do operador e não traz texto', async (t) => {
  const marca = Date.now();
  const opEmail = 'op' + marca + '@teste.local';
  const dados = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'mt-qualidade-'));
  // Sem chave de IA nenhuma: o refazer roda no modo de teste e não gasta nada de ninguém.
  const semChaves = { ANTHROPIC_API_KEY: '', GEMINI_API_KEY: '', GOOGLE_API_KEY: '', GROQ_API_KEY: '', PIXABAY_API_KEY: '' };
  const servidor = spawn(process.execPath, ['server.js'], {
    cwd: RAIZ, stdio: 'ignore',
    env: { ...process.env, ...semChaves, PORT: String(PORTA), STORAGE: 'local', SKIP_VERIFY: '1', DATABASE_URL: '', DATA_DIR: dados, ADMIN_EMAILS: opEmail },
  });
  t.after(() => servidor.kill());
  let ok = false;
  for (let i = 0; i < 160 && !ok; i++) { try { await pedir('/tv'); ok = true; } catch (e) { await new Promise((r) => setTimeout(r, 250)); } }
  assert.ok(ok, 'o servidor de teste não subiu');

  const conta = (email, name) => pedir('/api/auth/signup', { method: 'POST', body: { email, password: 'senha-de-teste-123', name, aceite: true } });
  const op = await conta(opEmail, 'Operação');
  const cli = await conta('cliente' + marca + '@teste.local', 'Loja do Teste');
  assert.equal(op.status, 201); assert.equal(cli.status, 201);
  const cOp = jarra(op.cookies);
  const cCli = jarra(cli.cookies);

  const item = require('../server/compositor').preencherPapel({ papel: 'lateral', empresa: 'Loja do Teste', textos: { titulo: 'Oferta da semana' } });
  const r = await pedir('/api/ai/refazer-peca', { method: 'POST', cookie: cCli, body: { item, problemas: ['TV em pé: "Título secreto do cliente" passa da borda'] } });
  assert.ok(r.status === 200 || r.status === 202, 'refazer respondeu ' + r.status);

  // Cliente não chega no relatório.
  assert.equal((await pedir('/api/plataforma/qualidade', { cookie: cCli })).status, 404);
  const rel = await pedir('/api/plataforma/qualidade?dias=7', { cookie: cOp });
  assert.equal(rel.status, 200);
  assert.deepEqual(rel.json.refazer.map((x) => [x.base, x.papel, x.defeito, x.n]), [[item.origem.base, 'lateral', 'vaza', 1]]);
  assert.doesNotMatch(JSON.stringify(rel.json), /secreto|Loja do Teste|@teste/);
});
