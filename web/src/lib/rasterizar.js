/*
 * A peça em HTML vira imagem, no navegador (docs/EXECUTOR.md, item 6).
 *
 * Post do Instagram, Story e Status do WhatsApp são a MESMA peça da TV,
 * desenhada no tamanho do canal. Para não haver um segundo desenhista, a
 * peça é montada por js/peca-render.js (o mesmo da TV, da bancada e da
 * miniatura), fora da vista, e o que ele desenhou é fotografado assim:
 *
 *   1. o HTML e o CSS que o desenhista pôs na sombra são copiados para
 *      dentro de um SVG <foreignObject> — o navegador desenha HTML dentro
 *      de SVG com o próprio motor, container queries incluídas;
 *   2. as fontes da marca e as fotos entram EMBUTIDAS (data:): imagem SVG
 *      não busca nada fora, e o que não estiver dentro sai na fonte do
 *      sistema ou sem foto;
 *   3. o SVG é desenhado num canvas do tamanho do canal e vira PNG/JPEG.
 *
 * `:host` (a regra da sombra) vira a classe da raiz, porque dentro do SVG
 * não há sombra.
 */
import { carregarDesenhista, TAMANHO_REAL } from './pecaHtml.js';

const XHTML = 'http://www.w3.org/1999/xhtml';
const cacheDados = new Map();

// Endereço nosso → data:, uma vez por endereço.
async function comoDados(url) {
  if (/^data:/.test(url)) return url;
  if (!cacheDados.has(url)) {
    cacheDados.set(url, (async () => {
      const r = await fetch(url, { credentials: 'same-origin' });
      if (!r.ok) throw new Error('não baixou ' + url);
      const blob = await r.blob();
      return await new Promise((ok, falha) => {
        const leitor = new FileReader();
        leitor.onload = () => ok(leitor.result);
        leitor.onerror = () => falha(leitor.error);
        leitor.readAsDataURL(blob);
      });
    })().catch((e) => { cacheDados.delete(url); throw e; }));
  }
  return cacheDados.get(url);
}

// As famílias que a peça usa, lidas dos tokens ("'Oswald', sans-serif").
function familiasDe(tokens) {
  const nomes = new Set();
  for (const css of [tokens.fontes.titulo, tokens.fontes.texto]) {
    for (const parte of String(css || '').split(',')) {
      const n = parte.trim().replace(/^['"]|['"]$/g, '');
      if (n && !/^(sans-serif|serif|monospace|cursive|system-ui)$/i.test(n)) nomes.add(n.toLowerCase());
    }
  }
  return nomes;
}

/*
 * As @font-face das famílias da peça, com o arquivo dentro. A folha é a de
 * fonts/fontes.css — a mesma que a TV usa —, e só os blocos das famílias
 * desta peça viajam: o catálogo inteiro embutido passaria de 3 MB.
 */
let folha = null;
async function fontesEmbutidas(tokens) {
  if (!folha) folha = fetch('/fonts/fontes.css').then((r) => r.text()).catch(() => '');
  const texto = await folha;
  const quer = familiasDe(tokens);
  const blocos = texto.match(/@font-face\s*{[^}]*}/g) || [];
  const saida = [];
  for (const b of blocos) {
    const fam = /font-family:\s*['"]?([^;'"]+)['"]?/.exec(b);
    if (!fam || !quer.has(fam[1].trim().toLowerCase())) continue;
    let novo = b;
    for (const m of b.matchAll(/url\(([^)]+)\)/g)) {
      const rel = m[1].replace(/['"]/g, '');
      const abs = new URL(rel, location.origin + '/fonts/').pathname;
      try { novo = novo.replace(m[0], 'url(' + await comoDados(abs) + ')'); } catch (e) { /* sem este pedaço da fonte */ }
    }
    saida.push(novo.replace(/font-display:\s*\w+;?/, ''));
  }
  return saida.join('\n');
}

function esperarImagens(raiz) {
  const imgs = Array.from(raiz.querySelectorAll('img'));
  return Promise.all(imgs.map((img) => (img.complete ? null : new Promise((ok) => { img.onload = ok; img.onerror = ok; setTimeout(ok, 4000); }))));
}

/*
 * Desenha `item` (peça-html) no formato pedido e devolve um Blob.
 *   formato: chave de TAMANHO_REAL ('1/1', '4/5', '9/16', '16/9')
 *   tipo: 'image/png' | 'image/jpeg'
 */
export async function rasterizar(item, formato, tipo) {
  const R = await carregarDesenhista();
  const [w, h] = TAMANHO_REAL[formato] || TAMANHO_REAL['1/1'];
  const caixa = document.createElement('div');
  caixa.style.cssText = 'position:fixed;left:-99999px;top:0;width:' + w + 'px;height:' + h + 'px;container-type:size;overflow:hidden';
  document.body.appendChild(caixa);
  let ctl = null;
  try {
    ctl = R.montar(caixa, item, { leve: true, marcaNaTela: false, clima: () => Promise.resolve('') });
    const sombra = caixa.shadowRoot;
    await esperarImagens(sombra);
    if (document.fonts && document.fonts.ready) await document.fonts.ready;

    // O que o desenhista pôs na sombra, com as fotos embutidas.
    const css = Array.from(sombra.querySelectorAll('style')).map((s) => s.textContent).join('\n')
      .replace(/:host/g, '.mt-raiz');
    const palco = sombra.querySelector('.mt-palco').cloneNode(true);
    for (const img of palco.querySelectorAll('img')) {
      const src = img.getAttribute('src');
      if (!src) continue;
      try { img.setAttribute('src', await comoDados(src)); } catch (e) { img.setAttribute('data-sem-foto', ''); img.removeAttribute('src'); }
    }
    const fontes = await fontesEmbutidas(ctl.tokens);

    const raiz = document.createElementNS(XHTML, 'div');
    raiz.setAttribute('class', 'mt-raiz');
    raiz.setAttribute('style', 'position:relative;width:' + w + 'px;height:' + h + 'px;overflow:hidden');
    const estilo = document.createElementNS(XHTML, 'style');
    estilo.textContent = fontes + '\n' + css;
    raiz.appendChild(estilo);
    raiz.appendChild(palco);
    const html = new XMLSerializer().serializeToString(raiz);
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + w + '" height="' + h + '">'
      + '<foreignObject x="0" y="0" width="100%" height="100%">' + html + '</foreignObject></svg>';

    const img = new Image();
    img.decoding = 'sync';
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    await img.decode();
    const cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    const g = cv.getContext('2d');
    g.drawImage(img, 0, 0, w, h);
    /*
     * O Safari às vezes desenha a fonte embutida só na SEGUNDA vez que o
     * mesmo SVG é pintado. Pintar de novo custa milissegundos e evita a peça
     * sair na fonte do sistema.
     */
    g.drawImage(img, 0, 0, w, h);
    const t = tipo || 'image/png';
    return await new Promise((ok, falha) => cv.toBlob((b) => (b ? ok(b) : falha(new Error('não desenhou'))), t, 0.92));
  } finally {
    if (ctl) ctl.parar();
    caixa.remove();
  }
}

// Os tamanhos de cada canal (EXECUTOR item 6).
export const FORMATOS_REDE = {
  post: { formato: '4/5', nome: 'Post (4:5)', largura: 1080, altura: 1350 },
  quadrado: { formato: '1/1', nome: 'Post quadrado', largura: 1080, altura: 1080 },
  story: { formato: '9/16', nome: 'Story e Status (9:16)', largura: 1080, altura: 1920 },
};
