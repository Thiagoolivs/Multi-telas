/*
 * Aniversário e mural entram na TV sozinhos (EXECUTOR D15).
 *
 * O dono: o aniversariante aparece na SEMANA do aniversário, e o sistema
 * administra a convivência com as datas sazonais. "Mostrar nas TVs" liga uma
 * vez (todas, grupo ou TVs escolhidas); na semana o player encaixa o cartão
 * no rodízio da principal (1 a cada 4; no dia, 1 a cada 2, como destaque);
 * semana sem aniversário, nada. O mural idem, 1 a cada 5. E o "na tela" do
 * mural só aparece quando ele está mesmo numa TV.
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const http = require('node:http');
const path = require('node:path');
const vm = require('node:vm');
const { spawn } = require('node:child_process');

const A = require('../server/automaticos.js');
const RAIZ = path.join(__dirname, '..');
const PLAYER = fs.readFileSync(path.join(RAIZ, 'js/player.js'), 'utf8');

test('a escolha da conta: só o que existe nesta conta, e quem alcança cada TV', () => {
  const n = A.normalizar({ aniversarios: { ligado: true, telas: ['dev_a', 'dev_de_outra_conta'] }, mural: { codigo: 'abcd', telas: { grupo: ' Loja  Centro ' } } },
    { idsDaConta: ['dev_a', 'dev_b'], codigosDeMural: ['ABCD'] });
  assert.deepEqual(n.aniversarios, { ligado: true, telas: ['dev_a'] });
  assert.deepEqual(n.mural, { codigo: 'ABCD', telas: { grupo: 'Loja Centro' } });
  assert.equal(A.normalizar({ mural: { codigo: 'XXXX' } }, { codigosDeMural: ['ABCD'] }).mural, null, 'mural de outra conta entrou');
  assert.deepEqual(A.paraATela(n, { id: 'dev_a', grupo: 'Loja Centro' }), { aniversarios: true, mural: 'ABCD' });
  assert.deepEqual(A.paraATela(n, { id: 'dev_b', grupo: 'Fábrica' }), { aniversarios: false, mural: '' });
  assert.deepEqual(A.paraATela(null, { id: 'dev_a' }), { aniversarios: false, mural: '' });
});

// As funções do player, extraídas de verdade (como em tv-vazia.test.js).
function doPlayer(birthdays) {
  const ini = PLAYER.indexOf('  function zonaPrincipal(cfg) {');
  const fim = PLAYER.indexOf('  function startPlaylist(');
  const ctx = { global: { MT_BIRTHDAYS: birthdays, MT_getLayout: () => ({ zones: [{ id: 'cabecalho', type: 'header' }, { id: 'principal', type: 'playlist' }, { id: 'lateral', type: 'playlist' }] }) }, module: {} };
  ctx.MT_getLayout = ctx.global.MT_getLayout;
  vm.createContext(ctx);
  vm.runInContext(PLAYER.slice(ini, fim) + '\nmodule.exports = { comAutomaticos, automaticosDaZona };', ctx);
  return ctx.module.exports;
}

test('o player encaixa o cartão na semana; no dia, mais vezes; sem aniversário, nada', () => {
  const agora = new Date(2026, 9, 20, 10, 0);   // 20/10
  const pecas = [1, 2, 3, 4, 5, 6, 7, 8].map((i) => ({ type: 'peca-html', id: i }));
  const cfg = { settings: { layoutId: 'x', automaticos: { aniversarios: true, mural: '' } } };
  const tipos = (lista) => lista.map((x) => (x.type === 'birthdayauto' ? 'B' : x.type === 'mural' ? 'M' : '.')).join('');

  const semana = doPlayer([{ nome: 'Ana', dia: 23, mes: 10 }]);
  assert.equal(tipos(semana.comAutomaticos(pecas, cfg, 'principal', agora)), '....B....B', '1 a cada 4 na semana');
  assert.equal(tipos(semana.comAutomaticos(pecas, cfg, 'lateral', agora)), '........', 'só a principal');

  const hoje = doPlayer([{ nome: 'Ana', dia: 20, mes: 10 }]);
  assert.equal(tipos(hoje.comAutomaticos(pecas, cfg, 'principal', agora)), '..B..B..B..B', 'no dia, 1 a cada 2');

  const longe = doPlayer([{ nome: 'Ana', dia: 15, mes: 12 }]);
  assert.equal(tipos(longe.comAutomaticos(pecas, cfg, 'principal', agora)), '........', 'semana sem aniversário mostrou algo');

  // Zona vazia: o cartão entra sozinho; e o mural, com as fotos aprovadas.
  const comMural = { settings: { automaticos: { aniversarios: true, mural: 'ABCD' } } };
  assert.equal(tipos(semana.comAutomaticos([], comMural, 'principal', agora)), 'BM');
  assert.equal(tipos(semana.comAutomaticos(pecas.slice(0, 5), comMural, 'principal', agora)), '....B.M');
  // A data sazonal convive: as peças dela continuam todas, o cartão só se intercala.
  const sazonais = [{ type: 'peca-html', _campanha: 'Natal' }, { type: 'peca-html', _campanha: 'Natal' }];
  const r = semana.comAutomaticos(sazonais, cfg, 'principal', agora);
  assert.equal(r.filter((x) => x._campanha === 'Natal').length, 2);
  assert.match(PLAYER, /const single = items\.length === 1 && !hasAgenda\(items\[0\]\) && !auto;/);
  assert.match(PLAYER, /const ativos = comAutomaticos\(agendado \? items\.filter\(agendadoAgora\) : items, cfg, zonaId\);/);
});

/* ---------------- servidor de verdade ---------------- */

