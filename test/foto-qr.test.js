/*
 * A foto da pessoa pelo QR, com o RH aprovando (EXECUTOR D31).
 *
 * "A pessoa lê um QR code na tela pedindo as fotos, isso envia alguma forma
 * de autenticação e a pessoa envia as fotos; isso acontece semanas antes dos
 * eventos ou quando o RH programar." Código no e-mail (CPF + data não prova
 * identidade), passe curto, fila de aprovação; quem não está na lista entra
 * ao aprovar.
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
const ler = (...p) => fs.readFileSync(path.join(RAIZ, ...p), 'utf8');
const F = require('../server/foto-qr');

test('o código vale uma vez e cinco erros o queimam; o passe manda até 3 fotos; o período vale', () => {
  F._limpar();
  const c = F.pedirCodigo('pf_1', 'ana@x.com');
  assert.match(c, /^\d{6}$/);
  assert.equal(F.conferirCodigo('pf_1', 'ana@x.com', '000000' === c ? '111111' : '000000'), false);
  assert.equal(F.conferirCodigo('pf_2', 'ana@x.com', c), false, 'código de outro pedido');
  assert.equal(F.conferirCodigo('pf_1', 'ana@x.com', c), true);
  assert.equal(F.conferirCodigo('pf_1', 'ana@x.com', c), false, 'usou duas vezes');
  const d = F.pedirCodigo('pf_1', 'bia@x.com');
  for (let i = 0; i < F.TENTATIVAS; i++) F.conferirCodigo('pf_1', 'bia@x.com', 'errado');
  assert.equal(F.conferirCodigo('pf_1', 'bia@x.com', d), false, 'chutou cinco vezes e ainda vale');
  const passe = F.emitirPasse({ tenantId: 't', pedidoId: 'pf_1', email: 'ana@x.com', pessoaId: 'p1' });
  assert.equal(F.lerPasse(passe, 'pf_2'), null, 'passe de outro pedido');
  assert.equal(F.lerPasse(passe, 'pf_1').email, 'ana@x.com');
  assert.deepEqual([1, 2, 3, 4].map(() => F.gastarFoto(passe)), [true, true, true, false]);
  assert.equal(F.noPeriodo({ aceitando: true, inicio: '2026-10-01', fim: '2026-10-31' }, '2026-10-23'), true);
  assert.equal(F.noPeriodo({ aceitando: true, inicio: '2026-11-01', fim: '' }, '2026-10-23'), false);
  assert.equal(F.noPeriodo({ aceitando: false }, '2026-10-23'), false);
  const p = F.pagina({ codigo: 'ABC234', titulo: '<b>x</b>' }, { empresa: 'Acme' });
  assert.match(p, /<script src="\/js\/foto-qr\.js"><\/script>/, 'script inline não roda com a CSP');
  assert.doesNotMatch(p, /<b>x<\/b>/, 'título sem escapar');
});

/* ---------------- servidor de verdade ---------------- */

const PORTA = 7000 + Math.floor(Math.random() * 90);
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

