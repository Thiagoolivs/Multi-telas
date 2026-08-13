/*
 * js/boot.js — o que a página do player faz por si, antes de o player entrar.
 *
 * Isto morava dentro de player.html, como script embutido. Saiu de lá para que
 * a política de segurança do servidor (CSP) possa recusar QUALQUER script
 * embutido: script embutido é justamente o veículo de um ataque de injeção, e
 * enquanto existisse um só, a regra teria de abrir a porta para todos.
 */
// Offline-first: cacheia shell e mídia para a tela não apagar sem rede.
if ('serviceWorker' in navigator) {
  /*
   * Uma TV de recepção fica meses sem ninguém recarregar. Sem isto, uma
   * correção só chega quando alguém vai até lá com o controle — e o
   * service worker, que existe para a tela não apagar, vira o motivo de
   * ela continuar com o problema antigo.
   *
   * O ouvinte é registrado SEMPRE. Uma versão anterior só o registrava se
   * já houvesse um controlador, para não recarregar à toa na primeira
   * visita — e com isso não servia justamente a TV que ele existe para
   * servir: na primeira visita não há controlador, o ouvinte não entrava,
   * e o deploy chegava sem ninguém recarregar a página. Foi assim no teste
   * de deploy: cache novo no lugar, tela ainda com o código velho.
   *
   * O que se ignora é só a PRIMEIRA troca, que é o registro inicial
   * assumindo a página. Da segunda em diante é deploy, e aí recarrega.
   */
  var controlador = navigator.serviceWorker.controller;
  var recarregando = false;
  navigator.serviceWorker.addEventListener('controllerchange', function () {
    if (!controlador) { controlador = navigator.serviceWorker.controller; return; }
    if (recarregando) return;
    recarregando = true;
    location.reload();
  });
  navigator.serviceWorker.register('/sw.js').then(function (reg) {
    /*
     * E alguém precisa IR BUSCAR a atualização. O navegador só confere o
     * sw.js quando a página navega, e uma TV de recepção não navega: ela
     * abre uma vez e fica meses. Sem esta conferida periódica, a correção
     * fica no servidor esperando um F5 que ninguém vai dar.
     *
     * De meia em meia hora: é uma requisição condicional, o servidor
     * responde 304 quase sempre.
     */
    setInterval(function () { reg.update().catch(function () {}); }, 30 * 60 * 1000);
  }).catch(function () {});
}
// Tela cheia no primeiro toque/clique/tecla — navegadores só permitem
// fullscreen a partir de um gesto do usuário. Em TV/kiosk, tira a barra
// do navegador e o player ocupa a tela toda.
(function () {
  function goFullscreen() {
    var el = document.documentElement;
    var req = el.requestFullscreen || el.webkitRequestFullscreen || el.msRequestFullscreen;
    if (req && !(document.fullscreenElement || document.webkitFullscreenElement)) {
      try { req.call(el); } catch (e) {}
    }
    window.removeEventListener('pointerdown', goFullscreen);
    window.removeEventListener('keydown', goFullscreen);
  }
  window.addEventListener('pointerdown', goFullscreen);
  window.addEventListener('keydown', goFullscreen);
})();
