# Bloco 3 — resultado: programação e agendamento com IA

Feito em 05/11/2026, num servidor local (porta 5970), com a IA real.
O robô fez os 12 cenários no painel, como um cliente leigo: só clicou no
que a tela mostrava. Depois, sete TVs rodaram uma semana inteira com o
relógio adiantado (de quinta 05/11 a quarta 11/11, 2 minutos de TV por
hora, 168 horas por TV).

**Custo de IA do bloco: R$ 3,30** (teto: R$ 7). Quatro campanhas sem
foto, uma leitura de calendário e 14 pedidos ao "Pedir à IA".

## Resumo

- **Criar é fácil. Programar a semana não é.** Em 8 a 13 cliques a IA
  monta peças bonitas e já divide por horário. Mas deixa buracos no dia:
  na padaria, no almoço e à noite a TV mostra três relógios.
- **O urgente não tem freio.** Ele não sai sozinho, toca o sino a cada
  passada e, com dois urgentes, fica com 60% do tempo da tela a semana toda.
- **A importância já existe, mas pela metade.** O aviso rápido e o
  calendário sugerem a prioridade sozinhos. As campanhas, não. E a IA
  ignora quando o cliente escreve "urgente".
- **O horário depende do relógio da TV.** Num box em UTC, o café da manhã
  passa às 3h e o happy hour às 15h.
- **A sequência não respeita o tempo de espera.** Sala de espera com
  volta de 72 segundos (o certo é 8 a 12 minutos); balcão com 30 peças e
  volta de ~7 minutos (o certo é 2 a 5 minutos). Ninguém avisa.

**Nota geral do bloco: 5,9 de 10.** A meta era 8 em todos os
cenários. Só os cenários 3 (oferta até sábado) e 8 (só na loja do Centro)
chegaram lá. O que funciona bem: prazo dito numa frase, grupo de lojas,
horário da loja e o Desfazer.

---

## 1. O que existe hoje

| Recurso | Onde | O que faz | O que falta |
|---|---|---|---|
| Horário de cada peça | Editor da TV › "Mostrar só em alguns dias ou horários" (`web/src/components/content/QuandoMostrar.jsx`); player `agendadoAgora` (`js/player.js:2209`) | Dias, horas e período (de/até) | Usa o relógio da TV, não o fuso da loja. Fim só por dia, não por hora |
| Prioridade | Editor da TV (Normal, Alta, Urgente) (`web/src/pages/ContentEditorPage.jsx:65`); player `pesoDe` (`js/player.js:2008`) | Alta passa 2 vezes por volta; Urgente 3 vezes e toma a tela | Teto para o urgente; fim automático; a lista do editor não marca o urgente |
| Aviso rápido | Programação › Pedir à IA (`server/aviso-rapido.js`, `web/src/lib/aviso.js`) | A IA arruma o aviso, sugere prioridade (urgente só para segurança), até quando e o grupo | Hora de saída; respeitar "urgente" escrito pelo cliente |
| Faixas do dia nas campanhas | IA do Criar (`server/ai-director.js:289`) | Manhã 6h–11h29, almoço 11h30–13h59, tarde 14h–17h29, fim do dia 17h30–23h59 | Garantir que o dia todo fique coberto; mais de uma peça por faixa |
| Prazo da campanha | Conversa do Criar | "Válida até sábado" virou data de fim certa | Nada a mudar: funcionou |
| Calendário | Programação › Calendário (`server/calendario.js`) | Lê datas coladas, sugere tipo, prioridade (feriado e aviso = alta) e quantos dias antes | Entender "Black Friday" e "Natal" sem data; sugerir as datas do comércio |
| Pedir à IA | Programação (`web/src/components/tela/PedirIA.jsx`, `server/assistente.js:525`) | Aviso, quiz, aparência de uma TV, mudar campanha, criar | Tirar ou agendar uma peça; mudar o movimento; várias TVs de uma vez |
| Grupos | Telas › Mais opções › Nome e grupo | Aviso e calendário por grupo | Nada a mudar: funcionou |
| Horário da loja | Telas › Mais opções › Horário e aviso de queda (`js/expediente.js`) | Fora do horário: continua, relógio ou preta, no fuso da loja | Fica longe da Programação; o padrão é "continua" |
| Automáticos | Pessoas (aniversariantes), datas comemorativas como ideia no Início | Aniversário na semana certa, sozinho | Vem desligado; data comemorativa não entra sozinha |
| Indicadores | Pessoas e indicadores › Indicadores | Número que se atualiza, vindo de um sistema | Só com endereço JSON e token: impossível para quem não tem TI |

