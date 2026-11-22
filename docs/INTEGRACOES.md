# Integrações — o Conector MultiTelas e a API para a intranet

O servidor do MultiTelas está na nuvem (Railway) e **não alcança a rede da
empresa**: o compartilhamento onde o RH guarda os avisos, o Excel do
cardápio, a intranet. Então um programa pequeno, o **Conector MultiTelas**,
roda num PC lá dentro e **empurra** o conteúdo para nós por uma API pública
com token. A própria intranet usa a mesma API para publicar comunicados.

```
   rede da empresa                                     nuvem (MultiTelas)
 ┌─────────────────────────────┐                 ┌──────────────────────────────┐
 │ \\servidor\RH\Avisos  ───┐   │   HTTPS + token │ /api/v1  (server/routes/     │
 │ Cardápio.xlsx   ─────────┤   │ ──────────────▶ │          integracoes.js)     │──▶ envio em lote
 │ intranet/rss    ─────────┤   │   (só sai,      │                              │    (js/lote-tv.js)
 │            Conector ─────┘   │    nada entra)  │ painel: Integrações          │──▶ as TVs
 │ intranet (servidor) ─────────┼───────────────▶ │                              │
 └─────────────────────────────┘                 └──────────────────────────────┘
```

**Quem decide o quê.** O painel decide quais pastas, planilhas e feeds
existem, os endereços dos feeds, para quais TVs cada coisa vai, em que zona,
quanto tempo cada foto fica e se precisa de aprovação. O Conector **nunca
escolhe TV**: ele só manda o conteúdo.

Código: `server/integracoes.js` (as regras puras), `server/routes/integracoes.js`
(o HTTP, o banco e o caminho até as TVs), `js/lote-tv.js` (`aplicarIntegracao`),
o tipo `integracao` em `server/routes/telas.js` (`OPERACOES`),
`web/src/pages/IntegracoesPage.jsx` (o painel). Testes em
`test/integracoes.test.js`.

---

## 1. No painel

**Integrações** fica no menu da conta (o avatar, ao lado de Equipe) e no
card "Pasta da rede e intranet" dos Apps. Ver é de qualquer pessoa da conta;
mexer é do **dono** e dos **administradores**.

1. **Nova integração** → o token aparece **uma vez** (com o botão de copiar).
   No banco fica só o hash. Uma integração para o Conector do RH e outra
   para a intranet é o jeito recomendado (cada uma com o seu token).
2. **Ligar uma pasta**: nome, nome curto (a `chave` que o Conector usa), as
   TVs (todas, algumas, ou grupos de TVs — a TV nova do grupo entra sozinha),
   a zona (área principal ou lateral), segundos por foto, a ordem (pelo nome
   ou o mais novo primeiro), foto inteira ou preenchendo a tela, e
   **"Precisa de aprovação"** (desligado até o dono ligar).
3. **Ligar uma planilha**: preços/cardápio (aparece em *Preços da planilha*)
   ou indicadores (aparece em *Indicadores*). De lá, vai para a TV como
   qualquer planilha.
4. **Ligar um feed**: o endereço **interno** do RSS ou do JSON (quem lê é o
   Conector) e, no JSON, onde estão a lista e os campos.
5. **Comunicados → Configurar**: para quais TVs e em que zona vão os
   comunicados (da intranet e dos feeds), e se precisam de aprovação.

Para cada coisa o painel mostra o estado em palavras: quantos arquivos, "na
TV · atualizada há 5 min", "esperando aprovação", "não deu: …", o vídeo
pesado demais para o TV Box; e, da integração, se o Conector está
conectado, a versão, o computador e quando foi visto. **O que mudou** é a
auditoria (cada arquivo, comunicado, planilha, ida às TVs e troca de token,
com quem fez).

**Token novo** troca o token (o antigo para de valer na hora). **Revogar**
corta o token e deixa o que já está nas TVs. **Apagar** tira das TVs tudo o
que a integração pôs, apaga as planilhas dela e os arquivos.

**O nome curto** (a `chave`) de cada pasta, planilha e feed não muda depois
de criado (400 `chave-fixa`): o `conector.json` do cliente e os comunicados
apontam para ele. Para outro nome, crie outra e apague a de antes.

