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
  /*
   * Zona QUASE quadrada, mas deitada (proporção de 1,02 a 1,46): a peça é
   * desenhada QUADRADA, no centro (`enquadrar`, logo abaixo), e as sobras
   * dos lados levam o fundo da marca (.mt-faixas).
   *
   * São as zonas dos layouts em pé (Vertical · Duas zonas: 1038×851;
   * Vertical em pilha: 1038×949), a TV 4:3 (1,33) e a principal do layout
   * quadrado com cabeçalho (1,40). As peças decidem o desenho
   * pela própria caixa já sem o padding, e nessa faixa a conta cai no
   * desenho DEITADO sem largura para ele: o QR empurrava o texto para fora,
   * a lista do cardápio subia por cima do título (varredura de 21/10, 69
   * combinações). Desenhada quadrada, a peça usa o desenho de 1:1, que cabe.
   *
   * 1:1 exato, 16:9, 9:16 e a lateral ficam fora da faixa e não mudam um
   * pixel — a ótica do lote 1 continua onde o dono aprovou. O <host> é um
   * container para a regra medir a ZONA onde a peça está, em qualquer lugar
   * (TV, painel, bancada).
   *
   * O mesmo para a zona LARGA DEMAIS (de 1,95 a 4): a principal do layout
   * "Cabeçalho + Principal + Rodapé" tem 2,4:1, e o título e a foto saíam
   * por cima e por baixo. Ali a peça é desenhada em 16:9, no centro. O teto
   * de 4 deixa de fora cabeçalho e rodapé, que são faixas de 6:1 para cima.
   */
  const BASE = ':host{display:block;position:relative;width:100%;height:100%;overflow:hidden;container-type:size}'
    + '.mt-palco{position:absolute;inset:0;overflow:hidden;container-type:size}'
    + '.mt-faixas{position:absolute;inset:0;background:var(--mt-fundo);visibility:hidden}'
    + '@container (min-aspect-ratio:51/50) and (max-aspect-ratio:22/15){.mt-faixas{visibility:visible}}'
    + '@container (min-aspect-ratio:39/20) and (max-aspect-ratio:4/1){.mt-faixas{visibility:visible}}'
    + '.mt-palco>.mt-peca{position:absolute!important;inset:0!important;margin:0!important;overflow:hidden!important;container-type:size!important}'
    + ':where(.mt-peca,.mt-peca *,.mt-peca *::before,.mt-peca *::after){box-sizing:border-box}'
    + ':where(.mt-peca) :where(h1,h2,h3,h4,p,ul,ol,figure,figcaption){margin:0}'
    + ':where(.mt-peca) :where(img){display:block}'
    + '.mt-peca,.mt-peca *{font-variant-numeric:lining-nums!important}'
    + '.mt-peca img[data-sem-foto]{visibility:hidden}'
    // QR sem link: some a moldura dele também, não só a imagem — sobrava um quadrado vazio na lateral (visto no teste do dono, 24/10).
    + '.mt-peca :has(> img[data-campo-qr][data-sem-foto]):not(.mt-peca){display:none!important}'
    + '.mt-peca [data-vivo="mensagens"]{display:inline-block;white-space:nowrap}'
    + '.mt-peca[data-marca-na-tela] [data-repete="marca"]{display:none!important}'
    // Rodapé numa tela que já tem relógio no cabeçalho: o segundo relógio some (D12).
    + '.mt-peca[data-sem-relogio] [data-vivo="relogio"]{display:none!important}'
    // O elemento que a pessoa escondeu no editor (D19).
    + '.mt-peca [data-oculto]{display:none!important}';

  // As variáveis da marca, num bloco do palco.
  function cssDosTokens(tokens) {
    const v = T.variaveis(tokens);
    // No host também: as faixas da zona quase quadrada (BASE) pintam com o fundo da marca.
    return ':host,.mt-palco{' + Object.keys(v).map((k) => k + ':' + v[k]).join(';') + '}';
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
   * A CONTAGEM REGRESSIVA (EXECUTOR item 22): "acaba em 2d 04:15:09". O alvo
   * é "AAAA-MM-DDTHH:MM" na hora da loja (o relógio da TV), como o resto do
   * agendamento. Passou do alvo, zera: nunca conta para o negativo. Relógio
   * da TV errado (antes de 2024) não mostra nada, como o relógio.
   */
  function contagem(alvo, agora) {
    const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(String(alvo || ''));
    if (!m || !confiavel(agora)) return '';
    const fim = new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
    let s = Math.max(0, Math.floor((fim - agora) / 1000));
    const dias = Math.floor(s / 86400); s -= dias * 86400;
    const hms = doisDigitos(Math.floor(s / 3600)) + ':' + doisDigitos(Math.floor((s % 3600) / 60)) + ':' + doisDigitos(s % 60);
    return (dias ? dias + 'd ' : '') + hms;
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
   *   logo         { url, clara, escura } da marca: preenche data-campo-img="logo"
   *   semRelogio   true no rodapé de tela com relógio no cabeçalho: some o data-vivo="relogio"
   *   clima        () => Promise<string>, ex.: "27°"
   *   mensagens    frases do rodapé (e as chamadas do cabeçalho)
   *   contagem     "AAAA-MM-DDTHH:MM", o alvo de data-vivo="contagem"
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

  /*
   * O enquadramento das duas faixas do BASE: o palco é desenhado no tamanho
   * APROVADO (1080×1080 ou 1920×1080) e escalado para a altura da zona,
   * centralizado. Em JS, e não só no CSS, porque as peças decidem "coluna
   * estreita" por largura em PIXEL (até 700 px): um quadrado de 752 px não
   * é coluna, mas a peça achava que era — e o ladrilho do layout quadrado
   * dividido (522×418) também. Desenhado em 1080 e reduzido, é o 1:1 que o
   * dono aprovou na bancada, só menor. Fora das faixas, o palco fica como
   * sempre (inset: 0, sem estilo inline).
   */
  const QUADRADA = [51 / 50, 22 / 15];
  const LARGA = [39 / 20, 4];
  function referencia(w, h) {
    if (!w || !h) return null;
    const ar = w / h;
    return ar >= QUADRADA[0] && ar <= QUADRADA[1] ? [1080, 1080]
      : ar >= LARGA[0] && ar <= LARGA[1] ? [1920, 1080] : null;
  }
  function enquadrar(host, palco) {
    const w = host.clientWidth, h = host.clientHeight;
    if (!w || !h || !palco) return;
    const ref = referencia(w, h);
    if (!ref) { palco.removeAttribute('style'); return; }
    const k = h / ref[1];
    palco.style.cssText = 'left:' + ((w - ref[0] * k) / 2).toFixed(2) + 'px;top:0;right:auto;bottom:auto;width:'
      + ref[0] + 'px;height:' + ref[1] + 'px;transform:scale(' + k.toFixed(5) + ');transform-origin:0 0';
  }

  /*
   * O lugar de logo da peça (D8). Peça sem logo própria usa a da marca; e a
   * logo da marca vai na versão que lê no fundo DA PEÇA: a branca no fundo
   * escuro, a escura no claro (D7). Logo de outra marca, gravada na peça,
   * fica como está.
   */
  function luminanciaHex(h) {
    let s = String(h || '').replace('#', '');
    // '#fff' é '#ffffff' (revisão do consultor no D8): sem expandir, virava 0x000fff e lia como escuro.
    if (/^[0-9a-f]{3,4}$/i.test(s)) s = s.slice(0, 3).split('').map((c) => c + c).join('');
    const n = parseInt(s.slice(0, 6), 16);
    if (!Number.isFinite(n)) return null;
    const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  }
  function logoDaPeca(propria, daMarca, tokens) {
    if (propria && (!daMarca || propria !== daMarca.url)) return propria;
    if (!daMarca || !daMarca.url) return propria || '';
    const l = luminanciaHex(tokens && tokens.cores && tokens.cores.fundo);
    if (l == null) return daMarca.url;
    return (l < 0.35 ? daMarca.clara : daMarca.escura) || daMarca.url;
  }

  /*
   * Esconde o elemento e o enfeite que só existe por causa dele: o traço
   * antes da chamada ("— FUNCIONAMENTO") é um <i aria-hidden> irmão do
   * texto. Sobe enquanto o pai só tem o elemento e enfeites; para no
   * primeiro pai que tem outra coisa (ou na própria peça).
   */
  function esconder(el, peca) {
    let alvo = el;
    while (alvo.parentElement && alvo.parentElement !== peca) {
      const pai = alvo.parentElement;
      const so = Array.prototype.every.call(pai.children, (c) => c === alvo || c.getAttribute('aria-hidden') === 'true');
      // O texto do pai sem o dos enfeites: a seta "→" (aria-hidden) ao lado da chamada não conta como texto.
      const proprio = Array.prototype.reduce.call(pai.childNodes, (s, c) => s
        + (c.nodeType === 3 ? c.textContent : (c.getAttribute && c.getAttribute('aria-hidden') === 'true' ? '' : c.textContent)), '');
      if (!so || proprio.trim() !== (alvo.textContent || '').trim()) break;
      alvo = pai;
    }
    alvo.setAttribute('data-oculto', '');
  }

  /* ============ Navegador sem container queries (Chromium < 105) ============
   *
   * QA de lançamento, 03/11 (usuário 19): toda peça mede tudo em cqw/cqh e
   * escolhe o desenho com @container. O navegador que não conhece isso joga
   * fora as duas coisas: a tela pronta virava texto de 16 px empilhado no
   * canto, com textos sobrepostos. É o navegador de quase toda Smart TV
   * Samsung/LG anterior a 2024 e de muito TV box.
   *
   * O caminho escolhido: REESCREVER o CSS da peça em pixel, no tamanho em
   * que ela está sendo desenhada. A peça tem um container só (o palco, do
   * mesmo tamanho da .mt-peca; nenhuma peça declara outro), então a conta é
   * exata: 10cqw num palco de 1920 px são 192 px. E o @container vira o que
   * o navegador novo faria: a condição é conferida aqui, com a largura e a
   * altura do palco; valeu, as regras ficam; não valeu, saem.
   *
   * Por que não variáveis CSS (--cqw) com calc: resolveriam as medidas, mas
   * não as condições do @container, que trocam o desenho (coluna, em pé,
   * faixa). E por que não só escalar: escalar resolve o tamanho de quem já
   * sabe medir em cqw — este navegador não sabe.
   *
   * De carona, o que também não existe antes do Chromium 79–88 e a peça usa:
   * clamp()/min()/max() (no tamanho fixo viram um número, e a conta é feita
   * aqui), `inset` (vira top/right/bottom/left) e o `:where()` da BASE.
   *
   * Só roda quando o navegador NÃO tem container query: no navegador atual
   * nada disto é chamado, e o desenho é o CSS de sempre.
   */
  const UNIDADE_CQ = /(-?(?:\d+\.?\d*|\.\d+))(cqmin|cqmax|cqw|cqh|cqi|cqb)(?![A-Za-z0-9_-])/gi;
  const arred = (n, casas) => { const k = Math.pow(10, casas); return String(Math.round(n * k) / k); };

  /* O `}` que fecha o `{` em `abre`, respeitando aspas. */
  function fechaBloco(css, abre) {
    let nivel = 0, aspa = '';
    for (let i = abre; i < css.length; i++) {
      const c = css[i];
      if (aspa) { if (c === aspa && css[i - 1] !== '\\') aspa = ''; continue; }
      if (c === '"' || c === "'") aspa = c;
      else if (c === '{') nivel++;
      else if (c === '}' && --nivel === 0) return i;
    }
    return css.length;
  }

  /* Um valor de condição: 700px, 1.25, 16/9, 40em. */
  function valorCq(s) {
    const t = String(s).trim();
    let m = /^(\d+\.?\d*|\.\d+)\s*\/\s*(\d+\.?\d*|\.\d+)$/.exec(t);
    if (m) return Number(m[1]) / Number(m[2]);
    m = /^(-?(?:\d+\.?\d*|\.\d+))(px|r?em)?$/i.exec(t);
    if (!m) return null;
    return Number(m[1]) * (m[2] && /em/i.test(m[2]) ? 16 : 1);
  }

  function medidaCq(nome, w, h) {
    if (nome === 'width' || nome === 'inline-size') return w;
    if (nome === 'height' || nome === 'block-size') return h;
    if (nome === 'aspect-ratio') return h ? w / h : 0;
    return null;
  }

  function compara(a, op, b) {
    const e = 1e-9;
    if (op === '<') return a < b - e;
    if (op === '<=') return a <= b + e;
    if (op === '>') return a > b + e;
    if (op === '>=') return a >= b - e;
    if (op === '=') return Math.abs(a - b) <= e;
    return false;
  }
  const INVERSO = { '<': '>', '<=': '>=', '>': '<', '>=': '<=', '=': '=' };

  /* Uma condição, sem os parênteses: "aspect-ratio >= 1.25", "max-width: 700px", "orientation: portrait". */
  function recursoCq(txt, w, h) {
    const t = txt.trim().toLowerCase();
    const m = /^(min-|max-)?([a-z-]+)\s*:\s*(.+)$/.exec(t);
    if (m) {
      if (!m[1] && m[2] === 'orientation') return m[3].trim() === (h >= w ? 'portrait' : 'landscape');
      const real = medidaCq(m[2], w, h);
      const v = valorCq(m[3]);
      if (real == null || v == null) return false;
      return compara(real, m[1] === 'min-' ? '>=' : m[1] === 'max-' ? '<=' : '=', v);
    }
    // Faixa: "nome >= v", "v < nome", "a < nome <= b".
    const partes = t.split(/\s*(<=|>=|<|>|=)\s*/);
    if (partes.length !== 3 && partes.length !== 5) return false;
    for (let i = 0; i + 2 < partes.length; i += 2) {
      const a = partes[i], op = partes[i + 1], b = partes[i + 2];
      const ra = medidaCq(a, w, h), rb = medidaCq(b, w, h);
      let ok = false;
      if (ra != null && rb == null) { const v = valorCq(b); ok = v != null && compara(ra, op, v); }
      else if (rb != null && ra == null) { const v = valorCq(a); ok = v != null && compara(rb, INVERSO[op], v); }
      if (!ok) return false;
    }
    return true;
  }

  /*
   * A condição inteira de um @container: nome opcional, "and", "or", "not" e
   * parênteses. O que não se entende vale como falso — o navegador novo
   * também descarta a condição que não entende.
   */
  function condicaoCq(cond, w, h) {
    let s = String(cond || '').trim();
    const nome = /^([A-Za-z_][\w-]*)\s+/.exec(s);
    if (nome && !/^(not|and|or)$/i.test(nome[1])) s = s.slice(nome[0].length);
    let i = 0;
    const espaco = () => { while (i < s.length && /\s/.test(s[i])) i++; };
    const palavra = (p) => {
      espaco();
      if (s.slice(i, i + p.length).toLowerCase() === p && !/[\w-]/.test(s[i + p.length] || '')) { i += p.length; return true; }
      return false;
    };
    function primario() {
      espaco();
      if (palavra('not')) return !primario();
      if (s[i] !== '(') { i = s.length; return false; }
      const ini = i + 1;
      let nivel = 0;
      for (; i < s.length; i++) { if (s[i] === '(') nivel++; else if (s[i] === ')' && --nivel === 0) break; }
      const dentro = s.slice(ini, i);
      i++;
      return /^\s*(\(|not\b)/i.test(dentro) ? condicaoCq(dentro, w, h) : recursoCq(dentro, w, h);
    }
    let v = primario();
    for (;;) {
      if (palavra('and')) { const b = primario(); v = v && b; }
      else if (palavra('or')) { const b = primario(); v = v || b; }
      else break;
    }
    espaco();
    return i >= s.length ? v : false;
  }

  /* Os @container: a condição é conferida aqui; valeu, as regras ficam; não valeu, saem. */
  function resolverContainers(css, w, h) {
    let saida = '';
    let i = 0;
    for (;;) {
      const k = css.indexOf('@container', i);
      if (k < 0) return saida + css.slice(i);
      const abre = css.indexOf('{', k);
      if (abre < 0) return saida + css.slice(i, k);
      const fecha = fechaBloco(css, abre);
      saida += css.slice(i, k) + (condicaoCq(css.slice(k + 10, abre), w, h) ? resolverContainers(css.slice(abre + 1, fecha), w, h) : '');
      i = fecha + 1;
    }
  }

  /*
   * Conta de pixel: "38.4px + 4px", "2 * 19.2px". Devolve { n, px }, ou null
   * quando entra algo que não é pixel nem número (%, em, var…): aí a função
   * fica como está, e só o navegador que não a entende perde aquela linha.
   */
  function contaPx(expr) {
    const toks = String(expr).match(/(\d+\.?\d*|\.\d+)(e[+-]?\d+)?([a-z%]+)?|[-+*/]|\S/gi) || [];
    let p = 0;
    function fator() {
      const t = toks[p++];
      if (t === '-') { const f = fator(); return f && { n: -f.n, px: f.px }; }
      if (t === '+') return fator();
      const m = /^(\d+\.?\d*|\.\d+)(e[+-]?\d+)?([a-z%]+)?$/i.exec(t || '');
      if (!m || (m[3] && m[3].toLowerCase() !== 'px')) return null;
      return { n: Number(m[1] + (m[2] || '')), px: !!m[3] };
    }
    function termo() {
      let a = fator();
      while (a && (toks[p] === '*' || toks[p] === '/')) {
        const op = toks[p++];
        const b = fator();
        if (!b) return null;
        if (op === '*') { if (a.px && b.px) return null; a = { n: a.n * b.n, px: a.px || b.px }; }
        else { if (b.px || !b.n) return null; a = { n: a.n / b.n, px: a.px }; }
      }
      return a;
    }
    let a = termo();
    while (a && (toks[p] === '+' || toks[p] === '-')) {
      const op = toks[p++];
      const b = termo();
      if (!b || b.px !== a.px) return null;
      a = { n: op === '+' ? a.n + b.n : a.n - b.n, px: a.px };
    }
    return a && p === toks.length ? a : null;
  }

  /* calc/min/max/clamp só com pixel viram o número. A mais interna primeiro, até não sobrar conta. */
  function resolverContas(css) {
    const FUNCAO = /(^|[^A-Za-z0-9_-])(calc|min|max|clamp)\(([^()]*)\)/gi;
    let antes;
    do {
      antes = css;
      css = css.replace(FUNCAO, (tudo, pre, nome, args) => {
        const vals = args.split(',').map(contaPx);
        if (!vals.length || vals.some((v) => !v) || vals.some((v) => v.px !== vals[0].px)) return tudo;
        const f = nome.toLowerCase();
        let n;
        if (f === 'calc') { if (vals.length !== 1) return tudo; n = vals[0].n; }
        else if (f === 'min') n = Math.min.apply(null, vals.map((v) => v.n));
        else if (f === 'max') n = Math.max.apply(null, vals.map((v) => v.n));
        else { if (vals.length !== 3) return tudo; n = Math.max(vals[0].n, Math.min(vals[1].n, vals[2].n)); }
        return pre + arred(n, 3) + (vals[0].px ? 'px' : '');
      });
    } while (css !== antes);
    return css;
  }

  /* `inset: a b c d` → top/right/bottom/left (o Chromium < 87 não conhece `inset`). */
  function expandirInset(css) {
    return css.replace(/(^|[;{\s])inset\s*:\s*([^;}]+)/gi, (tudo, pre, valor) => {
      const imp = /!\s*important\s*$/i.test(valor) ? '!important' : '';
      const v = valor.replace(/!\s*important\s*$/i, '').trim();
      const p = [];
      let nivel = 0, atual = '';
      for (let i = 0; i < v.length; i++) {
        const c = v[i];
        if (c === '(') nivel++;
        if (c === ')') nivel--;
        if (/\s/.test(c) && !nivel) { if (atual) p.push(atual); atual = ''; } else atual += c;
      }
      if (atual) p.push(atual);
      if (!p.length || p.length > 4) return tudo;
      const t = p[0], r = p[1] || t, b = p[2] || t, l = p[3] || r;
      return pre + 'top:' + t + imp + ';right:' + r + imp + ';bottom:' + b + imp + ';left:' + l + imp;
    });
  }

  /* O CSS para o navegador sem container query, no tamanho w×h do container. */
  function cssSemCq(css, w, h) {
    let s = resolverContainers(String(css || ''), w, h);
    s = s.replace(UNIDADE_CQ, (tudo, n, u) => {
      const k = u.toLowerCase();
      const base = k === 'cqw' || k === 'cqi' ? w : k === 'cqh' || k === 'cqb' ? h : k === 'cqmin' ? Math.min(w, h) : Math.max(w, h);
      return arred(Number(n) * base / 100, 3) + 'px';
    });
    s = s.replace(/(^|[;{\s])container(-type|-name)?\s*:[^;}]*;?/gi, '$1');
    return expandirInset(resolverContas(s));
  }

  /*
   * A BASE sem o que não existe antes do Chromium 88: o `:where()` vira o
   * seletor mais leve que há (a tag), escrito ANTES da peça — a regra da
   * peça para a mesma tag vem depois e vence, que é o que o `:where()`
   * garantia. E a rolagem do rodapé anda por `transform`, que todo navegador
   * conhece (a propriedade solta `translate` é do Chromium 104).
   */
  const BASE_SEM_CQ = BASE
    .replace(':where(.mt-peca,.mt-peca *,.mt-peca *::before,.mt-peca *::after){box-sizing:border-box}', '*,*::before,*::after{box-sizing:border-box}')
    .replace(':where(.mt-peca) :where(h1,h2,h3,h4,p,ul,ol,figure,figcaption){margin:0}', 'h1,h2,h3,h4,p,ul,ol,figure,figcaption{margin:0}')
    .replace(':where(.mt-peca) :where(img){display:block}', 'img{display:block}');
  const ROLAR_SEM_CQ = 'from{transform:translateX(0)}to{transform:translateX(-50%)}';

  /*
   * Tem container query? `window.MT_SEM_CQ = true` força o caminho de
   * reserva: é como o teste prova, no Chromium atual, o que a TV antiga vê.
   */
  let suporteCq = null;
  function temContainerQueries(janela) {
    const g = janela || (typeof window !== 'undefined' ? window : null);
    if (!g) return true;
    if (g.MT_SEM_CQ === true) return false;
    if (suporteCq == null) {
      try { suporteCq = !!(g.CSS && g.CSS.supports && g.CSS.supports('container-type', 'inline-size')); }
      catch (e) { suporteCq = false; }
    }
    return suporteCq;
  }

  /* O tamanho do host (as faixas medem ele) e do palco (a peça mede ele; ver enquadrar). */
  function medidasSemCq(host) {
    const w = host.clientWidth, h = host.clientHeight;
    const ref = referencia(w, h);
    return { hw: w, hh: h, pw: ref ? ref[0] : w, ph: ref ? ref[1] : h };
  }

  function cssCompletoSemCq(cssDaPeca, tokens, m) {
    return cssSemCq(BASE_SEM_CQ, m.hw, m.hh)
      + cssSemCq(cssDosTokens(tokens), m.pw, m.ph)
      + keyframes().replace('@keyframes mt-pr-rolar{' + ROLAR + '}', '@keyframes mt-pr-rolar{' + ROLAR_SEM_CQ + '}')
      + cssSemCq(cssDaPeca, m.pw, m.ph);
  }

  function montar(host, item, opts) {
    const o = opts || {};
    garantirFontes(host.ownerDocument);
    const v = P.validarItem(item, { hostsMidia: o.hostsMidia });
    const it = v.item;
    const modo = o.rascunho ? 'rascunho' : it.modo;
    const tokens = T.daMarca(it.marca || o.marca || null, modo);

    const sombra = host.shadowRoot || host.attachShadow({ mode: 'open' });
    /*
     * Sem container query (ver cssSemCq): o CSS sai em pixel, no tamanho da
     * zona. A zona pode ainda não estar na tela (o slide entra depois): até
     * ela ter tamanho, vale o 1920×1080 da TV comum, e a medida de verdade
     * reescreve assim que existir.
     */
    const semCq = !temContainerQueries();
    let medidaAtual = '';
    const cssDeAgora = () => {
      if (!semCq) return cssCompleto(it.css, tokens);
      const m = medidasSemCq(host);
      const usar = m.hw && m.hh ? m : { hw: 1920, hh: 1080, pw: 1920, ph: 1080 };
      medidaAtual = m.hw && m.hh ? m.hw + 'x' + m.hh : '';
      return cssCompletoSemCq(it.css, tokens, usar);
    };
    sombra.innerHTML = '<style>' + cssDeAgora() + '</style><div class="mt-faixas"></div><div class="mt-palco">' + it.html + '</div>';
    const peca = sombra.querySelector('.mt-peca');
    const palcoEl = sombra.querySelector('.mt-palco');
    const estilo = sombra.querySelector('style');
    // Devolve se já há medida de verdade (para a espera sem ResizeObserver parar).
    const remedir = () => {
      if (!semCq) return true;
      const w = host.clientWidth, h = host.clientHeight;
      if (!w || !h) return false;
      if (w + 'x' + h !== medidaAtual) estilo.textContent = cssDeAgora();
      return true;
    };
    enquadrar(host, palcoEl);
    // A zona muda de tamanho (layout que "respira", tela girada): enquadra de novo.
    let observador = null;
    let espera = null;
    let aoRedimensionar = null;
    if (typeof ResizeObserver !== 'undefined') {
      observador = new ResizeObserver(() => { enquadrar(host, palcoEl); remedir(); });
      observador.observe(host);
    } else if (semCq) {
      // Chromium < 64: sem ResizeObserver. Confere até a zona ter tamanho, e a cada giro da janela.
      let tentativas = 0;
      const conferir = () => { espera = null; enquadrar(host, palcoEl); if (!remedir() && ++tentativas < 40) espera = setTimeout(conferir, 250); };
      if (!remedir()) espera = setTimeout(conferir, 50);
      aoRedimensionar = () => { enquadrar(host, palcoEl); remedir(); };
      if (typeof window !== 'undefined') window.addEventListener('resize', aoRedimensionar);
    }
    // A tela já mostra a marca (no cabeçalho): a peça não repete.
    if (o.marcaNaTela && peca) peca.setAttribute('data-marca-na-tela', '');
    if (o.semRelogio && peca) peca.setAttribute('data-sem-relogio', '');

    // Campos: TEXTO, sempre. O que o cliente digita nunca vira tag.
    sombra.querySelectorAll('[data-campo]').forEach((el) => {
      const valor = it.campos[el.getAttribute('data-campo')];
      if (valor != null) el.textContent = valor;
    });
    // Os nomes já vieram conferidos pela porta (só campos que a peça declara).
    (it.ocultos || []).forEach((n) => {
      sombra.querySelectorAll('[data-campo="' + n + '"],[data-campo-qr="' + n + '"]').forEach((el) => esconder(el, peca));
    });
    sombra.querySelectorAll('img[data-campo-img],img[data-campo-qr]').forEach((el) => {
      const qr = el.hasAttribute('data-campo-qr');
      const campo = el.getAttribute(qr ? 'data-campo-qr' : 'data-campo-img');
      const valor = campo === 'logo' && !qr ? logoDaPeca(it.campos.logo, o.logo, tokens) : it.campos[campo];
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
      else if (nome === 'contagem') el.textContent = contagem(o.contagem, agora());
    });
    tick();
    let relogio = null;
    /*
     * A contagem anda de segundo em segundo; o relógio, a cada 20 s. É troca
     * de texto, não animação: vale também na TV fraca (modo leve).
     */
    const temContagem = !!o.contagem && vivos.some((el) => el.getAttribute('data-vivo') === 'contagem');
    if (temContagem || vivos.some((el) => /^(relogio|data)$/.test(el.getAttribute('data-vivo')))) relogio = setInterval(tick, temContagem ? 1000 : 20000);
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
      parar() {
        if (relogio) clearInterval(relogio); relogio = null;
        if (observador) observador.disconnect(); observador = null;
        if (espera) clearTimeout(espera); espera = null;
        if (aoRedimensionar && typeof window !== 'undefined') window.removeEventListener('resize', aoRedimensionar);
        aoRedimensionar = null;
      },
    };
  }

  return {
    ENTRADAS, CONTINUAS, ROLAR, SEPARADOR, RITMO, BASE, cssCompleto, cssDosTokens, keyframes, vivo, contagem, montar, enquadrar, QUADRADA, LARGA,
    BASE_SEM_CQ, cssSemCq, cssCompletoSemCq, condicaoCq, temContainerQueries, referencia,
  };
});
