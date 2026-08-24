# Documentação de Implementação (Tarefas 6 ao 11)

Este documento registra as alterações arquiteturais e as funcionalidades desenvolvidas pelo agente Antigravity na aplicação MultiTelas.

## Tarefa 6: Verificação de E-mail no Cadastro
**Objetivo:** Impedir cadastros falsos garantindo que a conta só seja criada após a verificação do e-mail.
- **Banco de Dados (`db-sqlite.js` / `db-postgres.js`):** Criada a tabela `verifications` para armazenar o token, o payload de cadastro (nome, e-mail, senha) e a data de expiração.
- **E-mail (`server/mail.js`):** Criado o template `verificationEmail(link)` para envio do token.
- **Rotas (`server/routes/auth.js`):**
  - **`POST /api/auth/signup`:** Modificado para não criar a conta (tenant/operador) imediatamente. Agora, salva o payload na tabela temporária, gera um token e dispara o e-mail. Retorna HTTP 202 (Accepted).
  - **`POST /api/auth/verify`:** Nova rota. Recebe o token, valida a expiração, cria o Tenant, o Operador, define o cookie de sessão e limpa o token usado.

## Tarefa 7: Gateway Asaas (Substituição do Stripe)
**Objetivo:** Suportar Pix e Boleto bancário substituindo a engine de pagamentos internacional (Stripe) pela Asaas.
- **Integração Backend (`server/billing.js`):** 
  - Atualizadas as chamadas da API (`/v3/customers` e `/v3/subscriptions`).
  - `billingType` enviado como `UNDEFINED` para deixar a decisão de pagamento (Pix, Boleto, Cartão) para a tela de fatura (Invoice) da Asaas.
- **Tratamento de Webhooks:**
  - O processamento de webhook escuta o header `asaas-access-token`.
  - Tratamento de status: `PAYMENT_RECEIVED` (Plano `active`), `PAYMENT_OVERDUE` (Plano `past_due`), `PAYMENT_DELETED` (Plano `canceled`).
- **Persistência (`plans.js`, `db.js`):** Substituído `stripe_customer_id` pelos IDs nativos da Asaas.

## Tarefa 8: Modularização do `server.js`
**Objetivo:** Reduzir a complexidade do arquivo de roteamento central.
- **Separação de Contexto:** Extraídas as rotas de Autenticação (`/api/auth/*`) para `server/routes/auth.js` e as de Equipe (`/api/team/*`) para `server/routes/team.js`.
- **Injeção de Dependências:** `server.js` agora monta um objeto de contexto (`ctx`) que injeta instâncias como `db`, `mail`, `auth`, `rateLimit`, sendo passadas aos submódulos.

## Tarefa 9: Medição Real de Texto (Font Metrics)
**Objetivo:** Substituir aproximações grosseiras da largura de texto pelo cálculo exato do arquivo de fonte (para não causar vazamento de caixas visuais).
- **Módulo `fontkit` (`package.json`):** Adicionada dependência nativa capaz de extrair glifos de arquivos WOFF2.
- **Motor de Medição (`server/font-metrics.js`):** Construído um wrapper que lê os arquivos físicos (`.woff2`) em cache e calcula o *advance width* real dos glifos somados ao kerning e tracking da configuração (letter-spacing).
- **Composer (`server/composer.js`):** A lógica `cabeNaCaixa` foi refeita usando `font-metrics` ao invés de cálculos arbitrários.

## Tarefa 10: Editor Visual Avançado (Máscaras, Curvas e Formas em Imagens)
**Objetivo:** Permitir recorte, formato e manipulação geométrica avançada de elementos no painel.
- **UI (`web/src/components/content/CompositionEditor.jsx`):** Unificado o comportamento visual das imagens aos das formas puras. Imagens agora ganharam um campo **"Máscara"** (para se tornarem elipses, triângulos, losangos, etc.) e o comportamento de CSS `clipPath` aplicado ao preview em tela (função `shapeClip`).
- **Backend (`server/composer.js`):** O saneamento do modelo JSON agora aceita, padroniza e passa adiante a propriedade `shape` também para objetos que contêm imagens (`tipo === 'imagem'`).

## Tarefa 11: Visão da IA na Peça Pronta (Avaliação Multimodal)
**Objetivo:** Que a IA consiga olhar para o layout renderizado, julgar legibilidade, contraste e dar uma nota visual.
- **Frontend (`CompositionEditor.jsx`):** 
  - Adicionado o botão **Análise IA** na barra de ferramentas.
  - Ao clicar, o navegador renderiza o documento atual para um PNG invisível (`compositionToCanvas`) em resolução cheia.
  - PNG convertido para Base64 e disparado por POST.
- **Backend (`server/ai.js`, `server.js`):** 
  - Nova rota `POST /api/ai/analise-visual`.
  - O payload Base64 é enviado diretamente para a API `gemini-2.5-flash` usando `inlineData` (Multimodal).
  - Um prompt de sistema assume a "Persona de Diretor de Arte", e retorna um objeto JSON contendo `{ "nota": X, "analise": "texto" }`, formatado e renderizado no modal do cliente.
