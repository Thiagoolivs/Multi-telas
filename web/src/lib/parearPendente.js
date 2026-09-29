/*
 * O código da TV sobrevive ao cadastro.
 *
 * Quem lê o QR sem ter conta cria a conta e confirma pelo link do e-mail — e
 * esse link abre o painel SEM o ?parear. O código se perdia justo no
 * primeiro uso, com a TV esperando na parede. Fica guardado por 30 minutos
 * (o código da TV também não dura muito mais que isso) e é usado uma vez.
 */
const CHAVE_PAREAR = 'mt.parearPendente';
export function guardarParear(codigo) {
  try { localStorage.setItem(CHAVE_PAREAR, JSON.stringify({ codigo, em: Date.now() })); } catch (e) {}
}
export function parearGuardado() {
  try {
    const g = JSON.parse(localStorage.getItem(CHAVE_PAREAR) || 'null');
    if (g && g.codigo && Date.now() - g.em < 30 * 60 * 1000) return g.codigo;
  } catch (e) {}
  return '';
}
export function esquecerParear() {
  try { localStorage.removeItem(CHAVE_PAREAR); } catch (e) {}
}
// Chegou pelo QR: guarda já, antes de qualquer tela (inclusive a de login).
if (typeof window !== 'undefined') {
  const q = new URLSearchParams(window.location.search);
  const c = (q.get('parear') || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
  if (c) guardarParear(c);
}
