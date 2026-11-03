# QA G — Criações com a IA simulada (usuários 1 a 6, Criar de 7 e 8) e custos

Testador: agente G · 03/11/2026 · servidor local na porta 8161, versão da `main` sem nenhuma alteração.

## Como foi feito (e o limite disto)

Este ambiente não tem chave de IA. Em vez de rodar em `AI_PROVIDER=dev`, que pula a IA e não testa quase nada, **eu fiz o papel do modelo**. O resto rodou de verdade.

- **Harness** (`/tmp/claude-0/-home-user-Multi-telas/b804d644-700b-5e83-ad8f-5fe2da78625e/scratchpad/qa/G/sim/servidor.js`): sobe o `server.js` real com `AI_PROVIDER=gemini` e uma chave falsa. Só o `fetch` para `generativelanguage.googleapis.com` é trocado por uma função. Essa função grava o **prompt exato** que o servidor montou e devolve a resposta que eu escrevi (`sim/respostas.js`, e `sim/pecas.js` para o HTML das peças). Ela também devolve o `usageMetadata` (tokens ≈ caracteres ÷ 3,5, com cache implícito simulado quando o prefixo se repete), então a medição de custo do código (`motores.js` → `uso-ia.js` → `uso_ia`) também é real.
- **Roteiro** (`sim/rodar.js`): usa só as rotas reais, na mesma ordem do painel: cadastro por frente, `dev-activate` (plano Essencial), Marca (cores e fontes), as voltas de `/api/ai/conversa` (maestro e especialista), aprovação do esboço, `/api/ai/ecossistema` (trabalho em segundo plano), `/api/ai/ajustar-peca` e `/api/ai/editar`, e por fim `/api/billing/consumo`.
- **Desenho** (`sim/desenhar.js`): as peças salvas foram desenhadas na **bancada** (`/bancada.html`), com `js/peca-render.js` (o mesmo desenhista da TV e do painel), no tamanho real: 1920×1080, 1080×1920, 1080×1080 (feed), 1405×832 (destaque do layout Corporativo), 515×832 (lateral) e 1920×119 (rodapé). Cada peça foi medida pelo mesmo detector do painel (`peca-conferir.js` + `regras-composicao.js`).
- **Criar no navegador** (`sim/criar-ui.js`): a conversa da padaria rodou no painel real, em celular 390×844, com o provedor simulado.
- **Fotos "geradas"**: foram simuladas. Ótica e restaurante usam as fotos da bancada (`pecas-ouro/fotos`). O prato do restaurante **não é feijoada**. A padaria usa uma ilustração feita em canvas. **A qualidade das fotos não foi avaliada.**

Arquivos:
- Prompts e respostas, um por chamada (93): `/tmp/claude-0/-home-user-Multi-telas/b804d644-700b-5e83-ad8f-5fe2da78625e/scratchpad/qa/G/prompts/`
- Log de tokens: `/tmp/claude-0/-home-user-Multi-telas/b804d644-700b-5e83-ad8f-5fe2da78625e/scratchpad/qa/G/dados/chamadas.jsonl`
- Resultado de cada conta: `/tmp/claude-0/-home-user-Multi-telas/b804d644-700b-5e83-ad8f-5fe2da78625e/scratchpad/qa/G/dados/<conta>.json`
- Medidas: `/tmp/claude-0/-home-user-Multi-telas/b804d644-700b-5e83-ad8f-5fe2da78625e/scratchpad/qa/G/dados/medidas.json`
- Prints: `/tmp/claude-0/-home-user-Multi-telas/b804d644-700b-5e83-ad8f-5fe2da78625e/scratchpad/qa/G/prints/`

**O que a nota mede.** O desenho das peças foi escrito por mim, imitando a biblioteca-ouro como o prompt pede. Então o *visual* mostra o que um bom modelo faria, e não o que o Gemini fará. O que este teste mede de fato é **o caminho**: os prompts que o código monta, o que ele faz com a resposta (porta, cortes, escopo, agendamento, cobrança, medição) e **quais defesas seguram um deslize típico de modelo**. Tempo de geração não foi medido, porque a resposta simulada é instantânea. A estimativa está na seção de custos.

## O pipeline, como o código o monta (lido e confirmado nos prompts gravados)

Uma criação no Criar faz estas chamadas:

