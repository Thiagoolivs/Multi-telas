'use strict';
/*
 * O ciclo do conector e o laço que o repete.
 *
 * Um ciclo: relê o conector.json, fala com o servidor (GET /api/v1/conector,
 * que é ao mesmo tempo o aperto de mão e o "estou vivo"), e passa por cada
 * fonte que o servidor listou: pastas, planilhas, feeds. O servidor diz QUAIS
 * fontes existem (e o endereço dos feeds); o conector.json diz ONDE cada uma
 * fica nesta rede. O conector nunca escolhe TV.
 *
 * A leitura periódica é a fonte da verdade. O fs.watch só adianta o próximo
 * ciclo quando algo muda numa pasta local — em pasta de rede (UNC) ele falha
 * calado com frequência, e por isso nunca é a única forma de perceber mudança.
 */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { carregarConfig, chaveValida } = require('./config');
const { salvarEstado, fonte, registrarErro } = require('./estado');
const { criarApi, TokenRevogado, SemConexao, ErroDoServidor } = require('./rede');
const { sincronizarPasta } = require('./pastas');
const { sincronizarPlanilha } = require('./planilhas');
const { sincronizarFeed } = require('./feeds');
const { criarConversor } = require('./conversor');

const INTERVALO_PADRAO = 60;

class ConfigFaltando extends Error { constructor(arquivo) { super('não achei ' + arquivo); this.name = 'ConfigFaltando'; this.arquivo = arquivo; } }
class ConfigInvalida extends Error { constructor(problemas) { super(problemas.join('; ')); this.name = 'ConfigInvalida'; this.problemas = problemas; } }

const MENSAGEM_401 = 'O servidor do MultiTelas recusou o token (401): ele foi revogado no painel ou está errado. '
  + 'O conector PAROU de sincronizar e não vai tentar de novo com este token. Para voltar: gere um token novo no painel '
  + '(menu do avatar › Integrações › Token novo) e rode "MultiTelasConector.exe configurar" (ou troque "token" no conector.json; o conector percebe sozinho).';

const impressao = (token) => crypto.createHash('sha256').update(String(token)).digest('hex').slice(0, 16);

function intervaloDe(plano) {
  const n = Number(plano && plano.intervaloSegundos);
  // Nem martelar o servidor nem sumir por horas, mesmo que venha número estranho.
  return Number.isFinite(n) && n > 0 ? Math.min(3600, Math.max(15, Math.round(n))) : INTERVALO_PADRAO;
}

function listaDe(v) { return Array.isArray(v) ? v.filter((x) => x && typeof x === 'object' && typeof x.chave === 'string') : []; }

function eFatal(e) { return e instanceof TokenRevogado || e instanceof SemConexao; }

/*
 * Um ciclo completo. Lança TokenRevogado, SemConexao, ConfigFaltando e
 * ConfigInvalida (o laço decide o que fazer); erro de UMA fonte fica nela.
 */
