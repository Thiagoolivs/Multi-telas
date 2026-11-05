# Bloco 8: a interface do painel

Feito em 05/11/2026, em `main` (`061fe8e`), num servidor **local** (porta
5990, `STORAGE=local`, IA simulada, cobrança simulada). Nada de produção.

Montei uma conta **típica** em cada frente:

| Frente | Conta | O que tem |
|---|---|---|
| Comércio | Padaria Trigo Dourado | Plano pago, logo e cores, 2 TVs de verdade (Balcão deitada, Vitrine em pé), 3 textos, 1 campanha no ar ("Semana do pão de queijo"), 5 peças na biblioteca, 1 convite |
| Saúde | Clínica Vida Plena | O mesmo, com "Novembro Azul" |
| Empresas | Rota Sul Logística | O mesmo, com "SIPAT 2026" e 12 pessoas |

As TVs foram abertas no Chromium (`/tv`), pareadas pelo código e ficaram no
ar durante as fotos. Tirei **154 fotos** (todas as páginas em 1440×900 e
390×844, nas três frentes, mais os diálogos centrais) e **48 fotos da
página inteira** no Comércio. Também medi cada página: palavras, botões,
tamanhos de letra e raios. Os bugs de funcionamento já estão nos blocos 1,
3 e 4–7 e não se repetem aqui. Este bloco olha **estrutura, lugar das
coisas, nomes, hierarquia e aparência**.

Scripts e fotos: scratchpad da sessão, pasta `b8/` (`monta.js`, `crawl.js`,
`crawl2.js`, `dialogos.js`, `shots/`, `full/`, `folhas/`, `medidas-*.json`).

## Resumo

- O painel é **limpo e coerente**: o mesmo esqueleto em toda página (menu,
  abas, título, ação à direita). Funciona e não assusta.
- Mas ele parece uma **ferramenta interna bem-feita**, não um produto de
  R$ 79 a R$ 159 por tela. A letra é de painel técnico (13 px), a TV quase
  nunca é a estrela e quase tudo tem o mesmo peso.
- O dono se perde por **excesso de portas**: a lista de TVs aparece em três
  páginas, as mesmas peças em três abas, e há mais de quinze botões que
  levam a "criar", com três IAs diferentes.
- Os três níveis (Pronto, Ajustável, Avançado) **existem, mas misturados**.
  Quem só quer trocar o preço vê cor de fundo, alinhamento, duração em
  segundos e prioridade. Só a Marca e os Ajustes da tela escondem o avançado.

## Notas (0 a 10, com rigor)

| Critério | Nota | Por quê |
|---|---|---|
| Clareza da navegação | **5** | 8 itens no menu, 22 abas e um terceiro nível de abas em 5 lugares. A mesma lista de TVs em Início, Telas e Programação. Suporte em dois lugares. "Recursos extras" não diz o que tem |
| Facilidade para o leigo | **5** | Criar com a IA é fácil. Mas o editor fala "zona", "sequência", "principal", "lateral", "Corporativo Completo", "Duração (s) 0 = fica fixo". Agendar é uma caixinha no fim do formulário. No celular, o "Publicar" fica duas telas acima |
| Acabamento visual | **6** | Fonte da marca (Outfit), bordas e espaçamento consistentes. Mas o corpo é 13 px, o título de seção também, e o título da página pula para 22 px: tudo parece igual. Mapas da TV pretos, estados vazios cinza e genéricos, pouca imagem |
| Consistência | **6** | O esqueleto é igual. Mas há 243 botões feitos à mão contra 313 do componente, 11 páginas desenham o próprio título, e o "pôr na TV" tem mais de 15 nomes. "Mídias" ainda aparece em cerca de 15 textos, embora o menu diga "Biblioteca" |
| Celular | **6** | Barra de baixo, alvos de 44 px, nada rola de lado. Mas as abas cortam ("Arc"), Peças prontas tem 15 m de rolagem (15.138 px), o editor 2.557 px sem barra fixa de publicar, e Telas fica fora da barra |
| Parece valer o preço | **5** | O Início abre com "Perguntando à TV o que está passando…", a Biblioteca abre numa aba vazia em Saúde e Empresas, e a TV aparece como um esquema de zonas pretas. A Marca e o cartão de Telas são os pontos altos |

**Média: 5,5.** O painel passa no "funciona". Ainda não passa no "uau, isto
vale o que eu pago".

---

## 1. O mapa de hoje

### A árvore

```
Menu (Comércio e Saúde)                       Empresas: igual, com "Pessoas e
│                                             indicadores" depois da Biblioteca
├─ Início ............ Agora | Alertas
├─ Telas ............. Telas | Relatório de exibição
│    └─ cartão da TV: Mudar o que passa · Ver agora · Mais opções
│         └─ Mais opções: Nome e grupo · Recarregar · Som ao vivo ·
│            Horário e aviso de queda · Backup e cópia · Reconectar · Remover
├─ Programação ....... Programação | Calendário
│    └─ Editor da TV (sem aba): Campanhas nesta TV · mapa das zonas ·
│       "Mudar a tela" (IA) · Sequência + formulário do item ·
│       Ajustes da tela (Aparência | Encaixe | Som | Horário | Avançado)
├─ Criar ............. Criar | Criando | Criados
│    └─ Criação rápida (só por um link de texto miúdo)
├─ Biblioteca ........ Telas prontas | Peças prontas | Meus Designs |
│                      Arquivos (Fotos e vídeos | Da IA | Músicas) | Banco de Imagens
├─ Marca
├─ Recursos extras ... Pessoas | Mural de fotos | Indicadores
├─ Conta ............. Plano | Equipe | Ajustes | Suporte
└─ (rodapé) Suporte   ← repetido

Celular: barra de baixo = Início · Programação · Criar · Biblioteca · Mais
         (Telas, Marca, Recursos extras e Conta ficam no "Mais")
```

