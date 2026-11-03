# QA 13 e 20 — Landing (visitante cético) e Jurídico (advogado e contador)

Testador B · 03/11/2026 · versão da `main` rodando local na porta 8111.

- Servidor 1: `STORAGE=local SKIP_VERIFY=1 AI_PROVIDER=dev` (sem GA, sem WhatsApp).
- Servidor 2: o mesmo, com `NODE_ENV=production GA_MEASUREMENT_ID=G-TESTE123 WHATSAPP_NUMERO="+55 11 99999-0000" SUPPORT_EMAIL=contato@multitelas.net.br`, para ver o aviso de cookies e o WhatsApp.
- Navegador: Chromium (Playwright). Celular 390×844 com 4G lento (1,6 Mbps, 150 ms) e CPU 4x lenta via CDP. Computador 1366×900 sem limitação.
- Prints e scripts: `/tmp/claude-0/-home-user-Multi-telas/b804d644-700b-5e83-ad8f-5fe2da78625e/scratchpad/qa/B/` (scripts em `.../qa/B/s/`, medições em `.../qa/B/perf.json`, texto das 4 páginas em `.../qa/B/textos.json`).
- Não testado: sites dos concorrentes (a rede desta sessão não resolve `playtvi.com.br`; ela precisa ser liberada nas configurações de rede da sessão). A comparação usa `docs/REFERENCIA-CONCORRENTES.md` e o que se espera de um SaaS de signage. Também não testado: login com Google (sem credenciais), cobrança real no Asaas (sem chave) e Safari.

---

## Usuário 13 — Visitante cético da landing

### 1. Quem é e o que tentou fazer

Dono de loja, gestor de clínica ou RH que chegou por um anúncio, primeiro no celular em 4G ruim e depois no computador. Quer saber em 30 segundos o que é, para quem é, quanto custa e o que fazer. Depois lê tudo com olho de redator e confere cada promessa contra o código.

### 2. Jornada

| # | Passo | O que aconteceu | Evidência |
|---|---|---|---|
| 1 | Abrir `/`, `/empresas`, `/saude`, `/comercio` no celular em 4G lento com CPU 4x (2 rodadas cada, cache frio) | Primeira pintura em **0,70–0,92 s**, LCP igual à FCP (o maior elemento é o parágrafo do herói), TBT **0–34 ms**, CLS 0, **128–238 KB** no total, contando as imagens que só carregam ao rolar. Nenhum erro de console e nenhuma rolagem lateral. | `perf.json`, `perf-celular_*.png` |
| 2 | As mesmas páginas no computador | FCP/LCP de 0,12 a 0,61 s, TBT 0, CLS no máximo 0,015 | `perf-pc_*.png` |
| 3 | Teste dos 30 s no celular (primeira tela) | **O que é**: claro ("Você fala o que quer mostrar… a IA monta a peça… a TV muda na hora"). **Para quem**: claro em cada frente; na raiz, o rótulo "TV CORPORATIVA E MÍDIA INDOOR" fica em cima de "A TV da sua loja", e as duas mensagens se misturam. **O que fazer**: claro ("Testar 14 dias grátis"). **Quanto custa**: **não aparece**. O preço fica a ~6.600 px do topo, umas 8 telas abaixo. Com o WhatsApp ligado, o botão "Ver preços" do herói some (dá lugar ao WhatsApp), e o preço fica ainda mais longe. | `perf-celular_raiz.png`, `ga-aviso-cel.png` |
| 4 | Tocar em "Testar 14 dias grátis" (`/saude` → `/app/?frente=saude`) | Abre **"Entrar na sua conta"**, com a aba **Entrar** marcada. É preciso achar e tocar em "Criar conta". A frente chega marcada (Saúde) e o cadastro leva 4,6 s, sem cartão. | `cad-1-chegada.png`, `cad-2-form.png` |
| 5 | Clicar em todos os links das 4 páginas (celular e computador) | Todas as âncoras existem e nenhum link quebra. O `?frente=` só vai nos botões com `data-track="trial"`. **"Começar o teste" e "Assinar"** (cartões de preço) **perdem a frente** e caem no login, sem plano escolhido. Sem WhatsApp e sem e-mail, "Falar com a gente" (anual) leva a `#fale`, onde o único botão é "Testar grátis": um beco sem saída para quem quer negociar. | saída de `s/links.js` |
| 6 | Simulador de preço (1, 3, 4, 5, 10, 11, 25, 26, 30 telas) | Bate centavo por centavo com `server/plans.js` (5 telas: R$ 745 mensal, R$ 576 anual, R$ 115,20 por tela). A partir de 26 telas mostra "A combinar". Funciona com o teclado. Sem JavaScript, a caixa fica vazia. | `simulador-5telas.png` |
| 7 | GA ligado: aviso de cookies e WhatsApp | O aviso aparece. O WhatsApp flutuante sobe (656–712 px contra o aviso em 743–832) e **não se sobrepõem**. "Recusar" grava `mt_cookies=recusado` e manda `consent update denied`. Ao recarregar, o aviso não volta e começa recusado. O link `wa.me/5511999990000?text=…` está certo. | `ga-aviso-cel.png`, `ga-aviso-pc.png` |
| 8 | SEO | Ver a seção SEO abaixo | `s/seo.js` |

