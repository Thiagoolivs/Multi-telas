# QA 09 · 10 · 18 — TI de rede (20 TVs), funcionário da equipe e operador da plataforma

Testador: agente E · 03/11/2026 · servidor local da `main` (porta 8141, SQLite, `STORAGE=local`, `AI_PROVIDER=dev`, `ADMIN_EMAILS=op@multitelas.local`, cobrança simulada). Um segundo servidor (porta 8142, `MAIL_PROVIDER=log-qa`) foi usado só para ver o aviso de queda por e-mail, que no servidor principal fica desligado sem provedor.

Navegador: Chromium (Playwright). Computador 1366×900; celular 390×844; TVs reais 1920×1080 e 1280×720.

Prints e arquivos: `/tmp/claude-0/-home-user-Multi-telas/b804d644-700b-5e83-ad8f-5fe2da78625e/scratchpad/qa/E/` (abaixo, só o nome do arquivo). Scripts em `.../qa/E/s/`.

**Frota montada:** 17 TVs criadas pela API (`POST /api/devices` + heartbeat a cada 30 s, duas delas deixadas cair de propósito: Diretoria e Treinamento) e **3 TVs reais** (`/tv` em contextos separados, pareadas pelo painel). No total, **20 TVs pareadas**, em 3 grupos (Administrativo 6, Galpão 7, sem grupo 7), com 3 dias de exibições semeadas para o relatório.

---

## Usuário 9 — TI de rede corporativa (frente Empresas, 1366×900)

**Quem é:** analista de TI da "Rede Corp Logística", conta paga (`dev-activate pro` = plano Essencial), instalando e operando 20 TVs de uma vez.

### Jornada

