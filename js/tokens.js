/*
 * js/tokens.js — as cores, fontes e cantos que uma peça-html pode usar.
 *
 * A peça em HTML (docs/PLANO.md §4) não escreve hex: escreve
 * `var(--mt-destaque)`. Quem decide o que cada nome vale é este arquivo, a
 * partir da cor da marca e do modo. É isso que faz trocar de marca ou de modo
 * reestilizar a peça sem gerar de novo — e é o que hoje não acontece, porque
 * a peça carrega os hex que a IA escolheu no dia em que foi feita.
 *
 * Um conjunto PEQUENO e com FUNÇÃO. "Destaque" diz para que a cor serve;
 * "azul-2" não diz. Com nome de função, a IA não tem como errar a combinação:
 * ela não escolhe que cor vai sobre qual, escolhe o papel — e o contrato
 * abaixo garante que todo par permitido se lê.
 *
 * QUATRO MODOS, todos derivados da mesma marca:
 *
 *   claro     fundo quase branco, levemente tingido pela marca
 *   escuro    fundo quase preto, levemente tingido pela marca
 *   marca     fundo CHAPADO na cor exata da marca — o efeito cartaz
 *   rascunho  cinzas neutros, independentes da marca: é o wireframe que o
 *             cliente aprova antes de gerar (PLANO §4.10). Não é outra peça,
 *             é outro jogo de tokens — por isso custa zero.
 *
 * A matemática de cor continua morando em js/cor.js, uma vez só. Aqui mora a
 * POLÍTICA: que luminosidade cada papel tem em cada modo, e que contraste
 * cada par precisa.
 *
 * Módulo duplo, como js/animacao.js: `require()` no Node, `MTTokens` no
 * navegador (depois de js/cor.js e js/fontes.js).
 */
