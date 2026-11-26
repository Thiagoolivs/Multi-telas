/*
 * A FOTO RUIM DO CLIENTE: escura, sem contraste, pequena ou mal enquadrada.
 *
 * A foto do celular chega como saiu: o bolo fotografado no balcão à noite,
 * a vitrine contra a luz, a foto de 640 px que veio do WhatsApp, o produto
 * num canto da foto deitada para um espaço em pé. Na TV isso vira uma
 * mancha escura, um borrão, ou um produto cortado ao meio.
 *
 * Aqui, no navegador (canvas), antes de subir:
 *   - medir: a luz (média e as pontas do histograma), o tamanho contra o
 *     espaço da TV, e onde está o assunto (a "energia" das bordas);
 *   - consertar num toque: níveis automáticos (estica do mais escuro ao
 *     mais claro e acerta o brilho) e o recorte no formato do espaço, em
 *     volta do assunto;
 *   - avisar o que não tem conserto: foto pequena demais para a TV.
 *
 * NUNCA muda a foto calada: quem chama mostra o antes e o depois e a pessoa
 * escolhe (components/fotos/MelhorarFoto.jsx). As contas são funções puras
 * sobre { data (RGBA), width, height } — o teste roda sem navegador.
 */

// Quanto a TV estica a foto antes de ela parecer borrada, e quanto antes de
// a TV desistir de cobrir e mostrar a foto inteira, menor (js/peca-render.js, AMPLIACAO_MAXIMA).
export const AMPLIACAO_BORRADA = 1.6;
export const AMPLIACAO_MAXIMA = 2.5;
// O lado da miniatura em que se mede: rápido no celular e de sobra para luz e enquadramento.
export const LADO_DA_MEDIDA = 192;
// O maior lado da foto melhorada (o mesmo do envio: lib/subir.js).
const LADO_MAXIMO = 2560;

const luma = (r, g, b) => 0.299 * r + 0.587 * g + 0.114 * b;

/*
 * A luz da foto: a média, o desvio e as pontas do histograma (1% e 99%,
 * para um ponto de reflexo ou de sombra não decidir sozinho).
 */
export function medirLuz(px) {
  const { data, width, height } = px;
  const hist = new Uint32Array(256);
  let soma = 0, soma2 = 0;
  const n = width * height;
  for (let i = 0; i < n; i++) {
    const v = Math.round(luma(data[i * 4], data[i * 4 + 1], data[i * 4 + 2]));
    hist[v]++; soma += v; soma2 += v * v;
  }
  const ponta = (f) => { let acc = 0; for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc >= n * f) return v; } return 255; };
  const media = soma / n;
  return { media, desvio: Math.sqrt(Math.max(0, soma2 / n - media * media)), baixo: ponta(0.01), alto: ponta(0.99) };
}

/*
 * Os níveis automáticos: uma tabela (LUT) de 256 valores, a mesma para os
 * três canais (a cor não muda de tom). Estica a faixa [baixo, alto] até
 * 2,2 vezes — mais que isso o ruído do celular aparece —, sem tirar a faixa
 * do lugar (a foto escura continua com o preto no preto), e acerta o
 * brilho com uma curva (gama) que leva a média para perto do meio. Foto
 * que quase não mudaria devolve null.
 */
export function niveisAutomaticos(luz) {
  const l = luz || {};
  const faixa = Math.max(1, l.alto - l.baixo);
  const k = Math.min(2.2, 255 / faixa);
  // A sobra (quando a faixa esticada não chega a 255) fica dividida como estava: em baixo o que havia em baixo.
  const sobra = 255 - k * faixa, fora = Math.max(1, 255 - faixa);
  const base = sobra > 0 ? (l.baixo * sobra) / fora : 0;
  const esticado = (v) => Math.min(1, Math.max(0, (base + (v - l.baixo) * k) / 255));
  const meio = Math.min(0.95, Math.max(0.05, esticado(l.media)));
  // A média vai para ~0,46; o gama não passa de 0,55–1,6 (nada de foto lavada ou queimada).
  const gama = Math.min(1.6, Math.max(0.55, Math.log(0.46) / Math.log(meio)));
  const lut = new Uint8Array(256);
  let mudanca = 0;
  for (let v = 0; v < 256; v++) {
    lut[v] = Math.round(255 * Math.pow(esticado(v), gama));
    mudanca = Math.max(mudanca, Math.abs(lut[v] - v));
  }
  return mudanca < 20 ? null : lut;
}

