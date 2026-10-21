/*
 * Publicar peças em telas — um caminho só.
 *
 * Morava dentro de Meus Designs. O Criar (4 passos) publica do mesmo jeito,
 * e uma segunda cópia é como as duas acabariam divergindo: uma mandaria a
 * peça em pé para a lateral e a outra, para a principal.
 */
import { deviceConfig } from '../api.js';
import { primaryZoneKey, defaultConfig } from './contentTypes.js';
import { aplicarConteudo, distribuirPorZona, agendarPeca } from './aplicarConteudo.js';
import { zonesOf } from './screenConfig.js';

/*
 * pecas: [{ formato, item, faixa? }]; alvos: ids das telas.
 * substituir: esvazia a zona antes ('limpar'); senão troca só o que veio
 * desta mesma origem (`titulo`) e preserva o resto.
 */
export async function publicarPecas({ alvos, pecas, titulo, telas, dias = 0, substituir = false }) {
  for (const id of alvos) {
    const dev = (telas || []).find((s) => s.id === id);
    let cfg = null;
    try { cfg = await deviceConfig.get(id); } catch (e) { /* tela sem config ainda */ }
    if (!cfg) cfg = defaultConfig(dev ? dev.name : 'Tela');
    /*
     * Peça em pé vai para a zona em pé. Antes tudo caía na principal e a
     * lateral seguia com a cara de sempre enquanto a campanha rodava ao
     * lado — a queixa de "adicionou uma tela só na principal".
     */
    const zonas = zonesOf(cfg).filter((z) => z.type === 'playlist');
    let blocos = distribuirPorZona(pecas, zonas, dias);
    if (!Object.keys(blocos).length) {
      blocos = { [primaryZoneKey(cfg)]: pecas.map((p) => agendarPeca(p.item, p.faixa, dias)) };
    }
    /*
     * 'trocar' substitui só o que veio DESTA campanha; 'limpar' esvazia a
     * zona. Antes o padrão empilhava para sempre e a única alternativa
     * apagava também o que não era campanha.
     */
    const novaCfg = aplicarConteudo(cfg, blocos, { chave: '_campanha', valor: titulo },
      substituir ? 'limpar' : 'trocar');
    await deviceConfig.save(id, novaCfg);
  }
}
