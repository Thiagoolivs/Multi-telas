/*
 * server/foto-leve.js — a foto da IA, leve para o TV Box.
 *
 * A foto gerada chegava do jeito que o gerador devolve: PNG, 1 a 2 MB, às
 * vezes 2752 px de lado. O envio do cliente já encolhe no navegador
 * (web/src/lib/subir.js: 2560 px, JPEG 0,86, mais a miniatura borrada de
 * 24 px) e a do banco vem com 1280 px. A da IA era a única pesada — e é a
 * que o box de 2 GB decodifica a cada giro da playlist.
 *
 * Aqui ela vira o mesmo que um envio: o maior lado até 1920 (a TV é 1080p)
 * e JPEG 86, com a miniatura borrada para o fundo (data:image/jpeg, ~1 KB).
 * PNG com transparência de verdade continua PNG (só encolhe): JPEG pintaria
 * o transparente de preto.
 *
 * Por que JPEG e não WEBP: o WEBP sairia ~25% menor, mas o arquivo baixa
 * UMA vez (o sw.js guarda /media/ para sempre) e é decodificado a CADA vez
 * que aparece — e o JPEG é o que o box decodifica mais rápido, o mesmo das
 * fotos do cliente, do banco e das peças-ouro. E sem dependência nenhuma:
 * o PNG abre com o zlib do Node, e o JPEG sai do codificador abaixo
 * (baseline, 4:2:0, as tabelas do padrão). Nativo (sharp/libvips) seria
 * mais rápido, mas é binário a mais no deploy para uma conta de ~0,1 s por
 * foto, numa geração que leva 20.
 *
 * Nunca perde a foto: o que não der para abrir (outro formato, PNG
 * entrelaçado, arquivo estranho) vai como veio. A foto já foi paga.
 */
'use strict';
const zlib = require('zlib');

const LADO_MAXIMO = 1920;
const QUALIDADE = 86;
const LADO_FUNDO = 24;
const QUALIDADE_FUNDO = 60;
// Teto de pixels para abrir (12k × 12k em RGBA seriam 576 MB): acima disso vai como veio.
const MAX_PIXELS = 40e6;

/* ---------------- PNG: abrir ---------------- */

function paeth(a, b, c) {
  const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}

// Desfaz o filtro de uma linha (PNG, seção 9): `atual` recebe a linha, `antes` é a de cima.
function desfiltrar(cru, o, filtro, atual, antes, linha, bpp) {
  if (filtro === 0) { cru.copy(atual, 0, o, o + linha); return; }
  for (let i = 0; i < linha; i++) {
    const x = cru[o + i];
    if (filtro === 1) atual[i] = (x + (i >= bpp ? atual[i - bpp] : 0)) & 255;
    else if (filtro === 2) atual[i] = (x + antes[i]) & 255;
    else if (filtro === 3) atual[i] = (x + (((i >= bpp ? atual[i - bpp] : 0) + antes[i]) >> 1)) & 255;
    else atual[i] = (x + (i >= bpp ? paeth(atual[i - bpp], antes[i], antes[i - bpp]) : antes[i])) & 255;
  }
}

/*
 * Abre um PNG em RGBA de 8 bits: { largura, altura, rgba, alfa } — `alfa`
 * diz se algum pixel é transparente de verdade. Tipos 0, 2, 3, 4 e 6, de
 * 1 a 16 bits; entrelaçado não (lança, e quem chama guarda como veio).
 */
