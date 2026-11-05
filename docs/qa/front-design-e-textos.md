# QA de lançamento: design e textos (leitura transversal H)

**Quem avaliou:** designer de produto sênior e redator. A pergunta foi se o painel e a TV parecem um produto profissional pronto para vender, nas três frentes.
**Data:** 03/11/2026 · versão `main` (c75cf3a) rodando local na porta 8171, `AI_PROVIDER=dev`.
**Prints e arquivos:** `/tmp/claude-0/-home-user-Multi-telas/b804d644-700b-5e83-ad8f-5fe2da78625e/scratchpad/qa/H/` (481 prints em `shots/`, textos extraídos em `textos/`, scripts em `js/`).

---

## 1. Quem é e o que tentou fazer

Criei três contas, uma de cada frente. Em cada uma, ativei o plano pago (`dev-activate`), pareei uma TV de 1920x1080 e pus conteúdo **sem IA**:

| Frente | Conta | TV | Conteúdo posto |
|---|---|---|---|
| Empresas | Metalúrgica Boa Vista | Refeitório | Peça pronta "Comunicado interno" |
| Saúde | Clínica Sorriso Pleno | Recepção | Peça pronta "Horário de funcionamento" |
| Comércio | Padaria Pão Dourado | Balcão | Peça pronta "Horário de funcionamento" + Tela pronta (a única que existe) + editor da tela e editor manual |

Depois percorri as 23 páginas do painel (todos os `case` de `web/src/App.jsx` com rota; `system` e `platform` são do operador e ficaram de fora), nos temas claro e escuro, em 1366x900 e 390x844, nas três frentes: **12 passadas de 23 páginas**. Nenhum erro de JavaScript apareceu em nenhuma delas. Também testei:

- os estados vazio, carregando (rede de 50 kB/s), sem rede e de erro (código de pareamento errado, senha errada);
- os diálogos (Parear, Mais opções, Convidar, Excluir conta, Usar peça, Pôr na TV);
- os avisos (toasts);
- login e cadastro;
- a TV em 1920x1080 (pareamento e exibição, um print a cada 20 s);
- os 9 e-mails (`server/mail.js`, `server/lembretes.js`, `server/vigia.js`, `server/foto-qr.js`), renderizados em HTML.

**Não testado:** as criações da IA (modo demonstração, conforme o brief), os landings (estão fora do pedido), o painel do operador, o Safari real e a TV física. A comparação com os concorrentes (Canva, Yodeck, ScreenCloud, Rise Vision, OptiSigns) foi feita de memória de produto, sem abrir os sites neste ambiente.

---

## 2. Jornada (resumo, com prints)

| # | Passo | O que aconteceu | Print |
|---|---|---|---|
| 1 | Início com a TV recém-pareada, sem conteúdo | Lista "Comece por aqui" clara, 3 passos. **Três botões violeta** na mesma tela (Abrir a Marca, Pôr conteúdo, Criar com a IA). O selo "No ar" aparece sobre "Nada passando nesta TV ainda". | `shots/vazio-comercio-overview-light-1366.png` |
| 2 | Empresas › Biblioteca › Telas prontas | **Vazio:** "As telas prontas do seu tipo de negócio estão chegando". | `shots/vazio-empresa-telasprontas-light-1366.png` |
| 3 | Comércio (padaria) › Telas prontas | **Uma tela só:** "Ótica Central · Semana do Sol", com a descrição "Cada zona diz uma coisa (PLANO §4.7): o cabeçalho…" (nota interna). | `shots/vazio-comercio-telasprontas-light-1366.png` |
| 4 | Usar a tela pronta da Ótica na padaria | O aviso "faltam 7 peças" é bom, mas deixa pôr na TV assim mesmo. Na TV da padaria entram "ÓCULOS DE SOL 30% OFF", "AVIADOR CLÁSSICO R$ 389" e "OFERTA VÁLIDA ATÉ SÁBADO, 25 DE OUTUBRO" (data vencida). | `shots/fluxo-comercio-04-tela-pronta-aberta.png`, `shots/sheet-tv-comercio.png` |
| 5 | Saúde › Peças prontas › Horário de funcionamento › Usar › Salvar › Pôr na TV | 3 toques até a TV. A TV da **clínica** passa a mostrar "PÃO QUENTE O DIA TODO · Fornadas às 6h, 11h e 16h". | `shots/fluxo-saude-01-usar-dialogo.png`, `shots/tv-saude-002.png` |
| 6 | Empresas › Comunicado interno | Funciona e é bonito, mas diz "publicado em 20 de outubro". | `shots/tv-empresa-002.png` |
| 7 | Aviso de sucesso | "Na TV: 1 tela." com Desfazer. Desfazer é ótimo; a frase é telegráfica. | `shots/fluxo-comercio-03-toast.png` |
| 8 | Programação › Editar programação | O editor é poderoso. Os rótulos "Cabeçalho" e "Rodapé" cobrem o texto da prévia. A peça da tela pronta aparece rotulada "Peça da campanha (IA)". | `shots/estado-editor-abre.png` |
| 9 | Meus Designs › Criar na mão (padaria) | Os modelos são de empresa: "O REFEITÓRIO FUNCIONA EM HORÁRIO ESTENDIDO", "DIAS SEM ACIDENTES 127", "Use o crachá · Bata o ponto · Fale com o RH" e uma citação de Sheryl Sandberg. | `shots/estado-criar-na-mao.png` |
| 10 | Erros | "código não encontrado", "senha atual incorreta", "e-mail ou senha incorretos": em minúscula e sem dizer o que fazer. | `shots/estado-parear-erro.png` |
| 11 | Carregando (rede lenta) | Plano mostra esqueleto (bom). Peças prontas mostra **"Nenhuma peça pronta ainda" + Criar** enquanto ainda carrega, um vazio falso. | `shots/sheet-estados.png` |
| 12 | Sem rede | A faixa "Sem conexão — o painel não consegue atualizar. Suas telas continuam exibindo normalmente." é excelente. | `shots/estado-offline-navegar.png` |
| 13 | TV aguardando pareamento | Gradiente azul e fonte Inter, sem logo: não é a marca. | `shots/tv-pareamento-saude.png` |

