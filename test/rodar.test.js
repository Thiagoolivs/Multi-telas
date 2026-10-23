/*
 * Pôr pra rodar (docs/EXECUTOR.md, item 25).
 *
 * A campanha do Criar vai para as TVs com cada peça na zona que o cliente
 * escolheu, não na que o formato adivinha. O que estes testes seguram:
 *   - que TV recebe qual parte (uma TV citada fica com a dela; "todas", com o resto);
 *   - a zona é a do escopo; sem a zona na TV, nada do que foi pago some;
 *   - o layout só troca quando falta zona, e só se o cliente deixar;
 *   - pausar tira só o que é da campanha;
 *   - de ponta a ponta: a config passa pelo servidor e chega à TV inteira.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const http = require('node:http');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { pathToFileURL } = require('node:url');

const RAIZ = path.join(__dirname, '..');
const rodar = () => import(pathToFileURL(path.join(RAIZ, 'web/src/lib/rodar.js')).href);
const P = require('../js/peca-html.js');
const ouro = (id) => { const a = P.doArquivo(fs.readFileSync(path.join(RAIZ, 'pecas-ouro', id + '.html'), 'utf8')); return { type: 'peca-html', versao: 1, html: a.html, css: a.css, campos: {} }; };

const peca = (vaga, zona, id) => ({ vaga, zona, item: { ...ouro(id || 'institucional-lancamento'), formato: zona === 'lateral' ? '9/16' : '16/9' } });
const entrada = (alvo, extra) => Object.assign({
  alvo,
  zonas: {
    principal: [peca('p0', 'principal'), peca('p1', 'principal')],
    lateral: [peca('l0', 'lateral', 'servico-alerta')],
    cabecalho: { pecas: [peca('c0', 'cabecalho', 'cabecalho-classico')], mensagens: ['Café na hora'], vivos: ['relogio'] },
    rodape: { pecas: [peca('r0', 'rodape', 'rodape-contagem')], mensagens: ['Aceitamos Pix'], contagem: '2026-10-27T18:00', vivos: ['contagem'] },
  },
}, extra || {});
const TELAS = [{ id: 'dev_a', name: 'Balcão', grupo: 'Loja Centro' }, { id: 'dev_b', name: 'Vitrine', grupo: 'Loja Centro' }, { id: 'dev_c', name: 'Caixa', grupo: '' }];

test('quem recebe: a TV citada fica com a dela, "todas" fica com o resto, grupo com o grupo', async () => {
  const R = await rodar();
  const r = { telas: [entrada({ tipo: 'todas' }), entrada({ tipo: 'tela', id: 'dev_b' })] };
  const a = R.alvosDaCampanha(r, TELAS);
  assert.deepEqual(a.map((x) => [x.tela.id, x.indice]), [['dev_a', 0], ['dev_c', 0], ['dev_b', 1]]);
  const g = R.alvosDaCampanha({ telas: [entrada({ tipo: 'grupo', nome: 'Loja Centro' })] }, TELAS);
  assert.deepEqual(g.map((x) => x.tela.id), ['dev_a', 'dev_b']);
  assert.deepEqual(R.alvosDaCampanha({ telas: [entrada({ tipo: 'tela', id: 'dev_de_outra_conta' })] }, TELAS), []);
});

test('cada peça na zona do escopo, marcada com a campanha', async () => {
  const R = await rodar();
  const cfg = { settings: { layoutId: 'corporate' }, zonas: { principal: { items: [{ type: 'text', titulo: 'meu aviso' }] }, rodape: { messages: ['Aberto até 19h'] } } };
  const n = R.aplicarCampanha(cfg, entrada({ tipo: 'todas' }), 'Semana do pão');
  assert.equal(n.zonas.principal.items.length, 3, 'as duas da campanha na frente, e o que era do cliente fica');
  assert.equal(n.zonas.principal.items[0]._campanha, 'Semana do pão');
  assert.equal(n.zonas.principal.items[2].titulo, 'meu aviso');
  assert.equal(n.zonas.lateral.items[0]._campanha, 'Semana do pão');
  assert.equal(n.zonas.cabecalho.pecas.length, 1);
  assert.equal(n.zonas.cabecalho.peca._campanha, 'Semana do pão', 'a TV com o JS antigo mostra a primeira');
  assert.deepEqual(n.zonas.cabecalho.messages, ['Café na hora']);
  assert.equal(n.zonas.rodape.contagem, '2026-10-27T18:00');
  assert.deepEqual(n.zonas.rodape.messages, ['Aceitamos Pix']);
  assert.equal(cfg.zonas.principal.items.length, 1, 'não mexe na config recebida');
  // Publicar de novo troca só o que é dela.
  const de2 = R.aplicarCampanha(n, entrada({ tipo: 'todas' }), 'Semana do pão');
  assert.equal(de2.zonas.principal.items.length, 3);
});

test('sem a zona na TV: troca o layout só com o ok, e sem o ok nada pago some', async () => {
  const R = await rodar();
  const cheia = { settings: { layoutId: 'full' }, zonas: { principal: { items: [] } } };
  assert.deepEqual(R.zonasQueFaltam(cheia, entrada({ tipo: 'todas' })), ['lateral', 'cabeçalho', 'rodapé']);
  const trocou = R.aplicarCampanha(cheia, entrada({ tipo: 'todas' }), 'X', { trocarLayout: true });
  assert.equal(trocou.settings.layoutId, 'corporate');
  assert.equal(trocou.zonas.lateral.items.length, 1);
  const ficou = R.aplicarCampanha(cheia, entrada({ tipo: 'todas' }), 'X', { trocarLayout: false });
  assert.equal(ficou.settings.layoutId, 'full');
  assert.equal(ficou.zonas.principal.items.length, 3, 'a lateral foi para a principal');
  // Em pé, o completo é em pé.
  assert.equal(R.layoutPara({ settings: { layoutId: 'portrait-hero' } }), 'portrait-stack');
  const emPe = R.aplicarCampanha({ settings: { layoutId: 'portrait-hero' }, zonas: {} }, entrada({ tipo: 'todas' }), 'X', { trocarLayout: true });
  assert.equal(emPe.zonas.secundaria.items.length, 1, 'na TV em pé, a lateral é a secundária');
  // Layout que já tem tudo não troca.
  assert.equal(R.aplicarCampanha({ settings: { layoutId: 'dashboard' }, zonas: {} }, entrada({ tipo: 'todas' }, { zonas: { ...entrada().zonas, cabecalho: { pecas: [], mensagens: [], vivos: [] } } }), 'X', { trocarLayout: true }).settings.layoutId, 'dashboard');
});

test('pausar tira só o que é da campanha', async () => {
  const R = await rodar();
  const base = { settings: { layoutId: 'corporate' }, zonas: { principal: { items: [{ type: 'text', titulo: 'meu aviso' }] }, rodape: { messages: ['Aberto até 19h'] } } };
  const e = entrada({ tipo: 'todas' });
  const noAr = R.aplicarCampanha(base, e, 'Semana do pão');
  noAr.zonas.rodape.messages = ['Aberto até 19h', 'Aceitamos Pix'];
  const fora = R.tirarCampanha(noAr, e, 'Semana do pão');
  assert.deepEqual(fora.zonas.principal.items.map((i) => i.titulo), ['meu aviso']);
  assert.deepEqual(fora.zonas.lateral.items, []);
  assert.equal(fora.zonas.cabecalho.peca, undefined);
  assert.equal(fora.zonas.cabecalho.pecas, undefined);
  assert.deepEqual(fora.zonas.rodape.messages, ['Aberto até 19h'], 'a frase do cliente fica');
  assert.equal(fora.zonas.rodape.contagem, undefined);
});

test('o painel: o bloco pergunta antes de trocar layout e marca o estado no servidor', () => {
  const k = fs.readFileSync(path.join(RAIZ, 'web/src/components/criar/PorPraRodar.jsx'), 'utf8');
  assert.match(k, /Trocar o layout quando faltar zona/);
  assert.match(k, /const ids = await rodarCampanha\(plano, nome, \{ trocarLayout: trocar \}\);/);
  assert.match(k, /criar\.marcar\(campanha\.id, 'no_ar', ids\)/);
  assert.match(k, /await pausarCampanha\(r, nome, telas, campanha\.telas\);/);
  // D47: pronta, a campanha abre em Criados — é lá que fica o Pôr pra rodar.
  assert.match(fs.readFileSync(path.join(RAIZ, 'web/src/pages/CriarPage.jsx'), 'utf8'), /onIr\('campanhas', \{ campanha: c\.id \}\)/);
  assert.match(fs.readFileSync(path.join(RAIZ, 'web/src/pages/CampanhasPage.jsx'), 'utf8'), /acoes=\{<PorPraRodar campanha=\{aberta\} telas=\{telas\} onMudou=\{mudou\} \/>\}/);
  assert.match(fs.readFileSync(path.join(RAIZ, 'web/src/pages/ContentEditorPage.jsx'), 'utf8'), /\{it\._campanha \? ' · campanha ' \+ it\._campanha : ''\}/, 'a tela mostra de qual campanha vem o item');
});

/* ---------- de ponta a ponta ---------- */

