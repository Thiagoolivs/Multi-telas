/*
 * server/quiz-ia.js — a IA escreve as perguntas do quiz (EXECUTOR D21).
 *
 * "Fato errado na parede é pior que nenhum." Três cuidados:
 *   1. o pedido à IA só aceita fato consolidado, sem número que muda (preço,
 *      estatística do ano) e sem tema polêmico;
 *   2. toda pergunta sai daqui com `revisada: false` — a TV não mostra e o
 *      servidor não publica até uma pessoa conferir (js/quiz.js);
 *   3. a certa muda de posição: a IA tende a pôr sempre na primeira, e um
 *      quiz cuja resposta é sempre "A" não ensina nada.
 */
const Q = require('../js/quiz.js');
const ai = require('./ai');

const LUGAR = { empresa: 'uma empresa (comunicação interna, chão de fábrica, escritório)', comercio: 'uma loja ou restaurante', saude: 'uma clínica ou consultório (sala de espera)' };

const SISTEMA = `Você escreve perguntas de quiz para a TV de um negócio no Brasil.
O quiz passa na parede: pergunta, quatro alternativas curtas, o tempo corre e a
resposta aparece com uma explicação de uma frase.

REGRAS DE VERDADE (mais importantes que tudo):
- Só fato consolidado, que qualquer fonte séria confirma. Na dúvida, não use.
- Nada de número que muda (preço, estatística do ano, recorde), nada de data
  recente, nada polêmico (política, religião), nada de conselho médico
  individual. Saúde: só orientação geral de prevenção.
- A explicação diz POR QUE a certa é certa, em linguagem simples.

FORMA:
- pergunta: até 120 letras; alternativas: até 45 letras cada; explicação: até 160.
- Exatamente uma alternativa certa; as erradas plausíveis, sem pegadinha.

Responda APENAS JSON:
{ "perguntas": [ { "pergunta": "...", "alternativas": ["...", "...", "...", "..."], "certa": 0, "explicacao": "..." } ] }`;

/*
 * Sem IA (localhost e testes): perguntas conferíveis por perfil. Também
 * saem como não revisadas — o fluxo de revisão é o mesmo.
 */
const PRONTAS = {
  empresa: [
    { pergunta: 'Qual EPI protege a audição em área de ruído?', alternativas: ['Luva de raspa', 'Protetor auricular', 'Capacete', 'Óculos de proteção'], certa: 1, explicacao: 'O protetor auricular reduz o ruído que chega ao ouvido e evita a perda de audição.' },
    { pergunta: 'Viu uma situação de risco no setor. O que fazer primeiro?', alternativas: ['Avisar o líder ou a CIPA', 'Esperar o fim do turno', 'Resolver sozinho', 'Comentar só com colegas'], certa: 0, explicacao: 'Avisar quem pode agir rápido evita que o risco vire acidente.' },
    { pergunta: 'O que quer dizer a sigla CIPA?', alternativas: ['Comissão Interna de Prevenção de Acidentes', 'Central de Informações do Pessoal Ativo', 'Controle Interno de Produção e Armazenagem', 'Cadastro Interno de Profissionais Autorizados'], certa: 0, explicacao: 'A CIPA reúne empregados e empresa para prevenir acidentes e doenças do trabalho.' },
  ],
  saude: [
    { pergunta: 'Por quanto tempo devemos lavar as mãos com água e sabão?', alternativas: ['5 segundos', 'Pelo menos 20 segundos', 'Só enxaguar', '2 segundos'], certa: 1, explicacao: 'Esfregar por pelo menos 20 segundos remove a sujeira e boa parte dos germes.' },
    { pergunta: 'Qual vacina é recomendada todos os anos?', alternativas: ['Febre amarela', 'BCG', 'Gripe', 'Sarampo'], certa: 2, explicacao: 'O vírus da gripe muda, por isso a vacina é atualizada a cada ano.' },
    { pergunta: 'Qual hábito ajuda a prevenir a pressão alta?', alternativas: ['Comer com menos sal', 'Dormir menos', 'Pular refeições', 'Tomar mais café'], certa: 0, explicacao: 'O excesso de sal aumenta a pressão; reduzir o sal é uma das medidas mais simples.' },
  ],
  comercio: [
    { pergunta: 'Qual forma de pagamento cai na hora, até no domingo?', alternativas: ['Boleto', 'Pix', 'Cheque', 'Depósito no caixa'], certa: 1, explicacao: 'O Pix é instantâneo e funciona 24 horas por dia, todos os dias.' },
    { pergunta: 'Onde o pão francês fica crocante por mais tempo?', alternativas: ['Saco de papel', 'Saco plástico fechado', 'Geladeira', 'Pote de vidro fechado'], certa: 0, explicacao: 'O papel deixa a umidade sair; no plástico a casca amolece.' },
    { pergunta: 'O que mostra o QR code que você vê nas lojas?', alternativas: ['Um endereço ou informação para o celular', 'O preço do dia', 'A senha do caixa', 'A validade do produto'], certa: 0, explicacao: 'O QR guarda um texto ou link que a câmera do celular lê na hora.' },
  ],
};

// Embaralha a posição da certa de forma estável para a mesma pergunta (o teste não fica aleatório).
function embaralhar(p, semente) {
  const n = p.alternativas.length;
  const desloc = (semente + p.pergunta.length) % n;
  const alternativas = p.alternativas.map((_, i) => p.alternativas[(i + desloc) % n]);
  const certa = (p.certa - desloc + n) % n;
  return Object.assign({}, p, { alternativas, certa });
}

async function gerar({ tema, quantidade, perfil }) {
  const n = Math.max(1, Math.min(6, Math.round(Number(quantidade) || 3)));
  const lugar = LUGAR[perfil] || LUGAR.comercio;
  let brutas = null;
  if (ai.mode() !== 'dev') {
    const usuario = ['Lugar: ' + lugar, 'Tema: ' + String(tema || 'curiosidades úteis para quem está esperando').slice(0, 200), 'Quantidade: ' + n].join('\n');
    try {
      const r = ai.parseAiJson(await ai.callLLM(SISTEMA, usuario));
      brutas = r && Array.isArray(r.perguntas) ? r.perguntas : null;
    } catch (e) { brutas = null; }
    if (!brutas) { const e = new Error('a IA não conseguiu escrever o quiz agora'); e.status = 502; throw e; }
  } else {
    brutas = (PRONTAS[perfil] || PRONTAS.comercio).slice(0, n);
  }
  const perguntas = brutas.map((p, i) => Q.pergunta(Object.assign({}, p, { revisada: false })))
    .filter(Boolean).slice(0, n).map((p, i) => embaralhar(p, i + 1));
  if (!perguntas.length) { const e = new Error('a IA não escreveu nenhuma pergunta que dê para usar'); e.status = 502; throw e; }
  return { perguntas };
}

module.exports = { gerar, embaralhar, SISTEMA, PRONTAS };
