/*
 * A foto da IA, leve para o TV Box (server/foto-leve.js).
 *
 * O gerador devolve PNG de 1 a 2 MB; a TV de 2 GB decodifica a foto a cada
 * giro da playlist. Guardada, ela vira o que um envio do celular vira: o
 * maior lado até 1920, JPEG 86 e a miniatura borrada do fundo. PNG com
 * transparência de verdade continua PNG. Nada se perde: o que não abre vai
 * como veio, e o caminho do dinheiro (reserva → gera → guarda → cobra) é o
 * mesmo.
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const zlib = require('node:zlib');
const { spawnSync } = require('node:child_process');

// O disco da mídia num temporário, antes de o storage ser carregado.
const DADOS = fs.mkdtempSync(path.join(os.tmpdir(), 'mt-foto-leve-'));
process.env.MEDIA_DIR = DADOS;
process.env.STORAGE = 'disk';
const F = require('../server/foto-leve.js');
const midia = require('../server/midia.js');
const iaImagem = require('../server/ia-imagem.js');
test.after(() => { try { fs.rmSync(DADOS, { recursive: true, force: true }); } catch (e) { /* o Windows segura o arquivo */ } });

/* ---------------- Um PNG de teste, feito aqui ---------------- */

const crcTab = (() => { const t = new Int32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c; } return t; })();
const crc = (b) => { let c = -1; for (let i = 0; i < b.length; i++) c = crcTab[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; };
function pedaco(tipo, dados) {
  const t = Buffer.alloc(4); t.writeUInt32BE(dados.length);
  const td = Buffer.concat([Buffer.from(tipo, 'ascii'), dados]);
  const c = Buffer.alloc(4); c.writeUInt32BE(crc(td));
  return Buffer.concat([t, td, c]);
}
const paeth = (a, b, c) => { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); return pa <= pb && pa <= pc ? a : pb <= pc ? b : c; };
/*
 * PNG de `amostras` (Uint8Array cru, linha a linha) com o filtro de cada
 * linha girando entre os cinco — o leitor tem de desfazer todos.
 */
function png({ w, h, tipo, prof = 8, amostras, plte, trns }) {
  const canais = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[tipo];
  const linha = Math.ceil((w * canais * prof) / 8), bpp = Math.max(1, (canais * prof) >> 3);
  const cru = Buffer.alloc((linha + 1) * h);
  for (let y = 0; y < h; y++) {
    const f = y % 5, o = y * (linha + 1), l = y * linha;
    cru[o] = f;
    for (let i = 0; i < linha; i++) {
      const a = i >= bpp ? amostras[l + i - bpp] : 0, b = y ? amostras[l - linha + i] : 0, c = y && i >= bpp ? amostras[l - linha + i - bpp] : 0;
      cru[o + 1 + i] = (amostras[l + i] - [0, a, b, (a + b) >> 1, paeth(a, b, c)][f]) & 255;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = prof; ihdr[9] = tipo;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), pedaco('IHDR', ihdr),
    ...(plte ? [pedaco('PLTE', Buffer.from(plte))] : []), ...(trns ? [pedaco('tRNS', Buffer.from(trns))] : []),
    pedaco('IDAT', zlib.deflateSync(cru)), pedaco('IEND', Buffer.alloc(0))]);
}
// Uma "foto": degradê, uma luz e grão fino (o que deixa o PNG do gerador pesado), sempre a mesma.
function foto(w, h, comAlfa) {
  const c = comAlfa ? 4 : 3, a = new Uint8Array(w * h * c);
  let s = 12345;
  const ruido = () => { s = (s * 1103515245 + 12345) >>> 0; return ((s >>> 16) & 15) - 8; };
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * c, d = Math.hypot(x - w * 0.6, y - h * 0.4) / Math.min(w, h);
      const luz = Math.max(0, 1 - d * 2) * 90;
      a[o] = Math.max(0, Math.min(255, 60 + (x / w) * 120 + luz + ruido()));
      a[o + 1] = Math.max(0, Math.min(255, 40 + (y / h) * 100 + luz + ruido()));
      a[o + 2] = Math.max(0, Math.min(255, 90 + luz * 0.5 + ruido()));
      if (comAlfa) a[o + 3] = d < 0.35 ? 255 : d < 0.4 ? 128 : 0;
    }
  }
  return png({ w, h, tipo: comAlfa ? 6 : 2, amostras: a });
}

