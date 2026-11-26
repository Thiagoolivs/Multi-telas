/*
 * O agente no painel: o plano embaixo da mensagem da IA no Criar, com o
 * "Validar e pôr no ar" só no plano mais novo, o andamento item por item, o
 * resultado com o Desfazer, e o freio da conta na ficha da Plataforma.
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ler = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

test('o Criar mostra o plano do agente e só o mais novo valida', () => {
  const C = ler('web/src/pages/CriarPage.jsx');
  assert.match(C, /<PlanoDoAgente mensagem=\{m\} conversaId=\{conversa && conversa\.id\} ativo=\{planoAtivo === i && !criada\}/);
  assert.match(C, /if \(r\.gerar\) setParaAprovar\(/);
  // Desligado, o Criar é o de sempre: o cartão do assistente continua.
  assert.match(C, /<AcaoDaIA acao=\{m\.acao\}/);
});

test('a volta do agente com plano nunca vem com "gerar" (o esboço de antes não abre por cima do plano)', async () => {
  const antes = process.env.MT_AGENTE;
  process.env.MT_AGENTE = 'ligado';
  process.env.AI_PROVIDER = 'dev';
  try {
    const A = require('../server/agente');
    const out = await A.responder({ mensagens: [{ papel: 'pessoa', texto: 'aviso de piso molhado', em: Date.now() }], ctx: { telas: [{ id: 't', nome: 'Balcão' }], grupos: [], perfil: 'comercio' }, sess: { tenant_id: 'tp', user_id: 'u' }, db: null });
    assert.equal(out.agente.estado, 'esperando');
    assert.equal(out.gerar, false);
  } finally { if (antes === undefined) delete process.env.MT_AGENTE; else process.env.MT_AGENTE = antes; }
});

test('o cartão do plano: validar é o toque, o andamento é por item, o resultado tem Desfazer', () => {
  const P = ler('web/src/components/criar/PlanoDoAgente.jsx');
  assert.match(P, /const podeValidar = ativo && plano\.estado === 'esperando' && vaoAoAr\.length > 0;/);
  assert.match(P, /agenteApi\.validar\(conversaId, plano\.chave, acompanhar\)/, 'a validação não leva a chave do plano');
  assert.match(P, /'Validar e mandar para aprovação' : 'Validar e pôr no ar'/);
  assert.match(P, /Nada vai para as TVs antes deste toque\. Depois, dá para desfazer\./);
  assert.match(P, /String\(job\.detalhe \|\| ''\)\.split\('\|'\)/, 'o andamento de cada item não é lido');
  assert.match(P, /loteApi\.desfazer\(id\)/);
  assert.match(P, /esperando a aprovação do dono/);
  assert.match(P, /<MudarAparencia tv=\{tela\.tv\}/, 'a mudança de TV não abre o antes e o depois');
  assert.match(P, /Confira/);
  // Linguagem simples: nada de modelo, token ou nome de IA.
  assert.doesNotMatch(P, /token|modelo de linguagem|Gemini|Claude|GPT/i);
  const api = ler('web/src/api.js');
  assert.match(api, /async validar\(conversaId, chave, onEtapa, sinal\) \{\s*const job = await api\('POST', '\/api\/ai\/agente', \{ conversaId, chave \}\);/);
});

test('a Plataforma: as contagens do agente e o freio de cada conta', () => {
  const P = ler('web/src/pages/PlatformPage.jsx');
  assert.match(P, /<AgenteResumo dias=\{dias\} \/>/);
  assert.match(P, /<AgenteDaConta id=\{data\.id\} \/>/);
  const A = ler('web/src/components/platform/Agente.jsx');
  assert.match(A, /agente\.desligarConta\(id, !data\.desligado\)/);
  assert.match(A, /Desligar nesta conta/);
});
