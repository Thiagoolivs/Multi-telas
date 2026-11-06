# Bloco 3 — reteste sem IA (05/11)

**Por que parcial:** a chave do Gemini responde 402 (créditos esgotados). O
bloco original rodou com a IA real. Sem ela, o Criar responde por regras
simples, então os cenários que dependem da conversa da IA não dão para
refazer igual. O resto foi medido de dois jeitos:
- a semana simulada da fase 5 (`test/semana-simulada.test.js`, no CI): 7 cenários do bloco, 168 horas de TV, com o mesmo rodízio da TV;
- o robô no painel, como leigo: só clicou no que a tela mostrava.

## O que mudou desde o bloco original

| Problema do bloco 3 | Agora |
|---|---|
| Urgente sem teto (60% da tela com dois) | Teto de 25%, dividido entre os urgentes; Alta até 40% (`js/rodizio.js`) |
| Buracos no dia (3 relógios na padaria) | A faixa sem peça é coberta pela vizinha (`cobrirODia`); a Agenda mostra cada horário vazio |
| Horário pelo relógio da TV (box em UTC) | Pelo fuso da loja (`js/player.js:2359`) |
| Volta longa sem aviso (30 peças, ~7 min) | O painel avisa fora de 2–5 min (balcão), 8–12 (sala de espera), 3–10 (escritório) |
| IA ignorava "urgente" escrito | Importância automática sem IA (`js/importancia.js`): urgente, alta e normal, com o porquê |
| "Black Friday" e "Natal" sem data | Entendidos sem IA: 27/11, 25/12 e Dia das Mães 09/05/2027 (medido) |
| Agendar custava 8–9 cliques e não se via a semana | O "quando" vem no fim de todo Pôr na TV; a Agenda mostra a semana |

## Medido agora

- **Cenário 3** (oferta até sábado): 8 cliques pelo Criar › Escolher um modelo › Pôr na TV › Até um dia. Antes eram 9. A peça termina em 07/11 e a Agenda mostra "até 07/11" em cada dia.
- **Cenário 5** (datas sem dia): o leitor sem IA acerta as três datas.
- **Cenário 12** (fora do horário): 4 cliques até o horário da TV, pelo caminho Telas › Abrir a TV › Ajustes da TV › Horário. Antes eram 7 até salvar.
- **Semana simulada** (cenários 1, 2, 3, 4 e 6, 7, 10, 11): 0 buracos com a loja aberta, 0 repetições seguidas, 0 peças vencidas no ar, urgente sempre ≤ 25% e Alta ≤ 40%.

## As notas

A coluna "agora" só tem nota onde foi possível medir sem a IA.

| # | Cenário | Antes | Agora | Como |
|---|---|---|---|---|
| 1 | TV bonita a semana toda (conta vazia) | 5 | — | Precisa da IA para montar. Resultado na simulação: sem buraco |
| 2 | Café, almoço e happy hour | 6 | — | Precisa da IA. Simulação: cada peça na hora, sem vão |
| 3 | Oferta até sábado | 8 | **9** | 8 cliques, sai sozinha no domingo, visível na Agenda |
| 4 | "Acabou o pão de queijo!" por cima de tudo | 5 | — | Sem IA, o caminho é o editor. Simulação: urgente no teto |
| 5 | Black Friday e Natal sem lembrar | 5 | **8** | Datas certas sem IA. Falta sugerir sozinho as datas da frente |
| 6 | Duas campanhas e dois urgentes | 6 | **8** | Simulação: urgente ≤ 25% e campanhas alternadas |
| 7 | 30 peças acumuladas | 4 | **7** | O painel avisa a volta longa; limpar ainda é à mão |
| 8 | "Só na loja do Centro" | 9 | 9 | Não mudou |
| 9 | Pedir à IA (tirar, feriado, "mais animado") | 6 | — | Precisa da IA |
| 10 | Empresas (comunicado, aniversários, sistema fora) | 4,5 | — | Precisa da IA. Simulação: "sistema fora do ar" urgente, no teto |
| 11 | Saúde: 12 minutos sem repetir | 5 | **7** | O painel avisa a volta curta; a IA ainda não monta a volta certa |
| 12 | Fora do horário | 7 | **8** | 4 cliques; o padrão ainda é "continua" |

**Nota parcial (7 cenários medidos): 8,0.** Os mesmos 7 cenários valiam 6,3
no bloco original.

**A nota do bloco não sai sem a IA.** Os cenários 1, 2, 4, 9 e 10 são os que
dependem da IA e são os de nota mais baixa. Refazer com a IA real quando o
crédito voltar.