---

## 3. Notas por página (0–10)

Escala do PLANO: 10 excelente · 8 bom · 6 aceitável com problemas visíveis · 4 atrapalha · 2 quebrado.
As colunas E, S e C são as frentes Empresas, Saúde e Comércio. O tema escuro e o celular foram avaliados juntos: no escuro não há quebra (o violeta clareia para `#9277FF` com texto escuro, como pede a MARCA), e no celular nenhuma página rola para o lado.

| Página | E | S | C | Justificativa |
|---|---|---|---|---|
| Início · Agora | 7 | 7 | 7 | Hierarquia boa (título, data, checklist, TVs, ação). Três botões principais, "Diga quem é a empresa" nas três frentes, selo "No ar" sobre a prévia. |
| Início · Alertas | 7 | 7 | 7 | Limpa e calma. Usa "online/offline" e "rede de telas", enquanto o resto do painel diz "No ar/Fora do ar". |
| Telas | 7 | 7 | 7 | O cartão da TV com prévia real é ótimo. "Parear tela" ao lado de "As TVs ligadas…" mistura tela e TV. |
| Relatório de exibição | 5 | 5 | 5 | Sem título na página. Vazio com jargão ("recém-pareada", "agrupado por hora", "CSV"). |
| Programação | 7 | 7 | 7 | A planta da TV por zonas é um diferencial. Rótulos de 9–10 px; "Sem campanha no ar" com a TV cheia confunde. |
| Editor da tela (content) | 6 | 6 | 6 | Completo, mas denso. "Corporativo Completo · o tema MultiTelas (padrão) · ciclo de 1min" é jargão; rótulo errado "(IA)"; rótulos sobre o conteúdo. |
| Calendário | 7 | 4 | 4 | No Empresas, perfeito. No Saúde e no Comércio: "Calendário da empresa", "a lista do RH", exemplo "SIPAT – palestras às 15h no refeitório", tudo em letra monoespaçada. |
| Criar | 8 | 7 | 7 | Melhor página do painel: pergunta, caixa e ideias do dia por frente. No Saúde, "Depoimento de cliente" e "Wi-Fi para clientes"; nas três, "Aviso ou horário" duplica "Horário de funcionamento". |
| Criando | 7 | 7 | 7 | Vazio claro, com ação. |
| Criados | 7 | 7 | 7 | Vazio claro. Dois botões principais ("Criar" e "Criar a primeira"). |
| Criação rápida | 7 | 7 | 7 | Etapas claras. "Está em Meus Designs › Mais": esse "Mais" não existe. |
| Telas prontas | **2** | **2** | **3** | Empresas e Saúde vazios. Comércio só tem a Ótica, com nota interna "(PLANO §4.7)". É a vitrine do produto, e está vazia. |
| Peças prontas | 4 | 3 | 5 | 43 cartões na mesma cor, 43 botões violeta "Usar", e as frentes se misturam (ver §5). |
| Meus Designs | 6 | 6 | 6 | Os 4 caminhos estão bons. Os modelos de "Criar na mão" são de RH em qualquer frente. "Banner" em inglês. |
| Editor manual | 6 | 6 | 6 | Funciona e cabe no celular. A barra tem cerca de 20 ícones sem rótulo, "Forma · rect", e o modelo ignora a paleta da conta. |
| Arquivos | 6 | 6 | 6 | O mesmo parágrafo e o mesmo botão violeta aparecem duas vezes. "0 B de 10.0 GB usados (0%)". |
| Banco de Imagens | 3 | 3 | 3 | Vazio ("O acervo ainda está enchendo"), "0 imagem(ns)" e mensagem de servidor para o cliente ("falta a chave da Pixabay na configuração"). |
| Marca | 7 | 7 | 7 | Paletas por ramo com prévia são muito boas. "Nome da marca: Marca principal"; "Mídias › Fotos" é um nome antigo (hoje é Biblioteca › Arquivos); "abrir" e "avançado" em minúscula. |
| Pessoas | 8 | 5 | 5 | No Empresas, organizado e sem excesso de violeta. Nas outras frentes, "planilha do RH". O `<select>` é nativo. |
| Mural de fotos | 6 | 5 | 5 | Sem título; o vazio cita "aniversário da empresa" e "confraternização" em qualquer frente. |
| Indicadores | 6 | 4 | 4 | "do Protheus", "conector", "Receber/Buscar de um endereço": linguagem de TI, inclusive na padaria. |
| Plano | 7 | 7 | 7 | Claro e honesto ("Nunca desligamos sua tela"). O cartão Mensal fica vazio pela metade; "1 de 49 telas"; "85 criações… mais com mais telas (até 228)"; "Enterprise/SLA". |
| Equipe | 6 | 6 | 6 | Tabela crua: cabeçalhos "PESSOA PAPEL AÇÕES" sem ações; "Admin/Membro". |
| Ajustes | 7 | 7 | 7 | Bem dividido; a parte de LGPD é exemplar. "Mínimo de 6 caracteres" é fraco para um produto pago. |
| Suporte | 5 | 5 | 5 | Contato é um **Gmail pessoal**; "Usuário: … (owner)"; o user-agent inteiro na tela. |
| Login e cadastro | 6 | 6 | 6 | Limpos, mas de modelo genérico. Não mudam por frente (mesmo vindo de `?frente=saude`); "Minha Empresa" como exemplo na clínica. |
| TV: pareamento | 6 | 6 | 6 | Código grande e QR legíveis a 3 m. Fora da marca (azul e Inter, sem logo). |
| TV: exibindo | 6 | 5 | 6 | As peças-ouro são elegantes. Textos de apoio de 15–22 px a 1080p; conteúdo de outra frente; lateral "Reserve pelo WhatsApp" sem QR nem número. |
| E-mails | 6 | 6 | 6 | Corretos e com o violeta, sem logo nem rodapé. O e-mail do código da foto não tem layout. |

