# Reteste dos blocos 4 a 7 (fase 10)

05/11/2026, `main` em `72cba9c` (depois das fases 0, 7, 8 e 9). Servidor
**local** na porta 5972, banco novo (`STORAGE=local`, `AI_PROVIDER=dev`,
sem e-mail de verdade). Nada de produção, nada de IA real.

## Método

O mesmo do relatório original (`docs/qa-total/BLOCO-4-7-RESULTADO.md`),
com os mesmos scripts (copiados de `b47/` e ajustados para a porta e as
páginas novas):

- As **mesmas 8 contas**, montadas pelo mesmo `monta.js`: vazia, típica,
  cheia e antiga, em Empresas e Comércio. A antiga recebe direto no banco
  os mesmos formatos velhos: `items` como texto, item `null`, tipo `xyz`,
  config `[]`, `null` e JSON quebrado, campanha com `resultado.telas`
  como texto, logo que sumiu, pessoa sem nome, data inválida, indicador
  sem nome. Mais um operador e uma conta Saúde.
- **Cada página em 8 contas × 2 tamanhos** (1366×860 e 390×844), com axe
  4.10 (WCAG 2 A/AA): 562 aberturas. Entram as páginas novas (Biblioteca,
  Prontos, Seus conteúdos, Apps) e a **página da TV nas três partes** (O
  que passa, Ajustes da TV, O que passou). Mais 40 aberturas da página da
  TV, uma por TV, em "O que passa".
- Junto, as medidas da fase 8: botões violeta por tela, tamanho da letra
  e do título.
- **TV de verdade** aberta em outra janela: ver agora, recarregar, pôr na
  TV, desfazer e refazer, cronometrados. TVs antigas e amostras da TV.
- Site e cadastro por frente, preços, e-mails (modelos e a varredura ao
  vivo, `[mail:dev]` no log), 4G lento com CPU 4×, TV sem internet,
  servidor reiniciado, segurança entre contas e XSS em 12 campos.

Tudo em `r10b47/q/`: scripts, `out/` (JSON brutos) e `shots/` (676 fotos).
Caminho completo da pasta:
`(fotos e scripts no ambiente do reteste)`.

## Resumo

- **Nenhuma página quebra mais.** 0 "Esta tela não abriu" em 602
  aberturas, também nas 12 TVs antigas, nas três partes da página da TV.
  Antes, 3 páginas quebravam.
- **Ainda falha uma lista:** na conta antiga, `GET /api/campanhas` e
  `/api/campanhas/pecas` dão 500. Seus conteúdos › Campanhas mostra
  "erro interno" **e** "Nenhuma campanha ainda", juntos. O gatilho agora é
  a campanha com `resultado.telas` em texto (`server/ajuste.js:76`).
- **A TV não trava mais.** Número no letreiro vira texto ("123"); tipo
  desconhecido não aparece; config `[]` não mostra a demonstração de outra
  empresa.
- **O ciclo da TV ficou ótimo.** Telas › Abrir a TV › mudar › Pôr na TV:
  a TV mudou em 0,26 s (PC) e 0,12 s (celular). Desfazer em 0,35 s e
  0,10 s; Refazer em 0,15 s. A barra fica à vista sem rolar.
- **axe:** 6 problemas no painel (eram 4). Três dos antigos continuam
  (Criando, Mural, selos de campanha). Dois novos e críticos/sérios estão
  em **Ajustes da TV** (`SettingsForm.jsx:223-234`), em 30 aberturas.
- **Fase 8 conferida:** título 28 px (24 no celular) em todas as páginas;
  corpo 15 px em 36% do texto e 13 px em 48%. Um violeta por tela, menos
  em Peças guardadas (um por pasta, até 10) e na Programação antiga (um
  por TV, até 25).
- **Conteúdo pronto:** sem aprovação do operador, o cliente vê o mesmo de
  antes. Depois de aprovar na galeria, Comércio vê 16 telas, Saúde 10 e
  Empresas 7.
- Site, preços e e-mails iguais, com o e-mail falso do fim do teste
  corrigido. Segurança segue 9.

