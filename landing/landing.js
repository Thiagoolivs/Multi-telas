/*
 * landing/landing.js — o pouco de comportamento da landing (EXECUTOR item 14).
 *
 * Os PREÇOS vêm de /api/planos, o mesmo lugar que cobra: a página nunca
 * promete um número que o checkout não cumpre. O HTML já traz os números
 * certos de hoje (quem abre sem JavaScript vê a página inteira); aqui eles
 * só são confirmados pelo servidor.
 *
 * Sem biblioteca nenhuma: o orçamento da página inteira é 500 KB.
 */
(function () {
  'use strict';

  var reais = function (cents) {
    // Centavos só quando há: R$ 149, mas R$ 115,20 (e nunca R$ 115,2).
    var casas = Math.round(cents) % 100 ? 2 : 0;
    return 'R$ ' + (cents / 100).toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });
  };
  var todos = function (sel) { return Array.prototype.slice.call(document.querySelectorAll(sel)); };

  /* ---------- Exemplos por tipo de negócio ---------- */
  var EXEMPLOS = {
    otica: ['Vitrine da semana', 'Três modelos com preço, na cor da ótica. Troca o produto ou o preço, a TV acompanha.', 'Vitrine da semana de uma ótica, com três modelos e preços'],
    padaria: ['Prato do dia', 'A foto do prato, o preço e o horário. Amanhã é outro prato: muda uma linha e publica.', 'Prato do dia de uma padaria, com foto e preço'],
    salao: ['Promoção do dia da semana', 'Coloração com desconto toda terça, nas cores do salão — com o convite para agendar.', 'Promoção de coloração de um salão de beleza'],
    clinica: ['Pacote em parcelas', 'Check-up anual com o parcelamento em destaque e o que está incluído.', 'Pacote de exames de uma clínica, em parcelas'],
    lanchonete: ['Lançamento', 'Novidade no cardápio com selo de "novidade" e a data de estreia.', 'Lançamento de hambúrguer de uma lanchonete'],
    empresa: ['Comunicado interno', 'Recado do RH para toda a equipe, na TV do refeitório.', 'Comunicado interno de uma empresa sobre vacinação'],
  };
  function mostrarExemplo(ramo) {
    var e = EXEMPLOS[ramo];
    if (!e) return;
    var img = document.getElementById('exemplo-img');
    img.src = 'vendor/galeria/' + ramo + '.webp';
    img.alt = e[2];
    document.getElementById('exemplo-titulo').textContent = e[0];
    document.getElementById('exemplo-texto').textContent = e[1];
    todos('.aba').forEach(function (b) { b.setAttribute('aria-selected', b.getAttribute('data-ramo') === ramo ? 'true' : 'false'); });
  }
  todos('.aba').forEach(function (b) {
    b.addEventListener('click', function () { mostrarExemplo(b.getAttribute('data-ramo')); });
  });

  /* ---------- A TV do herói troca de peça ---------- */
  // As outras peças só são baixadas depois que a página carregou: a primeira
  // pintura leva uma imagem só.
  window.addEventListener('load', function () {
    var trocas = todos('#tv-heroi .troca');
    if (!trocas.length || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    trocas.forEach(function (img) { img.src = img.getAttribute('data-src'); });
    var i = -1;
    setInterval(function () {
      trocas.forEach(function (img) { img.classList.remove('no-ar'); });
      i = (i + 1) % (trocas.length + 1);
      if (i < trocas.length) trocas[i].classList.add('no-ar');
    }, 4500);
  });

  /* ---------- Aparecer ao rolar (sem biblioteca) ---------- */
  if ('IntersectionObserver' in window) {
    document.documentElement.classList.add('js');
    var obs = new IntersectionObserver(function (es) {
      es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('visto'); obs.unobserve(e.target); } });
    }, { rootMargin: '0px 0px -8% 0px' });
    todos('.surge').forEach(function (el) { obs.observe(el); });
  } else {
    todos('.surge').forEach(function (el) { el.classList.add('visto'); });
  }

  /* ---------- Preços, simulador e contato, do servidor ---------- */
  function preencher(dados) {
    var texto = function (sel, v) { todos(sel).forEach(function (el) { el.textContent = v; }); };
    if (dados.diasDeTeste) texto('[data-dias-teste]', dados.diasDeTeste);
    if (dados.criacoesDoTeste) texto('[data-criacoes-teste]', dados.criacoesDoTeste);
    if (dados.criacoesDoPlano) {
      texto('[data-criacoes-plano]', dados.criacoesDoPlano.ate3Telas);
      texto('[data-criacoes-max]', dados.criacoesDoPlano.maximo);
    }
    var pro = (dados.planos || []).filter(function (p) { return p.id === 'pro'; })[0];
    if (pro && pro.precoTelaCents) texto('[data-preco-mensal]', reais(pro.precoTelaCents));
    var faixas = dados.faixasAnual || [];
    if (faixas.length) {
      texto('[data-preco-anual]', reais(faixas[0].precoTelaCents));
      var ul = document.getElementById('faixas-anual');
      if (ul) {
        ul.textContent = '';
        faixas.forEach(function (f) {
          var li = document.createElement('li');
          li.textContent = '✓ ' + (f.negociado ? f.de + ' telas ou mais: a combinar'
            : (f.de === 1 ? 'até ' + f.ate + ' telas' : 'da ' + f.de + 'ª à ' + f.ate + 'ª') + ': ' + reais(f.precoTelaCents) + ' cada');
          ul.appendChild(li);
        });
      }
    }
    simulador(dados.simulacao || []);
    contato(dados.contato || {});
  }

  function simulador(linhas) {
    var range = document.getElementById('calc-range');
    var saida = document.getElementById('calc-saida');
    var conta = document.getElementById('calc-telas');
    if (!range || !saida || !linhas.length) return;
    range.max = String(Math.min(30, linhas.length));
    var NOMES = { mensal: 'Mensal, sem contrato', anual: 'Anual, contrato de 12 meses' };
    function atualizar() {
      var n = Number(range.value);
      conta.textContent = n;
      var linha = linhas[n - 1];
      if (!linha) return;
      saida.textContent = '';
      ['mensal', 'anual'].forEach(function (c) {
        var v = linha[c];
        if (!v) return;
        var caixa = document.createElement('div');
        caixa.className = 'rounded-xl border border-mt-linha bg-white p-5';
        var nome = document.createElement('p');
        nome.className = 'text-xs font-semibold uppercase tracking-widest text-mt-cinza';
        nome.textContent = NOMES[c];
        var valor = document.createElement('p');
        valor.className = 'titulo mt-2 text-3xl font-bold';
        var nota = document.createElement('p');
        nota.className = 'mt-1 text-sm text-mt-cinza';
        if (v.negociado) {
          valor.textContent = 'A combinar';
          nota.textContent = 'com ' + n + ' telas, o preço por tela é conversado';
        } else {
          valor.textContent = reais(v.totalCents) + ' por mês';
          var economia = linha.mensal && c === 'anual' ? linha.mensal.totalCents - v.totalCents : 0;
          nota.textContent = reais(v.porTelaCents) + ' por tela' + (economia > 0 ? ' · economia de ' + reais(economia) + ' por mês' : '');
        }
        caixa.appendChild(nome); caixa.appendChild(valor); caixa.appendChild(nota);
        saida.appendChild(caixa);
      });
    }
    range.addEventListener('input', atualizar);
    atualizar();
  }

  /*
   * WhatsApp em destaque — quando há número (WHATSAPP_NUMERO no servidor).
   * Sem ele, o botão grande vira e-mail de suporte, se houver; o flutuante
   * some. Nunca um link quebrado na frente de quem quer falar com a gente.
   */
  function contato(c) {
    var grande = document.getElementById('whats-grande');
    var flutuante = document.getElementById('whats-flutuante');
    var email = document.getElementById('contato-email');
    if (c.whatsapp) {
      var link = 'https://wa.me/' + c.whatsapp + '?text=' + encodeURIComponent('Olá! Vi o site do MultiTelas e quero saber mais.');
      // No topo, o WhatsApp entra no lugar de "Ver preços" (a landing clara, 22/10).
      var heroi = document.getElementById('whats-heroi');
      var precos = document.getElementById('heroi-precos');
      if (heroi && precos) precos.classList.add('hidden');
      [grande, flutuante, heroi].forEach(function (a) {
        if (!a) return;
        a.href = link; a.target = '_blank'; a.rel = 'noopener';
        a.classList.remove('hidden');
        a.classList.add(a === flutuante ? 'grid' : 'inline-flex');
      });
    } else if (c.email && email) {
      email.href = 'mailto:' + c.email;
      email.classList.remove('hidden');
    }
  }

  fetch('/api/planos', { headers: { Accept: 'application/json' } })
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (d) { if (d) preencher(d); })
    .catch(function () { /* sem servidor, a página segue com os números do HTML */ });
})();