**O que não existe:**
- A IA sugerir a importância das peças de campanha.
- Teto de tempo para o urgente, e o urgente sair sozinho por hora.
- Limite ou aviso de volta longa (só existe o aviso de volta curta, menos de 45 s).
- Tempo de cada peça pelo número de palavras (todas ficam 12 ou 15 s).
- Separar duas peças da mesma campanha na sequência.
- Lista das datas do comércio (Black Friday, Natal, Dia das Mães) para marcar com antecedência.

---

## 2. As notas dos 12 cenários

Facilidade = passos, tempo, travadas e palavras difíceis. Resultado = o que
a TV mostrou na semana. Tempos medidos com o robô (uma pessoa leva de 3 a 5
vezes mais).

| # | Cenário | Passos | Tempo | Travadas | Facilidade | Resultado | Nota |
|---|---|---|---|---|---|---|---|
| 1 | TV bonita a semana toda (conta vazia) | 13 | 3 min 36 s | 0 | 8 | 3 | **5** |
| 2 | Café de manhã, almoço ao meio-dia, happy hour à noite | 8 | 1 min 51 s | 0 | 8 | 4 | **6** |
| 3 | Oferta até sábado, entra e sai sozinha | 9 | 1 min 27 s | 0 | 8 | 8 | **8** |
| 4 | "Acabou o pão de queijo!" por cima de tudo | 6 | 31 s | 1 | 7 | 3 | **5** |
| 5 | Black Friday e Natal sem lembrar | 6 | 56 s | 1 | 5 | 5 | **5** |
| 6 | Duas campanhas juntas e dois urgentes juntos | 4 | 15 s | 0 | 9 | 3 | **6** |
| 7 | 30 peças acumuladas | — | — | — | 6 | 3 | **4** |
| 8 | 3 lojas: "só na loja do Centro" | 4 | 14 s | 0 | 9 | 9 | **9** |
| 9 | Pedir à IA: tirar promoção, feriado, "mais animado" | 5 / 3 / 7 | 10–40 s | 1 | 7 | 5 | **6** |
| 10 | Empresas: comunicado, aniversários, indicador, sistema fora do ar | 4 / 10 / — / 4 | — | 2 | 5 | 4 | **4,5** |
| 11 | Saúde: 12 minutos sem repetir, prevenção, horário | 7 | 3 min 8 s | 0 | 8 | 2 | **5** |
| 12 | Fora do horário | 7 | 29 s | 1 | 6 | 8 | **7** |

### O que aconteceu em cada um

**1. TV bonita a semana toda.** Início › "Ligar a TV" › código › "Criar
para esta TV" › frase › "Gostei, pode ser" › "Gerar" › "Aprovar e gerar" ›
"Pôr pra rodar". A IA propôs manhã e tarde e fez 7 peças bonitas. Mas:
- nada no almoço (11h30–14h) nem à noite (depois das 17h30): a TV mostra
  três relógios (cabeçalho, principal e lateral) — foto
  `semana/tv0-qui_05_11_12h.png`;
- a peça "Seu café da manhã perfeito" foi marcada para a **tarde**;
- o letreiro diz "café da manhã especial" ao meio-dia (o letreiro não tem horário);
- o padrão das fotos é "A IA gera" (gasta criação). Mudei para "Sem foto" para caber no teto;
- palavras difíceis: "esboço", "criações", "Corporativo Completo", "layout", "letreiro", "estilos que giram".

**2. Por parte do dia.** A IA disse "3 peças para cada horário", mas o
cartão fez **3 peças no total**, uma por faixa. Resultado:
- sozinha na faixa, a mesma peça entra de novo a cada 12 s, por horas
  (o mesmo mecanismo deu 882 repetições na semana do S1 Balcão);
- a tarde (14h–17h29) ficou sem nada: relógio;
- a lateral e o rodapé do layout padrão ficaram vazios a semana toda.

**3. Oferta até sábado.** O "Pedir à IA" mandou para o Criar com a frase
pronta. A IA entendeu "até sábado (07/11)" e a peça saiu com fim em
07/11. Na semana, a oferta passou de quinta a sábado e **sumiu no
domingo** (0 vez vencida no ar). Ponto fraco: oferta fica 12 s (a régua
pede ~8 s) e só na zona principal.

