# Plano de ação: do 6,2 ao 10

**O objetivo:** um sistema que vale o preço. Na prática, é cada bloco em 9
ou mais, medido pelo mesmo robô do QA. Ao fim de cada fase o robô mede de
novo, e a fase só termina quando a meta dela é batida.

**Fases pequenas, não grandes.** Cada fase leva de 1 a 5 dias e termina
em algo que você vê funcionando e aprova antes da próxima. Assim cada
mudança é testada sozinha, um problema aparece cedo e não se mistura com os
outros, e dá para mudar a ordem no meio do caminho. Fase grande junta risco
e só mostra o resultado no fim.

As causas, com arquivo e linha, estão nos relatórios de cada bloco
([RESULTADO.md](RESULTADO.md)).

## Como saber que chegou no 10

| Medida | Hoje | Meta |
|---|---|---|
| Fotos da TV que passam na régua (tela cheia) | 15% | 95% |
| Fotos que passam na régua (lateral e bloco pequeno) | 0% | 85%, só com os tipos que fazem sentido ali |
| Contas com marca cuja TV sai com a marca | 0% | 100% |
| Média das criações da IA (os 60 pedidos) | 6,3 | ≥ 8,5, nenhuma abaixo de 7 |
| Semana simulada: buracos, urgente acima do teto, repetição seguida | muitos | 0 |
| Telas que quebram com dados antigos | 4 | 0 |
| Cliques das tarefas principais | 4 a 13 | ≤ 3 |
| Nota da interface | 5,5 | ≥ 9 |
| Telas prontas aprovadas por frente | 1, 0 e 0 | ≥ 12 em cada |

## As fases

### Fase 0: nada quebra, nada mente (1–2 dias)
**Objetivo:** consertar o que quebra ou engana o cliente hoje.
- O painel limpa a programação ao ler, com o mesmo código que a TV usa (`web/src/api.js:119` + `js/storage.js`). Isso acaba com as quebras da Programação e do editor com dados antigos.
- Uma campanha antiga não derruba mais a lista de campanhas (`server/ajuste.js:76`, `server/routes/campanhas.js:42`).
- A TV não trava com um número no letreiro (`js/player.js:2280`). Nunca mostra texto interno nem a demonstração de outra empresa (`js/render.js:2102`, `js/storage.js:189`).
- Os horários seguem o fuso da loja, não o da TV (`js/player.js:2212`).
- O urgente ganha um fim padrão de 2 h (`web/src/lib/aviso.js:72`), o som toca só na entrada (`js/player.js:1618`), e a IA respeita quando o cliente escreve "urgente" (`server/aviso-rapido.js:94`).
- A IA recebe o nome da empresa e a frente da conta em todo caminho de criar (`server.js:2062`, `server/ai-director.js:1222`, `CriacaoRapidaPage.jsx:283`).
- Entra a regra legal de superlativo, como "o mais barato da cidade" (`js/regras-de-conteudo.js:96`).
- O e-mail de fim do teste para quem nunca ligou TV deixa de dizer "a TV continua no ar" (`server/lembretes.js:104`).

**Pronto quando:** 0 quebras nas quatro contas do QA, e o teste de cada conserto passando.

### Fase 1: limpar antes de construir (1–2 dias, depois da sua aprovação)
**Objetivo:** as fases seguintes trabalham com menos coisa.
- Esconder o que sai e juntar o que vira um só, pela lista de [O-QUE-FALTA.md](O-QUE-FALTA.md) (parte C).
- Nada é apagado: a TV que usa um item que saiu continua rodando.

**Pronto quando:** o "Adicionar" e os layouts mostram só o que fica.

### Fase 2: a régua no código (2–3 dias)
**Objetivo:** a letra da TV passa a ser de TV.
- Uma escala de letra única, ligada ao lado menor da TV:
  - piso de 4,5%;
  - texto corrido em 7,5% ou mais;
  - título de 10% a 14%;
  - destaque de 18% a 35%.

  Ela substitui os tetos em pixel (`css/player.css`, umas 280 regras; `:1232` é o exemplo).
