# QA — usuários 7 (RH), 8 (Gestor de indústria) e 14 (Financeiro)

Agente F · 03/11/2026 · servidor local da `main` (porta 8151, `AI_PROVIDER=dev`,
sem `ASAAS_API_KEY`, sem e-mail configurado — o código do QR sai na própria
página, como em desenvolvimento). Navegador: Chromium/Playwright. Celular
390×844 e 360×800, computador 1366×900, TV 1920×1080 (pareada de verdade,
com print do que a `/tv` mostra).

Prints e scripts: `/tmp/claude-0/-home-user-Multi-telas/b804d644-700b-5e83-ad8f-5fe2da78625e/scratchpad/qa/F/`
(abaixo, só o nome do arquivo; os scripts estão na subpasta `s/`).

**Sem IA:** nenhuma criação de IA recebeu nota. O "Aviso rápido" foi testado
porque, sem IA, ele cai na regra de frases (`server/aviso-rapido.js`).

---

## Usuário 7 — RH de metalúrgica (MultiTelas Empresas), celular e computador

**Quem é:** analista de RH da "Metalúrgica Aço Forte". Quer a TV do
refeitório com aniversariantes, mural de fotos, comunicados e avisos de
segurança, sem depender de TI.

### Jornada

| # | O que fez | O que aconteceu | Tempo / toques | Print |
|---|---|---|---|---|
| 1 | Landing `/empresas` → "Testar 14 dias grátis" | Abre `/app/?frente=empresas` na aba **Entrar**, não em "Criar conta" (1 toque a mais). "Começar o teste" e "Assinar" da seção de preço vão para `/app` sem a frente. | — | rh-01, rh-02 |
| 2 | Criar conta no celular (Empresa já marcada) | Conta criada, Início com "Comece por aqui". | 4,4 s · 5 toques | rh-03, rh-05 |
| 3 | Telas → "Ligar a primeira TV" → código + nome "Refeitório" | Pareou. **A TV da metalúrgica passou a mostrar a tela pronta da ótica: "ÓCULOS DE SOL 30% OFF · R$ 189,90 · Oferta válida até sábado, 25 de outubro" (data já vencida), rodapé "10x sem juros / Exame de vista".** O painel diz: "está mostrando 'Ótica Central · Semana do Sol', uma tela pronta com a sua marca". | 5,5 s · 4 toques | **rh-08, rh-09** |
| 4 | Pessoas → "Pôr uma pessoa" ×3 (nome, aniversário, setor, cargo, e-mail) | Funciona; resumo "Próximos aniversários" bom; selo "À mão". | 4,2 s / 19 toques para 3 pessoas | rh-10, rh-11 |
| 5 | Foto na linha da pessoa (toque no rosto) | Sobe e aparece. | 2 toques | rh-11 |
| 6 | Ligar "Mostrar nas TVs, na semana do aniversário" | Vem **desligado** por padrão. Ligado, a TV continuou na tela de espera ("Tudo certo, Refeitório"): sem nenhum conteúdo na TV o aniversário não entra. | 1 toque | rh-12, rh-14 |
| 7 | Biblioteca → Peças prontas → "Comunicado interno" → Usar → trocar textos → Salvar → Pôr na TV | Editor claro, avisa "Cabe na TV deitada, em pé e na quadrada". TV mudou em ~12 s. Comunicado legível a 3 m. | ~25 s · 7 toques | rh-19, rh-21 |
| 8 | Aniversário automático | Com conteúdo na TV, "🎉 Feliz aniversário · Ana Souza · Operadora de prensa · Hoje!" com a foto entra sozinho no rodízio. | — | **rh-22** |
| 9 | Pessoas → "Pedir fotos pelo QR" | Pedido de 14 dias aberto; link `/f/CODIGO`; o QR "Mande sua foto para as TVs da empresa" entra sozinho na TV. | 1 toque | rh-23, rh-32-tv-roda-1 |
| 10 | Celular de outra pessoa (360 px) abre `/f/…`: e-mail → código → nome/aniversário/setor → foto → autorização → enviar | Funciona para quem está na lista ("Olá, Ana!") e para quem não está (entra como pessoa nova). Campos só com placeholder (o rótulo some ao digitar). | 8 s · 10 toques (novo) / 7 (já na lista) | rh-25…rh-28 |
| 11 | RH aprova as 2 fotos | João entrou na lista (selo "QR"), Ana ganhou a foto. | 2 toques | rh-30, rh-31 |
| 12 | Mural de fotos → "Criar meu primeiro mural" → outra pessoa manda foto por `/m/CODIGO` | A foto entra **sem aprovação** ("1 aprovadas"). A página pública promete "aparece na tela em segundos", mas o mural vem com "Mostrar nas TVs" desligado: nada aparece até o RH ligar. | 6 s · 4 toques (público) | rh-35…rh-39 |
| 13 | Ligar "Mostrar nas TVs" do mural | Toast "Pronto: as TVs mostram sozinhas"; a TV aberta não recebeu aviso (não há push, `PUT /api/automaticos` não chama `avisarTelas`); entrou depois, pela atualização de 60 s. Mural legível. | — | rh-40, **rh-42-tv-ciclo-3** |
| 14 | Programação → "Pedir à IA" → "aviso urgente: vazamento de óleo na prensa 3, área isolada só hoje, use o corredor B" → Pôr na TV | Montou sozinho: título, detalhe, "até 03/11", prioridade Urgente. **A TV foi tomada em 5,5 s** com cartaz amarelo/preto "URGENTE · Vazamento de óleo na prensa 3", ótimo a 3 m. | 14 s · 4 toques | rh-44, rh-45, **rh-46** |
| 15 | Some depois? (relógio da TV adiantado) | Às 18h30 de hoje o urgente ainda passa 3× por volta; amanhã às 8h **sumiu** sozinho. | — | rh-48-tv-relogio-* |
| 16 | Importar planilha CSV (`;`, data `15/11/1985` e `1988-11-20`) | Prévia "2 novas · 4 do QR ou à mão ficam · 2 linhas sem nome ou data"; importa certo. Não diz **quais** linhas foram ignoradas. | 3 toques | rh-49 |
| 17 | Peça pronta "Aniversariantes do mês" | Vem com nomes inventados de **outubro** (Carlos Lima, Ana Ribeiro…), não puxa a lista de Pessoas. | — | rh-50 |
| 18 | Telas prontas (Empresas) | "As telas prontas do seu tipo de negócio estão chegando" — **zero** para Empresas; "Ver todas" mostra só a da ótica. | — | rh-17-telasprontas |

