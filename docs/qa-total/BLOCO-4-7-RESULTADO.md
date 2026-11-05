# QA total — blocos 4 a 7: resultado

05/11/2026, `main` em `91bf4f8`. Servidor **local** na porta 5980
(`STORAGE=local`, `AI_PROVIDER=dev`, cobrança simulada, banco novo). Nada
de produção, nada de IA real. Robô: Playwright + Chromium, axe-core 4
(WCAG 2 A/AA), CDP para 4G e CPU lenta.

Os scripts, as 511 fotos e os JSON brutos estão no scratchpad da sessão,
pasta `b47/` (`crawl.js`, `monta.js`, `out/`, `shots/`).

## Resumo

- **3 telas quebram com dados antigos:** a Programação e o editor da TV
  mostram "Esta tela não abriu"; a lista de Criados e as Peças prontas dão
  erro 500. Nas contas vazia, típica e cheia, nenhuma página quebrou.
- **A TV trava em "INICIANDO EXIBIÇÃO"** se uma frase do letreiro for
  número. A gravação passa no servidor (200), e a TV fica presa.
- O bug da Programação de 05/11 (campanha no ar) **não volta**: a página
  abre nas contas típica e cheia, com campanha no ar.
- Telas, ver agora, recarregar, som, horário e publicar funcionam e são
  rápidos. A troca chega à TV em 0,6 s.
- Site rápido (menos de 0,9 s no 4G lento) e preços certos por frente.
  Os 8 e-mails saem, com um texto errado no "seu teste acabou".
- Segurança segue 9: 12 de 13 tentativas entre contas barradas (a 13ª
  responde 200 sem apagar nada), CSRF barrado e nenhum XSS em 12 campos.

**Nota dos blocos 4–7: 7 / 10.** Fica abaixo do corte por causa das quebras
com dados antigos. São consertos pequenos e todos têm o mesmo remédio:
ler a programação já normalizada.

## As contas montadas (PLANO §3b)

Montadas pela API (e, na antiga, também direto no banco), em **Empresas e
Comércio**:

| Conta | O que tem |
|---|---|
| Vazia | Só o cadastro (teste grátis) |
| Típica | 2 TVs (uma deitada e uma em pé), campanha **no ar** nas duas (itens com `_campanha` na principal, na lateral, no cabeçalho e no rodapé), 10 peças na biblioteca, logo e cores |
| Cheia | 25 TVs em 4 grupos, nomes de 60+ letras, 6 campanhas (4 no ar, 1 pausada, 1 pronta), 300 peças em 10 pastas, 20 fotos, 150 pessoas, peça vencida, aviso urgente, datas passadas, 4 convites, 2 murais |
| Antiga ou estranha | 6 TVs com programação de versões antigas: tema solto e layout que não existe, `items` como texto, item `null`, tipo desconhecido, faixa só com `peca`, letreiro como texto, config corrompida, `[]` e `null`, TV sem nome vista há 40 dias. Campanha sem resultado e com formato antigo, peças vazias, logo quebrada, pessoas sem nome, datas inválidas |

Mais: um operador (`op@qa.local`), 3 cadastros pela landing de cada frente
e 4 contas para os e-mails (fim do teste e atraso).

## Quebras e bugs que dependem dos dados

