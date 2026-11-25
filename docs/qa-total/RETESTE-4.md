# Reteste 4 (22/11/2026) — parte A: o propósito, de ponta a ponta

A pergunta do dono: **"O propósito funciona? As funcionalidades básicas
funcionam?"** Esta parte responde com a conta que vai ao ar em 03/12: um RH
de metalúrgica (frente Empresas), 8 TVs, uma pasta de rede, uma planilha do
Excel e a intranet. A parte B (os modelos e a galeria) está em
`RETESTE-4-MODELOS.md`.

Base: o branch `claude/gifted-noether-0kd67e` em `f6b4b77` (tudo o que entrou
depois do reteste 3: operações em lote, piso de 4,5%, vigia do Android, kit de
lançamento, Integrações e o Conector). Servidor **local** (`PORT=6180
STORAGE=local AI_PROVIDER=dev`, banco novo; um segundo na 6181 com
`SKIP_VERIFY=1` para o robô da primeira TV). Nada de produção. A conta do RH
entrou como **cortesia** (`CONTAS_CORTESIA`), uma das três saídas do
[LANCAMENTO.md](../implantacao/LANCAMENTO.md) para as 8 TVs.

Fotos, scripts e logs: `/tmp/claude-0/-home-user-Multi-telas/b804d644-700b-5e83-ad8f-5fe2da78625e/scratchpad/reteste4a/`,
chamado aqui de `R4/` (fotos em `R4/shots/`, a primeira TV do Comércio em
`R4/cinco/`, logs em `R4/logs/`).

## A resposta direta

**O propósito funciona: sim, depois de dois consertos que eram bloqueadores
do dia 1.** Com eles, o RH monta as 8 TVs, põe o conteúdo do dia 1, liga a
pasta, o Excel e a intranet, e tudo aparece nas TVs, com a marca, sem corte e
sem texto de outro negócio.

Os dois bloqueadores (achados e consertados nesta rodada):

1. **O primeiro colega do RH que entrava no painel pausava 7 das 8 TVs.** Na
   conta em cortesia, cada login comparava só o e-mail de quem entrava com a
   lista; o membro convidado não estava nela, e a conta voltava para o grátis
   (1 TV no ar). As outras 7 mostravam "Esta TV está pausada: reative o plano
   em app.multitelas.net.br", e `/api/billing` dizia `"status":"free"`,
   `"pausa":{"noAr":["Recepção"],"pausadas":7}` (lido na TV Produção 1 e na
   API; as fotos dessa passada foram sobrescritas pela seguinte, já com o
   conserto). Agora a conta segue em cortesia enquanto alguém da equipe
   estiver na lista.
2. **Os aniversariantes importados não iam para nenhuma TV.** A página diz "o
   aniversário de cada um, que a TV mostra sozinha", mas a chave "Mostrar nas
   TVs" nascia desligada. O roteiro de treino do RH (item 6, "importar a
   planilha do Excel") terminava sem nada na TV. Agora a primeira importação
   liga em todas as TVs, e o aviso diz isso.

**As funcionalidades básicas funcionam: 31 de 34 sem ressalva, 3 com
ressalva pequena, 0 quebradas depois dos consertos** (antes: 2 quebradas, 16 com
ressalva e 16 sem). Tabela abaixo.

## As notas

Mesmo critério do reteste 3. Onde a rodada não mediu, fica a nota antiga.

| Bloco | Reteste 3 | Agora | Em uma frase |
|---|---|---|---|
| 1. A TV | 7,5 | **8,0** | O conteúdo real do RH entra inteiro nas 8 TVs, deitada e em pé; a logo escura agora lê no fundo escuro, o mural em pé ocupa a tela e o indicador do Excel mostra o "%" |
| 2. Criações da IA | 6,3 | — (6,3) | Sem a IA real (`AI_PROVIDER=dev`) |
| 3. Programação | 8,4 nos 7 sem IA | **8,4** | "Quando", Agenda, horário e relógio fora do horário funcionam; a leitura sem IA da Agenda juntava duas datas numa (consertado). Robô dos 7 cenários não refeito |
| 4. Telas e a página da TV | 9,0 | **9,0** | 8 TVs, grupos, Recarregar em 257 ms, Desfazer, backup e restauração, Reiniciar com o app; o menu falava "loja" na empresa (consertado) |
| 5. O resto do painel | 8,5 | **8,5** (era 7,5 antes dos consertos) | Aniversariantes não iam para a TV, "Rotulo" sem acento, "Veio 3 indicadores", "na TVs (3)" — todos consertados |
| 6. Site e e-mails | 8,5 | — (8,5) | Não medido |
| 7. A base | 8,5 | **8,5** (era 7,5 antes dos consertos) | A cortesia que caía no login do membro (consertada); 0 erro de página, 0 erro no servidor em toda a rodada |
| 8. A interface do painel | 8,1 | **8,3** | Primeira TV em 14 toques e 182 s; "E depois?" e "Hoje:" na língua da frente; a logo branca feita sozinha no passo 2 |
| Integrações (novo) | — | **8,5** | O Conector de verdade leva pasta, subpasta, Excel e RSS com imagem até as TVs; a API da intranet responde com erros claros. PowerPoint/PDF não testáveis no Linux |

