# Capacidade do servidor e resistência do TV box — MultiTelas RH

Medido em 14/11/2026, para a revenda da frente Empresas como **MultiTelas
RH** (Visitor, R$ 139 por TV/mês). Duas perguntas do dono:

1. **A produção aguenta a carga?**
2. **Um TV box barato, ligado por dias, não trava, não fica lento e não
   vaza memória?**

Tudo aqui foi medido **numa máquina local** (nada de produção foi tocado).
As ferramentas ficaram em `tools/carga/` para repetir (seção 8).

---

## 1. Resposta curta

**Servidor.** Uma instância só, como está hoje, atende **2.000 TVs ligadas
ao mesmo tempo** sem erro e com folga de CPU: 26% de um núcleo em média e
40% no pico, pulso com p50 de 3 ms e p99 de 117 ms, com três pessoas usando
o painel de uma conta de 300 TVs ao mesmo tempo. Com as duas correções deste
trabalho (3.4), a mesma carga caiu para **17% de CPU, p99 do pulso de 35 ms e
metade da memória** (RSS máximo de 1,3 GB para 0,55 GB).

O teto de 2.000 **não é a CPU: é um número no código**
(`server/limites.js:141`, `DO_SERVIDOR = 2000` conexões do tempo real). A
TV 2.001 em diante não recebe o aviso na hora (só pelo pulso, em até 30 s) e
fica tentando de 15 em 15 s: com 500 TVs acima do teto foram 35 pedidos por
segundo a mais e 9.660 linhas de log em 4 minutos. A estimativa de "~500
TVs antes de um container maior" (`docs/BILLING.md` §3.2) é conservadora: o
medido é quatro vezes isso, e o container não precisa crescer até lá.

O que pesa de verdade é a **conta grande no painel**: abrir a página Telas de
uma conta com 300 TVs leva ~0,8–0,9 s e **para o servidor inteiro por
200–300 ms** (todas as TVs de todas as contas esperam). E o **aviso rápido
para muitas TVs** não funcionava acima de ~20 TVs com a programação de RH (o
corpo do pedido passava de 2 MB) — agora pelo menos diz por quê.

**TV box.** ⟨SOAK⟩

**Limites.** Uma instalação de 300 TVs **esbarra duas vezes**: no 61º
aparelho do mesmo IP (60 TVs novas por hora por IP) e por volta da 300ª TV
(600 pedidos de painel em 5 minutos por conta). Detalhe e proposta na seção 4.

---

## 2. Como foi medido

**Máquina:** 4 núcleos, 16 GB, Linux; dividida com o teste da TV (um
Chromium com a CPU freada, ~2 núcleos) e com outro agente. A latência medida
é **pior** que a de uma máquina só para isso.

**Banco: Postgres 16 local** (socket Unix), como em produção — mesmo driver
(`server/db-postgres.js`, pool padrão de 10 conexões), mesmas consultas.
Diferenças para o Railway:

- sem rede entre o app e o banco (no Railway, a rede interna soma ~0,5–1 ms
  por consulta) e sem TLS na borda;
- sem a distância Brasil–EUA/Europa (120–200 ms de ida e volta): ela pesa
  para a TV e para quem usa o painel, não para a CPU do servidor;
- o proxy do Railway corta o SSE aos 15 min: **simulado** no gerador.

**O protocolo é o do player, não um "ping":** `tools/carga/carga-tvs.mjs`
faz, por TV, o que `js/player.js` (`bootCloud`), `js/cloud.js` e
`js/senha.js` fazem:

| O que a TV faz | Rota | De quanto em quanto | Onde no player |
|---|---|---|---|
| Ler a si mesma e a programação | `GET /api/devices/:id`, `GET …/config` | ao ligar e a cada aviso `config` do SSE | `js/cloud.js:186`, `:209` |
| Tempo real (SSE) | `POST …/passe` + `GET …/events?passe=` | aberto sempre; reabre em 2 s (ou 15 s se caiu logo) | `js/cloud.js:347–448` |
| Pulso | `POST …/heartbeat` | 30 s | `js/player.js:623` |
| Estado do som | `POST …/audio-estado` | 30 s | `js/player.js:553` |
| Chamada de senha | `GET …/senha` | **60 s, em toda TV** (mesmo sem senha ligada) | `js/senha.js:422` |
| Indicadores, planilhas | `GET …/kpis`, `GET …/planilhas` | 5 min | `js/player.js:632`, `:636` |
| Relatório de exibição | `POST …/exibicoes` | 5 min | `js/player.js:454` |
| Aniversariantes | `GET …/birthdays` | 6 h | `js/player.js:627` |

São **~5,7 pedidos por minuto por TV** (~0,095/s). A programação usada é a
de RH real (`tools/carga/programa-rh.cjs`): layout Corporativo, 8 peças-ouro
no principal (aniversariante, comunicado, dois indicadores, segurança com
foto viva, EPI, cardápio, institucional com foto viva), 3 na lateral,
cabeçalho e rodapé — **96 KB de JSON por TV**.

