# Bloco 1: a TV — resultado

Feito em 05/11, num servidor local, com três contas (Padaria Sol, Clínica
Vida, Metalúrgica Alfa), cada uma com a marca preenchida, e TVs reais
(player) deitada, em pé e quadrada. Foram 165 fotos medidas pela régua
([REFERENCIAS.md](REFERENCIAS.md)): a menor letra ≥ 4,5% do lado menor da TV,
o texto corrido ≥ 7,5%, nada cortado, contraste ≥ 4,5. As 26 telas prontas e
os 43 modelos de peça passaram pela bancada, e os estados da TV foram
fotografados. O padrão de comparação são as
[telas de referência](telas-referencia/).

**Nota do bloco: 4,5 / 10.** As telas de referência ficam em 9. O
funcionamento é bom; o que a TV mostra ainda não tem nível profissional.

## O que a medição mostrou

**Os tipos de conteúdo com conteúdo de verdade passam na régua em 22 de 144
casos:**

| Formato de zona | Passam | Menor letra (mediana) |
|---|---|---|
| Tela cheia | 8 de 24 | 3,7% |
| Principal num layout com zonas | 6 de 24 | 3,3% |
| Em pé | 5 de 24 | 3,3% |
| Quadrada | 3 de 24 | 3,2% |
| Bloco pequeno (mosaico 2×2) | 0 de 24 | 2,3% |
| Lateral (alta e estreita) | 0 de 24 | 1,7% |

As que passam são as de pouco texto: frase do dia, redes sociais, quiz e
indicador em tela cheia.

**O que o "Adicionar" põe na TV antes de a pessoa editar** (21 tipos): nenhum
passa.
- Uns mostram texto padrão: "Novo comunicado", "Aviso importante", "Novo poster", "Produto", "Meta do mês 0", "Siga-nos".
- Outros mostram tela vazia ou um aviso técnico: frase, quiz, vídeo, página web, editor livre, "Imagem indisponível", "Carregando clima…" e QR em branco.

## As 7 causas (do maior impacto para o menor)

1. **A letra tem teto em pixel e encolhe com a zona.** O CSS usa `clamp(px mínimo, % da zona, px máximo)`. Exemplo: o corpo do comunicado vai de 15 a 44 px (`css/player.css:1232`, e o mesmo padrão nas outras 279 regras com `cq*`). Em tela cheia o texto para em 44 px (4,1%); numa zona estreita cai a 15 px (1,4%). Falta um piso ligado à TV (4,5% do lado menor) e um teto que cresça com ela.
2. **A zona não recompõe, só encolhe.** A lateral e o bloco pequeno recebem a mesma peça da tela cheia, reduzida. Os melhores mudam a composição pelo formato: escondem o texto de apoio, empilham, deixam só o número ou o preço.
3. **A marca não entra por padrão.** O tema padrão é o roxo `dark-premium` (`js/theme.js:207`). As cores da marca só entram se a pessoa marcar "Com as cores da minha marca nos destaques" em Ajustes da tela (`web/src/components/content/SettingsForm.jsx:208`). Nas 165 fotos, todas as contas saíram roxas, embora as três tenham marca preenchida. Com o tema da marca ligado à mão, a cor muda (a padaria fica terracota), mas o Aviso Premium continua com a cor fixa de cada tipo (evento roxo, comunicado azul) e a letra continua do mesmo tamanho.
4. **O padrão do "Adicionar" é texto de exemplo ou vazio** (`make()` em `web/src/lib/contentTypes.js`). Basta publicar antes de editar para a TV mostrar "Novo comunicado".
5. **A marca se repete e a zona vazia vira enfeite.** No layout Corporativo, o nome aparece no cabeçalho, na lateral vazia (em letras enormes, com a data) e no rodapé: três vezes na mesma tela.
6. **A régua interna é frouxa.** A bancada e a conferência das peças aceitam letra de 14 px (`js/regras-composicao.js`, `js/peca-conferir.js`). A régua profissional pede 49 px numa TV 1080p. Por isso a bancada aprova 2004 montagens com só 1 defeito, e a TV continua pequena.
7. **As telas prontas são densas.** O visual é rico (paleta, foto, hierarquia), mas cada tela tem 10 a 20 textos miúdos, de rodapé, letreiro, rótulo e selo. É o contrário de "uma mensagem por tela". As em pé ficam quase vazias, com texto pequeno no meio.

## Notas por item

| Item | Nota | Em uma frase |
|---|---|---|
| Tipos de conteúdo, no padrão do "Adicionar" | **2** | Texto de exemplo ou tela vazia |
| Tipos, com conteúdo real, em tela cheia | **5** | Frase, redes e indicador bons; texto, aviso, promoção e cardápio pequenos; QR em branco |
| Tipos, na principal de um layout com zonas | **4** | Letra a 3,3%; a marca três vezes na tela |
| Tipos, na lateral e no bloco pequeno | **2** | Encolhem até ficar ilegíveis; fotos cortadas |
| Tipos, em pé e quadrada | **4** | Mesmo problema da letra; sem composição própria |
| Layouts (14) | **4** | A zona vazia vira enfeite; não há formato próprio para cada zona |
| Modelos de peça da IA (43) | **5,5** | Bem desenhados, mas a régua interna aceita 14 px |
| Telas prontas (26) | **5** | Ricas e densas, com micro-texto; só 1 aprovada; as em pé fracas |
| Marca do cliente na TV | **2** | Não entra por padrão |
| Faixas (cabeçalho, letreiro) | **4** | Texto pequeno; repetem a marca |
| Estado: código de pareamento | **8** | Código grande, QR, instrução clara |
| Estado: espera ("Tudo certo") | **6** | Correto, mas pequeno e genérico; podia mostrar uma tela pronta da frente |
| Estado: sem internet | **8** | Segue mostrando o que tinha |
| Estado: TV removida | **8** | Volta sozinha para o código |
| Estado: 2ª TV no plano grátis | **6** | O painel recusa, mas a TV fica no código sem dizer por quê |
| Funcionamento (troca chega, não trava) | **9** | A troca chega em poucos segundos; 25 min de carga sem erro no QA anterior |

O movimento e o tempo de cada peça ficam no [bloco 3](BLOCO-3-PROGRAMACAO.md).

## O que fazer (detalhe no plano de ação)

1. **Escala de letra da TV.** O piso é 4,5% do lado menor da TV e o corpo fica em 7,5% ou mais. Isso troca os tetos em pixel. Onde não couber, a peça recompõe ou corta o apoio, e não encolhe.
2. **Composição por formato de zona.** São cinco formatos: larga, alta, quadrada, faixa e bloco. Cada tipo e cada modelo de peça diz o que mostra em cada um.
3. **A marca entra sozinha.** Com a marca preenchida, o tema padrão passa a ser o da marca.
4. **Nada de texto de exemplo na TV.** O "Adicionar" pede o conteúdo antes de publicar, ou já entra com um exemplo da frente, bom e marcado para trocar.
5. **A zona vazia some ou recebe algo útil** (hora, clima, um modelo da frente), e a marca aparece uma vez por tela.
6. **A régua interna sobe para a profissional:** a conferência das peças e a bancada passam a usar 4,5% e 7,5%.
7. **Telas prontas reconstruídas** com menos texto, no nível das telas de referência, e uma versão para cada orientação.
