# Bloco 1: a TV — reteste (fase 10)

Feito em 05/11, de novo, num servidor local (porta 5971, banco próprio).

**Nota do bloco: 6,5 / 10** (era 4,5). A conta dá 6,7: o conteúdo (itens 1 a 10) pesa o dobro dos estados (11 a 16), como no original, e arredondo para baixo ao meio ponto, como lá.

A TV melhorou muito em letra, marca e zona vazia. O que a segura abaixo de 9:
- a TV quadrada encolhe toda peça em HTML;
- o contraste da cor da marca;
- as telas prontas.

## Método

- Três contas com a marca preenchida e plano Pro: Padaria Sol (comércio), Clínica Vida (saúde) e Metalúrgica Alfa (empresa).
- Cada conta tem três TVs reais (o player): deitada 1920×1080, em pé 1080×1920 e quadrada 1080×1080, ligadas pelo código.
- O conteúdo vai por `PUT /api/devices/:id/config`. As telas prontas e as peças são montadas com o mesmo código do painel (`montarTela`, `aplicarTelaPronta`, `itemDoModelo`).
- Medi no navegador cada texto visível, também dentro das peças (shadow DOM): a letra em % do lado menor da TV (com a escala), se sai da zona ou é cortado, e o contraste contra o fundo da foto.
- A régua é a do original: menor letra ≥ 4,5%, texto corrido ≥ 7,5%, nada cortado, contraste ≥ 4,5. Desde a fase 3 a TV usa o piso do lugar: balcão 4,5%, recepção 3,5%, escritório 3%. A frente dá o padrão. Por isso dou os dois números.
- Foram cerca de mil medições: 243 dos tipos, mais 243 com "balcão" forçado, 137 das telas prontas, 129 das peças na TV, 96 dos layouts, 57 dos estados e 129 páginas da bancada (43 peças × 3 lugares).

## O que a medição mostrou

### Os tipos, com conteúdo de verdade

São os 17 tipos com texto que o "Adicionar" oferece em cada frente: 6 no comércio, 6 na saúde e 5 na empresa.

| Formato de zona | Tamanho | Régua do QA (≥ 4,5%, nada cortado) | Piso do lugar | Com "balcão" em todas | Contraste ≥ 4,5 em todo texto | Menor letra (mediana) |
|---|---|---|---|---|---|---|
| Tela cheia | 1896×1056 | **12 de 17** (eram 8 de 24) | 17 de 17 | 17 de 17 | 6 de 17 | 4,5% (era 3,7%) |
| Principal com zonas | 1379×784 | **9 de 17** (eram 6 de 24) | 17 de 17 | 17 de 17 | 6 de 17 | 4,5% (era 3,3%) |
| Em pé | 1038×1878 | **10 de 17** (eram 5 de 24) | 17 de 17 | 17 de 17 | 6 de 17 | 4,5% (era 3,3%) |
| Quadrada | 1056×1056 | **8 de 17** (eram 3 de 24) | 17 de 17 | 17 de 17 | 6 de 17 | 3,7% (era 3,2%) |
| Bloco (Dois quadrados) | 942×1056 | **6 de 17** (eram 0 de 24 no 2×2) | 17 de 17 | 17 de 17 | 6 de 17 | 3,7% (era 2,3%) |
| Bloco (Em pé, duas zonas) | 1038×851 | 8 de 17 | 17 de 17 | 17 de 17 | 6 de 17 | 3,5% |
| Lateral (Corporativo) | 506×784 | **5 de 17** (eram 0 de 24) | 16 de 17 | 14 de 17 | 6 de 17 | 3,5% (era 1,7%) |
| Lateral (Painel Notícias) | 495×1056 | 5 de 17 | 16 de 17 | 16 de 17 | 6 de 17 | 3,5% |
| Bloco 2×2 (oculto) | 942×522 | 5 de 17 | 16 de 17 | 15 de 17 | 6 de 17 | 3,5% |

