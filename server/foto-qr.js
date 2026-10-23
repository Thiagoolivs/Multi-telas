/*
 * server/foto-qr.js — a foto da pessoa pelo QR, com o RH aprovando (EXECUTOR D31).
 *
 * O dono: "a pessoa lê um QR code na tela pedindo as fotos, isso envia
 * alguma forma de autenticação e a pessoa envia as fotos; isso acontece
 * semanas antes dos eventos ou quando o RH programar".
 *
 * A autenticação é um CÓDIGO NO E-MAIL (CPF mais data de nascimento não
 * prova identidade: qualquer colega sabe os dois). O caminho:
 *   1. o e-mail → um código de 6 dígitos, que vale 10 minutos;
 *   2. o código → um PASSE de 30 minutos, que manda até 3 fotos;
 *   3. a foto entra na fila do RH; aprovada, vira a foto da pessoa (quem
 *      não estava na lista entra nela, com origem "qr").
 * A resposta do passo 1 é a mesma esteja o e-mail na lista ou não: a página
 * pública não serve para descobrir quem trabalha na empresa.
 *
 * Códigos e passes moram na memória, como os passes do SSE (server/passes.js):
 * vivem minutos, e um servidor que reinicia só faz a pessoa pedir outro.
 */
const crypto = require('crypto');
const muralLib = require('./mural');

const CODIGO_VIDA_MS = 10 * 60 * 1000;
const TENTATIVAS = 5;
const PASSE_VIDA_MS = 30 * 60 * 1000;
const FOTOS_POR_PASSE = 3;
const TETO = 5000;
const MAX_MB = 12;

const codigos = new Map();   // pedidoId|email -> { hash, expira, tentativas }
const passes = new Map();    // passe -> { tenantId, pedidoId, email, pessoaId, expira, fotos }

const hash = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');
const agora = () => Date.now();
function varrer(mapa) {
  const t = agora();
  for (const [k, v] of mapa) if (v.expira <= t) mapa.delete(k);
  // Sob ataque o mapa não cresce sem fim: sai o mais antigo.
  while (mapa.size > TETO) mapa.delete(mapa.keys().next().value);
}

function pedirCodigo(pedidoId, email) {
  varrer(codigos);
  const codigo = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
  codigos.set(pedidoId + '|' + email, { hash: hash(codigo), expira: agora() + CODIGO_VIDA_MS, tentativas: 0 });
  return codigo;
}

// Vale uma vez; cinco erros queimam o código.
function conferirCodigo(pedidoId, email, codigo) {
  const k = pedidoId + '|' + email;
  const c = codigos.get(k);
  if (!c || c.expira <= agora()) { codigos.delete(k); return false; }
  c.tentativas += 1;
  const a = Buffer.from(c.hash, 'hex');
  const b = Buffer.from(hash(String(codigo || '').trim()), 'hex');
  const certo = crypto.timingSafeEqual(a, b);
  if (certo || c.tentativas >= TENTATIVAS) codigos.delete(k);
  return certo;
}

function emitirPasse(dados) {
  varrer(passes);
  const passe = crypto.randomBytes(24).toString('base64url');
  passes.set(passe, Object.assign({}, dados, { expira: agora() + PASSE_VIDA_MS, fotos: 0 }));
  return passe;
}
function lerPasse(passe, pedidoId) {
  const p = passes.get(String(passe || ''));
  if (!p || p.expira <= agora() || p.pedidoId !== pedidoId) return null;
  return p;
}
// Conta uma foto no passe; false depois da terceira.
function gastarFoto(passe) {
  const p = passes.get(String(passe || ''));
  if (!p || p.fotos >= FOTOS_POR_PASSE) return false;
  p.fotos += 1;
  return true;
}

// O pedido recebe fotos: aberto e dentro do período que o RH programou (datas AAAA-MM-DD, no fuso da TV ≈ do servidor).
function hojeIso(d) { const x = d || new Date(); return x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') + '-' + String(x.getDate()).padStart(2, '0'); }
function noPeriodo(pedido, hoje) {
  if (!pedido || !pedido.aceitando) return false;
  const h = hoje || hojeIso();
  return (!pedido.inicio || h >= pedido.inicio) && (!pedido.fim || h <= pedido.fim);
}
const dataValida = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || '')) && !isNaN(new Date(s + 'T12:00:00').getTime());
// Pedido sem fim fecha sozinho em 30 dias (nota do consultor no D31); o painel prorroga.
const PRAZO_PADRAO_DIAS = 30;
function somarDias(iso, n) { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + n); return hojeIso(d); }

function emailDoCodigo(codigo, empresa) {
  const de = empresa ? ' — ' + empresa : '';
  return {
    subject: 'Seu código para mandar a foto' + de,
    text: 'Seu código é ' + codigo + '. Ele vale 10 minutos.\n\nSe não foi você que pediu, ignore este e-mail.',
    html: '<p>Seu código para mandar a foto' + muralLib.esc(de) + ':</p><p style="font-size:28px;font-weight:700;letter-spacing:4px">' + codigo + '</p><p>Ele vale 10 minutos. Se não foi você que pediu, ignore este e-mail.</p>',
  };
}

