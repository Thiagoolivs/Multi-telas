/*
 * FOTO VIVA: o vídeo curto e mudo num espaço de foto das peças.
 *
 *   - o valor do campo: um arquivo nosso terminado em .mp4/.webm, e o poster
 *     (o primeiro quadro, JPEG) ao lado (js/peca-html.js, ehVideo);
 *   - o autor da peça continua sem <video>: só o renderizador troca o <img>
 *     do campo pelo vídeo (js/peca-render.js, videoNoLugar e cssComVideo);
 *   - o modo leve mostra o poster parado (a bancada confere no navegador:
 *     tools/regua-tv.mjs, conferirFotoViva);
 *   - o banco de vídeos (pecas-ouro/videos/): esquema, arquivos e créditos;
 *   - a entrada do vídeo do cliente (server/foto-viva.js): com e sem ffmpeg.
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { Readable } = require('node:stream');
const { execFileSync } = require('node:child_process');

process.env.MEDIA_DIR = process.env.MEDIA_DIR || fs.mkdtempSync(path.join(os.tmpdir(), 'mt-foto-viva-'));
const P = require('../js/peca-html.js');
const R = require('../js/peca-render.js');
const FV = require('../server/foto-viva.js');
const midia = require('../server/midia.js');

const RAIZ = path.join(__dirname, '..');
const ler = (...p) => fs.readFileSync(path.join(RAIZ, ...p), 'utf8');

/* ---------------- O valor do campo ---------------- */

test('o valor do campo: .mp4/.webm nosso é vídeo; o poster mora ao lado, em .jpg', () => {
  assert.equal(P.ehVideo('/media/t1/abc123.mp4'), true);
  assert.equal(P.ehVideo('/pecas-ouro/videos/padaria/cafe-fumegando.mp4'), true);
  assert.equal(P.ehVideo('/media/t1/abc123.webm'), true);
  assert.equal(P.ehVideo('/media/t1/abc123.jpg'), false, 'foto é foto');
  assert.equal(P.ehVideo('/pecas-ouro/fotos/otica-sol.jpg'), false);
  // Endereço de fora continua proibido, vídeo ou não.
  assert.equal(P.ehVideo('https://exemplo.com/media/t1/a.mp4'), false);
  assert.equal(P.ehVideo('https://cdn.nosso.com/media/t1/a.mp4', ['cdn.nosso.com']), true);
  assert.equal(P.ehVideo('/media/../segredo.mp4'), false);
  assert.equal(P.ehVideo('/videos/a.mp4'), false);
  // O banco de vídeos é nosso, como o de fotos.
  assert.equal(P.ehMidia('/pecas-ouro/videos/padaria/cafe-fumegando.jpg'), true);

  assert.equal(P.posterDoVideo('/media/t1/abc123.mp4'), '/media/t1/abc123.jpg');
  assert.equal(P.posterDoVideo('/media/t1/abc123.mp4', { poster: '/media/t1/outro.jpg' }), '/media/t1/outro.jpg');
  // Poster de fora (ou que não é imagem) não vale: fica o que mora ao lado.
  assert.equal(P.posterDoVideo('/media/t1/abc123.mp4', { poster: 'https://rastreio.com/p.jpg' }), '/media/t1/abc123.jpg');
  assert.equal(P.posterDoVideo('/media/t1/abc123.mp4', { poster: '/media/t1/abc123.mp4' }), '/media/t1/abc123.jpg');
  assert.equal(P.posterDoVideo('/media/t1/foto.jpg'), '', 'foto não tem poster');
});

const PECA = {
  type: 'peca-html',
  html: '<section class="mt-peca"><img data-campo-img="foto" alt="" data-entrada="aparecer"><h1 data-campo="titulo">Café</h1></section>',
  css: '.mt-peca{background:var(--mt-fundo)} .mt-peca img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}',
};

