/*
 * OS MODELOS PRONTOS (EXECUTOR D16): as peças-ouro (pecas-ouro/, as mesmas
 * que a IA usa de base e que o dono aprovou na bancada) para o cliente
 * escolher, já com a marca dele — cores, fontes, nome e logo.
 *
 * Antes, cliente novo abria Peças prontas e via "Nenhuma peça pronta ainda",
 * com 43 modelos aprovados guardados no servidor sem ninguém poder usar.
 */
import { carregarDesenhista } from './pecaHtml.js';

let cache = null;

// O manifesto e os arquivos, uma vez por sessão. Peça que não abre fica de fora.
export function carregarModelos() {
  if (!cache) {
    cache = carregarDesenhista()
      .then(() => fetch('/pecas-ouro/manifesto.json'))
      .then((r) => { if (!r.ok) throw new Error('não deu para abrir os modelos'); return r.json(); })
      .then(async (m) => {
        const lista = ((m && m.pecas) || []).filter((p) => !p.estado || p.estado === 'aprovada');
        const abertos = await Promise.all(lista.map((p) => fetch('/pecas-ouro/' + p.id + '.html')
          .then((r) => (r.ok ? r.text() : ''))
          .then((t) => (t ? { ...p, arq: globalThis.MTPecaHtml.doArquivo(t) } : null))
          .catch(() => null)));
        return abertos.filter(Boolean);
      })
      .catch((e) => { cache = null; throw e; });
  }
  return cache;
}

const FORMATO_DO_PAPEL = { destaque: '16/9', lateral: '9/16', cabecalho: '16/9', rodape: '16/9' };

/*
 * A peça do modelo, pronta para desenhar e para ir à TV: no modo "Cor da
 * marca", com as cores e as fontes da conta, e o nome dela onde o modelo
 * escreve a marca. A logo entra sozinha no lugar de logo (D8, MT_LOGO).
 */
export function itemDoModelo(m, marca) {
  const k = marca || {};
  const papel = (m.papeis && m.papeis[0]) || 'destaque';
  const campos = k.nome && /data-campo="marca"/.test(m.arq.html) ? { marca: k.nome } : {};
  return {
    type: 'peca-html', versao: 1, papel, html: m.arq.html, css: m.arq.css, campos,
    marca: { cores: k.cores || [], fonteTitulo: k.fonteTitulo || '', fonteApoio: k.fonteApoio || '' },
    modo: 'marca', formato: FORMATO_DO_PAPEL[papel] || '16/9', duracao: papel === 'lateral' ? 12 : 20,
    origem: { motor: 'ouro', base: m.id, pedido: 'modelo pronto' },
  };
}

/*
 * A ordem das famílias pelo tipo de negócio (D4): a fábrica vê primeiro o
 * comunicado e o aniversariante; a loja, a oferta e o cardápio; a clínica,
 * o serviço.
 */
const ORDEM = {
  comercio: ['oferta', 'cardápio', 'social', 'serviço', 'institucional', 'gente', 'cabeçalho', 'rodapé'],
  empresa: ['gente', 'serviço', 'institucional', 'social', 'oferta', 'cardápio', 'cabeçalho', 'rodapé'],
  saude: ['serviço', 'institucional', 'social', 'gente', 'oferta', 'cardápio', 'cabeçalho', 'rodapé'],
};
export function ordenarPorPerfil(modelos, perfil) {
  const ordem = ORDEM[perfil] || ORDEM.comercio;
  const pos = (f) => { const i = ordem.indexOf(f); return i < 0 ? 99 : i; };
  return modelos.slice().sort((a, b) => pos(a.familia) - pos(b.familia));
}
