# Pix Mídia — análise competitiva

Estudo do concorrente **Pix Mídia / ImidiaTV** (pixmidia.com.br) e o que dele
serve ao MultiTelas: oferta, precificação, comunicação, atendimento e
experiência. Complementa [`REFERENCIA-CONCORRENTES.md`](REFERENCIA-CONCORRENTES.md),
que compara features com a OptiSigns; aqui o recorte é **comercial**.

> **Método e limite.** O domínio `pixmidia.com.br` está bloqueado pela política
> de egress desta sessão — não foi possível abrir as páginas diretamente. Todo o
> conteúdo abaixo veio de **busca web sobre as páginas deles** (o buscador lê e
> resume) e de fontes de terceiros (Capterra, Reclame Aqui, LinkedIn, Baguete,
> Claranet, Crunchbase). Cada afirmação com número está marcada com a origem.
> Preços de tabela **não são públicos** — o que existe é a faixa declarada no
> Capterra. Antes de decidir preço em cima disto, vale uma cotação disfarçada.

---

## 1 · Quem é

| | |
|---|---|
| Fundação | 2014, Esteio/RS — fusão de uma empresa de software com uma de comunicação interna |
| Fundadores | Cássio Hoffmann, Karine Santos, Hugo Ferreira, Renan Kreling |
| Investimento | **R$ 2,9 mi** (Domo Invest líder, Bossa Nova); acelerada pela Ventiur |
| Escala declarada | **+850 empresas**, **+11.000 telas** (páginas mais antigas ainda dizem "500 empresas" e "650 clientes" — a base cresceu e o site não foi todo atualizado) |
| Selos | 1ª empresa de digital signage do Brasil parceira do **GPTW** (2018); entre as **100 startups mais atraentes** (2019); case de LGPD com a Claranet |
| Reputação | Capterra **4,8/5 em 114 avaliações**. Reclame Aqui: empresa verificada, **sem 10 reclamações** — reputação nem é calculada |

**Leitura:** não é um concorrente frágil. É uma empresa de 10+ anos, capitalizada,
com marca instalada no nicho de RH/Comunicação Interna e quase nenhum atrito
público. Não se ganha dela por frente; ganha-se por flanco.

### Posicionamento

Propósito declarado: *"criar conexões genuínas entre pessoas e empresas"*, visão
de *"um mundo sem ruídos na comunicação entre empresas e as pessoas que a
compõem"*. Eles **não se vendem como software de TV** — se vendem como
**plataforma cross-channel de comunicação interna e endomarketing**. A TV é um
canal dentro da narrativa.

> Isso é exatamente o reposicionamento que [`VISAO-PLATAFORMA.md`](VISAO-PLATAFORMA.md)
> propõe para nós — com uma diferença decisiva: **o canal deles é interno
> (colaborador), o nosso é externo (cliente final da PME)**. Mesma arquitetura
> narrativa, público oposto. Isso é bom: dá para copiar a estrutura sem competir
> pelo mesmo comprador.

---

## 2 · A arquitetura da oferta

Três produtos com marca própria, vendidos como uma plataforma só:

| Produto | O que é |
|---|---|
| **ImidiaTV** | TV corporativa / digital signage — o carro-chefe |
| **ImidiaApp** | App mobile do colaborador: feed, push, grupos por unidade/setor/cargo, curtidas e comentários, **Portal RH** (colaborador manda dúvida/sugestão, anônima ou não, e o RH responde) |
| **ImidiaWeb** | O mesmo do App, na tela do computador (intranet leve) |
| **ImidiaRH** (módulo) | Aniversariantes, boas-vindas, tempo de casa, vagas — **puxando do sistema de RH automaticamente** |

Declaram **12 módulos integrados**.

### Dentro do ImidiaTV

- **+200 templates** editáveis (algumas páginas dizem 400) e **+500 conteúdos
  pré-configurados**.
