# Estado do projeto (Vistra)

Resumo do que existe hoje, decisões tomadas e para onde vamos. Serve como
"contexto de retomada" — qualquer pessoa (ou sessão de IA) que ler `docs/`
consegue continuar sem depender da memória de um chat.

## O que é hoje

**Vistra** — sistema de digital signage (mídia indoor para TVs corporativas),
client-side, sem backend obrigatório. Player + painel de gestão rodando no
navegador, dados no `localStorage` (ou URL de config remota).

- **Player** (`player.html` + `js/player.js`): motor de exibição por zonas
  (cabeçalho, principal, lateral, rodapé), rotação de conteúdos, transições,
  takeover de prioridade, decorações sazonais, layout dinâmico.
- **Admin** (`index.html` + `js/admin.js`): painel visual, prévia ao vivo,
  drag-and-drop, agendamento, favoritos, vários painéis, trava por PIN.
- **Conteúdo = dado** (`js/render.js`): cada conteúdo é um objeto que um
  renderer transforma em DOM. ~23 tipos (avisos, imagem, vídeo, YouTube,
  HDMI/USB, stream, captura de tela, Holyrics, clima, KPI, promoção, etc.).
- **Temas** (`js/theme.js`): design tokens (cores, fontes, efeitos) — base do
  "brand kit". Superfície adaptativa faz o conteúdo herdar o tema.
- **Templates** (`js/templates.js`): 8 layouts de tela.

## Decisões arquiteturais tomadas

- **Conteúdo/campanha como estrutura de dados; render determinístico.** A IA
  (quando entrar) devolve JSON validado por schema; o front renderiza. Nunca
  se edita pixel/DOM direto. (Já é assim no signage.)
- **Player continua vanilla** de propósito (leve, roda em TV fraca). O que
  cresce para SaaS é o backend e o dashboard.
- **Rebrand:** produto = **Vistra**. Sem referências a terceiros. Commits/PRs
  sem assinaturas de IA.
- **server.js manda `Cache-Control: no-cache`** em html/js/css → deploy novo
  aparece sem hard refresh.

## Limites atuais (ver README → Arquitetura e limites)

- Sem contas/login/multi-tenant. Dados por navegador.
- "Vários painéis" e PIN são locais (não sincronizam entre máquinas).
- Publicação e controle remoto dependiam de config remota manual.

## Direção do produto

Ver [`VISAO-PLATAFORMA.md`](VISAO-PLATAFORMA.md): reposicionar de "software de
TV" para **plataforma de comunicação multicanal para PMEs** — uma campanha
gera/adapta/publica/monitora em vários canais (TV, redes, site, WhatsApp).
Diferencial = **simplicidade**; IA como agentes que retornam estrutura.

Ver [`PLANO-SAAS.md`](PLANO-SAAS.md): a fundação multi-tenant (contas,
dispositivos, nuvem, billing).

Ver [`CAMPANHA-SCHEMA.md`](CAMPANHA-SCHEMA.md): o schema canônico de Campanha
e o contrato de saída dos agentes de IA.

## Em andamento

- **Controle remoto na nuvem (`server/`)**: pareamento de dispositivo por
  código + sincronização da config em tempo real (SSE). Permite **controlar
  uma TV a partir do celular** pela internet — o primeiro tijolo do
  multi-tenant. Estado: MVP sem autenticação (device + código); contas/RLS
  são a próxima camada.

## Roadmap curto

1. Controle remoto na nuvem (pareamento + sync) — MVP funcional. ← agora
2. Contas + multi-tenant (auth, orgs, RLS) sobre esse MVP.
3. Mídia na nuvem (storage + CDN), billing.
4. Campanha-como-dado + render multiformato (TV/Feed/Story) → o pivot.
5. Camada de IA (brief → JSON, editor por linguagem natural) + templates por
   segmento.