const PORTA = 6200 + Math.floor(Math.random() * 90);
function pedir(caminho, o = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port: PORTA, path: caminho, method: o.method || 'GET',
      headers: { ...(o.json ? { 'Content-Type': 'application/json' } : {}), ...(o.cookie ? { Cookie: o.cookie } : {}), ...(o.headers || {}) } }, (res) => {
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

test('a conta liga "mostrar nas TVs" e a TV recebe (o painel não)', async (t) => {
  const dados = fs.mkdtempSync(path.join(os.tmpdir(), 'mt-d15-'));
  const servidor = spawn(process.execPath, ['server.js'], {
    cwd: RAIZ, stdio: 'ignore',
    env: { ...process.env, PORT: String(PORTA), STORAGE: 'local', SKIP_VERIFY: '1', DATABASE_URL: '', DATA_DIR: dados, MEDIA_DIR: dados, AI_PROVIDER: 'dev' },
  });
  t.after(() => { servidor.kill(); try { fs.rmSync(dados, { recursive: true, force: true }); } catch (e) { /* o Windows segura o arquivo */ } });
  let ok = false;
  for (let i = 0; i < 60 && !ok; i++) { try { await pedir('/tv'); ok = true; } catch (e) { await new Promise((r) => setTimeout(r, 250)); } }
  assert.ok(ok, 'o servidor de teste não subiu');
  const c = cookieDe(await pedir('/api/auth/signup', { method: 'POST', json: { email: 'd15' + Date.now() + '@teste.local', password: 'senha-de-teste-123', name: 'Loja', aceite: true } }));
  const tv = (await pedir('/api/devices', { method: 'POST', json: {} })).json;
  const daTv = { 'x-device-token': tv.deviceToken };
  await pedir('/api/devices/' + tv.id + '/config', { headers: daTv });
  assert.ok((await pedir('/api/pair', { method: 'POST', cookie: c, json: { code: tv.code } })).status < 300);
  assert.equal((await pedir('/api/devices/' + tv.id + '/config', { method: 'PUT', cookie: c, json: { settings: { layoutId: 'full' }, zonas: {} } })).status, 200);

  let cfg = (await pedir('/api/devices/' + tv.id + '/config', { headers: daTv })).json;
  assert.equal(cfg.settings.automaticos, undefined, 'desligado, nada vai');

  const r = await pedir('/api/automaticos', { method: 'PUT', cookie: c, json: { aniversarios: { ligado: true, telas: 'todas' } } });
  assert.equal(r.status, 200);
  cfg = (await pedir('/api/devices/' + tv.id + '/config', { headers: daTv })).json;
  assert.deepEqual(cfg.settings.automaticos, { aniversarios: true, mural: '' });
  const doPainel = (await pedir('/api/devices/' + tv.id + '/config', { cookie: c })).json;
  assert.equal(doPainel.settings.automaticos, undefined, 'o painel gravaria de volta na programação');

  // Só as TVs escolhidas: uma TV de fora não recebe.
  await pedir('/api/automaticos', { method: 'PUT', cookie: c, json: { aniversarios: { ligado: true, telas: ['dev_nao_existe'] } } });
  const ler = (await pedir('/api/automaticos', { cookie: c })).json;
  assert.deepEqual(ler.automaticos.aniversarios.telas, [], 'aceitou TV que não é da conta');
  assert.equal((await pedir('/api/automaticos')).status, 401);
});

test('a TV não espera 30 s: o cartão entra assim que a lista de aniversariantes chega', () => {
  assert.ok(PLAYER.includes("try { global.dispatchEvent(new Event('mt:aniversarios')); } catch (e) {}"));
  assert.ok(PLAYER.includes("if (auto) global.addEventListener('mt:aniversarios', aoChegarAniversarios);"));
  assert.ok(PLAYER.includes("if (auto) global.removeEventListener('mt:aniversarios', aoChegarAniversarios);"), 'o ouvinte fica pendurado ao refazer a zona');
});