**Notas:** bloco 4, **8,5** (era 7). Bloco 5, **7,5** (era 7). Bloco 6,
**8** (era 8). Bloco 7, **8,5** (era 8). Nenhum chega a 9; o que segura
cada um está no fim.

## As quebras do relatório original (Q1–Q12)

| # | Antes | Agora | Prova |
|---|---|---|---|
| Q1 | Programação quebra com `rodape.messages` em texto | **resolvido** | 0 quebras na Programação nas contas antigas (2 × 2 tamanhos) |
| Q2 | Editor quebra com programação `[]` | **resolvido** | "Velha 3": "Esta tela ainda está vazia. Como você quer começar?" |
| Q3 | Editor quebra com `items` em texto | **resolvido** | "Velha 0" abre vazia, sem erro |
| Q4 | Editor quebra com item `null` | **resolvido** | "Velha 1" abre com "Principal · 13 conteúdos" |
| Q5 | Campanha antiga derruba Criados e Peças prontas (500) | **em parte** | O formato sem cabeçalho/rodapé passou. `resultado.telas: "x"` ainda dá 500 (`server/ajuste.js:76`, `"x".forEach`), e a tela mostra o erro com o vazio (`CampanhasPage.jsx:82`, `:196`, `:205`) |
| Q6 | TV trava com número no letreiro | **resolvido** | `PUT` com `messages: ['Aviso normal', 123]` grava `"123"`; a TV mostra "Oi teste … Aviso normal" |
| Q7 | TV mostra "Tipo de conteúdo desconhecido" | **resolvido** | 0 em 30 amostras de 2 s na TV com `type: 'xyz'` |
| Q8 | Config corrompida mostra a demonstração de outra empresa | **resolvido na nuvem** | `[]`, `null` e JSON quebrado: a TV mostra só a data ou "Tudo certo". A `sampleConfig` de "Raft Embalagens" continua em `js/storage.js:79` e `:319` para o modo sem nuvem |
| Q9 | Marca no celular com logo: análise espremida | **igual** | "Tama bom (400×", "Com me" (`LogoDaMarca.jsx:111`, `min-w-0 flex-1`). Foto: `shots/comercio-tipica-m-brand.jpg` |
| Q10 | Zona de texto/clima preta no mapa da TV | **igual, com alívio** | O mapa ainda desenha só peça e foto (`MapaDaTela.jsx:36-45`). A TV ao vivo ao lado mostra o texto. Foto: `shots/b4-d-pagtv.jpg` |
| Q11 | "A TV continua no ar" para quem nunca ligou TV | **resolvido** | Ao vivo para `rota.fim@qa.local`: "Seu teste do MultiTelas Empresas acabou antes de a TV ser ligada" |
| Q12 | Plano B do aviso: "Aviso para : …" | **resolvido** | `semIA(...)` devolve "O refeitório fecha às 14h" |

## Bloco 4: Telas e a página da TV

Conta típica de Comércio, com a TV "Recepção" aberta em outra janela.

