# Aparelhos suportados

Qual TV, TV box e celular rodam o MultiTelas, o que muda em cada faixa de
navegador e o que foi conferido. Nasceu do QA de lançamento de 03/11
(usuário 19): numa Smart TV de 2018 a TV ficava para sempre em "Iniciando
exibição", e nas de 2019 a 2023 as peças viravam texto miúdo sobreposto.

## O mínimo, em uma linha

**TV: navegador ou WebView com motor Chromium 56 ou mais novo.** Abaixo
disso a TV mostra, na marca: *"Este navegador é antigo para o MultiTelas.
Use o app MultiTelas TV ou um TV box Android."* (com a versão que o aparelho
tem). **Painel: Safari 15.4+ no iPhone/iPad; Chrome, Edge ou Firefox atuais
no computador e no Android.**

**Recomendado para vender:** TV box Android 9 ou mais novo, 2 GB de RAM,
com o app **MultiTelas TV** e o *Android System WebView* atualizado pela
Play Store. É o único caminho em que nós controlamos o motor.

## TV (o player, `/tv`)

| Faixa do motor | O que acontece | Por quê |
|---|---|---|
| Chromium 105+ | Tudo, como desenhado | container queries nativas |
| Chromium 87–104 | Tudo; as peças passam pelo caminho de reserva | sem container query: a peça é reescrita em pixel no tamanho da zona (`js/peca-render.js`, `cssSemCq`) |
| Chromium 56–86 | Abre e mostra as peças legíveis, com perdas pequenas (abaixo) | além da reserva das peças, `inset` tem reserva em top/right/bottom/left (`css/player.css`, `@supports not (inset: 0)`) |
| Abaixo de 56 | Aviso de navegador antigo (`js/compat.js`) | o JavaScript do player usa `async/await` (ES2017) |

Perdas entre Chromium 56 e 104 (nenhuma esconde texto):

- **< 111** — `color-mix()`: alguns fundos e bordas de selo do player somem
  (ficam transparentes). As peças não usam `color-mix` (a porta só aceita
  cor por token).
- **< 104** — as entradas animadas das peças viram só "aparecer" (as
  propriedades soltas `translate`/`scale`). A rolagem do rodapé continua.
- **< 105** — `:has()`: peça com QR sem link mostra a moldura vazia do QR.
- **< 88** — `aspect-ratio`: o QR do pareamento e algumas fotos do player
  usam a altura natural.
- **< 84** — `gap` em flex: itens lado a lado do player e das peças ficam
  sem o espaço entre eles.
- **< 79** — `clamp()/min()/max()` no player (fora das peças, onde a reserva
  já resolve): vale a medida simples escrita antes, quando existe; o resto
  cai em 16 px.
- **< 73** — `hourCycle`: a hora da loja pode aparecer como "24:05" depois
  da meia-noite.
- **< 66** — sem `AbortController`: as notícias esperam o prazo de 8 s pela
  corrida, em vez de cancelar o pedido.
- **< 64** — sem `ResizeObserver`: a peça confere o tamanho da zona por 10 s
  depois de montar e a cada giro da janela.

### Por aparelho

O motor de cada linha é o de fábrica (referência do QA de 03/11). TV que
atualizou o sistema pode ter um motor mais novo; a tela de aviso diz qual é.

| Aparelho | Motor | Resultado |
|---|---|---|
| Samsung Tizen 4 (TVs 2018) | Chromium 56 | Abre, com todas as perdas da lista acima |
| Samsung Tizen 3 (2017) ou anterior | ≤ 47 | Aviso |
| Samsung Tizen 5 / 5.5 / 6 / 6.5 / 7 (2019–2023) | 63 / 69 / 76 / 85 / 94 | Abre; peças pela reserva |
| Samsung 2024+ | 105+ | Tudo |
| LG webOS 3 / 4 (2016–2019) | 38 / 53 | Aviso |
| LG webOS 5 / 6 / 22 (2020–2022) | 68 / 79 / 87 | Abre; peças pela reserva |
| Android TV / Google TV / TV box com Play Store | o *Android System WebView*, atualizável | Tudo, com o WebView em dia |
| TV box Android 7–9 sem Play Store | WebView de fábrica, muitas vezes 5x–6x | Depende: abaixo de 56, aviso. Prefira box com Play Store |
| Fire TV Stick 4K / 4K Max / Cube | WebView 70+ (Fire OS 6/7) | Abre; peças pela reserva até atualizar |
| Chromecast com Google TV | WebView atual | Tudo |
| App **MultiTelas TV** (`android/`) | o WebView do aparelho | O que o WebView der; abaixo de 56 o aviso pede para atualizar o WebView |
| iPhone/iPad como tela (Safari) | WebKit | Safari 16+ tudo; 11–15 pela reserva das peças (sem garantia: não testado em Safari real) |

## Painel (`/app`)

- Compilado pelo Vite 5 sem `build.target` próprio: vale o padrão (`es2020`,
  Chrome 87, Safari 14, Firefox 78, Edge 88). Sem `@container`, `:has`,
  `color-mix` ou `text-wrap` no CSS do painel.
