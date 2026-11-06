/*
 * arrumarVolta.js — "Arrumar a volta" (reteste do bloco 3, cenário 7).
 *
 * A TV que juntou 30 peças leva uns 7 minutos para dar a volta: no balcão a
 * pessoa fica 2 a 5 e não vê quase nada. O resumo da TV já avisava
 * (lib/screenDigest.js), mas limpar era uma peça de cada vez. Aqui sai a
 * lista do que pode sair, cada uma com o porquê:
 *
 *   vencida  — o agendamento acabou (dataFim antes de hoje) ou o prazo passou;
 *   exemplo  — o texto de exemplo do modelo (meta.exemplo), que nem passa na TV;
 *   repetida — o mesmo título ou texto de outra peça da parte (fica a mais nova);
 *   antiga   — o que ainda passa do tempo do lugar, das mais antigas para as novas.
 *
 * Nada aqui grava: a pessoa marca e desmarca (components/tela/ArrumarVolta.jsx)
 * e o que sai vai pelo caminho de sempre do "Pôr na TV" (com a aprovação, se a
 * conta pedir), com Desfazer. Puro, para os testes (test/arrumar-volta.test.js).
 */
// A volta é a mesma conta da TV e do resumo (js/rodizio.js).
import '../../../js/rodizio.js';

const R = globalThis.MTRodizio;

const MOTIVOS = ['vencida', 'exemplo', 'repetida', 'antiga'];

// O dia na loja, como a TV conta o agendamento (AAAA-MM-DD, no relógio de quem olha o painel).
export function diaDe(agoraMs) {
  const d = new Date(Number(agoraMs) || Date.now());
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
const diaCurto = (iso) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || '')); return m ? m[3] + '/' + m[2] : ''; };

const fixa = (item) => { const d = Number(item && item.duracao); return !(Number.isFinite(d) && d > 0); };
const exemplo = (item) => !!(item && item.meta && item.meta.exemplo);

/*
 * Quanto a parte leva para dar a volta sem as peças `fora` (índices da lista
 * da zona), em segundos — a MESMA conta do resumo da TV (lib/screenDigest.js):
 * o exemplo não conta, e uma peça fixa (duração 0) prende a parte (0).
 */
export function voltaSem(itens, fora, agoraMs) {
  const tirar = fora instanceof Set ? fora : new Set(fora || []);
  const resto = (itens || []).filter((it, i) => it && !tirar.has(i));
  if (!R || !resto.length || resto.some(fixa)) return 0;
  const durR = (i) => R.duracaoDe(i, i.duracao);
  const noAr = resto.filter((i) => !exemplo(i));
  return R.tempoDaVolta(R.distribuir(noAr, { agoraMs: Number(agoraMs) || Date.now() }, durR), durR);
}

// O texto que a pessoa lê na peça, para achar a repetida ("mesmo título ou texto").
const CAMPOS_DE_TEXTO = ['titulo', 'title', 'texto', 'text', 'corpo', 'mensagem', 'legenda', 'caption', 'chamada', 'detalhe'];
const CAMPOS_DE_MIDIA = ['src', 'url', 'imagem', 'videoId'];
const limpo = (s) => String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
export function chaveDoTexto(item) {
  if (!item || typeof item !== 'object') return '';
  const partes = [];
  for (const k of CAMPOS_DE_TEXTO) if (typeof item[k] === 'string' && limpo(item[k])) partes.push(limpo(item[k]));
  // A peça pronta (peca-html) e a da IA: o texto está nos campos.
  if (item.campos && typeof item.campos === 'object') {
    for (const k of Object.keys(item.campos).sort()) {
      const v = item.campos[k];
      if (typeof v === 'string' && limpo(v) && !/^(https?:|data:|\/)/.test(v)) partes.push(limpo(v));
    }
  }
  // A arte do editor livre: os textos dela.
  if (Array.isArray(item.elementos)) {
    for (const e of item.elementos) if (e && e.tipo === 'texto' && limpo(e.text)) partes.push(limpo(e.text));
  }
  if (!partes.length) for (const k of CAMPOS_DE_MIDIA) if (typeof item[k] === 'string' && item[k].trim()) partes.push(item[k].trim());
  return partes.length ? (item.type || '') + '|' + partes.join('|') : '';
}

