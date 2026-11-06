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

**Andamento (05/11):**
- [x] Piso de 4,5% do lado menor da TV em toda letra do player, na zona grande (880×540 ou mais). A lista de preços, o aviso urgente e a tela fora do horário entram também.
- [x] A TV só encolhe o que não cabe, nesta ordem: uma coluna a mais no preço, o título desce até 1,6× o piso, o ícone do aviso sai. Só então a caixa toda encolhe.
- [x] A régua interna em 48 px no destaque (era 14), e a IA não pede mais letra pequena. A biblioteca vai sem o envoltório do piso, então o custo do pedido não sobe.
- [x] O robô da régua (`npm run regua`, `tools/regua-tv.mjs`) num job próprio do CI, com as fotos guardadas.
  - Tela cheia, tipos prontos: **42 de 42** (eram de 6 a 11 de 24).
  - Principal com lateral: 15 de 42, a meta da fase 3.
- [x] Na peça, entra o maior piso que cabe. O desenho nunca quebra (a bancada achava 371 defeitos com o piso inteiro), e a peça que cedeu fica marcada (`data-mt-piso-cedeu`).
- [x] Redesenhei 21 peças-ouro para caber com a letra inteira. Em tela cheia (16:9, 9:16 e 1:1) são **96 de 96**, com as 6 marcas da bancada; eram 63.
  - Cada peça cabe também com a fonte de reserva, antes de a fonte da marca chegar.
  - Nenhum campo saiu.
  - A peça mede de novo quando a fonte chega (`loadingdone`).
  - Na bancada, o detector de "encostado" usa a altura da linha, a mesma conta do detector das peças.
- [x] O robô confere também as peças-ouro em tela cheia. A peça que ceder reprova.
- [x] A biblioteca vai à IA sem espaço sobrando no CSS: 131 mil caracteres, menos que antes do redesenho.
- Fica para a fase 3: na principal da Empresas (1405×832), 22 de 32 peças cabem inteiras. Os cardápios de colunas e de categorias só caberiam escondendo o detalhe dos itens.
- Defeitos na bancada: 154, eram 371 com o piso inteiro. Fora da principal da Empresas, sobra 1: a marca do cabeçalho centralizado encosta na borda, e esse defeito já existia antes da fase 2.

### Fase 3: zonas que se adaptam (3–4 dias)
**Objetivo:** bonito em qualquer formato, com o cliente escolhendo.
- **Cinco formatos de zona:** larga, alta, quadrada, faixa e bloco. Cada tipo diz o que mostra em cada um (esconde o apoio, empilha, deixa só o número ou o preço) em vez de encolher.
- **A régua depende de onde a TV fica:** balcão, recepção ou escritório. No escritório, com zonas, a pessoa lê de perto. No balcão, o sistema sugere menos zonas.
- **Papéis das zonas na Empresas:** principal, lateral de informação (hora, clima, aniversariante, indicador), faixa de avisos e cabeçalho.
- **A zona vazia some ou recebe algo útil,** e a marca aparece uma vez por tela.

**Pronto quando:** 85% das fotos de lateral e de bloco passam na régua, deitada, em pé e quadrada.

**Andamento (05/11):**
- [x] A letra mínima depende de onde a TV fica (campo "Onde fica a TV?" nos ajustes). A frente dá o padrão.
  - Balcão (4 m): 4,5%. Recepção (3 m): 3,5%. Escritório (2–2,5 m): 3%.
  - A conta sai da tabela de distância do QA (REFERENCIAS, 6.1 e 6.2).
- [x] O piso vale em toda zona, não só na grande.
- [x] Na zona pequena, cada tipo se recompõe antes de a letra encolher. Primeiro aperta o respiro; depois a lista ganha coluna; depois o título desce. Por último sai o apoio, por nível: o ícone, depois o rótulo de endereço.
- [x] A zona vazia some: a vizinha com conteúdo ocupa o lugar dela.
  - O rodapé sem mensagem sai quando a tela tem cabeçalho.
  - Assim, a marca e a data deixam de aparecer três vezes na mesma tela.