- **iPhone: Safari 15.4 ou mais novo.** O editor de conteúdo usa
  `structuredClone`, que chegou no 15.4: num iOS 15.0–15.3 o painel abre,
  mas o editor quebra ao editar.
- A pré-visualização das peças no painel usa o mesmo `js/peca-render.js` da
  TV, então num Safari sem container query (até o 15) ela também passa pela
  reserva.

## O que foi conferido, e como

Tudo no Chromium atual (Playwright), **simulando** o navegador antigo — não
houve aparelho de verdade nem Chromium antigo de verdade neste ambiente.

| O quê | Como | Resultado |
|---|---|---|
| O pacote compila em ES2017 | `acorn` com `ecmaVersion: 2017` no pacote montado por `server/pacote-tv.js` (teste `test/compat-tv.test.js`); `compat.js` e `perf.js` como ES5 | compila |
| A reescrita sem lookbehind dá o mesmo | o teste compara, valor por valor, com o lookbehind de antes em todo o CSS das peças-ouro | igual |
| Peças sem container query | TV pareada com a tela pronta da ótica, em 1920×1080 e 1080×1920: (a) nativo; (b) "antes": o CSS filtrado como o navegador antigo faria (sem `@container` e sem declarações em `cq*`); (c) "depois": `window.MT_SEM_CQ = true` força a reserva, com o mesmo filtro | (b) texto de 16 px empilhado no canto; (c) igual a (a), pixel a pixel à vista |
| Sem `inset` (Chromium < 87) | o mesmo de (c), tirando também toda declaração `inset` e ligando o bloco `@supports not (inset: 0)` | igual a (a) |
| Custo no caminho normal | montar a mesma peça 20 vezes: nativo ~1–2 ms por montagem; reserva ~1,2–1,5 ms | o caminho normal só consulta `CSS.supports` uma vez |
| Aviso de navegador antigo | pacote com erro de sintaxe injetado (o que um Chromium < 56 vê), com o UA do webOS 4 e do app; e sem `fetch` | o aviso aparece, o splash sai; no app, fala do WebView |
| Sem aviso falso | player que subiu, erro que não é de sintaxe, erro de outro site, primeira carga sem rede | nenhum aviso (teste) |
| Pareamento na marca | 1920×1080, 1280×720 e 1080×1920 | tinta, Outfit, logo, grifo lima |

**Não conferido:** Smart TV Samsung/LG de verdade, Fire TV, TV box barato,
Safari real (iPhone), e um Chromium antigo de verdade (o binário não pôde ser
executado neste ambiente). O teste em aparelho fica para o roteiro de
aparelho do QA (`docs/qa/ROTEIRO-APARELHO.md`). Para diagnosticar a reserva numa TV com
DevTools remoto: `window.MT_SEM_CQ = true` antes de carregar força o caminho
de reserva.

## O app Android (MultiTelas TV)

Detalhes em `android/README.md`. O essencial para quem vende e instala:

**Onde baixar o APK hoje.** Só em **GitHub › Actions › App Android › (a
execução mais nova) › Artifacts** — precisa de acesso ao repositório e o
arquivo expira em 90 dias. Esse APK é **debug**, assinado com uma chave que
muda a cada execução: instala por pendrive, mas **não se atualiza sozinho**.

**O endereço estável, depois do Release:** `https://tv.multitelas.net.br/apk/ultimo.apk`
(o servidor busca o Release mais novo do GitHub e serve; `/apk/versao.json`
diz a versão). Enquanto não houver Release, as duas respondem 404.

**O que falta para publicar o Release** — cadastrar, uma vez, os 4 secrets
em **GitHub › Settings › Secrets and variables › Actions › Secrets**:

1. Gerar a chave (num computador com Java):
   `keytool -genkeypair -v -keystore release.jks -alias multitelas -keyalg RSA -keysize 2048 -validity 10000`
2. `MT_KEYSTORE_BASE64` — o `release.jks` em base64 (`base64 -w0 release.jks`).
3. `MT_KEYSTORE_PASSWORD` — a senha do keystore.
4. `MT_KEY_ALIAS` — `multitelas` (o alias do passo 1).
5. `MT_KEY_PASSWORD` — a senha da chave.
6. **Guardar o `release.jks` e as senhas fora do GitHub.** Perder a chave é
   nunca mais conseguir atualizar os apps instalados.

Com os secrets, o próximo push na `main` que mexer em `android/` (ou **Actions
› App Android › Run workflow**) publica o Release `apk-v<versão>`; o
servidor passa a servir `/apk/ultimo.apk` em até 30 min, e as TVs com o app
assinado se atualizam com um OK no controle. Os boxes que já têm o APK debug
precisam de **uma** reinstalação manual (desinstalar e instalar o assinado).

**Opcional:** a variável `MT_URL` (Settings › Secrets and variables ›
Actions › Variables) troca o servidor que o app abre; sem ela, vale
`https://tv.multitelas.net.br`.