- **Nos seis formatos do original:** passam 50 de 102 na régua de 4,5% (eram 22 de 144), e 101 de 102 no piso do lugar.
  - Contando também os tipos que saíram do catálogo (texto, frase) e os de outra frente: 74 de 162 e 161 de 162.
- **Na régua de 4,5%, quem reprova é a saúde e a empresa,** porque o padrão delas é 3,5% e 3%. O comércio passa em 6 de 6 em todo formato, menos o cardápio de 9 itens na lateral, que cai a 2,4%.
  - Com "balcão" escolhido, a saúde e a empresa também passam. O sistema consegue: o padrão é que é menor.
  - O piso da recepção (3,5%) e o do escritório (3%) ficam entre o mínimo e o conforto da tabela 6.1 para uma TV de 50". É defensável, mas não é a régua de 4,5%.
  - A empresa nasce "escritório" (3%) mesmo na TV do chão de fábrica ou do refeitório (`js/player.js:92`).
- **O contraste reprova 11 de 17 tipos,** em todo formato. Passam o aviso e o QR. Reprovam a promoção, a lista de preços, o quiz, o indicador e as redes.
  - O preço, o @, o título do quiz e a seta do indicador saem na cor da marca, entre 2,5 e 4,3 contra o fundo.
  - Exemplo: o preço verde-azulado da clínica sobre o fundo escuro dá 2,6.
- **Texto corrido ≥ 7,5%:** 0 de 6. O corpo do aviso e do texto fica no piso (3,9 a 4,5%), e o título em 8,3%, abaixo dos 10% da régua. A frase do dia chega a 12,3%.
- **Nada cortado:** 0 cortes em 243 fotos (com "balcão" forçado, 1, no 2×2 oculto). Na lateral, a foto da promoção vira uma tira de 150 px.

### O que o "Adicionar" põe na TV antes de editar

São 15 tipos (14 na empresa), nas três contas.
- **Texto de exemplo na TV: 0 de 44.** Os 6 tipos com exemplo (5 na empresa) não vão ao ar. A TV mostra a hora e a data na cor da marca, grandes e limpas.
- Os outros 9 ainda mostram vazio ou um recado técnico:
  - "Imagem indisponível";
  - vídeo, YouTube e composição em branco;
  - "Escolha um mural nas configurações desta tela.";
  - "Envie um arquivo (.pptx/.pdf)";
  - "Entrada de vídeo indisponível";
  - "Carregando clima…" (1 de 3);
  - "🎂 Em breve, novos aniversários".
  - O código está em `js/render.js:204`, `:326`, `:640`, `:1692` e `:1812`.

### Peças-ouro (43)

| Onde | Deitada | Em pé | Quadrada |
|---|---|---|---|
| TV real, tela cheia (destaque e lateral), piso do lugar | 31 de 32 | 29 de 32 | **0 de 32** (mediana 2,5%) |
| TV real, cabeçalho | 4 de 6 | 4 de 6 | 0 de 6 |
| TV real, rodapé | 4 de 5 | 5 de 5 | 0 de 5 |
| TV real, contraste ≥ 4,5 em todo texto (tela cheia) | 8 de 32 | 8 de 32 | 8 de 32 |

- **Bancada, no balcão (4,5%):**
  - tela cheia 95 de 96;
  - destaque do Corporativo 21 de 32;
  - lateral 6 de 17;
  - cabeçalho 3 de 6 (16:9) e 4 de 6 (em pé);
  - rodapé 5 de 5 e 4 de 5.
- **Bancada, no escritório (3%):** 32 de 32 no destaque e 17 de 17 na lateral. Na recepção, 32 de 32 e 10 de 17.
- **A bancada não vê o problema da quadrada.** Ela desenha a 1:1 em 1080×1080, e a TV real desenha outra coisa (ver causa 1).
- Na TV de 4K, a mesma causa põe o piso em dobro. A peça cede para 53 a 69% e a letra fica em 4,8%: passa por acaso, apertada.