- A régua interna sobe para a profissional: a bancada e a conferência das peças passam a reprovar o que hoje aprovam (`js/regras-composicao.js:32`, `js/peca-conferir.js`).
- A IA para de pedir "kicker pequeno" (`server/compositor.js:58`), e a biblioteca de peças-ouro sobe para a régua.
- O robô do QA vira teste automático: entra no CI e reprova a mudança que deixar letra pequena.

**Pronto quando:** 95% das fotos em tela cheia passam na régua.

### Fase 3: zonas que se adaptam (3–4 dias)
**Objetivo:** bonito em qualquer formato, com o cliente escolhendo.
- **Cinco formatos de zona:** larga, alta, quadrada, faixa e bloco. Cada tipo diz o que mostra em cada um (esconde o apoio, empilha, deixa só o número ou o preço) em vez de encolher.
- **A régua depende de onde a TV fica:** balcão, recepção ou escritório. No escritório, com zonas, a pessoa lê de perto. No balcão, o sistema sugere menos zonas.
- **Papéis das zonas na Empresas:** principal, lateral de informação (hora, clima, aniversariante, indicador), faixa de avisos e cabeçalho.
- **A zona vazia some ou recebe algo útil,** e a marca aparece uma vez por tela.

**Pronto quando:** 85% das fotos de lateral e de bloco passam na régua, deitada, em pé e quadrada.

### Fase 4: a marca entra sozinha, e nada de texto de exemplo (2 dias)
**Objetivo:** a TV é do cliente desde a primeira tela.
- Com a marca preenchida, o tema padrão vira o da marca (`js/theme.js:207`). A Marca ganha "Usar nas minhas TVs", ligado (`BrandPage.jsx`, `SettingsForm.jsx:208`).
- O Aviso Premium respeita as cores da marca.
- O "Adicionar" não publica "Novo comunicado". Ou pede o conteúdo, ou entra com um exemplo da frente, bom e marcado para trocar (`web/src/lib/contentTypes.js`, os `make()`).

**Pronto quando:** as contas com marca saem com a marca nas 165 fotos, e nenhuma foto tem texto padrão.

### Fase 5: a programação pensa sozinha (3–4 dias)
**Objetivo:** o cliente leigo põe as coisas e a TV se organiza.
- **Importância automática.** A IA sugere o nível pela natureza da peça (segurança ou urgente; prazo curto; oferta; institucional). O cliente vê o porquê ("Urgente · fala de segurança · sai às 16h") e troca com um toque.
- **Tetos.** O urgente fica com no máximo 25% da tela, dividido entre todos os urgentes. A Alta fica com no máximo 40%. A peça com prazo sobe para Alta nas últimas 24 h e sai na hora exata (`js/player.js:2010`, `:2141`, `:1585`).
- **Sem buraco.** A IA confere o dia inteiro contra o horário de funcionamento e completa o que faltar (`server/ai-director.js:202`, `:309`).
- **Sem repetição seguida.** No mínimo 3 peças por horário, e a sequência inteira com o tamanho certo para o lugar: balcão de 2 a 5 min, sala de espera de 8 a 12 (`js/player.js:2013`, `:2055`).
- **Tempo e movimento.** Cada peça fica 1 s por palavra, no mínimo 6 s. As transições levam de 0,4 a 0,7 s, e a peça da IA entra suave (`js/player.js:44`, `js/peca-render.js:65`).
- **Datas sem data escrita.** "Black Friday" e "Natal" são entendidos sem o dia (`server/calendario.js:117`).

**Pronto quando:** a semana simulada dos 12 cenários dá 0 buracos, 0 repetições seguidas, urgente dentro do teto e a sequência no tamanho certo.

