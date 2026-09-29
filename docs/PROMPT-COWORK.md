# Prompt para o Cowork — configurar a produção do MultiTelas

Copie tudo abaixo da linha e cole numa conversa nova do Cowork.

---

Você vai configurar a produção do **MultiTelas**, um SaaS de TV corporativa
(digital signage) que roda no **Railway** (Node + Postgres). O código já está
pronto; falta a configuração que só o dono pode fazer: contas, chaves, DNS e
variáveis de ambiente. Trabalhe no meu navegador, nos painéis de cada serviço.

## Regras (valem para a conversa inteira)

1. **Pare e me pergunte antes de:** criar conta, aceitar termos, informar
   CNPJ ou dados bancários, contratar qualquer coisa paga, comprar domínio, ou
   apagar/alterar algo que já exista. Eu confirmo cada um.
2. **Segredos nunca aparecem no chat.** Chave de API, token e senha vão direto
   do painel de origem para a variável no Railway. Não repita o valor em
   mensagens, resumos ou arquivos. Para confirmar, diga só os 4 primeiros
   caracteres.
3. **Nada de inventar valor.** Se precisar de um dado que não tem (domínio,
   e-mail, nome da empresa), pergunte.
4. Faça **uma etapa por vez**, na ordem abaixo. No fim de cada uma, me diga
   em 1–2 linhas o que ficou feito e o que falta.
5. Se um painel estiver diferente do que está descrito aqui, não adivinhe:
   me mostre o que está vendo e pergunte.

## Antes de começar, me pergunte

- Qual é o **domínio** (ex.: `multitelas.com.br`)? Já está comprado? Onde (Registro.br, Cloudflare…)?
- Qual **e-mail** será o do operador da plataforma (`ADMIN_EMAILS`)?
- Qual **e-mail de suporte** público (`SUPPORT_EMAIL`)?
- Qual **número de WhatsApp** comercial/suporte?
- Nome legal da empresa e CNPJ (só para o Asaas; eu digito se preferir).

## Etapa 1 — Domínio apontando para o Railway

1. No Railway, abra o projeto do MultiTelas → serviço web → **Settings →
   Networking → Custom Domain**, adicione `app.<dominio>` (ou o domínio raiz,
   se eu preferir) e anote o registro CNAME que ele pedir.
2. No painel DNS do domínio, crie esse CNAME. Espere o Railway mostrar o
   certificado como emitido.
3. Variáveis no Railway (serviço web → **Variables**):
   - `APP_URL=https://<endereço final, sem barra no fim>`
   - `SUPPORT_EMAIL=<e-mail de suporte>`
   - `ADMIN_EMAILS=<e-mail do operador>`
   - `WHATSAPP_NUMERO=<só dígitos, com 55 e DDD>`

## Etapa 2 — Armazenamento de mídia (Cloudflare R2)

**Sem isto, toda imagem/vídeo dos clientes some no próximo deploy.**

1. Cloudflare → **R2** → criar bucket `multitelas-midia` (localização
   automática). Pergunte antes se a conta Cloudflare ainda não tem R2 ativado
   (pede cartão).
2. R2 → **Manage API Tokens → Create API token**, permissão **Object Read &
   Write**, restrito a esse bucket. Copie Access Key ID, Secret e o endpoint
   `https://<account-id>.r2.cloudflarestorage.com`.
3. Variáveis no Railway:
   - `STORAGE=s3`
   - `S3_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com`
   - `S3_BUCKET=multitelas-midia`
   - `S3_REGION=auto`
   - `S3_ACCESS_KEY_ID=…`
   - `S3_SECRET_ACCESS_KEY=…` (cuidado para não colar espaço ou quebra de linha)

## Etapa 3 — E-mail (Resend)

**Sem isto ninguém consegue se cadastrar** (a conta só nasce no link de confirmação).

1. resend.com → criar conta → **Domains → Add Domain** com o meu domínio.
2. Cadastrar no DNS os registros que o Resend mostrar (SPF, DKIM, retorno).
   Esperar ficar **Verified**.
3. **API Keys → Create**, permissão de envio.
4. Variáveis no Railway:
   - `RESEND_API_KEY=re_…`
   - `MAIL_FROM=MultiTelas <nao-responda@<dominio>>` — **tem que ser do domínio verificado**.

## Etapa 4 — Cobrança (Asaas)

