/*
 * O QUE A IA ESTÁ CRIANDO (EXECUTOR D11).
 *
 * As gerações rodam no servidor (server/jobs.js) e sobrevivem à aba fechada.
 * Mas quem saía do Criar no meio de uma campanha não tinha onde ver o
 * andamento, nem ficava sabendo quando terminava. Aqui fica a lista (a aba
 * "Criando" e o número na aba), e o aviso "ficou pronta" em qualquer página.
 *
 * Um observador só, para o painel inteiro: pergunta de 3 em 3 segundos
 * enquanto há trabalho rodando e de 30 em 30 quando não há (alguém pode ter
 * começado em outra aba ou no celular). Com a aba escondida, sempre 30.
 */
import { useSyncExternalStore } from 'react';
import { ai } from '../api.js';
import { aviso } from './avisos.js';

let lista = null;                 // null = ainda não perguntou
const ouvintes = new Set();
const vistos = new Map();         // id -> estado da última vez
let timer = null;
let ligado = false;
let ir = null;                    // (pagina, params) => void, do App
let paginaAtual = () => '';

// O nome e o gênero: "a campanha ficou pronta", "o kit de marca ficou pronto".
const NOME = {
  campanha: ['A campanha', 'a'], 'campanha-simples': ['A campanha', 'a'], director: ['A campanha', 'a'],
  imagem: ['A imagem', 'a'], 'kit-de-marca': ['O kit de marca', 'o'], conteudo: ['O conteúdo', 'o'],
  quiz: ['O quiz', 'o'],
};
export const nomeDoTipo = (t) => (NOME[t] || ['A criação'])[0];
export const frasePronto = (t) => nomeDoTipo(t) + ' ficou pront' + ((NOME[t] || [0, 'a'])[1]) + '.';

/*
 * Para onde o "Abrir" leva. A página que acompanha a própria geração já
 * avisa (o Criar mostra o resultado; Meus Designs, a pasta): ali o aviso
 * daqui seria repetido.
 */
export function destino(j) {
  if (j.campanha && j.campanha.id) return ['campanhas', { campanha: j.campanha.id }];
  if (j.tipo === 'imagem') return ['ia', {}];
  return ['designs', {}];
}
// O quiz é escrito com o editor da TV aberto, e ele mesmo mostra as perguntas: aviso seria ruído.
const quemJaAvisa = { campanha: ['criar'], 'campanha-simples': ['designs'], director: ['designs', 'rapida'], imagem: ['designs'], quiz: ['content'] };

function emitirMudanca() { ouvintes.forEach((f) => f()); }

function avisarSeTerminou(j) {
  const antes = vistos.get(j.id);
  vistos.set(j.id, j.estado);
  /*
   * Avisa quando termina: o que estava rodando, e também o trabalho NOVO
   * (que não existia ao abrir o painel) que já aparece terminado — uma imagem
   * rápida termina entre duas perguntas e nunca é vista "rodando".
   */
  if (j.estado === 'rodando' || (antes !== undefined && antes !== 'rodando')) return;
  if ((quemJaAvisa[j.tipo] || []).includes(paginaAtual())) return;
  const brief = (j.pedido && j.pedido.brief) || '';
  if (j.estado === 'pronto') {
    const [pagina, params] = destino(j);
    aviso.pronto('trabalho:' + j.id, frasePronto(j.tipo), (j.campanha && j.campanha.nome) || brief,
      ir ? { rotulo: 'Abrir', on: () => ir(pagina, params) } : undefined);
  } else if (j.estado === 'erro') {
    aviso.erro('trabalho:' + j.id, nomeDoTipo(j.tipo) + ' não saiu.', j.erro || 'Tente de novo em instantes.');
  }
}

async function perguntar() {
  clearTimeout(timer);
  try {
    const r = await ai.trabalhos();
    const itens = (r && r.itens) || [];
    // Na primeira leitura só se registra: o que já tinha terminado antes não vira aviso agora.
    if (lista === null) itens.forEach((j) => vistos.set(j.id, j.estado));
    else itens.forEach(avisarSeTerminou);
    lista = itens;
    emitirMudanca();
  } catch (e) { /* sem rede: tenta de novo no próximo ciclo */ }
  agendar();
}

function agendar() {
  if (!ligado) return;
  clearTimeout(timer);
  const rodando = (lista || []).some((j) => j.estado === 'rodando');
  const escondida = typeof document !== 'undefined' && document.visibilityState === 'hidden';
  timer = setTimeout(perguntar, rodando && !escondida ? 3000 : 30000);
}

// O App liga depois do login, com a navegação (para o "Abrir") e a página atual.
export function ligarTrabalhos(navegar, pagina) {
  ir = navegar;
  if (pagina) paginaAtual = pagina;
  if (ligado) return;
  ligado = true;
  perguntar();
  if (typeof document !== 'undefined') document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') perguntar(); });
  if (typeof window !== 'undefined') window.addEventListener('mt:trabalho', acordarTrabalhos);
}

export function desligarTrabalhos() {
  ligado = false; clearTimeout(timer); lista = null; vistos.clear(); emitirMudanca();
}

// Quem acabou de começar uma geração chama: a lista anda já, sem esperar 30 s.
export function acordarTrabalhos() { if (ligado) setTimeout(perguntar, 600); }

export function useTrabalhos() {
  return useSyncExternalStore((f) => { ouvintes.add(f); return () => ouvintes.delete(f); }, () => lista);
}
