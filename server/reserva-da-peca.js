/*
 * server/reserva-da-peca.js — a peça-ouro no lugar da peça que não coube
 * (POST /api/pecas/reserva; o painel: web/src/lib/encaixeAuto.js).
 *
 * O resultado do Criar e da Criação rápida é conferido no navegador (a peça
 * cabe na TV?); o que não coube volta uma vez para a IA redesenhar. Se nem
 * assim couber, entra a peça-ouro APROVADA do papel, com os textos da peça
 * — a mesma reserva que o diretor usa quando a IA falha
 * (compositor.preencherPapel). Sem IA, sem custo.
 *
 * Só quando a reserva leva TODOS os textos da peça. Ela sabe kicker,
 * título, apoio e chamada; uma peça com preço, lista de itens ou dias da
 * semana perderia o preço — pior que uma peça marcada para revisar. Aí a
 * resposta é null, e o painel marca a peça para a pessoa.
 */
'use strict';
const compositor = require('./compositor');

// Para onde vai cada campo de texto da peça na reserva (a ordem decide quem fica com o título).
const PARA = {
  kicker: 'kicker', selo: 'kicker', rotulo: 'kicker',
  titulo: 'titulo', titulo2: 'titulo',
  apoio: 'apoio', sub: 'apoio', detalhe: 'apoio', frase: 'apoio', nota: 'apoio',
  cta: 'cta', quando: 'cta',
};
// O nome da empresa vem da conta; o da peça só serve quando a conta não tem.
const DA_CONTA = ['marca', 'assinatura'];

/*
 * Os textos da peça no formato da reserva ({ kicker, titulo, apoio, cta }),
 * ou null quando algum texto não teria para onde ir.
 */
function textosDaReserva(item) {
  const t = compositor.textosDaPeca(item);
  const out = { kicker: '', titulo: '', apoio: '', cta: '' };
  let empresa = '';
  for (const nome of Object.keys(t)) {
    const texto = String(t[nome] || '').replace(/\s+/g, ' ').trim();
    if (!texto) continue;
    if (DA_CONTA.indexOf(nome) >= 0) { empresa = empresa || texto; continue; }
    // A "chamada" é o texto principal da faixa (cabeçalho) e a chamada para ação no resto.
    const para = nome === 'chamada' ? (t.titulo ? 'cta' : 'titulo') : PARA[nome];
    if (!para) return null;
    out[para] = out[para] ? out[para] + ' ' + texto : texto;
  }
  if (!out.titulo) return null;
  return { textos: out, empresa };
}

/*
 * A peça-ouro do papel com os textos de `item`, pronta para a TV (passou
 * pela porta: é o arquivo aprovado mais o CSS de ajuste do compositor), ou
 * null. `conta`: { empresa, logo }. A peça que já É a reserva (motor
 * 'ouro') não tem outra para pôr no lugar.
 */
function daPeca(item, conta) {
  const it = item && typeof item === 'object' ? item : {};
  if (it.type !== 'peca-html' || !it.html) return null;
  if (it.origem && it.origem.motor === 'ouro') return null;
  const lido = textosDaReserva(it);
  if (!lido) return null;
  const c = conta || {};
  const foto = it.campos && typeof it.campos.foto === 'string' && it.campos.foto ? it.campos.foto : null;
  const r = compositor.preencherPapel({
    papel: it.papel, textos: lido.textos, empresa: c.empresa || lido.empresa || '', logo: c.logo || '',
    marca: it.marca || null, modo: it.modo || 'escuro', foto, pedido: (it.origem && it.origem.pedido) || '',
  });
  const saida = Object.assign({}, r, { formato: it.formato || r.formato || '16/9' });
  /*
   * Nenhum texto se perde no caminho: a faixa e a lateral cortam o texto
   * comprido na palavra (compositor.cortarNaPalavra), e a peça cortada
   * diria outra coisa. Aí não há reserva.
   */
  const junto = (s) => String(s || '').replace(/\s+/g, ' ').trim();
  const nela = junto(Object.values(compositor.textosDaPeca(saida)).join(' '));
  if (Object.values(lido.textos).some((v) => v && nela.indexOf(junto(v)) < 0)) return null;
  // O carimbo da reserva sem foto diz "Novidade" quando a peça não tinha kicker: palavra que ninguém escreveu, fica escondida.
  if (!lido.textos.kicker && saida.campos && saida.campos.selo === 'Novidade') saida.ocultos = ['selo'];
  // O ponto que importa na foto (e a miniatura do fundo) continuam valendo na foto que continua.
  if (foto && r.campos && r.campos.foto === foto && it.espacos && it.espacos.foto) saida.espacos = { foto: it.espacos.foto };
  return saida;
}

module.exports = { daPeca, textosDaReserva };
