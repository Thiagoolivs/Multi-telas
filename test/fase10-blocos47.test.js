/*
 * Fase 10: o que o reteste dos blocos 4 a 7 achou e foi corrigido
 * (docs/qa-total/RETESTE-BLOCO-4-7.md).
 *
 *   - apagar a peça de outra conta respondia 200 sem apagar: agora 404;
 *   - a campanha de formato velho (`resultado.telas` em texto) dava 500 na
 *     lista, e a página mostrava o erro junto do "Nenhuma campanha ainda";
 *   - duas pessoas numa conta de 25 TVs batiam no freio (429) e o painel
 *     dizia "Sem conexão"; a Programação, Telas e o Início faziam um pedido
 *     por TV;
 *   - axe em Ajustes da TV, Criando, Mural e nos selos de campanha;
 *   - o mapa da TV pintava de preto as partes de texto e de clima;
 *   - o Som apontava para um menu que não existe mais;
 *   - Peças guardadas desenhava 300 peças de uma vez, com um violeta por pasta;
 *   - a Marca espremida no celular; Início e Alertas com uma linha por TV fora;
 *   - a página 404 crua e os e-mails sem moldura, logo nem rodapé.
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
const ler = (f) => fs.readFileSync(path.join(RAIZ, f), 'utf8');
// Só o código, sem os comentários (o comentário pode citar o texto velho).
const semComentarios = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '');

test('campanha de formato velho: numerar e a capa não quebram com `telas` em texto', () => {
  const A = require('../server/ajuste.js');
  assert.deepEqual(A.numerar({ telas: 'x' }), []);
  assert.deepEqual(A.numerar(null), []);
  assert.deepEqual(A.numerar({ telas: [null, { zonas: { principal: 'texto' } }] }), []);
  assert.equal(A.numerar({ telas: [{ zonas: { principal: [{ label: 'a' }] } }] }).length, 1);
  const c = ler('server/routes/campanhas.js');
  assert.match(c, /const telas = r && Array\.isArray\(r\.telas\) \? r\.telas : \[\];/);
  // Uma campanha torta fica de fora, e só ela: try por campanha na lista e nas peças.
  assert.match(c, /\} catch \(e\) \{ erros\.registrar\(e, \{ rota: '\/api\/campanhas\/pecas', campanha: c\.id \}\); \}/);
  assert.match(c, /\} catch \(e\) \{ c\.capa = null; erros\.registrar\(e, \{ rota: '\/api\/campanhas', campanha: c\.id \}\); \}/);
  for (const f of ['server/db-sqlite.js', 'server/db-postgres.js']) {
    const s = ler(f);
    assert.match(s, /telas: soLista\(jsonOu\(r\.telas, \[\]\)\), capa: soObjeto\(jsonOu\(r\.capa, null\)\),/, f);
    assert.match(s, /resultado: r\.resultado === undefined \? undefined : resultadoDe\(jsonOu\(r\.resultado, null\)\),/, f);
    assert.match(s, /async function deleteLibraryItem\(id, tenantId\) \{ (return q\.deleteLibrary\.run\(id, tenantId\)\.changes|const r = await pool\.query\('DELETE FROM library WHERE id = \$1 AND tenant_id = \$2', \[id, tenantId\]\); return r\.rowCount); \}/, f);
  }
});

test('a lista de campanhas que falha mostra o erro, nunca o vazio junto', () => {
  const c = ler('web/src/pages/CampanhasPage.jsx');
  assert.match(c, /const \[erroLista, setErroLista\] = useState\(''\);/);
  assert.match(c, /\{erroLista \? \(\s*<Panel><ErrorState title="Não deu para carregar as campanhas"/);
  // O erro não vira mais lista vazia ("Nenhuma campanha ainda").
  assert.doesNotMatch(c, /setLista\(\(l\) => l \|\| \[\]\)/);
  // Os selos no fundo claro de verdade: "Pausada" dava 4,08:1.
  assert.match(c, /no_ar: \{ rotulo: 'No ar', classe: 'bg-ok-soft text-ok' \}/);
  assert.match(c, /pausada: \{ rotulo: 'Pausada', classe: 'bg-warn-soft text-warn' \}/);
});

test('axe: Ajustes da TV sem caixa dentro de botão e com o tema nomeado; Criando e Mural com nome', () => {
  const s = ler('web/src/components/content/SettingsForm.jsx');
  const marca = s.slice(s.indexOf("escolherTema('marca')") - 200, s.indexOf('Um tema pronto'));
  const botao = marca.slice(marca.indexOf('<button'), marca.indexOf('</button>'));
  assert.ok(botao.length > 0 && !/Checkbox/.test(botao), 'a caixa "Versão clara" voltou para dentro do botão (nested-interactive)');
  assert.match(s, /<label htmlFor="tema-pronto" className="block text-sm font-semibold text-ink">Um tema pronto<\/label>\s*<Select id="tema-pronto"/);
  assert.match(s, /<Select aria-label="Tema da TV" value=\{theme\.preset\}/);
  assert.match(ler('web/src/pages/CriandoPage.jsx'), /<Button size="sm" variant="secondary" aria-label=\{ROTULO_ABRIR\[pagina\] \|\| 'Abrir'\}/);
  const m = ler('web/src/pages/MuralPage.jsx');
  assert.match(m, /<label htmlFor="nome-do-mural"[^>]*>Nome do mural<\/label>\s*<Input id="nome-do-mural"/);
});

test('o mapa da TV mostra o que cada parte passa: texto, aviso e clima não ficam pretos', () => {
  const m = ler('web/src/components/tela/MapaDaTela.jsx');
  assert.match(m, /function textosDoItem\(item, settings, nomes\)/);
  assert.match(m, /return \{ titulo: linha\(item\.cidade \|\| \(settings && settings\.cidadeClima\)\) \|\| 'Clima', apoio: 'Clima de agora', Icone: CloudSun \};/);
  assert.match(m, /: item && !faixa \? <PreviaDoItem item=\{item\} settings=\{cfg\.settings\} nomes=\{nomes\} \/>/);
  assert.match(m, /: faixa && !item \? <PreviaDaFaixa zona=\{z\} /);
  // A Conteudo de antes fica igual (a prévia "Como vai ficar" usa a mesma).
  assert.match(m, /export function Conteudo\(\{ item, tamanho \}\) \{\s*if \(!item\) return null;/);
});

test('o Som e as músicas apontam para onde a música mora hoje (Ajustes da TV › Som)', () => {
  const textos = ['web/src/pages/ScreensPage.jsx', 'web/src/pages/StoragePage.jsx', 'web/src/components/tela/FaixaDaTela.jsx', 'web/src/components/content/SettingsForm.jsx']
    .map((f) => semComentarios(ler(f))).join('\n');
  assert.doesNotMatch(textos, /Conteúdo › Ajustes|Ajustes da tela/);
  assert.match(ler('web/src/pages/ScreensPage.jsx'), /description="Age na TV na hora\. A música de fundo se escolhe na página da TV, em Ajustes da TV › Som\."/);
});

test('Peças guardadas: 12 por pasta, "Mostrar mais", a miniatura quando aparece e nenhum violeta por pasta', () => {
  const p = ler('web/src/pages/MyDesignsPage.jsx');
  assert.match(p, /const POR_VEZ = 12;/);
  assert.match(p, /\{doGrupo\.slice\(0, qt\)\.map\(\(it\) => \(/);
  assert.match(p, /Mostrar mais \(\{doGrupo\.length - qt\}\)/);
  assert.match(p, /new IntersectionObserver\(/);
  assert.match(p, /<MiniaturaQuandoAparecer item=\{it\.item\} \/>/);
  assert.match(p, /title=\{it\.label \|\| undefined\}>\{it\.label\}<\/div>/, 'o nome cortado sem dica');
  assert.doesNotMatch(p, /rounded-md bg-accent px-2\.5 py-1\.5 text-2xs font-semibold text-white/, 'voltou um violeta por pasta');
  // E a Programação antiga: um violeta por TV virou contorno.
  const g = ler('web/src/pages/ProgramacaoPage.jsx');
  assert.match(g, /<Button size="sm" variant="secondary" icon=\{Pencil\} onClick=\{\(\) => editar\(d\)\}>Editar programação<\/Button>/);
});

test('a Marca no celular: a análise desce para baixo da logo em vez de espremer', () => {
  assert.match(ler('web/src/components/content/LogoDaMarca.jsx'), /<div className="min-w-\[14rem\] flex-1 space-y-2">/);
});

test('Início e Alertas: várias TVs fora do ar viram uma linha, e a lista abre embaixo', () => {
  const a = ler('web/src/pages/AlertsPage.jsx');
  assert.match(a, /if \(offline\.length > 1\) \{/);
  assert.match(a, /title: `\$\{offline\.length\} TVs fora do ar`/);
  assert.match(a, /aria-expanded=\{aberto\} aria-controls=\{idLista\}/);
  assert.match(a, /\{aberto \? 'Esconder a lista' : 'Ver as ' \+ a\.itens\.length\}/);
  const d = ler('web/src/pages/DashboardPage.jsx');
  assert.match(d, /avisos\.push\(\{ id: 'off', tom: 'danger', texto: offline\.length \+ ' TVs fora do ar'/);
  assert.match(d, /\{aberto \? 'Esconder' : 'Quais\?'\}/);
});

test('o freio da conta: o 429 diz "muitos pedidos", não "sem conexão"; e menos pedidos por página', () => {
  const api = ler('web/src/api.js');
  assert.match(api, /if \(res\.status === 429\) \{\s*e\.retryAfter = Number\(res\.headers\.get\('Retry-After'\)\) \|\| 0;/);
  assert.match(api, /window\.dispatchEvent\(new CustomEvent\('mt:freio'/);
  // As leituras das miniaturas saem juntas, e a Programação lê todas as TVs num pedido.
  assert.match(api, /api\('GET', '\/api\/devices\/estados\?ids=' \+ ids\.map\(encodeURIComponent\)\.join\(','\)\)/);
  assert.match(api, /ler: \(id\) => lerEmLote\(id\),/);
  assert.match(api, /todas: \(\) => api\('GET', '\/api\/devices\/configs'\)/);
  assert.match(api, /const ja = emVoo\.get\(path\);\s*if \(ja\) return ja\.then\(copia\);/, 'a mesma leitura ao mesmo tempo vira um pedido só');
  assert.match(ler('web/src/pages/ProgramacaoPage.jsx'), /const todas = deviceConfig\.todas\(\)/);
  assert.doesNotMatch(ler('web/src/pages/ProgramacaoPage.jsx'), /deviceConfig\.get\(d\.id\)/);
  const app = ler('web/src/App.jsx');
  assert.match(app, /if \(e && e\.status === 429\) \{ setEspera\(/);
  assert.match(app, /limite: \['Muitos pedidos desta conta agora'/);
  assert.match(ler('web/src/components/layout/FaixaOffline.jsx'), /window\.addEventListener\('mt:freio', freio\);/);
  // O freio continua lá, protegendo o servidor.
  assert.match(ler('server/limites.js'), /painel: \{ max: 600, janelaMs: 5 \* 60 \* 1000, bloqueia: true \}/);
});

test('os e-mails: todos na mesma moldura, com a marca em cima e quem manda embaixo', () => {
  const mail = require('../server/mail.js');
  const lem = require('../server/lembretes.js');
  const vigia = require('../server/vigia.js');
  const F = require('../server/foto-qr.js');
  const APP = 'https://app.exemplo';
  const agora = Date.now();
  const todos = {
    confirmar: mail.verifyEmail(APP + '/app/?verify=T'),
    senha: mail.resetEmail(APP + '/app/?reset=T'),
    teste: lem.mensagem('2d', { frente: 'saude', created_at: agora - 12.5 * 864e5, telas: 0 }, APP, agora),
    atraso: lem.mensagemAtraso({ plan: 'pro', plan_status: 'past_due', atraso_desde: agora - 4 * 864e5 }, APP, agora),
    queda: vigia.mensagem({ telas: [{ nome: 'Recepção', parada: 25 * 60000 }] }, APP),
    foto: F.emailDoCodigo('706650', 'Padaria Sol', APP),
  };
  for (const [nome, m] of Object.entries(todos)) {
    assert.match(m.html, /^<!doctype html><html lang="pt-BR">/, nome);
    assert.match(m.html, /<img src="https:\/\/app\.exemplo\/icons\/icone-192\.png"/, nome + ': a logo');
    assert.match(m.html, /<strong style="color:#0e0b1f">MultiTelas<\/strong> · as TVs da sua empresa, com a sua marca/, nome + ': o rodapé');
    assert.match(m.html, /font-family:system-ui/, nome + ': a letra (o do código saía em Times)');
  }
  assert.match(todos.foto.html, /706650<\/p>/);
  assert.match(todos.foto.html, /pediu um código para mandar a sua foto/);
  // Sem endereço do app: nem logo nem link relativo (e-mail não lê caminho relativo).
  const semBase = F.emailDoCodigo('123456', '');
  assert.doesNotMatch(semBase.html, /<img|href="\//);
  // Quem manda, do ambiente (server/legal.js): só o que estiver configurado.
  const antes = { r: process.env.RAZAO_SOCIAL, c: process.env.CNPJ };
  process.env.RAZAO_SOCIAL = 'MultiTelas Tecnologia Ltda'; process.env.CNPJ = '00.000.000/0001-00';
  try { assert.match(mail.moldura('<p>x</p>', { base: APP }), /MultiTelas Tecnologia Ltda · CNPJ 00\.000\.000\/0001-00/); }
  finally {
    if (antes.r === undefined) delete process.env.RAZAO_SOCIAL; else process.env.RAZAO_SOCIAL = antes.r;
    if (antes.c === undefined) delete process.env.CNPJ; else process.env.CNPJ = antes.c;
  }
  assert.match(ler('server/routes/fotoqr.js'), /F\.emailDoCodigo\(codigo, \(t && t\.name\) \|\| '', baseUrl\(req\)\)/);
});

/*
 * No servidor de verdade: a peça de outra conta, a campanha velha no banco,
 * as rotas de todas as TVs de uma vez e a página 404.
 */
