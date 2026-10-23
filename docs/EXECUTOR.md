# Ordem de serviço do executor

Este arquivo diz tudo o que você faz nas próximas horas. Não espere
instrução no chat: leia até o fim e trabalhe a fila na ordem, um item por
PR, até ela acabar ou o limite de uso chegar.

## 0 · Antes do primeiro PR (uns 15 minutos)

1. Confira as ferramentas: `node -v` (precisa ser 22 ou mais), `git`, e
   `gh auth status` (logado, com permissão de push em
   `Thiagoolivs/Multi-telas`). Rode `npm install` e `npm run build`.
2. Leia `docs/PLANO.md` (o produto e as decisões),
   `docs/ESTADO-DO-PROJETO.md` (como o sistema está montado e as
   armadilhas) e `docs/AGENTES.md` (divisão de arquivos e regras de PR, se
   houver uma segunda sessão).
3. Rode `npm test`. Precisa passar inteiro antes de você mudar qualquer
   coisa (1062 testes em 21/10).
4. Suba o servidor local com `node server.js` (porta 8080; numa segunda
   sessão, `PORT=8081`). O painel fica em `http://localhost:8080/app/` e a
   TV em `/player.html`. Crie a sua conta de teste pelo próprio cadastro,
   aqui no localhost. Sem chave de IA, o servidor roda em modo de
   demonstração: o caminho da IA cai na peça-ouro de reserva, e isso basta
   para testar o fluxo.

## 1 · Regras que não mudam

- **Um PR pequeno por item.** Branch a partir de `origin/main`. Antes do
  merge: `git fetch && git rebase origin/main`, `npm test`,
  `npm run lint:nomes` e `npm --prefix web run build`. Depois
  `gh pr create` e `gh pr merge --merge --delete-branch`.
- **Você está autorizado** a trabalhar sem perguntar e a fazer o merge dos
  seus PRs quando os testes passarem e o visual estiver conferido.
- **O merge no `main` vai direto para produção** (o Railway faz o deploy
  sozinho; ainda não há TV de cliente). Por isso nada quebrado entra.
- **Renderize e olhe toda mudança visual.** No celular (360 px), no desktop
  e, se for coisa de TV, no player em 1920×1080 e em pé. Prints no PR.
- **A régua das peças é o lote 1 da ótica** (`pecas-ouro/`): o dono aprovou
  como perfeito. Peça nova segue aquele padrão e passa pela bancada
  (`/bancada.html`) sem nada vazar ou se sobrepor.
- **O teste dos 3 toques**, em todo PR de criação. Alguém que nunca viu o
  painel consegue, num celular de 360 px, (a) pôr uma foto na TV e (b) criar
  uma peça com IA e publicá-la, cada uma em até 3 toques depois de abrir o
  app, sem ler nada? Conte os toques no PR.
- **Infra é do consultor.** Railway, variáveis, buckets, serviços, domínios
  e qualquer chave: peça na issue #135 (seção 3). Nunca escreva segredo em
  código, PR ou issue.
- **Nunca:** `--force` no `main`, `--no-verify`, commitar `.claude/` ou
  `data/`, nem apagar funcionalidade. Esconder vem antes de apagar (PLANO
  §11).
- **Cada função existe uma vez só**, como já é no repositório: a TV, a
  bancada e o painel usam os mesmos `js/peca-*.js`. Não crie cópia.
- Comentários explicam o porquê, em português, no estilo dos arquivos
  vizinhos. Decisão nova entra no `PLANO.md`.

## 1b · O que não pode regredir

Cada regra abaixo veio de um defeito real ou de uma decisão do dono. Antes
do merge, confira as que o seu PR toca. Na dúvida, pergunte ao consultor.

**A TV do cliente**
- **Nunca tela preta sem aviso.** Falta de IA, de crédito ou de pagamento,
  internet caída: a TV continua mostrando o último conteúdo bom, e a
  cobrança mostra selo, nunca apaga (`server/cobranca.js`). A única tela
  apagada de propósito é a do expediente, que o cliente escolheu.
- **A TV funciona offline.** Toda mídia é servida por nós e guardada no
  cache (`sw.js`, `js/storage.js`). Nada de imagem ou script carregado de
  servidor de terceiros na TV.
- **A TV fraca não engasga.** O box tem pouca memória: sem
  `mix-blend-mode`, sem filtro pesado, e animação só nas propriedades que a
  placa acelera. O modo leve (`js/perf.js`) continua funcionando.
- **Script novo da TV entra com valor de reserva.** A TV pode estar com o
  JS antigo no cache quando o conteúdo novo chega (o `sw.js` serve o antigo
  e atualiza por trás). Token novo é sempre usado como
  `var(--mt-novo, <padrão>)`, e a peça tem de ficar certa com o padrão.

**As peças em HTML**
- **Tudo passa pela porta.** Peça da IA, peça-ouro e CSS gerado por nós
  passam por `js/peca-html.js` (`higienizar`, `validarItem`). A porta não
  se afrouxa: sem `<script>`, sem `url()` no CSS, sem atributos fora da
  lista. Precisa de algo novo? Acrescente na lista, com teste.
- **Um desenhista só.** A TV, a bancada, a miniatura, o editor e a
  exportação para redes usam `js/peca-render.js` em Shadow DOM, e o
  detector de `js/peca-conferir.js`. O painel carrega esses arquivos de
  `/js` em tempo de execução: nunca copie para dentro do `web/`.
- **Cores e fontes só por tokens** `--mt-*` (`js/tokens.js`). Nada de cor
  fixa na peça: é isso que deixa trocar marca e modo sem gerar de novo.
- **Título grande usa** `calc(N * var(--mt-escala-titulo, 1))`, ou vaza com
  fonte larga.
- **Peça desenhada no tamanho real** da TV (1920×1080) e só depois reduzida
  (`PecaHtml.jsx`). Desenhada pequena, ela cai na regra de lateral do
  `@container` e mostra outro layout.
- **Nada vaza nem se sobrepõe.** A varredura de 39 peças × 6 marcas × todas
  as zonas (948 combinações) passou limpa em 20/10. Mexeu em peça-ouro ou
  em token? Rode a bancada de novo.
- **A ótica do lote 1 é intocável.** Ela é a régua aprovada pelo dono: mudar
  token ou peça-ouro não pode mover nenhum texto dela mais que 2 px.
- **Não repete a marca:** a peça marca o nome da empresa com
  `data-repete="marca"`, e ele some quando a tela já tem cabeçalho.

**IA e dinheiro**
- **Nada caro sem o ok do cliente.** Foto gerada custa crédito, então o
  plano para antes (`pararNoPlano`), e a foto só é gerada depois da
  aprovação.
- **Foto não tem texto desenhado**, nem retrato de pessoa real
  identificável (`server/direcao-arte.js`).
- **Foto do produto do cliente é dele.** A referência só é aceita se a
  mídia é da própria conta e é imagem PNG, JPG ou WebP (`server.js`,
  `onImagem`).
