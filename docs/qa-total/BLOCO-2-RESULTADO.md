# Bloco 2: resultado das criações da IA

Teste de 05/11/2026, no servidor local (porta 5960), com a IA real (Gemini).
O desenho do teste está em [BLOCO-2-CRIACOES.md](BLOCO-2-CRIACOES.md).

## Resumo

- **Nota média: 6,3** (47 peças). Nos pedidos-base, 6,2 (35 peças).
- **21% das peças têm nota 7 ou mais. Nenhuma chega a 8,5.** A melhor tem 7,4.
- A meta era média 8,5 e nenhuma abaixo de 7. **Não passa.** Hoje o nível é
  "modelo do Canva bem arrumado", perto de "freelancer", longe de marca grande.
- Três defeitos explicam quase tudo:
  1. **a letra é pequena demais** (a menor fica em 2% da tela; a régua pede 4,5%);
  2. **o pedido se perde** (data, horário, telefone e preço somem; às vezes a IA inventa);
  3. **a marca não aparece** (nenhuma peça da Criação rápida mostra o nome da empresa; 5 mostram "A EMPRESA").
- O caminho do **Criar** sai melhor que a Criação rápida no mesmo pedido: **6,9 contra 5,6**.
  Ele recebe o nome da empresa, a frente e as falas do cliente; o diretor não recebe.
- **O teste parou no meio.** Às 05:48 o crédito pré-pago da chave do Gemini acabou
  ("Your prepayment credits are depleted"). Ficaram de fora 25 dos 60 pedidos (veja Limites).
- **Custo gravado: R$ 18,59** (teto do bloco: R$ 28). 13 fotos geradas (teto: 25).

## O que foi feito

- 9 marcas com kit (nome e cores; 4 com fonte): Padaria Pão Dourado, Ótica Visão
  Clara, Empório Bom Preço, Bar do Zé (Comércio); Clínica Vida Plena, Odonto
  Sorriso, Farmácia Saúde Já (Saúde); Metalúrgica Alfa, Rota Sul Logística (Empresas).
  Contas com o perfil da frente, plano Pro ativado.
- Os pedidos foram escritos como o cliente escreve: erro, gíria, texto colado do
  WhatsApp, foto do cliente (boa, escura e torta, fundo bagunçado). Lista em
  `casos.js` (pasta do robô, abaixo).
- **Criação rápida:** as mesmas chamadas do painel. Plano (`apenasPlano`), depois
  gerar com o plano aprovado. 1 peça, TV deitada (ou em pé no totem). Foto gerada em
  13 pedidos; "sem foto" nos outros, para caber no teto de fotos.
- **Criar:** conversa → cartão → aprova o esboço → gera. O cartão foi mexido à mão,
  como o cliente pode fazer: 1 TV, só a principal, 1 peça, sem redes.
- **Meus Designs:** 1 campanha com o campo "Empresa" preenchido e 2 peças.
- Cada peça foi para uma TV de verdade (o `player.html`, 1920×1080 ou 1080×1920),
  fotografada e medida pelo robô (letra, contraste nos pixels, palavras, texto padrão).
- Notas de 0 a 10 com as âncoras do bloco, comparando com as 9 telas de referência.
  A **nota da peça** é a média de 9 critérios: Leitura, Composição, Estética, Marca,
  Texto, Fidelidade, Propósito, Segurança legal e Robustez. Variedade, Ajuste e
  Tempo/custo têm nota à parte.

## As notas

### Por critério (47 peças)