| Item | Antes (FUN FLU TXT VIS ACE) | Agora (FUN FLU TXT VIS ACE) | Prova |
|---|---|---|---|
| Ligar uma TV (parear) | 9 8 8 8 9 | **9 9 9 8 9** | Código digitado no celular com espaço e minúscula: ligou em 1,8 s (era 3,7). A TV disse "Tudo certo, Recepção principal". "Ligar uma TV" em todo lugar |
| Reconectar | 9 8 8 8 — | **9 8 8 8 —** | TV do mesmo modelo: 409 "Esta TV parece ser a Recepção… É ela?". Com "é outra", entra (200) |
| Grupos | 8 6 8 8 9 | **8 7 8 8 9** | Telas: chips "Todas 25" e 4 grupos com contagem. Sem busca. A Agenda escolhe a TV numa lista de 25 |
| Ver agora | 9 9 8 7 9 | **9 9 8 8 9** | Imagem em 289 ms (PC) e 170 ms (celular). E a TV ao vivo no centro da página dela |
| Som ao vivo | 8 8 8 8 9 | **8 8 6 8 9** | Abre na hora; diz "sem música". Mas manda a pessoa a "Conteúdo › Ajustes da tela", que não existe mais (`ScreensPage.jsx:149`) |
| Recarregar | 9 9 8 8 9 | **9 9 8 8 9** | A TV recarregou em 2,1 s (PC) e 1,9 s (celular) |
| Horário e aviso de queda | 8 8 8 8 9 | **8 8 8 8 9** | Igual: dias, horas, fora do horário e o e-mail de queda |
| Backup e cópia | 8 8 8 8 — | **8 8 8 8 —** | Continua no "Mais opções". Não refiz o fluxo inteiro |
| Aviso rápido | 8 8 6 8 9 | **8 — 8 — —** | Mudou para a conversa do Criar. O plano B agora sai certo (Q12). Não refiz o fluxo pela tela |
| O que passa: sequência, tempo, prévia | 8 7 8 6 6 | **9 8 8 7 9** | TV ao vivo e "Como vai ficar" no mesmo palco. 0 axe em 40 aberturas. O mapa ainda pinta preto a zona de texto (Q10) |
| Pôr na TV | 9 8 8 8 — | **9 9 9 9 —** | 0,26 s (PC) e 0,12 s (celular) até a TV. Barra fixa à vista sem rolar (y 805 de 860; 712 de 844) |
| Desfazer | 5 6 — — — | **9 9 8 8 —** | Desfazer: 0,35 s e 0,10 s. Refazer: 0,15 s. Também no aviso de "Pôr na TV" das peças soltas |
| Agenda e importância na TV | 8 — — — — | **8 — — — —** | Peça vencida: 0 de 90 amostras. Urgente em 29 de 90 (32%; o teto é 25%; antes, metade) |
| Página da TV com dados antigos | 2 — — — — | **9 — — — —** | 0 quebras: 12 TVs antigas × 2 tamanhos × 3 partes. TV vazia diz "Esta tela ainda está vazia" |
| Ajustes da TV (parte nova) | — | **8 8 8 8 5** | Abre em todas as contas. axe: `select-name` crítico (o "Um tema pronto" sem nome) e `nested-interactive` sério (caixa dentro de botão), `SettingsForm.jsx:223-234`, em 30 aberturas |
| O que passou (parte nova) | — | **8 8 8 8 9** | O relatório só da TV; vazio honesto ("Nada exibido neste período") |

Fotos: `shots/b4-d-pagtv.jpg`, `shots/b4-m-rascunho.jpg`,
`shots/b4-d-veragora.jpg`, `shots/b4-ligada-m.jpg`, `shots/b4-tv-ligada.jpg`,
`shots/tvpag-*.jpg`.

**Nota do bloco 4: 8,5** (era 7).

## Bloco 5: o resto do painel

562 aberturas (8 contas × 2 tamanhos). Medianas de 0,7 s a 1,3 s. 0
quebras, 0 rolagem lateral no celular. Título 28 px em 253 aberturas e 24
px em 255 (celular).

