# Sistema visual do conteúdo pronto (lote 4)

O dono olhou o conteúdo pronto e disse: "feio e infantil". Tinha razão — eram
pictogramas desenhados em CSS sobre fundo pastel, e quase nenhuma foto. O lote 4
(`pecas-ouro/`, `lote: 4`) troca isso por um sistema de **foto + tipografia**,
na linha de vitrine de loja boa, cardápio de rede, revista e grade suíça. Esta
página é a régua dele; a IA e quem desenhar a próxima peça seguem a mesma.

## Cinco princípios

1. **A foto é a protagonista.** Toda peça do lote 4 tem pelo menos um espaço de
   foto (`data-campo-img`), com o papel declarado no manifesto (`fotos`). Sem
   foto, a peça continua de pé no fundo da marca.
2. **Uma ideia por peça.** Um título, um número ou uma frase domina; o resto é
   menor e mais calmo. Quinze palavras no máximo fora do título.
3. **Texto nunca sobre a foto crua.** Ou corte seco (a foto num quadro, o texto
   no fundo cheio ao lado), ou um bloco de fundo cheio com o degradê *fora*
   dele. Quando a letra cresce com o piso da TV, o bloco cresce junto.
4. **Uma cor de acento.** O fundo é escuro ou neutro; a cor da marca aparece
   como acento (`--mt-destaque`): kicker, preço, selo, filete. Nada de fundo
   pastel. O único campo de cor grande é deliberado (`numero-marco`).
5. **A letra da TV manda.** Nenhuma letra abaixo de 4,5% do lado menor da TV
   (48,6 px numa TV de 1080 linhas) — e a peça já nasce desenhada nesse tamanho,
   para o piso (`--mt-piso`) nunca precisar empurrar nada.

## Os dez arquétipos

| | Arquétipo | Peças do lote 4 |
|---|---|---|
| A1 | **Capa** — foto cheia, texto num bloco de fundo cheio preso a um lado | `capa-casa`, `capa-produto`, `capa-campanha` |
| A2 | **Díptico** — foto e texto em corte seco, como página dupla | `diptico-oferta`, `diptico-servico`, `diptico-agenda`, `vaga-foto`, `seguranca-foto` |
| A3 | **Página de revista** — cabeçalho com filete, foto emoldurada, legenda | `editorial-moldura`, `editorial-indice`, `dica-foto` |
| A4 | **O número** — preço, desconto, data ou indicador enorme | `numero-preco`, `numero-dado`, `numero-marco`, `oferta-desconto`, `evento-foto` |
| A5 | **Quadro de cardápio** — linhas de nome e preço com guia pontilhada | `cardapio-quadro`, `cardapio-destaque`, `horario-foto` |
| A6 | **Frase** — a tipografia é a peça; a foto é uma faixa | `frase-faixa`, `recepcao-foto` |
| A7 | **Gente** — retrato grande, nome na letra do título | `gente-retrato`, `editorial-citacao`, `equipe-trio` |
| A8 | **Chamada com QR** — o QR grande sobre fundo cheio, nunca sobre foto | `qr-foto`, `diptico-agenda`, `vaga-foto` |
| A9 | **Grade de fotos** — três ou quatro quadros iguais | `cardapio-trio`, `oferta-dupla`, `mural-foto`, `equipe-trio` |
| A10 | **Aviso** — selo reto, título, explicação, data | `aviso-faixa` |

## Tipografia

As peças só escrevem `var(--mt-fonte-titulo)` e `var(--mt-fonte-texto)`: quem
escolhe a família é a Marca do cliente. Todas as famílias do catálogo
(`js/fontes.js`) vêm do nosso domínio (`fonts/`, SIL OFL 1.1) e funcionam com a
TV sem internet. Os pares que o lote 4 foi desenhado para receber:

