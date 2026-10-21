/*
 * O caminho da conta nova até a primeira peça na TV (PLANO §5.3, EXECUTOR
 * item 16): marca → primeira peça → TV ligada com a peça.
 *
 * Os passos são DEDUZIDOS do estado real, nunca marcados à mão: um passo
 * "concluído" que não aconteceu é pior do que não ter lista — a pessoa
 * acredita que a TV está no ar e descobre o contrário na parede. Um lugar só
 * sabe responder "onde a conta está", para o Início, a Marca, o Criar e o
 * pareamento dizerem o mesmo próximo passo.
 */
import { brand as brandApi, library, devices } from '../api.js';
import { mesmaPaleta, CURADAS } from './paletas.js';

/*
 * A conta nasce com a primeira paleta do ramo (server/paleta.js), então "tem
 * cor" não quer dizer "a pessoa disse quem é a empresa". A marca conta quando
 * ela escolheu outra paleta, leu o site ou mandou o logo.
 */
export function marcaFeita(r) {
  const kit = (r && r.kit) || {};
  const cores = kit.cores || [];
  const automatica = (CURADAS[r && r.ramo] || [])[0];
  const escolheu = cores.length && !(automatica && mesmaPaleta(cores, automatica.cores));
  return !!(escolheu || kit.site || (r && r.assets && r.assets.length));
}

export const ORDEM = ['marca', 'peca', 'tela'];

/* Onde a conta está: { marca, peca, tela, proximo, ultimaPeca, telas }. */
export async function lerJornada() {
  const [b, lib, dev] = await Promise.all([
    brandApi.get().catch(() => null),
    library.list().catch(() => null),
    devices.list().catch(() => null),
  ]);
  const itens = (lib && lib.items) || [];
  const telas = (dev && dev.devices) || [];
  const estado = {
    marca: marcaFeita(b),
    peca: itens.length > 0 || telas.some((d) => d.hasConfig),
    // A TV conta quando deu sinal E tem o que mostrar: pareada e vazia não é "no ar".
    tela: telas.some((d) => d.lastSeen && d.hasConfig),
    ultimaPeca: itens[0] || null,
    telas,
  };
  estado.proximo = ORDEM.find((p) => !estado[p]) || null;
  return estado;
}
