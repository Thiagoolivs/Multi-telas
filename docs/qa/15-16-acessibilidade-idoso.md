# QA 15 e 16: acessibilidade (deficiência visual) e idoso

Testador C, 03/11/2026. Servidor local `main` na porta 8121 (STORAGE=local, AI_PROVIDER=dev). Chromium com Playwright 1.63 e axe-core 4.14 injetado na página.

Prints, JSON do axe e scripts: `/tmp/claude-0/-home-user-Multi-telas/b804d644-700b-5e83-ad8f-5fe2da78625e/scratchpad/qa/C/` (scripts em `.../qa/C/js/`). Abaixo, `C/` quer dizer essa pasta.

Limitações:
- Não usei leitor de tela de verdade (NVDA, VoiceOver). Os nomes, papéis e estados vêm da árvore de acessibilidade do Chromium (`locator.ariaSnapshot()`; o `page.accessibility` não existe mais no Playwright 1.63).
- As mensagens de validação nativas aparecem em inglês porque o Chromium headless ignora o `--lang`. Num Chrome em português elas saem em português.
- Criações por IA não foram avaliadas (modo demonstração).

---

## Usuário 15: pessoa com deficiência visual, só teclado

### 1. Quem é e o que tentou fazer
Usa o computador (1366x900) só pelo teclado (Tab, Shift+Tab, Enter, Espaço, Esc) e depende de leitor de tela e de zoom. Tentou fazer o cadastro, ler o Início, parear uma TV real (aberta em outra página), abrir "Mais opções", entrar na Programação e no editor de uma tela, passar pela Biblioteca e pelos Ajustes, subir uma foto e usar a landing.

### 2. Jornada

| # | Passo | O que aconteceu | Evidência |
|---|---|---|---|
| 1 | `/app`, Tab | A ordem é lógica: Entrar, Criar conta, E-mail, Senha, Esqueci, Entrar, links. Os campos têm rótulo. O alternador Entrar/Criar conta **não diz qual está ativo** e o leitor ouve "Entrar" duas vezes (alternador e envio). | `C/k1-signup.png` |
| 2 | Criar conta (2 Tabs + Enter) | O grupo "Frente" tem `role=radiogroup` e `radio` com `aria-checked`, mas cada opção é uma parada de Tab e as **setas não funcionam**. O botão "Criar conta" fica **desabilitado e fora da ordem de Tab** até a caixinha de aceite ser marcada, e nada explica isso. | `C/k2-foco-submit.png` |
| 3 | E-mail inválido e senha curta | A validação nativa do navegador põe o foco no campo errado e mostra o balão. Funciona, mas o balão some sozinho. | — |
| 4 | Conta criada | O foco vai para o `<body>`: o leitor não anuncia nada e o próximo Tab começa do topo. | `C/k2-inicio.png` |
| 5 | Início | Há 11 paradas de Tab (menu lateral, tema, conta) antes do conteúdo **em todas as páginas** e nenhum link "pular para o conteúdo". As abas Agora/Alertas são `role=tab` sem setas. O título da aba é sempre "MultiTelas — Painel". | saída de `js/k4.js` |
| 6 | Telas, "Ligar a primeira TV" (12 Tabs) | O diálogo abre, mas **o foco fica no botão atrás do modal**. O primeiro Tab vai para "ou usar este computador como TV", **atrás** do diálogo. No 7º Tab o foco sai do diálogo para a página. Esc fecha o diálogo. | `C/k3-parear-dialogo.png` |
| 7 | Código errado e Enter | **Enter não envia** (não há `<form>`): é preciso ir com Tab até "Parear". O erro "código não encontrado" aparece **sem `role=alert`** e o foco cai no `<body>`. | `C/k3-codigo-errado.png` |
| 8 | Código certo e "Parear" | O diálogo "Tela conectada" aparece, mas o foco fica no `<body>`. Depois do Esc o foco também não volta para nada. | `C/k3-pareado.png` |
| 9 | Mais opções (18 Tabs desde o topo) | Os botões têm bons nomes ("Mais opções da TV Balcão", "Recarregar a TV O desliga e liga…"), mas o foco não entra no diálogo, o Tab sai dele e o Esc deixa o foco perdido. | `C/k3-mais-opcoes.png` |
| 10 | Programação e editor | As zonas são botões com `aria-label` ("Principal — 3 conteúdos") e `aria-pressed`, e Prioridade é um radiogroup. Ao abrir o editor o foco vai para o `<body>`. A árvore expõe **7 `h1`** (o texto das miniaturas da TV: "ÓCULOS DE SOL 30% OFF"…). O campo "Mudar a tela com a IA" só troca 1 px de cor da borda ao receber foco. | `C/k5-editor.png` |
| 11 | Pôr foto ou vídeo na TV | **Bloqueio.** "Galeria" e "Câmera" são `<label>` com `<input type=file class="hidden">` (display:none). Pelo Tab só se chega a Fechar, "Balcão" e Cancelar, e **não há como escolher a foto pelo teclado**. "Enviar logo" na Marca, restaurar backup, referência da marca e outros usam o mesmo padrão. | saída de `js/k6.js` |
| 12 | Biblioteca, Arquivos | "Enviar fotos ou vídeos" é um `Button` que chama `input.click()` e **funciona pelo teclado**. É o padrão certo, que o item 11 não seguiu. | — |
| 13 | Ajustes | Todos os campos têm rótulo e dica. "Claro" e "Escuro" não têm `aria-pressed` (o leitor não sabe qual está ativo). | `C/k7-ajustes.png` |
| 14 | Menu da conta (topo) | Sem `aria-expanded`. **Esc não fecha**: o menu fica aberto enquanto o foco segue pela página. | — |
| 15 | Celular 390, "Mais" (gaveta) | A gaveta não tem `role=dialog`, o foco não entra nela e **Esc não fecha**. | `C/k8-gaveta-esc.png` |
| 16 | Landing `/` e `/saude` | Foco muito visível (contorno violeta sólido), ordem lógica e 36 paradas. Não tem `<main>` nem link para pular. As abas Ótica/Padaria… são `role=tab` sem setas e sem `tabpanel`. As imagens têm `alt` (as decorativas, vazio). | `C/land-foco.png` |