- **Grade de programação por arrastar** na linha do tempo; conteúdo diferente
  por turno e por dia da semana.
- **Gestão remota**: ver quais telas estão conectadas e o que cada uma exibe.
- **Integrações**: nativas com **Power BI, TOTVS, SAP, Teams**; **API REST
  documentada com webhooks**; dashboards de **Power BI, Looker Studio e Tableau
  colando a URL** — sem integração técnica.
- **Segurança**: credenciais (OAuth/API key) criptografadas e **nunca enviadas
  ao player**; HTTPS; permissões granulares para dados sensíveis de RH.
- **Escala declarada**: de 5 telas num escritório a centenas em múltiplas
  unidades, mesma interface.

### Hardware

Qualquer TV com HDMI **a partir de 32"** + **player Android** + internet.
Estimam **R$ 250–500 por player**. Sem hardware proprietário — e **no plano
Enterprise o player vai em comodato**, pré-configurado e testado.

**Este é o movimento comercial mais inteligente deles.** O comodato mata a
objeção de CAPEX e o medo de "não vou saber instalar", ao custo de logística e
estoque. É também a maior dependência operacional deles — e a nossa maior
vantagem estrutural, porque o **nosso player é o navegador**.

---

## 3 · Como cobram

O que dá para afirmar:

| Evidência | Fonte |
|---|---|
| **Não há tabela de preços no site.** Todo caminho leva a formulário de demonstração | site |
| Preço inicial declarado: **R$ 250/mês** (ou US$ 2/mês em outra moeda-base) | Capterra |
| **Demonstração gratuita** + **15 dias de teste sem limitações** | site |
| Licença por tela é o padrão do setor (Screencorp: "cada licença dá direito a uma TV") | concorrente |
| **Plano Enterprise inclui comodato do player** | site |
| Custo-benefício avaliado em **4,8/5** | Capterra |

**Modelo:** *sales-led* clássico de B2B corporativo — preço fechado por
negociação, degraus por número de telas e módulos, contrato provavelmente anual,
hardware embutido no topo da tabela.

**Programa de parceiros / white label:** revenda com a marca do parceiro
(rádios indoor, agências de publicidade, agências de endomarketing) e **valor
mensal por cliente enquanto durar a parceria** — receita recorrente para o
parceiro. É canal de distribuição de baixo custo de aquisição.

### Comparação com a nossa tabela ([`BILLING.md`](BILLING.md))

| | Pix Mídia | MultiTelas |
|---|---|---|
| Preço público | ❌ | ✅ (R$ 79 / R$ 149 por tela) |
| Entrada | ~R$ 250/mês | Grátis (1 tela) |
| Teste | 15 dias | Plano grátis permanente |
| Hardware | Player Android; comodato no Enterprise | Nenhum — navegador |
| Implantação | Projeto com o fornecedor | Autosserviço |
| SLA | Não publicado | Publicado por plano |

**Dois riscos nossos que essa comparação expõe:**

1. **Aos olhos de uma empresa média nós parecemos mais caros, não mais baratos.**
   5 telas no Essencial = R$ 387/mês contra "a partir de R$ 250". A resposta não
   é baixar preço — é **somar o CAPEX evitado na comparação**: 5 players ×
   R$ 250–500 = **R$ 1.250 a R$ 2.500 que o cliente não gasta conosco**. Isso
   precisa estar escrito na página de preços, não só na cabeça de quem vende.
2. **"A combinar" trabalha a favor deles em conta grande e contra eles em conta
   pequena.** Preço público é a nossa arma no varejo/PME e é de graça: já
   temos, só falta expor bem.

---

## 4 · Como se comunicam

Máquina de *inbound* madura, montada em camadas:

1. **Páginas de produto profundas** — `/produtos/tv-corporativa/` com filhas
   dedicadas (`/integracoes/`, `/dashboard-tv/`). Uma página por objeção.
