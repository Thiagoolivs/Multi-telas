# Bloco 8, reteste: a interface do painel

Reteste em **05/11/2026**, fase 10 do plano. Base: `main` em `72cba9c`
(fases 7, 8 e 9 A–C dentro). Servidor **local** na porta 5973, com dados
próprios (`STORAGE=local`, IA de teste `AI_PROVIDER=dev`, cobrança de
teste). Nada de produção. Nenhum arquivo do repositório foi mudado.

Pasta de tudo: `(fotos e scripts no ambiente do reteste)`
(daqui em diante, `R10/`).

## Nota do bloco

**6,7 de 10** (era 5,5). Melhorou em todos os critérios. A meta da fase
(9) **não foi batida**.

## Como medi (o mesmo método do bloco 8)

- As mesmas três contas típicas, montadas pelo mesmo script do bloco 8
  (`R10/qa/monta.js`): Padaria Trigo Dourado, Clínica Vida Plena e Rota Sul
  Logística. Cada uma com logo e cores, plano pago, 2 TVs de verdade
  (player aberto no Chromium e pareado pelo código: uma deitada, uma em pé),
  3 textos, 1 campanha no ar, 5 peças guardadas e 1 convite. Na Empresas, 12
  pessoas.
- **Fotos:** 27 páginas × 3 frentes × 2 tamanhos (1440×900 e 390×844), mais
  o menu do avatar e a gaveta do celular (`R10/shots/`, 174 fotos). Página
  inteira de 14 páginas no Comércio (`R10/full/`). Diálogos e fluxos em
  `R10/cliques/`.
- **Medidas por página:** palavras, botões, botões violeta, letra por
  caractere, altura, rolagem lateral, abas (`R10/medidas-*.json`).
- **axe e violeta:** o script da fase 8 (`R10/qa/medir.js`), nas contas
  típicas: 18 páginas × 2 frentes × 2 tamanhos = 70 telas (`R10/axe/medida.json`).
- **Cliques:** fiz cada tarefa de verdade com o Playwright, a partir do
  Início, no computador e no celular (`R10/qa/cliques.js`,
  `R10/cliques/resultado-d.json` e `-m.json`). Regra: conta cada toque
  (botão, item, aba, escolher o arquivo). Digitar não conta. Conferi no
  servidor que a TV recebeu a mudança.
- **A TV de verdade ao lado do painel:** uma conta extra com marca, a mesma
  programação, foto da TV e do "Na TV agora" no mesmo minuto (`R10/qa/fiel.js`).
- **Conteúdo pronto:** como a conta vê hoje, e como veria com o lote da
  padaria aprovado na galeria do operador (aprovei, fotografei e voltei
  ao estado de antes: `R10/qa/galeria.js`).
- Comparo com ScreenCloud, Yodeck, OptiSigns, Canva e Linear como no
  bloco 8, pelo que se sabe desses produtos, sem abrir os sites.

## Notas (0 a 10, com rigor)

