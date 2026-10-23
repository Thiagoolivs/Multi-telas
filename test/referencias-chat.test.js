/*
 * Imagem de referência no chat (EXECUTOR D45).
 *
 * O dono: "no chat permitir subir e colar imagens de referência para a
 * criação". No Criar e no Editar com a IA: anexar ou colar; a imagem vira
 * mídia da conta (tipo conferido pelos BYTES, na cota) e diz para que serve —
 * estilo (guia o desenho) ou foto do produto (é do cliente, vai como está).
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const http = require('node:http');
const path = require('node:path');
const { Readable } = require('node:stream');
const { spawn } = require('node:child_process');
const Refs = require('../server/referencias.js');
const A = require('../server/ajuste.js');
const Ed = require('../server/edicao.js');
const C = require('../server/ai-conversa.js');
const eco = require('../server/ecossistema.js');

const RAIZ = path.join(__dirname, '..');
const ler = (f) => fs.readFileSync(path.join(RAIZ, f), 'utf8').replace(/\r\n/g, '\n');
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');

function midiaFalsa() {
  const gravadas = [];
  return { gravadas, guardarBuffer: async (db, t, buf, mime, meta) => { gravadas.push({ t, mime, meta, n: buf.length }); return { id: 'med_' + gravadas.length, url: '/media/' + t + '/r' + gravadas.length + '.png' }; } };
}

test('receber: o tipo pelos bytes, o tamanho, a cota — e grava como mídia da conta', async () => {
  const m = midiaFalsa();
  const ok = await Refs.receber({ db: {}, midia: m, tenantId: 't1', req: Readable.from([PNG]), uso: 'produto', cota: 1e9, usado: 0 });
  assert.deepEqual(ok.referencia, { url: '/media/t1/r1.png', mediaId: 'med_1', uso: 'produto' });
  assert.deepEqual([m.gravadas[0].mime, m.gravadas[0].meta.origem], ['image/png', 'referencia']);
  // Texto com nome de imagem: recusado pelos bytes.
  const falsa = await Refs.receber({ db: {}, midia: m, tenantId: 't1', req: Readable.from([Buffer.from('<svg onload=alert(1)>')]), uso: 'estilo', cota: 1e9, usado: 0 });
  assert.equal(falsa.status, 415);
  // Grande demais e cota cheia: nada gravado.
  const grande = await Refs.receber({ db: {}, midia: m, tenantId: 't1', req: Readable.from([Buffer.alloc(Refs.LIMITE_BYTES + 10)]), uso: 'estilo', cota: 1e12, usado: 0 });
  assert.equal(grande.status, 413);
  const cheia = await Refs.receber({ db: {}, midia: m, tenantId: 't1', req: Readable.from([PNG]), uso: 'estilo', cota: 100, usado: 90 });
  assert.equal(cheia.status, 413);
  assert.equal(m.gravadas.length, 1);
  // Uso desconhecido vira estilo.
  assert.equal((await Refs.receber({ db: {}, midia: m, tenantId: 't1', req: Readable.from([PNG]), uso: 'hack', cota: 1e9, usado: 0 })).referencia.uso, 'estilo');
});

test('a lista volta só com o que já era da conversa; o gerador recebe estilo e produto no lugar certo', () => {
  const atuais = [{ url: '/media/t/a.png', mediaId: 'm1', uso: 'estilo' }, { url: '/media/t/b.png', mediaId: 'm2', uso: 'estilo' }];
  assert.deepEqual(Refs.conferirLista([{ url: '/media/t/b.png', uso: 'produto' }, { url: 'https://evil/x.png', uso: 'estilo' }, { url: '/media/t/b.png', uso: 'estilo' }], atuais),
    [{ url: '/media/t/b.png', mediaId: 'm2', uso: 'produto' }]);
  const m = Refs.naMarca({ referencias: ['/media/t/marca.png'], bases: [{ url: '/media/t/loja.jpg', label: 'loja' }] },
    [{ url: '/media/t/a.png', uso: 'estilo' }, { url: '/media/t/p.png', uso: 'produto' }]);
  assert.deepEqual(m.referencias, ['/media/t/a.png', '/media/t/marca.png']);
  assert.deepEqual(m.bases[0], { url: '/media/t/p.png', label: 'foto do produto que o cliente mandou na conversa' });
  assert.match(C.contexto({ referencias: [{ url: 'x', uso: 'produto' }] }), /IMAGENS QUE A PESSOA MANDOU[^\n]*\n- imagem 1: foto do produto/);
});

test('na edição: "usa a foto que eu mandei" põe a foto do cliente na peça, sem gerar nada', async (t) => {
  const antes = process.env.AI_PROVIDER;
  process.env.AI_PROVIDER = 'dev';
  t.after(() => { if (antes === undefined) delete process.env.AI_PROVIDER; else process.env.AI_PROVIDER = antes; });
  const ESCOPO = { nome: 'Pão', objetivo: 'vender', imagens: 'nenhuma', telas: [{ alvo: { tipo: 'todas' }, zonas: { principal: { pecas: 2 }, lateral: { pecas: 1 }, cabecalho: { pecas: 0 }, rodape: { pecas: 0 } } }] };
  const resultado = await eco.gerar(ESCOPO, { empresa: 'Padaria' }, {});
  const refs = [{ url: '/media/t/estilo.png', uso: 'estilo' }, { url: '/media/t/produto.png', uso: 'produto' }];
  // A peneira: "usar" só com uma imagem que existe.
  assert.deepEqual(A.lerMudancas([{ tipo: 'refazer', peca: 1, foto: 'usar', ref: 2 }, { tipo: 'refazer', peca: 1, foto: 'usar', ref: 9 }], resultado, { refs }),
    [{ tipo: 'refazer', peca: 1, texto: '', foto: 'usar', fotoUrl: '/media/t/produto.png', descricaoFoto: '' }]);
  // Várias peças: pergunta qual; "2" completa, com a foto do PRODUTO.
  const r1 = Ed.semIA('usa a foto que eu mandei', [], resultado, refs);
  assert.equal(r1.acao, 'perguntar');
  const r2 = Ed.semIA('2', [{ papel: 'ia', texto: r1.resposta, pendente: r1.pendente }], resultado, refs);
  assert.deepEqual(r2.mudancas, [{ tipo: 'refazer', peca: 2, texto: '', foto: 'usar', fotoUrl: '/media/t/produto.png', descricaoFoto: '' }]);
  const feito = await A.aplicar({ resultado, escopo: ESCOPO }, r2.mudancas, { empresa: 'Padaria' }, { onImagem: async () => { throw new Error('não pode gerar foto'); } });
  const p2 = A.numerar(feito.resultado)[1].peca;
  assert.equal(p2.comFoto, true);
  assert.match(JSON.stringify(p2.item), /\/media\/t\/produto\.png/);
  assert.equal(feito.fotosGeradas, 0, 'a foto do cliente gastou criação');
});

test('o painel: clipe e colar no Criar e no Editar com a IA, com Estilo / Produto', () => {
  const R = ler('web/src/components/criar/ReferenciasDoChat.jsx');
  assert.match(R, /export const TIPOS_ACEITOS = 'image\/png,image\/jpeg,image\/webp';/);
  assert.match(R, /\[\['estilo', 'Estilo'\], \['produto', 'Produto'\]\]/);
  for (const f of ['web/src/pages/CriarPage.jsx', 'web/src/components/criar/EditarComIA.jsx']) {
    const s = ler(f);
    assert.match(s, /<BotaoAnexar onArquivos=\{anexar\} enviando=\{enviandoImagem\} \/>/, f);
    assert.match(s, /onPaste=\{\(e\) => \{ const imgs = imagensDoColar\(e\); if \(imgs\.length\) \{ e\.preventDefault\(\); anexar\(imgs\); \} \}\}/, f);
    assert.match(s, /<ReferenciasDoChat lista=\{referencias\} onMudar=\{mudarReferencias\}/, f);
  }
  assert.match(ler('server/routes/campanhas.js'), /if \(conv && \(conv\.referencias \|\| \[\]\)\.length\) ctxConta\.marca = refs\.naMarca\(ctxConta\.marca, conv\.referencias\);/);
});

/* ---------------- servidor de verdade ---------------- */

