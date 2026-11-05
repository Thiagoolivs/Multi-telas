# QA 03/11 — Usuários 11 (instalador), 12 (a TV na parede) e 19 (compatibilidade)

Testador: agente A. Versão: `main` em `62ac63e`, servidor local (`PORT=8101`
e `8102`, SQLite, `AI_PROVIDER=dev`, cobrança simulada). Chromium headless
via Playwright. Evidências (prints, logs e scripts) em
`/tmp/claude-0/-home-user-Multi-telas/b804d644-700b-5e83-ad8f-5fe2da78625e/scratchpad/qa/A/`
(subpastas `u11/`, `u12/`, `u19/`; scripts em `s/`).

Observação de ambiente: a máquina estava com carga 5 em 4 núcleos (outros
agentes rodando junto). Os números de CPU e quadros são do Chromium headless
sem GPU, com `Emulation.setCPUThrottlingRate 6`. Servem para comparar e achar
tendência (vazamento, travada), não como medida de uma TV real. A rede externa
estava bloqueada (open-meteo, RSS do G1, GitHub de dentro do servidor): clima ao
vivo e notícias por RSS **não foram testados** de verdade; o que se viu foi o
comportamento da TV quando esses serviços não respondem.

---

## Usuário 11 — Instalador de TV

**Quem é:** o técnico que vai à loja/clínica com o celular, liga a TV (ou o
TV box), pareia e vai embora. Quer: código e QR legíveis, parear em poucos
toques, TV em pé funcionando, e a TV voltar sozinha se perder o vínculo ou a
internet.

### Jornada

| # | O que fez | O que aconteceu | Tempo / toques | Print |
|---|---|---|---|---|
| 1 | TV 1920×1080 abre `/tv` | Redireciona para `/player.html?cloud=1`; código de 6 caracteres aparece | 1,0–1,3 s | `u11/01-tv1-pareamento-1920.png` |
| 2 | Lê a tela de pareamento | Código com 216 px, título 40 px, dica 26 px, QR 260 px: legível de longe. Em 1280×720 a caixa cabe (46→674 px de 720) | — | `u11/01c-tv-pareamento-1280.png` |
| 3 | Decodifica o QR (OpenCV) | `http://127.0.0.1:8101/app/?parear=L5JYRB` — URL certa, com o código | — | `u11/01b-qr.png` |
| 4 | Celular 390×844, logado, abre a URL do QR | Diálogo "Parear uma tela" já abre com o código preenchido | 0,3–0,7 s; 0 toques | `u11/02-cel-qr-dialogo.png` |
| 5 | Digita o nome "Recepção" e toca Parear | "Tela conectada… está mostrando 'Ótica Central · Semana do Sol'" | 0,4–2,5 s; 1 campo + 1 toque | `u11/03-cel-tela-conectada.png` |
| 6 | Olha a TV | Saiu do código e já mostra uma tela pronta com o nome da conta | 1,6–6 s após o toque | `u11/04-tv1-tela-pronta.png` |
| 7 | TV em pé 1080×1920 abre `/tv` | Código 173 px, QR 173 px; bem centrado | — | `u11/05-tv2-retrato-pareamento.png` |
| 8 | No painel: Telas › Parear tela, digita o código **em minúsculas** e o nome | Aceita (converte para maiúsculas), "Tela conectada" | 0,3–1,4 s; 4 toques | `u11/07-cel-parear-dialogo.png` |
| 9 | Olha a TV em pé | Recebeu uma tela pronta **deitada** espremida na vertical: metade de cima da principal vazia, lateral estreita com letra de ~11 px ("OFERTA VÁLIDA", "APROVEITE") | 0,5–2,5 s | `u11/08-tv2-retrato-tela-pronta.png` |
| 10 | Contas de **Saúde** e **Empresas** pareiam pelo mesmo diálogo | As duas TVs começam com "ÓCULOS DE SOL 30% OFF, R$ 189,90, 10x sem juros, oferta válida até sábado 25 de outubro" — com o nome da clínica/metalúrgica no topo | — | `u11/19-tela-pronta-saude.png`, `u11/19-tela-pronta-empresa.png` |
| 11 | Define horário e grupo "Loja Centro" na TV 1; depois a TV perde o vínculo (cookies + localStorage limpos, recarrega) | TV volta com código novo, como esperado | — | `u11/09-tv1-perdeu-vinculo.png` |
| 12 | Abre Telas no celular logo em seguida | A tela antiga ainda diz **"No ar"** e **não há botão Reconectar** (só aparece depois de 90 s sem sinal) | 0 botões | `u11/10-cel-telas-logo-apos.png` |
| 13 | Conta grátis: tenta o caminho óbvio, "Parear tela" com o código novo | **"limite do plano atingido (1 tela). Faça upgrade"** + botão "Ver planos". Nada sugere Reconectar | — | `u11/21-gratis-perdeu-vinculo-parear.png` |
| 14 | Espera 95 s, recarrega Telas | Aparece o aviso amarelo "Se ela estiver mostrando um código, toque em Reconectar" | — | `u11/11-cel-telas-fora-do-ar.png` |
| 15 | Reconectar › digita o código | A TV volta com a programação em 1,7 s | 2 toques + código | `u11/12-…`, `u11/13-tv1-reconectada.png` |
| 16 | Confere a tela reconectada no painel | Nome e programação vieram. **Grupo "Loja Centro" sumiu** e o **horário voltou ao padrão** (07–22, seg–sáb, "ligada") no lugar do configurado (todos os dias, "só relógio") | — | `u11/14-cel-apos-reconectar.png`, `u11/log.txt` |
| 17 | Horário de funcionamento: põe a TV em pé fora do horário com "só relógio" | Em 67 ms a TV troca para um relógio grande discreto ("14:41 · Terça-feira, 3 de novembro"); com "preta", tela preta; ao voltar o horário, volta em 151 ms | ≤ 0,2 s | `u11/15-tv2-fora-relogio.png`, `u11/16-tv2-fora-preta.png` |
| 18 | Sem internet: `context.setOffline(true)` e recarrega a TV | O service worker serve o player e a última programação; abrir `/tv` sem rede também funciona (redireciona do cache) | — | `u11/17-tv2-offline-recarregada.png`, `u11/18-tv2-offline-tv.png` |
| 19 | Rede volta; publica um rodapé novo | A TV recebe | 8,2 s | `u11/log.txt` |
| 20 | TV aberta num host (`localhost`), celular logado em outro (`127.0.0.1`) — simula `tv.multitelas.net.br` × `app.multitelas.net.br` | O QR aponta para o host **da TV**; o celular cai na tela de login ("a TV que mostrou o QR é conectada logo em seguida") | +1 login | `u11/20-qr-outro-host.png` |
| 21 | App Android (leitura de `android/`, `server/apk.js`, `.github/workflows/android.yml`) | Ver abaixo. `GET /apk/versao.json` e `/apk/ultimo.apk` respondem 404 ("nenhuma versão do app publicada"); o repositório tem **0 Releases** (`gh api …/releases` → 0) | — | — |

