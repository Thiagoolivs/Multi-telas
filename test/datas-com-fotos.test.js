/*
 * Datas com fotos da equipe (EXECUTOR D33).
 *
 * "Mães, pais, mulheres (falta hoje), crianças, Natal e as outras." O RH
 * pede as fotos de uma data pelo mesmo QR do D31; as aprovadas formam o
 * mural dela, que a TV mostra na semana da data. E o Dia da Mulher entra no
 * catálogo.
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

const RAIZ = path.join(__dirname, '..');
const ler = (f) => fs.readFileSync(path.join(RAIZ, f), 'utf8');
const S = require('../js/seasons.js');
const F = require('../server/foto-qr');

test('o Dia da Mulher entrou no catálogo, e as datas que pedem foto sabem quando caem', () => {
  assert.equal(S.todaySeason(new Date('2027-03-05T12:00:00')).id, 'dia-mulher');
  assert.ok(S.FRASES['dia-mulher'].length >= 2);
  assert.equal(F.proximaData('dia-maes', '2026-10-23'), '2027-05-09', 'segundo domingo de maio');
  assert.equal(F.proximaData('natal', '2026-12-25'), '2026-12-25', 'no próprio dia ainda vale');
  assert.equal(F.proximaData('outubro-rosa', '2026-10-01'), '', 'campanha de mês não pede foto da equipe');
  const lista = F.datasParaFotos('2026-10-23');
  assert.deepEqual(lista.slice(0, 2).map((d) => d.id), ['natal', 'ano-novo'], 'da mais próxima à mais distante');
  for (const id of ['dia-mulher', 'dia-maes', 'dia-pais', 'dia-criancas', 'natal']) assert.ok(lista.some((d) => d.id === id), id + ' fora da lista');
  assert.ok(!lista.some((d) => d.id === 'black-friday'));
  assert.equal(F.semanaDaData('2026-12-25', '2026-12-19'), true);
  assert.equal(F.semanaDaData('2026-12-25', '2026-12-18'), false);
  assert.equal(F.semanaDaData('2026-12-25', '2026-12-26'), false);
  assert.equal(F.saudacaoDa('dia-maes'), 'Feliz Dia das Mães');
  const pagina = F.pagina({ codigo: 'ABC234', titulo: 'Mães', tipo: 'data', dataId: 'dia-maes' }, { empresa: 'Acme' });
  assert.match(pagina, /data-tipo="data"/);
  assert.doesNotMatch(pagina, /id="nascimento"/, 'pediu o aniversário para a foto da data');
  assert.match(pagina, /para o mural do Dia das Mães\./);
});

test('a TV: na semana da data, o mural com as fotos aprovadas entra no rodízio da principal', () => {
  const P = ler('js/player.js');
  const ini = P.indexOf('  function zonaPrincipal(cfg) {');
  const fim = P.indexOf('  function startPlaylist(');
  const ctx = { global: { MT_BIRTHDAYS: [], MT_getLayout: () => ({ zones: [{ id: 'principal', type: 'playlist' }] }) }, module: {} };
  ctx.MT_getLayout = ctx.global.MT_getLayout;
  vm.createContext(ctx);
  vm.runInContext(P.slice(ini, fim) + '\nmodule.exports = { comAutomaticos };', ctx);
  const cfg = { settings: { automaticos: { aniversarios: true, mural: '', dataComFotos: { titulo: 'Feliz Dia das Mães', fotos: [{ url: '/media/t/a.jpg', nome: 'Ana' }] } } } };
  const pecas = [1, 2, 3, 4, 5, 6, 7, 8].map((i) => ({ type: 'peca-html', id: i }));
  const tipos = ctx.module.exports.comAutomaticos(pecas, cfg, 'principal', new Date(2026, 4, 5)).map((x) => (x.type === 'fotosdadata' ? 'G' : '.')).join('');
  assert.equal(tipos, '...G.....G', '1 a cada 5, fora do passo do mural (que entra na 5ª)');
  assert.equal(ctx.module.exports.comAutomaticos([], cfg, 'principal', new Date(2026, 4, 5)).length, 1, 'zona vazia ficou sem o mural da data');
  // Nota do consultor no #259: a TV offline esconde o QR e o mural da data pelo relógio dela.
  const comAte = { settings: { automaticos: {
    pedidoFoto: { codigo: 'ABC234', titulo: 'Sua foto', link: 'https://x/f/ABC234', ate: '2026-05-10' },
    dataComFotos: { titulo: 'Feliz Dia das Mães', fotos: [{ url: '/media/t/a.jpg', nome: 'Ana' }], ate: '2026-05-10' },
  } } };
  const tiposEm = (d) => ctx.module.exports.comAutomaticos([], comAte, 'principal', d).map((x) => x.type).sort().join(',');
  assert.equal(tiposEm(new Date(2026, 4, 10, 23, 50)), 'fotosdadata,pedidofoto', 'sumiu antes do fim do último dia');
  assert.equal(tiposEm(new Date(2026, 4, 11, 0, 5)), '', 'a TV offline continuou mostrando depois do fim');
  const T0 = ler('server/routes/telas.js');
  assert.match(T0, /link: baseUrl\(req\) \+ '\/f\/' \+ pedido\.codigo, ate: pedido\.fim \|\| '' \};/);
  assert.match(T0, /auto\.dataComFotos = \{ titulo: fotoQr\.saudacaoDa\(daData\.dataId\), fotos, ate: daData\.dataAlvo \};/);
  const R = ler('js/render.js');
  assert.match(R, /fotosdadata: renderFotosDaData,/);
  assert.match(R, /const cols = fotos\.length <= 1 \? 1 : fotos\.length <= 4 \? 2 : 3;/);
  const T = ler('server/routes/telas.js');
  assert.match(T, /const daData = pedidos\.find\(\(p\) => p\.tipo === 'data' && fotoQr\.semanaDaData\(p\.dataAlvo\)\);/);
  assert.match(T, /\.filter\(\(f\) => f\.pedidoId === daData\.id && f\.aprovadaEm && f\.url\.startsWith\(daConta\)\)/, 'foto não aprovada ou de fora na TV');
  assert.match(T, /nome: String\(f\.nome \|\| ''\)\.split\(' '\)\[0\]/, 'o nome inteiro foi para a parede');
  assert.match(ler('sw.js'), /mt-shell-v(5[8-9]|[6-9]\d)/);
});

/* ---------------- servidor de verdade ---------------- */