| # | Passo | O que aconteceu | Tempo / toques | Evidência |
|---|---|---|---|---|
| 1 | Cadastro (perfil empresa) + ativar plano | OK. Painel "MultiTelas Empresas". | API | — |
| 2 | Parear 18 TVs seguidas | **As 15 primeiras pareiam; da 16ª em diante: `429 muitas tentativas de pareamento`.** O limite (15 por 10 min por IP) conta também os pareamentos que deram certo. No painel, a mensagem aparece em minúsculas, sem dizer quanto tempo esperar. Só voltou depois de 10 min. | 4,8 s por tentativa | `pair-result-429.png` |
| 3 | Parear 3 TVs reais pelo painel (Telas › Parear tela) | Pareou; diálogo "Tela conectada". **A TV nova de uma empresa de logística começa com "Ótica Central · Semana do Sol": ÓCULOS DE SOL 30% OFF, R$ 189,90, 10× sem juros, "Oferta válida até sábado 25 de outubro" (já vencida), com "REDE CORP LOGÍSTICA" no cabeçalho.** Aconteceu nas 3 TVs. | 5 s, 3 toques | `evid-tv-empresa-com-otica.png`, `tvreal2.png` |
| 4 | Biblioteca › Telas prontas ("Para a empresa") | Vazia: "As telas prontas do seu tipo de negócio estão chegando". Em `pecas-ouro/manifesto.json` só **1 de 26** telas está `aprovada` (a da ótica); as 6 de Empresas estão como `proposta`. | — | `telasprontas-1366.png` |
| 5 | Nome e grupo (3 TVs pelo painel) | Mais opções › Nome e grupo › grupo › Salvar. Funciona; o campo sugere os grupos que já existem (datalist). As outras 10 foram feitas pela API. | 2,6–2,8 s, 4 toques por TV | `mais-opcoes.png`, `nome-grupo.png` |
| 6 | Filtro por grupo / Renomear grupo | Os chips "Todas 20 · Administrativo 6 · Galpão 7 · Sem grupo 7" filtram na hora. Renomear "Galpão" para "Galpão Logístico" muda as 7 TVs de uma vez. | 2,7 s | `screens-grupos.png`, `grupo-renomeado.png` |
| 7 | Mandar a mesma peça para um grupo e depois para todas (lote) | Peças prontas › "Comunicado interno" › Usar › trocar texto › Salvar › diálogo "Pôr numa TV" com os atalhos **Todas (15) / Administrativo (6) / Galpão (7)** › Pôr na TV. Aviso "Na TV: 7 telas · Desfazer". Para todas: "Na TV: 20 telas". As 3 TVs reais receberam (config conferida pela API). | **7,1–7,4 s, 5 toques** | `lote-editor.png`, `lote-escolher.png`, `lote-enviado.png` |
| 8 | Desfazer | O botão do aviso desfez as 7 TVs: "Desfeito: as TVs voltaram ao que eram." Pela API: desfazer depois de alguém mudar uma das TVs devolve `voltaram` (2) e `mudaram` (1) e **não apaga o que veio depois**; desfazer duas vezes dá `409 já desfeito`. Lote com TV de outra conta: `400 … Nada foi enviado`. Muito bom. **Mas o Desfazer só existe no aviso, que some em 9 s** (`web/src/lib/avisos.js:49`). O servidor guarda os envios por 30 dias (`GET /api/lote`), mas o painel não mostra essa lista. | 2 s | `lote-desfeito.png` |
| 9 | Backup › Baixar JSON | Baixou `multitelas-recep-o.json` (4,9 KB, `kind: multitelas.screen`). **O nome do arquivo perde os acentos: "Recepção" vira "recep-o".** | 1 toque | `backup-dialog.png` |
| 10 | Copiar de outra tela | Pede confirmação ("Não dá para desfazer"), copia, "Exibição copiada para esta tela." | 3 toques | `backup-confirma-copiar.png` |
| 11 | Restaurar arquivo inválido / backup baixado | Inválido: "Arquivo não parece um backup do MultiTelas." Válido: confirmação + "Exibição restaurada nesta tela." **Restaurar e copiar não têm Desfazer, embora o envio em lote tenha.** | — | `backup-restaurado.png` |
| 12 | Horário e aviso de queda | O diálogo é claro: dias, liga/desliga, o que fazer fora do horário (programação, relógio ou preta), aviso por e-mail com a regra dos 15 min. **É uma TV por vez: não há "aplicar ao grupo" nem "a todas"** (20 TVs = 20 diálogos). O e-mail vai só para o dono (não dá para pôr um e-mail de plantão/NOC). | — | `op-expediente.png` |
| 13 | Aviso de queda por e-mail (servidor 8142) | Sem provedor de e-mail o vigia **nem liga** (`server.js:3251`): no servidor principal, o painel mostra as TVs "Fora do ar", mas nenhum aviso sai e nada vai para o log. No 8142, com `MAIL_PROVIDER` forçado: ver o resultado no fim deste relatório. | — | `vigia/srv.log` |
| 14 | Recarregar a TV | Mais opções › Recarregar: o cartão diz "Recarregando a TV…" e **a TV real recarregou em 1,9 s** (`performance.timeOrigin` mudou). | 2 toques | — |
| 15 | Ver a tela agora | Desenha no painel o que a TV real mostra naquele instante ("Visto às 17:47:02"). | **2,1 s** | `ver-agora-Recep_o_principal.png` |
| 16 | Relatório de exibição (20 TVs) + CSV | Abre em 0,85 s: exibições, tempo no ar, por dia, por conteúdo, por tela, com filtro de 24 h/7/30/90 dias e por TV. CSV com BOM e `;` (abre certo no Excel em português). **Não dá para filtrar por grupo, e a tabela "Por tela" não mostra o grupo.** | 1 toque | `relatorio.png`, `rel-relatorio-exibicao-7d.csv` |
| 17 | Início e Telas com 20 TVs | Ver "Desempenho" abaixo. Miniaturas ao vivo das TVs reais; as da API ficam "Ainda sem imagem desta TV" (esperado). Página Telas: cartões de ~350 px em 3 colunas, 2.896 px de altura, **sem busca, sem ordenar por nome e sem lista compacta**. A mais nova aparece primeiro. | — | `perf-screens-cpu1.png`, `perf-overview-cpu1.png` |
| 18 | Convidar equipe (admin e member) | Conta › Equipe › Convidar › e-mail + papel (só **Membro/Admin**; Dono só por promoção depois) › "Gerar convite" mostra um **código de 8 caracteres para copiar. Nenhum e-mail é enviado**, nem com provedor configurado: `server/routes/team.js:25-37` não chama `mail`. Também não há link: a pessoa precisa abrir /app › Criar conta › marcar "Tenho um código de convite". | 4 toques | `convite-dialog.png`, `convite-admin.png`, `equipe-owner.png` |
| 19 | Promover um admin a Dono | Basta trocar o select na tabela: **sem confirmação**, e o novo dono pode remover o antigo e cancelar a assinatura. | 1 toque | `owner-promover.png` |