**Contas:** a primeira é a de RH grande (**300 TVs**, mais 23 aparelhos que
ficaram de uma instalação interrompida — 323 na conta), as outras de 100
TVs. Três pessoas no painel da conta grande, cada uma a cada ~15 s: página
Telas (`GET /api/devices?agora=1`), programação de 25 TVs, "Ver a tela
agora", publicar numa TV, e o **aviso rápido em 20 TVs** (`POST /api/lote`).

**Degraus:** 100 → 250 → 500 → 1.000 → 1.500 → 2.000 → 2.500 TVs, cada um
com 60 s de rampa e **4 min firmes** medidos. A sonda (`tools/carga/sonda.cjs`,
carregada com `node --require`) grava CPU, RSS, heap, atraso do event loop e
sockets do processo a cada 5 s.

---

## 3. Servidor: resultados

### 3.1 Por degrau (com as três pessoas no painel)

Código de antes das correções. Latências em ms (p50 / p95 / p99), medidas no
cliente; CPU em % de **um** núcleo; RSS e heap são o **máximo** da janela.

| TVs | pedidos/s | pulso | senha | config pelo SSE | erros | CPU Node média / pico | CPU Postgres | RSS máx | heap máx | event loop p99 / pior | sockets |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 100 | 10 | 4 / 9 / 29 | 5 / 9 / 33 | 61 / 95 / 120 | 0,04% | 7% / 28% | – | 332 MB | 167 MB | 2,5 / 282 | 121 |
| 250 | 24 | 4 / 8 / 28 | 5 / 8 / 26 | 55 / 81 / 84 | 0% | 8% / 19% | 4% | 400 MB | 213 MB | 2,1 / 235 | 272 |
| 500 | 48 | 4 / 12 / 108 | 5 / 14 / 122 | 53 / 96 / 108 | 0% | 14% / 38% | 7% | 554 MB | 357 MB | 3,5 / 293 | 528 |
| 1.000 | 94 | 3 / 17 / 51 | 4 / 14 / 40 | 49 / 78 / 93 | 0,08% | 19% / 30% | 10% | 588 MB | 336 MB | 3,8 / 217 | 1.040 |
| 1.500 | 141 | 3 / 20 / 49 | 4 / 22 / 75 | 55 / 86 / 100 | 0,01% | 24% / 35% | 12% | 679 MB | 400 MB | 4,2 / 230 | 1.550 |
| 2.000 | 189 | 3 / 26 / 117 | 3 / 27 / 85 | 55 / 89 / 94 | 0,01% | 26% / 40% | 15% | 1.327 MB | 1.042 MB | 4,2 / 240 | 2.089 |
| 2.500 | 268 | 4 / 40 / 217 | 4 / 41 / 180 | 62 / 133 / 144 | **12%** (tempo real recusado) | 35% / 50% | 21% | 1.519 MB | 1.195 MB | 5,7 / 229 | 2.132 |

A "config pelo SSE" é a TV buscando a programação de 96 KB logo depois de
um aviso de publicação; o aviso em si chegou às TVs em **menos de 3 ms** em
todos os degraus (do `PUT`/lote ao evento no SSE).

Notas:
- Os erros de 0,04–0,08% são `ECONNRESET` de conexão mantida que o Node fecha
  aos 5 s de ociosidade (`keepAliveTimeout`) no instante em que o gerador a
  reusa — artefato do teste; no Railway quem reusa é o proxy dele.
- No degrau de 2.500, os 12% de erro são o tempo real recusado (503) para as
  ~500 TVs acima do teto de 2.000 (`server/limites.js:141`): 7.921 recusas em
  4 min, e `tv:passe` subiu de ~2 para 35 pedidos/s. As TVs continuaram
  exibindo e pulsando.
- "CPU do Node" é % de **um** núcleo: o JavaScript do servidor roda num
  núcleo só, mais núcleos não aumentam o teto do event loop.

### 3.2 Só TVs (sem painel), antes e depois da correção do item 3.4

A mesma frota, sem ninguém no painel (isola o custo da TV), 3 min firmes:

| | TVs | pulso p50/p95/p99 | senha p50/p95/p99 | CPU Node média / pico | CPU Postgres | RSS máx | heap máx | event loop p99 |
|---|---|---|---|---|---|---|---|---|
| antes | 1.000 | 3,2 / 6,6 / 12,5 | 3,7 / 7,1 / 14,0 | 17,5% / 20,3% | 9% | 410 MB | 200 MB | 2,1 ms |
| **depois** | 1.000 | 2,5 / 4,7 / 7,9 | 1,7 / 3,2 / 5,3 | **8,5% / 11,8%** | 6% | **144 MB** | **41 MB** | 1,2 ms |
| antes | 2.000 | 3,9 / 10,0 / 17,7 | 4,3 / 9,8 / 16,4 | 27,8% / 37,9% | 21% | 942 MB | 704 MB | 3,3 ms |
| **depois** | 2.000 | 2,8 / 6,2 / 10,0 | 1,9 / 4,2 / 7,1 | **16,1% / 21,4%** | 12% | **154 MB** | **51 MB** | 1,7 ms |

