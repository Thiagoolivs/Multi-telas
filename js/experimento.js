/*
 * js/experimento.js — as notas às cegas do experimento (PLANO §4.4).
 *
 * O dono abre o arquivo que tools/experimento.mjs gravou, vê as peças
 * EMBARALHADAS sem saber qual motor fez cada uma, e dá nota de 1 a 5. A
 * chave só abre no fim — dar nota sabendo de quem é a peça é medir gosto
 * pelo motor, não pela peça.
 *
 * Peça que o motor não entregou (erro, recusada pela porta) entra com nota
 * 1 sozinha: para o cliente, motor que não entrega é tela vazia.
 *
 * A conta (embaralhar, resumir, conferir o critério) é pura e roda no Node
 * também — test/experimento.test.js confere sem navegador.
 */
(function (global) {
  'use strict';

  /* ---------------- A conta ---------------- */

  // Hash curto e estável (djb2) — semente da ordem e nome do que fica salvo.
  function hash(s) {
    let h = 5381;
    for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
    return h.toString(36);
  }

  // Embaralha com semente (mulberry32): a mesma ordem toda vez que o arquivo é reaberto.
  function embaralhar(lista, semente) {
    let a = parseInt(hash(String(semente)), 36) >>> 0;
    const rnd = () => {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const out = lista.slice();
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  }

  const entregou = (r) => !!(r && r.ok && (r.item || (r.itens && Object.keys(r.itens).length)));
  const telaEntregue = (t) => !!(t && (t.zonas || ['cabecalho', 'destaque', 'lateral', 'rodape'].some((z) => entregou(t[z]))));

  /*
   * O que vai ser avaliado: cada peça e, nos casos de tela completa, cada
   * tela. O que falhou vem marcado — não aparece para nota, entra como 1.
   */
  function avaliacoes(dados) {
    const lista = [];
    for (const linha of dados.pecas || []) {
      lista.push({ id: linha.chave + ':peca', tipo: 'peca', linha, falhou: !!linha.erro || !entregou(linha.peca) });
      const pedido = (dados.pedidos || []).find((p) => p.n === linha.n);
      if (pedido && pedido.tela) lista.push({ id: linha.chave + ':tela', tipo: 'tela', linha, falhou: !!linha.erro || !telaEntregue(linha.tela) });
    }
    return lista;
  }

  const media = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

  /*
   * O resumo por motor, separado por tipo (peça e tela). Custo e tempo são
   * da PEÇA — a tela é a soma de quatro composições e entra à parte.
   */
  function resumo(dados, notas) {
    const out = {};
    for (const a of avaliacoes(dados)) {
      const m = a.linha.motor;
      const r = out[m] || (out[m] = { motor: m, rotulo: (dados.motores || {})[m] || m, peca: [], tela: [], falhas: 0, custos: [], tempos: [], primeira: 0, total: 0 });
      const nota = a.falhou ? 1 : notas[a.id];
      if (nota != null) r[a.tipo].push(Number(nota));
      if (a.tipo === 'peca') {
        r.total += 1;
        if (a.falhou) r.falhas += 1;
        const p = a.linha.peca || {};
        if (p.uso) r.custos.push(Number(p.uso.custoCentavos) || 0);
        if (p.ms != null) r.tempos.push(Number(p.ms) || 0);
        if (p.passouDePrimeira && !a.falhou) r.primeira += 1;
      }
    }
    return Object.values(out).map((r) => ({
      motor: r.motor, rotulo: r.rotulo,
      notaPeca: media(r.peca), notasPeca: r.peca.length,
      notaTela: media(r.tela), notasTela: r.tela.length,
      custoMedioReais: r.custos.length ? media(r.custos) / 100 : null,
      tempoMedioS: r.tempos.length ? media(r.tempos) / 1000 : null,
      deprimeira: r.total ? r.primeira / r.total : null,
      falhas: r.falhas, total: r.total,
    }));
  }

  /*
   * O critério do PLANO §4.4 para o HTML virar o motor: média ≥ 4, pelo
   * menos 1 ponto acima do atual, custo médio ≤ R$ 1,00 por criação (sem a
   * imagem). "Nenhuma peça travando no box" é conferido na ótica, à mão.
   */
  function criterio(linhas) {
    const atual = linhas.find((l) => l.motor === 'atual');
    return linhas.filter((l) => l.motor !== 'atual').map((l) => {
      const media4 = l.notaPeca != null && l.notaPeca >= 4;
      const acima = l.notaPeca != null && atual && atual.notaPeca != null ? l.notaPeca - atual.notaPeca >= 1 : null;
      const custo = l.custoMedioReais != null ? l.custoMedioReais <= 1 : null;
      return { motor: l.motor, rotulo: l.rotulo, media4, acima, custo, passa: media4 && acima !== false && custo !== false };
    });
  }

  const conta = { hash, embaralhar, avaliacoes, resumo, criterio };
  if (typeof module !== 'undefined' && module.exports) { module.exports = conta; return; }
  global.MTExperimento = conta;

  /* ---------------- A página ---------------- */

  const $ = (id) => document.getElementById(id);
  let dados = null;
  let ordem = [];
  let notas = {};
  let comentarios = {};
  let pos = 0;
  let salvo = '';

  const guardar = () => { try { localStorage.setItem(salvo, JSON.stringify({ notas, comentarios, pos })); } catch (e) { /* sem armazenamento, só não lembra */ } };
  function lembrar() {
    try { const s = JSON.parse(localStorage.getItem(salvo) || 'null'); if (s) { notas = s.notas || {}; comentarios = s.comentarios || {}; pos = s.pos || 0; } } catch (e) { /* começa do zero */ }
  }

  const paraNota = () => ordem.filter((a) => !a.falhou);
  const feitas = () => paraNota().filter((a) => notas[a.id] != null).length;

  function progresso() {
    const total = paraNota().length;
    $('progresso').innerHTML = '<b>' + feitas() + '</b> de ' + total + ' com nota · '
      + (ordem.length - total) + ' que o motor não entregou (entram com 1)';
    $('revelar').disabled = !dados;
    $('exportar').disabled = !dados;
  }

  // Uma moldura no tamanho real da TV, reduzida para caber — como na bancada.
  function moldura(w, h, largura) {
    const escala = largura / w;
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

  // As mesmas mensagens no rodapé de todo motor: o rodapé é julgado pela pele, não pelo texto.
  const mensagensDe = () => ['Aberto de segunda a sábado', 'Pague com Pix ou cartão', 'Siga a gente nas redes'];

  function montarHtml(host, item, linha, marcaNaTela) {
    MTPecaRender.montar(host, Object.assign({}, item, { marca: item.marca || linha.marca }), {
      marcaNaTela: !!marcaNaTela, clima: () => Promise.resolve('24°'), mensagens: mensagensDe(linha),
    });
  }

  function montarItem(host, item, linha) {
    if (!item) { host.classList.add('falta'); host.textContent = '—'; return; }
    if (item.type === 'peca-html') return montarHtml(host, item, linha);
    // Fora do player o slide não ganha a classe de ativo sozinho, e a composição mede pelo container.
    const r = MTRender.renderItem(item);
    r.el.classList.add('mt-active');
    host.appendChild(r.el);
  }

  function figura(rotulo, w, h, largura, desenhar) {
    const fig = document.createElement('figure');
    const m = moldura(w, h, largura);
    desenhar(m.real);
    const cap = document.createElement('figcaption');
    cap.textContent = rotulo;
    fig.appendChild(m.caixa);
    fig.appendChild(cap);
    return fig;
  }

  function desenharPeca(a) {
    const p = a.linha.peca || {};
    const um = p.item;
    const de = (f) => um || (p.itens || {})[f];
    const telas = document.createElement('div');
    telas.className = 'telas';
    telas.appendChild(figura('TV deitada · 16:9', 1920, 1080, 820, (host) => montarItem(host, de('16/9'), a.linha)));
    telas.appendChild(figura('TV em pé · 9:16', 1080, 1920, 300, (host) => montarItem(host, de('9/16'), a.linha)));
    return telas;
  }

  // A tela completa no layout Corporativo, como o player monta.
  function desenharTela(a) {
    const layout = MT_getLayout('corporate');
    const W = 1920, H = 1080;
    return figura('Tela completa · Corporativo', W, H, 1140, (tv) => {
      tv.classList.add('tv');
      tv.style.gridTemplateColumns = layout.grid.columns;
      tv.style.gridTemplateRows = String(layout.grid.rows).replace(/(\d+(?:\.\d+)?)vh/g, (m, n) => (Number(n) * H / 100) + 'px');
      tv.style.gridTemplateAreas = layout.grid.areas.map((x) => '"' + x + '"').join(' ');
      tv.style.gap = tv.style.padding = (1.1 * H / 100) + 'px';
      const t = a.linha.tela || {};
      const pedido = (dados.pedidos || []).find((p) => p.n === a.linha.n) || {};
      const papelDa = { cabecalho: 'cabecalho', principal: 'destaque', lateral: 'lateral', rodape: 'rodape' };
      for (const z of layout.zones) {
        const caixa = document.createElement('div');
        caixa.className = 'zona';
        caixa.style.gridArea = z.area;
        tv.appendChild(caixa);
        const host = document.createElement('div');
        host.className = 'host';
        caixa.appendChild(host);
        if (t.zonas) {
          // Motor atual: campanha por zona (itens na playlist, mensagens no rodapé, cabeçalho padrão).
          const dz = t.zonas[z.id] || {};
          if (z.type === 'header') { host.className = 'host faixa'; host.textContent = pedido.empresa || ''; }
          else if (z.type === 'ticker') { host.className = 'host faixa'; host.textContent = (dz.messages || []).join('   ·   '); }
          else montarItem(host, (dz.items || [])[0], a.linha);
        } else {
          const r = t[papelDa[z.id]];
          if (r && r.ok) montarHtml(host, r.item, a.linha, z.type !== 'header' && z.type !== 'ticker');
          else { host.classList.add('falta'); host.textContent = '—'; }
        }
      }
    });
  }

  function mostrar() {
    const lista = paraNota();
    const palco = $('palco');
    palco.textContent = '';
    progresso();
    if (!lista.length) { palco.innerHTML = '<div class="vazio"><h2>Nada para dar nota</h2></div>'; return; }
    pos = Math.max(0, Math.min(pos, lista.length - 1));
    const a = lista[pos];
    const pedido = (dados.pedidos || []).find((p) => p.n === a.linha.n) || {};
    const topo = document.createElement('p');
    topo.className = 'pedido';
    topo.innerHTML = (a.tipo === 'tela' ? 'Tela completa' : 'Peça') + ' ' + (pos + 1) + ' de ' + lista.length + ' · ' + escapar(pedido.empresa || '')
      + '<b>"' + escapar(pedido.pedido || '') + '"</b>';
    palco.appendChild(topo);
    palco.appendChild(a.tipo === 'tela' ? desenharTela(a) : desenharPeca(a));

    const barra = document.createElement('div');
    barra.className = 'notas';
    for (let n = 1; n <= 5; n++) {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = String(n);
      if (notas[a.id] === n) b.classList.add('escolhida');
      b.addEventListener('click', () => darNota(a, n));
      barra.appendChild(b);
    }
    const dica = document.createElement('small');
    dica.textContent = '1 ruim · 3 aceitável · 5 de agência — teclas 1 a 5, ← →';
    barra.appendChild(dica);
    palco.appendChild(barra);

    const txt = document.createElement('textarea');
    txt.className = 'comentario';
    txt.placeholder = 'Comentário (opcional): o que está errado ou bom nesta peça';
    txt.value = comentarios[a.id] || '';
    txt.addEventListener('input', () => { comentarios[a.id] = txt.value; guardar(); });
    palco.appendChild(txt);

    const nav = document.createElement('div');
    nav.className = 'nav';
    const ant = document.createElement('button'); ant.textContent = '← Anterior'; ant.disabled = pos === 0; ant.onclick = () => { pos--; guardar(); mostrar(); };
    const prox = document.createElement('button'); prox.textContent = 'Próxima →'; prox.disabled = pos >= lista.length - 1; prox.onclick = () => { pos++; guardar(); mostrar(); };
    nav.appendChild(ant); nav.appendChild(prox);
    palco.appendChild(nav);
  }

  function darNota(a, n) {
    notas[a.id] = n;
    const lista = paraNota();
    // Vai para a próxima sem nota — adiante primeiro, depois do começo; se todas têm, fica.
    let prox = lista.findIndex((x, i) => i > pos && notas[x.id] == null);
    if (prox < 0) prox = lista.findIndex((x) => notas[x.id] == null);
    if (prox >= 0) pos = prox;
    guardar();
    mostrar();
  }

  const escapar = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const fmt = (v, casas) => (v == null ? '—' : v.toFixed(casas));
  const sim = (b) => (b == null ? '<td>—</td>' : b ? '<td class="ok">sim</td>' : '<td class="nao">não</td>');

  function revelar() {
    const faltam = paraNota().length - feitas();
    if (faltam > 0 && !confirm('Faltam ' + faltam + ' notas. Revelar a chave agora deixa as próximas notas sabendo de quem é cada peça. Revelar assim mesmo?')) return;
    const linhas = resumo(dados, notas);
    const crit = criterio(linhas);
    let h = '<h2 class="secao">A chave</h2><table><tr><th>Motor</th><th>Nota da peça</th><th>Notas</th><th>Nota da tela</th><th>Custo médio</th><th>Tempo médio</th><th>Passou de primeira</th><th>Não entregou</th></tr>';
    for (const l of linhas) {
      h += '<tr><td>' + escapar(l.rotulo) + '</td><td>' + fmt(l.notaPeca, 2) + '</td><td>' + l.notasPeca + '</td><td>' + fmt(l.notaTela, 2)
        + '</td><td>' + (l.custoMedioReais == null ? '—' : 'R$ ' + l.custoMedioReais.toFixed(3)) + '</td><td>' + (l.tempoMedioS == null ? '—' : l.tempoMedioS.toFixed(1) + ' s')
        + '</td><td>' + (l.deprimeira == null ? '—' : Math.round(l.deprimeira * 100) + '%') + '</td><td>' + l.falhas + ' de ' + l.total + '</td></tr>';
    }
    h += '</table><h2 class="secao">O critério do plano (§4.4)</h2><table><tr><th>Motor HTML</th><th>Média ≥ 4</th><th>1 ponto acima do atual</th><th>Custo ≤ R$ 1,00</th><th>Passa</th></tr>';
    for (const c of crit) h += '<tr><td>' + escapar(c.rotulo) + '</td>' + sim(c.media4) + sim(c.acima) + sim(c.custo) + sim(c.passa) + '</tr>';
    h += '</table><p class="aviso">"Nenhuma peça travando no box" é o quarto critério e se confere na TV da ótica, pelo canal beta. Custo é da peça, sem a imagem gerada; a tela completa soma quatro composições.</p>';
    h += '<h2 class="secao">Nota por pedido</h2><table><tr><th>Pedido</th>' + linhas.map((l) => '<th>' + escapar(l.rotulo) + '</th>').join('') + '</tr>';
    for (const p of dados.pedidos || []) {
      h += '<tr><td>#' + p.n + ' ' + escapar(p.pedido.slice(0, 48)) + '</td>';
      for (const l of linhas) {
        const a = ordem.find((x) => x.tipo === 'peca' && x.linha.n === p.n && x.linha.motor === l.motor);
        h += '<td>' + (!a ? '—' : a.falhou ? '<span class="nao">1 (falhou)</span>' : (notas[a.id] != null ? notas[a.id] : '—')) + '</td>';
      }
      h += '</tr>';
    }
    h += '</table>';
    $('palco').innerHTML = h;
  }

  function exportar() {
    const corpo = JSON.stringify({ arquivo: salvo, criadoEm: dados.criadoEm, notas, comentarios, resumo: resumo(dados, notas) }, null, 1);
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([corpo], { type: 'application/json' }));
    a.download = 'notas-' + (dados.criadoEm || 'experimento').replace(/[:.]/g, '-').slice(0, 19) + '.json';
    a.click();
  }

  function abrir(texto) {
    try { dados = JSON.parse(texto); } catch (e) { alert('Este arquivo não é JSON.'); return; }
    if (!Array.isArray(dados.pecas)) { alert('Este arquivo não é um resultado do experimento.'); dados = null; return; }
    salvo = 'mt-exp:' + hash((dados.criadoEm || '') + ':' + dados.pecas.length);
    notas = {}; comentarios = {}; pos = 0;
    lembrar();
    ordem = embaralhar(avaliacoes(dados), salvo);
    mostrar();
  }

  $('arquivo').addEventListener('change', (ev) => {
    const f = ev.target.files && ev.target.files[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = () => abrir(String(r.result));
    r.readAsText(f);
  });
  $('revelar').addEventListener('click', revelar);
  $('exportar').addEventListener('click', exportar);
  document.addEventListener('keydown', (ev) => {
    if (!dados || ev.target.tagName === 'TEXTAREA') return;
    const lista = paraNota();
    if (/^[1-5]$/.test(ev.key) && lista[pos]) darNota(lista[pos], Number(ev.key));
    else if (ev.key === 'ArrowRight' && pos < lista.length - 1) { pos++; guardar(); mostrar(); }
    else if (ev.key === 'ArrowLeft' && pos > 0) { pos--; guardar(); mostrar(); }
  });
})(typeof window !== 'undefined' ? window : globalThis);