async function ciclo(ctx) {
  const { log, estado } = ctx;
  const agora = ctx.agora ? ctx.agora() : Date.now();
  const lido = carregarConfig(ctx.base, ctx.env || process.env);
  if (!lido.existe && !lido.cfg.token) throw new ConfigFaltando(lido.caminhos.config);
  if (lido.problemas.length) throw new ConfigInvalida(lido.problemas);
  const cfg = lido.cfg;
  log.segredo(cfg.token);
  for (const hs of Object.values(cfg.intranet.cabecalhos)) for (const v of Object.values(hs)) log.segredo(v);
  if (ctx.rede) ctx.rede.aplicar(cfg, ctx.env || process.env);
  ctx.cfg = cfg;
  ctx.origemToken = lido.origemToken;

  // Token já recusado: não insiste. Volta sozinho quando o token do arquivo mudar.
  if (ctx.tokenRecusado && ctx.tokenRecusado === impressao(cfg.token)) return { parado: true, intervalo: INTERVALO_PADRAO };

  const api = criarApi(Object.assign({
    servidor: cfg.servidor, token: cfg.token, versao: ctx.versao, maquina: ctx.maquina || os.hostname(),
    log, fetch: ctx.fetch, esperar: ctx.esperar,
  }, ctx.opcoesApi || {}));

  let plano;
  try {
    plano = await api.handshake();
  } catch (e) {
    if (e instanceof TokenRevogado) ctx.tokenRecusado = impressao(cfg.token);
    throw e;
  }
  if (ctx.tokenRecusado) log.info('Token novo aceito: o conector voltou a sincronizar.');
  ctx.tokenRecusado = null;
  const intervalo = intervaloDe(plano);
  estado.parado = null;
  estado.servidor = {
    endereco: cfg.servidor,
    ultimoContato: agora,
    conta: plano.conta && plano.conta.nome ? String(plano.conta.nome) : '',
    integracao: plano.integracao && plano.integracao.nome ? String(plano.integracao.nome) : '',
    intervaloSegundos: intervalo,
    ultimoErro: '',
  };

  if (!ctx.memoria) ctx.memoria = {};
  const sub = {
    api, estado, log, cfg, simular: ctx.simular, agora: ctx.agora, versao: ctx.versao,
    fetchIntranet: ctx.fetchIntranet || ctx.fetch, enviadasNesteProcesso: ctx.enviadasNesteProcesso,
    conversor: ctx.conversor || criarConversor(), pastaConvertidos: path.join(ctx.base, 'convertidos'), memoria: ctx.memoria,
  };
  const resultados = { pastas: {}, planilhas: {}, feeds: {} };
  const fila = [];
  const ativas = new Set();

  async function cada(tipo, item, caminhoLocal, fazer) {
    const id = tipo + ':' + item.chave;
    ativas.add(id);
    const nome = item.nome || item.chave;
    if (!chaveValida(item.chave)) { log.umaVez('chave|' + id, 'aviso', 'O servidor mandou uma chave inválida (' + JSON.stringify(item.chave) + '); ignorada.'); return; }
    if (caminhoLocal === null) {
      const msg = 'o painel tem esta ' + tipo + ', mas o conector.json não diz onde ela fica nesta rede (rode "MultiTelasConector.exe configurar")';
      log.umaVez('sem-caminho|' + id, 'aviso', (tipo === 'pasta' ? 'Pasta' : 'Planilha') + ' "' + nome + '" (chave ' + item.chave + '): ' + msg + '.');
      fonte(estado, id, { tipo, chave: item.chave, nome, origem: '', ultimaTentativa: agora, ultimoErro: msg });
      return;
    }
    log.esquecer('sem-caminho|' + id);
    try {
      const r = await fazer();
      log.esquecer('fonte-erro|' + id);
      resultados[tipo + 's'][item.chave] = r;
      for (const x of r.fila || []) fila.push(Object.assign({ fonte: id }, x));
    } catch (e) {
      if (eFatal(e)) throw e;
      const msg = e instanceof ErroDoServidor ? e.message + ' (' + e.status + ')' : e.message;
      log.umaVez('fonte-erro|' + id + '|' + msg, 'erro', (tipo === 'feed' ? 'Feed' : tipo === 'pasta' ? 'Pasta' : 'Planilha') + ' "' + nome + '": ' + msg + '. Tento de novo a cada ciclo.');
      registrarErro(estado, id, msg, agora);
      fonte(estado, id, { ultimoErro: msg });
    }
  }

  for (const p of listaDe(plano.pastas)) {
    const raiz = Object.prototype.hasOwnProperty.call(cfg.pastas, p.chave) ? cfg.pastas[p.chave] : null;
    await cada('pasta', p, raiz, () => sincronizarPasta(sub, { chave: p.chave, nome: p.nome, raiz }));
  }
  for (const p of listaDe(plano.planilhas)) {
    const arq = Object.prototype.hasOwnProperty.call(cfg.planilhas, p.chave) ? cfg.planilhas[p.chave] : null;
    await cada('planilha', p, arq, () => sincronizarPlanilha(sub, { chave: p.chave, nome: p.nome, caminho: arq }));
  }
  for (const f of listaDe(plano.feeds)) {
    await cada('feed', f, '', () => sincronizarFeed(sub, { chave: f.chave, nome: f.nome, url: String(f.url || ''), formato: f.formato, mapa: f.mapa }));
  }

  // O contrário: está no conector.json mas o painel não tem (apagada lá, ou chave digitada errado).
  for (const tipo of ['pastas', 'planilhas']) {
    for (const chave of Object.keys(cfg[tipo])) {
      const id = tipo.slice(0, -1) + ':' + chave;
      if (!ativas.has(id)) log.umaVez('sobrando|' + id, 'aviso', 'A ' + tipo.slice(0, -1) + ' "' + chave + '" do conector.json não existe no painel desta integração; fica parada até alguém criar no painel.');
    }
  }
  // O status só mostra as fontes de agora.
  for (const id of Object.keys(estado.fontes)) if (!ativas.has(id)) delete estado.fontes[id];

  estado.fila = fila.slice(0, 200);
  estado.ultimoCiclo = { em: agora, duracaoMs: (ctx.agora ? ctx.agora() : Date.now()) - agora };
  return { plano, resultados, intervalo, fila };
}