| # | Onde | Gatilho | O que a pessoa vê |
|---|---|---|---|
| Q1 | `web/src/pages/ProgramacaoPage.jsx:31` | `rodape.messages` não é lista (texto, de versão antiga) | "Esta tela não abriu" na Programação inteira. O mesmo padrão está em `web/src/lib/screenDigest.js:117` e `ContentEditorPage.jsx:282` |
| Q2 | `web/src/pages/ContentEditorPage.jsx:146` | programação gravada como `[]` | Editor da TV: "Esta tela não abriu" (`cfg.zonas` indefinido) |
| Q3 | `web/src/pages/ContentEditorPage.jsx:288` e `:670` | `items` da zona é texto | Editor: "Esta tela não abriu" (`items.map`) |
| Q4 | `ContentEditorPage.jsx:678` → `web/src/lib/contentTypes.js:312` | um item `null` na lista | Editor: "Esta tela não abriu" (`item.type`) |
| Q5 | `server/ajuste.js:76-78` e `server/routes/campanhas.js:42-46` | uma campanha cujo `resultado.telas[].zonas` não tem `cabecalho` ou `rodape` (formato antigo ou geração pela metade) | `GET /api/campanhas` e `/api/campanhas/pecas` dão 500 **para a conta toda**. Criados mostra "erro interno" **e** "Nenhuma campanha ainda" (`CampanhasPage.jsx:82`, `:197`, `:205`); Peças prontas, "Não foi possível…" |
| Q6 | `js/player.js:2280` e `js/storage.js:269` | uma frase do letreiro é número ou objeto. O `normalize` do servidor deixa passar | **A TV fica em "INICIANDO EXIBIÇÃO" para sempre** (conferido por 40 s). Reproduzido com um `PUT` válido (200) numa TV boa |
| Q7 | `js/render.js:2102` | item de tipo desconhecido | A TV mostra "Tipo de conteúdo desconhecido: xyz" no ar |
| Q8 | `js/storage.js:189` | programação que não é objeto (`[]`) | A TV do cliente mostra a demonstração de outra empresa: "Comunicação que valoriza o seu time", "uso de EPI obrigatório" |
| Q9 | `web/src/components/content/LogoDaMarca.jsx:109-111` | conta **com logo**, celular 390 px | A análise da logo fica numa tira de 40 px, cortada ("Tama bom (400×", "Com melhorar") |
| Q10 | `web/src/components/tela/MapaDaTela.jsx:36-44` | zona cujo primeiro item é texto, comunicado, clima ou vídeo | Na Programação e no editor a zona aparece **preta e vazia**, e a TV está mostrando o texto |
| Q11 | `server/lembretes.js:104-112` | conta que nunca pareou TV chega ao fim do teste | O e-mail diz "Seu teste acabou. A TV continua no ar." (visto ao vivo: `rota.fim@qa.local`, 0 TVs) |
| Q12 | `server/aviso-rapido.js:63-68` | a IA falha e entra o plano B (`semIA`) | "Aviso para todas as TVs: hoje o refeitório fecha às 14h" vira "Aviso para : o refeitório fecha às 14h" |

Causa comum de Q1–Q4: o painel usa a programação crua do banco
(`web/src/api.js:119-128`, `deviceConfig.get` e `ler`). A TV normaliza, o
painel não. As TVs pareadas antes do `normalize` no servidor guardam esses
formatos.

O aviso de erro novo funciona: cada quebra chegou ao log do servidor
(`erro.capturado`, `onde: painel`), com página, conta e pilha.

## Bloco 4: Telas e o editor à mão

Conta típica de Comércio, com uma TV de verdade aberta em outra janela.

| Item | FUN | FLU | TXT | VIS | ACE | Veredito | Prova |
|---|---|---|---|---|---|---|---|
| Parear | 9 | 8 | 8 | 8 | 9 | fica | Código " 6lv WN9" digitado no celular pareou em 3,7 s; a TV disse "Tudo certo, Recepção principal" |
| Reconectar | 9 | 8 | 8 | 8 | — | fica | Parear a 2ª TV do mesmo modelo, com a 1ª sem pulso, pergunta "É ela?" (409). Com "outra", entra |
| Grupos | 8 | 6 | 8 | 8 | 9 | melhora | Telas tem os chips com contagem (25 TVs, 4 grupos). A Programação não tem filtro nem busca: 25 TVs numa lista só |
| Ver agora | 9 | 9 | 8 | 7 | 9 | fica | Imagem do que passa em 110 ms. O relógio fica por baixo de "atualizando" |
| Som ao vivo | 8 | 8 | 8 | 8 | 9 | fica | Abre na hora; diz "sem música configurada"; o estado vem da TV |
| Recarregar | 9 | 9 | 8 | 8 | 9 | fica | A TV recarregou em 1,8 s |
| Horário e aviso de queda | 8 | 8 | 8 | 8 | 9 | fica | Dias, horas, o que fazer fora do horário e o e-mail de queda num diálogo |
| Backup e cópia | 8 | 8 | 8 | 8 | — | fica | Está no "Mais opções" (guardar, restaurar, copiar de outra TV). Não refiz o fluxo inteiro |
| Aviso rápido | 8 | 8 | 6 | 8 | 9 | fica | Monta o cartaz e põe em 2 TVs. O plano B sem IA estraga a frase (Q12) |
| Editor: sequência, duração, prévia | 8 | 7 | 8 | 6 | 6 | melhora | Prévia boa; o mapa da TV no topo fica preto para texto e clima (Q10); "Igual ao que está na TV" com contraste 2,36:1 |
| Editor: publicar | 9 | 8 | 8 | 8 | — | fica | Publicou e a TV mostrou o texto novo em 0,6 s |
| Editor: desfazer | 5 | 6 | — | — | — | melhora | Só apagar um item tem "Desfazer". Depois de publicar, não há volta no editor |
| Editor: agenda e prioridade | 8 | — | — | — | — | fica | A peça vencida nunca apareceu (0 de 30 amostras); o urgente tomou a tela em metade do tempo |
| Editor com dados antigos | 2 | — | — | — | — | melhora | Quebra em 3 de 6 TVs antigas (Q2–Q4) |