| Critério | Antes | Agora | Por quê |
|---|---|---|---|
| Clareza da navegação | 5 | **7** | Menu de 5 itens e o Criar fixo, conta no avatar, Telas e Agenda na barra do celular. As abas do primeiro nível caíram de 22 para cerca de 11. Mas a Biblioteca tem até 4 níveis (Biblioteca › Prontos › Peças soltas › TV deitada). A mesma campanha está em 3 lugares, os modelos em 3 catálogos, e os ajustes da TV em 2 |
| Facilidade para o leigo | 5 | **6,5** | O "Pôr na TV" com "1. Onde, 2. Quando" em frases é muito bom, e a barra fixa resolve o publicar. Mas a página da TV ainda fala "Cabeçalho, Principal, Secundária, Zonas, ciclo, Corporativo Completo, Composição (4 elemento(s))". Agendar uma peça que já está na TV usa a caixinha antiga com horas. E a porta "Escolher um modelo" cai no editor avançado, com camadas e gradiente |
| Acabamento visual | 6 | **7** | A escala 15/17/28 vale em todas as páginas, há um violeta no conteúdo, e as miniaturas e as peças saem na marca. Mas o "Na TV agora" é um desenho roxo-escuro com a palavra "Cabeçalho", não a TV. A fila corta o texto ("entin") e mostra a foto como uma caixa preta. A Agenda é toda em 12 px |
| Consistência | 6 | **6,5** | O título é igual em todo lugar (28 px, 24 no celular), as abas novas usam um só componente e o verbo "Pôr na TV" domina. Mas os botões feitos à mão subiram de 243 para 256. Há "Trocar agora" e "Abrir a TV" para a mesma ação, e a IA termina em "Pôr pra rodar". Existem dois "Quando" diferentes, "Mídias" ainda aparece e o axe acha 8 falhas |
| Celular | 6 | **7** | A barra de baixo está certa, as abas viram seletor, as listas paginam (Peças prontas: de 15.138 para 5.942 px) e a barra "Pôr na TV" é fixa. Mas a Marca quebra no celular: os selos da logo ficam espremidos numa coluna de 40 px. A página da TV tem 2.825 px, e o campo para editar fica a ~1.700 px do topo |
| Parece valer o preço | 5 | **6** | O Início abre com as TVs na marca em 0,4–1,1 s, sem "Perguntando à TV…". As peças prontas ficaram bonitas. Mas a Biblioteca abre numa ótica na padaria (Comércio) e vazia na Saúde e na Empresas. Os modelos sugerem óculos e coloração para uma padaria, e a TV "ao vivo" não é a TV |

**Média: 6,7.** O painel passou de "ferramenta interna bem-feita" para "produto
organizado". Ainda não chega ao "uau, a minha TV está aqui", que é o padrão do
Yodeck e do ScreenCloud: lá a foto da tela é a tela.

## Cliques por tarefa (contados de verdade, a partir do Início)

| Tarefa | Antes | Agora (PC) | Agora (celular) | Caminho de hoje |
|---|---|---|---|---|
| Pôr uma foto na TV | 4 | **4** | **4** (+1 rolagem) | Início › Pôr foto ou vídeo na TV › Galeria › arquivo › Pôr na TV. Pelo Criar são 5. Arrastar o arquivo (2, segundo a fase 7) não foi refeito |
| Pôr uma peça pronta | 4 | **4** | **4** | Biblioteca › Peças soltas › Pôr na TV › Pôr na TV. Por Criar › Escolher um modelo são 5, passando pelo editor avançado |
| Mudar o que a TV mostra | 4 + rolagem | **3** (+1 rolagem) | **3** (+2 rolagens) | Início › Trocar agora › item › (digita) › Pôr na TV, na barra fixa. A TV recebeu o preço novo |
| Agendar uma peça nova | 8–9 | **6** | **6** | Biblioteca › Peças soltas › Pôr na TV › Numa hora do dia › Tarde › Pôr na TV |
| Agendar a que já está na TV | 8–9 | **4** (+1 rolagem, 2 horas digitadas) | **4** (+1–2 rolagens) | Início › Trocar agora › item › "Mostrar só em alguns dias ou horários" › (das/às) › Pôr na TV. Pela Agenda dá o mesmo: Agenda › a peça › a caixa › Pôr na TV |
| Criar com a IA e pôr no ar | 8–13 | **6** (+1 rolagem) | **6** (+1 rolagem) | Criar › (digita) › Enviar › Sem foto › Gerar › Aprovar e gerar › Pôr pra rodar. Medido com a IA de teste, que responde por regra numa só volta (o Gemini está sem crédito). Com a IA real, a conversa pode pedir mais respostas. A de teste ignorou "só no balcão" e pôs nas duas TVs |
| Mudar a marca | 2 (+6 por TV) | **2** | **3** (+1 rolagem) | Marca › paleta. O tema da TV mudou no servidor na hora. No celular, a Marca fica no ☰ |
| Adicionar uma TV | 3 (+1 no celular) | **3** | **3** | Telas › Ligar uma TV › (código e nome) › Ligar |
| Convidar alguém | 4 | **3** | **3** | avatar › Convidar alguém › (e-mail) › Gerar convite |
| Ver o que está no ar | 0–2 | **0** | **0** | O Início mostra a miniatura em 1,1 s no PC e 0,4 s no celular. Telas › Ver agora = 2. Mas a miniatura é um desenho (ver "A TV está no centro?") |

