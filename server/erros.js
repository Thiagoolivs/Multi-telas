/*
 * server/erros.js — os erros de produção num lugar onde alguém olha.
 *
 * POR QUE NÃO É O SENTRY
 *
 * Sentry é a resposta óbvia e continua sendo uma boa ideia mais adiante. Ela
 * não serve para HOJE por dois motivos: é uma dependência pesada num servidor
 * que não tem framework nem dependência pesada, e é mais uma conta, mais um
 * segredo e mais uma fatura para configurar antes de vender a primeira tela.
 *
 * O que resolve 90% do problema custa isto aqui: agrupar os erros por
 * assinatura, contar, guardar os últimos, e mostrar no painel de quem opera.
 * A diferença que importa não é entre "coletor caseiro" e "Sentry" — é entre
 * "alguém vê os erros" e "ninguém vê", que é onde o sistema estava.
 *
 * AGRUPAR É O TRUQUE. Sem agrupamento, um erro que acontece a cada requisição
 * enche a lista e esconde os outros nove. A assinatura é tipo + mensagem
 * normalizada + a primeira linha da pilha que é código NOSSO — porque a
 * primeira linha da pilha costuma ser de dentro do Node e é igual para
 * defeitos completamente diferentes.
 *
 * MEMÓRIA, NÃO BANCO, e isto é uma escolha e não um esquecimento. Erro é
 * sintoma, não dado do cliente: some no deploy e não faz falta, porque o que
 * importa é o que está quebrando AGORA. Gravar no banco custaria uma escrita
 * por erro justamente no momento em que o sistema já está com problema — e um
 * erro DENTRO do banco viraria um laço de erro gravando erro.
 */

const { log, pilha } = require('./log.js');

const MAX_GRUPOS = 50;      // além disto, o mais antigo sai
const MAX_EXEMPLOS = 3;     // ocorrências guardadas por grupo
const grupos = new Map();   // assinatura → { ... }

/*
 * Números na mensagem viram '#'. Sem isso, "conta 8f2a não existe" e "conta
 * b71c não existe" são dois grupos, e mil contas viram mil grupos do mesmo
 * defeito — o mesmo entulho que agrupar veio evitar.
 */
function normalizar(msg) {
  return String(msg || 'erro sem mensagem')
    .replace(/\b[0-9a-f]{8,}\b/gi, '#')
    .replace(/\b\d+\b/g, '#')
    .slice(0, 200);
}

/*
 * A primeira linha da pilha que aponta para código nosso.
 *
 * Um TypeError levantado dentro de `JSON.parse` e outro dentro do driver do
 * Postgres têm a mesma primeira linha e são defeitos sem nada em comum. O que
 * distingue é onde NOSSO código estava.
 */
function origem(err) {
  const linhas = String((err && err.stack) || '').split('\n');
  for (const l of linhas) {
    /*
     * Qualquer quadro `node:` fica de fora, não só `node:internal`. Um
     * ENOENT abre a pilha com `node:fs`, que não é interno e também não é
     * nosso — e apontar a origem para lá agrupa por módulo do Node em vez de
     * agrupar por onde o defeito mora.
     */
    if (/\bnode:/.test(l) || l.includes('node_modules')) continue;
    const m = /\(?([^()\s]+\.(?:js|mjs|cjs)):(\d+):\d+\)?/.exec(l);
    if (m) return m[1].split(/[/\\]/).slice(-2).join('/') + ':' + m[2];
  }
  return 'origem desconhecida';
}

function assinatura(err) {
  const tipo = (err && err.constructor && err.constructor.name) || 'Error';
  return tipo + '|' + normalizar(err && err.message) + '|' + origem(err);
}

/*
 * Registra um erro. `contexto` é o que permite reproduzir: rota, método, conta,
 * tela. Nunca corpo de requisição — ali moram senha, token e dado do cliente.
 */
function registrar(err, contexto) {
  const e = err instanceof Error ? err : new Error(String(err));
  const chave = assinatura(e);
  const agora = Date.now();
  let g = grupos.get(chave);

  if (!g) {
    g = {
      id: chave,
      tipo: (e.constructor && e.constructor.name) || 'Error',
      mensagem: String(e.message || '').slice(0, 300),
      origem: origem(e),
      pilha: pilha(e),
      vezes: 0,
      primeira: agora,
      ultima: agora,
      exemplos: [],
    };
    /*
     * Grupo novo é a única coisa que vale um alerta: a partir da segunda vez
     * o alerta não informa nada e, num defeito que dispara por requisição,
     * viraria uma inundação — no canal e na fatura de quem recebe.
     */
    grupos.set(chave, g);
    if (grupos.size > MAX_GRUPOS) grupos.delete(grupos.keys().next().value);
    avisar(g, contexto);
  }

  g.vezes++;
  g.ultima = agora;
  if (g.exemplos.length < MAX_EXEMPLOS) g.exemplos.push({ em: agora, ...(contexto || {}) });

  log.erro('erro.capturado', e, { ...contexto, vezes: g.vezes });
  return g;
}

