/*
 * A IA encaixa o aviso (EXECUTOR D27).
 *
 * "Adicione aviso da peça quebrada no banheiro": a IA cria, acha o espaço,
 * mostra a prévia e, com o ok, a frota recebe. Aqui: a leitura da frase
 * (com e sem IA), a peça sem texto de exemplo e o lugar na TV.
 */
'use strict';
process.env.AI_PROVIDER = process.env.AI_PROVIDER || 'dev';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const http = require('node:http');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { spawn } = require('node:child_process');

const RAIZ = path.join(__dirname, '..');
const ler = (...p) => fs.readFileSync(path.join(RAIZ, ...p), 'utf8');
const A = require('../server/aviso-rapido');
const PH = require('../js/peca-html.js');
const M = JSON.parse(ler('pecas-ouro', 'manifesto.json'));
const modelos = new Map(M.pecas.map((p) => [p.id, { ...p, arq: PH.doArquivo(ler('pecas-ouro', p.id + '.html')) }]));
const HOJE = new Date(2026, 9, 23); // sexta, 23/10
const GRUPOS = ['Loja Centro', 'Fábrica'];

test('a frase como a pessoa fala vira o aviso: título de cartaz, detalhe, até quando, prioridade, onde', () => {
  const v = (t) => A.semIA(t, HOJE, GRUPOS);
  assert.deepEqual(v('Adicione aviso da peça quebrada no banheiro'), { titulo: 'Peça quebrada no banheiro', detalhe: '', ate: '', prioridade: 'alta', alvo: { tipo: 'todas' } });
  const b = v('Coloca um aviso: banheiro do 2º andar interditado até amanhã, use o do térreo');
  assert.equal(b.titulo, 'Banheiro do 2º andar interditado', 'a data ficou no cartaz');
  assert.equal(b.detalhe, 'use o do térreo');
  assert.equal(b.ate, '2026-10-24');
  assert.equal(v('Aviso urgente: vazamento de gás na cozinha, evacuar').prioridade, 'urgente');
  assert.equal(v('Aviso urgente: vazamento de gás na cozinha, evacuar').titulo, 'Vazamento de gás na cozinha');
  const g = v('Põe aviso na Loja Centro que o ar-condicionado está em manutenção até sexta');
  assert.deepEqual(g.alvo, { tipo: 'grupo', nome: 'Loja Centro' });
  assert.equal(g.titulo, 'O ar-condicionado está em manutenção');
  assert.equal(g.ate, '2026-10-30', 'até sexta, numa sexta, é a da semana que vem');
  assert.equal(A.ateQuando('até 15/11', HOJE), '2026-11-15');
  assert.equal(A.ateQuando('até 02/10', HOJE), '2027-10-02');
});

test('com IA: o que ela devolve é conferido (grupo que não existe, data no passado, prioridade inventada)', () => {
  const r = A.normalizar({ titulo: 'Elevador parado', detalhe: 'Use a escada', ate: '2020-01-01', prioridade: 'máxima', grupo: 'Filial X' }, 'elevador parado até amanhã', HOJE, GRUPOS);
  assert.equal(r.titulo, 'Elevador parado');
  assert.equal(r.ate, '2026-10-24', 'data no passado não vale; fica a da frase');
  assert.equal(r.prioridade, 'alta');
  assert.deepEqual(r.alvo, { tipo: 'todas' }, 'grupo que a conta não tem');
  assert.match(A.SISTEMA, /Não invente telefone, local ou horário/);
});

test('a peça: o alerta dos modelos, com a marca, sem nada do texto de exemplo; na TV, na frente da principal', async () => {
  const L = await import(pathToFileURL(path.join(RAIZ, 'web/src/lib/aviso.js')).href);
  const aviso = { titulo: 'Peça quebrada no banheiro', detalhe: '', ate: '2026-10-24', prioridade: 'urgente', alvo: { tipo: 'todas' } };
  const it = L.pecaDoAviso(aviso, modelos, { nome: 'Padaria Real', cores: ['#7a2e0e', '#f2c14e'] });
  const v = PH.validarItem(it);
  assert.equal(v.ok, true, v.problemas.join('; '));
  assert.equal(it.campos.kicker, 'Urgente');
  for (const c of v.campos) if (c.tipo === 'texto' && c.nome !== 'marca') assert.ok(c.nome in it.campos, 'exemplo do modelo no campo ' + c.nome);
  assert.deepEqual(it.ocultos, ['apoio'], 'detalhe vazio escondido');
  const cfg = { settings: { layoutId: 'full' }, zonas: { principal: { items: [{ type: 'image', src: '/a.jpg' }] } } };
  let c = L.aplicarAviso(cfg, it, aviso, 'avs_1');
  assert.equal(c.zonas.principal.items[0]._aviso, 'avs_1', 'o aviso não entrou na frente');
  assert.deepEqual(c.zonas.principal.items[0].meta, { tipo: 'aviso', prioridade: 'urgente' });
  assert.equal(c.zonas.principal.items[0].agendamento.dataFim, '2026-10-24');
  c = L.aplicarAviso(c, it, { ...aviso, ate: '' }, 'avs_1');
  assert.equal(c.zonas.principal.items.filter((i) => i._aviso).length, 1, 'aplicar de novo empilhou');
  assert.equal(c.zonas.principal.items[0].agendamento, undefined, 'sem data: até alguém tirar');
  // Sem principal: a MAIOR lista, nunca cabeçalho/rodapé; sem lista nenhuma, não envia (nota do consultor).
  const real = globalThis.MT_getLayout;
  try {
    globalThis.MT_getLayout = () => ({ zones: [{ id: 'topo', type: 'header', area: 'topo' }, { id: 'a', type: 'playlist', area: 'a' }, { id: 'b', type: 'playlist', area: 'b' }, { id: 'pe', type: 'ticker', area: 'pe' }],
      grid: { columns: '1fr 3fr', rows: '12vh 1fr 10vh', areas: ['topo topo', 'a b', 'pe pe'] } });
    assert.equal(L.zonaDoAviso({}), 'b');
    globalThis.MT_getLayout = () => ({ zones: [{ id: 'topo', type: 'header', area: 'topo' }], grid: { columns: '1fr', rows: '1fr', areas: ['topo'] } });
    assert.equal(L.zonaDoAviso({}), null);
    assert.throws(() => L.aplicarAviso({}, it, aviso, 'avs_2'), /não tem onde mostrar o aviso/);
  } finally { globalThis.MT_getLayout = real; }
  assert.equal(L.zonaDoAviso({ settings: { layoutId: 'video-dynamic' } }), 'video');
  assert.deepEqual(L.telasDoAviso({ alvo: { tipo: 'grupo', nome: 'Fábrica' } }, [{ id: 'a', grupo: 'Fábrica' }, { id: 'b' }]).map((t) => t.id), ['a']);
});

