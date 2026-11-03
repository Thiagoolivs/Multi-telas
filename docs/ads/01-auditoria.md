# 1. Auditoria do sistema atual (para o Ads)

Leitura do repositório em 01/11/2026 (depois do PR do QA de 26/10). Cada
afirmação aponta para o código; nada aqui é suposição de que "deve existir".

## Arquitetura e stack

- **Servidor:** Node 22 sem framework, um roteador escrito à mão
  (`server.js`, ~3.300 linhas, mais 70 módulos em `server/` e 12 arquivos
  de rota em `server/routes/`). Duas dependências: `pg` e `fontkit`.
- **Banco:** Postgres em produção, SQLite em desenvolvimento e nos testes
  (`server/db.js`). Não há sistema de migrations: o schema é
  `CREATE/ALTER ... IF NOT EXISTS` dentro de `init()`
  (`server/db-postgres.js`), duplicado à mão em `server/db-sqlite.js`.
- **Painel:** React 18 + Vite + Tailwind (`web/`), carregado por página.
- **TV:** JavaScript puro (`player.html`, `js/*.js`), offline-first com
  service worker (`sw.js`), servido como um pacote só
  (`server/pacote-tv.js`). App Android é só uma moldura (WebView) em volta
  de `/tv` (`android/`).
- **Infra:** Railway, uma instância, Nixpacks. E-mail por Resend/Brevo,
  arquivos em S3/R2, cobrança Asaas, IA Gemini/Anthropic.
- **Testes:** ~1.600 testes no runner nativo do Node, CI no GitHub Actions.

## Usuários, empresas e permissões

- `tenants` é a empresa; `users.tenant_id` é **uma coluna só** e
  `users.email` é único: **um usuário pertence a exatamente uma empresa**.
- Papéis dentro da empresa: `owner`, `admin`, `member`
  (`server/routes/team.js`).
- Operador da plataforma: `ADMIN_EMAILS` (variável de ambiente) mais a tabela
  `operadores`; rotas `/api/plataforma/*` respondem 404 para quem não é.
  Existe "entrar na conta do cliente" para suporte, com registro
  (`acessos_suporte`).
- Isolamento entre empresas é **na aplicação** (cada rota compara
  `sess.tenant_id`); não há Row Level Security no Postgres.
- Sessão: cookie `mt_session` HttpOnly de 30 dias; o token fica sem hash na
  tabela `sessions`.

## Telas (dispositivos)

- `devices`: id, tenant, código de pareamento, nome, **config (JSON)**,
  token da TV, último sinal, horário de funcionamento (`expediente`), grupo
  (texto livre), informações do aparelho.
- **Não há** endereço, localização, categoria, público estimado nem preço.
- Pareamento por código/QR (`server/routes/telas.js`), sinal de vida a cada
  30 s, alerta de TV caída por e-mail (`server/vigia.js`), comandos
  "recarregar" e "estado" (ver a tela agora).

## Como o conteúdo chega à TV

- A programação inteira de uma TV é **um JSON em `devices.config`**: layout,
  tema e, por zona (principal, lateral, rodapé…), uma lista de itens.
- O painel grava o JSON; o servidor avisa a TV pelo canal ao vivo (SSE) e a
  TV busca a config de novo.
- **Ponto de encaixe importante:** ao entregar a config, o servidor já
  acrescenta coisas que não estão gravadas — logo, aniversários, QR de foto
  (`server/routes/telas.js`, rota `GET /api/devices/:id/config`). É ali que
  anúncios podem entrar **sem tocar na programação do dono**.

## O player

- Quem decide o que passa é **a TV** (`js/player.js`). Por zona: filtra pelo
  agendamento (data, dias da semana, hora — pelo relógio da TV), intercala
  por origem e aplica **peso** (urgente ×3, alta ×2) num rodízio ponderado
  suave.
- Não existe conceito de intervalo comercial, cota, frequência garantida,
  limite de anúncio por hora, nem prioridade por contrato.

## Comprovação de exibição (proof-of-play)

- **Já existe** e é a base mais valiosa para o Ads (`js/exibicoes.js`,
  `server/routes/relatorio.js`): a TV conta o que exibiu **por hora, zona e
  item**, guarda sem internet, envia em lotes com id (sem contar duas vezes)
  e o painel mostra/exporta CSV.
- Limites para uso comercial:
  - a linha não sabe de **campanha nem contrato** (só `chave`/`rotulo` do
    item);
  - **é auto-declarada pela TV do próprio estabelecimento**, que tem o token
    dela — se ele ganha por exibição, pode inflar. Não há assinatura, nem
    cruzamento com o sinal de vida, nem amostra de tela;
  - o cadeado contra reenvio dura 30 dias e as linhas, 400.

## Cobrança

- Asaas: clientes, assinatura por tela, cobranças avulsas (pacotes de
  criação), webhook com token (`server/billing.js`, `server/cobranca.js`).
- **Não há** split, subconta, transferência, carteira, livro-caixa nem
  repasse. O Asaas oferece split de pagamento para carteiras de subcontas; o
  código não usa.

## Escala

Uma instância só, por desenho: canal ao vivo, comandos pendentes, passes,
limites e trabalhos de IA vivem na memória do processo (`server.js`,
`server/limites.js`, `server/passes.js`, `server/jobs.js`). Duas réplicas
dividiriam as TVs. Para centenas de telas uma instância aguenta; para
milhares, o estado precisa ir para Redis ou `LISTEN/NOTIFY` do Postgres.

## Resumo

| | |
|---|---|
| **Já existe e serve** | Proof-of-play por hora; agendamento por data/dia/hora; peso/prioridade no rodízio; horário de funcionamento da tela; sinal de vida e alerta de queda; "ver a tela agora"; encaixe de conteúdo na hora de entregar a config; cobrança Asaas; painel de operador e acesso de suporte; moderação (modelo no banco de imagens compartilhado) |
| **Adaptar** | `devices` ganha local, categoria e política de anúncio; exibições ganham o id da reserva; player ganha o intervalo comercial; relatório por campanha |
| **Construir** | Estabelecimento (local) como entidade; conta de anunciante; campanha, peça e aprovação; inventário e reservas; entrega e compensação; livro-caixa, repasse e split; anti-fraude |
| **Riscos técnicos** | Fraude na contagem; relógio da TV decidindo horário; uma instância só; 1 usuário = 1 empresa; schema sem migrations e duplicado em dois bancos; termos e privacidade (`server/legal.js`) não preveem anúncio de terceiros nas TVs nem o papel de intermediário |