**Apagar** uma pasta tira as fotos dela das TVs na hora; apagar um **feed**
tira das TVs, na hora, os comunicados que vieram dele (os que chegaram com
`X-Conector-Feed`, 3.6) e apaga as imagens dele (`_feed-<chave>`, 3.3). O
Conector não precisa fazer nada: a fonte só some do aperto de mão.

**O instalador** (`/conector/MultiTelasConector.zip`, o link de "Como
instalar o Conector") vem do Release mais novo do GitHub: o
`.github/workflows/conector.yml` monta o zip (~38 MB) e, na `main`, publica a
tag `conector-v<versão>` (a versão do `conector/package.json`) com o zip, um
`versao.json` (`{ versao, tamanho, sha256 }`) e o `.sha256`. O servidor
(`server/conector-release.js`) busca pela `server/site.js` (com o
`GITHUB_TOKEN`, se houver), confere tamanho, sha256 e "PK", guarda **em
memória** por 30 min e serve com o sha256 no cabeçalho `X-Conector-Sha256`.
Só baixa quem está **logado como dono ou administrador** (os que criam o
token; e 38 MB aberto a qualquer um seria banda nossa para quem quisesse
gastar — não há segredo no zip). Sem login, sem papel ou sem Release, uma
página explica o que fazer (401, 403, 404). Uma versão nova do Conector só
vira Release quando a versão do `conector/package.json` sobe.

---

## 2. Autenticação, erros e limites

**Base:** `https://app.multitelas.net.br/api/v1` (o painel mostra o endereço
da instalação).

**Token:** `Authorization: Bearer mti_…` em toda chamada. O token é de **uma
conta só**; tudo o que ele alcança é dela.

**Erros** são sempre JSON: `{ "error": "frase em português", "code": "…" }`.

| Status | `code` | Quando |
|---|---|---|
| 400 | `sha-invalido`, `sha-diferente`, `json-invalido`, `id-invalido`, `corpo-incompleto`, `imagem-indisponivel`, `chave-fixa` (painel) | o pedido chegou estragado ou o endereço da imagem não respondeu agora: **pode repetir** |
| 401 | `sem-token`, `token-invalido`, `token-revogado` | sem token, token errado, ou revogado no painel |
| 404 | `pasta-desconhecida`, `planilha-desconhecida`, `feed-desconhecido`, `rota-desconhecida` | a pasta/planilha/feed não existe nesta integração (são criadas no painel; o feed pode ter sido apagado) |
| 405 | `metodo` | método errado no endereço |
| 409 | `ocupado` | o mesmo arquivo chegando em dois envios ao mesmo tempo |
| 413 | `grande-demais`, `pasta-cheia`, `cota-cheia`, `comunicados-demais` | passou de um teto (a frase diz qual) |
| 415 | `tipo-nao-aceito` | o conteúdo não é foto nem vídeo (ou é PDF/PPTX — ver 3.3) |
| 422 | `nome-invalido`, `campo-invalido`, `imagem-invalida`, `imagem-nao-encontrada`, `planilha-sem-itens` | o **conteúdo** não serve (nome de arquivo, campo do comunicado, a imagem, o CSV sem item legível — a TV continua com o de antes) |

**Repetir ou não.** 400, 429 e 5xx: o Conector tenta de novo (o 429 depois
do `Retry-After`). 413, 415 e 422: recusa pelo conteúdo — o Conector **não**
manda o mesmo de novo enquanto o arquivo, o item do feed ou a planilha não
mudarem. Quem integra por conta própria (a intranet) deve fazer igual.
| 429 | `limite` | passou do limite; o `Retry-After` (segundos) diz quanto esperar |

**Limites (por token):**

- **120 pedidos por minuto.** A primeira carga de uma pasta com 200 arquivos
  leva uns 2 minutos; respeite o `Retry-After`.
- **2 GB de arquivo por hora.**
- 60 tokens errados por endereço IP em 10 minutos (depois, 429).

**Tetos:** foto até **20 MB**, vídeo MP4 até **200 MB** (o mesmo teto do
upload do painel), **200 arquivos e 4 GB por pasta**, CSV até **512 KB**,
imagem baixada para um comunicado até **10 MB**, **300 comunicados** por
integração, 10 pastas, 10 planilhas e 10 feeds por integração, 5
integrações por conta. O armazenamento conta na cota da conta, como os
uploads do painel.

**Log:** cada chamada vira uma linha `integracao.chamada` com o id da
integração, a conta, o padrão da rota, o status e o tempo — **nunca o token**
nem o nome do arquivo.

---

## 3. Referência da API

Nos exemplos: `export MT=https://app.multitelas.net.br/api/v1` e
`export TOKEN=mti_…`.

### 3.1 `GET /conector` — aperto de mão e pulso

O Conector chama ao abrir e a cada `intervaloSegundos`. Manda a versão e o
nome do computador (o painel mostra).

```bash
curl "$MT/conector" -H "Authorization: Bearer $TOKEN" \
  -H "X-Conector-Versao: 1.0.3" -H "X-Conector-Maquina: PC-RH-01"
```

```json
{
  "conta": { "nome": "Metalúrgica Andrade" },
  "integracao": { "nome": "Conector do RH" },
  "pastas": [{ "chave": "avisos-rh", "nome": "Avisos do RH" }],
  "planilhas": [{ "chave": "cardapio", "nome": "Cardápio do refeitório" }],
  "feeds": [
    { "chave": "noticias", "nome": "Notícias", "url": "http://intranet.local/rss", "formato": "rss" },
    { "chave": "eventos", "nome": "Eventos", "url": "http://intranet.local/api/eventos", "formato": "json",
      "mapa": { "lista": "dados.itens", "id": "codigo", "titulo": "nome", "texto": "resumo", "imagem": "", "link": "url", "inicio": "de", "fim": "ate" } }
  ],
  "intervaloSegundos": 60
}
```

A lista é a de agora: pasta criada ou apagada no painel aparece (ou some) no
próximo pulso.

### 3.2 `GET /pastas/:chave` — o que já temos

Para o Conector mandar só a diferença.

```bash
curl "$MT/pastas/avisos-rh" -H "Authorization: Bearer $TOKEN"
```

```json
{ "arquivos": [
  { "nome": "Avisos/natal.jpg", "sha256": "9f2c…", "tamanho": 482113, "em": "2026-12-01T11:02:13.000Z" },
  { "nome": "Apresentacao.pptx/01.png", "sha256": "1ab0…", "tamanho": 220931, "em": "2026-12-01T11:02:15.000Z" }
] }
```

`em` é quando o arquivo chegou aqui (ISO 8601, UTC).

### 3.3 `PUT /pastas/:chave/arquivos/:nome` — um arquivo

**A pasta reservada de um feed.** `:chave` pode ser `_feed-<chave do feed>`
(GET, PUT e DELETE) enquanto o feed existir na integração: é onde o Conector
põe a imagem de cada item do feed, baixada da intranet, para o comunicado
apontar (`"imagemUrl": "pasta:_feed-noticias/<nome>"`). Ela não aparece no
aperto de mão, só guarda **foto** (JPG, PNG, WEBP; até 200), nunca vai para a
TV como playlist — a foto aparece pelo comunicado — e some com o feed. A
imagem que nenhum comunicado usa mais sai sozinha.

O corpo são os **bytes crus** do arquivo.

- `:nome` vai **codificado** (`encodeURIComponent` em cada parte) e pode ter
  subpastas com `/` (`Avisos%2Fnatal.jpg` ou `Avisos/natal.jpg`).
- Cabeçalhos: `Content-Type` e **`X-Sha256`** (o sha256 do arquivo, em hexa).
- **Mesmo sha256 do que já temos: nada muda, 200** (`"mudou": false`). Pode
  mandar de novo sem medo.
- O tipo é decidido pelo **conteúdo** (os primeiros bytes), não pelo nome nem
  pelo `Content-Type`. Entram **JPG, PNG, WEBP e MP4**.
- **PDF e PPTX são recusados (415)** com a frase *"Salve os slides como
  imagem; o Conector converte sozinho quando o PowerPoint está instalado"*:
  o tipo `pptx` da TV manda o endereço relativo `/media/` ao visualizador da
  Microsoft, que não o alcança, e o WebView do Android não desenha PDF. O
  Conector converte cada slide em PNG no PC do cliente e manda
  `Apresentacao.pptx/01.png`, `02.png`… — os slides de uma apresentação
  ficam **juntos, na ordem do nome**, mesmo com a pasta em "mais novo
  primeiro".
- Nome com `..`, `.`, `/` no começo, `\`, `:` (unidade), subpasta vazia ou
  caractere de controle: **422 `nome-invalido`** (até 240 caracteres e 8
  níveis).

```bash
F="Avisos/natal.jpg"
curl -X PUT "$MT/pastas/avisos-rh/arquivos/$(node -p 'encodeURIComponent(process.argv[1])' "$F")" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: image/jpeg" \
  -H "X-Sha256: $(sha256sum natal.jpg | cut -d' ' -f1)" \
  --data-binary @natal.jpg
```

```json
{ "ok": true, "nome": "Avisos/natal.jpg", "sha256": "9f2c…", "mudou": true }
```

Vídeo que o TV Box de entrada não aguenta (H.265, AV1, mais de 150 MB) entra,
com `"aviso"` na resposta e no painel (a régua de `js/video.js`).

### 3.4 `DELETE /pastas/:chave/arquivos/:nome` — saiu do compartilhamento

```bash
curl -X DELETE "$MT/pastas/avisos-rh/arquivos/Avisos%2Fnatal.jpg" -H "Authorization: Bearer $TOKEN"
```

```json
{ "ok": true, "nome": "Avisos/natal.jpg", "removido": true }
```

Sempre 200; `"removido": false` quando já não estava. O arquivo sai das TVs
na próxima ida (abaixo) e fica guardado **15 dias** (a TV que ainda não pegou
a lista nova, o pedido de aprovação e o Desfazer ainda o usam), depois é
apagado.

### 3.5 `PUT /planilhas/:chave` — o CSV

O corpo é o CSV (`Content-Type: text/csv`). O Conector converte o `.xlsx`
(a **primeira aba**). Vírgula, ponto e vírgula ou tab; UTF-8 (se não for
UTF-8 válido, lemos como Windows-1252, o CSV do Excel em português).

Ele passa pelo **mesmo caminho da planilha ligada** (`server/planilha.js`):
preços → *Preços da planilha* (`item; preço; seção; descrição`, pelo
cabeçalho ou nessa ordem); indicadores → *Indicadores* (`nome; valor; meta;
unidade; anterior; sentido`). A TV que mostra a planilha é avisada quando
algo muda.

```bash
curl -X PUT "$MT/planilhas/cardapio" -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: text/csv; charset=utf-8" --data-binary @cardapio.csv
```

```json
{ "ok": true, "itens": 24, "mudou": true }
```

(indicadores: `{ "ok": true, "indicadores": 6, "avisos": [...] }`). Sem
nenhum item legível: **422** com o motivo, e a TV continua com os de antes.
O `.xlsx` cru: 415.

**Os números como o Brasil escreve.** A leitura é a do CSV do Google
Planilhas e do Excel em português (`server/kpis.js`, `lerNumero`):
`12,5`, `1.250`, `R$ 1.234,56`, `87,5%`. Com **ponto decimal** e três casas,
`5.899` é **milhar** (5899). Por isso o Conector converte o `.xlsx` com cada
célula como o Excel mostra (`"5,899"`, `"87,5%"`, datas em `dd/mm/aaaa`, em
RFC 4180 com vírgula e aspas), e o `.csv` do Excel brasileiro (`;` e vírgula
decimal) sobe como está: os dois dão o mesmo número. Data não vira número
(`22/11/2026` é recusado como valor).

### 3.6 `PUT /comunicados/:idExterno` — cria ou troca um comunicado

Usado pelo Conector (os itens dos feeds) e **direto pela intranet**. O
`idExterno` é o id de vocês (até 200 caracteres, codificado no endereço):
**o mesmo id troca o de antes, nunca duplica**.

```json
{
  "titulo": "Festa de fim de ano",
  "texto": "Dia 20, às 18h, no pátio. Traga a família!",
  "imagemUrl": "pasta:avisos-rh/Avisos/festa.jpg",
  "inicio": "2026-12-10",
  "fim": "2026-12-20T22:00:00-03:00",
  "destaque": true,
  "link": "https://intranet.empresa.com.br/festa"
}
```

| Campo | | |
|---|---|---|
| `titulo` | obrigatório | até 120 caracteres |
| `texto` | opcional | até 600; as quebras de linha ficam |
| `inicio`, `fim` | opcionais | ISO 8601. **Sem fuso, vale o horário de Brasília** (-03:00). Só a data: o início vale da meia-noite e o fim até 23:59:59 do dia |
| `destaque` | opcional | `true`: vai na frente e com mais peso no rodízio |
| `link` | opcional | `http(s)://`; aparece **escrito** no rodapé do aviso (a TV não é clicável) |
| `imagemUrl` | opcional | `pasta:<chave>/<nome>` (um arquivo **já enviado** a uma pasta desta integração) ou um endereço **https público** |

A imagem `https` é baixada pelo servidor **uma vez**, com a porta de sempre
(`server/site.js`: o IP resolvido não pode ser de rede interna, a conexão vai
no IP conferido, redirecionamentos conferidos, tempo e tamanho no teto) e
guardada aqui — a TV não busca o endereço de fora. **O servidor nunca busca
endereço interno**: `http://intranet/...` é recusado (400). Para uma imagem da
rede, mande-a para uma pasta e aponte com `pasta:`.

```bash
curl -X PUT "$MT/comunicados/festa-2026" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"titulo":"Festa de fim de ano","texto":"Dia 20, às 18h, no pátio","fim":"2026-12-20T22:00:00-03:00"}'
```

```json
{ "ok": true, "id": "festa-2026", "criado": true, "situacao": "no-ar" }
```

`situacao`: `agendado` (o início ainda não chegou), `no-ar` ou `encerrado`.

O Conector manda o cabeçalho **`X-Conector-Feed: <chave>`** nos itens de um
feed: o painel conta as notícias de cada feed, e apagar o feed tira os
comunicados dele. Feed que não existe mais (apagado no painel) responde
**404 `feed-desconhecido`** — o comunicado não fica órfão. Um PUT sem o
cabeçalho deixa o comunicado sem feed (a intranet não precisa dele). No
Conector, o `idExterno` de um item de feed é um hash (40 letras hexa) da
chave do feed com o guid ou o link do item, e o `inicio` é a data de
publicação do item.

### 3.6b `GET /comunicados[?feed=<chave>]` — o que já está guardado

```bash
curl "$MT/comunicados?feed=noticias" -H "Authorization: Bearer $TOKEN"
```

```json
{ "comunicados": [ { "idExterno": "9b1f…", "situacao": "no-ar", "atualizadoEm": "2026-12-01T11:02:13.000Z", "feed": "noticias" } ] }
```

Para quem perdeu a memória do que mandou (o `estado.json` do Conector
apagado, o PC trocado): o Conector pergunta uma vez por processo e passa a
cuidar desses também — o que saiu do feed sai das TVs. Sem `?feed`, todos os
desta integração.

### 3.7 `DELETE /comunicados/:idExterno`

```bash
curl -X DELETE "$MT/comunicados/festa-2026" -H "Authorization: Bearer $TOKEN"
```

```json
{ "ok": true, "id": "festa-2026", "removido": true }
```

Sempre 200 (`"removido": false` se não existia).

---

## 4. Para quem desenvolve a intranet

- Crie no painel uma integração só para a intranet (**Nova integração**) e
  guarde o token como uma senha, **no servidor da intranet**. Não chame a API
  pelo navegador: o token ficaria visível para qualquer pessoa da empresa.
- Publique cada comunicado com `PUT /comunicados/<seu id>`; para mudar, mande
  de novo com o mesmo id; para tirar, `DELETE`. Ponha `fim`: ele sai da TV
  sozinho na hora, e a própria TV o esconde depois do fim mesmo se ficar sem
  falar conosco.
- O dono escolhe no painel (Comunicados → Configurar) em quais TVs, em que
  zona e se precisa de aprovação. A intranet não escolhe TV.

```bash
# publicar
curl -X PUT "$MT/comunicados/vacina-gripe" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"titulo":"Vacinação contra a gripe","texto":"Na enfermaria, das 8h às 16h.","inicio":"2026-12-03","fim":"2026-12-05"}'

# trocar o texto (o mesmo id)
curl -X PUT "$MT/comunicados/vacina-gripe" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"titulo":"Vacinação contra a gripe — prorrogada","fim":"2026-12-12"}'

# tirar
curl -X DELETE "$MT/comunicados/vacina-gripe" -H "Authorization: Bearer $TOKEN"
```

---

## 5. Como vai para as TVs

Nada aqui grava a programação de uma TV por conta própria. A pasta e os
comunicados vão pelo **envio em lote** de sempre (`POST /api/lote/operacao`,
o tipo interno `integracao`): posse e loja de cada TV, versão, a porta das
peças, **tudo ou nada**, o **Desfazer** (aparece em *Últimos envios* como
"Pasta da rede: …") e, com "precisa de aprovação", o **pedido** (202) no
lugar do envio. O tipo é interno: o painel não o manda.

- **A espera.** O Conector manda a pasta arquivo por arquivo. Cada mudança
  empurra a ida às TVs para 10 s depois (até 2 minutos da primeira): uma
  pasta de 50 fotos é um envio, não 50. O relógio lê do banco, então
  sobrevive a um restart.
- **Só quem muda.** A TV em que nada muda fica fora do envio (e do pedido).
- **A pasta** vira itens `image` (o tempo da pasta, `fit` inteira ou
  preenchendo) e `video` (toca inteiro) na zona escolhida, marcados com
  `_integracao: "pasta:<id>"`. Cada ida troca todos de uma vez: o que entrou,
  mudou ou saiu. Entram **onde estavam** (quem arrastou a pasta para o meio
  da playlist não a vê voltar para o fim); na primeira vez, no fim.
- **A TV que sai do mapa** perde o que era da pasta; o resto dela fica.
- **Os comunicados** viram o **Aviso** (`announce`, variação "Comunicado") —
  título, texto, o link escrito no rodapé — e, com imagem, a foto logo antes.
  Entram na frente da zona. O servidor põe no ar no `inicio` e tira no `fim`
  (o relógio volta na hora certa); a TV também confere o fim
  (`meta.expiraEm`) e o dia (`agendamento`).
- **Aprovação.** Os pedidos da integração são de um autor só ("Integração:
  <nome>"), e o pedido novo **junta** os que esperavam (`server/aprovacao.js`).
  O dono aprova em *Aprovações*, pelo caminho de sempre. Pedido recusado não
  volta sozinho: a próxima mudança da pasta faz um pedido novo.
- **A planilha** não mexe na programação: ela alimenta *Preços da planilha*
  ou *Indicadores*, e de lá vai para a TV como hoje.
- **Os slides de uma apresentação** (`Apresentacao.pptx/01.png`, `02.png`…,
  ou `Documento.pdf/…`) passam juntos e em ordem (pelo número, `2` antes de
  `10`), mesmo com a pasta em "mais novo primeiro": a apresentação conta
  como um bloco, na data do slide mais novo.
- **Apagar no painel** (a pasta, o feed, a integração) tira das TVs na hora,
  pela sessão de quem apagou (sem pedido de aprovação), e depois apaga os
  arquivos.

---

## 6. Segurança

- **Token**: `mti_` + 32 bytes aleatórios (256 bits). No banco, só o
  **sha256** e os 4 últimos caracteres (a dica). A busca é pelo hash e a
  conferência final é em **tempo constante**. Cada token é de **uma conta**.
  Revogar corta na hora; o token novo invalida o antigo.
- **O tipo pelos bytes**: JPG, PNG, WEBP e MP4 pelos primeiros bytes (o MP4
  com marca de HEIC/MOV/áudio é recusado); o nome e o `Content-Type` não
  decidem nada. O arquivo é guardado com chave sorteada (`server/storage.js`),
  nunca com o nome que veio.
- **Nome**: sem `..`, `.`, caminho absoluto, unidade, `\`, controle; até 240
  caracteres e 8 níveis. O nome é só dado.
- **Tetos** por arquivo, por pasta (200 arquivos, 4 GB), na cota da conta, e
  o **limite por token** (120/min, 2 GB/h). O corpo grande demais é lido e
  jogado fora (até 64 MB a mais) para o 413 chegar com o motivo.
- **Nada de endereço interno**: o servidor só busca a imagem `https` pública
  de um comunicado, pela `server/site.js`. O endereço dos feeds é guardado
  e entregue ao Conector, nunca chamado daqui; não aceita usuário e senha
  dentro dele (ficariam visíveis no painel).
- **Auditoria**: cada mudança vai para o registro da integração (*O que
  mudou*, os últimos 500) e para o log (`integracao.mudou`); cada chamada,
  `integracao.chamada`. Sem o token, sem o nome do arquivo no log.
- **Suporte**: no acesso de suporte não se cria integração nem token
  (`server/suporte.js`).
- **LGPD**: as tabelas `integracoes`, `integracao_fontes`,
  `integracao_arquivos`, `integracao_comunicados` e `integracao_registro`
  entram na exportação (sem o hash do token) e na exclusão da conta; os
  arquivos são mídia da conta (`server/midia.js`, origem `conector`).
- **CORS**: não há. A intranet chama do servidor dela.

---

## 7. O que mudou em relação ao contrato combinado

| O quê | Por quê |
|---|---|
| **PDF e PPTX recusados (415)** com "Salve os slides como imagem; o Conector converte sozinho quando o PowerPoint está instalado"; os slides chegam como `Apresentacao.pptx/01.png`… e ficam juntos, na ordem | revisão de lançamento: o tipo `pptx` não toca na TV (endereço relativo para o visualizador da Microsoft; o WebView não desenha PDF) |
| Todo `PUT` de arquivo responde **200** (com `"mudou": true/false`), e não 201 | um código só para o Conector; o `mudou` diz se fez algo |
| `DELETE` responde **200 sempre**, com `"removido"` | apagar o que já não existe é sucesso para quem sincroniza |
| Campos a mais nas respostas: `mudou`, `aviso` (vídeo pesado), `removido`, `criado`, `situacao`, `itens`/`indicadores` | informação para o Conector e o log dele; nada que já estava mudou |
| `em` é ISO 8601 em UTC | o contrato não dizia o formato |
| A planilha sem item legível responde **422** `planilha-sem-itens` | o CSV chegou, o conteúdo é que não serve — e a TV fica com o de antes |
| Cabeçalho `X-Conector-Feed` no comunicado (o Conector manda; feed apagado = 404 `feed-desconhecido`) | apagar o feed no painel tira os comunicados dele; o Conector não fica sabendo |
| Pasta reservada `_feed-<chave>` (GET, PUT, DELETE), só foto, até 200, nunca playlist | a imagem do item do feed mora na intranet: o Conector baixa e sobe, e o comunicado aponta com `pasta:_feed-<chave>/<nome>` |
| `GET /comunicados[?feed=<chave>]` | o Conector que perdeu o `estado.json` ainda tira das TVs o que saiu do feed |
| Recusa do conteúdo é **422** (`nome-invalido`, `campo-invalido`, `imagem-invalida`, `imagem-nao-encontrada`), e não 400 | o Conector repete 400 e não repete 413/415/422: o nome que não serve não pode ser mandado de novo a cada minuto |
| O nome curto (`chave`) não muda depois de criado (400 `chave-fixa`) | o `conector.json` e os comunicados apontam para ele |
| O Conector manda o `.xlsx` com vírgula decimal e o percentual como o Excel mostra | `5.899` com ponto é milhar na leitura brasileira das planilhas |
| Erros com `code` (lista na seção 2) e `Retry-After` no 429 | o contrato pedia `{ error, code }`; os códigos são estes |

## 8. Testar localmente

```bash
PORT=6160 STORAGE=local SKIP_VERIFY=1 MT_INTEGRACAO_ESPERA_MS=150 node server.js
node --test test/integracoes.test.js
# contra um Postgres local:
TEST_DATABASE_URL='postgresql://mt@/multitelas?host=/caminho/do/socket' node --test test/integracoes.test.js
```

O Conector de verdade contra o servidor de verdade, de ponta a ponta
(pasta, subpasta, `.xlsx`, `.csv`, RSS com imagem, o que sai, o
compartilhamento fora do ar, o `estado.json` perdido, o feed apagado no
painel e o token revogado): `node --test test/conector-ponta-a-ponta.test.js`.
O download do instalador, com um "GitHub" local:
`node --test test/conector-download.test.js`.

`MT_INTEGRACAO_ESPERA_MS` encurta a espera antes de ir às TVs (padrão 10 s).
`MT_CONECTOR_REPO=desligado` tira do ar a busca do instalador no GitHub;
`MT_CONECTOR_GITHUB_TESTE=http://127.0.0.1:<porta>` troca a API do GitHub por
um servidor local (ignorado em produção).
`INTEGRACAO_HOST_TESTE=127.0.0.1:6161` deixa o teste servir a imagem de um
comunicado sem tocar a internet; é ignorado em produção.
