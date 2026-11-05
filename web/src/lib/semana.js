/*
 * A SEMANA DA TV (fase 8; BLOCO-8, wireframe D): o que passa em cada dia e
 * em cada hora, com os buracos à vista. O bloco 3 achou três relógios no
 * almoço que ninguém via: o painel mostrava a lista de peças, não o tempo.
 *
 * Código puro (testado no Node): para cada dia dos próximos 7 e cada faixa
 * do dia, pergunta ao mesmo `naJanela` da TV (js/rodizio.js) quais peças
 * estão no ar. A célula é:
 *   - `pecas`: o que passa (da parte principal primeiro);
 *   - `vazio`: a loja está aberta e uma parte que tem conteúdo fica só com
 *     o relógio (o buraco);
 *   - `fechado`: fora do horário da loja (a TV faz o que o horário manda).
 */

// A hora em que cada faixa é conferida: o meio dela (as faixas de lib/aplicarConteudo.js).
export const FAIXAS_DA_SEMANA = [
  ['manha', 'Manhã', '09:00'],
  ['almoco', 'Almoço', '12:45'],
  ['tarde', 'Tarde', '15:45'],
  ['saida', 'Fim do dia', '19:30'],
];

const dd = (n) => String(n).padStart(2, '0');
export const isoDe = (d) => d.getFullYear() + '-' + dd(d.getMonth() + 1) + '-' + dd(d.getDate());
const SEMANA = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];

// A loja está aberta neste dia e hora? Sem horário guardado, a TV mostra o dia inteiro.
export function abertoEm(expediente, dia, hm) {
  const e = expediente;
  if (!e || !Array.isArray(e.dias)) return true;
  if (!e.dias.includes(dia)) return false;
  const ini = e.inicio || '00:00';
  const fim = e.fim || '23:59';
  return ini <= fim ? hm >= ini && hm <= fim : hm >= ini || hm <= fim;
}

/*
 * cfg: a programação da TV; layout: o de js/templates.js (as partes);
 * opcoes: { hoje, expediente, naJanela, nome }.
 */
export function semanaDaTv(cfg, layout, opcoes = {}) {
  const hoje = opcoes.hoje || new Date();
  const naJanela = opcoes.naJanela || (globalThis.MTRodizio && globalThis.MTRodizio.naJanela) || (() => true);
  const nome = opcoes.nome || ((it) => it.titulo || it.rotulo || it.texto || it.type || 'Peça');
  const partes = ((layout && layout.zones) || []).filter((z) => z.type === 'playlist');
  const zonas = (cfg && cfg.zonas) || {};
  // A principal primeiro: é o que a pessoa olha.
  partes.sort((a, b) => (a.id === 'principal' ? -1 : b.id === 'principal' ? 1 : 0));
  const comConteudo = partes.filter((z) => ((zonas[z.id] || {}).items || []).length > 0);

  const dias = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() + i);
    dias.push({ iso: isoDe(d), dia: d.getDay(), rotulo: SEMANA[d.getDay()] + ' ' + dd(d.getDate()), hoje: i === 0 });
  }

  let buracos = 0;
  const linhas = FAIXAS_DA_SEMANA.map(([faixa, rotulo, hm]) => ({
    faixa, rotulo, hm,
    celulas: dias.map((d) => {
      const loja = { data: d.iso, dia: d.dia, hm };
      const agoraMs = new Date(d.iso + 'T' + hm + ':00').getTime();
      const pecas = [];
      const semNada = [];
      for (const z of comConteudo) {
        const itens = zonas[z.id].items;
        const noAr = itens
          .map((it, indice) => ({ it, indice }))
          .filter(({ it }) => naJanela(it, loja) && !(it.meta && Number(it.meta.expiraEm) > 0 && agoraMs > it.meta.expiraEm));
        if (!noAr.length) semNada.push(z.name ? z.name.replace(/\s*\(.*\)$/, '') : z.id);
        for (const { it, indice } of noAr) {
          pecas.push({
            titulo: String(nome(it) || '').slice(0, 60), zona: z.id, indice,
            campanha: it._campanha || '', calendario: !!it._calendario,
            ate: (it.agendamento && it.agendamento.ativo && it.agendamento.dataFim) || '',
            urgente: !!(it.meta && it.meta.prioridade === 'urgente'),
          });
        }
      }
      const aberto = abertoEm(opcoes.expediente, d.dia, hm);
      const vazio = aberto && comConteudo.length > 0 && semNada.length > 0;
      if (vazio) buracos++;
      return { pecas, vazio, semNada, fechado: !aberto, semConteudo: comConteudo.length === 0 };
    }),
  }));
  return { dias, linhas, buracos, partes: comConteudo.map((z) => z.id) };
}
