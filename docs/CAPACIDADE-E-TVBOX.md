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
ao mesmo tempo** com folga de CPU (26% de um núcleo em média, 40% no pico,
pulso com p50 de 3 ms e p99 de ~120 ms). O teto de 2.000 **não é a CPU: é um
número no código** (`server/limites.js:141`, `DO_SERVIDOR = 2000` conexões do
tempo real). A TV 2.001 em diante não recebe o aviso na hora (só pelo pulso,
em até 30 s) e fica pedindo de 15 em 15 s — o que somou 35 pedidos por
segundo a mais e 9.660 linhas de log em 4 minutos com 500 TVs acima do teto.
A estimativa de "~500 TVs" de `docs/BILLING.md` §3.2 é conservadora: o
número medido é quatro vezes isso.

O que pesa de verdade é a **conta grande no painel**: abrir a página Telas de
uma conta com 300 TVs leva ~0,8 s e **trava o servidor inteiro por 200–290 ms**
(todas as TVs de todas as contas esperam), e três pessoas fazendo isso juntas
levaram o heap a ~1 GB. E o **aviso rápido para muitas TVs** não funcionava
acima de ~20 TVs com a programação de RH (o corpo do pedido passava de 2 MB).

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

⟨TABELA-RAMPA⟩

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

⟨TABELA-AB⟩

### 3.3 Memória por TV

O piso do heap (o menor valor de cada minuto, depois da coleta) subiu de
forma estável com as TVs e **não cresceu dentro de cada degrau** — não há
vazamento no servidor:

| TVs | piso do heap | piso do RSS |
|---|---|---|
| 0 | 16 MB | 116 MB |
| 1.000 | ~180 MB | ~450 MB |
| 1.500 | ~256 MB | ~530 MB |
| 2.000 | ~350 MB | ~700 MB |

**≈ 0,17 MB de heap e ≈ 0,3 MB de RSS por TV ligada** (socket do SSE, os
buffers dele, o relógio de 25 s do ping, o passe, os baldes dos limites). Os
picos acima disso (até 1,1 GB de heap e 1,5 GB de RSS) vêm do painel da conta
grande (3.5).

### 3.4 O gargalo, em ordem

1. **O teto fixo de 2.000 conexões de tempo real** (`server/limites.js:141`).
   É o limite real da instância hoje. Acima dele, cada TV excedente gera ~4
   pedidos por minuto à toa (passe + 503, `js/cloud.js:352` e `:448`) e uma
   linha de log `conexao.servidor-cheio` a cada tentativa
   (`server/limites.js:153`).
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
   com o `config` de ~96 KB), inclusive o pulso e o som, que não a leem.
   **Corrigido** (`db.getDeviceLeve`, só nas rotas que não leem a
   programação) — efeito medido em 3.2.

### 3.5 O painel da conta grande

⟨TABELA-PAINEL⟩

### 3.6 Teto da instância única e tamanho no Railway

- **Hoje: 2.000 TVs ligadas** por instância (o número do código). Até lá a
  CPU fica abaixo de metade de um núcleo e o banco em ~15% de um núcleo.
- **Subindo o teto** (`DO_SERVIDOR`) a CPU aguentaria, por extrapolação
  linear da tabela, ~1,0–1,2% de um núcleo por 100 TVs → **~4.000 TVs a
  ~50% de um núcleo**, mantendo metade de folga para o painel, deploys e
  rajadas. Esta máquina não é o vCPU do Railway (compartilhado, em geral mais
  lento): conte **~3.000 TVs por instância** como número de planejamento.
- **Memória:** ~300 MB de base + ~0,3 MB por TV + picos do painel. Para 2.000
  TVs: **reserve 2 GB** (piso de ~700 MB, picos de 1,5 GB com a página Telas
  de contas grandes). Para 3.000: 2–3 GB, e convém corrigir o item 2 de 3.4
  antes. No Railway o serviço cresce sozinho até o teto do plano e cobra o
  usado (US$ ~20 por vCPU/mês e ~10 por GB/mês na tabela de 2025 — confira a
  atual): 1 vCPU + 2 GB ≈ US$ 40/mês ≈ R$ 220/mês, dentro do piso de
  R$ 250 de `docs/BILLING.md` §3.2 para o app.
- **Postgres:** ~15% de um núcleo com 2.000 TVs (pulso com `UPDATE` de
  `last_seen`, ~67 por segundo). Um Postgres de 1 vCPU e 1 GB dá conta; o
  pool do app é o padrão do `pg` (10 conexões, `server/db-postgres.js:33`) e
  não foi gargalo.

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

⟨ANDROID⟩

---

## 7. O que mudou no código

⟨MUDANCAS⟩

---

## 8. Como repetir

⟨REPETIR⟩