// As medidas e a amostragem de um JPEG, lidas do SOF0.
function lerJpeg(buf) {
  assert.deepEqual([buf[0], buf[1], buf[buf.length - 2], buf[buf.length - 1]], [0xff, 0xd8, 0xff, 0xd9], 'sem SOI/EOI');
  for (let i = 2; i < buf.length;) {
    if (buf[i] !== 0xff) { i++; continue; }
    if (buf[i + 1] === 0xc0) return { altura: buf.readUInt16BE(i + 5), largura: buf.readUInt16BE(i + 7), componentes: buf[i + 9], amostragemY: buf[i + 11] };
    i += 2 + buf.readUInt16BE(i + 2);
  }
  throw new Error('sem SOF0');
}

/* ---------------- O leitor de PNG ---------------- */

test('o leitor de PNG desfaz os cinco filtros, em RGB, RGBA, cinza de 16 bits e paleta de 2 bits com transparência', () => {
  const rgb = new Uint8Array(7 * 6 * 3).map((_, i) => (i * 37 + (i >> 3) * 11) & 255);
  const r1 = F.abrirPng(png({ w: 7, h: 6, tipo: 2, amostras: rgb }));
  assert.deepEqual([r1.largura, r1.altura, r1.alfa], [7, 6, false]);
  for (let p = 0; p < 42; p++) assert.deepEqual([...r1.rgba.subarray(p * 4, p * 4 + 4)], [rgb[p * 3], rgb[p * 3 + 1], rgb[p * 3 + 2], 255], 'pixel ' + p);

  const rgba = new Uint8Array(5 * 5 * 4).map((_, i) => (i * 53) & 255);
  const r2 = F.abrirPng(png({ w: 5, h: 5, tipo: 6, amostras: rgba }));
  assert.deepEqual([...r2.rgba], [...rgba]);
  assert.equal(r2.alfa, true);

  // Cinza de 16 bits: vale o byte de cima.
  const g16 = new Uint8Array(4 * 2 * 2);
  const valores = [0, 257, 32768, 65535, 1000, 51400, 12850, 65280];
  valores.forEach((v, i) => { g16[i * 2] = v >> 8; g16[i * 2 + 1] = v & 255; });
  const r3 = F.abrirPng(png({ w: 4, h: 2, tipo: 0, prof: 16, amostras: g16 }));
  assert.deepEqual([...r3.rgba].filter((_, i) => i % 4 === 0), valores.map((v) => v >> 8));

  // Paleta de 2 bits (4 pixels por byte), a cor 2 transparente pelo tRNS.
  const plte = [255, 0, 0, 0, 255, 0, 0, 0, 255, 9, 9, 9];
  const idx = [0, 1, 2, 3, 3, 2, 1, 0, 1, 1];
  const linhas = [idx.slice(0, 5), idx.slice(5)];
  const cru = new Uint8Array(2 * 2);
  linhas.forEach((l, y) => l.forEach((k, x) => { cru[y * 2 + (x >> 2)] |= k << (6 - 2 * (x & 3)); }));
  const r4 = F.abrirPng(png({ w: 5, h: 2, tipo: 3, prof: 2, amostras: cru, plte, trns: [255, 255, 0] }));
  assert.equal(r4.alfa, true);
  idx.forEach((k, p) => assert.deepEqual([...r4.rgba.subarray(p * 4, p * 4 + 4)], [plte[k * 3], plte[k * 3 + 1], plte[k * 3 + 2], k === 2 ? 0 : 255], 'paleta ' + p));

  // E o PNG que este módulo grava (só a transparente encolhida) abre igual.
  assert.deepEqual([...F.abrirPng(F.gravarPng({ largura: 5, altura: 5, rgba })).rgba], [...rgba]);
});