**axe-core (WCAG 2.0/2.1/2.2 A e AA + best-practice), por página.** Nenhuma violação crítica. Arquivos: `C/axe-light-1366.json`, `C/axe-dark-1366.json`, `C/axe-light-360.json`.

| Página | Violações |
|---|---|
| `/`, `/empresas`, `/saude`, `/comercio` | landmark-one-main (sem `<main>`), landmark-unique, region ×13 (moderadas) |
| `/app` (login) | color-contrast ×1 (aba inativa ink-3 sobre surface-2: **4,42:1**), landmark-one-main, region |
| `/tv` | region ×3 |
| Início | color-contrast (ink-3 sobre o cartão violeta: **4,34:1**), label-content-name-mismatch (botão "Conta: …" não contém "Dono") |
| Criar | color-contrast ×2 |
| Telas prontas | color-contrast, heading-order (h1 da miniatura e depois h3) |
| Ajustes, Plano, Equipe | color-contrast (ink-3 sobre surface-2, 4,42:1) |
| Telas, Programação, Peças, Designs, Arquivos, Marca | só label-content-name-mismatch |
| Tema escuro | só label-content-name-mismatch e heading-order. Contraste ok. |

**Contraste dos tokens** (`web/src/index.css:35-75`), calculado com `js/contraste.js`:

| Par | Claro | Escuro |
|---|---|---|
| ink sobre canvas/surface | 18,0 / 19,3 | 16,8 / 15,6 |
| ink-2 sobre surface | 7,56 | 8,14 |
| **ink-3 sobre canvas** | 4,50 (no limite) | 5,27 |
| ink-3 sobre surface | 4,83 | 4,89 |
| **ink-3 sobre surface-2** | **4,43 (reprova AA)** | 4,57 |
| **ink-3 sobre accent-soft** | **4,11 (reprova AA)** | 4,49 (reprova por pouco) |
| accent-fg sobre accent (botão) | 6,40 | 5,98 |
| ok/warn sobre o fundo soft | 4,49 / 4,55 (no limite) | 7,5 / 6,8 |
| **anel de foco ring-accent/40 sobre surface** | **2,01** | **1,89** |
| **borda de campo (line) sobre surface** | **1,24** | 1,15 |