E com as três pessoas no painel, depois da correção:

| TVs | pulso p50/p95/p99 | CPU Node média / pico | CPU Postgres | RSS máx | heap máx | pior travada do event loop |
|---|---|---|---|---|---|---|
| 1.000 | 3,1 / 10,2 / 57,6 | 13,8% / 33,1% | 8% | 335 MB | 174 MB | 305 ms |
| 2.000 | 2,4 / 9,4 / 35,0 | 16,7% / 37,6% | 11% | 551 MB | 330 MB | 247 ms |

O que sobra de pior caso (a travada de ~250–300 ms e os picos de memória) é
o painel da conta grande (3.5), não as TVs.

### 3.3 Memória por TV

**Não há vazamento no servidor:** o piso do heap (o menor valor de cada
minuto) ficou parado dentro de cada degrau e só subiu quando entraram TVs.

- **Antes da correção** o piso subia ~0,17 MB por TV (180 MB com 1.000, 350
  MB com 2.000) e o RSS ~0,3 MB por TV — mas isso era **lixo em trânsito**:
  cada pulso trazia do banco uma programação de 96 KB que virava texto no
  heap até a próxima coleta.
- **Depois da correção**, só TVs: 144 MB de RSS com 1.000 e 154 MB com
  2.000 — **≈ 10 KB por TV ligada** (o socket do SSE, o relógio de 25 s do
  ping, as entradas nos mapas de conexões e limites). A memória do servidor
  passa a ser decidida pelo painel, não pelas TVs.

Os picos (até 1,1 GB de heap antes, 330 MB depois) coincidem com a página
Telas da conta grande (3.5).

### 3.4 O gargalo, em ordem

1. **O teto fixo de 2.000 conexões de tempo real** (`server/limites.js:141`).
   É o limite real da instância hoje. Acima dele, cada TV excedente gera ~4
   pedidos por minuto à toa (passe + 503, `js/cloud.js:352` e `:448`) e uma
   linha de log `conexao.servidor-cheio` a cada tentativa — 9.660 linhas em
   4 min. **O log foi corrigido** (um aviso por minuto, com a contagem); o
   teto em si continua 2.000 de propósito (3.6).
2. **A página Telas de uma conta grande** — `GET /api/devices?agora=1`
   (`server/routes/telas.js`, rota "Listar meus devices"): para cada uma das
   323 TVs lê a programação inteira do banco (`db.getDevice`, ~96 KB), passa
   pelo normalizador e pela marca (`configParaOPainel`) e devolve tudo num
   JSON de ~30 MB. Leva **0,7–0,9 s**, **trava o event loop 200–290 ms** (é o
   "pior" da tabela, em todos os degraus) e aloca 100–200 MB por chamada.
   Com 300 TVs × 3 pessoas, o heap passou de 1 GB.
3. **A senha perguntada por toda TV a cada minuto** (`js/senha.js:422`) lia
   **todas as TVs da conta** a cada pergunta só para saber o fuso
   (`server/routes/senha.js`, `daTela`): custo N² por conta — 300 TVs = 90 mil
   linhas por minuto. **Corrigido** (fuso guardado 1 min por conta).
4. **Cada pedido da TV trazia a programação inteira do banco** (`SELECT *`
   com o `config` de ~96 KB), inclusive o pulso e o som, que não a leem: a
   ~190 pedidos/s, eram ~18 MB/s de texto atravessando o driver do Postgres
   e o heap. **Corrigido** (`db.getDeviceLeve`, só nas rotas que não leem a
   programação — `server/routes/telas.js`, `SEM_PROGRAMACAO`): CPU do Node
   −42%, Postgres −40%, RSS de 942 para 154 MB com 2.000 TVs (3.2). Foi a
   maior diferença medida.

Com 1 e 3 corrigidos e 4 também, o que sobra como gargalo é **1 (o teto
fixo)** para o número de TVs e **2 (a página Telas)** para o tamanho de uma
conta.

### 3.5 O painel da conta grande

Três pessoas na conta de 323 TVs, cada uma fazendo uma coisa a cada ~15 s,
enquanto o resto da frota roda (ms, p50 / p95):

| TVs ligadas | Telas (`GET /api/devices?agora=1`) | aviso em 20 TVs (`POST /api/lote`) | publicar 1 TV | programação de 25 TVs | "Ver a tela agora" |
|---|---|---|---|---|---|
| 100 | 756 / 1.069 | 398 / 873 | 21 / 38 | 58 / 70 | 6 / 7 |
| 500 | 835 / 1.071 | 523 / 872 | 27 / 40 | 56 / 315 | 7 / 10 |
| 1.000 | 855 / 898 | 459 / 526 | 34 / 43 | 59 / 87 | 7 / 11 |
| 2.000 | 806 / 910 | 458 / 495 | 25 / 48 | 54 / 67 | 5 / 8 |
| 2.500 | 870 / 977 | 529 / 971 | 33 / 49 | 56 / 550 | 7 / 28 |

