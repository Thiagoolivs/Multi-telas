/*
 * server/qualidade.js — o relatório de qualidade das gerações (D43).
 *
 * Para saber o que a IA entrega fraco sem abrir o banco de ninguém (nota do
 * consultor no #135): o servidor CONTA, e só conta. Três perguntas:
 *
 *   refazer  quais peças voltaram para a IA porque não couberam (ou
 *            quebraram as regras de composição) — por peça-ouro, papel e
 *            o tipo do defeito;
 *   editado  quais campos o cliente mais mexe à mão depois que a peça sai —
 *            o NOME do campo ("titulo", "preco"), nunca o texto;
 *   pedido   o que mais pedem no Ajustar e no Editar com a IA — o tipo da
 *            mudança ("texto", "foto nova", "tirar"), nunca a frase.
 *
 * A contagem é por dia, sem conta e sem pessoa (tabela `qualidade`): não dá
 * para saber de quem é nada, e não precisa. Nada daqui vira texto de cliente
 * nem identifica cliente.
 */
'use strict';
const fs = require('node:fs');
const path = require('node:path');

/*
 * As chaves só se formam com nomes de LISTAS FECHADAS (nota do consultor no
 * #291): o item vem do navegador, e um cliente que inventasse ids de peça ou
 * nomes de campo encheria a tabela de chaves. A peça tem de ser uma
 * peça-ouro do manifesto; o campo, um dos que as peças-ouro declaram (e que
 * passa no NOME_CAMPO da porta). O resto vira "outra"/"outro".
 */
const PASTA = path.join(__dirname, '..', 'pecas-ouro');
const NOME_CAMPO = /^[a-z][a-z0-9-]{0,30}$/;
let listas = null;
function fechadas() {
  if (listas) return listas;
  const pecas = new Set();
  const campos = new Set(['foto', 'logo', 'estilo']);
  try {
    const m = JSON.parse(fs.readFileSync(path.join(PASTA, 'manifesto.json'), 'utf8'));
    for (const p of m.pecas || []) {
      pecas.add(p.id);
      const html = fs.readFileSync(path.join(PASTA, p.id + '.html'), 'utf8');
      for (const x of html.matchAll(/data-campo(?:-img|-qr)?="([^"]+)"/g)) if (NOME_CAMPO.test(x[1])) campos.add(x[1]);
    }
  } catch (e) { /* sem a biblioteca, tudo vira "outra" — a contagem não derruba nada */ }
  listas = { pecas, campos };
  return listas;
}

// A peça-ouro em que a peça nasceu; a que a IA compôs do zero é "ia"; id fora do manifesto é "outra".
function baseDa(item) {
  const o = (item && item.origem) || {};
  if (o.base) return fechadas().pecas.has(String(o.base)) ? String(o.base) : 'outra';
  return o.motor && o.motor !== 'ouro' ? 'ia' : 'outra';
}
const campoDe = (k) => (fechadas().campos.has(String(k)) ? String(k) : 'outro');

/*
 * O defeito que o painel mediu, em uma palavra. As frases vêm de
 * avisosDaConferencia (web/src/components/content/EditarPeca.jsx), que junta
 * o detector e as regras de composição (js/regras-composicao.js).
 */
const DEFEITOS = [
  ['vaza', /passa da borda/],
  ['sobrepoe', /um sobre o outro/],
  ['letra', /letra de \d+px/],
  ['margem', /encostado na borda/],
  ['foto', /sobre a foto/],
  ['contraste', /some no fundo/],
  ['qr', /\bQR\b/],
  ['hierarquia', /número da oferta/],
];
function defeitoDe(frase) {
  const s = String(frase || '');
  const d = DEFEITOS.find(([, re]) => re.test(s));
  return d ? d[0] : 'outro';
}

const PAPEIS = ['destaque', 'lateral', 'cabecalho', 'rodape'];

// Uma chave por defeito diferente: a peça que vazou em dois formatos conta uma vez como "vaza".
function chavesDoRefazer(item, problemas) {
  const base = baseDa(item);
  const papel = PAPEIS.includes(item && item.papel) ? item.papel : 'outra';
  const tipos = [...new Set((Array.isArray(problemas) ? problemas : []).slice(0, 20).map(defeitoDe))];
  return (tipos.length ? tipos : ['outro']).map((t) => ['refazer', base, papel, t].join('|'));
}