Fotos: `R10/cliques/d-*.jpg` e `R10/cliques/m-*.jpg`.

Resumo: 5 de 9 tarefas em até 3 toques (eram 3). Ficam acima de 3: foto (4),
peça pronta (4), agendar (4 a 6) e IA (6). É o mesmo quadro que a fase 7
anotou.

## O que melhorou (e funciona)

- **Menu e avatar.** O menu tem 5 itens (6 na Empresas), com o "+ Criar" fixo
  em cima e no meio da barra do celular. Plano, Equipe, Convidar, Ajustes e
  Ajuda estão no avatar (`web/src/lib/menu.js`, `components/layout/Topbar.jsx:96`).
- **O Início mostra as TVs.** As miniaturas saem na marca e chegam rápido,
  sem "Perguntando à TV…" (`R10/shots/comercio-d-overview.jpg`).
- **A página da TV existe.** "Na TV agora" fica no centro, com três partes
  (O que passa, Ajustes da TV, O que passou). A barra fixa diz "No ar · nada
  novo para pôr", "Rascunho · ainda não está na TV", "Pôr na TV", "Desfazer"
  e "Refazer", também no celular (`R10/full/comercio-d-TV2.jpg`, `R10/folha-m-TV2.jpg`).
- **O fim comum "Pôr na TV".** A foto, a peça e o modelo terminam no mesmo
  diálogo: prévia, "1. Onde" com as TVs marcadas e "2. Quando" em frases
  (Sempre, Só hoje, Até um dia, Numa hora do dia, com Manhã, Almoço, Tarde e
  Fim do dia). Foi a melhor tela do reteste (`R10/cliques/m-agendarNova-dialogo.jpg`).
- **"Mais ajustes" recolhido.** Alinhamento, tamanho, cores, tempo e
  importância saíram da frente, e a escolha fica guardada (`components/content/ItemForm.jsx:24`,
  `R10/shots/x-tv-mais-ajustes.jpg`).
- **A letra.** O título da página tem 28 px em todo lugar (24 no celular), o
  de seção 17 e o corpo 15. Em 77 páginas, 43% do texto tem 15 px ou mais no
  PC e 47% no celular. Antes nada passava de 13. Não sobrou corpo de 11 px.
- **Um violeta no conteúdo.** No máximo 1 em cada uma das 70 telas. Peças
  prontas tinha 49.
- **A Agenda semanal existe**, com a semana no PC e um dia por vez no
  celular (`R10/shots/comercio-d-calendario.jpg`).
- **A Marca chega à TV.** "Usar nas minhas TVs" vem ligado, e trocar a
  paleta mudou o tema da TV no servidor na hora.
- **Os estados vazios mostram uma TV desenhada** com um exemplo (`R10/shots/saude-d-prontos.jpg`).
- **A Biblioteca tem nomes de leigo:** Prontos para você, Seus conteúdos,
  Fotos e vídeos, Apps. Na padaria, "Pessoas" saiu do menu e foi para Apps.
- **O celular não rola de lado** em nenhuma página, e os toques têm 44 px.

## O que ainda está fraco

### 1. A TV está no centro? No lugar, sim. Na fidelidade, não.

| Onde | O que se vê |
|---|---|
| Início e Telas | A miniatura chega rápido e a peça da IA aparece fiel. Mas o texto, o clima e o cabeçalho viram um desenho genérico: fundo `#0E0B1F` (roxo-escuro), a palavra "Cabeçalho" e "Painel do clima", sem a logo e sem a cor da marca |
| Página da TV | Duas TVs desenhadas, lado a lado: o "Na TV agora" e o mapa das partes. No mapa, as partes Principal e Lateral ficam pretas, com os rótulos "Principal · 6 conteúdos", "Secundária" e "Rodapé" |
| A fila | A miniatura de 40 px corta o texto ("entin", "de", "ome"), e a foto aparece como uma caixa preta |
| Marca | "Como fica na TV" ainda é um esboço de barras |

