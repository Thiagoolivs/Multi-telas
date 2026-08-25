const fs = require('fs');
const path = require('path');
const fontkit = require('fontkit');
const fontes = require('../js/fontes.js');

const fontCache = {};
let listaDeArquivos = null;

function getFont(familiaId, peso, italico) {
  const cacheKey = `${familiaId}-${peso}-${italico}`;
  if (fontCache[cacheKey]) return fontCache[cacheKey];

  const familia = fontes.FAMILIAS[familiaId];
  if (!familia) return null;

  // Montar nome do arquivo esperado. Ex: "inter", "anton"
  /*
   * Faltava a barra invertida: `/s+/` troca a LETRA "s", não o espaço.
   *
   * "Playfair Display" virava `playfair di-play` e "Poppins" virava
   * `poppin-`. Sete das doze famílias nunca casavam com arquivo nenhum, a
   * medição caía calada na estimativa, e caía justamente nas fontes de
   * display — que são as que mais erram largura, porque é para isso que
   * elas existem.
   */
  const nomeBase = familia.rotulo.toLowerCase().trim().replace(/\s+/g, '-');
  
  // No repositório, temos arquivos tipo: inter-400-normal-latin.woff2
  // Vamos tentar achar o exato, se não, cai para o 400 normal
  const dir = path.join(__dirname, '../fonts/arquivos');
  // A listagem é lida UMA vez: era um readdirSync por família não cacheada,
  // dentro da requisição. As fontes não mudam com o servidor no ar.
  if (!listaDeArquivos) {
    try { listaDeArquivos = fs.readdirSync(dir); } catch (e) { listaDeArquivos = []; }
  }
  const files = listaDeArquivos;

  let targetWeight = fontes.pesoValido(familiaId, peso);
  let style = italico ? 'italic' : 'normal';

  let match = files.find(f => f.startsWith(`${nomeBase}-${targetWeight}-${style}-latin.woff2`));
  
  if (!match) {
    // Tenta ignorar estilo
    match = files.find(f => f.startsWith(`${nomeBase}-${targetWeight}-`));
  }
  if (!match) {
    // Tenta ignorar peso
    match = files.find(f => f.startsWith(`${nomeBase}-400-`));
  }
  if (!match) {
    // Pega o primeiro que começar com nomeBase
    match = files.find(f => f.startsWith(nomeBase));
  }

  if (match) {
    try {
      const fontPath = path.join(dir, match);
      const font = fontkit.openSync(fontPath);
      fontCache[cacheKey] = font;
      return font;
    } catch (e) {
      console.error('Erro ao abrir fonte:', match, e.message);
    }
  }

  // Fallback: null
  fontCache[cacheKey] = null;
  return null;
}

/*
 * Mede exatamente se o texto cabe na caixa usando a fonte real.
 * Substitui o cabeNaCaixa original.
 */
function cabeNaCaixaReal(texto, box, fontCqw, formato, familiaId, peso, italico) {
  const t = String(texto || '');
  if (!t) return { cabe: true, linhas: 0, sugestaoCqw: fontCqw };

  const r = (formato === '9/16') ? 9/16 : 16/9; // ratioDe

  const font = getFont(familiaId, peso, italico);
  if (!font) {
    // Fallback pra lógica antiga se a fonte não for encontrada
    const fallbackLargura = fontCqw * fontes.larguraCaractere(familiaId);
    const porLinha = Math.max(1, Math.floor(box.w / fallbackLargura));
    const linhasEstimadas = Math.ceil(t.length / porLinha);
    const alturaEmUnidadesLargura = box.h / r;
    const alturaLinhaEstimada = fontCqw * 1.15;
    const linhasCabemEstimadas = Math.max(1, Math.floor(alturaEmUnidadesLargura / alturaLinhaEstimada));
    const cabeEstimado = linhasEstimadas <= linhasCabemEstimadas;
    const sugestao = cabeEstimado ? fontCqw : Math.max(1.4, fontCqw * Math.sqrt(linhasCabemEstimadas / linhasEstimadas) * 0.96);
    return { cabe: cabeEstimado, linhas: linhasEstimadas, linhasCabem: linhasCabemEstimadas, sugestaoCqw: Number(sugestao.toFixed(2)) };
  }

  // Quebra manual de palavras para simular o wrap do navegador
  /*
   * Mesma barra invertida perdida do nome do arquivo, e aqui dói mais.
   *
   * `/(s+)/` separa pela LETRA "s": "casa nova" virava ["ca", "s", "a nova"],
   * e cada pedaço era medido como se fosse uma palavra. A quebra de linha
   * saía em lugar nenhum e a largura calculada não tinha relação com o texto
   * — a medição "com métricas reais" era mais errada que a estimativa que ela
   * veio substituir.
   */
  const words = t.split(/(\s+)/); // Preserva espaços para medir e quebrar no lugar certo
  
  let linhas = 1;
  let currentLineWidthCqw = 0;

  for (const word of words) {
    if (!word) continue;
    // Idem: era 'n', a letra, e não a quebra de linha.
    if (word === '\n') {
      linhas++;
      currentLineWidthCqw = 0;
      continue;
    }

    const run = font.layout(word);
    // advanceWidth é em unidades do EM. Dividimos por unitsPerEm para ter em EM.
    // E multiplicamos por fontCqw para ter em CQW (% da largura da peça).
    const wordWidthCqw = (run.advanceWidth / font.unitsPerEm) * fontCqw;

    if (currentLineWidthCqw === 0) {
      currentLineWidthCqw = wordWidthCqw;
    } else {
      if (currentLineWidthCqw + wordWidthCqw > box.w) {
        // Nova linha (se a palavra for um espaço, pode ser ignorada no wrap visual, mas vamos ser rígidos)
        if (word.trim() === '') {
          // Espaços no final da linha não causam nova linha no browser, apenas colapsam
          continue; 
        }
        linhas++;
        currentLineWidthCqw = wordWidthCqw;
      } else {
        currentLineWidthCqw += wordWidthCqw;
      }
    }
  }

  const alturaEmUnidadesLargura = box.h / r;
  // A altura da linha no player depende do `entrelinha` da fonte.
  const entrelinha = fontes.FAMILIAS[familiaId].entrelinha || 1.15;
  const alturaLinha = fontCqw * entrelinha;
  
  const linhasCabem = Math.max(1, Math.floor(alturaEmUnidadesLargura / alturaLinha));
  const cabe = linhas <= linhasCabem;
  
  let sugestaoCqw = fontCqw;
  if (!cabe) {
    // Reduzimos o fontCqw. Se linhas > linhasCabem, precisamos diminuir.
    // Como a largura de toda palavra escala linearmente com fontCqw, podemos
    // estimar um fator de redução. 
    // Usamos o método da raiz ou simplesmente tentamos uma heurística.
    const reducao = Math.sqrt(linhasCabem / linhas) * 0.96;
    sugestaoCqw = Math.max(1.4, fontCqw * reducao);
  }

  return { cabe, linhas, linhasCabem, sugestaoCqw: Number(sugestaoCqw.toFixed(2)) };
}

module.exports = { getFont, cabeNaCaixaReal };
