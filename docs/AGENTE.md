# O agente do Criar

O pedido do dono (25/11): *"Criar um agente inteligente. A intenção é deixar
ainda mais fácil para o cliente, e reduzir o uso incorreto ou indesejado da IA
no projeto."* E a pergunta de antes: dividir o pedido em subagentes, com um
orquestrador dividindo as tarefas? **Sim** — é o que está aqui.

O código mora em `server/agente/`. O Criar continua sendo a conversa de
sempre; o agente entra no lugar do maestro (`server/assistente.js`) a cada
fala, e devolve a resposta no mesmo formato. Desligado ou caindo, a fala é a
do maestro, igual a antes.

## As decisões do dono (valem)

1. **Ligado para toda conta**, inclusive a do cliente de lançamento.
   Freio de emergência: `MT_AGENTE=desligado` (todas as contas, sem deploy de
   código) e o botão **Desligar nesta conta** na ficha da conta, em
   Plataforma › Contas (só operador). Quando o agente falha (erro, prazo,
   gasto, IA fora), a fala cai **sozinha** para o fluxo de antes.
2. **Publica sozinho, mas só depois da validação.** A pessoa vê o plano (o
   esboço de cada item, com o texto que vai para a TV) e toca em
   **Validar e pôr no ar**. Daí em diante o agente gera, confere e publica sem
   outro toque, e mostra o que fez com **Desfazer**. Respeita a permissão: o
   membro de uma conta com aprovação manda para a fila do dono. Nunca apaga,
   nunca mexe em plano, cobrança ou equipe, nunca em outra conta.
3. **Fato inventado continua aviso**: não barra, aparece no fim
   ("Confira: …"). E o agente **pergunta** preço, hora, pratos e TV que a
   pessoa não disse, em vez de inventar.
4. **Teste com a IA de verdade até R$ 20.** Ver "Avaliação".

## Como funciona

### Uma fala (POST /api/ai/conversa)

```
fala da pessoa
  │
  ├─ 1. GUARDAS sem IA (guarda.js) — o que barra aqui não gasta nada
  │      freio de falas · injeção · laço · apagar/plano/equipe/outra conta
  │      · "oi" e pedido vago · fora do escopo · privacidade · "publica sem eu ver"
  │
  ├─ 2. CONTEXTO da conta (contexto.js) — o que está no ar em cada TV, as
  │      campanhas recentes, as zonas, os aniversariantes da planilha,
  │      a permissão de quem pede (TVs já filtradas pela loja dela)
  │
  ├─ 3. O LAÇO (orquestrador.js + cerebro.js), no máximo 8 passos:
  │      planejar → (especialistas em paralelo) → observar → refazer 1x
  │      → perguntar | apresentar_plano | responder
  │
  └─ 4. A RESPOSTA: pergunta (até 2), recusa curta, ou o PLANO para validar,
         guardado na conversa com a chave dele
```

O **cérebro** é a IA por chamada de função nativa (`motores.chamar` com
`turnos`: o resultado de cada ferramenta volta para ela na volta seguinte),
ou, sem IA, a mesma sequência por regra (`cerebroRegra`). As respostas às
perguntas do agente e a continuação da campanha em conversa vão direto pela
regra (as tarefas já estão decididas; não gasta).

As ferramentas que a IA vê **só leem a conta e montam rascunhos**:

| ferramenta | o que faz |
|---|---|
| `ler_conta` | o que está no ar, as campanhas recentes, os aniversariantes, as TVs com as zonas |
| `planejar` | divide o pedido em tarefas (até 5) e manda cada uma ao especialista |
| `refazer_tarefa` | refaz uma tarefa com o pedido corrigido (uma vez cada) |
| `perguntar` | termina perguntando (no máximo 2 perguntas, com proposta) |
| `apresentar_plano` | termina mostrando o plano para validar |
| `responder` | termina com uma resposta curta (dúvida, fora do escopo, recusa) |

Não existe ferramenta de publicar, apagar, plano ou equipe para a IA. A
ferramenta que ela inventar (ou que um texto mandar chamar) volta como
"ferramenta desconhecida", e o laço segue.

### Os especialistas (subagentes.js)