Prova lado a lado: `R10/fiel-lado-a-lado.jpg`. A TV de verdade mostra a logo,
"Padaria Fiel", o relógio, o fundo marrom da marca e "AVISOS" no rodapé. O
painel mostra uma caixa roxo-escura com "Cabeçalho".
Código: `web/src/components/content/VerTelaAgora.jsx:189` (o texto em
`bg-[#0E0B1F]`) e `:204-206` (o cabeçalho escrito "Cabeçalho"). A fila:
`web/src/pages/ContentEditorPage.jsx:738`. O mapa: `ContentEditorPage.jsx:681`
(`MapaDaTela`).

### 2. O conteúdo pronto ainda deixa o leigo sem nada (e com o negócio errado)

- **Comércio:** "Telas inteiras" mostra 1 tela, e ela é a "Ótica Central ·
  Semana do Sol", com "Óculos de sol 30% OFF", numa padaria
  (`R10/shots/comercio-d-prontos.jpg`).
- **Saúde e Empresas:** o que aparece é "As telas prontas do seu tipo de
  negócio estão chegando". O vazio agora é bonito, mas continua vazio
  (`R10/shots/saude-d-prontos.jpg`).
- **Peças soltas:** os modelos da padaria abrem com "Óculos de sol",
  "Escolha o seu par" e "Coloração com desconto" (`R10/full/comercio-d-pecas.jpg`).
  O filtro é pela frente, não pelo ramo (`web/src/pages/PecasProntasPage.jsx:43`).
- **Por quê:** 52 das 53 telas do manifesto esperam a galeria do operador.
  Com o lote da padaria e o lote 1 do Comércio aprovados, a padaria vê 12
  telas: as 3 dela primeiro, mas metade das outras é de ótica e salão
  ("Coleção Verão 2027", "Enxergar bem com estilo") (`R10/galeria/comercio-prontos-com-lote.jpg`).
  Isso é a fase 9, ainda aberta.

### 3. A página da TV ainda é técnica e longa

- **Jargão à vista:**
  - "O que está nesta tela: Corporativo Completo · ciclo de 1min" e
    "Vertical · Cabeçalho + 2 Zonas + Rodapé" (`components/content/ScreenSummary.jsx:35`);
  - "Composição (4 elemento(s))" (`web/src/lib/contentTypes.js:284`);
  - "Texto / Comunicado", "PRÉVIA" e "CONTEÚDO" em caixa alta de 12 px;
  - o endereço `/media/ten_…` no campo da foto;
  - "Tempo na tela (segundos) · 0 = fica fixo na tela";
  - os layouts "Painel Notícias", "Destaque + Barra Lateral" e "Vertical ·
    Duas Zonas" (`R10/shots/x-tv-ajustes.jpg`).
- **Dois "Quando".** O diálogo "Pôr na TV" fala em frases. A peça que já
  está na TV usa a caixinha antiga, com dias, horas e datas, e o horário
  aparece em formato de máquina (`ContentEditorPage.jsx:823`,
  `components/content/QuandoMostrar.jsx`, `R10/cliques/d-agendarAgenda-quando.jpg`).
- **Uma segunda IA.** A caixa "Mudar a tela: lateral do outro lado, tema…"
  continua na página (`ContentEditorPage.jsx:685`). Ao lado dela estão
  "Criar para esta TV" (`:554`), "Criar" na fila e o selo "IA" no mapa.
- **Altura.** A página tem 1.406 px no PC, e a fila só começa a ~865 px. No
  celular são 2.825 px, e o campo de editar fica a ~1.700 px do topo.
- **Avisos sem explicação:** os selos "⚠ 1" e "💡 2" no resumo.

### 4. Portas duplicadas que ficaram

