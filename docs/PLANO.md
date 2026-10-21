# Plano — MultiTelas, de produto bom a produto premium

Documento de partida para a próxima rodada de trabalho. Consolida o roadmap
de 17/10, o dossiê da Pix Mídia (`ANALISE-PIXMIDIA.md`) e as decisões do dono
tomadas em 18–19/10/2026. **Quando este plano contradiz outro documento, vale
este** — a lista do que ele substitui está no fim.

Atualizado em: **19/10/2026** · 4 telas no ar (2 clientes) · meta: **100 telas
até o meio de 2027**.

---

## 1 · A tese em uma página

O MultiTelas tem as funcionalidades certas e faz coisa feia. O cliente não
compra software de TV: compra **uma vitrine que parece de agência, sem
agência**. Tudo neste plano serve a duas coisas, nesta ordem:

1. **Gerar conteúdo bonito com IA** — é a alma do negócio e hoje é o ponto
   mais fraco. Se a primeira peça que o cliente gera não impressiona, nada
   mais importa.
2. **Exibir esse conteúdo sem falhar**, em qualquer TV, de qualquer tamanho,
   ligada 24 horas.

O resto (painel, administração, landing, identidade) existe para que essas
duas coisas sejam fáceis de usar, de vender e de operar em escala.

**A régua é premium.** Não "funciona": parece caro. Toda entrega desta rodada
é julgada pelo olho antes do teste — renderizar e olhar, sempre.

**Posicionamento** (do dossiê): a Pix Mídia digitalizou o mural do RH; nós
digitalizamos a vitrine. Eles têm 500 conteúdos prontos; nós geramos o 501º,
com a marca do cliente, sobre o que está acontecendo hoje na loja dele.
Começamos pelo varejo e pela PME (tela virada para o cliente final) e
evoluímos depois para comunicação interna, consultórios e fila de
atendimento — a arquitetura desta rodada já deixa essa porta aberta (§9).

---

## 2 · Decisões tomadas

| Tema | Decisão | Observação |
|---|---|---|
| Motor de conteúdo | **A IA gera HTML + CSS**, com trilhos (§4) | Substitui a regra "layout determinístico, não generativo" de `CAMPANHA-SCHEMA.md` |
| Tela da TV | **Adaptável**, não palco fixo escalado | Container queries; uma peça serve 16:9, 9:16 e o que vier |
| Edição | Arrastar e redimensionar **onde o HTML permitir**; o editor atual continua; importar do Canva | §4.5 |
| Hardware | **Comodato/locação do player**, com instalação nossa na Grande SP | Clientes de 1–2 telas se instalam sozinhos |
| Entrada | **Teste de 14 dias** com hardware próprio (PC, notebook, TV, box) | Projeto grande: demonstração + degustação de 7 dias (§6.4) |
| Fidelidade | Contrato anual com multa que **cobre os custos** do cancelamento | §6.3 |
| Teto de IA | **R$ 30 a 35 por conta/mês** no máximo, sem comer a margem | §6.5 |
| Funcionalidades | **Manter quase todas, realocar.** Fazer o principal extremamente bem | §5 |
| Identidade visual | A IA constrói, o dono aprova. Subir a régua. **Não é prioridade agora** | Fase 5 |
| Público | Varejo/PME primeiro; depois interno, consultório, fila | §9 |
| Operação | Dono instala e dá suporte; ZL, ZS, ZO, ZN e Centro de SP; sem interior por ora | WhatsApp provisório, depois número dedicado com atendimento 24h e parceiros |
| Ordem | **Peças-ouro primeiro**, depois a Fase 0 | Decidido em 19/10. A bancada não muda o que a TV exibe hoje (§3) |
| Tela completa | Peças-ouro para **cabeçalho, destaque, lateral e rodapé**, com papel definido para cada zona | §4.7 |
| Refinamento | **Chat antes de gerar**: conversar é barato, gerar é caro. Gosto se mostra, não se pergunta | §4.12 |
| Animação | JavaScript **só no player** (GSAP já carregado); a peça declara a animação, nunca executa código | §4.13 |
| Foto | A IA decide quando e qual foto; o cliente **autoriza antes**. Produto do cliente é gerado a partir da foto real dele | §4.11 |
| Modelos no experimento | Gemini (atual), `claude-sonnet-5-5` e `claude-opus-5-5` | §4.4 |

---

## 3 · Ordem das fases

Cada fase destrava a seguinte. Entre parênteses, a estimativa de calendário
trabalhando com PRs pequenos.

| Fase | O quê | Por que nesta ordem |
|---|---|---|
| **0** | Proteção da base (1–2 dias) | Nada de mexer em produção sem backup e sem poder congelar a ótica |
| **1** | **Conteúdo com IA em HTML** (experimento 1 semana; motor 2–3 semanas) | É a alma do negócio e o maior problema. Não depende da identidade do MultiTelas: a peça usa a marca *do cliente* |
| **2** | Painel reorganizado (2 semanas) | Com o motor novo pronto, o painel se organiza em volta dele |
| **3** | TV adaptável e operação 24/7 (2 semanas, parte em paralelo) | O motor novo já nasce adaptável; aqui o resto do player acompanha |
| **4** | Painel de administração (1–2 semanas, depois contínuo) | Antes de passar de ~15 telas, senão vira suporte o dia inteiro |
| **5** | Identidade visual, landing e página de preços (2 semanas) | Vende o que já existe, com foto real da TV instalada |

Em paralelo, sem código: contratos, CNPJ no Asaas, contador e homologação de
aparelho (§8).

**Exceção de ordem (19/10):** a Fase 1 começa pela biblioteca-ouro, antes da
Fase 0. As peças-ouro nascem numa bancada e o tipo `peca-html` não é usado
por nenhuma tela até lá, então nada do que a TV exibe hoje muda. A Fase 0
precisa estar pronta **antes de a primeira peça-html chegar a uma tela de
cliente** — esse é o portão, não o calendário.

---

## 4 · Fase 1 — A alma: conteúdo com IA em HTML

### 4.1 Por que o resultado hoje é feio

O pipeline atual (`server/ai-director.js`: briefing → plano → imagens →
composição → crítica) é bom na **copy** e ruim no **layout**. Na etapa de
composição a IA posiciona elementos por coordenadas (`x`, `y`, `w`, `h` em %)
**sem ver o resultado**, e `server/composer.js` conserta contraste e
sobreposição depois. É desenhar de olhos fechados e pedir para alguém
consertar. O `tools/eval.mjs` mede se a peça *passa no validador*, não se é
bonita — 10 de 10 casos "sem falha" convivendo com peças feias prova isso.

O briefing, o plano de campanha, a leitura do site, as marcas, o acervo, os
créditos e a medição de custo (`server/uso-ia.js`) **ficam**. O que muda é a
etapa de composição e a forma de avaliar.

### 4.2 O motor novo

```
pedido do cliente
  → briefing e plano (já existem)
  → COMPOR: a IA escreve HTML + CSS da peça, imitando a biblioteca-ouro
  → LINT: regras duras, no servidor (rejeita e pede de novo)
  → RENDERIZAR: navegador sem tela tira print em 16:9, 9:16 e 1280×720
  → CRITICAR: um modelo com visão olha os prints e corrige
  → 3 opções para o cliente escolher
```

**Os trilhos — o que a IA pode e não pode escrever:**

| Regra | Por quê |
|---|---|
| Sem JavaScript, sem `<script>`, sem `on*=` | Segurança e CSP (`script-src 'self'` já recusa) |
| Nenhuma URL externa; imagem só por id de asset nosso | A TV pode estar offline; nada de rastreio |
| Cor **só** por token (`var(--mt-fundo)`…), nunca hex solto | Trocar o tema muda a peça sem gerar de novo (§4.3) |
| Medida **só** relativa ao container (`cqw`, `cqh`, `cqmin`, `%`, `fr`) | É o que torna a peça adaptável |
| Fontes só do catálogo próprio (`js/fontes.js`, `fonts/`) | Fonte que não carrega estoura o texto na parede |
| Animação só pelas classes da nossa biblioteca (`js/animacao.js`) | Só `transform` e `opacity` — fluido num box de 2 GB |
| Proibido: `filter`, `backdrop-filter`, `mix-blend-mode`, sombras enormes | Custam GPU que o box barato não tem |
| No máximo ~150 elementos por peça, 1 vídeo | Orçamento de memória do WebView |
| Texto editável marcado com `data-campo="titulo"` etc.; foto com `data-campo-img` | O cliente edita sem ver código (§4.5) |
| Cada bloco principal é uma **camada** posicionada por variáveis (`--x --y --w --h`) | É o que permite arrastar e redimensionar |
| Formatos por `@container` (paisagem, retrato, quadrado) | Uma peça, todas as telas |