/* ---------------- A foto leve ---------------- */

test('a foto da IA: o PNG pesado vira JPEG 4:2:0 com o maior lado em 1920, e traz a miniatura borrada do fundo', () => {
  const pesado = foto(2400, 1350);
  const r = F.aliviar(pesado, 'image/png');
  assert.equal(r.mudou, true);
  assert.equal(r.mime, 'image/jpeg');
  assert.deepEqual([r.largura, r.altura], [1920, 1080]);
  const j = lerJpeg(r.buf);
  assert.deepEqual([j.largura, j.altura, j.componentes, j.amostragemY], [1920, 1080, 3, 0x22]);
  assert.ok(r.buf.length < pesado.length / 4, 'ficou ' + r.buf.length + ' de ' + pesado.length);
  // A miniatura: um JPEG de 24 px, ~1 KB, que js/render.js e js/peca-html.js aceitam como fundo.
  assert.match(r.fundo, /^data:image\/jpeg;base64,[A-Za-z0-9+/]+=*$/);
  assert.ok(r.fundo.length < 3000, 'miniatura de ' + r.fundo.length + ' caracteres');
  const mini = lerJpeg(Buffer.from(r.fundo.split(',')[1], 'base64'));
  assert.deepEqual([mini.largura, mini.altura], [24, 14]);
  // A mesma foto dá os mesmos bytes (a foto de exemplo do modo sem IA conta com isso).
  assert.ok(F.aliviar(pesado, 'image/png').buf.equals(r.buf));
  // Foto menor que 1920 não cresce: só muda de formato.
  const pequena = F.aliviar(foto(1344, 768), 'image/png');
  assert.deepEqual([pequena.mime, pequena.largura, pequena.altura], ['image/jpeg', 1344, 768]);
  assert.deepEqual([lerJpeg(pequena.buf).largura, lerJpeg(pequena.buf).altura], [1344, 768]);
});

test('transparência só quando precisa: PNG com alfa de verdade continua PNG (encolhido); alfa todo cheio vira JPEG', () => {
  const recorte = F.aliviar(foto(2200, 2200, true), 'image/png');
  assert.equal(recorte.mime, 'image/png');
  const aberto = F.abrirPng(recorte.buf);
  assert.deepEqual([aberto.largura, aberto.altura, aberto.alfa], [1920, 1920, true]);
  // A borda recortada não escurece (a cor é pré-multiplicada pelo alfa ao encolher).
  const meio = (Math.round(1920 * 0.4) * 1920 + Math.round(1920 * 0.6)) * 4;
  assert.ok(aberto.rgba[meio + 3] === 255 && aberto.rgba[meio] > 100, 'o centro do recorte perdeu a cor');
  assert.match(recorte.fundo, /^data:image\/jpeg;base64,/);
  // Pequeno e transparente: fica como veio (regravar não ganharia nada), mas a miniatura sai.
  const peq = foto(300, 300, true);
  const r2 = F.aliviar(peq, 'image/png');
  assert.ok(r2.buf.equals(peq));
  assert.equal(r2.mudou, false);
  assert.ok(r2.fundo);
  // RGBA com o alfa todo em 255 é opaco: vira JPEG.
  const opaco = F.abrirPng(foto(400, 300)).rgba;
  assert.equal(F.aliviar(png({ w: 400, h: 300, tipo: 6, amostras: opaco }), 'image/png').mime, 'image/jpeg');
});