function abrirPng(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 33 || buf.readUInt32BE(0) !== 0x89504e47 || buf.readUInt32BE(4) !== 0x0d0a1a0a) throw new Error('não é PNG');
  let pos = 8, w = 0, h = 0, prof = 0, tipo = 0, entrelacado = 0, paleta = null, trns = null;
  const idat = [];
  while (pos + 8 <= buf.length) {
    const tam = buf.readUInt32BE(pos), nome = buf.toString('ascii', pos + 4, pos + 8);
    const dados = buf.subarray(pos + 8, pos + 8 + tam);
    if (nome === 'IHDR') { w = dados.readUInt32BE(0); h = dados.readUInt32BE(4); prof = dados[8]; tipo = dados[9]; entrelacado = dados[12]; }
    else if (nome === 'PLTE') paleta = dados;
    else if (nome === 'tRNS') trns = dados;
    else if (nome === 'IDAT') idat.push(dados);
    else if (nome === 'IEND') break;
    pos += 12 + tam;
  }
  if (!w || !h || w * h > MAX_PIXELS) throw new Error('PNG sem medida ou grande demais');
  if (entrelacado) throw new Error('PNG entrelaçado');
  const canais = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[tipo];
  if (!canais || [1, 2, 4, 8, 16].indexOf(prof) < 0 || (tipo === 3 && !paleta)) throw new Error('PNG de tipo desconhecido');
  const cru = zlib.inflateSync(Buffer.concat(idat));
  const bpp = Math.max(1, (canais * prof) >> 3);      // bytes por pixel, para o filtro
  const linha = Math.ceil((w * canais * prof) / 8);
  if (cru.length < (linha + 1) * h) throw new Error('PNG curto');
  const atual = Buffer.alloc(linha), antes = Buffer.alloc(linha);
  const rgba = new Uint8Array(w * h * 4);
  let alfa = false;
  const max = (1 << Math.min(prof, 8)) - 1;
  // Transparência por tRNS: uma cor só (tipos 0 e 2) ou alfa por entrada da paleta (tipo 3).
  const corTrns = trns && tipo === 0 ? [trns.readUInt16BE(0)] : trns && tipo === 2 ? [trns.readUInt16BE(0), trns.readUInt16BE(2), trns.readUInt16BE(4)] : null;
  // O caso de quase toda foto gerada: RGB ou RGBA de 8 bits, sem tRNS. Vai direto, sem a leitura amostra por amostra.
  const direto = prof === 8 && (tipo === 2 || tipo === 6) && !corTrns;
  for (let y = 0; y < h; y++) {
    const o = y * (linha + 1), filtro = cru[o];
    desfiltrar(cru, o + 1, filtro, atual, antes, linha, bpp);
    if (direto) {
      const d0 = y * w * 4;
      if (tipo === 6) {
        rgba.set(atual, d0);
        if (!alfa) for (let i = 3; i < linha; i += 4) if (atual[i] < 255) { alfa = true; break; }
      } else {
        for (let x = 0, s = 0, d = d0; x < w; x++, s += 3, d += 4) { rgba[d] = atual[s]; rgba[d + 1] = atual[s + 1]; rgba[d + 2] = atual[s + 2]; rgba[d + 3] = 255; }
      }
      antes.set(atual);
      continue;
    }
    const amostra = (k) => {
      // A k-ésima amostra da linha, no valor cru (até 16 bits).
      if (prof === 8) return atual[k];
      if (prof === 16) return (atual[k * 2] << 8) | atual[k * 2 + 1];
      const bit = k * prof;
      return (atual[bit >> 3] >> (8 - prof - (bit & 7))) & ((1 << prof) - 1);
    };
    const oito = (v) => (prof === 16 ? v >> 8 : prof === 8 ? v : Math.round((v * 255) / max));
    for (let x = 0; x < w; x++) {
      const d = (y * w + x) * 4;
      let r, g, b, a = 255;
      if (tipo === 3) {
        const k = amostra(x);
        r = paleta[k * 3]; g = paleta[k * 3 + 1]; b = paleta[k * 3 + 2];
        if (trns && k < trns.length) a = trns[k];
      } else if (tipo === 0 || tipo === 4) {
        const v = amostra(x * canais);
        r = g = b = oito(v);
        if (tipo === 4) a = oito(amostra(x * canais + 1));
        else if (corTrns && v === corTrns[0]) a = 0;
      } else {
        const vr = amostra(x * canais), vg = amostra(x * canais + 1), vb = amostra(x * canais + 2);
        r = oito(vr); g = oito(vg); b = oito(vb);
        if (tipo === 6) a = oito(amostra(x * canais + 3));
        else if (corTrns && vr === corTrns[0] && vg === corTrns[1] && vb === corTrns[2]) a = 0;
      }
      rgba[d] = r; rgba[d + 1] = g; rgba[d + 2] = b; rgba[d + 3] = a;
      if (a < 255) alfa = true;
    }
    antes.set(atual);
  }
  return { largura: w, altura: h, rgba, alfa };
}

/* ---------------- Encolher ---------------- */