| Página | Antes | Agora | Prova |
|---|---|---|---|
| Início | 8 6 8 6 9 | **8 6 8 6 9** | Vazia: "Comece por aqui 0 de 3". Cheia: ainda 25 linhas vermelhas "TV x está fora do ar", sem resumo. Foto: `shots/empresa-cheia-d-overview.jpg` |
| Alertas | 8 7 8 7 9 | **8 7 8 7 9** | Igual: 25 cartões vermelhos iguais |
| Telas | 9 8 8 8 9 | **9 8 8 8 9** | Ações rápidas. 10 a 13 nomes cortados sem dica por tela |
| Relatório (e "O que passou") | 7 8 8 8 9 | **7 8 8 8 9** | Igual; agora também por TV |
| Programação (endereço antigo) | 4 6 8 5 9 | **8 6 8 5 9** | Saiu do menu, mas abre. Não quebra mais. Um violeta por TV (25 na cheia, `ProgramacaoPage.jsx:119`), mapa preto, rótulos de 10 px |
| Agenda (semanal) | 8 8 8 8 9 | **9 8 8 8 9** | Semana por faixa do dia, "fechado" no domingo; no celular, um dia por vez. Data inválida não quebra. Foto: `shots/comercio-tipica-d-calendario.jpg` |
| Página da TV | 4 7 8 6 6 | **9 8 8 7 6** | Ver bloco 4. O ACE cai por Ajustes da TV |
| Criar | 8 8 8 8 9 | **8 8 8 8 9** | Um só Criar, três portas, ideias da frente, Onde e Quando no fim. IA simulada |
| Criando | 8 8 8 8 5 | **8 8 8 8 5** | Igual: no celular o "Abrir" fica só com a seta, sem nome (axe crítico, `CriandoPage.jsx:119-120`) |
| Seus conteúdos › Campanhas | 5 8 5 7 7 | **5 8 5 7 7** | Conta antiga: "erro interno" **e** "Nenhuma campanha ainda" (Q5). Selos "Pausada" 4,08:1 e "No ar" baixos (`CampanhasPage.jsx:37-38`). Foto: `shots/comercio-antiga-d-seus.jpg` |
| Criação rápida | 8 8 8 8 9 | **8 8 8 8 9** | Igual, agora em Criar › Avançado |
| Seus conteúdos › Peças guardadas | 8 7 7 7 9 | **6 7 7 6 9** | 300 peças: a página trava 4,5 s depois de abrir (maior tarefa 2,7 s, CPU sem freio). No robô, de 1,4 s para 8,8–12 s. Sem paginação (`MyDesignsPage.jsx:837`). 10 violetas "Pôr a pasta na TV" (`:828`). 42 rótulos cortados sem dica (`:840`) |
| Prontos › Peças soltas | 6 8 8 8 9 | **7 8 8 8 9** | De 12 em 12. Pôr na TV com Onde e Quando e Desfazer: 4 toques no celular, gravou em 1,6 s. Na conta antiga cai junto com Q5 (mostra o erro) |
| Prontos › Telas inteiras | 6 7 5 7 9 | **6 7 5 7 9** (8 8 8 8 8 depois de aprovar) | Sem decisão do operador: Empresas e Saúde "estão chegando"; Comércio só a ótica. Depois de aprovar as 52 na galeria: Comércio 16, Saúde 10, Empresas 7, com o pacote do negócio primeiro. Saúde: 1–2 contrastes baixos. Fotos: `shots/prontas-aprov-*.jpg` |
| Fotos e vídeos, Da IA, Músicas | 8 8 8 8 9 | **8 8 8 8 9** | Nomes longos com dica; a descrição corta no celular |
| Banco de Imagens | 6 8 6 8 9 | **6 8 6 8 9** | Igual: "falta a chave da Pixabay na configuração" para o cliente (`BancoImagensPage.jsx:257`) |
| Marca | 8 8 8 5 9 | **8 8 8 5 9** | Q9 igual no celular |
| Pessoas | 8 7 8 7 9 | **8 7 8 7 9** | 150 pessoas abrem bem; nomes cortados no celular (168) |
| Indicadores | 7 7 7 8 9 | **7 7 7 8 9** | Igual: o indicador sem nome aparece como "k1" |
| Mural | 8 8 8 8 6 | **8 8 8 8 6** | Igual: "Nome do mural" sem ligação com o campo (axe crítico, `MuralPage.jsx:185-186`) |
| Apps (novo) | — | **8 8 8 8 9** | Aniversariantes, mural e indicadores num lugar |
| Plano | 8 8 7 8 9 | **8 8 7 8 9** | R$ 79 / 139 / 159 iguais à landing e à API. "2 de 49 telas" ainda confunde |
| Equipe | 8 8 8 8 9 | **8 8 8 8 9** | Agora no avatar; convites com papel |
| Ajustes | 8 8 8 8 9 | **8 8 8 8 9** | Igual |
| Suporte | 8 8 6 8 9 | **8 8 6 8 9** | Igual: Gmail pessoal (`SupportPage.jsx:16`) |
| Sistema (operador) | 8 8 8 8 7 | **8 8 8 8 7** | 2–3 contrastes baixos. Para cliente, 404 |
| Plataforma (operador) | 8 7 8 7 7 | **9 7 8 7 7** | Ganhou a galeria: aprovar vale na hora para as contas (testado pelo clique). Mas abre em 5,4 s (era 2 s): carrega as 43 peças de uma vez. 3 contrastes e 3 tabelas sem foco |
| Cadastro e login | 9 9 8 8 9 | **9 9 8 8 9** | Igual: frente já marcada, painel em 4,5 s no celular |
| Telas de espera e de erro | 8 8 8 8 9 | **8 8 6 8 9** | Novo: um 429 no `/api/auth/me` vira "Sem conexão com o MultiTelas… Suas TVs continuam" (`App.jsx:215`). Visto na conta cheia com duas sessões |

