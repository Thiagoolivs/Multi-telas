/*
 * A mensagem de erro que a pessoa lê.
 *
 * QA de lançamento, 03/11 (usuários 15 e 16, e a leitura de textos): os erros
 * vinham do servidor como o programador escreveu — "código não encontrado",
 * "e-mail ou senha incorretos", "e-mail já cadastrado" —, em minúscula e sem
 * dizer o que fazer. A Dona Cida digitou o código da TV com um espaço, leu
 * "código não encontrado" e não soube se o erro era dela, da TV ou do site.
 *
 * Aqui o painel traduz os casos conhecidos para uma frase com o próximo
 * passo, e o resto ganha ao menos a maiúscula e o ponto final. Fica no
 * painel (e não só no servidor) porque o mesmo erro pede frases diferentes
 * em lugares diferentes, e porque o servidor responde a outros clientes
 * (a TV, o app) que têm as suas.
 *
 * Sem React: testado direto no Node (test/painel-acessivel.test.js).
 */

const CONHECIDOS = [
  // Parear a TV
  { re: /c[óo]digo expirado/i, onde: 'parear',
    texto: 'Esse código venceu. Desligue e ligue a TV (ou recarregue a página dela) para aparecer um código novo, e digite o novo.' },
  { re: /c[óo]digo n[ãa]o encontrado|c[óo]digo inv[áa]lido/i, onde: 'parear',
    texto: 'Não achamos esse código. Confira na TV: são 6 letras e números. Se a TV mostrar um código novo, use o novo.' },
  { re: /j[áa] pertence a outra conta/i, onde: 'parear',
    texto: 'Esta TV já está ligada a outra conta. Peça para quem a ligou removê-la em Telas, ou fale com o suporte.' },
  { re: /muitas tentativas/i, onde: 'parear',
    texto: 'Muitas tentativas seguidas. Espere uns 10 minutos e tente de novo — a TV continua mostrando o código.' },
  // Entrar
  { re: /e-?mail ou senha incorret/i,
    texto: 'E-mail ou senha não conferem. Confira e tente de novo, ou toque em “Esqueci minha senha”.' },
  { re: /e-?mail j[áa] cadastrado/i,
    texto: 'Este e-mail já tem conta. Toque em “Entrar” acima — e, se não lembrar a senha, em “Esqueci minha senha”.' },
  { re: /senha atual incorret/i,
    texto: 'A senha atual não confere. Digite de novo ou use “Esqueci minha senha” na tela de entrar.' },
];

// Primeira letra maiúscula e ponto no fim — o mínimo para não parecer recado de programador.
export function frase(t) {
  const s = String(t || '').trim();
  if (!s) return '';
  const cap = s.charAt(0).toLocaleUpperCase('pt-BR') + s.slice(1);
  return /[.!?…]$/.test(cap) ? cap : cap + '.';
}

/*
 * `erro` é o Error do api.js (message, status, offline) ou um texto.
 * `onde` (opcional) restringe as traduções que só fazem sentido num lugar.
 */
export function paraGente(erro, onde) {
  const msg = typeof erro === 'string' ? erro : (erro && erro.message) || '';
  if (erro && erro.offline) return msg; // a do api.js já diz o que fazer
  const achado = CONHECIDOS.find((c) => c.re.test(msg) && (!c.onde || !onde || c.onde === onde));
  if (achado) return achado.texto;
  return frase(msg) || 'Não deu certo. Tente de novo em instantes.';
}

/*
 * O código da TV como a pessoa digita: "bwc dqz", "BWC-DQZ", " bwcdqz ".
 * O mesmo que o ?parear= do QR já fazia (lib/parearPendente.js): sem
 * espaços nem traços, em maiúsculas, 6 caracteres.
 */
export function codigoDaTv(texto) {
  return String(texto || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
}