// Os campos que mudaram entre a peça como estava e como a pessoa salvou; trocar o estilo conta como "estilo".
function chavesDaEdicao(antes, depois) {
  const a = (antes && antes.campos) || {};
  const d = (depois && depois.campos) || {};
  const base = baseDa(antes || depois);
  const campos = [...new Set(Object.keys(a).concat(Object.keys(d)))]
    .filter((k) => String(a[k] == null ? '' : a[k]) !== String(d[k] == null ? '' : d[k]))
    .map(campoDe);
  if ((antes && antes.modo) !== (depois && depois.modo)) campos.push('estilo');
  return [...new Set(campos)].slice(0, 12).map((c) => ['editado', base, c].join('|'));
}

// Os tipos de server/ajuste.js (TIPOS) — lista fechada.
const TIPOS_DE_PEDIDO = ['texto', 'acrescentar', 'tirar', 'redes', 'letreiro', 'contagem'];

// O tipo do pedido, como server/ajuste.js entendeu. "refazer" se abre pelo que acontece com a foto.
function tipoDaMudanca(m) {
  if (!m || !m.tipo) return 'outro';
  if (m.tipo === 'refazer') return m.foto === 'trocar' ? 'foto-nova' : m.foto === 'usar' ? 'foto-minha' : m.foto === 'tirar' ? 'sem-foto' : 'redesenhar';
  return TIPOS_DE_PEDIDO.includes(m.tipo) ? m.tipo : 'outro';
}

/*
 * `onde`: 'ajustar' (a caixa rápida) ou 'editar' (a conversa). `acao` é o
 * que a conversa decidiu: 'fazer' conta as mudanças; 'perguntar' conta que a
 * IA precisou perguntar (pedido que ela não entendeu de primeira);
 * 'responder' sem mudança conta como "nada".
 */
function chavesDoPedido(onde, acao, mudancas) {
  const o = onde === 'editar' ? 'editar' : 'ajustar';
  if (acao === 'perguntar') return [['pedido', o, 'pergunta'].join('|')];
  const tipos = [...new Set((Array.isArray(mudancas) ? mudancas : []).map(tipoDaMudanca))];
  if (!tipos.length) return acao === 'confirmar' ? [] : [['pedido', o, 'nada'].join('|')];
  return tipos.slice(0, 8).map((t) => ['pedido', o, t].join('|'));
}

/*
 * Conta sem atrapalhar: quem chama não espera, e erro de contagem não pode
 * derrubar o refazer nem a edição de ninguém.
 */
function contar(db, chaves) {
  const lista = (chaves || []).filter(Boolean).slice(0, 20);
  if (!lista.length || !db || typeof db.contarQualidade !== 'function') return Promise.resolve();
  return db.contarQualidade(lista).catch(() => {});
}

// O dia de hoje (UTC), a chave da contagem.
const diaDe = (ms) => new Date(ms == null ? Date.now() : ms).toISOString().slice(0, 10);

/*
 * As linhas somadas ([{ chave, n }]) em três listas ordenadas, com a
 * participação de cada uma no seu grupo — "oferta-foto na lateral: 40% dos
 * refazer" diz onde mexer primeiro.
 */
function relatorio(linhas) {
  const grupos = { refazer: [], editado: [], pedido: [] };
  for (const l of linhas || []) {
    const partes = String(l && l.chave || '').split('|');
    const n = Number(l && l.n) || 0;
    if (!n || !grupos[partes[0]]) continue;
    if (partes[0] === 'refazer') grupos.refazer.push({ base: partes[1], papel: partes[2], defeito: partes[3], n });
    else if (partes[0] === 'editado') grupos.editado.push({ base: partes[1], campo: partes[2], n });
    else grupos.pedido.push({ onde: partes[1], tipo: partes[2], n });
  }
  const ordenar = (xs) => {
    const total = xs.reduce((s, x) => s + x.n, 0);
    return xs.sort((a, b) => b.n - a.n).slice(0, 30).map((x) => Object.assign(x, { parte: total ? Math.round((x.n / total) * 1000) / 10 : 0 }));
  };
  return { refazer: ordenar(grupos.refazer), editado: ordenar(grupos.editado), pedido: ordenar(grupos.pedido) };
}

module.exports = { chavesDoRefazer, chavesDaEdicao, chavesDoPedido, defeitoDe, baseDa, contar, relatorio, diaDe };