**Nota geral provisória: 7,9 / 10** (era 7,7), mesma conta do reteste 3:
(8,0×2 + 6,3×2 + 7,13×2 + 9,0 + 8,5 + 8,5 + 8,5 + 8,3×2) ÷ 12 = 7,86 → 7,9. O
bloco novo de Integrações fica fora da conta para comparar com o reteste 3.

## O caminho do RH, passo a passo

### 1. Conta nova até a primeira TV (Empresas)

- Cadastro pela API, link `/app/?verify=` do log: cai direto em "Sua
  primeira TV" (`R4/shots/e01-verify.png`).
- Negócio "Indústria" → logo (PNG "ANDRADE" azul-marinho com hexágono) →
  cores → TV → "Comunicado da equipe" → título e texto → "Segunda a sexta,
  8h–18h" → **Pôr na TV**. A TV sai do código e, como era domingo 19h48, mostra
  só o relógio, como o passo avisa (`e05`, `e07`, `e11`, `e12`).
- **Achado:** a logo escura sumia no cabeçalho escuro e na espera da TV
  (`e03`, `e07`, todas as `tv-*-d-*`, o "ANDRADE" quase invisível). Consertado
  para quem manda a logo no passo 2: a versão branca é feita na hora, e o
  passo diz "A logo sumia no fundo escuro da TV: fiz uma versão branca para
  ele" (conferido na Saúde: `s01`, `s02`, `s05`; e no Comércio: o "Sol" que o
  reteste 3 achou ilegível agora lê, `R4/cinco/computador-13-a-tv.png`).
- **Achado:** "E depois?" oferecia "Planilha de preços — o preço muda na
  planilha" para o RH e para a clínica (`e11`). Agora: Empresas →
  Aniversariantes; Saúde → Chamada de senha; Comércio → Planilha de preços.
- **Achado:** Início e Criar diziam "Hoje: 🏷️ Black Friday — É a data de
  hoje" para o RH, cinco dias antes dela (`e13`). Agora a Black Friday é só do
  Comércio, e o texto diz "Faltam 5 dias"; o RH e a clínica veem "Hoje: 💙
  Novembro Azul — É o mês dela" (`s06`).
- A 2ª TV por Telas › Ligar uma TV, com nome; as outras 6 pela API, como o app
  faria. 8 TVs, 4 grupos (Recepção, Refeitório, Produção, Escritório), nomes e
  grupos pelo "Nome e grupo" (`e18`, `e20`, `e21`).
- Comércio pelo robô do repositório (`tools/cinco-minutos.mjs`): **14 toques,
  182 s** nos dois tamanhos (era 178 s; +4 s é a frase nova da logo), a TV
  mostrou o que a pessoa digitou, 0 erro de página (`R4/logs/cinco2.log`).

### 2. O conteúdo do dia 1

Tudo pelo painel (computador 1280×800; a gerente no celular 390×844), e
conferido nas TVs abertas em 1920×1080 e 1080×1920.

