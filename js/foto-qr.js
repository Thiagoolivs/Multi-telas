/*
 * js/foto-qr.js — a página que abre ao ler o QR do pedido de fotos (EXECUTOR D31).
 *
 * Num arquivo, e não no HTML, pela CSP (`script-src 'self'`) — o mesmo
 * motivo de js/mural.js. Três passos: o e-mail recebe um código; o código
 * abre o envio; a foto (reduzida aqui, como no mural) vai para o RH conferir.
 */
(function () {
  'use strict';

  var raiz = document.getElementById('dados');
  if (!raiz) return;
  var CODIGO = raiz.getAttribute('data-codigo') || '';
  var MAX_MB = Number(raiz.getAttribute('data-max-mb')) || 12;
  var BASE = '/api/fotoqr/' + encodeURIComponent(CODIGO);
  var $ = function (id) { return document.getElementById(id); };
  var err = $('erro');
  var email = '';
  var passe = '';
  var novo = false;
  var arquivo = null;

  function erro(t) { err.textContent = t || ''; err.style.display = t ? 'block' : 'none'; }
  function passo(id) {
    ['p-email', 'p-codigo', 'p-foto'].forEach(function (p) { $(p).classList.toggle('ativo', p === id); });
    erro('');
  }
  function postar(caminho, corpo) {
    return fetch(BASE + caminho, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { if (!r.ok) throw new Error(j.error || 'Não deu certo. Tente de novo.'); return j; }); });
  }

  $('p-email').addEventListener('submit', function (e) {
    e.preventDefault();
    email = $('email').value.trim().toLowerCase();
    $('b-email').disabled = true;
    postar('/codigo', { email: email }).then(function (j) {
      $('para').textContent = email;
      // Só em desenvolvimento (sem e-mail configurado) o servidor devolve o código.
      $('dica-dev').textContent = j.codigoDev ? 'Teste local: o código é ' + j.codigoDev : '';
      passo('p-codigo');
      $('codigo').focus();
    }).catch(function (x) { erro(x.message); }).then(function () { $('b-email').disabled = false; });
  });

  $('p-codigo').addEventListener('submit', function (e) {
    e.preventDefault();
    $('b-codigo').disabled = true;
    postar('/entrar', { email: email, codigo: $('codigo').value.trim() }).then(function (j) {
      passe = j.passe;
      novo = !j.pessoa;
      $('ola').textContent = j.pessoa ? 'Olá, ' + j.pessoa.nome.split(' ')[0] + '!' : '';
      $('novo').style.display = novo ? 'block' : 'none';
      passo('p-foto');
    }).catch(function (x) { erro(x.message); }).then(function () { $('b-codigo').disabled = false; });
  });

  // A foto é reduzida antes de subir (1600 px, JPEG 82%): o motivo está em js/mural.js.
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
          cv.toBlob(function (blob) { resolve(blob && blob.size < file.size ? blob : file); }, 'image/jpeg', 0.82);
        } catch (x) { resolve(file); }
      };
      img.onerror = function () { URL.revokeObjectURL(url); resolve(file); };
      img.src = url;
    });
  }

  $('f').addEventListener('change', function () {
    arquivo = this.files && this.files[0];
    if (!arquivo) return;
    if (arquivo.size > MAX_MB * 1024 * 1024) { erro('Essa foto tem mais de ' + MAX_MB + ' MB. Tente outra.'); arquivo = null; return; }
    erro('');
    var prev = $('preview');
    prev.src = URL.createObjectURL(arquivo);
    prev.style.display = 'block';
    $('alvo').style.display = 'none';
    pronto();
  });
  // Só manda com a foto escolhida E a autorização marcada (a caixa vem desmarcada).
  function pronto() { $('enviar').disabled = !(arquivo && $('aceite').checked); }
  $('aceite').addEventListener('change', pronto);

  $('enviar').addEventListener('click', function () {
    if (!arquivo || !$('aceite').checked) return;
    var q = '?aceite=1';
    if (novo) {
      var nome = $('nome').value.trim();
      var nasc = $('nascimento').value.trim();
      if (!nome || !/\d{1,2}\s*[\/\-.]\s*\d{1,2}/.test(nasc)) { erro('Diga seu nome e o aniversário (dia/mês).'); return; }
      q += '&nome=' + encodeURIComponent(nome) + '&nascimento=' + encodeURIComponent(nasc.replace(/\s+/g, '')) + '&setor=' + encodeURIComponent($('setor').value.trim());
    }
    var btn = this;
    btn.disabled = true;
    btn.textContent = 'Enviando…';
    reduzir(arquivo).then(function (blob) {
      return fetch(BASE + '/foto' + q, { method: 'POST', headers: { 'Content-Type': blob.type || 'image/jpeg', 'X-Passe': passe }, body: blob });
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) { if (!r.ok) throw new Error(j.error || 'Não deu certo. Tente de novo.'); });
    }).then(function () {
      raiz.innerHTML = '<div class="ok"><div class="big">📸</div><h2>Recebida!</h2>'
        + '<p class="sub">O RH confere e ela entra nas TVs. Obrigado!</p></div>';
    }).catch(function (x) {
      erro(x.message);
      btn.disabled = false;
      btn.textContent = 'Mandar para o RH';
    });
  });
})();
