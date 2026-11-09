# Reteste 2 (09/11/2026)

Os mesmos blocos do reteste da fase 10 (05/11), com o mesmo método, os
mesmos robôs e a mesma régua, depois de tudo o que entrou de 05 a 07/11:
contraste da TV, cabeçalhos, piso do balcão com borda de 2–3% e 11 marcas,
paletas e climas, espaços de foto e Trocar foto, "Sua primeira TV em 5
minutos", Biblioteca em 2 níveis, aprovação e permissão por loja, planilhas,
chamada de senha, modo ambiente, lotes 3 e 4 e o "Arrumar a volta".

Base: `main` em `fbd5585`. Servidor **local** na porta 6020, banco novo
(`STORAGE=local`, `AI_PROVIDER=dev`, sem e-mail de verdade). Nada de
produção. A IA real ficou de fora outra vez: o bloco 2 e os cenários de IA
do bloco 3 ficam com a nota antiga.

Tudo (scripts, fotos e JSON) está em
`/tmp/claude-0/-home-user-Multi-telas/b804d644-700b-5e83-ad8f-5fe2da78625e/scratchpad/reteste2/`,
chamado aqui de `R2/`.

## Bloqueadores

**Nenhum.** Não achei quebra de tela, vazamento entre contas nem falha de
segurança. Os dois avisos mais perto disso são de processo, não do produto:

- **O robô dos 5 minutos quebrou e o número publicado ficou velho.** O
  commit `98274b2` (a foto do passo abre o Trocar foto) mudou o passo 5 e
  `tools/cinco-minutos.mjs:179` espera o seletor de arquivo direto: o robô
  para com `Timeout … waiting for event "filechooser"`. Com o robô ajustado
  (`R2/cinco/cinco-r2.mjs`), o passo a passo dá **16 toques** (meta: 15),
  não os 14 do `CINCO-MINUTOS.md`. Para reproduzir: `CINCO_BASE=… node
  tools/cinco-minutos.mjs` num servidor local.
- **`npm test`:** 1.968 de 1.970 passam. A falha é do ambiente
  (`test/apk.test.js:80`: o proxy deste ambiente põe um `GITHUB_TOKEN`), e
  1 teste é pulado.

## As notas

| Bloco | 05/11 | Agora | Em uma frase |
|---|---|---|---|
| 1. A TV | 6,5 | **7,0** (conta 7,3) | Contraste resolvido, a quadrada voltou, as telas prontas subiram muito; segura o cabeçalho que corta, a foto que falta e a aprovação |
| 2. Criações da IA | 6,3 | — (6,3) | Precisa da IA real |
| 3. Programação | 8,0 nos 7 cenários sem IA | **8,3** nos mesmos 7 (o bloco, com a IA antiga: 7,0) | Datas da frente com 1 toque e "Arrumar a volta"; o aviso da volta longa fica escondido |
| 4. Telas e a página da TV | 8,5 | **8,5** (conta 8,7) | A TV de verdade no centro, axe limpo, aprovação por loja; o "Ver agora" e a aprovação ainda mostram desenho ou nada |
| 5. O resto do painel | 7,5 | **8,0** | 572 aberturas sem quebra e quase sem axe; Prontos lento e com conteúdo fora de época |
| 6. Site e e-mails | 8 | **8,5** | 404 e e-mails no padrão; landing igual |
| 7. A base | 8,5 | **8,5** | Segurança e robustez no topo; desempenho do Prontos e compatibilidade seguram |
| 8. A interface do painel | 6,7 | **7,7** | A TV real no centro e a página da TV em frases; cliques iguais e o caminho da IA diferente |

**Nota geral provisória: 7,5 / 10** (era 7,1), com o mesmo peso dobrado
para a TV, a IA, a programação e a interface. No bloco 2 entra a nota
antiga; no 3, os 7 cenários medidos e a nota antiga dos 5 que dependem da
IA. A conta: (7,0×2 + 6,3×2 + 7,04×2 + 8,5 + 8,0 + 8,5 + 8,5 + 7,7×2) ÷ 12
= 7,47.