/*
 * Média por área (a "caixa" exata): cada pixel novo é a média ponderada dos
 * pixels velhos que ele cobre, com fração nas bordas. É o que encolher pede
 * — sem serrilhado e sem amolecer além do necessário. Em duas passadas
 * (deitada, depois em pé). Com transparência, a cor é pré-multiplicada pelo
 * alfa, senão a borda recortada escurece.
 */
function pesos(de, para) {
  const k = de / para, lista = [];
  for (let i = 0; i < para; i++) {
    const ini = i * k, fim = Math.min(de, ini + k);
    const p = [];
    for (let j = Math.floor(ini); j < fim; j++) {
      const peso = Math.min(fim, j + 1) - Math.max(ini, j);
      if (peso > 1e-9) p.push(j, peso / k);
    }
    lista.push(p);
  }
  return lista;
}

function encolher(img, largura, altura) {
  const { largura: w, altura: h, rgba, alfa } = img;
  if (largura === w && altura === h) return img;
  const ph = pesos(w, largura), pv = pesos(h, altura);
  // A passada deitada lê o RGBA direto (a cópia em ponto flutuante da foto inteira eram 67 MB numa de 2752 px).
  const meio = new Float32Array(largura * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < largura; x++) {
      const p = ph[x], d = (y * largura + x) * 4;
      let r = 0, g = 0, b = 0, a = 0;
      for (let k = 0; k < p.length; k += 2) {
        const o = (y * w + p[k]) * 4, q = p[k + 1], qa = alfa ? q * rgba[o + 3] / 255 : q;
        r += rgba[o] * qa; g += rgba[o + 1] * qa; b += rgba[o + 2] * qa; a += rgba[o + 3] * q;
      }
      meio[d] = r; meio[d + 1] = g; meio[d + 2] = b; meio[d + 3] = a;
    }
  }
  const out = new Uint8Array(largura * altura * 4);
  for (let y = 0; y < altura; y++) {
    const p = pv[y];
    for (let x = 0; x < largura; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let k = 0; k < p.length; k += 2) { const o = (p[k] * largura + x) * 4, q = p[k + 1]; r += meio[o] * q; g += meio[o + 1] * q; b += meio[o + 2] * q; a += meio[o + 3] * q; }
      const d = (y * largura + x) * 4, m = alfa ? (a > 0 ? 255 / a : 0) : 1;
      out[d] = Math.min(255, Math.round(r * m)); out[d + 1] = Math.min(255, Math.round(g * m)); out[d + 2] = Math.min(255, Math.round(b * m));
      out[d + 3] = Math.min(255, Math.round(a));
    }
  }
  return { largura, altura, rgba: out, alfa };
}

// As medidas com o maior lado em `lado` (sem aumentar).
function medidasAte(w, h, lado) {
  const k = Math.min(1, lado / Math.max(w, h));
  return [Math.max(1, Math.round(w * k)), Math.max(1, Math.round(h * k))];
}

/* ---------------- JPEG: gravar ---------------- */

// Ordem zigue-zague: a posição de cada coeficiente (na ordem natural) no fluxo.
const ZIGUE = [0, 1, 5, 6, 14, 15, 27, 28, 2, 4, 7, 13, 16, 26, 29, 42, 3, 8, 12, 17, 25, 30, 41, 43, 9, 11, 18, 24, 31, 40, 44, 53,
  10, 19, 23, 32, 39, 45, 52, 54, 20, 22, 33, 38, 46, 51, 55, 60, 21, 34, 37, 47, 50, 56, 59, 61, 35, 36, 48, 49, 57, 58, 62, 63];
// As tabelas de quantização e de Huffman do padrão (ITU T.81, anexo K).
const QY = [16, 11, 10, 16, 24, 40, 51, 61, 12, 12, 14, 19, 26, 58, 60, 55, 14, 13, 16, 24, 40, 57, 69, 56, 14, 17, 22, 29, 51, 87, 80, 62,
  18, 22, 37, 56, 68, 109, 103, 77, 24, 35, 55, 64, 81, 104, 113, 92, 49, 64, 78, 87, 103, 121, 120, 101, 72, 92, 95, 98, 112, 100, 103, 99];
