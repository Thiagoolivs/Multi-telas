/*
 * server/direcao-arte.js — o prompt da FOTO sabe onde o texto vai ficar.
 *
 * Por que existe: a peça é montada em duas etapas — a IA gera uma foto, e o
 * compositor escreve o texto por cima com a fonte de verdade. Só que a foto
 * era pedida sem nenhuma noção da segunda etapa: "descrição da foto" e mais
 * nada. O modelo então preenchia o quadro inteiro, e o texto caía em cima do
 * rosto, do produto, do que fosse.
 *
 * As peças que funcionam nesse mercado fazem o contrário, e é a coisa mais
 * fácil de ver quando se olha várias lado a lado: o sujeito ocupa UM LADO e o
 * outro fica deliberadamente limpo. O texto não disputa espaço com a foto
 * porque a foto foi feita para ceder espaço ao texto.
 *
 * Três regras saem daí, e as três estão no prompt:
 *
 *   1. RESERVA. O prompt diz qual metade fica vazia, com o quê. Não é pedido
 *      de "espaço negativo" no abstrato — é "o lado esquerdo é fundo liso".
 *
 *   2. MONOCROMIA. Fundo e sujeito na mesma família de cor da marca. É o que
 *      faz a peça parecer desenhada em vez de fotografada: a camisa amarela
 *      no fundo amarelo, a manga lilás no fundo lilás. Sem isso, a foto de
 *      banco de imagens briga com a identidade do cliente.
 *
 *   3. NENHUM TEXTO NA IMAGEM. O guia antigo pedia só "sem marcas d'água", e
 *      modelo de imagem adora escrever — em português, com acento torto e
 *      kerning quebrado. Cada palavra que ele desenha vira lixo por baixo do
 *      texto de verdade, que o compositor escreve depois com a fonte certa.
 */
'use strict';

const ds = require('./design-system');

/*
 * Onde o texto vai, por formato. É o compositor quem manda de fato; aqui está
 * a convenção que ele segue, traduzida para instrução de foto.
 *
 * Vertical reserva EM CIMA, e não ao lado: numa peça 9/16 dividir ao meio na
 * largura deixa duas colunas magras, e nenhuma das duas comporta manchete.
 */
const RESERVA = {
  '16/9': { lado: 'esquerdo', eixo: 'horizontal', fracao: 'a metade esquerda', altura: 1 },
  '21/9': { lado: 'esquerdo', eixo: 'horizontal', fracao: 'o terço esquerdo', altura: 1 },
  /*
   * O quadrado pede 40%, e não um terço.
   *
   * Medido: em 1/3 de uma peça 1/1 não cabem kicker, manchete, apoio e CTA —
   * a manchete saía com duas linhas numa caixa de uma e transbordava por cima
   * do kicker. `altura` é a mesma fração que a foto promete deixar limpa e
   * que o layout usa para escrever: sair do mesmo lugar é o que impede
   * prometer um terço e escrever em quarenta por cento.
   */
  '1/1': { lado: 'inferior', eixo: 'vertical', fracao: 'os 40% de baixo', altura: 0.40 },
  '9/16': { lado: 'superior', eixo: 'vertical', fracao: 'o terço superior', altura: 0.34 },
};

function reservaDe(formato) {
  return RESERVA[formato] || RESERVA['16/9'];
}

/*
 * O clima, em palavras que um modelo de imagem entende.
 *
 * Casa com as direções que o design-system já tem — não é vocabulário novo:
 * quem escolhe "cartaz" no plano recebe aqui a tradução daquilo para foto.
 */
const CLIMA = {
  chapado: 'fundo de cor chapada e saturada, sem textura, sem degradê',
  cartaz: 'foto dramática, iluminação dura, sombra marcada',
  contraste: 'fundo muito escuro, luz recortando o sujeito pela lateral',
  suave: 'iluminação difusa e suave, fundo com leve variação de tom',
};

/*
 * O elemento de apoio: UM, e do mesmo material.
 *
 * O que separa a peça boa da poluída quase nunca é o elemento — é a
 * quantidade. Uma família só (três corações 3D, ou um traço de linha, ou
 * confete) lê como direção de arte; duas lê como enfeite.
 */
const APOIO = {
  chapado: 'algumas formas geométricas simples flutuando, na mesma paleta',
  cartaz: 'um traço de linha fina desenhado por cima, na cor de acento',
  contraste: 'nenhum elemento extra — só o sujeito e a luz',
  suave: 'poucas formas orgânicas desfocadas ao fundo',
};

function nomeDaCor(hex) {
  const h = String(hex || '').trim();
  return /^#[0-9a-fA-F]{3,8}$/.test(h) ? h : '';
}

