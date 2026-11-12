/*
 * server/foto-viva.js — o vídeo curto que entra num espaço de foto.
 *
 * FOTO VIVA: todo espaço de foto de uma peça aceita, além da foto, um laço
 * curto e mudo (o café fumegando, o pão saindo do forno). O formato do valor
 * mora em js/peca-html.js (ehVideo); quem desenha é js/peca-render.js. Aqui
 * é a porta de ENTRADA do vídeo do cliente (POST /api/media?fotoViva=1):
 *
 *   - até 15 s e até 30 MB (o painel confere antes de subir; aqui de novo);
 *   - COM ffmpeg na máquina (/usr/bin/ffmpeg, ou FFMPEG_PATH): o vídeo é
 *     refeito para a TV — H.264 high, até 1080p, até 30 quadros, sem som,
 *     "faststart", CRF 26 com teto de 6 Mbps — e o primeiro quadro vira o
 *     POSTER (JPEG). Entra MP4, WEBM ou MOV (o do iPhone, mesmo em HEVC);
 *   - SEM ffmpeg (o deploy de hoje: Nixpacks sem pacote de sistema; pôr o
 *     ffmpeg é decisão de infra, docs/CONSULTOR.md): só entra o que já está
 *     pronto para o box — MP4 em H.264, até Full HD e até 10 Mbps (a régua
 *     de js/video.js). Medido pelo ffprobe se houver; senão, pelos bytes do
 *     próprio MP4 (lerMp4, abaixo). O poster vem do PAINEL, um quadro tirado
 *     no <canvas> (POST /api/media?posterDe=<id do vídeo>).
 *
 * O poster mora AO LADO do vídeo, com o mesmo nome: `<conta>/<id>.mp4` e
 * `<conta>/<id>.jpg`. É assim que a TV o acha sem perguntar a ninguém.
 *
 * Um ffmpeg por vez (fila): o servidor também serve as TVs, e dois vídeos
 * sendo refeitos ao mesmo tempo disputariam a CPU com elas.
 */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { execFile } = require('child_process');
const MTVideo = require('../js/video.js');

const LIMITES = { segundos: 15, mb: 30, ladoMaior: 1920, fps: 30, crf: 26, maxrate: '6M' };
// Folga na duração: o "15 s" do celular às vezes é 15,03 s no arquivo.
const FOLGA_S = 0.6;
const ENTRADA_COM_FFMPEG = ['video/mp4', 'video/webm', 'video/quicktime'];

const FFMPEG = process.env.FFMPEG_PATH || '/usr/bin/ffmpeg';
const FFPROBE = process.env.FFPROBE_PATH || path.join(path.dirname(FFMPEG), 'ffprobe');

function existe(arquivo) {
  try { fs.accessSync(arquivo, fs.constants.X_OK); return true; } catch (e) { return false; }
}
// O que esta máquina tem. FOTO_VIVA_SEM_FFMPEG=1 finge que não tem (teste e conferência do caminho de produção).
function ferramentas() {
  const sem = process.env.FOTO_VIVA_SEM_FFMPEG === '1';
  return { ffmpeg: !sem && existe(FFMPEG), ffprobe: !sem && existe(FFPROBE) };
}

function erro(status, mensagem) { const e = new Error(mensagem); e.status = status; return e; }

function rodar(bin, args, ms) {
  return new Promise((ok, falha) => {
    execFile(bin, args, { timeout: ms || 120000, maxBuffer: 4 * 1024 * 1024 }, (e, saida, err) => {
      if (e) { e.stderr = String(err || '').slice(-600); return falha(e); }
      ok(String(saida || ''));
    });
  });
}

// Um ffmpeg por vez.
let fila = Promise.resolve();
function naFila(tarefa) {
  const vez = fila.then(tarefa, tarefa);
  fila = vez.catch(() => {});
  return vez;
}

/* ---------------- Medir sem ffprobe: as caixas do MP4 ---------------- */

/*
 * Lê o MP4 pelas caixas (ISO BMFF): `moov` → `mvhd` (duração) e, em cada
 * `trak`, `tkhd` (largura × altura) e `stsd` (o codec). Caminha pela
 * estrutura em vez de procurar texto: "mvhd" pode aparecer por acaso no
 * meio dos quadros (mdat), e o MP4 sem faststart tem o moov no FIM.
 * Devolve { mp4, duracao, largura, altura, codec, audio } — o que não achou fica 0/''.
 */
