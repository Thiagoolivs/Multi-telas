# MultiTelas — Painel (React + Vite + Tailwind)

Dashboard operacional do SaaS de digital signage, servido em **`/app`** pelo
`server.js` (a partir de `web/dist`). Aparência de software corporativo real —
sóbrio, denso, focado em operação (referências: Stripe, Linear, Cloudflare,
Vercel). O **player** (o que roda na TV) segue vanilla de propósito: leve, sem
build, roda em hardware fraco.

## Design system

Tokens semânticos em CSS vars (`src/index.css`) + `tailwind.config.js`:

- **Cores** — neutros de superfície/borda/texto + **um** acento contido
  (indigo). Status: ok / warn / danger. Tema **claro** por padrão e **escuro**
  por troca de variáveis (nenhum componente sabe qual está ativo).
- **Tipografia** — Inter, base 14 px (densidade de dashboard), números
  tabulares em dados (`.tnum`).
- **Espaçamento** — grade de 4 px; painéis com padding 16 px.
- **Bordas/raio** — 1 px + raios discretos (5–10 px); hierarquia vem da borda e
  do espaçamento, não de sombra.
- **Sombras** — mínimas (`xs`/`sm`), só realce sutil.

## Páginas

- **Visão geral** (`DashboardPage`) — cockpit operacional. Usa dados plausíveis
  de `lib/mockData.js` enquanto campanhas/alertas/armazenamento não são
  entidades reais no backend.
- **Telas** (`ScreensPage`) — **API real**: lista dispositivos da conta, pareia
  por código (diálogo), renomeia e remove.
- **Equipe** (`TeamPage`) — **API real**: membros com papéis, convite por código
  (diálogo com copiar), troca de papel e remoção. Ações respeitam a permissão
  do usuário; o backend revalida.
- **Login/cadastro** (`AuthScreen`) — gate de sessão, com entrada por código de
  convite. Menu do usuário na topbar faz logout.
- Campanhas / Alertas / Armazenamento / Ajustes — placeholders no mesmo design
  system, por construir.

## Estrutura

```
web/src/
  index.css                 # Tailwind + tokens (claro/escuro)
  main.jsx                  # bootstrap
  App.jsx                   # gate de sessão + shell + roteamento + tema
  api.js                    # cliente HTTP (mesmo contrato do server/)
  lib/
    cn.js                   # merge de classes
    format.js               # bytes, %, tempo relativo (pt-BR)
    useAsync.js             # loading/erro/dados
    mockData.js             # "serviço" async com dados plausíveis (overview)
  components/
    ui/                     # Button, Panel, Badge/StatusDot, Stat, Table,
                            #   Field, Dialog, Feedback (Skeleton/Empty/Error/Progress)
    layout/                 # AppShell, Sidebar, Topbar, PageHeader
    dashboard/              # KpiRow, FleetTable, AlertsPanel, StorageCard,
                            #   SyncActivity, CampaignsPanel
  pages/
    AuthScreen.jsx          # login / cadastro (+ convite)
    DashboardPage.jsx       # Visão geral
    ScreensPage.jsx         # Telas (API real)
    TeamPage.jsx            # Equipe (API real)
    PlaceholderPage.jsx     # seções por construir
```

Estados de **loading / erro / vazio** são de primeira classe (cada painel
carrega de forma independente via `useAsync`). Responsivo de verdade: a sidebar
vira drawer no mobile e os KPIs empilham.

## Dados

`lib/mockData.js` expõe um "serviço" assíncrono (`api.getOverview`,
`getScreens`, `getCampaigns`, `getAlerts`, `getSyncActivity`) com latência
simulada. Trocar por chamadas reais ao backend é só reimplementar essas funções
— as telas não mudam. (`FAIL_RATE` liga o estado de erro para demonstração.)

## Rodar

```bash
# dev (hot reload, proxy de /api para o Node em :8080)
node server.js                 # API + estáticos
cd web && npm install && npm run dev    # http://localhost:5173

# produção (o Node serve o build em /app)
cd web && npm install && npm run build  # gera web/dist
node server.js                          # http://localhost:8080/app
```

## Próximos passos

**Campanhas**, **Alertas** e **Armazenamento** viram entidades reais no backend
e substituem os dados mock da Visão geral. Depois: editor de conteúdos e temas,
reaproveitando a lógica de `js/admin.js` peça por peça.
