/*
 * A ARTE DO MODO AMBIENTE, no painel (Ajustes da TV › Aparência), sem React
 * para dar para testar.
 *
 * Duas escolhas: o desenho da marca (o de sempre, js/ambiente.js, sem nada
 * na config) ou uma peça-ouro de ambiente (pecas-ouro/ambiente-*.html) que o
 * operador APROVOU na galeria — o manifesto servido em
 * /pecas-ouro/manifesto.json já sai com a decisão (server/conteudoPronto.js).
 *
 * A escolhida vai inteira para settings.ambiente.peca: um item peca-html com
 * as cores e o nome da marca daquele momento (como as cores da marca nos
 * Ajustes: a TV funciona sem internet e não muda sozinha). A TV a põe no
 * lugar do desenho (js/rodizio.js, pecaDeAmbiente), e o servidor a passa
 * pela porta das peças antes de gravar (js/peca-html.js, conferirConfig).
 */
import { itemDoModelo, daFrente } from './modelosOuro.js';

// Só as aprovadas de verdade: peça de ambiente sem estado ainda não passou pela galeria.
export const artesAprovadas = (modelos, frente) =>
  daFrente((modelos || []).filter((m) => m && m.familia === 'ambiente' && m.estado === 'aprovada' && m.arq), frente);

// "Ambiente: ondas" → "Ondas".
export function nomeDaArte(m) {
  const n = String((m && m.nome) || '').replace(/^Ambiente:\s*/i, '').trim();
  return n ? n.charAt(0).toUpperCase() + n.slice(1) : 'Arte calma';
}

// O modelo de que a peça gravada saiu ('' = não é peça-ouro).
export const baseDa = (peca) => (peca && peca.origem && peca.origem.base) || '';

/*
 * A peça que vai para a TV: o modelo na marca da conta, com o texto da
 * frente (`textos` do manifesto). A frase que a pessoa escreveu entra no
 * lugar da do modelo. Sem o nome da empresa, o lugar do nome fica vazio e
 * escondido: o nome da marca de exemplo ("Clínica Vida") nunca vai para a
 * TV de ninguém.
 */
export function pecaDaArte(m, marca, frente, frase) {
  const k = marca || {};
  const it = itemDoModelo(m, k, frente);
  const campos = { ...it.campos };
  const ocultos = [];
  const texto = String(frase || '').replace(/\s+/g, ' ').trim().slice(0, 90);
  if (texto) campos.frase = texto;
  if (/data-campo="marca"/.test(m.arq.html) && !k.nome) { campos.marca = ''; ocultos.push('marca'); }
  return { ...it, campos, ...(ocultos.length ? { ocultos } : {}), duracao: 10, origem: { ...it.origem, pedido: 'modo ambiente' } };
}

// A frase que o modelo traz para a frente (o exemplo do campo "A frase").
export const fraseDoModelo = (m, frente) => (m && m.textos && m.textos[frente] && m.textos[frente].frase) || '';
