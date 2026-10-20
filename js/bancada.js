/*
 * js/bancada.js — a bancada onde o dono aprova as peças-ouro (PLANO §4.8).
 *
 * Dois jeitos de olhar, e os dois usam o MESMO desenhista da TV
 * (js/peca-render.js) — aprovar aqui tem que valer lá:
 *
 *   Peça           uma peça em todas as zonas onde ela pode aparecer, em cada
 *                  modo e marca.
 *   Tela completa  a tela inteira montada como a TV monta (layouts de
 *                  js/templates.js), com as peças de cada zona se revezando.
 *                  É onde se vê a COERÊNCIA — peça por peça ela não aparece.
 *
 * Tudo é desenhado no tamanho REAL (1920×1080, ou 1080×1920 em pé) e só
 * reduzido para caber. Reduzir antes de desenhar mentiria: as consultas de
 * @container veriam uma lateral de 100px em vez de 515px, e a peça
 * escolheria o layout errado.
 *
 * A porta (js/peca-html.js) roda aqui também, e o que ela recusar aparece no
 * topo — a bancada é o primeiro lugar onde uma peça nova é conferida.
 */
(function () {
  'use strict';

  // As zonas de cada papel, em pixels reais (layout Corporativo em 1080p).
  const ZONAS = {
    destaque: [
      { nome: 'Destaque · Corporativo', w: 1405, h: 832 },
      { nome: 'Tela cheia 16:9', w: 1920, h: 1080 },
      { nome: 'Vertical 9:16', w: 1080, h: 1920 },
      { nome: 'Quadrada 1:1', w: 1080, h: 1080 },
    ],
    lateral: [{ nome: 'Lateral · Corporativo', w: 515, h: 832 }],
    cabecalho: [{ nome: 'Cabeçalho 16:9', w: 1920, h: 130 }, { nome: 'Cabeçalho vertical', w: 1080, h: 173 }],
    rodape: [{ nome: 'Rodapé 16:9', w: 1920, h: 119 }, { nome: 'Rodapé vertical', w: 1080, h: 134 }],
  };
  const TETO = { w: 440, h: 330 };
  // Layouts que a tela completa sabe montar, e qual grupo de peças vai em cada zona.
  const LAYOUTS_DA_TELA = ['corporate', 'sidebar-right', 'header-main-ticker', 'full-ticker', 'portrait-stack'];
  const GRUPO_DA_ZONA = { cabecalho: 'cabecalho', principal: 'principal', video: 'principal', lateral: 'lateral',
    info: 'lateral', secundaria: 'lateral', rodape: 'rodape' };
  const GIRO_MS = 8000;

  const $ = (id) => document.getElementById(id);
  const arquivos = {};
  let manifesto = null;
  let giros = [];

  async function lerPeca(id) {
    if (!arquivos[id]) {
      const r = await fetch('/pecas-ouro/' + encodeURIComponent(id) + '.html', { cache: 'no-store' });
      if (!r.ok) throw new Error('peça não encontrada: ' + id);
      arquivos[id] = MTPecaHtml.doArquivo(await r.text());
    }
    return arquivos[id];
  }
  const defDe = (id) => manifesto.pecas.find((p) => p.id === id) || { id, campos: {} };
  const marcaDe = (id) => manifesto.marcas.find((m) => m.id === id) || manifesto.marcas[0];
  const marcaDoItem = (m) => ({ cores: m.cores, fonteTitulo: m.fonteTitulo, fonteApoio: m.fonteApoio });

  function opcao(sel, valor, rotulo) {
    const o = document.createElement('option');
    o.value = valor;
    o.textContent = rotulo;
    sel.appendChild(o);
  }

  const escapar = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
  function lista(titulo, itens, classe) {
    if (!itens.length) return '';
    return '<div class="' + classe + '"><b>' + titulo + '</b><ul>' + itens.map((x) => '<li>' + escapar(x) + '</li>').join('') + '</ul></div>';
  }

  /*
   * Texto que sai da peça é o defeito que mais aparece e o que menos se vê
   * numa miniatura: um centímetro de manchete cortado na borda. Mede depois
   * que as fontes chegam e que as entradas animadas terminam (elas começam
   * deslocadas de propósito).
   */
  async function vazamentos(host) {
    await document.fonts.ready;
    await new Promise((r) => setTimeout(r, 2500));
    const sr = host.shadowRoot;
    const peca = sr && sr.querySelector('.mt-peca');
    if (!peca) return [];
    /*
     * As entradas são ADIANTADAS até o fim antes de medir. Com a aba em
     * segundo plano o navegador não anda as animações, e o que entra pela
     * direita era medido ainda fora do lugar — e acusado como vazamento
     * (visto na primeira rodada do lote 1). As infinitas (movimento
     * contínuo, rolagem do rodapé) não terminam e ficam como estão.
     */
    (sr.getAnimations ? sr.getAnimations() : []).forEach((a) => {
      try { if (a.effect.getComputedTiming().iterations !== Infinity) a.finish(); } catch (e) { /* segue */ }
    });
    const p = peca.getBoundingClientRect();
    const fora = [];
    sr.querySelectorAll('[data-campo]').forEach((el) => {
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) return;
      if (r.left < p.left - 1 || r.right > p.right + 1 || r.top < p.top - 1 || r.bottom > p.bottom + 1) fora.push(el.getAttribute('data-campo'));
    });
    return fora;
  }

  /*
   * Uma peça de tela pode ser só o id ou { id, campos }: os campos da tela
   * (o texto daquela campanha) vencem os de exemplo da biblioteca.
   */
  const entradaDe = (e) => (typeof e === 'string' ? { id: e, campos: {} } : { id: e.id, campos: e.campos || {} });

  function montarPeca(host, arq, def, papel, marca, modo, extra) {
    const x = extra || {};
    return MTPecaRender.montar(host, {
      type: 'peca-html', papel, html: arq.html, css: arq.css,
      campos: Object.assign({}, def.campos || {}, x.campos || {}),
      modo: modo === 'rascunho' ? 'escuro' : modo, marca: marcaDoItem(marca),
    }, {
      rascunho: modo === 'rascunho',
      marcaNaTela: !!x.marcaNaTela,
      clima: () => Promise.resolve('27°'),
      mensagens: manifesto.mensagens || [],
    });
  }

  // Uma moldura no tamanho real, reduzida para caber no teto dado.
  function moldura(w, h, teto) {
    const escala = Math.min(teto.w / w, teto.h / h);
    const caixa = document.createElement('div');
    caixa.className = 'moldura';
    caixa.style.width = Math.round(w * escala) + 'px';
    caixa.style.height = Math.round(h * escala) + 'px';
    const real = document.createElement('div');
    real.className = 'real';
    real.style.width = w + 'px';
    real.style.height = h + 'px';
    real.style.transform = 'scale(' + escala + ')';
    caixa.appendChild(real);
    return { caixa, real };
  }

  /* ---------------- Uma peça, em todas as zonas ---------------- */

  async function desenharPeca() {
    const def = defDe($('peca').value);
    const marca = marcaDe($('marca').value);
    const modos = $('modo').value === 'todos' ? MTTokens.MODOS : [$('modo').value];
    const arq = await lerPeca(def.id);

    const conferida = MTPecaHtml.higienizar(arq);
    $('problemas').innerHTML = lista('A porta recusou:', conferida.problemas, 'problemas')
      + lista('Avisos:', conferida.avisos, 'problemas');
    $('info').innerHTML = '<b>' + escapar(def.nome) + '</b> · família ' + escapar(def.familia) + ' · ' + def.estado
      + ' · ' + conferida.campos.length + ' campos · marca ' + escapar(marca.nome);

    const palco = $('palco');
    palco.textContent = '';
    for (const papel of def.papeis) {
      for (const zona of ZONAS[papel] || []) {
        const linha = document.createElement('section');
        linha.className = 'linha';
        const h2 = document.createElement('h2');
        h2.textContent = zona.nome + ' · ' + zona.w + '×' + zona.h;
        linha.appendChild(h2);
        const grade = document.createElement('div');
        grade.className = 'grade';
        for (const modo of modos) {
          const fig = document.createElement('figure');
          const m = moldura(zona.w, zona.h, TETO);
          montarPeca(m.real, arq, def, papel, marca, modo);
          const legenda = document.createElement('figcaption');
          legenda.textContent = modo;
          vazamentos(m.real).then((fora) => {
            if (!fora.length) return;
            legenda.textContent = modo + ' · VAZA: ' + fora.join(', ');
            legenda.classList.add('ruim');
          });
          fig.appendChild(m.caixa);
          fig.appendChild(legenda);
          grade.appendChild(fig);
        }
        linha.appendChild(grade);
        palco.appendChild(linha);
      }
    }
  }

  /* ---------------- A tela completa ---------------- */

  // Converte a grade do layout (que mede em vh da TV) para pixels da tela real.
  const emPx = (trilha, altura) => String(trilha).replace(/(\d+(?:\.\d+)?)vh/g, (m, n) => (Number(n) * altura / 100) + 'px');

  async function desenharTela() {
    const tela = manifesto.telas.find((t) => t.id === $('tela').value) || manifesto.telas[0];
    const layout = MT_getLayout($('layout').value || tela.layout);
    const emPe = layout.orientation === 'portrait';
    const W = emPe ? 1080 : 1920;
    const H = emPe ? 1920 : 1080;
    const marca = marcaDe(tela.marca);

    // Toda peça da tela passa pela porta antes de ir para a parede.
    const problemas = [];
    for (const grupo of Object.keys(tela.zonas)) {
      for (const e of tela.zonas[grupo].pecas.map(entradaDe)) {
        const r = MTPecaHtml.higienizar(await lerPeca(e.id));
        r.problemas.forEach((p) => problemas.push(e.id + ': ' + p));
      }
    }
    // Layout com cabeçalho já mostra a marca — mesma regra do player.
    const marcaNaTela = layout.zones.some((z) => z.type === 'header');
    $('problemas').innerHTML = lista('A porta recusou:', problemas, 'problemas');
    $('info').innerHTML = '<b>' + escapar(tela.nome) + '</b> · ' + tela.estado + ' · layout ' + escapar(layout.name)
      + ' · as peças de cada zona se revezam a cada ' + GIRO_MS / 1000 + 's';

    const palco = $('palco');
    palco.textContent = '';
    const teto = emPe ? { w: 520, h: 900 } : { w: Math.min(1400, innerWidth - 40), h: 900 };
    const m = moldura(W, H, teto);
    const tv = m.real;
    tv.classList.add('tv');
    tv.style.gridTemplateColumns = layout.grid.columns;
    tv.style.gridTemplateRows = emPx(layout.grid.rows, H);
    tv.style.gridTemplateAreas = layout.grid.areas.map((a) => '"' + a + '"').join(' ');
    const fresta = (1.1 * H / 100) + 'px';
    tv.style.gap = fresta;
    tv.style.padding = fresta;

    for (const zona of layout.zones) {
      const grupo = tela.zonas[GRUPO_DA_ZONA[zona.id]];
      const caixa = document.createElement('div');
      caixa.className = 'zona';
      caixa.style.gridArea = zona.area;
      tv.appendChild(caixa);
      if (!grupo) { caixa.classList.add('vazia'); caixa.textContent = zona.name; continue; }

      const papel = zona.type === 'header' ? 'cabecalho' : zona.type === 'ticker' ? 'rodape'
        : GRUPO_DA_ZONA[zona.id] === 'lateral' ? 'lateral' : 'destaque';
      let i = 0;
      const mostrar = async () => {
        const e = entradaDe(grupo.pecas[i % grupo.pecas.length]);
        i++;
        const host = document.createElement('div');
        host.className = 'host';
        caixa.textContent = '';
        caixa.appendChild(host);
        montarPeca(host, await lerPeca(e.id), defDe(e.id), papel, marca, grupo.modo,
          { campos: e.campos, marcaNaTela: marcaNaTela && papel !== 'cabecalho' && papel !== 'rodape' });
      };
      await mostrar();
      if (grupo.pecas.length > 1) giros.push(setInterval(mostrar, GIRO_MS));
    }
    palco.appendChild(m.caixa);
  }

  function desenhar() {
    giros.forEach(clearInterval);
    giros = [];
    const tela = $('ver').value === 'tela';
    document.body.classList.toggle('modo-tela', tela);
    return tela ? desenharTela() : desenharPeca();
  }

  async function iniciar() {
    manifesto = await (await fetch('/pecas-ouro/manifesto.json', { cache: 'no-store' })).json();
    opcao($('ver'), 'peca', 'Uma peça');
    opcao($('ver'), 'tela', 'Tela completa');
    manifesto.pecas.forEach((p) => opcao($('peca'), p.id, p.nome + (p.estado === 'aprovada' ? ' ✓' : '')));
    manifesto.marcas.forEach((m) => opcao($('marca'), m.id, m.nome));
    opcao($('modo'), 'todos', 'Os quatro');
    MTTokens.MODOS.forEach((m) => opcao($('modo'), m, m));
    (manifesto.telas || []).forEach((t) => opcao($('tela'), t.id, t.nome + (t.estado === 'aprovada' ? ' ✓' : '')));
    LAYOUTS_DA_TELA.forEach((id) => opcao($('layout'), id, MT_getLayout(id).name));
    const primeira = (manifesto.telas || [])[0];
    if (primeira) $('layout').value = primeira.layout;

    // A escolha fica na URL: dá para mandar o link de uma combinação.
    const CHAVES = ['ver', 'peca', 'marca', 'modo', 'tela', 'layout'];
    const q = new URLSearchParams(location.search);
    CHAVES.forEach((k) => { if (q.get(k)) $(k).value = q.get(k); });
    CHAVES.forEach((k) => $(k).addEventListener('change', () => {
      const p = new URLSearchParams();
      CHAVES.forEach((c) => p.set(c, $(c).value));
      history.replaceState(null, '', '?' + p);
      desenhar();
    }));
    $('rodar').addEventListener('click', desenhar);
    desenhar();
  }

  iniciar().catch((e) => { $('problemas').innerHTML = '<div class="problemas">' + escapar(e.message) + '</div>'; });
})();
