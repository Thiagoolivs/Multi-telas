/*
 * A casca Android se atualiza pelo nosso servidor (EXECUTOR D41).
 *
 * O app (android/) é só a moldura do WebView: o player se atualiza sozinho,
 * a moldura não — e o APK do Actions expira em 90 dias. O android.yml
 * publica o APK assinado num Release (tag `apk-v<versão>`) com um
 * `versao.json` ao lado; aqui o servidor busca o mais novo, confere o
 * sha256 e o tamanho, guarda em memória e serve:
 *
 *   GET /apk/versao.json   { versionCode, versionName, tamanho, sha256 }
 *   GET /apk/ultimo.apk    o APK (a TV baixa só de nós)
 *
 * A busca no GitHub passa por server/site.js (IP público conferido em cada
 * salto) e é guardada por 30 min: o limite da API sem token é 60 por hora.
 * Sem Release (ou sem a chave de assinatura no CI, que é quando o Release não
 * sai), as duas rotas respondem 404 e nada acontece nas TVs.
 */
const crypto = require('crypto');

const NOME_APK = 'multitelas-tv.apk';
const NOME_VERSAO = 'versao.json';
const VALIDADE_MS = 30 * 60 * 1000;
const ESPERA_FALHA_MS = 5 * 60 * 1000;
const LIMITE_APK = 40 * 1024 * 1024;
const LIMITE_JSON = 64 * 1024;
const TAG = /^apk-v\d+\.\d+\.\d+$/;

let rede = require('./site');
// pub: { versao, bytes } ou null (sem Release); em: quando se conferiu — "não há" também fica guardado.
let estado = { pub: null, em: 0 };
let buscando = null;   // uma busca por vez
let falhouEm = 0;

// MT_APK_REPO=desligado tira a atualização remota do ar (e os testes não saem para a rede).
function repo() {
  const r = String(process.env.MT_APK_REPO || 'Thiagoolivs/Multi-telas').trim();
  return /^[\w.-]+\/[\w.-]+$/.test(r) ? r : '';
}

// O versao.json do Release, conferido: nada de campo estranho chega à TV.
function lerVersao(j) {
  if (!j || typeof j !== 'object') return null;
  const codigo = Number(j.versionCode);
  const nome = String(j.versionName || '');
  const tamanho = Number(j.tamanho);
  const sha = String(j.sha256 || '').toLowerCase();
  if (!Number.isInteger(codigo) || codigo <= 0 || codigo > 2100000000) return null;
  if (!/^[\w.-]{1,40}$/.test(nome)) return null;
  if (!Number.isInteger(tamanho) || tamanho < 1024 || tamanho > LIMITE_APK) return null;
  if (!/^[0-9a-f]{64}$/.test(sha)) return null;
  return { versionCode: codigo, versionName: nome, tamanho, sha256: sha };
}

// O Release mais novo que tem os dois arquivos (rascunho e pré-lançamento ficam de fora).
function escolher(releases) {
  for (const r of Array.isArray(releases) ? releases : []) {
    if (!r || r.draft || r.prerelease || !TAG.test(String(r.tag_name || ''))) continue;
    const assets = Array.isArray(r.assets) ? r.assets : [];
    const apk = assets.find((a) => a && a.name === NOME_APK);
    const versao = assets.find((a) => a && a.name === NOME_VERSAO);
    if (apk && versao && apk.browser_download_url && versao.browser_download_url) {
      return { tag: r.tag_name, apk: apk.browser_download_url, versao: versao.browser_download_url };
    }
  }
  return null;
}