test('no servidor: 404 na peça de outra conta, campanha velha abre, TVs em lote só da conta, 404 com página', async (t) => {
  const porta = 7400 + Math.floor(Math.random() * 90);
  const dados = fs.mkdtempSync(path.join(os.tmpdir(), 'mt-f10b47-'));
  const env = { ...process.env, PORT: String(porta), STORAGE: 'local', SKIP_VERIFY: '1', DATABASE_URL: '', DATA_DIR: dados, MEDIA_DIR: dados, AI_PROVIDER: 'dev', ASAAS_API_KEY: '' };
  for (const k of ['RAILWAY_ENVIRONMENT', 'RAILWAY_ENVIRONMENT_NAME', 'RAILWAY_PROJECT_ID', 'NODE_ENV', 'TRUST_PROXY']) delete env[k];
  const servidor = spawn(process.execPath, ['server.js'], { cwd: RAIZ, stdio: 'ignore', env });
  t.after(() => { servidor.kill(); try { fs.rmSync(dados, { recursive: true, force: true }); } catch (e) { /* o Windows segura o arquivo */ } });
  let ip = 10;
  const pedir = (caminho, o = {}) => new Promise((resolve, reject) => {
    const corpo = o.body ? JSON.stringify(o.body) : '';
    const headers = { ...(o.body ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(corpo) } : {}), ...(o.cookie ? { Cookie: o.cookie } : {}), ...(o.headers || {}) };
    const req = http.request({ host: '127.0.0.1', port: porta, path: caminho, method: o.method || 'GET', headers, localAddress: o.ip }, (res) => {
      let txt = '';
      res.on('data', (c) => { txt += c; });
      res.on('end', () => { let json = null; try { json = JSON.parse(txt); } catch (e) { json = null; } resolve({ status: res.statusCode, json, txt, headers: res.headers, cookies: [].concat(res.headers['set-cookie'] || []) }); });
    });
    req.on('error', reject);
    if (corpo) req.write(corpo);
    req.end();
  });
  let ok = false;
  for (let i = 0; i < 160 && !ok; i++) { try { await pedir('/tv'); ok = true; } catch (e) { await new Promise((r) => setTimeout(r, 250)); } }
  assert.ok(ok, 'o servidor de teste não subiu');
  async function conta(perfil) {
    const email = perfil + Date.now() + Math.random().toString(36).slice(2, 6) + '@teste.local';
    const r = await pedir('/api/auth/signup', { method: 'POST', ip: '127.0.0.' + (ip++), body: { email, password: 'senha-de-teste-123', name: 'Conta ' + perfil, aceite: true, perfil } });
    assert.equal(r.status < 300, true, JSON.stringify(r.json));
    return { email, cookie: r.cookies.map((c) => c.split(';')[0]).filter((c) => !c.endsWith('=')).join('; ') };
  }
  const A = await conta('comercio');
  const B = await conta('empresa');

  // 1) A biblioteca: B não apaga (nem renomeia) o que é de A, e ouve 404.
  const peca = { canal: 'tv', formato: '16/9', label: 'Oferta', item: { type: 'text', titulo: 'Pão de queijo em dobro' } };
  assert.equal((await pedir('/api/library', { method: 'POST', cookie: A.cookie, body: { campaign: 'Tarde', pieces: [peca] } })).status, 201);
  const id = (await pedir('/api/library', { cookie: A.cookie })).json.items[0].id;
  assert.equal((await pedir('/api/library/' + id, { method: 'DELETE', cookie: B.cookie })).status, 404);
  assert.equal((await pedir('/api/library/campanhas/Tarde', { method: 'DELETE', cookie: B.cookie })).status, 404);
  assert.equal((await pedir('/api/library/campanhas/Tarde', { method: 'PUT', cookie: B.cookie, body: { nome: 'Minha' } })).status, 404);
  assert.equal((await pedir('/api/library', { cookie: A.cookie })).json.items.length, 1, 'a peça de A sumiu');
  assert.equal((await pedir('/api/library/' + id, { method: 'DELETE', cookie: A.cookie })).status, 200);
  assert.equal((await pedir('/api/library/' + id, { method: 'DELETE', cookie: A.cookie })).status, 404, 'apagar de novo não finge que apagou');

  // 2) A campanha de formato velho, direto no banco: a lista e as peças abrem.
  const { DatabaseSync } = require('node:sqlite');
  const d = new DatabaseSync(path.join(dados, 'multitelas.db'));
  d.exec('PRAGMA busy_timeout = 5000;');
  const ten = d.prepare('SELECT tenant_id FROM users WHERE email = ?').get(A.email).tenant_id;
  const agora = Date.now();
  const ins = d.prepare('INSERT INTO campanhas (id, tenant_id, user_id, nome, conversa_id, escopo, resultado, estado, telas, criado_em, atualizado_em, capa, arquivada) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)');
  ins.run('camp_velhaaaaa1', ten, '', null, '', '{}', '{"telas":"x"}', 'estado-velho', '"x"', agora - 6e7, agora - 6e7, '{}', null);
  ins.run('camp_velhaaaaa2', ten, '', 'Corrompida', '', 'nao-json', 'nao-json', 'pronta', 'nao-json', agora - 3e7, agora - 3e7, 'nao-json', 0);
  d.close();
  const lista = await pedir('/api/campanhas', { cookie: A.cookie });
  assert.equal(lista.status, 200, lista.txt);
  assert.equal(lista.json.campanhas.length, 2);
  assert.equal((await pedir('/api/campanhas/pecas', { cookie: A.cookie })).status, 200);
  const velha = (await pedir('/api/campanhas/camp_velhaaaaa1', { cookie: A.cookie })).json.campanha;
  assert.deepEqual(velha.telas, []);
  assert.deepEqual(velha.resultado.telas, []);

  // 3) Todas as TVs de uma vez: só as da conta, com a mesma programação de cada uma.
  const tv = (await pedir('/api/devices', { method: 'POST', ip: '127.0.0.' + (ip++) })).json;
  const par = await pedir('/api/pair', { method: 'POST', cookie: A.cookie, body: { code: tv.code, name: 'Recepção', nova: true } });
  assert.equal(par.status, 200, JSON.stringify(par.json));
  const cfg = { version: 1, settings: { layoutId: 'full' }, zonas: { principal: { items: [{ type: 'text', titulo: 'Oi' }] } } };
  assert.equal((await pedir('/api/devices/' + par.json.id + '/config', { method: 'PUT', cookie: A.cookie, body: cfg })).status, 200);
  const deA = await pedir('/api/devices/configs', { cookie: A.cookie });
  assert.equal(deA.status, 200);
  assert.deepEqual(Object.keys(deA.json.configs), [par.json.id]);
  const uma = await pedir('/api/devices/' + par.json.id + '/config', { cookie: A.cookie });
  assert.deepEqual(deA.json.configs[par.json.id].config, uma.json, 'a mesma programação da rota de uma TV');
  assert.equal(deA.json.configs[par.json.id].versao, Number(uma.headers['x-config-versao']));
  assert.deepEqual((await pedir('/api/devices/configs', { cookie: B.cookie })).json.configs, {});
  const est = await pedir('/api/devices/estados?ids=' + par.json.id, { cookie: A.cookie });
  assert.deepEqual(Object.keys(est.json.estados), [par.json.id]);
  assert.deepEqual((await pedir('/api/devices/estados?ids=' + par.json.id, { cookie: B.cookie })).json.estados, {}, 'B leu o estado da TV de A');
  assert.equal((await pedir('/api/devices/configs')).status, 401);

  // 4) A página 404: título, idioma e o caminho de volta; o arquivo que falta segue em texto.
  const p404 = await pedir('/pagina-que-nao-existe', { headers: { Accept: 'text/html' } });
  assert.equal(p404.status, 404);
  assert.match(p404.headers['content-type'], /text\/html/);
  assert.match(p404.txt, /<html lang="pt-BR">/);
  assert.match(p404.txt, /<title>Página não encontrada · MultiTelas<\/title>/);
  assert.match(p404.txt, /href="\/app\/"/);
  assert.match(p404.txt, /href="\/"/);
  const js404 = await pedir('/js/nao-existe.js');
  assert.equal(js404.status, 404);
  assert.match(js404.headers['content-type'], /text\/plain/);
});