**axe no painel (562 aberturas, 55 com problema):**

| Problema | Onde | Aberturas | Antes |
|---|---|---|---|
| `select-name` (crítico) | Ajustes da TV, `SettingsForm.jsx:234` | 30 | novo |
| `nested-interactive` (sério) | Ajustes da TV, `SettingsForm.jsx:223-230` | 26 | novo |
| `label` (crítico) | Mural, `MuralPage.jsx:185` | 8 | igual |
| `button-name` (crítico) | Criando no celular, `CriandoPage.jsx:119` | 5 | igual |
| `color-contrast` (sério) | selos de campanha, `CampanhasPage.jsx:37-38` | 12 | igual, e agora também "No ar" |
| "Igual ao que está na TV" 2,36:1 | — | 0 | **resolvido** |

A fase 8 mediu 0 problemas em contas novas, com 1 TV e sem campanha. Os
problemas aparecem com dados (mural, campanha, IA criando) e em Ajustes da
TV, que a medida da fase 8 não abriu.

**Glossário:** limpo nas páginas. Sobram "Zonas" no nome dos layouts
("Cabeçalho + 2 Zonas + Rodapé", "Zona 1 · vazia") e "prioridade" no Plano.

**Nota do bloco 5: 7,5** (era 7).

## Bloco 6: site e e-mails

Nada mudou no site desde o original (`git diff 91bf4f8` vazio em
`landing/`).

| Página | Pronta no 4G lento (antes) | axe | Veredito | Prova |
|---|---|---|---|---|
| `/` | 0,99 s (0,87) | limpo | fica | Sem tabela de preço |
| `/empresas` | 0,97 s (0,86) | limpo | fica | R$ 159; anual a partir de R$ 102 |
| `/saude` | 1,01 s (0,88) | limpo | fica | R$ 139; anual a partir de R$ 90 |
| `/comercio` | 0,99 s (0,84) | limpo | fica | R$ 79; anual a partir de R$ 51 |
| Termos | 0,54 s | limpo | fica | — |
| Privacidade | 0,54 s | 2 tabelas sem foco no celular | fica | Igual |
| Cadastro de cada frente | 4,5 s até o painel | limpo | fica | "Diga quem é a clínica / a loja / a empresa" |
| Página 404 | — | sem título e sem idioma | melhora | Igual: "Não encontrado: /x" (`server.js:3233`) |

O primeiro desenho (FCP) ficou em 0,74–0,85 s, como antes; a diferença no
"pronta" é de 0,1 s. Nenhum link interno quebrado. Preços iguais na
landing, em `/api/planos`, no Plano e nos e-mails.

| E-mail | Como saiu | Texto (antes) | Visual (antes) | Prova |
|---|---|---|---|---|
| 1. Confirmar o e-mail | modelo | 7 (7) | 7 (7) | Igual: genérico, sem a frente |
| 2. Redefinir a senha | ao vivo | 8 (8) | 7 (7) | E-mail que não existe recebe a mesma resposta |
| 3. Faltam 2 dias, sem TV | ao vivo | 8 (8) | 7 (7) | "…acaba em 2 dias — e a TV ainda não foi ligada" (Saúde) |
| 4. Faltam 2 dias, com TV | ao vivo | 8 (8) | 7 (7) | Preço da frente |
| 5. Acabou | ao vivo | **8 (5)** | 7 (7) | Sem TV: "acabou antes de a TV ser ligada", com o passo a passo. Com TV: "A TV continua no ar" |
| 6. Fatura em atraso | ao vivo | 8 (8) | 7 (7) | "suas telas continuam no ar" |
| 7. TV fora do ar | modelo | 8 (8) | 7 (7) | Igual |
| 8. Código da foto | ao vivo | 7 (7) | 4 (4) | Igual: sem moldura, em Times (`server/foto-qr.js:139-145`) |