### Telas prontas (53: 26 dos lotes 0 e 1, e 27 do lote 2)

Medi cada tela na TV da orientação dela, em cada peça do revezamento.

| Grupo | Telas | Régua de 4,5% e nada cortado | Piso do lugar | Contraste ok | Menor letra (mediana) |
|---|---|---|---|---|---|
| Lotes 0 e 1, deitada | 22 | 2 | 11 | 12 | 3,5% |
| Lotes 0 e 1, em pé | 4 | 1 | 3 | 0 | 3,5% |
| Lote 2, deitada | 9 | 0 | 2 | 5 | 3,1% |
| Lote 2, em pé | 9 | 0 | 4 | 5 | 3,5% |
| Lote 2, quadrada | 9 | 0 | **0** | 8 | **2,0%** |
| **Total** | **53** | **3** | **20** | **30** | |

- **Aprovada: 1 de 53**, a da ótica. É a única que o cliente vê, e aparece também para a padaria ("Óculos de sol 30% off" na Padaria Sol). Na saúde e na empresa não há nenhuma.
- **Nenhuma tela tem `paraComecar`.** A TV nova fica no "Tudo certo" da MultiTelas (`web/src/lib/telasProntas.js:250`).
- **Texto sobre texto:**
  - o cabeçalho clássico cola o nome e a chamada: "PADARIA SOLSEMANA DO SOL" e "FIQUE SABENDOESTA SEMANA";
  - "DA MANHÃ" encosta no "R$";
  - "A partir de / 10x de" fica sob o preço (vitrine);
  - "Funcionamento" fica sobre "Sábado" (totem).
- **Textos do cliente apagados: 12, em 9 telas.** São textos como "Avaliação com o dentista", "da clínica", "Só no salão" e "preço de farmácia de bairro".
  - A causa: os ids das marcas de exemplo são palavras comuns ("dentista", "farmacia", "clinica", "salao"), e o filtro apaga todo texto que os contém (`web/src/lib/telasProntas.js:120`). No dentista sobra um "•" vazio.
- **Buracos:**
  - a foto da oferta some (metade da zona vazia);
  - a lateral "Reserve pelo QR" fica sem QR;
  - há uma faixa escura onde o palco da peça não cobre a zona (`js/peca-render.js:283`).
- **Datas vencidas:** "Outubro Rosa" em novembro, "Termina no sábado 31/10" e o feriado de 02/11.
- **Na clínica e na indústria, a data aparece duas vezes:** no cabeçalho e no rodapé.
- **O dentista anuncia "10× sem juros"** no clareamento. A REFERENCIAS (3.2, CFO 196/2019) pede sem preço promocional.

### Layouts, faixas e marca

- **A zona vazia some** em todos os 16 casos com só a principal. A lateral, a de baixo e o rodapé sem mensagem (quando há cabeçalho) saem.
- **A marca aparece no máximo uma vez** por tela, pelo sistema (era três no Corporativo).
- **O cabeçalho e o letreiro** ficam no piso do lugar: 4,5% no comércio, 3,5% na saúde e 3% na empresa.
- **A cor da marca está nas 243 fotos dos tipos** (era 0 de 165). O aviso usa a marca. A espera "Tudo certo" continua MultiTelas, em azul e roxo.

### Estados e funcionamento

- **Código:** o código tem 16 a 20% e há QR. A instrução fica em 2,4% (deitada) e 1,8% (em pé e quadrada), e "Gerar outro código" em 1,2 a 1,5%.
- **Espera:** o título tem 3 a 3,7% e o texto 1,8 a 2,4%. Mostra a logo da MultiTelas, igual ao original. Numa das 6 TVs, o código ainda estava na tela 6 s depois de ligar.
- **Troca:** 1,9 s na primeira e 0,1 a 0,3 s nas seguintes. Nenhum erro de página nas cerca de 900 trocas.
- **Sem internet:** segue mostrando após 25 s. Reaberta sem internet, mostra a última programação. Volta sozinha.
- **TV removida:** volta ao código em 0,5 s.
- **2ª TV no plano grátis:** o painel recusa com uma mensagem clara (402, "limite do plano atingido (1 tela)"). A TV fica no código sem dizer por quê.