async function buscarAgora() {
  const R = repo();
  if (!R) return null;
  const cab = { 'x-github-api-version': '2022-11-28' };
  if (process.env.GITHUB_TOKEN) cab.authorization = 'Bearer ' + process.env.GITHUB_TOKEN;
  const lista = await rede.buscarJson('https://api.github.com/repos/' + R + '/releases?per_page=20', cab);
  if (lista.erro) throw new Error('o GitHub não respondeu os releases');
  const rel = escolher(lista.json);
  if (!rel) return null;
  // Os arquivos do Release vêm de github.com e redirecionam para o storage deles.
  const j = await rede.buscar(rel.versao, undefined, /./, 'application/json,application/octet-stream,*/*', null, LIMITE_JSON);
  if (j.erro || j.cortado) throw new Error('o versao.json do release não veio');
  let versao = null;
  try { versao = lerVersao(JSON.parse(j.bytes.toString('utf8'))); } catch (e) { versao = null; }
  if (!versao) throw new Error('o versao.json do release é inválido');
  // A mesma de antes: não baixa de novo.
  const antes = estado.pub;
  if (antes && antes.versao.sha256 === versao.sha256 && antes.versao.versionCode === versao.versionCode) return antes;
  const a = await rede.buscar(rel.apk, undefined, /./, 'application/vnd.android.package-archive,application/octet-stream,*/*', null, LIMITE_APK);
  if (a.erro || a.cortado || !a.bytes) throw new Error('o APK do release não veio inteiro');
  const sha = crypto.createHash('sha256').update(a.bytes).digest('hex');
  // Zip (PK), do tamanho e com o sha256 anunciados: senão, a TV não recebe nada.
  if (a.bytes.length !== versao.tamanho || sha !== versao.sha256 || a.bytes[0] !== 0x50 || a.bytes[1] !== 0x4b) {
    throw new Error('o APK do release não bate com o versao.json');
  }
  return { versao, bytes: a.bytes };
}

// A versão publicada (com os bytes). Busca se venceu; uma falha espera 5 min para tentar de novo.
async function obter(agora) {
  const t = agora || Date.now();
  if (estado.em && t - estado.em < VALIDADE_MS) return estado.pub;
  if (!buscando) {
    if (falhouEm && t - falhouEm < ESPERA_FALHA_MS) return estado.pub;
    buscando = buscarAgora()
      // Sem Release (ou desligado): sem versão. Falha de rede: fica a que já havia.
      .then((r) => { falhouEm = 0; estado = { pub: r, em: Date.now() }; return r; })
      .catch(() => { falhouEm = Date.now(); return estado.pub; })
      .finally(() => { buscando = null; });
  }
  return buscando;
}

// Só o que já se sabe, sem esperar a rede (a lista de telas do painel não pode travar no GitHub).
function conhecida() {
  if (!estado.em || Date.now() - estado.em >= VALIDADE_MS) obter().catch(() => {});
  return estado.pub ? estado.pub.versao : null;
}

/*
 * O número da versão da casca que a TV contou no pulso. As cascas novas
 * mandam `appCodigo`; as de antes do D41 só o nome, que o CI faz "1.0.<N>"
 * com o mesmo N do versionCode.
 */
function codigoDoApp(info) {
  if (!info || typeof info !== 'object') return 0;
  const c = Number(info.appCodigo);
  if (Number.isInteger(c) && c > 0) return c;
  const m = /^\d+\.\d+\.(\d+)$/.exec(String(info.app || ''));
  return m ? Number(m[1]) : 0;
}

// "Há uma versão nova" para a tela: só quando ela roda o app e está atrás.
// TV de navegador (sem a casca) nem pergunta: a lista de telas não sai para a rede à toa.
function versaoNovaPara(info) {
  const c = codigoDoApp(info);
  if (!c) return '';
  const v = conhecida();
  return v && v.versionCode > c ? v.versionName : '';
}

function _trocarRede(r) { rede = r; }
function _limpar() { estado = { pub: null, em: 0 }; buscando = null; falhouEm = 0; }

module.exports = { obter, conhecida, codigoDoApp, versaoNovaPara, lerVersao, escolher, NOME_APK, NOME_VERSAO, _trocarRede, _limpar };
