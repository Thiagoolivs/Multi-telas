/*
 * O encaixe no painel antes de o agente pôr no ar (server/agente/encaixe.js):
 * a execução para no "Conferindo o encaixe…", o painel pega as peças e
 * devolve o que deu; a peça nova passa de novo pela porta e pela lei; a que
 * não coube vai com o aviso; sem o painel, o prazo curto vence e a execução
 * segue só com a conferência do servidor, e o registro diz.
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

process.env.AI_PROVIDER = 'dev';
const Enc = require('../server/agente/encaixe');
const X = require('../server/agente/executor');
const A = require('../server/agente');
const P = require('../js/peca-html.js');

const RAIZ = path.join(__dirname, '..');
const espera = (ms) => new Promise((r) => setTimeout(r, ms));
const ouro = (titulo) => {
  const arq = P.doArquivo(fs.readFileSync(path.join(RAIZ, 'pecas-ouro', 'servico-alerta.html'), 'utf8'));
  return { type: 'peca-html', versao: 1, papel: 'destaque', html: arq.html, css: arq.css, campos: { kicker: 'Aviso', titulo, apoio: '' }, marca: { cores: ['#123456'] }, modo: 'claro', formato: '16/9', duracao: 12, origem: { motor: 'ouro', base: 'servico-alerta', pedido: 'x' } };
};

test('encaixe: sem ninguém pegar, "sem-painel"; pegou e não voltou, "demorou"; voltou, só o que foi pedido', async () => {
  const a = Enc.pedir('ten1', [{ chave: '0:1', item: {} }], { painelMs: 30, maxMs: 1000 });
  assert.deepEqual(await a.resposta, { respondeu: false, motivo: 'sem-painel', resultados: {} });
  assert.equal(Enc.pegar(a.codigo, 'ten1'), null, 'o pedido vencido continuou de pé');

  const b = Enc.pedir('ten1', [{ chave: '0:1', item: {} }], { painelMs: 30, maxMs: 60 });
  assert.equal(Enc.pegar(b.codigo, 'outra-conta'), null, 'outra conta pegou as peças');
  assert.equal(Enc.pegar(b.codigo, 'ten1').length, 1);
  await espera(40);
  assert.equal(Enc._pedidos.has(b.codigo), true, 'pegou e o prazo curto (do painel fechado) ainda valeu');
  assert.equal((await b.resposta).motivo, 'demorou');

  const c = Enc.pedir('ten1', [{ chave: '0:1', item: {} }, { chave: '1:1', item: {} }], { painelMs: 1000, maxMs: 1000 });
  Enc.pegar(c.codigo, 'ten1');
  assert.equal(Enc.responder(c.codigo, 'outra-conta', {}), false);
  assert.equal(Enc.responder(c.codigo, 'ten1', {
    '0:1': { estado: 'reserva', item: { type: 'peca-html' }, avisos: [] },
    '1:1': { estado: 'cabe', item: { type: 'peca-html' } },
    '9:9': { estado: 'cabe' },
    '0:2': { estado: 'qualquer' },
  }), true);
  const r = await c.resposta;
  assert.equal(r.respondeu, true);
  assert.deepEqual(Object.keys(r.resultados).sort(), ['0:1', '1:1'], 'entrou chave que não foi pedida');
  assert.ok(r.resultados['0:1'].item, 'a reserva perdeu a peça');
  assert.equal(r.resultados['1:1'].item, undefined, 'a peça que cabe não tem por que voltar');
  assert.equal(Enc.responder(c.codigo, 'ten1', {}), false, 'respondeu duas vezes');
});

test('encaixe: o portão espera todos os itens (o que sai sem peça não segura) e confere uma vez só', async () => {
  const chamadas = [];
  const porta = Enc.portao(3, async (pecas) => { chamadas.push(pecas.map((x) => x.chave)); return { respondeu: true, resultados: {} }; });
  const um = porta.chegar([{ chave: '0:1' }]);
  porta.sair();
  assert.equal(chamadas.length, 0, 'conferiu antes de todos chegarem');
  const dois = porta.chegar([{ chave: '2:1' }, { chave: '2:2' }]);
  await Promise.all([um, dois]);
  assert.deepEqual(chamadas, [['0:1', '2:1', '2:2']]);
  // Ninguém com peça: não chama o painel.
  const vazio = Enc.portao(2, async () => { throw new Error('não devia chamar'); });
  vazio.sair(); vazio.sair();
});

// Um plano validado com aviso, peça e quiz, e um envio de mentira.
async function planoValidado() {
  process.env.MT_AGENTE = 'ligado';
  const ctx = { empresa: 'Metalúrgica Alfa', perfil: 'empresa', hoje: '2026-11-26', marca: {}, telas: [{ id: 't1', nome: 'Recepção', grupo: 'RH' }, { id: 't2', nome: 'Refeitório', grupo: 'Refeitório' }], grupos: ['RH', 'Refeitório'] };
  const out = await A.responder({ mensagens: [{ papel: 'pessoa', texto: 'aviso de piso molhado na entrada, uma peça de segurança sobre o EPI e um quiz sobre segurança', em: Date.now() }], ctx, sess: { tenant_id: 'ten_enc', user_id: 'u' }, db: null });
  delete process.env.MT_AGENTE;
  assert.equal(out.agente.estado, 'esperando', out.resposta);
  return { plano: out.agente, ctx };
}
function executar(plano, ctx, envios, o) {
  const operacao = async (sess, corpo) => { envios.push(corpo); return { status: 200, corpo: { ok: true, lote: 'lot_' + envios.length } }; };
  return X.executar(Object.assign({ db: null, sess: { tenant_id: 'ten_enc', user_id: 'u' }, rotas: { operacao }, plano, ctx, chaveDoPlano: A.chaveDoPlano, validacao: { chave: plano.chave, em: Date.now() } }, o));
}

test('encaixe: o painel confere; a reserva vai no lugar, a que não coube vai com o aviso, e a peça nova inválida não entra', async () => {
  const { plano, ctx } = await planoValidado();
  assert.deepEqual(plano.itens.map((i) => i.tipo), ['aviso', 'peca', 'quiz']);
  const envios = [];
  let codigo = '';
  const etapas = [];
  const progresso = (etapa, detalhe) => { etapas.push(etapa); const m = /(?:^|\|)e:([^|]+)/.exec(detalhe || ''); if (m) codigo = m[1]; };
  const rodando = executar(plano, ctx, envios, { progresso, encaixe: { tempos: { painelMs: 2000, maxMs: 2000 } } });
  for (let k = 0; k < 100 && !codigo; k++) await espera(10);
  assert.ok(codigo, 'a execução não anunciou o encaixe');
  assert.ok(etapas.includes('Conferindo o encaixe…'));
  assert.equal(envios.length, 0, 'publicou antes do encaixe');
  const pecas = Enc.pegar(codigo, 'ten_enc');
  assert.deepEqual(pecas.map((x) => x.chave).sort(), ['0:1', '1:1'], 'o quiz (sem peça desenhada) entrou no encaixe, ou faltou peça');
  const reserva = ouro('Use o EPI');
  Enc.responder(codigo, 'ten_enc', {
    '0:1': { estado: 'nao-cabe', avisos: ['TV deitada: "titulo" passa da borda'] },
    '1:1': { estado: 'reserva', item: reserva, avisos: [] },
  });
  const r = await rodando;
  assert.deepEqual(r.itens.map((x) => x.estado), ['no-ar', 'no-ar', 'no-ar']);
  assert.ok(r.itens[0].avisos.some((a) => /Pode não caber na TV: TV deitada/.test(a)), 'a peça que não coube não foi marcada');
  const daPeca = envios.find((e) => e.operacao.tipo === 'campanha');
  assert.equal(daPeca.operacao.entradas[0].zonas.principal[0].item.campos.titulo, 'Use o EPI', 'a reserva não foi no lugar');
  assert.equal(r.encaixe.respondeu, true);
  assert.equal(r.encaixe.trocadas, 1);
  assert.equal(r.encaixe.naoCabem, 1);
  assert.ok(r.passos.some((p) => p.ferramenta === 'encaixe' && /painel conferiu 2 peças/.test(p.resultado)));

  // A peça nova que não passa na lei (ou na porta) não entra: vai a de antes, com o aviso.
  const { plano: p2, ctx: c2 } = await planoValidado();
  const envios2 = [];
  let cod2 = '';
  const rod2 = executar(p2, c2, envios2, { progresso: (e, d) => { const m = /(?:^|\|)e:([^|]+)/.exec(d || ''); if (m) cod2 = m[1]; }, encaixe: { tempos: { painelMs: 2000, maxMs: 2000 } } });
  for (let k = 0; k < 100 && !cod2; k++) await espera(10);
  Enc.pegar(cod2, 'ten_enc');
  Enc.responder(cod2, 'ten_enc', { '1:1': { estado: 'redesenhada', item: Object.assign(ouro('Xarope que cura a gripe'), { origem: { motor: 'ouro', pedido: 'x' } }) } });
  const r2 = await rod2;
  const peca2 = envios2.find((e) => e.operacao.tipo === 'campanha').operacao.entradas[0].zonas.principal[0].item;
  assert.doesNotMatch(JSON.stringify(peca2.campos), /cura/, 'a peça com promessa de cura foi para a TV');
  assert.ok(r2.itens[1].avisos.some((a) => /não passou na conferência/.test(a)));
});

test('encaixe: sem o painel (página fechada), o prazo curto vence e publica só com a conferência do servidor', async () => {
  const { plano, ctx } = await planoValidado();
  const envios = [];
  const t0 = Date.now();
  const r = await executar(plano, ctx, envios, { encaixe: { tempos: { painelMs: 60, maxMs: 5000 } } });
  assert.ok(Date.now() - t0 < 4000, 'esperou o prazo longo sem ninguém ter pegado');
  assert.deepEqual(r.itens.map((x) => x.estado), ['no-ar', 'no-ar', 'no-ar']);
  assert.equal(envios.length, 3);
  assert.equal(r.encaixe.respondeu, false);
  assert.equal(r.encaixe.motivo, 'sem-painel');
  assert.ok(r.passos.some((p) => p.ferramenta === 'encaixe' && /sem o painel aberto: publicado só com a conferência do servidor/.test(p.resultado)), 'o registro não diz que foi sem o painel');
  // Sem `encaixe` (a avaliação, os testes antigos), não para.
  const sem = await executar(plano, ctx, [], {});
  assert.equal(sem.encaixe.usado, false);
});

test('o painel: lê o código, roda o encaixe de sempre e devolve só a peça que trocou', async () => {
  const fonte = fs.readFileSync(path.join(RAIZ, 'web/src/components/criar/PlanoDoAgente.jsx'), 'utf8');
  assert.match(fonte, /import\('\.\.\/\.\.\/lib\/encaixeAuto\.js'\), import\('\.\/EncaixeAutomatico\.jsx'\)/, 'o encaixe não é o de sempre');
  assert.match(fonte, /garantirTodas\(r\.pecas, passosDoEncaixe\(\)\)/);
  assert.match(fonte, /agenteApi\.responderEncaixe\(codigo, respostaDoEncaixe\(resultados\)\)/);
  assert.match(fonte, /if \(codigo && !encaixes\.current\.has\(codigo\)\)/, 'o mesmo código seria conferido a cada volta do acompanhamento');
  // As funções puras, sem React.
  const so = fonte.slice(fonte.indexOf('export const codigoDoEncaixe'), fonte.indexOf('async function conferirEncaixe'));
  const m = { exports: {} };
  new Function('module', 'exports', so.replace(/export (const|function) /g, '$1 ') + '\nmodule.exports = { codigoDoEncaixe, respostaDoEncaixe };')(m, m.exports);
  assert.equal(m.exports.codigoDoEncaixe('e:Abc123|0:fazendo|1:espera'), 'Abc123');
  assert.equal(m.exports.codigoDoEncaixe('0:fazendo'), '');
  assert.deepEqual(m.exports.respostaDoEncaixe({ a: { estado: 'cabe', item: { x: 1 }, avisos: [] }, b: { estado: 'reserva', item: { y: 2 }, avisos: [] } }),
    { a: { estado: 'cabe', avisos: [] }, b: { estado: 'reserva', avisos: [], item: { y: 2 } } });
});