test('a porta: o espaço com vídeo ganha o poster; conferir de novo não muda nada', () => {
  const v = P.validarItem(Object.assign({}, PECA, { campos: { foto: '/media/t1/abc123.mp4', titulo: 'Café' }, espacos: { foto: { papel: 'produto' } } }));
  assert.deepEqual(v.problemas, []);
  assert.equal(v.item.campos.foto, '/media/t1/abc123.mp4', 'o campo continua um texto');
  assert.deepEqual(v.item.espacos.foto, { papel: 'produto', poster: '/media/t1/abc123.jpg' });
  const de_novo = P.validarItem(v.item);
  assert.deepEqual(de_novo.item, v.item);
  // O que o "Trocar foto" devolve: { src, foco, poster }.
  const t = P.validarItem(Object.assign({}, PECA, { campos: { foto: { src: '/pecas-ouro/videos/padaria/cafe-fumegando.mp4', foco: { x: 0.5, y: 0.6 }, poster: '/pecas-ouro/videos/padaria/cafe-fumegando.jpg' } } }));
  assert.deepEqual(t.item.espacos.foto, { foco: { x: 0.5, y: 0.6 }, poster: '/pecas-ouro/videos/padaria/cafe-fumegando.jpg' });
  // Foto no campo: poster que sobrou de um vídeo anterior sai.
  const f = P.validarItem(Object.assign({}, PECA, { campos: { foto: '/media/t1/foto.jpg' }, espacos: { foto: { papel: 'produto', poster: '/media/t1/velho.jpg' } } }));
  assert.deepEqual(f.item.espacos.foto, { papel: 'produto' });
});

test('o autor da peça continua sem <video>: só o renderizador cria o vídeo', () => {
  const comVideo = P.higienizar({ html: '<section class="mt-peca"><video data-campo-img="foto" src="/media/t1/a.mp4" autoplay loop muted></video></section>', css: '' });
  assert.equal(comVideo.ok, false);
  assert.ok(comVideo.problemas.some((p) => /video/.test(p)), comVideo.problemas.join(' | '));
  const comSource = P.higienizar({ html: '<section class="mt-peca"><img data-campo-img="foto" alt=""><source src="/media/t1/a.mp4"></section>', css: '' });
  assert.equal(comSource.ok, false);
  // A tag continua na lista das proibidas da porta.
  assert.match(ler('js/peca-html.js'), /'button', 'select', 'option', 'video', 'audio'/);
});

test('o que a TV pré-carrega: o poster vai com as fotos; o vídeo, à parte (e nunca no modo leve)', () => {
  const item = Object.assign({}, PECA, { html: PECA.html + '<img data-campo-img="selo" alt="">', campos: { foto: '/media/t1/abc123.mp4', selo: '/media/t1/selo.png' } });
  assert.deepEqual(P.fotosDoItem(item), ['/media/t1/abc123.jpg', '/media/t1/selo.png']);
  assert.deepEqual(P.videosDoItem(item), ['/media/t1/abc123.mp4']);
  const player = ler('js/player.js');
  assert.match(player, /MTPecaHtml\.videosDoItem\(item, global\.MT_HOSTS_MIDIA \|\| \[\]\)/);
  assert.match(player, /if \(document\.documentElement\.classList\.contains\('mt-perf'\)\) videos = \[\];/);
  // Offline: os vídeos e as fotos do banco também entram no cache da mídia.
  assert.ok(player.includes('JSON.stringify(cfg).replace(/\\/pecas-ouro\\/(?:fotos|videos)\\/[A-Za-z0-9_.\\/\\-]+/g'));
  const sw = ler('sw.js');
  assert.match(sw, /url\.pathname\.startsWith\('\/pecas-ouro\/videos\/'\)\) \{\n    event\.respondWith\(cacheFirst\(req, MEDIA_CACHE\)\);/);
  assert.match(sw, /if \(url\.pathname === '\/pecas-ouro\/videos\/banco\.json'\) return;/);
});

/* ---------------- O renderizador ---------------- */