2. **Guias-pilar de SEO** — `/guias/tv-corporativa/`, `/guias/mural-digital/`:
   conteúdo longo, "o que é / como funciona / benefícios por setor / como
   escolher o software". Capturam a busca de topo e empurram para o produto.
3. **Landing pages por aplicação** — `/lp/midia-indoor/`, `/lp/mural-digital/`,
   `/lp/sinalizacao-digital-varejo/`, `/lp/solucao-tv-corporativa/`.
4. **Blog segmentado** por tema (comunicação interna, endomarketing, digital
   signage) com centenas de posts.
5. **Materiais ricos** — kits e ebooks gratuitos para RH; **calendário de
   endomarketing em subdomínio próprio** (`calendario.pixmidiaendomarketing.com.br`).
6. **Podcast "Endomarketing Brasil"** — site próprio, Spotify, YouTube, presença
   no CONARH. Constrói comunidade, não só lead.
7. **Prova social numérica no topo** — "+850 empresas", "+11.000 telas".
8. **Autoridade emprestada** — GPTW, 100 startups, case Claranet de LGPD.

**Tom:** institucional, consultivo, focado em benefício de negócio (engajamento,
clima, produtividade), não em feature. Vocabulário de RH, não de TI.

### A fraqueza visível

O site acumulou **páginas quase duplicadas** ao longo dos anos:
`/tv-corporativa/`, `/tv-corporativa-para-empresas/`, `…-v1`, `…-v2`,
`/imidiatv/`, `/software-tv-corporativa/`, `/lp/solucao-tv-corporativa/`,
`/solucoes-para-comunicacao-interna`, `/conteudos/…` e `/blog/…` com o mesmo
tema. Isso **canibaliza a própria autoridade** e mostra números
desatualizados em páginas antigas ("500 empresas") ao lado dos atuais ("850").

> Não copiar. Nossa vantagem barata é **poucas páginas, cada uma definitiva**.

### Canais de contato

Formulário de contato, formulário de demonstração, `marketing@pixmidia.com.br`,
suporte por telefone/e-mail/chat e webinars. **Nenhum WhatsApp público
encontrado** — para PME brasileira, isso é um buraco.

---

## 5 · Atendimento ao cliente — onde eles ganham e onde dá para bater

**Eles ganham em:** nota **4,9/5 em atendimento no Capterra** (a maior das quatro
notas) e quase zero reclamação pública. Atendimento humano é o ativo deles.

**O que isso significa para nós:** não dá para vencer prometendo "atendimento
bom" — o padrão do setor já é alto. Dá para vencer **não precisando de
atendimento**, e transformando o suporte de reativo em proativo.

### O que copiar deles