### 3. Notas

| Critério | Nota | Por quê |
|---|---|---|
| Desempenho | **9,5** | Primeira pintura abaixo de 1 s e ~200 KB em 4G lento com CPU 4x: melhor que quase qualquer concorrente. Faltam um `favicon.ico` (404) e um texto de reserva no simulador sem JS. |
| Comercial | **6** | Explica bem o que é e para quem. Porém o "Testar grátis" abre o **login**, o preço não está na primeira tela, não há prova social (e o selo "Mais escolhido" não é verdadeiro), e o anual não diz que tem multa. |
| Profissionalismo (textos) | **7** | Texto limpo, sem erro de ortografia encontrado, tom certo no herói de cada frente. Mas 93% da página é igual nas 4 versões, e Empresas e Saúde leem "loja", "Horário da loja" e "Quanto fica na sua loja?". Há promessas exageradas ("posta nas redes", "Mais escolhido"). |
| SEO | **6,5** | Título, descrição, canônico, og, sitemap, robots e JSON-LD estão certos e há um único h1. O conteúdo é 93% duplicado entre as 4 URLs, o JSON-LD aponta sempre para a raiz, o título de Empresas tem 68 caracteres e as descrições têm 160–171. |

### 4. Problemas

| Gravidade | Onde | Como reproduzir | O que esperava | Evidência |
|---|---|---|---|---|
| **Grave** | `web/src/pages/AuthScreen.jsx:27` (`useState('login')`) + todos os "Testar 14 dias grátis" | Tocar em "Testar 14 dias grátis" em qualquer landing | Cair direto em **Criar conta** (por exemplo, `?frente=` ou `?cadastro=1` abrindo o modo `signup`). Hoje o visitante vê "Entrar na sua conta" e acha que errou. É o botão mais importante do site. | `cad-1-chegada.png` |
| **Grave** | `landing/index.html` (seção Preço, "Mais escolhido") | Ler o cartão do mensal | Tirar o selo. `docs/ads/README.md` diz "Nenhum pagante ainda". Prova social inventada é publicidade enganosa (CDC art. 37 §1º). | `perf-pc_raiz.png` / código |
| Médio | `server/landing-frentes.js:56` (Comércio) | Ler o herói de `/comercio`: "A IA monta a peça com a sua marca, **posta nas redes se você quiser**" | O produto **não posta**: ele gera a imagem e o texto e abre o "compartilhar" do celular ou o "Baixar/Copiar" (`web/src/components/content/RedesSociais.jsx:14-24`). Trocar por "deixa o post pronto para as redes". | código |
| Médio | `landing/index.html` (herói e preço) | Abrir no celular e procurar o preço | Pôr "a partir de R$ 120/tela" ou "R$ 149/tela" na linha "Sem cartão · 20 criações…" e manter "Ver preços" mesmo com WhatsApp. | `perf-celular_raiz.png`, `ga-aviso-cel.png` |
| Médio | `server/landing-frentes.js:111` (regex só troca `<a href="/app" data-track="trial"`) | Em `/saude`, tocar em "Começar o teste" ou "Assinar" | Levar a frente (`/app/?frente=saude`) e, no "Assinar", ir ao plano depois do cadastro | `s/links.js` |
| Médio | 4 landings | Comparar o texto | 51 de 55 frases são iguais à raiz (93%). O Google tende a tratar as frentes como duplicadas. Variar pelo menos "Como funciona", "O que vem junto", FAQ e exemplos por frente. | `textos.json` |
| Médio | `/empresas`, `/saude` | Ler a página | Os textos genéricos falam de varejo: "Horário da **loja**", "Quanto fica na sua **loja**?", "Peças feitas pelo MultiTelas, com a marca de cada **loja**", "Uma **loja** ou uma rede", "Mídia indoor para o varejo", e o balcão de madeira vazio no desenho do herói de Empresas. | `perf-pc_empresas.png` |
| Médio | `landing/landing.js` (EXEMPLOS.clinica) + `server/landing-frentes.js` | Abrir `/saude`: o primeiro exemplo é "Pacote em parcelas — check-up anual com o parcelamento em destaque" | A própria frente promete "sem promessa", e preço e parcelamento em publicidade de saúde é área sensível (códigos de ética do CFM/CFO; confirmar com o jurídico). Trocar por um exemplo de orientação ou prevenção. | `textos.json` |
| Médio | `landing/index.html` FAQ "Posso cancelar?" e simulador | Ler o anual | O FAQ diz "O anual é um contrato de 12 meses, combinado com a gente" e o simulador mostra só a economia. A **multa** (30% do que falta ou o desconto recebido, `server/plans.js:189`) só aparece dentro do painel. Informar na landing (CDC art. 6º III e art. 31). | código |
| Médio | `#fale` sem `WHATSAPP_NUMERO` nem `SUPPORT_EMAIL` | Subir o servidor sem as duas variáveis e clicar em "Falar com a gente" no anual | Algum contato (e-mail fixo). Hoje só sobra "Testar grátis". Em produção, conferir que as variáveis existem. | `s/links.js` |
| Polimento | Raiz `/` | Primeira tela | O rótulo "TV CORPORATIVA E MÍDIA INDOOR" sobre "A TV da sua loja vendendo": decidir para quem a raiz fala | `perf-celular_raiz.png` |
| Polimento | Preço | "R$ 0 de equipamento — com 5 telas, são R$ 1.250 a R$ 2.500 de aparelho que você não compra" | Só vale para quem já tem Smart TV com navegador ou box. Dizer "se a sua TV já tem navegador". | — |
| Polimento | `landing/index.html` "O que vem junto" | "Aniversariantes — a TV parabeniza no dia certo" | O player mostra na **semana** do aniversário (`server/automaticos.js`) e só depois de ligar "mostrar nas TVs". "Na semana do aniversário" é mais exato. | código |
| Polimento | "Foto e vídeo do celular — Compartilhe da galeria direto para a TV" | — | O Web Share Target só existe com o painel instalado no Android, não no iPhone | `web/public/manifest.webmanifest:98` |
| Polimento | Prova social | Página inteira | Faltam depoimento, foto de TV instalada de verdade (o próprio HTML avisa `data-falta="foto-real-tv-instalada"`), número de telas no ar e CNPJ no rodapé. Concorrentes de signage costumam mostrar logos de clientes, cases e garantia. | — |
| Polimento | SEO | — | JSON-LD com `url` da raiz nas 4 páginas; título de `/empresas` com 68 caracteres; descrições com 160–171 caracteres (cortam); `og:image` em WEBP (algumas redes não leem); `/favicon.ico` 404; `/termos` e `/privacidade` com `noindex` (o Google gosta de achar as páginas legais de um site comercial). | `s/seo.js` |
| Polimento | Simulador | O controle vai até 30 telas, mas o plano aceita 49 e o Essencial tem teto de 49 telas (não dito na landing) | Dizer o teto ou levar o controle a 49 | — |
| Polimento | WhatsApp | A mensagem pronta é igual em todas as frentes | Pôr a frente na mensagem ("Vi o MultiTelas Saúde…") para o comercial saber de onde veio | — |