## Bloco 5: as 29 páginas do painel

Cada página aberta em 8 contas × 2 tamanhos (1366×860 e 390×844), com axe
em todas: cerca de 470 aberturas. Tempos medianos de 0,6 s a 1,2 s; nenhuma
rolagem lateral no celular.

| Página | FUN | FLU | TXT | VIS | ACE | Veredito | Prova |
|---|---|---|---|---|---|---|---|
| Início (Agora) | 8 | 6 | 8 | 6 | 9 | melhora | Vazia: "Comece por aqui" em 3 passos. Cheia: 25 linhas vermelhas "TV x está fora do ar", sem resumo |
| Alertas | 8 | 7 | 8 | 7 | 9 | fica | Bons textos; com 25 TVs, 25 cartões vermelhos iguais |
| Telas | 9 | 8 | 8 | 8 | 9 | fica | Ações em 0,1–1,8 s. Nomes longos cortados sem dica (11 por tela) |
| Relatório de exibição | 7 | 8 | 8 | 8 | 9 | fica | Filtros e CSV certos; vazio honesto. Não houve horas de exibição para ver a tabela cheia |
| Programação | 4 | 6 | 8 | 5 | 9 | **melhora** | Quebra na conta antiga (Q1). Zonas pretas (Q10). Sem filtro com 25 TVs. Com campanha no ar, abre |
| Calendário | 8 | 8 | 8 | 8 | 9 | fica | "Calendário da loja/empresa"; datas passadas recolhidas; data inválida não quebra |
| Editor da TV | 4 | 7 | 8 | 6 | 6 | **melhora** | Ver bloco 4 |
| Criar | 8 | 8 | 8 | 8 | 9 | fica | Ideias da frente (Novembro Azul, segurança do trabalho). IA simulada |
| Criando | 8 | 8 | 8 | 8 | 5 | melhora | No celular o botão "Abrir" fica só com a seta e sem nome (axe crítico, `CriandoPage.jsx:119-120`) |
| Criados | 5 | 8 | 5 | 7 | 7 | **melhora** | Uma campanha antiga derruba a lista (Q5): "erro interno" e "Nenhuma campanha ainda" juntos. Selo "Pausada" 4,08:1 |
| Criação rápida | 8 | 8 | 8 | 8 | 9 | fica | 4 passos, opções por frente |
| Meus Designs | 8 | 7 | 7 | 7 | 9 | fica | 300 peças abrem em 1,4 s. 42 rótulos cortados sem dica |
| Peças prontas | 6 | 8 | 8 | 8 | 9 | fica | Cai junto com Q5 na conta antiga (mostra o erro, não quebra) |
| Telas prontas | 6 | 7 | 5 | 7 | 9 | **melhora** | Empresas e Saúde: "estão chegando". Comércio: só a da ótica, "até sábado, 25 de outubro", também para padaria |
| Arquivos (Fotos, Da IA, Músicas) e StoragePage | 8 | 8 | 8 | 8 | 9 | fica | Nomes longos cortados com dica; no celular a aba "Arquivos" corta em "Arc" |
| Banco de Imagens | 6 | 8 | 6 | 8 | 9 | fica | Acervo vazio aqui; sem chave mostra "falta a chave do Pixabay na configuração" ao cliente |
| Marca | 8 | 8 | 8 | 5 | 9 | **melhora** | No celular, com logo, a análise fica espremida (Q9). Logo quebrada: "Não deu para analisar" |
| Pessoas (aniversariantes) | 8 | 7 | 8 | 7 | 9 | fica | 150 pessoas abrem bem; pessoa sem nome não quebra; nomes longos cortados no celular |
| Indicadores | 7 | 7 | 7 | 8 | 9 | fica | Indicador sem nome aparece como "k1" |
| Mural | 8 | 8 | 8 | 8 | 6 | fica | "Nome do mural" sem ligação com o campo (axe crítico, `MuralPage.jsx:185-186`) |
| Plano | 8 | 8 | 7 | 8 | 9 | fica | R$ 79 / 139 / 159 por frente, igual à landing e à API. "2 de 49 telas" confunde |
| Equipe | 8 | 8 | 8 | 8 | 9 | fica | Convites pendentes com papel e código |
| Ajustes | 8 | 8 | 8 | 8 | 9 | fica | Frente mostrada; troca pelo suporte |
| Suporte | 8 | 8 | 6 | 8 | 9 | melhora | O contato direto ainda é um Gmail pessoal |
| Sistema (operador) | 8 | 8 | 8 | 8 | 7 | fica | Diz o que está faltando e o risco; 2–3 contrastes baixos. Para cliente responde 404, como deve |
| Plataforma (operador) | 8 | 7 | 8 | 7 | 7 | fica | Abre em 2 s; tabelas que rolam sem foco de teclado |
| Cadastro e login | 9 | 9 | 8 | 8 | 9 | fica | Da landing de cada frente: a frente já vem marcada e o painel abre em 4,3 s no celular |
| Telas de espera e de erro | 8 | 8 | 8 | 8 | 9 | fica | "Esta tela não abriu… a equipe já foi avisada" é verdade: o erro chega ao servidor |
| PlaceholderPage | — | — | — | — | — | fica | Só a rede de segurança para rota desconhecida; não aparece no uso |

