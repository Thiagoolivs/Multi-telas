/*
 * A PEÇA CABE? SOZINHO, EM TODA PEÇA QUE A IA ENTREGA.
 *
 * O conferidor (js/peca-conferir.js) só rodava quando alguém abria o editor
 * da peça, e Meus Designs fazia um redesenho sozinho. O resultado do Criar
 * e a Criação rápida — que publica logo depois de gerar — iam sem
 * conferência nenhuma: a manchete saindo da borda chegava na TV, e ninguém
 * sabia.
 *
 * Agora, em toda peça em HTML, nesta ordem:
 *   1. confere (no navegador, fora da vista, no tamanho real da TV);
 *   2. não coube: UMA volta à IA para redesenhar com a medida
 *      (POST /api/ai/refazer-peca), e confere de novo;
 *   3. nem assim: a peça-ouro aprovada do papel, com os mesmos textos
 *      (POST /api/pecas/reserva), conferida também;
 *   4. nem assim: a peça fica marcada, com o que não coube, para a pessoa
 *      decidir. Nada vai para a TV sem caber sem que ela saiba.
 *
 * Sem import nenhum: quem chama passa como conferir, refazer e pôr a
 * reserva (o painel usa os de lib/pecaHtml.js e api.js; o teste, falsos).
 */

/*
 * O que é "não cabe": sai da peça, fica por cima de outro texto, ou é
 * cortado por dentro (o que a bancada também recusa). As regras de
 * composição (letra mínima, margem) são da régua de quem desenha: a peça
 * aprovada já pode trazer uma, e elas não pedem redesenho sozinhas.
 * `nomeDe(formato)` e `rotulo(campo)` dizem os nomes na língua de quem usa.
 */
export function naoCabe(conferencia, nomeDe, rotulo) {
  const f = nomeDe || ((x) => x);
  const r = rotulo || ((x) => x);
  return Object.entries(conferencia || {}).flatMap(([formato, c]) => {
    const m = c || {};
    return [
      ...(m.fora || []).map((n) => f(formato) + ': "' + r(n) + '" passa da borda'),
      ...(m.juntos || []).map((par) => f(formato) + ': ' + String(par).split(' × ').map(r).join(' e ') + ' ficam um sobre o outro'),
      ...(m.cortados || []).map((x) => {
        const c2 = /^(.+?) \((.+)\)$/.exec(String(x));
        return f(formato) + ': "' + r(c2 ? c2[1] : x) + '" fica cortado';
      }),
    ];
  });
}

// A mesma peça (mesmo desenho e mesmos textos) só é conferida uma vez, mesmo em dois formatos.
export const chaveDaPeca = (item) => {
  const it = item || {};
  return [it.html || '', it.css || '', JSON.stringify(it.campos || {}), JSON.stringify(it.marca || null), it.modo || '', JSON.stringify(it.ocultos || [])].join('\u0001');
};

/*
 * Um de cada vez: conferir monta a peça três vezes no tamanho da TV, e
 * duas ao mesmo tempo disputariam a página (e a medida).
 */
export function umDeCadaVez() {
  let fim = Promise.resolve();
  return (fn) => {
    const vez = fim.then(fn, fn);
    fim = vez.catch(() => {});
    return vez;
  };
}

/*
 * Uma peça pelos quatro passos. `deps`:
 *   conferir(item)          → avisos de "não cabe" ([] = cabe)
 *   refazer(item, avisos)   → a peça redesenhada (ou null)
 *   reserva(item)           → a peça-ouro com os textos dela (ou null)
 *   podeRefazer(item)       → false quando a IA já tentou esta peça
 *   onFase(fase, avisos)    'conferindo' | 'refazendo' | 'reserva'
 * Devolve { estado, item, avisos, antes }:
 *   'cabe'         a peça como veio;
 *   'redesenhada'  a IA redesenhou e coube (item novo);
 *   'reserva'      entrou a peça-ouro (item novo);
 *   'nao-cabe'     nada coube: item é a melhor das tentativas, avisos o que falta;
 *   'sem-conferir' o conferidor não abriu (sem rede, navegador sem canvas):
 *                  a peça segue como veio, e quem chama diz que não conferiu.
 * Falha de rede no redesenho ou na reserva não derruba: vai para o passo seguinte.
 */