**A biblioteca-ouro.** A qualidade de uma IA que imita é o teto do que ela
imita. Antes do motor, criamos **39 peças de referência em HTML** — 30 de
conteúdo nas 6 famílias do roadmap (oferta, institucional, serviço,
cardápio, social e gente), 5 cabeçalhos e 4 rodapés — no padrão premium
(§4.8). A IA as constrói e o dono aprova uma a uma. Elas
são os exemplos no prompt e também os modelos que o cliente preenche à mão
quando não quer IA. É o ativo mais importante desta fase.

**Renderizar e olhar no servidor.** O print das três proporções usa um
navegador sem tela (Chromium via Playwright). É pesado, então nasce como
**serviço separado no Railway** ("render"), chamado por fila — o servidor web
continua leve e o render escala sozinho quando crescer (§9). O mesmo serviço
gera depois o PNG da peça para redes sociais e a miniatura do painel.

**O modelo de IA.** A qualidade do HTML depende muito do modelo. O
experimento compara o Gemini atual com os modelos Claude mais recentes
(`claude-sonnet-5-5` como padrão de custo e qualidade, `claude-opus-5-5`
como teto), medindo nota e custo por criação. Pode haver um modelo para
compor e outro, mais barato, para conversar e fazer o briefing.

O `server/ai.js` é agnóstico de provedor, mas **não aguenta o motor novo
como está** (lido em 19/10):

- `callLLM` usa **um provedor para tudo**, escolhido por variável de
  ambiente. O experimento precisa escolher o modelo **por chamada**.
- O Claude está em `claude-3-5-sonnet-latest` com `max_tokens: 700`. Uma
  peça em HTML não cabe nisso.
- Visão existe só para o Gemini (`geminiVision`). A crítica visual precisa
  dela nos três modelos.
- O custo do texto é **estimado fixo** (`CUSTO_TEXTO_CENTAVOS = 5` em
  `server/creditos.js`), não medido. O experimento precisa dos tokens de
  verdade de cada chamada, gravados em `uso_ia`.
- Não há cache de prompt. Com a biblioteca-ouro no prompt de toda chamada,
  o cache é o que impede o exemplo de virar o maior custo da criação.

Isso vira um PR próprio antes do experimento (§4.14).

### 4.3 Sistema de cores v2 — tema que faz sentido

Hoje há duas fontes de cor (`js/theme.js` para a TV, `buildPalette` em
`server/design-system.js` para a peça) e a peça carrega hex soltos. Resultado:
mudar o tema não muda a peça, e combinações erradas passam.

Proposta: **um conjunto pequeno de cores com função**, gerado da cor da marca
em OKLCH, com contraste garantido por cálculo (`js/cor.js` continua sendo a
única matemática de cor):

| Token | Função |
|---|---|
| `--mt-fundo`, `--mt-fundo-2` | Fundo da peça e variação |
| `--mt-fundo-0` | O fundo com transparência zero — o fim do véu sobre a foto |
| `--mt-superficie` | Cartão, faixa, caixa sobre o fundo |
| `--mt-texto`, `--mt-texto-suave` | Texto principal e secundário |
| `--mt-destaque`, `--mt-sobre-destaque` | Cor de ação e o texto que vai em cima dela |
| `--mt-preco` | Preço e desconto (pode ser igual ao destaque) |
| `--mt-linha` | Filete e divisor — decoração, nunca texto |
| `--mt-fonte-titulo`, `--mt-fonte-texto`, `--mt-raio` | Tipografia e cantos |

Três **modos** derivados de cada marca: **claro**, **escuro** e **marca**
(chapado na cor da marca, efeito cartaz). Cada modo passa por teste de
contraste AA em todas as combinações antes de existir.

Um quarto modo, **rascunho**, troca tudo por cinzas neutros e a foto por uma
silhueta. É o **wireframe** que o cliente aprova antes de gerar (§4.10): a
mesma peça, com o texto real, sem custo nenhum — porque wireframe aqui não
é outra peça, é outro jogo de tokens. A TV, a peça, a
miniatura e o editor leem **os mesmos tokens** — trocar de modo ou de marca
reestiliza tudo, coerente.

**Paletas sugeridas (21/10, item 2 do EXECUTOR).** O dono: "se deixar ao
gosto do cliente fica feio para quem tem mau gosto". A Marca mostra 3 ou 4
paletas prontas, desenhadas numa peça-ouro, e aplicar é um toque. A cor da
empresa (digitada, do logo ou do site) vira a BASE: o sistema mantém a
matiz e acerta luminosidade e saturação. Cor livre fica em "avançado", com
aviso. Conta nova nasce com a paleta do ramo (`server/paleta.js`). Tudo em
`js/paletas.js`, sem chamar modelo: é gosto codificado mais conta de
contraste — de graça, na hora e com a IA fora do ar. Toda paleta passa no
contrato de `js/tokens.js` nos estilos claro, escuro e marca.

### 4.4 O experimento (primeira semana)

Antes de reescrever, provar. O experimento roda **depois** da
biblioteca-ouro (§4.14): ela é o exemplo que o motor HTML imita.

1. Os **20 pedidos** abaixo. Os 10 primeiros são os casos de
   `tools/eval.mjs`, mantidos para dar continuidade; todas as empresas são
   fictícias.
2. Gerar cada um por **4 motores**: o atual (Gemini posicionando por
   coordenadas), HTML + Gemini, HTML + `claude-sonnet-5-5` e HTML +
   `claude-opus-5-5`. Uma peça por pedido, em 16:9 e 9:16. Os casos 3, 11, 15
   e 19 rodam também como **tela completa** (§4.7).
3. **A mesma foto vai para todos os motores** — gerada uma vez e reaproveitada.
   A nota mede o layout, não a sorte da imagem.
4. O dono dá nota de **1 a 5 às cegas**, numa página com as peças embaralhadas;
   a chave de qual motor fez cada uma só abre no fim. São 80 peças.
5. Medir também: custo por criação (tokens reais), tempo, quantas passaram no
   lint de primeira e se rodam lisas no box da ótica.

| # | Empresa (fictícia) | Pedido, como chega | Família | Foto |
|---|---|---|---|---|
| 1 | Padaria do Bairro | promoção de café da manhã, pão na chapa e café por 9 reais | oferta | gerar |
| 2 | Padaria do Bairro | fechado no feriado de quinta | serviço | nenhuma |
| 3 | Ótica Central | óculos de sol com 30% de desconto até sábado | oferta | gerar |
| 4 | Ótica Central | consulta de vista grátis para quem comprar armação | serviço | acervo |
| 5 | Metalúrgica Sul | feliz aniversário, João | gente | nenhuma |
| 6 | Padaria do Bairro | estamos contratando atendente de balcão | gente | gerar |
| 7 | Supermercado Ponto | cuidado, piso molhado | serviço (alerta) | nenhuma |
| 8 | Metalúrgica Sul | uso de EPI obrigatório nesta área | serviço (alerta) | nenhuma |
| 9 | Padaria do Bairro | novidade no cardápio (sem mais nada) | cardápio | — |
| 10 | Ótica Central | venha conhecer nossa linha completa de armações importadas com garantia estendida de dois anos | institucional | gerar |
| 11 | Studio Bella | escova + hidratação por 79 reais de terça a quinta | oferta | gerar |
| 12 | Studio Bella | siga a gente no Instagram @studiobella | social | acervo |
| 13 | Clínica Vida | vacina da gripe disponível, sem agendamento | serviço | nenhuma |
| 14 | Sorriso Odonto | clareamento em até 10x sem juros | oferta | gerar |
| 15 | Lanchonete da Praça | cardápio do almoço: PF 22, executivo 28, marmitex 18, suco 7 | cardápio | nenhuma |
| 16 | Pet Feliz | banho e tosa: leve 4 pague 3 | oferta | gerar |
| 17 | Ótica Central | Black Friday: até 40% em armações | oferta | acervo |
| 18 | Ótica Central | há 25 anos cuidando da sua visão | institucional | acervo |
| 19 | Escritório Lima | reunião geral sexta às 17h no refeitório | gente | nenhuma |
| 20 | Clínica Vida | a partir de novembro o sábado será das 8h às 12h, e exame de sangue pede jejum de 8 horas | serviço (texto longo) | nenhuma |