**axe no painel:** 4 problemas novos, todos dependentes de dados ou do
celular. Críticos: botão sem nome em Criando (celular) e rótulo solto no
Mural (só com mural criado). Sérios: "Igual ao que está na TV" 2,36:1
(`ContentEditorPage.jsx:530`, todas as contas) e o selo "Pausada" 4,08:1
(`CampanhasPage.jsx:38`, só com campanha pausada).

## Bloco 6: site e e-mails

| Página | Tempo (4G lento) | axe | Veredito | Prova |
|---|---|---|---|---|
| `/` | 0,87 s | limpo | fica | Sem tabela de preço, "O preço depende do seu tipo de negócio" |
| `/empresas` | 0,86 s | limpo | fica | R$ 159; anual a partir de R$ 102 |
| `/saude` | 0,88 s | limpo | fica | R$ 139; anual a partir de R$ 90 |
| `/comercio` | 0,84 s | limpo | fica | R$ 79; anual a partir de R$ 51 |
| Termos | 0,5 s | limpo | fica | Exemplo da multa em reais |
| Privacidade e cookies | 0,5 s | 2 tabelas sem foco no celular | fica | Rolam de lado sem dar para chegar pelo teclado |
| Cadastro de cada frente | 4,3 s até o painel | limpo | fica | "Diga quem é a clínica / a loja / a empresa" |
| Página 404 | — | sem título e sem idioma | melhora | Só "Não encontrado: /x", sem link de volta |

Nenhum link interno quebrado. Preços iguais na landing, em `/api/planos`, no
Plano do painel e nos e-mails.

| E-mail | Como saiu | Texto | Visual | Veredito | Prova |
|---|---|---|---|---|---|
| 1. Confirmar o e-mail | modelo (`SKIP_VERIFY` pula o envio) | 7 | 7 | fica | Genérico: não diz a frente, e é o primeiro contato |
| 2. Redefinir a senha | ao vivo, `[mail:dev]` | 8 | 7 | fica | Link de 1 hora; e-mail que não existe recebe a mesma resposta |
| 3. Fim do teste: TV não ligada | ao vivo (varredura de 2 min) | 8 | 7 | fica | Exemplos da frente: "o horário de atendimento, uma dica de prevenção" |
| 4. Faltam 2 dias | ao vivo | 8 | 7 | fica | Preço da frente (R$ 79,00) |
| 5. Acabou | ao vivo | 5 | 7 | melhora | "A TV continua no ar" para quem nunca pareou (Q11) |
| 6. Fatura em atraso | ao vivo | 8 | 7 | fica | Prazos do selo (6 dias) e do bloqueio (16 dias) |
| 7. TV fora do ar | modelo (sem provedor o vigia não roda) | 8 | 7 | fica | Diz qual TV, há quanto tempo e a causa provável; 7 TVs listadas |
| 8. Código da foto | ao vivo | 7 | 4 | melhora | Sem moldura nem fonte: sai em Times. É o único fora do padrão (`server/foto-qr.js:139-145`) |

