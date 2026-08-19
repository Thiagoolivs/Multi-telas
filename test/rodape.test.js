/*
 * O rodapé de notícias.
 *
 * O que estes testes guardam é a separação de DUAS PERGUNTAS que viviam num
 * campo só: de onde vem o texto, e como ele se move. Enquanto foram uma coisa
 * só, o letreiro contínuo só existia dentro da opção "só mensagens fixas" — e
 * a combinação mais pedida de todas, notícia rolando sem parar, não podia ser
 * pedida por ninguém. Não por decisão de produto: por um campo com dois
 * trabalhos.
 *
 * A leitura do modo é uma conta pura, então roda aqui sem navegador. O arquivo
 * do player é lido de verdade e a função extraída dele — uma cópia da lógica
 * concordaria comigo enquanto a TV faz outra coisa.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const FONTE = fs.readFileSync(path.join(__dirname, '..', 'js', 'player.js'), 'utf8');

/* Extrai `lerModo` do player sem executar o arquivo inteiro (que precisa de DOM). */
function lerModo() {
  const i = FONTE.indexOf('function lerModo(data)');
  assert.ok(i > 0, 'lerModo sumiu do player');
  const fim = FONTE.indexOf('\n  }', i) + 4;
  const ctx = { module: {} };
  vm.createContext(ctx);
  vm.runInContext(FONTE.slice(i, fim) + '\nmodule.exports = lerModo;', ctx);
  return ctx.module.exports;
}

const modo = lerModo();

test('as duas perguntas são respondidas por dois campos', () => {
  assert.deepEqual(modo({ conteudo: 'noticias', movimento: 'letreiro' }),
    { conteudo: 'noticias', movimento: 'letreiro' });
  assert.deepEqual(modo({ conteudo: 'mensagens', movimento: 'manchetes' }),
    { conteudo: 'mensagens', movimento: 'manchetes' });
});

test('notícia rolando sem parar passa a ser possível', () => {
  /*
   * O teste que justifica a mudança inteira. Antes não havia combinação de
   * valores que produzisse isto: `modo: 'rolagem'` dava o letreiro e, no mesmo
   * gesto, desligava o feed.
   */
  const m = modo({ conteudo: 'noticias', movimento: 'letreiro' });
  assert.equal(m.conteudo, 'noticias');
  assert.equal(m.movimento, 'letreiro');
});

test('tela já configurada continua fazendo o que fazia', () => {
  // Ninguém tem que reconfigurar a TV da recepção por causa de um refactor.
  assert.deepEqual(modo({ modo: 'rolagem' }), { conteudo: 'mensagens', movimento: 'letreiro' });
  assert.deepEqual(modo({ modo: 'noticias' }), { conteudo: 'ambos', movimento: 'manchetes' });
  assert.deepEqual(modo({}), { conteudo: 'ambos', movimento: 'manchetes' });
});

test('o campo novo manda sobre o antigo', () => {
  // Depois da primeira edição no painel os dois convivem no JSON; quem vale é
  // o novo, senão a mudança não teria efeito nenhum.
  assert.deepEqual(modo({ modo: 'rolagem', conteudo: 'noticias', movimento: 'letreiro' }),
    { conteudo: 'noticias', movimento: 'letreiro' });
});

/* ---------------- A velocidade ---------------- */

test('o player lê a velocidade em pixels por segundo, nos dois movimentos', () => {
  /*
   * O painel dizia "Velocidade (s) · menor = mais rápido". Errado nas duas
   * pontas: o player divide a distância pelo número, então ele é px/s e MAIOR
   * é mais rápido. E aquele campo (`velocidade`) só era lido pelo letreiro —
   * no modo padrão, mexer nele não fazia nada.
   */
  assert.match(FONTE, /velocidadeTexto\) \|\| Number\(data\.velocidade\) \|\| 70/,
    'o letreiro deixou de aceitar velocidadeTexto');
  assert.match(FONTE, /largura \/ velocidade/, 'a conta do letreiro mudou de forma');
  assert.match(FONTE, /excesso \/ velocidadeRolagem/, 'a conta das manchetes mudou de forma');
});

test('o painel não promete segundos onde o player conta pixels', () => {
  const painel = fs.readFileSync(
    path.join(__dirname, '..', 'web', 'src', 'components', 'content', 'TickerEditor.jsx'), 'utf8');
  /*
   * A checagem mira o ATRIBUTO, e não o texto do arquivo: o comentário que
   * explica o conserto cita o rótulo antigo entre aspas, e uma busca crua
   * acusaria a própria explicação como se fosse o defeito.
   */
  const rotulos = [...painel.matchAll(/label="([^"]+)"/g)].map((m) => m[1]);
  const dicas = [...painel.matchAll(/hint="([^"]+)"/g)].map((m) => m[1]);
  assert.ok(!rotulos.includes('Velocidade (s)'), 'o rótulo voltou a dizer segundos');
  assert.ok(!dicas.some((d) => /Menor = mais rápido/.test(d)), 'a dica voltou a ensinar o contrário');
  assert.ok(dicas.some((d) => /Pixels por segundo/.test(d)), 'a unidade sumiu da dica');
  assert.ok(!rotulos.includes('Modo'), 'o campo que misturava as duas perguntas voltou');
});

test('o letreiro duplica o texto para não abrir buraco na emenda', () => {
  // É o que torna a rolagem infinita em vez de um laço com vão no meio.
  const i = FONTE.indexOf('function startScrollTicker');
  const trecho = FONTE.slice(i, i + 2600);
  assert.match(trecho, /i < 2/, 'parou de duplicar o texto');
  assert.match(trecho, /scrollWidth \/ 2/, 'a conta da metade sumiu');
});

test('o letreiro busca notícia quando o conteúdo pede', () => {
  const i = FONTE.indexOf('function startScrollTicker');
  const trecho = FONTE.slice(i, i + 2600);
  assert.match(trecho, /fontesDe\(data\)/, 'o letreiro não busca fonte de notícia');
  assert.match(trecho, /conteudo === 'mensagens' \? \[\]/, 'quem só quer mensagem ainda busca feed');
});
