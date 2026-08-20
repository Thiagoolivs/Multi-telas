/*
 * server/limites.js — os freios de conta inteira.
 *
 * O sistema já tinha limite por rota: 30 gerações de IA por hora, 20 leituras
 * de site, 10 campanhas. O que faltava era o teto da CONTA, e a diferença
 * importa: vinte rotas a trinta por hora cada uma somam seiscentas chamadas
 * por hora sem nenhuma delas passar do próprio limite. E as rotas comuns —
 * salvar config, listar mídia, publicar — não tinham limite nenhum.
 *
 * O que este módulo defende não é dinheiro de IA (isso é crédito, em
 * server/creditos.js). É a máquina: um laço no navegador de um cliente, um
 * script mal escrito, uma integração que repete, uma conta que abre conexão e
 * nunca fecha. Nenhum desses é ataque; todos derrubam o servidor de todo mundo
 * do mesmo jeito.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * O PRINCÍPIO QUE DECIDE TUDO AQUI: **A TELA NUNCA PARA.**
 *
 * É o mesmo de docs/BILLING.md, e vale mais ainda para limite técnico do que
 * para cobrança. O caminho do PLAYER — pegar config, bater ponto, receber
 * aviso — é medido e nunca bloqueado. Bloquear a TV de uma recepção porque o
 * painel de alguém entrou em laço seria punir quem não fez nada, na parede,
 * na frente dos clientes dele.
 *
 * O que o teto barra é o caminho do PAINEL, onde do outro lado há uma pessoa
 * que vê o aviso e pode parar.
 */

const { log } = require('./log.js');

/*
 * Classes de tráfego. Cada uma tem um teto e uma postura diferente, porque o
 * custo de errar é diferente em cada uma.
 */
const CLASSES = {
  /*
   * O painel. 600 em 5 minutos são 2 por segundo sustentados — uma pessoa
   * trabalhando rápido faz uns 30 por minuto, e um laço faz milhares. A folga
   * é grande de propósito: um teto apertado transformaria um dia movimentado
   * em suporte.
   */
  painel: { max: 600, janelaMs: 5 * 60 * 1000, bloqueia: true },
  /*
   * O player. MEDIDO, NUNCA BLOQUEADO — ver o princípio acima. O número existe
   * para a supervisão poder mostrar "esta conta está pedindo config 40 vezes
   * por minuto", que quase sempre é uma TV com defeito de rede, e não abuso.
   */
  tela: { max: 1200, janelaMs: 5 * 60 * 1000, bloqueia: false },
  /*
   * Upload. Poucos e pesados: o teto aqui é sobre banda e disco, não sobre
   * contagem de requisição.
   */
  upload: { max: 120, janelaMs: 60 * 60 * 1000, bloqueia: true },
};

/* Balde por conta e classe. Janela fixa, em memória, como o resto. */
const baldes = new Map();      // 'classe:tenant' -> { n, ate }
const excessos = new Map();    // tenant -> { [classe]: { vezes, ultimo } }

function chave(classe, tenantId) { return classe + ':' + tenantId; }

/*
 * Conta uma requisição e diz se ela pode seguir.
 *
 * Devolve `ok:false` só quando a classe bloqueia. Para a classe do player,
 * devolve sempre `ok:true` e mesmo assim REGISTRA o excesso — quem opera
 * precisa enxergar a tela defeituosa antes de o cliente ligar reclamando.
 */
function permitir(classe, tenantId) {
  const regra = CLASSES[classe];
  if (!regra || !tenantId) return { ok: true, classe, restam: Infinity };

  const agora = Date.now();
  const k = chave(classe, tenantId);
  let b = baldes.get(k);
  if (!b || agora > b.ate) { b = { n: 0, ate: agora + regra.janelaMs }; baldes.set(k, b); }
  b.n++;

  if (b.n <= regra.max) {
    return { ok: true, classe, restam: regra.max - b.n };
  }

  anotarExcesso(tenantId, classe, agora, b.n);
  return {
    ok: !regra.bloqueia,
    excedeu: true,
    classe,
    restam: 0,
    retryAfter: Math.max(1, Math.ceil((b.ate - agora) / 1000)),
  };
}

/*
 * Só a PRIMEIRA vez de cada estouro vira log.
 *
 * Uma conta em laço estoura o teto a cada requisição; registrar todas encheria
 * o log com milhares de linhas idênticas justamente quando alguém precisa lê-lo
 * para entender o que houve. O contador continua subindo — o que não se repete
 * é o barulho.
 */
function anotarExcesso(tenantId, classe, agora, n) {
  let e = excessos.get(tenantId);
  if (!e) { e = {}; excessos.set(tenantId, e); }
  const primeiro = !e[classe];
  e[classe] = { vezes: ((e[classe] && e[classe].vezes) || 0) + 1, ultimo: agora };
  if (primeiro || n % 500 === 0) {
    log.aviso('limite.estourado', { tenant: tenantId, classe, vezes: e[classe].vezes });
  }
}

/* ---------------- Conexões abertas ---------------- */

/*
 * O SSE não é requisição: é um socket que fica.
 *
 * `subscribers[id]` era um Set sem teto nenhum. Quem tivesse um token de tela
 * válido — o próprio dono da conta, um script dele, uma TV com defeito que
 * reabre sem fechar — podia empilhar conexões até o servidor ficar sem socket.
 * Não precisa de má intenção: um player em laço de reconexão faz isso sozinho
 * em minutos, e derruba o SSE de TODAS as contas junto.
 *
 * Três tetos, porque são três acidentes diferentes:
 *
 *   por tela   uma TV que reabre sem fechar a anterior
 *   por conta  um script do cliente abrindo em cima de todas as telas dele
 *   do servidor  a soma, que é o que de fato acaba
 */
