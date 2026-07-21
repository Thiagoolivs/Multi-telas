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
| 🔴 | ✅ | Player sem offline/cache | **Feito**: `sw.js` (shell pré-cacheado + `/media` cache-first) + config em cache no player (boot offline usa a última boa) + pré-download da playlist. Falta endurecer com player nativo. | Confiabilidade = a venda |
| 🔴 | ✅ | Telemetria/heartbeat inexistente — dashboard é mock | **Feito**: coluna `last_seen` + `POST /heartbeat` (player pulsa a cada 30s); Telas e Visão geral agora usam dados reais (frota, online/offline, armazenamento) + alertas derivados. Mock removido. | Produto real, upsell |
| 🔴 | ⬜ | SSE `subscribers` em memória (single instance) | Redis Pub/Sub ou broker gerenciado | Realtime confiável ao escalar |
| 🔴 | ✅ | Sem rate limit; login brute-force; cookie sem `Secure` | **Feito**: rate limit em memória em login (20/15min por IP + 10/15min por conta), cadastro (10/h) e pareamento (15/10min); cookie `Secure` sob HTTPS; códigos com RNG criptográfico. Falta Redis ao escalar horizontal. | Segurança básica |
| 🔴 | ✅ | Sem billing/planos/limites por tenant | **Feito**: catálogo de planos (Grátis 1 / Pro 5 / Business 25 telas), colunas de billing no tenant, `server/billing.js` Stripe-ready (checkout + webhook assinado via fetch, sem SDK) com **checkout simulado** quando não há chave, página de Plano no painel (uso, upgrade, portal) e **enforcement no pareamento** (402 acima da cota). Falta ligar as chaves do Stripe em produção. | Monetização |
| 🟠 | ✅ | Pareamento brute-forçável; device anônimo ilimitado | **Feito**: rate limit no pareamento + código só vale com a TV viva (heartbeat < 10min, no lugar de TTL fixo) + device token em header e comparação em tempo constante. Limite de devices anônimos por IP fica p/ depois. | Integridade multi-tenant |
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
