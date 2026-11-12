/*
 * Reteste 2, pelas rotas, com o servidor de verdade: o antes e o depois das
 * Aprovações como o painel vê, o pacote do Prontos (ETag e 304), o
 * desenhista num pedido, a lista de Telas com o que cada miniatura precisa e
 * a programação em lote — tudo respeitando a conta e a loja de quem pede.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const http = require('node:http');
const path = require('node:path');
const { spawn } = require('node:child_process');

const RAIZ = path.join(__dirname, '..');
const PORTA = 7320 + Math.floor(Math.random() * 60);
function pedir(caminho, o = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port: PORTA, path: caminho, method: o.method || 'GET',
      headers: { ...(o.json ? { 'Content-Type': 'application/json' } : {}), ...(o.cookie ? { Cookie: o.cookie } : {}), ...(o.headers || {}) } }, (res) => {
      const partes = [];
      res.on('data', (c) => partes.push(c));
      res.on('end', () => {
        const corpo = Buffer.concat(partes).toString('utf8');
        let json = null; try { json = JSON.parse(corpo); } catch (e) { json = null; }
        resolve({ status: res.statusCode, json, corpo, headers: res.headers, cookies: [].concat(res.headers['set-cookie'] || []) });
      });
    });
    req.on('error', reject);
    req.setTimeout(30000, () => req.destroy(new Error('a rota ' + caminho + ' não respondeu')));
    if (o.json) req.write(JSON.stringify(o.json));
    req.end();
  });
}
const cookieDe = (r) => r.cookies.map((c) => c.split(';')[0]).filter((c) => !c.endsWith('=')).join('; ');

test('servidor: Aprovações com a marca, pacote do Prontos, Telas num pedido e a programação em lote por loja', async (t) => {
  const dados = fs.mkdtempSync(path.join(os.tmpdir(), 'mt-r2-'));
  const servidor = spawn(process.execPath, ['server.js'], {
    cwd: RAIZ, stdio: 'ignore',
    env: { ...process.env, PORT: String(PORTA), STORAGE: 'local', SKIP_VERIFY: '1', DATABASE_URL: '', DATA_DIR: dados, MEDIA_DIR: dados, AI_PROVIDER: 'dev', TRUST_PROXY: '', RAILWAY_ENVIRONMENT: '' },
  });
  t.after(() => { servidor.kill(); try { fs.rmSync(dados, { recursive: true, force: true }); } catch (e) { /* o Windows segura o arquivo */ } });
  let ok = false;
  for (let i = 0; i < 160 && !ok; i++) { try { await pedir('/tv'); ok = true; } catch (e) { await new Promise((r) => setTimeout(r, 250)); } }
  assert.ok(ok, 'o servidor de teste não subiu');

  /* ---- O pacote do Prontos e o desenhista ---- */
  const pac = await pedir('/pecas-ouro/pacote.json', { headers: { 'Accept-Encoding': 'identity' } });
  assert.equal(pac.status, 200);
  assert.match(pac.headers['content-type'], /application\/json/);
  assert.match(pac.headers['cache-control'], /max-age=60, stale-while-revalidate=604800/);
  assert.ok(pac.headers.etag, 'sem ETag');
  const manifesto = JSON.parse(fs.readFileSync(path.join(RAIZ, 'pecas-ouro/manifesto.json'), 'utf8'));
  const aprovadas = manifesto.pecas.filter((p) => !p.estado || p.estado === 'aprovada');
  assert.deepEqual(Object.keys(pac.json.html).sort(), aprovadas.map((p) => p.id).sort());
  assert.equal((await pedir('/pecas-ouro/pacote.json', { headers: { 'If-None-Match': pac.headers.etag } })).status, 304);
  const comprimido = await pedir('/pecas-ouro/pacote.json', { headers: { 'Accept-Encoding': 'br, gzip' } });
  assert.ok(['br', 'gzip'].includes(comprimido.headers['content-encoding']), 'o pacote saiu sem compressão');
  const des = await pedir('/js/desenhista.pacote.js', { headers: { 'Accept-Encoding': 'identity' } });
  assert.equal(des.status, 200);
  assert.match(des.headers['content-type'], /javascript/);
  assert.ok(des.corpo.includes('/* ==== js/peca-render.js ==== */'));

  /* ---- Contas: o dono, a gerente da Loja Centro e outra conta ---- */
  const n = Date.now();
  const cadastro = (email, extra) => pedir('/api/auth/signup', { method: 'POST', json: { email, password: 'senha-de-teste-123', name: 'Pessoa', aceite: true, ...extra } });
  const dono = cookieDe(await cadastro('dono' + n + '@teste.local', { name: 'Padaria Trigo', perfil: 'comercio' }));
  assert.equal((await pedir('/api/billing/dev-activate', { method: 'POST', cookie: dono, json: { plan: 'pro' } })).status, 200);
  const outra = cookieDe(await cadastro('fora' + n + '@teste.local', { name: 'Outra loja' }));
  const convite = await pedir('/api/team/invites', { method: 'POST', cookie: dono, json: { email: 'gerente' + n + '@teste.local', role: 'member' } });
  const membro = cookieDe(await cadastro('gerente' + n + '@teste.local', { inviteCode: convite.json.code, name: 'Gerente Centro' }));
  const meMembro = (await pedir('/api/auth/me', { cookie: membro })).json;
  // A marca: a cor que o tema da TV tem que levar.
  const kit = (await pedir('/api/brand', { cookie: dono })).json.kit || {};
  assert.equal((await pedir('/api/brand', { method: 'PUT', cookie: dono, json: { ...kit, nome: 'Padaria Trigo', cores: ['#8a3b12', '#e8b04b', '#fff7ec'] } })).status, 200);

  const novaTv = async (grupo, titulo) => {
    const tv = (await pedir('/api/devices', { method: 'POST', json: {} })).json;
    const p = await pedir('/api/pair', { method: 'POST', cookie: dono, json: { code: tv.code, nova: true } });
    assert.ok(p.status < 300);
    if (grupo) assert.equal((await pedir('/api/devices/' + p.json.id + '/grupo', { method: 'POST', cookie: dono, json: { grupo } })).status, 200);
    assert.equal((await pedir('/api/devices/' + p.json.id + '/config', { method: 'PUT', cookie: dono, json: { settings: { layoutId: 'full' }, zonas: { principal: { items: [{ type: 'text', titulo }] } } } })).status, 200);
    return { ...tv, id: p.json.id };
  };
  const centro = await novaTv('Loja Centro', 'Centro antes');
  const norte = await novaTv('Loja Norte', 'Norte antes');
  assert.equal((await pedir('/api/lojas/' + meMembro.user.id, { method: 'PUT', cookie: dono, json: { grupos: ['Loja Centro'] } })).status, 200);

  /* ---- Telas num pedido: a lista com o "agora" e a programação ---- */
  const lista = (await pedir('/api/devices?agora=1', { cookie: dono })).json.devices;
  assert.equal(lista.length, 2);
  for (const d of lista) {
    assert.ok(d.agora && 'estado' in d.agora && 'online' in d.agora, 'sem o "agora" da TV');
    assert.equal(d.programacao.zonas.principal.items[0].titulo, d.id === centro.id ? 'Centro antes' : 'Norte antes');
    assert.ok(d.programacao.settings.theme, 'a programação sem o tema da marca');
  }
  assert.ok(!('programacao' in (await pedir('/api/devices', { cookie: dono })).json.devices[0]), 'a lista de sempre ficou pesada');
  const doMembro = (await pedir('/api/devices?agora=1', { cookie: membro })).json.devices;
  assert.deepEqual(doMembro.map((d) => d.id), [centro.id], 'a gerente viu a TV de outra loja');
  // A programação em lote: só as pedidas, e só as da conta e da loja.
  const lote = (await pedir('/api/devices/configs?ids=' + norte.id, { cookie: dono })).json.configs;
  assert.deepEqual(Object.keys(lote), [norte.id]);
  assert.deepEqual(Object.keys((await pedir('/api/devices/configs?ids=' + norte.id + ',' + centro.id, { cookie: membro })).json.configs), [centro.id]);
  assert.deepEqual(Object.keys((await pedir('/api/devices/configs?ids=' + centro.id, { cookie: outra })).json.configs), [], 'outra conta leu a nossa programação');

  /* ---- Aprovações: o antes e o depois como o painel vê ---- */
  assert.equal((await pedir('/api/aprovacoes/regra', { method: 'PUT', cookie: dono, json: { ligada: true } })).status, 200);
  const atual = await pedir('/api/devices/' + centro.id + '/config', { cookie: membro });
  const novo = JSON.parse(JSON.stringify(atual.json));
  novo.zonas.principal.items.unshift({ type: 'text', titulo: 'Bolo de cenoura' });
  const ped = await pedir('/api/devices/' + centro.id + '/config?versao=' + atual.headers['x-config-versao'], { method: 'PUT', cookie: membro, json: novo });
  assert.equal(ped.status, 202);
  const fila = (await pedir('/api/aprovacoes', { cookie: dono })).json;
  const id = fila.pendentes[0].id;
  const ver = (await pedir('/api/aprovacoes/' + id, { cookie: dono })).json;
  const tv = ver.telas[0];
  assert.equal(tv.antes.zonas.principal.items[0].titulo, 'Centro antes');
  assert.equal(tv.depois.zonas.principal.items[0].titulo, 'Bolo de cenoura');
  const comoOPainel = (await pedir('/api/devices/configs?ids=' + centro.id, { cookie: dono })).json.configs[centro.id].config;
  assert.deepEqual(tv.antes.settings.theme, comoOPainel.settings.theme, 'o antes sem o tema da marca (a prévia saía sem cor)');
  assert.deepEqual(tv.depois.settings.theme, comoOPainel.settings.theme, 'o depois sem o tema da marca');
  assert.equal(tv.antes.settings.nome, comoOPainel.settings.nome, 'o nome da conta no cabeçalho');
});