test('nada se perde: JPEG, WEBP, o SVG do modo demonstração e PNG estragado vão como vieram', () => {
  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);
  for (const [buf, mime] of [[jpeg, 'image/jpeg'], [Buffer.from('RIFF....WEBP'), 'image/webp'], [Buffer.from('<svg/>'), 'image/svg+xml']]) {
    const r = F.aliviar(buf, mime);
    assert.ok(r.buf === buf && r.mime === mime && !r.mudou && !r.fundo, mime);
  }
  const bom = foto(200, 100);
  const estragado = Buffer.concat([bom.subarray(0, 60), Buffer.alloc(40, 7)]);
  const r = F.aliviar(estragado, 'image/png');
  assert.ok(r.buf === estragado && r.mime === 'image/png' && !r.mudou);
  assert.equal(F.aliviar(Buffer.from('não é png'), 'image/png').mudou, false);
});

test('fora do laço principal (worker): o mesmo resultado, byte a byte', async () => {
  const pesado = foto(2000, 1000);
  const aqui = F.aliviar(pesado, 'image/png');
  const la = await F.aliviarAparte(pesado, 'image/png');
  assert.ok(Buffer.isBuffer(la.buf));
  assert.ok(la.buf.equals(aqui.buf));
  assert.deepEqual([la.mime, la.largura, la.altura, la.fundo], [aqui.mime, aqui.largura, aqui.altura, aqui.fundo]);
  // Sem PNG, nem abre o worker.
  const svg = Buffer.from('<svg/>');
  assert.equal((await F.aliviarAparte(svg, 'image/svg+xml')).buf, svg);
});

/*
 * A conferência de verdade: um decodificador de JPEG que não é este (o do
 * PIL, quando a máquina tem). Sem ele, o teste pula — o resto confere a
 * estrutura; este confere que a foto que sai é a foto que entrou.
 */
test('um decodificador de fora abre o JPEG, e a foto é a mesma (PSNR acima de 33 dB)', (t) => {
  const tem = spawnSync('python3', ['-c', 'import PIL, numpy'], { encoding: 'utf8' });
  if (tem.status !== 0) { t.skip('sem python3 + PIL nesta máquina'); return; }
  const original = foto(1600, 900);
  const r = F.aliviar(original, 'image/png');
  const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'mt-foto-leve-pil-'));
  try {
    fs.writeFileSync(path.join(pasta, 'a.png'), original);
    fs.writeFileSync(path.join(pasta, 'b.jpg'), r.buf);
    const py = 'import sys,numpy as np\nfrom PIL import Image\n'
      + 'a=np.asarray(Image.open(sys.argv[1]).convert("RGB")).astype(float)\nb=np.asarray(Image.open(sys.argv[2]).convert("RGB")).astype(float)\n'
      + 'print(10*np.log10(255**2/np.mean((a-b)**2)))';
    const out = spawnSync('python3', ['-I', '-c', py, path.join(pasta, 'a.png'), path.join(pasta, 'b.jpg')], { encoding: 'utf8' });
    assert.equal(out.status, 0, out.stderr);
    const psnr = Number(out.stdout.trim());
    assert.ok(psnr > 33, 'PSNR ' + psnr);
  } finally { fs.rmSync(pasta, { recursive: true, force: true }); }
});

/* ---------------- Na porta da mídia e no caminho do dinheiro ---------------- */

const bancoFalso = () => { const linhas = []; return { linhas, createMedia: async (m) => { linhas.push(m); } }; };

test('midia.guardarBuffer: a da IA chega leve no disco e no banco (mime, tamanho); o resto não é tocado', async () => {
  const db = bancoFalso();
  const pesado = foto(2400, 1350);
  const s = await midia.guardarBuffer(db, 'conta1', pesado, 'image/png', { nome: 'IA · pão', origem: 'ia', formato: '16/9' });
  assert.match(s.url, /^\/media\/conta1\/\w+\.jpg$/);
  assert.deepEqual([s.mime, s.largura, s.altura], ['image/jpeg', 1920, 1080]);
  assert.match(s.fundo, /^data:image\/jpeg;base64,/);
  const noDisco = fs.readFileSync(path.join(DADOS, 'media', s.key));
  assert.equal(noDisco.length, s.size);
  assert.ok(s.size < pesado.length / 4);
  assert.deepEqual([db.linhas[0].mime, db.linhas[0].size, db.linhas[0].origem, db.linhas[0].formato], ['image/jpeg', s.size, 'ia', '16/9']);
  // Um PNG que não é da IA (o QR, a logo, o envio) fica como está.
  const qr = foto(300, 300);
  const outro = await midia.guardarBuffer(db, 'conta1', qr, 'image/png', { nome: 'QR', origem: 'upload' });
  assert.deepEqual([outro.mime, outro.size, outro.fundo], ['image/png', qr.length, undefined]);
});

