# Proposta de cobrança — MultiTelas

Proposta, não implementação. Os números são um ponto de partida calibrado no
custo real de cada chamada, com a conta aberta para você mover o preço e ver o
que acontece.

---

## 1 · O que existe hoje, e onde vaza

| | Hoje |
|---|---|
| Planos | Grátis (1 tela), Pro R$149 (5 telas), Business R$499 (25 telas) |
| O que muda entre eles | **Só o número de telas** |
| Armazenamento | 5 GB por conta — **igual para o grátis e para o Business** |
| IA | **11 endpoints, ilimitados, de graça, para qualquer conta** |

Três furos, em ordem de gravidade:

1. **A IA não é medida.** Uma conta grátis pode gerar mil imagens. Cada imagem
   tem custo de verdade, e é a única coisa no sistema que tem.
2. **O armazenamento não segue o plano.** 5 GB de graça é mais do que muitos
   clientes pagantes vão usar.
3. **O preço não acompanha o cliente.** Quem tem 6 telas paga o mesmo que quem
   tem 25. Quem tem 26 não tem para onde ir.

---

## 2 · O princípio que decide todo o resto

> **A tela nunca para.**

Crédito acabado, cartão recusado, fatura vencida — nada disso pode apagar a
parede de uma recepção. O que já foi publicado continua rodando, o player
continua recebendo publicação, a música continua tocando.

O que a cobrança controla é a **criação assistida por IA**, e só ela. O editor
manual continua inteiro, o upload continua funcionando, publicar continua
funcionando. Um cliente sem crédito não fica sem produto — fica sem o atalho.

Isso não é generosidade. Signage é um produto que fica visível o dia todo para
os funcionários e os clientes do seu cliente. Uma tela que apaga por causa de
uma fatura é a pior propaganda possível, e o prejuízo de reputação é maior que a
fatura.

---

## 3 · A unidade: crédito

Um crédito ≈ **uma imagem gerada**. É o modelo mental mais simples possível, e é
honesto porque a imagem é de fato o que custa.

### O que consome, e o que não consome

| Ação | Custo real (estimado) | Cobra? |
|---|---|---|
| Gerar imagem | ~R$ 0,20 | **1 crédito** |
| Campanha completa pelo diretor de arte | ~R$ 0,20 × nº de peças + R$ 0,05 | **1 crédito por peça** |
| Briefing conversado, plano de campanha | ~R$ 0,05 | livre |
| Reescrever texto, gerar variações de headline | ~R$ 0,01 | livre |
| Gerar kit de marca, faixas do dia, sazonais | ~R$ 0,05 | livre |
| Diagnóstico de tela | ~R$ 0,02 | livre |

**Por que não medir o texto.** Uma campanha inteira de texto custa cerca de
cinco centavos — menos que a taxa do Stripe na transação que cobraria por ela.
Medir isso adicionaria contabilidade, tela de saldo, mensagem de bloqueio e
suporte, tudo para recuperar um valor que não paga o próprio processamento. E o
texto livre é o que faz a pessoa voltar ao produto: quanto mais ela conversa
com o briefing, mais campanha ela gera — e campanha gera imagem, que é o que
cobra.

Guardas para o texto não virar buraco: limite por conta e por hora, e um teto
diário. Não é preço, é proteção contra laço infinito.

### Regras do crédito

- **Falha não cobra.** Geração que voltou vazia, recusada ou com erro não
  desconta. Cobrar por imagem que não veio é o jeito mais rápido de perder a
  confiança no medidor inteiro.
- **O preço aparece antes.** "Esta campanha vai usar 6 créditos. Você tem 42."
  Nada é debitado sem a pessoa ter visto o número.
- **Regenerar cobra.** Pedir de novo é uma imagem nova. Fica claro no botão.

---

## 4 · Os planos: preço por tela

Preço **por tela, por mês**. É como o cliente pensa ("tenho quatro telas") e é
como a receita acompanha o crescimento dele sem renegociação.

| | **Grátis** | **Essencial** | **Pro** | **Rede** |
|---|---|---|---|---|
| **Por tela/mês** | — | **R$ 79** | **R$ 129** | a partir de R$ 89, anual |
| Telas | 1 | 1 a 20 | 1 a 20 | 10+ |
| Armazenamento | 500 MB | 2 GB/tela | 10 GB/tela | 25 GB/tela |
| Créditos de IA/mês | 5, uma vez | 10 | 60 | 500 (uso justo) |
| Player, layouts, agendamento | ✓ | ✓ | ✓ | ✓ |
| Editor manual, upload | ✓ | ✓ | ✓ | ✓ |
| Datas comemorativas, aniversariantes | ✓ | ✓ | ✓ | ✓ |
| Diretor de arte (campanha por IA) | prova | ✓ | ✓ | ✓ |
| Mural por QR | — | ✓ | ✓ | ✓ |
| Trilha sonora | — | ✓ | ✓ | ✓ |
| Marca própria (kit, tema derivado) | — | — | ✓ | ✓ |
| Equipe | 1 pessoa | 3 | ilimitada | ilimitada |
| Relatório de exibição | — | — | ✓ | ✓ |
| Suporte | comunidade | e-mail | prioritário | canal direto |

