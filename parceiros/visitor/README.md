# MultiTelas RH · página da Visitor

Landing de uma página só, em português, para a Visitor vender o MultiTelas RH
a times de RH e de comunicação interna. A marca na página é **MultiTelas RH**,
"oferecido por Visitor". A Visitor vende, fatura, instala e dá suporte; o
MultiTelas fornece a plataforma.

```
parceiros/visitor/
├── index.html        a página (CSS e o pouco de JavaScript estão dentro dela)
├── img/              telas reais do produto, em WebP, e a imagem de compartilhamento (og.jpg)
├── fonts/            Outfit 400/500/600/700 (SIL OFL 1.1, licença junto)
├── ferramentas/      a receita para refazer as imagens (NÃO sobe para o site)
└── README.md         este arquivo (NÃO sobe para o site)
```

## Como hospedar

1. Preencha os marcadores (abaixo).
2. Suba **`index.html`, `img/` e `fonts/`** juntos, na mesma pasta, em
   qualquer hospedagem estática (a hospedagem do site da Visitor, Netlify,
   S3, cPanel…). Pode ser numa subpasta, por exemplo
   `https://www.visitor.com.br/multitelas-rh/`: todos os caminhos são relativos.
3. Abra a página no celular e no computador e clique em cada contato.

A página não chama nada de fora: sem framework, sem CDN, sem Google Fonts,
sem analytics. Os únicos links externos são os contatos da Visitor e a
política de privacidade e os termos do MultiTelas
(`https://app.multitelas.net.br/privacidade` e `/termos`).

**Dentro do site da Visitor.** Duas formas:

- **Página própria (recomendado):** como no passo 2, com um link para ela no menu do site.
- **Dentro de uma página existente:** copie o bloco `<style>` do `<head>` e
  todo o `<div class="mtrh">…</div>` do `<body>` (com o `<script>` do fim).
  Todo o estilo está preso à classe `.mtrh`, para não mexer no resto do site.
  Ajuste os caminhos de `img/` e `fonts/` se a página ficar em outra pasta. O
  topo da página é fixo (`position: sticky`); se o site já tiver um topo fixo,
  tire a classe `topo` do `<header>`.

Peso: cerca de 60 KB de HTML, 56 KB de fonte e 440 KB de imagens (as da
galeria só carregam quando aparecem na tela).

## Marcadores para preencher

Todo dado da Visitor que ainda não temos está marcado com `data-preencher` e
aparece na tela com um valor de mentira. Procure por `data-preencher` no
`index.html`.

| Marcador | Onde | Valor de mentira hoje | O que pôr |
|---|---|---|---|
| `whatsapp-visitor` | texto visível no bloco "Fale com a Visitor" e no rodapé (2 lugares) | `(11) 00000-0000` | o WhatsApp comercial, como as pessoas leem |
| `whatsapp-visitor-link` | `href` do botão "Chamar no WhatsApp" e do cartão WhatsApp (2 lugares) | `https://wa.me/5511000000000?text=…` | troque só os dígitos: 55 + DDD + número, sem espaço nem traço. A mensagem pronta (`?text=`) pode ficar |
| `telefone-visitor` | texto visível no cartão Telefone | `(11) 0000-0000` | o telefone comercial |
| `telefone-visitor-link` | `href` do cartão Telefone | `tel:+551100000000` | `tel:+55` + DDD + número |
| `email-visitor` | texto visível no cartão E-mail e no rodapé (2 lugares) | `contato@visitor.example` | o e-mail comercial |
| `email-visitor-link` | `href` do cartão E-mail | `mailto:contato@visitor.example?subject=MultiTelas%20RH` | troque só o endereço |
| `razao-social-visitor` | rodapé | `Visitor` | a razão social (quem vende precisa se identificar: Decreto 7.962/2013) |
| `cnpj-visitor` | rodapé | `00.000.000/0000-00` | o CNPJ da Visitor |
| `url-da-pagina` | `<meta property="og:url">` e `og:image` no `<head>` (2 lugares) | `https://www.visitor.example/multitelas-rh/` | o endereço público da página; em `og:image`, o mesmo endereço + `img/og.jpg`. É o que aparece quando alguém cola o link no WhatsApp ou no LinkedIn |

Todos os botões "Falar com a Visitor", "Pedir o teste" e "Consultar
condições" levam ao bloco de contato (`#contato`) e não precisam de ajuste.

**Logo da Visitor.** Não temos: a página escreve "Visitor" em texto. Quando
houver logo, ele pode entrar ao lado de "oferecido por Visitor" no topo
(`.marca-nome`) e no rodapé.

## O que a página diz e de onde vem

Cada recurso citado existe no produto (frente Empresas, `docs/FRENTES.md`).
Os pontos que pedem cuidado:

