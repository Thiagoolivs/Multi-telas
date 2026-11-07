# Banco de Imagens MultiTelas

O acervo compartilhado entre contas: o que uma empresa gerou e **autorizou**
pode ser reusado por outra.

Duas coisas motivam isso, e a segunda é a menos importante:

1. **Gosto.** Uma plataforma de arte que abre vazia não tem nenhum. O primeiro
   cliente entra, vê um formulário em branco e conclui, com razão, que o
   trabalho é dele.
2. **Custo.** Cada imagem custa R$ 0,35 no Gemini, pagos de novo toda vez que
   alguém pede uma foto de pão que já foi gerada quarenta vezes.

Código: [`server/banco.js`](../server/banco.js) (regras),
[`web/src/pages/BancoImagensPage.jsx`](../web/src/pages/BancoImagensPage.jsx)
(o feed), fila de moderação dentro de `PlatformPage.jsx`, e o duotone em
[`js/peca.js`](../js/peca.js). Testes: `test/banco-imagens.test.js`.

---

## O ciclo de uma imagem

```
gerada pela IA ──[o dono marca compartilhar]──> pendente
                                                   │
                     ┌─────────────────────────────┴──────────────┐
                     ▼                                            ▼
                 aprovada  ◄──[o dono tira]──> revogada       recusada
                (no feed)                     (sai do feed)   (fim de linha)
```

- **pendente** é o estado inicial, sempre. Nada entra no feed sem conferência.
- **revogada** pode voltar para **pendente** (a pessoa mudou de ideia). Passa
  pela conferência de novo.
- **recusada** não volta sozinha, senão a moderação vira um jogo de insistência:
  bastaria clicar até alguém aprovar por cansaço.

## As quatro regras, e por que existem

**1. Só entra o que a IA gerou.** Foto que a pessoa subiu pode ter o rosto de um
funcionário, o produto de um fornecedor, a marca de um terceiro. Não temos
direito de redistribuir isso — e ela clica no botão sem pensar nessa lista. A
coluna `origem` de `media` (ver [`server/midia.js`](../server/midia.js)) já
separava os casos; aqui virou barreira. O botão nem aparece para arquivo
enviado: oferecer um botão que sempre dá erro é pior que não oferecer botão.

**2. É opt-in, e o texto diz "inclusive concorrentes".** A padaria compartilha e
a padaria da esquina usa. Isso vai acontecer; o erro seria a pessoa descobrir
depois. A frase está no diálogo de confirmação, antes do clique, e o aceite fica
gravado com a versão dos Termos (`registrarAceite`).

**3. Revogar vale para a frente.** Sai do feed na hora; campanha que outra conta
já publicou continua no ar, e o arquivo continua onde está. Uma TV apagando
sozinha por decisão de alguém que o dono dela não conhece é pior que a imagem
continuar. Pelo mesmo motivo, imagem aprovada **sobrevive a apagar o arquivo e a
encerrar a conta** — a linha do banco guarda a própria chave e URL, e perde o
`tenant_id`. Está nos Termos, cláusula 6.

**4. Nada entra sem moderação.** O volume no começo é minúsculo e conferir custa
quase nada; o custo de UMA imagem errada no feed de trinta clientes não é. A
fila fica no painel da plataforma, junto das métricas.

## O que NÃO foi feito, de propósito

**Filtro por cidade.** A ideia era não oferecer a imagem de uma padaria para
outra padaria da mesma rua. O sistema não guarda a cidade de ninguém hoje — a
memória de marca tem `segmento`, não localidade. Fingir uma proteção que o dado
não sustenta é pior que avisar: por enquanto o aviso nos Termos é o que existe.
Quando houver cidade cadastrada, o filtro entra em `banco.listar`.

**Crédito de volta para quem compartilha.** A imagem já foi paga uma vez;
devolver crédito quando alguém usa semearia o acervo rápido e custaria quase
nada. Não está feito.

**Cobrança pelo uso do banco.** Hoje usar do banco não gasta crédito. Vale notar
a economia: se reusar custasse igual a gerar, ninguém reusaria, e a plataforma
continuaria pagando R$ 0,35 sempre. Reuso barato dá mais margem que reuso caro.