export function aplicarNiveis(px, lut) {
  const d = px.data;
  for (let i = 0; i < d.length; i += 4) { d[i] = lut[d[i]]; d[i + 1] = lut[d[i + 1]]; d[i + 2] = lut[d[i + 2]]; }
  return px;
}

/*
 * O RECORTE NO FORMATO DO ESPAÇO, em volta do assunto. O assunto é onde a
 * foto tem detalhe (a energia das bordas: o pão tem casca, o fundo de
 * parede lisa não). A janela é a maior que cabe na proporção do espaço;
 * desliza no lado que sobra até juntar mais energia, com um pouco de
 * preferência pelo meio (a foto bem tirada já está centrada).
 * Devolve { x, y, w, h } em fração da foto (0 a 1), ou null quando a
 * proporção já é a do espaço.
 */
export function energia(px) {
  const { data, width: w, height: h } = px;
  const L = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) L[i] = luma(data[i * 4], data[i * 4 + 1], data[i * 4 + 2]);
  const e = new Float32Array(w * h);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      e[i] = Math.abs(L[i + 1] - L[i - 1]) + Math.abs(L[i + w] - L[i - w]);
    }
  }
  return e;
}

export function recorteInteligente(px, proporcao) {
  const { width: w, height: h } = px;
  const rf = w / h, re = proporcao;
  if (!(re > 0) || Math.abs(Math.log(rf / re)) < 0.04) return null;
  const e = energia(px);
  const deitado = rf > re; // a foto é mais larga que o espaço: a janela desliza na horizontal
  const jw = deitado ? Math.max(1, Math.round(h * re)) : w;
  const jh = deitado ? h : Math.max(1, Math.round(w / re));
  // A soma da energia por coluna (ou linha), para deslizar a janela em uma conta só.
  const n = deitado ? w : h, lado = deitado ? jw : jh;
  const faixa = new Float64Array(n + 1);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) faixa[(deitado ? x : y) + 1] += e[y * w + x];
  for (let i = 1; i <= n; i++) faixa[i] += faixa[i - 1];
  const total = faixa[n] || 1;
  let melhor = Math.round((n - lado) / 2), nota = -Infinity;
  for (let ini = 0; ini + lado <= n; ini++) {
    const dentro = (faixa[ini + lado] - faixa[ini]) / total;
    const longe = Math.abs(ini + lado / 2 - n / 2) / n;
    const v = dentro - longe * 0.35;
    if (v > nota + 1e-9) { nota = v; melhor = ini; }
  }
  return deitado ? { x: melhor / w, y: 0, w: jw / w, h: 1 } : { x: 0, y: melhor / h, w: 1, h: jh / h };
}

// Onde está o assunto (o centro da energia), em fração: para dizer "o produto está no canto".
export function centroDoAssunto(px) {
  const { width: w, height: h } = px;
  const e = energia(px);
  let s = 0, sx = 0, sy = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const v = e[y * w + x]; s += v; sx += v * x; sy += v * y; }
  return s ? { x: sx / s / w, y: sy / s / h } : { x: 0.5, y: 0.5 };
}

/*
 * O que há de errado, na língua de quem usa. `foto`: { largura, altura }
 * (do arquivo); `espaco`: [w, h] do espaço na TV; `px`: a miniatura.
 * Cada problema: { tipo, texto, conserta } — `conserta` diz se o toque
 * resolve ('niveis' ou 'recorte') ou se é só aviso.
 */
export function problemasDaFoto(px, foto, espaco) {
  const out = [];
  const luz = medirLuz(px);
  if (luz.media < 78) out.push({ tipo: 'escura', texto: 'A foto está escura: na TV ela vira uma mancha.', conserta: 'niveis' });
  else if (luz.alto - luz.baixo < 150 || luz.desvio < 38) out.push({ tipo: 'contraste', texto: 'A foto está apagada, sem contraste: de longe, nada se destaca.', conserta: 'niveis' });
  const [ew, eh] = espaco || [1920, 1080];
  const re = ew / eh;
  const rf = foto.largura / foto.altura;
  const corte = 1 - Math.min(rf, re) / Math.max(rf, re);
  const c = centroDoAssunto(px);
  const foraDoMeio = Math.abs(c.x - 0.5) > 0.17 || Math.abs(c.y - 0.5) > 0.17;
  if (corte > 0.3 || (corte > 0.12 && foraDoMeio)) {
    out.push({ tipo: 'enquadramento', texto: rf > re ? 'A foto é bem mais larga que o espaço: dá para recortar em volta do que importa.' : 'A foto é bem mais alta que o espaço: dá para recortar em volta do que importa.', conserta: 'recorte' });
  }
  const amp = ampliacao(foto, espaco);
  if (amp > AMPLIACAO_MAXIMA) out.push({ tipo: 'pequena', texto: 'A foto é pequena para a TV (' + foto.largura + '×' + foto.altura + ' px): ela vai aparecer menor, no meio do espaço. Se tiver uma maior, use.', conserta: '' });
  else if (amp > AMPLIACAO_BORRADA) out.push({ tipo: 'borrada', texto: 'A foto tem pouca resolução para a TV (' + foto.largura + '×' + foto.altura + ' px): vai ficar um pouco borrada.', conserta: '' });
  return out;
}

