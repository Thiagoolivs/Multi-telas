# Consultor e executor no mesmo repositório

Dois Claude Code trabalham neste repositório:

- **Consultor:** a sessão no PC do dono, com o contexto todo do projeto.
  Planeja, responde dúvidas e revisa os PRs depois do merge. Não escreve
  código de produto; mexe só em `docs/`.
- **Executor:** a conta Max, em outro computador. Faz todo o trabalho: código,
  testes, conferência visual e merge.

O executor pode rodar **uma ou duas sessões**. Com duas, cada uma fica numa
pasta própria e numa frente, e a divisão de arquivos abaixo é o que evita
conflito de merge. As duas sessões gastam a mesma cota da conta Max.

| | Frente **Criação** | Frente **Operação e vendas** |
|---|---|---|
| Pasta | `C:\Projetos\Multi-telas` | `C:\Projetos\Multi-telas-op` |
| Branches | `criar/…` | `op/…` |
| Porta local | 8080 | **8081** (`PORT=8081`) |
| Frente | Fase 1 (fechamento) e Fase 2 (painel) | §6 Comercial, Fase 3 (TV 24/7), Fase 4 (admin), Fase 5 (landing e preços) |

Com uma sessão só, ela segue a fila única de "Plano até amanhã".

O banco local fica em `data/`, dentro de cada pasta. Por isso cada sessão tem
o seu, e as contas de teste de uma não existem na outra.

## Quem mexe em quê

**Criação**
- `js/peca*.js`, `js/tokens.js`, `js/fontes.js`, `js/cor.js`, `js/animacao.js`, `js/render.js`, `js/templates.js`, `js/modelos.js`, `pecas-ouro/`, `bancada.html`
- `server/compositor.js`, `server/ai*.js`, `server/motores.js`, `server/direcao-arte.js`, `server/design-system.js`
- `web/src/pages/MyDesignsPage.jsx`, `ContentEditorPage.jsx`, `BrandPage.jsx`, `DashboardPage.jsx`
- `web/src/components/content/`, `web/src/lib/contentTypes.js`, `web/src/lib/pecaHtml.js`
- **Navegação** (Fase 2): `web/src/App.jsx`, `web/src/components/layout/` (Sidebar, Topbar, AppShell)

**Operação e vendas**
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
- A navegação é da Criação. Se a Operação precisar de um item no menu, ela acrescenta uma
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
deploy no Railway sem a autorização dele no chat. O executor não mexe no
Railway.

## Plano até amanhã

A fila e as regras completas estão em `docs/EXECUTOR.md`. Com duas
sessões, a Criação pega os itens 1 a 6 e 10, e a Operação os itens 7 a 9
e 11 a 14.

## Recados — issue #135

O executor e o consultor conversam pela issue
[#135](https://github.com/Thiagoolivs/Multi-telas/issues/135). Comentário
não dá conflito de merge, tem hora, e todo mundo lê, inclusive o dono.

- Escrever: `gh issue comment 135 --body "[executor] …"`.
- Ler: `gh issue view 135 --comments` ao começar cada PR e antes de cada
  merge.
- **Dúvida para o consultor:** comece com `@consultor`. Enquanto espera a
  resposta, faça outra coisa da fila.
- **Duas sessões:** use `[criação]` e `[operação]` e avise ali toda mudança
  em arquivo dos dois.
- Decisão de produto não se resolve entre agentes: vai para o dono.

## Prompt de partida do executor

Cole no Claude Code do outro computador, aberto na pasta do clone:

> Leia `docs/EXECUTOR.md` no `main` e execute tudo o que ele manda, na
> ordem, sem esperar instrução. Respostas curtas, em português.
