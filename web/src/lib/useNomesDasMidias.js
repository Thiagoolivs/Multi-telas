/*
 * A lista dos nomes originais das Mídias da conta, carregada UMA vez e
 * guardada (o nome das fotos e vídeos de antes: lib/nomesDasMidias.js).
 *
 * O freio da conta (server/limites.js) conta cada pedido: a fila da TV, a
 * semana da Agenda e a Programação pedem os nomes, e todas leem daqui — um
 * pedido por visita, de novo só depois de 10 minutos. Quem já leu as Mídias
 * por outro motivo (Arquivos, Alertas, o Adicionar) deixa a lista aqui de
 * graça (api.js, media.ouvirLista). Falhou: fica "Foto" e "Vídeo", e só se
 * tenta de novo um minuto depois.
 */
import { useEffect, useSyncExternalStore } from 'react';
import { media } from '../api.js';
import { mapaDeNomes } from './nomesDasMidias.js';

const VALE = 10 * 60 * 1000;
const ESPERA_SE_FALHAR = 60 * 1000;

let mapa = null;
let lidoEm = 0;
let falhouEm = 0;
let voando = null;
const ouvintes = new Set();

function avisar() { ouvintes.forEach((f) => f()); }
function inscrever(f) { ouvintes.add(f); return () => ouvintes.delete(f); }

// Uma lista das Mídias que chegou (daqui ou de outra página) vira o mapa.
export function guardarMidias(itens, agora = Date.now()) {
  mapa = mapaDeNomes(itens);
  lidoEm = agora;
  falhouEm = 0;
  avisar();
  return mapa;
}

// O mapa { chave: nome }, com um pedido só para quantos pedirem ao mesmo tempo. `listar` é para o teste.
export function carregarNomesDasMidias({ listar = media.list, agora = Date.now() } = {}) {
  if (mapa && agora - lidoEm < VALE) return Promise.resolve(mapa);
  if (voando) return voando;
  if (falhouEm && agora - falhouEm < ESPERA_SE_FALHAR) return Promise.resolve(mapa || {});
  voando = Promise.resolve()
    .then(() => listar())
    .then((r) => guardarMidias(r && r.items))
    .catch(() => { falhouEm = Date.now(); return mapa || {}; })
    .finally(() => { voando = null; });
  return voando;
}

// Esquece o que guardou (a troca de conta e o teste).
export function esquecerNomesDasMidias() {
  mapa = null; lidoEm = 0; falhouEm = 0; voando = null;
  avisar();
}

if (media && typeof media.ouvirLista === 'function') media.ouvirLista((r) => { if (r && Array.isArray(r.items)) guardarMidias(r.items); });

/*
 * O mapa para a tela (null enquanto não chegou). `precisa`: só pede quando
 * há foto ou vídeo de antes na tela (nomesDasMidias.js, precisaDeNomes).
 */
export function useNomesDasMidias(precisa = true) {
  const nomes = useSyncExternalStore(inscrever, () => mapa, () => null);
  useEffect(() => { if (precisa) carregarNomesDasMidias(); }, [precisa]);
  return nomes;
}