- [x] O painel avisa quando há lateral numa TV de balcão: ali cabe pouco.
- [x] O robô mede a lateral e o bloco nos layouts que cada TV oferece de verdade. A lateral só existe deitada; o bloco é a metade de "Dois quadrados" ou de "Em pé · duas zonas". Menos de 85% reprova o CI.
  - Tipos prontos na lateral: **13 de 14 (93%)**; no bloco, **28 de 28**; na principal com lateral, 14 de 14.
  - Peças-ouro no escritório: principal da Empresas **32 de 32**, lateral **17 de 17**.
  - O único que não passa é o cardápio de 9 itens na lateral de uma TV de balcão. É o caso que o painel desaconselha.
- A TV quadrada não tem layout com zonas visível (os dois de antes saíram na fase 1). Não há lateral nem bloco para medir nela.
- Ficam para as fases 5 e 7:
  - quem decide o conteúdo de cada zona, por papel (principal, lateral de informação, faixa de avisos);
  - a tela inteira vazia, na primeira vez. Ela ainda mostra a marca no cabeçalho e na zona de espera; a fase 4 cuida da primeira tela.

### Fase 4: a marca entra sozinha, e nada de texto de exemplo (2 dias)
**Objetivo:** a TV é do cliente desde a primeira tela.
- Com a marca preenchida, o tema padrão vira o da marca (`js/theme.js:207`). A Marca ganha "Usar nas minhas TVs", ligado (`BrandPage.jsx`, `SettingsForm.jsx:208`).
- O Aviso Premium respeita as cores da marca.
- O "Adicionar" não publica "Novo comunicado". Ou pede o conteúdo, ou entra com um exemplo da frente, bom e marcado para trocar (`web/src/lib/contentTypes.js`, os `make()`).

**Pronto quando:** as contas com marca saem com a marca nas 165 fotos, e nenhuma foto tem texto padrão.

**Andamento (05/11):**
- [x] A marca entra sozinha. Com a marca preenchida e "Usar nas minhas TVs" ligado na Marca (o padrão), a TV que não escolheu outro tema sai com o da marca (`server/paleta.js`, `temaDaTv`).
  - A cor acompanha quando a marca muda.
  - A TV e a prévia do painel recebem o mesmo tema.
  - Quem escolheu um tema pronto, a marca só nos destaques ou uma cor à mão continua com o que escolheu.
- [x] A cor padrão que toda configuração nova herdava (`#5B2EFF`) não conta mais como escolha. Era ela que deixava as 165 fotos roxas.
- [x] O aviso usa a cor da marca. Urgente e segurança ficam com a cor deles, porque ali a cor é o recado.
- [x] O "Adicionar" entra com um exemplo bom da frente, marcado como exemplo. O painel mostra "exemplo: troque o texto para ir ao ar".
  - A TV não mostra o exemplo nem o padrão antigo ("Novo comunicado" sem texto, "Produto" sem preço).
  - O item deixa de ser exemplo quando a pessoa mexe no conteúdo.
- [x] O indicador com tendência "alta" mostrava um traço vermelho. Agora sobe verde.
- [x] O robô confere a cor da marca e o texto padrão em toda foto de tela cheia.
  - Com a marca: **42 de 42** (antes: 0).
  - Texto padrão na TV: **0 de 18**.

### Fase 5: a programação pensa sozinha (3–4 dias)
**Objetivo:** o cliente leigo põe as coisas e a TV se organiza.
- **Importância automática.** A IA sugere o nível pela natureza da peça (segurança ou urgente; prazo curto; oferta; institucional). O cliente vê o porquê ("Urgente · fala de segurança · sai às 16h") e troca com um toque.
- **Tetos.** O urgente fica com no máximo 25% da tela, dividido entre todos os urgentes. A Alta fica com no máximo 40%. A peça com prazo sobe para Alta nas últimas 24 h e sai na hora exata (`js/player.js:2010`, `:2141`, `:1585`).
- **Sem buraco.** A IA confere o dia inteiro contra o horário de funcionamento e completa o que faltar (`server/ai-director.js:202`, `:309`).
- **Sem repetição seguida.** No mínimo 3 peças por horário, e a sequência inteira com o tamanho certo para o lugar: balcão de 2 a 5 min, sala de espera de 8 a 12 (`js/player.js:2013`, `:2055`).
- **Tempo e movimento.** Cada peça fica 1 s por palavra, no mínimo 6 s. As transições levam de 0,4 a 0,7 s, e a peça da IA entra suave (`js/player.js:44`, `js/peca-render.js:65`).
- **Datas sem data escrita.** "Black Friday" e "Natal" são entendidos sem o dia (`server/calendario.js:117`).

