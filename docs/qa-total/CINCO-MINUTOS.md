# Sua primeira TV em 5 minutos — medido

O pedido do dono: quem abre o produto monta a TV em uns 5 minutos. Meta:
**até 15 toques** e **até 5 minutos** de uma pessoa cuidadosa.

Medido em **07/11/2026**, sobre o `main` em `4be92b2` com o passo a passo
novo. Servidor **local** na porta 6002 (`PORT=6002 SKIP_VERIFY=1
AI_PROVIDER=dev STORAGE=local DATA_DIR=<pasta temporária>`), banco novo,
nada de produção. A TV é de mentira: o player (`/player.html?cloud=1`) num
Chromium deitado, mostrando o código, como em `tools/regua-tv.mjs`.

## Resultado

| | Celular 390×844 | Computador 1280×800 | Meta |
|---|---:|---:|---:|
| Toques, passos 1 a 7 | **14** (3 deles no campo de texto) | **14** (3) | ≤ 15 |
| Pessoa cuidadosa, passos 1 a 7 | **174 s** (2 min 54 s) | **174 s** (2 min 54 s) | ≤ 300 s |
| Com o cadastro antes | 20 toques (6 no campo) · 220 s (3 min 40 s) | 20 (6) · 221 s | — |
| A TV mostrou o que a pessoa digitou | sim | sim | |
| Erros na página | nenhum | nenhum | |

As duas metas batidas nos dois tamanhos. Contando como o bloco 8 contava
(digitar não conta, e o toque no campo também não), são **11 toques** no
passo a passo e 14 com o cadastro.

### Passo a passo, no celular

| Passo | Toques (no campo) | Decisões | Palavras | Letras | Espera do painel | Pessoa cuidadosa |
|---|---:|---:|---:|---:|---:|---:|
| Criar a conta | 6 (3) | 1 | 72 | 65 | 0,2 s | 46 s |
| 1. Seu negócio | 1 (0) | 1 | 36 | 0 | 0,0 s | 14 s |
| 2. Sua marca | 3 (0) | 2 | 79 | 0 | 0,1 s | 34 s |
| 3. Ligar a TV | 2 (1) | 1 | 97 | 6 | 0,2 s | 36 s |
| 4. Escolher a tela | 1 (0) | 1 | 32 | 0 | 0,0 s | 13 s |
| 5. Fotos e textos | 5 (2) | 2 | 43 | 21 | 0,1 s | 29 s |
| 6. Horário | 1 (0) | 1 | 54 | 0 | 0,0 s | 20 s |
| 7. Pôr na TV | 1 (0) | 1 | 77 | 0 | 0,2 s | 28 s |
| **Passos 1 a 7** | **14 (3)** | | | | **0,6 s** | **174 s** |

No computador, os mesmos números (a diferença é de 1 s no cadastro e de
0,1 s de espera).

Os 14 toques: Padaria · Mandar o logo · escolher o logo na galeria · Está
bom · o campo do código · Ligar a TV · a primeira tela · o quadro da foto ·
escolher a foto na galeria · o campo do nome · o campo do preço · Continuar
· Segunda a sábado · Pôr na TV.

### Como conto

- **Toque:** botão, cartão, o campo de texto (o toque para digitar nele) e
  escolher o arquivo na galeria (um toque a mais depois de "Mandar o logo"
  e do quadro da foto). Digitar não é toque.
- **Pessoa cuidadosa** (a régua do dono): 1 s para cada 3 palavras na tela
  (todas as telas do passo, inclusive a do fim, "Pronto! Está na TV."), 2 s
  por decisão, e mais o que a régua não dizia: 0,3 s por letra digitada, 4 s
  para achar a foto na galeria e a espera de verdade do painel.
- **Espera do painel:** medida, do toque até a tela seguinte aparecer.
  No servidor local é quase nada (0,5 a 0,6 s no passo a passo inteiro). Numa
  rede de celular, mandar o logo e a foto, ligar a TV e pôr na TV somam
  uns 5 a 10 s: o total fica abaixo de 3 minutos e meio.