O comentário em `index.css:20` ("ink-3 ≥ 4,5:1 no cartão") vale só para `surface`. Em `surface-2` (abas inativas, caixas de apoio) e `accent-soft` (cartões em destaque), ink-3 não passa.

**Zoom 200%** (683x450): sem rolagem lateral no painel, e os diálogos Parear e Mais opções cabem e rolam. Topo (56 px) e barra de baixo (57 px) fixos ocupam 25% da altura, o que é aceitável. Prints: `C/z-*.png`.

**Texto 200%** (`html{font-size:32px}`):
- Painel em 1366 e 390: sem rolagem lateral e sem corte relevante.
- Os rótulos da barra de baixo **não crescem**: estão em px fixo, `text-[12px]`.
- No 390 o avatar da conta sai pela direita.
- **A landing em 390 rola para o lado** (502 px): o botão "Testar grátis" do topo empurra a largura.
- Prints: `C/t200-*.png`.

**Modo escuro:** está bem resolvido e o axe não acha problema de contraste (`C/shot-*-dark.png`). Mas o painel **não segue a preferência do sistema** e sempre abre claro (`App.jsx:107`).

**Movimento:** com `prefers-reduced-motion: reduce` não há animação infinita no painel nem na landing. O carrossel da landing para (`landing/landing.js:60`), a barra "criando" para (`index.css:142`) e o `.mt-anim` do player para (`css/animacao.css:125`). Ponto bom.

**Anel de foco:** é visível, mas fraco. Lilás claro sobre branco e roxo escuro sobre quase preto (`C/anel-foco.png`). Os botões sem o componente `Button` usam o contorno preto nativo do Chromium, então há dois estilos de foco.

### 3. Notas

| Critério | Nota | Por quê |
|---|---|---|
| Acessibilidade | **5** | Nomes, rótulos, papéis e contraste estão acima da média. Mas os diálogos não prendem nem devolvem o foco, subir foto ou logo é impossível pelo teclado, gaveta e menu não fecham no Esc e o anel de foco tem 2:1. |
| Fluxo | **5** | Pelo teclado dá para cadastrar, parear e editar, mas com o foco caindo no `<body>` a cada troca e Enter que não envia. O caminho "subir uma foto" não tem saída. |
| Profissionalismo | **7** | A árvore de acessibilidade é limpa e bem nomeada. Faltam estado nos alternadores, título por página e anúncio de erros. |

### 4. Problemas

