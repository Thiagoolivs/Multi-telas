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

  /* ---------- Aviso de cookies (LGPD) ----------
   * QA de lançamento, 03/11: o aviso dizia só "medir o desempenho", sem falar
   * do Google nem da publicidade, sem link para a política, e o consentimento
   * já começava concedido. Agora: diz o que é, leva à política, nada é gravado
   * pelo Google até "Aceitar" (landing/ga-init.js começa recusado), e o link
   * "Cookies" do rodapé reabre a escolha.
   */
  var CHAVE = 'mt_cookies';
  var escolha = null;
  try { escolha = window.localStorage.getItem(CHAVE); } catch (e) { /* sem storage: mostra o aviso */ }

  // O link "Cookies" do rodapé: só aparece com a medição ligada, e reabre o aviso.
  document.addEventListener('click', function (e) {
    var el = e.target.closest && e.target.closest('[data-cookies]');
    if (!el) return;
    e.preventDefault();
    if (!document.querySelector('[data-aviso-cookies]')) montar();
  });

  function guardar(v) {
    try { window.localStorage.setItem(CHAVE, v); } catch (e) { /* a escolha vale só nesta visita */ }
  }

  function montar() {
    var caixa = document.createElement('div');
    caixa.setAttribute('data-aviso-cookies', '');
    caixa.setAttribute('role', 'region');
    caixa.setAttribute('aria-label', 'Aviso de cookies');
    caixa.style.cssText = 'position:fixed;left:12px;right:12px;bottom:12px;z-index:60;margin:0 auto;max-width:560px;'
      + 'display:flex;flex-wrap:wrap;align-items:center;gap:10px 14px;padding:12px 14px;border-radius:14px;'
      + 'background:#fffdf8;border:1px solid #f1e6d3;box-shadow:0 8px 24px rgba(31,41,55,.14);'
      + "font:15px/1.4 'Outfit',system-ui,sans-serif;color:#0E0B1F;";

    var texto = document.createElement('p');
    texto.style.cssText = 'margin:0;flex:1 1 220px;';
    texto.appendChild(document.createTextNode('Com a sua permissão, usamos cookies do Google Analytics e do Google Ads para medir as visitas e os anúncios. '));
    var saiba = document.createElement('a');
    saiba.href = '/privacidade#cookies';
    saiba.textContent = 'Saiba mais';
    saiba.style.cssText = 'color:#5B2EFF;text-decoration:underline;';
    texto.appendChild(saiba);

    var botoes = document.createElement('div');
    botoes.style.cssText = 'display:flex;gap:8px;margin-left:auto;';

    function botao(rotulo, primario) {
      var b = document.createElement('button');
      b.type = 'button';
      b.textContent = rotulo;
      b.style.cssText = "cursor:pointer;border-radius:10px;padding:8px 16px;font:600 14px/1 'Outfit',system-ui,sans-serif;"
        + (primario ? 'background:#5B2EFF;color:#fff;border:1px solid #5B2EFF;' : 'background:#fff;color:#0E0B1F;border:1px solid #f1e6d3;');
      return b;
    }
    var recusar = botao('Recusar', false);
    var ok = botao('Aceitar', true);

    recusar.addEventListener('click', function () {
      window.gtag('consent', 'update', { analytics_storage: 'denied', ad_storage: 'denied', ad_user_data: 'denied' });
      guardar('recusado');
      fechar();
    });
    ok.addEventListener('click', function () {
      window.gtag('consent', 'update', { analytics_storage: 'granted', ad_storage: 'granted', ad_user_data: 'granted' });
      guardar('aceito');
      fechar();
    });

    botoes.appendChild(recusar);
    botoes.appendChild(ok);
    caixa.appendChild(texto);
    caixa.appendChild(botoes);
    /*
     * Enquanto o aviso está aberto, o botão do WhatsApp sobe (QA de 26/10:
     * os dois disputavam o canto de baixo no celular). A classe no <html> é
     * lida pelo CSS da landing.
     */
    function fechar() {
      caixa.remove();
      document.documentElement.classList.remove('com-aviso-cookies');
    }
    document.body.appendChild(caixa);
    document.documentElement.classList.add('com-aviso-cookies');
  }

  function quandoPronto(fn) {
    if (document.body) fn();
    else document.addEventListener('DOMContentLoaded', fn);
  }
  // O link do rodapé só faz sentido com a medição ligada.
  quandoPronto(function () {
    Array.prototype.forEach.call(document.querySelectorAll('[data-cookies]'), function (a) { a.hidden = false; });
  });
  if (!escolha) quandoPronto(montar);
})();
