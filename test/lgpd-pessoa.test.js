/*
 * LGPD por pessoa (EXECUTOR D35): consentimento, prazo de guarda e excluir
 * uma pessoa só.
 *
 *   - tirar uma pessoa leva a foto dela (se não estiver em outro lugar) e as
 *     fotos que ela mandou pelo QR; trocar ou tirar a foto apaga o arquivo;
 *   - o mural da data sai sozinho 30 dias depois da data (nota do consultor),
 *     com aviso 7 dias antes, .zip para baixar e "guardar por mais 30 dias";
 *     foto que ninguém decidiu sai em 30 dias;
 *   - o aceite do QR (data e hora) aparece na pessoa.
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
const ler = (f) => fs.readFileSync(path.join(RAIZ, f), 'utf8');
const G = require('../server/guarda');

test('o prazo do mural da data: 30 dias depois, aviso nos últimos 7, e "guardar mais" empurra', () => {
  const p = { tipo: 'data', dataAlvo: '2027-05-09' };
  assert.equal(G.apagaEm(p), '2027-06-08');
  assert.equal(G.apagaEm(Object.assign({}, p, { guardarAte: '2027-07-08' })), '2027-07-08');
  assert.equal(G.apagaEm({ tipo: 'perfil' }), '');
  assert.equal(G.diasParaSair(p, '2027-05-20'), null, 'avisou cedo demais');
  assert.equal(G.diasParaSair(p, '2027-06-01'), 7);
  assert.equal(G.diasParaSair(p, '2027-06-08'), 0);
});

test('a varredura: mural vencido sai (fotos e pedido), o do prazo fica; a foto que ninguém decidiu em 30 dias sai', async () => {
  const chamadas = { midia: [], fotos: [], pedidos: [] };
  const db = {
    pedidosFotoDeData: async () => [
      { id: 'velho', tenantId: 't1', tipo: 'data', dataAlvo: '2027-05-09' },
      { id: 'guardado', tenantId: 't1', tipo: 'data', dataAlvo: '2027-05-09', guardarAte: '2027-08-01' },
    ],
    listarFotosPessoa: async () => [{ id: 'f1', tenantId: 't1', pedidoId: 'velho', mediaId: 'm1' }, { id: 'f2', tenantId: 't1', pedidoId: 'guardado', mediaId: 'm2' }],
    fotosPendentesAntigas: async (antes) => (antes <= new Date('2027-07-01T12:00:00').getTime() - 29 * 864e5 ? [{ id: 'f3', tenantId: 't2', mediaId: 'm3' }] : []),
    removerFotoPessoa: async (id) => { chamadas.fotos.push(id); return 1; },
    removerPedidoFoto: async (id) => { chamadas.pedidos.push(id); return 1; },
  };
  const midia = { apagar: async (_db, t, id) => { chamadas.midia.push(t + ':' + id); return true; } };
  const r = await G.varrer({ db, midia, agora: new Date('2027-07-01T12:00:00').getTime() });
  assert.deepEqual(r, { muraisDeData: 1, fotos: 2 });
  assert.deepEqual(chamadas.pedidos, ['velho']);
  assert.deepEqual(chamadas.fotos.sort(), ['f1', 'f3']);
  assert.deepEqual(chamadas.midia.sort(), ['t1:m1', 't2:m3'], 'o arquivo ficou no storage');
});

test('foto do mural que o RH pôs numa peça ou campanha: sai do mural, mas o arquivo fica (nota do consultor no D35)', async () => {
  const chamadas = { midia: [], fotos: [] };
  const db = {
    pedidosFotoDeData: async () => [{ id: 'velho', tenantId: 't1', tipo: 'data', dataAlvo: '2027-05-09' }],
    listarFotosPessoa: async () => [{ id: 'f1', tenantId: 't1', pedidoId: 'velho', mediaId: 'm1', url: '/media/t1/usada.jpg' }, { id: 'f2', tenantId: 't1', pedidoId: 'velho', mediaId: 'm2', url: '/media/t1/solta.jpg' }],
    fotosPendentesAntigas: async () => [],
    removerFotoPessoa: async (id) => { chamadas.fotos.push(id); return 1; },
    removerPedidoFoto: async () => 1,
  };
  const midia = { apagar: async (_db, t, id) => { chamadas.midia.push(id); return true; } };
  const emUso = async (t, url) => (url.endsWith('usada.jpg') ? ['na campanha "Dia das Mães"'] : []);
  await G.varrer({ db, midia, emUso, agora: new Date('2027-07-01T12:00:00').getTime() });
  assert.deepEqual(chamadas.fotos.sort(), ['f1', 'f2'], 'a foto em uso ficou no mural');
  assert.deepEqual(chamadas.midia, ['m2'], 'apagou o arquivo que está na TV');
  // A exclusão de pessoa e o recusar/remover do mural conferem o mesmo.
  const S = ler('server.js');
  assert.match(S, /if \(f\.mediaId && !\(await ondeEstaEmUso\(t, f\.url\)\)\.length\) await midia\.apagar/);
  assert.match(S, /\n    ondeEstaEmUso,\r?\n  \};/);
  assert.match(ler('server/routes/fotoqr.js'), /const usos = f\.url \? await ctx\.ondeEstaEmUso\(t, f\.url\)[^\n]*\r?\n    if \(f\.mediaId && !usos\.length\) await midia\.apagar/);
});

test('o .zip abre (CRC certo) com os nomes e os bytes', async () => {
  assert.equal(G.crc32(Buffer.from('123456789')).toString(16), 'cbf43926');
  const L = await import(pathToFileURL(path.join(RAIZ, 'web/src/lib/planilha.js')).href);
  const z = G.zip([{ nome: '01-Ana.png', bytes: Buffer.from('aaa') }, { nome: '02-João.jpg', bytes: Buffer.from('bbbb') }]);
  const dentro = await L.abrirZip(new Uint8Array(z), () => true);
  assert.deepEqual(Object.keys(dentro), ['01-Ana.png', '02-João.jpg']);
  assert.equal(Buffer.from(dentro['02-João.jpg']).toString(), 'bbbb');
});

/* ---------------- servidor de verdade ---------------- */

