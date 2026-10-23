/*
 * Nem tudo é campanha (EXECUTOR D5).
 *
 * - "Como ligo a TV?" virava escopo com quatro zonas e redes: agora é dúvida,
 *   responde com o caminho do painel e não mexe no pedido.
 * - "Quero avisar que fecha mais cedo" pedia redes e horários: agora é aviso,
 *   1 peça, sem redes, sem foto (não gasta criação), pronto na 1ª resposta.
 * - O cartão "O que vou criar" mostrava 22 botões antes de qualquer conversa:
 *   agora mostra só o que a conversa decidiu.
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const http = require('node:http');
const path = require('node:path');
const { spawn } = require('node:child_process');

const conversa = require('../server/ai-conversa.js');
const ai = require('../server/ai.js');
const E = require('../js/escopo.js');
const RAIZ = path.join(__dirname, '..');
const ler = (f) => fs.readFileSync(path.join(RAIZ, f), 'utf8');

test('o tipo do pedido: dúvida, aviso, peça ou campanha', () => {
  const casos = {
    'como ligo a TV?': 'duvida', 'onde mudo o logo?': 'duvida', 'quanto custa?': 'duvida',
    'como faço para ligar a TV?': 'duvida',
    'quero avisar que fecha mais cedo na sexta': 'aviso', 'Reunião geral na sexta às 9h': 'aviso',
    'só uma peça com o cardápio': 'peca',
    'Promoção de pão de queijo à tarde': 'campanha', 'Como faço uma promoção de pão?': 'campanha',
  };
  for (const [t, tipo] of Object.entries(casos)) assert.equal(conversa.tipoDoPedido(t), tipo, t);
  // Com pedido em andamento, pergunta sobre fotos é sobre o pedido, não sobre o sistema.
  assert.equal(conversa.tipoDoPedido('posso usar minhas fotos?', true), 'campanha');
  assert.equal(conversa.tipoDoPedido('posso usar minhas fotos?', false), 'duvida');
});

test('a IA sabe os caminhos do painel e devolve o tipo', () => {
  assert.match(conversa.SISTEMA, /NEM TUDO É CAMPANHA/);
  assert.match(conversa.SISTEMA, /"tipo": "campanha" \| "peca" \| "aviso" \| "duvida"/);
  assert.match(conversa.SISTEMA, /Telas › Ligar a TV/);
  assert.match(conversa.ajudaPara('como ligo a tv?'), /Telas › Ligar a TV/);
  assert.match(conversa.ajudaPara('qual a cor do céu?'), /Conta › Suporte/);
});

test('sem chave: dúvida não monta pedido; aviso é 1 peça sem redes, sem foto, pronto', async () => {
  const d = await conversa.conversar({ mensagens: [{ papel: 'pessoa', texto: 'como ligo a TV?' }], escopo: E.vazio(), ctx: {} });
  assert.equal(d.tipo, 'duvida');
  assert.equal(E.temOQueGerar(d.escopo), false, 'a dúvida montou um pedido');
  assert.match(d.resposta, /Telas › Ligar a TV/);

  const a = await conversa.conversar({ mensagens: [{ papel: 'pessoa', texto: 'quero avisar que fecha mais cedo na sexta' }], escopo: E.vazio(), ctx: {} });
  assert.equal(a.tipo, 'aviso');
  assert.equal(a.pronto, true);
  const c = E.custo(a.escopo);
  assert.equal(c.pecas, 1);
  assert.equal(c.criacoes, 0, 'o aviso gastou criação');
  assert.ok(E.REDES.every((r) => !a.escopo.redes[r]), 'o aviso ligou redes');
  assert.deepEqual(a.escopo.horarios, []);
});

test('com IA: dúvida mantém o escopo mesmo que a IA devolva outro; sem tipo, a regra decide', async (t) => {
  const modo = ai.mode; const chamar = ai.callLLM;
  t.after(() => { ai.mode = modo; ai.callLLM = chamar; });
  ai.mode = () => 'gemini';
  const cheio = E.padrao();
  ai.callLLM = async () => JSON.stringify({ tipo: 'duvida', resposta: 'Vá em Telas › Ligar a TV.', escopo: cheio, pronto: true });
  const r = await conversa.conversar({ mensagens: [{ papel: 'pessoa', texto: 'como ligo a TV?' }], escopo: E.vazio(), ctx: {} });
  assert.equal(r.tipo, 'duvida');
  assert.equal(E.temOQueGerar(r.escopo), false, 'a dúvida aceitou o escopo da IA');
  assert.equal(r.pronto, false);
  assert.equal(r.gerar, false);

  ai.callLLM = async () => JSON.stringify({ resposta: 'ok', escopo: cheio });
  const s = await conversa.conversar({ mensagens: [{ papel: 'pessoa', texto: 'onde mudo o logo?' }], escopo: E.vazio(), ctx: {} });
  assert.equal(s.tipo, 'duvida', 'sem tipo da IA, a pergunta continua dúvida');
  assert.equal(E.temOQueGerar(s.escopo), false);
});

test('o cartão mostra só o combinado, e só aparece quando há o que criar', () => {
  const k = ler('web/src/components/criar/CartaoEscopo.jsx');
  assert.match(k, /const decidida = \(d\) => d\.pecas > 0/);
  assert.match(k, /const zonas = E\.ZONAS\.filter\(\(z\) => tudo \|\| decidida\(zona\(ti, z\)\)\);/);
  assert.match(k, /\{tudo && \(\s*<div className="flex flex-wrap gap-1\.5">\s*\{E\.RECORTES\.map/, 'os recortes aparecem antes de ajustar');
  assert.match(k, /'Ajustar tudo'/);
  const c = ler('web/src/pages/CriarPage.jsx');
  assert.match(c, /\{podeGerar && conversando && \(\s*<div className="space-y-2 lg:hidden">/);
  assert.match(c, /\{conversando && podeGerar && \(\s*<aside/);
});

/* ---------------- servidor de verdade ---------------- */

