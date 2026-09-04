/*
 * O contrato entre server.js e os módulos de rota.
 *
 * As rotas foram extraídas de server.js para server/routes/*.js, e recebem
 * tudo de que precisam por um objeto `ctx`. Nada garante que o que a rota
 * DESESTRUTURA seja o que o servidor MONTA — e um símbolo esquecido no meio
 * não quebra o boot, nem os testes, nem o carregamento do módulo: ele explode
 * na primeira requisição que passa por aquela linha, como ReferenceError, e o
 * handler global responde "erro interno".
 *
 * Foi assim que o login com Google ficou quebrado: GOOGLE_CLIENT_ID,
 * GOOGLE_CLIENT_SECRET e isSecureRequest existiam em server.js e não iam no
 * ctx. E só falhava DEPOIS de configurar as credenciais — sem elas
 * googleEnabled() é falso e a rota devolve 501 antes de chegar na linha
 * quebrada. Quem configurava direito era o único a ver o erro.
 *
 * O que este arquivo garante, e o que não garante:
 *
 *   — Garante que toda chave pedida no destructuring de uma rota é fornecida
 *     pelo ctx (a rota pedindo o que o servidor não dá).
 *   — Garante que toda CONSTANTE_MAIÚSCULA usada numa rota vem do ctx ou é
 *     declarada ali mesmo (a rota usando o que ninguém deu).
 *   — NÃO é um analisador de escopo: uma função camelCase livre, como foi o
 *     caso do isSecureRequest, só é pega pela primeira regra, e só depois de
 *     alguém colocá-la no destructuring. Um linter de verdade pegaria as
 *     duas; isto pega a classe inteira do defeito com trinta linhas.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const RAIZ = path.join(__dirname, '..');
const rotas = fs.readdirSync(path.join(RAIZ, 'server', 'routes')).filter((f) => f.endsWith('.js'));

/* Comentário citando um nome não é uso nem oferta: some antes de qualquer leitura. */
function semComentarios(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

function nomes(bloco) {
  return [...new Set((bloco.match(/[A-Za-z_$][\w$]*/g) || []))];
}

/* O que server.js coloca no ctx. */
function ctxDoServidor() {
  const src = semComentarios(fs.readFileSync(path.join(RAIZ, 'server.js'), 'utf8'));
  const m = src.match(/const ctx = \{([\s\S]*?)\n  \};/);
  assert.ok(m, 'não achei o literal `const ctx = {...}` em server.js');
  // `ctx.routes` é acrescentado depois do literal, e as rotas podem usá-lo.
  return new Set([...nomes(m[1]), 'routes']);
}

/* O que uma rota pede do ctx. */
function pedidoDaRota(src) {
  const m = semComentarios(src).match(/const \{([\s\S]*?)\} = ctx;/);
  assert.ok(m, 'não achei o destructuring `= ctx` na rota');
  return nomes(m[1]);
}

for (const arquivo of rotas) {
  const src = fs.readFileSync(path.join(RAIZ, 'server', 'routes', arquivo), 'utf8');

  test(arquivo + ': tudo que a rota pede, o servidor entrega', () => {
    const oferecido = ctxDoServidor();
    const faltando = pedidoDaRota(src).filter((n) => !oferecido.has(n));
    assert.deepEqual(faltando, [],
      'a rota desestrutura do ctx nomes que server.js não coloca lá: ' + faltando.join(', ') +
      '\n       Isso vira `undefined` — e um `undefined()` no meio de uma requisição é "erro interno".');
  });

  test(arquivo + ': nenhuma constante usada sem ninguém ter dado', () => {
    /*
     * O caso GOOGLE_CLIENT_ID, exatamente. Uma constante em maiúsculas só
     * pode vir de três lugares: do ctx, de uma declaração no próprio arquivo,
     * ou de lugar nenhum — e o terceiro é ReferenceError na cara do cliente.
     */
    const limpo = semComentarios(src);
    const pedido = new Set(pedidoDaRota(src));
    const locais = new Set([...limpo.matchAll(/(?:const|let|var|function)\s+([A-Z][A-Z0-9_]*)\b/g)].map((m) => m[1]));
    // Globais do Node que por acaso são maiúsculas, e chaves de objeto/strings
    // não contam como uso de variável.
    const globais = new Set(['JSON', 'URL', 'NaN', 'Infinity', 'Math', 'Date', 'Buffer', 'URLSearchParams', 'Object', 'Array', 'String', 'Number', 'Boolean', 'Promise', 'Map', 'Set', 'Error', 'RegExp', 'TextEncoder', 'TextDecoder', 'AbortController']);

    const semAspas = limpo.replace(/'[^'\n]*'|"[^"\n]*"|`[\s\S]*?`/g, ' ');
    const usadas = [...new Set((semAspas.match(/\b[A-Z][A-Z0-9_]{2,}\b/g) || []))]
      // `foo.BAR` e `BAR:` são propriedade e chave, não variável livre.
      .filter((n) => new RegExp('(^|[^.\\w])' + n + '\\s*(?![:\\w])').test(semAspas))
      .filter((n) => !pedido.has(n) && !locais.has(n) && !globais.has(n));

    assert.deepEqual(usadas, [],
      'a rota usa constantes que ninguém definiu nem passou: ' + usadas.join(', ') +
      '\n       Cada uma é um ReferenceError esperando a requisição certa.');
  });
}