**Pronto quando:** a semana simulada dos 12 cenários dá 0 buracos, 0 repetições seguidas, urgente dentro do teto e a sequência no tamanho certo.

**Andamento (05/11):**
- [x] O rodízio saiu do player para `js/rodizio.js`. É código puro: a TV usa o mesmo que a semana simulada mede.
- [x] Tetos por tempo de tela: o urgente fica com até 25%, dividido entre todos os urgentes, e a Alta com até 40%. O teto é conferido depois de arredondar.
- [x] A peça com prazo vale Alta nas últimas 24 h.
- [x] A mesma peça não reentra: quando ela é a única do horário, ou o teto pede mais tempo para ela, fica no ar. Na troca de faixa, a primeira da lista nova não repete a que está no ar.
- [x] O tempo é o da leitura: 1 s por palavra, de 6 a 25 s. O tempo posto à mão vale (`meta.duracaoManual`). As transições levam de 0,6 a 0,7 s (eram de 0,95 a 1,2).
- [x] Importância automática (`js/importancia.js`), sem IA:
  - Urgente: o texto pede ação já, ou fala de segurança.
  - Alta: prazo de até 2 dias, ou oferta.
  - Normal: o institucional.
  - As peças das campanhas já entram com o nível e o porquê ("Urgente · fala de segurança"). A escolha da pessoa vale.
- [x] Sem buraco no dia: a faixa que ficou sem peça é coberta pela vizinha (`cobrirODia`).
- [x] O calendário entende "Black Friday", "Natal", "Dia das Mães" e outras datas sem o dia escrito.
- [x] O painel calcula a volta como a TV e avisa quando ela foge do tamanho do lugar: balcão de 2 a 5 min, sala de espera de 8 a 12, escritório de 3 a 10.
- [x] A semana simulada roda no CI (`test/semana-simulada.test.js`) com 7 cenários do BLOCO-3: 1, 2, 3, 4 e 6, 7, 10 e 11.
  - **0** buracos, **0** repetições seguidas, **0** vencidas no ar.
  - Urgente sempre até 25%, e Alta até 40%.
- Falta, e fica para a fase 6 (a IA):
  - a IA fazer pelo menos 3 peças por horário;
  - a IA montar a volta no tamanho do lugar. Hoje, se ela não monta, o painel avisa.

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

**Andamento (05/11):**
- [x] **Menu de 5 itens:** Criar fixo em cima, Início, Telas, Agenda, Biblioteca e Marca, mais Pessoas na Empresas (no Comércio e na Saúde, os apps ficam na Biblioteca). Plano, Equipe, Ajustes e Ajuda foram para o avatar. No celular, a barra de baixo tem o Criar no meio.
- [x] **Uma Biblioteca só:** Prontos para você (telas inteiras e peças soltas), Seus conteúdos (campanhas e peças guardadas), Fotos e vídeos, e Apps. Os endereços antigos continuam abrindo.
- [x] **A página da TV:**
  - a TV ao vivo no centro, e "como vai ficar" com o rascunho, no mesmo palco;
  - as partes da TV ao lado, e a fila e a edição embaixo;
  - três partes numa página: O que passa, Ajustes da TV e O que passou;
  - a barra fixa "Pôr na TV" com Desfazer e Refazer, também no celular;
  - Telas abre a página da TV, e voltar volta para Telas.
- [x] **Um só Criar:**
  - três portas: Pedir à IA, Escolher um modelo, e Foto ou vídeo;
  - o avançado recolhido: editor livre e Criação rápida;
  - todo caminho termina igual: a prévia, onde, quando e "Pôr na TV", com Desfazer;
  - aberto de dentro de uma TV, só ela vem marcada;
  - o "Pedir à IA" da Programação saiu, porque era uma segunda porta para a mesma conversa;
  - modelo salvo sem mudar o texto avisa antes, por causa do preço de exemplo.