**4. Pão de queijo.** O pedido dizia "por cima de tudo agora". A IA
escolheu **Alta** ("passa mais vezes"). Precisei trocar para Urgente
(1 travada). Entrou nas 3 TVs em **0,47 s**. Mas:
- não sai sozinho: "até você tirar". A data de fim é só por dia;
- com só a oferta junto na zona, o urgente ficou 30 s seguidos na tela
  (sequência U N U U) e o sino toca a cada passada;
- para tirar: Programação › Últimos envios › Desfazer (2 cliques, bom).

**5. Black Friday e Natal.** O calendário pede para colar as datas.
Escrevi "Black Friday e Natal": "Não achei nenhuma data no texto". O
produto sabe calcular as duas (`js/seasons.js`), mas o leitor não usa.
Com "27/11 Black Friday / 25/12 Natal" funcionou: cartão genérico
"Data especial" de 20/11 a 27/11, e Natal como "Feriado", prioridade
alta, de 20/12 a 25/12. Sem oferta e sem lembrete antes.

**6. Dois de cada.** Duas campanhas no mesmo horário se alternam bem
(x1 y1 x2 y2 x3). Dois urgentes: os dois passam 3 vezes por volta, cada
um toma a tela por 15 s, e juntos ficam com 60% do tempo da zona
principal da Loja Centro, a semana toda.
Não há regra de desempate nem teto.

**7. 30 peças.** O editor mostra "ciclo de 6min 30s" e nenhum alerta.
Com as prioridades, a volta real dá ~7 minutos. No balcão, a pessoa
espera uns 2 minutos: vê 8 ou 9 das 31 peças. Duas peças da mesma
campanha podem sair coladas (veja §5).

**8. Só no Centro.** "Só na loja do Centro: o estacionamento está fechado
até domingo". A IA escolheu o grupo Centro, prioridade alta e fim em
08/11. Na semana, o aviso passou só na Loja Centro, de quinta a domingo,
e nunca no Shopping nem no Bairro.

**9. Pedir à IA.**
- "Tira a promoção de sábado": pergunta qual campanha, leva a Criados, e
  lá o botão é "Pausar" (1 travada: "pausar" é "tirar"?). 5 passos.
- "Aviso de feriado em todas as TVs": pergunta a data com sugestões certas
  (15/11 e 20/11). Ótimo. Mas o aviso entra **hoje**, 10 dias antes, com
  prioridade alta, e diz "Sem Expediente" (palavra de escritório numa padaria).
- "Deixa mais animado": 3 perguntas (o quê, qual TV, qual tema) e muda só a
  **cor** de **uma** TV. Sugere "Tema Neon Cyber" para uma padaria. Nada de
  movimento.

**10. Empresas.**
- Comunicado com prazo: 4 passos, "até sexta" virou 06/11. Bom.
- Aniversariantes: 10 passos. "Mostrar nas TVs" vem **desmarcado**.
  Depois de marcado, cada um entrou na semana certa.
- Indicador que se atualiza: pede "Endereço (responde JSON)", "Token
  (Bearer)", "Campo da chave". Sem TI, não dá (travada).
- "Urgente: o sistema está fora do ar": a IA escolheu **Alta**, mesmo com
  a palavra "urgente". Não tomou a tela.

**11. Saúde.** Pedi "uns 12 minutos sem repetir". A IA fez **6 peças de
12 s: volta de 72 s**. Quem espera 12 minutos vê a mesma volta 10 vezes.
O horário de atendimento foi para o rodapé (bom). A lateral ficou vazia.

**12. Fora do horário.** O horário mora em Telas › Mais opções ›
"Horário e aviso de queda" (1 travada: quem está na Programação não acha).
O padrão é "Continua mostrando a programação". Com "Mostra só o relógio"
(seg a sáb, 7h às 20h), a semana saiu certa: domingo inteiro e as
madrugadas e noites com o relógio, das 8h às 19h a programação (18 de 18
fotos conferidas). O sino do urgente não toca com a loja fechada.

---

## 3. A semana simulada

