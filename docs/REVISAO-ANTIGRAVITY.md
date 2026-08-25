# Revisão do trabalho do Antigravity

Oito commits entraram na `main` entre 21 e 24/08. Esta é a leitura de cada um,
com o que foi consertado e o que ficou de fora.

Regra usada para separar o que é defeito novo do que já existia: `git show`
no commit anterior. Onde o buraco é antigo, está dito — não para dividir
culpa, e sim porque muda a urgência: o antigo já rodou em produção sem
estourar; o novo nunca rodou.

---

## 🔴 Bloqueiam a publicação

- [x] **1 · O plano era liberado antes do pagamento**
      `SUBSCRIPTION_CREATED` significa "assinatura criada", não "pago", e o
      handler concedia `plan` nele. Como `plans.podeParear` decide acesso só
      por `tenant.plan`, sem olhar `plan_status`, clicar em assinar já dava
      Pro: 49 telas e créditos, sem pagar.
      **Novo.** No Stripe o plano só era concedido em
      `checkout.session.completed`, que é pós-pagamento.
      → Agora `SUBSCRIPTION_CREATED` guarda apenas os identificadores. Plano
      só em `PAYMENT_RECEIVED`/`PAYMENT_CONFIRMED`.

- [x] **2 · Cadastro não terminava**
      O servidor passou a responder `202 { pendingVerification: true }` sem
      sessão, e a tela continuou chamando `onAuthed()` como se tivesse
      entrado. O app carregava sem sessão, `/api/auth/me` devolvia 401, e
      ninguém era avisado de conferir o e-mail.
      **Novo.**
      → A tela lê o 202 e mostra "confira seu e-mail" em vez de entrar.

- [x] **3 · Assinatura e cliente duplicados no Asaas**
      `createCheckout` criava cliente, criava assinatura e só então buscava a
      fatura. O `customerId` era gravado pelo chamador **depois** do retorno:
      se a busca da fatura falhasse, os dois já existiam no Asaas e nada
      ficava gravado aqui — a tentativa seguinte criava outro cliente e outra
      assinatura. Cobrança dobrada.
      **Novo.**
      → O cliente é gravado assim que é criado, antes de qualquer outra
      chamada, e uma assinatura já existente é reaproveitada em vez de virar
      a segunda.

## 🟠 Dinheiro errado

- [x] **4 · Conta com muitas telas pagava por uma**
      `value: p.precoTelaCents / 100` é o preço de **uma** tela. Dez telas no
      Essencial: cobrado R$ 79,00, devido R$ 736,28. Quarenta e nove: cobrado
      R$ 79,00, devido R$ 3.096,80.
      **Antigo** — o Stripe também mandava `quantity: 1` num preço fixo por
      plano. A diferença é que agora está numa linha só, à vista.
      → Passa a usar `plans.mensalidadeCents(planId, telas)`, que é a função
      que já existia e aplica as faixas de desconto.

- [x] **5 · A guarda de plano inválido nunca disparava**
      `p.priceCents` não existe em `plans.js` — o campo é `precoTelaCents`.
      `undefined <= 0` é `false`, então a guarda passava tudo, inclusive
      `plan: 'free'`, que no Asaas viraria assinatura de R$ 0,00. Em três
      lugares, mais o preço da página de checkout simulado, que mostrava
      `R$ NaN`.
      **Antigo.**

## 🟡 Furos de operação

- [x] **6 · Não havia como cancelar**
      O botão "Gerenciar assinatura (cartão, cancelamento)" está atrás de
      `mode === 'stripe'`, e `billing.mode()` devolve `'asaas'` ou `'dev'`.
      O botão nunca aparecia. Fora o problema de produto, cancelamento
      difícil é exposição no CDC. **Novo.**

- [x] **7 · `fetch` sem prazo no Asaas e no Gemini Vision**
      Nenhum `AbortController`. Serviço pendurado = requisição pendurada,
      que é a mesma classe do bug que deixou a API muda. **Novo.**

- [x] **8 · Sandbox escolhida por `NODE_ENV === 'development'`**
      Variável que este projeto não define em lugar nenhum. Testar com chave
      de sandbox batia na **API de produção**. **Novo.**
      → Passa a ser explícita: `ASAAS_AMBIENTE=sandbox`.

- [x] **9 · Token do webhook comparado com `!==`**
      Vazamento por tempo. O Stripe usava HMAC. **Novo.**
      → `crypto.timingSafeEqual`, com comprimento normalizado.

- [x] **10 · Métricas de fonte não funcionavam para 7 das 12 famílias**
      `familia.rotulo.toLowerCase().replace(/s+/g, '-')` — falta a barra
      invertida. Em vez de trocar espaço por traço, troca a letra "s":
      "Playfair Display" virava `playfair di-play`, "Poppins" virava
      `poppin-`. Nenhum arquivo casava, e a medição caía calada na
      estimativa — justamente nas fontes de display, que são as que mais
      erram. **Novo.**

- [x] **11 · Docs mandavam configurar Stripe**
      `LANCAMENTO.md` e `ESTADO-DO-PROJETO.md` ainda pediam
      `STRIPE_PRICE_*` e `STRIPE_WEBHOOK_SECRET`. Configurar o que eles
      mandam deixa a conta sem checkout nenhum.

---

## O que NÃO foi mexido, e por quê

- **A escolha do Asaas.** É decisão do dono, não erro. Nada aqui propõe
  voltar para o Stripe.
- **`podeParear` continua olhando só `tenant.plan`.** Consertar o item 1 na
  origem — não conceder plano sem pagamento — resolve sem mexer na regra de
  acesso de quem já tem conta. Exigir `plan_status` ali é mudança de
  comportamento para contas existentes, e essa é decisão do dono.
- **`PAYMENT_OVERDUE` não rebaixa o plano.** Marca `past_due` e deixa a tela
  no ar. É "a tela nunca para" aplicado à inadimplência, e parece
  deliberado.
- **Reenvio de webhook não é idempotente.** O Asaas reentrega, e reentregar
  `PAYMENT_RECEIVED` reescreve o mesmo estado — reescrever o que já está lá
  não faz estrago. Vira problema no dia em que um evento passar a somar
  crédito. Fica anotado.
- **`SKIP_VERIFY=1` pula a verificação de e-mail.** É como a suíte sobe o
  servidor. Se for parar em produção, o cadastro deixa de verificar e-mail —
  não é buraco de acesso, mas é variável perigosa de esquecer ligada.
- **Cadastro depende de SMTP configurado.** Sem `mail.configured()`, o
  e-mail de verificação só é registrado no log e ninguém consegue terminar
  o cadastro. Já estava na lista de lançamento; agora é bloqueante de
  verdade, não recomendação.

## Cobertura

Antes desta revisão, **nenhum teste tocava `server/billing.js`**.
`test/billing.test.js` testa a matemática de `plans.js`, que é outra coisa.
