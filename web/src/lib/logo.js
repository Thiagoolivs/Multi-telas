/*
 * A LOGO ANALISADA E CORRIGIDA (EXECUTOR D7).
 *
 * O dono: "aceita SVG e PNG; a IA analisa (fundo, resolução, cores, leitura
 * no claro e no escuro); a ferramenta recorta fundo sólido, vetoriza logo
 * simples e gera as versões clara e escura. O dono vê antes e depois e
 * aprova. Nunca troca calado."
 *
 * Tudo aqui roda no navegador, nos pixels da própria logo: é exato, é na
 * hora e não gasta criação. Uma IA "olhando" a logo diria as mesmas coisas
 * com menos certeza — e cobrando. A palavra final é da pessoa: esta lib só
 * PROPÕE; quem grava é a página, depois do "Usar a nova".
 */

const LADO_ANALISE = 256;         // a análise reduz para isto (rápido e suficiente)
const LADO_SAIDA = 1200;          // as versões geradas saem com até isto de lado
export const CLARO = '#ffffff';   // o fundo claro da TV
export const ESCURO = '#0b1220';  // o fundo escuro da TV

/* ---------------- cor ---------------- */

const hex = (r, g, b) => '#' + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
function rgb(h) {
  const n = parseInt(String(h).replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function luminancia(r, g, b) {
  const c = [r, g, b].map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
export function contraste(a, b) {
  const la = luminancia(...rgb(a)); const lb = luminancia(...rgb(b));
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}
const distancia = (r1, g1, b1, r2, g2, b2) => Math.sqrt((r1 - r2) ** 2 + (g1 - g2) ** 2 + (b1 - b2) ** 2);

/* ---------------- imagem ---------------- */

export function carregar(url) {
  return new Promise((ok, falha) => {
    const img = new Image();
    img.onload = () => ok(img);
    img.onerror = () => falha(new Error('não deu para abrir a logo'));
    img.src = url;
  });
}

// A logo num canvas, com o lado maior em `lado` (SVG sem tamanho ganha um).
function noCanvas(img, lado) {
  const w0 = img.naturalWidth || img.width || lado;
  const h0 = img.naturalHeight || img.height || lado;
  const k = lado / Math.max(w0, h0);
  const w = Math.max(1, Math.round(w0 * k)); const h = Math.max(1, Math.round(h0 * k));
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const g = cv.getContext('2d', { willReadFrequently: true });
  g.drawImage(img, 0, 0, w, h);
  return cv;
}

/* ---------------- análise ---------------- */

/*
 * O fundo é sólido quando a BORDA da imagem é quase toda de uma cor só e
 * opaca: é o "quadrado branco" que vira caixa na TV escura.
 */
function fundoDaBorda(d, w, h) {
  const conta = new Map();
  let total = 0; let transparentes = 0;
  const ver = (x, y) => {
    const i = (y * w + x) * 4;
    total++;
    if (d[i + 3] < 200) { transparentes++; return; }
    const k = [d[i] >> 4, d[i + 1] >> 4, d[i + 2] >> 4].join(',');
    const c = conta.get(k) || { n: 0, r: 0, g: 0, b: 0 };
    c.n++; c.r += d[i]; c.g += d[i + 1]; c.b += d[i + 2];
    conta.set(k, c);
  };
  for (let x = 0; x < w; x++) { ver(x, 0); ver(x, h - 1); }
  for (let y = 1; y < h - 1; y++) { ver(0, y); ver(w - 1, y); }
  if (transparentes / total > 0.5) return { transparente: true, fundo: null };
  const maior = [...conta.values()].sort((a, b) => b.n - a.n)[0];
  if (maior && maior.n / total >= 0.8) return { transparente: false, fundo: hex(maior.r / maior.n, maior.g / maior.n, maior.b / maior.n) };
  return { transparente: false, fundo: null };
}

/*
 * As cores da logo (sem o fundo), agrupadas. `simples` diz se dá para
 * vetorizar bem: poucas cores chapadas cobrindo quase tudo — degradê e foto
 * viram uma colcha de retalhos.
 */
function coresDaLogo(d, fundo) {
  const fr = fundo ? rgb(fundo) : null;
  const grupos = new Map();
  let n = 0;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] < 128) continue;
    if (fr && distancia(d[i], d[i + 1], d[i + 2], ...fr) < 40) continue;
    n++;
    const k = [d[i] >> 5, d[i + 1] >> 5, d[i + 2] >> 5].join(',');
    const g = grupos.get(k) || { n: 0, r: 0, g: 0, b: 0 };
    g.n++; g.r += d[i]; g.g += d[i + 1]; g.b += d[i + 2];
    grupos.set(k, g);
  }
  const ordem = [...grupos.values()].sort((a, b) => b.n - a.n);
  let cores = ordem.filter((g) => g.n / Math.max(1, n) >= 0.03).slice(0, 5).map((g) => hex(g.r / g.n, g.g / g.n, g.b / g.n));
  /*
   * Tom de borda não é cor da logo: é a mistura de uma cor mais forte com o
   * fundo (ou com o transparente, que na tela vira a própria cor clareada).
   * Fica de fora quem cai no caminho entre uma cor anterior e o fundo.
   */
  const noCaminho = (c, m, f) => {
    let melhor = Infinity;
    for (let t = 0; t <= 1.0001; t += 0.05) {
      melhor = Math.min(melhor, distancia(c[0], c[1], c[2], m[0] * t + f[0] * (1 - t), m[1] * t + f[1] * (1 - t), m[2] * t + f[2] * (1 - t)));
    }
    return melhor < 28;
  };
  if (fr) cores = cores.filter((c, i) => !cores.slice(0, i).some((m) => noCaminho(rgb(c), rgb(m), fr)));
  /*
   * A borda suavizada de um texto pequeno mistura a cor com o fundo e cria
   * dezenas de tons "novos" — não é degradê. Conta como da cor o pixel que
   * está perto de uma das cores principais (ou do fundo); logo simples é a
   * que quase toda cabe nessas poucas cores.
   */
  const principais = cores.map(rgb);
  let perto = 0;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] < 128) continue;
    if (fr && distancia(d[i], d[i + 1], d[i + 2], ...fr) < 40) continue;
    if (principais.some((c) => distancia(d[i], d[i + 1], d[i + 2], ...c) < 70)
      || (fr && distancia(d[i], d[i + 1], d[i + 2], ...fr) < 140)) perto++;
  }
  return { cores, pixels: n, simples: cores.length >= 1 && cores.length <= 4 && perto / Math.max(1, n) >= 0.85 };
}