**Como foi feito.** Sete TVs de verdade (o player.html no Chromium), cada
uma com a programação montada nos cenários. O relógio do Playwright
(`page.clock`) pulou de hora em hora, de quinta 05/11 0h a quarta 11/11
23h. Em cada hora, a TV rodou 2 minutos e o robô anotou cada peça que
entrou, cada vez que o urgente tomou a tela e as zonas que ficaram só com
relógio. 1.032 horas de TV ao todo. Fotos em horas escolhidas.

| TV | Montada nos cenários |
|---|---|
| S1 Balcão | Conta nova da padaria (cenário 1) |
| Loja Centro | Cardápio por horário (2), oferta até sábado (3), pão de queijo urgente (4), Black Friday e Natal (5), piso molhado urgente (6), estacionamento só no Centro (8), feriado (9) |
| Loja Bairro | O mesmo, sem o estacionamento, e com horário seg a sáb 7h–20h, relógio fora dele (12) |
| Loja Shopping | 30 peças acumuladas (7) |
| Refeitório | Empresas: vacinação até sexta, sistema fora do ar, 2 aniversariantes (10) |
| Sala de espera | Saúde: a campanha de prevenção e horário (11) |
| Centro em UTC | A mesma programação do Centro, num box com relógio em UTC |

### As medidas contra o esperado

| Medida | Esperado | Medido | |
|---|---|---|---|
| Peça vencida no ar | 0 | **0** nas 6 TVs com fuso certo. A oferta saiu no domingo; o estacionamento, na segunda; a vacinação, no sábado | ✅ |
| Peça fora do horário | 0 | Na TV em UTC, **todas as faixas 3 h adiantadas**: café da manhã às 3h–4h, almoço às 10h, happy hour às 15h–16h (vistos no ar em 5 das 24 amostras) | ❌ |
| Buraco (só relógio) no horário de loja | 0 | **S1 Balcão: 7 h por dia** entre 6h e 22h (almoço 11h30–14h e noite 17h30–22h); 98 h de relógio na semana | ❌ |
| Fora do horário | O que o cliente escolheu | Loja Bairro: relógio no domingo e fora das 7h–20h, como pedido | ✅ |
| Horário certo (manhã, almoço, noite) | 100% | 100% com o relógio da TV em São Paulo; errado em todas as faixas se o aparelho estiver em UTC | ⚠️ |
| Tempo por importância | O prometido ± 10% | Pela contagem, cumpre. Pelo tempo, na Loja Centro: urgente **60%**, alta 31%, normal **9%** | ⚠️ |
| A mesma peça duas vezes seguidas | 0 | **S1 Balcão: 882 vezes** (lateral 70 h e principal 28 h na semana, sempre com uma peça só na faixa). Nas outras TVs, 0 | ❌ |
| A sequência inteira | Balcão ~2 min; sala de espera ~12 min | Shopping **~7 min**; Centro ~3 min (metade é urgente); sala de espera **72 s** (10 voltas iguais em 12 min) | ❌ |
| Urgente entra em até 5 s | ≤ 5 s | **0,47 s** nas 3 TVs | ✅ |
| Urgente sai na hora | Na hora marcada | Sem hora: só "até o fim do dia" ou "até você tirar". Pão de queijo e piso molhado ficaram a semana inteira | ❌ |
| Cada TV só o que é dela | 100% | Estacionamento só no Centro; Black Friday e Natal ainda não entraram (certo: 20/11 e 20/12) | ✅ |

### A grade de cada TV (o que a zona principal mostrou)

**S1 Balcão (padaria, cenário 1)** — igual nos 7 dias:

| Faixa | O que passou | Falha |
|---|---|---|
| 0h–5h59 | Relógio (×3: cabeçalho, principal, lateral) | Sem horário de loja: a TV fica ligada mostrando relógios |
| 6h–11h29 | 2 peças de manhã na principal; 1 na lateral, repetindo | Lateral repete a mesma peça a cada 12 s |
| 11h30–13h59 | **Relógio** | Buraco no almoço |
| 14h–17h29 | 1 peça na principal ("café da manhã perfeito", marcada como tarde), repetindo; 1 na lateral, repetindo | Peça errada para a hora; repetição |
| 17h30–23h59 | **Relógio** | Buraco à noite |
| O dia todo | Letreiro com "café da manhã especial" | O letreiro não tem horário |

