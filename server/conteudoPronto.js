/*
 * A GALERIA DO CONTEÚDO PRONTO (fase 9).
 *
 * O manifesto (pecas-ouro/manifesto.json) vem com o código e traz cada tela
 * pronta e cada peça-ouro com o estado de quando foi desenhada: "proposta",
 * "rascunho" ou "aprovada". Antes, aprovar era editar o arquivo à mão e
 * esperar um deploy. Agora o operador decide na galeria (Plataforma ›
 * Conteúdo pronto), a decisão fica no banco (tabela conteudo_pronto) e o
 * manifesto servido em /pecas-ouro/manifesto.json já sai com ela: o painel, a
 * bancada e as contas novas veem na hora o que foi aprovado.
 *
 * Sem decisão no banco, vale o estado do arquivo — o que o CI e a régua
 * conferem (o banco do CI é vazio).
 */
const fs = require('fs');
const path = require('path');

const ESTADOS = ['aprovada', 'recusada', 'proposta'];
const TIPOS = { peca: 'pecas', tela: 'telas' };

let guardado = null; // { mtime, dados }
function lerManifesto(raiz) {
  const arq = path.join(raiz, 'pecas-ouro', 'manifesto.json');
  const st = fs.statSync(arq);
  if (guardado && guardado.mtime === st.mtimeMs) return guardado.dados;
  const dados = JSON.parse(fs.readFileSync(arq, 'utf8'));
  guardado = { mtime: st.mtimeMs, dados };
  return dados;
}

// O manifesto com as decisões do banco por cima. Não muda o recebido.
function aplicarDecisoes(manifesto, decisoes) {
  const por = new Map((decisoes || []).map((d) => [d.tipo + ':' + d.id, d]));
  const com = (tipo) => (item) => {
    const d = por.get(tipo + ':' + item.id);
    if (!d) return item;
    const dia = new Date(Number(d.decidido_em) || Date.now()).toISOString().slice(0, 10);
    return Object.assign({}, item, {
      estado: d.estado,
      decidido: { por: d.decidido_por || '', em: Number(d.decidido_em) || 0 },
      aprovadaEm: d.estado === 'aprovada' ? (item.estado === 'aprovada' && item.aprovadaEm ? item.aprovadaEm : dia) : undefined,
    });
  };
  return Object.assign({}, manifesto, {
    pecas: (manifesto.pecas || []).map(com('peca')),
    telas: (manifesto.telas || []).map(com('tela')),
  });
}

// A decisão pedida faz sentido? Devolve o erro em palavras, ou null.
function conferirDecisao(manifesto, tipo, id, estado) {
  if (!TIPOS[tipo]) return 'tipo desconhecido (peca ou tela)';
  if (!ESTADOS.includes(estado)) return 'estado desconhecido (aprovada, recusada ou proposta)';
  const existe = (manifesto[TIPOS[tipo]] || []).some((x) => x.id === id);
  if (!existe) return (tipo === 'tela' ? 'tela' : 'peça') + ' não existe no manifesto';
  return null;
}

/*
 * As peças que uma tela usa (lote 3: a tela aprovada só aparece para as
 * contas com as peças dela aprovadas). Aprovar a tela aprova junto as que
 * ainda esperam; uma peça já recusada fica recusada — a decisão é do dono.
 */
function pecasDaTela(manifesto, id) {
  const tela = (manifesto.telas || []).find((t) => t.id === id);
  const ids = new Set();
  for (const z of Object.values((tela && tela.zonas) || {})) for (const p of (z && z.pecas) || []) if (p && p.id) ids.add(p.id);
  return [...ids];
}
const esperando = (e) => !e || e === 'proposta' || e === 'rascunho';

module.exports = { ESTADOS, TIPOS, lerManifesto, aplicarDecisoes, conferirDecisao, pecasDaTela, esperando };
