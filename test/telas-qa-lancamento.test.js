/*
 * As telas no QA de lançamento (03/11), com o servidor de verdade:
 *
 *   - papéis: o membro opera, mas não põe nem tira TV da mensalidade e não
 *     cala o aviso de queda (a matriz está em server/routes/telas.js);
 *   - o limite do pareamento conta só código ERRADO: vinte TVs certas
 *     seguidas pareiam, e o 429 diz quanto esperar;
 *   - reconectar leva grupo e horário, e o caminho óbvio (parear a TV que
 *     voltou com código novo) pergunta "é a TV X?" em vez de criar uma
 *     segunda tela cobrada;
 *   - "mostrar nas TVs" chega à TV aberta na hora (aviso de config);
 *   - a TV tirada da conta recebe do servidor a resposta que o player usa
 *     para voltar ao pareamento.
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const http = require('node:http');
const path = require('node:path');
const { spawn } = require('node:child_process');
const R = require('../server/reconectar');

const RAIZ = path.join(__dirname, '..');
const ler = (f) => fs.readFileSync(path.join(RAIZ, f), 'utf8');
const PORTA = 7600 + Math.floor(Math.random() * 90);

function pedir(caminho, o = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port: PORTA, path: caminho, method: o.method || 'GET',
      headers: Object.assign({}, o.json ? { 'Content-Type': 'application/json' } : {}, o.cookie ? { Cookie: o.cookie } : {}, o.headers || {}) }, (res) => {
      let txt = '';
      res.on('data', (c) => { txt += c; });
      res.on('end', () => { let json = null; try { json = JSON.parse(txt); } catch (e) { json = null; } resolve({ status: res.statusCode, json, txt, headers: res.headers, cookies: [].concat(res.headers['set-cookie'] || []) }); });
    });
    req.on('error', reject);
    req.setTimeout(30000, () => req.destroy(new Error('a rota ' + caminho + ' não respondeu')));
    if (o.json) req.write(JSON.stringify(o.json));
    req.end();
  });
}
const jarra = (r) => r.cookies.map((x) => x.split(';')[0]).filter((x) => !x.endsWith('=')).join('; ');

/* ---------------- a regra pura ---------------- */

test('"é a TV X?": o mesmo aparelho, parado antes de a nova nascer, e sem tempo real aberto', () => {
  const info = { ua: 'Mozilla/5.0 (SMART-TV; Tizen 6.0)', w: 1920, h: 1080, dpr: 1 };
  const nova = { id: 'dev_n', created_at: 1000, last_seen: 1200, info: JSON.stringify(info) };
  const telas = [
    { id: 'dev_a', name: 'Recepção', last_seen: 900, info: JSON.stringify(info) },
    { id: 'dev_b', name: 'Vitrine', last_seen: 950, info: JSON.stringify({ ...info, w: 1280, h: 720 }) },
    { id: 'dev_c', name: 'Caixa', last_seen: 1100, info: JSON.stringify(info) },   // seguiu pulsando depois: está viva
    { id: 'dev_d', name: 'Doca', last_seen: 800, info: JSON.stringify(info) },
    nova,
  ];
  const ids = (l) => l.map((x) => x.id);
  assert.deepEqual(ids(R.candidatas(telas, nova, { aoVivo: (id) => id === 'dev_d' })), ['dev_a'], 'outro aparelho, a viva e a com tempo real não entram');
  assert.deepEqual(ids(R.candidatas(telas, nova, { todas: true })), ['dev_b', 'dev_a', 'dev_d'], 'no limite do plano, toda tela parada é oferecida');
  assert.equal(R.mesmoAparelho(null, info), false, 'sem o que comparar, não é o mesmo');
  assert.equal(R.mesmoAparelho(JSON.stringify(info), info), true);
});