| # | No bloco 8 | Hoje |
|---|---|---|
| 1 | Lista de TVs em 3 páginas | Em 2 (Início e Telas), com dois verbos: "Trocar agora" (`DashboardPage.jsx:193`) e "Abrir a TV". A Programação só abre pelo endereço |
| 2 | Criar em todo canto, 3 IAs | Tudo leva ao mesmo Criar (27 chamadas em 14 arquivos). Mas ainda há 3 caras de IA: a conversa do Criar, o "Mudar a tela" da página da TV e o "Editar com a IA" da campanha. E Peças guardadas tem a própria fileira de criar: Criar com a IA, Criar na mão, Gerar só uma imagem, Importar do Canva (`MyDesignsPage.jsx:762-768`, `R10/full/comercio-d-designs.jpg`) |
| 3 | As mesmas peças em 3 abas | Continua: a campanha aparece em Seus conteúdos › Campanhas, em Prontos › Peças soltas ("das suas campanhas", `PecasProntasPage.jsx:122`) e em Peças guardadas (a pasta) |
| 4 | Ajustes da TV em 2 lugares | Continua: Telas › Mais opções tem "Som ao vivo" e "Horário e aviso de queda" (`ScreensPage.jsx:243-244`), e a página da TV › Ajustes tem Som e Horário |
| 5 | Telas prontas em 2 lugares | Virou 3 catálogos diferentes: Criar › Escolher um modelo (9 composições genéricas), Peças soltas › "Modelos prontos, com a sua marca" e Telas inteiras |
| 6 | Suporte em 2 lugares | "Ajuda" no rodapé do menu e no avatar. É a mesma página com o mesmo nome. Aceitável |

### 5. Becos sem saída e próximo passo escondido

- **A porta "Pronto" cai no avançado.** Criar › "Escolher um modelo"
  promete "é só trocar o texto" e abre o editor livre, com camadas, gradiente,
  alinhamentos, "Análise IA" e "Forma · rect" (`R10/cliques/d-modelo-editor.jpg`;
  `CriarPage.jsx:453`). É o nível Avançado na porta do Pronto.
- **A IA não termina como os outros caminhos.** Ela acaba em "Pôr pra
  rodar", sem o passo "Quando" (`components/criar/PorPraRodar.jsx:117`,
  `R10/cliques/d-ia-campanha.jpg`). Isso quebra a regra "todo caminho termina
  igual".
- **A Agenda não mostra o que importa.** Cada célula mostra só as 2
  primeiras peças da lista. Depois das fotos, a semana inteira vira
  "Imagem, Imagem, +8 outras" em 24 células iguais, e a peça "só à tarde" se
  esconde no "+9" (`components/agenda/SemanaDaTv.jsx:129`,
  `R10/cliques/d-agendarAgenda-agenda.jpg`). A campanha não aparece como
  faixa sobre os dias, como no wireframe D. A Agenda abre na primeira TV, e
  não em "Todas".
- **O Início acaba na metade da tela.** Não tem "Recentes" e não tem "Para
  hoje" com prévias na marca (wireframe A). A metade de baixo fica vazia.

### 6. Aparência e consistência