---

## 4. Notas gerais

| Critério | Nota | Por quê |
|---|---|---|
| Profissionalismo visual | **6,5** | O painel é limpo, em Outfit e com o violeta certo; o escuro está bem feito e o celular é cuidadoso. Mas a vitrine (Telas e Peças prontas) está vazia ou monótona, há mensagens de servidor e um Gmail pessoal à vista, e a TV aguardando pareamento não tem a marca. |
| Consistência (MARCA.md) | **6** | Cor e letra batem: violeta `#5B2EFF` (`#9277FF` no escuro), Outfit em 100% do painel e cartão com borda, sem sombra. A forma, não: raio de 7 px nos controles (o guia pede 8) e de 10 px nos cartões (pede 14). O guia pede um botão principal por tela e há de 2 a 43. O mesmo gesto tem quatro nomes: "Pôr conteúdo", "Trocar agora", "Mudar o que passa" e "Editar programação". |
| Textos | **6** | Tom humano e frases boas ("Nunca desligamos sua tela", "Sem conexão…"). Erros em minúscula e sem orientação, jargão (zona, conector, Protheus, frota, CSV, ciclo), inglês (OFF, Banner, Enterprise, SLA, owner, rect, online) e referências antigas ("Mídias", "Meus Designs › Mais"). |
| Adequação às frentes | **4** | Nome na barra, menu, Criar e Início mudam bem. Abaixo disso, tudo é de uma frente só: Telas prontas, Peças prontas, Criar na mão, Calendário, Pessoas, Indicadores, Arquivos e os e-mails. O Saúde é o que mais sofre: pão, salão, burger e ótica na sala de espera. |
| Estados (vazio, erro, carregando) | **6,5** | Os vazios têm ícone, frase e ação, e a faixa de sem rede é ótima. Há um vazio falso durante o carregamento de Peças prontas, o erro "Não foi possível carregar / Não foi possível carregar as telas." é redundante e as mensagens de erro de formulário são secas. |

**Nota geral do avaliador: 5,5/10.** A base é de produto próprio, não de "template de admin". O Início e o Criar (conversa e ideias do dia), a planta da TV na Programação, o Desfazer no aviso e a honestidade do Plano não existem em Yodeck ou ScreenCloud, e o Criar soa mais humano que o OptiSigns. Mas o que um cliente abre na primeira hora para "ter algo bonito na TV", que no Canva e no Rise Vision é a galeria de modelos, está vazio ou é de outro negócio.

---

## 5. As três frentes: onde ainda se misturam

**O que já separa bem:**

- nome na barra ("MultiTelas Empresas/Saúde/Comércio");
- grupo do menu ("Pessoas e indicadores" sobe no Empresas);
- exemplo da caixa do Criar ("avisar que o refeitório fecha mais cedo…");
- ideias do dia ("Aviso da semana", "Segurança em primeiro lugar" × "Dica de saúde", "Nossos serviços" × "Promoção da semana");
- chips do Criar;
- filtro "Para a empresa / Para a clínica / Para a loja" em Telas prontas.