**Loja Centro** — todos os dias, toda hora: o pão de queijo e o piso molhado
tomam a tela 3 vezes por volta cada um. O feriado de 15/11 aparece desde
05/11 (10 dias antes), duas vezes por volta. O cardápio da faixa certa
aparece **uma vez a cada ~3 minutos**. Quinta a sábado entra a oferta;
quinta a domingo, o estacionamento.

**Loja Bairro** — o mesmo do Centro das 7h às 20h; fora disso e no domingo, só o relógio.

**Loja Shopping** — volta de ~7 minutos. Em 2 minutos de amostra, a
pessoa vê 8 a 9 das 31 peças. Nenhum buraco, nenhuma repetição seguida.

**Refeitório** — quinta e sexta: vacinação, sistema fora do ar e o cartão
de aniversário. De sábado em diante: **só "Sistema fora do ar" e o
aniversário, um depois do outro, por 5 dias** (o aviso não tinha fim).
O aniversário de Joana (06/11) e o de Carlos (10/11) entraram na semana certa.

**Sala de espera** — 6 peças de 12 s, a mesma ordem a cada 72 s, o dia todo, todos os dias. A lateral ficou vazia.

**Centro em UTC** — o café da manhã entra às 3h e some às 8h30; o almoço entra às 8h30; o happy hour, às 14h30 (hora de Brasília).


---

## 4. A importância de cada peça

### Como funciona hoje

| Nível | Promessa na tela | O que o player faz |
|---|---|---|
| Normal | "Passa uma vez por volta" | Peso 1 |
| Alta | "Passa duas vezes por volta" | Peso 2, espalhado (round-robin ponderado) |
| Urgente | "Toma a tela inteira… três vezes por volta" | Peso 3, e **toda** passada toma a tela por 15 s, com sino |

**Quem decide hoje:**
- Aviso rápido: a IA sugere. Urgente só para segurança; o resto é Alta.
  Funcionou com "piso molhado" (urgente). Falhou com "por cima de tudo
  agora" e com "Urgente: sistema fora do ar" (os dois viraram Alta).
- Calendário: por tipo. Feriado e aviso = Alta; o resto = Normal.
- Campanhas do Criar: ninguém. Tudo entra como Normal, inclusive a oferta
  que vence amanhã.

**O que a contagem promete e o que o tempo mostra.** A promessa é por
número de passadas, mas o cliente sente tempo de tela. Na Loja Centro
(2 urgentes, 2 altas, o resto normal), na semana:

| Nível | Passadas por volta (promessa) | Parte das passadas (quinta, 10h) | Parte do tempo medida na semana |
|---|---|---|---|
| Urgente (2 peças) | 3 cada | 50% | **60%** (e toma a tela inteira em ~46% do tempo) |
| Alta (2 peças) | 2 cada | 33% | 31% |
| Normal (cardápio, oferta) | 1 cada | 17% | **9%** |

Pela regra, o player cumpre o que diz. Mas o conteúdo que vende (o
cardápio da hora) ficou com 9% da tela. E o cliente não tem como ver isso
no painel.

**Casos que quebram a regra** (simulados com o código do player, `js/player.js:2012`):

| Na zona | Sequência | Problema |
|---|---|---|
| 1 normal + 1 alta | A N A · A N A | A mesma peça duas vezes seguidas na emenda da volta |
| 1 normal + 1 urgente | U N U U | O urgente seguido de si mesmo; 75% das passadas |
| 2 urgentes + 3 normais | U1 U2 N1 N2 U1 U2 N3 U1 U2 | 6 de 9 passadas são urgentes |
| 3 da campanha + 2 soltas | c1 s1 s2 c2 c3 | Duas da mesma campanha coladas |
| só 1 urgente | U U U… | Pelo código, toma a tela sem parar e o sino toca a cada 15 s |

### A proposta: importância automática

**As regras (a IA aplica ao criar, o cliente pode trocar):**

| Nível | Quando | Exemplos | Fim padrão |
|---|---|---|---|
| Urgente | Segurança, emergência, ou o cliente escreveu "urgente" | Piso molhado, evacuação, sistema fora do ar | 2 horas (máximo 24 h) |
| Alta | Prazo em até 3 dias; "acabou", "fechado hoje", mudança de horário | Pão de queijo esgotado, feriado amanhã, oferta que vence | A data e **hora** do fim |
| Normal | Oferta, cardápio, produto, campanha | Combo do café, cardápio do almoço | O prazo da campanha |
| Fundo | Institucional, dica, redes, frase | "Siga no Instagram", dica de saúde | Sem fim |