### Fase 6: a IA no nível de marca (4–5 dias)
**Objetivo:** pedir do jeito que o cliente fala e receber uma peça profissional.
- **O plano guarda os fatos do pedido** (preço, data, hora, lugar, telefone), e a peça mostra só o que foi aprovado. Fato inventado bloqueia em vez de só avisar (`server/ai-director.js:136`, `server/compositor.js:395`).
- **Um pedido longo do WhatsApp vira mais de uma peça** (`CriacaoRapidaPage.jsx:227`).
- **Variedade.** O mesmo pedido feito de novo sai com outra composição e outro título.
- **Ajustes que funcionam.** "Preço maior" e "troca a foto" passam a funcionar, e "mais chique" sem perder a marca (`server/ajuste-peca.js:155`).
- **Foto do cliente cuidada.** A foto escura ou torta é ajustada, e a foto com a marca de outra empresa é recusada.
- **Custo.** Cache do pedido para a IA (hoje são 56 mil tokens por peça, sem reaproveitar nada), e cobrança só quando a IA responde.

**Pronto quando:** os 60 pedidos dão média ≥ 8,5 e nenhum fica abaixo de 7. É preciso recarregar o crédito do Gemini.

### Fase 7: o painel novo, a estrutura (4–5 dias)
**Objetivo:** cada tarefa principal em até 3 cliques.
- **Menu de 5 ou 6 itens:** Criar (fixo), Início, Telas, Agenda, Biblioteca e Marca, mais Pessoas na Empresas. Plano, Equipe e Ajustes vão para o avatar.
- **A página da TV:** a tela ao vivo no centro, a fila do que passa embaixo, a edição simples ao lado e a barra fixa "Pôr na TV" com Desfazer. Ela junta Telas, Programação, o editor, Ver agora e Relatório.
- **Um só Criar,** que termina sempre em Onde → Quando → Pôr na TV.
- **Uma Biblioteca só,** com cada peça uma vez.
- **Os três níveis em toda tela:** Pronto em cima, Ajustável ao lado da TV e Avançado recolhido.

**Pronto quando:** as 8 tarefas do bloco 8 saem em até 3 cliques, e um leigo faz os 12 cenários do bloco 3 sem travar.

### Fase 8: o painel novo, o acabamento (2–3 dias)
**Objetivo:** parecer um produto que vale o preço.
- **Letra do painel:** corpo de 15 px, título de seção 17 px e título de página 28 px. Um botão principal por tela.
- **Estados vazios** com um exemplo desenhado.
- **Um glossário:** "Pôr na TV" para pôr, "Biblioteca" em todo lugar, e nada de "zona", "prioridade" ou "parear" na frente do cliente.
- **Agenda semanal visual,** com os buracos do dia à vista.
- **Celular de verdade:** abas que viram seletor, barra de publicar fixa e listas paginadas.

**Pronto quando:** a nota da interface fica em 9 ou mais, e o axe não acha problema.

### Fase 9: modelos com função e pacotes prontos (5+ dias, em lotes)
**Objetivo:** conteúdo pronto no nível das telas de referência, para cada negócio.
- **12 modelos-mestre por frente,** cada um nos cinco formatos de zona:
  - Comércio: oferta, cardápio, combo, horário, redes, avaliação e outros.
  - Saúde: senha, campanha do mês, horário, prevenção, avaliação e outros.
  - Empresas: comunicado, indicador, dias sem acidente, aniversariantes, boas-vindas, vaga e outros.
- **Pacotes por tipo de negócio:** padaria, ótica, restaurante, salão, clínica, dentista, farmácia, escritório e indústria, deitado, em pé e quadrado, com fotos geradas e escolhidas a dedo.
- **Galeria para você aprovar** cada lote. O que você aprova vai para as TVs novas.

**Pronto quando:** cada frente tem pelo menos 12 telas prontas aprovadas por orientação, e o conteúdo pronto vai de 3 para 9.

### Fase 10: reteste completo e lançamento para pilotos (2 dias)
- **Os 8 blocos de novo,** com o mesmo robô e a IA real, e as notas novas no lugar das de hoje.
- **O roteiro numa TV de verdade,** com você, e os 3 pilotos, um por frente.

**Pronto quando:** todos os blocos ficam em 9 ou mais.

### Fase 11: dados vivos (3–4 dias)
**Objetivo:** o preço e o número na TV nunca ficam errados.
- **Preço e cardápio vindos de uma planilha** (Google Planilhas ou CSV): o cliente edita a planilha e a TV muda. Na tela aparece "atualizado às".
- **Indicadores vindos de uma planilha** (Empresas): o número com a meta e a tendência, atualizado sozinho.