Medição no celular (390 px, `medir.js`): Pessoas, Mural, Indicadores, Plano e
Peças sem rolagem lateral; 1 alvo < 44 px em Pessoas; menor fonte 12 px.
Sem erro de console no painel nem na TV durante toda a jornada.

### Notas

| Critério | Nota | Por quê |
|---|---|---|
| Fluxo | 7 | Pessoas, QR com aprovação, aviso urgente e comunicado são rápidos e sem beco; perdem pontos o "mostrar nas TVs" desligado por padrão (aniversário e mural), a TV vazia que não mostra aniversário, e o mural que promete "em segundos" e não aparece. |
| Profissionalismo | 4 | A primeira coisa que a metalúrgica vê na parede é uma promoção de óculos com preço e data vencida, com o nome dela em cima; o resto (painel, página do QR, cartaz urgente) é limpo e bem escrito. |
| Criações (sem IA) | 6 | Peças da frente (comunicado, aniversariante, vaga, boas-vindas) são legíveis a 3 m e com a marca; mas nenhuma tela pronta de Empresas, nenhuma peça de segurança do trabalho, "Aniversariantes do mês" com nomes fictícios e layout de TV com o nome da empresa repetido em lateral e rodapé (rh-21). |

---

## Usuário 8 — Gestor de indústria (Indicadores e segurança do trabalho)

**Quem é:** gerente de produção da "Plásticos Vale Industrial". Quer
produção do dia, OEE, refugo e dias sem acidente na TV do chão de fábrica,
alimentados pelo ERP (Protheus) por endpoint.

### Jornada

