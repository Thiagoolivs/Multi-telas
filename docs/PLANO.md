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
imita. Antes do motor, criamos **30 peças de referência em HTML** (as 6
famílias do roadmap: oferta, institucional, serviço, cardápio, social e
gente) no padrão premium. A IA as constrói e o dono aprova uma a uma. Elas
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
como teto), medindo nota e custo por criação. O `server/ai.js` já é
agnóstico de provedor; pode haver um modelo para compor e outro, mais
barato, para briefing.

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
contraste AA em todas as combinações antes de existir. A TV, a peça, a
miniatura e o editor leem **os mesmos tokens** — trocar de modo ou de marca
reestiliza tudo, coerente.

### 4.4 O experimento (primeira semana)

Antes de reescrever, provar.

1. Escolher **20 pedidos reais** (ótica, padaria, salão, clínica, aniversário,
   aviso interno, promoção com preço, texto longo).
2. Gerar cada um pelo motor atual e pelo motor HTML (com 2 modelos).
3. O dono dá nota de **1 a 5 às cegas** (sem saber qual motor fez qual).
4. Medir também: custo por criação, tempo, quantas passaram no lint de
   primeira e se rodam lisas no box da ótica.

**Critério para o HTML virar o motor:** média ≥ 4, pelo menos 1 ponto acima
do atual, custo médio por criação ≤ R$ 1,00 sem imagem gerada, e nenhuma
peça travando no box. O conjunto de 20 vira o **banco de avaliação visual**
permanente: roda a cada mudança de prompt ou de modelo, e a nota não pode
cair.

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

### 4.7 Pronto quando

- [ ] 30 peças-ouro aprovadas pelo dono.
- [ ] Experimento feito e motor escolhido pela nota, não pelo gosto do dia.
- [ ] Pedido → 3 opções em menos de 60 s, média ≥ 4 no banco de avaliação.
- [ ] Trocar marca ou modo reestiliza a peça sem gerar de novo.
- [ ] Peça idêntica no editor, na miniatura e no box da ótica.
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

- [ ] Do cadastro à primeira peça na TV em **menos de 10 minutos**, guiado.
- [ ] Toda tarefa principal em 3 toques no celular de 360 px.
- [ ] Nenhum recurso perdido: cada página antiga tem endereço novo ou redirect.
- [ ] Testado em Android e iPhone, em 4G fraco.

---

## 6 · Modelo comercial

Números de partida — validar com o contador, com o advogado e com o app de
orçamento do dono antes de publicar.

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
  cada criação consome.

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
- [ ] Todo o CSS do player em unidades de container; aposentar a mistura de
      `vw`, `clamp(px)` e `cqw`.
- [ ] Margem segura contra overscan, **ajustável por tela** no painel.
- [ ] Retrato de primeira classe (vitrine de ótica usa TV de pé).
- [ ] Matriz de teste: 720p, 1080p, 4K; paisagem e retrato; box e navegador.

**24/7:**
- [ ] 72 horas seguidas no box, medindo a memória do WebView de hora em hora.
- [ ] Tirar da tomada 10 vezes; voltar sozinho em todas.
- [ ] Vídeo normalizado no upload (H.264 1080p, bitrate máximo).
- [ ] Cortar a internet por 24 h; nada some.
- [ ] Expediente: tela apaga fora do horário (menos desgaste, menos alerta falso).

**Operação:**
- [ ] **Alerta proativo de tela offline** por e-mail e WhatsApp, em minutos —
      o cliente sabe por nós antes de descobrir sozinho.
- [ ] Print remoto da tela para ver a parede sem ir à loja.
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

- [ ] `pg_dump` diário do Postgres para o R2, com teste de restauração.
- [ ] Canal estável/beta por tela; a ótica e o cliente de 3 telas no estável.
- [ ] Box do dono rodando o player em beta, como bancada de teste.

---

## 11 · Regras para quem for executar

- **Um PR por etapa**, pequeno, com os testes passando (847 hoje) e
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