/* ---------------- uma instância só ---------------- */

/*
 * conector.lock: impede dois conectores na mesma pasta (a tarefa do Windows
 * e alguém que clicou no .exe). O dono "toca" o arquivo a cada 30 s; trava
 * velha (processo morto, ou o PC reiniciou e o número do processo voltou a
 * existir em outro programa) não segura ninguém.
 */
const TOQUE_MS = 30 * 1000;
const VELHA_MS = 3 * 60 * 1000;

function vivo(pid) {
  try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; }
}

function lerTrava(arquivo) {
  try {
    const st = fs.statSync(arquivo);
    const d = JSON.parse(fs.readFileSync(arquivo, 'utf8'));
    const ativa = d && d.pid && d.pid !== process.pid && vivo(d.pid) && Date.now() - st.mtimeMs < VELHA_MS;
    return { pid: d && d.pid, desde: d && d.desde, ativa: !!ativa, tocadaEm: st.mtimeMs };
  } catch (e) { return null; }
}

function travar(arquivo) {
  const t = lerTrava(arquivo);
  if (t && t.ativa) return { ok: false, pid: t.pid, desde: t.desde };
  const dados = JSON.stringify({ pid: process.pid, desde: Date.now() });
  fs.writeFileSync(arquivo, dados);
  const toque = setInterval(() => {
    const agora = new Date();
    try { fs.utimesSync(arquivo, agora, agora); } catch (e) { try { fs.writeFileSync(arquivo, dados); } catch (e2) { /* pasta sem escrita */ } }
  }, TOQUE_MS);
  toque.unref();
  return {
    ok: true,
    soltar() {
      clearInterval(toque);
      try { const d = JSON.parse(fs.readFileSync(arquivo, 'utf8')); if (d.pid === process.pid) fs.rmSync(arquivo, { force: true }); } catch (e) { /* já foi */ }
    },
  };
}

/* ---------------- o laço ---------------- */

function criarSono() {
  let acordarAgora = null;
  return {
    dormir(ms) {
      return new Promise((resolve) => {
        const t = setTimeout(() => { acordarAgora = null; resolve(); }, ms);
        acordarAgora = () => { clearTimeout(t); acordarAgora = null; resolve(); };
      });
    },
    acordar() { if (acordarAgora) acordarAgora(); },
  };
}

// fs.watch nas pastas: só adianta o ciclo. Falhou (comum em UNC)? Fica só a leitura periódica.
function criarVigias(log, sono) {
  const vigias = new Map();
  let adiar = null;
  return {
    atualizar(cfg) {
      const querer = cfg && cfg.vigiarPastas ? new Set(Object.values(cfg.pastas)) : new Set();
      for (const [p, w] of vigias) if (!querer.has(p)) { try { w.close(); } catch (e) { /* já fechado */ } vigias.delete(p); }
      for (const p of querer) {
        if (vigias.has(p)) continue;
        try {
          const w = fs.watch(p, { recursive: true, persistent: false }, () => {
            // Espera o arquivo assentar antes de acordar: senão acorda para achar tudo "ainda copiando".
            clearTimeout(adiar);
            adiar = setTimeout(() => sono.acordar(), (cfg.segundosParaEstabilizar + 2) * 1000);
            adiar.unref();
          });
          w.on('error', () => { try { w.close(); } catch (e) { /* idem */ } vigias.delete(p); });
          vigias.set(p, w);
        } catch (e) { /* sem vigia nesta pasta: a leitura periódica cobre */ }
      }
    },
    fechar() { for (const w of vigias.values()) { try { w.close(); } catch (e) { /* idem */ } } vigias.clear(); clearTimeout(adiar); },
  };
}

