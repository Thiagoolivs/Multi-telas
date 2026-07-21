# Auditoria técnica & de produto — MultiTelas

Documento **vivo**: revisão crítica do projeto + backlog priorizado. Atualizar o
campo **Status** conforme cada item for resolvido. Última revisão: 2026-07-20.

> Veredito curto: o **software** está acima da média em design e organização,
> mas o **produto de signage** ainda não faz o que faz signage funcionar no
> mundo real (offline, hardware dedicado, telemetria, pipeline de mídia,
> proof-of-play), e o **negócio** ainda não existe (sem billing, sem foco de
> mercado, sem distribuição). Resolver os **P0** antes de mais telas bonitas.

## Riscos estratégicos (não-código)

- **Crise de identidade:** o projeto tenta ser três empresas ao mesmo tempo —
  (a) signage para igrejas/PMEs BR, (b) SaaS de signage genérico à la
  Yodeck/OptiSigns, (c) plataforma de comunicação multicanal com IA. Escolher.
- **Único fosso real hoje:** localização BR + nicho igreja (Holyrics) +
  qualidade do editor. O resto é paridade (na verdade, defasagem) com os
  concorrentes.
- **Modelo de negócio inexistente:** sem billing, sem planos, sem limites por
  tenant, sem métrica de churn/CAC/LTV. Mercado é commoditizado (US$8–12/tela).
- **Bus factor = 1**, sem testes versionados, sem CI, sem runbook.

## Lacunas de Digital Signage (vs. Yodeck/OptiSigns/ScreenCloud/NoviSign)

| Capacidade | MultiTelas | Concorrentes |
|---|---|---|
| Player dedicado (Pi/Android/BrightSign/Tizen/webOS) | ❌ aba de browser | ✅ |
| Play offline / cache local | ❌ | ✅ |
| Proof-of-play / analytics | ❌ | ✅ |
| Pipeline de mídia (upload→CDN→pré-cache) | ❌ (base64 no config) | ✅ |
| Provisionamento em massa / MDM | ❌ | ✅ |
| Localização BR + Holyrics + Pix | ✅ (único) | ❌ |
| Qualidade do editor/design | ✅ (forte) | ~ |

## Backlog priorizado

Gravidade: 🔴 Crítico · 🟠 Alto · 🟡 Médio · 🟢 Baixo · Status: ⬜ aberto · 🔄 em andamento · ✅ feito

| Grav. | Status | Problema | Como resolver | Benefício |
|---|---|---|---|---|
| 🔴 | 🔄 | Mídia em base64 no config/DB (`admin.js` `readAsDataURL`) | **Feito no React**: `server/storage.js` (driver disco) + tabela `media` + upload streaming + `/media` cacheável; editor e Armazenamento usam URL (não base64). **Falta:** driver S3/R2 + CDN (costura pronta via `STORAGE=s3`) e pré-cache no device | Destrava vídeo, escala, offline |
| 🔴 | ⬜ | Player sem offline/cache (sem service worker) | Service worker + pré-download da playlist; roadmap p/ player nativo | Confiabilidade = a venda |
| 🔴 | ⬜ | Telemetria/heartbeat inexistente — dashboard é mock | Endpoint de heartbeat + tabela de eventos append-only; ligar dashboard a dados reais | Produto real, upsell |
| 🔴 | ⬜ | SSE `subscribers` em memória (single instance) | Redis Pub/Sub ou broker gerenciado | Realtime confiável ao escalar |
| 🔴 | ⬜ | Sem rate limit; login brute-force; cookie sem `Secure` | Rate limit (Redis) + lockout; `Secure`/`__Host-` no cookie | Segurança básica |
| 🔴 | ⬜ | Sem billing/planos/limites por tenant | Stripe/Pagar.me + enforcement de plano | Monetização |
| 🟠 | ⬜ | Pareamento brute-forçável; device anônimo ilimitado | Código com TTL + rate limit + confirmação no device | Integridade multi-tenant |
| 🟠 | ⬜ | Sem migrations; schema duplicado pg/sqlite | Drizzle/node-pg-migrate; uma fonte de schema | Evolução segura do DB |
| 🟠 | ⬜ | Sem validação de entrada (stringly-typed) | Zod nos endpoints; avaliar TS no backend | Robustez |
| 🟠 | ⬜ | Sem CI nem testes versionados | GitHub Actions + testes de API/E2E no repo | Qualidade contínua |
| 🟠 | ⬜ | Sem observabilidade | pino + Sentry + `/healthz` + request id | Operar em produção |
| 🟠 | ⬜ | Dashboard com dados/botões falsos (mock no bundle) | Ligar a dados reais; remover mock de produção | Percepção premium |
| 🟡 | ⬜ | Acessibilidade (focus trap no Dialog, aria, contraste AA do `ink-3`) | Focus trap, aria-modal, revisar contraste | Vendas enterprise/gov |
| 🟡 | ⬜ | Config last-write-wins (perda silenciosa) | Optimistic locking (version/updated_at) | Multiusuário confiável |
| 🟡 | ⬜ | "Convite por e-mail" não envia e-mail | Serviço de e-mail (Resend/SES) | Onboarding honesto |
| 🟡 | ⬜ | Device token na query string; compare não-timing-safe | Header `X-Device-Token` + `timingSafeEqual` | Reduz vazamento/risco |
| 🟢 | 🔄 | Dois front-ends (editor real ainda é o admin vanilla) | Centralizar edição de conteúdo no React | Consolidação |

## Segunda revisão — pontos que quase passaram

1. **Backup/DR do Postgres** — sem estratégia nem restore testado. 🔴 operacional.
2. **Custo de infra do SSE** — 1 conexão aberta por TV 24/7; a 10k telas o modelo
   de custo pode inviabilizar o pricing.
3. **Sandbox de iframe** no player (Holyrics/live) — clickjacking/exfiltração.
4. **Fuso horário no agendamento** — dayparting sem TZ por tela troca conteúdo na
   hora errada entre regiões.
5. **Conformidade enterprise** — SSO/SAML, RBAC granular, audit log, SOC2: nada.
6. **Multi-região/latência** — servidor único = ponto único de falha.

## Prioridade de execução sugerida

1. Pipeline de mídia (object storage + CDN) — destrava vídeo, offline e escala.
2. Telemetria de device (heartbeat) — torna o dashboard real.
3. SSE → Redis Pub/Sub.
4. Segurança básica (rate limit, cookie `Secure`, pareamento com TTL).
5. Billing + planos.