O painel **não piora com o número de TVs**; piora com o **tamanho da conta**.
A página Telas de 323 TVs custa ~0,8 s sempre, e é ela que faz as travadas
de 200–300 ms da coluna "pior" do event loop (3.1) e os picos de heap.
Proposta (não feita: muda o contrato da página): a lista sem a programação
(as miniaturas já sabem pedir em grupos de 25 por `GET
/api/devices/configs?ids=`, `web/src/api.js`, `lerConfigEmLote`) ou a
página em páginas de 50 TVs.

**Aviso para muitas TVs e o limite do corpo.** O aviso em 20 TVs (~1,9 MB)
foi o maior que coube: com 21 TVs da programação de RH o corpo passa de 2 MB
(`server.js:205`). Medido com `tools/carga/limites-conta.mjs`, no código de
antes e no de depois:

| Envio (programação de RH, 96 KB por TV) | corpo | antes | depois |
|---|---|---|---|
| 5, 10, 15, 20 TVs | 0,5–1,9 MB | 200 | 200 |
| 21, 25, 50 TVs | 2,0–4,8 MB | **conexão cortada** (`ECONNRESET`; o painel diz "sem conexão") | **413** "O envio ficou grande demais para um pedido só…" |
| 205 TVs (programação pequena) | <2 MB | **200, mas só 200 TVs gravadas** | **400** "Um envio vai para até 200 TVs… Nada foi enviado" |

### 3.6 Teto da instância única e tamanho no Railway

- **Hoje: 2.000 TVs ligadas por instância** — o número do código, não da
  máquina. Até lá a CPU fica abaixo de metade de um núcleo (40% de pico
  antes da correção, 21–38% depois) e o banco em 11–15% de um núcleo.
- **Subindo o teto** (`DO_SERVIDOR`), a CPU das TVs depois da correção é
  ~0,8% de um núcleo por 100 TVs (16% com 2.000, só TVs): por extrapolação
  linear, **~5.000 TVs a ~40% de um núcleo**, com a outra metade para o
  painel, deploys e rajadas. Esta máquina não é o vCPU do Railway
  (compartilhado, em geral mais lento) e o teste não passou de 2.500: o
  número de **planejamento é ~3.000 TVs por instância**, subindo o teto para
  3.000 e corrigindo a página Telas (3.5) antes.
- **Memória:** depois da correção, ~150 MB de base + ~10 KB por TV + os
  picos do painel (até ~400 MB com três pessoas na página Telas de uma conta
  de 300 TVs). **1 GB atende 2.000–3.000 TVs com folga**; antes da correção
  seriam 2 GB (picos de 1,3–1,5 GB). No Railway o serviço cresce sozinho até
  o teto do plano e cobra o usado (na tabela de 2025, ~US$ 20 por vCPU/mês e
  ~US$ 10 por GB/mês — confira a atual): **1 vCPU + 1 GB ≈ US$ 30/mês**,
  dentro dos R$ 250 de `docs/BILLING.md` §3.2. Só mais núcleos não sobem o
  teto: o JavaScript do servidor roda num núcleo.
- **Postgres:** 11–15% de um núcleo com 2.000 TVs (o pulso grava
  `last_seen` ~67 vezes por segundo). Um Postgres de 1 vCPU e 1 GB dá conta;
  o pool do app é o padrão do `pg` (10 conexões,
  `server/db-postgres.js:33`) e não foi gargalo.
- **TVs ligando juntas** (volta da energia na sede, ou o deploy que troca o
  service worker de todas): 300 TVs em 5 s — `tools/carga/tempestade.mjs` —
  chegaram à programação com p95 de 0,6 s, CPU de pico 53%, 82 MB
  baixados (o pacote do player vai comprimido). Na primeira instalação, com
  as fotos e os vídeos da foto viva (os do banco saem **do próprio
  servidor**, `pecas-ouro/videos/`, não do R2): **1,46 GB** para 300 TVs,
  p95 de 0,7 s até a programação; com cada TV lendo a 2 Mbps, o boot
  completo levou 13 s (p50) e o servidor ficou em 270 MB de RSS. Num
  escritório com 100 Mbps, esses 1,46 GB são ~2 min de link cheio: instale
  em grupos, ou ponha os vídeos do banco no R2.

Em receita: 2.000 TVs × R$ 139 = R$ 278 mil por mês para uma instância de
~R$ 250. **O servidor não é o problema de custo do MultiTelas RH.**

### 3.7 Escalar para mais de uma instância: o que exige e quando

Duas réplicas hoje **quebrariam**: cada TV conversa com uma réplica e o
painel com outra. Estado que mora na memória do processo:

| Estado | Onde | O que quebra com duas réplicas |
|---|---|---|
| Quem está no tempo real (`subscribers`) e o `broadcast` | `server.js:116`, `:256` | a publicação feita na réplica A não chega às TVs ligadas na B |
| Passes do SSE | `server/passes.js:28` | passe emitido na A, SSE aberto na B → 403 em toda reconexão |
| Comandos à espera do pulso | `server.js:399` | "recarregar" e "ver a tela" se perdem |
| "Ver a tela agora" e o estado do som | `server/routes/telas.js` (`estadosDaTela`), `server.js:119` | o painel lê vazio |
| Limites (`rateLimit` e o freio da conta) | `server/security.js:13`, `server/limites.js:65` | cada réplica conta sozinha: o limite vira N × o teto |
| Teto de conexões | `server/limites.js:143` | idem |
| Códigos do QR de foto | `server/foto-qr.js:30` | o código mandado por e-mail numa réplica não vale na outra |
| Trabalhos de IA em andamento | `server/jobs.js:37` | o resultado vai ao banco, mas o polling pode cair na réplica errada no meio |

**O caminho mais curto** é o próprio Postgres, sem serviço novo:
`LISTEN/NOTIFY` para o `broadcast` (uma réplica publica `NOTIFY tela, '{id,
evento, dados}'`, todas escutam e entregam às TVs que têm), e uma tabela
para passes, comandos e estados (curtos, com validade). Os limites podem
ficar por réplica com o teto dividido, ou ir para uma tabela. Redis é a
alternativa se o volume de `NOTIFY` passar de alguns milhares por segundo,
o que não acontece com este tráfego (as publicações são raras; o grosso do
tráfego é pulso, que não precisa de `NOTIFY`).

**Quando:** antes de ~2.000 TVs ligadas (o teto atual) se não quiser mexer no
número; até **~3.000** se subir o teto para 3.000–4.000 e corrigir a página
Telas. Com o preço de R$ 139, isso é ~R$ 400 mil/mês de receita — há tempo,
mas o trabalho (2–4 semanas com testes) deve começar quando a base passar
de **~1.500 TVs**. Antes disso há um passo mais barato: **separar as
réplicas por conta** não funciona sem o item acima (a TV e o painel da mesma
conta precisam cair no mesmo processo), então não vale a pena.

---

## 4. Limites que a instalação e a conta grande encontram

Medido com `tools/carga/limites-conta.mjs` e na própria instalação das
2.500 TVs:

| Limite | Onde | Valor | Quem esbarra | Medido |
|---|---|---|---|---|
| TV nova por IP (`POST /api/devices`, sem login) | `server/routes/telas.js:270` | 60/h por IP | o instalador ligando a 61ª TV do mesmo escritório (ou do 4G dele) | **a 61ª leva 429** com `Retry-After` de até 1 h |
| Freio do painel da conta | `server/limites.js:42`, `server.js:701` | 600 pedidos/5 min **por conta** (todas as pessoas juntas) | instalar 300 TVs (parear + publicar = 2 pedidos por TV); o aviso rápido para muitas TVs (o painel lê cada TV antes: `web/src/lib/rodar.js`, `gravarEmLote`) | **429 por volta da 300ª TV**; a instalação esperou 155 s |
| Erro de código de pareamento | `server/routes/telas.js:224–225` | 15 erros/10 min por IP e por conta | só quem digita errado (conta só o erro) | ok |
| Corpo do pedido | `server.js:205–211` | 2 MB | **aviso rápido em mais de ~20 TVs** com a programação de RH (~96 KB por TV) | conexão cortada (o painel dizia "sem conexão") → **agora 413 com o motivo** |
| TVs por envio em lote | `server/routes/telas.js:1232` | 200 | conta com mais de 200 TVs | gravava as 200 primeiras e respondia "ok" → **agora recusa inteiro com o motivo** |
| Plano Essencial | `server/plans.js:76` | 49 TVs | toda conta de RH com 50+ TVs | precisa de Enterprise (não se ativa pelo painel) |
| Medidor do player (nunca bloqueia) | `server/limites.js:56` | era 1.200/5 min **por conta** | toda conta com mais de ~43 TVs aparecia como "esbarrando" na supervisão (89 avisos `limite.estourado` em 20 min no teste) | **agora 150 por TV** |
| Tempo real por TV / por conta | `server/limites.js:138–140` | 4 por TV; máx(20, 4 × TVs) por conta | ninguém com TV saudável | ok |

**Corrigido neste trabalho** (com teste em `test/carga-rh.test.js`):

- o medidor do player é **por TV** (`server/limites.js`): a conta saudável de
  300 TVs não aparece mais como excesso, e a TV com defeito numa conta
  pequena — que antes ficava escondida abaixo dos 1.200 da conta — aparece,
  com o id dela;
- corpo acima de 2 MB responde **413 com o motivo** em vez de cortar a
  conexão;
