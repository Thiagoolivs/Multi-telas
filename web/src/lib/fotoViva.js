/*
 * FOTO VIVA no painel: o vídeo curto e mudo que entra num espaço de foto
 * (o café fumegando, o pão saindo do forno). Na TV, quem toca é
 * js/peca-render.js; o formato do valor está em js/peca-html.js (ehVideo):
 * o campo guarda o endereço do .mp4, e o POSTER (o primeiro quadro, JPEG)
 * mora ao lado, com o mesmo nome terminado em .jpg.
 *
 * Aqui, o que acontece no celular antes e durante o envio:
 *   - conferir pelo que o navegador lê do arquivo: até 15 s e até 30 MB;
 *   - tirar o primeiro quadro (o poster, caso o servidor não tenha ffmpeg
 *     para tirar o dele) e a miniatura borrada do fundo;
 *   - subir com barra de progresso (POST /api/media?fotoViva=1) e, se o
 *     servidor não fez o poster, mandar o daqui (?posterDe=<id>).
 * O servidor confere de novo e, com ffmpeg, refaz o vídeo para a TV
 * (server/foto-viva.js).
 */

export const LIMITES_FOTO_VIVA = { segundos: 15, mb: 30 };
// O que o seletor de arquivo do "Do celular" aceita.
export const ACEITA_VIDEO = 'video/mp4,video/quicktime,video/webm';

const VIDEO = /\.(mp4|webm)$/i;
export const ehVideoSrc = (src) => VIDEO.test(String(src || '').split('?')[0]);
// O poster ao lado do vídeo (o que o espaço guardou, se houver).
export function posterDe(src, esp) {
  if (!ehVideoSrc(src)) return '';
  const p = esp && typeof esp.poster === 'string' ? esp.poster : '';
  return p || String(src).replace(VIDEO, '.jpg');
}
// O que mostrar numa miniatura do campo: a foto, ou o poster do vídeo.
export const imagemDoCampo = (src, esp) => (ehVideoSrc(src) ? posterDe(src, esp) : src || '');

const LADO_POSTER = 1280;
const LADO_FUNDO = 24;

function quadro(video, maior) {
  const w = video.videoWidth, h = video.videoHeight;
  const k = Math.min(1, maior / Math.max(w, h));
  const cv = document.createElement('canvas');
  cv.width = Math.max(1, Math.round(w * k));
  cv.height = Math.max(1, Math.round(h * k));
  cv.getContext('2d').drawImage(video, 0, 0, cv.width, cv.height);
  return cv;
}

/*
 * Lê o vídeo no próprio celular: duração e medidas (metadados), o primeiro
 * quadro em JPEG (poster) e o fundo borrado. Vídeo que o navegador não abre
 * (HEVC num Android antigo) não trava: volta sem poster e sem duração, e o
 * servidor decide.
 */
export function lerVideo(arquivo) {
  const previa = URL.createObjectURL(arquivo);
  return new Promise((ok) => {
    const v = document.createElement('video');
    v.muted = true; v.playsInline = true; v.preload = 'auto';
    let feito = false;
    const fim = (extra) => {
      if (feito) return; feito = true;
      ok(Object.assign({ duracao: Number.isFinite(v.duration) ? v.duration : 0, largura: v.videoWidth || 0, altura: v.videoHeight || 0,
        poster: null, fundo: '', previa }, extra || {}));
    };
    v.onloadeddata = () => { try { v.pause(); v.currentTime = 0.04; } catch (e) { fim(); } };
    v.onseeked = () => {
      if (!v.videoWidth) { fim(); return; }
      try {
        const fundo = quadro(v, LADO_FUNDO).toDataURL('image/jpeg', 0.6);
        quadro(v, LADO_POSTER).toBlob((poster) => fim({ poster, fundo }), 'image/jpeg', 0.84);
      } catch (e) { fim(); }
    };
    v.onerror = () => fim();
    setTimeout(() => fim(), 8000);
    v.src = previa;
    // O Safari do iPhone só decodifica o primeiro quadro depois de um play (mudo e na página, ele deixa).
    const tocar = v.play && v.play();
    if (tocar && tocar.catch) tocar.catch(() => {});
  });
}

// O problema que impede o vídeo de subir, pelo que o navegador leu, ou ''.
export function problemaDoVideo(arquivo, lido) {
  const L = LIMITES_FOTO_VIVA;
  if (arquivo.size > L.mb * 1024 * 1024) return 'O vídeo tem ' + Math.round(arquivo.size / 1024 / 1024) + ' MB. Use um de até ' + L.mb + ' MB (corte no celular).';
  if (lido && lido.duracao > L.segundos + 0.6) return 'O vídeo tem ' + Math.round(lido.duracao) + ' segundos. Use um de até ' + L.segundos + ' segundos (corte no celular).';
  return '';
}

function enviar(caminho, corpo, onProgresso) {
  return new Promise((ok, falha) => {
    const x = new XMLHttpRequest();
    x.open('POST', caminho);
    x.withCredentials = true;
    if (onProgresso) x.upload.onprogress = (e) => { if (e.lengthComputable) onProgresso(e.loaded / e.total); };
    x.onload = () => {
      let d = null; try { d = JSON.parse(x.responseText); } catch (e) { /* corpo vazio */ }
      if (x.status >= 200 && x.status < 300 && d && d.url) return ok(d);
      const e = new Error((d && d.error) || (x.status === 413 ? 'O armazenamento da conta está cheio.' : 'Não deu para enviar o vídeo (' + x.status + ').'));
      e.status = x.status;
      falha(e);
    };
    x.onerror = () => falha(new Error('Sem conexão. Nada foi enviado — tente de novo quando a internet voltar.'));
    x.send(corpo);
  });
}

/*
 * Sobe o vídeo e garante o poster ao lado dele. Devolve { url, poster, refeito }.
 * `lido` é o que lerVideo devolveu (o poster de reserva vem dali).
 */
export async function subirFotoViva(arquivo, lido, onProgresso) {
  const qs = '?fotoViva=1&name=' + encodeURIComponent(arquivo.name || 'vídeo') + '&mime=' + encodeURIComponent(arquivo.type || 'video/mp4');
  const up = await enviar('/api/media' + qs, arquivo, onProgresso);
  let poster = up.poster || '';
  if (!poster && lido && lido.poster) {
    const r = await enviar('/api/media?posterDe=' + encodeURIComponent(up.id) + '&mime=image%2Fjpeg', lido.poster);
    poster = r.url;
  }
  return { url: up.url, poster: poster || posterDe(up.url), refeito: !!up.refeito };
}

let banco = null;
// O banco de vídeos curtos (pecas-ouro/videos/banco.json), uma vez por sessão. Sem rede: lista vazia.
export function carregarBancoDeVideos() {
  if (!banco) {
    banco = fetch('/pecas-ouro/videos/banco.json', { cache: 'no-cache' })
      .then((r) => (r.ok ? r.json() : []))
      .then((l) => (Array.isArray(l) ? l.filter((v) => v && v.id && v.arquivo) : []))
      .catch(() => { banco = null; return []; });
  }
  return banco;
}
