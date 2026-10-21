/*
 * "Ver a tela agora" (docs/EXECUTOR.md, item 9).
 *
 * O painel pede, a TV conta o que está no ar (zona, item, hora), e o painel
 * desenha com o mesmo desenhista. Um navegador não fotografa a própria tela,
 * por isso é ESTADO e não imagem.
 *
 * Conferido no player num Chrome comum, pareado numa conta local: resposta em
 * ~0,9s pelo tempo real, TV deitada (dashboard com peça, texto e letreiro) e
 * em pé (portrait-stack), painel no computador e no celular de 360px.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { spawn } = require('node:child_process');
const V = require('../server/ver-tela.js');

const RAIZ = path.join(__dirname, '..');
const ler = (...p) => fs.readFileSync(path.join(RAIZ, ...p), 'utf8');

const PECA = { type: 'peca-html', versao: 1, html: '<section class="mt-peca"><h1 data-campo="titulo">Pão na chapa</h1></section>', css: '', duracao: 600 };
const TEXTO = { type: 'text', titulo: 'Pão quentinho', corpo: 'Fornadas às 6h', duracao: 600 };
const SALVA = JSON.stringify({
  settings: { layoutId: 'dashboard', nome: 'TV do caixa' },
  zonas: {
    lateral: { items: [TEXTO] },
    principal: { items: [PECA] },
    rodape: { messages: ['Café até as 10h', 'Encomende seu bolo'] },
  },
});

test('o item no ar vai para o painel como está SALVO no banco, não como a TV mandou', () => {
  const r = V.conferirEstado({
    layoutId: 'dashboard',
    tela: { w: 1920, h: 1080 },
    zonas: {
      principal: { item: JSON.parse(JSON.stringify(PECA)), posicao: 1, total: 3 },
      lateral: { item: { ...TEXTO }, posicao: 1, total: 1 },
    },
  }, SALVA);
  assert.deepStrictEqual(r.zonas.principal, { item: PECA, posicao: 1, total: 3 });
  assert.deepStrictEqual(r.zonas.lateral.item, TEXTO);
  assert.deepStrictEqual(r.tela, { w: 1920, h: 1080 });
});

test('item que ninguém salvou não chega ao painel: vira "programação antiga"', () => {
  // Uma TV (ou quem tem o token dela) não desenha HTML próprio no painel do dono.
  const intrusa = { ...PECA, html: '<section class="mt-peca"><img src="https://fora.example/x.png"></section>' };
  const r = V.conferirEstado({ zonas: { principal: { item: intrusa, posicao: 2, total: 3 } } }, SALVA);
  assert.equal(r.zonas.principal.item, undefined);
  assert.equal(r.zonas.principal.antigo, true);
  assert.ok(!JSON.stringify(r).includes('fora.example'));
  // Sem config salva nenhuma, nada passa.
  assert.equal(V.conferirEstado({ zonas: { principal: { item: PECA } } }, null).zonas.principal.antigo, true);
});

test('o letreiro só mostra mensagens salvas, e o resto do estado é limpo', () => {
  const r = V.conferirEstado({
    layoutId: 'x'.repeat(500),
    foraDoHorario: 'qualquer',
    margem: 99,
    tela: { w: 'muito', h: 1e9 },
    zonas: {
      rodape: { mensagens: ['Café até as 10h', 'mensagem que ninguém escreveu'] },
      '../../etc': { relogio: true },
    },
  }, SALVA);
  assert.deepStrictEqual(r.zonas.rodape.mensagens, ['Café até as 10h']);
  assert.equal(r.zonas['../../etc'], undefined, 'id de zona fora do padrão');
  assert.equal(r.layoutId.length, 60);
  assert.equal(r.foraDoHorario, '');
  assert.equal(r.margem, 5);
  assert.deepStrictEqual(r.tela, { w: 0, h: 10000 });
  assert.equal(V.conferirEstado({ foraDoHorario: 'relogio' }, SALVA).foraDoHorario, 'relogio');
  assert.deepStrictEqual(V.conferirEstado([1, 2], SALVA).zonas, {});
});

test('a TV: comando "estado" responde com o que está no ar em cada zona', () => {
  const c = ler('js/cloud.js');
  // Comando que não é recarregar vai para o player (que sabe o que está no ar).
  assert.match(c, /if \(cmd\.acao === 'recarregar'\) global\.location\.reload\(\);\s+\/\/[^\n]*\n\s+else document\.dispatchEvent\(new CustomEvent\('mt:comando', \{ detail: cmd \}\)\);/);
  assert.match(c, /api\('POST', '\/api\/devices\/' \+ id \+ '\/estado', estado, dtHeader\(\)\)/);
  const p = ler('js/player.js');
  assert.match(p, /e\.detail\.acao === 'estado' && MTCloud\.enviarEstado\) MTCloud\.enviarEstado\(dev\.id, coletarEstado\(\)\)/);
  assert.match(p, /noAr = \{ item, posicao: \(index % ativos\.length\) \+ 1, total: ativos\.length \};/);
  assert.match(p, /atual: \(\) => noAr,/);
  assert.match(p, /return \{ stop: relogio\.parar, atual: \(\) => \(\{ relogio: true \}\) \};/);
  // O player mudou: o casco da TV troca de versão para a TV baixar o novo.
  assert.ok(Number((ler('sw.js').match(/const SHELL_CACHE = 'mt-shell-v(\d+)';/) || [])[1]) >= 36);
});

test('"ver" não apaga um "recarregar" que ainda não chegou na TV', () => {
  const t = ler('server/routes/telas.js');
  assert.match(t, /if \(acao !== 'recarregar' && acao !== 'estado'\) return sendJson\(res, 400/);
  assert.match(t, /if \(!\(acao === 'estado' && pendente && pendente\.acao === 'recarregar'\)\) comandosPendentes\.set\(id, cmd\);/);
  assert.match(t, /estadosDaTela\.set\(id, \{ em: Date\.now\(\), estado: verTela\.conferirEstado\(b, device\.config\) \}\);/);
});

test('no painel: o botão no cartão da tela, e a peça desenhada no tamanho da zona', () => {
  const s = ler('web/src/pages/ScreensPage.jsx');
  assert.match(s, /<IconButton icon=\{Eye\} label="Ver a tela agora" size=\{14\} onClick=\{onVer\} \/>/);
  assert.match(s, /<VerTelaAgora target=\{verTarget\} onClose=\{\(\) => setVerTarget\(null\)\} \/>/);
  const v = ler('web/src/components/content/VerTelaAgora.jsx');
  assert.match(v, /<PecaHtml item=\{peca\} tamanho=\{tam\} fitHeight/);
  assert.match(v, /const base = 1080 \/ Math\.min\(tw, th\);/);
  assert.match(v, /A TV não respondeu/);
  assert.match(ler('web/src/components/content/PecaHtml.jsx'), /const \[w, h\] = tamanho \|\| TAMANHO_REAL\[formato\] \|\| TAMANHO_REAL\['16\/9'\];/);
});

/* ---------- pelas rotas, com o servidor de verdade ---------- */

