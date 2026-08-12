/*
 * Tipografia no editor — a MESMA de js/fontes.js, não uma cópia.
 *
 * Este arquivo não redeclara nada: ele importa o catálogo canônico e só
 * acrescenta o que é do navegador do painel (baixar a fonte da Google). Se
 * fosse cópia, um dia as duas listas divergiriam e o editor voltaria a
 * mostrar uma coisa e a TV outra — que é exatamente o defeito que o catálogo
 * único veio consertar.
 */
import '../../../js/fontes.js';

const M = globalThis.MTFontes;

export const FAMILIAS = M.FAMILIAS;
export const IDS = M.IDS;
export const ESPACAMENTO = M.ESPACAMENTO;
export const ENTRELINHA = M.ENTRELINHA;
export const familia = M.familia;
export const dados = M.dados;
export const pesoValido = M.pesoValido;
export const listar = M.listar;

/*
 * O CSS do texto. É o que o palco do editor, a miniatura e a prévia usam —
 * e é a mesma função que o player chama. Sem fontSize, que cada um mede na
 * sua unidade (cqw no palco, px no editor, pixel de canvas na exportação).
 */
export function estiloTexto(el) {
  return M.estiloTexto(el);
}

/* Pesos que a família tem, para o seletor mostrar só o que existe. */
export function pesosDe(id) {
  return M.dados(id).pesos;
}

const baixadas = {};

/*
 * Baixa uma família da Google Fonts, uma vez só.
 *
 * `media="print"` faz o navegador buscar sem segurar a pintura; quando chega,
 * vira "all" e a fonte entra. É o mesmo truque de js/theme.js, pelo mesmo
 * motivo: numa rede ruim, o painel continua utilizável enquanto a fonte não
 * chega, em vez de ficar em branco esperando a Google.
 */
export function carregarFonte(id) {
  const f = M.FAMILIAS[M.familia(id)];
  if (!f || !f.google || baixadas[id] || typeof document === 'undefined') return;
  baixadas[id] = true;

  if (!document.getElementById('mt-gfonts-pre')) {
    const p1 = document.createElement('link');
    p1.id = 'mt-gfonts-pre'; p1.rel = 'preconnect';
    p1.href = 'https://fonts.googleapis.com';
    document.head.appendChild(p1);
    const p2 = document.createElement('link');
    p2.rel = 'preconnect'; p2.href = 'https://fonts.gstatic.com';
    p2.crossOrigin = 'anonymous';
    document.head.appendChild(p2);
  }
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = 'https://fonts.googleapis.com/css2?family=' + f.google + '&display=swap';
  link.media = 'print';
  link.onload = () => { link.media = 'all'; };
  document.head.appendChild(link);
}

/* Todas as famílias usadas por uma composição, para a prévia não sair torta. */
export function carregarDaComposicao(elementos) {
  for (const e of Array.isArray(elementos) ? elementos : []) {
    if (e && e.tipo === 'texto') carregarFonte(e.fonte);
  }
}

/*
 * Espera as fontes chegarem antes de desenhar no canvas.
 *
 * O canvas não tem segunda chance: o HTML redesenha sozinho quando a fonte
 * termina de baixar, mas o PNG já foi gerado e não volta atrás. Sem esta
 * espera, exportar uma peça recém-aberta produzia um arquivo na fonte do
 * sistema — e a pessoa só descobria comparando com a tela.
 */
export async function prontasParaCanvas(elementos) {
  carregarDaComposicao(elementos);
  if (typeof document === 'undefined' || !document.fonts) return;
  const pedidos = [];
  for (const e of Array.isArray(elementos) ? elementos : []) {
    if (!e || e.tipo !== 'texto') continue;
    const f = M.FAMILIAS[M.familia(e.fonte)];
    const nome = /'([^']+)'/.exec(f.css);
    if (!nome) continue;
    const s = M.estiloTexto(e);
    pedidos.push(document.fonts.load(`${s.fontStyle} ${s.fontWeight} 32px "${nome[1]}"`).catch(() => {}));
  }
  await Promise.all(pedidos);
}
