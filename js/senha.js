/*
 * js/senha.js — a chamada de senha na TV (fase 12 do plano de ação).
 *
 * A recepção chama pelo painel (server/routes/senha.js) e a TV da sala de
 * espera mostra, em menos de um segundo:
 *   - a senha atual GIGANTE, o guichê ou consultório e as três anteriores,
 *     com a hora e a marca (o modelo s1-senha das telas de referência);
 *   - por alguns segundos, por cima de tudo (a tela inteira), e com um
 *     aviso sonoro se o som da chamada estiver ligado nesta TV;
 *   - e, se a TV pediu ("sempre à vista"), numa faixa fixa ao lado do
 *     conteúdo (embaixo, na TV em pé).
 * NUNCA o nome do paciente: a chamada só tem senha e lugar (server/senha.js).
 *
 * Como chega: pelo tempo real (evento "senha" do SSE, js/cloud.js), com o
 * estado inteiro — nada a buscar. Sem tempo real, a TV pergunta a cada 4 s
 * (GET /api/devices/:id/senha); ao reconectar, pergunta uma vez para não
 * perder o que passou no meio. O último estado fica guardado no aparelho:
 * recarregar a TV não perde a faixa e não anuncia de novo a mesma chamada.
 *
 * A régua (docs/qa-total/REFERENCIAS.md): a menor letra tem 4,5% do lado
 * menor da tela (é tela cheia); a senha é muito maior (30%), e encolhe só o
 * que for preciso para caber, nunca abaixo da régua.
 *
 * ES2017 (test/compat-tv.test.js) e sem `inset` (Chromium < 87).
 */
