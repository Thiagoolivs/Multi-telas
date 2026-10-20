/*
 * A camada de IA (server/motores.js, PLANO §4.2).
 *
 * O `callLLM` antigo tinha um provedor para tudo, 700 tokens de saída, visão
 * só no Gemini, nenhum cache e um custo fixo de cinco centavos por chamada
 * de texto. Estes testes conferem, provedor por provedor, o que o
 * experimento (§4.4) precisa: o motor escolhido POR CHAMADA, a peça inteira
 * cabendo na saída, a imagem chegando ao modelo, o exemplo fixo indo em
 * cache e os tokens de verdade chegando ao uso_ia.
 *
 * Nenhum teste chama a rede: o fetch é trocado por um que grava o pedido e
 * devolve a resposta no formato de cada API.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'mt-motores-'));
const M = require('../server/motores.js');

const RAIZ = path.join(__dirname, '..');
const semComentarios = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const IMAGEM = { mime: 'image/png', data: 'iVBORw0KGgo=' };

// Troca o fetch por um que grava o pedido e responde com `resposta(url, corpo)`.
function comFetch(resposta, fn) {
  const antes = globalThis.fetch;
  const pedidos = [];
  globalThis.fetch = async (url, op) => {
    const corpo = JSON.parse(op.body);
    pedidos.push({ url, corpo, headers: op.headers });
    const r = resposta(url, corpo);
    return { ok: r.ok !== false, status: r.status || 200, json: async () => r.json };
  };
  return Promise.resolve(fn(pedidos)).finally(() => { globalThis.fetch = antes; });
}

function comEnv(vars, fn) {
  const antes = {};
  for (const k of Object.keys(vars)) { antes[k] = process.env[k]; if (vars[k] == null) delete process.env[k]; else process.env[k] = vars[k]; }
  return Promise.resolve(fn()).finally(() => {
    for (const k of Object.keys(vars)) { if (antes[k] == null) delete process.env[k]; else process.env[k] = antes[k]; }
  });
}

const RESPOSTA_CLAUDE = {
  json: {
    model: 'claude-sonnet-5-5', content: [{ type: 'text', text: '<section class="mt-peca"></section>' }],
    usage: { input_tokens: 1200, output_tokens: 3400, cache_read_input_tokens: 9000, cache_creation_input_tokens: 0 },
  },
};

/* ---------------- Motor por chamada, saída e cache ---------------- */

test('Claude: o motor vem da chamada, a saída cabe a peça e o exemplo fixo vai em cache', () =>
  comEnv({ ANTHROPIC_API_KEY: 'k', ANTHROPIC_MODEL: null, ANTHROPIC_MODEL_TETO: null }, () =>
    comFetch(() => RESPOSTA_CLAUDE, async (pedidos) => {
      const r = await M.chamar({ motor: 'claude-sonnet', fixo: 'BIBLIOTECA-OURO', sistema: 'Componha.', usuario: 'Óculos 30% off', maxTokens: 12000 });
      const c = pedidos[0].corpo;
      assert.match(pedidos[0].url, /api\.anthropic\.com\/v1\/messages/);
      assert.equal(c.model, 'claude-sonnet-5-5');
      assert.equal(c.max_tokens, 12000);
      // O fixo vai PRIMEIRO e marcado: o cache é de prefixo.
      assert.deepEqual(c.system[0], { type: 'text', text: 'BIBLIOTECA-OURO', cache_control: { type: 'ephemeral' } });
      assert.equal(c.system[1].text, 'Componha.');
      assert.equal(r.texto, '<section class="mt-peca"></section>');

      // O teto é outro motor na MESMA configuração — escolhido por chamada, não por env.
      await M.chamar({ motor: 'claude-opus', sistema: 's', usuario: 'u' });
      assert.equal(pedidos[1].corpo.model, 'claude-opus-5-5');
      // Sem dizer o tamanho, a saída padrão ainda cabe uma peça inteira (era 700).
      assert.equal(pedidos[1].corpo.max_tokens, 8192);
    })));

test('Claude: os tokens de verdade voltam, com a leitura de cache separada', () =>
  comEnv({ ANTHROPIC_API_KEY: 'k' }, () =>
    comFetch(() => RESPOSTA_CLAUDE, async () => {
      const { uso } = await M.chamar({ motor: 'claude-sonnet', sistema: 's', usuario: 'u' });
      assert.equal(uso.motor, 'claude-sonnet');
      assert.equal(uso.provedor, 'anthropic');
      assert.equal(uso.entrada, 1200);
      assert.equal(uso.saida, 3400);
      assert.equal(uso.cacheLida, 9000);
      assert.equal(uso.cacheEscrita, 0);
      assert.ok(uso.ms >= 0);
    })));

