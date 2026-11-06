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
export function itemDoModelo(m, marca, frente) {
  const k = marca || {};
  const papel = (m.papeis && m.papeis[0]) || 'destaque';
  /*
   * Fase 9: o exemplo na língua da frente (`textos` no manifesto). A peça da
   * clínica, na fábrica, fala de segurança e refeitório, não de mamografia;
   * a da padaria, na clínica, de horário da recepção, não de pão quente.
   */
  const daFrente = (frente && m.textos && m.textos[frente]) || {};
  const campos = { ...daFrente, ...(k.nome && /data-campo="marca"/.test(m.arq.html) ? { marca: k.nome } : {}) };
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
/*
 * Fase 9: cada peça diz as frentes que ela atende (`frentes` no manifesto).
 * A loja não vê o aniversariante da fábrica, e a fábrica não vê "Pão quente
 * o dia todo" — antes a ordem mudava, mas tudo aparecia para todos. Peça sem
 * `frentes` (as antigas) serve a todas.
 */
export const daFrente = (modelos, perfil) => modelos.filter((m) => !Array.isArray(m.frentes) || !m.frentes.length || m.frentes.includes(perfil));

export function ordenarPorPerfil(modelos, perfil) {
  const ordem = ORDEM[perfil] || ORDEM.comercio;
  const pos = (f) => { const i = ordem.indexOf(f); return i < 0 ? 99 : i; };
  return modelos.slice().sort((a, b) => pos(a.familia) - pos(b.familia));
}

/*
 * FASE 10: O RAMO, E NÃO SÓ A FRENTE (reteste do bloco 8).
 *
 * A frente separa a loja da clínica e da fábrica, mas não a padaria da
 * ótica: no Comércio, a padaria abria os modelos com "Óculos de sol",
 * "Escolha o seu par" e "Coloração com desconto". Cada peça tem a marca de
 * exemplo (`marca` no manifesto: otica, padaria, salao…), e a conta tem o
 * ramo que a Marca deduziu (GET /api/brand, js/paletas.js RAMOS).
 *
 * Que marcas de exemplo servem a cada ramo. A mesma ligação das telas
 * prontas do manifesto (`ramos`), mais a lanchonete e a Rota Sul.
 */
export const MARCAS_DO_RAMO = {
  otica: ['otica'], padaria: ['padaria'], beleza: ['salao'], barbearia: ['salao'],
  comida: ['lanchonete', 'restaurante'], saude: ['clinica', 'dentista', 'farmacia'],
  corporativo: ['rotasul', 'escritorio', 'industria'],
};

/*
 * A peça é de UM negócio quando o texto de exemplo só faz sentido nele (óculos,
 * pão, coloração). Oferta e cardápio são assim por natureza; das outras
 * famílias, só as listadas. O horário, as redes, a avaliação, o aviso, o
 * cabeçalho e o rodapé servem a qualquer um. Peça cujo texto já foi escrito
 * para a frente da conta (`textos[frente]`) também serve.
 */
const DE_UM_NEGOCIO = new Set(['servico-agenda', 'servico-passos', 'servico-alerta', 'institucional-lancamento', 'institucional-foto', 'manifesto', 'cabecalho-chamada', 'rodape-selo']);
const SERVEM_A_TODOS = new Set(['lateral-prazo']);
export function negocioDoModelo(m, frente) {
  if (!m || !m.marca) return '';
  if (frente && m.textos && m.textos[frente]) return '';
  const deUm = DE_UM_NEGOCIO.has(m.id) || ((m.familia === 'oferta' || m.familia === 'cardápio') && !SERVEM_A_TODOS.has(m.id));
  return deUm ? m.marca : '';
}

/*
 * Os modelos em dois grupos: `meus` (os do ramo da conta primeiro, depois os
 * que servem a qualquer negócio) e `outros` (os de outro negócio, que só
 * aparecem no "Ver também os de outros negócios"). A ordem de cada grupo é a
 * que veio (a da família, por perfil).
 */
export function separarPorRamo(modelos, ramo, frente) {
  const doRamo = MARCAS_DO_RAMO[ramo] || [];
  const meus = [];
  const genericos = [];
  const outros = [];
  for (const m of modelos || []) {
    if (doRamo.includes(m.marca)) meus.push(m);
    else if (negocioDoModelo(m, frente)) outros.push(m);
    else genericos.push(m);
  }
  return { meus: meus.concat(genericos), outros };
}