(function (global) {
  'use strict';

  const REGUA = 4.5;          // vmin: a menor letra da tela cheia
  const NOVA_MS = 30000;      // chamada mais velha que isso não toma a tela (recarga, reconexão)
  const POLL_MS = 4000;       // sem tempo real: de quanto em quanto a TV pergunta
  const CHAVE_ESTADO = 'mt.senha.estado';
  const CHAVE_ANUNCIADA = 'mt.senha.anunciada';

  let devId = '';
  let estado = null;
  let opcoes = { ativo: true, som: true, fixa: false, segundos: 12 };
  let ajustes = { nome: '', logo: null };
  let tomada = null;          // { el, timer, relogio }
  let faixa = null;           // { el, relogio }
  let pollTimer = null;
  let ligado = false;

  /* ---------- O que a config da TV pede (settings.senha) ---------- */
  function normalizar(s) {
    const o = s && typeof s === 'object' ? s : {};
    const seg = Number(o.segundos);
    return {
      ativo: o.ativo !== false,
      som: o.som !== false,
      fixa: o.fixa === true,
      segundos: Number.isFinite(seg) ? Math.max(5, Math.min(30, Math.round(seg))) : 12,
    };
  }

  /* ---------- Desenho ---------- */
  let estiloPosto = false;
  function porEstilo() {
    if (estiloPosto || !document.head) return;
    estiloPosto = true;
    const st = document.createElement('style');
    st.id = 'mt-senha-estilo';
    st.textContent = CSS;
    document.head.appendChild(st);
  }

  // A régua entra no CSS como número: a menor letra é 4,5vmin, e o resto é múltiplo dela.
  const CSS = [
    '.mt-senha-tela{position:fixed;top:0;right:0;bottom:0;left:0;z-index:95;display:grid;grid-template-columns:minmax(0,1fr) 37.5vw;',
    'background:var(--bg);color:var(--text);font-family:var(--font);opacity:0;transition:opacity .4s ease;cursor:none;overflow:hidden}',
    '.mt-senha-tela.mt-in{opacity:1}',
    '.mt-senha-principal{display:flex;flex-direction:column;min-width:0;min-height:0;',
    'padding:calc(8vh + var(--mt-margem,0) * 1vh) 4vw calc(6.5vh + var(--mt-margem,0) * 1vh) calc(5vw + var(--mt-margem,0) * 1vw)}',
    '.mt-senha-rot{font-size:5.9vmin;font-weight:800;line-height:1.1;letter-spacing:.02em;display:flex;align-items:center;gap:1.6vmin}',
    '.mt-senha-rot::before{content:"";width:1.2vmin;height:5vmin;border-radius:1vmin;background:var(--brand)}',
    '.mt-senha-num{font-size:30vmin;font-weight:900;line-height:.92;letter-spacing:-.03em;white-space:nowrap;margin-top:1.2vmin;font-variant-numeric:tabular-nums}',
    '.mt-senha-onde{font-size:10.7vmin;font-weight:800;line-height:1.05;margin-top:2.6vmin}',
    '.mt-senha-espera{font-size:7vmin;font-weight:800;line-height:1.15;margin-top:2vmin}',
    '.mt-senha-marca{margin-top:auto;padding-top:2vmin;display:flex;align-items:center;gap:1.8vmin;font-size:4.8vmin;font-weight:800;line-height:1.1;min-width:0}',
    '.mt-senha-marca img{height:8vmin;max-width:28vw;object-fit:contain}',
    '.mt-senha-lado{display:flex;flex-direction:column;min-width:0;min-height:0;background:var(--brand);color:var(--on-brand,#fff);',
    'padding:calc(8vh + var(--mt-margem,0) * 1vh) calc(4.2vw + var(--mt-margem,0) * 1vw) calc(6.5vh + var(--mt-margem,0) * 1vh) 4.2vw}',
    '.mt-senha-lado h2{font-size:4.8vmin;font-weight:800;line-height:1.15;margin:0}',
    '.mt-senha-lista{list-style:none;margin:3.4vmin 0 0;padding:0;display:flex;flex-direction:column;gap:2.4vmin}',
    '.mt-senha-lista li{display:flex;justify-content:space-between;align-items:baseline;gap:2.4vmin;font-size:5.9vmin;font-weight:800;line-height:1.1;white-space:nowrap}',
    '.mt-senha-lista li span{font-weight:600}',
    '.mt-senha-nada{font-size:4.8vmin;font-weight:600;margin-top:3.4vmin;line-height:1.2}',
    '.mt-senha-hora{margin-top:auto;padding-top:2vmin;font-size:11vmin;font-weight:900;line-height:1;font-variant-numeric:tabular-nums}',
    '.mt-senha-dia{font-size:4.8vmin;font-weight:700;margin-top:1.2vmin;line-height:1.15}',
    // Em pé e quadrada: uma coluna — a senha em cima, as anteriores embaixo.
    '.mt-senha-tela.mt-senha-vertical{grid-template-columns:minmax(0,1fr);grid-template-rows:minmax(0,1fr) auto}',
    '.mt-senha-vertical .mt-senha-principal{padding:calc(7vh + var(--mt-margem,0) * 1vh) calc(6vw + var(--mt-margem,0) * 1vw) 4vh}',
    '.mt-senha-vertical .mt-senha-lado{padding:5vh calc(6vw + var(--mt-margem,0) * 1vw) calc(5vh + var(--mt-margem,0) * 1vh)}',
    '.mt-senha-vertical .mt-senha-hora{font-size:9vmin;margin-top:5vmin}',
    // Quadrada: não cabe tudo empilhado — as anteriores lado a lado, sem a hora.
    '.mt-senha-quadrada .mt-senha-num{font-size:26vmin}',
    '.mt-senha-quadrada .mt-senha-onde{font-size:9vmin}',
    '.mt-senha-quadrada .mt-senha-rot{font-size:5vmin}',
    '.mt-senha-quadrada .mt-senha-principal{padding-top:calc(5.5vh + var(--mt-margem,0) * 1vh)}',
    '.mt-senha-quadrada .mt-senha-lado{padding-top:4vh;padding-bottom:calc(4.5vh + var(--mt-margem,0) * 1vh)}',
    '.mt-senha-quadrada .mt-senha-lista{flex-direction:row;gap:5vmin;margin-top:2.6vmin}',
    '.mt-senha-quadrada .mt-senha-lista li{flex-direction:column;align-items:flex-start;gap:.6vmin}',
    '.mt-senha-quadrada .mt-senha-lista li span{font-size:4.8vmin}',
    '.mt-senha-quadrada .mt-senha-hora,.mt-senha-quadrada .mt-senha-dia{display:none}',
    // A entrada: a senha cresce de leve e o fundo da senha pisca uma vez na cor da marca.
    '.mt-senha-tela.mt-in .mt-senha-num{animation:mt-senha-entra .9s cubic-bezier(.16,.84,.3,1) both}',
    '@keyframes mt-senha-entra{0%{transform:scale(.86);opacity:0}100%{transform:scale(1);opacity:1}}',
    '.mt-senha-tela.mt-in .mt-senha-principal{animation:mt-senha-pisca 1.4s ease-out 1}',
    '@keyframes mt-senha-pisca{0%{box-shadow:inset 0 0 0 1.6vmin var(--brand)}100%{box-shadow:inset 0 0 0 0 transparent}}',
    '.mt-perf .mt-senha-tela,.mt-perf .mt-senha-tela *{animation:none!important;transition:none!important}',
    /* A faixa "sempre à vista": o palco encolhe e a faixa fica ao lado (embaixo, em pé). */
    'html.mt-com-senha-fixa .mt-stage{width:70vw}',
    'html.mt-com-senha-fixa.mt-senha-retrato .mt-stage{width:100vw;height:76vh}',
    // Quadrada: a coluna ao lado ficaria estreita demais para a régua; vai embaixo, mais alta.
    'html.mt-com-senha-fixa.mt-senha-retrato.mt-senha-fixa-quadrada .mt-stage{height:68vh}',
    '.mt-senha-faixa{position:fixed;top:0;right:0;bottom:0;width:30vw;z-index:40;display:flex;flex-direction:column;',
    'background:var(--brand);color:var(--on-brand,#fff);font-family:var(--font);cursor:none;overflow:hidden;',
    'padding:calc(6vh + var(--mt-margem,0) * 1vh) calc(2.6vw + var(--mt-margem,0) * 1vw) calc(5vh + var(--mt-margem,0) * 1vh) 2.6vw}',
    '.mt-senha-faixa .mt-senha-rot{font-size:4.8vmin}',
    '.mt-senha-faixa .mt-senha-rot::before{background:var(--on-brand,#fff)}',
    '.mt-senha-faixa .mt-senha-num{font-size:16vmin;margin-top:.8vmin}',
    '.mt-senha-faixa .mt-senha-onde{font-size:6.4vmin;margin-top:1.6vmin}',
    '.mt-senha-faixa .mt-senha-espera{font-size:5.4vmin}',
    '.mt-senha-faixa h2{font-size:4.5vmin;font-weight:800;line-height:1.15;margin:auto 0 0;padding-top:3vmin}',
    '.mt-senha-faixa .mt-senha-lista{gap:1.6vmin;margin-top:2vmin}',
    '.mt-senha-faixa .mt-senha-lista li{font-size:4.8vmin}',
    '.mt-senha-faixa.mt-senha-retrato{top:auto;left:0;width:auto;height:24vh;flex-direction:row;align-items:stretch;gap:5vw;',
    'padding:3vh calc(5vw + var(--mt-margem,0) * 1vw) calc(3vh + var(--mt-margem,0) * 1vh)}',
    '.mt-senha-faixa.mt-senha-retrato.mt-senha-faixa-quadrada{height:32vh}',
    '.mt-senha-faixa.mt-senha-retrato .mt-senha-atual{flex:1 1 55%;min-width:0;display:flex;flex-direction:column;justify-content:center}',
    '.mt-senha-faixa.mt-senha-retrato .mt-senha-ant{flex:1 1 45%;min-width:0;display:flex;flex-direction:column;justify-content:center}',
    '.mt-senha-faixa.mt-senha-retrato h2{margin:0;padding-top:0}',
    '.mt-senha-faixa .mt-senha-ant{display:flex;flex-direction:column;margin-top:auto}',
    '.mt-senha-faixa.mt-senha-nova .mt-senha-num{animation:mt-senha-entra .9s cubic-bezier(.16,.84,.3,1) both}',
  ].join('\n');

  function el(tag, classe, texto) {
    const e = document.createElement(tag);
    if (classe) e.className = classe;
    if (texto !== undefined && texto !== null) e.textContent = String(texto);
    return e;
  }

  // Deitada, em pé ou quadrada, pelo tamanho da janela (a moldura da TV girada já mede em pé).
  function formato() {
    const w = global.innerWidth || 1920;
    const h = global.innerHeight || 1080;
    if (h / w >= 1.25) return 'retrato';
    if (w / h >= 1.25) return 'paisagem';
    return 'quadrada';
  }

  function relogioOk(d) { return d.getFullYear() >= 2025; }
  function hora(d) { return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); }
  // "Quinta, 5 de novembro" (o "-feira" ocupa a linha sem dizer nada).
  function dia(d) {
    let t = '';
    try { t = d.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' }); } catch (e) { t = ''; }
    t = t.replace('-feira', '');
    return t ? t.charAt(0).toUpperCase() + t.slice(1) : '';
  }

  function marcaEl() {
    const m = el('div', 'mt-senha-marca');
    const logo = ajustes.logo;
    if (logo && logo.url) {
      const img = el('img');
      img.alt = '';
      img.onerror = function () { img.remove(); if (!m.textContent) m.textContent = ajustes.nome || ''; };
      img.src = logo.url;
      m.appendChild(img);
    } else if (ajustes.nome) {
      m.textContent = ajustes.nome;
    }
    return m;
  }

  function listaEl(anteriores, curto) {
    const ul = el('ul', 'mt-senha-lista');
    (anteriores || []).forEach(function (c) {
      const li = el('li', '', c.senha);
      if (c.localCurto || c.local) li.appendChild(el('span', '', curto ? (c.localCurto || c.local) : (c.local || c.localCurto)));
      ul.appendChild(li);
    });
    return ul;
  }

  /*
   * A tela da chamada (o modelo s1-senha). `e` = { atual, anteriores }.
   * Devolve { el, pintarHora } — a hora anda enquanto a tela estiver no ar.
   */
  function montarTela(e) {
    porEstilo();
    const f = formato();
    const raiz = el('div', 'mt-senha-tela' + (f !== 'paisagem' ? ' mt-senha-vertical' : '') + (f === 'quadrada' ? ' mt-senha-quadrada' : ''));
    raiz.setAttribute('role', 'status');
    const atual = e && e.atual;
    const principal = el('div', 'mt-senha-principal');
    principal.appendChild(el('div', 'mt-senha-rot', 'Senha'));
    if (atual) {
      principal.appendChild(el('div', 'mt-senha-num', atual.senha));
      if (atual.local) principal.appendChild(el('div', 'mt-senha-onde', atual.local));
    } else {
      principal.appendChild(el('div', 'mt-senha-espera', 'Aguarde a sua senha'));
    }
    if (f !== 'quadrada') principal.appendChild(marcaEl());
    raiz.appendChild(principal);

    const lado = el('div', 'mt-senha-lado');
    lado.appendChild(el('h2', '', 'Chamadas anteriores'));
    const ant = (e && e.anteriores) || [];
    if (ant.length) lado.appendChild(listaEl(ant, true));
    else lado.appendChild(el('div', 'mt-senha-nada', 'As últimas aparecem aqui.'));
    const h = el('div', 'mt-senha-hora');
    const d = el('div', 'mt-senha-dia');
    lado.appendChild(h);
    lado.appendChild(d);
    raiz.appendChild(lado);
    const pintarHora = function () {
      const agora = new Date();
      const ok = relogioOk(agora);
      h.textContent = ok ? hora(agora) : '';
      d.textContent = ok ? dia(agora) : '';
    };
    pintarHora();
    return { el: raiz, pintarHora: pintarHora };
  }

  // A faixa "sempre à vista": a senha atual e as anteriores, ao lado do conteúdo.
  function montarFaixa(e) {
    porEstilo();
    const f = formato();
    const raiz = el('aside', 'mt-senha-faixa' + (f !== 'paisagem' ? ' mt-senha-retrato' : '') + (f === 'quadrada' ? ' mt-senha-faixa-quadrada' : ''));
    raiz.setAttribute('aria-label', 'Chamada de senha');
    const atualBox = el('div', 'mt-senha-atual');
    atualBox.appendChild(el('div', 'mt-senha-rot', 'Senha'));
    const atual = e && e.atual;
    if (atual) {
      atualBox.appendChild(el('div', 'mt-senha-num', atual.senha));
      if (atual.local) atualBox.appendChild(el('div', 'mt-senha-onde', atual.local));
    } else {
      atualBox.appendChild(el('div', 'mt-senha-espera', 'Aguarde a sua senha'));
    }
    raiz.appendChild(atualBox);
    const ant = (e && e.anteriores) || [];
    if (ant.length) {
      const box = el('div', 'mt-senha-ant');
      box.appendChild(el('h2', '', 'Anteriores'));
      box.appendChild(listaEl(ant, true));
      raiz.appendChild(box);
    }
    return raiz;
  }

  /*
   * Cabe? A senha e o lugar encolhem só o que passar da largura (e a tela, o
   * que passar da altura), nunca abaixo da régua. A fonte de cada TV é uma:
   * a mesma senha pode caber numa e não na outra.
   */
  function caber(raiz) {
    if (!raiz) return;
    const piso = REGUA / 100 * Math.min(global.innerWidth || 1920, global.innerHeight || 1080);
    const medir = function () {
      const caixas = raiz.querySelectorAll('.mt-senha-num, .mt-senha-onde');
      Array.prototype.forEach.call(caixas, function (c) {
        c.style.fontSize = '';
        const pai = c.parentNode;
        if (!pai) return;
        const cs = getComputedStyle(pai);
        const largura = pai.clientWidth - parseFloat(cs.paddingLeft || 0) - parseFloat(cs.paddingRight || 0);
        for (let i = 0; i < 6 && c.scrollWidth > largura + 1 && largura > 0; i++) {
          const atual = parseFloat(getComputedStyle(c).fontSize);
          c.style.fontSize = Math.max(piso, atual * (largura / c.scrollWidth) * 0.98).toFixed(1) + 'px';
        }
      });
      // Na altura: a coluna da senha (ou a faixa) não pode passar do que tem.
      const colunas = raiz.classList.contains('mt-senha-faixa') ? [raiz] : raiz.querySelectorAll('.mt-senha-principal');
      Array.prototype.forEach.call(colunas, function (col) {
        const num = col.querySelector('.mt-senha-num');
        for (let i = 0; num && i < 6 && col.scrollHeight > col.clientHeight + 1; i++) {
          const atual = parseFloat(getComputedStyle(num).fontSize);
          const falta = col.scrollHeight - col.clientHeight;
          if (atual <= piso) break;
          num.style.fontSize = Math.max(piso, atual - falta / 0.92 - 1).toFixed(1) + 'px';
        }
      });
    };
    medir();
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(medir).catch(function () {});
  }

  /* ---------- O aviso sonoro ---------- */
  let audioCtx = null;
  function contexto() {
    if (audioCtx) return audioCtx;
    try {
      const AC = global.AudioContext || global.webkitAudioContext;
      if (AC) audioCtx = new AC();
    } catch (e) { audioCtx = null; }
    return audioCtx;
  }
  // O navegador só libera o som depois de um toque: o primeiro toque na TV (ou no controle) libera.
  function liberarSom() { const c = contexto(); if (c && c.state === 'suspended') c.resume().catch(function () {}); }
  // "Plim-plom": duas notas suaves, como o painel de senha de toda recepção. Sintetizado: sem arquivo, funciona sem rede.
  function tocar() {
    const ctx = contexto();
    if (!ctx) return;
    if (ctx.state === 'suspended') ctx.resume().catch(function () {});
    const t0 = ctx.currentTime + 0.02;
    [[659.25, 0], [523.25, 0.42]].forEach(function (n) {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = n[0];
      const ini = t0 + n[1];
      g.gain.setValueAtTime(0.0001, ini);
      g.gain.exponentialRampToValueAtTime(0.45, ini + 0.03);
      g.gain.exponentialRampToValueAtTime(0.0001, ini + 0.9);
      osc.connect(g); g.connect(ctx.destination);
      osc.start(ini); osc.stop(ini + 0.95);
    });
  }

  /* ---------- Na tela ---------- */
  function pausada() { return document.documentElement.classList.contains('mt-tv-pausada'); }

  function tirarTomada() {
    if (!tomada) return;
    const t = tomada;
    tomada = null;
    clearTimeout(t.timer);
    clearInterval(t.relogio);
    t.el.classList.remove('mt-in');
    setTimeout(function () { if (t.el.parentNode) t.el.parentNode.removeChild(t.el); }, 450);
  }

  // A chamada toma a tela inteira por alguns segundos (e toca, se o som desta TV estiver ligado).
  function anunciar(e) {
    if (!document.body || pausada()) return;
    const novo = montarTela(e);
    if (tomada) {
      // Outra chamada no meio desta: troca no lugar, sem piscar o conteúdo de baixo.
      clearTimeout(tomada.timer);
      clearInterval(tomada.relogio);
      if (tomada.el.parentNode) tomada.el.parentNode.removeChild(tomada.el);
      novo.el.classList.add('mt-in');
      document.body.appendChild(novo.el);
    } else {
      document.body.appendChild(novo.el);
      void novo.el.offsetWidth;
      novo.el.classList.add('mt-in');
    }
    caber(novo.el);
    tomada = { el: novo.el, relogio: setInterval(novo.pintarHora, 10000), timer: setTimeout(tirarTomada, opcoes.segundos * 1000) };
    if (opcoes.som) { try { tocar(); } catch (x) { /* sem som neste aparelho */ } }
  }

  function pintarFaixa(nova) {
    const querFaixa = ligado && opcoes.ativo && opcoes.fixa && !pausada();
    const html = document.documentElement;
    if (!querFaixa) {
      if (faixa) { if (faixa.parentNode) faixa.parentNode.removeChild(faixa); faixa = null; }
      html.classList.remove('mt-com-senha-fixa', 'mt-senha-retrato', 'mt-senha-fixa-quadrada');
      return;
    }
    if (!document.body) return;
    // A mesma faixa de novo (a pergunta de reserva sem novidade): fica como está.
    const assinatura = JSON.stringify([estado && estado.atual, estado && estado.anteriores, formato()]);
    if (!nova && faixa && faixa.parentNode && faixa.getAttribute('data-assinatura') === assinatura) return;
    const f = montarFaixa(estado);
    f.setAttribute('data-assinatura', assinatura);
    if (nova) f.classList.add('mt-senha-nova');
    if (faixa && faixa.parentNode) faixa.parentNode.replaceChild(f, faixa);
    else document.body.appendChild(f);
    faixa = f;
    html.classList.add('mt-com-senha-fixa');
    html.classList.toggle('mt-senha-retrato', formato() !== 'paisagem');
    html.classList.toggle('mt-senha-fixa-quadrada', formato() === 'quadrada');
    caber(f);
  }

  function lerGuardado(chave) { try { return localStorage.getItem(chave); } catch (e) { return null; } }
  function guardar(chave, valor) { try { localStorage.setItem(chave, valor); } catch (e) { /* sem espaço: segue */ } }

  /*
   * Chegou um estado (tempo real, pergunta ou a memória do aparelho). Toma a
   * tela só a chamada que esta TV ainda não anunciou E que é de agora — a
   * idade é contada pelo relógio do SERVIDOR (`agora`), porque o da TV
   * barata pode estar em 1970.
   */
  function receber(e, origem) {
    if (!e || typeof e !== 'object') return;
    /*
     * Resposta velha não passa por cima da nova: a pergunta que saiu antes de
     * uma chamada pode voltar DEPOIS do tempo real que trouxe a chamada — e
     * anunciaria de novo a senha anterior. O carimbo é o do servidor.
     */
    if (estado && estado.agora && Number(e.agora) && Number(e.agora) < estado.agora) return;
    estado = { atual: e.atual || null, anteriores: Array.isArray(e.anteriores) ? e.anteriores.slice(0, 3) : [], agora: Number(e.agora) || 0 };
    if (origem !== 'memoria') guardar(CHAVE_ESTADO, JSON.stringify(estado));
    const a = estado.atual;
    const chave = a ? a.id + ':' + a.em : '';
    const nova = !!(a && chave !== lerGuardado(CHAVE_ANUNCIADA) && origem !== 'memoria'
      && (!estado.agora || estado.agora - Number(a.em) < NOVA_MS));
    if (nova) guardar(CHAVE_ANUNCIADA, chave);
    if (!ligado || !opcoes.ativo) return;
    pintarFaixa(nova);
    if (nova) anunciar(estado);
    else if (tomada && !a) tirarTomada();   // zeraram o dia com a chamada no ar
  }

  /* ---------- A rede ---------- */
  function perguntar() {
    if (!devId || !global.MTCloud || !MTCloud.fetchSenha) return Promise.resolve();
    return MTCloud.fetchSenha(devId).then(function (e) { receber(e, 'rede'); }).catch(function () { /* sem rede: fica o que está */ });
  }
  function tempoReal() { return !!(global.MTCloud && MTCloud.tempoReal && MTCloud.tempoReal()); }
  // Sem tempo real, pergunta a cada 4 s; com ele, só confere de minuto em minuto.
  function agendar() {
    clearTimeout(pollTimer);
    pollTimer = setTimeout(function () {
      const vez = (opcoes.ativo && !tempoReal()) || Date.now() - ultimaPergunta > 60000;
      (vez ? perguntar() : Promise.resolve()).then(function () { if (vez) ultimaPergunta = Date.now(); agendar(); });
    }, POLL_MS);
  }
  let ultimaPergunta = 0;

  // O player chama uma vez, no boot da TV da nuvem (js/player.js, bootCloud).
  function ligar(id) {
    if (ligado) return;
    ligado = true;
    devId = id || '';
    try {
      const guardado = JSON.parse(lerGuardado(CHAVE_ESTADO) || 'null');
      if (guardado) receber(guardado, 'memoria');
    } catch (e) { /* memória estragada: a rede repõe */ }
    document.addEventListener('mt:senha', function (ev) { receber(ev && ev.detail, 'tempo-real'); });
    // Reconectou: o que passou com o tempo real caído vem agora, e não na próxima pergunta.
    document.addEventListener('mt:tempo-real', function (ev) { if (ev && ev.detail && ev.detail.aberto) perguntar(); });
    document.addEventListener('mt:pausada', function () { setTimeout(function () { pintarFaixa(false); if (pausada()) tirarTomada(); }, 0); });
    ['click', 'keydown', 'touchstart'].forEach(function (t) { document.addEventListener(t, liberarSom, { passive: true }); });
    global.addEventListener('resize', function () { if (faixa) pintarFaixa(false); });
    perguntar().then(function () { ultimaPergunta = Date.now(); });
    agendar();
  }

  // A cada config aplicada: as escolhas da TV (Ajustes da TV › Chamada de senha), o nome e a logo da marca.
  function configurar(cfg) {
    const s = (cfg && cfg.settings) || {};
    opcoes = normalizar(s.senha);
    ajustes = { nome: s.nome || '', logo: global.MT_LOGO || null };
    if (!opcoes.ativo) tirarTomada();
    pintarFaixa(false);
  }

  const api = {
    REGUA: REGUA, NOVA_MS: NOVA_MS,
    normalizar: normalizar, ligar: ligar, configurar: configurar, receber: receber,
    montarTela: montarTela, montarFaixa: montarFaixa, caber: caber, formato: formato,
    _estado: function () { return estado; },
  };
  global.MTSenha = api;
})(typeof window !== 'undefined' ? window : globalThis);
