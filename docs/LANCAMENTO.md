# Prontidão para lançar como SaaS

Revisão do estado atual e o que falta para operar comercialmente. Legenda:
🔴 bloqueador · 🟡 importante · 🟢 desejável.

## O que já está pronto (base sólida)
- **Auth**: senha com scrypt+salt, sessão em cookie HttpOnly/SameSite (Secure sob HTTPS), rate limit em signup/login/pareamento/IA.
- **Multi-tenant** com Postgres (isolamento por `tenant_id`).
- **Billing** Stripe-ready (checkout + webhook assinado) + simulador dev; planos free/pro/business com **limite de telas** aplicado no pareamento.
- **Player** offline-first (service worker), pareamento na nuvem, tempo real (SSE), formatos (16:9/9:16/1:1), tema adaptativo.
- **Conteúdo**: tipos ricos, **IA** (kit de campanha multi-formato, campanha, dayparts, datas, composição, visão de exemplos), **editor tipo Canva**, aniversariantes automáticos, captura de janela/HDMI, PPTX/PDF, **exportar PNG**.
- Deploy no Railway + Postgres.

## Bloqueadores (resolver antes de vender)
- 🔴 **Mídia em disco efêmero.** `STORAGE=disk` grava em `data/media`. No Railway o disco **reinicia a cada deploy** → uploads (logos, fotos de aniversário, referências, kits) **somem**. Correção: montar um **Volume persistente** do Railway no diretório `data/` (config, sem código) **ou** migrar para object storage (S3/Cloudflare R2). Sem isso há perda de dados.
- 🔴 **E-mail transacional inexistente.** Convites são só por **código** (o dono repassa manualmente). Sem: **reset de senha**, verificação de e-mail, entrega de convite, avisos de cobrança. Integrar um provedor via HTTP (Resend/SendGrid/SES) — sem dependência pesada.
- 🔴 **Reset de senha.** Não existe. Depende do e-mail acima.
- 🔴 **Legal / LGPD.** Hoje só uma frase "concorda com os termos". Faltam: **Termos de Uso**, **Política de Privacidade**, consentimento de cookies e mecanismos LGPD (**exportar** e **excluir** os dados do titular). Obrigatório no Brasil (dados pessoais: e-mails, fotos e aniversários de funcionários).

## Importantes (logo após lançar)
- 🟡 **Verificação de e-mail** no cadastro.
- 🟡 **Landing page de vendas** (pitch, planos, CTA). Hoje `/` leva ao app; falta a página que converte visitante em cliente.
- 🟡 **Backups do Postgres** confirmados/agendados; teste de restauração.
- 🟡 **Monitoramento de erros** (ex.: Sentry) + logs estruturados.
- 🟡 **Testes automatizados + CI** (não há nenhum) — ao menos smoke dos fluxos críticos (login, pareamento, publicar, gerar IA).
- 🟡 **Headers de segurança** (HSTS, CSP, X-Content-Type-Options) e revisão de CORS.
- 🟡 **Suporte**: o link "Suporte" na sidebar é `#`. Definir canal (e-mail/WhatsApp/base de ajuda).
- 🟡 **Domínio próprio** + e-mail do domínio (custom domain no Railway).

## Desejáveis (maturidade)
- 🟢 **Onboarding guiado** pós-cadastro (parear 1ª tela, criar 1ª campanha).
- 🟢 **Trial** do plano pago + telas de upgrade/downgrade e paywall.
- 🟢 **Proof-of-play / relatórios** (o que tocou, quando) — forte para venda corporativa.
- 🟢 **Grupos de telas** + publicar para o grupo (o "30 telas em 30s" de verdade).
- 🟢 **Rate limit distribuído** (hoje é em memória por processo; ao escalar para várias instâncias, migrar para Redis).
- 🟢 **Reinício/reload automático** das telas; modo quiosque; retrato de verdade.
- 🟢 **PPTX auto-avanço** (conversão server-side para imagens/PDF).

## Ordem sugerida
1. Volume persistente da mídia (1 config no Railway) — **hoje**.
2. E-mail transacional + reset de senha.
3. Termos + Privacidade + LGPD (exportar/excluir dados).
4. Landing de vendas + verificação de e-mail.
5. Backups, monitoramento, testes/CI, headers de segurança.
