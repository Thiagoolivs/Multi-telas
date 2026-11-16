/*
 * Publicar peças em telas — um caminho só.
 *
 * Morava dentro de Meus Designs. O Criar (4 passos) publica do mesmo jeito,
 * e uma segunda cópia é como as duas acabariam divergindo: uma mandaria a
 * peça em pé para a lateral e a outra, para a principal.
 */
import '../../../js/lote-tv.js';
import { enviarOperacao } from './rodar.js';

/*
 * pecas: [{ formato, item, faixa? }]; alvos: ids das telas.
 * substituir: esvazia a zona antes ('limpar'); senão troca só o que veio
 * desta mesma origem (`titulo`) e preserva o resto.
 *
 * QUEM MONTA É O SERVIDOR (teste de carga, 16/11): a regra de cada TV — a
 * peça em pé na zona em pé, as faixas de horário, o cabeçalho e o rodapé
 * pelo mesmo caminho das Peças prontas (EXECUTOR §2e, item 42) — mora em
 * js/lote-tv.js (montarPublicacao). O painel lia a programação de cada TV,
 * montava e mandava todas de volta: numa conta de RH, acima de ~19 TVs o
 * envio passava de 2 MB e era recusado. Agora vai a operação "estas peças
 * nestas TVs" (a operação 'publicar'), tudo ou nada, com o Desfazer.
 */
export async function publicarPecas({ alvos, pecas: todas, titulo, telas, dias = 0, substituir = false }) {
  const devs = alvos.map((id) => (telas || []).find((s) => s.id === id) || { id, name: 'Tela' });
  const pecas = (todas || []).map((p) => ({ item: p.item, formato: p.formato || '', ...(p.faixa ? { faixa: p.faixa } : {}), ...(p.papel ? { papel: p.papel } : {}) }));
  return enviarOperacao({ tipo: 'publicar', pecas, titulo: titulo || 'Pôr na TV', dias, substituir: !!substituir }, devs.map((d) => ({ id: d.id })));
}

// A publicação numa TV, para a prévia e os testes: a mesma do servidor (`agora`: o dia de referência).
export const montarPublicacao = (cfg, publicacao, agora) => globalThis.MTLoteTv.montarPublicacao(cfg, publicacao, agora);