| Gravidade | Onde | Como reproduzir | O que esperava | Evidência |
|---|---|---|---|---|
| **Bloqueador** (para quem usa teclado) | `web/src/components/content/SubirConteudo.jsx:195-202`; o mesmo padrão em `components/content/LogoDaMarca.jsx:95-99`, `pages/BrandPage.jsx:521`, `pages/ScreensPage.jsx:749` (restaurar backup), `pages/MyDesignsPage.jsx:766`, `pages/CriacaoRapidaPage.jsx:385` | Início, "Pôr foto ou vídeo na TV", Tab | "Galeria" e "Câmera" alcançáveis pelo teclado. Hoje o `<label>` envolve um `input type=file class="hidden"` (display:none), que não recebe foco. | `js/k6.js`: só Fechar, Balcão e Cancelar recebem foco |
| **Grave** | `web/src/components/ui/Dialog.jsx:7-35` (afeta **todos** os diálogos: Parear, Mais opções, Tela conectada, confirmações, foto…) | Abrir qualquer diálogo pelo teclado | O foco entra no diálogo, Tab e Shift+Tab ficam presos nele e ao fechar o foco volta para o botão que abriu. Hoje o foco fica atrás do modal, o Tab sai para a página e o Esc deixa o foco no `<body>` ou num item aleatório. | `C/k3-parear-dialogo.png`, saída de `js/k3b.js` |
| **Grave** | `web/src/components/layout/AppShell.jsx:37-44` | Celular, "Mais", Esc | Gaveta com `role=dialog`, foco dentro e Esc fechando. Hoje nada disso: o Tab cai no `<body>` antes de chegar a ela. | `C/k8-gaveta-esc.png` |
| Médio | `web/src/components/layout/Topbar.jsx:30-75` | Abrir o menu da conta pelo teclado e apertar Esc | `aria-expanded` e Esc para fechar. Hoje só fecha com clique fora (mousedown). | `js/k7.js` |
| Médio | `pages/ScreensPage.jsx:439-473` | Diálogo Parear, digitar o código e apertar Enter | Enter envia (`<form onSubmit>`). Hoje não faz nada. | `js/k3.js` |
| Médio | `pages/ScreensPage.jsx:464` | Parear com código errado | Erro com `role=alert` e foco no campo. Hoje o leitor não anuncia e o foco vai para o `<body>`. | `C/k3-codigo-errado.png` |
| Médio | `components/ui/Button.jsx` (`focus-visible:ring-accent/40`) e `components/ui/Field.jsx:5` (`ring-accent/25`) | Tab em qualquer botão | Indicador de foco com pelo menos 3:1 (WCAG 2.4.11/1.4.11). Hoje 2,0:1 no claro e 1,9:1 no escuro. | `C/anel-foco.png` |
| Médio | `web/src/index.css:41` (ink-3) usado sobre surface-2 e accent-soft | Abas inativas, "Comece por aqui", Ajustes, Plano | 4,5:1. Hoje 4,43 e 4,11 (axe em 7 páginas). | `C/axe-light-1366.json` |
| Médio | `components/ui/Field.jsx:5` (`border-line`) | Qualquer campo | A borda do campo com 3:1 contra o fundo (1.4.11). Hoje 1,24:1, e quem enxerga pouco não vê onde fica o campo. | `C/k1-signup.png` |
| Médio | `AppShell.jsx` / `index.html:21` / `App.jsx` (navegação) | Trocar de página pelo menu | Link "pular para o conteúdo", `document.title` por página e foco no `h1` da página nova. Hoje são 11 Tabs antes do conteúdo em todas as páginas, o título é fixo e o foco fica no menu ou no `<body>` (depois do login, do editor e do pareamento). | saída de `js/k4.js` |
| Médio | `components/layout/Avisos.jsx:37-42` | Qualquer aviso flutuante (foto no ar, erro) | A região ao vivo precisa existir antes da mensagem, e erro precisa de `role=alert`. Hoje o contêiner só é montado com o primeiro aviso (o leitor pode não anunciar) e erro sai como `status`. | código |
| Médio | Miniaturas da TV em Telas, Programação, editor e Telas prontas (`components/tela/MapaDaTela.jsx`, `DesignThumb.jsx`) | Navegar por títulos com o leitor | Miniatura com `aria-hidden` ou `role=img` e um nome. Hoje há 2 a 7 `h1` por página com o texto da peça. | `js/k5.js` (árvore) |
| Médio | `pages/AuthScreen.jsx:287` | Cadastro sem marcar o aceite | O botão continua focável e, ao tocar, diz "Marque que leu os Termos". Hoje fica cinza, fora da ordem de Tab e sem explicação. | `C/i-03-sem-aceite.png` |
| Médio | `pages/AuthScreen.jsx:193`; `pages/SettingsPage.jsx:185` | Leitor de tela no alternador Entrar/Criar conta e em Claro/Escuro | `aria-pressed` ou tabs de verdade. Hoje o estado não é anunciado. | árvore em `js/k1.js` e `js/k7.js` |
| Médio | `landing/index.html:134-460` | axe na landing | Ter um `<main>` (e link para pular). | `C/axe-light-1366.json` |
| Médio | `landing/index.html:149` (botão do topo) | Texto 200% no celular 390 | Sem rolagem lateral. Hoje a página fica com 502 px de largura. | `C/t200-_-390.png` |
| Polimento | `AuthScreen.jsx:224-232`, `layout/Navegacao.jsx:24-27`, `landing/index.html:277` | Setas em radiogroup ou tablist | Quem usa `role=radio` ou `role=tab` promete setas e tabindex móvel. Hoje só o Tab funciona. | — |
| Polimento | `layout/Navegacao.jsx:58` | Texto 200% | Rótulos da barra de baixo em rem (hoje `text-[12px]`). | `C/t200-_app__ir_screens-390.png` |
| Polimento | `App.jsx:107` | Sistema em modo escuro | Seguir `prefers-color-scheme` na primeira visita. | — |
| Polimento | Topbar "Alternar tema"; Início "Hoje: 💙 Novembro Azul"; Topbar "Conta: …" | Leitor de tela | O nome do botão diz o estado ("Usar tema escuro"). O emoji é lido ("coração azul"). O nome do botão contém o texto visível. | axe label-content-name-mismatch |
| Polimento | `components/tela/MudarComIA.jsx:64` | Tab até "Mudar a tela com a IA" | Mesmo anel dos outros campos. Hoje só muda 1 px de cor da borda. | `js/k5.js` |

