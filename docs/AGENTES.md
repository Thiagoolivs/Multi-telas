# Dois agentes no mesmo repositório

Dois agentes do Claude Code, em contas separadas, executam o `docs/PLANO.md`
ao mesmo tempo. Cada um tem uma pasta, uma frente de trabalho e um conjunto
de arquivos. O conflito de merge é evitado na divisão, e não resolvido depois.

| | Agente A — **Criação** | Agente B — **Operação e vendas** |
|---|---|---|
| Pasta | `C:\Projetos\Multi-telas` | `C:\Projetos\Multi-telas-b` |
| Branches | `criar/…` | `op/…` |
| Porta local | 8080 | **8081** (`PORT=8081`) |
| Frente | Fase 1 (fechamento) e Fase 2 (painel) | §6 Comercial, Fase 3 (TV 24/7), Fase 4 (admin), Fase 5 (landing e preços) |

O banco local fica em `data/`, dentro de cada pasta. Por isso cada agente tem
o seu, e as contas de teste de um não existem no outro.

## Quem mexe em quê

**A — Criação**
- `js/peca*.js`, `js/tokens.js`, `js/fontes.js`, `js/cor.js`, `js/animacao.js`, `js/render.js`, `js/templates.js`, `js/modelos.js`, `pecas-ouro/`, `bancada.html`
- `server/compositor.js`, `server/ai*.js`, `server/motores.js`, `server/direcao-arte.js`, `server/design-system.js`
- `web/src/pages/MyDesignsPage.jsx`, `ContentEditorPage.jsx`, `BrandPage.jsx`, `DashboardPage.jsx`
- `web/src/components/content/`, `web/src/lib/contentTypes.js`, `web/src/lib/pecaHtml.js`
- **Navegação** (Fase 2): `web/src/App.jsx`, `web/src/components/layout/` (Sidebar, Topbar, AppShell)

**B — Operação e vendas**
- `server/plans.js`, `server/creditos.js`, `server/cobranca.js`, `server/routes/billing.js`, `web/src/pages/BillingPage.jsx`
- `player.html`, `js/player.js`, `js/boot.js`, `js/adaptive.js`, `js/cloud.js`, `js/storage.js`, `js/perf.js`, `js/exibicoes.js`, `js/theme.js`, `server/vigia.js`, `server/routes/telas.js`, `android/`
- `web/src/pages/PlatformPage.jsx`, `SystemPage.jsx`, `ScreensPage.jsx`, `AlertsPage.jsx`, `RelatorioPage.jsx`
- `landing/`
- `backup/`, `tools/backup.mjs`, `server/s3.js`, `server/backup.js`

**Arquivos dos dois.** Só se ACRESCENTA neles: nada de reformatar, reordenar
ou "aproveitar para arrumar".
- `server.js`: rota nova vai num arquivo novo em `server/routes/`. No
  `server.js` entra só a linha que liga a rota.
- `server/db-sqlite.js` e `server/db-postgres.js`: tabela e coluna novas no
  FIM do bloco de criação; funções novas no fim do arquivo e no fim do
  `module.exports`. A mudança vai nos dois bancos, no mesmo PR.
- `sw.js`: só a linha do arquivo novo na lista.
- `web/src/api.js`: o grupo novo vai no fim do arquivo.
- `docs/PLANO.md`: cada um marca só os itens da sua frente.
- A navegação é do A. Se B precisar de um item no menu, ele acrescenta uma
  linha DEPOIS que o menu novo da Fase 2 estiver no `main`, e avisa na
  issue #135.

Precisa mexer em arquivo do outro? Peça na issue #135 e faça outra coisa
enquanto isso. Correção de uma linha que trava o seu teste pode entrar,
explicada no PR.

## Como cada PR entra

1. `git fetch && git switch -c <prefixo>/<nome> origin/main`
2. Um PR pequeno por etapa do PLANO.
3. Antes do merge:
   `git fetch && git rebase origin/main`, `npm test`,
   `npm run lint:nomes` e `npm --prefix web run build`.
4. Toda mudança visual é renderizada e olhada no navegador (celular de
   360 px e TV), com print no PR.
5. `gh pr create`, depois `gh pr merge --merge --delete-branch`. Se o `main`
   andou nesse meio-tempo, faça o rebase e rode os testes de novo.
6. Nunca `--force` no `main`, nunca `--no-verify`, nunca commitar `.claude/`
   ou `data/`.

**Infra é do dono.** Nenhum agente cria serviço, muda variável ou faz
deploy no Railway sem a autorização dele no chat. B não mexe no Railway.

## Recados — issue #135

Os agentes conversam pela issue
[#135](https://github.com/Thiagoolivs/Multi-telas/issues/135), e não por
este arquivo: comentário não dá conflito de merge, tem hora e os dois leem.

- Escrever: `gh issue comment 135 --body "[A] …"` (ou `[B] …`).
- Ler: `gh issue view 135 --comments` ao começar cada PR e antes de cada
  merge.
- Vai para lá: o pedido para mexer em arquivo do outro, o aviso de mudança
  em arquivo dos dois, o aviso de "rebase, mudei X" e o recado para o dono.
- Decisão de produto não se resolve entre os agentes: vai para o dono.
- Se os dois aparecerem um para o outro na lista de sessões (`ListAgents`,
  o que acontece quando estão na mesma máquina e na mesma conta), dá para
  usar `SendMessage` para avisar na hora. O registro, mesmo assim, fica na
  issue.

## Prompt de partida do Agente B

Cole isto no chat do agente B, aberto na pasta `C:\Projetos\Multi-telas-b`:

> Você é o Agente B deste repositório. Outro agente (A) trabalha em paralelo
> em outra pasta, na criação de conteúdo e no menu do painel. Leia primeiro
> `docs/AGENTES.md` (divisão de arquivos e regras de PR) e depois
> `docs/PLANO.md`; os recados com o agente A passam pela issue #135
> (`gh issue view 135 --comments`). Sua frente, nesta ordem:
> (1) §6 Comercial: planos mensal e anual com desconto por faixa, teto de IA
> por conta (§6.5), teste de 14 dias com 20 créditos, o cliente vê
> "criações", e inadimplência (§6.6);
> (2) Fase 3 (§7.1), só a parte de software: CSS do player em unidades de
> container e retrato, margem contra overscan ajustável por tela,
> expediente (a tela apaga fora do horário), print remoto da tela, vídeo
> normalizado no upload e alerta de tela offline (o de e-mail já existe em
> `server/vigia.js`);
> (3) Fase 4 (§7.2), administração;
> (4) Fase 5 (§7.3), landing e página de preços.
> Para as decisões abertas do §13, use as recomendações do próprio PLANO.
> O dono autoriza: você trabalha sem perguntar antes de cada tarefa e faz o
> merge dos seus PRs quando os testes passarem e o visual for conferido.
> Railway e qualquer outra infra só com a autorização dele no chat. Rode o
> servidor local com `PORT=8081`. Respostas curtas, em português.