const QC = [17, 18, 24, 47, 99, 99, 99, 99, 18, 21, 26, 66, 99, 99, 99, 99, 24, 26, 56, 99, 99, 99, 99, 99, 47, 66, 99, 99, 99, 99, 99, 99,
  99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99];
const DC_Y = { n: [0, 1, 5, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0], v: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] };
const DC_C = { n: [0, 3, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0], v: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] };
const AC_Y = { n: [0, 2, 1, 3, 3, 2, 4, 3, 5, 5, 4, 4, 0, 0, 1, 0x7d], v: [
  0x01, 0x02, 0x03, 0x00, 0x04, 0x11, 0x05, 0x12, 0x21, 0x31, 0x41, 0x06, 0x13, 0x51, 0x61, 0x07, 0x22, 0x71, 0x14, 0x32, 0x81, 0x91, 0xa1, 0x08,
  0x23, 0x42, 0xb1, 0xc1, 0x15, 0x52, 0xd1, 0xf0, 0x24, 0x33, 0x62, 0x72, 0x82, 0x09, 0x0a, 0x16, 0x17, 0x18, 0x19, 0x1a, 0x25, 0x26, 0x27, 0x28,
  0x29, 0x2a, 0x34, 0x35, 0x36, 0x37, 0x38, 0x39, 0x3a, 0x43, 0x44, 0x45, 0x46, 0x47, 0x48, 0x49, 0x4a, 0x53, 0x54, 0x55, 0x56, 0x57, 0x58, 0x59,
  0x5a, 0x63, 0x64, 0x65, 0x66, 0x67, 0x68, 0x69, 0x6a, 0x73, 0x74, 0x75, 0x76, 0x77, 0x78, 0x79, 0x7a, 0x83, 0x84, 0x85, 0x86, 0x87, 0x88, 0x89,
  0x8a, 0x92, 0x93, 0x94, 0x95, 0x96, 0x97, 0x98, 0x99, 0x9a, 0xa2, 0xa3, 0xa4, 0xa5, 0xa6, 0xa7, 0xa8, 0xa9, 0xaa, 0xb2, 0xb3, 0xb4, 0xb5, 0xb6,
  0xb7, 0xb8, 0xb9, 0xba, 0xc2, 0xc3, 0xc4, 0xc5, 0xc6, 0xc7, 0xc8, 0xc9, 0xca, 0xd2, 0xd3, 0xd4, 0xd5, 0xd6, 0xd7, 0xd8, 0xd9, 0xda, 0xe1, 0xe2,
  0xe3, 0xe4, 0xe5, 0xe6, 0xe7, 0xe8, 0xe9, 0xea, 0xf1, 0xf2, 0xf3, 0xf4, 0xf5, 0xf6, 0xf7, 0xf8, 0xf9, 0xfa] };
const AC_C = { n: [0, 2, 1, 2, 4, 4, 3, 4, 7, 5, 4, 4, 0, 1, 2, 0x77], v: [
  0x00, 0x01, 0x02, 0x03, 0x11, 0x04, 0x05, 0x21, 0x31, 0x06, 0x12, 0x41, 0x51, 0x07, 0x61, 0x71, 0x13, 0x22, 0x32, 0x81, 0x08, 0x14, 0x42, 0x91,
  0xa1, 0xb1, 0xc1, 0x09, 0x23, 0x33, 0x52, 0xf0, 0x15, 0x62, 0x72, 0xd1, 0x0a, 0x16, 0x24, 0x34, 0xe1, 0x25, 0xf1, 0x17, 0x18, 0x19, 0x1a, 0x26,
  0x27, 0x28, 0x29, 0x2a, 0x35, 0x36, 0x37, 0x38, 0x39, 0x3a, 0x43, 0x44, 0x45, 0x46, 0x47, 0x48, 0x49, 0x4a, 0x53, 0x54, 0x55, 0x56, 0x57, 0x58,
  0x59, 0x5a, 0x63, 0x64, 0x65, 0x66, 0x67, 0x68, 0x69, 0x6a, 0x73, 0x74, 0x75, 0x76, 0x77, 0x78, 0x79, 0x7a, 0x82, 0x83, 0x84, 0x85, 0x86, 0x87,
  0x88, 0x89, 0x8a, 0x92, 0x93, 0x94, 0x95, 0x96, 0x97, 0x98, 0x99, 0x9a, 0xa2, 0xa3, 0xa4, 0xa5, 0xa6, 0xa7, 0xa8, 0xa9, 0xaa, 0xb2, 0xb3, 0xb4,
  0xb5, 0xb6, 0xb7, 0xb8, 0xb9, 0xba, 0xc2, 0xc3, 0xc4, 0xc5, 0xc6, 0xc7, 0xc8, 0xc9, 0xca, 0xd2, 0xd3, 0xd4, 0xd5, 0xd6, 0xd7, 0xd8, 0xd9, 0xda,
  0xe2, 0xe3, 0xe4, 0xe5, 0xe6, 0xe7, 0xe8, 0xe9, 0xea, 0xf2, 0xf3, 0xf4, 0xf5, 0xf6, 0xf7, 0xf8, 0xf9, 0xfa] };