export async function garantirEncaixe(item, deps) {
  const d = deps || {};
  const fase = d.onFase || (() => {});
  fase('conferindo', []);
  let avisos;
  try { avisos = await d.conferir(item); } catch (e) { return { estado: 'sem-conferir', item, avisos: [], antes: [] }; }
  if (!avisos.length) return { estado: 'cabe', item, avisos: [], antes: [] };
  const antes = avisos;
  let melhor = { item, avisos };
  if (d.refazer && (!d.podeRefazer || d.podeRefazer(item))) {
    fase('refazendo', avisos);
    let novo = null;
    try { novo = await d.refazer(item, avisos); } catch (e) { novo = null; }
    if (novo) {
      let a2 = null;
      try { a2 = await d.conferir(novo); } catch (e) { a2 = null; }
      if (a2 && !a2.length) return { estado: 'redesenhada', item: novo, avisos: [], antes };
      // A redesenhada que erra menos fica no lugar da que veio, se nada couber.
      if (a2 && a2.length < melhor.avisos.length) melhor = { item: novo, avisos: a2 };
    }
  }
  if (d.reserva) {
    fase('reserva', melhor.avisos);
    let r = null;
    try { r = await d.reserva(item); } catch (e) { r = null; }
    if (r) {
      let a3 = null;
      try { a3 = await d.conferir(r); } catch (e) { a3 = null; }
      if (a3 && !a3.length) return { estado: 'reserva', item: r, avisos: [], antes };
    }
  }
  return { estado: 'nao-cabe', item: melhor.item, avisos: melhor.avisos, antes };
}

/*
 * Várias peças. `lista`: [{ chave, item }]. Cada peça diferente passa uma
 * vez pelos quatro passos (a repetida usa o resultado da primeira); até
 * `juntas` ao mesmo tempo, para o redesenho de uma (uns 20 s na IA) não
 * segurar a conferência das outras — o conferir em si é um de cada vez.
 * `onPeca(chave, { fase, avisos } | resultado)` a cada passo; devolve
 * { [chave]: resultado }.
 */
export async function garantirTodas(lista, deps, opcoes) {
  const o = opcoes || {};
  const d = deps || {};
  const vez = umDeCadaVez();
  const conferir = (item) => vez(() => d.conferir(item));
  const avisar = o.onPeca || (() => {});
  const porDesenho = new Map();
  const saida = {};
  const fila = (lista || []).slice();
  async function trabalhar() {
    while (fila.length) {
      const { chave, item } = fila.shift();
      const k = chaveDaPeca(item);
      if (!porDesenho.has(k)) {
        porDesenho.set(k, garantirEncaixe(item, Object.assign({}, d, { conferir, onFase: (fase, avisos) => avisar(chave, { fase, avisos }) })));
      } else avisar(chave, { fase: 'conferindo', avisos: [] });
      const r = await porDesenho.get(k);
      saida[chave] = r;
      avisar(chave, r);
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, Math.min(o.juntas || 2, fila.length)) }, trabalhar));
  return saida;
}

/*
 * A IA já tentou redesenhar esta peça neste navegador? (A campanha aberta
 * de novo amanhã não gasta outra chamada na mesma peça que não coube.)
 * O que fica guardado é só um número tirado do desenho, nunca o conteúdo.
 */
const GUARDA = 'mt-encaixe-tentado';
function numeroDe(s) { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0; return h.toString(36); }
export function lembrarTentativa(armazem) {
  const a = armazem || (typeof localStorage !== 'undefined' ? localStorage : null);
  const ler = () => { try { return JSON.parse((a && a.getItem(GUARDA)) || '[]'); } catch (e) { return []; } };
  return {
    pode: (item) => ler().indexOf(numeroDe(chaveDaPeca(item))) < 0,
    marcar: (item) => {
      try {
        const l = ler().filter((x) => x !== numeroDe(chaveDaPeca(item)));
        l.push(numeroDe(chaveDaPeca(item)));
        if (a) a.setItem(GUARDA, JSON.stringify(l.slice(-200)));
      } catch (e) { /* navegador sem armazenamento: tenta de novo da próxima vez, e só */ }
    },
  };
}

// O que dizer de cada resultado, numa linha (o selo da peça).
export const FRASE = {
  conferindo: 'conferindo se cabe…',
  refazendo: 'não coube — a IA está redesenhando…',
  reserva: 'não coube — pondo o modelo aprovado…',
  cabe: 'cabe na TV',
  redesenhada: 'redesenhada para caber',
  'reserva-pronta': 'entrou o modelo aprovado, para caber',
  'nao-cabe': 'não cabe',
  'sem-conferir': 'não deu para conferir',
};
export function fraseDoEstado(r) {
  if (!r) return '';
  if (r.estado === 'reserva') return FRASE['reserva-pronta'];
  return FRASE[r.estado] || FRASE[r.fase] || '';
}