// Quanto a TV estica a foto para cobrir o espaço.
export function ampliacao(foto, espaco) {
  const [ew, eh] = espaco || [1920, 1080];
  if (!(foto && foto.largura > 0 && foto.altura > 0)) return 1;
  return Math.max(ew / foto.largura, eh / foto.altura);
}

/* ---------------- No navegador ---------------- */

function abrirImagem(arquivo) {
  return new Promise((ok, falha) => {
    const url = URL.createObjectURL(arquivo);
    const img = new Image();
    img.onload = () => ok({ img, url });
    img.onerror = () => { URL.revokeObjectURL(url); falha(new Error('Não consegui abrir esta foto.')); };
    img.src = url;
  });
}

function pixels(fonte, sx, sy, sw, sh, lado) {
  const k = Math.min(1, lado / Math.max(sw, sh));
  const cv = document.createElement('canvas');
  cv.width = Math.max(1, Math.round(sw * k));
  cv.height = Math.max(1, Math.round(sh * k));
  const g = cv.getContext('2d');
  g.drawImage(fonte, sx, sy, sw, sh, 0, 0, cv.width, cv.height);
  return { cv, g, px: g.getImageData(0, 0, cv.width, cv.height) };
}

/*
 * Analisa a foto escolhida para um espaço de `espaco` ([w, h] na TV):
 * { img, url, largura, altura, problemas, niveis, recorte }. `niveis` e
 * `recorte` são os consertos possíveis (null quando não há o que fazer).
 * `url` é a prévia do original: quem chama solta (URL.revokeObjectURL).
 */
export async function analisarFoto(arquivo, espaco) {
  const { img, url } = await abrirImagem(arquivo);
  const largura = img.naturalWidth, altura = img.naturalHeight;
  const { px } = pixels(img, 0, 0, largura, altura, LADO_DA_MEDIDA);
  const problemas = problemasDaFoto(px, { largura, altura }, espaco);
  const [ew, eh] = espaco || [1920, 1080];
  return {
    img, url, largura, altura, problemas,
    niveis: problemas.some((p) => p.conserta === 'niveis') ? niveisAutomaticos(medirLuz(px)) : null,
    recorte: problemas.some((p) => p.conserta === 'recorte') ? recorteInteligente(px, ew / eh) : null,
  };
}

/*
 * A foto melhorada: o recorte (se pedido), encolhida até 2560 px e com os
 * níveis (se pedidos), em JPEG 0,86 — o mesmo do envio. Devolve
 * { arquivo, url, largura, altura }.
 */
export async function melhorarFoto(analise, { niveis, recorte, nome }) {
  const { img, largura, altura } = analise;
  const r = recorte || { x: 0, y: 0, w: 1, h: 1 };
  const sx = Math.round(r.x * largura), sy = Math.round(r.y * altura);
  const sw = Math.max(1, Math.round(r.w * largura)), sh = Math.max(1, Math.round(r.h * altura));
  const { cv, g, px } = pixels(img, sx, sy, sw, sh, LADO_MAXIMO);
  if (niveis) { aplicarNiveis(px, niveis); g.putImageData(px, 0, 0); }
  const blob = await new Promise((ok) => cv.toBlob(ok, 'image/jpeg', 0.86));
  if (!blob) throw new Error('Não deu para preparar a foto melhorada.');
  const arquivo = new File([blob], String(nome || 'foto').replace(/\.\w+$/, '') + '-melhorada.jpg', { type: 'image/jpeg' });
  return { arquivo, url: URL.createObjectURL(blob), largura: cv.width, altura: cv.height };
}