### 5. O que está bom
- Todos os campos têm rótulo associado (o `Field` envolve com `<label>`) e as dicas entram no nome ("Senha, mínimo de 6 caracteres").
- Os botões só de ícone têm `aria-label` (Fechar, Subir, Descer, Duplicar, Remover, "Mais opções da TV Balcão", "Criar com a IA para lateral").
- Papéis certos onde importa: `navigation` com `aria-current`, `radiogroup` (Frente e Prioridade), zonas com `aria-pressed`, `role=alert` no login, `role=progressbar` no envio.
- `lang="pt-BR"` no painel e na landing. A landing tem foco forte e consistente e `alt` em todas as imagens.
- O axe não acha violação crítica nem séria além de contraste pontual, e o tema escuro passa no contraste.
- Zoom 200% sem rolagem lateral no painel, e `prefers-reduced-motion` respeitado.
- Esc fecha todos os diálogos (o `Dialog`), só não a gaveta e o menu.

---

## Usuário 16: idoso, pouca intimidade com tecnologia, celular 360x800

### 1. Quem é e o que tentou fazer
"Dona Cida", do Bazar da Dona Cida, num celular 360x800 só com toque. Quer criar a conta, entender o Início, ligar a TV e trocar o que passa, por uma tela pronta ou por uma foto. Erra a senha, o código da TV e deixa campo em branco.

### 2. Jornada (toques contados)