Números: **8 itens** no menu (mais o Suporte no rodapé), **22 abas**, **29
páginas** e o editor. Terceiro nível de abas em Arquivos, Peças prontas,
Telas prontas, Ajustes da tela e na lista de conversas do Criar.

Arquivos: `web/src/lib/menu.js` (grupos e abas), `web/src/components/layout/Sidebar.jsx`,
`web/src/components/layout/Navegacao.jsx` (abas e barra de baixo),
`web/src/App.jsx` (títulos e rotas).

### Cliques por tarefa (caminho mais curto, conta típica)

| Tarefa | Caminho hoje | Cliques | Comentário |
|---|---|---|---|
| Pôr uma foto na TV | Início › Pôr foto ou vídeo na TV › Galeria › arquivo › Pôr na TV | **4** | Bom. As TVs já vêm marcadas |
| Pôr uma peça pronta | Biblioteca › Peças prontas › Pôr numa TV › Pôr | **4** | Bom, mas a peça está em três abas |
| Mudar o que a TV mostra | Início › Trocar agora › item › editar o campo › rolar para cima › Publicar na TV | **4 + rolagem** | No celular o Publicar fica ~2 telas acima do campo |
| Agendar uma peça | Programação › Editar programação › item › "Mostrar só em alguns dias ou horários" › dias › horas › Publicar | **8–9** | O horário é uma caixinha no fim do formulário. Não há visão da semana |
| Criar com a IA e pôr no ar | Criar › frase › Enviar › "Gostei" › Gerar › Aprovar e gerar › Pôr pra rodar | **8–13** | Medido no bloco 3 |
| Mudar a marca | Marca › outra paleta | **2** | Salva sozinho. Mas a TV não muda: a cor da marca na TV está em Ajustes da tela, **+6 cliques por TV** |
| Adicionar uma TV | Telas › Parear tela › código e nome › Parear | **3** (+1 no celular) | Bom. O QR da TV encurta |
| Convidar alguém | Conta › Equipe › Convidar › e-mail › Gerar convite | **4** | Funciona, mas "Equipe" mora dentro de "Conta" |
| Ver o que está no ar agora | Início (miniatura) ou Telas › Ver agora | **0–2** | A miniatura começa em "Perguntando à TV…". A imagem boa ("Ver agora") está num diálogo, só em Telas |

---

## 2. O que as fotos mostram

### 2.1 Hierarquia e letra

- Escala medida em todas as páginas: **11, 12, 13 e 22 px**. Nada entre 13 e
  22. O título de seção (`PanelHeader`) é 13 px em negrito, igual ao corpo.
  Por isso nada salta aos olhos.
- O corpo padrão é 13 px no computador ("base de dashboard",
  `web/tailwind.config.js:33-46`). Descrições em 12 px. Rótulos dos mapas da
  TV em 9–10 px.
- O próprio código assume o tom de painel técnico: "Tabela densa de
  operação" (`web/src/components/ui/Table.jsx:4`), "Sem cards gigantes"
  (`web/src/components/ui/Panel.jsx:4`). É o registro do Linear e do Vercel,
  feito para engenheiros. O dono de padaria precisa do registro do Canva.

Arquivos: `web/tailwind.config.js`, `web/src/index.css:45-102`,
`web/src/components/ui/Panel.jsx`, `web/src/components/layout/PageHeader.jsx`.

### 2.2 Densidade e ritmo

As páginas ficam em dois extremos:

| Quase vazias (muito branco) | Muito longas |
|---|---|
| Alertas (51 palavras), Relatório (51), Criando (48), Mural (45), Equipe (47), Indicadores (80) | Peças prontas: 5.149 px no computador, **15.138 px no celular**, 99 botões, **49 botões violeta** na mesma página |
| | Marca: 2.358 px; Plano: 1.686 px; Ajustes: 1.554 px; editor da TV: 1.649 px, 32 botões, 6 violeta |

O espaçamento interno é regular (cartões com `px-4 py-3`). O que falta é
ritmo: cada página é uma pilha de cartões brancos do mesmo peso, um embaixo
do outro.

### 2.3 Componentes

- **Botões:** 313 usos de `<Button>` e 243 `<button>` feitos à mão, com
  cores e tamanhos próprios. Exemplos: "Publicar pasta" em
  `web/src/pages/MyDesignsPage.jsx:830`, os dois botões grandes do Início
  (`web/src/pages/DashboardPage.jsx:106-116`), as ações miúdas de cada peça
  em Meus Designs (ícones de 13 px).