const PORTA = 7300 + Math.floor(Math.random() * 90);
function pedir(caminho, o = {}) {
  return new Promise((resolve, reject) => {
    const corpo = o.bytes || (o.json ? Buffer.from(JSON.stringify(o.json)) : null);
    const req = http.request({ host: '127.0.0.1', port: PORTA, path: caminho, method: o.method || 'GET',
      headers: Object.assign({}, o.json ? { 'Content-Type': 'application/json' } : {}, o.cookie ? { Cookie: o.cookie } : {}, o.headers || {}) }, (res) => {
      const partes = [];
      res.on('data', (c) => partes.push(c));
      res.on('end', () => { const buf = Buffer.concat(partes); let json = null; try { json = JSON.parse(buf.toString()); } catch (e) { json = null; } resolve({ status: res.statusCode, json, buf, tipo: res.headers['content-type'], cookies: [].concat(res.headers['set-cookie'] || []) }); });
    });
    req.on('error', reject);
    req.setTimeout(30000, () => req.destroy(new Error('a rota ' + caminho + ' não respondeu')));
    if (corpo) req.write(corpo);
    req.end();
  });
}
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');

test('a rota: tirar a foto e tirar a pessoa apagam os arquivos; o aceite aparece; o mural da data baixa em .zip e guarda por mais 30 dias', async (t) => {
  const dados = fs.mkdtempSync(path.join(os.tmpdir(), 'mt-d35-'));
  const servidor = spawn(process.execPath, ['server.js'], {
    cwd: RAIZ, stdio: 'ignore',
    env: { ...process.env, PORT: String(PORTA), STORAGE: 'local', SKIP_VERIFY: '1', DATABASE_URL: '', DATA_DIR: dados, MEDIA_DIR: dados, AI_PROVIDER: 'dev', RESEND_API_KEY: '', BREVO_API_KEY: '', MAIL_PROVIDER: '' },
  });
  t.after(() => { servidor.kill(); try { fs.rmSync(dados, { recursive: true, force: true }); } catch (e) { /* o Windows segura o arquivo */ } });
  let ok = false;
  for (let i = 0; i < 60 && !ok; i++) { try { await pedir('/tv'); ok = true; } catch (e) { await new Promise((r) => setTimeout(r, 250)); } }
  assert.ok(ok, 'o servidor de teste não subiu');
  const c = (await pedir('/api/auth/signup', { method: 'POST', json: { email: 'd35' + Date.now() + '@teste.local', password: 'senha-de-teste-123', name: 'RH', aceite: true } }))
    .cookies.map((x) => x.split(';')[0]).filter((x) => !x.endsWith('=')).join('; ');
  await pedir('/api/birthdays/import', { method: 'POST', cookie: c, json: { rows: [
    { nome: 'Ana Souza', nascimento: '15/03', email: 'ana@x.com' }, { nome: 'Bia Lima', nascimento: '16/03', email: 'bia@x.com' },
  ] } });

  // Uma foto pelo QR para cada uma, aprovada.
  const perfil = (await pedir('/api/fotoqr', { method: 'POST', cookie: c, json: { titulo: 'Fotos' } })).json.pedido;
  const mandar = async (pedido, email, extra) => {
    const base = '/api/fotoqr/' + pedido.codigo;
    const cod = (await pedir(base + '/codigo', { method: 'POST', json: { email } })).json.codigoDev;
    const passe = (await pedir(base + '/entrar', { method: 'POST', json: { email, codigo: cod } })).json.passe;
    return pedir(base + '/foto?aceite=1' + (extra || ''), { method: 'POST', bytes: PNG, headers: { 'Content-Type': 'image/png', 'X-Passe': passe } });
  };
  assert.equal((await mandar(perfil, 'ana@x.com')).status, 201);
  assert.equal((await mandar(perfil, 'bia@x.com')).status, 201);
  for (const f of (await pedir('/api/fotoqr', { cookie: c })).json.fotos) await pedir('/api/fotoqr/fotos/' + f.id + '/aprovar', { method: 'POST', cookie: c });
  let lista = (await pedir('/api/birthdays', { cookie: c })).json.birthdays;
  const ana = lista.find((p) => p.nome === 'Ana Souza');
  const bia = lista.find((p) => p.nome === 'Bia Lima');
  assert.ok(ana.foto && Number(ana.consentimento_em) > 0, 'a lista não traz o aceite');
  assert.equal((await pedir(ana.foto)).status, 200);

  // Tirar a foto: o arquivo some.
  assert.equal((await pedir('/api/birthdays/' + ana.id, { method: 'PUT', cookie: c, json: { pessoa: { foto: '' } } })).status, 200);
  assert.equal((await pedir(ana.foto)).status, 404, 'tirou a foto e o arquivo ficou');

  // Tirar a pessoa: a foto e a foto pendente que ela mandou pelo QR somem.
  assert.equal((await mandar(perfil, 'bia@x.com')).status, 201);
  const pendenteDaBia = (await pedir('/api/fotoqr', { cookie: c })).json.fotos.find((f) => f.pessoaId === bia.id);
  const r = await pedir('/api/birthdays/' + bia.id, { method: 'DELETE', cookie: c });
  assert.deepEqual([r.status, r.json.fotoApagada, r.json.fotosDoQr], [200, true, 1]);
  assert.equal((await pedir(bia.foto)).status, 404);
  assert.equal((await pedir(pendenteDaBia.url)).status, 404, 'a foto pendente da pessoa tirada continuou no ar');

  // O mural da data: aprovada, baixa em .zip; o prazo aparece; guardar empurra 30 dias.
  const maes = (await pedir('/api/fotoqr', { method: 'POST', cookie: c, json: { dataId: 'dia-maes', inicio: '2026-10-01' } })).json.pedido;
  assert.equal((await mandar(maes, 'ana@x.com')).status, 201);
  const daData = (await pedir('/api/fotoqr', { cookie: c })).json.fotos.find((f) => f.pedidoId === maes.id);
  await pedir('/api/fotoqr/fotos/' + daData.id + '/aprovar', { method: 'POST', cookie: c });
  const z = await pedir('/api/fotoqr/' + maes.id + '/baixar', { cookie: c });
  assert.equal(z.status, 200);
  assert.equal(z.tipo, 'application/zip');
  const L = await import(pathToFileURL(path.join(RAIZ, 'web/src/lib/planilha.js')).href);
  const dentro = await L.abrirZip(new Uint8Array(z.buf), () => true);
  assert.deepEqual(Object.keys(dentro), ['01-Ana Souza.png']);
  assert.deepEqual(Buffer.from(dentro['01-Ana Souza.png']), PNG);
  const listado = (await pedir('/api/fotoqr', { cookie: c })).json.pedidos.find((p) => p.id === maes.id);
  assert.equal(listado.apagaEm, G.apagaEm(listado));
  const guardado = (await pedir('/api/fotoqr/' + maes.id, { method: 'PUT', cookie: c, json: { guardarMais: true } })).json.pedido;
  assert.ok(guardado.apagaEm > listado.apagaEm, 'guardar por mais 30 dias não empurrou');
  assert.equal((await pedir('/api/fotoqr/' + maes.id + '/baixar')).status, 401, 'baixou sem sessão');
});

test('o painel: a origem e o aceite na pessoa, tirar a foto, e o aviso de saída do mural com baixar e guardar', () => {
  const P = ler('web/src/pages/BirthdaysPage.jsx');
  assert.match(P, /'Autorizou nome, e-mail e foto pelo QR em '/);
  assert.match(P, /await birthdays\.atualizar\(pessoa\.id, \{ foto: '' \}\)/);
  const Q = ler('web/src/components/pessoas/FotosPeloQR.jsx');
  assert.match(Q, /href=\{'\/api\/fotoqr\/' \+ encodeURIComponent\(p\.id\) \+ '\/baixar'\}/);
  assert.match(Q, /onClick=\{\(\) => mudar\(\{ guardarMais: true \}\)\}/);
  assert.match(ler('server.js'), /const prazoDeGuarda = \(\) => guarda\.varrer\(\{ db, midia, emUso: ondeEstaEmUso \}\)/);
});