| # | O que fez | O que aconteceu | Print |
|---|---|---|---|
| 1 | Pessoas e indicadores → Indicadores → "Receber do sistema" | Abre o token **uma vez** com o `curl` pronto para copiar, já com o token. Texto claro ("Copie agora… dá para gerar outro"). | ind-02 |
| 2 | `curl` do exemplo | `{"ok":true,"recebidos":1}` | — |
| 3 | `curl` como o ERP mandaria: `"8.450"`, `"78,5%"`, `"10.000"`, `127`, `"2.3"` | Todos lidos certo (8450, 78,5, 10000, 127, 2,3). Objeto simples `{"Faturamento":"R$ 1.234.567,89"}` → 1234567,89. | — |
| 4 | Pôr na TV (3 cartões) | Cartão na TV: rótulo, número enorme, unidade, **variação ▲ 7,7%**, barra e "91% da meta de 10.000 pç", "Atualizado às 17:54". Muito bom a 3 m. | ind-05, **ind-06-tv-outro** |
| 5 | Número de 5 dígitos (10.300 pç) | **O número estoura a caixa: o "1" sai cortado à esquerda e a pílula da variação sai cortada à direita.** | **seg-04b-tv-ultimo** |
| 6 | Refugo 2,6% com meta 2% | TV e painel: "🎉 **Meta batida!** 130% de 2%" e ▲ verde. Para indicador "quanto menos melhor" (refugo, acidentes, faltas) o cartão comemora o que é ruim. | ind-07, ind-09 |
| 7 | ERP manda o formato simples `{"producao":10250}` depois | A mesma chave é **sobrescrita**: nome vira "producao", unidade e **meta somem** (painel e TV). | ind-10, ind6 log |
| 8 | TV recém-ligada (cache vazio) | Primeiro giro do cartão: "— Esperando o primeiro número", embora o número exista; só no giro seguinte (~38 s) mostra. | ind6 log |
| 9 | Erros de token | Sem token → 401 "token inválido"; token errado → 401; token sem "Bearer" e `X-Token` → aceitos; token novo → o antigo passa a 401 na hora. | log ind |
| 10 | Erros de corpo | JSON quebrado → 400 "nenhum indicador…" (não diz que o JSON está inválido); `GET` → 401 "não autenticado"; 80 indicadores → aceita 50 em silêncio; `"1,234.56"` (formato americano) → **1,23456** (1000× menor, sem aviso). | log ind |
| 11 | Limite | 240 envios/hora; o 241º responde 429 "no máximo **4 por minuto**" com `Retry-After: 3247` (54 min sem número na TV). A frase não descreve a regra real. | log ind |
| 12 | Conector "Buscar de um endereço" | Recusa `ftp://`, recusa `http://` com senha, recusa IP interno ("esse endereço aponta para uma rede interna") — correto. | log ind |
| 13 | Segurança do trabalho nas peças/telas prontas | Busca "segurança" em Peças prontas: **nada**. A tela pronta "Segurança e metas" existe só como `proposta` (não aprovada). Contorno: "Número grande" → "127 dias · Sem acidente com afastamento · Use EPI…" fica bom, mas vem com texto da ótica ("Cuidando da visão do bairro", "Exame de vista…", "Rua Augusta, 1200", "Desde 2001") e é estático (não liga ao indicador). | seg-N-mero-grande, seg-03 |

### Notas

| Critério | Nota | Por quê |
|---|---|---|
| Fluxo | 8 | Do botão ao número na TV em menos de 2 minutos, com `curl` pronto e token claro; perde pelos erros de corpo pouco explicativos e pelo limite com frase errada. |
| Profissionalismo | 6 | O cartão KPI é o melhor visual da frente, mas corta número de 5 dígitos, comemora refugo acima da meta e mostra "Esperando o primeiro número" depois de religar. |
| Criações (sem IA) | 4 | Para indústria não há uma peça de segurança do trabalho (EPI, dias sem acidente, CIPA, rota de fuga) nem tela pronta de Empresas aprovada, embora a landing prometa "modelos de… segurança". |

---

## Usuário 14 — Financeiro

**Quem é:** financeiro do "Grupo Alfa Logística", que precisa entender quanto
paga, o que trava e como cancelar.

### Jornada