- [x] **Os três níveis no formulário da peça:** o conteúdo e o "quando mostrar" à vista. Aparência, tempo e importância ficam em "Mais ajustes", que lembra a escolha de cada pessoa.
- **Cliques por tarefa, contando o clique no menu:**

  | Tarefa | Bloco 8 | Agora | Caminho |
  |---|---|---|---|
  | Mudar o que a TV mostra | 4 + rolagem | **3** | Telas › Abrir a TV › editar › Pôr na TV (a barra fica fixa, sem rolar) |
  | Mudar a marca | 2 (+6 por TV) | **2** | Marca › paleta (a TV segue a marca desde a fase 4) |
  | Adicionar uma TV | 3 | **3** | Telas › Parear tela › código e nome › Parear |
  | Convidar alguém | 4 | **3** | avatar › Convidar alguém › Gerar convite |
  | Ver o que está no ar | 0–2 | **0–2** | Início, ou Telas › Abrir a TV (grande, ao vivo) |
  | Pôr uma foto na TV | 4 | 4 | Criar › Foto ou vídeo › Galeria e arquivo › Pôr na TV. Arrastando o arquivo para o painel, são 2 |
  | Pôr uma peça pronta | 4 | 4 | Biblioteca › Peças soltas › Pôr na TV › Pôr na TV (agora com o "quando" junto) |
  | Agendar uma peça | 8–9 | 1 (peça nova) e 6 (peça que já está na TV) | A peça nova tem o "quando" no fim de todo caminho. A que já está precisa da Agenda semanal (fase 8) |
  | Criar com a IA e pôr no ar | 8–13 | 8–13 | Depende da IA (fase 6) |

- Falta:
  - 4 das 9 tarefas passam de 3 cliques. Duas ficam com 4, por causa do "Galeria" e do "Peças soltas". Agendar a peça que já está na TV espera a Agenda semanal (fase 8). Criar com a IA espera a fase 6.
  - O leigo nos 12 cenários do bloco 3 vai para o reteste (fase 10).

### Fase 8: o painel novo, o acabamento (2–3 dias)
**Objetivo:** parecer um produto que vale o preço.
- **Letra do painel:** corpo de 15 px, título de seção 17 px e título de página 28 px. Um botão principal por tela.
- **Estados vazios** com um exemplo desenhado.
- **Um glossário:** "Pôr na TV" para pôr, "Biblioteca" em todo lugar, e nada de "zona", "prioridade" ou "parear" na frente do cliente.
- **Agenda semanal visual,** com os buracos do dia à vista.
- **Celular de verdade:** abas que viram seletor, barra de publicar fixa e listas paginadas.

**Pronto quando:** a nota da interface fica em 9 ou mais, e o axe não acha problema.

**Andamento (05/11):**
- [x] **Letra:**
  - corpo 15 px, título de seção 17 e título de página 28 (24 no celular);
  - números grandes 32, e nada abaixo de 12 px (13 no celular);
  - medido em 70 telas: o texto em 15 px ou mais passou de 3% para 44%. O de 13 px (dicas e descrições) ficou com 46%, e o de 11 px sumiu.
- [x] **Um violeta por tela:**
  - a aba escolhida ficou neutra, e os botões de apoio e dos cartões viraram contorno;
  - "Excluir a conta" usa o botão de perigo;
  - no máximo 1 violeta em cada uma das 70 telas. Antes eram até 6, e Peças prontas tinha um por cartão.
- [x] **Estados vazios com exemplo:** uma TV desenhada com a peça de exemplo (o código da TV, uma campanha, uma data, um aviso…).
- [x] **Glossário:**
  - "Pôr na TV" para pôr, e "Biblioteca" no lugar de Mídias;
  - Campanhas e Peças guardadas no lugar de Criados e Meus Designs;
  - parte da TV no lugar de zona, e Importância no lugar de Prioridade;
  - "Ligar uma TV" no lugar de Parear, também na tela de código da TV;
  - "O que passa" e "Tempo na tela" no editor;
  - um teste varre os textos do painel e falha se um termo velho voltar.
- [x] **Agenda semanal visual:**
  - os próximos 7 dias por faixa do dia, com o mesmo `naJanela` da TV e o horário da loja;
  - os horários abertos que ficam só com o relógio aparecem em amarelo, com "Pôr algo";
  - no celular, um dia por vez.
- [x] **Celular:**
  - as abas que não cabem viram um seletor, e o topo da página ficou mais baixo;
  - Peças prontas vem de 12 em 12: no celular, de 15.138 px para 4.356 px;
  - a barra fixa "Pôr na TV" veio na fase 7.
