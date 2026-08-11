# Proposta de cobrança — MultiTelas

Segunda versão. A primeira calculava só o custo de IA sobre a receita e
chamava isso de margem — não é. Faltavam Stripe, imposto, servidor,
armazenamento, banda, inadimplência e o seu tempo de suporte. Agora a conta é
completa, e cada premissa está declarada para você trocar e ver o que muda.

Há uma calculadora junto desta proposta onde todos os números abaixo são
editáveis.

---

## 1 · O que existe hoje, e onde vaza

| | Hoje |
|---|---|
| Planos | Grátis (1 tela), Pro R$ 149 (5 telas), Business R$ 499 (25 telas) |
| O que muda entre eles | **Só o número de telas** |
| Armazenamento | 5 GB por conta — igual para o grátis e para o Business |
| IA | **11 endpoints, ilimitados, de graça, para qualquer conta** |
| Enterprise | Não existe |

R$ 499 para 25 telas são **R$ 20 por tela**. A faixa de mercado de signage no
Brasil é R$ 50 a R$ 200 por tela. O preço de hoje não está barato — está errado.

---

## 2 · O princípio que decide todo o resto

> **A tela nunca para.**

Crédito acabado, cartão recusado, fatura vencida — nada disso apaga a parede de
uma recepção. O que já foi publicado continua rodando, o player continua
recebendo publicação, a música continua tocando.

A cobrança controla a **criação assistida por IA**, e só ela. O editor manual,
o upload e o publicar continuam inteiros. Um cliente sem crédito não fica sem
produto — fica sem o atalho.

Signage fica visível o dia todo para os funcionários e os clientes do seu
cliente. Uma tela que apaga por causa de uma fatura é a pior propaganda
possível, e o prejuízo de reputação é maior que a fatura.

---

## 3 · A base de custo, inteira

### 3.1 O que sai de cima da receita, antes de qualquer custo

| | % | Observação |
|---|---|---|
| Stripe Brasil | 3,99% + R$ 0,39 | cartão, por cobrança |
| Simples Nacional | ~8% | Anexo III faixa 2; começa em 6% e sobe com o faturamento |
| Inadimplência e estorno | 2% | cartão recusado, chargeback |
| **Total** | **~14%** | |

Isto é o mais importante e o mais esquecido: **de cada R$ 100 faturados, entram
R$ 86** antes de você pagar um único servidor.

### 3.2 Custo fixo mensal (o piso)

Existe mesmo com zero cliente.

| Item | Custo |
|---|---|
| Railway — aplicação + banco | R$ 250 |
| Resend — e-mail transacional | R$ 108 |
| Cloudflare R2 — base | R$ 0 |
| Domínio + DNS | R$ 4 |
| Monitoramento de erros | R$ 40 |
| **Piso** | **~R$ 400/mês** |

Acima de ~500 telas simultâneas, o piso sobe para ~R$ 900 (container maior e
réplica de leitura do banco). Por tela, o piso **cai** conforme você cresce.

### 3.3 Custo por tela, por mês

| Item | Custo | Por quê |
|---|---|---|
| Banda (saída de mídia) | **R$ 0** | O R2 não cobra egress |
| Armazenamento | R$ 0,24 | ~3 GB por tela × R$ 0,081/GB |
| Requisições | < R$ 0,05 | pulso a cada 30 s = 86.400/mês, mais o SSE |
| Compute marginal | ~R$ 0,30 | já dentro do piso até certa escala |
| **Total** | **~R$ 0,60** | usando o valor conservador |

**A banda de graça é a vantagem estrutural do negócio.** Numa TV que baixa
mídia o dia todo, a saída de dados seria o maior custo variável: as mesmas
~800 MB por tela/mês na AWS S3 custariam R$ 0,39 por tela. No R2 custam zero.
Isso é o que permite um preço por tela competitivo com margem alta — e é uma
decisão de arquitetura que já está tomada neste repositório
(`server/storage.js`, driver S3-compatível apontando para o R2).

Se algum dia o storage migrar para a AWS, **o preço por tela precisa subir**.
Vale deixar isso escrito.

### 3.4 Custo por conta, por mês