Fotos dos e-mails: `q/mails/*.jpg`. Nenhum tem logo nem rodapé com a
empresa.

**Nota do bloco 6: 8** (era 8).

## Bloco 7: a base

| Área | Resultado |
|---|---|
| Desempenho | 4G lento com CPU 4×: landing 0,97–1,01 s; login 1,6 s; Início no celular 3,1 s; Programação de 25 TVs 4,2 s (era 3,3); Telas de 25 TVs 2,9 s; Peças guardadas 2,1 s até o primeiro desenho, mas depois trava 4,5 s (ver bloco 5); a TV 2,2 s (era 1,7). No 4G: tudo abaixo de 1,7 s, menos Peças soltas (3,2 s) |
| Carga do painel | Igual: Programação de 25 TVs faz 30 chamadas ao abrir, Telas 29, Início 16; parado, 2 por minuto. O freio segue em 600 por 5 min (`server/limites.js:42`). As duas sessões da conta cheia levaram 429 no robô, e agora o painel mostra "Sem conexão" (`App.jsx:215`) |
| TV sem internet | 45 s fora: a TV seguiu. A mudança feita com ela fora chegou 9,1 s depois de a rede voltar (era 9) |
| Servidor reiniciado | Parado 15 s: a TV seguiu. De volta, a mudança chegou em 14,6 s, sem pedir código (o código existe escondido na página, "••••••") |
| Dados antigos na TV | Q6, Q7 e Q8 resolvidos. Na TV de itens tortos, o principal fica escuro e vazio em parte das amostras (`shots/tv-empresa-antiga-1.jpg`) |
| Dados antigos no painel | 0 quebras. Falta só a lista de campanhas (Q5) |
| Segurança entre contas | 12 de 13 barradas, como antes. A 13ª continua: `DELETE /api/library/:id` de outra conta responde 200 e não apaga (conferido). Rotas novas barradas: desfazer o envio de outra conta (404), enviar para a TV de outra conta (400), decidir conteúdo pronto sem ser operador (404; sem sessão, 401). CSRF de fora, 403. TV de uma conta lendo a de outra, 403 |
| XSS | `<img onerror>` e `<svg onload>` nos 12 campos, em 17 páginas (com Seus conteúdos, Prontos e Criar), na TV e no mural público: nada executou |
| Cabeçalhos | CSP, `nosniff`, `X-Frame-Options`, `Referrer-Policy` e `Permissions-Policy` |
| Acessibilidade | Site, login e 28 das 33 rotas do painel limpas no robô (as 5 com problema são 4 páginas). 6 problemas no painel (tabela do bloco 5), o 404 e as tabelas da Privacidade |
| Compatibilidade | `/js/tv.pacote.js` agora com 612 KB (era 575): passa no ES2017 e falha no 2016, como deve. Só Chromium. `/apk/versao.json` segue 404 |

**Notas por área, contra o original:**

| Área | Antes | Agora | Por quê |
|---|---|---|---|
| Segurança | 9 | **9** | Nenhuma conta mexe na outra; rotas novas barradas; nenhum XSS |
| Confiabilidade da TV | 8 | **9** | Sem internet e depois do reinício, perfeita; número no letreiro e lixo não travam nem mostram outra empresa |
| Robustez do painel com dados antigos | 4 | **8** | 0 quebras em 602 aberturas; falta a lista de campanhas |
| Desempenho | 9 | **8** | Landing abaixo de 1 s, mas Peças guardadas trava 4,5 s com 300 peças, Programação foi a 4,2 s, e o 429 com duas sessões continua |
| Fluxo (Telas e TV) | 7,5 | **9** | Mudar a TV em 3 cliques, chega em 0,1–0,3 s, com Desfazer e Refazer |
| Profissionalismo visual | 6,5 | **7,5** | TV ao vivo no centro, letra e violeta consistentes; sobram o mapa preto, a Marca no celular e Início/Alertas com 25 TVs |
| Comercial (landing) | 7,5 | **7,5** | Igual |
| E-mails | 7 | **7,5** | O texto falso saiu; o do código segue fora do padrão |
| Acessibilidade | 7,5 | **7** | 3 problemas antigos ficaram e 2 novos entraram na página principal da TV |
| Compatibilidade | 7 | **7** | Igual |
| Conteúdo pronto por frente | 3 | **4** (7 depois de aprovar) | A galeria funciona; sem aprovação, o cliente vê o mesmo de antes; aprovado, Empresas fica com 7 telas, abaixo das 12 |