### Desempenho com 20 TVs (1366×900)

| Página | CPU | Rede ociosa | Miniaturas prontas | DOM | Requisições ao abrir |
|---|---|---|---|---|---|
| Início | normal | 2,25 s | 7,4 s | 437 nós | 31 (18 × `GET /estado`) |
| Telas | normal | 2,17 s | 7,6 s | 965 nós | 61 (**49 × `GET /estado`**, 8 × `POST /comando`) |
| Início | 4× mais lenta | 2,74 s | 8,2 s | 437 | 31 |

Heap de JS: ~10 MB. Nenhum erro de console. Depois de pronta, a página fica quieta: 1 requisição em 30 s. Com 20 TVs, o painel aguenta bem. O custo é o "Perguntando à TV…" de cada cartão (uma pergunta e várias leituras por TV), que dobra a cada visita e infla a métrica "tela.ver" do operador: 107 eventos, 76% de todas as "funções mais usadas".

### Notas

| Critério | Nota | Por quê |
|---|---|---|
| Fluxo | 6 | Lote, grupos, Desfazer, backup, Recarregar e Ver agora são rápidos e certos. Mas parear a frota esbarra no limite na 16ª TV, o horário é configurado TV por TV e o Desfazer some em 9 s. |
| Profissionalismo | 4 | Toda TV nova de empresa estreia anunciando óculos de sol com preço e oferta vencida, e a tela pronta da frente não existe. Também: mensagens em minúsculas "de programador", nome de arquivo sem acento e convite sem e-mail. |
| Desempenho (muitas TVs) | 7 | Páginas em ~2,2 s e sem travar, mesmo com CPU 4× mais lenta. As miniaturas levam ~7,5 s, e não há busca nem lista compacta para 20 TVs. |
| Segurança percebida (papéis) | 5 | Cobrança, equipe, LGPD e frente bem trancadas na API. Mas qualquer **membro remove TVs** (e muda a fatura), e o Dono é concedido sem confirmação. |
| Operação | 6 | Relatório, CSV, Ver agora e Recarregar são ótimos para o suporte interno. Faltam aviso de queda por grupo e para outro e-mail, histórico de envios e filtro por grupo no relatório. |

---

## Usuário 10 — Funcionário (member) e admin da equipe

**Quem é:** Joana (member) e Carlos (admin), que entraram pelos códigos de convite do dono. A Joana tenta fazer tudo o que um membro não deveria.

### Jornada

1. **Aceitar o convite (member), pelo navegador:** /app › Criar conta › "Tenho um código de convite" › nome, e-mail, senha, código, aceite › Criar conta. Entrou direto no painel da empresa como "Membro". Levou 5,2 s. Não pergunta a frente (certo: herda da empresa). Evidência: `aceitar-form-member.png`, `aceitar-depois-member.png`.
2. Logo de cara, o **Início mostra à funcionária o "Comece por aqui"**, com "Diga quem é a empresa: Abrir a Marca". O onboarding do dono vai para quem não é dono.
3. **O que o painel mostra ou esconde para o member:**
   - Equipe: sem Convidar, sem trocar papéis; só "Sair da empresa". Certo.
   - Plano: vê o valor da fatura ("R$ 2.086 por mês"); os botões de assinar e cancelar dizem "Só o dono…". Certo.
   - Ajustes: nome da empresa travado ("Só o dono da conta pode alterar"); a frente vai para o suporte; excluir conta: "Só o dono". **"Exportar meus dados › Baixar" fica ativo e, clicado, não faz nada: nem download nem mensagem** (a API dá 403). Evidência: `member-settings-baixar.png`.
   - Telas › Mais opções: **mostra "Remover a TV"** e **funciona** (diálogo "Remover tela… não pode ser desfeita" › Remover). Evidência: `member-mais-opcoes.png`, `member-remover-confirma.png`.