Regras de tempo:
1. **Prazo sobe sozinho:** peça Normal com fim em até 24 h vira Alta; no
   minuto do fim, sai (não no fim do dia).
2. **Antecedência igual para todos:** aviso de feriado entra 3 dias antes,
   não no dia em que foi criado.
3. **Peça de uma parte do dia** fica Normal dentro da faixa; fora, não existe.

**O que o cliente vê:**
- Um selo em cada peça, com o porquê: "Urgente · fala de segurança · sai às 16h".
- Um medidor simples: "Aparece 1 vez por minuto · 20% da tela".
- Na Programação, em cima da TV: "1 urgente no ar até 16h · Tirar agora".
- Na lista do editor, o urgente marcado (hoje só a Alta aparece, `web/src/pages/ContentEditorPage.jsx:683`).

**O teto do urgente:**
- No máximo **25% da tela**: 15 s a cada 60 s. O resto da programação continua.
- Dois urgentes **dividem** o mesmo teto (o mais novo primeiro). Três ou
  mais: a IA pergunta se quer juntar num aviso só.
- O sino toca **só na entrada** (no máximo uma vez a cada 10 minutos).
- Urgente sempre com fim. Sem fim escolhido, sai em 2 horas e o painel avisa 10 minutos antes: "Manter mais 1 hora?".
- Contra uma campanha agendada: o urgente vence, dentro do teto; a campanha não perde a faixa dela.

**Alta:** 2× a frequência, mas todas as Altas juntas no máximo 40% da volta.

---

## 5. Organização e movimento

**A ordem da sequência.**
- O player reveza por origem: uma de cada campanha por vez. Funciona com duas campanhas no mesmo horário.
- Mas peças soltas (avisos) entram uma a uma, e a campanha fica para o fim
  da volta: "c1 s1 s2 c2 c3" (duas da mesma campanha coladas) — `js/player.js:2022`.
- Nenhuma regra de "abrir forte" ou de alternar tipos (foto, preço, aviso).
- O aviso novo entra sempre na frente da zona (`web/src/lib/aviso.js:74`):
  quem abre a volta é o aviso, não a melhor peça.

**A transição de cada tipo** (medido no código e quadro a quadro, a cada 50 ms):

| Tipo | Medido | Régua (0,4–0,7 s) |
|---|---|---|
| Peça da IA (peca-html, quase tudo hoje) | A peça nova entra inteira **de uma vez** (corte seco); a saída de 0,7 s acontece por baixo e não aparece. Depois, cada texto entra em 0,7 s, um a cada 0,15 s: a cascata termina em ~1,45 s (`js/peca-render.js:65`) | Corte seco no fundo; cascata lenta (régua: 0,25–0,4 s por elemento, 60–100 ms entre eles) |
| Texto, aviso antigo, foto (GSAP) | Entrada 0,95 s (fade/slide), 1,05 s (zoom), 1,2 s (cinematic, o padrão das campanhas) (`js/player.js:44`); saída 0,7 s | Longa demais |
| Urgente (toma a tela) | Fundo 0,6 s; cartão 0,7 s; vinheta vermelha 2 × 1 s; o selo "Aviso importante" **pulsa sem parar** (`css/player.css:1220`) | Entrada boa; o pulso infinito fere a regra de "nada se mexendo mais de 5 s" |
| Zonas ao montar | 0,9 s, uma a cada 0,1 s | Longa |
| Entrada "girar" das peças | Rotação de −12° com escala (`js/peca-render.js:56`) | A régua pede sem giro |

**O ritmo.**
- Toda peça fica 12 s (campanha) ou 15 s (aviso, calendário), seja qual
  for o número de palavras. Oferta deveria ficar ~8 s; dica de saúde com
  20 palavras, ~20 s.
- Com uma peça só na faixa, a mesma peça "entra de novo" a cada 12 s: a
  animação se repete por horas.
- O urgente sozinho na zona troca por ele mesmo a cada 15 s, com sino (pelo código).
- A cada troca de peça da IA, o fundo aparece na hora e os textos chegam
  aos poucos: por ~1 s a tela mostra o fundo com parte do texto. Numa
  peça de 12 s, é quase 10% do tempo.

**O quanto mexe.** As peças da IA não usam animação contínua (bom). O que
cansa é o urgente: selo pulsando, vinheta e sino repetidos o dia inteiro.