const POR_TELA = 4;          // reconexão sobrepõe a anterior; 4 dá folga
const POR_CONTA_MIN = 20;
const POR_CONTA_POR_TELA = 4;
const DO_SERVIDOR = 2000;

const conexoes = { total: 0, porTela: new Map(), porConta: new Map() };

function tetoDaConta(telas) {
  return Math.max(POR_CONTA_MIN, (Number(telas) || 0) * POR_CONTA_POR_TELA);
}

/*
 * Pede uma vaga de conexão. Devolve o motivo da recusa, e não só `false`:
 * "a TV atingiu o limite de conexões" e "o servidor está cheio" pedem coisas
 * diferentes de quem lê o log.
 */
function abrirConexao(deviceId, tenantId, telasDaConta) {
  if (conexoes.total >= DO_SERVIDOR) {
    log.aviso('conexao.servidor-cheio', { total: conexoes.total });
    return { ok: false, motivo: 'servidor' };
  }
  const naTela = conexoes.porTela.get(deviceId) || 0;
  if (naTela >= POR_TELA) return { ok: false, motivo: 'tela', abertas: naTela };

  const naConta = conexoes.porConta.get(tenantId) || 0;
  const teto = tetoDaConta(telasDaConta);
  if (naConta >= teto) {
    log.aviso('conexao.conta-no-teto', { tenant: tenantId, abertas: naConta, teto });
    return { ok: false, motivo: 'conta', abertas: naConta, teto };
  }

  conexoes.total++;
  conexoes.porTela.set(deviceId, naTela + 1);
  conexoes.porConta.set(tenantId, naConta + 1);
  return { ok: true };
}

/*
 * Devolve a vaga. Chamada no `close` do socket, que o Node dispara também
 * quando o cliente some sem avisar — é o único lugar em que dá para confiar.
 *
 * O contador nunca desce abaixo de zero: um `close` disparado duas vezes
 * (acontece) faria o teto virar negativo e deixar de existir.
 */
function fecharConexao(deviceId, tenantId) {
  conexoes.total = Math.max(0, conexoes.total - 1);
  const t = (conexoes.porTela.get(deviceId) || 0) - 1;
  if (t > 0) conexoes.porTela.set(deviceId, t); else conexoes.porTela.delete(deviceId);
  const c = (conexoes.porConta.get(tenantId) || 0) - 1;
  if (c > 0) conexoes.porConta.set(tenantId, c); else conexoes.porConta.delete(tenantId);
}

/* ---------------- O que a supervisão lê ---------------- */

/*
 * As contas que estão esbarrando em algum teto, e o estado das conexões.
 *
 * É a metade útil deste módulo: freio sem medidor é freio que ninguém sabe se
 * está pegando — e o primeiro sinal seria um cliente ligando para dizer que o
 * painel dele "dá erro".
 */
function panorama() {
  const agora = Date.now();
  const contas = [];
  for (const [tenantId, porClasse] of excessos) {
    const classes = Object.entries(porClasse)
      .map(([classe, d]) => ({ classe, vezes: d.vezes, ultimo: d.ultimo }))
      .sort((a, b) => b.ultimo - a.ultimo);
    contas.push({
      tenantId,
      classes,
      total: classes.reduce((s, c) => s + c.vezes, 0),
      ultimo: classes[0] ? classes[0].ultimo : 0,
    });
  }
  contas.sort((a, b) => b.ultimo - a.ultimo);

  return {
    excessos: contas.slice(0, 50),
    conexoes: {
      total: conexoes.total,
      teto: DO_SERVIDOR,
      telas: conexoes.porTela.size,
      contas: conexoes.porConta.size,
      // As contas com mais conexões abertas — onde um laço aparece primeiro.
      maiores: [...conexoes.porConta.entries()]
        .sort((a, b) => b[1] - a[1]).slice(0, 10)
        .map(([tenantId, n]) => ({ tenantId, abertas: n })),
    },
    tetos: CLASSES,
    em: agora,
  };
}

/* Quantas conexões esta conta tem abertas agora — para a ficha da conta. */
function conexoesDaConta(tenantId) {
  return conexoes.porConta.get(tenantId) || 0;
}
function excessosDaConta(tenantId) {
  return excessos.get(tenantId) || {};
}

function zerar() {
  baldes.clear(); excessos.clear();
  conexoes.total = 0; conexoes.porTela.clear(); conexoes.porConta.clear();
}

/*
 * Baldes vencidos saem sozinhos. Sem isto, uma conta que apareceu uma vez em
 * seis meses continuaria ocupando memória — e são duas entradas por conta.
 */
const varrer = setInterval(() => {
  const agora = Date.now();
  for (const [k, b] of baldes) if (agora > b.ate) baldes.delete(k);
  // O registro de excesso vale um dia: é o que a supervisão precisa olhar.
  for (const [t, e] of excessos) {
    const vivo = Object.values(e).some((d) => agora - d.ultimo < 24 * 60 * 60 * 1000);
    if (!vivo) excessos.delete(t);
  }
}, 5 * 60 * 1000);
if (varrer.unref) varrer.unref();

module.exports = {
  CLASSES, permitir, abrirConexao, fecharConexao, panorama,
  conexoesDaConta, excessosDaConta, tetoDaConta, zerar,
  POR_TELA, DO_SERVIDOR,
};