/*
 * Lê bem num fundo quando a maior parte da logo tem contraste de ao menos
 * 2:1 com ele. Logo com fundo próprio sólido "lê" em qualquer TV, mas como
 * uma caixa — isso aparece como aviso do fundo, não da leitura.
 */
function leitura(d, fundoProprio, sobre) {
  if (fundoProprio) return { ok: true, fracao: 1 };
  const [br, bg, bb] = rgb(sobre);
  const lf = luminancia(br, bg, bb);
  let n = 0; let boas = 0;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] < 128) continue;
    n++;
    const l = luminancia(d[i], d[i + 1], d[i + 2]);
    if ((Math.max(l, lf) + 0.05) / (Math.min(l, lf) + 0.05) >= 2) boas++;
  }
  const fracao = n ? boas / n : 0;
  return { ok: fracao >= 0.6, fracao };
}

export async function analisar(url, mime) {
  const img = await carregar(url);
  const svg = /svg/.test(mime || '') || /\.svg(\?|$)/i.test(url);
  const largura = img.naturalWidth || 0; const altura = img.naturalHeight || 0;
  const cv = noCanvas(img, LADO_ANALISE);
  const d = cv.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, cv.width, cv.height).data;
  const borda = fundoDaBorda(d, cv.width, cv.height);
  const { cores, simples } = coresDaLogo(d, borda.fundo);
  return {
    svg, largura, altura,
    // Vetor não tem resolução; PNG com menos de 400 px no lado maior borra numa TV grande.
    pequena: !svg && Math.max(largura, altura) < 400,
    transparente: borda.transparente,
    fundo: borda.fundo,
    cores, simples,
    claro: leitura(d, borda.fundo, CLARO),
    escuro: leitura(d, borda.fundo, ESCURO),
  };
}