function lerMp4(buf) {
  const r = { mp4: false, duracao: 0, largura: 0, altura: 0, codec: '', audio: false };
  const b = Buffer.isBuffer(buf) ? buf : Buffer.from(buf || []);
  const caixas = (de, ate) => {
    const lista = [];
    let i = de;
    while (i + 8 <= ate) {
      let tam = b.readUInt32BE(i);
      const tipo = b.toString('latin1', i + 4, i + 8);
      let cab = 8;
      if (tam === 1) {
        if (i + 16 > ate) break;
        tam = Number(b.readBigUInt64BE(i + 8)); cab = 16;
      } else if (tam === 0) tam = ate - i;
      if (tam < cab || i + tam > ate) break;
      lista.push({ tipo, de: i + cab, ate: i + tam });
      i += tam;
    }
    return lista;
  };
  const filho = (c, tipo) => caixas(c.de, c.ate).find((x) => x.tipo === tipo);
  const topo = caixas(0, b.length);
  if (!topo.length || topo[0].tipo !== 'ftyp') return r;
  r.mp4 = true;
  const moov = topo.find((c) => c.tipo === 'moov');
  if (!moov) return r;
  const mvhd = filho(moov, 'mvhd');
  if (mvhd && mvhd.ate - mvhd.de >= 20) {
    const v = b[mvhd.de];
    const escala = v === 1 ? b.readUInt32BE(mvhd.de + 20) : b.readUInt32BE(mvhd.de + 12);
    const dur = v === 1 ? Number(b.readBigUInt64BE(mvhd.de + 24)) : b.readUInt32BE(mvhd.de + 16);
    if (escala > 0) r.duracao = Math.round((dur / escala) * 1000) / 1000;
  }
  const traks = caixas(moov.de, moov.ate).filter((c) => c.tipo === 'trak');
  const tipoDa = (trak) => {
    const mdia = filho(trak, 'mdia');
    const hdlr = mdia && filho(mdia, 'hdlr');
    return hdlr ? b.toString('latin1', hdlr.de + 8, hdlr.de + 12) : '';
  };
  r.audio = traks.some((t) => tipoDa(t) === 'soun');
  traks.some((trak) => {
    if (tipoDa(trak) !== 'vide') return false;
    const mdia = filho(trak, 'mdia');
    const tkhd = filho(trak, 'tkhd');
    if (tkhd) {
      // largura e altura são as duas últimas palavras do tkhd, em ponto fixo 16.16.
      r.largura = Math.round(b.readUInt32BE(tkhd.ate - 8) / 65536);
      r.altura = Math.round(b.readUInt32BE(tkhd.ate - 4) / 65536);
    }
    const minf = filho(mdia, 'minf');
    const stbl = minf && filho(minf, 'stbl');
    const stsd = stbl && filho(stbl, 'stsd');
    if (stsd && stsd.ate - stsd.de >= 16) {
      const etiqueta = b.toString('latin1', stsd.de + 12, stsd.de + 16);
      r.codec = MTVideo.codecNosBytes([Uint8Array.from(Buffer.from(etiqueta, 'latin1'))]) || etiqueta.trim();
    }
    return true;
  });
  return r;
}

/* ---------------- Medir com ffprobe ---------------- */

async function sondar(arquivo) {
  const saida = await rodar(FFPROBE, ['-v', 'error', '-print_format', 'json', '-show_streams', '-show_format', arquivo], 30000);
  const j = JSON.parse(saida);
  const v = (j.streams || []).find((s) => s.codec_type === 'video');
  if (!v) return { duracao: 0, largura: 0, altura: 0, codec: '', fps: 0, video: false };
  const [n, d] = String(v.avg_frame_rate || v.r_frame_rate || '0/1').split('/').map(Number);
  const nome = String(v.codec_name || '');
  return {
    video: true,
    duracao: Number((j.format && j.format.duration) || v.duration) || 0,
    largura: Number(v.width) || 0,
    altura: Number(v.height) || 0,
    codec: nome === 'h264' ? 'h264' : nome === 'hevc' ? 'hevc' : nome,
    fps: d ? n / d : 0,
  };
}

/* ---------------- As regras ---------------- */

/*
 * O que impede o vídeo de entrar, em português de lojista, ou ''.
 * `refazer`: o servidor vai refazer o vídeo (com ffmpeg) — aí só a duração
 * e o tamanho contam; sem refazer, o vídeo precisa já estar pronto para o box.
 */