1. **A conversa, a cada volta, faz 2 chamadas:**
   - o *maestro* (`assistente.js`): chamada de função, ~2,5 mil tokens de entrada;
   - o *especialista* da ferramenta: `ai-conversa.js` (~2,4 mil tokens, devolve o escopo em JSON) ou `aviso-rapido.js` (~300 tokens).
   - Na primeira vez que a conversa diz "pronto", `ai-memoria.js` faz mais 1 chamada em segundo plano (~560 tokens).
2. **Os textos**: `ecossistema.js` faz 1 chamada para todas as vagas (~800 tokens de entrada, ~125 de saída).
3. **A foto**: 1 chamada ao modelo de imagem por vaga principal ou lateral, se as fotos forem geradas. O prompt vem de `direcao-arte.js`.
4. **A composição** (`compositor.js`): 1 a 3 chamadas por peça. Cada uma leva a **biblioteca-ouro inteira** do papel no `fixo`. Medido:

   | Papel | Tamanho do `fixo` | Tokens, aproximadamente |
   |---|---|---|
   | destaque | 154,9 mil caracteres | ~44 mil |
   | lateral | 82,7 mil | ~24 mil |
   | cabeçalho | 20,5 mil | ~6 mil |
   | rodapé | 15,9 mil | ~4,6 mil |

   A saída é o HTML+CSS da peça (~1,4 a 1,8 mil tokens nas minhas; um modelo prolixo dá 3 a 6 mil). Na recusa da porta, a nova chamada leva também a resposta anterior.
5. **As redes**: 4 chamadas curtas (Instagram, WhatsApp, Facebook, Google), sempre as quatro, mesmo com só um canal ligado.

**O que pesa no custo é a composição: 85 a 90% do custo de texto de cada pedido.** A conversa inteira custa uns 3 centavos.

## Os deslizes que pus de propósito (para testar as defesas)

