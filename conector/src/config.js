'use strict';
/*
 * conector.json: o único arquivo que o TI edita.
 *
 * Fica AO LADO do .exe (e não em %APPDATA%) porque o conector roda como uma
 * conta de serviço: o perfil dela não é o do TI, e "onde está a
 * configuração?" precisa ter uma resposta só. O token pode vir da variável
 * MULTITELAS_TOKEN para quem não quer segredo em arquivo.
 *
 * O arquivo é relido a cada ciclo: trocar um caminho ou o token não pede
 * reiniciar a tarefa do Windows.
 */
const fs = require('node:fs');
const path = require('node:path');

const NOME_CONFIG = 'conector.json';
const NOME_ESTADO = 'estado.json';
const NOME_LOG = 'conector.log';
const NOME_TRAVA = 'conector.lock';
const VARIAVEL_TOKEN = 'MULTITELAS_TOKEN';
const SERVIDOR_PADRAO = 'https://app.multitelas.net.br';

const PADROES = {
  tamanhoMaximoMB: 200,
  segundosParaEstabilizar: 10,
  ciclosParaApagar: 2,
  vigiarPastas: true,
};

// A chave vem do painel e vira pedaço de URL e de nome de arquivo no estado:
// só letras, números, ponto, hífen e sublinhado. Começar com "_" é reservado
// ao servidor (a pasta "_feed-<chave>" das imagens dos feeds).
const CHAVE_OK = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/;

function chaveValida(chave) { return typeof chave === 'string' && CHAVE_OK.test(chave) && !chave.includes('..'); }

/*
 * A pasta do conector. No .exe é a pasta do .exe; rodando com `node` (no
 * desenvolvimento e nos testes) é a pasta atual, ou a que vier em
 * MULTITELAS_CONECTOR_DIR / --pasta.
 */
function pastaBase(argv = [], env = process.env) {
  const i = argv.findIndex((a) => a === '--pasta' || a.startsWith('--pasta='));
  if (i >= 0) {
    const v = argv[i].includes('=') ? argv[i].slice(argv[i].indexOf('=') + 1) : argv[i + 1];
    if (v) return path.resolve(v);
  }
  if (env.MULTITELAS_CONECTOR_DIR) return path.resolve(env.MULTITELAS_CONECTOR_DIR);
  if (ehExecutavel()) return path.dirname(process.execPath);
  return process.cwd();
}

function ehExecutavel() {
  try { return require('node:sea').isSea(); } catch (e) { return false; }
}

function caminhos(base) {
  return {
    base,
    config: path.join(base, NOME_CONFIG),
    estado: path.join(base, NOME_ESTADO),
    log: path.join(base, NOME_LOG),
    trava: path.join(base, NOME_TRAVA),
  };
}