| # | O que fez | O que aconteceu | Print |
|---|---|---|---|
| 1 | Plano e cobrança em conta nova | "Teste grátis · Faltam 14 dias de teste · sem cartão · 0 de 1 tela", 20 criações "valem até 17/11", 85/mês assinando, mensal × anual para as telas da conta, planos (Teste, Essencial R$ 149, Pro "Em breve" R$ 179, Enterprise), régua de atraso explicada. Aviso "Cobrança em modo simulado". | fin-01, fin-03 |
| 2 | Parear a 2ª TV no teste | Diálogo: "limite do plano atingido (1 tela). Faça upgrade para adicionar mais." + "Ver planos". API 402 `plan_limit`. | fin-02 |
| 3 | "Assinar (mensal)" no celular → checkout simulado → "Confirmar assinatura" | Volta com "Assinatura atualizada. Bem-vindo ao novo plano!", "Em dia · Mensal, sem contrato · R$ 149 por mês · próxima cobrança em 03/12/2026", 85 criações. 6,4 s, 2 toques. A página simulada mostra "R$ 149,00 /mês · Até 49 telas" (não diz "por tela"). | fin-04, fin-05 |
| 4 | Parear 2ª TV pago | Pareia; "R$ 298 por mês · 2 telas, R$ 149 cada em média"; "Mais uma tela: + R$ 149". | fin-06 |
| 5 | Pacote "+25 criações · R$ 39" | Em modo simulado credita na hora (110 = 85 + 25, "25 delas não vencem"), sem confirmação nem aviso. | fin-06 |
| 6 | Atraso 4 / 11 / 21 dias (data forçada no banco) | Faixa do painel certa em cada fase ("Em 6 dias… selo; em 16… pausados" / "estão mostrando um selo" / "estão pausados"). 4 e 11 dias: pareia. 21 dias: 402 "Há uma fatura em atraso há mais de 20 dias…" e o Aviso rápido responde 402 "Pagamento em atraso". | fin-07-* |
| 7 | Selo na TV | Teste vencido: "MultiTelas · versão gratuita" no canto, 17 px. Pareamento bloqueado: "Seu teste de 14 dias terminou. Escolha um plano para ligar sua tela." Assinando, o selo **continua até 5 min** (cache `seloDaConta`, `server.js:282`). Atraso de 11 dias: ver resultado abaixo. | fin-09, fin-12 |
| 8 | Anual (contrato marcado no banco, 4 meses de uso, 2 telas) | "Contrato anual · R$ 240 por mês · R$ 120 cada"; ao cancelar: "faltam 8 meses: pelo contrato, a multa fica em R$ 576. A equipe confirma o valor com você antes de cobrar." Conta certa (30% × 240 × 8 = 576 > (298−240)×4 = 232). | fin-14 |
| 9 | Cancelar (mensal) | Texto: "Suas telas continuam no ar **até o fim do período já pago**, e depois a conta volta para a versão gratuita". Na prática o plano cai para grátis **na hora** ("Cancelado", "2 de 1 tela · acima do limite"). Com Asaas, o webhook `SUBSCRIPTION_DELETED` faz o mesmo (`server/cobranca.js`, caso `SUBSCRIPTION_DELETED`). | fin-15 |
| 10 | Números landing × `/api/planos` × painel × e-mail | **Batem**: 149 mensal; anual 120/108/96 por faixa (5 telas R$ 576; 12 telas R$ 1.308); 26+ a combinar; 20 criações no teste; 85 até 3 telas, 228 no máximo; Pro R$ 179 em breve; e-mails dizem "R$ 149,00 por tela, por mês". | fin-13 |
| 11 | Cortesia (`CONTAS_CORTESIA`) | ver abaixo | fin-16 |

**E-mails (lidos de `server/lembretes.js`, gerados pela função):**
- *2 dias, sem TV:* "Abra… o endereço **/tv** no navegador da Smart TV… e escolha um modelo pronto — **o cardápio, uma promoção**." Sem domínio e com exemplo de comércio para todas as frentes.
- *2 dias, com TV:* claro: preço, o que acontece se não assinar (selo, sem tela nova).
- *Acabou:* "Assinando o Essencial (R$ 149,00…), o selo **sai na hora**" (sai em até 5 min).
- *Atraso 3 dias:* claro, com os prazos do selo e da pausa; "A fatura em aberto está no painel, em Plano".
- Nenhum e-mail fala do anual; nenhum diz como cancelar.

