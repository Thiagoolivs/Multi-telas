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
   * 4.5 é o AA do WCAG para texto. Destaque fica em 3, o AA para texto
   * grande e elementos gráficos, porque é o que ele é: selo, faixa, botão,
   * kicker em corpo grande — nunca texto corrido. Preço também é grande
   * sempre, mas fica em 4.5 de propósito: é o número que a pessoa precisa
   * ler de relance, do outro lado da loja, e às vezes vive num cartão pequeno.
   *
   * AA é o piso, não a meta: nos modos claro e escuro o texto passa de 12:1.
   */
  const FUNDOS = ['fundo', 'fundo2', 'superficie'];
  const PARES = []
    .concat(FUNDOS.map((f) => ({ frente: 'texto', fundo: f, minimo: 4.5 })))
    .concat(FUNDOS.map((f) => ({ frente: 'textoSuave', fundo: f, minimo: 4.5 })))
    .concat(FUNDOS.map((f) => ({ frente: 'preco', fundo: f, minimo: 4.5 })))
    .concat(FUNDOS.map((f) => ({ frente: 'destaque', fundo: f, minimo: 3 })))
    .concat([{ frente: 'sobreDestaque', fundo: 'destaque', minimo: 4.5 }]);

  const ok = (cor, fundos, minimo) => fundos.every((f) => C.contraste(cor, f) >= minimo);

  /*
   * Leva uma cor até ela se ler sobre TODOS os fundos, mexendo só na
   * luminosidade. Matiz e croma ficam: o destaque de uma marca laranja
   * continua laranja, só mais claro ou mais escuro.
   *
   * Anda nos dois sentidos, um passo de cada vez, e para no primeiro que
   * passa — a menor mudança possível. Escolher o sentido pela luminância
   * do fundo e ir só nele é o bug que js/cor.js documenta em `acentoSobre`:
   * nos meios-tons, o sentido "óbvio" não chega lá. O sentido que se afasta
   * dos fundos só é tentado PRIMEIRO, como desempate.
   */
  function garantir(cor, fundos, minimo) {
    if (ok(cor, fundos, minimo)) return cor;
    const o = C.paraOklch(cor);
    const media = fundos.reduce((s, f) => s + C.luminancia(f), 0) / fundos.length;
    const primeiro = C.luminancia(cor) < media ? -1 : 1;
    for (let i = 1; i <= 100; i++) {
      for (const sinal of [primeiro, -primeiro]) {
        const L = o.l + sinal * i * 0.01;
        if (L < 0 || L > 1) continue;
        const x = C.deOklch(L, o.c, sinal < 0 ? matizAoEscurecer(o, L) : o.h);
        if (ok(x, fundos, minimo)) return x;
      }
    }
    // Nenhuma luminosidade serve: os fundos estão dos dois lados do meio.
    // Fica o extremo que mais se lê — e o teste do contrato denuncia.
    const pior = (x) => Math.min.apply(null, fundos.map((f) => C.contraste(x, f)));
    return pior('#ffffff') >= pior('#000000') ? '#ffffff' : '#000000';
  }

  /*
   * A única exceção à matiz fixa: amarelo escurecendo.
   *
   * Amarelo escurecido na mesma matiz vira oliva — visto no render da
   * amostra, a marca amarela no modo claro saía com botão cor de azeitona.
   * Designer resolve puxando para o âmbar, e é o que isto faz: quanto mais
   * escurece, mais a matiz anda em direção ao laranja (65°). Fora da faixa
   * dos amarelos, nada muda.
   */
  function matizAoEscurecer(o, L) {
    if (o.c < 0.05 || o.h < 75 || o.h > 125) return o.h;
    const quanto = Math.min(1, (o.l - L) / 0.4);
    return o.h - (o.h - 65) * quanto;
  }

  /*
   * Destaque no modo escuro: marca escura e pouco saturada (azul-marinho,
   * vinho) clareada na mesma saturação vira cinza-azulado, um botão apagado
   * — também visto no render. Ganha croma ao subir, com teto, para continuar
   * parecendo cor de marca e não cor de sistema. Marca cinza continua cinza.
   */
  function vivo(o) {
    if (o.c < 0.03 || o.l > 0.6) return o.c;
    return Math.max(o.c, Math.min(o.c * 1.8, 0.13));
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
   * Preço: o destaque, se ele já se lê como texto; senão o destaque levado
   * até 4.5. Igual ao destaque quando dá, porque preço é a coisa mais
   * importante da peça e merece a cor que chama atenção.
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
  const tinta = (o, fator, teto) => Math.min(o.c * fator, teto);

  /*
   * Com duas cores de marca, o destaque é a que JÁ SE LÊ naquele fundo.
   *
   * Destaque é a cor de ação, e a marca costuma ter uma cor de identidade
   * escura e uma de acento — o azul-marinho e o dourado da ótica. No modo
   * escuro, clarear o azul-marinho até ele aparecer dá um azul qualquer; o
   * dourado já aparece como é. No claro, o contrário. Escolher a que precisa
   * de MENOS ajuste é escolher a que continua sendo ela mesma. Empate fica
   * com a principal.
   */
  function corDeAcao(marca, marca2, fundos) {
    if (!marca2 || marca2 === marca) return marca;
    const pior = (x) => Math.min.apply(null, fundos.map((f) => C.contraste(x, f)));
    return pior(marca2) > pior(marca) ? marca2 : marca;
  }

  function modoEscuro(marca, marca2, o) {
    const fundo = C.deOklch(0.2, tinta(o, 0.18, 0.035), o.h);
    const fundo2 = C.deOklch(0.255, tinta(o, 0.25, 0.045), o.h);
    const superficie = C.deOklch(0.3, tinta(o, 0.28, 0.05), o.h);
    const fundos = [fundo, fundo2, superficie];
    const texto = garantir(C.deOklch(0.97, tinta(o, 0.08, 0.015), o.h), fundos, 4.5);
    const textoSuave = garantir(C.deOklch(0.8, tinta(o, 0.1, 0.02), o.h), fundos, 4.5);
    const acao = corDeAcao(marca, marca2, fundos);
    const oa = C.paraOklch(acao);
    const destaque = garantir(ok(acao, fundos, 3) ? acao : C.deOklch(oa.l, vivo(oa), oa.h), fundos, 3);
    return { fundo, fundo2, superficie, texto, textoSuave, destaque };
  }

  function modoClaro(marca, marca2, o) {
    const fundo = C.deOklch(0.975, tinta(o, 0.12, 0.02), o.h);
    const fundo2 = C.deOklch(0.935, tinta(o, 0.18, 0.03), o.h);
    // Cartão mais claro que o fundo: é o "papel" sobre a mesa.
    const superficie = C.deOklch(0.997, tinta(o, 0.04, 0.006), o.h);
    const fundos = [fundo, fundo2, superficie];
    const texto = garantir(C.deOklch(0.24, tinta(o, 0.25, 0.04), o.h), fundos, 4.5);
    const textoSuave = garantir(C.deOklch(0.45, tinta(o, 0.15, 0.03), o.h), fundos, 4.5);
    const destaque = garantir(corDeAcao(marca, marca2, fundos), fundos, 3);
    return { fundo, fundo2, superficie, texto, textoSuave, destaque };
  }

  /*
   * Modo marca: a peça inteira na cor EXATA da marca, como um cartaz.
   *
   * O texto escolhe o lado (claro ou escuro) pelo contraste com a marca. O
   * claro é um creme, não branco puro: sobre fundo chapado saturado, branco
   * "vibra" — é a mesma escolha de `buildPalette` em server/design-system.js.
   *
   * Fundo-2 e superfície se afastam do texto, nunca se aproximam: assim o
   * cartão sobre o fundo só ganha contraste. Quando não há para onde ir (marca
   * preta com texto claro já está no fundo do poço), vão um pouco para o
   * outro lado, e o texto é conferido de novo contra os três.
   */
  function modoMarca(marca, marca2, o) {
    const textoClaro = C.contraste(marca, '#ffffff') >= C.contraste(marca, '#000000');
    const longe = textoClaro ? -1 : 1;
    const variar = (passo) => {
      const L = o.l + longe * passo;
      if (L >= 0 && L <= 1) return C.deOklch(L, o.c, o.h);
      return C.deOklch(Math.max(0, Math.min(1, o.l - longe * passo * 0.75)), o.c, o.h);
    };
    const fundo = marca;
    const fundo2 = variar(0.05);
    const superficie = variar(0.1);
    const fundos = [fundo, fundo2, superficie];

    const texto = garantir(textoClaro ? C.mix('#ffffff', '#ffe9c7', 0.55)
      : C.deOklch(0.22, tinta(o, 0.5, 0.06), o.h), fundos, 4.5);
    const textoSuave = garantir(C.mix(texto, marca, 0.22), fundos, 4.5);

    /*
     * O destaque não pode ser a marca — ela é o fundo. Com segunda cor
     * cadastrada, é ela. Sem, uma versão da própria marca do lado do texto
     * (azul-claro sobre azul-marinho): cartaz monocromático, que nunca
     * erra a combinação. Inventar uma complementar seria decidir a
     * identidade pela empresa.
     */
    const base = marca2 && marca2 !== marca ? marca2
      : textoClaro ? C.deOklch(0.9, Math.min(o.c, 0.09), o.h) : C.deOklch(0.3, Math.min(o.c, 0.12), o.h);
    const destaque = garantir(base, fundos, 3);
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
      destaque: garantir(g(0.45), fundos, 3),
    };
  }

  /*
   * Gera os tokens de um modo.
   *
   *   marca        cor principal (hex). Inválida ou ausente: a de reserva.
   *   marca2       segunda cor, opcional — candidata a destaque (`corDeAcao`)
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
    const o = C.paraOklch(marca);

    const base = modo === 'claro' ? modoClaro(marca, marca2, o)
      : modo === 'marca' ? modoMarca(marca, marca2, o)
        : modo === 'rascunho' ? modoRascunho()
          : modoEscuro(marca, marca2, o);
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
      marca: cores[0], marca2: cores[1], modo, raio,
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
