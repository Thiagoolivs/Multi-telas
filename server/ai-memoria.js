/*
 * server/ai-memoria.js — o que o sistema aprende sobre a empresa.
 *
 * A Marca guarda o que o usuário DECLAROU: cores, fontes, logo, tom. Isto
 * guarda o que ele REVELOU conversando — o que vende no negócio dele, quem é o
 * cliente, que promessa não cabe, como ele fala.
 *
 * Por que separar: a Marca é dele para editar; a memória é nossa dedução, e
 * dedução precisa poder ser revista, esquecida e mostrada. Misturar as duas
 * faria o sistema alterar sozinho um campo que o usuário preencheu — o jeito
 * mais rápido de perder a confiança dele.
 *
 * O efeito prático é o pedido: cada campanha começa sabendo mais que a
 * anterior, então o chat pergunta menos e a peça sai mais com a cara da casa.
 */
const ai = require('./ai');

const SISTEMA = `Você mantém a ficha de um cliente de uma agência. Depois de cada
conversa de briefing, atualiza o que se sabe sobre a EMPRESA — não sobre a
campanha daquele dia.

O QUE ENTRA NA FICHA:
- fatos estáveis do negócio: o que vende, para quem, onde fica, o que a
  diferencia dos concorrentes;
- o jeito de falar que o dono usa (formal, direto, brincalhão);
- promessas ou clichês que ele evita;
- argumentos que ele repete — normalmente é o que realmente funciona.

O QUE NÃO ENTRA:
- nada específico de UMA campanha: preço promocional, data limite, oferta;
- nada que a pessoa não disse. Não deduza faturamento, tamanho nem intenção;
- dados pessoais de terceiros (nomes de funcionários, clientes).

Se a conversa não revelou nada novo sobre a empresa, devolva a ficha anterior
sem mudanças. Ficha que cresce a cada conversa vira ruído.

Responda APENAS JSON:
{
  "segmento": "o que a empresa faz, uma frase",
  "publico": "quem é o cliente dela, uma frase",
  "diferenciais": ["o que ela tem que o concorrente não tem"],
  "argumentos": ["razão que costuma convencer o cliente dela"],
  "evitar": ["promessa ou clichê que esta empresa não faz"],
  "jeitoDeFalar": "como o dono se expressa, meia frase",
  "notas": ["fato estável do negócio que ajuda a criar"]
}
Português do Brasil. Frases curtas.`;

const MAX = { lista: 6, frase: 160, item: 140 };

const lista = (v, n) => (Array.isArray(v) ? v : [])
  .map((x) => String(x || '').trim().slice(0, MAX.item))
  .filter(Boolean)
  .filter((x, i, a) => a.indexOf(x) === i)   // memória com item repetido é ruído
  .slice(0, n);

function normalizar(m) {
  m = m && typeof m === 'object' ? m : {};
  return {
    segmento: String(m.segmento || '').slice(0, MAX.frase),
    publico: String(m.publico || '').slice(0, MAX.frase),
    diferenciais: lista(m.diferenciais, MAX.lista),
    argumentos: lista(m.argumentos, MAX.lista),
    evitar: lista(m.evitar, MAX.lista),
    jeitoDeFalar: String(m.jeitoDeFalar || '').slice(0, MAX.frase),
    notas: lista(m.notas, MAX.lista),
  };
}

const vazia = () => normalizar({});

// A memória tem conteúdo? Serve para o painel não mostrar uma ficha em branco.
function temConteudo(m) {
  if (!m) return false;
  return !!(m.segmento || m.publico || m.jeitoDeFalar
    || (m.diferenciais || []).length || (m.argumentos || []).length
    || (m.evitar || []).length || (m.notas || []).length);
}

/*
 * Vira texto para entrar no prompt de quem cria. É aqui que a memória deixa de
 * ser um registro e passa a mudar a peça.
 */
function comoTexto(m) {
  if (!temConteudo(m)) return '';
  return [
    'O QUE JÁ SABEMOS DESTA EMPRESA (de conversas anteriores):',
    m.segmento ? `- negócio: ${m.segmento}` : '',
    m.publico ? `- cliente dela: ${m.publico}` : '',
    m.diferenciais.length ? `- diferenciais: ${m.diferenciais.join(' · ')}` : '',
    m.argumentos.length ? `- o que costuma convencer: ${m.argumentos.join(' · ')}` : '',
    m.evitar.length ? `- NUNCA prometa: ${m.evitar.join(' · ')}` : '',
    m.jeitoDeFalar ? `- jeito de falar: ${m.jeitoDeFalar}` : '',
    m.notas.length ? `- notas: ${m.notas.join(' · ')}` : '',
  ].filter(Boolean).join('\n');
}

/*
 * Destila a conversa numa ficha nova, partindo da anterior. Falhar aqui é
 * aceitável: a memória é um ganho acumulado, não um requisito da campanha —
 * por isso devolvemos a anterior intacta em vez de propagar o erro.
 */
async function aprender(anterior, mensagens, resumo) {
  const base = normalizar(anterior);
  if (ai.mode() === 'dev') return base;

  const conversa = (mensagens || []).slice(0, 24).map((m) => {
    const quem = m && m.papel === 'ia' ? 'Pergunta' : 'Resposta';
    return `${quem}: ${String((m && m.texto) || '').slice(0, 500)}`;
  }).join('\n');

  const usuario = [
    'FICHA ATUAL:',
    JSON.stringify(base),
    '',
    'CONVERSA QUE ACABOU DE ACONTECER:',
    conversa || '(sem conversa)',
    resumo && resumo.briefing ? '\nBRIEFING FECHADO:\n' + String(resumo.briefing).slice(0, 900) : '',
    '',
    'Atualize a ficha. Mantenha o que continua verdade, some o que apareceu.',
  ].filter(Boolean).join('\n');

  try {
    return normalizar(ai.parseAiJson(await ai.callLLM(SISTEMA, usuario)));
  } catch (e) {
    return base;
  }
}

module.exports = { aprender, normalizar, vazia, comoTexto, temConteudo };