Nenhum e-mail tem logo, rodapé com a empresa ou endereço. Em produção é
preciso `APP_URL`: sem ele, os e-mails saem sem botão.

## Bloco 7: a base

| Área | Resultado |
|---|---|
| Desempenho | 4G lento (1,6 Mbps, 150 ms, CPU 4×): landing 0,84–0,88 s; login 1,3 s; Programação com 25 TVs pronta em 3,3 s; Meus Designs com 300 peças em 3,1 s; a TV em 1,7 s. No 4G: tudo abaixo de 1,1 s |
| Carga do painel | Programação com 25 TVs faz 30 chamadas ao abrir; parado, 2 por minuto. O freio da conta é 600 chamadas em 5 min (`server/limites.js:42`). Duas sessões navegando rápido na conta cheia levaram 429 em menos de 1 min |
| TV sem internet | 45 s fora: a TV seguiu com a programação, e o clima virou relógio. A mudança feita enquanto ela estava fora chegou 9 s depois de a rede voltar |
| Servidor reiniciado com a TV aberta | Servidor parado 15 s: a TV seguiu. De volta, a mudança chegou em 14,6 s, sem pedir código |
| Dados antigos na TV | Ver Q6, Q7 e Q8. Layout que não existe cai no padrão sem quebrar |
| Segurança entre contas | 12 de 13 tentativas barradas (403/404): ler e gravar programação, comando, renomear, ver agora, som, campanha, mídia, relatório, plataforma, diagnóstico. CSRF de outro site, 403. TV de uma conta lendo a de outra, 403. A 13ª: `DELETE /api/library/:id` de outra conta responde 200 `ok`, mas não apaga nada (conferido); só confunde |
| XSS | `<img onerror>` e `<svg onload>` em 12 campos (TV, grupo, título, letreiro, pasta, rótulo, marca, pessoa, campanha, evento, mural, empresa): nada executou no painel, na TV nem no mural público |
| Cabeçalhos | CSP, `nosniff`, `X-Frame-Options` e `Referrer-Policy` presentes |
| Acessibilidade | Landing, Termos, login e 23 páginas limpas no axe. Os 4 problemas do painel e o 404 estão acima |
| Compatibilidade | `/js/tv.pacote.js` (575 KB) ainda passa no ES2017 e falha no 2016, como deve. Só testei no Chromium. O app Android não tem versão publicada (`/apk/versao.json` dá 404) |

## Os 15 piores, em ordem de conserto