**Desconto por volume**, automático, sem negociar:

| Telas | Desconto |
|---|---|
| 1–4 | — |
| 5–19 | −15% |
| 20+ | fala com a gente (Rede) |

**Anual: dois meses grátis** (−16,7%). Reduz cancelamento e antecipa caixa,
que é o que mais falta no começo.

### Como isso se compara ao de hoje

| Cliente | Hoje | Proposto | |
|---|---|---|---|
| 1 tela | R$ 149 (Pro) | R$ 129 (Pro) | mais barato para entrar |
| 5 telas | R$ 149 | R$ 548 (Pro, −15%) | **3,7×** |
| 12 telas | R$ 499 | R$ 1.315 (Pro, −15%) | **2,6×** |
| 25 telas | R$ 499 | Rede, ~R$ 2.225 | **4,5×** |

O salto é grande porque o preço de hoje está errado, não porque a proposta é
cara: R$ 499 para 25 telas são R$ 20 por tela, abaixo de qualquer concorrente
de signage no Brasil (a faixa é R$ 50–200 por tela).

**Cliente que já existe entra no preço antigo e fica.** Aumentar preço de quem
já assinou queima a base que te trouxe até aqui. O preço novo vale para conta
nova, e quem já é cliente migra quando quiser (ou quando precisar de um recurso
que só existe lá).

---

## 5 · Créditos: franquia, pacote, e o que expira

### Pacotes avulsos

| Pacote | Preço | Por crédito |
|---|---|---|
| 25 créditos | R$ 39 | R$ 1,56 |
| 100 créditos | R$ 129 | R$ 1,29 |
| 500 créditos | R$ 499 | R$ 1,00 |

### Assinatura de créditos (para quem usa sempre)

| | Preço/mês | Por crédito |
|---|---|---|
| +100 créditos/mês | R$ 99 | R$ 0,99 |
| +300 créditos/mês | R$ 249 | R$ 0,83 |

### O que expira

- **A franquia mensal do plano expira no fim do ciclo.** É o que faz a
  assinatura valer a pena todo mês.
- **Crédito comprado nunca expira.** Foi pago. Expirar gera revolta, chamado de
  suporte e reembolso — custa mais do que o crédito vale.
- **Gasta primeiro a franquia**, depois o comprado. Assim o crédito que expira
  é sempre o primeiro a sair, e ninguém perde o que pagou.

### Recarga automática (opcional, desligada)

Quando o saldo chega a zero, compra o pacote escolhido sozinho. **Com teto
mensal obrigatório** definido pelo cliente. Sem o teto isso é uma armadilha, e
uma armadilha vira estorno.

---

## 6 · Quando o crédito acaba

O que **continua**, sem exceção:

- Todas as telas exibindo, recebendo publicação, tocando música.
- O editor manual inteiro.
- Upload de imagem e vídeo.
- Mural, aniversariantes, agendamento, datas comemorativas.
- Todo o texto por IA (briefing, headline, reescrita).

O que **para**:

- Gerar imagem nova.
- Fechar uma campanha do diretor que precisa de imagem.

E aparece, no lugar do botão: *"Seus créditos acabaram. Suas telas continuam
no ar."* — com comprar pacote, subir de plano, e continuar sem imagem.

Essa última opção importa: o diretor de arte deve saber montar a campanha
usando imagens que o cliente já tem na biblioteca. Sem crédito o produto fica
menos automático, não fica quebrado.

---

## 7 · Armazenamento

Hoje são 5 GB para qualquer conta, inclusive a grátis. Passa a acompanhar o
plano (a tabela acima), e a cota é **por conta, somando as telas** — quem tem 5
telas no Pro tem 50 GB no total, não 10 GB por tela isolados.

Excedente: **R$ 4 por GB/mês**, cobrado por uso, com aviso em 80% e em 100%. Ao
estourar, o upload novo é bloqueado — o que já está lá continua tocando.

Vídeo é o que enche cota. Vale oferecer conversão automática para um formato
mais leve ao subir, que é bom para o cliente (a TV engasga menos) e bom para nós.

---

## 8 · A conta fecha?

Custo por crédito: **~R$ 0,20** (imagem + as tentativas que falham + a fatia de
texto que anda junto).