4. **O que a API recusa ou aceita** (script `s/papeis.js`):

| Ação | Member | Admin |
|---|---|---|
| Convidar admin / member | 403 | **201 / 201** |
| Promover-se a dono, rebaixar o dono | 403 | 403 |
| Remover o dono | 403 | 403 ("admin só remove membros") |
| Ativar plano, checkout, comprar pacote de IA, cancelar assinatura | 403 | 403 |
| Ver a assinatura | 200 | 200 |
| Trocar a frente | 403 | 403 (`frente_pelo_suporte`) |
| Renomear a empresa | 403 | 403 |
| Exportar (LGPD) / excluir a conta | 403 / 403 | 403 / 403 |
| Renomear TV, grupo, horário (**inclusive desligar o aviso de queda**), recarregar, renomear grupo | 200 | 200 |
| `/api/plataforma/*` | 404 | 404 |
| **Apagar TV** | **200**: a TV "Refeitório" sumiu da conta e a fatura caiu de 15 para 14 telas | (não executado) |

5. **O que acontece com a TV removida** (TV real, `recarregar-remover.js`): o servidor apaga o registro da TV. A TV recebe 404 no pulso e trata como "sem internet" (`js/cloud.js:252`). Por isso **segue mostrando "Tudo certo, TV Teste QA · Esta TV está conectada à sua conta"** 40 s depois e nunca volta a mostrar um código. Para parear de novo, alguém precisa ir até a TV e abrir `/tv?new=1`. Evidência: `tvqa-depois-remover.png`.
6. **Admin:** a tela de Equipe mostra Convidar e Remover (só membros) e esconde a troca de papel. Plano sem botões de compra. Pode **criar outro admin** (201) **que depois não consegue remover** (403).

### Notas

| Critério | Nota | Por quê |
|---|---|---|
| Fluxo | 7 | O convite por código funciona e a pessoa já cai na empresa certa. Mas não há e-mail nem link, e o botão de exportar falha calado. |
| Profissionalismo | 6 | Os bloqueios dizem quem pode ("Só o dono…"). Ruim: o onboarding de dono para o membro e um botão que não faz nada. |
| Segurança percebida (papéis) | 5 | Dinheiro, equipe, LGPD e frente estão certos no servidor e no painel. Mas o membro remove TVs (impacto na fatura e TV órfã na parede) e desliga o aviso de queda sem o dono saber. |

---

## Usuário 18 — Operador da plataforma (ADMIN_EMAILS)

**Quem é:** `op@multitelas.local`, em `ADMIN_EMAILS`, com conta própria (frente Comércio). Testado em 1366×900 e 390×844.

### Jornada