// O código de cada símbolo: [código, tamanho em bits].
function codigos(t) {
  const out = [];
  let cod = 0, k = 0;
  for (let tam = 1; tam <= 16; tam++) {
    for (let i = 0; i < t.n[tam - 1]; i++) out[t.v[k++]] = [cod++, tam];
    cod <<= 1;
  }
  return out;
}
const H = { dcY: codigos(DC_Y), dcC: codigos(DC_C), acY: codigos(AC_Y), acC: codigos(AC_C) };
// Os fatores da DCT rápida (Arai, Agui e Nakajima), um por linha e coluna.
const AAN = [1, 1.387039845, 1.306562965, 1.175875602, 1, 0.785694958, 0.5411961, 0.275899379];

// A tabela de quantização na qualidade pedida (a mesma escala da libjpeg), em zigue-zague, e o divisor de cada coeficiente.
function tabelas(qualidade) {
  const q = Math.max(1, Math.min(100, Math.round(qualidade)));
  const escala = q < 50 ? Math.floor(5000 / q) : 200 - q * 2;
  const mk = (base) => {
    const zz = new Uint8Array(64), div = new Float32Array(64);
    for (let i = 0; i < 64; i++) zz[ZIGUE[i]] = Math.max(1, Math.min(255, Math.floor((base[i] * escala + 50) / 100)));
    for (let l = 0; l < 8; l++) for (let c = 0; c < 8; c++) div[l * 8 + c] = 1 / (zz[ZIGUE[l * 8 + c]] * AAN[l] * AAN[c] * 8);
    return { zz, div };
  };
  return { y: mk(QY), c: mk(QC) };
}

// A DCT de um bloco 8×8 (no lugar), já dividida pela quantização, em zigue-zague e arredondada.
function dct(d, div, saida) {
  for (let o = 0; o < 64; o += 8) passada(d, o, 1);
  for (let o = 0; o < 8; o++) passada(d, o, 8);
  for (let i = 0; i < 64; i++) { const v = d[i] * div[i]; saida[ZIGUE[i]] = v > 0 ? (v + 0.5) | 0 : (v - 0.5) | 0; }
}
function passada(d, o, p) {
  const d0 = d[o], d1 = d[o + p], d2 = d[o + 2 * p], d3 = d[o + 3 * p], d4 = d[o + 4 * p], d5 = d[o + 5 * p], d6 = d[o + 6 * p], d7 = d[o + 7 * p];
  const t0 = d0 + d7, t7 = d0 - d7, t1 = d1 + d6, t6 = d1 - d6, t2 = d2 + d5, t5 = d2 - d5, t3 = d3 + d4, t4 = d3 - d4;
  let t10 = t0 + t3; const t13 = t0 - t3; let t11 = t1 + t2; let t12 = t1 - t2;
  d[o] = t10 + t11; d[o + 4 * p] = t10 - t11;
  const z1 = (t12 + t13) * 0.707106781;
  d[o + 2 * p] = t13 + z1; d[o + 6 * p] = t13 - z1;
  t10 = t4 + t5; t11 = t5 + t6; t12 = t6 + t7;
  const z5 = (t10 - t12) * 0.382683433, z2 = 0.5411961 * t10 + z5, z4 = 1.306562965 * t12 + z5, z3 = t11 * 0.707106781;
  const z11 = t7 + z3, z13 = t7 - z3;
  d[o + 5 * p] = z13 + z2; d[o + 3 * p] = z13 - z2; d[o + p] = z11 + z4; d[o + 7 * p] = z11 - z4;
}

