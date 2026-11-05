/*
 * Reteste de 03/11: a régua de conteúdo valia para a campanha do Criar, mas
 * a Criação rápida e a campanha de Meus Designs (/api/ai/director) não
 * passavam por ela. Numa conta Saúde, "Xarope Gripex cura a gripe em 1 dia"
 * saía na peça e nas três legendas, sem bloqueio nem aviso.
 *
 *   - conferirPecasSoltas lê o texto da peça (campos, HTML, elementos) e as
 *     legendas do diretor;
 *   - o resultado do diretor volta com `conferencia`;
 *   - a biblioteca (por onde a Criação rápida e Meus Designs guardam antes de
 *     pôr na TV) recusa o que a lei barra.
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
const C = require('../server/conferencia');

test('conferirPecasSoltas: a peça e as legendas do diretor passam pela régua', () => {
  const pecas = [
    { item: { type: 'peca', campos: { titulo: 'Xarope Gripex cura a gripe em 1 dia', preco: 'R$ 19,90' } } },
    { item: { elementos: [{ tipo: 'texto', text: 'Promoção 30% só hoje' }] } },
  ];
  const r = C.conferirPecasSoltas(pecas, { instagram: 'Gripex cura a gripe!', whatsapp: '', linkedin: '' }, { perfil: 'saude', contexto: 'Farmácia' });
  assert.deepEqual(r.bloqueios.map((b) => b.onde), ['peça 1', 'textos das redes']);
  assert.ok(r.avisos.some((a) => a.onde === 'peça 1' && a.tipo === 'preco'), 'o preço que ninguém disse vira aviso');
  assert.ok(r.avisos.some((a) => a.onde === 'peça 2'), 'o texto desenhado por coordenada também é lido');
  assert.equal(C.conferirPecasSoltas([{ item: { campos: { titulo: 'Pão de queijo em dobro' } } }], null, { perfil: 'comercio' }).bloqueios.length, 0);
  // A mesma peça em três formatos: um bloqueio, não três.
  const tres = [0, 1, 2].map(() => ({ item: { campos: { titulo: 'Gripex cura a gripe' } } }));
  assert.equal(C.conferirPecasSoltas(tres, null, { perfil: 'saude' }).bloqueios.length, 1);
  assert.equal(C.barraAsPecas({ bloqueios: [{ onde: 'textos das redes' }] }), false);
  assert.match(C.porQueNaoRoda({ bloqueios: [{ onde: 'peça 1', trecho: 'cura', motivo: 'x', regra: 'r' }] }, 'Não deu para guardar'), /^Não deu para guardar, troque o texto da peça 1/);
  // O que a pessoa disse não é inventado.
  const RC = require('../js/regras-de-conteudo.js');
  const dito = C.conferirPecasSoltas([{ item: { campos: { titulo: 'Pão de queijo R$ 0,90' } } }], null, { perfil: 'comercio', permitidos: RC.permitidosDe(['pão de queijo a R$ 0,90 cada']) });
  assert.equal(dito.avisos.filter((a) => a.tipo === 'preco').length, 0);
});

test('o diretor devolve a conferência; a Criação rápida e Meus Designs não guardam nem publicam o barrado', () => {
  const s = fs.readFileSync(path.join(RAIZ, 'server.js'), 'utf8');
  assert.match(s, /out\.conferencia = await conferencia\.conferirDaConta\(db, sess\.tenant_id, out\.pecas, out\.social, \{/);
  assert.match(s, /marca, memoria: lembrada,/, "o que a marca e a memória já disseram não é inventado");
  const rapida = fs.readFileSync(path.join(RAIZ, 'web/src/pages/CriacaoRapidaPage.jsx'), 'utf8');
  assert.match(rapida, /if \(barrado\) throw new Error\('Esta peça não pode ir para a TV:/);
  assert.match(rapida, /const barrado = conf && \(conf\.bloqueios \|\| \[\]\)\.find\(\(x\) => x\.peca\);/, 'só a peça barra; a legenda não');
  assert.ok(rapida.indexOf('if (barrado) throw') < rapida.indexOf('await library.save(titulo, pecas)'), 'barra antes de guardar');
  const meus = fs.readFileSync(path.join(RAIZ, 'web/src/pages/MyDesignsPage.jsx'), 'utf8');
  assert.match(meus, /<Conferencia conferencia=\{gen\.conferencia\}/);
  assert.match(meus, /\{gen\.social && !redesBarradas &&/, 'a legenda barrada não fica na tela para copiar');
  assert.match(meus, /disabled=\{busy \|\| barrada\} onClick=\{\(\) => salvarCampanha\(true\)\}/);
  assert.match(meus, /disabled=\{busy \|\| barrada\} onClick=\{\(\) => salvarCampanha\(false\)\}/);
});

test('a biblioteca recusa guardar a promessa de cura numa conta Saúde (e guarda a de Comércio)', async (t) => {
  const porta = 7300 + Math.floor(Math.random() * 90);
  const dados = fs.mkdtempSync(path.join(os.tmpdir(), 'mt-conf-'));
  const env = { ...process.env, PORT: String(porta), STORAGE: 'local', SKIP_VERIFY: '1', DATABASE_URL: '', DATA_DIR: dados, MEDIA_DIR: dados, AI_PROVIDER: 'dev', ASAAS_API_KEY: '' };
  for (const k of ['RAILWAY_ENVIRONMENT', 'RAILWAY_ENVIRONMENT_NAME', 'RAILWAY_PROJECT_ID', 'NODE_ENV']) delete env[k];
  const servidor = spawn(process.execPath, ['server.js'], { cwd: RAIZ, stdio: 'ignore', env });
  t.after(() => { servidor.kill(); try { fs.rmSync(dados, { recursive: true, force: true }); } catch (e) { /* o Windows segura o arquivo */ } });
  const pedir = (caminho, o = {}) => new Promise((resolve, reject) => {
    const corpo = o.body ? JSON.stringify(o.body) : '';
    const headers = { ...(o.body ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(corpo) } : {}), ...(o.cookie ? { Cookie: o.cookie } : {}) };
    const req = http.request({ host: '127.0.0.1', port: porta, path: caminho, method: o.method || 'GET', headers }, (res) => {
      let txt = '';
      res.on('data', (c) => { txt += c; });
      res.on('end', () => { let json = null; try { json = JSON.parse(txt); } catch (e) { json = null; } resolve({ status: res.statusCode, json, cookies: [].concat(res.headers['set-cookie'] || []) }); });
    });
    req.on('error', reject);
    if (corpo) req.write(corpo);
    req.end();
  });
  let ok = false;
  for (let i = 0; i < 160 && !ok; i++) { try { await pedir('/tv'); ok = true; } catch (e) { await new Promise((r) => setTimeout(r, 250)); } }
  assert.ok(ok, 'o servidor de teste não subiu');
  async function conta(perfil) {
    const r = await pedir('/api/auth/signup', { method: 'POST', body: { email: perfil + Date.now() + '@teste.local', password: 'senha-de-teste-123', name: 'Conta', aceite: true, perfil } });
    assert.equal(r.status < 300, true, JSON.stringify(r.json));
    return r.cookies.map((c) => c.split(';')[0]).filter((c) => !c.endsWith('=')).join('; ');
  }
  const peca = { canal: 'TV', formato: '16:9', label: 'Gripex', item: { type: 'peca', campos: { titulo: 'Xarope Gripex cura a gripe em 1 dia' } } };
  const saude = await conta('saude');
  const barrada = await pedir('/api/library', { method: 'POST', cookie: saude, body: { campaign: 'Gripe', pieces: [peca] } });
  assert.equal(barrada.status, 422, JSON.stringify(barrada.json));
  assert.equal(barrada.json.code, 'conteudo-barrado');
  assert.match(barrada.json.error, /^Não deu para guardar, troque o texto da peça 1/);
  const limpa = { ...peca, item: { type: 'peca', campos: { titulo: 'A vacina da gripe chegou: agende na recepção' } } };
  assert.equal((await pedir('/api/library', { method: 'POST', cookie: saude, body: { campaign: 'Gripe', pieces: [limpa] } })).status, 201);
  // E a edição à mão depois de guardar passa pela mesma régua.
  const guardada = (await pedir('/api/library', { cookie: saude })).json.items[0];
  const editada = await pedir('/api/library/' + guardada.id, { method: 'PUT', cookie: saude, body: { item: peca.item, label: 'Gripex' } });
  assert.equal(editada.status, 422, 'a edição pôs a promessa de cura de volta');
  const comercio = await conta('comercio');
  const oferta = { ...peca, item: { type: 'peca', campos: { titulo: 'Pão de queijo em dobro à tarde' } } };
  assert.equal((await pedir('/api/library', { method: 'POST', cookie: comercio, body: { campaign: 'Tarde', pieces: [oferta] } })).status, 201);
});
