/*
 * server/passes.js — passes curtos para o SSE.
 *
 * O problema: o token da TV vinha na URL (`/events?dt=<token>`), e o token da
 * TV NÃO EXPIRA. Endereço vai parar em todo lugar onde ninguém pensa que há
 * segredo: log de acesso do servidor, log do proxy, painel do provedor de
 * nuvem, histórico de quem abriu o console. Quem lê qualquer um desses lê a
 * config da tela e recebe os eventos dela para sempre.
 *
 * Estava na URL por um motivo real: `EventSource` é a única API do navegador
 * que não deixa mandar cabeçalho. Não dá para simplesmente mover o token para
 * um header e pronto.
 *
 * A saída é trocar o que é eterno por algo que não é. A TV apresenta o token
 * de verdade num POST comum (com cabeçalho, fora da URL) e recebe um PASSE:
 * vale um minuto, serve uma vez, e só para aquela tela. O passe é o que vai na
 * URL do SSE. Um log vazado passa a conter um segredo que já morreu.
 *
 * Memória e não banco de propósito: o passe vive um minuto. Guardá-lo em disco
 * seria escrever para apagar em seguida, e num servidor que reinicia o pior que
 * acontece é a TV pedir outro — coisa que ela já sabe fazer.
 */
const crypto = require('crypto');

const VIDA_MS = 60 * 1000;
const TETO = 5000;            // teto de passes vivos, para a memória não crescer sem limite

const passes = new Map();     // passe -> { deviceId, expira }

function agora() { return Date.now(); }

/* Tira os vencidos. Roda na emissão: não precisa de relógio próprio para uma
 * estrutura que só cresce quando alguém pede um passe. */
function varrer() {
  const t = agora();
  for (const [k, v] of passes) if (v.expira <= t) passes.delete(k);
}

function emitir(deviceId) {
  varrer();
  /*
   * Teto duro. Sem ele, alguém com um token válido poderia pedir passes em
   * laço e encher a memória do servidor — a autenticação impede o estranho,
   * não impede o excesso.
   */
  if (passes.size >= TETO) return null;
  const passe = crypto.randomBytes(24).toString('base64url');
  passes.set(passe, { deviceId: String(deviceId), expira: agora() + VIDA_MS });
  return { passe, expiraEm: VIDA_MS };
}

/*
 * Gasta o passe: devolve true UMA vez, e só para a tela certa.
 *
 * Apagar antes de conferir o device é de propósito — um passe apresentado para
 * a tela errada não pode continuar valendo para a tela certa. Vale uma
 * tentativa, seja ela qual for.
 */
function gastar(passe, deviceId) {
  const p = passe && passes.get(passe);
  if (!p) return false;
  passes.delete(passe);
  if (p.expira <= agora()) return false;
  return p.deviceId === String(deviceId);
}

/* Para o teste conseguir olhar sem depender de tempo de parede. */
function _estado() { return { vivos: passes.size }; }
function _limpar() { passes.clear(); }

module.exports = { emitir, gastar, VIDA_MS, TETO, _estado, _limpar };