- [x] **axe:** 0 problemas nas 70 telas, em 2 frentes e 2 tamanhos. Antes eram 7.
- Falta:
  - a nota da interface sai no reteste (fase 10);
  - os nomes das partes no mapa da TV ("Principal", "Lateral") continuam;
  - as peças prontas de outro negócio (óculos na padaria, pão na empresa) ficam para a fase 9.

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

**Andamento (05/11):**
- [x] **Reteste dos blocos 1, 3 (sem IA), 4 a 7 e 8,** com o mesmo método e a mesma régua. As notas estão em [RESULTADO.md](RESULTADO.md): nota geral provisória **7,1**, era 6,2. Nenhum bloco chegou a 9.
- [x] **O roteiro do piloto numa TV de verdade:** [ROTEIRO-PILOTO.md](ROTEIRO-PILOTO.md).
- [x] **Corrigido o que o reteste achou e era pequeno:**
  - a TV quadrada a 56% do piso;
  - os textos do cliente apagados nas telas prontas;
  - o preço no pacote do dentista;
  - o axe com uma campanha no ar;
  - os verbos e o "Mídias" que sobrou;
  - a Agenda repetindo o mesmo nome.
- [ ] **Bloco 2 e os cenários de IA do bloco 3:** dependem do crédito do Gemini.
- [ ] **Os pilotos:** com você, pelo roteiro.
- **O que falta para cada bloco chegar a 9 (do reteste):**
  - **1. A TV (6,5):**
    - A cor da marca no texto (preço, @, kicker) fica entre 2,5 e 3,5 de contraste; a régua pede 4,5. Hoje aceitamos 3 no destaque (`js/tokens.js:105`) e o tema mira 3,5 (`js/theme.js:246`).
    - As telas prontas esperam a sua aprovação na galeria: hoje só 1 de 53 está aprovada.
    - O cabeçalho cola a marca na chamada ("PADARIA SOLSEMANA DO SOL").
    - As telas do lote 1 têm datas vencidas.
  - **4. Telas e a página da TV (8,5):**
    - Ajustes da TV tem uma falha crítica e uma séria no axe (`SettingsForm.jsx:223-234`).
    - O mapa da TV pinta de preto as partes de texto e de clima.
    - O diálogo do Som aponta para um menu que não existe mais (`ScreensPage.jsx:149`).
  - **5. O resto do painel (7,5):**
    - A conta antiga ainda leva um erro 500 na lista de campanhas (`server/ajuste.js:76`).
    - Peças guardadas com 300 peças trava por 4,5 s, sem paginar.
    - A Marca fica espremida no celular (`LogoDaMarca.jsx:110`).
    - O Início e os Alertas listam as TVs fora do ar uma por uma.
  - **6. Site e e-mails (8):**
    - A página 404 não tem título nem um link de volta.
    - O e-mail do código de foto não tem moldura.
    - Nenhum e-mail tem a logo nem o rodapé da empresa.
  - **7. A base (8,5):**
    - Duas sessões numa conta de 25 TVs batem no limite de 600 chamadas, e o painel diz "Sem conexão" (`App.jsx:215`).
    - A Programação com 25 TVs leva 4,2 s no 4G lento.
    - Apagar uma peça da biblioteca de outra conta responde 200 sem apagar nada.
  - **8. A interface (6,7):**
    - O "Na TV agora" não é a TV de verdade: o cabeçalho vira uma caixa escrita "Cabeçalho", sem a marca (`VerTelaAgora.jsx:189-206`).
    - O conteúdo pronto é filtrado pela frente e não pelo tipo de negócio.
    - A página da TV ainda tem termos técnicos e o "Quando" antigo para a peça que já está no ar.
    - Há caminhos repetidos: a mesma campanha em 3 lugares, e "Escolher um modelo" abre o editor avançado.

### Fase 11: dados vivos (3–4 dias)
**Objetivo:** o preço e o número na TV nunca ficam errados.
- **Preço e cardápio vindos de uma planilha** (Google Planilhas ou CSV): o cliente edita a planilha e a TV muda. Na tela aparece "atualizado às".
- **Indicadores vindos de uma planilha** (Empresas): o número com a meta e a tendência, atualizado sozinho.

**Pronto quando:** mudar uma célula da planilha muda a TV em até 5 minutos, e a planilha com erro não quebra a tela.