| Critério | Média | O que puxa para baixo |
|---|---|---|
| Leitura (robô) | **4,6** | Menor letra média 2,0% da tela (máx. 2,3%). Só 21% das palavras passam na régua. Corpo médio 2,6% (régua: 7,5%). |
| Composição | 5,2 | Metade da tela vazia quando não há foto. Preço repetido 2 ou 3 vezes. |
| Estética | 5,7 | Limpo e coerente, mas é sempre o mesmo modelo. Nada no nível BK ou Shake Shack. |
| Marca | **4,8** | Cores aplicadas; nome e logo ausentes. "A EMPRESA" em 5 peças. |
| Texto | 5,6 | Frases genéricas ("venha viver essa nova experiência"); chamada às vezes sem sentido. |
| Fidelidade | 6,2 | Some o que importa (data, prazo, telefone). Inventa "hoje", "às 18h", preço. |
| Propósito | 6,2 | Dentista com "exames e especialidades"; tela da recepção falando com a equipe. |
| Segurança legal | 9,3 | Bom em geral. Falha no "mais barato" e no "garantido" de Saúde. |
| Robustez (robô) | 9,3 | Nada quebrado nem vazio. Perde pontos pelo "A EMPRESA". |
| Tempo e custo | 9,3 | Rápido: 31 s em média. R$ 0,26 sem foto, R$ 0,59 com foto. |
| Variedade (2 grupos) | **2,8** | As 3 versões saem com o mesmo desenho e o mesmo título. |
| Ajuste (21 ajustes) | **4,8** | "Preço maior" e "troca a foto" não funcionam. |

### Por frente (pedidos-base)

| Frente | Peças | Média | Estética | Leitura |
|---|---|---|---|---|
| Comércio | 20 | 6,3 | 5,8 | 4,5 |
| Saúde | 10 | 6,2 | 5,5 | 4,7 |
| Empresas | 5 | 6,0 | 5,2 | 4,6 |

### Por tipo de pedido (pedidos-base)

| Tipo | Peças | Média |
|---|---|---|
| Vários produtos (lista com preço) | 2 | 7,0 |
| Foto boa do cliente | 2 | 7,2 |
| TV em pé | 1 | 6,9 |
| Foto escura e torta | 2 | 6,7 |
| Data comemorativa | 2 | 6,7 |
| Com erro e gíria | 4 | 6,2 |
| Foto com fundo bagunçado | 1 | 6,1 |
| Claro e completo | 6 | 6,0 |
| Longo, do WhatsApp | 5 | 6,0 |
| Vago | 7 | 5,9 |
| Risco legal | 3 | 5,7 |
| Interno (Empresas) e informativo (Saúde) | 0 | não rodou |

O pedido "claro e completo" não sai melhor que o vago. É o sinal de que o motor
descarta os fatos que o cliente deu.

### Por caminho

| Caminho | Peças | Média |
|---|---|---|
| Criação rápida | 39 | 6,2 |
| Campanha do Criar | 7 | 6,9 |
| Campanha de Meus Designs (com "Empresa" preenchida) | 1 | 6,6 |

Nos 7 pedidos que rodaram nos dois caminhos: **Criação rápida 5,6, Criar 6,9.**
Marca 4,3 → 6,4. Fidelidade 4,0 → 7,6. Texto 5,1 → 6,2.

## As 10 piores

| Nota | Peça | Por quê |
|---|---|---|
| 4,3 | C07 cerveja ("promossão de cerveija gelada sabado, ta barato") | Inventou o preço "a partir de R$ 5,90" e "SÓ HOJE" (era sábado). "O menor preço" sem prova. "A EMPRESA" no topo. |
| 5,1 | E02 treinamento de empilhadeira | Virou "Garanta sua inscrição / regularização operacional". Sumiram empilhadeira, data, hora e sala. |
| 5,3 | S15 "clareamento garantido… dinheiro de volta" | Tirou a promessa (certo), mas sumiu o clareamento e inventou "novo espaço" e "tecnologia avançada". Sem aviso ao cliente. |
| 5,3 | C09 WhatsApp do mercado (4 informações) | Ficou só "Aceitamos Pix e vale". Perdeu o novo horário (a notícia), o frango e o WhatsApp. Tela chapada. |
| 5,4 | S05 "faz uma tela legal sobre a clinica" (dentista) | "Consultas, exames e diversas especialidades": serviços que o dentista não tem. |
| 5,4 | E05 "uma tela pra recepção da empresa" | Falou com a equipe ("Bom dia, equipe", "acesse a intranet") numa tela para visitante. |
| 5,4 | C10 marmita (WhatsApp) | Sem o telefone, sem dias, sem horário, sem a G. "Peça pelo WhatsApp no caixa". |
| 5,4 | C02 Ray-Ban de 699 por 499 | "A EMPRESA" no topo; preço 3 vezes; perdeu 10x e a data; foto de laboratório. |
| 5,6 | C06 "uma tela bonita pra loja" (ótica) | "Novidades na loja / lote inédito": não diz que é ótica nem o que vende. |
| 5,6 | C01-v2 pão de queijo (2ª vez) | Igual à primeira, com "A EMPRESA" e uma linha miúda sem sentido. |