- lote com mais de 200 TVs é **recusado inteiro, com o motivo** (antes
  perdia TV em silêncio).

**Proposto (não feito — mexe em regra de negócio ou no painel):**

1. **TV nova por IP: de 60 para 300 por hora.** A rota é pública, mas a
   tabela já se limpa sozinha (TV sem dono some em 7 dias,
   `server/db-postgres.js`, `limparVencidos`). 300/h cobre a instalação
   inteira de uma conta grande num escritório e ainda segura um laço.
   Alternativa mais fina: devolver a vaga quando a TV é pareada do mesmo IP.
2. **Freio do painel proporcional ao tamanho da conta**: `max(600, 3 × TVs)`
   por 5 min (900 para 300 TVs), como o teto do tempo real já é
   (`tetoDaConta`). Precisa da contagem de TVs da conta em cache (5 min,
   como o selo).
3. **O aviso rápido como operação, não como N programações.** Hoje o painel
   lê a programação de cada TV (1 pedido por TV) e manda todas de volta num
   corpo só (96 KB × TVs). Para 300 TVs isso é 300 pedidos de leitura (metade
   do freio da conta) e 29 MB de corpo. O certo é o servidor receber "este
   aviso nestas TVs" e aplicar em cada uma — um pedido de poucos KB. Até lá,
   o painel deveria mandar o lote em partes de até ~1,5 MB.
4. **Parceiro (Visitor) instalando:** um papel de operador/parceiro com o
   freio do painel 3× maior e a TV nova sem limite por IP quando o
   pareamento vem dele. Precisa de desenho de papel — não foi feito.
5. **Plano para 50–300 TVs**: o Essencial para em 49 (`server/plans.js:76`);
   a Visitor vai precisar de um plano (ou de um Enterprise ativado pelo
   operador) antes da primeira venda grande.

---

## 5. TV box: teste de resistência

⟨SOAK-COMPLETO⟩

---

## 6. O app Android (MultiTelas TV): contra travamento

Lido em `android/app/src/main/` (não há SDK Android nesta máquina; nada do
app foi compilado nem rodado aqui).

### 6.1 O que já existe

| Medida | Onde | Avaliação |
|---|---|---|
| Abre sozinho ao ligar | `AndroidManifest.xml` (categoria `HOME`), `AoLigar.java` (`BOOT_COMPLETED`, `QUICKBOOT_POWERON`, `MY_PACKAGE_REPLACED`), `MainActivity.java` `pedirSobreposicaoUmaVez` | **Bom.** No Android 10+ só funciona se o app for a tela inicial ou tiver "sobrepor a outros apps" — depende do instalador (`android/README.md`, passo 4). |
| Tela sempre acesa | `MainActivity.java`, `FLAG_KEEP_SCREEN_ON` | **Bom.** (A permissão `WAKE_LOCK` está declarada e não é usada; não faz falta.) |
| Processo do WebView morreu | `MainActivity.java`, `onRenderProcessGone` → recria o WebView | **Bom no Android 8+** (API 26). No Android 7 o renderizador mora no processo do app: a queda derruba o app. |
| App caiu por exceção Java | `MainActivity.java`, `reabrirSeCair` (alarme reabre em 2 s) | **Parcial.** Não pega queda nativa (o WebView morrendo com o app, no Android 7), nem o app morto pelo sistema por falta de memória, nem a morte que o Android causa ao **atualizar o WebView** pela Play Store. Nesses casos só volta se o app for a **tela inicial** (o Android reabre a tela inicial sozinho). |
| Vigia da página | `MainActivity.java`, `vigia`: a cada 60 s pergunta `!!(window.MTCloud && document.body)`; 3 "não" seguidos recarregam | **Tem dois buracos.** (a) Com o JavaScript **travado de verdade**, a resposta nunca volta, o contador de falhas nunca sobe e a página nunca é recarregada — o caso que o vigia existe para pegar. (b) Ele confere que o script subiu, não que a TV está andando: um palco parado numa peça responde "true". |
| Sem rede no boot | `MainActivity.java`, `onReceivedError` → "Procurando a internet…", tenta de novo em 15 s | **Bom.** Depois da primeira vez o player sobe do cache (service worker). |
| Recarregar pelo painel | Telas › Recarregar → comando `recarregar` (`server/routes/telas.js`, rota `comando`; `js/cloud.js:263`) | **Existe**, mas é `location.reload()` dentro da página: não age se o JavaScript travou, e não recria o WebView. |
| Recarga diária | — | **Não havia.** Agora o player faz (`js/vigia.js`, 6.3). |
| Atualizar o próprio app | `Atualizador.java` (3 min depois de abrir, depois de 6 em 6 h; instala com OK do controle) | Bom. |

### 6.2 O que falta (proposta, em ordem de valor)