| # | Passo | Toques | O que aconteceu | Evidência |
|---|---|---|---|---|
| 1 | Landing, "Testar 14 dias grátis" | 1 | **Cai em "Entrar na sua conta"**, não no cadastro (também vindo de `/saude` com `?frente=saude`). Ela acha que precisa de uma conta que não tem. Achar a aba "Criar conta" custa 1 toque a mais. | `C/i-02-cadastro.png` |
| 2 | Preencher nome, e-mail e senha "cida1" | +3 | "Comércio" já vem marcado pelo nome ("Bazar"), o que é bom. "Depois, a troca é pelo suporte" assusta um pouco. | `C/i-03-sem-aceite.png` |
| 3 | Tocar "Criar conta" sem marcar o aceite | +1 | O botão está cinza e nada acontece. **Nenhuma mensagem.** Ela não sabe o que falta. | `C/i-03-sem-aceite.png` |
| 4 | Marcar o aceite e tocar "Criar conta" | +2 | Senha curta: só o balão do navegador, que some em segundos. | `C/i-04-senha-curta.png` |
| 5 | Corrigir a senha e "Criar conta" | +2 | Entra no Início. **Total: 10 toques** (sem erros seriam 7). | `C/i-05-inicio.png` |
| 6 | Ler o Início em voz alta | — | "Suas TVs agora. Terça-feira, 03 de novembro. Comece por aqui, 0 de 3, uns 10 minutos. 1. Diga quem é a empresa: cole o endereço do site, a IA tira de lá as cores e as letras. Sem site, escolha a paleta sugerida para o seu ramo." A primeira tarefa é **marca e paleta**. Ligar a TV fica em 3º e pede rolagem. "Paleta" e "IA" não são palavras dela. | `C/i-05-inicio.png` |
| 7 | "Ligar a TV" (passo 3) | 1 | Abre "Parear uma tela". Texto em CAIXA-ALTA de 13 px: "1 · NA TV, ABRA O APP MULTITELAS TV — OU, NO NAVEGADOR DELA, O ENDEREÇO". "Parear", "pareamento" e "pareia" são jargão. | `C/i-11-parear.png` |
| 8 | Digitar o código como se fala, "BWC DQZ" | +2 | O campo corta em "BWC DQ" (o espaço conta no limite de 6). Resposta: "**código não encontrado**", em minúscula e sem dizer o que fazer. | `C/i-12-codigo-com-espaco.png` |
| 9 | Uma letra errada | +2 | Mesma mensagem. | — |
| 10 | Código certo em minúsculas, sem nome | +2 | Funciona (vira "TV 1"). **Total: 7 toques com 2 erros** (sem erros, 3). | `C/i-13-pareado.png` |
| 11 | O que a TV mostra | — | **"ÓCULOS DE SOL 30% OFF… Exame de vista com hora marcada… Oferta válida até sábado, 25 de outubro"** (data passada) na TV de um bazar. O diálogo diz que é "uma tela pronta com a sua marca". | `C/i-14-tv-depois.png`, `C/k3-tv.png` |
| 12 | "Pôr foto ou vídeo na TV", Galeria, foto, "Pôr na TV" | **4** | "Pronto! 1 arquivo no ar em 1 tela." Excelente: o melhor caminho do produto para ela. | `C/i-20-subir.png`, `C/i-22-subir-feito.png` |
| 13 | Biblioteca, Telas prontas | 1 | **Só existe uma tela pronta para Comércio** (também em "Todas"): "Ótica Central · Semana do Sol", com a descrição "Cada zona diz uma coisa (**PLANO §4.7**): o cabeçalho, quem e a campanha; o destaque…". | `C/i-23-biblioteca.png` |
| 14 | "Usar esta tela" | +1 | "Os textos vieram de uma empresa de exemplo… (faltam 7 peças)". São 7 "Trocar textos" antes de ficar dela. Dá para pôr na TV assim mesmo, com os preços da ótica. | `C/i-24-usar-tela.png`, `C/i-41-por-na-tv.png` |
| 15 | Sair e entrar com a senha errada | — | "e-mail ou senha incorretos", em minúscula. Não aponta "Esqueci minha senha", que está logo acima. | `C/i-30-senha-errada.png` |
| 16 | "Esqueci minha senha" | — | **O subtítulo diz "Enviamos um link para o seu e-mail." antes de ela tocar em Enviar.** Depois de enviar: "Se existir uma conta com esse e-mail…". | `C/i-31-esqueci.png` |
| 17 | Cadastro com e-mail que já existe | — | "e-mail já cadastrado". Não oferece "Entrar" nem "Esqueci minha senha". | — |
| 18 | Cadastro sem nome da empresa | — | **Aceita** e entra no Início sem nome. | — |

Medições no 360:
- Todos os alvos de toque têm pelo menos 44 px (0 menores, em 7 páginas).
- A menor letra é 12 px (rótulos da barra de baixo).
- Sem rolagem lateral (`js/medir.js`).