| # | Problema | Conserto |
|---|---|---|
| 1 | A TV trava carregando com uma frase do letreiro que não é texto (Q6) | `String(m \|\| '').trim()` em `js/player.js:2280`; e o `normalize` (`js/storage.js:269`) guarda só frases de texto. Teste com `messages: [3, null, {}]` |
| 2 | A Programação quebra com programação antiga (Q1) | Normalizar no `deviceConfig.get` e `ler` (`web/src/api.js:119-128`) com o mesmo `js/storage.js`; `Array.isArray` em `ProgramacaoPage.jsx:31` e `screenDigest.js:117` |
| 3 | O editor quebra em 3 formatos antigos (Q2–Q4) | O mesmo normalizar na leitura; tirar itens `null` e não-objeto. Teste com as 6 TVs da conta antiga |
| 4 | Uma campanha antiga derruba Criados e Peças prontas (Q5) | `(z.cabecalho \|\| {}).pecas`, `z.principal \|\| []` em `ajuste.js:78` e `campanhas.js:42-46`; isolar cada campanha num `try` na lista. No painel, erro não vira "Nenhuma campanha ainda" (`CampanhasPage.jsx:82`) |
| 5 | Zonas pretas na Programação e no editor (Q10) | Em `MapaDaTela.jsx:36-44`, desenhar os outros tipos com o `ItemPreview` que o editor já usa |
| 6 | Telas prontas: vazio em Empresas e Saúde, e a ótica vencida em todo Comércio | Aprovar uma tela por frente; tirar a da ótica do Comércio ou trocar a data (decisão sua) |
| 7 | Marca quebrada no celular com logo (Q9) | Trocar `min-w-0 flex-1` por `min-w-[14rem] flex-1` em `LogoDaMarca.jsx:111` |
| 8 | A TV mostra "Tipo de conteúdo desconhecido" (Q7) | Pular o item em silêncio e avisar o servidor (`js/render.js:2102`) |
| 9 | A TV com programação corrompida mostra a demonstração de outra empresa (Q8) | `normalize` devolve a programação vazia ("Tudo certo"), não a `sampleConfig` (`js/storage.js:189`) |
| 10 | "A TV continua no ar" para quem nunca pareou (Q11) | Em `lembretes.js:104`, um terceiro texto para `fim` sem TV: "Seu teste acabou. Ainda dá para ligar a TV…" |
| 11 | 25 TVs: Programação sem filtro, Início e Alertas com 25 avisos | Os chips de grupo de Telas na Programação; no Início, "25 TVs fora do ar · ver" quando passar de 3 |
| 12 | 4 problemas de axe no painel | `aria-label` no botão de `CriandoPage.jsx:119`; `htmlFor`/`id` em `MuralPage.jsx:185`; `text-ok` em `ContentEditorPage.jsx:530`; selo "Pausada" com cor mais escura |
| 13 | Freio de 600 chamadas por conta contra 30 por abertura da Programação | Uma rota que devolve as programações de todas as TVs de uma vez; ou contar só gravações no freio |
| 14 | Editor sem "Desfazer" depois de publicar | Gravar o publicar como lote, como a Programação já faz, e mostrar "Desfazer" no aviso |
| 15 | Nomes longos cortados sem dica; Suporte com Gmail; e-mail do código sem moldura; 404 cru; plano B do aviso | `title` nos nomes cortados; e-mail de empresa; o `montar()` de `lembretes.js` no e-mail do código; 404 com título, idioma e link; tirar "para todas as TVs" antes do ":" em `aviso-rapido.js:64` |

## Notas por área, contra o reteste

| Área | Reteste | Agora | Por quê |
|---|---|---|---|
| Segurança | 9 | **9** | Nenhuma conta mexe na outra, CSRF barrado, nenhum XSS |
| Confiabilidade da TV | 9 | **8** | Sem internet e depois do reinício, perfeita. Mas uma frase numérica trava a TV, e lixo vira demonstração |
| Robustez do painel com dados antigos | — | **4** | Área nova. Duas páginas quebram e uma lista dá 500 |
| Desempenho | 8,5 | **9** | Landing abaixo de 0,9 s e painel de 25 TVs em 3,3 s no 4G lento |
| Fluxo (Telas e editor) | 7,5 | **7,5** | Telas rápida e completa. Faltam filtro com 25 TVs e desfazer depois de publicar |
| Profissionalismo visual | 6,5 | **6,5** | Painel consistente; zonas pretas, Marca no celular e Telas prontas pobres |
| Comercial (landing) | 7 | **7,5** | Rápida, preço certo em cada lugar, cadastro já na frente. Falta prova social |
| E-mails | — | **7** | Claros e com o preço da frente. Um texto falso e um fora do padrão |
| Acessibilidade | 8 | **7,5** | Site limpo; 4 problemas novos no painel e o 404 |
| Compatibilidade | 7 | **7** | Pacote ES2017 conferido; só Chromium; app sem versão publicada |
| Conteúdo pronto por frente | 3 | **3** | Igual |

**Por bloco:** bloco 4, 7; bloco 5, 7; bloco 6, 8; bloco 7, 8.

## O que não foi coberto

- Navegadores fora do Chromium, TVs e boxes de verdade.
- A IA real (Criar, Criação rápida e aviso usaram o modo simulado).
- O envio de e-mail de verdade (Resend ou Brevo) e o alerta de queda ao
  vivo, que só roda com provedor.
- O relatório de exibição com dias de dados.
- O tema escuro: o reteste de 03/11 o passou no axe, e não refiz.
