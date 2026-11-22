/*
 * server/conector-release.js — o instalador do Conector MultiTelas
 * (docs/INTEGRACOES.md), servido pelo nosso servidor, como o APK da TV
 * (server/apk.js).
 *
 * O zip (o .exe com o Node embutido, os dois .ps1 e o LEIA-ME) tem ~38 MB e
 * não mora no git: o .github/workflows/conector.yml monta e, na main,
 * publica num Release (tag `conector-v<versão>`) com um `versao.json`
 * ({ versao, tamanho, sha256 }) e o `.sha256` ao lado. Aqui o servidor busca
 * o mais novo, confere o tamanho, o sha256 e o "PK" do zip, guarda em memória
 * e serve em GET /conector/MultiTelasConector.zip.
 *
 * EM MEMÓRIA, e não em fluxo do GitHub: 38 MB numa instância de 1 GB é
 * pouco (o APK já faz igual), e assim o download não depende do GitHub estar
 * no ar naquele segundo nem gasta a cota da API dele a cada clique.
 *
 * A busca passa por server/site.js (IP público conferido em cada salto),
 * com o GITHUB_TOKEN quando houver, e é guardada por 30 min. Sem Release,
 * nada a servir (a rota responde 404 com uma página que explica).
 *
 * MT_CONECTOR_REPO=desligado tira a busca do ar (os testes não saem para a
 * rede). MT_CONECTOR_GITHUB_TESTE ("http://127.0.0.1:6168") troca a API do
 * GitHub por um servidor local de teste: desligado por padrão e ignorado em
 * produção, como o PLANILHA_HOST_TESTE.
 */
'use strict';

const crypto = require('crypto');
const net = require('net');

const NOME_ZIP = 'MultiTelasConector.zip';
const NOME_VERSAO = 'versao.json';
const VALIDADE_MS = 30 * 60 * 1000;
const ESPERA_FALHA_MS = 5 * 60 * 1000;
const LIMITE_ZIP = 80 * 1024 * 1024;
const LIMITE_JSON = 64 * 1024;
const TAG = /^conector-v\d+\.\d+\.\d+$/;

let rede = require('./site');
let estado = { pub: null, em: 0 };
let buscando = null;
let falhouEm = 0;

function emProducao() { return !!(process.env.RAILWAY_ENVIRONMENT || process.env.NODE_ENV === 'production'); }
function repo() {
  const r = String(process.env.MT_CONECTOR_REPO || 'Thiagoolivs/Multi-telas').trim();
  return /^[\w.-]+\/[\w.-]+$/.test(r) ? r : '';
}
// O "GitHub" do teste local: um host:porta só, fora de produção.
function baseDeTeste() {
  if (emProducao()) return '';
  const b = String(process.env.MT_CONECTOR_GITHUB_TESTE || '').trim().replace(/\/+$/, '');
  return /^http:\/\/127\.0\.0\.1:\d{2,5}$/.test(b) ? b : '';
}
function politica() {
  const teste = baseDeTeste();
  if (!teste) return undefined; // produção: a checagem de IP público de sempre (site.conferir)
  const host = new URL(teste).host;
  return async (alvo) => {
    let u;
    try { u = new URL(alvo); } catch (e) { return { erro: 'endereço inválido' }; }
    if (u.host !== host) return { erro: 'fora do servidor de teste' };
    return { url: u, ip: net.isIP(u.hostname) ? u.hostname : '127.0.0.1' };
  };
}

// O versao.json do Release, conferido.
function lerVersao(j) {
  if (!j || typeof j !== 'object') return null;
  const versao = String(j.versao || '');
  const tamanho = Number(j.tamanho);
  const sha = String(j.sha256 || '').toLowerCase();
  if (!/^\d+\.\d+\.\d+$/.test(versao)) return null;
  if (!Number.isInteger(tamanho) || tamanho < 1024 || tamanho > LIMITE_ZIP) return null;
  if (!/^[0-9a-f]{64}$/.test(sha)) return null;
  return { versao, tamanho, sha256: sha };
}

// O Release mais novo com o zip e o versao.json (rascunho e pré-lançamento ficam de fora).
function escolher(releases) {
  for (const r of Array.isArray(releases) ? releases : []) {
    if (!r || r.draft || r.prerelease || !TAG.test(String(r.tag_name || ''))) continue;
    const assets = Array.isArray(r.assets) ? r.assets : [];
    const zip = assets.find((a) => a && a.name === NOME_ZIP);
    const versao = assets.find((a) => a && a.name === NOME_VERSAO);
    if (zip && versao && zip.browser_download_url && versao.browser_download_url) {
      return { tag: r.tag_name, zip: zip.browser_download_url, versao: versao.browser_download_url };
    }
  }
  return null;
}