### 5. O que está bom

- **Velocidade de referência**: menos de 1 s de primeira pintura em 4G ruim com CPU 4x, ~200 KB, zero bloqueio, zero deslocamento. As trocas de peça do herói esperam o navegador ficar livre.
- **Preço às claras e sem mentira**: os números vêm de `/api/planos`, e o simulador bate com `plans.js` em todas as quantidades testadas. A régua de atraso (3/10/20 dias, "a TV nunca apaga") é igual na landing, no painel e no código.
- Cada frente tem herói, título, descrição, canônico, og e imagem próprios. O cartão da frente fica aceso.
- O aviso de cookies e o WhatsApp não brigam pelo canto. "Recusar" funciona e é lembrado.
- Sitemap e robots corretos. Painel, API, TV e QR ficam fora do Google pelo `X-Robots-Tag`.
- O cadastro é curto (empresa, frente, e-mail, senha), sem cartão, com a frente já marcada.
- Ortografia: nenhum erro encontrado na leitura completa das 4 páginas.

---

## Usuário 20 — Advogado e contador

### 1. Quem é e o que tentou fazer

Advogado de LGPD e consumidor, mais um contador, revisando antes do lançamento: `/termos`, `/privacidade` (`server/legal.js`), o aceite no cadastro, a exportação e a exclusão (Ajustes e `server.js:1129-1180`), cookies, dados de terceiros (aniversariantes, fotos por QR, mural) e os textos de cobrança (`server/plans.js`, `BillingPage.jsx`, `docs/BILLING.md`).

