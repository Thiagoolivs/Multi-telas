# Vistra — Painel (React + Vite)

Reescrita **incremental** do painel de administração em React. Convive com o
admin vanilla (`/index.html` + `js/admin.js`) enquanto a migração acontece tela
a tela — nada de big-bang. O **player** (o que roda na TV) segue vanilla de
propósito: é leve, sem build, e roda bem em hardware fraco de TV Box/Smart TV.

O painel React é servido em **`/app`** pelo `server.js` (a partir de `web/dist`).

## Telas migradas

- **Dispositivos** (`src/screens/DevicesScreen.jsx`) — lista das TVs pareadas à
  conta, pareamento por código, renomear e remover.
- **Equipe** (`src/screens/TeamScreen.jsx`) — membros da empresa com papéis
  (owner/admin/member), convite por código, troca de papel e remoção. As ações
  respeitam a permissão do usuário logado (o backend também valida).
- **Login/cadastro** (`AuthScreen.jsx`) — inclui entrar por código de convite.

Exercitam build React, chamadas à API (`src/api.js`), sessão por cookie e o
backend Postgres.

## Rodar

Dev (hot reload, proxy de `/api` para o Node em :8080):

```bash
# terminal 1 — API + estáticos
node server.js
# terminal 2 — painel React
cd web && npm install && npm run dev   # http://localhost:5173
```

Produção (o Node serve o build em `/app`):

```bash
cd web && npm install && npm run build   # gera web/dist
node server.js                            # painel em http://localhost:8080/app
```

## Estrutura

```
web/
  index.html            # entrada Vite
  vite.config.js        # base /app, proxy /api, outDir dist
  src/
    main.jsx            # bootstrap React
    App.jsx             # shell + gate de sessão
    api.js              # cliente HTTP (mesmo contrato do server/)
    styles.css          # tema escuro Vistra
    screens/
      AuthScreen.jsx    # login / cadastro (+ código de convite)
      DevicesScreen.jsx # lista + pareamento de TVs
      TeamScreen.jsx    # membros, papéis e convites
```

## Próximas telas a migrar

Editor de conteúdos, temas, agendamento — reaproveitando a lógica de
`js/admin.js` peça por peça, cada uma num PR próprio.