| Item | Custo |
|---|---|
| Crédito de IA (imagem) | R$ 0,20 cada |
| Suporte, Essencial | R$ 8 — 5 min a R$ 100/h |
| Suporte, Pro | R$ 25 — 15 min |
| Suporte, Enterprise | R$ 400 — 4 h |

**O suporte é o maior custo variável de uma conta pequena.** Não é intuitivo, e
é o que decide o preço de entrada: uma conta de uma tela custa R$ 0,60 de
infraestrutura e R$ 8 a R$ 25 do seu tempo.

---

## 4 · A unidade de IA: crédito

Um crédito ≈ **uma imagem gerada**, porque a imagem é a única coisa da IA que
custa dinheiro de verdade.

| Ação | Custo real | Cobra? |
|---|---|---|
| Gerar imagem | ~R$ 0,20 | **1 crédito** |
| Campanha completa pelo diretor de arte | R$ 0,20 × peças | **1 por peça** |
| Briefing conversado, plano de campanha | ~R$ 0,05 | livre |
| Reescrever texto, variações de headline | ~R$ 0,01 | livre |
| Kit de marca, faixas do dia, sazonais | ~R$ 0,05 | livre |
| Diagnóstico de tela | ~R$ 0,02 | livre |

**Por que o texto continua livre.** Uma campanha inteira de texto custa cerca de
cinco centavos — menos que a taxa fixa do Stripe (R$ 0,39) na transação que
cobraria por ela. E o texto é o que traz a pessoa de volta ao produto: quanto
mais ela conversa com o briefing, mais campanha gera — e campanha gera imagem,
que é o que cobra. Guardas: limite por hora e teto diário por conta, contra
laço infinito. Não é preço, é proteção.

**Regras:** falha não cobra; o número aparece antes (“esta campanha vai usar 6
créditos, você tem 42”); regenerar é uma imagem nova e o botão diz isso.

---

## 5 · Os planos

| | **Grátis** | **Essencial** | **Pro** | **Enterprise** |
|---|---|---|---|---|
| **Por tela/mês** | — | **R$ 79** | **R$ 149** | a combinar |
| Telas | 1 | 1 a 49 | 1 a 49 | 50+ ou requisito especial |
| Créditos de IA | 5, uma vez | 10 por tela | 25 por tela | negociado |
| Armazenamento | 500 MB | 2 GB/tela | 10 GB/tela | a combinar |
| Player, layouts, agendamento | ✓ | ✓ | ✓ | ✓ |
| Editor manual, upload | ✓ | ✓ | ✓ | ✓ |
| Datas comemorativas, aniversariantes | ✓ | ✓ | ✓ | ✓ |
| Diretor de arte (campanha por IA) | prova | ✓ | ✓ | ✓ |
| Mural por QR | — | ✓ | ✓ | ✓ |
| Trilha sonora | — | ✓ | ✓ | ✓ |
| Marca própria (kit, tema derivado) | — | — | ✓ | ✓ |
| Equipe | 1 pessoa | 3 | ilimitada | ilimitada |
| Relatório de exibição | — | — | ✓ | ✓ |
| Suporte | comunidade | e-mail, 2 dias úteis | prioritário, 1 dia útil | canal direto com SLA |

A franquia de crédito é **por tela** (com o mínimo de uma tela). Faz sentido
porque quem tem mais telas produz mais conteúdo, e mantém a margem estável em
qualquer tamanho de conta.

### Desconto por volume, por faixa

Como imposto de renda, e não como cupom: **só as telas daquela faixa** recebem
o desconto dela.

| Telas | Desconto | Essencial | Pro |
|---|---|---|---|
| 1 a 4 | — | R$ 79,00 | R$ 149,00 |
| da 5ª à 9ª | −10% | R$ 71,10 | R$ 134,10 |
| da 10ª à 19ª | −18% | R$ 64,78 | R$ 122,18 |
| da 20ª em diante | −25% | R$ 59,25 | R$ 111,75 |

A primeira versão desta proposta aplicava o desconto da faixa a **todas** as
telas, e um teste pegou o defeito antes de virar tabela de preço: no
Essencial, 19 telas a −18% davam R$ 1.230 e 20 telas a −25% davam R$ 1.185.
**Vinte telas custariam menos que dezenove** — o cliente teria vantagem em
desligar uma tela, e a receita cairia quando a conta crescesse.