**Critério para o HTML virar o motor:** média ≥ 4, pelo menos 1 ponto acima
do atual, custo médio por criação ≤ R$ 1,00 sem imagem gerada, e nenhuma
peça travando no box. O conjunto de 20 vira o **banco de avaliação visual**
permanente: roda a cada mudança de prompt ou de modelo, e a nota não pode
cair.

**Resultado (20/10) — o motor é HTML + Gemini.** Rodaram 2 dos 4 motores: não
havia chave do Claude, e o resultado não pediu mais. Notas do dono às cegas:

| Motor | Nota da peça | Nota da tela | Custo médio | Tempo médio | Passou de primeira |
|---|---|---|---|---|---|
| Atual (coordenadas) | 1,40 | 1,0 | R$ 0,080 | 27,5 s | 100% |
| **HTML + Gemini** | **4,65** | **5,0** | **R$ 0,065** | **8,8 s** | 100% |

Passa nos três critérios medidos (média ≥ 4; 3,25 pontos acima; R$ 0,065 ≤
R$ 1,00). O quarto, "nada travando no box", se confere no box de teste. O
Claude fica como opção, se a nota cair num modelo novo do Gemini.

Ressalva: nos 7 pedidos com foto gerada entrou um marcador cinza no lugar da
foto, igual para os dois motores (defeito do rodador, já corrigido). A nota
mede o layout; as fotos entram na próxima rodada do banco.

O que o dono apontou nas peças do HTML, todas com nota 4 ou 5 — a lista da
barreira automática (render + conferência no servidor):

