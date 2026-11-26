/*
 * O CACHE DO PREFIXO (server/compositor.js `fixo`, server/motores.js).
 *
 * Cada peça leva a biblioteca-ouro do papel inteira (~43 mil tokens no
 * destaque). Ela só sai barata porque o provedor guarda o prefixo: o
 * Anthropic até o bloco marcado com cache_control, o Gemini e o Groq pelo
 * começo igual do pedido. Basta UM byte diferente no começo — a data de
 * hoje, o id da conta, o nome da empresa, a ordem da biblioteca — e toda
 * peça paga a biblioteca inteira de novo, sem erro nenhum aparecer.
 *
 * Aqui dois pedidos bem diferentes (outra empresa, outra frase, outra
 * foto, outro dia e outro fuso), mais o redesenho da peça que não coube,
 * passam pelos três provedores com o fetch trocado. O prefixo que vai para
 * o cache tem de ser o MESMO, byte a byte, e não pode carregar nada do
 * pedido. Nada aqui chama a rede.
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const C = require('../server/compositor.js');
const ler = (...p) => fs.readFileSync(path.join(__dirname, '..', ...p), 'utf8');
const BOA = ler('pecas-ouro', 'oferta-lista.html');
const PAPEIS = ['destaque', 'lateral', 'cabecalho', 'rodape'];

// O relógio e o fuso de um dia qualquer: o que depender de "agora" muda entre os pedidos.
function noDia(iso, tz, fn) {
  const DataReal = Date, tzAntes = process.env.TZ;
  const fixo = new DataReal(iso).getTime();
  class DataFalsa extends DataReal {
    constructor(...a) { super(...(a.length ? a : [fixo])); }
    static now() { return fixo; }
  }
  globalThis.Date = DataFalsa;
  process.env.TZ = tz;
  return Promise.resolve().then(fn).finally(() => {
    globalThis.Date = DataReal;
    if (tzAntes == null) delete process.env.TZ; else process.env.TZ = tzAntes;
  });
}

// O fetch trocado: guarda cada corpo e responde no formato do provedor.
function comFetch(fn) {
  const antes = globalThis.fetch;
  const corpos = [];
  globalThis.fetch = async (url, o) => {
    const corpo = JSON.parse(o.body);
    corpos.push({ url: String(url), corpo });
    const json = /anthropic/.test(url)
      ? { model: corpo.model, content: [{ type: 'text', text: BOA }], usage: { input_tokens: 10, output_tokens: 10, cache_read_input_tokens: 40000 } }
      : /generativelanguage/.test(url)
        ? { candidates: [{ content: { parts: [{ text: BOA }] } }], usageMetadata: { promptTokenCount: 40010, candidatesTokenCount: 10, cachedContentTokenCount: 40000 } }
        : { model: corpo.model, choices: [{ message: { content: BOA } }], usage: { prompt_tokens: 40010, completion_tokens: 10 } };
    return { ok: true, status: 200, json: async () => json };
  };
  return Promise.resolve(fn(corpos)).finally(() => { globalThis.fetch = antes; });
}
function comChaves(fn) {
  const chaves = { ANTHROPIC_API_KEY: 'k-a', GEMINI_API_KEY: 'k-g', GROQ_API_KEY: 'k-q', AI_PROVIDER: 'gemini' };
  const antes = {};
  for (const k of Object.keys(chaves)) { antes[k] = process.env[k]; process.env[k] = chaves[k]; }
  return Promise.resolve().then(fn).finally(() => { for (const k of Object.keys(chaves)) { if (antes[k] == null) delete process.env[k]; else process.env[k] = antes[k]; } });
}

// Dois pedidos que não têm nada em comum, a não ser o papel.
const PEDIDOS = [
  { pedido: 'óculos de sol 30% até sábado 29/11/2031', empresa: 'Ótica Xilofone Azul', segmento: 'ótica', foto: '/media/t_ab12cd/m_998877aabb.jpg',
    marca: { cores: ['#1b2a4a', '#e0b84c'] }, textos: { titulo: 'Óculos de sol 30% off', apoio: 'Só até sábado, 29/11/2031', cta: 'Reserve pelo WhatsApp' }, evitar: ['Bom dia, 07:43 de quinta'], perfil: 'comercio' },
  { pedido: 'café da manhã completo por R$ 19,37 hoje 26/11/2031', empresa: 'Padaria Quixabeira Ltda', segmento: 'padaria', foto: '/media/t_zz99yy/m_0011223344.jpg',
    marca: { cores: ['#7a3e12'] }, textos: { kicker: 'Hoje', titulo: 'Café completo', apoio: 'Pão na chapa, suco e café', cta: 'R$ 19,37' }, estiloRef: 'tipografia grossa, fundo creme-xadrez', perfil: 'comercio' },
];
const DO_PEDIDO = ['Xilofone', 'Quixabeira', '29/11/2031', '26/11/2031', 't_ab12cd', 'm_998877aabb', 't_zz99yy', '19,37', '#1b2a4a', '#7a3e12', 'creme-xadrez', '07:43'];

// O prefixo que o provedor guarda, como ele o recebe (o texto exato do pedido HTTP).
function prefixo(c) {
  if (/anthropic/.test(c.url)) {
    // Até o bloco com cache_control, inclusive (o que vem antes dele também conta: ferramentas e modelo).
    const i = c.corpo.system.findIndex((b) => b.cache_control);
    assert.ok(i >= 0, 'nenhum bloco marcado para o cache');
    return JSON.stringify({ model: c.corpo.model, tools: c.corpo.tools || null, system: c.corpo.system.slice(0, i + 1) });
  }
  // Gemini e Groq: o cache é implícito, pelo começo do pedido — as instruções de sistema vão antes de tudo.
  if (/generativelanguage/.test(c.url)) return JSON.stringify({ url: c.url, tools: c.corpo.tools || null, sistema: c.corpo.system_instruction });
  return JSON.stringify({ model: c.corpo.model, tools: c.corpo.tools || null, sistema: c.corpo.messages[0] });
}

for (const motor of ['claude-sonnet', 'gemini', 'groq']) {
  test(motor + ': o prefixo em cache é o mesmo byte a byte em todo pedido do papel, e não leva nada do pedido', () => comChaves(() => comFetch(async (corpos) => {
    for (const papel of PAPEIS) {
      corpos.length = 0;
      await noDia('2026-11-26T09:15:00Z', 'America/Sao_Paulo', () => C.comporPeca(Object.assign({ motor, papel, tentativas: 1 }, PEDIDOS[0])));
      await noDia('2027-03-02T22:40:00Z', 'Asia/Tokyo', () => C.comporPeca(Object.assign({ motor, papel, tentativas: 1 }, PEDIDOS[1])));
      // O redesenho da peça que não coube (POST /api/ai/refazer-peca) usa o mesmo prefixo.
      const item = { type: 'peca-html', versao: 1, papel, ...C.preencherPapel({ papel, textos: PEDIDOS[1].textos, empresa: PEDIDOS[1].empresa }), campos: {} };
      await noDia('2027-07-14T03:00:00Z', 'Europe/Lisbon', () => C.refazerPeca({ item, problemas: ['TV em pé: "Título" passa da borda'], motor }));
      // Um de cada pedido e o redesenho (que pede de novo, com o motivo, se a porta recusar a resposta: o prefixo é o mesmo também).
      assert.ok(corpos.length >= 3, papel + ': ' + corpos.length + ' chamadas');
      const [a, b, ...redesenho] = corpos.map(prefixo);
      assert.equal(b, a, papel + ': o prefixo mudou de um pedido para o outro (o cache não valeria)');
      redesenho.forEach((c, i) => assert.equal(c, a, papel + ': o redesenho (chamada ' + (i + 1) + ') mandou outro prefixo'));
      for (const x of DO_PEDIDO) assert.ok(!a.includes(x), papel + ': "' + x + '" do pedido foi parar no prefixo');
      // E o fixo é a biblioteca do papel: ele está inteiro no prefixo.
      assert.ok(a.includes(JSON.stringify(C.fixo(papel)).slice(1, 2000)), papel + ': o fixo não está no começo');
      // O que muda vai DEPOIS do prefixo: o pedido de cada um chega, cada um no seu.
      const resto = corpos.map((k) => JSON.stringify(k.corpo).replace(JSON.stringify(C.fixo(papel)).slice(1, -1), ''));
      assert.ok(resto[0].includes('Xilofone') && resto[1].includes('Quixabeira'), papel + ': o pedido não chegou');
    }
  })));
}

test('o fixo não depende de hora nem de fuso, e as horas que ele traz são as dos exemplos', async () => {
  const antes = {};
  for (const papel of PAPEIS) antes[papel] = C.fixo(papel);
  for (const [iso, tz] of [['2026-01-01T00:00:00Z', 'UTC'], ['2030-12-31T23:59:59Z', 'Pacific/Kiritimati']]) {
    await noDia(iso, tz, () => { for (const papel of PAPEIS) assert.equal(C.fixo(papel), antes[papel], papel + ' mudou em ' + iso + ' ' + tz); });
  }
  // Nenhum relógio de verdade no fixo: as horas que aparecem são as dos exemplos das peças-ouro, iguais às do arquivo.
  for (const papel of PAPEIS) {
    for (const h of new Set(antes[papel].match(/\b\d{1,2}:\d\d\b/g) || [])) {
      assert.ok(fs.readdirSync(path.join(__dirname, '..', 'pecas-ouro')).some((f) => f.endsWith('.html') && ler('pecas-ouro', f).includes(h)), papel + ': a hora ' + h + ' não veio de uma peça-ouro');
    }
  }
});