test('o CSS da peça que mira img vale também para o <video> do espaço', () => {
  const css = '.cartao img{border-radius:50%}.grade img:first-child,.titulo{color:red}.foto-img{x:1}'
    + '.qr:has(img[data-sem-foto]){display:none}@container (max-width: 700px){.prato img{width:40cqw}}';
  const c = R.cssComVideo(css);
  assert.match(c, /\.cartao img,\.cartao video\{border-radius:50%\}/);
  assert.match(c, /\.grade img:first-child,\.titulo,\.grade video:first-child\{color:red\}/);
  assert.match(c, /\.foto-img\{x:1\}/, 'classe com "img" no nome não é a tag');
  assert.doesNotMatch(c, /\.foto-video/);
  assert.match(c, /\.qr:has\(img\[data-sem-foto\]\),\.qr:has\(video\[data-sem-foto\]\)\{display:none\}/);
  assert.match(c, /@container \(max-width: 700px\)\{\.prato img,\.prato video\{width:40cqw\}\}/);
  assert.match(c, /^:where\(\.mt-peca\) :where\(video\)\{display:block\}/);
  // Só com vídeo no espaço, e nunca no modo leve nem no rascunho.
  const montar = ler('js/peca-render.js');
  assert.match(montar, /if \(!o\.rascunho && !o\.leve && Object\.keys\(it\.campos\)\.some\(\(k\) => P\.ehVideo\(it\.campos\[k\], o\.hostsMidia\)\)\) it\.css = cssComVideo\(it\.css\);/);
});

// Um elemento de mentira, só com o que videoNoLugar usa.
function elemento(tag, attrs) {
  const a = new Map(Object.entries(attrs || {}));
  const el = {
    tagName: tag.toUpperCase(), ouvintes: {}, parentNode: null,
    get attributes() { return Array.from(a, ([name, value]) => ({ name, value })); },
    getAttribute: (n) => (a.has(n) ? a.get(n) : null),
    setAttribute: (n, v) => { a.set(n, String(v)); },
    hasAttribute: (n) => a.has(n),
    removeAttribute: (n) => { a.delete(n); },
    addEventListener(t, f) { (el.ouvintes[t] = el.ouvintes[t] || []).push(f); },
    disparar(t) { (el.ouvintes[t] || []).forEach((f) => f()); },
    play() { el.tocou = true; return Promise.resolve(); },
  };
  return el;
}

test('o <img> do campo vira <video> mudo em laço, com os atributos dele — e volta ao poster se o vídeo não abre', () => {
  const pai = { filho: null, replaceChild(novo, velho) { if (velho) velho.parentNode = null; novo.parentNode = pai; pai.filho = novo; } };
  const img = elemento('img', { 'data-campo-img': 'foto', class: 'foto', alt: '', 'data-entrada': 'aparecer', 'data-ordem': '1', 'data-continua': 'kenburns', src: '/x.jpg' });
  img.ownerDocument = { createElement: (t) => elemento(t) };
  pai.replaceChild(img, null);
  let voltou = null;
  const v = R.videoNoLugar(img, '/media/t1/abc123.mp4', '/media/t1/abc123.jpg', (i) => { voltou = i; });
  assert.equal(pai.filho, v);
  assert.equal(v.tagName, 'VIDEO');
  assert.equal(v.getAttribute('data-campo-img'), 'foto');
  assert.equal(v.getAttribute('class'), 'foto');
  assert.equal(v.getAttribute('data-entrada'), 'aparecer', 'a entrada animada vem junto');
  assert.equal(v.getAttribute('data-ordem'), '1');
  assert.equal(v.getAttribute('data-continua'), null, 'o movimento de câmera da foto (kenburns) não vale no vídeo');
  assert.equal(v.getAttribute('src'), null, 'o src do <img> não é copiado');
  assert.equal(v.getAttribute('aria-hidden'), 'true');
  assert.equal(v.muted, true);
  assert.equal(v.loop, true);
  assert.equal(v.autoplay, true);
  assert.equal(v.getAttribute('playsinline'), '');
  assert.equal(v.preload, 'auto');
  assert.equal(v.poster, '/media/t1/abc123.jpg');
  assert.equal(v.src, '/media/t1/abc123.mp4');
  assert.equal(v.tocou, true);
  // Sem rede e sem o vídeo guardado (ou codec que o box não toca): o poster, parado.
  v.disparar('error');
  assert.equal(pai.filho, img);
  assert.equal(img.src, '/media/t1/abc123.jpg');
  assert.equal(img.getAttribute('data-foto-viva'), 'poster');
  assert.equal(voltou, img);
  // Outra contínua (flutuar…) fica: só o movimento de câmera da foto sai.
  const outro = elemento('img', { 'data-campo-img': 'foto', 'data-continua': 'flutuar' });
  outro.ownerDocument = img.ownerDocument;
  pai.replaceChild(outro, null);
  assert.equal(R.videoNoLugar(outro, '/media/t1/a.mp4', '/media/t1/a.jpg').getAttribute('data-continua'), 'flutuar');
});