- **Títulos:** `PageHeader` em 17 lugares; 11 páginas desenham o próprio
  `<h1>` (Programação, Criados, Criar, Calendário, Telas prontas, Peças
  prontas, Mural, Criando, Criação rápida, editor). O alinhamento e o espaço
  mudam um pouco entre elas.
- **Raios:** 3, 7, 8, 10, 14 px e pílula. Cartões de TV com 14 px, painéis
  com 10 px, botões com 8 px.
- **Estados vazios:** o mesmo ícone cinza de 18 px num quadrado, título de
  13 px e texto de 12 px (`web/src/components/ui/Feedback.jsx:31-42`). Não
  mostram o que vai aparecer ali nem como fica na TV.
- **Diálogos:** consistentes (`Dialog` em 41 lugares). Bom.

### 2.4 Nomes e jargão

| Hoje | O leigo entende? | Melhor |
|---|---|---|
| Programação (página) | Pensa em grade de horário; a página mostra zonas | **Telas** (o que passa em cada TV) |
| Calendário | Espera um calendário; é uma caixa de colar texto | **Datas** (dentro da Agenda) |
| Criar · Criando · Criados | Três abas para uma coisa só | **Criar** (e "em criação" como aviso) |
| Telas prontas · Peças prontas · Meus Designs | Não sabe a diferença | **Prontos para você** e **Seus conteúdos** |
| Mídias (cerca de 15 textos), Arquivos, Biblioteca, acervo | Quatro nomes para o mesmo lugar | **Biblioteca** em todo lugar |
| Recursos extras (ícone de setas) | Não diz nada | **Pessoas e murais** ou "Apps" na Biblioteca |
| Zona, Principal, Lateral, Secundária, Cabeçalho, Rodapé | Não | **Parte de cima, meio, lado, faixa de baixo** |
| Sequência · "ciclo de 1min 6s" | Não | **O que passa · "dá a volta em 1 min"** |
| Corporativo Completo, Destaque + Barra Lateral, Encaixe | Não | Desenho do formato, sem nome técnico |
| Duração (s) · "0 = fica fixo na tela" | Não | **Tempo na tela: curto · normal · longo · fixo** |
| Prioridade: Normal · Alta · Urgente | Mais ou menos | **Importância: normal · mais vezes · por cima de tudo (até…)** |
| Parear tela | Não | **Ligar uma TV** |
| "Igual ao que está na TV" | Sim, mas é um selo verde fraco | "**No ar.** Nada a publicar" |

O **verbo de pôr na TV tem mais de 15 nomes**: Pôr na TV, Pôr numa TV, Pôr
pra rodar, Pôr a campanha, Pôr conteúdo, Colocar conteúdo agora, Publicar,
Publicar na TV, Publicar na tela, Publicar pasta, Usar esta tela, Mostrar nas
TVs, Mudar o que passa, Trocar agora, Editar programação. Para o leigo,
cada nome parece uma coisa diferente.

Textos que apontam para lugares que não existem mais:
- "Ficam em Mídias › Fotos" (`web/src/pages/BrandPage.jsx:462` e `:476`).
- "Está em Meus Designs › Mais" (`web/src/pages/CriacaoRapidaPage.jsx:385`):
  não há "Mais" em Meus Designs.
- "em Mídias › Peças prontas" (`web/src/pages/CriacaoRapidaPage.jsx:530`).

### 2.5 Portas duplicadas