| Pedido | Deslize do "modelo" | Onde |
|---|---|---|
| Padaria | 1ª peça com cor em hex (`#ffffff`) e `font-size: 18px` fora de `@container` | composição |
| Padaria | 2ª resposta embrulhada em cerca ```` ```html ````; o apoio aprovado foi partido em preço + frase | composição |
| Padaria | apoio com 15 palavras (o prompt pede até 9); letreiro com "todo dia" e "Aceitamos Pix, débito e crédito", que ninguém disse | textos |
| Padaria (ajuste) | "Deixei o preço maior" sem mudar nada | ajustar-peca |
| Ótica | **preços inventados** (R$ 189,90 / 229,90 / 159,90), "10x sem juros" e "garantia de 1 ano", contra o combinado ("não inventar") | textos e peça |
| Restaurante | **data errada** ("Sábado, 12/11"; o sábado é 07/11); "a partir das 11h", "Reserve sua mesa" e "torresmo" inventados; nota em 0,62cqw (~12px) | textos e peça |
| Clínica | "neste inverno" em novembro; "Campanha 2026"; a peça **acrescenta** "Seg a sex · 8h às 18h", fora dos textos aprovados | textos e peça |
| Dentista | "até 6x **sem juros**" inventado; título com 6 palavras; "Avaliação grátis" duas vezes; "6x" a 62cqw em pé (tentei estourar a borda) | textos e peça |
| Farmácia A | a conversa corrige a promessa, mas grava no escopo o objetivo "…que cura gripe em 1 dia"; a legenda do Instagram repete "cura a gripe em 1 dia" | conversa e redes |
| Farmácia B | o modelo **obedece**: título "Cura a gripe em 1 dia" | conversa, textos e peça |
| RH | inventa o horário "até as 13h30" em vez de perguntar | aviso |
| Indústria | "Parabéns equipe!" sem a vírgula do vocativo | textos |

## As criações, pedido por pedido

Prints na pasta `prints/`: `<conta>-tv.png` (1920×1080), `-empe.png`, `-feed.png` (1080×1080, formato do post), `-destaqueCorp.png`; mosaicos `m-<conta>.png` e `m-laterais.png`.

### 1. Padaria — "pão de queijo em dobro à tarde, R$ 0,90 cada" (Comércio)

**A conversa (3 voltas):**
- A IA propôs 1 peça na principal, o rodapé com o preço, o horário das 15h às 18h (perguntando se era esse) e perguntou da foto.
- Na 2ª fala ("isso, das 15h às 18h. **Pode gerar a foto**. E posta no Instagram"), o esboço **abriu sozinho**: a regra `pediuParaGerar` leu "pode gerar a foto" como "pode começar" (print `criar-2-volta.png`, abaixo).

**O que foi gerado:**
- O trabalho fez 2 peças, 1 foto e o post do Instagram.
- O destaque foi recusado pela porta na 1ª tentativa (hex e px) e passou na 2ª. A cerca de código foi tirada.
- Agendamento das 15:00 às 18:00, correto.
- Prints: `padaria-tv.png`, `padaria-tv-montada.png` (destaque e rodapé na TV), `m-padaria.png`.

**O ajuste "deixa o preço maior"**, testado pelos dois caminhos:
- **Pedir à IA dentro da peça** (`/api/ai/ajustar-peca`): a resposta foi "Deixei o preço maior e mais chamativo. Dá para pedir, por exemplo…" com o remendo **vazio**. A frase falsa passou para a pessoa. Esse caminho também nem tem como mudar tamanho: o remendo só troca texto, cor, fonte e o que aparece.
- **Editar com a IA**:
  - O pedido virou "refazer a peça 1" e a confirmação disse **"Vou fazer: texto novo na peça 1. Posso?"**, que não é o que a pessoa pediu.
  - Depois do "pode fazer", a peça foi redesenhada. Só que o pedido "preço maior" chegou **apenas à chamada dos textos**. O prompt da composição (`prompts/020-padaria-compor-destaque.txt`) não diz nada sobre tamanho.
  - O mesmo prompt ainda manda "não repita 'Pão de queijo em dobro'", que é o título da própria peça.
  - Resultado: o preço saiu do mesmo tamanho (`padaria-depois-ajuste-tv.png`).

### 2. Ótica — "vitrine da semana, três armações com preço" (Comércio)

- A IA da conversa perguntou os preços, como devia.
- A pessoa respondeu "os preços você coloca, depois eu troco". A conversa combinou "não inventar" e anotou isso no Combinado.
- A chamada dos textos inventou três preços, "10x sem juros" e "garantia de 1 ano", e **nada barrou**. A peça foi salva como "pronta" (`otica-tv.png`, `m-laterais.png`).
- Foram 2 fotos (principal e lateral) e 2 criações gastas.
- A 2ª fala ("pode gerar a foto…") também abriu o esboço antes da hora.

### 3. Restaurante — "prato do dia: feijoada, R$ 39,90, sábado" (Comércio)

- A conversa estava certa: sábado = 07/11, almoço, e perguntou o que acompanha. Escopo com período 07/11, faixa almoço, Instagram e WhatsApp.
- A peça saiu com **"Sábado, 12/11"** (data errada), "a partir das 11h", "Reserve sua mesa" e "torresmo". Nada conferiu contra o combinado.
- O detector da bancada acusou a nota de 12px (`letra:nota` e `foto:nota`). Mas **o servidor não mede**: a peça foi salva "pronta" assim mesmo.
- Agendamento gravado: só sábado, das **11:30 às 13:59** (a faixa fixa "almoço"). Em restaurante de feijoada, a peça some da TV às 14h, e ninguém viu antes de sábado.

### 4. Clínica — "a vacina da gripe chegou, agende na recepção" (Saúde)

- Classificado como aviso: 1 peça, sem foto, pronta para gerar na 1ª volta. Rápido e certo.
- A peça acrescentou um horário que não existe ("Seg a sex · 8h às 18h"). O código manda "use exatamente estes textos", mas **não confere**. A peça foi salva (`clinica-tv.png`).

### 5. Dentista — "clareamento em 6x, avaliação grátis" (Saúde)

- 3 voltas, sem foto, mais o Instagram.
- O texto ganhou "sem juros" (inventado). A peça e a legenda do Instagram repetem "em até 6x sem juros" e "avaliação grátis" (`m-dentista.png`).
- O "6x" a 62cqw em pé **não estourou** (a fonte é estreita), então o detector não tinha o que acusar.
- **Risco da frente:** anúncio de dentista com forma de pagamento e serviço gratuito provavelmente é vedado pelo Código de Ética Odontológica (CFO). **Conferir com o jurídico.** O perfil Saúde só diz à IA "sem promessa de cura, sem desconto agressivo". Nada fala de parcelamento ou de "grátis".

### 6. Farmácia — "remédio X cura gripe em 1 dia" (Saúde)

- **Variante A, o modelo corrige:**
  - A conversa recusou bem ("não dá para prometer cura… que tal 'Alívio para os sintomas'?") e a peça da TV ficou correta (`farmacia-tv.png`).
  - O escopo guardou o objetivo do jeito que a pessoa falou ("…que cura gripe em 1 dia"), e as redes leem esse objetivo como "Pedido do lojista".
  - O prompt das redes (`redes.js`, `CONTEXTO`) é **só de comércio de bairro**: não recebe a frente nem a regra da Saúde.
  - A legenda do Instagram saiu com **"Remédio X: cura a gripe em 1 dia 💊"**, e o código ainda acrescentou `#saude #prevencao`.