/* ---------------- Visão nos três provedores ---------------- */

test('a imagem chega ao modelo nos três provedores, cada um no formato dele', () =>
  comEnv({ ANTHROPIC_API_KEY: 'k', GEMINI_API_KEY: 'g', GROQ_API_KEY: 'q' }, () =>
    comFetch((url) => {
      if (/anthropic/.test(url)) return RESPOSTA_CLAUDE;
      if (/groq/.test(url)) return { json: { choices: [{ message: { content: '{}' } }], usage: { prompt_tokens: 10, completion_tokens: 2 } } };
      return { json: { candidates: [{ content: { parts: [{ text: '{}' }] } }], usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 2 } } };
    }, async (pedidos) => {
      await M.chamar({ motor: 'claude-sonnet', sistema: 's', usuario: 'olhe o print', imagens: [IMAGEM] });
      await M.chamar({ motor: 'gemini', sistema: 's', usuario: 'olhe o print', imagens: [IMAGEM] });
      await M.chamar({ motor: 'groq', sistema: 's', usuario: 'olhe o print', imagens: [IMAGEM] });
      const [claude, gemini, groq] = pedidos.map((p) => p.corpo);
      assert.deepEqual(claude.messages[0].content[0], { type: 'image', source: { type: 'base64', media_type: 'image/png', data: IMAGEM.data } });
      assert.equal(claude.messages[0].content[1].text, 'olhe o print');
      assert.deepEqual(gemini.contents[0].parts[1], { inline_data: { mime_type: 'image/png', data: IMAGEM.data } });
      assert.equal(groq.messages[1].content[0].image_url.url, 'data:image/png;base64,' + IMAGEM.data);
    })));

/* ---------------- Gemini ---------------- */

test('Gemini: o fixo vem antes do sistema (cache implícito), e o cache medido sai da entrada', () =>
  comEnv({ GEMINI_API_KEY: 'g', GEMINI_MODEL: null }, () =>
    comFetch(() => ({ json: {
      candidates: [{ content: { parts: [{ text: '{"ok":true}' }] } }],
      usageMetadata: { promptTokenCount: 10000, cachedContentTokenCount: 8000, candidatesTokenCount: 500, thoughtsTokenCount: 40 },
    } }), async (pedidos) => {
      const r = await M.chamar({ motor: 'gemini', fixo: 'EXEMPLOS', sistema: 'Regras.', usuario: 'u', json: true, maxTokens: 9000 });
      const c = pedidos[0].corpo;
      assert.equal(c.system_instruction.parts[0].text, 'EXEMPLOS\n\nRegras.');
      assert.equal(c.generationConfig.maxOutputTokens, 9000);
      assert.equal(c.generationConfig.responseMimeType, 'application/json');
      assert.equal(r.uso.entrada, 2000);
      assert.equal(r.uso.cacheLida, 8000);
      assert.equal(r.uso.saida, 540, 'o "pensar" também é saída paga');
    })));

test('Gemini: modelo indisponível cai para o próximo candidato, erro de chave não insiste', () =>
  comEnv({ GEMINI_API_KEY: 'g', GEMINI_MODEL: 'gemini-velho' }, () =>
    comFetch((url) => (/gemini-velho/.test(url)
      ? { ok: false, status: 404, json: { error: { message: 'model is no longer available' } } }
      : { json: { candidates: [{ content: { parts: [{ text: '{}' }] } }], usageMetadata: {} } }), async (pedidos) => {
      const r = await M.chamar({ motor: 'gemini', sistema: 's', usuario: 'u' });
      assert.equal(r.uso.modelo, M.GEMINI_CANDIDATOS[0]);
      assert.match(pedidos[0].url, /gemini-velho/);
    }).then(() => comFetch(() => ({ ok: false, status: 400, json: { error: { message: 'API key not valid' } } }), async (pedidos) => {
      await assert.rejects(M.chamar({ motor: 'gemini', sistema: 's', usuario: 'u' }), /API key not valid/);
      assert.equal(pedidos.length, 1);
    }))));

/* ---------------- Custo ---------------- */