- **Prontos:** 22 peças de Empresas, nenhuma tela inteira ("As telas prontas
  do seu tipo de negócio estão chegando", `e23`) — é a galeria do operador,
  parte B. "Comunicado interno" › Usar › texto do RH › Pôr na TV no grupo
  Refeitório, "Até um dia" 10/12: na TV em seguida, inteiro (`e25`–`e31`).
- **Aviso rápido urgente** para as 8 TVs, pelo Criar: prévia, "Pôr em 8 TVs",
  Desfazer. Na TV, por cima de tudo com "AVISO IMPORTANTE" (`e34`, `e35-seq-8`).
- **Agenda:** "Colar o calendário" com 4 linhas do RH; revisão; 4 datas na
  programação em 8 TVs; "Natal" das datas prontas em 1 toque (`e37`–`e40`).
  **Achado:** "24/12 e 31/12 expediente até as 12h" virava um evento só, no
  dia 24, com o título "e 31/12 expediente…" (a leitura sem IA, que é a reserva
  quando a IA cai). Consertado: uma data, um evento, mesmo texto.
- **Campanha com "Quando":** Criar › campanha de segurança › Sem foto › gerada
  (regras, sem IA) › "Até um dia" 31/12 › 8 TVs, com Desfazer (`e95`–`e97`,
  `tv-refeit-camp-*`). O texto da campanha é o do modo sem IA (o pedido
  copiado, "AQUI TEM") — não vale como medida de conteúdo.
- **Aniversariantes:** `.xlsx` do Excel (12 pessoas, datas reais, setor e
  cargo) importado em 2 toques (`e41`–`e43`); a TV mostra "Feliz aniversário ·
  José Carlos da Silva · Operador de prensa · Hoje!" (`tv-prod1-d-3`,
  `tv-refeit-d-4`). **Bloqueador consertado:** sem ligar a chave à mão, nada
  ia para a TV.
- **Indicadores:** pelo token do sistema (curl com 3 números), manual (o tipo
  Indicador numa TV) e planilha ligada (CSV servido local): os três chegam e
  vão para a TV (`e45`–`e59`, `tv-prod1-d-2`). **Achados:** o valor "87,5%" de
  uma planilha sem a coluna Unidade perdia o "%", e a TV mostrava "87,5"
  (consertado: o "%" e o "R$" escritos na célula viram a unidade); "Veio 3
  indicadores" e "Dias sem acidente na TVs (3)." (consertados).
- **Mural:** criado, 2 fotos enviadas pelo endereço público, aprovadas,
  "Mostrar nas TVs" ligado: na TV no rodízio (`e60`–`e62`, `tv-prod1-d-6`).
  **Achado:** na TV em pé, duas fotos deitadas viravam duas tiras altas com a
  foto pequena e o resto vazio (`tv-prod1-p-7`). Consertado: a grade troca
  linhas por colunas na zona em pé (`tv-prod1-p-mural-depois`).
- **Senha:** não existe na Empresas (fica em Apps no Comércio e na Saúde).
  Na Saúde: "Chamar a próxima" → **181 ms** até a TV (`s07`, `s08`). **Achado:**
  a logo escura da clínica sumia no canto da tela da senha; consertado, ela usa
  a versão branca no fundo escuro (`s11`).
- **Aprovação com a gerente:** convite (código), cadastro, a chave ligada, a
  loja "Produção" só para ela. No celular ela vê só as 3 TVs da produção, usa
  "Aviso de alerta", o botão diz **"Pedir aprovação"**; o dono vê o sino com
  1, o antes e o depois, "Aprovar e pôr na TV" (`m01`–`m05`, `e69`–`e72`). A TV
  mostra "Use protetor auricular" (`tv-prod1-d-4`).
- **Horário:** Mais opções › Horário e aviso de queda (Portaria: segunda a
  sexta, 6h–18h, só o relógio fora). Fora do horário, a TV mostra o relógio
  (`e12`, `e74`, `e75`).
- **Desfazer:** na página da TV, "Tirar da TV" → Pôr na TV → Desfazer → "A TV
  voltou ao que estava", com Refazer (`e78`–`e80`).
- **Backup e restauração:** "Baixar JSON" de Produção 1 (8 itens, 41 KB) e
  "Restaurar de um arquivo" em Produção 2, com a pergunta antes (`e76`, `e81`,
  `e82`). **Achado:** o arquivo saía `multitelas-produ-o-1.json` (consertado:
  `multitelas-producao-1.json`).
- **Grupos e lojas:** 4 grupos; "Pôr na TV" por grupo; a gerente só com
  Produção (403/404 fora dela, coberto pelos testes da fase 13).
- **Recarregar:** a TV recarregou **257 ms** depois do toque (`e83`, `e84`).
  **Reiniciar:** aparece só na TV que diz ser o app ("App 1.0.9"), o comando
  chega no pulso seguinte (`R4/logs`, chamada de API).

### 3. Integrações