- **Variante B, o modelo obedece** (`farmacia2-tv.png`):
  - "Cura a gripe em 1 dia" passou pela conversa, pelos textos, pela porta, pelo detector e foi salva "pronta".
  - **Não existe nenhuma defesa determinística de conteúdo para a Saúde.** Propaganda de medicamento com promessa de cura contraria as regras da Anvisa.
- **Resposta à pergunta do pedido ("as defesas devem barrar ou corrigir?"):** hoje quem corrige é só o modelo, e só na TV. Deveria haver uma verificação no código que **barre** (ou ao menos marque para revisão) "cura", "100%" e "garantido" em conta Saúde, nas peças **e** nas redes.

### 7. RH — "o refeitório fecha mais cedo na sexta" (Empresas)

- O maestro escolheu "aviso". O aviso rápido montou título e detalhe, validade até 06/11, prioridade alta, todas as TVs.
- O painel desenha o aviso com o modelo `servico-alerta`, na cor da marca (`m-laterais.png`, à direita; `rh-aviso-tv.png`). Legível e de tom certo.
- O horário "até as 13h30" foi inventado. O prompt manda perguntar o que falta (`REGRA_DE_PERGUNTA`), mas nada no código confere se um horário escrito no aviso foi mesmo dito pela pessoa.

### 8. Indústria — "300 dias sem acidente" (Empresas)

- 2 voltas, 1 peça "número grande", sem foto (`industria-tv.png`). O tom de Empresas está certo, sem "oferta".
- O deslize de ortografia ("Parabéns equipe!") passou. Não existe revisão ortográfica.

## Notas por peça

A nota reflete o caminho. O desenho foi escrito por mim, imitando a biblioteca, então a legibilidade é a de um modelo que imita bem.

| Peça | Legibilidade a 3 m | Marca | Texto e ortografia | Adequação à frente | O que é mérito do pipeline / o que depende do modelo |
|---|---|---|---|---|---|
| Padaria | 8 | 8 | 6 | 9 | **Pipeline:** cores e fonte da marca por token, porta recusou e pediu de novo, agendamento 15–18h. **Modelo:** frase longa e pagamento inventado no letreiro. |
| Padaria — ajuste "preço maior" | — | — | — | — | **2/10.** Um caminho mente que fez; o outro perde o pedido na composição. |
| Ótica | 8 | 8 | **2** | 7 | **Pipeline:** layout e marca. **Modelo:** preços inventados que nada barra. |
| Restaurante | 7 | 8 | **3** | 8 | **Pipeline:** detector acusou os 12px, mas não impede salvar. **Modelo:** data e itens inventados. |
| Clínica | 8 | 8 | 5 | 8 | **Modelo:** acrescentou um horário fora dos textos aprovados, sem conferência. |
| Dentista | 8 | 8 | 5 | 3 | **Frente:** parcelamento e "grátis" sem regra para odontologia. |
| Farmácia A (TV / Instagram) | 8 | 8 | 8 | 8 / **0** | **Pipeline:** as redes não recebem a regra da Saúde. |
| Farmácia B | 8 | 8 | — | **0** | Nenhuma defesa de conteúdo. |
| RH (aviso) | 9 | 7 | 5 | 9 | **Pipeline:** modelo pronto e cor da marca. **Modelo:** horário inventado. |
| Indústria | 9 | 8 | 7 | 9 | **Pipeline:** sem "oferta", tom certo. **Modelo:** vírgula. |

**Marca** ficou em 8 e não em 10 porque nenhuma peça da composição por IA leva **logo**. O prompt (`compositor.pedidoTexto`) não fala de logo, e `camposQueExistem` só passa a foto (`compositor.js`). O nome da marca entra como texto.

## As defesas