1. **Entrar:** a barra lateral ganha a seção "Plataforma › Métricas da plataforma · Estado do sistema". `?ir=platform` não abre a página (a lista do `?ir=` é fechada); só se chega clicando no menu. Abre em 1,6 s. Evidência: `plat-1366.png`.
2. **Métricas.** Frota (apagadas, no ar, fora do expediente, meta 100), clientes, receita (MRR R$ 2.086 → R$ 2.980 com 20 TVs), funil, saúde (backup, erros, IA, conexões), custo de IA por conta, freios, contas, "O que quebrou", maiores contas, reclamações, banco de imagens e operadores. Tudo numa página só, muito completa. Problemas vistos:
   - **Números que se contradizem:** às 17:44, "Frota › No ar **14 de 14 pareadas**" e, mais abaixo, "Telas no ar agora **20 de 20 pareadas**". Havia 14 pareadas e 6 sem dono: o segundo cartão conta TV não pareada como pareada.
   - **"No ar" diferente do cliente:** Diretoria e Treinamento já apareciam "Fora do ar" para o cliente, mas o operador as via "no ar · há 9 min". Só aos ~15–18 min viraram "apagada". São dois limites diferentes para a mesma TV.
   - **Plano "Pro"** em Clientes e "pro" na ficha, quando o cliente vê "Plano **Essencial**". Existe outro plano chamado "Pro" (`integrada`), então o operador lê o plano errado.
   - Termos de programador: "tela.ver", "tela.recarregar", "lote.enviar", "lote.desfazer" ao lado de "Parear uma tela"; papéis "owner/member/admin" em inglês na ficha.
   - Números fora do padrão brasileiro: "0.2 h", "custo R$ 0.00", "491.9 KB".
3. **Ficha da conta** (Contas › procurar "redecorp" › abrir): plano, telas no ar 18/20, mídia, conexões, peças, ações, crédito, telas com último sinal e botão de recarregar, pessoas. Evidência: `op1366-ficha-apos.png`.
4. **Ações:**
   - **Contrato anual:** "Salvar contrato" muda na hora a cobrança do cliente: o Plano dele passou a mostrar "Contrato anual", e a mensalidade de 20 telas caiu de R$ 2.980 para R$ 2.076. **Sem confirmação** e sem pedir motivo. Evidência: `op1366-suporte-billing.png`.
   - **Trocar frente** (Empresas → Saúde): um clique, **sem confirmação nem motivo**. O painel do cliente virou "MultiTelas Saúde" na hora, com outro menu ("Recursos extras"), e o cliente não recebe aviso nenhum. Fica no log (`suporte.trocou-frente`). Voltei a conta para Empresas.
   - **Estender teste:** não testado. A seção só aparece em conta em teste, e a conta testada estava paga.
   - **Entrar como cliente:** o botão Entrar fica desativado com motivo curto (menos de 10 letras). Com motivo, entra em 1,6 s, e a **faixa de suporte aparece em todas as páginas** ("…dentro de Rede Corp Logística como o dono, até as 18:54. Cobrança, equipe, senha e dados pessoais ficam com o dono"). O menu Plataforma some lá dentro. Bloqueado lá dentro: convite ("No acesso de suporte isto fica com o dono da conta", mostrado no diálogo), exportar dados (**403 calado, sem mensagem**) e as ações de cobrança, recusadas pela API (`server/suporte.js:bloqueio`). Mesmo assim, **o Plano mostra ativos "+25 criações · R$ 39" e "Cancelar assinatura"**. Telas e conteúdo podem ser mexidos, como pretendido. "Voltar ao painel do operador" volta direto. O acesso entra em "Quem do suporte já entrou" com o motivo, e no log. **O cliente não fica sabendo que o suporte entrou** (nada na conta dele). Evidência: `op1366-suporte-inicio.png`, `op1366-suporte-convite.png`, `op1366-voltou.png`.
5. **Reclamações:** a reclamação do cliente ("TVs caíram e não recebi e-mail") aparece. Responder + Resolver funciona, e a resposta aparece na página de Suporte do cliente ("Suas mensagens · Resposta: …").
6. **Erros:** "Nada quebrou" (nenhum erro de servidor na sessão inteira).
7. **Banco de imagens (moderação):** a fila está vazia. **Não testado com item:** o banco só aceita imagem gerada pela IA (`422 só imagem gerada pela IA pode ir para o banco`), e a IA estava em modo de demonstração.
8. **Operadores:** "Dar acesso" para `socio@multitelas.local` funciona; ele vira convidado ("raiz" = ADMIN_EMAILS, que "não sai por aqui").
9. **Estado do sistema (390×844):** claro e acionável, com o que falta e "Como resolver" (Asaas, Gemini, e-mail, APP_URL, revisão jurídica). Uma frase contradiz o produto: "ninguém… aceita convite de equipe" sem provedor e "os links de convite…", mas o convite é um código mostrado na tela e não usa e-mail nem link. Evidência: `sistema-390.png`.
10. **390×844:** menu ☰ com a seção Plataforma; nenhuma página rola para o lado. Mas a **tabela da Frota fica cortada:** só aparecem Tela, Conta e o começo de "Último sinal"; "Situação" (apagada/no ar) e "Aparelho" ficam escondidos numa rolagem lateral da própria tabela. A **faixa de suporte quebra em três colunas de texto e ocupa ~280 px** (um terço da tela). Evidência: `plat-390-s2.png`, `op390-suporte-telas.png`.