**Nenhum bloco chegou a 9.** O que segura cada um está no fim de cada
seção e, junto, nos [10 problemas](#os-10-problemas-que-mais-seguram).

## O método, e o que mudou nele

O mesmo dos retestes de 05/11 (`RETESTE-BLOCO-1.md`, `-3`, `-4-7`, `-8`),
com os scripts copiados e ajustados. Diferenças, todas de execução:

- **No máximo 2 contextos de navegador por vez** (pedido do dono, a
  máquina já reiniciou por excesso de navegadores). Cada TV continua no
  seu contexto: num contexto só, as TVs dividem o `localStorage`, o evento
  `storage` (`js/player.js:1381`) faz uma aplicar a programação da outra, e
  a TV nova abre com a config da anterior. No bloco 8, as 6 TVs vivas ficam
  num contexto só, cada uma numa origem (`127.0.0.20` a `.25`).
- **O servidor foi reiniciado entre as rodadas do bloco 1**, porque a rota
  pública que cria TV aceita 60 por hora por IP (`server/routes/telas.js:249`),
  e o robô cria centenas. É o freio certo para produção.
- **O tempo de pareamento:** com a TV parada no código por 3 a 40 s, ela
  sai do código de 9 a 113 ms depois do "Ligar" (5 de 5,
  `R2/b1/estados/parear-tempo.json`). Os 14,6 s da primeira troca em
  `estados.json` são do robô, que pareia antes de a TV abrir o tempo real.
- O axe é o mesmo pacote (4.14), injetado com `bypassCSP: true`.
- Telas: o lote 0 a 4 inteiro (91), medido como o manifesto está (só 1
  aprovada). Peças: as 98 do manifesto (43 aprovadas, 55 esperando).

Robôs e rodadas: `npm run regua` (`R2/regua/`), `tools/cinco-minutos.mjs`
ajustado (`R2/cinco/`), tipos (243), telas (224 medições de 91 telas),
peças na TV (294), layouts (96), estados (57), 2 cenários × 2 tamanhos do
bloco 3, 572 aberturas do painel com axe, 78 telas medidas no bloco 8, 13 × 2
tarefas cronometradas, desempenho no 4G lento, segurança, XSS e confiança.

## Bloco 1: a TV — 6,5 → 7,0

### A régua do repositório (`npm run regua`, 8 min 56 s)

Passou inteira: tela cheia 42/42, principal com lateral 14/14, lateral
14/14, bloco 28/28, a tela da senha 3/3 (letra 4,8%, senha a 26–30% do lado
menor), peças-ouro em tela cheia 261/261 e com as 11 marcas 2.871/2.871, e
no balcão com borda de 2% e 3% 693/693 (lateral) e 957/957 (destaque).
Contraste ≥ 4,5 em todo texto: 39/39, 13/13, 13/13 e 26/26. Texto padrão
do "Adicionar" na TV: 0 de 18. `R2/regua/regua.log`.

### Os tipos, com conteúdo de verdade (243 fotos, `R2/b1/tipos/`)

| Formato de zona | Régua de 4,5% (05/11 → agora) | Piso do lugar | Contraste ≥ 4,5 em todo texto | Menor letra (mediana) |
|---|---|---|---|---|
| Tela cheia | 12/17 → 12/17 | 17/17 | **6/17 → 17/17** | 4,5% |
| Principal com zonas | 9/17 → 9/17 | 17/17 | 6/17 → 17/17 | 4,5% |
| Em pé | 10/17 → 10/17 | 17/17 | 6/17 → 17/17 | 4,5% |
| Quadrada | 8/17 → 8/17 | 17/17 | 6/17 → 17/17 | 3,7% |
| Bloco (Dois quadrados) | 6/17 → 6/17 | 17/17 | 6/17 → 17/17 | 3,7% |
| Lateral (Corporativo) | 5/17 → 6/17 | **16/17 → 17/17** | 6/17 → 17/17 | 3,5% |
| Lateral (Painel Notícias) | 5/17 → 6/17 | 16/17 → 17/17 | 6/17 → 17/17 | 3,5% |

- **Contraste:** 0 de 1.009 textos abaixo de 4,5 (era a cor da marca entre 2,5 e 4,3 em 11 de 17 tipos).
- **O cardápio de 9 itens na lateral** agora vai em páginas, com a letra inteira (era 2,4%).
- **Igual:** o corpo do aviso e do texto fica em 3,9–4,5% e o título em 8,3% (régua: corpo ≥ 7,5%, título 10–14%). Saúde e Empresas seguem nascendo em 3,5% e 3% (`js/player.js:102-103`), por isso a régua de 4,5% só passa no Comércio.
- O exemplo de promoção põe o preço sem "R$" ("34,90", `js/render.js:1315`, `web/src/lib/contentTypes.js:368`), e o de Saúde é um desconto de check-up ("390,00 → 290,00", `contentTypes.js:369`).

### Peças-ouro na TV real (98 × 3 orientações, `R2/b1/pecas-tv/`)

| Onde | 05/11 (43 peças) | Agora (98 peças) |
|---|---|---|
| Destaque e lateral, piso do lugar, deitada | 31/32 | **86/87** |
| Idem, em pé | 29/32 | **85/87** |
| Idem, **quadrada** | **0/32** (2,5%) | **84/87** |
| Contraste ≥ 4,5 em todo texto | 8/32 | **87/87** nas três |
| Cabeçalho, sem corte (deitada/em pé/quadrada) | 4/6, 4/6, 0/6 | 2/6 nas três |
| Rodapé, piso do lugar | 4/5, 5/5, 0/5 | 4/5, 5/5, 3/5 |

- A quadrada voltou: a correção da escala (`js/render.js`, `escalaDaTela`) vale na TV real.
- **Cabeçalhos que cortam, vistos na foto** (`R2/b1/zoom/cabecalhos.png`):
  - `cabecalho-centro` trunca a data ("SEGUNDA · 9 …") e corta acento e descendente ("COMUNICAÇAO", "VOCE", o "g" de "Metalúrgica"): `pecas-ouro/cabecalho-centro.html:17` (`.data` com reticências), `:22` (`.nome` com altura de linha 0,95 e `overflow: hidden`) e `:24` (`.sub` com 0,9);
  - `cabecalho-classico` em pé corta o nome ("PADARI∧ SOL").
- **Foto que falta vira meia peça vazia:** `oferta-desconto` (quadrada, `R2/b1/pecas-tv/oferta-desconto-quadrada.png`), `cardapio-dia-foto` (um prato vazio desenhado; e "PRATO DO DIA · QUINTA" numa segunda), `oferta-foto`.
- Abaixo do piso só cardápios e listas no balcão, a 4,2–4,4% (e `cardapio-dia-foto` deitada a 3,7%).

### Telas prontas (91: lotes 0 a 4, `R2/b1/telas/`)

| Lote | Telas | Letra ≥ piso do lugar | Letra ≥ 4,5% | Usam o `cabecalho-centro` |
|---|---|---|---|---|
| 0 | 6 | 4 | 2 | 1 |
| 1 | 20 | 15 | 4 | 4 |
| 2 | 27 | 21 | 7 | 4 |
| 3 | 18 | 17 | 7 | 2 |
| 4 | 20 | **20** | 10 | 2 |
| **Total** | **91** | **77 (era 20 de 53)** | **30 (era 3 de 53)** | 13 |

- **Contraste:** os 2 avisos do robô são o letreiro entrando com degradê (`R2/b1/zoom/l2-clinica-em-pe-rod.png`); nada real.
- **O lote 4 está no nível das telas de referência** (`l4-padaria-deitada.png`): foto grande, preço com "R$", cabeçalho limpo e a hora uma vez só.
- **O que ainda sai errado na tela:**
  - **Texto sobre texto** na quadrada: o `cardapio-combo` põe o título por cima de "TUDO POR" e do "R$" (`l2-padaria-quadrada.png`, `l2-restaurante-quadrada.png`);
  - **meia tela vazia** sem a foto: a única aprovada, "Semana do Sol" (`otica-semana-do-sol.png`), e a vitrine do lote 1, que mostra "10x de" sem o valor (`l1-comercio-vitrine.png`);
  - a avaliação "Como foi o seu atendimento?" sem QR (`l4-farmacia-em-pe.png`), e a foto estreita com laterais desfocadas no díptico em pé;
  - o rodapé de pagamento ocupa ¾ da faixa e os avisos quase não aparecem (`l4-padaria-deitada.png`, `l2-padaria-quadrada.png`);
  - nos lotes 1 a 3, a data aparece no cabeçalho e no rodapé (`l3-escritorio-deitada.png`);
  - exemplos com o dia errado: "Prato do dia · Quinta" numa segunda, "Terça do burger" numa segunda, "14 · Sábado · junho" em novembro.
- **Aprovada continua 1 de 91** (90 na galeria esperando, `R2/b47/out/op.log`). Sem a sua aprovação, o cliente segue vendo só a da ótica nas Telas inteiras.

### Layouts, marca e estados

- **Layouts:** iguais. A zona vazia some nos 48 casos de só a principal; a marca aparece no máximo uma vez pelo sistema.
- **Marca:** 243 de 243 fotos dos tipos na cor da marca, e agora com contraste. A logo do cabeçalho segue pequena (o "Sol" ilegível no fim da Primeira TV, `R2/cinco/computador-15-a-tv.png`).
- **Estados** (`R2/b1/estados/estados.json`):
  - código: o código 16–20%, com QR; a instrução segue em 1,8–2,4% e "Gerar outro código" em 1,2–1,5%;
  - espera: igual, "Tudo certo" da MultiTelas, azul, sem a marca da conta;
  - "Adicionar": 0 de 44 exemplos no ar; os mesmos 9 tipos com recado técnico ("Imagem indisponível", "Escolha um mural nas configurações desta tela.", "Envie um arquivo (.pptx/.pdf)", "Entrada de vídeo indisponível", "🎂 Em breve, novos aniversários", "Carregando clima…");
  - sem internet: segue mostrando, também reaberta, e volta;
  - TV removida: volta ao código em 0,5 s;
  - 2ª TV no plano grátis: o painel diz "limite do plano atingido (1 tela)" e a TV fica no código, sem dizer por quê;
  - troca: 20 a 978 ms nas seguintes; 0 erros de página.

### Notas por item

| Item | 05/11 | Agora | Por quê |
|---|---|---|---|
| Tipos, no padrão do "Adicionar" | 6 | **6** | Igual: 9 tipos com recado técnico |
| Tipos, tela cheia | 7 | **8** | Contraste 17/17; corpo e título ainda com teto |
| Tipos, principal com zonas | 6,5 | **7,5** | Contraste 17/17; 9/17 nos 4,5% |
| Tipos, lateral e bloco | 6 | **7** | 17/17 no piso, cardápio em páginas; 6/17 nos 4,5% |
| Tipos, em pé e quadrada | 6,5 | **7,5** | Contraste 17/17; 10 e 8/17 nos 4,5% |
| Layouts | 7 | **7** | Igual |
| Peças-ouro (98) | 6 | **7,5** | Quadrada 84/87, contraste 100%; 2 cabeçalhos cortam, meia peça vazia sem foto |
| Telas prontas (91) | 4,5 | **6** | 77/91 no piso, lote 4 de referência; 1 aprovada, cabeçalho cortado em 13, texto sobre texto na quadrada |
| Marca do cliente na TV | 7,5 | **8** | Com contraste; a espera e a logo pequena seguram |
| Faixas | 7 | **7** | Cabeçalho que corta; rodapé de pagamento que esconde os avisos |
| Código | 8 | **8** | Igual |
| Espera | 6 | **6** | Igual |
| Sem internet | 8,5 | **8,5** | Igual |
| TV removida | 8,5 | **8,5** | 0,5 s |
| 2ª TV grátis | 6 | **6** | Igual |
| Funcionamento | 9 | **9** | Igual |
| **Bloco** | **6,5** | **7,0** | (71,5 × 2 + 46) ÷ 26 = 7,27, arredondado para baixo ao meio ponto, como antes |

Fora da conta (não existiam em 05/11): a tela da **chamada de senha** (régua
3/3, `R2/regua/senha-deitada.png`) e o **modo ambiente** (testes passam).

### O que segura o bloco 1 abaixo de 9

1. As telas e peças novas esperam a aprovação (90 telas e 55 peças); o cliente vê 1 tela e 43 peças (`web/src/lib/modelosOuro.js:20`, `server/conteudoPronto.js`).
2. `pecas-ouro/cabecalho-centro.html:17-24` (data cortada, acento cortado, em 13 telas) e o `cabecalho-classico` em pé.
3. `pecas-ouro/cardapio-combo.html` na quadrada: texto sobre texto.
4. Peças com espaço de foto sem foto ficam pela metade; a TV não põe uma foto do banco sozinha.
5. Corpo e título com teto (`css/player.css:677`, `:681`) e o piso de 3,5% e 3% da Saúde e da Empresas (`js/player.js:102-103`).
6. Espera, código e a 2ª TV grátis iguais (`player.html`, `css/player.css:1365`, `:1383`); o "Adicionar" com recado técnico (`js/render.js`).
7. Exemplos de texto com dia e mês que não batem com hoje ("Quinta", "Terça", "junho", "Destaque de outubro").

## Bloco 2: criações da IA — 6,3 (sem IA)

Não refeito: `AI_PROVIDER=dev` responde por regra. Nota antiga mantida.

## Bloco 3: programação — 8,0 → 8,3 nos 7 cenários sem IA

Robô de leigo (`R2/b3/b3.js`), no computador (1280×800) e no celular
(390×844), com uma TV de verdade. Hoje é segunda, 09/11. Mais os testes
(`R2/b3/testes.log`): semana simulada, "Arrumar a volta", modo ambiente,
calendário e importância, **23 de 23**.

| # | Cenário | 05/11 | Agora | Medido |
|---|---|---|---|---|
| 3 | Oferta até sábado | 9 | **9** | **7 toques** (eram 8) nos dois tamanhos: Criar › Escolher um modelo › oferta › Continuar › Até um dia › data › Pôr na TV. Grava 09/11 a 14/11; a Agenda mostra "até 14/11" em cada dia. "Escolher um modelo" agora abre "Trocar os textos" (`R2/b3/shots/m-c3-2-textos.png`) |
| 5 | Black Friday e Natal sem lembrar | 8 | **9** | O leitor sem IA acerta 27/11, 25/12 e 09/05/2027. Na Agenda, "Datas que vêm" traz as datas da frente: **1 toque** em "Pôr na programação" e a Black Friday está na TV |
| 6 | Duas campanhas e dois urgentes | 8 | **8** | Semana simulada: urgente ≤ 25%, Alta ≤ 40%, com o respiro do modo ambiente ligado |
| 7 | 30 peças acumuladas | 7 | **8** | **5 toques**: Telas › Abrir a TV › Resumo desta TV › Arrumar a volta › Tirar 16 peças. De 33 para 17 peças, com o porquê de cada uma. Mas a volta de 9 min 31 s no balcão aparece como "**tudo certo** · 1 dica", e o botão mora dentro do resumo fechado (`R2/b3/shots/d-c7-0-tv.png`) |
| 8 | "Só na loja do Centro" | 9 | **9** | Agora com permissão por loja: a gerente vê e muda só a TV dela (403 na outra, ver bloco 4) |
| 11 | Sala de espera, 12 min sem repetir | 7 | **7** | O painel avisa a volta curta (como dica); a IA ainda não monta a volta |
| 12 | Fora do horário | 8 | **8** | **4 toques** (Telas › Abrir a TV › Ajustes da TV › Horário); o padrão segue "Continua mostrando a programação" |

**Média dos 7: 8,3** (era 8,0). Os 5 cenários com IA (1, 2, 4, 9 e 10)
seguem com 5, 6, 5, 6 e 4,5: o bloco fica em **7,0** (era 6,9).

**O que segura abaixo de 9:**
1. A volta longa é "dica", não aviso: `web/src/lib/screenDigest.js:90` (nível `dica`) e o resumo diz "tudo certo" (`web/src/components/content/ScreenSummary.jsx`).
2. Fora do horário, o padrão continua mostrando (a TV de noite gasta luz e tela).
3. Os cenários de IA sem medir.

## Bloco 4: Telas e a página da TV — 8,5 → 8,5 (conta 8,7)

Conta típica de Comércio, a TV "Recepção" aberta em outra janela
(`R2/b47/out/b4live.log`, fotos `R2/b47/shots/b4-*`).

A coluna "05/11" é a média dos critérios (FUN, FLU, TXT, VIS, ACE) do
reteste anterior.

| Item | 05/11 | Agora | Medido |
|---|---|---|---|
| Ligar uma TV | 9 | **9** | A TV sai do código em 9–113 ms depois do "Ligar" |
| Ver agora | 8,5 | **8,5** | 350 ms (PC) e 615 ms (celular), mas o diálogo segue sendo um **desenho** ("desenhado aqui no painel", "Painel do clima", `VerTelaAgora.jsx:189`), enquanto a página da TV já mostra o player |
| Recarregar | 8,5 | **8,5** | 1,8 s e 1,9 s |
| Som | 8 | **8,5** | O texto agora aponta "Ajustes da TV › Som" |
| O que passa | 8 | **9,5** | "Na TV agora" é o player com a marca (`R2/b47/shots/b4-d-pagtv.jpg`); as partes em palavras: Parte de cima, Meio, Lado, Faixa de baixo |
| Pôr na TV | 9 | **9** | A TV mudou em 428 ms (PC) e 436 ms (celular); barra fixa à vista (y 803 de 860; 729 de 844) |
| Desfazer e Refazer | 8,5 | **9** | 342 e 209 ms; 180 e 319 ms |
| Ajustes da TV | 7,5 | **9** | axe 0 (era crítico); "Como a TV se divide" em frases ("Coluna à esquerda + grande") |
| Página da TV com dados antigos | 9 | **9** | 0 quebras |
| **Aprovação e loja (novo)** | — | **8** | A gerente da Loja Centro vê 1 TV; a outra dá 403 ao ler e gravar. Pede em **4 toques** no celular, a TV não muda; o dono aprova em **3** (sino › Ver o antes e o depois › Aprovar e pôr na TV) e a TV muda. Mas o antes e o depois aparecem **vazios** (só a moldura, `R2/b47/shots/ap-dono-antes-depois.jpg`, `components/tela/PreviaDaTela.jsx:45`) |
| Grupos com 25 TVs | 8 | **8** | Lojas com permissão; segue sem busca em Telas (`ScreensPage.jsx`) |

Média: 8,7; o bloco fica em 8,5, arredondado para baixo ao meio ponto.

**O que segura abaixo de 9:** o "Ver agora" desenhado, a prévia vazia nas
Aprovações, sem busca com 25 TVs, os selos "3 de 6" por cima da TV em
miniatura e o botão da gerente dizendo "Pôr na TV" quando vira pedido.

## Bloco 5: o resto do painel — 7,5 → 8,0

As mesmas 8 contas (vazia, típica, cheia e antiga, em Empresas e
Comércio), 2 tamanhos, axe WCAG 2 A/AA: **572 aberturas**
(`R2/b47/out/crawl-*.json`, fotos `R2/b47/shots/`).

- **0 "Esta tela não abriu", 0 "erro interno"**, 0 rolagem lateral. A conta antiga abre as Campanhas sem o 500 (era Q5).
- **axe: 1 problema em 2 aberturas** (contraste em Peças guardadas da conta antiga, `.bg-[#0a1020]`). Eram 6 problemas em 55 aberturas. Ajustes da TV, Mural, Criando e os selos de campanha ficaram limpos.
- Medianas de 0,65 s a 1,25 s; a mais lenta é **Prontos para você** (1,75 s local, 7,4 s no 4G lento, bloco 7).
- Título 28 px (24 no celular) em todas; corpo: 15 px em 37% do texto, 13 px em 48% (igual).
- Páginas novas limpas e rápidas: Chamada de senha, Preços da planilha, Aprovações (0 axe, 0,65–0,69 s).
- Início e Alertas com 25 TVs: agora "25 TVs fora do ar · Quais? · Ver" e "Ver as 25 TVs" (`R2/b47/shots/comercio-cheia-d-overview.jpg`).
- Peças guardadas com 300 peças: abre em 0,8 s (mediana); de 12 em 12.
- Marca no celular: os selos descem inteiros (`empresa-tipica-m-brand.jpg`).

**Ainda errado:**
1. **Prontos para você** mostra, na Saúde, "Outubro Rosa" em novembro e o **"Parcelado: 10× sem juros de R$ 39,90"** na segunda linha (`R2/b8/shots/saude-d-prontos.jpg`). A peça `oferta-parcelado` vale para Comércio e Saúde no manifesto; para o dentista, a REFERENCIAS (CFO 196/2019) pede sem preço promocional.
2. **A análise da logo** diz "Lê no fundo escuro" para uma logo azul-marinho que some no fundo preto (`empresa-tipica-m-brand.jpg`, `components/content/LogoDaMarca.jsx`).
3. **Suporte** segue com o Gmail pessoal (`web/src/pages/SupportPage.jsx:16`).
4. Plano: "2 de 49 telas"; Campanhas: "1 TV(s)"; o exemplo da planilha é "Café expresso R$ 6,00" também na Empresas.
5. Plataforma (operador) abre em 7 s (era 5,4) e tem 3 contrastes baixos no axe.

As páginas que mudaram (05/11 é a média dos critérios do reteste anterior;
as outras ficam com a nota de lá):

| Área | 05/11 | Agora |
|---|---|---|
| Início, Alertas | 7,5 | 8,5 |
| Campanhas | 6,5 | 8,5 |
| Peças guardadas | 7 | 8,5 |
| Prontos para você (peças e telas) | 7 | 7 |
| Marca | 7,5 | 8 |
| Criando, Mural (axe) | 7,5 | 8,5 |
| Chamada de senha, Preços da planilha, Aprovações (novas) | — | 9, 8,5, 7,5 |
| Suporte | 7,5 | 7,5 |
| Plataforma (operador) | 7,5 | 7 |
| **Bloco** | **7,5** | **8,0** |

## Bloco 6: site e e-mails — 8 → 8,5

- **Site** (`R2/b47/out/site.log`): igual em texto e preços (R$ 79, 139 e 159; anual a partir de 51, 90 e 102). No 4G lento, pronto em 0,87–0,94 s. 0 links quebrados.
- **404:** agora com título ("Página não encontrada · MultiTelas"), idioma, a marca e dois caminhos (painel e site).
- **axe:** limpo, menos as 2 tabelas da Privacidade no celular (`scrollable-region-focusable`), como antes.
- **E-mails** (`R2/b47/mails/folha.jpg`): os de conta saem na mesma moldura, com a logo e o rodapé. O do código da foto ganhou moldura e rodapé, mas sem o ícone. O de confirmar continua genérico, sem a frente.
- Segue faltando prova social na landing.

## Bloco 7: a base — 8,5 → 8,5

| Área | 05/11 | Agora | Medido |
|---|---|---|---|
| Segurança | 9 | **9,5** | **13 de 13** barradas (a 13ª, apagar peça de outra conta, agora dá 404). Rotas novas: senha de outra conta 403 (pela sessão e pelo token da TV), zerar sem sessão 401, planilha com link interno, IP de metadados, `file:`, `localhost` ou domínio parecido: 400; aprovar pedido de outra conta 404; dar loja a usuário de outra conta 404; a gerente na TV de outra loja 403. CSRF de fora 403. XSS em 12 campos e 19 páginas, na TV e no mural público: nada executou (`R2/b47/out/seg*.log`, `xss.log`) |
| Confiabilidade da TV | 9 | **9** | 45 s sem internet: segue; a mudança chega 9,1 s depois da rede. Servidor parado 15 s: segue; a mudança chega 14,6 s depois |
| Robustez com dados antigos | 8 | **9** | 0 quebras e 0 erros de tela em 572 aberturas |
| Desempenho | 8 | **8** | 4G lento com CPU 4×: landing 0,87–0,94 s; Início no celular 2,75 s (era 3,1); Programação de 25 TVs 2,77 s (era 4,2); Telas 2,53 s; Peças guardadas 3,4 s; a TV 1,9 s. **Prontos para você 7,4 s** (494 KB: busca cada peça em HTML, `web/src/lib/modelosOuro.js:21`). Telas faz **32 chamadas** ao abrir com 25 TVs (25 configs, uma por TV, `components/tela/MiniaturaDaTela.jsx:50`); o plano dizia 5 |
| Acessibilidade | 7 | **8,5** | 1 problema no painel em 572 aberturas; site com a Privacidade; operador com contraste |
| Compatibilidade | 7 | **7** | Só Chromium; `/apk/versao.json` segue 404 |
| E-mails | 7,5 | **8,5** | Ver bloco 6 |
| Conteúdo pronto por frente | 4 | **5** | Peças da frente na marca, pelo tipo de negócio; mas 1 tela aprovada, e as Telas inteiras de Saúde e Empresas vazias até aprovar |

## Bloco 8: a interface do painel — 6,7 → 7,7

As mesmas 3 contas típicas com TVs de verdade (`R2/b8/qa/monta.js`),
27 páginas × 3 frentes × 2 tamanhos (`R2/b8/shots/`), axe e violeta
(`R2/b8/axe/medida.json`) e as tarefas cronometradas (`R2/b8/cliques/`).

| Critério | 05/11 | Agora | Por quê |
|---|---|---|---|
| Clareza da navegação | 7 | **8** | A Biblioteca em 2 níveis, a campanha num lugar só, Prontos com telas e peças numa grade e um filtro. Sobram o "Ver agora" desenhado ao lado da TV real e a Programação antiga no endereço |
| Facilidade para o leigo | 6,5 | **7,5** | A página da TV em frases, o "Quando" em frases também para a peça que já está no ar, "Escolher um modelo" com um campo por texto, a Primeira TV em 3 min 24 s. Mas a IA termina sem o "Quando", e a volta longa diz "tudo certo" |
| Acabamento visual | 7 | **8** | A TV de verdade no centro e nas miniaturas do Início, a Marca no celular inteira. Mas a miniatura pisca preta por ~0,4 s, os selos "3 de 6" cobrem a TV, e as Aprovações mostram o antes e o depois vazios |
| Consistência | 6,5 | **7,5** | axe: só `label-content-name-mismatch` nas Campanhas (boa prática); "Abrir a TV" no Início e em Telas. Mas 2–3 violetas por tela no computador, e "Pôr na TV" para a gerente quando vira pedido |
| Celular | 7 | **8** | 0 rolagem lateral, 0 alvo < 40 px na página da TV, que caiu de 2.825 para 2.178 px. A aba "O que passou" corta na borda |
| Parece valer o preço | 6 | **7** | Prontos na marca e pelo negócio, a Primeira TV com 3 telas montadas, as TVs ao vivo. Mas 43 peças e 1 tela aprovadas, "Outubro Rosa" em novembro e um parcelado para clínica |

**Média: 7,7.**

### Cliques por tarefa (a partir do Início)

| Tarefa | 05/11 | PC | Celular | Caminho de hoje |
|---|---|---|---|---|
| Pôr uma foto | 4 | 4 | 4 (+1 rolagem) | Início › Pôr foto ou vídeo na TV › Galeria › arquivo › Pôr na TV |
| Pôr uma peça pronta | 4 | 4 | 4 | Biblioteca › Usar › Salvar › Pôr na TV |
| Escolher um modelo e pôr | 5 (pelo editor avançado) | 5 | 5 | Criar › Escolher um modelo › o modelo › Continuar › Pôr na TV (bloco 3) |
| Mudar o que a TV mostra | 3 | 3 (+2 rolagens) | 3 (+2) | Abrir a TV › o item › (digita) › Pôr na TV |
| Agendar uma peça nova | 6 | 6 | 6 | Biblioteca › Usar › Salvar › Numa hora do dia › Tarde › Pôr na TV |
| Agendar a que já está na TV | 4 (+2 horas digitadas) | 5 | 5 | Abrir a TV › o item › Numa hora do dia › Tarde › Pôr na TV. Sem digitar hora |
| Criar com a IA e pôr no ar | 6 | 6 | 6 | Criar › (digita) › Enviar › Sem foto › Gerar › Aprovar e gerar › Pôr na TV. Vai ao ar direto, **sem o "Quando"** e sem Desfazer (IA de teste) |
| Mudar a marca | 2 | 2 | 3 | Marca › paleta; o tema da TV mudou no servidor |
| Ligar uma TV | 3 | 3 | 3 | Telas › Ligar uma TV › (código e nome) › Ligar |
| Convidar alguém | 3 | 3 | 3 | avatar › Convidar alguém › Gerar convite |
| Ver o que está no ar | 0 | 0 | 0 | A miniatura em 354 ms (PC) e 315 ms (celular), sem "Perguntando à TV…" |

Os toques não mudaram; mudou o que se lê e se vê em cada um.

### Sua primeira TV em 5 minutos (`R2/cinco/`)

| | Celular | Computador | Meta |
|---|---|---|---|
| Toques, passos 1 a 7 | **16** (eram 14) | **16** | ≤ 15 |
| Pessoa cuidadosa | **204 s** (eram 174) | **204 s** | ≤ 300 s |
| A TV mostrou o que a pessoa digitou | sim | sim | |

Os 2 toques e os 30 s a mais vêm do passo 5: o quadro da foto agora abre o
**Trocar foto** (Do celular, Banco de fotos, Gerar com IA) e pede "Escolher
da galeria" e "Usar esta foto" (`R2/cinco/celular-08-fotos-trocar.png`).
Na tela do passo 5, a prévia mostra "Prato do dia · Quinta" numa segunda.

## Os 10 problemas que mais seguram

1. **O conteúdo pronto espera a aprovação:** 90 de 91 telas e 55 de 98 peças. O cliente vê 1 tela (de ótica) e as 43 peças antigas (`server/conteudoPronto.js`, `web/src/lib/modelosOuro.js:20`). Blocos 1, 5, 7 e 8.
2. **Cabeçalhos que cortam:** `pecas-ouro/cabecalho-centro.html:17` (data com reticências), `:22` e `:24` (acento e descendente cortados), em 13 telas; o `cabecalho-classico` em pé corta o nome. Bloco 1.
3. **Texto sobre texto** no `pecas-ouro/cardapio-combo.html` na TV quadrada. Bloco 1.
4. **Meia peça vazia sem foto** (`oferta-foto`, `oferta-desconto`, `cardapio-dia-foto`) e a avaliação sem QR (`qr-foto`); a vitrine com "10x de" sem valor. Bloco 1.
5. **A prévia e o "Ver agora" que não mostram a TV:** o antes e o depois vazios nas Aprovações (`web/src/components/tela/PreviaDaTela.jsx:45`) e o "Ver agora" de Telas desenhado (`web/src/components/content/VerTelaAgora.jsx:189`). Blocos 4 e 8.
6. **A Primeira TV passou de 15 toques** (16) com o Trocar foto, e o robô `tools/cinco-minutos.mjs:179` está quebrado desde `98274b2`. Bloco 8.
7. **A volta longa aparece como "tudo certo · 1 dica"** e o "Arrumar a volta" fica no resumo fechado (`web/src/lib/screenDigest.js:90`); **a IA vai ao ar sem o "Quando"** e sem Desfazer. Blocos 3 e 8.
8. **Conteúdo fora de época e fora da regra no Prontos:** "Outubro Rosa" em novembro, "Parcelado 10× sem juros" para clínica (`oferta-parcelado` com a frente Saúde no `pecas-ouro/manifesto.json`), e exemplos com o dia errado ("Quinta", "Terça", "junho"). Blocos 1, 5 e 8.
9. **Desempenho:** Prontos para você em 7,4 s no 4G lento (`web/src/lib/modelosOuro.js:21`, uma peça por pedido) e Telas com uma config por TV (`web/src/components/tela/MiniaturaDaTela.jsx:50`, 32 chamadas com 25 TVs). Blocos 5 e 7.
10. **A TV antes do conteúdo e o texto corrido:** espera e código da MultiTelas com instrução a 1,8–2,4% (`css/player.css:1365`, `:1383`), 9 tipos do "Adicionar" com recado técnico (`js/render.js`), corpo a 3,9–4,5% e título a 8,3% (`css/player.css:677`, `:681`). Bloco 1.

## O que não foi coberto

- A IA real (bloco 2 e cenários 1, 2, 4, 9 e 10 do bloco 3).
- TVs e boxes de verdade, outros navegadores, a TV 4K, o tema escuro.
- E-mail e pagamento de verdade; a planilha real do Google (os testes usam um servidor local).
- A galeria do operador foi aberta, mas nada foi aprovado: tudo foi medido como o manifesto está.