- **Toda chamada de IA é medida e tem limite.** Uso registrado em `uso_ia`,
  limite por hora por conta, custo em `server/creditos.js`. Rota nova de IA
  segue o padrão da `/api/ai/refazer-peca`.
- **A IA nunca deixa a tela vazia.** Falhou ou foi recusada: entra a
  peça-ouro preenchida (`compositor.preencherOuro`).
- **O motor HTML desliga sem deploy,** com `MT_MOTOR_CAMPANHA=coordenadas`.
  O caminho antigo continua funcionando.

**Segurança**
- **Toda consulta é presa à conta** (`sess.tenant_id`). Um cliente nunca
  vê nem mexe em nada de outro, nem por id adivinhado.
- **Endereço digitado pelo usuário só é buscado por `server/site.js`**: a
  defesa de SSRF mora lá. Não use `fetch` direto em URL de usuário.
- **CSP `script-src 'self'`** (`server/security.js`): nada de script inline, e o painel só carrega script do
  próprio servidor.
- **SVG é servido isolado,** e o token da TV nunca vai na URL (passe de 1
  minuto, uso único).
- **Segredo só em variável de ambiente.** Nunca em código, teste, PR,
  issue ou log.
- **Webhook de pagamento:** token comparado em tempo constante, e cada
  pagamento credita uma vez só.