| Afirmação | Conferido em |
|---|---|
| "Funciona mesmo se a internet cair: a TV continua com a última programação" | `js/player.js` (`bootCloud`: a última configuração boa fica em `localStorage` e é aplicada sem rede) e `sw.js` (o player e a mídia ficam em cache) |
| Smart TV Samsung 2018+, LG 2020+, TV box Android com Play Store | `docs/APARELHOS.md` |
| Empresa controladora, plataforma operadora; foto pelo QR só com aprovação e apagada em 30 dias; senha com hash; exportar e excluir no painel | `server/legal.js` (Termos, item 10, e Privacidade, itens 1, 5, 8 e 9) |
| Hospedagem e IA fora do Brasil, transferência pelas cláusulas-padrão da ANPD | `server/legal.js` (Privacidade, item 4). A página **não** diz que os dados ficam no Brasil e não cita certificação nenhuma |
| E-mail quando uma TV cai no expediente; ver a tela de cada TV pelo celular | o mesmo texto da landing `/empresas` (`server/landing-frentes.js`, `junto`) |

**Preços.** São os da oferta da Visitor (R$ 139 por TV por mês; aparelho:
R$ 0, R$ 349 o kit ou + R$ 19 por mês no aluguel de 12 meses; instalação:
grátis, R$ 99 por unidade, R$ 249 a visita + R$ 99 por TV a mais, ou sob
consulta; teste de 14 dias com 1 TV; 50 TVs ou mais, condições especiais).
Eles **não** saem de `server/plans.js` nem de `/api/planos`: mudou a oferta,
mude o HTML à mão. Procure por `R$` no `index.html`; o bloco "Exemplo: 5
TVs…" faz a conta com esses valores e precisa mudar junto.

## Imagens

Todas são telas reais do MultiTelas, desenhadas pelo mesmo motor da TV
(`js/peca-render.js`) a partir das peças-ouro (`pecas-ouro/`), com a marca de
empresas **fictícias** do manifesto (`pecas-ouro/manifesto.json`). Nenhuma
usa foto de banco de imagens ou de pessoa: onde a peça teria foto, aparecem
as iniciais. As letras das peças são as do catálogo próprio (`fonts/` da
raiz, licenças em `fonts/licencas/`).

| Arquivo | Origem | Marca fictícia | Modo |
|---|---|---|---|
| `tela-mural.webp` (herói) | tela completa `l1-empresa-mural` (layout Corporativo) | Rota Sul | como no manifesto |
| `tela-industria.webp` (herói, revezando) | tela completa `l3-industria-deitada` | Metalúrgica Andrade | como no manifesto |
| `tela-escritorio.webp` (herói, revezando) | tela completa `l3-escritorio-deitada` | Vértice Contabilidade | como no manifesto |
| `comunicado.webp` | peça `gente-comunicado`, com texto de RH sobre vacinação | Distribuidora Rota Sul | escuro |
| `aniversariantes.webp` | peça `gente-mes` | Distribuidora Rota Sul | escuro |
| `boas-vindas.webp` | peça `gente-boas-vindas` | Distribuidora Rota Sul | claro |
| `epi.webp` | peça `servico-epi` (textos da frente Empresa) | Metalúrgica Andrade | escuro |
| `agenda.webp` | peça `servico-semana` (agenda de treinamentos) | Vértice Contabilidade | escuro |
| `indicadores.webp` | peça `indicador-turno` (metas do turno) | Metalúrgica Andrade | escuro |
| `cardapio.webp` | peça `cardapio-semana` (refeitório) | Distribuidora Rota Sul | claro |
| `ramais.webp` | peça `servico-ramais` | Distribuidora Rota Sul | escuro |
| `campanha.webp` | peça `social-campanha` (Novembro Azul, texto da frente Empresa) | Vértice Contabilidade | escuro |
| `pareamento.webp` | a tela de pareamento do player (`/player.html?cloud=1`), aberta como se estivesse em `app.multitelas.net.br`: o QR leva ao painel de verdade, com um código que não vale | — | — |
| `og.jpg` | composição para compartilhamento (1200×630): logo, título e `tela-mural.webp` | — | — |

As peças são desenhadas em 1920×1080 com a letra mínima do local
"escritório", e o relógio das telas completas parado numa terça, 9h41.
Saem em WebP: 1600 px de largura nas telas do herói e 1200 px nas outras.

**Para refazer** (por exemplo, depois de mudar uma peça), na raiz do
repositório, com o servidor de pé numa porta livre:

```sh
PORT=6095 SKIP_VERIFY=1 AI_PROVIDER=dev DATA_DIR=/tmp/mt MEDIA_DIR=/tmp/mt STORAGE=local DATABASE_URL= NODE_ENV=test node server.js &
node parceiros/visitor/ferramentas/gerar-imagens.mjs --base http://127.0.0.1:6095
# só algumas: --so comunicado,tela-mural,og
```

Precisa do Playwright com o Chromium e do ImageMagick (`convert`) com WebP.

## Antes de publicar

- [ ] Marcadores preenchidos (procure `data-preencher` e `visitor.example`).
- [ ] Os três contatos abrem certo no celular (WhatsApp, ligação, e-mail).
- [ ] Ao colar o link no WhatsApp, aparece a imagem de compartilhamento.
- [ ] Os preços batem com a proposta comercial da Visitor.