### Notas

| Critério | Nota | Por quê |
|---|---|---|
| Fluxo | 8 | Achar a conta, abrir a ficha, entrar com motivo e voltar é curto e claro. Reclamação de ponta a ponta funciona. |
| Profissionalismo | 6 | Termos de programador, plano com nome errado, números em formato americano, tabela cortada e faixa desarrumada no celular. |
| Desempenho | 8 | A página inteira (4.166 px) abre em ~1,6 s, com zero erros. |
| Segurança percebida | 7 | Ótimo: raiz por variável, convidado não convida, motivo obrigatório, faixa, 1 hora, bloqueios no servidor, registro. Falta: o cliente não sabe do acesso, e contrato e frente mudam com um clique, sem confirmação nem motivo. |
| Operação | 6 | Visão muito rica, mas com números que se contradizem (14 vs 20; "no ar" vs "fora do ar"), plano trocado e a métrica "tela.ver" inflada pelo próprio painel. |

---

## Problemas

| # | Gravidade | Onde | Como reproduzir | O que esperava | Evidência |
|---|---|---|---|---|---|
| 1 | **Grave** (atinge a primeira TV de toda conta de Empresas e Saúde, ou seja, as jornadas 4 e 7) | `web/src/lib/telasProntas.js:189` (`… \|\| telas.find(cabe)`) + `pecas-ouro/manifesto.json` (só `otica-semana-do-sol` está `aprovada`) | Conta de Empresas › Telas › Parear tela | Uma tela da frente (comunicado, mural) ou nada. Nunca uma oferta de óculos com preço, parcelamento e data vencida com o nome do cliente no cabeçalho. | `evid-tv-empresa-com-otica.png`, `tvreal2.png` |
| 2 | **Grave** | Biblioteca › Telas prontas (perfil empresa) | Abrir "Para a empresa" | As telas prontas de Empresas (as 6 `l1-empresa-*` estão como `proposta`) | `telasprontas-1366.png` |
| 3 | **Grave** | `server/routes/telas.js:516-517` (só confere a posse, não o papel) + ScreensPage "Remover a TV" | Logar como member › Telas › Mais opções › Remover a TV (ou `DELETE /api/devices/:id`) | Membro "apenas opera": remover TV (que muda a fatura e deixa a TV órfã) deveria ser só de dono ou admin | `member-remover-confirma.png`, `papeis.js` (200) |
| 4 | **Grave** (para quem instala frota) | `server/routes/telas.js:172` (15 / 10 min por IP, contando os acertos) | Parear a 16ª TV em menos de 10 min do mesmo escritório | Contar só códigos errados (força bruta), ou um teto bem maior por conta. A mensagem deveria dizer quanto esperar. | `pair-result-429.png` |
| 5 | Médio | `js/cloud.js:252` (404 = "offline"), `db.removeDevice` | Remover uma TV que está ligada | A TV volta a mostrar um código de pareamento (ou "Esta TV foi desligada da conta"), não "conectada à sua conta" | `tvqa-depois-remover.png` |
| 6 | Médio | `web/src/lib/avisos.js:49`, `web/src/api.js:224` (sem lista de lotes) | Mandar para 20 TVs e perder o aviso de 9 s | "Últimos envios", com Desfazer (o servidor já guarda 30 dias) | `lote-enviado.png` |
| 7 | Médio | Horário e aviso de queda (por TV) | Configurar o expediente de 20 TVs | "Aplicar ao grupo / a todas" e um e-mail de plantão além do dono | `op-expediente.png` |
| 8 | Médio | `server.js:3251` | Subir sem provedor de e-mail e deixar uma TV cair | O aviso cair no log, como o resto do e-mail em dev (hoje o vigia nem liga, e o cliente acha que vai ser avisado) | `srv.log` |
| 9 | Médio | `server/routes/team.js:25-37` | Convidar alguém | Um e-mail com link `/app/?convite=…` (o Estado do sistema até diz que convite depende de e-mail) | `convite-admin.png` |
| 10 | Médio | Ajustes › Exportar meus dados (member e suporte) | Member clica em "Baixar" | O botão desativado com "Só o dono…" ou uma mensagem de erro; hoje é 403 calado | `member-settings-baixar.png` |
| 11 | Médio | PlatformPage (cartão "Telas no ar agora") | Ter TVs criadas e ainda não pareadas | Contar só as pareadas (dava 20/20 contra 14/14 na mesma página) | `plat-1366.png` (17:44) |
| 12 | Médio | PlatformPage (Frota) vs painel do cliente | TV parada há 5–14 min | O mesmo limite de "fora do ar" nas duas pontas | `plat-1366.png` |
| 13 | Médio | PlatformPage (Clientes, ficha) | Conta no plano `pro` | Mostrar "Essencial" (o nome que o cliente vê), não "Pro"/"pro" | `op1366-ficha-apos.png` |
| 14 | Médio | PlatformPage › Ações (Frente, Contrato) | Trocar a frente ou o contrato | Confirmação + motivo (como em "Entrar"), e aviso ao cliente | `op1366-suporte-billing.png` |
| 15 | Médio | Acesso de suporte | Operador entra na conta | O cliente ver "o suporte entrou em … por …" (transparência/LGPD) | — |
| 16 | Médio | TeamPage (select de papel) | Dono troca um admin para "Dono" | Confirmação ("Essa pessoa poderá remover você e cancelar o plano") | `owner-promover.png` |
| 17 | Médio | Relatório de exibição | Querer o relatório do grupo "Galpão" | Filtro por grupo e coluna de grupo no CSV | `relatorio.png` |
| 18 | Médio | Telas com 20 TVs | Achar a TV "Doca 3" | Busca, ordenar por nome/estado e lista compacta | `perf-screens-cpu1.png` |
| 19 | Médio | PlatformPage a 390 px | Ver a Frota no celular | Situação visível sem rolar a tabela de lado (cartões no celular) | `plat-390-s2.png` |
| 20 | Polimento | FaixaSuporte a 390 px | Entrar como cliente no celular | Uma linha curta + botão, sem três colunas | `op390-suporte-telas.png` |
| 21 | Polimento | Diálogo "Pôr numa TV" | Abrir com 20 TVs | Grupo e estado (fora do ar) ao lado de cada TV; o botão dizer "Pôr em 7 TVs"; o aviso dizer quantas estão fora do ar | `lote-escolher.png` |
| 22 | Polimento | ScreensPage.jsx:693 | Baixar o backup de "Recepção" | `multitelas-recepcao.json` (hoje `recep-o`) | `backup-multitelas-recep-o.json` |
| 23 | Polimento | Restaurar / copiar backup | Restaurar por cima | Desfazer (o lote tem; aqui "não dá para desfazer") | `backup-confirma-copiar.png` |
| 24 | Polimento | Mensagens do servidor | 429 de pareamento | "Muitas tentativas…", com maiúscula e tempo de espera | `pair-result-429.png` |
| 25 | Polimento | Editor da peça "Comunicado interno" | Usar a peça | Rótulo do campo "Rótulo" (está "Rotulo") | `lote-editor.png` |
| 26 | Polimento | PlatformPage | — | "tela.ver"/"lote.enviar" em português; papéis em português; "0,2 h", "R$ 0,00", "491,9 KB" | `plat-1366*.png` |
| 27 | Polimento | Início (member) | Entrar como membro | "Comece por aqui" (Marca) só para dono ou admin | `aceitar-depois-member.png` |
| 28 | Polimento | Equipe (admin) | Admin convida um admin | Ou admin não cria admin, ou pode removê-lo | `papeis.js` |
| 29 | Polimento | `server/routes/auth.js:73` | Aceitar convite pela API | `tenant.name` = nome da empresa (devolve o nome da pessoa) | — |
| 30 | Polimento | Painel Telas/Início | Abrir Telas com 20 TVs | Menos pedidos de "estado" (49 por visita) e não contar isso como "tela.ver" nas métricas | tabela de desempenho |
| 31 | Médio (segurança, visto de passagem) | `server/security.js:35-38` | Mandar `X-Forwarded-For` qualquer no login | Confiar só no IP do proxy. Hoje qualquer um troca o IP e pula os limites por IP (login 20/15 min, pareamento, cadastro). Eu mesmo precisei disso para continuar o teste depois de 429 no login. | `sess-*.json` |