- **Player pré-configurado e testado antes de sair.** Versão nossa, sem estoque:
  um **guia de hardware homologado** ("compre este TV Box de R$ 250, ele
  funciona") e um instalador de um passo.
- **Portal RH do ImidiaApp** — canal de mão dupla, o colaborador fala e alguém
  responde. Nosso análogo é o **mural por QR** que já está previsto no plano
  Essencial: em vez de só receber recado, virar canal com resposta.
- **Webinars recorrentes** de uso do produto. Barato e reduz ticket.

### O que fazer melhor (ordem de impacto por esforço)

1. **Alerta proativo de tela offline.** A tela caiu → e-mail/WhatsApp em minutos,
   antes de o cliente descobrir. Eles vendem "ver se a tela está conectada"; nós
   avisamos sem ninguém olhar. É o item de suporte com maior retorno percebido e
   já é barato com o heartbeat previsto no [`PLANO-SAAS.md`](PLANO-SAAS.md).
2. **Onboarding dentro do produto, não projeto.** Checklist de 5 passos com meta
   explícita: **primeira tela no ar em menos de 10 minutos**, sem reunião.
   Enquanto eles agendam demonstração, o nosso cliente já publicou.
3. **WhatsApp como canal oficial** de comercial e suporte, com horário e SLA
   escritos. Eles não têm. No Brasil, para PME, isso decide venda.
4. **SLA público na página de preços.** Já existe na nossa tabela ("e-mail 2 dias
   úteis / prioritário 1 dia útil / canal direto"). Publicar é diferencial contra
   quem não publica nada.
5. **Central de ajuda pública e indexável**, com vídeos de 60s por
   funcionalidade. Serve ao suporte e ao SEO ao mesmo tempo.
6. **Relatório mensal automático por e-mail**: "sua tela ficou no ar 99,2%,
   exibiu X conteúdos, o mais visto foi Y". É QBR sem consultor — e é o gancho
   natural para vender a próxima tela.
7. **Nunca desligar a tela por fatura.** Já é princípio declarado no
   `BILLING.md`. É argumento de venda: escrever na página, não deixar no doc.

---

## 6 · Experiência do produto — o que pegar

| Deles | Nosso estado | Ação |
|---|---|---|
| Dashboard por URL (Power BI, Looker, Tableau) | ⬜ | **Alto valor, baixo custo.** Colar URL e exibir. Mata a objeção corporativa inteira |
| Integração com RH (TOTVS/SAP) para aniversariantes e boas-vindas | 🔄 temos aniversário/agenda manuais | Começar por **CSV/Google Sheets**, não por TOTVS. 90% do valor, 5% do trabalho |
| API REST + webhooks documentados | ⬜ | Necessário para conta média. Documentar cedo, mesmo pequena |
| +500 conteúdos prontos, +200 templates | 🔄 biblioteca menor + geração por IA | **Nossa resposta é a IA**, e ela ataca justamente a reclamação nº 1 deles (ver abaixo) |
| Grade por arrastar, conteúdo por turno/dia | ✅ temos | Comunicar melhor |
| Monitoramento de telas conectadas | 🔄 previsto | Ver item 1 do atendimento |
| Segmentação por unidade/setor/cargo (App) | ⬜ | Nosso análogo: **grupos de telas** por loja/unidade |
| Relatórios de exibição | ⬜ | Já priorizado no `REFERENCIA-CONCORRENTES.md`. Confirmado como item de venda corporativa |

### A brecha mais explorável

As **duas críticas recorrentes** nas avaliações do Capterra são sobre **conteúdo**:

> *"um ponto de melhoria é sobre a qualidade e diversidade dos materiais (mídias)"*
> *"há poucas opções de inserção de materiais sugeridos pela grade, frente a outros concorrentes"*

Ou seja: **o cliente que paga por uma biblioteca de 500 conteúdos ainda acha que
falta conteúdo.** Biblioteca estática não escala — sempre falta o caso
específico daquela empresa naquela semana.

É exatamente o problema que a nossa **campanha por IA em um clique** resolve, e
é onde o discurso deve morar:

> Eles têm 500 conteúdos prontos. Nós geramos o **501º**, com a sua marca, no
> seu tom, sobre o que está acontecendo hoje na sua loja.

Somado a isso: as **13 datas comemorativas com decorações** que já temos são o
nosso "calendário de endomarketing" — só que **dentro do produto**, executando
sozinho, em vez de um PDF para o cliente baixar e fazer à mão.

---

## 7 · O que copiar, o que não copiar

### Copiar

1. **Estrutura de site**: `/produtos` com páginas-filhas por objeção + `/guias`
   pilar + `/lp` por aplicação + `/cases` + `/parcerias`. Poucas e boas.
2. **Prova social numérica no topo** de tudo (telas ativas, empresas, uptime).
3. **Programa de parceiros com recorrência** — agências e integradores como
   canal. Custo de aquisição baixo e encaixa com marca própria (já é feature do
   plano Pro).
4. **Guia-pilar de SEO** para cada termo grande do nosso lado (mídia indoor para
   varejo, cardápio digital, vitrine digital).
5. **Módulo de datas/pessoas automatizado** (aniversário, boas-vindas) puxando
   de planilha.
6. **Vocabulário de resultado**, não de feature: eles citam estudo de +30% de
   venda no produto anunciado no PDV. Nós precisamos do nosso número.

### Não copiar

1. **Esconder preço.** É a vantagem que temos de graça.
2. **Comodato de hardware.** Vira estoque, logística, RMA e capital parado.
3. **Enxame de landing pages duplicadas.** Já viraram passivo de SEO para eles.
4. **Vender para RH de grande empresa.** Ciclo longo, RFP, jurídico, TI. Nosso
   público é a PME que decide na mesma semana.
5. **Trial de 15 dias em vez de plano grátis.** O grátis permanente com 1 tela é
   melhor motor de PLG e já está definido.

---

## 8 · Posicionamento sugerido contra eles

| Eixo | Pix Mídia | MultiTelas |
|---|---|---|
| Comprador | RH / Comunicação Interna | Dono / gerente de PME e varejo |
| Público da tela | Colaborador | **Cliente final** |
| Jornada | Demonstração → proposta → projeto | Cadastro → tela no ar em 10 min |
| Conteúdo | Biblioteca + templates | **Gerado por IA, sob a marca** |
| Hardware | Player Android (comodato no topo) | **Nenhum — navegador** |
| Preço | Fechado, sob consulta | **Público, por tela** |
| Suporte | Humano, muito bem avaliado | **Proativo e automatizado** |

Frase de posicionamento para teste:

> **A Pix Mídia digitalizou o mural do RH. Nós digitalizamos a vitrine.**

---

## 9 · Próximos passos sugeridos

**Agora (semanas, alto retorno)**

- [ ] Página de preços com **comparativo de CAPEX** (player que você não compra)
      e **SLA publicado**.
- [ ] **WhatsApp** oficial de comercial e suporte, com horário visível.
- [ ] **Alerta de tela offline** por e-mail (usa o heartbeat já planejado).
- [ ] Checklist de onboarding no produto com meta de **10 minutos**.

**Curto prazo (roadmap)**

- [ ] **Dashboard por URL** (Power BI / Looker / Google Sheets).
- [ ] **Relatório de exibição** (proof-of-play) — já era prioridade 1 no doc de
      concorrentes, agora confirmada.
- [ ] **Datas e pessoas por planilha** (aniversário, admissão) automatizadas.
- [ ] **Guia de hardware homologado** + instalador de um passo.

**Médio prazo**

- [ ] **Guia-pilar de SEO** por vertical (varejo, restaurante, clínica, academia).
- [ ] **Programa de parceiros** com marca própria e recorrência.
- [ ] **Relatório mensal automático** por e-mail para cada conta.
- [ ] **Central de ajuda** pública com vídeos curtos.

---

## Fontes

Site da Pix Mídia lido via busca: páginas `/`, `/produtos/tv-corporativa/`,
`/produtos/tv-corporativa/integracoes/`, `/produtos/tv-corporativa/dashboard-tv/`,
`/imidiatv/`, `/imidiaapp/`, `/imidiaweb/`, `/guias/tv-corporativa/`,
`/guias/mural-digital/`, `/lp/…`, `/parcerias/`, `/somos-a-pix-midia/`,
`/cases-de-sucesso/`, `/contato/`, `/solicitacao-de-demonstracao/`, `/blog/`.

Terceiros: Capterra Brasil (perfil iMídiaTV — notas, preço inicial, prós e
contras), Reclame Aqui (perfil Pix Mídia Soluções em Tecnologia), Baguete
(captação de R$ 2,9 mi), Domo.vc e Ventiur (investimento), Claranet (case LGPD),
LinkedIn, Apple Podcasts / endomarketingbrasil.com, Screencorp e B2B Stack
(referência de mercado).
