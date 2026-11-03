# 17 — Hacker curioso (Segurança)

Teste autorizado pelo dono, só no **servidor local** (porta 8131, `STORAGE=local`,
`AI_PROVIDER=dev`, `ADMIN_EMAILS=admin@hack.test`). Nunca contra produção.
Evidências em `/tmp/claude-0/-home-user-Multi-telas/b804d644-700b-5e83-ad8f-5fe2da78625e/scratchpad/qa/D/`
(cookie jars A.jar/B.jar/OP.jar/M.jar, `srv.log`, `srv-prod.log`).

## Quem sou e o que tentei

Criei duas contas (A `a@hack.test` = `ten_emktpd1gx90h5v`; B `b@hack.test` =
`ten_wxeysdqs0c94e2`), um operador (`admin@hack.test`, está em `ADMIN_EMAILS`) e
um membro na conta A. Com a sessão de A tentei ler/alterar/apagar recursos de B
por id; usei token de TV de uma conta na outra; injetei XSS; subi arquivos
maliciosos; testei força bruta, CSRF, cabeçalhos, arquivos públicos, path
traversal, webhook do Asaas e a cobrança simulada. Testei contra a **API de
verdade** com `curl`, e li o código das rotas (`server.js`, `server/routes/*.js`,
`server/security.js`, `server/storage.js`, `js/peca-html.js`, `js/player.js`,
`js/render.js`).

## Resumo do veredito

O produto está **muito bem protegido**. Não achei nenhum bloqueador nem grave.
O código carrega comentários documentando buracos antigos já fechados (token por
`Math.random`, `/data/multitelas.db` público, devLink do reset no corpo,
`X-Forwarded-Host` nos e-mails) — e todos foram verificados fechados ao vivo.
Única observação de acabamento: a defesa de CSRF é a **flag `SameSite=Lax`**, sem
checagem de `Origin`/`Referer` nem token anti-CSRF, e a API aceita corpo com
`Content-Type: text/plain`.

## Jornada e provas

### 1. Isolamento entre contas (IDOR) — PROTEGIDO
Todas as rotas escopam a consulta por `tenant_id` (ex.: `db.muralPorId(id, tenant)`,
`db.removerMarca(id, tenant)`, `midia.apagar(db, tenant, id)`), e as rotas de
device comparam `device.tenant_id === sess.tenant_id`.

| Ataque (sessão de A contra ids de B) | Resposta |
|---|---|
| GET `/api/devices/:B/config`, `/`, `/birthdays`, `/kpis`, `/estado` | **403** |
| PUT `/api/devices/:B/config` | **403** |
| DELETE `/api/devices/:B` | **403** |
| POST `/api/devices/:B/exibicoes`, `/heartbeat`, `/audio` | **403** |
| GET/PUT/DELETE `/api/murais/:muralB` | **404** (não encontrado no tenant de A) |
| GET `/api/mural/:codigoB/fotos` (sessão de A e anônimo) | **403** (só a TV ou o dono lista) |
| POST `/api/brand/marcas/:B/ativar` | **404** (marca de B intacta) |
| DELETE `/api/media/:midiaB?forcar=1` | **404** (arquivo de B intacto) |
| GET `/api/conversas`, `/api/relatorio`, `/api/calendario`, `/api/library` | **200 só com dados de A** (vazios) |
| POST `/api/auth/profile {empresa:...}` de A | muda só o nome de A; **nome de B intacto** |

### 2. A TV / token de device — PROTEGIDO
O `x-device-token` é comparado com `safeEqual` contra o token **daquele** device,
e só pelo cabeçalho (não aceita mais `?dt=`). O SSE usa passe curto escopado ao id.

| Ataque | Resposta |
|---|---|
| GET config de A com o **token de B** | **403** |
| GET config de B com o **token de A** | **403** |
| POST `/exibicoes` e `/heartbeat` de B com token de A | **403** |
| POST `/passe` de B com token de A | **403** |
| GET `/events` (SSE) de A com **passe emitido para B** | **403** |

Exibições falsas, heartbeat e SSE de outra tela exigem o token da própria tela —
nenhum vazou.

### 3. Entradas maliciosas — PROTEGIDO
- **XSS armazenado** em nome de empresa e nome/título de TV: o dado é guardado
  **cru** (correto: escapa na renderização). O painel é React (escapa por
  padrão) e o player desenha nome, títulos e mensagens do rodapé com
  `textContent`/`divText` (`js/render.js:996`, `js/player.js` tickers usam
  `textContent`), nunca `innerHTML` com texto do usuário. Não executa na parede.
- **Peça em HTML** (`js/peca-html.js`): não é "limpeza", é **lista de permitidos
  com re-serialização** — o HTML vira árvore e é reescrito só com tags/atributos
  conhecidos. `on*=` recusado, `src/srcset/href` recusados, `style` só aceita
  `--x/--y/--w/--h` numéricos, CSS com `\` (escape) e `url()` externo barrados.
- **SVG com script/onload**: recusado na entrada (`400 "tem script" / "tem
  atributo de evento"`); SVG limpo (só `<path>`) passa.
- **Upload com mime falso**: HTML declarado `text/html` → **415**; HTML disfarçado
  de `.png` é aceito, mas servido com `Content-Type: image/png` + `nosniff` + CSP
  `sandbox` para SVG (`server/storage.js`) — não executa como HTML.
- **Path traversal** em `/media` e públicos (`curl --path-as-is`): `/media/../../etc/passwd`,
  `/js/../server/auth.js`, `/css/..%2f..%2fserver.js`, `/vendor/../../server.js`
  → todos **403/404** (`caminhoLimpo` + `validKey` + `startsWith(ROOT+sep)`).