test('a TV percebe que saiu da conta só pela resposta do servidor, nunca por queda de rede', () => {
  const C = ler('js/cloud.js');
  assert.match(C, /\[401, 403, 404, 410\]\.indexOf\(e\.status\) >= 0/);
  assert.match(C, /e\.doServidor = !!\(data && typeof data\.error === 'string'\)/, 'a página de erro de um proxy não pode desparear a TV');
  assert.match(C, /if \(perdeuAConta\(e\) && await identidadeRecusada\(id\)\)/, 'confere uma segunda vez antes de esquecer');
  const P = ler('js/player.js');
  assert.match(P, /document\.addEventListener\('mt:sem-conta'/);
  assert.match(P, /MTCloud\.resetDevice\(\)/);
  assert.match(P, /if \(meta && meta\.automaticos\) loadBirthdays\(dev\.id\);/);
});

/* ---------------- o servidor de verdade ---------------- */

test('papéis, limite de pareamento, reconectar sem duplicar e o aviso às TVs', async (t) => {
  const dados = fs.mkdtempSync(path.join(os.tmpdir(), 'mt-qa-telas-'));
  const servidor = spawn(process.execPath, ['server.js'], {
    cwd: RAIZ, stdio: 'ignore',
    env: { ...process.env, PORT: String(PORTA), STORAGE: 'local', SKIP_VERIFY: '1', DATABASE_URL: '', DATA_DIR: dados, MEDIA_DIR: dados, AI_PROVIDER: 'dev', TRUST_PROXY: '', RAILWAY_ENVIRONMENT: '' },
  });
  t.after(() => { servidor.kill(); try { fs.rmSync(dados, { recursive: true, force: true }); } catch (e) { /* o Windows segura o arquivo */ } });
  let ok = false;
  for (let i = 0; i < 160 && !ok; i++) { try { await pedir('/tv'); ok = true; } catch (e) { await new Promise((r) => setTimeout(r, 250)); } }
  assert.ok(ok, 'o servidor de teste não subiu');

  const marca = Date.now();
  const dono = jarra(await pedir('/api/auth/signup', { method: 'POST', json: { email: 'dono' + marca + '@teste.local', password: 'senha-de-teste-123', name: 'Rede Corp', aceite: true } }));
  assert.equal((await pedir('/api/billing/dev-activate', { method: 'POST', cookie: dono, json: { plan: 'pro' } })).status, 200);
  async function entrarComo(role) {
    const email = role + marca + '@teste.local';
    const conv = await pedir('/api/team/invites', { method: 'POST', cookie: dono, json: { email, role } });
    assert.equal(conv.status, 201, 'convite de ' + role);
    const r = await pedir('/api/auth/signup', { method: 'POST', json: { email, password: 'senha-de-teste-123', name: role, aceite: true, inviteCode: conv.json.code } });
    assert.equal(r.status, 201, 'cadastro de ' + role);
    return jarra(r);
  }
  const membro = await entrarComo('member');
  const admin = await entrarComo('admin');

  const info = { ua: 'Mozilla/5.0 (SMART-TV; Tizen 6.0) QA', w: 1920, h: 1080, dpr: 1, versao: 'qa' };
  async function tvNova(comInfo) {
    const tv = (await pedir('/api/devices', { method: 'POST', json: {} })).json;
    await pedir('/api/devices/' + tv.id + '/heartbeat', { method: 'POST', json: comInfo || { ua: 'tv-' + tv.id, w: 1280, h: 720 }, headers: { 'x-device-token': tv.deviceToken } });
    return tv;
  }
  const parear = (cookie, code, extra) => pedir('/api/pair', { method: 'POST', cookie, json: Object.assign({ code }, extra || {}) });

  /* --- Limite: vinte pareamentos CERTOS seguidos passam (a frota de 20 TVs do QA travava na 16ª). --- */
  const frota = [];
  for (let i = 0; i < 20; i++) {
    const tv = await tvNova();
    const r = await parear(dono, tv.code, { name: 'TV frota ' + (i + 1) });
    assert.equal(r.status, 200, 'o pareamento ' + (i + 1) + ' foi barrado: ' + r.txt);
    frota.push(tv);
  }

  /* --- Papéis. --- */
  const alvo = frota[0];
  assert.equal((await pedir('/api/devices/' + alvo.id + '/rename', { method: 'POST', cookie: membro, json: { name: 'Refeitório' } })).status, 200, 'o membro renomeia');
  assert.equal((await pedir('/api/devices/' + alvo.id + '/grupo', { method: 'POST', cookie: membro, json: { grupo: 'Galpão' } })).status, 200, 'o membro põe no grupo');
  const exp = { alerta: true, dias: [0, 1, 2, 3, 4, 5, 6], inicio: '06:00', fim: '23:00', foraDoHorario: 'relogio' };
  assert.equal((await pedir('/api/devices/' + alvo.id + '/expediente', { method: 'POST', cookie: membro, json: exp })).status, 200, 'o membro muda o horário');
  const calar = await pedir('/api/devices/' + alvo.id + '/expediente', { method: 'POST', cookie: membro, json: { ...exp, alerta: false } });
  assert.equal(calar.status, 403, 'o membro desligou o aviso de queda');
  assert.match(calar.json.error, /dono ou um administrador/);
  const tirar = await pedir('/api/devices/' + frota[1].id, { method: 'DELETE', cookie: membro });
  assert.equal(tirar.status, 403, 'o membro removeu uma TV');
  assert.match(tirar.json.error, /mensalidade/);
  const tvDoMembro = await tvNova();
  assert.equal((await parear(membro, tvDoMembro.code)).status, 403, 'o membro ligou uma TV nova na mensalidade');
  assert.equal((await pedir('/api/devices/' + frota[1].id, { method: 'DELETE', cookie: admin })).status, 200, 'o admin remove');
  assert.equal((await pedir('/api/devices/' + alvo.id + '/expediente', { method: 'POST', cookie: admin, json: { ...exp, alerta: false } })).status, 200, 'o admin desliga o aviso');
  assert.equal((await pedir('/api/devices/' + alvo.id + '/expediente', { method: 'POST', cookie: membro, json: { ...exp, alerta: false } })).status, 200,
    'com o aviso já desligado, o membro muda o horário sem ser barrado');
  await pedir('/api/devices/' + alvo.id + '/expediente', { method: 'POST', cookie: dono, json: exp });

  /* --- A TV removida: o pulso e a rota da TV dizem 404 em JSON (o player volta ao pareamento). --- */
  const removida = frota[1];
  const pulso = await pedir('/api/devices/' + removida.id + '/heartbeat', { method: 'POST', json: {}, headers: { 'x-device-token': removida.deviceToken } });
  assert.equal(pulso.status, 404);
  assert.equal(typeof pulso.json.error, 'string');

  /* --- Reconectar leva grupo e horário (e não espera os 90 s de "fora do ar"). --- */
  await pedir('/api/devices/' + alvo.id + '/config', { method: 'PUT', cookie: dono, json: { settings: { nome: 'Rede Corp' }, zonas: {} } });
  const perdida = await tvNova();
  const rec = await pedir('/api/devices/' + alvo.id + '/reconectar', { method: 'POST', cookie: membro, json: { code: perdida.code } });
  assert.equal(rec.status, 200, 'reconectar: ' + rec.txt);
  let lista = (await pedir('/api/devices', { cookie: dono })).json.devices;
  const volta = lista.find((d) => d.id === perdida.id);
  assert.ok(volta && !lista.find((d) => d.id === alvo.id), 'a tela antiga continuou no painel');
  assert.equal(volta.name, 'Refeitório');
  assert.equal(volta.grupo, 'Galpão', 'o grupo sumiu ao reconectar');
  assert.equal(volta.expediente.inicio, '06:00', 'o horário voltou ao padrão ao reconectar');
  assert.equal(volta.expediente.foraDoHorario, 'relogio');

  /* --- O caminho óbvio: parear a TV que voltou com código novo pergunta "é a TV X?". --- */
  const quarta = frota[3];
  // A "Doca" é um aparelho conhecido; ela perde a identidade e volta como TV nova, do mesmo aparelho.
  await pedir('/api/devices/' + quarta.id + '/heartbeat', { method: 'POST', json: info, headers: { 'x-device-token': quarta.deviceToken } });
  await pedir('/api/devices/' + quarta.id + '/grupo', { method: 'POST', cookie: dono, json: { grupo: 'Docas' } });
  // Ela estava com o tempo real aberto, e a conexão fechou quando o navegador dela fechou.
  await new Promise((resolve) => {
    const req = http.request({ host: '127.0.0.1', port: PORTA, path: '/api/devices/' + quarta.id + '/events', headers: { 'x-device-token': quarta.deviceToken } }, (res) => {
      res.once('data', () => { req.destroy(); setTimeout(resolve, 150); });
    });
    req.on('error', () => {});
    req.end();
  });
  const voltou = await tvNova(info);
  const antes = (await pedir('/api/devices', { cookie: dono })).json.devices.length;
  const pergunta = await parear(dono, voltou.code, { name: 'Doca 3' });
  assert.equal(pergunta.status, 409, 'criou uma segunda tela sem perguntar: ' + pergunta.txt);
  assert.equal(pergunta.json.code, 'parece-reconectar');
  assert.deepEqual(pergunta.json.telas.map((x) => x.id), [quarta.id]);
  assert.match(pergunta.json.error, /É ela\?/);
  const sim = await parear(dono, voltou.code, { reconectar: quarta.id });
  assert.equal(sim.status, 200);
  assert.equal(sim.json.reconectada, true);
  lista = (await pedir('/api/devices', { cookie: dono })).json.devices;
  assert.equal(lista.length, antes, 'reconectar pelo parear mudou o número de telas (e a fatura)');
  assert.equal(lista.find((d) => d.id === voltou.id).grupo, 'Docas');
  // "Não, é outra TV": cria a tela nova, como sempre.
  const outra = await tvNova(info);
  const ainda = await parear(dono, outra.code);
  // A Doca 3 (agora a `voltou`) é o mesmo aparelho e, aqui no teste, sem tempo real aberto: o servidor pergunta de novo.
  assert.equal(ainda.status, 409);
  assert.deepEqual(ainda.json.telas.map((x) => x.id), [voltou.id]);
  const nao = await parear(dono, outra.code, { nova: true, name: 'Doca 4' });
  assert.equal(nao.status, 200);
  assert.equal((await pedir('/api/devices', { cookie: dono })).json.devices.length, antes + 1);

  /* --- "Mostrar nas TVs" avisa a TV aberta na hora. --- */
  const sse = await new Promise((resolve, reject) => {
    const tv = frota[5];
    const req = http.request({ host: '127.0.0.1', port: PORTA, path: '/api/devices/' + tv.id + '/events', headers: { 'x-device-token': tv.deviceToken } }, (res) => {
      let txt = '';
      res.on('data', (c) => {
        txt += c;
        if (/event: ready/.test(txt) && !res._pediu) {
          res._pediu = true;
          pedir('/api/automaticos', { method: 'PUT', cookie: membro, json: { aniversarios: { ligado: true } } }).catch(reject);
        }
        if (/event: config/.test(txt)) { req.destroy(); resolve(txt); }
      });
    });
    req.on('error', (e) => { if (!/socket hang up|aborted/.test(e.message)) reject(e); });
    setTimeout(() => { req.destroy(); reject(new Error('a TV aberta não recebeu aviso do "mostrar nas TVs"')); }, 8000);
    req.end();
  });
  assert.match(sse, /"automaticos":true/);

  /* --- Por fim, o limite: só os ERROS contam, e o 429 diz quanto esperar. --- */
  let r;
  for (let i = 0; i < 15; i++) {
    r = await parear(dono, 'ZZZZZ' + String.fromCharCode(65 + i));
    assert.equal(r.status, 404);
  }
  r = await parear(dono, 'ZZZZZZ');
  assert.equal(r.status, 429, 'o 16º código errado passou');
  assert.match(r.json.error, /Espere \d+ minutos? e tente de novo/);
  assert.ok(Number(r.headers['retry-after']) > 0);
  // Mandar outro X-Forwarded-For não dá balde novo (o servidor não está atrás de proxy aqui).
  const pulo = await pedir('/api/pair', { method: 'POST', cookie: dono, json: { code: 'ZZZZZZ' }, headers: { 'X-Forwarded-For': '203.0.113.' + (marca % 200) } });
  assert.equal(pulo.status, 429, 'trocar o X-Forwarded-For pulou o limite');
});