test('o custo sai dos tokens medidos, em centavos com fração, e o preço é configuração', () =>
  comEnv({ MT_COTACAO_DOLAR: '5', MT_PRECOS_IA: null }, () => {
    // Sonnet: 1M de entrada a US$ 3 = US$ 3 = R$ 15 = 1500 centavos.
    assert.equal(M.custoCentavos({ motor: 'claude-sonnet', entrada: 1e6, saida: 0, cacheLida: 0, cacheEscrita: 0 }), 1500);
    // Cache lido a um décimo do preço da entrada.
    assert.equal(M.custoCentavos({ motor: 'claude-sonnet', entrada: 0, saida: 0, cacheLida: 1e6, cacheEscrita: 0 }), 150);
    // Uma chamada de texto comum custa menos de um centavo — e não vira zero.
    const pequena = M.custoCentavos({ motor: 'gemini', entrada: 2000, saida: 300, cacheLida: 0, cacheEscrita: 0 });
    assert.ok(pequena > 0 && pequena < 1, String(pequena));
    return comEnv({ MT_PRECOS_IA: JSON.stringify({ 'claude-sonnet': { entrada: 6 } }) }, () => {
      assert.equal(M.custoCentavos({ motor: 'claude-sonnet', entrada: 1e6, saida: 0, cacheLida: 0, cacheEscrita: 0 }), 3000);
    });
  }));

/* ---------------- Medição por requisição ---------------- */

test('a requisição soma as chamadas dela, e consumir zera para não contar duas vezes', () =>
  comEnv({ ANTHROPIC_API_KEY: 'k', MT_COTACAO_DOLAR: '5' }, () =>
    comFetch(() => RESPOSTA_CLAUDE, () => M.medir(async () => {
      await M.chamar({ motor: 'claude-sonnet', sistema: 's', usuario: 'u' });
      await M.chamar({ motor: 'claude-sonnet', sistema: 's', usuario: 'u' });
      const soma = M.consumirMedicao();
      assert.equal(soma.chamadas, 2);
      assert.equal(soma.entrada, 2400);
      assert.equal(soma.saida, 6800);
      assert.equal(soma.cacheLida, 18000);
      assert.equal(soma.modelos, 'claude-sonnet-5-5');
      assert.ok(soma.custoCentavos > 0);
      assert.equal(M.consumirMedicao().chamadas, 0);
    }))));

test('fora de uma requisição medida, chamar funciona e consumir devolve zero', () =>
  comEnv({ ANTHROPIC_API_KEY: 'k' }, () =>
    comFetch(() => RESPOSTA_CLAUDE, async () => {
      await M.chamar({ motor: 'claude-sonnet', sistema: 's', usuario: 'u' });
      assert.equal(M.consumirMedicao().chamadas, 0);
    })));

test('o servidor mede toda requisição da API', () => {
  const s = semComentarios(fs.readFileSync(path.join(RAIZ, 'server.js'), 'utf8'));
  assert.match(s, /return motores\.medir\(\(\) => handleApi\(req, res, pathname, parsed\.query \|\| \{\}\)\)/);
});

/* ---------------- Até o uso_ia ---------------- */

test('cobrar grava os tokens medidos e troca a estimativa do texto pelo custo medido', () =>
  comEnv({ ANTHROPIC_API_KEY: 'k', MT_COTACAO_DOLAR: '5', MT_PRECOS_IA: null }, () =>
    comFetch(() => RESPOSTA_CLAUDE, () => M.medir(async () => {
      const usoIA = require('../server/uso-ia.js');
      const gravados = [];
      const db = { registrarUsoIA: async (t, u) => { gravados.push(u); } };
      await M.chamar({ motor: 'claude-sonnet', sistema: 's', usuario: 'u' });
      const r = await usoIA.cobrar(db, { id: 't1' }, { tipo: 'gerar-composicao', userId: 'u1' });
      // 1200×3 + 3400×15 + 9000×0,3 = 57.300 US$/M → US$ 0,0573 → R$ 0,2865 → 28,65 centavos.
      assert.ok(Math.abs(r.medido.custoCentavos - 28.65) < 1e-9, String(r.medido.custoCentavos));
      assert.equal(gravados[0].custoCentavos, 29, 'o texto deixou de ser os 5 centavos fixos');
      assert.equal(gravados[0].tokens.entrada, 1200);
      assert.equal(gravados[0].tokens.cacheLida, 9000);
      // Sem chamada medida, a estimativa do catálogo continua valendo.
      const sem = await usoIA.cobrar(db, { id: 't1' }, { tipo: 'gerar-composicao', userId: 'u1' });
      assert.equal(sem.custoCentavos, 5);
      assert.equal(gravados[1].tokens, null);
    }))));

