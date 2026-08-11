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

// Marca de origem. Duas chaves porque o histórico já gravou as duas nos itens
// que estão em produção; ler as duas evita órfão em tela de cliente.
export const CHAVES_ORIGEM = ['_season', '_campanha'];

export function origemDoItem(item) {
  if (!item) return null;
  for (const k of CHAVES_ORIGEM) if (item[k]) return { chave: k, valor: item[k] };
  return null;
}

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
export function aplicarConteudo(cfg, blocos, origem, politica) {
  const modo = politica || 'trocar';
  const next = JSON.parse(JSON.stringify(cfg || {}));
  if (!next.zonas) next.zonas = {};

  for (const [zonaId, itens] of Object.entries(blocos || {})) {
    if (!itens || !itens.length) continue;
    if (!next.zonas[zonaId] || !Array.isArray(next.zonas[zonaId].items)) {
      next.zonas[zonaId] = { items: [] };
    }
    const atuais = next.zonas[zonaId].items;
    const marcados = itens.map((i) => ({ ...i, [origem.chave]: origem.valor }));

    let base;
    if (modo === 'limpar') base = [];
    else if (modo === 'somar') base = atuais;
    else base = atuais.filter((i) => !(i && i[origem.chave] === origem.valor));

    // O que entra vai na frente: quem acabou de publicar quer ver na tela.
    next.zonas[zonaId].items = marcados.concat(base);
  }
  return next;
}

/*
 * Tira da config tudo o que veio de uma origem. É o "desfazer" que faltava:
 * antes só dava para apagar a playlist inteira.
 */
export function removerOrigem(cfg, origem) {
  const next = JSON.parse(JSON.stringify(cfg || {}));
  for (const z of Object.values(next.zonas || {})) {
    if (z && Array.isArray(z.items)) {
      z.items = z.items.filter((i) => !(i && i[origem.chave] === origem.valor));
    }
  }
  return next;
}

/*
 * Distribui as peças de uma campanha pelas zonas da tela.
 *
 * A regra é de formato, não de gosto: peça 16/9 na zona deitada, 9/16 na zona
 * em pé. Sem isto, tudo caía na principal e a lateral ficava com a cara de
 * sempre enquanto a campanha rodava ao lado.
 */
export function distribuirPorZona(pecas, zonas, dias) {
  const saida = {};
  const emPe = zonas.filter((z) => z.formato === 'retrato');
  const deitadas = zonas.filter((z) => z.formato !== 'retrato');
  const alvoDeitada = deitadas[0] && deitadas[0].id;
  const alvoEmPe = emPe[0] && emPe[0].id;

  for (const p of pecas) {
    const vertical = String(p.formato || '').startsWith('9/');
    const zona = (vertical && alvoEmPe) ? alvoEmPe : alvoDeitada;
    if (!zona) continue;
    if (!saida[zona]) saida[zona] = [];
    saida[zona].push(agendarPeca(p.item, p.faixa, dias));
  }
  return saida;
}

/*
 * As faixas do expediente — espelham `FAIXAS` em server/ai-director.js. Duas
 * cópias seria a armadilha de sempre, mas esta é a ponta que só ROTULA e
 * converte; a classificação acontece uma vez só, no plano.
 */
export const FAIXAS = {
  manha:  { rotulo: 'Manhã',      hora: '6h–11h30', horaInicio: '06:00', horaFim: '11:29' },
  almoco: { rotulo: 'Almoço',     hora: '11h30–14h', horaInicio: '11:30', horaFim: '13:59' },
  tarde:  { rotulo: 'Tarde',      hora: '14h–17h30', horaInicio: '14:00', horaFim: '17:29' },
  saida:  { rotulo: 'Fim do dia', hora: '17h30–24h', horaInicio: '17:30', horaFim: '23:59' },
  dia:    { rotulo: 'O dia todo', hora: 'qualquer hora', horaInicio: '', horaFim: '' },
};

const doisDigitos = (n) => String(n).padStart(2, '0');
const emISO = (d) => d.getFullYear() + '-' + doisDigitos(d.getMonth() + 1) + '-' + doisDigitos(d.getDate());

/*
 * Transforma a faixa de cada peça no `agendamento` que o player já entende.
 *
 * Isto é o que faltava para a campanha "rodar por horas ou dias com ajustes
 * mínimos": o plano dizia a que horas cada peça fazia sentido e ninguém lia.
 * Sem prazo (`dias` = 0), a campanha fica no ar até ser trocada; com prazo, ela
 * sai sozinha e a tela volta ao que era.
 */
export function agendarPeca(item, faixa, dias) {
  const f = FAIXAS[faixa] || FAIXAS.dia;
  const semHora = !f.horaInicio && !f.horaFim;
  const prazo = Number(dias) > 0 ? Number(dias) : 0;
  if (semHora && !prazo) return item;                 // sem janela: nada a agendar

  const hoje = new Date();
  const fim = new Date(hoje);
  if (prazo) fim.setDate(fim.getDate() + prazo - 1);

  return {
    ...item,
    agendamento: {
      ativo: true,
      dataInicio: emISO(hoje),
      dataFim: prazo ? emISO(fim) : '',
      dias: [],
      horaInicio: f.horaInicio,
      horaFim: f.horaFim,
    },
  };
}