**O painel de Empresas parece feito para RH e gestão?** Quase. Criar, Pessoas, Calendário e Indicadores falam a língua certa. Mas:

- Telas prontas está vazia;
- Peças prontas tem, depois das 5 primeiras, "Burger de costela", "Escova e hidratação R$ 89,90", "Coloração com desconto 20% OFF", "Combo do padeiro", "Óculos de sol 30% OFF" e "Exames de rotina 10x";
- "Horário de funcionamento" vem com "Pão quente o dia todo".

**O de Saúde parece de clínica?** Não. As primeiras peças prontas são, na ordem:

1. "PÃO QUENTE O DIA TODO · Fornadas às 6h, 11h e 16h"
2. "Escova e hidratação R$ 89,90"
3. "Sua cor nova em três tempos"
4. "Com sintomas de gripe?" (ok)
5. "Não haverá atendimento" (ok)
6. "Cuidando da visão do bairro"
7. "PÃO DE VERDADE LEVA 24 HORAS"
8. "Três promessas para cada consulta" (ok)
9. "BURGER DE COSTELA"

Além disso:

- o Calendário pede "a lista do RH" e dá SIPAT de exemplo;
- Indicadores fala de Protheus;
- o Criar tem "Depoimento de cliente" e "Wi-Fi para clientes";
- o Início e Ajustes dizem "empresa".

Na TV da clínica, o padrão leva "Pão quente o dia todo" para a recepção (`shots/tv-saude-002.png`).

**O de Comércio parece de loja?** Mais ou menos. Criar e Peças prontas (ofertas primeiro) servem. Mas:

- a única tela pronta é de ótica, com preços de óculos na padaria;
- "Criar na mão" oferece refeitório, crachá, ponto e "Fale com o RH";
- o Calendário é "da empresa", com SIPAT e refeitório;
- Peças prontas inclui "Outubro Rosa · mamografia" e "Com sintomas de gripe?".

**De onde vem a mistura** (tudo cabe no registro de `js/perfil.js`, como manda `docs/FRENTES.md`):

| Onde | Texto | Arquivo provável |
|---|---|---|
| Telas prontas | só `otica-semana-do-sol` está `aprovada`; as 19 `l1-*` por frente estão em `proposta` | `pecas-ouro/manifesto.json`, `web/src/lib/telasProntas.js` (`aprovadas`) |
| Peças prontas | o texto de exemplo de cada peça é da marca fictícia (padaria, salão, ótica), igual nas três frentes; só a ordem muda | `pecas-ouro/*.html`, `PecasProntasPage.jsx` |
| Criar na mão | modelos fixos de empresa | `web/src/components/…` (diálogo "Por onde você quer começar?") |
| Calendário | "Calendário da empresa", "a lista do RH", exemplo SIPAT | `CalendarioPage.jsx` |
| Início | "Diga quem é a empresa" | `DashboardPage.jsx` |
| Pessoas, Mural, Indicadores | "planilha do RH", "aniversário da empresa", "Protheus" | `BirthdaysPage.jsx`, `MuralPage.jsx`, `IndicadoresPage.jsx` |
| Arquivos, Marca | "fotos da empresa" | `ArquivosPage.jsx`, `BrandPage.jsx` |
| E-mail do teste | "escolha um modelo pronto — o cardápio, uma promoção" para qualquer frente | `server/lembretes.js:62` |
| Login e cadastro | "Gerencie a rede de telas de qualquer lugar"; logo sem o nome da frente; exemplo "Minha Empresa" | `AuthScreen.jsx` |

---

## 6. Galerias e TV a 3 m

**Telas prontas.** Uma tela no total (Ótica). O cartão tem descrição de documento interno: `"Cada zona diz uma coisa (PLANO §4.7): o cabeçalho, quem e a campanha; o destaque, a oferta; a lateral, quando e como…"`. Na tela aberta, a TV de exemplo é rica e bem composta. Na TV real, a lateral "SEM FILA · RESERVE PELO WHATSAPP" fica sem QR e sem número, porque o contato do exemplo foi limpo e não foi trocado: um retângulo marrom com um título (`shots/sheet-tv-comercio.png`).

**Peças prontas.** "40 cartões marrons numa parede": **continua**. Agora são 43, e o marrom virou a cor da paleta da conta:

- marrom "Forno" na padaria;
- azul-marinho com laranja na metalúrgica;
- azul-petróleo com verde-água na clínica.

Todo cartão tem o mesmo fundo escuro e o mesmo violeta em "Usar". Não há foto, cor clara, variação de densidade nem agrupamento visível por família ("gente", "oferta", "cardápio"…): a família aparece só como texto pequeno. Os cartões de "TV em pé" ficam estreitos no meio de um quadro largo, com muito vazio. Os 10 cabeçalhos e rodapés no fim são faixas finas, sem leitura na miniatura.

