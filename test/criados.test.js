/*
 * Criar · Criando · Criados (EXECUTOR D47) e as conversas antigas (D49).
 *
 * O dono, em 23/10: "os chats antigos não estão acessíveis, aparece sempre a
 * última campanha, mas se ela estiver pronta, tem que ficar na aba criados".
 * O Criar começa limpo; o que ficou pronto mora em Criados; todas as
 * conversas ficam ao lado, com busca, arquivadas e renomear.
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const http = require('node:http');
const path = require('node:path');
const { spawn } = require('node:child_process');

const RAIZ = path.join(__dirname, '..');
const ler = (f) => fs.readFileSync(path.join(RAIZ, f), 'utf8').replace(/\r\n/g, '\n');

test('o Criar começa limpo e manda o que ficou pronto para Criados; a conversa criada só se lê', () => {
  const C = ler('web/src/pages/CriarPage.jsx');
  // A conversa guardada que já virou campanha não abre sozinha.
  assert.match(C, /if \(o && o\.sozinha && c\.estado === 'gerado'\) \{ guardar\(''\); return; \}/);
  // Terminou: Criados com ela aberta, e o Criar limpo — mas só se a pessoa ainda está aqui.
  const t = C.slice(C.indexOf('function terminou(c) {'), C.indexOf('async function gerar('));
  assert.match(t, /if \(!montada\.current\) return;/);
  assert.match(t, /nova\(\);/);
  assert.match(t, /onIr\('campanhas', \{ campanha: c\.id \}\)/);
  assert.doesNotMatch(C, /<ResultadoCampanha/, 'o resultado voltou a morar no Criar');
  // Conversa criada: sem caixa de mandar, com o caminho para Criados.
  assert.match(C, /const entrada = criada \? \(/);
  assert.match(C, /if \(!frase \|\| pensando \|\| criada\) return;/);
  assert.match(C, /Abrir em Criados/);
  // Todas as conversas: coluna no computador, diálogo no celular.
  assert.match(C, /<aside className="hidden xl:sticky xl:top-4 xl:block[^"]*" aria-label="Conversas">\{lista\}<\/aside>/);
  assert.match(C, /<Dialog open=\{verConversas\}/);
  const L = ler('web/src/components/criar/ListaDeConversas.jsx');
  assert.match(L, /criar\.conversas\(\{ q: busca\.trim\(\), estado: arquivadas \? '' : filtro, arquivadas, pular \}\)/);
  assert.match(L, /\['andamento', 'Em andamento'\], \['criadas', 'Viraram campanha'\]/);
  // Criados: o título e o próximo passo (ligar a TV) que vinham do Criar.
  const K = ler('web/src/pages/CampanhasPage.jsx');
  assert.match(K, /arquivadas \? 'Arquivados' : 'Criados'/);
  assert.match(K, /onNova=\{onIr \? \(\) => onIr\('criar'\) : undefined\}/);
});

/* ---------------- servidor de verdade ---------------- */

const PORTA = 7700 + Math.floor(Math.random() * 90);
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

