/*
 * js/mural.js — a página que abre ao ler o QR do mural.
 *
 * Vive num arquivo, e não dentro do HTML, por dois motivos:
 *
 * 1. A CSP do servidor é `script-src 'self'`, sem `unsafe-inline`. Inline, o
 *    navegador simplesmente não executava nada — a página abria bonita e o
 *    botão de enviar não fazia absolutamente coisa alguma. É o mesmo defeito
 *    que a landing teve, e ele é especialmente cruel aqui: ninguém descobre
 *    num teste local (onde a CSP costuma não incomodar), e sim na
 *    confraternização, com trinta pessoas tentando mandar foto.
 *
 * 2. O código do mural vem num `data-` do HTML, então este arquivo é o mesmo
 *    para todo mundo e o navegador o guarda em cache.
 */
(function () {
  'use strict';

  var raiz = document.getElementById('dados');
  if (!raiz) return;
  var CODIGO = raiz.getAttribute('data-codigo') || '';
  var MAX_MB = Number(raiz.getAttribute('data-max-mb')) || 12;

  var PRONTO = '<div class="card"><div class="ok"><div class="big">🎉</div>'
    + '<h2>Enviada!</h2><p class="sub">Olhe para a tela — ela aparece em instantes.</p>'
    + '<a class="mais" href="">Enviar outra</a></div></div>';

  var input = document.getElementById('f');
  var prev = document.getElementById('preview');
  var alvo = document.getElementById('alvo');
  var btn = document.getElementById('enviar');
  var err = document.getElementById('erro');
  var arquivo = null;

  /*
   * A foto é REDUZIDA antes de subir.
   *
   * Antes ia o arquivo original: um celular atual produz de 4 a 12 MB por
   * foto, e o envio acontece no 4G lotado de um evento. A tela mostra a
   * imagem em 1920px no máximo, então mandar 4000px de largura é gastar
   * minutos de espera para jogar pixel fora do outro lado.
   *
   * 1600px de lado maior a 82% de qualidade costuma cortar o arquivo em
   * cerca de dez vezes, sem diferença visível a três metros de uma TV. Se
   * qualquer coisa falhar no caminho (formato exótico, canvas bloqueado),
   * cai para o arquivo original — é melhor um envio lento que um envio que
   * não acontece.
   */
  var LADO_MAX = 1600;

  function reduzir(file) {
    return new Promise(function (resolve) {
      if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return resolve(file);
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () {
        URL.revokeObjectURL(url);
        var escala = Math.min(1, LADO_MAX / Math.max(img.width, img.height));
        if (escala === 1 && file.size < 1024 * 1024) return resolve(file);
        var cv = document.createElement('canvas');
        cv.width = Math.round(img.width * escala);
        cv.height = Math.round(img.height * escala);
        try {
          cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
          cv.toBlob(function (blob) {
            // Só troca se de fato ficou menor — foto já pequena pode inchar.
            resolve(blob && blob.size < file.size ? blob : file);
          }, 'image/jpeg', 0.82);
        } catch (e) { resolve(file); }
      };
      img.onerror = function () { URL.revokeObjectURL(url); resolve(file); };
      img.src = url;
    });
  }

  input.addEventListener('change', function () {
    arquivo = input.files && input.files[0];
    if (!arquivo) return;
    if (arquivo.size > MAX_MB * 1024 * 1024) {
      err.textContent = 'Essa foto tem mais de ' + MAX_MB + ' MB. Tente outra.';
      err.style.display = 'block'; arquivo = null; return;
    }
    err.style.display = 'none';
    prev.src = URL.createObjectURL(arquivo);
    prev.style.display = 'block';
    alvo.style.display = 'none';
    btn.disabled = false;
  });

  btn.addEventListener('click', function () {
    if (!arquivo) { input.click(); return; }
    btn.disabled = true;
    var antes = btn.textContent;
    btn.textContent = 'Preparando…';

    reduzir(arquivo).then(function (envio) {
      var autor = document.getElementById('autor').value.slice(0, 40);
      var msg = document.getElementById('msg').value.slice(0, 120);
      var qs = '?autor=' + encodeURIComponent(autor) + '&mensagem=' + encodeURIComponent(msg)
        + '&mime=' + encodeURIComponent(envio.type || arquivo.type || '');
      var xhr = new XMLHttpRequest();
      xhr.open('POST', '/api/mural/' + CODIGO + '/foto' + qs);
      xhr.upload.onprogress = function (e) {
        if (e.lengthComputable) btn.textContent = 'Enviando… ' + Math.round((e.loaded / e.total) * 100) + '%';
      };
      xhr.onload = function () {
        if (xhr.status >= 200 && xhr.status < 300) { document.body.innerHTML = PRONTO; return; }
        var m = 'Não deu para enviar. Tente de novo.';
        try { m = JSON.parse(xhr.responseText).error || m; } catch (e) {}
        err.textContent = m; err.style.display = 'block';
        btn.disabled = false; btn.textContent = antes;
      };
      xhr.onerror = function () {
        err.textContent = 'Sem conexão. Tente de novo.';
        err.style.display = 'block'; btn.disabled = false; btn.textContent = antes;
      };
      xhr.send(envio);
    });
  });
})();