| Título | Texto | Para quem |
|---|---|---|
| Oswald (condensada) | Inter | varejo, padaria, ótica, indústria — o padrão de referência |
| Playfair Display (serifada) | Inter | restaurante, salão, ótica de alto padrão |
| Poppins (moderna) | Inter | saúde, clínica, dentista |
| Space Grotesk (tech) | Inter | escritório, contabilidade, tecnologia |
| Anton (display) | Inter | lanchonete, promoção forte |

Não entrou fonte nova: o catálogo já cobre os cinco pares, e uma família nova
precisa ir também ao espelho do painel (`web/src/lib/fontes.js`, comparado por
teste) — fora do escopo deste lote. O título grande sempre multiplica por
`var(--mt-escala-titulo, 1)`, que encolhe a fonte larga da marca para a largura
da condensada.

Regras de desenho: kicker em caixa alta espaçada (.14em) e na cor de destaque;
título em peso 500 com entrelinha justa (.98–1.05) e `text-wrap: balance`;
números com algarismos alinhados; R$ e centavos a um terço do número.

## Cor

- **Base:** o modo `escuro` dos tokens (`js/tokens.js`): fundo quase preto
  tingido pela marca. O `claro` (papel quente, quase branco) serve a uma zona
  editorial; o `marca` (cor chapada) fica para cabeçalho e rodapé.
- **Acento:** só `--mt-destaque` (e `--mt-preco`). Texto sobre o destaque só em
  `--mt-sobre-destaque`. Os tokens garantem 4,5:1 em todo par permitido.
- **Nunca:** hex, rgb, nome de cor, fundo pastel, degradê colorido decorativo.

## Foto

- **Banco:** `pecas-ouro/fotos/<ramo>/` e o índice `pecas-ouro/fotos/banco.json`
  (`id`, `arquivo`, `ramos`, `papel`, `foco`, `descricao`, `credito`, `licenca`,
  `fonte`). Créditos em `pecas-ouro/fotos/CREDITOS.md`. Só CC0 e domínio
  público; foto com marca d'água fica de fora.
- **Papel do espaço** (`fotos` no manifesto): `produto`, `ambiente`, `pessoa` ou
  `textura`. É o que o painel oferece primeiro no "Trocar foto" e o quanto a TV
  aceita cortar antes de mostrar a foto inteira com o fundo desfocado
  (`js/peca-render.js`, `encaixeDaFoto`). Coluna estreita pede `textura` ou
  `ambiente`; retrato pede `pessoa` com o foco no rosto.
- **Saúde:** sem agulha, sangue ou procedimento em close; sem "antes e depois";
  gente sorrindo, ambiente claro, objeto do cuidado (chá, estetoscópio).

## Grade e medidas

- Margem: 6cqw deitada, 7cqw em pé e quadrada, 8cqw na lateral. Filete .14cqw
  (.24cqw em pé) em `--mt-linha`.
- Letra: cada peça declara `--f` (leitura) e `--t` (título) no `.mt-peca` e
  redefine os dois em cada formato — 2,6cqw deitada, 3,5cqw no Corporativo,
  4,6cqw em pé e quadrada, 4,8cqw na faixa baixa, 9,6cqw na lateral: todos
  acima de 48,6 px no tamanho real da zona.
- Formatos por `@container`, nesta ordem: deitada (padrão) · Corporativo
  `(aspect-ratio >= 1.25) and (max-height: 900px)` · faixa baixa da TV em pé
  `(aspect-ratio >= 1.25) and (max-height: 640px)` · em pé `(aspect-ratio < 1.25)`
  · quadrada `(aspect-ratio >= 0.8) and (aspect-ratio < 1.25)` · lateral
  `(max-width: 700px)`.

## O que não fazer

Pictograma ou clip-art como elemento principal; emoji; fundo pastel; texto sobre
foto sem bloco; mais de uma cor de acento; letra pequena "porque cabe"; QR em
duas zonas da mesma tela; na saúde, preço, desconto, "grátis" ou promessa.
