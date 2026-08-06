# Prontidão para lançar como SaaS

Revisão do estado atual e o que falta para operar comercialmente. Legenda:
🔴 bloqueador · 🟡 importante · 🟢 desejável.

## O que já está pronto
- **Auth**: senha com scrypt+salt, sessão em cookie HttpOnly/SameSite (Secure sob HTTPS), rate limit em signup/login/pareamento/IA, **recuperação de senha** por e-mail e **login com Google**.
- **Multi-tenant** com Postgres (isolamento por `tenant_id`).
- **Billing** Stripe-ready (checkout + webhook assinado) + simulador dev; planos free/pro/business com **limite de telas** aplicado no pareamento.
- **Mídia persistente** em object storage (S3/Cloudflare R2, SigV4 próprio) — não some mais no deploy.
- **E-mail transacional** (Resend/Brevo) por HTTP, sem dependência pesada.
- **Player** offline-first (service worker), pareamento na nuvem, tempo real (SSE), formatos 16:9/9:16/1:1/21:9, tema adaptativo, **pré-carga da próxima mídia**.
- **Tema da tela sai da marca**: preset "Minha marca" (fundo, superfícies e texto derivados da cor da empresa) ou tingir qualquer preset mantendo o clima dele. Contraste calculado, nunca escolhido.
- **Rodapé personalizável**: cores próprias ou na cor da marca, selo e relógio opcionais, e manchete longa que rola em vez de ser cortada.
- **Motor de IA**: briefing → plano → imagens → composição → crítica dirigida, com design system próprio, validador de contraste/área segura e **identidade da marca** (cores, fontes, logo, acervo de fotos, referências de estilo). Roda como trabalho em segundo plano com progresso.
- **Campanhas como pastas**: renomear, duplicar, excluir e **publicar a campanha inteira** em várias telas.
- **LGPD**: Termos e Política versionados, aceite registrado (versão + data + IP), **exportar meus dados** e **excluir minha conta** (apaga banco e arquivos).
- 54 testes automatizados (`npm test`).
- Deploy no Railway + Postgres.

## Bloqueadores (resolver antes de vender)
- 🔴 **Revisão jurídica dos textos.** O conteúdo de `server/legal.js` descreve com precisão o que o sistema faz, mas é rascunho técnico. Um advogado precisa revisar; depois disso, definir `LEGAL_REVISADO=true` para o aviso de rascunho sair das páginas.

## Importantes (logo após lançar)
- 🟡 **Verificação de e-mail** no cadastro (o Resend já está pronto; falta o fluxo).
- 🟡 **Headers de segurança** — hoje há **zero** HSTS/CSP/X-Content-Type-Options no `server.js`.
- 🟡 **CI** — não há `.github/workflows`; os 45 testes só rodam se alguém lembrar.
- 🟡 **Landing page de vendas**. Hoje `/` leva ao app; falta a página que converte visitante em cliente.
- 🟡 **Backups do Postgres** confirmados/agendados; teste de restauração.
- 🟡 **Monitoramento de erros** (ex.: Sentry) + logs estruturados.
- 🟡 **Domínio próprio** + e-mail do domínio (`SUPPORT_EMAIL` ainda é pessoal).

## Qualidade da geração (o que mais melhora o produto)
- 🟡 **Auto-hospedar as fontes.** `js/theme.js` busca de `fonts.googleapis.com`. TV com rede ruim ou bloqueada cai na fonte de sistema, que é mais larga — e todo o cálculo de "cabe na caixa" do compositor vira estimativa errada. As fontes são OFL.
- 🟢 **A IA olhar a peça pronta.** A crítica de hoje lê o relatório do validador; renderizar em PNG e devolver pela visão pegaria colisão, respiro torto e logo sobre rosto — coisas que nenhum validador expressa.
- 🟢 **Prompt de imagem ciente do layout** ("deixe o terço inferior limpo"), em vez de remendar com véu depois.
- 🟢 **Medir o texto com as métricas reais da fonte** em vez da largura média por caractere.
- 🟢 **Recorte inteligente** da foto do acervo (hoje corta pelo centro).
- 🟢 **Coerência entre peças** — cada uma é composta isolada da anterior.

## Desejáveis (maturidade)
- 🟢 **Orientação da tela** guardada no pareamento (o filtro de formato ao publicar hoje assume paisagem).
- 🟢 **Onboarding guiado** pós-cadastro (parear 1ª tela, criar 1ª campanha).
- 🟢 **Trial** do plano pago + telas de upgrade/downgrade e paywall.
- 🟢 **Proof-of-play / relatórios** (o que tocou, quando) — forte para venda corporativa.
- 🟢 **Grupos de telas** + publicar para o grupo.
- 🟢 **Rate limit distribuído** (hoje é em memória por processo).
- 🟢 **Trabalhos de IA persistidos** (hoje vivem em memória; reinício perde o que está em voo).
- 🟢 **Chat de briefing em tempo real** e **créditos de IA** repassáveis ao cliente.
- 🟢 **PPTX auto-avanço** (conversão server-side para imagens/PDF).
- 🟢 Editor rico em React (portar o que resta do admin vanilla).

## Ordem sugerida
1. Revisão jurídica dos textos (é o único bloqueador).
2. Auto-hospedar as fontes — maior ganho de qualidade por esforço.
3. Headers de segurança + CI.
4. Verificação de e-mail + landing de vendas.
5. Backups testados e monitoramento.