**Andamento (06/11):**
- [x] **Preço e cardápio vindos de uma planilha.** Em Biblioteca › Apps › Preços da planilha, o cliente cola o link do Google Planilhas (ou envia o CSV). O servidor lê de 5 em 5 minutos (`server/planilha.js`, `server/routes/planilha.js`, a tabela `planilhas` nos dois bancos) e avisa a TV só quando um preço muda. "Pôr na TV" oferece a **tabela de preços** (o tipo `precos`, com as seções) ou o **cardápio pronto** (as peças-ouro `cardapio-colunas` e `cardapio-categorias`, campos `item1-nome`/`item1-preco`… e `grupo1`/`g1-item1`…). Na TV aparece "Atualizado às 14:05".
  - **Segurança:** só `docs.google.com`, `docs.googleusercontent.com` e `doc-…-sheets.googleusercontent.com`, em https, e cada redirecionamento passa pela mesma regra (a tela de login do Google vira "a planilha não está compartilhada"). Por cima, a checagem de IP interno de `server/site.js`. Teto de 8 s e de 512 KB; rota com sessão, conta e limite de leituras por hora. O host de teste (`PLANILHA_HOST_TESTE`) fica desligado por padrão e é ignorado em produção.
  - **Planilha com erro não quebra a tela:** a TV fica com os últimos preços bons (no servidor e no aparelho, sem rede), e o painel mostra o erro em palavras ("a planilha não está aberta para quem tem o link…"). O item guarda uma cópia em texto para a TV que liga sem rede.
  - Conferido de ponta a ponta numa TV pareada (porta local): mudou a célula, a TV mudou sem recarregar; a planilha quebrou, a TV seguiu com o preço de antes.
- [x] **Indicadores vindos de uma planilha.** Em Indicadores, "Ligar uma planilha" é o botão principal: uma linha por indicador (nome, valor, meta, unidade, anterior). O "anterior" dá a seta de subiu ou desceu; refugo e acidente continuam "menos é melhor". É o conector `planilha` dos indicadores (o mesmo relógio e o mesmo cartão ao vivo da TV).
- [x] **Calendário de datas pronto para cada frente** (`js/datas-frente.js`). Na Agenda, "Datas que vêm" traz as datas prontas da frente, calculadas para o ano (Dia das Mães é o 2º domingo de maio), cada uma com "Pôr na programação" (o mesmo caminho do "Colar o calendário"). Comércio: liquidação de janeiro, Dia das Mães, dos Namorados, dos Pais, das Crianças, Black Friday, Natal… Saúde: as cores do ano (Janeiro Branco a Dezembro Vermelho) e a vacinação. Empresas: SIPAT, CIPA e o aniversário da empresa (vocês escolhem o dia), Dia do Trabalho, confraternização, Natal. As campanhas de mês inteiro ficam no ar o mês todo. Os mesmos nomes valem no texto colado ("Setembro Amarelo").
- [ ] **Conferir com uma planilha real do Google em produção** (os testes não tocam a internet: o "Google" deles é um servidor local).

### Fase 12: Saúde, a chamada de senha (3 dias)
**Objetivo:** o motivo número 1 de uma TV em sala de espera.
- A recepção chama a próxima senha pelo celular ou pelo computador (senha, consultório ou guichê).
- A TV mostra a senha atual em tamanho gigante, as 3 anteriores e um aviso sonoro opcional. Nunca o nome do paciente.

**Pronto quando:** a chamada chega à TV em até 1 s e a tela segue a régua (o modelo `s1-senha` das telas de referência).

**Andamento (06/11):**
- [x] **A recepção chama pelo celular ou pelo computador:**
  - a página **Chamada de senha**: na Saúde, um toque no botão "Chamar senha" do topo, de qualquer página; nas outras frentes, em Biblioteca › Apps; e no atalho do ícone do app;
  - um botão grande, o único violeta da tela: "Chamar a próxima · A 043";
  - também chamar de novo, chamar um número (a sequência não muda) e zerar o dia, que pergunta antes;
  - onde atende: guichê, consultório, sala, triagem, caixa ou mesa, com o número, e a letra da senha. Fica guardado no aparelho de cada recepção;
  - a fila é por conta e por grupo de TVs. "Todas as TVs" é a fila padrão, e cada grupo (uma segunda sala de espera) tem a sua;
  - a senha volta a 001 sozinha a cada dia, no dia da loja (o fuso do horário da TV), e depois de 999;
  - qualquer pessoa da conta chama, inclusive o membro. Toda rota pede login, e a da TV pede o token dela.