**Pronto quando:** mudar uma célula da planilha muda a TV em até 5 minutos, e a planilha com erro não quebra a tela.

### Fase 12: Saúde, a chamada de senha (3 dias)
**Objetivo:** o motivo número 1 de uma TV em sala de espera.
- A recepção chama a próxima senha pelo celular ou pelo computador (senha, consultório ou guichê).
- A TV mostra a senha atual em tamanho gigante, as 3 anteriores e um aviso sonoro opcional. Nunca o nome do paciente.

**Pronto quando:** a chamada chega à TV em até 1 s e a tela segue a régua (o modelo `s1-senha` das telas de referência).

### Fase 13: equipe e redes (3–4 dias)
**Objetivo:** servir a empresa maior e a rede com várias lojas.
- **Aprovação antes de ir ao ar.** O que a equipe cria espera o OK do dono ou do RH, que aprova pelo celular.
- **Permissão por loja ou grupo.** O gerente da loja Centro só mexe nas TVs da loja Centro, e o relatório sai por loja.

**Pronto quando:** um membro sem permissão não publica nem mexe em outra loja, e a peça aprovada vai ao ar sozinha.

## Checklist

### As fases
- [x] Fase 0: nada quebra, nada mente
- [ ] Fase 1: limpar antes de construir (a lista do que sai já foi aprovada)
- [ ] Fase 2: a régua no código
- [ ] Fase 3: zonas que se adaptam
- [ ] Fase 4: a marca entra sozinha, e nada de texto de exemplo
- [ ] Fase 5: a programação pensa sozinha
- [ ] Fase 6: a IA no nível de marca
- [ ] Fase 7: o painel novo, a estrutura
- [ ] Fase 8: o painel novo, o acabamento
- [ ] Fase 9: modelos com função e pacotes prontos
- [ ] Fase 10: reteste completo e pilotos
- [ ] Fase 11: dados vivos
- [ ] Fase 12: Saúde, a chamada de senha
- [ ] Fase 13: equipe e redes

### Para valer o preço (aprovado em 05/11)
- [ ] Preço e cardápio vindos de uma planilha (fase 11)
- [ ] Indicadores vindos de uma planilha (fase 11)
- [ ] Chamada de senha para Saúde (fase 12)
- [ ] Aprovação antes de ir ao ar (fase 13)
- [ ] Permissão por loja (fase 13)
- [ ] Modo ambiente: arte calma da marca entre os avisos (fase 9)
- [ ] Calendário de datas pronto para cada frente (fases 5 e 9)

### Diferenciais para depois (aprovado em 05/11)
- [ ] Multi Telas Ads (planejamento em [docs/ads/](../ads/README.md))
- [ ] Pedir pelo WhatsApp: "acabou o pão de queijo" muda a TV
- [ ] Vídeo curto feito pela IA (5 a 8 s de movimento de verdade)
- [ ] Contagem de quem lê o QR de cada TV
- [ ] Programação que muda com o clima
- [ ] Videowall: várias TVs formando uma tela só

## A ordem e o porquê

Fases 0 → 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9 → 10, e depois 11 → 12 → 13. As fases 11 a 13 não dependem do painel novo e podem entrar antes, se um cliente piloto pedir.
1. **Primeiro, o que quebra e o que mente** (fase 0).
2. **Depois, a base da TV** (fases 2 a 4). A IA, os modelos e o painel dependem dela, então construir antes seria refazer depois.
3. **A IA e a programação** (fases 5 e 6) vêm depois da régua, porque ela vai estar no código.
4. **O painel novo** (fases 7 e 8) vem com a TV já bonita, porque ele mostra a TV ao vivo no centro.
5. **Os pacotes prontos** (fase 9) vêm por último. Eles usam tudo o que veio antes, e por isso ficam bons de primeira.

Somando, as fases 0 a 10 dão de 30 a 40 dias de trabalho, e as 11 a 13 mais uns 10. Onde uma fase não depende da outra, dá para fazer as duas em paralelo.
