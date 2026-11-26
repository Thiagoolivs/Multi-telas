import { relativeTime } from './format.js';

/*
 * "ESTA TV PARECE SER A X?" SEM SEQUESTRO (reteste 4, 25/11).
 *
 * Ao ligar uma TV do mesmo modelo de outra que parou de dar sinal há
 * pouco, o servidor pergunta se ela é a que voltou (server/reconectar.js,
 * candidatas). No dia da instalação, com 8 boxes iguais e uma TV desligada
 * no meio, um "Sim" por engano fazia a TV nova assumir o nome e a
 * programação de outra parede. Agora:
 *   - "Não, é outra TV" é o botão principal (e o que já vem em foco);
 *   - cada TV parecida diz quando deu o último sinal e de que grupo é;
 *   - "É a X" pede uma confirmação que diz o que muda e quando NÃO é ela.
 */

// "há 12 min (hoje, 09:40)", "há 3 h (ontem, 18:10)", "há 5 d (21/11, 18:10)".
export function ultimoSinal(ms, agora = Date.now()) {
  const t = Number(ms) || 0;
  if (!t) return 'nunca deu sinal';
  const d = new Date(t);
  const hora = String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  const hoje = new Date(agora);
  const ontem = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() - 1);
  const mesmoDia = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  const dia = mesmoDia(d, hoje) ? 'hoje' : mesmoDia(d, ontem) ? 'ontem'
    : String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0');
  return relativeTime(t, agora) + ' (' + dia + ', ' + hora + ')';
}

// A linha de cada TV parecida: "Recepção · grupo Produção · último sinal há 12 min (hoje, 09:40)".
export function linhaDaParecida(t, agora = Date.now()) {
  return [t.nome || 'TV', t.grupo ? 'grupo ' + t.grupo : '', 'último sinal ' + ultimoSinal(t.ultimoSinal, agora)].filter(Boolean).join(' · ');
}

// A confirmação do "É a X": o que muda, e quando não é ela.
export function confirmacaoDeReconectar(t, agora = Date.now()) {
  const nome = t.nome || 'TV';
  return {
    titulo: 'Esta é mesmo a ' + nome + '?',
    texto: 'A ' + nome + (t.grupo ? ', do grupo ' + t.grupo + ',' : '') + ' deu o último sinal ' + ultimoSinal(t.ultimoSinal, agora) + '. '
      + 'Confirmando, esta TV fica com o nome, a programação e o horário da ' + nome + ', e a ' + nome + ' sai da lista. '
      + 'Se a ' + nome + ' continua na parede dela (só desligada ou sem rede), toque em Cancelar: esta é outra TV.',
    botao: 'Sim, é a ' + nome,
    cancelar: 'Cancelar',
    perigo: true,
  };
}