## As 10 melhores

| Nota | Peça | Por quê |
|---|---|---|
| 7,4 | C02 pelo Criar | Tudo certo: até 10/11, 10x sem juros, R$ 499 grande, nome da ótica. |
| 7,3 | C01 pelo Criar | Nome da padaria, "SÓ ATÉ 18H", boa foto. Apoio ainda pequeno. |
| 7,3 | C08 bolo ("pedaço 7 reau") | Preço do pedaço como herói, gíria corrigida. |
| 7,3 | C11 prato do dia com foto do cliente | Foto bem usada, preço forte, horário certo. |
| 7,1 | S10 boas-vindas com foto da equipe | Foto bem usada. O véu escuro apaga a cor da marca. |
| 7,0 | C07 pelo Criar | "Só neste sábado" e nenhum preço inventado. Tela vazia. |
| 7,0 | C19 três armações com preço | Lista bem montada. Inventou detalhe ("preto fosco"). |
| 7,0 | C20 cardápio do café | Lista certa. Título errado e metade vazia. |
| 7,0 | E07 refeitório fecha 13h30 | Claro e certo. Vazio. |
| 7,0 | S15 pelo Criar | A conversa explicou a regra do CFO e propôs texto seguro. |

Mesmo as melhores ficam em "freelancer bom". Ao lado das telas de referência
(c1-oferta, s2-campanha, e1-acidente) falta: preço e número como herói de verdade,
letra de apoio grande, nome da marca, e a tela ocupada.

## O que mais falha, e onde está a causa

1. **Letra pequena (Leitura 4,6).** A menor letra fica entre 1,8% e 2,3% da altura
   em todas as peças. Kicker, apoio e chamada não se leem a 4 m.
   - `js/regras-composicao.js:32` — `letraMin: 14` (14 px = 1,3% da altura). A régua
     do QA pede 49 px (4,5%) e corpo de 81 px (7,5%). A porta aprova o que a régua reprova.
   - `server/compositor.js:58` — "Kicker pequeno, espaçado" nas regras da IA.
   - A biblioteca-ouro (`pecas-ouro/*.html`) que a IA imita: kicker de `1.35cqw`
     (26 px), apoio de ~2,7%. A IA copia o tamanho.
   - Contraste abaixo de 4,5 em 15 de 47 peças: o kicker e a 2ª linha do título na cor
     de apoio sobre a cor da marca (amarelo sobre laranja ou vermelho, verde sobre cinza).

2. **O pedido se perde (Fidelidade 6,2; no diretor, 4,0 nos pares).**
   - `server/ai-director.js:136-138` — o plano só tem kicker (1–3 palavras), título
     (2–5) e apoio (até 9). Não há lugar para preço, "de/por", data, horário,
     local, telefone. Datas e prazos caem primeiro (C14, C15, S01, S02, E02).
   - `web/src/pages/CriacaoRapidaPage.jsx:227` — 1 peça por padrão. Um WhatsApp com 4
     avisos vira 1 aviso, e o motor escolhe o menos importante (C09).
   - Nada confere, no fim, se cada fato do pedido está na peça.

3. **A IA inventa e a peça vai assim mesmo.**
   - C07: o compositor pôs "a partir de R$ 5,90" (o "a partir de" é do exemplo-ouro
     da ótica). `server/compositor.js:139` manda usar só os textos aprovados, mas a
     porta (`server/compositor.js:395-428`) confere forma, letra e lei — não confere
     se o texto da peça é o aprovado.
   - A conferência viu e só **avisou** ("o preço R$ 5,90 não estava no seu pedido").
     A Criação rápida só barra bloqueio (`web/src/pages/CriacaoRapidaPage.jsx:327`).
   - Também inventou "HOJE ÀS 18H" (C05), "hoje" (C14, C16), "sem filas" (S01),
     "novo espaço" (S15), "intranet" (E05).
   - Falso positivo: "pedaço 7 reau" (C08) gerou o aviso "R$ 7,00 não estava no pedido".