---

## 6. Os 10 piores problemas

**1. O urgente não tem teto nem fim.**
Prova: Loja Centro com 2 urgentes: 60% do tempo da zona principal e a tela inteira tomada em ~46% do tempo, a semana toda; sozinho, pelo código, toma a tela sem parar e o sino toca a cada 15 s.
Onde: `js/player.js:2010` (peso 3), `js/player.js:2141` e `:1585` (toda passada toma a tela), `js/player.js:1618` (sino toda vez), `web/src/lib/aviso.js:72` (sem "até quando", fica para sempre).
Conserto: teto de 25% (15 s por minuto) dividido entre os urgentes; sino só na entrada; fim padrão de 2 h; peso de passada 1 (a frequência vem do teto, não do peso).

**2. O horário das peças segue o relógio da TV, não o da loja.**
Prova: TV com box em UTC: café da manhã às 3h–4h, almoço às 10h, happy hour às 15h–16h; e o café some às 8h30.
Onde: `js/player.js:2212` (`new Date()` local) — o horário da loja já usa o fuso certo em `js/expediente.js`.
Conserto: `agendadoAgora` usar `MTExpediente.relogioLocal(t, fuso)` com o fuso da conta (America/Sao_Paulo por padrão).

**3. A campanha deixa buracos no dia.**
Prova: cenário 1 sem almoço nem noite; cenário 2 sem tarde. Na semana: 98 horas de relógio no S1 Balcão, 7 delas por dia dentro do horário de uma padaria.
Onde: `server/ai-director.js:202` (o prompt só pede para variar) e `:309` (o espalhamento só corre quando a IA esquece a faixa).
Conserto: depois do plano, conferir a cobertura contra o horário da loja; faixa vazia ganha a peça-âncora ("dia") ou uma peça a mais.

**4. Uma peça por faixa: a mesma peça repete sem parar.**
Prova: cenário 2, cada faixa com uma peça só, que reentra a cada 12 s por horas. A IA disse "3 peças para cada horário" e fez 3 no total.
Onde: `js/player.js:2013` (lista de 1 não reveza) e `:2055` (com horário, nunca fica parada); o cartão do Criar (`js/escopo.js`) não multiplica as peças pelas faixas.
Conserto: mínimo de 3 peças por faixa usada; o player deixa a peça parada quando é a única no ar; o cartão mostra "3 faixas × 3 peças".

**5. A volta não respeita o tempo de espera.**
Prova: sala de espera com volta de 72 s (régua: 8–12 min); balcão com 31 peças e ~7 min (régua: 2–5 min; o painel diz "ciclo de 6min 30s", sem alerta). O painel só avisa volta curta (< 45 s).
Onde: `web/src/lib/screenDigest.js:75`; o plano da IA não usa o tempo de espera da frente.
Conserto: alvo por frente (Comércio 2–5 min, Saúde 8–12, Empresas 3–6). Volta longa: rodízio (cada volta mostra uma parte, a próxima mostra o resto). Saúde: a IA calcula quantas peças fazer.

**6. A IA não respeita "urgente" nem "por cima de tudo".**
Prova: "Urgente: o sistema está fora do ar" e "Acabou o pão de queijo! Põe por cima de tudo agora" viraram Alta.
Onde: `server/aviso-rapido.js:94` (urgente só para segurança) e `:109` (o valor da IA vence a palavra do cliente).
Conserto: se o cliente escreveu "urgente", "agora", "por cima", é urgente; a tela diz por que sugeriu outra coisa.

**7. Data especial só se o cliente lembrar e souber o dia.**
Prova: "Black Friday e Natal" → "Não achei nenhuma data no texto".
Onde: `server/calendario.js:117` ("Ignore o que não tem data"); as datas já são calculadas em `js/seasons.js`.
Conserto: resolver datas pelo nome; mostrar "Datas do comércio nos próximos 60 dias" para marcar com um toque; a IA propõe a campanha 14 dias antes.

**8. Transições longas e corte seco.**
Prova: GSAP 0,95–1,2 s; peça da IA entra de uma vez e a cascata vai até 1,45 s; selo do urgente pulsando sem fim.
Onde: `js/player.js:44`, `js/player.js:116` (peça sem transição), `js/peca-render.js:65`, `css/player.css:1220`.
Conserto: troca em 0,5 s (fundo em crossfade), elementos em 0,35 s com 80 ms entre eles, total até 0,9 s; pulso só 2 vezes; tirar "girar".

