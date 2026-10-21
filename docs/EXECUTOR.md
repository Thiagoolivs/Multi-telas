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

## 3 · O consultor (issue #135)

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
