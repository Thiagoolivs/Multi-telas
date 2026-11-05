# Regras de negócio e mercado — avaliação do consultor (03/11/2026)

> Escopo: regras de cobrança, teste, IA, inadimplência e frentes, lidas no código
> (não nos documentos), comparadas com o que a landing e o painel prometem; e o
> MultiTelas contra concorrentes no Brasil e fora.
>
> **Limite do método (mercado).** O acesso direto às páginas dos concorrentes
> (WebFetch) foi bloqueado pela rede desta sessão (yodeck.com, optisigns.com,
> screencloud.com, risevision.com, novisign.com, b2midia.com.br falharam com
> ENOTFOUND). Todos os números de concorrentes abaixo vêm de **busca web
> (resumo do buscador sobre a página citada)** em 03/11/2026, com a URL da fonte.
> Onde a fonte é de terceiros ou conflita, está dito. O que não achei está
> marcado **não verificado**. Antes de decidir preço, vale abrir as páginas
> oficiais à mão (ou liberar esses domínios na sessão).
>
> Câmbio usado: **R$ 5,20 / US$** — mediana do Focus para o fim de 2026
> (band.com.br, 10/08/2026:
> https://www.band.com.br/economia/noticias/dolar-no-fim-de-2026-segue-em-r-520-pela-oitava-semana-seguida-aponta-focus-202608100918).
> Não é a cotação do dia (não verificada).

---

## 0 · Veredito em uma linha

O motor de cobrança está **bem defendido contra os furos óbvios** (assinatura
acompanha as telas, reserva de crédito, estorno derruba o plano), mas as
**regras de saída** — cancelar, deixar de pagar, terminar o anual — têm quatro
vazamentos de receita e duas promessas que o código não cumpre. O preço de
R$ 149/tela está **no topo do mercado PME brasileiro** e só se sustenta pela IA;
para Comércio e Saúde de 1–2 TVs ele é caro, para Empresas com muitas TVs o
modelo por tela é errado.

---

## 1 · Regras de negócio (lidas no código)

### 1.1 Tabela de regras

Legenda da coerência: ✅ coerente · ⚠️ incoerente com outra regra ou com o texto · ❌ promessa que o código não cumpre.

| # | Regra | Onde está | Coerência | Riscos |
|---|---|---|---|---|
| R1 | **Preço por tela, mensal**: Essencial (id `pro`) R$ 149/tela, sem desconto por volume, até 49 telas | `server/plans.js:41-55`, `:143-159` | ✅ landing `landing/index.html:356-363`, JSON-LD `:38-43` | Receita acompanha telas (bom). Para Empresas com 10+ TVs repetindo o mesmo conteúdo, R$ 1.490/mês no mensal é difícil de vender (ver §4). |
| R2 | **Anual por faixa** (12 meses, pago mês a mês): R$ 120 (1–3), R$ 108 (4–10), R$ 96 (11–25), 26+ negociado, piso R$ 90 | `server/plans.js:124-131`, `:149-158` | ✅ landing `:368-377`; painel `web/src/pages/BillingPage.jsx:335-350` | O anual **não existe no Asaas**: é uma assinatura `MONTHLY` com valor menor (`server/billing.js:255`). Nada amarra os 12 meses. Ligado só pelo operador (`server.js:1373-1380`); o termo do contrato **não está nos Termos de Uso** (comentário em `server/routes/billing.js:366-368`). |
| R3 | **Multa do anual** = maior entre 30% do que falta e (desconto devolvido × meses usados + visita + aparelho) | `server/plans.js:181-209` | ⚠️ o PLANO §6.3 diz "quem cancela perto do fim paga pouco"; a fórmula faz o contrário | Calculado (5 telas): mês 4 = R$ 1.382; mês 11 = **R$ 1.859**; mês 12 (contrato cumprido) = **R$ 2.028**. Sem `contrato_desde` gravado, `mesesUsados=0` e a multa é 30% × 12 meses = R$ 2.074. **A multa nunca é cobrada**: o painel só mostra o número ("a equipe confirma", `BillingPage.jsx:519-523`). Cliente que se frustra (multa por ter cumprido o contrato) e receita que vaza (ninguém cobra). |
| R4 | **Cancelar pelo painel** (dono): apaga a assinatura no Asaas na hora; o webhook `SUBSCRIPTION_DELETED` rebaixa para grátis | `server/billing.js:346-352`, `server/routes/billing.js:409-428`, `server/cobranca.js:61-62` | ❌ painel diz "suas telas continuam no ar **até o fim do período já pago**" (`BillingPage.jsx:517-518`); landing diz "a tela fica no ar até o fim do mês pago" (`landing/index.html:422`) | O rebaixamento é **imediato** (selo + fim da IA no próximo pulso). Quem pagou o mês perde o serviço no dia do cancelamento: problema de CDC e de confiança. A rota **não olha o contrato**: cliente anual cancela sozinho, sem multa. |
| R5 | **Contrato anual sobrevive ao cancelamento**: `SUBSCRIPTION_DELETED` não limpa `plan_contrato` | `server/cobranca.js:61-62` | ⚠️ | Quem era anual cancela e assina de novo pelo checkout → `createCheckout` usa `tenant.plan_contrato` (`server/routes/billing.js:370`) → **preço do anual sem compromisso**. Vazamento de receita silencioso. Também não há fim/renovação do contrato: depois dos 12 meses segue "anual" para sempre. |
| R6 | **Teste de 14 dias**, conta do nascimento da conta, 1 tela, 20 criações, sem cartão; operador pode estender | `server/plans.js:253`, `:274-300`, `:364-382`; `server/uso-ia.js:58-61` | ✅ landing `:343-352`, e-mails `server/lembretes.js:58-86` | 1 tela não deixa Empresas (refeitório + fábrica + recepção) testar o que compram. Teto em reais do teste R$ 15 (`server/uso-ia.js:286`) é seguro. Abuso por contas repetidas custa ≤ R$ 15 cada — aceitável. |
| R7 | **Fim do teste sem assinar**: a TV segue no ar e **continua publicando**, com selo "MultiTelas · versão gratuita", sem IA e sem parear tela nova | `server/plans.js:397-406`, `server/uso-ia.js:44-48`, `:322` | ✅ landing `:173`, `:350`; e-mail `lembretes.js:78-85` | Na prática é **um plano grátis de 1 tela para sempre**: editor, modelos prontos, banco de imagens, upload (0,5 GB), agendamento, mural, som, equipe e aniversariantes. Para comunicação interna, um selo discreto não incomoda ninguém. É vitrine, mas também é o motivo de muita conta nunca pagar. |
| R8 | **Recursos por plano** (`recursos: [...]`) | `server/plans.js:28`, `:53`, `:68`, `:88` | ⚠️ só `relatorio` é conferido em todo o código (`server/routes/relatorio.js:54`) | A lista é decorativa: o grátis tem mural, som, marca e equipe, que a landing vende como do Essencial (`landing/index.html:362`). "Regra que ninguém entende": o argumento de upgrade se resume a selo + IA + mais telas. |
| R9 | **Downgrade não reduz telas**: cancelou, estornou ou caiu para grátis com N telas → as N seguem exibindo, só com selo | `server/plans.js:364-382` (só barra parear **nova**), `server/routes/telas.js:192-215` | ⚠️ o grátis tem `telasMax: 1` (`plans.js:25`) | **Maior vazamento**: assina 1 mês, pareia 20 TVs, cancela (ou pede chargeback) e fica com 20 TVs no ar para sempre, publicando, com selo. Para TV corporativa o selo não é castigo. |
| R10 | **Inadimplência**: aviso 3 dias (e-mail), selo "MultiTelas" em 10, suspensão de IA e telas novas em 20; nunca tela preta | `server/plans.js:302-355`, `server/cobranca.js:52-60`, `server/lembretes.js:103-149` | ✅ landing `:401-402`, `:424` | **Não há fim da régua**: depois de 20 dias nada mais acontece. Quem para de pagar mantém todas as telas exibindo e publicando, indefinidamente, com um selo discreto. Conta `past_due` sem `atraso_desde` (anterior à regra) nunca é bloqueada (`plans.js:332-333`). Selo não diz "atraso" para o público (bom). Só um e-mail (dia 3); nada no dia 10 nem no 20. |
| R11 | **Assinatura acompanha as telas** (parear/remover atualiza o valor; conciliação a cada 6 h) | `server/cobranca.js:108-177`, `server.js:268-271` | ✅ | Sem proração: tela pareada no dia 2 entra na fatura seguinte — o cliente ganha até ~30 dias grátis por tela nova. Aceitável. `atualizarValor` troca a descrição e apaga o "contrato anual" do texto da fatura (`server/billing.js:363-373`). |
| R12 | **Estorno/chargeback** → plano volta a grátis; assinatura não é cancelada | `server/cobranca.js:74-77` | ✅ | Combinado com R9: chargeback = telas grátis para sempre. |
| R13 | **Criações de IA (franquia por conta)**: teto R$ 30 até 3 telas + R$ 3/tela, máx. R$ 80 → 85 a 228 criações/mês; 1 criação = 1 imagem (R$ 0,35); texto é livre | `server/plans.js:236-246`, `server/creditos.js:38-39`, `:46-55` | ✅ landing `:360`, `:420` | Custo máximo de IA de 1 tela = R$ 50/mês (R$ 30 + R$ 20 de margem de texto, `uso-ia.js:285-291`) = 34% da mensalidade. Na média a margem é boa; no pior caso de 1 tela, apertada. |
| R14 | **Pacotes avulsos**: 25 por R$ 39, 100 por R$ 129, 500 por R$ 499; nunca expiram; gastos depois da franquia | `server/creditos.js:167-171` | ❌ conflita com o teto em reais | O **teto em reais da conta** soma o custo de TODAS as imagens do ciclo, inclusive as pagas no pacote (`server/uso-ia.js:331-346`, `db.resumoUsoIA`). Com 1–3 telas o teto é R$ 50: depois de ~57 imagens além da franquia, **toda a IA de texto (Criar, conversa, ajuste) trava até o mês virar** — com créditos pagos sobrando. Quem comprou o pacote de R$ 499 usa ~1/8 dele no mês. Cliente que se frustra + pedido de reembolso. |
| R15 | **Teto global de IA** R$ 300/dia (env) | `server/uso-ia.js:287`, `:326-330` | ✅ | Proteção boa. Com 100+ contas ativas pode travar todo mundo num dia de pico — calibrar. |
| R16 | **Cortesia** (lista de e-mails): Essencial sem prazo e sem pagar; sair da lista devolve ao grátis | `server/cortesia.js:38-85` | ⚠️ comentários dizem "plano Pro" e "cinco créditos" (`:8`, `:12`) — nomes velhos | Sem prazo: depende de alguém lembrar de tirar o e-mail. Ao sair, cai no R9 (fica com até 49 TVs grátis). |
| R17 | **Pro (IA integrada) R$ 179** "em breve", checkout recusa | `server/plans.js:63-76` | ✅ landing `:383-384` | Âncora de preço útil; mas anunciar R$ 179 sem data cria expectativa que o Essencial "vai ficar sem as coisas boas". |
| R18 | **Enterprise** sob consulta, até 100.000 telas, 25 GB/tela | `server/plans.js:83-91` | ✅ | Recursos idênticos ao Essencial: não há o que vender a mais (SSO, SLA e marca branca saíram por não existirem — correto). |
| R19 | **Três frentes** (Empresas, Saúde, Comércio): mesma cobrança, mesmo plano; muda texto, menu, tom da IA e se recebe anúncio | `js/perfil.js:31-64`, `docs/FRENTES.md`, `server/landing-frentes.js:27-59` | ⚠️ `js/perfil.js:21-22` diz "editável em Ajustes", `:8-10` diz que só o operador troca | Separação de configuração, não de produto. Ver §1.3. |
| R20 | **Landing Comércio promete "posta nas redes se você quiser"** | `server/landing-frentes.js:54` | ❌ o produto gera post/story e abre o compartilhamento do celular (`web/src/components/content/RedesSociais.jsx:16-21`, sem API da Meta) | Pequeno, mas é exatamente o tipo de frase que o próprio repositório proíbe ("nenhuma promessa sem código"). Trocar por "deixa o post pronto para as redes". |
| R21 | **Comentários desatualizados nas regras** | `server/plans.js:98-103` ("O Essencial saiu… um plano pago só"), `server/creditos.js:32` ("o Pro dá 25 créditos por tela"), `docs/ANALISE-PIXMIDIA.md` (R$ 79/R$ 149, grátis permanente) | ⚠️ | Quem mexer no código lê uma regra que não é a que roda. Barato de corrigir. |
| R22 | **Rede de anúncios (Ads)**: proposta, nada implementado; 60/40 plataforma/local; só Comércio e Saúde | `docs/ads/README.md`, `docs/ads/06-monetizacao.md` | ✅ com `recebeAnuncios` em `js/perfil.js:36,47,57` | O próprio estudo conclui que abaixo de ~50 locais concentrados não paga quem vende. Saúde tem restrição de publicidade (RDC 96/2008, CFM) — anúncio em sala de espera exige curadoria. |

### 1.2 Avaliação das perguntas pedidas

**Preço por tela vs. por conta.** Por tela é o padrão do setor (todos os
internacionais e PlayTVi/Screencorp no Brasil cobram por tela) e é certo para
Comércio e Saúde, que têm 1–3 TVs. Para Empresas está errado na forma: uma
indústria com 12 TVs repete o mesmo comunicado em todas e vai comparar
R$ 1.788/mês (mensal) com "a partir de R$ 250/mês" da Pix Mídia. A IA já foi
corretamente movida para "por conta" (R13); o mesmo raciocínio vale para o
preço de Empresas: **piso por conta + preço baixo por tela adicional**.

**Teste de 14 dias com 20 criações.** Bom desenho: prazo do nascimento da conta,
sem cartão, 20 criações (~R$ 7) bastam para impressionar, e o painel avisa antes.
Dois problemas: (1) **1 tela só** — Empresas não testa o caso real (várias TVs,
conteúdos diferentes por TV); (2) só há e-mail aos 2 dias do fim e depois do fim;
não há e-mail de ativação nos dias 1–3, quando a conta que não pareou ainda pode
ser salva.

**O que acontece no fim do teste.** A TV **segue no ar e segue publicando**, com
selo, sem IA, sem parear tela nova (R7). É generoso e é coerente com tudo o que
a landing diz. O risco é que o grátis permanente de 1 tela é bom demais para
quem não precisa de IA, e o selo é fraco para TV corporativa.

**Plano grátis de 1 tela.** Não existe oficialmente ("teste"), mas existe de fato
(R7). Manter como vitrine é defensável (Yodeck e OptiSigns também têm grátis),
desde que seja **realmente de 1 tela** — hoje não é (R9).

**Inadimplência.** A régua é humana e bem comunicada, mas **não termina** (R10):
o cliente que para de pagar fica com tudo, menos IA e tela nova. Falta o
passo final (ex.: 45–60 dias → cancela a assinatura e aplica as regras do grátis,
inclusive o limite de telas, sem nunca apagar a primeira tela).

**Multa do anual.** Fórmula invertida em relação à promessa (R3), mostra multa
para quem cumpriu o contrato, não é cobrada, o termo não está nos Termos, e o
cliente anual pode cancelar sozinho pelo painel (R4). Hoje o anual é "desconto
sem fidelidade". Não lançar o anual assim.

**Limites de IA vs. custo.** Calibrados com folga: no pior caso de 1 tela, IA
custa 34% da mensalidade; com 5 telas, R$ 56 de teto contra R$ 745 de receita
(7,5%). O único defeito é o conflito com os pacotes (R14). Pacotes têm margem
alta (R$ 1,56 a R$ 1,00 por criação contra R$ 0,35 de custo) — bom.

**Três frentes com o mesmo preço.** Ver abaixo.

### 1.3 Três frentes: deveriam ter planos diferentes?

Sim, mas **não três tabelas** — dois modelos:

| Frente | Perfil típico | Problema do preço atual | Recomendação |
|---|---|---|---|
| Comércio | 1–2 TVs, dono decide sozinho, compara com PlayTVi (R$ 24,90) | R$ 149 é 5–6× a entrada nacional | Entrada sem IA (ou com poucas criações) + Essencial com IA; Ads como desconto futuro ("a TV que se paga") |
| Saúde | 1–3 TVs, recepção, conteúdo educativo recorrente | Mesmo do Comércio; o valor está em conteúdo pronto de saúde (campanhas do calendário, prevenção), que hoje vem só da IA | Mesmo modelo do Comércio + biblioteca de saúde como argumento; Ads só com categoria curada |
| Empresas | 5–50 TVs, RH/Comunicação Interna, compra com proposta | Por tela pura pune quem tem muitas TVs com o mesmo conteúdo; não tem integrações que esse comprador exige | Piso por conta + tela adicional barata; anual como padrão; Enterprise com integrações quando existirem |

---

## 2 · Mercado

### 2.1 Tabela comparativa

Preços por tela/mês. US$→R$ a 5,20 (ver topo). "n.v." = não verificado.

| Concorrente | Preço por tela | Em R$ / US$ | O que inclui | Hardware | Teste / grátis | IA | Foco | Diferencial | Fonte (consultada em 03/11/2026) |
|---|---|---|---|---|---|---|---|---|---|
| **MultiTelas** | Essencial R$ 149 mensal; anual R$ 120→96 por faixa | R$ 149 ≈ US$ 28,65; anual R$ 96–120 ≈ US$ 18,5–23 | IA com a marca (85–228 imagens/conta), modelos, banco de imagens, 10 GB/tela, relatório de exibição, mural QR, som, equipe | Navegador da TV/box/PC; app Android (WebView) | 14 dias, 1 tela, 20 criações; depois grátis com selo | **Sim, central** | PME: Comércio, Saúde, Empresas | IA que monta a peça na marca; preço público; autosserviço | código (`server/plans.js`) |
| **PlayTVi** (BR) | Standard a partir de R$ 24,90; Business R$ 29,90 | ≈ US$ 4,79 / 5,75 | Standard: 500 MB, RSS, clima, loterias, suporte por e-mail; desconto para redes; sem setup | Android TV, TV Box, Fire TV, Windows (sem hardware próprio, segundo Capterra) | 7 dias, sem cartão | n.v. (nada encontrado) | PME 1–20 telas: restaurante, varejo, clínica, academia | Preço muito baixo, público | https://playtvi.com.br/ e https://playtvi.com.br/play/sobre.html (via busca); https://www.capterra.co.uk/software/1242239/PlayTVi |
| **Screencorp** (BR) | Básico R$ 99/licença (1 licença = 1 tela); completo não divulgado | ≈ US$ 19 | Básico: 1 GB, 2 GB de transferência; completo 10 GB | n.v. | 30 dias | n.v. | TV corporativa, app, push, SMS | Comunicação interna multicanal | https://www.baguete.com.br/noticias/screencorp-de-olho-nas-tvs-corporativas (matéria sem data clara — pode estar velha); página de preços https://screencorp.com.br/tv-corporativa/precos apareceu na busca citando R$ 99 e R$ 159, não confirmada |
| **Pix Mídia / ImidiaTV** (BR) | Sem tabela pública; "a partir de R$ 250/mês" (conta, não tela) | ≈ US$ 48/mês | TV + app do colaborador + RH; Power BI, TOTVS, SAP, Teams; API | Player Android; comodato no Enterprise | Demonstração + 15 dias | n.v. | RH / comunicação interna, médias e grandes | Integrações, marca no RH, +850 empresas declaradas | Capterra via `docs/ANALISE-PIXMIDIA.md` (29/09/2026, **não reverificado hoje**); modelo "preço por tela, player incluso possível": https://www.getapp.co.nz/software/2063524/imidiatv |
| **B2 Mídia** (BR) | Básico, Intermediário, Enterprise: "sob consulta" por licença/mês | n.v. | n.v. | n.v. | n.v. | n.v. | TV corporativa e digital signage | Anuncia em "tv corporativa" no Google | https://b2midia.com.br/planos/ (resumo da busca) |
| **TVPlayer** (BR) | n.v. (busca só trouxe o TVPlayer britânico) | n.v. | n.v. | n.v. | n.v. | n.v. | TV indoor | n.v. | — |
| **Yeloo** (BR) | n.v. (site não apareceu na busca) | n.v. | n.v. | n.v. | n.v. | n.v. | n.v. | n.v. | — |
| **Attractive Mídia Indoor** (BR) | n.v. | n.v. | n.v. | n.v. | n.v. | n.v. | provável rede de mídia indoor (n.v.) | n.v. | — |
| **Infymedia** (BR) | n.v. | n.v. | n.v. | n.v. | n.v. | n.v. | TV indoor | n.v. | — |
| **SuaTV / SimplificaCI** (BR) | n.v. (sem tabela; leva a demonstração) | n.v. | templates, equipe de design dedicada | n.v. | n.v. | n.v. | TV corporativa / comunicação interna | design feito pela equipe deles | https://www.suatv.com.br/?p=17493 (via busca) |
| **TV Corporativa** (tvcorporativa.com.br) | n.v. (site não apareceu na busca) | n.v. | n.v. | n.v. | n.v. | n.v. | n.v. | n.v. | — |
| **Yodeck** (int.) | Grátis (1 tela), Basic US$ 8, Premium US$ 12, Enterprise US$ 16 (alta de US$ 1 em Premium/Enterprise em 01/04/2026) | R$ 41,60 / 62,40 / 83,20 | CMS completo, galeria de stock, apps | **Player grátis por tela no plano anual** | Grátis 1 tela | "AI Agent" citado por terceiros, plano n.v. | PME e corporativo | Player incluso, grátis de 1 tela | https://www.risevision.com/blog/yodeck-pricing (concorrente escrevendo); https://www.yodeck.com/docs/user-manual/2026-yodeck-pricing-update/ (via busca) |
| **OptiSigns** (int.) | Standard US$ 10 (9 anual), Pro US$ 12,50 (11,25), Pro Plus US$ 15 (13,50), Engage US$ 30 (27), Enterprise US$ 45 (40,50; mín. 25 telas) | R$ 52 / 65 / 78 / 156 / 234 | Pro Plus: Microsoft 365, Power BI, Salesforce, dados dinâmicos; Engage: interatividade e anúncios | OptiStick US$ 89,99–99,99; Pro Player US$ 299–349 | Grátis até 3 telas | n.v. ("AI beta" vago em listagem) | Todos, forte em PME | Integrações e preço baixo | https://www.risevision.com/blog/optisigns-pricing e https://www.optisigns.com/pricing (via busca); hardware: https://sixteen-nine.net/2024/10/18/optisigns-debuts-its-own-300-pro-media-player-paired-with-its-cms-software |
| **ScreenCloud** (int.) | Core US$ 32 mensal / 27 anual; Pro US$ 47 / 40; Enterprise sob consulta | R$ 166 / 140; R$ 244 / 208 | 80+ apps e integrações, SLA 99,99% no Enterprise | n.v. | 14 dias | n.v. | Corporativo, comunicação interna | Integrações e segurança | https://getpulsesignal.com/compare/appspace-vs-screencloud (terceiro, "verificado out/2026"); Capterra lista "a partir de US$ 20": https://capterra.com/p/147087/ScreenCloud/pricing/ — **conflitam** |
| **Rise Vision** (int.) | Basic US$ 11; Advanced US$ 13; Enterprise conflita (US$ 15 ou US$ 164/ano) | R$ 57 / 68 | Advanced: alertas de emergência, Google/Microsoft, marca | n.v. | Sim (duração n.v.) | n.v. | Educação, corporativo | Alertas de emergência, escolas | https://www.g2.com/products/rise-vision/pricing (atualizado 29/04/2026, via busca) |
| **NoviSign** (int.) | Business ~US$ 18 anual / 20 mensal; Business Plus 26; Premium 44 (fontes conflitam: há quem diga US$ 14 e "por usuário") | R$ 94–104 / 135 / 229 | n.v. | Android/Windows (n.v.) | n.v. | n.v. | Varejo, corporativo | n.v. | https://frontdeskreview.com/software/digital-signage/novisign/ e https://us.fitgap.com/products/001714/novisign-digital-signage (via busca) — **conflitam** |

Referência de mercado não confirmada: um blog em domínio de IP cita "R$ 60 a
R$ 180 por tela/mês" para licença de TV corporativa no Brasil
(https://ec2-44-214-59-196.compute-1.amazonaws.com/blog/quanto-custa-implantar-uma-tv-corporativa-em-2026-na-minha-empresa/) —
fonte fraca, só como ordem de grandeza.

### 2.2 Leitura do preço

- **Contra os internacionais de PME** (Yodeck, OptiSigns, Rise): R$ 149 é
  **2 a 3 vezes** o plano equivalente (R$ 42–78). Eles têm grátis, player
  incluso (Yodeck anual) e integrações. A diferença só se paga pela IA.
- **Contra ScreenCloud** (corporativo): R$ 149 fica **igual ou abaixo** do Core
  mensal (R$ 166) — mas ScreenCloud vende integrações e SLA que não temos.
- **Contra o Brasil PME**: PlayTVi a R$ 24,90–29,90 é a âncora que o dono de
  padaria vai achar no Google. Screencorp a R$ 99 (dado possivelmente velho).
  R$ 149 é o **topo** do que é público no país.
- **Contra o Brasil corporativo** (Pix, B2, SuaTV): preços fechados; o
  comprador corporativo compara proposta com integração e atendimento, não
  tabela.

---

## 3 · Qualidade comparada (frio)

### À frente
- **IA que cria a peça com a marca, em português, a partir de uma frase** —
  nenhum concorrente pesquisado mostrou algo equivalente nas fontes (para os
  internacionais, IA está **n.v.**, não ausente). É o único diferencial forte.
- **Preço público e autosserviço no Brasil** (Pix, B2, SuaTV escondem preço).
- **Sem hardware obrigatório** (player no navegador) e "nunca tela preta" escrito.
- **Mural de fotos por QR, aniversariantes, aviso rápido, som** num só painel PME.

### Empatado (é o mínimo do setor, não diferencial)
- Funcionamento offline (todos os sérios têm).
- Relatório de exibição / proof-of-play (OptiSigns, Yodeck, ScreenCloud têm).
- Multi-zona, retrato/paisagem, agendamento por data/dias/hora por item
  (`js/player.js:2164-2181`).
- Três frentes: é **mensagem e configuração** (`js/perfil.js`), não produto
  diferente. Ajuda a vender, não a reter.

### Atrás
- **Integrações**: sem Power BI/dashboard por URL, Google Sheets, Microsoft 365,
  Teams, feeds sociais, RH (TOTVS/SAP), API pública. É o que o comprador de
  Empresas pede primeiro.
- **Apps nativos e hardware**: só navegador + casca Android WebView com APK
  próprio (`server/apk.js`); nada nativo para Tizen, webOS, Fire TV, BrightSign;
  nenhum player homologado/vendido. Yodeck dá o player no anual; OptiSigns vende.
- **Conteúdo pronto**: biblioteca de ~39 peças-ouro + IA contra milhares de
  templates (Yodeck, OptiSigns) e +500 conteúdos (Pix).
- **Gestão de muitas lojas**: grupos de telas existem só como rótulo/filtro;
  sem hierarquia por unidade, sem permissão por loja, sem aprovação de conteúdo.
- **Agendamento avançado**: sem prioridade/sobreposição de campanha e validade
  automática (é o "Pro em breve"); sem playlists por faixa do dia como entidade.
- **Enterprise**: sem SSO, log de auditoria, SLA contratual.
- **Suporte e prova**: zero pagantes (`docs/ads/README.md`), sem case, sem foto
  real instalada (comentário em `landing/index.html:183-188`), WhatsApp depende
  de variável não configurada (`landing/index.html:434-438`), SLA não publicado
  na landing.

---

## 4 · Recomendações

### 4.1 Preço por frente

| Frente | Está | Proposta (hipótese a validar com 10 conversas) |
|---|---|---|
| Comércio | **Caro** na entrada (R$ 149 vs. R$ 25–99 no Brasil) | **Básico R$ 59–69/tela** sem IA (ou 10 criações), com selo removido; **Essencial R$ 129–149** com IA. A IA vira o motivo de subir, não a barreira de entrar. |
| Saúde | **Caro** para consultório de 1 TV | Igual ao Comércio. Vender o Essencial pela biblioteca de saúde + calendário (outubro rosa, vacinação), que a IA já sabe fazer. |
| Empresas | **Caro e na forma errada** com muitas TVs | **Piso R$ 299/mês por conta (até 3 TVs) + R$ 59–79 por TV adicional**, anual como padrão. Essencial atual vira teto, não ponto de partida. |

### 4.2 Empacotamento e add-ons
- **IA**: manter franquia por conta; pacotes já existem — corrigir o conflito
  com o teto (R14). Add-on "IA ilimitada de texto + 300 imagens" para agências.
- **Telas**: "tela adicional no mesmo local" mais barata que a primeira
  (o custo marginal é quase zero; a IA já é por conta).
- **Ads**: só como **desconto condicionado** no Comércio/Saúde ("ceda 1 min a
  cada 5 e ganhe X% na mensalidade"), não como produto, até ter ~50 locais
  num bairro (o próprio `docs/ads/06-monetizacao.md` conclui isso).
- **Implantação**: a tabela do PLANO §6.2 (R$ 459 com aparelho) é boa —
  colocar na landing como "ou instalamos para você".

### 4.3 Regras a mudar ANTES do lançamento (em ordem)
1. **Cancelamento com fim do período pago** (R4): agendar o rebaixamento para
   `plan_renews_at`, ou mudar o texto do painel e da landing. Hoje o texto é falso.
2. **Downgrade respeita `telasMax`** (R9): no grátis, só a tela mais antiga
   exibe a programação; as demais mostram uma tela "conta sem plano — fale com
   o dono" (não é tela preta, é aviso). Fecha o maior vazamento.
3. **Fim da régua de atraso** (R10): no dia 45–60, cancelar a assinatura e
   aplicar a regra 2. Mandar e-mail também nos dias 10 e 20.
4. **Anual**: limpar `plan_contrato`/`contrato_desde` no `SUBSCRIPTION_DELETED`
   (R5); bloquear cancelamento self-service no anual ou gerar a fatura da multa;
   **corrigir a fórmula** (multa zero ao cumprir os 12 meses; decrescente — ex.:
   só (a) 30% do que falta, mais aparelho); pôr o termo nos Termos de Uso;
   renovar ou encerrar o contrato no 12º mês.
5. **Pacote fora do teto em reais** (R14): somar ao teto o custo dos créditos
   comprados, ou contar no teto só o custo de texto.
6. **Recursos por plano** (R8): decidir o que o grátis tem e conferir no servidor
   (ou tirar a lista). Hoje a landing vende como Essencial o que o grátis já tem.
7. **Trocar "posta nas redes"** por "deixa o post pronto" (R20).
8. **Teste de Empresas com 3 telas** e e-mail de ativação no dia 1–3 (R6).
9. Corrigir comentários e docs velhos (R21) e a descrição da fatura no
   `atualizarValor` (R11).

### 4.4 As 10 melhorias de produto de maior impacto comercial

| # | Melhoria | Para quem | Impacto | Esforço |
|---|---|---|---|---|
| 1 | Plano de entrada sem IA (Básico R$ 59–69) + upgrade pela IA dentro do painel | Comércio, Saúde | Alto: tira o MultiTelas do "6× o PlayTVi" | Baixo (plans.js + painel + landing) |
| 2 | Dashboard/página por URL na TV (Power BI, Looker, Google Sheets publicado) | Empresas | Alto: mata a objeção corporativa nº 1 | Baixo–médio (zona iframe com lista de domínios permitidos) |
| 3 | Fechar R9/R10 (downgrade e fim da régua) | Receita | Alto: sem isso, cancelar é de graça | Baixo |
| 4 | Aniversariantes, admissões e indicadores por Google Sheets/CSV automático | Empresas | Alto (RH) | Médio |
| 5 | Player/box homologado vendido ou alugado + implantação na landing | Todas | Alto: tira o "não sei instalar" | Médio (operação, não código) |
| 6 | Hierarquia de lojas/unidades com permissão por unidade e aprovação de conteúdo | Redes, Empresas | Médio–alto | Médio–alto |
| 7 | Prioridade e validade por peça (programação inteligente do "Pro") | Todas | Médio–alto: é o que justifica R$ 179 | Médio |
| 8 | Relatório mensal automático por e-mail ("sua TV ficou 99% no ar, X peças") | Todas | Médio: retenção e venda da próxima tela | Baixo |
| 9 | Prova: 3 cases reais com foto, WhatsApp configurado, SLA publicado | Todas | Alto na conversão | Baixo (não é código) |
| 10 | App nativo/listagem em loja (Google Play para Android TV; Tizen/webOS depois) | Todas | Médio: confiança e instalação | Médio–alto |

---

## 5 · Notas (0–10)

| Item | Nota | Por quê |
|---|---|---|
| Regras de negócio — clareza | 6 | Centralizadas em `plans.js` com motivo escrito; mas a lista de recursos é decorativa e há comentários velhos |
| Regras de negócio — coerência | 4 | Cancelamento, multa, "posta nas redes" e pacotes × teto contradizem o que painel/landing dizem |
| Regras de negócio — risco | 4 | Downgrade sem limite de telas, régua de atraso sem fim, anual sem fidelidade: receita vaza |
| **Regras de negócio (geral)** | **5** | |
| **Preço vs. mercado** | **4** | Topo do Brasil PME e 2–3× os internacionais; só a IA justifica; Empresas na forma errada |
| **Diferenciação** | **6** | IA com a marca é real e rara; o resto é mínimo do setor; atrás em integrações e hardware |
| **Pronto para vender** | **4** | Checkout funciona, mas zero pagantes, anual sem termo, textos falsos no cancelamento, sem prova social nem WhatsApp configurado |

**Veredito:** não lançar com a tabela e as regras de saída atuais. Corrigir
§4.3 itens 1–5 (uma a duas semanas de trabalho), lançar um Básico para
Comércio/Saúde e um piso por conta para Empresas, e vender primeiro onde a IA
pesa (Comércio e Saúde de 1–3 TVs), deixando Empresas para depois das
integrações.