1. asaas.com → criar conta da empresa (**pare e me pergunte** antes de
   informar CNPJ e conta bancária). A conta precisa estar aprovada para emitir cobrança.
2. Primeiro em **sandbox** (sandbox.asaas.com, conta separada): gerar chave de API.
3. **Integrações → Webhooks → Adicionar**:
   - URL: `<APP_URL>/api/billing/webhook`
   - Token de autenticação: gere um segredo longo e aleatório (40+ caracteres)
   - Versão v3 · Envio **sequencial** · Ativo
   - Eventos: `PAYMENT_RECEIVED`, `PAYMENT_CONFIRMED`, `PAYMENT_OVERDUE`,
     `PAYMENT_REFUNDED`, `PAYMENT_CHARGEBACK_REQUESTED`,
     `PAYMENT_CHARGEBACK_DISPUTE`, `SUBSCRIPTION_DELETED`
4. Variáveis no Railway:
   - `ASAAS_AMBIENTE=sandbox`
   - `ASAAS_API_KEY=$aact_…`
   - `ASAAS_WEBHOOK_TOKEN=<o mesmo segredo do passo 3>`
5. Me avise para eu fazer uma assinatura de teste no sandbox. Só depois que eu
   confirmar que funcionou: repetir os passos 2–4 na conta de **produção**,
   trocar as duas chaves e **apagar** `ASAAS_AMBIENTE`.

## Etapa 5 — IA

1. Google AI Studio (aistudio.google.com) → **Get API key**. Pergunte se devo
   ativar faturamento no projeto Google (a geração de imagem exige).
2. Variável: `GEMINI_API_KEY=…`

## Etapa 6 — Login com Google (opcional, pergunte se quero)

1. Google Cloud Console → APIs e serviços → **Tela de consentimento OAuth**
   (externa, nome MultiTelas, e-mail de suporte, domínio).
2. **Credenciais → Criar ID do cliente OAuth → Aplicativo da Web**.
   URI de redirecionamento autorizado: `<APP_URL>/api/auth/google/callback`.
3. Variáveis: `GOOGLE_CLIENT_ID=…`, `GOOGLE_CLIENT_SECRET=…`

## Etapa 7 — Alertas de erro (opcional)

Se eu usar Slack ou Discord: criar um **Incoming Webhook** num canal privado e
definir `ALERTA_WEBHOOK_URL=…`.

## Etapa 8 — Banco de dados e backup

1. No Railway, confirme que existe um serviço **Postgres** e que o serviço web
   tem `DATABASE_URL` referenciando ele (variável de referência, não colada).
2. Postgres → **Backups**: confirmar que estão ligados e com que frequência.
   Se o plano não tiver backup, me diga as opções e o custo.
3. **Teste de restauração:** restaure o backup mais recente num serviço
   Postgres NOVO (não no de produção), conecte e confira se a tabela `tenants`
   tem linhas. Depois apague só esse serviço de teste — com a minha confirmação.

## Etapa 9 — Conferir tudo

1. Faça um redeploy do serviço web e espere ficar verde.
2. Entre em `<APP_URL>/app` com o e-mail de `ADMIN_EMAILS` e abra a tela
   **Sistema** (`/sistema`). Todos os diagnósticos devem estar verdes, com
   exceção do jurídico. Me mostre o que estiver amarelo ou vermelho.
3. Crie uma conta de teste com um e-mail meu (ex.: `meu+teste1@…`) e confirme
   que o e-mail de confirmação chega.
4. Abra `<APP_URL>/tv` numa aba: deve aparecer um código de 6 dígitos.
   Pareie pelo painel e publique algo. Confirme que aparece na aba da TV.
5. Na tela **Marca**, cole o endereço do site de um cliente real e me diga se as
   cores e as fontes que saíram fazem sentido. (Isso nunca foi testado em
   produção.)

## O que NÃO é com você

- Revisão jurídica dos Termos: fica comigo e com o advogado. Só depois dela
  definimos `LEGAL_REVISADO=true` e `LEGAL_NOME=<razão social>`.
- **Nunca** defina `SKIP_VERIFY=1` em produção.
- **Nunca** coloque o mesmo e-mail em `ADMIN_EMAILS` e `CONTAS_CORTESIA` sem eu pedir: o primeiro dá acesso aos dados de todos os clientes.

## No final

Me entregue uma tabela: variável → definida (sim/não) → os 4 primeiros
caracteres (só para segredos) → serviço de origem. E a lista do que ficou pendente.
