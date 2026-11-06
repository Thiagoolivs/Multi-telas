/*
 * O JEITO DE DIVIDIR A TV, EM PALAVRAS DE QUEM TEM LOJA.
 *
 * O catálogo da TV (js/templates.js) chama os layouts de "Painel Notícias",
 * "Corporativo Completo", "Vertical · Cabeçalho + 2 Zonas + Rodapé": nomes
 * de quem montou o catálogo, que não dizem a forma. O dono da loja escolhe
 * olhando o desenho e lendo o que cada parte é — "uma tela inteira",
 * "grande + coluna à direita". O id continua o mesmo (está gravado nas
 * configs e na TV), e o nome do catálogo fica para a bancada do operador.
 *
 * `nome` é curto (cabe em duas linhas no cartão do celular) e não repete o
 * formato; `nomeDoLayout` põe "Em pé" ou "Quadrada" na frente quando o texto
 * aparece fora do grupo do seletor. `desc` diz cada parte e onde ela fica.
 */
import { getLayout } from './screenConfig.js';

const NOMES = {
  dashboard: ['Coluna à esquerda + grande', 'Uma coluna estreita à esquerda, a parte grande e uma faixa de avisos embaixo dela.'],
  full: ['Uma tela inteira', 'A TV inteira para uma coisa só. Bom para vídeo e campanha.'],
  'full-ticker': ['Tela inteira + faixa embaixo', 'A TV inteira para uma coisa só, com uma faixa de avisos passando embaixo.'],
  duo: ['Duas metades iguais', 'Duas partes do mesmo tamanho, lado a lado: um produto em cada.'],
  'sidebar-right': ['Grande + coluna à direita', 'A parte grande, uma coluna estreita à direita e uma faixa de avisos embaixo.'],
  'header-main-ticker': ['Faixas em cima e embaixo', 'Uma faixa em cima (nome, hora e clima), a parte grande no meio e uma faixa de avisos embaixo.'],
  quad: ['Quatro partes iguais', 'Quatro partes do mesmo tamanho, cada uma com o seu conteúdo.'],
  'video-dynamic': ['Vídeo grande + coluna', 'O vídeo na parte grande, uma coluna estreita ao lado e uma faixa de avisos embaixo.'],
  corporate: ['Grande + coluna + faixas', 'Uma faixa em cima, a parte grande, uma coluna estreita à direita e uma faixa de avisos embaixo. A mais completa.'],
  'portrait-hero': ['Grande + faixa embaixo', 'A parte grande quase até embaixo, e uma faixa de avisos no pé da tela.'],
  'portrait-stack': ['Em faixas, duas partes no meio', 'Uma faixa em cima, duas partes uma sobre a outra e uma faixa de avisos embaixo.'],
  'portrait-duo': ['Duas partes, uma sobre a outra', 'Duas partes do mesmo tamanho, uma em cima da outra, e uma faixa de avisos embaixo.'],
  'square-hero': ['Grande + faixa embaixo', 'A parte grande e uma faixa de avisos embaixo.'],
  'square-split': ['Grande em cima + duas embaixo', 'A parte grande em cima e duas partes menores embaixo, lado a lado.'],
  'square-header': ['Faixas em cima e embaixo', 'Uma faixa em cima, a parte grande no meio e uma faixa de avisos embaixo.'],
};

const FORMATO = { portrait: 'Em pé', square: 'Quadrada' };

/*
 * O nome que a pessoa lê. `curto`: sem o formato (o cartão do seletor já
 * está no grupo "TV em pé"). Layout sem nome aqui (um novo, no catálogo da
 * TV e ainda não neste mapa) mostra o nome do catálogo, nunca o id.
 */
export function nomeDoLayout(id, { curto = false } = {}) {
  const l = getLayout(id);
  const n = NOMES[l.id];
  if (!n) return l.name || String(id || '');
  const formato = !curto && FORMATO[l.orientation];
  return formato ? formato + ': ' + n[0].charAt(0).toLowerCase() + n[0].slice(1) : n[0];
}

// Cada parte e onde ela fica, numa frase.
export function comoSeDivide(id) {
  const l = getLayout(id);
  return (NOMES[l.id] && NOMES[l.id][1]) || l.description || '';
}

export const IDS_COM_NOME = Object.keys(NOMES);
