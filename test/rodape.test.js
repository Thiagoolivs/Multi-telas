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
const CSS = fs.readFileSync(path.join(__dirname, '..', 'css', 'player.css'), 'utf8');

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

/* Mesma técnica para a conta de quantas cópias o letreiro precisa. */
function copiasPara() {
  const i = FONTE.indexOf('function copiasPara(');
  assert.ok(i > 0, 'copiasPara sumiu do player');
  const fim = FONTE.indexOf('\n    }', i) + 6;
  const ctx = { module: {} };
  vm.createContext(ctx);
  vm.runInContext(FONTE.slice(i, fim) + '\nmodule.exports = copiasPara;', ctx);
  return ctx.module.exports;
}
const copias = copiasPara();

/*
 * A velocidade do letreiro. Fecha sobre `data`, então é extraída com um `data`
 * injetado — assim dá para exercitar a PRECEDÊNCIA de verdade, em vez de
 * conferir se a expressão continua escrita de um certo jeito.
 */
function velocidadeCom(data) {
  const i = FONTE.indexOf('function velocidadeDe()');
  assert.ok(i > 0, 'velocidadeDe sumiu do player');
  const fim = FONTE.indexOf('\n    }', i) + 6;
  const ctx = { module: {}, data };
  vm.createContext(ctx);
  vm.runInContext(FONTE.slice(i, fim) + '\nmodule.exports = velocidadeDe;', ctx);
  return ctx.module.exports();
}

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
  // O campo novo manda; o antigo continua valendo para tela já configurada; e
  // sem nenhum dos dois há um padrão. Exercitado de verdade, não por formato.
  assert.equal(velocidadeCom({ velocidadeTexto: 120, velocidade: 40 }), 120, 'o campo novo deixou de mandar');
  assert.equal(velocidadeCom({ velocidade: 40 }), 40, 'tela já configurada perdeu a velocidade dela');
  assert.equal(velocidadeCom({}), 70, 'sumiu o padrão');

  /*
   * E há um PISO. Sem ele, velocidade 0 vira duração infinita e o letreiro
   * congela — uma faixa parada no rodapé de uma TV parece produto quebrado,
   * e ninguém adivinharia que a causa foi um campo zerado no painel.
   */
  assert.ok(velocidadeCom({ velocidadeTexto: 0 }) >= 20, 'velocidade zero congela o letreiro');
  assert.ok(velocidadeCom({ velocidadeTexto: -50 }) >= 20, 'velocidade negativa faz o texto andar ao contrário');

  // O letreiro divide uma largura pela velocidade, e as manchetes também —
  // é o que faz o número significar a mesma coisa nos dois lugares.
  assert.match(FONTE, /larguraDaCopia \/ velocidadeDe\(\)/, 'a conta do letreiro mudou de forma');
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

/* ---------------- A emenda do letreiro ---------------- */

/*
 * Este bloco substitui um teste que guardava o DEFEITO em vez da intenção.
 *
 * Ele exigia `i < 2` e `scrollWidth / 2` — ou seja, exigia que o código
 * continuasse pondo exatamente duas cópias e deslizando metade da faixa. E era
 * justamente isso que abria o buraco: metade da faixa só cobre a tela quando
 * uma cópia é pelo menos tão larga quanto ela. Medido a 1280px, uma mensagem
 * fixa deixava 1040px de faixa vazia passando a cada volta.
 *
 * O teste passava com o defeito no lugar porque perguntava "o código está
 * escrito daquele jeito?" em vez de "o texto cobre a tela inteira?".
 */