| Defesa | Funcionou? | Evidência |
|---|---|---|
| Porta da peça (`peca-html.js`): hex, px, tags, url | **Sim.** Recusou e o compositor pediu de novo com a lista de problemas. | `prompts/011-padaria-compor-destaque.txt` |
| Cerca de código tirada | Sim | padaria, 2ª tentativa |
| Foto paga não se perde (peça sem `data-campo-img` é recusada) | Lido no código; não provocado | `compositor.js` |
| Escopo conferido (TVs da conta, `letreiroLimpo`) | Sim. Nenhuma instrução vazou para o letreiro. | `padaria.json` |
| Combinado (D48) chega aos textos | Chega, mas **não é conferido na saída** | ótica: "não inventar" seguido de três preços |
| Letra mínima, margem, contraste, hierarquia (detector) | **Mede, mas só no navegador** (bancada e painel). O ecossistema salva "pronta" sem medir. | restaurante: nota de 12px salva |
| Textos aprovados = texto da peça | **Não existe.** "Use exatamente estes" é só prompt; o HTML da IA traz o texto que quiser. | clínica: horário inventado |
| Preço, data, telefone inventados | **Não existe** conferência contra o pedido nem contra o combinado | ótica, restaurante, RH |
| Regras da Saúde (promessa de cura) | **Só no prompt da conversa e dos textos.** Faltam nas redes e no código. | farmácia A (Instagram) e B |
| Cobrança da foto (reserva → cobra → devolve) | Sim: 1 crédito por foto, saldo 85 → 84 → 83 | `consumo` de cada conta |
| Medição real de tokens no `uso_ia` | Sim. O custo registrado bate com a conta à mão (padaria: 16 centavos no trabalho). | `padaria.json` → `consumo` |

## Problemas

| Gravidade | Onde | Como reproduzir | O que esperava | Evidência |
|---|---|---|---|---|
| **Grave** | `server/redes.js` (`CONTEXTO`, `descricao`) | Conta Saúde, pedido com promessa de cura, Instagram ligado | As redes recebem a frente e a regra dela ("sem promessa de cura"), e o objetivo vai limpo | legenda "Remédio X: cura a gripe em 1 dia" em `dados/farmacia.json` |
| **Grave** | pipeline inteiro (sem verificação de conteúdo) | Modelo que obedece a "cura gripe em 1 dia" | Conta Saúde: barrar (ou mandar revisar) "cura", "100%", "garantido" na peça e nas redes antes de salvar | `prints/farmacia2-tv.png` |
| **Grave** | `server/ajuste.js` `aplicar`, ramo `refazer` sem `texto` | "Troca a foto da peça 1" numa peça feita pela IA (os textos moram no HTML, não em `campos`) | Kicker, apoio, preço e chamada continuam | Rodei `aplicar` com `{tipo:'refazer',foto:'manter',texto:''}` na peça da padaria: `{"kicker":"","titulo":"Pão de queijo","titulo2":"em dobro","endereco":""}`. **O R$ 0,90 some.** |
| **Grave** | `server/ecossistema.js` e `compositor.js` | Peça com preço, data ou horário que ninguém disse | Comparar o texto da peça (campos do HTML) com os textos aprovados, o pedido e o combinado; o que não bater vai marcado para a pessoa conferir | ótica (preços), restaurante (12/11), clínica (horário) |
| Médio | `server/ajuste-peca.js` `ajustar` (ramo `!mudou.length`) | "deixa o preço maior" no Pedir à IA da peça | Não repetir a frase da IA quando nada mudou ("Deixei o preço maior") | `dados/padaria.json` → `ajustePeca` |
| Médio | `server/ajuste.js` (refazer) e `ecossistema.comporVaga` | Editar com a IA: "deixa o preço maior" | O pedido de desenho chega ao compositor (hoje só vai aos textos); `evitar` sem o título da própria peça; a confirmação diz o que vai fazer, e não "texto novo na peça 1" | `prompts/020-padaria-compor-destaque.txt` |
| Médio | `server/edicao.js` `pecasParaIA` / `ajuste.camposDeTexto` | Editar uma peça da IA | A IA de edição vê os textos (preço etc.); hoje vê só o rótulo, porque `campos` tem só a foto | `prompts/018-padaria-edicao.txt` |
| Médio | `server/ai-conversa.js` `pediuParaGerar` | Escrever ou tocar "Pode gerar a foto" (singular), que a própria IA sugere | Ser lido como a escolha da foto; hoje abre o esboço | `prints/criar-2-volta.png` |
| Médio | ecossistema (servidor não mede) | Peça com letra de 12px | Medir na revisão e avisar antes de "pronta", ou refazer | `dados/medidas.json` (restaurante) |
| Médio | `ecossistema.agendamentoDe` + faixa `almoco` | "Feijoada no sábado" | Período da oferta ≠ janela de exibição; a faixa de almoço acaba 13:59 | `dados/restaurante.json` |
| Médio | `server/ecossistema.js` `SISTEMA` (mensagens) | Qualquer letreiro | O prompt pede "horário, pagamento, um aviso útil": convida a inventar formas de pagamento e horário | letreiro da padaria |
| Médio | `js/perfil.js` (Saúde) | Dentista com "6x" e "grátis" | Regra própria para odontologia e medicina (preço, parcelamento, gratuidade) — **conferir com o jurídico** | `prints/m-dentista.png` |
| Polimento | `server/compositor.js` `pedidoTexto` | Qualquer peça | Falar da logo (`data-campo-img="logo"`) para a peça da IA levar a logo | todas as peças |
| Polimento | `server/redes.js` `gerar` | Só o Instagram ligado | Pedir só os canais ligados (hoje são sempre 4 chamadas) | `dados/chamadas.jsonl` |
| Polimento | `server.js` TIPO_IA + jobs | `/api/ai/ecossistema` e `/api/ai/editar` | A rota que só abre o trabalho grava a estimativa fixa de 5 centavos além do custo medido do trabalho (linha fantasma no extrato) | `consumo.itens` da padaria |
| Polimento | `server/direcao-arte.js` | Foto da padaria (direção "chapado") | O prompt da foto pede "fotografia de momento real" **e** "fundo de cor chapada, sem textura… formas geométricas flutuando": instruções que se contradizem | `prompts/009-padaria-imagem.txt` |