// O fluxo de bits, com o 0x00 depois de todo 0xFF (a regra do JPEG).
function escritor(estimativa) {
  let buf = Buffer.alloc(Math.max(4096, estimativa)), n = 0, acc = 0, bits = 0;
  const byte = (b) => {
    if (n + 2 > buf.length) { const novo = Buffer.alloc(buf.length * 2); buf.copy(novo, 0, 0, n); buf = novo; }
    buf[n++] = b;
  };
  return {
    byte,
    bytes(arr) { for (let i = 0; i < arr.length; i++) byte(arr[i]); },
    palavra(v) { byte((v >> 8) & 255); byte(v & 255); },
    bits(cod, tam) {
      acc = (acc << tam) | (cod & ((1 << tam) - 1)); bits += tam;
      while (bits >= 8) { const b = (acc >> (bits - 8)) & 255; byte(b); if (b === 255) byte(0); bits -= 8; acc &= (1 << bits) - 1; }
    },
    fechar() { if (bits > 0) this.bits((1 << (8 - bits)) - 1, 8 - bits); },
    fim() { return buf.subarray(0, n); },
  };
}

// O tamanho (categoria) e os bits de um valor, como o JPEG codifica.
function categoria(v) { let a = v < 0 ? -v : v, c = 0; while (a) { c++; a >>= 1; } return c; }

function bloco(e, d, div, dcAnterior, dc, ac, zz) {
  dct(d, div, zz);
  const dif = zz[0] - dcAnterior;
  if (dif === 0) e.bits(dc[0][0], dc[0][1]);
  else { const c = categoria(dif); e.bits(dc[c][0], dc[c][1]); e.bits(dif < 0 ? dif + (1 << c) - 1 : dif, c); }
  let ultimo = 63;
  while (ultimo > 0 && zz[ultimo] === 0) ultimo--;
  let zeros = 0;
  for (let i = 1; i <= ultimo; i++) {
    const v = zz[i];
    if (v === 0) { zeros++; continue; }
    while (zeros >= 16) { e.bits(ac[0xf0][0], ac[0xf0][1]); zeros -= 16; }
    const c = categoria(v), s = (zeros << 4) | c;
    e.bits(ac[s][0], ac[s][1]); e.bits(v < 0 ? v + (1 << c) - 1 : v, c);
    zeros = 0;
  }
  if (ultimo < 63) e.bits(ac[0][0], ac[0][1]);
  return zz[0];
}

/*
 * RGBA → JPEG baseline, 4:2:0 (a cor em meia resolução, como sai de câmera
 * e do toBlob do navegador). O alfa é ignorado: quem chama só manda opaco
 * (ou a miniatura, que o navegador também pintaria sobre preto).
 */