test('no modo leve o espaço mostra o poster parado; o vídeo é solto ao sair da tela', () => {
  const src = ler('js/peca-render.js');
  const montar = src.slice(src.indexOf('function montar('), src.indexOf('return {\n      peca,'));
  assert.match(montar, /const poster = foto \? P\.posterDoVideo\(valor, foto\.esp, o\.hostsMidia\) : '';/);
  assert.match(montar, /else if \(poster && o\.leve\) \{ el\.setAttribute\('data-foto-viva', 'poster'\); el\.src = poster; \}/);
  assert.match(montar, /foto\.el = videoNoLugar\(el, valor, poster,/);
  assert.match(src, /videos\.forEach\(soltarVideo\); videos\.length = 0;/);
  // O encaixe (cobrir com o foco, conter com o fundo) mede o vídeo como mede a foto.
  assert.match(src, /const fw = img\.naturalWidth \|\| img\.videoWidth \|\| 0, fh = img\.naturalHeight \|\| img\.videoHeight \|\| 0;/);
  const v = { style: { props: {}, setProperty(k, x, i) { this.props[k] = x + (i ? ' !important' : ''); }, removeProperty(k) { delete this.props[k]; } },
    removeAttribute() {}, setAttribute() {}, hasAttribute: () => false, videoWidth: 1920, videoHeight: 1080, clientWidth: 1000, clientHeight: 1000 };
  assert.equal(R.encaixarFoto(v, { papel: 'produto', foco: { x: 0.3, y: 0.5 } }).modo, 'cobrir');
  assert.equal(v.style.props['object-position'], '30% 50% !important');
  // A régua confere no navegador, na bancada: ?video=…&leve=1.
  assert.match(ler('tools/regua-tv.mjs'), /async function conferirFotoViva\(navegador\)/);
  assert.match(ler('js/bancada.js'), /const LEVE = busca\.get\('leve'\) === '1';/);
});

/* ---------------- O banco de vídeos ---------------- */

const BANCO = JSON.parse(ler('pecas-ouro', 'videos', 'banco.json'));

test('o banco de vídeos: esquema, arquivos ao lado dos posters, ramos e papéis', () => {
  assert.ok(Array.isArray(BANCO) && BANCO.length >= 20, 'o banco precisa de vídeos (' + BANCO.length + ')');
  const RAMOS = require('../js/paletas.js').RAMOS.map((r) => r.id).concat('geral');
  const ids = new Set();
  for (const v of BANCO) {
    const onde = v.id || JSON.stringify(v).slice(0, 60);
    assert.match(String(v.id), /^[a-z0-9-]{3,60}$/, onde + ': id');
    assert.ok(!ids.has(v.id), onde + ': id repetido'); ids.add(v.id);
    assert.match(String(v.arquivo), /^\/pecas-ouro\/videos\/[a-z0-9-]+\/[a-z0-9-]+\.mp4$/, onde + ': arquivo');
    assert.ok(P.ehVideo(v.arquivo), onde + ': a TV não aceitaria este vídeo');
    assert.equal(v.poster, v.arquivo.replace(/\.mp4$/, '.jpg'), onde + ': o poster mora ao lado do vídeo');
    assert.equal(P.posterDoVideo(v.arquivo), v.poster);
    assert.ok(Array.isArray(v.ramos) && v.ramos.length && v.ramos.every((r) => RAMOS.includes(r)), onde + ': ramos (' + v.ramos + ')');
    assert.ok(P.PAPEIS_FOTO.includes(v.papel), onde + ': papel');
    assert.deepEqual(P.lerFoco(v.foco), v.foco, onde + ': foco');
    assert.ok(v.duracao >= 5 && v.duracao <= 10, onde + ': duração ' + v.duracao + ' s (de 5 a 10)');
    for (const k of ['descricao', 'credito', 'licenca', 'fonte']) assert.ok(typeof v[k] === 'string' && v[k].trim(), onde + ': falta ' + k);
    assert.match(v.licenca, /^(Pexels License|Pixabay Content License|CC0 1\.0)$/, onde + ': licença que permite uso comercial');
    assert.match(v.fonte, /^https:\/\/(www\.pexels\.com|pixabay\.com|commons\.wikimedia\.org)\//, onde + ': fonte');
  }
});

test('os arquivos do banco: H.264 até 1080p, sem som, curtos e leves; o poster é JPEG', () => {
  let total = 0;
  for (const v of BANCO) {
    const arq = path.join(RAIZ, v.arquivo);
    assert.ok(fs.existsSync(arq), v.id + ': o vídeo não existe');
    const buf = fs.readFileSync(arq);
    total += buf.length;
    const m = FV.lerMp4(buf);
    assert.equal(m.codec, 'h264', v.id + ': codec ' + m.codec);
    assert.equal(m.audio, false, v.id + ': o vídeo tem som');
    assert.ok(Math.max(m.largura, m.altura) <= 1920 && Math.min(m.largura, m.altura) <= 1080, v.id + ': ' + m.largura + '×' + m.altura);
    assert.ok(Math.abs(m.duracao - v.duracao) < 0.3, v.id + ': o banco diz ' + v.duracao + ' s e o arquivo tem ' + m.duracao);
    assert.ok(buf.length <= 4.5 * 1024 * 1024, v.id + ': ' + (buf.length / 1048576).toFixed(1) + ' MB (o teto é 4,5)');
    // faststart: a caixa moov antes dos quadros (a TV começa a tocar antes de baixar tudo).
    assert.ok(buf.indexOf('moov') < buf.indexOf('mdat'), v.id + ': sem faststart');
    const poster = fs.readFileSync(path.join(RAIZ, v.poster));
    total += poster.length;
    assert.ok(poster[0] === 0xff && poster[1] === 0xd8, v.id + ': o poster não é JPEG');
    assert.ok(poster.length <= 400 * 1024, v.id + ': poster de ' + Math.round(poster.length / 1024) + ' KB');
  }
  assert.ok(total <= 150 * 1024 * 1024, 'o banco tem ' + Math.round(total / 1048576) + ' MB (o teto é 150)');
  // Nenhum arquivo solto na pasta: o que está lá está no banco (e nos créditos).
  const doBanco = new Set(BANCO.flatMap((v) => [v.arquivo, v.poster]));
  for (const pasta of fs.readdirSync(path.join(RAIZ, 'pecas-ouro', 'videos'), { withFileTypes: true }).filter((d) => d.isDirectory())) {
    for (const f of fs.readdirSync(path.join(RAIZ, 'pecas-ouro', 'videos', pasta.name))) {
      assert.ok(doBanco.has('/pecas-ouro/videos/' + pasta.name + '/' + f), pasta.name + '/' + f + ' não está no banco.json');
    }
  }
});

test('os créditos: todo vídeo do banco em CREDITOS.md, com autor, licença e fonte', () => {
  const cred = ler('pecas-ouro', 'videos', 'CREDITOS.md');
  for (const v of BANCO) {
    const linha = cred.split('\n').find((l) => l.includes('`' + v.arquivo.replace('/pecas-ouro/videos/', '') + '`'));
    assert.ok(linha, v.id + ': sem crédito em CREDITOS.md');
    assert.ok(linha.includes(v.licenca), v.id + ': a licença não está na linha do crédito');
    assert.ok(linha.includes(v.fonte), v.id + ': a fonte não está na linha do crédito');
  }
  // O painel lê o banco, e o service worker não guarda o índice.
  assert.match(ler('web/src/lib/fotoViva.js'), /fetch\('\/pecas-ouro\/videos\/banco\.json'/);
});

/* ---------------- A entrada do vídeo do cliente ---------------- */

// Uma caixa MP4: tamanho (4 bytes) + tipo (4) + conteúdo.
function caixa(tipo, ...conteudo) {
  const corpo = Buffer.concat(conteudo.map((c) => (Buffer.isBuffer(c) ? c : Buffer.from(c, 'latin1'))));
  const cab = Buffer.alloc(8);
  cab.writeUInt32BE(8 + corpo.length);
  cab.write(tipo, 4, 'latin1');
  return Buffer.concat([cab, corpo]);
}
const u32 = (n) => { const b = Buffer.alloc(4); b.writeUInt32BE(n); return b; };
// Um MP4 só de caixas (sem quadros): o bastante para medir duração, tamanho e codec.
function mp4({ segundos = 8, largura = 1920, altura = 1080, codec = 'avc1', som = false, sobra = 0 } = {}) {
  const mvhd = caixa('mvhd', u32(0), u32(0), u32(0), u32(1000), u32(Math.round(segundos * 1000)), Buffer.alloc(80));
  const trak = (tipo, entrada, w, h) => caixa('trak',
    caixa('tkhd', u32(0), Buffer.alloc(72), u32(w * 65536), u32(h * 65536)),
    caixa('mdia', caixa('hdlr', u32(0), u32(0), tipo), caixa('minf', caixa('stbl', caixa('stsd', u32(0), u32(1), caixa(entrada, Buffer.alloc(8)))))));
  return Buffer.concat([
    caixa('ftyp', 'isom', u32(512), 'isomavc1mp41'),
    caixa('moov', mvhd, trak('vide', codec, largura, altura), ...(som ? [trak('soun', 'mp4a', 0, 0)] : [])),
    caixa('mdat', Buffer.alloc(sobra)),
  ]);
}

test('lerMp4: a duração, o tamanho, o codec e o som saem das caixas do arquivo', () => {
  assert.deepEqual(FV.lerMp4(mp4()), { mp4: true, duracao: 8, largura: 1920, altura: 1080, codec: 'h264', audio: false });
  assert.equal(FV.lerMp4(mp4({ codec: 'hvc1' })).codec, 'hevc');
  assert.equal(FV.lerMp4(mp4({ som: true })).audio, true);
  assert.equal(FV.lerMp4(mp4({ segundos: 21.5 })).duracao, 21.5);
  assert.equal(FV.lerMp4(Buffer.from('não é vídeo')).mp4, false);
  // "mvhd" no meio dos quadros não engana: quem manda é a estrutura.
  const enganoso = Buffer.concat([caixa('ftyp', 'isom'), caixa('mdat', 'xxxxmvhd\0\0\0\0\0\0\0\0\0\0\0\0\0\0\x03\xe8\0\0\xff\xff'), caixa('moov', caixa('mvhd', u32(0), u32(0), u32(0), u32(1000), u32(6000), Buffer.alloc(80)))]);
  assert.equal(FV.lerMp4(enganoso).duracao, 6);
});

test('as regras: até 15 s e 30 MB; sem ffmpeg, só o que já está pronto para o box (H.264, Full HD, 10 Mbps)', () => {
  const MB = 1024 * 1024;
  assert.match(FV.problema({ duracao: 8 }, 31 * MB, true), /31 MB\. Use um de até 30 MB/);
  assert.match(FV.problema({ duracao: 16.4 }, MB, true), /16 segundos\. Na foto viva vale até 15 segundos/);
  assert.equal(FV.problema({ duracao: 15.3 }, MB, true), '', 'a folga do celular');
  assert.match(FV.problema({ duracao: 0 }, MB, true), /Não deu para ler/);
  // Com ffmpeg (refazer), HEVC e 4K entram: o servidor refaz.
  assert.equal(FV.problema({ duracao: 8, codec: 'hevc', largura: 3840, altura: 2160 }, 20 * MB, true), '');
  // Sem ffmpeg, não.
  assert.match(FV.problema({ duracao: 8, codec: 'hevc', largura: 1920, altura: 1080 }, 5 * MB, false), /H\.265 \(HEVC\).*"Mais compatível"/);
  assert.match(FV.problema({ duracao: 8, codec: 'h264', largura: 3840, altura: 2160 }, 5 * MB, false), /pesado para a TV: é maior que Full HD/);
  assert.match(FV.problema({ duracao: 8, codec: 'h264', largura: 1920, altura: 1080 }, 25 * MB, false), /pesado para a TV: é pesado demais por segundo \(26 Mbps\)/);
  assert.equal(FV.problema({ duracao: 8, codec: 'h264', largura: 1920, altura: 1080 }, 6 * MB, false), '');
});

async function comSemFfmpeg(fn) {
  const antes = process.env.FOTO_VIVA_SEM_FFMPEG;
  process.env.FOTO_VIVA_SEM_FFMPEG = '1';
  try { return await fn(); } finally { if (antes == null) delete process.env.FOTO_VIVA_SEM_FFMPEG; else process.env.FOTO_VIVA_SEM_FFMPEG = antes; }
}
const recusa = (status, re) => (e) => { assert.equal(e.status, status, e.message); assert.match(e.message, re); return true; };

test('sem ffmpeg (o deploy de hoje): MP4 H.264 curto passa como está, sem poster; o resto volta com o motivo', async () => {
  await comSemFfmpeg(async () => {
    assert.deepEqual(FV.ferramentas(), { ffmpeg: false, ffprobe: false });
    const ok = await FV.preparar(mp4({ segundos: 8, sobra: 2 * 1024 * 1024 }), 'video/mp4');
    assert.equal(ok.refeito, false);
    assert.equal(ok.poster, null, 'o poster vem do painel (canvas)');
    assert.deepEqual([ok.info.duracao, ok.info.codec, ok.info.largura], [8, 'h264', 1920]);
    await assert.rejects(FV.preparar(mp4(), 'video/webm'), recusa(415, /MP4 \(H\.264\)/));
    await assert.rejects(FV.preparar(mp4(), 'video/quicktime'), recusa(415, /MP4/));
    await assert.rejects(FV.preparar(mp4({ codec: 'hvc1' }), 'video/mp4'), recusa(400, /HEVC/));
    await assert.rejects(FV.preparar(mp4({ segundos: 40 }), 'video/mp4'), recusa(400, /40 segundos/));
    await assert.rejects(FV.preparar(Buffer.from('só texto'), 'video/mp4'), recusa(400, /Não deu para ler/));
  });
});

const temFfmpeg = FV.ferramentas().ffmpeg && FV.ferramentas().ffprobe;

test('com ffmpeg: o vídeo é refeito para a TV (H.264, sem som, faststart) e o primeiro quadro vira o poster', { skip: !temFfmpeg && 'sem ffmpeg nesta máquina' }, async () => {
  const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'mt-fv-'));
  try {
    const entrada = path.join(pasta, 'celular.mp4');
    // Um "vídeo de celular": 60 quadros por segundo, com som, MP4 sem faststart.
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc=size=640x360:rate=60:duration=2', '-f', 'lavfi', '-i', 'sine=duration=2',
      '-c:v', 'libx264', '-preset', 'ultrafast', '-c:a', 'aac', '-shortest', entrada]);
    const r = await FV.preparar(fs.readFileSync(entrada), 'video/mp4');
    assert.equal(r.refeito, true);
    assert.ok(r.poster && r.poster[0] === 0xff && r.poster[1] === 0xd8, 'o poster é JPEG');
    const m = FV.lerMp4(r.video);
    assert.deepEqual([m.codec, m.audio, m.largura, m.altura], ['h264', false, 640, 360]);
    assert.ok(Math.abs(m.duracao - 2) < 0.2, 'duração ' + m.duracao);
    assert.ok(r.video.indexOf('moov') < r.video.indexOf('mdat'), 'faststart');
    // Longo demais: recusado antes de gastar CPU.
    const longo = path.join(pasta, 'longo.mp4');
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc=size=160x90:rate=5:duration=20', '-c:v', 'libx264', '-preset', 'ultrafast', longo]);
    await assert.rejects(FV.preparar(fs.readFileSync(longo), 'video/mp4'), recusa(400, /20 segundos/));
    // Formato que não é vídeo de celular: recusado.
    await assert.rejects(FV.preparar(Buffer.from('x'), 'image/png'), recusa(415, /MP4, MOV ou WEBM/));
  } finally { fs.rmSync(pasta, { recursive: true, force: true }); }
});