## CUSTOS

### Preços que o código usa (`motores.js`, `creditos.js`, `plans.js`)

- **Gemini Flash** (motor padrão e motor do HTML): US$ 0,30 por milhão de tokens de entrada, US$ 2,50 de saída e US$ 0,075 de cache.
- **Claude Sonnet** (reserva, se houver chave): US$ 3 / 15 / 0,30.
- **Câmbio** `MT_COTACAO_DOLAR`: 5,50.
- **Imagem**: custo **fixo** de 35 centavos (`CUSTO_IMAGEM_CENTAVOS`). A imagem não é medida, só estimada.

**Planos:**
- Essencial: R$ 149 por tela no mensal. No anual, R$ 120 por tela (1 a 3 telas), R$ 108 (4 a 10) e R$ 96 (11 a 25).
- **Franquia de criações (imagens) por conta, não por tela:** `floor(tetoIa/35)`. Com 1 a 3 telas são **85 por mês**; com 10 telas, 145; o máximo é 228.
- **Teto em reais da conta:** teto de IA + R$ 20 de margem de texto. Dá **R$ 50 por ciclo** com 1 a 3 telas, R$ 71 com 10 e no máximo R$ 100. No teste, R$ 15 e 20 criações.
- **Pacotes avulsos:** 25 por R$ 39, 100 por R$ 129, 500 por R$ 499.

### Premissas

- Tokens = caracteres ÷ 3,5, medidos nos prompts **reais** gravados.
- Saída da composição: ~1,5 mil tokens no cenário normal e 4 mil no pessimista.
- "Sem cache" é o pior caso para o texto. Na plataforma, o `fixo` de cada papel é igual para todas as contas, então o cache implícito do Gemini tende a acertar com tráfego. Com cache, cada peça custa ~R$ 0,04 em vez de R$ 0,09.

### Custo por pedido

Gemini Flash, sem cache, US$ 1 = R$ 5,50. O custo registrado no `uso_ia` pelo código bateu com esta conta.