| Cenário | Receita/mês | Custo de IA | IA sobre a receita |
|---|---|---|---|
| Essencial, 1 tela, franquia toda usada | R$ 79 | R$ 2 | 2,5% |
| Pro, 1 tela, franquia toda usada | R$ 129 | R$ 12 | 9,3% |
| Pro, 5 telas, franquia toda usada | R$ 548 | R$ 12 | 2,2% |
| Rede, 15 telas, 500 créditos | R$ 1.428 | R$ 100 | 7,0% |
| Pacote de 500 créditos, todo usado | R$ 499 | R$ 100 | 20% (margem 80%) |

O pior caso é o Pro de uma tela que usa cada crédito da franquia, e mesmo ele
fica em 9%. Na prática a maioria não usa a franquia inteira, e a margem real
fica bem acima disso.

**A margem melhora conforme o cliente cresce**, porque a franquia é por conta e
a receita é por tela. Um cliente que vai de 3 para 12 telas quadruplica a
receita sem aumentar o custo de IA.

**O que pode estragar a conta**, e o que fazer:

| Risco | Defesa |
|---|---|
| Conta grátis gerando imagem em massa | 5 créditos, uma vez, e cartão não é pedido — então limite baixo mesmo |
| Laço no cliente chamando geração sem parar | Teto diário por conta, independente de saldo |
| Imagem ficar mais cara no fornecedor | O crédito é uma abstração nossa: muda quanto custa a imagem, não muda o preço da tabela |
| Cliente comprar 500 créditos e usar em um dia | Já está pago, e a margem é 80% |

---

## 9 · Como implementar

Em ordem, cada fatia entregando sozinha.

**Fatia 1 — medir sem cobrar.** Tabela `uso_ia` (tenant, tipo, créditos,
custo estimado, referência, quando) e registro em toda chamada. Nada bloqueia
ainda. Duas a quatro semanas de dados reais valem mais que qualquer estimativa
desta proposta, inclusive as minhas — e talvez mostrem que os números aqui
estão errados.

**Fatia 2 — saldo e extrato.** Colunas de saldo no tenant (franquia do ciclo +
comprado), débito no mesmo lugar onde a imagem já é registrada
(`server/midia.js` é o caminho único, então o gancho é um só). Tela de
Consumo no painel. Ainda sem bloquear.

**Fatia 3 — o bloqueio.** Só depois que o extrato estiver certo e o cliente
tiver aprendido a ver o saldo. Com o aviso em 80% mandado por e-mail antes.

**Fatia 4 — preço por tela no Stripe.** Assinatura com `quantity` = número de
telas; mudar de plano ou de quantidade é proração automática do Stripe.
Pacotes de crédito são pagamento avulso. Um webhook para cada.

**Fatia 5 — pacotes e recarga automática.**

**Decisão que precisa vir antes da fatia 4:** o que acontece quando o cliente
reduz o número de telas. Proposta: as telas excedentes ficam **suspensas**, não
apagadas — param de receber publicação, o conteúdo fica guardado, e o cliente
escolhe quais suspender. Apagar tela de cliente por causa de downgrade é o tipo
de coisa que não tem desfazer.

---

## 10 · O que eu não recomendo

**Cobrar por token.** O cliente não sabe o que é token, não consegue prever a
conta, e o valor em jogo não paga a confusão.

**Franquia acumulando para sempre.** Vira passivo: um cliente com 800 créditos
guardados pode gastar tudo num mês em que já cancelou.

**Crédito comprado com validade.** Economiza pouco e custa caro em suporte e
em reputação.

**Cobrar por tela ativa medida por heartbeat.** Parece justo e é uma armadilha:
uma queda de internet de uma semana vira desconto, e a cobrança passa a depender
da rede do cliente. Cobra por tela pareada, e dá um jeito fácil de desparear.

**Marca d'água no plano grátis.** Em signage a tela é o produto na parede de uma
empresa. Marca d'água não converte, ofende — e o grátis já é limitado a uma tela.

---

## 11 · O que medir depois de subir

- Quantos créditos a conta média usa por mês (calibra a franquia).
- Quantas contas encostam no limite (se quase ninguém encosta, a franquia está
  generosa demais para ser um argumento de upgrade).
- Conversão do bloqueio: quem viu "acabou" comprou pacote, subiu de plano, ou
  sumiu.
- Custo real por imagem, comparado com os R$ 0,20 assumidos aqui.
- Telas por conta ao longo do tempo — é a alavanca principal da receita.

---

## Resumo

Preço por tela, com desconto por volume. Crédito de IA em cima, atrelado ao que
de fato custa dinheiro — a imagem — e franquia mensal em cada plano, generosa no
Pro e à vontade no Rede. Texto continua livre porque medir custaria mais que
cobrar. Pacote avulso para quem estoura, sem validade, gasto depois da franquia.

E, acima de tudo o resto: **a tela nunca para.**