Cada tarefa vai para UM especialista, com o pedaço dela, as TVs dela, o que
está no ar e as respostas da pessoa — e mais nada:

| tarefa | especialista | o rascunho que a pessoa valida |
|---|---|---|
| aviso | `aviso-rapido.js` | o título, o detalhe, até quando, urgente ou não |
| quiz | `quiz-ia.js` | as perguntas com a certa marcada (validar é o "conferi") |
| peça (aniversariantes, cardápio, segurança, metas, promoção…) | o escritor do ecossistema (`escreverTextos`) | **os textos que vão para a TV** (o desenho sai depois, com eles) |
| campanha (várias peças, redes, horários) | `ai-conversa.js` (a conversa de sempre) | o esboço do escopo (D42) |
| aparência da TV | `ajuste-tela.js` | a lista de mudanças — **a pessoa aplica** no antes e depois de sempre |
| ajuste ("deixa maior", "troca a cor", "tira a foto") | `ajuste-peca.js` (o remendo) ou `ajuste.js` (redesenhar) | o que vai mudar na peça |
| dúvida | a AJUDA do Criar | a resposta, com o caminho do painel |

O pedido longo de WhatsApp ("1) aviso… 2) lembrete… 3) parabéns…") vira
uma tarefa por linha.

### A validação e a execução (POST /api/ai/agente)

1. O painel manda `{ conversaId, chave }`. O servidor confere que a chave é a
   do **plano mais novo da conversa** e que o plano guardado não foi mexido
   (a chave é o sha256 do que vai ao ar: tipo, TVs, quando e o rascunho).
   Plano mudado: 409, nada roda.
2. A validação é **gravada na conversa** (quem, quando, a chave) antes de
   qualquer coisa ir ao ar. Na campanha completa, ela grava também a
   aprovação do esboço (`esboco.aprovar`), que o gerador de sempre exige.