**A peça em si é de qualidade:** tipografia editorial, hierarquia, preço bem desenhado. É o melhor ativo visual do produto, mas a vitrine não deixa isso aparecer.

**Legibilidade a 3 m** (1920x1080, medido no print `shots/crop-tv-texto-pequeno.png`):

| Elemento | Tamanho | Leitura a 3 m |
|---|---|---|
| Títulos e preços | 60–150 px | ótima |
| Faixa de avisos | cerca de 36 px | ótima |
| Texto de apoio ("Garantia de um ano…", "Três modelos com lente polarizada…") | cerca de 22 px | limite |
| "ou 10× de R$ 18,99", "Metal dourado · polarizado" | cerca de 17 px | não se lê |
| Sobretítulos espaçados ("A PARTIR DE", "VEJA A VITRINE →", "FORNADAS ÀS 6H…") | cerca de 15 px | não se lê |
| "publicado em 20 de outubro" (Comunicado) | cerca de 20 px | não se lê |
| Nome da empresa e data no padrão vazio | grandes | ótima |

O texto de apoio deveria ter no mínimo 28–32 px a 1080p.

**Datas vencidas nos exemplos:** "ATÉ SÁBADO 25 DE OUTUBRO", "publicado em 20 de outubro", "Novembro 15 · sexta-feira" (o dia 15/11/2026 é domingo).

---

## 7. Textos ruins (texto exato → sugestão)

| Onde | Texto atual | Sugestão |
|---|---|---|
| Telas prontas, cartão | "Cada zona diz uma coisa (PLANO §4.7): o cabeçalho, quem e a campanha…" | "Oferta com prazo: a promoção no centro, até quando vale ao lado, avisos embaixo." |
| Parear, erro | "código não encontrado" | "Esse código não existe ou já venceu. Confira as 6 letras na TV ou toque em 'Gerar outro código' nela." |
| Ajustes, erro | "senha atual incorreta" | "A senha atual não confere. Digite de novo ou use 'Esqueci minha senha'." |
| Login, erro | "e-mail ou senha incorretos" | "E-mail ou senha não conferem. Confira ou toque em 'Esqueci minha senha'." |
| Erro de carga | "Não foi possível carregar / Não foi possível carregar as telas." | "Não conseguimos mostrar as suas TVs agora. Elas continuam exibindo normalmente. [Tentar de novo]" |
| Aviso de sucesso | "Na TV: 1 tela." | "Pronto! Já está passando no Balcão." |
| Diálogo Pôr numa TV | "Entra na zona que combina com ela (TV em pé), no fim do que já está lá." | "Entra na faixa do lado (a de TV em pé), depois do que já passa ali." |
| Editar peça | "A peça é conferida na TV deitada, em pé e na quadrada." + "Cabe na TV deitada, em pé e na quadrada." | Manter só a segunda. |
| Editor da tela | "Corporativo Completo · o tema MultiTelas (padrão) · ciclo de 1min" | "Tela com cabeçalho, lateral e rodapé · cores da sua marca · cada peça fica 20 s" |
| Editor da tela | "Peça da campanha (IA) · 20s" (numa peça de tela pronta) | "Peça pronta · 20 s" |
| Editor manual | "Forma · rect" | "Retângulo" |
| Banco de Imagens | "A busca na Pixabay não está ligada neste servidor (falta a chave da Pixabay na configuração)." | Esconder do cliente; para o operador: "Busca na Pixabay desligada". |
| Banco de Imagens | "0 imagem(ns)" | "Nenhuma imagem" / "1 imagem" / "12 imagens" |
| Arquivos | "0 B de 10.0 GB usados (0%)" | "Nada usado ainda · 10 GB disponíveis" |
| Arquivos | parágrafo de apoio repetido no vazio | No vazio: "Envie a primeira foto ou vídeo." |
| Marca | "Ficam em Mídias › Fotos…" | "Ficam em Biblioteca › Arquivos…" |
| Marca | "Nome da marca: Marca principal" | Preencher com o nome da conta ("Padaria Pão Dourado"). |
| Marca | "Escolher as cores à mão · avançado / abrir" | "Escolher as cores à mão" + "Abrir" |
| Criação rápida | "Está em Meus Designs › Mais." | "Está em Biblioteca › Meus Designs." |
| Início (Saúde/Comércio) | "Diga quem é a empresa" | "Diga quem é a clínica" / "Diga quem é a loja" (via `perfil.lugar`) |
| Calendário (Saúde/Comércio) | "Calendário da empresa" / "a lista do RH" / "SIPAT – palestras às 15h no refeitório" | "Calendário da clínica": "25/11 Mutirão de vacinação · 08/12 Feriado: fechado". "Calendário da loja": "29/11 Black Friday · 24/12 Fecha às 14h" |
| Pessoas (Saúde/Comércio) | "Importe a planilha do RH" | "Importe a planilha da equipe" |
| Indicadores | "do Protheus ou de qualquer sistema" / "Crie um conector acima" | "do sistema que vocês já usam (ERP, planilha)" / "Ligue um sistema acima" |
| Criar (Saúde) | "Depoimento de cliente", "Wi-Fi para clientes" | "Depoimento de paciente", "Wi-Fi para pacientes" (via `perfil.publico`) |
| Criar (todas) | "Aviso ou horário" e "Horário de funcionamento" | Juntar em "Horário e avisos". |
| Criar, ideias | "o que todo mundo precisa saber…", "lembrete visto todo dia vira hábito" (minúscula) | Maiúscula inicial, como em "É a data de hoje…" |
| Alertas | "rede de telas", "Todas as telas estão online", "considerada offline" | "Suas TVs", "Todas as TVs estão no ar", "fora do ar" |
| E-mail do vigia | "Ver a frota" | "Ver minhas TVs" |
| Telas | "Parear tela", "Suas telas", "1 tela" ao lado de "As TVs ligadas…" | Escolher um termo. "TV" para o aparelho ("Ligar uma TV", "Suas TVs"); "tela" só para "tela pronta" e "tela inteira". |
| Botões do mesmo gesto | "Pôr conteúdo", "Trocar agora", "Mudar o que passa", "Editar programação" | Um só: "Mudar o que passa". |
| Peças | "OFF" ("30% OFF", "20% OFF" nas paletas) | "30% de desconto" ou "-30%" |
| Criar na mão | "Banner" | "Faixa" |
| Plano | "Enterprise", "Contrato, SLA…" | "Rede grande", "Contrato e garantia de atendimento…" |
| Plano | "1 de 49 telas" | "1 TV no plano · até 49" |
| Plano | "85 criações por mês até 3 telas, mais com mais telas (até 228)" | "85 criações por mês (até 3 TVs); cresce com o número de TVs." |
| Equipe | "Dono gerencia tudo, Admin gerencia equipe e telas, Membro opera." | "Dono: tudo. Administrador: equipe e TVs. Equipe: muda o que passa." |
| Suporte | "thiago.olivs.coelho@gmail.com" | "suporte@multitelas.net.br" |
| Suporte | "Usuário: h-comercio@qa.local (owner)" / "Navegador: Mozilla/5.0 … HeadlessChrome…" | "(dono)"; mostrar "Chrome 153 · Linux" e guardar o resto para o anexo. |
| Cadastro | "MultiTelas Saúde: Clínica, consultório, farmácia: orientação e serviços." | "MultiTelas Saúde — para clínica, consultório e farmácia." |
| Cadastro/Ajustes | "Mínimo de 6 caracteres." | Mínimo de 8 (e dizer isso). |
| Login (todas) | "Gerencie a rede de telas de qualquer lugar." | Por frente: "A TV da sua clínica, sempre em dia." |
| Datas | "Terça-feira, 03 de novembro" (Início) × "Terça-feira, 3 de novembro" (TV) | "3 de novembro" nos dois. |
| Mobile | barra de baixo com 12 px | 13 px (MARCA.md). |

