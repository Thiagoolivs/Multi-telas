/*
 * js/peca-render.js — desenha uma peça em HTML (docs/PLANO.md §4.6).
 *
 * O MESMO desenhista no player, na bancada e, depois, no editor e na
 * miniatura. É a promessa "o que o dono vê no celular é o que sai na
 * parede": se cada lugar montasse a peça do seu jeito, um dia eles
 * discordariam — e quem descobre é o cliente, olhando a TV.
 *
 * SHADOW DOM, NÃO IFRAME. A peça mora dentro de uma sombra: o CSS dela não
 * vaza para o player e o do player não entra nela; as fontes do documento
 * continuam valendo; e não custa um documento inteiro por peça, como um
 * iframe custaria num box de 2 GB.
 *
 * A porta (js/peca-html.js) roda de novo aqui, ANTES de desenhar. O servidor
 * já conferiu ao salvar, mas a TV não confia em quem mandou: config
 * adulterada no caminho, versão velha do servidor, bug — se algo passou lá,
 * para aqui.
 *
 * O que este arquivo acrescenta à peça, e só ele:
 *   - os tokens da marca (js/tokens.js) como variáveis no palco;
 *   - o conteúdo dos campos (texto e foto), escrito como TEXTO, nunca HTML;
 *   - os campos vivos (relógio, data, clima, mensagens);
 *   - a entrada animada que a peça declarou em `data-entrada`.
 *
 * Módulo duplo: no Node exporta as partes puras (o CSS), para teste; no
 * navegador, `MTPecaRender.montar(host, item, opts)`.
 */
