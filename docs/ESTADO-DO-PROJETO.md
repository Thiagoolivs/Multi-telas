# Estado do projeto

Retrato honesto do MultiTelas hoje, escrito para quem vai continuar o trabalho —
inclusive para mim mesmo daqui a duas semanas, ou numa conversa nova sem
histórico nenhum. A intenção declarada do produto é **qualidade com facilidade**:
arte de agência para quem não tem agência. Este documento avalia o sistema contra
essa régua, não contra uma lista de recursos.

Atualizado em: **23/10/2026** · 1488 testes passando · Fases 1 a 5 do
DNA novo completas, e a parte de "agora" do D38 (EXECUTOR §2f, D0.1–D38,
PRs #201 a #268).

---

## Rodada 5e — o DNA novo, Fase 5: dados (23/10, PRs #266 a #268)

- **Indicadores na TV** (D36, Relatórios › Indicadores): o dono pediu
  "conexão configurável via endpoint, para APIs como as do TOTVS Protheus".
  **Receber**: o sistema da empresa manda os números com um token (o caminho
  do Protheus na rede interna). **Buscar**: um endereço JSON, com a
  autenticação **cifrada** (`server/segredo.js`) e sempre por `site.js`
  (a senha não segue redirecionamento para outro host). Na TV, o cartão KPI
  ao vivo: número, variação, barra da meta e "Meta batida!".
- **Banco de imagens Pixabay** (D37): busca pelo servidor (a chave nunca vai
  ao navegador), cache de 24 h, "usar" baixa para as Mídias da conta com o
  crédito, que aparece discreto no canto da TV.
- **Postar nas redes** (D38, a parte de agora): no computador, "Abrir o
  Instagram/WhatsApp/Facebook/Google" abre a página de postar (o WhatsApp
  com o texto), baixa a imagem e copia o texto. SW em v60.

**Para o ar (pedido ao consultor, que tem o Railway)**: `MT_CHAVE_SEGREDOS`
(32 bytes em base64; sem ela, o "Buscar" funciona só sem autenticação) e
`PIXABAY_API_KEY` (sem ela, a aba do banco de imagens não aparece).
**Depois**: D39 (senhas e clínicas), D40 (escala), D41 (APK remoto).

## Rodada 5d — o DNA novo, Fase 4: pessoas e RH (23/10, PRs #257 a #264)

O dono: "a pessoa lê um QR code na tela pedindo as fotos, isso envia alguma
forma de autenticação e a pessoa envia as fotos; isso acontece semanas antes
dos eventos ou quando o RH programar". O consultor revisou cada PR (notas no
#260).