// O Bloco de Notas salva com BOM; JSON.parse não aceita. E um erro de vírgula
// precisa dizer a linha, senão o TI não acha.
function lerJson(texto, nomeArquivo) {
  const limpo = String(texto).replace(/^﻿/, '');
  try { return JSON.parse(limpo); } catch (e) {
    const m = /position (\d+)/.exec(e.message);
    let onde = '';
    if (m) {
      const pos = Number(m[1]);
      const antes = limpo.slice(0, pos);
      onde = ' (linha ' + (antes.split('\n').length) + ')';
    }
    const dica = /\\[^\\"/bfnrtu]/.test(limpo) ? ' Lembre: no JSON cada \\ do caminho do Windows vai dobrado (\\\\servidor\\\\pasta).' : '';
    throw new Error('O arquivo ' + nomeArquivo + ' não é um JSON válido' + onde + ': ' + e.message + '.' + dica);
  }
}

/*
 * Lê a configuração. Não lança por falta de arquivo: devolve `existe: false`
 * para o "rodar" esperar o TI rodar "configurar" (a tarefa do Windows fica
 * de pé em vez de reiniciar sem parar).
 */
function carregarConfig(base, env = process.env) {
  const c = caminhos(base);
  let bruto = null;
  let existe = false;
  try { bruto = fs.readFileSync(c.config, 'utf8'); existe = true; } catch (e) {
    if (e.code !== 'ENOENT') throw new Error('Não consegui ler ' + c.config + ': ' + e.message);
  }
  const dados = existe ? lerJson(bruto, c.config) : {};
  const cfg = normalizar(dados);
  const tokenDoArquivo = cfg.token;
  let origemToken = cfg.token ? 'arquivo' : '';
  const doAmbiente = String(env[VARIAVEL_TOKEN] || '').trim();
  if (doAmbiente) { cfg.token = doAmbiente; origemToken = 'variável ' + VARIAVEL_TOKEN; }
  return { cfg, existe, origemToken, tokenDoArquivo, caminhos: c, problemas: validar(cfg) };
}

function objetoDeTextos(o) {
  const out = {};
  if (o && typeof o === 'object' && !Array.isArray(o)) {
    for (const [k, v] of Object.entries(o)) if (typeof v === 'string' && v.trim()) out[k] = v.trim();
  }
  return out;
}

function numeroEntre(v, min, max, padrao) {
  const n = Number(v);
  return Number.isFinite(n) && n >= min && n <= max ? n : padrao;
}

function normalizar(d) {
  const intranet = d.intranet && typeof d.intranet === 'object' ? d.intranet : {};
  const cabecalhos = {};
  if (intranet.cabecalhos && typeof intranet.cabecalhos === 'object') {
    for (const [host, hs] of Object.entries(intranet.cabecalhos)) cabecalhos[String(host).toLowerCase()] = objetoDeTextos(hs);
  }
  return {
    servidor: String(d.servidor || SERVIDOR_PADRAO).trim().replace(/\/+$/, ''),
    token: String(d.token || '').trim(),
    pastas: objetoDeTextos(d.pastas),
    planilhas: objetoDeTextos(d.planilhas),
    intranet: {
      hostsPermitidos: Array.isArray(intranet.hostsPermitidos) ? intranet.hostsPermitidos.map((h) => String(h).trim().toLowerCase()).filter(Boolean) : [],
      cabecalhos,
      usarProxy: intranet.usarProxy === true,
    },
    proxy: String(d.proxy || '').trim(),
    semProxy: String(d.semProxy || '').trim(),
    certificadoCA: String(d.certificadoCA || '').trim(),
    tamanhoMaximoMB: numeroEntre(d.tamanhoMaximoMB, 1, 4096, PADROES.tamanhoMaximoMB),
    segundosParaEstabilizar: numeroEntre(d.segundosParaEstabilizar, 0, 3600, PADROES.segundosParaEstabilizar),
    ciclosParaApagar: Math.round(numeroEntre(d.ciclosParaApagar, 1, 100, PADROES.ciclosParaApagar)),
    vigiarPastas: d.vigiarPastas !== false,
  };
}

/*
 * O servidor só por HTTPS: o token viaja em cada requisição. HTTP fica
 * aceito apenas para a própria máquina, 127.x (os testes e quem desenvolve).
 */
function servidorValido(url) {
  let u;
  try { u = new URL(url); } catch (e) { return 'o endereço do servidor não é uma URL válida (ex.: ' + SERVIDOR_PADRAO + ')'; }
  if (u.protocol === 'https:') return '';
  if (u.protocol === 'http:' && (u.hostname === 'localhost' || u.hostname === '[::1]' || /^127\.\d+\.\d+\.\d+$/.test(u.hostname))) return '';
  return 'o endereço do servidor precisa começar com https:// (o token não pode viajar sem criptografia)';
}

function validar(cfg) {
  const p = [];
  const s = servidorValido(cfg.servidor);
  if (s) p.push(s);
  if (!cfg.token) p.push('falta o token (copie do painel do MultiTelas e rode "MultiTelasConector.exe configurar")');
  else if (/\s/.test(cfg.token)) p.push('o token tem espaço no meio: copie de novo do painel');
  for (const tipo of ['pastas', 'planilhas']) {
    for (const chave of Object.keys(cfg[tipo])) {
      if (!chaveValida(chave)) p.push('a chave "' + chave + '" em "' + tipo + '" não é válida (use a chave que o painel mostra; não pode começar com "_")');
    }
  }
  return p;
}

// Grava em arquivo temporário e troca: um desligamento no meio não deixa o
// conector.json pela metade (e o conector parado sem configuração).
function gravarAtomico(arquivo, texto) {
  const tmp = arquivo + '.' + process.pid + '.tmp';
  // 0600 fora do Windows (lá quem protege é a permissão da pasta, posta pelo instalar.ps1).
  fs.writeFileSync(tmp, texto, { mode: 0o600 });
  fs.renameSync(tmp, arquivo);
}

function salvarConfig(arquivo, cfg) {
  const out = {
    servidor: cfg.servidor,
    token: cfg.token || '',
    pastas: cfg.pastas || {},
    planilhas: cfg.planilhas || {},
    intranet: {
      hostsPermitidos: (cfg.intranet && cfg.intranet.hostsPermitidos) || [],
    },
  };
  if (cfg.intranet && cfg.intranet.cabecalhos && Object.keys(cfg.intranet.cabecalhos).length) out.intranet.cabecalhos = cfg.intranet.cabecalhos;
  if (cfg.intranet && cfg.intranet.usarProxy) out.intranet.usarProxy = true;
  if (cfg.proxy) out.proxy = cfg.proxy;
  if (cfg.semProxy) out.semProxy = cfg.semProxy;
  if (cfg.certificadoCA) out.certificadoCA = cfg.certificadoCA;
  for (const k of Object.keys(PADROES)) if (cfg[k] !== undefined && cfg[k] !== PADROES[k]) out[k] = cfg[k];
  gravarAtomico(arquivo, JSON.stringify(out, null, 2) + '\n');
}

module.exports = {
  NOME_CONFIG, VARIAVEL_TOKEN, SERVIDOR_PADRAO, PADROES,
  pastaBase, caminhos, carregarConfig, salvarConfig, normalizar, validar, servidorValido,
  chaveValida, lerJson, gravarAtomico, ehExecutavel,
};
