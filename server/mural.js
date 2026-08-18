/*
 * server/mural.js — a página que o público abre pelo QR.
 *
 * HTML puro, sem build e sem framework: quem escaneia está com o celular na
 * mão, muitas vezes em rede ruim, e vai usar isto por trinta segundos. Cada
 * kilobyte aqui é uma pessoa a menos que consegue mandar a foto.
 *
 * Não tem login. O código do QR é a credencial, e é por isso que ele só
 * permite ENVIAR — nunca listar, apagar ou ver o que os outros mandaram.
 */

const MAX_MB = 12;

const crypto = require('crypto');

// Códigos sem 0/O/1/I: alguém vai digitar isto olhando de longe.
const ALFABETO = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function novoCodigo(n) {
  // Sorteio criptográfico: este código é a credencial de envio do mural, e
  // ficava exposto ao mesmo problema do `Math.random()` descrito em
  // server/storage.js — previsível a partir de saídas observadas.
  let s = '';
  for (let i = 0; i < (n || 6); i++) s += ALFABETO[crypto.randomInt(ALFABETO.length)];
  return s;
}

const esc = (s) => String(s || '').replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const CSS = `
:root { color-scheme: light dark; }
* { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
body { margin:0; min-height:100svh; background:#0d1117; color:#e8eaee;
  font:16px/1.5 system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;
  display:flex; align-items:center; justify-content:center; padding:20px; }
.card { width:100%; max-width:420px; }
h1 { font-size:1.5rem; margin:0 0 .2rem; letter-spacing:-.02em; }
.sub { color:#9aa3b2; font-size:.9rem; margin:0 0 1.4rem; }
label.foto { display:flex; flex-direction:column; align-items:center; justify-content:center; gap:.6rem;
  border:2px dashed #2a3140; border-radius:16px; padding:2.4rem 1rem; cursor:pointer;
  background:#141a24; transition:border-color .15s; text-align:center; }
label.foto:active { border-color:#6366f1; }
label.foto b { font-size:1.05rem; }
label.foto span { color:#9aa3b2; font-size:.82rem; }
svg.cam { width:40px; height:40px; stroke:#6366f1; fill:none; stroke-width:1.6; }
#preview { display:none; width:100%; border-radius:16px; margin-bottom:.8rem; }
input[type=file] { display:none; }
input[type=text] { width:100%; margin-top:.7rem; padding:.85rem 1rem; border-radius:12px;
  border:1px solid #2a3140; background:#141a24; color:#e8eaee; font:inherit; }
input[type=text]::placeholder { color:#6b7382; }
button { width:100%; margin-top:1rem; padding:1rem; border:0; border-radius:12px;
  background:#6366f1; color:#fff; font:inherit; font-weight:700; font-size:1.05rem; cursor:pointer; }
button:disabled { opacity:.5; }
.aviso { margin-top:1.1rem; color:#6b7382; font-size:.74rem; line-height:1.45; }
.ok { text-align:center; padding:2rem 0; }
.ok .big { font-size:3rem; }
.ok h2 { margin:.6rem 0 .3rem; }
.erro { margin-top:.8rem; padding:.7rem .9rem; border-radius:10px;
  background:#3b1219; color:#fda4af; font-size:.86rem; }
a.mais { display:inline-block; margin-top:1rem; color:#a5b4fc; }
@media (prefers-color-scheme: light) {
  body { background:#f5f6f8; color:#14161a; }
  label.foto { background:#fff; border-color:#d8dce4; }
  input[type=text] { background:#fff; border-color:#d8dce4; color:#14161a; }
  .sub, label.foto span, .aviso { color:#5d6470; }
}
`;

function pagina(mural, opts) {
  const o = opts || {};
  const titulo = esc(mural.titulo || 'Mural');
  const empresa = esc(o.empresa || '');
  return `<!doctype html><html lang="pt-BR"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="robots" content="noindex">
<title>${titulo}</title><style>${CSS}</style></head>
<body><div class="card" id="dados" data-codigo="${esc(mural.codigo)}" data-max-mb="${MAX_MB}">
  <h1>${titulo}</h1>
  <p class="sub">${empresa ? 'Sua foto aparece na tela d' + (empresa.match(/^[AaEeIiOoUu]/) ? 'a ' : 'e ') + empresa + ' em segundos.' : 'Sua foto aparece na tela em segundos.'}</p>

  <img id="preview" alt="">
  <label class="foto" id="alvo" for="f">
    <svg class="cam" viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round">
      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
      <circle cx="12" cy="13" r="4"/>
    </svg>
    <b>Tirar ou escolher foto</b>
    <span>toque aqui</span>
  </label>
  <!--
    Sem o atributo "capture": ele forçava a câmera traseira e sumia com a opção de
    galeria no celular. O botão promete "tirar OU escolher", e numa
    confraternização a foto boa foi tirada há vinte minutos e está na galeria.
  -->
  <input type="file" id="f" accept="image/*">

  <input type="text" id="autor" placeholder="Seu nome (opcional)" maxlength="40" autocomplete="name">
  <input type="text" id="msg" placeholder="Uma mensagem (opcional)" maxlength="120">

  <button id="enviar" disabled>Enviar para a tela</button>
  <div class="erro" id="erro" style="display:none"></div>

  <p class="aviso">
    Ao enviar, você concorda que a foto seja exibida publicamente na tela
    ${empresa ? 'd' + (empresa.match(/^[AaEeIiOoUu]/) ? 'a ' : 'e ') + empresa : 'do local'}.
    Não envie foto de outra pessoa sem a autorização dela — e, se houver criança
    na imagem, envie só se você for responsável por ela.
    A organização pode remover qualquer foto a qualquer momento.
  </p>
</div>
<script src="/js/mural.js"></script>
</body></html>`;
}

// Mural inexistente ou fechado: página honesta, sem formulário que não funciona.
function paginaFechada(titulo, motivo) {
  return `<!doctype html><html lang="pt-BR"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex">
<title>${esc(titulo)}</title><style>${CSS}</style></head>
<body><div class="card"><div class="ok">
  <div class="big">🙏</div>
  <h2>${esc(titulo)}</h2>
  <p class="sub">${esc(motivo)}</p>
</div></div></body></html>`;
}

module.exports = { pagina, paginaFechada, novoCodigo, MAX_MB };
