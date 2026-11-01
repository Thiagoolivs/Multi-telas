# Marca MultiTelas — guia de uma página

O QA de 26/10 achou quatro identidades no mesmo produto: o logo (tinta e
lima), a landing (creme, azul e amarelo), o painel (violeta, letra do
sistema) e a TV (azul-marinho de template). Este guia é a régua única.

## Cores

| Papel | Nome | Hex | Onde |
|---|---|---|---|
| Marca 1 | **Tinta** | `#0E0B1F` | texto principal, fundos escuros, o quadrado do logo |
| Marca 2 | **Violeta** | `#5B2EFF` | ação: botão principal, link, aba ativa, foco |
| Destaque | **Lima** | `#C6F432` | grifo, selo, número em destaque — **nunca** texto sobre branco |
| Neutro | Cinza | `#86858F` | a barra de baixo do logo; texto de apoio usa os cinzas do painel |

Regras:

- **Violeta só onde se toca.** Um botão principal por tela.
- **Lima é tempero.** Sobre fundo escuro (tinta) ou atrás de texto tinta;
  sobre branco ela some (contraste 1,3:1).
- Contraste mínimo de 4,5:1 para texto. Branco no violeta dá 6,4:1; tinta na
  lima dá 15:1.
- No escuro, o violeta clareia para `#9277FF` (texto escuro em cima, 6:1).

## Letra

- **Outfit**, uma família só, em 400, 500, 600 e 700 (`fonts/marca/`).
- Título: 600–700, entreletra levemente fechada. Texto: 400. Rótulo: 500.
- No celular, nada abaixo de **13 px** (painel: `text-2xs`/`text-xs` crescem
  sozinhos abaixo de 640 px).
- As peças das TVs continuam com o catálogo próprio (`js/fontes.js`): a marca
  é do produto, a peça é da loja do cliente.

## Forma

- Raio: 8 px em controles, 14 px em cartões, 999 px em selos.
- Sombra: só para o que flutua (diálogo, menu). Cartão usa borda, não sombra.
- Alvo de toque: 44 px no celular.

## Onde mora cada coisa

| Superfície | Arquivo |
|---|---|
| Painel | `web/src/index.css` (tokens `--c-*`), `web/tailwind.config.js` |
| Landing | `landing/tailwind.config.js` (`mt-*`), `landing/index.html` (`<style>`) |
| TV (tema padrão) | `js/theme.js`, preset `dark-premium` |
| Logo | `icons/icone.svg`, `web/src/components/layout/SimboloMarca.jsx` |