async function buscarAgora() {
  const R = repo();
  if (!R) return null;
  const cab = { 'x-github-api-version': '2022-11-28' };
  if (process.env.GITHUB_TOKEN) cab.authorization = 'Bearer ' + process.env.GITHUB_TOKEN;
  const api = baseDeTeste() || 'https://api.github.com';
  const pol = politica();
  const lista = await rede.buscarJson(api + '/repos/' + R + '/releases?per_page=30', cab, pol);
  if (lista.erro) throw new Error('o GitHub não respondeu os releases');
  const rel = escolher(lista.json);
  if (!rel) return null;
  const j = await rede.buscar(rel.versao, pol, /./, 'application/json,application/octet-stream,*/*', null, LIMITE_JSON);
  if (j.erro || j.cortado) throw new Error('o versao.json do release não veio');
  let versao = null;
  try { versao = lerVersao(JSON.parse(j.bytes.toString('utf8'))); } catch (e) { versao = null; }
  if (!versao) throw new Error('o versao.json do release é inválido');
  const antes = estado.pub;
  if (antes && antes.versao.sha256 === versao.sha256) return antes;
  const z = await rede.buscar(rel.zip, pol, /./, 'application/zip,application/octet-stream,*/*', null, LIMITE_ZIP);
  if (z.erro || z.cortado || !z.bytes) throw new Error('o zip do release não veio inteiro');
  const sha = crypto.createHash('sha256').update(z.bytes).digest('hex');
  // Zip (PK), do tamanho e com o sha256 anunciados: senão, ninguém baixa nada.
  if (z.bytes.length !== versao.tamanho || sha !== versao.sha256 || z.bytes[0] !== 0x50 || z.bytes[1] !== 0x4b) {
    throw new Error('o zip do release não bate com o versao.json');
  }
  return { versao, bytes: z.bytes };
}

// A versão publicada (com os bytes). Busca se venceu; uma falha espera 5 min para tentar de novo.
async function obter(agora) {
  const t = agora || Date.now();
  if (estado.em && t - estado.em < VALIDADE_MS) return estado.pub;
  if (!buscando) {
    if (falhouEm && t - falhouEm < ESPERA_FALHA_MS) return estado.pub;
    buscando = buscarAgora()
      .then((r) => { falhouEm = 0; estado = { pub: r, em: Date.now() }; return r; })
      .catch(() => { falhouEm = Date.now(); return estado.pub; })
      .finally(() => { buscando = null; });
  }
  return buscando;
}

// Só o que já se sabe, sem esperar a rede (o painel mostra a versão; não pode travar no GitHub).
function conhecida() {
  if (!estado.em || Date.now() - estado.em >= VALIDADE_MS) obter().catch(() => {});
  return estado.pub ? estado.pub.versao : null;
}

/*
 * A página do "não deu" (sem login, sem papel, sem Release): quem clicou no
 * link do painel é uma pessoa, e um JSON de erro não diz o que fazer.
 */
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function pagina(titulo, texto) {
  return '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
    + '<meta name="robots" content="noindex"><title>' + esc(titulo) + '</title><style>'
    + 'body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#f7f8fa;color:#14161b;font:16px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif}'
    + '.c{max-width:30rem;margin:1rem;padding:1.5rem 1.75rem;background:#fff;border:1px solid #e3e5ea;border-radius:12px}'
    + 'h1{font-size:1.15rem;margin:0 0 .5rem}p{margin:0 0 1rem;color:#454a55}a{color:#5b3df5;font-weight:600}'
    + '</style></head><body><div class="c"><h1>' + esc(titulo) + '</h1><p>' + esc(texto) + '</p>'
    + '<a href="/app/?ir=integracoes">Abrir Integrações no painel</a></div></body></html>';
}

function _trocarRede(r) { rede = r; }
function _limpar() { estado = { pub: null, em: 0 }; buscando = null; falhouEm = 0; }

module.exports = { obter, conhecida, lerVersao, escolher, pagina, NOME_ZIP, NOME_VERSAO, TAG, _trocarRede, _limpar };