test('a rota: e-mail → código → passe → foto na fila; o RH aprova (foto na pessoa, ou a pessoa entra) e recusa (arquivo some)', async (t) => {
  const dados = fs.mkdtempSync(path.join(os.tmpdir(), 'mt-d31-'));
  const servidor = spawn(process.execPath, ['server.js'], {
    cwd: RAIZ, stdio: 'ignore',
    env: { ...process.env, PORT: String(PORTA), STORAGE: 'local', SKIP_VERIFY: '1', DATABASE_URL: '', DATA_DIR: dados, MEDIA_DIR: dados, AI_PROVIDER: 'dev', RESEND_API_KEY: '', BREVO_API_KEY: '', MAIL_PROVIDER: '' },
  });
  t.after(() => { servidor.kill(); try { fs.rmSync(dados, { recursive: true, force: true }); } catch (e) { /* o Windows segura o arquivo */ } });
  let ok = false;
  for (let i = 0; i < 60 && !ok; i++) { try { await pedir('/tv'); ok = true; } catch (e) { await new Promise((r) => setTimeout(r, 250)); } }
  assert.ok(ok, 'o servidor de teste não subiu');
  const c = (await pedir('/api/auth/signup', { method: 'POST', json: { email: 'd31' + Date.now() + '@teste.local', password: 'senha-de-teste-123', name: 'Metalúrgica', aceite: true } }))
    .cookies.map((x) => x.split(';')[0]).filter((x) => !x.endsWith('=')).join('; ');
  assert.equal((await pedir('/api/fotoqr')).status, 401);
  await pedir('/api/birthdays/import', { method: 'POST', cookie: c, json: { rows: [{ nome: 'Ana Souza', nascimento: '15/03', email: 'Ana@X.com', setor: 'RH' }] } });

  const hoje = new Date();
  const iso = (d) => d.toISOString().slice(0, 10);
  // Sem fim, o pedido fecha sozinho em 30 dias (QR esquecido não vira porta aberta).
  const semFim = (await pedir('/api/fotoqr', { method: 'POST', cookie: c, json: { titulo: 'Sem fim', inicio: '2026-10-01' } })).json.pedido;
  assert.equal(semFim.fim, '2026-10-31');
  assert.equal((await pedir('/api/fotoqr/' + semFim.id, { method: 'PUT', cookie: c, json: { fim: '' } })).json.pedido.fim, '2026-10-31', 'deu para tirar o fim');
  await pedir('/api/fotoqr/' + semFim.id, { method: 'DELETE', cookie: c });
  const pedido = (await pedir('/api/fotoqr', { method: 'POST', cookie: c, json: { titulo: 'Sua foto', inicio: iso(new Date(hoje.getTime() - 86400000)), fim: iso(new Date(hoje.getTime() + 7 * 86400000)) } })).json.pedido;
  assert.match(pedido.codigo, /^[A-Z2-9]{6}$/);
  const pagina = await pedir('/f/' + pedido.codigo.toLowerCase());
  assert.equal(pagina.status, 200);
  assert.match(pagina.txt, /data-codigo="[A-Z2-9]{6}"/);
  const base = '/api/fotoqr/' + pedido.codigo;

  // A mesma resposta para e-mail da lista e de fora (em dev o código volta para o teste).
  const r1 = await pedir(base + '/codigo', { method: 'POST', json: { email: 'ana@x.com' } });
  const r2 = await pedir(base + '/codigo', { method: 'POST', json: { email: 'novo@x.com' } });
  assert.deepEqual([r1.status, Object.keys(r1.json).sort()], [200, ['codigoDev', 'ok']]);
  assert.deepEqual([r2.status, Object.keys(r2.json).sort()], [200, ['codigoDev', 'ok']], 'a página revela quem está na lista');
  assert.equal((await pedir(base + '/entrar', { method: 'POST', json: { email: 'ana@x.com', codigo: '999999' === r1.json.codigoDev ? '000000' : '999999' } })).status, 400);
  // O código errado conta uma tentativa; o certo ainda vale.
  const ana = (await pedir(base + '/entrar', { method: 'POST', json: { email: 'ana@x.com', codigo: r1.json.codigoDev } })).json;
  assert.deepEqual(ana.pessoa, { nome: 'Ana Souza' });
  const novo = (await pedir(base + '/entrar', { method: 'POST', json: { email: 'novo@x.com', codigo: r2.json.codigoDev } })).json;
  assert.equal(novo.pessoa, null);

  const foto = (passe, q) => pedir(base + '/foto' + (q == null ? '?aceite=1' : q), { method: 'POST', bytes: PNG, headers: { 'Content-Type': 'image/png', 'X-Passe': passe } });
  assert.equal((await foto('passe-falso')).status, 401);
  assert.equal((await pedir(base + '/foto?aceite=1', { method: 'POST', bytes: PNG, headers: { 'Content-Type': 'image/heic', 'X-Passe': ana.passe } })).status, 415);
  // Sem a autorização marcada, nada sobe (nota do consultor: consentimento explícito).
  assert.equal((await foto(ana.passe, '')).status, 400);
  assert.equal((await foto(ana.passe)).status, 201);
  assert.equal((await foto(novo.passe)).status, 400, 'quem não está na lista precisa dizer nome e aniversário');
  assert.equal((await foto(novo.passe, '?aceite=1&nome=Bruno%20Lima&nascimento=02%2F12&setor=Produ%C3%A7%C3%A3o')).status, 201);
  assert.equal((await foto(novo.passe, '?aceite=1&nome=Bruno%20Lima&nascimento=02%2F12')).status, 201);

  let fila = (await pedir('/api/fotoqr', { cookie: c })).json;
  assert.equal(fila.emailPronto, true);
  assert.equal(fila.fotos.length, 3);
  const daAna = fila.fotos.find((f) => f.nome === 'Ana Souza');
  const doBruno = fila.fotos.filter((f) => f.nome === 'Bruno Lima');
  assert.ok(daAna.pessoaId && !doBruno[0].pessoaId);

  // Aprovar: a foto vai para a Ana; o Bruno entra na lista com origem "qr".
  assert.equal((await pedir('/api/fotoqr/fotos/' + daAna.id + '/aprovar', { method: 'POST', cookie: c })).status, 200);
  assert.equal((await pedir('/api/fotoqr/fotos/' + doBruno[0].id + '/aprovar', { method: 'POST', cookie: c })).status, 200);
  const lista = (await pedir('/api/birthdays', { cookie: c })).json.birthdays;
  assert.equal(lista.find((p) => p.nome === 'Ana Souza').foto, daAna.url);
  assert.deepEqual(['origem', 'setor', 'email'].map((k) => lista.find((p) => p.nome === 'Bruno Lima')[k]), ['qr', 'Produção', 'novo@x.com']);
  // O aceite foi junto com a pessoa, com data e hora (vai na exportação).
  const exportado = (await pedir('/api/privacidade/exportar', { cookie: c })).json.dados.aniversariantes;
  for (const n of ['Ana Souza', 'Bruno Lima']) assert.ok(Number(exportado.find((p) => p.nome === n).consentimento_em) > Date.now() - 60000, n + ': sem o aceite');

  // Foto de fora da conta: endereço que não baixa (aqui, rede interna) deixa a pessoa sem foto (D30).
  const id = lista.find((p) => p.nome === 'Ana Souza').id;
  assert.equal((await pedir('/api/birthdays/' + id, { method: 'PUT', cookie: c, json: { pessoa: { foto: 'https://127.0.0.1/rosto.jpg' } } })).status, 200);
  assert.equal((await pedir('/api/birthdays', { cookie: c })).json.birthdays.find((p) => p.id === id).foto, '', 'foto de fora foi para a TV');
  // Recusar: a foto e o arquivo somem.
  assert.equal((await pedir('/api/fotoqr/fotos/' + doBruno[1].id + '/recusar', { method: 'POST', cookie: c })).status, 200);
  assert.equal((await pedir(doBruno[1].url)).status, 404, 'o arquivo recusado continua no ar');
  assert.equal((await pedir('/api/fotoqr', { cookie: c })).json.fotos.length, 0);

  // Uma planilha nova não apaga quem veio pelo QR (D30).
  await pedir('/api/birthdays/import', { method: 'POST', cookie: c, json: { rows: [{ nome: 'Ana Souza', nascimento: '15/03', email: 'ana@x.com' }] } });
  assert.ok((await pedir('/api/birthdays', { cookie: c })).json.birthdays.some((p) => p.nome === 'Bruno Lima'));

  // D31b: no período, as TVs dos aniversários recebem o pedido (o QR vai na tela); o painel não.
  const tv = (await pedir('/api/devices', { method: 'POST', json: {} })).json;
  const daTv = { 'x-device-token': tv.deviceToken };
  await pedir('/api/devices/' + tv.id + '/config', { headers: daTv });
  assert.ok((await pedir('/api/pair', { method: 'POST', cookie: c, json: { code: tv.code } })).status < 300);
  await pedir('/api/devices/' + tv.id + '/config', { method: 'PUT', cookie: c, json: { settings: { layoutId: 'full' }, zonas: {} } });
  let cfg = (await pedir('/api/devices/' + tv.id + '/config', { headers: daTv })).json;
  assert.equal(cfg.settings.automaticos, undefined, 'sem os aniversários ligados, o QR não vai');
  await pedir('/api/automaticos', { method: 'PUT', cookie: c, json: { aniversarios: { ligado: true, telas: 'todas' } } });
  cfg = (await pedir('/api/devices/' + tv.id + '/config', { headers: daTv })).json;
  assert.deepEqual(cfg.settings.automaticos.pedidoFoto, { codigo: pedido.codigo, titulo: 'Sua foto', link: 'http://127.0.0.1:' + PORTA + '/f/' + pedido.codigo });
  assert.equal((await pedir('/api/devices/' + tv.id + '/config', { cookie: c })).json.settings.automaticos, undefined, 'o painel gravaria de volta na programação');

  // Pausado: a página, a rota e a TV fecham.
  assert.equal((await pedir('/api/fotoqr/' + pedido.id, { method: 'PUT', cookie: c, json: { aceitando: false } })).status, 200);
  assert.equal((await pedir('/api/devices/' + tv.id + '/config', { headers: daTv })).json.settings.automaticos.pedidoFoto, undefined, 'pedido pausado continua na TV');
  assert.match((await pedir('/f/' + pedido.codigo)).txt, /O envio de fotos está fechado agora/);
  assert.equal((await pedir(base + '/codigo', { method: 'POST', json: { email: 'ana@x.com' } })).status, 403);
  assert.equal((await pedir('/api/fotoqr/' + pedido.id, { method: 'DELETE', cookie: c })).status, 200);
  assert.equal((await pedir('/f/' + pedido.codigo)).status, 404);
});

