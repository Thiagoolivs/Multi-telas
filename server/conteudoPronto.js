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

/*
 * O PACOTE DO PRONTOS (reteste 2): o "Prontos para você" levava 7,4 s no 4G
 * lento — o manifesto e depois cada peça aprovada num pedido (43 pedidos,
 * cada um com a latência inteira do celular). Agora vai tudo num só:
 * GET /pecas-ouro/pacote.json = { manifesto (com as decisões), html: { id:
 * texto } } das peças aprovadas, comprimido (brotli/gzip, server/compressao.js)
 * e com ETag. Montado na primeira vez e guardado; muda quando muda o
 * manifesto, uma decisão da galeria ou um arquivo de peça.
 */
const crypto = require('crypto');
const ID_DE_PECA = /^[a-z0-9][a-z0-9-]*$/i;
let pacoteGuardado = null; // { chave, corpo, etag }
function montarPacote(raiz, decisoes) {
  const manifesto = aplicarDecisoes(lerManifesto(raiz), decisoes);
  const aprovadas = (manifesto.pecas || []).filter((p) => p && ID_DE_PECA.test(String(p.id || '')) && (!p.estado || p.estado === 'aprovada'));
  const arquivo = (id) => path.join(raiz, 'pecas-ouro', id + '.html');
  const datas = aprovadas.map((p) => { try { return fs.statSync(arquivo(p.id)).mtimeMs; } catch (e) { return 0; } });
  const chave = (guardado ? guardado.mtime : 0) + '|' + JSON.stringify(decisoes || []) + '|' + aprovadas.map((p, i) => p.id + '@' + datas[i]).join(',');
  if (pacoteGuardado && pacoteGuardado.chave === chave) return pacoteGuardado;
  const html = {};
  for (const p of aprovadas) { try { html[p.id] = fs.readFileSync(arquivo(p.id), 'utf8'); } catch (e) { /* a peça que falta fica de fora */ } }
  /*
   * O cliente só vê o aprovado (lib/modelosOuro.js e lib/telasProntas.js
   * filtram pelo estado): o que espera a galeria fica de fora do pacote —
   * eram 90 telas e 55 peças "proposta" a mais em cada abertura. O manifesto
   * inteiro continua em /pecas-ouro/manifesto.json (a bancada, o operador).
   */
  const doCliente = Object.assign({}, manifesto, { soAprovadas: true, pecas: aprovadas,
    telas: (manifesto.telas || []).filter((t) => t && t.estado === 'aprovada') });
  const corpo = Buffer.from(JSON.stringify({ manifesto: doCliente, html }));
  const etag = '"' + crypto.createHash('sha256').update(corpo).digest('hex').slice(0, 32) + '"';
  pacoteGuardado = { chave, corpo, etag };
  return pacoteGuardado;
}

module.exports = { ESTADOS, TIPOS, lerManifesto, aplicarDecisoes, conferirDecisao, pecasDaTela, esperando, montarPacote };