- Corpo JSON de 3 MB: conexão cortada (limite 2 MB em `readBody`).

### 4. Sessão e autenticação — PROTEGIDO
- **Força bruta de login**: 401 até a 10ª tentativa, **429 da 11ª** (teto por
  conta `login-acct`, além do por IP). Pareamento: `15/10min` por IP.
- **Cookie**: `HttpOnly; Path=/; SameSite=Lax`, e **`Secure`** quando atrás de
  proxy (`X-Forwarded-Proto: https`).
- **Reset de senha**: token de uso único, 1 h, link nunca volta no corpo,
  e `destroySessionsOfUser` antes de abrir a nova sessão. Troca de senha idem.
- **Frente**: cliente não troca (`POST /api/auth/profile {perfil}` →
  **403 `frente_pelo_suporte`**); só o operador, pela rota nova
  `POST /api/plataforma/contas/:id/frente` (**200** como operador, **404** como A).
- **Papéis**: membro barrado em tudo que é de dono — renomear empresa, excluir
  conta, exportar dados, dev-activate, checkout, criar convite (403 em cada).
- **Operador**: `/api/plataforma/*` e `/api/diagnostico` respondem **404** para
  não-operador (A) e **200** para o operador; a raiz vem de `ADMIN_EMAILS`
  (variável de ambiente), fora do alcance do app.

### 5. Cabeçalhos — PROTEGIDO
`/app`: `Content-Security-Policy: default-src 'self'; … script-src 'self'; …
frame-ancestors 'self'`, `X-Content-Type-Options: nosniff`, `X-Frame-Options:
SAMEORIGIN`, `Referrer-Policy: strict-origin-when-cross-origin`,
`Permissions-Policy`. **HSTS** (`max-age=31536000; includeSubDomains`) aparece
atrás de proxy https. Erros não vazam pilha nem caminho (`json inválido`, `erro
interno`). `/healthz` → `{"ok":true,"banco":"ok"}`. `.env`, `package.json`,
`server.js`, `server/auth.js`, `data/*.db`, `.git/config`, `test/`, `docs/` →
todos **404** (lista de permitidos, não de proibidos).

### 6. Webhook e cobrança simulada — PROTEGIDO
- Webhook Asaas **sem token** → 400 (`ASAAS_WEBHOOK_TOKEN ausente`); **token
  errado** → 400 (comparação em tempo constante, `mesmoSegredo`).
- `dev-activate`/`dev-checkout`: funcionam só no modo dev. Subi um 2º servidor
  com `RAILWAY_ENVIRONMENT=production`: as rotas respondem **404** e o billing
  reporta `mode: "indisponivel"` (`billing.simulacaoPermitida()` → false em
  produção). Dar o plano pago de graça por chave esquecida está fechado.

## O que tentei e estava protegido
Resumo do acima: IDOR em todas as frentes, token cruzado de TV, passe de SSE
cruzado, XSS no painel e na TV, SVG/HTML malicioso no upload, path traversal,
arquivos de sistema, força bruta, webhook sem/erro de token, cobrança simulada
em produção, membro fazendo coisa de dono. **Nada passou.**

## Problemas

| Gravidade | Onde | Como reproduzir | O que esperava | Evidência |
|---|---|---|---|---|
| Polimento | `server/auth.js:17` (`cookieAttrs`) e handlers POST da API | `curl -b A.jar -X POST /api/auth/profile -H 'Content-Type: text/plain' --data '{"name":"x"}'` → **200** | Defesa em profundidade contra CSRF: checar `Origin`/`Referer` nas rotas que mudam estado, ou exigir header/token custom, além do `SameSite=Lax` | A API aceita `text/plain` e não valida origem; hoje quem protege é só `SameSite=Lax` no cookie (já bloqueia o cookie em POST cross-site nos navegadores atuais). Sem cookie → 401. |

Observação menor (não é problema): `js/perfil.js`, `css/`, `js/` são públicos de
propósito — é código de cliente, sem segredo.

## O que está bom
- Isolamento multi-tenant consistente: id **sempre** acompanhado de `tenant_id`
  na consulta, nas 12 famílias de rota testadas.
- Token de TV por device, comparação em tempo constante, SSE com passe de 1 min
  (nunca token na URL).
- Sanitizador de peça por **lista de permitidos com re-serialização** — a
  abordagem certa, não blocklist.
- Serviço de arquivos por lista de permitidos; path traversal fechado em três
  camadas.
- Operador fora do banco (`ADMIN_EMAILS`), porta única no topo de `/api/plataforma`.
- Cobrança simulada reconhece produção pelo Railway e se desliga sozinha.
- Comentários no código mostram cultura de segurança: cada correção explica o
  ataque que fechava.

## Notas (0–10)

| Critério | Nota | Porquê |
|---|---|---|
| Isolamento entre contas | 10 | Nenhum IDOR passou em nenhuma rota testada. |
| Entrada maliciosa (XSS/upload/traversal) | 10 | Lista de permitidos, re-serialização, SVG/HTML barrados, traversal fechado. |
| Sessão e autenticação | 9 | Força bruta, reset e papéis sólidos; CSRF só por `SameSite=Lax`. |
| Cabeçalhos e exposição | 10 | CSP forte, nada de sistema público, sem vazar pilha. |
| Cobrança/webhook | 10 | Webhook com token; simulação desligada em produção. |

**Nota de Segurança: 9/10.**

**Pode lançar? Sim.** Zero bloqueador e zero grave. A única pendência é
acabamento (checagem de `Origin` como defesa em profundidade de CSRF), que não
impede o lançamento — o `SameSite=Lax` já cobre o caso real em navegadores
atuais. Recomendo tratar o item de CSRF no primeiro ciclo pós-lançamento.