(function (raiz, fabrica) {
  /*
   * `typeof require` também, e não só `module`: o empacotador do painel cria
   * um `module` sem `require` (ver js/modelos.js). Lá, cor e fontes já estão
   * no global porque foram importados antes.
   */
  var node = typeof module === 'object' && module.exports && typeof require === 'function';
  var api = fabrica(node ? require('./cor.js') : raiz.MTCor, node ? require('./fontes.js') : raiz.MTFontes);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (raiz) raiz.MTTokens = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (C, F) {
  'use strict';

  const MODOS = ['claro', 'escuro', 'marca', 'rascunho'];
  const MODO_PADRAO = 'escuro';
  // A mesma cor de reserva do gerador de peças (server/design-system.js).
  const MARCA_PADRAO = '#1e3a8a';

  // O nome de cada token no CSS. A peça só conhece o lado direito.
  const NOMES = {
    fundo: '--mt-fundo',
    fundo0: '--mt-fundo-0',
    fundo2: '--mt-fundo-2',
    superficie: '--mt-superficie',
    texto: '--mt-texto',
    textoSuave: '--mt-texto-suave',
    destaque: '--mt-destaque',
    sobreDestaque: '--mt-sobre-destaque',
    preco: '--mt-preco',
    linha: '--mt-linha',
    fonteTitulo: '--mt-fonte-titulo',
    fonteTexto: '--mt-fonte-texto',
    raio: '--mt-raio',
    escalaTitulo: '--mt-escala-titulo',
  };

  /*
   * --mt-escala-titulo: quanto o título GRANDE encolhe para ocupar a mesma
   * largura que ocuparia na fonte condensada, a referência das peças-ouro.
   *
   * As peças foram desenhadas em Oswald/Anton (estreitas). Com a fonte de
   * outra marca — Playfair, Poppins, Archivo Black — o mesmo "30% OFF" ficava
   * até 40% mais largo, quebrava em duas linhas e empurrava o resto (a
   * varredura de 20/10 achou 9 peças assim). Nunca passa de 1: fonte estreita
   * não ganha título maior que o desenhado. Uso: calc(… * var(--mt-escala-titulo, 1)).
   */
  const LARGURA_REFERENCIA = 0.455; // Oswald em caixa alta (js/fontes.js, CAIXA_ALTA)

  /*
   * Cantos em `cqmin`: medida do container, como tudo na peça. Em pixel, o
   * mesmo canto seria sutil na TV e uma bolha na miniatura.
   */
  const RAIOS = { reto: '0', suave: '1.2cqmin', redondo: '3cqmin' };
  const RAIO_PADRAO = 'suave';

  /*
   * O CONTRATO: todo par que uma peça pode montar, e o contraste mínimo dele.
   *
   * Os três fundos (fundo, fundo-2, superfície) aceitam os mesmos textos — a
   * peça põe um cartão sobre o fundo e escreve dentro dele sem pensar em cor.
   *
   * 4.5 é o AA do WCAG para texto, e vale para todo par — o destaque
   * também. Ele ficava em 3 (o AA para texto grande e elementos gráficos),
   * mas na peça ele é texto quase sempre: o kicker, o @ das redes, a
   * chamada do cabeçalho, o título do quiz. O reteste da TV (fase 10) mediu
   * esses textos entre 2,5 e 3,5 contra o fundo, e a régua do QA pede 4,5
   * em todo texto (docs/qa-total/REFERENCIAS.md). Uma cor só para forma e
   * outra para texto não resolveria as peças já feitas pela IA, que usam
   * o destaque nos dois.
   *
   * AA é o piso, não a meta: nos modos claro e escuro o texto passa de 12:1.
   */
  const FUNDOS = ['fundo', 'fundo2', 'superficie'];
  const MIN_TEXTO = 4.5;
  const PARES = []
    .concat(FUNDOS.map((f) => ({ frente: 'texto', fundo: f, minimo: 4.5 })))
    .concat(FUNDOS.map((f) => ({ frente: 'textoSuave', fundo: f, minimo: 4.5 })))
    .concat(FUNDOS.map((f) => ({ frente: 'preco', fundo: f, minimo: 4.5 })))
    .concat(FUNDOS.map((f) => ({ frente: 'destaque', fundo: f, minimo: MIN_TEXTO })))
    .concat([{ frente: 'sobreDestaque', fundo: 'destaque', minimo: 4.5 }]);

  const ok = (cor, fundos, minimo) => fundos.every((f) => C.contraste(cor, f) >= minimo);

  /*
   * Leva uma cor até ela se ler sobre todos os fundos, mexendo só na
   * luminosidade (matiz e croma ficam). A conta mora em js/cor.js, porque o
   * tema da TV usa a mesma para o acento.
   */
  const garantir = C.garantirContraste;

  /*
   * A POLÍTICA DE COR (lote de 06/11). O dono achou a TV "meio feia e
   * infantil", e os tons pastel não funcionavam em todo caso. A folha de
   * contato das 11 marcas de exemplo e de 11 logos difíceis mostrou onde:
   * o fundo claro era um tom LAVADO da marca (rosa-bebê, pêssego, menta), o
   * modo "marca" pintava a peça inteira com a cor exata — o amarelo-claro e
   * o rosa-pastel viravam cartaz de festa infantil, o vermelho puro pedia
   * texto marrom —, e o acento escolhia a cor que menos precisava de ajuste
   * mesmo quando ela era um quase-branco (o "#e0f2f1" da clínica virava o
   * destaque do escuro). As regras agora:
   *
   *   1. A BASE é escura (tinta, carvão ou um tom PROFUNDO da marca) ou um
   *      neutro quente ou frio (off-white, pedra). Nunca um tom lavado.
   *   2. UM acento forte, saído da marca, levado em OKLCH a uma faixa de
   *      luminosidade e a um croma mínimo em que ele é COR — nem pastel,
   *      nem tinta — e a 4,5 sobre a base.
   *   3. Cor clara (pastel, neon, amarelo) nunca é fundo: vira o acento
   *      sobre uma base escura.
   *   4. Quase-branco, quase-preto e cinza não são acento, a não ser que a
   *      marca seja só isso (monocromática).
   *
   * Os três modos com cor são os três CLIMAS que o dono escolhe na Marca
   * (js/paletas.js, CLIMAS): escuro = "Escuro elegante", claro = "Claro
   * limpo", marca = "Cor da marca forte".
   */
  const NEUTRA = 0.035;          // croma abaixo disso é cinza
  const C_ACENTO = [0.12, 0.22]; // croma do acento: abaixo é apagado; acima vibra na TV
  // A faixa de luminosidade em que o acento é cor, em cada base.
  const FAIXA = { escuro: [0.66, 0.84], claro: [0.3, 0.56], marca: [0.74, 0.9] };

  const entre = (x, a, b) => Math.max(a, Math.min(b, x));
  // É cor de verdade? Cinza, quase-branco tingido e quase-preto não são.
  const ehCor = (o) => !!o && o.c >= NEUTRA && o.l > 0.12 && !(o.l > 0.93 && o.c < 0.06);
  // A faixa dos amarelos: escurecidos na mesma matiz, viram oliva (js/cor.js, matizAoEscurecer).
  const amarela = (o) => o.h >= 80 && o.h <= 118;

  // As cores da marca, lidas uma vez: { hex, o, i } na ordem da Marca, sem repetir.
  function lerCores(lista) {
    const out = [];
    lista.forEach((h, i) => {
      const hex = C.okHex(h, null);
      if (hex && !out.some((x) => x.hex === hex)) out.push({ hex, o: C.paraOklch(hex), i });
    });
    return out;
  }

  /*
   * Quem pode ser acento: as cores de verdade entre a principal e a segunda
   * (a "cor de ação" da Marca); se as duas são neutras (logo preto e branco
   * com um detalhe vermelho), a primeira cor de verdade que vier depois.
   */
  function candidatas(cores) {
    const comCor = cores.filter((x) => ehCor(x.o));
    const primeiras = comCor.filter((x) => x.i < 2);
    return primeiras.length ? primeiras : comCor.slice(0, 1);
  }

  /*
   * Das candidatas, a que já está mais perto da faixa do acento: a que muda
   * menos para virar cor nesta base — no escuro, o dourado da ótica; no
   * claro, o marinho. Empate fica com a principal.
   */
  function maisPerto(cands, faixa) {
    const longe = (o) => (o.l < faixa[0] ? faixa[0] - o.l : o.l > faixa[1] ? o.l - faixa[1] : 0);
    return cands.reduce((m, x) => (longe(x.o) < longe(m.o) - 1e-9 ? x : m), cands[0]);
  }

  /*
   * O acento VIVO: a cor da marca na faixa de luminosidade do clima, com
   * croma mínimo, e a 4,5 sobre todos os fundos. A matiz fica (o amarelo
   * escurecendo puxa para o âmbar, nunca para o oliva). A cor que já está
   * na faixa, com croma e contraste, entra intacta.
   */
  function acentoVivo(x, fundos, faixa) {
    const o = x.o;
    if (!ehCor(o)) return garantir(x.hex, fundos, MIN_TEXTO);
    if (o.l >= faixa[0] && o.l <= faixa[1] && o.c >= C_ACENTO[0] && ok(x.hex, fundos, MIN_TEXTO)) return x.hex;
    // O pastel pede mais croma que o resto: a 0,11 o rosa-bebê ainda é rosa-bebê.
    const c = entre(o.c, o.l > 0.8 ? C_ACENTO[0] + 0.03 : C_ACENTO[0], C_ACENTO[1]);
    const cor = (L) => C.deOklch(L, c, L < o.l ? C.matizAoEscurecer(o, L) : o.h);
    /*
     * Perto do branco a tela não tem croma (o rosa a 0,87 não passa de 0,08
     * em sRGB): o pastel continuaria pastel. Desce dentro da faixa até a cor
     * caber com o croma pedido.
     */
    const croma = (L) => C.paraOklch(cor(L)).c;
    let L0 = entre(o.l, faixa[0], faixa[1]);
    while (L0 - 0.01 >= faixa[0] && croma(L0) < c * 0.9 && croma(L0 - 0.01) > croma(L0) + 1e-4) L0 -= 0.01;
    const media = fundos.reduce((s, f) => s + C.luminancia(f), 0) / fundos.length;
    // Primeiro para longe dos fundos (sobe na base escura); o outro sentido é o desempate.
    const longe = media < 0.2 ? 1 : -1;
    for (let i = 0; i <= 100; i++) {
      for (const s of i ? [longe, -longe] : [0]) {
        const L = L0 + s * i * 0.01;
        if (L < 0 || L > 1) continue;
        const k = cor(L);
        if (ok(k, fundos, MIN_TEXTO)) return k;
      }
    }
    return garantir(cor(L0), fundos, MIN_TEXTO);
  }

  /*
   * A matiz e o croma que tingem as bases: os da principal. Principal sem
   * cor (preto, branco, cinza) dá bases neutras. Na faixa dos amarelos a
   * base escura viraria oliva: vai para o quente (60°).
   */
  function tintaDa(cores) {
    const p = cores[0];
    if (!p || !ehCor(p.o)) return { h: 0, c: 0 };
    return amarela(p.o) ? { h: 60, c: Math.min(p.o.c, 0.06) } : { h: p.o.h, c: p.o.c };
  }

  /*
   * Texto que vai em cima do destaque: o quase-branco ou o quase-preto da
   * marca, o que se ler melhor. Destaque sem cor (o cinza do rascunho) ganha
   * texto sem cor — senão a matiz 0 do cinza tingiria o texto de vermelho.
   */
  function sobre(fundo) {
    const o = C.paraOklch(fundo);
    const neutro = o.c < 0.02;
    const claro = C.deOklch(0.985, neutro ? 0 : 0.01, o.h);
    const escuro = C.deOklch(0.18, neutro ? 0 : 0.03, o.h);
    const melhor = C.contraste(claro, fundo) >= C.contraste(escuro, fundo) ? claro : escuro;
    return garantir(melhor, [fundo], 4.5);
  }

  /*
   * Preço: o destaque, que já se lê como texto (4.5 desde a fase 10). O
   * token fica separado porque as peças já o usam, e para o preço continuar
   * em 4.5 se um dia o destaque mudar de regra.
   */
  function preco(destaque, fundos) {
    return garantir(destaque, fundos, 4.5);
  }

  // Filete e divisor: decoração, não texto. Um sopro do texto sobre o fundo.
  const linha = (fundo, texto) => C.mix(fundo, texto, 0.18);

  /*
   * Croma do tingimento: proporcional ao da marca, com teto. Uma marca
   * cinza dá fundos cinza; uma marca saturada dá fundos com um TOQUE dela —
   * fundo saturado cansa a vista e briga com a foto.
   */
  const tinta = (t, fator, teto) => Math.min(t.c * fator, teto);

  // O acento de um clima: a candidata mais perto da faixa, viva; sem candidata (monocromática), a principal legível.
  function acentoDoClima(cores, fundos, faixa) {
    const cands = candidatas(cores);
    if (cands.length) return acentoVivo(maisPerto(cands, faixa), fundos, faixa);
    return garantir(cores[0].hex, fundos, MIN_TEXTO);
  }

  /*
   * ESCURO ELEGANTE: tinta quase preta com um sopro da matiz da marca (o
   * marinho da ótica, o vinho da cantina) e o acento claro e vivo.
   */
  function modoEscuro(cores) {
    const t = tintaDa(cores);
    const fundo = C.deOklch(0.2, tinta(t, 0.18, 0.035), t.h);
    const fundo2 = C.deOklch(0.255, tinta(t, 0.25, 0.045), t.h);
    const superficie = C.deOklch(0.3, tinta(t, 0.28, 0.05), t.h);
    const fundos = [fundo, fundo2, superficie];
    const texto = garantir(C.deOklch(0.97, tinta(t, 0.08, 0.015), t.h), fundos, 4.5);
    const textoSuave = garantir(C.deOklch(0.8, tinta(t, 0.1, 0.02), t.h), fundos, 4.5);
    const destaque = acentoDoClima(cores, fundos, FAIXA.escuro);
    return { fundo, fundo2, superficie, texto, textoSuave, destaque };
  }

  /*
   * CLARO LIMPO: um neutro de verdade — off-white e pedra quentes para a
   * marca quente (vermelho, laranja, marrom, rosa, roxo), frios para a fria
   * (verde, azul-petróleo, azul). Não é mais um tom lavado da marca: o
   * rosa-bebê e o pêssego do fundo eram o "infantil". A marca fica no texto
   * (tinta com um sopro dela) e no acento, escuro e saturado.
   */
  function modoClaro(cores) {
    const t = tintaDa(cores);
    const fria = t.c > 0 && t.h >= 140 && t.h <= 290;
    // Marca monocromática: papel levemente quente (cinza puro parece o rascunho).
    const hn = fria ? 250 : 75;
    const cn = fria ? 0.006 : 0.008;
    const fundo = C.deOklch(0.975, cn, hn);
    const fundo2 = C.deOklch(0.93, cn * 1.4, hn);
    // Cartão mais claro que o fundo: é o "papel" sobre a mesa.
    const superficie = C.deOklch(0.995, cn * 0.4, hn);
    const fundos = [fundo, fundo2, superficie];
    const texto = garantir(C.deOklch(0.22, tinta(t, 0.25, 0.035), t.h), fundos, 4.5);
    const textoSuave = garantir(C.deOklch(0.45, tinta(t, 0.15, 0.025), t.h), fundos, 4.5);
    const destaque = acentoDoClima(cores, fundos, FAIXA.claro);
    return { fundo, fundo2, superficie, texto, textoSuave, destaque };
  }

  /*
   * COR DA MARCA FORTE: a tela é a cor da marca, num tom PROFUNDO (L entre
   * 0,24 e 0,42) — o efeito cartaz, sem o cartaz de festa. Antes era a cor
   * exata: no meio-tom (vermelho, rosa, laranja) só um quase-branco se lia
   * como acento, e a cor clara pintava a peça inteira de pastel. No tom
   * profundo, o texto claro e um acento vivo se leem.
   *
   * A base é a primeira cor (das duas da Marca) que aguenta ser fundo; cor
   * clara não aguenta — ela vira o acento, e a base sai de um tom profundo
   * da matiz dela (amarelo vai para o chocolate, não para o oliva). O
   * acento é a outra cor; sem outra, a própria marca em tom claro e vivo
   * (azul-claro sobre azul-profundo): cartaz monocromático, que não erra a
   * combinação. Inventar uma complementar seria decidir a identidade pela
   * empresa. Marca só preta ou só branca: tinta preta, acento branco.
   *
   * Fundo-2 e superfície se afastam do texto (mais escuros): o cartão sobre
   * o fundo só ganha contraste.
   */
  function modoForte(cores) {
    const comCor = cores.filter((x) => ehCor(x.o));
    const podeSerBase = (x) => x.i < 2 && x.o.l <= 0.72 && !(amarela(x.o) && x.o.l > 0.55);
    const base = comCor.find(podeSerBase) || null;
    let h = 0, c = 0, L = 0.17;
    if (base) {
      h = base.o.h; c = entre(base.o.c, 0.07, 0.2); L = entre(base.o.l, 0.24, 0.42);
    } else if (comCor.length) {
      h = amarela(comCor[0].o) ? 55 : comCor[0].o.h; c = entre(comCor[0].o.c * 1.3, 0.08, 0.14); L = 0.3;
    }
    const fundo = C.deOklch(L, c, h);
    const fundo2 = C.deOklch(L - 0.045, c * 0.9, h);
    const superficie = C.deOklch(L - 0.085, c * 0.8, h);
    const fundos = [fundo, fundo2, superficie];
    const texto = garantir(c ? C.deOklch(0.975, 0.012, 80) : C.deOklch(0.975, 0, 0), fundos, 4.5);
    const textoSuave = garantir(C.mix(texto, fundo, 0.22), fundos, 4.5);
    const outras = comCor.filter((x) => x !== base);
    let destaque;
    if (outras.length) destaque = acentoVivo(outras[0], fundos, FAIXA.marca);
    else if (c) {
      const hex = C.deOklch(0.8, Math.max(c, 0.14), h);
      destaque = acentoVivo({ hex, o: C.paraOklch(hex) }, fundos, FAIXA.marca);
    } else destaque = garantir('#ffffff', fundos, MIN_TEXTO);
    return { fundo, fundo2, superficie, texto, textoSuave, destaque };
  }

  /*
   * Rascunho: o wireframe. Cinzas neutros, IGUAIS para toda marca — o que o
   * cliente aprova aqui é estrutura e texto, e a cor da marca na tela de
   * aprovação faria a conversa virar sobre cor.
   */
  function modoRascunho() {
    const g = (L) => C.deOklch(L, 0, 0);
    const fundo = g(0.93);
    const fundo2 = g(0.89);
    const superficie = g(0.975);
    const fundos = [fundo, fundo2, superficie];
    return {
      fundo, fundo2, superficie,
      texto: garantir(g(0.3), fundos, 4.5),
      textoSuave: garantir(g(0.46), fundos, 4.5),
      destaque: garantir(g(0.45), fundos, MIN_TEXTO),
    };
  }

  /*
   * Gera os tokens de um modo.
   *
   *   marca        cor principal (hex). Inválida ou ausente: a de reserva.
   *   marca2       segunda cor, opcional — candidata a destaque
   *   cores        todas as cores da Marca, opcional (o logo de seis cores):
   *                quando as duas primeiras são neutras, o acento sai daqui
   *   modo         'claro' | 'escuro' | 'marca' | 'rascunho'
   *   fonteTitulo  id de js/fontes.js; desconhecido cai na família padrão
   *   fonteTexto   idem
   *   raio         'reto' | 'suave' | 'redondo'
   */
  function gerar(opts) {
    const p = opts || {};
    const marca = C.okHex(p.marca, MARCA_PADRAO);
    const marca2 = C.okHex(p.marca2, null);
    const modo = MODOS.indexOf(p.modo) >= 0 ? p.modo : MODO_PADRAO;
    const resto = Array.isArray(p.cores) ? p.cores.slice(2) : [];
    const cores = lerCores([marca, marca2].concat(resto));

    const base = modo === 'claro' ? modoClaro(cores)
      : modo === 'marca' ? modoForte(cores)
        : modo === 'rascunho' ? modoRascunho()
          : modoEscuro(cores);
    const fundos = [base.fundo, base.fundo2, base.superficie];

    const familia = (id) => F.FAMILIAS[F.familia(id)].css;
    const largura = F.FAMILIAS[F.familia(p.fonteTitulo)].larguraCaixaAlta || LARGURA_REFERENCIA;
    return {
      escalaTitulo: Math.round(Math.min(1, LARGURA_REFERENCIA / largura) * 1000) / 1000,
      modo,
      marca,
      cores: {
        fundo: base.fundo,
        fundo2: base.fundo2,
        superficie: base.superficie,
        texto: base.texto,
        textoSuave: base.textoSuave,
        destaque: base.destaque,
        sobreDestaque: sobre(base.destaque),
        preco: preco(base.destaque, fundos),
        linha: linha(base.fundo, base.texto),
      },
      fontes: { titulo: familia(p.fonteTitulo), texto: familia(p.fonteTexto) },
      raio: RAIOS[p.raio] || RAIOS[RAIO_PADRAO],
    };
  }

  /*
   * A partir da Marca como ela é guardada (`cores`, `fonteTitulo`,
   * `fonteApoio`). Um lugar só que conhece esses nomes: se a Marca mudar de
   * formato, muda aqui e não em cada peça.
   */
  function daMarca(m, modo, raio) {
    const marca = m || {};
    const cores = Array.isArray(marca.cores) ? marca.cores : [];
    return gerar({
      marca: cores[0], marca2: cores[1], cores, modo, raio,
      fonteTitulo: marca.fonteTitulo, fonteTexto: marca.fonteApoio,
    });
  }

  // As variáveis CSS prontas: { '--mt-fundo': '#…', … }.
  function variaveis(t) {
    const out = {};
    Object.keys(t.cores).forEach((k) => { out[NOMES[k]] = t.cores[k]; });
    /*
     * O fundo com transparência zero, para o VÉU sobre a foto:
     * `linear-gradient(90deg, var(--mt-fundo), var(--mt-fundo-0))`.
     *
     * Não serve `transparent`: ele é preto transparente, e navegador que
     * interpola sem pré-multiplicar (WebView velho de box barato) desenha
     * uma faixa acinzentada no meio do degradê. Com a mesma cor a zero, o
     * véu some limpo em qualquer um.
     */
    out[NOMES.fundo0] = C.rgba(t.cores.fundo, 0);
    out[NOMES.fonteTitulo] = t.fontes.titulo;
    out[NOMES.fonteTexto] = t.fontes.texto;
    out[NOMES.raio] = t.raio;
    out[NOMES.escalaTitulo] = String(t.escalaTitulo != null ? t.escalaTitulo : 1);
    return out;
  }

  /*
   * Confere o contrato num jogo de tokens qualquer — inclusive num que veio
   * ajustado à mão. Devolve os pares que falham; lista vazia é aprovado.
   */
  function conferir(t) {
    const falhas = [];
    PARES.forEach((par) => {
      const k = C.contraste(t.cores[par.frente], t.cores[par.fundo]);
      if (!(k >= par.minimo)) {
        falhas.push({ frente: par.frente, fundo: par.fundo, contraste: Math.round(k * 100) / 100, minimo: par.minimo });
      }
    });
    return falhas;
  }

  return {
    MODOS, MODO_PADRAO, NOMES, RAIOS, PARES,
    gerar, daMarca, variaveis, conferir,
  };
});