1. **A lista de TVs em três páginas.** Início (miniatura + "Trocar agora"),
   Telas (miniatura + "Mudar o que passa") e Programação (mapa + "Editar
   programação"). As três abrem **o mesmo editor**, com três nomes.
   Arquivos: `DashboardPage.jsx:175-196`, `ScreensPage.jsx:190-235`,
   `ProgramacaoPage.jsx:88-124`.
2. **Criar em todo canto.** 16 chamadas para o Criar em 9 arquivos. Na tela
   aparecem: menu Criar; Início "Criar com a IA" e "Criar para a data";
   Programação "Criar", "Pedir à IA" e "Criar para esta TV"; editor "Criar
   para esta TV", "Criar", o selo "IA" na zona, a caixa "Mudar a tela" e
   "Adicionar › Criar novo com a IA"; Meus Designs "Criar com a IA", "Criar
   na mão", "Gerar só uma imagem" e "Importar do Canva"; Peças prontas
   "Criar novas"; Criados "Criar"; e a Criação rápida, escondida. São **três
   IAs com caras diferentes**: o chat do Criar (`CriarPage.jsx`), o "Pedir à
   IA" (`components/tela/PedirIA.jsx`) e o "Mudar a tela"
   (`components/tela/MudarComIA.jsx`).
3. **As mesmas peças em três abas.** A campanha "Semana do pão de queijo"
   aparece em Criados (cartão da campanha), em Peças prontas (as 5 peças) e
   em Meus Designs (a pasta).
4. **Ajustes da TV em dois lugares.** Som e Horário estão em Telas › Mais
   opções e também no editor › Ajustes da tela › Som | Horário
   (`ScreensPage.jsx:237-255`, `components/content/SettingsForm.jsx:33-36`).
5. **Telas prontas em dois lugares.** Biblioteca › Telas prontas e o editor
   › "Usar uma tela pronta".
6. **Suporte em dois lugares.** Rodapé do menu e Conta › Suporte
   (`Sidebar.jsx:105-120`).

### 2.6 Becos sem saída e próximo passo escondido

- **Editor sem barra de publicar.** O "Publicar na TV" só aparece no topo
  quando há rascunho, e não fica fixo (`ContentEditorPage.jsx:503-541`). No
  celular, quem edita o título lá embaixo não vê o botão.
- **A Biblioteca abre numa aba vazia** em Saúde e Empresas ("As telas prontas
  do seu tipo de negócio estão chegando"). A primeira impressão do lugar
  "onde está tudo" é um vazio.
- **Calendário sem calendário.** A página é uma caixa de texto e uma lista.
- **Marca sem efeito visível na TV.** Trocar a paleta não muda a TV, e a
  página não oferece "Usar nas minhas TVs". O interruptor real está em
  Ajustes da tela › Aparência (`SettingsForm.jsx:208`).
- **"Pessoas" na padaria.** No Comércio, o grupo "Recursos extras" abre em
  Pessoas (aniversariantes da equipe), coisa de RH.
- **Criação rápida** só por um link miúdo no rodapé do Criar.
- **Telas fora da barra do celular.** Para ligar uma TV nova ou "Ver agora"
  no celular: Mais › Telas.

### 2.7 A TV está no centro? Não.

O produto é a tela. No painel, a tela de verdade aparece pouco:

| Onde | O que se vê |
|---|---|
| Início | Miniaturas boas, mas começam em "Perguntando à TV o que está passando…" (`components/tela/MiniaturaDaTela.jsx`) |
| Telas | Miniatura boa no cartão. É o melhor lugar hoje |
| Programação | Um **esquema de zonas pretas** com rótulos técnicos (`components/tela/MapaDaTela.jsx`), não a TV |
| Editor | O esquema ocupa o meio; a prévia de verdade é uma caixa de 360 px, só do item, no meio do formulário. As miniaturas da lista cortam o texto ("entin", "ome") |
| Ver agora | A imagem real da TV, ótima, mas num diálogo, só em Telas (`components/content/VerTelaAgora.jsx`) |
| Marca | "Como fica na TV" é um esboço de barras, não a TV |

### 2.8 Os três níveis hoje

| Nível | O que existe | Problema |
|---|---|---|
| **Pronto** (um clique) | Pôr foto ou vídeo; Peças prontas › Pôr numa TV; ideia do dia; Telas prontas | Telas prontas vazias em 2 frentes; os prontos estão espalhados em 3 abas |
| **Ajustável** (dia a dia) | Editor (texto, foto, ordem); Criar; Pedir à IA | O editor mostra tudo de uma vez, sem separar o que é dia a dia |
| **Avançado** | Ajustes da tela › Avançado; Marca › "Escolher as cores à mão · avançado" e "Avançado" recolhido; Criar na mão; Indicadores por endereço e token | Os campos avançados do item (alinhamento, tamanho, cor de fundo, cor do texto, duração, prioridade) vêm abertos para todos (`web/src/lib/contentTypes.js:34-47`) |

A **Marca já faz certo**: o básico em cima, "Avançado" recolhido embaixo.
É o padrão a copiar em todo o painel.

### 2.9 Celular

- Bom: barra de baixo, alvos de 44 px, letra mínima de 13 px, nenhuma rolagem
  lateral, gaveta "Mais" com foco preso e Esc.
- Ruim:
  - abas que cortam ("Telas prontas | Peças prontas | Meus Designs | Arc…");
  - o topo de cada página (abas + título + subtítulo + botão) come ~1/3 da
    tela antes do conteúdo;
  - Peças prontas com 15.138 px de rolagem;
  - o editor com 2.557 px e publicar só no topo;
  - "Telas" fora da barra;
  - o "Mais" abre o menu do computador inteiro, de lado.

### 2.10 O que já está bom (manter)

- O esqueleto: menu à esquerda, título e ação à direita, abas em pílula.
- O cartão da TV em Telas, com miniatura, estado em palavras e um botão principal.
- "Ver agora", "Pôr foto ou vídeo na TV" (4 toques) e o diálogo de parear.
- A página Marca: análise da logo, paletas desenhadas como peças de verdade, avançado recolhido.
- O "Próximo passo" (`components/layout/ProximoPasso.jsx`) e os "Últimos envios › Desfazer".
- Acessibilidade de base: "Pular para o conteúdo", foco nos diálogos, Esc.

---

## 3. O que os melhores fazem (e o que copiar)

| Referência | Como organiza | O que copiar |
|---|---|---|
| **ScreenCloud** | Poucos itens: Screens, Playlists, Channels, Apps, Content. A página de uma tela mostra a prévia grande e o que está passando | A **página da TV** com prévia grande, "agora" e "a seguir". "Apps" como lugar dos conteúdos que se atualizam sozinhos (clima, aniversários, indicadores) |
| **Yodeck** | Screens, Playlists, Schedules, Media. Lista de telas com foto ao vivo. Agenda como grade semanal, arrastando blocos | A **agenda semanal visual**. A foto ao vivo de cada TV na lista, sempre fresca |
| **OptiSigns** | Assets, Playlists, Schedules, Screens. Brand Kit vale para tudo. "Push to screen" de qualquer arquivo | **Marca aplicada por padrão** e **um botão só, "Pôr na TV"**, igual em qualquer peça |
| **Appspace** | Cards com campos simples; o tema da marca é travado; o avançado fica com o admin | O nível **Ajustável** como "preencher campos" (preço, foto, horário), sem mexer em cor e letra |
| **Canva** | Um botão "Criar um design" grande e fixo. Início com "Recentes" e modelos. Editor com a tela no meio e um painel ao lado | **Um só "Criar"**. **A tela no centro** de toda edição. "Recentes" no Início |
| **Linear / Notion** | Menu curto com ícone e palavra; "+ Novo" sempre no mesmo lugar; conta e ajustes no avatar; busca rápida | Menu de **5–6 itens**; Conta, Plano, Equipe e Ajustes **no avatar**; nada repetido no menu |

O que nenhum deles faz: mostrar a mesma lista de TVs em três páginas, ou as
mesmas peças em três abas.

---

## 4. A proposta

### 4.1 O menu novo

```
Computador                         Celular (barra de baixo)
┌──────────────────────────┐       ┌────────────────────────────────────────┐
│ [logo] Padaria Trigo     │       │ Início  Telas  [ + Criar ]  Agenda  Bib.│
│ ┌──────────────────────┐ │       └────────────────────────────────────────┘
│ │   +  Criar           │ │  ← botão fixo, sempre igual
│ └──────────────────────┘ │
│ ▸ Início                 │  o que está no ar e o que precisa de você
│ ▸ Telas            (2)   │  as TVs; cada uma abre a página dela
│ ▸ Agenda                 │  a semana, as campanhas com período, as datas
│ ▸ Biblioteca             │  tudo que pode ir para a TV, uma vez só
│ ▸ Marca                  │  logo, cores, jeito de falar
│ ▸ Pessoas   (Empresas)   │  aniversários, mural, indicadores
│                          │
│ ? Ajuda                  │
└──────────────────────────┘
Avatar (topo, à direita): Plano · Equipe · Ajustes · Ajuda · Sair
```

- **5 itens** em Comércio e Saúde, **6** em Empresas, mais o botão **Criar**.
- No Comércio e na Saúde, Pessoas, Mural e Indicadores viram **Apps** dentro
  da Biblioteca ("conteúdos que se atualizam sozinhos").
- **Alertas** viram uma faixa "Precisa de você" no Início e um número no item Telas.
- **Conta** sai do menu: vai para o avatar. **Suporte** aparece uma vez (Ajuda).

### 4.2 Antes → depois, página a página

| Hoje | Depois | Decisão |
|---|---|---|
| Início › Agora (`DashboardPage.jsx`) | **Início** refeito (wireframe A) | fica |
| Início › Alertas (`AlertsPage.jsx`) | Faixa "Precisa de você" no Início + número no item Telas | junta |
| Telas › Telas (`ScreensPage.jsx`) | **Telas**: grade de TVs com foto ao vivo, grupos e "Ligar uma TV" | fica |
| Telas › Relatório de exibição (`RelatorioPage.jsx`) | Página da TV › aba "O que passou"; planilha geral no topo de Telas | move |
| Programação (`ProgramacaoPage.jsx`) | Some como página: vira a página de cada TV | junta |
| Editor da TV (`ContentEditorPage.jsx`) | **Página da TV** com a tela no centro (wireframe B) | refaz |
| Telas › Mais opções (diálogo) | Página da TV › "Ajustes da TV" (junta com Ajustes da tela) | junta |
| Programação › Calendário (`CalendarioPage.jsx`) | **Agenda › Datas** (colar texto + datas do comércio para marcar) | move |
| Criar (`CriarPage.jsx`) | **Criar**: a única entrada (wireframe C) | fica |
| Criar › Criando (`CriandoPage.jsx`) | Aviso no topo ("1 em criação") e filtro "Em criação" na Biblioteca | sai como aba |
| Criar › Criados (`CampanhasPage.jsx`) | Biblioteca › Seus conteúdos › filtro Campanhas | junta |
| Criação rápida (`CriacaoRapidaPage.jsx`) | Criar › "Escolher um modelo" | junta |
| Pedir à IA (`PedirIA.jsx`), Mudar a tela (`MudarComIA.jsx`), Aviso rápido | Criar (mesma conversa), aberto já com a TV marcada | junta |
| Biblioteca › Telas prontas (`TelasProntasPage.jsx`) | Biblioteca › Prontos para você + Criar › modelos | junta |
| Biblioteca › Peças prontas (`PecasProntasPage.jsx`) | Biblioteca › Seus conteúdos (paginado) | junta |
| Biblioteca › Meus Designs (`MyDesignsPage.jsx`) | Biblioteca › Seus conteúdos; "Criar na mão" vai para Criar › Avançado | junta |
| Biblioteca › Arquivos (`ArquivosPage.jsx`, `StoragePage.jsx`) | Biblioteca › Fotos e vídeos · Músicas ("Da IA" vira filtro) | fica |
| Biblioteca › Banco de Imagens (`BancoImagensPage.jsx`) | Fotos e vídeos › "Buscar fotos grátis" | junta |
| Marca (`BrandPage.jsx`) | **Marca** + "Usar nas minhas TVs" (ligado) + prévia real | fica |
| Recursos extras › Pessoas (`BirthdaysPage.jsx`) | Empresas: item **Pessoas**. Outros: Biblioteca › Apps | move |
| Recursos extras › Mural (`MuralPage.jsx`) | Apps (e Pessoas, em Empresas) | move |
| Recursos extras › Indicadores (`IndicadoresPage.jsx`) | Apps › Avançado | move |
| Conta › Plano (`BillingPage.jsx`) | Avatar › Plano | move |
| Conta › Equipe (`TeamPage.jsx`) | Avatar › Equipe; "Convidar alguém" no Início enquanto só há 1 pessoa | move |
| Conta › Ajustes (`SettingsPage.jsx`) | Avatar › Ajustes (+ "Mostrar opções avançadas") | move |
| Conta › Suporte e rodapé (`SupportPage.jsx`) | **Ajuda**, um lugar só | junta |
| Sistema, Plataforma (`SystemPage.jsx`, `PlatformPage.jsx`) | Só o operador, como hoje | fica |
| Login, Placeholder | Como hoje | fica |

Resultado: de 8 grupos, 22 abas e 3 níveis para **5–6 itens, no máximo 4
abas por página e 2 níveis**.

### 4.3 Os três níveis, como regra

| Nível | Regra | Onde aparece |
|---|---|---|
| **Pronto** | Um clique, resultado bonito, com a marca. Sempre em cima | Início (ideia do dia, "Pôr foto"), Criar › modelos, Biblioteca › Prontos, página da TV › "Trocar por uma tela pronta" |
| **Ajustável** | Só os campos do conteúdo: título, preço, foto, "quando mostrar" em frases | Página da TV (painel ao lado da tela), Criar (a conversa), Agenda |
| **Avançado** | Recolhido em "Mais ajustes". Lembra a escolha de cada pessoa. Um interruptor geral em Ajustes | Layout, cores, letra, tempo exato, importância, encaixe, som, recarga, editor livre, indicadores |

Como fazer: marcar cada campo de `web/src/lib/contentTypes.js` com um nível
(`nivel: 'avancado'` em alinhamento, tamanho, cores, duração) e desenhar o
formulário em dois blocos (`components/content/ItemForm.jsx`). O mesmo em
`SettingsForm.jsx` e em Marca, que já faz isso.

### 4.4 Wireframes

**A. Início (computador)**

```
┌───────────────────────────────────────────────────────────────────────┐
│ Bom dia, Padaria Trigo Dourado                    [ + Criar ]         │
│ Suas 2 TVs estão no ar.                                               │
├───────────────────────────────────────────────────────────────────────┤
│ ┌──────────────────────────────┐  ┌──────────────────────────────┐    │
│ │                              │  │                              │    │
│ │   FOTO AO VIVO DO BALCÃO     │  │  FOTO AO VIVO DA VITRINE     │    │
│ │   (grande, 16:9)             │  │  (em pé)                     │    │
│ │                              │  │                              │    │
│ └──────────────────────────────┘  └──────────────────────────────┘    │
│  ● Balcão · no ar                   ● Vitrine · no ar                 │
│  Agora: Pão de queijo 2x · A seguir: Café R$ 9,90                     │
│  [ Abrir a TV ]                     [ Abrir a TV ]                    │
├───────────────────────────────────────────────────────────────────────┤
│ PRECISA DE VOCÊ (só quando existe)                                    │
│  ⚠ A oferta "Pão de queijo" acaba hoje.  [ Manter até domingo ]       │
├───────────────────────────────────────────────────────────────────────┤
│ PARA HOJE                                                             │
│ ┌ Novembro Azul ──────┐ ┌ Promoção da semana ┐ ┌ Pôr uma foto ──────┐ │
│ │ [prévia com a marca]│ │ [prévia]           │ │ [ícone câmera]     │ │
│ │ Pôr na TV           │ │ Criar              │ │ Escolher           │ │
│ └─────────────────────┘ └────────────────────┘ └────────────────────┘ │
├───────────────────────────────────────────────────────────────────────┤
│ RECENTES   [peça] [peça] [peça] [peça]                 Ver tudo →     │
└───────────────────────────────────────────────────────────────────────┘
```

As TVs grandes em cima, com "agora" e "a seguir" em palavras. Um só botão
violeta (Criar). As ideias já desenhadas com a marca, prontas para um
clique.

**B. Página da TV (o coração do painel)**

```
┌───────────────────────────────────────────────────────────────────────┐
│ ← Telas   Balcão  ● no ar          [Ver como cliente]  [Ajustes da TV]│
├──────────────────────────────────────────────┬────────────────────────┤
│                                              │ O QUE ESTÁ SELECIONADO │
│                                              │ Pão quentinho às 16h   │
│        A TELA, GRANDE, AO VIVO               │                        │
│        (o player desenhado de verdade,       │ Título  [__________]   │
│         clicável por parte: em cima,         │ Texto   [__________]   │
│         meio, lado, faixa de baixo)          │ Foto    [trocar]       │
│                                              │                        │
│                                              │ Quando mostrar         │
│                                              │ (●) Sempre             │
│                                              │ ( ) Só de manhã        │
│                                              │ ( ) Até [sábado ▾]     │
├──────────────────────────────────────────────┤                        │
│ O QUE PASSA NO MEIO  · dá a volta em 1 min   │ ▸ Mais ajustes         │
│ [▣ 1 ][▣ 2 ][▣ 3 ][▣ 4 ][▣ 5 ][ + Pôr algo ] │   (cor, letra, tempo,  │
│  arrastar para mudar a ordem                 │    importância)        │
│                                              │                        │
│ PRONTOS: [Trocar por uma tela pronta]        │ [ Tirar desta TV ]     │
│          [Aviso rápido por cima]             │                        │
├──────────────────────────────────────────────┴────────────────────────┤
│ ● Rascunho: 1 mudança        [Desfazer]   [ Pôr na TV agora ]  ← fixo │
└───────────────────────────────────────────────────────────────────────┘
Abas pequenas no topo: O que passa · Quando · O que passou
```

Junta o cartão de Telas, a Programação, o editor, o "Ver agora" e o
Relatório. A prévia é o próprio player (o `Palco` de `VerTelaAgora.jsx`), e
o esquema de zonas vira só um contorno ao passar o mouse. A barra de baixo
fica fixa, inclusive no celular.

**C. Criar (a única entrada)**

```
┌───────────────────────────────────────────────────────────────────────┐
│ O que você quer pôr na TV?                                            │
│ ┌───────────────────────────────────────────────────────────┐ [Enviar]│
│ │ Ex.: pão de queijo em dobro à tarde, só no balcão         │         │
│ └───────────────────────────────────────────────────────────┘         │
│                                                                       │
│  ┌ Pedir à IA ──────┐  ┌ Escolher um modelo ┐  ┌ Subir foto/vídeo ┐   │
│  │ ela conversa e   │  │ [prévias da frente]│  │ galeria ou câmera│   │
│  │ monta tudo       │  │                    │  │                  │   │
│  └──────────────────┘  └────────────────────┘  └──────────────────┘   │
│                                                                       │
│  Ideias de hoje: [Novembro Azul] [Promoção] [Horário] [Cardápio]      │
│  ▸ Avançado: editor livre · gerar só uma imagem · importar do Canva   │
├───────────────────────────────────────────────────────────────────────┤
│ Todo caminho termina igual:                                           │
│   1 Ver a prévia na TV  →  2 Onde (TVs)  →  3 Quando  →  [Pôr na TV]  │
└───────────────────────────────────────────────────────────────────────┘
```

Aberto de dentro de uma TV, já vem com ela marcada. Substitui o chat do
Criar, a Criação rápida, o Pedir à IA, o Mudar a tela, o Aviso rápido e o
"Criar na mão" como portas separadas.

**D. Agenda (a semana)**

```
┌───────────────────────────────────────────────────────────────────────┐
│ Agenda    TV: [Todas ▾]   Semana de 09/11      [Hoje] [<] [>]         │
├───────┬────────┬────────┬────────┬────────┬────────┬────────┬─────────┤
│       │ seg    │ ter    │ qua    │ qui    │ sex    │ sáb    │ dom     │
│ manhã │ Café da manhã ─────────────────────────────────────▶│         │
│ almoço│ ░ vazio: a TV mostra o relógio  [Encher com a IA]   │         │
│ tarde │ Pão de queijo 2x ─────────────────────▶ (até sáb)   │         │
│ noite │ ░ vazio                                             │         │
├───────┴────────┴────────┴────────┴────────┴────────┴────────┴─────────┤
│ DATAS QUE VÊM   Black Friday 27/11 [Preparar]  ·  Natal 25/12 [Preparar]│
│ [ Colar o calendário da loja ]                                        │
└───────────────────────────────────────────────────────────────────────┘
```

Mostra os buracos do dia (o bloco 3 achou três relógios no almoço) e as
datas do comércio. Tocar num bloco abre a peça; arrastar a ponta muda o fim.

**E. Celular: Início e página da TV**

```
┌────────────────────────┐   ┌────────────────────────┐
│ Padaria Trigo   (PT)   │   │ ← Balcão  ● no ar   ⋯  │
│ Suas 2 TVs estão no ar │   │ ┌────────────────────┐ │
│ ┌────────────────────┐ │   │ │  A TELA AO VIVO    │ │
│ │ FOTO AO VIVO       │ │   │ └────────────────────┘ │
│ │ Balcão             │ │   │ O que passa no meio    │
│ └────────────────────┘ │   │ [▣][▣][▣][▣][+]  →     │
│ Agora: Pão de queijo   │   │                        │
│ [ Abrir a TV ]  ‹ 1/2 ›│   │ Pão quentinho às 16h   │
│                        │   │ Título [__________]    │
│ Para hoje              │   │ Quando: Sempre ▾       │
│ [Novembro Azul] [Foto] │   │ ▸ Mais ajustes         │
│                        │   │                        │
├────────────────────────┤   ├────────────────────────┤
│ ⌂   ▭   (+)   ▦   ▤    │   │ 1 mudança [Pôr na TV]  │ ← fixo
└────────────────────────┘   └────────────────────────┘
```

No celular: a barra tem Telas e Agenda; Criar no meio, maior. Abas viram um
seletor quando não cabem. Listas longas paginam (Peças prontas não passa de
duas telas).

### 4.5 Aparência

- **Letra:** corpo 15 px, título de seção 17–18 px, título de página 26–28 px,
  números grandes 32 px. Mínimo de 13 px continua.
- **Um violeta só por tela**: o botão principal. Os outros, contorno ou texto.
  Hoje Peças prontas tem 49 violetas.
- **Imagem antes de texto:** todo cartão de peça, modelo e TV mostra a prévia
  na proporção real, com a marca. Estados vazios mostram um exemplo da frente
  desenhado ("assim fica a sua TV com uma tela pronta").
- **Menos cartão dentro de cartão.** Seções com título de 17 px e espaço, não
  caixas brancas empilhadas.
- **Um componente de botão.** Os 243 `<button>` à mão viram variantes de
  `Button` (inclusive o botão grande de escolha, que hoje se repete no
  Início, no editor e em Meus Designs).

---

## 5. As 10 mudanças, em ordem

| # | Mudança | Por quê | Arquivos |
|---|---|---|---|
| 1 | **Página da TV com a tela no centro**, juntando Telas, Programação, editor, Ver agora e Relatório; barra fixa "Pôr na TV" com Desfazer | É o produto. Hoje a TV é um esquema preto e o publicar some no celular | `pages/ScreensPage.jsx`, `pages/ProgramacaoPage.jsx`, `pages/ContentEditorPage.jsx`, `components/tela/MapaDaTela.jsx`, `components/content/VerTelaAgora.jsx` |
| 2 | **Um só Criar**, fixo no menu e no meio da barra do celular, terminando sempre em "Onde → Quando → Pôr na TV" | Mais de 15 portas e 3 IAs diferentes confundem | `pages/CriarPage.jsx`, `pages/CriacaoRapidaPage.jsx`, `components/tela/PedirIA.jsx`, `components/tela/MudarComIA.jsx`, `components/tela/AvisoRapido.jsx`, topo de `pages/MyDesignsPage.jsx` |
| 3 | **Os três níveis em toda tela**: Pronto em cima, Ajustável ao lado da TV, Avançado recolhido | Quem troca o preço não precisa ver cor de fundo e duração em segundos | `lib/contentTypes.js`, `components/content/ItemForm.jsx`, `components/content/SettingsForm.jsx` |
| 4 | **Menu de 5–6 itens**; Conta, Plano, Equipe e Ajustes no avatar; Ajuda uma vez; barra do celular com Telas e Agenda | 8 grupos e 22 abas; Suporte repetido; Telas fora da barra | `lib/menu.js`, `components/layout/Sidebar.jsx`, `components/layout/Navegacao.jsx`, `components/layout/Topbar.jsx`, `components/layout/AppShell.jsx` |
| 5 | **Biblioteca única** ("Prontos para você" e "Seus conteúdos"), cada peça uma vez, com um botão "Pôr na TV" | A mesma campanha em Criados, Peças prontas e Meus Designs | `pages/CampanhasPage.jsx`, `pages/PecasProntasPage.jsx`, `pages/MyDesignsPage.jsx`, `pages/TelasProntasPage.jsx`, `pages/StoragePage.jsx`, `pages/BancoImagensPage.jsx` |
| 6 | **Agenda semanal visual** com campanhas, horários e datas; "Quando mostrar" em frases | Agendar custa 8–9 cliques e ninguém vê os buracos do dia | `components/content/QuandoMostrar.jsx`, `pages/CalendarioPage.jsx`, página nova |
| 7 | **Escala de letra e hierarquia**: 15 / 17 / 28 px, um violeta por tela, estados vazios com exemplo | Hoje tudo tem o mesmo peso e o painel parece técnico | `web/tailwind.config.js`, `src/index.css`, `components/ui/Panel.jsx`, `components/layout/PageHeader.jsx`, `components/ui/Feedback.jsx` |
| 8 | **Um verbo e um glossário**: "Pôr na TV" para pôr; "Abrir a TV" para entrar; Biblioteca em todo lugar; zona → parte da tela; prioridade → importância; parear → ligar | 15 nomes para pôr na TV; "Mídias" em cerca de 15 textos; textos apontam para lugares que sumiram | `pages/BrandPage.jsx:462,476`, `pages/CriacaoRapidaPage.jsx:385,530`, `components/content/SubirConteudo.jsx`, `components/content/EditarPeca.jsx`, `components/content/FotoDoProduto.jsx` |
| 9 | **Marca que chega à TV pela própria Marca**: "Usar nas minhas TVs" ligado, e a prévia real no lugar do esboço | Mudar a paleta não muda a TV; o interruptor está escondido em cada TV | `pages/BrandPage.jsx`, `components/content/SettingsForm.jsx:208` |
| 10 | **Celular de verdade**: abas viram seletor, topo da página mais baixo, listas paginadas, barra de publicar fixa | Abas cortadas, 15 m de rolagem em Peças prontas, 1/3 da tela gasto no topo | `components/layout/Navegacao.jsx`, `components/layout/AppShell.jsx`, `pages/PecasProntasPage.jsx` |

## Limites

- Uma passada só, com a conta típica. Não refiz as contas cheia e antiga
  (o bloco 4–7 já as cobriu).
- Só Chromium, só o tema claro.
- IA simulada: a conversa do Criar não foi até o fim aqui (o bloco 3 mediu).
- As comparações com ScreenCloud, Yodeck, OptiSigns, Appspace, Canva e
  Linear vêm do conhecimento geral desses produtos, sem abrir os sites.