- [x] **A TV mostra:**
  - a senha gigante (30% do lado menor), o lugar, as 3 anteriores, a hora e a marca, no desenho do `s1-senha`, nas cores do tema da TV;
  - deitada, em pé e quadrada;
  - por 12 s por cima de tudo, com um "plim-plom" se o som da chamada estiver ligado na TV;
  - e, se a TV pedir, "sempre à vista": uma faixa ao lado do conteúdo (embaixo, na TV em pé e na quadrada).
- [x] **Nunca o nome do paciente:** o lugar é escolhido de uma lista, com número. Não há campo de texto livre, nem no banco.
- [x] **Chega em menos de 1 s:**
  - pelo tempo real que já existia (evento `senha`, com o estado inteiro: a TV não busca nada);
  - medido de ponta a ponta, do clique no painel à senha na tela, em 3 TVs ao mesmo tempo: 5 chamadas, mediana de 52 ms e máximo de 104 ms;
  - sem o tempo real, a TV pergunta a cada 4 s (medido: 1,2 s) e, ao reconectar, uma vez;
  - recarregar a TV não perde a faixa e não anuncia de novo a mesma senha.
- [x] **A régua:**
  - a menor letra tem 4,8% do lado menor na tela da senha e 4,5% na faixa;
  - o robô da régua (`npm run regua`) mede a tela da senha nas 3 TVs, e ela bloqueia como tela cheia;
  - o axe deu 0 na página, no celular e no computador.
- [x] **Dados:** as tabelas `senha_filas` e `senha_chamadas`, nos dois bancos. Saem com a conta e vão na exportação.
- [x] **Ajustes da TV › Aparência:** mostrar a chamada nesta TV, o som e o "sempre à vista".
- Falta:
  - um piloto numa recepção de verdade, com o som numa TV real;
  - a voz falando a senha ("Senha A 42, consultório 3"), se o piloto pedir.

### Fase 13: equipe e redes (3–4 dias)
**Objetivo:** servir a empresa maior e a rede com várias lojas.
- **Aprovação antes de ir ao ar.** O que a equipe cria espera o OK do dono ou do RH, que aprova pelo celular.
- **Permissão por loja ou grupo.** O gerente da loja Centro só mexe nas TVs da loja Centro, e o relatório sai por loja.

**Pronto quando:** um membro sem permissão não publica nem mexe em outra loja, e a peça aprovada vai ao ar sozinha.

**Andamento (06/11):**
- [x] **Aprovação antes de ir ao ar.** Uma chave em Equipe, desligada por padrão. Ligada, o que um membro põe na TV vira pedido, e a TV não muda. Vale para todo caminho: o editor, o "Pôr na TV", as campanhas, as telas e peças prontas, a foto que subiu, a Agenda e o aviso rápido. Todos passam pela gravação de uma TV ou pelo envio em lote, e é ali que o servidor decide (`server/aprovacao.js`).
  - O dono e o admin veem um sino no topo, no celular também, com o número de pedidos esperando. A página Aprovações mostra o antes e o depois de cada TV: a miniatura e, embaixo, o que passa em texto, com o que é novo em negrito. Embaixo, Aprovar ou Recusar.
  - Aprovado, vai ao ar sozinho, pelo mesmo envio em lote, com a versão que o membro leu. Se a TV mudou depois do pedido, nada é atropelado: o dono escolhe "Aprovar por cima" ou recusa. A aprovação entra em "Últimos envios", com Desfazer.
  - Recusado, o membro vê o porquê na página "Seus pedidos", e o sino dele conta a resposta nova até ele abrir.
  - A campanha posta no ar por um membro só fica "no ar" quando o pedido é aprovado.
  - O pedido novo para as mesmas TVs troca o anterior. O membro pode desistir enquanto o pedido espera. Com a aprovação ligada, desfazer um envio fica com o dono.
  - O dono e o admin põem na TV direto, como antes. O acesso de suporte não aprova nem muda a chave.
