/*
 * aplicarConteudo.js — o único caminho por onde um CONJUNTO de conteúdo entra
 * numa tela.
 *
 * Existiam dois, e eles se comportavam ao contrário um do outro. A data
 * comemorativa marcava a origem (`_season`) e trocava o que tinha deixado
 * antes; a campanha marcava a origem (`_campanha`) e empilhava. Publicar três
 * campanhas seguidas deixava as três rodando juntas, e a única forma de limpar
 * era "substituir", que apagava também o que não era campanha.
 *
 * Pior: a data vestia principal, lateral e rodapé, enquanto a campanha ia para
 * uma zona só — a queixa de "adicionou uma tela só na principal, sem graça".
 *
 * Agora as duas chamam a mesma função, com a mesma noção de origem, escopo e
 * política de substituição. O que muda entre elas é só o conteúdo.
 */

/*
 * Desde o teste de carga (16/11) as regras moram em js/lote-tv.js: o
 * servidor aplica a campanha e a publicação em cada TV com as mesmas
 * funções (POST /api/lote/operacao), e duas cópias seriam duas regras.
 * Aqui ficam os mesmos nomes de sempre para o painel.
 */
import '../../../js/lote-tv.js';

const L = globalThis.MTLoteTv;

// Marca de origem. Duas chaves porque o histórico já gravou as duas nos itens
// que estão em produção; ler as duas evita órfão em tela de cliente.
export const CHAVES_ORIGEM = L.CHAVES_ORIGEM;
export const origemDoItem = (item) => L.origemDoItem(item);

/*
 * Aplica `blocos` — { [zonaId]: [itens] } — numa config.
 *
 * `origem` = { chave, valor }: identifica de onde o conteúdo veio, para poder
 * ser substituído depois sem tocar no resto.
 *
 * `politica`:
 *   'trocar'  (padrão) troca o conteúdo DESTA origem e preserva o resto;
 *   'somar'   acrescenta sem remover nada;
 *   'limpar'  esvazia a zona antes — o "substituir tudo" explícito.
 *
 * Devolve a config nova; não modifica a recebida.
 */
export const aplicarConteudo = (cfg, blocos, origem, politica) => L.aplicarConteudo(cfg, blocos, origem, politica);

/*
 * Tira da config tudo o que veio de uma origem. É o "desfazer" que faltava:
 * antes só dava para apagar a playlist inteira.
 */
export const removerOrigem = (cfg, origem) => L.removerOrigem(cfg, origem);

/*
 * Distribui as peças de uma campanha pelas zonas da tela: peça 16/9 na zona
 * deitada, 9/16 na zona em pé.
 */
export const distribuirPorZona = (pecas, zonas, dias, agora) => L.distribuirPorZona(pecas, zonas, dias, agora);

/*
 * Fase 5: sem buraco no dia. Sem peça "o dia todo" na zona, cada faixa que
 * tem peça estica até a próxima que tem (BLOCO-3, cenário 1).
 */
export const cobrirODia = (lista) => L.cobrirODia(lista);

/*
 * As faixas do expediente — espelham `FAIXAS` em server/ai-director.js. Duas
 * cópias seria a armadilha de sempre, mas esta é a ponta que só ROTULA e
 * converte; a classificação acontece uma vez só, no plano.
 */
export const FAIXAS = L.FAIXAS;

/*
 * Transforma a faixa de cada peça no `agendamento` que o player já entende.
 * Sem prazo (`dias` = 0), a campanha fica no ar até ser trocada; com prazo,
 * ela sai sozinha e a tela volta ao que era. `agora` só nos testes.
 */
export const agendarPeca = (item, faixa, dias, agora) => L.agendarPeca(item, faixa, dias, agora);