**9. O tempo de cada peça não depende do texto.**
Prova: todas com 12 s ou 15 s; oferta deveria ter ~8 s, dica de saúde ~20 s.
Onde: `web/src/lib/aviso.js:59` (15 s), `server/compositor.js:265` (12 s), `web/src/lib/calendario.js:74` (15/20 s).
Conserto: duração = 1 s por palavra, mínimo 6 s, máximo 20 s (30 s em Saúde educativa); oferta 8 s.

**10. O aviso não sai na hora e entra cedo demais.**
Prova: "até quando" só aceita dia; aviso de feriado criado em 05/11 passa 10 dias com prioridade alta; o urgente "até você tirar".
Onde: `web/src/lib/aviso.js:72`; `web/src/components/tela/AvisoRapido.jsx:129`.
Conserto: campo "até que horas"; início pela mesma antecedência do calendário (`server/calendario.js:20`); urgente com fim obrigatório.

Também vistos (menos graves):
- O layout padrão (Painel Notícias) fica com a lateral e o rodapé vazios quando a campanha só enche a principal (cenários 2, 3, 11).
- A lista do editor não marca o urgente (`web/src/pages/ContentEditorPage.jsx:683`).
- "Deixa mais animado" muda só a cor de uma TV (`server/assistente.js:525`).
- Aniversariantes vêm desligados (`server/automaticos.js:47`).
- O horário da loja mora em Telas, longe da Programação.
- Indicador que se atualiza exige JSON e token.
- O letreiro (rodapé) não tem horário: "café da manhã" ao meio-dia.

---

## 7. O que os melhores fazem e nós não

| O quê | Quem faz (pelo que documentam) | Nós |
|---|---|---|
| Parte do dia como recurso nativo, com o cardápio inteiro trocando por horário | Starbucks, Look Digital Signage (REFERENCIAS.md) | Existe por peça, mas a IA deixa faixas vazias |
| Loop com tamanho máximo e slots fixos | Broadsign (loop policy) | Sem limite |
| Fatia de tempo garantida para a interrupção ("share of voice") | Xibo (interrupt layouts), Broadsign (saturação) | Peso por passada, sem teto |
| Alerta de emergência com fim automático e em todas as telas de uma vez | ScreenCloud, Yodeck, OptiSigns, Appspace | Em todas de uma vez, sim; fim automático, não |
| Peça com data e **hora** de expirar | ScreenCloud, Yodeck | Só data |
| Separar duas peças parecidas na sequência | Broadsign (separação) | Não |
| Agendamento no fuso da tela ou da rede | Broadsign, ScreenCloud | Relógio do aparelho |
| Tema travado, o cliente só edita campos | Appspace | Parcial (marca na peça) |

Xibo, Yodeck e OptiSigns não estão em `REFERENCIAS.md`: conferir nas
páginas deles antes de citar fora deste relatório.

O que só nós temos e vale manter: a IA que entende "até sábado" e "só na
loja do Centro" numa frase, o Desfazer de 30 dias, e o aviso que pergunta
a data do feriado com sugestões certas.

---

## Limites do teste

- 2 minutos por hora de TV: a volta longa (Shopping) foi calculada pelas peças, não vista inteira.
- As fotos foram tiradas com o relógio falso: as animações em CSS correm no tempo real, então algumas fotos pegam a peça no meio da entrada.
- No Shopping, parte das 30 peças foi copiada de peças do calendário: a mistura de prioridades dele não vale para a análise de importância (só para o tamanho da volta).
- Fotos geradas pela IA não foram testadas (teto de custo): todas as campanhas foram "Sem foto".
- O indicador que se atualiza não foi ligado (precisa de um sistema com JSON).

## Arquivos

Fotos e dados em
`/tmp/claude-0/-home-user-Multi-telas/b804d644-700b-5e83-ad8f-5fe2da78625e/scratchpad/b3/`:
- `shots/` — cada passo dos cenários (s1-… a s12-…);
- `semana/` — a TV em horas escolhidas (tvN-dia_hora.png), o log de cada TV (tvN.json) e o resumo (resumo.json);
- `semana.js`, `analise.js`, `relatorio.js` — o robô da semana simulada (relógio do Playwright).