function gravarJpeg(img, qualidade) {
  const { largura: w, altura: h, rgba } = img;
  const t = tabelas(qualidade == null ? QUALIDADE : qualidade);
  // Y em resolução cheia; Cb e Cr já na média de cada 2×2 (a borda repete o último pixel).
  const Y = new Float32Array(w * h);
  const cw = (w + 1) >> 1, ch = (h + 1) >> 1;
  const Cb = new Float32Array(cw * ch), Cr = new Float32Array(cw * ch);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 4, r = rgba[o], g = rgba[o + 1], b = rgba[o + 2];
      Y[y * w + x] = 0.299 * r + 0.587 * g + 0.114 * b - 128;
      const k = (y >> 1) * cw + (x >> 1);
      Cb[k] += -0.168736 * r - 0.331264 * g + 0.5 * b;
      Cr[k] += 0.5 * r - 0.418688 * g - 0.081312 * b;
    }
  }
  for (let y = 0; y < ch; y++) {
    for (let x = 0; x < cw; x++) {
      const n = (Math.min(2, w - x * 2)) * (Math.min(2, h - y * 2));
      Cb[y * cw + x] /= n; Cr[y * cw + x] /= n;
    }
  }
  const e = escritor(Math.round(w * h * 0.4));
  e.palavra(0xffd8);
  e.palavra(0xffe0); e.palavra(16); e.bytes([0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0]); e.palavra(1); e.palavra(1); e.byte(0); e.byte(0);
  e.palavra(0xffdb); e.palavra(132); e.byte(0); e.bytes(t.y.zz); e.byte(1); e.bytes(t.c.zz);
  e.palavra(0xffc0); e.palavra(17); e.byte(8); e.palavra(h); e.palavra(w); e.byte(3);
  e.bytes([1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1]);
  e.palavra(0xffc4); e.palavra(0x01a2);
  for (const [classe, tab] of [[0x00, DC_Y], [0x10, AC_Y], [0x01, DC_C], [0x11, AC_C]]) { e.byte(classe); e.bytes(tab.n); e.bytes(tab.v); }
  e.palavra(0xffda); e.palavra(12); e.byte(3); e.bytes([1, 0x00, 2, 0x11, 3, 0x11]); e.bytes([0, 63, 0]);
  const d = new Float32Array(64), zz = new Int32Array(64);
  let dcY = 0, dcB = 0, dcR = 0;
  const copiar = (fonte, fw, fh, x0, y0) => {
    for (let l = 0; l < 8; l++) {
      const yy = Math.min(fh - 1, y0 + l) * fw;
      for (let c = 0; c < 8; c++) d[l * 8 + c] = fonte[yy + Math.min(fw - 1, x0 + c)];
    }
  };
  for (let my = 0; my < h; my += 16) {
    for (let mx = 0; mx < w; mx += 16) {
      for (const [ox, oy] of [[0, 0], [8, 0], [0, 8], [8, 8]]) { copiar(Y, w, h, mx + ox, my + oy); dcY = bloco(e, d, t.y.div, dcY, H.dcY, H.acY, zz); }
      copiar(Cb, cw, ch, mx >> 1, my >> 1); dcB = bloco(e, d, t.c.div, dcB, H.dcC, H.acC, zz);
      copiar(Cr, cw, ch, mx >> 1, my >> 1); dcR = bloco(e, d, t.c.div, dcR, H.dcC, H.acC, zz);
    }
  }
  e.fechar();
  e.palavra(0xffd9);
  return Buffer.from(e.fim());
}

/* ---------------- PNG: gravar (só a transparente encolhida) ---------------- */

