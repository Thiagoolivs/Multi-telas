/*
 * server/operadores.js — quem opera a PLATAFORMA.
 *
 * Não confundir com o "admin" de uma conta. Aquele é um papel DENTRO de uma
 * empresa e enxerga só a empresa dele. Operador é quem cuida do MultiTelas
 * inteiro e enxerga números de todas as contas — quantas telas estão no ar,
 * quantas empresas pagam, o que quebrou.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * A RAIZ DA CONFIANÇA É UMA VARIÁVEL DE AMBIENTE, e isso é de propósito.
 *
 * `ADMIN_EMAILS` só pode ser mudada por quem tem acesso ao deploy. Se a lista
 * de operadores vivesse só no banco, bastaria uma injeção, um bug de rota ou
 * uma senha vazada para alguém se promover a operador e passar a ver os dados
 * de todos os clientes. Com a raiz fora do alcance do aplicativo, o pior caso
 * de um comprometimento de conta continua sendo uma conta.
 *
 * A tabela existe para o operador-raiz convidar mais gente sem precisar de um
 * deploy. Mas quem CONVIDA é só quem está na variável: um operador convidado
 * pode ver, não pode dar acesso. Sem isso, um único convite errado se
 * multiplicaria sozinho e não haveria como cortar a árvore de volta.
 */

function listaDoAmbiente() {
  return String(process.env.ADMIN_EMAILS || '')
    .split(/[,;\s]+/)
    .map((e) => e.trim().toLowerCase())
    .filter((e) => e.includes('@'));
}

/* Está na variável de ambiente — pode tudo, inclusive dar e tirar acesso. */
function ehRaiz(email) {
  const e = String(email || '').trim().toLowerCase();
  return !!e && listaDoAmbiente().includes(e);
}

/*
 * É operador: está na variável OU foi convidado por quem está.
 *
 * `db` entra por parâmetro para este módulo não decidir qual banco usar — é a
 * mesma razão de sempre: em produção roda Postgres, no teste roda SQLite.
 */
async function ehOperador(db, email) {
  const e = String(email || '').trim().toLowerCase();
  if (!e) return false;
  if (ehRaiz(e)) return true;
  const lista = await db.listarOperadores();
  return lista.some((o) => o.email === e);
}

/*
 * O que a sessão pode fazer na plataforma.
 *
 * Devolve sempre um objeto, nunca `null`: quem chama precisa poder perguntar
 * `.pode` sem antes perguntar se existe, e um `null` no meio do caminho é
 * como se esquece de checar permissão.
 */
async function permissao(db, sess) {
  if (!sess || !sess.email) return { pode: false, raiz: false };
  const raiz = ehRaiz(sess.email);
  return { pode: raiz || (await ehOperador(db, sess.email)), raiz };
}

/*
 * Se ninguém está configurado, o painel da plataforma simplesmente NÃO EXISTE.
 *
 * A alternativa tentadora — "sem ADMIN_EMAILS, o dono da primeira conta vira
 * operador" — transformaria uma instalação recém-subida numa porta aberta:
 * quem se cadastrasse primeiro veria os dados de todo mundo depois.
 */
function configurado() {
  return listaDoAmbiente().length > 0;
}

module.exports = { ehRaiz, ehOperador, permissao, configurado, listaDoAmbiente };
