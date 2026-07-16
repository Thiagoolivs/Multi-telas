# Plano — Multi-telas como SaaS (multi-tenant)

Documento de planejamento para evoluir o **Raft Mídia / Multi-telas** de um app
client-side (1 navegador = 1 instalação) para uma **plataforma SaaS multi-tenant**
com contas, dispositivos registrados, gestão na nuvem e cobrança.

> Status: **planejamento**. Nada aqui está implementado ainda. O produto atual
> (player + admin client-side) continua funcionando como está.

---

## 1. Visão

Hoje: cada TV lê a config do `localStorage` do navegador (ou de uma URL remota
apontada manualmente). Não há contas, login, nem registro de dispositivos.

Alvo: um SaaS onde **empresas (tenants)** criam conta, cadastram suas **telas
(devices)**, montam **playlists** na nuvem e as TVs **sincronizam sozinhas** —
com cobrança por número de telas.

### O que já é bom (reaproveitável) ✅

A parte cara — o **produto de signage** — já está pronta e é de qualidade:

- Motor de renderização robusto e isolado (`render.js`) — um conteúdo quebrado
  não derruba a tela.
- ~21 tipos de conteúdo, incluindo fontes ao vivo (HDMI/USB e stream/HLS).
- 9 temas premium com design tokens, superfície adaptativa, takeover de prioridade.
- Datas comemorativas + decorações, dados ao vivo sem chave de API.
- UX de gestão premium (drag, agendamento, favoritos, prévia ao vivo).
- Player leve, roda em hardware fraco.

**Estimativa de reaproveitamento: ~80% do front-end** (`render.js`, `theme.js`,
`seasons.js`, `templates.js`, todo o CSS e a engine do `player.js`). O que falta é
a **camada de plataforma**, não o produto.

### O que precisa ser construído 🔧

1. Contas + multi-tenancy (orgs, usuários, papéis)
2. Autenticação (login, convites, recuperação)
3. Registro de dispositivos (pareamento, status/heartbeat, ações remotas)
4. Config na nuvem (playlists por device/grupo) + push em tempo real
5. Mídia na nuvem (object storage + CDN) — sair do base64 no `localStorage`
6. Billing (Stripe, planos por nº de telas)
7. Player como cliente magro (token do device, cache offline, heartbeat, proof-of-play)

---

## 2. Arquitetura-alvo

```
┌── Dashboard (SPA)                 ┌── Player (TV / kiosk)
│   React/Next (ou admin.* atual)   │   player.* + token do device
│   auth · orgs · telas · billing   │   cache offline + heartbeat
└──────────┬─────────────────────────┴──────────┬────────────
           │ REST + WebSocket/SSE                │ pull config (cacheável no CDN)
           ▼                                     ▼
   ┌──────────────── API (stateless, Node/Fastify) ────────────────┐
   │  auth · orgs · devices · playlists · media · billing · realtime │
   └───┬──────────────┬───────────────┬────────────────┬────────────┘
       ▼              ▼               ▼                ▼
   Postgres        Redis         Object Storage      Stripe
 (multi-tenant   (cache +       (S3 / R2) + CDN     (assinaturas)
  row-level)      pub/sub        ← mídia + app do player
                  realtime)
```

### Princípios de escala

- **API stateless** atrás de load balancer → escala horizontal trivial.
- **Config do device servida via CDN/edge** (cache curto, ex.: 30–60s + ETag).
  Mesmo com milhares de TVs, elas puxam de cache — o banco quase não é tocado.
- **Realtime leve**: WebSocket/SSE só envia "invalide e rebusque"; o download real
  vem do CDN.
- **Mídia no object storage + CDN** (Cloudflare R2 / S3): uploads grandes nunca
  tocam o banco; entrega rápida e barata.
- **Postgres gerenciado** com isolamento por `tenant_id` (row-level security).

---

## 3. Modelo de dados (Postgres, esboço)

```
tenants        (id, nome, plano, stripe_customer_id, criado_em)
users          (id, tenant_id, email, senha_hash, papel, criado_em)
                 papel ∈ {owner, admin, editor, viewer}
devices        (id, tenant_id, nome, local, pairing_code, token_hash,
                status, last_seen_at, playlist_id, group_id, criado_em)
device_groups  (id, tenant_id, nome)         -- telas que compartilham config
playlists      (id, tenant_id, nome, layout_id, theme_jsonb, settings_jsonb)
zones          (id, playlist_id, zone_key, tipo)        -- principal, lateral, rodape…
items          (id, zone_id, ordem, type, props_jsonb, agendamento_jsonb, prioridade)
media_assets   (id, tenant_id, url, mime, bytes, criado_em)
proof_of_play  (id, tenant_id, device_id, item_id, exibido_em)  -- analytics
audit_log      (id, tenant_id, user_id, acao, alvo, criado_em)
```

Regras:

- **Toda tabela de conteúdo carrega `tenant_id`** e é filtrada por ele (RLS no
  Postgres garante isolamento mesmo com bug de query).
