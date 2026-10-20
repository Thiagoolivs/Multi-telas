/*
 * js/bancada.js — a bancada onde o dono aprova as peças-ouro (PLANO §4.8).
 *
 * Mostra UMA peça em todas as zonas onde ela pode aparecer, em cada modo e
 * marca, desenhada pelo MESMO renderizador da TV (js/peca-render.js). Aprovar
 * aqui tem que valer lá — por isso nada nesta página desenha a peça por
 * conta própria.
 *
 * Cada zona é desenhada no tamanho REAL (as medidas do layout Corporativo
 * em 1080p, js/templates.js) e reduzida para caber na tela. Reduzir antes de
 * desenhar mentiria: as consultas de @container veriam uma lateral de 100px
 * em vez de 515px, e a peça escolheria o layout errado.
 *
 * A porta (js/peca-html.js) roda aqui também, e o que ela recusar aparece no
 * topo — a bancada é o primeiro lugar onde uma peça nova é conferida.
 */
(function () {
  'use strict';

  // As zonas de cada papel, em pixels reais.
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
  const MENSAGENS = ['10x sem juros no cartão', 'Aberto até 19h', '@oticacentral'];

  const $ = (id) => document.getElementById(id);
  const arquivos = {};
  let manifesto = null;

  async function lerPeca(id) {
    if (!arquivos[id]) {
      const r = await fetch('/pecas-ouro/' + encodeURIComponent(id) + '.html', { cache: 'no-store' });
      if (!r.ok) throw new Error('peça não encontrada: ' + id);
      arquivos[id] = MTPecaHtml.doArquivo(await r.text());
    }
    return arquivos[id];
  }

  /*
   * Texto que sai da peça é o defeito que mais aparece e o que menos se vê
   * numa miniatura: um centímetro de manchete cortado na borda. A bancada
   * mede depois que as fontes chegam e depois que as entradas animadas
   * terminam (elas começam deslocadas de propósito), e escreve na legenda.
   */
  async function vazamentos(host) {
    await document.fonts.ready;
    await new Promise((r) => setTimeout(r, 2500));
    const sr = host.shadowRoot;
    const peca = sr && sr.querySelector('.mt-peca');
    if (!peca) return [];
    const p = peca.getBoundingClientRect();
    const fora = [];
    sr.querySelectorAll('[data-campo]').forEach((el) => {
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) return;
      if (r.left < p.left - 1 || r.right > p.right + 1 || r.top < p.top - 1 || r.bottom > p.bottom + 1) fora.push(el.getAttribute('data-campo'));
    });
    return fora;
  }

  function opcao(sel, valor, rotulo) {
    const o = document.createElement('option');
    o.value = valor;
    o.textContent = rotulo;
    sel.appendChild(o);
  }

  function lista(titulo, itens, classe) {
    if (!itens.length) return '';
    const li = itens.map((x) => '<li>' + x.replace(/</g, '&lt;') + '</li>').join('');
    return '<div class="' + classe + '"><b>' + titulo + '</b><ul>' + li + '</ul></div>';
  }

  async function desenhar() {
    const def = manifesto.pecas.find((p) => p.id === $('peca').value) || manifesto.pecas[0];
    const marca = manifesto.marcas.find((m) => m.id === $('marca').value) || manifesto.marcas[0];
    const modos = $('modo').value === 'todos' ? MTTokens.MODOS : [$('modo').value];
    const arq = await lerPeca(def.id);

    const conferida = MTPecaHtml.higienizar(arq);
    $('problemas').innerHTML = lista('A porta recusou:', conferida.problemas, 'problemas')
      + lista('Avisos:', conferida.avisos, 'problemas');
    $('info').innerHTML = '<b>' + def.nome + '</b> · família ' + def.familia + ' · ' + def.estado
      + ' · ' + conferida.campos.length + ' campos · marca ' + marca.nome;

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
          const escala = Math.min(TETO.w / zona.w, TETO.h / zona.h);
          const fig = document.createElement('figure');
          const moldura = document.createElement('div');
          moldura.className = 'moldura';
          moldura.style.width = Math.round(zona.w * escala) + 'px';
          moldura.style.height = Math.round(zona.h * escala) + 'px';
          const real = document.createElement('div');
          real.className = 'real';
          real.style.width = zona.w + 'px';
          real.style.height = zona.h + 'px';
          real.style.transform = 'scale(' + escala + ')';
          moldura.appendChild(real);
          MTPecaRender.montar(real, {
            type: 'peca-html', papel, html: arq.html, css: arq.css, campos: def.campos || {},
            modo: modo === 'rascunho' ? 'escuro' : modo,
            marca: { cores: marca.cores, fonteTitulo: marca.fonteTitulo, fonteApoio: marca.fonteApoio },
          }, {
            rascunho: modo === 'rascunho',
            clima: () => Promise.resolve('27°'),
            mensagens: MENSAGENS,
          });
          const legenda = document.createElement('figcaption');
          legenda.textContent = modo;
          vazamentos(real).then((fora) => {
            if (!fora.length) return;
            legenda.textContent = modo + ' · VAZA: ' + fora.join(', ');
            legenda.style.color = '#ff9b9b';
          });
          fig.appendChild(moldura);
          fig.appendChild(legenda);
          grade.appendChild(fig);
        }
        linha.appendChild(grade);
        palco.appendChild(linha);
      }
    }
  }

  async function iniciar() {
    manifesto = await (await fetch('/pecas-ouro/manifesto.json', { cache: 'no-store' })).json();
    manifesto.pecas.forEach((p) => opcao($('peca'), p.id, p.nome + (p.estado === 'aprovada' ? ' ✓' : '')));
    manifesto.marcas.forEach((m) => opcao($('marca'), m.id, m.nome));
    opcao($('modo'), 'todos', 'Os quatro');
    MTTokens.MODOS.forEach((m) => opcao($('modo'), m, m));
    // Lembra a última escolha pela URL: dá para mandar o link de uma combinação.
    const q = new URLSearchParams(location.search);
    ['peca', 'marca', 'modo'].forEach((k) => { if (q.get(k)) $(k).value = q.get(k); });
    ['peca', 'marca', 'modo'].forEach((k) => $(k).addEventListener('change', () => {
      const p = new URLSearchParams({ peca: $('peca').value, marca: $('marca').value, modo: $('modo').value });
      history.replaceState(null, '', '?' + p);
      desenhar();
    }));
    $('rodar').addEventListener('click', desenhar);
    desenhar();
  }

  iniciar().catch((e) => { $('problemas').innerHTML = '<div class="problemas">' + String(e.message).replace(/</g, '&lt;') + '</div>'; });
})();