---

## O que está bom

- **Envio em lote é de gente grande:** tudo ou nada no servidor, atalho por grupo, Desfazer que não atropela o que foi mudado depois e recusa de TV alheia ou repetida. 5 toques, 7 s para 20 TVs.
- **Grupos simples e certos:** filtro em chips, renomear o grupo inteiro, sugestão dos grupos existentes.
- **Ver a tela agora (2 s) e Recarregar (TV recarrega em ~2 s)**: exatamente o que o TI precisa sem ir até a TV.
- **Relatório de exibição** claro, rápido, e o CSV abre direito no Excel em português (BOM + `;`).
- **Papéis no servidor:** cobrança, equipe, LGPD, frente e nome da empresa estão todos recusados para member e admin, com mensagens que dizem quem pode.
- **Acesso de suporte bem pensado:** motivo obrigatório, faixa permanente, 1 hora, bloqueios no servidor, registro na ficha e no log, e volta com um clique.
- **Estado do sistema:** diz o problema, o impacto e como resolver.
- **Painel leve:** ~2,2 s com 20 TVs, zero erros de console em toda a sessão.

---

## Nota geral

| Usuário | Nota |
|---|---|
| 9 — TI de rede | **5,6** |
| 10 — Member / admin | **6,0** |
| 18 — Operador | **7,0** |
| **Média** | **6,2** |