- O JSON de config que o player consome é **derivado** dessas tabelas (uma view /
  serializer que monta o mesmo formato que o `storage.js` já entende hoje —
  facilita o reaproveitamento do player).

---

## 4. API (endpoints principais)

**Auth / tenant**
```
POST /auth/signup            cria tenant + owner
POST /auth/login             → JWT (access + refresh)
POST /auth/invite            convida usuário para o tenant
```

**Dispositivos (pareamento)**
```
POST /devices/pair/start     TV pede um código → { pairing_code, device_token_tmp }
POST /devices/pair/claim     dashboard confirma o código → vincula ao tenant
GET  /devices                lista telas + status (online/offline)
POST /devices/:id/action     refresh | reboot | screenshot | identify
POST /devices/:id/heartbeat  (player) status, versão, playlist atual
```

**Conteúdo**
```
GET  /playlists              CRUD de playlists/telas
GET  /devices/:id/config     config resolvida do device (cacheável no CDN)
POST /media                  upload → object storage, retorna URL de CDN
```

**Billing**
```
POST /billing/checkout       Stripe Checkout (plano por nº de telas)
POST /billing/webhook        eventos do Stripe (assinatura, falha de pagamento)
```

### Fluxo de pareamento da TV (decisivo para vender)

1. TV abre o player sem device vinculado → chama `POST /devices/pair/start`.
2. Player mostra **código de 6 dígitos** grande na tela + QR.
3. No dashboard, o cliente digita/escaneia o código → `POST /devices/pair/claim`.
4. API vincula o device ao tenant, emite o **token definitivo** do device.
5. Player guarda o token (localStorage/IndexedDB) e passa a puxar sua config.

### Sincronização em tempo real

- Player abre um **WebSocket/SSE** autenticado pelo token do device.
- Ao salvar no dashboard, a API publica no Redis → empurra "config mudou" para os
  devices daquele tenant/grupo → player rebusca `GET /devices/:id/config`.
- Sem editar? O player revalida periodicamente via ETag (barato, cacheado no CDN).

### Reprodução offline (obrigatório)

- O player **cacheia** a config e a mídia (Service Worker / IndexedDB / Cache API).
- Se a rede cair, continua exibindo o último conteúdo válido — loja nunca fica em
  branco. Ao voltar, sincroniza.

---

## 5. Stack recomendada

| Camada | Atalho (validar rápido) | Controle total |
|--------|-------------------------|----------------|
| Banco + Auth + Storage + Realtime | **Supabase** (tudo pronto) | Postgres + Auth (Clerk/Auth0) + R2/S3 + Redis |
| API | Edge functions / Fastify | **Node + Fastify** |
| Dashboard | Next.js | Next.js / React |
| Player | **reaproveita o atual** (vanilla, leve) | idem |
| Deploy | Vercel + Supabase | Railway/Fly (API) + Vercel (dash) + Cloudflare (CDN/player) |
| Billing | Stripe | Stripe |

Recomendação: **começar pelo Supabase** para validar mercado sem gastar semanas em
plumbing; migrar peças para infra própria só quando escala/custo justificar.

O **player continua vanilla** de propósito — é uma vantagem competitiva (leve, roda
em Smart TV velha, Chromecast, TV Box). Só o **dashboard** vale migrar para React/Next.

---

## 6. Roadmap por fases

1. **Fundação SaaS** — auth + orgs + Postgres + dashboard mínimo (CRUD de telas na
   nuvem, servindo o mesmo formato de config que o player já lê).
2. **Dispositivos** — pareamento por código, heartbeat/status, push de config em
   tempo real, cache offline no player.
3. **Mídia na nuvem** — object storage + CDN; migrar upload de base64 → URL.
4. **Billing** — Stripe, planos por nº de telas, limites por plano.
5. **Diferenciais** — grupos de telas, proof-of-play/analytics, agendamento
   server-side, papéis de acesso, white-label por cliente.

---

## 7. Riscos / atenções

- **Offline first** no player é obrigatório (loja não pode ficar em branco).
- **Provisionamento em massa** de TVs — pareamento fácil é decisivo para a venda.
- **Custo de mídia/banda** — CDN bem configurado mantém barato.
- **LGPD** — contas e dados de clientes exigem tratamento (consentimento, exclusão).
- **Hardware variado** — Smart TVs antigas têm browsers ruins; o player leve atual
  já ajuda muito aqui.
- **Migração de dados** — clientes atuais (localStorage) precisam de um "importar
  para a nuvem" (o export/import de JSON já existente facilita).

---

## 8. Resumo

O produto (a parte difícil e cara) já está de pé e com qualidade. Virar SaaS é,
em boa medida, **adicionar a camada de plataforma** (contas, dispositivos, nuvem,
billing) em volta do que já existe, reaproveitando quase todo o player e a engine
de renderização. É viável, incremental e com bom timing.