function vencida(item, agoraMs, hoje) {
  const a = item && item.agendamento;
  if (a && a.ativo && a.dataFim && String(a.dataFim) < hoje) return 'O prazo acabou em ' + diaCurto(a.dataFim) + '.';
  const fim = Number(item && item.meta && item.meta.expiraEm);
  if (fim > 0 && fim <= agoraMs) return 'O prazo acabou em ' + diaCurto(diaDe(fim)) + '.';
  return '';
}

// Pode sair por ser antiga? O que a Agenda e os automáticos põem sai sozinho; o urgente e a Alta, a pessoa decide.
function podeSairPorIdade(item) {
  if (!item || item._calendario || item._automatico) return false;
  const p = item.meta && item.meta.prioridade;
  return p !== 'urgente' && p !== 'alta';
}

/*
 * O que pode sair desta parte para a volta caber em `maxSeg` (o teto do lugar).
 * Devolve { pecas: [{ indice, motivo, texto }], antes, depois, maxSeg } — `pecas`
 * na ordem da parte, todas sugeridas (a pessoa desmarca o que quer manter);
 * `depois` é a volta sem elas. Nunca sugere tirar todas: a parte vazia mostra
 * só o relógio, o que é pior que a volta longa.
 */
export function pecasParaTirar(itens, { maxSeg, agoraMs } = {}) {
  const agora = Number(agoraMs) || Date.now();
  const hoje = diaDe(agora);
  const lista = (itens || []).map((item, indice) => ({ item, indice })).filter((x) => x.item);
  const marcadas = new Map();
  const marcar = (indice, motivo, texto) => { if (!marcadas.has(indice)) marcadas.set(indice, { indice, motivo, texto }); };

  for (const { item, indice } of lista) {
    const v = vencida(item, agora, hoje);
    if (v) marcar(indice, 'vencida', v);
    else if (exemplo(item)) marcar(indice, 'exemplo', 'É o texto de exemplo do modelo: não passa na TV.');
  }
  // A repetida: fica a mais nova (a de baixo, que entrou por último).
  const vistas = new Set();
  for (let k = lista.length - 1; k >= 0; k--) {
    const { item, indice } = lista[k];
    if (marcadas.has(indice)) continue;
    const chave = chaveDoTexto(item);
    if (!chave) continue;
    if (vistas.has(chave)) marcar(indice, 'repetida', 'Igual a outra peça desta parte.');
    else vistas.add(chave);
  }
  // Ainda longa: das mais antigas (o dia em que entrou, senão a ordem da parte) até caber.
  const teto = Number(maxSeg) || 0;
  if (teto > 0) {
    const idade = (x) => String((x.item.agendamento && x.item.agendamento.dataInicio) || '');
    const fila = lista.filter((x) => !marcadas.has(x.indice) && podeSairPorIdade(x.item))
      .sort((a, b) => (idade(a) < idade(b) ? -1 : idade(a) > idade(b) ? 1 : a.indice - b.indice));
    for (const x of fila) {
      if (voltaSem(itens, new Set(marcadas.keys()), agora) <= teto) break;
      marcar(x.indice, 'antiga', 'Uma das mais antigas desta parte.');
    }
  }
  // Nunca todas: a mais nova que passa na TV fica.
  const ficam = lista.filter((x) => !marcadas.has(x.indice) && !exemplo(x.item));
  if (!ficam.length) {
    const ultima = [...lista].reverse().find((x) => !exemplo(x.item));
    if (ultima) marcadas.delete(ultima.indice);
  }
  const pecas = [...marcadas.values()].sort((a, b) => a.indice - b.indice);
  return { pecas, antes: voltaSem(itens, [], agora), depois: voltaSem(itens, pecas.map((p) => p.indice), agora), maxSeg: teto };
}

// A programação sem as peças escolhidas: { zona: [índices] }. Não mexe na recebida.
export function semAsPecas(cfg, foraPorZona) {
  const next = JSON.parse(JSON.stringify(cfg || {}));
  for (const [zona, indices] of Object.entries(foraPorZona || {})) {
    const z = next.zonas && next.zonas[zona];
    if (!z || !Array.isArray(z.items)) continue;
    const tirar = new Set(indices || []);
    z.items = z.items.filter((it, i) => !tirar.has(i));
  }
  return next;
}

export const NOME_DO_MOTIVO = { vencida: 'Prazo acabou', exemplo: 'Exemplo', repetida: 'Repetida', antiga: 'Antiga' };
export { MOTIVOS };