test('o caminho do dinheiro continua: reserva, gera, guarda leve, cobra uma vez; falhou ao guardar, devolve', async () => {
  const pesado = foto(1344, 768);
  const conta = (o) => {
    const c = { reservar: 0, devolver: 0, cobrar: [] };
    return {
      c,
      ctx: {
        db: Object.assign(bancoFalso(), { getTenant: async (id) => ({ id, plan: 'pro' }) }),
        ai: { mode: () => 'provedor', generateImage: async () => ({ mime: 'image/png', data: pesado.toString('base64') }) },
        midia: o && o.quebrado ? { guardarBuffer: async () => { throw new Error('storage fora do ar'); } } : midia,
        usoIA: {
          reservar: async () => { c.reservar++; return { ok: true, reserva: { daFranquia: 1, doComprado: 0 } }; },
          controleDaReserva: () => { let fim = false; return { async devolver() { if (!fim) { fim = true; c.devolver++; } }, cobrada() { fim = true; }, fechar() { return this.devolver(); } }; },
          cobrar: async (db, t, x) => { c.cobrar.push(x); },
        },
      },
    };
  };
  const a = conta();
  const r = await iaImagem.gerar(a.ctx, { tenant_id: 'conta2', user_id: 'u' }, { prompt: 'pão francês', formato: '16/9', papel: 'produto' });
  assert.equal(r.status, 200);
  assert.deepEqual([r.corpo.item.mime, a.c.reservar, a.c.cobrar.length, a.c.devolver], ['image/jpeg', 1, 1, 0]);
  assert.match(r.corpo.item.url, /\.jpg$/);
  assert.match(r.corpo.item.fundo, /^data:image\/jpeg;base64,/);
  assert.equal(a.c.cobrar[0].referencia, r.corpo.item.id);
  // O storage caiu depois de a foto existir: nada se cobra, o crédito volta.
  const b = conta({ quebrado: true });
  await assert.rejects(iaImagem.gerar(b.ctx, { tenant_id: 'conta2', user_id: 'u' }, { prompt: 'pão', formato: '16/9', papel: '' }), /storage fora do ar/);
  assert.deepEqual([b.c.cobrar.length, b.c.devolver], [0, 1]);
});

test('as três rotas que geram foto guardam com origem "ia" (é o que liga a foto leve) e o sw.js guarda /media/ pelo caminho, não pelo tipo', () => {
  const server = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  const chamadas = server.match(/ai\.generateImage\([\s\S]{0,1400}?midia\.guardarBuffer\([^;]*?origem: 'ia'/g) || [];
  assert.equal(chamadas.length, 2, 'fotoDaConta e generate-image');
  assert.match(fs.readFileSync(path.join(__dirname, '..', 'server/ia-imagem.js'), 'utf8'), /midia\.guardarBuffer\([^;]*origem: 'ia'/);
  const sw = fs.readFileSync(path.join(__dirname, '..', 'sw.js'), 'utf8');
  assert.match(sw, /url\.pathname\.startsWith\('\/media\/'\)[\s\S]{0,200}cacheFirst\(req, MEDIA_CACHE\)/);
  // O tipo novo é um que o storage já serve.
  assert.equal(require('../server/storage.js').extFor('image/jpeg'), 'jpg');
});