const PORTA = 8000 + Math.floor(Math.random() * 90);
function pedir(caminho, o = {}) {
  return new Promise((resolve, reject) => {
    const corpo = o.bytes || (o.json ? Buffer.from(JSON.stringify(o.json)) : null);
    const req = http.request({ host: '127.0.0.1', port: PORTA, path: caminho, method: o.method || 'GET',
      headers: Object.assign({}, o.json ? { 'Content-Type': 'application/json' } : {}, o.bytes ? { 'Content-Type': 'image/png' } : {}, o.cookie ? { Cookie: o.cookie } : {}) }, (res) => {
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

test('a rota: a imagem cria a conversa (ou entra na que existe), muda de uso, fica presa à conta', async (t) => {
  const dados = fs.mkdtempSync(path.join(os.tmpdir(), 'mt-d45-'));
  const env = { ...process.env, PORT: String(PORTA), STORAGE: 'local', SKIP_VERIFY: '1', DATABASE_URL: '', DATA_DIR: dados, MEDIA_DIR: dados, AI_PROVIDER: 'dev', MT_APK_REPO: 'desligado' };
  const servidor = spawn(process.execPath, ['server.js'], { cwd: RAIZ, stdio: 'ignore', env });
  t.after(() => { servidor.kill(); try { fs.rmSync(dados, { recursive: true, force: true }); } catch (e) { /* o Windows segura o arquivo */ } });
  let ok = false;
  for (let i = 0; i < 80 && !ok; i++) { try { await pedir('/tv'); ok = true; } catch (e) { await new Promise((r) => setTimeout(r, 250)); } }
  assert.ok(ok, 'o servidor de teste não subiu');
  const conta = async (nome) => (await pedir('/api/auth/signup', { method: 'POST', json: { email: nome + Date.now() + Math.random().toString(36).slice(2, 6) + '@teste.local', password: 'senha-de-teste-123', name: nome, aceite: true } }))
    .cookies.map((x) => x.split(';')[0]).filter((x) => !x.endsWith('=')).join('; ');
  const c = await conta('Padaria');
  const outra = await conta('Outra');

  assert.equal((await pedir('/api/conversas/referencia', { method: 'POST', bytes: PNG })).status, 401);
  const r1 = await pedir('/api/conversas/referencia?uso=produto', { method: 'POST', cookie: c, bytes: PNG });
  assert.equal(r1.status, 201);
  const conv = r1.json.conversa;
  assert.deepEqual(conv.referencias.map((r) => r.uso), ['produto']);
  assert.match(conv.referencias[0].url, /^\/media\//);
  // Texto disfarçado de imagem: 415.
  assert.equal((await pedir('/api/conversas/' + conv.id + '/referencia', { method: 'POST', cookie: c, bytes: Buffer.from('nao sou imagem') })).status, 415);
  const r2 = await pedir('/api/conversas/' + conv.id + '/referencia', { method: 'POST', cookie: c, bytes: PNG });
  assert.equal(r2.json.conversa.referencias.length, 2);
  // A primeira frase: o título sai dela, e as imagens continuam.
  const v = (await pedir('/api/ai/conversa', { method: 'POST', cookie: c, json: { id: conv.id, texto: 'Quero divulgar o pão de queijo' } })).json.conversa;
  assert.equal(v.referencias.length, 2);
  assert.notEqual(v.titulo, 'Nova conversa');
  // Mudar o uso e tirar uma; URL de fora não entra.
  const lista = [{ url: v.referencias[1].url, uso: 'produto' }, { url: 'https://evil.example/x.png', uso: 'estilo' }];
  const p = (await pedir('/api/conversas/' + conv.id, { method: 'PUT', cookie: c, json: { referencias: lista } })).json.conversa;
  assert.deepEqual(p.referencias.map((r) => [r.url === v.referencias[1].url, r.uso]), [[true, 'produto']]);
  // Outra conta: não manda imagem na conversa de ninguém.
  assert.equal((await pedir('/api/conversas/' + conv.id + '/referencia', { method: 'POST', cookie: outra, bytes: PNG })).status, 404);
  // A mídia ficou na conta (Mídias), marcada como referência.
  const midias = (await pedir('/api/media', { cookie: c })).json.items;
  assert.ok(midias.filter((x) => x.origem === 'referencia').length >= 2, 'a imagem não virou mídia da conta');
});