/* ---------------- Alerta para fora ---------------- */

/*
 * Um POST com JSON para onde o dono quiser: Slack, Discord, Teams e Zapier
 * aceitam webhook de entrada, e todos entendem `text`. É de propósito que não
 * seja o formato de nenhum serviço específico — o dia em que trocar o destino
 * não deve exigir mexer no servidor.
 *
 * `ALERTA_WEBHOOK_URL` vazia (o padrão) simplesmente não alerta. Uma
 * instalação nova não deve tentar falar com a internet sem alguém ter pedido.
 */
const JANELA_ALERTA_MS = 5 * 60 * 1000;
const MAX_ALERTAS_JANELA = 5;
let alertasNaJanela = [];

async function avisar(grupo, contexto) {
  const url = process.env.ALERTA_WEBHOOK_URL;
  if (!url) return;

  /*
   * Teto por janela, além do "só na primeira vez". Um deploy quebrado produz
   * dezenas de assinaturas DIFERENTES em segundos, e cada uma passaria pela
   * regra da primeira vez. Quem recebe cinquenta mensagens em um minuto
   * silencia o canal — e aí o alerta seguinte, o que importava, não chega.
   */
  const agora = Date.now();
  alertasNaJanela = alertasNaJanela.filter((t) => agora - t < JANELA_ALERTA_MS);
  if (alertasNaJanela.length >= MAX_ALERTAS_JANELA) return;
  alertasNaJanela.push(agora);

  const texto = `🔴 MultiTelas: ${grupo.tipo} — ${grupo.mensagem}\n`
    + `em ${grupo.origem}`
    + (contexto && contexto.rota ? `\nrota: ${contexto.metodo || ''} ${contexto.rota}` : '');

  try {
    const ac = new AbortController();
    const corta = setTimeout(() => ac.abort(), 5000);
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: texto, erro: grupo, contexto: contexto || {} }),
      signal: ac.signal,
    }).finally(() => clearTimeout(corta));
  } catch (e) {
    /*
     * Falha de alerta NUNCA sobe. O alerta é sobre o sistema estar com
     * problema; se ele mesmo derrubar a requisição, o remédio virou a doença.
     */
    log.aviso('alerta.falhou', { motivo: e.message });
  }
}

/* ---------------- Leitura ---------------- */

/* Os grupos, do que quebrou mais recentemente para o mais antigo. */
function listar(limite) {
  return [...grupos.values()]
    .sort((a, b) => b.ultima - a.ultima)
    .slice(0, limite || MAX_GRUPOS);
}

function resumo() {
  const lista = [...grupos.values()];
  const ultimaHora = Date.now() - 60 * 60 * 1000;
  return {
    grupos: lista.length,
    total: lista.reduce((s, g) => s + g.vezes, 0),
    naUltimaHora: lista.filter((g) => g.ultima >= ultimaHora).reduce((s, g) => s + g.vezes, 0),
  };
}

function limpar() { grupos.clear(); alertasNaJanela = []; }

/* ---------------- Rede de segurança do processo ---------------- */

/*
 * Sem estes dois, uma promessa rejeitada sem `catch` derruba o processo no
 * Node 22. O Railway reinicia e a TV volta em segundos — mas o motivo morre
 * junto com o processo, e o que ninguém vê ninguém conserta. O ganho aqui é
 * registrar ANTES de morrer.
 *
 * `uncaughtException` não continua rodando: um processo que já passou por um
 * erro não tratado está com estado imprevisível, e servir requisição a partir
 * dele é pior do que reiniciar. Registra, dá 200 ms para o log sair, e sai
 * com código 1 para o Railway subir um processo limpo.
 */
function instalarRedeDeSeguranca(sair) {
  process.on('unhandledRejection', (motivo) => {
    registrar(motivo, { onde: 'promessa sem catch' });
  });
  process.on('uncaughtException', (err) => {
    registrar(err, { onde: 'exceção não tratada' });
    setTimeout(() => (sair || process.exit)(1), 200).unref();
  });
}

module.exports = { registrar, listar, resumo, limpar, instalarRedeDeSeguranca, assinatura, origem, normalizar };