const PORTA = 7100 + Math.floor(Math.random() * 90);
function pedir(caminho, o = {}) {
  return new Promise((resolve, reject) => {
    const corpo = o.bytes || (o.json ? Buffer.from(JSON.stringify(o.json)) : null);
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
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');

test('a rota: pedido da data, quem não está na lista manda só com o nome, a aprovada fica no mural (não vira a foto da pessoa)', async (t) => {
  const dados = fs.mkdtempSync(path.join(os.tmpdir(), 'mt-d33-'));
  const servidor = spawn(process.execPath, ['server.js'], {
    cwd: RAIZ, stdio: 'ignore',
    env: { ...process.env, PORT: String(PORTA), STORAGE: 'local', SKIP_VERIFY: '1', DATABASE_URL: '', DATA_DIR: dados, MEDIA_DIR: dados, AI_PROVIDER: 'dev', RESEND_API_KEY: '', BREVO_API_KEY: '', MAIL_PROVIDER: '' },
  });
  t.after(() => { servidor.kill(); try { fs.rmSync(dados, { recursive: true, force: true }); } catch (e) { /* o Windows segura o arquivo */ } });
  let ok = false;
  for (let i = 0; i < 160 && !ok; i++) { try { await pedir('/tv'); ok = true; } catch (e) { await new Promise((r) => setTimeout(r, 250)); } }
  assert.ok(ok, 'o servidor de teste não subiu');
  const c = (await pedir('/api/auth/signup', { method: 'POST', json: { email: 'd33' + Date.now() + '@teste.local', password: 'senha-de-teste-123', name: 'Metalúrgica', aceite: true } }))
    .cookies.map((x) => x.split(';')[0]).filter((x) => !x.endsWith('=')).join('; ');
  await pedir('/api/birthdays/import', { method: 'POST', cookie: c, json: { rows: [{ nome: 'Ana Souza', nascimento: '15/03', email: 'ana@x.com' }] } });

  const lista = (await pedir('/api/fotoqr', { cookie: c })).json;
  assert.ok(lista.datas.some((d) => d.id === 'dia-maes'), 'o painel não oferece as datas');
  assert.equal((await pedir('/api/fotoqr', { method: 'POST', cookie: c, json: { dataId: 'black-friday' } })).json.pedido.tipo, 'perfil', 'data sem foto da equipe virou pedido de data');
  const pedido = (await pedir('/api/fotoqr', { method: 'POST', cookie: c, json: { dataId: 'dia-maes', inicio: '2026-10-01' } })).json.pedido;
  assert.equal(pedido.tipo, 'data');
  assert.equal(pedido.dataId, 'dia-maes');
  assert.match(pedido.dataAlvo, /^20\d\d-05-\d\d$/);
  assert.equal(pedido.fim, pedido.dataAlvo, 'recebe até o dia da data');
  assert.match(pedido.titulo, /com a sua mãe/);
  // Sem início dito, recebe das 3 semanas antes até o dia ("semanas antes dos eventos").
  const pais = (await pedir('/api/fotoqr', { method: 'POST', cookie: c, json: { dataId: 'dia-pais' } })).json.pedido;
  assert.equal(pais.inicio, F.somarDias(pais.dataAlvo, -21));
  assert.equal(pais.fim, pais.dataAlvo);
  await pedir('/api/fotoqr/' + pais.id, { method: 'DELETE', cookie: c });

  const base = '/api/fotoqr/' + pedido.codigo;
  const entrar = async (email) => {
    const cod = (await pedir(base + '/codigo', { method: 'POST', json: { email } })).json.codigoDev;
    return (await pedir(base + '/entrar', { method: 'POST', json: { email, codigo: cod } })).json;
  };
  const ana = await entrar('ana@x.com');
  const novo = await entrar('novo@x.com');
  const foto = (passe, q) => pedir(base + '/foto?aceite=1' + (q || ''), { method: 'POST', bytes: PNG, headers: { 'Content-Type': 'image/png', 'X-Passe': passe } });
  assert.equal((await foto(ana.passe)).status, 201);
  assert.equal((await foto(novo.passe)).status, 400, 'sem o nome');
  assert.equal((await foto(novo.passe, '&nome=Bruno%20Lima')).status, 201, 'pediu o aniversário para a foto da data');

  const fotos = (await pedir('/api/fotoqr', { cookie: c })).json.fotos;
  for (const f of fotos) assert.equal((await pedir('/api/fotoqr/fotos/' + f.id + '/aprovar', { method: 'POST', cookie: c })).status, 200);
  const depois = (await pedir('/api/fotoqr', { cookie: c })).json.fotos;
  assert.equal(depois.length, 2, 'a aprovada saiu (devia ficar no mural)');
  assert.ok(depois.every((f) => f.aprovadaEm > 0));
  const pessoas = (await pedir('/api/birthdays', { cookie: c })).json.birthdays;
  assert.deepEqual(pessoas.map((p) => [p.nome, p.foto]), [['Ana Souza', '']], 'a foto da data virou a foto da pessoa, ou o novato entrou na lista');

  // Tirar uma do mural apaga o arquivo; apagar o pedido leva as outras.
  assert.equal((await pedir('/api/fotoqr/fotos/' + depois[0].id + '/recusar', { method: 'POST', cookie: c })).status, 200);
  assert.equal((await pedir(depois[0].url)).status, 404);
  assert.equal((await pedir('/api/fotoqr/' + pedido.id, { method: 'DELETE', cookie: c })).status, 200);
  assert.equal((await pedir(depois[1].url)).status, 404, 'apagar o pedido deixou a foto do mural no ar');
});
