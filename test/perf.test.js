/*
 * O modo leve — a decisão que faz o player rodar numa TV.
 *
 * Contexto, porque estes testes só fazem sentido com ele: o modo leve já
 * existia e já resolvia. Ele nunca ligava. A conta era
 * `hardwareConcurrency <= 2 || deviceMemory <= 2`, e uma TV Samsung responde
 * 4 núcleos e 8 GB — passava por hardware bom e recebia vidro em cada zona
 * mais dois halos de blur cobrindo a tela. Medido com CPU de TV a 1920x1080:
 * 12 quadros por segundo. No modo leve, 60.
 *
 * Cada teste aqui guarda uma dessas duas coisas: a TV é reconhecida a tempo,
 * e o aparelho que ninguém catalogou é pego pela medição.
 *
 * Os testes rodam o js/perf.js DE VERDADE dentro de um DOM de mentira, e não
 * uma cópia da lógica — senão eles concordariam com uma reimplementação minha
 * enquanto o arquivo que embarca faz outra coisa.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const FONTE = fs.readFileSync(path.join(__dirname, '..', 'js', 'perf.js'), 'utf8');

/* Um navegador de mentira, só com o que o perf.js olha. */
function navegador(opcoes) {
  const o = opcoes || {};
  const classes = new Set();
  const guardado = new Map(Object.entries(o.guardado || {}));
  const relogio = { agora: 0, tarefas: [] };

  const janela = {
    document: { documentElement: { classList: {
      contains: (c) => classes.has(c),
      add: (c) => classes.add(c),
      remove: (c) => classes.delete(c),
    } } },
    location: { search: o.busca || '' },
    navigator: {
      userAgent: o.ua || 'Mozilla/5.0 (X11; Linux x86_64) Chrome/120 Safari/537.36',
      hardwareConcurrency: o.nucleos == null ? 4 : o.nucleos,
      deviceMemory: o.memoria == null ? 8 : o.memoria,
    },
    localStorage: {
      getItem: (k) => (guardado.has(k) ? guardado.get(k) : null),
      setItem: (k, v) => guardado.set(k, String(v)),
      removeItem: (k) => guardado.delete(k),
    },
    URLSearchParams,
    setTimeout: (fn) => { relogio.tarefas.push(fn); return 0; },
    // Cada quadro custa o que o teste mandar: 1000/fps milissegundos.
    requestAnimationFrame: (fn) => { relogio.tarefas.push(() => fn(relogio.agora)); return 0; },
  };
  janela.window = janela;
  vm.createContext(janela);
  vm.runInContext(FONTE, janela, { filename: 'perf.js' });

  /* Roda o relógio de mentira: `fps` diz quantos quadros por segundo esta tela
     entrega em cada janela de um segundo. */
  janela.__rodar = (fps) => {
    let n = 0;
    const lista = Array.isArray(fps) ? fps : [fps];
    while (relogio.tarefas.length && n++ < 20000) {
      const passo = 1000 / lista[Math.min(Math.floor(relogio.agora / 1000), lista.length - 1)];
      relogio.agora += passo;
      relogio.tarefas.shift()();
    }
  };
  janela.__classes = classes;
  janela.__guardado = guardado;
  return janela;
}

const leve = (j) => j.__classes.has('mt-perf');

test('TV Samsung é reconhecida antes da primeira pintura', () => {
  const j = navegador({ ua: 'Mozilla/5.0 (SMART-TV; LINUX; Tizen 6.0) AppleWebKit/537.36 76.0.3809.146/6.0 TV Safari/537.36' });
  assert.ok(leve(j), 'a TV do cliente continuaria recebendo o vidro');
  assert.match(j.MTPerf.estado.motivo, /TV/);
});

test('os aparelhos de sala que se identificam entram no modo leve', () => {
  const uas = {
    'LG WebOS': 'Mozilla/5.0 (Web0S; Linux/SmartTV) AppleWebKit/537.36 Safari/537.36',
    'Android TV': 'Mozilla/5.0 (Linux; Android 9; BRAVIA 4K) AppleWebKit/537.36 Safari/537.36',
    Chromecast: 'Mozilla/5.0 (X11; Linux) AppleWebKit/537.36 CrKey/1.56 Safari/537.36',
    'Fire TV': 'Mozilla/5.0 (Linux; Android 9; AFTM) AppleWebKit/537.36 Safari/537.36',
    'Smart TV genérica': 'Mozilla/5.0 (SmartTV; Linux) AppleWebKit/537.36 Safari/537.36',
  };
  for (const [nome, ua] of Object.entries(uas)) {
    assert.ok(navegador({ ua }).MTPerf.ehTv(ua), nome + ' passou como computador');
  }
});

test('celular e computador NÃO perdem o vidro por engano', () => {
  const uas = [
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/17 Safari/605.1.15',
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36',
    'Mozilla/5.0 (Linux; Android 13; SM-S911B) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36',
  ];
  for (const ua of uas) {
    assert.ok(!leve(navegador({ ua })), 'perdeu o vidro à toa: ' + ua.slice(0, 40));
  }
});