const TABELA_CRC = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c; }
  return t;
})();
function crc32(buf) { let c = -1; for (let i = 0; i < buf.length; i++) c = TABELA_CRC[(c ^ buf[i]) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; }
function pedaco(tipo, dados) {
  const tam = Buffer.alloc(4); tam.writeUInt32BE(dados.length);
  const td = Buffer.concat([Buffer.from(tipo, 'ascii'), dados]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([tam, td, crc]);
}
// RGBA 8 bits, filtro Paeth em toda linha: o que melhor comprime foto, numa passada só.
function gravarPng(img) {
  const { largura: w, altura: h, rgba } = img;
  const linha = w * 4, cru = Buffer.alloc((linha + 1) * h);
  for (let y = 0; y < h; y++) {
    const o = y * (linha + 1), l = y * linha;
    cru[o] = 4;
    for (let i = 0; i < linha; i++) {
      const a = i >= 4 ? rgba[l + i - 4] : 0, b = y ? rgba[l - linha + i] : 0, c = y && i >= 4 ? rgba[l - linha + i - 4] : 0;
      cru[o + 1 + i] = (rgba[l + i] - paeth(a, b, c)) & 255;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), pedaco('IHDR', ihdr), pedaco('IDAT', zlib.deflateSync(cru, { level: 6 })), pedaco('IEND', Buffer.alloc(0))]);
}

/* ---------------- A foto leve ---------------- */

// A miniatura borrada do fundo, como a do envio (web/src/lib/subir.js): data:image/jpeg, ~1 KB.
function miniatura(img) {
  const [w, h] = medidasAte(img.largura, img.altura, LADO_FUNDO);
  let p = encolher(img, w, h);
  if (p === img) p = Object.assign({}, img, { rgba: Uint8Array.from(img.rgba) });
  // Sobre preto, como o <canvas> do navegador pinta o transparente num JPEG.
  if (p.alfa) for (let i = 0; i < p.rgba.length; i += 4) { const a = p.rgba[i + 3] / 255; p.rgba[i] *= a; p.rgba[i + 1] *= a; p.rgba[i + 2] *= a; }
  return 'data:image/jpeg;base64,' + gravarJpeg(p, QUALIDADE_FUNDO).toString('base64');
}

/*
 * A foto da IA pronta para guardar: { buf, mime, largura, altura, fundo,
 * mudou }. Só PNG muda (é o que o gerador devolve); o resto — JPEG, WEBP,
 * o SVG do modo demonstração — vai como veio, sem fundo.
 */
function aliviar(buf, mime, opcoes) {
  const o = opcoes || {};
  const lado = o.lado || LADO_MAXIMO;
  const igual = { buf, mime, largura: 0, altura: 0, fundo: '', mudou: false };
  if (!/^image\/png$/i.test(String(mime || ''))) return igual;
  let img;
  try { img = abrirPng(buf); } catch (e) { return igual; }
  try {
    const [w, h] = medidasAte(img.largura, img.altura, lado);
    const encolhida = encolher(img, w, h);
    const fundo = miniatura(encolhida);
    if (img.alfa) {
      // Transparente de verdade: continua PNG, só menor (e só se encolheu: regravar do mesmo tamanho não ganha nada).
      if (w === img.largura && h === img.altura) return Object.assign(igual, { largura: w, altura: h, fundo });
      const png = gravarPng(encolhida);
      return png.length < buf.length ? { buf: png, mime: 'image/png', largura: w, altura: h, fundo, mudou: true } : Object.assign(igual, { largura: img.largura, altura: img.altura, fundo });
    }
    const jpeg = gravarJpeg(encolhida, o.qualidade || QUALIDADE);
    // Como no envio do navegador: só troca se ficou menor.
    if (jpeg.length >= buf.length) return Object.assign(igual, { largura: img.largura, altura: img.altura, fundo });
    return { buf: jpeg, mime: 'image/jpeg', largura: w, altura: h, fundo, mudou: true };
  } catch (e) { return igual; }
}

/*
 * A mesma coisa FORA do laço principal (worker_threads). São 0,1 s numa
 * foto de 1344 px e meio segundo numa de 2752 — tempo em que o servidor
 * não responderia a TV nenhuma. Sem worker (ambiente que não deixa abrir
 * thread), faz aqui mesmo. O worker que cair ou passar do prazo devolve a
 * foto como veio: nunca fica sem foto, e nunca trava a geração.
 */
const PRAZO_MS = 30000;
function aliviarAparte(buf, mime, opcoes) {
  const igual = { buf, mime, largura: 0, altura: 0, fundo: '', mudou: false };
  if (!/^image\/png$/i.test(String(mime || ''))) return Promise.resolve(igual);
  let Worker;
  try { ({ Worker } = require('worker_threads')); } catch (e) { return Promise.resolve(aliviar(buf, mime, opcoes)); }
  return new Promise((ok) => {
    let w, feito = false;
    const fim = (r) => { if (feito) return; feito = true; clearTimeout(prazo); ok(r); if (w) w.terminate().catch(() => {}); };
    const prazo = setTimeout(() => fim(igual), PRAZO_MS);
    try {
      w = new Worker(__filename, { workerData: { fotoLeve: true, buf, mime, opcoes: opcoes || null } });
    } catch (e) { fim(aliviar(buf, mime, opcoes)); return; }
    w.once('message', (r) => fim(r && r.buf ? Object.assign({}, r, { buf: Buffer.from(r.buf.buffer, r.buf.byteOffset, r.buf.byteLength) }) : igual));
    w.once('error', () => fim(igual));
    w.once('exit', () => fim(igual));
  });
}

// Dentro do worker: abre, alivia e devolve.
(function () {
  let wt;
  try { wt = require('worker_threads'); } catch (e) { return; }
  if (wt.isMainThread || !wt.workerData || wt.workerData.fotoLeve !== true) return;
  const d = wt.workerData;
  const r = aliviar(Buffer.from(d.buf.buffer, d.buf.byteOffset, d.buf.byteLength), d.mime, d.opcoes);
  wt.parentPort.postMessage(Object.assign({}, r, { buf: new Uint8Array(r.buf.buffer, r.buf.byteOffset, r.buf.byteLength) }));
})();

module.exports = { aliviar, aliviarAparte, abrirPng, encolher, gravarJpeg, gravarPng, miniatura, medidasAte, LADO_MAXIMO, QUALIDADE, LADO_FUNDO };