/*
 * Monta o prompt final da foto.
 *
 * `pedido` é a descrição que o diretor escreveu ("um padeiro segurando um
 * pão"); tudo o mais aqui é direção de arte, e vem por cima dela.
 */
function promptDeFoto(pedido, opcoes) {
  const o = opcoes || {};
  const formato = ds.FORMATOS[o.formato] ? o.formato : '16/9';
  const r = reservaDe(formato);
  const dir = String(o.direcao || 'suave');
  const marca = nomeDaCor(o.brand);
  const acento = nomeDaCor(o.brand2);
  const produto = !!o.produto;

  const linhas = [
    String(pedido || '').trim(),
    '',
    /*
     * A foto anexada é o produto que o cliente VENDE (PLANO §4.11). Um vestido
     * "parecido" não serve: ele vende aquele. Por isso a fidelidade vem antes
     * de toda a direção de arte, e a monocromia abaixo deixa de valer para o
     * produto — tingir o produto na cor da marca seria inventar outro.
     */
    produto ? 'A IMAGEM ANEXADA É O PRODUTO REAL DO CLIENTE. Ele aparece na foto EXATAMENTE como é: '
      + 'mesma forma, cor, estampa, material, proporção e detalhes. Não redesenhe, não simplifique, '
      + 'não troque por um parecido. Pode mudar o cenário, a luz, o ângulo e quem usa ou segura o produto.' : '',
    'DIREÇÃO DE ARTE — siga à risca:',
    `- Proporção ${formato}.`,
    /*
     * A reserva vem primeiro e é dita duas vezes, de jeitos diferentes: uma
     * como composição ("o sujeito ocupa o outro lado") e outra como conteúdo
     * ("ali é fundo liso"). Dito uma vez só, o modelo trata como sugestão e
     * enche o espaço assim mesmo.
     */
    `- ${r.fracao.charAt(0).toUpperCase() + r.fracao.slice(1)} da imagem fica VAZIA: `
      + 'apenas fundo liso, sem objeto, sem sujeito, sem detalhe. '
      + 'Esse espaço vai receber texto depois.',
    `- O sujeito principal fica no lado oposto, em sangria, ocupando o resto do quadro.`,
    produto
      ? (marca ? `- O fundo e o cenário na família de cor de ${marca}; o PRODUTO mantém as cores reais dele.`
        : '- O fundo e o cenário em poucos tons; o PRODUTO mantém as cores reais dele.')
      : marca
        ? `- MONOCROMIA: o fundo e a roupa (ou o objeto) principal na mesma família de cor de ${marca}. `
          + 'Tons diferentes da mesma cor, não cores diferentes.'
        : '- MONOCROMIA: fundo e sujeito na mesma família de cor.',
    acento ? `- Um único ponto de ${acento} como acento, pequeno.` : '',
    `- ${CLIMA[dir] || CLIMA.suave}.`,
    `- ${APOIO[dir] || APOIO.suave}.`,
    o.estilo ? `- Estilo: ${o.estilo}.` : '',
    '',
    /*
     * Em maiúsculas e por último de propósito: é a instrução mais desobedecida
     * de todas, e a que mais estraga — palavra desenhada pelo modelo fica por
     * baixo do texto de verdade e não sai mais.
     */
    'NENHUM TEXTO, LETRA, NÚMERO, LOGOTIPO OU MARCA D\'ÁGUA NA IMAGEM. '
      + 'O texto é escrito depois, por fora. Se aparecer qualquer palavra, a imagem é inútil.'
      + (produto ? ' A única exceção é o que já vem impresso no próprio produto (rótulo, etiqueta), que fica como está.' : ''),
    /*
     * D43 (e), aprovado pelo dono em 23/10: "sem aparência de banco de
     * imagens" era só uma negativa, e o modelo seguia entregando o sorriso
     * posado para a lente. Agora diz o que É uma foto de verdade (momento,
     * gente fazendo algo, olhar fora da câmera) e nomeia os clichês a
     * evitar. Vem por último e cede à direção de arte acima: o espaço vazio,
     * a cor e a luz mandam.
     */
    'Fotografia de momento real, como se tirada no próprio estabelecimento. '
      + 'Quando houver pessoas: brasileiras de verdade, idades e tons de pele variados, fazendo algo '
      + '(atendendo, preparando, escolhendo), olhar fora da câmera, roupa do dia a dia, pele com textura real. '
      + 'Lente de 35 a 50mm. Evite: sorriso posado para a lente, polegar para cima, aperto de mão, '
      + 'fone de call center, fundo branco infinito, grupo alinhado olhando para a câmera. '
      + 'A direção de arte acima (o espaço vazio, a cor, a luz) vem antes disto.',
  ];
  return linhas.filter((l) => l !== '').join('\n');
}

module.exports = { promptDeFoto, reservaDe, RESERVA, CLIMA, APOIO };