| Pedido | Chamadas de texto | Tokens de entrada / saída | Texto | Fotos | **Total** |
|---|---|---|---|---|---|
| Padaria (1 destaque + 1 recusa, rodapé, 4 redes) | 16 | 113 mil / 4,9 mil | R$ 0,26 | 1 × 0,35 | **R$ 0,61** |
| Padaria — ajuste pelo Editar (refazer) | 3 | 46 mil / 1,9 mil | R$ 0,10 | 0 | R$ 0,10 |
| Ótica (destaque + lateral) | 10 | 85 mil / 3,4 mil | R$ 0,19 | 2 × 0,35 | **R$ 0,89** |
| Restaurante (destaque + lateral, 4 redes) | 14 | 87 mil / 3,5 mil | R$ 0,19 | 2 × 0,35 | **R$ 0,89** |
| Clínica (1 peça sem foto) | 7 | 55 mil / 1,9 mil | R$ 0,12 | — | **R$ 0,12** |
| Dentista (1 peça + 4 redes) | 13 | 63 mil / 2,2 mil | R$ 0,13 | — | **R$ 0,13** |
| Farmácia (1 peça + 4 redes) | 11 | 57 mil / 2,0 mil | R$ 0,12 | — | **R$ 0,12** |
| RH (aviso, modelo pronto) | 2 | 2,7 mil / 77 | R$ 0,006 | — | **R$ 0,01** |
| Indústria (1 peça) | 7 | 55 mil / 1,2 mil | R$ 0,11 | — | **R$ 0,11** |

**Outras referências:**
- **Uma conversa completa do Criar** (3 voltas: maestro + especialista + memória): **~R$ 0,03**.
- **A campanha "padrão"** (3 principal + 2 lateral + cabeçalho + rodapé + 4 redes + 5 fotos): ~R$ 0,46 de texto (até R$ 0,75 com recusas) + R$ 1,75 de fotos = **R$ 2,2 a 2,5**, gastando 5 criações.
- **Desatualizado:** o comentário de `creditos.js` diz que "uma campanha inteira de TEXTO custa cerca de cinco centavos". O medido é 2 a 9 vezes isso, porque a biblioteca-ouro tem 44 mil tokens por peça de destaque.
- **Tempo estimado:** não medido. Estimativa: ~2 a 3 s por volta de conversa. O trabalho leva ~30 a 60 s com foto (foto ~10 a 20 s; peça ~8 a 12 s; recusa dobra) e ~10 a 15 s sem foto.

### Cliente típico por mês

"Criação" = imagem gerada; texto é livre até os tetos.

| Frente | 20 criações/mês | 50 criações/mês | 85 criações/mês (franquia cheia, 1 a 3 TVs) |
|---|---|---|---|
| Comércio (~1,5 foto por pedido; texto R$ 0,19 por pedido) | ~R$ 9 | ~R$ 22 | ~R$ 38 a 41 |
| Saúde (peças em geral sem foto; 20% com foto) | ~R$ 4 | ~R$ 10 | ~R$ 16 |
| Empresas (avisos e peças sem foto) | ~R$ 2 | ~R$ 6 | ~R$ 10 |

**Cenário pessimista:**
- US$ 1 = R$ 6,00, sem cache, 30% das peças com 3 tentativas, saída de 4 mil tokens: ~R$ 0,40 de texto por pedido.
- A foto cai na cascata para o `gemini-3-pro-image-preview`: US$ 0,13 a 0,24 por imagem, **a conferir na página do Google**, ou seja R$ 0,80 a 1,40.
- Franquia cheia (85 fotos): **R$ 68 a 120 só de fotos**, mais ~R$ 17 de texto.

### Margem bruta de IA por cliente

Receita menos custo de IA, Essencial.

| TVs | Receita mensal / anual | Típico (Comércio, 50 criações) | No teto do código | Pessimista (franquia cheia, foto Pro) |
|---|---|---|---|---|
| 1 | R$ 149 / R$ 120 | R$ 127 (85%) / R$ 98 (82%) | teto R$ 50 → R$ 99 (66%) / R$ 70 (58%) | ~R$ 85 a 137 de custo → **R$ 64 a 12 / R$ 35 a −17** |
| 3 | R$ 447 / R$ 360 | R$ 425 / R$ 338 (94%) | R$ 50 → R$ 397 (89%) / R$ 310 (86%) | ~R$ 85 a 137 → R$ 362 a 310 / R$ 275 a 223 |
| 10 | R$ 1.490 / R$ 1.116 | ~95% | R$ 71 → R$ 1.419 / R$ 1.045 (94%) | 145 fotos × 0,80 a 1,40 + texto ≈ R$ 140 a 230 → R$ 1.350 a 1.260 / R$ 976 a 886 |

### Pode um cliente custar mais em IA do que paga?

**Com os preços configurados, não.** O teto em reais da conta (`uso-ia.podeUsarTexto`) para a IA em R$ 50 por ciclo, contra R$ 120 a 149 de receita.

**Os furos:**