(function (raiz, fabrica) {
  var node = typeof module === 'object' && module.exports && typeof require === 'function';
  var api = fabrica(node ? require('./peca-html.js') : raiz.MTPecaHtml, node ? require('./tokens.js') : raiz.MTTokens);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (raiz) raiz.MTPecaRender = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (P, T) {
  'use strict';

  /*
   * A entrada anima `translate`, `scale` e `rotate` — as propriedades
   * INDIVIDUAIS —, e não `transform`.
   *
   * A peça usa `transform` para se posicionar (`translateY(-50%)` centraliza
   * um bloco). Uma animação de `transform` apagaria isso: o bloco entraria
   * e terminaria fora do lugar. O editor resolve com um div por dentro
   * (`.mt-anim`), mas aqui a peça é HTML da IA e não dá para enfiar div no
   * meio dela sem mudar o layout. As propriedades individuais se COMPÕEM com
   * `transform` em vez de substituí-lo — e continuam na GPU, como as de
   * js/animacao.js (mesmos ids, mesma regra: só movimento e opacidade).
   */
  const ENTRADAS = {
    aparecer: 'from{opacity:0}',
    subir: 'from{opacity:0;translate:0 14%}',
    descer: 'from{opacity:0;translate:0 -14%}',
    esquerda: 'from{opacity:0;translate:-22% 0}',
    direita: 'from{opacity:0;translate:22% 0}',
    crescer: 'from{opacity:0;scale:.86}',
    estourar: '0%{opacity:0;scale:.6}60%{opacity:1;scale:1.06}100%{scale:1}',
    girar: 'from{opacity:0;rotate:-12deg;scale:.9}',
  };
  const CONTINUAS = {
    flutuar: '0%,100%{translate:0 -1.2%}50%{translate:0 1.2%}',
    pulsar: '0%,100%{scale:1}50%{scale:1.035}',
    balancar: '0%,100%{rotate:-2deg}50%{rotate:2deg}',
    brilhar: '0%,100%{opacity:1}50%{opacity:.72}',
  };
  // `rolagem`: segundos por caractere das mensagens do rodapé.
  const RITMO = { duracao: 0.7, passo: 0.15, inicio: 0.15, continua: 3.6, curva: 'cubic-bezier(.2,.7,.2,1)', rolagem: 0.22 };
  // Espaço largo dos dois lados do ponto: espaço comum seria colapsado.
  const SEPARADOR = ' · ';
  const ROLAR = 'from{translate:0 0}to{translate:-50% 0}';

  function keyframes() {
    return Object.keys(ENTRADAS).map((k) => '@keyframes mt-pe-' + k + '{' + ENTRADAS[k] + '}').join('')
      + Object.keys(CONTINUAS).map((k) => '@keyframes mt-pc-' + k + '{' + CONTINUAS[k] + '}').join('')
      + '@keyframes mt-pr-rolar{' + ROLAR + '}';
  }

  /*
   * A estrutura que a peça não escolhe. O palco é o container das medidas;
   * a raiz da peça o preenche inteiro. `!important` de propósito: a peça
   * pode estilizar a própria raiz (fundo, cor), mas não tirar ela do lugar —
   * uma raiz com `position: relative` e sem altura sumiria da zona.
   */
  /*
   * Os PADRÕES (margem zero, imagem em bloco) vão em `:where()`, que não pesa
   * nada: qualquer regra da peça vence. A primeira versão usava
   * `.mt-peca :is(h1,p…)` — que pesa mais que o `h1 {…}` da peça — e zerava
   * calado todo espaçamento que a peça desenhou: o título encostava no
   * texto de baixo e parecia defeito de entrelinha. Visto na tela montada.
   *
   * Algarismos alinhados SEMPRE: a serifada do catálogo (Playfair) usa
   * algarismos antigos, e o 9 de "R$ 89" descia da linha como letra
   * minúscula. Em TV número é preço e hora — e precisa ler alinhado. Vai com
   * !important em todo elemento porque o `font:` abreviado das peças zera o
   * font-variant-numeric herdado (conferido no Chrome).
   */
  const BASE = ':host{display:block;position:relative;width:100%;height:100%;overflow:hidden}'
    + '.mt-palco{position:absolute;inset:0;overflow:hidden;container-type:size}'
    + '.mt-palco>.mt-peca{position:absolute!important;inset:0!important;margin:0!important;overflow:hidden!important;container-type:size!important}'
    + ':where(.mt-peca,.mt-peca *,.mt-peca *::before,.mt-peca *::after){box-sizing:border-box}'
    + ':where(.mt-peca) :where(h1,h2,h3,h4,p,ul,ol,figure,figcaption){margin:0}'
    + ':where(.mt-peca) :where(img){display:block}'
    + '.mt-peca,.mt-peca *{font-variant-numeric:lining-nums!important}'
    + '.mt-peca img[data-sem-foto]{visibility:hidden}'
    + '.mt-peca [data-vivo="mensagens"]{display:inline-block;white-space:nowrap}'
    + '.mt-peca[data-marca-na-tela] [data-repete="marca"]{display:none!important}';

  // As variáveis da marca, num bloco do palco.
  function cssDosTokens(tokens) {
    const v = T.variaveis(tokens);
    return '.mt-palco{' + Object.keys(v).map((k) => k + ':' + v[k]).join(';') + '}';
  }

  /*
   * O CSS inteiro da sombra: estrutura, tokens, animações e o da peça (já
   * passado pela porta). Puro, para dar para conferir sem navegador.
   */
  function cssCompleto(cssDaPeca, tokens) {
    return BASE + cssDosTokens(tokens) + keyframes() + (cssDaPeca || '');
  }

  /*
   * A foto no rascunho é uma silhueta: o cliente aprova a ESTRUTURA, e foto
   * de verdade ali faria a conversa virar sobre a foto. Desenhada por nós,
   * nas cores do rascunho — não vem da peça.
   */
  function silhueta(t) {
    const c = t.cores;
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 100" preserveAspectRatio="xMidYMid slice">'
      + '<rect width="160" height="100" fill="' + c.fundo2 + '"/>'
      + '<circle cx="80" cy="38" r="14" fill="' + c.linha + '"/>'
      + '<path d="M52 100c0-20 12-34 28-34s28 14 28 34z" fill="' + c.linha + '"/></svg>';
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  }

  const DIAS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
  const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  /*
   * Relógio de box sem internet nasce em 1970 ou 2000. Hora errada na
   * parede é pior que hora nenhuma — mesma regra do cabeçalho do player.
   */
  const confiavel = (d) => d.getFullYear() >= 2024;
  const doisDigitos = (n) => (n < 10 ? '0' : '') + n;
  function vivo(nome, agora) {
    if (nome === 'relogio') return confiavel(agora) ? doisDigitos(agora.getHours()) + ':' + doisDigitos(agora.getMinutes()) : '';
    if (nome === 'data') return confiavel(agora) ? DIAS[agora.getDay()] + ' · ' + agora.getDate() + ' ' + MESES[agora.getMonth()] : '';
    return '';
  }

  /*
   * Monta a peça dentro de `host` e devolve como parar.
   *
   * opts:
   *   marca        { cores, fonteTitulo, fonteApoio } quando o item não traz
   *   rascunho     true desenha o wireframe (tokens do rascunho, foto silhueta)
   *   leve         true sem animação (box que se mostrou lento, js/perf.js)
   *   marcaNaTela  true quando a tela já mostra a marca (há cabeçalho): some
   *                o que a peça marcou com data-repete="marca"
   *   hostsMidia   hosts aceitos para foto além de /media/ (ver peca-html.js)
   *   clima        () => Promise<string>, ex.: "27°"
   *   mensagens    frases do rodapé
   *   agora        () => Date, para a bancada e os testes
   */
  /*
   * A folha das fontes (fonts/fontes.css) é pedida aqui também. O player só
   * a carregava quando o TEMA usava fonte própria — e a peça saiu na fonte
   * do sistema, mais larga: "30% OFF" quebrou em duas linhas na primeira TV
   * em que foi desenhada (visto no player, não na bancada, que já a tinha).
   * Mesmo id do js/theme.js, para nunca pedir duas vezes.
   */
  function garantirFontes(doc) {
    if (!doc || !doc.head || doc.getElementById('mt-fontes')) return;
    const link = doc.createElement('link');
    link.id = 'mt-fontes';
    link.rel = 'stylesheet';
    link.href = '/fonts/fontes.css';
    doc.head.appendChild(link);
  }

  function montar(host, item, opts) {
    const o = opts || {};
    garantirFontes(host.ownerDocument);
    const v = P.validarItem(item, { hostsMidia: o.hostsMidia });
    const it = v.item;
    const modo = o.rascunho ? 'rascunho' : it.modo;
    const tokens = T.daMarca(it.marca || o.marca || null, modo);

    const sombra = host.shadowRoot || host.attachShadow({ mode: 'open' });
    sombra.innerHTML = '<style>' + cssCompleto(it.css, tokens) + '</style><div class="mt-palco">' + it.html + '</div>';
    const peca = sombra.querySelector('.mt-peca');
    // A tela já mostra a marca (no cabeçalho): a peça não repete.
    if (o.marcaNaTela && peca) peca.setAttribute('data-marca-na-tela', '');

    // Campos: TEXTO, sempre. O que o cliente digita nunca vira tag.
    sombra.querySelectorAll('[data-campo]').forEach((el) => {
      const valor = it.campos[el.getAttribute('data-campo')];
      if (valor != null) el.textContent = valor;
    });
    sombra.querySelectorAll('img[data-campo-img],img[data-campo-qr]').forEach((el) => {
      const qr = el.hasAttribute('data-campo-qr');
      const valor = it.campos[el.getAttribute(qr ? 'data-campo-qr' : 'data-campo-img')];
      // Foto que não carrega some, em vez do ícone de imagem quebrada na parede.
      el.onerror = () => el.setAttribute('data-sem-foto', '');
      if (o.rascunho && !qr) el.src = silhueta(tokens);
      // O QR é desenhado pelo nosso servidor a partir do texto: nada vem de fora.
      else if (valor) el.src = qr ? '/api/qr.svg?d=' + encodeURIComponent(valor) : valor;
      else el.setAttribute('data-sem-foto', '');
    });

    // Campos vivos.
    const agora = o.agora || (() => new Date());
    const vivos = Array.from(sombra.querySelectorAll('[data-vivo]'));
    const tick = () => vivos.forEach((el) => {
      const nome = el.getAttribute('data-vivo');
      if (nome === 'relogio' || nome === 'data') el.textContent = vivo(nome, agora());
    });
    tick();
    let relogio = null;
    if (vivos.some((el) => /^(relogio|data)$/.test(el.getAttribute('data-vivo')))) relogio = setInterval(tick, 20000);
    /*
     * As mensagens do rodapé ROLAM. O texto vai duas vezes seguidas e anda
     * metade do próprio comprimento: quando a primeira cópia sai, a segunda
     * está exatamente onde ela começou, e a volta não tem emenda. A
     * velocidade é por caractere, para frase longa não passar correndo.
     */
    vivos.filter((el) => el.getAttribute('data-vivo') === 'mensagens').forEach((el) => {
      const msgs = (o.mensagens || []).map((m) => String(m || '').trim()).filter(Boolean);
      if (!msgs.length) { el.textContent = ''; return; }
      const linha = msgs.join(SEPARADOR) + SEPARADOR;
      el.textContent = linha + linha;
      if (!o.leve) el.style.animation = 'mt-pr-rolar ' + Math.max(12, linha.length * RITMO.rolagem).toFixed(1) + 's linear infinite';
    });
    const clima = vivos.filter((el) => el.getAttribute('data-vivo') === 'clima');
    if (clima.length && o.clima) {
      Promise.resolve().then(o.clima).then((t) => { clima.forEach((el) => { el.textContent = t || ''; }); }, () => {});
    }

    // A entrada que a peça declarou. No modo leve, nada se mexe.
    if (!o.leve) {
      sombra.querySelectorAll('[data-entrada],[data-continua]').forEach((el) => {
        const ordem = Number(el.getAttribute('data-ordem')) || 0;
        const atraso = RITMO.inicio + ordem * RITMO.passo;
        const partes = [];
        const e = el.getAttribute('data-entrada');
        const c = el.getAttribute('data-continua');
        if (ENTRADAS[e]) partes.push('mt-pe-' + e + ' ' + RITMO.duracao + 's ' + RITMO.curva + ' ' + atraso.toFixed(2) + 's both');
        /*
         * A contínua começa DEPOIS da entrada e sem `fill` para trás: com
         * `both`, o primeiro quadro dela valeria durante a espera e
         * atropelaria a entrada, que mexe na mesma propriedade.
         */
        if (CONTINUAS[c]) partes.push('mt-pc-' + c + ' ' + RITMO.continua + 's ease-in-out ' + (atraso + (e ? RITMO.duracao : 0)).toFixed(2) + 's infinite');
        if (partes.length) el.style.animation = partes.join(',');
      });
    }

    return {
      peca,
      tokens,
      problemas: v.problemas,
      duracao: Number(item && item.duracao) || 12,
      parar() { if (relogio) clearInterval(relogio); relogio = null; },
    };
  }

  return { ENTRADAS, CONTINUAS, ROLAR, SEPARADOR, RITMO, BASE, cssCompleto, cssDosTokens, keyframes, vivo, montar };
});
