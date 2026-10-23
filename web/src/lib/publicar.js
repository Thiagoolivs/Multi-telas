/*
 * Publicar peças em telas — um caminho só.
 *
 * Morava dentro de Meus Designs. O Criar (4 passos) publica do mesmo jeito,
 * e uma segunda cópia é como as duas acabariam divergindo: uma mandaria a
 * peça em pé para a lateral e a outra, para a principal.
 */
import { primaryZoneKey } from './contentTypes.js';
import { aplicarConteudo, distribuirPorZona, agendarPeca } from './aplicarConteudo.js';
import { zonesOf } from './screenConfig.js';
import { aplicarPeca, zonasPorPapel, gravarNaTela } from './rodar.js';

// Peça de cabeçalho ou de rodapé: vai para a lista da faixa, nunca para uma playlist.
const ehFaixa = (p) => { const papel = (p.item && p.item.papel) || p.papel; return papel === 'cabecalho' || papel === 'rodape'; };

/*
 * pecas: [{ formato, item, faixa? }]; alvos: ids das telas.
 * substituir: esvazia a zona antes ('limpar'); senão troca só o que veio
 * desta mesma origem (`titulo`) e preserva o resto.
 */
export async function publicarPecas({ alvos, pecas: todas, titulo, telas, dias = 0, substituir = false }) {
  /*
   * As faixas seguem o MESMO caminho das Peças prontas e do Pôr pra rodar
   * (lib/rodar.js, aplicarPeca; EXECUTOR §2e, item 42). Antes uma peça de
   * cabeçalho publicada de Meus Designs caía na principal, como se fosse um
   * cartaz espremido.
   */
  const faixas = todas.filter(ehFaixa);
  const pecas = todas.filter((p) => !ehFaixa(p));
  for (const id of alvos) {
    const dev = (telas || []).find((s) => s.id === id) || { id, name: 'Tela' };
    // A mudança como função da programação: gravarNaTela lê com a versão, e
    // relê e reaplica se a TV mudou no meio (D0.5). Falha ao ler não vira
    // mais "TV vazia" gravada por cima da programação real.
    await gravarNaTela(dev, (cfg) => montar(cfg));
  }

  function montar(cfg) {
    /*
     * Peça em pé vai para a zona em pé. Antes tudo caía na principal e a
     * lateral seguia com a cara de sempre enquanto a campanha rodava ao
     * lado — a queixa de "adicionou uma tela só na principal".
     */
    const zonas = zonesOf(cfg).filter((z) => z.type === 'playlist');
    let blocos = distribuirPorZona(pecas, zonas, dias);
    if (!Object.keys(blocos).length && pecas.length) {
      blocos = { [primaryZoneKey(cfg)]: pecas.map((p) => agendarPeca(p.item, p.faixa, dias)) };
    }
    /*
     * 'trocar' substitui só o que veio DESTA campanha; 'limpar' esvazia a
     * zona. Antes o padrão empilhava para sempre e a única alternativa
     * apagava também o que não era campanha.
     */
    let novaCfg = pecas.length ? aplicarConteudo(cfg, blocos, { chave: '_campanha', valor: titulo },
      substituir ? 'limpar' : 'trocar') : cfg;
    if (faixas.length) {
      // Publicar de novo troca as faixas desta mesma origem, como nas playlists.
      const z = zonasPorPapel(novaCfg);
      for (const papel of ['cabecalho', 'rodape']) {
        const zona = z[papel] && novaCfg.zonas[z[papel]];
        if (!zona || !Array.isArray(zona.pecas)) continue;
        const resto = zona.pecas.filter((p) => !(p && p._campanha === titulo));
        if (resto.length !== zona.pecas.length) {
          novaCfg = { ...novaCfg, zonas: { ...novaCfg.zonas, [z[papel]]: { ...zona, pecas: resto, peca: resto[0] } } };
          if (!resto.length) { delete novaCfg.zonas[z[papel]].pecas; delete novaCfg.zonas[z[papel]].peca; }
        }
      }
      for (const p of faixas) novaCfg = aplicarPeca(novaCfg, { ...p, campanha: titulo });
    }
    return novaCfg;
  }
}