- Avatar › **Integrações** › Nova integração: o token aparece uma vez, com o
  endereço da API (`e85`–`e87`). Pasta "Avisos do RH" nos grupos Refeitório e
  Recepção, planilha "Metas da produção" (indicadores), feed RSS da intranet
  local, comunicados em todas as TVs (`e88`–`e94`).
- **O Conector de verdade** (`node conector/src/main.js testar` e `uma-vez`,
  token pela variável `MULTITELAS_TOKEN`, pastas locais): mandou 4 arquivos
  (com a subpasta `Dezembro/`), ignorou `~$rascunho.pptx`, `Thumbs.db` e
  `leia.txt` com o motivo, converteu e mandou o `.xlsx`, e os 3 itens do RSS
  (com as 2 imagens do item para a pasta `_feed-…`). 0,2 s. Em ~14 s o servidor
  foi às TVs (`tv.enviado` duas vezes) (`R4/conector-pc/conector.log`).
- **A API da intranet com curl:** criar, criar com `pasta:` como imagem, criar
  agendado (situação "agendado"); sem título → 422 "falta o título do
  comunicado."; imagem interna → 422 com a saída; token errado → 401 com o que
  fazer.
- **Nas TVs:** as fotos da pasta, os comunicados do feed e da intranet ("EM
  DESTAQUE · Festa de fim de ano", "COMUNICADO INTERNO · …") entram no rodízio,
  inteiros (`tv-refeit-d-*`, `folha-prod1-p.png`).
- **Achado (consertado):** o `.xlsx` em formato de porcentagem (Eficiência
  91,2%) chegava sem o "%" — o mesmo do item Indicadores. Conferido de novo
  pelo Conector: "Eficiência da linha 91,5 %", "Refugo 2,1 %".

### 4. Nas TVs (1920×1080 e 1080×1920)

Refeitório (navegador), Produção 1 (deitada e em pé), Recepção, Saúde e o
Comércio do robô. Em todas as fotos: **nenhum texto cortado nem sobreposto,
nenhuma imagem quebrada, nenhum texto de outro negócio**. O que ainda pesa:

- a **logo escura de conta já existente** (sem versão branca) segue sumindo
  no rodapé e na espera: o conserto vale para quem manda a logo no passo 2; a
  conta antiga precisa do "Melhorar" na Marca;
- a **foto deitada da pasta numa TV em pé** fica pequena, com margens (é a foto
  inteira, como o RH escolheu; `folha-prod1-p.png`);
- o **link do item do feed** aparece escrito na TV ("127.0.0.1:6187/noticias/…";
  na empresa, o endereço da intranet), útil só se for curto.

### 5. Erros no console e no servidor

Em toda a rodada (2 páginas, ~3 h): **0 erro de página** (`pageerror`), **0
resposta 5xx**, 0 erro no log do servidor. O que apareceu no console: 25
respostas 429 da previsão do tempo de fora (`api.open-meteo.com`), 401 do
`/api/auth/me` antes do login, cortes do tempo real quando o servidor
reiniciou (de propósito, para os consertos), e o 409 da pergunta "Esta TV
parece ser a TV 1?" ao parear uma TV com a anterior desligada.

### 6. Comércio e Saúde, a passada rápida

- **Comércio:** primeira TV pelo robô (14 toques, 182 s, a TV certa); Preços da
  planilha com CSV (4 itens, seções, "R$ 18,90" lido como 18.9); "Hoje: Black
  Friday — Faltam 5 dias".
- **Saúde:** primeira TV com logo escura (a versão branca feita e mostrada),
  "Hoje: Novembro Azul — É o mês dela", "E depois?" com a Chamada de senha,
  senha na TV em 181 ms, a logo da clínica legível na tela da senha.

## As funcionalidades básicas, uma a uma

✅ funciona · 🟡 funciona com ressalva · 🔧 estava quebrada ou errada, consertada nesta rodada.

| # | Funcionalidade | Antes | Agora | Passos | Fotos (`R4/shots/`) |
|---|---|---|---|---|---|
| 1 | Cadastro e confirmação pelo link | ✅ | ✅ | API + `/app/?verify=` | `e01` |
| 2 | Primeira TV em 7 passos (Empresas) | 🟡 | ✅ | negócio › logo › cores › código › tela › textos › horário › Pôr na TV | `e01`–`e12` |
| 3 | Primeira TV (Comércio, robô) | ✅ | ✅ | 14 toques, 182 s | `R4/cinco/` |
| 4 | Logo e cores na TV | 🟡 logo escura some | 🔧 versão branca no passo 2 | Mandar o logo | `e03`, `s01`, `s02`, `cinco/computador-13` |
| 5 | Parear pelo painel (Ligar uma TV) | ✅ | ✅ | Telas › Ligar uma TV › código e nome | `e15`–`e17` |
| 6 | 8 TVs, nomes e grupos | ✅ | ✅ | Nome e grupo | `e18`–`e21` |
| 7 | Plano/cortesia para 8 TVs | 🔧 7 pausadas no 1º login do membro | ✅ | Equipe › convite › membro entra | `/api/billing` (texto acima) |
| 8 | Peça pronta › Usar › Pôr na TV com "Quando" | 🟡 "Rotulo" | 🔧 ✅ | Prontos › Usar › Salvar › grupo › Até um dia | `e25`–`e31` |
| 9 | Aviso rápido para todas | 🟡 texto contraditório | 🔧 ✅ | Criar › texto › prévia › Pôr em 8 TVs | `e33`–`e35` |
| 10 | Campanha com "Quando" | ✅ | ✅ | Criar › Sem foto › Gerar › Até um dia | `e95`–`e97` |
| 11 | Agenda: colar datas | 🟡 duas datas numa | 🔧 ✅ | Colar › Ler › revisar › Pôr | `e37`–`e39` |
| 12 | Agenda: datas prontas | ✅ | ✅ | Pôr na programação | `e40` |
| 13 | "Hoje:" no Início e no Criar | 🟡 Black Friday no RH | 🔧 ✅ | Início | `e13`, `s06` |
| 14 | Aniversariantes do .xlsx | 🔧 não ia para a TV | ✅ | Pessoas › Escolher a planilha › Importar | `e41`–`e44`, `tv-*-d-3/4` |
| 15 | Indicadores pelo token | ✅ | ✅ | Receber do sistema › curl | `e46`, `e47` |
| 16 | Indicador manual | ✅ | ✅ | Abrir a TV › Adicionar › Indicador | `e55`, `e56` |
| 17 | Indicadores de planilha ligada | 🟡 "%" sumia | 🔧 ✅ | Ligar uma planilha | `e57`, `e58` |
| 18 | Mural | 🟡 feio em pé | 🔧 ✅ | Criar mural › fotos › Aprovar › Mostrar nas TVs | `e60`–`e62`, `tv-prod1-p-mural-depois` |
| 19 | Chamada de senha (Saúde) | 🟡 logo sumia | 🔧 ✅ | Chamar a próxima | `s07`–`s11` |
| 20 | Aprovação com a gerente | ✅ | ✅ | convite › chave › loja › pedir › aprovar | `m01`–`m05`, `e69`–`e72` |
| 21 | Horário e relógio fora dele | ✅ | ✅ | Mais opções › Horário | `e12`, `e74`, `e75` |
| 22 | Desfazer e Refazer | ✅ | ✅ | Tirar › Pôr › Desfazer | `e78`–`e80` |
| 23 | Backup e restauração | 🟡 nome do arquivo | 🔧 ✅ | Backup e cópia › Baixar › Restaurar | `e76`, `e81`, `e82` |
| 24 | Grupos e lojas (permissão) | ✅ | ✅ | Equipe › Escolher lojas | `e67`, `e68`, `m02` |
| 25 | Recarregar a TV | ✅ | ✅ | Mais opções › Recarregar (257 ms) | `e83`, `e84` |
| 26 | Reiniciar o app | ✅ | ✅ | aparece só com o app; comando no pulso | — |
| 27 | Menu da TV na língua da frente | 🟡 "a loja abre" | 🔧 ✅ | Mais opções | `e19` |
| 28 | Integrações: token, pasta, planilha, feed | ✅ | ✅ | Avatar › Integrações | `e85`–`e94` |
| 29 | Conector de verdade (`uma-vez`) | 🟡 "%" do Excel | 🔧 ✅ | `node conector/src/main.js uma-vez` | `R4/conector-pc/conector.log` |
| 30 | API da intranet (curl) | ✅ | ✅ | PUT/erros | — |
| 31 | Conteúdo nas TVs deitadas | 🟡 logo | ✅ | 8 TVs | `tv-refeit-d-*`, `tv-prod1-d-*` |
| 32 | Conteúdo nas TVs em pé | 🟡 mural | 🟡 foto deitada da pasta pequena | 1080×1920 | `folha-prod1-p.png` |
| 33 | Telas prontas para Empresas | 🟡 0 aprovadas | 🟡 (galeria, parte B) | Prontos › Telas inteiras | `e23` |
| 34 | Link do feed na TV | 🟡 | 🟡 o endereço interno aparece escrito | — | `tv-refeit-d-5` |

## Os bugs, com o lugar

Em ordem de gravidade. Todos os 🔧 foram consertados, cada um com teste.

| # | Gravidade | O que era | Onde (agora) | Teste |
|---|---|---|---|---|
| 1 | **Quebrado** | Login de um membro fora de `CONTAS_CORTESIA` devolvia a conta ao grátis: 7 de 8 TVs "pausadas" | `server/cortesia.js:74` (`contaNaLista`), `:91` | `test/cortesia.test.js` (2 testes novos) |
| 2 | **Quebrado** | Importar os aniversariantes não ligava "Mostrar nas TVs": nenhuma TV mostrava | `server/automaticos.js:80` (`ligarNaPrimeiraImportacao`), `server.js:1102`, `web/src/pages/BirthdaysPage.jsx` | `test/automaticos.test.js` (2 novos, um com servidor de verdade) |
| 3 | Errado | "87,5%" da planilha/Excel sem a coluna Unidade virava "87,5" na TV | `server/kpis.js:113` (`unidadeEscrita`), `:138` | `test/kpis.test.js` |
| 4 | Confuso | "Hoje: Black Friday — É a data de hoje" para Empresas e Saúde, 5 dias antes | `js/seasons.js:138`, `:163`, `:181`; `server.js:1322`; `web/src/lib/ideiaDaData.js:24` | `test/painel-coerente.test.js` |
| 5 | Confuso | "E depois? Planilha de preços" no fim da primeira TV do RH e da clínica | `web/src/components/primeira-tv/PassoPronto.jsx:44` | `test/primeira-tv.test.js` |
| 6 | Confuso | Agenda sem IA: "24/12 e 31/12 …" virava um evento com o título "e 31/12 …" | `server/calendario.js:104` | `test/calendario.test.js` |
| 7 | Confuso | Menu da TV na empresa: "Ex.: Recepção, Loja Centro", "Quando a loja abre" | `web/src/pages/ScreensPage.jsx:195` | `test/reteste4.test.js` |
| 8 | Confuso | Aviso urgente: "sai sozinho em 2 horas" e, logo abaixo, "até você tirar" | `web/src/components/tela/AvisoRapido.jsx:137` | `test/reteste4.test.js` |
| 9 | Feio | Logo escura sumia no cabeçalho, no rodapé e na espera da TV (o "Sol" do reteste 3) | `web/src/lib/logo.js:349` (`versoesQueFaltam`), `web/src/components/primeira-tv/PassoMarca.jsx:53` | `test/primeira-tv.test.js` |
| 10 | Feio | Logo escura sumia na tela da senha | `js/senha.js:175` | `test/reteste4.test.js` |
| 11 | Feio | Mural em TV em pé: duas tiras altas e vazias | `js/render.js:1963`, `css/player.css:453` | `test/reteste4.test.js` |
| 12 | Feio | "Rotulo", "Funcao", "Numero" no editor da peça | `web/src/components/content/EditarPeca.jsx:39` | `test/editar-qualquer-peca.test.js` |
| 13 | Feio | "Veio 3 indicadores"; "Dias sem acidente na TVs (3)." | `web/src/pages/IndicadoresPage.jsx:118`, `:221`; `web/src/pages/PlanilhasPage.jsx:165` | `test/reteste4.test.js` |
| 14 | Feio | Backup "multitelas-produ-o-1.json" | `web/src/pages/ScreensPage.jsx:770` | `test/reteste4.test.js` |
| 15 | Feio | "O que passa" e Aprovações: "Peça · Último dia da" (o título pela metade) e "Peça · modelo pronto" (o comunicado) | `web/src/lib/contentTypes.js:22` (`tituloDaPeca`) | `test/reteste4.test.js` |

`SHELL_CACHE` do `sw.js` subiu para `mt-shell-v98` (a TV baixa o CSS e o JS
novos). Outra tarefa pode ter subido para v98 também: reconciliar.

## O que ainda está errado ou feio, e por quê não foi consertado

- **Telas prontas da Empresas: 0 aprovadas.** É a galeria do operador (parte B
  prepara para o dono). O RH vê 22 peças e nenhuma tela inteira.
- **Logo escura de conta que já existe.** O conserto age no passo 2 da
  primeira TV; quem já tem logo sem versão branca precisa do "Melhorar" na
  Marca (o dono pediu "nunca troca calado" — trocar sozinho a logo de quem já
  usa ficou de fora).
- **Foto deitada da pasta numa TV em pé** fica pequena: é a foto inteira, como
  o RH escolheu. Resolve com "Preenchendo a tela" na pasta, ou fotos em pé.
- **O link do item do feed** vai escrito na TV (o endereço da intranet). É o
  contrato da API (`docs/INTEGRACOES.md` §3.6); decidir se o Conector deve
  mandar o link dos itens de feed.
- **O cartão "Ao vivo" do indicador** mostra "—" na lista do painel (a TV
  mostra o número). Só no painel.
- **A aprovação "Antes (agora na TV)"** desenha a primeira peça da lista, mesmo
  agendada para depois (o Natal, que entra em 05/12). Precisa conferir com
  calma (`R4/shots/e71-antes-depois.png`).
- **Primeira TV não pede o nome:** a TV vira "TV 1" (o RH renomeia em "Nome e
  grupo").
- **A pergunta "Esta TV parece ser a X?"** aparece ao parear uma TV do mesmo
  modelo com a anterior desligada há pouco. "Não, é outra TV" resolve, mas no
  dia D, com 8 boxes iguais, o instalador pode responder "Sim" por engano. Não
  é código: entrou o passo 5 em
  [ROTEIRO-DE-INSTALACAO.md](../implantacao/ROTEIRO-DE-INSTALACAO.md) ("Ligar e
  parear").
- **Não medido aqui:** a IA real, TVs e boxes de verdade, a conversão de
  PowerPoint/PDF do Conector (só no Windows), e-mail e pagamento, "Ver agora".

## Testes e régua

- **`env -u GITHUB_TOKEN npm test`: 2.196 de 2.197, 0 falhas, 1 pulado**
  (eram 2.061 no reteste 3). Os testes novos desta rodada: 2 em
  `cortesia.test.js`, 2 em `automaticos.test.js` (um com servidor de verdade),
  1 em `kpis.test.js`, 1 em `painel-coerente.test.js`, 2 em
  `primeira-tv.test.js`, 1 em `calendario.test.js`, 1 em
  `editar-qualquer-peca.test.js` e o arquivo novo `reteste4.test.js` (8). O
  `foto-qr.test.js` passou a desligar o "mostrar nas TVs" antes de conferir
  que, sem ele, o QR não vai (a primeira importação agora liga).
- `cd web && npm run build`: ok. `npm run lint:nomes`: limpo.
- **Régua** (`npm run regua`), uma TV por vez e uma página da bancada
  (`REGUA_TVS`, `REGUA_PAGINAS=1`: a máquina aguenta 2 contextos de navegador
  ao mesmo tempo, e a parte B roda junto):
  - **TV em pé, inteira: passou** (`R4/logs/regua-em-pé.log`, 2.735 s): tela
    cheia 14/14, bloco 14/14, a senha 1/1, peças-ouro em tela cheia 306/306,
    nas 11 marcas 3.366/3.366, texto sobre texto e cortado 12.471/12.471,
    telas prontas 101/101, contraste 13/13 e 13/13, cor da marca 14/14, texto
    padrão do "Adicionar" 0/18. A principal da quadrada com rodapé (só medida)
    segue em 981/1.122, como antes.
  - **Deitada e quadrada, os casos afetados** (`REGUA_SO=announce,text`: o
    aviso, o texto e a tela da senha, mais a bancada inteira, que roda sempre):
    **passaram** (`R4/logs/regua-so-deitada.log`, 2.702 s;
    `R4/logs/regua-so-quadrada.log`, 2.685 s). Senha 1/1 nas duas; tela cheia,
    principal com lateral, lateral e bloco 3/3; contraste e cor da marca 3/3;
    peças-ouro, as 11 marcas, os 12.471 cortes e as 101 telas prontas iguais à
    em pé.
  - O mural não tem caso na régua: a grade em pé foi conferida na TV aberta
    (`R4/shots/tv-prod1-p-mural-depois.png`) e no teste
    `reteste4.test.js`.