function problema(info, bytes, refazer) {
  const x = info || {};
  if (bytes > LIMITES.mb * 1024 * 1024) return 'O vídeo tem ' + Math.round(bytes / 1024 / 1024) + ' MB. Use um de até ' + LIMITES.mb + ' MB.';
  if (!(x.duracao > 0)) return 'Não deu para ler este vídeo. Tente outro arquivo (MP4).';
  if (x.duracao > LIMITES.segundos + FOLGA_S) return 'O vídeo tem ' + Math.round(x.duracao) + ' segundos. Na foto viva vale até ' + LIMITES.segundos + ' segundos: corte no celular e envie de novo.';
  if (refazer) return '';
  if (x.codec !== 'h264') {
    const nome = x.codec === 'hevc' ? 'H.265 (HEVC)' : x.codec === 'av1' ? 'AV1' : x.codec ? x.codec.toUpperCase() : 'um formato que a TV não toca';
    return 'O vídeo está em ' + nome + '. Envie em MP4 (H.264): no celular, a opção "Mais compatível" da câmera resolve.';
  }
  const av = MTVideo.avaliar({ bytes, largura: x.largura, altura: x.altura, duracao: x.duracao, codec: x.codec });
  if (av.pesado) return 'Este vídeo é pesado para a TV: ' + av.motivos.join(', ') + '. Grave em 1080p ou menor, ou envie um trecho mais curto.';
  return '';
}

/* ---------------- Refazer e tirar o poster ---------------- */

// O lado maior até 1920 (a TV em pé também), lados pares, até 30 quadros por segundo.
function argsDoVideo(entrada, saida, fps) {
  const escala = "scale='if(gte(iw,ih),min(" + LIMITES.ladoMaior + ",iw),-2)':'if(gte(iw,ih),-2,min(" + LIMITES.ladoMaior + ",ih))'";
  return ['-y', '-v', 'error', '-i', entrada, '-t', String(LIMITES.segundos), '-map', '0:v:0', '-an', '-sn', '-dn',
    '-vf', escala + (fps > LIMITES.fps + 0.5 ? ',fps=' + LIMITES.fps : '') + ',format=yuv420p',
    '-c:v', 'libx264', '-profile:v', 'high', '-level', '4.1', '-preset', 'veryfast', '-crf', String(LIMITES.crf),
    '-maxrate', LIMITES.maxrate, '-bufsize', '12M', '-movflags', '+faststart', saida];
}
function argsDoPoster(entrada, saida) {
  return ['-y', '-v', 'error', '-i', entrada, '-frames:v', '1', '-q:v', '3', saida];
}

/*
 * A entrada inteira: bytes + tipo → { video, mime, poster, info, refeito }.
 * `poster` é null quando não há ffmpeg (o painel manda o dele).
 * Lança erro com `status` (400, 413, 415) e a mensagem para a pessoa.
 */
async function preparar(buf, mime) {
  const tipo = String(mime || '').toLowerCase().split(';')[0].trim();
  const bytes = buf.length;
  const f = ferramentas();
  if (bytes > LIMITES.mb * 1024 * 1024) throw erro(413, problema({}, bytes, false));

  if (!f.ffmpeg) {
    if (tipo !== 'video/mp4') throw erro(415, 'Envie o vídeo em MP4 (H.264). No celular, a opção "Mais compatível" da câmera grava assim.');
    let info = lerMp4(buf);
    if (f.ffprobe) info = await comArquivo(buf, '.mp4', (arq) => sondar(arq)).catch(() => info);
    const p = problema(info, bytes, false);
    if (p) throw erro(400, p);
    return { video: buf, mime: 'video/mp4', poster: null, info: resumo(info, bytes), refeito: false };
  }

  if (ENTRADA_COM_FFMPEG.indexOf(tipo) < 0) throw erro(415, 'Envie um vídeo em MP4, MOV ou WEBM.');
  return naFila(() => comArquivo(buf, tipo === 'video/webm' ? '.webm' : tipo === 'video/quicktime' ? '.mov' : '.mp4', async (entrada) => {
    let info;
    try { info = await sondar(entrada); } catch (e) { throw erro(400, 'Não deu para ler este vídeo. Tente outro arquivo.'); }
    if (!info.video) throw erro(400, 'Este arquivo não tem imagem de vídeo.');
    const p = problema(info, bytes, true);
    if (p) throw erro(400, p);
    const pasta = path.dirname(entrada);
    const saida = path.join(pasta, 'saida.mp4');
    const poster = path.join(pasta, 'poster.jpg');
    try {
      await rodar(FFMPEG, argsDoVideo(entrada, saida, info.fps), 180000);
      await rodar(FFMPEG, argsDoPoster(saida, poster), 30000);
    } catch (e) {
      console.warn('[foto-viva] ffmpeg:', e.message, e.stderr || '');
      throw erro(400, 'Não deu para preparar este vídeo para a TV. Tente outro arquivo (MP4).');
    }
    const video = await fs.promises.readFile(saida);
    const final = lerMp4(video);
    return {
      video, mime: 'video/mp4', poster: await fs.promises.readFile(poster), refeito: true,
      info: resumo({ duracao: final.duracao || info.duracao, largura: final.largura, altura: final.altura, codec: 'h264' }, video.length),
    };
  }));
}