/*
 * Roda para sempre (é o que a tarefa do Windows chama). Nunca sai por erro de
 * rede, de pasta ou de configuração: registra, espera e tenta de novo. Sair
 * faria o Windows reiniciar o conector em laço, e o log viraria só isso.
 */
async function rodar(ctx) {
  const { log, estado } = ctx;
  const sono = ctx.sono || criarSono();
  const vigias = ctx.semVigias ? null : criarVigias(log, sono);
  ctx.enviadasNesteProcesso = ctx.enviadasNesteProcesso || new Set();
  estado.conector = {
    versao: ctx.versao,
    iniciadoEm: Date.now(),
    pid: process.pid,
    maquina: ctx.maquina || os.hostname(),
    // "Qual conta está rodando?" é a primeira pergunta quando a pasta de rede não abre.
    conta: contaAtual(),
  };
  log.info('MultiTelas Conector ' + ctx.versao + ' ligado em ' + estado.conector.maquina + ' (conta ' + estado.conector.conta + ', pasta ' + ctx.base + ').');
  let semConexaoDesde = 0;
  let ciclos = 0;
  while (!ctx.parar) {
    let espera = INTERVALO_PADRAO;
    try {
      const r = await ciclo(ctx);
      espera = r.intervalo;
      if (r.parado) {
        estado.parado = estado.parado || { motivo: 'token-revogado', em: Date.now(), mensagem: MENSAGEM_401 };
      } else {
        log.esquecer('config');
        if (semConexaoDesde) { log.info('A conexão com o servidor voltou.'); semConexaoDesde = 0; log.esquecer('sem-conexao'); }
        if (vigias) vigias.atualizar(ctx.cfg);
      }
    } catch (e) {
      if (e instanceof ConfigFaltando) {
        log.umaVez('config|faltando', 'erro', 'Não achei a configuração (' + e.arquivo + '). Rode "MultiTelasConector.exe configurar" nesta pasta. Confiro de novo a cada minuto.');
      } else if (e instanceof ConfigInvalida) {
        log.umaVez('config|' + e.message, 'erro', 'O conector.json tem problema: ' + e.message + '. Confiro de novo a cada minuto.');
      } else if (e instanceof TokenRevogado) {
        estado.parado = { motivo: 'token-revogado', em: Date.now(), mensagem: MENSAGEM_401 };
        registrarErro(estado, 'servidor', 'token recusado (401)');
        log.erro(MENSAGEM_401);
      } else if (e instanceof SemConexao) {
        if (!semConexaoDesde) semConexaoDesde = Date.now();
        log.umaVez('sem-conexao|' + e.message, 'erro', 'Sem conexão com o servidor do MultiTelas: ' + e.message + '. Nada foi apagado; tento de novo a cada ciclo.');
        registrarErro(estado, 'servidor', e.message);
        estado.servidor = Object.assign({}, estado.servidor, { ultimoErro: e.message });
      } else if (e instanceof ErroDoServidor) {
        log.umaVez('servidor|' + e.status + '|' + e.message, 'erro', 'O servidor do MultiTelas respondeu ' + e.status + ': ' + e.message + '. Tento de novo no próximo ciclo.');
        registrarErro(estado, 'servidor', e.message + ' (' + e.status + ')');
        estado.servidor = Object.assign({}, estado.servidor, { ultimoErro: e.message });
      } else {
        // Defeito do próprio conector: vai com a pilha, para quem for corrigir.
        log.erro('Erro inesperado no conector: ' + (e && e.stack ? e.stack.split('\n').slice(0, 4).join(' | ') : e));
        registrarErro(estado, 'conector', String(e && e.message));
      }
    }
    salvarEstado(ctx.caminhos.estado, estado);
    ciclos++;
    if (ctx.maxCiclos && ciclos >= ctx.maxCiclos) break;
    if (ctx.parar) break;
    await sono.dormir(espera * 1000);
  }
  if (vigias) vigias.fechar();
}

function contaAtual() {
  try {
    const u = os.userInfo().username;
    const dominio = process.env.USERDOMAIN;
    return dominio && process.platform === 'win32' ? dominio + '\\' + u : u;
  } catch (e) { return '?'; }
}

module.exports = { ciclo, rodar, travar, lerTrava, criarSono, intervaloDe, ConfigFaltando, ConfigInvalida, MENSAGEM_401, contaAtual };