const PORTA = 5600 + Math.floor(Math.random() * 90);
function pedir(caminho, o = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port: PORTA, path: caminho, method: o.method || 'GET',
      headers: { ...(o.json ? { 'Content-Type': 'application/json' } : {}), ...(o.cookie ? { Cookie: o.cookie } : {}) } }, (res) => {
      let corpo = '';
      res.on('data', (c) => { corpo += c; });
      res.on('end', () => { let json = null; try { json = JSON.parse(corpo); } catch (e) { json = null; } resolve({ status: res.statusCode, json, cookies: [].concat(res.headers['set-cookie'] || []) }); });
    });
    req.on('error', reject);
    req.setTimeout(15000, () => req.destroy(new Error('a rota ' + caminho + ' não respondeu')));
    if (o.json) req.write(JSON.stringify(o.json));
    req.end();
  });
}
const cookieDe = (r) => r.cookies.map((c) => c.split(';')[0]).filter((c) => !c.endsWith('=')).join('; ');

test('a rota: a dúvida no meio não tira o "pronto para gerar"', async (t) => {
  const dados = fs.mkdtempSync(path.join(os.tmpdir(), 'mt-d5-'));
  const servidor = spawn(process.execPath, ['server.js'], {
    cwd: RAIZ, stdio: 'ignore',
    env: { ...process.env, PORT: String(PORTA), STORAGE: 'local', SKIP_VERIFY: '1', DATABASE_URL: '', DATA_DIR: dados, MEDIA_DIR: dados, AI_PROVIDER: 'dev' },
  });
  t.after(() => { servidor.kill(); try { fs.rmSync(dados, { recursive: true, force: true }); } catch (e) { /* o Windows segura o arquivo */ } });
  let ok = false;
  for (let i = 0; i < 60 && !ok; i++) { try { await pedir('/tv'); ok = true; } catch (e) { await new Promise((r) => setTimeout(r, 250)); } }
  assert.ok(ok, 'o servidor de teste não subiu');
  const c = cookieDe(await pedir('/api/auth/signup', { method: 'POST', json: { email: 'd5' + Date.now() + '@teste.local', password: 'senha-de-teste-123', name: 'Loja', aceite: true } }));

  const d = await pedir('/api/ai/conversa', { method: 'POST', cookie: c, json: { texto: 'como ligo a TV?' } });
  assert.equal(d.status, 200);
  assert.equal(d.json.tipo, 'duvida');
  assert.equal(d.json.conversa.estado, 'conversando');
  assert.equal(E.temOQueGerar(d.json.conversa.escopo), false);

  const id = d.json.conversa.id;
  const a = await pedir('/api/ai/conversa', { method: 'POST', cookie: c, json: { id, texto: 'quero avisar que fecha mais cedo na sexta' } });
  assert.equal(a.json.tipo, 'aviso');
  assert.equal(a.json.pronto, true);
  assert.equal(a.json.conversa.estado, 'entendido');

  const de = await pedir('/api/ai/conversa', { method: 'POST', cookie: c, json: { id, texto: 'onde mudo o logo?' } });
  assert.equal(de.json.tipo, 'duvida');
  assert.equal(de.json.pronto, true, 'a dúvida tirou o pronto');
  assert.equal(de.json.conversa.estado, 'entendido');
  assert.equal(E.custo(de.json.conversa.escopo).pecas, 1, 'a dúvida mexeu no aviso combinado');
});