test('a TV: o cartão "mande sua foto" com o QR entra 1 a cada 6 na principal, e as TVs são avisadas', () => {
  const P = ler('js/player.js');
  assert.match(P, /if \(!a \|\| \(!a\.aniversarios && !a\.mural && !a\.pedidoFoto[^)]*\) \|\| zonaId !== zonaPrincipal\(cfg\)\) return null;/);
  assert.match(P, /if \(pedido && \(i \+ 1\) % 6 === 0\) out\.push\(pedido\);/);
  assert.match(P, /if \(pedido && out\.indexOf\(pedido\) < 0\) out\.push\(pedido\);/, 'lista curta fica sem o QR');
  const R = ler('js/render.js');
  assert.match(R, /pedidofoto: renderPedidoFoto,/);
  assert.match(R, /img\.onerror = function \(\) \{ q\.remove\(\); el\.classList\.add\('mt-pf-sem-qr'\); \};/, 'sem rede, o QR quebrado fica na tela');
  assert.match(ler('css/player.css'), /\.mt-pedidofoto \{ display: grid;/);
  assert.match(ler('server/routes/fotoqr.js'), /const avisar = \(t\) => avisarTelas\(t, 'config', \{\}\)/);
  assert.match(ler('sw.js'), /mt-shell-v(5[6-9]|[6-9]\d)/);
});