**O que aconteceria com o Asaas (leitura de `server/billing.js`, não testado com chave):**
assinatura `billingType: 'UNDEFINED'` → a fatura do Asaas deixa escolher
Pix, boleto ou cartão; primeira cobrança vence hoje; CPF/CNPJ pedido no
painel antes ("CPF ou CNPJ de quem paga… para emitir a cobrança **e a
nota**"); assinatura reaproveitada para não cobrar duas vezes; valor
acompanha as telas (`updatePendingPayments`, sem proração). **Nota fiscal:**
não há nenhuma chamada de emissão de NFS-e no código — só sai se alguém
configurar a emissão automática no painel do Asaas. Não verificável daqui.

### Notas

| Critério | Nota | Por quê |
|---|---|---|
| Fluxo | 8 | Assinar em 2 toques, pacote em 1, cancelar em 2, régua de atraso visível desde o 1º dia; perde pela 2ª TV com "faça upgrade" sem preço e pelo selo que não sai na hora. |
| Profissionalismo | 7 | Textos de cobrança honestos e em português de gente ("Nunca desligamos sua tela por causa de fatura"); "upgrade", "Popular/Mais escolhido" sem base, e "R$ 149 cada em média" com preço fixo destoam. |
| Comercial (cobrança) | 6 | Preço claro e igual em todo lugar, simulador bom, anual com multa em número; mas a promessa de cancelamento ("até o fim do período já pago", também nos Termos §3) não é o que o sistema faz, o link da fatura vencida não aparece para quem está em atraso (abaixo), a nota fiscal não é garantida e o anual só existe por conversa (sem termo nos Termos de Uso). |

---

## Problemas

| # | Gravidade | Onde | Como reproduzir | O que esperava | Evidência |
|---|---|---|---|---|---|
| 1 | **Bloqueador** (frente Empresas e Saúde) | `pecas-ouro/manifesto.json` (única tela `aprovada` é `otica-semana-do-sol`); `web/src/lib/telasProntas.js:189` (`telaParaComecar` cai em `telas.find(cabe)`) | Conta Empresas nova → parear a 1ª TV | TV de uma metalúrgica não pode mostrar "Óculos de sol 30% OFF, R$ 189,90, oferta válida até 25 de outubro". Esperava uma tela de Empresas ou a tela de espera. É a primeira impressão da jornada 7 (veredito), na parede do refeitório, com o nome da empresa em cima. | rh-08, rh-09 |
| 2 | Grave | `pecas-ouro/manifesto.json` (telas `l1-empresa-*` em `proposta`), Telas prontas | Biblioteca › Telas prontas numa conta Empresas | Ao menos as 6 telas de Empresas aprovadas antes de lançar; hoje "estão chegando" e "Ver todas" só tem a ótica. | rh-17-telasprontas |
| 3 | Grave | Peças prontas; landing `/empresas` (FAQ "modelos de… segurança") | Buscar "segurança" em Peças prontas | Peças de segurança do trabalho (dias sem acidente, EPI, CIPA, rota de fuga). Não existe nenhuma; o gestor de indústria precisa adaptar "Número grande". | busca vazia, seg-03 |
| 4 | Grave | `web/src/pages/BillingPage.jsx` (confirmação do cancelamento), `server/legal.js:44` (Termos §3) × `server/cobranca.js` (`SUBSCRIPTION_DELETED` → `plan: 'free'`) e `server/routes/billing.js` (simulado) | Plano → Cancelar assinatura → Confirmar | O que o texto e os Termos prometem: plano pago até o fim do período já pago. O sistema rebaixa na hora (IA, relatório, equipe, telas extras "acima do limite"). Risco de CDC/Procon. | fin-15 |
| 5 | Grave (lido no código, sem Asaas) | `server/billing.js`, `assinatura()` busca só `status: 'PENDING'` | Conta em atraso com Asaas → Plano | A faixa diz "A fatura está em 'Sua assinatura', logo abaixo", mas fatura vencida no Asaas é `OVERDUE`: o link não aparece justamente para quem precisa pagar. | código |
| 6 | Grave | `js/render.js` (`renderKpi`, `.mt-kpi-value`) | Indicador com 5 dígitos ou mais (10.300 pç) na TV | Número inteiro dentro da caixa (reduzir a fonte); hoje o 1º dígito e a variação saem cortados. Produção e faturamento quase sempre têm 5+ dígitos. | seg-04b-tv-ultimo |
| 7 | Médio | `js/render.js` (`kpiAoVivo`, `meta`), `IndicadoresPage.jsx` | Refugo 2,6% com meta 2% | Indicador "quanto menos, melhor" (campo `sentido`/"menor é melhor"): hoje mostra "🎉 Meta batida! 130%" e ▲ verde. | ind-07, ind-09 |
| 8 | Médio | `server/kpis.js` `daEntrada` (objeto plano) + `db.gravarIndicadores` | Mandar `{"producao":10250}` depois de ter mandado a lista completa | Manter nome, unidade e meta já cadastrados; hoje são apagados. | ind-10 |
| 9 | Médio | `server/kpis.js` `numero()` | `"valor":"1,234.56"` | Recusar ou avisar formato ambíguo; hoje grava 1,23456 em silêncio. | log ind |
| 10 | Médio | `server/routes/kpis.js` `entrada` | 241 envios na hora | Frase do 429 igual à regra (240 por hora) e janela menor que 54 min; ou dizer "4 por minuto" e aplicar por minuto. JSON inválido deveria responder "JSON inválido". | log ind |
| 11 | Médio | `js/player.js:348` `loadKpis` | Ligar a TV com cartão KPI e cache vazio | Esperar o número antes de mostrar o cartão; hoje "— Esperando o primeiro número" no 1º giro. | ind6 log |
| 12 | Médio | `MostrarNasTVs` (aniversários e mural) e `server/automaticos.js` `VAZIO` | Pôr pessoas / criar mural | A landing diz "Suba a lista uma vez; a TV parabeniza no dia certo" e a página do mural diz "aparece em segundos"; ambos vêm desligados. Ligar por padrão (ou ligar ao criar o mural). | rh-12, rh-36…rh-39 |
| 13 | Médio | `server/routes/telas.js:787` (`PUT /api/automaticos` sem `avisarTelas`) | Ligar "Mostrar nas TVs" com a TV aberta | TV atualizar na hora, como o toast diz; hoje espera a volta de 60 s. Lista de aniversariantes da TV só recarrega a cada 6 h (`js/player.js:340`) se nada mais mudar. | rh-17 log |
| 14 | Médio | Mural (`server.js:964`) | Qualquer pessoa com o QR manda foto e mensagem | Opção "aprovar antes de ir para a TV" (existe no QR de Pessoas). Numa TV de fábrica, foto/mensagem ofensiva vai ao ar até alguém ver; o painel chama de "aprovadas" o que ninguém aprovou. | rh-39 |
| 15 | Médio | TV sem conteúdo | Ligar aniversários com a TV só pareada | O cartão de aniversário/QR deveria entrar mesmo sem programação (hoje fica "Tudo certo, Refeitório"). | rh-12, rh-15 |
| 16 | Médio | Peça "Aniversariantes do mês" | Usar a peça | Preencher com as pessoas do mês da lista; vem com 6 nomes inventados de outubro. | rh-50 |
| 17 | Médio | Peça "Número grande" (e outras de exemplo) em conta Empresas | Usar | Limpar texto da marca de exemplo como nas telas prontas (`limparDoExemplo`); vem com "Cuidando da visão do bairro", "Exame de vista…", "Rua Augusta, 1200", "Desde 2001". | seg-N-mero-grande |
| 18 | Médio | `server/lembretes.js` `mensagem('2d')` | E-mail de 2 dias sem TV | Endereço completo (`app…/tv`) e exemplo da frente (Empresas: comunicado, aniversariantes), não "o cardápio, uma promoção". | saída do script |
| 19 | Médio | `server.js:282` `seloDaConta` (cache 5 min) | Assinar com teste vencido | Selo sair na hora, como dizem o e-mail e o painel; sai em até 5 min. | fin-09, fin6 log |
| 20 | Médio | `/empresas` (landing) | Ler a página | "Quanto fica na **sua loja**?", "TV indoor que **vende**: promoção com preço…", "Horário da loja"; "Falar no WhatsApp" aponta para `/app` (contato não configurado). | rh-01, land2 log |
| 21 | Médio | Bloqueio de IA no atraso (`creditos.pagamentoAtrasado`) | Atraso ≥ 20 dias → Aviso rápido | O aviso rápido (inclusive "urgente" de segurança) é bloqueado como "criar com IA"; em fábrica é o caminho de emergência. Sem IA ele nem usa IA. Liberar o aviso rápido pela regra. | fin4 log |
| 22 | Médio | Nota fiscal | Assinar com Asaas | O diálogo promete "emitir a cobrança e a nota"; não há código de NFS-e. Confirmar a emissão automática no Asaas ou tirar "e a nota". Empresa sem nota não paga. | `server/billing.js` |
| 23 | Médio | Termos de Uso §3 (`server/legal.js:44`) | Ler | Termos ainda dizem "O plano gratuito tem limite de telas" (é teste de 14 dias), não falam do anual, da multa nem da régua de atraso. | código |
| 24 | Polimento | Diálogo de parear (402 `plan_limit`) | 2ª TV no teste | "limite do plano atingido… Faça upgrade" → maiúscula, sem "upgrade", com o preço ("Assine o Essencial: + R$ 149 por mês"). Teste vencido: "para ligar **sua** tela" quando a 1ª já está ligada. | fin-02 |
| 25 | Polimento | Editor de peças | Usar "Comunicado interno" / "Número grande" | Rótulos "Rotulo" e "Numero" sem acento; "Texto" de 261 letras num campo de uma linha. | rh-19, seg-03 |
| 26 | Polimento | `/f/:codigo` | Preencher | Rótulos visíveis (hoje só placeholder: "04/11" sem dizer o que é). | rh-27 |
| 27 | Polimento | Mural | — | "1 aprovadas" (plural). | rh-40 |
| 28 | Polimento | Importar planilha | CSV com data inválida | Dizer quais linhas foram ignoradas. | rh-49 |
| 29 | Polimento | Indicadores (API) | 80 indicadores / sem token / GET | Avisar "só os 50 primeiros"; "falta o token"; 405 em vez de "não autenticado". | log ind |
| 30 | Polimento | Layout padrão da TV Empresas | Pôr uma peça | Lateral e rodapé repetem nome da empresa + data (duas vezes cada); poderia ser relógio/indicador/aniversário. | rh-21 |
| 31 | Polimento | `/app/?frente=empresas` | Clicar "Testar 14 dias grátis" | Abrir já em "Criar conta". | rh-02 |
| 32 | Polimento | Plano | Comprar pacote (simulado) | Confirmação antes e aviso depois ("+25 criações entraram"). Selo "Popular"/"Mais escolhido" antes de ter clientes. | fin-06 |
| 33 | Polimento | `docs/BILLING.md`, comentário em `server/plans.js` ("O Essencial saiu") | Ler | Documentação diz que o Essencial saiu e que a carência é de 7 dias; o código tem Essencial e régua 3/10/20. | — |

## O que está bom

- **Aviso urgente:** frase solta vira cartaz certo (título, detalhe, "só hoje", Urgente), toma a TV em ~5 s e some sozinho no dia seguinte. É o melhor momento do produto para uma fábrica.
- **Foto pelo QR com aprovação:** código por e-mail, autorização LGPD com data e hora, pessoa nova entra na lista, RH aprova em 1 toque, QR aparece sozinho na TV no período.
- **Aniversário automático** com foto, cargo e "Hoje!", intercalado com o resto, e o do dia seguinte certo.
- **Indicadores:** `curl` pronto com o token, lê número brasileiro ("8.450", "78,5%", "R$ 1.234.567,89"), cartão na TV com variação e meta muito legível, token novo invalida o antigo na hora, conector de busca recusa rede interna e senha sem https.
- **Cobrança:** os números batem em landing, `/api/planos`, painel e e-mails; anual por faixa sem "degrau"; multa mostrada em reais antes do clique; régua de atraso dita desde o 1º dia e igual no painel, na landing e no e-mail; "nunca desligamos sua tela" é cumprido (selo, nunca tela preta); cancelar é possível pelo painel.
- Painel sem erro de console, sem rolagem lateral no celular.

## Resultados que dependeram de espera

(atualizado ao fim do teste — ver seção "Selo do atraso e cortesia")

---

## Nota geral

| Usuário | Fluxo | Profissionalismo | Criações (sem IA) | Comercial |
|---|---|---|---|---|
| 7 RH | 7 | 4 | 6 | — |
| 8 Gestor | 8 | 6 | 4 | — |
| 14 Financeiro | 8 | 7 | — | 6 |

**Nota geral dos três: 6/10.**

**Pode lançar? Não.** A jornada 7 está no veredito e tem um bloqueador: a
primeira TV de toda conta Empresas (e Saúde) abre com a promoção da ótica,
com preço e data vencida, e a frente Empresas não tem nenhuma tela pronta
aprovada nem peça de segurança. Na cobrança, o texto do cancelamento e os
Termos prometem o que o sistema não faz, e quem está em atraso não acha o
link da fatura. Corrigido isso (aprovar as telas `l1-empresa-*` ou usar a
tela de espera, rebaixar só no fim do período pago, buscar a fatura
`OVERDUE`, caber o número do KPI), RH, indicadores e cobrança estão perto de
prontos.