- **A Marca quebra no celular.** Os selos da logo ("Tamanho bom", "Fundo
  transparente"…) e "Conferir e melhorar" ficam espremidos numa coluna
  estreita e cortados. A causa é `flex-1 min-w-0` dentro de `flex-wrap`, que
  nunca quebra a linha (`web/src/components/content/LogoDaMarca.jsx:110-111`,
  `R10/shots/comercio-m-brand.jpg`).
- **A letra pequena.** Ainda há muito texto em 12–13 px:
  - Agenda: 65% em 12 px (`SemanaDaTv.jsx:135`, `text-2xs`);
  - Marca: 59% em 13 px;
  - Plano: 63% em 13 px;
  - Criar: 70% em 13 px.
- **Dois violetas grandes no Início.** No PC, o "+ Criar" do menu e o
  "Criar com a IA" (`DashboardPage.jsx:107-109`). Contando a tela inteira, 53
  das 70 telas têm 2 ou 3 violetas.
- **Cartões de alturas desiguais.** Em Peças guardadas, a peça em pé estica a
  linha, e os outros cartões ficam com um vão branco
  (`R10/full/comercio-d-designs.jpg`).
- **Botões feitos à mão:** 256 `<button>` contra 317 `<Button>` (eram 243 e
  313). Onze páginas ainda desenham o próprio `<h1>`.
- **O axe acha 8 falhas em 70 telas.** A fase 8 dizia 0, mas lá a conta não
  tinha uma campanha no ar.
  - `heading-order`: o h3 "Campanhas nesta TV" vem sem h2 (`components/tela/CampanhasNaTela.jsx:22`).
  - `color-contrast`: o selo verde "rodando" (`components/criar/PorPraRodar.jsx:85`).
  - As duas aparecem nas 2 frentes e nos 2 tamanhos.
- **Termos velhos que sobraram:**
  - "Em Mídias › Fotos" (`web/src/pages/BrandPage.jsx:499`). O teste do
    glossário não pega texto de JSX que mora numa linha própria
    (`test/fase8.test.js:72`).
  - "540×960 · Linux" no cartão da TV.
  - O título "Peças prontas" sob a aba "Peças soltas", e "Telas prontas"
    sob "Telas inteiras".

### 7. Os três níveis hoje

| Nível | Hoje | O que falta |
|---|---|---|
| Pronto | Pôr foto (4 toques), Peças soltas › Pôr na TV, a ideia do dia, Telas inteiras | Pouco pronto para o negócio certo. A porta "Escolher um modelo" leva ao editor avançado |
| Ajustável | O formulário da peça mostra só o conteúdo. O "Quando" do "Pôr na TV" fala em frases | O "Quando" da peça na TV é o antigo. O layout ("Corporativo Completo") fica em Aparência, à vista |
| Avançado | "Mais ajustes" recolhido e lembrado. Criar › Avançado. A Marca › Avançado | O editor livre aparece pela porta do Pronto. Ajustes da TV têm 5 abas de uma vez |

## O que fazer para chegar ao 9 (em ordem)

1. **O "Na TV agora" igual à TV.** Use o tema da marca e o cabeçalho de
   verdade no `Palco`, ou a foto que a TV manda. Tire o mapa preto do lado e
   deixe só um contorno das partes ao passar o mouse.
2. **Aprovar os lotes da fase 9 e filtrar pelo ramo da Marca**, não pela
   frente, nas Peças soltas e nas Telas inteiras.
3. **A página da TV em frases.** Use o mesmo `EscolherQuando` do "Pôr na
   TV" para a peça que já está no ar. Troque os nomes das partes ("parte de
   cima, meio, lado, faixa de baixo"). Esconda "ciclo", "Composição" e o
   endereço `/media`. Tire o "Mudar a tela". Leve a fila e a edição para
   perto da TV.
4. **Fechar as portas que sobraram.** Cada peça num só lugar. Um catálogo
   de modelos só. "Escolher um modelo" deve abrir um formulário simples (o
   editor livre fica no Avançado). A IA deve terminar no "Pôr na TV" com o
   "Quando". Use "Abrir a TV" também no Início.
5. **Acabamento:**
   - a Agenda em faixas por peça, em 15 px;
   - consertar a Marca no celular;
   - as 8 falhas do axe e o "Mídias";
   - "Recentes" no Início;
   - um só violeta grande por tela.

## Limites

- Uma passada, com a conta típica. Só Chromium e só o tema claro.
- A IA é a de teste (`AI_PROVIDER=dev`), porque o Gemini está sem crédito. A
  tarefa "Criar com a IA" foi contada até onde a IA de teste deixa: ela
  responde numa volta, por regra, e não entende "só no balcão". Com a IA
  real, o número pode subir.
- Arrastar o arquivo para o painel (2 toques, segundo a fase 7) não foi refeito.
- No celular, a tarefa "mudar" abriu a Vitrine, e não o Balcão: o seletor do
  script achou "Peça no balcão" dentro da miniatura. A contagem não muda, e a
  TV recebeu o preço.
- O formato da hora nos campos de horário ("03:00 PM") vem do Chromium sem
  idioma. Não contei como defeito do painel.
- As comparações com ScreenCloud, Yodeck, OptiSigns, Canva e Linear vêm do
  conhecimento geral desses produtos.