- As telas prontas do passo 4 carregam no passo 1 (em segundo plano): no
  passo 4 elas já estão lá.

Para rodar de novo:

```
PORT=6002 SKIP_VERIFY=1 AI_PROVIDER=dev STORAGE=local DATA_DIR=<pasta> MEDIA_DIR=<pasta> node server.js
CINCO_SAIDA=<pasta das fotos> node tools/cinco-minutos.mjs
```

O script sai com erro se passar de 15 toques, de 5 minutos ou se a TV não
mostrar o texto digitado.

## As fotos

Pasta: `/tmp/claude-0/-home-user-Multi-telas/b804d644-700b-5e83-ad8f-5fe2da78625e/scratchpad/p11/`
(no ambiente da medição; `resultado.json` tem cada toque de cada passo).

| Tela | Celular | Computador |
|---|---|---|
| O cadastro | `celular-01-cadastro.png` | `computador-01-cadastro.png` |
| 1. Seu negócio | `celular-02-negocio.png` | `computador-02-negocio.png` |
| 2. Sua marca: o logo ou o site | `celular-03-marca.png` | `computador-03-marca.png` |
| 2. Sua marca: as cores na TV desenhada | `celular-04-marca-cores.png` | `computador-04-marca-cores.png` |
| 3. Ligar a TV | `celular-05-tv.png` | `computador-05-tv.png` |
| 4. Escolher a tela | `celular-06-tela.png` | `computador-06-tela.png` |
| 5. Fotos e textos, vazio e preenchido | `celular-07-fotos.png`, `celular-08-fotos-preenchido.png` | `computador-07…`, `computador-08…` |
| 6. Horário | `celular-09-horario.png` | `computador-09-horario.png` |
| 7. Pôr na TV ("Como vai ficar") | `celular-10-pronto.png` | `computador-10-pronto.png` |
| "Pronto! Está na TV." e os três próximos passos | `celular-11-na-tv.png`, `celular-12-na-tv-proximos.png` | `computador-11…`, `computador-12…` |
| A TV de mentira, no fim | `celular-13-a-tv.png` | `computador-13-a-tv.png` |

A TV de mentira está numa segunda-feira às 10h (o relógio do Playwright):
rodando de noite, ela mostraria só o relógio — o certo, porque a padaria
escolheu "segunda a sábado, das 7h às 20h" e, fora do horário, o relógio.

### Os outros caminhos (conferidos à mão, com o Playwright)

Pasta `p11/outros-caminhos/`:

- **Saúde** (Clínica Vida Plena, dentista): os negócios da frente primeiro
  (`01`), as três telas da clínica, sem nada de ótica (`03`).