4. **A marca não aparece (Marca 4,8).**
   - `web/src/pages/CriacaoRapidaPage.jsx:283-289` não manda `empresa` ("a Marca já
     sabe", diz o comentário).
   - `server.js:2062` só lê `b.empresa`; não usa o nome salvo na Marca.
   - `server/ai-director.js:227` escreve "Empresa: (não informada)";
     `server/compositor.js:130` escreve "a empresa". A IA põe "A Empresa" no campo
     de marca da peça (C02, C07, E04, S08, C01-v2).
   - `server/ai-director.js:1222` (`marcaDoPlano`) leva cores e fontes, mas não o nome.
   - Prova: o Criar (que lê o nome) e Meus Designs com "Empresa" preenchida mostram o nome.
   - Na TV em pé, o rodapé do layout `portrait-hero` sai roxo do MultiTelas, não na cor da marca.

5. **A frente não chega ao diretor.**
   - A rota (`server.js:2061-2100`) não passa o perfil; o `base` do compositor
     (`server/ai-director.js:1444-1447`) também não. Em `server/compositor.js:422` a
     régua roda com perfil vazio. O Criar passa (`server/ecossistema.js:132`).
   - Efeito: "Seu cuidado continua **garantido**" numa clínica (S07) passou; a régua de
     Saúde barraria. O dentista virou clínica geral (S05). A recepção virou comunicado interno (E05).

6. **A régua legal não conhece "o mais barato".**
   - `js/regras-de-conteudo.js:96` (`TODAS`) não tem superlativo de preço ou de
     qualidade sem prova (CDC art. 37).
   - "O mercado mais barato da cidade." foi para a TV palavra por palavra pelo Criar
     (C16-criar). O diretor trocou por "o menor preço", que é a mesma alegação.
   - O que funcionou: o Criar explicou a regra do CFO e reescreveu o clareamento
     (S15-criar). O diretor tirou o 12x e o "sem custo" do dentista (S09), mas calado.

7. **Tela vazia e sempre o mesmo desenho (Composição 5,2; Variedade 2,8).**
   - Sem foto, a peça usa o modelo feito para foto: texto à esquerda e metade
     direita vazia (C05, C06, C10, C17, S02, S05, E02).
   - Mesmo pedido 3 vezes: mesmo layout, mesmo título ("Pão de queijo em dobro" ×3;
     "O expediente pede pausa" ×2). `server/compositor.js:391` usa temperatura 0,6
     com a mesma biblioteca e nenhuma instrução de variar.

8. **Ajustes que o cliente mais pede não funcionam (Ajuste 4,8).**

   | Pedido | Média | O que acontece |
   |---|---|---|
   | "tá muito escuro" | 8,0 | Passa para o fundo claro. Funciona. |
   | "coloca que é só hoje" | 7,3 | Funciona (ou já estava). |
   | "tira o telefone" | 7,0 | Funciona. |
   | "mais chique" | 5,5 | Fica chique, mas troca as cores da marca por preto e dourado, toda vez. Numa peça, desfez o "tá escuro" anterior. |
   | "tira o 10x" | 3,0 | Responde "O que você quer mudar?" (o 10x nem estava na peça). |
   | "deixa o preço maior" | 2,9 | "Não mudo tamanho; peça no Editar com a IA da campanha". A peça da Criação rápida não tem esse editor. Uma vez contornou pondo o preço no título. |
   | "troca a foto" | 2,0 | Pergunta genérica. Não troca. |

   - `server/ajuste-peca.js:155` (`TAMANHO`) — a resposta manda para um editor que não existe
     para esta peça.
   - `server/ajuste-peca.js:24-40` — a IA pode devolver qualquer cor; nada diz "mantenha as cores da marca".

9. **Foto do cliente usada como veio.** A escura e torta saiu escura e torta (C12, S11).
   A do balcão bagunçado mostrou o cardápio de outra marca, "$10.99" e um telefone (C13).
   `server/ai-director.js:1290-1296` põe a foto do pedido em todas as peças sem olhar.

10. **Rótulo de foto vaza para outro pedido.** "No nosso novo balcão" (C05-v2) veio do
    rótulo da foto de outro pedido. `server/ai-director.js:217-222` lista todas as fotos
    do acervo, com rótulo, em todo plano.

11. **Custo de texto alto e sem cache.** Cada peça manda ~56 mil tokens (a biblioteca-ouro
    inteira). Em 235 chamadas, 3,4 milhões de tokens de entrada e **zero** em cache.
    `server/compositor.js:100-112` (`fixo`) e `server/motores.js:218`. Uma composição
    custa R$ 0,12; com refação, R$ 0,25.
    - `server.js:724` grava uma estimativa fixa de R$ 0,05 por chamada do diretor, até
      quando a IA falha: 31 chamadas falhas gravaram R$ 1,55 sem gasto real.

## O que mudar no motor da IA (em ordem de impacto)

1. **Régua de letra no motor.** `letraMin` para 49 px (4,5%) e corpo ≥ 81 px na
   porta e no detector. Refazer a biblioteca-ouro com os tamanhos das telas de
   referência. *Impacto:* Leitura de 4,6 para ~8; Estética +1; é o maior ganho sozinho.
2. **Fatos do pedido como campos obrigatórios.** O plano devolve `fatos` (preço,
   "de/por", data, horário, local, telefone, condição). A peça tem de mostrar cada
   um; a porta confere e refaz se faltar. Quando o pedido tem mais de uma mensagem,
   propor 2 ou 3 peças em vez de cortar. *Impacto:* Fidelidade ~6 → ~8,5; Texto +1.
3. **Nada fora do aprovado.** A porta do compositor recusa texto que não é dos textos
   aprovados nem rótulo do desenho. Preço, data ou hora que o cliente não disse barra,
   não só avisa. *Impacto:* acaba o C07 (preço inventado na TV).
4. **Nome da marca sempre.** Na rota do diretor, `empresa = b.empresa || marca.nome`;
   `marcaDoPlano` leva o nome e o logo. Nunca "a empresa" como padrão. *Impacto:*
   Marca 4,8 → ~7; some o "A EMPRESA".
5. **A frente no diretor.** Passar o perfil para o plano (o `paraIA` de `js/perfil.js`) e
   para a régua do compositor. *Impacto:* Propósito e Legal em Saúde e Empresas
   (o "garantido" da clínica, o dentista com "exames").
6. **Superlativo sem prova na régua legal.** "Mais barato", "menor preço", "melhor do
   Brasil", "mais rápida": bloquear ou trocar, com o porquê para o cliente. *Impacto:* Legal.
7. **Peça sem foto que ocupa a tela.** Modelos tipográficos de verdade: preço herói,
   número herói, lista. Proibir metade vazia. Para variar, sortear a família do
   desenho e dizer qual não repetir. *Impacto:* Composição +1,5; Variedade 2,8 → ~7.
8. **Ajustes de desenho pela peça.** "Preço maior" e "troca a foto" redesenham a peça
   com o `ajusteDesenho` que já existe (`server/compositor.js:153`), também em Meus
   Designs. "Mais chique" mantém as cores da marca. *Impacto:* Ajuste 4,8 → ~8.
9. **Conferir a foto do cliente.** Com visão: escura, torta, texto de outra marca.
   Clarear, endireitar, recortar, ou avisar. Rótulo de foto só entra no plano quando
   a foto é escolhida. *Impacto:* Propósito e Estética nas peças com foto.
10. **Cortar o custo de texto.** Cache explícito do Gemini para o `fixo`, ou mandar só
    3 ou 4 exemplos da família certa. Não gravar estimativa quando a chamada falha.
    *Impacto:* ~-70% no custo de texto por peça; extrato honesto.

## Segurança legal e fatos inventados (conferência)

| Caso | O que saiu |
|---|---|
| "mais barato da cidade" (C16) | Diretor: "o menor preço" (passou). Criar: "O mercado mais barato da cidade." (passou). |
| cerveja "ta barato" (C07) | Diretor inventou "o menor preço" e R$ 5,90. Criar: certo, sem preço. |
| chopp "de R$ 12 por R$ 6" sem condição (C17) | Não inventou condição. Certo. |
| clareamento garantido (S15) | Diretor tirou a promessa calado e inventou fatos. Criar explicou e reescreveu. Certo. |
| 12x e avaliação "sem custo" do dentista (S09) | Tirou, sem dizer ao cliente. |
| Saúde: "continua garantido" (S07) | Passou (a régua de Saúde não rodou: perfil vazio). |
| "remédio que cura gripe" (S14), "100% de sucesso" (S16) | Não rodou (crédito da IA acabou). |

Avisos da conferência que o cliente veria no fim: preço inventado (C07), horário
inventado (C05, C05-v3), "4%" (E09, certo: 98 − 94) e um falso positivo (C08).

## Tempo e custo

- Criação rápida: **31 s** em média até a peça pronta (plano ~12 s + gerar ~20 s; máx. 46 s).
- Criar: 29 s para gerar, fora a conversa.
- Custo gravado por peça: R$ 0,26 sem foto; R$ 0,59 com foto gerada; Criar R$ 0,27.
- **Total do bloco: R$ 18,59** no `uso_ia`. Divisão: texto medido em tokens ~R$ 7,96;
  fotos R$ 4,55 (estimativa de R$ 0,35 cada); estimativas fixas por chamada R$ 6,10.
  13 fotos geradas.

## Limites do teste

- **Parou no meio.** A chave do Gemini (dividida com outro bloco) ficou sem crédito
  pré-pago às 05:48. O servidor respondeu "A IA está fora do ar agora… tente de novo
  daqui a pouco" (`server/motores.js:122`) e cada tentativa ainda gravou R$ 0,05.
- **Rodaram 35 dos 60 pedidos:** os 20 de Comércio, 10 de Saúde (S01, S02, S04, S05,
  S07, S08, S09, S10, S11, S15) e 5 de Empresas (E02, E04, E05, E07, E09). Não rodaram:
  S03, S06, S12, S13, S14, S16–S20 e E01, E03, E06, E08, E10–E20. Por isso **faltam
  os tipos Interno (Empresas) e Informativo (Saúde)**, a "cura da gripe" e o "100%".
  Empresas tem só 5 peças: a média dela é a menos firme.
- **Variedade:** 2 dos 5 grupos (C01 e C05). **Criar:** 7 dos ~15. **Meus Designs:** 1.
  **Ajustes:** 7 peças × 3 = 21 (todas de Comércio; o Editar com a IA do Criar não rodou).
- Para caber no teto, 21 dos 35 pedidos rodaram "sem foto" (o padrão da Criação rápida é
  gerar foto) e o cartão do Criar foi cortado para 1 peça. Peças com foto saem um
  pouco melhores; a média com foto em tudo deve subir de 0,3 a 0,5, não mais.
- E05 rodou na conta da Rota Sul (corrida no robô); o pedido é neutro.
- O robô marcou "texto cortado" em kickers; conferido no olho, era falso positivo e
  não entrou na nota.
- As fotos "do cliente" são fotos do repositório e de referências, pioradas de
  propósito (escura, torta, bagunçada).
- Nota de olho é de um avaliador só. As âncoras ajudam, mas há margem de ±0,5.

## Arquivos

Na pasta do robô (`scratchpad/b2` desta sessão):

- `folhas/*.jpg` — as folhas de contato: cada peça com o pedido, a nota, o custo e o
  porquê (comercio-1, comercio-2, saude-1, empresas-1, criar-1, meusdesigns-1, ajustes-1, ajustes-2).
- `fotos/*.png` — a TV de cada peça, em tamanho real.
- `resultado.json` — medidas e notas de cada peça; `notas.json`, `notas-aj.json`, `notas-var.json`.
- `casos.js` (os 60 pedidos), `gerar.js`, `criar.js`, `ajustes.js`, `tv.js`, `medir2.js`, `avaliar.js`, `folhas.js`.