/* ---------------- correções ---------------- */

/*
 * Recorta o fundo sólido: apaga, a partir da BORDA, o que tem a cor do fundo
 * (inundação, para não abrir buraco num "O" branco no meio da logo). A beira
 * fica com transparência parcial, para não serrilhar.
 */
function tirarFundo(cv, fundo) {
  const g = cv.getContext('2d', { willReadFrequently: true });
  const { width: w, height: h } = cv;
  const im = g.getImageData(0, 0, w, h); const d = im.data;
  const [fr, fg, fb] = rgb(fundo);
  const PERTO = 38; const LONGE = 90;
  const visto = new Uint8Array(w * h);
  const fila = [];
  const empurrar = (x, y) => { const p = y * w + x; if (!visto[p]) { visto[p] = 1; fila.push(p); } };
  for (let x = 0; x < w; x++) { empurrar(x, 0); empurrar(x, h - 1); }
  for (let y = 0; y < h; y++) { empurrar(0, y); empurrar(w - 1, y); }
  while (fila.length) {
    const p = fila.pop(); const i = p * 4;
    const dist = distancia(d[i], d[i + 1], d[i + 2], fr, fg, fb);
    if (dist >= LONGE) continue;
    // Perto do fundo: some. Na transição: fica parcial, e para de espalhar.
    d[i + 3] = dist < PERTO ? 0 : Math.round(d[i + 3] * (dist - PERTO) / (LONGE - PERTO));
    if (dist >= PERTO) continue;
    const x = p % w; const y = (p / w) | 0;
    if (x > 0) empurrar(x - 1, y);
    if (x < w - 1) empurrar(x + 1, y);
    if (y > 0) empurrar(x, y - 1);
    if (y < h - 1) empurrar(x, y + 1);
  }
  g.putImageData(im, 0, 0);
  return cv;
}

// Uma cor só, mantendo a transparência: a versão para fundo claro ou escuro.
function monocromatica(cv, cor) {
  const out = document.createElement('canvas');
  out.width = cv.width; out.height = cv.height;
  const g = out.getContext('2d');
  g.drawImage(cv, 0, 0);
  g.globalCompositeOperation = 'source-in';
  g.fillStyle = cor;
  g.fillRect(0, 0, out.width, out.height);
  return out;
}

// Corta a margem vazia: a logo ocupa o canto da peça, não o vazio em volta dela.
function aparar(cv) {
  const g = cv.getContext('2d', { willReadFrequently: true });
  const { width: w, height: h } = cv;
  const d = g.getImageData(0, 0, w, h).data;
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (d[(y * w + x) * 4 + 3] > 16) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  }
  if (x1 < 0) return cv;
  const m = Math.round(Math.max(w, h) * 0.02);
  x0 = Math.max(0, x0 - m); y0 = Math.max(0, y0 - m); x1 = Math.min(w - 1, x1 + m); y1 = Math.min(h - 1, y1 + m);
  const out = document.createElement('canvas');
  out.width = x1 - x0 + 1; out.height = y1 - y0 + 1;
  out.getContext('2d').drawImage(cv, x0, y0, out.width, out.height, 0, 0, out.width, out.height);
  return out;
}

/*
 * Vetoriza (só logo simples: poucas cores chapadas). O traçador vem sob
 * demanda — ninguém que não abre esta tela paga o peso dele.
 */