const PORTA = 3990 + Math.floor(Math.random() * 9);
let servidor;
function pedir(caminho, o = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port: PORTA, path: caminho, method: o.method || 'GET', headers: o.headers || {} }, (res) => {
      let corpo = '';
      res.on('data', (c) => { corpo += c; });
      res.on('end', () => resolve({ status: res.statusCode, corpo }));
    });
    req.on('error', reject);
    req.setTimeout(8000, () => req.destroy(new Error('a rota ' + caminho + ' não respondeu')));
    if (o.body) req.write(o.body);
    req.end();
  });
}

test('rotas: só a TV com o token conta o estado, e só o dono lê', async (t) => {
  servidor = spawn(process.execPath, ['server.js'], {
    cwd: RAIZ, env: { ...process.env, PORT: String(PORTA), STORAGE: 'local', SKIP_VERIFY: '1', DATABASE_URL: '' }, stdio: 'ignore',
  });
  t.after(() => servidor.kill());
  let ok = false;
  for (let i = 0; i < 60 && !ok; i++) {
    try { await pedir('/tv'); ok = true; } catch (e) { await new Promise((r) => setTimeout(r, 250)); }
  }
  assert.ok(ok, 'o servidor de teste não subiu');
  const nova = await pedir('/api/devices', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  const tv = JSON.parse(nova.corpo);
  const corpo = JSON.stringify({ zonas: { principal: { relogio: true } } });
  const json = { 'Content-Type': 'application/json' };
  const semToken = await pedir('/api/devices/' + tv.id + '/estado', { method: 'POST', headers: json, body: corpo });
  assert.equal(semToken.status, 403, 'qualquer um contava o estado de qualquer TV');
  const comToken = await pedir('/api/devices/' + tv.id + '/estado', { method: 'POST', headers: { ...json, 'x-device-token': tv.deviceToken }, body: corpo });
  assert.equal(comToken.status, 200);
  // Ler e pedir são do dono (sessão), não da TV nem de anônimo.
  assert.equal((await pedir('/api/devices/' + tv.id + '/estado')).status, 403);
  assert.equal((await pedir('/api/devices/' + tv.id + '/estado', { headers: { 'x-device-token': tv.deviceToken } })).status, 403);
  assert.equal((await pedir('/api/devices/' + tv.id + '/comando', { method: 'POST', headers: json, body: '{"acao":"estado"}' })).status, 403);
});