- texto sobre texto: "Pet Feliz" × "pacote de cuidados" (#16) e "novidade" (#9);
- no vertical, o texto não quebrou de acordo com o tamanho (#18);
- o calendário do comunicado ficou feio (#2);
- o ícone do Instagram saiu torto (#12);
- falta textura, um pouco mais premium (#5).

### 4.5 Editar sem código

- **Campos:** clicar no texto ou na foto da peça abre edição direta; o
  formulário lateral lista os `data-campo`. Trocar foto puxa de Mídias.
- **Camadas:** cada camada pode ser arrastada e redimensionada (o
  `react-moveable` já está no projeto); o editor grava as variáveis
  `--x --y --w --h` da camada. O que não é camada não se arrasta, e tudo bem.
- **Pedir em português:** "deixa o preço maior", "troca o fundo para o modo
  escuro" — a IA devolve só a alteração, reversível.
- **Editor atual continua** para quem quer desenhar do zero, e as peças dele
  convivem com as em HTML na mesma programação.
- **Canva:** importar PNG, PDF (vira sequência de slides) e MP4 agora; a API
  oficial do Canva fica para depois, se houver demanda.

### 4.6 Como a peça roda na TV e no editor

Um tipo de item novo, `peca-html`:

```js
{
  tipo: 'peca-html',
  versao: 1,
  papel: 'destaque',                                // cabecalho | destaque | lateral | rodape (§4.7)
  html: '<section class="mt-peca">…</section>',   // já higienizado no servidor
  css: '…',                                         // escopo da peça
  campos: { titulo: 'Lentes com 20%', foto: 'asset_123' },
  marcaId: 'm_1', modo: 'escuro',                   // de onde vêm os tokens
  formatos: ['16x9', '9x16'],
  origem: { motor: 'html-v1', modelo: '…', pedido: '…' }
}
```

**Shadow DOM, não iframe.** A peça é montada dentro de um Shadow DOM: o CSS
dela não vaza e o da página não entra, as fontes do player já estão
carregadas, e não custa um documento inteiro por peça como um iframe
custaria num box de 2 GB. A higienização acontece **duas vezes** (no
servidor ao salvar, no player ao exibir) com uma lista do que é permitido —
nunca uma lista do que é proibido. O mesmo renderizador roda no editor, na
miniatura e na TV: o que o dono vê no celular é o que sai na parede.

### 4.7 Tela completa — o papel de cada zona

"Gerar tela completa" cria conteúdo para **todas as zonas** do layout da tela:
cabeçalho, destaque, lateral e rodapé. Cada zona tem um papel. Uma lateral
que repete o título do destaque é espaço de parede jogado fora.

Proporções medidas no layout Corporativo em 1920×1080 (`js/templates.js`):

| Zona | Proporção | Papel | Regra |
|---|---|---|---|
| Cabeçalho | faixa ~15:1 (retrato ~6:1) | **Quem e agora**: marca, hora, clima, tema da campanha | Campos vivos, preenchidos pelo player |
| Destaque | ~1,7:1 no Corporativo; ~1:1 na Vertical em pilha; retrato na Vertical cheia | **O quê**: a oferta ou a mensagem | Uma mensagem por peça |
| Lateral | retrato estreito ~5:8 | **Como, onde e quando**: QR, prazo, preço, prova | Nunca repete o título do destaque; em espaço pequeno esconde o texto secundário |
| Rodapé | faixa ~16:1 | **O resto**: horário, pagamento, contato, avisos | Frases de até 60 caracteres |

Exemplo — Ótica Central (fictícia), "óculos de sol com 30% até sábado":

- **Cabeçalho:** logo · "Semana do Sol" · 14:32 · 27°.
- **Destaque** (3 peças se revezando): 30% OFF com foto · 3 modelos com preço
  · garantia.
- **Lateral** (2): "Só até sábado" · QR "reserve pelo WhatsApp".
- **Rodapé:** "10x sem juros" · "Proteção UV400" · "Aberto até 19h" ·
  "@oticacentral".

**O que o cliente escolhe:**

- **O quê:** Tela completa · Só destaque · Só lateral · Só rodapé · Post
  avulso.
- **Quanto, por zona:** destaque 1 a 5 peças (padrão 3), lateral 1 a 3
  (padrão 2), rodapé 3 a 8 frases (padrão 4), cabeçalho 1.

**Como encaixa no que existe:**

- A peça não tem JavaScript. Relógio, data e clima entram por
  `data-vivo="relogio|data|clima"`, que o player preenche como já faz hoje em
  `startHeader`.
- O rodapé continua rolando pelo motor de ticker do player. A peça-ouro de
  rodapé é a **pele** dele (selo, cor, separador), e as frases entram em
  `data-vivo="mensagens"`.
- Zona que o layout da tela não tem é pulada. A mesma tela completa serve
  Corporativo, Destaque + Lateral, Cabeçalho + Principal + Rodapé e Vertical
  em pilha.
- Hoje existem dois "gerar tela inteira": "Campanha com IA" dentro da tela
  (`ContentEditorPage` → `ai.generateCampaign`, que gera posters por zona) e
  o diretor em Meus Designs. Os dois passam a usar este motor. A geração
  antiga sai depois de 30 dias sem uso (§11).

### 4.8 A biblioteca-ouro — 39 peças e 6 telas completas

**30 peças de conteúdo**: 6 famílias × 5 **estruturas** diferentes (não 5
segmentos), cada uma servindo em 16:9, 9:16 e 1:1.

| Família | 5 estruturas |
|---|---|
| **Oferta** | preço gigante com foto · selo "% OFF" · 3 produtos com preço · prazo em destaque ("até sábado") · parcelado ("10x sem juros") |
| **Institucional** | manifesto só tipográfico · foto cheia com assinatura · número grande ("25 anos") · lançamento ou coleção · 3 valores com ícone |
| **Serviço** | serviço + preço + QR para agendar · 3 passos · horário de funcionamento · aviso de alerta (piso, EPI) · comunicado (feriado, mudança) |
| **Cardápio** | lista em 2 colunas · prato do dia com foto · combo · tabela por categoria (retrato) · painel de bebidas em 3 colunas |
| **Social** | Instagram + QR · depoimento de cliente (5 estrelas) · foto do cliente ou do mural · data comemorativa · "avalie no Google" com QR |
| **Gente** | aniversariante do dia · aniversariantes do mês · boas-vindas · vaga · comunicado interno |

**12 delas servem também na lateral**: prazo, 3 produtos com preço, número
grande, horário, QR para agendar, aviso de alerta, lista do cardápio,
bebidas, Instagram, depoimento, avalie no Google e aniversariante do dia.

**5 cabeçalhos**: clássico (logo à esquerda, hora e clima à direita) ·
centralizado · com a chamada da campanha · status "Aberto até 19h" · mínimo
no modo marca.

**4 rodapés**: rolagem com selo · rolagem com relógio fixo (para tela sem
cabeçalho) · faixa fixa com chamada e contato · formas de pagamento +
rolagem.

**6 telas completas** — ótica, padaria, salão, clínica, lanchonete e
comunicado interno. Não são peças novas: são combinações das acima, para
aprovar a coerência da parede inteira, que peça por peça não aparece.

**Toda peça-ouro**: cor só por token v2 (nenhum hex), `data-campo` em todo
texto e foto, camadas com `--x --y --w --h`, coreografia de entrada (§4.13)
e os 4 modos (claro, escuro, marca, rascunho). Toda estrutura existe **com
foto e sem foto** (§4.11).

**A régua visual** — tirada da primeira amostra renderizada (20/10), em que
o dono pediu "mais premium" e o mesmo conteúdo mudou de patamar só com isto:

- **Um elemento domina.** "Óculos de sol" pequeno e "30% OFF" enorme lê
  melhor e parece mais caro que as duas linhas do mesmo tamanho.
- **Fontes de verdade.** Condensada para oferta, serifada (com itálico) para
  institucional e moda, Inter no apoio. A fonte do sistema é o que faz peça
  parecer slide.
- **Kicker espaçado com filete**, em vez de selo pesado. **Chamada como texto
  sublinhado**, em vez de botão gordo.
- **Preço com o R$ e os centavos pequenos.** O número é o que se lê.
- **Quebra de linha decidida**, nunca deixada ao acaso: "deve / ser." com a
  palavra sozinha na última linha estraga a peça mais bonita.
- **Nada escrito sobre foto sem véu.** O véu vai de `--mt-fundo` a
  `--mt-fundo-0`; endereço e assinatura nunca sobre a imagem.
- **Respiro.** Margem de 6% da largura e espaço entre o bloco de texto e a
  chamada; peça apertada parece barata.

**Marcas de teste**, todas fictícias: Ótica Central, Padaria do Bairro,
Studio Bella e Clínica Vida.

**Aprovação**: em lotes, numa **bancada** que mostra cada peça × zona × modo
× marca. O dono aprova peça por peça, olhando. O lote 1 é a **tela completa
da ótica** (1 cabeçalho, 3 destaques, 2 laterais, 1 rodapé): testa o sistema
de ponta a ponta antes de produzir em volume.

### 4.9 Três jeitos de gerar

HTML escrito do zero tem **mais** texto que a lista de coordenadas de hoje —
estimativa de 2 a 3 vezes mais tokens de saída por peça; o experimento dá o
número real. A economia vem de outro lugar: a peça sai certa sem rodada de
conserto, a maior parte das zonas só **preenche** uma peça-ouro, e a
biblioteca no prompt vai para o cache.

| Jeito | O que a IA faz | Custo | Onde usar |
|---|---|---|---|
| **Preencher** | Escolhe uma peça-ouro e escreve os campos (JSON curto) | Muito baixo | Cabeçalho, rodapé, lateral |
| **Variar** | Adapta o CSS e a estrutura de uma peça-ouro | Médio | Destaque (padrão) |
| **Criar** | HTML do zero, com crítica visual | Alto | Destaque, opção "mais criativo" |

Peça que reprova duas vezes na barreira automática (§4.10) cai para a
peça-ouro preenchida. Nunca tela vazia, nunca peça quebrada.

### 4.10 Aprovação — o cliente só vê peça pronta ou wireframe

**Barreira automática, que o cliente não vê:** lint → render em 16:9, 9:16 e
1:1 → crítica visual. Reprovou duas vezes → peça-ouro preenchida.

**Fluxo do cliente:**

1. Pedido.
2. Plano em texto (já existe: `pararNoPlano` em `server/ai-director.js`).
3. **Wireframe da tela inteira**: instantâneo e sem custo. São as peças-ouro
   escolhidas, no modo rascunho (§4.3), com o texto real e a foto como
   silhueta.
4. O cliente ajusta estrutura e texto e aprova.
5. Geração final: fotos, acabamento e crítica. **As fotos só são geradas
   depois do ok** — foto é o que mais gasta crédito.
6. Prévia pronta dentro da moldura da TV dele, com 3 opções para o destaque.
7. Publicar.

Peça avulsa pula o wireframe e vai direto às 3 opções prontas.

### 4.11 Foto — a IA decide, o cliente autoriza

A foto é o que mais aproxima a peça de "parece de agência", e é a parte mais
cara. A IA tem **autonomia para decidir** quando uma peça pede foto e como
ela deve ser; o cliente **autoriza antes** de qualquer foto ser gerada.

- **A IA decide e descreve.** No plano, cada peça com foto vem com a
  descrição em português ("mulher de 30 anos usando o vestido de linho cru,
  luz natural, fundo liso à esquerda") e o custo. O cliente aprova, edita a
  descrição ou troca por uma foto dele. Já existe o portão: o plano para
  antes do crédito (`pararNoPlano`).
- **O pedido específico é atendido.** Loja de roupas que quer "uma mulher
  usando este vestido" recebe isso. Quando o produto é **dele** (a roupa da
  coleção, a armação da vitrine), a foto é gerada **a partir da foto real do
  produto**, que ele sobe em Mídias: o modelo de imagem recebe a foto de
  referência e mantém o produto fiel. Inventar o vestido não serve — o
  cliente vende aquele vestido, não um parecido.
- **A peça-ouro diz onde a foto entra.** Cada estrutura com foto declara o
  enquadramento (metade lateral, arco, cheia com véu, recorte) e de que lado
  o texto fica; o pedido da foto já sai com esse lado limpo
  (`server/direcao-arte.js` faz isso hoje para 16:9, 9:16, 1:1 e 21:9).
- **Regras que não mudam:** nenhum texto desenhado na foto (`direcao-arte`
  já proíbe); pessoa gerada nunca é retrato de alguém real e identificável;
  foto do acervo do cliente vence foto gerada quando serve.
- **Banco de fotos gratuito (Pexels), decidido em 20/10.** A ordem de
  procura vira: acervo do cliente → Banco de Imagens MultiTelas → Pexels →
  gerar. Foto de banco custa zero; gerada, 1 crédito.
  - Pexels e não Unsplash: a API do Unsplash exige carregar a imagem direto
    do servidor deles (a TV precisa funcionar offline e só aceita mídia
    nossa) e diz ser para uso "non-automated" — a IA escolhendo sozinha é
    arriscado. A do Pexels não tem essas duas travas (confirmar no contrato
    antes de construir).
  - Crédito obrigatório (fotógrafo + Pexels, com link): fica no painel, junto
    da foto, não na TV. A foto escolhida é copiada para as Mídias, como
    qualquer outra, e passa a ser servida por nós.
  - A chave da API fica em variável de ambiente; limite de 200 buscas por
    hora — a busca passa pelo servidor, com cache.
- **Custo:** foto gerada continua 1 crédito. Foto com referência de produto
  pode custar mais — sai medida do experimento antes de ter preço.

**Fundos e texturas.** Além da foto, o fundo da peça é uma escolha de gosto
— e quem escolhe é o cliente, dentro do escopo que ele pediu. Cinco níveis,
do grátis ao gerado:

| Fundo | O que é | Custo |
|---|---|---|
| Liso | `--mt-fundo` | zero |
| Degradê | `--mt-fundo` → `--mt-fundo-2`, só tokens | zero |
| Padrão | listras, pontos, malha — desenhados em CSS com tokens | zero |
| Textura | gerada pela IA na cor da marca: papel, linho, mármore, concreto, granulado | 1 crédito, **uma vez** |
| Foto | a cena inteira (§4.11 acima) | 1 crédito por foto |

- A textura é **da marca, não da peça**: gerada uma vez, guardada em Marca
  ("texturas da marca") e reusada em toda peça e campanha depois. O custo
  se dilui; a identidade se repete, que é o que a faz ser identidade.
- Entra como camada de imagem por campo (`data-campo-img="fundo"`), igual
  à foto — a porta do PR 3 já aceita, sem `url()` no CSS. Monocromática na
  cor da marca (regra que `server/direcao-arte.js` já usa para foto), para
  o texto por cima continuar se lendo; sem `mix-blend-mode`, que o box não
  aguenta.
- **Depende do gosto:** no chat (§4.12, passo 2), o fundo é um dos botões de
  ajuste — "liso · degradê · padrão · textura · foto" — mostrado na peça
  dele antes de gastar. Quem não escolhe recebe o que a peça-ouro sugere,
  sempre do lado grátis.
- Texturas genéricas boas entram no Banco de Imagens MultiTelas e passam a
  custar zero para todo mundo.

### 4.12 Chat de refinamento — conversar é barato, gerar é caro

Tudo o que dá para decidir antes de gerar, decide-se na conversa: uma troca
de mensagens custa centavos, uma geração com foto e crítica visual custa
crédito. O chat existe para a geração acertar de primeira.

**Já existe, em quatro partes**, e não nasce chat novo — elas viram uma
conversa só:

- o **guia** (`server/ai-guia.js`) oferece 3 ideias prontas;
- o **briefing** (`server/ai-briefing.js`) faz até 5 perguntas, uma por vez,
  com sugestões para clicar, e nunca pergunta cor nem estilo (isso vem da
  Marca);
- a **memória** (`server/ai-memoria.js`) é a ficha da empresa que cresce a
  cada conversa;
- o **plano** para antes de gastar crédito.

**O que falta é o gosto visual, e gosto não se pergunta: se mostra.** Quem
tem padaria não sabe descrever o estilo que quer, mas reconhece quando vê.

1. **Entender o pedido** — o briefing atual: o que é, para quem, até quando,
   quantas peças, onde aparecem, se tem foto.
2. **Escolher o caminho visual** — o chat mostra 3 peças-ouro já com o texto
   e a marca do cliente, desenhadas no próprio navegador (sem geração).
   "Qual chega mais perto?" Ajustes por botão: mais sóbrio, mais chamativo,
   claro, escuro, e o fundo (liso, degradê, padrão, textura, foto — §4.11).
   Cada botão só troca modo, token ou camada: custo zero até a geração.
3. **Wireframe da tela inteira**, editado conversando ("troca a lateral por
   QR do Instagram", "título mais curto"). A IA devolve só a **alteração** no
   plano — um texto curto, centavos.
4. **Resumo com o custo** ("3 peças, 1 foto, 1 crédito") e só então gerar.
5. **Depois de gerado**, os ajustes continuam pelo chat, reversíveis (§4.5).

**Regras de economia:**

- Botão antes de texto livre: clique não gasta token.
- Cada mensagem manda o **estado atual** e o último pedido, não o histórico
  inteiro. O começo fixo do prompt vai para o cache.
- Modelo barato para conversar; o caro só na geração final.
- ~~Teto de perguntas imposto pelo código, como hoje (`MAX_PERGUNTAS`).~~
  **Mudou em 21/10, por decisão do dono:** a conversa não tem limite de
  perguntas. A pessoa refina até a IA dizer que entendeu. O que segura o
  custo é um teto diário de mensagens por conta, e conversar não gasta
  criação. O desenho novo está no EXECUTOR, seção 2b, itens 19 a 27: o
  Criar vira o chat, e a IA gera o ecossistema inteiro (as TVs com as
  zonas, a programação e as redes) ou só o recorte pedido.
- A memória passa a guardar o **gosto** ("prefere escuro", "recusou o
  layout X"): a próxima conversa já começa mais perto.

### 4.13 Animação — JavaScript no player, nunca na peça

A peça **declara** a intenção (`data-entrada="subir"`, `data-ordem="2"`) e
o **nosso** código anima. A IA escolhe de uma lista fechada e nunca escreve
JavaScript — a CSP (`script-src 'self'`) e o higienizador continuam
recusando qualquer `<script>` ou `on*=`.

- **Camada 1, já nas peças-ouro.** Cada peça nasce com a coreografia
  desenhada — ordem, lado e ritmo de entrada — usando a biblioteca que já
  existe (`js/animacao.js` e `css/animacao.css`: 8 entradas e 4 movimentos
  contínuos, só `transform` e `opacity`, com teste). Funciona igual no
  editor, na miniatura e na TV, sem JavaScript. É o "cru extremamente bem
  feito", já animado.
- **Camada 2, num PR separado na Fase 3.** Coreografias com GSAP 3.15, que já
  está carregado no player (`js/vendor/gsap.min.js`) para a troca de slides:
  preço contando até o valor, revelação por máscara, texto entrando palavra
  a palavra. Antes de chegar a cliente, 72 h no box beta medindo memória e
  quadros. Sem GSAP, a peça cai na camada 1.

### 4.14 Ordem dos PRs desta fase

Um PR por etapa, cada um aprovado pelo dono antes de começar.

1. **Este escopo** no `PLANO.md`.
2. **Tokens v2** de cor (§4.3): claro, escuro, marca e rascunho, com teste de
   contraste AA em todas as combinações.
3. **Formato `peca-html`**: higienizador por lista do que é permitido e lint
   dos trilhos (§4.2), incluindo os atributos de animação permitidos.
4. **Renderizador** em Shadow DOM, campos vivos, coreografia CSS e a
   **bancada**.
5. **Lote 1**: a tela completa da ótica.
6. **Lotes 2 a 6**: o restante da biblioteca, cerca de 6 peças por lote.
7. **Camada de IA**: modelo por chamada, saída maior, visão nos três
   modelos, cache de prompt e tokens medidos (§4.2).
8. **Experimento** (§4.4), com a página de nota às cegas.
9. **Foto do produto real** (§4.11): gerar a partir da foto de referência
   que o cliente sobe, com aprovação antes.
10. **Banco de fotos gratuito** (§4.11): busca no Pexels pelo servidor, com
    crédito no painel e cópia para as Mídias.
11. **Chat de refinamento** unificado (§4.12).

Antes da primeira peça-html numa tela de cliente: a Fase 0 (§10).

**Situação em 20/10:** 1 a 8 no `main` (PRs #109 a #123). Depois de 9 a 11,
com o resultado do experimento:

12. **Barreira automática**: o servidor desenha a peça em 16:9, 9:16 e 1:1 e
    acusa texto vazando ou sobre texto — o mesmo detector da bancada. É o que
    pega os defeitos que o dono achou no experimento (§4.4).
13. **O motor novo no produto**: Meus Designs e "Campanha com IA" passam a
    compor em HTML, com 3 opções e a peça-ouro preenchida quando a IA falha.
14. **Preencher à mão**: escolher uma peça-ouro e escrever os campos, com
    limite de caracteres por campo; miniatura e editor com o mesmo desenhista.

**Ordem mudada em 20/10:** o 13 veio antes de 10 e 11 — sem ele o dono não
testa o motor novo. Feitos: 9 (#126) e a primeira parte do 13: a campanha
compõe em HTML com os textos aprovados, a peça-ouro preenchida entra quando
a IA falha, e Meus Designs mostra a peça com o desenhista da TV. Faltam no
13 as 3 opções e a tela completa ("Campanha com IA" dentro da tela).

**Achado de 20/10 — peças-ouro e fontes largas.** O detector da bancada
media a caixa do campo, não o texto: palavra que não quebra vazava sem
aviso. Corrigido (`js/peca-conferir.js`, um detector só para bancada e
painel), a varredura de 39 peças × 6 marcas × todas as zonas (948
combinações) achou 9 peças que vazam ou sobrepõem com a fonte de OUTRA
marca — com a própria, só o lançamento, já corrigido. Fica um PR de
robustez para as 8 (abaixo): cabecalho-chamada (em pé), cardapio-colunas (lateral),
gente-mes, lateral-prazo, manifesto, oferta-foto (marca × kicker com
Playfair/Poppins), oferta-parcelado (em pé) e servico-horario.
**Feito no mesmo dia** com um token, `--mt-escala-titulo` (js/tokens.js): a
largura das maiúsculas da fonte da marca contra a Oswald, medida no
navegador (js/fontes.js). Título e número grandes usam
`calc(… * var(--mt-escala-titulo, 1))`; condensada e Anton ficam em 1, e
nada muda na marca de cada peça — a ótica do lote 1 conferida ponto a
ponto. As 948 combinações passam limpas, e a régua do compositor ensina a
IA a usar o token.

**Escopo enxuto (20/10, o dono: "descarte do escopo o que não for
necessário").** Fica o que melhora a peça que vai para a TV ou é exigido
antes da ótica:

- **Fica:** refazer automático da peça que não cabe (a barreira fecha com
  o conserto: o painel mede, a IA redesenha com a medida); robustez das 8
  peças-ouro (a IA copia delas); tela completa com o motor novo; canal
  beta antes da ótica; backup quando o bucket existir.
- **Sai por ora:** 3 opções por peça (o "refazer" cobre o que importava:
  peça que não ficou boa ganha outra); banco de fotos Pexels; chat de
  refinamento unificado (o briefing atual fica); preencher peça-ouro do
  zero (a reserva automática cobre a IA fora do ar); print no servidor
  com Chromium (a conferência no navegador do painel já mede igual à
  bancada, sem serviço novo).

### 4.15 Pronto quando

- [ ] 39 peças-ouro e 6 telas completas aprovadas pelo dono.
- [x] Experimento feito e motor escolhido pela nota, não pelo gosto do dia
      (20/10: HTML + Gemini, 4,65 contra 1,40 — §4.4).
- [ ] Pedido → 3 opções em menos de 60 s, média ≥ 4 no banco de avaliação.
- [ ] Tela completa gerada com papel certo em cada zona, sem repetir mensagem
      entre elas.
- [ ] Wireframe aprovado antes de qualquer foto ser gerada.
- [ ] Foto com o produto real do cliente, fiel ao produto, aprovada antes de
      ir para a tela.
- [x] Trocar marca ou modo reestiliza a peça sem gerar de novo
      (21/10, PR #137: Escuro, Claro, Cor da marca e a marca, no editor).
- [ ] Peça idêntica — inclusive a entrada animada — no editor, na miniatura
      e no box da ótica.
      *(21/10: o player ficou igual à bancada, quadro a quadro — o slide não
      esmaece nem escala por cima da entrada da peça; no modo leve ela vem
      parada. Falta conferir no box da ótica, com o consultor.)*
- [ ] IA fora do ar → o cliente preenche uma peça-ouro à mão, nunca tela vazia.

---

## 5 · Fase 2 — Painel: realocar, não cortar

Regra: o dono da loja usa o painel no celular, entre um atendimento e outro.
Tarefa principal termina em **3 toques e 2 minutos**. Nada é apagado nesta
fase — só muda de lugar. Hoje são 18 páginas e 99 tipos de conteúdo.

### 5.1 O menu novo

| Item | Junta o que hoje está em |
|---|---|
| **Início** | Visão geral, Alertas, Primeiros passos |
| **Telas** | Telas, grupos, programação de cada tela, pareamento |
| **Criar** | Criar com IA, Meus Designs, editor, modelos, datas comemorativas |
| **Mídias** | Armazenamento, Banco de Imagens MultiTelas, importar (Canva, PDF) |
| **Marca** | Marcas (até 3), logo extraído em PNG/SVG, leitura do site, cores e modos |
| **Automáticos** | Aniversariantes, Mural de fotos, clima, datas |
| **Relatórios** | Relatório de exibição, desempenho das telas |
| **Conta** | Plano e cobrança, Equipe, Ajustes, Suporte |

No celular, barra inferior com **Início · Telas · Criar · Mídias · Mais**.

**Um lugar para criar.** Hoje dá para desenhar em Meus Designs e também
dentro da página da tela (`ContentEditorPage`). Depois: **cria-se em Criar;
a tela só recebe e organiza** ("Adicionar conteúdo" abre a biblioteca, com
"Criar novo" no topo). O cliente nunca mais se pergunta por onde começar.

**Adicionar conteúdo pergunta antes de mostrar a grade:** "O que você quer
mostrar?" com 6 entradas grandes (criar com IA, foto ou vídeo, promoção com
preço, aviso, aniversariantes, Instagram/QR). Os 99 tipos ficam em "Mais
tipos", com busca.

**Feito em 21/10 (item 3 do EXECUTOR): Criar em 4 passos.** Entrada única
"Criar" no menu, e o passo 1 também no Início: opção → frase → rascunho →
publicar, com a tela já marcada. Criar com IA e publicar = 3 toques no
celular (opção, "Ver o rascunho", "Publicar"). Empresa, tom e público vêm da
Marca; formato e quantidade ficam em "ajustar". Meus Designs vira a
biblioteca, com "Criar na mão", "Gerar imagem IA", "Importar arquivo" e a
campanha completa em "Mais". Na tela, "Adicionar conteúdo" abre a biblioteca
com "Criar novo" no topo; os tipos prontos ficam em "Mais tipos".

### 5.2 Avançado × pago — dois eixos diferentes

- **Avançado** responde *onde fica*: complexidade de uso. Fica fora do
  caminho principal, para todos.
- **Pago** responde *quem usa*: custo para nós ou valor para o cliente.

Regra: **cobrar por quantidade, quase nunca por recurso.** A página de preços
fica simples e o cliente experimenta tudo no teste.

| Recurso | Onde | Quem |
|---|---|---|
| Criar com IA | Principal | Todos, com teto de créditos (§6.5) |
| Ler o site e extrair o logo (PNG/SVG) | Cadastro e Marca | **Todos** — é o que deixa bonito no primeiro dia |
| Banco de Imagens MultiTelas | Mídias | Todos (não gasta crédito) |
| Aniversariantes, datas comemorativas | Automáticos | Todos |
| Mural de fotos por QR | Automáticos (avançado) | Pago |
| Mais de uma marca | Marca (avançado) | Pago — 1 no plano base, até 3 acima |
| Relatórios e desempenho das telas | Relatórios | Pago |
| Equipe com mais de 1 pessoa | Conta | Pago |

### 5.3 Pronto quando

- [x] Do cadastro à primeira peça na TV em **menos de 10 minutos**, guiado. *(21/10, item 16: "Comece por aqui" na ordem marca → primeira peça → ligar a TV, cada página diz o próximo passo e o pareamento manda a peça para a TV. Cronometrado no localhost, automatizado: 31 s do cadastro à peça na TV, 18 s deles esperando o e-mail.)*
- [x] Toda tarefa principal em 3 toques no celular de 360 px. *(21/10, item 15: ver a TV, recarregar, plano, aniversariantes, mídias, pôr foto na TV e as 6 entradas do Adicionar conteúdo — de 1 a 3 toques, medidos no navegador.)*
- [x] Nenhum recurso perdido: cada página antiga tem endereço novo ou redirect. *(21/10, item 15: o menu tem os 8 grupos, cada página antiga é aba de um deles, e todo ?ir= antigo abre a mesma página — test/menu.test.js.)*
- [ ] Testado em Android e iPhone, em 4G fraco.

---

## 6 · Modelo comercial

Números de partida — validar com o contador, com o advogado e com o app de
orçamento do dono antes de publicar.

*(21/10, EXECUTOR item 11: no código — `server/plans.js` tem o mensal, o anual
por faixa, a multa (§6.3, só calculada e mostrada; nada é cobrado sozinho), o
teto de IA por conta em criações, o teste com 20 criações que vencem com ele e
a régua de atraso 3/10/20 com o selo "MultiTelas" na TV. O anual é vendido
numa conversa ("Quero o anual — falar com a gente"): o termo do contrato ainda
não está nos Termos de Uso. Duas perguntas abertas na issue #135: liberar o
checkout anual, e a multa da §6.3 cresce perto do fim do contrato — o oposto
do que o texto promete.)*

### 6.1 Mensalidade por tela

| | Por tela/mês |
|---|---|
| **Mensal**, sem contrato | **R$ 149** — sem desconto por volume |
| **Anual**, contrato de 12 meses — telas 1 a 3 | **R$ 120** |
| Anual — da 4ª à 10ª | R$ 108 (−10%) |
| Anual — da 11ª à 25ª | R$ 96 (−20%) |
| Anual — 26ª em diante | negociado, piso R$ 90 (−25%) |

O desconto é **por faixa** (só as telas daquela faixa recebem), como já
funciona em `server/plans.js` — a faixa muda, o mecanismo não. O desconto
por volume fica só no anual: é ele que puxa o cliente para o contrato.

Exemplo, 5 telas no anual: 3 × 120 + 2 × 108 = **R$ 576/mês**.

**Na nota, separar locação do player e software** para quem tem aparelho
nosso (ex.: R$ 25 de locação + R$ 95 de software). Locação de bem móvel pode
não pagar ISS. **Atenção ao nome:** comodato, por lei, é empréstimo gratuito;
se a mensalidade paga o aparelho, o contrato é de **locação**. Confirmar com
contador e advogado.

### 6.2 Implantação

| Situação | Preço |
|---|---|
| Com aparelho nosso — 1ª tela | **R$ 459** (aparelho R$ 210 + visita e configuração) |
| Com aparelho nosso — cada tela a mais no mesmo local | **R$ 299** |
| Aparelho do cliente, instalação nossa | piso **R$ 459** (avaliação do local) + **R$ 99** por tela a mais |
| Autoinstalação (1–2 telas, TV/PC/box do cliente) | **R$ 0** |

O aparelho se paga na implantação; a mensalidade é quase toda margem.

### 6.3 Multa de cancelamento (anual)

A multa é **o maior entre**:

- **(a)** 30% das mensalidades que faltam; e
- **(b)** os custos não recuperados: o desconto do anual devolvido
  [(R$ 149 − preço pago) × telas × meses usados] + visita de retirada
  (R$ 150) + R$ 210 por aparelho não devolvido.

Quem cancela cedo nunca deixa prejuízo; quem cancela perto do fim paga pouco.
Exemplo (5 telas, cancela no 4º mês, devolve os aparelhos): (a) R$ 1.382,40,
(b) R$ 826 → multa **R$ 1.382,40**. Sem devolver: (b) R$ 1.876 → **R$ 1.876**.

### 6.4 Entrada: teste e degustação

- **Teste de 14 dias**, sem cartão, com hardware próprio: qualquer
  navegador vira tela (PC, notebook, TV com navegador, box). O teste dá
  **créditos de IA suficientes para impressionar** (sugestão: 20; custo
  ~R$ 7, é custo de aquisição). Depois do teste, a tela segue com o selo
  "versão gratuita" e sem IA, como já funciona — recomendação: manter, porque
  vira vitrine passiva do MultiTelas.
- **Projeto grande:** demonstração e **degustação de 7 dias** com o aparelho
  instalado e configurado, **cartão cadastrado**. No 8º dia o Asaas cobra
  sozinho (implantação + 1ª mensalidade), salvo cancelamento. Cancelou: o
  aparelho volta em até 5 dias úteis (retirada ou envio); não voltou, cobra
  R$ 210 por aparelho. Tudo escrito no termo da degustação.

### 6.5 Teto de IA

Crédito continua sendo a unidade (`docs/BILLING.md`: 1 crédito ≈ R$ 0,35 de
custo real). Muda a franquia: de "por tela" para **por conta**, porque quem
tem 5 telas não cria 5 vezes mais — repete o mesmo conteúdo.

| Conta | Teto de custo de IA/mês | Em créditos |
|---|---|---|
| 1 a 3 telas | R$ 30 | ~85 |
| cada tela a mais | + R$ 3 | + ~8 |
| teto absoluto | R$ 80 | ~230 |

- A parte de locação da mensalidade financia esse teto, e sobra margem
  porque a maioria das contas não chega nele.
- O cliente vê **criações**, não reais nem créditos técnicos ("faltam 32
  criações este mês").
- Acabou: continua com peças-ouro, banco de imagens e upload — nunca
  bloqueia, nunca apaga a tela. Pacotes avulsos (já existem) para quem quer
  mais.
- **A geração de HTML com crítica visual deixa de ser "texto grátis".** O
  custo real por criação sai do experimento (§4.4) e define quantos créditos
  cada criação consome. Saiu em 20/10: **R$ 0,065 por peça** sem foto (~0,2
  crédito); a tela completa soma quatro composições (~R$ 0,26). A crítica
  visual ainda não entrou nessa conta.

### 6.6 Inadimplência

Aviso em 3 dias, selo na TV em 10, suspensão da IA e de telas novas em 20.
**Nunca tela preta sem aviso** — já é princípio do `cobranca.js`, precisa
estar escrito na página de preços.

### 6.7 A página de preços (Fase 5) precisa dizer

- O preço, público, por tela — a arma que a Pix Mídia não tem.
- **"Use sua TV ou seu box: R$ 0 de equipamento"** com a conta do
  investimento evitado (5 telas = R$ 1.250 a 2.500 de player), **e** "ou
  instalamos tudo para você".
- SLA público, WhatsApp com horário, "nunca desligamos sua tela por fatura".

---

## 7 · Fases 3, 4 e 5

### 7.1 Fase 3 — TV adaptável e operação 24/7

**Adaptável:**
- [x] Todo o CSS do player em unidades de container; aposentar a mistura de
      `vw`, `clamp(px)` e `cqw`. (21/10: o conteúdo das zonas — texto,
      relógio, clima, aniversário, QR, letreiro — em cqw/cqh, com a linha
      antiga como reserva para WebView velho; o que é da TELA inteira —
      palco, destaque, pareamento — continua em vw/vh, de propósito. A
      peça-html é desenhada no tamanho de 1080p e escalada: as peças decidem
      "coluna" por pixel, e em 720p e 4K erravam.)
- [x] Margem segura contra overscan, **ajustável por tela** no painel (0 a 5%, 21/10).
- [x] Retrato de primeira classe (vitrine de ótica usa TV de pé). (21/10: zona
      quase quadrada e zona larga demais desenhadas no 1:1 e no 16:9
      aprovados, centralizadas — `enquadrar` em js/peca-render.js.)
- [ ] Matriz de teste: 720p, 1080p, 4K; paisagem e retrato; box e navegador.
      (21/10: navegador feito — os 15 layouts nas três resoluções, e as
      peças-ouro nas zonas medidas, 3834 combinações limpas. Falta o box.
      Na varredura de regressão, EXECUTOR item 17: 6210 combinações da
      bancada limpas; o player em 720p, 1080p e em pé, nativo e girado, pegou
      dois defeitos do cabeçalho — data "21 De Out." (#164) e nome cortado
      em pé, com a perna do g comida em todo tamanho (#167).)

**24/7:**
- [ ] 72 horas seguidas no box, medindo a memória do WebView de hora em hora.
- [ ] Tirar da tomada 10 vezes; voltar sozinho em todas.
- [ ] Vídeo normalizado no upload (H.264 1080p, bitrate máximo).
      *(21/10: converter precisa de ffmpeg no servidor — decisão do dono. Já
      existe a régua, em js/video.js: todo upload de vídeo AVISA quando o box
      pode engasgar — HEVC/AV1 lidos nos bytes, acima de Full HD, mais de
      10 Mbps, mais de 150 MB — e não proíbe. O ffmpeg, quando vier, usa a
      mesma régua para decidir quem converter.)*
- [ ] Cortar a internet por 24 h; nada some.
- [x] Expediente: tela apaga fora do horário (menos desgaste, menos alerta falso).
      (21/10: preta ou só o relógio, à escolha; o padrão continua mostrando.
      Uma regra só para a TV e o vigia: js/expediente.js.)

**Operação:**
- [ ] **Alerta proativo de tela offline** por e-mail e WhatsApp, em minutos —
      o cliente sabe por nós antes de descobrir sozinho.
- [x] Print remoto da tela para ver a parede sem ir à loja. *(Telas → olho "Ver a tela agora": a TV manda o ESTADO — layout e o item no ar em cada zona — e o painel desenha com o mesmo desenhista; um navegador não fotografa a própria tela. O servidor só deixa passar item que está salvo na programação (server/ver-tela.js); item que não bate vira "programação antiga, recarregue a TV".)*
- [ ] Atualização remota do APK.
- [ ] **Canal por tela (estável/beta):** recurso novo liga primeiro nas telas
      beta (o box do dono), e só depois na ótica. É assim que se congela um
      cliente sem congelar o desenvolvimento.
- [ ] Guia de instalação em 10 minutos, com fotos, para quem se instala
      sozinho.

**Lição do primeiro box (19/10):** o box da Proeletronic (Android 10) não
abre ADB pela rede só com a depuração USB ligada (porta 5555 fechada), e um
cabo USB-A → USB-C ligado ao PC não funciona (os dois lados ficam como
"computador"). A instalação foi por pendrive. Para os próximos: ou um modelo
homologado que aceite ADB pela rede, ou cabo USB-A/USB-A na porta OTG uma
vez (`adb tcpip 5555`), ou o processo manual documentado.

### 7.2 Fase 4 — Administração: visão total do negócio

A pergunta que o painel responde todo dia: *alguma tela de cliente está
apagada, alguém está devendo, e o negócio está crescendo?*

| Bloco | O que mostra |
|---|---|
| **Frota** | Todas as telas, ordenadas por "offline há mais tempo", versão do app, último print, canal |
| **Clientes** | Plano, telas, contrato (início, fim da fidelidade, multa hoje), pagamento, contato |
| **Aparelhos** | Estoque de players por número de série: em estoque, instalado (onde), em retirada, com defeito |
| **Receita** | Receita recorrente mensal, crescimento, cancelamentos, inadimplentes, próximos vencimentos, links para o Asaas |
| **Funil** | Cadastros → teste → pago, por semana; quanto do teste vira cliente |
| **Custo e margem** | Custo de IA por conta (já medido em `uso_ia`), armazenamento, margem por conta |
| **Saúde** | Último backup, uso do R2, erros das últimas 24 h, fila do render |
| **Ações** | Recarregar TV, entrar como cliente (com registro), estender teste, suspender |
| **Meta** | Telas no ar contra a meta de 100 até o meio de 2027 |

Mesmo design do painel do cliente, com outra cor de destaque, para nunca
confundir "estou como operador". Consultas pesadas com cache — o painel do
operador nunca deixa o do cliente lento.

*(21/10, EXECUTOR item 13: no ar em "Métricas da plataforma" — frota,
clientes, receita, funil, custo de IA, saúde e meta (server/admin.js), com
destaque verde-azulado; e as ações: recarregar TV, estender teste (até 30
dias, nunca encurta), registrar o contrato anual e entrar como o dono — só
com motivo, por uma hora, com faixa na tela e registro em acessos_suporte;
lá dentro cobrança, equipe, senha e dados pessoais ficam com o dono
(server/suporte.js). Faltam: aparelhos (estoque por número de série), links
para o Asaas, crescimento da receita (precisa de histórico), "suspender", e
o último backup depende de o serviço web poder ler o bucket de backup.)*

### 7.3 Fase 5 — Identidade, landing e preços

**Identidade (a IA constrói, o dono aprova):** logo (horizontal, ícone,
monocromático, em SVG), paleta em tokens com claro e escuro, uma tipografia
de interface e uma de display, tom de voz, banco de imagens próprio (fotos
reais de TVs instaladas, mockups), documento de marca e modelos de proposta
e contrato em PDF. Aplicar em painel, pareamento da TV, landing, e-mails e
propostas.

**Landing:** reescrita do zero, premium, aproveitando a **demo de temas em
tempo real** da atual. Uma página: herói com foto real de TV instalada e
"Testar 14 dias grátis" → como funciona em 3 passos → galeria por tipo de
negócio (com peças geradas pelo motor novo) → prova (ótica, com autorização)
→ preço (§6.7) → perguntas → WhatsApp em destaque. Menos de 500 KB, carga
abaixo de 2,5 s em 4G, nenhuma promessa sem código por trás.

*(21/10, EXECUTOR item 14: landing reescrita — herói, 3 passos, galeria por
ramo com peças do motor, o que vem junto, preço com mensal × anual e
simulador, perguntas, WhatsApp. 189 KB, maior pintura em ~1,2 s num celular
em 4G simulado. Cada promessa tem teste apontando o código
(test/landing.test.js). Faltam: a foto real de TV instalada (o herói mostra
peças do motor numa moldura), o número de WhatsApp (variável
WHATSAPP_NUMERO; sem ela o botão vira e-mail ou some) e a prova da ótica,
que precisa de autorização. A demo de temas em tempo real ficou de fora:
pesava mais do que o orçamento deixa.)*

---

## 8 · Trilha sem código (em paralelo)

- [ ] Contrato de **locação** do player + fidelidade + multa (§6.3), com advogado.
- [ ] Termo da degustação de 7 dias (§6.4).
- [ ] Contador: separação locação/software na nota.
- [ ] Asaas de produção no CNPJ, com cartão recorrente e cobrança agendada.
- [ ] Homologar um modelo de box (ADB pela rede, 2 GB+, Android TV) e ter estoque mínimo.
- [ ] WhatsApp provisório agora (o número fica em variável de ambiente, nunca
      no código); depois número dedicado, atendimento 24 h e parceiros.
- [ ] Rodar o script de orçamento no app de orçamento do dono; o que ele não
      calcular vira melhoria lá.

---

## 9 · Feito para escalar

Decisões desta rodada que deixam a porta aberta, sem construir o futuro agora:

- **Peça com campos de dados.** `data-campo` hoje é texto e foto; amanhã é
  senha da fila, cardápio vindo de planilha, painel do Power BI por URL,
  indicador interno. Fila de atendimento e consultório são peças cujo campo
  vem de um sistema — o motor já é o mesmo.
- **Render como serviço separado**, chamado por fila: cresce sozinho e serve
  também PNG para redes sociais.
- **Tokens únicos de tema**: marca branca e parceiros (agências revendendo
  com a marca delas) viram uma troca de tokens.
- **Contas com várias lojas** (franquias): marcas por conta + grupos de telas
  já existem; o próximo passo é unidade.
- **Mais de uma instância do servidor:** SSE, limites e comandos em Redis
  (já listado em `ESTADO-DO-PROJETO.md`).
- **Um banco só:** Postgres também nos testes (Docker no CI) e aposentar o
  SQLite — hoje cada mudança de banco é feita duas vezes.
- **API pública e webhooks**, documentados cedo, mesmo pequenos (pedido
  recorrente de conta média, segundo o dossiê).

---

## 10 · Fase 0 — Antes de tudo

Antes de tudo **que chegue à tela de um cliente**. A biblioteca-ouro vem
antes dela por decisão do dono (§3); a primeira peça-html numa tela de
cliente, não.

**20/10:** a ótica ainda não tem aparelho — a única tela no ar é a de teste,
na casa do dono. Por isso a Fase 1 foi direto para o `main`. O canal beta
continua obrigatório **antes de instalar a ótica**.

- [ ] `pg_dump` diário do Postgres para o R2, com teste de restauração.
      Código pronto (`docs/BACKUP.md`): serviço próprio no Railway por cron,
      bucket **separado e privado** só de backup, dump cifrado, e a
      restauração conferida tabela por tabela **todo dia**, num Postgres
      descartável — não uma vez na implantação. Falta o dono criar o bucket.
- [ ] Canal estável/beta por tela; a ótica e o cliente de 3 telas no estável.
      Decidido em 20/10 (escopo enxuto): canal por ENDEREÇO, sem código —
      produção serve a branch `estavel`, um serviço `beta` serve o `main`, e
      o box do dono aponta para o beta (`docs/CANAL-BETA.md`). Falta montar
      no Railway, com a autorização do dono.
- [ ] Box do dono rodando o player em beta, como bancada de teste.

---

## 11 · Regras para quem for executar

- **Um PR por etapa**, pequeno, com os testes passando (1193 hoje) e
  `npm run lint:nomes` limpo.
- **Renderizar e olhar** toda mudança visual, em celular de 360 px e em TV.
- **Esconder antes de apagar.** Código de funcionalidade realocada só sai
  depois de 30 dias sem uso.
- **Nada na tela de cliente sem 72 h no box beta.**
- **Nenhuma promessa na landing sem código por trás.**
- Comentários explicam o porquê; decisões novas entram neste arquivo.

---

## 12 · O que este plano substitui

| Documento | Trecho que deixa de valer |
|---|---|
| `CAMPANHA-SCHEMA.md` | "Layout é determinístico, não generativo" — agora a IA gera HTML com trilhos |
| `ESTADO-DO-PROJETO.md` | "Comodato de hardware, não" — agora é locação/comodato com instalação |
| `ANALISE-PIXMIDIA.md` | "Não copiar: comodato" e "trial de 15 dias no lugar do grátis" — decidido o contrário, com os dois caminhos na página de preços |
| `BILLING.md` §5 | Tabela de planos e franquia de crédito por tela — ver §6 deste plano |
| Roadmap de 17/10 (fora do repositório) | Palco fixo 1920×1080 — agora adaptável; menu de 5 itens — agora realocar sem cortar |

**Referências para a sessão nova:** este arquivo primeiro; depois
`ESTADO-DO-PROJETO.md` (como o sistema está montado e as armadilhas),
`BILLING.md` (a conta de custos), `ANALISE-PIXMIDIA.md` (mercado) e
`CAMPANHA-SCHEMA.md` (o formato de campanha, menos a regra substituída).

## 13 · Decisões ainda abertas

1. **Sem aparelho paga o mesmo por tela?** Recomendação: sim — uma tabela só
   vende melhor; a diferença fica na implantação. Rever se o teste mostrar
   resistência.
2. **Créditos do teste:** 20 é suficiente para impressionar?
3. **Depois do teste:** manter a tela com selo e sem IA (recomendado) ou
   desligar?
4. **Modelo de box homologado** para estoque.
5. **Quem paga a retirada** quando a degustação é cancelada (recomendação:
   nós, se o aparelho voltar no prazo).
