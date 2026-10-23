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
  const NOME_DO_PERFIL = { comercio: 'Comércio', empresa: 'Empresa', saude: 'Saúde' };
  const LAYOUTS_DA_TELA = ['corporate', 'sidebar-right', 'header-main-ticker', 'full-ticker', 'portrait-stack'];
  const GRUPO_DA_ZONA = { cabecalho: 'cabecalho', principal: 'principal', video: 'principal', lateral: 'lateral',
    info: 'lateral', secundaria: 'lateral', rodape: 'rodape' };
  const GIRO_MS = 8000;

  const $ = (id) => document.getElementById(id);
  // "Tamanho real": sem redução, um pixel da peça por pixel da tela — para conferir o acabamento.
  const real = () => $('tamanho').value === 'real';
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
   * Vazamento e texto sobre texto: o detector mora em js/peca-conferir.js,
   * o mesmo que o painel usa ao editar e ao revisar a campanha. Aqui as
   * entradas animam, então ele espera antes de medir. O papel diz que
   * regras de composição valem (D44: margem, QR, letra mínima).
   */
  const vazamentos = (host, papel) => MTPecaConferir.conferir(host, { esperar: 2500, papel });
  const regrasEmTexto = (d) => (d.regras || []).map((r) => r.campo + ': ' + r.texto);

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
      leve: !!x.leve,
      marcaNaTela: !!x.marcaNaTela,
      clima: () => Promise.resolve('27°'),
      mensagens: x.mensagens || [],
      contagem: alvoDaContagem(),
    });
  }

  // A contagem na bancada: sempre dois dias e quatro horas à frente, para a peça mostrar o número cheio.
  function alvoDaContagem() {
    const d = new Date(Date.now() + (2 * 24 + 4) * 3600 * 1000);
    const z = (n) => String(n).padStart(2, '0');
    return d.getFullYear() + '-' + z(d.getMonth() + 1) + '-' + z(d.getDate()) + 'T' + z(d.getHours()) + ':' + z(d.getMinutes());
  }

  /*
   * As mensagens do rodapé são de cada tela (a da ótica fala de exame de
   * vista; a da padaria, de encomenda de bolo). Olhando uma peça só, vale a
   * primeira tela da marca escolhida.
   */
  const mensagensDaMarca = (id) => {
    const telas = manifesto.telas || [];
    const t = telas.find((x) => x.marca === id) || telas[0];
    return (t && t.mensagens) || [];
  };

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
          const m = moldura(zona.w, zona.h, real() ? zona : TETO);
          montarPeca(m.real, arq, def, papel, marca, modo, { mensagens: mensagensDaMarca(marca.id) });
          const legenda = document.createElement('figcaption');
          legenda.textContent = modo;
          vazamentos(m.real, papel).then((d) => {
            const ruim = (d.fora.length ? ' · VAZA: ' + d.fora.join(', ') : '') + (d.juntos.length ? ' · SOBREPÕE: ' + d.juntos.join(', ') : '');
            if (ruim) {
              legenda.textContent = modo + ruim;
              legenda.classList.add('ruim');
            }
            // D44: fora da régua não é "não coube" — vai embaixo, em outra cor.
            const regras = regrasEmTexto(d);
            if (regras.length) legenda.insertAdjacentHTML('beforeend', lista('', regras, 'regras'));
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

  let rodadaDaTela = 0;
  async function desenharTela() {
    rodadaDaTela++;
    document.body.dataset.conferida = 'nao';
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
    $('info').innerHTML = '<b>' + escapar(tela.nome) + '</b> · ' + tela.estado
      + (tela.estrutura ? ' · ' + escapar(tela.estrutura) : '') + ' · layout ' + escapar(layout.name)
      + ' · as peças de cada zona se revezam a cada ' + GIRO_MS / 1000 + 's'
      + (tela.sobre ? '<br>' + escapar(tela.sobre) : '');

    const palco = $('palco');
    palco.textContent = '';
    // A janela pode abrir escondida, com largura 0: a moldura nunca fica menor que 640.
    const teto = emPe ? { w: 520, h: 900 } : { w: Math.min(1400, Math.max(640, innerWidth - 40)), h: 900 };
    const m = moldura(W, H, real() ? { w: W, h: H } : teto);
    const tv = m.real;
    tv.classList.add('tv');
    tv.style.gridTemplateColumns = layout.grid.columns;
    tv.style.gridTemplateRows = emPx(layout.grid.rows, H);
    tv.style.gridTemplateAreas = layout.grid.areas.map((a) => '"' + a + '"').join(' ');
    const fresta = (1.1 * H / 100) + 'px';
    tv.style.gap = fresta;
    tv.style.padding = fresta;

    const medir = [];
    for (const zona of layout.zones) {
      const grupo = tela.zonas[GRUPO_DA_ZONA[zona.id]];
      const caixa = document.createElement('div');
      caixa.className = 'zona';
      caixa.style.gridArea = zona.area;
      tv.appendChild(caixa);
      if (!grupo) { caixa.classList.add('vazia'); caixa.textContent = zona.name; continue; }

      const papel = zona.type === 'header' ? 'cabecalho' : zona.type === 'ticker' ? 'rodape'
        : GRUPO_DA_ZONA[zona.id] === 'lateral' ? 'lateral' : 'destaque';
      medir.push({ caixa, grupo, papel, nome: zona.name });
      let i = 0;
      const mostrar = async () => {
        const e = entradaDe(grupo.pecas[i % grupo.pecas.length]);
        i++;
        const host = document.createElement('div');
        host.className = 'host';
        caixa.textContent = '';
        caixa.appendChild(host);
        montarPeca(host, await lerPeca(e.id), defDe(e.id), papel, marca, grupo.modo,
          { campos: e.campos, marcaNaTela: marcaNaTela && papel !== 'cabecalho' && papel !== 'rodape', mensagens: tela.mensagens || [] });
      };
      await mostrar();
      if (grupo.pecas.length > 1) giros.push(setInterval(mostrar, GIRO_MS));
    }
    palco.appendChild(m.caixa);

    /*
     * D18: a tela é conferida inteira de uma vez — cada peça de cada zona,
     * no tamanho real da zona, fora da vista. Girando, só se vê uma peça
     * por vez, e o que vazava na terceira passava sem ninguém notar.
     */
    const rodada = rodadaDaTela;
    const achados = await Promise.all(medir.flatMap(({ caixa, grupo, papel, nome }) => grupo.pecas.map(entradaDe).map(async (e) => {
      const host = document.createElement('div');
      host.className = 'host medida';
      host.style.width = caixa.offsetWidth + 'px';
      host.style.height = caixa.offsetHeight + 'px';
      tv.appendChild(host);
      montarPeca(host, await lerPeca(e.id), defDe(e.id), papel, marca, grupo.modo,
        { campos: e.campos, marcaNaTela: marcaNaTela && papel !== 'cabecalho' && papel !== 'rodape', mensagens: tela.mensagens || [] });
      const d = await vazamentos(host, papel);
      host.remove();
      return {
        coube: (d.fora.length ? nome + ' · ' + e.id + ' · VAZA: ' + d.fora.join(', ') : '')
          + (d.juntos.length ? nome + ' · ' + e.id + ' · SOBREPÕE: ' + d.juntos.join(', ') : ''),
        regras: regrasEmTexto(d).map((t) => nome + ' · ' + e.id + ' · ' + t),
      };
    })));
    if (rodada !== rodadaDaTela) return;
    $('problemas').insertAdjacentHTML('beforeend', lista('Não coube:', achados.map((a) => a.coube).filter(Boolean), 'problemas')
      + lista('Fora da régua de composição:', achados.flatMap((a) => a.regras), 'problemas'));
    document.body.dataset.conferida = 'sim';
  }

  /*
   * D44: a biblioteca inteira de uma vez — cada peça, em cada zona do papel
   * dela, nas marcas todas, clara e escura — contra o detector e as regras
   * de composição. A peça-ouro é o exemplo que a IA imita: defeito aqui
   * vira defeito em toda geração. Desenha parado (leve) e fora da vista; o
   * que acha vai agrupado por peça, zona, campo e regra.
   */
  async function conferirBiblioteca() {
    const botao = $('biblioteca');
    botao.disabled = true;
    document.body.dataset.biblioteca = 'conferindo';
    const tarefas = [];
    for (const def of manifesto.pecas) {
      for (const papel of def.papeis) {
        for (const zona of ZONAS[papel] || []) {
          for (const marca of manifesto.marcas) for (const modo of ['claro', 'escuro']) tarefas.push({ def, papel, zona, marca, modo });
        }
      }
    }
    const caixa = document.createElement('div');
    caixa.style.cssText = 'position:fixed;left:0;top:0;width:0;height:0;overflow:visible;opacity:0;pointer-events:none;z-index:-1';
    document.body.appendChild(caixa);
    const grupos = new Map();
    const anotar = (t, campo, texto) => {
      const k = t.def.id + ' · ' + t.zona.nome + ' · ' + campo + ': ' + texto.replace(/\(.*\)$/, '').trim();
      const g = grupos.get(k) || { exemplo: texto, onde: [] };
      g.onde.push(t.marca.nome + ' ' + t.modo);
      grupos.set(k, g);
    };
    try {
      for (let i = 0; i < tarefas.length; i++) {
        const t = tarefas[i];
        if (i % 25 === 0) botao.textContent = 'Conferindo… ' + i + ' de ' + tarefas.length;
        const host = document.createElement('div');
        host.style.cssText = 'position:absolute;left:0;top:0;width:' + t.zona.w + 'px;height:' + t.zona.h + 'px;container-type:size';
        caixa.appendChild(host);
        const ctl = montarPeca(host, await lerPeca(t.def.id), t.def, t.papel, t.marca, t.modo, { leve: true, mensagens: mensagensDaMarca(t.marca.id) });
        const d = await MTPecaConferir.conferir(host, { papel: t.papel });
        if (ctl && ctl.parar) ctl.parar();
        host.remove();
        d.fora.forEach((n) => anotar(t, n, 'passa da borda'));
        d.juntos.forEach((par) => anotar(t, par, 'um sobre o outro'));
        (d.regras || []).forEach((r) => anotar(t, r.campo, r.texto));
      }
    } finally {
      caixa.remove();
      botao.disabled = false;
      botao.textContent = 'Conferir a biblioteca';
    }
    const linhas = [...grupos.entries()].map(([k, g]) => k.replace(/: .*$/, '') + ': ' + g.exemplo + ' — em ' + g.onde.length + ' de ' + (manifesto.marcas.length * 2) + ' (' + g.onde.slice(0, 3).join(', ') + (g.onde.length > 3 ? '…' : '') + ')');
    $('problemas').innerHTML = linhas.length
      ? lista('A biblioteca tem ' + linhas.length + ' defeito(s) em ' + tarefas.length + ' montagens:', linhas, 'problemas')
      : '<div class="info"><b>Biblioteca conferida:</b> ' + tarefas.length + ' montagens (' + manifesto.pecas.length + ' peças × zonas × marcas × claro/escuro), nada vaza, nada se sobrepõe e as regras de composição passam.</div>';
    window.MTBibliotecaConferida = { montagens: tarefas.length, defeitos: linhas };
    document.body.dataset.biblioteca = 'conferida';
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
    // D18: as telas prontas chegam em lotes, por perfil; agrupadas, o dono revê um lote de uma vez.
    const grupos = new Map();
    (manifesto.telas || []).forEach((t) => {
      const g = t.lote ? 'Lote ' + t.lote + ' · ' + (NOME_DO_PERFIL[t.perfil] || t.perfil) : 'Telas de exemplo';
      if (!grupos.has(g)) {
        const og = document.createElement('optgroup');
        og.label = g;
        grupos.set(g, og);
        $('tela').appendChild(og);
      }
      opcao(grupos.get(g), t.id, t.nome + (t.estado === 'aprovada' ? ' ✓' : t.estado === 'proposta' ? ' · proposta' : ''));
    });
    LAYOUTS_DA_TELA.forEach((id) => opcao($('layout'), id, MT_getLayout(id).name));
    opcao($('tamanho'), 'caber', 'Caber na janela');
    opcao($('tamanho'), 'real', 'Real (1:1)');
    const primeira = (manifesto.telas || [])[0];
    if (primeira) $('layout').value = primeira.layout;

    // A escolha fica na URL: dá para mandar o link de uma combinação.
    const CHAVES = ['ver', 'peca', 'marca', 'modo', 'tela', 'layout', 'tamanho'];
    const q = new URLSearchParams(location.search);
    CHAVES.forEach((k) => { if (q.get(k)) $(k).value = q.get(k); });
    CHAVES.forEach((k) => $(k).addEventListener('change', () => {
      // Peça nova abre na marca em que nasceu; tela nova, no layout dela.
      if (k === 'peca' && defDe($('peca').value).marca) $('marca').value = defDe($('peca').value).marca;
      if (k === 'tela') $('layout').value = (manifesto.telas.find((t) => t.id === $('tela').value) || {}).layout || $('layout').value;
      const p = new URLSearchParams();
      CHAVES.forEach((c) => p.set(c, $(c).value));
      history.replaceState(null, '', '?' + p);
      desenhar();
    }));
    $('rodar').addEventListener('click', desenhar);
    $('biblioteca').addEventListener('click', () => { conferirBiblioteca(); });
    desenhar();
  }

  iniciar().catch((e) => { $('problemas').innerHTML = '<div class="problemas">' + escapar(e.message) + '</div>'; });
})();
