/*
 * O agendamento de um conteúdo em português.
 *
 * O player já sabia mostrar um conteúdo só em alguns dias e horários
 * (`agendadoAgora` em js/player.js), e o painel só usava isso por dentro das
 * campanhas. O dono da lanchonete que quer o cardápio do café só até as 10h não
 * tinha como pedir. Aqui fica a leitura do agendamento — o resumo que aparece
 * na lista e no editor —, sem React, para ser testada sem navegador.
 */

export const DIAS = [
  { n: 0, curto: 'D', nome: 'domingo' },
  { n: 1, curto: 'S', nome: 'segunda' },
  { n: 2, curto: 'T', nome: 'terça' },
  { n: 3, curto: 'Q', nome: 'quarta' },
  { n: 4, curto: 'Q', nome: 'quinta' },
  { n: 5, curto: 'S', nome: 'sexta' },
  { n: 6, curto: 'S', nome: 'sábado' },
];

export function temAgenda(item) {
  return !!(item && item.agendamento && item.agendamento.ativo);
}

function diasEmTexto(dias) {
  const d = Array.isArray(dias) ? [...new Set(dias)].filter((x) => x >= 0 && x <= 6).sort() : [];
  if (!d.length || d.length === 7) return 'todo dia';
  const chave = d.join(',');
  if (chave === '1,2,3,4,5') return 'de segunda a sexta';
  if (chave === '1,2,3,4,5,6') return 'de segunda a sábado';
  if (chave === '0,6') return 'no fim de semana';
  const nomes = d.map((n) => DIAS[n].nome);
  return nomes.length === 1 ? 'só ' + (d[0] === 0 || d[0] === 6 ? 'no ' : 'na ') + nomes[0]
    : nomes.slice(0, -1).join(', ') + ' e ' + nomes[nomes.length - 1];
}

function dataBr(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
  return m ? m[3] + '/' + m[2] : '';
}

/* "De segunda a sexta, das 06:00 às 10:00" — ou '' sem agendamento. */
export function resumoAgenda(ag) {
  if (!ag || !ag.ativo) return '';
  const partes = [diasEmTexto(ag.dias)];
  if (ag.horaInicio || ag.horaFim) {
    partes.push('das ' + (ag.horaInicio || '00:00') + ' às ' + (ag.horaFim || '23:59'));
  }
  if (ag.dataInicio && ag.dataFim) partes.push('de ' + dataBr(ag.dataInicio) + ' a ' + dataBr(ag.dataFim));
  else if (ag.dataFim) partes.push('até ' + dataBr(ag.dataFim));
  else if (ag.dataInicio) partes.push('a partir de ' + dataBr(ag.dataInicio));
  const t = partes.join(', ');
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/*
 * Problema que a pessoa não vê: um agendamento que nunca acontece (fim antes
 * do início, ou nenhum dia marcado depois de desmarcar todos). A TV
 * simplesmente nunca mostra o conteúdo, e ninguém entende por quê.
 */
export function problemaDaAgenda(ag) {
  if (!ag || !ag.ativo) return '';
  if (ag.dataInicio && ag.dataFim && ag.dataFim < ag.dataInicio) return 'O fim do período vem antes do começo: esse conteúdo nunca vai aparecer.';
  const hoje = new Date();
  const iso = hoje.getFullYear() + '-' + String(hoje.getMonth() + 1).padStart(2, '0') + '-' + String(hoje.getDate()).padStart(2, '0');
  if (ag.dataFim && ag.dataFim < iso) return 'O período já terminou: esse conteúdo não aparece mais.';
  return '';
}

/*
 * Toda a zona com horário: fora das janelas, a TV fica só no relógio — e
 * isso costuma ser surpresa ("de tarde a TV não mostra nada").
 */
export function zonaSoComHorario(itens) {
  const lista = (itens || []).filter(Boolean);
  return lista.length > 0 && lista.every(temAgenda);
}