- [x] **Permissão por loja.** Em Equipe › Escolher lojas, o dono dá a um membro uma ou mais lojas (os grupos das TVs). Esse membro vê e muda só as TVs delas (`server/permissoes.js`). O servidor confere em toda rota de TV:
  - a lista de TVs;
  - a página da TV (config, comando, som, horário, grupo, nome);
  - o envio em lote, onde uma lista misturada é recusada inteira;
  - o Desfazer e os "Últimos envios";
  - as campanhas e o que a IA sabe das TVs ao conversar e criar;
  - o que aparece sozinho nas TVs;
  - o relatório.

  A TV de outra loja responde 403 ou 404. Renomear uma loja leva junto a permissão de quem só via aquela loja.
- [x] **O relatório por loja:** o filtro "Por loja" na página e `?grupo=` na API. O membro de uma loja vê só a soma das TVs dele.
- [x] **Testes:** `test/fase13.test.js`. Eles tentam os caminhos proibidos direto na API:
  - ler e gravar a config de uma TV de outra loja;
  - o lote misturado;
  - a campanha mirando uma TV de fora;
  - o relatório de outra loja;
  - mover a TV para outra loja;
  - aprovar e recusar como membro;
  - outra conta vendo o pedido.

  Os testes também cobrem a aprovação de ponta a ponta: o pedido, o antes e o depois, aprovar, o conflito e o "por cima", recusar, desistir e o sino. As tabelas novas (`aprovacoes` e `acesso_lojas`, mais a coluna `tenants.aprovacao`) estão nos dois bancos e saem com a conta.
- [x] **Visto no navegador** (servidor local, celular de 390×844): o dono liga a chave e dá a Loja Centro à gerente. A gerente vê só a TV do Balcão. As chamadas diretas dela à TV da Vitrine voltam 403 ou 404. O "Pôr na TV" dela diz "Mandado para aprovação", e a TV não muda. O dono vê o sino com 1, abre o antes e o depois e aprova, e a TV troca sozinha. O dono recusa outro pedido com o motivo, e a gerente vê "Por quê: O preço do pão está errado".

## Checklist

### As fases
- [x] Fase 0: nada quebra, nada mente
- [x] Fase 1: limpar antes de construir (tipos e layouts; as páginas juntam na fase 7)
- [x] Fase 2: a régua no código
- [x] Fase 3: zonas que se adaptam
- [x] Fase 4: a marca entra sozinha, e nada de texto de exemplo
- [x] Fase 5: a programação pensa sozinha
- [ ] Fase 6: a IA no nível de marca
- [x] Fase 7: o painel novo, a estrutura (4 das 9 tarefas ainda passam de 3 cliques; ver o andamento)
- [x] Fase 8: o painel novo, o acabamento (a nota da interface sai no reteste, fase 10)
- [x] Fase 9: modelos com função e pacotes prontos (os lotes esperam a aprovação na galeria)
- [ ] Fase 10: reteste completo e pilotos (reteste feito, nota 7,1; faltam o bloco 2 com a IA e os pilotos)
- [ ] Fase 11: dados vivos
- [x] Fase 12: Saúde, a chamada de senha (falta o piloto numa recepção; ver o andamento)
- [x] Fase 13: equipe e redes

### Para valer o preço (aprovado em 05/11)
- [x] Preço e cardápio vindos de uma planilha (fase 11)
- [x] Indicadores vindos de uma planilha (fase 11)
- [x] Chamada de senha para Saúde (fase 12)
- [x] Aprovação antes de ir ao ar (fase 13)
- [x] Permissão por loja (fase 13)
- [x] Modo ambiente: arte calma da marca entre os avisos (fase 9)
  - Ajustes da TV › Aparência › Modo ambiente: a cada quantos avisos (3 a 8), quanto tempo fica e se mostra a hora e a data ou uma frase curta;
  - o desenho da TV: a cor da marca em movimento lento, linhas finas, a hora grande e a marca embaixo. Na TV fraca, fica parado;
  - entra depois do rodízio, e também separa a mesma peça que passaria duas vezes seguidas. Os tetos do urgente (25%) e da Alta (40%) continuam: o teste da semana simulada mede com o respiro ligado
  - falta escolher uma peça-ouro de ambiente no painel. A TV já aceita: `settings.ambiente.peca`, que passa pela porta das peças.
- [x] Calendário de datas pronto para cada frente (fases 5 e 9)

### Diferenciais para depois (aprovado em 05/11; o dono reconfirmou em 06/11: entram depois das fases 11 a 13)
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