Ortografia e acentuação estão corretas no que li: nenhum erro de grafia encontrado nas 23 páginas × 3 frentes. O problema é de terminologia, jargão e frente, não de português.

---

## 8. E-mails

Renderizados (`shots/emails.png`, textos em `textos/emails.txt`): confirmar e-mail, redefinir senha, 3 lembretes de teste, fatura em atraso, TV fora do ar (1 e 3 TVs), código da foto.

**O que está bom:**

- assuntos claros;
- botão violeta da marca;
- a fatura em atraso e a TV fora do ar dizem **o que acontece e quando**, em linguagem de gente ("Nunca desligamos uma tela por causa de fatura", "Na maioria das vezes é a TV desligada no botão").

**Problemas:**

| Problema | Sugestão |
|---|---|
| Sem logo nem cabeçalho; fonte do sistema, sem a marca no topo | Faixa tinta com o símbolo e "MultiTelas Saúde" (a frente da conta). |
| Sem rodapé (quem envia, por que recebeu, link do painel) | Rodapé comum em `montar()`. |
| Código da foto (`server/foto-qr.js:144`) sem layout nenhum | Usar o mesmo `montar()`. |
| Separadores de assunto diferentes: "Confirme seu e-mail - MultiTelas" × "Redefinir sua senha · MultiTelas" | Padronizar em "·". |
| "Verificar e-mail" no botão de "Confirme seu e-mail" | "Confirmar e-mail" |
| Lembrete fala de "o cardápio, uma promoção" para qualquer frente | Ler de `perfil.js`. |
| "Ver a frota" | "Ver minhas TVs" |
| O selo do fim do teste é "versão gratuita" no e-mail e "um selo" ou "selo do MultiTelas" no Plano | Um nome só. |

Nota: **6/10**.

---

## 9. Problemas