**Nota do bloco 7: 8,5** (era 8).

## O que segura cada bloco abaixo de 9

**Bloco 4 (8,5)**
1. Ajustes da TV com axe crítico e sério em todas as contas:
   `web/src/components/content/SettingsForm.jsx:234` (`Select` sem rótulo)
   e `:223-230` (`Checkbox` dentro de `button`).
2. O mapa da TV pinta preto a zona de texto, comunicado e clima:
   `web/src/components/tela/MapaDaTela.jsx:36-45`.
3. Urgente em 32% das amostras da TV, acima do teto de 25%
   (`js/rodizio.js:117-122`). Medido em 180 s numa TV, ainda é amostra
   curta.
4. Texto velho no Som: "Conteúdo › Ajustes da tela"
   (`web/src/pages/ScreensPage.jsx:149`). O teste do glossário não pegou.
5. Com 25 TVs, Telas não tem busca, e a Agenda lista as 25 num seletor.

**Bloco 5 (7,5)**
1. A lista de campanhas cai com um formato velho e ainda diz "Nenhuma
   campanha ainda": `server/ajuste.js:76` (`resultado.telas` em texto),
   sem `try` por campanha em `server/routes/campanhas.js:369` e `:398`;
   no painel, `web/src/pages/CampanhasPage.jsx:82` põe a lista vazia no
   erro.
2. Peças guardadas trava 4,5 s com 300 peças: tudo desenhado de uma vez
   (`web/src/pages/MyDesignsPage.jsx:837-840`), um violeta por pasta
   (`:828`) e rótulos cortados sem `title` (`:840`).
3. Telas prontas vazias para Empresas e Saúde até o operador aprovar; com
   tudo aprovado, Empresas tem 7 (meta: 12).
4. axe antigo que ficou: `CriandoPage.jsx:119-120`, `MuralPage.jsx:185-186`,
   `CampanhasPage.jsx:37-38`.
5. Marca no celular com logo (`LogoDaMarca.jsx:111`); Início e Alertas com
   25 linhas vermelhas (`DashboardPage.jsx`, `AlertsPage.jsx`); Gmail no
   Suporte (`SupportPage.jsx:16`); Pixabay (`BancoImagensPage.jsx:257`);
   "k1" nos Indicadores.
6. 429 vira "Sem conexão" (`web/src/App.jsx:215`).

**Bloco 6 (8)**
1. 404 cru, sem título, idioma nem link (`server.js:3233`, `:2878`,
   `:3258`).
2. E-mail do código da foto sem moldura (`server/foto-qr.js:139-145`); o
   de confirmar não diz a frente (`server/mail.js`, `verifyEmail`).
3. Nenhum e-mail com logo ou rodapé da empresa.
4. Tabelas da Privacidade sem foco no celular. Falta prova social na
   landing.

**Bloco 7 (8,5)**
1. Desempenho: Peças guardadas (acima); Programação de 25 TVs em 4,2 s.
2. Freio de 600 chamadas contra 29–30 por abertura com 25 TVs: duas
   sessões tomam 429 (`server/limites.js:42`), e o painel mente
   "Sem conexão".
3. `DELETE /api/library/:id` de outra conta responde 200 sem apagar.
4. Acessibilidade: os 6 problemas do bloco 5.
5. Só Chromium; app Android sem versão publicada.

## O que não foi coberto

- Navegadores fora do Chromium, TVs e boxes de verdade. O tema escuro.
- A IA real (Gemini sem crédito): Criar, Criação rápida e o aviso pela
  conversa ficaram no modo simulado. O aviso rápido não foi refeito pela
  tela, só o plano B.
- O envio de e-mail de verdade e o alerta de queda ao vivo (sem provedor).
- O leigo nos 12 cenários do bloco 3 (é outro reteste).
- As telas prontas foram aprovadas **só no banco local** deste teste, para
  ver o que o cliente receberia. Em produção, depende da sua aprovação na
  galeria.