test('o painel e a privacidade: fila só para dono/admin, tabelas novas na exclusão e na exportação', () => {
  const r = ler('server/routes/fotoqr.js');
  assert.match(r, /if \(!canManageTeam\(sess\.role\)\) \{ sendJson\(res, 403/);
  // O código na resposta nunca em produção, mesmo com SKIP_VERIFY (nota do consultor).
  assert.match(r, /const emDev = \(\) => process\.env\.SKIP_VERIFY === '1' && !mail\.configured\(\) && !ctx\.billing\.emProducao\(\);/);
  assert.match(ler('server/foto-qr.js'), /<label class="aceite"><input type="checkbox" id="aceite">/, 'a autorização não é explícita');
  assert.doesNotMatch(ler('server/foto-qr.js'), /id="aceite" checked/, 'a caixa veio marcada');
  // A TV só recebe foto da própria conta.
  assert.match(ler('server/routes/telas.js'), /\.map\(\(p\) => \(p\.foto && !p\.foto\.startsWith\(daConta\) \? Object\.assign\(\{\}, p, \{ foto: '' \}\) : p\)\);/);
  assert.match(r, /A mesma resposta com o e-mail na lista ou não/);
  for (const arq of ['server/db-sqlite.js', 'server/db-postgres.js']) {
    const s = ler(arq);
    assert.match(s, /'pedidos_foto', 'fotos_pessoa',[\s\S]{0,80}'users'\]\)/, arq + ': exclusão da conta');
    assert.match(s, /SELECT chave FROM fotos_pessoa WHERE tenant_id/, arq + ': arquivos das fotos na exclusão');
    assert.match(s, /fotosParaAprovar: /, arq + ': exportação');
  }
  const pg = ler('web/src/components/pessoas/FotosPeloQR.jsx');
  assert.match(pg, /await fotoqr\.aprovar\(f\.id\); else await fotoqr\.recusar\(f\.id\);/);
  assert.match(ler('web/src/pages/BirthdaysPage.jsx'), /<FotosPeloQR onAprovou=\{reload\} \/>/);
});