test('o painel: aviso rápido na Programação, prévia antes, envio em lote com Desfazer', () => {
  const d = ler('web/src/components/tela/AvisoRapido.jsx');
  assert.match(d, /const r = await gravarEmLote\(alvos, naTela, 'Aviso: ' \+ aviso\.titulo\);/);
  assert.match(d, /throw new Error\(\(tv\.name \|\| 'Uma TV'\) \+ ': ' \+ e\.message \+ '\. Nada foi enviado\.'\);/, 'TV sem lugar para o aviso não para o envio');
  assert.match(d, /avisarComDesfazer\(/);
  assert.match(d, /<PecaHtml item=\{item\} formato="16\/9" \/>/, 'sem prévia antes de mandar');
  // D51: o aviso rápido mora dentro do "Pedir à IA" da Programação.
  assert.match(ler('web/src/pages/ProgramacaoPage.jsx'), /onClick=\{\(\) => setAvisoAberto\(true\)\}>Pedir à IA</);
  assert.match(ler('web/src/components/tela/PedirIA.jsx'), /<AvisoRapido avisoInicial=\{avisoPronto\}/);
  const s = ler('server.js');
  assert.match(s, /aviso: 'aviso-rapido',/);
  assert.match(s, /rateLimit\('ai:aviso:' \+ sess\.tenant_id, 60, 60 \* 60 \* 1000\)/);
});

/* ---------------- servidor de verdade ---------------- */

const PORTA = 6700 + Math.floor(Math.random() * 90);
function pedir(caminho, o = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port: PORTA, path: caminho, method: o.method || 'GET',
      headers: { ...(o.json ? { 'Content-Type': 'application/json' } : {}), ...(o.cookie ? { Cookie: o.cookie } : {}) } }, (res) => {
      let corpo = '';
      res.on('data', (c) => { corpo += c; });
      res.on('end', () => { let json = null; try { json = JSON.parse(corpo); } catch (e) { json = null; } resolve({ status: res.statusCode, json, cookies: [].concat(res.headers['set-cookie'] || []) }); });
    });
    req.on('error', reject);
    req.setTimeout(30000, () => req.destroy(new Error('a rota ' + caminho + ' não respondeu')));
    if (o.json) req.write(JSON.stringify(o.json));
    req.end();
  });
}

test('a rota: só com sessão, devolve o aviso para a prévia', async (t) => {
  const dados = fs.mkdtempSync(path.join(os.tmpdir(), 'mt-d27-'));
  const servidor = spawn(process.execPath, ['server.js'], {
    cwd: RAIZ, stdio: 'ignore',
    env: { ...process.env, PORT: String(PORTA), STORAGE: 'local', SKIP_VERIFY: '1', DATABASE_URL: '', DATA_DIR: dados, MEDIA_DIR: dados, AI_PROVIDER: 'dev' },
  });
  t.after(() => { servidor.kill(); try { fs.rmSync(dados, { recursive: true, force: true }); } catch (e) { /* o Windows segura o arquivo */ } });
  let ok = false;
  for (let i = 0; i < 160 && !ok; i++) { try { await pedir('/tv'); ok = true; } catch (e) { await new Promise((r) => setTimeout(r, 250)); } }
  assert.ok(ok, 'o servidor de teste não subiu');
  assert.equal((await pedir('/api/ai/aviso', { method: 'POST', json: { texto: 'x' } })).status, 401);
  const c = (await pedir('/api/auth/signup', { method: 'POST', json: { email: 'd27' + Date.now() + '@teste.local', password: 'senha-de-teste-123', name: 'Loja', aceite: true } }))
    .cookies.map((x) => x.split(';')[0]).filter((x) => !x.endsWith('=')).join('; ');
  const r = await pedir('/api/ai/aviso', { method: 'POST', cookie: c, json: { texto: 'Adicione aviso da peça quebrada no banheiro' } });
  assert.equal(r.status, 200);
  assert.equal(r.json.aviso.titulo, 'Peça quebrada no banheiro');
  assert.equal((await pedir('/api/ai/aviso', { method: 'POST', cookie: c, json: { texto: '  ' } })).status, 400);
});