- **Pessoas** (D30, Automáticos › Pessoas, era Aniversariantes): planilha do
  RH em **Excel ou CSV** (sem biblioteca), setor e e-mail, prévia do que a
  importação faz (`js/pessoas.js`, a mesma regra no servidor). Importar de
  novo só mexe no que veio da planilha: quem chegou pelo QR ou à mão fica, e
  a foto não some. O ano do nascimento não é guardado. Foto é sempre arquivo
  da própria conta (https é baixado, #260).
- **Foto pelo QR, o RH aprova** (D31/D31b): pedido com período (fecha em 30
  dias se não disser), página `/f/CODIGO` → **código no e-mail** → passe
  curto → foto com **autorização explícita gravada** → fila do RH. Na TV, o
  cartão "Mande sua foto" com o QR no período. O código nunca volta na
  resposta em produção.
- **Aniversariante na semana dele** (D32): um cartão por pessoa, com a foto
  grande, de segunda a domingo da semana do aniversário; no dia, em dobro.
- **Datas com fotos da equipe** (D33): Dia da Mulher entrou no catálogo; o
  RH pede fotos para uma data (mães, pais, mulheres, crianças, Natal…) e as
  aprovadas formam o **mural da data** na TV, na semana dela.
- **O RH vê tudo** (D34): resumo de pessoas (sem foto, sem e-mail), fotos
  para aprovar e próximos aniversários, em Pessoas e no Início.
- **LGPD por pessoa** (D35): tirar a pessoa ou a foto apaga os arquivos; o
  mural da data sai 30 dias depois (aviso, .zip, guardar mais); a fila não
  decidida sai em 30 dias; o aceite aparece na pessoa. SW em v58.

**Esperando o dono**: o texto da política de privacidade (setor, e-mail,
QR e os prazos) com o advogado; os prazos de 30 dias (anotados pelo
consultor); e o que já esperava (lote 1, preço, lançamento). **Próximo**:
Fase 5 (D36 KPIs com endpoint/TOTVS, D37 Pixabay).

## Rodada 5c — o DNA novo, Fase 3: programação inteligente (23/10, PRs #247 a #255)

O dono: "a empresa poderá adicionar um calendário da empresa, importando
texto, e a IA cria todo o conteúdo e o cronograma". O consultor revisou cada
PR; as notas viraram os PRs #252 e #254.

- **Calendário da empresa** (D23): colar o texto (Programação ›
  Calendário) → a IA lê as datas (`server/calendario.js`, sem IA uma regra)
  → a pessoa revisa → cada data vira peça dos modelos com a marca, com
  validade (`agendamento`) e prioridade, marcada `_calendario`.
- **A TV distribui o tempo** (D24, no player e offline): campanha,
  calendário e peças avulsas se revezam; prioridade **alta** passa 2× por
  volta, nunca duas seguidas. **Urgente** (D25) toma a tela com qualquer
  peça, 3× por volta.
- **Mandar para todas as TVs** (D26): `POST /api/lote` grava tudo ou nada
  (versão de cada TV conferida antes), guarda o "antes" 30 dias e tem
  **Desfazer**; atalhos "Todas"/grupo; campanha, calendário e telas prontas
  vão num envio só. TV repetida no envio é recusada (#252).
- **Aviso rápido** (D27): "Adicione aviso da peça quebrada no banheiro" →
  a IA arruma título, detalhe, validade, prioridade e TVs → prévia do alerta
  dos modelos (sem texto de exemplo) → frente da zona principal (ou da maior
  lista, #254), em lote, com Desfazer. A validade sai da TV pelo relógio
  dela, mesmo offline.
- **IA troca layout e tema** (D28): no editor da TV, "lateral do outro
  lado, tema claro, sem relógio" → mudanças conferidas (layouts que cabem
  na TV, temas e fontes que existem) → **Agora × Como fica** → só muda o
  rascunho com o ok. Relógio e clima do cabeçalho com liga/desliga; três
  temas novos (Clínica Suave, Corporativo Claro, Varejo Quente).
- **Transições** (D29): trocar o layout não remonta a TV — as zonas que
  continuam deslizam (FLIP, só transform/opacity), vídeo não reinicia; a
  zona que muda cruza em vez de piscar. SW em v55.

**Esperando o dono**: o mesmo da Fase 2 (lote 1 na bancada, preço do
Essencial, lançamento). **Próximo**: Fase 4 (D30–D35, pessoas e RH).

## Rodada 5b — o DNA novo, Fase 2: telas prontas e edição (23/10, PRs #238 a #245)

A prioridade do dono: telas prontas para "só personalizar e publicar", e
poder mexer em qualquer peça. O consultor revisou cada PR (notas viraram
os PRs #241 e #244).

- **Telas prontas** (D18): lote 1 com 20 telas no manifesto (8 Comércio, 6
  Empresa, 6 Saúde; as 12 estruturas), em estado `proposta` até o dono
  aprovar na bancada (`/bancada.html` › Tela completa › "Lote 1"). A
  bancada confere a tela inteira com o detector do painel. No painel,
  **Mídias › Telas prontas** mostra só as aprovadas, com a marca da conta;
  "Trocar textos" confere no tamanho da zona; "Pôr na TV" grava com versão.
  Nada da empresa de exemplo (nome, telefone, endereço, @, site) chega à TV
  do cliente — testado em todas as telas do manifesto (#241).
- **Editar qualquer peça** (D19): o editor de peça ganhou Cor e fonte,
  Elementos (esconder; a porta guarda `ocultos` e o campo vai vazio para a
  TV antiga) e Desenho (outra peça da família, com os textos).
- **IA dentro da peça e zonas** (D20): "Peça à IA" devolve só o remendo
  (`server/ajuste-peca.js`, nunca HTML); o editor da TV abre a peça em HTML;
  o mapa da TV mostra o que passa em cada zona e tem o botão IA nela.
- **Quiz com cronômetro** (D21, `js/quiz.js`): a IA escreve, a pessoa
  confere; o servidor recusa publicar pergunta não conferida e a TV só
  desenha a conferida. SW em v50.
- **Planos** (D22): o pago de hoje se chama **Essencial** (id `pro`
  mantido); **Pro** (IA integrada, R$ 179) aparece "em breve, ainda não
  disponível" — o checkout recusa até a Fase 3 existir.

**Esperando o dono**: aprovar o lote 1 na bancada (os lotes 2 a 4 saem
depois disso), confirmar o preço do Essencial (R$ 149, anotado pelo
consultor) e decidir o lançamento. **Próximo**: Fase 3 (D23–D29).

## Rodada 5 — o DNA novo, Fase 1 (23/10, PRs #201 a #236)

O dono: "a intenção é a facilidade; tirar coisas que confundam o usuário".
Público: Empresas, Comércio e Saúde num núcleo só (**perfil da conta**); IA
como orquestradora; modelos prontos; lançamento depois desta fase. Dois PCs:
executor (aqui) e testador (issue #198); consultor na #135, que revisou cada
PR sensível depois do merge (as notas viraram PRs próprios).

**Fase 0 — o que estava quebrado** (D0.1–D0.8): chaves e fallback de modelo
do Gemini (`server/motores.js`), assinar plano pedindo CPF/CNPJ e erro claro
do Asaas, custo de IA medido de verdade (`readBody` fora do contexto) e teto
global por dia, crédito reservado antes de gerar e devolvido em qualquer
falha (inclusive ao guardar), gravação da programação com versão (409), TV
que não trava (timers e expediente), LGPD sem sobras.

**Fase 1 — facilidade**
- **Perfil da conta** (D4, `js/perfil.js`): Empresa/Comércio/Saúde muda os
  começos, os exemplos, "loja/empresa/clínica", a amostra de paleta, o que a
  IA ouve e o texto padrão das campanhas.
- **Criar**: dúvida, aviso, peça ou campanha (D5); cartão "O que vou criar"
  só com o combinado; **esboço da TV e cartões de cor antes de gastar** (D13,
  `escopo.cores`); referências de estilo lidas no Criar (D9); aba **Criando**
  com aviso "ficou pronta" em qualquer página (D11, `web/src/lib/trabalhos.js`);
  10 a 12 começos rápidos por perfil (D17).
- **Marca** (D6–D9): logo primeiro, tudo salva sozinho; logo analisada e
  corrigida com antes/depois (vetoriza, tira fundo, versões clara/escura,
  `web/src/lib/logo.js`); SVG sanitizado; a logo vai à TV e às peças (D8);
  site lido com CSS e og:image no acervo; fotos "da marca" em Mídias.
- **Campanhas em pastas** (D10): busca, arquivar, renomear, excluir, sem o
  corte de 20; "pasta" em Meus Designs.
- **Programação** (D14): rascunho — a TV só muda no "Publicar"; conflito
  guarda o rascunho e oferece publicar por cima, dizendo o que some.
- **TV**: rodapé legível (um relógio só, AVISOS, frase até o fim, g/p/j,
  zona vazia com a marca, letreiro editável na campanha — D12); aniversário
  na semana e mural sozinhos (D15, `server/automaticos.js`); 43 modelos-ouro
  com a marca em Peças prontas (D16). SW em v48.

**Esperando o dono**: aprovar a proposta do D15 (#135) e decidir o
lançamento. **Próximo**: Fase 2 (D18–D22).

## Onde paramos — rodadas anteriores

A rodada de 21/10 (PRs #137 a #167) foi a fila do
[`EXECUTOR.md`](EXECUTOR.md), itens 1 a 18: um PR por item, com o consultor
de plantão na issue #135. Do ponto de vista de quem usa:

**Criar e subir**
- **Criar em 4 passos** (`CriarPage.jsx`): uma entrada só, 3 toques do Início
  à TV (#144). Estilo e marca também no editor da peça (#137).
- **Subir foto ou vídeo do celular:** a foto encolhe antes de sair, a TV mostra
  a mídia inteira com o fundo borrado (sem faixa preta), barra de progresso
  (`web/src/lib/subir.js`, #145).
- **Vídeo pesado para o box:** o upload AVISA — HEVC/AV1, acima de Full HD,
  mais de 10 Mbps, mais de 150 MB — e não proíbe (`js/video.js`, #154).
  Converter precisa de ffmpeg no servidor: infra, com o dono.
- **Postar nas redes:** a peça da TV no tamanho de cada rede, com texto
  próprio por canal (`server/redes.js`, `web/src/lib/rasterizar.js`, #147, #149).
- **Paletas prontas na Marca**, e a conta nasce com a paleta do ramo
  (`js/paletas.js`, `server/paleta.js`, #143).

**Painel**
- **Menu novo:** 8 grupos no lugar de 14 entradas, abas dentro do grupo e
  barra de baixo no celular (Início · Telas · Criar · Mídias · Mais). Nada
  sumiu: todo `?ir=` antigo abre a mesma página (`web/src/lib/menu.js`, #159).
- **Primeira peça na TV em menos de 10 minutos:** marca → peça → TV, e cada
  passo diz o próximo (`web/src/lib/jornada.js`, `ProximoPasso.jsx`, #160).
  Cronometrado: 31 s do cadastro à peça na TV, 18 deles esperando o e-mail.
- **Painel como app (PWA):** compartilhar da galeria direto para a TV e
  convite de instalar (#146). O link de confirmação confirma sozinho (#142).

**TV**
- **TV adaptável:** margem contra overscan por tela; a peça-html é desenhada
  em 1080p e escalada, igual em 720p, 1080p e 4K; em pé de primeira classe (#148).
- **Peça idêntica:** a entrada animada da peça é a transição; editor,
  miniatura e TV desenham igual (#152).
- **Expediente:** fora do horário a TV fica preta ou só com o relógio — uma
  regra só para a TV e o vigia (`js/expediente.js`, #150).
- **Ver a tela agora:** a TV manda o estado e o painel desenha; o servidor só
  deixa passar item que está salvo (`server/ver-tela.js`, #151).

**Negócio**
- **Planos e preços** (#153), **landing e página de preços** (#157).
- **Administração:** frota, devedores e crescimento no painel do operador;
  ações do operador e entrar na conta do cliente com sessão marcada e
  registro (`server/admin.js`, `server/suporte.js`, #155, #156).

**Varredura de regressão (item 17):** `npm test` três vezes, sem teste
instável; bancada com as 39 peças × 6 marcas × 3 modos × zonas (6210
combinações), limpa; as 17 páginas do painel a 360 px, nos dois temas; o
player em 720p, 1080p e em pé (nativo e girado na TV Box). Quatro defeitos,
um PR cada: a Equipe com "Visão geral" no topo (#161), as ações da Equipe
fora da tela no celular (#162), datas da TV com "De" maiúsculo (#164) e o
cabeçalho da TV cortando a perna do g e o nome em pé (#167).

### Rodada 2 — Criar conversando (21/10, PRs #163 a #176)

O dono, depois de usar: "faz boas criações, mas sem sal", "nem imagens ele
colocou", "o Criar está confuso", "cria só algumas peças". O propósito, nas
palavras dele: **o cliente decide, a IA dá suporte, sugere, conversa e cria.**
A fila está no [`EXECUTOR.md`](EXECUTOR.md) §2b, e ficou assim:

- **Criar é a conversa** (`CriarPage.jsx`, #172). "O que você quer mostrar
  hoje?", ideias da conta (o guia) e começos de frase. A conversa **não tem
  limite de perguntas** (`server/ai-conversa.js`, #168); a IA sempre propõe
  e diz quando entendeu. O cartão **"O que vou criar"** mostra, por TV e por
  zona, o que vai sair, e se mexe à mão (`CartaoEscopo.jsx`).
- **O escopo** é o contrato entre o chat, o cartão, o gerador e a cobrança
  (`js/escopo.js`, #166): telas × zonas, redes, horários, fotos, os recortes
  ("só principal e lateral", "2 estilos de cabeçalho"…) e o custo.
- **O ecossistema** (`server/ecossistema.js`, #170): o escopo vira
  EXATAMENTE as peças pedidas, no papel de cada zona, com os textos de todas
  numa chamada só, as fotos pela escolha do cliente, os horários como
  `agendamento` do player e as redes. Salva sozinha (tabela `campanhas`).
- **Pôr pra rodar** (`web/src/lib/rodar.js`, #173): cada peça na zona do
  escopo; troca o layout da TV só com o ok; pausar tira só o que é dela.
- **Ajustar depois** (`server/ajuste.js`, #174): "troca a foto da peça 2"
  refaz só aquela peça e cobra só a foto nova. Editar à mão e desfazer.
- **TV:** cabeçalho e rodapé com várias peças girando, contagem regressiva
  (`data-vivo="contagem"`) e chamadas no cabeçalho (#171). Peças-ouro novas,
  em rascunho para o dono aprovar: `rodape-contagem`, `cabecalho-chamadas`
  e `lateral-chamada` (#175).
- **Imagem de verdade** (#165): o Criar mandava `imagens: 'acervo'` fixo, a
  cor da marca não chegava à foto, o compositor jogava fora a foto já paga, e
  sem a chave de imagem um degradê com o prompt escrito ia como foto, cobrado.
- Os quatro passos de antes continuam como **Criação rápida** (Meus Designs ›
  Mais).

Do Início, em 3 toques: uma entrada (o cartão já vem montado) → Gerar → Pôr
pra rodar. **Conferido só no modo demonstração** (sem chave de IA): a
qualidade com IA de verdade — o "sem sal" — ainda precisa ser medida com
campanhas reais (ver "Próximos passos").

**Varredura (item 27):** `npm test` três vezes (1243, sem teste instável);
bancada com 43 peças × 6 marcas × 3 modos × zonas (6498 combinações), limpa;
as 18 páginas do painel (com a Criação rápida) a 360 px, nos dois temas; o
player em 720p, 1080p e em pé, nativo e girado. Um defeito, um PR: a lateral
da reserva era a peça de alerta, com "!", até para promoção (#175).

**Com o dono e o consultor** (decisão ou infra, não código): ffmpeg no
servidor; condições do anual e regra da multa; o serviço web lendo o bucket
de backup; o número do WhatsApp; foto real de TV e autorização para usar a
prova da ótica.

### Rodada 3 — o painel coerente com o Criar (21/10, PRs #177 a #185)

O dono, testando a rodada 2: "está tudo bom, até eu clicar em Conteúdo". A
página da TV, as Mídias e Meus Designs eram de antes do Criar conversando.
A fila está no [`EXECUTOR.md`](EXECUTOR.md) §2c:

- **Um caminho só para criar** (#178): "Criar para esta TV" na página da TV
  leva ao Criar já com a tela; o diálogo antigo de campanha ficou escondido.
- **Campanhas** (#179): a página nova em Criar › Campanhas, com capa,
  estado (no ar, pausada, pronta) e as TVs; abrir mostra o resultado e o
  Pôr pra rodar. A campanha não é mais copiada para Meus Designs.
- **A página da TV** (#180): o desenho da TV, clicável, no lugar das abas
  de zona; cabeçalho e rodapé com a lista de peças, as chamadas, os avisos
  e a contagem (`components/tela/FaixaDaTela.jsx`); as campanhas que estão
  na TV, com abrir e tirar (`CampanhasNaTela.jsx`).
- **Adicionar numa zona** (#181) começa pelas peças prontas que cabem nela
  (`GET /api/campanhas/pecas`), depois fotos e vídeos, depois os tipos;
  "Criar novo com a IA" abre o Criar só para aquela zona.
- **Ajustes da tela** (#182) em abas: Aparência (layout desenhado, marca ou
  tema, aviso do que sai ao trocar), Encaixe, Som, Horário (o mesmo
  formulário da lista de Telas, `HorarioDaTela.jsx`) e Avançado.
- **Mídias por propósito** (#183): Peças prontas (pôr numa ou várias TVs
  na zona certa, redes, campanha), Fotos e vídeos, Músicas, Da IA, Banco.
- **A data comemorativa** (#184) saiu do topo da TV: é a primeira ideia do
  Criar e um atalho no Início.

**Varredura (item 36):** `npm test` três vezes (1250, sem teste instável);
bancada com 6498 combinações, limpa; as 22 páginas do painel a 360 px, nos
dois temas, agora com uma conta que **tem TV** (a ótica); o player em 720p,
1080p e em pé, nativo e girado. Sem defeito novo.

### Rodada 4 — o que o dono achou testando (22/10, PRs #187 a #190)

- **Pediu, gerou** (#187): "pode gerar" no chat começa a geração, sem clique.
- **TV nova recebe a campanha inteira** (#188): parear oferece a campanha no ar,
  com cabeçalho e rodapé, em vez da última peça da biblioteca sozinha.
- **A TV esperando** (#189): zona sem conteúdo fica preta, pulsando. E o
  título "Raft Embalagens" do exemplo, que o normalize gravava em TODA TV de
  cliente, saiu: o cabeçalho mostra o nome da conta.
- **Programação** (#190): aba própria entre Telas e Criar (e na barra do
  celular), com cada TV desenhada. Telas fica com o aparelho.

### Rodada anterior (18/10)

Uma auditoria de ponta a ponta seguida da correção, em ordem, de tudo o que
ela achou (PR #108):

- **TV ligando sem internet** trocava a vitrine pela demonstração em 60s e
  nunca mais reconectava. Consertado e conferido no navegador.
- **Cobrança que vazava:** assinatura não acompanhava as telas, atraso sem
  consequência, estorno ignorado. Consertado (`server/cobranca.js`).
- **Promessas sem código** (relatório, SSO, marca branca) saíram do site.
- **Alerta de queda** respeita horário de funcionamento por tela.
- **Pacotes de crédito avulsos**, **QR no pareamento**, **recarregar TV
  remoto**, **selo "versão gratuita"** depois do teste.
- `no-undef` no CI achou e consertou dois bugs em produção: convite de equipe
  ("erro interno") e troca de senha no SQLite.
- **App Android de quiosque** (`android/`, APK gerado no GitHub Actions),
  **relatório de exibição**, **grupos de telas**, **Ajustes simplificados**,
  **texto em curva e 19 elementos gráficos** no editor.
- **Primeira experiência:** o QR sobrevive ao cadastro, o pareamento termina em
  "Colocar conteúdo agora", tela vazia mostra "Comece por aqui", e texto longo
  encolhe para caber na zona da TV.

### Produção

**Domínios** (mesmo serviço no Railway): `app.multitelas.net.br`
serve a landing em `/` e o painel em `/app`; em `tv.multitelas.net.br` a raiz
já abre o player (igual a `/tv`). O APK aponta para o domínio da TV.

**O que falta para publicar não é código:** é configuração e jurídico —
[`LANCAMENTO.md`](LANCAMENTO.md), com um prompt pronto para o Cowork em
[`PROMPT-COWORK.md`](PROMPT-COWORK.md).

### Decisões que ficaram com o dono

- ~~`/legacy`~~ — decidido e feito: o painel antigo saiu, o endereço
  redireciona para `/app`.
- ~~App Android~~ — feito (`android/`). Falta rodar num box de verdade.

### TV Box: como fica plug and play

O player já é web e o pareamento já existe, então o aparelho só precisa ser um
navegador que abre `/tv` e não sai dali. O que já está pronto do lado do
servidor e do player:

- pareamento por **código ou QR** (a pessoa aponta o celular e cai no painel
  com o código preenchido);
- **ligar sem internet** mantém a última programação e reconecta sozinho —
  importante porque depois de queda de energia o box liga antes do roteador;
- **recarregar remoto** pelo painel e o **pulso conta aparelho e resolução**
  (`window.MTApp.versao`, se o app existir, aparece no cartão da tela);
- a pairing screen cabe em **1280×720**, a resolução de boa parte dos boxes.

O **app Android** (`android/`, WebView em tela cheia) abre no boot, mantém a
tela acesa, reabre se travar, guarda a identidade da tela no armazenamento do
app e expõe `window.MTApp = { versao }`. O APK sai do workflow **App Android**
(variável `MT_URL` no GitHub). **Nunca rodou num box de verdade** — o primeiro
teste é tirar da tomada e ver voltar. Comercialmente: kit com um modelo
homologado (Xiaomi TV Box S). Comodato de hardware, não (ver
`ANALISE-PIXMIDIA.md`).

### Trabalho em paralelo

- **Executor e consultor:** a fila e as regras que não podem regredir moram
  no [`EXECUTOR.md`](EXECUTOR.md) (seção 1b); o canal é a issue #135
  (`[executor]` pergunta, `[consultor]` responde e testa no ar). Infra
  (Railway, variáveis, bucket, ffmpeg) é com o consultor.
- **Prints de PR** vão para a branch órfã `prints` e entram no PR como
  `https://github.com/Thiagoolivs/Multi-telas/blob/prints/<caminho>?raw=true`.
- Outro agente mexendo aqui ao mesmo tempo:
  [`TAREFAS-ANTIGRAVITY.md`](TAREFAS-ANTIGRAVITY.md).

## Como o sistema está montado

```
TV (player)                    Painel (React)              Servidor (Node)
─────────────                  ──────────────              ───────────────
player.html                    web/src/pages/*             server.js  (rotas)
 js/player.js  playlist        MyDesignsPage   campanhas   server/ai-director.js
 js/render.js  desenha item    ContentEditor   telas       server/composer.js
 js/animacao.js  entradas      BrandPage       identidade  server/design-system.js
 js/theme.js   cores           PlatformPage    operação    server/db-*.js
 js/cloud.js   SSE + passe     SettingsPage    conta       server/storage.js (R2)
 offline-first (SW)            build → /app                server/site.js (SSRF)
                                                           server/log.js   linhas
                                                           server/erros.js grupos

 fonts/  as 14 famílias (OFL), servidas por nós — ver tools/baixar-fontes.mjs
```

O player é vanilla e funciona sem rede: guarda a última configuração e continua
exibindo. Isso não é detalhe — é o que separa signage de site.

**O que entrou nesta rodada, por lugar:**

| Onde | Arquivo | O que faz |
|---|---|---|
| TV e servidor | `js/expediente.js` | horário da loja: a TV apaga e o vigia não acusa queda |
| TV e painel | `js/video.js` | o vídeo aguenta o box? (lido nos bytes, avisa no upload) |
| painel e operador | `js/aparelho.js` | "1920×1080 · Android", do último pulso da TV |
| painel e servidor | `js/paletas.js` | as paletas sugeridas; a conta nasce com a do ramo (`server/paleta.js`) |
| chat e gerador | `js/escopo.js` | o que vai ser criado, para onde e como (rodada 2) |
| servidor | `server/ai-conversa.js` · `server/routes/conversas.js` | a conversa do Criar, sem limite de perguntas; tabela `conversas` |
| servidor | `server/ecossistema.js` · `server/routes/campanhas.js` | o escopo vira as peças de cada TV e zona; tabela `campanhas` |
| servidor | `server/ajuste.js` | ajustar depois: só o que mudou é refeito; desfazer um passo |
| servidor | `fotoDaConta` · `marcaDaConta` (em `server.js`) | a foto da campanha (saldo, gera, guarda, cobra) e a marca, uma função só |
| painel | `web/src/components/criar/*` · `web/src/lib/rodar.js` | o cartão do escopo, o resultado, Pôr pra rodar |
| servidor | `server/ver-tela.js` | confere o estado que a TV mandou contra a programação salva |
| servidor | `server/redes.js` | o texto de cada rede, um pedido por canal |
| servidor | `server/admin.js` · `server/suporte.js` | o negócio no painel do operador · entrar na conta do cliente com registro |
| painel | `web/src/lib/menu.js` | os 8 grupos; `?ir=` aceita página ou grupo, lista fechada |
| painel | `web/src/lib/jornada.js` | onde a conta está (marca → peça → TV), DEDUZIDO do estado real |
| painel | `web/src/lib/subir.js` · `publicar.js` · `rasterizar.js` | foto/vídeo antes de subir · publicar em telas, um caminho só · a peça vira imagem para as redes |

**Módulos UMD (fonte única):** `js/cor.js`, `js/seasons.js`, `js/animacao.js`,
`js/paletas.js`, `js/expediente.js`, `js/video.js`, `js/aparelho.js`,
`js/escopo.js`. Cada um funciona como global de navegador, `require()` no
Node e `import` no Vite. O lado ESM importa por efeito colateral e **reexporta `globalThis.MTx`** —
nunca uma cópia. Quebrar isso ressuscita a classe de bug que o `js/cor.js`
existe para matar.

**Armadilhas que já custaram caro** (cada uma virou comentário no código):

- `cqw` é % da **largura** da peça. `x`/`w` são % da largura; `y`/`h` são % da
  altura. Misturar os dois é o bug mais recorrente do editor.
- CSP tem `script-src 'self'`, sem `unsafe-inline`: script embutido no HTML
  simplesmente não roda, e não avisa.
- `res.writeHead(status, headers)` **não** sobrepõe o que já foi posto com
  `res.setHeader()`. Uma correção de cabeçalho feita no `writeHead` vira
  decoração silenciosa.
- A config do dispositivo é `{ settings: { layoutId }, zonas: { principal: {
  items: [] } } }` — não `layout`/`zones`.
- **Família nova no catálogo pede `node tools/baixar-fontes.mjs`.** Sem isso a
  fonte não existe no domínio, a CSP recusa buscá-la fora, e o texto sai na
  fonte de sistema — mais larga que a medida. `test/fontes-proprias.test.js`
  falha antes disso chegar à parede de alguém.

Armadilhas novas desta rodada:

- **Mexeu em `player.html`, `js/` ou `css/` do player? Suba o `SHELL_CACHE`**
  em `sw.js` (hoje `mt-shell-v41`). A TV serve o shell do cache; sem a versão
  nova ela continua com o arquivo velho e ninguém vê a correção na parede.
- **Banco no SQLite e mídia são variáveis diferentes.** `DATA_DIR` aponta o
  banco; `MEDIA_DIR` (ou `RAILWAY_VOLUME_MOUNT_PATH`) aponta `media/`. Um
  segundo servidor local com só `DATA_DIR` acha as contas e mostra as
  miniaturas quebradas.
- **`const` com o nome do parâmetro dentro de um `try`** cai na zona morta
  (TDZ): a primeira linha que lê o parâmetro estoura, o `catch` engole, e a
  função "não faz nada" sem erro nenhum. Foi assim que o clima sumiu do
  cabeçalho numa versão da #167 — o teste agora roda a função de verdade.
- **`text-transform: capitalize` em data em português** põe maiúscula em toda
  palavra ("21 De Outubro"). Data sobe só a primeira letra (`::first-letter`).
- **`line-height: 1` com `overflow: hidden` corta a perna do g, p e j.** Em
  texto de uma linha com reticências, use 1.2 ou mais.
- **`cn()` só junta classes, não resolve conflito do Tailwind.** Entre
  `whitespace-nowrap` e `whitespace-normal`, quem ganha é a ordem no CSS
  gerado, não a ordem no `className`. Para mudar no celular, use o variante
  (`max-sm:whitespace-normal`), que vem depois.
- **Layout deitado numa TV em pé fica espremido** — de propósito o painel só
  oferece layouts verticais quando a TV está em pé (`SettingsForm.jsx`, por
  `orientation`). Para conferir em pé, use `portrait-*`, não o `dashboard`.
- **Para dirigir uma TV de teste sem parear:** grave `mt.cloudDeviceId` e
  `mt.cloudDeviceToken` no `localStorage` antes de abrir `/tv` (no puppeteer,
  `evaluateOnNewDocument`). Abrir `/tv` sem identidade pede pareamento novo.
- **No navegador sem tela (headless), `MediaRecorder` grava 0 byte.** Teste
  de vídeo usa arquivo sintético; e rolagem nos scripts de print é
  `behavior: 'instant'`, senão a foto sai no meio do caminho.

Armadilhas da rodada 2:

- **Campo novo de zona some no caminho até a TV** se não entrar no
  `normalize` de `js/storage.js`, que refaz a zona campo a campo. A lista
  que gira e a contagem entram por `vivosDaFaixa`; a porta do servidor
  (`conferirConfig`) confere cada peça da lista.
- **Peça-ouro de reserva tem de ser preenchível INTEIRA.** Campo que sobra
  mostra o texto de exemplo de outro negócio ("Ótica Central") na TV da
  padaria. `compositor.preencherPapel` só usa peças cujos campos ele tem.
- **O print de página inteira do painel corta**: quem rola é o `<main>`, não a
  página. Nos scripts, a janela cresce até o fim do conteúdo antes do print.
- **Teste de rota de ponta a ponta:** servidor de verdade com `DATA_DIR`
  temporário e `AI_PROVIDER=dev` (ver `test/ecossistema.test.js`), para não
  sujar o banco local nem depender de chave.
- **Arquivos com CRLF:** editar por script lendo e devolvendo `\r\n` (aqui
  não tem Python). E `npm run lint:nomes` com aspas simples falha no npm do
  Windows: rode o `npx eslint@8 …` direto, com os globs sem aspas.

## A tese do motor de IA

**O modelo dirige; o código garante que dê para ler.**

A IA decide quantas peças, o que cada uma diz, qual direção de arte e se precisa
de foto. Nada disso chega à tela sem passar por `server/composer.js`, que corrige
contraste, área segura, sobreposição e texto que não cabe. Uma peça bonita e
ilegível é uma peça errada, e modelo nenhum garante legibilidade sozinho.

O pipeline hoje: **briefing → plano → imagens → composição → crítica**. A crítica
devolve ao modelo o que o validador precisou consertar e refaz a peça, mas só
onde houve problema, e só substitui se a nova versão tiver *menos* conserto.

Roda como trabalho em segundo plano (`server/jobs.js`) porque leva minutos.

## O que já funciona bem

- **Identidade que atravessa o sistema.** Cores, fontes, logo e fotos cadastradas
  em Marca valem na geração de peça **e** no tema da TV. Precedência clara:
  pedido > marca salva > escolha do modelo. Agora são **até 3 marcas por conta**,
  com troca da marca ativa; o resto do sistema continua perguntando pela "marca"
  no singular e recebe a ativa.
- **O site do cliente como referência de estilo.** Cola-se o endereço e saem
  cores (por frequência, descartando preto/branco/cinza), fontes e a imagem que o
  site publica como sua cara. O resumo entra no prompt **marcado como material de
  referência** e fica visível na tela — resumo escondido que vai para o prompt é
  como a IA erra sem ninguém saber por quê.
- **O acervo do cliente vence a foto inventada.** O diretor escolhe entre as
  fotos da empresa antes de gerar — mais barato e mais verdadeiro.
- **Legibilidade medida, não estimada.** Contraste calculado em todo lugar: peça,
  tema derivado da marca, rodapé colorido. A matemática mora em `js/cor.js`,
  uma vez só.
- **Editor de peça** com redimensionamento que funciona, pincel de formatação,
  Alt+arrastar para duplicar, réguas, modelos de partida e IA guiada (o pedido
  pergunta o quê, onde, de que cor e de que tipo — texto, forma ou ícone).
- **Elementos que entram animados**, estilo mídia indoor: 8 entradas, 4
  movimentos contínuos, duração e espera por elemento, e um botão que escalona a
  peça inteira. Só `transform` e `opacity` — há teste percorrendo todas as
  keyframes recusando qualquer propriedade que force layout, porque numa TV de
  R$ 900 é a diferença entre fluido e travando.
- **Painel da plataforma**, separado do painel do cliente: telas vivas, contas,
  tempo de uso, funções mais usadas, reclamações. Porta única no topo, raiz de
  confiança em `ADMIN_EMAILS`, e responde **404** a quem não pode — 403
  confirmaria que a pessoa achou o endereço certo.
- **Publicar campanha inteira** em várias telas, filtrando por formato.
- **LGPD** com aceite versionado, exportar e excluir de verdade — inclusive as
  fotos do mural, que são dado pessoal de terceiros.
- **Música de fundo por tela**, com controle remoto ao vivo (SSE) e vídeo que
  abaixa a trilha em vez de brigar com ela.
- **Mural de fotos por QR**: o público manda foto pelo celular (câmera **ou**
  galeria) e ela entra na TV em segundos, com botão de pânico que limpa a tela e
  fecha o mural num clique. O QR é desenhado pelo próprio servidor, sem serviço
  externo.
- **Player robusto**: offline, pré-carga da próxima mídia, fallback quando a IA
  ou o feed caem. Painel e player são **instaláveis** (PWA).
- **Onboarding** (`PrimeirosPassos.jsx`): quem cria conta não cai mais num painel
  vazio.
- **A tipografia é nossa.** As 14 famílias (todas OFL) moram em `fonts/`, com a
  licença de cada uma junto. Enquanto vinham da Google, a fonte que a TV
  desenhava dependia da rede do cliente — e quando não chegava, o navegador
  caía na fonte de sistema, mais larga, estourando o texto que o compositor
  tinha medido. Sem erro, sem log, só na parede. A CSP fechou os dois hosts
  externos para que um retorno acidental falhe no primeiro teste.
- **Dá para ver o que quebrou.** Log estruturado (`server/log.js`) sem dado
  pessoal nem segredo, e erros agrupados por assinatura (`server/erros.js`)
  visíveis no painel da plataforma. Antes disso o servidor falava por
  `console.warn(e.message)` em quinze lugares: sem pilha, sem contexto, e uma
  promessa rejeitada derrubava o processo levando o motivo junto.

## Segurança: o que está fechado

Auditoria ponta a ponta feita em três rodadas (PRs #95, #97, #98):

- **SSE sem segredo eterno na URL.** `EventSource` é a única API do navegador que
  não deixa mandar cabeçalho, então o token da TV ia em `/events?dt=` — e URL vai
  parar em log de acesso, log de proxy e painel do provedor. Hoje a TV troca o
  token (num POST, com cabeçalho) por um **passe de 1 minuto, uso único, preso
  àquela tela**. `?dt=` deixou de ser aceito.
- **SVG servido isolado**: `sandbox` + `default-src 'none'` + `attachment`,
  presos ao arquivo em vez de depender só do CSP global.
- **SSRF por construção** em `server/site.js`, porque o endereço é escolhido pelo
  usuário: allowlist de esquema, faixas internas bloqueadas (incluindo
  **169.254**, metadados da nuvem), **conexão fixada no IP já conferido** (`fetch`
  resolveria o nome de novo — essa janela é o DNS rebinding inteiro), redirect
  seguido à mão com no máximo 3 saltos e re-checagem em cada um, tetos de tempo,
  tamanho e chamadas por hora.
- **Cobrança como porta**: teste de 14 dias com uma tela; depois, a tela
  segue com selo e ligar tela nova pede assinatura. Webhook do Asaas com token
  comparado em tempo constante; pacotes creditados uma vez por pagamento.

## Onde a facilidade ainda escapa

Avaliação franca, com números do próprio código:

1. ~~Ajustes da tela com 16 controles~~ — o essencial fica à vista, o resto
   em "Mais ajustes", com a contagem do que foi mudado.

2. ~~99 tipos de conteúdo no catálogo~~ — "Adicionar conteúdo" agora pergunta
   antes ("O que você quer mostrar?", 6 entradas grandes); a grade inteira
   ficou em "Mais tipos", com busca (#159).

3. **`server.js` voltou a crescer: ~2.500 linhas.** Auth, equipe, cobrança,
   telas e redes estão em `server/routes/`; IA, marca, mural e plataforma
   continuam lá. O `npm run lint:nomes` no CI é o que torna a extração segura.

4. ~~Editor sem texto em curva e elementos gráficos~~ — entraram (`js/graficos.js`,
   `arcoTexto` em `js/peca.js`); editor, TV, miniatura e PNG desenham igual.

5. ~~O Criar decide demais pelo cliente~~ — virou a conversa, com o cartão
   do escopo e a campanha inteira da TV (rodada 2, no topo). O que falta
   saber é se, com IA de verdade, as peças deixaram de ser "sem sal": isso
   só se mede gerando campanhas reais.

## Próximos passos

**Antes de tudo: publicar** ([`LANCAMENTO.md`](LANCAMENTO.md)).

Depois, em ordem de impacto:

1. **Medir a rodada 2 com IA de verdade.** Com a chave de imagem no ar
   (`GEMINI_API_KEY`, pergunta ao consultor), gerar 10 campanhas de
   segmentos diferentes pelo chat e conferir uma a uma: foto em todo
   destaque, nada de "sem sal", o cartão acompanhando a conversa, e o
   extrato cobrando só o que foi gerado. O dono aprova as peças-ouro novas
   na bancada.
2. **Testar o APK num box de verdade** (boot, tela acesa, sobreposição) — é
   o que falta na matriz de teste da TV (PLANO §7.1).
3. **ffmpeg no servidor** para normalizar vídeo; a régua de quem converter
   já existe (`js/video.js`).
4. **Recorte inteligente** da foto do acervo e **coerência entre peças**.
5. **SSE, limites e comandos em Redis** para rodar mais de uma instância.

O que entrou na rodada de 21/10 está em "Onde paramos", no topo.

## Convenções

- Comentários explicam **por quê**, não o quê. Preferência por registrar a
  decisão e o erro que ela evita.
- Sem framework no servidor e sem dependência pesada; `node:sqlite` em dev,
  Postgres em produção, mesma API assíncrona nos dois.
- Testes em `npm test` (**1193 hoje**). `npm run lint:nomes` pega nome indefinido no servidor. Dois padrões que se
  provaram:
  - **Renderizar e olhar.** Screenshot pegou bugs que teste nenhum pegou —
    componente desmontado, texto estourando, botão que não fazia nada, cabeçalho
    que não mudava.
  - **Conferir o teste ao contrário.** Reintroduzir o defeito e exigir que o
    teste falhe. Nas últimas rodadas isso revelou **nove testes meus que estavam
    errados** — entre eles um regex de keyframes que via 2 de 15 blocos e tornava
    quase vazias as duas regras principais da animação, e dois do coletor de
    erros que passavam com o teto de grupos desligado. O segundo desses, ao ser
    consertado, descobriu um buraco real: `origem()` filtrava `node:internal` e
    deixava passar `node:fs`.