test('a faixa cobre a tela no pior instante da volta', () => {
  /*
   * O pior instante é quando a faixa já deslizou uma cópia inteira: o que
   * ainda cobre a tela é `(cópias - 1) × largura da cópia`. Se isso for menor
   * que a tela, entra vazio — e é o vazio que a pessoa vê atravessando.
   */
  const cenarios = [
    { nome: 'uma mensagem curta numa TV grande', copia: 240, tela: 1920 },
    { nome: 'três mensagens', copia: 1011, tela: 1280 },
    { nome: 'feed de notícias longo', copia: 8848, tela: 1280 },
    { nome: 'texto quase do tamanho da tela', copia: 1279, tela: 1280 },
    { nome: 'texto do tamanho exato da tela', copia: 1280, tela: 1280 },
    { nome: 'tela estreita, em pé', copia: 300, tela: 720 },
  ];
  for (const c of cenarios) {
    const n = copias(c.copia, c.tela);
    const cobertura = (n - 1) * c.copia;
    assert.ok(cobertura >= c.tela,
      c.nome + ': sobra ' + (c.tela - cobertura) + 'px de faixa vazia (x' + n + ')');
  }
});

test('conteúdo longo não vira dezenas de cópias à toa', () => {
  // O outro lado do erro: encher a faixa de cópias custa memória e desenho
  // numa TV barata, e duas já bastam quando uma cópia sozinha cobre a tela.
  assert.equal(copias(8848, 1280), 2);
  assert.equal(copias(2000, 1920), 2);
});

test('nunca menos de duas cópias — é a segunda que fecha a emenda', () => {
  // Com uma só, o que entra atrás da que sai é nada.
  assert.ok(copias(99999, 1280) >= 2);
  assert.ok(copias(1, 1) >= 2);
});

test('medida zero não trava nem gera infinitas cópias', () => {
  /*
   * Acontece de verdade: a fonte ainda não chegou, a zona está com largura 0,
   * o elemento acabou de nascer. `Math.ceil(1280 / 0)` é Infinity, e um laço
   * até Infinity pendura a TV — numa tela que precisa ficar no ar o dia todo.
   */
  assert.equal(copias(0, 1280), 2);
  assert.equal(copias(240, 0), 2);
  assert.ok(Number.isFinite(copias(0, 0)));
});

test('a volta anda uma cópia, em pixels — não metade da faixa', () => {
  /*
   * `-50%` é metade da FAIXA, e metade da faixa só é uma cópia quando existem
   * exatamente duas. Como o número de cópias agora muda com o conteúdo e com a
   * tela, a porcentagem deixaria de casar e a emenda voltaria — de um jeito
   * mais difícil de enxergar, porque só apareceria em alguns tamanhos.
   */
  const i = FONTE.indexOf('function startScrollTicker');
  const trecho = FONTE.slice(i, i + 4200);
  assert.match(trecho, /--mt-ticker-volta/, 'a distância da volta deixou de ser escrita em pixels');
  assert.ok(!/translateX\(-50%\)/.test(CSS), 'o CSS voltou a deslizar metade da faixa');
  assert.match(CSS, /var\(--mt-ticker-volta\)/, 'o keyframe não usa a distância medida');
});

test('mudar a largura da zona REMONTA a faixa', () => {
  /*
   * O número de cópias vem da largura da tela. Só recalcular a duração — que
   * era o que o ResizeObserver fazia — deixaria a faixa curta demais para a
   * tela nova, e o buraco voltaria só para quem trocasse de layout. É o pior
   * jeito de um defeito voltar: no caminho que ninguém repete.
   */
  const i = FONTE.indexOf('function startScrollTicker');
  const trecho = FONTE.slice(i, i + 5200);
  assert.match(trecho, /new ResizeObserver\(montar\)/, 'o redimensionamento não remonta a faixa');
});

test('o letreiro busca notícia quando o conteúdo pede', () => {
  const i = FONTE.indexOf('function startScrollTicker');
  const trecho = FONTE.slice(i, i + 2600);
  assert.match(trecho, /fontesDe\(data\)/, 'o letreiro não busca fonte de notícia');
  assert.match(trecho, /conteudo === 'mensagens' \? \[\]/, 'quem só quer mensagem ainda busca feed');
});