test('as conversas: todas, com busca, por estado, arquivadas à parte e renomear — presas à conta', async (t) => {
  const dados = fs.mkdtempSync(path.join(os.tmpdir(), 'mt-d47-'));
  const env = { ...process.env, PORT: String(PORTA), STORAGE: 'local', SKIP_VERIFY: '1', DATABASE_URL: '', DATA_DIR: dados, MEDIA_DIR: dados, AI_PROVIDER: 'dev', MT_APK_REPO: 'desligado' };
  const servidor = spawn(process.execPath, ['server.js'], { cwd: RAIZ, stdio: 'ignore', env });
  t.after(() => { servidor.kill(); try { fs.rmSync(dados, { recursive: true, force: true }); } catch (e) { /* o Windows segura o arquivo */ } });
  let ok = false;
  for (let i = 0; i < 160 && !ok; i++) { try { await pedir('/tv'); ok = true; } catch (e) { await new Promise((r) => setTimeout(r, 250)); } }
  assert.ok(ok, 'o servidor de teste não subiu');
  const conta = async (nome) => (await pedir('/api/auth/signup', { method: 'POST', json: { email: nome + Date.now() + Math.random().toString(36).slice(2, 6) + '@teste.local', password: 'senha-de-teste-123', name: nome, aceite: true } }))
    .cookies.map((x) => x.split(';')[0]).filter((x) => !x.endsWith('=')).join('; ');
  const a = await conta('Loja');
  const b = await conta('Outra');

  // 35 conversas: passa da página de 30.
  const ids = [];
  for (let i = 0; i < 35; i++) {
    const r = await pedir('/api/ai/conversa', { method: 'POST', cookie: a, json: { texto: (i === 7 ? 'Promoção de pão de queijo' : 'Aviso de horário ' + i) } });
    assert.equal(r.status, 200, 'a conversa ' + i + ' não abriu');
    ids.push(r.json.conversa.id);
  }
  const p1 = (await pedir('/api/conversas', { cookie: a })).json;
  assert.deepEqual([p1.conversas.length, p1.mais], [30, true], 'cortou calado em 20');
  const p2 = (await pedir('/api/conversas?pular=30', { cookie: a })).json;
  assert.deepEqual([p2.conversas.length, p2.mais], [5, false]);
  assert.equal(p1.conversas[0].mensagens, undefined, 'a lista carregou as mensagens de todas');

  // Busca pelo título (com % e _ que não viram curinga).
  const achou = (await pedir('/api/conversas?q=' + encodeURIComponent('pão de queijo'), { cookie: a })).json.conversas;
  assert.deepEqual(achou.map((c) => c.id), [ids[7]]);
  assert.equal((await pedir('/api/conversas?q=' + encodeURIComponent('%'), { cookie: a })).json.conversas.length, 0);

  // Por estado: nenhuma virou campanha ainda.
  assert.equal((await pedir('/api/conversas?estado=criadas', { cookie: a })).json.conversas.length, 0);
  assert.equal((await pedir('/api/conversas?estado=andamento', { cookie: a })).json.conversas.length, 30);

  // Renomear e arquivar não mexem no escopo nem nas mensagens.
  const antes = (await pedir('/api/conversas/' + ids[3], { cookie: a })).json.conversa;
  const ren = await pedir('/api/conversas/' + ids[3], { method: 'PUT', cookie: a, json: { titulo: '  Promo de sexta  ' } });
  assert.equal(ren.json.conversa.titulo, 'Promo de sexta');
  assert.deepEqual(ren.json.conversa.mensagens, antes.mensagens);
  assert.equal((await pedir('/api/conversas/' + ids[3], { method: 'PUT', cookie: a, json: { titulo: '   ' } })).status, 400);
  assert.equal((await pedir('/api/conversas/' + ids[3], { method: 'PUT', cookie: a, json: { arquivada: true } })).status, 200);
  const ativas = (await pedir('/api/conversas?pular=0', { cookie: a })).json.conversas.map((c) => c.id);
  assert.ok(!ativas.includes(ids[3]), 'a arquivada continuou na lista');
  assert.deepEqual((await pedir('/api/conversas?arquivadas=1', { cookie: a })).json.conversas.map((c) => c.id), [ids[3]]);

  // De outra conta: 404 para ler, renomear e arquivar; e a lista dela vem vazia.
  assert.equal((await pedir('/api/conversas/' + ids[0], { cookie: b })).status, 404);
  assert.equal((await pedir('/api/conversas/' + ids[0], { method: 'PUT', cookie: b, json: { titulo: 'roubada' } })).status, 404);
  assert.equal((await pedir('/api/conversas/' + ids[0], { method: 'PUT', cookie: b, json: { arquivada: true } })).status, 404);
  assert.equal((await pedir('/api/conversas', { cookie: b })).json.conversas.length, 0);
});
