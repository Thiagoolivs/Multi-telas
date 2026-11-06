/*
 * js/ambiente.js — o MODO AMBIENTE na TV (fase 9: "arte calma da marca entre
 * os avisos").
 *
 * Entre um aviso e outro, um respiro: a cor da marca em movimento lento, um
 * desenho de linhas finas e, no meio, a hora e a data (ou uma frase curta
 * que o dono escreveu). Quem entra (js/rodizio.js, comAmbiente) e quando
 * (Ajustes da TV › Modo ambiente) é decidido fora daqui; aqui só o desenho.
 *
 * As cores são as do tema da TV (as variáveis que js/theme.js escreve:
 * --bg, --brand, --brand-2, --accent, --text): sem marca escolhida, o tema;
 * com a marca, a marca. Quando houver uma peça-ouro de ambiente escolhida,
 * ela entra no lugar deste desenho (settings.ambiente.peca).
 *
 * A letra segue a régua da zona (--mt-piso, css/player.css). ES2017 e sem
 * `inset` (test/compat-tv.test.js). Na TV fraca (mt-perf), tudo parado.
 */
(function (global) {
  'use strict';

  const CSS = [
    '.mt-slide.mt-ambiente{overflow:hidden;background:var(--bg);color:var(--text);display:flex;flex-direction:column;align-items:center;justify-content:center;container-type:size}',
    '.mt-amb-fundo{position:absolute;top:0;right:0;bottom:0;left:0;overflow:hidden;pointer-events:none}',
    '.mt-amb-bolha{position:absolute;border-radius:50%;opacity:.34;will-change:transform}',
    '.mt-amb-b1{width:70vmax;height:70vmax;left:-24vmax;top:-30vmax;background:radial-gradient(circle,var(--brand) 0%,rgba(0,0,0,0) 68%);animation:mt-amb-vaga 26s ease-in-out infinite alternate}',
    '.mt-amb-b2{width:60vmax;height:60vmax;right:-22vmax;bottom:-28vmax;opacity:.22;background:radial-gradient(circle,var(--brand-2) 0%,rgba(0,0,0,0) 68%);animation:mt-amb-vaga 32s ease-in-out -9s infinite alternate-reverse}',
    '.mt-amb-b3{width:38vmax;height:38vmax;right:8vmax;top:-18vmax;opacity:.2;background:radial-gradient(circle,var(--accent) 0%,rgba(0,0,0,0) 66%);animation:mt-amb-vaga 38s ease-in-out -4s infinite alternate}',
    '@keyframes mt-amb-vaga{0%{transform:translate3d(0,0,0) scale(1)}100%{transform:translate3d(6vmax,4vmax,0) scale(1.12)}}',
    '.mt-amb-desenho{position:absolute;top:0;right:0;bottom:0;left:0;opacity:.5}',
    '.mt-amb-desenho svg{width:100%;height:100%;display:block}',
    '.mt-amb-desenho path,.mt-amb-desenho circle,.mt-amb-desenho line{fill:none;stroke-width:1.2;vector-effect:non-scaling-stroke}',
    '.mt-amb-desenho g{animation:mt-amb-gira 60s linear infinite;transform-origin:50% 50%}',
    '@keyframes mt-amb-gira{to{transform:rotate(360deg)}}',
    '.mt-amb-v1 .mt-amb-desenho g,.mt-amb-v2 .mt-amb-desenho g{animation:mt-amb-anda 40s ease-in-out infinite alternate}',
    '@keyframes mt-amb-anda{0%{transform:translate3d(-2%,0,0)}100%{transform:translate3d(2%,1%,0)}}',
    '.mt-amb-miolo{position:relative;display:flex;flex-direction:column;align-items:center;text-align:center;max-width:86%}',
    // A hora é grande e leve; a data e a frase, no piso da zona ou acima dele.
    '.mt-amb-hora{font-size:16vmin;font-size:max(calc(var(--mt-piso,0px) * 2.4),min(24cqw,34cqh));font-weight:300;line-height:1;letter-spacing:-.02em;font-variant-numeric:tabular-nums}',
    '.mt-amb-dia{margin-top:2.4vmin;font-size:4.8vmin;font-size:max(var(--mt-piso,0px),min(5.4cqw,7cqh));font-weight:500;line-height:1.2}',
    '.mt-amb-frase{font-size:7vmin;font-size:max(calc(var(--mt-piso,0px) * 1.3),min(7.5cqw,11cqh));font-weight:600;line-height:1.18;letter-spacing:-.01em}',
    '.mt-amb-frase+.mt-amb-dia{margin-top:3.4vmin}',
    '.mt-amb-marca{position:absolute;left:0;right:0;bottom:7%;display:flex;justify-content:center;align-items:center;font-weight:700;letter-spacing:.08em;text-transform:uppercase;',
    'font-size:4.5vmin;font-size:max(var(--mt-piso,0px),min(4.8cqw,5.6cqh));line-height:1.1}',
    '.mt-amb-marca img{max-height:11cqh;max-width:36cqw;object-fit:contain}',
    '.mt-amb-linha{width:14cqw;height:.5cqh;min-height:3px;border-radius:2px;background:var(--brand);margin:3.4cqh 0 0}',
    '.mt-perf .mt-ambiente *{animation:none!important}',
  ].join('\n');

  let estiloPosto = false;
  function porEstilo() {
    if (estiloPosto || !document.head) return;
    estiloPosto = true;
    const st = document.createElement('style');
    st.id = 'mt-ambiente-estilo';
    st.textContent = CSS;
    document.head.appendChild(st);
  }

  /*
   * Três desenhos de linha fina, um por vez: anéis, ondas e uma grade em
   * diagonal. Texto fixo e nosso (nenhum dado de fora entra aqui).
   */
  const DESENHOS = [
    function () {
      let s = '<svg viewBox="0 0 1000 1000" preserveAspectRatio="xMidYMid slice" aria-hidden="true"><g>';
      for (let r = 120; r <= 900; r += 90) s += '<circle cx="760" cy="300" r="' + r + '" style="stroke:var(--brand)"/>';
      for (let r = 80; r <= 500; r += 70) s += '<circle cx="180" cy="860" r="' + r + '" style="stroke:var(--accent)"/>';
      return s + '</g></svg>';
    },
    function () {
      let s = '<svg viewBox="0 0 1000 600" preserveAspectRatio="none" aria-hidden="true"><g>';
      for (let i = 0; i < 9; i++) {
        const y = 140 + i * 42;
        s += '<path d="M-50 ' + y + ' C 200 ' + (y - 90) + ', 380 ' + (y + 90) + ', 560 ' + y + ' S 900 ' + (y - 80) + ', 1050 ' + y + '" style="stroke:var(' + (i % 3 === 2 ? '--accent' : '--brand') + ')"/>';
      }
      return s + '</g></svg>';
    },
    function () {
      let s = '<svg viewBox="0 0 1000 1000" preserveAspectRatio="xMidYMid slice" aria-hidden="true"><g>';
      for (let i = -1000; i <= 1000; i += 70) s += '<line x1="' + i + '" y1="0" x2="' + (i + 1000) + '" y2="1000" style="stroke:var(' + (i % 210 === 0 ? '--accent' : '--brand') + ')"/>';
      return s + '</g></svg>';
    },
  ];
  let vez = 0;

  function div(classe, texto) {
    const e = document.createElement('div');
    e.className = classe;
    if (texto) e.textContent = texto;
    return e;
  }
  function relogioOk(d) { return d.getFullYear() >= 2025; }
  function dataPorExtenso(d) {
    let t = '';
    try { t = d.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' }); } catch (e) { t = ''; }
    return t ? t.charAt(0).toUpperCase() + t.slice(1) : '';
  }

  function renderAmbiente(item) {
    porEstilo();
    const it = item || {};
    const v = vez++ % DESENHOS.length;
    const el = div('mt-slide mt-ambiente mt-amb-v' + v);
    const fundo = div('mt-amb-fundo');
    fundo.appendChild(div('mt-amb-bolha mt-amb-b1'));
    fundo.appendChild(div('mt-amb-bolha mt-amb-b2'));
    fundo.appendChild(div('mt-amb-bolha mt-amb-b3'));
    const desenho = div('mt-amb-desenho');
    desenho.innerHTML = DESENHOS[v]();
    fundo.appendChild(desenho);
    el.appendChild(fundo);

    const miolo = div('mt-amb-miolo');
    const frase = it.mostrar === 'frase' ? String(it.frase || '').trim() : '';
    /*
     * Com relógio no cabeçalho, um segundo relógio gigante seria repetir
     * (D12): o respiro mostra o dia da semana grande, e a data embaixo.
     */
    const semHora = !frase && !!global.MT_RELOGIO_NO_CABECALHO;
    let hora = null;
    let semana = null;
    if (frase) miolo.appendChild(div('mt-amb-frase', frase));
    else if (semHora) { semana = div('mt-amb-frase'); miolo.appendChild(semana); }
    else { hora = div('mt-amb-hora'); miolo.appendChild(hora); }
    const dia = div('mt-amb-dia');
    miolo.appendChild(dia);
    miolo.appendChild(div('mt-amb-linha'));
    el.appendChild(miolo);

    // A marca, pequena, embaixo: a logo (a versão clara no fundo escuro fica para a peça escolhida) ou o nome.
    const marca = div('mt-amb-marca');
    const logo = global.MT_LOGO;
    if (logo && logo.url) {
      const img = document.createElement('img');
      img.alt = '';
      img.onerror = function () { img.remove(); marca.textContent = global.MT_NOME || ''; };
      img.src = logo.url;
      marca.appendChild(img);
    } else if (global.MT_NOME) {
      marca.textContent = global.MT_NOME;
    }
    if (marca.firstChild) el.appendChild(marca);

    const pintar = function () {
      const agora = new Date();
      const ok = relogioOk(agora);
      if (hora) hora.textContent = ok ? String(agora.getHours()).padStart(2, '0') + ':' + String(agora.getMinutes()).padStart(2, '0') : '';
      if (semana) {
        let d = '';
        try { d = agora.toLocaleDateString('pt-BR', { weekday: 'long' }); } catch (e) { d = ''; }
        semana.textContent = ok && d ? d.charAt(0).toUpperCase() + d.slice(1) : '';
        let resto = '';
        try { resto = agora.toLocaleDateString('pt-BR', { day: 'numeric', month: 'long' }); } catch (e) { resto = ''; }
        dia.textContent = ok ? resto : '';
        return;
      }
      dia.textContent = ok ? dataPorExtenso(agora) : '';
    };
    pintar();
    const t = setInterval(pintar, 10000);
    return { el: el, duration: Number(it.duracao) > 0 ? Number(it.duracao) : 10, onLeave: function () { clearInterval(t); } };
  }

  if (global.MTRender && global.MTRender.registrar) global.MTRender.registrar('ambiente', renderAmbiente);
  global.MTAmbiente = { render: renderAmbiente, DESENHOS: DESENHOS.length };
})(typeof window !== 'undefined' ? window : globalThis);