**Banco**
- **Toda mudança vai nos dois bancos,** `db-sqlite.js` (local e testes) e
  `db-postgres.js` (produção). Uma tabela que existia só no SQLite derrubou
  o cadastro por e-mail em produção (corrigido no #127).
  `test/db-tabelas.test.js` pega isso; mantenha-o passando.
- **Migração só acrescenta:** `CREATE TABLE IF NOT EXISTS` e coluna nova
  com padrão. Nunca apague nem renomeie coluna com dados.

**Produto e venda**
- **Só se vende o que existe.** Plano, landing e página de preços só
  anunciam recurso com código por trás (`server/plans.js`, CDC).
- **O cliente fala com o produto em português de lojista:** "criações", não
  créditos ou tokens; "TV deitada" ou "em pé", não 16/9; erro que diz o
  que fazer.
- **Celular primeiro:** toda tela do painel funciona em 360 px e com o
  polegar.
- **Esconder antes de apagar:** funcionalidade realocada continua
  acessível, por redirect ou em "Mais", por 30 dias.

**Testes**
- **Teste que não falha com o defeito não é teste.** Reintroduza o defeito
  e veja o teste falhar antes de confiar nele.
- **A contagem de testes só sobe.** Não apague nem pule teste para o PR
  passar: conserte o código, ou o teste, se ele estiver errado, explicando
  no PR.

## 2 · A fila

Na ordem. Cada item diz o que fazer e como saber que acabou. Travou num
item? Pergunte ao consultor e passe para o próximo enquanto espera.

### 1. Terminar o PR #137: estilo e marca no editor, rascunho no plano

Já tem código e testes. Falta conferir na tela, ajustar e fazer o merge.
- No editor da peça (Meus Designs → Editar textos), trocar entre Escuro,
  Claro e Cor da marca redesenha a peça na hora, sem chamar a IA. Com mais
  de uma marca na conta, trocar a marca também.
- Em "Criar campanha com IA" → "Gerar direto", o plano mostra o rascunho de
  cada peça, com o texto real e a foto como silhueta, antes de gastar
  crédito.

**Pronto quando:** as duas coisas funcionam no celular e no desktop.

### 2. Paletas sugeridas pela IA

O dono: "se deixar ao gosto do cliente fica feio para quem tem mau gosto".
- Na página Marca, a IA propõe **3 ou 4 paletas prontas** (cor principal,
  secundária e acento), coerentes com o logo, o site lido e o segmento. A
  melhor já vem aplicada, e as outras ficam a um toque.
- As cores da empresa, se o cliente quiser pôr, viram a BASE: o sistema
  monta a paleta em volta delas com `js/cor.js` e `js/tokens.js`, sempre
  com contraste AA (já existe teste de contraste em `test/tokens.test.js`).
- Escolher cor livre fica em "avançado", com aviso quando o contraste cair.
- Conta nova nasce com uma paleta sugerida pelo segmento: nunca fica sem
  marca.
- A paleta vale para tudo: peças, tela completa e redes.

**Pronto quando:** três contas de segmentos diferentes (ótica, padaria,
academia) mostram paletas bonitas e diferentes entre si, e uma cor feia
digitada pelo cliente vira uma paleta legível.

### 3. Criar em 4 passos

Hoje criar é confuso e espalhado: Meus Designs, a página da tela, vários
botões e um formulário longo.
- Uma entrada só, **"Criar"**, em quatro passos: (1) o que quer mostrar, em
  6 opções grandes (promoção com preço, novidade, aviso ou horário, foto do
  produto, aniversariantes, Instagram/QR); (2) uma frase; (3) o rascunho;
  (4) publicar na tela, já marcada.
- O que a Marca já sabe (empresa, tom, cores, público) não se pergunta de
  novo. Formato e quantidade de peças têm padrão bom e ficam em "ajustar".
- "Criar na mão", "Gerar imagem IA" e "Importar arquivo" vão para "Mais".
- A página da tela só recebe e organiza: "Adicionar conteúdo" abre a
  biblioteca, com "Criar novo" no topo (PLANO §5.1).

**Pronto quando:** passa no teste dos 3 toques e um cliente novo não fica
com dúvida de por onde começar.

### 4. Subir conteúdo

- Foto e vídeo direto da galeria ou da câmera do celular (`accept` e
  `capture`), com barra de progresso, e escolher a tela. Sem passar pela
  grade de 99 tipos.
- No desktop, arrastar e soltar em qualquer lugar do painel.
- Foto vertical em TV deitada (e o contrário) entra bem enquadrada, sem
  faixa preta feia: fundo desfocado da própria foto ou cor da marca.

**Pronto quando:** do celular, a foto está na TV em até 3 toques.

### 5. O painel como app no celular (PWA)

- `web/public/manifest.webmanifest` completo: nome, ícones 192 e 512
  (maskable), `display: standalone`, `start_url` e `scope` em `/app/`, e as
  cores da marca MultiTelas.
- Service worker do painel, só com a casca do app. Nunca guardar resposta
  de `/api/` em cache. Não mexa no `sw.js` da raiz: aquele é o da TV.
- Convite para instalar no Android (`beforeinstallprompt`) e, no iPhone,
  uma dica de "Compartilhar → Adicionar à Tela de Início", uma vez só.
- **Web Share Target:** compartilhar uma foto ou um vídeo da galeria para o
  MultiTelas abre o "Subir conteúdo" com o arquivo.

**Pronto quando:** o Lighthouse marca o painel como instalável e o
compartilhamento abre o envio.

### 6. Conteúdo útil para Instagram, Facebook e WhatsApp

Hoje a campanha gera "uns textos nada a ver". A mesma campanha da TV passa a
entregar, por canal, coisas que o lojista posta sem editar:
- **Instagram:**
  - post em imagem 1:1 ou 4:5;
  - Story 9:16;
  - legenda com gancho na 1ª linha, o benefício, a chamada clara e 5 a 8
    hashtags (do segmento, do bairro e da cidade da conta).
- **WhatsApp:**
  - imagem do Status em 9:16;
  - mensagem curta para lista de transmissão (até 3 linhas, com a chamada
    e o endereço ou link).
- **Facebook:** post com imagem e texto um pouco mais longo.
- **Google Meu Negócio:** post de oferta ou novidade, com o texto no limite
  dele.
- **Quando postar:** dia e hora sugeridos para cada um.

**A imagem** é a peça-html rasterizada no tamanho do canal (1080×1080,
1080×1350, 1080×1920). A peça já é desenhada no tamanho real fora da tela
(`web/src/lib/pecaHtml.js`, `conferirNosFormatos`). Tente rasterizar no
navegador primeiro. Se não der fiel (fontes, Shadow DOM), pergunte ao
consultor antes de propor servidor: é infra.

**A entrega:**
- botão **"Compartilhar"**, que no celular usa
  `navigator.share({ files, text })` e abre o Instagram ou o WhatsApp com a
  imagem e a legenda juntas, sem API da Meta;
- **"Baixar"** e **"Copiar legenda"** como alternativa e no desktop.

**A qualidade:** um prompt por canal, com 2 ou 3 exemplos bons de verdade
dentro dele. Gere 10 campanhas de segmentos diferentes e confira uma a uma
antes do merge (no modo demonstração, confira a estrutura). Nada de
"#promoção #oferta" genérico nem texto que serviria para qualquer loja.

**Pronto quando:** uma campanha gera post, Story, Status e as mensagens, e
"Compartilhar" no celular abre o app com tudo junto.

### 7. TV adaptável (PLANO §7.1)

- Margem contra overscan **ajustável por tela** no painel (0 a 5%), que a TV
  aplica na hora.
- TV em pé de primeira classe: todo layout e toda peça-ouro conferidos em
  1080×1920.
- O CSS do player em unidades de container: aposentar a mistura de `vw`,
  `clamp(px)` e `cqw` onde ainda houver.

**Pronto quando:** o player e as peças-ouro ficam certos em 1280×720,
1920×1080 e 3840×2160, deitado e em pé (prints no PR).

### 8. Expediente

O horário da loja, por tela. Fora dele, a TV mostra tela preta (ou só o
relógio, à escolha) e o vigia (`server/vigia.js`) não avisa queda.

**Pronto quando:** testado mudando o relógio do teste, e com teste
automatizado.

### 9. Print remoto da tela

No painel, "Ver a tela agora": a TV desenha o que está mostrando e manda a
imagem. Sem câmera e sem nada novo instalado no box. Se o WebView não
permitir, mande o estado (zona, item, hora) e desenhe-o no painel com o
mesmo desenhista.

**Pronto quando:** funciona com o player num navegador comum.

### 10. Peça idêntica na TV

A entrada animada da peça-ouro roda no `player.html` igual à bancada, e no
modo de TV fraca (`js/perf.js`) entra sem animação, sem engasgo.

**Pronto quando:** a mesma peça é conferida lado a lado na bancada e no
player.

### 11. Planos e preços (PLANO §6)

- Mensal R$ 149 por tela. Anual com desconto por faixa: telas 1 a 3 R$ 120,
  4 a 10 R$ 108, 11 a 25 R$ 96, 26 em diante negociado (piso R$ 90).
  Mecanismo em `server/plans.js`.
- Teto de IA **por conta** (§6.5): R$ 30 até 3 telas, + R$ 3 por tela, teto
  absoluto R$ 80. Acabou: segue com peça-ouro e upload, nunca bloqueia a
  tela.
- O cliente vê **"criações"** ("faltam 32 criações este mês"), não créditos.
- Teste de 14 dias com 20 criações.
- Inadimplência (§6.6): aviso em 3 dias, selo na TV em 10, suspensão da IA
  e de telas novas em 20. Nunca tela preta.

**Pronto quando:** os testes de cobrança passam com os números novos e a
página Plano mostra tudo em português de lojista.

### 12. Vídeo normalizado no upload

H.264, 1080p e bitrate máximo, para o box não engasgar. Se precisar de
ffmpeg no servidor, pergunte ao consultor antes: é infra. Enquanto isso,
avise no upload quando o vídeo for pesado demais para o box.

### 13. Administração (PLANO §7.2)

O que mostrar, do mais importante para o menos:
- frota, ordenada por "offline há mais tempo";
- clientes (plano, telas, contrato, pagamento);
- receita (MRR, cancelamentos, inadimplentes);
- funil (cadastro → teste → pago);
- custo de IA por conta;
- saúde (último backup, erros em 24 h);
- ações (recarregar TV, entrar como cliente com registro, estender teste).

Mesmo design do painel, com outra cor de destaque. Só para operador.

### 14. Landing e página de preços (PLANO §7.3 e §6.7)

Reescrever `landing/`:
- herói com "Testar 14 dias grátis";
- como funciona, em 3 passos;
- galeria por tipo de negócio, com peças do motor novo;
- preço público;
- perguntas;
- WhatsApp em destaque.

Nenhuma promessa sem código por trás. Menos de 500 KB e carga abaixo de
2,5 s em 4G. Onde faltar foto real ou número de WhatsApp, deixe o espaço
marcado e avise o consultor.

### 15. O menu novo do painel (PLANO §5.1)

- 8 itens: Início, Telas, Criar, Mídias, Marca, Automáticos, Relatórios,
  Conta.
- No celular, uma barra inferior com Início, Telas, Criar, Mídias e Mais.
- "Adicionar conteúdo", na tela, começa com 6 entradas grandes; os 99 tipos
  ficam em "Mais tipos", com busca.
- Toda página antiga tem endereço novo ou redirect. Nada some, só muda de
  lugar.

**Pronto quando:** passa no teste dos 3 toques e nenhum link antigo quebra.

### 16. Primeira peça na TV em menos de 10 minutos (PLANO §5.3)

Do cadastro à TV, guiado: cadastro → marca pelo site (com a paleta sugerida)
→ primeira peça → parear a TV.
- O "Comece por aqui" do Início segue esse caminho.
- Cada passo diz o próximo.

**Pronto quando:** uma conta nova no localhost chega à peça na TV (player
num navegador) em menos de 10 minutos, cronometrado e com prints no PR.

### 17. Varredura de regressão

Confira se os PRs desta rodada (#137 a #157) respeitam a seção 1b:
- rode a bancada nas 39 peças × 6 marcas;
- passe por todas as páginas do painel em 360 px;
- confira o player em 720p, 1080p e em pé;
- rode `npm test` três vezes, para pegar teste instável.

Conserte o que achar, um PR por defeito.

### 18. Documentos em dia

- `docs/ESTADO-DO-PROJETO.md`: o que entrou nesta rodada, como está montado
  e as armadilhas novas.
- `docs/PLANO.md`: marcar o que ficou pronto.
- Contagem de testes atualizada.

**Pronto quando:** uma sessão nova entende o projeto só lendo os dois.

## 2b · Rodada 2 — Criar conversando (decidido pelo dono em 21/10)

O dono, depois de usar: "faz boas criações, mas muito sem sal", "nem
imagens ele colocou", "o fluxo do Criar está confuso", "cria só algumas
peças", "está pré-definido e isso atrapalha". O propósito, nas palavras
dele: **o cliente decide, a IA dá suporte, sugere, conversa e cria.**

O fluxo novo:

1. **Criar** é uma aba própria e fácil de achar: "O que você quer mostrar
   hoje?" e um chat.
2. **Conversa sem limite de perguntas.** O cliente conta o que quer e para
   que quer. A IA pergunta, sugere e refina até dizer "entendi, posso
   gerar".
3. **A IA gera o ecossistema inteiro, ou só o que foi pedido:**
   - as TVs, cada uma com as suas zonas (várias peças girando na principal
     e na lateral; cabeçalho e rodapé animados);
   - a programação por horário;
   - os posts de Instagram, Facebook e Google, e o Status e a mensagem do
     WhatsApp.
4. **Salva sozinho**, com o botão "Pôr pra rodar".
5. **Ajustes depois:** pelo chat ("troca a foto da tela 2") ou à mão, no
   editor.

As respostas do dono no alinhamento:

- **Imagens:** o chat pergunta se usa as fotos do cliente ou se a IA gera.
- **Programação:** com horários. A IA sugere ("6–10h café da manhã") e o
  cliente ajusta.
- **Telas:** os dois sentidos — zonas dentro de cada TV, e a campanha
  espalhada por várias TVs.
- **Animação no cabeçalho e no rodapé:** letreiro, relógio, clima e data,
  logo e chamadas animadas, contagem regressiva.
- **Sugestões, não opções fixas.** Elas fazem sentido para a conta, são
  fáceis de achar e se mudam conversando. O cliente sabe, antes de gerar, o
  que vai em cada zona ("uma promoção na lateral, uma imagem com chamada na
  principal, avisos animados no rodapé").
- **O tamanho do pedido é dele.** A IA entende pelo pedido se é tudo ou uma
  peça só, e o cliente também escolhe o recorte: "só principal e lateral",
  "só cabeçalho e rodapé", "3 peças para a principal", "2 estilos de
  cabeçalho".
- **Custo:** conversar não gasta criação; só a geração gasta. Um teto
  diário de mensagens por conta segura o abuso.

**O contrato entre o chat e o gerador é o ESCOPO:** um objeto que diz o que
vai ser criado, para onde e como. O chat preenche, o cliente vê e mexe, e o
gerador obedece. Ele mora em `js/escopo.js` (UMD, como os outros `js/`), e
o servidor e o painel usam o mesmo arquivo.

### 19. Imagem de verdade

Todos os caminhos em que a campanha sai sem foto, achados em 21/10:
- `CriarPage.jsx` manda `imagens: 'acervo'` fixo: o Criar nunca gera foto.
- Em `ai-director.js`, `plano.paleta` não existe, e a cor da marca e a
  direção de arte nunca chegam ao pedido da foto.
- `compositor.camposQueExistem` joga fora a foto **já paga** quando o HTML
  do modelo não tem `data-campo-img="foto"`. Tem de escolher uma peça com
  lugar para a foto, ou cair na peça-ouro com foto.
- O prompt do plano empurra para "a maioria resolve com formas". Com
  imagens pedidas, a peça de destaque tem foto.
- As cópias de `garantirDuasPorFormato` herdam a foto da original.
- Em modo demonstração, a foto de reserva é bonita (um degradê da marca com
  silhueta, não um cinza) e não é cobrada.

Peça ao consultor: a chave de imagem (`GEMINI_API_KEY`) está em produção?
Sem ela, toda foto vira a reserva.

**Pronto quando:** com imagens pedidas, toda peça de destaque sai com foto,
com teste para cada caminho acima.

### 20. O escopo (`js/escopo.js`)

- A forma:
  - `nome`, `objetivo`, `publico`, `periodo`;
  - `imagens`: `minhas`, `gerar`, `mistura` ou `nenhuma`;
  - `telas[]`: o alvo (uma TV, todas ou um grupo), o layout e, por zona
    (principal, lateral, cabeçalho, rodapé), quantas peças, o objetivo de
    cada uma, os estilos de cabeçalho, os campos vivos (relógio, clima,
    data, contagem) e as mensagens do letreiro;
  - `redes`: post e Story do Instagram, Status e mensagem do WhatsApp,
    Facebook e Google, cada um ligado ou desligado;
  - `horarios[]`: a faixa, o começo, o fim e o foco.
- `normalizar`, que corta o que vem errado da IA ou da URL, com tetos (até
  8 peças por zona e 12 TVs).
- `custo`, que diz quantas peças e quantas fotos o escopo gera, e quantas
  criações isso gasta.
- `descrever`, que escreve o escopo em português de lojista ("Principal: 3
  peças com foto e chamada").
- `recortes`: "tudo", "só principal e lateral", "só cabeçalho e rodapé",
  "3 peças para a principal", "2 estilos de cabeçalho", "só redes". Cada um
  aplica um recorte no escopo sem gastar token.

**Pronto quando:** os testes cobrem a forma, os tetos, o custo e cada
recorte.

### 21. A conversa (servidor)

- `server/ai-conversa.js` substitui o teto de 5 perguntas do briefing.
  - **Sem limite de perguntas.**
  - Cada volta manda à IA o escopo atual, a marca, a memória, as TVs da
    conta e as últimas mensagens (não o histórico inteiro, PLANO §4.12).
  - Devolve a resposta, as sugestões clicáveis, o escopo atualizado e
    `pronto` quando a IA entendeu.
  - Fala português de lojista, uma pergunta por vez, e sempre propõe
    alguma coisa em vez de só perguntar.
- Tabela `conversas`, nos dois bancos: `id`, `tenant_id`, `titulo`,
  `mensagens`, `escopo`, `campanha_id`, datas. Assim a pessoa fecha e volta
  depois.
- Rotas `/api/criar/conversas`: criar, listar, abrir e mandar mensagem.
  Todas presas à conta.
- Teto: 120 mensagens por hora e 400 por dia, por conta. Conversar não
  gasta criação.
- Modo demonstração: uma conversa roteirizada, que preenche o escopo pelas
  palavras do pedido, para dar para testar o fluxo no localhost.

**Pronto quando:** uma conversa de 15 voltas funciona, guarda e retoma, e
não vaza entre contas.

### 22. Cabeçalho e rodapé vivos (player)

- O cabeçalho e o rodapé passam a aceitar **várias peças girando**
  (`zona.pecas[]`, cada uma com a sua duração). `zona.peca` continua
  valendo, e a TV com JS antigo mostra a primeira.
  - `normalize`, em `js/storage.js`, aprende o campo novo; sem isso, a TV
    perde o campo no caminho.
- Campo vivo novo, `data-vivo="contagem"`, com `data-alvo` (data e hora): a
  contagem regressiva ("acaba em 2d 04:15:09"). Entra na lista da porta
  (`js/peca-html.js`), com teste.
- As chamadas giram no cabeçalho também (`data-vivo="mensagens"`), não só no
  rodapé.
- **TV fraca:** as peças trocam sem transição, e a contagem e o relógio
  continuam mudando o texto, sem animação. Nada de engasgo.
- Peças-ouro novas de cabeçalho e de rodapé que usam isso, passando pela
  bancada.

**Pronto quando:** o player em 1080p e em pé mostra o cabeçalho girando 2
estilos e o rodapé com letreiro e contagem, e a bancada passa limpa.

### 23. O gerador do ecossistema (servidor)

- `server/ecossistema.js`: recebe o escopo e devolve tudo.
  1. Planeja peça por peça, já com zona e papel (cabeçalho, destaque,
     lateral, rodapé), textos, pedido de foto e faixa de horário. Reusa o
     plano do `ai-director` (`planoAprovado`) em vez de criar outro motor.
  2. Gera as fotos conforme a escolha (`minhas`: as fotos do cliente e o
     banco; `gerar`: a IA gera; `mistura`: as do cliente primeiro).
  3. Compõe as peças no tamanho da zona (`compositor`, com o papel certo).
  4. Escreve as redes (`server/redes.js`) e a programação: os horários
     viram `agendamento` nos itens.
- **Menos sem sal:** direção de arte da marca em toda foto, coreografia de
  entrada em toda peça, variedade de peças-ouro na mesma campanha (nunca a
  mesma estrutura duas vezes na mesma zona) e destaque sempre com foto
  quando há imagens.
- Tabela `campanhas`, nos dois bancos: `id`, `tenant_id`, `nome`,
  `conversa_id`, `escopo`, `resultado`, `estado` (pronta, no ar ou pausada),
  `telas` e datas. As peças também entram na `library` com o nome da
  campanha, e Meus Designs continua funcionando.
- **Salva sozinho** ao terminar. Retoma depois de recarregar, como o job de
  hoje.
- Custo: gasta o que `escopo.custo` disse, com o portão de saldo de hoje.

**Pronto quando:** um escopo de 2 TVs × 4 zonas + redes + 3 horários gera
tudo no modo demonstração, com teste de cada parte.

### 24. Criar é o chat (painel)

- A página **Criar** vira a conversa:
  - "O que você quer mostrar hoje?" no topo;
  - **sugestões da conta** (do guia, pela marca, pelo segmento e pela
    data): o clique põe o texto na caixa para a pessoa mudar, não manda
    sozinho;
  - os **recortes** como botões;
  - o cartão **"O que vou criar"** sempre à vista: por TV e por zona, com a
    quantidade, a foto ou não e as redes, editável à mão (liga, desliga,
    mais, menos) ou pelo chat;
  - a linha de custo e o botão **Gerar**, que acende quando a IA diz que
    entendeu (e "Gerar já", para quem não quer conversar).
- **Conversas recentes**, para continuar depois.
- O Criar de 4 passos vira **"Criação rápida"**, em Mais (esconder antes de
  apagar). A campanha de Meus Designs continua lá.
- Celular primeiro: 360 px, com o teclado aberto, e o cartão do escopo
  recolhível.

**Pronto quando:** do celular, uma conta nova conversa, gera e vê o
resultado sem ajuda, e o teste dos 3 toques passa ("criar com IA e
publicar": abrir Criar → tocar numa sugestão → Gerar → Pôr pra rodar).

### 25. O resultado e o "Pôr pra rodar"

- O resultado aparece agrupado:
  - **TVs:** a prévia da tela inteira, com as zonas;
  - **Redes:** `RedesSociais` por peça;
  - **Programação:** os horários.
- **"Pôr pra rodar":** publica em várias TVs de uma vez, com cada peça na
  zona que o escopo disse.
  - `aplicarConteudo` recebe a zona explícita, e `distribuirPorZona` fica
    de reserva.
  - Troca o layout da TV quando a TV não tem as zonas do escopo, com
    confirmação.
  - A campanha passa a "no ar". Pausar e retomar tiram e põem os itens dela
    (`_campanha`).
- A página da tela mostra de qual campanha vem cada item.

**Pronto quando:** uma campanha de 2 TVs vai ao ar nas duas, cada peça na
sua zona, com prints do player.

### 26. Ajustar depois

- No resultado, cada peça tem **Editar** (o `EditarPeca` de hoje) e o chat
  continua aberto: "troca a foto da tela 2", "mais uma peça na lateral",
  "tira o Facebook". A IA devolve só a mudança no escopo, e só o que mudou é
  gerado de novo (e cobrado).
- Desfazer o último ajuste.

**Pronto quando:** três ajustes por chat refazem só as peças certas, com
teste.

### 27. Varredura e documentos

Os itens 17 e 18 de novo, para esta rodada:
- a bancada;
- as páginas em 360 px;
- o player em 720p, 1080p e em pé;
- `npm test` três vezes;
- o `ESTADO-DO-PROJETO.md` e o `PLANO.md` em dia.

## 2c · Rodada 3 — o painel coerente com o Criar (decidido pelo dono em 21/10)

O dono, testando a rodada 2: "está tudo bom até eu clicar em Conteúdo". A
página da TV, as Mídias e Meus Designs ficaram do jeito de antes do Criar
conversando, e não conversam com ele. A auditoria (prints em `qa/`, branch
`prints`) achou, entre outras coisas:
- três IAs disputando com o Criar na página da TV;
- o cabeçalho e o rodapé da TV que não conhecem a lista de peças nem a
  contagem;
- o rodapé tratado como feed de notícias;
- zonas como botões soltos, sem desenho da TV;
- a página da TV estourando a largura no celular;
- Ajustes da tela misturando layout, tema, marca e música;
- Mídias organizada pelo disco, e não pelo propósito;
- Meus Designs repetindo a mesma campanha e publicando por outro caminho.

**As decisões do dono:**
- As peças prontas viram uma aba em **Mídias**. Mídias passa a ser "tudo o
  que eu tenho".
- Os avisos de data viram **sugestão no Criar e no Início**, e saem do topo
  da TV.
- Quando a TV não tem as zonas da campanha, o painel **pergunta, já marcado
  para trocar** o layout.

### 28. Um caminho de IA só

"Campanha com IA", "A IA monta tudo" e o formulário antigo saem da página da
TV. "Campanha completa com IA" sai de Meus Designs › Mais. Tudo leva ao
Criar com a TV marcada. Esconda antes de apagar: o código fica, sem botão,
por 30 dias.

**Pronto quando:** não sobra nenhuma IA fora do Criar.

### 29. Campanhas como unidade

- Página **Campanhas** no grupo Criar. Cada campanha aparece com o estado
  (no ar, pausada, pronta), as TVs e uma prévia por zona.
- Abrir uma campanha leva ao resultado do Criar: Pôr pra rodar, Pausar,
  Ajustar.
- Meus Designs deixa de repetir a campanha. "Publicar campanha" de uma
  campanha do Criar usa o mesmo caminho do Pôr pra rodar (`lib/rodar.js`).

**Pronto quando:** uma campanha aparece uma vez, com o estado e as TVs.

### 30. A TV como desenho

- A página da TV mostra a miniatura do layout, com as zonas clicáveis.
- Cada zona mostra o que gira nela. No cabeçalho e no rodapé, a **lista**:
  pôr, tirar, ordenar, a duração e a contagem.
- Bloco **Campanhas nesta TV**, com pausar e tirar.

**Pronto quando:** uma campanha completa aparece inteira na TV e se mexe por
lá.

### 31. O rodapé com dois modos claros

"Peças e avisos" (o da campanha) ou "Notícias" (RSS). Cada modo mostra só os
controles que valem para ele.

**Pronto quando:** nenhum controle aparece sem fazer nada.

### 32. Adicionar numa zona

Começa pelo que já existe: peças prontas que cabem naquela zona, depois
fotos e vídeos, depois tipos prontos, depois "Criar novo", que abre o chat
com a TV e a zona marcadas.

**Pronto quando:** uma peça pronta entra numa zona em 3 toques.

### 33. Ajustes da tela por tarefa

- **Aparência:** o layout com desenho, a marca como padrão e o tema como
  opção.
- **Encaixe:** a margem, com explicação visual, e girar.
- **Som.**
- **Horário:** o expediente.
- **Avançado.**

O nome da TV fica separado do nome do cabeçalho. Ao trocar o layout, o
painel diz o que muda nas zonas.

**Pronto quando:** cada ajuste está onde se espera, no celular e no desktop.

### 34. Mídias por propósito

- Abas: **Peças prontas** · **Fotos e vídeos** · **Músicas** · **Da IA** ·
  **Banco de imagens**.
- O uso do disco vira uma linha discreta.
- Filtros por formato e por zona (principal, lateral, faixas).

**Pronto quando:** "o que eu tenho para pôr na TV" se acha em um toque.

### 35. Celular e avisos de data

- A página da TV e as páginas novas funcionam em 360 px, conferidas com uma
  conta que **tem TV**.
- O aviso de data sai do topo da TV e vira ideia no Criar e no Início.

**Pronto quando:** não há rolagem lateral com conta de TV.

### 36. Varredura e documentos

Como no item 27, agora com uma conta que tem TV pareada.

## 2d · Rodada 4 — o que o dono achou testando (22/10)

O dono, testando local: o cabeçalho e o rodapé não entraram; pediu para
gerar e nada começou; a TV nova recebeu uma peça qualquer e o nome de outra
empresa; o Conteúdo está escondido dentro de Telas.

**Decisões do dono:** o Conteúdo ganha aba própria, **Programação**; o
cabeçalho sem peça fica com o nome da conta e o relógio, e o resto sem
conteúdo fica preto, pulsando, esperando.

### 37. Pediu, gerou
A IA devolve `gerar` quando a última fala manda começar ("pode gerar",
"manda ver"), com uma regra de palavras de reserva; o Criar gera sozinho.
**Pronto quando:** "Pode gerar!" no chat começa a geração sem clique.

### 38. TV nova recebe a campanha inteira
O diálogo de parear oferece a campanha mais recente, inteira (cabeçalho e
rodapé junto), ou Criar para esta TV — nunca uma peça solta.
**Pronto quando:** parear e aceitar põe todas as zonas da campanha.

### 39. A TV esperando
Zona sem conteúdo: preta, pulsando. O nome de exemplo ("Raft Embalagens")
nunca aparece numa tela de cliente: vale o nome da conta.
**Pronto quando:** TV com uma peça só mostra o resto pulsando, com o nome certo.

### 40. Programação
Item próprio no menu, entre Telas e Criar: cada TV desenhada com o que está
passando e o botão de editar. Telas fica com o aparelho.
**Pronto quando:** do menu ao editor de uma TV em um toque.

### 41. Fundo da TV
Combina com as peças (padrão), claro, escuro ou uma cor. Feito em #191.

## 2e · O que sobrou da auditoria da rodada 3 (noite de 22/10)

O dono: "pode trabalhar que eu vou dormir". As três sobras que ficaram de
fora dos itens 28–36.

### 42. Meus Designs publica pelo mesmo caminho
Peça de cabeçalho ou rodapé publicada de Meus Designs vai para a faixa
(`aplicarPeca`), e não para a principal. Publicar de novo troca, não empilha.

### 43. As campanhas repetidas em Meus Designs
As cópias que o Criar fazia antes do item 29 somem da lista de Meus Designs
(escondidas, não apagadas): a campanha mora em Criar › Campanhas.

### 44. Vestir a tela, de volta
O pacote da data (cores, decoração, conteúdo) volta como opção em
Ajustes › Aparência, já que saiu do topo da TV no item 35.

## 2f · Rodada 5 — o DNA novo (aprovado pelo dono em 23/10)

O dono, depois de usar: "não está tão intuitivo e fácil de usar quanto
deveria", "a intenção é a facilidade", "tirar coisas que confundam o
usuário". O teste de uso de 23/10 (conta nova de metalúrgica + ótica com
dados, 2 passadas no navegador, 3 varreduras de código) achou ~120
defeitos; eles estão distribuídos nos itens abaixo. O dono aprovou
**todos os itens**, com os comentários dele citados entre aspas.

Numeração própria, com **D** na frente (D0.1 … D40), para não confundir
com os itens 1–44 das rodadas anteriores.

**Trabalho em dois PCs.** Este PC executa; uma conta do dono no Claude na
nuvem é o **testador**: lê a issue de testes, testa cada item em produção
com contas de teste e responde na issue
[#198](https://github.com/Thiagoolivs/Multi-telas/issues/198) com ✅, 🔴 (bloqueia: conserte antes do
próximo item) ou 🟡 (conserte no fim da fase). Roteiro dele em
[`TESTADOR.md`](TESTADOR.md). Ao fazer o merge de cada item, comente na
#198: `[executor] D<n> no ar, PR #X — testar: <roteiro curto>`.

Decisões que valem para a rodada inteira:
- **Público:** empresas e comércio, um produto só, com **perfil da conta**
  (Empresa, Comércio, Saúde) que muda atalhos, ideias, textos e peças.
- **Lançar depois da Fase 1.**
- **Billing:** Essencial (modelos prontos + IA básica) e Pro "IA em tudo"
  (R$ 179/tela) quando a Fase 3 existir. Nunca vender antes de existir.
- **A IA programa, a TV executa.** Nada de IA decidindo ao vivo na TV:
  ela escreve regras e dados; o player executa offline. Mudança grande
  (layout, tema) sempre com prévia e ok.

### Fase 0 · Urgente, antes de tudo

**D0.1 Cobrança não libera plano grátis.** Sem `ASAAS_API_KEY`, o
`dev-activate` ativa plano pago e pacotes de graça
(`server/routes/billing.js`). Em produção ele só existe com chave de
simulação explícita; o boot avisa o que falta. O dono: "já adicionei as
chaves, talvez falte algo" — peça ao consultor para conferir no Railway.
**Pronto quando:** sem a chave, ativar plano pago em produção é recusado.

**D0.2 Link de senha seguro.** Sem `APP_URL`, os links de redefinição e
confirmação usam o `X-Forwarded-Host` do pedido. Em produção, `APP_URL` é
obrigatório e o boot reclama. **Pronto quando:** um pedido com host
forjado não muda o link do e-mail.

**D0.3 IA de volta, com erro claro.** Lista de modelos atualizada
(`gemini-3.8-flash`; sai o 2.5, que o Google desligou), modelo morto
memorizado, 429 de teto tratado como "IA fora" (sem cascata), troca de
provedor quando há outra chave, prazo em toda chamada, e o painel diz
"A IA está fora do ar agora; sua conversa está salva". Erro sempre vai
para `erros.registrar`. **Pronto quando:** com a chave estourada, o chat
mostra a frase clara e o painel do operador mostra o erro.

**D0.4 Teto de gasto da IA.** Medir os tokens reais (hoje grava 5
centavos fixos), anotar chamada que falhou, teto em R$ por conta e global
com alarme no painel do operador, IA de texto respeitando plano e teste
vencido, débito de créditos atômico. **Pronto quando:** uma conta passa
do teto e para, e o operador vê o alarme.

**D0.4b Crédito reservado antes de gerar.** Revisão do consultor no D0.4:
duas gerações ao mesmo tempo, com saldo para uma só, passam no conferir e a
segunda sai de graça. Reservar o crédito no conferir (UPDATE … WHERE saldo
>= custo, conferindo as linhas afetadas) e devolver se a geração falhar.
**Pronto quando:** duas fotos pedidas juntas com saldo para uma: uma sai,
a outra diz que o saldo acabou.

**D0.5 Nunca perder programação.** Config que não carregou não vira
"tela vazia" editável; salvamento automático que falha tenta de novo e
avisa; gravação com versão (a última escrita não apaga a de outra aba).
**Pronto quando:** derrubar a rede no meio da edição não muda a TV.

**D0.6 TV sem travar.** Vídeo pausado fora do expediente volta quando a
loja abre; parar a zona chama a saída do slide (sem timers sobrando);
sino de urgente não toca com a tela apagada. **Pronto quando:** a TV
atravessa o fim e o começo do expediente com vídeo tocando.

**D0.7 LGPD sem sobras.** Excluir a conta apaga conversas, campanhas,
marcas, jobs e o resto; exportar inclui tudo; apagar mural apaga fotos,
IP e arquivos; a TV recebe só os aniversariantes da semana, sem
matrícula; apagar mídia em uso pede confirmação. **Pronto quando:** o
teste de exclusão não acha linha nenhuma da conta.

**D0.8 Assinar abre a cobrança.** O dono: "quando clico no botão de assinar
um plano, não abre nada". O consultor achou no log: todo checkout em
produção respondia 502. O cliente ia ao Asaas sem CPF/CNPJ, e o erro
aparecia no topo da página, longe do botão, sem registro no log. Pedir o
documento (conferido pelos dígitos, não guardado no nosso banco), falha
registrada e visível junto do botão. **Pronto quando:** conta nova clica
em Assinar, digita o CNPJ e cai na fatura do Asaas.

### Fase 1 · Limpar e profissionalizar (depois dela, lança)

**D1 Painel azul, escuro sério.** Primeiro, cartões de cor e esboços para
o dono aprovar (na issue). Depois: azul corporativo no lugar do índigo
nos dois modos, escuro mais sóbrio, a maioria dos ícones de brilho fora.

**D2 Cortar o que confunde.** Selo "Sistema operacional" (fixo, e em
português soa como Windows), "Visão geral" 3×, "Alertas" 2×, cartões
zerados na conta vazia, busca do topo que não faz nada, jargão (frota,
pareie, dispositivo, player, relação), "Refinar conversando" e "Campanha
completa com IA" (não existem mais), 5 jeitos de criar viram 2,
`prompt()`/`confirm()` do navegador viram diálogos nossos.

**D3 Fluxo sem becos.** Os ~35 defeitos do painel da varredura de 23/10:
erro de rede não aparece como lista vazia, erro dentro do diálogo
aberto, pânico do mural sempre responde, Equipe confirma antes de
remover, páginas que recarregam no lugar certo, ações escondidas no
celular, termos iguais para a mesma coisa.

**D4 Perfil Empresa, Comércio, Saúde.** Escolhido no cadastro (deduzido,
editável em Ajustes). Muda os atalhos do Início, as ideias e o exemplo do
Criar, os textos ("loja" × "empresa"), a prévia das paletas e as peças
sugeridas.

**D5 Nem tudo é campanha.** A conversa aceita um aviso, uma peça ou uma
dúvida sem montar campanha. O cartão "O que vou criar" mostra só o que a
conversa decidiu (hoje: 22 botões antes de qualquer conversa).

**D6 Imagens base saem da Marca.** Viram etiqueta "da marca" em Mídias ›
Fotos. Marca reordenada: logo primeiro, depois cores, nome e tom, site e
o avançado (fontes, direção, várias marcas). Tudo salva sozinho.

**D7 Logo analisada e corrigida.** Aceita SVG e PNG. A IA analisa (fundo,
resolução, cores, leitura no claro e no escuro); a ferramenta recorta
fundo sólido, vetoriza logo simples e gera as versões clara e escura. O
dono vê antes e depois e aprova. Nunca troca calado.

**D8 Logo aparece na TV.** O cabeçalho usa a logo (`settings.logoUrl`
nunca era preenchido) e as peças que têm lugar de logo também.

**D9 Referência de estilo útil.** O Criar lê as imagens de referência
(hoje só o diretor antigo lê); o site baixa o CSS externo e as cores lidas
viram paleta sugerida; a og:image entra no acervo.

**D10 Campanhas em pastas.** Cartão-pasta com capa, estado, TVs e as
peças dentro; renomear, arquivar, excluir e buscar; sem o corte
silencioso de 20. "Campanha" com um sentido só: a pasta de Meus Designs
vira a mesma coisa.

**D11 Aba "Criando".** Gerações em andamento no Criar, com progresso e
aviso quando termina.

**D12 Rodapé legível e bonito.** O dono: "mais editável, e garantir que o
pedido da zona não vaze no rodapé; ele deve fazer sentido". Rolagem que
mostra o fim da frase, sem cortar g/p/j, cores escolhidas respeitadas,
mensagens com espaço, zona vazia elegante (hoje: faixa preta com uma
bolinha), sem dois relógios.

**D13 Prévia visual antes de gerar.** Cartões de cor e esboço de cada tela
no chat do Criar (antes de gastar) e na Marca.

**D14 Publicar só quando pronto.** Hoje cada tecla publica e a TV
redesenha a tela inteira enquanto a pessoa digita, e escolher "Aviso"
publica um aviso vazio. Rascunho, e a TV só recebe ao salvar.

**D15 Aniversário e mural entram na TV.** O dono: "tem que ser do jeito
que eu falei; me fale uma forma melhor, mas na mesma base". O jeito dele:
o aniversariante aparece na **semana do aniversário**, e o sistema
administra a convivência com as datas sazonais. Proposta na mesma base:
salvar a lista oferece "mostrar nas TVs" (todas ou um grupo); na semana
certa o player encaixa sozinho um cartão de aniversário no rodízio (sem
ninguém pôr item na zona) e, no dia, um destaque; em semana sem
aniversário, nada aparece. O mural idem: criar o mural oferece as TVs, e
"1 na tela" só aparece quando a foto está mesmo na TV. Descreva a
proposta na issue para o dono aprovar.

**D16 Os 43 modelos já visíveis.** Cliente novo vê em Peças prontas as
peças-ouro que já existem, preenchidas com a marca dele.

**D17 Criação rápida em destaque.** O dono: "facilita muito a vida de quem
quer criar; precisa ter pelo menos 10 opções". Dez ou mais pontos de
partida rápidos, visíveis no Início e no Criar.

### Fase 2 · Telas prontas (a prioridade do dono)

**D18 80 telas prontas adaptáveis.** Doze estruturas com variações, por
perfil, em lotes de 20 que o dono aprova na bancada. Todas com tokens,
mudando com tema e cores.

**D19 Editar qualquer peça.** Trocar fonte, cor e tela de peça feita pela
IA; o dono: "trocar elementos e a visualização no geral também".

**D20 Pedir à IA dentro da peça.** A IA muda só o pedido (patch), e o
botão de IA volta para dentro da zona. O dono: "melhore as zonas também,
hoje está uma visualização um pouco amadora".

**D21 Quiz com cronômetro.** Pergunta, alternativas, tempo correndo,
resposta e explicação. Conteúdo gerado passa por revisão antes de ir ao
ar (fato errado na parede é pior que nenhum).

**D22 Planos: IA básica × integrada.** Essencial e Pro como decidido;
nada vendido antes de existir.

### Fase 3 · Programação inteligente (o DNA)

**D23 Prioridade, validade e alvo.** Toda peça ganha tipo, prioridade,
validade, TVs e zona. O dono: "a empresa poderá adicionar um calendário
da empresa, importando texto, e a IA cria todo o conteúdo e o cronograma
de avisos, programado e editável".

**D24 A TV distribui o tempo.** Peso por prioridade; aniversário, data
comemorativa, campanha e aviso convivem por regra, no player, offline.

**D25 Urgente toma a tela.** Qualquer peça pode; campo de prioridade no
painel.

**D26 Mandar para todas as TVs.** Envio em lote no servidor, grupos de
verdade e desfazer (hoje é o navegador, TV por TV, e falha no meio mente).

**D27 IA encaixa o aviso.** "Adicione aviso da peça quebrada no banheiro":
a IA cria, acha o espaço, mostra a prévia e, com o ok, a frota recebe.

**D28 IA troca layout e tema.** Lado da lateral, tema, fundo, relógio,
clima e temas novos, sempre com prévia.

**D29 Transições profissionais.** Sem piscar, sem remontar a tela inteira
ao trocar layout, reorganização animada só com transform e opacity.

### Fase 4 · Pessoas e RH

**D30 Cadastro de pessoas.** Planilha do RH (Excel ou CSV), setor,
nascimento e foto ligada a cada pessoa; importar não apaga quem chegou
pelo QR.

**D31 Foto pelo QR, o RH aprova.** O dono: "a pessoa lê um QR code na tela
pedindo as fotos, isso envia alguma forma de autenticação e a pessoa
envia as fotos; isso acontece semanas antes dos eventos ou quando o RH
programar". Autenticação por código no celular ou e-mail cadastrado (CPF
mais data não prova identidade); fila de aprovação com a prévia da TV.

**D32 Aniversariante na semana dele**, sozinho, convivendo com as datas.

**D33 Datas com fotos da equipe.** Mães, pais, mulheres (falta hoje),
crianças, Natal e as outras.

**D34 O RH vê tudo fácil.** Pessoas, pendentes e próximos aniversários.

**D35 LGPD por pessoa.** Consentimento, prazo de guarda e excluir uma
pessoa só. Revisão jurídica com o dono.

### Fase 5 · Dados

**D36 KPIs da empresa na TV.** O dono: "conexão configurável via endpoint
também, para APIs como as do TOTVS Protheus". Conector genérico (a
empresa envia para nós, ou buscamos um endereço configurável com
autenticação, sempre por `server/site.js`) e peça de KPI com destaque.

**D37 Banco de imagens externo: Pixabay** (decisão do dono), com o
crédito automático.

### Depois, não agora

**D38 Postar nas redes.** O dono: "já deixa no esquema, ou pelo menos
direciona para o link de postagem das redes". Agora: o botão abre a
página de postar de cada rede com a imagem e o texto prontos.
**D39 Senhas e clínicas.** **D40 Escala** (várias instâncias).

### Depois da rodada 5

**D41 Atualização remota do APK** (PLANO §9, Operação). O app (`android/`)
é só a casca do WebView: o conteúdo se atualiza sozinho, a casca não, e o
APK do Actions expira. O `android.yml` publica o APK assinado num Release
(tag `apk-v<versão>`); o servidor serve `/apk/ultimo.apk` e
`/apk/versao.json` (`versionCode`, `versionName`, tamanho, sha256) — a TV
baixa só de nós. A TV conta a versão da casca (`Ponte.versao()`) no pulso e
o painel mostra "há uma versão nova" no aparelho. A casca baixa em segundo
plano, confere o sha256 e abre o instalador (`REQUEST_INSTALL_PACKAGES`);
o aviso fica no canto, sem tapar conteúdo. Falhou: segue na versão antiga,
nunca tela preta. **Pronto quando:** um APK com `versionCode` maior chega
ao box de teste e instala com um OK no controle.

## 3 · O consultor (issue #135)

Como falar com ele e o que ele pode fazer: [`CONSULTOR.md`](CONSULTOR.md).

Um Claude com o contexto todo do projeto fica de plantão na issue
[#135](https://github.com/Thiagoolivs/Multi-telas/issues/135) e confere a
cada minuto.

- **Chamar:** `gh issue comment 135 --body "@consultor <pergunta>"`.
- **Ler as respostas:** `gh issue view 135 --comments`, ao começar cada item
  e antes de cada merge.
- **Peça a ele:**
  - dúvida de produto ou de arquitetura;
  - teste em produção depois do merge ("@consultor testar no ar: …");
  - qualquer infra (Railway, variáveis, bucket, ffmpeg, servidor novo).
- **Não espere parado:** perguntou, siga para o próximo item.

## 4 · Ao terminar cada item

1. Marque o item no `docs/PLANO.md`, se ele estiver lá, no mesmo PR.
2. Faça o merge.
3. Avise numa linha na issue #135: "item N feito, PR #X" e o que o
   consultor deve testar no ar.