- **Instagram que não abre** (`02`): a frase diz o que fazer ("Mande o
  logo, ou pule").
- **A marca para depois e a TV para depois:** o resto se prepara sem a TV, e
  ela é ligada no fim, antes do "Pôr na TV" (`07`, `08`, `09`).
- **Recarregar no meio** volta ao mesmo passo; **Sair no meio** leva ao
  Início com o cartão "Você parou em “Fotos e textos” (passo 5 de 7)" e
  "Continuar" (`05`).
- **Outro horário** abre o formulário de Telas › Horário (`06`).
- **Terminado**, o Início mostra "Montar a TV de novo" (`10`), e o "Comece
  por aqui" volta (a marca ficou para depois).
- **Membro com a aprovação ligada:** escolhe uma TV da conta (`11`), o botão
  é "Pedir para pôr na TV" (`12`), o fim diz "Pedido mandado!" com "Meus
  pedidos" no lugar de "Convidar alguém" (`13`), e o pedido "Tela pronta:
  Foto da clínica" está na fila do dono.
- **Tema escuro e "Trocar as cores"** (Metalúrgica Andrade, indústria):
  `14` a `16` — as paletas do logo na TV desenhada, um toque troca, e as
  telas da Empresas (nada de oferta nem de cardápio).

## O que foi feito

- **Os passos** (`web/src/pages/PrimeiraTvPage.jsx`,
  `web/src/components/primeira-tv/`): fora da moldura do painel (só o
  passo, Voltar, o andamento e Sair), uma decisão e um violeta por tela,
  "Pular" ou "Fazer isso depois" em todo passo.
- **O progresso** fica na conta (`/api/primeira-tv`, coluna
  `tenants.primeira_tv`, regras em `js/primeira-tv.js`): quem começa no
  celular continua no computador, do mesmo passo. Abre sozinho na conta
  nova (dono ou administrador, sem TV no ar, sem ter terminado nem saído).
- **O negócio vira o ramo da conta** (`GET /api/brand`): a Marca, as
  paletas e a Biblioteca passam a pôr o dele primeiro. O membro não troca.
- **O fim pelos caminhos de sempre:** o horário pela rota da TV, a tela pelo
  envio em lote (com Desfazer). Com a aprovação ligada, o envio do membro
  vira pedido, e o painel diz isso.
- Testes: `test/primeira-tv.test.js` (o progresso e o retomar, as telas do
  passo 4, o que a TV recebe, e o caminho de gravar num servidor de verdade:
  o dono põe, o membro pede e a TV só muda quando o dono aprova).

## O que ficou, e decisões para o dono

1. **Só há uma tela aprovada no manifesto** (a da ótica). O pedido era
   "três telas aprovadas do negócio; sem elas, as aprovadas mais perto".
   A mais perto, para quase todo negócio, seria a da ótica ("Semana do
   Sol", óculos de sol) — e na Saúde e na Empresas não há nenhuma. Então
   o passo 4 completa com **telas montadas só com peças aprovadas** do
   negócio, na estrutura de sempre: o cabeçalho com a marca, o destaque do
   negócio (o com foto primeiro), a lateral com o horário da conta e o
   rodapé. A aprovada de outro negócio da frente só entra se ainda faltar;
   de outra frente, nunca. **Aprovar na bancada as telas do lote 2 e 3**
   (hoje "proposta") faz elas virem primeiro, sem mudar código.
2. **O TrocarFoto** (`components/fotos/TrocarFoto.jsx`, outro agente) entra
   no lugar do `FotoDoPasso` com as mesmas props — `{ papel, ramo, valor,
   onTrocar, formato }` — numa linha só de `PassoFotos.jsx`. O que eu
   mudaria junto: o quadro abrir já na aba do banco de fotos do negócio
   (quem não tem foto boa no celular sai com uma), o `FotoDoPasso` sair (e
   com ele a cópia do "encolher a foto" de `lib/subir.js`), e o passo 5
   oferecer uma foto também para o destaque que não tem lugar de foto.
3. **Só o destaque é perguntado.** Nas telas montadas, o resto da tela é
   da conta (a marca, o horário) ou serve a qualquer um. Nas aprovadas, a
   lateral e o cabeçalho continuam com o texto de exemplo (limpo de nome,
   telefone e endereço, como em Telas prontas). Quando houver telas
   aprovadas por negócio, vale perguntar também a frase da lateral.
4. **O passo 3 é o que mais se lê** (97 palavras, por causa do quadro do
   endereço da TV, que é o mesmo de Telas). Um texto mais curto nos dois
   lugares economiza uns 10 s.
5. **O horário não espera aprovação.** É a regra de hoje do servidor (o
   membro muda o horário da TV direto); no fluxo do membro, a tela espera
   o dono e o horário já vale.
6. **O voltar do celular sai do passo a passo** (os passos não viram
   entradas do histórico). O progresso fica e o Início oferece "Continuar".
7. **Sem foto no passo 5**, o lugar da foto fica vazio na TV (a peça
   esconde a foto que falta). O preço do exemplo sai quando a pessoa troca o
   nome do produto sem dar preço — um preço que ela não disse é pior que
   nenhum.