3. Roda como trabalho (`server/jobs.js`, aparece em Criando). Cada item, os
   independentes em paralelo (3 de cada vez):
   - **gerar**: o aviso vira a peça-ouro de alerta com a marca; a peça é
     desenhada com os textos validados; a campanha passa pelo gerador de
     sempre;
   - **conferir** (`critico.js`): a porta (`js/peca-html.js`), a régua da
     letra (`js/regras-composicao.js`, só no desenho da IA), a lei
     (`js/regras-de-conteudo.js`: barra), os fatos (avisa), nome de paciente
     (barra), a repetição com o que está no ar;
   - **revisar** (no máximo uma vez, com IA e com orçamento): uma régua curta
     — combina com a marca, dá para ler a 4 m, não repete o que está no ar,
     atende ao pedido — e no máximo **uma** correção do desenho (os textos
     validados não mudam). A porta recusou o desenho: a peça-ouro com os
     mesmos textos;
   - **o encaixe no painel** (`encaixe.js`): antes de qualquer item ir ao
     ar, a execução para em **"Conferindo o encaixe…"** e anuncia um código
     no andamento do trabalho. O painel aberto (`PlanoDoAgente`, que já
     acompanha o trabalho) pega as peças (`GET /api/agente/encaixe/:código`),
     roda o encaixe de sempre (`web/src/lib/encaixeAuto.js`: conferir no
     tamanho da TV, UM redesenho pela IA, a peça-ouro pelo
     `POST /api/pecas/reserva`) e devolve o que deu em cada uma (`POST`). A
     peça nova passa de novo pela porta e pela lei antes de entrar; a que
     não coube vai ao ar com o aviso **"Confira: Pode não caber na TV: …"**.
     **Painel fechado**: ninguém pega em 15 s e a execução segue só com a
     conferência do servidor; pegou e não voltou em 3 min, idem. O registro
     diz qual foi ("sem o painel aberto: publicado só com a conferência do
     servidor"). Todos os itens esperam no mesmo portão: o plano vai ao ar
     junto, depois da conferência;
   - **publicar** (`publicar.js`): pela operação em lote de sempre
     (`ctx.publicar.operacao` = `POST /api/lote/operacao`), com a **sessão de
     quem pediu**: só as TVs dela, a versão de cada TV, tudo ou nada, o
     Desfazer, e o **pedido de aprovação** (202) para o membro com aprovação.
     Cada função de publicar confere a validação de novo antes de tudo.
4. A conversa recebe a mensagem final (curta) e o cartão do resultado: o que
   foi para o ar e onde, o que foi para a aprovação, o que não foi e por quê,
   os avisos ("Confira: …") e **Desfazer** (o Desfazer de cada envio).

O ajuste **confere que a peça mudou** (o desenho, os campos, as cores, o
modo). Não mudou: uma segunda tentativa com o pedido dito de forma
explícita; ainda igual, a resposta diz "Não consegui mudar…" — nunca
"Feito". A peça que estava no ar vai de novo (a campanha do mesmo nome troca
só o que é dela, com Desfazer).

**Variedade**: o que está no ar e as campanhas recentes são negativos. Com
IA, vão no pedido dos textos ("não repita: …") e o título repetido é escrito
de novo uma vez; sem IA, cada tema tem uma lista de títulos e vale o primeiro
que não está no ar.

### Os tetos (limites.js)

| teto | padrão | variável |
|---|---|---|
| passos do laço por fala | 8 | `MT_AGENTE_PASSOS` |
| tempo do plano | 45 s (passou: cai para o fluxo de antes) | `MT_AGENTE_PRAZO_MS` |
| gasto de texto do plano, por fala | R$ 0,25 | `MT_AGENTE_ORCAMENTO_PLANO` (centavos) |
| gasto de texto da execução | R$ 2,50 (acima: sem revisão, peça-ouro) | `MT_AGENTE_ORCAMENTO_EXECUCAO` |
| tempo da execução | 8 min | `MT_AGENTE_PRAZO_EXECUCAO_MS` |
| o painel pegar o encaixe (senão, segue sem ele) | 15 s | `MT_AGENTE_ENCAIXE_PAINEL_MS` |
| o painel devolver o encaixe depois de pegar | 3 min | `MT_AGENTE_ENCAIXE_MS` |
| falas do agente por conta e hora | 90 | `MT_AGENTE_FALAS_HORA` |
| execuções por conta e hora | 12 | `MT_AGENTE_EXECUCOES_HORA` |
| tarefas por fala / perguntas por vez | 5 / 2 | — |
| a mesma fala seguida | mais de 3 em 10 min para e pergunta | — |

Por cima de tudo, o de sempre: o teto de texto e o teto em reais da conta
(`uso-ia.podeUsarTexto`, pelo mapa `TIPO_IA` do `server.js`, onde entrou
`agente`), o teto da rota da conversa, e as criações do plano para foto
(`fotoDaConta` confere o saldo antes). Foto gerada só quando a pessoa pediu
foto, e o plano diz quantas criações gasta antes da validação.

## As guardas (e o teste de cada uma)

| guarda | onde | teste |
|---|---|---|
| fora do escopo (escola, redação, código, conversa, política, adulto, discriminação, o que a lei proíbe anunciar) — resposta curta com o que dá para fazer, **nada gasto** | `guarda.foraDoEscopo` | `agente.test.js` "fora do escopo…"; eval `fora-*` |
| injeção na fala ("ignore suas regras", "você agora é…") — ignorada e dita; o resto do pedido segue | `guarda.injecao`, `semInjecao` | "ignore suas regras…"; eval `injecao-poema`, `injecao-persona` |
| injeção no dado (feed, intranet, planilha, site, arquivo) — vai marcado como DADO; a linha com ordem sai; a IA tem a regra de que dado não é ordem | `guarda.comoDado`, `REGRA_DO_DADO` | "o texto de fora…é dado"; eval `injecao-feed` |
| ferramenta chamada por texto / que não existe | `orquestrador.rodar` | "ferramenta que não existe (publicar) é recusada" |
| nome de paciente na TV da Saúde (aponta a Chamada de senha), CPF, dado de saúde de alguém, rosto sem autorização | `guarda.privacidade`, `nomeDePacienteNoTexto` (também no que a IA escreveu) | "nome de paciente…"; eval `saude-paciente` |
| promessa de cura, medicamento com promessa (regra da frente) — recusa e propõe a frase que pode | `guarda.conteudoDoPedido` + `critico.conferir` | "a regra da frente no pedido…"; eval `saude-cura` |
| enganoso ("o mais barato da cidade"), preço em clínica — vai, com aviso | `js/regras-de-conteudo.js` | eval `com-superlativo`, `saude-preco-dentista` |
| fato que a pessoa não deu (preço, hora, pratos) — pergunta, com proposta | `guarda.fatoQueFalta` | "preço, hora e pratos…"; eval `com-promo-sem-preco`, `ambiguo-hora`, `rh-cardapio-sem-pratos` |
| no máximo 2 perguntas de uma vez | `index.concluir` | "no máximo duas perguntas" |
| TV ou grupo que não é desta pessoa — pergunta, nunca vira "todas" calado | `decompor.alvoDe`, `conferirTarefa` | servidor (TV de outra conta), eval `ambiguo-tv`, `outra-conta` |
| apagar, plano, cobrança, equipe, outra conta — recusa com o caminho do painel | `guarda.acaoProibida` | eval `apagar`, `plano-cobranca` |
| "publica direto sem eu ver" — mostra o plano mesmo assim | `guarda.querPularValidacao` | eval `pular-validacao` |
| "pode publicar" digitado — aponta o botão (a validação é o toque) | `index.volta` | eval `publicar-por-texto` |
| publicar sem a validação, com a chave de outro plano, ou com o plano mexido | `publicar.conferirValidacao`, rota | "publicar: sem a validação…", servidor (chave errada, 409) |
| permissão: só as TVs da pessoa; membro com aprovação vai para a fila | `publicar`, operação em lote | "publicar: só as TVs…", servidor (membro), eval `membro-aprovacao` |
| laço (a mesma fala repetida), freio de falas e de execuções por hora | `guarda.emLaco`, `limites.contar` | "laço…", "o freio de falas…"; eval `laco` |
| tetos do laço (passos, tempo, gasto) e a queda para o fluxo de antes | `orquestrador.rodar`, `index.responder` | "laço: no máximo 8 passos…", "o gasto… o tempo", "queda: …" |
| a peça que não cabe na TV: o painel redesenha uma vez ou põe a peça-ouro; a que sobra vai marcada; a peça nova que volta do painel passa de novo pela porta e pela lei | `encaixe.js`, `executor.js` (`aplicar`) | `agente-encaixe.test.js` (pausa, retomada, prazo, portão, peça inválida), servidor (o teste faz o papel do painel; o membro sem painel), navegador |
| desligar (global e por conta) | `limites.ligadoPara` | "freio: MT_AGENTE=desligado…", servidor (o operador desliga a conta) |
| Desfazer | o Desfazer de cada envio | servidor ("Desfazer: o envio do aviso volta", e o que estava na TV fica) |

## O registro (o operador vê)

Cada fala do agente (plano, pergunta, resposta, recusa, queda) e cada
execução vira uma linha em `agente_execucoes` (`server/agente/banco.js`,
ligado ao fim de `db-sqlite.js` e `db-postgres.js`): os passos com a
ferramenta e o resultado de cada um, o gasto medido, a conferência, o que foi
publicado (tipo, estado, TVs, envio, pedido de aprovação) e o pedido curto
(200 letras). Guarda 180 dias; apagar a conta apaga as linhas dela.

Na Plataforma:
- **Agente do Criar** (embaixo da Qualidade das gerações): só contagens —
  voltas, planos, perguntas, recusas por tipo, quedas, execuções, quanto foi
  para as TVs e para aprovação, passos e gasto médios;
- **na ficha da conta** (Contas): o freio dela (Ligar/Desligar nesta conta,
  em `agente_contas`) e as últimas 15 voltas, com os passos.

## O painel

No Criar, embaixo da mensagem da IA (`web/src/components/criar/PlanoDoAgente.jsx`):
- **o plano**: cada item com o que vai, onde e até quando, o texto da peça,
  as perguntas do quiz com a certa marcada, os avisos e o que não vai (com a
  frase que pode); o botão **Validar e pôr no ar** (ou **Validar e mandar
  para aprovação**) só no plano mais novo; "Quer mudar algo? É só dizer";
- **o andamento**, item por item (o servidor manda o estado de cada um no
  trabalho: na fila, fazendo, pronto, não foi), e o **encaixe**: no
  "Conferindo o encaixe…" o próprio cartão pega as peças, confere, e
  devolve (o conferidor e o redesenho carregam só nessa hora);
- **o resultado**: no ar (onde), esperando a aprovação do dono, não foi (por
  quê), "Confira: …", **Desfazer**, e o link para a campanha em Biblioteca.

A mudança de aparência da TV abre o antes e o depois de sempre. Com o agente
desligado, o Criar é exatamente o de antes. Conferido no navegador, no
computador e no celular (390 px), e o encaixe: o cartão parado em "Conferindo o encaixe…" com cada item fazendo, o painel pegando e devolvendo as peças, e o resultado.

## Avaliação

`tools/eval-agente.mjs`, 47 casos: Empresas/RH (reunião, aniversariantes,
cardápio com e sem os pratos, EPI, metas com e sem número, quiz,
boas-vindas, urgente), várias coisas numa fala (três tarefas, a lista do
WhatsApp, quiz + aviso), ambíguos (sem hora, TV que não existe, "oi", vago),
ajustes (cor, claro, tirar o apoio, maior), variedade (o mesmo pedido com o
anterior no ar), Comércio, Saúde e uso errado (fora do escopo ×5, injeção na
fala ×2 e no feed, pular a validação, "pode publicar", outra conta, apagar,
plano, laço, membro com aprovação). Os que mandam executar rodam o executor
até o envio (de mentira: nada sai).

```
node tools/eval-agente.mjs               # sem IA, cérebro por regra — no npm test
node tools/eval-agente.mjs --simulado    # o caminho inteiro da IA com um modelo de mentira — no npm test
node tools/eval-agente.mjs --vivo     # com a IA de verdade (a chave do provedor no ambiente); sonda antes; teto MT_EVAL_TETO_CENTAVOS (1800)
```

| modo | resultado | gasto |
|---|---|---|
| sem IA (regra) | **47/47** | R$ 0,00 |
| IA simulada (abertura, ferramentas e voltas de verdade; modelo de mentira, que tenta chamar "publicar" na fala com ordem e escreve o grupo em minúsculas) | **47/47** | R$ 0,00 |
| **ao vivo** | **pendente**: a chave guardada para o teste está sem crédito — recusou na primeira chamada ("créditos pré-pagos esgotados"). Parei aí, como combinado. | **R$ 0,00** |

**A avaliação ao vivo está pendente porque a chave guardada não tem
crédito.** Na tentativa, o agente fez o que devia com a IA fora: caiu para o
maestro, que caiu para a regra — a pessoa teria recebido resposta. Para rodar
quando houver crédito: o comando `--vivo` acima (a sonda para tudo se a chave
recusar; o teto de R$ 18 vale).

Por grupo (sem IA e simulada): empresa 10/10 · várias 3/3 · ambíguo 4/4 ·
ajuste 4/4 · variedade 2/2 · comércio 5/5 · saúde 4/4 · uso errado 15/15.

Sem IA, "deixa o título maior" não tem como redesenhar: o certo, e o que o
agente faz, é dizer que não mudou (com IA, o caso exige que mude).

## Decisões que tomei (dono dormindo)

1. **Sem IA (servidor local, testes), o agente fica desligado** a não ser com
   `MT_AGENTE=ligado`. O maestro com regras já cobre o modo demonstração, e
   os ~2.200 testes do fluxo de antes ficam valendo. Em produção, com IA, ele
   liga sozinho para todas as contas.
2. **A validação é o toque no botão**, não uma frase. "Pode publicar"
   digitado recebe "toque em Validar". Assim a validação tem dono, hora e a
   chave exata do que foi visto.
3. **Os textos da peça são escritos antes da validação** e o desenho depois,
   com eles: a pessoa valida o que vai ser LIDO na TV. A revisão da IA só
   mexe no desenho. Na campanha completa, a validação é a do esboço (D42),
   como sempre foi.
4. **A aparência da TV não é aplicada sozinha**: trocar layout pode esconder
   uma zona com conteúdo. O agente prepara e a pessoa aplica no antes e
   depois de sempre (o item aparece como "você aplica").
5. **O agente não apaga**: não há ferramenta. "Tirar a peça" é recusado com o
   caminho. Republicar a campanha do agente com o mesmo nome (o cardápio
   novo no lugar do cardápio de antes do agente) é troca, como o "Pôr pra
   rodar" de sempre, com Desfazer.
6. **Cada peça avulsa vira uma campanha de uma peça** em Biblioteca ›
   Campanhas, com nome estável por tema ("Cardápio da semana",
   "Aniversariantes do mês"): dá para editar depois com o Editar com a IA, e
   o próximo ajuste do agente ("deixa azul") vai nela.
7. **Os aniversariantes**: só os nomes da planilha da conta (Automáticos),
   e sem a planilha, nenhum nome.
8. **Até quando**: a reunião de amanhã sai depois de amanhã; o cardápio da
   semana, no domingo; o aniversariante do mês, no fim do mês; o resto fica
   até alguém tirar. O que a pessoa disse ("até sexta") vence.
9. **O cardápio vai para as TVs do refeitório** quando a conta tem um grupo
   ou TV com esse nome; senão, todas (e o plano diz onde).
10. **O freio por conta mora na ficha da conta** (Plataforma › Contas), só
    operador; a contagem do agente mora ao lado da Qualidade das gerações,
    sem conta nem texto. As linhas com texto curto ficam só na ficha.
11. **O registro guarda 180 dias** e o pedido com até 200 letras.
12. **O encaixe é do painel, com prazo curto**: medir se a peça cabe exige
    desenhá-la no tamanho da TV, e quem desenha é o navegador. Com o
    painel aberto, nada vai ao ar sem a conferência; com ele fechado (a
    pessoa validou e saiu), esperar não adianta — 15 s e segue só com a
    conferência do servidor, dito no registro. O quiz (sem peça desenhada)
    espera no portão também, para o plano entrar junto.
13. O CLAUDE.md pede para perguntar antes de cada tarefa; o pedido desta
    noite era trabalhar sozinho até de manhã. As decisões estão todas aqui.

## Arquivos

Novos: `server/agente/` (`index.js`, `guarda.js`, `decompor.js`,
`contexto.js`, `subagentes.js`, `cerebro.js`, `orquestrador.js`,
`critico.js`, `variedade.js`, `executor.js`, `publicar.js`, `registro.js`,
`banco.js`, `limites.js`, `rotas.js`, `encaixe.js`), `tools/eval-agente.mjs`,
`tools/modelo-simulado.js`, `web/src/components/criar/PlanoDoAgente.jsx`,
`web/src/components/platform/Agente.jsx`, `test/agente.test.js`,
`test/agente-servidor.test.js`, `test/agente-avaliacao.test.js`,
`test/agente-painel.test.js`, `test/agente-encaixe.test.js`.

Mudanças pequenas em arquivos de todos: `server/motores.js` (as voltas de
chamada de função), `server.js` (a rota e `agente` no `TIPO_IA`),
`server/routes/conversas.js` (o agente no lugar do maestro), `server/db-sqlite.js`
e `server/db-postgres.js` (uma linha cada), `server/creditos.js` (o tipo
`agente`), `package.json` (o lint vê `server/agente/`), `web/src/api.js`,
`web/src/pages/CriarPage.jsx`, `web/src/pages/PlatformPage.jsx`,
`web/src/lib/trabalhos.js`, e três testes que liam o texto exato do que mudou
(`conversa-memoria`, `portao-ia`, `criando`).

## O que falta

- **A avaliação ao vivo**, quando a chave tiver crédito (o comando acima).
  É ela que mede o quanto a IA de verdade divide, pergunta e escreve bem.
- **O encaixe sem o painel**: com a página fechada, a peça vai só com a
  conferência do servidor (ela não mede a peça desenhada). Medir no servidor
  exigiria um navegador nele.
- **A agenda como ferramenta**: hoje o agente não grava datas na Agenda
  (o pedido de data vira aviso com validade).
- **Mexer no plano pelo cartão** (trocar as TVs de um item com um toque):
  hoje é pela conversa ("o parabéns só no RH").
