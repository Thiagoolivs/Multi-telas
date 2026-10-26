/*
 * Eventos da landing para o Google Ads/GA4, e o aviso de cookies.
 *
 * Só existe quando o servidor incluiu a Google tag (produção, fora da TV):
 * sem `gtag`, este arquivo não faz nada — nem o aviso aparece, porque sem
 * medição não há o que avisar.
 *
 *   WhatsApp                → generate_lead
 *   "Testar 14 dias grátis" → begin_checkout  (data-track="trial" no botão)
 *
 * Delegação no documento, e não um ouvinte por botão: os links do WhatsApp
 * ganham o endereço wa.me depois, em landing.js, quando a config chega.
 */
(function () {
  if (typeof window.gtag !== 'function') return;

  document.addEventListener('click', function (e) {
    var el = e.target.closest && e.target.closest('a, button');
    if (!el) return;
    var href = el.getAttribute('href') || '';
    var txt = (el.textContent || '').toLowerCase();
    if (href.indexOf('wa.me') !== -1 || href.indexOf('whatsapp') !== -1) {
      window.gtag('event', 'generate_lead', { method: 'whatsapp' });
    } else if (el.getAttribute('data-track') === 'trial' || txt.indexOf('testar 14 dias') !== -1) {
      window.gtag('event', 'begin_checkout', { method: 'trial_cta' });
    }
  });

  /* ---------- Aviso de cookies (LGPD) ---------- */
  var CHAVE = 'mt_cookies';
  var escolha = null;
  try { escolha = window.localStorage.getItem(CHAVE); } catch (e) { /* sem storage: mostra o aviso */ }
  if (escolha) return;

  function guardar(v) {
    try { window.localStorage.setItem(CHAVE, v); } catch (e) { /* a escolha vale só nesta visita */ }
  }

  function montar() {
    var caixa = document.createElement('div');
    caixa.setAttribute('role', 'region');
    caixa.setAttribute('aria-label', 'Aviso de cookies');
    caixa.style.cssText = 'position:fixed;left:12px;right:12px;bottom:12px;z-index:60;margin:0 auto;max-width:560px;'
      + 'display:flex;flex-wrap:wrap;align-items:center;gap:10px 14px;padding:12px 14px;border-radius:14px;'
      + 'background:#fffdf8;border:1px solid #f1e6d3;box-shadow:0 8px 24px rgba(31,41,55,.14);'
      + "font:15px/1.4 'Nunito Sans',system-ui,sans-serif;color:#1f2937;";

    var texto = document.createElement('p');
    texto.textContent = 'Usamos cookies para medir o desempenho do site.';
    texto.style.cssText = 'margin:0;flex:1 1 220px;';

    var botoes = document.createElement('div');
    botoes.style.cssText = 'display:flex;gap:8px;margin-left:auto;';

    function botao(rotulo, primario) {
      var b = document.createElement('button');
      b.type = 'button';
      b.textContent = rotulo;
      b.style.cssText = "cursor:pointer;border-radius:10px;padding:8px 16px;font:600 14px/1 'Poppins',system-ui,sans-serif;"
        + (primario ? 'background:#2265ff;color:#fff;border:1px solid #2265ff;' : 'background:#fff;color:#1f2937;border:1px solid #f1e6d3;');
      return b;
    }
    var recusar = botao('Recusar', false);
    var ok = botao('Ok', true);

    recusar.addEventListener('click', function () {
      window.gtag('consent', 'update', { analytics_storage: 'denied', ad_storage: 'denied', ad_user_data: 'denied' });
      guardar('recusado');
      caixa.remove();
    });
    ok.addEventListener('click', function () {
      guardar('aceito');
      caixa.remove();
    });

    botoes.appendChild(recusar);
    botoes.appendChild(ok);
    caixa.appendChild(texto);
    caixa.appendChild(botoes);
    document.body.appendChild(caixa);
  }

  if (document.body) montar();
  else document.addEventListener('DOMContentLoaded', montar);
})();