async function vetorizar(cv, cores) {
  const { default: ImageTracer } = await import('imagetracerjs');
  // Ampliada antes de traçar: o contorno sai liso, não em degraus de pixel.
  const grande = noCanvas(cv, 960);
  const d = grande.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, grande.width, grande.height);
  /*
   * A paleta é a da logo, fixa (um ciclo só): deixar o traçador tirar a média
   * misturava a borda suavizada na cor e o azul-marinho saía lavado.
   */
  const pal = [{ r: 0, g: 0, b: 0, a: 0 }].concat(cores.map((c) => { const [r, g, b] = rgb(c); return { r, g, b, a: 255 }; }));
  const svg = ImageTracer.imagedataToSVG(d, {
    pal, numberofcolors: pal.length, colorquantcycles: 1,
    ltres: 0.5, qtres: 0.5, pathomit: 6, rightangleenhance: true, blurradius: 0,
    strokewidth: 0, linefilter: true, roundcoords: 1, viewbox: true, desc: false,
  });
  // O traçador desenha também a camada transparente (opacity="0"): só pesa.
  return svg.replace(/<path[^>]*opacity="0"[^>]*\/>/g, '');
}

const paraBlob = (cv) => new Promise((ok) => cv.toBlob(ok, 'image/png'));

/*
 * A PROPOSTA: o que mudaria, sem gravar nada. Devolve os arquivos novos
 * (para a página subir se a pessoa aprovar) e a lista do que foi feito,
 * em português, para o "antes e depois".
 */
export async function propor(url, analise) {
  const a = analise || await analisar(url);
  const img = await carregar(url);
  let cv = noCanvas(img, a.svg ? LADO_SAIDA : Math.min(LADO_SAIDA, Math.max(img.naturalWidth, img.naturalHeight)));
  const feito = [];
  if (a.fundo && !a.transparente) { cv = tirarFundo(cv, a.fundo); feito.push('Tirei o fundo ' + (luminancia(...rgb(a.fundo)) > 0.8 ? 'branco' : 'sólido') + ': a logo não vira uma caixa na TV.'); }
  const aparada = aparar(cv);
  if (aparada.width < cv.width * 0.92 || aparada.height < cv.height * 0.92) feito.push('Cortei a margem vazia em volta.');
  cv = aparada;

  const avisos = [];
  let principal = { blob: await paraBlob(cv), tipo: 'image/png', nome: 'logo.png' };
  if (!a.svg && a.simples && a.pequena) {
    try {
      const svg = await vetorizar(cv, a.cores);
      principal = { blob: new Blob([svg], { type: 'image/svg+xml' }), tipo: 'image/svg+xml', nome: 'logo.svg' };
      feito.push('Vetorizei: a logo era pequena e agora fica nítida em qualquer TV.');
    } catch (e) { /* sem vetor: segue o PNG limpo */ }
  } else if (a.pequena) {
    avisos.push('A logo é pequena e tem detalhes demais para vetorizar: se tiver uma maior (ou em SVG), envie.');
  }

  /*
   * A leitura é medida DEPOIS de tirar o fundo: a logo branca dentro de uma
   * caixa azul lia bem em tudo — sem a caixa, some no fundo claro.
   */
  const pequena = noCanvas(cv, LADO_ANALISE);
  const d = pequena.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, pequena.width, pequena.height).data;
  const claro = leitura(d, null, CLARO); const escuro = leitura(d, null, ESCURO);

  // As versões de uma cor só, para quando a logo some num dos fundos.
  const versoes = {};
  if (!escuro.ok) { versoes.clara = { blob: await paraBlob(monocromatica(cv, CLARO)), nome: 'logo-clara.png' }; feito.push('Fiz uma versão branca, para o fundo escuro da TV (a original some nele).'); }
  if (!claro.ok) { versoes.escura = { blob: await paraBlob(monocromatica(cv, ESCURO)), nome: 'logo-escura.png' }; feito.push('Fiz uma versão escura, para o fundo claro (a original some nele).'); }

  return {
    feito,
    avisos,
    principal,
    versoes,
    // Para a prévia: endereços locais dos arquivos novos.
    previa: {
      principal: URL.createObjectURL(principal.blob),
      clara: versoes.clara ? URL.createObjectURL(versoes.clara.blob) : '',
      escura: versoes.escura ? URL.createObjectURL(versoes.escura.blob) : '',
    },
    mudou: feito.length > 0,
  };
}