Por faixa, cada tela a mais custa sempre um valor positivo, e o preço médio
por tela cai suavemente:

| Conta | Total/mês | Média por tela |
|---|---|---|
| Essencial, 5 telas | R$ 387,10 | R$ 77,42 |
| Pro, 10 telas | R$ 1.388,68 | R$ 138,87 |
| Pro, 20 telas | R$ 2.600,05 | R$ 130,00 |
| Pro, 50 telas | R$ 5.952,55 | R$ 119,05 |

**Anual: dois meses grátis** (−16,7%). Reduz cancelamento e antecipa caixa.

**Cliente que já existe entra no preço antigo e fica.** Aumentar preço de quem
já assinou queima a base que te trouxe até aqui.

---

## 6 · Enterprise: como cotar sem chutar

“A combinar” só funciona se você tiver uma fórmula. Sem ela, o preço vira
função do seu humor no dia da reunião — e é assim que se fecha contrato no
prejuízo.

### Quando é Enterprise

Qualquer um destes gatilhos, mesmo com poucas telas:

- 50 telas ou mais
- Exige SLA em contrato, com multa
- Passa por processo de compras, contrato jurídico próprio, nota com empenho
- Marca branca (domínio e logo do cliente)
- SSO corporativo (Entra ID, Google Workspace, Okta)
- Dados em região específica, servidor dedicado ou instalação no cliente
- Rede de franquias — várias empresas sob um contrato
- Integração com sistema interno (ERP, RH, BI)
- Treinamento presencial

### A fórmula

**1. Piso da conta: R$ 1.500/mês.** Cobre gerente de conta, SLA e o custo de
existir um contrato. Enterprise sem piso é Pro com desconto.

**2. Por tela, por faixa:**

| Telas | Por tela/mês |
|---|---|
| 50 a 99 | R$ 69 |
| 100 a 299 | R$ 52 |
| 300 a 999 | R$ 42 |
| 1.000+ | R$ 34 |

**3. Adicionais, mensais:**

| | |
|---|---|
| Marca branca (domínio e logo do cliente) | +R$ 900 |
| SSO corporativo | +R$ 450 |
| Suporte com WhatsApp/telefone, resposta em 1 h | +R$ 700 |
| SLA 99,9% com multa contratual | +20% sobre o total |
| Servidor dedicado ou região própria | +custo real × 2,5 |
| Integração com sistema interno | projeto à parte, R$ 180/h |

**4. Únicos:**

| | |
|---|---|
| Implantação assistida | R$ 150 por tela |
| Treinamento presencial | R$ 2.500/dia + deslocamento |

**5. Créditos:** franquia negociada, **nunca abaixo de R$ 0,70 por crédito**.

**6. Contrato:** 12 meses mínimo, pagamento anual ou trimestral antecipado,
reajuste anual pelo IPCA, 60 dias de aviso para cancelar.

### A regra de ouro

> **Nunca feche abaixo de custo marginal × 3,3** (margem de 70%).

O custo marginal por tela no Enterprise é R$ 0,60 de infraestrutura mais os
créditos: com 15 créditos por tela, R$ 3,60. O piso absoluto por tela é
portanto **R$ 12**.

Repare que R$ 34 por tela na faixa de mil telas ainda está quase três vezes
acima desse piso. **O que sustenta o preço não é o custo — é o valor.** O custo
só diz onde é proibido descer, e serve para você negociar sabendo exatamente
quanto pode ceder.

### O que não dar no desconto

Ceder preço por tela é reversível. Ceder **SLA, região dedicada, integração e
treinamento** cria trabalho recorrente seu que nenhum desconto recupera. Se
precisar dar desconto, dê no preço por tela e mantenha os adicionais.

---

## 7 · Créditos avulsos

| Pacote | Preço | Por crédito | Margem depois de taxas |
|---|---|---|---|
| 25 créditos | R$ 39 | R$ 1,56 | 85% |
| 100 créditos | R$ 129 | R$ 1,29 | 82% |
| 500 créditos | R$ 499 | R$ 1,00 | 77% |

Assinatura de créditos, para quem usa sempre:

| | Preço/mês | Por crédito |
|---|---|---|
| +100 por mês | R$ 99 | R$ 0,99 |
| +300 por mês | R$ 249 | R$ 0,83 |

**O que expira:** a franquia mensal do plano expira no fim do ciclo — é o que
faz a assinatura valer todo mês. **Crédito comprado nunca expira**: foi pago, e
expirar gera revolta, chamado e reembolso. Gasta primeiro a franquia, depois o
comprado, para que ninguém perca o que pagou.

**Recarga automática:** opcional, desligada por padrão, e com **teto mensal
obrigatório**. Sem o teto é uma armadilha, e armadilha vira estorno.

---

## 8 · Quando o crédito acaba

**Continua:** todas as telas exibindo e recebendo publicação, a música, o editor
manual inteiro, o upload, o mural, os aniversariantes, o agendamento, e todo o
texto por IA.

**Para:** gerar imagem nova, e fechar uma campanha do diretor que precisa de
imagem.

No lugar do botão: *“Seus créditos acabaram. Suas telas continuam no ar.”* — com
comprar pacote, subir de plano, e continuar sem imagem. Essa última opção
importa: o diretor de arte deve saber montar a campanha com as imagens que o
cliente já tem na biblioteca. Sem crédito o produto fica menos automático, não
fica quebrado.

---

## 9 · Armazenamento

Passa a acompanhar o plano, e a cota é **por conta, somando as telas** — 5 telas
no Pro dão 50 GB no total, não 10 GB isolados por tela.

Excedente: **R$ 2,50 por GB/mês** (custo: R$ 0,081), com aviso em 80% e em 100%.
Ao estourar, o upload novo é bloqueado; o que já está lá continua tocando.

Vídeo é o que enche cota. Vale converter automaticamente para um formato mais
leve no upload: bom para o cliente, porque a TV engasga menos, e bom para você.

---

## 10 · A margem, cenário por cenário

Margem de contribuição = receita − taxas e imposto − IA − infraestrutura −
suporte. Ainda **não** desconta o piso de R$ 400.

| Cenário | Receita | Taxas | IA | Infra | Suporte | **Margem** | **%** |
|---|---|---|---|---|---|---|---|
| Essencial, 1 tela | R$ 79 | R$ 11 | R$ 2 | R$ 1 | R$ 8 | **R$ 57** | **72%** |
| Essencial, 5 telas | R$ 387 | R$ 55 | R$ 10 | R$ 3 | R$ 8 | **R$ 311** | **80%** |
| Pro, 1 tela | R$ 149 | R$ 21 | R$ 5 | R$ 1 | R$ 25 | **R$ 97** | **65%** |
| Pro, 10 telas | R$ 1.389 | R$ 195 | R$ 50 | R$ 6 | R$ 25 | **R$ 1.113** | **80%** |
| Pro, 20 telas | R$ 2.600 | R$ 364 | R$ 100 | R$ 12 | R$ 25 | **R$ 2.099** | **81%** |
| Enterprise, 100 telas | R$ 6.700 | R$ 938 | R$ 300 | R$ 60 | R$ 400 | **R$ 5.002** | **75%** |
| Pacote de 500 créditos | R$ 499 | R$ 70 | R$ 100 | — | — | **R$ 329** | **66%** |

**O pior caso é o Pro de uma tela, em 65%** — porque uma conta pequena carrega
sozinha o custo do suporte prioritário. É saudável, e é bom saber qual é o
cliente mais magro da carteira.

**A margem melhora conforme a conta cresce**, porque o suporte é por conta e a
receita é por tela.

### Quando o piso é pago

R$ 400 por mês de custo fixo, divididos pela margem de cada conta:

| Só com | Contas para pagar o piso |
|---|---|
| Essencial de 1 tela | 8 |
| Pro de 1 tela | 5 |
| Essencial de 5 telas | 2 |
| Pro de 10 telas | 1 |

**Cinco a oito clientes pequenos pagam toda a infraestrutura.** A partir daí, ~75% de cada real
novo é margem.

### O que pode estragar a conta

