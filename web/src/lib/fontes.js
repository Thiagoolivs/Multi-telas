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

let folhaPedida = false;

/*
 * A folha das fontes, servida do nosso domínio (fonts/fontes.css, gerada por
 * tools/baixar-fontes.mjs). Antes cada família vinha da Google numa folha
 * própria.
 *
 * O motivo da troca está em js/theme.js, e vale igual aqui: o editor precisa
 * desenhar com a MESMA fonte que a TV desenha e que o compositor mediu. Fonte
 * que depende da rede de terceiro é fonte que às vezes não é a mesma — e o
 * defeito só aparece na parede do cliente, depois de publicado.
 *
 * `media="print"` faz o navegador buscar sem segurar a pintura; quando chega,
 * vira "all". O painel continua utilizável enquanto a fonte não chegou.
 */
function pedirFolha() {
  if (folhaPedida || typeof document === 'undefined') return;
  folhaPedida = true;
  if (document.getElementById('mt-fontes')) return;
  const link = document.createElement('link');
  link.id = 'mt-fontes';
  link.rel = 'stylesheet';
  link.href = '/fonts/fontes.css';
  link.media = 'print';
  link.onload = () => { link.media = 'all'; };
  document.head.appendChild(link);
}

/*
 * Continua recebendo o id da família porque é assim que o editor chama, e
 * porque famílias sem `google` (fonte de sistema) não precisam de folha
 * nenhuma. Só o que mudou é que todas as que precisam vêm do mesmo arquivo.
 */
export function carregarFonte(id) {
  const f = M.FAMILIAS[M.familia(id)];
  if (f && f.google) pedirFolha();
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
