/*
 * Google tag (GA4): fila do gtag, consentimento e config.
 *
 * Arquivo, e não bloco dentro da página, porque a CSP é `script-src 'self'`:
 * script embutido não roda. O servidor só inclui este arquivo em produção, na
 * landing e no painel, e nunca no domínio da TV (server.js, comGoogleTag).
 *
 * O ID vem do próprio <script data-id>, que o servidor escreve a partir de
 * GA_MEASUREMENT_ID — um lugar só para trocar.
 *
 * Consentimento (Consent Mode): medir é o padrão; quem já clicou "Recusar"
 * no aviso (landing/analytics.js) começa recusado, antes de qualquer envio.
 */
(function () {
  var eu = document.currentScript;
  var id = eu && eu.getAttribute('data-id');
  if (!id) return;

  window.dataLayer = window.dataLayer || [];
  window.gtag = function () { window.dataLayer.push(arguments); };

  var escolha = null;
  try { escolha = window.localStorage.getItem('mt_cookies'); } catch (e) { /* sem storage: vale o padrão */ }
  var recusou = escolha === 'recusado';

  window.gtag('consent', 'default', {
    analytics_storage: recusou ? 'denied' : 'granted',
    ad_storage: recusou ? 'denied' : 'granted',
    ad_user_data: recusou ? 'denied' : 'granted',
    ad_personalization: 'denied',
  });
  window.gtag('js', new Date());
  window.gtag('config', id);
})();