function resumo(info, bytes) {
  return { duracao: Math.round((info.duracao || 0) * 10) / 10, largura: info.largura || 0, altura: info.altura || 0, codec: info.codec || '', bytes };
}

// Grava os bytes numa pasta temporária só deste pedido, roda a tarefa e apaga tudo.
async function comArquivo(buf, ext, tarefa) {
  const pasta = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'mt-viva-' + crypto.randomBytes(4).toString('hex') + '-'));
  const arquivo = path.join(pasta, 'entrada' + ext);
  try {
    await fs.promises.writeFile(arquivo, buf);
    return await tarefa(arquivo);
  } finally {
    fs.promises.rm(pasta, { recursive: true, force: true }).catch(() => {});
  }
}

/*
 * O POSTER do painel (sem ffmpeg): um JPEG pequeno, e só JPEG — é o que a TV
 * procura ao lado do vídeo. Devolve a mensagem do problema, ou ''.
 */
const POSTER_MAX = 1024 * 1024;
function problemaNoPoster(buf) {
  if (!buf || buf.length < 4) return 'O quadro do vídeo veio vazio.';
  if (buf.length > POSTER_MAX) return 'O quadro do vídeo passou de 1 MB.';
  if (!(buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff)) return 'O quadro do vídeo precisa ser JPEG.';
  return '';
}

/* ---------------- As duas rotas (POST /api/media, ver server.js) ---------------- */

// O corpo inteiro em memória, com teto (até 30 MB: cabe, e o ffmpeg precisa do arquivo inteiro).
function lerCorpo(req, max) {
  return new Promise((ok, falha) => {
    const partes = [];
    let tam = 0, parou = false;
    req.on('data', (c) => {
      if (parou) return;
      tam += c.length;
      if (tam > max) { parou = true; falha(erro(413, 'O arquivo passou de ' + Math.round(max / 1024 / 1024) + ' MB.')); req.resume(); return; }
      partes.push(c);
    });
    req.on('end', () => { if (!parou) ok(Buffer.concat(partes)); });
    req.on('error', (e) => { if (!parou) { parou = true; falha(e); } });
  });
}

/*
 * ?fotoViva=1 — o vídeo do celular para um espaço de foto. Devolve a mídia
 * como o upload de sempre, mais `poster` (a URL do JPEG ao lado, ou null
 * quando o painel precisa mandar o dele), `refeito` e `info`.
 */
async function subirVideo({ db, midia, tenantId, req, mime, nome }) {
  const buf = await lerCorpo(req, LIMITES.mb * 1024 * 1024);
  const pronto = await preparar(buf, mime);
  const video = await midia.guardarBuffer(db, tenantId, pronto.video, pronto.mime, { nome, origem: 'upload' });
  let poster = null;
  if (pronto.poster) {
    poster = await midia.guardarBuffer(db, tenantId, pronto.poster, 'image/jpeg', { nome: 'Capa de ' + nome, origem: 'poster', base: video.id });
  }
  return { id: video.id, name: nome, mime: video.mime, size: video.size, url: video.url, poster: poster ? poster.url : null, refeito: pronto.refeito, info: pronto.info };
}

/*
 * ?posterDe=<id do vídeo> — o poster que o painel tirou no <canvas>, para o
 * vídeo que subiu sem ffmpeg. Grava ao lado do vídeo, uma vez só.
 */
async function subirPoster({ db, midia, tenantId, req, videoId }) {
  const v = await db.getMedia(String(videoId || ''));
  if (!v || v.tenant_id !== tenantId || !/^video\//.test(String(v.mime || ''))) throw erro(404, 'vídeo não encontrado');
  const buf = await lerCorpo(req, POSTER_MAX);
  const p = problemaNoPoster(buf);
  if (p) throw erro(400, p);
  const url = String(v.url || '').replace(/\.[a-z0-9]+$/i, '.jpg');
  const ja = (await db.listMedia(tenantId)).find((x) => x.url === url && x.origem === 'poster');
  if (ja) return { url: ja.url, id: ja.id };
  const base = path.basename(String(v.key || '')).replace(/\.[a-z0-9]+$/i, '');
  const salvo = await midia.guardarBuffer(db, tenantId, buf, 'image/jpeg', { nome: 'Capa de ' + String(v.name || 'vídeo').slice(0, 160), origem: 'poster', base });
  return { url: salvo.url, id: salvo.id };
}

module.exports = { LIMITES, ferramentas, lerMp4, problema, preparar, problemaNoPoster, argsDoVideo, POSTER_MAX, subirVideo, subirPoster };
