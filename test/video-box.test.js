/*
 * Vídeo pesado para o TV Box (docs/EXECUTOR.md, item 12).
 *
 * Converter para H.264 1080p no servidor precisa de ffmpeg, que é infra (a
 * pergunta está com o consultor, issue #135). Até lá, todo upload de vídeo
 * AVISA, com o motivo, quando o box pode engasgar — e não proíbe. A régua
 * mora em js/video.js; o codec sai dos bytes do arquivo, não do navegador.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const V = require('../js/video.js');

const RAIZ = path.join(__dirname, '..');
const ler = (...p) => fs.readFileSync(path.join(RAIZ, ...p), 'utf8');

// Uma caixa MP4: tamanho (4 bytes) + tipo (4) + conteúdo.
function caixa(tipo, conteudo) {
  const corpo = Buffer.isBuffer(conteudo) ? conteudo : Buffer.from(conteudo, 'latin1');
  const cab = Buffer.alloc(8);
  cab.writeUInt32BE(8 + corpo.length);
  cab.write(tipo, 4, 'latin1');
  return Buffer.concat([cab, corpo]);
}
const mp4 = (codec, marcas) => Uint8Array.from(Buffer.concat([
  caixa('ftyp', marcas || 'isom\0\0\x02\0isomiso2avc1mp41'),
  caixa('moov', Buffer.concat([caixa('trak', Buffer.concat([caixa('stsd', '\0\0\0\0\0\0\0\x01' + codec + '......')]))])),
]));

test('o codec sai da caixa do arquivo, e as marcas do ftyp não enganam', () => {
  assert.equal(V.codecNosBytes([mp4('avc1')]), 'h264');
  // HEVC com "avc1" na lista de marcas compatíveis do ftyp: continua HEVC.
  assert.equal(V.codecNosBytes([mp4('hvc1')]), 'hevc');
  assert.equal(V.codecNosBytes([mp4('hev1')]), 'hevc');
  assert.equal(V.codecNosBytes([mp4('av01')]), 'av1');
  // WebM: o CodecID é texto.
  assert.equal(V.codecNosBytes([Uint8Array.from(Buffer.from('\x1aE\xdf\xa3....B\x86\x81\x01....\x86\x85V_VP9', 'latin1'))]), 'vp9');
  // MP4 sem "faststart": a caixa moov está no FIM — quem lê passa as duas pontas.
  const inicio = Uint8Array.from(caixa('ftyp', 'qt  \0\0\0\0qt  '));
  const fim = Uint8Array.from(caixa('moov', caixa('stsd', 'xxxxhvc1')));
  assert.equal(V.codecNosBytes([inicio, fim]), 'hevc');
  assert.equal(V.codecNosBytes([Uint8Array.from(Buffer.from('nada aqui'))]), '');
});

test('a régua: HEVC/AV1, acima de Full HD, mais de 10 Mbps, mais de 150 MB', () => {
  const MB = 1024 * 1024;
  const ok = V.avaliar({ bytes: 20 * MB, largura: 1920, altura: 1080, duracao: 30, codec: 'h264' });
  assert.equal(ok.pesado, false);
  assert.equal(ok.aviso, '');

  const hevc = V.avaliar({ bytes: 20 * MB, largura: 1920, altura: 1080, duracao: 30, codec: 'hevc' });
  assert.equal(hevc.pesado, true);
  assert.match(hevc.aviso, /H\.265 \(HEVC\), que muitos TV Box não tocam/);
  assert.match(hevc.aviso, /"Mais compatível"/, 'o aviso diz o que fazer no celular');

  assert.match(V.avaliar({ bytes: 20 * MB, largura: 3840, altura: 2160, duracao: 30, codec: 'h264' }).aviso, /maior que Full HD \(3840×2160\)/);
  // Em pé também: o lado MAIOR é que conta.
  assert.match(V.avaliar({ bytes: 20 * MB, largura: 2160, altura: 3840, duracao: 30 }).aviso, /maior que Full HD/);
  const pesado = V.avaliar({ bytes: 120 * MB, largura: 1920, altura: 1080, duracao: 30, codec: 'h264' });
  assert.equal(pesado.mbps, 33.6);
  assert.match(pesado.aviso, /pesado demais por segundo \(34 Mbps\)/);
  assert.match(V.avaliar({ bytes: 400 * MB, largura: 1920, altura: 1080, duracao: 600, codec: 'h264' }).aviso, /tem 400 MB/);
  // O que não foi medido não acusa nada (vídeo que o navegador nem abriu).
  assert.equal(V.avaliar({ bytes: 5 * MB }).pesado, false);
});

test('o upload lê as duas pontas do arquivo e avisa (no navegador, sem subir nada)', async () => {
  const S = await import(pathToFileURL(path.join(RAIZ, 'web/src/lib/subir.js')).href);
  // 9 MB de "vídeo" com a caixa do codec só no fim: a leitura das pontas acha.
  const meio = Buffer.alloc(9 * 1024 * 1024, 0x20);
  const arq = new Blob([caixa('ftyp', 'isom\0\0\0\0isomavc1'), meio, caixa('moov', caixa('stsd', 'xxxxhvc1'))]);
  const av = await S.avaliarVideo(arq, { largura: 1920, altura: 1080, duracao: 60 });
  assert.equal(av.codec, 'hevc');
  assert.equal(av.pesado, true);
  const s = ler('web/src/lib/subir.js');
  assert.match(s, /arquivo\.slice\(0, PONTA\)\), await ler\(arquivo\.slice\(arquivo\.size - PONTA\)\)/);
});

test('todas as portas de upload de vídeo avisam', () => {
  assert.match(ler('web/src/components/content/SubirConteudo.jsx'), /const av = video \? await avaliarVideo\(f, prep\) : null;/);
  const campo = ler('web/src/components/content/MediaField.jsx');
  assert.match(campo, /if \(accept === 'video'\) \{\s+const av = await avaliarVideo\(file\)/);
  assert.match(campo, /\{aviso && <p className="text-xs text-warn">\{aviso\}<\/p>\}/);
  assert.match(ler('web/src/pages/StoragePage.jsx'), /if \(ehVideo\(f\)\) \{\s+const av = await avaliarVideo\(f\)/);
  // A régua antiga (só tamanho e largura, escrita na tela) saiu: é uma só.
  assert.doesNotMatch(ler('web/src/components/content/SubirConteudo.jsx'), /150 \* 1024 \* 1024/);
});