| Risco | Defesa |
|---|---|
| Conta grátis gerando imagem em massa | 5 créditos, uma vez só; sem cartão, o limite tem que ser baixo |
| Laço no cliente chamando geração sem parar | Teto diário por conta, independente de saldo |
| Contas grátis acumulando armazenamento | Arquivar conta inativa há 60 dias, avisando por e-mail |
| Imagem ficar mais cara no fornecedor | O crédito é uma abstração sua: muda o custo, não muda a tabela |
| Suporte estourando o previsto | É o custo que mais escapa. Meça minutos por conta desde o primeiro mês |
| Imposto subir de faixa | A 14% vira 17% quando passar de R$ 180 mil/ano. Reveja o preço antes, não depois |
| Migrar do R2 para a AWS | Volta a pagar banda. O preço por tela sobe junto |

---

## 11 · Como implementar

1. **Medir sem cobrar.** Tabela `uso_ia` (conta, tipo, créditos, custo estimado,
   referência, quando) em toda chamada. Nada bloqueia. Duas a quatro semanas de
   dados reais valem mais que qualquer estimativa desta proposta, inclusive as
   minhas.
2. **Saldo e extrato.** Colunas de saldo na conta (franquia do ciclo e
   comprado), débito no mesmo lugar onde a imagem já é registrada —
   `server/midia.js` é o caminho único, então o gancho é um só. Tela de Consumo
   no painel. Ainda sem bloquear.
3. **O bloqueio.** Só depois do extrato estar certo e do cliente ter aprendido a
   ver o saldo, com aviso de 80% por e-mail antes.
4. **Preço por tela no Stripe.** Assinatura com `quantity` = número de telas;
   mudança de plano ou quantidade é proração automática. Pacotes de crédito são
   pagamento avulso. Um webhook para cada.
5. **Pacotes e recarga automática**, com o teto obrigatório.
6. **Enterprise** não precisa de código: é contrato, nota manual e um plano
   `enterprise` com limites configuráveis por conta.

**Uma decisão precisa vir antes do passo 4:** o que acontece quando o cliente
reduz o número de telas. Proposta: as excedentes ficam **suspensas**, não
apagadas — param de receber publicação, o conteúdo fica guardado, e o cliente
escolhe quais. Apagar tela de cliente por causa de downgrade não tem desfazer.

---

## 12 · O que eu não recomendo

| Ideia | Por que não |
|---|---|
| Cobrar por token | O cliente não sabe o que é, não consegue prever a conta, e o valor não paga a confusão |
| Franquia acumulando para sempre | Vira passivo: 800 créditos guardados podem ser gastos num mês em que o cliente já cancelou |
| Crédito comprado com validade | Economiza pouco, custa caro em suporte e reputação |
| Cobrar por tela ativa medida por pulso | Uma queda de internet de uma semana vira desconto, e a cobrança passa a depender da rede do cliente. Cobre por tela pareada, com um jeito fácil de desparear |
| Marca d'água no plano grátis | Em signage a tela é o produto na parede de uma empresa. Não converte, ofende — e o grátis já é limitado a uma tela |
| Enterprise sem piso mensal | Vira Pro com desconto, e o custo do contrato fica com você |

---

## 13 · O que medir a partir do primeiro mês

- **Minutos de suporte por conta.** É o custo que mais escapa e o que decide o
  preço de entrada.
- Créditos usados pela conta média — calibra a franquia.
- Quantas contas encostam no limite. Se quase ninguém encosta, a franquia está
  generosa demais para ser argumento de upgrade.
- Conversão do bloqueio: quem viu “acabou” comprou, subiu de plano, ou sumiu.
- Custo real por imagem, contra os R$ 0,20 assumidos aqui.
- Telas por conta ao longo do tempo — é a alavanca principal da receita.
- GB por tela — calibra a cota e o excedente.

---

## Resumo

De cada R$ 100 faturados entram R$ 86, e o piso de infraestrutura é R$ 400 por
mês. Preço por tela (R$ 79 e R$ 149) com desconto por volume, crédito de IA
atrelado à imagem, que é a única coisa que custa, e franquia por tela para a
margem não depender do tamanho da conta. Enterprise com piso de R$ 1.500 e uma
fórmula, para “a combinar” não virar “a chutar”.

A margem de contribuição fica entre **65% e 80%** em todos os cenários, e sete
clientes pequenos pagam toda a infraestrutura.

E, acima de tudo o resto: **a tela nunca para.**
