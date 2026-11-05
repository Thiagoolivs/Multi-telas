# Bloco 3: programação e agendamento com IA

A pergunta: um cliente leigo, sem ninguém de marketing, consegue deixar a
TV bonita, organizada e certa a semana inteira, sem pensar em sequência,
horário ou prioridade? A meta é **"fez sozinho" em todos os cenários, com
nota ≥ 8** em facilidade e no que a TV mostrou.

## 1. Os 12 cenários do cliente leigo

Cada cenário é feito **ao pé da letra**: o robô só faz o que a tela diz. Se
precisar adivinhar onde clicar, conta como travada.

| # | Frente | O cliente quer |
|---|---|---|
| 1 | Comércio | "Quero a TV bonita a semana toda", a partir de uma conta vazia |
| 2 | Comércio | Café da manhã de manhã, almoço ao meio-dia, happy hour à noite |
| 3 | Comércio | Uma oferta válida até sábado, que entra e sai sozinha |
| 4 | Comércio | "Acabou o pão de queijo!": por cima de tudo, agora, e depois sai |
| 5 | Comércio | Black Friday e Natal sem precisar lembrar |
| 6 | Comércio | Duas campanhas no mesmo horário, e duas coisas urgentes juntas |
| 7 | Comércio | 30 peças acumuladas: a sequência não pode virar uma fila de 15 minutos |
| 8 | Comércio | 3 lojas: "só na loja do Centro" |
| 9 | Todas | Pedir à IA: "tira a promoção de sábado", "aviso de feriado em todas as TVs", "deixa mais animado" |
| 10 | Empresas | Comunicado com prazo, aniversariantes automáticos, indicador que se atualiza, "sistema fora do ar" urgente |
| 11 | Saúde | A sala de espera rodando 12 minutos sem repetir, prevenção do mês e horário de atendimento |
| 12 | Todas | Fora do horário de funcionamento: a TV mostra o quê? |

## 2. A importância de cada peça

Hoje a prioridade é escolhida à mão (Normal, Alta, Urgente), e o aviso
urgente toma a tela. O teste mede o que existe e o que falta:
- **Quem decide.** A IA sugere a importância pela natureza da peça? A ordem esperada:
  1. segurança e urgência;
  2. prazo curto;
  3. oferta;
  4. institucional.

  O cliente precisa entender a sugestão e poder trocar.
- **Quanto tempo de tela cada nível ganha.** Medido na semana simulada, contra o que a tela promete.
- **Os limites.** Um teto para o urgente, para ele não virar a tela inteira, e o urgente sair sozinho quando perde o sentido.
- **O empate.** Dois urgentes ao mesmo tempo, e o urgente contra uma campanha agendada.

## 3. Uma semana simulada na TV

A TV roda com o relógio adiantado hora a hora, de segunda a domingo, nos 12
cenários. O robô anota o que passa em cada TV e compara com o que o
cliente quis:

| Medida | Esperado |
|---|---|
| Peça vencida no ar | 0 |
| Buraco (TV sem nada, ou só a espera) | 0 dentro do horário |
| Fora do horário de funcionamento | O que o cliente escolheu |
| Horário certo (manhã, almoço, noite) | 100% |
| Tempo de tela por importância | O prometido, ± 10% |
| A mesma peça duas vezes seguidas | 0 |
| A sequência inteira | Menor que a espera média do lugar (balcão ~2 min; sala de espera ~12 min) |
| Urgente | Entra em até 5 s e sai na hora marcada |
| TVs e grupos | Cada TV mostra só o que é dela |

## 4. Organização e movimento

- **A ordem da sequência:** tem lógica (abre forte, alterna tipos, não junta duas ofertas iguais)?
- **A transição de cada tipo:** de 0,4 s a 0,7 s, sem piscar, com uma coisa se mexendo por vez.
- **O ritmo:** 1 s por palavra, e oferta com uns 8 s.
- **O quanto mexe:** mexer bem, mas sem cansar quem fica 12 minutos na sala de espera.

## 5. Facilidade

Medido em cada cenário:
- passos e cliques;
- tempo até ficar pronto;
- palavras que o cliente não entenderia;
- quantas vezes precisou adivinhar;
- erros possíveis sem aviso;
- se dá para desfazer.

Comparamos com o que os melhores fazem: o horário por parte do dia da
Starbucks, o tema travado da Appspace e o agendamento por regra do
ScreenCloud ([REFERENCIAS.md](REFERENCIAS.md)).

## 6. O que você recebe

- **A nota de cada cenário,** com o vídeo ou as imagens de onde travou.
- **A grade da semana simulada** de cada TV, com o que passou e quando, e as falhas marcadas.
- **A proposta da importância automática:** as regras, o que a tela mostra ao cliente e o teto do urgente.
- **Os 10 piores problemas,** com o conserto de cada um.

**Custo:** só a IA dos cenários 1, 9 e 10 (cerca de 40 gerações de
texto, dentro do teto de R$ 35 do bloco 2).