Jargão encontrado na tela (varredura em `C/textos-360.json`):
- "Parear tela", "Código de pareamento" e "pareia" (Telas, Parear). A TV diz "Telas › Parear tela" e o Início diz "Ligar a TV".
- "offline" em Alertas ("'TV 1' está offline", "uma tela é considerada offline…"). No resto do painel é "Fora do ar".
- "zona", "zonas" e "PLANO §4.7" (Telas prontas).
- "Meus Designs" (inglês) e "Cabeçalho com status" (Peças prontas).
- "Frente" (Ajustes, e o nome do radiogroup do cadastro).
- "1280×720 · Linux" no cartão da TV.
- "Corporativo Completo · o tema MultiTelas (padrão) · ciclo de 1min" no editor.
- "o arquivo fica guardado em Mídias", mas o menu chama "Biblioteca" (`SubirConteudo.jsx`).
- Erros do servidor em minúscula e sem próximo passo: "código não encontrado" (`server/routes/telas.js:177`), "e-mail ou senha incorretos", "e-mail já cadastrado".
- Não apareceram: "SSE", "config", "layout", "preset", "template".

Barra de baixo no celular: Início · Programação · Criar · Biblioteca · Mais (`web/src/lib/menu.js:108`). **"Telas", onde se liga e se vê a TV, só aparece dentro de "Mais".**

### 3. Notas

| Critério | Nota | Por quê |
|---|---|---|
| Acessibilidade (toque, letra, zoom) | **8** | Alvos de 44 px, letra de 12 px para cima, texto grande sem quebrar o painel, tela limpa. |
| Fluxo | **6** | A foto vai para a TV em 4 toques e o pareamento leva 3 toques sem erro. Mas "Testar grátis" abre o login, o botão cinza não explica nada, o código com espaço falha e a TV dela estreia vendendo óculos com oferta vencida. |
| Profissionalismo (linguagem) | **6** | O tom é bom e próximo ("Pôr foto ou vídeo na TV", "Mudar o que passa", "Fora do ar"). Mas há "PLANO §4.7" na tela, "Parear", "offline", "Meus Designs", erros em minúscula sem orientação e "Enviamos um link" antes de enviar. |

### 4. Problemas

| Gravidade | Onde | Como reproduzir | O que esperava | Evidência |
|---|---|---|---|---|
| **Grave** | `web/src/lib/telasProntas.js:189` (`telaParaComecar`) + `pecas-ouro/manifesto.json` (só a ótica para Comércio) | Cadastrar um bazar ou padaria e parear a TV | A primeira tela combina com o ramo, ou é neutra (nome, relógio, boas-vindas), e nunca tem data vencida. Hoje a TV de qualquer comércio estreia com "Óculos de sol 30% off, Exame de vista, Oferta válida até 25 de outubro", e o diálogo chama isso de "sua marca". | `C/i-14-tv-depois.png`, `C/k3-tv.png` |
| **Grave** | `pecas-ouro/manifesto.json:656` (campo `sobre`), mostrado em Telas prontas | Biblioteca, Telas prontas | Texto para o cliente. Hoje aparece "Cada zona diz uma coisa (PLANO §4.7)…". | `C/shot-telasprontas-1366-light.png` |
| **Grave** | `web/src/pages/AuthScreen.jsx:27` (`useState('login')`); links em `landing/index.html:149,166,237,352` | Landing, "Testar 14 dias grátis" | Abrir já em "Criar sua conta" (pelo menos quando vem com `?frente=` ou de um link de teste). Hoje abre "Entrar na sua conta". | `C/i-02-cadastro.png` |
| **Grave** | `pages/ScreensPage.jsx:459` (`maxLength={6}` sem tirar espaços) | Digitar "BWC DQZ" | Ignorar espaços e hífens, como o `?parear=` já faz em `lib/parearPendente.js:26`. Hoje corta e diz "código não encontrado". | `C/i-12-codigo-com-espaco.png` |
| Médio | `server/routes/telas.js:177` e `pages/ScreensPage.jsx:464` | Código errado | "Não achamos esse código. Confira as 6 letras e números que aparecem na TV agora. Se a TV mudou de código, use o novo." | `C/k3-codigo-errado.png` |
| Médio | `pages/AuthScreen.jsx:287` | Tocar "Criar conta" sem o aceite | Uma mensagem dizendo o que falta. | `C/i-03-sem-aceite.png` |
| Médio | `pages/AuthScreen.jsx:171` | "Esqueci minha senha" | O subtítulo antes de enviar deve ser "Vamos mandar um link para o seu e-mail". Hoje diz "Enviamos" antes de enviar. | `C/i-31-esqueci.png` |
| Médio | Erros de login e cadastro (servidor) | Senha errada, e-mail repetido | Frase com maiúscula e próximo passo ("Senha não confere. Tente de novo ou toque em Esqueci minha senha", "Este e-mail já tem conta. Entrar?"). | `C/i-30-senha-errada.png` |
| Médio | `web/src/lib/menu.js:108` | Celular, procurar a TV | Ter "Telas" na barra de baixo, porque é o que ela mais procura. Hoje está em "Mais". | `C/i-05-inicio.png` |
| Médio | Início, "Comece por aqui" (`components/layout/ProximoPasso.jsx` / `DashboardPage.jsx`) | Conta nova | Ligar a TV em 1º, ou destacado: é o que traz o "uau". Hoje o 1º é "cole o site… paleta". Também marca "Crie a primeira peça" e "Ligue a TV e mande a peça" como feitos só porque a tela pronta entrou. | `C/shot-overview-1366-dark.png` |
| Médio | `pages/AuthScreen.jsx:219-220` | Cadastro sem nome da empresa | Pedir o nome (`required`) ou usar o e-mail sem deixar vazio. Hoje aceita vazio. | `js/i4.js` |
| Médio | Telas prontas (Comércio) | Biblioteca | Mais de uma tela pronta por frente, com textos genéricos ("Sua loja", "Ofertas da semana"), e não de uma ótica fictícia que exige 7 trocas. | `C/i-24-usar-tela.png` |
| Polimento | Textos | ver "Jargão encontrado na tela" | "Ligar a TV" em todo lugar no lugar de "Parear"; "Fora do ar" no lugar de "offline"; "Meus desenhos" no lugar de "Meus Designs"; tirar "1280×720 · Linux" e "ciclo de 1min" da tela principal; "Biblioteca" no lugar de "Mídias". | `C/textos-360.json` |
| Polimento | `pages/ScreensPage.jsx:500` | Diálogo Parear | Instrução em letra normal (não CAIXA-ALTA de 13 px). | `C/i-11-parear.png` |
| Polimento | Validação nativa (senha curta, e-mail sem @) | Errar um campo | Mensagem própria embaixo do campo, que não some sozinha. | `C/k2-email-invalido.png` |

