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
    /*
     * O MOVIMENTO DE CINEMA (lote de 09/11). As keyframes daqui são as do
     * ELEMENTO; o que precisa de medida (a máscara de cada linha, o número
     * que anda, a origem da foto) o player completa quando a peça ganha
     * tamanho na tela (coreografia, mais abaixo):
     *
     *   revelar    a RESERVA: o texto sobe inteiro. Medidas as linhas, o
     *              elemento fica parado e cada linha sobe de dentro da sua
     *              própria máscara (DO_PLAYER.linha);
     *   varrer     o bloco abre a partir de uma borda (`data-origem`);
     *   desenhar   o filete se desenha de uma ponta à outra;
     *   contar     o número aparece, e o player o faz subir do zero;
     *   aproximar  chega 6% maior e assenta.
     *
     * Sem opacidade na "varrer" e na "desenhar": um bloco cheio que abre e
     * um traço que corre já começam invisíveis (escala zero).
     */
    revelar: 'from{opacity:0;translate:0 24%}',
    varrer: 'from{scale:0 1}',
    desenhar: 'from{scale:0 1}',
    contar: 'from{opacity:0}',
    aproximar: 'from{opacity:0;scale:1.06}',
  };
  const CONTINUAS = {
    flutuar: '0%,100%{translate:0 -1.2%}50%{translate:0 1.2%}',
    pulsar: '0%,100%{scale:1}50%{scale:1.035}',
    balancar: '0%,100%{rotate:-2deg}50%{rotate:2deg}',
    brilhar: '0%,100%{opacity:1}50%{opacity:.72}',
    /*
     * A câmera lenta da foto anima `transform`, e não `scale`: ela só é
     * posta numa foto SEM transform próprio (o player confere), e precisa
     * se somar à "aproximar", que anima `scale` na mesma foto.
     */
    kenburns: 'from{transform:none}to{transform:scale(1.08)}',
    // O reflexo é uma faixa de luz que o PLAYER põe por cima do elemento (não mexe nele): ela atravessa e sai.
    reflexo: 'from{transform:translateX(-200%) skewX(-16deg)}to{transform:translateX(300%) skewX(-16deg)}',
  };
  /*
   * Keyframes que não são de nenhum nome do vocabulário: a variante em pé
   * da "varrer" e da "desenhar" e a máscara de cada linha da "revelar".
   * A linha anda um pouco mais que a PRÓPRIA altura, que é a da máscara:
   * começa inteira abaixo dela, escondida, e sobe até o lugar. Com 100%
   * cravados, a borda das duas máscaras caía no mesmo meio pixel e uma
   * fresta de letra aparecia antes da hora (visto no vídeo da citação).
   */
  const DO_PLAYER = {
    'varrer-v': 'from{scale:1 0}',
    'desenhar-v': 'from{scale:1 0}',
    linha: 'from{transform:translateY(106%)}to{transform:none}',
  };
  // `rolagem`: segundos por caractere das mensagens do rodapé.
  const RITMO = { duracao: 0.7, passo: 0.15, inicio: 0.15, continua: 3.6, curva: 'cubic-bezier(.2,.7,.2,1)', rolagem: 0.22 };
  /*
   * O tempo e a curva de cada entrada de cinema (as outras: RITMO). Mais
   * longas que as de sempre, e com desaceleração longa: é o que lê como
   * "câmera", e não como slide. A "varrer" acelera e freia (abre como uma
   * cortina); a "contar" esmaece rápido e o número anda `conta` segundos.
   */
  const TEMPO = {
    revelar: { duracao: 0.95, curva: 'cubic-bezier(.16,1,.3,1)' },
    varrer: { duracao: 0.85, curva: 'cubic-bezier(.77,0,.18,1)' },
    desenhar: { duracao: 0.9, curva: 'cubic-bezier(.65,0,.35,1)' },
    contar: { duracao: 0.45, curva: 'cubic-bezier(.2,.7,.2,1)' },
    aproximar: { duracao: 1.2, curva: 'cubic-bezier(.16,1,.3,1)' },
  };
  /*
   * linha     entre uma linha e a próxima na "revelar";
   * conta     quanto o número leva do zero ao valor;
   * reflexo   quanto a luz leva para atravessar, e a folga depois da entrada;
   * simples   o esmaecer do modo leve (TV fraca) e de quem pediu menos movimento;
   * kenburns  o mínimo de segundos da câmera lenta (ela dura a peça inteira);
   * passo     de quanto em quanto o número troca: 20 vezes por segundo. Cada
   *           troca de texto é layout, pintura e envio ao compositor na linha
   *           principal; a cada quadro, com a CPU 4× mais lenta, isso enchia
   *           os quadros da entrada. O olho não lê mais que isso num número
   *           que corre.
   */
  const CINEMA = { linha: 0.09, conta: 1.5, reflexo: 1.2, folgaReflexo: 0.2, simples: 0.6, kenburns: 6, passo: 0.05 };
  // Espaço largo dos dois lados do ponto: espaço comum seria colapsado.
  const SEPARADOR = ' · ';
  const ROLAR = 'from{translate:0 0}to{translate:-50% 0}';

  function keyframes() {
    return Object.keys(ENTRADAS).map((k) => '@keyframes mt-pe-' + k + '{' + ENTRADAS[k] + '}').join('')
      + Object.keys(CONTINUAS).map((k) => '@keyframes mt-pc-' + k + '{' + CONTINUAS[k] + '}').join('')
      + Object.keys(DO_PLAYER).map((k) => '@keyframes mt-px-' + k + '{' + DO_PLAYER[k] + '}').join('')
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
  // A data curta, para a faixa em que a longa não cabe ("SEG · 9 NOV", reteste 2; ver semCorte).
  const DIAS_CURTOS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
  /*
   * Relógio de box sem internet nasce em 1970 ou 2000. Hora errada na
   * parede é pior que hora nenhuma — mesma regra do cabeçalho do player.
   */
  const confiavel = (d) => d.getFullYear() >= 2024;
  const doisDigitos = (n) => (n < 10 ? '0' : '') + n;
  function vivo(nome, agora) {
    if (nome === 'relogio') return confiavel(agora) ? doisDigitos(agora.getHours()) + ':' + doisDigitos(agora.getMinutes()) : '';
    if (nome === 'data') return confiavel(agora) ? DIAS[agora.getDay()] + ' · ' + agora.getDate() + ' ' + MESES[agora.getMonth()] : '';
    if (nome === 'data-curta') return confiavel(agora) ? DIAS_CURTOS[agora.getDay()] + ' · ' + agora.getDate() + ' ' + MESES[agora.getMonth()] : '';
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
   *   leve         true sem animação nenhuma (a miniatura do painel, o rasterizador)
   *   movimento    'completo' (padrão) | 'simples' (TV fraca, js/perf.js: as
   *                entradas só esmaecem, nada contínuo) | 'parado' (= leve)
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
  /*
   * A RÉGUA DA TV NA PEÇA (fase 2 do plano de ação, 05/11). Numa zona grande,
   * nenhuma letra fica abaixo de 4,5% do lado menor da TV, o que se lê a 4 m
   * (docs/qa-total/REFERENCIAS.md). O piso vai em pixel DO PALCO: a peça é
   * desenhada em 1920×1080 (ou 1080×1080) e reduzida por `k`, então o piso
   * da tela vira piso/k aqui dentro. Fora da TV (bancada, painel), a zona é
   * desenhada no tamanho de uma TV de 1080 linhas. Zona pequena (lateral,
   * faixa): sem piso, que lá a peça precisa mudar de composição (fase 3).
   */
  const ZONA_GRANDE = [880, 540];
  function pisoDaZona(host, k, ref) {
    const doc = host && host.ownerDocument;
    const janela = doc && doc.defaultView;
    const naTv = !!(doc && doc.querySelector && doc.querySelector('.mt-stage'));
    const w = host.clientWidth, h = host.clientHeight;
    const grande = w >= ZONA_GRANDE[0] && h >= ZONA_GRANDE[1];
    /*
     * Na TV (fase 3) o piso vale em toda zona, e a fração é a do local da TV
     * (--mt-piso-tv, js/player.js letraDoLocal: balcão .045, recepção .035,
     * escritório .03). A bancada também pode dizer o local (o seletor
     * "Local"): aí a zona pequena tem piso, como na TV.
     */
    const doLocal = janela && janela.getComputedStyle ? parseFloat(janela.getComputedStyle(host).getPropertyValue('--mt-piso-tv')) : 0;
    if (!naTv && !grande && !doLocal) {
      // Miniatura (painel): ela não diz o tamanho da zona na TV. A peça
      // deitada ou quadrada é desenhada para a zona grande: o piso da tela
      // cheia, em pixel do palco (1080 linhas). A bancada desenha a zona no
      // tamanho de verdade e cai na conta de baixo.
      return ref ? 0.045 * 1080 : 0;
    }
    const frac = doLocal || 0.045;
    // Fora da TV (bancada, editor) a janela não é a TV: vale a TV de 1080 linhas, a mesma conta da miniatura.
    const lado = naTv && janela ? Math.min(janela.innerWidth, janela.innerHeight) : 1080;
    return frac * lado / (k || 1);
  }
  function enquadrar(host, palco) {
    const w = host.clientWidth, h = host.clientHeight;
    if (!w || !h || !palco) return;
    const ref = referencia(w, h);
    let k = 1;
    if (!ref) palco.removeAttribute('style');
    else {
      k = h / ref[1];
      palco.style.cssText = 'left:' + ((w - ref[0] * k) / 2).toFixed(2) + 'px;top:0;right:auto;bottom:auto;width:'
        + ref[0] + 'px;height:' + ref[1] + 'px;transform:scale(' + k.toFixed(5) + ');transform-origin:0 0';
    }
    // O que a passada anterior encolheu volta ao desenho antes de medir o piso (ver semCorte).
    desfazerSemCorte(palco);
    semCorte(palco, pisoQueCabe(palco, pisoDaZona(host, k, ref)));
  }

  /*
   * NADA CORTADO DENTRO DA PEÇA (reteste 2, 09/11). Com o piso da TV, o
   * cabeçalho centralizado truncava a data em reticências ("SEGUNDA · 9 …"),
   * o clássico em pé comia o fim do nome ("PADARI∧ SOL") e a entrelinha justa
   * com `overflow: hidden` cortava o acento e a perna do "g" ("COMUNICAÇAO",
   * "VOCE") — em 13 telas prontas, e nenhuma medida via: a caixa do campo
   * continuava dentro da peça. Depois do piso, cada texto que uma caixa de
   * DENTRO da peça corta (o próprio campo ou um pai dele, até a peça), nesta
   * ordem:
   *   1. a data vira a curta ("Seg · 9 nov");
   *   2. a letra encolhe até caber — nunca abaixo do piso (sem piso, até 3/4
   *      do desenho) —, e o espaço entre as letras também, se ainda faltar;
   *   3. a caixa que corta só o acento ou a perna da letra (a linha cabe; a
   *      entrelinha é que é justa) ganha o respiro em cima e embaixo, com a
   *      margem negativa do mesmo tanto: nada sai do lugar.
   * É a garantia, como o aplicarPiso: vale mesmo para a peça que a IA
   * escreveu sem saber disso. O detector da bancada (js/peca-conferir.js,
   * cortados) mede depois, e a régua reprova o que ainda cortar.
   */
  const CAMPOS_DE_TEXTO = '[data-campo],[data-vivo]:not([data-vivo="mensagens"])';
  function caixasQueCortam(el, peca) {
    const out = [];
    for (let q = el; q && q !== peca; q = q.parentElement) {
      const cs = getComputedStyle(q);
      if (cs.display === 'inline') continue;
      const x = cs.overflowX !== 'visible', y = cs.overflowY !== 'visible';
      if (x || y) out.push({ el: q, x, y });
    }
    return out;
  }
  // Onde o texto corta: 'linha' (sobra texto fora da caixa: a linha não cabe), 'letra' (só o acento ou a perna) ou ''.
  function ondeCorta(el, caixas) {
    const r = el.ownerDocument.createRange();
    r.selectNodeContents(el);
    const linhas = Array.prototype.filter.call(r.getClientRects(), (x) => x.width > 0 && x.height > 0);
    if (!linhas.length) return { corte: '' };
    const tol = Math.max(1, (parseFloat(getComputedStyle(el).fontSize) || 0) * 0.04 * escalaNaTela(el));
    let corte = '', caixa = null;
    for (const c of caixas) {
      const b = c.el.getBoundingClientRect();
      if (c.x && linhas.some((l) => l.left < b.left - tol || l.right > b.right + tol)) return { corte: 'linha', caixa: c.el };
      if (!c.y) continue;
      // A linha inteira fora (o line-clamp, a quebra a mais) é falta de lugar; só a borda dela fora é a entrelinha.
      if (linhas.some((l) => (l.top + l.bottom) / 2 < b.top || (l.top + l.bottom) / 2 > b.bottom)) return { corte: 'linha', caixa: c.el };
      if (linhas.some((l) => l.top < b.top - tol || l.bottom > b.bottom + tol)) {
        corte = 'letra';
        // Todas as caixas que cortam a letra (o campo e o pai dele, a tarja da chamada): cada uma ganha o respiro.
        caixa = (caixa || []).concat({ el: c.el, falta: linhas.reduce((m, l) => Math.max(m, b.top - l.top, l.bottom - b.bottom), 0) });
      }
    }
    return { corte, caixa };
  }
  /*
   * O QUE NÃO CABE SAI (reteste 2, 09/11). Uma caixa da peça com
   * `overflow: hidden` e `flex-wrap: wrap` mostra só os itens que cabem na
   * primeira linha (os contatos do rodapé: com a letra do balcão, o terceiro
   * vai para a linha de baixo, que a caixa esconde). O campo que uma caixa
   * de dentro da peça esconde INTEIRO saiu de propósito: não conta como
   * cortado, nem para o piso, nem para o detector (js/peca-conferir.js).
   * Cortado é o que aparece pela metade.
   */
  function escondidoNaCaixa(el, peca) {
    if (!el || !el.getBoundingClientRect || typeof getComputedStyle !== 'function') return false;
    const r = el.getBoundingClientRect();
    if (!r.width && !r.height) return false;
    for (let q = el.parentElement; q && q !== peca; q = q.parentElement) {
      const cs = getComputedStyle(q);
      if (cs.overflowX === 'visible' && cs.overflowY === 'visible') continue;
      const b = q.getBoundingClientRect();
      if (r.top >= b.bottom - 1 || r.bottom <= b.top + 1 || r.left >= b.right - 1 || r.right <= b.left + 1) return true;
    }
    return false;
  }
  function escalaNaTela(el) {
    const raiz = el.closest && el.closest('.mt-palco');
    return raiz && raiz.offsetWidth ? raiz.getBoundingClientRect().width / raiz.offsetWidth : 1;
  }
  function desfazerSemCorte(palco) {
    if (!palco || !palco.querySelectorAll) return;
    palco.querySelectorAll('[data-mt-sem-corte]').forEach((el) => {
      const antes = JSON.parse(el.getAttribute('data-mt-sem-corte') || '{}');
      Object.keys(antes).forEach((p) => { if (antes[p]) el.style.setProperty(p, antes[p]); else el.style.removeProperty(p); });
      el.removeAttribute('data-mt-sem-corte');
    });
    palco.querySelectorAll('[data-vivo="data"][data-mt-curta-usada]').forEach((el) => {
      el.removeAttribute('data-mt-curta-usada');
      if (el.getAttribute('data-mt-longa') != null) el.textContent = el.getAttribute('data-mt-longa');
    });
  }
  // Muda um estilo inline guardando o de antes (para desfazerSemCorte).
  function mudarEstilo(el, prop, valor) {
    const antes = JSON.parse(el.getAttribute('data-mt-sem-corte') || '{}');
    if (!(prop in antes)) antes[prop] = el.style.getPropertyValue(prop) || '';
    el.setAttribute('data-mt-sem-corte', JSON.stringify(antes));
    el.style.setProperty(prop, valor);
  }
  function semCorte(palco, pisoQueEntrou) {
    const doc = palco && palco.ownerDocument;
    if (!doc || !doc.createRange || !doc.createElement || typeof getComputedStyle !== 'function' || typeof palco.getBoundingClientRect !== 'function') return;
    const peca = palco.querySelector('.mt-peca');
    const raiz = palco.parentNode;
    if (!peca || !raiz || !palco.offsetWidth) return;
    // O piso que vale para encolher: o que entrou (se cedeu, o que cabia), nunca abaixo dele.
    const piso = pisoQueEntrou || 0;
    // Medido parado, como o piso: uma letra entrando de lado parece cortada.
    const parada = doc.createElement('style');
    parada.textContent = '.mt-palco,.mt-palco *{animation:none!important;transition:none!important}';
    raiz.appendChild(parada);
    try { encolherOQueCorta(palco, peca, piso); } finally { raiz.removeChild(parada); }
  }
  /*
   * A LINHA QUE NÃO QUEBRA (CI do PR 336). No manifesto a quebra é do campo
   * (white-space: nowrap): com o texto do cliente mais comprido que o do
   * desenho ("explicar com clareza,"), a linha passava da caixa dela e saía da
   * peça. A letra do GRUPO encolhe — o ancestral que dá a mesma letra, o
   * título inteiro: as três linhas continuam do mesmo tamanho —, nunca abaixo
   * do piso (sem piso, de 3/4 do desenho), até a linha caber na caixa dela.
   * Uma caixa do tamanho do texto (flex: none, inline-block) nunca sobra.
   */
  function sobraDaCaixa(el) {
    const b = el.getBoundingClientRect();
    const r = el.ownerDocument.createRange();
    r.selectNodeContents(el);
    const tol = Math.max(1, (parseFloat(getComputedStyle(el).fontSize) || 0) * 0.02 * escalaNaTela(el));
    return Array.prototype.some.call(r.getClientRects(), (l) => l.width > 0 && (l.right > b.right + tol || l.left < b.left - tol));
  }
  function caberNaLinha(el, peca, piso) {
    const cs = getComputedStyle(el);
    if (cs.whiteSpace !== 'nowrap' || cs.display === 'inline' || !sobraDaCaixa(el)) return;
    let grupo = el;
    for (let q = el.parentElement; q && q !== peca && getComputedStyle(q).fontSize === cs.fontSize; q = q.parentElement) grupo = q;
    const desenho = parseFloat(getComputedStyle(grupo).fontSize) || 0;
    const minimo = piso > 0 ? piso : desenho * 0.75;
    for (let i = 0; i < 10 && sobraDaCaixa(el); i++) {
      const atual = parseFloat(getComputedStyle(grupo).fontSize) || 0;
      if (atual <= minimo + 0.5) break;
      mudarEstilo(grupo, 'font-size', Math.max(minimo, atual * 0.95).toFixed(2) + 'px');
    }
  }
  function encolherOQueCorta(palco, peca, piso) {
    Array.prototype.forEach.call(palco.querySelectorAll(CAMPOS_DE_TEXTO), (el) => {
      if (camadaDoPlayer(el) || el.tagName === 'IMG' || el.closest('[aria-hidden="true"]') || !String(el.textContent || '').trim() || escondidoNaCaixa(el, peca)) return;
      caberNaLinha(el, peca, piso);
      const caixas = caixasQueCortam(el, peca);
      if (!caixas.length) return;
      let onde = ondeCorta(el, caixas);
      if (!onde.corte) return;
      // 1. A data curta.
      if (onde.corte === 'linha' && el.getAttribute('data-vivo') === 'data' && el.getAttribute('data-mt-curta')) {
        el.textContent = el.getAttribute('data-mt-curta');
        el.setAttribute('data-mt-curta-usada', '');
        onde = ondeCorta(el, caixas);
      }
      // 2. A letra encolhe até caber, no máximo até o piso (o de antes de ceder, se cedeu: é a régua).
      const desenho = parseFloat(getComputedStyle(el).fontSize) || 0;
      const minimo = piso > 0 ? piso : desenho * 0.75;
      for (let i = 0; i < 6 && onde.corte === 'linha'; i++) {
        const atual = parseFloat(getComputedStyle(el).fontSize) || 0;
        if (atual <= minimo + 0.5) break;
        mudarEstilo(el, 'font-size', Math.max(minimo, atual * 0.92).toFixed(2) + 'px');
        onde = ondeCorta(el, caixas);
      }
      // ... e o espaço entre as letras, se ainda faltar (é desenho, não leitura).
      if (onde.corte === 'linha') {
        const ls = parseFloat(getComputedStyle(el).letterSpacing) || 0;
        const fs = parseFloat(getComputedStyle(el).fontSize) || 0;
        if (ls > fs * 0.02) {
          mudarEstilo(el, 'letter-spacing', (fs * 0.02).toFixed(2) + 'px');
          onde = ondeCorta(el, caixas);
        }
      }
      // ... e, no piso e ainda sem caber numa linha (o nome comprido da marca), quebra em duas se a caixa tiver altura para elas.
      if (onde.corte === 'linha' && getComputedStyle(el).whiteSpace === 'nowrap') {
        mudarEstilo(el, 'white-space', 'normal');
        mudarEstilo(el, 'text-overflow', 'clip');
        const quebrado = ondeCorta(el, caixas);
        if (quebrado.corte === 'linha') {
          el.style.removeProperty('white-space');
          el.style.removeProperty('text-overflow');
          const antes = JSON.parse(el.getAttribute('data-mt-sem-corte') || '{}');
          if (antes['white-space']) el.style.setProperty('white-space', antes['white-space']);
          if (antes['text-overflow']) el.style.setProperty('text-overflow', antes['text-overflow']);
          delete antes['white-space'];
          delete antes['text-overflow'];
          el.setAttribute('data-mt-sem-corte', JSON.stringify(antes));
        } else onde = quebrado;
      }
      // 3. Só o acento ou a perna: respiro na caixa que corta, sem mexer em nada em volta.
      if (onde.corte === 'letra' && onde.caixa) {
        onde.caixa.forEach((cx) => {
          const c = cx.el;
          const cs = getComputedStyle(c);
          const k = escalaNaTela(c) || 1;
          const folga = Math.ceil(cx.falta / k) + 2;
          mudarEstilo(c, 'padding-top', (parseFloat(cs.paddingTop) + folga) + 'px');
          mudarEstilo(c, 'padding-bottom', (parseFloat(cs.paddingBottom) + folga) + 'px');
          mudarEstilo(c, 'margin-top', (parseFloat(cs.marginTop) - folga) + 'px');
          mudarEstilo(c, 'margin-bottom', (parseFloat(cs.marginBottom) - folga) + 'px');
        });
      }
    });
  }

  function porOPiso(palco, p) {
    if (palco.style && palco.style.setProperty) palco.style.setProperty('--mt-piso', p.toFixed(2) + 'px');
    aplicarPiso(palco, p);
  }

  /*
   * Fase 2: o piso que CABE. A peça é desenhada em posição fixa: subir a
   * letra miúda até o piso da TV pode empurrar um campo para fora ou por
   * cima de outro (a bancada achou 371 defeitos assim, em 28 das 43
   * peças-ouro). A peça nunca quebra por causa do piso: mede o desenho sem
   * ele, põe o piso inteiro e, se algum campo novo sair da margem ou
   * encostar em outro, procura (5 passos, ao meio) o maior piso que cabe.
   * O que cedeu fica marcado em data-mt-piso-cedeu (a fração do piso que
   * entrou), para a bancada e o robô da régua apontarem a peça que precisa
   * de outro desenho.
   */
  function pisoQueCabe(palco, piso) {
    palco.removeAttribute('data-mt-piso-cedeu');
    const raiz = palco.parentNode;
    const doc = palco.ownerDocument;
    if (!piso || !raiz || !doc || !doc.createElement || typeof palco.getBoundingClientRect !== 'function' || typeof getComputedStyle !== 'function') {
      porOPiso(palco, piso);
      return piso;
    }
    // Medir sem as entradas no meio do caminho (uma letra entrando de lado parece fora da peça).
    const parada = doc.createElement('style');
    parada.textContent = '.mt-palco,.mt-palco *{animation:none!important;transition:none!important}';
    raiz.appendChild(parada);
    try {
      porOPiso(palco, 0);
      const antes = encaixe(palco);
      porOPiso(palco, piso);
      if (!piorou(antes, encaixe(palco))) return piso;
      let cabe = 0, naoCabe = piso;
      for (let i = 0; i < 5; i++) {
        const meio = (cabe + naoCabe) / 2;
        porOPiso(palco, meio);
        if (piorou(antes, encaixe(palco))) naoCabe = meio; else cabe = meio;
      }
      porOPiso(palco, cabe);
      palco.setAttribute('data-mt-piso-cedeu', (cabe / piso).toFixed(2));
      return cabe;
    } finally {
      raiz.removeChild(parada);
    }
  }

  // Onde está cada campo (as linhas do texto, não a caixa) e o que sai da margem ou encosta em outro.
  function encaixe(palco) {
    const P = palco.getBoundingClientRect();
    const k = palco.offsetWidth ? P.width / palco.offsetWidth : 1;
    const mx = 16 * k, my = (palco.offsetHeight <= 220 ? 6 : 16) * k, tol = 2 * k;
    const doc = palco.ownerDocument;
    // As cópias da "revelar" (máscaras por cima do original, por um segundo) não são campos: o original é medido.
    // O que uma caixa da peça esconde inteiro (a lista que mostra só o que cabe numa linha) saiu de propósito: não é medido (ver escondidoNaCaixa).
    const pecaEl = palco.querySelector('.mt-peca');
    // (Fica na lista, sem linhas: o índice de cada campo tem de ser o mesmo com e sem o piso — é por ele que `piorou` compara.)
    const daPeca = Array.prototype.filter.call(palco.querySelectorAll('[data-campo],[data-vivo],[data-campo-qr]'), (el) => !camadaDoPlayer(el));
    const campos = daPeca.map((el) => {
      if (escondidoNaCaixa(el, pecaEl)) return { el, rs: [] };
      let rs = [];
      if (el.tagName !== 'IMG' && doc.createRange && String(el.textContent || '').trim()) {
        const r = doc.createRange();
        r.selectNodeContents(el);
        // Cada linha vale a altura da LINHA, não a da fonte (a mesma conta de js/peca-conferir.js, linhasDoTexto):
        // título de entrelinha justa numa fonte de ascendente alto não "encosta" no rótulo de cima.
        const lh = (parseFloat(getComputedStyle(el).lineHeight) || 0) * k;
        rs = Array.prototype.slice.call(r.getClientRects()).map((x) => {
          const meio = (x.top + x.bottom) / 2, meia = lh && x.height > lh ? lh / 2 : x.height / 2;
          return { left: x.left, right: x.right, top: meio - meia, bottom: meio + meia, width: x.width, height: meia * 2 };
        });
      }
      if (!rs.length) rs = [el.getBoundingClientRect()];
      return { el, rs: rs.filter((r) => r.width > 0 && r.height > 0) };
    });
    // Duas linhas se cobrem quando a área em comum passa de um quinto da menor (a regra do detector da bancada).
    const area = (x) => (x.right - x.left) * (x.bottom - x.top);
    // ... ou quando uma entra na outra mais de 30% da altura da linha menor, por mais de uma letra (reteste 2: a chamada do rodapé sobre o WhatsApp).
    const cobre = (a, b) => {
      const w = Math.min(a.right, b.right) - Math.max(a.left, b.left), h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
      const linha = Math.min(a.bottom - a.top, b.bottom - b.top);
      return w > tol && h > tol && (w * h > Math.min(area(a), area(b)) / 5 || (h > linha * 0.3 && w > linha * 0.8));
    };
    const fora = [], juntos = [];
    campos.forEach((c, i) => {
      if (!c.rs.length) return;
      // A margem é a da régua (js/regras-composicao.js, REGRAS.margem), sem folga.
      if (c.rs.some((r) => r.left < P.left + mx || r.top < P.top + my || r.right > P.right - mx || r.bottom > P.bottom - my)) fora.push(i);
      for (let j = i + 1; j < campos.length; j++) {
        const d = campos[j];
        if (!d.rs.length || c.el.contains(d.el) || d.el.contains(c.el)) continue;
        if (c.rs.some((r) => d.rs.some((x) => cobre(r, x)))) juntos.push(i + '-' + j);
      }
    });
    return { fora, juntos };
  }
  // Só conta o que o piso criou: o que o desenho já tinha (de propósito ou não) não é culpa dele.
  function piorou(antes, depois) {
    return depois.fora.some((i) => antes.fora.indexOf(i) < 0) || depois.juntos.some((p) => antes.juntos.indexOf(p) < 0);
  }
  /*
   * A peça que a IA escreveu com letra menor que o piso (sem usar
   * var(--mt-piso)) sobe para o piso aqui. É a garantia: a régua vale mesmo
   * quando o CSS da peça não a conhece. O que já foi subido e deixou de
   * precisar (a zona cresceu) volta ao tamanho da peça.
   */
  function aplicarPiso(palco, piso) {
    if (!palco || !palco.querySelectorAll || typeof getComputedStyle !== 'function') return;
    const els = palco.querySelectorAll('*');
    for (let i = 0; i < els.length; i++) {
      const el = els[i];
      if (camadaDoPlayer(el)) continue;
      if (el.hasAttribute('data-mt-piso')) { el.style.removeProperty('font-size'); el.removeAttribute('data-mt-piso'); }
      if (!piso) continue;
      let temTexto = false;
      for (let n = el.firstChild; n; n = n.nextSibling) if (n.nodeType === 3 && n.nodeValue.trim()) { temTexto = true; break; }
      if (!temTexto) continue;
      const fs = parseFloat(getComputedStyle(el).fontSize) || 0;
      if (fs && fs < piso - 0.5) { el.style.setProperty('font-size', piso.toFixed(2) + 'px'); el.setAttribute('data-mt-piso', ''); }
    }
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

  /*
   * PREÇO PELA METADE NÃO VAI AO AR (reteste 2, 09/11). A vitrine mostrava
   * "10x de" sem o valor, e a peça de serviço da clínica, sem o preço (a
   * Saúde não fala de preço), mostraria um "R$" sozinho e a vírgula dos
   * centavos. O preço vazio leva junto o bloco dele — o maior pai que só
   * tem partes do preço (o "R$", os centavos, o "a partir de", a parcela) —,
   * e a parcela que termina antes do número ("10× de", "10x de R$") sai.
   */
  const PARTES_DO_PRECO = /^(preco|centavos|parcelas?|vezes|de|preco-rotulo|total)$/;
  const CAMPO_DE_PRECO = /^(item\d+-)?preco\d*$|^parcela$/;
  const PARCELA_SEM_VALOR = /\d\s*[x×]\s*(de)?\s*(R\$)?\s*$/i;
  function esconderPrecoIncompleto(sombra, peca) {
    Array.prototype.forEach.call(sombra.querySelectorAll('[data-campo]'), (el) => {
      const nome = el.getAttribute('data-campo');
      const texto = String(el.textContent || '').trim();
      if (/^parcelas?$/.test(nome) && texto && PARCELA_SEM_VALOR.test(texto)) { esconder(el, peca); return; }
      if (!CAMPO_DE_PRECO.test(nome) || texto) return;
      let alvo = el;
      for (let q = el.parentElement; q && q !== peca; q = q.parentElement) {
        const todas = Array.prototype.every.call(q.querySelectorAll('[data-campo]'), (c) => c === el || PARTES_DO_PRECO.test(c.getAttribute('data-campo')));
        if (!todas) break;
        alvo = q;
      }
      alvo.setAttribute('data-oculto', '');
    });
  }

  /* ============ Espaços de imagem: qualquer foto, em qualquer espaço ============
   *
   * O cliente põe a foto que tem — a do celular, em pé, numa peça deitada;
   * a do banco; uma pequena demais — e ela tem que ficar bonita no espaço
   * da peça. Duas maneiras de pôr uma foto num espaço:
   *
   *   cobrir  enche o espaço e corta o que sobra (object-fit: cover). Com o
   *           FOCO do cliente, o corte se alinha no ponto que ele tocou: o
   *           ponto x% da foto fica a x% do espaço, então nunca sai do quadro.
   *   conter  a foto inteira no meio (com o foco, quase inteira: até um
   *           quarto dela em volta do ponto) e, atrás dela, ela mesma
   *           esticada e escurecida — o fundo desfocado. Nada de faixa preta,
   *           nada de cabeça ou produto cortado ao meio.
   *
   * Cobrir é o normal. Conter entra quando o corte levaria demais da foto
   * (a proporção da foto está longe da do espaço) ou quando a foto, para
   * cobrir, teria que crescer além da conta (pequena demais, sai borrada).
   * Quanto o papel tolera perder: o ambiente aguenta corte (é cenário), o
   * produto menos, a pessoa menos ainda; a textura sempre cobre (é fundo).
   * Com o foco escolhido, a folga é maior: o que importa já está garantido.
   *
   * O borrão NÃO é `filter: blur()` (a placa do box barato não aguenta,
   * a mesma regra de js/render.js, comFundo): é a foto em miniatura (24 px)
   * esticada, que o navegador já desenha borrada. A miniatura vem pronta no
   * item (`espacos[nome].fundo`, feita no painel ao escolher a foto); sem
   * ela, sai daqui mesmo, de um <canvas>. Foto de outro endereço não deixa
   * ler o canvas: aí o fundo é a cor de fundo da marca.
   *
   * Tudo no <img> que a peça já tem — estilo inline, nenhum elemento novo:
   * os seletores da peça (`.foto + .veu`, `.avatar img`) continuam valendo,
   * e a borda redonda e a entrada animada vêm junto.
   */
  const CORTE_DO_PAPEL = { produto: 0.45, pessoa: 0.4, ambiente: 0.6 };

  /*
   * A FOTO PADRÃO DO ESPAÇO VAZIO (reteste 2, 09/11). A peça com espaço de
   * foto que chegava sem foto ficava pela metade: o "30% OFF" com a metade
   * da quadrada vazia (oferta-desconto), o prato do dia sem o prato
   * (cardapio-dia-foto), a oferta sem o produto (oferta-foto). O modelo
   * pronto vem sem a foto de exemplo (ela é da marca de exemplo), e o
   * cliente nem sempre põe a dele. Agora o espaço vazio leva uma foto do
   * banco (pecas-ouro/fotos/banco.json) do PAPEL dele — produto, ambiente
   * ou textura — e do RAMO da conta (o servidor manda: settings.ramo); sem
   * ramo, o da frente (a Saúde é saúde, a Empresas é escritório); sem
   * nenhum, a textura neutra ("geral"). Pessoa nunca: um rosto de banco no
   * lugar do aniversariante seria dizer que é ele. O rascunho continua com
   * a silhueta. Cada arquivo daqui está no banco, com o papel e o ramo
   * (test/foto-padrao.test.js).
   */
  const FOTO_GERAL = { arquivo: '/pecas-ouro/fotos/textura/madeira-clara.jpg', foco: { x: 0.4, y: 0.5 } };
  const FOTOS_PADRAO = {
    otica: { produto: { arquivo: '/pecas-ouro/fotos/otica/sol-areia.jpg', foco: { x: 0.5, y: 0.55 } }, ambiente: { arquivo: '/pecas-ouro/fotos/otica/vitrine.jpg', foco: { x: 0.5, y: 0.5 } } },
    padaria: { produto: { arquivo: '/pecas-ouro/fotos/padaria/pao-tabua.jpg', foco: { x: 0.45, y: 0.5 } }, ambiente: { arquivo: '/pecas-ouro/fotos/padaria/balcao.jpg', foco: { x: 0.5, y: 0.55 } },
      textura: { arquivo: '/pecas-ouro/fotos/padaria/pao-de-forma.jpg', foco: { x: 0.5, y: 0.5 } } },
    comida: { produto: { arquivo: '/pecas-ouro/fotos/prato-do-dia.jpg', foco: { x: 0.49, y: 0.49 } }, ambiente: { arquivo: '/pecas-ouro/fotos/restaurante/salao.jpg', foco: { x: 0.5, y: 0.5 } },
      textura: { arquivo: '/pecas-ouro/fotos/restaurante/queijos.jpg', foco: { x: 0.5, y: 0.5 } } },
    beleza: { produto: { arquivo: '/pecas-ouro/fotos/salao/pinceis.jpg', foco: { x: 0.5, y: 0.5 } }, ambiente: { arquivo: '/pecas-ouro/fotos/salao/camarim.jpg', foco: { x: 0.6, y: 0.45 } } },
    saude: { produto: { arquivo: '/pecas-ouro/fotos/farmacia/cuidados.jpg', foco: { x: 0.5, y: 0.5 } }, ambiente: { arquivo: '/pecas-ouro/fotos/clinica/sala-clara.jpg', foco: { x: 0.5, y: 0.55 } },
      textura: { arquivo: '/pecas-ouro/fotos/clinica/entrada.jpg', foco: { x: 0.5, y: 0.5 } } },
    corporativo: { produto: { arquivo: '/pecas-ouro/fotos/escritorio/mesa-minimalista.jpg', foco: { x: 0.7, y: 0.5 } }, ambiente: { arquivo: '/pecas-ouro/fotos/escritorio/escritorio-aberto.jpg', foco: { x: 0.6, y: 0.5 } },
      textura: { arquivo: '/pecas-ouro/fotos/escritorio/predio.jpg', foco: { x: 0.5, y: 0.5 } } },
  };
  // Os ramos da Marca (js/paletas.js) que usam as fotos de outro; o resto (pet, academia, moda, varejo) fica com a geral.
  const RAMO_DAS_FOTOS = { barbearia: 'beleza' };
  const RAMO_DA_FRENTE = { saude: 'saude', empresa: 'corporativo' };
  const PAPEIS_COM_FOTO_PADRAO = ['produto', 'ambiente', 'textura'];
  function fotoPadrao(papel, ramo, frente) {
    if (PAPEIS_COM_FOTO_PADRAO.indexOf(papel) < 0) return null;
    const r = RAMO_DAS_FOTOS[ramo] || ramo;
    const doRamo = (FOTOS_PADRAO[r] || FOTOS_PADRAO[RAMO_DA_FRENTE[frente]] || {})[papel];
    return doRamo || FOTO_GERAL;
  }
  const CORTE_PADRAO = 0.5;
  const FOLGA_DO_FOCO = 0.15;
  // Cobrir esticando mais que isto (2,5× o tamanho da foto) já se vê borrado na TV.
  const AMPLIACAO_MAXIMA = 2.5;
  // No "conter", com o foco escolhido, a foto pode perder até isto em volta dele (o assunto sai maior).
  const PERDA_NO_FUNDO = 0.25;
  const VEU_DO_FUNDO = 'linear-gradient(rgba(0,0,0,.38),rgba(0,0,0,.38))';
  const LADO_DA_MINIATURA = 24;

  /*
   * A decisão, pura (a TV, a bancada, o painel e o teste chamam a mesma):
   * e = { fotoW, fotoH, espacoW, espacoH, papel, foco }. Devolve { modo,
   * motivo, corte, ampliacao }: `corte` é a fração da foto que cobrir
   * jogaria fora no lado que sobra; `ampliacao`, quanto ela cresceria.
   */
  function encaixeDaFoto(e) {
    const o = e || {};
    const fw = Number(o.fotoW), fh = Number(o.fotoH), ew = Number(o.espacoW), eh = Number(o.espacoH);
    if (!(fw > 0 && fh > 0 && ew > 0 && eh > 0)) return { modo: 'cobrir', motivo: 'sem-medida', corte: 0, ampliacao: 1 };
    const rf = fw / fh, re = ew / eh;
    const corte = 1 - Math.min(rf, re) / Math.max(rf, re);
    const ampliacao = Math.max(ew / fw, eh / fh);
    const medidas = { corte: Math.round(corte * 1000) / 1000, ampliacao: Math.round(ampliacao * 100) / 100 };
    if (o.papel === 'textura') return Object.assign({ modo: 'cobrir', motivo: 'textura' }, medidas);
    const tolera = Math.min(0.85, (CORTE_DO_PAPEL[o.papel] != null ? CORTE_DO_PAPEL[o.papel] : CORTE_PADRAO) + (o.foco ? FOLGA_DO_FOCO : 0));
    if (corte > tolera) return Object.assign({ modo: 'conter', motivo: 'formato' }, medidas);
    if (ampliacao > AMPLIACAO_MAXIMA) return Object.assign({ modo: 'conter', motivo: 'pequena' }, medidas);
    return Object.assign({ modo: 'cobrir', motivo: 'cabe' }, medidas);
  }

  /*
   * A miniatura de uma foto já carregada (data:image/jpeg), ou null quando o
   * navegador não deixa ler (foto de outro endereço) ou não há canvas. O
   * painel usa a mesma para guardar `espacos[nome].fundo`.
   */
  function miniaturaDaFoto(img, lado) {
    try {
      // A foto, ou o quadro de agora do vídeo da FOTO VIVA (o <canvas> desenha os dois).
      const w = img.naturalWidth || img.videoWidth, h = img.naturalHeight || img.videoHeight;
      const doc = img.ownerDocument || (typeof document !== 'undefined' ? document : null);
      if (!w || !h || !doc) return null;
      const k = (lado || LADO_DA_MINIATURA) / Math.max(w, h);
      const c = doc.createElement('canvas');
      c.width = Math.max(1, Math.round(w * k));
      c.height = Math.max(1, Math.round(h * k));
      const g = c.getContext && c.getContext('2d');
      if (!g) return null;
      g.drawImage(img, 0, 0, c.width, c.height);
      const url = c.toDataURL('image/jpeg', 0.7);
      return /^data:image\/jpeg;base64,/.test(url) ? url : null;
    } catch (e) { return null; }
  }

  // A miniatura feita aqui, uma vez por foto (a mesma foto volta a cada giro da playlist).
  const miniaturas = {};
  let quantasMiniaturas = 0;
  function fundoDoEspaco(img, esp) {
    if (esp && esp.fundo) return esp.fundo;
    const src = img.currentSrc || img.src || '';
    if (!Object.prototype.hasOwnProperty.call(miniaturas, src)) {
      if (++quantasMiniaturas > 60) { Object.keys(miniaturas).forEach((k) => { delete miniaturas[k]; }); quantasMiniaturas = 1; }
      miniaturas[src] = miniaturaDaFoto(img);
    }
    return miniaturas[src];
  }

  const pct = (n) => Math.round(n * 1000) / 10 + '%';
  const PROPRIAS = ['object-fit', 'object-position', 'background', 'padding', 'box-sizing'];

  /*
   * Põe a foto no espaço: decide (encaixeDaFoto) e escreve no próprio <img>.
   * Chamada quando a foto carrega e a cada vez que a zona muda de tamanho.
   * `esp` = { papel, foco, fundo } (ver peca-html.js, ESPAÇOS DE IMAGEM).
   */
  function encaixarFoto(img, esp) {
    const e = esp || {};
    const s = img.style;
    PROPRIAS.forEach((p) => s.removeProperty(p));
    img.removeAttribute('data-mt-encaixe');
    if (e.foco) s.setProperty('object-position', pct(e.foco.x) + ' ' + pct(e.foco.y), 'important');
    // O vídeo da FOTO VIVA encaixa igual à foto: a medida dele é videoWidth/videoHeight.
    const fw = img.naturalWidth || img.videoWidth || 0, fh = img.naturalHeight || img.videoHeight || 0;
    if (!fw || !fh || img.hasAttribute('data-sem-foto')) return null;
    const w = img.clientWidth, h = img.clientHeight;
    const d = encaixeDaFoto({ fotoW: fw, fotoH: fh, espacoW: w, espacoH: h, papel: e.papel, foco: e.foco });
    if (d.modo !== 'conter') return d;
    img.setAttribute('data-mt-encaixe', d.motivo);
    const fundo = fundoDoEspaco(img, e);
    s.setProperty('background', (fundo ? VEU_DO_FUNDO + ',url("' + fundo + '") center/cover no-repeat,' : '') + 'var(--mt-fundo-2,#1a1a1a)', 'important');
    /*
     * A JANELA da foto dentro do espaço: a foto inteira (contain) e, com o
     * foco escolhido, até PERDA_NO_FUNDO dela em volta do ponto, para o
     * assunto sair maior; nunca além de AMPLIACAO_MAXIMA (a pequena fica no
     * meio, no tamanho em que ainda sai nítida). A janela entra como padding
     * — a caixa da peça é border-box, então o espaço não muda de tamanho — e
     * a foto cobre a janela, alinhada no foco. Se o espaço mudar de tamanho
     * com o padding (foto de altura automática), ele sai e fica o contain.
     */
    const k = Math.min(Math.min(w / fw, h / fh) / (e.foco ? 1 - PERDA_NO_FUNDO : 1), AMPLIACAO_MAXIMA);
    const cw = Math.min(w, fw * k), ch = Math.min(h, fh * k);
    s.setProperty('object-fit', 'cover', 'important');
    s.setProperty('object-position', e.foco ? pct(e.foco.x) + ' ' + pct(e.foco.y) : '50% 50%', 'important');
    s.setProperty('box-sizing', 'border-box', 'important');
    s.setProperty('padding', Math.max(0, (h - ch) / 2).toFixed(1) + 'px ' + Math.max(0, (w - cw) / 2).toFixed(1) + 'px', 'important');
    if (Math.abs(img.clientWidth - w) > 1 || Math.abs(img.clientHeight - h) > 1) {
      s.removeProperty('padding'); s.removeProperty('box-sizing');
      s.setProperty('object-fit', 'contain', 'important');
      s.setProperty('object-position', '50% 50%', 'important');
    }
    return d;
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

  /* ============ FOTO VIVA: um vídeo curto no espaço da foto ============
   *
   * O valor do campo terminado em .mp4/.webm (js/peca-html.js, ehVideo) é um
   * laço curto e mudo. A peça continua com o <img data-campo-img> que o
   * autor escreveu; aqui ele dá lugar a um <video> com os MESMOS atributos
   * (classe, data-entrada, data-ordem…) e o MESMO encaixe da foto
   * (encaixarFoto: cobrir com o foco, ou conter com o fundo desfocado).
   *
   * O CSS da peça que mira `img` (`.cartao img`, `.grade img:first-child`)
   * ganha a mesma regra para `video` (cssComVideo): <video> de autor é
   * proibido pela porta, então o único vídeo na peça é este.
   *
   * O POSTER (o primeiro quadro, em JPEG, ao lado do vídeo) é o que fica:
   *   - no modo leve (o box fraco não decodifica vídeo atrás do texto): o
   *     <img> recebe o poster e é uma foto como as outras;
   *   - quando o vídeo não abre (TV sem rede que ainda não o guardou, codec
   *     que o box não toca): o <video> volta a ser o <img>, com o poster.
   *
   * Movimento de câmera da foto (`data-continua="kenburns"`, o motor de
   * movimento) não vale no vídeo: ele já se mexe. A contínua sai do <video>.
   */
  const SO_DA_FOTO = /^kenburns/;
  const SEM_COPIAR = { src: 1, srcset: 1, sizes: 1, alt: 1, loading: 1, decoding: 1 };

  // Divide uma lista de seletores nas vírgulas de fora dos parênteses (`:is(a, b)` fica inteiro).
  function seletores(lista) {
    const partes = [];
    let nivel = 0, de = 0;
    for (let i = 0; i < lista.length; i++) {
      const c = lista[i];
      if (c === '(') nivel++;
      else if (c === ')') nivel--;
      else if (c === ',' && nivel === 0) { partes.push(lista.slice(de, i)); de = i + 1; }
    }
    partes.push(lista.slice(de));
    return partes;
  }
  const TEM_IMG = /(^|[\s>+~(,])img(?=$|[\s>+~),.:#[])/;
  const TIPO_IMG = new RegExp(TEM_IMG.source, 'g');

  /*
   * O CSS da peça com cada seletor que mira `img` repetido para `video`. A
   * porta já entregou o CSS no formato dela: regras `seletor{…}` e blocos
   * `@container …{…}` com regras dentro — nada mais.
   */
  function cssComVideo(css) {
    const base = ':where(.mt-peca) :where(video){display:block}.mt-peca video[data-sem-foto]{visibility:hidden}';
    const s = String(css || '');
    let saida = '', i = 0;
    while (i < s.length) {
      const abre = s.indexOf('{', i);
      if (abre < 0) { saida += s.slice(i); break; }
      const pre = s.slice(i, abre);
      const ini = pre.lastIndexOf('}') + 1;
      const prelude = pre.slice(ini);
      saida += pre.slice(0, ini);
      if (prelude.trim()[0] === '@' || !TEM_IMG.test(prelude)) saida += prelude + '{';
      else saida += prelude + ',' + seletores(prelude).filter((x) => TEM_IMG.test(x)).map((x) => x.replace(TIPO_IMG, '$1video')).join(',') + '{';
      i = abre + 1;
    }
    return base + saida;
  }

  /*
   * Troca o <img> do campo pelo <video> e devolve o vídeo. `voltar()` desfaz:
   * o <img> volta ao lugar com o poster (chamado quando o vídeo não abre).
   */
  function videoNoLugar(img, src, poster, aoVoltar) {
    const doc = img.ownerDocument;
    const v = doc.createElement('video');
    Array.prototype.forEach.call(img.attributes, (a) => {
      if (SEM_COPIAR[a.name] || /^on/i.test(a.name)) return;
      if (a.name === 'data-continua' && SO_DA_FOTO.test(a.value)) return;
      v.setAttribute(a.name, a.value);
    });
    const alt = img.getAttribute('alt');
    if (alt) v.setAttribute('aria-label', alt); else v.setAttribute('aria-hidden', 'true');
    v.setAttribute('data-foto-viva', '');
    // Mudo, em laço, sem controles, dentro da página: é o que deixa tocar sozinho, sem gesto, numa TV.
    v.muted = true;
    v.defaultMuted = true;
    v.setAttribute('muted', '');
    v.loop = true;
    v.autoplay = true;
    v.setAttribute('playsinline', '');
    v.setAttribute('webkit-playsinline', '');
    v.setAttribute('disablepictureinpicture', '');
    v.preload = 'auto';
    if (poster) v.poster = poster;
    v.src = src;
    let voltou = false;
    v.addEventListener('error', () => {
      // O vídeo solto ao sair da tela (soltarVideo) não volta ao poster: já não está na tela.
      if (voltou || !v.parentNode || v.hasAttribute('data-solto')) return;
      voltou = true;
      img.setAttribute('data-foto-viva', 'poster');
      v.parentNode.replaceChild(img, v);
      if (poster) img.src = poster; else img.setAttribute('data-sem-foto', '');
      if (aoVoltar) aoVoltar(img);
    });
    img.parentNode.replaceChild(v, img);
    const tocar = v.play && v.play();
    if (tocar && typeof tocar.catch === 'function') tocar.catch(() => {});
    return v;
  }

  // Solta o vídeo (o buffer de uma TV de 2 GB não espera o coletor de lixo).
  function soltarVideo(v) {
    try { v.setAttribute('data-solto', ''); v.pause(); v.removeAttribute('src'); v.load(); } catch (e) { /* já saiu */ }
  }

  /* ============ O movimento de cinema: a coreografia da peça ============
   *
   * A peça DECLARA e o player EXECUTA (PLANO §4.13). O que cada atributo
   * pede está em js/animacao.js (os nomes, que são contrato) e nas
   * keyframes do topo deste arquivo. Aqui mora o que precisa da peça já
   * desenhada na tela:
   *
   *   revelar   mede as linhas do texto e põe, por cima do elemento, uma
   *             máscara por linha (overflow escondido). Dentro de cada uma
   *             vai uma CÓPIA do conteúdo, deslocada para mostrar só aquela
   *             linha, e a cópia sobe de baixo. O original fica no lugar,
   *             invisível (visibility), segurando o layout — nada da peça
   *             muda de tamanho nem de lugar — e volta quando a última linha
   *             assenta. As máscaras e as cópias somem: o repouso é o
   *             elemento de sempre, idêntico.
   *   contar    mede a largura do número no repouso e a prende (só enquanto
   *             conta), põe os algarismos de largura igual e anda com eles
   *             do zero ao valor. O último quadro é o texto ORIGINAL, letra
   *             por letra. Se o texto mudar por fora no meio (campo vivo,
   *             contagem regressiva), o novo vira o alvo.
   *   kenburns  a foto cresce 8% durante a peça inteira, e de volta se a
   *   aproximar peça ficar no ar (vai e volta). Só cresce para o lado em que
   *             alguém a corta (borda da peça, quadro com overflow
   *             escondido): crescer para o lado do texto passaria por cima
   *             dele. Cortada dos dois lados, cresce em direção ao foco que
   *             o cliente tocou (espacos.<campo>.foco). Num quadro solto
   *             (cartão com legenda), a câmera lenta não roda.
   *   reflexo   uma faixa de luz atravessa o elemento UMA vez, depois da
   *             entrada, e a camada dela é tirada.
   *
   * Só `transform` e `opacity` se animam. O resto (largura presa, a
   * posição relativa que segura a máscara, a visibilidade do original) é
   * posto uma vez, devolvido no fim, e nunca animado.
   *
   * O relógio: as entradas de CSS começam quando a peça entra na tela; a
   * coreografia mede no primeiro quadro em que ela tem tamanho (o mesmo
   * em que o piso da régua é medido) e recomeça as entradas ali, que é o
   * mesmo instante. Quem anuncia a peça pode pedir que ela espere a
   * transição (`data-mt-espera` num ancestral, em segundos: js/player.js).
   */
  const ORIGEM_CSS = { esquerda: '0% 50%', direita: '100% 50%', cima: '50% 0%', baixo: '50% 100%' };
  const ATRASO_MAX = 6;
  const PROPRIO = Object.prototype.hasOwnProperty;

  /*
   * O jeito de mexer, a partir do que quem monta pediu:
   *   completo  o vocabulário inteiro;
   *   simples   toda entrada vira um esmaecer, e nada contínuo: a TV fraca
   *             (js/perf.js) e quem pediu ao sistema menos movimento;
   *   parado    nada se mexe: a miniatura do painel, a foto do rasterizador.
   * `leve: true` sem `movimento` é o "parado" de sempre (o painel pede assim).
   */
  function movimentoDe(o, menosMovimento) {
    const x = o || {};
    const m = x.movimento === 'completo' || x.movimento === 'simples' || x.movimento === 'parado' ? x.movimento : (x.leve ? 'parado' : 'completo');
    return m === 'completo' && menosMovimento ? 'simples' : m;
  }

  function pedeMenosMovimento(janela) {
    try { return !!(janela && janela.matchMedia && janela.matchMedia('(prefers-reduced-motion: reduce)').matches); }
    catch (e) { return false; }
  }

  /*
   * A animação de UM elemento, como o texto do `animation` — pura, para o
   * teste. `a`: o que a peça declarou ({ entrada, continua, ordem, atraso,
   * origem }); `m`: o que a coreografia mediu na tela ({ vertical, linhas,
   * kenburns: { duracao } }). Devolve { animacao, origem, inicio, fim,
   * entrada }: `origem` é o transform-origin que a entrada pede (null
   * quando não pede); `inicio` e `fim` da entrada, em segundos.
   */
  function animacaoDoElemento(a, modo, espera, m) {
    const med = m || {};
    const ordem = Math.max(0, Math.min(20, Number(a.ordem) || 0));
    const extra = Math.max(0, Math.min(ATRASO_MAX, Number(a.atraso) || 0));
    const inicio = RITMO.inicio + ordem * RITMO.passo + extra + Math.max(0, Number(espera) || 0);
    const s = (n) => Math.round(n * 100) / 100 + 's';
    const e = a.entrada && PROPRIO.call(ENTRADAS, a.entrada) ? a.entrada : '';
    const c = a.continua && PROPRIO.call(CONTINUAS, a.continua) ? a.continua : '';
    const fora = { animacao: '', origem: null, inicio, fim: inicio, entrada: e };
    if (modo === 'parado' || (!e && !c)) return fora;
    if (modo === 'simples') {
      // A TV fraca: o elemento só esmaece, na vez dele. Nada contínuo, nada de máscara nem de conta.
      if (!e) return fora;
      return { animacao: 'mt-pe-aparecer ' + s(CINEMA.simples) + ' ease-out ' + s(inicio) + ' both', origem: null, inicio, fim: inicio + CINEMA.simples, entrada: e };
    }
    const partes = [];
    let fim = inicio;
    let origem = null;
    if (e) {
      const t = TEMPO[e] || { duracao: RITMO.duracao, curva: RITMO.curva };
      let nome = 'mt-pe-' + e;
      if (e === 'varrer' || e === 'desenhar') {
        // A origem decide o eixo: de cima ou de baixo, em pé. Sem origem, a "desenhar" segue o formato do traço.
        const pe = a.origem === 'cima' || a.origem === 'baixo' || (!ORIGEM_CSS[a.origem] && e === 'desenhar' && !!med.vertical);
        if (pe) nome = 'mt-px-' + e + '-v';
        origem = ORIGEM_CSS[ORIGEM_CSS[a.origem] ? a.origem : (pe ? 'cima' : 'esquerda')];
      }
      if (e === 'revelar' && med.linhas > 0) {
        // As linhas já estão nas máscaras: quem sobe são elas (revelarPorLinha), o elemento fica parado.
        fim = inicio + t.duracao + (med.linhas - 1) * CINEMA.linha;
      } else {
        partes.push(nome + ' ' + s(t.duracao) + ' ' + t.curva + ' ' + s(inicio) + ' both');
        fim = inicio + (e === 'contar' ? CINEMA.conta : t.duracao);
      }
    }
    if (c === 'kenburns') {
      // Só com a origem medida (a foto tem para onde crescer): sem ela, a foto fica parada.
      if (med.kenburns) partes.push('mt-pc-kenburns ' + s(med.kenburns.duracao) + ' cubic-bezier(.45,0,.55,1) ' + s(inicio) + ' infinite alternate both');
    } else if (c && c !== 'reflexo') {
      /*
       * A contínua começa DEPOIS da entrada e sem `fill` para trás: com
       * `both`, o primeiro quadro dela valeria durante a espera e
       * atropelaria a entrada, que mexe na mesma propriedade.
       */
      partes.push('mt-pc-' + c + ' ' + RITMO.continua + 's ease-in-out ' + s(fim) + ' infinite');
    }
    return { animacao: partes.join(','), origem, inicio, fim, entrada: e };
  }

  /*
   * O número a caminho do valor final. `p` vai de 0 (o zero) a 1 (o texto
   * final, IGUAL, letra por letra). Só os algarismos andam: o "R$", a
   * vírgula, o ponto do milhar e o resto do texto ficam como estão. Um
   * número com ponto de milhar ("1.299,90") continua com ponto; os
   * centavos, os minutos e o que já tinha zero na frente (",90", ":05",
   * "04") guardam o zero. Antes do fim, nunca chega ao valor: o último
   * passo é sempre o texto original.
   */
  const NUMERO_BR = /\d{1,3}(?:\.\d{3})+(?:,\d+)?|\d+(?:,\d+)?/g;
  function numeroAgora(tok, antes, q) {
    const virgula = tok.indexOf(',');
    const inteira = virgula < 0 ? tok : tok.slice(0, virgula);
    const decimais = virgula < 0 ? '' : tok.slice(virgula + 1);
    const algarismos = inteira.replace(/\./g, '');
    const base = Math.pow(10, decimais.length);
    const total = Number(algarismos) * base + (decimais ? Number(decimais) : 0);
    const agora = Math.floor(total * q);
    let int = String(Math.floor(agora / base));
    if ((algarismos.length > 1 && algarismos.charAt(0) === '0') || antes === ',' || antes === ':') {
      while (int.length < algarismos.length) int = '0' + int;
    }
    if (inteira.indexOf('.') >= 0) int = int.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    if (!decimais) return int;
    let dec = String(agora % base);
    while (dec.length < decimais.length) dec = '0' + dec;
    return int + ',' + dec;
  }
  function contarTexto(final, p) {
    return contarPartes([final], p)[0];
  }

  /*
   * O mesmo, com o texto em PEDAÇOS: o preço da peça é "R$" num <small>,
   * "24" num <span> e ",90" num <sup>. Contados à parte, o 24 parava no 23
   * esperando o fim enquanto os centavos andavam (visto no vídeo). Aqui o
   * número é lido no texto inteiro ("R$24,90") e cada pedaço recebe a parte
   * dele, contada da DIREITA, que é onde ficam os centavos: "7,29" vira "7"
   * e ",29". Devolve um texto por pedaço; com p = 1, os originais.
   */
  function contarPartes(finais, p) {
    const partes = (finais || []).map((x) => String(x == null ? '' : x));
    const k = Number(p);
    if (!(k < 1)) return partes;
    const q = Math.max(0, k);
    const texto = partes.join('');
    const trocas = [];
    let agora = '';
    let ate = 0;
    texto.replace(NUMERO_BR, (tok, pos) => {
      const novo = numeroAgora(tok, pos > 0 ? texto.charAt(pos - 1) : '', q);
      trocas.push({ a: pos, b: pos + tok.length, novo });
      agora += texto.slice(ate, pos) + novo;
      ate = pos + tok.length;
      return tok;
    });
    agora += texto.slice(ate);
    // Uma posição do texto final no texto de agora: dentro de um número, contada da direita.
    const mapa = (x) => {
      let delta = 0;
      for (let i = 0; i < trocas.length; i++) {
        const t = trocas[i];
        if (x <= t.a) break;
        if (x < t.b) return t.a + delta + Math.max(0, t.novo.length - (t.b - x));
        delta += t.novo.length - (t.b - t.a);
      }
      return x + delta;
    };
    let ini = 0;
    return partes.map((x) => {
      const a = mapa(ini), b = mapa(ini + x.length);
      ini += x.length;
      return agora.slice(a, b);
    });
  }

  /*
   * De onde a foto cresce (kenburns, aproximar) sem passar por cima do
   * vizinho. `lados`: quais bordas da foto alguém corta ({ esquerda,
   * direita, cima, baixo }); `foco`: { x, y } de 0 a 1. Em cada eixo:
   * cortada dos dois lados, cresce em direção ao foco (o ponto fica e o
   * resto se afasta — a câmera chega nele); de um lado só, a outra borda
   * fica presa; de nenhum, não cresce (null).
   */
  function origemDaFoto(lados, foco) {
    const l = lados || {};
    const f = foco && isFinite(foco.x) && isFinite(foco.y) ? foco : { x: 0.5, y: 0.5 };
    const eixo = (a, b, v) => (a && b ? Math.max(0, Math.min(1, Number(v))) : a ? 1 : b ? 0 : null);
    const x = eixo(l.esquerda, l.direita, f.x);
    const y = eixo(l.cima, l.baixo, f.y);
    return x == null || y == null ? null : { x, y };
  }

  // A caixa de layout (sem transform) em pixels da peça, pela cadeia de offsetParent. Escondido: null.
  function caixaNaPeca(el, peca) {
    let x = 0, y = 0;
    for (let n = el; n && n !== peca; n = n.offsetParent) {
      if (!n.offsetParent) return null;
      x += n.offsetLeft;
      y += n.offsetTop;
      // offsetLeft conta da borda de DENTRO do pai posicionado: soma a borda dele.
      if (n.offsetParent !== peca) { x += n.offsetParent.clientLeft; y += n.offsetParent.clientTop; }
    }
    return { x, y, w: el.offsetWidth, h: el.offsetHeight };
  }

  // Quais bordas do elemento alguém corta: a peça (overflow escondido, sempre) ou um quadro no caminho.
  function ladosCortados(el, peca, estilo) {
    const caixa = caixaNaPeca(el, peca);
    const lados = { esquerda: false, direita: false, cima: false, baixo: false };
    if (!caixa) return lados;
    const tol = 1.5;
    for (let a = el.parentElement; a; a = a.parentElement) {
      const cs = a === peca ? null : estilo(a);
      const cortaX = !cs || cs.overflowX !== 'visible';
      const cortaY = !cs || cs.overflowY !== 'visible';
      const c = (cortaX || cortaY) && (a === peca ? { x: 0, y: 0 } : caixaNaPeca(a, peca));
      if (c) {
        const x0 = c.x + (a === peca ? 0 : a.clientLeft), y0 = c.y + (a === peca ? 0 : a.clientTop);
        if (cortaX && caixa.x <= x0 + tol) lados.esquerda = true;
        if (cortaX && caixa.x + caixa.w >= x0 + a.clientWidth - tol) lados.direita = true;
        if (cortaY && caixa.y <= y0 + tol) lados.cima = true;
        if (cortaY && caixa.y + caixa.h >= y0 + a.clientHeight - tol) lados.baixo = true;
      }
      if (a === peca) break;
    }
    return lados;
  }

  // As camadas que a coreografia põe na peça: as máscaras da "revelar" e a luz do "reflexo".
  const CAMADAS = 'mt-revelar,mt-luz';
  const camadaDoPlayer = (el) => !!(el && el.closest && el.closest(CAMADAS));

  function coreografia(c) {
    const host = c.host, sombra = c.sombra, peca = c.peca, palco = c.palco;
    const fotos = c.fotos || [];
    const modo = c.movimento;
    const doc = host.ownerDocument;
    const janela = (doc && doc.defaultView) || null;
    const estilo = (el) => janela.getComputedStyle(el);
    const relogio = () => (janela && janela.performance && janela.performance.now ? janela.performance.now() : Date.now());
    const els = !peca || modo === 'parado' ? [] : Array.prototype.slice.call(sombra.querySelectorAll('[data-entrada],[data-continua]'));
    const atributos = (el) => ({
      entrada: el.getAttribute('data-entrada') || '', continua: el.getAttribute('data-continua') || '',
      ordem: el.getAttribute('data-ordem'), atraso: el.getAttribute('data-atraso'), origem: el.getAttribute('data-origem') || '',
    });
    const medidas = new Map();
    const guardados = new Map();
    const relogios = [];
    const fins = [];
    const contas = [];
    let andando = null;
    let iniciada = false, parada = false;
    let zero = 0;

    // O estilo em linha que a coreografia muda é guardado e devolvido, nunca deixado para trás.
    function por(el, prop, valor, prioridade) {
      let g = guardados.get(el);
      if (!g) guardados.set(el, (g = {}));
      if (!PROPRIO.call(g, prop)) g[prop] = [el.style.getPropertyValue(prop), el.style.getPropertyPriority(prop)];
      el.style.setProperty(prop, valor, prioridade || '');
    }
    function devolver(el, props) {
      const g = guardados.get(el);
      if (!g) return;
      props.forEach((p) => {
        if (!PROPRIO.call(g, p)) return;
        if (g[p][0]) el.style.setProperty(p, g[p][0], g[p][1]); else el.style.removeProperty(p);
        delete g[p];
      });
    }
    const depois = (segundos, fn) => { relogios.push(setTimeout(fn, Math.max(0, segundos) * 1000)); };

    // A transição que anuncia a peça pode pedir que as entradas esperem por ela (js/player.js).
    function espera() {
      const s = host.closest ? host.closest('[data-mt-espera]') : null;
      return Math.max(0, Math.min(2, Number(s && s.getAttribute('data-mt-espera')) || 0));
    }
    // A câmera lenta dura o tempo da peça no ar: o que a zona marcou no slide, ou o da peça.
    function duracaoDaPeca() {
      const s = host.closest ? host.closest('[data-mt-dur]') : null;
      return Math.max(CINEMA.kenburns, Number(s && s.getAttribute('data-mt-dur')) || Number(c.duracao) || 12);
    }

    function aplicar(seg) {
      els.forEach((el) => {
        const r = animacaoDoElemento(atributos(el), modo, seg, medidas.get(el));
        el.style.animation = r.animacao;
        if (r.origem) el.style.transformOrigin = r.origem;
      });
    }

    // A origem da varrer/desenhar sai quando a entrada acaba: ela mudaria o transform que a peça já tiver.
    function aoFimDaEntrada(ev) {
      const el = ev.target;
      if (els.indexOf(el) < 0 || !/^mt-p[ex]-(varrer|desenhar)/.test(ev.animationName || '')) return;
      if (!(medidas.get(el) || {}).origemFoto) el.style.removeProperty('transform-origin');
    }
    if (els.length) sombra.addEventListener('animationend', aoFimDaEntrada);

    /* ---- Medir, em repouso ---- */

    /*
     * As linhas do texto do elemento, em px da peça, relativas à caixa de
     * dentro dele (o padding box), e de que linha é cada PALAVRA: `palavras`
     * = [{ no, de, ate, linha }], `no` é a ordem do texto entre os textos do
     * elemento. A "revelar" usa as palavras para mostrar, em cada máscara,
     * só a linha dela.
     */
    function textosDoElemento(el) {
      const out = [];
      const andar = doc.createTreeWalker(el, 4);
      for (let n = andar.nextNode(); n; n = andar.nextNode()) if (!camadaDoPlayer(n.parentNode)) out.push(n);
      return out;
    }
    function linhasDe(el) {
      const r0 = el.getBoundingClientRect();
      if (!el.offsetHeight || !r0.height) return null;
      const ky = r0.height / el.offsetHeight;
      const topo = r0.top + el.clientTop * ky;
      const palavras = [];
      const faixa = doc.createRange();
      textosDoElemento(el).forEach((n, k) => {
        const re = /\S+/g;
        for (let m = re.exec(n.nodeValue); m; m = re.exec(n.nodeValue)) {
          faixa.setStart(n, m.index);
          faixa.setEnd(n, m.index + m[0].length);
          const rs = faixa.getClientRects();
          let t = Infinity, b = -Infinity;
          for (let i = 0; i < rs.length; i++) if (rs[i].width > 0.5 && rs[i].height > 0.5) { t = Math.min(t, rs[i].top); b = Math.max(b, rs[i].bottom); }
          if (t < b) palavras.push({ no: k, de: m.index, ate: m.index + m[0].length, t: (t - topo) / ky, b: (b - topo) / ky });
        }
      });
      if (!palavras.length) return null;
      const linhas = [];
      palavras.slice().sort((a, b) => a.t - b.t).forEach((p) => {
        const meio = (p.t + p.b) / 2;
        const l = linhas.filter((x) => meio >= x.t && meio <= x.b)[0];
        if (l) { l.t = Math.min(l.t, p.t); l.b = Math.max(l.b, p.b); } else linhas.push({ t: p.t, b: p.b });
      });
      linhas.sort((a, b) => a.t - b.t);
      palavras.forEach((p) => {
        const meio = (p.t + p.b) / 2;
        let melhor = 0;
        linhas.forEach((l, i) => { if (Math.abs((l.t + l.b) / 2 - meio) < Math.abs((linhas[melhor].t + linhas[melhor].b) / 2 - meio)) melhor = i; });
        p.linha = melhor;
      });
      return { linhas, palavras, w: el.clientWidth, h: el.clientHeight };
    }

    function planoDaRevelacao(el) {
      if (el.tagName === 'IMG' || el.querySelector('img')) return null;
      const d = estilo(el).display;
      if (d === 'inline' || d === 'contents' || d === 'none') return null;
      const p = linhasDe(el);
      // Texto longo (mais de 8 linhas) não é título: a reserva (o bloco sobe inteiro) basta.
      return p && p.linhas.length <= 8 && p.w > 0 ? p : null;
    }

    function planoDaConta(el) {
      if (el.tagName === 'IMG' || !/\d/.test(el.textContent || '')) return null;
      const pr = palco.getBoundingClientRect();
      const k = palco.offsetWidth ? pr.width / palco.offsetWidth : 1;
      const p = linhasDe(el);
      return {
        largura: k ? el.getBoundingClientRect().width / k : 0,
        umaLinha: !p || p.linhas.length <= 1,
        inline: estilo(el).display === 'inline',
      };
    }

    function origemNaTela(el) {
      if (estilo(el).transform !== 'none') return null;
      let foco = null;
      for (let i = 0; i < fotos.length; i++) if (fotos[i].el === el) foco = fotos[i].esp && fotos[i].esp.foco;
      return origemDaFoto(ladosCortados(el, peca, estilo), foco);
    }

    /* ---- A revelação por linha ---- */

    // Algum descendente posicionado mudaria de referência se o elemento virasse `position: relative`.
    const temPosicionado = (el) => Array.prototype.some.call(el.querySelectorAll('*'), (d) => /^(absolute|fixed)$/.test(estilo(d).position));
    function segurarCamadas(el) {
      if (estilo(el).position !== 'static') return true;
      if (temPosicionado(el)) return false;
      por(el, 'position', 'relative');
      return true;
    }

    const COPIAR = ['display', 'flex-direction', 'flex-wrap', 'align-items', 'align-content', 'justify-content', 'justify-items',
      'row-gap', 'column-gap', 'grid-template-columns', 'grid-template-rows', 'grid-template-areas', 'grid-auto-flow', 'grid-auto-rows',
      'grid-auto-columns', 'text-align', 'text-align-last', 'text-indent', 'white-space', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left'];
    /*
     * Na cópia da linha `linha`, as palavras das OUTRAS linhas ficam
     * transparentes (um elemento em linha, sem caixa: o desenho não muda).
     * Assim as máscaras podem se sobrepor sem que a cedilha de "Armações"
     * suba junto com a linha de baixo (visto no vídeo do díptico).
     */
    function soAsDaLinha(copia, plano, linha) {
      const nos = textosDoElemento(copia);
      nos.forEach((n, k) => {
        const outras = plano.palavras.filter((p) => p.no === k && p.linha !== linha);
        if (!outras.length) return;
        const texto = n.nodeValue;
        const pedaco = doc.createDocumentFragment();
        let ate = 0;
        outras.forEach((p) => {
          if (p.de > ate) pedaco.appendChild(doc.createTextNode(texto.slice(ate, p.de)));
          const some = doc.createElement('mt-linha');
          some.style.cssText = 'color:transparent;-webkit-text-fill-color:transparent;text-shadow:none';
          some.textContent = texto.slice(p.de, p.ate);
          pedaco.appendChild(some);
          ate = p.ate;
        });
        if (ate < texto.length) pedaco.appendChild(doc.createTextNode(texto.slice(ate)));
        n.parentNode.replaceChild(pedaco, n);
      });
    }

    function revelarPorLinha(el, plano, inicio) {
      if (!segurarCamadas(el)) return 0;
      const cs = estilo(el);
      const t = TEMPO.revelar;
      const L = plano.linhas;
      const n = L.length;
      // Folga em volta de cada linha: acento, descendente e itálico não podem ser cortados. As máscaras se sobrepõem.
      const lado = (parseFloat(cs.fontSize) || 16) * 0.6;
      const folga = (i) => (L[i].b - L[i].t) * 0.2;
      let molde = 'position:absolute;margin:0;border:0;box-sizing:border-box;width:' + plano.w + 'px;height:' + plano.h + 'px;';
      COPIAR.forEach((p) => {
        let v = cs.getPropertyValue(p);
        if (p === 'display' && v === 'list-item') v = 'block';
        if (v) molde += p + ':' + v + ';';
      });
      const camada = doc.createElement('mt-revelar');
      camada.setAttribute('aria-hidden', 'true');
      camada.style.cssText = 'position:absolute;display:block;left:0;top:0;width:100%;height:100%;margin:0;padding:0;border:0;pointer-events:none;visibility:visible';
      let ultima = null;
      for (let i = 0; i < n; i++) {
        const topo = L[i].t - folga(i);
        const base = L[i].b + folga(i);
        const mascara = doc.createElement('mt-linha');
        mascara.style.cssText = 'position:absolute;display:block;overflow:hidden;margin:0;padding:0;left:' + (-lado).toFixed(2) + 'px;width:'
          + (plano.w + 2 * lado).toFixed(2) + 'px;top:' + topo.toFixed(2) + 'px;height:' + Math.max(1, base - topo).toFixed(2) + 'px';
        const sobe = doc.createElement('mt-linha');
        sobe.style.cssText = 'position:absolute;display:block;left:0;top:0;width:100%;height:100%;margin:0;padding:0;animation:mt-px-linha '
          + t.duracao + 's ' + t.curva + ' ' + (Math.round((inicio + i * CINEMA.linha) * 100) / 100) + 's both';
        const copia = doc.createElement('mt-linha');
        copia.style.cssText = molde + 'left:' + lado.toFixed(2) + 'px;top:' + (-topo).toFixed(2) + 'px';
        for (let k = el.firstChild; k; k = k.nextSibling) if (!camadaDoPlayer(k)) copia.appendChild(k.cloneNode(true));
        if (n > 1) soAsDaLinha(copia, plano, i);
        sobe.appendChild(copia);
        mascara.appendChild(sobe);
        camada.appendChild(mascara);
        ultima = sobe;
      }
      el.appendChild(camada);
      por(el, 'visibility', 'hidden');
      let feita = false;
      const terminar = () => {
        if (feita) return;
        feita = true;
        if (camada.parentNode) camada.parentNode.removeChild(camada);
        devolver(el, ['visibility', 'position']);
      };
      ultima.addEventListener('animationend', terminar);
      // Sem o evento (aba escondida, animação cortada), o relógio garante a volta ao original.
      depois(inicio + t.duracao + (n - 1) * CINEMA.linha + 0.6, terminar);
      fins.push(terminar);
      return n;
    }

    /* ---- O número que conta ---- */

    // Os textos do elemento, na ordem. Com `antigos`, o alvo de quem não mudou fica; o que mudou por fora vira alvo novo.
    function textosDe(el, antigos) {
      const out = [];
      const andar = doc.createTreeWalker(el, 4);
      for (let n = andar.nextNode(); n; n = andar.nextNode()) {
        if (camadaDoPlayer(n.parentNode)) continue;
        const velho = antigos ? antigos.filter((x) => x.no === n)[0] : null;
        out.push({ no: n, final: velho && n.nodeValue === velho.escrito ? velho.final : n.nodeValue, escrito: n.nodeValue });
      }
      return out;
    }
    const mudouPorFora = (k) => k.nos.some((x) => x.no.nodeValue !== x.escrito || !k.el.contains(x.no));

    function prepararConta(el, plano, inicio) {
      const k = { el, nos: textosDe(el, null), inicio, pais: [], feita: false };
      if (!k.nos.some((x) => /\d/.test(x.final))) return;
      // Algarismos de largura igual enquanto anda: o número não treme.
      k.nos.forEach((x) => {
        const pai = x.no.parentNode;
        if (!/\d/.test(x.final)) return;
        if (pai && pai.style && k.pais.indexOf(pai) < 0) { k.pais.push(pai); por(pai, 'font-variant-numeric', 'tabular-nums lining-nums', 'important'); }
      });
      // A largura do repouso fica presa: o "0,00" é mais estreito que o "1.299,90" e puxaria o resto da linha.
      if (plano.umaLinha && plano.largura > 0) {
        if (plano.inline) { por(el, 'display', 'inline-block'); por(el, 'text-align', 'right'); }
        por(el, 'width', plano.largura.toFixed(2) + 'px');
        por(el, 'white-space', 'nowrap');
      }
      escreverConta(k, 0);
      contas.push(k);
      depois(inicio + CINEMA.conta + 0.5, () => terminarConta(k));
    }
    function escreverConta(k, e) {
      if (mudouPorFora(k)) k.nos = textosDe(k.el, k.nos);
      const agora = contarPartes(k.nos.map((x) => x.final), e);
      k.nos.forEach((x, i) => {
        if (agora[i] !== x.no.nodeValue) x.no.nodeValue = agora[i];
        x.escrito = agora[i];
      });
    }
    function terminarConta(k) {
      if (k.feita) return;
      k.feita = true;
      if (mudouPorFora(k)) k.nos = textosDe(k.el, k.nos);
      k.nos.forEach((x) => { if (x.no.nodeValue !== x.final) x.no.nodeValue = x.final; });
      k.pais.forEach((p) => devolver(p, ['font-variant-numeric']));
      devolver(k.el, ['display', 'text-align', 'width', 'white-space']);
    }
    /*
     * O número anda num RELÓGIO de 50 ms, e não a cada quadro: um
     * requestAnimationFrame vivo obriga a página a montar um quadro na linha
     * principal a cada 16 ms (estilo, pintura, envio ao compositor), mesmo
     * sem nada mudar — e as entradas, que andam sozinhas no compositor,
     * passavam a disputar a CPU com isso (medido com a CPU 4× mais lenta).
     * O relógio só começa quando o primeiro número começa.
     */
    function agendar() {
      if (andando != null || parada) return;
      const agora = (relogio() - zero) / 1000;
      let proxima = Infinity;
      contas.forEach((k) => { if (!k.feita) proxima = Math.min(proxima, Math.max(k.inicio, agora + CINEMA.passo)); });
      if (proxima < Infinity) andando = setTimeout(andar, Math.max(0, (proxima - agora) * 1000));
    }
    function andar() {
      andando = null;
      if (parada) return;
      const agora = (relogio() - zero) / 1000;
      contas.forEach((k) => {
        if (k.feita) return;
        const q = (agora - k.inicio) / CINEMA.conta;
        if (q >= 1) terminarConta(k);
        // Desacelera no fim (cúbica): o olho lê o valor chegando.
        else if (q > 0) escreverConta(k, 1 - Math.pow(1 - q, 3));
      });
      agendar();
    }

    /* ---- O reflexo ---- */

    function passarLuz(el) {
      if (parada || !el.isConnected) return;
      const img = el.tagName === 'IMG';
      // Na foto, a luz vai ao lado dela, no pai (a foto não tem filhos); no texto, dentro do elemento.
      const dono = img ? el.parentElement : el;
      if (!dono || dono === palco || !segurarCamadas(dono)) return;
      if (img && el.offsetParent !== dono) { devolver(dono, ['position']); return; }
      const luz = doc.createElement('mt-luz');
      luz.setAttribute('aria-hidden', 'true');
      const caixa = img
        ? 'left:' + el.offsetLeft + 'px;top:' + el.offsetTop + 'px;width:' + el.offsetWidth + 'px;height:' + el.offsetHeight + 'px;border-radius:' + estilo(el).borderRadius
        : 'left:0;top:0;width:100%;height:100%;border-radius:inherit';
      luz.style.cssText = 'position:absolute;display:block;overflow:hidden;margin:0;padding:0;border:0;pointer-events:none;visibility:visible;' + caixa;
      const faixa = doc.createElement('mt-luz');
      faixa.style.cssText = 'position:absolute;display:block;left:0;top:0;width:50%;height:100%;margin:0;padding:0;'
        + 'background:linear-gradient(90deg,rgba(255,255,255,0) 0%,rgba(255,255,255,.34) 50%,rgba(255,255,255,0) 100%);'
        + 'animation:mt-pc-reflexo ' + CINEMA.reflexo + 's cubic-bezier(.45,0,.55,1) 0s both';
      luz.appendChild(faixa);
      if (img) dono.insertBefore(luz, el.nextSibling); else dono.appendChild(luz);
      let feita = false;
      const tirar = () => {
        if (feita) return;
        feita = true;
        if (luz.parentNode) luz.parentNode.removeChild(luz);
        devolver(dono, ['position']);
      };
      faixa.addEventListener('animationend', tirar);
      depois(CINEMA.reflexo + 0.4, tirar);
      fins.push(tirar);
    }

    /* ---- Começar, terminar ---- */

    /*
     * Chamado no primeiro quadro com a peça na tela (o ResizeObserver de
     * montar). Devolve true quando já começou (ou não há o que fazer).
     */
    function iniciar() {
      if (iniciada || parada) return true;
      if (!els.length) { iniciada = true; return true; }
      if (!host.isConnected || !host.clientWidth || !host.clientHeight) return false;
      iniciada = true;
      const seg = espera();
      if (modo !== 'completo') { aplicar(seg); return true; }
      // Medir em repouso: sem as entradas no meio do caminho (elas recomeçam juntas daqui, que é o instante zero).
      const parar = doc.createElement('style');
      parar.textContent = '.mt-palco,.mt-palco *{animation:none!important;transition:none!important}';
      sombra.appendChild(parar);
      try {
        els.forEach((el) => {
          const a = atributos(el);
          const m = {};
          medidas.set(el, m);
          if (!el.getClientRects().length) return;
          if (a.entrada === 'desenhar' && !ORIGEM_CSS[a.origem]) m.vertical = el.offsetHeight > el.offsetWidth;
          if (a.entrada === 'revelar') m.planoLinhas = planoDaRevelacao(el);
          if (a.entrada === 'contar') m.planoConta = planoDaConta(el);
          if (a.continua === 'kenburns' || (a.entrada === 'aproximar' && el.tagName === 'IMG')) m.origemFoto = origemNaTela(el);
        });
      } finally {
        sombra.removeChild(parar);
      }
      zero = relogio();
      els.forEach((el) => {
        const a = atributos(el);
        const m = medidas.get(el);
        const inicio = animacaoDoElemento(a, modo, seg, null).inicio;
        if (m.origemFoto) el.style.transformOrigin = pct(m.origemFoto.x) + ' ' + pct(m.origemFoto.y);
        if (a.continua === 'kenburns' && m.origemFoto) m.kenburns = { duracao: duracaoDaPeca() };
        if (m.planoLinhas) m.linhas = revelarPorLinha(el, m.planoLinhas, inicio);
      });
      aplicar(seg);
      els.forEach((el) => {
        const a = atributos(el);
        const m = medidas.get(el);
        const r = animacaoDoElemento(a, modo, seg, m);
        if (m.planoConta) prepararConta(el, m.planoConta, r.inicio);
        if (a.continua === 'reflexo') depois(r.entrada ? r.fim + CINEMA.folgaReflexo : r.inicio + 0.5, () => passarLuz(el));
      });
      agendar();
      return true;
    }

    // Tudo no repouso, já: o conferidor da bancada (js/peca-conferir.js) mede logo depois de adiantar as animações.
    function repousar() {
      contas.forEach(terminarConta);
      fins.slice().forEach((f) => f());
    }
    host.addEventListener('mt:repouso', repousar);

    return {
      aplicar,
      iniciar,
      parar() {
        parada = true;
        if (andando != null) clearTimeout(andando);
        andando = null;
        relogios.forEach(clearTimeout);
        relogios.length = 0;
        repousar();
        host.removeEventListener('mt:repouso', repousar);
        sombra.removeEventListener('animationend', aoFimDaEntrada);
      },
    };
  }

  function montar(host, item, opts) {
    const o = opts || {};
    garantirFontes(host.ownerDocument);
    const v = P.validarItem(item, { hostsMidia: o.hostsMidia });
    const it = v.item;
    const modo = o.rascunho ? 'rascunho' : it.modo;
    const tokens = T.daMarca(it.marca || o.marca || null, modo);

    const sombra = host.shadowRoot || host.attachShadow({ mode: 'open' });
    // FOTO VIVA: com vídeo num espaço de foto, o CSS que mira `img` vale também para o <video> (cssComVideo).
    if (!o.rascunho && !o.leve && Object.keys(it.campos).some((k) => P.ehVideo(it.campos[k], o.hostsMidia))) it.css = cssComVideo(it.css);
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
    // As fotos de campo (não a logo nem o QR): cada uma encaixa no seu espaço (encaixarFoto), de novo a cada medida nova.
    const fotos = [];
    const encaixarFotos = () => fotos.forEach((f) => encaixarFoto(f.el, f.esp));
    // O jeito de mexer (ver movimentoDe): quem pediu menos movimento ao sistema ganha o esmaecer simples.
    const movimento = movimentoDe(o, pedeMenosMovimento(host.ownerDocument && host.ownerDocument.defaultView));
    let coreo = null;
    // A coreografia começa no primeiro quadro em que a peça tem tamanho na tela (depois do piso e das fotos).
    const naTela = () => (coreo ? coreo.iniciar() : false);
    enquadrar(host, palcoEl);
    // A zona muda de tamanho (layout que "respira", tela girada): enquadra de novo.
    let observador = null;
    let espera = null;
    let aoRedimensionar = null;
    let esperaTela = null;
    if (typeof ResizeObserver !== 'undefined') {
      observador = new ResizeObserver(() => { enquadrar(host, palcoEl); remedir(); encaixarFotos(); naTela(); });
      observador.observe(host);
    } else if (semCq) {
      // Chromium < 64: sem ResizeObserver. Confere até a zona ter tamanho, e a cada giro da janela.
      let tentativas = 0;
      const conferir = () => { espera = null; enquadrar(host, palcoEl); if (!remedir() && ++tentativas < 40) espera = setTimeout(conferir, 250); else encaixarFotos(); };
      if (!remedir()) espera = setTimeout(conferir, 50);
      aoRedimensionar = () => { enquadrar(host, palcoEl); remedir(); encaixarFotos(); };
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
    if (peca) esconderPrecoIncompleto(sombra, peca);
    const videos = [];
    sombra.querySelectorAll('img[data-campo-img],img[data-campo-qr]').forEach((el) => {
      const qr = el.hasAttribute('data-campo-qr');
      const campo = el.getAttribute(qr ? 'data-campo-qr' : 'data-campo-img');
      let valor = campo === 'logo' && !qr ? logoDaPeca(it.campos.logo, o.logo, tokens) : it.campos[campo];
      let esp = (it.espacos || {})[campo] || {};
      // O espaço de foto vazio leva a foto padrão do papel e do ramo (fotoPadrao): nada de meia peça vazia.
      const padrao = !qr && campo !== 'logo' && !o.rascunho && !valor ? fotoPadrao(esp.papel, o.ramo, o.frente) : null;
      if (padrao) {
        valor = padrao.arquivo;
        esp = Object.assign({}, esp, { foco: esp.foco || padrao.foco });
        el.setAttribute('data-foto-padrao', '');
      }
      const foto = !qr && campo !== 'logo' && !o.rascunho && !!valor ? { el, esp } : null;
      // FOTO VIVA (ver videoNoLugar): o poster no modo leve; o vídeo no resto.
      const poster = foto ? P.posterDoVideo(valor, foto.esp, o.hostsMidia) : '';
      // Foto que não carrega some, em vez do ícone de imagem quebrada na parede.
      el.onerror = () => { el.setAttribute('data-sem-foto', ''); if (foto) encaixarFoto(el, foto.esp); };
      if (o.rascunho && !qr) el.src = silhueta(tokens);
      else if (poster && o.leve) { el.setAttribute('data-foto-viva', 'poster'); el.src = poster; }
      else if (poster) {
        foto.el = videoNoLugar(el, valor, poster, (img) => { foto.el = img; encaixarFoto(img, foto.esp); });
        videos.push(foto.el);
        foto.el.addEventListener('loadedmetadata', () => encaixarFoto(foto.el, foto.esp));
        el.addEventListener('load', () => encaixarFoto(el, foto.esp));
      } else if (valor) {
        // O QR é desenhado pelo nosso servidor a partir do texto: nada vem de fora.
        el.src = qr ? '/api/qr.svg?d=' + encodeURIComponent(valor) : valor;
      } else el.setAttribute('data-sem-foto', '');
      if (foto) {
        fotos.push(foto);
        if (!poster || o.leve) el.addEventListener('load', () => encaixarFoto(el, foto.esp));
        encaixarFoto(foto.el, foto.esp);
      }
    });

    // Campos vivos.
    const agora = o.agora || (() => new Date());
    const vivos = Array.from(sombra.querySelectorAll('[data-vivo]'));
    const tick = () => vivos.forEach((el) => {
      const nome = el.getAttribute('data-vivo');
      if (nome === 'relogio') el.textContent = vivo(nome, agora());
      else if (nome === 'data') {
        // As duas formas ficam no elemento: a curta entra quando a longa não cabe (semCorte), e fica até a próxima medida.
        const longa = vivo('data', agora()), curta = vivo('data-curta', agora());
        el.setAttribute('data-mt-longa', longa);
        el.setAttribute('data-mt-curta', curta);
        el.textContent = el.hasAttribute('data-mt-curta-usada') ? curta : longa;
      } else if (nome === 'contagem') el.textContent = contagem(o.contagem, agora());
    });
    tick();
    // Com os textos no lugar, o piso da régua confere de novo (a peça pode ter ganho texto agora).
    enquadrar(host, palcoEl);
    encaixarFotos();
    /*
     * E quando a fonte da marca chega: medida com a fonte de reserva (mais
     * larga), o piso cedia sem precisar. O fonts.ready sozinho não basta: a
     * fonte do título só começa a baixar quando a peça já está montada, e o
     * ready pode resolver antes disso. Então também a cada fonte que termina
     * de chegar (loadingdone), enquanto a peça está na tela.
     */
    const fontes = host.ownerDocument && host.ownerDocument.fonts;
    const aoChegarFonte = () => { if (host.isConnected !== false) { enquadrar(host, palcoEl); encaixarFotos(); } };
    if (fontes && fontes.ready && typeof fontes.ready.then === 'function') fontes.ready.then(aoChegarFonte).catch(() => {});
    if (fontes && typeof fontes.addEventListener === 'function') fontes.addEventListener('loadingdone', aoChegarFonte);
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
      if (movimento === 'completo') el.style.animation = 'mt-pr-rolar ' + Math.max(12, linha.length * RITMO.rolagem).toFixed(1) + 's linear infinite';
    });
    /*
     * O CLIMA NUNCA É INVENTADO (QA de lançamento, 03/11). O "27°" é o texto
     * de exemplo do molde; com o serviço de clima fora do ar (firewall de
     * empresa, TV sem internet), ele ficava na parede como se fosse a
     * temperatura de agora. Quem desenha na TV (`o.clima`) esconde o campo
     * até a temperatura chegar, e, se ela não chegar, deixa vazio — o relógio
     * e a cidade seguem. Sem `o.clima` (editor, bancada), o exemplo fica.
     */
    const clima = vivos.filter((el) => el.getAttribute('data-vivo') === 'clima');
    if (clima.length && o.clima) {
      clima.forEach((el) => { el.style.visibility = 'hidden'; });
      Promise.resolve().then(o.clima).then((t) => {
        clima.forEach((el) => { el.textContent = t || ''; el.style.visibility = t ? '' : 'hidden'; });
      }, () => { clima.forEach((el) => { el.textContent = ''; }); });
    }

    /*
     * A entrada que a peça declarou (a coreografia, logo acima). Já aqui,
     * antes de a peça ir para a tela, cada elemento ganha a entrada de CSS:
     * o primeiro quadro sai com tudo no começo, e o que precisa de medida
     * (as linhas, o número, a foto) entra no primeiro quadro com tamanho.
     */
    coreo = coreografia({ host, sombra, peca, palco: palcoEl, fotos, movimento, duracao: Number(item && item.duracao) || 12 });
    coreo.aplicar(0);
    // Sem ResizeObserver (Chromium < 64): espera a peça ter tamanho, quadro a quadro, por até 10 s.
    if (!observador && movimento !== 'parado') {
      let vezes = 0;
      const conferir = () => { esperaTela = null; if (!naTela() && ++vezes < 600) esperaTela = setTimeout(conferir, 16); };
      esperaTela = setTimeout(conferir, 0);
    }

    return {
      peca,
      tokens,
      problemas: v.problemas,
      duracao: Number(item && item.duracao) || 12,
      parar() {
        if (coreo) coreo.parar();
        if (esperaTela) clearTimeout(esperaTela); esperaTela = null;
        if (relogio) clearInterval(relogio); relogio = null;
        videos.forEach(soltarVideo); videos.length = 0;
        if (observador) observador.disconnect(); observador = null;
        if (espera) clearTimeout(espera); espera = null;
        if (aoRedimensionar && typeof window !== 'undefined') window.removeEventListener('resize', aoRedimensionar);
        aoRedimensionar = null;
        if (fontes && typeof fontes.removeEventListener === 'function') fontes.removeEventListener('loadingdone', aoChegarFonte);
      },
    };
  }

  return {
    ENTRADAS, CONTINUAS, ROLAR, SEPARADOR, RITMO, BASE, cssCompleto, cssDosTokens, keyframes, vivo, contagem, montar, enquadrar, QUADRADA, LARGA,
    // A foto padrão do espaço vazio (o teste confere que cada uma está no banco) e o passo que não deixa texto cortado.
    fotoPadrao, FOTOS_PADRAO, FOTO_GERAL, semCorte,
    // O movimento de cinema: as partes puras (o teste), e as keyframes que só o player usa.
    DO_PLAYER, TEMPO, CINEMA, movimentoDe, animacaoDoElemento, contarTexto, contarPartes, origemDaFoto,
    // Os espaços de imagem: a decisão (pura), a miniatura do fundo e o encaixe no <img> (o painel usa os três).
    encaixeDaFoto, miniaturaDaFoto, encaixarFoto, AMPLIACAO_MAXIMA,
    // FOTO VIVA: o CSS da peça que vale também para o <video> do espaço, e a troca do <img> pelo <video>.
    cssComVideo, videoNoLugar,
    BASE_SEM_CQ, cssSemCq, cssCompletoSemCq, condicaoCq, temContainerQueries, referencia,
  };
});