## Duotone: a parte que faz a imagem parecer da casa

A imagem do banco foi gerada na cor da marca de **origem** — a direção de arte
([`server/direcao-arte.js`](../server/direcao-arte.js)) pede monocromia no hex
de quem pediu. Reusada crua, a foto laranja da padaria entra numa peça azul de
ótica e denuncia que veio de fora.

Regerar na cor certa custaria os mesmos R$ 0,35 e mataria a economia inteira.
Então a cor é trocada no **desenho**, de graça:

```css
/* fundo */            background-image: url(foto), linear-gradient(#hex,#hex);
                       background-blend-mode: luminosity;

/* elemento <img> */   pai:   background-color: #hex; isolation: isolate;
                       img:   mix-blend-mode: luminosity;
```

`luminosity` mantém o claro/escuro da foto e toma matiz e saturação da camada de
baixo. É duotone exato — não o truque de `hue-rotate`, que acerta a cor por
aproximação. `isolation: isolate` no pai não é opcional: sem ele a mistura vaza
para o que estiver atrás e o elemento vizinho fica com a cor errada.

A conta mora em `js/peca.js` (`tintaFundo`, `tintaImagem`) porque o desenho de
uma peça já esteve escrito três vezes neste projeto. O player, as três prévias
do painel e o PNG exportado usam a mesma função — no canvas, o equivalente é
`globalCompositeOperation = 'luminosity'` sobre a cor chapada. Um duotone que só
o editor aplica seria uma peça aprovada numa cor e exibida em outra.

O elemento carrega `tint` (hex), saneado em `server/composer.js`: valor torto ali
não erra a cor, apaga a imagem.

## API

| | |
|---|---|
| `GET /api/banco?q=&formato=&limite=` | o feed (só aprovadas) |
| `GET /api/banco/minhas` | o que esta conta ofereceu, em qualquer estado |
| `POST /api/banco/:mediaId/compartilhar` | exige `{ aceito: true }` |
| `DELETE /api/banco/:mediaId/compartilhar` | revoga |
| `POST /api/banco/:id/usar` | conta o uso, devolve URL e cor de origem |
| `GET /api/plataforma/banco?estado=` | a fila (operador) |
| `POST /api/plataforma/banco/:id` | `{ estado: 'aprovada' \| 'recusada' }` |

O feed nunca devolve `key` (é a única barreira de `/media/*`, uma rota sem
autenticação) nem `tenant_id`. O `mediaId` sai só para o dono — para os outros,
mostrá-lo seria dizer de qual conta a imagem veio.

---

# Espaços de imagem e o banco de fotos das peças

Cada foto de uma peça em HTML (`data-campo-img`, menos a `logo`) é um **espaço
de imagem**: o cliente o enche pelo "Trocar foto" do painel
(`web/src/components/fotos/TrocarFoto.jsx`) com a foto do celular, uma do banco
de fotos do ramo dele ou uma gerada pela IA. Testes:
`test/espacos-de-imagem.test.js`.

## O papel de cada espaço (manifesto)

Cada peça-ouro diz o papel de cada espaço em `pecas-ouro/manifesto.json`, ao
lado de `papeis` — sem mexer no HTML da peça:

```json
{ "id": "oferta-foto", "papeis": ["destaque", "lateral"], "fotos": { "foto": "produto" } }
```

Papéis: `produto`, `ambiente`, `pessoa` e `textura` (fundo). **Peça nova com
foto declara o papel de todo espaço que não seja a logo** — o teste recusa
espaço sem papel e papel de espaço que a peça não tem. O papel é copiado para o
item quando a peça nasce (`web/src/lib/modelosOuro.js`, `itemDoModelo`; a
bancada faz o mesmo), porque a TV desenha sem o manifesto.

## O item

O arquivo continua **texto** em `campos` — item antigo, TV antiga e a
conferência do servidor (`conferirConfig`) seguem iguais. O resto mora ao lado:

```json
{
  "campos":  { "foto": "/media/t_1/abc.jpg" },
  "espacos": { "foto": { "papel": "produto", "foco": { "x": 0.54, "y": 0.46 }, "fundo": "data:image/jpeg;base64,…" } }
}
```

- `foco`: o ponto que o cliente tocou, de 0 a 1 (0,0 é o canto de cima à
  esquerda). Vira `object-position`: esse ponto nunca sai do quadro.
- `fundo`: a foto em miniatura (~24 px, até 4 KB), feita no painel ao escolher
  a foto. Esticada, é o fundo desfocado. Sem ela, a TV faz a miniatura num
  `<canvas>`; foto de outro endereço não deixa, e aí o fundo é a cor da marca.
- Na entrada, `campos.foto` também aceita `{ "src": "/media/…", "foco": { "x", "y" } }`
  (o que o "Trocar foto" devolve em `onTrocar`): a porta (`js/peca-html.js`,
  `validarItem`) separa, e o que é gravado tem sempre o texto em `campos`.
- `foco` e `fundo` são da foto do campo: quem troca a foto troca (ou apaga) os
  dois. Sem foto, só o `papel` fica.

## Qualquer foto, em qualquer espaço

O desenhista (`js/peca-render.js`, `encaixeDaFoto` e `encaixarFoto`) decide, na
TV, na bancada e no painel, com o mesmo código:

- **cobrir** (o normal): enche o espaço e corta o que sobra, alinhado no foco;
- **inteira, com o fundo desfocado**: quando cobrir jogaria fora mais da foto do
  que o papel tolera (ambiente 60%, produto 45%, pessoa 40%, mais 15 pontos com
  o foco escolhido; textura sempre cobre) ou quando ela teria que crescer mais
  de 2,5× (pequena demais). Atrás dela, ela mesma esticada e escurecida — sem
  `filter: blur()`, que o box barato não aguenta. Com o foco escolhido, ela
  pode perder até um quarto em volta do ponto, para o assunto sair maior.

## O banco de fotos (`pecas-ouro/fotos/banco.json`)

Fotos livres para uso comercial, por ramo, em `pecas-ouro/fotos/<ramo>/`. O
índice é uma lista:

```json
[{
  "id": "padaria-pao-frances",
  "arquivo": "/pecas-ouro/fotos/padaria/pao-frances.jpg",
  "ramos": ["padaria"],
  "papel": "produto",
  "foco": { "x": 0.5, "y": 0.45 },
  "descricao": "Pães franceses na bancada",
  "credito": "Fulano de Tal / Unsplash",
  "licenca": "Unsplash License",
  "fonte": "https://unsplash.com/photos/…"
}]
```

- `ramos`: os de `js/paletas.js` (`RAMOS`: otica, pet, academia, barbearia,
  beleza, saude, padaria, comida, moda, varejo, corporativo) ou `geral` (serve a
  qualquer negócio).
- `descricao` é opcional (o nome da foto para quem usa leitor de tela).
- O arquivo: JPEG, PNG ou WEBP, maior lado até 1920 px, até 900 KB (JPEG
  q≈82). Nome só com `a-z`, `0-9` e `-`.
- O "Trocar foto" mostra primeiro as do ramo da conta e do papel do espaço; o
  crédito vai junto da peça e aparece pequeno no canto da TV.

## Gerar com IA (`POST /api/ia/imagem`)

`{ prompt, formato: '16/9' | '9/16' | '1/1', papel }` → `{ item }` (a mídia,
guardada na Biblioteca da conta como um envio). Regras em `server/ia-imagem.js`:
freio por conta (`MT_IA_IMAGEM_POR_HORA`, padrão 20), uma criação reservada
antes e cobrada depois (tipo `gerar-imagem` no uso de IA), o modelo da cascata
do Gemini (`GEMINI_IMAGE_MODEL` escolhe outro). Gerador sem crédito (402, teto
de gasto, cota): "A geração de imagens está sem crédito agora. Use uma foto do
celular ou do banco." Com `AI_PROVIDER=dev`, sai uma foto de exemplo desenhada
no servidor (a mesma para o mesmo pedido), sem crédito, registrada como
`gerar-imagem-exemplo`.