test('o banco guarda modelo, tokens e o custo medido com fração', async () => {
  const db = require('../server/db-sqlite.js');
  await db.registrarUsoIA('t-medido', { tipo: 'gerar-composicao', creditos: 0, custoCentavos: 0,
    tokens: { chamadas: 2, modelos: 'claude-sonnet-5-5', entrada: 1200, saida: 3400, cacheLida: 9000, cacheEscrita: 0, custoCentavos: 0.42 } });
  await db.registrarUsoIA('t-medido', { tipo: 'gerar-imagem', creditos: 1, custoCentavos: 35 });
  const { DatabaseSync } = require('node:sqlite');
  const arquivo = fs.readdirSync(process.env.DATA_DIR).find((f) => f.endsWith('.db'));
  const linhas = new DatabaseSync(path.join(process.env.DATA_DIR, arquivo))
    .prepare('SELECT tipo, modelo, chamadas, tokens_entrada, tokens_saida, tokens_cache, custo_medido FROM uso_ia WHERE tenant_id = ? ORDER BY tipo').all('t-medido');
  assert.deepEqual(linhas.map((l) => ({ ...l })), [
    { tipo: 'gerar-composicao', modelo: 'claude-sonnet-5-5', chamadas: 2, tokens_entrada: 1200, tokens_saida: 3400, tokens_cache: 9000, custo_medido: 0.42 },
    { tipo: 'gerar-imagem', modelo: '', chamadas: 0, tokens_entrada: 0, tokens_saida: 0, tokens_cache: 0, custo_medido: null },
  ]);
  // O Postgres recebe as mesmas colunas.
  const pg = semComentarios(fs.readFileSync(path.join(RAIZ, 'server', 'db-postgres.js'), 'utf8'));
  for (const col of ['modelo TEXT', 'chamadas INTEGER', 'tokens_entrada INTEGER', 'tokens_saida INTEGER', 'tokens_cache INTEGER', 'tokens_cache_escrita INTEGER', 'custo_medido DOUBLE PRECISION']) {
    assert.ok(pg.includes('ALTER TABLE uso_ia ADD COLUMN IF NOT EXISTS ' + col), col);
  }
});

/* ---------------- As trilhas de sempre ---------------- */

test('callLLM continua o caminho das trilhas prontas, agora pela camada nova', () =>
  comEnv({ AI_PROVIDER: 'anthropic', ANTHROPIC_API_KEY: 'k', ANTHROPIC_MODEL: null }, () =>
    comFetch(() => RESPOSTA_CLAUDE, async (pedidos) => {
      const ai = require('../server/ai.js');
      const texto = await ai.callLLM('sistema', 'usuario');
      assert.equal(texto, '<section class="mt-peca"></section>');
      assert.equal(pedidos[0].corpo.model, 'claude-sonnet-5-5', 'saiu do claude-3-5-sonnet-latest');
      assert.ok(pedidos[0].corpo.max_tokens >= 4096, 'saiu dos 700 tokens');
      const fonte = semComentarios(fs.readFileSync(path.join(RAIZ, 'server', 'ai.js'), 'utf8'));
      assert.doesNotMatch(fonte, /api\.anthropic\.com|api\.groq\.com/, 'provedor de texto fora da camada');
    })));

test('sem provedor configurado, chamar recusa em vez de inventar resposta', () =>
  comEnv({ AI_PROVIDER: 'dev' }, async () => {
    await assert.rejects(M.chamar({ sistema: 's', usuario: 'u' }), /modo dev/);
  }));

test('a visão das trilhas antigas usa o Gemini quando há chave, e o motor padrão quando não há', () =>
  comEnv({ AI_PROVIDER: 'anthropic', ANTHROPIC_API_KEY: 'k', GEMINI_API_KEY: null, GOOGLE_API_KEY: null }, () =>
    comFetch(() => ({ json: { content: [{ type: 'text', text: '{"estilo":"minimalista, muito branco"}' }], usage: {} } }), async (pedidos) => {
      const ai = require('../server/ai.js');
      assert.equal(await ai.descreverEstilo([IMAGEM]), 'minimalista, muito branco');
      assert.match(pedidos[0].url, /anthropic/);
      assert.equal(pedidos[0].corpo.messages[0].content[0].type, 'image');
    }).then(() => comEnv({ GEMINI_API_KEY: 'g' }, () =>
      comFetch(() => ({ json: { candidates: [{ content: { parts: [{ text: '{"estilo":"x"}' }] } }], usageMetadata: {} } }), async (pedidos) => {
        await require('../server/ai.js').descreverEstilo([IMAGEM]);
        assert.match(pedidos[0].url, /generativelanguage/);
      })))));