const PORTA = 4180 + Math.floor(Math.random() * 9);
function pedir(caminho, o = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port: PORTA, path: caminho, method: o.method || 'GET',
      headers: { ...(o.body ? { 'Content-Type': 'application/json' } : {}), ...(o.cookie ? { Cookie: o.cookie } : {}), ...(o.headers || {}) } }, (res) => {
      let corpo = '';
      res.on('data', (c) => { corpo += c; });
      res.on('end', () => {
        let json = null; try { json = JSON.parse(corpo); } catch (e) { json = null; }
        resolve({ status: res.statusCode, json, cookies: [].concat(res.headers['set-cookie'] || []) });
      });
    });
    req.on('error', reject);
    req.setTimeout(15000, () => req.destroy(new Error('a rota ' + caminho + ' não respondeu')));
    if (o.body) req.write(JSON.stringify(o.body));
    req.end();
  });
}
const cookieDe = (r) => r.cookies.map((c) => c.split(';')[0]).filter((c) => !c.endsWith('=')).join('; ');

test('rotas: a campanha vai à TV pelo servidor, inteira, e o estado fica preso à conta', async (t) => {
  const R = await rodar();
  const dados = fs.mkdtempSync(path.join(os.tmpdir(), 'mt-rodar-'));
  const servidor = spawn(process.execPath, ['server.js'], {
    cwd: RAIZ, stdio: 'ignore',
    env: { ...process.env, PORT: String(PORTA), STORAGE: 'local', SKIP_VERIFY: '1', DATABASE_URL: '', DATA_DIR: dados, AI_PROVIDER: 'dev' },
  });
  t.after(() => { servidor.kill(); try { fs.rmSync(dados, { recursive: true, force: true }); } catch (e) { /* o Windows segura o arquivo */ } });
  let ok = false;
  for (let i = 0; i < 60 && !ok; i++) { try { await pedir('/tv'); ok = true; } catch (e) { await new Promise((r) => setTimeout(r, 250)); } }
  assert.ok(ok, 'o servidor de teste não subiu');

  const marca = Date.now();
  const conta = (email, name) => pedir('/api/auth/signup', { method: 'POST', body: { email, password: 'senha-de-teste-123', name, aceite: true } });
  const cA = cookieDe(await conta('rodar-a' + marca + '@teste.local', 'Padaria A'));
  const cB = cookieDe(await conta('rodar-b' + marca + '@teste.local', 'Ótica B'));

  // Uma TV de verdade, pareada na conta A.
  const tv = (await pedir('/api/devices', { method: 'POST', body: {} })).json;
  const daTv = { 'x-device-token': tv.deviceToken };
  await pedir('/api/devices/' + tv.id + '/config', { headers: daTv });
  const par = await pedir('/api/pair', { method: 'POST', cookie: cA, body: { code: tv.code } });
  assert.ok(par.status < 300, 'pareamento: ' + par.status + ' ' + JSON.stringify(par.json));

  const escopo = {
    nome: 'Semana do pão', objetivo: 'vender mais à tarde', imagens: 'gerar',
    telas: [{ alvo: { tipo: 'todas' }, zonas: { principal: { pecas: 2 }, lateral: { pecas: 1 }, cabecalho: { pecas: 2 }, rodape: { pecas: 1, mensagens: ['Aceitamos Pix'], contagem: '2026-10-27T18:00' } } }],
  };
  const job = (await pedir('/api/ai/ecossistema', { method: 'POST', cookie: cA, body: { escopo } })).json;
  let fim = null;
  for (let i = 0; i < 120 && !fim; i++) {
    const j = (await pedir('/api/ai/job/' + job.id, { cookie: cA })).json;
    if (j.estado === 'pronto' || j.estado === 'erro') fim = j; else await new Promise((r) => setTimeout(r, 250));
  }
  assert.equal(fim && fim.estado, 'pronto', fim && fim.erro);
  const campanha = fim.resultado.campanha;

  // O painel: a config de hoje, a campanha aplicada, o PUT de sempre.
  const telas = (await pedir('/api/devices', { cookie: cA })).json.devices;
  const [alvo] = R.alvosDaCampanha(campanha.resultado, telas);
  assert.equal(alvo.tela.id, tv.id);
  const atual = (await pedir('/api/devices/' + tv.id + '/config', { cookie: cA })).json;
  const nova = R.aplicarCampanha(atual && atual.zonas ? atual : { settings: { layoutId: 'full' }, zonas: {} }, alvo.entrada, campanha.nome, { trocarLayout: true });
  const put = await pedir('/api/devices/' + tv.id + '/config', { method: 'PUT', cookie: cA, body: nova });
  assert.equal(put.status, 200, JSON.stringify(put.json).slice(0, 300));

  // O que a TV recebe: tudo, nas zonas certas, inclusive a lista do cabeçalho.
  const naTv = (await pedir('/api/devices/' + tv.id + '/config', { headers: daTv })).json;
  const cfg = naTv.config || naTv;
  assert.equal(cfg.settings.layoutId, 'corporate');
  assert.equal(cfg.zonas.principal.items.filter((i) => i._campanha === campanha.nome).length, 2);
  assert.equal(cfg.zonas.lateral.items.filter((i) => i._campanha === campanha.nome).length, 1);
  assert.equal(cfg.zonas.cabecalho.pecas.length, 2, 'os dois estilos de cabeçalho chegam à TV');
  assert.equal(cfg.zonas.rodape.contagem, '2026-10-27T18:00');
  assert.deepEqual(cfg.zonas.rodape.messages, ['Aceitamos Pix']);

  // O estado: só TV desta conta, e só o dono.
  const marcou = await pedir('/api/campanhas/' + campanha.id, { method: 'PUT', cookie: cA, body: { estado: 'no_ar', telas: [tv.id, 'dev_de_outra_conta'] } });
  assert.equal(marcou.status, 200);
  assert.equal(marcou.json.campanha.estado, 'no_ar');
  assert.deepEqual(marcou.json.campanha.telas, [tv.id]);
  assert.equal((await pedir('/api/campanhas/' + campanha.id, { method: 'PUT', cookie: cA, body: { estado: 'qualquer' } })).status, 400);
  assert.equal((await pedir('/api/campanhas/' + campanha.id, { method: 'PUT', cookie: cB, body: { estado: 'pausada' } })).status, 404);

  // Pausar: a TV volta sem nada da campanha.
  const sem = R.tirarCampanha(cfg, alvo.entrada, campanha.nome);
  assert.equal((await pedir('/api/devices/' + tv.id + '/config', { method: 'PUT', cookie: cA, body: sem })).status, 200);
  const depois = (await pedir('/api/devices/' + tv.id + '/config', { headers: daTv })).json;
  const c2 = depois.config || depois;
  assert.equal(JSON.stringify(c2).includes('"_campanha":"' + campanha.nome + '"'), false, 'sobrou peça da campanha na TV');
});