**App Android (não dá para rodar o APK; avaliação por leitura):**

- Bem pensado: abre direto em `/tv`, tela sempre acesa, VOLTAR não sai, vigia
  a cada 60 s recarrega se `window.MTCloud` sumir, recria o WebView se o
  processo de render morrer, reabre se o app cair, opção de tela inicial
  (HOME) e "sobrepor a outros apps" para abrir no boot do Android 10+, troca
  de servidor com 5× VOLTAR, atualização da moldura com sha256 + tamanho +
  pacote + versão conferidos e instalação com OK do controle. O README é
  claro e honesto (inclusive o "teste antes de sair da loja: tire da tomada").
- **De onde o instalador baixa o APK?** Hoje, só de *Actions › Artifacts*
  (exige conta no GitHub, expira em 90 dias). Não há Release publicado, então
  `/apk/ultimo.apk` dá 404 em produção também e a atualização remota (D41) não
  funciona. O painel diz "Na TV, abra o app MultiTelas TV" e não diz onde
  conseguir o app.
- A atualização precisa de alguém apertar OK no controle. TV de parede não tem
  ninguém: a moldura só se atualiza quando alguém passar por ela. É limitação
  do Android sem "device owner"; vale dizer isso no painel ("App novo: aperte
  OK no controle" já aparece no cartão — bom).
- `onReceivedError(WebView, WebResourceRequest, WebResourceError)` é API 23+;
  em Android 5/6 (minSdk 21) a página de erro é a do próprio WebView até o
  vigia recarregar (até 3 min).
- O README pede "WebView atualizado" mas não diz qual versão. O player hoje
  exige **WebView ≥ 64 para abrir** e **≥ 105 para as peças desenharem
  certo** (ver usuário 19). Box com Android 7–9 sem Play Store costuma ter
  WebView 5x–9x.
- Risco não testado: Android 5–7.0 não confia na raiz do Let's Encrypt
  (ISRG Root X1) desde 2024; se o domínio usar esse certificado, esses boxes
  nem conectam.

### Notas — Usuário 11

| Critério | Nota | Por quê |
|---|---|---|
| Fluxo | 6 | Pareamento por QR e por código é excelente (1–2 toques, TV muda em segundos), mas a TV perdida empurra para "faça upgrade" ou para uma tela duplicada, e o Reconectar só aparece depois de 90 s e esquece horário e grupo. |
| Confiabilidade da TV | 8 | Volta sem rede pelo service worker, `/tv` funciona offline, horário aplica em < 1 s, reconectar herda a programação; perde pontos pelo horário/grupo perdidos. |
| Profissionalismo (visual da TV) | 3 | A tela de pareamento é bonita, mas toda TV nova (de qualquer frente) nasce mostrando uma promoção de óculos com preço inventado e data vencida; a TV em pé recebe layout deitado. |
| Compatibilidade | 5 | Funciona no Chromium atual e no app; sem link de download do APK, sem Release, e boxes/TVs com navegador antigo quebram (ver 19). |

### Problemas — Usuário 11

| Gravidade | Onde | Como reproduzir | O que esperava | Evidência |
|---|---|---|---|---|
| **Bloqueador** | `web/src/lib/telasProntas.js:189` (`telaParaComecar`), `pecas-ouro/manifesto.json` (só `otica-semana-do-sol` está `aprovada`) | Cadastre uma conta **Saúde** ou **Empresas** (ou uma padaria em Comércio) e pareie pelo diálogo | A TV começar com algo da frente, sem preço nem oferta — ou com "Tudo certo" | `u11/19-tela-pronta-saude.png`: "CLÍNICA VIDA PLENA · ÓCULOS DE SOL 30% OFF · R$ 189,90 · 10x sem juros". Oferta e preço inventados na parede do cliente, em frente aos clientes dele; em clínica fere a própria regra da frente Saúde (sem preço/desconto, `docs/FRENTES.md`). Sem a 1ª opção, `telas.find(cabe)` cai na única aprovada para todos |
| **Grave** | peça `pecas-ouro/lateral-prazo.html:38` (campo `data` padrão "25 de outubro", `dia` "sábado") usada pela tela pronta | Pareie qualquer TV hoje (03/11) | Data não vencida, ou a peça sem data até o cliente preencher | `u11/04-tv1-tela-pronta.png`: "OFERTA VÁLIDA ATÉ SÁBADO 25 DE OUTUBRO" (e 25/10/2026 é domingo) |
| **Grave** | `web/src/pages/ScreensPage.jsx:388` — `telaParaComecar(…, null)` ignora a orientação; o painel já sabe que a TV está em pé (`info.w/h` do pulso, "1080×1920" no cartão) | Pareie uma TV 1080×1920 | Tela em pé, ou ficar em "Tudo certo" (a página Telas prontas até recusa: "esta TV está em pé") | `u11/08-tv2-retrato-tela-pronta.png` |
| **Grave** | Fluxo de TV que perdeu o vínculo: `ScreensPage.jsx:218-222` (Reconectar só com `!online`, janela de 90 s em `web/src/lib/deviceStatus.js:5`) e `PairDialog` sem detecção | TV pareada perde o armazenamento e volta com código; instalador abre o painel e toca "Parear tela" | O diálogo perceber que há uma tela da conta sem sinal e oferecer "É a TV X? Reconectar" | Grátis: `u11/21-gratis-perdeu-vinculo-parear.png` ("limite do plano… Faça upgrade"). Pago: vira uma 2ª tela (e o servidor sincroniza a cobrança, `server/routes/telas.js:227`), a antiga fica órfã |
| **Grave** | `server/routes/telas.js:440-445` (reconectar só move `name` e `config`) | Defina grupo e "Horário e aviso de queda" numa TV, faça ela perder o vínculo, Reconectar | Grupo, horário/alerta (coluna `expediente`) e demais ajustes irem junto | `u11/log.txt` linha "devices após reconectar": `grupo:""`, horário `07:00–22:00, ligada, 6 dias` (era todos os dias, "relogio"). Na próxima publicação `prepararConfig` apaga o horário da config também (`telas.js:127-128`) |
| **Grave** | Distribuição do app Android: `android/README.md` "Onde baixar", `server/apk.js`; 0 Releases no repositório | Procure no painel/site onde baixar o "app MultiTelas TV" que o diálogo manda abrir (`ScreensPage.jsx:500`) | Um link estável (`/apk/ultimo.apk` ou página "Baixar o app da TV") | `curl /apk/ultimo.apk` → 404; `gh api repos/…/releases` → 0 |
| Médio | `js/player.js:398` (QR usa `location.origin` da TV); cookie de sessão é só do host (`server/auth.js:17`) | TV em `tv.multitelas.net.br`, celular logado em `app.multitelas.net.br`, lê o QR | Cair no painel onde já está logado (QR com `APP_URL`) | Simulado com `localhost`×`127.0.0.1`: `u11/20-qr-outro-host.png` (pede login de novo). Produção **não testada** |
| Médio | `js/render.js:1887` + `js/peca-render.js:372` (falha do clima é ignorada e fica o texto do modelo) | Rede sem acesso a open-meteo (firewall de empresa, ou offline) | Esconder a temperatura | Cabeçalho mostra "27°" inventado em todos os prints (`u11/04…`, `u12/min*.png`) com o fetch falhando (`ERR_TUNNEL_CONNECTION_FAILED`); o item de clima, esse sim, cai no relógio |
| Médio | Diálogo de sucesso (`ScreensPage.jsx:418`) | Pareie | Não citar o nome de outra empresa | "está mostrando 'Ótica Central · Semana do Sol'" para a "Ótica Visão" / "Clínica Vida Plena" |
| Médio | `android/app/src/main/java/br/com/multitelas/tv/MainActivity.java` (`onReceivedError` só API 23+) | Box Android 5/6 sem rede no boot | A página "Procurando a internet…" do app | Leitura de código (não executado) |
| Polimento | Tela pronta, peça lateral | — | Acento do "Á" de SÁBADO não encostar no "ATÉ" | Parece uma vírgula: "ATÉ ," (`u11/04…`) |
| Polimento | Cabeçalho com relógio do aparelho × relógio de "fora do horário" com o fuso da conta (`js/player.js:2727` × `:711`) | Box com fuso errado | Os dois relógios usarem o fuso da conta | No teste (navegador em UTC) o cabeçalho dizia 17:41 e o "fora do horário" 14:41 |
| Polimento | Botão "Gerar outro código (tela nova)" 41 px, texto ~15 px, cinza | — | — | `u11/01-…` (discreto de propósito; ok) |

### O que está bom

- Pareamento por QR é o melhor que já vi nesse tipo de produto: abre o
  diálogo com o código, um toque e a TV muda sozinha (evento `pareada` pelo
  SSE + tela pronta). Código aceita minúsculas.
- Tela de pareamento legível a 3 m, bonita, cabe em 720p e em pé.
- Sem internet a TV não apaga: service worker serve o casco, `/tv` redireciona
  do cache, a última programação fica na tela; volta sozinha quando a rede
  volta (8 s até a nova publicação).
- Horário de funcionamento aplica na hora, com relógio discreto ou tela preta,
  e volta sozinho.
- O texto do painel para TV caída ("Confira se a TV está ligada… toque em
  Reconectar") é claro e no lugar certo.
- App Android bem desenhado para quiosque; README honesto.

---

## Usuário 12 — A TV na parede

**Quem é:** a TV de uma padaria, ligada o dia inteiro, numa TV box fraca.
Programação variada: cabeçalho (peça com relógio e clima), principal com
texto, foto enviada, peça pronta, clima, outra peça e relógio (10 s cada),
lateral com peças, rodapé com mensagens + notícias do G1.

### Jornada

| # | O que fez | O que aconteceu | Evidência |
|---|---|---|---|
| 1 | TV 1920×1080, CPU 6× mais lenta (CDP), pareada, foto enviada por `POST /api/media` (42 KB), programação variada por `PUT config` | Aplicada; giro confirmado print a print: texto → foto → peça → clima (sem rede, cai em relógio + cidade, elegante) → peça → relógio | `u12/giro-mosaico.png` |
| 2 | Rodou **25 min**, amostra por minuto (`Performance.getMetrics`, `Runtime.getHeapUsage`, quadros por rAF em 4 s) | Tabela abaixo | `u12/log.txt`, `u12/amostras.json` |
| 3 | Modo leve (`js/perf.js`) | Ligou sozinho: "medido em 5 quadros por segundo" (janelas 1,3,5,5,7 durante a montagem com CPU 6×). Depois disso, 53–60 fps estáveis | `u12/log.txt` |
| 4 | Troca pela **API** no minuto 9 | TV aplicou em **0,32 s** | `u12/log.txt` |
| 5 | Troca pelo **painel** (Biblioteca › Peças prontas › Usar › Salvar › Pôr numa TV), TV com CPU 6× | TV aplicou em **1,08 s / 0,94 s / 0,93 s** (3 trocas); toast "Na TV: 1 tela. Desfazer" | `u12/b-por-dialogo.png`, `u12/b-tv-*.png` |
| 6 | Rede derrubada do minuto 12 ao 15 (`setOffline`) | Programação seguiu na tela (palco montado, sem código de pareamento); publicação feita durante a queda chegou **0,5 s** depois da rede voltar (ver nota) | `u12/sem-rede.png` |
| 7 | Relógio | Hora certa, mas o relógio da peça do cabeçalho anda de 20 em 20 s: na virada do minuto fica até 20 s atrasado (nas amostras, "17:59" com o relógio do sistema já em 18:00) | `u12/log.txt` (linhas "relogio") |
| 8 | Erros de console em 25 min | Só falhas de rede para serviços externos (clima/RSS, bloqueados aqui) e `ERR_INTERNET_DISCONNECTED` durante a queda; **nenhum erro de página (pageerror)** | `u12/log.txt` (fim) |

Nota sobre o passo 6: a emulação de "offline" do Chromium não derruba
necessariamente conexões já abertas (o SSE pode ter sobrevivido). O teste
limpo de recuperação é o do usuário 11 (recarregar sem rede e voltar): 8,2 s.

**Medidas (CPU 6×, 1920×1080, modo leve ligado):**

| Medida (25 amostras, 1 por minuto) | mín / mediana / máx | Leitura |
|---|---|---|
| Thread principal ocupada (`TaskDuration`/tempo) | 12,9% / 16,2% / 20,2% | Folga grande mesmo com CPU 6× |
| — script | 1,3% / 2,0% / 2,6% | |
| — layout + estilo | 3,7% / 4,3% / 5,2% | |
| Quadros por segundo (rAF, 4 s) | 53 / 60 / 60 | Sem travadas |
| Pior quadro na janela | 17 / 33 / 133 ms | 133 ms uma vez (minuto 5), na troca de item |
| Memória JS (`Runtime.getHeapUsage`) | 3,4 / 4,1 / 4,3 MB | Sem tendência de subida |
| Memória JS após coleta de lixo | início **2,9 MB** → fim **3,4 MB** | +0,5 MB em 25 min, sem subida nas amostras: **sem vazamento aparente** (25 min não prova horas; vale repetir por uma noite no aparelho real) |
| Nós do DOM (`Nodes`) | 499 / 1001 / 1215 (início 588, fim 400) | Varia com o item no ar, não cresce |
| Ouvintes de evento | 55 / 58 / 59 (início 55, fim 55) | Estável |
| Requisições da TV | 174 em 25 min (122 à API) | ~7/min: pulso, passe do SSE, som, exibições |
| Erros de página (`pageerror`) | **0** | |
| Erros de console | 41: 24 `ERR_TUNNEL_CONNECTION_FAILED` (clima/RSS externos, bloqueados aqui), 17 `ERR_INTERNET_DISCONNECTED` (durante a queda) | Esperados no ambiente |
| Troca pela API / pelo painel | 0,32 s / 0,93–1,08 s | |

### Notas — Usuário 12

| Critério | Nota | Por quê |
|---|---|---|
| Confiabilidade da TV | 9 | 25 min sem erro de página, sem vazamento, sem travar; não apaga sem rede e pega a publicação ao voltar; trocas ao vivo em ~1 s. |
| Desempenho | 8 | Com CPU 6× a thread principal fica ~15% ocupada e a tela anda a ~60 fps no modo leve; o modo leve liga sozinho. A primeira montagem é pesada (5 fps nos primeiros segundos). |
| Profissionalismo (visual da TV) | 6 | Peças e transições bonitas, giro correto; mas temperatura "27°" inventada quando o clima não responde, conteúdo de exemplo de outro ramo (óculos e "exame de vista" numa padaria), relógio até 20 s atrasado. |

### Problemas — Usuário 12

| Gravidade | Onde | Como reproduzir | O que esperava | Evidência |
|---|---|---|---|---|
| Médio | `js/peca-render.js:370-372`, `js/render.js:1887` | TV sem acesso a `api.open-meteo.com` | Sem temperatura (ou "—"), nunca um número inventado | Cabeçalho "27°" em todos os prints de `u12/` com o clima falhando |
| Médio | Rodapé de notícias (`js/news.js`: direto, depois `api.allorigins.win`, depois `api.rss2json.com`) | Fonte G1 | Notícias | **Não testado** (sem rede externa). Duas das três rotas dependem de serviços gratuitos de terceiros; a TV cai nas mensagens, o que é correto |
| Polimento | `js/peca-render.js:356` (relógio da peça a cada 20 s) | Olhar a TV na virada do minuto | Relógio exato (tic alinhado ao minuto) | `u12/log.txt` |
| Polimento | `js/perf.js:42` (regex de TV) | — | Reconhecer o próprio app (`MultiTelasTV/` no UA, `MainActivity.java:127`), Fire TV atuais (`AFTMM`, `AFTKA`, `AFTR`), Chromecast, Mi Box | Ver usuário 19: nesses a medição pega em ~10 s, mas a primeira pintura é no modo caro |

### O que está bom

- Nenhum vazamento em 25 min, DOM estável, ouvintes estáveis, nenhuma exceção.
- Troca ao vivo pelo painel em ~1 s mesmo com CPU 6×, com "Desfazer".
- Modo leve liga sozinho e fica lembrado.
- A falha de um serviço externo não derruba nada: o clima cai no relógio, as
  notícias caem nas mensagens.

---

## Usuário 19 — Compatibilidade (Smart TV, TV box, iPhone)

**Quem é:** o cliente que liga a TV que já tem (Samsung, LG, TV box barato,
Fire TV) ou abre o painel no iPhone. Só há Chromium aqui: emulei os user
agents, li o código procurando recurso novo demais e simulei o que um
navegador antigo faria.

### Emulação de user agent (TV 1920×1080 / iPhone 13)

| Aparelho (UA) | Modo leve ao abrir | Depois de ~12 s | Layout | Painel descreve como | Print |
|---|---|---|---|---|---|
| Samsung Tizen 4 (Chrome 56) | Sim — "aparelho se identifica como TV" | Sim | Normal | "1920×1080 · Samsung" | `u19/tv-tizen4.png` |
| LG webOS 4 (Chrome 53) | Sim | Sim | Normal | "· LG" | `u19/tv-webos4.png` |
| Android TV (Mi Box, Chrome 101) | **Não** | Sim — "medido em 7 fps" | Normal | "· Android" | `u19/tv-androidtv.png` |
| Fire TV Stick 4K Max (AFTKA) | **Não** | Sim — medido | Normal | "· Android" | `u19/tv-firetv.png` |
| iPhone 13 Safari (UA) — player | Não | Não (ainda medindo) | Cabe em 390×664, sem rolagem lateral | "390×844 · **Mac**" | `u19/tv-iphone.png` |
| iPhone 13 — painel `/app` | — | — | Login sem erro, sem rolagem lateral | — | `u19/painel-iphone-login.png` |

Teste do detector (`js/perf.js` `ehTv`) com 16 UAs reais: pega Tizen, webOS,
Bravia e Fire TV antigo (`AFTT`); **não pega** TV box genérico Android,
Chromecast com Google TV, Mi Box, Fire TV 4K (`AFTMM`), 4K Max (`AFTKA`), Cube
(`AFTR`), Silk e **o próprio app MultiTelas TV**. O `\b` no fim de
`aft[bmst]` exige a sigla exata de 4 letras. A medição de quadros corrige
depois de ~10 s, então é Polimento.

**Importante:** a emulação de UA no Chromium 14x não reproduz o motor antigo.
Tizen 4 e webOS 4 "funcionam" aqui só porque o motor é novo. Por isso a
análise de código abaixo é o que vale.

### O player precisa de qual Chromium?

1. **Para abrir: Chromium ≥ 64.** O servidor junta os scripts do player num
   pacote só (`/js/tv.pacote.js`, `server/pacote-tv.js`). Cada arquivo vai num
   `try`, mas `try` não segura erro de **sintaxe**: um recurso de sintaxe novo
   em qualquer arquivo impede o pacote inteiro de compilar. Conferi com o
   acorn: o pacote **não compila como ES2017** (para no lookbehind de
   `js/peca-html.js:270`) e compila como ES2018. Simulei a falha de compilação:
   a TV fica para sempre em "INICIANDO EXIBIÇÃO" (`u19/sim-pacote-nao-compila.png`);
   no app Android o vigia recarregaria a cada 3 min, sem fim.
2. **Para as peças desenharem certo: Chromium ≥ 105.** Todas as peças
   (telas prontas, peças-ouro, cabeçalho e rodapé com peça) medem tudo em
   `cqw/cqh` e usam `@container`, sem alternativa. Simulei um navegador sem
   container queries (removendo as regras como um navegador antigo removeria):
   a tela pronta vira texto de 16 px empilhado no canto, com textos
   sobrepostos (`u19/sim-sem-cq.png`, comparar com `u19/sim-com-cq.png`). O
   item de texto simples se salva porque `css/player.css:1227` tem
   `@supports (width: 1cqw)` com tamanhos em `vw` antes
   (`u19/sim-sem-cq-texto.png`), mas o rodapé não (fica 16 px).

Referência de motores: Tizen 4 (TVs 2018) ≈ Chromium 56; Tizen 5 (2019) ≈ 63;
Tizen 5.5 ≈ 69; Tizen 6 ≈ 76; Tizen 6.5 ≈ 85; Tizen 7 (2023) ≈ 94; webOS 4
(2018–19) ≈ 53; webOS 5 ≈ 68; webOS 6 ≈ 79; webOS 22 ≈ 87. Ou seja: **pelo
navegador da própria TV, praticamente nenhuma Samsung ou LG anterior a 2024
mostra as peças direito, e as de 2018–2019 não abrem o player.** Fire TV e TV
box Android dependem da versão do WebView (Fire TV 4K: Chromium 70 em muitos
aparelhos → abre, mas peças quebradas).

### Recursos novos no player (arquivo:linha, mínimo, alternativa)

JavaScript (scripts do `player.html` + `sw.js`; varredura com `@babel/parser`,
script em `s/compat.js`):

| Recurso | Chrome mín. | Onde | Alternativa? |
|---|---|---|---|
| Regex `\p{L}` com `u` | 64 | `js/peca-html.js:573` | Não — erro de sintaxe derruba o pacote todo |
| Regex lookbehind `(?<!…)` | 62 | `js/peca-html.js:270`, `:321` | Não — idem |
| Spread de objeto `{...x}` | 60 | `js/seasons.js:234`, `:243`, `:260` | Não — idem |
| `async/await` | 55 | 49 lugares (`js/storage.js:435`, `js/news.js:63`, `js/cloud.js`, `js/player.js`…) | Não — webOS 4 (Chrome 53) não compila |
| `AbortController` | 66 | `js/news.js:30` | Não (sem guarda); só notícias |
| `Intl … hourCycle` | 73 | `js/expediente.js:73` | Ignorado em versões antigas (pode dar "24:xx" à meia-noite) |
| `ResizeObserver` | 64 | `js/peca-render.js:312`, `js/player.js:2482` | Sim — `typeof ResizeObserver !== 'undefined'` |
| `globalThis` | 71 | vários | Sim — `typeof window !== 'undefined' ? window : globalThis` |
| Optional chaining `?.`, `??`, `??=`, campos de classe, `replaceAll`, `.at()`, `structuredClone` | 80–98 | **nenhum** no player | — (bom) |

CSS (`css/player.css`, CSS embutido de `js/peca-render.js`, `pecas-ouro/*.html`; script `s/csscan.js`):

| Recurso | Chrome mín. | Onde | Alternativa? |
|---|---|---|---|
| `text-wrap: balance` | 114 | `css/player.css:298,1032,1108`; peças (26×) | Sim — só deixa de equilibrar |
| `color-mix()` | 111 | `css/player.css:344,345,367,402,446` (+31) | **Não** — fundos/bordas somem (sem cor antes) |
| `cqw/cqh` | 105 | `css/player.css:186,199,206…` (273×), `js/render.js:1060`, `pecas-ouro/*.html` (1150×) | Parcial: `css/player.css:186` (`1.4vw` antes) e o `@supports` de `:1227` para texto/relógio/clima/aniversário; **peças: nenhuma** |
| `@container` / `container-type` | 105 | `css/player.css:133,200,218,381,496,721…`, `js/peca-render.js:118-123`, peças (94×) | Não |
| `:has()` | 105 | `js/peca-render.js:130`, peças (6×) | Não — sobra a moldura vazia do QR sem link |
| `translate/scale/rotate` (propriedades soltas) | 104 | `js/peca-render.js:50-56` (entradas das peças) | Degrada para só opacidade (aceitável) |
| `overflow: clip` | 90 | `css/player.css:579` | Não |
| `aspect-ratio` | 88 | `css/player.css:642,753,864,1007,1096` | Não (em geral há `width` + `max-width`) |
| `:where()` | 88 | `js/peca-render.js:124-126` | Não — reset das peças cai |
| `inset:` | 87 | `css/player.css:59,71,80,106,111…` (+25), `js/peca-render.js:119-123`, peças | **Não** — em Chromium 76–86 (Tizen 6/6.5, webOS 6) camadas absolutas/fixas (splash, fundo, palco da peça) perdem o tamanho |
| `gap` em flex | 84 | `css/player.css:43,113,199…` (+49), peças (128×) | Não — itens grudados |
| `clamp()`, `min()`, `max()` | 79 | `css/player.css:266,277…` (+80) | Parcial (`:186`) |
| `backdrop-filter` | 76 | `css/player.css:125,126,838,1179…` | Sim — o modo leve tira |

### Painel (`web/`)

- `web/vite.config.js` não define `build.target`: vale o padrão do Vite 5
  (`es2020`, `chrome87`, `safari14`, `firefox78`, `edge88`). No `web/dist` não há
  lookbehind, `?.` foi rebaixado, nenhum `color-mix`, `:has`, `@container`,
  `dvh`, `text-wrap` ou `@layer` no CSS.
- **iPhone Safari 15/16 abre o painel** (pela sintaxe e CSS do pacote). Ressalva:
  `structuredClone` (Safari ≥ 15.4) em `web/dist/assets/ContentEditorPage-*.js`
  — num iOS 15.0–15.3 o editor de conteúdo quebra ao editar. `backdrop-filter`
  já vem com `-webkit-`. Safari real **não testado** (só UA emulado no
  Chromium: login sem erro e sem rolagem lateral, `u19/painel-iphone-login.png`).

### Notas — Usuário 19

| Critério | Nota | Por quê |
|---|---|---|
| Compatibilidade | 3 | Painel ok para iPhone 15.4+; o player exige Chromium 64 para abrir e 105 para as peças, sem alternativa — fora do Chromium atual e de TV box com WebView atualizado, o conteúdo principal do produto quebra. |
| Profissionalismo (visual da TV) | 4 | Onde roda, é bonito; num navegador de TV de 2019–2023 as peças viram texto miúdo sobreposto, e nas de 2018 a TV fica em "Iniciando exibição". |
| Desempenho | 7 | O modo leve liga para Tizen/webOS pelo nome; TV box/Fire TV/app só depois de medir (~10 s). |

### Problemas — Usuário 19

| Gravidade | Onde | Como reproduzir | O que esperava | Evidência |
|---|---|---|---|---|
| **Bloqueador** (se a venda inclui "abra no navegador da sua Smart TV") / Grave (se só TV box com WebView novo) | Peças em `cqw/cqh` + `@container` (`pecas-ouro/*.html`, `js/peca-render.js:118-123`), sem alternativa | Qualquer navegador com Chromium < 105: Tizen ≤ 7, webOS ≤ 22, Fire TV com WebView 70 | Peças legíveis (fallback em `vw/%`, ou converter `cq*` para px em JS quando `CSS.supports('width','1cqw')` for falso) | `u19/sim-sem-cq.png` × `u19/sim-com-cq.png` |
| **Grave** | Sintaxe ES2018 no pacote do player: `js/peca-html.js:270,321,573`, `js/seasons.js:234,243,260`; `async` em 49 lugares | Chromium < 64 (Tizen 4/5, webOS 4) | Pacote compilado para o alvo das TVs (ex.: esbuild `--target=chrome56` na montagem do `server/pacote-tv.js`) e uma tela "navegador não suportado" em vez do splash eterno | `node s/acorncheck.js tv.pacote.js` → falha em ES2017; `u19/sim-pacote-nao-compila.png` |
| Grave | Documentação/venda | — | Dizer qual TV/navegador/WebView é suportado (mínimo), no README do Android, na landing e no painel; o "Na TV, abra tv.multitelas.net.br" promete qualquer Smart TV | `README.md` ("numa Smart TV, num TV Box…"), `android/README.md` ("WebView atualizado") |
| Médio | `color-mix()` sem cor antes: `css/player.css:344,345,367,402,446…` | Chromium < 111 | Uma cor sólida antes (o mesmo padrão já usado em `:186`) | Varredura `s/csscan.js` |
| Médio | `inset:` e `gap` em flex sem alternativa | Chromium 76–86 | `top/right/bottom/left: 0`; margens | Varredura |
| Polimento | `js/perf.js:42` | Mi Box, Fire TV 4K/Max/Cube, Chromecast, o app MultiTelas TV | Modo leve já na primeira pintura (acrescentar `multitelastv`, `aft[a-z]{2,4}`, `chromecast`, `mibox`, `silk`) | `u19/log.txt` |
| Polimento | `js/aparelho.js:23` | Celular iPhone usado como tela | "iPhone", não "Mac" (o UA do iPhone tem "like Mac OS X") | `u19/log.txt` |
| Polimento | `web/dist` `structuredClone` | iOS 15.0–15.3 no editor | Cópia com `JSON.parse(JSON.stringify())` ou polyfill | — |

### O que está bom

- O time evitou de propósito os recursos JS mais comuns de quebrar (`?.`, `??`,
  campos de classe, `replaceAll`, `.at`), protegeu `ResizeObserver` e
  `globalThis`, e o `perf.js` é ES5 puro, no `<head>`.
- Há alternativa em `vw` para o texto simples (`@supports (width: 1cqw)`).
- O painel compila para Safari 14+ e não usa CSS recente.

---

## Nota geral

| Usuário | Fluxo | Confiabilidade da TV | Desempenho | Profissionalismo (TV) | Compatibilidade |
|---|---|---|---|---|---|
| 11 Instalador | 6 | 8 | — | 3 | 5 |
| 12 TV na parede | — | 9 | 8 | 6 | — |
| 19 Compatibilidade | — | — | 7 | 4 | 3 |
| **Geral** | **6** | **8,5** | **7,5** | **4** | **4** |

**Nota geral dos três: 6/10.** O motor da TV é sólido de verdade (não apaga,
não vaza, volta sozinho, troca em 1 s); o que derruba é o que a TV **mostra**
no primeiro minuto e **onde** ela consegue rodar.

## Pode lançar?

**Não**, por dois motivos (o veredito exige zero bloqueador e nenhum grave
nas jornadas 11 e 12):

1. **Toda TV nova nasce com uma promoção de óculos inventada** ("30% OFF,
   R$ 189,90, válida até 25 de outubro") — inclusive em clínicas e empresas.
   É o primeiro contato do cliente com o produto, na parede dele, na frente
   dos clientes dele. Correção barata: começar com "Tudo certo" (já existe)
   até haver uma tela pronta aprovada para a frente e a orientação, sem preço.
2. **TV que perde o vínculo** leva o instalador a "faça upgrade" (grátis) ou a
   uma tela duplicada e cobrada (pago); o Reconectar só aparece após 90 s e
   perde horário e grupo.

Além disso, antes de vender "abra no navegador da sua Smart TV", decidir e
comunicar o mínimo suportado (hoje, na prática, Chromium/WebView ≥ 105) e
publicar o APK num endereço estável.
