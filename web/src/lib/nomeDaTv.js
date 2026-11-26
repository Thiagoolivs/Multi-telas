/*
 * O NOME DA TV NA HORA DE LIGAR (reteste 4, 25/11).
 *
 * A primeira TV não pedia nome: virava "TV 1", e o RH renomeava depois em
 * "Nome e grupo". Com 8 TVs iguais, quem instala precisa dar o nome de cada
 * uma na hora (o da planilha de instalação): é por ele que o painel acha a
 * TV da Portaria no meio das outras sete. O campo já vem com o próximo
 * "TV N" (nunca fica sem nome) e com as sugestões da frente, um toque cada.
 */

const normal = (s) => String(s || '').trim().toLowerCase();

// "TV 1", "TV 2"…: o menor número que nenhuma TV da conta usa — a mesma conta do servidor (server/routes/telas.js, proximoNomeDeTv).
export function proximoNomeDeTv(tvs) {
  const usados = new Set((tvs || []).map((t) => normal(t && (t.name != null ? t.name : t.nome))));
  let n = 1;
  while (usados.has('tv ' + n)) n++;
  return 'TV ' + n;
}

/*
 * As sugestões da frente (js/perfil.js, textos.nomesDeTv: "Recepção,
 * Refeitório, Portaria"), sem as que a conta já usa: a segunda TV não
 * sugere "Recepção" de novo.
 */
export function sugestoesDeNome(nomesDeTv, tvs) {
  const usados = new Set((tvs || []).map((t) => normal(t && (t.name != null ? t.name : t.nome))));
  return String(nomesDeTv || '').split(',').map((s) => s.trim()).filter((s) => s && !usados.has(normal(s)));
}
