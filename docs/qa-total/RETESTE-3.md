# Reteste 3 (12 a 14/11/2026)

Os mesmos blocos do reteste 2 (09/11), com o mesmo método, os mesmos robôs
e a mesma conta, depois do que entrou de 09 a 14/11: o PR #335 (painel:
Aprovações e "Ver agora" com o player, Primeira TV em 14 toques, volta longa
à vista, "Quando" e Desfazer na campanha da IA, o pacote do Prontos, Telas
em 6 chamadas, Plataforma em ~3 s, e-mail de suporte, contraste da logo,
busca em Telas, pedidos da gerente juntos) e o PR #336 (TV: nada cortado
nem sobreposto, foto do banco no espaço vazio, preço pela metade fora do ar,
Prontos na época, Saúde sem preço, código a 4,6% com o QR ao lado, espera
na marca da conta, nada de recado técnico, corpo a 4,6–5,2% e título a
10–11%, a linha que não quebra encolhe o título).

Base: as rodadas inteiras rodaram no `main` em `078fc44`. Depois, o branch
`claude/gifted-noether-0kd67e` andou até `1082d08` (azul no tema escuro,
sem os ícones de brilho e varinha, a landing da Visitor, o vigia do player
`js/vigia.js`, as rotas do pulso sem a programação e o 413 com motivo), e
uma rodada de conferência no `1082d08` refez só o que essas mudanças tocam
([seção própria](#conferência-no-1082d08)). Servidor **local** na porta
6070, banco novo (`STORAGE=local`, `AI_PROVIDER=dev`, sem e-mail de
verdade). Nada de produção. A IA real ficou de fora outra vez: o bloco 2 e
os cenários de IA do bloco 3 ficam com a nota antiga.

Tudo (scripts, fotos e JSON) está em
`/tmp/claude-0/-home-user-Multi-telas/b804d644-700b-5e83-ad8f-5fe2da78625e/scratchpad/reteste3/`,
chamado aqui de `R3/`. As fotos do reteste 2 seguem em `R2/` (a pasta
`reteste2/` ao lado).

## Bloqueadores

**Nenhum.** Não achei quebra de tela, vazamento entre contas nem falha de
segurança. Avisos de processo:

- **`npm test`:** 2.048 de 2.049 passam no `078fc44` e 2.060 de 2.061 no
  `1082d08`, 0 falhas, 1 pulado (com `env -u GITHUB_TOKEN`; a falha do
  reteste 2 em `test/apk.test.js` era o token do ambiente).
- **A régua não foi refeita.** O CI passou no `d1ed6eb` (a mesma árvore do
  `078fc44` sem o merge), tudo verde: tela cheia 42/42, 3.366/3.366 com as
  marcas, sobreposição e corte 12.471/12.471, telas prontas 101/101,
  contraste verde.
- **O robô do bloco 1 fotografava a primeira peça de cada rodada no código
  de pareamento** (a TV ainda não tinha saído dele): 2 peças e 3 telas. O
  `R3/b1/lib.cjs` agora espera a TV sair do código e as 5 foram refeitas
  (`R3/b1/pecas-tv-refeitas/`, `R3/b1/telas-refeitas/`). Não é do produto:
  com a TV parada no código por 3 a 40 s, ela sai dele de 8 a 18 ms depois
  do "Ligar" (`R3/b1/parear-run.log`).
- **O mais perto de um defeito novo** é de peça que ainda espera aprovação:
  QR sem link derruba o cartão inteiro da `cena-qr` (ver o
  [problema 2](#os-10-problemas-que-mais-seguram)).

## As notas

| Bloco | 05/11 | 09/11 | Agora | Em uma frase |
|---|---|---|---|---|
| 1. A TV | 6,5 | 7,0 (conta 7,3) | **7,5** (conta 7,9) | Nada cortado nem sobreposto, foto do banco, espera na marca, código legível; seguram a aprovação, a faixa de baixo e o QR sem link |
| 2. Criações da IA | 6,3 | — (6,3) | — (6,3) | Precisa da IA real |
| 3. Programação | 8,0 nos 7 cenários sem IA | 8,3 nos 7 (bloco 7,0) | **8,4** nos 7 (o bloco, com a IA antiga: 7,1) | A volta longa virou aviso no alto, com o botão; fora do horário segue ligado |
| 4. Telas e a página da TV | 8,5 | 8,5 (conta 8,7) | **9,0** | O player de verdade no "Ver agora" e nas Aprovações, busca em Telas; sobram os selos e o nome cortado |
| 5. O resto do painel | 7,5 | 8,0 | **8,5** (conta 8,3) | Prontos rápido e na época, logo com o contraste medido, suporte certo; Equipe com um `select` sem nome |
| 6. Site e e-mails | 8 | 8,5 | **8,5** | Igual; a landing da Visitor limpa |
| 7. A base | 8,5 | 8,5 | **8,5** (conta 8,2) | Desempenho subiu (Prontos 2,4 s, Telas 6 chamadas); conteúdo pronto aprovado segura |
| 8. A interface do painel | 6,7 | 7,7 | **8,1** | Primeira TV em 14 toques, IA com "Quando" e Desfazer, prévias reais; cliques e violetas iguais |

**Nota geral provisória: 7,7 / 10** (era 7,5), com o mesmo peso dobrado
para a TV, a IA, a programação e a interface. No bloco 2 entra a nota
antiga; no 3, os 7 cenários medidos e a nota antiga dos 5 que dependem da
IA. A conta: (7,5×2 + 6,3×2 + 7,13×2 + 9,0 + 8,5 + 8,5 + 8,5 + 8,1×2) ÷ 12
= 7,71.

Com a nota do bloco 1 sem arredondar (7,9), daria 7,8. O que mais pesa
para baixo é a IA sem medir (6,3, peso 2) e o conteúdo pronto que ainda não
foi aprovado (blocos 1, 5, 7 e 8).

## O método, e o que mudou nele

O mesmo do reteste 2, com os scripts copiados de `R2/` para `R3/` e os
caminhos trocados para este worktree e a porta 6070. Diferenças:

- **No máximo 2 contextos de navegador por vez**, como antes. As rodadas
  rodaram em fila (`R3/b1/rodar-b1.sh`, `R3/rodar-resto.sh`); as TVs do
  bloco 8 seguem num contexto só, cada uma numa origem (`127.0.0.20` a
  `.25`).
- **O servidor reiniciou entre as rodadas** (a rota pública que cria TV
  aceita 60 por hora por IP, `server/routes/telas.js`).
- **As 3 contas do bloco 1 são criadas antes** (`R3/b1/prep.cjs`): com 2
  rodadas ao mesmo tempo, as duas tentavam o mesmo cadastro (409).
- **A espera do pareamento** no `R3/b1/lib.cjs` (ver Bloqueadores).
- **"Ver agora":** o robô procura o player num quadro (`iframe`), não mais
  uma imagem (`R3/b47/b4live.js`).
- **A IA no bloco 8:** o "Quando" mora no cartão "Pôr na TV" da campanha,
  não num diálogo; o robô lê o cartão e o aviso logo depois do toque
  (`R3/b8/qa/cliques.js`).
- **A galeria do operador** foi aberta, nada foi aprovado (`R3/b47/op.js`
  só aprova com `APROVAR=1`): tudo medido como o manifesto está.
- Telas: as 101 (lotes 0 a 5), 250 medições. Peças: as 113 (43 aprovadas,
  70 esperando) nas 3 orientações.

Robôs e rodadas: tipos (243 fotos), peças na TV (339 + 9 refeitas), telas
(250 + 10 refeitas), layouts (96), estados, tempo do pareamento (5), 2
tamanhos do bloco 3 e os 23 testes, 572 aberturas do painel com axe, 78
páginas medidas no bloco 8, 14 × 2 tarefas cronometradas, a Primeira TV
pelos dois caminhos, desempenho no 4G lento, segurança, XSS e confiança, e
a conferência no `1082d08`.

## Bloco 1: a TV — 7,0 → 7,5

### A régua do repositório (CI, `d1ed6eb`)

Não refeita aqui. O CI do PR #336 passou inteiro: tela cheia 42/42, as
peças-ouro com as 11 marcas 3.366/3.366, texto sobre texto e texto cortado
12.471/12.471 (agora bloqueiam em toda passada), as 101 telas prontas
montadas 101/101, contraste verde.

### Os tipos, com conteúdo de verdade (243 fotos, `R3/b1/tipos/`)

| Formato de zona | Régua de 4,5% (09/11 → agora) | Piso do lugar | Contraste ≥ 4,5 em todo texto | Menor letra (mediana) |
|---|---|---|---|---|
| Tela cheia | 12/17 → 12/17 | 17/17 | 17/17 | 4,5% |
| Principal com zonas | 9/17 → 9/17 | 17/17 | 17/17 | 4,5% |
| Em pé | 10/17 → 10/17 | 17/17 | 17/17 | 4,5% |
| Quadrada | 8/17 → 8/17 | 17/17 | 17/17 | 3,7% |
| Bloco (Dois quadrados) | 6/17 → 6/17 | 17/17 | 17/17 | 3,7% |
| Lateral (Corporativo) | 6/17 → 6/17 | 17/17 | 17/17 | 3,5% |
| Lateral (Painel Notícias) | 6/17 → 6/17 | 17/17 | 17/17 | 3,5% |

O corpo e o título do aviso e do texto, a maior mudança do bloco
(`R3/b1/tipos/medidas.json`, `R2/b1/tipos/medidas.json`):

| Zona | Título (09/11 → agora) | Corpo (09/11 → agora) |
|---|---|---|
| Tela cheia, deitada | 8,2–8,3% → **10,3–10,7%** | 3,9–4,5% → **4,8–4,9%** |
| Em pé | 6,2–8,3% → **10,2–11,0%** | 3,3–4,5% → **4,6–5,2%** |
| Quadrada | 6,3–8,3% → **8,9–10,3%** | 3,3–4,5% → **4,7–4,8%** |
| Principal com zonas | 6,9–8,2% → 7,6–8,0% | 3,0–4,5% → 3,5–4,5% |
| Lateral | 3,0–6,9% → 4,8–7,2% | 3,0–4,5% → 3,0–4,5% |

- Nas zonas grandes, a régua de leitura a 4 m (corpo ≥ 4,5%, título ≥ 10%) passa. O título de 8,9% na quadrada é o aviso longo da fábrica, que encolhe para caber em 4 linhas (`R3/b1/tipos/empresa-announce__full-principal-quadrada.png`).
- **Igual:** Saúde e Empresas seguem nascendo em 3,5% e 3% (`js/player.js:147`), por isso a régua de 4,5% só passa no Comércio; e a lateral e o bloco quase não cresceram.
- **Igual:** o exemplo de promoção põe o preço sem "R$" (`js/render.js:1377`), e o da Saúde segue um check-up com desconto, "390,00 → 290,00" (`web/src/lib/contentTypes.js:369`, `R3/b1/tipos/saude-promo__full-principal-deitada.png`).
- Contraste: 0 textos abaixo de 4,5. Marca: 243 de 243 fotos na cor da conta.

### Peças-ouro na TV real (113 × 3 orientações, `R3/b1/pecas-tv/`)

| Onde | 09/11 (98 peças) | Agora (113 peças) |
|---|---|---|
| Destaque e lateral, piso do lugar, deitada | 86/87 | **100/102** |
| Idem, em pé | 85/87 | **99/102** |
| Idem, quadrada | 84/87 | **98/102** |
| Contraste ≥ 4,5 em todo texto | 87/87 nas três | **102/102** nas três |
| Cabeçalho, sem corte (deitada/em pé/quadrada) | 2/6 nas três | **6/6 nas três** |
| Rodapé, piso do lugar (deitada/em pé/quadrada) | 4/5, 5/5, 3/5 | 5/5, 5/5, 4/5 |

- **Os cabeçalhos não cortam mais** (`R3/b1/zoom-cab-deitada.png`, `R3/b1/zoom-cab-empe.png`): a data vem curta ("QUINTA · 12 NOV"), o nome e a linha de baixo inteiros, o `cabecalho-classico` em pé com "PADARIA SOL" inteiro (`R3/b1/pecas-tv-refeitas/cabecalho-classico-em-pe.png`).
- **O espaço de foto vazio leva a foto do banco** do papel e do ramo da conta: `oferta-desconto` na quadrada, `cardapio-dia-foto`, `oferta-foto` (`R3/b1/v-fotos.png`). Não há mais meia peça vazia.
- O rodapé de contatos tira o contato que não cabe, de propósito (o robô marca "corte" no endereço, mas a foto está limpa, `R3/b1/v-rodapes.png`). O `rodape-pagamento` na quadrada cai a 3,2%, abaixo do piso de 4,5%.
- Abaixo do piso, os mesmos de antes: cardápios e listas no balcão a 4,2–4,4% (`cardapio-bebidas`, `cardapio-categorias`, `cardapio-colunas`, `oferta-lista`) e o `cardapio-dia-foto` deitado a 3,7%.
- **Novo, e de peça que ainda espera aprovação:** a `cena-qr` (lote 5) vai ao ar só com a foto, sem o cartão, o título e o QR, nas 3 orientações e por 33 s seguidos (`R3/b1/cenaqr.log`, `R3/b1/v-refeitas.png`). Ver o [problema 2](#os-10-problemas-que-mais-seguram).
- O exemplo de outro negócio: na padaria, a foto do banco é um pão, e o texto do modelo segue o da ótica ("Óculos de sol 30% off") ou o do salão ("Cabelo · Unhas · Estética", "@studiobella"). A vista padrão do Prontos esconde o que é de outro negócio, mas quem abre "Ver também" vê o pão com os óculos.

### Telas prontas (101: lotes 0 a 5, `R3/b1/telas/`)

| Lote | Telas | Letra ≥ piso do lugar e nada cortado | Letra ≥ 4,5% | Usam o `cabecalho-centro` | Com corte |
|---|---|---|---|---|---|
| 0 | 6 | 4 | 3 | 1 | 0 |
| 1 | 20 | 18 | 6 | 4 | 0 |
| 2 | 27 | 24 | 9 | 4 | 0 |
| 3 | 18 | 18 | 8 | 2 | 0 |
| 4 | 20 | 20 | 10 | 2 | 0 |
| 5 (novo) | 10 | 10 | 5 | 2 | 0 |
| **Total** | **101** | **94 (era 77 de 91)** | **41 (era 30 de 91)** | 15 | **0 (eram 13)** |

- **Texto sobre texto, resolvido:** o `cardapio-combo` na quadrada põe o título e o "TUDO POR R$" lado a lado (`R3/b1/telas-refeitas/l2-padaria-quadrada.png`, `R3/b1/telas/l2-restaurante-quadrada.png`).
- **A foto que faltava, resolvida:** a única aprovada ("Semana do Sol") e a vitrine do lote 1 têm foto, e a vitrine mostra "ou 10× de R$ 18,99" (era "10x de" sem o valor, `R3/b1/v-telas1.png`).
- **Contraste:** os 5 avisos do robô são o letreiro entrando com degradê (`R3/b1/v-rodape-contr.png`) e um "da clínica" a 4,43 na lateral de `l1-saude-espera`.
- **O que ainda sai errado na tela:**
  - **a faixa de baixo come os avisos:** o `rodape-pagamento` ocupa ¾ da faixa na deitada e a faixa inteira na quadrada (`R3/b1/v-telas2.png`, `R3/b1/telas-refeitas/l2-padaria-quadrada.png`); na quadrada, o relógio e a data do rodapé deixam ~35% para os avisos;
  - a avaliação "Como foi o seu atendimento?" segue sem QR, e a foto estreita com laterais desfocadas no díptico em pé (`R3/b1/telas/l4-farmacia-em-pe.png`);
  - nos lotes 1 a 3, a data no cabeçalho e no rodapé (`R3/b1/telas/l3-escritorio-deitada.png`);
  - a `lanchonete-terca-do-burger` (rascunho) tem letra de 2,95% no balcão.
- **Aprovada continua 1 de 101** (100 na galeria esperando, `R3/b47/out/op.log`). Uma padaria com o ramo conhecido abre "Telas inteiras" e não vê nenhuma: a única aprovada é de ótica, e a vista padrão esconde o outro negócio (`web/src/pages/TelasProntasPage.jsx:49`).

### Layouts, marca e estados

- **Layouts:** iguais (`R3/b1/layouts/medidas.json`). A zona vazia some nos 48 casos de só a principal.
- **Marca:** a logo do cabeçalho segue pequena (`css/player.css:498`, 54cqh): o "Sol" no fim da Primeira TV continua ilegível (`R3/cinco/computador-13-a-tv.png`).
- **Estados** (`R3/b1/estados/estados.json`, fotos `R3/b1/v-estados.png`):
  - **código:** o código a 15–18% do lado menor, com QR ao lado (embaixo, na TV em pé); a instrução a 4,6% (era 1,8–2,4%), o título a 5,4% e "Gerar outro código" a 4,5% (era 1,2–1,5%);
  - **espera: na marca da conta** — o nome a 10%, a cor da conta sob um véu, sem a marca MultiTelas (era o "Tudo certo" azul);
  - **"Adicionar": 0 recado técnico em 44 tipos** (eram 9 tipos com "Imagem indisponível", "Escolha um mural…", "Carregando clima…"). O que não tem conteúdo não vai ao ar (a zona mostra o relógio) e a transmissão sem sinal vira a marca em calma;
  - sem internet: segue mostrando, também reaberta, e volta;
  - TV removida: volta ao código em 0,5 s;
  - 2ª TV no plano grátis: igual — o painel recebe 402 "limite do plano atingido (1 tela)" e a TV fica no código, sem dizer por quê;
  - troca: 109 a 342 ms; 0 erros de página.

### Notas por item

| Item | 09/11 | Agora | Por quê |
|---|---|---|---|
| Tipos, no padrão do "Adicionar" | 6 | **8** | 0 recado técnico em 44 tipos |
| Tipos, tela cheia | 8 | **8,5** | Corpo 4,8–4,9% e título 10,3–10,7%; Saúde e Empresas ainda a 3,5% e 3% nos detalhes |
| Tipos, principal com zonas | 7,5 | **7,5** | Igual: 9/17 nos 4,5% |
| Tipos, lateral e bloco | 7 | **7** | Igual: 6/17 nos 4,5% |
| Tipos, em pé e quadrada | 7,5 | **8** | Título de 9–11% e corpo de 4,6–5,2% |
| Layouts | 7 | **7** | Igual |
| Peças-ouro (113) | 7,5 | **8,5** | Cabeçalho sem corte 6/6, foto do banco, contraste 100%; cardápios a 4,2–4,4%, `cena-qr` sem cartão |
| Telas prontas (101) | 6 | **7** | 94/101 no piso, 0 cortes, combo e vitrine certos; 1 aprovada, a faixa de pagamento, a avaliação sem QR |
| Marca do cliente na TV | 8 | **8,5** | A espera na marca; a logo do cabeçalho pequena |
| Faixas | 7 | **7,5** | Cabeçalho sem corte; rodapé de pagamento come os avisos, data duas vezes |
| Código | 8 | **9** | Instrução e botão a 4,5% ou mais, QR ao lado |
| Espera | 6 | **8,5** | Na marca da conta |
| Sem internet | 8,5 | **8,5** | Igual |
| TV removida | 8,5 | **8,5** | 0,5 s |
| 2ª TV grátis | 6 | **6** | Igual |
| Funcionamento | 9 | **9** | Igual |
| **Bloco** | **7,0** | **7,5** | (77,5 × 2 + 49,5) ÷ 26 = 7,87, arredondado para baixo ao meio ponto, como antes |

### O que segura o bloco 1 abaixo de 9

1. As telas e peças esperam a aprovação (100 telas e 70 peças); o cliente vê 1 tela e 43 peças (`server/conteudoPronto.js`, montarPacote; `web/src/lib/modelosOuro.js:22`).
2. QR sem link: `js/peca-render.js:200` esconde o pai direto do QR vazio; na `cena-qr` o pai é o cartão inteiro (`pecas-ouro/cena-qr.html:65-70`); no `qr-foto`, fica a pergunta sem o QR.
3. A faixa de pagamento (`pecas-ouro/rodape-pagamento.html:11`, `.pagar { flex: none }`) e a data duas vezes nos lotes 1 a 3.
4. O piso de 3,5% e 3% da Saúde e da Empresas (`js/player.js:147`) e a lateral e o bloco pequenos; cardápios a 4,2–4,4% no balcão.
5. A 2ª TV grátis sem explicação na TV (`server/routes/telas.js:366` responde só ao painel) e a logo pequena no cabeçalho (`css/player.css:498`).
6. O exemplo de outro negócio com a foto do negócio da conta (o texto do modelo de origem, `web/src/lib/modelosOuro.js:51`; a foto pelo ramo, `js/peca-render.js:835`).

## Bloco 2: criações da IA — 6,3 (sem IA)

Não refeito: `AI_PROVIDER=dev` responde por regra. Nota antiga mantida.

## Bloco 3: programação — 8,3 → 8,4 nos 7 cenários sem IA

Robô de leigo (`R3/b3/b3.js`), no computador (1280×800) e no celular
(390×844), com uma TV de verdade. Em São Paulo era quinta, 12/11. Mais os
testes (`R3/b3/testes.log`): semana simulada, "Arrumar a volta", modo
ambiente, calendário e importância, **23 de 23**.

| # | Cenário | 09/11 | Agora | Medido |
|---|---|---|---|---|
| 3 | Oferta até sábado | 9 | **9** | **7 toques** nos dois tamanhos (Criar › Escolher um modelo › oferta › Continuar › Até um dia › data › Pôr na TV). Grava 12/11 a 14/11; a Agenda mostra "até 14/11" |
| 5 | Black Friday e Natal sem lembrar | 9 | **9** | O leitor sem IA acerta 27/11 e 25/12; na Agenda, **1 toque** em "Pôr na programação" e a Black Friday está na TV |
| 6 | Duas campanhas e dois urgentes | 8 | **8** | Semana simulada: urgente ≤ 25%, Alta ≤ 40% |
| 7 | 30 peças acumuladas | 8 | **9** | **4 toques** (eram 5): Telas › Abrir a TV › Arrumar a volta › Tirar. De 33 para 17 peças, com o porquê. A volta de 9 min 31 s agora é **aviso no alto da página**, com o botão à vista (`R3/b3/shots/m-c7-0-tv.png`) |
| 8 | "Só na loja do Centro" | 9 | **9** | A gerente vê e muda só a TV dela (403 na outra, bloco 4) |
| 11 | Sala de espera, 12 min sem repetir | 7 | **7** | O painel avisa a volta curta (dica); a IA ainda não monta a volta |
| 12 | Fora do horário | 8 | **8** | **4 toques**; o padrão segue "Continua mostrando a programação" (`web/src/components/tela/HorarioDaTela.jsx:13`) |

**Média dos 7: 8,4** (era 8,3). Os 5 cenários com IA (1, 2, 4, 9 e 10)
seguem com 5, 6, 5, 6 e 4,5: o bloco fica em **7,1** (era 7,0).

**O que segura abaixo de 9:** fora do horário a TV segue ligada por padrão;
a sala de espera depende da IA; os cenários de IA sem medir.

## Bloco 4: Telas e a página da TV — 8,5 → 9,0

Conta típica de Comércio, a TV "Recepção" aberta em outra janela
(`R3/b47/out/b4live-d.log`, `-m.log`, fotos `R3/b47/shots-078fc44/b4-*`;
a conferência no `1082d08` regravou as de `R3/b47/shots/b4-d-*`).

| Item | 09/11 | Agora | Medido |
|---|---|---|---|
| Ligar uma TV | 9 | **9** | A TV sai do código em 8–18 ms depois do "Ligar" |
| Ver agora | 8,5 | **9,5** | **O player de verdade num quadro** em 164 ms (PC) e 163 ms (celular), com a marca, o cabeçalho e o rodapé (`R3/b47/shots/b4-d-veragora.jpg`); era um desenho. Os selos "1 de 3" ficam por cima |
| Recarregar | 8,5 | **8,5** | 1,8 s nos dois |
| Som | 8,5 | **8,5** | Igual |
| O que passa | 9,5 | **9,5** | Igual |
| Pôr na TV | 9 | **9** | A TV mudou em 298 ms (PC) e 301 ms (celular); barra fixa à vista |
| Desfazer e Refazer | 9 | **9** | 297 e 293 ms; 294 e 294 ms |
| Ajustes da TV | 9 | **9** | Igual |
| Página da TV com dados antigos | 9 | **9** | 0 quebras |
| Aprovação e loja | 8 | **9** | A gerente pede em **4 toques** no celular, a TV não muda; o dono aprova em **3** e a TV muda. **O antes e o depois agora são a TV de verdade** (`R3/b47/shots/ap-dono-antes-depois.jpg`; era só a moldura). O botão da gerente ainda diz "Pôr na TV" quando vira pedido |
| Grupos com 25 TVs | 8 | **9** | **Busca em Telas:** "zona norte" → 6 de 25, "tv 7" → 2, "xyz" → "Nenhuma TV com “xyz”" (`R3/b47/out/busca.log`). Telas abre com 6 chamadas (eram 32). Mas o nome da TV some atrás do selo do grupo: "TV 23 · Corredor" vira "TV 2…" |

Média: 9,0.

**O que segura abaixo de 9,5:** os selos "1 de 3" por cima da TV em toda
prévia (`web/src/components/tela/TvAoVivo.jsx:116-127`), o nome da TV
cortado em Telas (`web/src/pages/ScreensPage.jsx:220-221`: o selo do grupo
tem `shrink-0`) e o "Pôr na TV" da gerente
(`web/src/pages/ContentEditorPage.jsx:933`).

## Bloco 5: o resto do painel — 8,0 → 8,5

As mesmas 8 contas (vazia, típica, cheia e antiga, em Empresas e
Comércio), 2 tamanhos, axe WCAG 2 A/AA: **572 aberturas**
(`R3/b47/out/crawl-*.json`, resumo com `R3/b47/analisar-crawl.js`, fotos
`R3/b47/shots/`).

- **0 "Esta tela não abriu", 0 "erro interno"**, 0 rolagem lateral, 0 erro de página.
- **axe: 2 problemas em 4 aberturas.** O contraste de Peças guardadas da conta antiga (`.bg-[#0a1020]`, igual) e, **novo na medida**, um `select` sem nome em Equipe, **crítico** (`select-name`, `web/src/pages/TeamPage.jsx:84`): o papel de cada membro. Aparece porque desta vez a conta típica já tinha a gerente da aprovação quando o robô passou; o código é de 23/10.
- Medianas de 0,57 s a 0,78 s (eram de 0,65 s a 1,25 s): **Prontos para você 0,74 s** (era 1,55 s pela mesma conta), Início 0,78 s. Um Início de 12 s é a previsão do tempo de fora (`api.open-meteo.com`, 429), não o painel.
- **Prontos para você na Saúde:** sem "Outubro Rosa" e sem "Parcelado" (`R3/b8/medidas-comercio_saude_empresa-d_m.json`, `R3/b8/shots/saude-d-prontos.jpg`); o "Prato do dia · hoje".
- **A análise da logo** diz "Fraca no fundo escuro" e o número: "a logo fica com contraste de 2,1 para 1; o mínimo é 3 para 1" (`R3/b47/shots/empresa-tipica-m-brand.jpg`).
- **Suporte:** `suporte@multitelas.net.br` (`server/legal.js:366`), não mais o Gmail pessoal.
- **Campanhas:** "No ar · Recepção, Corredor (em pé)" no lugar de "1 TV(s)".
- **Plataforma (operador): 2,8 s** (era 7,0) no PC e no celular; seguem 3 contrastes baixos e a tabela rolável sem foco no axe (`R3/b47/out/op.log`).

**Ainda errado:**
1. **Equipe** com um membro: o `select` do papel sem rótulo (crítico no axe).
2. **Plataforma:** 3 contrastes e `scrollable-region-focusable`.
3. Plano: "2 de 49 telas".
4. As Aprovações listam as peças com o nome cortado ("Peça · Semana do").

As páginas que mudaram (as outras ficam com a nota de 09/11):

| Área | 09/11 | Agora |
|---|---|---|
| Início, Alertas | 8,5 | 8,5 |
| Campanhas | 8,5 | 8,5 |
| Peças guardadas | 8,5 | 8,5 |
| Prontos para você (peças e telas) | 7 | **8** |
| Marca | 8 | **8,5** |
| Criando, Mural (axe) | 8,5 | 8,5 |
| Chamada de senha, Preços da planilha, Aprovações | 9, 8,5, 7,5 | 9, 8,5, **9** |
| Suporte | 7,5 | **8,5** |
| Plataforma (operador) | 7 | **7,5** |
| Equipe (com um membro, nova na medida) | — | 7,5 |
| **Bloco** | **8,0** | **8,5** (conta 8,3) |

## Bloco 6: site e e-mails — 8,5 → 8,5

- **Site** (`R3/b47/out/site.log`): igual em texto e preços (R$ 79, 139 e 159; anual a partir de 51, 90 e 102). No 4G lento, pronto em 0,85–0,90 s. 0 links quebrados. 404 com a marca e os dois caminhos.
- **axe:** limpo, menos as 2 tabelas da Privacidade no celular (`scrollable-region-focusable`), como antes.
- **E-mails** (`R3/b47/mails/`): os 18 saem idênticos aos do reteste 2 (mesmo HTML). O de confirmar continua genérico.
- **A landing da Visitor** (`parceiros/visitor/`, nova no `1082d08`, não servida pelo produto): ver a [conferência](#conferência-no-1082d08).
- Segue faltando prova social na landing.

## Bloco 7: a base — 8,5 → 8,5

| Área | 09/11 | Agora | Medido |
|---|---|---|---|
| Segurança | 9,5 | **9,5** | **13 de 13** barradas (`R3/b47/out/seg.log`), as rotas de senha, planilha e aprovações iguais (`seg4.log`). Rotas novas: a programação em lote de outra conta volta vazia, a lista com o "agora" só traz as TVs da conta, as duas dão 401 sem sessão; o pacote do Prontos só leva o aprovado (43 peças, 1 tela, 0 HTML de peça não aprovada, `seg5.log`). XSS em 12 campos: nada executou (`xss.log`) |
| Confiabilidade da TV | 9 | **9** | 45 s sem internet: segue; a mudança chega 9,1 s depois da rede. Servidor parado 15 s: segue; a mudança chega 13,6 s depois (`confiab.log`) |
| Robustez com dados antigos | 9 | **9** | 0 quebras em 572 aberturas |
| Desempenho | 8 | **9** | 4G lento com CPU 4× (`perf.log`): **Prontos 2,44 s** (era 7,37; 332 KB, eram 494); Telas 2,50 s com **6 chamadas** (eram 32); Início no celular 2,58 s (era 2,75) com 15 chamadas (eram 20); Programação de 25 TVs 2,60 s; Peças guardadas 3,09 s; a TV 2,04 s; landing 0,85–0,90 s |
| Acessibilidade | 8,5 | **8** | 2 problemas no painel em 572 aberturas, um crítico (Equipe); Plataforma com contraste; Privacidade no celular |
| Compatibilidade | 7 | **7** | Só Chromium; `/apk/versao.json` segue 404 |
| E-mails | 8,5 | **8,5** | Iguais |
| Conteúdo pronto por frente | 5 | **5,5** | Na época e sem preço na Saúde; mas 1 tela e 43 peças aprovadas |

Média 8,2; o bloco fica em 8,5, como no reteste 2 (que deu 8,5 com a conta
8,1).

## Bloco 8: a interface do painel — 7,7 → 8,1

As mesmas 3 contas típicas com TVs de verdade (`R3/b8/qa/monta.js`),
27 páginas × 3 frentes × 2 tamanhos (`R3/b8/shots/`), axe e violeta
(`R3/b8/axe/medida.json`, `R3/b8/qa/medir.log`) e as tarefas cronometradas
(`R3/b8/cliques/`).

| Critério | 09/11 | Agora | Por quê |
|---|---|---|---|
| Clareza da navegação | 8 | **8,5** | O "Ver agora" e as Aprovações mostram a mesma TV da página da TV; a busca em Telas. Sobram os selos "1 de 3" e o nome cortado |
| Facilidade para o leigo | 7,5 | **8,5** | A Primeira TV em 14 toques e 178 s; a IA com o "Quando" em frases e o Desfazer; a volta longa como aviso com o botão no alto |
| Acabamento visual | 8 | **8,5** | As Aprovações com o antes e o depois reais; a logo com o número do contraste. Mas os selos cobrem a TV, e a logo da TV segue pequena |
| Consistência | 7,5 | **7,5** | Igual: 2–3 violetas por tela no computador (22 de 39 telas com 3), `label-content-name-mismatch` nas Campanhas, "Pôr na TV" para a gerente quando vira pedido |
| Celular | 8 | **8** | Igual: 0 rolagem lateral, a página da TV com 2.178 px; a aba "O que passou" encosta na borda |
| Parece valer o preço | 7 | **7,5** | Prontos na época e sem preço na Saúde, foto do banco no lugar do vazio. Mas 43 peças e 1 tela aprovadas, e uma padaria não vê nenhuma tela inteira |

**Média: 8,1.**

### Cliques por tarefa (a partir do Início)

| Tarefa | 09/11 | PC | Celular | Caminho de hoje |
|---|---|---|---|---|
| Pôr uma foto | 4 | 4 | 4 (+1 rolagem) | Início › Pôr foto ou vídeo na TV › Galeria › arquivo › Pôr na TV |
| Pôr uma peça pronta | 4 | 4 | 4 | Biblioteca › Usar › Salvar › Pôr na TV |
| Escolher um modelo e pôr | 5 | 5 | 5 | Criar › Escolher um modelo › o modelo › Continuar › Pôr na TV (bloco 3) |
| Mudar o que a TV mostra | 3 (+2 rolagens) | 3 (+2) | 3 (+2) | Abrir a TV › o item › (digita) › Pôr na TV |
| Agendar uma peça nova | 6 | 6 | 6 | Biblioteca › Usar › Salvar › Numa hora do dia › Tarde › Pôr na TV |
| Agendar a que já está na TV | 5 | 5 (+2) | 5 (+2) | Abrir a TV › o item › Numa hora do dia › Tarde › Pôr na TV |
| Criar com a IA e pôr no ar | 6 | 6 (+1) | 6 (+1) | Criar › (digita) › Enviar › Sem foto › Gerar › Aprovar e gerar › Pôr na TV. **Agora com o "Quando" no cartão** (Sempre, Só hoje, Até um dia, Numa hora do dia) e o aviso "Na TV (sempre): 2 TVs. **Desfazer**" (`R3/b8/qa/cliques-ia-d.log`, `-m.log`, `R3/b8/cliques/d-ia-campanha.jpg`) |
| Mudar a marca | 2 | 2 | 3 | Marca › paleta; o tema da TV mudou no servidor |
| Ligar uma TV | 3 | 3 | 3 | Telas › Ligar uma TV › (código e nome) › Ligar |
| Convidar alguém | 3 | 3 | 3 | avatar › Convidar alguém › Gerar convite |
| Ver o que está no ar | 0 | 0 | 0 | A miniatura em 330 ms (PC) e 321 ms (celular) |

Os toques não mudaram; mudou o que se vê em cada um: a IA pergunta o
"Quando" sem toque a mais (o padrão é "Sempre") e devolve o Desfazer.

### Sua primeira TV em 5 minutos (`R3/cinco/`, `tools/cinco-minutos.mjs` do repositório)

| | Celular | Computador | Meta |
|---|---|---|---|
| Toques, passos 1 a 7 | **14** (eram 16) | **14** | ≤ 15 |
| Pessoa cuidadosa | **178 s** (eram 204) | **178 s** | ≤ 300 s |
| Pelo banco de fotos (`CINCO_FOTO=banco`) | 14, 208 s | 14, 208 s | |
| A TV mostrou o que a pessoa digitou | sim | sim | |

O robô do repositório voltou a rodar sem ajuste (`R3/cinco/cinco.log`,
`cinco-banco.log`). A foto do passo 5 tem o botão "Usar uma foto do
celular" embaixo do quadro; a prévia diz "Prato do dia · hoje"
(`R3/cinco/celular-07-fotos.png`). No fim, a logo "Sol" do cabeçalho segue
ilegível na TV (`R3/cinco/computador-13-a-tv.png`).

## Conferência no 1082d08

Do `078fc44` ao `1082d08` entraram: o azul no lugar do violeta claro no
tema escuro, o painel sem os ícones de brilho e varinha da IA, a landing da
Visitor (`parceiros/visitor/`), o vigia do player (`js/vigia.js`, a zona
parada é cutucada e a recarga da madrugada), as rotas do pulso que leem a
TV sem a programação, o 413 com motivo acima de 2 MB e o envio grande da
senha e do lote. Refeito só o que isso toca (`R3/rodar-1082d08.sh`, saída
em `R3/b47/out-1082d08/`, `R3/b47/out-1082d08-escuro/` e
`R3/b1/r1082d08/`):

| O que mudou | O que foi refeito | Resultado |
|---|---|---|
| Painel no tema claro, sem os ícones da IA | 3 contas (típica, cheia e antiga) × 2 tamanhos, com axe: 228 aberturas | Igual ao `078fc44` nas mesmas contas: 0 quebras, 0 rolagem lateral, o mesmo axe (o contraste de Peças guardadas da antiga e o `select` da Equipe); medianas de 0,66 a 0,86 s (eram 0,63 a 0,83) |
| Tema escuro (o reteste 2 não mediu) | Típica e cheia × 2 tamanhos, `mt.theme=dark`: 134 aberturas | 0 quebras e **0 contraste baixo no axe**; só o `select` da Equipe, o mesmo do claro (`R3/b47/out-1082d08-escuro/`) |
| O vigia do player (`js/vigia.js`, `SHELL_CACHE` v91) | Aviso, texto e promoção em 9 formatos × 3 frentes: 81 fotos; os estados inteiros | 80 de 81 fotos iguais em letra, corte e contraste; a outra saiu no meio da troca (o dissolver), coisa do robô. Código, espera, "Adicionar" (0 recado técnico em 44), sem internet, TV removida (0,5 s) e 2ª TV grátis iguais; troca de 110 a 248 ms (`R3/b1/r1082d08/`) |
| Rotas do pulso sem a programação | A confiança e as chamadas | 45 s sem internet: segue, a mudança chega 9,1 s depois; servidor parado 15 s: segue, chega 13,6 s depois. Telas 6, Programação 8 e Início 15 chamadas, iguais |
| "Ver agora" e página da TV | `b4live.js` no computador | O player no quadro em 192 ms; Recarregar 1,9 s; Pôr na TV 345 ms, Desfazer 113 ms, Refazer 332 ms |
| 413 acima de 2 MB | `R3/b47/seg6.js` | Um PUT de 2,5 MB volta 413 "O envio ficou grande demais para um pedido só (mais de 2 MB). Se for para muitas TVs de uma vez, envie em grupos menores." (era a conexão cortada); a TV segue com o que tinha; sem sessão, 403 |
| Segurança | `seg.js` a `seg5.js` | Iguais: 13 de 13 barradas, rotas novas barradas |
| Plataforma | `op.js` | 2,9 s (PC) e 3,1 s (celular); o mesmo axe |
| Landing da Visitor (`parceiros/visitor/index.html`, estática, não servida pelo produto) | Aberta do disco, 2 tamanhos, com axe (`R3/b47/visitor.js`) | 0 problema no axe, 0 rolagem lateral, letra mínima de 13 px, nenhum pedido para fora (sem CDN nem fonte de fora), nenhum marcador por preencher à vista |
| `npm test` | Inteiro | 2.060 de 2.061, 0 falhas, 1 pulado |

**Nada do `1082d08` mexe nas notas.** O tema escuro limpo no axe entra
como ponto a favor no acabamento (bloco 8), sem subir a nota.

**A observar, para a conta grande de RH:** o painel bloqueia a conta
inteira acima de 600 pedidos em 5 minutos (`server/limites.js:42`, desde
23/10). O robô esbarrou nele ao passar 4 vezes pelas mesmas 2 contas em
3,5 min (perto de 120 páginas abertas): 69 respostas 429 em
`/api/auth/me`. A pessoa vê "Muitos pedidos desta conta agora … Suas TVs
continuam no ar. O painel abre sozinho em 297 s" (`R3/b47/out-1082d08/limite.log`,
`R3/b47/shots-1082d08/limite-painel.jpg`). A mensagem é clara e as TVs
seguem; mas o balde é da conta, não da pessoa, e uma equipe de RH com
várias pessoas no painel ao mesmo tempo pode chegar lá. Não medi com
pessoas de verdade. As rodadas afetadas foram refeitas com o servidor
reiniciado (`R3/rodar-1082d08b.sh`).

## Os 10 problemas que mais seguram

Em ordem do que mais rende consertar.

1. **O conteúdo pronto espera a aprovação:** 100 de 101 telas e 70 de 113 peças. O pacote do Prontos leva 43 peças e 1 tela (`server/conteudoPronto.js`, montarPacote; `web/src/lib/modelosOuro.js:22`; `web/src/lib/telasProntas.js:23`). A única tela aprovada é de ótica, e uma padaria com o ramo conhecido abre "Telas inteiras" vazio (`web/src/pages/TelasProntasPage.jsx:49`). É decisão do operador na galeria, não código. Blocos 1, 5, 7 e 8.
2. **QR sem link derruba o bloco dele:** `js/peca-render.js:200` (`:has(> img[data-campo-qr][data-sem-foto])` com `display:none`) esconde o pai direto do QR vazio. Na `cena-qr` o pai é o cartão inteiro (`pecas-ouro/cena-qr.html:65-70`): a peça vai ao ar só com a foto, sem título e sem instrução (`R3/b1/cenaqr.log`, 33 s com `.cartao` em `display:none`). No `qr-foto`, fica "Como foi o seu atendimento?" sem nada para apontar (`R3/b1/telas/l4-farmacia-em-pe.png`). As duas esperam aprovação; a régua passa porque a bancada põe um link de exemplo. Para reproduzir: `node R3/b1/cenaqr.mjs` com o servidor no ar. Bloco 1.
3. **A faixa de baixo come os avisos:** `pecas-ouro/rodape-pagamento.html:11` (`.pagar { flex: none }`) ocupa ¾ da faixa na deitada e a faixa inteira na quadrada, com letra de 3,2% (piso 4,5%); na quadrada, o relógio e a data do rodapé deixam ~35% para os avisos; nos lotes 1 a 3, a data aparece em cima e embaixo. Bloco 1.
4. **A letra fora das zonas grandes:** Saúde e Empresas nascem com piso de 3,5% e 3% (`js/player.js:147`), e a régua de 4,5% passa em 12/17 na tela cheia e 6/17 na lateral e no bloco; o título da principal com zonas fica em 7,6–8%; cardápios e listas a 4,2–4,4% no balcão e o `cardapio-dia-foto` a 3,7%. Bloco 1.
5. **Telas com muitas TVs:** o nome da TV some atrás do selo do grupo ("TV 23 · Corredor" vira "TV 2…", `web/src/pages/ScreensPage.jsx:220-221`) — com 25 TVs, a busca acha, mas o cartão não diz qual é. Blocos 4 e 8.
6. **Prévias e botões que ainda confundem:** os selos "1 de 3" por cima da TV em toda prévia (`web/src/components/tela/TvAoVivo.jsx:116-127`) e o botão da gerente dizendo "Pôr na TV" quando o toque vira pedido (`web/src/pages/ContentEditorPage.jsx:933`). Blocos 4 e 8.
7. **A TV fora do conteúdo:** a 2ª TV no plano grátis fica no código sem dizer por quê (o 402 só vai ao painel, `server/routes/telas.js:366`); fora do horário, o padrão segue "Continua mostrando a programação" (`web/src/components/tela/HorarioDaTela.jsx:13`); a logo do cabeçalho segue pequena (`css/player.css:498`). Blocos 1 e 3.
8. **Exemplo de outro negócio com a foto do seu:** na padaria, "Óculos de sol 30% off" sobre um pão (`oferta-foto`, `oferta-desconto`), "Cabelo · Unhas · Estética" no `cabecalho-centro`, "@studiobella" no `rodape-faixa`: a foto vem do ramo da conta (`js/peca-render.js:835`), o texto do modelo de origem quando o manifesto não traz o da frente (`web/src/lib/modelosOuro.js:51`). O exemplo de Saúde do "Adicionar" segue um check-up com desconto, sem "R$" (`web/src/lib/contentTypes.js:369`, `js/render.js:1377`). Blocos 1 e 5.
9. **Acessibilidade que sobrou:** Equipe com um membro tem o `select` do papel sem nome, crítico no axe (`web/src/pages/TeamPage.jsx:84`); a Plataforma com 3 contrastes e a tabela rolável sem foco; Peças guardadas da conta antiga (`.bg-[#0a1020]`); as tabelas da Privacidade no celular. Blocos 5, 6 e 7.
10. **Fora do Chromium e sem prova:** só Chromium medido, `/apk/versao.json` segue 404, a landing sem prova social e o e-mail de confirmar genérico. Blocos 6 e 7.

## Os 10 do reteste 2, um a um

| # | Problema do reteste 2 | Hoje | Prova |
|---|---|---|---|
| 1 | O conteúdo pronto espera a aprovação | **Continua** (agora 100 telas e 70 peças esperando) | `R3/b47/out/op.log`, `R3/b47/out/seg5.log` |
| 2 | Cabeçalhos que cortam | **Resolvido** | Cabeçalho sem corte 6/6 nas três orientações; 0 de 101 telas com corte (eram 13); régua 12.471/12.471. `R3/b1/zoom-cab-deitada.png`, `zoom-cab-empe.png` |
| 3 | Texto sobre texto no `cardapio-combo` na quadrada | **Resolvido** | `R3/b1/telas-refeitas/l2-padaria-quadrada.png`, `R3/b1/telas/l2-restaurante-quadrada.png` |
| 4 | Meia peça vazia sem foto, a avaliação sem QR, a vitrine com "10x de" | **Em parte** | Foto do banco em todo espaço vazio, vitrine com "ou 10× de R$ 18,99" (`R3/b1/v-fotos.png`, `v-telas1.png`); a avaliação continua sem QR, e o QR vazio agora derruba o cartão da `cena-qr` |
| 5 | A prévia e o "Ver agora" que não mostram a TV | **Resolvido** | O player de verdade nos dois (`R3/b47/shots/b4-d-veragora.jpg`, `ap-dono-antes-depois.jpg`); sobram os selos "1 de 3" |
| 6 | A Primeira TV passou de 15 toques e o robô quebrado | **Resolvido** | 14 toques, 178 s; o `tools/cinco-minutos.mjs` roda (`R3/cinco/cinco.log`) |
| 7 | A volta longa como "tudo certo · 1 dica"; a IA sem "Quando" nem Desfazer | **Resolvido** | Aviso no alto com o botão, 4 toques (`R3/b3/shots/m-c7-0-tv.png`); "Quando" no cartão e Desfazer no aviso (`R3/b8/qa/cliques-ia-d.log`) |
| 8 | Fora de época e fora da regra no Prontos; exemplos com o dia errado | **Resolvido** | Saúde sem Outubro Rosa nem Parcelado (`R3/b8/shots/saude-d-prontos.jpg`); "Prato do dia · hoje" (`R3/cinco/celular-07-fotos.png`) |
| 9 | Desempenho do Prontos e de Telas | **Resolvido** | Prontos 2,44 s no 4G lento (era 7,37); Telas com 6 chamadas (eram 32); Plataforma 2,8 s (era 7,0). `R3/b47/out/perf.log`, `chamadas.log`, `op.log` |
| 10 | A TV antes do conteúdo e o texto corrido | **Em parte** | Código, espera e "Adicionar" resolvidos; corpo e título nas zonas grandes resolvidos (`R3/b1/estados/estados.json`, `R3/b1/tipos/`); seguem a 2ª TV grátis sem explicação e a letra da lateral, do bloco e da principal com zonas |

**7 resolvidos, 2 em parte, 1 igual.** O que continua (a aprovação) não é
código: é a galeria do operador.

## O que melhorou desde o reteste 2

- A TV não corta nem sobrepõe texto: cabeçalhos 6/6 nas três orientações, 0 de 101 telas com corte, o combo da quadrada limpo.
- O espaço de foto vazio leva uma foto do banco; a parcela pela metade não vai ao ar.
- Corpo e título nas zonas grandes passam a régua de leitura a 4 m (corpo 4,6–5,2%, título 10–11%).
- A TV antes do conteúdo: código e instrução legíveis com o QR ao lado, a espera na marca da conta, nenhum recado técnico.
- O Prontos na época e sem preço na Saúde, em 2,4 s no 4G lento.
- O painel mostra a TV de verdade no "Ver agora" e nas Aprovações.
- A Primeira TV em 14 toques e 178 s, com o robô de volta.
- A volta longa é aviso com o botão à vista; a campanha da IA tem "Quando" e Desfazer.
- Telas com busca e 6 chamadas; Plataforma em 2,8 s; suporte e análise da logo certos.

## O que não foi coberto

- A IA real (bloco 2 e cenários 1, 2, 4, 9 e 10 do bloco 3).
- TVs e boxes de verdade, outros navegadores, a TV 4K.
- E-mail e pagamento de verdade; a planilha real do Google.
- A régua inteira (vale o CI do `d1ed6eb`).
- A galeria do operador foi aberta, mas nada foi aprovado: tudo foi medido como o manifesto está.