## Notas por item

| Item | Antes | Agora | Em uma frase |
|---|---|---|---|
| Tipos de conteúdo, no padrão do "Adicionar" | 2 | **6** | Nenhum texto de exemplo vai ao ar (0 de 44); 9 tipos ainda mostram vazio ou recado técnico |
| Tipos, com conteúdo real, em tela cheia | 5 | **7** | Letra no piso em 17 de 17 (12 de 17 nos 4,5%); contraste da cor da marca reprova 11 de 17; corpo nunca chega a 7,5% |
| Tipos, na principal de um layout com zonas | 4 | **6,5** | 17 de 17 no piso (9 de 17 nos 4,5%); marca uma vez; mesmo contraste |
| Tipos, na lateral e no bloco pequeno | 2 | **6** | 16 de 17 no piso (5 a 8 de 17 nos 4,5%); cardápio de 9 itens a 2,4% na lateral; foto vira tira |
| Tipos, em pé e quadrada | 4 | **6,5** | 17 de 17 no piso (10 e 8 de 17 nos 4,5%); a promoção recompõe na quadrada |
| Layouts (10 visíveis de 14) | 4 | **7** | A zona vazia some e a marca aparece uma vez; não há layout com zonas para a quadrada |
| Modelos de peça da IA (43) | 5,5 | **6** | Deitada 31 e em pé 29 de 32 no piso; na quadrada 0 de 43 (letra a 2,5%); contraste em 8 de 32 |
| Telas prontas (53) | 5 | **4,5** | 3 de 53 nos 4,5% e 20 no piso; quadradas a 2%; 1 aprovada, da ótica; textos sobrepostos, apagados e vencidos |
| Marca do cliente na TV | 2 | **7,5** | Entra sozinha em 243 de 243; acento da marca com contraste baixo; a espera ainda é MultiTelas |
| Faixas (cabeçalho, letreiro) | 4 | **7** | Letra no piso do lugar, marca uma vez, o rodapé vazio sai; o cabeçalho das peças cola nome e chamada |
| Estado: código de pareamento | 8 | **8** | Código grande e QR; instrução a 1,8–2,4% |
| Estado: espera ("Tudo certo") | 6 | **6** | Igual: genérico, da MultiTelas, texto a 1,8–2,4% |
| Estado: sem internet | 8 | **8,5** | Segue mostrando, também reaberta sem internet |
| Estado: TV removida | 8 | **8,5** | Volta ao código em 0,5 s |
| Estado: 2ª TV no plano grátis | 6 | **6** | Igual: o painel explica, a TV não |
| Funcionamento (troca chega, não trava) | 9 | **9** | A troca chega em 0,1 a 1,9 s; nenhum erro de página |
| **Bloco** | **4,5** | **6,5** | |

## O que segura abaixo de 9 (com o lugar no código)

1. **A TV quadrada encolhe toda peça em HTML para 56% do piso.** Vale para as peças-ouro, as telas prontas e as artes da IA: 0 de 43 peças e 0 de 9 telas quadradas passam.
   - `js/render.js:1980` (`escalaDaTela`) trata 1:1 como 16:9, com k = 0,5625. A peça é desenhada maior e reduzida.
   - `js/peca-render.js:280` (`pisoDaZona`) calcula o piso sem essa escala. Na 4K, o mesmo erro põe o piso em dobro.
   - A bancada não vê: `js/bancada.js:203-205` desenha o layout quadrado em 1920×1080. O painel faz o mesmo na prévia e na medida das zonas (`web/src/lib/telasProntas.js:175` e `:267`).