/* ---------------- As rotas (POST /api/media?fotoViva=1 e ?posterDe=) ---------------- */

function bancoFalso() {
  const linhas = [];
  return {
    linhas,
    createMedia: async (m) => { linhas.push({ id: m.id, tenant_id: m.tenantId, name: m.name, mime: m.mime, key: m.key, url: m.url, origem: m.origem }); return m; },
    getMedia: async (id) => linhas.find((l) => l.id === id) || null,
    listMedia: async (t) => linhas.filter((l) => l.tenant_id === t),
    removeMedia: async (id) => { const i = linhas.findIndex((l) => l.id === id); if (i >= 0) linhas.splice(i, 1); },
  };
}
const corpo = (buf) => Readable.from([buf]);
// O menor JPEG que o conferente aceita (começa com FF D8 FF).
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(200), Buffer.from([0xff, 0xd9])]);

test('a rota: o vídeo sobe, o poster do painel mora ao lado dele, e apagar o vídeo leva o poster junto', async () => {
  const db = bancoFalso();
  const up = await comSemFfmpeg(() => FV.subirVideo({ db, midia, tenantId: 't1', req: corpo(mp4({ sobra: 1024 })), mime: 'video/mp4', nome: 'café.mp4' }));
  assert.match(up.url, /^\/media\/t1\/[a-z0-9]{20}\.mp4$/);
  assert.equal(up.poster, null, 'sem ffmpeg, o painel manda o poster');
  assert.equal(up.refeito, false);
  // O poster do painel: só JPEG, só do vídeo da própria conta, uma vez só.
  await assert.rejects(FV.subirPoster({ db, midia, tenantId: 't1', req: corpo(Buffer.from('<svg/>')), videoId: up.id }), recusa(400, /JPEG/));
  await assert.rejects(FV.subirPoster({ db, midia, tenantId: 't2', req: corpo(JPEG), videoId: up.id }), recusa(404, /vídeo não encontrado/));
  const p = await FV.subirPoster({ db, midia, tenantId: 't1', req: corpo(JPEG), videoId: up.id });
  assert.equal(p.url, up.url.replace(/\.mp4$/, '.jpg'), 'o poster mora ao lado do vídeo, com o mesmo nome');
  assert.equal(P.posterDoVideo(up.url), p.url);
  assert.ok(fs.existsSync(path.join(process.env.MEDIA_DIR, 'media', p.url.replace('/media/', ''))));
  const de_novo = await FV.subirPoster({ db, midia, tenantId: 't1', req: corpo(JPEG), videoId: up.id });
  assert.equal(de_novo.url, p.url);
  assert.equal(db.linhas.filter((l) => l.origem === 'poster').length, 1);
  // Grande demais: recusado no corpo, antes de gravar.
  await assert.rejects(FV.subirVideo({ db, midia, tenantId: 't1', req: corpo(Buffer.alloc(31 * 1024 * 1024)), mime: 'video/mp4', nome: 'x' }), recusa(413, /30 MB/));
  // Apagar o vídeo apaga o poster (ele só existe por causa do vídeo).
  assert.equal(await midia.apagar(db, 't1', up.id), true);
  assert.equal(db.linhas.length, 0);
  // A rota de mídia chama as duas.
  const s = ler('server.js');
  assert.match(s, /const ehFotoViva = query\.fotoViva === '1';/);
  assert.match(s, /fotoViva\.subirVideo\(\{ db, midia, tenantId: sess\.tenant_id, req, mime, nome \}\)/);
  assert.match(s, /fotoViva\.subirPoster\(\{ db, midia, tenantId: sess\.tenant_id, req, videoId: query\.posterDe \}\)/);
});

test('o painel: o "Trocar foto" aceita vídeo do celular e tem o filtro "Vídeos" no banco, com um violeta só', () => {
  const t = ler('web/src/components/fotos/TrocarFoto.jsx');
  assert.match(t, /\[\['fotos', 'Fotos', Images\], \['videos', 'Vídeos', Video\]\]/);
  assert.match(t, /await subirFotoViva\(f, lido, setProgresso\)/);
  assert.match(t, /accept=\{ACEITA_VIDEO\} capture="environment"/);
  assert.equal((t.match(/variant="primary"/g) || []).length, 1, 'um violeta por tela');
  const l = ler('web/src/lib/fotoViva.js');
  assert.match(l, /export const LIMITES_FOTO_VIVA = \{ segundos: 15, mb: 30 \};/);
  assert.match(l, /'\/api\/media\?posterDe=' \+ encodeURIComponent\(up\.id\)/);
  assert.equal(FV.LIMITES.segundos, 15);
  assert.equal(FV.LIMITES.mb, 30);
});