### 5. O que está bom
- **Foto na TV em 4 toques**, com a TV já marcada e "Pronto! 1 arquivo no ar em 1 tela." É o melhor momento do produto para ela.
- Pareamento em 3 toques sem erro. Aceita minúsculas, e o alfabeto do código não tem O/0 nem I/1 (`server.js:113`). Pelo QR o código já vem preenchido e normalizado.
- Botões grandes (44 px), letra legível e nada rola para o lado.
- Boa parte dos textos é na língua dela: "Pôr foto ou vídeo na TV", "Mudar o que passa", "Confira se a TV está ligada e com internet. Se ela estiver mostrando um código, toque em Reconectar."
- O "Mais opções" explica cada item ("Recarregar a TV: o desliga e liga, sem ir até ela").
- A frente certa vem marcada pelo nome digitado.

---

## Nota geral

| Usuário | Acessibilidade | Fluxo | Profissionalismo | Geral |
|---|---|---|---|---|
| 15. Deficiência visual (teclado e leitor) | 5 | 5 | 7 | **5,5** |
| 16. Idoso no celular | 8 | 6 | 6 | **6,5** |

**Pode lançar? Não.** Há um bloqueador de acessibilidade: pelo teclado não se sobe foto nem logo. A correção é pequena: trocar o `<label>` por um `Button` que chama `input.click()`, como já faz `StoragePage.jsx:188-189`. Também há graves que todo cliente novo vai ver, não só os destas duas jornadas:
- a TV estreia com a tela de uma ótica e oferta vencida;
- aparece "PLANO §4.7" na Biblioteca;
- "Testar grátis" abre o login.

Depois desses, o `Dialog` precisa de foco inicial, foco preso e devolução ao fechar. É uma mudança num arquivo só e vale para todos os diálogos.