### 2. Jornada

| # | Passo | O que aconteceu | Evidência |
|---|---|---|---|
| 1 | Abrir `/termos` e `/privacidade` no celular | Abrem bem, sem rolagem lateral (1.058 e 820 palavras). No topo: **"Rascunho. Este texto … ainda não passou por revisão jurídica. Não use como peça contratual definitiva."** O aviso só sai com `LEGAL_REVISADO=true`. | `legal_termos.png`, `legal_privacidade.png` |
| 2 | Cadastro | A caixa "Li e aceito os Termos de Uso e a Política de Privacidade" vem **desmarcada**, e o botão fica desabilitado sem ela. Pela API sem `aceite`: **400** "é preciso aceitar…". O aceite fica gravado com versão, data, IP e origem (aparece na exportação). | `cad-2-form.png`, saída de `s/cad2.js` |
| 3 | Exportar dados (Ajustes › Seus dados › Baixar) | JSON com 24 grupos (conta, usuários, aceites, telas, campanhas, aniversariantes, fotos do mural com IP, acessos do suporte…), como anexo. Só o dono pode exportar. | `ajustes-seus-dados.png` |
| 4 | Plano pago simulado (`dev-activate`) › Plano › Cancelar | A confirmação diz o que acontece. No anual, mostra a multa em reais. No mensal, "telas no ar até o fim do período pago". | `plano-pago.png`, `plano-cancelar.png` |
| 5 | **Excluir a conta com plano pago** | O diálogo pede o e-mail e apaga tudo (o login depois dá 401). **O diálogo não fala da assinatura, e o código não a cancela** (`server.js:1165-1180` chama `db.apagarTenant` e não `billing.cancelarAssinatura`). | `ajustes-excluir-dialogo.png` |
| 6 | TV pareada, depois excluir a conta | **75 s depois a TV ainda diz "Tudo certo, Refeitório ✓ Esta TV está conectada à sua conta"**. Só ao recarregar volta ao código de pareamento. Pelo código (`js/player.js:320-335`), uma TV com conteúdo segue mostrando o que tinha guardado, inclusive aniversariantes com foto, até ser recarregada. O teste foi feito com a TV vazia; com aniversariante, não testado. | `tvdel-1-pareada.png`, `tvdel-2-75s-depois.png`, `tvdel-3-recarregada.png` |
| 7 | GA ligado: o que a política diz contra o que roda | Ver G1 abaixo. **Suspeita confirmada.** | `ga-aviso-cel.png`, saída de `s/ga.js` |
| 8 | Páginas do QR (mural `/m/`, foto de funcionário `/f/`) | Lidas no código (`server/mural.js:104-109`, `server/foto-qr.js:209-218`) | — |