## Pode lançar?

**Não.** As jornadas 9, 10 e 18 não estão na regra de veto, mas o problema nº 1 atinge a primeira experiência das frentes Empresas e Saúde (jornadas 4 e 7). Toda TV recém-pareada nessas contas estreia mostrando uma oferta de óculos de sol com preço, parcelamento e data vencida, com o nome do cliente no cabeçalho, e a tela pronta da própria frente não existe (nº 2). Antes de lançar, corrigir também o nº 3 (membro remove TV) e o nº 4 (limite de pareamento para quem instala frota). O resto tem contorno.

---

### Aviso de queda por e-mail (servidor 8142, `MAIL_PROVIDER` forçado)

**Funciona.** Conta com 3 TVs pela API; Doca B e Doca C pararam de pulsar às 17:50. Às 18:09:56 saiu **um e-mail só** para o dono (`ti2@redecorp.local`), sobre as duas:

> Assunto: ⚠ 2 telas estão fora do ar · MultiTelas
> • Doca C — sem sinal há 20 minutos · • Doca B — sem sinal há 20 minutos
> "Quando várias caem juntas, quase sempre é a internet do local ou a energia. Você não precisa fazer nada no MultiTelas… Este aviso é enviado uma vez por queda."

Texto bom, sem alarme falso, agrupado por conta. Na prática, o aviso chega ~20 min depois da queda (limite de 15 min + varredura de 5 min). O e-mail não traz link para o painel (sem `APP_URL` neste servidor) e vai só para o dono (ver nº 7). Evidência: `vigia/srv.log`.