| Gravidade | Onde | Como reproduzir | O que esperava | Evidência |
|---|---|---|---|---|
| **Grave** | Biblioteca › Telas prontas (Empresas e Saúde) | Conta nova da frente › Telas prontas | Ao menos 5 telas da frente (existem 6 `l1-empresa-*` e 6 `l1-saude-*` em `manifesto.json`, todas em `proposta`) | `shots/vazio-empresa-telasprontas-light-1366.png`, `shots/saude-telasprontas-light-390.png` |
| **Grave** | Telas prontas (Comércio) | Padaria › Telas prontas | Telas de padaria/loja, sem nota interna | `shots/vazio-comercio-telasprontas-light-1366.png` |
| **Grave** | Peças prontas › texto de exemplo | Saúde › "Horário de funcionamento" › Usar › Salvar › Pôr na TV | Texto de clínica; a TV mostra "Pão quente o dia todo" | `shots/fluxo-saude-01-usar-dialogo.png`, `shots/tv-saude-002.png` |
| **Grave** | Peças prontas (Saúde/Empresas) | Abrir a galeria | Peças da frente; aparecem burger, escova, coloração, óculos e combo do padeiro | `shots/crop-saude-pecas-topo.png`, `shots/empresa-pecas-light-1366.png` |
| **Grave** | Suporte › Contato direto | Abrir Suporte | E-mail da empresa; aparece um Gmail pessoal | `shots/comercio-support-light-1366.png` |
| Médio | Criar na mão (Saúde/Comércio) | Meus Designs › Criar na mão | Modelos da frente | `shots/estado-criar-na-mao.png` |
| Médio | Calendário (Saúde/Comércio) | Programação › Calendário | Texto e exemplo da frente | `shots/comercio-calendario-light-1366.png` |
| Médio | Banco de Imagens | Biblioteca › Banco de Imagens | Acervo com fotos, ou a aba escondida; aparece mensagem de configuração do servidor | `shots/comercio-banco-light-1366.png` |
| Médio | TV, lateral da tela pronta | Usar a tela da Ótica sem site | A peça sai da rotação ou pede o contato; fica um retângulo vazio | `shots/sheet-tv-comercio.png` |
| Médio | Peças-ouro na TV | Ver a TV a 3 m | Texto de apoio ≥ 28 px; hoje 15–22 px | `shots/crop-tv-texto-pequeno.png` |
| Médio | Peças prontas, carregando | Rede lenta › Peças prontas | Esqueleto; aparece "Nenhuma peça pronta ainda" | `shots/estado-carregando-pecas.png` |
| Médio | Mensagens de erro | Código errado, senha errada, login errado | Maiúscula + o que fazer | `shots/estado-parear-erro.png`, `textos/estados.txt` |
| Médio | TV aguardando pareamento | Abrir `/tv` | Marca (Outfit, tinta/violeta/lima, logo) | `shots/tv-pareamento-saude.png` |
| Médio | Um botão principal por tela | Início (3), Criados (2), Arquivos (2), Peças prontas (43) | 1 principal | `shots/comercio-overview-light-1366.png` |
| Polimento | Editor da tela | Editar programação | Rótulos de zona não cobrem o conteúdo; rótulo "(IA)" certo | `shots/estado-editor-abre.png` |
| Polimento | Raio | Medido: controles 7 px, cartões 10 px | 8 px / 14 px (MARCA.md) | `js/estilo.js` |
| Polimento | Mural e Relatório sem título | Abrir as abas | Título + texto de apoio como nas outras | `shots/sheet-paginas-light.png` |
| Polimento | Datas vencidas nos exemplos | Peças e telas prontas | Datas relativas ("até sábado") ou sem data | `shots/tv-empresa-002.png` |
| Polimento | Login e cadastro sem a frente | `/app/?frente=saude` | "MultiTelas Saúde" no topo e exemplo de clínica | `shots/sheet-auth.png` |
| Polimento | Barra de baixo no celular, 12 px; rótulos de zona, 9–10 px | `js/medir.js` | ≥ 13 px | `textos/` |

---

## 10. Os 15 ajustes de maior impacto visual (do maior para o menor)

Esforço: P = horas, M = 1–2 dias, G = mais de 3 dias.

