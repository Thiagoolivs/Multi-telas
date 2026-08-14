(function () {
  'use strict';

  var menosMovimento = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ==========================================================
   * A PEÇA QUE PASSA NA TV
   *
   * Desenhada num canvas, aqui, e usada como TEXTURA da tela 3D.
   * É de propósito: a TV do topo mostra o produto de verdade —
   * as mesmas peças de partida que o editor entrega — e não um
   * print. Trocar de peça troca também a luz que a TV joga na
   * cena, que é o que faz parecer uma tela ligada.
   * ========================================================== */
  var tela = document.createElement('canvas');
  tela.width = 1024; tela.height = 576;
  var ctx = tela.getContext('2d');

  var PECAS = [
    {
      luz: '#2f6feb', fundo: ['#0a1020', '#132447'],
      desenhar: function (c, w, h, t) {
        faixa(c, 0.07 * w, 0.11 * h, 0.06 * w, 0.008 * h, '#2f6feb');
        txt(c, 'COMUNICADO', 0.07 * w, 0.19 * h, 0.028 * w, '800', '#56ccf2', 'left', 4);
        txt(c, 'O refeitório funciona', 0.07 * w, 0.34 * h, 0.072 * w, '800', '#ffffff', 'left');
        txt(c, 'em horário estendido', 0.07 * w, 0.45 * h, 0.072 * w, '800', '#ffffff', 'left');
        txt(c, 'Segunda a sexta, das 8h às 18h', 0.07 * w, 0.62 * h, 0.03 * w, '500', '#93a3c9', 'left');
      },
    },
    {
      luz: '#e11d48', fundo: ['#e11d48', '#b0143a'],
      desenhar: function (c, w, h) {
        txt(c, 'OFERTA DA SEMANA', w / 2, 0.19 * h, 0.032 * w, '700', '#fff6e6', 'center', 6);
        txt(c, 'R$ 19,90', w / 2, 0.47 * h, 0.155 * w, '800', '#fff6e6', 'center');
        pilula(c, w / 2 - 0.2 * w, 0.68 * h, 0.4 * w, 0.11 * h, '#fff6e6');
        txt(c, 'PEÇA NO BALCÃO', w / 2, 0.755 * h, 0.032 * w, '800', '#e11d48', 'center');
      },
    },
    {
      luz: '#22c55e', fundo: ['#04140d', '#0a3524'],
      desenhar: function (c, w, h) {
        txt(c, 'DIAS SEM ACIDENTES', w / 2, 0.22 * h, 0.032 * w, '700', '#a3e635', 'center', 6);
        txt(c, '127', w / 2, 0.58 * h, 0.24 * w, '800', '#22c55e', 'center');
        txt(c, 'Nosso recorde é 180. Falta pouco.', w / 2, 0.82 * h, 0.028 * w, '500', '#93a3c9', 'center');
      },
    },
    {
      luz: '#a78bfa', fundo: ['#120a2e', '#3b1d73'],
      desenhar: function (c, w, h) {
        txt(c, 'Bem-vinda,', w / 2, 0.34 * h, 0.052 * w, '400', '#c4b5fd', 'center');
        txt(c, 'Dra. Helena Prado', w / 2, 0.52 * h, 0.078 * w, '700', '#ffffff', 'center');
        faixa(c, w / 2 - 0.08 * w, 0.62 * h, 0.16 * w, 0.006 * h, '#a78bfa');
        txt(c, 'É um prazer receber você', w / 2, 0.75 * h, 0.028 * w, '500', '#c4b5fd', 'center');
      },
    },
  ];

  function txt(c, s, x, y, tam, peso, cor, alinha, espaco) {
    c.save();
    c.font = peso + ' ' + tam + 'px Manrope, system-ui, sans-serif';
    c.fillStyle = cor;
    c.textAlign = alinha || 'left';
    c.textBaseline = 'middle';
    if (espaco && 'letterSpacing' in c) c.letterSpacing = espaco + 'px';
    c.fillText(s, x, y);
    c.restore();
  }
  function faixa(c, x, y, w, h, cor) { c.fillStyle = cor; c.fillRect(x, y, w, h); }
  function pilula(c, x, y, w, h, cor) {
    c.fillStyle = cor; c.beginPath();
    var r = h / 2;
    c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); c.fill();
  }

  var atual = 0, proxima = 1, transicao = 0, ultimaTroca = performance.now();
  var DURACAO = 3400, VARRIDA = 700;

  function pintarPeca(c, peca, w, h) {
    var g = c.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, peca.fundo[0]); g.addColorStop(1, peca.fundo[1]);
    c.fillStyle = g; c.fillRect(0, 0, w, h);
    peca.desenhar(c, w, h);
  }

  function desenharTela(agora) {
    var w = tela.width, h = tela.height;
    var passado = agora - ultimaTroca;

    if (passado > DURACAO + VARRIDA) {
      atual = proxima; proxima = (proxima + 1) % PECAS.length;
      ultimaTroca = agora; passado = 0;
    }
    transicao = passado > DURACAO ? Math.min(1, (passado - DURACAO) / VARRIDA) : 0;

    pintarPeca(ctx, PECAS[atual], w, h);

    // A troca é uma VARRIDA lateral, como corte de vinheta — some melhor numa
    // tela pequena do que um esmaecer, que a essa distância vira borrão.
    if (transicao > 0) {
      var corte = fac(transicao) * w;
      ctx.save();
      ctx.beginPath(); ctx.rect(0, 0, corte, h); ctx.clip();
      pintarPeca(ctx, PECAS[proxima], w, h);
      ctx.restore();
      ctx.fillStyle = 'rgba(255,255,255,.65)';
      ctx.fillRect(corte - 3, 0, 3, h);
    }

    // Brilho de varredura, discreto: é o que faz o olho ler "tela ligada".
    var brilho = ctx.createLinearGradient(0, 0, w, h);
    brilho.addColorStop(0, 'rgba(255,255,255,.05)');
    brilho.addColorStop(0.5, 'rgba(255,255,255,0)');
    ctx.fillStyle = brilho; ctx.fillRect(0, 0, w, h);
  }
  function fac(t) { return t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }

  function corNoAr() { return PECAS[transicao > .5 ? proxima : atual].luz; }

  /* ==========================================================
   * A TV EM 3D
   *
   * Montada com caixas, sem arquivo de modelo: assim a página
   * continua sendo um arquivo só, carrega rápido e não depende
   * de nenhum servidor de assets.
   * ========================================================== */
  var palco = document.getElementById('palco3d');
  var temWebGL = (function () {
    try {
      var cv = document.createElement('canvas');
      return !!(window.WebGLRenderingContext && (cv.getContext('webgl') || cv.getContext('experimental-webgl')));
    } catch (e) { return false; }
  })();

  var cena, camera, render3d, tv, texturaTela, luzTela, relogio;

  function montarCena() {
    cena = new THREE.Scene();
    /*
     * `near` em 1, e não em 0,1.
     *
     * A precisão do buffer de profundidade não se distribui por igual: ela se
     * concentra perto da câmera, e a conta que manda é a RAZÃO far/near. Com
     * 0,1 e 100 o buffer gastava quase toda a resolução nos primeiros metros,
     * onde não existe nada — a TV mais próxima está a uns 8. Em 1, sobra
     * precisão exatamente na faixa onde a TV vive.
     */
    camera = new THREE.PerspectiveCamera(38, window.innerWidth / window.innerHeight, 1, 100);
    camera.position.set(0, 0, 15.5);

    render3d = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    render3d.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    render3d.setSize(window.innerWidth, window.innerHeight);
    palco.appendChild(render3d.domElement);

    tv = new THREE.Group();

    // Moldura
    var moldura = new THREE.Mesh(
      new THREE.BoxGeometry(11.6, 6.9, 0.42),
      new THREE.MeshStandardMaterial({ color: 0x0d1220, roughness: 0.34, metalness: 0.85 })
    );
    tv.add(moldura);

    /*
     * Borda interna, um fio mais claro — é o que dá "acabamento" à peça.
     *
     * As profundidades destas três peças não são valores soltos: elas foram
     * escolhidas para que NENHUMA face caia na mesma altura de outra.
     *
     * Estava assim: a moldura ia de −0,21 a +0,21; o aro, com 0,44 de fundo em
     * z = 0,01, ia de −0,21 a +0,23 — o fundo dele exatamente no fundo da
     * moldura; e a tela ficava em 0,23, exatamente na frente do aro. Duas
     * superfícies na mesma profundidade deixam o cartão de vídeo sem critério
     * para decidir qual está na frente, e ele decide pixel a pixel, mudando de
     * ideia a cada quadro: é o chuviscado que aparecia sobre a peça e piscava
     * quando a TV girava.
     *
     * Agora o aro vai de −0,17 a +0,23 (fundo dentro da moldura, sem encostar)
     * e a tela fica em 0,26, à frente de tudo, com folga.
     */
    var aro = new THREE.Mesh(
      new THREE.BoxGeometry(11.16, 6.46, 0.40),
      new THREE.MeshStandardMaterial({ color: 0x1b2b4a, roughness: 0.5, metalness: 0.6 })
    );
    aro.position.z = 0.03;
    tv.add(aro);

    // A tela
    texturaTela = new THREE.CanvasTexture(tela);
    /*
     * Mipmap LIGADO, e é o que salva a legibilidade.
     *
     * A tela aparece bem inclinada: a metade que está mais longe fica
     * comprimida na horizontal, e sem mipmap o "R$ 19,90" virava um borrão de
     * listras verticais. Mipmap com filtro anisotrópico é exatamente o remédio
     * para superfície em ângulo.
     *
     * O custo de remontar a pirâmide é real, então a textura não é atualizada
     * a cada quadro: 20 vezes por segundo basta para uma vinheta trocando de
     * peça, e ninguém percebe a diferença.
     */
    texturaTela.generateMipmaps = true;
    texturaTela.minFilter = THREE.LinearMipmapLinearFilter;
    texturaTela.magFilter = THREE.LinearFilter;
    texturaTela.anisotropy = render3d.capabilities.getMaxAnisotropy();
    var ecra = new THREE.Mesh(
      new THREE.PlaneGeometry(11, 6.3),
      new THREE.MeshBasicMaterial({ map: texturaTela })
    );
    ecra.position.z = 0.26;
    tv.add(ecra);

    // Pé
    var pescoco = new THREE.Mesh(
      new THREE.BoxGeometry(0.7, 1.1, 0.5),
      new THREE.MeshStandardMaterial({ color: 0x0d1220, roughness: 0.4, metalness: 0.8 })
    );
    pescoco.position.y = -3.95;
    tv.add(pescoco);
    var base = new THREE.Mesh(
      new THREE.BoxGeometry(4.4, 0.24, 1.5),
      new THREE.MeshStandardMaterial({ color: 0x0d1220, roughness: 0.4, metalness: 0.8 })
    );
    base.position.y = -4.6;
    tv.add(base);

    cena.add(tv);

    cena.add(new THREE.AmbientLight(0xffffff, 0.42));
    var direta = new THREE.DirectionalLight(0xffffff, 0.75);
    direta.position.set(5, 6, 9);
    cena.add(direta);
    var contra = new THREE.DirectionalLight(0x56ccf2, 0.5);
    contra.position.set(-7, -3, -5);
    cena.add(contra);

    // A luz que a própria peça joga para frente
    luzTela = new THREE.PointLight(0x2f6feb, 2.2, 26);
    luzTela.position.set(0, 0, 4.2);
    cena.add(luzTela);

    relogio = new THREE.Clock();
  }

  /* Onde a TV está, em função do scroll. */
  var alvo = { rotY: -0.42, rotX: 0.04, posX: 3.4, posY: -0.3, posZ: 0, escala: 0.92 };
  var suave = Object.assign({}, alvo);
  var mouse = { x: 0, y: 0 };
  var visivel = true;
  var ultimoQuadroTela = 0;

  function ligarScroll() {
    gsap.registerPlugin(ScrollTrigger);

    /*
     * O GIRO. A TV começa levemente virada, endireita quando o texto do herói
     * está sendo lido, e continua girando conforme se desce — é o movimento
     * que o scroll comanda. `scrub` amarra o ângulo à posição da barra de
     * rolagem em vez de disparar uma animação de duração fixa: o dedo da
     * pessoa é que gira a TV, e não um cronômetro.
     */
    var largo = window.innerWidth >= 1024;
    gsap.timeline({
      scrollTrigger: {
        trigger: '#topo',
        start: 'top top',
        endTrigger: '#editor',
        end: 'top center',
        scrub: 1.1,
      },
    })
      .fromTo(alvo,
        { rotY: -0.42, rotX: 0.04, posX: largo ? 3.4 : 0, posY: -0.3, posZ: 0, escala: largo ? 0.92 : 0.8 },
        { rotY: 0.66, rotX: -0.13, posX: largo ? 1.2 : 0, posY: 1.8, posZ: -8, escala: 0.66, ease: 'none' });

    // A moldura some de vez quando a página passa do editor: dali em diante
    // ela só atrapalharia a leitura.
    ScrollTrigger.create({
      trigger: '#editor',
      start: 'top center',
      onEnter: function () { gsap.to(palco, { opacity: 0, duration: .6 }); visivel = false; },
      onLeaveBack: function () { gsap.to(palco, { opacity: 1, duration: .6 }); visivel = true; },
    });

    // Barra de progresso
    ScrollTrigger.create({
      start: 0, end: 'max',
      onUpdate: function (self) {
        document.getElementById('progresso').style.width = (self.progress * 100) + '%';
      },
    });

    // Aparições
    gsap.utils.toArray('.reveal').forEach(function (el, i) {
      gsap.fromTo(el, { y: 26, opacity: 0 }, {
        y: 0, opacity: 1, duration: .8, ease: 'power3.out', delay: (i % 4) * 0.06,
        scrollTrigger: { trigger: el, start: 'top 88%' },
      });
    });
    gsap.utils.toArray('.cartao').forEach(function (el) {
      gsap.fromTo(el, { y: 40, opacity: 0, scale: .97 }, {
        y: 0, opacity: 1, scale: 1, duration: .7, ease: 'power3.out',
        scrollTrigger: { trigger: el, start: 'top 90%' },
      });
    });

    // Contadores
    gsap.utils.toArray('.contador').forEach(function (el) {
      var ate = Number(el.getAttribute('data-ate')) || 0;
      var obj = { v: 0 };
      gsap.to(obj, {
        v: ate, duration: 1.4, ease: 'power2.out',
        scrollTrigger: { trigger: el, start: 'top 88%' },
        onUpdate: function () { el.textContent = Math.round(obj.v); },
      });
    });
  }

  function animar() {
    requestAnimationFrame(animar);
    var agora = performance.now();

    if (agora - ultimoQuadroTela > 50) {
      ultimoQuadroTela = agora;
      desenharTela(agora);
      if (texturaTela) texturaTela.needsUpdate = true;
    }

    // O halo de fundo segue a cor da peça no ar.
    var cor = corNoAr();
    var halo = document.getElementById('halo');
    if (halo.dataset.cor !== cor) {
      halo.dataset.cor = cor;
      halo.style.background = 'radial-gradient(circle, ' + cor + '46 0%, transparent 62%)';
    }

    if (!temWebGL || !visivel) return;

    // Suaviza tudo: o scroll e o mouse mandam o ALVO, e a TV persegue.
    // Sem isso o movimento fica "digital", preso ao quadro.
    ['rotY', 'rotX', 'posX', 'posY', 'posZ', 'escala'].forEach(function (k) {
      suave[k] += (alvo[k] - suave[k]) * 0.08;
    });

    var respiro = menosMovimento ? 0 : Math.sin(agora / 2200) * 0.035;
    tv.rotation.y = suave.rotY + mouse.x * 0.16;
    tv.rotation.x = suave.rotX + mouse.y * 0.1 + respiro;
    tv.position.x = suave.posX;
    tv.position.y = suave.posY + (menosMovimento ? 0 : Math.sin(agora / 1800) * 0.12);
    tv.position.z = suave.posZ;
    tv.scale.setScalar(suave.escala);

    if (luzTela) {
      luzTela.color.set(cor);
      luzTela.intensity = 2.0 + Math.sin(agora / 700) * 0.16;
    }

    render3d.render(cena, camera);
  }

  /* ---------- Miniatura do editor (2D) ---------- */
  function miniEditor() {
    var cv = document.getElementById('mini-editor');
    if (!cv) return;
    var c = cv.getContext('2d');
    var w = cv.width, h = cv.height;
    function quadro() {
      pintarPeca(c, PECAS[1], w, h);
      // Alças de seleção sobre o preço, como no editor de verdade
      c.strokeStyle = 'rgba(120,160,255,.95)'; c.lineWidth = 2;
      c.strokeRect(0.08 * w, 0.3 * h, 0.84 * w, 0.28 * h);
      [[0.08, 0.3], [0.5, 0.3], [0.92, 0.3], [0.08, 0.44], [0.92, 0.44], [0.08, 0.58], [0.5, 0.58], [0.92, 0.58]]
        .forEach(function (p) {
          c.fillStyle = '#0a1020'; c.beginPath(); c.arc(p[0] * w, p[1] * h, 5, 0, 6.3); c.fill();
          c.strokeStyle = 'rgba(120,160,255,.95)'; c.stroke();
        });
    }
    quadro();
  }

  /* ==========================================================
   * GALERIA DE MODELOS — os modelos DE VERDADE
   *
   * Esta seção não desenha imitações dos modelos: ela carrega js/modelos.js,
   * o mesmo arquivo que o editor usa, e monta a peça aqui. Uma landing com
   * capturas de tela envelhece no primeiro ajuste do produto e passa a
   * prometer uma coisa e entregar outra. Assim, se um modelo mudar amanhã, a
   * vitrine muda junto — sem ninguém lembrar de atualizar a imagem.
   *
   * O preço de fazer assim é ter aqui um desenhista de peça em vanilla, que é
   * a mesma decisão que a miniatura do painel toma (DesignThumb) — só que sem
   * React. As CONTAS, essas continuam vindo de js/peca.js e js/fontes.js.
   * ========================================================== */

  // Os únicos ícones que os modelos usam. Espelho de web/src/lib/icons.js.
  var ICONES = {
    calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 9h18M8 3v4M16 3v4"/>',
    star: '<path d="M12 3l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9 6.8 19.1l1-5.8L3.5 9.2l5.9-.9z"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    pin: '<path d="M12 21s7-6 7-11a7 7 0 0 0-14 0c0 5 7 11 7 11z"/><circle cx="12" cy="10" r="2.5"/>',
  };

  var MARCAS = [
    { nome: 'Azul', cores: ['#2f6feb', '#56ccf2'] },
    { nome: 'Vermelho', cores: ['#e11d48', '#fb7185'] },
    { nome: 'Verde', cores: ['#059669', '#34d399'] },
    { nome: 'Roxo', cores: ['#7c3aed', '#a78bfa'] },
    { nome: 'Laranja', cores: ['#ea580c', '#fb923c'] },
    { nome: 'Amarelo', cores: ['#f5d67b', '#fbbf24'] },
    { nome: 'Grafite', cores: ['#111827', '#6b7280'] },
  ];
  var FORMATOS = [
    { id: '16/9', rotulo: 'TV deitada · 16/9' },
    { id: '9/16', rotulo: 'Totem em pé · 9/16' },
    { id: '1/1', rotulo: 'Quadrada · 1/1' },
    { id: '21/9', rotulo: 'Faixa larga · 21/9' },
  ];

  var marcaAtual = 0, formatoAtual = '16/9';

  /*
   * O CSS de sombra/borda de um elemento, na propriedade certa para o tipo
   * dele — a mesma decisão de web/src/lib/composition.js. Sombra em texto é
   * text-shadow; em forma inteira é box-shadow; em forma recortada ou imagem
   * só o filtro funciona, porque o recorte cortaria a sombra junto.
   */
  function caixa(el, alvo) {
    var P = globalThis.MTPeca;
    if (!P) return;
    var s = P.sombraCss(el);
    if (s !== 'none') {
      var onde = P.comoAplicarSombra(el);
      if (onde === 'texto') alvo.style.textShadow = s;
      else if (onde === 'caixa') alvo.style.boxShadow = s;
      else alvo.style.filter = 'drop-shadow(' + s + ')';
    }
    var b = P.bordaCss(el);
    if (b !== 'none') { alvo.style.border = b; alvo.style.boxSizing = 'border-box'; }
  }

  /* Uma peça (composição) virando DOM. */
  function desenharPeca(peca) {
    var P = globalThis.MTPeca, F = globalThis.MTFontes;
    var palco = document.createElement('div');
    palco.className = 'miniatura';
    palco.style.aspectRatio = peca.formato.replace('/', ' / ');
    var bg = peca.bg || {};
    palco.style.background = bg.kind === 'cor' ? bg.cor : '#0a1020';

    peca.elementos.slice().sort(function (a, b) { return (a.z || 0) - (b.z || 0); }).forEach(function (e) {
      var cx = document.createElement('div');
      cx.style.left = e.x + '%';
      cx.style.top = e.y + '%';
      cx.style.width = e.w + '%';
      cx.style.height = e.h + '%';
      if (e.rot) cx.style.transform = 'rotate(' + e.rot + 'deg)';

      var dentro;
      if (e.tipo === 'texto') {
        dentro = document.createElement('div');
        dentro.className = 'mini-texto';
        var est = F.estiloTexto(e);
        for (var k in est) dentro.style[k] = est[k];
        // O corpo em cqw: % da largura do contêiner, que a classe .miniatura
        // declara. É o que faz a peça sair igual em qualquer tamanho de tela.
        dentro.style.fontSize = P.textFontCqw(e, peca.formato) + 'cqw';
        dentro.textContent = e.text;
      } else if (e.tipo === 'forma') {
        dentro = document.createElement('div');
        dentro.style.width = '100%';
        dentro.style.height = '100%';
        dentro.style.background = P.fillToCss(e.fill);
        if (e.shape === 'ellipse') dentro.style.borderRadius = '50%';
        else if (P.SHAPE_POLY[e.shape]) dentro.style.clipPath = P.shapeClip(e.shape);
        else dentro.style.borderRadius = P.raioCss(e);
      } else if (e.tipo === 'icone') {
        dentro = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        dentro.setAttribute('viewBox', '0 0 24 24');
        dentro.setAttribute('fill', 'none');
        dentro.setAttribute('stroke', e.cor || '#fff');
        dentro.setAttribute('stroke-width', e.peso || 1.6);
        dentro.setAttribute('stroke-linecap', 'round');
        dentro.setAttribute('stroke-linejoin', 'round');
        dentro.style.width = '100%';
        dentro.style.height = '100%';
        dentro.innerHTML = ICONES[e.name] || ICONES.star;
      } else {
        dentro = document.createElement('div');
        dentro.style.width = '100%';
        dentro.style.height = '100%';
        dentro.style.background = 'rgba(255,255,255,.1)';
      }
      if (e.opacidade != null && e.opacidade !== 1) dentro.style.opacity = e.opacidade;
      caixa(e, dentro);
      cx.appendChild(dentro);
      palco.appendChild(cx);
    });
    return palco;
  }

  function lugarDaFoto() {
    var d = document.createElement('div');
    d.style.left = '0'; d.style.top = '0'; d.style.width = '100%'; d.style.height = '84%';
    d.style.display = 'flex'; d.style.alignItems = 'center'; d.style.justifyContent = 'center';
    d.style.background =
      'repeating-linear-gradient(135deg, rgba(255,255,255,.035) 0 10px, transparent 10px 20px),' +
      'linear-gradient(160deg, #16233f, #0a1020)';
    d.innerHTML = '<span style="font-size:3.4cqw;letter-spacing:.24em;font-weight:800;' +
      'color:rgba(255,255,255,.34)">SUA FOTO AQUI</span>';
    return d;
  }

  function pintarGaleria() {
    var alvo = document.getElementById('galeria');
    var M = globalThis.MTModelos;
    if (!alvo || !M) return;
    var cores = MARCAS[marcaAtual].cores;
    alvo.innerHTML = '';
    M.listar().forEach(function (m) {
      var peca = M.montar(m.id, formatoAtual, cores);
      if (!peca) return;
      var cartao = document.createElement('article');
      cartao.className = 'cartao vidro rounded-2xl border border-white/8 p-4';
      var mini = desenharPeca(peca);
      /*
       * O modelo "foto com faixa" nasce com fundo escuro de propósito: o
       * lugar da foto é seu. Numa vitrine, porém, ele apareceria como o único
       * quadrado preto no meio de sete peças coloridas, com cara de defeito.
       * A marca d'água diz o que aquele espaço é — sem fingir que já tem foto.
       */
      if (m.id === 'foto-faixa') mini.insertBefore(lugarDaFoto(), mini.firstChild);
      var moldura = document.createElement('div');
      moldura.className = 'mx-auto';
      // Peça em pé numa grade de quatro colunas ficaria altíssima: limita a
      // altura e deixa a largura seguir a proporção.
      moldura.style.maxWidth = formatoAtual === '9/16' ? '58%' : '100%';
      moldura.appendChild(mini);
      cartao.appendChild(moldura);
      var nome = document.createElement('h3');
      nome.className = 'mt-4 text-sm font-extrabold text-white';
      nome.textContent = m.nome;
      var para = document.createElement('p');
      para.className = 'mt-1 text-xs leading-relaxed text-mt-ash';
      para.textContent = m.para;
      cartao.appendChild(nome);
      cartao.appendChild(para);
      alvo.appendChild(cartao);
    });
  }

  function montarControles() {
    var caixaCores = document.getElementById('cores-marca');
    if (caixaCores) {
      MARCAS.forEach(function (m, i) {
        var b = document.createElement('button');
        b.className = 'amostra';
        b.style.background = 'linear-gradient(135deg, ' + m.cores[0] + ', ' + m.cores[1] + ')';
        b.setAttribute('aria-pressed', String(i === marcaAtual));
        b.setAttribute('aria-label', 'Marca ' + m.nome);
        b.title = m.nome;
        b.addEventListener('click', function () {
          marcaAtual = i;
          caixaCores.querySelectorAll('.amostra').forEach(function (o, j) {
            o.setAttribute('aria-pressed', String(j === i));
          });
          pintarGaleria();
        });
        caixaCores.appendChild(b);
      });
    }

    var caixaForm = document.getElementById('formatos');
    if (caixaForm) {
      FORMATOS.forEach(function (f) {
        var b = document.createElement('button');
        b.className = 'aba rounded-full border border-white/15 px-4 py-2 text-xs font-bold text-mt-ash';
        b.textContent = f.rotulo;
        b.setAttribute('aria-pressed', String(f.id === formatoAtual));
        b.addEventListener('click', function () {
          formatoAtual = f.id;
          caixaForm.querySelectorAll('.aba').forEach(function (o, j) {
            o.setAttribute('aria-pressed', String(FORMATOS[j].id === f.id));
          });
          pintarGaleria();
        });
        caixaForm.appendChild(b);
      });
    }
  }

  /* ==========================================================
   * CALCULADORA DE PREÇO
   *
   * Os números vêm de /api/planos — o mesmo catálogo que a cobrança usa,
   * incluindo a tabela já calculada de 1 a 50 telas. Nada de preço copiado
   * para dentro da página: preço copiado é preço que um dia diverge, e o dia
   * em que diverge é o dia em que alguém assina esperando outro valor.
   * ========================================================== */

  function reais(centavos) {
    return (centavos / 100).toLocaleString('pt-BR', {
      style: 'currency', currency: 'BRL', minimumFractionDigits: 0, maximumFractionDigits: 0,
    });
  }

  function precos() {
    fetch('/api/planos', { headers: { Accept: 'application/json' } })
      .then(function (r) { return r.ok ? r.json() : Promise.reject(new Error('http ' + r.status)); })
      .then(montarPrecos)
      // Sem servidor (página aberta como arquivo, ou API fora do ar), a seção
      // de planos fica como está no HTML em vez de sumir.
      .catch(function () {});
  }

  function montarPrecos(dados) {
    var bv = document.getElementById('boas-vindas');
    if (bv && dados.creditosBoasVindas) bv.textContent = dados.creditosBoasVindas;

    /* ---- Cartões de plano ---- */
    var grade = document.getElementById('planos');
    var lista = dados.planos || [];
    if (grade && lista.length) {
      grade.innerHTML = '';
      lista.forEach(function (p) {
        var destaque = p.id === 'pro';
        var art = document.createElement('article');
        // `flex flex-col` + `mt-auto` no botão: sem isso o cartão do plano
        // grátis, que tem menos itens, deixava o botão a meia altura enquanto
        // os vizinhos o mostravam lá embaixo — quatro botões em quatro alturas
        // diferentes.
        art.className = (destaque
          ? 'cartao rounded-2xl border-2 border-mt-gold bg-gradient-to-b from-mt-brand/20 to-transparent p-7 shadow-2xl shadow-mt-brand/20'
          : 'cartao vidro rounded-2xl border border-white/8 p-7') + ' flex flex-col';

        var classePreco = p.sobConsulta ? 'mt-4 text-3xl font-extrabold text-white' : 'mt-4 text-4xl font-extrabold text-white';
        var preco = p.sobConsulta ? 'Sob consulta'
          : !p.precoTelaCents ? 'R$ 0'
            : reais(p.precoTelaCents);
        var sufixo = (!p.sobConsulta && p.precoTelaCents)
          ? '<span class="text-base font-semibold text-mt-ash">/tela</span>' : '';
        var sob = p.sobConsulta ? 'a partir de 20 telas'
          : !p.precoTelaCents ? '1 tela, para sempre' : 'por mês, por tela';

        var itens = [];
        if (p.precoTelaCents === 0 && !p.sobConsulta) {
          itens.push('Editor completo e modelos');
          itens.push(dados.creditosBoasVindas + ' créditos de boas-vindas');
        } else if (p.creditosPorTela) {
          itens.push(p.creditosPorTela + ' créditos de IA por tela, todo mês');
        }
        itens.push(p.gbPorTela + ' GB por tela');
        if (p.recursos.indexOf('mural') >= 0) itens.push('Mural de fotos por QR');
        if (p.recursos.indexOf('som') >= 0) itens.push('Trilha sonora');
        if (p.recursos.indexOf('equipe') >= 0) itens.push('Equipe com papéis');
        if (p.recursos.indexOf('marca') >= 0) itens.push('Marca própria');
        if (p.recursos.indexOf('sso') >= 0) itens.push('SSO e marca branca');

        art.innerHTML =
          (destaque ? '<div class="mb-2 inline-block rounded-full bg-mt-gold px-3 py-0.5 text-[10px] font-extrabold uppercase tracking-widest text-mt-void">mais escolhido</div>' : '') +
          '<h3 class="text-sm font-extrabold uppercase tracking-widest text-mt-ash"></h3>' +
          '<p class="' + classePreco + '">' + preco + sufixo + '</p>' +
          '<p class="mt-1 text-sm text-mt-ash">' + sob + '</p>' +
          '<p class="js-blurb mt-4 text-sm leading-relaxed text-mt-ash/80"></p>' +
          '<ul class="mt-5 space-y-2.5 text-sm text-mt-ash"></ul>' +
          '<div class="mt-auto pt-7"><a href="' + (p.sobConsulta ? '#comecar' : '/app') + '" class="' +
          (destaque
            ? 'botao block rounded-xl bg-mt-gold py-3 text-center text-sm font-extrabold text-mt-void transition'
            : 'block rounded-xl border border-white/15 py-3 text-center text-sm font-bold text-white transition hover:border-mt-beam') +
          '">' + (p.sobConsulta ? 'Falar com a gente' : p.precoTelaCents ? 'Assinar' : 'Começar') + '</a></div>';

        // Nome e blurb entram como TEXTO, e não dentro do HTML montado acima:
        // vêm do servidor, e servidor não é lugar de confiar cegamente.
        art.querySelector('h3').textContent = p.name;
        art.querySelector('.js-blurb').textContent = p.blurb || '';
        var ul = art.querySelector('ul');
        itens.forEach(function (t) {
          var li = document.createElement('li');
          li.innerHTML = '<i class="fa-solid fa-check mr-2 text-emerald-400"></i>';
          li.appendChild(document.createTextNode(t));
          ul.appendChild(li);
        });
        grade.appendChild(art);
      });
    }

    /* ---- A régua de telas ---- */
    var range = document.getElementById('calc-range');
    var saida = document.getElementById('calc-saida');
    var conta = document.getElementById('calc-telas');
    var sim = dados.simulacao || [];
    if (!range || !saida || !sim.length) return;

    var nomes = {};
    (dados.planos || []).forEach(function (p) { nomes[p.id] = p.name; });

    function atualizar() {
      var n = Number(range.value);
      conta.textContent = n;
      var linha = sim[n - 1];
      if (!linha) return;
      saida.innerHTML = '';
      Object.keys(linha).forEach(function (id) {
        if (id === 'telas') return;
        var v = linha[id];
        var d = document.createElement('div');
        d.className = 'rounded-2xl border border-white/10 bg-black/25 p-5';
        d.innerHTML =
          '<p class="text-xs font-extrabold uppercase tracking-widest text-mt-ash"></p>' +
          '<p class="mt-2 text-3xl font-extrabold text-white">' + reais(v.totalCents) +
          '<span class="text-sm font-semibold text-mt-ash">/mês</span></p>' +
          '<p class="mt-1 text-sm text-mt-ash">' + reais(v.porTelaCents) + ' por tela' +
          (v.desconto > 0.001
            ? ' <span class="ml-1 rounded-full bg-emerald-400/15 px-2 py-0.5 text-xs font-bold text-emerald-400">−' +
              Math.round(v.desconto * 100) + '% na média</span>'
            : '') +
          '</p>';
        d.querySelector('p').textContent = nomes[id] || id;
        saida.appendChild(d);
      });
    }
    range.addEventListener('input', atualizar);
    atualizar();
  }

  /* ---------- Digitação do prompt da IA ---------- */
  function digitar() {
    var el = document.getElementById('prompt-ia');
    if (!el) return;
    var frases = [
      'promoção de terça no restaurante, 20% no almoço',
      'campanha de segurança para a fábrica, tom sério',
      'boas-vindas para a visita da diretoria amanhã',
    ];
    var i = 0, j = 0, apagando = false;
    (function passo() {
      var f = frases[i];
      el.textContent = f.slice(0, j) + '▋';
      if (!apagando && j < f.length) { j++; setTimeout(passo, 42); }
      else if (!apagando) { apagando = true; setTimeout(passo, 1900); }
      else if (j > 0) { j--; setTimeout(passo, 18); }
      else { apagando = false; i = (i + 1) % frases.length; setTimeout(passo, 260); }
    })();
  }

  /* ---------- Eventos ---------- */
  window.addEventListener('resize', function () {
    if (!temWebGL || !render3d) return;
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    render3d.setSize(window.innerWidth, window.innerHeight);
  });

  window.addEventListener('pointermove', function (e) {
    mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
    mouse.y = (e.clientY / window.innerHeight) * 2 - 1;
  });

  /*
   * Brilho que segue o mouse dentro de cada cartão.
   *
   * Delegado no documento, e não preso a cada cartão: a galeria de modelos é
   * refeita toda vez que se troca a cor ou o formato, e cartões criados
   * depois nunca receberiam um ouvinte pendurado na partida.
   */
  document.addEventListener('pointermove', function (e) {
    var card = e.target.closest && e.target.closest('.cartao');
    if (!card) return;
    var r = card.getBoundingClientRect();
    card.style.setProperty('--mx', (e.clientX - r.left) + 'px');
    card.style.setProperty('--my', (e.clientY - r.top) + 'px');
  });

  // Navegação: vidro mais opaco depois do topo
  var nav = document.getElementById('nav');
  window.addEventListener('scroll', function () {
    nav.classList.toggle('vidro-forte', window.scrollY > 40);
    nav.classList.toggle('shadow-xl', window.scrollY > 40);
  });
  document.getElementById('menu-btn').addEventListener('click', function () {
    document.getElementById('menu').classList.toggle('hidden');
  });
  document.querySelectorAll('#menu a').forEach(function (a) {
    a.addEventListener('click', function () { document.getElementById('menu').classList.add('hidden'); });
  });

  /* ---------- Partida ---------- */
  window.addEventListener('load', function () {
    setTimeout(function () {
      var pre = document.getElementById('preloader');
      pre.style.opacity = '0';
      setTimeout(function () { pre.style.display = 'none'; }, 700);

      if (temWebGL) montarCena();
      ligarScroll();
      animar();
      miniEditor();
      digitar();
      montarControles();
      pintarGaleria();
      precos();

      // Entrada do título, letra por bloco
      gsap.fromTo('#titulo', { y: 40, opacity: 0 }, { y: 0, opacity: 1, duration: 1.1, ease: 'power4.out' });
    }, menosMovimento ? 100 : 1400);
  });
})();
