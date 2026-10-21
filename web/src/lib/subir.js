/*
 * Subir foto ou vídeo para a TV (docs/EXECUTOR.md, item 4).
 *
 * Tudo o que acontece no celular ANTES de o arquivo sair: encolher a foto
 * (uma foto de celular tem 4000 px e 6 MB; a TV desenha 1920 e o 4G sobe
 * devagar), tirar dela a miniatura borrada que vira o fundo na TV, e mandar
 * com barra de progresso — sem ela, 30 segundos de upload parecem travamento.
 */

// O maior lado de uma foto enviada. Cobre a TV 4K com folga e corta o
// arquivo de celular para algo que sobe em segundos.
const LADO_MAXIMO = 2560;
// A miniatura do fundo. Pequena de propósito: o navegador da TV a estica e
// ela sai borrada sem filtro nenhum (ver js/render.js, comFundo).
const LADO_FUNDO = 24;

export const ehVideo = (f) => /^video\//.test((f && f.type) || '');
export const ehImagem = (f) => /^image\//.test((f && f.type) || '');

function carregarImagem(src) {
  return new Promise((ok, falha) => {
    const img = new Image();
    img.onload = () => ok(img);
    img.onerror = () => falha(new Error('Não consegui abrir esta foto. Tente uma em JPG ou PNG.'));
    img.src = src;
  });
}

function desenhar(fonte, w, h, maior) {
  const k = Math.min(1, maior / Math.max(w, h));
  const cv = document.createElement('canvas');
  cv.width = Math.max(1, Math.round(w * k));
  cv.height = Math.max(1, Math.round(h * k));
  cv.getContext('2d').drawImage(fonte, 0, 0, cv.width, cv.height);
  return cv;
}

// A miniatura do fundo, embutida (data:): vai junto na config e a TV a tem
// mesmo sem internet. ~1 KB.
const fundoDe = (fonte, w, h) => desenhar(fonte, w, h, LADO_FUNDO).toDataURL('image/jpeg', 0.6);

/*
 * Prepara uma foto: devolve o arquivo a subir (encolhido se precisar), o
 * fundo borrado e as medidas. GIF vai como está — encolher mataria a
 * animação.
 */
export async function prepararFoto(arquivo) {
  const url = URL.createObjectURL(arquivo);
  try {
    const img = await carregarImagem(url);
    const w = img.naturalWidth, h = img.naturalHeight;
    const fundo = fundoDe(img, w, h);
    let envio = arquivo;
    if (arquivo.type !== 'image/gif' && (Math.max(w, h) > LADO_MAXIMO || arquivo.size > 3 * 1024 * 1024)) {
      const cv = desenhar(img, w, h, LADO_MAXIMO);
      const blob = await new Promise((ok) => cv.toBlob(ok, 'image/jpeg', 0.86));
      if (blob && blob.size < arquivo.size) {
        envio = new File([blob], (arquivo.name || 'foto').replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' });
      }
    }
    return { envio, fundo, largura: w, altura: h, previa: url };
  } catch (e) {
    URL.revokeObjectURL(url);
    throw e;
  }
}

/*
 * Prepara um vídeo: o primeiro quadro vira o fundo; medidas e duração vão
 * junto para o aviso de vídeo pesado demais para o box.
 */
export function prepararVideo(arquivo) {
  const url = URL.createObjectURL(arquivo);
  return new Promise((ok) => {
    const v = document.createElement('video');
    v.muted = true; v.playsInline = true; v.preload = 'metadata';
    let feito = false;
    const fim = (extra) => {
      if (feito) return; feito = true;
      ok(Object.assign({ envio: arquivo, fundo: '', largura: v.videoWidth || 0, altura: v.videoHeight || 0,
        duracao: v.duration || 0, previa: url }, extra || {}));
    };
    v.onloadeddata = () => { try { v.currentTime = Math.min(0.5, (v.duration || 1) / 2); } catch (e) { fim(); } };
    v.onseeked = () => {
      try { fim({ fundo: v.videoWidth ? fundoDe(v, v.videoWidth, v.videoHeight) : '' }); } catch (e) { fim(); }
    };
    v.onerror = () => fim();
    // Vídeo que o navegador não decodifica (HEVC num Android velho) não trava a tela.
    setTimeout(() => fim(), 6000);
    v.src = url;
  });
}

/*
 * Envia com progresso. O `fetch` não conta o envio; o XMLHttpRequest conta.
 * Mesmo endereço e mesmo corpo de `media.upload` (bytes crus + ?name&mime).
 */
export function enviarComProgresso(arquivo, onProgresso) {
  return new Promise((ok, falha) => {
    const x = new XMLHttpRequest();
    const qs = '?name=' + encodeURIComponent(arquivo.name || 'arquivo') + '&mime=' + encodeURIComponent(arquivo.type || '');
    x.open('POST', '/api/media' + qs);
    x.withCredentials = true;
    x.upload.onprogress = (e) => { if (e.lengthComputable && onProgresso) onProgresso(e.loaded / e.total); };
    x.onload = () => {
      let d = null; try { d = JSON.parse(x.responseText); } catch (e) { /* corpo vazio */ }
      if (x.status >= 200 && x.status < 300 && d && d.url) return ok(d);
      const e = new Error((d && d.error) || (x.status === 413 ? 'O armazenamento da conta está cheio.' : 'Não deu para enviar (' + x.status + ').'));
      e.status = x.status;
      falha(e);
    };
    x.onerror = () => falha(new Error('Sem conexão. Nada foi enviado — tente de novo quando a internet voltar.'));
    x.send(arquivo);
  });
}

/*
 * O item que vai para a tela. Sempre `contain` com o fundo: a foto aparece
 * inteira, sem corte, e o que sobra da tela é a própria foto borrada — nunca
 * faixa preta. TV com o player antigo no cache ignora `fundo` e mostra o
 * `contain` de sempre: nada quebra.
 */
export function itemDaMidia({ url, fundo, video }) {
  return video
    ? { type: 'video', src: url, fit: 'contain', fundo: fundo || '', loop: false, muted: true, duracao: 0 }
    : { type: 'image', src: url, fit: 'contain', fundo: fundo || '', duracao: 10 };
}

// Abrir o "Subir" de qualquer lugar do painel (Início, arrastar e soltar, e
// o compartilhar do celular, no item 5), com ou sem arquivos já escolhidos.
export const EVENTO_SUBIR = 'mt:subir';
export function abrirSubir(arquivos) {
  window.dispatchEvent(new CustomEvent(EVENTO_SUBIR, { detail: { arquivos: arquivos ? Array.from(arquivos) : [] } }));
}