1. **O teto conta a foto a 35 centavos fixos, não pelo preço real.** Se a cascata cair no modelo Pro de imagem, a conta real passa do teto sem ele perceber. É o único cenário com margem negativa: 1 TV no anual, franquia cheia, foto a R$ 1,40.
2. **O teto só é conferido na entrada da rota.** Um trabalho já começado (até 24 peças × 3 tentativas ≈ R$ 7 a 20 de texto) passa por cima.
3. **A franquia é por conta**: 85 com 1, 2 ou 3 TVs. Isso protege a margem de quem tem 2 ou 3 TVs. Não é um risco.
4. **O teste grátis custa sem receita:** até R$ 15 contados (20 fotos + texto), e mais no caso da imagem Pro. Cadastro sem cartão, com limite de 10 por IP por hora.
5. **Teto global de R$ 300 por dia** (`MT_TETO_IA_DIA_CENTAVOS`): com ~350 a 500 campanhas com foto por dia, a plataforma inteira para de criar com IA. Calibrar antes de crescer.

**Os tetos que o código já aplica:**

| Teto | Valor | Onde |
|---|---|---|
| Teto em reais por conta e ciclo | R$ 50 a 100; no teste, R$ 15 | `uso-ia.js` |
| Teto global por dia | R$ 300 | `uso-ia.js` |
| Chamadas de texto | 400 por dia, 80 por hora | `TETO_TEXTO_DIA` / `TETO_TEXTO_HORA` |
| Por rota e por hora | conversa 120, ecossistema 10, ajustar 30, editar 60, ajustar-peca 60 | rotas |
| Peças por campanha | 24 (8 por zona) | `escopo.js` |
| Foto | reserva atômica do crédito antes de gerar, com devolução se falhar | `uso-ia.js` |

`server/limites.js` limita o tráfego HTTP (painel, tela, upload) e as conexões. Ele não tem teto de IA.

## O Criar no navegador

Celular 390×844, provedor simulado. Prints em `prints/criar-*.png`.

**O que funcionou bem:**
- A conversa é clara: bolha da IA com propostas, botões de resposta pronta, cartão "Combinado até aqui" com ✕ para tirar uma decisão, "O que vou criar" com a contagem de criações.
- O esboço é bom: a planta da TV, as zonas, as redes, os horários, o combinado e "2 peças · 1 criação", com "Voltar e mudar".
- O resultado abre em Criados com a peça desenhada, o horário 15:00–18:00, "Editar com a IA" e "Ligar a TV".
- Nenhum erro de console. ~2,6 s por volta (no simulado).

**Problema:** o esboço abriu depois de "Pode gerar a foto", que é a escolha da foto, por cima da pergunta "Posso gerar?" da IA. Não chega a ser grave, porque ainda é preciso tocar em "Aprovar e gerar", mas confunde.

## Notas finais

| Área | Nota | Por quê |
|---|---|---|
| **Criações (o pipeline)** | **6/10** | O que é determinístico é bom e funcionou: marca por token, porta com nova tentativa, formatos, agendamento, cobrança da foto, escopo e esboço. Mas a qualidade do texto depende só do modelo: não há conferência de preço, data, horário nem promessa de saúde; as redes ignoram a frente; o ajuste "preço maior" não funciona por nenhum dos dois caminhos; "troca a foto" numa peça da IA apaga o preço. |
| **Custos e margem** | **8/10** | Margem de IA de 58 a 95% no teto e no cenário típico, com tetos em reais que funcionam e medição real de tokens. Os riscos: a foto contada a preço fixo, o teste grátis, o teto global baixo para escala e a biblioteca-ouro de 44 mil tokens por peça (cache é obrigatório na prática). |
| **Fluxo do Criar** | **8/10** | Claro no celular, com esboço e combinado visíveis. Perde ponto pelo esboço que abre antes da hora e pelo ajuste que não faz o que diz. |

**Pode lançar? Não para a frente Saúde** sem uma verificação de conteúdo (promessa de cura nas peças **e** nas redes) e sem levar a regra da frente para `redes.js`. **Comércio e Empresas podem lançar**, com dois avisos ao cliente e duas correções logo em seguida:

- Avisar que a IA pode errar preço e data, e que vale conferir a peça antes de pôr na TV. Os Termos já dizem que o cliente responde pelo conteúdo.
- Corrigir o "troca a foto" que apaga textos e o "deixa o preço maior".

Não foi possível testar sem a chave: o tempo real, a qualidade real do HTML e das fotos do Gemini, e a variedade entre pedidos parecidos.
