/*
 * Google tag (GA4): fila do gtag, consentimento e config.
 *
 * Arquivo, e não bloco dentro da página, porque a CSP é `script-src 'self'`:
 * script embutido não roda. O servidor só inclui este arquivo em produção, só
 * na landing (nunca no painel nem no domínio da TV; server.js, comGoogleTag).
 *
 * O ID vem do próprio <script data-id>, que o servidor escreve a partir de
 * GA_MEASUREMENT_ID — um lugar só para trocar.
 *
 * Consentimento (Consent Mode). QA de lançamento, 03/11: começava CONCEDIDO,
 * antes de qualquer clique, e a política dizia que não havia cookie de
 * análise. Agora é RECUSADO por padrão (LGPD art. 7º I e 8º; guia de cookies
 * da ANPD): nada de cookie do Google até a pessoa clicar "Aceitar" no aviso
 * (landing/analytics.js). Quem já aceitou numa visita anterior começa aceito.
 * Personalização de anúncio (remarketing) fica sempre recusada.
 */
(function () {
  var eu = document.currentScript;
  var id = eu && eu.getAttribute('data-id');
  if (!id) return;

  window.dataLayer = window.dataLayer || [];
  window.gtag = function () { window.dataLayer.push(arguments); };

  var escolha = null;
  try { escolha = window.localStorage.getItem('mt_cookies'); } catch (e) { /* sem storage: vale o padrão (recusado) */ }
  var aceitou = escolha === 'aceito';

  window.gtag('consent', 'default', {
    analytics_storage: aceitou ? 'granted' : 'denied',
    ad_storage: aceitou ? 'granted' : 'denied',
    ad_user_data: aceitou ? 'granted' : 'denied',
    ad_personalization: 'denied',
  });
  window.gtag('js', new Date());
  window.gtag('config', id);
})();