1. **O vigia do app contar o silêncio como falha.** Hoje a falha só conta
   quando o JavaScript responde "false". Proposta para `MainActivity.java`:

   ```java
   private int semResposta = 0;
   // no run() do vigia, antes do evaluateJavascript:
   if (++semResposta > FALHAS_PARA_RECARREGAR) { semResposta = 0; reiniciarWebView(); return; }
   web.evaluateJavascript("(function(){return !!(window.MTCloud && document.body);})()", valor -> {
       semResposta = 0;                       // respondeu: o JavaScript está vivo
       if ("true".equals(valor)) falhasDoVigia = 0;
       else if (++falhasDoVigia >= FALHAS_PARA_RECARREGAR) carregar();
   });

   private void reiniciarWebView() {
       // Android 10+: mata o renderizador travado; onRenderProcessGone recria.
       if (Build.VERSION.SDK_INT >= 29 && web.getWebViewRenderProcess() != null) {
           web.getWebViewRenderProcess().terminate();
       } else {
           // Antes: reabre em 2 s (o mesmo alarme de reabrirSeCair) e sai.
           agendarReabertura(); android.os.Process.killProcess(android.os.Process.myPid());
       }
   }
   ```
2. **Recriar o WebView uma vez por dia** (às 4h, se o app está aberto há mais
   de 24 h). A recarga da página (6.3) devolve a memória do documento; a
   recriação devolve também a do processo do renderizador. No teste, o
   renderizador estabilizou em ~650–720 MB no modo completo (5.3) — num box
   de 2 GB isso é um terço da memória.
3. **Tela inicial obrigatória na instalação.** É a única garantia de voltar
   depois de: queda nativa, morte por memória e **atualização do Android
   System WebView** (que mata o app). O `android/README.md` já ensina; o
   painel deveria **mostrar no cartão da TV** se o app é a tela inicial (a
   ponte `MTApp` pode informar `isDefaultLauncher` no pulso) e o checklist da
   Visitor deveria exigir o teste "tirar da tomada e ver voltar".
4. **"Reiniciar o app" pelo painel**, além do "Recarregar": o comando chega
   à página (já chega, pelo SSE e pelo pulso), a página marca
   `window.MT_REINICIAR = true` e o vigia do app, que já pergunta a cada
   minuto, recria o WebView quando vê a marca. Sem método novo na ponte (a
   `Ponte.java` explica por que não abrir mais métodos para todo frame).
5. **Limpar o cache de mídia do service worker.** O `MEDIA_CACHE` de `sw.js`
   guarda toda foto e vídeo que a TV já mostrou e **nunca apaga**: uma conta
   que troca o vídeo toda semana enche o armazenamento de um box de 8 GB em
   meses. Proposta: a cada programação aplicada, apagar do cache o que não
   está mais nela (com uma folga de alguns dias).

### 6.3 O que foi feito no player (`js/vigia.js`)

Pequeno e com teste (`test/carga-rh.test.js`), roda em toda TV (app,
navegador de Smart TV, Fire TV):

- **Zona parada:** cada zona com rodízio avisa quando deveria trocar de novo
  (`schedule` em `js/player.js`). Passou 2 min da hora sem trocar — uma
  exceção no meio da troca deixa a zona sem o próximo relógio, para sempre —
  o vigia **cutuca a zona** (manda trocar). Se ela parar de novo em menos de
  10 min, **recarrega a página**.
- **Recarga da madrugada:** ligada há mais de 20 h, entre 3h e 5h da loja
  (o fuso do horário da TV), recarrega uma vez.
- **Nunca recarrega sem servidor** (o último pulso bom há menos de 2 min:
  numa TV sem service worker, recarregar sem rede seria trocar a programação
  pela página de erro do navegador) **e nunca duas vezes em 30 min** (a marca
  fica no `localStorage`).
- O pulso bom é marcado em `js/cloud.js` (`heartbeat`); o vigia sobe no
  `bootCloud` de `js/player.js`. `SHELL_CACHE` subiu para `mt-shell-v91`.

### 6.4 O box para comprar

- **Android 10 ou mais novo com Google TV / Android TV certificado** (Play
  Store de verdade): é o que mantém o *Android System WebView* atualizado.
  Box "Android 9/10" genérico sem certificação costuma vir com WebView 5x–6x
  e nunca atualiza (`docs/APARELHOS.md`).
- **2 GB de RAM no mínimo.** O renderizador sozinho usou 360–720 MB no modo
  completo com foto viva (5.3); com 1 GB, só modo leve e sem foto viva.
- **4 núcleos Cortex-A55 ou melhor** (Amlogic S905X4/S905Y4 ou equivalente),
  decodificação H.264 1080p por hardware (todos têm).
- **8 GB de armazenamento** ou mais (cache de mídia, 6.2 item 5) e **porta
  de rede cabeada**.
- **Homologar um modelo e comprar sempre o mesmo** (lote de box barato troca
  de chip sem avisar — `android/README.md`). Exemplo de perfil que atende:
  Xiaomi TV Box S (2ª geração), Google TV, 2 GB. Confirmar disponibilidade
  e versão antes de fechar a compra.