### 3. Notas

| Critério | Nota | Por quê |
|---|---|---|
| Jurídico | **4** | A base é melhor que a média (papéis de controlador e operador, suboperadores, aceite registrado, exportação e exclusão sozinhas, caixa desmarcada). Mas a política **contradiz o que o site faz com cookies**, não há identificação do fornecedor, falta o direito de arrependimento, o texto se declara rascunho, e excluir a conta não para a cobrança. |

### 4. Problemas (com o trecho exato)

| # | Gravidade | Onde | Trecho / fato | O que falta ou contradiz |
|---|---|---|---|---|
| G1 | **Grave** | `server/legal.js` (Privacidade §2) contra `server.js:2766-2779`, `landing/ga-init.js`, `landing/analytics.js` | Política: *"Não usamos cookies de publicidade nem de análise. O único cookie é o de sessão, necessário para manter você conectado — por ser essencial, dispensa consentimento."* | Em produção o GA4 roda (ID padrão `G-WXZ71V7E8D` já escrito no código) na **landing e no painel**, para o Google Ads. O consentimento começa **concedido** (`analytics_storage`, `ad_storage` e `ad_user_data` = `granted`) antes de qualquer clique; medi `consent default granted` antes da escolha. No **painel não existe aviso nenhum** (`/app/` direto: `granted`, sem aviso). O aviso diz só *"Usamos cookies para medir o desempenho do site."*: não fala de publicidade nem do Google e não tem link para a política. Corrigir: começar `denied` até o "Ok", aviso também no painel (ou tirar o GA do painel), link para a política, e a política listando GA4/Google Ads, a finalidade, o prazo e como recusar (guia de cookies da ANPD). |
| G2 | **Grave** | Rodapé da landing, `server/legal.js` (`EMPRESA = 'MultiTelas'`) | *"© 2026 MultiTelas"*; contato e encarregado: `thiago.olivs.coelho@gmail.com` | Faltam razão social, **CNPJ**, endereço físico e telefone ou e-mail do fornecedor (Decreto 7.962/2013, art. 2º; CDC art. 31). A LGPD (art. 41 §1º) pede a identidade e o contato do encarregado: hoje é um Gmail pessoal sem nome. |
| G3 | **Grave** | `server/legal.js` Termos §3 | *"Você pode cancelar quando quiser; o acesso continua até o fim do período já pago e não há reembolso proporcional, salvo quando a lei exigir."* | Falta o **direito de arrependimento de 7 dias** para contratação pela internet (CDC art. 49; Decreto 7.962, art. 5º: informar o meio e devolver o valor). A cobrança começa **no dia da assinatura** (`server/billing.js:254`, `nextDueDate: hoje`), então a primeira mensalidade cai dentro dos 7 dias. Como cliente pequeno (padaria, consultório) pode ser consumidor pela teoria finalista mitigada, a regra precisa estar escrita, com o caminho de pedir. |
| G4 | **Grave** | `server/legal.js` `pagina()` | *"Rascunho. Este texto descreve com precisão o que o sistema faz, mas ainda não passou por revisão jurídica. Não use como peça contratual definitiva."* | Lançar com os Termos dizendo de si mesmos "não use como peça contratual" esvazia o aceite. É preciso revisão por advogado e `LEGAL_REVISADO=true`. |
| G5 | **Grave** | `server.js:1165-1180`, `web/src/pages/SettingsPage.jsx:254-268` | Diálogo: *"Serão apagados: sua conta e a da empresa, os usuários, as telas…"* (não fala de assinatura) | **Excluir a conta não cancela a assinatura no Asaas.** O cliente pago que se exclui segue sendo cobrado todo mês, e o `stripe_subscription_id` some com a conta, o que dificulta achar e estornar. Cancelar a assinatura antes de apagar (ou bloquear a exclusão com assinatura ativa) e dizer isso no diálogo. Visto no código; em modo simulado não há assinatura real para conferir. |
| M1 | Médio | Termos §3 inteiro | *"O plano gratuito tem limite de telas. Planos pagos são cobrados de forma recorrente pelo Asaas."* | Desatualizado e incompleto. Hoje há **teste de 14 dias** com selo depois, cobrança **por tela** (mínimo de 1, mesmo sem TV pareada: o painel mostra "R$ 149 por mês · 1 tela" com 0 de 49), **anual com fidelidade e multa**, pacotes de criações (R$ 39/129/499), a régua de atraso 3/10/20 dias, reajuste e renovação do anual. Nada disso está nos Termos. Pelo CDC art. 46, cláusula não informada antes não obriga. |
| M2 | Médio | `server/plans.js:178-209`, `BillingPage.jsx:345` | Painel: *"Cancelar antes dos 12 meses tem multa: 30% do que falta pagar, ou o desconto que você recebeu, o que for maior."* | A parte (b) **cresce com o tempo de uso** (5 telas: R$ 1.382 no 4º mês e R$ 1.859 no 11º; o próprio código avisa, issue #135). Multa que aumenta perto do fim tende a ser tida como desproporcional (CDC art. 51 IV e §1º). Também faltam no texto do painel a visita de retirada (R$ 150) e o aparelho (R$ 210), e a multa não aparece na landing nem nos Termos. Definir com o advogado e pôr no termo do anual. |
| M3 | Médio | Privacidade §3 | *"Todos ficam fora do Brasil"*, mas a tabela diz *"Asaas … Brasil"* | Contradição no mesmo parágrafo. Faltam suboperadores que o código usa: **Google Analytics/Ads**, login com Google (`oauth2.googleapis.com`), **Anthropic e Groq** (`server/motores.js`, quando ligados), **Brevo** (e-mail alternativo, `server/mail.js`), **Microsoft** (visualizador de PPT, `js/render.js:1644`, que recebe o endereço do arquivo do cliente), `api.qrserver.com`, `rss2json`, Pixabay. A base da transferência internacional (*"cláusulas contratuais dos respectivos contratos"*) precisa citar as cláusulas-padrão da ANPD (Res. CD/ANPD nº 19/2024). |
| M4 | Médio | Privacidade §2 e §4 contra `server/guarda.js`, `server/foto-qr.js` | §4: *"Fotos do mural ficam guardadas enquanto o mural existir."* | A **foto de funcionário por QR** (`/f/`, tabela `fotos_pessoa`, com e-mail, aniversário e setor) não aparece na política. O código apaga em 30 dias a foto sem decisão e o mural da data 30 dias depois, mas a política não diz esses prazos. Faltam também o prazo do IP de quem envia ao mural, dos registros de aceite e dos **registros de acesso** (Marco Civil, art. 15: 6 meses). |
| M5 | Médio | Páginas `/m/` (`server/mural.js:104`) e `/f/` (`server/foto-qr.js:216`) | `/m/`: *"Ao enviar, você concorda que a foto seja exibida publicamente…"*; `/f/`: *"Autorizo [empresa] a guardar meu nome, e-mail e foto para [mural]. Posso pedir para sair quando quiser."* | Nenhuma das duas tem link para a política nem diz por quanto tempo a foto fica. O `/m/` grava o IP sem avisar o titular. O `/f/` pede aniversário e setor, que não estão na frase de autorização. Na relação de emprego, o consentimento é frágil (empregado não é livre para negar): orientar o cliente nos Termos §7. |
| M6 | Médio | Privacidade (silêncio) | — | O **acesso do suporte à conta** ("entrar como cliente", tabela `acessos_suporte`, que no Postgres é mantida depois da exclusão) não aparece. Dizer quem acessa, quando, com registro e por quanto tempo. |
| M7 | Médio | Privacidade §4 contra `js/player.js:320-335` | *"Ao excluir a conta, apagamos … A exclusão é imediata"* | As TVs seguem mostrando o conteúdo guardado (inclusive dados de terceiros) até alguém recarregar. 75 s depois a TV ainda dizia "conectada à sua conta". O pulso de 30 s deveria limpar a tela quando o servidor responde 401/404. |
| M8 | Médio | Termos §7 | *"Você nos isenta de responsabilidade por dados que cadastrar sem base legal."* | Pela LGPD art. 42, o operador responde junto quando descumpre a lei ou as instruções. A isenção vale entre as partes, não contra o titular nem a ANPD: reescrever como direito de regresso. |
| M9 | Médio | Login com Google (`server/routes/auth.js:327-330`) | O aceite é gravado como `'google'` quando a conta nasce pelo botão "Continuar com Google" | A tela mostra só os links no rodapé, sem a frase "Ao continuar, você aceita os Termos e a Política". Sem a frase, o aceite é fraco (browsewrap). Visto no código; não testado (sem credenciais Google). |
| M10 | Médio | `/saude` (exemplo "Pacote em parcelas") | — | Ver usuário 13: publicidade de preço e parcelamento em saúde precisa de revisão ética. |
| P1 | Polimento | Termos §12 | *"Continuar usando depois disso significa aceitar a nova versão."* | O aceite só é gravado no cadastro. Ao subir `VERSAO`, pedir aceite de novo no painel (já existe a tabela `aceites`). |
| P2 | Polimento | Termos §13 | *"Fica eleito o foro do domicílio do consumidor quando a relação for de consumo."* | Para B2B não há foro definido. |
| P3 | Polimento | `docs/BILLING.md:28` | *"Atraso: 7 dias de carência…"* | O que vale hoje são 3/10/20 dias (`plans.js`). Documento interno desatualizado. |
| P4 | Polimento | Páginas legais | Link "Voltar ao painel" | Quem vem da landing é mandado ao login. Pôr "Voltar ao site" e a marca. A fonte e o visual são diferentes da landing. |
| P5 | Polimento | Exclusão (`apagarTenant`) | Apaga também os `aceites` | A prova do aceite some junto com a conta. Guardar o registro mínimo (versão, data, IP) pelo prazo de prescrição, e dizer isso na política. |

### 5. O que está bom

- **Aceite de verdade**: caixa desmarcada, exigida também no servidor (400 sem ela), gravada com versão, data, IP e origem.
- **Exportação e exclusão self-service**, só para o dono, com confirmação por e-mail digitado. A exportação inclui dados de terceiros (mural com IP) e os acessos do suporte.
- A política explica bem **controlador e operador**, avisa que imagens enviadas vão ao Google e trata do mural com criança e da moderação.
- O Banco de Imagens compartilhado é opcional, só aceita imagem de IA, e diz claramente que concorrentes podem usar e que a imagem fica depois da exclusão.
- Cobrança honesta na interface: a multa aparece em reais antes do clique, "nunca tela preta" está coerente em todos os lugares, e o checkout recusa o plano "em breve".
- O responsável legal (`server/legal.js`) declara que é rascunho e que precisa de OAB, o que é honesto. Mas isso tem de ser resolvido antes de vender.

---

## Notas finais

| Área | Nota |
|---|---|
| Comercial | **6** |
| Profissionalismo (textos) | **7** |
| Desempenho | **9,5** |
| SEO | **6,5** |
| Jurídico | **4** |
| **Geral dos usuários 13 e 20** | **6,5** |

**Pode lançar? Não.** A landing está rápida e vende razoavelmente, mas:

1. O "Testar 14 dias grátis" abre a tela de login. É fácil de corrigir e custa conversão desde o primeiro dia.
2. A política de privacidade nega os cookies de análise e publicidade que o próprio site liga por padrão, sem consentimento prévio e sem aviso no painel.
3. Faltam CNPJ e identificação do fornecedor, e falta o direito de arrependimento de 7 dias.
4. Os Termos se declaram "rascunho, não use como peça contratual".
5. Excluir a conta não cancela a cobrança no Asaas.
6. "Mais escolhido" sem nenhum cliente pagante.

Os itens 2 a 6 são de texto ou de poucas linhas de código, mas 2 a 4 pedem a revisão de um advogado antes do lançamento.
