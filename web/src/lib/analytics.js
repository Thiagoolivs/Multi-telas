/*
 * Conversão do Google Ads/GA4 no painel.
 *
 * A Google tag só existe em produção (o servidor a injeta no index.html; ver
 * comGoogleTag em server.js). Fora dela `window.gtag` não existe e tudo aqui
 * vira nada — sem erro, sem condição espalhada pelas telas.
 */
export function cadastroConcluido(method) {
  if (typeof window === 'undefined' || typeof window.gtag !== 'function') return;
  window.gtag('event', 'sign_up', { method });
}

/*
 * Conta nova pelo Google: o servidor volta para /app/?cadastro=google uma vez
 * só, no primeiro acesso (server/routes/auth.js). O parâmetro sai da barra na
 * hora, então recarregar a página não conta de novo.
 */
export function cadastroPeloGoogle() {
  if (typeof window === 'undefined') return;
  const u = new URL(window.location.href);
  if (u.searchParams.get('cadastro') !== 'google') return;
  u.searchParams.delete('cadastro');
  window.history.replaceState(null, '', u.pathname + u.search + u.hash);
  cadastroConcluido('google');
}