2. **O contraste da cor da marca fica abaixo de 4,5.** Reprovam 11 de 17 tipos e 24 de 32 peças.
   - O destaque das peças vai ao ar com mínimo de 3:1 (`js/tokens.js:105`).
   - O acento do tema, com 3,5 (`js/theme.js:246`).
   - O preço usa esse acento (`css/player.css:1523`). O mesmo vale para o @ das redes, o título do quiz e o kicker.
3. **As telas prontas não estão no nível das de referência.**
   - Só 1 de 53 aprovada, a da ótica, que aparece para a padaria. Nenhuma marcada para começar.
   - Texto sobre texto e o cabeçalho que cola nome e chamada (`pecas-ouro/cabecalho-classico.html:9-17`).
   - 12 textos apagados pelo filtro de exemplo (`web/src/lib/telasProntas.js:120`, com os ids das marcas em `pecas-ouro/manifesto.json`).
   - Datas vencidas, e o dentista com preço parcelado.
4. **O texto corrido e o título ainda têm teto.** O corpo do aviso para em 3,89vmin (`css/player.css:681`) e o título em 8,33vmin (`css/player.css:677`). A régua pede corpo ≥ 7,5% e título de 10 a 14%.
5. **O padrão do lugar é baixo para a saúde e a empresa** (3,5% e 3%, `js/player.js:91-92`). Na régua de 4,5%, a saúde e a empresa reprovam na maioria das zonas. A empresa nasce "escritório" até no chão de fábrica.
6. **A espera e o código** seguem da MultiTelas, com instrução de 1,8 a 2,4% (`player.html:48-50`, `css/player.css:1365` e `:1383`). Sem tela pronta da frente, a TV nova não é do cliente na primeira tela.
7. **O "Adicionar" dos tipos sem texto** ainda põe recado técnico ou tela vazia na TV (`js/render.js:204`, `:1692` e `:1812`).
8. **A 2ª TV no plano grátis** fica no código sem dizer por quê.

## Fotos

Todas ficam em `(fotos e scripts no ambiente do reteste)`.

| Pasta | O que tem |
|---|---|
| `tipos/` | Os tipos, com o lugar da frente (243 fotos e `medidas.json`) |
| `tipos-balcao/` | Os mesmos, com "balcão" em todas (243) |
| `telas/` | As 53 telas prontas, na rodada 0, e `medidas.json` com as 137 medições |
| `pecas-tv/` | As 43 peças nas três TVs (129) |
| `bancada/` | A bancada, uma foto por peça, e as medidas dos três lugares |
| `layouts/` | Os 16 layouts por orientação, cheios e só com a principal (96) |
| `estados/` | Código, espera, "Adicionar", sem internet, removida e 2ª TV grátis (57), e `estados.json` |

As que mostram cada problema:
- **A quadrada:** `telas/l2-padaria-quadrada.png` e `pecas-tv/oferta-foto-quadrada.png`.
- **Texto sobre texto e cabeçalho colado:** `telas/l1-comercio-vitrine.png`, `telas/otica-semana-do-sol.png` e `telas/l1-comercio-totem.png`.
- **Texto apagado e lateral sem QR:** `telas/l2-dentista-deitada.png`.
- **Corte e data vencida:** `telas/l1-comercio-avisos.png`.
- **Contraste:** `tipos/saude-precos__full-principal-deitada.png`.
- **A foto que vira tira na lateral:** `tipos/comercio-promo__corporate-lateral-deitada.png`.
- **A zona vazia que some e a marca uma vez:** `layouts/saude-dashboard-deitada-so-principal.png` e `layouts/empresa-corporate-deitada-cheio.png`.
- **A espera:** `estados/espera-saude-em-pe.png`.
- **O "Adicionar":** `estados/adicionar-comercio-announce.png` e `estados/adicionar-empresa-mural.png`.

Os scripts estão na mesma pasta: `lib.cjs`, `tipos.cjs`, `telas.mjs`, `pecas-tv.mjs`, `bancada.cjs`, `layouts.cjs`, `estados.mjs` e os `analisar-*.cjs`. Nenhum arquivo do repositório foi mexido.