test('o aparelho que ninguém catalogou é pego pela medição', () => {
  // Não se diz TV, mas entrega 12 quadros por segundo. É o stick barato.
  const j = navegador({ ua: 'Mozilla/5.0 (Linux) AppleWebKit/537.36 Chrome/76 Safari/537.36' });
  assert.ok(!leve(j), 'não deveria ligar antes de medir');
  j.MTPerf.medir(() => {});
  j.__rodar(12);
  assert.ok(leve(j), 'ficou 12 quadros por segundo e ninguém reparou');
  assert.equal(j.__guardado.get('mt.perf'), 'leve', 'esqueceria no próximo F5');
});

test('tela fluida mantém o vidro', () => {
  const j = navegador({});
  j.MTPerf.medir(() => {});
  j.__rodar(60);
  assert.ok(!leve(j), 'rebaixou uma tela que ia bem');
  assert.ok(j.MTPerf.estado.fps >= 40);
});

test('um engasgo isolado não condena a tela', () => {
  /*
   * Este é o caso que quebrou as duas primeiras versões da medição. Média de
   * três segundos: um engasgo puxava tudo e a tela perdia o vidro PARA SEMPRE,
   * porque a decisão fica guardada. Depois, melhor janela: um segundo de sorte
   * absolvia um aparelho que andava a 12. A mediana não cai nem sobe por um
   * segundo só.
   */
  const j = navegador({});
  j.MTPerf.medir(() => {});
  j.__rodar([60, 60, 8, 60, 60]);   // coleta de lixo, uma imagem decodificando
  assert.ok(!leve(j), 'um engasgo de um segundo não pode custar o vidro para sempre');
});

test('um segundo de sorte não absolve o aparelho lento', () => {
  const j = navegador({});
  j.MTPerf.medir(() => {});
  j.__rodar([60, 11, 11, 12, 12]);  // exatamente o que a TV lenta mediu no navegador
  assert.ok(leve(j), 'a primeira janela boa escondeu quatro ruins');
  assert.equal(j.MTPerf.estado.fps, 12);
});

test('a tela lembra que é lenta e já nasce leve no próximo F5', () => {
  const j = navegador({ guardado: { 'mt.perf': 'leve' } });
  assert.ok(leve(j));
  assert.match(j.MTPerf.estado.motivo, /já se mostrou lenta/);
});

test('?perf=0 devolve o vidro para quem quiser, e apaga a memória', () => {
  const j = navegador({
    ua: 'Mozilla/5.0 (SMART-TV; LINUX; Tizen 6.0) TV Safari/537.36',
    busca: '?perf=0',
    guardado: { 'mt.perf': 'leve' },
  });
  assert.ok(!leve(j), 'nem a TV nem a memória podem vencer o pedido explícito');
  assert.equal(j.__guardado.has('mt.perf'), false, 'a memória continuaria rebaixando no próximo F5');
});

test('?perf=0 também cala a medição', () => {
  const j = navegador({ busca: '?perf=0' });
  j.MTPerf.medir(() => {});
  j.__rodar(9);
  assert.ok(!leve(j), 'mediu e rebaixou mesmo com o dono tendo dito que não');
});

test('?perf=1 liga o modo leve em qualquer aparelho', () => {
  const j = navegador({ busca: '?perf=1' });
  assert.ok(leve(j));
});

test('o modo leve nunca se desliga sozinho', () => {
  // O applyConfig antigo fazia toggle: um tema caprichado devolvia o vidro
  // para a TV que o perf.js tinha acabado de poupar.
  const j = navegador({ ua: 'Mozilla/5.0 (SMART-TV; Tizen 6.0) TV Safari/537.36' });
  j.MTPerf.decidir();
  j.MTPerf.decidir();
  assert.ok(leve(j));
});

test('o service worker pré-cacheia TODO arquivo que o player.html carrega', () => {
  /*
   * Duas listas que precisam concordar e ninguém obriga: os <script>/<link> do
   * player.html e o SHELL_ASSETS do sw.js. Quando divergem, o arquivo que
   * falta some só na queda de rede — o pior lugar possível para descobrir, e
   * numa TV que ninguém vai recarregar. js/cor.js ficou de fora desde que
   * nasceu, e nenhum teste reclamou.
   */
  const raiz = path.join(__dirname, '..');
  const html = fs.readFileSync(path.join(raiz, 'player.html'), 'utf8');
  const sw = fs.readFileSync(path.join(raiz, 'sw.js'), 'utf8');

  const usados = [...html.matchAll(/(?:src|href)="((?:\/|js\/|css\/)[^"]+\.(?:js|css))"/g)]
    .map((m) => (m[1].startsWith('/') ? m[1] : '/' + m[1]));
  assert.ok(usados.length >= 10, 'não achei os scripts do player.html: ' + usados.length);

  const cacheados = new Set([...sw.matchAll(/'(\/[^']+\.(?:js|css|html))'/g)].map((m) => m[1]));
  const fora = usados.filter((u) => !cacheados.has(u));
  assert.deepEqual(fora, [], 'o player carrega mas o sw.js não pré-cacheia: ' + fora.join(', '));
});

test('o perf.js entra antes de tudo, senão a TV pinta caro uma vez', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'player.html'), 'utf8');
  const cabeca = html.slice(0, html.indexOf('</head>'));
  assert.ok(cabeca.includes('js/perf.js'), 'perf.js saiu do <head>: a decisão chega tarde demais');
});

test('a mediana é de janelas, não de quadros soltos', () => {
  const j = navegador({});
  assert.equal(j.MTPerf.mediana([12, 60, 11, 12, 58]), 12);
  assert.equal(j.MTPerf.mediana([60, 59, 58, 8, 60]), 59);
});