---

## 7. O que mudou no código

Tudo com teste em `test/carga-rh.test.js` (e a suíte inteira passando).

| Mudança | Arquivos | Efeito medido |
|---|---|---|
| As rotas da TV que não leem a programação vêm sem ela do banco (`getDeviceLeve`) | `server/db-postgres.js`, `server/db-sqlite.js`, `server/routes/telas.js` (`SEM_PROGRAMACAO`), `server/routes/senha.js` | 2.000 TVs: CPU 28% → 16%, Postgres 21% → 12%, RSS 942 → 154 MB, pulso p99 18 → 10 ms |
| A senha de cada TV não lê mais a conta inteira (fuso guardado 1 min) | `server/routes/senha.js` (`fusoDaConta`) | de N² para N por conta |
| Medidor do player por TV (150 em 5 min por TV, nunca bloqueia) | `server/limites.js`, `server/routes/telas.js`, `server/routes/senha.js` | a conta saudável grande sai da supervisão; a TV com defeito aparece com o id |
| Corpo acima de 2 MB: 413 com o motivo | `server.js` (`readBody`, `CORPO_GRANDE`) | aviso para 21+ TVs: "grande demais" em vez de "sem conexão" |
| Lote acima de 200 TVs: recusado inteiro, com o motivo | `server/routes/telas.js` (`LOTE_MAX`) | antes: 200 gravadas e "ok" para todas |
| Lotação do tempo real: um aviso de log por minuto | `server/limites.js` | 9.660 linhas em 4 min → 4 |
| O vigia da página (zona parada, recarga da madrugada) | `js/vigia.js` (novo), `js/player.js`, `js/cloud.js`, `player.html`, `web/src/lib/tvAoVivo.js`, `sw.js` (`mt-shell-v91`) | 6.3 |
| Ferramentas de medida | `tools/carga/` | seção 8 |

**Não mudou** (proposta, por ser regra de negócio, contrato do painel ou
app sem compilar aqui): o teto de 2.000 conexões, os limites de TV nova por
IP e do freio do painel, a página Telas da conta grande, o aviso rápido como
operação no servidor, o vigia do app Android e a limpeza do cache de mídia.

---

## 8. Como repetir

Tudo local; nada sai para a rede (sem chave de IA, sem e-mail, sem a busca
do APK, e o navegador do soak bloqueia todo endereço que não é o servidor
local). As portas usadas aqui foram 6090–6092.

```bash
# Postgres local (o usuário postgres não pode ser root): initdb + pg_ctl, só socket Unix.
PG='postgresql://mt@/multitelas?host=/caminho/do/socket'

# 1. Servidor com a sonda (CPU, RSS, heap, event loop, sockets a cada 5 s).
tools/carga/subir-servidor.sh 6090 /tmp/carga6090 "$PG"
node tools/carga/maquina.mjs > /tmp/maquina.jsonl &      # CPU do Postgres e memória livre

# 2. A rampa (instala a frota de verdade e liga as TVs por degraus).
CARGA_BASE=http://127.0.0.1:6090 CARGA_SAIDA=/tmp/carga CARGA_DEGRAUS=100,250,500,1000,1500,2000,2500 \
CARGA_PAINEL=3 CARGA_PSQL="-h /caminho/do/socket -U mt -d multitelas" CARGA_SONDA=/tmp/carga6090/sonda.jsonl \
  node tools/carga/carga-tvs.mjs
node tools/carga/tabela.mjs /tmp/carga /tmp/maquina.jsonl  # as tabelas deste relatório

# 3. Os limites (TV nova por IP, freio do painel, lote grande).
LIM_BASE=http://127.0.0.1:6090 LIM_PSQL="-h /caminho/do/socket -U mt -d multitelas" node tools/carga/limites-conta.mjs

# 4. A TV ligando junto (300 TVs em 5 s, com e sem a mídia).
TEMP_BASE=http://127.0.0.1:6090 TEMP_FROTA=/tmp/carga/frota.json TEMP_N=300 TEMP_MIDIA=1 node tools/carga/tempestade.mjs

# 5. O TV box: um navegador só, CPU 6× mais lenta, 1920×1080, publicação nova a cada 10 min.
tools/carga/subir-servidor.sh 6091 /tmp/soak6091 "$PG_SOAK"
SOAK_BASE=http://127.0.0.1:6091 SOAK_MIN=150 SOAK_CPU=6 SOAK_SAIDA=/tmp/soak node tools/carga/soak-tv.mjs
SOAK_LEVE=1 SOAK_MIN=45 ... node tools/carga/soak-tv.mjs   # o modo leve
node tools/carga/rss-arvore.mjs <pid do soak> > rss.jsonl  # memória por processo do navegador
```

Mais de 49 TVs numa conta exige o plano Enterprise, que não se ativa pelo
painel: o gerador grava `plan='enterprise'` direto no banco local
(`CARGA_PSQL`).