| # | Ajuste | Impacto | Esforço |
|---|---|---|---|
| 1 | **Publicar as telas prontas por frente.** O dono revisa e aprova na bancada as 19 `l1-*` (6 de Empresas, 6 de Saúde, 7 de Comércio). A da Ótica sai do "Para a loja" de quem não é ótica, e a descrição vira texto de cliente. | A vitrine deixa de estar vazia nas três frentes. | M (a revisão é do dono; o código só lê `estado`) |
| 2 | **Texto de exemplo por frente nas peças prontas.** Clínica nunca recebe "Pão quente"; metalúrgica nunca recebe "Burger". Peças só de outra frente vão para "Ver de outros negócios", fechado por padrão. | Fim da mistura mais visível. | M |
| 3 | **Galeria de Peças prontas com respiro:** grupos com título (Gente, Avisos, Ofertas…), 6 por grupo + "ver mais", miniaturas em 2–3 paletas, cartões em pé numa grade própria e "Usar" secundário (violeta só no "Usar" do cartão aberto). | Acaba a "parede de 43 cartões iguais"; parece Canva, não lista. | M |
| 4 | **Vocabulário da frente nos textos fixos:** Início, Calendário (exemplo), Pessoas, Mural, Indicadores, Arquivos, Marca, Criar na mão e e-mails, todos lendo `perfil.lugar` e `perfil.publico`. | O Saúde passa a parecer de clínica. | M |
| 5 | **Trocar o Gmail pessoal** por um e-mail do domínio, e tirar user-agent e "owner" da tela. | Confiança imediata. | P |
| 6 | **A TV na marca:** pareamento e tema padrão em Outfit, tinta e violeta, com o símbolo no canto (MARCA.md diz que o preset `dark-premium` é a régua). | A primeira imagem que o cliente vê na parede passa a ser da marca. | M |
| 7 | **Um botão principal por tela:** Início (só "Criar com a IA" ou o passo atual), Peças prontas, Arquivos, Criados. | Hierarquia limpa, cara de produto. | P |
| 8 | **Piso de 28–32 px para texto de apoio** nas peças-ouro a 1080p (sobretítulos espaçados, condições de preço, assinatura). | Legível a 3 m. | M (43 HTML) |
| 9 | **Mensagens de erro com o que fazer** (pareamento, senha, login, carga) e maiúscula inicial. | Menos "de programador". | P |
| 10 | **Banco de Imagens:** semear o acervo comum (dezenas por segmento) ou esconder a aba enquanto vazio; nunca mostrar a mensagem de chave. | Uma aba inteira deixa de parecer quebrada. | P (esconder) / G (semear) |
| 11 | **Um termo por coisa:** TV para o aparelho; "Mudar o que passa" para o gesto; "No ar/Fora do ar" no lugar de online/offline; sem "frota", "zona", "conector", "OFF", "Banner", "Enterprise". | Consistência de produto. | P |
| 12 | **Lateral sem contato:** quando o QR ou o WhatsApp sai do exemplo, a peça pede o dado ao usar a tela pronta ou sai da rotação. Datas dos exemplos relativas ou atualizadas. | Nada vazio ou vencido na TV. | P |
| 13 | **Editor da tela:** rótulos de zona fora do conteúdo (borda ou canto inferior), rótulo "Peça pronta" no lugar de "(IA)" e resumo em linguagem de gente no lugar de "Corporativo Completo · ciclo de 1min". | O editor fica mais confiável. | P |
| 14 | **E-mails com cabeçalho e rodapé da marca**, nome da frente e o código da foto no mesmo layout. | Comunicação de produto pago. | P |
| 15 | **Acabamento de forma e estados:** raio 8/14 px, título em Mural e Relatório, esqueleto em Peças/Telas prontas (sem o vazio falso), barra de baixo em 13 px, "Marca principal" → nome da conta, "Mídias" e "Meus Designs › Mais" corrigidos. | Polimento que soma. | P |

---

## 11. O que está bom

- **Identidade do painel:** Outfit em 100% da interface, violeta certo nos dois temas (o escuro tem texto escuro sobre `#9277FF`, como pede a MARCA), cartão com borda e sem sombra, nenhuma rolagem lateral no celular, barra de baixo com as 4 ações do dia a dia.
- **Início e Criar:** uma pergunta ("O que você quer mostrar hoje?"), uma caixa e ideias do dia por frente. É a melhor tela do produto e o maior diferencial diante de Yodeck, ScreenCloud e OptiSigns.
- **Programação:** a planta da TV com as zonas clicáveis é clara e própria.
- **Marca:** paletas por ramo com prévia na TV ("feitas para se ler de longe") são uma ideia excelente.
- **Peças-ouro:** a tipografia e a composição de cada peça são de nível de agência.
- **Microtextos de confiança:** "Nunca desligamos sua tela por causa de fatura", "Sem conexão — … Suas telas continuam exibindo normalmente", "Não há lixeira e não dá para desfazer", o Desfazer no aviso.
- **Tema escuro sem defeitos visíveis;** o editor manual cabe no celular.
- **E-mails da TV fora do ar e da fatura:** dizem o que, quando e o que fazer, sem jargão.
- **Português correto;** nenhum erro de grafia encontrado.

---

## Veredito

**Nota geral (designer e redator): 5,5/10.**
Profissionalismo visual 6,5 · Consistência 6 · Textos 6 · Adequação às frentes 4 · Estados 6,5.

**Pode lançar? Não como "pronto para vender" nas três frentes.** O painel em si está pronto: limpo, coerente e com cara própria. Mas as cinco falhas graves acima atingem exatamente o que se mostra numa demonstração ou na primeira hora do cliente:

- Telas prontas vazias no Empresas e no Saúde;
- uma única tela pronta, de ótica e com nota interna, no Comércio;
- peças prontas que levam pão, salão e burger para a clínica e para a metalúrgica;
- texto de exemplo de padaria chegando à TV da clínica;
- um Gmail pessoal no Suporte.

Os ajustes 1, 2, 4 e 5 (cerca de uma semana, contando a revisão do dono na bancada) tiram o produto do "aceitável" e o põem em "bom" nas três frentes.
