/*
 * FORA DO HORÁRIO, O PADRÃO É O RELÓGIO (reteste 3, cenário 12). Era
 * "continua mostrando": a loja fechava e a TV seguia a noite toda com a
 * oferta, gastando luz e tela. O relógio diz a quem passa que está fechado e
 * não parece TV quebrada, como a tela preta pareceria. É o mesmo padrão da
 * Primeira TV (js/primeira-tv.js).
 *
 * Só vale para a TV que nunca salvou um horário (`horarioSalvo: false` na
 * lista de TVs, server/routes/telas.js): a que já salvou abre com a escolha
 * dela, e nenhuma TV muda sozinha — a mudança só chega à TV quando alguém
 * toca em Salvar, vendo o que está marcado. Na TV, quem não tem escolha
 * continua mostrando (js/expediente.js), como sempre.
 */
export const HORARIO_PADRAO = { alerta: true, dias: [1, 2, 3, 4, 5, 6], inicio: '07:00', fim: '22:00', foraDoHorario: 'relogio' };

// O horário que o formulário abre para esta TV. `semHorario` só mora no formulário (o servidor descarta).
export function horarioParaEditar(device) {
  const salvo = device && device.expediente;
  // Sem saber (lista antiga, sem o campo), vale o que o servidor mandou: nunca mostrar outra escolha no lugar da salva.
  if (salvo && device.horarioSalvo !== false) return { ...HORARIO_PADRAO, ...salvo };
  return { ...HORARIO_PADRAO, semHorario: true };
}

// O que a TV mostra fora do horário, com o porquê de cada um. O recomendado primeiro.
export const FORA_DO_HORARIO = [
  ['relogio', 'Mostra só o relógio', (lugar) => 'Recomendado. Quem passa vê a hora, e a programação volta sozinha quando a ' + lugar + ' abre.'],
  ['preta', 'Fica preta', () => 'Gasta menos luz e menos a tela, mas parece desligada.'],
  ['ligada', 'Continua mostrando a programação', () => 'A TV fica a noite toda como de dia, gastando luz e tela.'],
];