const CSS_EXTRA = `
input[type=email], input[type=tel], input.campo { width:100%; margin-top:.7rem; padding:.85rem 1rem; border-radius:12px;
  border:1px solid #2a3140; background:#141a24; color:#e8eaee; font:inherit; }
.passo { display:none; } .passo.ativo { display:block; }
.ola { font-weight:700; margin:.2rem 0 .6rem; }
#novo { margin-bottom:.9rem; }
label.aceite { display:flex; gap:.6rem; align-items:flex-start; margin-top:1rem; font-size:.84rem; line-height:1.4; color:#c3c9d4; cursor:pointer; }
label.aceite input { width:1.2rem; height:1.2rem; margin-top:.1rem; flex-shrink:0; accent-color:#6366f1; }
@media (prefers-color-scheme: light) { label.aceite { color:#3d434d; } }
.dica { color:#9aa3b2; font-size:.82rem; margin-top:.5rem; }
@media (prefers-color-scheme: light) { input[type=email], input[type=tel], input.campo { background:#fff; border-color:#d8dce4; color:#14161a; } }
`;

function pagina(pedido, opts) {
  const o = opts || {};
  const esc = muralLib.esc;
  const titulo = esc(pedido.titulo || 'Mande sua foto');
  const empresa = esc(o.empresa || '');
  return `<!doctype html><html lang="pt-BR"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="robots" content="noindex">
<title>${titulo}</title><style>${muralLib.CSS}${CSS_EXTRA}</style></head>
<body><div class="card" id="dados" data-codigo="${esc(pedido.codigo)}" data-max-mb="${MAX_MB}">
  <h1>${titulo}</h1>
  <p class="sub">${empresa ? 'A foto vai para as TVs d' + (/^[AaEeIiOoUu]/.test(empresa) ? 'a ' : 'e ') + empresa + ' depois que o RH conferir.' : 'A foto vai para as TVs depois que o RH conferir.'}</p>

  <form class="passo ativo" id="p-email">
    <input type="email" id="email" required autocomplete="email" placeholder="Seu e-mail (o que o RH tem)" maxlength="120">
    <button id="b-email">Receber o código</button>
  </form>

  <form class="passo" id="p-codigo">
    <p class="sub">Mandamos um código de 6 números para <b id="para"></b>. Ele vale 10 minutos.</p>
    <input type="tel" id="codigo" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="Código de 6 números" required>
    <p class="dica" id="dica-dev"></p>
    <button id="b-codigo">Entrar</button>
  </form>

  <div class="passo" id="p-foto">
    <p class="ola" id="ola"></p>
    <div id="novo" style="display:none">
      <p class="sub">Você ainda não está na lista do RH. Diga quem é:</p>
      <input class="campo" type="text" id="nome" placeholder="Seu nome" maxlength="80" autocomplete="name">
      <input class="campo" type="text" id="nascimento" placeholder="Aniversário (dia/mês, ex.: 15/03)" maxlength="10">
      <input class="campo" type="text" id="setor" placeholder="Setor (opcional)" maxlength="60">
    </div>
    <img id="preview" alt="">
    <label class="foto" id="alvo" for="f">
      <svg class="cam" viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round">
        <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
        <circle cx="12" cy="13" r="4"/>
      </svg>
      <b>Tirar ou escolher a foto</b>
      <span>de rosto, com boa luz</span>
    </label>
    <input type="file" id="f" accept="image/*">
    <!-- O consentimento é explícito: a caixa vem desmarcada e o aceite fica gravado com data e hora. -->
    <label class="aceite"><input type="checkbox" id="aceite">
      <span>Autorizo ${empresa || 'a empresa'} a guardar meu nome, e-mail e foto para o mural e os aniversários. Posso pedir para sair quando quiser.</span></label>
    <button id="enviar" disabled>Mandar para o RH</button>
  </div>

  <div class="erro" id="erro" style="display:none"></div>
  <p class="aviso">
    A foto aparece nas TVs da empresa (aniversários e datas) depois que o RH conferir.
    Você pode pedir ao RH para tirá-la quando quiser. Mande só foto sua.
  </p>
</div>
<script src="/js/foto-qr.js"></script>
</body></html>`;
}

module.exports = {
  pedirCodigo, conferirCodigo, emitirPasse, lerPasse, gastarFoto, noPeriodo, hojeIso, dataValida, somarDias, emailDoCodigo, pagina,
  CODIGO_VIDA_MS, PASSE_VIDA_MS, FOTOS_POR_PASSE, TENTATIVAS, MAX_MB, PRAZO_PADRAO_DIAS,
  _limpar: () => { codigos.clear(); passes.clear(); },
};
